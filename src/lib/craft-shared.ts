/**
 * Helpers the VectorCraft and PhotoCraft importers share: 2D matrices, colours, gradients, bezier bounds, path nodes,
 * font lookup and text layer placement.
 */
import { createNode, runsPatch, uid, type FontRef, type Paint, type PathNode, type SceneNode, type SubPath, type TextNode, type TextRun } from 'interactives-player';
import { GOOGLE_BY_KEY, WEIGHT_WORDS, squash } from './psd-import';

// ---------------------------------------------------------------- numbers and matrices

export const round = (v: number, d = 1000): number => Math.round(v * d) / d;
export const finite = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f (the CSS / canvas convention). */
export type M6 = [number, number, number, number, number, number];
export const IDENT: M6 = [1, 0, 0, 1, 0, 0];
/** `m` applied after `n`. */
export const mulM = (m: M6, n: M6): M6 => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
export const applyM = (m: M6, x: number, y: number): { x: number; y: number } => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
export const detM = (m: M6): number => m[0] * m[3] - m[1] * m[2];
/** Uniform scale a matrix applies, for line widths and radii. */
export const scaleOfM = (m: M6): number => Math.sqrt(Math.abs(detM(m))) || 1;
export const translateM = (x: number, y: number): M6 => [1, 0, 0, 1, x, y];
export const rotateM = (rad: number): M6 => [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
export const parseM = (v: unknown): M6 => {
  const a = Array.isArray(v) ? v : (v as { m?: unknown } | null)?.m;
  return Array.isArray(a) && a.length >= 6 && a.slice(0, 6).every((n) => typeof n === 'number' && Number.isFinite(n)) ? (a.slice(0, 6) as M6) : IDENT;
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const boxesTouch = (a: Box, b: Box, pad = 0): boolean => a.x - pad < b.x + b.width && a.x + a.width + pad > b.x && a.y - pad < b.y + b.height && a.y + a.height + pad > b.y;

// ---------------------------------------------------------------- colours

/** Straight RGBA: channels 0-255, alpha 0-1. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/** A CSS colour string, with the alpha multiplied by `alphaMul`. */
export function cssColor(c: RGBA, alphaMul = 1): string {
  const a = Math.max(0, Math.min(1, c.a * alphaMul));
  if (a >= 0.999) return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${round(a)})`;
}

const toSrgb = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** CIE L*a*b* (D50) to sRGB channels 0-255, through XYZ and the Bradford adaptation to D65. */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t: number) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = 0.9642 * f(fx);
  const Y = f(fy);
  const Z = 0.8249 * f(fz);
  const x = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
  const y = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
  const z = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z;
  const lr = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const lg = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const lb = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [toSrgb(Math.max(0, Math.min(1, lr))) * 255, toSrgb(Math.max(0, Math.min(1, lg))) * 255, toSrgb(Math.max(0, Math.min(1, lb))) * 255];
}

/** Naive CMYK (0-1 each) to RGB 0-255: (1 - c)(1 - k). */
export const cmykToRgb = (c: number, m: number, y: number, k: number): [number, number, number] => [(1 - c) * (1 - k) * 255, (1 - m) * (1 - k) * 255, (1 - y) * (1 - k) * 255];

export const mixRgba = (a: RGBA, b: RGBA, t: number): RGBA => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: a.a + (b.a - a.a) * t });

// ---------------------------------------------------------------- gradients

/** A gradient stop at `t` (0-1 along the gradient axis). */
export interface GStop {
  t: number;
  c: RGBA;
}

export function colorAt(stops: GStop[], t: number): RGBA {
  if (!stops.length) return { r: 0, g: 0, b: 0, a: 1 };
  if (t <= stops[0].t) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      return b.t === a.t ? b.c : mixRgba(a.c, b.c, (t - a.t) / (b.t - a.t));
    }
  }
  return stops[stops.length - 1].c;
}

/** Sorted stops, with a stop added in the middle of each pair whose `mids[i]` (0-1 between stop i and i + 1) is not 0.5. */
export function withMidpoints(stops: GStop[], mids: (number | undefined)[] = []): GStop[] {
  const sorted = stops.map((s, i) => ({ s, m: mids[i] })).sort((a, b) => a.s.t - b.s.t);
  const out: GStop[] = [];
  for (let i = 0; i < sorted.length; i++) {
    out.push(sorted[i].s);
    const next = sorted[i + 1];
    const m = sorted[i].m;
    if (next && m !== undefined && Math.abs(m - 0.5) > 0.01 && m > 0 && m < 1) out.push({ t: sorted[i].s.t + (next.s.t - sorted[i].s.t) * m, c: mixRgba(sorted[i].s.c, next.s.c, 0.5) });
  }
  return out;
}

const stopCss = (c: RGBA, alphaMul: number) => cssColor(c, alphaMul);

/**
 * A linear gradient from `p0` to `p1` (in the same coordinates as `b`, the shape's bounds). The renderer draws a linear
 * gradient along a line through the box in box units, so the direction is chosen to be perpendicular to the original
 * isolines once the box is stretched to pixels, and the stops are placed where the original axis crosses that line.
 */
export function linearGradient(stops: GStop[], p0: { x: number; y: number }, p1: { x: number; y: number }, b: Box, alphaMul = 1): Paint {
  const vx = p1.x - p0.x;
  const vy = p1.y - p0.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-9) return { type: 'solid', color: stopCss(colorAt(stops, 1), alphaMul) };
  const w = Math.max(b.width, 1e-3);
  const h = Math.max(b.height, 1e-3);
  let dx = w * vx;
  let dy = h * vy;
  const dl = Math.hypot(dx, dy) || 1;
  dx /= dl;
  dy /= dl;
  const angle = round(((((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360) + 360) % 360, 100);
  const uAt = (s: number) => ((b.x + w * (0.5 + (s - 0.5) * dx) - p0.x) * vx + (b.y + h * (0.5 + (s - 0.5) * dy) - p0.y) * vy) / len2;
  const u0 = uAt(0);
  const u1 = uAt(1);
  const span = u1 - u0;
  if (Math.abs(span) < 1e-9) return { type: 'solid', color: stopCss(colorAt(stops, u0), alphaMul) };
  const out = [{ offset: 0, color: stopCss(colorAt(stops, u0), alphaMul) }];
  for (const s of stops) {
    const o = (s.t - u0) / span;
    if (o > 1e-3 && o < 1 - 1e-3) out.push({ offset: round(o), color: stopCss(s.c, alphaMul) });
  }
  out.push({ offset: 1, color: stopCss(colorAt(stops, u1), alphaMul) });
  out.sort((x, y) => x.offset - y.offset);
  return { type: 'linear', angle, stops: out };
}

/**
 * A radial gradient of radius `R` around `c`. The renderer's radial gradient is centred on the box and reaches the middle
 * of its longer side, so the stops are rescaled to that radius; a centre that is far from the middle is reported in `off`.
 */
export function radialGradient(stops: GStop[], c: { x: number; y: number }, R: number, b: Box, alphaMul = 1): { paint: Paint; off: boolean } {
  const Rbox = Math.max(b.width, b.height, 1e-3) / 2;
  const off = Math.hypot(c.x - (b.x + b.width / 2), c.y - (b.y + b.height / 2)) > 0.1 * Math.max(R, Rbox);
  if (!(R > 1e-9)) return { paint: { type: 'solid', color: stopCss(colorAt(stops, 1), alphaMul) }, off: false };
  const k = R / Rbox;
  const out: { offset: number; color: string }[] = [];
  for (const s of stops) {
    const o = s.t * k;
    if (o < 1 - 1e-3) out.push({ offset: round(Math.max(0, o)), color: stopCss(s.c, alphaMul) });
  }
  if (!out.length || out[0].offset > 0) out.unshift({ offset: 0, color: stopCss(colorAt(stops, 0), alphaMul) });
  out.push({ offset: 1, color: stopCss(colorAt(stops, Math.min(1, 1 / k)), alphaMul) });
  return { paint: { type: 'radial', stops: out }, off };
}

// ---------------------------------------------------------------- paths

export interface AbsPoint {
  x: number;
  y: number;
  /** Absolute positions of the incoming and outgoing handles; left out when the point has none. */
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}
export interface AbsSub {
  closed: boolean;
  pts: AbsPoint[];
}

/** The exact bounds of the outline (bezier extrema, not control points). */
export function absBounds(subs: AbsSub[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (x: number, y: number) => {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const s of subs) {
    const n = s.pts.length;
    for (let i = 0; i < n; i++) {
      const a = s.pts[i];
      add(a.x, a.y);
      const bIdx = i + 1 < n ? i + 1 : s.closed ? 0 : -1;
      if (bIdx < 0) continue;
      const b = s.pts[bIdx];
      const curved = a.outX !== undefined || b.inX !== undefined;
      if (!curved) continue;
      const c1x = a.outX ?? a.x;
      const c1y = a.outY ?? a.y;
      const c2x = b.inX ?? b.x;
      const c2y = b.inY ?? b.y;
      // at each root of a derivative both coordinates are evaluated, so an extreme in x also counts in y
      for (const t of rootsOf(a.x, c1x, c2x, b.x).concat(rootsOf(a.y, c1y, c2y, b.y))) {
        const u = 1 - t;
        add(u * u * u * a.x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b.x, u * u * u * a.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b.y);
      }
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function rootsOf(p0: number, p1: number, p2: number, p3: number): number[] {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const ts: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) ts.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      ts.push((-b + sq) / (2 * a), (-b - sq) / (2 * a));
    }
  }
  return ts.filter((t) => t > 0 && t < 1);
}

/** Local (relative to the box) sub-paths for a path node. */
export function localSubs(subs: AbsSub[], x0: number, y0: number): SubPath[] {
  return subs.map((s) => ({
    closed: s.closed,
    points: s.pts.map((p) => ({
      x: round(p.x - x0),
      y: round(p.y - y0),
      in: p.inX !== undefined && (Math.abs(p.inX - p.x) > 1e-6 || Math.abs((p.inY ?? p.y) - p.y) > 1e-6) ? { x: round(p.inX - p.x), y: round((p.inY ?? p.y) - p.y) } : null,
      out: p.outX !== undefined && (Math.abs(p.outX - p.x) > 1e-6 || Math.abs((p.outY ?? p.y) - p.y) > 1e-6) ? { x: round(p.outX - p.x), y: round((p.outY ?? p.y) - p.y) } : null,
    })),
  }));
}

/** A path node holding `subs` (document coordinates), its box fitted to the outline. */
export function pathNodeOf(name: string, subs: AbsSub[], props: Partial<PathNode>): PathNode {
  const b = absBounds(subs);
  return createNode('path', {
    name,
    x: round(b.x),
    y: round(b.y),
    width: Math.max(0.01, round(b.width)),
    height: Math.max(0.01, round(b.height)),
    paths: localSubs(subs, b.x, b.y),
    ...props,
  });
}

/** Bounds of a list of nodes that share a parent. */
export function boundsOf(kids: SceneNode[]): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(...kids.map((k) => k.x)),
    y0: Math.min(...kids.map((k) => k.y)),
    x1: Math.max(...kids.map((k) => k.x + k.width)),
    y1: Math.max(...kids.map((k) => k.y + k.height)),
  };
}

/** A group whose box is the union of its children, with the children placed relative to it. */
export function makeGroup(name: string, kids: SceneNode[], extra: Record<string, unknown> = {}): SceneNode {
  const b = boundsOf(kids);
  for (const k of kids) {
    k.x -= b.x0;
    k.y -= b.y0;
  }
  return createNode('group', { name, x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, children: kids, ...extra });
}

// ---------------------------------------------------------------- fonts

/** The families, weights and faces a document asks for, so the Google ones can be added to the project's fonts. */
export class FontBook {
  private readonly weights = new Map<string, Set<number>>();

  /** `style` is a face name such as "Bold Italic" or "SemiBold"; without a recognisable weight word `weight` is used. */
  face(family: string, style = '', weight?: number, italic?: boolean): { family: string; weight: number; italic: boolean } {
    let fam = family.trim() || 'sans-serif';
    const known = GOOGLE_BY_KEY.get(squash(fam));
    if (known) fam = known;
    let w = weight ?? 400;
    if (style) {
      let hit = false;
      for (const [re, v] of WEIGHT_WORDS) {
        if (re.test(style)) {
          w = v;
          hit = true;
          break;
        }
      }
      if (!hit && weight === undefined) w = 400;
    }
    const it = italic ?? /italic|oblique/i.test(style);
    if (known) {
      if (!this.weights.has(fam)) this.weights.set(fam, new Set());
      this.weights.get(fam)!.add(w);
    }
    return { family: fam, weight: w, italic: it || /italic|oblique/i.test(style) };
  }

  refs(): FontRef[] {
    return [...this.weights].map(([family, w]) => ({ family, source: 'google', weights: [...w].sort((a, b) => a - b) }));
  }
}

// ---------------------------------------------------------------- text

export interface TextPiece {
  text: string;
  family: string;
  weight: number;
  italic: boolean;
  /** px */
  size: number;
  color: string;
  /** px */
  spacing: number;
  underline: boolean;
  strike: boolean;
}

export interface TextSpec {
  name: string;
  pieces: TextPiece[];
  align: TextNode['align'];
  /** Multiplier of the font size. */
  lineHeight: number;
  upper?: boolean;
  /** Where the first baseline starts (point text) or the text space origin (box text), in the parent's coordinates. */
  origin: { x: number; y: number };
  /** Degrees. */
  rotation: number;
  /** Box text: a rectangle in text space, in px. */
  box?: { l: number; t: number; w: number; h: number };
  /** Width the text is known to take, when the source says. */
  widthHint?: number;
}

/** A text layer from styled pieces, placed from the first baseline (point text) or a box (paragraph text). */
export function buildTextNode(spec: TextSpec): TextNode {
  const pieces = spec.pieces.length ? spec.pieces : [{ text: '', family: 'sans-serif', weight: 400, italic: false, size: 16, color: '#000000', spacing: 0, underline: false, strike: false }];
  const b = pieces[0];
  const runs: TextRun[] = pieces.map((p) => {
    const o: TextRun = { text: p.text };
    if (p.family !== b.family) o.fontFamily = p.family;
    if (p.size !== b.size) o.fontSize = p.size;
    if (p.weight !== b.weight) o.fontWeight = p.weight;
    if (p.italic !== b.italic) o.italic = p.italic;
    if (p.color !== b.color) o.color = p.color;
    if (p.underline !== b.underline) o.underline = p.underline;
    if (p.strike !== b.strike) o.strike = p.strike;
    if (p.spacing !== b.spacing) o.letterSpacing = p.spacing;
    return o;
  });
  const text = pieces.map((p) => p.text).join('');
  const lines = text.split('\n');
  const lh = spec.lineHeight * b.size;
  let w: number;
  let h: number;
  let cx: number;
  let cy: number;
  if (spec.box) {
    w = spec.box.w;
    h = spec.box.h;
    cx = spec.box.l + w / 2;
    cy = spec.box.t + h / 2;
  } else {
    const longest = Math.max(...lines.map((l) => l.length), 1);
    w = Math.ceil((spec.widthHint ?? longest * b.size * 0.55) * 1.08) + 6;
    h = lines.length * lh;
    const ox = spec.align === 'center' ? -w / 2 : spec.align === 'right' ? -w : 0;
    // the first baseline sits a little below the middle of the first line
    const oy = -(lh / 2 + 0.325 * b.size);
    cx = ox + w / 2;
    cy = oy + h / 2;
  }
  const rad = (spec.rotation * Math.PI) / 180;
  const centerX = spec.origin.x + cx * Math.cos(rad) - cy * Math.sin(rad);
  const centerY = spec.origin.y + cx * Math.sin(rad) + cy * Math.cos(rad);
  return createNode('text', {
    name: spec.name,
    x: round(centerX - w / 2, 100),
    y: round(centerY - h / 2, 100),
    width: round(w, 100),
    height: round(h, 100),
    ...(Math.abs(spec.rotation) > 0.01 ? { rotation: round(spec.rotation, 100) } : {}),
    ...runsPatch(runs),
    fontFamily: b.family,
    fontSize: b.size,
    fontWeight: b.weight,
    fontStyle: b.italic ? 'italic' : 'normal',
    lineHeight: round(spec.lineHeight, 100),
    letterSpacing: b.spacing,
    color: b.color,
    align: spec.align,
    verticalAlign: 'top',
    ...(b.underline ? { textDecoration: 'underline' as const } : b.strike ? { textDecoration: 'line-through' as const } : {}),
    ...(spec.upper ? { textTransform: 'uppercase' as const } : {}),
    autoSize: spec.box ? 'none' : 'width',
  } as Partial<TextNode>);
}

/** A new asset id. */
export const assetId = (): string => uid('as');
