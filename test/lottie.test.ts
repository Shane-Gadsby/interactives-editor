import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type Timeline } from 'interactives-player';
import { importLottie, isLottie } from '../src/lib/lottie-import';
import { exportLottie } from '../src/lib/lottie-export';

const sample = {
  v: '5.7.4',
  fr: 30,
  ip: 0,
  op: 60,
  w: 200,
  h: 100,
  nm: 'Sample',
  ddd: 0,
  assets: [],
  layers: [
    {
      ty: 4,
      ind: 1,
      nm: 'Ball',
      ip: 0,
      op: 60,
      st: 0,
      ks: {
        a: { a: 0, k: [0, 0] },
        p: { a: 1, k: [{ t: 0, s: [20, 50], o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } }, { t: 30, s: [180, 50] }] },
        s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 },
        o: { a: 1, k: [{ t: 0, s: [100], h: 1 }, { t: 45, s: [50] }] },
      },
      shapes: [
        {
          ty: 'gr',
          nm: 'Circle',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [20, 20] } },
            { ty: 'fl', c: { a: 1, k: [{ t: 0, s: [1, 0, 0, 1] }, { t: 30, s: [0, 0, 1, 1] }] }, o: { a: 0, k: 100 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        },
        { ty: 'tm', nm: 'Trim' },
      ],
    },
    { ty: 3, ind: 2, nm: 'Late null', ip: 15, op: 60, st: 0, ks: { p: { a: 0, k: [0, 0] } } },
  ],
};

describe('Lottie import', () => {
  it('recognises Lottie JSON', () => {
    expect(isLottie(sample)).toBe(true);
    expect(isLottie({ format: 'interactives' })).toBe(false);
  });

  it('maps layers, shapes, keyframes and easing', () => {
    const { artboard, warnings } = importLottie(sample);
    expect([artboard.width, artboard.height, artboard.name]).toEqual([200, 100, 'Sample']);
    const tl = artboard.timelines[0];
    expect(tl.duration).toBe(2000);
    const ball = artboard.children.find((n) => n.name === 'Ball')!;
    expect(ball.type).toBe('group');
    const x = tl.tracks.find((t) => t.nodeId === ball.id && t.prop === 'x')!;
    expect(x.keys.map((k) => [k.t, k.value])).toEqual([
      [0, 20],
      [1000, 180],
    ]);
    expect(x.keys[0].ease).toEqual([0.42, 0, 0.58, 1]);
    const op = tl.tracks.find((t) => t.nodeId === ball.id && t.prop === 'opacity')!;
    expect(op.keys[0].ease).toBe('step');
    expect(op.keys[1].value).toBe(0.5);
    const circle = (ball as { children: { children: unknown[] }[] }).children[0].children[0] as { type: string; x: number; width: number; id: string };
    expect([circle.type, circle.x, circle.width]).toEqual(['ellipse', -10, 20]);
    const fill = tl.tracks.find((t) => t.nodeId === circle.id && t.prop === 'fill.color')!;
    expect(fill.keys.map((k) => k.value)).toEqual(['#ff0000', '#0000ff']);
    const late = artboard.children.find((n) => n.name === 'Late null')!;
    const vis = tl.tracks.find((t) => t.nodeId === late.id && t.prop === 'visible')!;
    expect(vis.keys.map((k) => [k.t, k.value])).toEqual([
      [0, false],
      [500, true],
    ]);
    expect(warnings.some((w) => w.includes('Trim'))).toBe(true);
  });
});

describe('Lottie export', () => {
  it('round-trips shapes, transforms and keyframes', () => {
    const p = createProject('RT');
    const ab = createArtboard({ name: 'A', width: 300, height: 200 });
    const rect = createNode('rect', { name: 'Box', x: 10, y: 20, width: 100, height: 50, rotation: 30, cornerRadius: 6, fill: { type: 'solid', color: '#3b5bfd' } });
    const path = createNode('path', { name: 'Tri', x: 150, y: 50, width: 60, height: 60, paths: [{ closed: true, points: [{ x: 0, y: 60 }, { x: 30, y: 0, out: { x: 10, y: 0 } }, { x: 60, y: 60 }] }], fill: { type: 'solid', color: '#ff0000' } });
    const tl: Timeline = { id: 't', name: 'Main', duration: 1000, loop: 'loop', autoplay: true, speed: 1, tracks: [{ id: 'tr', nodeId: rect.id, prop: 'x', keys: [{ id: 'a', t: 0, value: 10, ease: 'easeInOut' }, { id: 'b', t: 1000, value: 200, ease: 'linear' }] }] };
    ab.children.push(rect, path);
    ab.timelines.push(tl);
    ab.logic.nodes.push({ id: 'l', kind: 'event.start', x: 0, y: 0, params: {} });
    p.artboards = [ab];
    const { json, warnings } = exportLottie(p, ab, { bytesFor: () => null });
    expect(json.op).toBe(60);
    expect(warnings.some((w) => w.includes('Interactions'))).toBe(true);
    const back = importLottie(json).artboard;
    const box = back.children.find((n) => n.name === 'Box')!;
    expect([Math.round(box.x), Math.round(box.y), box.rotation]).toEqual([10, 20, 30]);
    const x = back.timelines[0].tracks.find((t) => t.nodeId === box.id && t.prop === 'x')!;
    expect(x.keys.map((k) => [k.t, Math.round(Number(k.value))])).toEqual([
      [0, 10],
      [1000, 200],
    ]);
    expect(x.keys[0].ease).toEqual([0.65, 0, 0.35, 1]);
    const tri = back.children.find((n) => n.name === 'Tri') as { children: { type: string; paths?: { points: unknown[] }[] }[] };
    expect(tri.children[0].type).toBe('path');
    expect(tri.children[0].paths![0].points).toHaveLength(3);
    // Background solid layer comes back as the bottom layer
    expect(back.children[0].name).toBe('Background');
  });
});

