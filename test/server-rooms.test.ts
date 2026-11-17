// @vitest-environment node
//Rooms: the real index.js against the in-memory mongo stand-in, with real WebSockets (the ws package) on the harness's server. A learner
//page signs in with its first message, joins a room, and hears messages from people in the same project and course, as seats and never as
//usernames. Hiding a message (the owner or a collaborator) is heard live. A page that drops comes back and is given what it missed.
//The caps are option A's, and a socket from some other site is refused.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error ws ships no types here
import WebSocket from 'ws';
import { sessionHeader, startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM shared with index.js
import { createRoomLink } from '../shared/rooms.mjs';

const ann: User = { username: 'ann', fullName: 'Ann Owner' };
const sam: User = { username: 'sam', fullName: 'Sam Smith', firstName: 'Sam', course: 'MAT1000_2026_S1' };
const lee: User = { username: 'lee', fullName: 'Lee Long', firstName: 'Lee', course: 'MAT1000_2026_S1' };
const kim: User = { username: 'kim', fullName: 'Kim Khan', firstName: 'Kim', course: 'PHY2000_2026_S1' };
const nocourse: User = { username: 'nina', fullName: 'Nina N' };

const ROOM = (id = 'rm1', room: Record<string, unknown> = {}) => ({ id, name: 'chat', kind: 'json', source: 'room', room: { blocked: ['spam'], ...room } });
const project = (id: string, sources: unknown[]) => ({ format: 'interactives', id, name: `Project ${id}`, settings: {}, dataSources: sources, artboards: [{ id: 'ab1', name: 'Start', width: 100, height: 100, background: '#fff', nodes: [] }], variables: [], interactions: [], timelines: [] });
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c')}</script></body></html>`;

let h: Harness;
let token = '';
let other = '';
//A new project for every test: the rate limit on opening sockets is kept per project and person, and lives as long as the server does
let PID = '';
let OTHER = '';
let n = 0;

beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

async function shareProject(id: string, sources: unknown[]) {
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id, sources), rev: 0 } });
  const r = await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: pageOf(project(id, sources)), type: 'text/plain' });
  return r.json.share.token as string;
}

const wsUrl = () => h.base.replace(/^http/, 'ws') + '/rooms/ws';

interface Client {
  ws: any;
  frames: any[];
  closed: Promise<{ code: number; reason: string }>;
  send(frame: object): void;
  waitFor(pred: (f: any) => boolean, ms?: number): Promise<any>;
  of(t: string): any[];
  close(): void;
}

const clients: Client[] = [];

/** A raw socket (no hello yet). */
function raw(opts: { origin?: string | null; url?: string } = {}): Promise<Client> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.origin) headers.origin = opts.origin;
    const ws = new WebSocket(opts.url ?? wsUrl(), { headers });
    const frames: any[] = [];
    const c: Client = {
      ws,
      frames,
      closed: new Promise((r) => ws.on('close', (code: number, reason: Buffer) => r({ code, reason: reason.toString() }))),
      send: (f) => ws.send(JSON.stringify(f)),
      of: (t) => frames.filter((f) => f.t === t),
      waitFor: (pred, ms = 2500) =>
        new Promise((res, rej) => {
          const t0 = Date.now();
          const tick = () => {
            const hit = frames.find(pred);
            if (hit) return res(hit);
            if (Date.now() - t0 > ms) return rej(new Error(`no matching frame; saw ${frames.map((f) => f.t).join(',')}`));
            setTimeout(tick, 5);
          };
          tick();
        }),
      close: () => ws.close(),
    };
    ws.on('message', (d: Buffer) => frames.push(JSON.parse(d.toString())));
    ws.on('open', () => {
      clients.push(c);
      resolve(c);
    });
    ws.on('unexpected-response', (_req: unknown, res: { statusCode: number }) => reject(Object.assign(new Error(`upgrade refused ${res.statusCode}`), { status: res.statusCode })));
    ws.on('error', reject);
  });
}

