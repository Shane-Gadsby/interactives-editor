import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createArtboard, createProject, type Project } from 'interactives-player';

//The canvas is the one thing jsdom doesn't have: encodeVariant is replaced, everything else is the real client code
//talking to a fetch that behaves like the server's asset and variant routes
const encode = vi.fn();
vi.mock('../src/lib/image-optimise', async (orig) => ({ ...(await orig<typeof import('../src/lib/image-optimise')>()), encodeVariant: (...a: unknown[]) => encode(...a) }));

import { ensureProxy, optimisedFile, prepareOutputs, rememberListing, savingsFor, variantSizes, withOptimisedAssets } from '../src/lib/asset-variants';
import { standaloneHtml } from '../src/lib/export';
import { assetUrls } from '../src/lib/assets';
import { outputKey, proxyKey } from '../src/lib/image-optimise';

const NodeBlob = require('node:buffer').Blob as typeof Blob;
beforeAll(() => {
  vi.stubGlobal('Blob', NodeBlob);
});

let files: Map<string, { bytes: Uint8Array; type: string }>;
let calls: string[];
const bytesOf = (n: number, fill = 7) => new Uint8Array(n).fill(fill);

beforeEach(() => {
  files = new Map();
  calls = [];
  encode.mockReset();
  rememberListing('prop000001', []);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = new URL(url, 'http://x/').pathname.replace(/^.*\/api\//, '');
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push(`${method} ${path}`);
      if (method === 'PUT') {
        const body = init.body as Blob;
        files.set(path, { bytes: new Uint8Array(await body.arrayBuffer()), type: (init.headers as Record<string, string>)['Content-Type'] });
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (method === 'GET' && path === 'projects/prop000001/assets') {
        const rows: { id: string; mime: string; size: number; variants?: Record<string, number> }[] = [];
        for (const [k, v] of files) {
          const m = /^projects\/prop000001\/assets\/([^/]+)$/.exec(k);
          if (!m) continue;
          const variants = Object.fromEntries([...files].flatMap(([vk, vv]) => (vk.startsWith(`${k}/variant/`) ? [[vk.split('/').pop()!, vv.bytes.length]] : [])));
          rows.push({ id: m[1], mime: v.type, size: v.bytes.length, ...(Object.keys(variants).length ? { variants } : {}) });
        }
        return new Response(JSON.stringify(rows), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const f = files.get(path);
      if (!f) return new Response(JSON.stringify({ error: 'No such' }), { status: 404, headers: { 'content-type': 'application/json' } });
      return new Response(f.bytes as BlobPart, { status: 200, headers: { 'content-type': f.type } });
    }),
  );
});

const put = (assetId: string, bytes: Uint8Array, type = 'image/jpeg') => files.set(`projects/prop000001/assets/${assetId}`, { bytes, type });
const asset = (id: string, size: number, mime = 'image/jpeg') => ({ id, name: `${id}.jpg`, mime, size });
const project = (...assets: ReturnType<typeof asset>[]): Project => {
  const p = createProject('Opt');
  p.id = 'prop000001';
  p.artboards[0] = createArtboard({ name: 'A', width: 100, height: 100, children: [] });
  p.assets = assets;
  return p;
};
const variantPath = (assetId: string, key: string) => `projects/prop000001/assets/${assetId}/variant/${key}`;

describe('the canvas proxy', () => {
  it('is made once, stored under its key, and handed back to show', async () => {
    const original = new NodeBlob([bytesOf(5000)], { type: 'image/jpeg' });
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(900)], { type: 'image/jpeg' }), width: 2560, height: 1920 });
    put('big0000001', bytesOf(5000));
    const shown = await ensureProxy('prop000001', 'big0000001', 'image/jpeg', original);
    expect(shown!.size).toBe(900);
    expect(files.get(variantPath('big0000001', proxyKey()))!.bytes.length).toBe(900);
    expect(variantSizes('prop000001', 'big0000001')).toEqual({ [proxyKey()]: 900 });
    // asking again does not redo it
    expect(await ensureProxy('prop000001', 'big0000001', 'image/jpeg', original)).toBeNull();
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('records "no proxy needed" when the redraw is not smaller, so it is not tried on every load', async () => {
    const original = new NodeBlob([bytesOf(1000)], { type: 'image/jpeg' });
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(990)], { type: 'image/jpeg' }), width: 10, height: 10 });
    put('mid0000001', bytesOf(1000));
    expect(await ensureProxy('prop000001', 'mid0000001', 'image/jpeg', original)).toBeNull();
    expect(files.get(variantPath('mid0000001', proxyKey()))!.bytes.length).toBe(0);
    expect(variantSizes('prop000001', 'mid0000001')).toEqual({ [proxyKey()]: 0 });
  });

  it('never tries a vector picture or a gif', async () => {
    const svg = new NodeBlob(['<svg/>'], { type: 'image/svg+xml' });
    expect(await ensureProxy('prop000001', 'vec0000001', 'image/svg+xml', svg)).toBeNull();
    expect(encode).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('shows the original when the browser cannot make one (no canvas)', async () => {
    encode.mockResolvedValue(null);
    put('big0000001', bytesOf(5000));
    expect(await ensureProxy('prop000001', 'big0000001', 'image/jpeg', new NodeBlob([bytesOf(5000)], { type: 'image/jpeg' }))).toBeNull();
  });
});

