/**
 * What is painted behind a layer, worked out from the document (no rendering). The artboard becomes a list of paint
 * items in drawing order; a point's backdrop is those items laid over each other at that point. Where the answer is a
 * range (a gradient behind the text) it is a set of possible colours, and where it can't be known at all (a photo, a
 * video, a script layer, a blend mode) the point says so instead of guessing.
 */
import { apply, fillList, invert, isContainer, multiply, nodeMatrix, type Artboard, type ContainerNode, type ImageFit, type Matrix, type Paint, type Project, type RGBA, type SceneNode } from 'interactives-player';
import { over, toRgba, type RGB } from './colour';

/** Colours of the part of an image under a point (layer-local pixels). Null: the picture isn't known (not loaded, or not sampled). An empty list: the picture is see-through there. */
export type ImageColours = (assetId: string, fit: ImageFit | 'none', boxW: number, boxH: number, x: number, y: number) => RGB[] | null;

type Fill =
  | { kind: 'solid'; rgba: RGBA; alpha: number }
  | { kind: 'stops'; colours: RGBA[]; alpha: number }
  | { kind: 'image'; assetId: string; fit: ImageFit | 'none'; alpha: number }
  | { kind: 'unknown'; reason: string };

interface ClipBox {
  inv: Matrix;
  w: number;
  h: number;
}

export interface PaintItem {
  nodeId: string;
  inv: Matrix;
  w: number;
  h: number;
  shape: 'box' | 'ellipse' | 'approx';
  fills: Fill[];
  /** Opacity of the layer and everything above it. */
  alpha: number;
  clips: ClipBox[];
  /** Ids of the hidden layers (and not-active solo children) this sits inside, itself included. It only paints for layers inside the same ones. */
  hidden: string[];
  aabb: { x0: number; y0: number; x1: number; y1: number };
}

export interface Target {
  node: SceneNode;
  m: Matrix;
  /** Paint items before this index are behind the layer. */
  before: number;
  /** Opacity of the layer and its parents (a hidden layer counts as fully opaque: it is checked as it will look when shown). */
  alpha: number;
  hidden: string[];
}

export interface ArtboardPaint {
  base: RGB;
  items: PaintItem[];
  /** Every layer by id, with what is behind it. */
  targets: Map<string, Target>;
}

const OPAQUE_THINGS: Record<string, string> = { video: 'a video', embed: 'an embedded page', draw: 'a script layer', shader: 'a shader layer', instance: 'another artboard' };

const clamp01 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** The children in drawing order, bottom to top (`drawOrder` lets listed children swap places among themselves). */
function ordered(c: ContainerNode): SceneNode[] {
  const order = c.drawOrder;
  if (!order?.length) return c.children;
  const byId = new Map(c.children.map((n) => [n.id, n]));
  const listed = order.filter((id) => byId.has(id));
  const slots = c.children.map((n, i) => (listed.includes(n.id) ? i : -1)).filter((i) => i >= 0);
  const out = c.children.slice();
  slots.forEach((slot, k) => {
    out[slot] = byId.get(listed[k])!;
  });
  return out;
}

function paintToFill(p: Paint | null | undefined, alpha = 1): Fill | null {
  if (!p || p.visible === false) return null;
  const a = alpha * clamp01(p.opacity);
  if (p.blend && p.blend !== 'normal') return { kind: 'unknown', reason: 'a blend mode' };
  switch (p.type) {
    case 'solid': {
      const c = toRgba(p.color);
      return c ? { kind: 'solid', rgba: c, alpha: a } : { kind: 'unknown', reason: 'a colour that could not be read' };
    }
    case 'linear':
    case 'radial': {
      const cols = (p.stops ?? []).map((s) => toRgba(s.color));
      if (!cols.length || cols.some((c) => !c)) return { kind: 'unknown', reason: 'a gradient that could not be read' };
      return { kind: 'stops', colours: cols as RGBA[], alpha: a };
    }
    case 'image':
      return { kind: 'image', assetId: p.assetId, fit: p.fit, alpha: a };
    default:
      return { kind: 'unknown', reason: 'a fill that could not be read' };
  }
}

function bounds(m: Matrix, w: number, h: number) {
  const pts = [apply(m, 0, 0), apply(m, w, 0), apply(m, w, h), apply(m, 0, h)];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}

