// @vitest-environment node
//index.js again, the routes that touch the disk or history: assets, thumbnails, share links, revision history and
//restore (with its pruning), and component libraries (publish, versions, sharing, assets).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann' };
const bob: User = { username: 'bob' };
const pat: User = { username: 'pat', power: true };

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 100, height: 100, children: [] }],
  ...extra,
});

let h: Harness;
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
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries]) c.docs = [];
  for (const f of fs.readdirSync(h.storage)) fs.rmSync(path.join(h.storage, f), { recursive: true, force: true });
});

const put = (id: string, p: unknown = project(id), user: User | null = ann, extra: Record<string, unknown> = {}) => h.call('PUT', `/api/projects/${id}`, { user, json: { project: p, rev: 0, ...extra } });
const asset = (id: string, aid: string, bytes: Buffer, mime: string, user: User | null = ann) => h.call('PUT', `/api/projects/${id}/assets/${aid}`, { user, body: bytes, type: mime });

describe('assets', () => {
  beforeEach(async () => {
    await put('prasset001');
  });

  it('round trips bytes with their type, sizes and long immutable caching', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect((await asset('prasset001', 'img0000001', bytes, 'image/png')).json).toEqual({ ok: true, size: 7 });
    const r = await h.call('GET', '/api/projects/prasset001/assets/img0000001', { user: ann });
    expect(r.bytes).toEqual(bytes);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(r.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('never serves an upload that could be a page as one', async () => {
    await asset('prasset001', 'page000001', Buffer.from('<script>alert(1)</script>'), 'text/html');
    const r = await h.call('GET', '/api/projects/prasset001/assets/page000001', { user: ann });
    expect(r.headers.get('content-type')).not.toMatch(/text\/html/);
    expect(r.headers.get('content-disposition') || r.headers.get('content-security-policy')).toBeTruthy();
  });

  it('lists the assets with mime and size, skipping a half-written sidecar', async () => {
    await asset('prasset001', 'a000000001', Buffer.from('abc'), 'text/csv');
    await asset('prasset001', 'a000000002', Buffer.from('12345'), 'image/png');
    fs.writeFileSync(path.join(h.storage, 'prasset001', 'broken0001.json'), '{"mime":');
    const r = await h.call('GET', '/api/projects/prasset001/assets', { user: ann });
    expect(r.json.sort((a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id))).toEqual([
      { id: 'a000000001', mime: 'text/csv', size: 3 },
      { id: 'a000000002', mime: 'image/png', size: 5 },
    ]);
  });

  it('lists nothing for a project with no assets', async () => {
    expect((await h.call('GET', '/api/projects/prasset001/assets', { user: ann })).json).toEqual([]);
  });

  it('deletes one asset and its sidecar, leaving the rest', async () => {
    await asset('prasset001', 'a000000001', Buffer.from('abc'), 'text/csv');
    await asset('prasset001', 'a000000002', Buffer.from('abc'), 'text/csv');
    await h.call('DELETE', '/api/projects/prasset001/assets/a000000001', { user: ann });
    expect(fs.existsSync(path.join(h.storage, 'prasset001', 'a000000001'))).toBe(false);
    expect(fs.existsSync(path.join(h.storage, 'prasset001', 'a000000001.json'))).toBe(false);
    expect(fs.existsSync(path.join(h.storage, 'prasset001', 'a000000002'))).toBe(true);
    expect((await h.call('GET', '/api/projects/prasset001/assets/a000000001', { user: ann })).status).toBe(404);
  });

  it('keeps an overlong content type to 100 characters and defaults a missing one', async () => {
    await asset('prasset001', 'a000000003', Buffer.from('x'), `text/plain;${'x'.repeat(200)}`);
    const meta = JSON.parse(fs.readFileSync(path.join(h.storage, 'prasset001', 'a000000003.json'), 'utf8'));
    expect(meta.mime.length).toBe(100);
  });

  it('refuses bad ids, a missing project and someone else\'s project', async () => {
    expect((await h.call('GET', '/api/projects/prasset001/assets/bad', { user: ann })).status).toBe(400);
    expect((await h.call('GET', '/api/projects/prasset001/assets/a.b.c.d.e', { user: ann })).status).toBe(400);
    expect((await h.call('GET', '/api/projects/prmissing01/assets', { user: ann })).status).toBe(404);
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await asset('prasset001', 'a000000009', Buffer.from('x'), 'text/plain', bob)).status).toBe(403);
    expect(fs.existsSync(path.join(h.storage, 'prasset001', 'a000000009'))).toBe(false);
  });

  it('404s an asset that was never uploaded', async () => {
    expect((await h.call('GET', '/api/projects/prasset001/assets/nothere001', { user: ann })).status).toBe(404);
  });
});

