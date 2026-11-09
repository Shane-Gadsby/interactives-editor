// @vitest-environment node
//The real index.js, run against an in-memory fake of the few mongo calls it makes (see helpers/). Covers the project
//routes: save with revisions, conflicts, who may touch what, the projects page's tags and folder, duplicate, delete,
//preferences, and the error handling around all of it.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob' };
const pat: User = { username: 'pat', power: true };

const project = (id: string, extra: Record<string, unknown> = {}) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [] }],
  ...extra,
});

let h: Harness;
let warn: MockInstance<typeof console.warn>;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  h.db.projects.docs = [];
  h.db.revisions.docs = [];
  h.db.prefs.docs = [];
  h.db.libraries.docs = [];
  h.db['projects-bin'].docs = [];
});

const put = (id: string, p: unknown, user: User | null = ann, extra: Record<string, unknown> = {}) => h.call('PUT', `/api/projects/${id}`, { user, json: { project: p, rev: 0, ...extra } });

describe('session and headers', () => {
  it('says who you are and whether you are a power user', async () => {
    expect((await h.call('GET', '/api/session', { user: ann })).json).toEqual({ user: { username: 'ann', userID: 1, name: 'Ann A' }, power: false, brand: false });
    expect((await h.call('GET', '/api/session', { user: pat })).json.power).toBe(true);
    expect((await h.call('GET', '/api/session')).json).toEqual({ user: null, power: false, brand: false });
  });

  it('never lets an api response be sniffed into a page, and never caches it', async () => {
    const r = await h.call('GET', '/api/session');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('answers unknown api routes with json, not a page', async () => {
    const r = await h.call('GET', '/api/nope');
    expect(r.status).toBe(404);
    expect(r.json.error).toMatch(/No such api route/);
  });

  it('keeps a malformed json body off the screen but still answers with the right status', async () => {
    const r = await h.call('PUT', '/api/projects/prabc12345', { body: '{not json', type: 'application/json' });
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ error: 'Something went wrong on the server' });
  });

  it('serves the not-built page or the document at the root', async () => {
    const r = await h.call('GET', '/');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/html/);
  });
});

