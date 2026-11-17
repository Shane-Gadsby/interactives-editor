//The question kit's nodes drawn as one block per question (lib/graph-fold.ts): which nodes fold, and how connections across the block's edge are drawn.
import { describe, expect, it } from 'vitest';
import type { LogicEdge, LogicNode } from 'interactives-player';
import { foldId, foldedEdges, framesToOpen, hiddenIn, isFoldId, kitBlocks } from '../src/lib/graph-fold';

const node = (id: string, x: number, y: number, frame?: string): LogicNode => ({ id, kind: 'action.setVariable', x, y, params: {}, ...(frame ? { kit: { frame, slot: id } } : {}) });
const edge = (id: string, from: string, to: string, fromPort = 'out'): LogicEdge => ({ id, from, fromPort, to, toPort: 'in' });

describe('kit blocks in the graph', () => {
  const nodes = [node('a', 400, 300, 'q1'), node('b', 100, 120, 'q1'), node('c', 700, 40, 'q1'), node('own', 900, 100), node('lone', 0, 0, 'q2'), node('x', 10, 10, 'q3'), node('y', 30, 5, 'q3')];

  it('makes a block for each question with at least two kit nodes, at their top left, and none for author nodes', () => {
    const blocks = kitBlocks(nodes);
    expect(blocks.map((b) => [b.frame, b.id, b.members.length, b.x, b.y])).toEqual([
      ['q1', 'kitfold:q1', 3, 100, 40],
      ['q3', 'kitfold:q3', 2, 10, 5],
    ]);
    expect(foldId('q1')).toBe('kitfold:q1');
    expect(isFoldId('kitfold:q1')).toBe(true);
    expect(isFoldId('own')).toBe(false);
  });

  it('hides the members of a block that is not open', () => {
    const blocks = kitBlocks(nodes);
    expect([...hiddenIn(blocks, new Set()).keys()].sort()).toEqual(['a', 'b', 'c', 'x', 'y']);
    expect([...hiddenIn(blocks, new Set(['q1'])).keys()].sort()).toEqual(['x', 'y']);
  });

  it('draws a connection into or out of a folded block to the block, drops the ones inside, and draws repeats once', () => {
    const blocks = kitBlocks(nodes);
    const hidden = hiddenIn(blocks, new Set());
    const edges = [edge('e1', 'b', 'a'), edge('e2', 'a', 'own', 'right'), edge('e3', 'c', 'own', 'wrong'), edge('e4', 'own', 'b'), edge('e5', 'x', 'y')];
    const drawn = foldedEdges(edges, hidden);
    expect(drawn.map((e) => e.id)).toEqual(['e2', 'e4']);
    expect(drawn[0]).toEqual({ id: 'e2', source: 'kitfold:q1', sourceHandle: 'out', target: 'own', targetHandle: 'in' });
    expect(drawn[1]).toEqual({ id: 'e4', source: 'own', sourceHandle: 'out', target: 'kitfold:q1', targetHandle: 'in' });
  });

  it('draws every connection as it is when nothing is folded', () => {
    const blocks = kitBlocks(nodes);
    const open = new Set(blocks.map((b) => b.frame));
    const edges = [edge('e1', 'b', 'a'), edge('e2', 'a', 'own', 'right')];
    expect(foldedEdges(edges, hiddenIn(blocks, open)).map((e) => [e.id, e.source, e.sourceHandle, e.target])).toEqual([
      ['e1', 'b', 'out', 'a'],
      ['e2', 'a', 'right', 'own'],
    ]);
  });

  it('says which questions to open to see some nodes', () => {
    const blocks = kitBlocks(nodes);
    expect(framesToOpen(['b', 'own'], blocks, new Set())).toEqual(['q1']);
    expect(framesToOpen(['b', 'x'], blocks, new Set(['q1']))).toEqual(['q3']);
    expect(framesToOpen(['own', 'lone'], blocks, new Set())).toEqual([]);
  });
});
