import { describe, expect, it } from 'vitest';
import { createNode, createProject, pathPointProp, sampleArtboard, type PathNode, type Project, type SubPath } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { bendPaths, bendSegment, insertPoint, nearestOnSegment, nearestSegment, pointOnSegment, posedPaths, shapeToPaths, splitSegment } from '../src/lib/path-edit';
import { trackRows } from '../src/panels/Timeline';

function setup(paths?: SubPath[]) {
  const p: Project = createProject('M');
  const path = createNode('path', {
    name: 'Blob',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    paths: paths ?? [{ closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }],
  }) as PathNode;
  p.artboards[0].children.push(path);
  const s = new EditorStore(p);
  return { s, path };
}

/** A timeline open with recording on and the playhead at t. */
function record(s: EditorStore, t: number) {
  if (!s.get().activeTimelineId) s.addTimeline();
  s.set({ recording: true, playhead: t, bottomTab: 'timeline' });
}
const node = (s: EditorStore, id: string) => s.artboard()!.children.find((n) => n.id === id) as PathNode;
const tracks = (s: EditorStore, id: string) => s.timeline()!.tracks.filter((t) => t.nodeId === id);
const track = (s: EditorStore, id: string, prop: string) => tracks(s, id).find((t) => t.prop === prop);
const clone = <T>(x: T): T => structuredClone(x);

describe('recording point edits', () => {
  it('keys a moved point (x and y) at the playhead and leaves the layer own points alone', () => {
    const { s, path } = setup();
    record(s, 500);
    const from = clone(node(s, path.id).paths);
    const moved = clone(from);
    moved[0].points[2].x = 120;
    moved[0].points[2].y = 90;
    s.setPathPoints(path.id, moved, { from, coalesce: 'path-edit' });
    expect(node(s, path.id).paths[0].points[2]).toMatchObject({ x: 100, y: 100 });
    expect(tracks(s, path.id).map((t) => t.prop).sort()).toEqual(['paths.0.points.2.x', 'paths.0.points.2.y']);
    expect(track(s, path.id, 'paths.0.points.2.x')!.keys).toMatchObject([{ t: 500, value: 120 }]);
    // dragging on updates the same key
    moved[0].points[2].x = 130;
    s.setPathPoints(path.id, moved, { from, coalesce: 'path-edit' });
    expect(track(s, path.id, 'paths.0.points.2.x')!.keys).toHaveLength(1);
    expect(track(s, path.id, 'paths.0.points.2.x')!.keys[0].value).toBe(130);
    s.undo();
    expect(tracks(s, path.id)).toHaveLength(0);
  });

  it('writes the points themselves when not recording', () => {
    const { s, path } = setup();
    s.addTimeline();
    s.set({ recording: false, bottomTab: 'timeline' });
    const from = clone(node(s, path.id).paths);
    const moved = clone(from);
    moved[0].points[0].x = 7;
    s.setPathPoints(path.id, moved, { from });
    expect(node(s, path.id).paths[0].points[0].x).toBe(7);
    expect(tracks(s, path.id)).toHaveLength(0);
  });

  it('keys both numbers of a handle, and a new handle is zero at the keys the points already have', () => {
    const { s, path } = setup();
    record(s, 0);
    s.keyShape(path.id);
    // 4 points x 2 numbers: corner points have no handles to key
    expect(tracks(s, path.id)).toHaveLength(8);
    s.set({ playhead: 1000 });
    const from = clone(node(s, path.id).paths);
    const next = clone(from);
    next[0].points[1].out = { x: 30, y: 0 };
    s.setPathPoints(path.id, next, { from });
    const ox = track(s, path.id, 'paths.0.points.1.out.x')!;
    const oy = track(s, path.id, 'paths.0.points.1.out.y')!;
    expect(ox.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [1000, 30]]);
    expect(oy.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [1000, 0]]);
    // so the frame at 0 stays straight and halfway is halfway
    const tl = s.timeline()!;
    expect(posedPaths(tl, node(s, path.id), 0)[0].points[1].out).toEqual({ x: 0, y: 0 });
    expect(posedPaths(tl, node(s, path.id), 500)[0].points[1].out).toEqual({ x: 15, y: 0 });
  });
});

