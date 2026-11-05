import { describe, expect, it } from 'vitest';
import type { LogicEdge, LogicGroup, LogicNode } from 'interactives-player';
import { cloneFragment, fragmentOf, fragmentOrigin, logicToPaste } from '../src/lib/logic-clipboard';

const node = (id: string, x: number, y = 0): LogicNode => ({ id, kind: 'action.setVariable', x, y, params: { value: id } });
const edge = (id: string, from: string, to: string): LogicEdge => ({ id, from, fromPort: 'out', to, toPort: 'in' });

// a -> b -> c, and d -> a from outside; the group holds b and c
const graph = {
  nodes: [node('a', 0), node('b', 200), node('c', 400), node('d', -200)],
  edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('da', 'd', 'a')],
  groups: [{ id: 'g', label: 'Score', x: 180, y: -40, width: 440, height: 160 } as LogicGroup],
};
const membersOf = (g: LogicGroup) => graph.nodes.filter((n) => n.x >= g.x && n.x <= g.x + g.width);

describe('graph clipboard', () => {
  it('copies the chosen nodes and only the connections between two of them', () => {
    const f = fragmentOf(graph, ['a', 'b'], membersOf);
    expect(f.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(f.edges.map((e) => e.id)).toEqual(['ab']);
    expect(f.groups).toEqual([]);
  });

  it('a chosen group brings the nodes inside it', () => {
    const f = fragmentOf(graph, ['g'], membersOf);
    expect(f.groups.map((g) => g.id)).toEqual(['g']);
    expect(f.nodes.map((n) => n.id)).toEqual(['b', 'c']);
    expect(f.edges.map((e) => e.id)).toEqual(['bc']);
  });

  it('pasted copies get new ids and are wired to each other the way the originals were, never to the originals', () => {
    const f = fragmentOf(graph, ['a', 'b', 'c'], membersOf);
    const c = cloneFragment(f, 30, 30);
    const ids = new Map(f.nodes.map((n, i) => [n.id, c.nodes[i].id]));
    for (const n of c.nodes) expect(graph.nodes.some((o) => o.id === n.id)).toBe(false);
    expect(c.edges.map((e) => [e.from, e.to])).toEqual([
      [ids.get('a'), ids.get('b')],
      [ids.get('b'), ids.get('c')],
    ]);
    for (const e of c.edges) expect(graph.edges.some((o) => o.id === e.id)).toBe(false);
    expect(c.nodes[0]).toMatchObject({ x: 30, y: 30, kind: 'action.setVariable', params: { value: 'a' } });
    // a second paste makes another, separate set
    const again = cloneFragment(f, 60, 60);
    expect(new Set([...c.nodes, ...again.nodes].map((n) => n.id)).size).toBe(6);
    // the copy's params are its own
    (c.nodes[0].params as Record<string, unknown>).value = 'changed';
    expect(graph.nodes[0].params.value).toBe('a');
  });

  it('moves groups with the paste, and lines a paste up by the top left of everything in it', () => {
    const f = fragmentOf(graph, ['g'], membersOf);
    expect(fragmentOrigin(f)).toEqual({ x: 180, y: -40 });
    const c = cloneFragment(f, 10, 20);
    expect(c.groups[0]).toMatchObject({ label: 'Score', x: 190, y: -20 });
    expect(c.groups[0].id).not.toBe('g');
  });

  it("reads what it wrote, the older list-of-nodes format, and nothing from someone else's clipboard", () => {
    const f = fragmentOf(graph, ['a', 'b'], membersOf);
    expect(logicToPaste(JSON.stringify({ 'interactives/logic-nodes': f }))).toEqual(f);
    expect(logicToPaste(JSON.stringify({ 'interactives/logic-nodes': [node('x', 1)] }))).toEqual({ nodes: [node('x', 1)], edges: [], groups: [] });
    expect(logicToPaste('just some text')).toEqual({ nodes: [], edges: [], groups: [] });
  });
});
