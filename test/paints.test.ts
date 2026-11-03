import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type EllipseNode, type PathNode, type RectNode } from 'interactives-player';
import { importLottie } from '../src/lib/lottie-import';
import { exportLottie } from '../src/lib/lottie-export';
import { importRive } from '../src/lib/rive-import';
import { propKey, writeRiv, type Spec } from './rive-writer';

// 0xAARRGGBB
const RED = 0xffff0000;
const BLUE = 0xff0000ff;
const BLACK_TRANSPARENT = 0x66000000;

/** A shape (slot 1) with the given paints, each a [Fill|Stroke props, colour, extra children] */
function shape(paints: Spec[], rect = true): Spec[] {
  return [
    ['Artboard', { name: 'Main', width: 200, height: 200 }],
    ['Shape', { name: 'Card', parentId: 0 }], // 1
    rect ? ['Rectangle', { parentId: 1, width: 100, height: 60 }] : ['PointsPath', { parentId: 1, isClosed: true }],
    ...paints,
  ];
}

describe('Rive shapes with several fills and strokes', () => {
  it('keeps every fill and stroke, in file order, as layers', async () => {
    const res = await importRive(
      writeRiv(
        shape([
          ['Fill', { parentId: 1 }], // 3
          ['SolidColor', { parentId: 3, colorValue: RED }],
          ['Fill', { parentId: 1 }], // 5
          ['SolidColor', { parentId: 5, colorValue: BLUE }],
          ['Stroke', { parentId: 1, thickness: 4 }], // 7
          ['SolidColor', { parentId: 7, colorValue: RED }],
          ['Stroke', { parentId: 1, thickness: 2 }], // 9
          ['SolidColor', { parentId: 9, colorValue: BLUE }],
        ]),
      ),
      'multi',
    );
    const n = res.artboards[0].children[0] as RectNode;
    expect(n.type).toBe('rect');
    expect(n.fill).toMatchObject({ type: 'solid', color: '#ff0000' });
    expect(n.fills).toHaveLength(1);
    expect(n.fills![0]).toMatchObject({ type: 'solid', color: '#0000ff' });
    expect(n.stroke!.width).toBe(4);
    expect(n.strokes).toHaveLength(1);
    expect(n.strokes![0]).toMatchObject({ width: 2, align: 'center' });
    expect(n.stroke!.align).toBe('center');
    // Strokes sit on the outline now, so the box keeps the rectangle's size
    expect(n.width).toBe(100);
    expect(res.warnings.some((w) => /several fills or strokes/.test(w))).toBe(false);
  });

  it('turns a feathered, offset, blended fill into a drop shadow layer', async () => {
    const res = await importRive(
      writeRiv(
        shape([
          ['Fill', { parentId: 1, blendModeValue: 24 }], // 3
          ['SolidColor', { parentId: 3, colorValue: BLACK_TRANSPARENT }],
          ['Feather', { parentId: 3, strength: 12, offsetX: 2, offsetY: 6 }],
          ['Fill', { parentId: 1 }], // 6
          ['SolidColor', { parentId: 6, colorValue: RED }],
        ]),
      ),
      'shadow',
    );
    const n = res.artboards[0].children[0] as RectNode;
    expect(n.fill).toMatchObject({ type: 'solid', feather: 12, offsetX: 2, offsetY: 6, blend: 'multiply' });
    expect(n.fills![0]).toMatchObject({ type: 'solid' });
    expect((n.fills![0] as { feather?: number }).feather).toBeUndefined();
  });

  it('keys the colours, thickness and feather of each layer onto its own paths', async () => {
    const res = await importRive(
      writeRiv([
        ...shape([
          ['Fill', { parentId: 1 }], // 3
          ['SolidColor', { parentId: 3, colorValue: RED }], // 4
          ['Fill', { parentId: 1 }], // 5
          ['SolidColor', { parentId: 5, colorValue: BLUE }], // 6
          ['Feather', { parentId: 5, strength: 4 }], // 7
          ['Stroke', { parentId: 1, thickness: 4 }], // 8
          ['SolidColor', { parentId: 8, colorValue: RED }], // 9
          ['Stroke', { parentId: 1, thickness: 2 }], // 10
          ['SolidColor', { parentId: 10, colorValue: BLUE }], // 11
        ]),
        ['LinearAnimation', { name: 'Go', fps: 60, duration: 60 }],
        ['KeyedObject', { objectId: 6 }],
        ['KeyedProperty', { propertyKey: propKey('SolidColor', 'colorValue') }],
        ['KeyFrameColor', { frame: 0, value: BLUE, interpolationType: 1 }],
        ['KeyFrameColor', { frame: 60, value: RED, interpolationType: 1 }],
        ['KeyedObject', { objectId: 10 }],
        ['KeyedProperty', { propertyKey: propKey('Stroke', 'thickness') }],
        ['KeyFrameDouble', { frame: 0, value: 2, interpolationType: 1 }],
        ['KeyFrameDouble', { frame: 60, value: 8, interpolationType: 1 }],
        ['KeyedObject', { objectId: 7 }],
        ['KeyedProperty', { propertyKey: propKey('Feather', 'strength') }],
        ['KeyFrameDouble', { frame: 0, value: 4, interpolationType: 1 }],
        ['KeyFrameDouble', { frame: 60, value: 20, interpolationType: 1 }],
      ]),
      'keys',
    );
    const props = res.artboards[0].timelines[0].tracks.map((t) => t.prop).sort();
    expect(props).toEqual(['fills.0.color', 'fills.0.feather', 'strokes.0.width']);
  });

  it('imports several strokes on a path with a cap and join each', async () => {
    const res = await importRive(
      writeRiv(
        shape(
          [
            ['Stroke', { parentId: 1, thickness: 4, cap: 1, join: 1 }], // 6
            ['SolidColor', { parentId: 6, colorValue: RED }],
            ['Stroke', { parentId: 1, thickness: 2, cap: 2, join: 2 }],
            ['SolidColor', { parentId: 8, colorValue: BLUE }],
          ],
          false,
        ).flatMap((o, i) => (i === 2 ? [o, ['StraightVertex', { parentId: 2, x: 0, y: 0 }] as Spec, ['StraightVertex', { parentId: 2, x: 50, y: 0 }] as Spec, ['StraightVertex', { parentId: 2, x: 25, y: 40 }] as Spec] : [o])),
      ),
      'pathstrokes',
    );
    const n = res.artboards[0].children[0] as PathNode;
    expect(n.type).toBe('path');
    expect(n.strokes).toHaveLength(1);
    expect(n.stroke).toMatchObject({ cap: 'round', join: 'round' });
    expect(n.strokes![0]).toMatchObject({ cap: 'square', join: 'bevel' });
  });
});

