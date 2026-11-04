import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, roundedBoxPoints } from 'interactives-player';
import { booleanPath } from '../src/lib/boolean';
import { exportLottie } from '../src/lib/lottie-export';
import { shapeToPaths } from '../src/lib/path-edit';

// Radii per corner: top-left, top-right, bottom-right, bottom-left
const radii: [number, number, number, number] = [40, 0, 0, 10];

describe('corner radii per corner outside the renderer', () => {
  it('draws rounded corners as bezier quarter circles, scaling radii that do not fit together', () => {
    const pts = roundedBoxPoints(100, 50, radii);
    // Two points for each rounded corner (top-left, bottom-left), one for each square one
    expect(pts).toHaveLength(2 + 1 + 1 + 2);
    expect(pts[0]).toMatchObject({ x: 40, y: 0 });
    // The square corners are where the box has them
    expect(pts.some((p) => p.x === 100 && p.y === 0)).toBe(true);
    expect(pts.some((p) => p.x === 100 && p.y === 50)).toBe(true);
    // 40 + 10 radii on a 40 px side do not fit: both scale by 0.8, as in CSS
    const squeezed = roundedBoxPoints(100, 40, radii);
    expect(squeezed.find((p) => p.y === 0 && p.x > 0 && p.x < 50)!.x).toBeCloseTo(32, 5);
  });

  it('converts a rect with radii per corner to path points that follow them, not the single radius', () => {
    const rect = createNode('rect', { width: 100, height: 50, cornerRadius: 5, cornerRadii: radii });
    const pts = shapeToPaths(rect)![0].points;
    expect(pts).toHaveLength(6);
    expect(pts.some((p) => p.x === 100 && p.y === 0)).toBe(true);
    // Without radii per corner it is still the single radius: 8 points
    expect(shapeToPaths(createNode('rect', { width: 100, height: 50, cornerRadius: 5 }))![0].points).toHaveLength(8);
  });

  it('keeps radii per corner when shapes are combined', () => {
    const ab = createArtboard({ name: 'A', width: 400, height: 200 });
    const a = createNode('rect', { x: 0, y: 0, width: 100, height: 100, cornerRadii: [40, 0, 0, 0] });
    const b = createNode('rect', { x: 150, y: 0, width: 100, height: 100 });
    ab.children.push(a, b);
    const res = booleanPath(ab, [a.id, b.id], 'union')!;
    const all = res.node.paths.flatMap((sp) => sp.points);
    // The rounded corner is cut away (the nearest point to the box's corner is on the arc), the square ones are there
    expect(Math.min(...all.map((p) => Math.hypot(p.x, p.y)))).toBeGreaterThan(10);
    expect(all.some((p) => p.x === 100 && p.y === 100)).toBe(true);
  });

  it('exports a rect with radii per corner to Lottie as an outline, not a rectangle with one radius', () => {
    const p = createProject('R');
    const ab = createArtboard({ name: 'A', width: 200, height: 100 });
    const plain = createNode('rect', { name: 'Plain', width: 100, height: 50, cornerRadius: 6, fill: { type: 'solid', color: '#ff0000' } });
    const per = createNode('rect', { name: 'Per', x: 100, width: 100, height: 50, cornerRadii: radii, fill: { type: 'solid', color: '#00ff00' } });
    ab.children.push(plain, per);
    p.artboards = [ab];
    const { json } = exportLottie(p, ab, { bytesFor: () => null });
    const kinds = (name: string) => {
      const layer = (json.layers as { nm: string; shapes: { ty: string }[] }[]).find((l) => l.nm === name)!;
      return layer.shapes.map((i) => i.ty);
    };
    expect(kinds('Plain')).toContain('rc');
    expect(kinds('Per')).toContain('sh');
    expect(kinds('Per')).not.toContain('rc');
  });
});
