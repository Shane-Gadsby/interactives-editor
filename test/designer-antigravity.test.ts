// @vitest-environment node
//Ask Ixia on Antigravity (designer-antigravity.js), with a pretend agy: it runs sandboxed with the deny rules and never
//with --dangerously-skip-permissions, its environment carries no keys, the first turn sends the project and later ones
//only the request (resuming the conversation), the stream's reply and usage come through, Stop kills it, errors come
//back in words, the scoped tools never reach another project, and the allowance monitor hides and brings back Ask Ixia
import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';

const ag = createRequire(import.meta.url)('../designer-antigravity.js');

type Child = EventEmitter & { stdout: PassThrough; stderr: PassThrough; exitCode: number | null; killed: boolean; kill: (sig?: string) => boolean; signals: string[] };

//A pretend agy: says the given lines, then exits with code (unless hang)
const fakeSpawn = (lines: unknown[], opts: { code?: number; stderr?: string; hang?: boolean } = {}) => {
  const calls: { bin: string; args: string[]; opts: any; child: Child }[] = [];
  const spawn = vi.fn((bin: string, args: string[], o: any) => {
    const child = new EventEmitter() as Child;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.exitCode = null;
    child.killed = false;
    child.signals = [];
    const close = (code: number) => {
      if (child.exitCode !== null) return;
      child.exitCode = code;
      child.stdout.end();
      child.stderr.end();
      setImmediate(() => child.emit('close', code));
    };
    child.kill = (sig = 'SIGTERM') => {
      child.signals.push(sig);
      child.killed = true;
      if (sig === 'SIGKILL' || !opts.hang) close(143);
      return true;
    };
    calls.push({ bin, args, opts: o, child });
    setImmediate(() => {
      for (const l of lines) child.stdout.write((typeof l === 'string' ? l : JSON.stringify(l)) + '\n');
      if (opts.stderr) child.stderr.write(opts.stderr);
      if (!opts.hang) close(opts.code ?? 0);
    });
    return child;
  });
  return { spawn, calls };
};

const CONV = 'c0ffee00-0000-4000-8000-000000000001';
const ok = (response = 'I made the title red.', usage = { input_tokens: 3200, output_tokens: 40, thinking_tokens: 12, cache_read_tokens: 2800 }) => [
  { event: 'init', conversation_id: CONV, init: { model: 'gemini-3.8-flash-medium', tools: ['call_mcp_tool'] } },
  { event: 'step_update', step_update: { conversation_id: CONV, step_index: 1, state: 'ACTIVE', step_type: 'agent_response' } },
  { event: 'step_update', step_update: { conversation_id: CONV, step_index: 2, state: 'ACTIVE', step_type: 'tool', tool_name: 'view_file', tool_info: { name: 'view_file', parameters: { Path: 'refs/INDEX.md' } } } },
  { event: 'step_update', step_update: { conversation_id: CONV, step_index: 3, state: 'DONE', step_type: 'agent_response', text_delta: 'I made', usage } },
  'not json at all',
  { event: 'result', result: { conversation_id: CONV, status: 'SUCCESS', response, num_turns: 1, usage } },
];

const cfg = (over: Record<string, unknown> = {}) => ({ ...ag.settings({ INTERACTIVES_DESIGNER: 'on', INTERACTIVES_DESIGNER_BACKEND: 'antigravity' }, path.join('/srv', 'storage')), ...over });

const drive = async (lines: unknown[], over: { opts?: any; state?: any; input?: any; signal?: AbortSignal; env?: any } = {}) => {
  const { spawn, calls } = fakeSpawn(lines, over.opts);
  const events: any[] = [];
  const state = over.state ?? {};
  const grant = { url: 'http://127.0.0.1:3048/interactives/api/designer/_mcp', token: 'tok-abc', changed: false };
  const context = vi.fn(async () => '# Where things stand\nPage 1: Title, Box');
  const result = await ag.run(
    { cfg: cfg(), spawn, grant, context, emit: (e: any) => events.push(e), signal: over.signal, env: over.env ?? { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'sk-ant-secret', GEMINI_API_KEY: 'g-secret', OPENROUTER_API_KEY: 'or', COGNITI_TOKEN: 'cog', INTERACTIVES_SECRET_KEY: 'shh', MONGO_URI: 'mongodb://u:p@db', HTTPS_PROXY: 'http://proxy:8080' } },
    { projectId: 'p1', projectName: 'Water cycle', firstName: 'Ann', message: 'Make the title red', state, artboardId: 'ab1', artboardName: 'Page 1', ...over.input },
  );
  return { result, events, calls, state, context };
};

