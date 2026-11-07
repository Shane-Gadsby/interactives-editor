/**
 * Tidy up artboards: lay a project's artboards out on the canvas in a clean grid, in a logical order, with even gaps and
 * room above each one for its name label. Pure (it returns positions), so the editor command, the starters and the tests
 * all use the same function.
 *
 * Order: the Artboards list order, with the start artboard first when it isn't already; a responsive variant (a portrait
 * copy of a page) goes right after its main artboard and stays beside it in the same cell; boards that exist only to be
 * used inside others (instances) or that came from a library go last. Artboards that are off the canvas are left alone.
 */
import { setMembers, walk, type Artboard, type Project } from 'interactives-player';

/** Space between neighbours: sideways between cells, and down between rows (the name label sits in the row gap). */
export const TIDY_GAP_X = 120;
export const TIDY_GAP_Y = 140;
/** Space between a main artboard and its responsive variants, inside one cell. */
export const TIDY_GAP_VARIANT = 80;

/** One cell of the grid: a main artboard and the variants that sit beside it. */
export interface TidyCell {
  boards: Artboard[];
}

/** The artboards that exist to be used inside others: placed as an instance somewhere, or copied in from a library. The start artboard and anything a "Go to artboard" leads to never count. */
function componentIds(p: Project): Set<string> {
  const used = new Set<string>();
  const targeted = new Set<string>();
  for (const ab of p.artboards) {
    walk(ab.children, (n) => {
      if (n.type === 'instance' && n.artboardId !== ab.id) used.add(n.artboardId);
    });
    for (const g of ab.logic?.nodes ?? []) {
      const t = (g.params as { artboard?: unknown } | undefined)?.artboard;
      if (g.kind === 'action.artboard' && typeof t === 'string') targeted.add(t);
    }
  }
  const out = new Set<string>();
  for (const ab of p.artboards) {
    if (ab.id === p.settings.startArtboardId || targeted.has(ab.id)) continue;
    if (used.has(ab.id) || ab.library) out.add(ab.id);
  }
  return out;
}

/** The cells of the grid in reading order (not yet positioned). */
export function tidyCells(p: Project): TidyCell[] {
  const on = p.artboards.filter((a) => !a.canvasHidden);
  const comps = componentIds(p);
  const ids = new Set(on.map((a) => a.id));
  const isVariant = (a: Artboard) => !!a.variantOf && a.variantOf !== a.id && ids.has(a.variantOf);
  const cells: TidyCell[] = [];
  const add = (a: Artboard) => {
    if (isVariant(a)) return;
    //the base first, then the rest of its set narrowest first
    const rest = setMembers(on, a).filter((m) => m !== a);
    cells.push({ boards: [a, ...rest] });
  };
  const mains = on.filter((a) => !comps.has(a.id));
  const start = mains.find((a) => a.id === p.settings.startArtboardId);
  //the start artboard leads, unless it is a variant (then its main artboard's cell holds it)
  const first = start && !isVariant(start) ? start : undefined;
  if (first) add(first);
  for (const a of mains) if (a !== first) add(a);
  for (const a of on) if (comps.has(a.id)) add(a);
  //a variant whose base was put in the components group still has to land somewhere
  const placed = new Set(cells.flatMap((c) => c.boards.map((b) => b.id)));
  for (const a of on) if (!placed.has(a.id)) cells.push({ boards: [a] });
  return cells;
}

const cellSize = (c: TidyCell) => ({
  width: c.boards.reduce((w, b) => w + b.width, 0) + TIDY_GAP_VARIANT * (c.boards.length - 1),
  height: Math.max(...c.boards.map((b) => b.height)),
});

/**
 * How many cells go across. Picks the width that makes the whole grid closest to a screen's shape (about 16:10), preferring
 * a last row that is nearly full, so eight pages are three across rather than a long strip or a tall stack.
 */
export function tidyColumns(sizes: { width: number; height: number }[]): number {
  const n = sizes.length;
  if (n <= 2) return Math.max(1, n);
  let best = 1;
  let bestCost = Infinity;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const colW = Array.from({ length: cols }, (_, c) => Math.max(...sizes.filter((_, i) => i % cols === c).map((s) => s.width)));
    const rowH = Array.from({ length: rows }, (_, r) => Math.max(...sizes.slice(r * cols, r * cols + cols).map((s) => s.height)));
    const w = colW.reduce((a, b) => a + b, 0) + TIDY_GAP_X * (cols - 1);
    const h = rowH.reduce((a, b) => a + b, 0) + TIDY_GAP_Y * (rows - 1);
    const empty = rows * cols - n;
    const cost = Math.abs(Math.log(w / h / 1.6)) + 0.15 * (empty / cols);
    if (cost < bestCost - 1e-9) {
      best = cols;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Where every on-canvas artboard goes. The grid's top left is `origin` (default: where the artboards' top left corner is now,
 * so a tidy keeps them where the author was looking).
 */
export function tidyPositions(p: Project, origin?: { x: number; y: number }): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const cells = tidyCells(p);
  if (!cells.length) return out;
  const all = cells.flatMap((c) => c.boards);
  const ox = origin?.x ?? Math.min(...all.map((a) => a.canvasX));
  const oy = origin?.y ?? Math.min(...all.map((a) => a.canvasY));
  const sizes = cells.map(cellSize);
  const cols = tidyColumns(sizes);
  const rows = Math.ceil(cells.length / cols);
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...sizes.filter((_, i) => i % cols === c).map((s) => s.width)));
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...sizes.slice(r * cols, r * cols + cols).map((s) => s.height)));
  cells.forEach((cell, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    let x = ox + colW.slice(0, c).reduce((a, b) => a + b, 0) + TIDY_GAP_X * c;
    const y = oy + rowH.slice(0, r).reduce((a, b) => a + b, 0) + TIDY_GAP_Y * r;
    for (const b of cell.boards) {
      out.set(b.id, { x: Math.round(x), y: Math.round(y) });
      x += b.width + TIDY_GAP_VARIANT;
    }
  });
  return out;
}

/** Puts the artboards of a project (or an immer draft of one) where `tidyPositions` says. Returns true when anything moved. */
export function applyTidy(p: Project, origin?: { x: number; y: number }): boolean {
  let moved = false;
  const pos = tidyPositions(p, origin);
  for (const a of p.artboards) {
    const at = pos.get(a.id);
    if (!at || (a.canvasX === at.x && a.canvasY === at.y)) continue;
    a.canvasX = at.x;
    a.canvasY = at.y;
    moved = true;
  }
  return moved;
}
