/**
 * The snap grid: cells measured from the artboard origin, a stronger line every `subdivisions` cells. The maths lives
 * here so the canvas (move, resize, draw, pen, nudge) and the tests share it. The person's default is in Preferences, an
 * artboard can carry its own (`artboard.grid`, editor only).
 */

export interface GridSpec {
  size: number;
  subdivisions: number;
}

export const GRID_PRESETS = [1, 2, 4, 5, 8, 10, 12, 16, 20, 24, 32, 48, 50, 64];
export const DEFAULT_GRID: GridSpec = { size: 8, subdivisions: 4 };
export const GRID_SIZE_RANGE = { min: 1, max: 512 };
export const GRID_SUBDIV_RANGE = { min: 1, max: 32 };

const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(lo, Math.min(hi, Math.round(n)));
};

/** A grid made safe: whole numbers inside the allowed range, the default for anything unreadable. */
export function cleanGrid(g: Partial<GridSpec> | null | undefined, fallback: GridSpec = DEFAULT_GRID): GridSpec {
  return {
    size: clampInt(g?.size, GRID_SIZE_RANGE.min, GRID_SIZE_RANGE.max, fallback.size),
    subdivisions: clampInt(g?.subdivisions, GRID_SUBDIV_RANGE.min, GRID_SUBDIV_RANGE.max, fallback.subdivisions),
  };
}

/** The grid in force for an artboard: its own when it has one, else the person's default. */
export function gridFor(ab: { grid?: Partial<GridSpec> } | null | undefined, p: { gridSize: number; gridSubdivisions: number }): GridSpec {
  const base = cleanGrid({ size: p.gridSize, subdivisions: p.gridSubdivisions });
  return ab?.grid ? cleanGrid(ab.grid, base) : base;
}

/** The nearest grid line to a value. */
export function snapScalar(v: number, size: number): number {
  return Math.round(v / size) * size;
}

/** A point put on the nearest crossing. */
export function snapPoint<T extends { x: number; y: number }>(p: T, g: GridSpec): T {
  return { ...p, x: snapScalar(p.x, g.size), y: snapScalar(p.y, g.size) };
}

/**
 * How far to move so the closest of these positions (a selection's left and right, or top and bottom) sits on a grid
 * line. Signed, and never more than half a cell.
 */
export function gridDelta(cands: number[], size: number): number {
  let best = Infinity;
  for (const c of cands) {
    const d = snapScalar(c, size) - c;
    if (Math.abs(d) < Math.abs(best)) best = d;
  }
  return best === Infinity ? 0 : best;
}

/** Smart guides win when they are as close as the grid or closer; otherwise the grid takes it. */
export function pickSnap(smart: number | null, grid: number | null): { d: number; smart: boolean } {
  if (smart !== null && (grid === null || Math.abs(smart) <= Math.abs(grid))) return { d: smart, smart: true };
  return { d: grid ?? 0, smart: false };
}

/**
 * One axis of a drag: the smart guides (the closest of `targets` to any candidate edge, inside `th`) against the grid
 * (when `gridSize` is given). `at` is the guide to draw, only when a smart guide won.
 */
export function snapAxis(cands: number[], targets: number[], th: number, gridSize: number | null, gridCands: number[] = cands): { d: number; at: number | null } {
  let bestD = Infinity;
  let at = 0;
  for (const c of cands)
    for (const t of targets) {
      const d = t - c;
      if (Math.abs(d) < Math.abs(bestD)) {
        bestD = d;
        at = t;
      }
    }
  const smart = Math.abs(bestD) <= th ? bestD : null;
  const pick = pickSnap(smart, gridSize ? gridDelta(gridCands, gridSize) : null);
  return { d: pick.d, at: pick.smart ? at : null };
}

/**
 * An arrow-key nudge with the grid on: step to the next grid line in that direction (so an edge that is off the grid
 * lands on one first), then by whole steps. `steps` is how many cells (Shift nudges a major step).
 */
export function nudgeDelta(edge: number, dir: -1 | 1, size: number, steps = 1): number {
  const cell = edge / size;
  const near = Math.round(cell);
  const onGrid = Math.abs(cell - near) < 1e-6;
  let first: number;
  if (onGrid) first = (near + dir * steps) * size;
  else first = (dir > 0 ? Math.ceil(cell) + (steps - 1) : Math.floor(cell) - (steps - 1)) * size;
  return first - edge;
}

/** Cells moved by a Shift nudge: a major step when there are subdivisions, else ten cells. */
export const shiftSteps = (g: GridSpec): number => (g.subdivisions > 1 ? g.subdivisions : 10);

/** What to draw at a zoom: whether each line set shows and how strongly. Far out the minor lines fade, then the major ones. */
export function gridLook(g: GridSpec, zoom: number): { minor: number; major: number } {
  const fade = (px: number, from: number, to: number) => Math.max(0, Math.min(1, (px - from) / (to - from)));
  const cellPx = g.size * zoom;
  const majorPx = cellPx * g.subdivisions;
  return {
    minor: fade(cellPx, 4, 9),
    major: g.subdivisions > 1 ? fade(majorPx, 6, 14) : fade(cellPx, 4, 9),
  };
}

/** Label for the status area. */
export const gridLabel = (g: GridSpec): string => `${g.size} px${g.subdivisions > 1 ? ` (every ${g.subdivisions})` : ''}`;
