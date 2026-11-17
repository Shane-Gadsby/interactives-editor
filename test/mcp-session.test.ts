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

  it('leaves, reads, edits and removes sticky notes, which people in the room see arrive and which stay out of the shared page', async () => {
    const person = await human();
    const added = await run('add_note', { artboard_id: project.artboards[0].id, text: 'Swap this photo', x: 30, y: 40, layer_id: 'r1' });
    expect(added).toContain('Applied 1 change');
    await person.waitFor((e) => e.event === 'ops' && JSON.stringify(e.data).includes('Swap this photo'));
    const notes = (await live()).artboards[0].notes!;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ text: 'Swap this photo', author: 'Tester (AI)', anchor: { layerId: 'r1' } });
    expect(await run('list_notes')).toContain('Swap this photo');
    expect(await run('list_notes', { artboard_id: 'no such artboard' }).catch((e: Error) => e.message)).toMatch(/No artboard/);
    await run('edit_note', { id: notes[0].id, text: 'Photo swapped', colour: 'green', layer_id: null });
    expect((await live()).artboards[0].notes![0]).toMatchObject({ text: 'Photo swapped', colour: 'green' });
    expect((await live()).artboards[0].notes![0].anchor).toBeUndefined();
    await run('remove_note', { id: notes[0].id });
    expect((await live()).artboards[0].notes).toBeUndefined();
    expect(await run('list_notes')).toBe('No notes.');
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

describe('making projects and adding files', () => {
  it('makes a blank project in the toolbox look, in a folder, and joins it', async () => {
    const text = await tool('create_project').run({ name: 'Study planner', folder: 'Agents' });
    const made = /\[(pr\w+)\] and joined it/.exec(text)?.[1];
    expect(made).toBeTruthy();
    expect(text).toContain('## Colour tokens');
    const p = (await h.call('GET', `/api/projects/${made}`)).json.project as Project;
    expect(p.name).toBe('Study planner');
    expect(p.themes!.list.map((t) => t.name)).toEqual(['Light', 'Dark', 'High contrast']);
    expect(p.fonts.some((f) => f.family === 'Open Sans')).toBe(true);
    const list = (await h.call('GET', '/api/projects')).json as { id: string; folder?: string | null }[];
    expect(list.find((x) => x.id === made)?.folder).toBe('Agents');
    expect(mcp.sessions.has(made!)).toBe(true);
    mcp.sessions.get(made!)!.abort.abort();
    mcp.sessions.delete(made!);
  });

  it('makes a project from a built-in starter, and refuses one it does not know', async () => {
    const text = await tool('create_project').run({ name: 'Sorting', from: { starter: 'sorting' } });
    const made = /\[(pr\w+)\] and joined it/.exec(text)![1];
    const p = (await h.call('GET', `/api/projects/${made}`)).json.project as Project;
    expect(p.template?.builtin).toBe('sorting');
    mcp.sessions.get(made)!.abort.abort();
    mcp.sessions.delete(made);
    await expect(tool('create_project').run({ name: 'X', from: { starter: 'nope' } })).rejects.toThrow(/No starter nope/);
    expect(await tool('list_starters').run({})).toContain('- sorting: Drag and drop sorting');
  });

  it('uploads a file as an asset, with its record in the document', async () => {
    const text = await run('upload_asset', { name: 'dot.png', base64: Buffer.from('not really a png').toString('base64') });
    const asset = /as asset (\w+)/.exec(text)![1];
    const p = await live();
    expect(p.assets.find((a) => a.id === asset)).toMatchObject({ name: 'dot.png', mime: 'image/png', size: 16 });
    const file = await h.call('GET', `/api/projects/${id}/assets/${asset}`);
    expect(file.status).toBe(200);
    expect(file.text).toBe('not really a png');
  });

  it('turns a data source given as text into an uploaded file it reads from, and refuses JSON that is not', async () => {
    const data = JSON.stringify({ courses: [{ code: 'SCI101' }] });
    await run('edit', { changes: [{ op: 'add_data_source', name: 'handbook', kind: 'json', text: data }] });
    const p = await live();
    const ds = p.dataSources.find((d) => d.name === 'handbook')!;
    expect(ds.source).toBe('asset');
    expect(p.assets.find((a) => a.id === ds.assetId)).toMatchObject({ name: 'handbook.json', mime: 'application/json' });
    expect((await h.call('GET', `/api/projects/${id}/assets/${ds.assetId}`)).text).toBe(data);
    await expect(run('edit', { changes: [{ op: 'add_data_source', name: 'bad', kind: 'json', text: '{nope' }] })).rejects.toThrow(/not JSON/);
  });

  it('exports the document or one part of it, and gives variables in full', async () => {
    expect(JSON.parse(await run('export_project')).id).toBe(id);
    expect(JSON.parse(await run('export_project', { part: 'artboards' }))[0].children).toHaveLength(2);
    expect(await run('export_project', { part: 'nope' })).toContain('The project has no nope');
    await run('edit', { changes: [{ op: 'add_variable', name: 'score', type: 'number', initial: 3 }] });
    expect(JSON.parse(await run('get_variables', { names: ['score'] }))[0]).toMatchObject({ name: 'score', initial: 3 });
  });
});
