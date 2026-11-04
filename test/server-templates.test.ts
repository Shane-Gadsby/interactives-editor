// @vitest-environment node
//index.js, the template routes: Save as template (versions, the checklist, visibility, files and thumbnail), Use template
//(a new project with the baseline and a fresh checklist), who may do what, and Allow remix on a share link (the learner
//page's button and the copy it makes).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness, type User } from './helpers/server-harness';
import { baselineOf } from '../shared/template.mjs';
// @ts-expect-error jsdom ships no types here
import { JSDOM } from 'jsdom';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob', fullName: 'Bob B' };
const pat: User = { username: 'pat', power: true };

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  variables: [{ id: 'v1', name: 'score', type: 'number', initial: 0 }],
  assets: [{ id: 'img0000001', name: 'pic.png', mime: 'image/png' }],
  artboards: [
    {
      id: 'ab1',
      name: 'Main',
      width: 800,
      height: 600,
      background: { type: 'solid', color: '#abcdef' },
      timelines: [],
      logic: { nodes: [{ id: 'ln1', kind: 'event.start', x: 0, y: 0, params: {} }], edges: [] },
      children: [{ id: 'n1', type: 'text', name: 'Title', text: 'Question here', children: undefined }, { id: 'n2', type: 'frame', name: 'Box', children: [{ id: 'n3', type: 'rect', name: 'Inner' }] }],
    },
  ],
  ...extra,
});

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db.templates]) c.docs = [];
  for (const f of fs.readdirSync(h.storage)) fs.rmSync(path.join(h.storage, f), { recursive: true, force: true });
});

const put = (id: string, p: unknown = project(id), user: User | null = ann) => h.call('PUT', `/api/projects/${id}`, { user, json: { project: p, rev: 0 } });
const asset = (id: string, aid: string, bytes: Buffer, mime: string, user: User | null = ann) => h.call('PUT', `/api/projects/${id}/assets/${aid}`, { user, body: bytes, type: mime });
const save = (id: string, body: Record<string, unknown> = {}, user: User | null = ann) => h.call('POST', `/api/projects/${id}/template`, { user, json: { name: 'Quiz', ...body } });

