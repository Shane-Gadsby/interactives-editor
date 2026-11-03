import { pathPointProp, pathPointPropName, polygonPoints, sampleKeys, setPath, starPoints, type PathPoint, type PathPointProp, type SceneNode, type SubPath, type Timeline } from 'interactives-player';

/**
 * Geometry for editing path points: bending a segment, splitting it to add a point, finding the segment under a
 * pointer, outlines of the box shapes, and keeping shape keys (tracks on `paths.S.points.I.*`) in step with
 * structural edits.
 */

type Pt = { x: number; y: number };

/** Kappa: handle length for a quarter circle */
const K = 0.5522847498;

// ---------------------------------------------------------------- segments

/** The four control points of the segment from point a to point b (handles made absolute). */
export function segmentControls(a: PathPoint, b: PathPoint): [Pt, Pt, Pt, Pt] {
  return [
    { x: a.x, y: a.y },
    { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) },
    { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) },
    { x: b.x, y: b.y },
  ];
}

/** The point at parameter t (0..1) of the segment from a to b. */
export function pointOnSegment(a: PathPoint, b: PathPoint, t: number): Pt {
  const [p0, p1, p2, p3] = segmentControls(a, b);
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** The segment's nearest point to p: its parameter, where it is and how far away. */
export function nearestOnSegment(a: PathPoint, b: PathPoint, p: Pt): { t: number; dist: number; point: Pt } {
  const STEPS = 32;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= STEPS; i++) {
    const q = pointOnSegment(a, b, i / STEPS);
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i / STEPS;
    }
  }
  // refine around the best sample
  let lo = Math.max(0, best - 1 / STEPS);
  let hi = Math.min(1, best + 1 / STEPS);
  for (let i = 0; i < 24; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const q1 = pointOnSegment(a, b, m1);
    const q2 = pointOnSegment(a, b, m2);
    if ((q1.x - p.x) ** 2 + (q1.y - p.y) ** 2 < (q2.x - p.x) ** 2 + (q2.y - p.y) ** 2) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = pointOnSegment(a, b, t);
  return { t, point, dist: Math.hypot(point.x - p.x, point.y - p.y) };
}

export interface SegmentHit {
  /** Sub-path index. */
  si: number;
  /** Segment index: from point `i` to point `i + 1` (wrapping when the sub-path is closed). */
  i: number;
  t: number;
  dist: number;
  point: Pt;
}

/** The segment of any sub-path nearest to p, if it is within `tolerance`. */
export function nearestSegment(paths: SubPath[], p: Pt, tolerance: number): SegmentHit | null {
  let best: SegmentHit | null = null;
  paths.forEach((sp, si) => {
    const n = sp.points.length;
    const segs = sp.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const h = nearestOnSegment(sp.points[i], sp.points[(i + 1) % n], p);
      if (h.dist <= tolerance && (!best || h.dist < best.dist)) best = { si, i, ...h };
    }
  });
  return best;
}

// ---------------------------------------------------------------- bend

/**
 * Bend the segment from a to b so that the point at parameter t moves by `delta` (the curve then passes under the
 * pointer that grabbed it at t and moved by delta). Both handles move by the same amount; with `oneSide` only the
 * handle on the nearer end does, which bends that half and leaves the far end alone. Handles stay relative to
 * their points. Starting from a straight segment (no handles) this makes it a curve.
 */
export function bendSegment(a: PathPoint, b: PathPoint, t: number, delta: Pt, oneSide = false): { out: Pt; in: Pt } {
  const tt = Math.min(0.9, Math.max(0.1, t));
  const u = 1 - tt;
  const out = { x: a.out?.x ?? 0, y: a.out?.y ?? 0 };
  const inn = { x: b.in?.x ?? 0, y: b.in?.y ?? 0 };
  if (!oneSide) {
    // the curve at t moves by 3t(1-t) times what the two handles move by
    const k = 1 / (3 * tt * u);
    out.x += delta.x * k;
    out.y += delta.y * k;
    inn.x += delta.x * k;
    inn.y += delta.y * k;
  } else if (tt <= 0.5) {
    const k = 1 / (3 * u * u * tt);
    out.x += delta.x * k;
    out.y += delta.y * k;
  } else {
    const k = 1 / (3 * u * tt * tt);
    inn.x += delta.x * k;
    inn.y += delta.y * k;
  }
  return { out: roundPt(out), in: roundPt(inn) };
}

