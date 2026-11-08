/**
 * The contrast check for the branded starters, WCAG 2.2 AA, strict like the layout check beside it (layout-check.ts). It runs each
 * page the way the player draws it (bindings and repeaters applied, the page master's layers under and over it, auto layout run),
 * in the page's start state and in each of the starter's `layoutStates` (a feedback page, an open dialog), once for every theme of the
 * project (each colourway and High contrast), and works out what is painted behind every layer. It reports:
 *
 *   text         words under 4.5:1 against what is behind them (3:1 when they are large: 24 px, or 18.66 px and bold). Button labels, input
 *                text, chart labels and the words in chips and feedback notes are all text
 *   placeholder  an input's placeholder (the browser draws it in its own grey, #757575) under 4.5:1 against the input's box
 *   control-edge a button, input or clickable frame whose edge is under 3:1 against what is around it, by its fill or its stroke
 *   focus        the focus ring under 3:1 against what is around the control. The ring is two tones (the player draws it, see focus-ring.ts in
 *                   the player): the `focus` token, 3 px, with a 2 px halo of black or white either side of it, whichever is further from
 *                   the token. It passes when either tone is 3:1 clear of what is around the control, so the one colourway token serves a
 *                   white page, a gradient and a dark panel alike
 *   progress     a progress bar's bar under 3:1 against its track
 *   chart        chart marks under 3:1 against what is behind the chart
 *
 *   focus-brand  the same as focus, on a hero or end page (a gradient behind the control) or on a deep panel. It used to be listed and not failed, back
 *                   when the ring was one colour and no single colour cleared both the white pages and the dark ends of the gradients. It is strict now
 *
 * A disabled control is exempt from all of them (it is dimmed, and WCAG does not ask for more). Gradients are read at the point
 * under the words, not by their worst end. Anything over a picture, a video or another unknown painter is left out, not guessed.
 * Hover and pressed have no look of their own in the player (a layer that wants one binds its colours, and those show up in the
 * state it is bound to), so they are checked where a starter's states reach them and nowhere else.
 */
import { fillList, focusHaloFor, invert, isContainer, isTokenRef, makeColorResolver, multiply, nodeMatrix, apply, type Artboard, type ContainerNode, type Matrix, type Paint, type Project, type RGBA, type SceneNode } from 'interactives-player';
import { contrastRatio, over, requiredRatio, toRgba, withTokens, type RGB } from '../a11y/colour';
import { samplePoints, textExtent } from '../a11y/backdrop';
import { OVERLAY_TAG, type LayoutState } from './kit';
import { filledText, preparedPage } from './layout-check';

export type ContrastKind = 'text' | 'placeholder' | 'control-edge' | 'focus' | 'focus-brand' | 'progress' | 'chart';

/** The kinds that fail the starter-contrast test: all of them. */
export const STRICT_CONTRAST_KINDS: ContrastKind[] = ['text', 'placeholder', 'control-edge', 'focus', 'focus-brand', 'progress', 'chart'];

export interface ContrastFinding {
  kind: ContrastKind;
  /** The theme (colourway) name. */
  theme: string;
  /** The page name, with the state in brackets when it is not the start. */
  page: string;
  layer: string;
  ratio: number;
  need: number;
  detail: string;
}

