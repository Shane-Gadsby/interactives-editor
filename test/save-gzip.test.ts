// @vitest-environment node
//Saving a project with a gzipped body: the server inflates it (and holds the size limit to the inflated bytes, so a
//small upload can't unpack into a huge one), and the editor's client sends it that way, falling back to plain JSON when
//the browser can't or something on the way answers 415.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import zlib from 'node:zlib';
import { createNode, createProject, type Project } from 'interactives-player';
import { startServer, type Harness } from './helpers/server-harness';

let h: Harness;
let n = 0;
const realFetch = globalThis.fetch;

type Db = typeof import('../src/lib/db');
const loadDb = async (): Promise<Db> => {
  vi.resetModules();
  vi.stubGlobal('document', { baseURI: `${h.base}/` });
  return import('../src/lib/db');
};

const fresh = (rows = 0): Project => {
  const p = createProject('Zipped');
  p.id = `prgz${String(++n).padStart(6, '0')}`;
  for (let i = 0; i < rows; i++) p.artboards[0].children.push(createNode('rect', { name: `Box number ${i}`, x: i }));
  return p;
};

beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await h.close();
});
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  vi.stubGlobal('fetch', realFetch);
});

const gz = (text: string) => zlib.gzipSync(Buffer.from(text));
const body = (p: unknown, rev = 0) => JSON.stringify({ project: p, rev });
const putZipped = (id: string, buf: Buffer, headers: Record<string, string> = {}) => h.call('PUT', `/api/projects/${id}`, { body: buf, type: 'application/json', headers: { 'content-encoding': 'gzip', ...headers } });

describe('the server takes a gzipped save', () => {
  it('inflates it, and the project comes back whole', async () => {
    const p = fresh(200);
    const r = await putZipped(p.id, gz(body(p)));
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, rev: 1 });
    const back = await h.call('GET', `/api/projects/${p.id}`);
    expect(back.json.project.artboards[0].children).toHaveLength(200);
    expect(back.json.project.artboards[0].children[199].name).toBe('Box number 199');
  });

  it('also takes deflate, and a plain body still works', async () => {
    const p = fresh(3);
    expect((await putZipped(p.id, zlib.deflateSync(Buffer.from(body(p))), { 'content-encoding': 'deflate' })).status).toBe(200);
    const q = fresh(3);
    expect((await h.call('PUT', `/api/projects/${q.id}`, { json: { project: q, rev: 0 } })).status).toBe(200);
  });

  it('holds the 64 MB limit to the inflated body, not the upload', async () => {
    const p = fresh();
    //70 MB of one letter squeezes to a few dozen KB
    const text = body({ ...p, padding: 'a'.repeat(70 * 1024 * 1024) });
    const zipped = gz(text);
    expect(zipped.length).toBeLessThan(200 * 1024);
    const r = await putZipped(p.id, zipped);
    expect(r.status).toBe(413);
    expect(r.json.error).toMatch(/too big to save/);
    expect((await h.call('GET', `/api/projects/${p.id}`)).status).toBe(404);
  });

  it('answers 415 for an encoding it does not know, and 400 for a broken gzip stream', async () => {
    const p = fresh(1);
    expect((await putZipped(p.id, Buffer.from(body(p)), { 'content-encoding': 'compress' })).status).toBe(415);
    expect((await putZipped(p.id, Buffer.from('not gzip at all'))).status).toBe(400);
  });
});

describe('the editor client', () => {
  const spy = () => {
    const sent: { encoding: string | null; bytes: number; text: string }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit & { headers?: Record<string, string> }) => {
      if (init?.method === 'PUT' && /\/api\/projects\/prgz\d+$/.test(url)) {
        const enc = init.headers?.['Content-Encoding'] ?? null;
        const raw = Buffer.from(await new Response(init.body as BodyInit).arrayBuffer());
        sent.push({ encoding: enc, bytes: raw.length, text: (enc === 'gzip' ? zlib.gunzipSync(raw) : raw).toString() });
      }
      return realFetch(url, init);
    });
    return sent;
  };

  it('gzips a save that is big enough, and the server stores it as the editor had it', async () => {
    const db = await loadDb();
    const p = fresh(300);
    await db.createProjectRecord(p);
    const sent = spy();
    await db.saveProject({ ...p, name: 'Big' });
    const last = sent.at(-1)!;
    expect(last.encoding).toBe('gzip');
    expect(JSON.parse(last.text).project.name).toBe('Big');
    expect(last.bytes).toBeLessThan(last.text.length / 5);
    expect((await db.loadProjectRecord(p.id))!.artboards[0].children).toHaveLength(300);
  });

  it('sends a small save as plain JSON', async () => {
    const db = await loadDb();
    const p = fresh(1);
    await db.createProjectRecord(p);
    const sent = spy();
    await db.saveProject({ ...p, name: 'Small' });
    expect(sent.at(-1)!.encoding).toBeNull();
  });

  it('sends plain JSON when the browser has no CompressionStream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const db = await loadDb();
    const p = fresh(300);
    await db.createProjectRecord(p);
    const sent = spy();
    await db.saveProject({ ...p, name: 'NoCS' });
    expect(sent.at(-1)!.encoding).toBeNull();
    expect((await db.loadProjectRecord(p.id))!.name).toBe('NoCS');
    vi.unstubAllGlobals();
  });

  it('falls back to plain JSON on a 415 and stops trying for the session', async () => {
    const db = await loadDb();
    const p = fresh(300);
    await db.createProjectRecord(p);
    const sent: (string | null)[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit & { headers?: Record<string, string> }) => {
      if (init?.method === 'PUT' && /\/api\/projects\/prgz\d+$/.test(url)) {
        const enc = init.headers?.['Content-Encoding'] ?? null;
        sent.push(enc);
        if (enc) return new Response(JSON.stringify({ error: 'nope' }), { status: 415, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(url, init);
    });
    await db.saveProject({ ...p, name: 'Retried' });
    expect(sent).toEqual(['gzip', null]);
    expect((await db.loadProjectRecord(p.id))!.name).toBe('Retried');
    await db.saveProject({ ...p, name: 'Again' });
    expect(sent).toEqual(['gzip', null, null]);
  });

  it('does not hide other failures: a conflict is still a conflict', async () => {
    const db = await loadDb();
    const p = fresh(300);
    await db.createProjectRecord(p);
    const mine = (await db.loadProjectRecord(p.id))!;
    await h.call('PUT', `/api/projects/${p.id}`, { json: { project: { ...mine, name: 'theirs' }, rev: 1 } });
    await expect(db.saveProject({ ...mine, name: 'mine' })).rejects.toBeInstanceOf(db.ConflictError);
  });
});
