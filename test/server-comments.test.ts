// @vitest-environment node
//Review comments against the real index.js and the fake mongo: the editor's routes, the review link and its guests,
//rate limits, who may resolve/assign/edit/delete, notices, the live stream and the counts on the projects list.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type Stream, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob', fullName: 'Bob B' };
const cat: User = { username: 'cat', fullName: 'Cat C' };
const pat: User = { username: 'pat', power: true };

const project = (id: string) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [] }],
});

let h: Harness;
let n = 0;
let id = '';
const streams: Stream[] = [];
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  for (const s of streams) s.close();
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation((...a) => process.env.DBG ? console.log(...a) : undefined);
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.comments, h.db['comment-notices'], h.db.prefs]) c.docs = [];
  id = `prcomm${String(++n).padStart(4, '0')}`;
  await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } });
});

const anchor = { artboardId: 'ab1', layerId: 'n1', lx: 5, ly: 6, x: 105, y: 206 };
const add = (text = 'Check this', user: User | null = ann, extra: Record<string, unknown> = {}) => h.call('POST', `/api/projects/${id}/comments`, { user, json: { anchor, text, context: { artboard: 'Main', layer: 'Title' }, ...extra } });
const reviewOn = async (guests = false) => (await h.call('PUT', `/api/projects/${id}/review`, { user: ann, json: { guests } })).json.review.token as string;
const rv = (token: string, method: string, path: string, user: User | null, json?: unknown) => h.call(method, `/review/${token}${path}`, { user, json });

describe('the editor routes', () => {
  it('pins a comment, lists it as a thread and numbers the next one', async () => {
    const a = await add('First');
    expect(a.status).toBe(200);
    expect(a.json.thread).toMatchObject({ n: 1, status: 'open', assignee: null, anchor, ctx: { artboard: 'Main', layer: 'Title' } });
    expect(a.json.thread.comments).toHaveLength(1);
    expect(a.json.thread.comments[0]).toMatchObject({ text: 'First', by: { username: 'ann', name: 'Ann A' } });
    expect((await add('Second')).json.thread.n).toBe(2);
    const list = await h.call('GET', `/api/projects/${id}/comments`, { user: ann });
    expect(list.json.threads.map((t: any) => t.n)).toEqual([1, 2]);
    expect(list.json.people).toEqual([{ username: 'ann', name: 'Ann A' }]);
  });

  it('refuses empty or oversized text and anchors that point nowhere', async () => {
    expect((await add('   ')).status).toBe(400);
    expect((await add('x'.repeat(2001))).status).toBe(400);
    const r = await h.call('POST', `/api/projects/${id}/comments`, { user: ann, json: { anchor: { artboardId: 'ab1', x: 'a', y: 1 }, text: 'hi' } });
    expect(r.status).toBe(400);
  });

  it('replies, edits, and deletes a reply', async () => {
    const t = (await add()).json.thread;
    const r = await h.call('POST', `/api/projects/${id}/comments/${t.id}/replies`, { user: pat, json: { text: 'On it' } });
    expect(r.json.thread.comments.map((c: any) => c.text)).toEqual(['Check this', 'On it']);
    const mid = r.json.thread.comments[1].id;
    const e = await h.call('PATCH', `/api/projects/${id}/comments/${t.id}/messages/${mid}`, { user: pat, json: { text: 'Done' } });
    expect(e.json.thread.comments[1]).toMatchObject({ text: 'Done' });
    expect(e.json.thread.comments[1].edited).toBeTruthy();
    const d = await h.call('DELETE', `/api/projects/${id}/comments/${t.id}/messages/${mid}`, { user: pat });
    expect(d.json.thread.comments).toHaveLength(1);
  });

  it('resolves, reopens and hands a thread to someone', async () => {
    const t = (await add()).json.thread;
    const res = await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { status: 'resolved' } });
    expect(res.json.thread).toMatchObject({ status: 'resolved', resolved: { by: { username: 'ann' } } });
    const again = await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { status: 'open', assignee: { username: 'bob', name: 'Bob B' } } });
    expect(again.json.thread).toMatchObject({ status: 'open', resolved: null, assignee: { username: 'bob', name: 'Bob B' } });
    expect((await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { status: 'later' } })).status).toBe(400);
    expect((await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { assignee: { username: 'no spaces' } } })).status).toBe(400);
    expect((await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { assignee: null } })).json.thread.assignee).toBeNull();
  });

  it('deletes a whole thread with its replies', async () => {
    const t = (await add()).json.thread;
    await h.call('POST', `/api/projects/${id}/comments/${t.id}/replies`, { user: ann, json: { text: 'More' } });
    expect(h.db.comments.docs).toHaveLength(2);
    expect((await h.call('DELETE', `/api/projects/${id}/comments/${t.id}`, { user: ann })).json).toEqual({ ok: true });
    expect(h.db.comments.docs).toHaveLength(0);
    expect((await h.call('DELETE', `/api/projects/${id}/comments/${t.id}`, { user: ann })).status).toBe(404);
  });

  it('keeps other people out once the box enforces sessions, but lets a power user in', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', `/api/projects/${id}/comments`, { user: bob })).status).toBe(403);
    expect((await h.call('GET', `/api/projects/${id}/comments`, { user: pat })).status).toBe(200);
  });

  it('keeps comments out of the project document and the projects list rows', async () => {
    await add();
    const loaded = await h.call('GET', `/api/projects/${id}`, { user: ann });
    expect(JSON.stringify(loaded.json.project)).not.toMatch(/Check this/);
    expect(JSON.stringify(h.db.projects.docs[0].doc)).not.toMatch(/Check this/);
  });

  it('does not take comments along when a project is duplicated, and deletes them with the project', async () => {
    await add();
    const dup = await h.call('POST', `/api/projects/${id}/duplicate`, { user: ann, json: {} });
    expect(h.db.comments.docs.every((d) => d.project === id)).toBe(true);
    expect((await h.call('GET', `/api/projects/${dup.json.id}/comments`, { user: ann })).json.threads).toEqual([]);
    await h.call('DELETE', `/api/projects/${id}`, { user: ann });
    expect(h.db.comments.docs).toHaveLength(0);
  });
});

