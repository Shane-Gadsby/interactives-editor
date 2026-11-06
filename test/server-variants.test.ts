// @vitest-environment node
//index.js again: the smaller copies of an image asset (the canvas proxy and the optimised output), stored beside the
//asset by PUT/GET /api/projects/:id/assets/:assetId/variant/:key.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann' };
const bob: User = { username: 'bob' };

const project = (id: string) => ({
  format: 'interactives',
  id,
  name: `Project ${id}`,
  settings: {},
  artboards: [{ id: 'ab1', name: 'Main', width: 100, height: 100, children: [] }],
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
  await h.call('PUT', '/api/projects/prvariant01', { user: ann, json: { project: project('prvariant01'), rev: 0 } });
  await asset('big0000001', Buffer.from('original bytes'), 'image/png');
});

const asset = (aid: string, bytes: Buffer, mime: string, user: User | null = ann) => h.call('PUT', `/api/projects/prvariant01/assets/${aid}`, { user, body: bytes, type: mime });
const variant = (method: string, aid: string, key: string, body?: Buffer, type = 'image/webp', user: User | null = ann) =>
  h.call(method, `/api/projects/prvariant01/assets/${aid}/variant/${key}`, { user, body, type });

describe('asset variants', () => {
  it('round trips a variant with its type, and the asset itself is untouched', async () => {
    const webp = Buffer.from('RIFFxxxxWEBPsmall');
    expect((await variant('PUT', 'big0000001', 'edit', webp)).json).toEqual({ ok: true, size: webp.length });
    const r = await variant('GET', 'big0000001', 'edit');
    expect(r.bytes).toEqual(webp);
    expect(r.headers.get('content-type')).toBe('image/webp');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await h.call('GET', '/api/projects/prvariant01/assets/big0000001', { user: ann })).bytes.toString()).toBe('original bytes');
  });

  it('lists the variants with their sizes on the asset, and leaves the field off assets without any', async () => {
    await asset('plain000001', Buffer.from('abc'), 'image/png');
    await variant('PUT', 'big0000001', 'edit', Buffer.from('12345'));
    await variant('PUT', 'big0000001', 'o4-2560-85', Buffer.alloc(0));
    const list: { id: string; variants?: Record<string, number> }[] = (await h.call('GET', '/api/projects/prvariant01/assets', { user: ann })).json;
    // the variants are not assets themselves
    expect(list.map((a) => a.id).sort()).toEqual(['big0000001', 'plain000001']);
    expect(list.find((a) => a.id === 'big0000001')!.variants).toEqual({ edit: 5, 'o4-2560-85': 0 });
    expect(list.find((a) => a.id === 'plain000001')).not.toHaveProperty('variants');
  });

  it('keeps an empty body (the original is as good) and serves it back empty', async () => {
    expect((await variant('PUT', 'big0000001', 'o3-2048-78', Buffer.alloc(0))).json).toEqual({ ok: true, size: 0 });
    const r = await variant('GET', 'big0000001', 'o3-2048-78');
    expect(r.status).toBe(200);
    expect(r.bytes.length).toBe(0);
  });

  it('404s a variant that was never made, and one for an asset that does not exist', async () => {
    expect((await variant('GET', 'big0000001', 'edit')).status).toBe(404);
    expect((await variant('PUT', 'nothere001', 'edit', Buffer.from('x'))).status).toBe(404);
    expect(fs.existsSync(path.join(h.storage, 'prvariant01', '_variants', 'nothere001.edit'))).toBe(false);
  });

  it.each(['Edit', 'a.b', 'a_b', 'x'.repeat(41), 'a%20b'])('refuses the key %s', async (key) => {
    const r = await variant('PUT', 'big0000001', key, Buffer.from('x'));
    expect(r.status).toBe(400);
  });

  it.each(['text/html', 'image/svg+xml', 'image/gif', 'application/octet-stream'])('only takes a jpeg, png or webp, not %s', async (type) => {
    expect((await variant('PUT', 'big0000001', 'edit', Buffer.from('x'), type)).status).toBe(415);
  });

  it('refuses a body over the asset size limit the same way an asset does', async () => {
    const r = await variant('PUT', 'big0000001', 'edit', Buffer.alloc(61 * 1024 * 1024), 'image/jpeg');
    expect(r.status).toBe(413);
  });

  it('is gone when the asset is deleted, and when new bytes are put under the id', async () => {
    await variant('PUT', 'big0000001', 'edit', Buffer.from('1'));
    await asset('big0000001', Buffer.from('new bytes'), 'image/png');
    expect((await variant('GET', 'big0000001', 'edit')).status).toBe(404);
    await variant('PUT', 'big0000001', 'edit', Buffer.from('2'));
    await h.call('DELETE', '/api/projects/prvariant01/assets/big0000001', { user: ann });
    expect(fs.existsSync(path.join(h.storage, 'prvariant01', '_variants', 'big0000001.edit'))).toBe(false);
    expect(fs.existsSync(path.join(h.storage, 'prvariant01', '_variants', 'big0000001.edit.json'))).toBe(false);
  });

  it('keeps one asset to 8 variants, dropping the oldest', async () => {
    for (let i = 0; i < 10; i++) {
      await variant('PUT', 'big0000001', `k${i}`, Buffer.from(`v${i}`));
      const meta = path.join(h.storage, 'prvariant01', '_variants', `big0000001.k${i}.json`);
      // distinct ages, the filesystem's timestamps can tie inside one test
      fs.utimesSync(meta, new Date(2020, 0, 1 + i), new Date(2020, 0, 1 + i));
    }
    const kept = Object.keys((await h.call('GET', '/api/projects/prvariant01/assets', { user: ann })).json.find((a: { id: string }) => a.id === 'big0000001').variants);
    expect(kept.sort()).toEqual(['k2', 'k3', 'k4', 'k5', 'k6', 'k7', 'k8', 'k9']);
  });

  it('replaces a variant under the same key', async () => {
    await variant('PUT', 'big0000001', 'edit', Buffer.from('first'));
    await variant('PUT', 'big0000001', 'edit', Buffer.from('second'));
    expect((await variant('GET', 'big0000001', 'edit')).bytes.toString()).toBe('second');
  });

  it("checks the project's owner like the asset routes do", async () => {
    await variant('PUT', 'big0000001', 'edit', Buffer.from('mine'));
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await variant('PUT', 'big0000001', 'edit', Buffer.from('theirs'), 'image/webp', bob)).status).toBe(403);
    expect((await variant('GET', 'big0000001', 'edit', undefined, 'image/webp', bob)).status).toBe(403);
    process.env.SUITE_SESSION_ENFORCE = '';
    expect((await variant('GET', 'big0000001', 'edit')).bytes.toString()).toBe('mine');
  });

  it('refuses a bad asset id', async () => {
    expect((await variant('GET', 'bad', 'edit')).status).toBe(400);
  });

  it('moves with a duplicated project', async () => {
    await variant('PUT', 'big0000001', 'edit', Buffer.from('proxy'));
    const dup = await h.call('POST', '/api/projects/prvariant01/duplicate', { user: ann, json: {} });
    expect(dup.json.id).toBeTruthy();
    const r = await h.call('GET', `/api/projects/${dup.json.id}/assets/big0000001/variant/edit`, { user: ann });
    expect(r.bytes.toString()).toBe('proxy');
  });
});
