// @vitest-environment node
//The MCP changes that came out of an agent's friction log (building a study planner): themes and tokens it can see and
//name, layers that follow the starter tokens, whole trees and copies in one op, names where ids were wanted, interaction
//nodes changed in place, data sources, text styles, and the shorter reference.
import { beforeAll, describe, expect, it } from 'vitest';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject, walk, type Project, type SceneNode } from '../../interactives-player/src/format';
import { newProjectWithThemes } from '../src/lib/themes';

type Server = typeof import('../mcp/server');
let mcp: Server;
beforeAll(async () => {
  process.env.INTERACTIVES_MCP_NO_STDIO = '1';
  mcp = await import('../mcp/server');
});

const change = (p: Project, changes: Record<string, unknown>[]) => mcp.applyChanges(p, changes as never);
const find = (p: Project, id: string) => mcp.locate(p, id)?.node as any;
const themed = () => newProjectWithThemes('Planner');
const tokenId = (p: Project, name: string) => p.themes!.tokens.find((t) => t.name === name)!.id;

describe('theme tokens', () => {
  it('shows the themes and every token with its value per theme in the overview', () => {
    const p = themed();
    const text = mcp.overview(p, {});
    expect(text).toContain('## Themes');
    expect(text).toMatch(/- Light \[theme-light\] light \(default\)/);
    expect(text).toContain(`- color/primary [${tokenId(p, 'color/primary')}] Light #`);
    expect(mcp.overview(createProject('Plain'), {})).toContain('None. add_theme or add_colourway');
  });

  it('stores a token named in a colour (token:color/primary) by its id, and a token made in the same batch by $ref', () => {
    const p = themed();
    const out = change(p, [
      { op: 'add_token', name: 'color/brand', value: '#123456', ref: 'brand' },
      { op: 'add_layer', artboard_id: p.artboards[0].id, type: 'rect', ref: 'r', props: { fill: { type: 'solid', color: 'token:color/primary' }, stroke: { paint: { type: 'solid', color: 'token:$brand' }, width: 2 } } },
    ]);
    const r = find(out.project, out.created.r);
    expect(r.fill.color).toBe(`token:${tokenId(out.project, 'color/primary')}`);
    expect(r.stroke.paint.color).toBe(`token:${out.created.brand}`);
  });

  it('gives a new layer the starter tokens when no colour is given, as the editor does, and keeps a colour that is', () => {
    const p = themed();
    const ab = p.artboards[0].id;
    const out = change(p, [
      { op: 'add_layer', artboard_id: ab, type: 'button', ref: 'b' },
      { op: 'add_layer', artboard_id: ab, type: 'text', ref: 't', props: { text: 'Hi', color: '#ff0000' } },
    ]);
    const b = find(out.project, out.created.b);
    expect(b.fill.color).toBe(`token:${tokenId(p, 'color/button')}`);
    expect(b.color).toBe(`token:${tokenId(p, 'color/on-button')}`);
    expect(find(out.project, out.created.t).color).toBe('#ff0000');
    // a project with no tokens keeps the plain defaults
    const plain = createProject('Plain');
    const o2 = change(plain, [{ op: 'add_layer', artboard_id: plain.artboards[0].id, type: 'button', ref: 'b' }]);
    expect(find(o2.project, o2.created.b).fill.color).not.toMatch(/^token:/);
  });

  it('reports a colour that follows a token the project lacks', () => {
    const p = themed();
    p.artboards[0].children.push(createNode('rect', { id: 'r1', name: 'Box', fill: { type: 'solid', color: 'token:tkgone' } } as never));
    expect(mcp.validate(p).join('\n')).toContain('a colour follows a token that does not exist (token:tkgone)');
  });

  it('manages themes, colourways and tokens: values by theme name, the default, follow, and removal', () => {
    const p = createProject('New');
    const out = change(p, [
      { op: 'add_theme', name: 'Light' },
      { op: 'add_colourway', colourway: 'purple' },
      { op: 'add_token', name: 'color/accent', values: { Light: '#111111', Purple: '#222222' }, ref: 'acc' },
      { op: 'set_themes', default: 'Purple', follow: false },
    ]);
    const t = out.project.themes!;
    // the first theme brings the starter themes and tokens with it
    expect(t.list.map((x) => x.name)).toEqual(['Light', 'Dark', 'High contrast', 'Light', 'Purple']);
    expect(t.tokens.some((x) => x.name === 'color/primary')).toBe(true);
    expect(t.tokens.some((x) => x.name.startsWith('brand/'))).toBe(true);
    expect(t.default).toBe('theme-purple');
    expect(t.follow).toBe(false);
    const acc = t.tokens.find((x) => x.id === out.created.acc)!;
    expect(acc.values['theme-purple']).toBe('#222222');
    const o2 = change(out.project, [{ op: 'set_token', id: 'color/accent', name: 'color/highlight', value: '#333333' }, { op: 'remove_token', id: 'color/primary' }]);
    const hl = o2.project.themes!.tokens.find((x) => x.name === 'color/highlight')!;
    expect(Object.values(hl.values).every((v) => v === '#333333')).toBe(true);
    expect(o2.project.themes!.tokens.some((x) => x.name === 'color/primary')).toBe(false);
    expect(() => change(out.project, [{ op: 'add_colourway', colourway: 'plaid' }])).toThrow(/no colourway plaid/);
    expect(() => change(out.project, [{ op: 'set_themes', default: 'Nope' }])).toThrow(/no theme Nope/);
  });
});

