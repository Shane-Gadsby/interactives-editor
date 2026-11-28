// @vitest-environment node
//The walls around Ask Ixia's Antigravity agent: the PreToolUse guard (agent-workspace/.agents/hooks/guard.mjs) lets
//through the ixia-chat tools and reading refs/ and skills, and nothing else, failing closed; the workspace config points
//agy at the right things; and the stdio bridge (designer-antigravity-mcp.mjs) carries JSON-RPC to the editor with the
//one-turn token and nothing more
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ws = path.join(root, 'agent-workspace');
const guardFile = path.join(ws, '.agents', 'hooks', 'guard.mjs');
let guard: { decide: (input: unknown, env?: Record<string, string>) => { decision: string; reason?: string }; roots: (env?: Record<string, string>) => string[] };

let home = '';
let outside = '';
beforeAll(async () => {
  guard = await import(pathToFileURL(guardFile).href);
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'ixia-agy-home-'));
  fs.mkdirSync(path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ixia_ixia-chat'), { recursive: true });
  fs.writeFileSync(path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ixia_ixia-chat', 'edit.json'), '{}');
  fs.mkdirSync(path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'other_server'), { recursive: true });
  fs.writeFileSync(path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'other_server', 'x.json'), '{}');
  outside = path.join(home, 'secret.env');
  fs.writeFileSync(outside, 'KEY=1');
});
afterAll(() => fs.rmSync(home, { recursive: true, force: true }));

const tool = (name: string, args: Record<string, unknown> = {}) => ({ toolCall: { id: 't1', name, args }, cwd: ws, hookEventName: 'PreToolUse' });
const say = (input: unknown) => guard.decide(input, { HOME: home }).decision;

describe('the guard', () => {
  it('lets the ixia-chat tools through, and no other server', () => {
    expect(say(tool('call_mcp_tool', { ServerName: 'ixia_ixia-chat', ToolName: 'edit', Arguments: {} }))).toBe('allow');
    expect(say(tool('call_mcp_tool', { ServerName: 'github', ToolName: 'list_issues' }))).toBe('deny');
    expect(say(tool('call_mcp_tool', { ServerName: 'ixia-chat' }))).toBe('deny');
    expect(say(tool('call_mcp_tool', {}))).toBe('deny');
  });

  it('lets it read refs/ and the skills, by relative or absolute path', () => {
    expect(say(tool('view_file', { Path: 'refs/INDEX.md' }))).toBe('allow');
    expect(say(tool('read_file', { Path: path.join(ws, 'refs', 'layers', 'states.md') }))).toBe('allow');
    expect(say(tool('read_file', { Path: pathToFileURL(path.join(ws, 'refs', 'INDEX.md')).href }))).toBe('allow');
    expect(say(tool('list_dir', { DirectoryPath: path.join(ws, '.agents', 'skills') }))).toBe('allow');
    expect(say(tool('grep_search', { SearchPath: path.join(ws, 'refs'), Query: 'tooltip' }))).toBe('allow');
    expect(say(tool('read_file', { Path: path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'ixia_ixia-chat', 'edit.json') }))).toBe('allow');
  });

  it('refuses every path outside, however it is written', () => {
    for (const p of [
      '/etc/passwd',
      outside,
      path.join(ws, 'refs', '..', '..', 'index.js'),
      'refs/../../.gemini-key.env',
      '../.gemini-key.env',
      path.join(root, 'storage'),
      path.join(ws, '.agents', 'hooks', 'guard.mjs'),
      path.join(ws, '.agents', 'plugins', 'ixia', 'mcp_config.json'),
      path.join(home, '.gemini', 'antigravity-cli', 'mcp', 'other_server', 'x.json'),
      path.join(home, '.gemini', 'antigravity-cli'),
      path.join(ws, 'refs', 'does-not-exist.md'),
      path.join(ws, 'refs-but-not.md'),
    ]) {
      expect(say(tool('read_file', { Path: p })), p).toBe('deny');
    }
    //one bad path among good ones is a refusal
    expect(say(tool('grep_search', { SearchPath: path.join(ws, 'refs'), Includes: ['refs/INDEX.md'], FilePath: '/etc/hosts' }))).toBe('deny');
    //a file tool with no path at all
    expect(say(tool('read_file', {}))).toBe('deny');
    expect(say(tool('read_file', { Path: 42 }))).toBe('deny');
  });

  it('refuses a symlink that leads out', () => {
    const link = path.join(home, 'refs-link');
    try {
      fs.symlinkSync('/etc', link, 'dir');
    } catch {
      return; //Windows without the right to make links: nothing to test
    }
    expect(say({ ...tool('read_file', { Path: path.join(link, 'hostname') }) })).toBe('deny');
  });

  it('refuses commands, writing, the web, the browser, subagents and anything it does not know', () => {
    for (const n of ['run_command', 'write_to_file', 'write_file', 'edit_file', 'replace_file_content', 'multi_replace_file_content', 'sed_file', 'search_web', 'read_url_content', 'open_browser_url', 'browser_click_element', 'invoke_subagent', 'define_subagent', 'run_workflow', 'swarm', 'schedule', 'generate_image', 'send_command_input', 'notebook_edit', 'read_resource', 'ask_permission', 'made_up_tool']) {
      expect(say(tool(n, { Path: path.join(ws, 'refs', 'INDEX.md'), CommandLine: 'ls' })), n).toBe('deny');
    }
    expect(say({})).toBe('deny');
    expect(say(null)).toBe('deny');
  });

  it('lets the planning steps through', () => {
    expect(say(tool('update_steps', { steps: [] }))).toBe('allow');
  });

  it('fails closed when run as the hook with rubbish on stdin', () => {
    const bad = spawnSync(process.execPath, [guardFile], { input: 'not json', encoding: 'utf8' });
    expect(JSON.parse(bad.stdout)).toMatchObject({ decision: 'deny' });
    const good = spawnSync(process.execPath, [guardFile], { input: JSON.stringify(tool('view_file', { Path: 'refs/INDEX.md' })), encoding: 'utf8', env: { ...process.env, HOME: home } });
    expect(JSON.parse(good.stdout)).toEqual({ decision: 'allow' });
    const shell = spawnSync(process.execPath, [guardFile], { input: JSON.stringify(tool('run_command', { CommandLine: 'cat /etc/passwd' })), encoding: 'utf8' });
    expect(JSON.parse(shell.stdout).decision).toBe('deny');
  });
});

