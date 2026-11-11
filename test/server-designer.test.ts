// @vitest-environment node
//The Activity Designer's route (index.js and designer.js together) with Cogniti pretended: one request is one Cogniti message,
//the agent's blueprint is built in the open project as the person with a restore point first, a real leftover problem costs
//one more message (never more than three), only people who can edit the project get in, one request at a time, a fair share
//of the shared token each, their own token if they have added one, and the token and the words never get out
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject } from '../../interactives-player/src/format';
import { startServer, sessionHeader, type Harness, type User } from './helpers/server-harness';

const TOKEN = 'cogniti-test-token-9f3a';
const OWN = 'cogniti-own-token-77c1';
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
//what GET /api/v1/agents/ answers (the check on a token of someone's own), and what a new conversation does
let agents: { status: number; body: unknown } = { status: 200, body: [{ id: '6af3a041a8d105e6274a6bdc', can_chat: true }] };
let newConversationStatus = 200;

const bp = (o: unknown, words = 'I added a Quiz page.') => '```blueprint\n' + JSON.stringify(o) + '\n```\n' + words;
const project = (pid: string) => {
  const p = createProject('Water cycle');
  p.id = pid;
  p.artboards[0].name = 'Page 1';
  p.artboards[0].width = 1024;
  p.artboards[0].height = 640;
  p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 10, y: 20, width: 100, height: 50 }));
  return p;
};
//"Add a page with a multiple choice question about clouds, linked from page 1"
const QUIZ = {
  pages: [
    { name: 'Quiz', title: 'Clouds', elements: [{ type: 'question', kind: 'single', prompt: 'Which process makes clouds?', options: [{ text: 'Condensation', correct: true, feedback: 'Yes, vapour cools into droplets.' }, { text: 'Evaporation', feedback: 'That is the reverse.' }], hints: ['Think of a cold glass.'] }] },
    { name: 'Page 1', elements: [{ type: 'button', name: 'Start quiz', label: 'Start the quiz', does: 'go to the page called Quiz' }] },
  ],
};