describe('the file an export carries', () => {
  it('makes the optimised copy the first time, stores it, and reads it back the second time without redoing the work', async () => {
    put('big0000001', bytesOf(5000), 'image/png');
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(700, 9)], { type: 'image/jpeg' }), width: 2560, height: 1920 });
    const a = asset('big0000001', 5000, 'image/png');
    const first = await optimisedFile('prop000001', a, 4);
    expect(first!.mime).toBe('image/jpeg');
    expect(first!.bytes.length).toBe(700);
    expect(files.get(variantPath('big0000001', outputKey(4)))!.bytes.length).toBe(700);
    const second = await optimisedFile('prop000001', a, 4);
    expect(second!.bytes).toEqual(first!.bytes);
    expect(encode).toHaveBeenCalledTimes(1);
    // the original was fetched once, for the first make only
    expect(calls.filter((c) => c === 'GET projects/prop000001/assets/big0000001')).toHaveLength(1);
  });

  it('cares which level: another notch is another copy', async () => {
    put('big0000001', bytesOf(5000));
    encode.mockResolvedValueOnce({ blob: new NodeBlob([bytesOf(700)], { type: 'image/jpeg' }), width: 1, height: 1 }).mockResolvedValueOnce({ blob: new NodeBlob([bytesOf(300)], { type: 'image/jpeg' }), width: 1, height: 1 });
    const a = asset('big0000001', 5000);
    expect((await optimisedFile('prop000001', a, 4))!.bytes.length).toBe(700);
    expect((await optimisedFile('prop000001', a, 1))!.bytes.length).toBe(300);
    expect(Object.keys(variantSizes('prop000001', 'big0000001')!).sort()).toEqual([outputKey(1), outputKey(4)].sort());
  });

  it('uses the original, and remembers it, when the redraw is not worth it', async () => {
    put('lite000001', bytesOf(1000));
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(980)], { type: 'image/jpeg' }), width: 1, height: 1 });
    const a = asset('lite000001', 1000);
    expect(await optimisedFile('prop000001', a, 4)).toBeNull();
    expect(await optimisedFile('prop000001', a, 4)).toBeNull();
    expect(encode).toHaveBeenCalledTimes(1);
    expect(savingsFor(project(a), a)).toEqual({ output: 'same' });
  });

  it('uses the original for a picture that is not redrawn, without asking the server anything', async () => {
    expect(await optimisedFile('prop000001', asset('vec0000001', 10, 'image/svg+xml'), 4)).toBeNull();
    expect(await optimisedFile('prop000001', asset('vid0000001', 10, 'video/mp4'), 4)).toBeNull();
    expect(calls).toEqual([]);
  });

  it('uses the original when anything goes wrong', async () => {
    put('big0000001', bytesOf(5000));
    encode.mockRejectedValue(new Error('canvas lost'));
    expect(await optimisedFile('prop000001', asset('big0000001', 5000), 4)).toBeNull();
    expect(await optimisedFile('prop000001', asset('gone0000001', 5000), 4)).toBeNull();
  });

  it('takes a copy the server already listed without making it', async () => {
    put('big0000001', bytesOf(5000));
    files.set(variantPath('big0000001', outputKey(4)), { bytes: bytesOf(444, 3), type: 'image/webp' });
    rememberListing('prop000001', [{ id: 'big0000001', mime: 'image/jpeg', size: 5000, variants: { [outputKey(4)]: 444 } }]);
    const r = await optimisedFile('prop000001', asset('big0000001', 5000), 4);
    expect(r).toEqual({ bytes: bytesOf(444, 3), mime: 'image/webp' });
    expect(encode).not.toHaveBeenCalled();
  });
});