/** A socket that has said hello as this person and heard ready. */
async function learner(user: User | null, t = token, extra: Record<string, unknown> = {}) {
  const c = await raw();
  c.send({ t: 'hello', token: t, session: user ? sessionHeader(user) : null, ...extra });
  return c;
}
async function ready(user: User, t = token) {
  const c = await learner(user, t);
  await c.waitFor((f) => f.t === 'ready');
  return c;
}
async function joined(user: User, room = 'rm1', t = token) {
  const c = await ready(user, t);
  c.send({ t: 'join', room });
  const snap = await c.waitFor((f) => f.t === 'snapshot' && f.room === room);
  return { c, snap };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = async (c: Client, text: string, room = 'rm1', cid = 'c1') => {
  c.send({ t: 'send', room, text, cid });
  return c.waitFor((f) => f.t === 'sent' && f.cid === cid);
};
const messages = (c: Client) => c.of('event').filter((f) => f.e === 'message');

beforeEach(async () => {
  if (!process.env.DEBUG_ROOMS) vi.spyOn(console, 'warn').mockImplementation(() => {});
  if (!process.env.DEBUG_ROOMS) vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  delete process.env.INTERACTIVES_LIVE_PER_COURSE;
  delete process.env.INTERACTIVES_LIVE_TOTAL;
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db['room-messages'], h.db.audit]) c.docs = [];
  n += 1;
  PID = `prrooms${String(n).padStart(3, '0')}a`;
  OTHER = `prrooms${String(n).padStart(3, '0')}b`;
  token = await shareProject(PID, [ROOM()]);
  other = await shareProject(OTHER, [ROOM()]);
});
afterEach(async () => {
  while (clients.length) clients.pop()!.ws.terminate();
  delete process.env.INTERACTIVES_LIVE_PER_COURSE;
  delete process.env.INTERACTIVES_LIVE_TOTAL;
  delete process.env.INTERACTIVES_ROOM_HELLO_MS;
  //the server hears the sockets close on its next turn
  await pause(50);
});

describe('signing in with the first message', () => {
  it('says ready to a learner whose session checks out', async () => {
    const c = await learner(sam);
    const f = await c.waitFor((x) => x.t === 'ready');
    expect(typeof f.epoch).toBe('string');
  });

  it('closes on a hello with no session, and on one the suite does not know', async () => {
    const c = await learner(null);
    expect((await c.waitFor((f) => f.t === 'bye')).reason).toBe('session');
    expect((await c.closed).code).toBe(1000);
    const d = await raw();
    d.send({ t: 'hello', token, session: 'not-a-session' });
    expect((await d.waitFor((f) => f.t === 'bye')).reason).toBe('session');
  });

  it('closes on a share token that is not one, or that has no rooms', async () => {
    const bad = await learner(sam, 'x'.repeat(20));
    expect((await bad.waitFor((f) => f.t === 'bye')).reason).toBe('nothing');
    const plain = await shareProject(`prrooms${n}c`, []);
    const none = await learner(sam, plain);
    expect((await none.waitFor((f) => f.t === 'bye')).reason).toBe('nothing');
  });

  it('puts nobody in a room without a course', async () => {
    const c = await learner(nocourse);
    expect((await c.waitFor((f) => f.t === 'bye')).reason).toBe('nocourse');
  });

  it('closes a socket that sends something else first, or nothing at all', async () => {
    const a = await raw();
    a.send({ t: 'join', room: 'rm1' });
    expect((await a.closed).code).toBe(4002);
    process.env.INTERACTIVES_ROOM_HELLO_MS = '150';
    const b = await raw();
    expect((await b.closed).code).toBe(4001);
  });

  it('takes a launched LTI learner by their own session, and only for the project they were launched into', async () => {
    h.db['lti13-sessions'].docs.push({ _id: 'ltisession1', kind: 'launch', token, learner: { username: 'lti-lou', name: 'Lou Launched', course: 'LTI_COURSE_1', courseLabel: 'LTI_COURSE_1' }, created: new Date(), expires: new Date(Date.now() + 3600_000) });
    const c = await raw();
    c.send({ t: 'hello', token, lti: 'ltisession1' });
    await c.waitFor((f) => f.t === 'ready');
    c.send({ t: 'join', room: 'rm1' });
    expect((await c.waitFor((f) => f.t === 'snapshot')).me).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    const d = await raw();
    d.send({ t: 'hello', token: other, lti: 'ltisession1' });
    expect((await d.waitFor((f) => f.t === 'bye')).reason).toBe('session');
    const e = await raw();
    e.send({ t: 'hello', token, lti: 'not-a-launch' });
    expect((await e.waitFor((f) => f.t === 'bye')).reason).toBe('session');
  });

  it('refuses binary frames and anything over a few KB', async () => {
    const a = await ready(sam);
    a.ws.send(Buffer.from([1, 2, 3]));
    expect((await a.closed).code).toBe(1003);
    const b = await ready(lee);
    b.send({ t: 'send', room: 'rm1', text: 'x'.repeat(40000) });
    expect((await b.closed).code).toBe(1009);
  });

  it('cuts off a socket that sends more than forty frames in a second', async () => {
    const a = await ready(sam);
    for (let i = 0; i < 60; i++) a.send({ t: 'nothing' });
    expect((await a.closed).code).toBe(1008);
  });
});