/** A copy of the sub-paths with segment `i` of sub-path `si` bent (see `bendSegment`). */
export function bendPaths(paths: SubPath[], si: number, i: number, t: number, delta: Pt, oneSide = false): SubPath[] {
  const next = structuredClone(paths);
  const pts = next[si]?.points;
  if (!pts) return next;
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  const h = bendSegment(a, b, t, delta, oneSide);
  a.out = h.out;
  b.in = h.in;
  return next;
}

// ---------------------------------------------------------------- split / add a point

/**
 * Split the segment from a to b at t (de Casteljau). The new point sits on the curve and the two halves together are
 * the same curve as before; `a` and `b` get their handles shortened to match.
 */
export function splitSegment(a: PathPoint, b: PathPoint, t: number): { a: PathPoint; mid: PathPoint; b: PathPoint } {
  const [p0, p1, p2, p3] = segmentControls(a, b);
  const lerp = (p: Pt, q: Pt): Pt => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const m = lerp(p012, p123);
  const straight = !a.out && !b.in;
  const rel = (c: Pt, o: Pt): Pt => roundPt({ x: c.x - o.x, y: c.y - o.y });
  const na: PathPoint = { ...a, ...(straight ? {} : { out: rel(p01, p0) }) };
  const nb: PathPoint = { ...b, ...(straight ? {} : { in: rel(p23, p3) }) };
  const mid: PathPoint = straight ? { x: round(m.x), y: round(m.y) } : { x: round(m.x), y: round(m.y), in: rel(p012, m), out: rel(p123, m) };
  return { a: na, mid, b: nb };
}

/** A copy of the sub-paths with a point added on segment `i` of sub-path `si`, at parameter t. */
export function insertPoint(paths: SubPath[], si: number, i: number, t: number): SubPath[] {
  const next = structuredClone(paths);
  const sp = next[si];
  if (!sp) return next;
  const n = sp.points.length;
  const j = (i + 1) % n;
  const s = splitSegment(sp.points[i], sp.points[j], t);
  sp.points[i] = s.a;
  sp.points[j] = s.b;
  // between i and i+1; on a closing segment (i = n-1) that is the end of the list
  sp.points.splice(i + 1, 0, s.mid);
  return next;
}

// ---------------------------------------------------------------- box shapes as paths

/** The outline of a rect, ellipse, polygon or star as path points (in the layer's own coordinates), or null for other layers. */
export function shapeToPaths(n: SceneNode): SubPath[] | null {
  const w = n.width;
  const h = n.height;
  switch (n.type) {
    case 'rect': {
      const r = Math.max(0, Math.min(n.cornerRadius, w / 2, h / 2));
      if (!r)
        return [
          {
            closed: true,
            points: [
              { x: 0, y: 0 },
              { x: w, y: 0 },
              { x: w, y: h },
              { x: 0, y: h },
            ],
          },
        ];
      const k = r * K;
      return [
        {
          closed: true,
          points: [
            { x: r, y: 0, in: { x: -k, y: 0 } },
            { x: w - r, y: 0, out: { x: k, y: 0 } },
            { x: w, y: r, in: { x: 0, y: -k } },
            { x: w, y: h - r, out: { x: 0, y: k } },
            { x: w - r, y: h, in: { x: k, y: 0 } },
            { x: r, y: h, out: { x: -k, y: 0 } },
            { x: 0, y: h - r, in: { x: 0, y: k } },
            { x: 0, y: r, out: { x: 0, y: -k } },
          ].map(roundPoint),
        },
      ];
    }
    case 'ellipse': {
      const rx = w / 2;
      const ry = h / 2;
      return [
        {
          closed: true,
          points: [
            { x: rx, y: 0, in: { x: -rx * K, y: 0 }, out: { x: rx * K, y: 0 } },
            { x: w, y: ry, in: { x: 0, y: -ry * K }, out: { x: 0, y: ry * K } },
            { x: rx, y: h, in: { x: rx * K, y: 0 }, out: { x: -rx * K, y: 0 } },
            { x: 0, y: ry, in: { x: 0, y: ry * K }, out: { x: 0, y: -ry * K } },
          ].map(roundPoint),
        },
      ];
    }
    case 'polygon':
      return [{ closed: true, points: polygonPoints(n.sides, w, h).map(roundPoint) }];
    case 'star':
      return [{ closed: true, points: starPoints(n.points, n.innerRatio, w, h).map(roundPoint) }];
    default:
      return null;
  }
}