describe('preferences', () => {
  it('starts empty and keeps only the known keys with valid values', async () => {
    expect((await h.call('GET', '/api/prefs', { user: ann })).json).toEqual({ user: 'ann', prefs: {} });
    const r = await h.call('PUT', '/api/prefs', {
      user: ann,
      json: { prefs: { wheel: 'ctrl', theme: 'purple', tooltips: 'yes', rulers: false, accessibility: false, screenReader: true, defaultFont: 'Inter', evil: 1, __proto__: { x: 1 } } },
    });
    expect(r.json).toEqual({ user: 'ann', prefs: { wheel: 'ctrl', rulers: false, accessibility: false, screenReader: true, defaultFont: 'Inter' } });
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs).toEqual({ wheel: 'ctrl', rulers: false, accessibility: false, screenReader: true, defaultFont: 'Inter' });
  });

  it('keeps the grid preferences when they are in range and drops them when not', async () => {
    const ok = await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { showGrid: true, snapGrid: true, gridSize: 16, gridSubdivisions: 4 } } });
    expect(ok.json.prefs).toEqual({ showGrid: true, snapGrid: true, gridSize: 16, gridSubdivisions: 4 });
    const bad = await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { showGrid: 'yes', snapGrid: 1, gridSize: 0, gridSubdivisions: 99 } } });
    expect(bad.json.prefs).toEqual({});
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { gridSize: 7.5 } } })).json.prefs).toEqual({});
  });

  it('keeps the snapping choices: switches as booleans, the distance as a whole number from 2 to 24', async () => {
    const snap = { snapOn: false, snapGrid: true, snapArtboard: false, snapLayers: true, snapLayersAll: true, snapGuides: false, snapSpacing: true, snapPixels: false, snapPoints: true, snapDistance: 12 };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: snap } })).json.prefs).toEqual(snap);
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { snapDistance: 1 } } })).json.prefs).toEqual({});
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { snapDistance: 25, snapOn: 'yes', snapPoints: 1 } } })).json.prefs).toEqual({});
  });

  it('keeps the code editor colours choice (follow, light or dark) and drops anything else', async () => {
    for (const codeTheme of ['follow', 'light', 'dark']) expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { codeTheme } } })).json.prefs).toEqual({ codeTheme });
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { codeTheme: 'purple' } } })).json.prefs).toEqual({});
  });

  it('keeps inspector folds as short keys to booleans, at most 300, and drops anything else', async () => {
    const folds = { Accessibility: false, count: true, ['x'.repeat(60)]: true };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { sectionFolds: folds } } })).json.prefs).toEqual({ sectionFolds: folds });
    const mixed = { ok: false, text: 'no', n: 1, nil: null, deep: {}, '': true, ['y'.repeat(61)]: true };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { sectionFolds: mixed } } })).json.prefs).toEqual({ sectionFolds: { ok: false } });
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { sectionFolds: [true] } } })).json.prefs).toEqual({});
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { sectionFolds: 'yes' } } })).json.prefs).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`s${i}`, i % 2 === 0]));
    const kept = (await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { sectionFolds: many } } })).json.prefs.sectionFolds;
    expect(Object.keys(kept)).toHaveLength(300);
    expect(kept.s0).toBe(true);
    expect(kept.s1).toBe(false);
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs.sectionFolds).toEqual(kept);
  });

  it('keeps the section and tool order as short keys to short lists of different short keys, and drops anything else', async () => {
    const order = { sectionOrder: { 'layer:rect': ['Fill', 'Stroke', 'layer-selection'], page: ['Steps'] }, toolOrder: { groups: ['draw', 'shapes'], media: ['text', 'image'] } };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: order } })).json.prefs).toEqual(order);
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs).toEqual(order);
    const mixed = { sectionOrder: { ok: ['a', 'a', 'b', 3, null, '', 'z'.repeat(81)], notAList: 'x', empty: [], '': ['a'], ['k'.repeat(61)]: ['a'] }, toolOrder: [['a']] };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: mixed } })).json.prefs).toEqual({ sectionOrder: { ok: ['a', 'b'] } });
    const many = { sectionOrder: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`p${i}`, Array.from({ length: 120 }, (_, j) => `s${j}`)])) };
    const kept = (await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: many } })).json.prefs.sectionOrder;
    expect(Object.keys(kept)).toHaveLength(60);
    expect(kept.p0).toHaveLength(80);
  });

  it('keeps saved keyboard sets (an id, a name, a base and keys), at most 16 and 10 KB each, and the one in use, and drops anything else', async () => {
    const sets = { keymapSets: [{ id: 'ks-abc', name: 'Mine', base: 'illustration', keys: { 'tool.pen': ['Q'], undo: ['Mod+Z', 'Mod+U'] } }, { id: 'ks-two', name: 'Two', base: 'default', keys: {} }], keymapActive: 'ks-abc', keymap: { 'tool.pen': ['Q'] }, keymapPreset: 'illustration' };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: sets } })).json.prefs).toEqual(sets);
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs).toEqual(sets);
    const mixed = [
      { id: 'a b', name: 'space in id', base: 'default', keys: {} },
      { id: 'ok-1', name: '  Trimmed  ', base: 'default', keys: { 'bad id!': ['A'], five: ['A', 'B', 'C', 'D', 'E'], junk: ['<script>', 7] } },
      { id: 'ok-1', name: 'same id twice', base: 'default', keys: {} },
      { id: 'nobase', name: 'x', base: 'other', keys: {} },
      { id: 'noname', name: '   ', base: 'default', keys: {} },
      { id: 'longname', name: 'n'.repeat(61), base: 'default', keys: {} },
      { id: 'array', name: 'keys as array', base: 'default', keys: ['A'] },
      { id: 'big', name: 'Too big', base: 'default', keys: Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`command.number-${i}`, ['Mod+Shift+Alt+K', 'Mod+Shift+Alt+L', 'Mod+Shift+Alt+M', 'Mod+Shift+Alt+N']])) },
      'text',
      null,
    ];
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymapSets: mixed, keymapActive: 'not an id!' } } })).json.prefs).toEqual({ keymapSets: [{ id: 'ok-1', name: 'Trimmed', base: 'default', keys: { five: ['A', 'B', 'C', 'D'], junk: [] } }] });
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymapSets: 'x', keymapActive: 7 } } })).json.prefs).toEqual({});
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, name: `Set ${i}`, base: 'default', keys: {} }));
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymapSets: many } } })).json.prefs.keymapSets).toHaveLength(16);
  });

  it('keeps each person\'s keyboard shortcuts as command ids to a few short key combos, and the one-key switch and preset', async () => {
    const keys = { keymap: { 'tool.pen': ['Shift+P'], undo: ['Mod+Z', 'Mod+U'], 'zoom-fit': ['Mod+0'] }, keymapPreset: 'illustration', singleKeys: false };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: keys } })).json.prefs).toEqual(keys);
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs).toEqual(keys);
    const mixed = { ok: ['A', 'Mod+Shift+,', 'Mod+\\'], 'bad id!': ['A'], '__proto__': ['A'], text: 'A', five: ['A', 'B', 'C', 'D', 'E'], junk: ['<script>', 'x'.repeat(30), 7, 'A b'] };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymap: mixed, keymapPreset: 'other', singleKeys: 'no' } } })).json.prefs).toEqual({ keymap: { ok: ['A', 'Mod+Shift+,', 'Mod+\\'], five: ['A', 'B', 'C', 'D'], junk: [] } });
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymap: ['A'] } } })).json.prefs).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 700 }, (_, i) => [`cmd.${i}`, ['A']]));
    expect(Object.keys((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { keymap: many } } })).json.prefs.keymap)).toHaveLength(600);
  });

  it('keeps what first-run remembers as short keys to booleans, at most 40, and the strip switch', async () => {
    const o = { 'job-shape': true, dismissed: false, welcomed: true };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { onboarding: o, gettingStarted: false } } })).json.prefs).toEqual({ onboarding: o, gettingStarted: false });
    const mixed = { ok: true, text: 'no', n: 1, '': true, ['k'.repeat(41)]: true };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { onboarding: mixed } } })).json.prefs).toEqual({ onboarding: { ok: true } });
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { onboarding: [true], gettingStarted: 'yes' } } })).json.prefs).toEqual({});
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`j${i}`, true]));
    expect(Object.keys((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { onboarding: many } } })).json.prefs.onboarding)).toHaveLength(40);
  });

  it('keeps a saved workspace that hides panels', async () => {
    const w = { id: 'w1', name: 'Mine', layout: { v: 1, zones: {}, hidden: ['scripts'], hiddenTools: ['draw'] } };
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { workspaces: [w] } } })).json.prefs.workspaces).toEqual([w]);
  });

  it('drops a default font that is too long and a body that has no prefs', async () => {
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { defaultFont: 'x'.repeat(120) } } })).json.prefs).toEqual({});
    expect((await h.call('PUT', '/api/prefs', { user: ann, json: {} })).json.prefs).toEqual({});
  });

  it('keeps each person their own, and sessionless use shares one guest set', async () => {
    await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { theme: 'dark' } } });
    await h.call('PUT', '/api/prefs', { user: bob, json: { prefs: { theme: 'light' } } });
    await h.call('PUT', '/api/prefs', { json: { prefs: { theme: 'auto' } } });
    expect((await h.call('GET', '/api/prefs', { user: ann })).json.prefs.theme).toBe('dark');
    expect((await h.call('GET', '/api/prefs', { user: bob })).json.prefs.theme).toBe('light');
    const guest = (await h.call('GET', '/api/prefs')).json;
    expect(guest).toEqual({ user: 'guest', prefs: { theme: 'auto' } });
  });

  it('refuses a body over 512kb (room for saved workspaces and keyboard sets) with the too-big message', async () => {
    const r = await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { defaultFont: 'x'.repeat(540000) } } });
    expect(r.status).toBe(413);
    expect(r.json.error).toBe('That is too big to save');
  });
});

