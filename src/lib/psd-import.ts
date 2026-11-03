/**
 * Photoshop (.psd) import: a pure TypeScript reader plus a converter to layers.
 *
 * `parsePsd` reads the header, the layer records (bounds, name, opacity, visibility, blend mode, clipping, section
 * dividers, text) and decodes channel data (raw, RLE/PackBits and ZIP) lazily, so a big document doesn't hold every
 * layer's pixels at once. `importPsd` turns that into an artboard where every pixel layer is an image layer
 * (a PNG stored as a project asset) and folders become groups.
 *
 * Supported: 8 and 16 bit RGB and grayscale layers. Other modes and depths use the flattened picture saved in the file.
 * Clipping groups (a layer and the layers clipped to it) become a group with a copy of the base used as a mask,
 * vector masks become a path mask, and layer masks are baked into the layer's pixels (group masks become an image mask).
 * Type layers become real text layers (`psd-type.ts` reads the styles), unless they are warped, vertical or masked, which
 * keep their pixels.
 * Not carried over: layer styles and effects, smart-object contents (their raster is used), adjustment layers,
 * and blend modes we don't have.
 */
import { unzlibSync, zlibSync } from 'fflate';
import { cloneWithNewIds, createArtboard, createNode, runsPatch, uid, type Artboard, type BlendMode, type FontRef, type PathNode, type SceneNode, type SubPath, type TextNode, type TextRun } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import { GOOGLE_FONT_FAMILIES } from './google-fonts';
import { parseTypeBlock, parseVectorMask, type PsdType, type PsdVectorMask } from './psd-type';

// ---------------------------------------------------------------- types

export interface PsdLayer {
  kind: 'layer';
  name: string;
  visible: boolean;
  /** 0 to 1 (layer opacity times fill opacity). */
  opacity: number;
  /** The four character blend mode key, e.g. `norm`, `mul `. */
  blendKey: string;
  blendMode: BlendMode;
  /** The blend key had no equivalent here, so it imports as normal. */
  blendUnsupported: boolean;
  /** Clipped to the layer below it in Photoshop (not reproduced). */
  clipped: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
  /** The text of a type layer. */
  text?: string;
  /** The type layer's styles and placement, when the file's type data could be read. */
  type?: PsdType;
  /** The layer's vector mask (a path in document pixels), when it has one that isn't just the shape of a shape layer. */
  vectorMask?: PsdVectorMask;
  /** An enabled pixel mask is already multiplied into the pixels. */
  hasPixelMask?: boolean;
  /** A layer with no pixels that changes what is below it (levels, curves, ...). */
  adjustment: boolean;
  /** Decode the pixels as RGBA, `width * height * 4` bytes. Empty when the layer has no pixels. */
  getPixels(): Uint8Array;
}

export interface PsdGroup {
  kind: 'group';
  name: string;
  visible: boolean;
  opacity: number;
  blendKey: string;
  blendMode: BlendMode;
  blendUnsupported: boolean;
  clipped: boolean;
  /** Folder was open in the layers panel. */
  open: boolean;
  vectorMask?: PsdVectorMask;
  /** The folder's pixel mask: `getAlpha` gives `width * height` samples; outside the box the mask is `defaultColor`. */
  pixelMask?: { left: number; top: number; width: number; height: number; defaultColor: number; getAlpha(): Uint8Array };
  /** Painting order: first is the bottom. */
  children: PsdNode[];
}

export type PsdNode = PsdLayer | PsdGroup;

export interface PsdDocument {
  width: number;
  height: number;
  depth: number;
  /** Colour mode number from the file (3 is RGB, 1 is grayscale, 4 is CMYK ...). */
  mode: number;
  /** Top level nodes, first is the bottom of the stack. */
  nodes: PsdNode[];
  /** The flattened picture in the file, as RGBA, when there are no usable layers (otherwise null). */
  composite: Uint8Array | null;
  warnings: string[];
}

// ---------------------------------------------------------------- byte reader

class Reader {
  readonly view: DataView;
  pos = 0;
  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number): void {
    if (n < 0 || this.pos + n > this.bytes.length) throw new Error('This PSD file is damaged or cut short');
  }
  u8(): number {
    this.need(1);
    return this.bytes[this.pos++];
  }
  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  /** 8 byte length (PSB). Sizes past 2^53 can't happen in a file we can hold in memory. */
  u64(): number {
    const hi = this.u32();
    const lo = this.u32();
    return hi * 4294967296 + lo;
  }
  len(psb: boolean): number {
    return psb ? this.u64() : this.u32();
  }
  ascii(n: number): string {
    this.need(n);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += n;
    return s;
  }
  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }
  slice(n: number): Uint8Array {
    this.need(n);
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
}

// ---------------------------------------------------------------- blend modes

const BLEND_KEYS: Record<string, BlendMode> = {
  'norm': 'normal',
  'pass': 'normal',
  'mul ': 'multiply',
  'scrn': 'screen',
  'over': 'overlay',
  'dark': 'darken',
  'lite': 'lighten',
  'div ': 'color-dodge',
  'idiv': 'color-burn',
  'diff': 'difference',
  'smud': 'exclusion',
  'diss': 'dissolve',
  'sLit': 'soft-light',
  'hLit': 'hard-light',
  'lddg': 'plus-lighter',
  'hue ': 'hue',
  'sat ': 'saturation',
  'colr': 'color',
  'lum ': 'luminosity',
};

/** Modes the browser can't draw, brought in as the nearest one it can (and listed in the import report). */
const BLEND_APPROX: Record<string, BlendMode> = {
  'lbrn': 'multiply',
  'dkCl': 'darken',
  'lgCl': 'lighten',
  'vLit': 'hard-light',
  'lLit': 'hard-light',
  'pLit': 'hard-light',
  'hMix': 'hard-light',
  'fdiv': 'color-dodge',
};

const BLEND_NAMES: Record<string, string> = {
  diss: 'dissolve',
  lbrn: 'linear burn',
  lddg: 'linear dodge',
  dkCl: 'darker color',
  lgCl: 'lighter color',
  sLit: 'soft light',
  hLit: 'hard light',
  vLit: 'vivid light',
  lLit: 'linear light',
  pLit: 'pin light',
  hMix: 'hard mix',
  fsub: 'subtract',
  fdiv: 'divide',
  'hue ': 'hue',
  'sat ': 'saturation',
  'colr': 'color',
  'lum ': 'luminosity',
};