// ---------------------------------------------------------------- shape keys

/** The tracks of one layer that key points of its paths. */
export function pointTracks(tl: Timeline, nodeId: string) {
  return tl.tracks.filter((t) => t.nodeId === nodeId && pathPointProp(t.prop));
}

/** Does any timeline of the artboard key points of this path layer? */
export function hasShapeKeys(timelines: Timeline[], nodeId: string): boolean {
  return timelines.some((tl) => pointTracks(tl, nodeId).length > 0);
}

/**
 * Re-number a layer's point tracks after points were added or removed: `map` gives a point's new place
 * (or null when it is gone, which drops its tracks).
 */
export function remapPointTracks(tl: Timeline, nodeId: string, map: (sub: number, index: number) => { sub: number; index: number } | null): void {
  const kept: Timeline['tracks'] = [];
  for (const tr of tl.tracks) {
    const pp = tr.nodeId === nodeId ? pathPointProp(tr.prop) : undefined;
    if (!pp) {
      kept.push(tr);
      continue;
    }
    const to = map(pp.sub, pp.index);
    if (!to) continue;
    tr.prop = pathPointPropName(to.sub, to.index, pp.part);
    kept.push(tr);
  }
  tl.tracks = kept;
}

/** A path layer's points in the frame of a timeline at time t (its own points where nothing is keyed). */
export function posedPaths(tl: Timeline, node: SceneNode, t: number): SubPath[] {
  const holder = { paths: structuredClone((node as { paths?: SubPath[] }).paths ?? []) } as Record<string, unknown>;
  for (const tr of pointTracks(tl, node.id)) {
    const v = tr.keys.length ? sampleKeys(tr.keys, t) : undefined;
    if (v !== undefined) setPath(holder, tr.prop, v);
  }
  return holder.paths as SubPath[];
}

/** Every key time used by a layer's point tracks in one sub-path. */
export function keyTimes(tl: Timeline, nodeId: string, sub: number): number[] {
  const times = new Set<number>();
  for (const tr of pointTracks(tl, nodeId)) if (pathPointProp(tr.prop)!.sub === sub) for (const k of tr.keys) times.add(k.t);
  return [...times].sort((a, b) => a - b);
}

/** The numbers of a point, by track part (a handle that isn't there is 0). */
export function pointParts(p: PathPoint): Record<PathPointProp['part'], number> {
  return { x: p.x, y: p.y, 'in.x': p.in?.x ?? 0, 'in.y': p.in?.y ?? 0, 'out.x': p.out?.x ?? 0, 'out.y': p.out?.y ?? 0 };
}

export const POINT_PARTS: PathPointProp['part'][] = ['x', 'y', 'in.x', 'in.y', 'out.x', 'out.y'];

// ---------------------------------------------------------------- helpers

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
function roundPt(p: Pt): Pt {
  return { x: round(p.x), y: round(p.y) };
}
function roundPoint(p: PathPoint): PathPoint {
  const out: PathPoint = { x: round(p.x), y: round(p.y) };
  if (p.in) out.in = roundPt(p.in);
  if (p.out) out.out = roundPt(p.out);
  return out;
}