describe('where a socket may come from', () => {
  it('takes a page on this host, and a program that sends no Origin', async () => {
    const host = new URL(h.base).host;
    const a = await raw({ origin: `http://${host}` });
    expect(a.ws.readyState).toBe(1);
    const b = await raw();
    expect(b.ws.readyState).toBe(1);
  });

  it('refuses a page on some other site, a broken origin, and any other path', async () => {
    await expect(raw({ origin: 'https://evil.example' })).rejects.toMatchObject({ status: 403 });
    await expect(raw({ origin: 'not a url' })).rejects.toMatchObject({ status: 403 });
    await expect(raw({ url: h.base.replace(/^http/, 'ws') + '/elsewhere' })).rejects.toBeTruthy();
  });
});

describe('who hears what', () => {
  it('gives a first look at an empty room, and sends to everyone in the same project and course, sender included', async () => {
    const { c: a, snap } = await joined(sam);
    expect(snap.messages).toEqual([]);
    expect(snap.here).toBe(1);
    expect(snap.me).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    const { c: b } = await joined(lee);
    const ack = await say(a, 'Hello class');
    expect(ack).toMatchObject({ ok: true, problem: '' });
    const heard = await b.waitFor((f) => f.t === 'event' && f.e === 'message');
    expect(heard.m.text).toBe('Hello class');
    expect(heard.m.mine).toBe(false);
    const echoed = await a.waitFor((f) => f.t === 'event' && f.e === 'message');
    expect(echoed.m.mine).toBe(true);
    expect(echoed.m.seat).toBe(snap.me);
    expect(echoed.m.id).toBe(heard.m.id);
    expect(heard.seq).toBe(1);
  });

  it('tells nobody in another course, and nobody in another project', async () => {
    const { c: a } = await joined(sam);
    const { c: b } = await joined(lee);
    const { c: otherCourse } = await joined(kim);
    const { c: otherProject } = await joined(sam, 'rm1', other);
    await say(a, 'private to this class');
    await b.waitFor((f) => f.t === 'event');
    await pause(150);
    expect(messages(otherCourse)).toEqual([]);
    expect(messages(otherProject)).toEqual([]);
    //and a new arrival in the other course gets none of it in their first look
    const { snap } = await joined(kim);
    expect(snap.messages).toEqual([]);
  });

  it('never sends a username, a full name or an email, in anything it says', async () => {
    const { c: a } = await joined(sam);
    const { c: b } = await joined(lee);
    await say(a, 'Hi there');
    await b.waitFor((f) => f.t === 'event');
    await pause(1200);
    for (const c of [a, b]) {
      const all = JSON.stringify(c.frames);
      for (const secret of ['"sam"', 'Sam Smith', '"lee"', 'Lee Long', 'username', 'userID', 'ann']) expect(all, secret).not.toContain(secret);
    }
  });

  it('gives the same seat every time a person comes back to a room, and different ones to different people and rooms', async () => {
    const { c: a, snap: first } = await joined(sam);
    const { snap: lees } = await joined(lee);
    expect(lees.me).not.toBe(first.me);
    a.close();
    const { snap: again } = await joined(sam);
    expect(again.me).toBe(first.me);
    const { snap: elsewhere } = await joined(sam, 'rm1', other);
    expect(elsewhere.me).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
  });

  it('goes by first names when the author said so, and by seat when there is none to use', async () => {
    const t = await shareProject(`prrooms${n}d`, [ROOM('rm1', { names: 'first' })]);
    const { c: a, snap } = await joined(sam, 'rm1', t);
    expect(snap.me).toBe('Sam');
    const { c: b } = await joined({ ...lee, firstName: '' }, 'rm1', t);
    await say(a, 'Hi');
    const f = await b.waitFor((x) => x.t === 'event');
    expect(f.m.seat).toBe('Sam');
    const { snap: lees } = await joined({ ...kim, course: sam.course, firstName: '' }, 'rm1', t);
    expect(lees.me).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
  });

  it('counts the people here, once each however many tabs, and says when it changes', async () => {
    const { c: a, snap } = await joined(sam);
    expect(snap.here).toBe(1);
    const { c: b } = await joined(lee);
    const second = await joined(lee);
    await a.waitFor((f) => f.t === 'here' && f.n === 2);
    b.close();
    second.c.close();
    await a.waitFor((f) => f.t === 'here' && f.n === 1, 3000);
  });

  it('does not let a socket speak in a room it has not joined, or one the project does not have', async () => {
    const c = await ready(sam);
    expect(await say(c, 'hello?')).toMatchObject({ ok: false, problem: 'offline' });
    c.send({ t: 'join', room: 'nothing-here' });
    expect((await c.waitFor((f) => f.t === 'closed')).room).toBe('nothing-here');
  });
});

