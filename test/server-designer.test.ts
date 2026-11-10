// @vitest-environment node
//The Activity Designer's route (index.js and designer.js together) with Cogniti pretended: the tool loop runs the editor's
//own MCP tools in-process as the person, a restore point is saved before the first change, only people who can edit the
//project get in, one request at a time, and the token and the words never get out
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject } from '../../interactives-player/src/format';
import { startServer, sessionHeader, type Harness, type User } from './helpers/server-harness';

const TOKEN = 'cogniti-test-token-9f3a';
const ann: User = { username: 'ann', fullName: 'Ann A' };
const bob: User = { username: 'bob', fullName: 'Bob B' };
const realFetch = globalThis.fetch;

let h: Harness;
let n = 0;
let id = '';
//what the pretend Cogniti has been sent, and what it says next
let sent: { path: string; auth: string | null; body: any }[] = [];
let script: (string | number)[] = [];
let gate: Promise<void> | null = null;
let conversations = 0;

const tool = (...c: { tool: string; args?: unknown }[]) => '```tool\n' + JSON.stringify(c) + '\n```';
const project = (pid: string) => {
  const p = createProject('Water cycle');
  p.id = pid;
  p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 10, y: 20, width: 100, height: 50 }));
  return p;
};

beforeAll(async () => {
  h = await startServer();
  globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://cogniti.unisq.edu.au/')) {
      const path = u.slice('https://cogniti.unisq.edu.au'.length);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      sent.push({ path, auth: new Headers(init?.headers).get('authorization'), body: body && JSON.parse(JSON.stringify(body)) });
      if (path === '/api/v1/conversations/new') return new Response(JSON.stringify({ conversation_id: `conv${++conversations}` }));
      if (gate) await gate;
      const next = script.shift() ?? 'Nothing more to say.';
      if (typeof next === 'number') return new Response(JSON.stringify({ message: 'no' }), { status: next });
      return new Response(JSON.stringify({ content: next, success: true }) + '\n');
    }
    //the editor's tools call back into this server over loopback on the real port, which in a test is the harness
    return realFetch(u.replace('http://127.0.0.1:3048/interactives', h.base), init);
  }) as typeof fetch;
});
afterAll(async () => {
  globalThis.fetch = realFetch;
  delete process.env.COGNITI_TOKEN;
  process.env.SUITE_SESSION_ENFORCE = '';
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.COGNITI_TOKEN = TOKEN;
  delete process.env.INTERACTIVES_DESIGNER;
  process.env.SUITE_SESSION_ENFORCE = '';
  sent = [];
  script = [];
  gate = null;
  conversations = 0;
  h.db.audit.docs = [];
  id = `prdes${String(++n).padStart(5, '0')}`;
  expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } })).status).toBe(200);
});

//Posts a request as someone and reads the lines of json that come back
const ask = async (message: string, opts: { user?: User; conversation?: string; projectId?: string } = {}) => {
  const user = opts.user ?? ann;
  const r = await h.call('POST', '/api/designer/chat', { user, json: { projectId: opts.projectId ?? id, conversation: opts.conversation, message }, headers: { 'x-session-id': sessionHeader(user)! } });
  const events = r.status === 200 ? r.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...r, events };
};
const types = (events: any[]) => events.map((e) => e.type);
const runs = () => h.db.audit.docs.filter((d: any) => d.event === 'designer-run');
const currentX = async () => (await h.call('GET', `/api/projects/${id}`, { user: ann })).json.project.artboards[0].children[0].x;

describe('who can use it', () => {
  it('is hidden without a token and off with the switch', async () => {
    delete process.env.COGNITI_TOKEN;
    expect((await h.call('GET', '/api/session', { user: ann })).json.designer).toBe(false);
    expect((await ask('hi')).status).toBe(404);
    process.env.COGNITI_TOKEN = TOKEN;
    expect((await h.call('GET', '/api/session', { user: ann })).json.designer).toBe(true);
    process.env.INTERACTIVES_DESIGNER = 'off';
    expect((await h.call('GET', '/api/session', { user: ann })).json.designer).toBe(false);
    expect((await ask('hi')).status).toBe(404);
    expect(sent).toEqual([]);
  });

  it('refuses someone who cannot edit the project, before anything goes to Cogniti', async () => {
    process.env.SUITE_SESSION_ENFORCE = '1';
    const r = await ask('Add a page', { user: bob });
    expect(r.status).toBe(403);
    expect(sent).toEqual([]);
    expect(runs()).toHaveLength(0);
    // the owner is fine
    script = ['Hello.'];
    expect((await ask('Say hello')).status).toBe(200);
  });

  it('needs a good project id and a message', async () => {
    expect((await ask('x', { projectId: '../etc' })).status).toBe(400);
    expect((await ask('   ')).status).toBe(400);
    expect((await ask('x'.repeat(5000))).status).toBe(413);
    expect((await ask('x', { projectId: 'prnothere1' })).status).toBe(404);
  });
});

