/**
 * The layout check for the branded starters: finds what makes a page look unpolished without anyone opening it. It runs a page the
 * way the player would draw it at the start (bindings and repeaters applied, auto layout run, the page master's layers included),
 * works out where every layer's box is on the artboard, and reports:
 *
 *   button-text    a button or input whose box overlaps a text layer (its own label does not count, nor anything inside a clickable
 *                  frame, which is that frame's label)
 *   logo-clear     anything but the page's background inside the logo's clear space (`LOGO_CLEAR` of the logo's height all round)
 *   text-overflow  text that runs off the artboard
 *   text-chrome    text that runs into the brand's own layers (the accent bar, the web address)
 *   text-text      two text layers whose words overlap (advisory: the estimate below can be a little out)
 *
 * Text height and width are estimated from Open Sans's advance widths (there is no layout engine under test), good to a few
 * percent, so a hair of overlap is forgiven. A layer that overlaps others on purpose (a panel over its own text, a scrim) is
 * marked with `overlay(...)` from kit.ts and skipped with everything inside it. Only what shows at the start is checked, so a
 * panel that opens later is not (build the page's states into a test when one matters).
 */
import { REPEAT_SEP, artboardScope, isContainer, pageInfo, prepareNodes, relayoutTree, startingValue, evaluate, textAutoSize, withMaster, type Artboard, type CopySizes, type ExprScope, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { LOGO_CLEAR, OVERLAY_TAG, type LayoutState } from './kit';

export type ViolationKind = 'button-text' | 'logo-clear' | 'text-overflow' | 'text-chrome' | 'text-text';

export interface LayoutViolation {
  kind: ViolationKind;
  /** The page (artboard) name. */
  page: string;
  /** The layers involved, by name (and the text, shortened). */
  a: string;
  b?: string;
  detail: string;
}

/** The kinds that fail the starter-layout test (text-text is only listed). */
export const STRICT_KINDS: ViolationKind[] = ['button-text', 'logo-clear', 'text-overflow', 'text-chrome'];

// ------------------------------------------------------------------ text estimate

//Open Sans regular advance widths in em, read from the font's own metrics, for the characters that carry most text (bold is estimated as a little wider)
const W: Record<string, number> = {
  ' ': 0.26, a: 0.556, b: 0.612, c: 0.479, d: 0.612, e: 0.562, f: 0.336, g: 0.543, h: 0.613, i: 0.252, j: 0.252, k: 0.525, l: 0.252, m: 0.926, n: 0.613, o: 0.602, p: 0.612, q: 0.612, r: 0.409, s: 0.477, t: 0.356, u: 0.613, v: 0.5, w: 0.775, x: 0.523, y: 0.501, z: 0.469,
  A: 0.632, B: 0.646, C: 0.63, D: 0.726, E: 0.556, F: 0.516, G: 0.727, H: 0.737, I: 0.279, J: 0.269, K: 0.612, L: 0.522, M: 0.899, N: 0.753, O: 0.778, P: 0.602, Q: 0.778, R: 0.617, S: 0.548, T: 0.551, U: 0.729, V: 0.596, W: 0.923, X: 0.578, Y: 0.559, Z: 0.572,
  '.': 0.263, ',': 0.259, ':': 0.263, ';': 0.263, '-': 0.322, '\u2013': 0.5, "'": 0.219, '\u2019': 0.169, '"': 0.398, '?': 0.432, '!': 0.264, '(': 0.295, ')': 0.295, '/': 0.367, '%': 0.827, '&': 0.729, '+': 0.572, '=': 0.572, '\u2022': 0.376, '\u00b7': 0.263, '@': 0.896, '#': 0.646, '$': 0.572, '*': 0.551, '_': 0.438, '|': 0.549,
};
const advance = (ch: string): number => W[ch] ?? (/[0-9]/.test(ch) ? 0.572 : ch.charCodeAt(0) > 0x2000 ? 1 : 0.56);

interface Ink {
  /** The words' box on the artboard. */
  x: number;
  y: number;
  w: number;
  h: number;
  lines: number;
}

/** How the words of a text layer lie in its box: wrapped greedily at the box's width, widest line, line count, aligned and placed vertically as the layer says. */
function inkOf(n: TextNode, text: string, left: number, top: number): Ink {
  const weight = n.fontWeight ?? 400;
  const bold = weight >= 700 ? 1.07 : weight >= 600 ? 1.04 : 1;
  const spacing = n.letterSpacing ?? 0;
  const room = n.autoSize === 'width' || n.wrap === false ? Infinity : Math.max(1, n.width);
  const setAt = (size: number) => {
    const wide = (s: string) => [...s].reduce((sum, ch) => sum + advance(ch) * size * bold + spacing, 0);
    let lines = 0;
    let widest = 0;
    for (const para of text.split('\n')) {
      let line = '';
      for (const word of para.trim().split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (line && wide(next) > room) {
          widest = Math.max(widest, wide(line));
          lines++;
          line = word;
        } else line = next;
      }
      widest = Math.max(widest, wide(line));
      lines++;
    }
    return { lines, widest, h: lines * (n.lineHeight ?? 1.3) * size };
  };
  let size = n.fontSize ?? 16;
  //Auto text size: the largest size in min..max at which the words fit the box
  if (n.fitText) {
    const lo = Math.max(1, n.fitText.min && n.fitText.min > 0 ? n.fitText.min : 1);
    const hi = n.fitText.max && n.fitText.max > 0 ? Math.max(lo, n.fitText.max) : size;
    size = hi;
    while (size > lo && setAt(size).h > n.height) size--;
  }
  const { lines, widest, h: inkH } = setAt(size);
  const inkW = widest;
  const boxW = n.autoSize === 'width' ? widest : n.width;
  const align = n.align ?? 'left';
  const x = left + (align === 'center' ? (boxW - inkW) / 2 : align === 'right' ? boxW - inkW : 0);
  const boxH = (n.autoSize === 'height' || n.autoSize === 'width') && !n.fitText ? inkH : n.height;
  const va = (n as { verticalAlign?: string }).verticalAlign ?? 'top';
  const y = top + (va === 'middle' ? (boxH - inkH) / 2 : va === 'bottom' ? boxH - inkH : 0);
  return { x, y, w: inkW, h: inkH, lines };
}

// ------------------------------------------------------------------ walking a prepared page

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Item {
  node: SceneNode;
  box: Box;
  /** The words' box, for text. */
  ink?: Box;
  /** The chain of ancestor ids (outermost first). */
  path: string[];
  fromMaster: boolean;
  overlay: boolean;
  /** Inside a frame that clips or scrolls its content (what runs out of it is hidden on purpose). */
  clipped: boolean;
  /** The nearest clickable frame above it, when it is a control's label. */
  control?: string;
  text?: string;
}

const tagged = (n: SceneNode) => ((n as { tags?: string[] }).tags ?? []).includes(OVERLAY_TAG);
const isChromeTag = (n: SceneNode) => ((n as { tags?: string[] }).tags ?? []).includes('brand-chrome');
const hit = (a: Box, b: Box, tol = 2) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
const contains = (outer: Box, inner: Box) => outer.x <= inner.x + 0.5 && outer.y <= inner.y + 0.5 && outer.x + outer.w >= inner.x + inner.w - 0.5 && outer.y + outer.h >= inner.y + inner.h - 0.5;

/** A frame or group a learner can click, focus or drag: the text inside it is its label. */
const isClickable = (n: SceneNode): boolean => {
  const x = n as SceneNode & { role?: string; focusable?: boolean; draggable?: unknown };
  return (n.type === 'frame' || n.type === 'group') && (x.role === 'button' || x.role === 'checkbox' || x.role === 'radio' || !!x.focusable || !!x.draggable);
};

function collect(nodes: SceneNode[], scope: ExprScope, out: Item[], ctx: { dx: number; dy: number; path: string[]; overlay: boolean; clipped: boolean; clip: Box | null; control?: string; master: boolean }): void {
  for (const n of nodes) {
    if (n.visible === false || n.opacity === 0) continue;
    const master = ctx.master || n.id.startsWith('ixm~');
    const box = { x: ctx.dx + n.x, y: ctx.dy + n.y, w: n.width, h: n.height };
    const overlay = ctx.overlay || tagged(n);
    const clickable = isClickable(n);
    const item: Item = { node: n, box, path: ctx.path, fromMaster: master, overlay, clipped: ctx.clipped, control: ctx.control };
    if (n.type === 'text') {
      const t = n as TextNode;
      const text = fill(t.text ?? '', scope);
      item.text = text;
      if (text.trim()) {
        const ink = inkOf(t, text, box.x, box.y);
        //what a clipping or scrolling frame above it cuts off is not seen
        if (ctx.clip) {
          const x0 = Math.max(ink.x, ctx.clip.x);
          const y0 = Math.max(ink.y, ctx.clip.y);
          const x1 = Math.min(ink.x + ink.w, ctx.clip.x + ctx.clip.w);
          const y1 = Math.min(ink.y + ink.h, ctx.clip.y + ctx.clip.h);
          if (x1 > x0 && y1 > y0) item.ink = { ...ink, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        } else item.ink = ink;
      }
    }
    out.push(item);
    const kids = (n as { children?: SceneNode[] }).children;
    if (Array.isArray(kids) && kids.length) {
      const f = n as SceneNode & { clip?: boolean; scroll?: string };
      const cuts = n.type === 'frame' && (f.clip || (!!f.scroll && f.scroll !== 'none'));
      const mine: Box | null = cuts ? (ctx.clip ? { x: Math.max(box.x, ctx.clip.x), y: Math.max(box.y, ctx.clip.y), w: Math.max(0, Math.min(box.x + box.w, ctx.clip.x + ctx.clip.w) - Math.max(box.x, ctx.clip.x)), h: Math.max(0, Math.min(box.y + box.h, ctx.clip.y + ctx.clip.h) - Math.max(box.y, ctx.clip.y)) } : box) : ctx.clip;
      collect(kids, scope, out, {
        clip: mine,
        dx: box.x,
        dy: box.y,
        path: [...ctx.path, n.id],
        overlay,
        clipped: ctx.clipped || f.scroll === 'vertical' || f.scroll === 'horizontal' || f.scroll === 'both',
        control: ctx.control ?? (clickable ? n.id : undefined),
        master,
      });
    }
  }
}

const short = (s: string) => (s.length > 34 ? `${s.slice(0, 31)}...` : s).replace(/\s+/g, ' ');
const label = (i: Item) => (i.node.type === 'text' ? `${i.node.name} "${short(i.text ?? '')}"` : i.node.name);
const px = (v: number) => Math.round(v);

/** `{expression}` slots filled the way the player does it, except one that cannot be worked out here (a quiz's own variables, a recording's state) counts as a short word instead of staying as written. */
function fill(text: string, scope: ExprScope): string {
  if (!text.includes('{')) return text;
  return text.replace(/\{\{|\}\}|\{([^{}]+)\}/g, (whole, inner: string | undefined) => {
    if (whole === '{{') return '{';
    if (whole === '}}') return '}';
    try {
      const v = evaluate(inner!, scope);
      return v === undefined || v === null ? '' : String(v);
    } catch {
      return '00';
    }
  });
}

/** What a text layer's box becomes when its size follows its words: the player measures that on screen, here it is estimated. */
function textSize(n: TextNode, scope: ExprScope): { width: number; height: number } {
  const k = inkOf(n, fill(n.text ?? '', scope), 0, 0);
  return { width: n.autoSize === 'width' ? Math.ceil(k.w) : n.width, height: Math.max(1, Math.ceil(k.h)) };
}

/**
 * The page as the player draws it at the start: bindings and repeaters applied, the master's layers around it, and auto layout run
 * with every auto sized text at the size its words take (the player's `measureCopies` does that on screen for repeated copies and
 * the renderer for the rest; here the size is estimated). Returns a tree that is the checker's own, never the project's layers.
 */
function drawn(project: Project, page: Artboard, scope: ExprScope): SceneNode[] {
  const source = withMaster(project.artboards, page);
  const sizes: CopySizes = new Map();
  let nodes = prepareNodes(source, scope, { measured: sizes });
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const visit = (list: SceneNode[]) => {
      for (const n of list) {
        if (n.type === 'text' && n.id.includes(REPEAT_SEP) && n.visible && textAutoSize(n) !== 'none') {
          const size = textSize(n, scope);
          const had = sizes.get(n.id);
          if (!had || Math.abs(had.width - size.width) > 1 || Math.abs(had.height - size.height) > 1) {
            sizes.set(n.id, size);
            changed = true;
          }
        } else if (isContainer(n)) visit(n.children);
      }
    };
    visit(nodes);
    if (!changed) break;
    nodes = prepareNodes(source, scope, { measured: sizes });
  }
  const mine = structuredClone(nodes) as SceneNode[];
  //text takes the height of its words at the width the layout then gives it, which changes what the layout gives: round until it stops
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    const fit = (list: SceneNode[]) => {
      for (const n of list) {
        if (n.type === 'text' && textAutoSize(n) !== 'none') {
          const size = textSize(n, scope);
          if (Math.abs(size.width - n.width) > 0.5 || Math.abs(size.height - n.height) > 0.5) {
            Object.assign(n, size);
            changed = true;
          }
        } else if (isContainer(n)) fit(n.children);
      }
    };
    fit(mine);
    if (relayoutTree(mine)) changed = true;
    if (!changed) break;
  }
  return mine;
}