describe('what a message may be', () => {
  it('is kept in mongo with who sent it (for the owner only), and in order', async () => {
    const { c } = await joined(sam);
    await say(c, 'one', 'rm1', 'a');
    await say(c, 'two', 'rm1', 'b');
    const rows = h.db['room-messages'].docs;
    expect(rows.map((r: any) => r.text)).toEqual(['one', 'two']);
    expect(rows[0]).toMatchObject({ project: PID, source: 'rm1', course: sam.course, username: 'sam', hidden: false });
    expect(rows[0]._id < rows[1]._id).toBe(true);
    expect(typeof rows[0].seat).toBe('string');
  });

  it('is cleaned: control characters and runs of spaces go, and nothing over 2000 characters is kept', async () => {
    const { c } = await joined(sam);
    await say(c, '  Hello \u0000\n   there ', 'rm1', 'a');
    await say(c, 'x'.repeat(2500), 'rm1', 'b');
    const [one, two] = h.db['room-messages'].docs;
    expect(one.text).toBe('Hello there');
    expect(two.text).toHaveLength(2000);
  });

  it('is refused when it is empty or holds a blocked word, and nothing is kept or heard', async () => {
    const { c: a } = await joined(sam);
    const { c: b } = await joined(lee);
    expect(await say(a, '   ', 'rm1', 'a')).toMatchObject({ ok: false, problem: 'empty' });
    expect(await say(a, 'buy SPAM now', 'rm1', 'b')).toMatchObject({ ok: false, problem: 'blocked' });
    expect(await say(a, 'a classy message', 'rm1', 'c')).toMatchObject({ ok: true });
    await b.waitFor((f) => f.t === 'event');
    expect(messages(b).map((f) => f.m.text)).toEqual(['a classy message']);
    expect(h.db['room-messages'].docs).toHaveLength(1);
  });

  it('has no limit on how many a person may send', async () => {
    const { c } = await joined(sam);
    for (let i = 0; i < 30; i++) c.send({ t: 'send', room: 'rm1', text: `message ${i}`, cid: `c${i}` });
    await c.waitFor((f) => f.t === 'sent' && f.cid === 'c29');
    expect(c.of('sent').every((f) => f.ok)).toBe(true);
    expect(h.db['room-messages'].docs).toHaveLength(30);
  });

  it('leaves out a message that holds a word blocked since it was sent', async () => {
    const rows = h.db['room-messages'];
    await rows.insertOne({ _id: '000000001aaa000000', project: PID, source: 'rm1', course: sam.course, username: 'x', seat: 'Old Otter 11', text: 'this is spam now', at: new Date(1000), hidden: false });
    await rows.insertOne({ _id: '000000002aaa000000', project: PID, source: 'rm1', course: sam.course, username: 'x', seat: 'Old Otter 11', text: 'fine', at: new Date(2000), hidden: false });
    const { snap } = await joined(sam);
    expect(snap.messages.map((m: any) => m.text)).toEqual(['fine']);
  });

  it('is what a new arrival sees first: the latest few in order, hidden ones left out', async () => {
    const ID = `prrooms${n}e`;
    const t = await shareProject(ID, [ROOM('rm1', { show: 3 })]);
    const rows = h.db['room-messages'];
    const make = (k: number, hidden = false) => ({ _id: `00000000${k}aaa000000`.slice(0, 18), project: ID, source: 'rm1', course: sam.course, username: 'x', seat: 'Old Otter 11', text: `m${k}`, at: new Date(1000 * k), hidden });
    for (const d of [make(1), make(2), make(3, true), make(4), make(5), make(6)]) await rows.insertOne(d);
    const { snap } = await joined(sam, 'rm1', t);
    expect(snap.messages.map((m: any) => m.text)).toEqual(['m4', 'm5', 'm6']);
    expect(snap.messages.every((m: any) => m.mine === false && !('username' in m))).toBe(true);
    //a later one pushes the oldest out of the window
    const { c } = await joined(lee, 'rm1', t);
    await say(c, 'm7');
    const { snap: again } = await joined({ ...kim, course: sam.course }, 'rm1', t);
    expect(again.messages.map((m: any) => m.text)).toEqual(['m5', 'm6', 'm7']);
  });
});