describe('the project an export is built from', () => {
  it('swaps in the optimised copies by data url, keeping ids, names and the rest', async () => {
    put('big0000001', bytesOf(5000));
    put('lite000001', bytesOf(100));
    encode.mockImplementation(async (blob: Blob) => (blob.size > 1000 ? { blob: new NodeBlob([bytesOf(500, 5)], { type: 'image/webp' }), width: 1, height: 1 } : null));
    const p = project(asset('big0000001', 5000), asset('lite000001', 100), asset('vec0000001', 10, 'image/svg+xml'));
    const out = await withOptimisedAssets(p);
    expect(out.assets.map((a) => a.id)).toEqual(['big0000001', 'lite000001', 'vec0000001']);
    expect(out.assets[0]).toMatchObject({ id: 'big0000001', name: 'big0000001.jpg', mime: 'image/webp', size: 500 });
    expect(out.assets[0].src).toMatch(/^data:image\/webp;base64,/);
    expect(out.assets[1]).toBe(p.assets[1]);
    expect(out.assets[2]).toBe(p.assets[2]);
    // the project the editor holds is not touched
    expect(p.assets[0].mime).toBe('image/jpeg');
    expect(p.assets[0].src).toBeUndefined();
  });

  it('changes nothing when Optimise output is off', async () => {
    const p = project(asset('big0000001', 5000));
    p.settings.optimiseOutput = false;
    expect(await withOptimisedAssets(p)).toBe(p);
    expect(calls).toEqual([]);
  });

  it('uses the slider: the level in the project is the level that is made', async () => {
    put('big0000001', bytesOf(5000));
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(200)], { type: 'image/jpeg' }), width: 1, height: 1 });
    const p = project(asset('big0000001', 5000));
    p.settings.optimiseLevel = 1;
    await withOptimisedAssets(p);
    expect(files.has(variantPath('big0000001', outputKey(1)))).toBe(true);
    expect(files.has(variantPath('big0000001', outputKey(4)))).toBe(false);
  });

  it('is what standaloneHtml embeds for a share or download, and the original for a preview', async () => {
    put('big0000001', bytesOf(5000, 1));
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(30, 2)], { type: 'image/webp' }), width: 1, height: 1 });
    const p = project(asset('big0000001', 5000));
    const small = await standaloneHtml(p, { optimise: true });
    expect(small).toContain('data:image/webp;base64,');
    expect(small).not.toContain('data:image/jpeg;base64,');
    const full = await standaloneHtml(p);
    expect(full).toContain('data:image/jpeg;base64,');
    expect(full).not.toContain('data:image/webp;base64,');
    p.settings.optimiseOutput = false;
    expect(await standaloneHtml(p, { optimise: true })).toContain('data:image/jpeg;base64,');
  });
});

describe('Optimise pictures now', () => {
  it('reports how many pictures and what they save', async () => {
    put('a000000001', bytesOf(5000));
    put('b000000001', bytesOf(8000));
    put('c000000001', bytesOf(120));
    encode.mockImplementation(async (blob: Blob) => (blob.size > 1000 ? { blob: new NodeBlob([bytesOf(blob.size / 10)], { type: 'image/jpeg' }), width: 1, height: 1 } : null));
    const seen: number[] = [];
    const r = await prepareOutputs(project(asset('a000000001', 5000), asset('b000000001', 8000), asset('c000000001', 120)), (d) => seen.push(d));
    expect(r).toEqual({ pictures: 2, saved: 4500 + 7200 });
    expect(seen).toEqual([1, 2, 3]);
  });
});

describe('opening a project', () => {
  const urls = new Map<string, Blob>();
  beforeEach(() => {
    urls.clear();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => (urls.set(`blob:${urls.size}`, b), `blob:${urls.size - 1}`), revokeObjectURL: () => {} }));
  });
  const shownBytes = async (id: string) => (await urls.get(assetUrls.resolve(id)!)!.arrayBuffer()).byteLength;

  it('loads the proxy where there is one and the original where not, and makes the missing proxies for big pictures afterwards', async () => {
    put('has0000001', bytesOf(400_000));
    files.set(variantPath('has0000001', proxyKey()), { bytes: bytesOf(50_000), type: 'image/webp' });
    put('big0000001', bytesOf(600_000));
    put('tiny000001', bytesOf(2_000));
    encode.mockResolvedValue({ blob: new NodeBlob([bytesOf(80_000)], { type: 'image/jpeg' }), width: 1, height: 1 });
    await assetUrls.load('prop000001');
    // the one with a stored proxy came straight from it, the original was never fetched
    expect(await shownBytes('has0000001')).toBe(50_000);
    expect(calls).not.toContain('GET projects/prop000001/assets/has0000001');
    expect(await shownBytes('tiny000001')).toBe(2_000);
    // the big one first shows its original, then swaps to the proxy it made in the background
    await vi.waitFor(async () => expect(await shownBytes('big0000001')).toBe(80_000));
    expect(files.get(variantPath('big0000001', proxyKey()))!.bytes.length).toBe(80_000);
    // the tiny one was never worth a proxy, so nothing was recorded or asked
    expect(files.has(variantPath('tiny000001', proxyKey()))).toBe(false);
    expect(encode).toHaveBeenCalledTimes(1);
  });
});
