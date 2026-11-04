/**
 * VectorCraft (`.vectorcraft`, and the older `.drawcraft`) import.
 *
 * A VectorCraft file is JSON (gzip-compressed when saved with compression) holding a document: artboards, a tree of layers
 * made of groups, paths, compound paths, text, images and a few live objects, each with an appearance (a stack of fills and
 * strokes with gradients). From version 4 large pictures follow the JSON after a marker instead of sitting in it as base64.
 * Coordinates are points, y down, handles are absolute positions.
 *
 * What comes across:
 *   - every artboard becomes an artboard (named after the file), with the artwork that touches it;
 *   - layers and groups become groups (hidden stays hidden, opacity and blend mode kept); clip groups and clipped layers
 *     become a mask layer in front of what it clips;
 *   - paths and compound paths become path layers with solid, linear and radial gradient fills and strokes (width, caps,
 *     joins, dashes, inside / outside alignment). An object with several fills or strokes becomes one path layer with a list of
 *     each (blend modes per paint); only a stroke drawn under a fill is split into a group of one path layer for each;
 *   - live shapes are their outline, symbols are placed as copies, Repeat objects are expanded into copies, Blend objects
 *     between two paths with the same points get their steps;
 *   - text becomes text layers (font, size, colour, tracking, leading, alignment, style runs);
 *   - pictures become image layers with the picture as an asset (linked pictures only when their preview is saved in the file);
 *   - drop shadows, glows and Gaussian blur become the layer's shadow and blur.
 * Not carried over (and reported): opacity masks, gradient meshes (approximated by flat patches), envelope distortions (the
 * art is kept undistorted), pattern fills, brushes and variable width strokes, arrowheads,
 * type on a path, other live effects, placed documents, and blend modes Interactives does not have.
 */
import { PASCAL_BLENDS, PASCAL_PAINT_BLENDS } from './blend-modes';
import { gunzipSync } from 'fflate';
import { createArtboard, createNode, type Artboard, type BlendMode, type FontRef, type Paint, type SceneNode, type Shadow, type Stroke, type TextNode } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import {
  FontBook,
  IDENT,
  absBounds,
  applyM,
  assetId,
  boxesTouch,
  buildTextNode,
  cmykToRgb,
  cssColor,
  detM,
  finite,
  labToRgb,
  linearGradient,
  makeGroup,
  mixRgba,
  mulM,
  parseM,
  pathNodeOf,
  radialGradient,
  rotateM,
  round,
  scaleOfM,
  translateM,
  withMidpoints,
  type AbsSub,
  type Box,
  type GStop,
  type M6,
  type RGBA,
  type TextPiece,
} from './craft-shared';

// ---------------------------------------------------------------- the file

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, d = 0): number => finite(v, d);
const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);

const BLOB_MAGIC = new TextEncoder().encode('\n\0VCBLOBS\0');
export const VECTORCRAFT_VERSION = 4;
const MAX_NODES = 400_000;

export interface VcImage {
  mime: string;
  bytes: Uint8Array;
  /** A linked picture shown by the low-resolution preview saved in the file. */
  proxy: boolean;
}

export interface VcFile {
  format: string;
  version: number;
  generator: string;
  document: Rec;
  images: Map<string, VcImage>;
}

const isGzip = (b: Uint8Array): boolean => b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;

