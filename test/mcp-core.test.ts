// @vitest-environment node
//The MCP server's brain without any network: reading a project (overview, interactions, validate), applying an
//agent's high-level changes, the reference text it hands out, and the JSON-RPC handler around its tools.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOG } from '../../interactives-player/src/catalog';
import { ANIMATABLE_PROPS } from '../../interactives-player/src/animation';
import { createNode } from '../../interactives-player/src/defaults';
import { createProject, type Project, type SceneNode } from '../../interactives-player/src/format';
import { TOPICS } from '../src/help/topics';

type Server = typeof import('../mcp/server');
let mcp: Server;
beforeAll(async () => {
  process.env.INTERACTIVES_MCP_NO_STDIO = '1';
  mcp = await import('../mcp/server');
});

const sample = (): Project => {
  const p = createProject('Sample');
  const ab = p.artboards[0];
  ab.children.push(
    createNode('rect', { id: 'r1', name: 'Box', x: 10.46, y: 20, width: 100, height: 50 }),
    createNode('text', { id: 't1', name: 'Title', text: 'Hello world, this is a very long title that should be cut at forty characters' }),
    createNode('group', { id: 'g1', name: 'Group', children: [createNode('button', { id: 'b1', name: 'Go', label: 'Go!' }), createNode('rect', { id: 'r2', name: 'Inner', locked: true, visible: false })] }),
  );
  return p;
};

const change = (p: Project, changes: Record<string, unknown>[]) => mcp.applyChanges(p, changes as never);
const find = (p: Project, id: string) => mcp.locate(p, id)?.node as any;

describe('locate', () => {
  it('finds a layer at any depth with its artboard and parent', () => {
    const p = sample();
    const hit = mcp.locate(p, 'b1')!;
    expect(hit.node.name).toBe('Go');
    expect(hit.parent!.id).toBe('g1');
    expect(hit.ab.id).toBe(p.artboards[0].id);
    expect(mcp.locate(p, 'r1')!.parent).toBeNull();
    expect(mcp.locate(p, 'nope')).toBeNull();
  });
});

