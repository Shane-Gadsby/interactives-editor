/**
 * Lottie (Bodymovin JSON) -> Interactives artboard.
 *
 * Covers the 2D core: shape layers (groups, rectangles, ellipses, paths, stars
 * and polygons, solid and gradient fills, strokes, group transforms), solid,
 * null, image, text and precomp layers, parenting, in/out points, and
 * keyframed transforms, opacity, colours and rect/ellipse sizes, with their
 * bezier easing. Everything it can't represent is listed in `warnings`.
 */
import { shiftedPaint } from './gradient-space';
import {
  createArtboard,
  createNode,
  uid,
  fillPath,
  paintOrderField,
  strokePath,
  type Artboard,
  type Easing,
  type Keyframe,
  type Paint,
  type PaintKind,
  type PathPoint,
  type SceneNode,
  type Stroke,
  type SubPath,
  type TextModifier,
  type Timeline,
  type Track,
} from 'interactives-player';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface ImportedAsset {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface LottieImport {
  artboard: Artboard;
  assets: ImportedAsset[];
  warnings: string[];
}

export function isLottie(json: Json): boolean {
  return !!json && typeof json === 'object' && Array.isArray(json.layers) && typeof json.fr === 'number' && typeof json.w === 'number';
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;

function toHex(c: number[], alpha = 1): string {
  const ch = (i: number, d: number) => {
    const v = Number(Array.isArray(c) ? c[i] : undefined);
    return Number.isFinite(v) ? v : d;
  };
  const [r, g, b] = [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(1, ch(i, 0))) * 255));
  const a = Math.max(0, Math.min(1, ch(3, 1) * (Number.isFinite(alpha) ? alpha : 1)));
  const hex = '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return a >= 1 ? hex : hex + Math.round(a * 255).toString(16).padStart(2, '0');
}

interface Ctx {
  fr: number;
  ip: number;
  op: number;
  tracks: Track[];
  warnings: Set<string>;
  assets: ImportedAsset[];
  assetIds: Map<string, string>;
  comps: Map<string, Json>;
  depth: number;
}

// ---------------------------------------------------------------- animated values

interface Key {
  t: number; // frame
  v: number[];
  ease: Easing;
}

const num = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number) : [Number(v)]);

/** Keyframes of a Lottie property (or a single static value). */
function keysOf(prop: Json): Key[] | null {
  if (!prop || typeof prop !== 'object') return null;
  const animated = prop.a === 1 || (Array.isArray(prop.k) && prop.k.length && typeof prop.k[0] === 'object' && 't' in prop.k[0]);
  if (!animated) return [{ t: 0, v: num(prop.k), ease: 'linear' }];
  const out: Key[] = [];
  const ks = prop.k as Json[];
  for (let i = 0; i < ks.length; i++) {
    const k = ks[i];
    const prev = ks[i - 1];
    const v = k.s !== undefined ? num(k.s) : prev?.e !== undefined ? num(prev.e) : out[out.length - 1]?.v;
    if (!v) continue;
    let ease: Easing = 'linear';
    if (k.h === 1) ease = 'step';
    else if (k.o && k.i) {
      const f = (a: Json) => (Array.isArray(a) ? Number(a[0]) : Number(a));
      ease = [r2(f(k.o.x)), r2(f(k.o.y)), r2(f(k.i.x)), r2(f(k.i.y))];
    }
    out.push({ t: Number(k.t), v, ease });
  }
  return out.length ? out : null;
}

function first(prop: Json, fallback: number[]): number[] {
  return keysOf(prop)?.[0]?.v ?? fallback;
}

function isAnimated(keys: Key[] | null): boolean {
  return !!keys && keys.length > 1;
}

function ms(ctx: Ctx, frame: number): number {
  return Math.max(0, Math.round(((frame - ctx.ip) / ctx.fr) * 1000));
}

function addTrack(ctx: Ctx, nodeId: string, prop: string, keys: Key[], map: (v: number[]) => Keyframe['value']): void {
  if (!isAnimated(keys)) return;
  const track: Track = {
    id: uid('tr'),
    nodeId,
    prop,
    keys: keys.map((k) => ({ id: uid('k'), t: ms(ctx, k.t), value: map(k.v), ease: k.ease })),
  };
  // Keys at the same ms collapse to the last one
  track.keys = track.keys.filter((k, i, a) => i === a.length - 1 || a[i + 1].t !== k.t);
  ctx.tracks.push(track);
}

