import { apply, isContainer, nodeMatrix, type Matrix, type SceneNode } from 'interactives-player';

/**
 * Layers hanging outside an artboard that clips are drawn faintly beside it on the canvas, so they can still be seen and
 * picked (the player and the exports still clip). This works out which top-level layers reach outside, and how far.
 */

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const EMPTY: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

const grow = (b: Box, x: number, y: number): void => {
  if (x < b.x0) b.x0 = x;
  if (y < b.y0) b.y0 = y;
  if (x > b.x1) b.x1 = x;
  if (y > b.y1) b.y1 = y;
};

/** A layer's own box and what hangs out of it, in its own coordinates. Cached by the node (unchanged layers are shared between edits). */
const local = new WeakMap<SceneNode, Box>();

/** Whether a container's children can be seen past its own box (a clipping frame or a scrolling one cuts them off). */
const clipsKids = (n: SceneNode): boolean => n.type === 'frame' && (!!n.clip || (!!n.scroll && n.scroll !== 'none'));

function localBox(n: SceneNode): Box {
  const hit = local.get(n);
  if (hit) return hit;
  const b: Box = { x0: 0, y0: 0, x1: n.width, y1: n.height };
  if (isContainer(n) && !clipsKids(n)) {
    for (const c of n.children) {
      if (!c.visible) continue;
      const e = parentBox(c);
      grow(b, e.x0, e.y0);
      grow(b, e.x1, e.y1);
    }
  }
  local.set(n, b);
  return b;
}

/** The axis-aligned bounds of a layer (and what hangs out of it) in its parent's coordinates. */
function parentBox(n: SceneNode): Box {
  const b = localBox(n);
  const m: Matrix = nodeMatrix(n);
  const out: Box = { ...EMPTY };
  for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]) {
    const p = apply(m, x, y);
    grow(out, p.x, p.y);
  }
  return out;
}

/** The runs of top-level layers that have to be drawn together: a mask goes with the layers it clips (up to the next mask). */
function runs(nodes: SceneNode[]): SceneNode[][] {
  const out: SceneNode[][] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (!n.mask && last && last[0].mask) last.push(n);
    else out.push([n]);
  }
  return out;
}

export interface Ghost {
  /** The layers to draw faintly, in their original order. */
  nodes: SceneNode[];
  /** The area (artboard coordinates) they cover, outside and inside the artboard: where a click can pick one. */
  extent: Box;
}

/** The top-level layers reaching outside a `width` x `height` artboard, or null when none does. */
export function ghostLayers(nodes: SceneNode[], width: number, height: number): Ghost | null {
  const keep: SceneNode[] = [];
  const extent: Box = { ...EMPTY };
  for (const run of runs(nodes)) {
    let out = false;
    for (const n of run) {
      if (!n.visible) continue;
      const b = parentBox(n);
      if (b.x0 < -0.5 || b.y0 < -0.5 || b.x1 > width + 0.5 || b.y1 > height + 0.5) {
        out = true;
        break;
      }
    }
    if (!out) continue;
    keep.push(...run);
    for (const n of run) {
      if (!n.visible) continue;
      const b = parentBox(n);
      grow(extent, b.x0, b.y0);
      grow(extent, b.x1, b.y1);
    }
  }
  return keep.length ? { nodes: keep, extent } : null;
}

// Where each artboard's ghost layers are, for picking them (the canvas asks, ArtboardView tells)
const extents = new Map<string, Box>();

export function setGhostExtent(artboardId: string, box: Box | null): void {
  if (box) extents.set(artboardId, box);
  else extents.delete(artboardId);
}

/** Whether a point (artboard coordinates) is over where an artboard's ghost layers are. */
export function inGhostExtent(artboardId: string, x: number, y: number): boolean {
  const b = extents.get(artboardId);
  return !!b && x >= b.x0 && y >= b.y0 && x <= b.x1 && y <= b.y1;
}

/** The clip path that keeps a ghost to the outside of its artboard (a big rectangle with the artboard cut out of it). */
export function outsideClipPath(width: number, height: number, x = 0, y = 0): string {
  const far = 1e6;
  return `path(evenodd, 'M${-far} ${-far}H${far}V${far}H${-far}ZM${x} ${y}H${x + width}V${y + height}H${x}Z')`;
}