describe('overview', () => {
  it('lists artboards, layers top-most first with type, id, rounded position and notes', () => {
    const text = mcp.overview(sample(), {});
    expect(text).toMatch(/^# Sample \(/);
    expect(text).toContain('Start artboard: ');
    const lines = text.split('\n');
    const at = (needle: string) => lines.findIndex((l) => l.includes(needle));
    //top-most (last in the list) is first
    expect(at('- Group [group g1]')).toBeLessThan(at('- Title [text t1]'));
    expect(at('- Title [text t1]')).toBeLessThan(at('- Box [rect r1]'));
    expect(text).toContain('- Box [rect r1] @10.5,20 100x50');
    expect(text).toContain('"Hello world, this is a very long title t"');
    expect(text).not.toContain('should be cut');
  });

  it('shows the children of a group one level deeper with their button label, hidden and locked flags', () => {
    const text = mcp.overview(sample(), { depth: 5 });
    expect(text).toMatch(/\n {2}- Go \[button b1\].* "Go!"/);
    expect(text).toMatch(/\n {2}- Inner \[rect r2\].* hidden locked/);
  });

  it('says how many children it left out at the depth limit', () => {
    const text = mcp.overview(sample(), { depth: 1 });
    expect(text).toContain('… 2 children (use get_layers or a deeper depth)');
    expect(text).not.toContain('[button b1]');
  });

  it('can show one artboard (by id) and skips the others', () => {
    const p = sample();
    const second = change(p, [{ op: 'add_artboard', name: 'Second', ref: 'two' }]);
    const text = mcp.overview(second.project, { artboardId: second.created.two });
    expect(text).toContain('## Artboard Second');
    expect(text).not.toContain('## Artboard Artboard 1');
  });

  it('lists timelines, variables, data sources, scripts and assets when there are some', () => {
    const p = sample();
    p.variables.push({ id: 'v1', name: 'score', type: 'enum', initial: 'a', options: ['a', 'b'], shared: true });
    p.scripts.push({ id: 's1', name: 'Boot', code: 'a\nb', runOnStart: true } as never);
    p.assets.push({ id: 'as1', name: 'logo', mime: 'image/png' } as never);
    p.dataSources.push({ id: 'd1', name: 'Rows', kind: 'csv', source: 'url', url: 'https://x.test/a.csv' } as never);
    p.artboards[0].timelines.push({ id: 'tl1', name: 'Intro', duration: 500, loop: 'once', autoplay: true, speed: 1, tracks: [] });
    const text = mcp.overview(p, {});
    expect(text).toContain('Timelines: Intro [tl1] 500ms once autoplay (0 tracks)');
    expect(text).toContain('- score [v1] enum = "a" shared options=a|b');
    expect(text).toContain('- Rows [d1] csv from https://x.test/a.csv');
    expect(text).toContain('- Boot [s1] runs on start (2 lines)');
    expect(text).toContain('- logo [as1] image/png');
  });

  it('stops listing after the limit instead of printing a huge project', () => {
    const p = sample();
    for (let i = 0; i < 200; i++) p.artboards[0].children.push(createNode('rect', { name: `N${i}` }));
    const lines = mcp.overview(p, {}).split('\n').filter((l) => l.startsWith('- '));
    expect(lines.length).toBe(80);
  });
});

describe('interactions', () => {
  it('prints each node with its label, settings (layer names resolved), connections, ports and notes', () => {
    const p = sample();
    const r = change(p, [
      {
        op: 'add_interactions',
        artboard_id: p.artboards[0].id,
        nodes: [
          { ref: 'click', kind: 'event.pointer', params: { target: 'r1', event: 'click' } },
          { ref: 'hide', kind: 'action.visibility', params: { target: 'r1' }, note: 'hide it' },
        ],
        edges: [{ from: 'click', to: 'hide' }],
      },
    ]);
    const text = mcp.interactions(r.project, p.artboards[0].id);
    expect(text).toContain(`Interactions on ${p.artboards[0].name}`);
    expect(text).toMatch(/- .* \[event\.pointer lg\w+\] .*target=Box\(r1\)/);
    expect(text).toMatch(/→ lg\w+/);
    expect(text).toContain('// hide it');
  });

  it('finds the artboard by name and refuses one that is not there', () => {
    const p = sample();
    expect(() => mcp.interactions(p, p.artboards[0].name)).not.toThrow();
    expect(() => mcp.interactions(p, 'ghost')).toThrow('No such artboard');
  });
});

describe('validate', () => {
  const abId = (p: Project) => p.artboards[0].id;

  it('is quiet for a sound project', () => {
    expect(mcp.validate(sample())).toEqual([]);
  });

  it('flags a timeline track on a layer that is gone', () => {
    const p = sample();
    p.artboards[0].timelines.push({ id: 'tl', name: 'T', duration: 1, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'k', nodeId: 'ghost', prop: 'x', keys: [] }] } as never);
    expect(mcp.validate(p)[0]).toMatch(/timeline "T" animates a layer that is gone \(ghost, x\)/);
  });

  it('flags nodes that point at missing layers, timelines, blends and variables, and unknown kinds', () => {
    const p = sample();
    const { project } = change(p, [
      {
        op: 'add_interactions',
        artboard_id: abId(p),
        nodes: [
          { kind: 'event.start' },
          { kind: 'action.visibility', params: { target: 'ghost' } },
          { kind: 'action.timeline', params: { timeline: 'ghost-tl' } },
          { kind: 'action.setVariable', params: { variable: 'ghost-v', value: '1' } },
        ],
      },
    ]);
    project.artboards[0].logic.nodes.push({ id: 'weird', kind: 'bogus.kind', x: 0, y: 0, params: {} } as never);
    const problems = mcp.validate(project).join('\n');
    expect(problems).toMatch(/points at a missing layer ghost/);
    expect(problems).toMatch(/points at a missing timeline ghost-tl/);
    expect(problems).toMatch(/points at a missing variable ghost-v/);
    expect(problems).toMatch(/unknown interaction node kind bogus.kind \(weird\)/);
    expect(problems).toMatch(/"On start" \(lg\w+\) is not connected to anything/);
  });

  it('flags expressions that do not parse, with the expression in the message', () => {
    const p = sample();
    const { project } = change(p, [{ op: 'add_interactions', artboard_id: abId(p), nodes: [{ kind: 'logic.if', params: { condition: 'a +* b' } }] }]);
    expect(mcp.validate(project).join('\n')).toContain('`a +* b`');
  });

  it('flags a connection to a node that is not there', () => {
    const p = sample();
    p.artboards[0].logic.edges.push({ id: 'e1', from: 'x', fromPort: 'out', to: 'y', toPort: 'in' } as never);
    expect(mcp.validate(p)[0]).toMatch(/a connection points at a missing node \(e1\)/);
  });
});

