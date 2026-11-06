// @vitest-environment node
//Project documents too big for one mongo record (shared/docstore.mjs). The split threshold is turned down to a few
//KB here so ordinary test projects go into parts, and the fake mongo is given a record limit to stand in for the
//16 MB one. The real index.js runs against it: saves, loads, revisions, restore, duplicate and delete.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';

process.env.INTERACTIVES_DOC_INLINE_MAX = '4000';
process.env.INTERACTIVES_DOC_PART_CHARS = '1500';

// @ts-expect-error plain ESM shared with index.js
const { split, docStore } = await import('../shared/docstore.mjs');
import { FakeCollection } from './helpers/fake-mongo';

const ann: User = { username: 'ann', fullName: 'Ann A' };

//A project whose document is roughly `size` characters, most of it one text layer (with some characters outside the
//basic plane, so a cut through a surrogate pair would show)
const big = (id: string, size: number, name = `Project ${id}`) => ({
  format: 'interactives',
  id,
  name,
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, children: [{ id: 't1', type: 'text', name: 'T', x: 0, y: 0, text: '😀ab'.repeat(Math.ceil(size / 4)) }] }],
});

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
  h.db.projects.docs = [];
  h.db.revisions.docs = [];
  h.db['doc-chunks'].docs = [];
  h.db.projects.maxRecordBytes = 6000;
  h.db.revisions.maxRecordBytes = 6000;
});

const row = (id: string) => h.db.projects.docs.find((d) => d._id === id)!;
const parts = () => h.db['doc-chunks'].docs;

describe('splitting', () => {
  it('cuts on character boundaries, never through a surrogate pair', () => {
    const s = '😀'.repeat(10);
    for (const size of [1, 3, 5, 7]) {
      const p: string[] = split(s, size);
      expect(p.join('')).toBe(s);
      //every part is whole characters: no lone high surrogate at an end
      for (const x of p) expect(/[\ud800-\udbff]$/.test(x)).toBe(false);
    }
  });

  it('keeps a small document in the row and a big one in parts, and reads both back', async () => {
    const chunks = new FakeCollection();
    const store = docStore(chunks);
    expect(await store.put('p1', 'p:p1:1', 'small')).toEqual({ doc: 'small', docChunks: null });
    const str = 'x'.repeat(10_000);
    const fields = await store.put('p1', 'p:p1:2', str);
    expect(fields.doc).toBeNull();
    expect(fields.docChunks).toEqual({ key: 'p:p1:2', parts: 7, length: 10_000 });
    expect(await store.get(fields)).toBe(str);
    //a part gone missing is an error, never a shorter document
    chunks.docs.splice(3, 1);
    await expect(store.get(fields)).rejects.toThrow(/missing \(6 of 7 parts\)/);
  });
});

