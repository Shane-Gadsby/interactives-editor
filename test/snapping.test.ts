//The snap candidates for each target, which one wins, and the switches that turn them on
import { beforeEach, describe, expect, it } from 'vitest';
import { createArtboard, createNode } from 'interactives-player';
import { prefs, setPrefs } from '../src/lib/prefs';
import { SNAP_ITEMS, SNAP_NONE, buildTargets, pixelRound, snapAny, snapArtboardBox, snapFor, snapMoveBox, snapPointer, snapSettings, solveAxis, toggleSnap, type SnapSettings } from '../src/lib/snapping';

const ALL: SnapSettings = { on: true, grid: true, artboard: true, layers: true, layersAll: true, guides: true, spacing: true, pixels: true, points: true, distance: 6 };
const only = (k: keyof SnapSettings): SnapSettings => ({ ...SNAP_NONE, on: true, [k]: true, distance: 6 });
const rect = (name: string, x: number, y: number, width: number, height: number) => createNode('rect', { name, x, y, width, height } as never);

function board() {
  const ab = createArtboard({ name: 'A', width: 800, height: 600 });
  ab.guides = { x: [250], y: [420] };
  const a = rect('a', 100, 100, 100, 50);
  const b = rect('b', 400, 300, 100, 50);
  const g = createNode('group', { name: 'g', x: 600, y: 10, width: 100, height: 100, children: [rect('inner', 10, 10, 20, 20)] } as never);
  const path = createNode('path', { name: 'p', x: 300, y: 450, width: 60, height: 40, paths: [{ closed: false, points: [{ x: 0, y: 0 }, { x: 60, y: 40 }] }] } as never);
  ab.children.push(a, b, g, path);
  return { ab, a, b, g, path };
}

beforeEach(() => setPrefs({ snapOn: true, snapGrid: false, snapArtboard: true, snapLayers: true, snapLayersAll: false, snapGuides: true, snapSpacing: false, snapPixels: true, snapPoints: false, snapDistance: 6 }));

describe('the switches', () => {
  it('start with Artboard, Layers, Guides and Pixels on and the rest off', () => {
    const s = snapSettings();
    expect(s).toMatchObject({ on: true, artboard: true, layers: true, guides: true, pixels: true, grid: false, spacing: false, points: false, layersAll: false, distance: 6 });
  });

  it('a master switch turns every target off and keeps the choices, and Ctrl skips the lot for one drag', () => {
    setPrefs({ snapOn: false });
    expect(snapSettings()).toMatchObject({ on: false, artboard: false, layers: false, guides: false, pixels: false });
    expect(snapAny(snapSettings())).toBe(false);
    expect(prefs().snapArtboard).toBe(true);
    setPrefs({ snapOn: true });
    expect(snapAny(snapFor({ ctrlKey: false, metaKey: false }))).toBe(true);
    expect(snapAny(snapFor({ ctrlKey: true, metaKey: false }))).toBe(false);
    expect(snapAny(snapFor({ ctrlKey: false, metaKey: true }))).toBe(false);
  });

  it('turning a target on while snapping is off switches snapping on, turning one off does not', () => {
    setPrefs({ snapOn: false, snapGrid: false });
    toggleSnap('grid');
    expect(prefs()).toMatchObject({ snapGrid: true, snapOn: true });
    toggleSnap('artboard');
    expect(prefs()).toMatchObject({ snapArtboard: false, snapOn: true });
    toggleSnap('on');
    expect(prefs().snapOn).toBe(false);
    toggleSnap('layersAll');
    expect(prefs().snapLayersAll).toBe(true);
  });

  it('lists seven targets in the order of the menu, each with its own preference', () => {
    expect(SNAP_ITEMS.map((i) => i.kind)).toEqual(['grid', 'artboard', 'layers', 'guides', 'spacing', 'pixels', 'points']);
    expect(new Set(SNAP_ITEMS.map((i) => i.pref)).size).toBe(7);
  });

  it('whole pixels round, and with Pixels off a position can sit between pixels', () => {
    expect(pixelRound(only('pixels'))(10.6)).toBe(11);
    expect(pixelRound(SNAP_NONE)(10.666)).toBe(10.67);
  });
});

