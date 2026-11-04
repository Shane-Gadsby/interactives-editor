import { isContainer, type Artboard, type SceneNode } from 'interactives-player';
import { locate } from '../store/doc';

/**
 * Where a dragged layer would land in the Layers panel.
 *
 * The panel draws the layers of an artboard top-most first, so a drop is a "gap" between two visible rows (0 is above
 * the first row, rows.length is below the last) plus a depth: how far in the line is indented decides which list the
 * layer joins when the rows around the gap belong to different groups. Dropping on the middle of a group row is the
 * other kind of drop, "inside", which puts the layer at the top of that group.
 */

export type DropRow = {
  n: SceneNode;
  depth: number;
  /** Index (in the rows) of the row this one is nested under, -1 at the top level. */
  parentRow: number;
  /** Index in the parent's children array (the back of the list is the front of the artboard). */
  idx: number;
  open: boolean;
};

export type DropSlot = {
  /** The gap the line is drawn at, or -1 for an inside drop. */
  gap: number;
  depth: number;
  /** Row index of the group being dropped into (inside drops only). */
  row?: number;
  parentId: string | null;
  /** Children index to hand to `moveNode`. Infinity is the front of the list. */
  at: number;
  /** The layer is already exactly there. */
  noop: boolean;
};

export const ROW_H = 26;
export const INDENT = 14;
export const ROW_PAD = 8;

/** The rows the panel draws for one artboard, top-most first. */
export function dropRows(ab: Artboard, collapsed: ReadonlySet<string>): DropRow[] {
  const out: DropRow[] = [];
  const add = (list: SceneNode[], depth: number, parentRow: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      const open = isContainer(n) && !collapsed.has(n.id);
      const at = out.length;
      out.push({ n, depth, parentRow, idx: i, open });
      if (open) add((n as { children: SceneNode[] }).children, depth + 1, at);
    }
  };
  if (!collapsed.has(ab.id)) add(ab.children, 1, -1);
  return out;
}

/** Which part of a row the pointer is over: a group row has a middle that means "inside". */
export function zoneOf(container: boolean, f: number): 'before' | 'inside' | 'after' {
  if (container) return f < 1 / 3 ? 'before' : f > 2 / 3 ? 'after' : 'inside';
  return f < 0.5 ? 'before' : 'after';
}

/** The depth the pointer's x asks for, given where the list starts. Left of the indent pops out of groups. */
export function depthAtX(x: number, listLeft: number): number {
  return Math.floor((x - listLeft - ROW_PAD) / INDENT);
}

function inSubtree(rows: DropRow[], r: number, dragRow: number): boolean {
  if (dragRow < 0) return false;
  for (let p = rows[r].parentRow; p >= 0; p = rows[p].parentRow) if (p === dragRow) return true;
  return false;
}

/**
 * The slot for the gap before row `gap`, with the line indented to `wantDepth` as far as the neighbouring rows allow.
 * Null when the drop makes no sense: inside the dragged layer's own group.
 */
export function gapSlot(ab: Artboard, rows: DropRow[], gap: number, wantDepth: number, dragId: string): DropSlot | null {
  const dragRow = rows.findIndex((r) => r.n.id === dragId);
  let aboveIdx = gap - 1;
  const below = rows[gap];
  if (aboveIdx >= 0 && inSubtree(rows, aboveIdx, dragRow)) {
    // Below the dragged group's last child counts as below the group itself
    if (below && inSubtree(rows, gap, dragRow)) return null;
    aboveIdx = dragRow;
  }
  if (below && aboveIdx === dragRow && dragRow >= 0 && inSubtree(rows, gap, dragRow)) return null;
  const above = aboveIdx >= 0 ? rows[aboveIdx] : null;
  let parentId: string | null;
  let at: number;
  let depth: number;
  if (!above) {
    depth = 1;
    parentId = null;
    at = Infinity;
  } else {
    const min = below ? below.depth : 1;
    // An open group above the gap can be entered, unless it is the layer being dragged
    const max = above.open && aboveIdx !== dragRow ? above.depth + 1 : above.depth;
    depth = Math.max(min, Math.min(max, wantDepth));
    if (depth > above.depth) {
      parentId = above.n.id;
      at = Infinity;
    } else {
      let r = aboveIdx;
      while (rows[r].depth > depth) r = rows[r].parentRow;
      parentId = rows[r].parentRow >= 0 ? rows[rows[r].parentRow].n.id : null;
      at = rows[r].idx;
    }
  }
  return { gap, depth, parentId, at, noop: isNoop(ab, dragId, parentId, at) };
}

