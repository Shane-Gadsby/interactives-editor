// @vitest-environment node
//index.js, brand kits: who may mark, publish and withdraw one (power users, with the box refusing only once it enforces sessions),
//what the library list says, and what a template made from a project that carries a kit says about it.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness, type User } from './helpers/server-harness';
import { brandKitsOf } from '../shared/template.mjs';
import { mayMarkBrand } from '../shared/library.mjs';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob' };
const pat: User = { username: 'pat', power: true };

const kit = (id: string, extra: Record<string, unknown> = {}) => ({
  format: 'interactives',
  id,
  name: `Kit ${id}`,
  settings: { library: true },
  artboards: [{ id: 'hdr', name: 'Header', width: 400, height: 60, publish: true, brandPlace: 'top', children: [{ id: 't1', type: 'text', name: 'Line', text: 'Hi', brandEditable: true }] }],
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
  for (const c of [h.db.projects, h.db.revisions, h.db.prefs, h.db.libraries, h.db.templates]) c.docs = [];
  for (const f of fs.readdirSync(h.storage)) fs.rmSync(path.join(h.storage, f), { recursive: true, force: true });
});

const put = (id: string, p: unknown, user: User | null = ann) => h.call('PUT', `/api/projects/${id}`, { user, json: { project: p, rev: 0 } });
const publish = (id: string, user: User | null = ann) => h.call('POST', `/api/projects/${id}/library/publish`, { user, json: {} });
const mark = (id: string, brand: boolean, user: User | null = ann) => h.call('PUT', `/api/projects/${id}/library/brand`, { user, json: { brand } });

describe('who looks after brand kits', () => {
  it('is a power user, or someone in the named group', () => {
    expect(mayMarkBrand(['admin'], true, undefined)).toBe(true);
    expect(mayMarkBrand(['staff'], false, undefined)).toBe(false);
    expect(mayMarkBrand(['staff', 'brand-team'], false, 'brand-team')).toBe(true);
    expect(mayMarkBrand(['staff'], false, 'brand-team')).toBe(false);
    //no group set, or a blank one, never matches anything
    expect(mayMarkBrand(['', 'x'], false, '')).toBe(false);
    expect(mayMarkBrand(undefined, false, 'brand-team')).toBe(false);
    expect(mayMarkBrand({ power: false }, false, 'brand-team')).toBe(false);
  });

  it('tells the editor in the session', async () => {
    expect((await h.call('GET', '/api/session', { user: pat })).json.brand).toBe(true);
    expect((await h.call('GET', '/api/session', { user: ann })).json.brand).toBe(false);
  });
});

describe('marking a library as a brand kit', () => {
  beforeEach(async () => {
    await put('prkit00001', kit('prkit00001'));
    await publish('prkit00001');
  });

  it('is for power users once the box enforces sessions, and the library says so', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    const no = await mark('prkit00001', true, ann);
    expect(no.status).toBe(403);
    expect((await h.call('GET', '/api/projects/prkit00001/library', { user: ann })).json.library.brand).toBe(false);

    //a power user may, on somebody else's project too
    const yes = await mark('prkit00001', true, pat);
    expect(yes.json).toEqual({ brand: true });
    expect((await h.call('GET', '/api/projects/prkit00001/library', { user: ann })).json.library.brand).toBe(true);
    const listed = (await h.call('GET', '/api/libraries', { user: ann })).json;
    expect(listed.find((l: { id: string }) => l.id === 'prkit00001').brand).toBe(true);

    expect((await mark('prkit00001', false, pat)).json).toEqual({ brand: false });
  });

  it('only logs a refusal until the box enforces, like everything else', async () => {
    expect((await mark('prkit00001', true, ann)).status).toBe(200);
    expect(console.warn).toHaveBeenCalled();
  });

  it('needs a published library', async () => {
    await put('prnot00001', kit('prnot00001'));
    expect((await mark('prnot00001', true, pat)).status).toBe(409);
  });

  it('keeps the owner from publishing a new version or withdrawing the kit, but not a power user', async () => {
    await mark('prkit00001', true, pat);
    process.env.SUITE_SESSION_ENFORCE = '1';
    const changed = kit('prkit00001', { artboards: [{ id: 'hdr', name: 'Header', width: 500, height: 60, publish: true, children: [] }] });
    await h.call('PUT', '/api/projects/prkit00001', { user: ann, json: { project: changed, rev: 1 } });
    expect((await publish('prkit00001', ann)).status).toBe(403);
    expect((await h.call('DELETE', '/api/projects/prkit00001/library', { user: ann })).status).toBe(403);
    expect((await publish('prkit00001', pat)).json).toMatchObject({ ok: true, version: 2 });
    expect((await h.call('DELETE', '/api/projects/prkit00001/library', { user: pat })).status).toBe(200);
  });

  it('leaves an ordinary library alone', async () => {
    await put('prlib00002', kit('prlib00002'));
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await publish('prlib00002', ann)).status).toBe(200);
    expect((await h.call('DELETE', '/api/projects/prlib00002/library', { user: ann })).status).toBe(200);
  });

  it('keeps the placement and editable text marks in the snapshot', async () => {
    await h.call('PUT', '/api/projects/prkit00001/library/share', { user: ann, json: { everyone: true } });
    const full = (await h.call('GET', '/api/libraries/prkit00001', { user: bob })).json.snapshot;
    expect(full.artboards[0].brandPlace).toBe('top');
    expect(full.artboards[0].children[0].brandEditable).toBe(true);
  });
});