describe('building in bulk', () => {
  it('adds a whole tree in one op, with refs for the children', () => {
    const p = themed();
    const out = change(p, [
      { op: 'add_layer', artboard_id: p.artboards[0].id, type: 'frame', ref: 'card', props: { name: 'Card', width: 200, height: 100 }, children: [{ type: 'text', ref: 'title', props: { text: 'Title' } }, { type: 'group', children: [{ type: 'rect', ref: 'dot' }] }] },
    ]);
    const card = find(out.project, out.created.card);
    expect(card.children.map((c: SceneNode) => c.type)).toEqual(['text', 'group']);
    expect(find(out.project, out.created.dot).type).toBe('rect');
    expect(out.created.title).toBe(card.children[0].id);
    expect(() => change(p, [{ op: 'add_layer', artboard_id: p.artboards[0].id, type: 'rect', children: [{ type: 'rect' }] }])).toThrow(/can't hold children/);
  });

  it('duplicates a layer into a grid with fresh ids and numbered names', () => {
    const p = createProject('Grid');
    p.artboards[0].children.push(createNode('group', { id: 'g', name: 'Zone 1', x: 10, y: 20, children: [createNode('rect', { id: 'gr', name: 'Bg' })] } as never));
    const out = change(p, [{ op: 'duplicate', id: 'g', count: 5, dx: 100, dy: 50, columns: 3, name: 'Zone {n}', ref: 'z' }]);
    const list = out.project.artboards[0].children;
    expect(list.map((n) => n.name)).toEqual(['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6']);
    expect(list.map((n) => [n.x, n.y])).toEqual([[10, 20], [110, 20], [210, 20], [10, 70], [110, 70], [210, 70]]);
    const ids = new Set<string>();
    walk(list, (n) => ids.add(n.id));
    expect(ids.size).toBe(12);
    expect(find(out.project, out.created.z3).name).toBe('Zone 4');
  });

  it('sets the same props on several layers with ids', () => {
    const p = createProject('Many');
    p.artboards[0].children.push(createNode('rect', { id: 'a' }), createNode('rect', { id: 'b' }));
    const out = change(p, [{ op: 'set_props', ids: ['a', 'b'], props: { opacity: 0.5 } }]);
    expect(find(out.project, 'a').opacity).toBe(0.5);
    expect(find(out.project, 'b').opacity).toBe(0.5);
  });
});

describe('interaction nodes', () => {
  const graph = () => {
    const p = createProject('Logic');
    p.artboards[0].children.push(createNode('button', { id: 'go', name: 'Go' }));
    return change(p, [
      { op: 'add_variable', name: 'program', type: 'string', initial: '' },
      { op: 'add_script', name: 'Pathway', code: '' },
      {
        op: 'add_interactions',
        artboard_id: p.artboards[0].id,
        nodes: [
          { ref: 'on', kind: 'event.pointer', params: { target: 'Go' } },
          { ref: 'set', kind: 'action.setVariable', params: { variable: 'program', value: '"MSc"' } },
          { ref: 'run', kind: 'action.script', params: { script: 'Pathway' } },
        ],
        edges: [{ from: 'on', to: 'set' }],
      },
    ]);
  };

  it('takes names for the layer, variable and script a node points at, and stores their ids', () => {
    const out = graph();
    const nodes = out.project.artboards[0].logic.nodes;
    expect(nodes[0].params.target).toBe('go');
    expect(nodes[1].params.variable).toBe(out.project.variables[0].id);
    expect(nodes[2].params.script).toBe(out.project.scripts[0].id);
    expect(mcp.validate(out.project).filter((x) => /missing/.test(x))).toEqual([]);
  });

  it('refuses a name two layers share', () => {
    const p = createProject('Twins');
    p.artboards[0].children.push(createNode('rect', { id: 'a', name: 'Card' }), createNode('rect', { id: 'b', name: 'Card' }));
    expect(() => change(p, [{ op: 'add_interactions', artboard_id: p.artboards[0].id, nodes: [{ kind: 'event.pointer', params: { target: 'Card' } }] }])).toThrow(/2 layers are called "Card"/);
  });

  it('changes a node in place, keeping its connections, and connects and disconnects', () => {
    const out = graph();
    const ab = out.project.artboards[0];
    const [on, set, run] = ab.logic.nodes;
    const o2 = change(out.project, [
      { op: 'set_interaction', artboard_id: ab.id, id: set.id, params: { value: '"BSc"' }, note: 'Sets the program' },
      { op: 'connect', artboard_id: ab.id, from: set.id, to: run.id },
    ]);
    const ab2 = o2.project.artboards[0];
    const set2 = ab2.logic.nodes.find((n) => n.id === set.id)!;
    expect(set2.params.value).toBe('"BSc"');
    expect(set2.params.variable).toBe(set.params.variable);
    expect(set2.note).toBe('Sets the program');
    expect(ab2.logic.edges.map((e) => [e.from, e.to])).toEqual([[on.id, set.id], [set.id, run.id]]);
    const o3 = change(o2.project, [{ op: 'disconnect', artboard_id: ab.id, from: on.id, to: set.id }]);
    expect(o3.project.artboards[0].logic.edges.map((e) => [e.from, e.to])).toEqual([[set.id, run.id]]);
    expect(() => change(o3.project, [{ op: 'disconnect', artboard_id: ab.id, from: on.id, to: set.id }])).toThrow(/no such connection/);
  });
});

describe('data sources, assets, text styles and settings', () => {
  it('adds a data source from an address or an uploaded file, and refuses a name in use', () => {
    const p = createProject('Data');
    const out = change(p, [
      { op: 'add_asset', id: 'as1', name: 'courses.json', mime: 'application/json', size: 10 },
      { op: 'add_data_source', name: 'handbook', kind: 'json', asset_id: 'as1', ref: 'h' },
      { op: 'add_data_source', name: 'live', kind: 'csv', url: 'https://example.org/x.csv', refresh: 60 },
    ]);
    expect(out.project.dataSources).toMatchObject([
      { name: 'handbook', kind: 'json', source: 'asset', assetId: 'as1' },
      { name: 'live', kind: 'csv', source: 'url', url: 'https://example.org/x.csv', refresh: 60 },
    ]);
    expect(() => change(out.project, [{ op: 'add_data_source', name: 'handbook', url: 'https://x' }])).toThrow(/already called handbook/);
    expect(() => change(out.project, [{ op: 'add_data_source', name: 'nofile' }])).toThrow(/give url, text or the asset_id/);
    const o2 = change(out.project, [{ op: 'set_data_source', id: 'live', name: 'feed' }, { op: 'remove_data_source', id: 'handbook' }]);
    expect(o2.project.dataSources.map((d) => d.name)).toEqual(['feed']);
  });

  it('makes text styles a layer follows by name, and restyles it when the style changes', () => {
    const p = createProject('Type');
    const ab = p.artboards[0].id;
    const out = change(p, [
      { op: 'add_text_style', name: 'H1', props: { fontFamily: 'Open Sans', fontSize: 32, fontWeight: 700 } },
      { op: 'add_layer', artboard_id: ab, type: 'text', ref: 't', props: { text: 'Heading', styleRefs: { text: 'H1' } } },
    ]);
    const style = out.project.styles!.texts[0];
    expect(style.fontFamily).toBe('"Open Sans", system-ui, sans-serif');
    const t = find(out.project, out.created.t);
    expect(t.styleRefs.text).toBe(style.id);
    expect(t.fontSize).toBe(32);
    expect(t.fontWeight).toBe(700);
    const o2 = change(out.project, [{ op: 'set_text_style', id: 'H1', props: { fontSize: 40 } }]);
    expect(find(o2.project, out.created.t).fontSize).toBe(40);
  });

  it('sets project settings by path, and never through __proto__', () => {
    const p = createProject('Settings');
    const out = change(p, [{ op: 'set_project_settings', name: 'Renamed', props: { 'reporting.passMark': 50, '__proto__.polluted': 1, 'constructor.prototype.x': 1 } }]);
    expect((out.project.settings as any).reporting.passMark).toBe(50);
    expect(out.project.name).toBe('Renamed');
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).x).toBeUndefined();
  });
});

