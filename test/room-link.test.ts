//The link the learner page holds to a room's server (shared/rooms.mjs createRoomLink), against a fake WebSocket and fake timers: it
//signs in with the first message, joins what it was asked to join, remembers how far it has heard, backs off between tries, asks for what
//it missed, gives up when the server says it will not do, and drops a server that has gone quiet.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error plain ESM shared with index.js
import { createRoomLink } from '../shared/rooms.mjs';

class FakeSocket {
  static all: FakeSocket[] = [];
  sent: any[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(text: string) {
    if (this.closed) throw new Error('closed');
    this.sent.push(JSON.parse(text));
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
  // what the test plays as the server
  open() {
    this.onopen?.();
  }
  say(frame: object | string) {
    this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }
  drop() {
    this.close();
  }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1];

function make(extra: Record<string, unknown> = {}) {
  const frames: any[] = [];
  const states: any[] = [];
  const link = createRoomLink({
    url: 'ws://host/interactives/rooms/ws',
    WS: FakeSocket,
    hello: () => ({ token: 'tok', session: 'sess', lti: null }),
    onFrame: (f: unknown) => frames.push(f),
    onState: (s: unknown) => states.push(s),
    random: () => 0,
    ...extra,
  });
  return { link, frames, states };
}

beforeEach(() => {
  FakeSocket.all = [];
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the room link', () => {
  it('opens when asked to join, signs in with its first message, and only then asks for the room', () => {
    const { link, states } = make();
    expect(FakeSocket.all).toHaveLength(0);
    link.join('rm1');
    expect(FakeSocket.all).toHaveLength(1);
    expect(last().url).toBe('ws://host/interactives/rooms/ws');
    last().open();
    expect(last().sent).toEqual([{ t: 'hello', token: 'tok', session: 'sess', lti: null }]);
    last().say({ t: 'ready', epoch: 'e1' });
    expect(states).toEqual([{ up: true }]);
    expect(last().sent[1]).toEqual({ t: 'join', room: 'rm1', since: 0, epoch: '' });
    // a second room joined while up is asked for at once, a repeat of the first is just asked again
    link.join('rm2');
    expect(last().sent[2]).toEqual({ t: 'join', room: 'rm2', since: 0, epoch: '' });
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('hands every frame on untouched, and keeps how far it has heard in each room', () => {
    const { link, frames } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    last().say({ t: 'snapshot', room: 'rm1', epoch: 'e1', seq: 4, messages: [] });
    last().say({ t: 'event', room: 'rm1', seq: 5, e: 'message', m: { id: 'a' } });
    last().say({ t: 'event', room: 'rm1', seq: 3, e: 'message', m: { id: 'old' } });
    last().say({ t: 'here', room: 'rm1', n: 2 });
    expect(frames.map((f) => f.t)).toEqual(['snapshot', 'event', 'event', 'here']);
    expect(link.state().rooms.rm1).toEqual({ epoch: 'e1', seq: 5 });
    // a frame for a room it never joined is passed on and remembered nowhere
    last().say({ t: 'event', room: 'zzz', seq: 9, e: 'message' });
    expect(link.state().rooms.zzz).toBeUndefined();
  });

  it('ignores a frame that is not JSON or not a frame, and the server\'s beat', () => {
    const { link, frames } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    last().say('not json');
    last().say('42');
    last().say({ nothing: true });
    last().say({ t: 'beat' });
    expect(frames).toEqual([]);
  });

  it('comes back after a drop with a back off, and asks for what it missed since where it was', () => {
    const { link, states } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    last().say({ t: 'snapshot', room: 'rm1', epoch: 'e1', seq: 7, messages: [] });
    last().drop();
    expect(states).toEqual([{ up: true }, { up: false }]);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(FakeSocket.all).toHaveLength(2);
    last().open();
    last().say({ t: 'ready' });
    expect(last().sent[1]).toEqual({ t: 'join', room: 'rm1', since: 7, epoch: 'e1' });
    expect(states.at(-1)).toEqual({ up: true });
  });

  it('backs off longer each time it fails to get through, to a ceiling, and starts again after one that does', () => {
    const { link } = make();
    link.join('rm1');
    const waits: number[] = [];
    for (let i = 0; i < 8; i++) {
      const count = FakeSocket.all.length;
      last().drop();
      let t = 0;
      while (FakeSocket.all.length === count && t < 40000) {
        vi.advanceTimersByTime(250);
        t += 250;
      }
      waits.push(t);
    }
    expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
    last().open();
    last().say({ t: 'ready' });
    last().drop();
    vi.advanceTimersByTime(1001);
    expect(FakeSocket.all.length).toBeGreaterThan(8);
    expect(link.state().tries).toBe(1);
  });

  it('stops for good when the server will not have it (no session, nothing to join, no course), and says why', () => {
    for (const reason of ['session', 'nothing', 'nocourse']) {
      FakeSocket.all = [];
      const { link, states } = make();
      link.join('rm1');
      last().open();
      last().say({ t: 'bye', reason });
      expect(states).toEqual([{ gone: reason }]);
      vi.advanceTimersByTime(120000);
      expect(FakeSocket.all).toHaveLength(1);
      link.join('rm1');
      expect(FakeSocket.all).toHaveLength(1);
    }
  });

  it('comes back after a bye that is only a refresh or a full box', () => {
    for (const reason of ['refresh', 'full', 'busy']) {
      FakeSocket.all = [];
      const { link, states } = make();
      link.join('rm1');
      last().open();
      last().say({ t: 'ready' });
      last().say({ t: 'bye', reason });
      expect(states).toEqual([{ up: true }, { up: false }]);
      vi.advanceTimersByTime(1500);
      expect(FakeSocket.all).toHaveLength(2);
    }
  });

  it('resolves a send with what the server said, and with offline when there is no link or it takes too long', async () => {
    const { link } = make();
    expect(await link.send('rm1', 'early')).toEqual({ problem: 'offline' });
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    const ok = link.send('rm1', 'hello');
    expect(last().sent.at(-1)).toEqual({ t: 'send', room: 'rm1', text: 'hello', cid: '2' });
    last().say({ t: 'sent', room: 'rm1', cid: '2', ok: true, problem: '' });
    expect(await ok).toEqual({ problem: '' });
    const blocked = link.send('rm1', 'spam');
    last().say({ t: 'sent', room: 'rm1', cid: '3', ok: false, problem: 'blocked' });
    expect(await blocked).toEqual({ problem: 'blocked' });
    // never joined
    expect(await link.send('other', 'x')).toEqual({ problem: 'offline' });
    // no answer
    const slow = link.send('rm1', 'slow');
    vi.advanceTimersByTime(8001);
    expect(await slow).toEqual({ problem: 'offline' });
  });

  it('answers a send that was waiting when the link dropped, so nothing waits on a dead socket', async () => {
    const { link } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    const waiting = link.send('rm1', 'hello');
    last().drop();
    expect(await waiting).toEqual({ problem: 'offline' });
  });

  it('drops a server that has gone quiet (the beat comes every 20 seconds), and keeps one that beats', () => {
    const { link, states } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(20000);
      last().say({ t: 'beat' });
    }
    expect(FakeSocket.all).toHaveLength(1);
    expect(last().closed).toBe(false);
    vi.advanceTimersByTime(20000 * 4);
    expect(FakeSocket.all[0].closed).toBe(true);
    expect(states.at(-1)).toEqual({ up: false });
  });

  it('closes for good when asked, and does not come back', () => {
    const { link } = make();
    link.join('rm1');
    last().open();
    last().say({ t: 'ready' });
    link.close();
    expect(FakeSocket.all[0].closed).toBe(true);
    vi.advanceTimersByTime(120000);
    expect(FakeSocket.all).toHaveLength(1);
    link.join('rm1');
    expect(FakeSocket.all).toHaveLength(1);
  });

  it('carries the LTI session when there is no suite session, and never invents either', () => {
    const { link } = make({ hello: () => ({ token: 'tok', session: null, lti: 'launch-1' }) });
    link.join('rm1');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'hello', token: 'tok', session: null, lti: 'launch-1' });
  });

  it('survives a WebSocket that throws on open', () => {
    const { link } = make({
      WS: class {
        constructor() {
          throw new Error('blocked by a policy');
        }
      },
    });
    expect(() => link.join('rm1')).not.toThrow();
    expect(link.state().tries).toBe(1);
  });
});