describe('save as template', () => {
  beforeEach(async () => {
    await put('prtpl00001');
  });

  it('stores a snapshot with the title, description and a cleaned checklist, as version 1', async () => {
    const r = await save('prtpl00001', {
      name: '  A   quiz  ',
      description: 'A short quiz\r\nwith a note',
      checklist: [{ text: 'Replace the question text', artboardId: 'ab1', nodeId: 'n1' }, { text: '   ' }, { text: 'Change the colours', nodeId: 'bad id!' }],
    });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, unchanged: false, version: 1 });
    const t = h.db.templates.docs[0];
    expect(t).toMatchObject({ name: 'A quiz', description: 'A short quiz\nwith a note', version: 1, source: 'prtpl00001', owner: { username: 'ann' }, shared: { everyone: false }, artboards: 1 });
    expect(t.checklist).toHaveLength(2);
    expect(t.checklist[0]).toMatchObject({ text: 'Replace the question text', artboardId: 'ab1', nodeId: 'n1' });
    expect(t.checklist[0].id).toMatch(/^ck/);
    expect(t.checklist[1]).toEqual({ id: expect.stringMatching(/^ck/), text: 'Change the colours' });
    expect(JSON.parse(t.snapshot).artboards[0].children[0].id).toBe('n1');
    expect(t.preview).toEqual({ width: 800, height: 600, background: '#abcdef' });
  });

  it('copies the files the project uses, and its thumbnail', async () => {
    await asset('prtpl00001', 'img0000001', Buffer.from('PNGDATA'), 'image/png');
    await asset('prtpl00001', 'stray00001', Buffer.from('unused'), 'image/png');
    await h.call('PUT', '/api/projects/prtpl00001/thumbnail', { user: ann, body: jpeg, type: 'image/jpeg' });
    const id = (await save('prtpl00001')).json.id;
    const dir = path.join(h.storage, '_templates', id);
    expect(fs.readFileSync(path.join(dir, 'img0000001'), 'utf8')).toBe('PNGDATA');
    expect(fs.existsSync(path.join(dir, 'stray00001'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'thumb.jpg'))).toBe(true);
    const a = await h.call('GET', `/api/templates/${id}/assets/img0000001`, { user: ann });
    expect(a.status).toBe(200);
    expect(a.text).toBe('PNGDATA');
    expect((await h.call('GET', `/api/templates/${id}/thumbnail`, { user: ann })).bytes.equals(jpeg)).toBe(true);
  });

  it('takes the live room\'s copy of the project, not the saved one', async () => {
    const stream = await h.stream('/api/projects/prtpl00001/live?clientId=c1', { user: ann });
    await stream.waitFor((e) => e.event === 'hello');
    await h.call('POST', '/api/projects/prtpl00001/ops', { user: ann, json: { clientId: 'c1', baseSeq: 0, ops: [{ t: 'set', p: ['artboards', { i: 'ab1' }, 'children', { i: 'n1' }, 'text'], v: 'Edited live' }] } });
    const id = (await save('prtpl00001')).json.id;
    expect(JSON.parse(h.db.templates.docs.find((d) => d._id === id)!.snapshot).artboards[0].children[0].text).toBe('Edited live');
    stream.close();
  });

  it('saving again with the template id makes the next version only when something changed', async () => {
    const id = (await save('prtpl00001')).json.id;
    const same = await save('prtpl00001', { templateId: id, description: 'now with words' });
    expect(same.json).toMatchObject({ id, unchanged: true, version: 1 });
    expect(h.db.templates.docs).toHaveLength(1);
    expect(h.db.templates.docs[0].description).toBe('now with words');
    const p = project('prtpl00001');
    (p.artboards[0].children[0] as any).text = 'Changed';
    await h.call('PUT', '/api/projects/prtpl00001', { user: ann, json: { project: p, rev: 1 } });
    const next = await save('prtpl00001', { templateId: id, note: 'reworded' });
    expect(next.json).toMatchObject({ id, unchanged: false, version: 2 });
    expect(h.db.templates.docs[0].history.map((x: any) => x.version)).toEqual([2, 1]);
    expect(h.db.templates.docs[0].history[0].note).toBe('reworded');
  });

  it('leaves the project\'s own template link out of the snapshot', async () => {
    const p = project('prtpl00001', { template: { id: 'tpold00001', name: 'Old', version: 3, base: { 'n:n1': 'x' }, checklist: [] } });
    await h.call('PUT', '/api/projects/prtpl00001', { user: ann, json: { project: p, rev: 1 } });
    const id = (await save('prtpl00001')).json.id;
    expect(JSON.parse(h.db.templates.docs.find((d) => d._id === id)!.snapshot).template).toBeUndefined();
  });

  it('refuses someone else\'s project, and someone else\'s template', async () => {
    expect((await save('prtpl00001', {}, bob)).status).toBe(200); // not enforcing: logged only
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await save('prtpl00001', {}, bob)).status).toBe(403);
    const id = h.db.templates.docs[0]._id;
    await put('prtpl00002', project('prtpl00002'), bob);
    expect((await save('prtpl00002', { templateId: id }, bob)).status).toBe(403);
    expect((await save('prtpl00002', { templateId: 'nonexist001' }, bob)).status).toBe(404);
    expect((await save('prtpl00002', { templateId: '../x' }, bob)).status).toBe(400);
  });

  it('answers 404 for a project that does not exist', async () => {
    expect((await save('prnone0001')).status).toBe(404);
  });
});

