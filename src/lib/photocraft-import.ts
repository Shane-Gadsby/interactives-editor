/**
 * PhotoCraft (`.pcraft`) import.
 *
 * A `.pcraft` file is a ZIP archive (or a folder with the same layout) of
 *     manifest.json            the document: a tree of layers with blend modes, masks, effects, text and shapes
 *     tiles/<hash>.zst         256 x 256 tiles of pixels, zstd-compressed, little-endian samples, interleaved channels
 *     blobs/<hash>.zst         other binary data (smart object sources, profiles, ...)
 *     thumb.png, composite/... optional previews
 * Pixels of every surface (layers, masks) are tiles in document coordinates; tiles that are not stored read as the surface's
 * default pixel. This reader decodes the zstd tiles itself (`zstd.ts`).
 *
 * What comes across, like the Photoshop importer:
 *   - pixel layers become image layers (PNG assets) at their place, with the layer mask baked in;
 *   - groups become groups; artboards (groups with an artboard rectangle) become artboards;
 *   - opacity (times fill opacity), blend modes, visibility, clipping layers, vector masks (as a path mask) and group masks;
 *   - type layers become text layers (font, size, colour, tracking, leading, alignment, style runs), unless they are warped,
 *     vertical or on a path, which keep their rendered pixels when the file has them;
 *   - shape layers become path layers (fill, gradient, stroke); fill layers become a rectangle over the canvas;
 *   - smart objects use their rendered pixels; drop shadows become the layer's shadow.
 * Not carried over (and reported): adjustment layers, other layer styles, pattern fills (drawn from the cached pixels when
 * there are some), blend modes Interactives lacks, mask feather and density below 100%, text warps, and documents that are not
 * RGB, grayscale, CMYK or Lab. If nothing can be imported the flattened preview in the file is used instead.
 */
import { PASCAL_BLENDS } from './blend-modes';
import { unzipSync } from 'fflate';
import { cloneWithNewIds, createArtboard, createNode, type Artboard, type BlendMode, type FontRef, type Paint, type SceneNode, type Shadow, type TextNode } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import {
  FontBook,
  absBounds,
  assetId,
  buildTextNode,
  cmykToRgb,
  colorAt,
  cssColor,
  finite,
  labToRgb,
  linearGradient,
  makeGroup,
  mulM,
  parseM,
  pathNodeOf,
  radialGradient,
  round,
  translateM,
  withMidpoints,
  type AbsSub,
  type Box,
  type GStop,
  type RGBA,
  type TextPiece,
} from './craft-shared';
import { encodePng } from './psd-import';
import { isZstd, zstdDecompress } from './zstd';

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d = 0): number => finite(v, d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

export const PHOTOCRAFT_FORMAT_VERSION = 1;
const TILE = 256;
/** Pixels one surface may decode to (a layer of 100 megapixels is refused rather than run the browser out of memory). */
const MAX_PIXELS = 100_000_000;
const MAX_LAYERS = 5000;

// ---------------------------------------------------------------- the bundle

export interface PcraftBundle {
  manifest: Rec;
  /** The entry at `path` (`tiles/...`, `blobs/...`) or null. */
  entry(path: string): Uint8Array | null;
}

const isZip = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);

/** Does this look like a `.pcraft` bundle: a ZIP with a `manifest.json` that has a `format_version` and a document with layers? */
export function isPhotoCraft(bytes: Uint8Array): boolean {
  if (!isZip(bytes)) return false;
  try {
    const files = unzipSync(bytes, { filter: (f) => /(^|\/)manifest\.json$/.test(f.name) });
    const name = Object.keys(files).find((n) => /(^|\/)manifest\.json$/.test(n));
    if (!name) return false;
    const m = rec(JSON.parse(new TextDecoder().decode(files[name])));
    return typeof m.format_version === 'number' && Array.isArray(rec(m.document).layers);
  } catch {
    return false;
  }
}

export function readPhotoCraft(bytes: Uint8Array): PcraftBundle {
  if (!isZip(bytes)) throw new Error('This is not a PhotoCraft file (it is not a ZIP archive). If you have a .pcraft folder, zip its contents first.');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch (e) {
    throw new Error(`This PhotoCraft file can’t be unzipped (${e instanceof Error ? e.message : String(e)})`);
  }
  const mname = Object.keys(files).find((n) => /(^|\/)manifest\.json$/.test(n));
  if (!mname) throw new Error('This is not a PhotoCraft file (no manifest.json inside)');
  const prefix = mname.slice(0, mname.length - 'manifest.json'.length);
  let manifest: Rec;
  try {
    manifest = rec(JSON.parse(new TextDecoder().decode(files[mname])));
  } catch {
    throw new Error('This PhotoCraft file’s manifest can’t be read');
  }
  const version = num(manifest.format_version);
  if (version < 1 || !manifest.document) throw new Error('This is not a PhotoCraft file (the manifest has no document)');
  if (version > PHOTOCRAFT_FORMAT_VERSION) throw new Error(`This PhotoCraft file is format ${version}, newer than this editor reads (${PHOTOCRAFT_FORMAT_VERSION}). Export it from PhotoCraft as PSD or PNG.`);
  return { manifest, entry: (p) => files[prefix + p] ?? null };
}

// ---------------------------------------------------------------- pixels

