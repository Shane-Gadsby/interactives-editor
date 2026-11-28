// @vitest-environment node
//Ask Ixia on Antigravity end to end (index.js, designer-antigravity.js and the scoped tools route together), with a
//pretend agy: a little node script that does what the real one does through the ixia-chat tools, calling back into
//POST /api/designer/_mcp with the one-turn token. The build and edits land in the open project as the person, with
//"Before Ixia" saved first; the token only works for that project and that turn; New chat starts a fresh conversation;
//and when the allowance or a ceiling runs out Ask Ixia says it's unavailable, everywhere, until it's back
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject } from '../../interactives-player/src/format';
import { startServer, sessionHeader, type Harness, type User } from './helpers/server-harness';

const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob', fullName: 'Bob B' };
const realFetch = globalThis.fetch;

let h: Harness;
let n = 0;
let id = '';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ixia-fake-agy-'));
const bin = path.join(dir, 'fake-agy.mjs');
const planFile = path.join(dir, 'plan.json');
const seenFile = path.join(dir, 'seen.jsonl');
const usageFile = path.join(dir, 'usage.json');

//The pretend agy. /usage answers usage.json; a prompt runs plan.json's steps: {call, name, arguments} through the
//ixia-chat tools (the address agy is handed points at port 3048, so it is pointed at the test's server), {raw} for a
//JSON-RPC message of its own, and then says {reply} or fails with {fail, exit}. Everything it was run with goes in seen.jsonl
const FAKE = `
import fs from 'node:fs'
const argv = process.argv.slice(2)
const env = process.env
fs.appendFileSync(${JSON.stringify(seenFile)}, JSON.stringify({argv, env, cwd: process.cwd()}) + '\\n')
if (argv.includes('/usage')) {
  process.stdout.write(fs.readFileSync(${JSON.stringify(usageFile)}, 'utf8'))
  process.exit(0)
}
const plan = JSON.parse(fs.readFileSync(${JSON.stringify(planFile)}, 'utf8'))
const base = fs.readFileSync(${JSON.stringify(path.join(dir, 'base.txt'))}, 'utf8')
const url = (env.IXIA_CHAT_URL || '').replace(/^http:\\/\\/127\\.0\\.0\\.1:\\d+\\/interactives/, base)
const conv = argv.includes('--conversation') ? argv[argv.indexOf('--conversation') + 1] : 'conv-' + Date.now()
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n')
out({event: 'init', conversation_id: conv, init: {model: 'gemini-3.8-flash-medium'}})
let n = 0
const rpc = async (msg, token = env.IXIA_CHAT_TOKEN) => {
  const r = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + token}, body: JSON.stringify(msg)})
  const text = await r.text()
  return {status: r.status, body: text ? JSON.parse(text) : null}
}
const answers = []
await rpc({jsonrpc: '2.0', id: ++n, method: 'initialize', params: {protocolVersion: '2025-11-25'}})
answers.push(await rpc({jsonrpc: '2.0', id: ++n, method: 'tools/list'}))
for (const s of plan.steps || []) {
  if (s.call) answers.push(await rpc({jsonrpc: '2.0', id: ++n, method: 'tools/call', params: {name: s.call, arguments: s.arguments || {}}}, s.token))
  if (s.raw) answers.push(await rpc(s.raw, s.token))
}
fs.writeFileSync(${JSON.stringify(path.join(dir, 'answers.json'))}, JSON.stringify(answers))
if (plan.fail) {
  process.stderr.write(plan.fail)
  out({event: 'result', result: {conversation_id: conv, status: 'ERROR', error: plan.fail}})
  process.exit(plan.exit ?? 1)
}
const usage = {input_tokens: 4000, output_tokens: 120, thinking_tokens: 30, cache_read_tokens: 3000, total_tokens: 4120}
out({event: 'step_update', step_update: {conversation_id: conv, step_index: 1, state: 'DONE', step_type: 'agent_response', usage}})
out({event: 'result', result: {conversation_id: conv, status: 'SUCCESS', response: plan.reply || 'Done.', num_turns: 1, usage}})
`;

