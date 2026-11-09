import { apply, isContainer, type Artboard, type SceneNode } from 'interactives-player';
import { nodeToArtboard, selectionBounds, type Rect } from '../store/doc';
import { boneGlyphs } from './rig';
import { prefs, setPrefs, type Prefs } from './prefs';
import { gridDelta } from './grid';

/**
 * Snapping, one model. Every target (grid, artboard, layers, guides, spacing, pixels, points) is a switch in Preferences, a
 * menu on the tool bar and the canvas menu, and each hands the dragging code its candidates; the nearest one inside the
 * snap distance wins (the grid, which always has a line within half a cell, only when nothing else is as close). Ctrl
 * turns the lot off while it is held. The maths is here so the canvas (move, resize, draw, pen, point edits, artboards)
 * and the tests share it.
 */

export type SnapKind = 'grid' | 'artboard' | 'layers' | 'guides' | 'spacing' | 'pixels' | 'points';

export interface Pt {
  x: number;
  y: number;
}

/** What the menus and Preferences list, in order. `pref` is the preference that holds the switch. */
export const SNAP_ITEMS: { kind: SnapKind; label: string; pref: keyof Prefs; tip: string }[] = [
  { kind: 'grid', label: 'Grid', pref: 'snapGrid', tip: 'Land on the grid lines (Ctrl+\'). Show grid draws them' },
  { kind: 'artboard', label: 'Artboard', pref: 'snapArtboard', tip: "The artboard's edges and centre. Artboards snap to other artboards' edges" },
  { kind: 'layers', label: 'Layers', pref: 'snapLayers', tip: "Edges and centres of other layers (the ones beside it, or all of them: see Layers: all, not just siblings)" },
  { kind: 'guides', label: 'Guides', pref: 'snapGuides', tip: 'Ruler guides (drag out of a ruler to make one)' },
  { kind: 'spacing', label: 'Spacing', pref: 'snapSpacing', tip: 'Equal gaps between neighbouring layers, with the distance shown' },
  { kind: 'pixels', label: 'Pixels', pref: 'snapPixels', tip: 'Whole-pixel positions and sizes. Off lets a layer sit between pixels' },
  { kind: 'points', label: 'Points', pref: 'snapPoints', tip: 'Path anchor points and bone joints, for the pen and when editing path points' },
];

export const SNAP_DISTANCES = [2, 4, 6, 8, 10, 12, 16, 24];
export const SNAP_DISTANCE_RANGE = { min: 2, max: 24 };
export const DEFAULT_SNAP_DISTANCE = 6;

/** Where each kind draws its line (the canvas stylesheet colours them by the same names). */
export const SNAP_LABEL: Record<SnapKind, string> = {
  grid: 'Grid',
  artboard: 'Artboard',
  layers: 'Layers',
  guides: 'Guides',
  spacing: 'Spacing',
  pixels: 'Pixels',
  points: 'Points',
};

export interface SnapSettings {
  on: boolean;
  grid: boolean;
  artboard: boolean;
  layers: boolean;
  /** Layers target: every layer on the artboard, not only the ones beside the dragged layer. */
  layersAll: boolean;
  guides: boolean;
  spacing: boolean;
  pixels: boolean;
  points: boolean;
  /** Screen pixels. */
  distance: number;
}

export const SNAP_NONE: SnapSettings = { on: false, grid: false, artboard: false, layers: false, layersAll: false, guides: false, spacing: false, pixels: false, points: false, distance: DEFAULT_SNAP_DISTANCE };

type PrefSlice = Pick<Prefs, 'snapOn' | 'snapGrid' | 'snapArtboard' | 'snapLayers' | 'snapLayersAll' | 'snapGuides' | 'snapSpacing' | 'snapPixels' | 'snapPoints' | 'snapDistance'>;

/** The settings the preferences hold, with the master switch folded in: with it off nothing is on. */
export function snapSettings(p: PrefSlice = prefs()): SnapSettings {
  const d = Math.min(SNAP_DISTANCE_RANGE.max, Math.max(SNAP_DISTANCE_RANGE.min, Math.round(Number(p.snapDistance) || DEFAULT_SNAP_DISTANCE)));
  if (!p.snapOn) return { ...SNAP_NONE, distance: d };
  return { on: true, grid: p.snapGrid, artboard: p.snapArtboard, layers: p.snapLayers, layersAll: p.snapLayersAll, guides: p.snapGuides, spacing: p.snapSpacing, pixels: p.snapPixels, points: p.snapPoints, distance: d };
}