describe('the tool loop', () => {
  it('runs the editor tools as the person, changes the project, and saves a restore point first', async () => {
    script = [
      tool({ tool: 'get_overview', args: { project_id: id } }),
      tool({ tool: 'edit', args: { project_id: id, changes: [{ op: 'set_props', id: 'r1', props: { x: 321 } }], explain: 'Move the box' } }),
      tool({ tool: 'validate', args: { project_id: id } }),
      'I moved the Box across on the Main page.',
    ];
    const r = await ask('Move the box to the right');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    expect(types(r.events)).toEqual(expect.arrayContaining(['status', 'changed', 'reply', 'done']));
    expect(r.events.at(-1).type).toBe('done');
    expect(r.events.find((e) => e.type === 'reply').text).toBe('I moved the Box across on the Main page.');
    const words = r.events.filter((e) => e.type === 'status').map((e) => e.text);
    expect(words).toEqual(expect.arrayContaining(['Reading the project', 'Changing the project', 'Checking the project']));
    for (const w of words) expect(w).not.toMatch(/get_overview|set_props|validate|\{/);
    expect(await currentX()).toBe(321);

    // the restore point: named, saved before the edit, holding the old position
    const changed = r.events.find((e) => e.type === 'changed');
    const revs = h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before the Activity Designer');
    expect(revs).toHaveLength(1);
    expect(changed.revision).toBe(revs[0]._id);
    const before = (await h.call('GET', `/api/projects/${id}/revisions/${changed.revision}`, { user: ann })).json.project;
    expect(before.artboards[0].children[0].x).toBe(10);

    // the protocol: the first message carries the tools, the guide and the project, then tool results go back
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(1);
    const msgs = sent.filter((s) => s.path === '/api/v1/chat/message');
    expect(msgs).toHaveLength(4);
    expect(msgs[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(msgs[0].body.agent_id).toBe('6af3a041a8d105e6274a6bdc');
    expect(msgs[0].body.chat_history).toEqual([]);
    expect(msgs[0].body.messages[0].content).toContain('# Tools');
    expect(msgs[0].body.messages[0].content).toContain('# Building guide');
    expect(msgs[0].body.messages[0].content).toContain(`id ${id}`);
    expect(msgs[0].body.messages[0].content).toContain('Water cycle');
    expect(msgs[0].body.messages[0].content).toContain('Move the box to the right');
    expect(msgs[1].body.messages[0].content).toMatch(/^Tool results:/);
    expect(msgs[3].body.chat_history).toHaveLength(6);

    // the audit log: each tool as the person, as the Activity Designer, then one row for the run without a word of the chat
    const tools = h.db.audit.docs.filter((d: any) => d.event === 'agent-tool');
    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(tools.every((d: any) => d.by.username === 'ann' && d.detail.agent === 'Activity Designer')).toBe(true);
    expect(tools.map((d: any) => d.detail.tool)).toEqual(expect.arrayContaining(['join_session', 'get_overview', 'edit', 'validate']));
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ by: { username: 'ann' }, project: id, detail: { rounds: 4, outcome: 'replied', changed: true } });
    expect(JSON.stringify(runs()[0])).not.toMatch(/Move the box|moved the Box/);

    // the token goes nowhere near the browser
    expect(r.text).not.toContain(TOKEN);
    expect(JSON.stringify(r.headers)).not.toContain(TOKEN);
  });

  it('shows to live editors as the Activity Designer, and undo restores the project for them too', async () => {
    const live = await h.stream(`/api/projects/${id}/live?clientId=human1&name=Hannah`, { user: ann });
    await live.waitFor((e) => e.event === 'hello');
    script = [tool({ tool: 'edit', args: { project_id: id, changes: [{ op: 'set_props', id: 'r1', props: { x: 99 } }] } }), 'Done.'];
    const r = await ask('Move it');
    const revision = r.events.find((e) => e.type === 'changed').revision;
    await live.waitFor((e) => e.event === 'ops');
    expect(live.events.some((e) => e.event === 'presence' && /Activity Designer/.test(e.data.name ?? ''))).toBe(true);
    expect(await currentX()).toBe(99);

    const undo = await h.call('POST', `/api/projects/${id}/revisions/${revision}/restore`, { user: ann });
    expect(undo.status).toBe(200);
    await live.waitFor((e) => e.event === 'reset');
    expect(await currentX()).toBe(10);
    live.close();
  });

  it('saves nothing and offers no undo when the agent only reads', async () => {
    script = [tool({ tool: 'get_layers', args: { project_id: id, ids: ['r1'] } }), 'The Box is a rectangle.'];
    const r = await ask('What is on the page?');
    expect(types(r.events)).not.toContain('changed');
    expect(h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before the Activity Designer')).toHaveLength(0);
    expect(runs()[0].detail).toMatchObject({ outcome: 'replied', changed: false });
  });

  it('carries a chat on when the panel hands the handle back, and starts again without it', async () => {
    script = ['First.', 'Second.', 'Third.'];
    const a = await ask('one');
    const handle = a.events.at(-1).conversation;
    expect(handle).toBeTruthy();
    const b = await ask('two', { conversation: handle });
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(1);
    const second = sent.filter((s) => s.path === '/api/v1/chat/message')[1];
    expect(second.body.conversation_id).toBe('conv1');
    expect(second.body.chat_history).toHaveLength(2);
    expect(second.body.messages[0].content).not.toContain('# Building guide');
    expect(b.events.at(-1).conversation).toBe(handle);
    await ask('three');
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(2);
    // New chat forgets it on the server too
    await h.call('POST', '/api/designer/reset', { user: ann, json: { projectId: id } });
    await ask('four', { conversation: handle });
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(3);
  });

  it('gives up after twenty rounds with a plain message, and the work so far stays', async () => {
    script = Array.from({ length: 30 }, () => tool({ tool: 'get_overview', args: { project_id: id } }));
    const r = await ask('Loop forever');
    expect(sent.filter((s) => s.path === '/api/v1/chat/message')).toHaveLength(20);
    expect(r.events.find((e) => e.type === 'reply').text).toContain("wasn't able to finish");
    expect(runs()[0].detail).toMatchObject({ outcome: 'round-cap', rounds: 20 });
    expect(r.events.at(-1)).toMatchObject({ type: 'done', conversation: null });
  });

  it('will not touch another project', async () => {
    const other = `${id}x`;
    await h.call('PUT', `/api/projects/${other}`, { user: ann, json: { project: project(other), rev: 0 } });
    script = [tool({ tool: 'edit', args: { project_id: other, changes: [{ op: 'set_props', id: 'r1', props: { x: 5 } }] } }), 'Done.'];
    const r = await ask('Change the other one');
    expect(types(r.events)).not.toContain('changed');
    const second = sent.filter((s) => s.path === '/api/v1/chat/message')[1];
    expect(second.body.messages[0].content).toContain('only work in the project');
    expect((await h.call('GET', `/api/projects/${other}`, { user: ann })).json.project.artboards[0].children[0].x).toBe(10);
  });
});

describe('when Cogniti says no', () => {
  it('says the hourly limit kindly', async () => {
    script = [429];
    const r = await ask('Build something');
    expect(r.events.find((e) => e.type === 'error').text).toBe('The Activity Designer has reached its hourly limit. Try again in a little while.');
    expect(runs()[0].detail.outcome).toBe('limit');
    expect(r.text).not.toContain(TOKEN);
  });

  it('says when its safety checks blocked a request', async () => {
    script = [406];
    const r = await ask('Something odd');
    expect(r.events.find((e) => e.type === 'error').text).toMatch(/content safety/);
    expect(runs()[0].detail.outcome).toBe('blocked');
  });

  it('keeps the undo when it fails partway through', async () => {
    script = [tool({ tool: 'edit', args: { project_id: id, changes: [{ op: 'set_props', id: 'r1', props: { x: 77 } }] } }), 429];
    const r = await ask('Move it');
    expect(types(r.events)).toEqual(expect.arrayContaining(['changed', 'error', 'done']));
    expect(runs()[0].detail).toMatchObject({ outcome: 'limit', changed: true });
  });
});

describe('one at a time', () => {
  it('turns a second request from the same person away while one is running, then lets the next in', async () => {
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    script = ['Slow answer.'];
    const first = ask('Take your time');
    await vi.waitFor(() => expect(sent.some((s) => s.path === '/api/v1/conversations/new')).toBe(true));
    const second = await ask('Me again');
    expect(second.status).toBe(409);
    expect(second.json.error).toMatch(/still working/);
    open();
    expect((await first).events.at(-1).type).toBe('done');
    gate = null;
    script = ['Fine.'];
    expect((await ask('Now')).status).toBe(200);
  });

  it('stops after the current tool when the browser disconnects, and frees the person', async () => {
    let open!: () => void;
    const ctl = new AbortController();
    gate = new Promise<void>((r) => (open = r));
    script = [tool({ tool: 'get_overview', args: { project_id: id } }), tool({ tool: 'get_layers', args: { project_id: id, ids: ['r1'] } }), 'never said'];
    const pending = realFetch(h.base + '/api/designer/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-session': sessionHeader(ann)!, 'x-session-id': sessionHeader(ann)! },
      body: JSON.stringify({ projectId: id, message: 'Look around' }),
      signal: ctl.signal,
    }).catch(() => null);
    await vi.waitFor(() => expect(sent.some((s) => s.path === '/api/v1/conversations/new')).toBe(true));
    ctl.abort();
    await pending;
    await new Promise((r) => setTimeout(r, 150));
    gate = null;
    open();
    await vi.waitFor(() => expect(runs()).toHaveLength(1));
    expect(runs()[0].detail.outcome).toBe('cancelled');
    expect(sent.filter((s) => s.path === '/api/v1/chat/message')).toHaveLength(1);
    script = ['Back.'];
    expect((await ask('Again')).status).toBe(200);
  });
});
