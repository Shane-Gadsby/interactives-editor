import type { PathPoint } from 'interactives-player';

type P = { x: number; y: number };

/** Ramer-Douglas-Peucker: drop points closer than `tol` to the line through their neighbours. */
export function simplify(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let max = 0;
    let idx = -1;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i].x - dx * pts[i].y + B.x * A.y - B.y * A.x) / len;
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * A freehand stroke as a smooth bezier path: simplify, then give each point handles
 * along the line between its neighbours (Catmull-Rom style). `smoothing` 0..1 sets how much is dropped.
 */
export function freehandToPath(raw: P[], smoothing = 0.5, closed = false): PathPoint[] {
  // Drop repeats so the simplifier sees real movement
  const pts: P[] = [];
  for (const p of raw) {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) pts.push(p);
  }
  if (pts.length < 2) return pts.map((p) => ({ x: p.x, y: p.y }));
  const s = simplify(pts, 0.5 + smoothing * 4);
  const n = s.length;
  const t = 1 / 6;
  return s.map((p, i) => {
    const prev = s[i - 1] ?? (closed ? s[n - 1] : null);
    const next = s[i + 1] ?? (closed ? s[0] : null);
    if (!prev || !next) {
      return { x: p.x, y: p.y, in: null, out: null };
    }
    const hx = (next.x - prev.x) * t;
    const hy = (next.y - prev.y) * t;
    return { x: p.x, y: p.y, in: { x: -hx, y: -hy }, out: { x: hx, y: hy } };
  });
}
