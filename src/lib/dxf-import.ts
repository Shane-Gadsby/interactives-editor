import { createArtboard, createNode, pathBounds, type Artboard, type FontRef, type Paint, type PathPoint, type SceneNode, type SubPath } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import { DxfError, Ent, parseDxf, type DxfBlock, type DxfDoc, type DxfLayer } from './dxf-parse';

/**
 * AutoCAD DXF to an artboard of editable vector layers.
 *
 * The model space is drawn into one artboard, fitted (uniform scale, y flipped) so the longest side of the drawing is
 * FIT_PX pixels, plus a margin. Every DXF layer becomes a group named after it (hidden when the layer is off or frozen).
 *   - LINE, LWPOLYLINE / POLYLINE (bulges as arcs), CIRCLE, ARC, ELLIPSE, SPLINE (as cubic beziers), POINT, SOLID / TRACE,
 *     3DFACE (outline), LEADER, TEXT / MTEXT / ATTRIB, HATCH (boundaries, solid and gradient fills), DIMENSION (its block)
 *   - blocks and INSERT: nested, scaled, rotated, mirrored, with row / column arrays; layer 0 and BYBLOCK follow the insert
 *   - colours: ACI index, BYLAYER, BYBLOCK and true colour. White (ACI 7 or #FFFFFF) is drawn black: the artboard is white.
 *   - linetypes become dash patterns (times $LTSCALE and the entity's scale)
 *   - line weights become stroke widths: PX_PER_MM px per mm, at least HAIRLINE_PX. No weight means the hairline.
 * Not imported (and reported): paper space layouts, hatch patterns (drawn as a light tint), images, 3D solids and surfaces,
 * multileaders, xrefs, proxy objects.
 */

export interface DxfImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  fonts: FontRef[];
  warnings: string[];
}

/** The longest side of the drawing, in px, once fitted. */
export const FIT_PX = 1600;
const MARGIN_PX = 20;
/** Stroke width of a line with no weight, and the smallest stroke width. CAD lines are hairlines. */
export const HAIRLINE_PX = 1;
/** Lineweight scale: a 0.25 mm line is 1 px, 0.5 mm is 2 px, 1 mm is 4 px (at most MAX_STROKE_PX). */
export const PX_PER_MM = 4;
const MAX_STROKE_PX = 14;
const MAX_PRIMS = 250000;
const MAX_DEPTH = 16;
/** A layer with more plain line work than this has it merged into a few paths (per colour, width and dash). */
const MERGE_ABOVE = 300;
const MERGE_CHUNK = 250;

// ---------------------------------------------------------------- matrices

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
/** Apply `b` first, then `a`. */
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M, x: number, y: number): { x: number; y: number } => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const lin = (m: M, x: number, y: number): { x: number; y: number } => ({ x: m[0] * x + m[2] * y, y: m[1] * x + m[3] * y });
const trans = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const rot = (a: number): M => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const scl = (x: number, y: number): M => [x, 0, 0, y, 0, 0];
const rad = (deg: number) => (deg * Math.PI) / 180;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The matrix from a entity's own coordinates (OCS) to world coordinates, for an extrusion direction (the arbitrary axis algorithm). */
function ocsMatrix(e: Ent): M {
  const nx = e.num(210, 0);
  const ny = e.num(220, 0);
  const nz = e.num(230, 1);
  const len = Math.hypot(nx, ny, nz);
  if (!len || (Math.abs(nx) < 1e-9 && Math.abs(ny) < 1e-9 && nz > 0)) return ID;
  const N = [nx / len, ny / len, nz / len];
  const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a: number[]) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const Ax = norm(Math.abs(N[0]) < 1 / 64 && Math.abs(N[1]) < 1 / 64 ? cross([0, 1, 0], N) : cross([0, 0, 1], N));
  const Ay = norm(cross(N, Ax));
  return [Ax[0], Ax[1], Ay[0], Ay[1], 0, 0];
}

// ---------------------------------------------------------------- colours

function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}
const rgbHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

const ACI_BASE = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#000000', '#808080', '#c0c0c0'];
const ACI_GREYS = ['#333333', '#5b5b5b', '#848484', '#adadad', '#d6d6d6', '#ffffff'];
const ACI_V = [1, 0.8, 0.6, 0.5, 0.3];

function hsv(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  // AutoCAD's table truncates (50% of 255 is 7F, not 80)
  const f = (v: number) => Math.floor((v + m) * 255 + 1e-6);
  return rgbHex(f(r), f(g), f(b));
}

/**
 * AutoCAD Color Index to a CSS colour. 1 to 9 are the named colours, 10 to 249 are 24 hues in 15 degree steps, each in five
 * brightnesses and two saturations, 250 to 255 are greys. 7 (white on a dark screen, black on a light one) and 255 come
 * out black, since the artboard is white.
 */
export function aciColor(i: number): string {
  i = Math.abs(Math.round(i));
  if (i === 7 || i === 255) return '#000000';
  if (i < 10) return ACI_BASE[i];
  if (i >= 250 && i <= 255) return ACI_GREYS[i - 250];
  if (i > 255) return '#000000';
  const n = i - 10;
  return hsv(Math.floor(n / 10) * 15, n % 2 ? 0.5 : 1, ACI_V[Math.floor((n % 10) / 2)]);
}

/** A 24-bit true colour value (group code 420 / 421) as CSS; white becomes black like ACI 7. */
export function trueColor(n: number): string {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r === 255 && g === 255 && b === 255 ? '#000000' : rgbHex(r, g, b);
}

// ---------------------------------------------------------------- text

/** AutoCAD's %% codes. */
function percentCodes(s: string): string {
  return s
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%(\d{3})/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/%%%/g, '%');
}