export function psdBlendMode(key: string): { mode: BlendMode; supported: boolean; approx?: boolean } {
  const mode = BLEND_KEYS[key];
  if (mode) return { mode, supported: true };
  const near = BLEND_APPROX[key];
  return near ? { mode: near, supported: true, approx: true } : { mode: 'normal', supported: false };
}

const ADJUSTMENT_KEYS = new Set(['brit', 'levl', 'curv', 'expA', 'vibA', 'hue2', 'hue ', 'blnc', 'blwh', 'phfl', 'mixr', 'clrL', 'nvrt', 'post', 'thrs', 'selc', 'grdm', 'CgEd']);

// ---------------------------------------------------------------- channel decoding

/** PackBits. Reads `h` rows of `rowBytes` from `data` after the table of row byte counts. */
function decodeRle(data: Uint8Array, rowBytes: number, h: number, psb: boolean): Uint8Array {
  const out = new Uint8Array(rowBytes * h);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const step = psb ? 4 : 2;
  let src = h * step;
  if (src > data.length) throw new Error('This PSD file is damaged or cut short');
  for (let y = 0; y < h; y++) {
    const count = psb ? view.getUint32(y * 4) : view.getUint16(y * 2);
    const end = Math.min(src + count, data.length);
    let dst = y * rowBytes;
    const rowEnd = dst + rowBytes;
    while (src < end && dst < rowEnd) {
      const n = (data[src++] << 24) >> 24;
      if (n >= 0) {
        const c = Math.min(n + 1, end - src, rowEnd - dst);
        out.set(data.subarray(src, src + c), dst);
        src += n + 1;
        dst += c;
      } else if (n !== -128) {
        const c = Math.min(1 - n, rowEnd - dst);
        out.fill(data[src++], dst, dst + c);
        dst += c;
      }
    }
    src = end;
  }
  return out;
}

/** Undo the per-row delta coding of ZIP with prediction. */
function undoPrediction(raw: Uint8Array, w: number, h: number, depth: number): void {
  if (depth === 8) {
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) raw[y * w + x] = (raw[y * w + x] + raw[y * w + x - 1]) & 255;
  } else if (depth === 16) {
    const rb = w * 2;
    for (let y = 0; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const i = y * rb + x * 2;
        const v = ((raw[i] << 8) | raw[i + 1]) + ((raw[i - 2] << 8) | raw[i - 1]);
        raw[i] = (v >> 8) & 255;
        raw[i + 1] = v & 255;
      }
    }
  }
}

/** One channel (without its compression header) as 8 bit samples, `w * h` long. */
function decodeChannel(data: Uint8Array, compression: number, w: number, h: number, depth: number, psb: boolean): Uint8Array {
  const bps = depth / 8;
  const rowBytes = w * bps;
  let raw: Uint8Array;
  if (compression === 0) {
    raw = new Uint8Array(rowBytes * h);
    raw.set(data.subarray(0, Math.min(data.length, raw.length)));
  } else if (compression === 1) {
    raw = decodeRle(data, rowBytes, h, psb);
  } else if (compression === 2 || compression === 3) {
    const inflated = unzlibSync(data);
    raw = new Uint8Array(rowBytes * h);
    raw.set(inflated.subarray(0, Math.min(inflated.length, raw.length)));
    if (compression === 3) undoPrediction(raw, w, h, depth);
  } else {
    throw new Error(`Unknown PSD compression ${compression}`);
  }
  if (bps === 1) return raw;
  // 16 bit: keep the high byte of each sample
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = raw[i * 2];
  return out;
}

// ---------------------------------------------------------------- layer records

interface ChannelInfo {
  id: number;
  offset: number;
  length: number;
}

interface MaskInfo {
  top: number;
  left: number;
  bottom: number;
  right: number;
  defaultColor: number;
  disabled: boolean;
}

interface RawLayer {
  top: number;
  left: number;
  bottom: number;
  right: number;
  channels: ChannelInfo[];
  blendKey: string;
  opacity: number;
  fill: number;
  clipped: boolean;
  visible: boolean;
  name: string;
  /** lsct type: 0 other, 1 open folder, 2 closed folder, 3 bounding divider. */
  section: number;
  text?: string;
  typeData?: Uint8Array;
  adjustment: boolean;
  mask: MaskInfo | null;
  vectorMask: boolean;
  vectorData?: Uint8Array;
  /** A fill layer or shape layer: its `vmsk` is the layer's own outline, not a mask over something. */
  fillLayer: boolean;
}

function decodeUtf16(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
  return s;
}

/** Find the `Txt ` (TEXT) value in a type layer's descriptor without parsing the whole descriptor. */
function findText(data: Uint8Array): string | undefined {
  for (let i = 0; i + 16 <= data.length; i++) {
    if (data[i] === 0x54 && data[i + 1] === 0x78 && data[i + 2] === 0x74 && data[i + 3] === 0x20 && data[i + 4] === 0x54 && data[i + 5] === 0x45 && data[i + 6] === 0x58 && data[i + 7] === 0x54) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const n = view.getUint32(i + 8);
      if (n > 100000 || i + 12 + n * 2 > data.length) continue;
      return decodeUtf16(data.subarray(i + 12, i + 12 + n * 2)).replace(/\u0000+$/, '');
    }
  }
  return undefined;
}

const LONG_LENGTH_KEYS = new Set(['LMsk', 'Lr16', 'Lr32', 'Layr', 'Mt16', 'Mt32', 'Mtrn', 'Alph', 'FMsk', 'lnk2', 'FEid', 'FXid', 'PxSD']);

function isSig(s: string): boolean {
  return s === '8BIM' || s === '8B64';
}

/** Where the next tagged block starts. Writers disagree on whether lengths are padded to 2 or 4, so check. */
function nextBlock(r: Reader, start: number, len: number, end: number): number {
  for (const pad of [4, 2, 1]) {
    const p = start + Math.ceil(len / pad) * pad;
    if (p >= end) return Math.min(p, end);
    if (p + 4 <= r.bytes.length && isSig(String.fromCharCode(r.bytes[p], r.bytes[p + 1], r.bytes[p + 2], r.bytes[p + 3]))) return p;
  }
  return end;
}

