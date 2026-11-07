// @vitest-environment node
//The Google Fonts cache (fonts-proxy.js): Google is asked once per css and once per file, everything after comes off disk, and
//nothing outside the catalog, the weights or the files a css named is ever fetched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';

const require = createRequire(import.meta.url);
const express = require('express');
const makeProxy = require('../fonts-proxy.js');

const GS = 'https://fonts.gstatic.com/l/font?kit=abc&v=1';
const GOOGLE_CSS = `/* latin */\n@font-face {\n  font-family: 'Open Sans';\n  font-weight: 400;\n  src: url(${GS}) format('woff2');\n}\n`;
const WOFF2 = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(100)]);

let dir: string;
let server: ReturnType<typeof express.application.listen>;
let base: string;
const asked: string[] = [];
let googleDown = false;
const realFetch = globalThis.fetch;

function start(extra: Record<string, string> = {}) {
  Object.assign(process.env, { INTERACTIVES_FONTS_PROXY: '', ...extra });
  const catalogFile = path.join(dir, 'catalog.json');
  fs.writeFileSync(catalogFile, JSON.stringify({ fonts: [['Open Sans', 's', [400, 700]], ['Lobster', 'd', [400]]] }));
  const app = express();
  const proxy = makeProxy({ express, storageDir: dir, catalogFile });
  app.use('/fonts', proxy.router);
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/fonts`;
      resolve();
    });
  });
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ix-fonts-'));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.startsWith('http://127.0.0.1')) return realFetch(url, init);
      asked.push(String(url));
      if (googleDown) return new Response('no', { status: 503 });
      if (String(url).startsWith('https://fonts.googleapis.com/css2')) return new Response(GOOGLE_CSS, { status: 200, headers: { 'content-type': 'text/css' } });
      if (String(url) === GS) return new Response(WOFF2, { status: 200 });
      return new Response('?', { status: 404 });
    }),
  );
});
afterEach(() => {
  asked.length = 0;
  googleDown = false;
});
afterAll(() => {
  server?.close();
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('the font cache', () => {
  it('fetches a family once, rewrites its files to this server and keeps Google\'s url as the second source', async () => {
    await start();
    const r = await realFetch(`${base}/css2?family=Open+Sans:wght@700;400`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/css');
    expect(r.headers.get('cache-control')).toBe('public, max-age=3600');
    const css = await r.text();
    const m = /url\(file\/([0-9a-f]{40})\.woff2\) format\('woff2'\), url\(https:\/\/fonts\.gstatic\.com/.exec(css);
    expect(m).toBeTruthy();
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBe('https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap');
    // again, in another order: from disk
    await realFetch(`${base}/css2?family=Open+Sans:wght@400;700`);
    expect(asked).toHaveLength(1);
    // the file: fetched on first ask, then kept, immutable
    const f1 = await realFetch(`${base}/file/${m![1]}.woff2`);
    expect(f1.status).toBe(200);
    expect(f1.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(f1.headers.get('content-type')).toBe('font/woff2');
    expect(Buffer.from(await f1.arrayBuffer()).subarray(0, 4).toString()).toBe('wOF2');
    await realFetch(`${base}/file/${m![1]}.woff2`);
    expect(asked.filter((u) => u === GS)).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, '_fonts', 'files', `${m![1]}.woff2`))).toBe(true);
  });

  it('answers a name preview, and only for the family\'s own name', async () => {
    expect((await realFetch(`${base}/css2?family=Lobster&text=Lobster`)).status).toBe(200);
    expect(asked.pop()).toContain('&text=Lobster');
    expect((await realFetch(`${base}/css2?family=Lobster&text=anything+else`)).status).toBe(400);
  });

  it('refuses what is not a catalog family, a weight, a hash or a url it wrote down', async () => {
    for (const q of ['family=Comic+Nope', 'family=Open+Sans:wght@4', 'family=Open+Sans:ital,wght@0,400', 'family=../etc/passwd', 'family=Open+Sans:wght@400&text=x', '']) {
      const r = await realFetch(`${base}/css2?${q}`);
      expect([400, 404], q).toContain(r.status);
    }
    for (const n of ['0000000000000000000000000000000000000000.woff2', '../css/x.woff2', 'abc.woff2', 'g'.repeat(40) + '.woff2']) expect((await realFetch(`${base}/file/${encodeURIComponent(n)}`)).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it('is soft when Google is down (a gateway error, remembered for a few minutes)', async () => {
    googleDown = true;
    expect((await realFetch(`${base}/css2?family=Open+Sans:wght@600`)).status).toBe(502);
    expect((await realFetch(`${base}/css2?family=Open+Sans:wght@600`)).status).toBe(502);
    expect(asked).toHaveLength(1);
  });

  it('limits how often one address can make it call Google (cache hits are free)', async () => {
    const combos: string[] = [];
    for (let m = 1; m < 512 && combos.length < 200; m++) combos.push([100, 200, 300, 400, 500, 600, 700, 800, 900].filter((_, i) => m & (1 << i)).join(';'));
    const seen = new Set<number>();
    for (const c of combos) seen.add((await realFetch(`${base}/css2?family=Open+Sans:wght@${c}`)).status);
    expect(seen.has(429)).toBe(true);
    const calls = asked.length;
    // something already kept is still served
    expect((await realFetch(`${base}/css2?family=Open+Sans:wght@100`)).status).toBe(200);
    expect(asked.length).toBe(calls);
  });

  it('turns off with INTERACTIVES_FONTS_PROXY=off', async () => {
    server.close();
    await start({ INTERACTIVES_FONTS_PROXY: 'off' });
    expect((await realFetch(`${base}/css2?family=Open+Sans:wght@500`)).status).toBe(404);
    expect(asked).toEqual([]);
    process.env.INTERACTIVES_FONTS_PROXY = '';
  });
});
