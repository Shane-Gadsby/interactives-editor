//The client side of review comments: loading, the live stream (a thread arrives whole, again and again, and a deleted
//one goes), the writes and what they send, the filters, and the toast line for a write that was for you.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommentsClient, SHARE_FOR_REVIEW_EVENT, openShareForReview, reviewUrl } from '../src/lib/comments';
import type { Thread } from '../shared/comments.mjs';

class FakeES {
  static all: FakeES[] = [];
  listeners = new Map<string, ((e: { data: string }) => void)[]>();
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeES.all.push(this);
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), fn]);
  }
  emit(name: string, data: unknown = {}) {
    for (const fn of this.listeners.get(name) ?? []) fn({ data: JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

const thread = (id: string, n: number, extra: Partial<Thread> = {}): Thread => ({
  id,
  n,
  anchor: { artboardId: 'ab1', layerId: null, x: 1, y: 2 },
  ctx: { artboard: 'Main', layer: '' },
  status: 'open',
  assignee: null,
  resolved: null,
  created: `2026-11-04T00:00:0${n}.000Z`,
  updated: `2026-11-04T00:00:0${n}.000Z`,
  comments: [{ id, by: { username: 'ann', name: 'Ann' }, text: `Note ${n}`, mentions: [], created: `2026-11-04T00:00:0${n}.000Z`, edited: null }],
  ...extra,
});

const calls: { url: string; method: string; body: any }[] = [];
let answer: (url: string, method: string, body: any) => unknown = () => ({});
beforeEach(() => {
  calls.length = 0;
  FakeES.all = [];
  (globalThis as any).EventSource = FakeES;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (u: URL | string, init: RequestInit = {}) => {
      const url = String(u).replace(/^https?:\/\/[^/]+\/?/, '');
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method: init.method ?? 'GET', body });
      const out = answer(url, init.method ?? 'GET', body);
      if (out instanceof Error) return new Response(JSON.stringify({ error: out.message }), { status: 403, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const editor = async (c: CommentsClient, threads: Thread[] = [thread('cm1', 1)]) => {
  answer = (url) => (url.endsWith('/comments') ? { threads, people: [{ username: 'ann', name: 'Ann' }], me: { username: 'ann', name: 'Ann' } } : {});
  await c.startEditor('pr1');
  return FakeES.all[0];
};

describe('the editor', () => {
  it('loads the threads, who you are, and opens the stream with the session id when there is one', async () => {
    sessionStorage.setItem('sessionID', 'sess-1');
    const c = new CommentsClient();
    const es = await editor(c);
    expect(calls[0].url).toBe('api/projects/pr1/comments');
    expect(c.get()).toMatchObject({ loaded: true, me: { username: 'ann', manager: true } });
    expect(c.get().threads).toHaveLength(1);
    expect(es.url).toContain('api/projects/pr1/comments/live');
    expect(es.url).toContain('sessionID=sess-1');
    sessionStorage.removeItem('sessionID');
  });

  it('puts a thread in by id, in thread order, and the same one again changes nothing', async () => {
    const c = new CommentsClient();
    const es = await editor(c);
    es.emit('thread', { thread: thread('cm3', 3), by: 'Bob', notify: [] });
    es.emit('thread', { thread: thread('cm2', 2), by: 'Bob', notify: [] });
    es.emit('thread', { thread: thread('cm2', 2, { status: 'resolved' }), by: 'Bob', notify: [] });
    expect(c.get().threads.map((t) => [t.id, t.status])).toEqual([['cm1', 'open'], ['cm2', 'resolved'], ['cm3', 'open']]);
  });

  it('drops a deleted thread, and closes it if it was open', async () => {
    const c = new CommentsClient();
    const es = await editor(c);
    c.open('cm1');
    es.emit('gone', { id: 'cm1' });
    expect(c.get().threads).toEqual([]);
    expect(c.get().openId).toBeNull();
  });

  it('learns people from the comments that arrive', async () => {
    const c = new CommentsClient();
    const es = await editor(c);
    es.emit('thread', { thread: thread('cm2', 2, { comments: [{ id: 'cm2', by: { username: 'bob', name: 'Bob' }, text: 'x', mentions: [], created: 'x', edited: null }] }), by: 'Bob', notify: [] });
    es.emit('thread', { thread: thread('cm4', 4, { comments: [{ id: 'cm4', by: { name: 'Zed', guest: true }, text: 'x', mentions: [], created: 'x', edited: null }] }), by: 'Zed', notify: [] });
    expect(c.get().people.map((p) => p.username)).toEqual(['ann', 'bob']);
  });

  it('says what a write was for you, but not when it was you who wrote it', async () => {
    const c = new CommentsClient();
    const lines: string[] = [];
    c.onNotice = (t) => lines.push(t);
    const es = await editor(c);
    es.emit('thread', { thread: thread('cm2', 2), by: 'Bob', notify: [{ user: 'ann', kind: 'assigned' }] });
    es.emit('thread', { thread: thread('cm2', 2), by: 'Bob', notify: [{ user: 'cat', kind: 'mention' }] });
    es.emit('thread', { thread: thread('cm2', 2), by: 'Ann', notify: [{ user: 'ann', kind: 'reply' }] });
    es.emit('thread', { thread: thread('cm2', 2), by: 'Bob', notify: [{ user: 'ann', kind: 'mention' }] });
    expect(lines).toEqual(['Bob assigned you a comment', 'Bob mentioned you']);
  });

  it('reconnects after an error, refetching what it missed once the stream is back', async () => {
    vi.useFakeTimers();
    try {
      const c = new CommentsClient();
      const es = await editor(c);
      es.emit('hello');
      es.onerror?.();
      expect(c.get().live).toBe('reconnecting');
      expect(es.closed).toBe(true);
      await vi.advanceTimersByTimeAsync(1100);
      expect(FakeES.all).toHaveLength(2);
      const n = calls.length;
      FakeES.all[1].emit('hello');
      await vi.advanceTimersByTimeAsync(10);
      expect(calls.length).toBe(n + 1);
      expect(c.get().live).toBe('live');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the stream and forgets everything', async () => {
    const c = new CommentsClient();
    const es = await editor(c);
    c.stop();
    expect(es.closed).toBe(true);
    expect(c.get()).toMatchObject({ mode: null, threads: [], loaded: false });
  });
});

describe('writes', () => {
  it('a new comment goes with its anchor, the names it was pinned on, mentions and assignee, and opens the thread', async () => {
    const c = new CommentsClient();
    await editor(c, []);
    c.startDraft({ anchor: { artboardId: 'ab1', layerId: 'n1', lx: 1, ly: 2, x: 3, y: 4 }, context: { artboard: 'Main', layer: 'Title' } });
    answer = () => ({ thread: thread('cm9', 1) });
    await c.create('Hello @bob', { mentions: ['bob'], assignee: { username: 'bob', name: 'Bob' } });
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments', method: 'POST', body: { text: 'Hello @bob', mentions: ['bob'], assignee: { username: 'bob', name: 'Bob' }, context: { layer: 'Title' }, anchor: { layerId: 'n1' } } });
    expect(c.get()).toMatchObject({ draft: null, openId: 'cm9' });
    expect(c.get().threads.map((t) => t.id)).toEqual(['cm9']);
  });

  it('will not create without a pin', async () => {
    const c = new CommentsClient();
    await editor(c);
    await expect(c.create('x')).rejects.toThrow(/pin/);
  });

  it('replies, resolves, assigns and edits through the thread routes, and applies the answer', async () => {
    const c = new CommentsClient();
    await editor(c);
    answer = () => ({ thread: thread('cm1', 1, { status: 'resolved' }) });
    await c.setStatus('cm1', 'resolved');
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1', method: 'PATCH', body: { status: 'resolved' } });
    expect(c.get().threads[0].status).toBe('resolved');
    await c.assign('cm1', { username: 'bob', name: 'Bob' });
    expect(calls.at(-1)).toMatchObject({ method: 'PATCH', body: { assignee: { username: 'bob', name: 'Bob' } } });
    await c.reply('cm1', 'Thanks', []);
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1/replies', method: 'POST', body: { text: 'Thanks' } });
    await c.edit('cm1', 'cm1', 'Fixed', []);
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1/messages/cm1', method: 'PATCH', body: { text: 'Fixed' } });
  });

  it('deletes a whole thread (the first message), or just a reply', async () => {
    const c = new CommentsClient();
    await editor(c, [thread('cm1', 1), thread('cm2', 2)]);
    answer = () => ({ ok: true });
    await c.remove('cm1');
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm1', method: 'DELETE' });
    expect(c.get().threads.map((t) => t.id)).toEqual(['cm2']);
    answer = () => ({ thread: thread('cm2', 2) });
    await c.remove('cm2', 'cmreply');
    expect(calls.at(-1)).toMatchObject({ url: 'api/projects/pr1/comments/cm2/messages/cmreply', method: 'DELETE' });
    expect(c.get().threads.map((t) => t.id)).toEqual(['cm2']);
  });

  it('shows the server\'s words when a write is refused', async () => {
    const c = new CommentsClient();
    await editor(c);
    answer = () => new Error('Sign in to resolve comments');
    await expect(c.setStatus('cm1', 'resolved')).rejects.toThrow('Sign in to resolve comments');
    expect(c.get().threads[0].status).toBe('open');
  });
});

describe('the review page', () => {
  const start = (c: CommentsClient, me: any) => c.startReview('tok', { threads: [thread('cm1', 1)], people: [], me });

  it('uses the review routes and its own stream, and sends a guest name only when there is no session', async () => {
    const c = new CommentsClient();
    start(c, null);
    expect(FakeES.all[0].url).toContain('review/tok/live');
    c.setGuestName('Dr Nair');
    answer = () => ({ thread: thread('cm1', 1) });
    await c.reply('cm1', 'Hi');
    expect(calls.at(-1)).toMatchObject({ url: 'review/tok/comments/cm1/replies', body: { text: 'Hi', guestName: 'Dr Nair' } });
    start(c, { username: 'bob', name: 'Bob' });
    await c.reply('cm1', 'Hi');
    expect(calls.at(-1)!.body.guestName).toBeUndefined();
  });

  it('remembers a guest name in this browser', () => {
    const c = new CommentsClient();
    c.setGuestName('Zed Zed');
    expect(new CommentsClient().get().guestName).toBe('Zed Zed');
    localStorage.removeItem('ix-review-name');
  });
});

describe('filters', () => {
  it('shows open ones by default, and narrows by status, whose and artboard', async () => {
    const c = new CommentsClient();
    await editor(c, [
      thread('cm1', 1),
      thread('cm2', 2, { status: 'resolved' }),
      thread('cm3', 3, { assignee: { username: 'ann', name: 'Ann' }, anchor: { artboardId: 'ab2', layerId: null, x: 0, y: 0 }, comments: [{ id: 'cm3', by: { username: 'bob', name: 'Bob' }, text: 'x', mentions: [], created: 'x', edited: null }] }),
    ]);
    expect(c.visible().map((t) => t.id)).toEqual(['cm1', 'cm3']);
    c.setFilter({ status: 'resolved' });
    expect(c.visible().map((t) => t.id)).toEqual(['cm2']);
    c.setFilter({ status: 'all', scope: 'assigned' });
    expect(c.visible().map((t) => t.id)).toEqual(['cm3']);
    c.setFilter({ scope: 'mine' });
    expect(c.visible().map((t) => t.id)).toEqual(['cm1', 'cm2']);
    c.setFilter({ scope: 'all', artboardId: 'ab2' });
    expect(c.visible().map((t) => t.id)).toEqual(['cm3']);
  });

  it('remembers whether pins are shown, in this browser', () => {
    const c = new CommentsClient();
    c.setShowPins(false);
    expect(new CommentsClient().get().showPins).toBe(false);
    c.setShowPins(true);
    expect(new CommentsClient().get().showPins).toBe(true);
  });
});

describe('the review link', () => {
  it('never carries the owner\'s session id or the editor route along', () => {
    window.history.pushState({}, '', '/interactives/?sessionID=secret-1&x=2#/p/pr1');
    expect(reviewUrl('tok123')).toBe(`${location.origin}/interactives/#/review/tok123`);
    window.history.pushState({}, '', '/');
  });
});

describe('openShareForReview', () => {
  it('tells the open editor to show its Share for review dialog', () => {
    const seen = vi.fn();
    window.addEventListener(SHARE_FOR_REVIEW_EVENT, seen);
    openShareForReview();
    window.removeEventListener(SHARE_FOR_REVIEW_EVENT, seen);
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
