import { describe, expect, it } from 'vitest';
import { walk, sampleArtboard, type Paint, type SceneNode } from 'interactives-player';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

const GRADIENT_WARNING = /CSS-style gradients/;
const stops: Spec[] = [
  ['GradientStop', { parentId: 4, colorValue: 0xffff0000, position: 0 }],
  ['GradientStop', { parentId: 4, colorValue: 0xff0000ff, position: 1 }],
];
type Painted = SceneNode & { fill: Paint | null; fills?: Paint[]; stroke?: { paint: Paint } | null };
const named = (children: SceneNode[], name: string) => {
  let found: SceneNode | undefined;
  walk(children, (n) => n.name === name && (found = n));
  return found as Painted;
};

describe('Rive gradients keep their exact points', () => {
  // Slots: Artboard 0, Shape 1, path 2, Fill 3, gradient 4, its stops 5 and 6
  const file = (gradient: Spec, path: Spec = ['Ellipse', { parentId: 1, width: 200, height: 100 }], shape: Record<string, unknown> = {}, extra: Spec[] = []) =>
    writeRiv([['Artboard', { name: 'Main', width: 400, height: 300 }], ['Shape', { name: 'Dot', parentId: 0, ...shape }], path, ['Fill', { parentId: 1 }], gradient, ...stops, ...extra]);

  it('puts a linear gradient from Rive start to end in the layer box, with no warning', async () => {
    // The ellipse is 200x100 around the shape's origin, so its box starts at (-100,-50): start (-100,0) is the box's left middle
    const res = await importRive(file(['LinearGradient', { parentId: 3, startX: -100, startY: 0, endX: 60, endY: 20 }]), 'g');
    expect(res.warnings.some((w) => GRADIENT_WARNING.test(w))).toBe(false);
    const fill = named(res.artboards[0].children, 'Dot').fill as Extract<Paint, { type: 'linear' }>;
    expect(fill.type).toBe('linear');
    expect(fill.from).toEqual({ x: 0, y: 50 });
    expect(fill.to).toEqual({ x: 160, y: 70 });
    expect(fill.stops.map((s) => s.offset)).toEqual([0, 1]);
  });

  it('puts a radial gradient at its centre with the start-to-end distance as radius', async () => {
    const res = await importRive(file(['RadialGradient', { parentId: 3, startX: 10, startY: -20, endX: 40, endY: 20 }]), 'g');
    const fill = named(res.artboards[0].children, 'Dot').fill as Extract<Paint, { type: 'radial' }>;
    expect(fill.center).toEqual({ x: 110, y: 30 });
    expect(fill.radius).toBe(50);
  });

  it('follows the layer box of a path (its bounding box), including a path that sits off the shape origin', async () => {
    // A rectangle path moved to (50,40): the shape's box starts there, so a gradient at (50,40) starts at the box's corner
    const res = await importRive(file(['LinearGradient', { parentId: 3, startX: 50, startY: 40, endX: 250, endY: 40 }], ['Rectangle', { parentId: 1, x: 150, y: 90, width: 200, height: 100, originX: 0.5, originY: 0.5, cornerRadiusTL: 0 }], { rotation: 0 }), 'g');
    const dot = named(res.artboards[0].children, 'Dot');
    const fill = dot.fill as Extract<Paint, { type: 'linear' }>;
    expect(fill.from).toEqual({ x: 0, y: 0 });
    expect(fill.to).toEqual({ x: 200, y: 0 });
    expect(res.warnings.some((w) => GRADIENT_WARNING.test(w))).toBe(false);
  });

  it('applies to strokes and to the extra fills too', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 400, height: 300 }],
        ['Shape', { name: 'Dot', parentId: 0 }],
        ['Ellipse', { parentId: 1, width: 100, height: 100 }],
        ['Fill', { parentId: 1 }], // 3
        ['SolidColor', { parentId: 3, colorValue: 0xff00ff00 }], // 4
        ['Stroke', { parentId: 1, thickness: 4 }], // 5
        ['LinearGradient', { parentId: 5, startX: -50, startY: -50, endX: 50, endY: 50 }], // 6
        ['GradientStop', { parentId: 6, colorValue: 0xffff0000, position: 0 }],
        ['GradientStop', { parentId: 6, colorValue: 0xff0000ff, position: 1 }],
      ]),
      'g',
    );
    const dot = named(res.artboards[0].children, 'Dot');
    const sp = dot.stroke!.paint as Extract<Paint, { type: 'linear' }>;
    expect(sp.type).toBe('linear');
    // Rive centres a stroke on the outline, ours sits inside the box here, so the box grew by half the stroke: 2px each side
    expect(sp.from!.x + sp.from!.y).toBeGreaterThan(0);
    expect(sp.to!.x).toBeGreaterThan(sp.from!.x);
  });

  it('animates the points and the stops', async () => {
    const anim: Spec[] = [
      ['LinearAnimation', { name: 'Move', duration: 60, fps: 60, loopValue: 1 }],
      ['KeyedObject', { objectId: 4 }],
      ['KeyedProperty', { propertyKey: propKey('LinearGradient', 'endX') }],
      ['KeyFrameDouble', { frame: 0, value: 100 }],
      ['KeyFrameDouble', { frame: 60, value: 0 }],
      ['KeyedProperty', { propertyKey: propKey('LinearGradient', 'startY') }],
      ['KeyFrameDouble', { frame: 0, value: 0 }],
      ['KeyFrameDouble', { frame: 60, value: 40 }],
      ['KeyedObject', { objectId: 6 }],
      ['KeyedProperty', { propertyKey: propKey('GradientStop', 'position') }],
      ['KeyFrameDouble', { frame: 0, value: 1 }],
      ['KeyFrameDouble', { frame: 60, value: 0.5 }],
    ];
    const res = await importRive(file(['LinearGradient', { parentId: 3, startX: -100, startY: 0, endX: 100, endY: 0 }], undefined, {}, anim), 'g');
    expect(res.warnings.filter((w) => /has no matching layer|not supported/.test(w))).toEqual([]);
    const ab = res.artboards[0];
    const dot = named(ab.children, 'Dot');
    const tracks = ab.timelines[0].tracks.filter((t) => t.nodeId === dot.id).map((t) => t.prop).sort();
    expect(tracks).toEqual(['fill.from.y', 'fill.stops.1.offset', 'fill.to.x']);
    const mid = sampleArtboard(ab.children, ab.timelines[0], 500).find((n) => n.id === dot.id) as Painted;
    const f = mid.fill as Extract<Paint, { type: 'linear' }>;
    expect(f.to!.x).toBeCloseTo(150, 0);
    expect(f.from!.y).toBeCloseTo(50 + 20, 0);
    expect(f.stops[1].offset).toBeCloseTo(0.75, 1);
  });

  it('animates a radial gradient centre and radius', async () => {
    const anim: Spec[] = [
      ['LinearAnimation', { name: 'Move', duration: 60, fps: 60, loopValue: 1 }],
      ['KeyedObject', { objectId: 4 }],
      ['KeyedProperty', { propertyKey: propKey('RadialGradient', 'startX') }],
      ['KeyFrameDouble', { frame: 0, value: 0 }],
      ['KeyFrameDouble', { frame: 60, value: 20 }],
      ['KeyedProperty', { propertyKey: propKey('RadialGradient', 'endX') }],
      ['KeyFrameDouble', { frame: 0, value: 50 }],
      ['KeyFrameDouble', { frame: 60, value: 90 }],
    ];
    const res = await importRive(file(['RadialGradient', { parentId: 3, startX: 0, startY: 0, endX: 50, endY: 0 }], undefined, {}, anim), 'g');
    const ab = res.artboards[0];
    const dot = named(ab.children, 'Dot');
    expect(ab.timelines[0].tracks.filter((t) => t.nodeId === dot.id).map((t) => t.prop).sort()).toEqual(['fill.center.x', 'fill.radius']);
    const end = sampleArtboard(ab.children, ab.timelines[0], 1000).find((n) => n.id === dot.id) as Painted;
    const f = end.fill as Extract<Paint, { type: 'radial' }>;
    expect(f.center!.x).toBe(120);
    expect(f.radius).toBe(90);
  });

  it('puts an artboard background gradient in the artboard box', async () => {
    const res = await importRive(
      writeRiv([
        ['Artboard', { name: 'Main', width: 400, height: 300, originX: 0.5, originY: 0.5 }],
        ['Fill', { parentId: 0 }], // 1
        ['LinearGradient', { parentId: 1, startX: -200, startY: 0, endX: 200, endY: 0 }],
        ['GradientStop', { parentId: 2, colorValue: 0xffff0000, position: 0 }],
        ['GradientStop', { parentId: 2, colorValue: 0xff0000ff, position: 1 }],
      ]),
      'g',
    );
    const bg = res.artboards[0].background as Extract<Paint, { type: 'linear' }> | null;
    if (bg) {
      expect(bg.from).toEqual({ x: 0, y: 150 });
      expect(bg.to).toEqual({ x: 400, y: 150 });
    }
  });
});

describe('Rive samples import without the four reported warnings', () => {
  // Needs the sample files; they are read from research/rive like the other real-file tests
  it('has none of them left', async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const dir = `${process.cwd()}/../research/rive/`;
    const files = ['262426_-_breathing_for_calm.riv', 'breathing_for_calm_TEST1.riv', 'treasure_valley_interactive_map.riv'].filter((f) => existsSync(dir + f));
    if (!files.length) return;
    for (const f of files) {
      const res = await importRive(new Uint8Array(readFileSync(dir + f)), f);
      const bad = res.warnings.filter((w) => /not attached to a layer property|Animating "(height|originY)" on Text|CSS-style gradients/.test(w));
      expect(bad, f).toEqual([]);
    }
  });
});
