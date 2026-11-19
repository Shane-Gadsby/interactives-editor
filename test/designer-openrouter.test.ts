// @vitest-environment node
//Ask Ixia on OpenRouter (designer-openrouter.js) with a pretend OpenRouter: the tool loop's turns go out as chat messages and
//come back as its parts, a request only goes to hosts that refuse data collection (and only the named ones when some are
//named), what a turn used is counted, and what goes wrong comes back in words a course designer can read
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { settings, client, toMessages, toParts, DEFAULT_MODEL, DEFAULT_DAILY_USD, DEFAULT_REQUEST_USD } = req('../designer-openrouter.js');
const { run, WORDS } = req('../designer-gemini.js');

const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const none = async () => undefined;
const cfg = { key: 'secret-key', model: 'deepseek/deepseek-v4-pro', url: 'http://or.test/api', thinking: 'medium', hosts: ['DeepInfra', 'Together'] };

describe('settings', () => {
  it('is on only with a key and INTERACTIVES_DESIGNER=on, and reads the model, the thinking and the hosts', () => {
    expect(settings({}).on).toBe(false);
    expect(settings({ OPENROUTER_API_KEY: 'k' }).on).toBe(false);
    expect(settings({ OPENROUTER_API_KEY: 'k', INTERACTIVES_DESIGNER: 'on' })).toMatchObject({ on: true, model: DEFAULT_MODEL, url: 'https://openrouter.ai/api', hosts: [], thinking: '' });
    expect(settings({ INTERACTIVES_DESIGNER_MODEL: 'z-ai/glm-5.3', INTERACTIVES_DESIGNER_HOSTS: 'DeepInfra, Together ,', INTERACTIVES_DESIGNER_THINKING: 'Low' })).toMatchObject({ model: 'z-ai/glm-5.3', hosts: ['DeepInfra', 'Together'], thinking: 'low' });
  });
});

describe('the dollar limits', () => {
  it('has a daily budget and a ceiling for one request unless told otherwise, and 0 or off is no limit', () => {
    expect(DEFAULT_MODEL).toBe('anthropic/claude-haiku-5.5');
    expect(settings({})).toMatchObject({ dailyUsd: DEFAULT_DAILY_USD, requestUsd: DEFAULT_REQUEST_USD });
    expect(settings({ INTERACTIVES_DESIGNER_DAILY_USD: '10', INTERACTIVES_DESIGNER_REQUEST_USD: '0.5' })).toMatchObject({ dailyUsd: 10, requestUsd: 0.5 });
    expect(settings({ INTERACTIVES_DESIGNER_DAILY_USD: 'off', INTERACTIVES_DESIGNER_REQUEST_USD: '0' })).toMatchObject({ dailyUsd: 0, requestUsd: 0 });
    // something unreadable is the default, never "no limit"
    expect(settings({ INTERACTIVES_DESIGNER_DAILY_USD: 'lots', INTERACTIVES_DESIGNER_REQUEST_USD: '-3' })).toMatchObject({ dailyUsd: DEFAULT_DAILY_USD, requestUsd: DEFAULT_REQUEST_USD });
  });
});

describe('turning the loop into chat messages and back', () => {
  it('writes requests, tool calls and their answers the way chat completions wants them', () => {
    const raw = { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'edit', arguments: '{"changes":[]}' } }], reasoning_details: [{ type: 'x' }] };
    const messages = toMessages('sys', [
      { role: 'user', parts: [{ text: 'Make it red' }] },
      { role: 'model', parts: [{ functionCall: { name: 'get_overview', args: { depth: 2 }, id: 'c0' } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'get_overview', id: 'c0', response: { result: 'Page 1' } } }] },
      { role: 'model', parts: [], raw },
      { role: 'user', parts: [{ functionResponse: { name: 'edit', id: 'c1', response: { error: 'Error: no layer' } } }] },
    ]);
    expect(messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Make it red' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'c0', type: 'function', function: { name: 'get_overview', arguments: '{"depth":2}' } }] },
      { role: 'tool', tool_call_id: 'c0', content: 'Page 1' },
      // a turn that came from here goes back exactly as it arrived, reasoning and all
      raw,
      { role: 'tool', tool_call_id: 'c1', content: 'Error: no layer' },
    ]);
  });

  it('reads words and tool calls out of an answer, and arguments that are not JSON become an empty call', () => {
    expect(toParts({ content: 'Reading it.', tool_calls: [{ id: 'a', function: { name: 'edit', arguments: '{"changes":[1]}' } }, { id: 'b', function: { name: 'validate', arguments: '{oops' } }] })).toEqual([
      { text: 'Reading it.' },
      { functionCall: { name: 'edit', args: { changes: [1] }, id: 'a' } },
      { functionCall: { name: 'validate', args: {}, id: 'b' } },
    ]);
    expect(toParts({ content: null })).toEqual([]);
  });
});

