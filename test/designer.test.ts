// @vitest-environment node
//The Activity Designer's loop on its own (designer.js), with a pretend Cogniti and pretend tools: how it reads the agent's
//tool blocks, speaks in plain words while it works, cuts what tools give back, stays in the open project and saves a
//restore point only when something is about to change
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const designer = createRequire(import.meta.url)('../designer.js');
const { settings, cogniti, run, parseCalls, statusFor, WORDS, MAX_ROUNDS } = designer;

const ndjson = (...parts: string[]) => parts.map((p) => JSON.stringify({ content: p, success: true })).join('\n') + '\n';

describe('settings', () => {
  it('is on only with a token, and off switches it off', () => {
    expect(settings({}).on).toBe(false);
    expect(settings({ COGNITI_TOKEN: 't' })).toMatchObject({ on: true, agent: '6af3a041a8d105e6274a6bdc', url: 'https://cogniti.unisq.edu.au' });
    expect(settings({ COGNITI_TOKEN: 't', INTERACTIVES_DESIGNER: 'off' }).on).toBe(false);
    expect(settings({ COGNITI_TOKEN: 't', INTERACTIVES_DESIGNER_AGENT: 'abc', INTERACTIVES_COGNITI_URL: 'http://cog.test/' })).toMatchObject({ agent: 'abc', url: 'http://cog.test' });
  });
});

describe('reading the agent', () => {
  it('finds a tool block, or none when it is plain words', () => {
    expect(parseCalls('All done, the page is called Results.')).toBeNull();
    expect(parseCalls('```tool\n[{"tool":"validate","args":{"project_id":"p"}}]\n```')).toEqual({ calls: [{ tool: 'validate', args: { project_id: 'p' } }] });
    expect(parseCalls('```tool\n{"tool":"read_reference"}\n```')).toEqual({ calls: [{ tool: 'read_reference', args: {} }] });
  });

  it('hands a broken block back as something to tell the agent', () => {
    expect(parseCalls('```tool\n[{"tool":\n```')).toMatchObject({ error: expect.stringContaining('not valid JSON') });
    expect(parseCalls('```tool\n[]\n```')).toMatchObject({ error: expect.stringContaining('no calls') });
  });

  it('says what it is doing in plain words, never a tool name', () => {
    expect(statusFor('get_layers')).toBe('Reading the project');
    expect(statusFor('join_session')).toBe('Reading the project');
    expect(statusFor('edit')).toBe('Changing the project');
    expect(statusFor('validate')).toBe('Checking the project');
    expect(statusFor('leave_session')).toBeNull();
  });
});

describe('the Cogniti client', () => {
  const cfg = { token: 'secret-token', agent: 'ag1', url: 'http://cog.test' };

  it('joins streamed lines, including ones split between chunks, and sends the token as a bearer', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const body = ndjson('Hello ', 'there');
    const half = Math.floor(body.length / 2);
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      const enc = new TextEncoder();
      return new Response(new ReadableStream({ start: (c) => (c.enqueue(enc.encode(body.slice(0, half))), c.enqueue(enc.encode(body.slice(half))), c.close()) }));
    });
    const reply = await cogniti(cfg, fetcher).send('c1', 'hi', [{ role: 'user', content: 'x', uuid: 'u' }]);
    expect(reply).toBe('Hello there');
    expect(seen[0].url).toBe('http://cog.test/api/v1/chat/message');
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(String(seen[0].init.body))).toMatchObject({ agent_id: 'ag1', conversation_id: 'c1', messages: [{ content: 'hi' }], chat_history: [{ role: 'user', content: 'x', uuid: 'u' }] });
    expect(JSON.parse(String(seen[0].init.body)).conversation_operation_id).toBeTruthy();
  });

  it('turns each failure into plain words', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const say = (status: number) => cogniti(cfg, async () => new Response(JSON.stringify({ message: 'secret detail' }), { status })).send('c', 'x', []).catch((e: Error) => e);
    expect((await say(429)).message).toBe('The Activity Designer has reached its hourly limit. Try again in a little while.');
    expect((await say(406)).message).toBe(WORDS.blocked);
    expect((await say(413)).message).toBe(WORDS.tooLong);
    expect((await say(403)).message).toBe(WORDS.forbidden);
    expect((await say(503)).message).toBe(WORDS.unavailable);
    expect((await cogniti(cfg, async () => { throw new Error('ECONNRESET'); }).send('c', 'x', []).catch((e: Error) => e)).message).toBe(WORDS.unavailable);
    expect((await cogniti(cfg, async () => new Response('')).send('c', 'x', []).catch((e: Error) => e)).message).toBe(WORDS.empty);
  });
});