/** Lay out an artboard's paint in drawing order. */
export function buildPaintList(project: Project, ab: Artboard): ArtboardPaint {
  const pageC = toRgba(project.settings.pageBackground);
  const page: RGB = pageC ? over(pageC, [255, 255, 255]) : [255, 255, 255];
  const items: PaintItem[] = [];
  const targets = new Map<string, Target>();

  // The artboard's own background paints first, over the page
  const bg = paintToFill(ab.background);
  if (bg) {
    items.push({ nodeId: ab.id, inv: invert([1, 0, 0, 1, 0, 0]), w: ab.width, h: ab.height, shape: 'box', fills: [bg], alpha: 1, clips: [], hidden: [], aabb: { x0: 0, y0: 0, x1: ab.width, y1: ab.height } });
  }

  const visit = (list: SceneNode[], parentM: Matrix, alpha: number, clips: ClipBox[], hidden: string[], parent: ContainerNode | null) => {
    for (const n of list) {
      const m = multiply(parentM, nodeMatrix(n));
      const off = !n.visible || n.opacity <= 0 || (parent?.solo && parent.solo.active !== n.id);
      const hid = off ? [...hidden, n.id] : hidden;
      const a = off ? alpha : alpha * clamp01(n.opacity);
      const blended = !!n.blendMode && n.blendMode !== 'normal';
      const fillsFor = (): Fill[] => {
        const out: Fill[] = [];
        if (blended) return [{ kind: 'unknown', reason: 'a blend mode' }];
        if (n.type === 'rect' || n.type === 'ellipse' || n.type === 'frame' || n.type === 'polygon' || n.type === 'star' || n.type === 'path' || n.type === 'button' || n.type === 'input') {
          for (const p of fillList(n)) {
            const f = paintToFill(p);
            if (f) out.push(f);
          }
        } else if (n.type === 'image') {
          if (n.assetId) out.push(n.shaderFilter || n.mesh || n.slice ? { kind: 'unknown', reason: 'an image effect' } : { kind: 'image', assetId: n.assetId, fit: n.fit, alpha: 1 });
        } else if (OPAQUE_THINGS[n.type]) {
          out.push({ kind: 'unknown', reason: OPAQUE_THINGS[n.type] });
        }
        return out;
      };
      const shape: PaintItem['shape'] = n.type === 'ellipse' ? 'ellipse' : n.type === 'polygon' || n.type === 'star' || n.type === 'path' ? 'approx' : 'box';
      const push = () => {
        if (n.mask) return; // a mask only clips, it isn't drawn
        const fills = fillsFor();
        if (!fills.length) return;
        items.push({ nodeId: n.id, inv: invert(m), w: n.width, h: n.height, shape, fills, alpha: a, clips, hidden: hid, aabb: bounds(m, n.width, n.height) });
      };
      // What is behind a layer is what is drawn before it (a button or input draws its own box under its label)
      const selfPaints = n.type === 'button' || n.type === 'input';
      if (!selfPaints) targets.set(n.id, { node: n, m, before: items.length, alpha: a, hidden: hid });
      if (isContainer(n)) {
        push();
        const inner = n.type === 'frame' && (n.clip || (n.scroll && n.scroll !== 'none')) ? [...clips, { inv: invert(m), w: n.width, h: n.height }] : clips;
        visit(ordered(n), m, a, inner, hid, n);
      } else {
        push();
        if (selfPaints) targets.set(n.id, { node: n, m, before: items.length, alpha: a, hidden: hid });
      }
    }
  };
  visit(ab.children, [1, 0, 0, 1, 0, 0], 1, [], [], null);
  return { base: page, items, targets };
}

export interface PointBackdrop {
  /** Every colour this point could be, when it is known. */
  colours: RGB[];
  /** Why it can't be known (what is behind it), or null. */
  unknown: string | null;
  /** True when the colours are a range from a gradient or a picture rather than one flat colour. */
  varies: boolean;
}

const MAX_COLOURS = 10;

/** Keep the extremes and an even spread of a long list of colours. */
function thin(cols: RGB[]): RGB[] {
  const seen = new Map<string, RGB>();
  for (const c of cols) seen.set(c.map((v) => Math.round(v / 3)).join(','), c);
  const list = [...seen.values()];
  if (list.length <= MAX_COLOURS) return list;
  const lum = (c: RGB) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  list.sort((a, b) => lum(a) - lum(b));
  return Array.from({ length: MAX_COLOURS }, (_, i) => list[Math.round((i * (list.length - 1)) / (MAX_COLOURS - 1))]);
}

function inside(item: PaintItem, x: number, y: number): boolean {
  if (x < item.aabb.x0 || x > item.aabb.x1 || y < item.aabb.y0 || y > item.aabb.y1) return false;
  for (const c of item.clips) {
    const p = apply(c.inv, x, y);
    if (p.x < 0 || p.y < 0 || p.x > c.w || p.y > c.h) return false;
  }
  const p = apply(item.inv, x, y);
  if (item.shape === 'ellipse') {
    const rx = item.w / 2;
    const ry = item.h / 2;
    if (rx <= 0 || ry <= 0) return false;
    return ((p.x - rx) / rx) ** 2 + ((p.y - ry) / ry) ** 2 <= 1;
  }
  return p.x >= 0 && p.y >= 0 && p.x <= item.w && p.y <= item.h;
}

