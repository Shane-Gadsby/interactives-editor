//What the Connector tool and a connector's end handles work out: which layer the pointer is over, which side an end snaps to, and
//the connector a drag makes. Plain functions over the document, tested without a canvas.
import { createNode, pathD, routeBetween, type Artboard, type ConnectorBox, type ConnectorEnd, type ConnectorNode, type ConnectorPt, type SceneNode } from 'interactives-player';
import { hitTest, locate, nodeCorners } from '../store/doc';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** An end the pointer settled on: what to store, where it sits (artboard px) and the box it hangs on. */
export interface Picked {
  end: ConnectorEnd;
  /** The layer it is on (the template of a repeated one). Null for a loose end. */
  layerId: string | null;
  box: ConnectorBox | null;
  at: ConnectorPt;
}

/** How near (screen px) a side's middle has to be to take the end onto that side. */
export const SIDE_SNAP = 16;

const boxOf = (ab: Artboard, id: string): ConnectorBox | null => {
  const pts = nodeCorners(ab, id);
  if (!pts.length) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  const node = locate(ab, id)?.node;
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, shape: node?.type === 'ellipse' ? 'ellipse' : 'rect' };
};

export const sideMid = (b: ConnectorBox, side: Side): ConnectorPt => (side === 'top' ? { x: b.x + b.w / 2, y: b.y } : side === 'bottom' ? { x: b.x + b.w / 2, y: b.y + b.h } : side === 'left' ? { x: b.x, y: b.y + b.h / 2 } : { x: b.x + b.w, y: b.y + b.h / 2 });

/** Whether a layer is in the template of a repeater (its first child, or anything inside it): the copies are what a connector joins. */
export function inRepeaterTemplate(ab: Artboard, id: string): boolean {
  const loc = locate(ab, id);
  if (!loc) return false;
  const chain = [...loc.ancestors, loc.node];
  return loc.ancestors.some((a, i) => !!a.repeat?.items?.trim() && a.children[0] === chain[i + 1]);
}

/**
 * The layer a connector end can hang on under a point (artboard px): the outermost layer that is a shape of its own, so a card
 * made of a frame with text in it is joined as the card and not as its words (groups are stepped into, being no box a person
 * means). With `deep` it is the innermost one instead. Connectors, bones and the layers in `skip` never count.
 */
export function layerUnder(ab: Artboard, p: ConnectorPt, skip: string[] = [], deep = false): SceneNode | null {
  const path = hitTest(ab, p.x, p.y).filter((n) => n.type !== 'connector' && n.type !== 'bone' && !skip.includes(n.id));
  if (deep) return path[path.length - 1] ?? null;
  return path.find((n) => n.type !== 'group') ?? path[path.length - 1] ?? null;
}

/** The side of a box whose middle is within `reach` px of the point, nearest first; null when none is. */
export function snapSide(b: ConnectorBox, p: ConnectorPt, reach: number): Side | null {
  let best: Side | null = null;
  let dist = reach;
  for (const s of ['top', 'right', 'bottom', 'left'] as Side[]) {
    const m = sideMid(b, s);
    const d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d <= dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

/**
 * What the pointer is on: a layer (its side when a side's middle is close, otherwise `auto`, which faces the other end), or
 * nothing, which is a loose end right where it is. A layer inside a repeater is joined as its first copy, `{repeat, index: '0'}`,
 * and the inspector's "which copy" says the rest.
 */
export function pickEnd(ab: Artboard, p: ConnectorPt, zoom: number, skip: string[] = [], deep = false): Picked {
  const n = layerUnder(ab, p, skip, deep);
  const box = n ? boxOf(ab, n.id) : null;
  if (!n || !box) return { end: { layer: '', x: Math.round(p.x), y: Math.round(p.y) }, layerId: null, box: null, at: p };
  const side = snapSide(box, p, SIDE_SNAP / zoom);
  const layer = inRepeaterTemplate(ab, n.id) ? { repeat: n.id, index: '0' } : n.id;
  return { end: { layer, ...(side ? { side } : {}) }, layerId: n.id, box, at: side ? sideMid(box, side) : { x: box.x + box.w / 2, y: box.y + box.h / 2 } };
}

/** The layer id an end names (the template's, for a copy of a repeated layer), or null for a loose end. */
export function endLayerId(end: ConnectorEnd): string | null {
  const l = end.layer;
  if (typeof l === 'string') return l || null;
  return l && typeof l.repeat === 'string' ? l.repeat : null;
}

/** An end already stored, as a picked one (to draw a line from it while the other end is dragged). */
export function pickedFromEnd(ab: Artboard, end: ConnectorEnd): Picked {
  const id = endLayerId(end);
  const box = id ? boxOf(ab, id) : null;
  if (!box) return { end, layerId: null, box: null, at: { x: end.x ?? 0, y: end.y ?? 0 } };
  const side = end.side && end.side !== 'auto' ? end.side : null;
  return { end, layerId: id, box, at: side ? sideMid(box, side) : { x: box.x + box.w / 2, y: box.y + box.h / 2 } };
}

/** The line a drag in progress draws, from the end that stays to the one under the pointer (artboard px). */
export function previewPath(fixed: Picked, moving: Picked, route: ConnectorNode['route'] = 'curved'): string {
  const res = routeBetween(
    { box: fixed.box, at: fixed.at, side: fixed.end.side ?? 'auto', offset: fixed.end.offset ?? 0 },
    { box: moving.box, at: moving.at, side: moving.end.side ?? 'auto', offset: moving.end.offset ?? 0 },
    { route, gap: fixed.box || moving.box ? 4 : 0, radius: 8 },
  );
  return pathD(res.path, route === 'elbow' ? 8 : 0);
}

/** The connector a drag from one end to another makes (the project's own look is swapped in by the caller). */
export function newConnector(from: ConnectorEnd, to: ConnectorEnd, extra: Partial<ConnectorNode> = {}): ConnectorNode {
  return createNode('connector', { name: 'Connector', from, to, ...extra });
}