describe('settings', () => {
  it('is on only when switched on and pointed at antigravity', () => {
    expect(ag.settings({}).on).toBe(false);
    expect(ag.settings({ INTERACTIVES_DESIGNER: 'on' }).on).toBe(false);
    expect(ag.settings({ INTERACTIVES_DESIGNER: 'on', INTERACTIVES_DESIGNER_BACKEND: 'antigravity' }).on).toBe(true);
    expect(ag.settings({ INTERACTIVES_DESIGNER: 'on', INTERACTIVES_ANTIGRAVITY: 'on' }).on).toBe(true);
    expect(ag.settings({ INTERACTIVES_ANTIGRAVITY: 'on' }).on).toBe(false);
  });
  it('has defaults, and keeps agy state in storage/_agy-state', () => {
    const c = ag.settings({}, path.join('/srv', 'storage'));
    expect(c).toMatchObject({ bin: 'agy', effort: '', timeoutMs: 300000, minQuota: 0.02, cooldownMs: 900000, dailyRequests: 0, dailyTokens: 0 });
    expect(c.appDataDir).toBe(path.join('/srv', 'storage', '_agy-state'));
    expect(ag.settings({ INTERACTIVES_ANTIGRAVITY_EFFORT: 'max' }).effort).toBe('');
    expect(ag.settings({ INTERACTIVES_ANTIGRAVITY_EFFORT: 'High' }).effort).toBe('high');
    expect(ag.settings({ INTERACTIVES_DESIGNER_MIN_QUOTA: '0.1', INTERACTIVES_DESIGNER_DAILY_REQUESTS: '50' })).toMatchObject({ minQuota: 0.1, dailyRequests: 50 });
  });
  it('runs a .js bin under node, so a pretend agy works on Windows', () => {
    expect(ag.command({ bin: 'agy' }, ['-p'])).toEqual(['agy', ['-p']]);
    expect(ag.command({ bin: path.join('t', 'fake-agy.mjs') }, ['-p'])).toEqual([process.execPath, [path.join('t', 'fake-agy.mjs'), '-p']]);
  });
});