interface Fmt {
  mode: string;
  sample: 'U8' | 'U16' | 'F32';
  alpha: boolean;
  channels: number;
  bpp: number;
}

function fmtOf(v: unknown): Fmt {
  const o = rec(v);
  const mode = str(o.mode, 'Rgb');
  const sample = str(o.sample, 'U8') === 'U16' ? 'U16' : str(o.sample) === 'F32' ? 'F32' : 'U8';
  const alpha = o.alpha === true;
  const color = mode === 'Cmyk' ? 4 : mode === 'Grayscale' || mode === 'Bitmap' || mode === 'Duotone' ? 1 : 3;
  const channels = color + (alpha ? 1 : 0);
  return { mode, sample, alpha, channels, bpp: channels * (sample === 'U8' ? 1 : sample === 'U16' ? 2 : 4) };
}

/** Reads one sample (0-1) of a pixel at byte offset `o`. */
function sampleAt(f: Fmt, b: Uint8Array, o: number, c: number): number {
  if (f.sample === 'U8') return b[o + c] / 255;
  if (f.sample === 'U16') return (b[o + 2 * c] | (b[o + 2 * c + 1] << 8)) / 65535;
  const i = o + 4 * c;
  const dv = new DataView(b.buffer, b.byteOffset + i, 4);
  return Math.max(0, Math.min(1, dv.getFloat32(0, true)));
}

/** One pixel as straight RGBA8. */
function pixelRgba(f: Fmt, b: Uint8Array, o: number, out: Uint8Array, p: number): void {
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  let r: number;
  let g: number;
  let bl: number;
  const colors = f.alpha ? f.channels - 1 : f.channels;
  if (f.mode === 'Cmyk') {
    [r, g, bl] = cmykToRgb(sampleAt(f, b, o, 0), sampleAt(f, b, o, 1), sampleAt(f, b, o, 2), sampleAt(f, b, o, 3));
  } else if (f.mode === 'Lab') {
    [r, g, bl] = labToRgb(sampleAt(f, b, o, 0) * 100, sampleAt(f, b, o, 1) * 255 - 128, sampleAt(f, b, o, 2) * 255 - 128);
  } else if (colors === 1) {
    r = g = bl = sampleAt(f, b, o, 0) * 255;
  } else {
    r = sampleAt(f, b, o, 0) * 255;
    g = sampleAt(f, b, o, 1) * 255;
    bl = sampleAt(f, b, o, 2) * 255;
  }
  out[p] = q(r);
  out[p + 1] = q(g);
  out[p + 2] = q(bl);
  out[p + 3] = f.alpha ? q(sampleAt(f, b, o, colors) * 255) : 255;
}

const unhex = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16) || 0;
  return out;
};

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The tiles of a surface and the pixel rectangle they cover. */
function tileRect(sm: Rec): Rect | null {
  const tiles = arr(sm.tiles).map(rec);
  if (!tiles.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tiles) {
    const tx = num(t.tx);
    const ty = num(t.ty);
    x0 = Math.min(x0, tx * TILE);
    y0 = Math.min(y0, ty * TILE);
    x1 = Math.max(x1, (tx + 1) * TILE);
    y1 = Math.max(y1, (ty + 1) * TILE);
  }
  return { x0, y0, x1, y1 };
}

class Decoder {
  readonly warnings = new Set<string>();
  constructor(readonly bundle: PcraftBundle) {}

  private tile(hash: string, len: number): Uint8Array | null {
    if (!/^[0-9a-f]{64}$/.test(hash)) return null;
    const raw = this.bundle.entry(`tiles/${hash}.zst`);
    if (!raw) return null;
    try {
      const data = isZstd(raw) ? zstdDecompress(raw, len) : raw;
      return data.length >= len ? data : null;
    } catch (e) {
      this.warnings.add(`Some pixels could not be decoded (${e instanceof Error ? e.message : String(e)})`);
      return null;
    }
  }

  /** The default pixel of a surface as RGBA8. */
  defaultRgba(sm: Rec): [number, number, number, number] {
    const f = fmtOf(sm.format);
    const raw = unhex(str(sm.default));
    if (raw.length < f.bpp) return [0, 0, 0, 0];
    const out = new Uint8Array(4);
    pixelRgba(f, raw, 0, out, 0);
    return [out[0], out[1], out[2], out[3]];
  }