describe('candidates per target', () => {
  it('Artboard: its edges and centre, nothing else', () => {
    const { ab } = board();
    const t = buildTargets(ab, only('artboard'), new Set());
    expect(t.xs.map((x) => x.at)).toEqual([0, 400, 800]);
    expect(t.ys.map((y) => y.at)).toEqual([0, 300, 600]);
    expect(t.xs.every((x) => x.kind === 'artboard')).toBe(true);
    expect(t.rects).toEqual([]);
  });

  it('Guides: the project guides that fall on the page snap too, the others do not', () => {
    const { ab } = board();
    const t = buildTargets(ab, only('guides'), new Set(), null, { x: [100, 900], y: [300, -5] });
    expect(t.xs).toEqual([{ at: 250, kind: 'guides' }, { at: 100, kind: 'guides' }]);
    expect(t.ys).toEqual([{ at: 420, kind: 'guides' }, { at: 300, kind: 'guides' }]);
  });

  it('Guides: the ruler guides', () => {
    const { ab } = board();
    const t = buildTargets(ab, only('guides'), new Set());
    expect(t.xs).toEqual([{ at: 250, kind: 'guides' }]);
    expect(t.ys).toEqual([{ at: 420, kind: 'guides' }]);
  });

  it('Layers: edges and centres of the layers beside it, or every layer with the reach switch', () => {
    const { ab, a } = board();
    const beside = buildTargets(ab, { ...only('layers'), layersAll: false }, new Set([a.id]));
    expect(beside.xs.some((x) => x.at === 100)).toBe(false); // the dragged layer is not a target
    expect(beside.xs.some((x) => x.at === 450)).toBe(true); // b's centre
    expect(beside.xs.some((x) => x.at === 610)).toBe(false); // a layer inside a group is not beside it
    const all = buildTargets(ab, { ...only('layers'), layersAll: true }, new Set([a.id]));
    expect(all.xs.some((x) => x.at === 610 && x.kind === 'layers')).toBe(true);
  });

  it('Layers: siblings are the ones in the same parent', () => {
    const { ab, g } = board();
    const inner = (g as unknown as { children: { id: string }[] }).children[0];
    const t = buildTargets(ab, { ...only('layers'), layersAll: false }, new Set([inner.id]), g.id);
    //alone in its group: nothing beside it
    expect(t.xs).toEqual([]);
  });

  it('Points: path anchors and bone joints, in artboard space', () => {
    const { ab, path } = board();
    const t = buildTargets(ab, only('points'), new Set());
    expect(t.points).toEqual(expect.arrayContaining([{ x: 300, y: 450 }, { x: 360, y: 490 }]));
    expect(buildTargets(ab, only('points'), new Set([path.id])).points).toEqual([]);
    expect(buildTargets(ab, only('artboard'), new Set()).points).toEqual([]);
  });

  it('nothing is offered with snapping off', () => {
    const { ab } = board();
    const t = buildTargets(ab, { ...ALL, on: false }, new Set());
    expect(t.xs).toEqual([]);
    expect(t.rects).toEqual([]);
  });
});

describe('which candidate wins', () => {
  it('the nearest inside the distance, whichever target it came from', () => {
    const r = solveAxis([100], [{ at: 104, kind: 'layers' }, { at: 102, kind: 'guides' }, { at: 95, kind: 'artboard' }], 6, null);
    expect(r).toEqual({ d: 2, hit: { at: 102, kind: 'guides' } });
  });

  it('nothing outside the distance, and a target is as good for any of the box\'s edges', () => {
    expect(solveAxis([100], [{ at: 108, kind: 'layers' }], 6, null)).toEqual({ d: 0, hit: null });
    expect(solveAxis([100, 150, 200], [{ at: 203, kind: 'artboard' }], 6, null)).toEqual({ d: 3, hit: { at: 203, kind: 'artboard' } });
  });

  it('the grid takes it when nothing is as close, and a target that ties with it wins', () => {
    expect(solveAxis([83], [], 6, 8)).toEqual({ d: -3, hit: { at: 80, kind: 'grid' } });
    //3 to the grid line, 3 to the layer: a tie goes to the layer
    const tie = solveAxis([83], [{ at: 86, kind: 'layers' }], 6, 8);
    expect(tie).toEqual({ d: 3, hit: { at: 86, kind: 'layers' } });
    //the grid line is closer than the layer
    expect(solveAxis([83], [{ at: 90, kind: 'layers' }], 8, 8).hit?.kind).toBe('grid');
    expect(solveAxis([83], [{ at: 85, kind: 'layers' }], 6, 8).hit?.kind).toBe('layers');
  });

  it('a moved box snaps its left edge, centre or right edge, per axis', () => {
    const { ab, a } = board();
    const set = buildTargets(ab, only('artboard'), new Set([a.id]));
    //a is at 100,100 100x50; move it so its right edge is 3 short of the artboard's centre line (400)
    const r = snapMoveBox(set, only('artboard'), { x: 100, y: 100, width: 100, height: 50 }, 197, 0, 1, null);
    expect(r.dx).toBe(3); // right edge 397 -> 400
    expect(r.x).toEqual([{ at: 400, kind: 'artboard' }]);
  });

  it('each target on its own only snaps to its own lines', () => {
    const { ab, a } = board();
    const box = { x: 100, y: 100, width: 20, height: 50 };
    const near = (s: SnapSettings, dx: number) => snapMoveBox(buildTargets(ab, s, new Set([a.id])), s, box, dx, 0, 1, null);
    //left edge at 248: the guide at 250 is 2 away, and nothing else is near
    expect(near(only('guides'), 148).dx).toBe(2);
    expect(near(only('artboard'), 148).dx).toBe(0);
    expect(near(only('layers'), 148).dx).toBe(0);
    //right edge at 398: 2 off b's left edge (400), which is a Layers line and also the Artboard's centre
    expect(near(only('layers'), 278).dx).toBe(2);
    expect(near(only('guides'), 278).dx).toBe(0);
  });

  it('the distance is in screen pixels, so zooming in makes it finer', () => {
    const set = { xs: [{ at: 100, kind: 'layers' as const }], ys: [], rects: [], points: [] };
    const box = { x: 94, y: 0, width: 0, height: 10 };
    expect(snapMoveBox(set, only('layers'), box, 0, 0, 1, null).dx).toBe(6);
    expect(snapMoveBox(set, only('layers'), box, 0, 0, 4, null).dx).toBe(0); // 6px at 4x is 1.5 artboard px
  });
});

