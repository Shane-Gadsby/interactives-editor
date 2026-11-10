// @vitest-environment node
//The static files: precompressed.js makes .br and .gz copies of dist's text files into a cache folder (in the background
//after boot), reuses them while the file's size and mtime still match, and hands them out ahead of express.static when the
//browser takes them. Plain files, cache headers and everything it can't answer stay as they were.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
// @ts-expect-error plain CJS module
import precompressed from '../precompressed.js';

const express = createRequire(import.meta.url)('express');

const big = 'export const a = ' + JSON.stringify(Array.from({ length: 400 }, (_, i) => `row ${i} of repeated text`)) + ';\n';
const css = '.a{color:red}\n'.repeat(200);
const png = Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 251));
const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0L10 10"/>'.repeat(100) + '</svg>';

type Store = { serve: (root: string, o?: object) => unknown; build: () => Promise<Record<string, number>>; ready: () => number };
const make = (dir: string, cache: string): Store => precompressed(dir, cache, { quality: 5 });

const tmp = (name: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ix-${name}-`));
const listCache = (cache: string) => fs.readdirSync(cache, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => path.relative(cache, path.join(e.parentPath, e.name)).split(path.sep).join('/')).sort();

let dir: string;
let cache: string;
let store: Store;
let server: http.Server;
let base: string;
let seen: string[];
let first: Record<string, number>;

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http.request({ host: '127.0.0.1', port: Number(new URL(base).port), path: url, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });

beforeAll(async () => {
  dir = tmp('dist');
  cache = tmp('cache');
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.mkdirSync(path.join(dir, 'help'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), big);
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.css'), css);
  fs.writeFileSync(path.join(dir, 'assets', 'tiny.js'), 'let a = 1;\n');
  fs.writeFileSync(path.join(dir, 'help', 'logo.svg'), svg);
  fs.writeFileSync(path.join(dir, 'help', 'shot.png'), png);
  fs.writeFileSync(path.join(dir, 'help', 'page.html'), '<p>' + 'hello '.repeat(500) + '</p>');
  fs.writeFileSync(`${dir}-secret.js`, big);
  fs.writeFileSync(`${cache}/../${path.basename(dir)}-secret.js.br`, zlib.brotliCompressSync(big));
  seen = [];
  store = make(dir, cache);

  const app = express();
  //The same shape as index.js: the suite's setHeaders is told the plain file's path
  const options = {
    etag: true,
    lastModified: true,
    setHeaders: (res: { setHeader(k: string, v: string): void }, file: string) => {
      seen.push(file);
      res.setHeader('Cache-Control', file.endsWith('.svg') ? 'public, max-age=3600' : 'no-cache');
    },
  };
  const assets = { immutable: true, maxAge: '1y' };
  app.use('/assets', store.serve(path.join(dir, 'assets'), assets), express.static(path.join(dir, 'assets'), assets));
  app.use(store.serve(dir, options), express.static(dir, options));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  for (const p of [dir, cache, `${dir}-secret.js`, `${cache}/../${path.basename(dir)}-secret.js.br`]) fs.rmSync(p, { recursive: true, force: true });
});

describe('before the copies exist', () => {
  it('serves the plain file, marked Vary, and nothing is in the cache folder', async () => {
    const r = await get('/assets/index-abc.js', { 'accept-encoding': 'br, gzip' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(r.body.toString()).toBe(big);
    expect(store.ready()).toBe(0);
  });
});

describe('making the copies', () => {
  it('writes a smaller .br and .gz for each text file, none for tiny or picture files, and a manifest', async () => {
    first = await store.build();
    expect(first).toMatchObject({ made: 4, reused: 0 });
    for (const f of ['assets/index-abc.js', 'assets/index-abc.css', 'help/logo.svg', 'help/page.html']) {
      expect(fs.statSync(path.join(cache, f + '.br')).size).toBeLessThan(fs.statSync(path.join(cache, f + '.gz')).size);
      expect(fs.statSync(path.join(cache, f + '.gz')).size).toBeLessThan(fs.statSync(path.join(dir, f)).size);
    }
    expect(zlib.brotliDecompressSync(fs.readFileSync(path.join(cache, 'assets/index-abc.js.br'))).toString()).toBe(big);
    expect(zlib.gunzipSync(fs.readFileSync(path.join(cache, 'assets/index-abc.js.gz'))).toString()).toBe(big);
    expect(listCache(cache).filter((f) => f.includes('tiny') || f.includes('shot'))).toEqual([]);
    expect(Object.keys(JSON.parse(fs.readFileSync(path.join(cache, 'manifest.json'), 'utf8'))).sort()).toEqual(['assets/index-abc.css', 'assets/index-abc.js', 'help/logo.svg', 'help/page.html']);
    //nothing is left in the repo's dist
    expect(fs.readdirSync(path.join(dir, 'assets')).filter((f) => /\.(br|gz)$/.test(f))).toEqual([]);
  });

  it('a restart reuses every copy (a new store, the same folder) and a changed file is redone alone', async () => {
    const again = make(dir, cache);
    expect(again.ready()).toBe(4);
    const before = fs.statSync(path.join(cache, 'assets/index-abc.js.br')).mtimeMs;
    expect(await again.build()).toMatchObject({ made: 0, reused: 4, removed: 0 });
    expect(fs.statSync(path.join(cache, 'assets/index-abc.js.br')).mtimeMs).toBe(before);

    fs.writeFileSync(path.join(dir, 'help', 'page.html'), '<p>' + 'changed '.repeat(500) + '</p>');
    expect(await again.build()).toMatchObject({ made: 1, reused: 3 });
    expect(zlib.brotliDecompressSync(fs.readFileSync(path.join(cache, 'help/page.html.br'))).toString()).toContain('changed changed');
  });

  it('clears the copies of a file that has gone, and calling build twice at once is one run', async () => {
    fs.writeFileSync(path.join(dir, 'assets', 'old-123.js'), big);
    await store.build();
    expect(listCache(cache)).toContain('assets/old-123.js.br');
    fs.rmSync(path.join(dir, 'assets', 'old-123.js'));
    const [a, b] = await Promise.all([store.build(), store.build()]);
    expect(a).toBe(b);
    expect(a.removed).toBe(2);
    expect(listCache(cache).filter((f) => f.includes('old-123'))).toEqual([]);
  });

  it('skips a file that goes between listing and reading (a build still writing) and makes the rest', async () => {
    fs.writeFileSync(path.join(dir, 'assets', 'gone-1.js'), big);
    fs.writeFileSync(path.join(dir, 'assets', 'stays-1.js'), big);
    const real = fs.promises.readFile;
    const spy = vi.spyOn(fs.promises, 'readFile').mockImplementation(((p: fs.PathLike, ...rest: unknown[]) => {
      if (String(p).endsWith('gone-1.js')) return Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }));
      return (real as (...a: unknown[]) => Promise<Buffer>)(p, ...rest);
    }) as typeof fs.promises.readFile);
    try {
      await store.build();
    } finally {
      spy.mockRestore();
    }
    const files = listCache(cache);
    expect(files).toContain('assets/stays-1.js.br');
    expect(files.filter((f) => f.includes('gone-1'))).toEqual([]);
    //leave the folder as the later tests expect it
    fs.rmSync(path.join(dir, 'assets', 'gone-1.js'));
    fs.rmSync(path.join(dir, 'assets', 'stays-1.js'));
    await store.build();
  });
});

describe('serving', () => {
  it('sends brotli when it is accepted, with its own type, Vary and the suite cache header', async () => {
    const r = await get('/assets/index-abc.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(r.status).toBe(200);
    expect(r.headers['content-encoding']).toBe('br');
    expect(r.headers['content-type']).toMatch(/^(application|text)\/javascript/);
    expect(r.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(r.headers['content-length']).toBe(String(r.body.length));
    expect(zlib.brotliDecompressSync(r.body).toString()).toBe(big);
  });

  it('sends gzip to a browser without brotli, and honours q values and *', async () => {
    const g = await get('/assets/index-abc.css', { 'accept-encoding': 'gzip' });
    expect(g.headers['content-encoding']).toBe('gzip');
    expect(g.headers['content-type']).toMatch(/^text\/css/);
    expect(zlib.gunzipSync(g.body).toString()).toBe(css);
    expect((await get('/assets/index-abc.css', { 'accept-encoding': 'br;q=0, gzip' })).headers['content-encoding']).toBe('gzip');
    expect((await get('/assets/index-abc.css', { 'accept-encoding': 'br;q=0.2, gzip;q=0.9' })).headers['content-encoding']).toBe('gzip');
    expect((await get('/assets/index-abc.css', { 'accept-encoding': '*' })).headers['content-encoding']).toBe('br');
    expect((await get('/assets/index-abc.css', { 'accept-encoding': 'identity' })).headers['content-encoding']).toBeUndefined();
  });

  it('sends the plain file, still marked Vary, when nothing is accepted, and for HEAD it sends headers only', async () => {
    const r = await get('/assets/index-abc.js');
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.headers['vary']).toMatch(/Accept-Encoding/i);
    expect(r.body.toString()).toBe(big);
    const h = await get('/assets/index-abc.js', { 'accept-encoding': 'br' }, 'HEAD');
    expect(h.headers['content-encoding']).toBe('br');
    expect(h.body.length).toBe(0);
  });

  it('uses a different etag for each encoding and answers 304 on a repeat', async () => {
    const br = await get('/assets/index-abc.js', { 'accept-encoding': 'br' });
    const gz = await get('/assets/index-abc.js', { 'accept-encoding': 'gzip' });
    expect(br.headers.etag).toBeTruthy();
    expect(br.headers.etag).not.toBe(gz.headers.etag);
    const again = await get('/assets/index-abc.js', { 'accept-encoding': 'br', 'if-none-match': br.headers.etag! });
    expect(again.status).toBe(304);
    expect(again.headers['vary']).toMatch(/Accept-Encoding/i);
  });

  it('calls the suite setHeaders with the plain file path, so media and document tiers still apply', async () => {
    seen.length = 0;
    const r = await get('/help/logo.svg', { 'accept-encoding': 'br' });
    expect(r.headers['content-encoding']).toBe('br');
    expect(r.headers['content-type']).toMatch(/^image\/svg\+xml/);
    expect(r.headers['cache-control']).toBe('public, max-age=3600');
    expect(seen).toEqual([path.join(dir, 'help', 'logo.svg')]);
    const page = await get('/help/page.html', { 'accept-encoding': 'br' });
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(zlib.brotliDecompressSync(page.body).toString()).toContain('changed changed');
  });

  it('leaves pictures, tiny files, missing files and Range requests to express.static', async () => {
    const p = await get('/help/shot.png', { 'accept-encoding': 'br' });
    expect(p.headers['content-encoding']).toBeUndefined();
    expect(p.body.equals(png)).toBe(true);
    const t = await get('/assets/tiny.js', { 'accept-encoding': 'br' });
    expect(t.headers['content-encoding']).toBeUndefined();
    expect(t.body.toString()).toBe('let a = 1;\n');
    expect((await get('/assets/nothing.js', { 'accept-encoding': 'br' })).status).toBe(404);
    const ranged = await get('/assets/index-abc.js', { 'accept-encoding': 'br', range: 'bytes=0-9' });
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-encoding']).toBeUndefined();
    expect(ranged.body.toString()).toBe(big.slice(0, 10));
  });

  it('will not climb out of the folder', async () => {
    const out = await get(`/assets/..%2f..%2f${path.basename(dir)}-secret.js`, { 'accept-encoding': 'br' });
    expect(out.headers['content-encoding']).toBeUndefined();
    expect(out.status).toBeGreaterThanOrEqual(400);
    expect((await get('/assets/%zz.js', { 'accept-encoding': 'br' })).status).not.toBe(500);
  });

  it('serves the plain file once its file has changed, until the copy is made again', async () => {
    const f = path.join(dir, 'assets', 'index-abc.css');
    fs.writeFileSync(f, css + '.b{color:blue}\n');
    const r = await get('/assets/index-abc.css', { 'accept-encoding': 'br' });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.toString()).toBe(css + '.b{color:blue}\n');
    await store.build();
    const after = await get('/assets/index-abc.css', { 'accept-encoding': 'br' });
    expect(after.headers['content-encoding']).toBe('br');
    expect(zlib.brotliDecompressSync(after.body).toString()).toBe(css + '.b{color:blue}\n');
  });

  it('serves plain files when the manifest is lost or unreadable', async () => {
    fs.writeFileSync(path.join(cache, 'manifest.json'), 'not json');
    const fresh = make(dir, cache);
    expect(fresh.ready()).toBe(0);
    expect(await fresh.build()).toMatchObject({ made: 4, reused: 0 });
  });
});
