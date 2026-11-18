// @vitest-environment node
//Ask Ixia on Claude straight from Anthropic (designer-anthropic.js) with a pretend Anthropic behind their own SDK: the tool
//loop's turns go out as Claude's messages and come back as its parts, a turn's blocks go back exactly as they came, what a
//turn cost is worked out from the tokens it used, and an empty account reads as "try later", never as a bill
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { settings, client, toMessages, toParts, costOf, PRICES, DEFAULT_MODEL } = req('../designer-anthropic.js');
const { run, WORDS } = req('../designer-gemini.js');

const cfg = { key: 'secret-key', model: 'claude-haiku-5-5', url: 'http://claude.test', thinking: '' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const message = (content: unknown[], usage: Record<string, number>, stop = 'end_turn') => ({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content, stop_reason: stop, stop_sequence: null, usage });
const fail = (status: number, type: string) => json(status, { type: 'error', error: { type, message: 'what the person typed' } });
const sentBody = (f: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(String((f.mock.calls[i] as unknown as [unknown, { body: string }])[1].body));

describe('settings', () => {
  it('is on only with a key and INTERACTIVES_DESIGNER=on, on Haiku unless told otherwise, with the dollar limits', () => {
    expect(settings({}).on).toBe(false);
    expect(settings({ ANTHROPIC_API_KEY: 'k' }).on).toBe(false);
    expect(settings({ ANTHROPIC_API_KEY: 'k', INTERACTIVES_DESIGNER: 'on' })).toMatchObject({ on: true, model: 'claude-haiku-5-5', thinking: '', dailyUsd: 2, requestUsd: 0.25 });
    expect(DEFAULT_MODEL).toBe('claude-haiku-5-5');
    expect(settings({ INTERACTIVES_DESIGNER_MODEL: 'claude-sonnet-5-5', INTERACTIVES_DESIGNER_THINKING: 'Low', INTERACTIVES_DESIGNER_DAILY_USD: '5' })).toMatchObject({ model: 'claude-sonnet-5-5', thinking: 'low', dailyUsd: 5 });
  });
});

describe('what a turn cost', () => {
  it('is worked out from the tokens, with what was read back from the cache at a tenth', () => {
    // 1,000 fresh, 2,000 written to the cache, 100,000 read back, 500 written out, on Haiku
    expect(costOf('claude-haiku-5-5', { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 100000, output_tokens: 500 })).toBeCloseTo((1000 * 0.1 + 2000 * 0.125 + 100000 * 0.01 + 500 * 0.5) / 1e6);
    expect(costOf('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 })).toBeCloseTo(12);
  });

  it('counts a model that is not on the list at the dearest price, so the budget stops early and not late', () => {
    expect(costOf('claude-something-new', { input_tokens: 1e6 })).toBe(PRICES['claude-opus-5-5'].input);
  });
});

describe('turning the loop into Claude messages and back', () => {
  it('sends a turn back exactly as it came, and all the answers to one turn in one message', () => {
    const raw = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id: 't1', name: 'get_overview', input: {} }, { type: 'tool_use', id: 't2', name: 'edit', input: { changes: [] } }];
    expect(
      toMessages([
        { role: 'user', parts: [{ text: '# Request\nEarlier' }] },
        { role: 'model', parts: [{ text: 'Did it.' }] },
        { role: 'user', parts: [{ text: 'Make it red' }] },
        { role: 'model', parts: [], raw },
        { role: 'user', parts: [{ functionResponse: { name: 'get_overview', id: 't1', response: { result: 'Page 1' } } }, { functionResponse: { name: 'edit', id: 't2', response: { error: 'Error: no layer' } } }] },
      ]),
    ).toEqual([
      { role: 'user', content: [{ type: 'text', text: '# Request\nEarlier' }] },
      { role: 'assistant', content: 'Did it.' },
      { role: 'user', content: [{ type: 'text', text: 'Make it red' }] },
      { role: 'assistant', content: raw },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Page 1' }, { type: 'tool_result', tool_use_id: 't2', content: 'Error: no layer', is_error: true }] },
    ]);
  });

  it('reads words and tool calls out of an answer and leaves the thinking out', () => {
    expect(toParts([{ type: 'thinking', thinking: 'hmm' }, { type: 'text', text: 'Reading it.' }, { type: 'tool_use', id: 'a', name: 'edit', input: { changes: [1] } }])).toEqual([{ text: 'Reading it.' }, { functionCall: { name: 'edit', args: { changes: [1] }, id: 'a' } }]);
  });
});

describe('the Anthropic client', () => {
  it('asks Claude through the SDK with the key in a header, caching on, and counts what was used', async () => {
    const fetcher = vi.fn(async () => json(200, message([{ type: 'text', text: 'hi' }], { input_tokens: 200, cache_creation_input_tokens: 0, cache_read_input_tokens: 7000, output_tokens: 40 })));
    const out = await client({ ...cfg, thinking: 'low' }, fetcher).generate({ system: 'sys', contents: [{ role: 'user', parts: [{ text: 'q' }] }], tools: [{ name: 'edit', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } }] });
    expect(out.parts).toEqual([{ text: 'hi' }]);
    expect(out.usage).toMatchObject({ input: 7200, cached: 7000, output: 40, host: 'Anthropic' });
    expect(out.usage.cost).toBeCloseTo((200 * 0.1 + 7000 * 0.01 + 40 * 0.5) / 1e6);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { headers: Headers | Record<string, string> }];
    expect(String(url)).toBe('http://claude.test/v1/messages');
    expect(String(url)).not.toContain('secret-key');
    // the SDK decides which header carries the key; it is in one of them and nowhere else
    const headers = new Headers(init.headers as HeadersInit);
    expect(`${headers.get('x-api-key') ?? ''} ${headers.get('authorization') ?? ''}`).toContain('secret-key');
    expect(sentBody(fetcher)).toMatchObject({ model: 'claude-haiku-5-5', system: 'sys', cache_control: { type: 'ephemeral' }, output_config: { effort: 'low' }, tools: [{ name: 'edit', input_schema: { type: 'object' } }] });
    // nothing about thinking is sent: Haiku thinks as much as it needs by itself
    expect(sentBody(fetcher).thinking).toBeUndefined();
  });

  it('says an empty account or a limit as "try later", a bad key as unavailable, and a refusal as blocked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(client(cfg, vi.fn(async () => fail(402, 'billing_error'))).generate({ contents: [{ role: 'user', parts: [{ text: 'q' }] }] })).rejects.toMatchObject({ kind: 'limit', message: WORDS.limit });
    await expect(client(cfg, vi.fn(async () => fail(401, 'authentication_error'))).generate({ contents: [{ role: 'user', parts: [{ text: 'q' }] }] })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(client(cfg, vi.fn(async () => fail(400, 'invalid_request_error'))).generate({ contents: [{ role: 'user', parts: [{ text: 'q' }] }] })).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(client(cfg, vi.fn(async () => json(200, message([], { input_tokens: 5, output_tokens: 0 }, 'refusal')))).generate({ contents: [{ role: 'user', parts: [{ text: 'q' }] }] })).rejects.toMatchObject({ kind: 'blocked' });
    // the log has the status and the kind, never the words or the key
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/person typed|secret-key/);
    warn.mockRestore();
  });

  it('drives the same tool loop, and the request comes back with what it cost', async () => {
    const turns = [
      message([{ type: 'tool_use', id: 't1', name: 'edit', input: { changes: [{ op: 'set_props' }] } }], { input_tokens: 8000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 60 }, 'tool_use'),
      message([{ type: 'text', text: 'The title is red now.' }], { input_tokens: 300, cache_creation_input_tokens: 0, cache_read_input_tokens: 8000, output_tokens: 20 }),
    ];
    const fetcher = vi.fn(async () => json(200, turns.shift()));
    const events: { type: string; text?: string }[] = [];
    const callTool = vi.fn(async () => ({ error: false, text: 'Applied 1 change(s) as 1 op(s).' }));
    const result = await run(
      { ai: client(cfg, fetcher), tools: [{ name: 'edit', description: 'change', inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, changes: { type: 'array' } }, required: ['project_id', 'changes'] } }], callTool, build: vi.fn(), context: async () => 'Page 1', beforeEdit: async () => 'rev-1', emit: (e: { type: string }) => events.push(e), system: 'sys' },
      { projectId: 'pr1', projectName: 'Cells', firstName: '', message: 'Make the title red', state: { history: [] } },
    );
    expect(result).toMatchObject({ outcome: 'replied', rounds: 2, changed: true, usage: { input: 16300, cached: 8000, output: 80, host: 'Anthropic' } });
    expect(result.usage.cost).toBeCloseTo((8300 * 0.1 + 8000 * 0.01 + 80 * 0.5) / 1e6);
    expect(callTool).toHaveBeenCalledWith('edit', { changes: [{ op: 'set_props' }], project_id: 'pr1' });
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'The title is red now.' });
    // the tool's answer goes back under the call's id, after the turn that asked for it
    const sent = sentBody(fetcher, 1).messages;
    expect(sent.at(-2)).toEqual({ role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'edit', input: { changes: [{ op: 'set_props' }] } }] });
    expect(sent.at(-1)).toEqual({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Applied 1 change(s) as 1 op(s).' }] });
  });
});
