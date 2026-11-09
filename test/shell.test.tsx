import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../src/components/Shell';

const html = readFileSync(resolve(__dirname, '../index.html'), 'utf8');
// the first inline script (the early requests and the saved theme) and the markup of the shell
const early = /<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/.exec(html)![1];
const shellHtml = /<div id="root">\s*(?:<!--[\s\S]*?-->\s*)?(<div class="ix-shell"[\s\S]*?<\/div>\s*<\/div>)\s*<script>/.exec(html)![1];

const squash = (s: string) => s.replace(/\s+/g, ' ').replace(/> </g, '><').replace(/<(\w+)([^>]*?) ?\/>/g, '<$1$2></$1>').trim();

describe('the first-paint shell', () => {
  it('is the same markup in index.html and in the Editor’s opening state', () => {
    expect(squash(renderToStaticMarkup(<Shell />))).toBe(squash(shellHtml));
  });

  it('has a plain variant for pages that are not a project, and says what it is waiting for', () => {
    const plain = renderToStaticMarkup(<Shell plain label="Loading…" />);
    expect(plain).toContain('ix-shell ix-plain');
    expect(plain).toContain('Loading…');
    expect(plain).toContain('role="status"');
  });
});

describe('what index.html starts before the bundle', () => {
  const run = () => new Function(early)();
  const fetchSpy = vi.fn(() => new Promise<Response>(() => undefined));
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete (window as unknown as { __ixEarly?: unknown }).__ixEarly;
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, '', '/');
  });
  const early_ = () => (window as unknown as { __ixEarly?: { id: string; req: Record<string, unknown> } }).__ixEarly;
  const urls = () => fetchSpy.mock.calls.map((c) => (c as unknown as [string])[0]);
  const headersOf = (i: number) => ((fetchSpy.mock.calls[i] as unknown as [string, RequestInit])[1].headers as Record<string, string>)['X-Session-ID'];

  it('asks for the preferences and the open project, as the session in the address, with its header', () => {
    history.replaceState(null, '', '/?sessionID=abc#/p/proj-1');
    run();
    expect(urls()).toEqual([new URL('api/prefs', document.baseURI).href, new URL('api/projects/proj-1', document.baseURI).href]);
    expect(headersOf(0)).toBe('abc');
    expect(headersOf(1)).toBe('abc');
    expect(early_()?.id).toBe('abc');
    expect(Object.keys(early_()!.req)).toEqual(urls());
  });

  it('takes the session from the tab when the address has none, and asks only for the preferences away from a project', () => {
    sessionStorage.setItem('sessionID', 'tab');
    history.replaceState(null, '', '/#/');
    run();
    expect(urls()).toEqual([new URL('api/prefs', document.baseURI).href]);
    expect(headersOf(0)).toBe('tab');
  });

  it('asks for nothing without a session (opened directly, the editor signs in first)', () => {
    history.replaceState(null, '', '/#/p/proj-1');
    run();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(early_()).toBeUndefined();
    sessionStorage.setItem('sessionID', 'null');
    run();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('puts the saved theme on the page before anything draws (dark when there is none)', () => {
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
    localStorage.setItem('ix-prefs-user', 'sam');
    localStorage.setItem('ix-prefs:sam', JSON.stringify({ theme: 'light' }));
    run();
    expect(document.documentElement.dataset.theme).toBe('light');
    localStorage.setItem('ix-prefs:sam', '{broken');
    run();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('is left alone by the document stamper (it only rewrites script and link tags that point at a file)', () => {
    const { stampHTML } = createRequire(import.meta.url)('../../suite-libs/cache-headers.js') as { stampHTML: (h: string, v: string) => string };
    const stamped = stampHTML(html, 'abc123');
    expect(stamped).toContain(early);
    expect(stamped).toContain('new URL(path, document.baseURI).href');
  });
});
