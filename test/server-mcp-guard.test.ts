// @vitest-environment node
//The MCP endpoint's guard rails: a limit per caller a minute (429 with Retry-After), and every tool an agent runs written
//to the audit log with who, which agent, which tool and project, and whether it worked
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startServer, type Harness } from './helpers/server-harness';

let h: Harness;
const ann = { username: 'ann' };
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  delete process.env.INTERACTIVES_MCP_PER_MIN;
  await h.close();
});

const rpc = (method: string, params: unknown, id: number, sid?: string) =>
  h.call('POST', '/mcp?agent=Tester', { user: ann, json: { jsonrpc: '2.0', id, method, params }, headers: sid ? { 'mcp-session-id': sid } : {} });

describe('MCP guard rails', () => {
  it('audits each tool call as the caller, and stops a caller who goes over the limit', async () => {
    h.db.audit.docs = [];
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }, 1);
    expect(init.status).toBe(200);
    const sid = init.headers.get('mcp-session-id')!;
    expect(sid).toBeTruthy();
    const call = await rpc('tools/call', { name: 'read_reference', arguments: { topic: 'nodes' } }, 2, sid);
    expect(call.status).toBe(200);
    await vi.waitFor(() => expect(h.db.audit.docs.filter((d) => d.event === 'agent-tool')).toHaveLength(1));
    expect(h.db.audit.docs.find((d) => d.event === 'agent-tool')).toMatchObject({ by: { username: 'ann' }, detail: { agent: 'Tester', tool: 'read_reference' } });
    // listing tools is not a tool run, so it isn't audited
    await rpc('tools/list', {}, 3, sid);
    expect(h.db.audit.docs.filter((d) => d.event === 'agent-tool')).toHaveLength(1);

    process.env.INTERACTIVES_MCP_PER_MIN = '1';
    let last = await rpc('tools/list', {}, 4, sid);
    for (let i = 0; i < 3 && last.status !== 429; i++) last = await rpc('tools/list', {}, 5 + i, sid);
    expect(last.status).toBe(429);
    expect(Number(last.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(last.json.error.message).toMatch(/Too many requests/);
  });
});