  /** Decode the surface into `rect`: RGBA8 (`gray` false) or the first channel only (`gray` true, for masks). */
  read(sm: Rec, rect: Rect, gray: boolean): Uint8Array {
    const f = fmtOf(sm.format);
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const out = new Uint8Array(w * h * (gray ? 1 : 4));
    const dflt = unhex(str(sm.default));
    const px = new Uint8Array(4);
    if (dflt.length >= f.bpp) {
      pixelRgba(f, dflt, 0, px, 0);
      const g = Math.round(sampleAt(f, dflt, 0, 0) * 255);
      if (gray ? g !== 0 : px[0] || px[1] || px[2] || px[3]) {
        for (let i = 0; i < w * h; i++) {
          if (gray) out[i] = g;
          else out.set(px, i * 4);
        }
      }
    }
    const tileLen = TILE * TILE * f.bpp;
    for (const t of arr(sm.tiles).map(rec)) {
      const tx = num(t.tx) * TILE;
      const ty = num(t.ty) * TILE;
      if (tx + TILE <= rect.x0 || tx >= rect.x1 || ty + TILE <= rect.y0 || ty >= rect.y1) continue;
      const data = this.tile(str(t.hash), tileLen);
      if (!data) {
        this.warnings.add('Some pixel tiles are missing from the file');
        continue;
      }
      for (let y = Math.max(ty, rect.y0); y < Math.min(ty + TILE, rect.y1); y++) {
        for (let x = Math.max(tx, rect.x0); x < Math.min(tx + TILE, rect.x1); x++) {
          const so = ((y - ty) * TILE + (x - tx)) * f.bpp;
          const di = (y - rect.y0) * w + (x - rect.x0);
          if (gray) out[di] = Math.round(sampleAt(f, data, so, 0) * 255);
          else if (f.sample === 'U8' && f.mode === 'Rgb') {
            const d = di * 4;
            out[d] = data[so];
            out[d + 1] = data[so + 1];
            out[d + 2] = data[so + 2];
            out[d + 3] = f.alpha ? data[so + 3] : 255;
          } else pixelRgba(f, data, so, out, di * 4);
        }
      }
    }
    return out;
  }
}

interface Picture {
  x: number;
  y: number;
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** The opaque part of an RGBA image, cropped; null when nothing is visible. */
function cropVisible(x: number, y: number, w: number, h: number, rgba: Uint8Array): Picture | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (rgba[(j * w + i) * 4 + 3]) {
        if (i < x0) x0 = i;
        if (i > x1) x1 = i;
        if (j < y0) y0 = j;
        if (j > y1) y1 = j;
      }
    }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  if (cw === w && ch === h) return { x, y, width: w, height: h, rgba };
  const out = new Uint8Array(cw * ch * 4);
  for (let j = 0; j < ch; j++) out.set(rgba.subarray(((y0 + j) * w + x0) * 4, ((y0 + j) * w + x0 + cw) * 4), j * cw * 4);
  return { x: x + x0, y: y + y0, width: cw, height: ch, rgba: out };
}

// ---------------------------------------------------------------- colours, fills

const BLENDS = PASCAL_BLENDS;

/** A PhotoCraft colour ({mode, c: [4], alpha}) as straight RGBA. */
export function pcColor(v: unknown): RGBA {
  const o = rec(v);
  const c = arr(o.c).map((n) => num(n));
  const k = (i: number) => Math.max(0, Math.min(1, c[i] ?? 0));
  const alpha = Math.max(0, Math.min(1, num(o.alpha, 1)));
  switch (str(o.mode, 'Rgb')) {
    case 'Cmyk': {
      const [r, g, b] = cmykToRgb(k(0), k(1), k(2), k(3));
      return { r, g, b, a: alpha };
    }
    case 'Lab': {
      const [r, g, b] = labToRgb(k(0) * 100, k(1) * 255 - 128, k(2) * 255 - 128);
      return { r, g, b, a: alpha };
    }
    case 'Grayscale':
    case 'Bitmap':
    case 'Duotone':
      return { r: k(0) * 255, g: k(0) * 255, b: k(0) * 255, a: alpha };
    default:
      return { r: k(0) * 255, g: k(1) * 255, b: k(2) * 255, a: alpha };
  }
}

/** The one-key object of an externally tagged enum value: `{"Solid": ...}` gives `['Solid', ...]`. */
const variant = (v: unknown): [string, unknown] => {
  if (typeof v === 'string') return [v, null];
  const o = rec(v);
  const k = Object.keys(o)[0];
  return k ? [k, o[k]] : ['', null];
};

// ---------------------------------------------------------------- the importer

export interface PhotoCraftImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  fonts: FontRef[];
  warnings: string[];
}

interface Common {
  visible: boolean;
  opacity: number;
  blendMode?: BlendMode;
  shadow?: Shadow;
}

interface Unit {
  node: SceneNode;
  c: Common;
  name: string;
  /** A copy to use as the clipping mask for layers clipped to this one, or null when it has no shape. */
  mask: () => SceneNode | null;
}

class Importer {
  readonly assets: ImportedAsset[] = [];
  readonly fonts = new FontBook();
  readonly decoder: Decoder;
  readonly doc: Rec;
  readonly canvas: Box;
  readonly dpi: number;
  private readonly notes = new Map<string, number>();
  private layers = 0;
  private offset: { x: number; y: number } = { x: 0, y: 0 };

  constructor(readonly bundle: PcraftBundle) {
    this.decoder = new Decoder(bundle);
    this.doc = rec(bundle.manifest.document);
    const size = rec(this.doc.size);
    this.canvas = { x: 0, y: 0, width: Math.max(1, num(size.width, 1)), height: Math.max(1, num(size.height, 1)) };
    const dpi = num(this.doc.resolution_dpi, 72);
    this.dpi = dpi > 0 ? dpi : 72;
  }

  note(s: string): void {
    this.notes.set(s, (this.notes.get(s) ?? 0) + 1);
  }

  report(): string[] {
    const out = [...this.decoder.warnings];
    for (const [what, n] of this.notes) out.push(n > 1 ? `${what} (${n} times)` : what);
    return out;
  }

  /** Where artboard (0, 0) sits in the document, while converting an artboard's layers. */
  withOffset<T>(x: number, y: number, fn: () => T): T {
    const prev = this.offset;
    this.offset = { x, y };
    try {
      return fn();
    } finally {
      this.offset = prev;
    }
  }
  private ox = () => this.offset.x;
  private oy = () => this.offset.y;

