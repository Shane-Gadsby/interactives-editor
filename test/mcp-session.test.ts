// @vitest-environment node
//The MCP server's tools talking to the real editor server (index.js on an in-memory database) over real HTTP and
//server-sent events: joining a project's live room, what a person selecting something looks like to the agent, and
//agent edits reaching the room and the people in it.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject, type Project } from '../../interactives-player/src/format';
import { startServer, type Harness, type Stream } from './helpers/server-harness';

type Server = typeof import('../mcp/server');
let h: Harness;
let mcp: Server;
let n = 0;
let id = '';
let project: Project;
const streams: Stream[] = [];

beforeAll(async () => {
  h = await startServer();
  process.env.INTERACTIVES_MCP_NO_STDIO = '1';
  process.env.INTERACTIVES_URL = h.base;
  process.env.INTERACTIVES_AGENT_NAME = 'Tester';
  mcp = await import('../mcp/server');
});
afterAll(async () => {
  for (const s of streams) s.close();
  for (const s of mcp.sessions.values()) s.abort.abort();
  await h.close();
});
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'trace').mockImplementation(() => {});
  id = `prmcp${String(++n).padStart(5, '0')}`;
  project = createProject('Agent Playground');
  project.id = id;
  project.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', x: 10, y: 20, width: 100, height: 50 }), createNode('text', { id: 't1', name: 'Title', text: 'Hi' }));
  expect((await h.call('PUT', `/api/projects/${id}`, { json: { project, rev: 0 } })).status).toBe(200);
});

const tool = (name: string) => mcp.TOOLS.find((t) => t.name === name)!;
const run = (name: string, args: Record<string, unknown> = {}) => tool(name).run({ project_id: id, ...args });
const live = async () => (await h.call('GET', `/api/projects/${id}`)).json.project as Project;
const human = async () => {
  const s = await h.stream(`/api/projects/${id}/live?clientId=human1&name=Hannah`);
  streams.push(s);
  await s.waitFor((e) => e.event === 'hello');
  return s;
};

describe('reading', () => {
  it('lists the projects the session can see', async () => {
    const text = await tool('list_projects').run({});
    expect(text).toContain(`Agent Playground [${id}] 1 artboards`);
  });

  it('gives an overview, optionally for one artboard by name, and the full JSON of layers (missing ones marked)', async () => {
    expect(await run('get_overview')).toContain('- Box [rect r1] @10,20 100x50');
    expect(await run('get_overview', { artboard_id: project.artboards[0].name, depth: 3 })).toContain('## Artboard');
    const layers = await run('get_layers', { ids: ['r1', 'ghost'] });
    expect(layers).toContain('"name": "Box"');
    expect(layers).toContain('"missing": "ghost"');
  });

  it('reads the interaction graph and validates', async () => {
    expect(await run('get_interactions', { artboard_id: project.artboards[0].name })).toContain('Interactions on');
    expect(await run('validate')).toBe('No problems found.');
  });

  it('turns the server\'s error into the tool\'s error text', async () => {
    await expect(tool('get_overview').run({ project_id: 'prmissing01' })).rejects.toThrow('No such project');
    await expect(tool('validate').run({ project_id: '../etc' })).rejects.toThrow();
  });
});