describe('the Templates tab list', () => {
  it('shows mine, and the ones shared with everyone, to the right people', async () => {
    await put('prlist00001');
    await put('prlist00002', project('prlist00002'), bob);
    const mineId = (await save('prlist00001', { name: 'Mine only' })).json.id;
    const sharedId = (await save('prlist00001', { name: 'For all', everyone: true })).json.id;
    expect(mineId).not.toBe(sharedId);
    const bobs = (await h.call('GET', '/api/templates', { user: bob })).json;
    expect(bobs.map((t: any) => t.name)).toEqual(['For all']);
    expect(bobs[0]).toMatchObject({ mine: false, everyone: true });
    expect(bobs[0].source).toBeUndefined();
    expect(bobs[0].snapshot).toBeUndefined();
    const anns = (await h.call('GET', '/api/templates', { user: ann })).json;
    expect(anns.map((t: any) => t.name).sort()).toEqual(['For all', 'Mine only']);
    expect(anns.every((t: any) => t.mine)).toBe(true);
  });

  it('one template: details without the snapshot, with it only when asked', async () => {
    await put('prlist00001');
    const id = (await save('prlist00001', { everyone: true })).json.id;
    const light = (await h.call('GET', `/api/templates/${id}`, { user: bob })).json;
    expect(light.template.name).toBe('Quiz');
    expect(light.snapshot).toBeUndefined();
    const full = (await h.call('GET', `/api/templates/${id}?full=1`, { user: bob })).json;
    expect(full.snapshot.artboards[0].id).toBe('ab1');
  });

  it('a private template is not served to others when the box enforces sessions', async () => {
    await put('prlist00001');
    const id = (await save('prlist00001')).json.id;
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', `/api/templates/${id}`, { user: bob })).status).toBe(403);
    expect((await h.call('GET', `/api/templates/${id}/thumbnail`, { user: bob })).status).toBe(403);
    expect((await h.call('POST', `/api/templates/${id}/use`, { user: bob, json: {} })).status).toBe(403);
    expect((await h.call('GET', '/api/templates')).json).toEqual([]);
    expect((await h.call('GET', `/api/templates/${id}`, { user: ann })).status).toBe(200);
  });

  it('bad and unknown ids', async () => {
    expect((await h.call('GET', '/api/templates/_templates', { user: ann })).status).toBe(400);
    expect((await h.call('GET', '/api/templates/tpmissing01', { user: ann })).status).toBe(404);
  });
});

describe('change and delete', () => {
  let id: string;
  beforeEach(async () => {
    await put('prchg00001');
    id = (await save('prchg00001')).json.id;
  });

  it('the owner edits the title, description, checklist and who sees it', async () => {
    const r = await h.call('PUT', `/api/templates/${id}`, { user: ann, json: { name: 'Renamed', description: 'd', everyone: true, checklist: [{ text: 'One' }] } });
    expect(r.json).toMatchObject({ name: 'Renamed', description: 'd', everyone: true });
    expect(r.json.checklist).toHaveLength(1);
    const kept = await h.call('PUT', `/api/templates/${id}`, { user: ann, json: { everyone: false } });
    expect(kept.json.name).toBe('Renamed');
    expect(kept.json.everyone).toBe(false);
  });

  it('only the owner or a power user changes or deletes it (when enforcing)', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    await h.call('PUT', `/api/templates/${id}`, { user: ann, json: { everyone: true } });
    expect((await h.call('PUT', `/api/templates/${id}`, { user: bob, json: { name: 'x' } })).status).toBe(403);
    expect((await h.call('DELETE', `/api/templates/${id}`, { user: bob })).status).toBe(403);
    expect((await h.call('PUT', `/api/templates/${id}`, { user: pat, json: { name: 'by pat' } })).status).toBe(200);
    expect((await h.call('DELETE', `/api/templates/${id}`, { user: ann })).status).toBe(200);
    expect(h.db.templates.docs).toHaveLength(0);
    expect(fs.existsSync(path.join(h.storage, '_templates', id))).toBe(false);
    expect((await h.call('DELETE', `/api/templates/${id}`, { user: ann })).json).toEqual({ ok: true });
  });

  it('deleting the project that made it leaves the template alone', async () => {
    await h.call('DELETE', '/api/projects/prchg00001', { user: ann });
    expect(h.db.templates.docs).toHaveLength(1);
  });
});