describe('counts on the projects list', () => {
  it('counts open comments, and the ones assigned to you', async () => {
    const a = (await add('One')).json.thread;
    await add('Two');
    await h.call('PATCH', `/api/projects/${id}/comments/${a.id}`, { user: ann, json: { assignee: { username: 'ann', name: 'Ann A' } } });
    const done = (await add('Three')).json.thread;
    await h.call('PATCH', `/api/projects/${id}/comments/${done.id}`, { user: ann, json: { status: 'resolved' } });
    const row = (await h.call('GET', '/api/projects', { user: ann })).json.find((p: any) => p.id === id);
    expect(row).toMatchObject({ openComments: 2, assignedComments: 1 });
  });

  it('is zero for a project nobody has commented on, and survives mongo failing', async () => {
    expect((await h.call('GET', '/api/projects', { user: ann })).json[0]).toMatchObject({ openComments: 0, assignedComments: 0 });
    h.db.comments.failNext.find = new Error('down');
    const r = await h.call('GET', '/api/projects', { user: ann });
    expect(r.status).toBe(200);
    expect(r.json[0].openComments).toBe(0);
  });
});

describe('the review link', () => {
  it('is off until the owner turns it on, and off again when they turn it off', async () => {
    expect((await h.call('GET', `/api/projects/${id}/review`, { user: ann })).json.review).toBeNull();
    expect((await rv('nopenopenopenopenope', 'GET', '', ann)).status).toBe(404);
    const token = await reviewOn();
    expect(token).toMatch(/^[\w-]{20,}$/);
    expect(await reviewOn(true)).toBe(token);
    const r = await rv(token, 'GET', '', ann);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id, name: `Project ${id}`, guests: true, me: { username: 'ann' } });
    expect(r.json.project.artboards[0].id).toBe('ab1');
    await h.call('DELETE', `/api/projects/${id}/review`, { user: ann });
    expect((await rv(token, 'GET', '', ann)).status).toBe(404);
  });

  it('only the owner (or a power user) can turn it on', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('PUT', `/api/projects/${id}/review`, { user: bob, json: {} })).status).toBe(403);
  });

  it('asks for a sign in when the link does not allow guests', async () => {
    const token = await reviewOn(false);
    const r = await rv(token, 'GET', '', null);
    expect(r.status).toBe(401);
    expect(r.json.signin).toBe(true);
    expect((await rv(token, 'GET', '', bob)).status).toBe(200);
  });

  it('lets a signed in reviewer comment under their own name, resolve, but not assign', async () => {
    const token = await reviewOn(false);
    const c = await rv(token, 'POST', '/comments', bob, { anchor, text: 'Typo in the title', guestName: 'Mallory' });
    expect(c.json.thread.comments[0].by).toEqual({ username: 'bob', userID: 1, name: 'Bob B' });
    const tid = c.json.thread.id;
    expect((await rv(token, 'PATCH', `/comments/${tid}`, bob, { status: 'resolved' })).json.thread.status).toBe('resolved');
    expect((await rv(token, 'PATCH', `/comments/${tid}`, bob, { assignee: { username: 'ann', name: 'Ann' } })).status).toBe(403);
    expect((await rv(token, 'POST', `/comments/${tid}/replies`, cat, { text: 'Agreed' })).json.thread.comments).toHaveLength(2);
  });

  it('only lets a reviewer edit or delete their own, while the owner can do any', async () => {
    const token = await reviewOn(false);
    const t = (await rv(token, 'POST', '/comments', bob, { anchor, text: 'Mine' })).json.thread;
    const mid = t.comments[0].id;
    expect((await rv(token, 'PATCH', `/comments/${t.id}/messages/${mid}`, cat, { text: 'Hijack' })).status).toBe(403);
    expect((await rv(token, 'PATCH', `/comments/${t.id}/messages/${mid}`, bob, { text: 'Mine, edited' })).status).toBe(200);
    expect((await rv(token, 'DELETE', `/comments/${t.id}`, cat)).status).toBe(403);
    expect((await rv(token, 'DELETE', `/comments/${t.id}`, ann)).status).toBe(200);
  });

  it('serves a project asset by the link and nothing it does not have', async () => {
    const token = await reviewOn(false);
    await h.call('PUT', `/api/projects/${id}/assets/asset0001`, { user: ann, body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: 'image/png' });
    const r = await rv(token, 'GET', '/assets/asset0001', bob);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/image\/png/);
    expect((await rv(token, 'GET', '/assets/nothing01', bob)).status).toBe(404);
    expect((await rv(token, 'GET', '/assets/..%2Fx', bob)).status).toBe(400);
  });
});

