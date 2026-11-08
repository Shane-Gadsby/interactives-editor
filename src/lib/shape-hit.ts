import type { SceneNode, SubPath } from 'interactives-player';
import { shapeToPaths } from './path-edit';

/**
 * Whether a point (in the layer's own coordinates) is on the painted part of a path, polygon or star: inside its fill
 * (by its fill rule) or on its stroke. Other layers are hit anywhere in their box. Curves are followed closely enough
 * for clicking (each one cut into short straight pieces).
 */
const STEPS = 16;

function polylines(paths: SubPath[]): { pts: { x: number; y: number }[]; closed: boolean }[] {
  return paths.map((sp) => {
    const out: { x: number; y: number }[] = [];
    const ps = sp.points;
    if (!ps.length) return { pts: out, closed: !!sp.closed };
    out.push({ x: ps[0].x, y: ps[0].y });
    const segs = sp.closed ? ps.length : ps.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = ps[i];
      const b = ps[(i + 1) % ps.length];
      if (!a.out && !b.in) {
        out.push({ x: b.x, y: b.y });
        continue;
      }
      const c1 = { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) };
      const c2 = { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) };
      for (let k = 1; k <= STEPS; k++) {
        const t = k / STEPS;
        const u = 1 - t;
        out.push({
          x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
          y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
        });
      }
    }
    return { pts: out, closed: !!sp.closed };
  });
}

function inside(lines: { pts: { x: number; y: number }[] }[], x: number, y: number, evenOdd: boolean): boolean {
  let winding = 0;
  let crossings = 0;
  for (const { pts } of lines) {
    // every sub-path counts as closed for its fill, as in SVG
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const xi = a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
        if (xi > x) {
          crossings++;
          winding += b.y > a.y ? 1 : -1;
        }
      }
    }
  }
  return evenOdd ? crossings % 2 === 1 : winding !== 0;
}

function nearOutline(lines: { pts: { x: number; y: number }[]; closed: boolean }[], x: number, y: number, reach: number): boolean {
  for (const { pts, closed } of lines) {
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2)) : 0;
      if (Math.hypot(a.x + t * dx - x, a.y + t * dy - y) <= reach) return true;
    }
  }
  return false;
}

const visiblePaint = (p: { visible?: boolean } | null | undefined) => !!p && p.visible !== false;

/** `slop`: extra reach around outlines (in layer units), so thin or unfilled shapes can still be picked. */
export function hitsPaintedShape(n: SceneNode, x: number, y: number, slop = 0): boolean {
  //A connector is picked on its line, not anywhere in the box round it (one that has not been drawn yet is a box of nothing)
  if (n.type === 'connector') {
    const pts = n.computed?.points;
    return !!pts && pts.length > 1 && nearOutline([{ pts, closed: false }], x, y, Math.max(0, (n.stroke?.width ?? 0) / 2) + Math.max(slop, 4));
  }
  if (n.type !== 'path' && n.type !== 'polygon' && n.type !== 'star') return true;
  const paths = n.type === 'path' ? n.paths : shapeToPaths(n);
  if (!paths?.length) return true;
  const lines = polylines(paths);
  const v = n as SceneNode & { fill?: { visible?: boolean } | null; fills?: { visible?: boolean }[]; stroke?: { width: number; visible?: boolean } | null; strokes?: { width: number; visible?: boolean }[]; fillRule?: string };
  const filled = v.fills?.length ? v.fills.some(visiblePaint) : visiblePaint(v.fill);
  if (filled && inside(lines, x, y, v.fillRule === 'evenodd')) return true;
  const strokes = v.strokes?.length ? v.strokes : v.stroke ? [v.stroke] : [];
  const half = Math.max(0, ...strokes.filter(visiblePaint).map((s) => (Number(s.width) || 0) / 2));
  return nearOutline(lines, x, y, half + slop);
}