describe('thumbnails', () => {
  beforeEach(async () => {
    await put('prthumb001');
  });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1]);

  it('stores a jpeg, stamps the project with its time and serves it back with long caching', async () => {
    const r = await h.call('PUT', '/api/projects/prthumb001/thumbnail', { user: ann, body: jpeg, type: 'image/jpeg' });
    expect(r.json.ok).toBe(true);
    expect(typeof r.json.thumb).toBe('number');
    expect((await h.call('GET', '/api/projects', { user: ann })).json[0].thumb).toBe(r.json.thumb);
    const got = await h.call('GET', '/api/projects/prthumb001/thumbnail', { user: ann });
    expect(got.bytes).toEqual(jpeg);
    expect(got.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
  });

  it.each([
    ['a png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2])],
    ['an empty body', Buffer.alloc(0)],
    ['3 bytes', Buffer.from([0xff, 0xd8, 0xff])],
    ['html', Buffer.from('<html></html>')],
  ])('refuses %s', async (_n, body) => {
    const r = await h.call('PUT', '/api/projects/prthumb001/thumbnail', { user: ann, body, type: 'image/jpeg' });
    expect(r.status).toBe(400);
    expect(fs.existsSync(path.join(h.storage, 'thumbs', 'prthumb001.jpg'))).toBe(false);
  });

  it('404s for a missing project or thumbnail, and 403s someone else when enforcing', async () => {
    expect((await h.call('PUT', '/api/projects/prnone0001/thumbnail', { user: ann, body: jpeg, type: 'image/jpeg' })).status).toBe(404);
    expect((await h.call('GET', '/api/projects/prthumb001/thumbnail', { user: ann })).status).toBe(404);
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('PUT', '/api/projects/prthumb001/thumbnail', { user: bob, body: jpeg, type: 'image/jpeg' })).status).toBe(403);
  });

  it('refuses an upload over 2mb', async () => {
    const big = Buffer.concat([jpeg, Buffer.alloc(3 * 1024 * 1024)]);
    expect((await h.call('PUT', '/api/projects/prthumb001/thumbnail', { user: ann, body: big, type: 'image/jpeg' })).status).toBe(413);
  });
});

describe('share links', () => {
  const html = '<!doctype html><html><body>hi</body></html>';
  beforeEach(async () => {
    await put('prshare001');
  });
  const share = (body: string, user: User | null = ann) => h.call('PUT', '/api/projects/prshare001/share', { user, body, type: 'text/plain' });

  it('is off until the owner turns it on, then hands out an unguessable url-safe token', async () => {
    expect((await h.call('GET', '/api/projects/prshare001/share', { user: ann })).json).toEqual({ share: null });
    const r = await share(html);
    expect(r.json.share.token).toMatch(/^[\w-]{24}$/);
    expect(r.json.share.by.username).toBe('ann');
    expect((await h.call('GET', '/api/projects/prshare001/share', { user: ann })).json.share.token).toBe(r.json.share.token);
  });

  it('serves the page to anyone without a session, sandboxed and not indexed', async () => {
    const token = (await share(html)).json.share.token;
    const r = await h.call('GET', `/s/${token}`);
    expect(r.status).toBe(200);
    expect(r.text).toBe(html);
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(r.headers.get('content-security-policy')).toMatch(/sandbox/);
  });

  it('keeps the same token and creation time when the page is re-shared, but takes the new content', async () => {
    const first = (await share(html)).json.share;
    const second = (await share(`${html}<!--v2-->`)).json.share;
    expect(second.token).toBe(first.token);
    expect(second.created).toBe(first.created);
    expect((await h.call('GET', `/s/${first.token}`)).text).toContain('v2');
  });

  it('refuses anything that is not a page', async () => {
    expect((await share('just text')).status).toBe(400);
    expect((await share('')).status).toBe(400);
    expect(h.db.projects.docs[0].share).toBeUndefined();
  });

  it('turning it off deletes the file, the token and the link', async () => {
    const token = (await share(html)).json.share.token;
    expect((await h.call('DELETE', '/api/projects/prshare001/share', { user: ann })).json).toEqual({ ok: true });
    expect((await h.call('GET', `/s/${token}`)).status).toBe(404);
    expect(h.db.projects.docs[0].share).toBeUndefined();
    //and a fresh share gets a different token
    expect((await share(html)).json.share.token).not.toBe(token);
  });

  it.each(['short', '../etc/passwd', 'a'.repeat(65), 'has space aaaaaaaaaaaaaaaa', 'bad.chars.aaaaaaaaaaaaaaaa'])('answers 404 for the malformed token %s', async (t) => {
    expect((await h.call('GET', `/s/${encodeURIComponent(t)}`)).status).toBe(404);
  });

  it('answers 404 for a well-formed token nobody holds', async () => {
    const r = await h.call('GET', `/s/${'a'.repeat(24)}`);
    expect(r.status).toBe(404);
    expect(r.text).toMatch(/turned off/);
  });

  it('only the owner (or a power user) can change sharing when enforced', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await share(html, bob)).status).toBe(403);
    expect((await share(html, pat)).status).toBe(200);
    expect((await h.call('DELETE', '/api/projects/prshare001/share', { user: bob })).status).toBe(403);
  });

  it('404s a project that does not exist and quietly succeeds deleting its share', async () => {
    expect((await h.call('PUT', '/api/projects/prnone0001/share', { user: ann, body: html, type: 'text/plain' })).status).toBe(404);
    expect((await h.call('DELETE', '/api/projects/prnone0001/share', { user: ann })).json).toEqual({ ok: true });
  });
});