describe('saved workspaces in preferences', () => {
  it('keeps up to 12 well-formed ones and drops the rest', async () => {
    const ok = (i: number) => ({ id: `ws${i}`, name: `W${i}`, layout: {}, widths: { left: 240, right: 320 }, bottomHeight: 260 });
    const list = [...Array.from({ length: 13 }, (_, i) => ok(i)), null, { id: 'x' }, { id: 'big', name: 'Big', layout: 'y'.repeat(9000) }];
    const r = await h.call('PUT', '/api/prefs', { user: ann, json: { prefs: { theme: 'light', workspaces: list } } });
    expect(r.status).toBe(200);
    expect(r.json.prefs.workspaces.map((w: { id: string }) => w.id)).toEqual(Array.from({ length: 12 }, (_, i) => `ws${i + 1}`));
  });
});

describe('saving projects', () => {
  it('creates a project at rev 1 with the owner, the preview and the artboard count', async () => {
    const r = await put('prsave0001', project('prsave0001'));
    expect(r.json).toEqual({ ok: true, rev: 1 });
    const doc = h.db.projects.docs[0];
    expect(doc.owner).toEqual({ username: 'ann', userID: 1, name: 'Ann A' });
    expect(doc.meta).toEqual({ artboards: 1, library: false, preview: { width: 800, height: 600, background: '#123456' } });
    expect(typeof doc.doc).toBe('string');
    expect(JSON.parse(doc.doc).id).toBe('prsave0001');
  });

  it('uses white for a gradient background, and null when there are no artboards', async () => {
    await put('prgrad0001', project('prgrad0001', { artboards: [{ id: 'a', width: 10, height: 20, background: { type: 'linear' }, children: [] }] }));
    await put('prnone0001', project('prnone0001', { artboards: [] }));
    expect(h.db.projects.docs.find((d) => d._id === 'prgrad0001')!.meta.preview).toEqual({ width: 10, height: 20, background: '#ffffff' });
    expect(h.db.projects.docs.find((d) => d._id === 'prnone0001')!.meta.preview).toBeNull();
  });

  it('flags library projects in the meta, and caps and defaults the name', async () => {
    await put('prlibr0001', project('prlibr0001', { settings: { library: true }, name: 'n'.repeat(300) }));
    await put('prname0001', project('prname0001', { name: '' }));
    expect(h.db.projects.docs.find((d) => d._id === 'prlibr0001')!.meta.library).toBe(true);
    expect(h.db.projects.docs.find((d) => d._id === 'prlibr0001')!.name).toHaveLength(200);
    expect(h.db.projects.docs.find((d) => d._id === 'prname0001')!.name).toBe('Untitled project');
  });

  it.each([
    ['a bad id', 'a/b', project('a/b')],
    ['an id that does not match the url', 'prmism0001', project('prother0001')],
    ['a reserved storage id', 'shares', project('shares')],
    ['the wrong format', 'prfmt00001', { ...project('prfmt00001'), format: 'other' }],
    ['no artboards array', 'prart00001', { ...project('prart00001'), artboards: {} }],
    ['no project', 'prnull0001', null],
  ])('refuses %s', async (_name, id, body) => {
    const r = await put(id, body);
    expect(r.status === 400 || r.status === 404).toBe(true);
    expect(h.db.projects.docs).toHaveLength(0);
  });

  it('bumps the rev on every save and answers a stale rev with a 409 carrying the current one', async () => {
    await put('prrev00001', project('prrev00001'));
    expect((await put('prrev00001', project('prrev00001', { name: 'two' }), ann, { rev: 1 })).json.rev).toBe(2);
    const stale = await put('prrev00001', project('prrev00001', { name: 'three' }), ann, { rev: 1 });
    expect(stale.status).toBe(409);
    expect(stale.json.rev).toBe(2);
    expect(h.db.projects.docs[0].name).toBe('two');
    //force overrides it
    const forced = await put('prrev00001', project('prrev00001', { name: 'three' }), ann, { rev: 1, force: true });
    expect(forced.json.rev).toBe(3);
    expect(h.db.projects.docs[0].name).toBe('three');
  });

  it('says a project saved at a rev that no longer exists was deleted elsewhere (unless forced)', async () => {
    const r = await put('prgone0001', project('prgone0001'), ann, { rev: 4 });
    expect(r.status).toBe(409);
    expect(r.json.rev).toBe(0);
    expect((await put('prgone0001', project('prgone0001'), ann, { rev: 4, force: true })).json.ok).toBe(true);
  });

  it('answers 409 when two saves race and mongo rejects the second', async () => {
    await put('prrace0001', project('prrace0001'));
    h.db.projects.failNext.updateOne = new Error('write conflict');
    const r = await put('prrace0001', project('prrace0001'), ann, { rev: 1 });
    expect(r.status).toBe(409);
  });

  it('does not treat a non-numeric rev as anything but a new project', async () => {
    const r = await put('prnan00001', project('prnan00001'), ann, { rev: 'abc' });
    expect(r.json.rev).toBe(1);
  });

  it('refuses a save over 64mb, saying what usually causes it', async () => {
    const r = await h.call('PUT', '/api/projects/prbig00001', { user: ann, body: JSON.stringify({ project: project('prbig00001', { pad: 'x'.repeat(65 * 1024 * 1024) }), rev: 0 }), type: 'application/json' });
    expect(r.status).toBe(413);
    expect(r.json.error).toMatch(/^This project is too big to save \(over 64 MB\)\. Large pictures/);
  });
});