describe('hiding a message', () => {
  const hide = (user: User, id: string, hidden = true, p = PID) => h.call('PUT', `/api/projects/${p}/rooms/rm1/messages/${id}/hidden`, { user, json: { hidden } });

  it('is heard at once by everybody in that course, and is gone from the next look at the room', async () => {
    const { c: a } = await joined(sam);
    const { c: b } = await joined(lee);
    const { c: otherCourse } = await joined(kim);
    await say(a, 'keep');
    await say(a, 'remove me', 'rm1', 'c2');
    await b.waitFor((f) => f.t === 'event' && f.m?.text === 'remove me');
    const id = h.db['room-messages'].docs.find((d: any) => d.text === 'remove me')!._id;
    const r = await hide(ann, id);
    expect(r.status).toBe(200);
    expect(r.json.hidden).toBe(true);
    const heard = await b.waitFor((f) => f.t === 'event' && f.e === 'hide');
    expect(heard.id).toBe(id);
    await a.waitFor((f) => f.t === 'event' && f.e === 'hide');
    expect(otherCourse.frames.filter((f) => f.e === 'hide')).toEqual([]);
    //it is still in mongo, marked, with who hid it
    expect(h.db['room-messages'].docs.find((d: any) => d._id === id)).toMatchObject({ hidden: true, hiddenBy: 'ann' });
    const { snap } = await joined(lee);
    expect(snap.messages.map((m: any) => m.text)).toEqual(['keep']);
  });

  it('can be undone, and the message comes back in its place', async () => {
    const { c: a } = await joined(sam);
    await say(a, 'first', 'rm1', 'a');
    await say(a, 'second', 'rm1', 'b');
    const id = h.db['room-messages'].docs.find((d: any) => d.text === 'first')!._id;
    await hide(ann, id);
    await a.waitFor((f) => f.e === 'hide');
    const r = await hide(ann, id, false);
    expect(r.json.hidden).toBe(false);
    const back = await a.waitFor((f) => f.e === 'show');
    expect(back.m).toMatchObject({ id, text: 'first', mine: true });
    const { snap } = await joined(lee);
    expect(snap.messages.map((m: any) => m.text)).toEqual(['first', 'second']);
  });

  it('is for the project owner and its collaborators, and nobody else', async () => {
    const { c: a } = await joined(sam);
    await say(a, 'a message');
    const id = h.db['room-messages'].docs[0]._id;
    await h.call('POST', `/api/projects/${PID}/collaborators`, { user: ann, json: { username: 'cole', name: 'Cole' } });
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await hide({ username: 'stranger', fullName: 'Stranger' }, id)).status).toBe(403);
    expect(h.db['room-messages'].docs[0].hidden).toBe(false);
    expect((await hide({ username: 'cole', fullName: 'Cole' }, id)).status).toBe(200);
    expect(h.db['room-messages'].docs[0].hidden).toBe(true);
    //the owner can bring it back
    expect((await hide(ann, id, false)).status).toBe(200);
  });

  it('knows which messages are the project\'s: another project\'s, a room it does not have, and nothing at all are refused', async () => {
    const { c } = await joined(sam, 'rm1', other);
    await say(c, 'in the other project');
    const id = h.db['room-messages'].docs[0]._id;
    expect((await hide(ann, id)).status).toBe(404);
    expect((await h.call('PUT', `/api/projects/${PID}/rooms/nothing/messages/${id}/hidden`, { user: ann, json: {} })).status).toBe(404);
    expect((await hide(ann, 'zzzzzzzzzzzzzz')).status).toBe(404);
    expect((await hide(ann, 'not a message id')).status).toBe(404);
  });

  it('is written to the audit trail without the words', async () => {
    const { c } = await joined(sam);
    await say(c, 'secretive words');
    await hide(ann, h.db['room-messages'].docs[0]._id);
    const row = h.db.audit.docs.find((d: any) => d.event === 'room-hide');
    expect(row).toBeTruthy();
    expect(JSON.stringify(row)).not.toContain('secretive');
  });

  it('shows the owner who said what, course by course, hidden ones marked', async () => {
    const { c: a } = await joined(sam);
    const { c: k } = await joined(kim);
    await say(a, 'from sam');
    await say(k, 'from kim');
    await hide(ann, h.db['room-messages'].docs[0]._id);
    const r = await h.call('GET', `/api/projects/${PID}/rooms`, { user: ann });
    expect(r.status).toBe(200);
    const src = r.json.sources[0];
    expect(src).toMatchObject({ source: 'rm1', name: 'chat', declared: { names: 'seat', show: 100, blocked: ['spam'] } });
    expect(src.courses.map((c: any) => c.course)).toEqual([sam.course, kim.course]);
    const mat = src.courses[0];
    expect(mat.here).toBe(1);
    expect(mat.messages[0]).toMatchObject({ text: 'from sam', username: 'sam', hidden: true, hiddenBy: 'ann' });
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', `/api/projects/${PID}/rooms`, { user: { username: 'stranger' } })).status).toBe(403);
  });
});