function readLayerRecord(r: Reader, psb: boolean): RawLayer {
  const top = r.i32();
  const left = r.i32();
  const bottom = r.i32();
  const right = r.i32();
  const nch = r.u16();
  const channels: ChannelInfo[] = [];
  for (let i = 0; i < nch; i++) {
    const id = r.i16();
    channels.push({ id, offset: 0, length: r.len(psb) });
  }
  if (r.ascii(4) !== '8BIM') throw new Error('This PSD file is damaged (bad layer record)');
  const blendKey = r.ascii(4);
  const opacity = r.u8();
  const clipped = r.u8() !== 0;
  const flags = r.u8();
  r.skip(1);
  const extraLen = r.u32();
  const extraEnd = r.pos + extraLen;
  if (extraEnd > r.bytes.length) throw new Error('This PSD file is damaged or cut short');
  const layer: RawLayer = {
    top, left, bottom, right, channels, blendKey, opacity: opacity / 255, fill: 1, clipped,
    visible: (flags & 2) === 0, name: '', section: 0, adjustment: false, mask: null, vectorMask: false, fillLayer: false,
  };
  // layer mask
  const maskLen = r.u32();
  const maskEnd = r.pos + maskLen;
  if (maskLen >= 18) {
    const mTop = r.i32();
    const mLeft = r.i32();
    const mBottom = r.i32();
    const mRight = r.i32();
    const def = r.u8();
    const mflags = r.u8();
    layer.mask = { top: mTop, left: mLeft, bottom: mBottom, right: mRight, defaultColor: def, disabled: (mflags & 2) !== 0 };
  }
  r.pos = maskEnd;
  // blending ranges
  r.skip(r.u32());
  // name (Pascal string padded to 4)
  const nameLen = r.u8();
  layer.name = r.ascii(nameLen);
  r.skip((4 - ((nameLen + 1) % 4)) % 4);
  // tagged blocks
  while (r.pos + 12 <= extraEnd) {
    const sig = r.ascii(4);
    if (!isSig(sig)) break;
    const key = r.ascii(4);
    const len = psb && LONG_LENGTH_KEYS.has(key) ? r.u64() : r.u32();
    const start = r.pos;
    if (start + len > extraEnd) break;
    const data = r.bytes.subarray(start, start + len);
    if (key === 'luni' && len >= 4) {
      const n = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      if (4 + n * 2 <= len) layer.name = decodeUtf16(data.subarray(4, 4 + n * 2)).replace(/\u0000+$/, '');
    } else if ((key === 'lsct' || key === 'lsdk') && len >= 4) {
      layer.section = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
    } else if (key === 'iOpa' && len >= 1) {
      layer.fill = data[0] / 255;
    } else if (key === 'TySh') {
      layer.text = findText(data);
      layer.typeData = data;
    } else if (key === 'vmsk' || key === 'vsms') {
      layer.vectorMask = true;
      layer.vectorData = data;
    } else if (key === 'SoCo' || key === 'GdFl' || key === 'PtFl') {
      layer.fillLayer = true;
    } else if (ADJUSTMENT_KEYS.has(key)) {
      layer.adjustment = true;
    }
    r.pos = nextBlock(r, start, len, extraEnd);
  }
  r.pos = extraEnd;
  return layer;
}

// ---------------------------------------------------------------- document

interface Ctx {
  bytes: Uint8Array;
  psb: boolean;
  depth: number;
  mode: number;
  width: number;
  height: number;
  warnings: Set<string>;
}

function layerPixels(ctx: Ctx, raw: RawLayer): Uint8Array {
  const w = raw.right - raw.left;
  const h = raw.bottom - raw.top;
  if (w <= 0 || h <= 0) return new Uint8Array(0);
  const px = w * h;
  const out = new Uint8Array(px * 4);
  const planes: Record<number, Uint8Array> = {};
  let mask: Uint8Array | null = null;
  let maskConst = -1;
  const view = new DataView(ctx.bytes.buffer, ctx.bytes.byteOffset, ctx.bytes.byteLength);
  for (const ch of raw.channels) {
    if (ch.length < 2) continue;
    const comp = view.getUint16(ch.offset);
    const data = ctx.bytes.subarray(ch.offset + 2, ch.offset + ch.length);
    if (ch.id === -2 && raw.mask && !raw.mask.disabled) {
      const mw = raw.mask.right - raw.mask.left;
      const mh = raw.mask.bottom - raw.mask.top;
      if (mw > 0 && mh > 0) mask = decodeChannel(data, comp, mw, mh, ctx.depth, ctx.psb);
      else maskConst = raw.mask.defaultColor;
      continue;
    }
    if (ch.id < -1) continue;
    planes[ch.id] = decodeChannel(data, comp, w, h, ctx.depth, ctx.psb);
  }
  const gray = ctx.mode === 1;
  const r = planes[0];
  const g = gray ? r : planes[1];
  const b = gray ? r : planes[2];
  const a = planes[-1];
  for (let i = 0, o = 0; i < px; i++, o += 4) {
    out[o] = r ? r[i] : 0;
    out[o + 1] = g ? g[i] : 0;
    out[o + 2] = b ? b[i] : 0;
    out[o + 3] = a ? a[i] : 255;
  }
  if (maskConst >= 0) for (let o = 3; o < out.length; o += 4) out[o] = Math.round((out[o] * maskConst) / 255);
  if (mask && raw.mask) {
    const m = raw.mask;
    const mw = m.right - m.left;
    const mh = m.bottom - m.top;
    for (let y = 0; y < h; y++) {
      const my = raw.top + y - m.top;
      for (let x = 0; x < w; x++) {
        const mx = raw.left + x - m.left;
        const v = mx >= 0 && my >= 0 && mx < mw && my < mh ? mask[my * mw + mx] : m.defaultColor;
        const o = (y * w + x) * 4 + 3;
        out[o] = Math.round((out[o] * v) / 255);
      }
    }
  }
  return out;
}

function toNode(ctx: Ctx, raw: RawLayer): PsdLayer {
  const b = psdBlendMode(raw.blendKey);
  const w = Math.max(0, raw.right - raw.left);
  const h = Math.max(0, raw.bottom - raw.top);
  return {
    kind: 'layer',
    name: raw.name,
    visible: raw.visible,
    opacity: raw.opacity * raw.fill,
    blendKey: raw.blendKey,
    blendMode: b.mode,
    blendUnsupported: !b.supported,
    clipped: raw.clipped,
    left: raw.left,
    top: raw.top,
    width: w,
    height: h,
    text: raw.text,
    ...(raw.typeData ? optional('type', parseTypeBlock(raw.typeData)) : {}),
    ...vmaskOf(ctx, raw),
    hasPixelMask: !!raw.mask && !raw.mask.disabled && raw.channels.some((c) => c.id === -2),
    adjustment: raw.adjustment && !(w > 0 && h > 0),
    getPixels: () => layerPixels(ctx, raw),
  };
}