/** Position may be split into separate x/y properties. */
function positionKeys(ks: Json): { x: Key[] | null; y: Key[] | null } {
  if (ks?.p?.s) return { x: keysOf(ks.p.x), y: keysOf(ks.p.y) };
  const k = keysOf(ks?.p);
  if (!k) return { x: null, y: null };
  return { x: k.map((q) => ({ ...q, v: [q.v[0]] })), y: k.map((q) => ({ ...q, v: [q.v[1] ?? 0] })) };
}

/**
 * Apply a Lottie transform (anchor a, position p, scale s, rotation r, opacity o)
 * to a node of size w x h: our transform origin is placed on the anchor.
 */
function applyTransform(ctx: Ctx, node: SceneNode, ks: Json, w: number, h: number): void {
  const a = first(ks?.a, [0, 0]);
  const pos = positionKeys(ks);
  const px = pos.x?.[0]?.v[0] ?? 0;
  const py = pos.y?.[0]?.v[0] ?? 0;
  const s = first(ks?.s, [100, 100]);
  const r = first(ks?.r ?? ks?.rz, [0]);
  const o = first(ks?.o, [100]);
  node.width = Math.max(1, w);
  node.height = Math.max(1, h);
  node.originX = r2(a[0] / node.width);
  node.originY = r2(a[1] / node.height);
  node.x = r2(px - a[0]);
  node.y = r2(py - a[1]);
  node.scaleX = r2(s[0] / 100);
  node.scaleY = r2((s[1] ?? s[0]) / 100);
  node.rotation = r2(r[0]);
  node.opacity = r2(Math.max(0, Math.min(1, o[0] / 100)));
  if (isAnimated(keysOf(ks?.a))) ctx.warnings.add('Animated anchor points are imported at their first value');
  if (pos.x) addTrack(ctx, node.id, 'x', pos.x, (v) => r2(v[0] - a[0]));
  if (pos.y) addTrack(ctx, node.id, 'y', pos.y, (v) => r2(v[0] - a[1]));
  const sk = keysOf(ks?.s);
  if (sk) {
    addTrack(ctx, node.id, 'scaleX', sk, (v) => r2(v[0] / 100));
    addTrack(ctx, node.id, 'scaleY', sk, (v) => r2((v[1] ?? v[0]) / 100));
  }
  const rk = keysOf(ks?.r ?? ks?.rz);
  if (rk) addTrack(ctx, node.id, 'rotation', rk, (v) => r2(v[0]));
  const ok = keysOf(ks?.o);
  if (ok) addTrack(ctx, node.id, 'opacity', ok, (v) => r2(Math.max(0, Math.min(1, v[0] / 100))));
  if (ks?.sk && first(ks.sk, [0])[0]) ctx.warnings.add('Skew is not supported and was dropped');
}

// ---------------------------------------------------------------- shapes

/** A group's fills and strokes, bottom to top (a Lottie group lists them front-most first). */
interface Style {
  fills: { paint: Paint; keys?: Key[] | null }[];
  strokes: { stroke: Stroke; keys?: Key[] | null }[];
  /** Fills and strokes interleaved, bottom to top (see ShapeStyle.paintOrder). */
  order: PaintKind[];
}

const LOTTIE_CAP = [undefined, 'butt', 'round', 'square'] as const;
const LOTTIE_JOIN = [undefined, 'miter', 'round', 'bevel'] as const;

