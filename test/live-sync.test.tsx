import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { liveSession, setLiveSession } from '../src/lib/live';
import { liveSyncOn, openLiveIfOn, setLiveSync, watchLiveSync, watchStale } from '../src/lib/live-sync';
import { loadProjectRecord, knownRevOf } from '../src/lib/db';
import { InviteModal } from '../src/components/ProjectModals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sources: FakeES[] = [];
class FakeES {
  listeners: Record<string, ((e: { data: string }) => void)[]> = {};
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    sources.push(this);
  }
  addEventListener(n: string, f: (e: { data: string }) => void) {
    (this.listeners[n] ??= []).push(f);
  }
  close() {
    this.closed = true;
  }
  emit(n: string, data: unknown) {
    for (const f of this.listeners[n] ?? []) f({ data: JSON.stringify(data) });
  }
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, headers: { get: () => 'application/json' }, json: async () => body }) as unknown as Response;

/** A server that answers the few routes these tests touch, and remembers every request. */
function server(opts: { rev?: number; collaborators?: unknown[] } = {}) {
  const calls: { method: string; url: string; body?: any }[] = [];
  const state = { rev: opts.rev ?? 1, seq: null as number | null, collaborators: opts.collaborators ?? [] };
  let doc: any = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, url: String(url), body });
      const path = String(url).replace(/^.*\/api\//, '');
      if (method === 'PUT' && /^projects\/[^/]+$/.test(path)) {
        doc = body.project;
        state.rev++;
        return json({ ok: true, rev: state.rev });
      }
      if (method === 'GET' && /^projects\/[^/]+\/rev$/.test(path)) return json({ rev: state.rev });
      if (method === 'GET' && /^projects\/[^/]+$/.test(path)) return json({ project: doc, rev: state.rev, live: state.seq, collaborators: state.collaborators.length });
      if (method === 'GET' && /collaborators$/.test(path)) return json({ owner: { username: 'me', name: 'Me' }, collaborators: state.collaborators, canManage: true });
      if (method === 'POST' && /collaborators$/.test(path)) {
        state.collaborators = [...state.collaborators, { username: body.username, name: body.name }];
        return json({ collaborators: state.collaborators });
      }
      return json({ ok: true });
    }),
  );
  return { calls, state, setDoc: (d: unknown) => (doc = d) };
}

const live = (calls: { url: string }[]) => calls.filter((c) => /\/live\b|\/ops$|\/presence$/.test(c.url));

function fixture(liveSync: boolean) {
  const p: any = createProject('T');
  p.id = 'proj1';
  p.settings.liveSync = liveSync || undefined;
  const a = createNode('rect', { name: 'A', x: 0 });
  p.artboards[0].children.push(a);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return { p, a, s };
}