describe('a template made from a project with a brand kit', () => {
  const branded = (id: string) => ({
    format: 'interactives',
    id,
    name: 'Branded',
    settings: {},
    libraries: [{ id: 'prkit00001', name: 'UniSQ brand', version: 1, brand: { colors: ['#112233'], fonts: ['inter'] } }, { id: 'prlib00002', name: 'Icons', version: 1 }],
    artboards: [
      { id: 'ab1', name: 'Main', width: 800, height: 600, children: [{ id: 'i1', type: 'instance', artboardId: 'lib1' }] },
      { id: 'lib1', name: 'Header', width: 400, height: 60, canvasHidden: true, library: { libraryId: 'prkit00001', componentId: 'hdr', version: 1, hash: 'x', brand: true }, children: [] },
    ],
  });

  it('lists the kits it starts with, only the brand ones', () => {
    expect(brandKitsOf(branded('x'))).toEqual([{ id: 'prkit00001', name: 'UniSQ brand' }]);
    expect(brandKitsOf({})).toEqual([]);
    expect(brandKitsOf({ libraries: [{ id: 5, brand: {} }, null] })).toEqual([]);
  });

  it('says so on the saved template, and a copy keeps the kit and its lock', async () => {
    await put('prbrand001', branded('prbrand001'));
    const saved = await h.call('POST', '/api/projects/prbrand001/template', { user: ann, json: { name: 'Branded quiz', everyone: true } });
    expect(saved.status).toBe(200);
    const meta = (await h.call('GET', '/api/templates', { user: bob })).json[0];
    expect(meta.brand).toEqual([{ id: 'prkit00001', name: 'UniSQ brand' }]);

    const made = await h.call('POST', `/api/templates/${saved.json.id}/use`, { user: bob, json: {} });
    const copy = (await h.call('GET', `/api/projects/${made.json.id}`, { user: bob })).json;
    const doc = copy.project ?? copy;
    expect(doc.libraries[0].brand).toEqual({ colors: ['#112233'], fonts: ['inter'] });
    expect(doc.artboards.find((a: { id: string }) => a.id === 'lib1').library.brand).toBe(true);
  });

  it('has an empty list when the project has no kit', async () => {
    await put('prplain001', { format: 'interactives', id: 'prplain001', name: 'Plain', settings: {}, artboards: [{ id: 'ab1', name: 'Main', width: 10, height: 10, children: [] }] });
    await h.call('POST', '/api/projects/prplain001/template', { user: ann, json: { name: 'Plain' } });
    expect((await h.call('GET', '/api/templates', { user: ann })).json[0].brand).toEqual([]);
  });
});