describe('coming back after a drop', () => {
  it('is given what it missed, as a replay, when it asks since where it was', async () => {
    const { c: a, snap } = await joined(sam);
    const { c: b } = await joined(lee);
    await say(b, 'before', 'rm1', 'a');
    await a.waitFor((f) => f.e === 'message');
    const seen = a.of('event').at(-1);
    a.close();
    await a.closed;
    await say(b, 'while away 1', 'rm1', 'b');
    await say(b, 'while away 2', 'rm1', 'c');
    const back = await ready(sam);
    back.send({ t: 'join', room: 'rm1', since: seen.seq, epoch: snap.epoch });
    const replay = await back.waitFor((f) => f.t === 'replay');
    expect(replay.events.map((e: any) => e.m.text)).toEqual(['while away 1', 'while away 2']);
    expect(replay.seq).toBe(3);
    expect(replay.me).toBe(snap.me);
    expect(back.of('snapshot')).toEqual([]);
  });

  it('is told about a message that was hidden while it was away', async () => {
    const { c: a, snap } = await joined(sam);
    const { c: b } = await joined(lee);
    await say(b, 'soon gone');
    await a.waitFor((f) => f.e === 'message');
    const seen = a.of('event').at(-1);
    a.close();
    await a.closed;
    await h.call('PUT', `/api/projects/${PID}/rooms/rm1/messages/${seen.m.id}/hidden`, { user: ann, json: { hidden: true } });
    const back = await ready(sam);
    back.send({ t: 'join', room: 'rm1', since: seen.seq, epoch: snap.epoch });
    const replay = await back.waitFor((f) => f.t === 'replay');
    expect(replay.events).toEqual([{ seq: 2, e: 'hide', id: seen.m.id }]);
  });

  it('gets a fresh look instead when the epoch is not this run\'s, or it has never been', async () => {
    const { c: a } = await joined(sam);
    await say(a, 'one');
    const stale = await ready(lee);
    stale.send({ t: 'join', room: 'rm1', since: 1, epoch: 'old-run' });
    const snap = await stale.waitFor((f) => f.t === 'snapshot');
    expect(snap.messages.map((m: any) => m.text)).toEqual(['one']);
    const ahead = await ready({ ...kim, course: sam.course });
    ahead.send({ t: 'join', room: 'rm1', since: 999, epoch: snap.epoch });
    expect((await ahead.waitFor((f) => f.t === 'snapshot')).seq).toBe(1);
  });

  it('works end to end with the link the learner page holds: it drops, backs off, comes back and catches up', async () => {
    const frames: any[] = [];
    const states: any[] = [];
    const link = createRoomLink({
      url: wsUrl(),
      WS: WebSocket,
      hello: () => ({ token, session: sessionHeader(sam) }),
      onFrame: (f: any) => frames.push(f),
      onState: (st: any) => states.push(st),
      random: () => 0,
    });
    const wait = async (pred: () => boolean, ms = 5000) => {
      const t0 = Date.now();
      while (!pred()) {
        if (Date.now() - t0 > ms) throw new Error(`timed out; frames ${frames.map((f) => f.t).join(',')}; states ${JSON.stringify(states)}`);
        await pause(10);
      }
    };
    link.join('rm1');
    await wait(() => frames.some((f) => f.t === 'snapshot'));
    expect(states[0]).toEqual({ up: true });
    expect(await link.send('rm1', 'hello from the link')).toEqual({ problem: '' });
    expect(await link.send('rm1', 'spam spam')).toEqual({ problem: 'blocked' });
    expect(await link.send('rm1', '   ')).toEqual({ problem: 'empty' });
    const { c: b } = await joined(lee);
    //three more sockets for the same person make the server let go of the oldest, which is the link's
    await ready(sam);
    await ready(sam);
    await ready(sam);
    await wait(() => states.some((st) => st.up === false));
    expect(await link.send('rm1', 'sent while down')).toEqual({ problem: 'offline' });
    await say(b, 'missed one', 'rm1', 'x1');
    await say(b, 'missed two', 'rm1', 'x2');
    await wait(() => frames.some((f) => f.t === 'replay'));
    const replay = frames.find((f) => f.t === 'replay');
    expect(replay.events.map((e: any) => e.m.text)).toEqual(['missed one', 'missed two']);
    expect(states.filter((st) => st.up === true)).toHaveLength(2);
    expect(await link.send('rm1', 'and back')).toEqual({ problem: '' });
    link.close();
  });
});

