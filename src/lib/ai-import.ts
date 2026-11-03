import { createArtboard, createNode, pathBounds, uid, type Artboard, type BlendMode, type ColorStop, type FontRef, type Paint, type SceneNode, type SubPath } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import { DEVICE_CMYK, DEVICE_GRAY, DEVICE_RGB, makeColorSpace, makeFunction, type ColorSpace, type PdfFunction, type RGB } from './pdf-color';
import { loadFont, type PdfFont } from './pdf-font';
import { Cmd, Lexer, Name, NotPdfError, PdfDoc, PdfStream, PdfString, Ref, indexOf, isDict, num, readObject, type Dict, type PageInfo, type PdfObj } from './pdf-parse';
import { encodePng } from './psd-import';

/**
 * Illustrator (.ai) and PDF to artboards of editable vector layers.
 *
 * Illustrator saves a PDF next to its own data when "Create PDF Compatible File" is ticked, so this reads that PDF: each page
 * becomes an artboard and the page's drawing operators are replayed into layers.
 *   - paths (m l c v y h re) filled and/or stroked become path layers with the matrices baked into the points (y flipped)
 *   - colours: gray, RGB, CMYK (approximated), ICC, indexed, separation / DeviceN (through the tint function)
 *   - axial and radial shadings (as a fill pattern or `sh`) become linear and radial gradients
 *   - clipping (W, W*) becomes a mask layer in front of a group holding what it clips
 *   - ExtGState opacity (fill and stroke), blend modes, line width / cap / join / dash
 *   - text (BT ... ET) becomes text layers: runs on one baseline are joined, following lines of the same style become one layer
 *   - images become PNG (or the original JPEG) assets, stencil masks take the fill colour, soft masks become alpha
 *   - form XObjects are replayed in place; transparency groups with opacity or a blend mode become a group
 *   - optional-content layers (Illustrator's layers) become groups carrying the layer name, hidden ones are hidden
 * Not carried over (and reported): tiling patterns, mesh shadings, soft masks, Type 3 fonts, JPEG 2000 / fax pictures, overprint.
 */

export interface AiImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  fonts: FontRef[];
  warnings: string[];
}

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
/** PDF order: `a` is applied first, then `b`. */
const cat = (a: M, b: M): M => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const ap = (m: M, x: number, y: number): { x: number; y: number } => ({ x: x * m[0] + y * m[2] + m[4], y: x * m[1] + y * m[3] + m[5] });
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const NO_PDF = "This file has no PDF content. Save it in Illustrator with 'Create PDF Compatible File' ticked, then import it again.";

const BLENDS: Record<string, BlendMode> = { Multiply: 'multiply', Screen: 'screen', Overlay: 'overlay', Darken: 'darken', Lighten: 'lighten', ColorDodge: 'color-dodge', ColorBurn: 'color-burn', Difference: 'difference', Exclusion: 'exclusion' };

function hex2(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}
function colorStr(rgb: RGB, alpha = 1): string {
  if (alpha >= 0.999) return `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${r3(Math.max(0, alpha))})`;
}

// ---------------------------------------------------------------- state

interface Shading {
  type: 2 | 3;
  coords: number[];
  fn: PdfFunction;
  domain: [number, number];
  cs: ColorSpace;
  bbox: number[] | null;
}

type PaintSrc = { kind: 'rgb'; rgb: RGB } | { kind: 'shading'; sh: Shading; m: M } | { kind: 'none' };

interface GState {
  ctm: M;
  fill: PaintSrc;
  stroke: PaintSrc;
  fillCs: ColorSpace;
  strokeCs: ColorSpace;
  lineWidth: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  dash: number[];
  dashPhase: number;
  fillAlpha: number;
  strokeAlpha: number;
  blend: BlendMode | undefined;
  font: PdfFont | null;
  fontSize: number;
  charSpace: number;
  wordSpace: number;
  hScale: number;
  leading: number;
  rise: number;
  renderMode: number;
}

const BLACK: PaintSrc = { kind: 'rgb', rgb: [0, 0, 0] };

interface Frame {
  kind: 'root' | 'clip' | 'layer' | 'group';
  children: SceneNode[];
  name?: string;
  visible?: boolean;
  opacity?: number;
  blend?: BlendMode;
  mask?: SceneNode;
  /** Axis-aligned rectangle of the clip, when it is one (a clip that covers everything it holds is dropped). */
  rect?: { x0: number; y0: number; x1: number; y1: number } | null;
}

interface TextLine {
  text: string;
  x: number;
  y: number;
  endX: number;
  endY: number;
  size: number;
  angle: number;
  font: PdfFont;
  color: string;
  spacing: number;
}

interface Para {
  lines: TextLine[];
  step: number;
}

// ---------------------------------------------------------------- the importer

class Importer {
  readonly warnings = new Set<string>();
  readonly assets: ImportedAsset[] = [];
  readonly googleWeights = new Map<string, Set<number>>();
  private fonts = new WeakMap<object, PdfFont>();
  private images = new Map<string, string>();
  private ocNames = new Map<unknown, { name: string; visible: boolean }>();
  private ocOff: Set<number> | null = null;
  private ocBaseOff = false;
  private ocOn = new Set<number>();
  private imageCount = 0;

  constructor(readonly doc: PdfDoc) {
    this.loadOptionalContent();
  }

  warn(m: string): void {
    this.warnings.add(m);
  }

  private loadOptionalContent(): void {
    const doc = this.doc;
    const d = doc.dictOf(doc.get(doc.root(), 'OCProperties'));
    const cfg = d ? doc.dictOf(d.D) : null;
    this.ocOff = new Set();
    if (!cfg) return;
    this.ocBaseOff = doc.get(cfg, 'BaseState') instanceof Name && (doc.get(cfg, 'BaseState') as Name).name === 'OFF';
    for (const r of doc.arrayOf(cfg.OFF) ?? []) if (r instanceof Ref) this.ocOff.add(r.num);
    for (const r of doc.arrayOf(cfg.ON) ?? []) if (r instanceof Ref) this.ocOn.add(r.num);
  }

  /** The name and visibility of an optional-content group (or membership dictionary) given as a reference or dictionary. */
  ocInfo(o: PdfObj | undefined): { name: string; visible: boolean } | null {
    const doc = this.doc;
    const r = doc.dictOf(o);
    if (!r) return null;
    const known = this.ocNames.get(r);
    if (known) return known;
    let ref: Ref | null = null;
    let target = r;
    if (r.Type instanceof Name && r.Type.name === 'OCMD') {
      const g = r.OCGs;
      const first = Array.isArray(g) ? g[0] : g;
      const gd = doc.dictOf(first);
      if (!gd) return null;
      target = gd;
      if (first instanceof Ref) ref = first;
    } else if (o instanceof Ref) ref = o;
    const nameObj = doc.resolve(target.Name);
    const name = nameObj instanceof PdfString ? nameObj.text : 'Layer';
    const visible = ref ? (this.ocBaseOff ? this.ocOn.has(ref.num) : !this.ocOff?.has(ref.num)) : true;
    const info = { name, visible };
    this.ocNames.set(r, info);
    return info;
  }

  fontFor(res: Dict, name: string): PdfFont | null {
    const doc = this.doc;
    const f = doc.dictOf(doc.get(res.Font ?? null, name));
    if (!f) return null;
    let font = this.fonts.get(f);
    if (!font) {
      font = loadFont(doc, f);
      if (font.type3) this.warn('Type 3 fonts: their text was left out');
      this.fonts.set(f, font);
    }
    return font;
  }

  // ---- shadings