/** MTEXT content as plain text: formatting codes removed, \P as a line break, stacked fractions as a/b. */
export function mtextToPlain(src: string): string {
  let out = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const d = src[i + 1];
      if (d === undefined) break;
      if (d === 'P') {
        out += '\n';
        i++;
      } else if (d === '~') {
        out += ' ';
        i++;
      } else if (d === '\\' || d === '{' || d === '}') {
        out += d;
        i++;
      } else if ((d === 'U' || d === 'u') && src[i + 2] === '+') {
        const hex = src.slice(i + 3, i + 7);
        if (/^[0-9a-f]{4}$/i.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else i++;
      } else if (d === 'S') {
        const end = src.indexOf(';', i);
        const body = src.slice(i + 2, end < 0 ? src.length : end);
        out += body.replace(/\\([/#^])/g, '$1').replace(/[/#^]/, '/');
        i = end < 0 ? src.length : end;
      } else if (d === 'M' && src[i + 2] === '+') {
        i += 7; // a multibyte character code, not reproduced
      } else if ('LlOoKk'.includes(d)) {
        i++;
      } else if ('HhWwTtQqCcFfAaXxpP'.includes(d)) {
        const end = src.indexOf(';', i);
        i = end < 0 ? src.length : end;
      } else {
        out += d;
        i++;
      }
    } else if (c === '{' || c === '}') {
      // grouping
    } else out += c;
  }
  return percentCodes(out).replace(/\n+$/, '');
}

// ---------------------------------------------------------------- paths

type Pt = PathPoint;

/** Builds sub-paths with cubic beziers; handles are kept relative to their point, as the format wants. */
class Pen {
  subs: SubPath[] = [];
  private cur: Pt[] | null = null;
  move(x: number, y: number): void {
    this.cur = [{ x, y, in: null, out: null }];
    this.subs.push({ points: this.cur, closed: false });
  }
  line(x: number, y: number): void {
    if (!this.cur) return this.move(x, y);
    this.cur.push({ x, y, in: null, out: null });
  }
  cubic(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.cur) this.move(c1x, c1y);
    const last = this.cur![this.cur!.length - 1];
    last.out = { x: c1x - last.x, y: c1y - last.y };
    this.cur!.push({ x, y, in: { x: c2x - x, y: c2y - y }, out: null });
  }
  get last(): Pt | null {
    return this.cur ? this.cur[this.cur.length - 1] : null;
  }
  /** Close the current sub-path; a last point on top of the first is merged into it. */
  close(): void {
    const pts = this.cur;
    if (!pts) return;
    const sp = this.subs[this.subs.length - 1];
    if (pts.length > 2) {
      const a = pts[0];
      const z = pts[pts.length - 1];
      if (Math.hypot(a.x - z.x, a.y - z.y) < 1e-9 * (1 + Math.abs(a.x) + Math.abs(a.y))) {
        a.in = z.in;
        pts.pop();
      }
    }
    sp.closed = true;
  }
}

/** Append an elliptic arc point(t) = c + u cos t + v sin t, from t0 over `sweep` radians, as cubic beziers of at most 90 degrees. */
function arcSegs(pen: Pen, cx: number, cy: number, ux: number, uy: number, vx: number, vy: number, t0: number, sweep: number): void {
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
  const d = sweep / n;
  const k = (4 / 3) * Math.tan(d / 4);
  const at = (t: number) => ({
    x: cx + ux * Math.cos(t) + vx * Math.sin(t),
    y: cy + uy * Math.cos(t) + vy * Math.sin(t),
    dx: -ux * Math.sin(t) + vx * Math.cos(t),
    dy: -uy * Math.sin(t) + vy * Math.cos(t),
  });
  let a = at(t0);
  if (!pen.last) pen.move(a.x, a.y);
  for (let i = 0; i < n; i++) {
    const b = at(t0 + (i + 1) * d);
    pen.cubic(a.x + k * a.dx, a.y + k * a.dy, b.x - k * b.dx, b.y - k * b.dy, b.x, b.y);
    a = b;
  }
}

/** The arc a bulge describes between two vertices (bulge = tan(sweep / 4); positive is counter-clockwise). */
function bulgeArc(pen: Pen, x1: number, y1: number, x2: number, y2: number, bulge: number): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const c = Math.hypot(dx, dy);
  if (c < 1e-12) return;
  const off = ((c / 2) * (1 - bulge * bulge)) / (2 * bulge);
  const cx = (x1 + x2) / 2 - (dy / c) * off;
  const cy = (y1 + y2) / 2 + (dx / c) * off;
  const r = Math.hypot(x1 - cx, y1 - cy);
  const sweep = 4 * Math.atan(bulge);
  arcSegs(pen, cx, cy, r, 0, 0, r, Math.atan2(y1 - cy, x1 - cx), sweep);
  // land exactly on the vertex
  const last = pen.last!;
  last.x = x2;
  last.y = y2;
}

interface Vtx {
  x: number;
  y: number;
  b: number;
}

function polylinePath(pen: Pen, vs: Vtx[], closed: boolean): void {
  if (vs.length < 2) return;
  pen.move(vs[0].x, vs[0].y);
  const segs = closed ? vs.length : vs.length - 1;
  for (let i = 0; i < segs; i++) {
    const a = vs[i];
    const b = vs[(i + 1) % vs.length];
    if (Math.abs(a.b) < 1e-9) pen.line(b.x, b.y);
    else bulgeArc(pen, a.x, a.y, b.x, b.y, a.b);
  }
  if (closed) pen.close();
}

function ellipseArc(pen: Pen, cx: number, cy: number, mx: number, my: number, ratio: number, t0: number, t1: number, ccw: boolean): boolean {
  // the minor axis is the major axis turned a quarter and shortened; clockwise ellipses (extrusion -Z) turn the other way
  const vx = -my * ratio * (ccw ? 1 : -1);
  const vy = mx * ratio * (ccw ? 1 : -1);
  let sweep = t1 - t0;
  while (sweep <= 0) sweep += Math.PI * 2;
  const full = Math.abs(sweep - Math.PI * 2) < 1e-6 || Math.abs(sweep) < 1e-9;
  if (full) sweep = Math.PI * 2;
  arcSegs(pen, cx, cy, mx, my, vx, vy, t0, sweep);
  return full;
}

/** A B-spline (optionally rational) as cubic beziers: exact for plain degree 2 and 3 curves, four pieces per span otherwise. */
function bspline(pen: Pen, p: number, knots: number[], xs: number[], ys: number[], ws: number[] | null): void {
  const n = xs.length;
  const evalAt = (i: number, t: number): [number, number] => {
    const d: [number, number, number][] = [];
    for (let j = 0; j <= p; j++) {
      const idx = j + i - p;
      const w = ws ? ws[idx] || 1 : 1;
      d.push([xs[idx] * w, ys[idx] * w, w]);
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const lo = knots[j + i - p];
        const den = knots[j + 1 + i - r] - lo;
        const a = den === 0 ? 0 : (t - lo) / den;
        const q = d[j - 1];
        const c = d[j];
        d[j] = [(1 - a) * q[0] + a * c[0], (1 - a) * q[1] + a * c[1], (1 - a) * q[2] + a * c[2]];
      }
    }
    const v = d[p];
    return [v[0] / (v[2] || 1), v[1] / (v[2] || 1)];
  };
  const deriv = (i: number, t: number): [number, number] => {
    const k0 = knots[i];
    const k1 = knots[i + 1];
    const h = (k1 - k0) * 1e-4;
    if (t - h < k0) {
      const f0 = evalAt(i, t);
      const f1 = evalAt(i, t + h);
      const f2 = evalAt(i, t + 2 * h);
      return [(-3 * f0[0] + 4 * f1[0] - f2[0]) / (2 * h), (-3 * f0[1] + 4 * f1[1] - f2[1]) / (2 * h)];
    }
    if (t + h > k1) {
      const f0 = evalAt(i, t);
      const f1 = evalAt(i, t - h);
      const f2 = evalAt(i, t - 2 * h);
      return [(3 * f0[0] - 4 * f1[0] + f2[0]) / (2 * h), (3 * f0[1] - 4 * f1[1] + f2[1]) / (2 * h)];
    }
    const a = evalAt(i, t + h);
    const b = evalAt(i, t - h);
    return [(a[0] - b[0]) / (2 * h), (a[1] - b[1]) / (2 * h)];
  };
  const pieces = p <= 3 && !ws ? 1 : 4;
  let started = false;
  for (let i = p; i < n; i++) {
    const k0 = knots[i];
    const k1 = knots[i + 1];
    if (!(k1 > k0)) continue;
    for (let m = 0; m < pieces; m++) {
      const ta = k0 + ((k1 - k0) * m) / pieces;
      const tb = k0 + ((k1 - k0) * (m + 1)) / pieces;
      const pa = evalAt(i, ta);
      const pb = evalAt(i, tb);
      const da = deriv(i, ta);
      const db = deriv(i, tb);
      if (!started) {
        pen.move(pa[0], pa[1]);
        started = true;
      }
      const dt = (tb - ta) / 3;
      pen.cubic(pa[0] + da[0] * dt, pa[1] + da[1] * dt, pb[0] - db[0] * dt, pb[1] - db[1] * dt, pb[0], pb[1]);
    }
  }
}