function gradientPaint(item: Json): Paint {
  const n = Number(item.g?.p ?? 0);
  const raw = first(item.g?.k, []);
  const stops = [];
  for (let i = 0; i < n; i++) {
    const [off, r, g, b] = raw.slice(i * 4, i * 4 + 4);
    stops.push({ offset: r2(off ?? 0), color: toHex([r ?? 0, g ?? 0, b ?? 0]) });
  }
  if (!stops.length) stops.push({ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' });
  const sp = first(item.s, [0, 0]);
  const ep = first(item.e, [1, 0]);
  // The points are in the group's space; withStyle moves them into each layer's box
  if (item.t === 2) return { type: 'radial', stops, center: { x: r2(sp[0]), y: r2(sp[1]) }, radius: Math.max(0.01, r2(Math.hypot(ep[0] - sp[0], ep[1] - sp[1]))) };
  const angle = (Math.atan2(ep[1] - sp[1], ep[0] - sp[0]) * 180) / Math.PI + 90;
  return { type: 'linear', angle: r2(angle), stops, from: { x: r2(sp[0]), y: r2(sp[1]) }, to: { x: r2(ep[0]), y: r2(ep[1]) } };
}

function styleOf(ctx: Ctx, items: Json[]): Style {
  const fills: Style['fills'] = [];
  const strokes: Style['strokes'] = [];
  const order: PaintKind[] = [];
  for (const it of items) {
    if (it.hd) continue;
    const o = first(it.o, [100])[0] / 100;
    if (it.ty === 'fl' || it.ty === 'gf') {
      // Gradients keep their own opacity as the paint's; a solid colour carries it in its alpha
      const paint: Paint = it.ty === 'fl' ? { type: 'solid', color: toHex(first(it.c, [0, 0, 0]), o) } : { ...gradientPaint(it), ...(o < 1 ? { opacity: r2(o) } : {}) };
      const ck = it.ty === 'fl' ? keysOf(it.c) : null;
      fills.push({ paint, keys: isAnimated(ck) ? ck!.map((k) => ({ ...k, v: [...k.v, o] })) : null });
      order.push('fill');
    } else if (it.ty === 'st' || it.ty === 'gs') {
      order.push('stroke');
      const paint: Paint = it.ty === 'gs' ? { ...gradientPaint(it), ...(o < 1 ? { opacity: r2(o) } : {}) } : { type: 'solid', color: toHex(first(it.c, [0, 0, 0]), o) };
      const stroke: Stroke = { paint, width: r2(first(it.w, [1])[0]) };
      const cap = LOTTIE_CAP[Number(it.lc)];
      const join = LOTTIE_JOIN[Number(it.lj)];
      if (cap) stroke.cap = cap;
      if (join) stroke.join = join;
      const ck = it.ty === 'st' ? keysOf(it.c) : null;
      strokes.push({ stroke, keys: isAnimated(ck) ? ck!.map((k) => ({ ...k, v: [...k.v, o] })) : null });
    } else if (['tm', 'rp', 'mm', 'rd', 'pb', 'tw', 'op', 'zz'].includes(it.ty)) {
      ctx.warnings.add(`Shape modifier "${it.nm ?? it.ty}" (${it.ty}) is not supported and was skipped`);
    }
  }
  // Lottie lists the front-most first; the layers go back to front
  fills.reverse();
  strokes.reverse();
  order.reverse();
  // A single stroke keeps the round caps and joins a path layer has always had here; with several, each keeps its own
  if (strokes.length === 1 && strokes[0].stroke.cap === 'round' && strokes[0].stroke.join === 'round') {
    delete strokes[0].stroke.cap;
    delete strokes[0].stroke.join;
  }
  return { fills, strokes, order };
}

function withStyle(ctx: Ctx, node: SceneNode, style: Style): void {
  const n = node as SceneNode & { fill: Paint | null; stroke: Stroke | null; fills?: Paint[]; strokes?: Stroke[]; paintOrder?: PaintKind[] };
  // A gradient's points are in the group's space, the layer's box starts at its x/y in it
  const at = { x: node.x, y: node.y };
  const inBox = (st: Stroke): Stroke => ({ ...st, paint: shiftedPaint(st.paint, at) });
  n.fill = style.fills[0] ? shiftedPaint(style.fills[0].paint, at) : null;
  n.stroke = style.strokes[0] ? inBox(style.strokes[0].stroke) : null;
  if (style.fills.length > 1) n.fills = style.fills.slice(1).map((f) => shiftedPaint(f.paint, at));
  if (style.strokes.length > 1) n.strokes = style.strokes.slice(1).map((s) => inBox(s.stroke));
  // A stroke under a fill, or a fill between strokes, keeps its place
  Object.assign(n, paintOrderField(style.order));
  const color = (v: number[]) => toHex(v.slice(0, 3), v[v.length - 1]);
  style.fills.forEach((f, i) => f.keys && addTrack(ctx, node.id, `${fillPath(i)}.color`, f.keys, color));
  style.strokes.forEach((s, i) => s.keys && addTrack(ctx, node.id, `${strokePath(i)}.paint.color`, s.keys, color));
}

function subPath(shape: Json): SubPath | null {
  const v = shape?.v as number[][] | undefined;
  if (!v?.length) return null;
  const i = (shape.i ?? []) as number[][];
  const o = (shape.o ?? []) as number[][];
  const pt = (k: number): PathPoint => {
    const inT = i[k] && (i[k][0] || i[k][1]) ? { x: r2(i[k][0]), y: r2(i[k][1]) } : null;
    const outT = o[k] && (o[k][0] || o[k][1]) ? { x: r2(o[k][0]), y: r2(o[k][1]) } : null;
    return { x: r2(v[k][0]), y: r2(v[k][1]), in: inT, out: outT };
  };
  return { points: v.map((_, k) => pt(k)), closed: !!shape.c };
}

/** Build a group's children from Lottie shape items (bottom of the list is drawn first). */
function shapeItems(ctx: Ctx, items: Json[]): SceneNode[] {
  const style = styleOf(ctx, items);
  const out: SceneNode[] = [];
  const paths: SubPath[] = [];
  // Lottie lists front-most first; our children go back to front.
  for (const it of [...items].reverse()) {
    if (it.hd) continue;
    switch (it.ty) {
      case 'gr': {
        const inner = (it.it ?? []) as Json[];
        const tr = inner.find((x) => x.ty === 'tr');
        const g = createNode('group', { name: it.nm || 'Group' });
        g.children = shapeItems(ctx, inner.filter((x) => x.ty !== 'tr'));
        applyTransform(ctx, g, tr, 1, 1);
        out.push(g);
        break;
      }
      case 'rc': {
        const p = first(it.p, [0, 0]);
        const s = first(it.s, [100, 100]);
        const n = createNode('rect', { name: it.nm || 'Rectangle', x: r2(p[0] - s[0] / 2), y: r2(p[1] - s[1] / 2), width: r2(s[0]), height: r2(s[1]), cornerRadius: r2(first(it.r, [0])[0]) });
        withStyle(ctx, n, style);
        const sk = keysOf(it.s);
        const pk = keysOf(it.p);
        if (isAnimated(sk) || isAnimated(pk)) sizeTracks(ctx, n.id, pk, sk);
        out.push(n);
        break;
      }
      case 'el': {
        const p = first(it.p, [0, 0]);
        const s = first(it.s, [100, 100]);
        const n = createNode('ellipse', { name: it.nm || 'Ellipse', x: r2(p[0] - s[0] / 2), y: r2(p[1] - s[1] / 2), width: r2(s[0]), height: r2(s[1]) });
        withStyle(ctx, n, style);
        const sk = keysOf(it.s);
        const pk = keysOf(it.p);
        if (isAnimated(sk) || isAnimated(pk)) sizeTracks(ctx, n.id, pk, sk);
        out.push(n);
        break;
      }
      case 'sr': {
        const p = first(it.p, [0, 0]);
        const or = first(it.or, [50])[0];
        const ir = first(it.ir, [25])[0];
        const pts = Math.round(first(it.pt, [5])[0]);
        const base = { name: it.nm || 'Star', x: r2(p[0] - or), y: r2(p[1] - or), width: r2(or * 2), height: r2(or * 2), rotation: r2(first(it.r, [0])[0]) };
        const n = it.sy === 2 ? createNode('polygon', { ...base, name: it.nm || 'Polygon', sides: pts }) : createNode('star', { ...base, points: pts, innerRatio: r2(ir / (or || 1)) });
        withStyle(ctx, n, style);
        out.push(n);
        break;
      }
      case 'sh': {
        const keys = it.ks?.a === 1 ? (it.ks.k as Json[]) : null;
        const shape = keys ? (keys[0]?.s?.[0] ?? keys[0]?.s) : it.ks?.k;
        if (keys) ctx.warnings.add('Shape morphing (animated paths) is imported at the first frame');
        const sp = subPath(shape);
        if (sp) paths.push(sp);
        break;
      }
      default:
        break;
    }
  }
  if (paths.length) {
    // All paths of a group share its fill/stroke, as one compound path.
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sp of paths)
      for (const p of sp.points) {
        for (const [x, y] of [
          [p.x, p.y],
          [p.x + (p.in?.x ?? 0), p.y + (p.in?.y ?? 0)],
          [p.x + (p.out?.x ?? 0), p.y + (p.out?.y ?? 0)],
        ]) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    const n = createNode('path', {
      name: 'Path',
      x: r2(minX),
      y: r2(minY),
      width: Math.max(1, r2(maxX - minX)),
      height: Math.max(1, r2(maxY - minY)),
      paths: paths.map((sp) => ({ closed: sp.closed, points: sp.points.map((p) => ({ ...p, x: r2(p.x - minX), y: r2(p.y - minY) })) })),
      fillRule: 'nonzero',
      lineCap: 'round',
      lineJoin: 'round',
    });
    withStyle(ctx, n, style);
    // Paths sit under the primitives listed above them in Lottie order
    out.unshift(n);
  }
  return out;
}

/** Rect/ellipse animated by centre position and size. */
function sizeTracks(ctx: Ctx, id: string, pk: Key[] | null, sk: Key[] | null): void {
  const times = [...new Set([...(pk ?? []), ...(sk ?? [])].map((k) => k.t))].sort((a, b) => a - b);
  const at = (keys: Key[] | null, t: number, fallback: number[]) => {
    if (!keys?.length) return fallback;
    let k = keys[0];
    for (const q of keys) if (q.t <= t) k = q;
    return k.v;
  };
  const easeAt = (t: number): Easing => [...(sk ?? []), ...(pk ?? [])].find((k) => k.t === t)?.ease ?? 'linear';
  const p0 = pk?.[0]?.v ?? [0, 0];
  const s0 = sk?.[0]?.v ?? [100, 100];
  const keys = times.map((t) => {
    const p = at(pk, t, p0);
    const s = at(sk, t, s0);
    return { t, ease: easeAt(t), x: p[0] - s[0] / 2, y: p[1] - s[1] / 2, w: s[0], h: s[1] };
  });
  const mk = (prop: string, pick: (k: (typeof keys)[number]) => number): void =>
    addTrack(
      ctx,
      id,
      prop,
      keys.map((k) => ({ t: k.t, v: [pick(k)], ease: k.ease })),
      (v) => r2(v[0]),
    );
  mk('x', (k) => k.x);
  mk('y', (k) => k.y);
  mk('width', (k) => k.w);
  mk('height', (k) => k.h);
}

// ---------------------------------------------------------------- layers

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function imageAsset(ctx: Ctx, refId: string, json: Json): string | null {
  if (ctx.assetIds.has(refId)) return ctx.assetIds.get(refId)!;
  const a = (json.assets ?? []).find((x: Json) => x.id === refId);
  const p = String(a?.p ?? '');
  const m = /^data:([^;]+);base64,(.*)$/.exec(p);
  if (!m) {
    ctx.warnings.add(`Image "${a?.p ?? refId}" is not embedded in the file and was skipped (export the Lottie with images included)`);
    return null;
  }
  const id = uid('as');
  ctx.assets.push({ id, name: a.id ? `${a.id}.${m[1].split('/')[1] ?? 'png'}` : 'image', mime: m[1], bytes: base64ToBytes(m[2]) });
  ctx.assetIds.set(refId, id);
  return id;
}

function layerNode(ctx: Ctx, L: Json, json: Json, compW: number, compH: number): SceneNode | null {
  const name = L.nm || 'Layer';
  let content: SceneNode[] = [];
  let w = compW;
  let h = compH;
  switch (L.ty) {
    case 4:
      content = shapeItems(ctx, L.shapes ?? []);
      break;
    case 1:
      w = Number(L.sw ?? compW);
      h = Number(L.sh ?? compH);
      content = [createNode('rect', { name: 'Solid', width: w, height: h, fill: { type: 'solid', color: String(L.sc ?? '#000000') } })];
      break;
    case 2: {
      const a = (json.assets ?? []).find((x: Json) => x.id === L.refId);
      w = Number(a?.w ?? 100);
      h = Number(a?.h ?? 100);
      const assetId = imageAsset(ctx, L.refId, json);
      if (assetId) content = [createNode('image', { name, assetId, width: w, height: h, fit: 'fill' })];
      break;
    }
    case 5: {
      const d = L.t?.d?.k?.[0]?.s;
      if (d) {
        const size = Number(d.s ?? 24);
        const lines = String(d.t ?? '').split(/\r|\n/);
        const just = ['left', 'right', 'center'][Number(d.j ?? 0)] as 'left' | 'right' | 'center';
        const tw = Math.max(...lines.map((l) => l.length)) * size * 0.6 + 4;
        const th = lines.length * size * 1.2;
        const fontFamily = String(json.fonts?.list?.find((f: Json) => f.fName === d.f)?.fFamily ?? d.f ?? 'sans-serif');
        const textNode = createNode('text', {
            name,
            text: lines.join('\n'),
            fontSize: size,
            fontFamily,
            color: toHex(d.fc ?? [0, 0, 0]),
            align: just,
            autoSize: 'none',
            lineHeight: 1.2,
            // Lottie places text on its baseline at the layer origin
            x: just === 'center' ? -tw / 2 : just === 'right' ? -tw : 0,
            y: -size,
            width: tw,
            height: th,
          });
        content = [textNode];
        if ((L.t?.d?.k?.length ?? 0) > 1) ctx.warnings.add('Animated text content is imported at its first value');
        if (L.t?.a?.length) importTextAnimators(ctx, L.t.a, textNode, size);
      }
      break;
    }
    case 0: {
      const comp = ctx.comps.get(L.refId);
      if (comp && ctx.depth < 8) {
        ctx.depth++;
        content = layersToNodes(ctx, comp.layers ?? [], json, Number(L.w ?? compW), Number(L.h ?? compH));
        ctx.depth--;
        if (L.tm) ctx.warnings.add('Time remapping on precomps is not supported');
      }
      w = Number(L.w ?? compW);
      h = Number(L.h ?? compH);
      break;
    }
    case 3:
      break;
    default:
      ctx.warnings.add(`Layer type ${L.ty} ("${name}") is not supported and was skipped`);
      return null;
  }
  if (L.masksProperties?.length) ctx.warnings.add(`Masks on "${name}" are not supported and were dropped`);
  if (L.tt) ctx.warnings.add(`Track mattes on "${name}" are not supported`);
  if (L.ef?.length) ctx.warnings.add('Layer effects are not supported');
  const g = createNode('group', { name, children: content });
  applyTransform(ctx, g, L.ks, w, h);
  if (L.hd) g.visible = false;
  // In/out points as a visibility track
  const ip = Number(L.ip ?? ctx.ip);
  const op = Number(L.op ?? ctx.op);
  if (ip > ctx.ip || op < ctx.op) {
    const keys: Key[] = [];
    if (ip > ctx.ip) keys.push({ t: ctx.ip, v: [0], ease: 'step' }, { t: ip, v: [1], ease: 'step' });
    else keys.push({ t: ctx.ip, v: [1], ease: 'step' });
    if (op < ctx.op) keys.push({ t: op, v: [0], ease: 'step' });
    addTrack(ctx, g.id, 'visible', keys.length > 1 ? keys : [...keys, keys[0]], (v) => v[0] > 0);
  }
  return g;
}

const LOTTIE_SHAPES: TextModifier['shape'][] = ['square', 'ramp-up', 'ramp-down', 'triangle', 'round', 'smooth'];

/**
 * Text animators with a range selector become text modifiers: the selector's start, end, offset, amount, shape and
 * randomize map directly, and the animator's position, scale, rotation, opacity, fill colour and tracking become the
 * modifier's amounts. Animated selector values (start, end, offset, amount) become tracks on `modifiers.N.*`.
 */
function importTextAnimators(ctx: Ctx, animators: Json[], node: SceneNode & { type: 'text' }, fontSize: number): void {
  const mods: TextModifier[] = [];
  const text = node.text;
  const count = (unit: TextModifier['unit']): number =>
    unit === 'letter' ? Math.max(1, text.replace(/\s/g, '').length) : unit === 'word' ? Math.max(1, text.split(/\s+/).filter(Boolean).length) : Math.max(1, text.split('\n').length);
  for (const an of animators) {
    const sel = an?.s ?? {};
    const a = an?.a ?? {};
    const based = Number(sel.b ?? 1);
    const unit: TextModifier['unit'] = based === 3 ? 'word' : based === 4 ? 'line' : 'letter';
    // t: 1 means the range is counted in units instead of percent (b, t, sh and rn are plain numbers in the selector)
    const scale = Number(sel.t ?? 0) === 1 ? 100 / count(unit) : 1;
    const props = { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, letterSpacing: 0 } as Partial<TextModifier>;
    const pos = first(a.p, [0, 0]);
    props.x = r2(pos[0] ?? 0);
    props.y = r2(pos[1] ?? 0);
    const sc = first(a.s, [100, 100]);
    props.scale = r2((sc[0] ?? 100) / 100);
    if (sc[1] !== undefined && Math.abs(sc[1] - sc[0]) > 0.01) ctx.warnings.add('Text animator scale is uniform here: the horizontal value was used');
    props.rotation = r2(first(a.r, [0])[0]);
    props.opacity = r2(first(a.o, [100])[0] / 100);
    // Tracking is in thousandths of an em
    props.letterSpacing = r2((first(a.t, [0])[0] / 1000) * fontSize);
    if (a.fc) props.color = toHex(first(a.fc, [0, 0, 0]));
    const m: TextModifier = {
      name: String(an?.nm ?? `Animator ${mods.length + 1}`),
      unit,
      start: r2(first(sel.s, [0])[0] * scale),
      end: r2(first(sel.e, [100])[0] * scale),
      offset: r2(first(sel.o, [0])[0] * scale),
      shape: LOTTIE_SHAPES[Number(sel.sh ?? 1) - 1] ?? 'square',
      strength: r2(first(sel.a, [100])[0]),
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      opacity: 1,
      letterSpacing: 0,
      blur: 0,
      ...props,
    };
    if (Number(sel.rn ?? 0) === 1) m.randomize = true;
    const index = mods.length;
    mods.push(m);
    for (const [key, prop] of [['s', 'start'], ['e', 'end'], ['o', 'offset']] as const) {
      addTrack(ctx, node.id, `modifiers.${index}.${prop}`, keysOf(sel[key]) ?? [], (v) => r2(v[0] * scale));
    }
    addTrack(ctx, node.id, `modifiers.${index}.strength`, keysOf(sel.a) ?? [], (v) => r2(v[0]));
    if (Number(sel.sm ? first(sel.sm, [100])[0] : 100) < 100) ctx.warnings.add('Text animator smoothness is not supported');
    if (sel.xe || sel.ne) {
      const hi = first(sel.xe, [0])[0];
      const lo = first(sel.ne, [0])[0];
      if (hi || lo) ctx.warnings.add('Text animator ease high / low is not supported');
    }
    if (['p', 's', 'r', 'o', 't', 'fc'].some((k) => isAnimated(keysOf(a[k])))) ctx.warnings.add('Animated text animator values are imported at their first value');
    if (['sk', 'sa', 'sc', 'sw', 'a', 'bl', 'rx', 'ry', 'ls'].some((k) => a[k] !== undefined && a[k] !== null && keysOf(a[k])?.some((q) => q.v.some((x) => x !== 0 && !(k === 'a' && x === 0))))) {
      ctx.warnings.add('Some text animator properties (skew, stroke, anchor, blur, line spacing) are not supported');
    }
  }
  if (mods.length) node.modifiers = mods;
}

/** Lottie layers (front-most first) to nodes (back to front), nesting parented layers. */
function layersToNodes(ctx: Ctx, layers: Json[], json: Json, w: number, h: number): SceneNode[] {
  const byInd = new Map<number, { L: Json; node: SceneNode | null }>();
  for (const L of layers) byInd.set(Number(L.ind), { L, node: null });
  for (const entry of byInd.values()) entry.node = layerNode(ctx, entry.L, json, w, h);
  const roots: SceneNode[] = [];
  for (const L of [...layers].reverse()) {
    const entry = byInd.get(Number(L.ind));
    if (!entry?.node) continue;
    const parent = L.parent !== undefined ? byInd.get(Number(L.parent)) : undefined;
    if (parent?.node && parent.node.type === 'group') parent.node.children.push(entry.node);
    else roots.push(entry.node);
  }
  return roots;
}

const finiteOr = (v: unknown, fallback: number): number => {
  const n = Number(v ?? fallback);
  return Number.isFinite(n) ? n : fallback;
};

/** Lottie JSON is loosely typed: a keyframe time or value that is not a number must not leave NaN in the document. */
function scrubNonFinite(v: unknown): void {
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      if (typeof v[i] === 'number' && !Number.isFinite(v[i])) v[i] = 0;
      else scrubNonFinite(v[i]);
    }
  } else if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'number' && !Number.isFinite(o[k])) o[k] = 0;
      else scrubNonFinite(o[k]);
    }
  }
}