describe('overview and validate', () => {
  it('cuts long variable values short', () => {
    const p = createProject('Long');
    p.variables.push({ id: 'v1', name: 'courseData', type: 'list', initial: JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ code: `SCI${i}` }))) } as never);
    const line = mcp.overview(p, {}).split('\n').find((l) => l.includes('courseData'))!;
    expect(line.length).toBeLessThan(220);
    expect(line).toContain('see get_variables');
  });

  it('flags a layer far outside its artboard', () => {
    const p = createProject('Stray');
    const ab = p.artboards[0];
    ab.children.push(createNode('frame', { id: 'stray', name: 'Frame', x: -19416, y: 8951, width: 7, height: 28 } as never), createNode('rect', { id: 'near', name: 'Peek', x: -50, y: 10 }));
    const problems = mcp.validate(p).join('\n');
    expect(problems).toContain('"Frame" (stray) is');
    expect(problems).not.toContain('Peek');
  });
});

describe('reference', () => {
  it('lists the interaction nodes briefly, and gives one or a category in full', () => {
    const index = mcp.reference('interactions');
    expect(index.length).toBeLessThan(20000);
    expect(index).toContain('- event.drop:');
    const one = mcp.reference('interactions', { node: 'event.drop' });
    expect(one).toMatch(/^### event\.drop/);
    expect(one.split('### ').length).toBe(2);
    expect(mcp.reference('interactions', { category: 'event' })).toContain('### event.pointer');
    expect(mcp.reference('interactions', { node: 'nope' })).toContain('No node nope');
    expect(mcp.reference('interactions-all').length).toBeGreaterThan(index.length);
  });

  it('has the colours and runtime pages', () => {
    expect(mcp.reference('colours')).toContain('token:<name>');
    expect(mcp.reference('colours')).toContain('color/surface-muted');
    expect(mcp.reference('runtime')).toContain('ix.drag.reset');
  });
});