describe('the caps', () => {
  it('keeps a course to INTERACTIVES_LIVE_PER_COURSE sockets, and says full to the next', async () => {
    process.env.INTERACTIVES_LIVE_PER_COURSE = '2';
    await ready(sam);
    await ready(lee);
    const third = await learner({ username: 'zed', fullName: 'Zed', course: sam.course });
    expect((await third.waitFor((f) => f.t === 'bye')).reason).toBe('full');
    //another course has its own count
    await ready(kim);
  });

  it('keeps a box to INTERACTIVES_LIVE_TOTAL, counting the sockets that have not said hello', async () => {
    process.env.INTERACTIVES_LIVE_TOTAL = '2';
    await ready(sam);
    await ready(kim);
    const third = await learner(lee);
    expect((await third.waitFor((f) => f.t === 'bye')).reason).toBe('full');
  });

  it('lets a person have three sockets, and the oldest makes way for a fourth', async () => {
    const first = await ready(sam);
    await ready(sam);
    await ready(sam);
    const fourth = await ready(sam);
    expect((await first.waitFor((f) => f.t === 'bye')).reason).toBe('refresh');
    await first.closed;
    expect(fourth.ws.readyState).toBe(1);
  });

  it('allows twelve opens a minute to a person, and says busy to the thirteenth', async () => {
    let last: Client | null = null;
    for (let i = 0; i < 13; i++) {
      last = await learner(sam);
      await last.waitFor((f) => f.t === 'ready' || f.t === 'bye');
    }
    expect(last!.frames.some((f) => f.t === 'bye' && f.reason === 'busy')).toBe(true);
  });

  it('frees a place when a socket closes', async () => {
    process.env.INTERACTIVES_LIVE_PER_COURSE = '1';
    const a = await ready(sam);
    a.close();
    await a.closed;
    await pause(30);
    await ready(lee);
  });
});

