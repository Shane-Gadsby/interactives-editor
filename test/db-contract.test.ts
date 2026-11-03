// @vitest-environment node
//The editor's own client (src/lib/db.ts) against the real server (index.js on an in-memory database): the two ends
//of every storage route have to agree on paths, bodies, status codes and error text, and a package has to survive
//being exported, imported and stored.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { startServer, type Harness } from './helpers/server-harness';

type Db = typeof import('../src/lib/db');
let h: Harness;
let db: Db;
let n = 0;

beforeAll(async () => {
  h = await startServer();
  vi.stubGlobal('document', { baseURI: `${h.base}/` });
  db = await import('../src/lib/db');
});
afterAll(async () => {
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
});

const fresh = (name = 'Stored'): Project => {
  const p = createProject(name);
  p.id = `prdb${String(++n).padStart(6, '0')}`;
  p.artboards[0].children.push(createNode('rect', { name: 'Box', x: 5 }));
  return p;
};

describe('projects', () => {
  it('creates, loads, saves with the rev it was given, lists and deletes', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    const loaded = (await db.loadProjectRecord(p.id))!;
    expect(loaded.name).toBe('Stored');
    expect(loaded.artboards[0].children[0].name).toBe('Box');
    expect(db.liveSeqOf(p.id)).toBe(0);

    await db.saveProject({ ...loaded, name: 'Renamed' });
    expect((await db.loadProjectRecord(p.id))!.name).toBe('Renamed');
    const list = await db.listProjects();
    expect(list.find((x) => x.id === p.id)).toMatchObject({ name: 'Renamed', rev: 2, artboards: 1 });

    await db.deleteProject(p.id);
    expect(await db.loadProjectRecord(p.id)).toBeNull();
    expect((await db.listProjects()).some((x) => x.id === p.id)).toBe(false);
  });

  it('raises a ConflictError with the server\'s rev when someone else saved first, and force wins', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    const mine = (await db.loadProjectRecord(p.id))!;
    //someone else saves over it
    await h.call('PUT', `/api/projects/${p.id}`, { json: { project: { ...mine, name: 'theirs' }, rev: 1 } });
    await expect(db.saveProject({ ...mine, name: 'mine' })).rejects.toMatchObject({ name: 'Error', rev: 2, message: expect.stringMatching(/saved somewhere else/) });
    await expect(db.saveProject({ ...mine, name: 'mine' })).rejects.toBeInstanceOf(db.ConflictError);
    await db.saveProject({ ...mine, name: 'mine' }, { force: true });
    expect((await db.loadProjectRecord(p.id))!.name).toBe('mine');
  });

  it('says "Could not reach the server" when nothing answers, and a project that is gone loads as null', async () => {
    expect(await db.loadProjectRecord('prnothere01')).toBeNull();
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('connection refused')));
    await expect(db.listProjects()).rejects.toThrow('Could not reach the Interactives server');
    vi.stubGlobal('fetch', real);
  });

  it('turns a server refusal into its message', async () => {
    await expect(db.setProjectMeta('prnothere01', { tags: ['x'] })).rejects.toThrow('No such project');
    const p = fresh();
    await db.createProjectRecord(p);
    await expect(db.setProjectMeta(p.id, { tags: ['x'.repeat(db.META_MAX_LABEL + 1)] })).rejects.toThrow(/1 to 40 characters/);
    await expect(db.setProjectMeta(p.id, { tags: Array.from({ length: db.META_MAX_TAGS + 1 }, (_, i) => `t${i}`) })).rejects.toThrow(/up to 20/);
  });

  it('sets tags and a folder and gets them back in the list', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    const meta = await db.setProjectMeta(p.id, { tags: ['a', 'b'], folder: 'F' });
    expect(meta).toMatchObject({ tags: ['a', 'b'], folder: 'F', id: p.id });
    expect((await db.listProjects()).find((x) => x.id === p.id)).toMatchObject({ tags: ['a', 'b'], folder: 'F' });
  });

  it('duplicates under an id the server makes', async () => {
    const p = fresh('Original');
    await db.createProjectRecord(p);
    const copyId = await db.duplicateProject(p.id, 'Second');
    expect(copyId).not.toBe(p.id);
    expect((await db.loadProjectRecord(copyId))!.name).toBe('Second');
  });

  it('asks the server who it is', async () => {
    expect(await db.session()).toEqual({ user: null, power: false });
  });
});