describe('Key shape', () => {
  it('keys every point at the playhead; key, move the playhead, edit while recording gives a morph', () => {
    const { s, path } = setup();
    s.addTimeline();
    s.set({ bottomTab: 'timeline', playhead: 0, recording: false });
    s.keyShape(path.id);
    expect(tracks(s, path.id)).toHaveLength(8);
    expect(track(s, path.id, 'paths.0.points.3.y')!.keys).toMatchObject([{ t: 0, value: 100 }]);
    s.set({ recording: true, playhead: 1000 });
    const from = posedPaths(s.timeline()!, node(s, path.id), 1000);
    const next = clone(from);
    next[0].points[2] = { ...next[0].points[2], x: 150, y: 150 };
    s.setPathPoints(path.id, next, { from });
    const frame = (t: number) => (sampleArtboard(s.artboard()!.children, s.timeline()!, t)[0] as PathNode).paths[0].points[2];
    expect(frame(0)).toMatchObject({ x: 100, y: 100 });
    expect(frame(500)).toMatchObject({ x: 125, y: 125 });
    expect(frame(1000)).toMatchObject({ x: 150, y: 150 });
    // keying again at the same time replaces rather than duplicates
    s.keyShape(path.id);
    expect(track(s, path.id, 'paths.0.points.2.x')!.keys).toHaveLength(2);
  });

  it('keys the shape as shown at the playhead (not the layer own points)', () => {
    const { s, path } = setup();
    s.addTimeline();
    s.set({ bottomTab: 'timeline', playhead: 0 });
    s.keyShape(path.id);
    s.set({ recording: true, playhead: 1000 });
    const from = posedPaths(s.timeline()!, node(s, path.id), 1000);
    const next = clone(from);
    next[0].points[0].x = -40;
    s.setPathPoints(path.id, next, { from });
    s.set({ recording: false, playhead: 500 });
    s.keyShape(path.id);
    expect(track(s, path.id, 'paths.0.points.0.x')!.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [500, -20], [1000, -40]]);
  });
});

describe('bend math', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 100, y: 0 };

  it('makes a straight segment a curve that passes under the pointer', () => {
    for (const t of [0.25, 0.5, 0.7]) {
      const grab = pointOnSegment(a, b, t);
      const delta = { x: 0, y: -30 };
      const h = bendSegment(a, b, t, delta);
      const curved = pointOnSegment({ ...a, out: h.out }, { ...b, in: h.in }, t);
      expect(curved.x).toBeCloseTo(grab.x + delta.x, 1);
      expect(curved.y).toBeCloseTo(grab.y + delta.y, 1);
    }
  });

  it('bends an already curved segment by the same amount', () => {
    const pa = { x: 0, y: 0, out: { x: 20, y: 40 } };
    const pb = { x: 100, y: 0, in: { x: -20, y: 40 } };
    const t = 0.5;
    const grab = pointOnSegment(pa, pb, t);
    const h = bendSegment(pa, pb, t, { x: 10, y: -25 });
    const after = pointOnSegment({ ...pa, out: h.out }, { ...pb, in: h.in }, t);
    expect(after.x).toBeCloseTo(grab.x + 10, 1);
    expect(after.y).toBeCloseTo(grab.y - 25, 1);
  });

  it('Alt bends only the near side: the far handle stays', () => {
    const near = bendSegment(a, b, 0.3, { x: 0, y: -20 }, true);
    expect(near.in).toEqual({ x: 0, y: 0 });
    expect(near.out.y).toBeLessThan(0);
    const far = bendSegment(a, b, 0.8, { x: 0, y: -20 }, true);
    expect(far.out).toEqual({ x: 0, y: 0 });
    expect(far.in.y).toBeLessThan(0);
    // and it still passes under the pointer
    const c = pointOnSegment({ ...a, out: near.out }, { ...b, in: near.in }, 0.3);
    expect(c.y).toBeCloseTo(-20, 1);
  });

  it('bends a segment of a path, wrapping on the closing segment', () => {
    const paths: SubPath[] = [{ closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] }];
    const out = bendPaths(paths, 0, 3, 0.5, { x: -30, y: 0 });
    expect(out[0].points[3].out!.x).toBeLessThan(0);
    expect(out[0].points[0].in!.x).toBeLessThan(0);
    expect(paths[0].points[3].out).toBeUndefined();
  });

  it('finds the segment under a point', () => {
    const paths: SubPath[] = [{ closed: false, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }];
    const h = nearestSegment(paths, { x: 60, y: 3 }, 8)!;
    expect(h).toMatchObject({ si: 0, i: 0 });
    expect(h.point.x).toBeCloseTo(60, 3);
    expect(h.point.y).toBeCloseTo(0, 3);
    expect(nearestSegment(paths, { x: 50, y: 50 }, 8)).toBeNull();
    expect(nearestOnSegment(a, b, { x: 30, y: 10 }).dist).toBeCloseTo(10, 3);
  });

  it('gives a rect, ellipse, polygon or star as points', () => {
    expect(shapeToPaths(createNode('rect', { width: 40, height: 20 }))![0].points).toHaveLength(4);
    expect(shapeToPaths(createNode('rect', { width: 40, height: 20, cornerRadius: 5 }))![0].points).toHaveLength(8);
    expect(shapeToPaths(createNode('ellipse', { width: 40, height: 20 }))![0].points).toHaveLength(4);
    expect(shapeToPaths(createNode('polygon', { width: 40, height: 40, sides: 5 }))![0].points).toHaveLength(5);
    expect(shapeToPaths(createNode('star', { width: 40, height: 40, points: 5, innerRatio: 0.5 }))![0].points).toHaveLength(10);
    expect(shapeToPaths(createNode('text'))).toBeNull();
  });

  it('turns a shape into a path in place, keeping its id, style and place', () => {
    const p: Project = createProject('C');
    const r = createNode('rect', { name: 'R', x: 30, y: 40, width: 80, height: 40, cornerRadius: 6, fill: { type: 'solid', color: '#ff0000' } });
    p.artboards[0].children.push(r);
    const s = new EditorStore(p);
    expect(s.convertToPath(r.id)).toBe(true);
    const n = s.artboard()!.children[0] as PathNode;
    expect(n).toMatchObject({ id: r.id, type: 'path', x: 30, y: 40, width: 80, height: 40, fill: { color: '#ff0000' } });
    expect('cornerRadius' in n).toBe(false);
    expect(n.paths[0].closed).toBe(true);
    expect(s.convertToPath(r.id)).toBe(false);
  });
});

