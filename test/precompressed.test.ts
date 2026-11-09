// @vitest-environment node
//The static files: scripts/precompress.mjs writes .br and .gz beside each text file, and precompressed.js (mounted
//ahead of express.static in index.js) hands them out when the browser takes them. Plain files, cache headers and
//everything it can't answer stay as they were.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
// @ts-expect-error plain ESM script
import { precompress } from '../scripts/precompress.mjs';
// @ts-expect-error plain CJS module
import precompressed from '../precompressed.js';

const express = createRequire(import.meta.url)('express');

const big = 'export const a = ' + JSON.stringify(Array.from({ length: 400 }, (_, i) => `row ${i} of repeated text`)) + ';\n';
const css = '.a{color:red}\n'.repeat(200);
const png = Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 7919) % 251));
const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0L10 10"/>'.repeat(100) + '</svg>';

let dir: string;
let server: http.Server;
let base: string;
let seen: string[];

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    http.request({ host: '127.0.0.1', port: Number(new URL(base).port), path: url, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject).end();
  });

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-pre-'));
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.mkdirSync(path.join(dir, 'help'));
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.js'), big);
  fs.writeFileSync(path.join(dir, 'assets', 'index-abc.css'), css);
  fs.writeFileSync(path.join(dir, 'assets', 'tiny.js'), 'let a = 1;\n');
  fs.writeFileSync(path.join(dir, 'help', 'logo.svg'), svg);
  fs.writeFileSync(path.join(dir, 'help', 'shot.png'), png);
  fs.writeFileSync(path.join(dir, 'help', 'page.html'), '<p>' + 'hello '.repeat(500) + '</p>');
  fs.writeFileSync(`${dir}-secret.js`, big);
  fs.writeFileSync(`${dir}-secret.js.br`, zlib.brotliCompressSync(big));
  await precompress(dir);
  seen = [];

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
  app.use('/assets', precompressed(path.join(dir, 'assets'), assets), express.static(path.join(dir, 'assets'), assets));
  app.use(precompressed(dir, options), express.static(dir, options));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(`${dir}-secret.js`, { force: true });
  fs.rmSync(`${dir}-secret.js.br`, { force: true });
});

describe('precompress script', () => {
  it('writes a smaller .br and .gz beside each text file and none for tiny, picture or unsmaller files', () => {
    for (const f of ['assets/index-abc.js', 'assets/index-abc.css', 'help/logo.svg', 'help/page.html']) {
      expect(fs.statSync(path.join(dir, f + '.br')).size).toBeLessThan(fs.statSync(path.join(dir, f + '.gz')).size);
      expect(fs.statSync(path.join(dir, f + '.gz')).size).toBeLessThan(fs.statSync(path.join(dir, f)).size);
    }
    expect(zlib.brotliDecompressSync(fs.readFileSync(path.join(dir, 'assets/index-abc.js.br'))).toString()).toBe(big);
    expect(zlib.gunzipSync(fs.readFileSync(path.join(dir, 'assets/index-abc.js.gz'))).toString()).toBe(big);
    expect(fs.existsSync(path.join(dir, 'assets/tiny.js.br'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'help/shot.png.br'))).toBe(false);
  });

  it('clears copies whose file has gone and copies that stopped being smaller', async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-pre2-'));
    fs.writeFileSync(path.join(d, 'gone.js.br'), 'x');
    fs.writeFileSync(path.join(d, 'noise.json'), Buffer.from(Array.from({ length: 3000 }, (_, i) => 48 + ((i * 7919) % 10) + ((i * 31) % 7))).toString('latin1'));
    fs.writeFileSync(path.join(d, 'noise.json.gz'), 'old');
    const r = await precompress(d);
    expect(fs.existsSync(path.join(d, 'gone.js.br'))).toBe(false);
    expect(r.files).toBe(1);
    fs.rmSync(d, { recursive: true, force: true });
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
    expect(zlib.brotliDecompressSync(page.body).toString()).toContain('hello hello');
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

  it('ignores a copy left from an older build of the file', async () => {
    const f = path.join(dir, 'assets', 'index-abc.css');
    const later = new Date(Date.now() + 60000);
    fs.utimesSync(f, later, later);
    const r = await get('/assets/index-abc.css', { 'accept-encoding': 'br' });
    expect(r.headers['content-encoding']).toBeUndefined();
    expect(r.body.toString()).toBe(css);
  });

  it('will not climb out of the folder or serve dotfiles', async () => {
    const out = await get(`/assets/..%2f..%2f${path.basename(dir)}-secret.js`, { 'accept-encoding': 'br' });
    expect(out.headers['content-encoding']).toBeUndefined();
    expect(out.status).toBeGreaterThanOrEqual(400);
    expect((await get('/assets/%zz.js', { 'accept-encoding': 'br' })).status).not.toBe(500);
  });
});