  // ---- pictures

  addPng(name: string, w: number, h: number, rgba: Uint8Array): string {
    const id = assetId();
    this.assets.push({ id, name: `${name.replace(/[\\/:*?"<>|]+/g, '_') || 'Layer'}.png`, mime: 'image/png', bytes: encodePng(w, h, rgba) });
    return id;
  }

  /** The pixels of a raster surface (layer mask baked in when given), cropped to what shows. */
  private picture(sm: Rec, mask: Rec | null): Picture | null {
    const tr = tileRect(sm);
    const d = this.decoder.defaultRgba(sm);
    let rect: Rect | null = tr;
    if (d[3] > 0) {
      const c = { x0: 0, y0: 0, x1: Math.ceil(this.canvas.width), y1: Math.ceil(this.canvas.height) };
      rect = tr ? { x0: Math.min(tr.x0, c.x0), y0: Math.min(tr.y0, c.y0), x1: Math.max(tr.x1, c.x1), y1: Math.max(tr.y1, c.y1) } : c;
    }
    if (!rect) return null;
    if ((rect.x1 - rect.x0) * (rect.y1 - rect.y0) > MAX_PIXELS) {
      this.note('A layer too large to import was left out');
      return null;
    }
    const w = rect.x1 - rect.x0;
    const h = rect.y1 - rect.y0;
    const rgba = this.decoder.read(sm, rect, false);
    if (mask) this.bakeMask(rgba, rect, mask);
    return cropVisible(rect.x0, rect.y0, w, h, rgba);
  }

  /** Multiply the alpha of `rgba` (covering `rect`) by the layer mask. */
  private bakeMask(rgba: Uint8Array, rect: Rect, mask: Rec): void {
    const m = this.decoder.read(rec(mask.surface), rect, true);
    const density = Math.max(0, Math.min(1, num(mask.density, 1)));
    for (let i = 0; i < m.length; i++) {
      const v = density < 1 ? 1 - density * (1 - m[i] / 255) : m[i] / 255;
      const a = rgba[i * 4 + 3];
      if (a) rgba[i * 4 + 3] = Math.round(a * v);
    }
  }