describe('guests', () => {
  it('need a display name, and are labelled as guests', async () => {
    const token = await reviewOn(true);
    expect((await rv(token, 'POST', '/comments', null, { anchor, text: 'Hi' })).status).toBe(400);
    expect((await rv(token, 'POST', '/comments', null, { anchor, text: 'Hi', guestName: 'x' })).status).toBe(400);
    const c = await rv(token, 'POST', '/comments', null, { anchor, text: 'Hi', guestName: '  Dr  Who  <b>' });
    expect(c.status).toBe(200);
    expect(c.json.thread.comments[0].by).toEqual({ name: 'Dr Who b', guest: true });
  });

  it('cannot resolve, assign or mention, and the owner cannot be impersonated by a username in the body', async () => {
    const token = await reviewOn(true);
    const t = (await rv(token, 'POST', '/comments', null, { anchor, text: 'Hi', guestName: 'Zed', mentions: ['ann'], by: { username: 'ann' }, assignee: { username: 'ann', name: 'Ann' } })).json.thread;
    expect(t.comments[0].mentions).toEqual([]);
    expect(t.comments[0].by).toEqual({ name: 'Zed', guest: true });
    expect(t.assignee).toBeNull();
    expect((await rv(token, 'PATCH', `/comments/${t.id}`, null, { status: 'resolved', guestName: 'Zed' })).status).toBe(403);
    expect((await rv(token, 'DELETE', `/comments/${t.id}`, null)).status).toBeGreaterThanOrEqual(400);
    expect(h.db.comments.docs).toHaveLength(1);
    expect(h.db['comment-notices'].docs).toHaveLength(0);
  });

  it('are rate limited per address, and the limit is not theirs to dodge with another name', async () => {
    const token = await reviewOn(true);
    let last = 200;
    for (let i = 0; i < 12; i++) last = (await h.call('POST', `/review/${token}/comments`, { headers: { 'x-forwarded-for': '9.9.9.9' }, json: { anchor, text: `Note ${i}`, guestName: `Guest ${i}` } })).status;
    expect(last).toBe(429);
    expect(h.db.comments.docs.length).toBe(10);
    //somebody signed in is not held to the guests' ceiling
    expect((await rv(token, 'POST', '/comments', bob, { anchor, text: 'Still fine' })).status).toBe(200);
  });

  it('are counted per link too, so a spread of addresses stops at the link ceiling', async () => {
    const token = await reviewOn(true);
    let ok = 0;
    for (let i = 0; i < 70; i++) {
      const r = await h.call('POST', `/review/${token}/comments`, { headers: { 'x-forwarded-for': `10.0.${Math.floor(i / 250)}.${i}` }, json: { anchor, text: `n${i}`, guestName: 'Many' } });
      if (r.status === 200) ok++;
    }
    expect(ok).toBe(60);
  });

  it('are shut out when the link is turned off while they watch', async () => {
    const token = await reviewOn(true);
    const s = await h.stream(`/review/${token}/live`);
    streams.push(s);
    await s.waitFor((e) => e.event === 'hello');
    await h.call('DELETE', `/api/projects/${id}/review`, { user: ann });
    expect((await rv(token, 'POST', '/comments', null, { anchor, text: 'Late', guestName: 'Zed' })).status).toBe(404);
  });
});

