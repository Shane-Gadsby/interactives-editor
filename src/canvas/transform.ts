import { apply, invert, nodeMatrix, type Matrix, type PathNode, type SceneNode, type SubPath } from 'interactives-player';

/**
 * Place a node so that the box [l, t, l+W, t+H] in its *current* local
 * coordinates becomes its new box, keeping rotation and scale.
 * Returns the new x, y, width, height (in parent space).
 */
export function placeBox(n: SceneNode, l: number, t: number, W: number, H: number): { x: number; y: number; width: number; height: number } {
  const m = nodeMatrix(n);
  const ox = n.originX;
  const oy = n.originY;
  const P = apply(m, l + W * ox, t + H * oy);
  // For an untransformed node the origin maps to (x + W*ox, y + H*oy).
  return { x: P.x - W * ox, y: P.y - H * oy, width: W, height: H };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Handle position as a fraction of the box. */
export const HANDLE_POS: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

/**
 * New local box after dragging a handle to local point (px, py).
 * `keepAspect` (shift) locks proportions, `fromCenter` (alt) resizes symmetrically.
 */
export function resizeBox(
  w0: number,
  h0: number,
  handle: Handle,
  px: number,
  py: number,
  keepAspect: boolean,
  fromCenter: boolean,
): { l: number; t: number; w: number; h: number } {
  let l = 0;
  let t = 0;
  let r = w0;
  let b = h0;
  const [hx, hy] = HANDLE_POS[handle];
  if (hx === 0) l = px;
  if (hx === 1) r = px;
  if (hy === 0) t = py;
  if (hy === 1) b = py;
  if (fromCenter) {
    if (hx === 0) r = w0 - (l - 0);
    if (hx === 1) l = w0 - r;
    if (hy === 0) b = h0 - t;
    if (hy === 1) t = h0 - b;
  }
  let w = r - l;
  let h = b - t;
  if (keepAspect && w0 > 0 && h0 > 0) {
    const ratio = w0 / h0;
    const edgeOnlyX = hy === 0.5;
    const edgeOnlyY = hx === 0.5;
    if (edgeOnlyX) h = Math.abs(w) / ratio * Math.sign(h || 1);
    else if (edgeOnlyY) w = Math.abs(h) * ratio * Math.sign(w || 1);
    else if (Math.abs(w) / w0 > Math.abs(h) / h0) h = (Math.abs(w) / ratio) * Math.sign(h || 1);
    else w = Math.abs(h) * ratio * Math.sign(w || 1);
    if (hx === 0) l = r - w;
    if (hy === 0) t = b - h;
    if (edgeOnlyX) t = (h0 - h) / 2;
    if (edgeOnlyY) l = (w0 - w) / 2;
    if (fromCenter) {
      l = (w0 - w) / 2;
      t = (h0 - h) / 2;
    }
  }
  // Normalise flips.
  if (w < 0) {
    l += w;
    w = -w;
  }
  if (h < 0) {
    t += h;
    h = -h;
  }
  return { l, t, w: Math.max(1, w), h: Math.max(1, h) };
}

/** Scale a path node's points from an old box size to a new one. */
export function scalePaths(paths: SubPath[], sx: number, sy: number, dx = 0, dy = 0): SubPath[] {
  return paths.map((sp) => ({
    closed: sp.closed,
    points: sp.points.map((p) => ({
      x: (p.x - dx) * sx,
      y: (p.y - dy) * sy,
      in: p.in ? { x: p.in.x * sx, y: p.in.y * sy } : p.in,
      out: p.out ? { x: p.out.x * sx, y: p.out.y * sy } : p.out,
    })),
  }));
}

/** Point in a node's local space from a point in its parent's space. */
export function toLocal(n: SceneNode, parentPoint: { x: number; y: number }, parentM?: Matrix): { x: number; y: number } {
  const m = parentM ? multiplyMat(parentM, nodeMatrix(n)) : nodeMatrix(n);
  return apply(invert(m), parentPoint.x, parentPoint.y);
}

function multiplyMat(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Bounds of a path's anchor points (handles excluded) after normalisation. */
export function normalizePath(n: PathNode): { x: number; y: number; width: number; height: number; paths: SubPath[] } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sp of n.paths)
    for (const p of sp.points) {
      const xs = [p.x, p.in ? p.x + p.in.x : p.x, p.out ? p.x + p.out.x : p.x];
      const ys = [p.y, p.in ? p.y + p.in.y : p.y, p.out ? p.y + p.out.y : p.y];
      minX = Math.min(minX, ...xs);
      minY = Math.min(minY, ...ys);
      maxX = Math.max(maxX, ...xs);
      maxY = Math.max(maxY, ...ys);
    }
  if (minX === Infinity) return { x: n.x, y: n.y, width: n.width, height: n.height, paths: n.paths };
  const W = Math.max(1, maxX - minX);
  const H = Math.max(1, maxY - minY);
  const box = placeBox(n, minX, minY, W, H);
  return { ...box, paths: scalePaths(n.paths, 1, 1, minX, minY) };
}