/** What is behind a target at one point of the artboard. */
export function backdropAt(paint: ArtboardPaint, target: Target, x: number, y: number, images?: ImageColours): PointBackdrop {
  let colours: RGB[] = [paint.base];
  let unknown: string | null = null;
  let varies = false;
  for (let i = 0; i < target.before; i++) {
    const item = paint.items[i];
    if (item.hidden.length && !item.hidden.every((id) => target.hidden.includes(id))) continue;
    if (!inside(item, x, y)) continue;
    const local = apply(item.inv, x, y);
    for (const f of item.fills) {
      if (f.kind === 'unknown') {
        unknown = f.reason;
        continue;
      }
      const alpha = f.alpha * item.alpha;
      if (alpha <= 0) continue;
      // The colours this fill could show at the point
      let top: RGBA[] | null;
      if (f.kind === 'solid') top = [f.rgba];
      else if (f.kind === 'stops') {
        top = f.colours;
        varies = true;
      } else {
        const got = images?.(f.assetId, f.fit, item.w, item.h, local.x, local.y) ?? null;
        if (got === null) {
          unknown = 'an image';
          continue;
        }
        // Nothing here: the picture is see-through at this point (a letterbox, a transparent corner)
        if (!got.length) continue;
        top = got.map((c) => [c[0], c[1], c[2], 1] as RGBA);
        varies = true;
      }
      if (top.every((c) => c[3] * alpha >= 0.999)) {
        colours = thin(top.map((c) => [c[0], c[1], c[2]] as RGB));
        unknown = null;
      } else if (!unknown) {
        colours = thin(top.flatMap((c) => colours.map((b) => over(c, b, alpha))));
      }
    }
    if (item.shape === 'approx') unknown = unknown ?? 'a freeform shape';
  }
  return { colours, unknown, varies };
}

/**
 * Roughly where a text's ink falls inside its box (layer-local pixels). Averages 0.55 of the font size per character, which
 * is wrong for any one font and right enough to tell "the label sits on the button" from "the box is wider than the words".
 * `measure` swaps in a real measurement (the editor uses the canvas).
 */
export interface TextMeasure {
  (node: SceneNode, maxWidth: number): { width: number; height: number } | null;
}

export function textExtent(node: SceneNode, measure?: TextMeasure): { x: number; y: number; w: number; h: number } {
  const W = Math.max(1, node.width);
  const H = Math.max(1, node.height);
  const t = node as unknown as { text?: string; label?: string; fontSize?: number; fontWeight?: number; lineHeight?: number; align?: string; verticalAlign?: string; wrap?: boolean; autoSize?: string };
  const text = (node.type === 'button' ? t.label : t.text) ?? '';
  const size = t.fontSize ?? 16;
  const lh = size * (t.lineHeight ?? 1.3);
  const measured = measure?.(node, W);
  let tw: number;
  let th: number;
  if (measured) {
    tw = measured.width;
    th = measured.height;
  } else {
    const cw = size * ((t.fontWeight ?? 400) >= 700 ? 0.6 : 0.55);
    const lines = String(text).split('\n');
    const wrap = node.type !== 'button' && t.wrap !== false && t.autoSize !== 'width';
    const perLine = Math.max(1, Math.floor(W / cw));
    let count = 0;
    let widest = 0;
    for (const l of lines) {
      const chars = Math.max(l.length, 1);
      const n = wrap ? Math.ceil(chars / perLine) : 1;
      count += n;
      widest = Math.max(widest, wrap ? Math.min(chars, perLine) * cw : chars * cw);
    }
    tw = widest;
    th = count * lh;
  }
  tw = Math.min(Math.max(tw, 1), W);
  th = Math.min(Math.max(th, 1), H);
  const align = node.type === 'button' || node.type === 'input' ? (t.align ?? 'center') : (t.align ?? 'left');
  const x = align === 'center' ? (W - tw) / 2 : align === 'right' ? W - tw : 0;
  const v = node.type === 'button' || node.type === 'input' ? 'middle' : (t.verticalAlign ?? 'top');
  const y = v === 'middle' ? (H - th) / 2 : v === 'bottom' ? H - th : 0;
  return { x, y, w: tw, h: th };
}

/** A grid of points over a layer-local rectangle, in artboard space. */
export function samplePoints(m: Matrix, r: { x: number; y: number; w: number; h: number }): { x: number; y: number }[] {
  const cols = Math.min(7, Math.max(2, Math.ceil(r.w / 70) + 1));
  const rows = Math.min(4, Math.max(2, Math.ceil(r.h / 40) + 1));
  const pts: { x: number; y: number }[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Stay a pixel inside the rectangle so an edge shared with a neighbour doesn't decide it
      const lx = r.x + 1 + ((r.w - 2) * i) / (cols - 1);
      const ly = r.y + 1 + ((r.h - 2) * j) / (rows - 1);
      pts.push(apply(m, lx, ly));
    }
  }
  return pts;
}