function indexOfBytes(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function base64Bytes(s: string): Uint8Array {
  const bin = atob(s.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Does this start a `.vectorcraft` (or `.drawcraft`) file? Looks for the `format` member within the first 256 bytes. */
export function isVectorCraft(bytes: Uint8Array): boolean {
  let head = bytes;
  if (isGzip(bytes)) {
    try {
      head = gunzipSync(bytes);
    } catch {
      return false;
    }
  }
  const text = new TextDecoder().decode(head.subarray(0, 256));
  return /^\s*\{\s*"format"\s*:\s*"(vectorcraft|drawcraft)"/.test(text);
}

/** Read the envelope: the document JSON and the pictures (base64 inline, or in the data after the JSON). */
export function parseVectorCraft(input: Uint8Array): VcFile {
  const all = isGzip(input) ? gunzipSync(input) : input;
  // The JSON ends where the marker starts; JSON itself never holds a NUL byte
  let end = all.length;
  let tail: Uint8Array = new Uint8Array(0);
  const nul = all.indexOf(0);
  if (nul > 0) {
    const at = indexOfBytes(all, BLOB_MAGIC, Math.max(0, nul - 1));
    if (at >= 0) {
      end = at;
      tail = all.subarray(at + BLOB_MAGIC.length);
    }
  }
  let root: Rec;
  try {
    root = rec(JSON.parse(new TextDecoder().decode(all.subarray(0, end))));
  } catch {
    throw new Error('This is not a VectorCraft file (its JSON can’t be read)');
  }
  const format = str(root.format);
  if (format !== 'vectorcraft' && format !== 'drawcraft') throw new Error(`This is not a VectorCraft file (format “${format}”)`);
  const version = num(root.version);
  if (version > VECTORCRAFT_VERSION) throw new Error(`This VectorCraft file is version ${version}, newer than this editor reads (${VECTORCRAFT_VERSION}). Save it again with an older VectorCraft, or export it as SVG.`);
  const images = new Map<string, VcImage>();
  for (const [key, v] of Object.entries(rec(root.images))) {
    const e = rec(v);
    let bytes: Uint8Array | null = null;
    const blob = arr(e.blob);
    if (blob.length === 2) {
      const off = num(blob[0]);
      const len = num(blob[1]);
      if (off >= 0 && len > 0 && off + len <= tail.length) bytes = tail.subarray(off, off + len);
    } else if (typeof e.data === 'string' && e.data) {
      try {
        bytes = base64Bytes(e.data);
      } catch {
        bytes = null;
      }
    }
    if (bytes?.length) images.set(key, { mime: str(e.mime, 'image/png'), bytes, proxy: e.proxy === true });
  }
  return { format, version, generator: str(root.generator), document: rec(root.document), images };
}

// ---------------------------------------------------------------- colours and paints

const BLENDS = PASCAL_BLENDS;

/** A VectorCraft colour (rgb, cmyk, gray as ink, lab) as straight RGBA. */
export function vcColor(c: unknown, alpha = 1): RGBA {
  const o = rec(c);
  const k = (v: unknown) => Math.max(0, Math.min(1, num(v)));
  switch (str(o.model)) {
    case 'cmyk': {
      const [r, g, b] = cmykToRgb(k(o.c), k(o.m), k(o.y), k(o.k));
      return { r, g, b, a: alpha };
    }
    case 'gray': {
      const v = (1 - k(o.k)) * 255;
      return { r: v, g: v, b: v, a: alpha };
    }
    case 'lab': {
      const [r, g, b] = labToRgb(num(o.l), num(o.a), num(o.b));
      return { r, g, b, a: alpha };
    }
    default:
      return { r: k(o.r) * 255, g: k(o.g) * 255, b: k(o.b) * 255, a: alpha };
  }
}

interface Item {
  kind: 'fill' | 'stroke';
  paint: Rec;
  opacity: number;
  blend: BlendMode | undefined;
  stroke?: Rec;
  effects: Rec[];
}

// ---------------------------------------------------------------- the importer

export interface VectorCraftImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  fonts: FontRef[];
  warnings: string[];
}

interface Ctx {
  /** Drop top-level artwork far from this box (artboard coordinates); used when a file has several artboards. */
  cull: Box | null;
  depth: number;
}

const readPoint = (v: unknown): { x: number; y: number } | null => {
  if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number') return { x: v[0], y: v[1] };
  const o = rec(v);
  return typeof o.x === 'number' && typeof o.y === 'number' ? { x: o.x, y: o.y } : null;
};

/** Sub-paths of a path value in final coordinates. */
function subsOf(pd: unknown, m: M6): AbsSub[] {
  const subs: AbsSub[] = [];
  for (const sp of arr(rec(pd).subpaths)) {
    const s = rec(sp);
    const pts = [];
    for (const a of arr(s.anchors)) {
      const ao = rec(a);
      const p = readPoint(ao.p);
      if (!p) continue;
      const q = applyM(m, p.x, p.y);
      const hi = readPoint(ao.in);
      const ho = readPoint(ao.out);
      const pt: AbsSub['pts'][number] = { x: q.x, y: q.y };
      if (hi && (hi.x !== p.x || hi.y !== p.y)) {
        const h = applyM(m, hi.x, hi.y);
        pt.inX = h.x;
        pt.inY = h.y;
      }
      if (ho && (ho.x !== p.x || ho.y !== p.y)) {
        const h = applyM(m, ho.x, ho.y);
        pt.outX = h.x;
        pt.outY = h.y;
      }
      pts.push(pt);
    }
    if (pts.length) subs.push({ closed: s.closed === true, pts });
  }
  return subs;
}


class Importer {
  readonly warnings = new Set<string>();
  readonly assets: ImportedAsset[] = [];
  readonly fonts = new FontBook();
  private readonly notes = new Map<string, number>();
  private readonly assetByKey = new Map<string, string | null>();
  private readonly symbols = new Map<string, Rec>();
  private count = 0;
  private imageCount = 0;

  constructor(readonly file: VcFile) {
    for (const s of arr(file.document.symbols)) {
      const o = rec(s);
      if (typeof o.name === 'string') this.symbols.set(o.name, rec(o.art));
    }
  }

  note(what: string): void {
    this.notes.set(what, (this.notes.get(what) ?? 0) + 1);
  }

  report(): string[] {
    const out = [...this.warnings];
    for (const [what, n] of this.notes) out.push(n > 1 ? `${what} (${n} times)` : what);
    return out;
  }

  // ---- paths

  // ---- paints

  /** A paint of an appearance item, for a shape with outline bounds `b` (final coordinates). */
  paintOf(paint: Rec, opacity: number, b: Box, m: M6): Paint | null {
    switch (str(paint.type)) {
      case 'solid': {
        const c = vcColor(paint.color);
        return { type: 'solid', color: cssColor(c, opacity) };
      }
      case 'gradient': {
        return this.gradientOf(rec(paint.gradient), paint, opacity, b, m);
      }
      case 'pattern':
        this.note('Pattern fills and strokes were left out');
        return null;
      default:
        return null;
    }
  }

  private gradientOf(g: Rec, gp: Rec, opacity: number, b: Box, m: M6): Paint | null {
    const raw = arr(g.stops).map(rec);
    if (!raw.length) return null;
    const stops: GStop[] = raw.map((s) => ({ t: Math.max(0, Math.min(1, num(s.offset))), c: vcColor(s.color, Math.max(0, Math.min(1, num(s.opacity, 1)))) }));
    const mids = raw.map((s) => (s.midpoint === undefined ? undefined : num(s.midpoint, 0.5)));
    const all = withMidpoints(stops, mids);
    const kind = str(g.kind, 'Linear');
    const geom = rec(gp.geom);
    const gs = readPoint(geom.start);
    const ge = readPoint(geom.end);
    if (kind === 'Freeform') this.note('Freeform gradients were approximated by a linear gradient');
    if (kind === 'Radial') {
      const aspect = num(geom.aspect, 1);
      if (Math.abs(aspect - 1) > 0.05) this.note('Elliptical radial gradients were drawn as circles');
      let c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      let R = Math.max(b.width, b.height) / 2;
      if (gs && ge) {
        c = applyM(m, gs.x, gs.y);
        const e = applyM(m, ge.x, ge.y);
        R = Math.hypot(e.x - c.x, e.y - c.y);
      }
      const { paint, off } = radialGradient(all, c, R, b, opacity);
      if (off) this.note('A radial gradient whose centre is off the middle of its shape was centred');
      return paint;
    }
    let p0: { x: number; y: number };
    let p1: { x: number; y: number };
    if (gs && ge) {
      p0 = applyM(m, gs.x, gs.y);
      p1 = applyM(m, ge.x, ge.y);
    } else {
      // "fit to the object": a line through the centre at the angle (degrees, counter-clockwise), long enough to span the box
      const a = (num(gp.angle) * Math.PI) / 180;
      const dx = Math.cos(a);
      const dy = -Math.sin(a);
      const half = (b.width * Math.abs(dx) + b.height * Math.abs(dy)) / 2;
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      p0 = { x: cx - dx * half, y: cy - dy * half };
      p1 = { x: cx + dx * half, y: cy + dy * half };
    }
    return linearGradient(all, p0, p1, b, opacity);
  }

  // ---- appearance

  private itemsOf(n: Rec): Item[] {
    const out: Item[] = [];
    for (const raw of arr(rec(n.appearance).items)) {
      const it = rec(raw);
      if (it.visible === false) continue;
      const kind = str(it.kind);
      if (kind !== 'fill' && kind !== 'stroke') continue;
      const blend = str(it.blend, 'Normal');
      if (blend !== 'Normal' && !PASCAL_PAINT_BLENDS[blend]) this.note(`Blend modes with no equivalent were imported as normal (${blend})`);
      out.push({ kind, paint: rec(it.paint), opacity: Math.max(0, Math.min(1, num(it.opacity, 1))), blend: PASCAL_PAINT_BLENDS[blend], stroke: kind === 'stroke' ? it : undefined, effects: arr(it.effects).map(rec) });
    }
    return out;
  }

  /** Drop shadow / glow / blur from the object's live effects, as the layer's own shadow and blur. */
  private effectsOf(n: Rec, items: Item[]): { shadow?: Shadow; blur?: number } {
    const list = [...arr(rec(n.appearance).effects).map(rec), ...items.flatMap((i) => i.effects)];
    let shadow: Shadow | undefined;
    let blur: number | undefined;
    for (const e of list) {
      if (e.visible === false) continue;
      const id = str(e.id);
      const p = rec(e.params);
      const hexColor = (v: unknown, fallback: string): string => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);
      const withAlpha = (hex: string, a: number): string => {
        const v = parseInt(hex.slice(1), 16);
        return cssColor({ r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a });
      };
      if (id === 'stylize.dropShadow' && !shadow) {
        shadow = { x: round(num(p.x, 7)), y: round(num(p.y, 7)), blur: round(num(p.blur, 5)), spread: 0, color: withAlpha(hexColor(p.color, '#000000'), num(p.opacity, 75) / 100) };
      } else if (id === 'stylize.outerGlow' && !shadow) {
        shadow = { x: 0, y: 0, blur: round(num(p.blur, 5)), spread: 0, color: withAlpha(hexColor(p.color, '#ffff00'), num(p.opacity, 75) / 100) };
      } else if ((id === 'blur.gaussian' || id === 'blur.smart') && blur === undefined) {
        blur = round(num(p.radius, 5));
      } else this.note(`Live effects other than drop shadow, outer glow and Gaussian blur were left out (${id || 'unnamed'})`);
    }
    return { ...(shadow ? { shadow } : {}), ...(blur ? { blur } : {}) };
  }

  /** Name, visibility, opacity, blend mode and effects shared by every kind of object. */
  private decorate(nodes: SceneNode[], n: Rec, name: string, items: Item[] = []): SceneNode[] {
    if (!nodes.length) return [];
    const node = nodes.length === 1 ? nodes[0] : makeGroup(name, nodes);
    if (nodes.length === 1 && name) node.name = name;
    if (n.visible === false) node.visible = false;
    if (n.locked === true) node.locked = true;
    const opacity = Math.max(0, Math.min(1, num(n.opacity, 1)));
    if (opacity < 1) node.opacity = round(opacity * node.opacity);
    const blend = str(n.blend, 'Normal');
    if (blend !== 'Normal') {
      if (BLENDS[blend]) node.blendMode = BLENDS[blend];
      else this.note(`Blend modes with no equivalent were imported as normal (${blend})`);
    }
    const fx = this.effectsOf(n, items);
    if (fx.shadow) node.shadow = fx.shadow;
    if (fx.blur) node.blur = fx.blur;
    if (n.mask) this.note('Opacity masks were not carried over');
    return [node];
  }

  // ---- shapes

  /** Path layers for an outline with the object's fills and strokes. */
  private shapeNodes(name: string, subs: AbsSub[], evenodd: boolean, n: Rec, m: M6): { nodes: SceneNode[]; items: Item[] } {
    const items = this.itemsOf(n);
    if (!subs.length || !items.length) return { nodes: [], items };
    const b = absBounds(subs);
    const k = scaleOfM(m);
    const fillOf = (it: Item): Paint | null => {
      const p = this.paintOf(it.paint, it.opacity, b, m);
      return p && it.blend ? { ...p, blend: it.blend } : p;
    };
    const strokeOf = (it: Item, own: boolean): Stroke | null => {
      const sp = this.paintOf(it.paint, it.opacity, b, m);
      const so = it.stroke;
      const width = Math.max(0, num(so?.width)) * k;
      if (!sp || !(width > 0)) return null;
      const dash = rec(so?.dash);
      const pattern = arr(dash.pattern).map((v) => num(v)).filter((v) => v >= 0);
      const dashed = pattern.length > 0 && pattern.some((v) => v > 0);
      if (so?.brush || so?.profile) this.note('Brushes and variable width strokes were imported as plain strokes');
      if (so?.start_arrow || so?.end_arrow) this.note('Arrowheads were left out');
      const stroke: Stroke = { paint: sp, width: round(width, 100) };
      if (dashed) {
        stroke.dash = pattern.map((v) => round(v * k, 100));
        if (num(dash.offset)) stroke.dashOffset = round(num(dash.offset) * k, 100);
      }
      const align = str(so?.align, 'Center').toLowerCase();
      if (align === 'inside' || align === 'outside') stroke.align = align;
      // Each stroke of a stack has its own caps and joins; a lone one leaves them to the path layer
      if (own) {
        stroke.cap = capOf(so);
        stroke.join = joinOf(so);
      }
      if (it.blend) stroke.blend = it.blend;
      return stroke;
    };
    const capOf = (so: Rec | undefined) => {
      const c = str(so?.cap, 'Butt').toLowerCase();
      return c === 'round' ? 'round' : c === 'square' ? 'square' : 'butt';
    };
    const joinOf = (so: Rec | undefined) => {
      const j = str(so?.join, 'Miter').toLowerCase();
      return j === 'round' ? 'round' : j === 'bevel' ? 'bevel' : 'miter';
    };
    const fills = items.filter((i) => i.kind === 'fill');
    const strokes = items.filter((i) => i.kind === 'stroke');
    // Fills are all drawn under strokes in a layer: a stack with a stroke under a fill is split into one layer each
    const lastFill = items.map((i) => i.kind).lastIndexOf('fill');
    const firstStroke = items.findIndex((i) => i.kind === 'stroke');
    const stacked = lastFill < 0 || firstStroke < 0 || lastFill < firstStroke;
    const out: SceneNode[] = [];
    if (stacked) {
      const fl = fills.map(fillOf).filter(Boolean) as Paint[];
      const sl = strokes.map((it) => ({ it, stroke: strokeOf(it, strokes.length > 1) })).filter((x) => x.stroke) as { it: Item; stroke: Stroke }[];
      if (fl.length || sl.length) {
        const so = sl[0]?.it.stroke;
        out.push(
          pathNodeOf(name, subs, {
            fill: fl[0] ?? null,
            stroke: sl[0]?.stroke ?? null,
            ...(fl.length > 1 ? { fills: fl.slice(1) } : {}),
            ...(sl.length > 1 ? { strokes: sl.slice(1).map((x) => x.stroke) } : {}),
            fillRule: evenodd ? 'evenodd' : 'nonzero',
            lineCap: capOf(so),
            lineJoin: joinOf(so),
          }),
        );
      }
    } else {
      items.forEach((it, i) => {
        const fp = it.kind === 'fill' ? fillOf(it) : null;
        const sp = it.kind === 'stroke' ? strokeOf(it, false) : null;
        if (!fp && !sp) return;
        out.push(pathNodeOf(`${name} ${it.kind} ${i + 1}`, subs, { fill: fp, stroke: sp, fillRule: evenodd ? 'evenodd' : 'nonzero', lineCap: capOf(it.stroke), lineJoin: joinOf(it.stroke) }));
      });
    }
    return { nodes: out, items };
  }

  private pathKind(n: Rec, m: M6, name: string): SceneNode[] {
    const k = rec(n.kind);
    if (k.guide === true) return [];
    const synth = n.__subs as AbsSub[] | undefined;
    const subs = synth ? synth.map((s) => ({ closed: s.closed, pts: s.pts.map((p) => mapPoint(p, m)) })) : subsOf(k.path, m);
    const { nodes, items } = this.shapeNodes(name, subs, str(k.rule) === 'EvenOdd', n, m);
    return this.decorate(nodes, n, name, items);
  }

  /** A compound path: every path inside, painted as one with the compound's own appearance. */
  private compound(n: Rec, m: M6, name: string): SceneNode[] {
    const k = rec(n.kind);
    const subs: AbsSub[] = [];
    const collect = (list: unknown[]) => {
      for (const c of list) {
        const ck = rec(rec(c).kind);
        if (ck.type === 'path') subs.push(...subsOf(ck.path, m));
        else if (ck.type === 'compound' || ck.type === 'group') collect(arr(ck.children));
      }
    };
    collect(arr(k.children));
    const { nodes, items } = this.shapeNodes(name, subs, str(k.rule) === 'EvenOdd', n, m);
    return this.decorate(nodes, n, name, items);
  }

  // ---- containers

  private children(list: unknown[], m: M6, ctx: Ctx, clip: boolean, name: string, cull: boolean): SceneNode[] {
    let kids: SceneNode[] = [];
    let mask: SceneNode | null = null;
    list.forEach((c, i) => {
      // the clipping path is used for its outline alone: it is usually painted with nothing
      const made = clip && i === 0 ? this.outlineMask(rec(c), m, name) ?? this.node(rec(c), m, { ...ctx, depth: ctx.depth + 1 }) : this.node(rec(c), m, { ...ctx, depth: ctx.depth + 1 });
      if (clip && i === 0) {
        if (!made.length) return;
        mask = made.length === 1 ? made[0] : makeGroup(`${name} (mask)`, made);
        mask.mask = true;
        mask.visible = true;
        mask.opacity = 1;
        return;
      }
      kids.push(...made);
    });
    if (cull && ctx.cull) {
      const box = ctx.cull;
      kids = kids.filter((k) => boxesTouch({ x: k.x, y: k.y, width: k.width, height: k.height }, box, 80 + (k.rotation ? Math.max(k.width, k.height) : 0)));
    }
    return mask && kids.length ? [mask, ...kids] : kids;
  }

  /** The outline of a path or compound path as a mask layer, whatever it is painted with; null for other kinds. */
  private outlineMask(n: Rec, m: M6, name: string): SceneNode[] | null {
    const k = rec(n.kind);
    let subs: AbsSub[] = [];
    if (k.type === 'path') subs = subsOf(k.path, m);
    else if (k.type === 'compound') {
      for (const c of arr(k.children)) {
        const ck = rec(rec(c).kind);
        if (ck.type === 'path') subs.push(...subsOf(ck.path, m));
      }
    } else return null;
    if (!subs.length) return [];
    return [pathNodeOf(`${name} (mask)`, subs, { fill: { type: 'solid', color: '#000000' }, stroke: null, fillRule: str(k.rule) === 'EvenOdd' ? 'evenodd' : 'nonzero' })];
  }

  private group(n: Rec, m: M6, ctx: Ctx, name: string, isLayer: boolean): SceneNode[] {
    const k = rec(n.kind);
    const list = arr(k.type === 'envelope' ? k.content : k.children);
    if (isLayer && k.template === true) {
      this.note('Template layers were imported hidden');
    }
    const kids = this.children(list, m, ctx, k.clip === true, name, isLayer);
    if (!kids.length) return [];
    const g = makeGroup(name, kids);
    if (isLayer && k.template === true) g.visible = false;
    return this.decorate([g], n, name);
  }

  // ---- live objects

  private repeat(n: Rec, m: M6, ctx: Ctx, name: string): SceneNode[] {
    const k = rec(n.kind);
    const kind = rec(k.kind);
    const source = arr(k.source).map(rec);
    const bounds = this.boundsOfNodes(source, IDENT);
    if (!bounds) return [];
    const ts = repeatTransforms(kind, bounds);
    const cap = 600;
    if (ts.length > cap) this.note(`Repeat objects with more than ${cap} copies were cut to ${cap}`);
    const copies: SceneNode[] = [];
    ts.slice(0, cap).forEach((t, i) => {
      const nodes = source.flatMap((s) => this.node(s, mulM(m, t), { ...ctx, depth: ctx.depth + 1 }));
      if (nodes.length) copies.push(nodes.length === 1 ? Object.assign(nodes[0], { name: `${name} ${i + 1}` }) : makeGroup(`${name} ${i + 1}`, nodes));
    });
    if (!copies.length) return [];
    return this.decorate([makeGroup(name, copies)], n, name);
  }

  private blend(n: Rec, m: M6, ctx: Ctx, name: string): SceneNode[] {
    const k = rec(n.kind);
    const keys = arr(k.children).map(rec);
    const spec = rec(k.spec);
    const spacing = rec(spec.spacing);
    if (spec.spine) this.note('Blend objects along a spine were blended in a straight line');
    const out: Rec[] = [];
    for (let i = 0; i < keys.length; i++) {
      out.push(keys[i]);
      const a = keys[i];
      const b = keys[i + 1];
      if (!b) continue;
      const steps = this.blendSteps(a, b, spacing);
      const made = steps > 0 ? lerpPaths(a, b, steps) : null;
      if (made) out.push(...made);
      else if (steps > 0) this.note('Blends between shapes with different points kept only the key objects');
    }
    const nodes = out.flatMap((s) => this.node(s, m, { ...ctx, depth: ctx.depth + 1 }));
    if (!nodes.length) return [];
    return this.decorate([makeGroup(name, nodes)], n, name);
  }

  private blendSteps(a: Rec, b: Rec, spacing: Rec): number {
    if (typeof spacing.steps === 'number') return Math.max(0, Math.min(200, Math.round(spacing.steps)));
    const ba = this.boundsOfNodes([a], IDENT);
    const bb = this.boundsOfNodes([b], IDENT);
    const dist = ba && bb ? Math.hypot(ba.x + ba.width / 2 - (bb.x + bb.width / 2), ba.y + ba.height / 2 - (bb.y + bb.height / 2)) : 0;
    if (typeof spacing.distance === 'number' && spacing.distance > 0) return Math.max(0, Math.min(200, Math.round(dist / spacing.distance) - 1));
    // "smooth colour": about one step for every few levels of colour change, else about one for every few points of distance
    return Math.max(2, Math.min(64, Math.round(Math.max(colorDistance(a, b), dist / 3) / 4)));
  }

  private symbol(n: Rec, m: M6, ctx: Ctx, name: string): SceneNode[] {
    const k = rec(n.kind);
    const art = this.symbols.get(str(k.symbol));
    if (!art || !Object.keys(art).length) {
      this.note('Symbol instances whose symbol is missing were left out');
      return [];
    }
    if (ctx.depth > 40) return [];
    const nodes = this.node(art, mulM(m, parseM(k.xf)), { ...ctx, depth: ctx.depth + 1 });
    return this.decorate(nodes, n, name);
  }

  /** A gradient mesh as flat patches: each cell takes the average colour of its four corners. */
  private mesh(n: Rec, m: M6, name: string): SceneNode[] {
    const k = rec(n.kind);
    const rows = num(k.rows);
    const cols = num(k.cols);
    const pts = arr(k.points).map(rec);
    if (rows < 1 || cols < 1 || pts.length < (rows + 1) * (cols + 1) || rows * cols > 1024) return [];
    this.note('Gradient meshes were approximated by flat patches');
    const at = (r: number, c: number) => pts[r * (cols + 1) + c];
    const patches: SceneNode[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const corners = [at(r, c), at(r, c + 1), at(r + 1, c + 1), at(r + 1, c)];
        const rgb = corners.map((p) => vcColor(p.color, Math.max(0, Math.min(1, num(p.opacity, 1)))));
        const avg: RGBA = { r: 0, g: 0, b: 0, a: 0 };
        for (const v of rgb) {
          avg.r += v.r / 4;
          avg.g += v.g / 4;
          avg.b += v.b / 4;
          avg.a += v.a / 4;
        }
        const sub: AbsSub = { closed: true, pts: corners.map((p) => {
          const pt = readPoint(p.p) ?? { x: 0, y: 0 };
          const q = applyM(m, pt.x, pt.y);
          return { x: q.x, y: q.y };
        }) };
        patches.push(pathNodeOf(`${name} patch ${r * cols + c + 1}`, [sub], { fill: { type: 'solid', color: cssColor(avg) }, stroke: null }));
      }
    }
    return this.decorate([makeGroup(name, patches)], n, name);
  }

  // ---- text

  private text(n: Rec, m: M6, name: string): SceneNode[] {
    const t = rec(n.kind);
    const A = mulM(m, parseM(t.xf));
    const sx = Math.hypot(A[0], A[1]) || 1;
    const sy = Math.hypot(A[2], A[3]) || 1;
    const rot = (Math.atan2(A[1], A[0]) * 180) / Math.PI;
    if (detM(A) < 0) this.note('Mirrored text was imported unmirrored');
    if (t.vertical === true) this.note('Vertical text was imported horizontally');
    const where = rec(t.kind);
    const kind = str(where.kind, 'point');
    if (kind === 'onpath') this.note('Type on a path was imported as straight text');
    const pieces: TextPiece[] = [];
    let first: Rec | null = null;
    for (const r of arr(t.runs).map(rec)) {
      const text = str(r.text).replace(/\r\n?/g, '\n').replace(/￼/g, '');
      if (!text) continue;
      const st = rec(r.style);
      first ??= st;
      if (num(st.baseline_shift) || (num(st.h_scale, 100) !== 100) || (num(st.v_scale, 100) !== 100)) this.note('Baseline shift and horizontal or vertical scaling of text were not applied');
      const size = Math.max(1, round(num(st.size, 12) * sy, 100));
      const face = this.fonts.face(str(st.font_family, 'sans-serif'), str(st.font_style, 'Regular'));
      const fill = rec(st.fill);
      let color = 'rgba(0, 0, 0, 0)';
      if (fill.type === 'solid') color = cssColor(vcColor(fill.color));
      else if (fill.type === 'gradient') {
        const s0 = rec(arr(rec(fill.gradient).stops)[0]);
        color = cssColor(vcColor(s0.color));
      }
      pieces.push({
        text,
        family: face.family,
        weight: face.weight,
        italic: face.italic,
        size,
        color,
        spacing: round((num(st.tracking) / 1000) * size, 100),
        underline: st.underline === true,
        strike: st.strikethrough === true,
      });
    }
    if (!pieces.length || !first) return [];
    const j = str(rec(t.para).justify, 'Left');
    const align: TextNode['align'] = j === 'Center' || j === 'JustifyCenter' ? 'center' : j === 'Right' || j === 'JustifyRight' ? 'right' : j === 'JustifyAll' ? 'justify' : 'left';
    const lead = first.leading;
    const lineHeight = typeof lead === 'number' && lead > 0 ? Math.max(0.5, lead / Math.max(1, num(first.size, 12))) : 1.2;
    const o = applyM(A, 0, 0);
    let box: { l: number; t: number; w: number; h: number } | undefined;
    if (kind === 'area') {
      const b = absBounds(subsOf(where.frame, IDENT));
      if (b.width > 0 && b.height > 0) box = { l: b.x * sx, t: b.y * sy, w: b.width * sx, h: b.height * sy };
    }
    const node = buildTextNode({
      name: name || pieces.map((p) => p.text).join('').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Text',
      pieces,
      align,
      lineHeight,
      upper: first.all_caps === true,
      origin: o,
      rotation: rot,
      box,
    });
    return this.decorate([node], n, node.name);
  }

  // ---- pictures

  private assetFor(key: string): string | null {
    if (this.assetByKey.has(key)) return this.assetByKey.get(key) ?? null;
    const img = this.file.images.get(key);
    if (!img) {
      this.assetByKey.set(key, null);
      return null;
    }
    const id = assetId();
    const mime = /^image\//.test(img.mime) ? img.mime : 'image/png';
    const ext = mime === 'image/jpeg' ? 'jpg' : mime.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
    this.assets.push({ id, name: `Image ${++this.imageCount}.${ext}`, mime, bytes: img.bytes });
    if (img.proxy) this.note('Linked pictures are shown at the preview resolution saved in the file');
    this.assetByKey.set(key, id);
    return id;
  }

  private image(n: Rec, m: M6, name: string): SceneNode[] {
    const k = rec(n.kind);
    const key = str(k.key);
    const id = this.assetFor(key);
    if (!id) {
      this.note('Linked pictures that are not saved in the file were left out');
      return [];
    }
    const w = Math.max(1, num(k.width, 1));
    const h = Math.max(1, num(k.height, 1));
    const A = mulM(m, parseM(k.xf));
    const sx = Math.hypot(A[0], A[1]);
    const sy = Math.hypot(A[2], A[3]);
    if (Math.abs(A[0] * A[2] + A[1] * A[3]) > 1e-3 * sx * sy) this.note('Skewed pictures were imported unskewed');
    const o = applyM(A, 0, 0);
    const flip = detM(A) < 0;
    const node = createNode('image', {
      name: name || key || 'Image',
      assetId: id,
      x: round(o.x, 100),
      y: round(o.y, 100),
      width: round(w * sx, 100),
      height: round(h * sy, 100),
      fit: 'fill',
      originX: 0,
      originY: 0,
      rotation: round((Math.atan2(A[1], A[0]) * 180) / Math.PI, 100),
      ...(flip ? { scaleY: -1 } : {}),
    });
    return this.decorate([node], n, node.name);
  }

  // ---- the walk

  node(n: Rec, m: M6, ctx: Ctx): SceneNode[] {
    if (++this.count > MAX_NODES || ctx.depth > 200) return [];
    const k = rec(n.kind);
    const type = str(k.type);
    const given = typeof n.name === 'string' && n.name ? n.name : '';
    switch (type) {
      case 'layer':
        return this.group(n, m, ctx, given || 'Layer', true);
      case 'group':
        return this.group(n, m, ctx, given || (k.clip === true ? 'Clip group' : 'Group'), false);
      case 'intertwine':
        return this.group(n, m, ctx, given || 'Group', false);
      case 'envelope':
        this.note('Envelope distortions were not applied (the art is kept undistorted)');
        return this.group(n, m, ctx, given || 'Envelope', false);
      case 'path':
        return this.pathKind(n, m, given || 'Path');
      case 'compound':
        return this.compound(n, m, given || 'Compound path');
      case 'text':
        return this.text(n, m, given);
      case 'image':
        return this.image(n, m, given);
      case 'symbolinstance':
        return this.symbol(n, m, ctx, given || 'Symbol');
      case 'repeat':
        return this.repeat(n, m, ctx, given || 'Repeat');
      case 'blend':
        return this.blend(n, m, ctx, given || 'Blend');
      case 'mesh':
        return this.mesh(n, m, given || 'Gradient mesh');
      case 'placeddocument':
        this.note('Placed documents were left out');
        return [];
      default:
        if (type) this.note(`Objects of an unknown kind were left out (${type})`);
        return [];
    }
  }

  /** Bounds of a list of objects in final coordinates `m` (paths exactly, pictures by their corners, text roughly). */
  boundsOfNodes(list: Rec[], m: M6, depth = 0): Box | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const add = (x: number, y: number) => {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    };
    const visit = (n: Rec, d: number) => {
      if (d > 60) return;
      const k = rec(n.kind);
      switch (str(k.type)) {
        case 'path': {
          const synth = n.__subs as AbsSub[] | undefined;
          const subs = synth ? synth.map((s) => ({ closed: s.closed, pts: s.pts.map((p) => mapPoint(p, m)) })) : subsOf(k.path, m);
          if (subs.length) {
            const b = absBounds(subs);
            add(b.x, b.y);
            add(b.x + b.width, b.y + b.height);
          }
          break;
        }
        case 'image': {
          const A = mulM(m, parseM(k.xf));
          for (const [x, y] of [[0, 0], [num(k.width), 0], [num(k.width), num(k.height)], [0, num(k.height)]]) {
            const p = applyM(A, x, y);
            add(p.x, p.y);
          }
          break;
        }
        case 'text': {
          const A = mulM(m, parseM(k.xf));
          const text = arr(k.runs).map((r) => str(rec(r).text)).join('');
          const size = num(rec(rec(arr(k.runs)[0]).style).size, 12);
          const o = applyM(A, 0, 0);
          add(o.x, o.y - size);
          add(o.x + text.length * size * 0.5, o.y + size * 0.25);
          break;
        }
        case 'repeat':
          for (const s of arr(k.source)) visit(rec(s), d + 1);
          break;
        case 'envelope':
          for (const s of arr(k.content)) visit(rec(s), d + 1);
          break;
        default:
          for (const s of arr(k.children)) visit(rec(s), d + 1);
      }
    };
    for (const n of list) visit(n, depth);
    return x0 === Infinity ? null : { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
}

function mapPoint(p: AbsSub['pts'][number], m: M6): AbsSub['pts'][number] {
  const q = applyM(m, p.x, p.y);
  const out: AbsSub['pts'][number] = { x: q.x, y: q.y };
  if (p.inX !== undefined) {
    const h = applyM(m, p.inX, p.inY ?? p.y);
    out.inX = h.x;
    out.inY = h.y;
  }
  if (p.outX !== undefined) {
    const h = applyM(m, p.outX, p.outY ?? p.y);
    out.outX = h.x;
    out.outY = h.y;
  }
  return out;
}

// ---------------------------------------------------------------- repeat and blend

const reflectAbout = (c: { x: number; y: number }, deg: number): M6 => {
  const t = (2 * deg * Math.PI) / 180;
  const s2 = Math.sin(t);
  const c2 = Math.cos(t);
  return mulM(translateM(c.x, c.y), mulM([c2, s2, s2, -c2, 0, 0], translateM(-c.x, -c.y)));
};

/** Where the copies of a Repeat object go (source space to document), in paint order. */
export function repeatTransforms(kind: Rec, b: Box): M6[] {
  const type = str(kind.type);
  const point = (v: unknown) => readPoint(v) ?? { x: 0, y: 0 };
  if (type === 'radial') {
    const n = Math.max(1, Math.min(1000, Math.round(num(kind.instances, 1))));
    const center = point(kind.center);
    const radius = Math.max(0, num(kind.radius));
    const c0 = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    let dx = c0.x - center.x;
    let dy = c0.y - center.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) [dx, dy] = [0, -1];
    else [dx, dy] = [dx / len, dy / len];
    const pre = translateM(center.x + dx * radius - c0.x, center.y + dy * radius - c0.y);
    const start = num(kind.startAngle);
    const sweep = num(kind.endAngle, 360) - start;
    const full = Math.abs(Math.abs(sweep) - 360) < 1e-9;
    const step = full || n === 1 ? sweep / n : sweep / (n - 1);
    const out = Array.from({ length: n }, (_, i) => mulM(translateM(center.x, center.y), mulM(rotateM(((start + step * i) * Math.PI) / 180), mulM(translateM(-center.x, -center.y), pre))));
    return kind.reverseOverlap === true ? out.reverse() : out;
  }
  if (type === 'grid') {
    const w = Math.max(1e-3, b.width + num(kind.hSpacing));
    const h = Math.max(1e-3, b.height + num(kind.vSpacing));
    const rows = Math.max(1, Math.min(500, Math.round(num(kind.rows, 3))));
    const cols = Math.max(1, Math.min(500, Math.round(num(kind.cols, 3))));
    const tt = rec(kind.gridType);
    const frac = (v: number) => v - Math.floor(v);
    const off = num(tt.offset, 0.5);
    const out: M6[] = [];
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        let ox = i * w;
        let oy = j * h;
        switch (str(tt.type, 'grid')) {
          case 'brickByRow':
            ox += frac(j * off) * w;
            break;
          case 'brickByColumn':
            oy += frac(i * off) * h;
            break;
          case 'hexByColumn':
            ox = i * w * 0.75;
            oy = j * h + (i % 2 === 1 ? h / 2 : 0);
            break;
          case 'hexByRow':
            ox = i * w + (j % 2 === 1 ? w / 2 : 0);
            oy = j * h * 0.75;
            break;
        }
        let flip: M6 = IDENT;
        if (kind.flipCols === true && i % 2 === 1) flip = mulM(reflectAbout(c, 90), flip);
        if (kind.flipRows === true && j % 2 === 1) flip = mulM(reflectAbout(c, 0), flip);
        out.push(mulM(translateM(ox, oy), flip));
      }
    }
    return out;
  }
  if (type === 'mirror') return [IDENT, reflectAbout(point(kind.center), num(kind.angle))];
  return [IDENT];
}