describe('loading and listing', () => {
  it('loads a project with its rev and owner, and 404s a missing one', async () => {
    await put('prload0001', project('prload0001'));
    const r = await h.call('GET', '/api/projects/prload0001', { user: ann });
    expect(r.json.project.id).toBe('prload0001');
    expect(r.json.rev).toBe(1);
    expect(r.json.owner.username).toBe('ann');
    expect(r.json.live).toBeNull();
    expect((await h.call('GET', '/api/projects/prmiss0001', { user: ann })).status).toBe(404);
    expect((await h.call('GET', '/api/projects/_libraries', { user: ann })).status).toBe(400);
  });

  it('lists only your own, newest first, without the documents', async () => {
    await put('prlist0001', project('prlist0001'));
    await new Promise((r) => setTimeout(r, 5));
    await put('prlist0002', project('prlist0002'));
    await put('prlist0003', project('prlist0003'), bob);
    const r = await h.call('GET', '/api/projects', { user: ann });
    expect(r.json.map((p: { id: string }) => p.id)).toEqual(['prlist0002', 'prlist0001']);
    expect(r.json[0]).toMatchObject({ rev: 1, artboards: 1, isLibrary: false, libraryVersion: 0, tags: [], folder: null, thumb: null });
    expect(r.json[0].doc).toBeUndefined();
  });

  it('only gives everyone\'s projects to power users who ask for them', async () => {
    await put('prall00001', project('prall00001'), ann);
    await put('prall00002', project('prall00002'), bob);
    expect((await h.call('GET', '/api/projects?all=1', { user: ann })).json).toHaveLength(1);
    expect((await h.call('GET', '/api/projects?all=1', { user: pat })).json).toHaveLength(2);
    expect((await h.call('GET', '/api/projects', { user: pat })).json).toHaveLength(0);
  });

  it('with no session lists only projects nobody owns, even when sessions are not enforced yet', async () => {
    await put('prdev00001', project('prdev00001'), ann);
    await put('prdev00002', project('prdev00002'), null);
    expect((await h.call('GET', '/api/projects')).json.map((p: { id: string }) => p.id)).toEqual(['prdev00002']);
    //?all=1 needs a power user, not just the absence of anyone to check
    expect((await h.call('GET', '/api/projects?all=1')).json.map((p: { id: string }) => p.id)).toEqual(['prdev00002']);
  });

  it('with no session lists nothing on test and prod, not even the projects nobody owns', async () => {
    await put('prdev00003', project('prdev00003'), null);
    const was = process.env.NODE_ENV;
    try {
      for (const env of ['testing', 'production']) {
        process.env.NODE_ENV = env;
        expect((await h.call('GET', '/api/projects')).json).toEqual([]);
        expect((await h.call('GET', '/api/projects?all=1')).json).toEqual([]);
      }
      // a signed in power user who asks still sees them
      expect((await h.call('GET', '/api/projects?all=1', { user: pat })).json.map((p: { id: string }) => p.id)).toContain('prdev00003');
    } finally {
      if (was === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = was;
    }
  });
});

describe('who may change what', () => {
  beforeEach(async () => {
    await put('prown00001', project('prown00001'), ann);
  });

  const routes: [string, string, unknown?][] = [
    ['GET', '/api/projects/prown00001'],
    ['PUT', '/api/projects/prown00001', { project: project('prown00001'), rev: 1 }],
    ['PATCH', '/api/projects/prown00001/meta', { tags: ['x'] }],
    ['DELETE', '/api/projects/prown00001'],
    ['POST', '/api/projects/prown00001/duplicate', {}],
    ['GET', '/api/projects/prown00001/assets'],
    ['GET', '/api/projects/prown00001/revisions'],
    ['GET', '/api/projects/prown00001/share'],
    ['GET', '/api/projects/prown00001/library'],
    ['POST', '/api/projects/prown00001/ops', { ops: [] }],
  ];

  it.each(routes)('lets the owner %s %s', async (method, url, body) => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    const r = await h.call(method, url, { user: ann, json: body });
    expect(r.status).not.toBe(403);
  });

  it.each(routes)('refuses someone else on %s %s once sessions are enforced', async (method, url, body) => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    const r = await h.call(method, url, { user: bob, json: body });
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/belongs to someone else/);
    //and nothing was touched
    expect(h.db.projects.docs).toHaveLength(1);
    expect(h.db.projects.docs[0].rev).toBe(1);
  });

  it('only warns until sessions are enforced', async () => {
    const r = await h.call('GET', '/api/projects/prown00001', { user: bob });
    expect(r.status).toBe(200);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('would reject'))).toBe(true);
  });

  it('lets a power user into anyone\'s project, and refuses a session-less caller when enforcing', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/projects/prown00001', { user: pat })).status).toBe(200);
    expect((await h.call('GET', '/api/projects/prown00001')).status).toBe(403);
  });

  it('treats a project with no owner as open to everyone', async () => {
    h.db.projects.docs[0].owner = null;
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/projects/prown00001', { user: bob })).status).toBe(200);
  });
});