describe('applyChanges', () => {
  it('never changes the document it was given, and a failing change leaves it as it was', () => {
    const p = sample();
    const before = JSON.stringify(p);
    change(p, [{ op: 'set_props', id: 'r1', props: { x: 999 } }]);
    expect(JSON.stringify(p)).toBe(before);
    expect(() => change(p, [{ op: 'set_props', id: 'r1', props: { x: 1 } }, { op: 'delete', id: 'ghost' }])).toThrow(/change 2 \(delete\): no layer ghost/);
    expect(JSON.stringify(p)).toBe(before);
  });

  describe('set_props', () => {
    it('sets plain and dotted paths, creating the objects on the way', () => {
      const r = change(sample(), [{ op: 'set_props', id: 'r1', props: { x: 5, 'fill.color': '#ff0000', 'shadow.blur': 4 } }]);
      const n = find(r.project, 'r1');
      expect(n.x).toBe(5);
      expect(n.fill.color).toBe('#ff0000');
      expect(r.touched).toEqual(['r1']);
    });

    it('refuses to change a layer\'s id, type or children', () => {
      const r = change(sample(), [{ op: 'set_props', id: 'g1', props: { id: 'hacked', type: 'rect', children: [], name: 'ok' } }]);
      const g = find(r.project, 'g1');
      expect(g.id).toBe('g1');
      expect(g.type).toBe('group');
      expect(g.children).toHaveLength(2);
      expect(g.name).toBe('ok');
    });

    it('cannot be used to pollute prototypes', () => {
      change(sample(), [{ op: 'set_props', id: 'r1', props: { '__proto__.polluted': 1, 'constructor.prototype.polluted': 1 } }]);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('puts a wrong-typed value right before the layer is stored', () => {
      const r = change(sample(), [{ op: 'set_props', id: 'r1', props: { x: 'not a number', opacity: { nope: true }, visible: 'yes' } }]);
      const n = find(r.project, 'r1');
      expect(typeof n.x).toBe('number');
      expect(typeof n.opacity).toBe('number');
      expect(typeof n.visible).toBe('boolean');
    });

    it('keeps text and runs in step: runs win, plain text replaces runs', () => {
      const p = sample();
      const withRuns = change(p, [{ op: 'set_props', id: 't1', props: { runs: [{ text: 'Hel', fontWeight: 700 }, { text: 'lo' }] } }]).project;
      expect(find(withRuns, 't1').text).toBe('Hello');
      expect(find(withRuns, 't1').runs).toHaveLength(2);
      const plain = change(withRuns, [{ op: 'set_props', id: 't1', props: { text: 'Bye' } }]).project;
      expect(find(plain, 't1').text).toBe('Bye');
      expect(find(plain, 't1').runs).toBeUndefined();
      const cleared = change(withRuns, [{ op: 'set_props', id: 't1', props: { runs: null } }]).project;
      expect(find(cleared, 't1').runs).toBeUndefined();
    });

    it('ignores run entries that are not runs', () => {
      const r = change(sample(), [{ op: 'set_props', id: 't1', props: { runs: [null, 5, { nope: 1 }, { text: 'ok' }] } }]);
      expect(find(r.project, 't1').text).toBe('ok');
    });

    it('can use a $ref made earlier in the same batch', () => {
      const p = sample();
      const r = change(p, [
        { op: 'add_layer', artboard_id: p.artboards[0].id, type: 'rect', ref: 'new' },
        { op: 'set_props', id: '$new', props: { name: 'Made' } },
      ]);
      expect(find(r.project, r.created.new).name).toBe('Made');
    });
  });

  describe('add_layer', () => {
    const ab = (p: Project) => p.artboards[0].id;

    it('adds on top by default, with the given props, and reports the id under its ref', () => {
      const p = sample();
      const r = change(p, [{ op: 'add_layer', artboard_id: ab(p), type: 'ellipse', props: { name: 'Dot', width: 9 }, ref: 'dot' }]);
      const kids = r.project.artboards[0].children;
      expect(kids[kids.length - 1].name).toBe('Dot');
      expect((kids[kids.length - 1] as any).width).toBe(9);
      expect(r.created.dot).toBe(kids[kids.length - 1].id);
      expect(r.touched).toEqual([r.created.dot]);
    });

    it('takes an artboard by name, an index (clamped) and a parent group', () => {
      const p = sample();
      const r = change(p, [
        { op: 'add_layer', artboard_id: p.artboards[0].name, type: 'rect', props: { name: 'First' }, index: -5 },
        { op: 'add_layer', artboard_id: ab(p), type: 'rect', props: { name: 'In' }, parent_id: 'g1', index: 99 },
      ]);
      expect(r.project.artboards[0].children[0].name).toBe('First');
      const g = find(r.project, 'g1');
      expect(g.children[g.children.length - 1].name).toBe('In');
    });

    it('refuses a parent that is not a group or frame, an unknown artboard and an unknown type', () => {
      const p = sample();
      expect(() => change(p, [{ op: 'add_layer', artboard_id: ab(p), type: 'rect', parent_id: 'r1' }])).toThrow(/not a group or frame/);
      expect(() => change(p, [{ op: 'add_layer', artboard_id: 'ghost', type: 'rect' }])).toThrow(/No artboard ghost/);
      expect(() => change(p, [{ op: 'add_layer', artboard_id: ab(p), type: 'hexagon9' }])).toThrow();
    });

    it('cleans a wrong-typed prop on the way in', () => {
      const p = sample();
      const r = change(p, [{ op: 'add_layer', artboard_id: ab(p), type: 'rect', props: { x: 'wide' }, ref: 'a' }]);
      expect(typeof find(r.project, r.created.a).x).toBe('number');
    });
  });

  describe('delete and move', () => {
    it('deletes a layer wherever it is', () => {
      const r = change(sample(), [{ op: 'delete', id: 'b1' }, { op: 'delete', id: 'r1' }]);
      expect(mcp.locate(r.project, 'b1')).toBeNull();
      expect(mcp.locate(r.project, 'r1')).toBeNull();
      expect(find(r.project, 'g1').children.map((c: SceneNode) => c.id)).toEqual(['r2']);
    });

    it('moves a layer into a group at an index, to another artboard, and back to the top level', () => {
      const p = sample();
      const two = change(p, [{ op: 'add_artboard', name: 'Two', ref: 'ab2' }]);
      const r = change(two.project, [
        { op: 'move', id: 'r1', parent_id: 'g1', index: 0 },
        { op: 'move', id: 't1', artboard_id: two.created.ab2 },
        { op: 'move', id: 'b1', artboard_id: p.artboards[0].id },
      ]);
      expect(find(r.project, 'g1').children[0].id).toBe('r1');
      expect(r.project.artboards[1].children.map((c) => c.id)).toEqual(['t1']);
      expect(r.project.artboards[0].children.some((c) => c.id === 'b1')).toBe(true);
      expect(r.touched).toEqual(['r1', 't1', 'b1']);
    });

    it('refuses to move into something that is not a container, and to move what is not there', () => {
      expect(() => change(sample(), [{ op: 'move', id: 'r1', parent_id: 't1' }])).toThrow(/parent is not a group or frame/);
      expect(() => change(sample(), [{ op: 'move', id: 'ghost' }])).toThrow(/no layer ghost/);
    });
  });

  describe('artboards', () => {
    it('adds artboards to the right of the others, with a size', () => {
      const p = sample();
      const r = change(p, [{ op: 'add_artboard', name: 'Wide', width: 1200, height: 300 }, { op: 'add_artboard' }]);
      const [first, wide, plain] = r.project.artboards;
      expect(wide.canvasX).toBe(first.canvasX + first.width + 100);
      expect([wide.width, wide.height]).toEqual([1200, 300]);
      expect(plain.canvasX).toBe(wide.canvasX + 1200 + 100);
      expect([plain.name, plain.width]).toEqual(['Artboard', 800]);
    });

    it('sets artboard props but never its id, children, timelines or logic', () => {
      const p = sample();
      const r = change(p, [{ op: 'set_artboard', id: p.artboards[0].name, props: { name: 'Renamed', width: 321, id: 'x', children: [], timelines: [1], logic: {} } }]);
      const a = r.project.artboards[0];
      expect([a.name, a.width, a.id]).toEqual(['Renamed', 321, p.artboards[0].id]);
      expect(a.children).toHaveLength(3);
      expect(Array.isArray(a.timelines)).toBe(true);
      expect(a.logic.nodes).toEqual([]);
    });
  });

  describe('variables', () => {
    it('adds typed variables with options and shared, and refuses a name that exists', () => {
      const r = change(sample(), [
        { op: 'add_variable', name: 'mode', type: 'enum', initial: 'a', options: ['a', 2], shared: true, ref: 'v' },
        { op: 'add_variable', name: 'count' },
      ]);
      expect(r.project.variables.find((v) => v.name === 'mode')).toMatchObject({ type: 'enum', initial: 'a', options: ['a', '2'], shared: true, id: r.created.v });
      expect(r.project.variables.find((v) => v.name === 'count')).toMatchObject({ type: 'number', initial: 0 });
      expect(() => change(r.project, [{ op: 'add_variable', name: 'mode' }])).toThrow(/already exists/);
    });

    it('changes a variable by id or name without changing its id', () => {
      const first = change(sample(), [{ op: 'add_variable', name: 'n', initial: 1, ref: 'v' }]);
      const r = change(first.project, [{ op: 'set_variable', id: 'n', props: { initial: 7, id: 'zzz' } }]);
      expect(r.project.variables[0]).toMatchObject({ initial: 7, id: first.created.v });
      expect(() => change(first.project, [{ op: 'set_variable', id: 'ghost', props: {} }])).toThrow(/no variable ghost/);
    });

    it('renames a variable and what reads it, by rename_variable or a name in set_variable', () => {
      const first = change(sample(), [{ op: 'add_variable', name: 'n', initial: 1, persist: true, ref: 'v' }, { op: 'add_variable', name: 'twice', formula: 'n * 2' }]);
      const r = change(first.project, [{ op: 'rename_variable', id: 'n', name: 'count' }]);
      expect(r.project.variables.map((v) => v.name)).toEqual(['count', 'twice']);
      expect(r.project.variables[1].formula).toBe('count * 2');
      const again = change(r.project, [{ op: 'set_variable', id: 'count', props: { name: 'total' } }]);
      expect(again.project.variables[1].formula).toBe('total * 2');
      expect(() => change(r.project, [{ op: 'rename_variable', id: 'count', name: 'twice' }])).toThrow(/already called twice/);
      expect(() => change(r.project, [{ op: 'rename_variable', id: 'count', name: '9x' }])).toThrow(/not a variable name/);
    });
  });

  describe('timelines', () => {
    it('adds a timeline whose tracks may point at $refs, with default easing', () => {
      const p = sample();
      const abId = p.artboards[0].id;
      const r = change(p, [
        { op: 'add_layer', artboard_id: abId, type: 'rect', ref: 'box' },
        { op: 'add_timeline', artboard_id: abId, name: 'Slide', duration: 800, loop: 'pingpong', autoplay: true, ref: 'tl', tracks: [{ node_id: '$box', prop: 'x', keys: [{ t: 0, value: 0 }, { t: 800, value: 300, ease: 'linear' }] }] },
      ]);
      const tl = r.project.artboards[0].timelines[0];
      expect(tl).toMatchObject({ name: 'Slide', duration: 800, loop: 'pingpong', autoplay: true, id: r.created.tl });
      expect(tl.tracks[0].nodeId).toBe(r.created.box);
      expect(tl.tracks[0].keys.map((k) => [k.t, k.value, k.ease])).toEqual([[0, 0, 'easeInOut'], [800, 300, 'linear']]);
      expect(mcp.validate(r.project)).toEqual([]);
    });

    it('names a timeline and defaults it when no details are given', () => {
      const p = sample();
      const tl = change(p, [{ op: 'add_timeline', artboard_id: p.artboards[0].id }]).project.artboards[0].timelines[0];
      expect([tl.name, tl.duration, tl.loop, tl.autoplay]).toEqual(['Timeline 1', 1000, 'once', false]);
    });
  });

  describe('interactions', () => {
    it('adds nodes with catalog defaults filled in, lays them out, and connects them by ref or id', () => {
      const p = sample();
      const abId = p.artboards[0].id;
      const r = change(p, [
        {
          op: 'add_interactions',
          artboard_id: abId,
          nodes: [
            { ref: 'a', kind: 'event.start' },
            { ref: 'b', kind: 'action.log', params: { message: 'hi' } },
          ],
          edges: [{ from: 'a', to: 'b' }],
        },
      ]);
      const { nodes, edges } = r.project.artboards[0].logic;
      expect(nodes).toHaveLength(2);
      expect(nodes[1].x - nodes[0].x).toBe(260);
      expect(nodes[1].params.message).toBe('hi');
      expect(edges).toEqual([{ id: expect.any(String), from: r.created.a, fromPort: 'out', to: r.created.b, toPort: 'in' }]);
      //defaults for every param that has one
      const def = CATALOG.find((d) => d.kind === 'action.log')!;
      for (const pd of def.params) if (pd.default !== undefined && pd.key !== 'message') expect(nodes[1].params[pd.key]).toEqual(pd.default);
    });

    it('lets a later batch connect to ids made earlier, using a named output port', () => {
      const p = sample();
      const abId = p.artboards[0].id;
      const first = change(p, [{ op: 'add_interactions', artboard_id: abId, nodes: [{ ref: 'if', kind: 'logic.if', params: { condition: 'true' } }, { ref: 'log', kind: 'action.log' }] }]);
      const second = change(first.project, [{ op: 'add_interactions', artboard_id: abId, nodes: [], edges: [{ from: first.created.if, to: first.created.log, from_port: 'false' }] }]);
      expect(second.project.artboards[0].logic.edges[0]).toMatchObject({ from: first.created.if, fromPort: 'false', to: first.created.log });
    });

    it('refuses an unknown node kind and points at the reference', () => {
      const p = sample();
      expect(() => change(p, [{ op: 'add_interactions', artboard_id: p.artboards[0].id, nodes: [{ kind: 'event.nope' }] }])).toThrow(/unknown node kind event.nope \(see read_reference "interactions"\)/);
    });

    it('removes nodes and every connection that touches them', () => {
      const p = sample();
      const abId = p.artboards[0].id;
      const made = change(p, [{ op: 'add_interactions', artboard_id: abId, nodes: [{ ref: 'a', kind: 'event.start' }, { ref: 'b', kind: 'action.log' }, { ref: 'c', kind: 'action.log' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }] }]);
      const r = change(made.project, [{ op: 'remove_interactions', artboard_id: abId, ids: [made.created.b] }]);
      expect(r.project.artboards[0].logic.nodes.map((n) => n.id).sort()).toEqual([made.created.a, made.created.c].sort());
      expect(r.project.artboards[0].logic.edges).toEqual([]);
    });
  });

  describe('scripts', () => {
    it('adds a script and edits it by id or name', () => {
      const first = change(sample(), [{ op: 'add_script', name: 'Boot', code: 'ix.log(1)', run_on_start: true, ref: 's' }]);
      expect(first.project.scripts[0]).toMatchObject({ name: 'Boot', code: 'ix.log(1)', runOnStart: true, id: first.created.s });
      const r = change(first.project, [{ op: 'set_script', id: 'Boot', code: 'ix.log(2)', name: 'Start', run_on_start: false }]);
      expect(r.project.scripts[0]).toMatchObject({ name: 'Start', code: 'ix.log(2)', runOnStart: false });
      expect(() => change(first.project, [{ op: 'set_script', id: 'ghost' }])).toThrow(/no script ghost/);
    });

    it('ignores fields of the wrong type when setting a script', () => {
      const first = change(sample(), [{ op: 'add_script', name: 'Boot', code: 'x' }]);
      const r = change(first.project, [{ op: 'set_script', id: first.project.scripts[0].id, code: 5, name: null, run_on_start: 'yes' }]);
      expect(r.project.scripts[0]).toMatchObject({ name: 'Boot', code: 'x' });
    });
  });

  it('names the failing change and op for an unknown op', () => {
    expect(() => change(sample(), [{ op: 'frobnicate' }])).toThrow('change 1 (frobnicate): unknown op "frobnicate"');
  });
});

describe('data layers by agents', () => {
  it('adds a progress layer and a chart, repairs wrong values, and sets their own settings', () => {
    const p = sample();
    const ab = p.artboards[0].id;
    const { project } = change(p, [
      { op: 'add_layer', artboard_id: ab, type: 'progress', ref: 'bar', props: { value: 'lots', max: 20, semantics: 'loud' } },
      { op: 'add_layer', artboard_id: ab, type: 'chart', ref: 'chart', props: { kind: 'radar', data: '[1, 2]', colors: ['#fff', 3] } },
    ]);
    const kids = project.artboards[0].children;
    const bar = kids.find((n) => n.type === 'progress') as { value: number; max: number; semantics: string; id: string };
    const chart = kids.find((n) => n.type === 'chart') as { kind: string; colors: string[]; id: string };
    expect([bar.value, bar.max, bar.semantics]).toEqual([40, 20, 'progressbar']);
    expect([chart.kind, chart.colors]).toEqual(['column', ['#fff']]);
    const next = change(project, [{ op: 'set_props', id: bar.id, props: { value: 15, 'barFill.color': '#00ff00' } }]).project;
    const bar2 = next.artboards[0].children.find((n) => n.id === bar.id) as { value: number; barFill: { color: string } };
    expect([bar2.value, bar2.barFill.color]).toEqual([15, '#00ff00']);
    expect(mcp.overview(next, {})).toContain('progress 15/20');
  });
});

describe('connectors by agents', () => {
  it('adds two layers and a connector between them, repairs wrong values, and shows it in the outline', () => {
    const p = sample();
    const ab = p.artboards[0].id;
    const { project } = change(p, [
      { op: 'add_layer', artboard_id: ab, type: 'rect', ref: 'a', props: { x: 0, y: 0, width: 100, height: 60 } },
      { op: 'add_layer', artboard_id: ab, type: 'rect', ref: 'b', props: { x: 300, y: 100, width: 100, height: 60 } },
    ]);
    const [a, b] = project.artboards[0].children.slice(-2);
    const next = change(project, [
      { op: 'add_layer', artboard_id: ab, type: 'connector', ref: 'c', props: { from: { layer: a.id, side: 'right' }, to: { layer: b.id, side: 'sideways' }, route: 'zigzag', endCap: 'arrow', label: 'Yes', labelAt: 4 } },
    ]).project;
    const c = next.artboards[0].children.find((n) => n.type === 'connector') as { route: string; from: { layer: string; side?: string }; to: { layer: string; side?: string }; labelAt: number; endCap: string };
    expect([c.route, c.from.layer, c.from.side, c.to.layer, c.to.side, c.labelAt, c.endCap]).toEqual(['curved', a.id, 'right', b.id, undefined, 1, 'arrow']);
    const text = mcp.overview(next, {});
    expect(text).toContain(`curved connector ${a.id}.right to ${b.id} labelled "Yes"`);
    const again = change(next, [{ op: 'set_props', id: (next.artboards[0].children.find((n) => n.type === 'connector') as { id: string }).id, props: { route: 'elbow', 'to.side': 'left' } }]).project;
    const e = again.artboards[0].children.find((n) => n.type === 'connector') as { route: string; to: { side: string } };
    expect([e.route, e.to.side]).toEqual(['elbow', 'left']);
  });
});

describe('reference', () => {
  it('lists every interaction node kind with its parameters', () => {
    const text = mcp.reference('interactions');
    for (const d of CATALOG) {
      expect(text, d.kind).toContain(`### ${d.kind} — ${d.label}`);
      for (const pd of d.params) expect(text, `${d.kind}.${pd.key}`).toContain(`- ${pd.key} (${pd.type}`);
    }
  });

  it('lists every animatable property', () => {
    const text = mcp.reference('properties');
    for (const a of ANIMATABLE_PROPS) expect(text).toContain(`- ${a.prop} (${a.kind})`);
  });

  it('describes every layer type with its defaults, and the script and shader layers', () => {
    const text = mcp.reference('layers');
    for (const t of ['rect', 'ellipse', 'polygon', 'star', 'path', 'text', 'image', 'group', 'frame', 'button', 'input', 'link', 'embed', 'video', 'instance', 'draw', 'shader', 'progress', 'chart', 'connector', 'bone']) expect(text).toContain(`\n- ${t}: {`);
    expect(text).toContain('Script layers');
    expect(text).toContain('Shader layers');
    expect(text).toContain('Progress bars (type "progress"');
    expect(text).toContain('Charts (type "chart"');
    expect(text).toContain('Connectors (type "connector"');
  });

  it('lists the settings only a progress layer has', () => {
    expect(mcp.reference('properties')).toContain('On a progress layer only: value (number): Progress value; max (number): Progress maximum');
  });

  it('serves any help page by id, and says what topics exist when asked for something else', () => {
    //(the help page called "interactions" is shadowed by the node catalog of the same name, which is the better answer for an agent)
    for (const t of TOPICS.filter((x) => !['interactions', 'properties', 'layers'].includes(x.id))) expect(mcp.reference(t.id), t.id).toContain(`# ${t.title}`);
    for (const bad of ['', 'nonsense']) {
      const text = mcp.reference(bad);
      expect(text).toMatch(/^Topics: interactions, properties, layers/);
      for (const t of TOPICS) expect(text).toContain(t.id);
    }
  });
});

describe('JSON-RPC handler', () => {
  const written: any[] = [];
  const spy = () => vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => (written.push(JSON.parse(String(chunk))), true)) as never);
  afterEach(() => {
    vi.restoreAllMocks();
    written.length = 0;
  });
  const rpc = async (msg: any) => {
    spy();
    await mcp.handle(msg);
    return written.shift();
  };

  it('initialises with the client\'s protocol version, tools capability and instructions', async () => {
    const r = await rpc({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect(r).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'interactives' } } });
    expect(r.result.instructions).toMatch(/list_projects/);
    expect((await rpc({ id: 2, method: 'initialize' })).result.protocolVersion).toBe('2025-06-18');
  });

  it('answers ping, stays silent for notifications and for anything without an id', async () => {
    expect(await rpc({ id: 3, method: 'ping' })).toMatchObject({ id: 3, result: {} });
    expect(await rpc({ method: 'notifications/initialized' })).toBeUndefined();
    expect(await rpc({ id: 4, method: 'notifications/cancelled' })).toBeUndefined();
    expect(await rpc({ method: 'ping' })).toBeUndefined();
  });

  it('lists its tools, each with a schema whose required fields exist', async () => {
    const r = await rpc({ id: 5, method: 'tools/list' });
    const tools = r.result.tools as { name: string; description: string; inputSchema: { type: string; properties: Record<string, unknown>; required: string[] } }[];
    expect(tools.map((t) => t.name)).toEqual(['list_projects', 'join_session', 'get_selection', 'get_overview', 'get_layers', 'get_interactions', 'edit', 'list_notes', 'add_note', 'add_graph_note', 'edit_note', 'remove_note', 'validate', 'read_reference', 'leave_session']);
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length);
    for (const t of tools) {
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.inputSchema.type).toBe('object');
      for (const req of t.inputSchema.required) expect(Object.keys(t.inputSchema.properties), `${t.name}.${req}`).toContain(req);
      expect((t as any).run).toBeUndefined();
    }
  });

  it('runs a tool and wraps its text', async () => {
    const r = await rpc({ id: 6, method: 'tools/call', params: { name: 'read_reference', arguments: { topic: 'properties' } } });
    expect(r.result.content[0].type).toBe('text');
    expect(r.result.content[0].text).toContain('- x (');
    expect(r.result.isError).toBeUndefined();
  });

  it('runs a tool with no arguments at all', async () => {
    const r = await rpc({ id: 7, method: 'tools/call', params: { name: 'read_reference' } });
    expect(r.result.content[0].text).toMatch(/^Topics:/);
  });

  it('reports an unknown tool and an unknown method as JSON-RPC errors', async () => {
    expect((await rpc({ id: 8, method: 'tools/call', params: { name: 'nope' } })).error).toEqual({ code: -32602, message: 'Unknown tool nope' });
    expect((await rpc({ id: 9, method: 'resources/list' })).error).toEqual({ code: -32601, message: 'Method not found: resources/list' });
  });

  it('turns a tool that throws into an isError result rather than a protocol error', async () => {
    const r = await rpc({ id: 10, method: 'tools/call', params: { name: 'leave_session', arguments: {} } });
    expect(r.result.isError).toBeUndefined();
    expect(r.result.content[0].text).toBe('Was not in that session.');
    //a tool that does reach for the network, with nothing there to answer
    const bad = await rpc({ id: 11, method: 'tools/call', params: { name: 'validate', arguments: {} } });
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toMatch(/^Error: /);
  });
});


