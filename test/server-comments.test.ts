// @vitest-environment node
//Review comments against the real index.js and the fake mongo: the editor's routes, the review link and its sign in,
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
const reviewOn = async () => (await h.call('PUT', `/api/projects/${id}/review`, { user: ann, json: {} })).json.review.token as string;
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
    expect(h.db.comments.docs.length).toBeGreaterThan(0);
    await h.call('DELETE', `/api/bin/${id}`, { user: ann });
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
    expect(await reviewOn()).toBe(token);
    const r = await rv(token, 'GET', '', ann);
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id, name: `Project ${id}`, me: { username: 'ann' } });
    expect(r.json.guests).toBeUndefined();
    expect(r.json.project.artboards[0].id).toBe('ab1');
    await h.call('DELETE', `/api/projects/${id}/review`, { user: ann });
    expect((await rv(token, 'GET', '', ann)).status).toBe(404);
  });

  it('only the owner (or a power user) can turn it on', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('PUT', `/api/projects/${id}/review`, { user: bob, json: {} })).status).toBe(403);
  });

  it('wants a signed in session on every route, whether or not the box enforces sessions', async () => {
    const token = await reviewOn();
    for (const enforce of ['', '1']) {
      process.env.SUITE_SESSION_ENFORCE = enforce;
      for (const [method, path] of [['GET', ''], ['GET', '/assets/asset0001'], ['GET', '/live'], ['POST', '/comments'], ['PATCH', '/comments/cm1'], ['DELETE', '/comments/cm1']]) {
        const r = await rv(token, method, path, null, method === 'POST' ? { anchor, text: 'Hi', guestName: 'Zed' } : undefined);
        expect([method, path, r.status, r.json.signin]).toEqual([method, path, 401, true]);
      }
    }
    expect(h.db.comments.docs).toHaveLength(0);
    expect((await rv(token, 'GET', '', bob)).status).toBe(200);
  });

  it('no longer takes guests: the option is ignored, an old link that had it still asks for a sign in, and a typed name is no identity', async () => {
    const put = await h.call('PUT', `/api/projects/${id}/review`, { user: ann, json: { guests: true } });
    expect(put.json.review.guests).toBeUndefined();
    const token = put.json.review.token as string;
    //a link made before the change still carries guests: true
    const row = h.db.projects.docs.find((d) => d._id === id) as { review: Record<string, unknown> };
    row.review.guests = true;
    expect((await h.call('GET', `/api/projects/${id}/review`, { user: ann })).json.review.guests).toBeUndefined();
    expect((await rv(token, 'GET', '', null)).status).toBe(401);
    expect((await rv(token, 'POST', '/comments', null, { anchor, text: 'Hi', guestName: 'Dr Who' })).status).toBe(401);
    const c = await rv(token, 'POST', '/comments', bob, { anchor, text: 'Hi', guestName: 'Dr Who', by: { username: 'ann' } });
    expect(c.json.thread.comments[0].by).toEqual({ username: 'bob', userID: 1, name: 'Bob B' });
    //the next time the owner saves the link the flag is gone for good
    await h.call('PUT', `/api/projects/${id}/review`, { user: ann, json: {} });
    expect((h.db.projects.docs.find((d) => d._id === id) as { review: Record<string, unknown> }).review.guests).toBeUndefined();
  });

  it('takes the direct sign in of the review tool, or the editor one, and nothing issued for another tool', async () => {
    const token = await reviewOn();
    const via = (tool: string) => h.call('GET', `/review/${token}`, { user: bob, headers: { 'x-test-tool': tool } });
    expect((await via('interactives-review')).status).toBe(200);
    expect((await via('interactives')).status).toBe(200);
    const other = await via('media-catalogue');
    expect(other.status).toBe(401);
    expect(other.json.signin).toBe(true);
  });

  it('lets a signed in reviewer comment under their own name, resolve, but not assign', async () => {
    const token = await reviewOn();
    const c = await rv(token, 'POST', '/comments', bob, { anchor, text: 'Typo in the title', guestName: 'Mallory' });
    expect(c.json.thread.comments[0].by).toEqual({ username: 'bob', userID: 1, name: 'Bob B' });
    const tid = c.json.thread.id;
    expect((await rv(token, 'PATCH', `/comments/${tid}`, bob, { status: 'resolved' })).json.thread.status).toBe('resolved');
    expect((await rv(token, 'PATCH', `/comments/${tid}`, bob, { assignee: { username: 'ann', name: 'Ann' } })).status).toBe(403);
    expect((await rv(token, 'POST', `/comments/${tid}/replies`, cat, { text: 'Agreed' })).json.thread.comments).toHaveLength(2);
  });

  it('only lets a reviewer edit or delete their own, while the owner can do any', async () => {
    const token = await reviewOn();
    const t = (await rv(token, 'POST', '/comments', bob, { anchor, text: 'Mine' })).json.thread;
    const mid = t.comments[0].id;
    expect((await rv(token, 'PATCH', `/comments/${t.id}/messages/${mid}`, cat, { text: 'Hijack' })).status).toBe(403);
    expect((await rv(token, 'PATCH', `/comments/${t.id}/messages/${mid}`, bob, { text: 'Mine, edited' })).status).toBe(200);
    expect((await rv(token, 'DELETE', `/comments/${t.id}`, cat)).status).toBe(403);
    expect((await rv(token, 'DELETE', `/comments/${t.id}`, ann)).status).toBe(200);
  });

  it('serves a project asset by the link and nothing it does not have', async () => {
    const token = await reviewOn();
    await h.call('PUT', `/api/projects/${id}/assets/asset0001`, { user: ann, body: Buffer.from([0x89, 0x50, 0x4e, 0x47]), type: 'image/png' });
    const r = await rv(token, 'GET', '/assets/asset0001', bob);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/image\/png/);
    expect((await rv(token, 'GET', '/assets/nothing01', bob)).status).toBe(404);
    expect((await rv(token, 'GET', '/assets/..%2Fx', bob)).status).toBe(400);
  });
});