function optional<K extends string, V>(key: K, v: V | null): { [P in K]?: V } {
  return v ? ({ [key]: v } as { [P in K]?: V }) : {};
}

/** The vector mask of a layer, unless it is the outline of a shape or fill layer. */
function vmaskOf(ctx: Ctx, raw: RawLayer): { vectorMask?: PsdVectorMask } {
  if (!raw.vectorData || raw.fillLayer) return {};
  return optional('vectorMask', parseVectorMask(raw.vectorData, ctx.width, ctx.height));
}

/** A folder's pixel mask (folders have no pixels, so the mask is carried on its own). */
function folderMask(ctx: Ctx, raw: RawLayer): PsdGroup['pixelMask'] {
  const m = raw.mask;
  const ch = raw.channels.find((c) => c.id === -2);
  if (!m || m.disabled || !ch || ch.length < 2) return undefined;
  const width = m.right - m.left;
  const height = m.bottom - m.top;
  return {
    left: m.left,
    top: m.top,
    width: Math.max(0, width),
    height: Math.max(0, height),
    defaultColor: m.defaultColor,
    getAlpha: () => {
      if (width <= 0 || height <= 0) return new Uint8Array(0);
      const view = new DataView(ctx.bytes.buffer, ctx.bytes.byteOffset, ctx.bytes.byteLength);
      return decodeChannel(ctx.bytes.subarray(ch.offset + 2, ch.offset + ch.length), view.getUint16(ch.offset), width, height, ctx.depth, ctx.psb);
    },
  };
}

/** Group file-order layers (bottom first; a folder's end marker comes first and its folder record last) into a tree. */
function buildTree(ctx: Ctx, raws: RawLayer[]): PsdNode[] {
  const stack: PsdNode[][] = [[]];
  for (const raw of raws) {
    if (raw.section === 3) {
      stack.push([]);
    } else if (raw.section === 1 || raw.section === 2) {
      const children = stack.length > 1 ? stack.pop()! : [];
      const b = psdBlendMode(raw.blendKey);
      stack[stack.length - 1].push({
        kind: 'group',
        name: raw.name,
        visible: raw.visible,
        opacity: raw.opacity * raw.fill,
        blendKey: raw.blendKey,
        blendMode: b.mode,
        blendUnsupported: !b.supported && raw.blendKey !== 'pass',
        clipped: raw.clipped,
        open: raw.section === 1,
        ...vmaskOf(ctx, raw),
        ...optional('pixelMask', folderMask(ctx, raw)),
        children,
      });
    } else {
      stack[stack.length - 1].push(toNode(ctx, raw));
    }
  }
  // folders that never closed: keep what was inside
  while (stack.length > 1) {
    ctx.warnings.add('A layer group was not closed in the file; its layers were kept at the top level');
    const orphan = stack.pop()!;
    stack[stack.length - 1].push(...orphan);
  }
  return stack[0];
}

/** Read the layer records starting at the layer count. Returns them and leaves `r` after the channel data. */
function readLayerInfo(r: Reader, ctx: Ctx): { raws: RawLayer[]; mergedAlpha: boolean } {
  let count = r.i16();
  const mergedAlpha = count < 0;
  count = Math.abs(count);
  const raws: RawLayer[] = [];
  for (let i = 0; i < count; i++) raws.push(readLayerRecord(r, ctx.psb));
  let pos = r.pos;
  for (const l of raws) {
    for (const ch of l.channels) {
      ch.offset = pos;
      pos += ch.length;
    }
  }
  if (pos > ctx.bytes.length) throw new Error('This PSD file is damaged or cut short');
  r.pos = Math.min(pos, ctx.bytes.length);
  return { raws, mergedAlpha };
}

/** The flattened picture at the end of the file as RGBA. */
function readComposite(r: Reader, ctx: Ctx, width: number, height: number, channels: number, alpha: boolean, palette: Uint8Array | null): Uint8Array {
  const comp = r.u16();
  const bps = ctx.depth / 8;
  const rowBytes = width * bps;
  const planeCount = Math.max(1, Math.min(channels, ctx.mode === 4 ? 5 : 4));
  const rest = ctx.bytes.subarray(r.pos);
  const planes: Uint8Array[] = [];
  const toSamples = (raw: Uint8Array): Uint8Array => {
    if (bps === 1) return raw;
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) out[i] = raw[i * 2];
    return out;
  };
  if (comp === 0) {
    for (let c = 0; c < planeCount; c++) {
      const start = c * rowBytes * height;
      if (start + rowBytes * height > rest.length) throw new Error('This PSD file is damaged or cut short');
      planes.push(toSamples(rest.subarray(start, start + rowBytes * height)));
    }
  } else if (comp === 1) {
    // all the row byte counts come first, then each channel's rows
    const step = ctx.psb ? 4 : 2;
    const view = new DataView(rest.buffer, rest.byteOffset, rest.byteLength);
    let src = channels * height * step;
    for (let c = 0; c < channels; c++) {
      let total = 0;
      for (let y = 0; y < height; y++) total += ctx.psb ? view.getUint32((c * height + y) * 4) : view.getUint16((c * height + y) * 2);
      if (c < planeCount) {
        // rebuild a per-channel block with its own count table so decodeRle can be reused
        const block = new Uint8Array(height * step + total);
        block.set(rest.subarray(c * height * step, (c + 1) * height * step));
        block.set(rest.subarray(src, src + total), height * step);
        planes.push(toSamples(decodeRle(block, rowBytes, height, ctx.psb)));
      }
      src += total;
    }
  } else if (comp === 2 || comp === 3) {
    const inflated = unzlibSync(rest);
    for (let c = 0; c < planeCount; c++) {
      const raw = inflated.slice(c * rowBytes * height, (c + 1) * rowBytes * height);
      if (comp === 3) undoPrediction(raw, width, height, ctx.depth);
      planes.push(toSamples(raw));
    }
  } else {
    throw new Error(`Unknown PSD compression ${comp}`);
  }
  const px = width * height;
  const out = new Uint8Array(px * 4);
  const mode = ctx.mode;
  for (let i = 0, o = 0; i < px; i++, o += 4) {
    if (mode === 3) {
      out[o] = planes[0][i];
      out[o + 1] = planes[1][i];
      out[o + 2] = planes[2][i];
      out[o + 3] = alpha && planes[3] ? planes[3][i] : 255;
    } else if (mode === 1) {
      out[o] = out[o + 1] = out[o + 2] = planes[0][i];
      out[o + 3] = alpha && planes[1] ? planes[1][i] : 255;
    } else if (mode === 2 && palette) {
      const v = planes[0][i];
      out[o] = palette[v];
      out[o + 1] = palette[256 + v];
      out[o + 2] = palette[512 + v];
      out[o + 3] = 255;
    } else if (mode === 4) {
      // CMYK is stored inverted (255 means no ink); a plain conversion, no colour profile
      const k = planes[3][i];
      out[o] = Math.round((planes[0][i] * k) / 255);
      out[o + 1] = Math.round((planes[1][i] * k) / 255);
      out[o + 2] = Math.round((planes[2][i] * k) / 255);
      out[o + 3] = alpha && planes[4] ? planes[4][i] : 255;
    }
  }
  return out;
}