const plan = (p: unknown) => fs.writeFileSync(planFile, JSON.stringify(p));
const usage = (fiveH: number, weekly = 0.9, reset = new Date(Date.now() + 2 * 3600e3).toISOString()) =>
  fs.writeFileSync(usageFile, JSON.stringify({ status: 'SUCCESS', command: { name: 'usage', data: { groups: [{ name: 'Gemini Models', buckets: [{ id: 'gemini-weekly', window: 'weekly', remaining_fraction: weekly, reset_time: '2026-12-31T00:00:00Z' }, { id: 'gemini-5h', window: '5h', remaining_fraction: fiveH, reset_time: reset }] }] } } }));
const seen = () => (fs.existsSync(seenFile) ? fs.readFileSync(seenFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const runsOf = () => seen().filter((s) => !s.argv.includes('/usage'));
const answers = () => JSON.parse(fs.readFileSync(path.join(dir, 'answers.json'), 'utf8'));

const project = (pid: string) => {
  const p = createProject('Water cycle');
  p.id = pid;
  p.artboards[0].name = 'Page 1';
  p.artboards[0].width = 1024;
  p.artboards[0].height = 640;
  p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 10, y: 20, width: 100, height: 50 }));
  return p;
};
const QUIZ = { pages: [{ name: 'Quiz', title: 'Clouds', elements: [{ type: 'question', kind: 'single', prompt: 'Which process makes clouds?', options: [{ text: 'Condensation', correct: true, feedback: 'Yes.' }, { text: 'Evaporation', feedback: 'That is the reverse.' }] }] }] };

beforeAll(async () => {
  fs.writeFileSync(bin, FAKE);
  usage(0.8);
  plan({ steps: [], reply: 'Hello.' });
  process.env.INTERACTIVES_DESIGNER = 'on';
  process.env.INTERACTIVES_DESIGNER_BACKEND = 'antigravity';
  process.env.INTERACTIVES_ANTIGRAVITY_BIN = bin;
  process.env.INTERACTIVES_ANTIGRAVITY_APP_DATA_DIR = path.join(dir, 'agy-state');
  process.env.INTERACTIVES_DESIGNER_PER_HOUR = '0';
  //keys that must never reach agy
  process.env.ANTHROPIC_API_KEY = 'sk-ant-must-not-leak';
  process.env.GEMINI_API_KEY = 'gemini-must-not-leak';
  h = await startServer();
  fs.writeFileSync(path.join(dir, 'base.txt'), h.base);
  globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => realFetch(String(url).replace('http://127.0.0.1:3048/interactives', h.base), init)) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const k of ['INTERACTIVES_DESIGNER', 'INTERACTIVES_DESIGNER_BACKEND', 'INTERACTIVES_ANTIGRAVITY_BIN', 'INTERACTIVES_ANTIGRAVITY_APP_DATA_DIR', 'INTERACTIVES_DESIGNER_PER_HOUR', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'INTERACTIVES_DESIGNER_DAILY_REQUESTS', 'INTERACTIVES_DESIGNER_DAILY_TOKENS']) delete process.env[k];
  process.env.SUITE_SESSION_ENFORCE = '';
  await h.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.SUITE_SESSION_ENFORCE = '';
  delete process.env.INTERACTIVES_DESIGNER_DAILY_REQUESTS;
  delete process.env.INTERACTIVES_DESIGNER_DAILY_TOKENS;
  fs.rmSync(seenFile, { force: true });
  usage(0.8);
  h.db.audit.docs = [];
  id = `pragy${String(++n).padStart(5, '0')}`;
  expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } })).status).toBe(200);
});