describe('limits', () => {
  it('stops a thread at its reply cap', async () => {
    const t = (await add()).json.thread;
    h.db.comments.docs.push(...Array.from({ length: 199 }, (_, i) => ({ _id: `cm${String(i).padStart(18, '0')}`, project: id, thread: t.id, root: false, by: { name: 'x' }, text: 'r', created: new Date() })));
    expect((await h.call('POST', `/api/projects/${id}/comments/${t.id}/replies`, { user: ann, json: { text: 'too many' } })).status).toBe(409);
  });

  it('answers 404 for a thread in another project', async () => {
    const t = (await add()).json.thread;
    const other = `prcomm9${n}`;
    await h.call('PUT', `/api/projects/${other}`, { user: ann, json: { project: project(other), rev: 0 } });
    expect((await h.call('POST', `/api/projects/${other}/comments/${t.id}/replies`, { user: ann, json: { text: 'Hi' } })).status).toBe(404);
    expect((await h.call('PATCH', `/api/projects/${other}/comments/${t.id}`, { user: ann, json: { status: 'resolved' } })).status).toBe(404);
  });
});

describe('notices', () => {
  it('tells the assignee and the people mentioned, never the author', async () => {
    const t = (await add('Look', ann, { mentions: ['bob', 'ann'], assignee: { username: 'cat', name: 'Cat C' } })).json.thread;
    const notices = h.db['comment-notices'].docs.map((d) => [d.user, d.kind]).sort();
    expect(notices).toEqual([['bob', 'mention'], ['cat', 'assigned']]);
    const mine = await h.call('GET', '/api/notices', { user: bob });
    expect(mine.json.unread).toBe(1);
    expect(mine.json.items[0]).toMatchObject({ project: id, thread: t.id, kind: 'mention', by: 'Ann A', text: 'Look' });
    expect((await h.call('GET', '/api/notices', { user: pat })).json).toEqual({ unread: 0, items: [] });
    await h.call('POST', '/api/notices/read', { user: bob, json: {} });
    expect((await h.call('GET', '/api/notices', { user: bob })).json.unread).toBe(0);
    expect((await h.call('GET', '/api/notices', { user: cat })).json.unread).toBe(1);
  });

  it('tells everyone in a thread about a reply, and the new assignee when it is handed on', async () => {
    const t = (await add()).json.thread;
    const token = await reviewOn(false);
    await rv(token, 'POST', `/comments/${t.id}/replies`, bob, { text: 'Hello' });
    expect(h.db['comment-notices'].docs.map((d) => [d.user, d.kind])).toEqual([['ann', 'reply']]);
    await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { assignee: { username: 'bob', name: 'Bob B' } } });
    expect(h.db['comment-notices'].docs.map((d) => [d.user, d.kind])).toContainEqual(['bob', 'assigned']);
  });

  it('respects a person switching notices off', async () => {
    await h.call('PUT', '/api/prefs', { user: bob, json: { prefs: { commentNotices: false } } });
    await add('Look', ann, { mentions: ['bob'] });
    expect(h.db['comment-notices'].docs).toHaveLength(0);
  });

  it('goes with the thread when it is deleted', async () => {
    const t = (await add('Look', ann, { mentions: ['bob'] })).json.thread;
    await h.call('DELETE', `/api/projects/${id}/comments/${t.id}`, { user: ann });
    expect(h.db['comment-notices'].docs).toHaveLength(0);
  });
});