describe('sticky notes', () => {
  it('add_note puts a note on an artboard or the canvas, set_note changes it, delete_note removes it', () => {
    const p = sample();
    const ab = p.artboards[0];
    const out = change(p, [
      { op: 'add_note', artboard_id: ab.id, x: 40, y: 50, text: 'Swap the photo', colour: 'sky', ref: 'n1' },
      { op: 'add_note', text: 'Whole-project hint', x: -300, y: 0 },
    ]);
    expect(out.project.artboards[0].notes).toHaveLength(1);
    expect(out.project.artboards[0].notes![0]).toMatchObject({ x: 40, y: 50, text: 'Swap the photo', colour: 'sky', author: 'Agent (AI)' });
    expect(out.project.notes![0].text).toBe('Whole-project hint');
    expect(out.created.n1).toBe(out.project.artboards[0].notes![0].id);
    const id = out.created.n1;
    const set = change(out.project, [{ op: 'set_note', id, text: 'Done', colour: 'rose', x: 1, w: 300 }]);
    expect(set.project.artboards[0].notes![0]).toMatchObject({ text: 'Done', colour: 'rose', x: 1, y: 50, w: 300 });
    const gone = change(set.project, [{ op: 'delete_note', id }]);
    expect(gone.project.artboards[0].notes).toBeUndefined();
    expect(gone.project.notes).toHaveLength(1);
    // the document it started from is untouched
    expect(ab.notes).toBeUndefined();
  });

  it('a note placed against a layer follows it, beside it unless told where', () => {
    const p = sample();
    const ab = p.artboards[0];
    const { project } = change(p, [{ op: 'add_note', artboard_id: ab.id, layer_id: 'r1', text: 'about the box' }]);
    const n = project.artboards[0].notes![0];
    expect(n.anchor).toEqual({ layerId: 'r1', lx: 112, ly: 0 });
    expect(n.x).toBeCloseTo(10.46 + 100 + 12, 1);
    const moved = change(project, [{ op: 'set_note', id: n.id, layer_id: null }]);
    expect(moved.project.artboards[0].notes![0].anchor).toBeUndefined();
    expect(() => change(p, [{ op: 'add_note', artboard_id: ab.id, layer_id: 'nope', text: 'x' }])).toThrow(/no layer/);
    expect(() => change(p, [{ op: 'set_note', id: 'nope', text: 'x' }])).toThrow(/no note/);
    expect(() => change(p, [{ op: 'delete_note', id: 'nope' }])).toThrow(/no note/);
  });

  it('the node reference an agent reads keeps every node\'s full text: the summary and then the details, with what an event gives', () => {
    const text = mcp.reference('interactions');
    for (const d of CATALOG) expect(text, d.kind).toContain(d.description);
    const key = CATALOG.find((d) => d.kind === 'event.key')!;
    expect(key.details).toBeTruthy();
    expect(text).toContain('Gives: event.key, event.code');
  });

  it('graph notes: add_graph_note follows a node or group, set_note moves or lets go, delete_note removes, and list_notes shows them', () => {
    const p = sample();
    const ab = p.artboards[0];
    ab.logic.nodes.push({ id: 'ev', kind: 'event.start', x: 100, y: 300, params: {} });
    ab.logic.groups = [{ id: 'grp', label: 'Flow', x: 0, y: 500, width: 300, height: 200 }];
    const out = change(p, [
      { op: 'add_graph_note', artboard_id: ab.id, node_id: 'ev', text: '**Only if** stops the arrow keys', colour: 'sky', ref: 'g1' },
      { op: 'add_graph_note', artboard_id: ab.id, node_id: 'grp', text: 'about the group', x: 10, y: 420 },
      { op: 'add_graph_note', artboard_id: ab.id, text: 'loose', x: 700, y: 20 },
    ]);
    const notes = out.project.artboards[0].logic.notes!;
    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({ x: 100, y: 170, colour: 'sky', author: 'Agent (AI)' });
    expect(notes[0].anchor).toEqual({ layerId: 'ev', lx: 0, ly: -130 });
    expect(notes[1].anchor).toEqual({ layerId: 'grp', lx: 10, ly: -80 });
    expect(notes[2].anchor).toBeUndefined();
    expect(out.created.g1).toBe(notes[0].id);
    // not mixed up with the canvas or artboard notes
    expect(out.project.artboards[0].notes).toBeUndefined();
    expect(out.project.notes).toBeUndefined();
    const set = change(out.project, [{ op: 'set_note', id: notes[0].id, text: 'Done', anchor_id: null }, { op: 'set_note', id: notes[2].id, anchor_id: 'ev' }]);
    expect(set.project.artboards[0].logic.notes![0].anchor).toBeUndefined();
    expect(set.project.artboards[0].logic.notes![0].text).toBe('Done');
    expect(set.project.artboards[0].logic.notes![2].anchor).toEqual({ layerId: 'ev', lx: 600, ly: -280 });
    const gone = change(set.project, [{ op: 'delete_note', id: notes[0].id }, { op: 'delete_note', id: notes[1].id }, { op: 'delete_note', id: notes[2].id }]);
    expect(gone.project.artboards[0].logic.notes).toBeUndefined();
    expect(() => change(p, [{ op: 'add_graph_note', artboard_id: ab.id, node_id: 'nope', text: 'x' }])).toThrow(/no node or group/);
    expect(() => change(p, [{ op: 'add_graph_note', artboard_id: 'nope', text: 'x' }])).toThrow(/No artboard/);
    expect(() => change(out.project, [{ op: 'set_note', id: notes[0].id, anchor_id: 'nope' }])).toThrow(/no node or group/);
    const text = mcp.notesReport(out.project);
    expect(text).toContain('on the interaction graph of');
    expect(text).toContain('follows node or group ev');
  });

  it('cleans wrong-typed graph notes an agent wrote', () => {
    const p = sample();
    (p.artboards[0].logic as unknown as { notes: unknown }).notes = [{ id: 'a', x: 'far', text: 7 }, { nonsense: 1 }];
    const { project } = change(p, [{ op: 'add_note', text: 'anything' }]);
    expect(project.artboards[0].logic.notes).toHaveLength(1);
    expect(project.artboards[0].logic.notes![0]).toMatchObject({ id: 'a', x: 0, text: '' });
  });

  it('puts wrong-typed values an agent wrote right (or drops them)', () => {
    const p = sample();
    const { project } = change(p, [{ op: 'set_artboard', id: p.artboards[0].id, props: { notes: [{ id: 'a', x: 'far', text: 7, colour: 'neon' }, { nonsense: 1 }] } }]);
    expect(project.artboards[0].notes).toHaveLength(1);
    expect(project.artboards[0].notes![0]).toMatchObject({ id: 'a', x: 0, text: '' });
    expect(project.artboards[0].notes![0].colour).toBeUndefined();
  });

  it('the overview says how many there are, and list_notes reads them out', async () => {
    const p = sample();
    const { project } = change(p, [
      { op: 'add_note', artboard_id: p.artboards[0].id, text: 'one\n- two', x: 1, y: 2 },
      { op: 'add_note', text: 'canvas', x: 0, y: 0 },
    ]);
    const o = mcp.overview(project, {});
    expect(o).toContain('Notes: 1 (use list_notes)');
    expect(o).toContain('Notes on the canvas outside any artboard: 1');
    const tool = mcp.TOOLS.find((t) => t.name === 'list_notes')!;
    expect(tool).toBeTruthy();
  });
});
