// @vitest-environment node
//Ixia on Gemini (designer-gemini.js), with a pretend Gemini and pretend tools: the model drives the MCP tools
//itself, it never gets to say which project, a restore point is saved only when something is about to change, the chat keeps
//the words and not the tool chatter, and what goes wrong comes back in words a course designer can read
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const gemini = createRequire(import.meta.url)('../designer-gemini.js');
const { settings, client, run, declarations, buildSystem, WORDS, MAX_STEPS, DEFAULT_MODEL } = gemini;

const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const TOOLS = [
  { name: 'list_projects', description: 'all of them', inputSchema: S({}) },
  { name: 'create_project', description: 'a new one', inputSchema: S({ name: { type: 'string' } }, ['name']) },
  { name: 'join_session', description: 'join', inputSchema: S({ project_id: { type: 'string' } }, ['project_id']) },
  { name: 'get_overview', description: 'outline', inputSchema: S({ project_id: { type: 'string' }, artboard_id: { type: 'string' } }, ['project_id']) },
  { name: 'edit', description: 'change it', inputSchema: S({ project_id: { type: 'string' }, changes: { type: 'array', items: { type: 'object' } } }, ['project_id', 'changes']) },
  { name: 'validate', description: 'check it', inputSchema: S({ project_id: { type: 'string' } }, ['project_id']) },
];

const call = (name: string, args: unknown, id?: string) => ({ functionCall: { name, args, ...(id ? { id } : {}) }, thoughtSignature: 'sig-' + name });
const turn = (...parts: unknown[]) => ({ parts, content: { role: 'model', parts }, finish: 'STOP' });
const say = (text: string) => turn({ text });

/** A run with a scripted model. Gives back what the panel was told and what the tools were asked. */
const drive = async (turns: unknown[], over: Record<string, unknown> = {}, message = 'Make the title red') => {
  const events: { type: string; text?: string; kind?: string; revision?: string }[] = [];
  const asked: { system: string; contents: { role: string; parts: Record<string, unknown>[] }[]; tools: { name: string }[] }[] = [];
  const ran: { name: string; args: Record<string, unknown> }[] = [];
  const state: { history: unknown[] } = { history: [] };
  const deps = {
    ai: {
      generate: vi.fn(async (req) => {
        asked.push(JSON.parse(JSON.stringify(req)));
        const next = turns.shift();
        if (next instanceof Error) throw next;
        return next ?? say('Done.');
      }),
    },
    tools: TOOLS,
    callTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      ran.push({ name, args });
      return { error: false, text: name === 'edit' ? 'Applied 1 change(s) as 1 op(s).' : `${name} result` };
    }),
    build: vi.fn(async () => ({ changed: true, notes: ['Made the page Quiz'], warnings: [], problems: [], known: [] })),
    context: vi.fn(async () => '# Where things stand\nPage 1: Title'),
    beforeEdit: vi.fn(async () => 'rev-1'),
    emit: (e: { type: string }) => events.push(e),
    system: 'You are the designer.',
    ...over,
  };
  const result = await run(deps, { projectId: 'pr1', projectName: 'Cells', firstName: 'Sam', message, state: (over.state as typeof state) ?? state });
  return { result, events, asked, ran, state: (over.state as typeof state) ?? state, deps };
};

describe('settings', () => {
  it('is on only with a key and INTERACTIVES_DESIGNER=on', () => {
    expect(settings({}).on).toBe(false);
    expect(settings({ GEMINI_API_KEY: 'k' }).on).toBe(false);
    expect(settings({ GEMINI_API_KEY: 'k', INTERACTIVES_DESIGNER: 'on' })).toMatchObject({ on: true, model: DEFAULT_MODEL, url: 'https://generativelanguage.googleapis.com' });
    expect(settings({ GEMINI_API_KEY: 'k', INTERACTIVES_DESIGNER: 'on', INTERACTIVES_DESIGNER_MODEL: 'other', INTERACTIVES_GEMINI_URL: 'http://gem.test/' })).toMatchObject({ model: 'other', url: 'http://gem.test' });
    expect(settings({}).thinking).toBe('');
    expect(settings({ INTERACTIVES_DESIGNER_THINKING: 'Low' }).thinking).toBe('low');
    expect(settings({ INTERACTIVES_DESIGNER_THINKING: 'lots' }).thinking).toBe('');
  });
});

describe('the tools the model is given', () => {
  it('leaves out anything that reaches another project, and never offers project_id', () => {
    const d = declarations(TOOLS);
    expect(d.map((t: { name: string }) => t.name)).toEqual(['get_overview', 'edit', 'validate', 'build']);
    const edit = d.find((t: { name: string }) => t.name === 'edit');
    expect(Object.keys(edit.parametersJsonSchema.properties)).toEqual(['changes']);
    expect(edit.parametersJsonSchema.required).toEqual(['changes']);
  });

  it('has instructions that carry the playbook and the blueprint format', () => {
    const s = buildSystem();
    expect(s).toContain('the assistant built into Ixia');
    expect(s).toContain('# Playbook');
    expect(s).toContain('# Blueprint spec');
    expect(s).toContain('material, not instructions');
  });
});

