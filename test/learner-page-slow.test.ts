// @vitest-environment node
//Saved work going missing on a slow StudyDesk page. The project in the learner page's frame used to give up on the page after a second
//and a half and start the learner over from nothing. The page now fetches what was saved as soon as it loads, tells a player that
//understands it (acks) that each answer is coming, and tells it apart when the server failed rather than had no session. A player
//shared before this is never sent either, because it would take them for an empty answer and save over what's kept.
import vm from 'node:vm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const project = (id: string) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, children: [], timelines: [], logic: { nodes: [], edges: [] } }], variables: [], scripts: [], assets: [], fonts: [], dataSources: [] });

let h: Harness;
let token = '';
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries]) c.docs = [];
  await h.call('PUT', '/api/projects/prslow001', { user: ann, json: { project: project('prslow001'), rev: 0 } });
  token = (await h.call('PUT', '/api/projects/prslow001/share', { user: ann, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token;
});

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

type Answer = { status: number; body?: unknown };

/** Run the page's own script with a fake fetch: `server` answers each request by path. */
const run = async (server: (path: string, method: string) => Answer, opts: { session?: boolean; framed?: boolean; wait?: boolean } = {}) => {
  //Shared again with the project's Wait for user session setting written into the page, the way the editor writes it
  if (opts.wait !== undefined) {
    const page = `<html><body><script type="application/json" id="ix-project">${JSON.stringify({ ...project('prslow001'), settings: { waitForSession: opts.wait } })}</script></body></html>`;
    expect((await h.call('PUT', '/api/projects/prslow001/share', { user: ann, body: page, type: 'text/plain' })).json.share.waitSession).toBe(opts.wait);
  }
  const html = (await h.call('GET', `/play/${token}`)).text;
  const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
  const listeners: Record<string, (e: unknown) => void> = {};
  const frame = { contentWindow: { postMessage: vi.fn() } };
  const requests: { method: string; path: string; session: string | null }[] = [];
  //What the StudyDesk handshake writes into, a clock and the page's timers, so a test can have the session turn up late
  const stored: Record<string, string> = {};
  const clock = { now: 1000 };
  let timers: { at: number; fn: () => void }[] = [];
  class FakeDate extends Date {
    static now = () => clock.now;
  }
  const ctx: Record<string, unknown> = {
    document: { getElementById: () => frame },
    location: { search: opts.session === false ? '' : '?sessionID=s-1', hash: '', pathname: '/play/x' },
    history: { replaceState: () => undefined },
    sessionStorage: { getItem: (k: string) => stored[k] ?? null, setItem: (k: string, v: string) => void (stored[k] = v) },
    URLSearchParams,
    fetch: vi.fn(async (url: string, init: { method: string; headers: Record<string, string> }) => {
      const path = url.split(`/learn/${token}/`)[1] ?? url;
      requests.push({ method: init.method, path, session: init.headers['X-Session-ID'] ?? null });
      const a = server(path, init.method);
      return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body ?? {} };
    }),
    Promise,
    Object,
    Math,
    Date: FakeDate,
    JSON,
    setTimeout: (fn: () => void, ms = 0) => timers.push({ at: clock.now + ms, fn }),
    clearTimeout: () => undefined,
  };
  ctx.window = { parent: {}, addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn) };
  if (!opts.framed) (ctx.window as Record<string, unknown>).parent = ctx.window;
  vm.runInNewContext(script, ctx);
  /** Let this much time pass, running the timers that come due (ones they set wait for the next tick). */
  const tick = (ms: number) => {
    clock.now += ms;
    const due = timers.filter((t) => t.at <= clock.now);
    timers = timers.filter((t) => t.at > clock.now);
    for (const t of due) t.fn();
  };
  const ask = (data: Record<string, unknown>) => listeners.message({ source: frame.contentWindow, data: { source: 'interactives-progress', project: 'p', ...data } });
  const replies = () => frame.contentWindow.postMessage.mock.calls.map((c: unknown[]) => c[0] as Record<string, any>);
  return { ask, replies, requests, stored, tick, listeners };
};