//a scripted agent and tools around the real loop
const harness = (replies: (string | Error)[], tools: Record<string, (args: any) => { text: string; error?: boolean }> = {}) => {
  const sent: string[] = [];
  const events: any[] = [];
  const ai = {
    newConversation: async () => 'conv1',
    send: async (_c: string, text: string) => {
      sent.push(text);
      const r = replies.shift() ?? 'done';
      if (r instanceof Error) throw r;
      return r;
    },
  };
  const calls: string[] = [];
  const deps = {
    cogniti: ai,
    tools: [{ name: 'edit', description: 'd', inputSchema: {} }],
    guide: 'GUIDE',
    callTool: async (name: string, args: any) => {
      calls.push(name);
      return (tools[name] ?? (() => ({ text: 'ok' })))(args);
    },
    join: async () => 'Joined "Water".',
    beforeEdit: vi.fn(async () => 'rev1'),
    emit: (e: unknown) => events.push(e),
    signal: undefined as AbortSignal | undefined,
  };
  const state = { conversation: null as string | null, history: [] as { role: string; content: string }[] };
  const go = (message = 'Add a page', signal?: AbortSignal) => run({ ...deps, signal }, { projectId: 'p1', projectName: 'Water', firstName: 'Ann', message, state });
  return { deps, sent, events, calls, state, go };
};
const block = (...c: { tool: string; args?: unknown }[]) => '```tool\n' + JSON.stringify(c) + '\n```';