describe('assets and packages', () => {
  const NodeBlob = require('node:buffer').Blob as typeof Blob;
  beforeAll(() => {
    vi.stubGlobal('Blob', NodeBlob);
  });

  it('uploads bytes with their type, lists and fetches them back, and deletes one', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    await db.putAsset(p.id, 'asset00001', new NodeBlob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' }));
    await db.putAsset(p.id, 'asset00002', new NodeBlob(['a,b\n1,2'], { type: 'text/csv' }));
    const all = await db.listAssetBlobs(p.id);
    expect([...all.keys()].sort()).toEqual(['asset00001', 'asset00002']);
    expect(all.get('asset00001')!.type).toBe('image/png');
    expect(new Uint8Array(await all.get('asset00001')!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    await db.deleteAsset(p.id, 'asset00001');
    expect(await db.getAsset(p.id, 'asset00001')).toBeNull();
    expect((await db.listAssetBlobs(p.id)).size).toBe(1);
  });

  it('reads an asset\'s bytes from the server, or from a data: url when it has one', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    await db.putAsset(p.id, 'asset00001', new NodeBlob([new Uint8Array([9, 8, 7])], { type: 'application/octet-stream' }));
    expect(await db.assetBytes(p.id, { id: 'asset00001', name: 'a', mime: 'x', size: 3 } as never)).toEqual(new Uint8Array([9, 8, 7]));
    expect(await db.assetBytes(p.id, { id: 'nope', name: 'a', mime: 'x', size: 0 } as never)).toBeNull();
    const data = 'data:text/plain;base64,aGk=';
    expect(await db.assetBytes(p.id, { id: 'x', name: 'a', mime: 'text/plain', size: 2, src: data } as never)).toEqual(new Uint8Array([104, 105]));
  });

  it('exports a project with its assets as a package and imports it again as a new project with the same assets', async () => {
    const p = fresh('Packed');
    p.assets.push({ id: 'asset00001', name: 'pic.png', mime: 'image/png', size: 4 } as never);
    await db.createProjectRecord(p);
    await db.putAsset(p.id, 'asset00001', new NodeBlob([new Uint8Array([5, 6, 7, 8])], { type: 'image/png' }));
    const pkg = await db.exportPackage(p);
    expect(pkg.type).toBe('application/zip');
    const bytes = new Uint8Array(await pkg.arrayBuffer());
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);

    const imported = await db.importPackage(new NodeBlob([bytes]));
    expect(imported.id).not.toBe(p.id);
    expect(imported.name).toBe('Packed');
    expect(imported.assets.map((a) => a.id)).toEqual(['asset00001']);
    const back = await db.getAsset(imported.id, 'asset00001');
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(new Uint8Array([5, 6, 7, 8]));
    expect((await db.loadProjectRecord(imported.id))!.name).toBe('Packed');
  });

  it('imports bare project JSON, and drops assets it has no bytes for', async () => {
    const p = fresh('Bare');
    p.assets.push({ id: 'asset00009', name: 'ghost.png', mime: 'image/png', size: 4 } as never);
    const imported = await db.importPackage(new NodeBlob([JSON.stringify(p)]));
    expect(imported.name).toBe('Bare');
    expect(imported.assets).toEqual([]);
    expect(imported.id).not.toBe(p.id);
  });

  it('refuses a file that is neither a package nor project JSON', async () => {
    await expect(db.importPackage(new NodeBlob(['<html>nope</html>']))).rejects.toThrow();
    await expect(db.importPackage(new NodeBlob([]))).rejects.toThrow();
  });
});

describe('revisions, sharing and libraries', () => {
  it('lists revisions, reads one and restores it', async () => {
    const p = fresh('V1');
    await db.createProjectRecord(p);
    await vi.waitFor(async () => expect((await db.listRevisions(p.id)).length).toBe(1));
    const [first] = await db.listRevisions(p.id);
    expect(first).toMatchObject({ reason: 'Created', rev: 1 });
    const loaded = (await db.loadProjectRecord(p.id))!;
    await db.saveProject({ ...loaded, name: 'V2' }, { force: true });
    expect((await db.loadRevision(p.id, first.id)).name).toBe('V1');
    const r = await db.restoreRevision(p.id, first.id);
    expect(r.rev).toBeGreaterThan(2);
    expect((await db.loadProjectRecord(p.id))!.name).toBe('V1');
  });

  it('publishes a share page, reads it back and stops it', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    expect(await db.getShare(p.id)).toBeNull();
    const share = await db.publishShare(p.id, '<!doctype html><html><body>shared</body></html>');
    expect(share.token).toMatch(/^[\w-]{24}$/);
    expect((await db.getShare(p.id))!.token).toBe(share.token);
    expect((await h.call('GET', `/s/${share.token}`)).text).toContain('shared');
    expect(db.shareUrl(share.token)).toBe(`${h.base}/s/${share.token}`);
    await db.stopShare(p.id);
    expect(await db.getShare(p.id)).toBeNull();
    expect((await h.call('GET', `/s/${share.token}`)).status).toBe(404);
    await expect(db.publishShare(p.id, 'no page')).rejects.toThrow('Not an HTML page');
  });

  it('publishes a library, lists it, reads it, shares it and unpublishes it', async () => {
    const p = fresh('Lib');
    p.settings.library = true;
    p.artboards[0].publish = true;
    await db.createProjectRecord(p);
    expect(await db.getOwnLibrary(p.id)).toBeNull();
    expect(await db.publishLibrary(p.id, 'first')).toMatchObject({ ok: true, unchanged: false, version: 1, components: 1 });
    expect(await db.publishLibrary(p.id, 'again')).toMatchObject({ unchanged: true, version: 1 });
    expect((await db.listLibraries()).find((l) => l.id === p.id)).toMatchObject({ version: 1, name: 'Lib' });
    const { library, snapshot } = await db.getLibrary(p.id);
    expect(library.version).toBe(1);
    expect(snapshot.artboards).toHaveLength(1);
    expect((await db.shareLibrary(p.id, { everyone: true, users: ['bob'] })).shared).toEqual({ everyone: true, users: ['bob'] });
    await db.unpublishLibrary(p.id);
    expect(await db.getOwnLibrary(p.id)).toBeNull();
    await expect(db.getLibrary(p.id)).rejects.toThrow('No such library');
  });

  it('will not publish a project that is not marked as a library', async () => {
    const p = fresh();
    await db.createProjectRecord(p);
    await expect(db.publishLibrary(p.id, '')).rejects.toThrow(/project is a library/);
  });
});