/** Chrome's own placeholder grey (the player leaves the placeholder to the browser). */
const PLACEHOLDER: RGB = [117, 117, 117];
const EDGE_GAP = 3.5;
const r2 = (v: number) => Math.round(v * 100) / 100;
const hex = (c: readonly number[]) => `#${[c[0], c[1], c[2]].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

// ------------------------------------------------------------------ what is painted where

type Spec = { kind: 'solid'; c: RGBA } | { kind: 'linear'; deg: number; stops: { o: number; c: RGBA }[] } | { kind: 'radial'; stops: { o: number; c: RGBA }[] };

interface Paint1 {
  inv: Matrix;
  w: number;
  h: number;
  ellipse: boolean;
  spec: Spec;
  alpha: number;
  clips: { inv: Matrix; w: number; h: number }[];
  /** A painter this check cannot read (a picture, a video, a blend): a point under it is unknown. */
  unknown?: boolean;
}

/** What a paint is made of, or null when it paints nothing here (a colour that cannot be read, a picture: those are `unknown` where they matter). */
function specOf(p: Paint | null | undefined): Spec | 'unknown' | null {
  if (!p || p.visible === false) return null;
  if (p.blend && p.blend !== 'normal') return 'unknown';
  if (p.type === 'solid') {
    const c = toRgba(p.color);
    //(a clear fill is an invisible hit area, which has no edge to see)
    const a = c ? c[3] * (typeof p.opacity === 'number' ? p.opacity : 1) : 0;
    return c && a > 0.05 ? { kind: 'solid', c: [c[0], c[1], c[2], a] } : null;
  }
  if (p.type === 'linear' || p.type === 'radial') {
    const stops = [...(p.stops ?? [])].sort((a, b) => a.offset - b.offset).map((s) => ({ o: s.offset, c: toRgba(s.color) }));
    if (!stops.length || stops.some((s) => !s.c)) return null;
    const list = stops as { o: number; c: RGBA }[];
    return p.type === 'linear' ? { kind: 'linear', deg: p.angle ?? 180, stops: list } : { kind: 'radial', stops: list };
  }
  return 'unknown';
}

function stopsAt(stops: { o: number; c: RGBA }[], t: number): RGBA {
  if (t <= stops[0].o) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].o) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = b.o === a.o ? 1 : (t - a.o) / (b.o - a.o);
      return [0, 1, 2, 3].map((j) => a.c[j] + (b.c[j] - a.c[j]) * k) as unknown as RGBA;
    }
  }
  return stops[stops.length - 1].c;
}

/** The colour of a paint at a point of its layer (layer pixels). */
function colourIn(p: Paint1, x: number, y: number): RGBA {
  const s = p.spec;
  if (s.kind === 'solid') return s.c;
  if (s.kind === 'linear') {
    const rad = (s.deg * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    const len = Math.abs(p.w * dx) + Math.abs(p.h * dy) || 1;
    return stopsAt(s.stops, ((x - p.w / 2) * dx + (y - p.h / 2) * dy) / len + 0.5);
  }
  const reach = Math.hypot(p.w, p.h) / 2 || 1;
  return stopsAt(s.stops, Math.hypot(x - p.w / 2, y - p.h / 2) / reach);
}

function inShape(p: Paint1, x: number, y: number): { x: number; y: number } | null {
  for (const c of p.clips) {
    const q = apply(c.inv, x, y);
    if (q.x < 0 || q.y < 0 || q.x > c.w || q.y > c.h) return null;
  }
  const q = apply(p.inv, x, y);
  if (p.ellipse) {
    const rx = p.w / 2;
    const ry = p.h / 2;
    if (rx <= 0 || ry <= 0 || ((q.x - rx) / rx) ** 2 + ((q.y - ry) / ry) ** 2 > 1) return null;
    return q;
  }
  return q.x >= 0 && q.y >= 0 && q.x <= p.w && q.y <= p.h ? q : null;
}

interface Entry {
  node: SceneNode;
  m: Matrix;
  alpha: number;
  /** How many paints were laid down before the layer, and after it (a button's own fill is in between). */
  before: number;
  after: number;
  /** The layer is disabled (or inside something that is), so exempt. */
  exempt: boolean;
}

interface Sheet {
  base: RGB;
  /** The page's size: points off it are not on the page (words running off it are the layout check's finding, not this one's). */
  w: number;
  h: number;
  paints: Paint1[];
  entries: Entry[];
}

const OPAQUE_THINGS = new Set(['video', 'embed', 'draw', 'shader', 'instance', 'image']);

function sheetOf(page: Artboard, nodes: SceneNode[]): Sheet {
  const paints: Paint1[] = [];
  const entries: Entry[] = [];
  const bg = specOf(page.background);
  const id: Matrix = [1, 0, 0, 1, 0, 0];
  const NONE: Spec = { kind: 'solid', c: [0, 0, 0, 0] };
  if (bg === 'unknown') paints.push({ inv: invert(id), w: page.width, h: page.height, ellipse: false, spec: NONE, alpha: 1, clips: [], unknown: true });
  else if (bg) paints.push({ inv: invert(id), w: page.width, h: page.height, ellipse: false, spec: bg, alpha: 1, clips: [] });
  const visit = (list: SceneNode[], parentM: Matrix, alpha: number, clips: Paint1['clips'], exempt: boolean) => {
    for (const n of list) {
      if (n.visible === false || n.opacity === 0) continue;
      const m = multiply(parentM, nodeMatrix(n));
      const a = alpha * (typeof n.opacity === 'number' ? n.opacity : 1);
      //(a layer tagged as an overlay sits over others on purpose, so what is behind it is not one thing to be read against)
      const off = exempt || !!(n as { disabled?: boolean }).disabled || ((n as { tags?: string[] }).tags ?? []).includes(OVERLAY_TAG);
      const entry: Entry = { node: n, m, alpha: a, before: paints.length, after: paints.length, exempt: off };
      const own: Paint1[] = [];
      const hole = () => own.push({ inv: invert(m), w: n.width, h: n.height, ellipse: false, spec: NONE, alpha: a, clips, unknown: true });
      if (OPAQUE_THINGS.has(n.type)) hole();
      else if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'frame' || n.type === 'button' || n.type === 'input' || n.type === 'polygon' || n.type === 'star' || n.type === 'path' || n.type === 'progress') {
        for (const p of fillList(n as never)) {
          const s = specOf(p);
          if (s === 'unknown') hole();
          else if (s) own.push({ inv: invert(m), w: n.width, h: n.height, ellipse: n.type === 'ellipse', spec: s, alpha: a, clips });
        }
      }
      paints.push(...own);
      entry.after = paints.length;
      entries.push(entry);
      if (isContainer(n)) {
        const f = n as ContainerNode & { clip?: boolean; scroll?: string };
        const inner = n.type === 'frame' && (f.clip || (f.scroll && f.scroll !== 'none')) ? [...clips, { inv: invert(m), w: n.width, h: n.height }] : clips;
        visit(n.children, m, a, inner, off);
      }
    }
  };
  visit(nodes, id, 1, [], false);
  return { base: [255, 255, 255], w: page.width, h: page.height, paints, entries };
}

/** The colour at a point of the page with the first `upTo` paints laid down, or null when something unknown went down under it. */
function backdrop(sheet: Sheet, upTo: number, x: number, y: number): RGB | null {
  let c: RGB = sheet.base;
  for (let i = 0; i < upTo; i++) {
    const p = sheet.paints[i];
    const q = inShape(p, x, y);
    if (!q) continue;
    if (p.unknown) return null;
    const top = colourIn(p, q.x, q.y);
    c = over(top, c, p.alpha);
  }
  return c;
}

/** The themes' colour of a colour value (a token or a plain colour), as it reads in the theme being run. */
const rgbaOf = (v: unknown): RGBA | null => toRgba(v);

// ------------------------------------------------------------------ the checks

interface Ctx {
  project: Project;
  theme: string;
  page: string;
  out: ContrastFinding[];
  focus: RGBA | null;
  /** The page has a gradient for a background. */
  gradient: boolean;
}

const label = (n: SceneNode, shown?: string) => (shown ? `${n.name} "${shown.replace(/\s+/g, ' ').slice(0, 30)}"` : n.name);

function isControl(n: SceneNode): boolean {
  if (n.type === 'button' || n.type === 'input') return true;
  const x = n as SceneNode & { role?: string; focusable?: boolean; draggable?: unknown };
  return (n.type === 'frame' || n.type === 'group') && (x.role === 'button' || x.role === 'checkbox' || x.role === 'radio' || !!x.focusable);
}

/** Midpoints of the four sides of a layer, just inside and just outside it, in page pixels. */
function edges(e: Entry): { inside: { x: number; y: number }; outside: { x: number; y: number }; local: { x: number; y: number } }[] {
  const { width: w, height: h } = e.node;
  const pts: [number, number, number, number][] = [
    [0, h / 2, -1, 0],
    [w, h / 2, 1, 0],
    [w / 2, 0, 0, -1],
    [w / 2, h, 0, 1],
  ];
  return pts.map(([x, y, dx, dy]) => ({
    local: { x, y },
    inside: apply(e.m, x - dx * 1.5, y - dy * 1.5),
    outside: apply(e.m, x + dx * EDGE_GAP, y + dy * EDGE_GAP),
  }));
}

function checkText(cx: Ctx, sheet: Sheet, e: Entry, shown: string): void {
  const n = e.node as SceneNode & { color?: unknown; fontSize?: number; fontWeight?: number; runs?: { text: string; color?: string; fontSize?: number; fontWeight?: number }[] };
  const size = n.fontSize ?? 16;
  const weight = n.fontWeight ?? 400;
  const runs = n.runs?.filter((r) => r.text.trim() && (r.color || r.fontSize || r.fontWeight)) ?? [];
  const uses: { colour: unknown; need: number }[] = [];
  const baseUsed = !n.runs?.length || n.runs.some((r) => r.text.trim() && !r.fontSize && !r.color);
  if (baseUsed) uses.push({ colour: n.color, need: requiredRatio(size, weight) });
  for (const r of runs) uses.push({ colour: r.color || n.color, need: requiredRatio(r.fontSize ?? size, r.fontWeight ?? weight) });
  const pts = samplePoints(e.m, textExtent(e.node)).filter((p) => p.x >= 0 && p.y >= 0 && p.x <= sheet.w && p.y <= sheet.h);
  for (const u of uses) {
    const rgba = rgbaOf(u.colour);
    if (!rgba) continue;
    let worst = Infinity;
    for (const p of pts) {
      const bg = backdrop(sheet, e.after, p.x, p.y);
      if (!bg) continue;
      worst = Math.min(worst, contrastRatio(over(rgba, bg, e.alpha), bg));
    }
    if (worst < u.need) cx.out.push({ kind: 'text', theme: cx.theme, page: cx.page, layer: label(e.node, shown), ratio: r2(worst), need: u.need, detail: `${typeof u.colour === 'string' ? hex(rgba) : '?'} at ${size}px${weight >= 600 ? ` weight ${weight}` : ''} over what is behind it` });
  }
}

const haloOf = (c: RGBA): RGB => (focusHaloFor([c[0], c[1], c[2]]) === '#ffffff' ? [255, 255, 255] : [0, 0, 0]);

function checkControl(cx: Ctx, sheet: Sheet, e: Entry): void {
  const n = e.node as SceneNode & { stroke?: { paint: Paint; width: number } | null; strokes?: unknown[] };
  const fillSpec = fillList(n as never).map(specOf).find((s): s is Spec => !!s && s !== 'unknown');
  let strokeSpec = n.stroke && n.stroke.width >= 1 ? specOf(n.stroke.paint) : null;
  const ownPaint = sheet.paints.slice(e.before, e.after)[0];
  //A clickable frame is a row, a card or a marker: its words (or picture) say it is there, so it only has an edge to check when someone drew one
  //(a stroke in a colour of its own, not the fill's)
  const frameLike = n.type === 'frame' || n.type === 'group';
  const fillSolid = fillSpec && fillSpec.kind === 'solid' ? fillSpec.c : null;
  if (frameLike && strokeSpec && strokeSpec !== 'unknown' && strokeSpec.kind === 'solid' && fillSolid && contrastRatio(over(strokeSpec.c, [fillSolid[0], fillSolid[1], fillSolid[2]]), [fillSolid[0], fillSolid[1], fillSolid[2]]) < 1.15) strokeSpec = null;
  const edgeMatters = !frameLike || !!strokeSpec;
  let worst = Infinity;
  let focusWorst = Infinity;
  let any = false;
  let darkAround = false;
  for (const side of edges(e)) {
    const out = backdrop(sheet, e.before, side.outside.x, side.outside.y);
    if (!out) continue;
    any = true;
    let best = 0;
    if (fillSpec && ownPaint) {
      const inside = over(colourIn(ownPaint, side.local.x, side.local.y), backdrop(sheet, e.before, side.inside.x, side.inside.y) ?? out, e.alpha);
      best = Math.max(best, contrastRatio(inside, out));
    }
    if (strokeSpec && strokeSpec !== 'unknown' && strokeSpec.kind === 'solid') best = Math.max(best, contrastRatio(over(strokeSpec.c, out, e.alpha), out));
    worst = Math.min(worst, best);
    //the ring is two tones: it shows when either one is clear of what is around the control
    if (cx.focus) focusWorst = Math.min(focusWorst, Math.max(contrastRatio(over(cx.focus, out, 1), out), contrastRatio(haloOf(cx.focus), out)));
    //(under 3.4:1 against black is a luminance under 0.12)
    if (contrastRatio(out, [0, 0, 0]) < 3.4) darkAround = true;
  }
  if (!any) return;
  //a control with nothing painted (a hit area over a picture, say) has no edge to see
  if (edgeMatters && (fillSpec || strokeSpec) && worst < 3) cx.out.push({ kind: 'control-edge', theme: cx.theme, page: cx.page, layer: label(e.node, (n as { label?: string }).label), ratio: r2(worst), need: 3, detail: 'its fill or stroke against what is around it' });
  if (cx.focus && focusWorst < 3) cx.out.push({ kind: cx.gradient || darkAround ? 'focus-brand' : 'focus', theme: cx.theme, page: cx.page, layer: label(e.node, (n as { label?: string }).label), ratio: r2(focusWorst), need: 3, detail: `the focus ring ${hex(cx.focus)} with its ${focusHaloFor([cx.focus[0], cx.focus[1], cx.focus[2]])} halo, against what is around it` });
}

function checkPage(cx: Ctx, page: Artboard, nodes: SceneNode[], scope: Parameters<typeof filledText>[1]): void {
  const sheet = sheetOf(page, nodes);
  for (const e of sheet.entries) {
    if (e.exempt) continue;
    const n = e.node;
    if (n.type === 'text') {
      const words = filledText((n as { text?: string }).text ?? '', scope);
      if (words.trim()) checkText(cx, sheet, e, words);
    } else if (n.type === 'button') {
      const b = n as { label?: string };
      if (b.label?.trim()) checkText(cx, sheet, e, b.label);
      checkControl(cx, sheet, e);
    } else if (n.type === 'input') {
      const i = n as { value?: string; placeholder?: string; inputType?: string };
      checkControl(cx, sheet, e);
      if (i.inputType === 'checkbox' || i.inputType === 'range') continue;
      checkText(cx, sheet, e, i.value || i.placeholder || 'Your answer');
      if (i.placeholder?.trim()) {
        const bg = backdrop(sheet, e.after, ...(Object.values(apply(e.m, 12, n.height / 2)) as [number, number]));
        if (bg) {
          const ratio = contrastRatio(PLACEHOLDER, bg);
          if (ratio < 4.5) cx.out.push({ kind: 'placeholder', theme: cx.theme, page: cx.page, layer: label(n, i.placeholder), ratio: r2(ratio), need: 4.5, detail: `the browser's placeholder grey ${hex(PLACEHOLDER)} on the input's box` });
        }
      }
    } else if (isControl(n)) checkControl(cx, sheet, e);
    else if (n.type === 'progress') {
      const p = n as { barFill?: Paint | null; fill?: Paint | null; semantics?: string };
      if (p.semantics === 'none') continue;
      const bar = specOf(p.barFill);
      const track = specOf(p.fill);
      if (bar && bar !== 'unknown' && bar.kind === 'solid') {
        const trackColour = track && track !== 'unknown' && track.kind === 'solid' ? over(track.c, backdrop(sheet, e.before, ...(Object.values(apply(e.m, n.width / 2, n.height / 2)) as [number, number])) ?? [255, 255, 255], 1) : backdrop(sheet, e.before, ...(Object.values(apply(e.m, n.width / 2, n.height / 2)) as [number, number]));
        if (trackColour) {
          const ratio = contrastRatio(over(bar.c, trackColour, e.alpha), trackColour);
          if (ratio < 3) cx.out.push({ kind: 'progress', theme: cx.theme, page: cx.page, layer: label(n), ratio: r2(ratio), need: 3, detail: 'the bar against its track' });
        }
      }
    } else if (n.type === 'chart') {
      const ch = n as { colors?: string[]; color?: unknown; fontSize?: number; labelKey?: string };
      const bg = backdrop(sheet, e.after, ...(Object.values(apply(e.m, n.width / 2, n.height / 2)) as [number, number]));
      if (!bg) continue;
      for (const c of ch.colors ?? []) {
        const rgba = rgbaOf(c);
        if (!rgba) continue;
        const ratio = contrastRatio(over(rgba, bg, e.alpha), bg);
        if (ratio < 3) cx.out.push({ kind: 'chart', theme: cx.theme, page: cx.page, layer: label(n), ratio: r2(ratio), need: 3, detail: `the mark colour ${hex(rgba)} against what is behind the chart` });
      }
      const words = rgbaOf(ch.color);
      if (words) {
        const ratio = contrastRatio(over(words, bg, e.alpha), bg);
        const need = requiredRatio(ch.fontSize ?? 14, 400);
        if (ratio < need) cx.out.push({ kind: 'chart', theme: cx.theme, page: cx.page, layer: label(n), ratio: r2(ratio), need, detail: `the labels ${hex(words)} against what is behind the chart` });
      }
    }
  }
}

/**
 * Every contrast failure on every page of a project (masters and library copies are not pages), as the pages start and in each of the
 * extra `states`, for every theme the project has (or just the named ones).
 */
export function checkProjectContrast(project: Project, states: LayoutState[] = [], themeIds?: string[]): ContrastFinding[] {
  const out: ContrastFinding[] = [];
  const themes = project.themes;
  if (!themes) return out;
  const focusToken = themes.tokens.find((t) => t.name === 'color/focus');
  //the layout does not depend on the theme: draw each page once, then read it under every theme
  const drawnPages: { page: Artboard; label: string; nodes: SceneNode[]; scope: Parameters<typeof filledText>[1] }[] = [];
  for (const page of project.artboards) {
    if (page.isMaster || page.library || page.canvasHidden) continue;
    const first = preparedPage(project, page);
    drawnPages.push({ page, label: page.name, ...first });
    for (const state of states) {
      const named = state.page === undefined ? null : Array.isArray(state.page) ? state.page : [state.page];
      if (named && !named.includes(page.name)) continue;
      drawnPages.push({ page, label: `${page.name} [${state.label}]`, ...preparedPage(project, page, state) });
    }
  }
  for (const theme of themes.list) {
    if (themeIds && !themeIds.includes(theme.id)) continue;
    withTokens(makeColorResolver(themes, theme.id), () => {
      const focus = focusToken ? rgbaOf(`token:${focusToken.id}`) : null;
      for (const d of drawnPages) checkPage({ project, theme: theme.name, page: d.label, out, focus, gradient: d.page.background?.type === 'linear' || d.page.background?.type === 'radial' }, d.page, d.nodes, d.scope);
    });
  }
  return out;
}

// ------------------------------------------------------------------ the tokens themselves

export interface TokenPair {
  /** What it is, for the report. */
  name: string;
  fg: string;
  bg: string;
  need: number;
}

/**
 * The token pairs the kit and the starters put together everywhere, so a colourway that breaks one is named by the pair rather than
 * by the dozens of layers that use it. `text` pairs need 4.5:1 (large text 3:1 is not assumed anywhere in the list), `ui` pairs 3:1.
 * Gradient ends and the deep colour are brand colours, so they are on the left only when they are the backdrop.
 */
export const TOKEN_PAIRS: TokenPair[] = [
  ...(['background', 'surface', 'surfaceMuted'] as const).flatMap((bg) => [
    { name: `text on ${bg}`, fg: 'text', bg, need: 4.5 },
    { name: `muted on ${bg}`, fg: 'muted', bg, need: 4.5 },
    { name: `link on ${bg}`, fg: 'link', bg, need: 4.5 },
    { name: `success on ${bg}`, fg: 'success', bg, need: 4.5 },
    { name: `error on ${bg}`, fg: 'error', bg, need: 4.5 },
    { name: `warning on ${bg}`, fg: 'warning', bg, need: 4.5 },
  ]),
  { name: 'success on its surface', fg: 'success', bg: 'successSurface', need: 4.5 },
  { name: 'error on its surface', fg: 'error', bg: 'errorSurface', need: 4.5 },
  { name: 'warning on its surface', fg: 'warning', bg: 'warningSurface', need: 4.5 },
  { name: 'text on the success surface', fg: 'text', bg: 'successSurface', need: 4.5 },
  { name: 'text on the error surface', fg: 'text', bg: 'errorSurface', need: 4.5 },
  { name: 'text on the warning surface', fg: 'text', bg: 'warningSurface', need: 4.5 },
  { name: 'button label on the button', fg: 'onButton', bg: 'button', need: 4.5 },
  { name: 'primary label on primary', fg: 'onPrimary', bg: 'primary', need: 4.5 },
  { name: 'label on deep', fg: 'onDeep', bg: 'deep', need: 4.5 },
  { name: 'focus ring on background', fg: 'focus', bg: 'background', need: 3 },
  { name: 'focus ring on surface', fg: 'focus', bg: 'surface', need: 3 },
  { name: 'focus ring on surfaceMuted', fg: 'focus', bg: 'surfaceMuted', need: 3 },
  { name: 'focus ring on deep', fg: 'focus', bg: 'deep', need: 3 },
  { name: 'button edge on background', fg: 'button', bg: 'background', need: 3 },
  { name: 'button edge on surface', fg: 'button', bg: 'surface', need: 3 },
  { name: 'control edge (border) on background', fg: 'border', bg: 'background', need: 3 },
  { name: 'control edge (border) on surface', fg: 'border', bg: 'surface', need: 3 },
];

export interface TokenPairResult extends TokenPair {
  theme: string;
  ratio: number;
}

/** Every pair of `TOKEN_PAIRS` in every theme of a project, with its ratio. Pairs where either token is missing are left out. */
export function tokenPairRatios(project: Project): TokenPairResult[] {
  const themes = project.themes;
  if (!themes) return [];
  const ref = (name: string) => {
    const kebab = name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const t = themes.tokens.find((x) => x.name === `color/${kebab}` || x.name === `brand/${kebab}`);
    return t ? `token:${t.id}` : null;
  };
  const out: TokenPairResult[] = [];
  for (const theme of themes.list) {
    withTokens(makeColorResolver(themes, theme.id), () => {
      for (const p of TOKEN_PAIRS) {
        const a = ref(p.fg);
        const b = ref(p.bg);
        const fg = a && toRgba(a);
        const bg = b && toRgba(b);
        if (!fg || !bg) continue;
        out.push({ ...p, theme: theme.name, ratio: r2(contrastRatio(over(fg, bg.slice(0, 3) as RGB), bg.slice(0, 3) as RGB)) });
      }
    });
  }
  return out;
}

export { isTokenRef };