describe('the loop', () => {
  it('sends the tools, guide, project and request first, and carries on until the agent speaks in words', async () => {
    const h = harness([block({ tool: 'get_overview', args: { project_id: 'p1' } }), 'The page is there.']);
    const r = await h.go('Add a page called Results');
    expect(r).toEqual({ outcome: 'replied', rounds: 2, changed: false });
    expect(h.sent[0]).toContain('# Tools');
    expect(h.sent[0]).toContain('GUIDE');
    expect(h.sent[0]).toContain('id p1');
    expect(h.sent[0]).toContain('Ann');
    expect(h.sent[0]).toContain('Add a page called Results');
    expect(h.sent[0]).toContain('Joined "Water".');
    expect(h.sent[1]).toMatch(/^Tool results:\n\[/);
    expect(h.state.history.map((x) => x.role)).toEqual(['user', 'ai', 'user', 'ai']);
    expect(h.events.filter((e) => e.type === 'reply')).toEqual([{ type: 'reply', text: 'The page is there.' }]);
    for (const e of h.events.filter((x) => x.type === 'status')) expect(e.text).not.toMatch(/get_overview|edit|_/);
    expect(h.events.some((e) => e.type === 'changed')).toBe(false);
  });

  it('saves a restore point before the first change only, and says so once the change worked', async () => {
    const h = harness([block({ tool: 'edit', args: { project_id: 'p1' } }), block({ tool: 'edit', args: { project_id: 'p1' } }), 'Done.']);
    const r = await h.go();
    expect(r.changed).toBe(true);
    expect(h.deps.beforeEdit).toHaveBeenCalledTimes(1);
    expect(h.events.filter((e) => e.type === 'changed')).toEqual([{ type: 'changed', revision: 'rev1' }]);
  });

  it('does not tell the panel about a change that failed', async () => {
    const h = harness([block({ tool: 'edit', args: {} }), 'Sorry.'], { edit: () => ({ text: 'Error: no', error: true }) });
    const r = await h.go();
    expect(r.changed).toBe(false);
    expect(h.events.some((e) => e.type === 'changed')).toBe(false);
  });

  it('stops without changing anything when a restore point cannot be saved', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = harness([block({ tool: 'edit', args: {} })]);
    h.deps.beforeEdit.mockRejectedValueOnce(new Error('disk'));
    const r = await h.go();
    expect(r.outcome).toBe('error');
    expect(h.calls).toEqual([]);
    expect(h.events.at(-1)).toMatchObject({ type: 'error', text: expect.stringContaining('could not save a copy') });
  });

  it('keeps to the open project', async () => {
    const h = harness([block({ tool: 'get_overview', args: { project_id: 'someone-elses' } }), 'ok']);
    await h.go();
    expect(h.calls).toEqual([]);
    expect(h.sent[1]).toContain('only work in the project');
  });

  it('cuts what tools give back to a shared budget', async () => {
    const h = harness([block({ tool: 'a' }, { tool: 'b' }), 'ok'], { a: () => ({ text: 'x'.repeat(60000) }), b: () => ({ text: 'short' }) });
    await h.go();
    expect(h.sent[1].length).toBeLessThan(15000 + 600);
    expect(h.sent[1]).toContain('cut to fit');
    expect(h.sent[1]).toContain('short');
  });

  it('tells the agent when its block was broken and goes round again', async () => {
    const h = harness(['```tool\n[{oops\n```', 'fine']);
    expect((await h.go()).outcome).toBe('replied');
    expect(h.sent[1]).toContain('not valid JSON');
  });

  it(`gives up after ${MAX_ROUNDS} rounds with a plain message`, async () => {
    const h = harness(Array.from({ length: 40 }, () => block({ tool: 'get_overview', args: { project_id: 'p1' } })));
    const r = await h.go();
    expect(r).toMatchObject({ outcome: 'round-cap', rounds: MAX_ROUNDS });
    expect(h.events.at(-1)).toMatchObject({ type: 'reply', text: expect.stringContaining("wasn't able to finish") });
  });

  it('says the hourly limit kindly, and forgets a chat that got too long', async () => {
    const h = harness([new designer.DesignerError('limit', WORDS.limit)]);
    expect(await h.go()).toMatchObject({ outcome: 'limit' });
    expect(h.events.at(-1)).toEqual({ type: 'error', text: 'The Activity Designer has reached its hourly limit. Try again in a little while.' });
    const long = harness([new designer.DesignerError('tooLong', WORDS.tooLong)]);
    long.state.conversation = 'old';
    await long.go();
    expect(long.state.conversation).toBeNull();
  });

  it('stops after the tool it is on when the browser goes', async () => {
    const ctl = new AbortController();
    const h = harness([block({ tool: 'get_overview', args: { project_id: 'p1' } }, { tool: 'get_layers', args: { project_id: 'p1' } }), 'never']);
    const first = h.deps.callTool;
    h.deps.callTool = async (n: string, a: unknown) => {
      const out = await first(n, a);
      ctl.abort();
      return out;
    };
    const r = await h.go('x', ctl.signal);
    expect(r.outcome).toBe('cancelled');
    expect(h.calls).toEqual(['get_overview']);
    expect(h.sent).toHaveLength(1);
  });

  it('carries a follow-up on in the same conversation without the guide again', async () => {
    const h = harness(['One.', 'Two.']);
    await h.go('first');
    await h.go('second');
    expect(h.sent[1]).not.toContain('GUIDE');
    expect(h.sent[1]).toContain('second');
    expect(h.state.history).toHaveLength(4);
  });
});