describe('use template', () => {
  let id: string;
  beforeEach(async () => {
    await put('pruse00001', project('pruse00001'));
    await asset('pruse00001', 'img0000001', Buffer.from('PNGDATA'), 'image/png');
    await h.call('PUT', '/api/projects/pruse00001/thumbnail', { user: ann, body: jpeg, type: 'image/jpeg' });
    id = (await save('pruse00001', { name: 'Quiz starter', everyone: true, checklist: [{ text: 'Replace the question text', artboardId: 'ab1', nodeId: 'n1' }] })).json.id;
  });

  it('makes a new project for the person, with the files, the thumbnail, the baseline and an unticked checklist', async () => {
    const r = await h.call('POST', `/api/templates/${id}/use`, { user: bob, json: { folder: 'Week 1' } });
    expect(r.status).toBe(200);
    const newId = r.json.id as string;
    expect(newId).toMatch(/^pr/);
    expect(newId).not.toBe('pruse00001');
    const doc = h.db.projects.docs.find((d) => d._id === newId)!;
    expect(doc).toMatchObject({ name: 'Quiz starter', owner: { username: 'bob' }, folder: 'Week 1', rev: 1, tags: [] });
    expect(doc.thumb).toBeTruthy();
    const p = JSON.parse(doc.doc);
    expect(p.id).toBe(newId);
    expect(p.artboards[0].children[0].id).toBe('n1');
    expect(p.template).toMatchObject({ id, name: 'Quiz starter', version: 1 });
    expect(p.template.checklist).toEqual([{ id: expect.stringMatching(/^ck/), text: 'Replace the question text', artboardId: 'ab1', nodeId: 'n1', done: false }]);
    const { template: _t, ...plain } = p;
    expect(p.template.base).toEqual(baselineOf(plain));
    expect(Object.keys(p.template.base).sort()).toEqual(['a:ab1', 'g:ln1', 'n:n1', 'n:n2', 'n:n3', 'v:v1']);
    expect(fs.readFileSync(path.join(h.storage, newId, 'img0000001'), 'utf8')).toBe('PNGDATA');
    expect(fs.existsSync(path.join(h.storage, 'thumbs', `${newId}.jpg`))).toBe(true);
    expect(fs.existsSync(path.join(h.storage, newId, 'thumb.jpg'))).toBe(false);
    // the person can open and save it like any project of theirs
    expect((await h.call('GET', `/api/projects/${newId}`, { user: bob })).json.project.template.version).toBe(1);
    expect((await h.call('GET', '/api/projects', { user: bob })).json.map((x: any) => x.id)).toContain(newId);
  });

  it('is a copy: changing it does not touch the template or its source', async () => {
    const newId = (await h.call('POST', `/api/templates/${id}/use`, { user: bob, json: {} })).json.id;
    await h.call('DELETE', `/api/projects/${newId}`, { user: bob });
    expect(fs.existsSync(path.join(h.storage, '_templates', id, 'img0000001'))).toBe(true);
    expect(h.db.templates.docs).toHaveLength(1);
  });

  it('a name can be given, a folder is optional and cleaned', async () => {
    const r = await h.call('POST', `/api/templates/${id}/use`, { user: bob, json: { name: 'My week 3 quiz', folder: '   ' } });
    expect(h.db.projects.docs.find((d) => d._id === r.json.id)).toMatchObject({ name: 'My week 3 quiz', folder: null });
  });

  it('after a new version, using it gives the new version', async () => {
    const p = project('pruse00001');
    (p.artboards[0].children[0] as any).text = 'v2 text';
    await h.call('PUT', '/api/projects/pruse00001', { user: ann, json: { project: p, rev: 1 } });
    await save('pruse00001', { templateId: id });
    const newId = (await h.call('POST', `/api/templates/${id}/use`, { user: bob, json: {} })).json.id;
    const made = JSON.parse(h.db.projects.docs.find((d) => d._id === newId)!.doc);
    expect(made.template.version).toBe(2);
    expect(made.artboards[0].children[0].text).toBe('v2 text');
  });
});