  shading(res: Dict, obj: PdfObj | undefined): Shading | null {
    const doc = this.doc;
    const d = doc.dictOf(obj);
    if (!d) return null;
    const type = num(doc.resolve(d.ShadingType));
    if (type !== 2 && type !== 3) {
      this.warn(type === 1 ? 'Function-based shadings were left out' : 'Gradient meshes (and other mesh shadings) were left out');
      return null;
    }
    const fn = makeFunction(doc, d.Function);
    const coords = doc.numbers(d.Coords);
    if (!fn || !coords || coords.length < (type === 2 ? 4 : 6)) return null;
    const cs = makeColorSpace(doc, d.ColorSpace, res, (m) => this.warn(`Approximated ${m}`));
    const dom = doc.numbers(d.Domain) ?? [0, 1];
    return { type, coords, fn, domain: [dom[0] ?? 0, dom[1] ?? 1], cs, bbox: doc.numbers(d.BBox) };
  }

  // ---- gradients

  gradient(sh: Shading, m: M, alpha: number, b: { x: number; y: number; width: number; height: number }): Paint | null {
    const [t0, t1] = sh.domain;
    const colorAt = (u: number): string => {
      const t = t0 + Math.max(0, Math.min(1, u)) * (t1 - t0);
      return colorStr(sh.cs.toRgb(sh.fn.eval([t])), alpha);
    };
    // where the function changes, as positions 0..1 along the gradient's axis
    const us = [0, ...sh.fn.breaks().map((t) => (t - t0) / (t1 - t0 || 1)).filter((u) => u > 1e-4 && u < 1 - 1e-4), 1];
    const w = Math.max(b.width, 1e-3);
    const h = Math.max(b.height, 1e-3);
    if (sh.type === 2) {
      const p0 = ap(m, sh.coords[0], sh.coords[1]);
      const p1 = ap(m, sh.coords[2], sh.coords[3]);
      const vx = p1.x - p0.x;
      const vy = p1.y - p0.y;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1e-9) return { type: 'solid', color: colorAt(1) };
      // The renderer draws a linear gradient along a line through the box in box units; pick the direction that is
      // perpendicular to the original gradient lines once the box is stretched to pixels.
      let dx = w * vx;
      let dy = h * vy;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const angle = Math.round((((Math.atan2(dy, dx) * 180) / Math.PI + 90) % 360 + 360) % 360 * 100) / 100;
      const uAt = (s: number) => ((b.x + w * (0.5 + (s - 0.5) * dx) - p0.x) * vx + (b.y + h * (0.5 + (s - 0.5) * dy) - p0.y) * vy) / len2;
      const u0 = uAt(0);
      const u1 = uAt(1);
      const span = u1 - u0 || 1;
      const stops: ColorStop[] = [{ offset: 0, color: colorAt(u0) }];
      for (const u of us) {
        const s = (u - u0) / span;
        if (s > 1e-3 && s < 1 - 1e-3) stops.push({ offset: r3(s), color: colorAt(u) });
      }
      stops.push({ offset: 1, color: colorAt(u1) });
      return { type: 'linear', angle, stops };
    }
    const c = ap(m, sh.coords[3], sh.coords[4]);
    const k = scaleOf(m);
    const r0 = sh.coords[2] * k;
    const r1 = sh.coords[5] * k;
    const R = Math.max(w, h) / 2;
    if (Math.hypot(c.x - (b.x + w / 2), c.y - (b.y + h / 2)) > 0.1 * R) this.warn('A radial gradient whose centre is off the middle of its shape was centred');
    const sAt = (u: number) => (r0 + u * (r1 - r0)) / R;
    const stops: ColorStop[] = [];
    if (r0 > 0.01 * R) stops.push({ offset: 0, color: colorAt(0) });
    for (const u of us) {
      const s = sAt(u);
      if (s < 1 - 1e-3) stops.push({ offset: r3(Math.max(0, s)), color: colorAt(u) });
    }
    const uEnd = r1 === r0 ? 1 : Math.max(0, Math.min(1, (R - r0) / (r1 - r0)));
    stops.push({ offset: 1, color: colorAt(uEnd) });
    return { type: 'radial', stops };
  }

  paintFor(src: PaintSrc, alpha: number, b: { x: number; y: number; width: number; height: number }): Paint | null {
    if (src.kind === 'rgb') return alpha <= 0 ? null : { type: 'solid', color: colorStr(src.rgb, alpha) };
    if (src.kind === 'shading') return this.gradient(src.sh, src.m, alpha, b);
    return null;
  }

  // ---- images

  /** An image XObject as an asset; `stencil` colours a stencil mask. Gives the asset id or null. */
  imageAsset(stream: PdfStream, key: string | null, res: Dict, stencil: RGB | null): string | null {
    const doc = this.doc;
    const cacheKey = key ? `${key}|${stencil?.join(',') ?? ''}` : null;
    if (cacheKey && this.images.has(cacheKey)) return this.images.get(cacheKey)!;
    const d = stream.dict;
    const w = num(doc.resolve(d.Width ?? d.W));
    const h = num(doc.resolve(d.Height ?? d.H));
    if (w < 1 || h < 1) return null;
    if (w * h > 40_000_000) {
      this.warn('A very large picture was left out');
      return null;
    }
    let decoded;
    try {
      decoded = doc.decode(stream);
    } catch (err) {
      this.warn(`A picture could not be decoded (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }
    const name = `Image ${++this.imageCount}`;
    const finish = (bytes: Uint8Array, mime: string, ext: string): string => {
      const id = uid('as');
      this.assets.push({ id, name: `${name}.${ext}`, mime, bytes });
      if (cacheKey) this.images.set(cacheKey, id);
      return id;
    };
    if (decoded.codec === 'DCTDecode') {
      if (doc.resolve(d.SMask ?? d.Mask)) this.warn('Transparency masks on JPEG pictures were dropped');
      const cs = d.ColorSpace ? makeColorSpace(doc, d.ColorSpace, res, () => {}) : DEVICE_RGB;
      if (cs.n === 4) this.warn('CMYK pictures were kept as JPEG; their colours depend on the browser');
      return finish(decoded.data, 'image/jpeg', 'jpg');
    }
    if (decoded.codec) {
      this.warn(`Pictures stored as ${decoded.codec.replace('Decode', '')} were left out`);
      return null;
    }
    const bpc = num(doc.resolve(d.BitsPerComponent ?? d.BPC), 8);
    const isMask = doc.resolve(d.ImageMask ?? d.IM) === true;
    const decodeArr = doc.numbers(d.Decode ?? d.D);
    let rgba: Uint8Array;
    if (isMask) {
      const inv = !!decodeArr && decodeArr[0] === 1;
      const bits = unpack(decoded.data, w, h, 1, 1);
      const col = stencil ?? [0, 0, 0];
      rgba = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        const paint = inv ? bits[i] === 1 : bits[i] === 0;
        rgba[i * 4] = col[0];
        rgba[i * 4 + 1] = col[1];
        rgba[i * 4 + 2] = col[2];
        rgba[i * 4 + 3] = paint ? 255 : 0;
      }
    } else {
      const cs = d.ColorSpace || d.CS ? makeColorSpace(doc, d.ColorSpace ?? d.CS, res, (m) => this.warn(`Approximated ${m}`)) : DEVICE_GRAY;
      if (cs.isPattern) return null;
      rgba = this.toRgba(decoded.data, w, h, bpc, cs, decodeArr);
    }
    // soft mask or stencil mask as alpha
    const sm = doc.resolve(d.SMask);
    const mk = doc.resolve(d.Mask);
    try {
      if (sm instanceof PdfStream) {
        const a = this.alphaOf(sm, res);
        if (a) applyAlpha(rgba, w, h, a);
      } else if (mk instanceof PdfStream) {
        const a = this.alphaOf(mk, res);
        if (a) applyAlpha(rgba, w, h, a);
      } else if (Array.isArray(mk)) this.warn('Colour-key transparency on pictures was dropped');
    } catch {
      this.warn('A picture mask could not be read');
    }
    return finish(encodePng(w, h, rgba), 'image/png', 'png');
  }

  private alphaOf(s: PdfStream, res: Dict): { w: number; h: number; a: Uint8Array } | null {
    const doc = this.doc;
    const w = num(doc.resolve(s.dict.Width));
    const h = num(doc.resolve(s.dict.Height));
    if (w < 1 || h < 1 || w * h > 40_000_000) return null;
    const dec = doc.decode(s);
    if (dec.codec) return null;
    const bpc = num(doc.resolve(s.dict.BitsPerComponent), 8);
    const decodeArr = doc.numbers(s.dict.Decode);
    const a = new Uint8Array(w * h);
    if (doc.resolve(s.dict.ImageMask) === true) {
      const bits = unpack(dec.data, w, h, 1, 1);
      const inv = !!decodeArr && decodeArr[0] === 1;
      for (let i = 0; i < a.length; i++) a[i] = (inv ? bits[i] === 1 : bits[i] === 0) ? 255 : 0;
      return { w, h, a };
    }
    const v = unpack(dec.data, w, h, 1, bpc);
    const max = Math.pow(2, Math.min(bpc, 8)) - 1;
    const inv = !!decodeArr && decodeArr[0] === 1;
    for (let i = 0; i < a.length; i++) {
      const g = Math.round((v[i] / max) * 255);
      a[i] = inv ? 255 - g : g;
    }
    void res;
    return { w, h, a };
  }

  private toRgba(data: Uint8Array, w: number, h: number, bpc: number, cs: ColorSpace, decode: number[] | null): Uint8Array {
    const n = cs.n;
    const samples = unpack(data, w, h, n, bpc);
    const out = new Uint8Array(w * h * 4);
    const bits = Math.min(bpc, 8);
    const max = Math.pow(2, bits) - 1;
    const indexed = cs.name === 'Indexed';
    const dmin = (i: number) => (decode ? (decode[2 * i] ?? 0) : indexed ? 0 : 0);
    const dmax = (i: number) => (decode ? (decode[2 * i + 1] ?? 1) : indexed ? max : 1);
    const comp = (v: number, i: number) => dmin(i) + (v / max) * (dmax(i) - dmin(i));
    if (n === 1) {
      const lut = new Uint8Array((max + 1) * 3);
      for (let v = 0; v <= max; v++) {
        const rgb = cs.toRgb([comp(v, 0)]);
        lut[v * 3] = rgb[0];
        lut[v * 3 + 1] = rgb[1];
        lut[v * 3 + 2] = rgb[2];
      }
      for (let i = 0; i < w * h; i++) {
        const v = samples[i];
        out[i * 4] = lut[v * 3];
        out[i * 4 + 1] = lut[v * 3 + 1];
        out[i * 4 + 2] = lut[v * 3 + 2];
        out[i * 4 + 3] = 255;
      }
      return out;
    }
    if (n === 3 && cs === DEVICE_RGB && !decode && bits === 8) {
      for (let i = 0; i < w * h; i++) {
        out[i * 4] = samples[i * 3];
        out[i * 4 + 1] = samples[i * 3 + 1];
        out[i * 4 + 2] = samples[i * 3 + 2];
        out[i * 4 + 3] = 255;
      }
      return out;
    }
    const cache = new Map<number, number>();
    const c: number[] = new Array(n);
    for (let i = 0; i < w * h; i++) {
      let packed = 0;
      for (let k = 0; k < n; k++) packed = (packed * 256 + samples[i * n + k]) % 4294967296;
      let rgb24 = n <= 4 ? cache.get(packed) : undefined;
      if (rgb24 === undefined) {
        for (let k = 0; k < n; k++) c[k] = comp(samples[i * n + k], k);
        const rgb = cs.toRgb(c);
        rgb24 = (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];
        if (n <= 4 && cache.size < 200000) cache.set(packed, rgb24);
      }
      out[i * 4] = (rgb24 >> 16) & 255;
      out[i * 4 + 1] = (rgb24 >> 8) & 255;
      out[i * 4 + 2] = rgb24 & 255;
      out[i * 4 + 3] = 255;
    }
    return out;
  }

  // ---- pages

  page(p: PageInfo): { width: number; height: number; children: SceneNode[]; empty: boolean } {
    const inner = (b: number[] | null, outer: number[]) => b && b[2] - b[0] > 1 && b[3] - b[1] > 1 && b[0] >= outer[0] - 1 && b[1] >= outer[1] - 1 && b[2] <= outer[2] + 1 && b[3] <= outer[3] + 1;
    const crop = inner(p.cropBox, p.mediaBox) ? p.cropBox! : p.mediaBox;
    const box = inner(p.trimBox, crop) ? p.trimBox! : crop;
    const [x0, y0, x1, y1] = box;
    const bw = x1 - x0;
    const bh = y1 - y0;
    let base: M;
    let width = bw;
    let height = bh;
    switch (p.rotate) {
      case 1:
        base = [0, 1, 1, 0, -y0, -x0];
        width = bh;
        height = bw;
        break;
      case 2:
        base = [-1, 0, 0, 1, x1, -y0];
        break;
      case 3:
        base = [0, -1, -1, 0, y1, x1];
        width = bh;
        height = bw;
        break;
      default:
        base = [1, 0, 0, -1, -x0, y1];
    }
    const run = new PageRun(this, base, width, height);
    try {
      run.exec(this.doc.pageContent(p), p.resources, base, 0);
    } catch (err) {
      this.warn(`Part of a page could not be read (${err instanceof Error ? err.message : String(err)})`);
    }
    const children = run.finish();
    return { width: Math.max(1, r2(width)), height: Math.max(1, r2(height)), children, empty: children.length === 0 };
  }
}

// ---------------------------------------------------------------- samples

/** Unpack image data to one number per sample (0..2^min(bpc,8)-1), `n` samples per pixel, rows padded to bytes. */
function unpack(data: Uint8Array, w: number, h: number, n: number, bpc: number): Uint8Array {
  const out = new Uint8Array(w * h * n);
  const rowBytes = Math.ceil((w * n * bpc) / 8);
  if (bpc === 8) {
    if (data.length >= out.length && rowBytes === w * n) out.set(data.subarray(0, out.length));
    else for (let y = 0; y < h; y++) out.set(data.subarray(y * rowBytes, y * rowBytes + w * n), y * w * n);
    return out;
  }
  if (bpc === 16) {
    for (let y = 0; y < h; y++) for (let i = 0; i < w * n; i++) out[y * w * n + i] = data[y * rowBytes + i * 2] ?? 0;
    return out;
  }
  const mask = (1 << bpc) - 1;
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w * n; i++) {
      const bit = i * bpc;
      const byte = data[y * rowBytes + (bit >> 3)] ?? 0;
      out[y * w * n + i] = (byte >> (8 - bpc - (bit & 7))) & mask;
    }
  }
  return out;
}

/** Multiply the alpha channel by a mask picture, stretched (nearest sample) to the image's size. */
function applyAlpha(rgba: Uint8Array, w: number, h: number, m: { w: number; h: number; a: Uint8Array }): void {
  for (let y = 0; y < h; y++) {
    const my = Math.min(m.h - 1, Math.floor((y * m.h) / h));
    for (let x = 0; x < w; x++) {
      const mx = Math.min(m.w - 1, Math.floor((x * m.w) / w));
      const i = (y * w + x) * 4 + 3;
      rgba[i] = Math.round((rgba[i] * m.a[my * m.w + mx]) / 255);
    }
  }
}

// ---------------------------------------------------------------- the content stream interpreter

const ABBREV: Record<string, string> = { BPC: 'BitsPerComponent', CS: 'ColorSpace', D: 'Decode', DP: 'DecodeParms', F: 'Filter', H: 'Height', IM: 'ImageMask', W: 'Width', I: 'Interpolate' };

class PageRun {
  private frames: Frame[] = [{ kind: 'root', children: [] }];
  private gs: GState;
  private path: SubPath[] = [];
  private cur: SubPath | null = null;
  private cx = 0;
  private cy = 0;
  private sx = 0;
  private sy = 0;
  private clipRule: 'nonzero' | 'evenodd' | null = null;
  private tm: M = ID;
  private tlm: M = ID;
  private lines: TextLine[] = [];
  private formDepth = 0;
  private baseCtm: M;
  private warnedSoftMask = false;

  constructor(
    private imp: Importer,
    base: M,
    private width: number,
    private height: number,
  ) {
    this.baseCtm = base;
    this.gs = {
      ctm: base,
      fill: BLACK,
      stroke: BLACK,
      fillCs: DEVICE_GRAY,
      strokeCs: DEVICE_GRAY,
      lineWidth: 1,
      cap: 'butt',
      join: 'miter',
      dash: [],
      dashPhase: 0,
      fillAlpha: 1,
      strokeAlpha: 1,
      blend: undefined,
      font: null,
      fontSize: 0,
      charSpace: 0,
      wordSpace: 0,
      hScale: 1,
      leading: 0,
      rise: 0,
      renderMode: 0,
    };
  }

  private get doc(): PdfDoc {
    return this.imp.doc;
  }

  private get top(): Frame {
    return this.frames[this.frames.length - 1];
  }

  private emit(n: SceneNode | null): void {
    if (n) this.top.children.push(n);
  }

  finish(): SceneNode[] {
    this.flushText();
    this.closeTo(1);
    return this.frames[0].children;
  }

  // ---- frames

  private closeTo(depth: number): void {
    while (this.frames.length > depth) this.closeFrame();
  }

  private closeFrame(): void {
    const f = this.frames.pop()!;
    const parent = this.top;
    const kids = f.children;
    if (!kids.length) return;
    if (f.kind === 'clip') {
      const b = boundsOf(kids);
      const r = f.rect;
      // a rectangular clip that holds everything inside it changes nothing
      if (r && b.x0 >= r.x0 - 0.5 && b.y0 >= r.y0 - 0.5 && b.x1 <= r.x1 + 0.5 && b.y1 <= r.y1 + 0.5) {
        parent.children.push(...kids);
        return;
      }
      parent.children.push(makeGroup(f.name ?? 'Clip group', [f.mask!, ...kids]));
      return;
    }
    const g = makeGroup(f.name ?? 'Group', kids);
    if (f.visible === false) g.visible = false;
    if (f.opacity !== undefined && f.opacity < 1) g.opacity = f.opacity;
    if (f.blend) g.blendMode = f.blend;
    parent.children.push(g);
  }

  // ---- execution

  exec(content: Uint8Array, res: Dict, ctm: M, depth: number): void {
    const doc = this.doc;
    const lex = new Lexer(content);
    const ops: PdfObj[] = [];
    const stack: { gs: GState; depth: number }[] = [];
    const mc: (Frame | null)[] = [];
    const startDepth = this.frames.length;
    void ctm;
    const num0 = (i: number) => num(ops[i]);
    for (let guard = 0; ; guard++) {
      const t = lex.next();
      if (t === undefined) break;
      if (t instanceof Cmd && t.cmd !== '[' && t.cmd !== '<<' && t.cmd !== 'true' && t.cmd !== 'false' && t.cmd !== 'null') {
        const op = t.cmd;
        switch (op) {
          case 'q':
            stack.push({ gs: { ...this.gs }, depth: this.frames.length });
            break;
          case 'Q': {
            const s = stack.pop();
            if (s) {
              this.flushText();
              this.closeTo(Math.max(startDepth, s.depth));
              this.gs = s.gs;
            }
            break;
          }
          case 'cm':
            if (ops.length >= 6) this.gs.ctm = cat([num0(0), num0(1), num0(2), num0(3), num0(4), num0(5)], this.gs.ctm);
            break;
          case 'w':
            this.gs.lineWidth = num0(0);
            break;
          case 'J':
            this.gs.cap = (['butt', 'round', 'square'] as const)[num0(0)] ?? 'butt';
            break;
          case 'j':
            this.gs.join = (['miter', 'round', 'bevel'] as const)[num0(0)] ?? 'miter';
            break;
          case 'd': {
            const a = ops[0];
            this.gs.dash = Array.isArray(a) ? a.map((x) => num(x)).filter((x) => x >= 0) : [];
            if (this.gs.dash.every((x) => x === 0)) this.gs.dash = [];
            this.gs.dashPhase = num0(1);
            break;
          }
          case 'gs':
            this.extGState(res, ops[0]);
            break;
          // path construction
          case 'm':
            this.moveTo(num0(0), num0(1));
            break;
          case 'l':
            this.lineTo(num0(0), num0(1));
            break;
          case 'c':
            this.curveTo(num0(0), num0(1), num0(2), num0(3), num0(4), num0(5));
            break;
          case 'v':
            this.curveTo(this.cx, this.cy, num0(0), num0(1), num0(2), num0(3), true);
            break;
          case 'y':
            this.curveTo(num0(0), num0(1), num0(2), num0(3), num0(2), num0(3));
            break;
          case 'h':
            this.closePath();
            break;
          case 're': {
            const x = num0(0);
            const y = num0(1);
            const w = num0(2);
            const h = num0(3);
            this.moveTo(x, y);
            this.lineTo(x + w, y);
            this.lineTo(x + w, y + h);
            this.lineTo(x, y + h);
            this.closePath();
            break;
          }
          // painting
          case 'S':
            this.paint(false, true, false, false);
            break;
          case 's':
            this.paint(false, true, false, true);
            break;
          case 'f':
          case 'F':
            this.paint(true, false, false, false);
            break;
          case 'f*':
            this.paint(true, false, true, false);
            break;
          case 'B':
            this.paint(true, true, false, false);
            break;
          case 'B*':
            this.paint(true, true, true, false);
            break;
          case 'b':
            this.paint(true, true, false, true);
            break;
          case 'b*':
            this.paint(true, true, true, true);
            break;
          case 'n':
            this.paint(false, false, false, false);
            break;
          case 'W':
            this.clipRule = 'nonzero';
            break;
          case 'W*':
            this.clipRule = 'evenodd';
            break;
          // colour
          case 'g':
            this.gs.fillCs = DEVICE_GRAY;
            this.gs.fill = { kind: 'rgb', rgb: DEVICE_GRAY.toRgb([num0(0)]) };
            break;
          case 'G':
            this.gs.strokeCs = DEVICE_GRAY;
            this.gs.stroke = { kind: 'rgb', rgb: DEVICE_GRAY.toRgb([num0(0)]) };
            break;
          case 'rg':
            this.gs.fillCs = DEVICE_RGB;
            this.gs.fill = { kind: 'rgb', rgb: DEVICE_RGB.toRgb([num0(0), num0(1), num0(2)]) };
            break;
          case 'RG':
            this.gs.strokeCs = DEVICE_RGB;
            this.gs.stroke = { kind: 'rgb', rgb: DEVICE_RGB.toRgb([num0(0), num0(1), num0(2)]) };
            break;
          case 'k':
            this.gs.fillCs = DEVICE_CMYK;
            this.gs.fill = { kind: 'rgb', rgb: DEVICE_CMYK.toRgb([num0(0), num0(1), num0(2), num0(3)]) };
            break;
          case 'K':
            this.gs.strokeCs = DEVICE_CMYK;
            this.gs.stroke = { kind: 'rgb', rgb: DEVICE_CMYK.toRgb([num0(0), num0(1), num0(2), num0(3)]) };
            break;
          case 'cs':
          case 'CS': {
            const cs = makeColorSpace(doc, ops[0], res, (m) => this.imp.warn(`Approximated ${m}`));
            const paint: PaintSrc = cs.isPattern ? { kind: 'none' } : { kind: 'rgb', rgb: cs.toRgb(cs.initial) };
            if (op === 'cs') {
              this.gs.fillCs = cs;
              this.gs.fill = paint;
            } else {
              this.gs.strokeCs = cs;
              this.gs.stroke = paint;
            }
            break;
          }
          case 'sc':
          case 'scn':
          case 'SC':
          case 'SCN': {
            const fill = op === 'sc' || op === 'scn';
            const cs = fill ? this.gs.fillCs : this.gs.strokeCs;
            const paint = this.colorFrom(cs, ops, res);
            if (fill) this.gs.fill = paint;
            else this.gs.stroke = paint;
            break;
          }
          case 'sh':
            this.shadeFill(res, ops[0]);
            break;
          // text
          case 'BT':
            this.flushText();
            this.tm = ID;
            this.tlm = ID;
            break;
          case 'ET':
            this.flushText();
            break;
          case 'Tc':
            this.gs.charSpace = num0(0);
            break;
          case 'Tw':
            this.gs.wordSpace = num0(0);
            break;
          case 'Tz':
            this.gs.hScale = num0(0) / 100;
            break;
          case 'TL':
            this.gs.leading = num0(0);
            break;
          case 'Tf': {
            const n = ops[0];
            this.gs.font = n instanceof Name ? this.imp.fontFor(res, n.name) : null;
            this.gs.fontSize = num0(1);
            break;
          }
          case 'Tr':
            this.gs.renderMode = num0(0);
            break;
          case 'Ts':
            this.gs.rise = num0(0);
            break;
          case 'Td':
            this.moveText(num0(0), num0(1));
            break;
          case 'TD':
            this.gs.leading = -num0(1);
            this.moveText(num0(0), num0(1));
            break;
          case 'Tm':
            if (ops.length >= 6) {
              this.tm = this.tlm = [num0(0), num0(1), num0(2), num0(3), num0(4), num0(5)];
            }
            break;
          case 'T*':
            this.moveText(0, -this.gs.leading);
            break;
          case 'Tj':
            if (ops[0] instanceof PdfString) this.showText(ops[0].bytes);
            break;
          case "'":
            this.moveText(0, -this.gs.leading);
            if (ops[0] instanceof PdfString) this.showText(ops[0].bytes);
            break;
          case '"':
            this.gs.wordSpace = num0(0);
            this.gs.charSpace = num0(1);
            this.moveText(0, -this.gs.leading);
            if (ops[2] instanceof PdfString) this.showText(ops[2].bytes);
            break;
          case 'TJ':
            if (Array.isArray(ops[0])) {
              for (const it of ops[0]) {
                if (it instanceof PdfString) this.showText(it.bytes);
                else if (typeof it === 'number') this.tm = cat([1, 0, 0, 1, (-it / 1000) * this.gs.fontSize * this.gs.hScale, 0], this.tm);
              }
            }
            break;
          // marked content (Illustrator layers are optional-content groups)
          case 'BDC':
          case 'BMC': {
            let opened: Frame | null = null;
            if (op === 'BDC' && ops[0] instanceof Name && ops[0].name === 'OC') {
              const raw = ops[1] instanceof Name ? doc.dictOf(res.Properties ?? null)?.[ops[1].name] : ops[1];
              const info = this.imp.ocInfo(raw);
              if (info) opened = this.openFrame({ kind: 'layer', children: [], name: info.name, visible: info.visible });
            }
            mc.push(opened);
            break;
          }
          case 'EMC': {
            const f = mc.pop();
            if (f) {
              this.flushText();
              const at = this.frames.indexOf(f);
              if (at > 0) this.closeTo(at);
            }
            break;
          }
          case 'Do':
            this.doXObject(res, ops[0], depth);
            break;
          case 'BI':
            this.inlineImage(lex, res);
            break;
          default:
            break;
        }
        ops.length = 0;
        continue;
      }
      const v = readObject(lex, false, t);
      if (!(v instanceof Cmd)) ops.push(v);
      if (ops.length > 512) ops.shift();
    }
    this.flushText();
    this.closeTo(startDepth);
    // unbalanced q: put the state back
    if (stack.length) this.gs = stack[0].gs;
  }

  private openFrame(f: Frame): Frame {
    this.frames.push(f);
    return f;
  }

  // ---- state operators

  private extGState(res: Dict, name: PdfObj | undefined): void {
    if (!(name instanceof Name)) return;
    const doc = this.doc;
    const d = doc.dictOf(doc.get(res.ExtGState ?? null, name.name));
    if (!d) return;
    const g = this.gs;
    if (d.LW !== undefined) g.lineWidth = num(doc.resolve(d.LW), 1);
    if (d.LC !== undefined) g.cap = (['butt', 'round', 'square'] as const)[num(doc.resolve(d.LC))] ?? 'butt';
    if (d.LJ !== undefined) g.join = (['miter', 'round', 'bevel'] as const)[num(doc.resolve(d.LJ))] ?? 'miter';
    const dash = doc.arrayOf(d.D);
    if (dash && dash.length >= 2) {
      g.dash = (doc.numbers(dash[0]) ?? []).filter((x) => x >= 0);
      if (g.dash.every((x) => x === 0)) g.dash = [];
      g.dashPhase = num(doc.resolve(dash[1]));
    }
    if (d.ca !== undefined) g.fillAlpha = Math.max(0, Math.min(1, num(doc.resolve(d.ca), 1)));
    if (d.CA !== undefined) g.strokeAlpha = Math.max(0, Math.min(1, num(doc.resolve(d.CA), 1)));
    if (d.BM !== undefined) {
      let bm = doc.resolve(d.BM);
      if (Array.isArray(bm)) bm = doc.resolve(bm[0]);
      const n = bm instanceof Name ? bm.name : 'Normal';
      if (n === 'Normal' || n === 'Compatible') g.blend = undefined;
      else if (BLENDS[n]) g.blend = BLENDS[n];
      else {
        g.blend = undefined;
        this.imp.warn(`Blend mode ${n} has no equivalent and was imported as normal`);
      }
    }
    const sm = doc.resolve(d.SMask);
    if (sm && !(sm instanceof Name) && !this.warnedSoftMask) {
      this.warnedSoftMask = true;
      this.imp.warn('Opacity masks (soft masks) were not carried over');
    }
  }

  private colorFrom(cs: ColorSpace, ops: PdfObj[], res: Dict): PaintSrc {
    const doc = this.doc;
    if (cs.isPattern) {
      const nm = ops[ops.length - 1];
      if (!(nm instanceof Name)) return { kind: 'none' };
      const pat = doc.resolve(doc.dictOf(res.Pattern ?? null)?.[nm.name]);
      const pd = pat instanceof PdfStream ? pat.dict : isDict(pat) ? pat : null;
      if (!pd) return { kind: 'none' };
      if (num(doc.resolve(pd.PatternType)) === 2) {
        const sh = this.imp.shading(res, pd.Shading);
        if (!sh) return { kind: 'none' };
        const pm = doc.numbers(pd.Matrix);
        const m: M = pm && pm.length >= 6 ? [pm[0], pm[1], pm[2], pm[3], pm[4], pm[5]] : ID;
        return { kind: 'shading', sh, m: cat(m, this.baseCtm) };
      }
      this.imp.warn('Pattern fills (tiling patterns) were left out');
      return { kind: 'none' };
    }
    const comps = ops.filter((o): o is number => typeof o === 'number');
    if (!comps.length) return { kind: 'rgb', rgb: cs.toRgb(cs.initial) };
    return { kind: 'rgb', rgb: cs.toRgb(comps) };
  }

  // ---- paths

  private moveTo(x: number, y: number): void {
    const p = ap(this.gs.ctm, x, y);
    this.cur = { closed: false, points: [{ x: p.x, y: p.y }] };
    this.path.push(this.cur);
    this.cx = this.sx = x;
    this.cy = this.sy = y;
  }

  private ensure(): SubPath {
    if (!this.cur) this.moveTo(this.cx, this.cy);
    return this.cur!;
  }

  private lineTo(x: number, y: number): void {
    const sp = this.ensure();
    const p = ap(this.gs.ctm, x, y);
    sp.points.push({ x: p.x, y: p.y });
    this.cx = x;
    this.cy = y;
  }

  private curveTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, _v = false): void {
    const sp = this.ensure();
    const m = this.gs.ctm;
    const prev = sp.points[sp.points.length - 1];
    const a = ap(m, x1, y1);
    const b = ap(m, x2, y2);
    const c = ap(m, x3, y3);
    prev.out = { x: a.x - prev.x, y: a.y - prev.y };
    sp.points.push({ x: c.x, y: c.y, in: { x: b.x - c.x, y: b.y - c.y } });
    this.cx = x3;
    this.cy = y3;
  }

  private closePath(): void {
    const sp = this.cur;
    if (!sp) return;
    sp.closed = true;
    // a closing line back to the start leaves a doubled point: fold it in
    const first = sp.points[0];
    const last = sp.points[sp.points.length - 1];
    if (sp.points.length > 2 && Math.hypot(first.x - last.x, first.y - last.y) < 1e-6) {
      if (last.in) first.in = last.in;
      sp.points.pop();
    }
    this.cx = this.sx;
    this.cy = this.sy;
    // more drawing continues from the start point, in a fresh sub-path
    this.cur = null;
  }

  private resetPath(): void {
    this.path = [];
    this.cur = null;
    this.clipRule = null;
  }

  private paint(fill: boolean, stroke: boolean, evenodd: boolean, close: boolean): void {
    if (close) this.closePath();
    const subs = this.path.filter((s) => s.points.length > 0);
    const rule = this.clipRule;
    try {
      if (subs.length) {
        if ((fill || stroke) && this.formDepth < 40) this.emitPath(subs, fill, stroke, evenodd);
        if (rule) this.addClip(subs, rule === 'evenodd');
      }
    } finally {
      this.resetPath();
    }
  }

  private emitPath(subs: SubPath[], fill: boolean, stroke: boolean, evenodd: boolean): void {
    const gs = this.gs;
    const paths: SubPath[] = subs.map((s) => ({ closed: fill && !stroke ? true : s.closed, points: s.points.map((p) => ({ ...p })) }));
    const b = pathBounds(paths);
    const bb = { x: b.x, y: b.y, width: b.width, height: b.height };
    const f = fill ? this.imp.paintFor(gs.fill, gs.fillAlpha, bb) : null;
    const k = scaleOf(gs.ctm);
    const sp = stroke ? this.imp.paintFor(gs.stroke, gs.strokeAlpha, bb) : null;
    if (!f && !sp) return;
    if (f && !sp && (b.width < 1e-4 || b.height < 1e-4)) return;
    const width = Math.max(0.01, r3(gs.lineWidth * k));
    const dash = gs.dash.map((d) => r3(d * k));
    const node = createNode('path', {
      name: 'Path',
      x: r2(b.x),
      y: r2(b.y),
      width: Math.max(0.01, r2(b.width)),
      height: Math.max(0.01, r2(b.height)),
      fill: f,
      stroke: sp ? { paint: sp, width, ...(dash.length ? { dash, ...(gs.dashPhase ? { dashOffset: r3(gs.dashPhase * k) } : {}) } : {}) } : null,
      paths: paths.map((s) => ({ closed: s.closed, points: s.points.map((p) => localPoint(p, b.x, b.y)) })),
      fillRule: evenodd ? 'evenodd' : 'nonzero',
      lineCap: gs.cap,
      lineJoin: gs.join,
      ...(gs.blend ? { blendMode: gs.blend } : {}),
    });
    this.emit(node);
  }

  private addClip(subs: SubPath[], evenodd: boolean): void {
    this.flushText();
    const paths: SubPath[] = subs.map((s) => ({ closed: true, points: s.points.map((p) => ({ ...p })) }));
    const b = pathBounds(paths);
    // an axis-aligned rectangle?
    let rect: Frame['rect'] = null;
    if (paths.length === 1) {
      const pts = paths[0].points;
      if (pts.length === 4 && pts.every((p) => !p.in && !p.out)) {
        const xs = [...new Set(pts.map((p) => Math.round(p.x * 100)))];
        const ys = [...new Set(pts.map((p) => Math.round(p.y * 100)))];
        if (xs.length === 2 && ys.length === 2) rect = { x0: b.x, y0: b.y, x1: b.x + b.width, y1: b.y + b.height };
      }
    }
    // a clip that covers the whole artboard clips nothing
    if (rect && rect.x0 <= 0.5 && rect.y0 <= 0.5 && rect.x1 >= this.width - 0.5 && rect.y1 >= this.height - 0.5) return;
    const mask = createNode('path', {
      name: 'Clip',
      x: r2(b.x),
      y: r2(b.y),
      width: Math.max(0.01, r2(b.width)),
      height: Math.max(0.01, r2(b.height)),
      fill: { type: 'solid', color: '#000000' },
      stroke: null,
      paths: paths.map((s) => ({ closed: true, points: s.points.map((p) => localPoint(p, b.x, b.y)) })),
      fillRule: evenodd ? 'evenodd' : 'nonzero',
      mask: true,
    });
    this.openFrame({ kind: 'clip', children: [], name: 'Clip group', mask, rect });
  }

  private shadeFill(res: Dict, nm: PdfObj | undefined): void {
    if (!(nm instanceof Name)) return;
    const sh = this.imp.shading(res, this.doc.get(res.Shading ?? null, nm.name));
    if (!sh) return;
    const bbox = sh.bbox ? [ap(this.gs.ctm, sh.bbox[0], sh.bbox[1]), ap(this.gs.ctm, sh.bbox[2], sh.bbox[3])] : null;
    const x0 = bbox ? Math.min(bbox[0].x, bbox[1].x) : 0;
    const y0 = bbox ? Math.min(bbox[0].y, bbox[1].y) : 0;
    const x1 = bbox ? Math.max(bbox[0].x, bbox[1].x) : this.width;
    const y1 = bbox ? Math.max(bbox[0].y, bbox[1].y) : this.height;
    const box = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    const paint = this.imp.gradient(sh, this.gs.ctm, this.gs.fillAlpha, box);
    if (!paint) return;
    this.emit(
      createNode('path', {
        name: 'Gradient',
        x: r2(x0),
        y: r2(y0),
        width: Math.max(0.01, r2(x1 - x0)),
        height: Math.max(0.01, r2(y1 - y0)),
        fill: paint,
        stroke: null,
        paths: [{ closed: true, points: [[0, 0], [x1 - x0, 0], [x1 - x0, y1 - y0], [0, y1 - y0]].map(([x, y]) => ({ x: r2(x), y: r2(y) })) }],
        ...(this.gs.blend ? { blendMode: this.gs.blend } : {}),
      }),
    );
  }

  // ---- images and forms

  private doXObject(res: Dict, nm: PdfObj | undefined, depth: number): void {
    if (!(nm instanceof Name)) return;
    const doc = this.doc;
    const xo = doc.dictOf(res.XObject ?? null);
    const raw = xo?.[nm.name];
    const obj = doc.resolve(raw);
    if (!(obj instanceof PdfStream)) return;
    const sub = doc.get(obj.dict, 'Subtype');
    // an optional-content layer on the object itself
    let layer: Frame | null = null;
    if (obj.dict.OC) {
      const info = this.imp.ocInfo(obj.dict.OC);
      if (info) layer = this.openFrame({ kind: 'layer', children: [], name: info.name, visible: info.visible });
    }
    try {
      if (sub instanceof Name && sub.name === 'Image') this.drawImage(obj, raw && typeof raw === 'object' && 'num' in raw ? String((raw as Ref).num) : null, res);
      else if (sub instanceof Name && sub.name === 'Form') this.drawForm(obj, res, depth);
    } finally {
      if (layer) {
        const at = this.frames.indexOf(layer);
        if (at > 0) this.closeTo(at);
      }
    }
  }

  private drawForm(form: PdfStream, res: Dict, depth: number): void {
    if (depth > 24) return;
    const doc = this.doc;
    const d = form.dict;
    const fm = doc.numbers(d.Matrix);
    const fres = doc.dictOf(d.Resources) ?? res;
    const saved = this.gs;
    const savedBase = this.baseCtm;
    this.gs = { ...saved };
    const m: M = fm && fm.length >= 6 ? [fm[0], fm[1], fm[2], fm[3], fm[4], fm[5]] : ID;
    this.gs.ctm = cat(m, saved.ctm);
    this.baseCtm = this.gs.ctm;
    // a transparency group with opacity or a blend mode composites as one: wrap it
    const isGroup = !!doc.dictOf(d.Group);
    let wrap: Frame | null = null;
    if (isGroup && (saved.fillAlpha < 1 || saved.blend)) {
      wrap = this.openFrame({ kind: 'group', children: [], name: 'Group', opacity: saved.fillAlpha, blend: saved.blend });
      this.gs.fillAlpha = 1;
      this.gs.strokeAlpha = 1;
      this.gs.blend = undefined;
    }
    const savedPath = [this.path, this.cur] as const;
    this.path = [];
    this.cur = null;
    this.formDepth++;
    try {
      const data = doc.decode(form).data;
      this.exec(data, fres, this.gs.ctm, depth + 1);
    } catch (err) {
      this.imp.warn(`A form could not be read (${err instanceof Error ? err.message : String(err)})`);
    } finally {
      this.formDepth--;
      [this.path, this.cur] = savedPath as [SubPath[], SubPath | null];
      if (wrap) {
        const at = this.frames.indexOf(wrap);
        if (at > 0) this.closeTo(at);
      }
      this.gs = saved;
      this.baseCtm = savedBase;
    }
  }

  private drawImage(img: PdfStream, key: string | null, res: Dict): void {
    this.flushText();
    const gs = this.gs;
    const isMask = this.doc.resolve(img.dict.ImageMask) === true;
    let stencil: RGB | null = null;
    if (isMask) {
      if (gs.fill.kind === 'rgb') stencil = gs.fill.rgb;
      else if (gs.fill.kind === 'shading') stencil = gs.fill.sh.cs.toRgb(gs.fill.sh.fn.eval([gs.fill.sh.domain[0]]));
      else stencil = [0, 0, 0];
    }
    const id = this.imp.imageAsset(img, key, res, stencil);
    if (!id) return;
    this.emitImage(id);
  }

  private emitImage(id: string): void {
    const gs = this.gs;
    const m = gs.ctm;
    const w = Math.hypot(m[0], m[1]);
    const h = Math.hypot(m[2], m[3]);
    if (w < 1e-6 || h < 1e-6) return;
    const c = ap(m, 0.5, 0.5);
    const det = m[0] * m[3] - m[1] * m[2];
    // the image's top row is y = 1 in PDF; with the page flipped, an unmirrored image has a negative determinant
    const mirrored = det > 0;
    const rot = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    this.emit(
      createNode('image', {
        name: 'Image',
        assetId: id,
        x: r2(c.x - w / 2),
        y: r2(c.y - h / 2),
        width: r2(w),
        height: r2(h),
        fit: 'fill',
        ...(Math.abs(rot) > 0.01 ? { rotation: r2(rot) } : {}),
        ...(mirrored ? { scaleY: -1 } : {}),
        ...(gs.fillAlpha < 1 ? { opacity: r3(gs.fillAlpha) } : {}),
        ...(gs.blend ? { blendMode: gs.blend } : {}),
      }),
    );
  }

  private inlineImage(lex: Lexer, res: Dict): void {
    const dict: Dict = Object.create(null);
    for (;;) {
      const k = lex.next();
      if (k === undefined) return;
      if (k instanceof Cmd && k.cmd === 'ID') break;
      if (!(k instanceof Name)) continue;
      const v = readObject(lex, false);
      dict[ABBREV[k.name] ?? k.name] = v instanceof Cmd ? null : v;
    }
    const b = lex.b;
    let start = lex.pos;
    if (b[start] === 13 && b[start + 1] === 10) start += 2;
    else start++;
    // find "EI" between whitespace
    let end = start;
    for (;;) {
      const e = indexOf(b, 'EI', end);
      if (e < 0) {
        lex.pos = b.length;
        return;
      }
      const before = b[e - 1];
      const after = b[e + 2];
      if ((before === 10 || before === 13 || before === 32 || before === 9) && (after === undefined || after === 10 || after === 13 || after === 32 || after === 9)) {
        lex.pos = e + 2;
        end = e - 1;
        break;
      }
      end = e + 2;
    }
    const data = b.subarray(start, end);
    // the image is a unit square under the current matrix, like an XObject
    const stream = new PdfStream(dict, data);
    this.drawImage(stream, null, res);
  }

  // ---- text

  private moveText(tx: number, ty: number): void {
    this.tlm = cat([1, 0, 0, 1, tx, ty], this.tlm);
    this.tm = this.tlm;
  }

  private showText(bytes: Uint8Array): void {
    const gs = this.gs;
    const font = gs.font;
    if (!font || font.type3 || !gs.fontSize) return;
    const glyphs = font.decode(bytes);
    if (!glyphs.length) return;
    const fs = gs.fontSize;
    const th = gs.hScale;
    const visible = gs.renderMode !== 3 && gs.renderMode !== 7;
    const origin = () => ap(cat([fs * th, 0, 0, fs, 0, gs.rise], cat(this.tm, gs.ctm)), 0, 0);
    const start = origin();
    const trm = cat(this.tm, gs.ctm);
    const size = Math.abs(fs) * (Math.hypot(trm[2], trm[3]) || 1);
    const angle = (Math.atan2(trm[1], trm[0]) * 180) / Math.PI;
    let text = '';
    for (const g of glyphs) {
      text += g.text;
      const adv = ((g.width / 1000) * fs + gs.charSpace + (g.space ? gs.wordSpace : 0)) * th;
      this.tm = cat([1, 0, 0, 1, adv, 0], this.tm);
    }
    if (!visible || !text) return;
    const end = origin();
    if (font.guessed) this.imp.warn('Some text had no Unicode mapping and may show the wrong characters');
    const src = gs.renderMode === 1 || gs.renderMode === 5 ? gs.stroke : gs.fill;
    let color = '#000000';
    const alpha = gs.renderMode === 1 || gs.renderMode === 5 ? gs.strokeAlpha : gs.fillAlpha;
    if (src.kind === 'rgb') color = colorStr(src.rgb, alpha);
    else if (src.kind === 'shading') color = colorStr(src.sh.cs.toRgb(src.sh.fn.eval([src.sh.domain[0]])), alpha);
    const spacing = r2(gs.charSpace * (Math.hypot(trm[0], trm[1]) || 1) * th);
    this.lines.push({ text, x: start.x, y: start.y, endX: end.x, endY: end.y, size, angle, font, color, spacing });
  }

  private flushText(): void {
    const lines = this.lines;
    this.lines = [];
    if (!lines.length) return;
    // pieces on one baseline with the same style are one run of text
    const runs: TextLine[] = [];
    for (const l of lines) {
      const p = runs[runs.length - 1];
      if (p && sameStyle(p, l)) {
        const rad = (p.angle * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = l.x - p.endX;
        const dy = l.y - p.endY;
        const along = dx * cos + dy * sin;
        const perp = -dx * sin + dy * cos;
        if (Math.abs(perp) < 0.25 * p.size && along > -0.3 * p.size && along < 6 * p.size) {
          const gap = along <= 0.12 * p.size ? 0 : Math.max(1, Math.min(12, Math.round(along / (0.27 * p.size))));
          p.text += ' '.repeat(gap) + l.text;
          p.endX = l.endX;
          p.endY = l.endY;
          continue;
        }
      }
      runs.push({ ...l });
    }
    // following lines of one style and left edge are one paragraph
    const paras: Para[] = [];
    for (const l of runs) {
      const p = paras[paras.length - 1];
      if (p && Math.abs(l.angle) < 0.01) {
        const first = p.lines[0];
        const lastL = p.lines[p.lines.length - 1];
        const step = l.y - lastL.y;
        if (sameStyle(first, l) && Math.abs(l.x - first.x) < 0.5 && step > 0.7 * l.size && step < 3 * l.size && (p.lines.length === 1 || Math.abs(step - p.step) < 0.3)) {
          p.lines.push(l);
          p.step = step;
          continue;
        }
      }
      paras.push({ lines: [l], step: 0 });
    }
    for (const p of paras) this.emitText(p);
  }

  private emitText(p: Para): void {
    const first = p.lines[0];
    const size = Math.max(1, r2(first.size));
    const multi = p.lines.length > 1;
    const lh = multi ? Math.max(0.8, Math.min(3, r2(p.step / size))) : 1.2;
    const text = p.lines.map((l) => l.text).join('\n');
    const widest = Math.max(...p.lines.map((l) => Math.hypot(l.endX - l.x, l.endY - l.y)));
    const width = Math.ceil(widest) + 2;
    const height = r2(lh * size * p.lines.length);
    const baseline = size * (0.95 + (lh - 1.2) / 2);
    const rad = (first.angle * Math.PI) / 180;
    const dx = width / 2;
    const dy = -baseline + height / 2;
    const cx = first.x + dx * Math.cos(rad) - dy * Math.sin(rad);
    const cy = first.y + dx * Math.sin(rad) + dy * Math.cos(rad);
    const f = first.font;
    if (f.google) {
      if (!this.imp.googleWeights.has(f.family)) this.imp.googleWeights.set(f.family, new Set());
      this.imp.googleWeights.get(f.family)!.add(f.weight);
    }
    this.emit(
      createNode('text', {
        name: text.replace(/\s+/g, ' ').trim().slice(0, 30) || 'Text',
        text: text.replace(/\{/g, '{{').replace(/\}/g, '}}'),
        x: r2(cx - width / 2),
        y: r2(cy - height / 2),
        width,
        height,
        ...(Math.abs(first.angle) > 0.01 ? { rotation: r2(first.angle) } : {}),
        fontFamily: f.family,
        fontSize: size,
        fontWeight: f.weight,
        fontStyle: f.italic ? 'italic' : 'normal',
        lineHeight: lh,
        letterSpacing: first.spacing,
        color: first.color,
        align: 'left',
        verticalAlign: 'top',
        autoSize: 'width',
      }),
    );
  }
}

const sameStyle = (a: TextLine, b: TextLine) => a.font === b.font && Math.abs(a.size - b.size) < 0.05 && Math.abs(a.angle - b.angle) < 0.1 && a.color === b.color && a.spacing === b.spacing;

function localPoint(p: { x: number; y: number; in?: { x: number; y: number } | null; out?: { x: number; y: number } | null }, ox: number, oy: number) {
  return {
    x: r2(p.x - ox),
    y: r2(p.y - oy),
    in: p.in ? { x: r2(p.in.x), y: r2(p.in.y) } : null,
    out: p.out ? { x: r2(p.out.x), y: r2(p.out.y) } : null,
  };
}

function boundsOf(kids: SceneNode[]) {
  return {
    x0: Math.min(...kids.map((k) => k.x)),
    y0: Math.min(...kids.map((k) => k.y)),
    x1: Math.max(...kids.map((k) => k.x + k.width)),
    y1: Math.max(...kids.map((k) => k.y + k.height)),
  };
}

/** A group whose box is the union of its children (the masks excepted), with the children placed relative to it. */
function makeGroup(name: string, kids: SceneNode[]): SceneNode {
  const shown = kids.filter((k) => !k.mask);
  const b = boundsOf(shown.length ? shown : kids);
  for (const k of kids) {
    k.x = r2(k.x - b.x0);
    k.y = r2(k.y - b.y0);
  }
  return createNode('group', { name, x: r2(b.x0), y: r2(b.y0), width: Math.max(0.01, r2(b.x1 - b.x0)), height: Math.max(0.01, r2(b.y1 - b.y0)), children: kids });
}

// ---------------------------------------------------------------- entry

/** True for bytes that carry a PDF structure (what an Illustrator file saved with PDF compatibility does). */
export function hasPdf(bytes: Uint8Array): boolean {
  return indexOf(bytes, '%PDF-', 0, Math.min(bytes.length, 4096)) >= 0;
}

/** Read an Illustrator or PDF file: one artboard per page. */
export function importAi(bytes: Uint8Array, baseName = ''): AiImport {
  let doc: PdfDoc;
  try {
    doc = new PdfDoc(bytes);
  } catch (err) {
    if (err instanceof NotPdfError) throw new Error(NO_PDF);
    throw err;
  }
  const imp = new Importer(doc);
  const pages = doc.pages();
  if (!pages.length) throw new Error(NO_PDF);
  const base = baseName.trim() || 'Illustrator import';
  const artboards: Artboard[] = [];
  let x = 0;
  pages.forEach((p, i) => {
    const pg = imp.page(p);
    const name = pages.length === 1 ? base : `${base} / ${pageLabel(doc, p) ?? `Artboard ${i + 1}`}`;
    if (pg.empty && pages.length > 1) imp.warn(`${name} has no artwork`);
    artboards.push(createArtboard({ name, width: pg.width, height: pg.height, children: pg.children, canvasX: x, canvasY: 0 }));
    x += pg.width + 100;
  });
  // An Illustrator file saved without PDF compatibility still has a PDF page: a note saying so, drawn as text
  const kinds = new Set<string>();
  const notes: string[] = [];
  const scan = (list: SceneNode[]) => {
    for (const n of list) {
      kinds.add(n.type);
      if (n.type === 'text') notes.push((n as { text: string }).text);
      if ('children' in n && Array.isArray(n.children)) scan(n.children as SceneNode[]);
    }
  };
  for (const a of artboards) scan(a.children);
  if (kinds.size === 1 && kinds.has('text') && /without PDF content|Create PDF Compatible/i.test(notes.join(' ').replace(/\s+/g, ' '))) throw new Error(NO_PDF);
  if (artboards.every((a) => !a.children.length)) throw new Error("No artwork was found in this file. If it is an Illustrator file, save it with 'Create PDF Compatible File' ticked and import it again.");
  const warnings = [...doc.warnings, ...imp.warnings];
  const fonts: FontRef[] = [...imp.googleWeights].map(([family, w]) => ({ family, source: 'google', weights: [...w].sort((a, b) => a - b) }));
  return { artboard: artboards[0], artboards, assets: imp.assets, fonts, warnings };
}

/** A page's own name when the file gives one (a page label). */
function pageLabel(doc: PdfDoc, p: PageInfo): string | null {
  const l = doc.resolve(p.dict.Label ?? p.dict.Name);
  if (l instanceof PdfString && l.text.trim()) return l.text.trim();
  return null;
}
