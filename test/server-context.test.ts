// @vitest-environment node
//The learner page answers the project's question about the course and the person playing (the built-in `context` data
//source): first name, display name, student or staff and the course, never the username, email or id, and never into
//analytics. The real index.js page script runs here against a fake session.
import vm from 'node:vm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { contextFrom } from '../shared/records.mjs';
import { cleanContext } from '../../interactives-player/src/context';

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
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['interactives-user-data'], h.db.ingest]) c.docs = [];
  await h.call('PUT', '/api/projects/prctx001', { user: ann, json: { project: project('prctx001'), rev: 0 } });
  token = (await h.call('PUT', '/api/projects/prctx001/share', { user: ann, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token;
});

const SESSION_USER = { username: 'z1234567', userID: 7, email: 'pat@example.edu', firstName: 'Pat', lastName: 'Quinn', fullName: 'Pat Quinn', isStudent: true, profile: 'https://lms/user/profile.php?id=7' };
const SESSION_ACTIVITY = { courseLabel: 'MAT1000_26S1_ONC', courseCode: 'MAT1000', courseTitle: 'Introduction to Maths', lmsURL: 'lms.example.edu', lmsName: 'StudyDesk', instanceID: 'r9', contextID: 'c9' };

describe('contextFrom', () => {
  it('gives the course and the first and display name, and says student or staff', () => {
    expect(contextFrom(SESSION_USER, SESSION_ACTIVITY)).toEqual({
      courseLabel: 'MAT1000_26S1_ONC',
      courseCode: 'MAT1000',
      courseName: 'Introduction to Maths',
      lmsUrl: 'lms.example.edu',
      lmsName: 'StudyDesk',
      firstName: 'Pat',
      displayName: 'Pat Quinn',
      signedIn: true,
      isStudent: true,
      isStaff: false,
    });
    expect(contextFrom({ ...SESSION_USER, isStudent: false }, SESSION_ACTIVITY)).toMatchObject({ isStudent: false, isStaff: true });
  });

  it('leaves out everything that identifies a person beyond their name', () => {
    const json = JSON.stringify(contextFrom(SESSION_USER, SESSION_ACTIVITY));
    for (const secret of ['z1234567', 'pat@example.edu', 'profile.php', 'userID', 'username', 'email', 'r9', 'c9']) expect(json).not.toContain(secret);
  });

  it('is nothing without a signed in user, and copes with a thin session', () => {
    expect(contextFrom(null, SESSION_ACTIVITY)).toBeNull();
    expect(contextFrom({}, SESSION_ACTIVITY)).toBeNull();
    expect(contextFrom({ username: 'x' }, undefined)).toMatchObject({ courseLabel: '', courseCode: '', firstName: '', displayName: '', signedIn: true });
    expect(contextFrom({ username: 'x', firstName: 'Pat', lastName: 'Q' }, {}).displayName).toBe('Pat Q');
  });

  it('cuts long and control text', () => {
    const c = contextFrom({ username: 'x', firstName: 'A\u0000\nB'.padEnd(500, 'z') }, { courseLabel: 'y'.repeat(500) });
    expect(c.firstName.length).toBe(100);
    expect(c.firstName.startsWith('A B')).toBe(true);
    expect(c.courseLabel.length).toBe(200);
  });

  it('is what the player turns into its context', () => {
    expect(cleanContext(contextFrom(SESSION_USER, SESSION_ACTIVITY))).toMatchObject({ courseCode: 'MAT1000', term: 'S1', year: '2026', offering: '26S1_ONC', firstName: 'Pat', isStaff: false });
  });
});

describe('the learner page answers a context request', () => {
  //Run the page's own script with the bits of a browser it touches; fetchActivity answers when the test says so
  const run = async (opts: { user?: Record<string, unknown> | null; activity?: Record<string, unknown>; late?: boolean; noActivity?: boolean } = {}) => {
    const html = (await h.call('GET', `/play/${token}`)).text;
    const script = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)][0][1];
    const listeners: Record<string, (e: unknown) => void> = {};
    const frame = { contentWindow: { postMessage: vi.fn() } };
    const reported: unknown[][] = [];
    const timers: (() => void)[] = [];
    const store = new Map<string, string>();
    let deliver: () => void = () => undefined;
    const ctx: Record<string, unknown> = {
      document: { getElementById: () => frame },
      location: { search: '' },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      URLSearchParams,
      fetch: vi.fn(async () => ({ ok: true, json: async () => ({}) })),
      Promise,
      Object,
      Math,
      Date,
      JSON,
      setTimeout: (fn: () => void) => (timers.push(fn), timers.length),
      reportAnalytics: (...args: unknown[]) => reported.push(args),
    };
    if (!opts.noActivity)
      ctx.fetchActivity = (cb: (err: unknown, data: unknown) => void) => {
        const go = () => cb(null, opts.user === null ? {} : { user: opts.user ?? SESSION_USER, activity: opts.activity ?? SESSION_ACTIVITY });
        if (opts.late) deliver = go;
        else go();
      };
    ctx.window = { parent: {}, addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn) };
    (ctx.window as Record<string, unknown>).parent = ctx.window;
    vm.runInNewContext(script, ctx);
    const ask = (rid = 'r1') => listeners.message({ source: frame.contentWindow, data: { source: 'interactives-progress', op: 'context', rid, project: 'whatever' } });
    const replies = () => frame.contentWindow.postMessage.mock.calls.map((c: unknown[]) => c[0] as Record<string, any>);
    return { ask, replies, deliver: () => deliver(), reported, timers, ctx };
  };

  it('answers with the course and the learner, in the progress reply shape', async () => {
    const p = await run();
    p.ask('r7');
    expect(p.replies()).toEqual([{ target: 'interactives', type: 'progress', rid: 'r7', ok: true, available: true, data: contextFrom(SESSION_USER, SESSION_ACTIVITY) }]);
  });

  it('keeps a request waiting until the session has come, then answers it', async () => {
    const p = await run({ late: true });
    p.ask('early');
    expect(p.replies()).toEqual([]);
    p.deliver();
    expect(p.replies()).toHaveLength(1);
    expect(p.replies()[0]).toMatchObject({ rid: 'early', available: true, data: { firstName: 'Pat', courseLabel: 'MAT1000_26S1_ONC' } });
    p.ask('later');
    expect(p.replies()[1]).toMatchObject({ rid: 'later', available: true });
  });

  it('says there is nothing to give when nobody is signed in or there is no session code at all', async () => {
    const out = await run({ user: null });
    out.ask();
    expect(out.replies()[0]).toMatchObject({ ok: true, available: false, data: null });
    const bare = await run({ noActivity: true });
    bare.ask();
    expect(bare.replies()[0]).toMatchObject({ available: false, data: null });
  });

  it('never carries the username, email or id in the reply', async () => {
    const p = await run();
    p.ask();
    const json = JSON.stringify(p.replies());
    for (const secret of ['z1234567', 'pat@example.edu', 'profile.php', 'userID', 'username']) expect(json).not.toContain(secret);
  });

  it('sends nothing about the learner to analytics for asking', async () => {
    const p = await run();
    p.ask();
    p.timers.splice(0).forEach((t) => t());
    expect(JSON.stringify(p.reported)).not.toMatch(/Pat|Quinn|MAT1000_26S1/);
  });
});