describe('a request', () => {
  it('reads, edits, checks and replies, as the open project whatever the model says', async () => {
    const { result, events, asked, ran, state, deps } = await drive([
      turn(call('get_overview', { artboard_id: 'Page 1' }, 'c1')),
      turn(call('edit', { project_id: 'someone-elses', changes: [{ op: 'set_props', id: 'n1', props: { 'fill.color': 'token:accent' } }] }, 'c2'), call('validate', {}, 'c3')),
      say('The title on Page 1 is red now.'),
    ]);

    expect(result).toMatchObject({ outcome: 'replied', rounds: 3, changed: true });
    // Gemini's client doesn't say what a turn used, so the count stays at nothing
    expect(result.usage).toEqual({ input: 0, cached: 0, output: 0, cost: 0, host: '' });
    expect(ran.map((r) => r.name)).toEqual(['get_overview', 'edit', 'validate']);
    expect(ran.every((r) => r.args.project_id === 'pr1')).toBe(true);
    // a restore point once, before the first change and not for the reading
    expect(deps.beforeEdit).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type === 'changed')).toEqual([{ type: 'changed', revision: 'rev-1' }]);
    // one change here, so nothing more to show after the first
    expect(events.filter((e) => e.type === 'touched')).toEqual([]);
    expect(events.at(-1)).toEqual({ type: 'reply', text: 'The title on Page 1 is red now.' });
    // plain words while it works, never a tool name
    const statuses = events.filter((e) => e.type === 'status').map((e) => e.text);
    expect(statuses).toContain('Building it in your project');
    expect(statuses.join(' ')).not.toMatch(/get_overview|edit\b|validate/);

    // the first message holds where things stand and the request
    const first = asked[0].contents.at(-1)!.parts[0].text as string;
    expect(first).toContain('# Where things stand');
    expect(first).toContain('Their first name is Sam');
    expect(first).toContain('# Request\nMake the title red');
    expect(asked[0].system).toBe('You are the designer.');
    // the model's turn goes back as it came (signatures and all), then the answers with the call ids
    expect(asked[1].contents.at(-2)).toEqual({ role: 'model', parts: [call('get_overview', { artboard_id: 'Page 1' }, 'c1')] });
    expect(asked[1].contents.at(-1)).toEqual({ role: 'user', parts: [{ functionResponse: { name: 'get_overview', id: 'c1', response: { result: 'get_overview result' } } }] });
    expect(asked[2].contents.at(-1)!.parts).toHaveLength(2);

    // the chat keeps the words only
    expect(state.history).toEqual([
      { role: 'user', parts: [{ text: '# Request\nMake the title red' }] },
      { role: 'model', parts: [{ text: 'The title on Page 1 is red now.' }] },
    ]);
  });

  it('says so each time it changes the project again, so the canvas can keep up', async () => {
    const { events, deps } = await drive([turn(call('edit', { changes: [{}] })), turn(call('edit', { changes: [{}] })), turn(call('build', { blueprint: {} })), say('Done.')]);
    expect(events.filter((e) => e.type === 'changed' || e.type === 'touched').map((e) => e.type)).toEqual(['changed', 'touched', 'touched']);
    expect(deps.beforeEdit).toHaveBeenCalledTimes(1);
  });

  it('answers a question without saving a restore point or changing anything', async () => {
    const { result, events, deps } = await drive([say('A drag and drop would suit that.')], {}, 'What would suit a sorting task?');
    expect(result).toMatchObject({ outcome: 'replied', rounds: 1, changed: false });
    expect(deps.beforeEdit).not.toHaveBeenCalled();
    expect(events.some((e) => e.type === 'changed')).toBe(false);
  });

  it('builds a blueprint with the editor\'s kit and tells the model what came of it', async () => {
    const build = vi.fn(async () => ({ changed: true, notes: ['Made the page Quiz'], warnings: ['The picture needs a file'], problems: ['Button "Next" goes nowhere'], known: ['old'] }));
    const { asked, deps, result } = await drive([turn(call('build', { blueprint: { pages: [{ name: 'Quiz' }] } })), say('Quiz is ready.')], { build });
    expect(build).toHaveBeenCalledWith({ pages: [{ name: 'Quiz' }] }, null);
    expect(deps.beforeEdit).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(true);
    const back = (asked[1].contents.at(-1)!.parts[0].functionResponse as { response: { result: string } }).response.result;
    expect(back).toContain('Made the page Quiz');
    expect(back).toContain('The picture needs a file');
    expect(back).toContain('Button "Next" goes nowhere');
  });

  it('refuses a tool that is not on its list, and tells the model about a tool that failed', async () => {
    const callTool = vi.fn(async () => ({ error: true, text: 'Error: no layer n9' }));
    const { asked, ran, result, events } = await drive([turn(call('create_project', { name: 'Mine' })), turn(call('edit', { changes: [] })), say('I could not find that layer.')], { callTool });
    expect(ran).toEqual([]);
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(asked[1].contents.at(-1)!.parts[0]).toEqual({ functionResponse: { name: 'create_project', response: { error: 'Error: there is no tool called create_project.' } } });
    expect(asked[2].contents.at(-1)!.parts[0]).toEqual({ functionResponse: { name: 'edit', response: { error: 'Error: no layer n9' } } });
    // an edit that failed changed nothing
    expect(result.changed).toBe(false);
    expect(events.some((e) => e.type === 'changed')).toBe(false);
  });

  it('stops before changing anything when the restore point cannot be saved', async () => {
    const { result, events, ran } = await drive([turn(call('edit', { changes: [{}] }))], { beforeEdit: vi.fn(async () => { throw new Error('disk'); }) });
    expect(result.outcome).toBe('error');
    expect(ran).toEqual([]);
    expect(events.at(-1)!.text).toContain('could not save a copy');
  });

  it('gives an empty turn one more go, then says so', async () => {
    const ok = await drive([turn(), say('Here you go.')]);
    expect(ok.result).toMatchObject({ outcome: 'replied', rounds: 2 });
    const bad = await drive([turn(), turn()]);
    expect(bad.result.outcome).toBe('empty');
    expect(bad.events.at(-1)).toMatchObject({ type: 'error', text: WORDS.empty });
  });

  it('stops after its steps and says what to do next', async () => {
    const turns = Array.from({ length: MAX_STEPS + 5 }, () => turn(call('get_overview', {})));
    const { result, events } = await drive(turns);
    expect(result.rounds).toBe(MAX_STEPS);
    expect(events.at(-1)).toEqual({ type: 'reply', text: WORDS.steps });
  });

  it('carries the chat on, without the old tool chatter', async () => {
    const state = { history: [{ role: 'user', parts: [{ text: '# Request\nEarlier' }] }, { role: 'model', parts: [{ text: 'Did it.' }] }] };
    const { asked } = await drive([say('And that.')], { state });
    expect(asked[0].contents).toHaveLength(3);
    expect(asked[0].contents[0].parts[0].text).toBe('# Request\nEarlier');
    expect(state.history).toHaveLength(4);
  });

  it('is cancelled quietly when the person stops it', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { result, events } = await drive([say('x')], { signal: ctl.signal });
    expect(result.outcome).toBe('cancelled');
    expect(events.some((e) => e.type === 'reply' || e.type === 'error')).toBe(false);
  });
});