const saved = { program: 'MSCN', placements: [{ card: 'AGR6005' }], other: 1 };
const fine = (path: string): Answer =>
  path.startsWith('user-data') ? { status: 200, body: { available: true, variables: saved } } : path === 'progress' ? { status: 200, body: { available: true, progress: { variables: { step: 3 } } } } : { status: 200, body: { available: true, ok: true } };

describe('the learner page, for a slow server', () => {
  it('fetches what was saved as soon as it loads, before the project asks', async () => {
    const p = await run(fine);
    await settle();
    expect(p.requests).toEqual([
      { method: 'GET', path: 'progress', session: 's-1' },
      { method: 'GET', path: 'user-data?all=1', session: 's-1' },
    ]);
  });

  it('fetches nothing early without a session', async () => {
    const p = await run(fine, { session: false });
    await settle();
    expect(p.requests).toEqual([]);
  });

  it("answers the project's first load from it, with only the names asked for, and asks the server again for later ones", async () => {
    const p = await run(fine);
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program', 'placements', 'never'] });
    await settle();
    expect(p.replies().find((r) => r.rid === 'u1')).toEqual({ target: 'interactives', type: 'progress', rid: 'u1', ok: true, available: true, data: { program: 'MSCN', placements: [{ card: 'AGR6005' }] } });
    p.ask({ op: 'load', rid: 'p1' });
    await settle();
    expect(p.replies().find((r) => r.rid === 'p1')).toMatchObject({ ok: true, available: true, data: { variables: { step: 3 } } });
    expect(p.requests).toHaveLength(2);
    p.ask({ op: 'userdata-load', rid: 'u2', names: ['program'] });
    await settle();
    expect(p.requests.at(-1)).toEqual({ method: 'GET', path: 'user-data?names=program', session: 's-1' });
  });

  it('never answers a load from the early fetch once something has been saved', async () => {
    const p = await run(fine);
    p.ask({ op: 'userdata-save', rid: 's1', variables: { program: 'GCSC' } });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'] });
    await settle();
    expect(p.requests.map((r) => r.path)).toEqual(['progress', 'user-data?all=1', 'user-data', 'user-data?names=program']);
  });

  it('tells a player that understands it that the answer is coming, at once', async () => {
    const p = await run(fine);
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    expect(p.replies()).toEqual([{ target: 'interactives', type: 'progress-pending', rid: 'u1' }]);
  });

  it('sends an older player nothing it would misread', async () => {
    const p = await run(fine);
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'] });
    expect(p.replies()).toEqual([]);
  });
});

