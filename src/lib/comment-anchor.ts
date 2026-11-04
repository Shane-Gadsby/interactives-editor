/**
 * Where a review comment sits. A comment is pinned to an artboard and, when the spot was on a layer, to that layer at a
 * spot in the layer's own coordinates, so the pin follows the layer when it moves, scales or rotates. The point in the
 * artboard is kept beside it for when the layer is deleted (the pin then stays where it was, drawn dashed).
 */
import { apply, invert, type Project } from 'interactives-player';
import { pinSpot, type Anchor, type Thread } from '../../shared/comments.mjs';
import { getArtboard, hitTest, locate, nodeToArtboard } from '../store/doc';

/** The anchor for a press at (x, y) in an artboard's own coordinates: the layer under it (the deepest one) if there is one. */
export function anchorAt(project: Project, artboardId: string, x: number, y: number): { anchor: Anchor; context: { artboard: string; layer: string } } | null {
  const ab = getArtboard(project, artboardId);
  if (!ab) return null;
  const px = Math.round(x * 10) / 10;
  const py = Math.round(y * 10) / 10;
  const hit = hitTest(ab, x, y, { includeLocked: true });
  const node = hit[hit.length - 1];
  if (!node) return { anchor: { artboardId, layerId: null, x: px, y: py }, context: { artboard: ab.name, layer: '' } };
  const local = apply(invert(nodeToArtboard(ab, node.id)), x, y);
  return { anchor: { artboardId, layerId: node.id, lx: Math.round(local.x * 10) / 10, ly: Math.round(local.y * 10) / 10, x: px, y: py }, context: { artboard: ab.name, layer: node.name } };
}

export interface PinPlace {
  artboardId: string;
  /** In the artboard's own coordinates. */
  x: number;
  y: number;
  /** The layer it was on is gone; the pin is where it was left. */
  detached: boolean;
  /** The artboard is gone too: there is nowhere to draw it. */
  missing: boolean;
}

export function pinPlace(project: Project, thread: Pick<Thread, 'anchor'>): PinPlace {
  const a = thread.anchor;
  const ab = getArtboard(project, a.artboardId);
  if (!ab) return { artboardId: a.artboardId, x: a.x, y: a.y, detached: true, missing: true };
  const spot = pinSpot(a, (id, lx, ly) => (locate(ab, id) ? apply(nodeToArtboard(ab, id), lx, ly) : null));
  return { artboardId: a.artboardId, x: spot.x, y: spot.y, detached: spot.detached, missing: false };
}

/** What the panel says about where a comment is: "Artboard › Layer", from the live names when they are still there. */
export function placeLabel(project: Project | null, thread: Thread): string {
  const ab = project ? getArtboard(project, thread.anchor.artboardId) : undefined;
  const layer = ab && thread.anchor.layerId ? locate(ab, thread.anchor.layerId)?.node.name : undefined;
  const board = ab?.name ?? (thread.ctx.artboard || 'Deleted artboard');
  const name = layer ?? (thread.anchor.layerId ? thread.ctx.layer : '');
  return name ? `${board} › ${name}` : board;
}