export function isPsd(bytes: Uint8Array): boolean {
  return bytes.length > 26 && bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53;
}

/** Parse a .psd (or .psb) file. Throws a readable error for files that aren't usable. */
export function parsePsd(bytes: Uint8Array): PsdDocument {
  if (!isPsd(bytes)) throw new Error('This is not a Photoshop file');
  const r = new Reader(bytes);
  r.skip(4);
  const version = r.u16();
  if (version !== 1 && version !== 2) throw new Error(`Unsupported PSD version ${version}`);
  const psb = version === 2;
  r.skip(6);
  const channels = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (width < 1 || height < 1 || width > 300000 || height > 300000) throw new Error('This PSD file has an invalid size');
  if (![1, 8, 16, 32].includes(depth)) throw new Error(`Unsupported PSD bit depth ${depth}`);
  const modeNames: Record<number, string> = { 0: 'bitmap', 1: 'grayscale', 2: 'indexed colour', 3: 'RGB', 4: 'CMYK', 7: 'multichannel', 8: 'duotone', 9: 'Lab' };
  const ctx: Ctx = { bytes, psb, depth, mode, width, height, warnings: new Set() };

  const colorData = r.slice(r.u32());
  r.skip(r.u32()); // image resources: guides, slices, thumbnails ... not used

  const layerAreaLen = r.len(psb);
  const layerAreaEnd = r.pos + layerAreaLen;
  if (layerAreaEnd > bytes.length) throw new Error('This PSD file is damaged or cut short');

  let raws: RawLayer[] = [];
  let mergedAlpha = false;
  const layersOk = (mode === 3 || mode === 1) && (depth === 8 || depth === 16);
  if (layerAreaLen > 0 && layersOk) {
    const infoLen = r.len(psb);
    const infoStart = r.pos;
    const infoEnd = infoStart + infoLen;
    if (infoLen > 0) {
      const res = readLayerInfo(r, ctx);
      raws = res.raws;
      mergedAlpha = res.mergedAlpha;
    }
    // 16 and 32 bit files keep their layers in an Lr16 / Lr32 block after the (empty) layer info
    if (!raws.length && infoEnd <= layerAreaEnd) {
      r.pos = infoEnd;
      if (r.pos + 4 <= layerAreaEnd) {
        r.skip(r.u32()); // global layer mask info
        while (r.pos + 12 <= layerAreaEnd) {
          const sig = r.ascii(4);
          if (!isSig(sig)) break;
          const key = r.ascii(4);
          const len = psb && LONG_LENGTH_KEYS.has(key) ? r.u64() : r.u32();
          const start = r.pos;
          if (key === 'Lr16' || key === 'Lr32') {
            const res = readLayerInfo(r, ctx);
            raws = res.raws;
            mergedAlpha = res.mergedAlpha;
            break;
          }
          r.pos = nextBlock(r, start, len, layerAreaEnd);
        }
      }
    }
  }
  r.pos = layerAreaEnd;

  const doc: PsdDocument = { width, height, depth, mode, nodes: [], composite: null, warnings: [] };

  if (!layersOk) {
    ctx.warnings.add(`${modeNames[mode] ?? `colour mode ${mode}`} files at ${depth} bit can't be split into layers; imported the flattened picture instead`);
  }
  const usable = raws.some((l) => l.section === 0 && l.right > l.left && l.bottom > l.top);
  if (usable) {
    doc.nodes = buildTree(ctx, raws);
    if (raws.some((l) => l.mask && !l.mask.disabled && !l.channels.some((c) => c.id === -2))) ctx.warnings.add('Some layer masks could not be read and were not applied');
  } else {
    // flat file, or one we can't split: use the picture saved with the document
    if (layersOk && raws.length) ctx.warnings.add('No layer in this file has pixels; imported the flattened picture instead');
    if (mode === 0 || mode === 7 || mode === 8 || mode === 9) throw new Error(`${modeNames[mode]} PSD files are not supported; convert to RGB in Photoshop (Image > Mode) and save again`);
    if (depth === 32 || depth === 1) throw new Error(`${depth} bit PSD files are not supported; convert to 8 bits per channel in Photoshop (Image > Mode) and save again`);
    if (mode === 4 && channels < 4) throw new Error('This CMYK PSD file is damaged')
    if (mode === 4) ctx.warnings.add('CMYK colours were converted without a colour profile, so they may look different');
    const palette = mode === 2 && colorData.length >= 768 ? colorData : null;
    if (mode === 2 && !palette) throw new Error('This indexed colour PSD has no palette');
    const rgba = readComposite(r, ctx, width, height, channels, mergedAlpha, palette);
    doc.composite = rgba;
    doc.nodes = [
      {
        kind: 'layer', name: 'Background', visible: true, opacity: 1, blendKey: 'norm', blendMode: 'normal', blendUnsupported: false, clipped: false,
        left: 0, top: 0, width, height, adjustment: false, getPixels: () => rgba,
      },
    ];
  }
  doc.warnings = [...ctx.warnings];
  return doc;
}

// ---------------------------------------------------------------- PNG

