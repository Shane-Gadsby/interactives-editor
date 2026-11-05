import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('installSessionHeader', () => {
  let seen: { url: string; headers: Headers }[];
  let original: typeof window.fetch;

  beforeEach(() => {
    vi.resetModules();
    seen = [];
    original = window.fetch;
    window.fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      seen.push({ url: String(input instanceof Request ? input.url : input), headers: new Headers(init.headers) });
      return new Response('{}');
    }) as typeof window.fetch;
    sessionStorage.clear();
  });

  afterEach(() => {
    window.fetch = original;
    sessionStorage.clear();
  });

  it("sends this tab's session id on same-origin fetches only, keeping the other headers", async () => {
    sessionStorage.setItem('sessionID', 'dt_abc');
    const { installSessionHeader } = await import('../src/lib/session');
    installSessionHeader();
    installSessionHeader(); // twice is still one wrapper
    await fetch(new URL('api/projects', location.href).href, { headers: { 'Content-Type': 'application/json' } });
    await fetch('https://fonts.googleapis.com/css2?family=Open+Sans');
    expect(seen[0].headers.get('X-Session-ID')).toBe('dt_abc');
    expect(seen[0].headers.get('Content-Type')).toBe('application/json');
    expect(seen[1].headers.get('X-Session-ID')).toBeNull();
  });

  it('holds calls to its own server until a direct sign in has stored the session, and nothing else', async () => {
    let finish!: () => void;
    (window as unknown as { directSignIn: unknown }).directSignIn = () =>
      new Promise<void>((resolve) => {
        finish = () => {
          sessionStorage.setItem('sessionID', 'dt_late');
          resolve();
        };
      });
    try {
      const { installSessionHeader } = await import('../src/lib/session');
      installSessionHeader();
      const own = fetch(new URL('api/projects', document.baseURI).href);
      const other = fetch('https://example.org/x');
      await other;
      expect(seen.map((s) => s.url)).toEqual(['https://example.org/x']);
      finish();
      await own;
      expect(seen[1].headers.get('X-Session-ID')).toBe('dt_late');
    } finally {
      delete (window as unknown as { directSignIn?: unknown }).directSignIn;
    }
  });

  it('sends nothing extra without a session', async () => {
    const { installSessionHeader } = await import('../src/lib/session');
    installSessionHeader();
    await fetch(new URL('api/projects', location.href).href);
    expect(seen[0].headers.get('X-Session-ID')).toBeNull();
  });
});