describe('the agy run', () => {
  it('runs sandboxed, with the deny rules, in the workspace, and never skips permissions', async () => {
    const { calls } = await drive(ok());
    const { bin, args, opts } = calls[0];
    expect(bin).toBe('agy');
    expect(args).toContain('--sandbox');
    expect(args).toContain('--disable-slash-commands');
    expect(args).not.toContain('--dangerously-skip-permissions');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args[args.indexOf('--print-timeout') + 1]).toBe('300s');
    expect(args).not.toContain('--effort');
    //an effort of its own, but never with a model that names one
    expect(ag.args({ ...cfg(), effort: 'low', model: 'gemini-pro-orchestrator' }, 'hi')).toEqual(expect.arrayContaining(['--effort', 'low']));
    expect(ag.args({ ...cfg(), effort: 'low', model: 'gemini-3.8-flash-high' }, 'hi')).not.toContain('--effort');
    const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
    expect(settings.enableTerminalSandbox).toBe(true);
    expect(settings.useG1Credits).toBe(false);
    expect(settings.permissions.deny).toEqual(expect.arrayContaining(['command(*)', 'write_file(*)', 'read_url(*)']));
    expect(settings.permissions.allow).toContain('mcp(ixia_ixia-chat/*)');
    expect(settings.permissions.allow).not.toContain('mcp(*)');
    expect(opts.cwd).toBe(ag.WORKSPACE);
  });

  it('hands agy no keys: only PATH, proxies, its own HOME and the one-turn token', async () => {
    const { calls } = await drive(ok());
    const env = calls[0].opts.env;
    for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'COGNITI_TOKEN', 'INTERACTIVES_SECRET_KEY', 'MONGO_URI']) expect(env).not.toHaveProperty(k);
    expect(env).toMatchObject({ PATH: '/usr/bin', HTTPS_PROXY: 'http://proxy:8080', IXIA_CHAT_TOKEN: 'tok-abc', IXIA_CHAT_URL: 'http://127.0.0.1:3048/interactives/api/designer/_mcp' });
    expect(env.HOME).toBe(path.join('/srv', 'storage', '_agy-state'));
    expect(JSON.stringify(env)).not.toMatch(/secret|sk-ant|mongodb/);
  });

  it('sends the project on the first turn, then only the request, resuming the conversation', async () => {
    const first = await drive(ok());
    expect(first.result).toMatchObject({ outcome: 'replied', exhausted: false });
    expect(first.events).toContainEqual({ type: 'reply', text: 'I made the title red.' });
    const p1 = first.calls[0].args[1];
    expect(p1).toContain('# Open project');
    expect(p1).toContain('Page 1: Title, Box');
    expect(p1).toContain('Their first name is Ann.');
    expect(p1).toMatch(/# Request\nMake the title red$/);
    expect(first.calls[0].args).not.toContain('--conversation');
    expect(first.state.agyConversationId).toBe(CONV);

    const second = await drive(ok('Done.'), { state: first.state, input: { message: 'Now make it bigger' } });
    expect(second.context).not.toHaveBeenCalled();
    const a2 = second.calls[0].args;
    expect(a2[a2.indexOf('--conversation') + 1]).toBe(CONV);
    expect(a2[1]).not.toContain('# Open project');
    expect(a2[1]).toContain('Open page: Page 1 (ab1)');
    expect(a2[1]).toMatch(/# Request\nNow make it bigger$/);
    expect(a2[1]).not.toContain('get_overview');

    const third = await drive(ok('Done.'), { state: first.state, input: { message: 'And blue', changedOutside: true } });
    expect(third.calls[0].args[1]).toContain('Call get_overview before editing');
  });

  it('keeps the first prompt small however big the project is', async () => {
    const { spawn, calls } = fakeSpawn(ok());
    await ag.run({ cfg: cfg(), spawn, grant: {}, context: async () => 'x'.repeat(50000), emit: () => {} }, { projectName: 'P', message: 'hi', state: {} });
    expect(calls[0].args[1].length).toBeLessThan(5000);
  });

  it('counts usage from the stream, and says what it is doing', async () => {
    const { result, events } = await drive(ok());
    expect(result.usage).toMatchObject({ input: 3200, cached: 2800, output: 40, thinking: 12, cost: 0, host: 'antigravity' });
    expect(result.rounds).toBe(1);
    expect(events.filter((e) => e.type === 'status').map((e) => e.text)).toEqual(['Reading the project', 'Thinking it through', 'Looking things up']);
  });

  it('reports changed from the grant the tools wrote to', async () => {
    const { spawn } = fakeSpawn(ok());
    const grant = { changed: true };
    const r = await ag.run({ cfg: cfg(), spawn, grant, context: async () => '', emit: () => {} }, { projectName: 'P', message: 'hi', state: {} });
    expect(r.changed).toBe(true);
  });

  it('Stop kills agy, and a stubborn one gets SIGKILL after 3 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ctl = new AbortController();
      const { spawn, calls } = fakeSpawn([ok()[0]], { hang: true });
      const p = ag.run({ cfg: cfg(), spawn, grant: {}, context: async () => '', emit: () => {}, signal: ctl.signal }, { projectName: 'P', message: 'hi', state: {} });
      await vi.waitFor(() => expect(calls.length).toBe(1));
      ctl.abort();
      expect(calls[0].child.signals).toEqual(['SIGTERM']);
      vi.advanceTimersByTime(3100);
      expect(calls[0].child.signals).toEqual(['SIGTERM', 'SIGKILL']);
      expect((await p).outcome).toBe('cancelled');
    } finally {
      vi.useRealTimers();
    }
  });

  it('turns failures into plain words, and a limit into exhausted with when it comes back', async () => {
    const soon = new Date(Date.now() + 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
    const limit = await drive([{ event: 'result', result: { status: 'ERROR', error: `RESOURCE_EXHAUSTED: quota resets ${soon}` } }], { opts: { code: 1 } });
    expect(limit.result).toMatchObject({ outcome: 'limit', exhausted: true, resetAt: Date.parse(soon) });
    expect(limit.events.at(-1)).toMatchObject({ type: 'error', kind: 'limit' });

    const auth = await drive([], { opts: { code: 1, stderr: 'Error: not signed in. Run agy to log in.' } });
    expect(auth.events.at(-1)).toMatchObject({ type: 'error', kind: 'forbidden', text: ag.WORDS.forbidden });

    const crash = await drive([], { opts: { code: 2, stderr: 'panic: something' } });
    expect(crash.events.at(-1)).toMatchObject({ kind: 'unavailable' });

    const empty = await drive([{ event: 'result', result: { status: 'SUCCESS', response: '  ' } }]);
    expect(empty.events.at(-1)).toMatchObject({ kind: 'empty' });

    //and none of those words carry what agy said
    for (const r of [limit, auth, crash]) expect(JSON.stringify(r.events)).not.toMatch(/RESOURCE_EXHAUSTED|panic|Run agy/);
  });

  it('classifies what agy says', () => {
    expect(ag.classify('429 Too Many Requests')).toBe('limit');
    expect(ag.classify('You have reached your usage limit')).toBe('limit');
    expect(ag.classify('UNAUTHENTICATED')).toBe('forbidden');
    expect(ag.classify('blocked by safety')).toBe('blocked');
    expect(ag.classify('weird')).toBe('unavailable');
    expect(ag.classify('print timeout of 300s reached')).toBe('timeout');
  });
});

