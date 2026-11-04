import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, type SceneNode } from 'interactives-player';
import { hitTest } from '../src/store/doc';
import { hitsPaintedShape } from '../src/lib/shape-hit';

// A grey box 200 x 200 with an arch cut out of its bottom half (the arch is a second sub-path; even-odd makes it a hole)
const arch = createNode('path', {
  id: 'p1',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  fillRule: 'evenodd',
  fill: { type: 'solid', color: '#dddddd' },
  stroke: null,
  paths: [
    { closed: true, points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }] },
    { closed: true, points: [{ x: 20, y: 200 }, { x: 20, y: 100, out: { x: 0, y: -60 } }, { x: 180, y: 100, in: { x: 0, y: -60 } }, { x: 180, y: 200 }] },
  ],
} as never) as SceneNode;

describe('clicking a shape hits what is painted, not its box', () => {
  it('misses inside the cut-out and hits the painted frame around it', () => {
    expect(hitsPaintedShape(arch, 100, 150)).toBe(false);
    expect(hitsPaintedShape(arch, 100, 20)).toBe(true);
    expect(hitsPaintedShape(arch, 5, 150)).toBe(true);
  });

  it('the canvas picks what is under the arch, not the arch layer', () => {
    const under = createNode('rect', { id: 'under', x: 0, y: 0, width: 200, height: 200 });
    const ab = createArtboard({ width: 400, height: 400, children: [under, arch] });
    expect(hitTest(ab, 100, 150).at(-1)?.id).toBe('under');
    expect(hitTest(ab, 100, 20).at(-1)?.id).toBe('p1');
  });

  it('an unfilled path is hit on its stroke (plus a little slop), not in the middle', () => {
    const ring = createNode('path', { id: 'ring', width: 100, height: 100, fill: null, stroke: { paint: { type: 'solid', color: '#000' }, width: 4 }, paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }] } as never) as SceneNode;
    expect(hitsPaintedShape(ring, 50, 50, 3)).toBe(false);
    expect(hitsPaintedShape(ring, 50, 1, 3)).toBe(true);
    expect(hitsPaintedShape(ring, 50, 104, 3)).toBe(true);
  });
});