  /** An image mask over `box` (document pixels), from a layer or group mask. */
  private maskNode(mask: Rec, box: Rect, name: string): SceneNode | null {
    const w = box.x1 - box.x0;
    const h = box.y1 - box.y0;
    if (w < 1 || h < 1 || w * h > MAX_PIXELS) return null;
    const m = this.decoder.read(rec(mask.surface), box, true);
    const density = Math.max(0, Math.min(1, num(mask.density, 1)));
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < m.length; i++) rgba[i * 4 + 3] = Math.round(255 * (density < 1 ? 1 - density * (1 - m[i] / 255) : m[i] / 255));
    const id = this.addPng(`${name} layer mask`, w, h, rgba);
    return createNode('image', { name: `${name} (layer mask)`, assetId: id, x: box.x0 - this.ox(), y: box.y0 - this.oy(), width: w, height: h, fit: 'fill', mask: true });
  }

  private maskOf(l: Rec): Rec | null {
    const m = rec(l.mask);
    if (!l.mask || m.enabled === false || !m.surface) return null;
    if (num(m.feather) > 0.01) this.note('Mask feather was not applied');
    return m;
  }

  // ---- shapes

  private subsOf(path: Rec): AbsSub[] {
    const subs: AbsSub[] = [];
    for (const sp of arr(path.subpaths).map(rec)) {
      const pts = [];
      for (const kn of arr(sp.knots).map(rec)) {
        const a = rec(kn.anchor);
        const x = num(a.x) - this.ox();
        const y = num(a.y) - this.oy();
        const pt: AbsSub['pts'][number] = { x, y };
        const i = rec(kn.in_ctrl);
        const o = rec(kn.out_ctrl);
        if (typeof i.x === 'number' && (i.x !== a.x || i.y !== a.y)) {
          pt.inX = num(i.x) - this.ox();
          pt.inY = num(i.y) - this.oy();
        }
        if (typeof o.x === 'number' && (o.x !== a.x || o.y !== a.y)) {
          pt.outX = num(o.x) - this.ox();
          pt.outY = num(o.y) - this.oy();
        }
        pts.push(pt);
      }
      if (pts.length) subs.push({ closed: sp.closed === true, pts });
    }
    return subs;
  }

  /** A paint from a fill value (`Solid`, `Gradient`, `Pattern`), laid out in `frame` (document pixels, offset applied). */
  private fillPaint(fill: unknown, frame: Box, alphaMul = 1): Paint | null {
    const [kind, v] = variant(fill);
    if (kind === 'Solid') return { type: 'solid', color: cssColor(pcColor(v), alphaMul) };
    if (kind === 'Gradient') return this.gradient(rec(v), frame, alphaMul);
    if (kind === 'Pattern') this.note('Pattern fills were not carried over');
    return null;
  }

  private gradient(g: Rec, frame: Box, alphaMul: number): Paint | null {
    const colors = arr(g.stops).map((s) => ({ t: num(arr(s)[0]), c: pcColor(arr(s)[1]) })).sort((a, b) => a.t - b.t);
    if (!colors.length) return null;
    const mids = arr(g.midpoints).map((m) => num(m, 0.5));
    const ramp = withMidpoints(colors.map((s) => ({ t: s.t, c: s.c })), mids);
    const opac = arr(g.opacity_stops).map((s) => ({ t: num(arr(s)[0]), o: num(arr(s)[1], 1) })).sort((a, b) => a.t - b.t);
    const opacityAt = (t: number): number => {
      if (!opac.length) return 1;
      if (t <= opac[0].t) return opac[0].o;
      for (let i = 1; i < opac.length; i++) if (t <= opac[i].t) return opac[i].o + ((opac[i - 1].o - opac[i].o) * (opac[i].t - t)) / Math.max(1e-9, opac[i].t - opac[i - 1].t);
      return opac[opac.length - 1].o;
    };
    // breakpoints: every colour and opacity position (and the midpoint stops)
    const ts = [...new Set([...ramp.map((s) => s.t), ...opac.map((s) => s.t)])].sort((a, b) => a - b);
    let stops: GStop[] = ts.map((t) => {
      const c = colorAt(ramp, t);
      return { t, c: { ...c, a: c.a * opacityAt(t) } };
    });
    if (g.reverse === true) stops = stops.map((s) => ({ t: 1 - s.t, c: s.c })).reverse();
    const style = str(g.style, 'Linear');
    const angle = (num(g.angle) * Math.PI) / 180;
    const scale = Math.max(1e-3, num(g.scale, 1));
    const off = arr(g.offset);
    const f = g.align === false ? { x: -this.ox(), y: -this.oy(), width: this.canvas.width, height: this.canvas.height } : frame;
    const w = Math.max(1, f.width);
    const h = Math.max(1, f.height);
    const c = { x: f.x + w / 2 + num(off[0]) * w, y: f.y + h / 2 + num(off[1]) * h };
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const dir = { x: cos, y: -sin };
    if (style === 'Radial') {
      const len = Math.max(1, Math.hypot(cos * w, sin * h));
      return radialGradient(stops, c, (len / 2) * scale, f, alphaMul).paint;
    }
    const chord = Math.max(1, Math.min(w / Math.max(Math.abs(cos), 1e-6), h / Math.max(Math.abs(sin), 1e-6))) * scale;
    if (style === 'Angle' || style === 'Diamond') this.note('Angle and diamond gradients were imported as linear gradients');
    if (style === 'Reflected') {
      // mirrored about the centre: t' = |2u - 1|
      const mirrored: GStop[] = [];
      for (const s of stops) mirrored.push({ t: 0.5 - s.t / 2, c: s.c }, { t: 0.5 + s.t / 2, c: s.c });
      stops = mirrored.sort((a, b) => a.t - b.t);
    }
    return linearGradient(stops, { x: c.x - (dir.x * chord) / 2, y: c.y - (dir.y * chord) / 2 }, { x: c.x + (dir.x * chord) / 2, y: c.y + (dir.y * chord) / 2 }, f, alphaMul);
  }

  /** A vector path as a path node, or null when it has no outline. */
  private pathNode(name: string, path: Rec, fill: unknown, stroke: Rec | null, extra: Record<string, unknown> = {}): SceneNode | null {
    const subs = this.subsOf(path);
    if (!subs.length) return null;
    const ops = arr(path.subpaths).map((s) => str(rec(s).op, 'Combine'));
    if (ops.some((o) => o === 'Intersect' || o === 'Exclude')) this.note('Intersect and exclude path operations were drawn as a combined outline');
    const hole = ops.some((o) => o === 'Subtract' || o === 'Exclude');
    if (path.inverted === true) this.note('Inverted paths were drawn uninverted');
    const b = absBounds(subs);
    const fp = fill ? this.fillPaint(fill, b) : null;
    let st: Rec | null = stroke;
    let strokeOut: { paint: Paint; width: number; dash?: number[]; dashOffset?: number } | null = null;
    let lineCap: 'butt' | 'round' | 'square' = 'butt';
    let lineJoin: 'miter' | 'round' | 'bevel' = 'miter';
    if (st) {
      const width = num(st.width);
      const sp = this.fillPaint(st.paint, b, Math.max(0, Math.min(1, num(st.opacity, 1))));
      if (sp && width > 0) {
        const dashes = arr(st.dashes).map((d) => num(d)).filter((d) => d >= 0);
        strokeOut = { paint: sp, width: round(width, 100), ...(dashes.length && dashes.some((d) => d > 0) ? { dash: dashes.map((d) => round(d * width, 100)), ...(num(st.dash_offset) ? { dashOffset: round(num(st.dash_offset) * width, 100) } : {}) } : {}) };
        const cap = str(st.cap, 'Butt');
        lineCap = cap === 'Round' ? 'round' : cap === 'Square' ? 'square' : 'butt';
        const join = str(st.join, 'Miter');
        lineJoin = join === 'Round' ? 'round' : join === 'Bevel' ? 'bevel' : 'miter';
        if (str(st.align, 'Center') !== 'Center') this.note('Inside and outside stroke alignment was imported as centred');
      } else st = null;
    }
    if (!fp && !strokeOut) return null;
    return pathNodeOf(name, subs, { fill: fp, stroke: strokeOut, fillRule: hole || str(path.fill_rule) === 'EvenOdd' ? 'evenodd' : 'nonzero', lineCap, lineJoin, ...extra });
  }

  // ---- text

  private textNode(c: Rec, name: string): SceneNode | null {
    const k = this.dpi / 72;
    const A = mulM(translateM(-this.ox(), -this.oy()), parseM(c.transform));
    const sx = Math.hypot(A[0], A[1]) || 1;
    const sy = Math.hypot(A[2], A[3]) || 1;
    const rot = (Math.atan2(A[1], A[0]) * 180) / Math.PI;
    const text = str(c.text).replace(/\r\n?/g, '\n');
    const bytes = new TextEncoder().encode(text);
    const runs = arr(c.runs).map(rec);
    const pieces: TextPiece[] = [];
    let first: Rec | null = null;
    let pos = 0;
    const dec = new TextDecoder();
    const spans = runs.length ? runs.map((r) => ({ len: num(r.len), style: rec(r.style) })) : [{ len: bytes.length, style: { font_family: c.font_family, size_pt: c.size_pt, color: c.color } as Rec }];
    spans.forEach((r, i) => {
      const end = i === spans.length - 1 ? bytes.length : Math.min(bytes.length, pos + r.len);
      const piece = dec.decode(bytes.subarray(pos, end));
      pos = end;
      if (!piece) return;
      const st = r.style;
      first ??= st;
      const size = Math.max(1, round(num(st.size_pt, 12) * k * sy, 100));
      const face = this.fonts.face(str(st.font_family) || str(c.font_family) || 'sans-serif', '', Math.max(100, Math.min(900, num(st.weight, 400))) + (st.faux_bold === true && num(st.weight, 400) < 600 ? 300 : 0), st.italic === true || st.faux_italic === true);
      if (num(st.baseline_shift_pt) || (str(st.baseline, 'Normal') !== 'Normal')) this.note('Baseline shift, superscript and subscript were not applied');
      pieces.push({ text: piece, family: face.family, weight: Math.min(900, face.weight), italic: face.italic, size, color: cssColor(pcColor(st.color)), spacing: round((num(st.tracking) / 1000) * size, 100), underline: st.underline === true, strike: st.strikethrough === true });
    });
    if (!pieces.length || !first) return null;
    const para = rec(rec(arr(c.paragraphs)[0]).style);
    const al = str(para.align, 'Left');
    const align: TextNode['align'] = al === 'Center' || al === 'JustifyCenter' ? 'center' : al === 'Right' || al === 'JustifyRight' ? 'right' : al === 'JustifyAll' ? 'justify' : 'left';
    const f = first as Rec;
    const leading = f.leading_pt;
    const lineHeight = typeof leading === 'number' && leading > 0 ? Math.max(0.5, leading / Math.max(1, num(f.size_pt, 12))) : num(para.auto_leading, 1.2);
    const [shape, sv] = variant(c.shape);
    let box: { l: number; t: number; w: number; h: number } | undefined;
    if (shape === 'Box') {
      const b = rec(sv);
      box = { l: num(b.x) * sx, t: num(b.y) * sy, w: num(b.width) * sx, h: num(b.height) * sy };
    } else if (shape === 'Area') {
      const bb = absBounds(arr(rec(rec(sv).path).subpaths).map((s) => ({ closed: true, pts: arr(rec(s).knots).map((kn) => ({ x: num(rec(rec(kn).anchor).x), y: num(rec(rec(kn).anchor).y) })) })));
      if (bb.width > 0 && bb.height > 0) box = { l: bb.x * sx, t: bb.y * sy, w: bb.width * sx, h: bb.height * sy };
    }
    const o = { x: A[4], y: A[5] };
    return buildTextNode({ name: name || pieces.map((p) => p.text).join('').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Text', pieces, align, lineHeight, upper: str(f.caps) === 'AllCaps', origin: o, rotation: rot, box });
  }

  // ---- layers

  private effectsShadow(l: Rec): Shadow | undefined {
    const fx = rec(l.effects);
    if (fx.enabled === false) return undefined;
    let shadow: Shadow | undefined;
    const gl = rec(rec(this.doc.global_light));
    for (const e of arr(fx.items)) {
      const [kind, v] = variant(e);
      const o = rec(v);
      if (rec(o.common).enabled === false) continue;
      if (kind === 'DropShadow' && !shadow) {
        const angle = ((o.use_global_light === true ? num(gl.angle, 120) : num(o.angle, 120)) * Math.PI) / 180;
        const dist = num(o.distance);
        const c = pcColor(o.color);
        shadow = { x: round(-Math.cos(angle) * dist) + 0, y: round(Math.sin(angle) * dist) + 0, blur: round(num(o.size)), spread: round(num(o.spread) * num(o.size)), color: cssColor(c, Math.max(0, Math.min(1, num(rec(o.common).opacity, 0.75)))) };
      } else this.note(`Layer styles other than drop shadow were left out (${kind})`);
    }
    return shadow;
  }

  private common(l: Rec): Common {
    const blend = str(l.blend, 'Normal');
    let blendMode: BlendMode | undefined;
    if (blend !== 'Normal' && blend !== 'PassThrough') {
      blendMode = BLENDS[blend];
      if (!blendMode) this.note(`Blend modes with no equivalent were imported as normal (${blend})`);
    }
    const shadow = this.effectsShadow(l);
    return {
      visible: l.visible !== false,
      opacity: round(Math.max(0, Math.min(1, num(l.opacity, 1))) * Math.max(0, Math.min(1, num(l.fill_opacity, 1)))),
      ...(blendMode ? { blendMode } : {}),
      ...(shadow ? { shadow } : {}),
    };
  }

  private imageNode(name: string, p: Picture, id: string, extra: Record<string, unknown> = {}): SceneNode {
    return createNode('image', { name, assetId: id, x: p.x - this.ox(), y: p.y - this.oy(), width: p.width, height: p.height, fit: 'fill', ...extra });
  }

  /** The layer's pixels from a cache surface (text, shapes and smart objects keep their rendered pixels there). */
  private cached(sm: unknown, name: string, mask: Rec | null): { node: SceneNode; unit: () => SceneNode } | null {
    if (!sm) return null;
    const p = this.picture(rec(sm), mask);
    if (!p) return null;
    const id = this.addPng(name, p.width, p.height, p.rgba);
    return { node: this.imageNode(name, p, id), unit: () => this.imageNode(`${name} (mask)`, p, id, { mask: true }) };
  }

  private convertOne(l: Rec): Unit | null {
    if (++this.layers > MAX_LAYERS) return null;
    const name = str(l.name) || 'Layer';
    const c = rec(l.content);
    const kind = str(c.kind);
    const mask = this.maskOf(l);
    let core: SceneNode | null = null;
    let maskCopy: () => SceneNode | null = () => null;
    let baked = false;
    switch (kind) {
      case 'raster': {
        const p = this.picture(rec(c.surface), mask);
        if (!p) return null;
        const id = this.addPng(name, p.width, p.height, p.rgba);
        core = this.imageNode(name, p, id);
        maskCopy = () => this.imageNode(`${name} (mask)`, p, id, { mask: true });
        baked = true;
        break;
      }
      case 'group': {
        const kids = this.convertList(arr(c.children).map(rec));
        if (!kids.length) return null;
        core = makeGroup(name, kids);
        const snap = cloneWithNewIds(core);
        maskCopy = () => Object.assign(cloneWithNewIds(snap), { mask: true, name: `${name} (mask)`, visible: true, opacity: 1 });
        break;
      }
      case 'adjustment':
        this.note('Adjustment layers were not carried over (they change how the layers below look, which can’t be reproduced)');
        return null;
      case 'fill': {
        const fill = c.fill;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const paint = this.fillPaint(fill, { x: -this.ox(), y: -this.oy(), width: w, height: h });
        if (paint) {
          core = createNode('rect', { name, x: -this.ox(), y: -this.oy(), width: w, height: h, fill: paint, stroke: null });
          maskCopy = () => createNode('rect', { name: `${name} (mask)`, x: -this.ox(), y: -this.oy(), width: w, height: h, mask: true, fill: { type: 'solid', color: '#000000' }, stroke: null });
        } else {
          const cache = this.cached(rec(l.fill_cache).surface, name, mask);
          if (!cache) return null;
          core = cache.node;
          maskCopy = cache.unit;
          baked = true;
        }
        break;
      }
      case 'text': {
        const [shape] = variant(c.shape);
        const needsPicture = str(c.orientation) === 'Vertical' || !!c.warp || shape === 'Path';
        const cache = needsPicture ? this.cached(c.cache, name, mask) : null;
        if (cache) {
          this.note('Warped, vertical and on-a-path text layers were kept as pictures');
          core = cache.node;
          maskCopy = cache.unit;
          baked = true;
        } else {
          if (needsPicture) this.note('Warped, vertical and on-a-path text was imported as plain horizontal text');
          core = this.textNode(c, str(l.name));
          if (!core) return null;
        }
        break;
      }
      case 'shape': {
        const path = rec(c.path);
        const node = arr(path.subpaths).length ? this.pathNode(name, path, c.fill, c.stroke ? rec(c.stroke) : null) : null;
        if (node) {
          core = node;
          const copy = this.pathNode(`${name} (mask)`, path, { Solid: { mode: 'Rgb', c: [0, 0, 0, 0], alpha: 1 } }, null, { mask: true });
          maskCopy = () => copy;
        } else {
          const cache = this.cached(c.cache, name, mask);
          if (!cache) return null;
          core = cache.node;
          maskCopy = cache.unit;
          baked = true;
        }
        break;
      }
      case 'smart': {
        const cache = this.cached(c.cache, name, mask);
        if (!cache) {
          this.note('Smart objects without rendered pixels were left out');
          return null;
        }
        core = cache.node;
        maskCopy = cache.unit;
        baked = true;
        break;
      }
      default:
        if (kind) this.note(`Layers of an unknown kind were left out (${kind})`);
        return null;
    }
    // masks that were not baked into pixels become an image mask in front of the layer, in a group of their own
    if (mask && !baked) {
      const b: Rect = { x0: Math.floor(core.x + this.ox()), y0: Math.floor(core.y + this.oy()), x1: Math.ceil(core.x + core.width + this.ox()), y1: Math.ceil(core.y + core.height + this.oy()) };
      const mn = this.maskNode(mask, b, name);
      if (mn) core = makeGroup(name, [mn, core]);
    }
    const vm = rec(l.vector_mask);
    if (l.vector_mask && vm.enabled !== false && arr(rec(vm.path).subpaths).length) {
      const mn = this.pathNode(`${name} (vector mask)`, rec(vm.path), { Solid: { mode: 'Rgb', c: [0, 0, 0, 0], alpha: 1 } }, null, { mask: true });
      if (mn) {
        core = makeGroup(name, [mn, core]);
        const copy = this.pathNode(`${name} (mask)`, rec(vm.path), { Solid: { mode: 'Rgb', c: [0, 0, 0, 0], alpha: 1 } }, null, { mask: true });
        maskCopy = () => copy;
      }
    }
    return { node: core, c: this.common(l), name, mask: maskCopy };
  }

  /** Layers (bottom first) as nodes: a clipped layer is drawn only inside the unclipped layer below it. */
  convertList(list: Rec[]): SceneNode[] {
    const out: SceneNode[] = [];
    let i = 0;
    while (i < list.length) {
      const n = list[i];
      let j = i + 1;
      if (n.clipped !== true) while (j < list.length && list[j].clipped === true) j++;
      const base = this.convertOne(n);
      const rest = list.slice(i + 1, j).map((x) => this.convertOne(x)).filter((u): u is Unit => !!u);
      i = j;
      if (!base) {
        for (const u of rest) out.push(Object.assign(u.node, u.c));
        continue;
      }
      const maskNode = rest.length ? base.mask() : null;
      if (!rest.length || !maskNode) {
        if (rest.length) this.note('Layers clipped to a layer without a shape were imported unclipped');
        out.push(Object.assign(base.node, base.c));
        for (const u of rest) out.push(Object.assign(u.node, u.c));
        continue;
      }
      const clipped = rest.map((u) => Object.assign(u.node, u.c));
      out.push(makeGroup(`${base.name} (clipped)`, [base.node, maskNode, ...clipped], { ...base.c }));
    }
    return out;
  }
}

// ---------------------------------------------------------------- entry point

const pngSize = (b: Uint8Array): { w: number; h: number } | null => (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 ? { w: ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0, h: ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0 } : null);

function backgroundOf(bg: unknown): string | null {
  const [kind, v] = variant(bg);
  if (kind === 'white') return '#ffffff';
  if (kind === 'black') return '#000000';
  if (kind === 'custom') {
    const c = pcColor(v);
    return c.a > 0 ? cssColor(c) : null;
  }
  return null;
}

/** Turn a `.pcraft` file into artboards of layers. */
export function importPhotoCraft(bytes: Uint8Array, baseName: string): PhotoCraftImport {
  const bundle = readPhotoCraft(bytes);
  const imp = new Importer(bundle);
  const doc = imp.doc;
  const mode = str(doc.mode, 'Rgb');
  if (mode === 'Multichannel') imp.note('Multichannel documents were read as RGB');
  const top = arr(doc.layers).map(rec);
  if (!top.length) throw new Error('This PhotoCraft file has no layers to import');
  const isBoard = (l: Rec): boolean => rec(l.content).kind === 'group' && !!rec(l.content).artboard;
  const boards = top.filter(isBoard);
  const others = top.filter((l) => !isBoard(l));
  const artboards: Artboard[] = [];
  if (others.length || !boards.length) {
    const children = imp.convertList(others);
    if (children.length) artboards.push(createArtboard({ name: baseName || 'PhotoCraft import', width: imp.canvas.width, height: imp.canvas.height, background: null, children }));
  }
  for (const b of boards) {
    const c = rec(b.content);
    const ab = rec(c.artboard);
    const r = rec(ab.rect);
    const x0 = num(r.x0);
    const y0 = num(r.y0);
    const width = Math.max(1, num(r.x1) - x0);
    const height = Math.max(1, num(r.y1) - y0);
    const children = imp.withOffset(x0, y0, () => imp.convertList(arr(c.children).map(rec)));
    artboards.push(createArtboard({ name: boards.length + others.length > 1 || str(b.name) ? `${baseName} - ${str(b.name, 'Artboard')}` : baseName, width, height, background: ((bg) => (bg ? ({ type: 'solid', color: bg } as Paint) : null))(backgroundOf(ab.background)), children }));
  }
  const kept = artboards.filter((a) => a.children.length);
  if (!kept.length) {
    // nothing could be rebuilt: fall back to the flattened picture the file carries
    const m = bundle.manifest;
    const path = str(m.full_composite) || 'composite/full.png';
    const png = bundle.entry(path) ?? bundle.entry('composite/preview.png');
    const size = png ? pngSize(png) : null;
    if (!png || !size) throw new Error('This PhotoCraft file has no layers that can be imported');
    const id = assetId();
    imp.assets.push({ id, name: `${baseName || 'Composite'}.png`, mime: 'image/png', bytes: png });
    const art = createArtboard({ name: baseName || 'PhotoCraft import', width: imp.canvas.width, height: imp.canvas.height, background: null, children: [createNode('image', { name: 'Flattened image', assetId: id, x: 0, y: 0, width: imp.canvas.width, height: imp.canvas.height, fit: 'fill' })] });
    return { artboard: art, artboards: [art], assets: imp.assets, fonts: [], warnings: [...imp.report(), 'No layers could be imported, so the flattened picture saved in the file was used'] };
  }
  return { artboard: kept[0], artboards: kept, assets: imp.assets, fonts: imp.fonts.refs(), warnings: imp.report() };
}