describe('Spacing', () => {
  const others = [
    { x: 0, y: 100, width: 100, height: 50 },
    { x: 200, y: 100, width: 100, height: 50 },
  ];
  const set = { xs: [], ys: [], rects: others, points: [] };

  it('puts a box the same gap after the last one, and says the gaps', () => {
    const r = snapMoveBox(set, only('spacing'), { x: 395, y: 100, width: 100, height: 50 }, 0, 0, 1, null);
    expect(r.dx).toBe(5); // gap 100 between the two, so the third sits at 400
    expect(r.gaps.map((g) => g.label)).toEqual([100, 100]);
    expect(r.x).toEqual([]);
  });

  it('centres a box between two with the same gap each side', () => {
    const wide = [others[0], { x: 400, y: 100, width: 100, height: 50 }];
    const r = snapMoveBox({ ...set, rects: wide }, only('spacing'), { x: 197, y: 100, width: 100, height: 50 }, 0, 0, 1, null);
    expect(r.dx).toBe(3); // 100 + (300 - 100) / 2 = 200
    expect(r.gaps.map((g) => g.label)).toEqual([100, 100]);
  });

  it('only counts layers on the same row, and does nothing with Spacing off', () => {
    const r = snapMoveBox(set, only('spacing'), { x: 395, y: 400, width: 100, height: 50 }, 0, 0, 1, null);
    expect(r.dx).toBe(0);
    expect(r.gaps).toEqual([]);
    expect(snapMoveBox(set, SNAP_NONE, { x: 395, y: 100, width: 100, height: 50 }, 0, 0, 1, null).dx).toBe(0);
  });

  it('works down a column the same way', () => {
    const col = [
      { x: 100, y: 0, width: 50, height: 100 },
      { x: 100, y: 200, width: 50, height: 100 },
    ];
    const r = snapMoveBox({ ...set, rects: col }, only('spacing'), { x: 100, y: 396, width: 50, height: 100 }, 0, 0, 1, null);
    expect(r.dy).toBe(4);
    expect(r.gaps[0].axis).toBe('y');
  });
});

describe('a pointer position (resize, draw, pen)', () => {
  const set = { xs: [{ at: 100, kind: 'guides' as const }], ys: [{ at: 50, kind: 'layers' as const }], rects: [], points: [{ x: 300, y: 300 }] };

  it('lands on the line each axis is near, and on the grid when nothing else is', () => {
    const r = snapPointer(set, { ...ALL, points: false, grid: true }, { x: 101, y: 80 }, 1, 8);
    expect(r.p).toEqual({ x: 100, y: 80 });
    expect(r.x[0].kind).toBe('guides');
    expect(r.y[0].kind).toBe('grid');
  });

  it('a point takes both coordinates, but only with Points on', () => {
    const on = snapPointer(set, only('points'), { x: 303, y: 297 }, 1, null);
    expect(on).toMatchObject({ p: { x: 300, y: 300 }, point: true });
    const off = snapPointer(set, { ...only('guides'), points: false }, { x: 303, y: 297 }, 1, null);
    expect(off.point).toBe(false);
    expect(off.p).toEqual({ x: 303, y: 297 });
  });

  it('moves nothing with snapping off', () => {
    const r = snapPointer(set, SNAP_NONE, { x: 103, y: 52 }, 1, null);
    expect(r.p).toEqual({ x: 103, y: 52 });
  });
});

describe('artboards on the canvas', () => {
  it('an artboard dragged beside another goes to its edge, and the Artboard target is what does it', () => {
    const others = [{ x: 0, y: 0, width: 800, height: 600 }];
    const box = { x: 900, y: 10, width: 400, height: 300 };
    const r = snapArtboardBox(others, only('artboard'), box, -96, 0, 1, null);
    expect(r.dx).toBe(-4); // 804 -> 800, the neighbour's right edge
    expect(snapArtboardBox(others, only('layers'), box, -96, 0, 1, null).dx).toBe(0);
  });
});
