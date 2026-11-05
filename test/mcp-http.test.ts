import { afterEach, describe, expect, it } from 'vitest';

process.env.INTERACTIVES_MCP_NO_STDIO = '1';

describe('MCP context per connection', () => {
  afterEach(() => undefined);

  it('runs each call with its own base url, session id and agent name, and the stdio context is left alone', async () => {
    const mcp = await import('../mcp/server');
    const calls: { url: string; sid: string | null }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), sid: new Headers(init?.headers).get('X-Session-ID') });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    try {
      const a = { base: 'http://a.test/interactives', sessionId: 'sid-a', agent: 'Ann', sessions: new Map() };
      const b = { base: 'http://b.test/interactives', sessionId: 'sid-b', agent: 'Bob', sessions: new Map() };
      const call = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_projects', arguments: {} } };
      const [ra, rb] = await Promise.all([mcp.runAs(a, () => mcp.respond(call as never)), mcp.runAs(b, () => mcp.respond(call as never))]);
      expect(ra?.id).toBe(1);
      expect(rb?.id).toBe(1);
      expect(calls.find((c) => c.url.startsWith('http://a.test/'))?.sid).toBe('sid-a');
      expect(calls.find((c) => c.url.startsWith('http://b.test/'))?.sid).toBe('sid-b');
      expect(mcp.sessions.size).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('respond gives nothing back for a notification', async () => {
    const mcp = await import('../mcp/server');
    expect(await mcp.respond({ method: 'notifications/initialized' } as never)).toBeUndefined();
    expect(await mcp.respond({ id: 7, method: 'ping' } as never)).toEqual({ jsonrpc: '2.0', id: 7, result: {} });
  });
});