describe('Lottie gradient points', () => {
  const stops = [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }];
  it('exports exact points, and the corner to corner line of a box-relative gradient', () => {
    const p = createProject('G');
    const ab = createArtboard({ name: 'A', width: 300, height: 200 });
    const exact = createNode('rect', { name: 'Exact', x: 0, y: 0, width: 100, height: 50, fill: { type: 'linear', angle: 0, stops, from: { x: 10, y: 20 }, to: { x: 70, y: 40 } } });
    const radial = createNode('ellipse', { name: 'Radial', x: 0, y: 60, width: 100, height: 50, fill: { type: 'radial', stops, center: { x: 30, y: 25 }, radius: 18 } });
    const old = createNode('rect', { name: 'Old', x: 0, y: 120, width: 100, height: 50, fill: { type: 'linear', angle: 90, stops } });
    ab.children.push(exact, radial, old);
    p.artboards = [ab];
    const { json } = exportLottie(p, ab, { bytesFor: () => null });
    const gf = (name: string) => {
      const layer = (json.layers as { nm: string; shapes: { ty: string; it?: { ty: string; s?: { k: number[] }; e?: { k: number[] }; t?: number }[] }[] }[]).find((l) => l.nm === name)!;
      const find = (items: unknown[]): { s: { k: number[] }; e: { k: number[] }; t: number } | undefined => {
        for (const it of items as { ty: string; it?: unknown[] }[]) {
          if (it.ty === 'gf') return it as never;
          if (it.it) {
            const r = find(it.it);
            if (r) return r;
          }
        }
      };
      return find(layer.shapes)!;
    };
    expect(gf('Exact').s.k).toEqual([10, 20]);
    expect(gf('Exact').e.k).toEqual([70, 40]);
    expect(gf('Radial').t).toBe(2);
    expect(gf('Radial').s.k).toEqual([30, 25]);
    expect(gf('Radial').e.k).toEqual([48, 25]);
    // 90deg on 100x50 runs left middle to right middle
    expect(gf('Old').s.k.map(Math.round)).toEqual([0, 25]);
    expect(gf('Old').e.k.map(Math.round)).toEqual([100, 25]);
  });

  it('imports the points into the layer box', () => {
    const lottie = {
      v: '5.7.4', fr: 30, ip: 0, op: 30, w: 200, h: 100, nm: 'G', ddd: 0, assets: [],
      layers: [{
        ty: 4, ind: 1, nm: 'Grad', ip: 0, op: 30, st: 0, ks: {},
        shapes: [{
          ty: 'gr', nm: 'G', it: [
            { ty: 'rc', p: { a: 0, k: [100, 50] }, s: { a: 0, k: [80, 40] }, r: { a: 0, k: 0 } },
            { ty: 'gf', t: 1, s: { a: 0, k: [60, 30] }, e: { a: 0, k: [140, 30] }, g: { p: 2, k: { a: 0, k: [0, 1, 0, 0, 1, 0, 0, 1] } }, o: { a: 0, k: 100 } },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
        }],
      }],
    };
    const { artboard } = importLottie(lottie);
    let rect: { fill: { from: unknown; to: unknown } } | undefined;
    const rec = (nodes: { type: string; children?: unknown[] }[]) => nodes.forEach((n) => (n.type === 'rect' ? (rect = n as never) : n.children && rec(n.children as never)));
    rec(artboard.children as never);
    // The rectangle's box starts at (60,30), where the gradient starts
    expect(rect!.fill.from).toEqual({ x: 0, y: 0 });
    expect(rect!.fill.to).toEqual({ x: 80, y: 0 });
  });
});
