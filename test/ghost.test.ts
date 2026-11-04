//Layers hanging outside an artboard that clips: which ones get a faint copy on the canvas, and where a click can pick them.
import { describe, expect, it } from 'vitest';
import { createNode, type SceneNode } from 'interactives-player';
import { ghostLayers, inGhostExtent, outsideClipPath, setGhostExtent } from '../src/canvas/ghost';

const rect = (name: string, x: number, y: number, w = 50, h = 50, extra: Partial<SceneNode> = {}) => createNode('rect', { name, x, y, width: w, height: h, ...extra } as Partial<SceneNode>) as SceneNode;

describe('ghost layers', () => {
  it('finds nothing when every layer is inside', () => {
    expect(ghostLayers([rect('a', 0, 0), rect('b', 150, 150)], 200, 200)).toBeNull();
  });

  it('picks only the top-level layers that reach outside, and the area they cover', () => {
    const a = rect('a', 10, 10);
    const b = rect('b', 180, 20);
    const c = rect('c', -30, 100, 20, 20);
    const g = ghostLayers([a, b, c], 200, 200)!;
    expect(g.nodes.map((n) => n.name)).toEqual(['b', 'c']);
    expect(g.extent).toEqual({ x0: -30, y0: 20, x1: 230, y1: 120 });
  });

  it('sees a child hanging out of a group, but not out of a clipping frame', () => {
    const inGroup = createNode('group', { name: 'g', x: 100, y: 100, width: 50, height: 50, children: [rect('kid', 80, 0)] } as Partial<SceneNode>) as SceneNode;
    const inFrame = createNode('frame', { name: 'f', x: 100, y: 100, width: 50, height: 50, clip: true, children: [rect('kid', 80, 0)] } as Partial<SceneNode>) as SceneNode;
    expect(ghostLayers([inGroup], 200, 200)?.nodes.map((n) => n.name)).toEqual(['g']);
    expect(ghostLayers([inFrame], 200, 200)).toBeNull();
  });

  it('counts rotation and scale', () => {
    const turned = rect('t', 100, 80, 100, 10, { rotation: 90 } as Partial<SceneNode>);
    //a 100 x 10 bar turned about its middle reaches 50 above and below its centre
    expect(ghostLayers([turned], 200, 200)).toBeNull();
    //(the same bar not turned runs off the edge)
    expect(ghostLayers([rect('flat', 100, 80, 120, 10)], 200, 200)).not.toBeNull();
    const bigger = rect('s', 150, 80, 40, 10, { scaleX: 3 } as Partial<SceneNode>);
    expect(ghostLayers([bigger], 200, 200)?.nodes).toHaveLength(1);
  });

  it('ignores hidden layers', () => {
    expect(ghostLayers([rect('h', 300, 0, 50, 50, { visible: false } as Partial<SceneNode>)], 200, 200)).toBeNull();
  });

  it('keeps a mask together with the layers it clips', () => {
    const mask = rect('mask', 10, 10, 50, 50, { mask: true } as never);
    const inside = rect('under', 20, 20);
    const out = rect('out', 400, 0);
    const other = rect('other', 100, 100);
    //the mask runs up to the next mask, so one layer past the edge draws the whole run
    const g = ghostLayers([other, mask, inside, out], 200, 200)!;
    expect(g.nodes.map((n) => n.name)).toEqual(['mask', 'under', 'out']);
  });

  it('answers where a click picks them', () => {
    setGhostExtent('ab', { x0: -30, y0: 0, x1: 230, y1: 120 });
    expect(inGhostExtent('ab', 220, 50)).toBe(true);
    expect(inGhostExtent('ab', 220, 300)).toBe(false);
    expect(inGhostExtent('other', 0, 0)).toBe(false);
    setGhostExtent('ab', null);
    expect(inGhostExtent('ab', 220, 50)).toBe(false);
  });

  it('cuts the artboard out of the ghost', () => {
    expect(outsideClipPath(320, 200)).toContain('M0 0H320V200H0Z');
  });
});