describe('adding and removing points with shape keys', () => {
  /** A path keyed at 0 and 1000, with point 2 moved in the second key and a curve on point 1 */
  function keyed() {
    const { s, path } = setup([{ closed: true, points: [{ x: 0, y: 0 }, { x: 100, y: 0, out: { x: 0, y: 30 }, in: { x: 0, y: -30 } }, { x: 100, y: 100 }, { x: 0, y: 100 }] }]);
    s.addTimeline();
    s.set({ bottomTab: 'timeline', playhead: 0, recording: false });
    s.keyShape(path.id);
    s.set({ recording: true, playhead: 1000 });
    const from = posedPaths(s.timeline()!, node(s, path.id), 1000);
    const next = clone(from);
    next[0].points[2] = { x: 160, y: 100 };
    next[0].points[0] = { x: 0, y: -20 };
    s.setPathPoints(path.id, next, { from });
    s.set({ recording: false, playhead: 0 });
    return { s, path };
  }
  const valid = (s: EditorStore, id: string) => {
    const n = node(s, id);
    for (const tr of tracks(s, id)) {
      const pp = pathPointProp(tr.prop)!;
      expect(n.paths[pp.sub]?.points[pp.index], tr.prop).toBeTruthy();
    }
  };

  it('inserts a point: every key gets it, on the curve of that frame, and later points are renumbered', () => {
    const { s, path } = keyed();
    const tl = s.timeline()!;
    const old0 = posedPaths(tl, node(s, path.id), 0)[0].points;
    const old1 = posedPaths(tl, node(s, path.id), 1000)[0].points;
    // between point 1 and point 2, a third of the way along
    s.insertPathPoint(path.id, 0, 1, 0.3);
    const n = node(s, path.id);
    expect(n.paths[0].points).toHaveLength(5);
    valid(s, path.id);
    const tl2 = s.timeline()!;
    for (const [t, old] of [[0, old0], [1000, old1]] as const) {
      const pts = posedPaths(tl2, n, t)[0].points;
      expect(pts).toHaveLength(5);
      const expected = pointOnSegment(old[1], old[2], 0.3);
      expect(pts[2].x).toBeCloseTo(expected.x, 1);
      expect(pts[2].y).toBeCloseTo(expected.y, 1);
      // the old point 2 is now 3, the others stay put
      expect(pts[3]).toMatchObject({ x: old[2].x, y: old[2].y });
      expect(pts[4]).toMatchObject({ x: old[3].x, y: old[3].y });
      expect(pts[0]).toMatchObject({ x: old[0].x, y: old[0].y });
      // the outline between 1 and 3 is unchanged: the new point is on the old curve and halves join up
      const mid = pointOnSegment(pts[1], pts[2], 0.5);
      const whole = pointOnSegment(old[1], old[2], 0.15);
      expect(mid.x).toBeCloseTo(whole.x, 0);
      expect(mid.y).toBeCloseTo(whole.y, 0);
    }
    // and the new point moves with the morph: halfway between the frames
    const half = posedPaths(tl2, n, 500)[0].points;
    expect(half[3].x).toBeCloseTo(130, 5);
    // the new point is keyed at every key time of the shape
    for (const tr of tracks(s, path.id).filter((t) => t.prop.startsWith('paths.0.points.2.'))) expect(tr.keys.map((k) => k.t)).toEqual([0, 1000]);
  });

  it('inserts on the closing segment (the point goes at the end)', () => {
    const { s, path } = keyed();
    s.insertPathPoint(path.id, 0, 3, 0.5);
    expect(node(s, path.id).paths[0].points).toHaveLength(5);
    valid(s, path.id);
    const pts = posedPaths(s.timeline()!, node(s, path.id), 1000)[0].points;
    expect(pts[4].x).toBeCloseTo(0, 5);
    expect(pts[4].y).toBeCloseTo(40, 5);
  });

  it('adding a point to a path with no keys is the plain edit', () => {
    const { s, path } = setup();
    s.insertPathPoint(path.id, 0, 0, 0.5);
    expect(node(s, path.id).paths[0].points[1]).toMatchObject({ x: 50, y: 0 });
  });

  it('removes a point: its keys go, later points are renumbered, other frames stay valid', () => {
    const { s, path } = keyed();
    const old1 = posedPaths(s.timeline()!, node(s, path.id), 1000)[0].points;
    expect(s.removePathPoint(path.id, 0, 1)).toBe(true);
    const n = node(s, path.id);
    expect(n.paths[0].points).toHaveLength(3);
    valid(s, path.id);
    expect(tracks(s, path.id).some((t) => t.prop.startsWith('paths.0.points.3.'))).toBe(false);
    const pts = posedPaths(s.timeline()!, n, 1000)[0].points;
    expect(pts[1]).toMatchObject({ x: old1[2].x, y: old1[2].y });
    expect(pts[2]).toMatchObject({ x: old1[3].x, y: old1[3].y });
    expect(pts[0]).toMatchObject({ x: old1[0].x, y: old1[0].y });
  });

  it('keeps other timelines valid too, and removing down to nothing says so', () => {
    const { s, path } = keyed();
    // a second timeline keyed on the same path
    s.addTimeline();
    s.set({ playhead: 200, bottomTab: 'timeline', recording: false });
    s.keyShape(path.id);
    s.insertPathPoint(path.id, 0, 0, 0.5);
    valid(s, path.id);
    for (const tl of s.artboard()!.timelines) expect(tl.tracks.filter((t) => t.nodeId === path.id).every((t) => pathPointProp(t.prop)!.index < 5)).toBe(true);
    const second = s.artboard()!.timelines[1];
    expect(posedPaths(second, node(s, path.id), 200)[0].points).toHaveLength(5);
    s.removePathPoint(path.id, 0, 4);
    s.removePathPoint(path.id, 0, 3);
    s.removePathPoint(path.id, 0, 2);
    expect(node(s, path.id).paths[0].points).toHaveLength(2);
    expect(s.removePathPoint(path.id, 0, 1)).toBe(false);
  });
});

