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

/** Room a group's frame takes around its artboards: at the sides and bottom, and above (for the artboards' own name labels and the group's title). */
export const TIDY_GROUP_PAD = 40;
export const TIDY_GROUP_TOP = 76;

/** A run of cells laid out in its own grid: its size, and a function that puts them at an origin. */
function gridOf(cells: TidyCell[]) {
  const sizes = cells.map(cellSize);
  const cols = tidyColumns(sizes);
  const rows = Math.ceil(cells.length / cols);
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...sizes.filter((_, i) => i % cols === c).map((s) => s.width)));
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(0, ...sizes.slice(r * cols, r * cols + cols).map((s) => s.height)));
  const width = colW.reduce((a, b) => a + b, 0) + TIDY_GAP_X * Math.max(0, cols - 1);
  const height = rowH.reduce((a, b) => a + b, 0) + TIDY_GAP_Y * Math.max(0, rows - 1);
  const place = (ox: number, oy: number, out: Map<string, { x: number; y: number }>) => {
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
  };
  return { width, height, place };
}

/**
 * Where every on-canvas artboard goes. The grid's top left is `origin` (default: where the artboards' top left corner is now,
 * so a tidy keeps them where the author was looking). The artboards of an artboard group stay together: each group is laid
 * out as a block of its own (with room around it for its frame) and the blocks go in the grid like any other cell, at the
 * place of the group's first artboard in the list.
 */
export function tidyPositions(p: Project, origin?: { x: number; y: number }): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const cells = tidyCells(p);
  if (!cells.length) return out;
  const all = cells.flatMap((c) => c.boards);
  const ox = origin?.x ?? Math.min(...all.map((a) => a.canvasX));
  const oy = origin?.y ?? Math.min(...all.map((a) => a.canvasY));
  const known = new Set((p.artboardGroups ?? []).map((g) => g.id));
  type Unit = { cells: TidyCell[]; grouped: boolean };
  const units: Unit[] = [];
  const byGroup = new Map<string, Unit>();
  for (const cell of cells) {
    const g = cell.boards[0].group;
    if (g && known.has(g)) {
      let u = byGroup.get(g);
      if (!u) {
        u = { cells: [], grouped: true };
        byGroup.set(g, u);
        units.push(u);
      }
      u.cells.push(cell);
    } else units.push({ cells: [cell], grouped: false });
  }
  const grids = units.map((u) => {
    const g = gridOf(u.cells);
    return u.grouped ? { width: g.width + 2 * TIDY_GROUP_PAD, height: g.height + TIDY_GROUP_TOP + TIDY_GROUP_PAD, inside: g, dx: TIDY_GROUP_PAD, dy: TIDY_GROUP_TOP } : { width: g.width, height: g.height, inside: g, dx: 0, dy: 0 };
  });
  //the units are the cells of an outer grid of the same kind
  const unitBoards = grids.map((g, i) => ({ id: `u${i}`, width: g.width, height: g.height }) as unknown as Artboard);
  const at = new Map<string, { x: number; y: number }>();
  gridOf(unitBoards.map((b) => ({ boards: [b] }))).place(ox, oy, at);
  grids.forEach((g, i) => g.inside.place(at.get(`u${i}`)!.x + g.dx, at.get(`u${i}`)!.y + g.dy, out));
  //a group's frame takes room at the top left of its block, so keep the artboards' own top left corner where it was (a second
  //tidy then changes nothing instead of creeping down and right)
  if (!origin && units.some((u) => u.grouped)) {
    const sx = ox - Math.min(...[...out.values()].map((v) => v.x));
    const sy = oy - Math.min(...[...out.values()].map((v) => v.y));
    for (const v of out.values()) {
      v.x += sx;
      v.y += sy;
    }
  }
  return out;
}

/**
 * Puts the artboards of a project (or an immer draft of one) where `tidyPositions` says. Returns true when anything moved.
 * With `only`, just those artboards are laid out, among themselves, where their top left corner is now.
 */
export function applyTidy(p: Project, origin?: { x: number; y: number }, only?: ReadonlySet<string>): boolean {
  let moved = false;
  const pos = tidyPositions(only ? { ...p, artboards: p.artboards.filter((a) => only.has(a.id)) } : p, origin);
  for (const a of p.artboards) {
    const at = pos.get(a.id);
    if (!at || (a.canvasX === at.x && a.canvasY === at.y)) continue;
    a.canvasX = at.x;
    a.canvasY = at.y;
    moved = true;
  }
  return moved;
}