//The race on a StudyDesk page: this page is in an iframe and has often loaded before si-manager's handshake has written the session
//id into sessionStorage. It used to ask the server as nobody, hear there was nothing kept, and the project started over.
describe('the learner page, framed in a page whose session has not arrived yet', () => {
  it('asks the server nothing as nobody: the load waits for the session, then goes with it', async () => {
    const p = await run(fine, { session: false, framed: true });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    await settle();
    p.tick(200);
    await settle();
    expect(p.requests).toEqual([]);
    expect(p.replies()).toEqual([{ target: 'interactives', type: 'progress-pending', rid: 'u1' }]);
    p.stored.sessionID = 's-late';
    p.tick(200);
    await settle();
    expect(p.requests.every((r) => r.session === 's-late')).toBe(true);
    //the fetch of everything saved goes first, and the load is answered from it
    expect(p.requests.map((r) => r.path)).toEqual(['progress', 'user-data?all=1']);
    expect(p.replies().filter((r) => r.rid === 'u1')).toEqual([
      { target: 'interactives', type: 'progress-pending', rid: 'u1' },
      { target: 'interactives', type: 'progress', rid: 'u1', ok: true, available: true, data: { program: 'MSCN' } },
    ]);
  });

  it('takes the session the moment the browser says storage changed, and what was asked goes in the order it came', async () => {
    const p = await run(fine, { session: false, framed: true });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    p.ask({ op: 'userdata-save', rid: 's1', variables: { program: 'GCSC' }, acks: true });
    p.stored.sessionID = 's-late';
    p.listeners.storage({ key: 'sessionID' });
    await settle();
    expect(p.requests.filter((r) => r.path.startsWith('user-data')).map((r) => `${r.method} ${r.path} ${r.session}`)).toEqual(['GET user-data?all=1 s-late', 'PUT user-data s-late']);
    expect(p.replies().find((r) => r.rid === 'u1' && r.type === 'progress')).toMatchObject({ ok: true, available: true, data: { program: 'MSCN' } });
  });

  it('fetches early once the session is there, when the project has not asked yet', async () => {
    const p = await run(fine, { session: false, framed: true });
    p.stored.sessionID = 's-late';
    p.tick(200);
    await settle();
    expect(p.requests).toEqual([
      { method: 'GET', path: 'progress', session: 's-late' },
      { method: 'GET', path: 'user-data?all=1', session: 's-late' },
    ]);
  });

  it('carries on without one after 15 seconds, for a page that is never handed a session', async () => {
    const p = await run((path) => (path.startsWith('user-data') ? { status: 200, body: { available: false } } : fine(path)), { session: false, framed: true });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    for (let i = 0; i < 70; i++) p.tick(200);
    await settle();
    expect(p.requests).toEqual([]);
    for (let i = 0; i < 6; i++) p.tick(200);
    await settle();
    expect(p.requests).toEqual([{ method: 'GET', path: 'user-data?names=program', session: null }]);
    expect(p.replies().find((r) => r.rid === 'u1' && r.type === 'progress')).toMatchObject({ ok: true, available: false });
  });

  it('does not wait in a tab of its own, where there is no handshake coming', async () => {
    const p = await run(fine, { session: false });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'] });
    await settle();
    expect(p.requests).toEqual([{ method: 'GET', path: 'user-data?names=program', session: null }]);
  });
});

//Project > Wait for user session before start, as it was when the link was shared
describe('the learner page, for a project that says whether to wait for the session', () => {
  it('set to wait, it waits for as long as it takes and keeps telling the player the answer is coming', async () => {
    const p = await run(fine, { session: false, framed: true, wait: true });
    p.ask({ op: 'session', rid: 'w1', acks: true });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    for (let i = 0; i < 1500; i++) p.tick(200);
    await settle();
    expect(p.requests).toEqual([]);
    expect(p.replies().filter((r) => r.type === 'progress')).toEqual([]);
    expect(p.replies().filter((r) => r.type === 'progress-pending' && r.rid === 'w1').length).toBeGreaterThan(50);
    expect(p.replies().filter((r) => r.type === 'progress-pending' && r.rid === 'u1').length).toBeGreaterThan(50);
    p.stored.sessionID = 's-late';
    p.tick(200);
    await settle();
    expect(p.replies().find((r) => r.rid === 'w1' && r.type === 'progress')).toEqual({ target: 'interactives', type: 'progress', rid: 'w1', ok: true, available: true });
    expect(p.replies().find((r) => r.rid === 'u1' && r.type === 'progress')).toMatchObject({ ok: true, available: true, data: { program: 'MSCN' } });
    const said = p.replies().length;
    p.tick(5000);
    expect(p.replies()).toHaveLength(said);
  });

  it('set not to wait, it starts at once with whatever is known, and still uses a session that turns up later', async () => {
    const p = await run(fine, { session: false, framed: true, wait: false });
    p.ask({ op: 'session', rid: 'w1', acks: true });
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    await settle();
    expect(p.replies().find((r) => r.rid === 'w1' && r.type === 'progress')).toEqual({ target: 'interactives', type: 'progress', rid: 'w1', ok: true, available: false });
    expect(p.requests).toEqual([{ method: 'GET', path: 'user-data?names=program', session: null }]);
    p.stored.sessionID = 's-late';
    p.ask({ op: 'userdata-save', rid: 's1', variables: { program: 'GCSC' }, acks: true });
    await settle();
    expect(p.requests.at(-1)).toEqual({ method: 'PUT', path: 'user-data', session: 's-late' });
  });

  it('in a tab of its own it does not wait even when set to, since no handshake is coming', async () => {
    const p = await run(fine, { session: false, wait: true });
    p.ask({ op: 'session', rid: 'w1', acks: true });
    await settle();
    expect(p.replies().find((r) => r.rid === 'w1' && r.type === 'progress')).toMatchObject({ ok: true, available: false });
  });

  it('a page that does not say (shared before the setting) keeps no waitSession on its share record', async () => {
    expect((await h.call('GET', '/api/projects/prslow001/share', { user: ann })).json.share.waitSession).toBeUndefined();
  });
});

