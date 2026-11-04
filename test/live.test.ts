import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, createProject } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { LIVE_FALLBACK_EVENT, LiveSession, liveSession, setLiveSession } from '../src/lib/live';
import { apply, type Op } from '../shared/ops.mjs';

const sources: FakeES[] = [];
class FakeES {
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    sources.push(this);
  }
  addEventListener(n: string, f: (e: { data: string }) => void) {
    (this.listeners[n] ??= []).push(f);
  }
  close() {}
  emit(n: string, data: unknown) {
    for (const f of this.listeners[n] ?? []) f({ data: JSON.stringify(data) });
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A project with one rect, a store and a live session whose server answers `respond` for every ops POST. */
async function open(respond: (body: { ops: unknown[] }) => { ok: boolean; status: number }) {
  sources.length = 0;
  vi.stubGlobal('EventSource', FakeES);
  const sent: { ops: any[] }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).includes('/ops')) {
        const body = JSON.parse(init!.body!);
        sent.push(body);
        return { ...respond(body), json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({ user: null, power: false }) } as Response;
    }),
  );
  const p: any = createProject('T');
  const a = createNode('rect', { name: 'A', x: 0 });
  p.artboards[0].children.push(a);
  const s = new EditorStore(p);
  const live = new LiveSession('proj1', s, 0);
  setLiveSession(live);
  await tick(20);
  const es = sources[0];
  es.emit('hello', { seq: 0, rev: 1, clientId: 'x', color: '#f00', peers: [] });
  return { p, a, s, live, es, sent, abId: p.artboards[0].id as string };
}

describe('live editing', () => {
  afterEach(() => {
    liveSession()?.close();
    setLiveSession(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a remote op on a property with a queued (not yet sent) local edit does not overwrite it, so both sides converge', async () => {
    const { a, s, es, sent, abId } = await open(() => ({ ok: true, status: 200 }));
    const xOf = (doc: any) => doc.artboards[0].children[0].x;
    const server = JSON.parse(JSON.stringify(s.get().project));
    s.setProps([a.id], { x: 111 }); // queued, the flush is 60 ms away
    const remote: Op = { t: 'set', p: ['artboards', { i: abId }, 'children', { i: a.id }, 'x'], v: 222 };
    es.emit('ops', { seq: 1, clientId: 'other', ops: [remote] });
    expect(xOf(s.get().project)).toBe(111);
    await tick(200);
    // the server saw the remote op first, then ours
    apply(server, [remote]);
    for (const b of sent) apply(server, b.ops);
    expect(xOf(server)).toBe(111);
    expect(xOf(s.get().project)).toBe(xOf(server));
    // an edit to something else is still taken from the remote
    es.emit('ops', { seq: 2, clientId: 'other', ops: [{ t: 'set', p: ['artboards', { i: abId }, 'children', { i: a.id }, 'y'], v: 7 }] });
    expect((s.get().project.artboards[0].children[0] as any).y).toBe(7);
  });

  it('a remote op on a property whose edit was already sent is skipped until the server acknowledges it', async () => {
    const { a, s, es, abId } = await open(() => ({ ok: true, status: 200 }));
    s.setProps([a.id], { x: 5 });
    await tick(120); // sent, not acknowledged yet
    es.emit('ops', { seq: 1, clientId: 'other', ops: [{ t: 'set', p: ['artboards', { i: abId }, 'children', { i: a.id }, 'x'], v: 9 }] });
    expect((s.get().project.artboards[0].children[0] as any).x).toBe(5);
  });

  it('gives up on a batch the server refuses for good (4xx): no retry loop, an error toast, and the whole-document save is asked for', async () => {
    const { a, s, sent } = await open(() => ({ ok: false, status: 413 }));
    const fallback = vi.fn();
    window.addEventListener(LIVE_FALLBACK_EVENT, fallback);
    s.setProps([a.id], { x: 1 });
    await tick(150);
    expect(sent).toHaveLength(1);
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(s.get().toast?.kind).toBe('error');
    expect(s.get().toast?.text).toMatch(/413/);
    expect(s.get().live).toBeNull();
    expect(liveSession()).toBeNull();
    // later edits aren't sent over the dead session, and nothing retries
    s.setProps([a.id], { x: 2 });
    await tick(2300);
    expect(sent).toHaveLength(1);
    expect((s.get().project.artboards[0].children[0] as any).x).toBe(2);
    window.removeEventListener(LIVE_FALLBACK_EVENT, fallback);
  }, 10000);

  it('keeps retrying a 5xx, with a growing delay, and the edit goes through when the server recovers', async () => {
    vi.useFakeTimers();
    let status = 503;
    const { a, s, sent, live } = await (async () => {
      const pr = open(() => ({ ok: status < 400, status }));
      await vi.advanceTimersByTimeAsync(30);
      return pr;
    })();
    s.setProps([a.id], { x: 3 });
    await vi.advanceTimersByTimeAsync(70); // first try
    expect(sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2100); // second try, after 2 s
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2100); // the next wait is 4 s: not yet
    expect(sent).toHaveLength(2);
    status = 200;
    await vi.advanceTimersByTimeAsync(2100);
    expect(sent).toHaveLength(3);
    expect(live.busy).toBe(true); // waiting for the server's echo
    expect(s.get().live?.status).toBe('live');
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
});