/** A smooth curve through points (Catmull-Rom as beziers). */
function throughPoints(pen: Pen, xs: number[], ys: number[], closed: boolean): void {
  const n = xs.length;
  if (n < 2) return;
  const X = (i: number) => xs[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const Y = (i: number) => ys[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  const tan = (i: number): [number, number] => {
    if (!closed && i === 0) return [X(1) - X(0), Y(1) - Y(0)];
    if (!closed && i === n - 1) return [X(n - 1) - X(n - 2), Y(n - 1) - Y(n - 2)];
    return [(X(i + 1) - X(i - 1)) / 2, (Y(i + 1) - Y(i - 1)) / 2];
  };
  pen.move(xs[0], ys[0]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = tan(i);
    const b = tan(i + 1);
    pen.cubic(X(i) + a[0] / 3, Y(i) + a[1] / 3, X(i + 1) - b[0] / 3, Y(i + 1) - b[1] / 3, X(i + 1), Y(i + 1));
  }
  if (closed) pen.close();
}

function splinePath(pen: Pen, e: Ent): boolean {
  const deg = e.num(71, 3);
  const flags = e.num(70);
  const knots = e.allNum(40);
  const xs = e.allNum(10);
  const ys = e.allNum(20);
  const n = Math.min(xs.length, ys.length);
  const closed = (flags & 1) === 1;
  if (n >= 2 && deg === 1) {
    pen.move(xs[0], ys[0]);
    for (let i = 1; i < n; i++) pen.line(xs[i], ys[i]);
    if (closed) pen.close();
    return true;
  }
  if (n >= deg + 1 && deg >= 2 && knots.length === n + deg + 1) {
    const w = e.allNum(41);
    const ws = w.length === n && w.some((v) => Math.abs(v - 1) > 1e-9) ? w : null;
    bspline(pen, deg, knots, xs.slice(0, n), ys.slice(0, n), ws);
    const last = pen.last;
    const first = pen.subs[pen.subs.length - 1]?.points[0];
    if (closed && last && first && Math.hypot(last.x - first.x, last.y - first.y) < 1e-6 * (1 + Math.abs(first.x) + Math.abs(first.y))) pen.close();
    return true;
  }
  const fx = e.allNum(11);
  const fy = e.allNum(21);
  const m = Math.min(fx.length, fy.length);
  if (m >= 2) {
    throughPoints(pen, fx.slice(0, m), fy.slice(0, m), closed);
    return true;
  }
  if (n >= 2) {
    pen.move(xs[0], ys[0]);
    for (let i = 1; i < n; i++) pen.line(xs[i], ys[i]);
    if (closed) pen.close();
    return true;
  }
  return false;
}

/** Append another pen's sub-paths to this pen's current one, joining them with a line when they do not meet. */
function splice(pen: Pen, sub: Pen): void {
  for (const s of sub.subs) {
    const pts = s.points;
    if (!pts.length) continue;
    const f = pts[0];
    if (!pen.last) pen.move(f.x, f.y);
    else if (Math.hypot(pen.last.x - f.x, pen.last.y - f.y) > 1e-6) pen.line(f.x, f.y);
    for (let q = 1; q < pts.length; q++) {
      const a = pts[q - 1];
      const b = pts[q];
      if (a.out || b.in) pen.cubic(a.x + (a.out?.x ?? 0), a.y + (a.out?.y ?? 0), b.x + (b.in?.x ?? 0), b.y + (b.in?.y ?? 0), b.x, b.y);
      else pen.line(b.x, b.y);
    }
  }
}

/** The sub-paths of a HATCH's boundary loops (in the hatch's own coordinates). */
function hatchLoops(e: Ent): SubPath[] {
  const codes = e.codes;
  const vals = e.vals;
  let i = codes.indexOf(91);
  if (i < 0) return [];
  const nPaths = Number(vals[i]) || 0;
  i++;
  const take = (code: number, def = 0): number => {
    for (let j = i; j < Math.min(codes.length, i + 24); j++) {
      if (codes[j] === code) {
        i = j + 1;
        return Number(vals[j]) || 0;
      }
    }
    return def;
  };
  const out: SubPath[] = [];
  for (let p = 0; p < nPaths && i < codes.length; p++) {
    while (i < codes.length && codes[i] !== 92) i++;
    if (i >= codes.length) break;
    const flags = Number(vals[i++]) || 0;
    const pen = new Pen();
    if (flags & 2) {
      let hasBulge = 0;
      while (i < codes.length && codes[i] !== 93) {
        if (codes[i] === 72) hasBulge = Number(vals[i]) || 0;
        i++;
      }
      const count = take(93);
      const vs: Vtx[] = [];
      for (let k = 0; k < count; k++) {
        const x = take(10);
        const y = take(20);
        const b = hasBulge && codes[i] === 42 ? take(42) : 0;
        vs.push({ x, y, b });
      }
      polylinePath(pen, vs, true);
    } else {
      const edges = take(93);
      for (let k = 0; k < edges; k++) {
        const type = take(72, -1);
        if (type === 1) {
          const x1 = take(10);
          const y1 = take(20);
          const x2 = take(11);
          const y2 = take(21);
          if (!pen.last) pen.move(x1, y1);
          else if (Math.hypot(pen.last.x - x1, pen.last.y - y1) > 1e-6) pen.line(x1, y1);
          pen.line(x2, y2);
        } else if (type === 2) {
          const cx = take(10);
          const cy = take(20);
          const r = take(40);
          const a0 = rad(take(50));
          const a1 = rad(take(51));
          const ccw = take(73, 1);
          let sweep = ccw ? a1 - a0 : a0 - a1;
          while (sweep <= 1e-12) sweep += Math.PI * 2;
          if (!ccw) sweep = -sweep;
          const sx = cx + r * Math.cos(a0);
          const sy = cy + r * Math.sin(a0);
          if (!pen.last) pen.move(sx, sy);
          else if (Math.hypot(pen.last.x - sx, pen.last.y - sy) > 1e-6) pen.line(sx, sy);
          arcSegs(pen, cx, cy, r, 0, 0, r, a0, sweep);
        } else if (type === 3) {
          const cx = take(10);
          const cy = take(20);
          const mx = take(11);
          const my = take(21);
          const ratio = take(40, 1);
          const a0 = rad(take(50));
          const a1 = rad(take(51, 360));
          const ccw = take(73, 1);
          const t0 = ccw ? a0 : a1;
          const t1 = ccw ? a1 : a0;
          const sx = cx + mx * Math.cos(t0) - my * ratio * Math.sin(t0);
          const sy = cy + my * Math.cos(t0) + mx * ratio * Math.sin(t0);
          if (!pen.last) pen.move(sx, sy);
          else if (Math.hypot(pen.last.x - sx, pen.last.y - sy) > 1e-6) pen.line(sx, sy);
          ellipseArc(pen, cx, cy, mx, my, ratio, t0, t1, true);
        } else if (type === 4) {
          const deg = take(94, 3);
          const rational = take(73);
          take(74);
          const nk = take(95);
          const nc = take(96);
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(take(40));
          const xs: number[] = [];
          const ys: number[] = [];
          const ws: number[] = [];
          for (let q = 0; q < nc; q++) {
            xs.push(take(10));
            ys.push(take(20));
            if (rational) ws.push(take(42, 1));
          }
          const sub = new Pen();
          if (nc >= deg + 1 && knots.length === nc + deg + 1 && deg >= 2) bspline(sub, deg, knots, xs, ys, rational ? ws : null);
          else if (nc >= 2) {
            sub.move(xs[0], ys[0]);
            for (let q = 1; q < nc; q++) sub.line(xs[q], ys[q]);
          }
          splice(pen, sub);
        } else break;
      }
      pen.close();
    }
    // the count of source objects, and any handles, before the next loop
    if (codes[i] === 97) i++;
    for (const s of pen.subs) {
      if (s.points.length > 1) out.push({ points: s.points, closed: true });
    }
  }
  return out;
}

// ---------------------------------------------------------------- the walker

interface StrokeSpec {
  color: string;
  /** mm; null for no weight */
  lwMm: number | null;
  /** extra width from a wide polyline, in drawing units */
  wUnits: number;
  /** dash pattern in drawing units */
  dash: number[] | null;
}

interface PathPrim {
  k: 'path';
  name: string;
  layer: string;
  subs: SubPath[];
  stroke: StrokeSpec | null;
  fill: Paint | null;
  evenodd: boolean;
}
interface PointPrim {
  k: 'point';
  layer: string;
  x: number;
  y: number;
  color: string;
}
interface TextPrim {
  k: 'text';
  layer: string;
  name: string;
  text: string;
  color: string;
  x: number;
  y: number;
  /** CAD angle, radians */
  angle: number;
  /** cap height, drawing units */
  height: number;
  hAlign: 0 | 1 | 2;
  vAnchor: 'baseline' | 'bottom' | 'middle' | 'top';
  /** reference width (MTEXT) or the span (aligned / fit TEXT), drawing units; 0 for none */
  width: number;
  widthFactor: number;
  /** line pitch as a multiple of the height */
  pitch: number;
}
type Prim = PathPrim | PointPrim | TextPrim;

interface Ctx {
  m: M;
  layer: string | null;
  color: string | null;
  ltype: string | null;
  lw: number | null;
  block: string | null;
  stack: string[];
}

const SKIPPED_QUIETLY = new Set(['VIEWPORT', 'ATTDEF', 'SEQEND', 'ENDBLK', 'BLOCK']);

class Walker {
  prims: Prim[] = [];
  skipped = new Map<string, number>();
  layerOrder: string[] = [];
  private seen = new Set<string>();
  patternHatches = 0;
  gradientHatches = 0;
  hatchesWithoutLoops = 0;
  truncated = false;
  badSplines = 0;
  ltscale: number;

  constructor(readonly doc: DxfDoc) {
    this.ltscale = doc.header.get('$LTSCALE')?.num(40, 1) || 1;
  }

  private layerOf(name: string): DxfLayer | undefined {
    return this.doc.layers.get(name.toLowerCase());
  }

  private skip(type: string): void {
    this.skipped.set(type, (this.skipped.get(type) ?? 0) + 1);
  }

  /** The layer, colour, weight and dashes an entity ends up with, resolving BYLAYER and BYBLOCK against the insert it is in. */
  private style(e: Ent, ctx: Ctx): { layer: string; color: string; lwMm: number | null; dash: number[] | null; ltName: string } {
    let layerName = e.str(8, '0');
    if (layerName === '0' && ctx.layer) layerName = ctx.layer;
    const layer = this.layerOf(layerName);
    const layerColor = layer ? (layer.trueColor !== null ? trueColor(layer.trueColor) : aciColor(layer.color)) : '#000000';
    let color: string;
    const aci = e.num(62, 256);
    if (e.has(420)) color = trueColor(e.num(420));
    else if (aci === 0) color = ctx.color ?? layerColor;
    else if (aci === 256 || aci < 0) color = layerColor;
    else color = aciColor(aci);

    const lwRaw = e.num(370, -1);
    let lwMm: number | null;
    if (lwRaw >= 0) lwMm = lwRaw / 100;
    else if (lwRaw === -2) lwMm = ctx.lw;
    else if (lwRaw === -3) lwMm = null;
    else lwMm = layer && layer.lineweight >= 0 ? layer.lineweight / 100 : null;

    let lt = e.str(6, 'BYLAYER').toUpperCase();
    if (lt === 'BYLAYER') lt = (layer?.ltype ?? 'CONTINUOUS').toUpperCase();
    else if (lt === 'BYBLOCK') lt = (ctx.ltype ?? 'CONTINUOUS').toUpperCase();
    const pat = this.doc.ltypes.get(lt);
    let dash: number[] | null = null;
    if (pat && pat.length >= 2) {
      const k = this.ltscale * (e.num(48, 1) || 1);
      dash = pat.map((v) => Math.abs(v) * k);
      if (pat[0] < 0) dash = [0, ...dash]; // starts with a gap
      if (dash.length % 2) dash.push(dash[dash.length - 1]);
      if (dash.every((v) => v === 0)) dash = null;
    }
    return { layer: layerName, color, lwMm, dash, ltName: lt };
  }

  private push(p: Prim): void {
    if (this.prims.length >= MAX_PRIMS) {
      this.truncated = true;
      return;
    }
    const key = p.layer.toLowerCase();
    if (!this.seen.has(key)) {
      this.seen.add(key);
      if (!this.layerOrder.includes(key)) this.layerOrder.push(key);
    }
    this.prims.push(p);
  }

  private pathPrim(e: Ent, ctx: Ctx, name: string, pen: Pen, m: M, opts: { fill?: Paint | null; stroke?: boolean; evenodd?: boolean; wUnits?: number } = {}): void {
    if (!pen.subs.length) return;
    const st = this.style(e, ctx);
    const subs = pen.subs.map((s) => ({
      closed: s.closed,
      points: s.points.map((p) => {
        const q = apply(m, p.x, p.y);
        const i = p.in ? lin(m, p.in.x, p.in.y) : null;
        const o = p.out ? lin(m, p.out.x, p.out.y) : null;
        return { x: q.x, y: q.y, in: i, out: o };
      }),
    }));
    const fill = opts.fill ?? null;
    const stroke = opts.stroke === false ? null : { color: st.color, lwMm: st.lwMm, wUnits: opts.wUnits ?? 0, dash: st.dash };
    this.push({ k: 'path', name: ctx.block ? `${name} (${ctx.block})` : name, layer: st.layer, subs, stroke, fill, evenodd: !!opts.evenodd });
  }

  walk(ents: Ent[], ctx: Ctx): void {
    for (const e of ents) {
      if (this.truncated) return;
      this.entity(e, ctx);
    }
  }

  private entity(e: Ent, ctx: Ctx): void {
    if (e.num(60) === 1) return; // invisible
    const t = e.type;
    const ocs = mul(ctx.m, ocsMatrix(e));
    const pen = new Pen();
    switch (t) {
      case 'LINE': {
        pen.move(e.num(10), e.num(20));
        pen.line(e.num(11), e.num(21));
        this.pathPrim(e, ctx, 'Line', pen, ctx.m);
        return;
      }
      case 'LWPOLYLINE': {
        const vs: Vtx[] = [];
        for (let i = 0; i < e.codes.length; i++) {
          const c = e.codes[i];
          if (c === 10) vs.push({ x: Number(e.vals[i]) || 0, y: 0, b: 0 });
          else if (c === 20 && vs.length) vs[vs.length - 1].y = Number(e.vals[i]) || 0;
          else if (c === 42 && vs.length) vs[vs.length - 1].b = Number(e.vals[i]) || 0;
        }
        const closed = (e.num(70) & 1) === 1;
        polylinePath(pen, vs, closed);
        this.pathPrim(e, ctx, 'Polyline', pen, ocs, { wUnits: e.num(43) });
        return;
      }
      case 'POLYLINE':
        return this.polyline(e, ctx, pen, ocs);
      case 'CIRCLE': {
        const r = e.num(40);
        if (!(r > 0)) return;
        arcSegs(pen, e.num(10), e.num(20), r, 0, 0, r, 0, Math.PI * 2);
        pen.close();
        this.pathPrim(e, ctx, 'Circle', pen, ocs);
        return;
      }
      case 'ARC': {
        const r = e.num(40);
        if (!(r > 0)) return;
        const a0 = rad(e.num(50));
        let sweep = rad(e.num(51)) - a0;
        while (sweep <= 1e-12) sweep += Math.PI * 2;
        arcSegs(pen, e.num(10), e.num(20), r, 0, 0, r, a0, sweep);
        this.pathPrim(e, ctx, 'Arc', pen, ocs);
        return;
      }
      case 'ELLIPSE': {
        const mx = e.num(11);
        const my = e.num(21);
        if (!mx && !my) return;
        const ccw = e.num(230, 1) >= 0;
        const full = ellipseArc(pen, e.num(10), e.num(20), mx, my, e.num(40, 1), e.num(41, 0), e.num(42, Math.PI * 2), ccw);
        if (full) pen.close();
        this.pathPrim(e, ctx, 'Ellipse', pen, ctx.m);
        return;
      }
      case 'SPLINE':
      case 'HELIX': {
        if (!splinePath(pen, e)) {
          this.badSplines++;
          return;
        }
        this.pathPrim(e, ctx, 'Spline', pen, ctx.m);
        return;
      }
      case 'POINT': {
        const p = apply(ctx.m, e.num(10), e.num(20));
        const st = this.style(e, ctx);
        this.push({ k: 'point', layer: st.layer, x: p.x, y: p.y, color: st.color });
        return;
      }
      case 'SOLID':
      case 'TRACE': {
        const c = [0, 1, 3, 2].map((i) => ({ x: e.num(10 + i), y: e.num(20 + i) }));
        if (Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y) < 1e-12) c.pop();
        pen.move(c[0].x, c[0].y);
        for (const q of c.slice(1)) pen.line(q.x, q.y);
        pen.close();
        const st = this.style(e, ctx);
        this.pathPrim(e, ctx, 'Solid', pen, ocs, { fill: { type: 'solid', color: st.color }, stroke: false });
        return;
      }
      case '3DFACE': {
        const c = [0, 1, 2, 3].map((i) => ({ x: e.num(10 + i), y: e.num(20 + i) }));
        const flags = e.num(70);
        const n = Math.hypot(c[2].x - c[3].x, c[2].y - c[3].y) < 1e-12 ? 3 : 4;
        for (let i = 0; i < n; i++) {
          if (flags & (1 << i)) continue;
          const b = c[(i + 1) % n];
          pen.move(c[i].x, c[i].y);
          pen.line(b.x, b.y);
        }
        this.pathPrim(e, ctx, 'Face', pen, ctx.m);
        return;
      }
      case 'LEADER': {
        const xs = e.allNum(10);
        const ys = e.allNum(20);
        const n = Math.min(xs.length, ys.length);
        if (n < 2) return;
        pen.move(xs[0], ys[0]);
        for (let i = 1; i < n; i++) pen.line(xs[i], ys[i]);
        this.pathPrim(e, ctx, 'Leader', pen, ctx.m);
        return;
      }
      case 'TEXT':
      case 'ATTRIB':
        return this.text(e, ctx, ocs, false);
      case 'MTEXT':
        return this.text(e, ctx, ocs, true);
      case 'HATCH':
        return this.hatch(e, ctx, ocs);
      case 'INSERT':
        return this.insert(e, ctx);
      case 'DIMENSION': {
        const name = e.str(2);
        const block = name ? this.doc.blocks.get(name.toLowerCase()) : undefined;
        if (!block) {
          this.skip('DIMENSION (no drawing)');
          return;
        }
        const st = this.style(e, ctx);
        this.block(block, { ...ctx, layer: st.layer, color: st.color, ltype: st.ltName, lw: st.lwMm, block: 'Dimension' }, ID);
        return;
      }
      default:
        if (!SKIPPED_QUIETLY.has(t)) this.skip(t);
    }
  }

  private polyline(e: Ent, ctx: Ctx, pen: Pen, ocs: M): void {
    const flags = e.num(70);
    if (flags & 64) {
      // polyface mesh: coordinate vertices, then faces that index them (negative = invisible edge)
      const pts = e.kids.filter((v) => (v.num(70) & 192) === 192).map((v) => ({ x: v.num(10), y: v.num(20) }));
      for (const f of e.kids.filter((v) => (v.num(70) & 192) === 128)) {
        const idx = [71, 72, 73, 74].map((c) => f.num(c)).filter((v) => v !== 0);
        for (let i = 0; i < idx.length; i++) {
          if (idx[i] < 0) continue;
          const a = pts[Math.abs(idx[i]) - 1];
          const b = pts[Math.abs(idx[(i + 1) % idx.length]) - 1];
          if (!a || !b) continue;
          pen.move(a.x, a.y);
          pen.line(b.x, b.y);
        }
      }
      this.pathPrim(e, ctx, 'Mesh', pen, ctx.m);
      return;
    }
    if (flags & 16) {
      this.skip('POLYLINE (3D mesh)');
      return;
    }
    const verts = e.kids.filter((v) => v.type === 'VERTEX' && !(v.num(70) & 16));
    const vs = (verts.length ? verts : e.kids.filter((v) => v.type === 'VERTEX')).map((v) => ({ x: v.num(10), y: v.num(20), b: v.num(42) }));
    polylinePath(pen, vs, (flags & 1) === 1);
    // 3D polylines are in world coordinates, 2D ones in the entity's
    this.pathPrim(e, ctx, flags & 8 ? 'Polyline 3D' : 'Polyline', pen, flags & 8 ? ctx.m : ocs, { wUnits: e.num(40) > 0 && e.num(40) === e.num(41) ? e.num(40) : 0 });
  }

  private insert(e: Ent, ctx: Ctx): void {
    const name = e.str(2);
    const block = this.doc.blocks.get(name.toLowerCase());
    // attributes sit in the space the insert is in
    for (const a of e.kids) if (a.type === 'ATTRIB' && !(a.num(70) & 1)) this.text(a, ctx, mul(ctx.m, ocsMatrix(a)), false);
    if (!block) {
      if (name) this.skip('INSERT of a missing block');
      return;
    }
    if (block.flags & 12) {
      this.skip('XREF');
      return;
    }
    if (ctx.stack.length >= MAX_DEPTH || ctx.stack.includes(name.toLowerCase())) {
      this.skip('INSERT (nested too deep or circular)');
      return;
    }
    const st = this.style(e, ctx);
    const inner: Ctx = { ...ctx, layer: st.layer, color: st.color, ltype: st.ltName, lw: st.lwMm, block: name };
    const sx = e.num(41, 1);
    const sy = e.num(42, 1);
    const ang = rad(e.num(50));
    const cols = Math.max(1, Math.min(1000, e.num(70, 1)));
    const rows = Math.max(1, Math.min(1000, e.num(71, 1)));
    const dc = e.num(44);
    const dr = e.num(45);
    const o = ocsMatrix(e);
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (++count > 10000) {
          this.skip('INSERT (array cut at 10000 copies)');
          return;
        }
        const off = lin(rot(ang), c * dc, r * dr);
        const local = mul(o, mul(trans(e.num(10) + off.x, e.num(20) + off.y), mul(rot(ang), mul(scl(sx, sy), trans(-block.base.x, -block.base.y)))));
        this.block(block, inner, local);
        if (this.truncated) return;
      }
    }
  }

  /** Walk a block's entities under `local` (the insert's transform), inside the matrix of the context. */
  private block(block: DxfBlock, ctx: Ctx, local: M): void {
    this.walk(block.ents, { ...ctx, m: mul(ctx.m, local), stack: [...ctx.stack, block.name.toLowerCase()] });
  }

  private text(e: Ent, ctx: Ctx, full: M, mtext: boolean): void {
    let raw: string;
    if (mtext) raw = mtextToPlain(e.all(3).join('') + e.str(1));
    else raw = percentCodes(e.str(1));
    if (!raw.trim()) return;
    let height = e.num(40);
    if (!(height > 0)) return;
    const isAttrib = e.type === 'ATTRIB';
    let angle = rad(e.num(50));
    let ax = e.num(10);
    let ay = e.num(20);
    let hAlign: 0 | 1 | 2 = 0;
    let vAnchor: TextPrim['vAnchor'] = 'baseline';
    let width = 0;
    let pitch = 1.667 * (mtext ? e.num(44, 1) || 1 : 1);
    if (mtext) {
      if (e.has(11) || e.has(21)) angle = Math.atan2(e.num(21), e.num(11));
      const att = e.num(71, 1);
      hAlign = ([0, 1, 2][(att - 1) % 3] ?? 0) as 0 | 1 | 2;
      vAnchor = att <= 3 ? 'top' : att <= 6 ? 'middle' : 'bottom';
      width = Math.max(0, e.num(41));
    } else {
      const h72 = e.num(72);
      const v = isAttrib ? e.num(74) : e.num(73);
      if ((h72 || v) && e.has(11)) {
        if (h72 === 3 || h72 === 5) {
          const x2 = e.num(11);
          const y2 = e.num(21);
          width = Math.hypot(x2 - ax, y2 - ay);
          angle = Math.atan2(y2 - ay, x2 - ax);
          ax = (ax + x2) / 2;
          ay = (ay + y2) / 2;
          hAlign = 1;
        } else {
          ax = e.num(11);
          ay = e.num(21);
          hAlign = h72 === 1 || h72 === 4 ? 1 : h72 === 2 ? 2 : 0;
        }
      }
      vAnchor = h72 === 4 ? 'middle' : v === 1 ? 'bottom' : v === 2 ? 'middle' : v === 3 ? 'top' : 'baseline';
    }
    const p = apply(full, ax, ay);
    const u = lin(full, Math.cos(angle), Math.sin(angle));
    const n = lin(full, -Math.sin(angle), Math.cos(angle));
    const st = this.style(e, ctx);
    height *= Math.hypot(n.x, n.y);
    width *= Math.hypot(u.x, u.y);
    this.push({
      k: 'text',
      layer: st.layer,
      name: raw.replace(/\s+/g, ' ').trim().slice(0, 30) || 'Text',
      text: raw,
      color: st.color,
      x: p.x,
      y: p.y,
      angle: Math.atan2(u.y, u.x),
      height,
      hAlign,
      vAnchor,
      width,
      widthFactor: !mtext ? e.num(41, 1) || 1 : 1,
      pitch,
    });
  }

  private hatch(e: Ent, ctx: Ctx, ocs: M): void {
    const loops = hatchLoops(e);
    if (!loops.length) {
      this.hatchesWithoutLoops++;
      return;
    }
    const pen = new Pen();
    pen.subs = loops;
    const st = this.style(e, ctx);
    const solid = e.num(70) === 1;
    let fill: Paint;
    if (e.num(450) === 1) {
      // gradient: first and last colour; the pattern name tells linear from spherical
      const cols = e.allNum(421).map((n) => `#${hex2((n >> 16) & 255)}${hex2((n >> 8) & 255)}${hex2(n & 255)}`);
      const a = cols[0] ?? st.color;
      const b = cols.length > 1 ? cols[cols.length - 1] : '#ffffff';
      const name = e.str(470).toUpperCase();
      const radial = /^(SPHER|CURVED|INV)/.test(name) && !/CYLINDER/.test(name);
      fill = radial ? { type: 'radial', stops: [{ offset: 0, color: a }, { offset: 1, color: b }] } : { type: 'linear', angle: r2(90 - (e.num(460) * 180) / Math.PI), stops: [{ offset: 0, color: a }, { offset: 1, color: b }] };
      this.gradientHatches++;
    } else if (solid || e.str(2).toUpperCase() === 'SOLID') {
      fill = { type: 'solid', color: st.color };
    } else {
      // a pattern (ANSI31, ...): a light tint where the pattern would be
      const c = st.color;
      fill = { type: 'solid', color: `rgba(${parseInt(c.slice(1, 3), 16)}, ${parseInt(c.slice(3, 5), 16)}, ${parseInt(c.slice(5, 7), 16)}, 0.18)` };
      this.patternHatches++;
    }
    this.pathPrim(e, ctx, 'Hatch', pen, ocs, { fill, stroke: false, evenodd: true });
  }
}