/**
 * Lays out the auto layout frames of a built project's pages, in the document itself, the way the editor does after every change
 * (the canvas draws the stored positions of a frame's children, and a built starter has never been through an edit). Auto sized
 * text takes the height its words are estimated to need, so a frame that hugs it comes out the right size. A page without an auto
 * layout frame is left alone.
 */
export function settleLayout(project: Project): void {
  for (const page of project.artboards) {
    if (page.isMaster) continue;
    let any = false;
    walkNodes(page.children, (n) => void (n.type === 'frame' && n.layout && (any = true)));
    if (!any) continue;
    const vars: Record<string, unknown> = {};
    for (const v of project.variables) vars[v.name] = startingValue(v, vars);
    const info = pageInfo(project, page);
    const scope: ExprScope = { vars, extra: { pageNumber: info.index + 1, pageCount: info.list.length, artboard: artboardScope(page, { index: info.index, count: info.list.length, group: info.group }), event: {} } };
    for (let pass = 0; pass < 12; pass++) {
      let changed = false;
      walkNodes(page.children, (n, inRepeat) => {
        if (n.type !== 'text' || inRepeat || textAutoSize(n) === 'none') return;
        const size = textSize(n, scope);
        if (Math.abs(size.width - n.width) > 0.5 || Math.abs(size.height - n.height) > 0.5) {
          Object.assign(n, size);
          changed = true;
        }
      });
      if (relayoutTree(page.children)) changed = true;
      if (!changed) break;
    }
  }
}