/** How far apart two shapes' colours are, 0-255 (the larger of the fill and stroke differences). */
function colorDistance(a: Rec, b: Rec): number {
  const solid = (n: Rec, kind: string): RGBA | null => {
    for (const it of arr(rec(n.appearance).items).map(rec).reverse()) if (it.kind === kind && rec(it.paint).type === 'solid') return vcColor(rec(it.paint).color);
    return null;
  };
  let d = 0;
  for (const kind of ['fill', 'stroke']) {
    const x = solid(a, kind);
    const y = solid(b, kind);
    if (x && y) d = Math.max(d, Math.abs(x.r - y.r), Math.abs(x.g - y.g), Math.abs(x.b - y.b));
  }
  return d;
}

const sameShape = (a: AbsSub[], b: AbsSub[]): boolean => a.length === b.length && a.length > 0 && a.every((s, i) => s.pts.length === b[i].pts.length && s.closed === b[i].closed);

/** The in-between shapes of a blend, as synthetic path objects; null when the two paths don't have the same points. */
function lerpPaths(a: Rec, b: Rec, steps: number): Rec[] | null {
  const ka = rec(a.kind);
  const kb = rec(b.kind);
  if (ka.type !== 'path' || kb.type !== 'path') return null;
  const read = (k: Rec): AbsSub[] => {
    return subsOf(k.path, IDENT);
  };
  const sa = read(ka);
  const sb = read(kb);
  if (!sameShape(sa, sb)) return null;
  const out: Rec[] = [];
  const mix = (x: number, y: number, t: number) => x + (y - x) * t;
  for (let s = 1; s <= steps; s++) {
    const t = s / (steps + 1);
    const subs: AbsSub[] = sa.map((su, i) => ({
      closed: su.closed,
      pts: su.pts.map((p, j) => {
        const q = sb[i].pts[j];
        const o: AbsSub['pts'][number] = { x: mix(p.x, q.x, t), y: mix(p.y, q.y, t) };
        if (p.inX !== undefined || q.inX !== undefined) {
          o.inX = mix(p.inX ?? p.x, q.inX ?? q.x, t);
          o.inY = mix(p.inY ?? p.y, q.inY ?? q.y, t);
        }
        if (p.outX !== undefined || q.outX !== undefined) {
          o.outX = mix(p.outX ?? p.x, q.outX ?? q.x, t);
          o.outY = mix(p.outY ?? p.y, q.outY ?? q.y, t);
        }
        return o;
      }),
    }));
    const ia = arr(rec(a.appearance).items).map(rec);
    const ib = arr(rec(b.appearance).items).map(rec);
    const items = ia.map((it, i) => {
      const other = ib[i];
      if (!other || other.kind !== it.kind) return it;
      const pa = rec(it.paint);
      const pb = rec(other.paint);
      const res: Rec = { ...it };
      if (pa.type === 'solid' && pb.type === 'solid') {
        const c = mixRgba(vcColor(pa.color), vcColor(pb.color), t);
        res.paint = { type: 'solid', color: { model: 'rgb', r: c.r / 255, g: c.g / 255, b: c.b / 255 } };
      }
      if (it.kind === 'stroke') res.width = mix(num(it.width), num(other.width), t);
      res.opacity = mix(num(it.opacity, 1), num(other.opacity, 1), t);
      return res;
    });
    out.push({ name: '', opacity: mix(num(a.opacity, 1), num(b.opacity, 1), t), appearance: { items }, kind: { type: 'path', rule: ka.rule }, __subs: subs });
  }
  return out;
}