// ---------------------------------------------------------------- drawing to nodes

const UNIT_NAMES: Record<number, [string, string]> = {
  1: ['inches', 'in'],
  2: ['feet', 'ft'],
  3: ['miles', 'mi'],
  4: ['millimetres', 'mm'],
  5: ['centimetres', 'cm'],
  6: ['metres', 'm'],
  7: ['kilometres', 'km'],
  10: ['yards', 'yd'],
  14: ['decimetres', 'dm'],
};

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function boundsOfPrim(p: Prim): Box | null {
  if (p.k === 'point') return { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
  if (p.k === 'text') {
    const w = (p.width || Math.max(...p.text.split('\n').map((l) => l.length)) * p.height * 0.75 * p.widthFactor) || p.height;
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    const xs = [0, w, w, 0].map((a, i) => p.x + a * c - [0, 0, p.height, p.height][i] * s);
    const ys = [0, w, w, 0].map((a, i) => p.y + a * s + [0, 0, p.height, p.height][i] * c);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  if (!p.subs.length) return null;
  const b = pathBounds(p.subs);
  return { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
}

function box(kids: SceneNode[]) {
  return {
    x0: Math.min(...kids.map((k) => k.x)),
    y0: Math.min(...kids.map((k) => k.y)),
    x1: Math.max(...kids.map((k) => k.x + k.width)),
    y1: Math.max(...kids.map((k) => k.y + k.height)),
  };
}

function layerGroup(name: string, kids: SceneNode[], visible: boolean): SceneNode {
  const b = box(kids);
  for (const k of kids) {
    k.x = r2(k.x - b.x0);
    k.y = r2(k.y - b.y0);
  }
  return createNode('group', { name, x: r2(b.x0), y: r2(b.y0), width: Math.max(0.01, r2(b.x1 - b.x0)), height: Math.max(0.01, r2(b.y1 - b.y0)), children: kids, visible });
}

export function importDxf(bytes: Uint8Array, baseName = ''): DxfImport {
  const doc = parseDxf(bytes);
  const warnings: string[] = [];
  const walker = new Walker(doc);
  const root: Ctx = { m: ID, layer: null, color: null, ltype: null, lw: null, block: null, stack: [] };
  for (const l of doc.layers.values()) walker.layerOrder.push(l.name.toLowerCase());

  // model space, or the paper space when that is all there is
  const paperCount = doc.paper.length + [...doc.blocks.values()].filter((b) => /^\*paper_space/i.test(b.name)).reduce((n, b) => n + b.ents.length, 0);
  let source = doc.model;
  if (!doc.model.length && doc.paper.length) {
    source = doc.paper;
    warnings.push('This file has no model space drawing, so its paper space layout was imported instead.');
  } else if (paperCount) {
    warnings.push(`Paper space layouts are not imported (${paperCount} object${paperCount === 1 ? '' : 's'} skipped): this is the model space only.`);
  }
  walker.walk(source, root);
  if (!walker.prims.length) throw new DxfError('No drawing was found in this DXF file (the model space is empty).');

  // the area to fit: visible layers' geometry, or the header's extents when stray objects make the geometry far larger
  const visible = (name: string) => {
    const l = doc.layers.get(name.toLowerCase());
    return !(l && (l.off || l.frozen));
  };
  const grow = (acc: Box | null, b: Box | null): Box | null =>
    !b || ![b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) ? acc : acc ? { x0: Math.min(acc.x0, b.x0), y0: Math.min(acc.y0, b.y0), x1: Math.max(acc.x1, b.x1), y1: Math.max(acc.y1, b.y1) } : b;
  let ext: Box | null = null;
  let all: Box | null = null;
  for (const p of walker.prims) {
    const b = boundsOfPrim(p);
    all = grow(all, b);
    if (visible(p.layer)) ext = grow(ext, b);
  }
  const area: Box = ext ?? all!;
  ext = area;
  const emin = doc.header.get('$EXTMIN');
  const emax = doc.header.get('$EXTMAX');
  if (emin && emax) {
    const h = { x0: emin.num(10), y0: emin.num(20), x1: emax.num(10), y1: emax.num(20) };
    const ok = [h.x0, h.y0, h.x1, h.y1].every((v) => Number.isFinite(v) && Math.abs(v) < 1e15) && h.x1 > h.x0 && h.y1 > h.y0;
    if (ok && ((ext.x1 - ext.x0) > 50 * (h.x1 - h.x0) || (ext.y1 - ext.y0) > 50 * (h.y1 - h.y0))) {
      warnings.push('Some objects lie far outside the drawing extents saved in the file. The artboard shows the saved extents and those objects sit off it; delete or purge them in the CAD program if they are strays.');
      ext = h;
    }
  }
  const w = ext.x1 - ext.x0;
  const hgt = ext.y1 - ext.y0;
  const longest = Math.max(w, hgt);
  const s = longest > 0 ? FIT_PX / longest : 1;
  const W = Math.max(1, Math.ceil(w * s)) + MARGIN_PX * 2;
  const H = Math.max(1, Math.ceil(hgt * s)) + MARGIN_PX * 2;
  const fx = (x: number) => (x - ext!.x0) * s + MARGIN_PX;
  const fy = (y: number) => (ext!.y1 - y) * s + MARGIN_PX;

  const units = doc.header.get('$INSUNITS')?.num(70, 0) ?? 0;
  const un = UNIT_NAMES[units];
  const pxSize = 1 / s;
  warnings.push(`Drawing units: ${un ? un[0] : 'not set in the file'}. The drawing is fitted to the artboard: 1 px = ${Number(pxSize.toPrecision(3))} ${un ? un[1] : 'drawing units'}.`);
  warnings.push(`Line weights: ${PX_PER_MM} px per mm of plotted weight, at least ${HAIRLINE_PX} px; lines without a weight are ${HAIRLINE_PX} px. White lines are drawn black.`);

  // ---- nodes
  const strokeWidth = (st: StrokeSpec): number => Math.min(MAX_STROKE_PX, Math.max(HAIRLINE_PX, st.lwMm ? st.lwMm * PX_PER_MM : 0, st.wUnits * s));
  const dashPx = (st: StrokeSpec): number[] | undefined => {
    if (!st.dash) return undefined;
    let d = st.dash.map((v) => Math.max(v * s, 0));
    const total = d.reduce((a, b) => a + b, 0);
    if (total < 6) d = d.map((v) => (total > 0 ? (v * 6) / total : v));
    d = d.map((v, i) => (v < 0.5 ? (i % 2 ? 2 : 1) : r2(v)));
    return d;
  };
  const toPx = (subs: SubPath[]): SubPath[] =>
    subs.map((sp) => ({
      closed: sp.closed,
      points: sp.points.map((p) => ({ x: fx(p.x), y: fy(p.y), in: p.in ? { x: p.in.x * s, y: -p.in.y * s } : null, out: p.out ? { x: p.out.x * s, y: -p.out.y * s } : null })),
    }));
  const pathNode = (name: string, subs: SubPath[], fill: Paint | null, st: StrokeSpec | null, evenodd: boolean): SceneNode | null => {
    const b = pathBounds(subs);
    const local: SubPath[] = subs.map((sp) => ({
      closed: sp.closed,
      points: sp.points.map((p) => ({ x: r2(p.x - b.x), y: r2(p.y - b.y), in: p.in ? { x: r2(p.in.x), y: r2(p.in.y) } : null, out: p.out ? { x: r2(p.out.x), y: r2(p.out.y) } : null })),
    }));
    const dash = st ? dashPx(st) : undefined;
    return createNode('path', {
      name,
      x: r2(b.x),
      y: r2(b.y),
      width: Math.max(0.01, r2(b.width)),
      height: Math.max(0.01, r2(b.height)),
      fill,
      stroke: st ? { paint: { type: 'solid', color: st.color }, width: r2(strokeWidth(st)), ...(dash ? { dash } : {}) } : null,
      paths: local,
      fillRule: evenodd ? 'evenodd' : 'nonzero',
      lineCap: 'butt',
      lineJoin: 'round',
    });
  };
  const textNode = (p: TextPrim): SceneNode => {
    const F = 1.35 * p.height; // font size from cap height
    const lines = p.text.split('\n');
    const N = lines.length;
    const pitch = N > 1 ? p.pitch * p.height : 1.2 * F;
    const lh = N > 1 ? Math.max(1, Math.min(3, pitch / F)) : 1.2;
    const est = Math.max(...lines.map((l) => l.length)) * 0.55 * F * p.widthFactor;
    let Wb = p.width > 0 ? p.width : est;
    const fixed = p.width > 0 || p.hAlign !== 0 || N > 1;
    if (!p.width && fixed) Wb = est * 1.25 + F * 0.5;
    const Hb = lh * F * N;
    const b0 = F * (0.95 + (lh - 1.2) / 2);
    const lastGap = (N - 1) * pitch;
    const t1 = p.vAnchor === 'baseline' ? 0 : p.vAnchor === 'top' ? -p.height : p.vAnchor === 'bottom' ? lastGap : (lastGap - p.height) / 2;
    const top = t1 + b0;
    const tc = top - Hb / 2;
    const sc = p.hAlign === 0 ? Wb / 2 : p.hAlign === 1 ? 0 : -Wb / 2;
    const c = Math.cos(p.angle);
    const sn = Math.sin(p.angle);
    const cx = fx(p.x + c * sc - sn * tc);
    const cy = fy(p.y + sn * sc + c * tc);
    const rotation = Math.abs(p.angle) > 1e-6 ? r2((-p.angle * 180) / Math.PI) : 0;
    return createNode('text', {
      name: p.name,
      text: p.text.replace(/\{/g, '{{').replace(/\}/g, '}}'),
      x: r2(cx - (Wb * s) / 2),
      y: r2(cy - (Hb * s) / 2),
      width: Math.max(1, r2(Wb * s)),
      height: Math.max(1, r2(Hb * s)),
      ...(rotation ? { rotation } : {}),
      fontSize: Math.max(1, r2(F * s)),
      lineHeight: r2(lh),
      color: p.color,
      align: p.hAlign === 0 ? 'left' : p.hAlign === 1 ? 'center' : 'right',
      verticalAlign: 'top',
      autoSize: fixed ? 'none' : 'width',
    });
  };

  const byLayer = new Map<string, Prim[]>();
  for (const p of walker.prims) {
    const k = p.layer.toLowerCase();
    if (!byLayer.has(k)) byLayer.set(k, []);
    byLayer.get(k)!.push(p);
  }
  const groups: SceneNode[] = [];
  for (const key of walker.layerOrder) {
    const prims = byLayer.get(key);
    if (!prims?.length) continue;
    const layer = doc.layers.get(key);
    const name = layer?.name ?? prims[0].layer;
    const fills: SceneNode[] = [];
    const strokes: SceneNode[] = [];
    const rest: SceneNode[] = [];
    const plain = prims.filter((p): p is PathPrim => p.k === 'path' && !p.fill && !!p.stroke);
    const merge = plain.length > MERGE_ABOVE;
    const buckets = new Map<string, { st: StrokeSpec; subs: SubPath[] }[]>();
    for (const p of prims) {
      if (p.k === 'path') {
        if (merge && !p.fill && p.stroke) {
          const k = `${p.stroke.color}|${r2(strokeWidth(p.stroke))}|${(dashPx(p.stroke) ?? []).join(',')}`;
          const list = buckets.get(k) ?? [];
          let last = list[list.length - 1];
          if (!last || last.subs.length >= MERGE_CHUNK) {
            last = { st: p.stroke, subs: [] };
            list.push(last);
          }
          last.subs.push(...toPx(p.subs));
          buckets.set(k, list);
          continue;
        }
        const node = pathNode(p.name, toPx(p.subs), p.fill, p.stroke, p.evenodd);
        if (node) (p.fill ? fills : strokes).push(node);
      } else if (p.k === 'point') {
        rest.push(createNode('ellipse', { name: 'Point', x: r2(fx(p.x) - 1.5), y: r2(fy(p.y) - 1.5), width: 3, height: 3, fill: { type: 'solid', color: p.color }, stroke: null }));
      }
    }
    for (const list of buckets.values()) {
      for (const b of list) {
        const node = pathNode(b.subs.length === 1 ? 'Line' : `Lines (${b.subs.length})`, b.subs, null, b.st, false);
        if (node) strokes.push(node);
      }
    }
    for (const p of prims) if (p.k === 'text') rest.push(textNode(p));
    const kids = [...fills, ...strokes, ...rest];
    if (kids.length) groups.push(layerGroup(name, kids, !layer || !(layer.off || layer.frozen)));
  }

  if (walker.truncated) warnings.push(`The drawing is very large: only the first ${MAX_PRIMS.toLocaleString('en-US')} objects were imported.`);
  if (walker.patternHatches) warnings.push(`${walker.patternHatches} pattern hatch${walker.patternHatches === 1 ? '' : 'es'} drawn as a light tint of the hatch colour (the pattern lines are not reproduced).`);
  if (walker.gradientHatches) warnings.push(`${walker.gradientHatches} gradient hatch${walker.gradientHatches === 1 ? '' : 'es'} simplified to a two colour gradient.`);
  if (walker.hatchesWithoutLoops) warnings.push(`${walker.hatchesWithoutLoops} hatch${walker.hatchesWithoutLoops === 1 ? ' has' : 'es have'} no readable boundary and ${walker.hatchesWithoutLoops === 1 ? 'was' : 'were'} skipped.`);
  if (walker.badSplines) warnings.push(`${walker.badSplines} spline${walker.badSplines === 1 ? ' has' : 's have'} no usable data and ${walker.badSplines === 1 ? 'was' : 'were'} skipped.`);
  if (walker.skipped.size) warnings.push(`Not imported: ${[...walker.skipped].map(([k, n]) => `${k}${n > 1 ? ` x${n}` : ''}`).join(', ')}.`);
  const hidden = groups.filter((g) => !g.visible).length;
  if (hidden) warnings.push(`${hidden} layer${hidden === 1 ? ' is' : 's are'} off or frozen in the file and imported hidden.`);

  const base = baseName.trim() || 'CAD drawing';
  const artboard = createArtboard({ name: base, width: W, height: H, children: groups });
  return { artboard, artboards: [artboard], assets: [], fonts: [], warnings };
}
