/**
 * Interactives artboard -> Lottie (Bodymovin JSON), the 2D subset Lottie can
 * hold: shapes, paths, groups/frames (as parented null layers), images, text,
 * solid/gradient fills, strokes, and one timeline's keyframes. Interactions,
 * variables, scripts, bindings and web elements are not representable in
 * Lottie; anything dropped is listed in `warnings`.
 */
import { strToU8, zipSync } from 'fflate';
import {
  linearLine,
  radialCircle,
  cornerRadiiOf,
  fillPath,
  isContainer,
  orderedPaints,
  paintAlpha,
  strokePath,
  parseColor,
  polygonPoints,
  roundedBoxPoints,
  starPoints,
  withMaster,
  type Artboard,
  type Easing,
  type Paint,
  type PaintFx,
  type PaintKind,
  type Project,
  type SceneNode,
  type Stroke,
  type Timeline,
  type Track,
} from 'interactives-player';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = any;

export interface LottieExport {
  json: Json;
  warnings: string[];
}

const FPS = 60;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const BEZIER: Record<string, [number, number, number, number]> = {
  linear: [0.333, 0.333, 0.667, 0.667],
  easeIn: [0.32, 0, 0.67, 0],
  easeOut: [0.33, 1, 0.68, 1],
  easeInOut: [0.65, 0, 0.35, 1],
  backIn: [0.36, 0, 0.66, -0.56],
  backOut: [0.34, 1.56, 0.64, 1],
  elasticOut: [0.22, 1.4, 0.36, 1],
  bounceOut: [0.22, 1.2, 0.36, 1],
};

function colorArr(c: string): number[] {
  const p = parseColor(c) ?? [0, 0, 0, 1];
  return [r3(p[0] / 255), r3(p[1] / 255), r3(p[2] / 255), r3(p[3])];
}

interface Ctx {
  tl: Timeline | null;
  fr: number;
  warnings: Set<string>;
  assets: Json[];
  bytesFor: (assetId: string) => Uint8Array | null;
  mimeFor: (assetId: string) => string;
  nextInd: number;
}

function frame(ms: number): number {
  return Math.round((ms / 1000) * FPS);
}

/** A Lottie property from a static value plus an optional track (mapping each value to Lottie's array form). */
function prop(ctx: Ctx, nodeId: string, path: string, value: number[], map: (v: unknown) => number[]): Json {
  const tr = ctx.tl?.tracks.find((t) => t.nodeId === nodeId && t.prop === path);
  if (!tr || tr.keys.length < 2) return { a: 0, k: value.length === 1 ? value[0] : value };
  return { a: 1, k: keyframes(tr, map) };
}

function keyframes(tr: Track, map: (v: unknown) => number[]): Json[] {
  return tr.keys.map((k, i) => {
    const e: Easing = k.ease;
    const out: Json = { t: frame(k.t), s: map(k.value) };
    if (i === tr.keys.length - 1) return out;
    if (e === 'step') out.h = 1;
    else {
      const b = Array.isArray(e) ? e : BEZIER[e] ?? BEZIER.linear;
      out.o = { x: [b[0]], y: [b[1]] };
      out.i = { x: [b[2]], y: [b[3]] };
    }
    return out;
  });
}

/** Combine x and y tracks into one position property (union of key times). */
function position(ctx: Ctx, n: SceneNode, ax: number, ay: number): Json {
  const tx = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'x');
  const ty = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'y');
  if (!(tx && tx.keys.length > 1) && !(ty && ty.keys.length > 1)) return { a: 0, k: [r3(n.x + ax), r3(n.y + ay), 0] };
  // Separate dimensions keep each axis' own easing
  return {
    s: true,
    x: tx && tx.keys.length > 1 ? { a: 1, k: keyframes(tx, (v) => [r3(Number(v) + ax)]) } : { a: 0, k: r3(n.x + ax) },
    y: ty && ty.keys.length > 1 ? { a: 1, k: keyframes(ty, (v) => [r3(Number(v) + ay)]) } : { a: 0, k: r3(n.y + ay) },
  };
}