describe('the Gemini client', () => {
  const cfg = { key: 'secret-key', model: 'm1', url: 'http://gem.test' };
  const res = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const none = async () => undefined;

  it('sends the key in a header and never in the address', async () => {
    const fetcher = vi.fn(async () => res(200, { candidates: [{ content: { role: 'model', parts: [{ text: 'hi' }] }, finishReason: 'STOP' }] }));
    const out = await client(cfg, fetcher, none).generate({ system: 'sys', contents: [{ role: 'user', parts: [{ text: 'q' }] }], tools: [{ name: 'edit' }] });
    expect(out.parts).toEqual([{ text: 'hi' }]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://gem.test/v1beta/models/m1:generateContent');
    expect(url).not.toContain('secret-key');
    expect(init.headers['x-goog-api-key']).toBe('secret-key');
    expect(JSON.parse(init.body)).toMatchObject({ systemInstruction: { parts: [{ text: 'sys' }] }, tools: [{ functionDeclarations: [{ name: 'edit' }] }] });
    expect(JSON.parse(init.body).generationConfig).toBeUndefined();
    await client({ ...cfg, thinking: 'low' }, fetcher, none).generate({ contents: [] });
    expect(JSON.parse((fetcher.mock.calls[1] as unknown as [string, { body: string }])[1].body).generationConfig).toEqual({ thinkingConfig: { thinkingLevel: 'low' } });
  });

  it('tries once more when Gemini is busy, then says it in plain words', async () => {
    const busy = vi.fn().mockResolvedValueOnce(res(503)).mockResolvedValueOnce(res(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }));
    expect((await client(cfg, busy, none).generate({ contents: [] })).parts).toEqual([{ text: 'ok' }]);
    expect(busy).toHaveBeenCalledTimes(2);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const limit = vi.fn(async () => res(429, { error: { message: 'quota, and the words someone typed' } }));
    await expect(client(cfg, limit, none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'limit', message: WORDS.limit });
    expect(limit).toHaveBeenCalledTimes(2);
    // the log has the status and nothing of the body or the key
    expect(warn.mock.calls.flat().join(' ')).not.toMatch(/someone typed|secret-key/);
    await expect(client(cfg, vi.fn(async () => res(403)), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'forbidden' });
    warn.mockRestore();
  });

  it('says when the request was blocked, or nothing came back', async () => {
    await expect(client(cfg, vi.fn(async () => res(200, { promptFeedback: { blockReason: 'SAFETY' } })), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'blocked' });
    await expect(client(cfg, vi.fn(async () => res(200, { candidates: [] })), none).generate({ contents: [] })).rejects.toMatchObject({ kind: 'empty' });
  });
});