describe('allow remix', () => {
  let token: string;
  beforeEach(async () => {
    await put('prrmx00001');
    await asset('prrmx00001', 'img0000001', Buffer.from('PNGDATA'), 'image/png');
    await h.call('PATCH', '/api/projects/prrmx00001/meta', { user: ann, json: { tags: ['mine'], folder: 'Private' } });
    token = (await h.call('PUT', '/api/projects/prrmx00001/share', { user: ann, body: '<html><body>shared</body></html>', type: 'text/plain' })).json.share.token;
  });

  it('is off until the owner turns it on, needs the link to exist, and survives updating the link', async () => {
    expect((await h.call('GET', '/api/projects/prrmx00001/share', { user: ann })).json.share.remix).toBe(false);
    expect((await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } })).json.share.remix).toBe(true);
    await h.call('PUT', '/api/projects/prrmx00001/share', { user: ann, body: '<html><body>newer</body></html>', type: 'text/plain' });
    expect((await h.call('GET', '/api/projects/prrmx00001/share', { user: ann })).json.share).toMatchObject({ token, remix: true });
    await h.call('DELETE', '/api/projects/prrmx00001/share', { user: ann });
    expect((await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } })).status).toBe(409);
    expect((await h.call('PATCH', '/api/projects/prnone0001/share', { user: ann, json: { remix: true } })).status).toBe(404);
  });

  it('only the owner (or a collaborator) changes the setting when enforcing', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('PATCH', '/api/projects/prrmx00001/share', { user: bob, json: { remix: true } })).status).toBe(403);
  });

  it('the learner page shows the Remix button only when it is allowed', async () => {
    expect((await h.call('GET', `/play/${token}`)).text).not.toContain('id="remix"');
    await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } });
    const page = await h.call('GET', `/play/${token}`);
    expect(page.text).toContain('id="remix"');
    expect(page.text).toContain('Remix this');
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('the button shows for a signed in person, copies on a click and then links to the copy', async () => {
    await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } });
    const html = (await h.call('GET', `/play/${token}`)).text;
    const calls: { url: string; init: any }[] = [];
    let opened = '';
    const run = (signedIn: boolean, reply: { ok: boolean; body: unknown }) => {
      const dom = new JSDOM(html, {
        runScripts: 'dangerously',
        url: 'http://localhost/interactives/play/x?sessionID=abc',
        beforeParse(win: any) {
          win.fetchActivity = (cb: (e: unknown, d?: unknown) => void) => cb(null, signedIn ? { user: { username: 'bob' }, activity: {} } : {});
          win.reportAnalytics = () => {};
          win.fetch = async (url: string, init: any) => {
            calls.push({ url, init });
            return { ok: reply.ok, json: async () => reply.body };
          };
          win.open = (u: string) => {
            opened = u;
          };
        },
      });
      return dom;
    };
    // nobody signed in: the link stays hidden
    const anon = run(false, { ok: true, body: {} });
    expect((anon.window.document.getElementById('remix') as HTMLElement).style.display).toBe('');
    // signed in: it shows, and a click copies
    const dom = run(true, { ok: true, body: { ok: true, id: 'prcopy00001' } });
    const link = dom.window.document.getElementById('remix') as HTMLAnchorElement;
    expect(link.style.display).toBe('block');
    link.click();
    await new Promise((r) => setTimeout(r, 20));
    const post = calls.find((c) => c.url.includes('/remix/'))!;
    expect(post.url).toBe(`/interactives/remix/${token}`);
    expect(post.init.method).toBe('POST');
    expect(post.init.headers['X-Session-ID']).toBe('abc');
    expect(link.textContent).toBe('Open your copy');
    expect(link.href).toContain('/interactives/#/p/prcopy00001');
    expect(opened).toContain('#/p/prcopy00001');
    // a refusal is shown, not hidden
    const bad = run(true, { ok: false, body: { error: 'The owner has not allowed remixing this project' } });
    const l2 = bad.window.document.getElementById('remix') as HTMLAnchorElement;
    l2.click();
    await new Promise((r) => setTimeout(r, 20));
    expect(l2.textContent).toContain('has not allowed');
    expect(l2.className).toBe('err');
  });

  it('refuses until allowed, then copies the project into the viewer\'s projects', async () => {
    expect((await h.call('POST', `/remix/${token}`, { user: bob })).status).toBe(403);
    await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } });
    const r = await h.call('POST', `/remix/${token}`, { user: bob });
    expect(r.status).toBe(200);
    const doc = h.db.projects.docs.find((d) => d._id === r.json.id)!;
    expect(doc).toMatchObject({ name: 'Project prrmx00001 (remix)', owner: { username: 'bob' }, rev: 1, tags: [], folder: null, remixOf: { id: 'prrmx00001', name: 'Project prrmx00001', owner: { username: 'ann' } } });
    expect(doc.share).toBeUndefined();
    expect(doc.collaborators).toBeUndefined();
    const p = JSON.parse(doc.doc);
    expect(p.id).toBe(r.json.id);
    expect(p.artboards[0].children[0].text).toBe('Question here');
    expect(fs.readFileSync(path.join(h.storage, r.json.id, 'img0000001'), 'utf8')).toBe('PNGDATA');
    expect((await h.call('GET', '/api/projects', { user: bob })).json.map((x: any) => x.id)).toContain(r.json.id);
    // the original is untouched
    expect(h.db.projects.docs.find((d) => d._id === 'prrmx00001')).toMatchObject({ owner: { username: 'ann' }, tags: ['mine'], folder: 'Private' });
  });

  it('drops the original\'s own template link, and needs a signed in person and a live link', async () => {
    const p = project('prrmx00001', { template: { id: 'tpold00001', name: 'Old', version: 1, checklist: [] } });
    expect((await h.call('PUT', '/api/projects/prrmx00001', { user: ann, json: { project: p, rev: 1 } })).status).toBe(200);
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === 'prrmx00001')!.doc).template.id).toBe('tpold00001');
    await h.call('PATCH', '/api/projects/prrmx00001/share', { user: ann, json: { remix: true } });
    const r = await h.call('POST', `/remix/${token}`, { user: bob });
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === r.json.id)!.doc).template).toBeUndefined();
    expect((await h.call('POST', `/remix/${token}`)).status).toBe(401);
    expect((await h.call('POST', '/remix/short')).status).toBe(404);
    expect((await h.call('POST', '/remix/aaaaaaaaaaaaaaaaaaaaaaaa', { user: bob })).status).toBe(404);
    await h.call('DELETE', '/api/projects/prrmx00001/share', { user: ann });
    expect((await h.call('POST', `/remix/${token}`, { user: bob })).status).toBe(404);
  });
});