// ---------------------------------------------------------------- entry points

/** Turn a `.vectorcraft` file into artboards of layers. */
export function importVectorCraft(bytes: Uint8Array, baseName: string): VectorCraftImport {
  const file = parseVectorCraft(bytes);
  const doc = file.document;
  const imp = new Importer(file);
  const abs = arr(doc.artboards).map(rec);
  const layers = arr(doc.layers).map(rec);
  if (!layers.length) throw new Error('This VectorCraft file has no artwork to import');
  // a file without artboards: one that covers the artwork
  const all = abs.length ? null : imp.boundsOfNodes(layers, IDENT);
  const boards: Rec[] = abs.length ? abs : [{ name: baseName, rect: { x0: all?.x ?? 0, y0: all?.y ?? 0, x1: (all?.x ?? 0) + (all?.width || 800), y1: (all?.y ?? 0) + (all?.height || 600) } }];
  const artboards: Artboard[] = [];
  for (const ab of boards) {
    const r = rec(ab.rect);
    const x0 = num(r.x0);
    const y0 = num(r.y0);
    const width = Math.max(1, num(r.x1) - x0);
    const height = Math.max(1, num(r.y1) - y0);
    const m = translateM(-x0, -y0);
    const cull = boards.length > 1 ? { x: 0, y: 0, width, height } : null;
    const children = layers.flatMap((l) => imp.node(l, m, { cull, depth: 0 }));
    const bg = ab.color ? vcColor(ab.color) : null;
    const name = boards.length > 1 ? `${baseName} - ${str(ab.name, `Artboard ${artboards.length + 1}`)}` : baseName;
    artboards.push(createArtboard({ name: name || 'VectorCraft import', width: round(width, 100), height: round(height, 100), background: bg ? { type: 'solid', color: cssColor(bg) } : null, children }));
  }
  if (!artboards.some((a) => a.children.length)) throw new Error('This VectorCraft file has no artwork to import');
  if (file.version < VECTORCRAFT_VERSION && file.format === 'drawcraft') imp.warnings.add('This is an older DrawCraft file');
  return { artboard: artboards[0], artboards, assets: imp.assets, fonts: imp.fonts.refs(), warnings: imp.report() };
}