describe('revision history', () => {
  //the server remembers when it last snapshotted a project, so every test gets a project of its own
  let n = 0;
  let id = '';
  const revs = () => h.db.revisions.docs.filter((r) => r.project === id);
  beforeEach(() => {
    id = `prhist${String(++n).padStart(4, '0')}`;
  });

  it('records a revision when a project is created, but not for every save inside five minutes', async () => {
    await put(id);
    await vi.waitFor(() => expect(revs()).toHaveLength(1));
    expect(revs()[0]).toMatchObject({ reason: 'Created', rev: 1, by: { username: 'ann' } });
    await put(id, project(id, { name: 'two' }), ann, { rev: 1 });
    await put(id, project(id, { name: 'three' }), ann, { rev: 2 });
    await new Promise((r) => setTimeout(r, 30));
    expect(revs()).toHaveLength(1);
  });

  it('after a server restart it reads the newest revision from mongo to decide whether five minutes have passed', async () => {
    const seed = (age: number) => {
      h.db.projects.docs.push({ _id: id, name: 'x', doc: JSON.stringify(project(id)), rev: 1, owner: { username: 'ann' } });
      h.db.revisions.docs.push({ _id: 'seed00000001', project: id, created: new Date(Date.now() - age), rev: 1, by: null, reason: 'Autosave', size: 1, doc: '{}' });
    };
    seed(60 * 1000);
    await put(id, project(id, { name: 'a' }), ann, { rev: 1 });
    await new Promise((r) => setTimeout(r, 30));
    expect(revs()).toHaveLength(1);

    //a different project whose newest revision is old: that save is kept
    id = `prhist${String(++n).padStart(4, '0')}`;
    seed(6 * 60 * 1000);
    await put(id, project(id, { name: 'b' }), ann, { rev: 1 });
    await vi.waitFor(() => expect(revs()).toHaveLength(2));
    expect(revs().map((r) => r.reason)).toContain('Autosave');
  });

  it('lists revisions newest first without documents, and loads one', async () => {
    await put(id);
    await vi.waitFor(() => expect(revs()).toHaveLength(1));
    h.db.revisions.docs.push({ _id: 'zz000000000a', project: id, created: new Date(Date.now() + 5000), rev: 7, by: { username: 'bob' }, reason: 'Autosave', size: 3, doc: JSON.stringify(project(id, { name: 'old' })) });
    const list = (await h.call('GET', `/api/projects/${id}/revisions`, { user: ann })).json;
    expect(list.map((r: { id: string }) => r.id)[0]).toBe('zz000000000a');
    expect(list[0]).toEqual({ id: 'zz000000000a', created: expect.any(String), rev: 7, by: { username: 'bob' }, reason: 'Autosave', size: 3, name: null, pinned: false });
    const one = await h.call('GET', `/api/projects/${id}/revisions/zz000000000a`, { user: ann });
    expect(one.json.project.name).toBe('old');
    expect(one.json.rev).toBe(7);
  });

  it('refuses malformed revision ids, unknown ones, and ones from another project', async () => {
    const other = `${id}x`;
    await put(id);
    await put(other);
    await vi.waitFor(() => expect(h.db.revisions.docs).toHaveLength(2));
    const otherRev = h.db.revisions.docs.find((r) => r.project === other)!._id;
    for (const bad of ['short', 'UPPERCASEUPPERCASE', 'a'.repeat(31), '../etc/passwd']) expect((await h.call('GET', `/api/projects/${id}/revisions/${encodeURIComponent(bad)}`, { user: ann })).status, bad).toBe(400);
    expect((await h.call('GET', `/api/projects/${id}/revisions/aaaaaaaaaaaa`, { user: ann })).status).toBe(404);
    expect((await h.call('GET', `/api/projects/${id}/revisions/${otherRev}`, { user: ann })).status).toBe(404);
    expect((await h.call('POST', `/api/projects/${id}/revisions/${otherRev}/restore`, { user: ann })).status).toBe(404);
  });

  it('restores an old revision under this project\'s id, bumps the rev, and keeps what was there so the restore can be undone', async () => {
    await put(id, project(id, { name: 'current' }));
    await vi.waitFor(() => expect(revs()).toHaveLength(1));
    h.db.revisions.docs.push({ _id: 'aa000000000a', project: id, created: new Date(Date.now() - 1000), rev: 1, by: null, reason: 'Autosave', size: 1, doc: JSON.stringify(project('prrenamed01', { name: 'old name' })) });
    const r = await h.call('POST', `/api/projects/${id}/revisions/aa000000000a/restore`, { user: ann });
    expect(r.json).toEqual({ ok: true, rev: 2 });
    const doc = h.db.projects.docs.find((d) => d._id === id)!;
    expect(doc.rev).toBe(2);
    expect(doc.name).toBe('old name');
    expect(JSON.parse(doc.doc).id).toBe(id);
    const before = revs().find((x) => x.reason === 'Before restore')!;
    expect(before).toBeTruthy();
    expect(JSON.parse(before.doc).name).toBe('current');
    expect(before.by.username).toBe('ann');
  });

  it('keeps only the newest 100 revisions', async () => {
    await put(id);
    await vi.waitFor(() => expect(revs()).toHaveLength(1));
    const base = Date.now() - 10 * 60 * 1000;
    for (let i = 0; i < 110; i++) h.db.revisions.docs.push({ _id: `old${String(i).padStart(9, '0')}`, project: id, created: new Date(base + i), rev: i, by: null, reason: 'Autosave', size: 1, doc: JSON.stringify(project(id)) });
    h.db.revisions.docs.push({ _id: 'other0000001', project: 'prother0001', created: new Date(0), rev: 1, by: null, reason: 'Autosave', size: 1, doc: '{}' });
    await h.call('POST', `/api/projects/${id}/revisions/old000000100/restore`, { user: ann });
    expect(revs()).toHaveLength(100);
    //the oldest went, the newest stayed, and another project's history is not touched
    expect(revs().some((r) => r._id === 'old000000000')).toBe(false);
    expect(revs().some((r) => r.reason === 'Before restore')).toBe(true);
    expect(h.db.revisions.docs.some((r) => r._id === 'other0000001')).toBe(true);
    expect((await h.call('GET', `/api/projects/${id}/revisions`, { user: ann })).json.length).toBe(100);
  });
});