describe('joining and editing a live room', () => {
  it('joins as "<name> (AI)", tells people it is there, and says who else is', async () => {
    const hannah = await human();
    const text = await run('join_session');
    expect(text).toContain('Joined "Agent Playground" as Tester (AI).');
    expect(text).toContain('In the session:\n- Hannah');
    const joined = await hannah.waitFor((e) => e.event === 'presence' && e.data.joined && /Tester/.test(e.data.name));
    expect(joined.data.name).toBe('Tester (AI)');
    await run('leave_session');
  });

  it('says nobody else is there when it is alone, and joining twice reuses the session', async () => {
    const text = await run('join_session');
    expect(text).toContain('Nobody else is in this project right now.');
    expect(mcp.sessions.size).toBe(1);
    await run('join_session');
    expect(mcp.sessions.size).toBe(1);
    expect(await run('leave_session')).toBe('Left the session.');
    expect(mcp.sessions.size).toBe(0);
    expect(await run('leave_session')).toBe('Was not in that session.');
  });

  it('shows what a person has selected, with the layer JSON', async () => {
    const hannah = await human();
    await run('join_session');
    await h.call('POST', `/api/projects/${id}/presence`, { json: { clientId: 'human1', presence: { artboardId: project.artboards[0].id, selection: ['r1'] } } });
    await hannah.waitFor((e) => e.event === 'presence' && e.data.selection?.length);
    //the agent hears about it a moment later
    await vi.waitFor(async () => expect(await run('get_selection')).toContain('Hannah selected Box on'), { timeout: 2000 });
    const text = await run('get_selection');
    expect(text).toContain('- Hannah on ');
    expect(text).toContain('selected: Box');
    expect(text).toContain('"type": "rect"');
    await run('leave_session');
  });

  it('applies an edit to the room: it is in the document at once, and the people in the room get the ops', async () => {
    const hannah = await human();
    const text = await run('edit', { changes: [{ op: 'set_props', id: 'r1', props: { x: 321 } }, { op: 'add_layer', artboard_id: project.artboards[0].id, type: 'ellipse', props: { name: 'Dot' }, ref: 'dot' }] });
    expect(text).toMatch(/^Applied 2 change\(s\) as \d+ op\(s\)\./);
    expect(text).toMatch(/Created: \{"dot":"[^"]+"\}/);
    const after = await live();
    expect((after.artboards[0].children.find((c) => c.id === 'r1') as any).x).toBe(321);
    expect(after.artboards[0].children.some((c) => c.name === 'Dot')).toBe(true);
    const ops = await hannah.waitFor((e) => e.event === 'ops' && e.data.clientId.startsWith('agent-'));
    expect(ops.data.ops.length).toBeGreaterThan(0);
    await run('leave_session');
  });

  it('points the person at what it changed (selection and artboard in presence)', async () => {
    const hannah = await human();
    await run('edit', { changes: [{ op: 'set_props', id: 'r1', props: { name: 'Renamed' } }] });
    const p = await hannah.waitFor((e) => e.event === 'presence' && /Tester/.test(e.data.name ?? '') && e.data.selection?.includes('r1'));
    expect(p.data.artboardId).toBe(project.artboards[0].id);
    expect(p.data.cursor).toEqual({ x: expect.any(Number), y: expect.any(Number) });
    await run('leave_session');
  });

  it('says so when a change does nothing', async () => {
    expect(await run('edit', { changes: [{ op: 'set_props', id: 'r1', props: { x: 10 } }] })).toBe('Nothing changed.');
    await run('leave_session');
  });

  it('lists the problems an edit leaves behind', async () => {
    const abId = project.artboards[0].id;
    const text = await run('edit', { changes: [{ op: 'add_interactions', artboard_id: abId, nodes: [{ kind: 'event.pointer', params: { target: 'ghost' } }] }] });
    expect(text).toContain('Problems now in the project:');
    expect(text).toContain('points at a missing layer ghost');
    expect(await run('validate')).toContain('is not connected to anything');
    await run('leave_session');
  });

  it('refuses a bad change without touching the project', async () => {
    await expect(run('edit', { changes: [{ op: 'set_props', id: 'r1', props: { x: 1 } }, { op: 'delete', id: 'ghost' }] })).rejects.toThrow(/no layer ghost/);
    expect(((await live()).artboards[0].children[0] as any).x).toBe(10);
    await run('leave_session');
  });

  it('what the agent sees after an edit matches what the server holds (a second edit builds on the first)', async () => {
    await run('edit', { changes: [{ op: 'add_variable', name: 'score', initial: 3 }] });
    await run('edit', { changes: [{ op: 'set_variable', id: 'score', props: { initial: 4 } }] });
    expect((await live()).variables).toMatchObject([{ name: 'score', initial: 4 }]);
    expect(await run('get_overview')).toContain('- score [');
    await run('leave_session');
  });

  it('cannot join a project that does not exist, and can try again afterwards', async () => {
    await expect(tool('join_session').run({ project_id: 'prmissing01' })).rejects.toThrow(/Could not join the live session \(404\)/);
    expect(mcp.sessions.has('prmissing01')).toBe(false);
    expect(await run('join_session')).toContain('Joined');
    await run('leave_session');
  });

  it('drops its session when the project is deleted', async () => {
    await run('join_session');
    const s = mcp.sessions.get(id)!;
    await h.call('DELETE', `/api/projects/${id}`);
    await vi.waitFor(() => expect(s.abort.signal.aborted).toBe(true), { timeout: 2000 });
    mcp.sessions.delete(id);
  });
});