describe('a project bigger than one record', () => {
  it('saves in parts, loads back whole, and the old parts go when it saves again', async () => {
    const first = big('prbig001', 9000);
    const r1 = await h.call('PUT', '/api/projects/prbig001', { user: ann, json: { project: first, rev: 0 } });
    expect(r1.status).toBe(200);
    expect(row('prbig001').doc).toBeNull();
    expect(row('prbig001').docChunks.key).toBe('p:prbig001:1');
    const got = await h.call('GET', '/api/projects/prbig001', { user: ann });
    expect(got.json.project).toEqual(first);

    const second = big('prbig001', 12000, 'Bigger');
    const r2 = await h.call('PUT', '/api/projects/prbig001', { user: ann, json: { project: second, rev: 1 } });
    expect(r2.json.rev).toBe(2);
    expect((await h.call('GET', '/api/projects/prbig001', { user: ann })).json.project.name).toBe('Bigger');
    //only rev 2's parts are left for the project row (revisions keep their own)
    const keys = new Set(parts().filter((p) => p.key.startsWith('p:')).map((p) => p.key));
    expect([...keys]).toEqual(['p:prbig001:2']);

    //shrinking it back under the limit puts it in the row again and drops the parts
    const small = { ...big('prbig001', 100), name: 'Small again' };
    await h.call('PUT', '/api/projects/prbig001', { user: ann, json: { project: small, rev: 2 } });
    expect(typeof row('prbig001').doc).toBe('string');
    expect(row('prbig001').docChunks).toBeNull();
    expect(parts().filter((p) => p.key.startsWith('p:'))).toHaveLength(0);
  });

  it('a conflicting save leaves the saved copy and its parts alone', async () => {
    await h.call('PUT', '/api/projects/prbig002', { user: ann, json: { project: big('prbig002', 9000), rev: 0 } });
    const before = parts().map((p) => p._id).sort();
    const stale = await h.call('PUT', '/api/projects/prbig002', { user: ann, json: { project: big('prbig002', 9500, 'Stale'), rev: 0 } });
    expect(stale.status).toBe(409);
    expect(parts().map((p) => p._id).sort()).toEqual(before);
    expect((await h.call('GET', '/api/projects/prbig002', { user: ann })).json.project.name).toBe('Project prbig002');
  });

  it('keeps big revisions in parts too, and restores from them', async () => {
    const first = big('prbig003', 9000, 'Original');
    await h.call('PUT', '/api/projects/prbig003', { user: ann, json: { project: first, rev: 0 } });
    await h.call('PUT', '/api/projects/prbig003', { user: ann, json: { project: big('prbig003', 9000, 'Changed'), rev: 1 } });
    const created = h.db.revisions.docs.find((r) => r.project === 'prbig003' && r.reason === 'Created')!;
    expect(created.doc).toBeNull();
    expect(created.docChunks.key).toBe(`r:${created._id}`);
    expect((await h.call('GET', `/api/projects/prbig003/revisions/${created._id}`, { user: ann })).json.project.name).toBe('Original');

    const restored = await h.call('POST', `/api/projects/prbig003/revisions/${created._id}/restore`, { user: ann });
    expect(restored.json.ok).toBe(true);
    expect((await h.call('GET', '/api/projects/prbig003', { user: ann })).json.project.name).toBe('Original');
    //the "Before restore" snapshot holds the changed copy
    const before = h.db.revisions.docs.find((r) => r.project === 'prbig003' && r.reason === 'Before restore')!;
    expect((await h.call('GET', `/api/projects/prbig003/revisions/${before._id}`, { user: ann })).json.project.name).toBe('Changed');
  });

  it('duplicates a split project, and deleting one takes only its own parts', async () => {
    await h.call('PUT', '/api/projects/prbig004', { user: ann, json: { project: big('prbig004', 9000), rev: 0 } });
    const dup = await h.call('POST', '/api/projects/prbig004/duplicate', { user: ann, json: { name: 'Copy' } });
    expect(dup.json.ok).toBe(true);
    const copy = (await h.call('GET', `/api/projects/${dup.json.id}`, { user: ann })).json.project;
    expect(copy.name).toBe('Copy');
    expect(copy.artboards[0].children[0].text).toHaveLength(9000);

    await h.call('DELETE', '/api/projects/prbig004', { user: ann });
    expect(parts().some((p) => p.project === 'prbig004')).toBe(false);
    expect(parts().some((p) => p.project === dup.json.id)).toBe(true);
    expect((await h.call('GET', `/api/projects/${dup.json.id}`, { user: ann })).json.project.name).toBe('Copy');
  });
});

describe('when saving fails', () => {
  it('answers a record that is too big with 413 and says why, not a conflict', async () => {
    h.db.projects.maxRecordBytes = 0;
    await h.call('PUT', '/api/projects/prbig005', { user: ann, json: { project: big('prbig005', 100), rev: 0 } });
    h.db.projects.failNext.updateOne = Object.assign(new Error('object to insert too large'), { code: 10334 });
    const r = await h.call('PUT', '/api/projects/prbig005', { user: ann, json: { project: big('prbig005', 100, 'x'), rev: 1 } });
    expect(r.status).toBe(413);
    expect(r.json.error).toMatch(/too big to save/);
  });

  it('answers any other database failure with 500 and keeps 409 for real conflicts', async () => {
    await h.call('PUT', '/api/projects/prbig006', { user: ann, json: { project: big('prbig006', 100), rev: 0 } });
    h.db.projects.failNext.updateOne = new Error('connection reset');
    const r = await h.call('PUT', '/api/projects/prbig006', { user: ann, json: { project: big('prbig006', 100, 'x'), rev: 1 } });
    expect(r.status).toBe(500);
    expect(r.json.error).toMatch(/could not save this project \(connection reset\)/);
    //nothing moved, so the same rev still saves
    expect((await h.call('PUT', '/api/projects/prbig006', { user: ann, json: { project: big('prbig006', 100, 'x'), rev: 1 } })).status).toBe(200);
  });

  it('a failed write of a big document leaves no stray parts', async () => {
    await h.call('PUT', '/api/projects/prbig007', { user: ann, json: { project: big('prbig007', 9000), rev: 0 } });
    const before = parts().filter((p) => p.key.startsWith('p:')).map((p) => p._id).sort();
    h.db.projects.failNext.updateOne = new Error('connection reset');
    await h.call('PUT', '/api/projects/prbig007', { user: ann, json: { project: big('prbig007', 9500, 'x'), rev: 1 } });
    expect(parts().filter((p) => p.key.startsWith('p:')).map((p) => p._id).sort()).toEqual(before);
  });
});