describe('live updates', () => {
  it('reaches the editor and the review page when anyone comments, resolves or deletes', async () => {
    const token = await reviewOn(false);
    const editor = await h.stream(`/api/projects/${id}/comments/live`, { user: ann });
    const reviewer = await h.stream(`/review/${token}/live`, { user: bob });
    streams.push(editor, reviewer);
    await editor.waitFor((e) => e.event === 'hello');
    await reviewer.waitFor((e) => e.event === 'hello');
    const t = (await rv(token, 'POST', '/comments', bob, { anchor, text: 'From review' })).json.thread;
    const seen = await editor.waitFor((e) => e.event === 'thread');
    expect(seen.data.thread.id).toBe(t.id);
    expect(seen.data.by).toBe('Bob B');
    await reviewer.waitFor((e) => e.event === 'thread');
    await h.call('PATCH', `/api/projects/${id}/comments/${t.id}`, { user: ann, json: { status: 'resolved' } });
    await reviewer.waitFor((e) => e.event === 'thread' && e.data.thread.status === 'resolved');
    await h.call('DELETE', `/api/projects/${id}/comments/${t.id}`, { user: ann });
    await editor.waitFor((e) => e.event === 'gone' && e.data.id === t.id);
  });

  it('tells the stream who a write was for, so the page can toast', async () => {
    const editor = await h.stream(`/api/projects/${id}/comments/live`, { user: bob });
    streams.push(editor);
    await editor.waitFor((e) => e.event === 'hello');
    await add('Look', ann, { assignee: { username: 'bob', name: 'Bob B' } });
    const e = await editor.waitFor((x) => x.event === 'thread');
    expect(e.data.notify).toEqual([{ user: 'bob', kind: 'assigned' }]);
  });

  it('is refused to people who may not open the project', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    await expect(h.stream(`/api/projects/${id}/comments/live`, { user: bob })).rejects.toMatchObject({ status: 403 });
  });
});
