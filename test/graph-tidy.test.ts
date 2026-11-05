import { describe, expect, it } from 'vitest';
import { TIDY, crossings, tidyGraph, type TidyEdge, type TidyNode } from '../src/lib/graph-tidy';

const node = (id: string, x: number, y: number, width = 170, height = 60): TidyNode => ({ id, x, y, width, height });

describe('tidying the interaction graph', () => {
  it('puts each step a column to the right of what leads into it, events first', () => {
    const nodes = [node('c', 0, 0), node('a', 500, 300), node('b', 200, 900)];
    const edges: TidyEdge[] = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }];
    const { positions } = tidyGraph(nodes, edges);
    const x = (id: string) => positions.get(id)!.x;
    expect(x('a')).toBeLessThan(x('b'));
    expect(x('b')).toBeLessThan(x('c'));
    expect(x('b') - x('a')).toBe(170 + TIDY.colGap);
  });

  it('untangles crossings', () => {
    // two events whose actions are stacked the other way round: their connections cross
    const nodes = [node('e1', 0, 0), node('e2', 0, 200), node('a1', 400, 200), node('a2', 400, 0)];
    const edges: TidyEdge[] = [{ from: 'e1', to: 'a1' }, { from: 'e2', to: 'a2' }];
    expect(crossings(nodes, edges, new Map())).toBe(1);
    const { positions } = tidyGraph(nodes, edges);
    expect(crossings(nodes, edges, positions)).toBe(0);
  });

  it('keeps a branching node outputs in port order, and stacks without overlaps', () => {
    const nodes = [node('if', 0, 0), node('no', 300, 0), node('yes', 300, 400)];
    const edges: TidyEdge[] = [{ from: 'if', to: 'yes', port: 0 }, { from: 'if', to: 'no', port: 1 }];
    const { positions } = tidyGraph(nodes, edges);
    expect(positions.get('yes')!.y).toBeLessThan(positions.get('no')!.y);
    expect(positions.get('no')!.y - positions.get('yes')!.y).toBeGreaterThanOrEqual(60 + TIDY.rowGap);
  });

  it('lays out a loop without stretching it, and stacks separate chains', () => {
    const nodes = [node('ev', 0, 0), node('a', 0, 0), node('b', 0, 0), node('lone', 0, 500)];
    const edges: TidyEdge[] = [{ from: 'ev', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }];
    const { positions } = tidyGraph(nodes, edges);
    expect(positions.get('b')!.x - positions.get('a')!.x).toBe(170 + TIDY.colGap);
    expect(positions.get('lone')!.y).toBeGreaterThan(positions.get('ev')!.y + 60);
  });

  it('fits a group around its nodes, with room for its title', () => {
    const nodes = [node('a', 0, 0), node('b', 900, 900)];
    const { positions, groups } = tidyGraph(nodes, [{ from: 'a', to: 'b' }], [{ id: 'g', members: ['a', 'b'] }]);
    const g = groups.get('g')!;
    expect(g.x).toBe(positions.get('a')!.x - TIDY.groupPad);
    expect(g.y).toBe(Math.min(positions.get('a')!.y, positions.get('b')!.y) - TIDY.groupTitle);
    expect(g.x + g.width).toBe(positions.get('b')!.x + 170 + TIDY.groupPad);
  });

  it("leaves room in a column for a group's title, so its frame doesn't cover the node above", () => {
    const nodes = [node('ev', 0, 0), node('a', 300, 0), node('b', 300, 100)];
    const edges: TidyEdge[] = [{ from: 'ev', to: 'a' }, { from: 'ev', to: 'b' }];
    const { positions, groups } = tidyGraph(nodes, edges, [{ id: 'g', members: ['b'] }]);
    const g = groups.get('g')!;
    expect(g.y).toBeGreaterThanOrEqual(positions.get('a')!.y + 60);
  });
});