beforeEach(() => {
  sources.length = 0;
  vi.stubGlobal('EventSource', FakeES);
});
afterEach(() => {
  liveSession()?.close();
  setLiveSession(null);
  setCurrentStore(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Live collaboration is a project setting, off by default', () => {
  it('is off for a new project and for one saved before the setting existed', () => {
    expect(liveSyncOn(createProject('New'))).toBe(false);
    const old: any = createProject('Old');
    delete old.settings.liveSync;
    expect(liveSyncOn(old)).toBe(false);
  });

  it('off: opening the project makes no live room, and editing sends no ops, presence or stream requests', async () => {
    const { calls } = server();
    const { a, s } = fixture(false);
    openLiveIfOn(s, 0);
    expect(liveSession()).toBeNull();
    s.setProps([a.id], { x: 5 });
    s.set({ selection: [a.id] });
    await tick(200);
    expect(sources).toHaveLength(0);
    expect(live(calls)).toEqual([]);
    expect(s.get().live).toBeNull();
  });

  it('on: opening the project joins the room as before', async () => {
    server();
    const { s } = fixture(true);
    openLiveIfOn(s, 7);
    expect(liveSession()).not.toBeNull();
    await tick();
    expect(sources).toHaveLength(1);
    expect(sources[0].url).toMatch(/projects\/proj1\/live\?clientId=\w+&since=7/);
  });

  it('turning it on or off is one undoable change in the project settings', () => {
    server();
    const { s } = fixture(false);
    setLiveSync(s, true);
    expect(s.get().project.settings.liveSync).toBe(true);
    s.undo();
    expect(s.get().project.settings.liveSync).toBeFalsy();
  });
});

describe('following the setting while the editor is open', () => {
  it('turning it on saves the whole project first, then joins the room from where the server is', async () => {
    const srv = server({ rev: 3 });
    const { s, p } = fixture(false);
    srv.setDoc(p);
    await loadProjectRecord('proj1');
    srv.state.seq = 12;
    const changed: boolean[] = [];
    let streamsWhenSaved = -1;
    const save = vi.fn(async () => {
      await fetch('/api/projects/proj1', { method: 'PUT', body: JSON.stringify({ project: s.get().project, rev: knownRevOf('proj1') }) });
      streamsWhenSaved = sources.length;
      return true;
    });
    const stop = watchLiveSync(s, save, (l) => changed.push(l));
    setLiveSync(s, true);
    await tick(100);
    expect(save).toHaveBeenCalled();
    expect(liveSession()).not.toBeNull();
    expect(changed).toEqual([true]);
    expect(sources[0].url).toMatch(/since=12/);
    //the save went before the stream was opened
    expect(streamsWhenSaved).toBe(0);
    stop();
  });

  it("doesn't join if that save is refused (a conflict), and the setting stays on for the next try", async () => {
    server();
    const { s } = fixture(false);
    const stop = watchLiveSync(s, async () => false, () => undefined);
    setLiveSync(s, true);
    await tick(60);
    expect(liveSession()).toBeNull();
    expect(sources).toHaveLength(0);
    expect(liveSyncOn(s.get().project)).toBe(true);
    stop();
  });

  it('turning it off sends what is queued, leaves the room and goes back to plain saving', async () => {
    const srv = server({ rev: 5 });
    const { s, p } = fixture(true);
    srv.setDoc(p);
    openLiveIfOn(s, 0);
    await tick();
    sources[0].emit('hello', { seq: 0, rev: 5, clientId: 'x', color: '#f00', peers: [{ clientId: 'z', name: 'Zed', color: '#0f0' }] });
    expect(Object.keys(s.get().peers)).toEqual(['z']);
    const changed: boolean[] = [];
    const save = vi.fn(async () => true);
    const stop = watchLiveSync(s, save, (l) => changed.push(l));
    setLiveSync(s, false);
    await tick(100);
    //the ops the switch itself made are still on their way: the server answers them like any other
    const ops = srv.calls.find((c) => /\/ops$/.test(c.url));
    expect(ops).toBeTruthy();
    const echoed = { seq: 1, clientId: JSON.parse(JSON.stringify(ops!.body)).clientId, ops: ops!.body.ops };
    sources[0].emit('ops', echoed);
    await tick(250);
    expect(liveSession()).toBeNull();
    expect(sources[0].closed).toBe(true);
    expect(s.get().live).toBeNull();
    expect(s.get().peers).toEqual({});
    expect(changed).toEqual([false]);
    expect(save).not.toHaveBeenCalled();
    //the revision comes from the server again, so the next autosave is checked against it
    expect(srv.calls.some((c) => c.method === 'GET' && /projects\/proj1$/.test(c.url))).toBe(true);
    const before = live(srv.calls).length;
    s.setProps([p.artboards[0].children[0].id], { x: 9 });
    await tick(200);
    expect(live(srv.calls).length).toBe(before);
    stop();
  });
});

describe('a tab with live collaboration off hears that the project moved on', () => {
  const visible = () => document.dispatchEvent(new Event('visibilitychange'));

  it('says so when the server has a newer revision, with a few bytes and no download', async () => {
    const srv = server({ rev: 2 });
    const { s, p } = fixture(false);
    srv.setDoc(p);
    await loadProjectRecord('proj1');
    const stale = vi.fn();
    const stop = watchStale(s, stale, 0);
    visible();
    await tick();
    expect(stale).not.toHaveBeenCalled();
    srv.state.rev = 3;
    visible();
    await tick();
    expect(stale).toHaveBeenCalledTimes(1);
    const asked = srv.calls.filter((c) => /\/rev$/.test(c.url));
    expect(asked).toHaveLength(2);
    stop();
  });

  it('stays quiet while there are unsaved changes (saving says it, with the choice) and when throttled', async () => {
    const srv = server({ rev: 2 });
    const { s, p, a } = fixture(false);
    srv.setDoc(p);
    await loadProjectRecord('proj1');
    srv.state.rev = 9;
    const stale = vi.fn();
    const stop = watchStale(s, stale, 60000);
    s.set({ saveState: 'dirty' });
    visible();
    await tick();
    expect(srv.calls.filter((c) => /\/rev$/.test(c.url))).toHaveLength(0);
    s.set({ saveState: 'saved' });
    visible();
    await tick();
    visible();
    await tick();
    expect(srv.calls.filter((c) => /\/rev$/.test(c.url))).toHaveLength(1);
    expect(stale).toHaveBeenCalledTimes(1);
    void a;
    stop();
  });

  it('never asks while live collaboration is on', async () => {
    const srv = server({ rev: 2 });
    const { s } = fixture(true);
    openLiveIfOn(s, 0);
    const stale = vi.fn();
    const stop = watchStale(s, stale, 0);
    visible();
    await tick();
    expect(srv.calls.filter((c) => /\/rev$/.test(c.url))).toHaveLength(0);
    stop();
  });
});

describe('inviting someone offers live collaboration', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const text = () => host.textContent ?? '';
  const button = (t: RegExp) => [...host.querySelectorAll('button')].find((b) => t.test(b.textContent ?? '')) as HTMLButtonElement | undefined;

  it('with it off and nobody invited, the box explains it and the switch is one click', async () => {
    server();
    const { s } = fixture(false);
    await act(async () => root.render(<InviteModal onClose={() => undefined} />));
    await act(async () => void (await tick()));
    expect(text()).toMatch(/Live collaboration is off/);
    expect(host.querySelector('.live-collab.offer')).toBeNull();
    //it is never switched on silently
    expect(s.get().project.settings.liveSync).toBeFalsy();
    await act(async () => void button(/Turn on live collaboration/)!.click());
    expect(s.get().project.settings.liveSync).toBe(true);
    expect(text()).toMatch(/Live collaboration is on/);
  });

  it('inviting someone while it is off puts the offer up front, and does not turn it on by itself', async () => {
    server();
    const { s } = fixture(false);
    await act(async () => root.render(<InviteModal onClose={() => undefined} />));
    await act(async () => void (await tick()));
    const input = host.querySelector('input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'zed');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => void (host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))));
    await act(async () => void (await tick()));
    expect(host.querySelector('.live-collab.offer')).not.toBeNull();
    expect(text()).toMatch(/will not see each other's changes/);
    expect(s.get().project.settings.liveSync).toBeFalsy();
  });

  it('with it on, says so and can turn it off', async () => {
    server();
    const { s } = fixture(true);
    await act(async () => root.render(<InviteModal onClose={() => undefined} />));
    await act(async () => void (await tick()));
    expect(text()).toMatch(/Live collaboration is on/);
    await act(async () => void button(/^Turn off$/)!.click());
    expect(s.get().project.settings.liveSync).toBe(false);
  });
});