describe('Lottie shapes with several fills and strokes', () => {
  const animated = { a: 1, k: [{ t: 0, s: [1, 0, 0, 1] }, { t: 30, s: [0, 0, 1, 1] }] };
  const lottie = (items: unknown[]) => ({
    v: '5.7.4', fr: 30, ip: 0, op: 60, w: 100, h: 100, nm: 'T', ddd: 0, assets: [],
    layers: [{ ty: 4, ind: 1, nm: 'L', ip: 0, op: 60, st: 0, ks: { p: { a: 0, k: [0, 0] } }, shapes: [{ ty: 'gr', nm: 'G', it: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [20, 20] } }, ...items, { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }] }] }],
  });
  const fl = (c: number[], o = 100) => ({ ty: 'fl', c: { a: 0, k: c }, o: { a: 0, k: o } });
  const st = (c: number[], w: number, lc = 2, lj = 2) => ({ ty: 'st', c: { a: 0, k: c }, o: { a: 0, k: 100 }, w: { a: 0, k: w }, lc, lj });

  it('keeps every fill and stroke, front-most listed first', () => {
    const { artboard, warnings } = importLottie(lottie([st([0, 0, 1, 1], 2), st([1, 0, 0, 1], 6), fl([0, 1, 0, 1], 50), fl([1, 1, 0, 1])]));
    const dot = (artboard.children[0] as unknown as { children: { children: EllipseNode[] }[] }).children[0].children[0];
    // back to front: the last listed is the first (bottom) layer
    expect(dot.fill).toMatchObject({ type: 'solid', color: '#ffff00' });
    expect(dot.fills).toHaveLength(1);
    expect(dot.fills![0]).toMatchObject({ type: 'solid' });
    expect(dot.stroke!.width).toBe(6);
    expect(dot.strokes![0].width).toBe(2);
    expect(warnings.some((w) => /several|first/.test(w))).toBe(false);
  });

  it('keys the colour of a later fill on its own path', () => {
    const { artboard } = importLottie(lottie([{ ty: 'fl', c: animated, o: { a: 0, k: 100 } }, fl([1, 1, 1, 1])]));
    const dot = (artboard.children[0] as unknown as { children: { children: EllipseNode[] }[] }).children[0].children[0];
    expect(artboard.timelines[0].tracks.map((t) => [t.nodeId, t.prop])).toEqual([[dot.id, 'fills.0.color']]);
  });

  it('warns about a fill drawn over a stroke', () => {
    const { warnings } = importLottie(lottie([fl([1, 0, 0, 1]), st([0, 0, 0, 1], 2)]));
    expect(warnings.some((w) => /fill drawn over a stroke/.test(w))).toBe(true);
  });

  it('exports every layer, with its own opacity and colour keys, front-most first', () => {
    const p = createProject();
    const ab = createArtboard({ name: 'A', width: 100, height: 100 });
    const e = createNode('ellipse', {
      name: 'Dot',
      width: 20,
      height: 20,
      fill: { type: 'solid', color: '#ff0000' },
      fills: [{ type: 'solid', color: '#00ff00', opacity: 0.5 }, { type: 'solid', color: '#000000', feather: 8 }],
      stroke: { paint: { type: 'solid', color: '#0000ff' }, width: 2 },
      strokes: [{ paint: { type: 'solid', color: '#ffffff' }, width: 6, cap: 'butt', join: 'miter' }],
    });
    ab.children.push(e);
    p.artboards = [ab];
    const { json, warnings } = exportLottie(p, ab, { bytesFor: () => null });
    const items = (json.layers as { shapes: { ty: string; w?: { k: number }; o?: { k: number }; lc?: number }[] }[])[0].shapes;
    const kinds = items.map((i) => i.ty).filter((t) => t === 'st' || t === 'fl');
    expect(kinds).toEqual(['st', 'st', 'fl', 'fl']);
    const strokes = items.filter((i) => i.ty === 'st');
    expect(strokes.map((s) => s.w!.k)).toEqual([6, 2]);
    expect(strokes[0].lc).toBe(1);
    expect(items.filter((i) => i.ty === 'fl').map((f) => f.o!.k)).toEqual([50, 100]);
    expect(warnings.some((w) => /Feathered/.test(w))).toBe(true);
  });
});