describe('component libraries', () => {
  const lib = (id: string, extra: Record<string, unknown> = {}) =>
    project(id, {
      name: `Lib ${id}`,
      settings: { library: true },
      assets: [{ id: 'logo000001', name: 'logo', mime: 'image/png' }, { id: 'unused0001', name: 'x', mime: 'image/png' }],
      artboards: [
        { id: 'btn', name: 'Button', width: 100, height: 40, publish: true, children: [{ id: 'img1', type: 'image', assetId: 'logo000001' }] },
        { id: 'private', name: 'Private', width: 10, height: 10, children: [] },
      ],
      ...extra,
    });
  const publish = (id: string, user: User | null = ann, note?: string) => h.call('POST', `/api/projects/${id}/library/publish`, { user, json: { note } });

  beforeEach(async () => {
    await put('prlib00001', lib('prlib00001'));
    await asset('prlib00001', 'logo000001', Buffer.from('PNGDATA'), 'image/png');
    await asset('prlib00001', 'unused0001', Buffer.from('UNUSED'), 'image/png');
  });

  it('publishes version 1 with its components, the assets they use, and not what they do not', async () => {
    const r = await publish('prlib00001', ann, 'first');
    expect(r.json).toEqual({ ok: true, unchanged: false, version: 1, components: 1 });
    const meta = (await h.call('GET', '/api/projects/prlib00001/library', { user: ann })).json.library;
    expect(meta).toMatchObject({ id: 'prlib00001', version: 1, note: 'first', mine: true, shared: { everyone: false, users: [] } });
    expect(meta.components.map((c: { id: string }) => c.id)).toEqual(['btn']);
    expect(meta.history).toHaveLength(1);
    const dir = path.join(h.storage, '_libraries', 'prlib00001');
    expect(fs.readdirSync(dir).sort()).toEqual(['logo000001', 'logo000001.json']);
    //a published project knows its version
    expect((await h.call('GET', '/api/projects', { user: ann })).json[0]).toMatchObject({ isLibrary: true, libraryVersion: 1 });
  });

  it('makes no new version when nothing changed, and one when something did', async () => {
    await publish('prlib00001');
    expect((await publish('prlib00001')).json).toMatchObject({ unchanged: true, version: 1 });
    const changed = lib('prlib00001');
    changed.artboards[0].width = 120;
    await h.call('PUT', '/api/projects/prlib00001', { user: ann, json: { project: changed, rev: 1 } });
    expect((await publish('prlib00001')).json).toMatchObject({ unchanged: false, version: 2 });
    const meta = (await h.call('GET', '/api/projects/prlib00001/library', { user: ann })).json.library;
    expect(meta.history.map((x: { version: number }) => x.version)).toEqual([2, 1]);
  });

  it('refuses a project that is not marked as a library, or has nothing marked for publishing', async () => {
    await put('prlib00002', project('prlib00002'));
    expect((await publish('prlib00002')).status).toBe(400);
    await put('prlib00003', project('prlib00003', { settings: { library: true } }));
    const r = await publish('prlib00003');
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/Publish to library/);
  });

  it('drops the files of assets a later version no longer uses', async () => {
    await publish('prlib00001');
    const changed = lib('prlib00001', { artboards: [{ id: 'btn', name: 'Button', width: 100, height: 40, publish: true, children: [] }] });
    await h.call('PUT', '/api/projects/prlib00001', { user: ann, json: { project: changed, rev: 1 } });
    await publish('prlib00001');
    expect(fs.readdirSync(path.join(h.storage, '_libraries', 'prlib00001'))).toEqual([]);
  });

  it('serves the snapshot and its assets to the owner, and the list to people it is shared with', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    await publish('prlib00001');
    const one = (await h.call('GET', '/api/libraries/prlib00001', { user: ann })).json;
    expect(one.snapshot.artboards[0].id).toBe('btn');
    expect(one.library.version).toBe(1);
    const a = await h.call('GET', '/api/libraries/prlib00001/assets/logo000001', { user: ann });
    expect(a.text).toBe('PNGDATA');
    expect(a.headers.get('content-type')).toBe('image/png');

    //bob sees nothing, and cannot fetch it
    expect((await h.call('GET', '/api/libraries', { user: bob })).json).toEqual([]);
    expect((await h.call('GET', '/api/libraries/prlib00001', { user: bob })).status).toBe(403);
    expect((await h.call('GET', '/api/libraries/prlib00001/assets/logo000001', { user: bob })).status).toBe(403);
  });

  it('shares with named users or everyone, cleaning the list, and only the owner sees who it is shared with', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    await publish('prlib00001');
    const r = await h.call('PUT', '/api/projects/prlib00001/library/share', { user: ann, json: { everyone: false, users: ['bob', ' bob ', 'bad name', '', 5, 'x'.repeat(81)] } });
    expect(r.json.shared).toEqual({ everyone: false, users: ['bob'] });
    const seen = (await h.call('GET', '/api/libraries', { user: bob })).json;
    expect(seen).toHaveLength(1);
    expect(seen[0].mine).toBe(false);
    expect(seen[0].shared).toBeUndefined();
    expect((await h.call('GET', '/api/libraries/prlib00001', { user: bob })).status).toBe(200);
    //still cannot change it
    expect((await h.call('PUT', '/api/projects/prlib00001/library/share', { user: bob, json: { everyone: true } })).status).toBe(403);
    expect((await h.call('POST', '/api/projects/prlib00001/library/publish', { user: bob })).status).toBe(403);

    await h.call('PUT', '/api/projects/prlib00001/library/share', { user: ann, json: { everyone: true } });
    expect((await h.call('GET', '/api/libraries', { user: pat })).json).toHaveLength(1);
    expect((await h.call('GET', '/api/libraries', { user: { username: 'cy' } })).json).toHaveLength(1);
  });

  it('makes you publish before you share', async () => {
    const r = await h.call('PUT', '/api/projects/prlib00001/library/share', { user: ann, json: { everyone: true } });
    expect(r.status).toBe(409);
  });

  it('is open to everyone with no session until sessions are enforced, and closed after', async () => {
    await publish('prlib00001');
    expect((await h.call('GET', '/api/libraries')).json).toHaveLength(1);
    expect((await h.call('GET', '/api/libraries/prlib00001')).status).toBe(200);
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/libraries')).json).toEqual([]);
    expect((await h.call('GET', '/api/libraries/prlib00001')).status).toBe(403);
  });

  it('stops publishing: the library, its files and the project\'s version go, the project stays', async () => {
    await publish('prlib00001');
    expect((await h.call('DELETE', '/api/projects/prlib00001/library', { user: ann })).json).toEqual({ ok: true });
    expect(h.db.libraries.docs).toHaveLength(0);
    expect(fs.existsSync(path.join(h.storage, '_libraries', 'prlib00001'))).toBe(false);
    expect(h.db.projects.docs[0].library).toBeUndefined();
    expect((await h.call('GET', '/api/projects/prlib00001/library', { user: ann })).json).toEqual({ library: null });
    expect((await h.call('GET', '/api/libraries/prlib00001', { user: ann })).status).toBe(404);
  });

  it('refuses bad library ids', async () => {
    expect((await h.call('GET', '/api/libraries/bad', { user: ann })).status).toBe(400);
    expect((await h.call('GET', '/api/libraries/prlib00001/assets/bad', { user: ann })).status).toBe(400);
    expect((await h.call('GET', '/api/libraries/prlib00001/assets/logo000001', { user: ann })).status).toBe(404);
  });
});

