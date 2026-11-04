import { describe, expect, it } from 'vitest';
import { createNode, createProject, defaultAutoLayout, type PathNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';

function store(...nodes: ReturnType<typeof createNode>[]) {
  const p = createProject('T');
  p.artboards[0].children.push(...nodes);
  return new EditorStore(p);
}

describe('align and distribute', () => {
  it('aligns several layers to their shared bounds', () => {
    const a = createNode('rect', { x: 10, y: 0, width: 50, height: 50 });
    const b = createNode('rect', { x: 100, y: 40, width: 20, height: 20 });
    const s = store(a, b);
    s.select([a.id, b.id]);
    s.align('right');
    expect(s.artboard()!.children.map((n) => n.x + n.width)).toEqual([120, 120]);
    s.align('top');
    expect(s.artboard()!.children.map((n) => n.y)).toEqual([0, 0]);
  });
  it('aligns a single layer to the artboard', () => {
    const a = createNode('rect', { x: 10, y: 10, width: 100, height: 50 });
    const s = store(a);
    s.select([a.id]);
    s.align('hcenter');
    expect(s.artboard()!.children[0].x).toBe(350);
  });
  it('distributes gaps evenly', () => {
    const ns = [0, 30, 200].map((x) => createNode('rect', { x, y: 0, width: 20, height: 20 }));
    const s = store(...ns);
    s.select(ns.map((n) => n.id));
    s.distribute('horizontal');
    expect(s.artboard()!.children.map((n) => n.x)).toEqual([0, 100, 200]);
  });
});

describe('boolean operations', () => {
  it('unions two overlapping rectangles into one path, keeping the base style', () => {
    const a = createNode('rect', { x: 0, y: 0, width: 100, height: 100, fill: { type: 'solid', color: '#ff0000' } });
    const b = createNode('rect', { x: 50, y: 50, width: 100, height: 100 });
    const s = store(a, b);
    s.select([a.id, b.id]);
    s.booleanSelection('union');
    const kids = s.artboard()!.children;
    expect(kids).toHaveLength(1);
    const p = kids[0] as PathNode;
    expect(p.type).toBe('path');
    expect([p.x, p.y, p.width, p.height]).toEqual([0, 0, 150, 150]);
    expect(p.paths[0].points).toHaveLength(8);
    expect(p.fill).toEqual({ type: 'solid', color: '#ff0000' });
  });
  it('subtracts to a ring with a hole', () => {
    const a = createNode('rect', { x: 0, y: 0, width: 100, height: 100 });
    const b = createNode('rect', { x: 25, y: 25, width: 50, height: 50 });
    const s = store(a, b);
    s.select([a.id, b.id]);
    s.booleanSelection('subtract');
    const p = s.artboard()!.children[0] as PathNode;
    expect(p.paths).toHaveLength(2);
    expect(p.fillRule).toBe('evenodd');
  });
});

describe('auto layout in the editor', () => {
  it('re-lays out a frame whenever its children change', () => {
    const c1 = createNode('rect', { width: 40, height: 20 });
    const c2 = createNode('rect', { width: 40, height: 30 });
    const f = createNode('frame', { width: 200, height: 10, children: [c1, c2], layout: { ...defaultAutoLayout('column'), gap: 10 } });
    const s = store(f);
    s.setProps([c1.id], { height: 50 });
    const frame = s.artboard()!.children[0] as typeof f;
    expect(frame.children.map((c) => c.y)).toEqual([16, 76]);
    expect(frame.height).toBe(16 + 50 + 10 + 30 + 16);
    s.undo();
    expect((s.artboard()!.children[0] as typeof f).children[1].y).toBe(46);
  });
});