describe('the ixia-chat tools', () => {
  const S = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
  const EDIT_DESC = 'Change the project. Each change is {op, ...}: set_props {id, props}; add_layer {artboard_id, type}; delete {id}; ' + 'x'.repeat(5000);
  const TOOLS = [
    { name: 'list_projects', description: 'all', inputSchema: S({}) },
    { name: 'create_project', description: 'new', inputSchema: S({ name: { type: 'string' } }) },
    { name: 'join_session', description: 'join', inputSchema: S({ project_id: { type: 'string' } }, ['project_id']) },
    { name: 'who_am_i', description: 'me', inputSchema: S({}) },
    { name: 'get_overview', description: 'outline', inputSchema: S({ project_id: { type: 'string' }, artboard_id: { type: 'string' } }, ['project_id']) },
    { name: 'edit', description: EDIT_DESC, inputSchema: S({ project_id: { type: 'string' }, changes: { type: 'array' } }, ['project_id', 'changes']) },
    { name: 'validate', description: 'check', inputSchema: S({ project_id: { type: 'string' } }, ['project_id']) },
  ];
  const setup = () => {
    const events: any[] = [];
    const ran: any[] = [];
    const grant: any = { projectId: 'p1', emit: (e: any) => events.push(e), beforeEdit: vi.fn(async () => 'rev-before'), restore: null, changed: false, known: null };
    const deps = {
      tools: TOOLS,
      callTool: vi.fn(async (name: string, args: any) => {
        ran.push({ name, args });
        return { error: false, text: name === 'edit' ? 'Applied 1 change.' : 'fine' };
      }),
      build: vi.fn(async () => ({ changed: true, notes: ['Added a Quiz page'], known: { a: 1 } })),
    };
    const ask = (method: string, params?: unknown, id: number | null = 1) => ag.mcpHandler(grant, deps, { jsonrpc: '2.0', ...(id === null ? {} : { id }), method, params });
    return { events, ran, grant, deps, ask };
  };

  it('lists only the tools that stay in the open project, with no project_id, and a short edit', async () => {
    const { ask } = setup();
    const { result } = await ask('tools/list');
    const names = result.tools.map((t: any) => t.name);
    expect(names).toEqual(['get_overview', 'edit', 'validate', 'build']);
    for (const t of result.tools) {
      expect(t.inputSchema.properties).not.toHaveProperty('project_id');
      expect(t.inputSchema.required).not.toContain('project_id');
    }
    const edit = result.tools.find((t: any) => t.name === 'edit');
    expect(edit.description.length).toBeLessThan(700);
    expect(edit.description).toContain('set_props, add_layer, delete');
    expect(edit.description).toContain('ixia-edit-ops');
  });

  it('answers initialize and ignores notifications', async () => {
    const { ask } = setup();
    expect((await ask('initialize', { protocolVersion: '2025-11-25' })).result).toMatchObject({ protocolVersion: '2025-11-25', serverInfo: { name: 'ixia-chat' } });
    expect(await ask('notifications/initialized', {}, null)).toBeNull();
    expect((await ask('server/discover')).error.code).toBe(-32601);
  });

  it('locks every call to the open project, whatever the agent says', async () => {
    const { ask, ran } = setup();
    await ask('tools/call', { name: 'get_overview', arguments: { project_id: 'someone-elses', artboard_id: 'a' } });
    expect(ran[0]).toEqual({ name: 'get_overview', args: { project_id: 'p1', artboard_id: 'a' } });
    const r = await ask('tools/call', { name: 'list_projects', arguments: {} });
    expect(r.result.isError).toBe(true);
    expect(ran).toHaveLength(1);
    for (const n of ['create_project', 'join_session', 'who_am_i', 'leave_session']) expect((await ask('tools/call', { name: n, arguments: {} })).result.isError).toBe(true);
  });

  it('saves "Before Ixia" before the first change only, and says changed then touched', async () => {
    const { ask, grant, events } = setup();
    await ask('tools/call', { name: 'get_overview', arguments: {} });
    expect(grant.beforeEdit).not.toHaveBeenCalled();
    await ask('tools/call', { name: 'edit', arguments: { changes: [{ op: 'delete', id: 'r1' }] } });
    await ask('tools/call', { name: 'build', arguments: { blueprint: { pages: [] } } });
    expect(grant.beforeEdit).toHaveBeenCalledTimes(1);
    expect(events.filter((e) => e.type !== 'status')).toEqual([{ type: 'changed', revision: 'rev-before' }, { type: 'touched' }]);
    expect(events.filter((e) => e.type === 'status').map((e) => e.text)).toEqual(['Reading the project', 'Building it in your project', 'Building it in your project']);
    expect(grant.changed).toBe(true);
    expect(grant.known).toEqual({ a: 1 });
  });

  it('changes nothing when the restore point cannot be saved', async () => {
    const { ask, grant, deps } = setup();
    grant.beforeEdit = vi.fn(async () => {
      throw new Error('disk full');
    });
    const r = await ask('tools/call', { name: 'edit', arguments: { changes: [] } });
    expect(r.result.isError).toBe(true);
    expect(deps.callTool).not.toHaveBeenCalled();
    expect(grant.changed).toBe(false);
  });

  it('clips a huge answer', async () => {
    const { ask, deps } = setup();
    deps.callTool.mockResolvedValueOnce({ error: false, text: 'y'.repeat(200000) });
    const r = await ask('tools/call', { name: 'get_overview', arguments: {} });
    expect(r.result.content[0].text.length).toBeLessThan(ag.MAX_RESULT + 100);
  });
});

