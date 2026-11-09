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

describe('the direct sign in a review link asks for', () => {
  let asked: { tool: string; options: Record<string, unknown> }[];
  const answers: Record<string, unknown> = {};

  beforeEach(() => {
    vi.resetModules();
    asked = [];
    sessionStorage.clear();
    for (const k of Object.keys(answers)) delete answers[k];
    (window as unknown as { directSignIn: unknown }).directSignIn = async (tool: string, options: Record<string, unknown> = {}) => {
      asked.push({ tool, options });
      return answers[tool] ?? null;
    };
  });

  afterEach(() => {
    delete (window as unknown as { directSignIn?: unknown }).directSignIn;
    location.hash = '';
    sessionStorage.clear();
  });

  it('is the editor sign in on any other page', async () => {
    location.hash = '#/';
    const { sessionUser } = await import('../src/lib/session');
    await sessionUser();
    expect(asked.map((a) => a.tool)).toEqual(['interactives']);
  });

  it('uses an editor sign in the browser already holds, without a box', async () => {
    location.hash = '#/review/abcdefghijklmnop';
    answers.interactives = { sessionID: 'dt_have' };
    const { sessionUser } = await import('../src/lib/session');
    await sessionUser();
    expect(asked).toEqual([{ tool: 'interactives', options: { title: 'Interactives', prompt: false } }]);
  });

  it('otherwise asks to sign in as a reviewer, which any staff member can', async () => {
    location.hash = '#/review/abcdefghijklmnop';
    const { sessionUser } = await import('../src/lib/session');
    await sessionUser();
    expect(asked.map((a) => a.tool)).toEqual(['interactives', 'interactives-review']);
    expect(asked[1].options.prompt).toBeUndefined();
  });

  it('asks for nothing inside StudyDesk, where the url or the tab already carries a session', async () => {
    location.hash = '#/review/abcdefghijklmnop';
    sessionStorage.setItem('sessionID', 'abc123');
    const { sessionUser } = await import('../src/lib/session');
    await sessionUser();
    expect(asked).toEqual([]);
  });
});