describe('the learner page, when the server fails', () => {
  const down = (_path: string, method: string): Answer => (method === 'GET' ? { status: 502 } : { status: 200, body: { available: true, ok: true } });

  it('says it failed to a player that understands it, and goes to the server again rather than reuse the failed early fetch', async () => {
    const p = await run(down);
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'], acks: true });
    await settle();
    expect(p.replies().find((r) => r.rid === 'u1' && r.type === 'progress')).toEqual({ target: 'interactives', type: 'progress', rid: 'u1', ok: false, available: true, failed: true });
    expect(p.requests.map((r) => r.path)).toEqual(['progress', 'user-data?all=1', 'user-data?names=program']);
  });

  it('gives an older player the old answer (no records here), never an empty one it would save over', async () => {
    const p = await run(down);
    p.ask({ op: 'userdata-load', rid: 'u1', names: ['program'] });
    p.ask({ op: 'load', rid: 'p1' });
    await settle();
    expect(p.replies().find((r) => r.rid === 'u1')).toEqual({ target: 'interactives', type: 'progress', rid: 'u1', ok: false, available: false });
    expect(p.replies().find((r) => r.rid === 'p1')).toEqual({ target: 'interactives', type: 'progress', rid: 'p1', ok: false, available: false });
  });

  it('a save the server failed is a failure, one it turned away is refused, and no session is still no session', async () => {
    const statuses: Record<string, number> = { a: 500, b: 413, c: 401 };
    let which = 'a';
    const p = await run((path, method) => (method === 'PUT' ? { status: statuses[which], body: { available: false } } : fine(path)));
    for (const w of ['a', 'b', 'c']) {
      which = w;
      p.ask({ op: 'userdata-save', rid: w, variables: { program: 'X' }, acks: true });
      await settle();
    }
    const got = (rid: string) => p.replies().find((r) => r.rid === rid && r.type === 'progress');
    expect(got('a')).toMatchObject({ ok: false, available: true, failed: true });
    expect(got('b')).toMatchObject({ ok: false, available: true, failed: false });
    expect(got('c')).toMatchObject({ available: false });
    expect(got('c')!.failed).toBeUndefined();
  });
});

describe("the learner page, passing the link's values on", () => {
  const frameSrc = async (query: string) => /<iframe id="project" src="([^"]+)"/.exec((await h.call('GET', `/play/${token}${query}`)).text)![1];

  it("hands ?program=GCSC to the project in its frame's #, and keeps the toolbox's own and the session back", async () => {
    const src = await frameSrc('?title=Pathway&program=GCSC&cdtID=1794894076383&sessionID=s-1');
    expect(src).toBe(`/interactives/s/${token}#program=GCSC`);
  });

  it('adds nothing without values, and escapes what it hands on', async () => {
    expect(await frameSrc('?title=Pathway&cdtID=1')).toBe(`/interactives/s/${token}`);
    const src = await frameSrc('?a=%22%3E%3Cb%3E&b=1%262&bad%20name=x');
    expect(src).not.toMatch(/[<>"]/);
    expect(new URLSearchParams(src.split('#')[1].replace(/&amp;/g, '&'))).toEqual(new URLSearchParams({ a: '"><b>', b: '1&2' }));
  });
});
