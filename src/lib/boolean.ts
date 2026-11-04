import polygonClipping, { type MultiPolygon, type Pair, type Polygon } from 'polygon-clipping';
import {
  LIGHT_LOOK,
  apply,
  cornerRadiiOf,
  createNode,
  multiply,
  polygonPoints,
  roundedBoxPoints,
  starPoints,
  type Artboard,
  type Matrix,
  type PathNode,
  type PathPoint,
  type SceneNode,
} from 'interactives-player';
import { locate, nodeToArtboard, parentToArtboard } from '../store/doc';
import { invert } from 'interactives-player';

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

const CURVE_STEPS = 16;
const ELLIPSE_STEPS = 72;

/** A shape's outline as closed rings in its own local coordinates (curves flattened). */
function localRings(n: SceneNode): Pair[][] {
  const w = n.width;
  const h = n.height;
  switch (n.type) {
    case 'rect':
    case 'frame':
    case 'image':
    case 'button':
    case 'input':
    case 'embed':
    case 'draw':
    case 'shader':
    case 'video': {
      // Radii per corner draw instead of the single radius
      const radii = cornerRadiiOf(n as { cornerRadii?: unknown });
      if (radii && radii.some((v) => v > 0)) return [flattenSubPath(roundedBoxPoints(w, h, radii))];
      const r = Math.min('cornerRadius' in n ? n.cornerRadius : 0, w / 2, h / 2);
      if (r <= 0)
        return [
          [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
          ],
        ];
      const ring: Pair[] = [];
      const corner = (cx: number, cy: number, a0: number) => {
        for (let i = 0; i <= 8; i++) {
          const a = a0 + (i / 8) * (Math.PI / 2);
          ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
      };
      corner(w - r, r, -Math.PI / 2);
      corner(w - r, h - r, 0);
      corner(r, h - r, Math.PI / 2);
      corner(r, r, Math.PI);
      return [ring];
    }
    case 'ellipse': {
      const ring: Pair[] = [];
      for (let i = 0; i < ELLIPSE_STEPS; i++) {
        const a = (i / ELLIPSE_STEPS) * Math.PI * 2;
        ring.push([w / 2 + (Math.cos(a) * w) / 2, h / 2 + (Math.sin(a) * h) / 2]);
      }
      return [ring];
    }
    case 'polygon':
      return [polygonPoints(n.sides, w, h).map((p) => [p.x, p.y] as Pair)];
    case 'star':
      return [starPoints(n.points, n.innerRatio, w, h).map((p) => [p.x, p.y] as Pair)];
    case 'path':
      return n.paths.filter((sp) => sp.points.length >= 3).map((sp) => flattenSubPath(sp.points));
    default:
      return [
        [
          [0, 0],
          [w, 0],
          [w, h],
          [0, h],
        ],
      ];
  }
}

function flattenSubPath(pts: PathPoint[]): Pair[] {
  const out: Pair[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push([a.x, a.y]);
    if (!a.out && !b.in) continue;
    const c1 = { x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) };
    const c2 = { x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) };
    for (let s = 1; s < CURVE_STEPS; s++) {
      const t = s / CURVE_STEPS;
      const u = 1 - t;
      out.push([
        u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
        u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
      ]);
    }
  }
  return out;
}

/** Outline of a node in a given coordinate space (`toSpace` maps artboard -> that space). */
function shapeIn(ab: Artboard, n: SceneNode, toSpace: Matrix): Polygon {
  const m = multiply(toSpace, nodeToArtboard(ab, n.id));
  return localRings(n).map((ring) => {
    const pts = ring.map(([x, y]) => {
      const p = apply(m, x, y);
      return [p.x, p.y] as Pair;
    });
    if (pts.length) pts.push(pts[0]);
    return pts;
  });
}

/**
 * Combine shapes into one path layer. The bottom-most selected layer is the base
 * (subtract removes the others from it) and gives the result its style. All
 * layers must share a parent; the result replaces them at the top-most one's place.
 */
export function booleanPath(ab: Artboard, ids: string[], op: BooleanOp): { node: PathNode; parentId: string | null; index: number } | null {
  const locs = ids.map((id) => locate(ab, id)).filter(Boolean) as NonNullable<ReturnType<typeof locate>>[];
  if (locs.length < 2) return null;
  const parentId = locs[0].parent?.id ?? null;
  if (locs.some((l) => (l.parent?.id ?? null) !== parentId)) return null;
  locs.sort((a, b) => a.index - b.index);
  const toParent = invert(parentToArtboard(ab, locs[0].node.id));
  const polys = locs.map((l) => shapeIn(ab, l.node, toParent));
  let result: MultiPolygon;
  const [first, ...rest] = polys;
  switch (op) {
    case 'union':
      result = polygonClipping.union(first, ...rest);
      break;
    case 'subtract':
      result = polygonClipping.difference(first, ...rest);
      break;
    case 'intersect':
      result = polygonClipping.intersection(first, ...rest);
      break;
    case 'exclude':
      result = polygonClipping.xor(first, ...rest);
      break;
  }
  if (!result.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of result)
    for (const ring of poly)
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const paths = result.flatMap((poly) =>
    poly.map((ring) => ({
      closed: true,
      // polygon-clipping repeats the first point at the end
      points: ring.slice(0, -1).map(([x, y]) => ({ x: r2(x - minX), y: r2(y - minY) })),
    })),
  );
  const base = locs[0].node as SceneNode & { fill?: unknown; stroke?: unknown };
  const node = createNode('path', {
    name: op === 'union' ? 'Union' : op === 'subtract' ? 'Subtract' : op === 'intersect' ? 'Intersect' : 'Exclude',
    x: r2(minX),
    y: r2(minY),
    width: Math.max(1, r2(maxX - minX)),
    height: Math.max(1, r2(maxY - minY)),
    paths,
    fillRule: 'evenodd',
    fill: ('fill' in base ? base.fill : { type: 'solid', color: LIGHT_LOOK.surfaceMuted }) as PathNode['fill'],
    stroke: ('stroke' in base ? base.stroke : null) as PathNode['stroke'],
    // the extra fills and strokes of the first shape come along
    ...('fills' in base && base.fills?.length ? { fills: structuredClone(base.fills) } : {}),
    ...('strokes' in base && base.strokes?.length ? { strokes: structuredClone(base.strokes) } : {}),
    opacity: base.opacity,
    lineJoin: 'round',
  });
  return { node, parentId, index: Math.max(...locs.map((l) => l.index)) - (locs.length - 1) };
}