describe('the OpenRouter client', () => {
  const answer = { provider: 'DeepInfra', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'hi' } }], usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0012, prompt_tokens_details: { cached_tokens: 700 } } };

  it('sends the key in a header, refuses data collection, keeps to the named hosts and counts what was used', async () => {
    const fetcher = vi.fn(async () => res(200, answer));
    const out = await client(cfg, fetcher, none).generate({ system: 'sys', contents: [{ role: 'user', parts: [{ text: 'q' }] }], tools: [{ name: 'edit', description: 'd', parametersJsonSchema: { type: 'object', properties: {} } }] });
    expect(out.parts).toEqual([{ text: 'hi' }]);
    expect(out.content.raw).toEqual(answer.choices[0].message);
    expect(out.usage).toEqual({ input: 900, cached: 700, output: 40, cost: 0.0012, host: 'DeepInfra' });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://or.test/api/v1/chat/completions');
    expect(url).not.toContain('secret-key');
    expect(init.headers.Authorization).toBe('Bearer secret-key');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'deepseek/deepseek-v4-pro', provider: { data_collection: 'deny', only: ['DeepInfra', 'Together'] }, reasoning: { effort: 'medium' }, tools: [{ type: 'function', function: { name: 'edit' } }] });

    // no hosts named: any host, but still none that keeps what it is sent
    await client({ ...cfg, hosts: [], thinking: '' }, fetcher, none).generate({ contents: [] });
    const second = JSON.parse((fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body);
    expect(second.provider).toEqual({ data_collection: 'deny' });
    expect(second.reasoning).toBeUndefined();
    // only Claude has to be asked to read the opening again cheaply
    expect(second.cache_control).toBeUndefined();
    await client({ ...cfg, model: 'anthropic/claude-sonnet-5.5' }, fetcher, none).generate({ contents: [] });
    expect(JSON.parse((fetcher.mock.calls[2] as unknown as [string, { body: string }])[1].body).cache_control).toEqual({ type: 'ephemeral' });
  });

  it('tries once more when a host is busy, and says a limit or an empty account in plain words', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const busy = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200, answer));
    expect((await client(cfg, busy, none).generate({ contents: [] })).parts).toEqual([{ text: 'hi' }]);
    // a host that fell over mid-answer answers 200 with an error inside
    const inside = vi.fn().mockResolvedValueOnce(res(200, { error: { code: 502, message: 'what the person typed' } })).mockResolvedValueOnce(res(200, answer));
    expect((await client(cfg, inside, none).generate({ contents: [] })).parts).toEqual([{ text: 'hi' }]);
    await expect(client(cfg, vi.fn(async () => res(429)), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'limit', message: WORDS.limit });
    await expect(client(cfg, vi.fn(async () => res(402)), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'limit' });
    await expect(client(cfg, vi.fn(async () => res(401)), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(client(cfg, vi.fn(async () => res(200, { choices: [] })), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'empty' });
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/person typed|secret-key/);
    warn.mockRestore();
  });

  it('drives the same tool loop, and the request comes back with what it used', async () => {
    const turns = [
      { provider: 'Together', choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'edit', arguments: '{"changes":[{"op":"set_props"}]}' } }] } }], usage: { prompt_tokens: 1000, completion_tokens: 50, cost: 0.002 } },
      { provider: 'Together', choices: [{ message: { role: 'assistant', content: 'The title is red now.' } }], usage: { prompt_tokens: 1200, completion_tokens: 20, cost: 0.001, prompt_tokens_details: { cached_tokens: 1000 } } },
    ];
    const fetcher = vi.fn(async () => res(200, turns.shift()));
    const events: { type: string; text?: string }[] = [];
    const callTool = vi.fn(async () => ({ error: false, text: 'Applied 1 change(s) as 1 op(s).' }));
    const result = await run(
      { ai: client(cfg, fetcher, none), tools: [{ name: 'edit', description: 'change', inputSchema: { type: 'object', properties: { project_id: { type: 'string' }, changes: { type: 'array' } }, required: ['project_id', 'changes'] } }], callTool, build: vi.fn(), context: async () => 'Page 1', beforeEdit: async () => 'rev-1', emit: (e: { type: string }) => events.push(e), system: 'sys' },
      { projectId: 'pr1', projectName: 'Cells', firstName: '', message: 'Make the title red', state: { history: [] } },
    );
    expect(result).toMatchObject({ outcome: 'replied', rounds: 2, changed: true, usage: { input: 2200, cached: 1000, output: 70, host: 'Together' } });
    expect(result.usage.cost).toBeCloseTo(0.003);
    expect(callTool).toHaveBeenCalledWith('edit', { changes: [{ op: 'set_props' }], project_id: 'pr1' });
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'The title is red now.' });
    // the second request carries the tool's answer back under the call's id
    const sent = JSON.parse((fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body).messages;
    expect(sent.at(-1)).toEqual({ role: 'tool', tool_call_id: 't1', content: 'Applied 1 change(s) as 1 op(s).' });
  });
});