export function importLottie(json: Json, name = 'Lottie'): LottieImport {
  if (!isLottie(json)) throw new Error('Not a Lottie animation (no layers/fr/w)');
  try {
    const imported = importLottieUnchecked(json, name);
    scrubNonFinite(imported.artboard);
    return imported;
  } catch (err) {
    // Lottie JSON is loosely shaped: anything we trip over becomes a readable message instead of a crash
    if (err instanceof TypeError || err instanceof RangeError) throw new Error(`This Lottie file has data the importer could not read (${err.message})`);
    throw err;
  }
}

function importLottieUnchecked(json: Json, name: string): LottieImport {
  const ctx: Ctx = {
    fr: Number(json.fr) || 30,
    ip: finiteOr(json.ip, 0),
    op: finiteOr(json.op, 60),
    tracks: [],
    warnings: new Set(),
    assets: [],
    assetIds: new Map(),
    comps: new Map((json.assets ?? []).filter((a: Json) => Array.isArray(a.layers)).map((a: Json) => [a.id, a])),
    depth: 0,
  };
  if (json.ddd) ctx.warnings.add('3D layers are flattened to 2D');
  const artboard = createArtboard({ name: json.nm || name, width: Math.round(json.w), height: Math.round(json.h), background: null });
  artboard.children = layersToNodes(ctx, json.layers, json, json.w, json.h);
  const tl: Timeline = {
    id: uid('tl'),
    name: json.nm || 'Animation',
    duration: Math.max(1, ms(ctx, ctx.op)),
    loop: 'loop',
    autoplay: true,
    speed: 1,
    tracks: ctx.tracks,
  };
  artboard.timelines = [tl];
  if (json.markers?.length) ctx.warnings.add('Markers were not imported');
  return { artboard, assets: ctx.assets, warnings: [...ctx.warnings] };
}

/** Read a dotLottie (.lottie zip) or plain JSON file into Lottie JSON. */
export async function readLottieFile(bytes: Uint8Array): Promise<Json> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const { unzipSync, strFromU8 } = await import('fflate');
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((f) => /^animations\/.+\.json$/.test(f)) ?? Object.keys(files).find((f) => f.endsWith('.json') && f !== 'manifest.json');
    if (!name) throw new Error('No animation inside the .lottie file');
    const json = JSON.parse(strFromU8(files[name]));
    // dotLottie keeps images under images/; inline them so the importer sees data URIs
    for (const a of json.assets ?? []) {
      if (a.p && !String(a.p).startsWith('data:')) {
        const file = files[`images/${a.p}`] ?? files[`${a.u ?? ''}${a.p}`.replace(/^\//, '')];
        if (file) {
          let bin = '';
          for (let i = 0; i < file.length; i += 0x8000) bin += String.fromCharCode(...file.subarray(i, i + 0x8000));
          const ext = String(a.p).split('.').pop()?.toLowerCase();
          a.p = `data:image/${ext === 'jpg' ? 'jpeg' : ext ?? 'png'};base64,${btoa(bin)}`;
          a.e = 1;
        }
      }
    }
    return json;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