let crcTable: Uint32Array | null = null;
function crc32(parts: Uint8Array[]): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = crcTable[(c ^ p[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Encode straight (non-premultiplied) RGBA pixels as a PNG. Pure TypeScript, so it works without a canvas. */
export function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const rowBytes = width * 4;
  // filter type 0 (none) on every row; deflate does the rest
  const raw = new Uint8Array((rowBytes + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * rowBytes, (y + 1) * rowBytes), y * (rowBytes + 1) + 1);
  const idat = zlibSync(raw, { level: 6 });
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const chunks: [string, Uint8Array][] = [['IHDR', ihdr], ['IDAT', idat], ['IEND', new Uint8Array(0)]];
  const out = new Uint8Array(8 + chunks.reduce((n, [, d]) => n + 12 + d.length, 0));
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(out.buffer);
  let p = 8;
  for (const [type, data] of chunks) {
    view.setUint32(p, data.length);
    const t = new Uint8Array([type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3)]);
    out.set(t, p + 4);
    out.set(data, p + 8);
    view.setUint32(p + 8 + data.length, crc32([t, data]));
    p += 12 + data.length;
  }
  return out;
}

// ---------------------------------------------------------------- fonts

/** Google fonts a Photoshop file is likely to use. Keys are the name in lower case without spaces. */
export const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const GOOGLE_BY_KEY = new Map(GOOGLE_FONT_FAMILIES.map((f) => [squash(f), f]));

export const WEIGHT_WORDS: [RegExp, number][] = [
  [/hairline|thin/i, 100],
  [/extra\s*light|ultra\s*light/i, 200],
  [/light/i, 300],
  [/semi\s*bold|demi\s*bold|demi/i, 600],
  [/extra\s*bold|ultra\s*bold|heavy/i, 800],
  [/black|ultra/i, 900],
  [/bold/i, 700],
  [/medium/i, 500],
  [/regular|roman|book|normal/i, 400],
];

export interface PsdFont {
  family: string;
  weight: number;
  italic: boolean;
  /** The family is a known Google font. */
  google: boolean;
}

/** Best effort: a PostScript name like `Montserrat-SemiBoldItalic` as a family, weight and slant. */
export function psdFont(postscript: string, fauxBold = false, fauxItalic = false): PsdFont {
  const name = postscript.replace(/_/g, ' ').trim();
  const dash = name.indexOf('-');
  const strip = (t: string) => t.replace(/(PSMT|MT|PS)$/, '');
  let fam = strip(dash > 0 ? name.slice(0, dash) : name);
  const style = strip(dash > 0 ? name.slice(dash + 1) : '');
  // a few names carry a capital in the middle of one word ("DejaVu"), which the camel-case split must not break
  fam = fam.replace(/DejaVu/g, 'Dejavu').replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([0-9])([A-Z][a-z])/g, '$1 $2').replace(/Dejavu/g, 'DejaVu').replace(/\s+/g, ' ').trim() || 'sans-serif';
  let weight = 400;
  for (const [re, w] of WEIGHT_WORDS) {
    if (re.test(style)) {
      weight = w;
      break;
    }
  }
  // "ExtraBold" must not stop at "Bold" and "SemiBold" must not stop at "Light": the table order handles it, but "Black" before "Bold" is intended
  const italic = /italic|oblique|\bit$/i.test(style) || fauxItalic;
  if (fauxBold && weight < 600) weight = 700;
  const known = GOOGLE_BY_KEY.get(squash(fam)) ?? GOOGLE_BY_KEY.get(squash(strip(dash > 0 ? name.slice(0, dash) : name)));
  return { family: known ?? fam, weight, italic, google: !!known };
}

// ---------------------------------------------------------------- to layers

export interface PsdImport {
  artboard: Artboard;
  assets: ImportedAsset[];
  /** Google fonts used by the text layers. */
  fonts: FontRef[];
  warnings: string[];
}

export interface PsdImportOptions {
  /** Bring type layers in as editable text (default). Off keeps every one as a picture. */
  text?: boolean;
}

const round = (v: number, d = 1000) => Math.round(v * d) / d;