describe('reviewers', () => {
  it('are held to a ceiling per person, and one reviewer hitting it does not stop another', async () => {
    const token = await reviewOn();
    //its own person, the window is shared by the whole file and would otherwise cost the other tests their turn
    const chatty: User = { username: 'chatty', fullName: 'Chatty C' };
    let last = 200;
    for (let i = 0; i < 62; i++) last = (await rv(token, 'POST', '/comments', chatty, { anchor, text: `Note ${i}` })).status;
    expect(last).toBe(429);
    expect((await rv(token, 'POST', '/comments', cat, { anchor, text: 'Still fine' })).status).toBe(200);
  });

  it('are shut out when the link is turned off while they watch', async () => {
    const token = await reviewOn();
    const s = await h.stream(`/review/${token}/live`, { user: bob });
    streams.push(s);
    await s.waitFor((e) => e.event === 'hello');
    await h.call('DELETE', `/api/projects/${id}/review`, { user: ann });
    expect((await rv(token, 'POST', '/comments', bob, { anchor, text: 'Late' })).status).toBe(404);
  });

  it('see an earlier guest comment with its label, and cannot answer it as the guest', async () => {
    const token = await reviewOn();
    h.db.comments.docs.push({ _id: 'cmguest01', project: id, thread: 'cmguest01', root: true, n: 1, by: { name: 'Zed', guest: true }, text: 'From before', mentions: [], anchor, context: {}, status: 'open', created: new Date(), updated: new Date() });
    const r = await rv(token, 'GET', '', bob);
    expect(r.json.threads[0].comments[0].by).toEqual({ name: 'Zed', guest: true });
    expect(r.json.people.some((p: { name: string }) => p.name === 'Zed')).toBe(false);
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
    const token = await reviewOn();
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
    const token = await reviewOn();
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