const ask = async (message: string, opts: { user?: User; conversation?: string; artboardId?: string } = {}) => {
  const user = opts.user ?? ann;
  const r = await h.call('POST', '/api/designer/chat', { user, json: { projectId: id, artboardId: opts.artboardId, conversation: opts.conversation, message }, headers: { 'x-session-id': sessionHeader(user)! } });
  const events = r.status === 200 ? r.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  if (r.status === 200) made++;
  return { ...r, events };
};
//requests that reached agy today, so far in this file: the day's ceiling counts every one of them
let made = 0;
const getProject = async () => (await h.call('GET', `/api/projects/${id}`, { user: ann })).json.project;
const audits = (event: string) => h.db.audit.docs.filter((d: any) => d.event === event);

describe('a request on Antigravity', () => {
  it('builds and edits in the open project through the scoped tools, with "Before Ixia" first', async () => {
    plan({
      steps: [
        { call: 'get_overview', arguments: { project_id: 'not-this-one' } },
        { call: 'build', arguments: { blueprint: QUIZ } },
        { call: 'edit', arguments: { changes: [{ op: 'set_props', id: 'r1', props: { x: 300 } }] } },
        { call: 'validate' },
      ],
      reply: 'I added a Quiz page and moved the box.',
    });
    const start = (await getProject()).artboards[0].id;
    const r = await ask('Add a quiz page and move the box', { artboardId: start });
    expect(r.status).toBe(200);
    const kinds = r.events.map((e) => e.type);
    expect(kinds).toEqual(expect.arrayContaining(['status', 'changed', 'touched', 'reply', 'done']));
    expect(r.events.find((e) => e.type === 'reply').text).toBe('I added a Quiz page and moved the box.');
    expect(r.events.filter((e) => e.type === 'status').map((e) => e.text)).toEqual(expect.arrayContaining(['Reading the project', 'Building it in your project', 'Checking my work']));
    expect(r.events.at(-1)).toMatchObject({ type: 'done', available: true });

    const p = await getProject();
    expect(p.artboards.find((a: any) => a.name === 'Quiz')).toBeTruthy();
    expect(p.artboards[0].children.find((c: any) => c.id === 'r1').x).toBe(300);

    //the tools agy saw: only the open project's, and the overview answered for this project whatever it asked for
    const [list, overview] = answers();
    expect(list.body.result.tools.map((t: any) => t.name)).toEqual(expect.arrayContaining(['get_overview', 'edit', 'validate', 'build']));
    expect(list.body.result.tools.map((t: any) => t.name)).not.toContain('list_projects');
    expect(overview.body.result.content[0].text).toContain('Water cycle');

    //undo goes back to before
    const changed = r.events.find((e) => e.type === 'changed');
    expect(h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before Ixia')).toHaveLength(1);
    const before = (await h.call('GET', `/api/projects/${id}/revisions/${changed.revision}`, { user: ann })).json.project;
    expect(before.artboards.find((a: any) => a.name === 'Quiz')).toBeFalsy();
    expect(before.artboards[0].children.find((c: any) => c.id === 'r1').x).toBe(10);

    //audited as Ixia, with usage, and never the words
    expect(audits('agent-tool').filter((d: any) => d.detail.agent === 'Ixia').length).toBeGreaterThanOrEqual(2);
    const run = audits('designer-run')[0];
    expect(run.detail).toMatchObject({ outcome: 'replied', changed: true, own: false, via: 'antigravity', usage: { input: 4000, output: 120 } });
    expect(JSON.stringify(h.db.audit.docs)).not.toContain('move the box');
  });

  it('runs agy sandboxed in the workspace, with no keys in its environment', async () => {
    plan({ steps: [], reply: 'Hi.' });
    await ask('Say hi');
    const s = runsOf()[0];
    expect(s.argv).toContain('--sandbox');
    expect(s.argv).not.toContain('--dangerously-skip-permissions');
    expect(path.resolve(s.cwd)).toBe(path.resolve(path.join(__dirname, '..', 'agent-workspace')));
    expect(s.env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(s.env.GEMINI_API_KEY).toBeUndefined();
    expect(s.env.HOME).toBe(path.join(dir, 'agy-state'));
    expect(s.env.IXIA_CHAT_TOKEN).toMatch(/^[\w-]{43}$/);
  });

  it('the token is for that turn only, and from this box only', async () => {
    plan({ steps: [], reply: 'Hi.' });
    await ask('Say hi');
    const token = runsOf()[0].env.IXIA_CHAT_TOKEN;
    const late = await h.call('POST', '/api/designer/_mcp', { json: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${token}` } });
    expect(late.status).toBe(404);
    const none = await h.call('POST', '/api/designer/_mcp', { json: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    expect(none.status).toBe(404);
    const proxied = await h.call('POST', '/api/designer/_mcp', { json: { jsonrpc: '2.0', id: 1, method: 'tools/list' }, headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '203.0.113.9' } });
    expect(proxied.status).toBe(403);
    //and a made-up token mid-turn gets nothing either
    plan({ steps: [{ call: 'get_overview', token: 'x'.repeat(43) }], reply: 'Hi.' });
    await ask('Say hi');
    expect(answers()[1].status).toBe(404);
  });

  it('carries on the conversation, and New chat starts a fresh one', async () => {
    plan({ steps: [], reply: 'First.' });
    const a = await ask('One');
    const conversation = a.events.at(-1).conversation;
    expect(conversation).toBeTruthy();
    const firstConv = runsOf()[0].argv;
    expect(firstConv).not.toContain('--conversation');
    expect(firstConv[1]).toContain('# Open project');

    plan({ steps: [], reply: 'Second.' });
    await ask('Two', { conversation });
    const second = runsOf()[1].argv;
    expect(second).toContain('--conversation');
    expect(second[1]).not.toContain('# Open project');

    expect((await h.call('POST', '/api/designer/reset', { user: ann, json: { projectId: id } })).status).toBe(200);
    await ask('Three', { conversation });
    expect(runsOf()[2].argv).not.toContain('--conversation');
  });

  it('refuses someone who cannot edit the project before agy runs', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    expect((await ask('Add a page', { user: bob })).status).toBe(403);
    expect(runsOf()).toHaveLength(0);
  });
});

describe('the day\'s ceilings', () => {
  it('hides Ask Ixia once the day\'s requests are used, until midnight', async () => {
    usage(0.8);
    plan({ steps: [], reply: 'Hi.' });
    process.env.INTERACTIVES_DESIGNER_DAILY_REQUESTS = String(made + 1);
    expect((await h.call('GET', '/api/designer/status', { user: ann })).json).toMatchObject({ on: true, reason: null });
    const r = await ask('Hi');
    expect(r.events.at(-1)).toMatchObject({ type: 'done', available: false });
    expect((await h.call('GET', '/api/designer/status', { user: ann })).json).toMatchObject({ on: false, reason: 'daily' });
    expect((await ask('Hi')).status).toBe(429);
  });
});

describe('when the allowance runs out', () => {
  it('a turn that hits the limit says unavailable, and the session and status agree', async () => {
    plan({ steps: [], fail: `RESOURCE_EXHAUSTED: try after ${new Date(Date.now() + 3600e3).toISOString()}` });
    usage(0.8);
    const r = await ask('Make it red');
    expect(r.events.find((e) => e.type === 'error')).toMatchObject({ kind: 'limit' });
    expect(r.events.at(-1)).toMatchObject({ type: 'done', available: false });
    expect(r.events.at(-1).resetAt).toBeTruthy();
    expect((await h.call('GET', '/api/session', { user: ann })).json).toMatchObject({ designer: false, designerResetAt: expect.any(String) });
    expect((await h.call('GET', '/api/designer/status', { user: ann })).json).toMatchObject({ on: false, configured: true, reason: 'allocation' });
    //and a request now is turned away before agy runs
    const before = runsOf().length;
    const again = await ask('Make it red');
    expect(again.status).toBe(429);
    expect(again.json).toMatchObject({ kind: 'exhausted', available: false });
    expect(runsOf()).toHaveLength(before);
    expect(audits('designer-allocation').length).toBeGreaterThanOrEqual(1);
  });
});