describe('health', () => {
  it('says yes with mongo reachable and storage writable, without a session', async () => {
    const r = await h.call('GET', '/health', { user: null });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, app: 'interactives', mongo: { ok: true }, storage: { ok: true } });
    expect(r.json.version).toBe(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version);
  });

  it('answers 503 when mongo fails', async () => {
    h.db.projects.failNext.findOne = new Error('connection refused');
    const r = await h.call('GET', '/health', { user: null });
    expect(r.status).toBe(503);
    expect(r.json.mongo).toMatchObject({ ok: false, error: 'connection refused' });
  });
});

describe('duplicate files', () => {
  it('finds files with the same bytes, and turns the dropped copies into links to the kept one', async () => {
    const id = 'prdup00001';
    await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } });
    for (const [a, body] of [['assetAAAA1111', 'same bytes'], ['assetBBBB2222', 'same bytes'], ['assetCCCC3333', 'different']] as const) {
      await h.call('PUT', `/api/projects/${id}/assets/${a}`, { user: ann, body: Buffer.from(body), type: 'image/png' });
    }
    const g = (await h.call('GET', `/api/projects/${id}/assets/duplicates`, { user: ann })).json.groups;
    expect(g).toHaveLength(1);
    expect(g[0].ids.sort()).toEqual(['assetAAAA1111', 'assetBBBB2222']);
    const r = (await h.call('POST', `/api/projects/${id}/assets/dedupe`, { user: ann, json: { plan: [{ keep: 'assetAAAA1111', drop: ['assetBBBB2222', 'assetCCCC3333'] }] } })).json;
    //the one with different bytes is left alone
    expect(r).toMatchObject({ ok: true, linked: 1, freed: 10 });
    const st = (a: string) => fs.statSync(path.join(h.storage, id, a));
    expect(st('assetBBBB2222').ino).toBe(st('assetAAAA1111').ino);
    expect(st('assetCCCC3333').ino).not.toBe(st('assetAAAA1111').ino);
    //the old id still serves the bytes
    expect((await h.call('GET', `/api/projects/${id}/assets/assetBBBB2222`, { user: ann })).text).toBe('same bytes');
  });
});