beforeAll(async () => {
  process.env.INTERACTIVES_SECRET_KEY = 'a test secret for sealing tokens';
  h = await startServer();
  globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => {
    const u = String(url);
    if (u.startsWith('https://cogniti.unisq.edu.au/')) {
      const path = u.slice('https://cogniti.unisq.edu.au'.length);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      sent.push({ path, auth: new Headers(init?.headers).get('authorization'), body: body && JSON.parse(JSON.stringify(body)) });
      if (path === '/api/v1/agents/') return new Response(JSON.stringify(agents.body), { status: agents.status });
      if (path === '/api/v1/conversations/new') return newConversationStatus === 200 ? new Response(JSON.stringify({ conversation_id: `conv${++conversations}` })) : new Response('{}', { status: newConversationStatus });
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
  delete process.env.INTERACTIVES_SECRET_KEY;
  delete process.env.INTERACTIVES_DESIGNER_PER_HOUR;
  delete process.env.INTERACTIVES_DESIGNER_BEAT_MS;
  process.env.SUITE_SESSION_ENFORCE = '';
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  process.env.COGNITI_TOKEN = TOKEN;
  delete process.env.INTERACTIVES_DESIGNER;
  //no share limit unless a test is about it
  process.env.INTERACTIVES_DESIGNER_PER_HOUR = '0';
  delete process.env.INTERACTIVES_DESIGNER_BEAT_MS;
  process.env.SUITE_SESSION_ENFORCE = '';
  sent = [];
  script = [];
  gate = null;
  conversations = 0;
  agents = { status: 200, body: [{ id: '6af3a041a8d105e6274a6bdc', can_chat: true }] };
  newConversationStatus = 200;
  h.db.audit.docs = [];
  h.db['designer-tokens'].docs = [];
  id = `prdes${String(++n).padStart(5, '0')}`;
  expect((await h.call('PUT', `/api/projects/${id}`, { user: ann, json: { project: project(id), rev: 0 } })).status).toBe(200);
});

//Posts a request as someone and reads the lines of json that come back
const ask = async (message: string, opts: { user?: User; conversation?: string; projectId?: string; artboardId?: string } = {}) => {
  const user = opts.user ?? ann;
  const r = await h.call('POST', '/api/designer/chat', { user, json: { projectId: opts.projectId ?? id, artboardId: opts.artboardId, conversation: opts.conversation, message }, headers: { 'x-session-id': sessionHeader(user)! } });
  const events = r.status === 200 ? r.text.split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { ...r, events };
};
const types = (events: any[]) => events.map((e) => e.type);
const runs = () => h.db.audit.docs.filter((d: any) => d.event === 'designer-run');
const messages = () => sent.filter((s) => s.path === '/api/v1/chat/message');
const getProject = async () => (await h.call('GET', `/api/projects/${id}`, { user: ann })).json.project;
const currentX = async () => (await getProject()).artboards[0].children[0].x;
const pageNamed = (p: any, name: string) => p.artboards.find((a: any) => a.name === name);
const validate = async () => {
  const mcp: any = await import('../mcp/server');
  return mcp.validate((await getProject()));
};

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

describe('one request, one message', () => {
  it('"add a page with a multiple choice question, linked from page 1" costs exactly one Cogniti message and leaves a valid project', async () => {
    script = [bp(QUIZ, 'I added a Quiz page with one question, and a Start the quiz button on Page 1.')];
    const start = (await getProject()).artboards[0].id;
    const r = await ask('Add a page with a multiple choice question about clouds, linked from page 1', { artboardId: start });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('application/x-ndjson');
    expect(types(r.events)).toEqual(expect.arrayContaining(['status', 'changed', 'reply', 'done']));
    expect(r.events.at(-1).type).toBe('done');
    expect(r.events.find((e) => e.type === 'reply').text).toBe('I added a Quiz page with one question, and a Start the quiz button on Page 1.');
    const words = r.events.filter((e) => e.type === 'status').map((e) => e.text);
    expect(words).toEqual(expect.arrayContaining(['Reading the project', 'Thinking it through', 'Building it in your project']));
    for (const w of words) expect(w).not.toMatch(/blueprint|get_overview|set_props|validate|\{/);

    //one conversation, one message, valid result
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(1);
    expect(messages()).toHaveLength(1);
    const p = await getProject();
    const quiz = pageNamed(p, 'Quiz');
    expect(quiz).toBeTruthy();
    expect(JSON.stringify(quiz.children)).toContain('Which process makes clouds?');
    expect(pageNamed(p, 'Page 1').logic.nodes.some((x: any) => x.kind === 'action.artboard')).toBe(true);
    expect(await validate()).toEqual([]);

    //what the one message carried: the spec, the project and its open page, the request. Not a tool list or the old 100k guide
    const m = messages()[0];
    expect(m.auth).toBe(`Bearer ${TOKEN}`);
    expect(m.body.agent_id).toBe('6af3a041a8d105e6274a6bdc');
    expect(m.body.chat_history).toEqual([]);
    const text = m.body.messages[0].content as string;
    for (const part of ['# Blueprint spec', '# Playbook', 'Every option gets its own feedback', '# The blueprint format', `id ${id}`, 'Water cycle', '# The open page in full', 'Box [rect r1]', '# Request\nAdd a page with a multiple choice question about clouds, linked from page 1']) expect(text).toContain(part);
    expect(text).not.toContain('# Tools');
    expect(text.length).toBeLessThan(30000);

    // the restore point: named, saved before the build, holding the project as it was
    const changed = r.events.find((e) => e.type === 'changed');
    const revs = h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before the Activity Designer');
    expect(revs).toHaveLength(1);
    expect(changed.revision).toBe(revs[0]._id);
    const before = (await h.call('GET', `/api/projects/${id}/revisions/${changed.revision}`, { user: ann })).json.project;
    expect(before.artboards.map((a: any) => a.name)).toEqual(['Page 1']);

    // the audit log: the person, the Activity Designer as the agent, and one row for the run without a word of the chat
    const tools = h.db.audit.docs.filter((d: any) => d.event === 'agent-tool');
    expect(tools.every((d: any) => d.by.username === 'ann' && d.detail.agent === 'Activity Designer')).toBe(true);
    expect(tools.map((d: any) => d.detail.tool)).toEqual(expect.arrayContaining(['join_session', 'get_overview', 'designer_build']));
    expect(runs()).toHaveLength(1);
    expect(runs()[0]).toMatchObject({ by: { username: 'ann' }, project: id, detail: { rounds: 1, outcome: 'replied', changed: true, own: false } });
    expect(JSON.stringify(runs()[0])).not.toMatch(/multiple choice|Quiz page/);

    // the token goes nowhere near the browser
    expect(r.text).not.toContain(TOKEN);
    expect(JSON.stringify(r.headers)).not.toContain(TOKEN);
  });

  it('puts the fix right when the agent sends one: two messages, a valid project, one restore point', async () => {
    //a hand-written step that points at a layer that is not there: the project's own validate flags it, and the build can't know what was meant
    const broken = { raw: [{ op: 'add_interactions', artboard_id: 'Page 1', nodes: [{ ref: 'a', kind: 'action.visibility', params: { target: 'nothing-here', op: 'show' } }] }] };
    script = [bp(broken, 'I wired the box.')];
    //the second reply reads the problem list it is sent and removes the step it names
    let removeIt = '';
    const real = globalThis.fetch as any;
    globalThis.fetch = vi.fn(async (url: any, init?: RequestInit) => {
      if (String(url).endsWith('/api/v1/chat/message') && init?.body && JSON.parse(String(init.body)).messages[0].content.startsWith('# Problems')) {
        removeIt = /\((lg[\w]+)\)/.exec(JSON.parse(String(init.body)).messages[0].content)?.[1] ?? '';
        script = [bp({ raw: [{ op: 'remove_interactions', artboard_id: 'Page 1', ids: [removeIt] }] }, 'I took the unfinished step out.')];
      }
      return real(url, init);
    }) as typeof fetch;
    try {
      const r = await ask('Wire the box to show something');
      expect(removeIt).toMatch(/^lg/);
      //exactly two messages, and the second is short: only the problem
      expect(messages()).toHaveLength(2);
      const problems = messages()[1].body.messages[0].content as string;
      expect(problems).toMatch(/^# Problems/);
      expect(problems).toContain('points at a missing layer nothing-here');
      expect(problems).not.toContain('# Blueprint spec');
      expect(problems.length).toBeLessThan(2000);
      expect(await validate()).toEqual([]);
      expect(r.events.filter((e) => e.type === 'changed')).toHaveLength(1);
      expect(h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before the Activity Designer')).toHaveLength(1);
      expect(r.events.find((e) => e.type === 'reply').text).toContain('I wired the box.');
      expect(r.events.find((e) => e.type === 'reply').text).toContain('I took the unfinished step out.');
      expect(runs()[0].detail).toMatchObject({ rounds: 2, outcome: 'replied', changed: true });
    } finally {
      globalThis.fetch = real;
    }
  });

  it('never goes past three messages, and says what is still wrong', async () => {
    const broken = { raw: [{ op: 'add_interactions', artboard_id: 'Page 1', nodes: [{ ref: 'a', kind: 'action.visibility', params: { target: 'nothing-here', op: 'show' } }] }] };
    script = [bp(broken, 'One.'), bp({ pages: [] }, 'Two.'), bp({ pages: [] }, 'Three.'), bp({ pages: [] }, 'Four.')];
    const r = await ask('Do the impossible');
    expect(messages()).toHaveLength(3);
    expect(r.events.find((e) => e.type === 'reply').text).toContain("couldn't finish everything");
    expect(runs()[0].detail).toMatchObject({ rounds: 3, outcome: 'replied' });
  });

  it('answers a plain question with plain words: nothing saved, no undo', async () => {
    script = ['A good activity for the water cycle is an ordering question: put the stages in order.'];
    const r = await ask('What would make a good activity for teaching the water cycle?');
    expect(types(r.events)).not.toContain('changed');
    expect(messages()).toHaveLength(1);
    expect(h.db.revisions.docs.filter((d: any) => d.project === id && d.name === 'Before the Activity Designer')).toHaveLength(0);
    expect(runs()[0].detail).toMatchObject({ outcome: 'replied', changed: false, rounds: 1 });
  });

  it('shows to live editors as the Activity Designer, and undo restores the project for them too', async () => {
    const live = await h.stream(`/api/projects/${id}/live?clientId=human1&name=Hannah`, { user: ann });
    await live.waitFor((e) => e.event === 'hello');
    script = [bp({ raw: [{ op: 'set_props', id: 'r1', props: { x: 99 } }] }, 'Moved it.')];
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

  it('carries a chat on when the panel hands the handle back, and starts again without it', async () => {
    script = ['First.', 'Second.', 'Third.'];
    const a = await ask('one');
    const handle = a.events.at(-1).conversation;
    expect(handle).toBeTruthy();
    const b = await ask('two', { conversation: handle });
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(1);
    const second = messages()[1];
    expect(second.body.conversation_id).toBe('conv1');
    //the history holds the request and the agent's answer, not the project that went with it
    expect(second.body.chat_history).toHaveLength(2);
    expect(second.body.chat_history[0].content).toBe('# Request\none');
    expect(b.events.at(-1).conversation).toBe(handle);
    await ask('three');
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(2);
    // New chat forgets it on the server too
    await h.call('POST', '/api/designer/reset', { user: ann, json: { projectId: id } });
    await ask('four', { conversation: handle });
    expect(sent.filter((s) => s.path === '/api/v1/conversations/new')).toHaveLength(3);
  });

  it('only ever builds in the open project', async () => {
    const other = `${id}x`;
    await h.call('PUT', `/api/projects/${other}`, { user: ann, json: { project: project(other), rev: 0 } });
    script = [bp({ pages: [{ name: 'Quiz' }] })];
    await ask('Add a page');
    expect(pageNamed(await getProject(), 'Quiz')).toBeTruthy();
    expect((await h.call('GET', `/api/projects/${other}`, { user: ann })).json.project.artboards.map((a: any) => a.name)).toEqual(['Page 1']);
  });
});

describe('when Cogniti says no', () => {
  it('says the hourly limit kindly, and says what kind of error it was so the panel can offer their own allowance', async () => {
    script = [429];
    const r = await ask('Build something');
    expect(r.events.find((e) => e.type === 'error')).toMatchObject({ text: 'The Activity Designer has reached its hourly limit. Try again in a little while.', kind: 'limit' });
    expect(runs()[0].detail.outcome).toBe('limit');
    expect(r.text).not.toContain(TOKEN);
  });

  it('says when its safety checks blocked a request', async () => {
    script = [406];
    const r = await ask('Something odd');
    expect(r.events.find((e) => e.type === 'error').text).toMatch(/content safety/);
    expect(runs()[0].detail.outcome).toBe('blocked');
  });

  it('keeps the undo when a follow-up message fails partway through', async () => {
    const broken = { raw: [{ op: 'add_interactions', artboard_id: 'Page 1', nodes: [{ ref: 'a', kind: 'action.visibility', params: { target: 'nothing-here', op: 'show' } }] }] };
    script = [bp(broken), 429];
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

  it('stops before building when the browser disconnects, and frees the person', async () => {
    let open!: () => void;
    const ctl = new AbortController();
    gate = new Promise<void>((r) => (open = r));
    script = [bp(QUIZ)];
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
    //nothing was built after the browser went
    expect(pageNamed(await getProject(), 'Quiz')).toBeUndefined();
    script = ['Back.'];
    expect((await ask('Again')).status).toBe(200);
  });
});

describe('the stream stays open through a slow Cogniti message', () => {
  it('writes a blank line on a timer (INTERACTIVES_DESIGNER_BEAT_MS) so haproxy never sees it quiet, and the panel still reads it', async () => {
    process.env.INTERACTIVES_DESIGNER_BEAT_MS = '25';
    let open!: () => void;
    gate = new Promise<void>((r) => (open = r));
    script = ['Worth the wait.'];
    const pending = ask('Take your time');
    await vi.waitFor(() => expect(sent.some((s) => s.path === '/api/v1/conversations/new')).toBe(true));
    //quiet for a good while: several beats go by
    await new Promise((r) => setTimeout(r, 250));
    open();
    const r = await pending;
    //a blank line sits between the status lines (each is a json line ending in a newline)
    expect(r.text).toMatch(/\n\n/);
    expect(r.text.split('\n').filter((l) => !l.trim()).length).toBeGreaterThanOrEqual(3);
    //the blank lines are skipped, the events are all there and in order
    expect(r.events.at(-1).type).toBe('done');
    expect(r.events.find((e) => e.type === 'reply').text).toBe('Worth the wait.');
  });

  it('does not beat at all once it has finished (the timer is cleared)', async () => {
    process.env.INTERACTIVES_DESIGNER_BEAT_MS = '20';
    script = ['Quick.'];
    const r = await ask('Be quick');
    expect(r.text.endsWith('\n')).toBe(true);
    expect(JSON.parse(r.text.trim().split('\n').at(-1)!).type).toBe('done');
  });
});

describe('a fair share of the shared token', () => {
  it('lets each person make a few requests an hour on it, says how many are left, and turns the next away before any Cogniti message', async () => {
    process.env.INTERACTIVES_DESIGNER_PER_HOUR = '2';
    script = ['One.', 'Two.', 'Three.'];
    const first = await ask('one', { user: { username: 'quota-a' } });
    expect(first.events.at(-1)).toMatchObject({ type: 'done', quota: { limit: 2, left: 1 } });
    const second = await ask('two', { user: { username: 'quota-a' } });
    expect(second.events.at(-1).quota).toMatchObject({ left: 0 });
    const before = messages().length;
    const third = await ask('three', { user: { username: 'quota-a' } });
    expect(third.status).toBe(429);
    expect(third.json).toMatchObject({ kind: 'quota', quota: { limit: 2, left: 0 } });
    expect(third.json.error).toMatch(/used your 2 shared Activity Designer requests/);
    expect(third.json.error).toMatch(/own Cogniti allowance/);
    expect(messages()).toHaveLength(before);
    //someone else still has theirs
    expect((await ask('mine', { user: { username: 'quota-b' } })).status).toBe(200);
    const status = (await h.call('GET', '/api/designer/status', { user: { username: 'quota-a' } })).json;
    expect(status).toMatchObject({ on: true, mine: null, shared: { limit: 2, left: 0 } });
  });

  it('gives the request back when Cogniti never took a message', async () => {
    process.env.INTERACTIVES_DESIGNER_PER_HOUR = '1';
    const who = { username: 'quota-c' };
    script = [429, 'Fine.'];
    const failed = await ask('first try', { user: who });
    expect(failed.events.find((e) => e.type === 'error').kind).toBe('limit');
    const again = await ask('second try', { user: who });
    expect(again.status).toBe(200);
  });

  it('has no limit at 0', async () => {
    process.env.INTERACTIVES_DESIGNER_PER_HOUR = '0';
    script = ['a', 'b', 'c'];
    for (const t of ['1', '2', '3']) expect((await ask(t, { user: { username: 'quota-d' } })).status).toBe(200);
    expect((await h.call('GET', '/api/designer/status', { user: { username: 'quota-d' } })).json.shared).toBeNull();
  });
});

describe('their own Cogniti allowance', () => {
  const put = (token: string, user: User = ann, extra: Record<string, unknown> = {}) => h.call('PUT', '/api/designer/token', { user, json: { token, ...extra } });
  const tokenAudit = () => h.db.audit.docs.filter((d: any) => /^designer-token/.test(d.event));

  it('checks the token once, keeps it sealed, and only ever says "connected"', async () => {
    const r = await put(OWN, ann, { ends: '2027-11-11' });
    expect(r.status).toBe(200);
    expect(r.json.mine).toMatchObject({ connected: true });
    expect(r.text).not.toContain(OWN);
    //it was checked against Cogniti with their token, once
    const checks = sent.filter((s) => s.path === '/api/v1/agents/');
    expect(checks).toHaveLength(1);
    expect(checks[0].auth).toBe(`Bearer ${OWN}`);
    //stored: not in the clear, and the key is not the row
    const rows = h.db['designer-tokens'].docs;
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe('ann');
    expect(JSON.stringify(rows[0])).not.toContain(OWN);
    expect(rows[0].data).toBeTruthy();
    //what the panel and Preferences can read: connected, when it was added, when it ends. Never the token
    const status = await h.call('GET', '/api/designer/status', { user: ann });
    expect(status.json).toMatchObject({ on: true, mine: { connected: true, ends: expect.stringContaining('2027-11-11') }, shared: null });
    expect(status.text).not.toContain(OWN);
    expect(status.json.mine.added).toBeTruthy();
    expect(JSON.stringify(Object.keys(status.json.mine).sort())).toBe(JSON.stringify(['added', 'connected', 'ends']));
    //audited, without the token
    expect(tokenAudit().map((d: any) => d.event)).toEqual(['designer-token-set']);
    expect(JSON.stringify(tokenAudit())).not.toContain(OWN);
    expect(JSON.stringify(h.db.audit.docs)).not.toContain(OWN);
  });

  it('uses it for that person\'s requests, takes nothing from the shared share, and falls back to the shared token without it', async () => {
    process.env.INTERACTIVES_DESIGNER_PER_HOUR = '1';
    await put(OWN, ann);
    script = ['One.', 'Two.', 'Three.'];
    const a = await ask('first');
    const b = await ask('second');
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(messages().every((m) => m.auth === `Bearer ${OWN}`)).toBe(true);
    //their own token isn't counted against the shared one, and says nothing about it
    expect(a.events.at(-1).quota).toBeNull();
    expect(runs().every((d: any) => d.detail.own === true)).toBe(true);
    expect(a.text).not.toContain(OWN);
    //Bob has no token of his own: he is on the shared one
    await ask('hello', { user: bob });
    expect(messages().at(-1)!.auth).toBe(`Bearer ${TOKEN}`);
    //remove it and Ann is back on the shared token
    const gone = await h.call('DELETE', '/api/designer/token', { user: ann });
    expect(gone.status).toBe(200);
    expect(h.db['designer-tokens'].docs).toHaveLength(0);
    expect(tokenAudit().map((d: any) => d.event)).toEqual(['designer-token-set', 'designer-token-removed']);
    await ask('back on shared');
    expect(messages().at(-1)!.auth).toBe(`Bearer ${TOKEN}`);
    expect((await h.call('GET', '/api/designer/status', { user: ann })).json).toMatchObject({ mine: null, shared: { limit: 1 } });
  });

  it('turns a token Cogniti does not accept away, and keeps nothing', async () => {
    agents = { status: 401, body: { message: 'no' } };
    const r = await put('not-a-real-token-1234');
    expect(r.status).toBe(400);
    expect(r.json.error).toMatch(/didn't accept that token/);
    expect(h.db['designer-tokens'].docs).toHaveLength(0);
    expect(tokenAudit()).toHaveLength(0);
  });

  it('says plainly when the token is fine but the Activity Designer is not shared with them yet, and keeps nothing', async () => {
    agents = { status: 200, body: [{ id: 'some-other-agent', can_chat: true }] };
    const r = await put(OWN);
    expect(r.status).toBe(400);
    expect(r.json).toMatchObject({ why: 'notShared' });
    expect(r.json.error).toMatch(/can't chat with the Activity Designer yet/);
    expect(h.db['designer-tokens'].docs).toHaveLength(0);
    agents = { status: 200, body: [{ id: '6af3a041a8d105e6274a6bdc', can_chat: false }] };
    expect((await put(OWN)).json.why).toBe('notShared');
  });

  it('handles Cogniti refusing the conversation with a plain message about their token', async () => {
    await put(OWN);
    newConversationStatus = 403;
    const r = await ask('Hello');
    expect(r.events.find((e) => e.type === 'error')).toMatchObject({ kind: 'forbidden' });
    expect(r.events.find((e) => e.type === 'error').text).toMatch(/didn't accept your own token/);
    expect(r.text).not.toContain(OWN);
  });

  it('rejects junk, needs a person, and is off when the designer is', async () => {
    expect((await put('short')).status).toBe(400);
    expect((await put('has spaces in it 12345')).status).toBe(400);
    expect((await put('x'.repeat(3000))).status).toBe(400);
    expect((await h.call('PUT', '/api/designer/token', { json: { token: OWN } })).status).toBe(401);
    process.env.INTERACTIVES_DESIGNER = 'off';
    expect((await put(OWN)).status).toBe(404);
  });

  it('is kept per person, and a token sealed for one cannot be read as another\'s', async () => {
    await put(OWN, ann);
    const row = h.db['designer-tokens'].docs[0];
    //moved to bob's row by hand: it does not open, so he's on the shared token
    h.db['designer-tokens'].docs.push({ ...row, _id: 'bob' });
    script = ['Hi.'];
    await ask('hello', { user: bob });
    expect(messages().at(-1)!.auth).toBe(`Bearer ${TOKEN}`);
  });
});