function transform(ctx: Ctx, n: SceneNode): Json {
  const ax = n.width * n.originX;
  const ay = n.height * n.originY;
  const sx = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'scaleX');
  const sy = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'scaleY');
  let scale: Json = { a: 0, k: [r3(n.scaleX * 100), r3(n.scaleY * 100), 100] };
  if ((sx && sx.keys.length > 1) || (sy && sy.keys.length > 1)) {
    const base = sx && sx.keys.length > 1 ? sx : sy!;
    if (sx && sy && sx.keys.length !== sy.keys.length) ctx.warnings.add('Scale X and Y with different keyframe times were combined');
    scale = {
      a: 1,
      k: keyframes(base, () => [0]).map((k: Json, i: number) => ({
        ...k,
        s: [r3(Number(sx?.keys[i]?.value ?? n.scaleX) * 100), r3(Number(sy?.keys[i]?.value ?? n.scaleY) * 100), 100],
      })),
    };
  }
  const visTrack = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'visible');
  let opacity = prop(ctx, n.id, 'opacity', [r3(n.opacity * 100)], (v) => [r3(Number(v) * 100)]);
  if (visTrack && visTrack.keys.length > 1) {
    if (opacity.a) ctx.warnings.add(`"${n.name}" animates both visibility and opacity; visibility won`);
    opacity = { a: 1, k: visTrack.keys.map((k) => ({ t: frame(k.t), s: [k.value ? r3(n.opacity * 100) : 0], h: 1 })) };
  }
  return {
    a: { a: 0, k: [r3(ax), r3(ay), 0] },
    p: position(ctx, n, ax, ay),
    s: scale,
    r: prop(ctx, n.id, 'rotation', [n.rotation], (v) => [r3(Number(v))]),
    o: opacity,
  };
}

const LOTTIE_CAP = { butt: 1, round: 2, square: 3 } as const;
const LOTTIE_JOIN = { miter: 1, round: 2, bevel: 3 } as const;

/**
 * One Lottie fill or stroke item. `prefix` is the paint's property path (`fill`, `fills.0`, `stroke`, `strokes.1`), so its
 * colour and width tracks come along; `fx` carries the paint's own opacity.
 */
function paintItem(ctx: Ctx, n: SceneNode, p: Paint | null, kind: 'fill' | 'stroke', prefix: string, stroke?: Stroke): Json | null {
  if (!p) return null;
  const fx: PaintFx = stroke ?? p;
  if (fx.visible === false) return null;
  // Lottie has no per-paint blend, feather or offset: a soft or shifted paint (a shadow) would come out as a hard copy, so it is left out
  if (fx.feather || fx.offsetX || fx.offsetY) {
    ctx.warnings.add(`Feathered or offset fills and strokes (shadows) are not exported to Lottie ("${n.name}")`);
    return null;
  }
  if (fx.blend && fx.blend !== 'normal') ctx.warnings.add(`Blend modes of fills and strokes are not exported to Lottie ("${n.name}")`);
  const alpha = paintAlpha(fx);
  const colorPath = kind === 'fill' ? `${prefix}.color` : `${prefix}.paint.color`;
  const widthPath = `${prefix}.width`;
  const lc = LOTTIE_CAP[stroke?.cap ?? 'round'];
  const lj = LOTTIE_JOIN[stroke?.join ?? 'round'];
  if (p.type === 'solid') {
    const c = colorArr(p.color);
    const color = prop(ctx, n.id, colorPath, c.slice(0, 3), (v) => colorArr(String(v)).slice(0, 3));
    const o = { a: 0, k: r3(c[3] * alpha * 100) };
    return kind === 'fill' ? { ty: 'fl', c: color, o, r: 1, nm: 'Fill' } : { ty: 'st', c: color, o, w: prop(ctx, n.id, widthPath, [stroke!.width], (v) => [Number(v)]), lc, lj, nm: 'Stroke' };
  }
  if (p.type === 'linear' || p.type === 'radial') {
    const stops = [...p.stops].sort((a, b) => a.offset - b.offset);
    const k = stops.flatMap((s) => [r3(s.offset), ...colorArr(s.color).slice(0, 3)]);
    const w = n.width;
    const h = n.height;
    let s = [0, h / 2];
    let e = [w, h / 2];
    if (p.type === 'linear') {
      // Points of its own go out as they are, a box-relative gradient as its corner to corner line
      const l = linearLine(p, w, h);
      s = [l.x1, l.y1];
      e = [l.x2, l.y2];
    } else {
      const c = radialCircle(p, w, h);
      s = [c.cx, c.cy];
      e = [c.cx + c.r, c.cy];
    }
    const g = { p: stops.length, k: { a: 0, k } };
    const common = { o: { a: 0, k: r3(alpha * 100) }, s: { a: 0, k: s.map(r3) }, e: { a: 0, k: e.map(r3) }, t: p.type === 'linear' ? 1 : 2, g };
    return kind === 'fill' ? { ty: 'gf', ...common, r: 1, nm: 'Gradient fill' } : { ty: 'gs', ...common, w: { a: 0, k: stroke!.width }, lc, lj, nm: 'Gradient stroke' };
  }
  ctx.warnings.add(`Image fills are not supported in Lottie ("${n.name}")`);
  return null;
}

