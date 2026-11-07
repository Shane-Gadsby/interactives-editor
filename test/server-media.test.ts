// @vitest-environment node
//The media bridge on the server: what a share link records of a project's declared sensors, what the learner page does with it (the
//trusted bridge, the nonce in the frame's address, the one CSP allowance) and that the page is exactly what the player's tests run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness, type User } from './helpers/server-harness';
// @ts-expect-error plain ESM, the same list the bundle is built from
import { sourcesHash } from '../scripts/media-sources.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ann: User = { username: 'ann', fullName: 'Ann A' };

const project = (id: string, sensors?: unknown) => ({ format: 'interactives', id, name: `Project ${id}`, settings: sensors === undefined ? {} : { sensors }, artboards: [{ id: 'ab1', name: 'Main', width: 800, height: 600, background: { type: 'solid', color: '#123456' }, children: [] }] });
const pageOf = (p: unknown) => `<!doctype html><html><head><title>x</title></head><body><script type="application/json" id="ix-project">${JSON.stringify(p).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</script><script>player()</script></body></html>`;

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
  await h.call('PUT', '/api/projects/prmedia001', { user: ann, json: { project: project('prmedia001'), rev: 0 } });
});

const share = async (p: unknown) => (await h.call('PUT', '/api/projects/prmedia001/share', { user: ann, body: pageOf(p), type: 'text/plain' })).json.share;
const play = (token: string) => h.call('GET', `/play/${token}`);
const stored = () => h.db.projects.docs.find((d: any) => d._id === 'prmedia001')!.share;

describe('what a share link records', () => {
  it('keeps the declaration, cleaned, on the share record', async () => {
    const s = await share(project('prmedia001', { microphone: true, purpose: '  record\nyour answer ', bogus: 'x', maxSeconds: 9999 }));
    expect(s.sensors).toEqual({ microphone: true, purpose: 'record your answer', maxSeconds: 600 });
    expect(stored().sensors).toEqual(s.sensors);
  });

  it('keeps nothing for a project that declares nothing, or only words', async () => {
    expect((await share(project('prmedia001'))).sensors).toBeUndefined();
    expect((await share(project('prmedia001', { purpose: 'words only' }))).sensors).toBeUndefined();
    expect((await share(project('prmedia001', 'microphone'))).sensors).toBeUndefined();
  });

  it('follows the page: updating without sensors drops them, and a revert brings back the ones the old page had', async () => {
    await share(project('prmedia001', { camera: true }));
    const s2 = await share(project('prmedia001'));
    expect(s2.sensors).toBeUndefined();
    expect(s2.previous.sensors).toEqual({ camera: true });
    const back = await h.call('POST', '/api/projects/prmedia001/share/revert', { user: ann });
    expect(back.json.share.sensors).toEqual({ camera: true });
    expect(back.json.share.previous.sensors).toBeUndefined();
    const again = await h.call('POST', '/api/projects/prmedia001/share/revert', { user: ann });
    expect(again.json.share.sensors).toBeUndefined();
    expect(again.json.share.previous.sensors).toEqual({ camera: true });
  });
});

describe('the learner page with a declaration', () => {
  it('has the bridge, a nonce in the frame address that the bridge expects, and only what was declared', async () => {
    const s = await share(project('prmedia001', { microphone: true, purpose: 'record your answer' }));
    const r = await play(s.token);
    const nonce = /#ixm=([0-9a-f]{32})"/.exec(r.text)![1];
    expect(r.text).toContain(`src="/interactives/s/${s.token}#ixm=${nonce}"`);
    expect(r.text).toContain('<script type="module" nonce="');
    expect(r.text).toContain('import {startBridge} from "/interactives/media-bridge.mjs"');
    expect(r.text).toContain(`nonce: "${nonce}"`);
    expect(r.text).toContain('declaration: {"microphone":true,"purpose":"record your answer"}');
    expect(r.text).not.toContain('allow-same-origin');
  });

  it('makes a new bridge nonce for every load, apart from the page nonce', async () => {
    const s = await share(project('prmedia001', { microphone: true }));
    const a = await play(s.token);
    const b = await play(s.token);
    const na = /#ixm=([0-9a-f]{32})/.exec(a.text)![1];
    expect(na).not.toBe(/#ixm=([0-9a-f]{32})/.exec(b.text)![1]);
    expect(a.headers.get('content-security-policy')).not.toContain(na);
  });

  it('adds media-src blob: to the policy and nothing else', async () => {
    const s = await share(project('prmedia001', { camera: true }));
    const csp = (await play(s.token)).headers.get('content-security-policy')!;
    expect(csp).toContain("media-src blob:");
    expect(csp).toBe(`default-src 'none'; script-src 'nonce-${/nonce-([^']+)'/.exec(csp)![1]}' 'self'; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'self'; media-src blob:; base-uri 'none'; form-action 'none'`);
  });

  it('cannot be broken out of by what the author wrote in the purpose', async () => {
    const s = await share(project('prmedia001', { microphone: true, purpose: '</script><script>alert(1)</script>' }));
    const r = await play(s.token);
    expect(r.text).not.toContain('</script><script>alert(1)');
    expect(r.text).toContain('\\u003c/script\\u003e');
  });

  it('is the same page as before for a project that declares nothing', async () => {
    const s = await share(project('prmedia001'));
    const r = await play(s.token);
    expect(r.text).toContain(`src="/interactives/s/${s.token}"`);
    expect(r.text).not.toContain('#ixm=');
    expect(r.text).not.toContain('type="module"');
    expect(r.text).not.toContain('media-bridge');
  });
});

describe('the bridge file', () => {
  it('is served as a module, revalidated, with the bridge in it', async () => {
    const r = await h.call('GET', '/media-bridge.mjs');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/javascript/);
    expect(r.headers.get('cache-control')).toBe('no-cache');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.text).toContain('export {');
    expect(r.text).toContain('startBridge');
  });

  it('is built from the player as it is now', () => {
    const head = fs.readFileSync(path.join(here, '../shared/media-bridge.mjs'), 'utf8').split('\n')[0];
    expect(head).toBe(`/*! built from the player's media sources ${sourcesHash()} */`);
  });

  it('opens no device by itself and has no network or storage of its own beyond the opt-out', () => {
    const src = fs.readFileSync(path.join(here, '../shared/media-bridge.mjs'), 'utf8');
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/XMLHttpRequest|sendBeacon|WebSocket/);
    expect(src).not.toMatch(/\beval\s*\(|new Function/);
    expect(src.match(/localStorage/g)!.length).toBeLessThan(6);
  });
});