/** Turn a PSD into an artboard of image layers, groups, masks and text, with the pictures as PNG assets. */
export function importPsd(bytes: Uint8Array, baseName: string, options: PsdImportOptions = {}): PsdImport {
  const doc = parsePsd(bytes);
  const asText = options.text !== false;
  const warnings = new Set(doc.warnings);
  const assets: ImportedAsset[] = [];
  const googleWeights = new Map<string, Set<number>>();
  const unsupportedBlends = new Set<string>();
  const approxBlends = new Set<string>();
  let adjustments = 0;
  let keptTextPictures = 0;

  const common = (n: PsdLayer | PsdGroup) => ({
    visible: n.visible,
    opacity: round(n.opacity),
    ...(n.blendMode !== 'normal' ? { blendMode: n.blendMode } : {}),
  });
  const noteBlend = (n: PsdLayer | PsdGroup) => {
    if (n.blendUnsupported) unsupportedBlends.add(BLEND_NAMES[n.blendKey] ?? n.blendKey.trim());
    else if (BLEND_APPROX[n.blendKey]) approxBlends.add(`${BLEND_NAMES[n.blendKey] ?? n.blendKey.trim()} (as ${BLEND_APPROX[n.blendKey].replace('-', ' ')})`);
  };

  const boundsOf = (kids: SceneNode[]) => ({
    x0: Math.min(...kids.map((k) => k.x)),
    y0: Math.min(...kids.map((k) => k.y)),
    x1: Math.max(...kids.map((k) => k.x + k.width)),
    y1: Math.max(...kids.map((k) => k.y + k.height)),
  });

  /** A group whose box is the union of its children, with the children placed relative to it. */
  const makeGroup = (name: string, kids: SceneNode[], extra: Record<string, unknown> = {}): SceneNode => {
    const b = boundsOf(kids);
    for (const k of kids) {
      k.x -= b.x0;
      k.y -= b.y0;
    }
    return createNode('group', { name, x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, children: kids, ...extra });
  };

  const addImage = (name: string, w: number, h: number, rgba: Uint8Array): string => {
    const id = uid('as');
    assets.push({ id, name: `${name.replace(/[\\/:*?"<>|]+/g, '_')}.png`, mime: 'image/png', bytes: encodePng(w, h, rgba) });
    return id;
  };

  /** The outline of a vector mask as a path layer that works as a clipping mask. */
  const vectorMaskNode = (name: string, vm: PsdVectorMask): SceneNode => {
    const subs = vm.paths.map((p) => ({ closed: p.closed, points: p.points }));
    const all: { x: number; y: number }[] = [];
    for (const s of subs) for (const p of s.points) all.push({ x: p.x, y: p.y }, { x: p.x + p.inX, y: p.y + p.inY }, { x: p.x + p.outX, y: p.y + p.outY });
    if (vm.invert) all.push({ x: 0, y: 0 }, { x: doc.width, y: doc.height });
    const x0 = Math.min(...all.map((p) => p.x));
    const y0 = Math.min(...all.map((p) => p.y));
    const x1 = Math.max(...all.map((p) => p.x));
    const y1 = Math.max(...all.map((p) => p.y));
    const paths: SubPath[] = subs.map((s) => ({
      closed: s.closed,
      points: s.points.map((p) => ({
        x: round(p.x - x0),
        y: round(p.y - y0),
        in: p.inX || p.inY ? { x: round(p.inX), y: round(p.inY) } : null,
        out: p.outX || p.outY ? { x: round(p.outX), y: round(p.outY) } : null,
      })),
    }));
    // "invert" hides what is inside the path: the whole canvas with the path cut out of it
    if (vm.invert) {
      const c = { closed: true, points: [[0, 0], [doc.width, 0], [doc.width, doc.height], [0, doc.height]].map(([x, y]) => ({ x: x - x0, y: y - y0, in: null, out: null })) };
      paths.unshift(c);
    }
    return createNode('path', {
      name,
      x: round(x0),
      y: round(y0),
      width: Math.max(1, round(x1 - x0)),
      height: Math.max(1, round(y1 - y0)),
      paths,
      fill: { type: 'solid', color: '#000000' },
      stroke: null,
      fillRule: vm.evenodd || vm.invert ? 'evenodd' : 'nonzero',
      mask: true,
    } as Partial<PathNode>);
  };

  /** Registers the fonts of a run and gives back the style it maps to. */
  const fontOf = (ps: string, fauxBold: boolean, fauxItalic: boolean) => {
    const f = psdFont(ps, fauxBold, fauxItalic);
    if (f.google) {
      if (!googleWeights.has(f.family)) googleWeights.set(f.family, new Set());
      googleWeights.get(f.family)!.add(f.weight);
    }
    return f;
  };

  /** A Photoshop type layer as a text layer: font, size, colour, spacing, alignment and the style runs. */
  const textNode = (n: PsdLayer, t: PsdType, name: string): SceneNode => {
    const [xx, xy, yx, yy, tx, ty] = t.transform;
    const sx = Math.hypot(xx, xy) || 1;
    const sy = Math.hypot(yx, yy) || 1;
    const rot = (Math.atan2(xy, xx) * 180) / Math.PI;
    const style = (r: PsdType['runs'][number]) => {
      const f = fontOf(r.font, r.fauxBold, r.fauxItalic);
      const size = Math.max(1, round(r.size * sy, 10));
      return { family: f.family, weight: f.weight, italic: f.italic, size, color: r.color, spacing: round((r.tracking / 1000) * size, 100), underline: r.underline, strike: r.strike };
    };
    const first = t.runs[0];
    const b = style(first);
    const runs: TextRun[] = t.runs.map((r) => {
      const s = style(r);
      const o: TextRun = { text: r.text };
      if (s.family !== b.family) o.fontFamily = s.family;
      if (s.size !== b.size) o.fontSize = s.size;
      if (s.weight !== b.weight) o.fontWeight = s.weight;
      if (s.italic !== b.italic) o.italic = s.italic;
      if (s.color !== b.color) o.color = s.color;
      if (s.underline !== b.underline) o.underline = s.underline;
      if (s.strike !== b.strike) o.strike = s.strike;
      if (s.spacing !== b.spacing) o.letterSpacing = s.spacing;
      return o;
    });
    const lineHeight = first.leading !== null ? round(first.leading / first.size, 100) : round(t.autoLeading, 100);
    const lines = t.text.split('\n').length;
    const lh = lineHeight * b.size;

    // Where the box goes. Paragraph text has a box starting at the transform's origin. Point text is anchored at its first
    // baseline (left, centre or right per alignment), so the box is built around the rendered width.
    let w: number;
    let h: number;
    let cx: number; // box centre relative to the origin, before rotation
    let cy: number;
    if (t.paragraph && t.box) {
      const [l, tp, r, bt] = t.box;
      w = (r - l) * sx;
      h = (bt - tp) * sy;
      cx = ((l + r) / 2) * sx;
      cy = ((tp + bt) / 2) * sy;
    } else {
      const longest = Math.max(...t.text.split('\n').map((x) => x.length));
      w = Math.ceil((n.width > 0 ? n.width : longest * b.size * 0.6) * 1.08) + 6;
      h = lines * lh;
      const ox = t.align === 'center' ? -w / 2 : t.align === 'right' ? -w : 0;
      const oy = -(lh / 2 + 0.325 * b.size);
      cx = ox + w / 2;
      cy = oy + h / 2;
    }
    const rad = (rot * Math.PI) / 180;
    const centerX = tx + cx * Math.cos(rad) - cy * Math.sin(rad);
    const centerY = ty + cx * Math.sin(rad) + cy * Math.cos(rad);

    return createNode('text', {
      name,
      x: round(centerX - w / 2, 100),
      y: round(centerY - h / 2, 100),
      width: round(w, 100),
      height: round(h, 100),
      ...(Math.abs(rot) > 0.01 ? { rotation: round(rot, 100) } : {}),
      ...runsPatch(runs),
      fontFamily: b.family,
      fontSize: b.size,
      fontWeight: b.weight,
      fontStyle: b.italic ? 'italic' : 'normal',
      lineHeight,
      letterSpacing: b.spacing,
      color: b.color,
      align: t.align,
      verticalAlign: 'top',
      ...(b.underline ? { textDecoration: 'underline' as const } : b.strike ? { textDecoration: 'line-through' as const } : {}),
      ...(first.allCaps ? { textTransform: 'uppercase' as const } : {}),
      autoSize: t.paragraph && t.box ? 'none' : 'width',
    } as Partial<TextNode>);
  };

  /** A layer or folder as a scene node, without its opacity / blend / visibility (the caller places those), plus a mask copy. */
  interface Unit {
    node: SceneNode;
    c: ReturnType<typeof common>;
    name: string;
    /** A copy to use as the clipping mask for layers clipped to this one, or null when it has no shape. */
    mask: () => SceneNode | null;
  }

  const convertOne = (n: PsdNode): Unit | null => {
    let core: SceneNode;
    let mask: () => SceneNode | null;
    const name = n.name || 'Layer';
    if (n.kind === 'group') {
      const kids = convert(n.children);
      if (!kids.length) return null;
      noteBlend(n);
      const b = boundsOf(kids);
      core = makeGroup(n.name || 'Group', kids);
      // the mask copy for layers clipped to this folder, taken while its children are still in document coordinates
      const snapshot = cloneWithNewIds(core);
      mask = () => cloneWithNewIdsMask(snapshot);
      if (n.pixelMask) {
        // a folder's pixel mask becomes an image mask over the whole folder (alpha from the mask, default colour outside it)
        const pm = n.pixelMask;
        const hasBox = pm.width > 0 && pm.height > 0;
        const x0 = Math.floor(hasBox ? Math.min(pm.left, b.x0) : b.x0);
        const y0 = Math.floor(hasBox ? Math.min(pm.top, b.y0) : b.y0);
        const x1 = Math.ceil(hasBox ? Math.max(pm.left + pm.width, b.x1) : b.x1);
        const y1 = Math.ceil(hasBox ? Math.max(pm.top + pm.height, b.y1) : b.y1);
        const W = Math.max(1, x1 - x0);
        const H = Math.max(1, y1 - y0);
        const rgba = new Uint8Array(W * H * 4);
        const alpha = hasBox ? pm.getAlpha() : new Uint8Array(0);
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const mx = x0 + x - pm.left;
            const my = y0 + y - pm.top;
            rgba[(y * W + x) * 4 + 3] = hasBox && mx >= 0 && my >= 0 && mx < pm.width && my < pm.height ? alpha[my * pm.width + mx] : pm.defaultColor;
          }
        }
        const id = addImage(`${name} layer mask`, W, H, rgba);
        const maskNode = createNode('image', { name: `${name} (layer mask)`, assetId: id, x: x0, y: y0, width: W, height: H, fit: 'fill', mask: true });
        core = makeGroup(name, [maskNode, core]);
      }
    } else {
      if (n.adjustment) {
        adjustments++;
        return null;
      }
      const hasPx = n.width >= 1 && n.height >= 1;
      const t = n.type;
      const real = asText && !!t && !t.vertical && !t.warped && !n.hasPixelMask;
      if (t && asText && !real && (t.vertical || t.warped || n.hasPixelMask)) keptTextPictures++;
      const text = n.text?.replace(/[\r\n\u0003]+/g, ' ').trim();
      const label = n.name || (text ? text.slice(0, 80) : 'Layer');
      let raster: string | null = null;
      const rasterId = (): string | null => {
        if (!hasPx) return null;
        raster ??= addImage(label, n.width, n.height, n.getPixels());
        return raster;
      };
      const imageNode = (id: string, extra: Record<string, unknown> = {}) =>
        createNode('image', { name: label, assetId: id, x: n.left, y: n.top, width: n.width, height: n.height, fit: 'fill', ...extra });
      if (real && t) {
        core = textNode(n, t, label);
        mask = () => {
          const id = rasterId();
          return id ? imageNode(id, { name: `${label} (mask)`, mask: true }) : null;
        };
      } else {
        if (!hasPx) return null;
        noteBlend(n);
        const id = rasterId()!;
        core = imageNode(id, text ? { ariaLabel: text } : {});
        mask = () => imageNode(id, { name: `${label} (mask)`, mask: true });
      }
      if (real) noteBlend(n);
    }
    // a vector mask: a path used as a mask, just under the layer, inside a group of their own
    let node = core;
    if (n.vectorMask) {
      const vm = vectorMaskNode(`${name} (vector mask)`, n.vectorMask);
      node = makeGroup(name, [vm, core]);
      const pathCopy = vectorMaskNode(`${name} (mask)`, n.vectorMask);
      mask = () => pathCopy;
    }
    return { node, c: common(n), name, mask };
  };

  const cloneWithNewIdsMask = (node: SceneNode): SceneNode => {
    const c = cloneWithNewIds(node);
    c.mask = true;
    c.name = `${node.name} (mask)`;
    c.visible = true;
    c.opacity = 1;
    return c;
  };

  const convert = (list: PsdNode[]): SceneNode[] => {
    const out: SceneNode[] = [];
    let i = 0;
    while (i < list.length) {
      const n = list[i];
      // a clipped layer clips to the nearest unclipped layer below it; with none below it, it is just a layer
      let j = i + 1;
      if (!n.clipped) while (j < list.length && list[j].clipped) j++;
      const base = convertOne(n);
      const rest = list.slice(i + 1, j).map(convertOne).filter((u): u is Unit => !!u);
      i = j;
      if (!base) {
        for (const u of rest) out.push(Object.assign(u.node, u.c));
        continue;
      }
      const maskNode = rest.length ? base.mask() : null;
      if (!rest.length || !maskNode) {
        out.push(Object.assign(base.node, base.c));
        for (const u of rest) out.push(Object.assign(u.node, u.c));
        continue;
      }
      // The base is drawn first, a copy of it masks everything clipped to it, and the group carries the base's opacity and blend mode
      const clipped = rest.map((u) => Object.assign(u.node, u.c));
      out.push(makeGroup(`${base.name} (clipped)`, [base.node, maskNode, ...clipped], base.c));
    }
    return out;
  };

  const children = convert(doc.nodes);
  if (adjustments) warnings.add(`${adjustments} adjustment layer${adjustments > 1 ? 's were' : ' was'} not carried over (they change how layers below look, which can't be reproduced)`);
  if (unsupportedBlends.size) warnings.add(`Blend modes with no equivalent were imported as normal: ${[...unsupportedBlends].join(', ')}`);
  if (approxBlends.size) warnings.add(`Blend modes drawn with the nearest one there is: ${[...approxBlends].join(', ')}`);
  if (keptTextPictures) warnings.add(`${keptTextPictures} text layer${keptTextPictures > 1 ? 's' : ''} (warped, vertical or masked) kept as pictures`);
  if (!children.length) throw new Error('This PSD file has no pixels to import');

  const fonts: FontRef[] = [...googleWeights].map(([family, w]) => ({ family, source: 'google', weights: [...w].sort((a, b) => a - b) }));
  const artboard = createArtboard({ name: baseName || 'Photoshop import', width: doc.width, height: doc.height, background: null, children });
  return { artboard, assets, fonts, warnings: [...warnings] };
}