describe('the allowance', () => {
  const usage = (fiveH: number, weekly: number, reset5 = '2026-11-28T15:02:18Z', resetW = '2026-12-05T10:02:18Z') => ({
    status: 'SUCCESS',
    command: {
      name: 'usage',
      data: {
        groups: [
          { name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', window: 'weekly', remaining_fraction: weekly, reset_time: resetW }, { id: 'gemini-5h', window: '5h', remaining_fraction: fiveH, reset_time: reset5 }] },
          { name: 'Claude and GPT models', buckets: [{ id: '3p-weekly', window: 'weekly', remaining_fraction: 1, reset_time: '1970-01-01T00:00:00Z' }, { id: '3p-5h', window: '5h', remaining_fraction: 0, reset_time: '1970-01-01T00:00:00Z' }] },
        ],
      },
    },
  });
  const NOW = Date.parse('2026-11-28T12:00:00Z');
  const c = cfg();

  it('reads the 5 hour and weekly windows for the model group', () => {
    expect(ag.parseUsage(usage(0.64, 0.91), c, NOW)).toMatchObject({ exhausted: false, resetAt: null });
    expect(ag.parseUsage(usage(0.01, 0.91), c, NOW)).toMatchObject({ exhausted: true, resetAt: Date.parse('2026-11-28T15:02:18Z') });
    //both out: the week is the one that governs
    expect(ag.parseUsage(usage(0, 0), c, NOW)).toMatchObject({ exhausted: true, resetAt: Date.parse('2026-12-05T10:02:18Z') });
    //a Claude model watches the other group
    expect(ag.parseUsage(usage(0.5, 0.5), { ...c, model: 'claude-sonnet-5-5' }, NOW)?.exhausted).toBe(true);
    expect(ag.parseUsage({ nope: 1 }, c, NOW)).toBeNull();
  });

  //A pretend agy for /usage, answering whatever usageNow says at the time
  const monitor = (answers: unknown[]) => {
    const timers: { at: number; fn: () => void; id: number }[] = [];
    let now = NOW;
    let n = 0;
    const changes: any[] = [];
    const spawn = vi.fn(() => {
      const child = new EventEmitter() as Child;
      child.stdout = new PassThrough();
      child.kill = () => true;
      const a = answers.length > 1 ? answers.shift() : answers[0];
      setImmediate(() => {
        child.stdout.end(JSON.stringify(a));
        setImmediate(() => child.emit('close', 0));
      });
      return child;
    });
    const fake = {
      setTimeout: (fn: () => void, ms: number) => {
        const t = { at: now + ms, fn, id: ++n };
        timers.push(t);
        return t;
      },
      clearTimeout: (t: any) => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      },
      setInterval: () => ({}),
      clearInterval: () => {},
    };
    const m = ag.createQuotaMonitor({ cfg: c, spawn, now: () => now, timers: fake, onChange: (s: any) => changes.push(s.exhausted) });
    const advance = async (ms: number) => {
      now += ms;
      for (const t of timers.filter((t) => t.at <= now)) {
        fake.clearTimeout(t);
        t.fn();
      }
      await new Promise((r) => setTimeout(r, 20));
    };
    return { m, spawn, advance, changes };
  };

  it('hides when a window runs out, and comes back by itself after it refreshes', async () => {
    const { m, advance, changes } = monitor([usage(0.01, 0.9), usage(0.8, 0.9)]);
    expect((await m.probe()).exhausted).toBe(true);
    expect(m.status().resetAt).toBe(Date.parse('2026-11-28T15:02:18Z'));
    await advance(3 * 3600e3 + 3 * 60e3);
    expect(m.status().exhausted).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('agy saying it is out hides straight away, for the cooldown when it says no time', async () => {
    const { m } = monitor([usage(0.5, 0.5)]);
    m.markExhausted(null);
    expect(m.status()).toMatchObject({ exhausted: true, resetAt: NOW + c.cooldownMs });
  });

  it('a probe that answers nonsense leaves things as they were', async () => {
    const { m } = monitor(['garbage']);
    expect((await m.probe()).exhausted).toBe(false);
    m.markExhausted(NOW + 1000);
    expect((await m.probe()).exhausted).toBe(true);
  });

  it('the probe runs agy with the same scrubbed environment', async () => {
    const { m, spawn } = monitor([usage(0.5, 0.5)]);
    await m.probe();
    const [bin, args, opts] = spawn.mock.calls[0] as any;
    expect(bin).toBe('agy');
    expect(args).toEqual(['--print', '/usage', '--output-format', 'json']);
    expect(opts.env.HOME).toBe(c.appDataDir);
  });
});