describe('the workspace', () => {
  it('hooks the guard on every tool and starts the bridge as ixia-chat', () => {
    //in the plugin: agy only loads a hooks.json from a plugin's own folder (a workspace .agents/hooks.json is ignored, 28 Nov 2026)
    const hooks = JSON.parse(fs.readFileSync(path.join(ws, '.agents', 'plugins', 'ixia', 'hooks.json'), 'utf8'));
    const pre = Object.values(hooks).flatMap((h: any) => h.PreToolUse || []);
    expect(pre).toContainEqual({ matcher: '*', hooks: [expect.objectContaining({ command: 'node ../../hooks/guard.mjs' })] });
    expect(path.resolve(ws, '.agents', 'plugins', 'ixia', '../../hooks/guard.mjs')).toBe(guardFile);
    expect(fs.existsSync(path.join(ws, '.agents', 'hooks.json'))).toBe(false);
    const mcp = JSON.parse(fs.readFileSync(path.join(ws, '.agents', 'plugins', 'ixia', 'mcp_config.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['ixia-chat']);
    const bridge = path.resolve(ws, '.agents', 'plugins', 'ixia', mcp.mcpServers['ixia-chat'].args[0]);
    expect(bridge).toBe(path.join(root, 'designer-antigravity-mcp.mjs'));
    expect(fs.existsSync(bridge)).toBe(true);
  });

  it('holds no secrets and no server code', () => {
    const walk = (d: string): string[] => fs.readdirSync(d).flatMap((n) => (fs.statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
    const files = walk(ws);
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const rel = path.relative(ws, f).split(path.sep).join('/');
      expect(rel).not.toMatch(/\.env$|secret|api.?key|credential/i);
      const t = fs.readFileSync(f, 'utf8');
      expect(t, rel).not.toMatch(/sk-ant-|AIza[0-9A-Za-z_-]{20}|mongodb:\/\/|BEGIN (RSA )?PRIVATE KEY/);
    }
    expect(files.filter((f) => /\.(c|m)?js$/.test(f)).map((f) => path.relative(ws, f).split(path.sep).join('/'))).toEqual(['.agents/hooks/guard.mjs']);
  });

  it('has the rule under 2 KB and skills with a name and description', () => {
    const rule = path.join(ws, '.agents', 'rules', 'AGENTS.md');
    if (!fs.existsSync(rule)) return;
    expect(fs.statSync(rule).size).toBeLessThan(2048);
    const dir = path.join(ws, '.agents', 'skills');
    for (const s of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const t = fs.readFileSync(path.join(dir, s, 'SKILL.md'), 'utf8');
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t)?.[1] || '';
      expect(fm, s).toMatch(new RegExp(`^name: ${s}$`, 'm'));
      expect(fm, s).toMatch(/^description: \S/m);
    }
  });
});

describe('the bridge', () => {
  let server: http.Server;
  let url = '';
  const seen: { auth?: string; body: any }[] = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        const body = JSON.parse(b);
        seen.push({ auth: req.headers.authorization, body });
        if (body.id === undefined) return res.writeHead(202).end();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { echo: body.method } }));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}/mcp`;
  });
  afterAll(() => server.close());

  const talk = (lines: string[], env: Record<string, string>) =>
    new Promise<string[]>((resolve) => {
      const child = spawn(process.execPath, [path.join(root, 'designer-antigravity-mcp.mjs')], { env: { PATH: process.env.PATH || '', ...env } });
      const got: string[] = [];
      let buf = '';
      child.stdout.on('data', (d) => {
        buf += d;
        const parts = buf.split('\n');
        buf = parts.pop()!;
        got.push(...parts);
        if (got.length >= lines.filter((l) => /"id"/.test(l)).length) {
          child.kill();
          resolve(got);
        }
      });
      for (const l of lines) child.stdin.write(l + '\n');
      setTimeout(() => {
        child.kill();
        resolve(got);
      }, 5000);
    });

  it('carries each line to the editor with the token, and the answer back', async () => {
    const got = await talk([JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }), JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })], { IXIA_CHAT_URL: url, IXIA_CHAT_TOKEN: 'turn-token' });
    const replies = got.map((l) => JSON.parse(l)).sort((a, b) => a.id - b.id);
    expect(replies).toEqual([{ jsonrpc: '2.0', id: 1, result: { echo: 'initialize' } }, { jsonrpc: '2.0', id: 2, result: { echo: 'tools/list' } }]);
    expect(seen.every((s) => s.auth === 'Bearer turn-token')).toBe(true);
    expect(seen.map((s) => s.body.method)).toEqual(expect.arrayContaining(['notifications/initialized']));
  });

  it('answers with an error, not silence, when it has no turn to work for', async () => {
    const got = await talk([JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' })], {});
    expect(JSON.parse(got[0])).toMatchObject({ id: 7, error: { code: -32000 } });
  });
});
