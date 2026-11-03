import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM shared with index.js
import { RESERVED_IDS, assetHeaders, newProjectID, shareHeaders, validID } from '../shared/safety.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fakeRes = () => {
  const headers: Record<string, string> = {};
  return { headers, setHeader: (k: string, v: string) => (headers[k] = v) };
};

describe('server ids', () => {
  it('accepts the ids the editor makes', () => {
    for (const id of ['prabc1d2e3', 'asdf1234', 'pr0-1_x', 'a'.repeat(64), 'prlk3j2abcde']) expect(validID(id), id).toBe(true);
  });
  it('refuses the names storage/ uses for its own folders, and anything starting with _', () => {
    for (const id of ['shares', 'thumbs', '_libraries', 'Shares', 'THUMBS', '_anything', '_abc', ...RESERVED_IDS]) expect(validID(id), id).toBe(false);
  });
  it('refuses malformed ids', () => {
    for (const id of ['', 'abc', '../etc', 'a/b/c/d', 'ab cd', 'abcd.json', 'a'.repeat(65), null, undefined, 5, {}, ['abcd']]) expect(validID(id as never), String(id)).toBe(false);
  });
  it('makes new project ids that are valid, and different every time', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newProjectID()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(validID(id)).toBe(true);
  });
});

describe('asset headers', () => {
  const headersFor = (mime: string | undefined) => {
    const r = fakeRes();
    assetHeaders(r, mime);
    return r.headers;
  };

  it('keeps the type of files that cannot be a page, and says nosniff', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'audio/mpeg', 'font/woff2', 'font/ttf', 'application/font-woff', 'application/x-font-ttf', 'application/vnd.ms-fontobject', 'application/json', 'text/csv', 'text/plain', 'text/plain; charset=utf-8', 'text/tab-separated-values']) {
      const h = headersFor(mime);
      expect(h['Content-Type'], mime).toBe(mime);
      expect(h['X-Content-Type-Options'], mime).toBe('nosniff');
      expect(h['Content-Disposition'], mime).toBeUndefined();
    }
  });

  it('serves anything else as a download', () => {
    for (const mime of ['text/html', 'text/html; charset=utf-8', 'application/xhtml+xml', 'text/xml', 'application/xml', 'application/pdf', 'application/javascript', 'text/javascript', 'application/octet-stream', 'application/x-photoshop', '', undefined, 'garbage', 'TEXT/HTML', 'text/html\r\nSet-Cookie: a=b']) {
      const h = headersFor(mime);
      expect(h['Content-Type'], String(mime)).toBe('application/octet-stream');
      expect(h['Content-Disposition'], String(mime)).toBe('attachment');
      expect(h['X-Content-Type-Options']).toBe('nosniff');
    }
  });

  it('serves svg as a picture that cannot run scripts', () => {
    for (const mime of ['image/svg+xml', 'IMAGE/SVG+XML', 'image/svg+xml; charset=utf-8', 'image/x-svg']) {
      const h = headersFor(mime);
      expect(h['Content-Type']).toBe('image/svg+xml');
      expect(h['Content-Security-Policy']).toMatch(/^default-src 'none'; style-src 'unsafe-inline'; img-src data:/);
      expect(h['X-Content-Type-Options']).toBe('nosniff');
      expect(h['Content-Disposition']).toBeUndefined();
    }
  });

  it('never lets a header line be injected through a mime type', () => {
    const h = headersFor('image/png\r\nX-Evil: 1');
    expect(JSON.stringify(h)).not.toMatch(/Evil/);
  });
});

describe('share headers', () => {
  it('sandbox shared pages without allow-same-origin', () => {
    const r = fakeRes();
    shareHeaders(r);
    expect(r.headers['Content-Security-Policy']).toMatch(/^sandbox /);
    expect(r.headers['Content-Security-Policy']).toContain('allow-scripts');
    expect(r.headers['Content-Security-Policy']).not.toContain('allow-same-origin');
    expect(r.headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('index.js wiring', () => {
  const src = readFileSync(resolve(process.cwd(), 'index.js'), 'utf8');
  it('uses the shared checks on every asset route and the share route', () => {
    expect(src.match(/safety\.assetHeaders\(res, meta\.mime\)/g)?.length).toBe(2);
    expect(src).toContain('safety.shareHeaders(res)');
    expect(src).not.toMatch(/res\.type\(meta\.mime\)/);
    expect(src).toContain('validID = (id) => safety.validID(id)');
  });
  it('makes the duplicate id on the server, and never takes one from the body', () => {
    const route = src.slice(src.indexOf("router.post('/api/projects/:id/duplicate'"), src.indexOf("//Asset routes check the project's owner too"));
    expect(route).toContain('safety.newProjectID()');
    expect(route).not.toMatch(/req\.body\.newId/);
    expect(route.indexOf('mayChange(req, res, doc)')).toBeGreaterThan(-1);
    expect(route.indexOf('mayChange(req, res, doc)')).toBeLessThan(route.indexOf('fs.promises.cp'));
  });
});