function sizeProps(ctx: Ctx, n: SceneNode): { p: Json; s: Json } {
  const tw = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'width');
  const th = ctx.tl?.tracks.find((t) => t.nodeId === n.id && t.prop === 'height');
  if ((tw && tw.keys.length > 1) || (th && th.keys.length > 1)) {
    const base = tw && tw.keys.length > 1 ? tw : th!;
    const k = keyframes(base, () => [0]);
    // The layer transform owns position, so the shape keeps its centre at the box centre as it grows
    return {
      p: { a: 1, k: k.map((q: Json, i: number) => ({ ...q, s: [r3(Number(tw?.keys[i]?.value ?? n.width) / 2), r3(Number(th?.keys[i]?.value ?? n.height) / 2)] })) },
      s: { a: 1, k: k.map((q: Json, i: number) => ({ ...q, s: [r3(Number(tw?.keys[i]?.value ?? n.width)), r3(Number(th?.keys[i]?.value ?? n.height))] })) },
    };
  }
  return { p: { a: 0, k: [r3(n.width / 2), r3(n.height / 2)] }, s: { a: 0, k: [r3(n.width), r3(n.height)] } };
}

function pathShape(points: { x: number; y: number; in?: { x: number; y: number } | null; out?: { x: number; y: number } | null }[], closed: boolean): Json {
  return {
    ty: 'sh',
    ks: {
      a: 0,
      k: {
        c: closed,
        v: points.map((p) => [r3(p.x), r3(p.y)]),
        i: points.map((p) => [r3(p.in?.x ?? 0), r3(p.in?.y ?? 0)]),
        o: points.map((p) => [r3(p.out?.x ?? 0), r3(p.out?.y ?? 0)]),
      },
    },
    nm: 'Path',
  };
}