describe('splitting a curve', () => {
  it('keeps the outline: the halves are the same curve', () => {
    const a = { x: 0, y: 0, out: { x: 10, y: 50 } };
    const b = { x: 100, y: 20, in: { x: -30, y: 40 } };
    const sp = splitSegment(a, b, 0.4);
    const orig = pointOnSegment(a, b, 0.2);
    const left = pointOnSegment(sp.a, sp.mid, 0.5);
    expect(left.x).toBeCloseTo(orig.x, 1);
    expect(left.y).toBeCloseTo(orig.y, 1);
    const orig2 = pointOnSegment(a, b, 0.7);
    const right = pointOnSegment(sp.mid, sp.b, 0.5);
    expect(right.x).toBeCloseTo(orig2.x, 1);
    expect(right.y).toBeCloseTo(orig2.y, 1);
  });

  it('a straight segment stays straight', () => {
    const sp = insertPoint([{ closed: false, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], 0, 0, 0.5)[0].points;
    expect(sp).toEqual([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }]);
  });
});

describe('timeline grouping', () => {
  it('lists a path layer keys by point, with the numbers under it', () => {
    const { s, path } = setup();
    s.addTimeline();
    s.set({ bottomTab: 'timeline' });
    s.keyCurrent(path.id, 'opacity');
    s.keyShape(path.id);
    const rows = trackRows(path.id, tracks(s, path.id), {});
    expect(rows[0]).toMatchObject({ kind: 'track' });
    const heads = rows.filter((r) => r.kind === 'point');
    expect(heads.map((h) => (h as { label: string }).label)).toEqual(['Shape: point 1', 'Shape: point 2', 'Shape: point 3', 'Shape: point 4']);
    expect(rows).toHaveLength(1 + 4 + 8);
    // folded by hand: the numbers are hidden
    const key = (heads[0] as { key: string }).key;
    expect(trackRows(path.id, tracks(s, path.id), { [key]: false })).toHaveLength(1 + 4 + 6);
  });
});
