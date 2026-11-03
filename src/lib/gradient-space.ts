import type { Paint, SceneNode, Stroke } from 'interactives-player';

/**
 * Importers read a gradient's points in the space of the shape they belong to; a layer's paint wants them in px from its own
 * box. `b` is where the box's top-left sits in the shape's space.
 */
export function shiftedPaint<T extends Paint>(p: T, b: { x: number; y: number }): T {
  const pt = (q: { x: number; y: number } | undefined) => q && { x: Math.round((q.x - b.x) * 100) / 100, y: Math.round((q.y - b.y) * 100) / 100 };
  if (p.type === 'linear' && (p.from || p.to)) return { ...p, ...(p.from ? { from: pt(p.from) } : {}), ...(p.to ? { to: pt(p.to) } : {}) };
  if (p.type === 'radial' && p.center) return { ...p, center: pt(p.center) };
  return p;
}

/** The same for every paint of a layer, in place. */
export function shiftGradients(node: SceneNode, b: { x: number; y: number }): void {
  const n = node as SceneNode & { fill?: Paint | null; fills?: Paint[]; stroke?: Stroke | null; strokes?: Stroke[] };
  if (n.fill) n.fill = shiftedPaint(n.fill, b);
  if (n.fills) n.fills = n.fills.map((p) => shiftedPaint(p, b));
  if (n.stroke) n.stroke = { ...n.stroke, paint: shiftedPaint(n.stroke.paint, b) };
  if (n.strokes) n.strokes = n.strokes.map((st) => ({ ...st, paint: shiftedPaint(st.paint, b) }));
}