/** What a pointer event snaps to: everything the settings say, nothing while Ctrl (Cmd) is held. */
export function snapFor(e: { ctrlKey: boolean; metaKey: boolean }, p: PrefSlice = prefs()): SnapSettings {
  const s = snapSettings(p);
  return e.ctrlKey || e.metaKey ? { ...SNAP_NONE, distance: s.distance } : s;
}

/** Is any target on at all (the tool bar button's pressed state, and whether the canvas has anything to work out). */
export const snapAny = (s: SnapSettings): boolean => s.on && (s.grid || s.artboard || s.layers || s.guides || s.spacing || s.pixels || s.points);

/**
 * Flip one choice. Turning a target on while snapping is off switches snapping on too (the other targets keep what they were),
 * so the click does something you can see. `on` is the master switch, `layersAll` the reach of Layers.
 */
export function toggleSnap(which: SnapKind | 'on' | 'layersAll'): void {
  const p = prefs();
  const key: keyof Prefs = which === 'on' ? 'snapOn' : which === 'layersAll' ? 'snapLayersAll' : SNAP_ITEMS.find((i) => i.kind === which)!.pref;
  const next = !p[key];
  setPrefs({ [key]: next, ...(next && which !== 'on' && !p.snapOn ? { snapOn: true } : {}) } as Partial<Prefs>);
}

export const pixelRound = (s: SnapSettings) => (v: number): number => (s.pixels ? Math.round(v) : Math.round(v * 100) / 100);

// ---------------------------------------------------------------------------------------------------------------------
// Targets

export interface Target {
  at: number;
  kind: SnapKind;
}

export interface SnapSet {
  xs: Target[];
  ys: Target[];
  /** Other layers' boxes (artboard space), for equal gaps. */
  rects: Rect[];
  /** Path anchors and bone joints. */
  points: Pt[];
}

export const EMPTY_SET: SnapSet = { xs: [], ys: [], rects: [], points: [] };

const edges = (r: Rect, kind: SnapKind, xs: Target[], ys: Target[]) => {
  xs.push({ at: r.x, kind }, { at: r.x + r.width / 2, kind }, { at: r.x + r.width, kind });
  ys.push({ at: r.y, kind }, { at: r.y + r.height / 2, kind }, { at: r.y + r.height, kind });
};

/**
 * The candidate lines for a drag on an artboard: the artboard, ruler guides (the page's, and the project's when given), other layers (the siblings of `parentId`, or
 * all of them) and their gaps, and path points. `exclude` is what is being dragged (and what it holds).
 */
export function buildTargets(ab: Artboard, s: SnapSettings, exclude: Set<string>, parentId: string | null = null, projectGuides?: { x: number[]; y: number[] }): SnapSet {
  const xs: Target[] = [];
  const ys: Target[] = [];
  const rects: Rect[] = [];
  const points: Pt[] = [];
  if (!s.on) return { xs, ys, rects, points };
  if (s.artboard) {
    xs.push({ at: 0, kind: 'artboard' }, { at: ab.width / 2, kind: 'artboard' }, { at: ab.width, kind: 'artboard' });
    ys.push({ at: 0, kind: 'artboard' }, { at: ab.height / 2, kind: 'artboard' }, { at: ab.height, kind: 'artboard' });
  }
  if (s.guides) {
    for (const x of ab.guides?.x ?? []) xs.push({ at: x, kind: 'guides' });
    for (const y of ab.guides?.y ?? []) ys.push({ at: y, kind: 'guides' });
    // the project's guides snap on every page they show on (the ones that fall on it)
    for (const x of projectGuides?.x ?? []) if (x >= 0 && x <= ab.width) xs.push({ at: x, kind: 'guides' });
    for (const y of projectGuides?.y ?? []) if (y >= 0 && y <= ab.height) ys.push({ at: y, kind: 'guides' });
  }
  if (s.layers || s.spacing) {
    const visit = (list: SceneNode[], deep: boolean) => {
      for (const n of list) {
        if (exclude.has(n.id) || !n.visible) continue;
        const b = selectionBounds(ab, [n.id]);
        if (b) {
          rects.push(b);
          if (s.layers) edges(b, 'layers', xs, ys);
        }
        if (deep && isContainer(n)) visit(n.children, true);
      }
    };
    if (s.layersAll) visit(ab.children, true);
    else {
      const parent = parentId ? findContainer(ab.children, parentId) : null;
      visit(parent ? parent.children : ab.children, false);
    }
  }
  if (s.points) {
    walkNodes(ab.children, (n) => {
      if (exclude.has(n.id) || !n.visible || n.type !== 'path') return;
      const m = nodeToArtboard(ab, n.id);
      for (const sp of n.paths) for (const pt of sp.points) points.push(apply(m, pt.x, pt.y));
    });
    for (const g of boneGlyphs(ab.children)) if (!exclude.has(g.id)) points.push(g.base, g.tip);
  }
  return { xs, ys, rects, points };
}