function walkNodes(list: SceneNode[], fn: (n: SceneNode, inRepeat: boolean) => void, inRepeat = false): void {
  for (const n of list) {
    fn(n, inRepeat);
    if (isContainer(n)) walkNodes(n.children, fn, inRepeat || !!(n as { repeat?: unknown }).repeat);
  }
}

/** Every violation on one page of a project. */
export function checkPageLayout(project: Project, page: Artboard, state?: LayoutState): LayoutViolation[] {
  const vars: Record<string, unknown> = {};
  for (const v of project.variables) vars[v.name] = state && Object.prototype.hasOwnProperty.call(state.vars, v.name) ? state.vars[v.name] : startingValue(v, vars);
  const info = pageInfo(project, page);
  const scope = {
    vars,
    extra: { pageNumber: info.index + 1, pageCount: info.list.length, artboard: artboardScope(page, { index: info.index, count: info.list.length, group: info.group }), quiz: { questions: [], score: 0, points: 0 }, event: {} },
  };
  const items: Item[] = [];
  collect(drawn(project, page, scope), scope, items, { dx: 0, dy: 0, path: [], overlay: false, clipped: false, clip: null, master: false });
  const out: LayoutViolation[] = [];
  const add = (kind: ViolationKind, a: Item, b: Item | undefined, detail: string) => out.push({ kind, page: state ? `${page.name} [${state.label}]` : page.name, a: label(a), ...(b ? { b: label(b) } : {}), detail });
  const sheet: Box = { x: 0, y: 0, w: page.width, h: page.height };

  const texts = items.filter((i) => i.ink && !i.fromMaster && !i.overlay);
  //controls: buttons and inputs, and the clickable frames (the layers inside one are its label)
  const controls = items.filter((i) => !i.overlay && !i.fromMaster && (i.node.type === 'button' || i.node.type === 'input' || (isClickable(i.node) && i.box.w > 0)));
  for (const c of controls) {
    for (const t of texts) {
      if (c.node.id === t.node.id) continue;
      //a clickable frame's own label (anything inside it) is not over it
      if (t.path.includes(c.node.id)) continue;
      //text in a control that holds this control (a button on a clickable card) is that card's
      if (c.path.includes(t.node.id)) continue;
      if (hit(c.box, t.ink!)) add('button-text', c, t, `${c.node.type === 'frame' || c.node.type === 'group' ? 'clickable frame' : c.node.type} ${px(c.box.x)},${px(c.box.y)} ${px(c.box.w)}x${px(c.box.h)} overlaps the words at ${px(t.ink!.x)},${px(t.ink!.y)} ${px(t.ink!.w)}x${px(t.ink!.h)}`);
    }
  }

  //overflow: the words running off the artboard (not inside something that scrolls)
  for (const t of texts) {
    if (t.clipped) continue;
    const k = t.ink!;
    if (k.x < -2 || k.y < -2 || k.x + k.w > sheet.w + 2 || k.y + k.h > sheet.h + 2) add('text-overflow', t, undefined, `words at ${px(k.x)},${px(k.y)} ${px(k.w)}x${px(k.h)} run off the ${sheet.w}x${sheet.h} page`);
  }

  //the brand's own layers: the accent bar and the web address (not the sweeps, which sit under everything, nor the logo, which has its own rule)
  const chromeBoxes = items.filter((i) => i.fromMaster && isChromeTag(i.node) && (i.node.type === 'rect' || i.node.type === 'text'));
  for (const c of chromeBoxes) {
    if (c.node.type === 'text' && !c.ink) continue;
    const cb = c.ink ?? c.box;
    for (const t of texts) if (hit(t.ink!, cb)) add('text-chrome', t, c, `words at ${px(t.ink!.x)},${px(t.ink!.y)} ${px(t.ink!.w)}x${px(t.ink!.h)} run into the brand layer at ${px(cb.x)},${px(cb.y)} ${px(cb.w)}x${px(cb.h)}`);
  }

  //the logo's clear space
  const logo = items.find((i) => i.fromMaster && i.node.name === 'UniSQ logo');
  if (logo) {
    const m = Math.round(logo.box.h * LOGO_CLEAR * 10) / 10;
    const zone: Box = { x: logo.box.x - m, y: logo.box.y - m, w: logo.box.w + 2 * m, h: logo.box.h + 2 * m };
    for (const i of items) {
      if (i.fromMaster || i.overlay || i.node.type === 'group') continue;
      const box = i.ink ?? i.box;
      if (!hit(box, zone, 0.5)) continue;
      const shape = ['rect', 'ellipse', 'polygon', 'star', 'path', 'frame'].includes(i.node.type);
      //a backdrop under the logo (a card, a full page rectangle) is the page's own background
      if (shape && (contains(i.box, zone) || i.box.w * i.box.h >= 0.8 * sheet.w * sheet.h)) continue;
      //a frame with nothing painted is only a place to hold layers
      if (i.node.type === 'frame' && !(i.node as { fill?: unknown }).fill && !(i.node as { stroke?: unknown }).stroke) continue;
      add('logo-clear', i, logo, `${px(box.x)},${px(box.y)} ${px(box.w)}x${px(box.h)} enters the logo's clear space ${px(zone.x)},${px(zone.y)} ${px(zone.w)}x${px(zone.h)}`);
    }
  }

  //words over words (advisory)
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      if (hit(a.ink!, b.ink!, 4)) add('text-text', a, b, `words at ${px(a.ink!.x)},${px(a.ink!.y)} ${px(a.ink!.w)}x${px(a.ink!.h)} overlap words at ${px(b.ink!.x)},${px(b.ink!.y)} ${px(b.ink!.w)}x${px(b.ink!.h)}`);
    }
  }
  return out;
}

/**
 * Every violation on every page of a project (masters and hidden library copies are not pages), as the pages start and in each of
 * the extra `states` (variable values for the pages that state names).
 */
export function checkProjectLayout(project: Project, states: LayoutState[] = []): LayoutViolation[] {
  const out: LayoutViolation[] = [];
  for (const page of project.artboards) {
    if (page.isMaster || page.library || page.canvasHidden) continue;
    out.push(...checkPageLayout(project, page));
    for (const state of states) {
      const pages = state.page === undefined ? null : Array.isArray(state.page) ? state.page : [state.page];
      if (!pages || pages.includes(page.name)) out.push(...checkPageLayout(project, page, state));
    }
  }
  return out;
}