/** Shape items (content in the node's local box) for a drawable node, or null. */
function shapesFor(ctx: Ctx, n: SceneNode): Json[] | null {
  const styled = n as SceneNode & { fill?: Paint | null; stroke?: Stroke | null; fills?: Paint[]; strokes?: Stroke[]; paintOrder?: PaintKind[] };
  // A Lottie group paints its first items on top, so the paints go in front-most first (the shape's paint order, reversed)
  const paints = orderedPaints({ fill: styled.fill ?? null, stroke: styled.stroke ?? null, fills: styled.fills, strokes: styled.strokes, paintOrder: styled.paintOrder });
  const style = paints
    .map((e) => (e.kind === 'stroke' ? paintItem(ctx, n, e.paint.paint, 'stroke', strokePath(e.index, styled), e.paint) : paintItem(ctx, n, e.paint, 'fill', fillPath(e.index, styled))))
    .reverse()
    .filter(Boolean);
  switch (n.type) {
    case 'rect':
    case 'frame':
    case 'button': {
      // A rectangle has one radius in Lottie: radii per corner go out as the outline's path
      const radii = cornerRadiiOf(n as { cornerRadii?: unknown });
      if (radii?.some((v) => v > 0)) return [pathShape(roundedBoxPoints(n.width, n.height, radii), true), ...style];
      const { p, s } = sizeProps(ctx, n);
      return [{ ty: 'rc', p, s, r: prop(ctx, n.id, 'cornerRadius', ['cornerRadius' in n ? n.cornerRadius : 0], (v) => [Number(v)]), nm: 'Rect' }, ...style];
    }
    case 'ellipse': {
      const { p, s } = sizeProps(ctx, n);
      return [{ ty: 'el', p, s, nm: 'Ellipse' }, ...style];
    }
    case 'polygon':
      return [pathShape(polygonPoints(n.sides, n.width, n.height), true), ...style];
    case 'star':
      return [pathShape(starPoints(n.points, n.innerRatio, n.width, n.height), true), ...style];
    case 'path':
      return [...n.paths.map((sp) => pathShape(sp.points, sp.closed)), ...style];
    default:
      return null;
  }
}