function findContainer(list: SceneNode[], id: string): Extract<SceneNode, { children: SceneNode[] }> | null {
  for (const n of list) {
    if (!isContainer(n)) continue;
    if (n.id === id) return n;
    const f = findContainer(n.children, id);
    if (f) return f;
  }
  return null;
}

function walkNodes(list: SceneNode[], fn: (n: SceneNode) => void): void {
  for (const n of list) {
    fn(n);
    if (isContainer(n)) walkNodes(n.children, fn);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// One axis

export interface AxisResult {
  /** How far to move so a candidate lands on the winner. */
  d: number;
  /** The line to draw, when something other than a bare grid line won (`at` is where it runs). */
  hit: Target | null;
}

/**
 * The closest of `targets` to any candidate position, within `th`, against the grid (when `gridSize` is given, always
 * within half a cell). A target that is as close as the grid or closer wins; otherwise the grid takes it.
 */
export function solveAxis(cands: number[], targets: Target[], th: number, gridSize: number | null, gridCands: number[] = cands): AxisResult {
  let best: { d: number; t: Target } | null = null;
  for (const c of cands)
    for (const t of targets) {
      const d = t.at - c;
      if (Math.abs(d) <= th && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
    }
  const g = gridSize ? gridDelta(gridCands, gridSize) : null;
  if (best && (g === null || Math.abs(best.d) <= Math.abs(g))) return { d: best.d, hit: best.t };
  if (g !== null) {
    //the grid line that took it, so the canvas can say so
    const at = gridCands.map((c) => c + g).find((v) => Math.abs(v / gridSize! - Math.round(v / gridSize!)) < 1e-6) ?? 0;
    return { d: g, hit: { at, kind: 'grid' } };
  }
  return { d: 0, hit: null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Equal gaps

export interface Gap {
  axis: 'x' | 'y';
  /** The gap runs from `from` to `to` along `axis`, drawn at `at` on the other. */
  from: number;
  to: number;
  at: number;
  /** The distance, for the label. */
  label: number;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

/**
 * Where to put a box on one axis so its gap to a neighbour matches a gap already between two other layers (or so it sits
 * centred between two). `m` is the box and `others` the layers around it; only the ones sharing its row (for x) or column
 * (for y) count. The answer is the nearest such position for its start edge inside `th`, with the gaps to draw.
 */
function spacingAxis(m: Rect, axis: 'x' | 'y', others: Rect[], th: number): { d: number; gaps: Gap[] } | null {
  const a = axis === 'x' ? 'x' : 'y';
  const sizeKey = axis === 'x' ? 'width' : 'height';
  const bKey = axis === 'x' ? 'y' : 'x';
  const bSize = axis === 'x' ? 'height' : 'width';
  const start = m[a];
  const size = m[sizeKey];
  const mid = m[bKey] + m[bSize] / 2;
  //only layers that share a row (for x) or column (for y) with the box count as neighbours
  const row = others.filter((r) => r[bKey] < m[bKey] + m[bSize] && r[bKey] + r[bSize] > m[bKey]).sort((p, q) => p[a] - q[a]);
  if (row.length < 1) return null;
  const pairs: { l: Rect; r: Rect; g: number }[] = [];
  for (let i = 0; i + 1 < row.length; i++) {
    const l = row[i];
    const r = row[i + 1];
    const g = r[a] - (l[a] + l[sizeKey]);
    if (g > 0.5) pairs.push({ l, r, g });
  }
  const gaps = [...new Set(pairs.map((p) => Math.round(p.g * 2) / 2))];
  type Cand = { pos: number; show: Gap[] };
  const cands: Cand[] = [];
  const gap = (from: number, to: number): Gap => ({ axis, from, to, at: mid, label: Math.round((to - from) * 10) / 10 });
  for (const r of row) {
    for (const g of gaps) {
      // after r, then before r, a gap the same as one that is already there
      const right = r[a] + r[sizeKey] + g;
      const mate = pairs.find((p) => near(p.g, g))!;
      cands.push({ pos: right, show: [gap(r[a] + r[sizeKey], right), gap(mate.l[a] + mate.l[sizeKey], mate.r[a])] });
      const left = r[a] - g - size;
      cands.push({ pos: left, show: [gap(left + size, r[a]), gap(mate.l[a] + mate.l[sizeKey], mate.r[a])] });
    }
  }
  //between two layers, with the same gap each side
  for (const p of pairs) {
    if (p.g <= size) continue;
    const pos = p.l[a] + p.l[sizeKey] + (p.g - size) / 2;
    cands.push({ pos, show: [gap(p.l[a] + p.l[sizeKey], pos), gap(pos + size, p.r[a])] });
  }
  let best: Cand | null = null;
  for (const c of cands) if (Math.abs(c.pos - start) <= th && (!best || Math.abs(c.pos - start) < Math.abs(best.pos - start))) best = c;
  return best ? { d: best.pos - start, gaps: best.show } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// A moved box

export interface MoveResult {
  dx: number;
  dy: number;
  /** Lines to draw, by kind. */
  x: Target[];
  y: Target[];
  gaps: Gap[];
}

/**
 * A box that has been dragged by (dx, dy): how much further to move it. Its edges and centre go to the artboard, layer
 * and guide lines, its outer edges to the grid, and its gaps to equal gaps.
 */
export function snapMoveBox(set: SnapSet, s: SnapSettings, b: Rect, dx: number, dy: number, zoom: number, grid: number | null): MoveResult {
  if (!s.on) return { dx: 0, dy: 0, x: [], y: [], gaps: [] };
  const th = s.distance / zoom;
  const cx = [b.x + dx, b.x + dx + b.width / 2, b.x + dx + b.width];
  const cy = [b.y + dy, b.y + dy + b.height / 2, b.y + dy + b.height];
  //the grid only looks at the outer edges, the centre has no business being on a line
  const sx = solveAxis(cx, set.xs, th, grid, [cx[0], cx[2]]);
  const sy = solveAxis(cy, set.ys, th, grid, [cy[0], cy[2]]);
  let rx = sx.d;
  let ry = sy.d;
  let x = sx.hit ? [sx.hit] : [];
  let y = sy.hit ? [sy.hit] : [];
  let gaps: Gap[] = [];
  if (s.spacing && set.rects.length) {
    const now: Rect = { x: b.x + dx, y: b.y + dy, width: b.width, height: b.height };
    const sp = spacingAxis(now, 'x', set.rects, th);
    if (sp && (!sx.hit || sx.hit.kind === 'grid' || Math.abs(sp.d) < Math.abs(sx.d))) {
      rx = sp.d;
      x = [];
      gaps = [...gaps, ...sp.gaps];
    }
    const sq = spacingAxis(now, 'y', set.rects, th);
    if (sq && (!sy.hit || sy.hit.kind === 'grid' || Math.abs(sq.d) < Math.abs(sy.d))) {
      ry = sq.d;
      y = [];
      gaps = [...gaps, ...sq.gaps];
    }
  }
  return { dx: rx, dy: ry, x, y, gaps };
}

// ---------------------------------------------------------------------------------------------------------------------
// A pointer position (resize, draw, the pen, point edits)

export interface PointResult {
  p: Pt;
  x: Target[];
  y: Target[];
  /** A point (path anchor or bone joint) took it, so both coordinates did. */
  point: boolean;
}

/**
 * A pointer position put on the closest target: a path point or bone joint first when it is within the distance (Points),
 * else each axis on its own against the artboard, layer and guide lines and the grid.
 */
export function snapPointer(set: SnapSet, s: SnapSettings, p: Pt, zoom: number, grid: number | null): PointResult {
  if (!s.on) return { p: { x: p.x, y: p.y }, x: [], y: [], point: false };
  const th = s.distance / zoom;
  if (s.points) {
    let best: Pt | null = null;
    let bd = th;
    for (const q of set.points) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = q;
      }
    }
    if (best) return { p: { x: best.x, y: best.y }, x: [{ at: best.x, kind: 'points' }], y: [{ at: best.y, kind: 'points' }], point: true };
  }
  const sx = solveAxis([p.x], set.xs, th, grid);
  const sy = solveAxis([p.y], set.ys, th, grid);
  return { p: { x: p.x + sx.d, y: p.y + sy.d }, x: sx.hit ? [sx.hit] : [], y: sy.hit ? [sy.hit] : [], point: false };
}

/**
 * An artboard dragged across the canvas: its edges and centre go to the other artboards' (kind `artboard`), its top left
 * to the grid. All in canvas coordinates.
 */
export function snapArtboardBox(others: Rect[], s: SnapSettings, b: Rect, dx: number, dy: number, zoom: number, grid: number | null): MoveResult {
  const set: SnapSet = { xs: [], ys: [], rects: [], points: [] };
  if (s.artboard) for (const r of others) edges(r, 'artboard', set.xs, set.ys);
  return snapMoveBox(set, { ...s, spacing: false }, b, dx, dy, zoom, grid);
}