describe('tags and folder', () => {
  beforeEach(async () => {
    await put('prtags0001', project('prtags0001'));
  });
  const patch = (body: unknown, user: User | null = ann) => h.call('PATCH', '/api/projects/prtags0001/meta', { user, json: body });

  it('sets tags and folder without touching rev, revisions or the document', async () => {
    const before = structuredClone(h.db.projects.docs[0]);
    const r = await patch({ tags: ['Maths', 'year 7'], folder: 'Term 1' });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ id: 'prtags0001', tags: ['Maths', 'year 7'], folder: 'Term 1', rev: 1 });
    const after = h.db.projects.docs[0];
    expect(after.rev).toBe(before.rev);
    expect(after.doc).toBe(before.doc);
    expect(after.updated).toEqual(before.updated);
  });

  it('cleans labels: trims, collapses whitespace and control characters, collapses case-insensitive duplicates', async () => {
    const r = await patch({ tags: ['  a   b  ', 'a\u0000\tb', 'A B', 'Other'] });
    expect(r.json.tags).toEqual(['a b', 'Other']);
  });

  it('leaves the other field alone when only one is sent, and clears the folder with null or an empty string', async () => {
    await patch({ tags: ['x'], folder: 'F' });
    expect((await patch({ tags: ['y'] })).json).toMatchObject({ tags: ['y'], folder: 'F' });
    expect((await patch({ folder: null })).json).toMatchObject({ tags: ['y'], folder: null });
    await patch({ folder: 'G' });
    expect((await patch({ folder: '' })).json.folder).toBeNull();
  });

  it.each([
    ['tags that are not a list', { tags: 'a' }],
    ['more than 20 tags', { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }],
    ['an empty tag', { tags: ['ok', '   '] }],
    ['a non-string tag', { tags: [5] }],
    ['a tag over 40 characters', { tags: ['x'.repeat(41)] }],
    ['a folder that is not a string', { folder: 5 }],
    ['a whitespace folder', { folder: '   ' }],
    ['a folder over 40 characters', { folder: 'x'.repeat(41) }],
    ['nothing to change', {}],
    ['unrelated fields only', { name: 'x' }],
  ])('refuses %s', async (_n, body) => {
    const r = await patch(body);
    expect(r.status).toBe(400);
    expect(h.db.projects.docs[0].tags).toBeUndefined();
  });

  it('accepts exactly 20 tags and a 40 character label', async () => {
    const r = await patch({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`), folder: 'f'.repeat(40) });
    expect(r.status).toBe(200);
    expect(r.json.tags).toHaveLength(20);
  });

  it('404s a project that does not exist and 400s a bad id', async () => {
    expect((await h.call('PATCH', '/api/projects/prmiss0001/meta', { user: ann, json: { tags: [] } })).status).toBe(404);
    expect((await h.call('PATCH', '/api/projects/thumbs/meta', { user: ann, json: { tags: [] } })).status).toBe(400);
  });

  it('shows up in the list', async () => {
    await patch({ tags: ['a'], folder: 'F' });
    const list = (await h.call('GET', '/api/projects', { user: ann })).json;
    expect(list[0]).toMatchObject({ tags: ['a'], folder: 'F' });
  });
});

describe('duplicate', () => {
  it('copies the project and its assets under a fresh server-made id', async () => {
    await put('prdupe0001', project('prdupe0001', { name: 'Orig' }));
    await h.call('PATCH', '/api/projects/prdupe0001/meta', { user: ann, json: { tags: ['t'], folder: 'F' } });
    await h.call('PUT', '/api/projects/prdupe0001/assets/asset00001', { user: ann, body: Buffer.from([1, 2, 3]), type: 'image/png' });
    const r = await h.call('POST', '/api/projects/prdupe0001/duplicate', { user: bob, json: {} });
    expect(r.json.ok).toBe(true);
    const id = r.json.id as string;
    expect(id).not.toBe('prdupe0001');
    const copy = h.db.projects.docs.find((d) => d._id === id)!;
    expect(copy.owner.username).toBe('bob');
    expect(copy.rev).toBe(1);
    expect(copy.tags).toEqual(['t']);
    expect(copy.folder).toBe('F');
    const project2 = JSON.parse(copy.doc);
    expect(project2.id).toBe(id);
    expect(project2.name).toBe('Orig copy');
    expect(fs.readFileSync(path.join(h.storage, id, 'asset00001'))).toEqual(Buffer.from([1, 2, 3]));
    //the original is untouched
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === 'prdupe0001')!.doc).id).toBe('prdupe0001');
  });

  it('takes a name from the body (capped), ignores an id in it, and works for a project with no assets', async () => {
    await put('prdupe0002', project('prdupe0002'));
    const r = await h.call('POST', '/api/projects/prdupe0002/duplicate', { user: ann, json: { name: 'N'.repeat(300), id: 'prdupe0002' } });
    expect(r.json.id).not.toBe('prdupe0002');
    expect(JSON.parse(h.db.projects.docs.find((d) => d._id === r.json.id)!.doc).name).toHaveLength(200);
  });

  it('404s a missing project and 400s a bad id', async () => {
    expect((await h.call('POST', '/api/projects/prmiss0001/duplicate', { user: ann, json: {} })).status).toBe(404);
    expect((await h.call('POST', '/api/projects/_x/duplicate', { user: ann, json: {} })).status).toBe(400);
  });
});

describe('delete', () => {
  const setUp = async (id: string) => {
    await put(id, project(id, { settings: { library: true } }));
    await h.call('PUT', `/api/projects/${id}/assets/asset00001`, { user: ann, body: Buffer.from([1]), type: 'image/png' });
    await h.call('PUT', `/api/projects/${id}/thumbnail`, { user: ann, body: Buffer.from([0xff, 0xd8, 1, 2]), type: 'image/jpeg' });
    const share = (await h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: '<html></html>', type: 'text/plain' })).json.share;
    h.db.libraries.docs.push({ _id: id, owner: ann });
    fs.mkdirSync(path.join(h.storage, '_libraries', id), { recursive: true });
    await vi.waitFor(() => expect(h.db.revisions.docs.some((r) => r.project === id)).toBe(true));
    return share.token as string;
  };
  const exists = (...p: string[]) => fs.existsSync(path.join(h.storage, ...p));

  it('puts the project in the bin: gone from the list and its links, everything kept for a restore', async () => {
    const token = await setUp('prdel00001');
    expect((await h.call('DELETE', '/api/projects/prdel00001', { user: ann })).json).toEqual({ ok: true, bin: 30 });

    expect(h.db.projects.docs.some((d) => d._id === 'prdel00001')).toBe(false);
    expect((await h.call('GET', '/api/projects/prdel00001', { user: ann })).status).toBe(404);
    expect((await h.call('GET', `/s/${token}`, {})).status).toBe(404);
    expect(exists('prdel00001')).toBe(false);
    expect(exists('shares', `${token}.html`)).toBe(false);
    expect(exists('thumbs', 'prdel00001.jpg')).toBe(false);
    //kept: the files in the bin, the revisions, the library
    expect(exists('_bin', 'prdel00001', 'files', 'asset00001')).toBe(true);
    expect(exists('_bin', 'prdel00001', 'share.html')).toBe(true);
    expect(exists('_bin', 'prdel00001', 'thumb.jpg')).toBe(true);
    expect(h.db.revisions.docs.some((r) => r.project === 'prdel00001')).toBe(true);
    expect(h.db.libraries.docs).toHaveLength(1);

    const bin = (await h.call('GET', '/api/bin', { user: ann })).json;
    expect(bin.map((b: { id: string }) => b.id)).toEqual(['prdel00001']);
    expect(new Date(bin[0].purge).getTime() - new Date(bin[0].binned.at).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(bin[0].binned.by.username).toBe('ann');
    //someone else's bin doesn't show it, and they can't restore it
    expect((await h.call('GET', '/api/bin', { user: bob })).json).toEqual([]);
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('POST', '/api/bin/prdel00001/restore', { user: bob })).status).toBe(403);
    process.env.SUITE_SESSION_ENFORCE = '';
  });

  it('restores everything: the project, its files, share link and thumbnail', async () => {
    const token = await setUp('prdel00002');
    await h.call('DELETE', '/api/projects/prdel00002', { user: ann });
    expect((await h.call('POST', '/api/bin/prdel00002/restore', { user: ann })).json).toEqual({ ok: true, id: 'prdel00002' });

    expect((await h.call('GET', '/api/projects/prdel00002', { user: ann })).json.project.id).toBe('prdel00002');
    expect((await h.call('GET', `/s/${token}`, {})).status).toBe(200);
    expect(exists('prdel00002', 'asset00001')).toBe(true);
    expect(exists('thumbs', 'prdel00002.jpg')).toBe(true);
    expect(exists('_bin', 'prdel00002')).toBe(false);
    expect(h.db['projects-bin'].docs).toHaveLength(0);
    expect(h.db.projects.docs.find((d) => d._id === 'prdel00002')!.binned).toBeUndefined();
    expect((await h.call('POST', '/api/bin/prdel00002/restore', { user: ann })).status).toBe(404);
  });

  it('Delete forever removes the project, its revisions, assets, thumbnail, share page and library', async () => {
    await setUp('prdel00003');
    await h.call('DELETE', '/api/projects/prdel00003', { user: ann });
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('DELETE', '/api/bin/prdel00003', { user: bob })).status).toBe(403);
    process.env.SUITE_SESSION_ENFORCE = '';
    expect((await h.call('DELETE', '/api/bin/prdel00003', { user: ann })).json).toEqual({ ok: true });

    expect(h.db['projects-bin'].docs).toHaveLength(0);
    expect(h.db.revisions.docs.filter((r) => r.project === 'prdel00003')).toHaveLength(0);
    expect(h.db.libraries.docs).toHaveLength(0);
    expect(exists('_bin', 'prdel00003')).toBe(false);
    expect(exists('_libraries', 'prdel00003')).toBe(false);
  });

  it('a power user sees and restores anyone\'s bin with all=1', async () => {
    await setUp('prdel00004');
    await h.call('DELETE', '/api/projects/prdel00004', { user: ann });
    expect((await h.call('GET', '/api/bin', { user: pat })).json).toEqual([]);
    expect((await h.call('GET', '/api/bin?all=1', { user: pat })).json.map((b: { id: string }) => b.id)).toEqual(['prdel00004']);
    expect((await h.call('POST', '/api/bin/prdel00004/restore', { user: pat })).json.ok).toBe(true);
  });

  it('is fine to delete something that is already gone, and refuses bad ids', async () => {
    expect((await h.call('DELETE', '/api/projects/prgone0001', { user: ann })).json).toEqual({ ok: true });
    expect((await h.call('DELETE', '/api/projects/shares', { user: ann })).status).toBe(400);
  });
});

describe('collaborators', () => {
  it('the owner invites someone, who can then open, save and see it in their list, but not delete it or invite others', async () => {
    await put('prcollab01', project('prcollab01'));
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/projects/prcollab01', { user: bob })).status).toBe(403);
    // only the owner invites
    expect((await h.call('POST', '/api/projects/prcollab01/collaborators', { user: bob, json: { username: 'bob' } })).status).toBe(403);
    const add = await h.call('POST', '/api/projects/prcollab01/collaborators', { user: ann, json: { username: 'Bob', name: 'Bob B' } });
    expect(add.json.collaborators.map((c: { username: string }) => c.username)).toEqual(['bob']);
    // bob can open and save it, and it's in his list
    const got = await h.call('GET', '/api/projects/prcollab01', { user: bob });
    expect(got.status).toBe(200);
    expect((await put('prcollab01', project('prcollab01', { name: 'Bob was here' }), bob, { rev: got.json.rev })).status).toBe(200);
    expect((await h.call('GET', '/api/projects', { user: bob })).json.map((p: { id: string }) => p.id)).toContain('prcollab01');
    // but he can't delete it or invite others
    expect((await h.call('DELETE', '/api/projects/prcollab01', { user: bob })).status).toBe(403);
    expect((await h.call('POST', '/api/projects/prcollab01/collaborators', { user: bob, json: { username: 'cat' } })).status).toBe(403);
    // he can take himself off
    expect((await h.call('DELETE', '/api/projects/prcollab01/collaborators/bob', { user: bob })).json.collaborators).toEqual([]);
    expect((await h.call('GET', '/api/projects/prcollab01', { user: bob })).status).toBe(403);
  });

  it('refuses a bad username, the owner, and lists who is on it with whether you can manage it', async () => {
    await put('prcollab02', project('prcollab02'));
    expect((await h.call('POST', '/api/projects/prcollab02/collaborators', { user: ann, json: { username: '<script>' } })).status).toBe(400);
    expect((await h.call('POST', '/api/projects/prcollab02/collaborators', { user: ann, json: { username: 'ann' } })).status).toBe(400);
    await h.call('POST', '/api/projects/prcollab02/collaborators', { user: ann, json: { username: 'bob' } });
    const list = await h.call('GET', '/api/projects/prcollab02/collaborators', { user: ann });
    expect(list.json.canManage).toBe(true);
    expect(list.json.collaborators[0].username).toBe('bob');
    expect((await h.call('GET', '/api/projects/prcollab02/collaborators', { user: bob })).json.canManage).toBe(false);
  });
});

describe('finding people to invite', () => {
  it('finds staff by part of their name, email or username, never students, and keeps the input from being a regex', async () => {
    h.db['user-lookup'].docs = [
      { username: 'u1001', firstName: 'Priya', lastName: 'Shah', email: 'priya.shah@unisq.edu.au', isStudent: false },
      { username: 'u1002', firstName: 'Priya', lastName: 'Nguyen', email: 'p.nguyen@umail.unisq.edu.au', isStudent: true },
      { username: 'u1003', fullName: 'Sam Priyanka', email: 'sam@unisq.edu.au', isStudent: true },
      { username: 'u1001', firstName: 'Priya', lastName: 'Shah', email: 'priya.shah@unisq.edu.au', isStudent: false },
    ];
    const r = await h.call('GET', '/api/people?q=priya', { user: ann });
    expect(r.json.people.map((p: { username: string }) => p.username)).toEqual(['u1001', 'u1003']);
    expect(r.json.people[0]).toEqual({ username: 'u1001', name: 'Priya Shah', email: 'priya.shah@unisq.edu.au' });
    expect((await h.call('GET', '/api/people?q=u100', { user: ann })).json.people).toHaveLength(2);
    expect((await h.call('GET', '/api/people?q=.*', { user: ann })).json.people).toEqual([]);
    expect((await h.call('GET', '/api/people?q=p', { user: ann })).json.people).toEqual([]);
  });
});

describe('transferring ownership', () => {
  it('makes a collaborator the owner and keeps the old owner on as a collaborator', async () => {
    await put('prown00009', project('prown00009'));
    h.db.libraries.docs.push({ _id: 'prown00009', owner: { username: 'ann' } });
    h.db.templates.docs.push({ _id: 'tpl1', source: 'prown00009', owner: { username: 'ann' } }, { _id: 'tpl2', source: 'prown00009', owner: { username: 'zed' } });
    expect((await h.call('POST', '/api/projects/prown00009/owner', { user: ann, json: { username: 'bob' } })).status).toBe(400);
    await h.call('POST', '/api/projects/prown00009/collaborators', { user: ann, json: { username: 'bob', name: 'Bob B' } });
    const r = await h.call('POST', '/api/projects/prown00009/owner', { user: ann, json: { username: 'bob' } });
    expect(r.json.owner).toMatchObject({ username: 'bob', name: 'Bob B' });
    expect(r.json.collaborators.map((c: { username: string }) => c.username)).toEqual(['ann']);
    const row = h.db.projects.docs.find((d) => d._id === 'prown00009')!;
    expect(row.owner.username).toBe('bob');
    expect(row.ownerChanged).toMatchObject({ from: 'ann', by: 'ann' });
    expect(h.db.libraries.docs.find((d) => d._id === 'prown00009')!.owner.username).toBe('bob');
    //the template ann saved follows; one somebody else saved from it doesn't
    expect(h.db.templates.docs.find((d) => d._id === 'tpl1')!.owner.username).toBe('bob');
    expect(h.db.templates.docs.find((d) => d._id === 'tpl2')!.owner.username).toBe('zed');
    h.db.templates.docs = [];
  });

  it('is for the owner or a power user, not a collaborator', async () => {
    await put('prown00010', project('prown00010'));
    await h.call('POST', '/api/projects/prown00010/collaborators', { user: ann, json: { username: 'bob' } });
    await h.call('POST', '/api/projects/prown00010/collaborators', { user: ann, json: { username: 'cat' } });
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('POST', '/api/projects/prown00010/owner', { user: bob, json: { username: 'cat' } })).status).toBe(403);
    expect((await h.call('POST', '/api/projects/prown00010/owner', { user: pat, json: { username: 'cat' } })).json.owner.username).toBe('cat');
    process.env.SUITE_SESSION_ENFORCE = '';
  });
});

describe('named and pinned versions', () => {
  it('saves a named version of what is there now, pinned, and keeps it through the prune', async () => {
    await put('prpin00001', project('prpin00001', { name: 'First' }));
    const made = await h.call('POST', '/api/projects/prpin00001/revisions', { user: ann, json: { name: '  Sent to the coordinator  ' } });
    expect(made.json.ok).toBe(true);
    const row = h.db.revisions.docs.find((r) => r._id === made.json.id)!;
    expect(row).toMatchObject({ name: 'Sent to the coordinator', pinned: true, reason: 'Named version' });
    //push 105 unpinned ones in after it: the pinned one survives the next prune, and the list still shows it
    for (let i = 0; i < 105; i++) h.db.revisions.docs.push({ _id: `zz${String(i).padStart(10, '0')}`, project: 'prpin00001', created: new Date(Date.now() + 1000 + i), rev: 1, reason: 'Autosave', size: 1, doc: '{}' });
    expect((await h.call('POST', '/api/projects/prpin00001/revisions', { user: ann, json: { name: 'Second' } })).json).toMatchObject({ ok: true });
    expect(h.db.revisions.docs.some((r) => r._id === made.json.id)).toBe(true);
    const list = (await h.call('GET', '/api/projects/prpin00001/revisions', { user: ann })).json;
    expect(list.find((r: { id: string }) => r.id === made.json.id)).toMatchObject({ name: 'Sent to the coordinator', pinned: true });
    expect(h.db.revisions.docs.filter((r) => r.project === 'prpin00001' && !r.pinned)).toHaveLength(100);
  });

  it('renames, pins and unpins, and caps pinned versions at 20', async () => {
    await put('prpin00002', project('prpin00002'));
    await vi.waitFor(() => expect(h.db.revisions.docs.some((r) => r.project === 'prpin00002')).toBe(true));
    const first = h.db.revisions.docs.find((r) => r.project === 'prpin00002')!;
    expect((await h.call('PATCH', `/api/projects/prpin00002/revisions/${first._id}`, { user: ann, json: { name: 'Kick-off', pinned: true } })).json).toEqual({ ok: true, name: 'Kick-off', pinned: true });
    for (let i = 0; i < 19; i++) h.db.revisions.docs.push({ _id: `pp${String(i).padStart(10, '0')}`, project: 'prpin00002', created: new Date(), pinned: true });
    expect((await h.call('POST', '/api/projects/prpin00002/revisions', { user: ann, json: { name: 'One too many' } })).status).toBe(400);
    expect((await h.call('PATCH', `/api/projects/prpin00002/revisions/${first._id}`, { user: ann, json: { pinned: false } })).json.pinned).toBe(false);
    expect((await h.call('POST', '/api/projects/prpin00002/revisions', { user: ann, json: { name: '' } })).status).toBe(400);
  });
});

describe('share link revert', () => {
  const page = (id: string, body: string) => h.call('PUT', `/api/projects/${id}/share`, { user: ann, body: `<html><body>${body}</body></html>`, type: 'text/plain' });
  it('keeps the page an update replaced, reverts to it, and can switch back', async () => {
    await put('prshr00001', project('prshr00001'));
    const first = (await page('prshr00001', 'one')).json.share;
    expect(first.previous).toBeUndefined();
    expect((await h.call('POST', '/api/projects/prshr00001/share/revert', { user: ann })).status).toBe(400);
    const second = (await page('prshr00001', 'two')).json.share;
    expect(second.previous).toBeTruthy();
    expect((await h.call('GET', `/s/${first.token}`, {})).text).toContain('two');
    //the kept page can't be reached through the link
    expect((await h.call('GET', `/s/${first.token}.prev`, {})).status).toBe(404);
    const back = (await h.call('POST', '/api/projects/prshr00001/share/revert', { user: ann })).json.share;
    expect((await h.call('GET', `/s/${first.token}`, {})).text).toContain('one');
    expect(back.previous).toBeTruthy();
    await h.call('POST', '/api/projects/prshr00001/share/revert', { user: ann });
    expect((await h.call('GET', `/s/${first.token}`, {})).text).toContain('two');
    //turning the link off takes both pages
    await h.call('DELETE', '/api/projects/prshr00001/share', { user: ann });
    expect(fs.existsSync(path.join(h.storage, 'shares', `${first.token}.prev.html`))).toBe(false);
  });
});

describe('audit log', () => {
  it('records governance events, and only power users read it', async () => {
    h.db.audit.docs = [];
    await put('praud00001', project('praud00001'));
    await h.call('PUT', '/api/projects/praud00001/share', { user: ann, body: '<html></html>', type: 'text/plain' });
    await h.call('POST', '/api/projects/praud00001/collaborators', { user: ann, json: { username: 'bob' } });
    await h.call('POST', '/api/projects/praud00001/owner', { user: pat, json: { username: 'bob' } });
    await h.call('DELETE', '/api/projects/praud00001/share', { user: bob });
    await h.call('DELETE', '/api/projects/praud00001', { user: bob });
    await vi.waitFor(() => expect(h.db.audit.docs.filter((d) => d.project === 'praud00001')).toHaveLength(5));
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/audit', { user: ann })).status).toBe(403);
    process.env.SUITE_SESSION_ENFORCE = '';
    const log = (await h.call('GET', '/api/audit?project=praud00001', { user: pat })).json;
    expect(log.map((e: { event: string }) => e.event)).toEqual(['project-binned', 'share-off', 'owner-changed', 'collaborator-added', 'share-on']);
    expect(log.find((e: { event: string }) => e.event === 'owner-changed')).toMatchObject({ by: { username: 'pat' }, power: true, detail: { from: 'ann', to: 'bob' } });
  });
});

describe('admin projects table', () => {
  it('lists every project with size, links, learners and the bin count, for power users only', async () => {
    await put('pradm00001', project('pradm00001', { name: 'Alpha' }));
    await h.call('PUT', '/api/projects/pradm00001/assets/asset00001', { user: ann, body: Buffer.alloc(2048), type: 'image/png' });
    await h.call('PUT', '/api/projects/pradm00001/share', { user: ann, body: '<html></html>', type: 'text/plain' });
    h.db['interactives-user-data'].docs.push({ _id: 'u1', project: 'pradm00001' }, { _id: 'u2', project: 'pradm00001' });
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await h.call('GET', '/api/admin/projects', { user: ann })).status).toBe(403);
    process.env.SUITE_SESSION_ENFORCE = '';
    const r = (await h.call('GET', '/api/admin/projects', { user: pat })).json;
    const row = r.projects.find((p: { id: string }) => p.id === 'pradm00001');
    expect(row).toMatchObject({ name: 'Alpha', share: true, learners: 2, files: 1, fileBytes: 2048, owner: { username: 'ann' } });
    expect(row.docBytes).toBeGreaterThan(50);
    expect(typeof r.bin).toBe('number');
    h.db['interactives-user-data'].docs = [];
  });
});