function textLayer(n: SceneNode & { type: 'text' | 'link' | 'button' }, text: string, fonts: Map<string, Json>): Json {
  const family = n.fontFamily.split(',')[0].replace(/["']/g, '').trim() || 'sans-serif';
  const fName = family.replace(/\s+/g, '');
  fonts.set(fName, { fName, fFamily: family, fStyle: n.fontWeight >= 600 ? 'Bold' : 'Regular', ascent: 75 });
  const j = n.align === 'center' ? 2 : n.align === 'right' ? 1 : 0;
  return {
    ty: 5,
    t: {
      d: { k: [{ s: { s: n.fontSize, f: fName, t: text.replace(/\n/g, '\r'), j, tr: Math.round(n.letterSpacing * 10), lh: n.fontSize * n.lineHeight, ls: 0, fc: colorArr(n.color).slice(0, 3) }, t: 0 }] },
      p: {},
      m: { g: 1, a: { a: 0, k: [0, 0] } },
      a: [],
    },
  };
}

export function exportLottie(project: Project, artboard: Artboard, opts: { timelineId?: string; bytesFor: (assetId: string) => Uint8Array | null }): LottieExport {
  const tl = artboard.timelines.find((t) => t.id === opts.timelineId) ?? artboard.timelines.find((t) => t.autoplay) ?? artboard.timelines[0] ?? null;
  const ctx: Ctx = {
    tl,
    fr: FPS,
    warnings: new Set(),
    assets: [],
    bytesFor: opts.bytesFor,
    mimeFor: (id) => project.assets.find((a) => a.id === id)?.mime ?? 'image/png',
    nextInd: 1,
  };
  if (artboard.timelines.length > 1) ctx.warnings.add(`Only the "${tl?.name}" timeline was exported; Lottie holds one animation`);
  if (artboard.logic.nodes.length) ctx.warnings.add('Interactions are not part of Lottie and were left out');
  if (project.scripts.length) ctx.warnings.add('Scripts are not part of Lottie and were left out');
  if (project.variables.length || project.dataSources.length) ctx.warnings.add('Variables, data and bindings are not part of Lottie; values are exported as they are in the editor');
  const op = tl ? Math.max(1, frame(tl.duration)) : 1;
  const fonts = new Map<string, Json>();
  const layers: Json[] = [];
  const add = (n: SceneNode, parent: number | undefined, depthName: string): void => {
    if (!n.visible && !ctx.tl?.tracks.some((t) => t.nodeId === n.id && t.prop === 'visible')) return;
    const ind = ctx.nextInd++;
    let layer: Json | null = null;
    const shapes = shapesFor(ctx, n);
    if (shapes) layer = { ty: 4, shapes };
    else if (n.type === 'text' || n.type === 'link') {
      // Lottie text has one style per layer: rich text runs export as the plain text in the layer's own style
      if (n.type === 'text' && n.runs?.length) ctx.warnings.add('Text with several styles (runs) exports as plain text in the layer’s own style');
      layer = textLayer(n, n.text, fonts);
    }
    else if (n.type === 'image') {
      const bytes = n.assetId ? ctx.bytesFor(n.assetId) : null;
      if (bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const id = `image_${ctx.assets.length}`;
        ctx.assets.push({ id, w: Math.round(n.width), h: Math.round(n.height), u: '', p: `data:${ctx.mimeFor(n.assetId!)};base64,${btoa(bin)}`, e: 1 });
        layer = { ty: 2, refId: id };
        if (n.fit !== 'fill') ctx.warnings.add(`Image "${n.name}" is stretched to its box in Lottie`);
      } else ctx.warnings.add(`Image "${n.name}" has no file and was skipped`);
    } else if (isContainer(n)) layer = { ty: 3 };
    else ctx.warnings.add(`${n.type} layers ("${n.name}") are web elements and are not part of Lottie`);
    if (!layer) return;
    if ((n.type === 'path' && n.skin) || (n.type === 'image' && n.mesh?.skin)) ctx.warnings.add('Skinned shapes and meshes export in their rest shape: Lottie has no bones, so they only bend in the player');
    if (n.blendMode && n.blendMode !== 'normal') ctx.warnings.add('Blend modes were dropped');
    if (n.shadow || n.blur) ctx.warnings.add('Shadows and blurs were dropped');
    layers.push({ ...layer, ind, nm: n.name || depthName, ks: transform(ctx, n), ip: 0, op, st: 0, ao: 0, sr: 1, ...(parent !== undefined ? { parent } : {}) });
    if (n.type === 'button') {
      // The label rides on top of the button shape as a parented text layer
      const t = textLayer(n, n.label, fonts);
      const tind = ctx.nextInd++;
      layers.push({ ...t, ind: tind, parent: ind, nm: `${n.name} label`, ip: 0, op, st: 0, ao: 0, sr: 1, ks: { a: { a: 0, k: [0, 0, 0] }, p: { a: 0, k: [n.align === 'center' ? n.width / 2 : 12, n.height / 2 + n.fontSize * 0.35, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } } });
    }
    if (isContainer(n)) for (const c of n.children) add(c, ind, n.name);
  };
  // The page master's layers are drawn into the animation (flattened: a Lottie has no second artboard)
  for (const n of withMaster(project.artboards, artboard)) add(n, undefined, 'Layer');
  // Lottie draws the first layer on top: ours were collected back to front, depth first.
  layers.reverse();
  const bg = artboard.background?.type === 'solid' ? artboard.background.color : null;
  if (bg) layers.push({ ty: 1, ind: ctx.nextInd++, nm: 'Background', sc: bg.slice(0, 7), sw: artboard.width, sh: artboard.height, ip: 0, op, st: 0, ao: 0, sr: 1, ks: { a: { a: 0, k: [0, 0, 0] }, p: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } } });
  const json: Json = {
    v: '5.7.0',
    fr: FPS,
    ip: 0,
    op,
    w: artboard.width,
    h: artboard.height,
    nm: `${project.name} - ${artboard.name}`,
    ddd: 0,
    assets: ctx.assets,
    layers,
    markers: [],
    ...(fonts.size ? { fonts: { list: [...fonts.values()] } } : {}),
  };
  return { json, warnings: [...ctx.warnings] };
}

/** dotLottie package: manifest + the animation JSON. */
export function toDotLottie(json: Json, id = 'animation'): Uint8Array {
  const manifest = { version: '2', generator: 'Interactives', animations: [{ id }] };
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), [`animations/${id}.json`]: strToU8(JSON.stringify(json)) });
}