describe('when the link is turned off', () => {
  it('ends the sockets of that project, and only that one', async () => {
    const { c: a } = await joined(sam);
    const { c: b } = await joined(sam, 'rm1', other);
    const r = await h.call('DELETE', `/api/projects/${PID}/share`, { user: ann });
    expect(r.status).toBeLessThan(300);
    expect((await a.waitFor((f) => f.t === 'bye')).reason).toBe('nothing');
    await a.closed;
    await pause(50);
    expect(b.ws.readyState).toBe(1);
  });
});

describe('the learner page', () => {
  it('holds the link for a project with rooms: the socket url, the hello and the frames to the project', async () => {
    const r = await h.call('GET', `/play/${token}`);
    expect(r.status).toBe(200);
    expect(r.text).toContain('var createRoomLink = function createRoomLink');
    expect(r.text).toContain("'/rooms/ws'");
    expect(r.text).toContain("m.op === 'room-join'");
    expect(r.text).toContain("m.op === 'room-send'");
    const csp = r.headers.get('content-security-policy') ?? '';
    const host = new URL(h.base).host;
    expect(csp).toContain(`connect-src 'self' ws://${host} wss://${host};`);
  });

  it('leaves the page\'s policy as it was for a project with no rooms', async () => {
    const plain = await shareProject(`prrooms${n}f`, []);
    const r = await h.call('GET', `/play/${plain}`);
    expect(r.headers.get('content-security-policy')).toContain("connect-src 'self'; media-src");
  });
});

describe('what a share declares', () => {
  it('keeps the rooms of a shared page, cleaned, and brings the old ones back on a revert', async () => {
    const t = await shareProject(`prrooms${n}g`, [ROOM('rm1', { names: 'first', show: 9999, blocked: [' a ', 5] })]);
    const doc = h.db.projects.docs.find((d: any) => d._id === `prrooms${n}g`)!;
    expect(doc.share.token).toBe(t);
    expect(doc.share.rooms).toEqual({ rm1: { names: 'first', show: 300, blocked: ['a'], name: 'chat' } });
    //shared again with no room, then reverted
    await h.call('PUT', `/api/projects/prrooms${n}g/share`, { user: ann, body: pageOf(project(`prrooms${n}g`, [])), type: 'text/plain' });
    expect(h.db.projects.docs.find((d: any) => d._id === `prrooms${n}g`)!.share.rooms).toBeUndefined();
    await h.call('POST', `/api/projects/prrooms${n}g/share/revert`, { user: ann });
    expect(h.db.projects.docs.find((d: any) => d._id === `prrooms${n}g`)!.share.rooms).toBeDefined();
  });
});