describe('examples (shipped in the repo, read only)', () => {
  const repo = path.resolve(__dirname, '..', 'examples');
  const index = JSON.parse(fs.readFileSync(path.join(repo, 'index.json'), 'utf8')) as { key: string; title: string; group: string; artboards: number }[];

  it('every example in the index is complete: a project, its files, a picture and the right artboard count', () => {
    expect(index.length).toBeGreaterThanOrEqual(10);
    expect(new Set(index.map((e) => e.key)).size).toBe(index.length);
    for (const e of index) {
      const p = JSON.parse(fs.readFileSync(path.join(repo, e.key, 'project.json'), 'utf8'));
      expect(p.format, e.key).toBe('interactives');
      expect(p.artboards.length, e.key).toBe(e.artboards);
      expect(p.template, e.key).toBeUndefined();
      expect(fs.existsSync(path.join(repo, e.key, 'thumb.jpg')), `${e.key} thumbnail`).toBe(true);
      for (const a of p.assets ?? []) {
        expect(fs.existsSync(path.join(repo, e.key, 'assets', a.id)), `${e.key}/${a.id}`).toBe(true);
        expect(fs.existsSync(path.join(repo, e.key, 'assets', `${a.id}.json`)), `${e.key}/${a.id} sidecar`).toBe(true);
      }
    }
  });

  it('the list is the same for everybody, with or without a session', async () => {
    const a = (await h.call('GET', '/api/examples', { user: ann })).json;
    expect(a.map((e: any) => e.key)).toEqual(index.map((e) => e.key));
    expect((await h.call('GET', '/api/examples')).json).toEqual(a);
  });

  it('serves one example, its picture and its files; unknown or odd keys are refused', async () => {
    const withAsset = index.find((e) => JSON.parse(fs.readFileSync(path.join(repo, e.key, 'project.json'), 'utf8')).assets?.length)!;
    const one = (await h.call('GET', `/api/examples/${withAsset.key}`, { user: bob })).json;
    expect(one.example.key).toBe(withAsset.key);
    expect(one.project.artboards).toHaveLength(withAsset.artboards);
    expect((await h.call('GET', `/api/examples/${withAsset.key}/thumbnail`, { user: bob })).bytes[0]).toBe(0xff);
    const aid = one.project.assets[0].id;
    const file = await h.call('GET', `/api/examples/${withAsset.key}/assets/${aid}`, { user: bob });
    expect(file.status).toBe(200);
    expect(file.bytes.length).toBe(fs.statSync(path.join(repo, withAsset.key, 'assets', aid)).size);
    expect((await h.call('GET', '/api/examples/nope-nothing')).status).toBe(404);
    expect((await h.call('GET', '/api/examples/..%2Fpackage')).status).toBe(404);
    expect((await h.call('GET', `/api/examples/${withAsset.key}/assets/..%2Fproject.json`)).status).toBe(400);
  });

  it('there is no way to change one', async () => {
    for (const method of ['PUT', 'PATCH', 'DELETE', 'POST']) {
      const r = await h.call(method, `/api/examples/${index[0].key}`, { user: pat, json: {} });
      expect([404, 405]).toContain(r.status);
    }
    expect(fs.readFileSync(path.join(repo, index[0].key, 'project.json'), 'utf8')).toContain('"format":"interactives"');
  });

  it('using one makes a plain copy owned by the person, with its files, in their folder', async () => {
    const withAsset = index.find((e) => JSON.parse(fs.readFileSync(path.join(repo, e.key, 'project.json'), 'utf8')).assets?.length)!;
    const r = await h.call('POST', `/api/examples/${withAsset.key}/use`, { user: bob, json: { folder: 'Mine', name: 'My copy' } });
    expect(r.status).toBe(200);
    const doc = h.db.projects.docs.find((d) => d._id === r.json.id)!;
    expect(doc).toMatchObject({ name: 'My copy', folder: 'Mine', owner: { username: 'bob' }, example: withAsset.key, rev: 1 });
    const p = JSON.parse(doc.doc);
    expect(p.id).toBe(r.json.id);
    expect(p.template).toBeUndefined();
    expect(p.artboards).toHaveLength(withAsset.artboards);
    expect(fs.existsSync(path.join(h.storage, r.json.id, p.assets[0].id))).toBe(true);
    expect(fs.existsSync(path.join(h.storage, 'thumbs', `${r.json.id}.jpg`))).toBe(true);
    // the copy is theirs to change, the example is not touched
    expect((await h.call('PUT', `/api/projects/${r.json.id}`, { user: bob, json: { project: { ...p, name: 'Changed' }, rev: 1 } })).status).toBe(200);
    expect(JSON.parse(fs.readFileSync(path.join(repo, withAsset.key, 'project.json'), 'utf8')).name).not.toBe('Changed');
    expect((await h.call('POST', '/api/examples/nope/use', { user: bob, json: {} })).status).toBe(404);
  });
});