/** Dropping on the middle of a group row: the layer goes to the front of that group. */
export function insideSlot(ab: Artboard, rows: DropRow[], row: number, dragId: string): DropSlot | null {
  const target = rows[row];
  if (!target || !isContainer(target.n)) return null;
  const dragRow = rows.findIndex((r) => r.n.id === dragId);
  if (row === dragRow || inSubtree(rows, row, dragRow)) return null;
  return { gap: -1, row, depth: target.depth + 1, parentId: target.n.id, at: Infinity, noop: isNoop(ab, dragId, target.n.id, Infinity) };
}

function isNoop(ab: Artboard, dragId: string, parentId: string | null, at: number): boolean {
  const cur = locate(ab, dragId);
  if (!cur) return true;
  if ((cur.parent?.id ?? null) !== parentId) return false;
  if (at === Infinity) return cur.index === cur.siblings.length - 1;
  return at === cur.index || at === cur.index + 1;
}

/**
 * The slot for the pointer at `y` (relative to the top of the scrolled list) and `x`, given the flat list's layout:
 * `base` is the flat index of the active artboard's own row, and `rows` its layers.
 */
export function slotAt(ab: Artboard, rows: DropRow[], flatIndex: number, base: number, frac: number, wantDepth: number, dragId: string): DropSlot | null {
  const rowIdx = flatIndex - base - 1;
  if (rowIdx < 0) return gapSlot(ab, rows, 0, 1, dragId);
  if (rowIdx >= rows.length) return gapSlot(ab, rows, rows.length, wantDepth, dragId);
  const r = rows[rowIdx];
  const zone = zoneOf(isContainer(r.n), frac);
  if (zone === 'inside') return insideSlot(ab, rows, rowIdx, dragId);
  return gapSlot(ab, rows, zone === 'before' ? rowIdx : rowIdx + 1, wantDepth, dragId);
}

export type KeyMove = 'up' | 'down' | 'in' | 'out';

/**
 * Keyboard reordering for the Layers panel: up and down step past one layer (and out of the group at its end), in
 * puts the layer at the back of the group above it, out puts it just under the group it is in.
 */
export function keyMoveTarget(ab: Artboard, id: string, dir: KeyMove): { parentId: string | null; at: number } | null {
  const loc = locate(ab, id);
  if (!loc) return null;
  const parentLoc = loc.parent ? locate(ab, loc.parent.id) : null;
  const outOf = (index: number) => (parentLoc ? { parentId: parentLoc.parent?.id ?? null, at: index } : null);
  if (dir === 'up') {
    if (loc.index + 1 < loc.siblings.length) return { parentId: loc.parent?.id ?? null, at: loc.index + 2 };
    return outOf(parentLoc ? parentLoc.index + 1 : 0);
  }
  if (dir === 'down') {
    if (loc.index > 0) return { parentId: loc.parent?.id ?? null, at: loc.index - 1 };
    return outOf(parentLoc ? parentLoc.index : 0);
  }
  if (dir === 'out') return outOf(parentLoc ? parentLoc.index : 0);
  const above = loc.siblings[loc.index + 1];
  if (above && isContainer(above)) return { parentId: above.id, at: 0 };
  return null;
}
