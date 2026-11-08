/**
 * PowerPoint (`.pptx`) import.
 *
 * A `.pptx` is a ZIP of XML parts: `ppt/presentation.xml` (slide size, slide order, default text style), one part per slide
 * with the layout it uses, which names a slide master, which names a theme. Each slide becomes an artboard.
 *
 * What comes across:
 *   - text boxes and shape text: paragraphs and runs (font, size, bold, italic, underline, strike, caps, tracking, colour),
 *     alignment, line and paragraph spacing, vertical anchor, insets and bullets (typed as characters);
 *   - placeholders take their position, text style and fill from the layout and the master when the slide leaves them out;
 *   - pictures (as project assets, with a crop kept as a clipped frame), shapes (rectangles, rounded rectangles, ellipses,
 *     triangles, diamonds, regular polygons, stars, lines and freeform paths) with solid, gradient and picture fills,
 *     outlines and shadows, and group transforms;
 *   - the background of the slide, or of its layout or master, as a colour, gradient or picture, and the decorations the
 *     layout and master draw behind the slide (locked, so they stay put while editing).
 * Not carried over, and listed in the report: charts, SmartArt, tables, embedded objects, audio and video (a poster picture is
 * kept), animations, transitions, speaker notes, arrowheads, effects other than a drop shadow and any shape drawn from a
 * preset this reader does not know (it becomes a rectangle).
 */
import { unzipSync } from 'fflate';
import { createArtboard, createNode, type Artboard, type FontRef, type Paint, type PathNode, type PathPoint, type SceneNode, type Shadow, type Stroke, type SubPath, type TextNode } from 'interactives-player';
import type { ImportedAsset } from './lottie-import';
import { FontBook, assetId, buildTextNode, cssColor, round, type RGBA, type TextPiece } from './craft-shared';

export interface PptxImport {
  artboard: Artboard;
  artboards: Artboard[];
  assets: ImportedAsset[];
  fonts: FontRef[];
  warnings: string[];
}

/** 914400 EMU to the inch, 96 px to the inch. */
const EMU = 9525;
/** Hundredths of a point to px. */
const SZ = 96 / 72 / 100;
const MAX_SLIDES = 500;
const MAX_ENTRY = 64 * 1024 * 1024;
const MAX_TOTAL = 400 * 1024 * 1024;
const MAX_DEPTH = 40;

const isZip = (b: Uint8Array): boolean => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5) && (b[3] === 4 || b[3] === 6);

/** A ZIP that holds `ppt/presentation.xml` (so a renamed file is still found by its contents). */
export function isPptx(bytes: Uint8Array): boolean {
  if (!isZip(bytes)) return false;
  try {
    return Object.keys(unzipSync(bytes, { filter: (f) => f.name === 'ppt/presentation.xml' })).length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- xml helpers

const localOf = (el: Element): string => el.localName || el.nodeName.replace(/^.*:/, '');
const kids = (el: Element | null | undefined, name?: string): Element[] => (el ? Array.from(el.children).filter((c) => !name || localOf(c) === name) : []);
const kid = (el: Element | null | undefined, name: string): Element | null => kids(el, name)[0] ?? null;
/** Follow a path of child names (`a/b/c`). */
const dig = (el: Element | null | undefined, path: string): Element | null => path.split('/').reduce<Element | null>((e, n) => (e ? kid(e, n) : null), el ?? null);
const attr = (el: Element | null | undefined, name: string): string | null => el?.getAttribute(name) ?? null;
/** A namespaced attribute (`r:embed`) by its local name, whatever the prefix. */
const nsAttr = (el: Element | null | undefined, local: string): string | null => {
  if (!el) return null;
  for (const a of Array.from(el.attributes)) if (a.name.includes(':') && a.localName === local) return a.value;
  return null;
};
const numAttr = (el: Element | null | undefined, name: string): number | null => {
  const v = attr(el, name);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const px = (emu: number): number => round(emu / EMU, 100);

function parseXml(bytes: Uint8Array | undefined): Document | null {
  if (!bytes) return null;
  try {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  } catch {
    return null;
  }
}

/** The path `target` points at, from the folder of the part that holds the relationship. */
function resolve(fromPath: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromPath.split('/').slice(0, -1);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

interface Rel {
  type: string;
  target: string;
  external: boolean;
}

interface Part {
  path: string;
  root: Element;
  rels: Map<string, Rel>;
}

// ---------------------------------------------------------------- colour

interface Theme {
  colors: Record<string, string>;
  major: string;
  minor: string;
  fills: Element[];
  lines: Element[];
  bgFills: Element[];
}

const PRESET_COLORS: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080', orange: 'ffa500', purple: '800080', cyan: '00ffff', magenta: 'ff00ff', lime: '00ff00', navy: '000080', teal: '008080', maroon: '800000', silver: 'c0c0c0',
  ltGray: 'd3d3d3', dkGray: 'a9a9a9', dkBlue: '00008b', dkRed: '8b0000', dkGreen: '006400',
};

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const hexToRgba = (hex: string): RGBA => {
  const h = hex.replace('#', '').padEnd(6, '0');
  return { r: parseInt(h.slice(0, 2), 16) || 0, g: parseInt(h.slice(2, 4), 16) || 0, b: parseInt(h.slice(4, 6), 16) || 0, a: 1 };
};

/** Where colours are looked up: the theme, the slide's colour map, and the colour a `phClr` stands for. */
interface ColorCtx {
  theme: Theme;
  clrMap: Record<string, string>;
  ph?: RGBA | null;
}

function colorOf(el: Element | null | undefined, cx: ColorCtx): RGBA | null {
  if (!el) return null;
  const name = localOf(el);
  let c: RGBA | null = null;
  if (name === 'srgbClr') c = hexToRgba(attr(el, 'val') ?? '000000');
  else if (name === 'sysClr') c = hexToRgba(attr(el, 'lastClr') ?? (attr(el, 'val') === 'window' ? 'ffffff' : '000000'));
  else if (name === 'prstClr') c = hexToRgba(PRESET_COLORS[attr(el, 'val') ?? ''] ?? '000000');
  else if (name === 'scrgbClr') c = { r: ((numAttr(el, 'r') ?? 0) / 100000) * 255, g: ((numAttr(el, 'g') ?? 0) / 100000) * 255, b: ((numAttr(el, 'b') ?? 0) / 100000) * 255, a: 1 };
  else if (name === 'hslClr') {
    const [r, g, b] = hslToRgb((numAttr(el, 'hue') ?? 0) / 21600000, (numAttr(el, 'sat') ?? 0) / 100000, (numAttr(el, 'lum') ?? 0) / 100000);
    c = { r, g, b, a: 1 };
  } else if (name === 'schemeClr') {
    const v = attr(el, 'val') ?? 'tx1';
    if (v === 'phClr') c = cx.ph ? { ...cx.ph } : null;
    else {
      const key = cx.clrMap[v] ?? v;
      c = hexToRgba(cx.theme.colors[key] ?? cx.theme.colors[v] ?? (key === 'lt1' || key === 'bg1' ? 'ffffff' : '000000'));
    }
  }
  if (!c) return null;
  for (const m of kids(el)) {
    const v = (numAttr(m, 'val') ?? 0) / 100000;
    switch (localOf(m)) {
      case 'alpha':
        c.a = v;
        break;
      case 'alphaMod':
        c.a *= v;
        break;
      case 'alphaOff':
        c.a = Math.max(0, Math.min(1, c.a + v));
        break;
      case 'lumMod':
      case 'lumOff':
      case 'satMod':
      case 'satOff': {
        const [h, s, l] = rgbToHsl(c.r, c.g, c.b);
        const k = localOf(m);
        const l2 = k === 'lumMod' ? l * v : k === 'lumOff' ? l + v : l;
        const s2 = k === 'satMod' ? s * v : k === 'satOff' ? s + v : s;
        const [r, g, b] = hslToRgb(h, Math.max(0, Math.min(1, s2)), Math.max(0, Math.min(1, l2)));
        c = { ...c, r, g, b };
        break;
      }
      case 'tint':
        c = { ...c, r: 255 - (255 - c.r) * v, g: 255 - (255 - c.g) * v, b: 255 - (255 - c.b) * v };
        break;
      case 'shade':
        c = { ...c, r: c.r * v, g: c.g * v, b: c.b * v };
        break;
      case 'inv':
        c = { ...c, r: 255 - c.r, g: 255 - c.g, b: 255 - c.b };
        break;
      case 'gray': {
        const lum: number = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        c = { ...c, r: lum, g: lum, b: lum };
        break;
      }
    }
  }
  return c;
}

/** The first colour element inside a fill or style element. */
const colorIn = (el: Element | null | undefined, cx: ColorCtx): RGBA | null => {
  for (const k of kids(el)) {
    const c = colorOf(k, cx);
    if (c) return c;
  }
  return null;
};

const css = (c: RGBA): string => cssColor(c);

// ---------------------------------------------------------------- text styles

/** What a run says about its look; every field is optional so levels can be layered. */
interface RunProps {
  sz?: number;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  strike?: boolean;
  caps?: boolean;
  spc?: number;
  color?: string;
  font?: string;
}

interface Bullet {
  kind: 'none' | 'char' | 'num';
  char?: string;
  numType?: string;
  start?: number;
}

/** What a paragraph level says, layered the same way. */
interface Level {
  algn?: string;
  lnPct?: number;
  lnPts?: number;
  befPct?: number;
  befPts?: number;
  aftPct?: number;
  aftPts?: number;
  bullet?: Bullet;
  rPr: RunProps;
}

function mergeRun(into: RunProps, el: Element | null, cx: ColorCtx, theme: Theme): void {
  if (!el) return;
  const sz = numAttr(el, 'sz');
  if (sz !== null) into.sz = sz;
  const b = attr(el, 'b');
  if (b !== null) into.b = b === '1' || b === 'true';
  const i = attr(el, 'i');
  if (i !== null) into.i = i === '1' || i === 'true';
  const u = attr(el, 'u');
  if (u !== null) into.u = u !== 'none';
  const st = attr(el, 'strike');
  if (st !== null) into.strike = st !== 'noStrike';
  const cap = attr(el, 'cap');
  if (cap !== null) into.caps = cap === 'all';
  const spc = numAttr(el, 'spc');
  if (spc !== null) into.spc = spc;
  const fill = kid(el, 'solidFill') ?? kid(el, 'gradFill');
  if (fill) {
    const c = localOf(fill) === 'gradFill' ? colorIn(dig(fill, 'gsLst/gs'), cx) : colorIn(fill, cx);
    if (c) into.color = css(c);
  }
  const latin = kid(el, 'latin')?.getAttribute('typeface');
  if (latin) into.font = latin === '+mj-lt' ? theme.major : latin === '+mn-lt' ? theme.minor : latin;
}

function mergeLevel(into: Level, el: Element | null, cx: ColorCtx, theme: Theme): void {
  if (!el) return;
  const algn = attr(el, 'algn');
  if (algn) into.algn = algn;
  const ln = kid(el, 'lnSpc');
  if (ln) {
    const pct = numAttr(kid(ln, 'spcPct'), 'val');
    const pts = numAttr(kid(ln, 'spcPts'), 'val');
    if (pct !== null) {
      into.lnPct = pct / 100000;
      into.lnPts = undefined;
    } else if (pts !== null) {
      into.lnPts = pts / 100;
      into.lnPct = undefined;
    }
  }
  for (const [tag, pct, pts] of [['spcBef', 'befPct', 'befPts'], ['spcAft', 'aftPct', 'aftPts']] as const) {
    const s = kid(el, tag);
    if (!s) continue;
    const p = numAttr(kid(s, 'spcPct'), 'val');
    const q = numAttr(kid(s, 'spcPts'), 'val');
    if (p !== null) {
      into[pct] = p / 100000;
      into[pts] = undefined;
    } else if (q !== null) {
      into[pts] = q / 100;
      into[pct] = undefined;
    }
  }
  if (kid(el, 'buNone')) into.bullet = { kind: 'none' };
  const bc = kid(el, 'buChar');
  if (bc) into.bullet = { kind: 'char', char: attr(bc, 'char') ?? '•' };
  const ba = kid(el, 'buAutoNum');
  if (ba) into.bullet = { kind: 'num', numType: attr(ba, 'type') ?? 'arabicPeriod', start: numAttr(ba, 'startAt') ?? 1 };
  if (kid(el, 'buBlip')) into.bullet = { kind: 'char', char: '•' };
  mergeRun(into.rPr, kid(el, 'defRPr'), cx, theme);
}

/** The level `n` (0-8) of a list style element (`a:lvl1pPr` ...), merged onto `into`. */
function mergeStyle(into: Level, style: Element | null, n: number, cx: ColorCtx, theme: Theme): void {
  if (!style) return;
  if (n === 0) mergeLevel(into, kid(style, 'defPPr'), cx, theme);
  mergeLevel(into, kid(style, `lvl${n + 1}pPr`), cx, theme);
}

function numberLabel(type: string, n: number): string {
  const alpha = (k: number): string => {
    let s = '';
    let v = k;
    while (v > 0) {
      s = String.fromCharCode(97 + ((v - 1) % 26)) + s;
      v = Math.floor((v - 1) / 26);
    }
    return s;
  };
  const roman = (k: number): string => {
    const t: [number, string][] = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
    let s = '';
    let v = k;
    for (const [val, sym] of t) while (v >= val) ((s += sym), (v -= val));
    return s;
  };
  let body: string;
  if (/^alphaLc/.test(type)) body = alpha(n);
  else if (/^alphaUc/.test(type)) body = alpha(n).toUpperCase();
  else if (/^romanLc/.test(type)) body = roman(n);
  else if (/^romanUc/.test(type)) body = roman(n).toUpperCase();
  else body = String(n);
  if (/ParenBoth/.test(type)) return `(${body})`;
  if (/ParenR/.test(type)) return `${body})`;
  return `${body}.`;
}

// ---------------------------------------------------------------- the importer

interface Mapper {
  /** A rectangle in the coordinate space of the tree being read, in EMU, to px relative to the parent node. */
  rect(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number };
}

const TOP: Mapper = { rect: (x, y, w, h) => ({ x: px(x), y: px(y), w: px(w), h: px(h) }) };

interface Scene {
  /** The part the shapes are read from (slide, layout or master), for picture relationships. */
  part: Part;
  cx: ColorCtx;
  slide: number;
  /** Layout and master decorations are locked and named so. */
  template: string | null;
  /** The slide's layout and master, for placeholders (null while reading those two). */
  layout: Part | null;
  master: Part | null;
}

const SKIP_LABELS: Record<string, string> = {
  chart: 'Charts were not imported',
  smartart: 'SmartArt was not imported',
  table: 'Tables were not imported',
  object: 'Embedded objects were not imported',
  media: 'Audio and video were not imported (their poster pictures were kept)',
  animation: 'Animations were not imported',
  transition: 'Slide transitions were not imported',
  notes: 'Speaker notes were not imported',
  picture: 'Pictures that are linked rather than embedded, or saved as EMF, WMF or TIFF, were not imported',
  vertical: 'Vertical text was drawn horizontally',
  arrowheads: 'Arrowheads on lines were dropped',
  connectors: 'Elbow and curved connectors were drawn as straight lines',
  preset: 'Shapes with presets this importer does not draw were drawn as rectangles',
  arc: 'Arcs in freeform shapes were drawn as straight lines',
  effects: 'Glow, reflection, soft edge and 3D effects were dropped',
  bullets: 'Bullets and numbering were typed as characters, and list indents were not kept',
  align: 'Paragraphs with different alignment took the alignment of the first one',
  fill: 'Pattern fills were drawn as their foreground colour',
  crop: 'Crops on pictures that are also rotated or flipped may be off',
  hidden: 'Hidden slides were imported like the others',
};

class Importer {
  readonly files: Record<string, Uint8Array>;
  readonly fonts = new FontBook();
  readonly assets: ImportedAsset[] = [];
  private readonly assetByPath = new Map<string, string>();
  private readonly parts = new Map<string, Part | null>();
  private readonly themes = new Map<string, Theme>();
  private readonly skips = new Map<string, Set<number>>();
  readonly notes = new Set<string>();
  defaultStyle: Element | null = null;
  presentationTheme: Theme | null = null;

  constructor(files: Record<string, Uint8Array>) {
    this.files = files;
  }

  skip(kind: string, slide: number): void {
    if (!this.skips.has(kind)) this.skips.set(kind, new Set());
    this.skips.get(kind)!.add(slide);
  }

  report(): string[] {
    const out: string[] = [];
    for (const [kind, slides] of this.skips) {
      const list = [...slides].sort((a, b) => a - b);
      const where = list.length === 0 || kind === 'hidden' ? '' : list.length > 6 ? ` (${list.length} slides)` : ` (${list.length > 1 ? 'slides' : 'slide'} ${list.join(', ')})`;
      out.push(`${SKIP_LABELS[kind] ?? kind}${where}`);
    }
    return [...out, ...this.notes];
  }

  part(path: string): Part | null {
    if (this.parts.has(path)) return this.parts.get(path)!;
    const doc = parseXml(this.files[path]);
    let part: Part | null = null;
    if (doc?.documentElement) {
      const rels = new Map<string, Rel>();
      const dir = path.split('/').slice(0, -1).join('/');
      const relDoc = parseXml(this.files[`${dir ? `${dir}/` : ''}_rels/${path.split('/').pop()}.rels`]);
      if (relDoc) {
        for (const r of Array.from(relDoc.getElementsByTagName('Relationship'))) {
          const id = r.getAttribute('Id');
          const target = r.getAttribute('Target');
          if (!id || !target) continue;
          const external = r.getAttribute('TargetMode') === 'External';
          rels.set(id, { type: r.getAttribute('Type') ?? '', target: external ? target : resolve(path, target), external });
        }
      }
      part = { path, root: doc.documentElement, rels };
    }
    this.parts.set(path, part);
    return part;
  }

  relOfType(part: Part, suffix: string): Rel | null {
    for (const r of part.rels.values()) if (r.type.endsWith(`/${suffix}`)) return r;
    return null;
  }

  theme(master: Part | null): Theme {
    const rel = master ? this.relOfType(master, 'theme') : null;
    const path = rel?.target ?? '';
    const known = this.themes.get(path);
    if (known) return known;
    const colors: Record<string, string> = { dk1: '000000', lt1: 'ffffff', dk2: '44546a', lt2: 'e7e6e6', accent1: '4472c4', accent2: 'ed7d31', accent3: 'a5a5a5', accent4: 'ffc000', accent5: '5b9bd5', accent6: '70ad47', hlink: '0563c1', folHlink: '954f72' };
    let major = 'Calibri Light';
    let minor = 'Calibri';
    let fills: Element[] = [];
    let lines: Element[] = [];
    let bgFills: Element[] = [];
    const doc = rel ? this.part(path) : null;
    if (doc) {
      const scheme = dig(doc.root, 'themeElements/clrScheme');
      for (const c of kids(scheme)) {
        const inner = kids(c)[0];
        if (!inner) continue;
        const v = localOf(inner) === 'sysClr' ? attr(inner, 'lastClr') : attr(inner, 'val');
        if (v) colors[localOf(c)] = v;
      }
      major = attr(dig(doc.root, 'themeElements/fontScheme/majorFont/latin'), 'typeface') || major;
      minor = attr(dig(doc.root, 'themeElements/fontScheme/minorFont/latin'), 'typeface') || minor;
      const fmt = dig(doc.root, 'themeElements/fmtScheme');
      fills = kids(kid(fmt, 'fillStyleLst'));
      lines = kids(kid(fmt, 'lnStyleLst'));
      bgFills = kids(kid(fmt, 'bgFillStyleLst'));
    }
    const t: Theme = { colors, major, minor, fills, lines, bgFills };
    this.themes.set(path, t);
    return t;
  }

  /** A picture from the package as a project asset (once per file). Null when it can't be one. */
  media(path: string): string | null {
    const known = this.assetByPath.get(path);
    if (known) return known;
    const bytes = this.files[path];
    if (!bytes) return null;
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const mime = ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif' } as Record<string, string>)[ext];
    if (!mime) return null;
    const id = assetId();
    this.assets.push({ id, name: path.split('/').pop() ?? `image.${ext}`, mime, bytes });
    this.assetByPath.set(path, id);
    return id;
  }

  // ------------------------------------------------------------ paints

  /** `a:solidFill`, `a:gradFill`, `a:blipFill`, `a:pattFill`, `a:noFill` or `a:grpFill` as a paint. `undefined` means "not a fill element". */
  paintOf(el: Element, sc: Scene): Paint | null | undefined {
    switch (localOf(el)) {
      case 'noFill':
        return null;
      case 'solidFill': {
        const c = colorIn(el, sc.cx);
        return c ? { type: 'solid', color: css(c) } : null;
      }
      case 'gradFill': {
        const stops = kids(kid(el, 'gsLst'), 'gs')
          .map((gs) => ({ offset: Math.max(0, Math.min(1, (numAttr(gs, 'pos') ?? 0) / 100000)), color: css(colorIn(gs, sc.cx) ?? { r: 0, g: 0, b: 0, a: 1 }) }))
          .sort((a, b) => a.offset - b.offset);
        if (stops.length < 2) return stops.length ? { type: 'solid', color: stops[0].color } : null;
        if (kid(el, 'path')) return { type: 'radial', stops };
        const ang = numAttr(kid(el, 'lin'), 'ang') ?? 0;
        return { type: 'linear', angle: Math.round((ang / 60000 + 90) % 360), stops };
      }
      case 'blipFill': {
        const id = this.blipAsset(kid(el, 'blip'), sc);
        return id ? { type: 'image', assetId: id, fit: kid(el, 'tile') ? 'cover' : 'fill' } : null;
      }
      case 'pattFill': {
        this.skip('fill', sc.slide);
        const c = colorIn(kid(el, 'fgClr'), sc.cx);
        return c ? { type: 'solid', color: css(c) } : null;
      }
      case 'grpFill':
        return null;
      default:
        return undefined;
    }
  }

  blipAsset(blip: Element | null, sc: Scene): string | null {
    const rid = nsAttr(blip, 'embed');
    if (!rid) return null;
    const rel = sc.part.rels.get(rid);
    if (!rel || rel.external) return null;
    return this.media(rel.target);
  }

  /** The fill an `spPr` (or `bgPr`) element carries, or a theme fill style. `undefined` when it says nothing. */
  fillOf(spPr: Element | null, sc: Scene): Paint | null | undefined {
    for (const k of kids(spPr)) {
      const p = this.paintOf(k, sc);
      if (p !== undefined) return p;
    }
    return undefined;
  }

  /** A style reference (`a:fillRef`, `a:lnRef`, `a:bgRef`): index into the theme's list, with the colour inside as `phClr`. */
  styleFill(ref: Element | null, list: Element[], sc: Scene): Paint | null | undefined {
    if (!ref) return undefined;
    const idx = numAttr(ref, 'idx') ?? 0;
    if (idx <= 0) return null;
    const ph = colorIn(ref, sc.cx);
    const style = list[(idx >= 1001 ? idx - 1001 : idx - 1) % Math.max(1, list.length)];
    if (!style) return ph ? { type: 'solid', color: css(ph) } : null;
    return this.paintOf(style, { ...sc, cx: { ...sc.cx, ph } });
  }

  strokeOf(sp: Element, sc: Scene, open: boolean): Stroke | null {
    const spPr = kid(sp, 'spPr');
    const own = kid(spPr, 'ln');
    const ref = dig(sp, 'style/lnRef');
    const refIdx = numAttr(ref, 'idx') ?? 0;
    const themeLn = refIdx > 0 ? sc.cx.theme.lines[(refIdx - 1) % Math.max(1, sc.cx.theme.lines.length)] ?? null : null;
    const ph = colorIn(ref, sc.cx);
    let paint: Paint | null | undefined = own ? this.fillOf(own, sc) : undefined;
    if (paint === undefined && refIdx > 0) {
      paint = (themeLn ? this.fillOf(themeLn, { ...sc, cx: { ...sc.cx, ph } }) : undefined) ?? (ph ? { type: 'solid', color: css(ph) } : null);
    }
    if (!paint) return null;
    const src = own ?? themeLn;
    const stroke: Stroke = { paint, width: Math.max(0.5, px(numAttr(own, 'w') ?? numAttr(themeLn, 'w') ?? 9525)) };
    const cap = attr(own, 'cap') ?? attr(themeLn, 'cap');
    if (cap === 'rnd') stroke.cap = 'round';
    else if (cap === 'sq') stroke.cap = 'square';
    else if (open) stroke.cap = 'butt';
    const line = (k: string): Element | null => kid(own, k) ?? kid(themeLn, k);
    if (line('round')) stroke.join = 'round';
    else if (line('bevel')) stroke.join = 'bevel';
    else if (line('miter')) stroke.join = 'miter';
    const dash = attr(line('prstDash'), 'val');
    const w = stroke.width;
    const dashes: Record<string, number[]> = { dash: [4 * w, 3 * w], sysDash: [3 * w, w], dot: [w, 3 * w], sysDot: [w, w], lgDash: [8 * w, 3 * w], dashDot: [4 * w, 3 * w, w, 3 * w], sysDashDot: [3 * w, w, w, w], lgDashDot: [8 * w, 3 * w, w, 3 * w] };
    if (dash && dashes[dash]) stroke.dash = dashes[dash].map((v) => round(v, 100));
    for (const end of ['headEnd', 'tailEnd']) {
      const t = attr(src ? kid(src, end) : null, 'type');
      if (t && t !== 'none') this.skip('arrowheads', sc.slide);
    }
    return stroke;
  }

  shadowOf(spPr: Element | null, sc: Scene): Shadow | null {
    const sh = dig(spPr, 'effectLst/outerShdw');
    if (!sh) {
      if (kid(kid(spPr, 'effectLst'), 'glow') || kid(kid(spPr, 'effectLst'), 'reflection') || kid(kid(spPr, 'effectLst'), 'softEdge') || kid(spPr, 'scene3d') || kid(spPr, 'sp3d')) this.skip('effects', sc.slide);
      return null;
    }
    const dist = px(numAttr(sh, 'dist') ?? 0);
    const dir = ((numAttr(sh, 'dir') ?? 0) / 60000) * (Math.PI / 180);
    const color = colorIn(sh, sc.cx) ?? { r: 0, g: 0, b: 0, a: 0.4 };
    return { x: round(Math.cos(dir) * dist, 100), y: round(Math.sin(dir) * dist, 100), blur: px(numAttr(sh, 'blurRad') ?? 0), spread: 0, color: css(color) };
  }

  // ------------------------------------------------------------ placeholders

  /** The layout (then master) shapes a slide placeholder inherits from, nearest first. */
  phChain(sp: Element, sc: Scene): Element[] {
    const ph = dig(sp, 'nvSpPr/nvPr/ph');
    if (!ph || !sc.layout) return [];
    const type = attr(ph, 'type');
    const idx = attr(ph, 'idx');
    const norm = (t: string | null): string => (!t || t === 'obj' || t === 'subTitle' || t === 'pic' || t === 'chart' || t === 'tbl' || t === 'media' || t === 'clipArt' || t === 'dgm' ? 'body' : t === 'ctrTitle' ? 'title' : t);
    const find = (part: Part | null, byIdx: boolean): Element | null => {
      if (!part) return null;
      const list = kids(dig(part.root, 'cSld/spTree'), 'sp');
      let hit: Element | null = null;
      if (byIdx && idx !== null) hit = list.find((s) => attr(dig(s, 'nvSpPr/nvPr/ph'), 'idx') === idx) ?? null;
      if (!hit) hit = list.find((s) => { const p = dig(s, 'nvSpPr/nvPr/ph'); return !!p && (attr(p, 'type') === type || norm(attr(p, 'type')) === norm(type)); }) ?? null;
      return hit;
    };
    const out: Element[] = [];
    const l = find(sc.layout, true);
    if (l) out.push(l);
    // the layout's own placeholder says which type to look for on the master
    const lph = l ? dig(l, 'nvSpPr/nvPr/ph') : null;
    const mtype = norm(lph ? attr(lph, 'type') : type);
    const m = sc.master ? kids(dig(sc.master.root, 'cSld/spTree'), 'sp').find((s) => norm(attr(dig(s, 'nvSpPr/nvPr/ph'), 'type')) === mtype && !!dig(s, 'nvSpPr/nvPr/ph')) ?? null : null;
    if (m) out.push(m);
    return out;
  }

  // ------------------------------------------------------------ the tree

  /** Convert the children of a shape tree (or group) into nodes. */
  convertTree(parent: Element, map: Mapper, sc: Scene, out: SceneNode[], depth = 0): void {
    if (depth > MAX_DEPTH) return;
    const list: Element[] = [];
    const add = (el: Element): void => {
      if (localOf(el) === 'AlternateContent') {
        const fb = kid(el, 'Fallback');
        const ch = kid(el, 'Choice');
        for (const k of kids(fb ?? ch)) add(k);
      } else list.push(el);
    };
    for (const k of kids(parent)) add(k);
    for (const el of list) {
      let node: SceneNode | null = null;
      try {
        switch (localOf(el)) {
          case 'sp':
            node = this.shape(el, map, sc);
            break;
          case 'cxnSp':
            node = this.shape(el, map, sc);
            break;
          case 'pic':
            node = this.picture(el, map, sc);
            break;
          case 'grpSp':
            node = this.group(el, map, sc, depth);
            break;
          case 'graphicFrame':
            this.graphicFrame(el, sc);
            break;
          case 'contentPart':
            this.skip('object', sc.slide);
            break;
        }
      } catch {
        this.notes.add('Some shapes could not be read and were left out');
      }
      if (node) {
        if (sc.template) {
          node.locked = true;
          node.name = `${sc.template}: ${node.name}`;
        }
        out.push(node);
      }
    }
  }

  graphicFrame(el: Element, sc: Scene): void {
    const uri = attr(dig(el, 'graphic/graphicData'), 'uri') ?? '';
    if (/\/table$/.test(uri)) this.skip('table', sc.slide);
    else if (/\/chart/.test(uri)) this.skip('chart', sc.slide);
    else if (/\/diagram/.test(uri)) this.skip('smartart', sc.slide);
    else this.skip('object', sc.slide);
  }

  /** The `xfrm` of a shape's `spPr` (or a group's `grpSpPr`) in EMU, or one inherited from a placeholder. */
  xfrm(sp: Element, sc: Scene): { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean } | null {
    const read = (e: Element | null): { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean } | null => {
      const x = kid(e, 'xfrm');
      const off = kid(x, 'off');
      const ext = kid(x, 'ext');
      if (!x || !off || !ext) return null;
      return {
        x: numAttr(off, 'x') ?? 0,
        y: numAttr(off, 'y') ?? 0,
        w: Math.max(0, numAttr(ext, 'cx') ?? 0),
        h: Math.max(0, numAttr(ext, 'cy') ?? 0),
        rot: (numAttr(x, 'rot') ?? 0) / 60000,
        flipH: attr(x, 'flipH') === '1' || attr(x, 'flipH') === 'true',
        flipV: attr(x, 'flipV') === '1' || attr(x, 'flipV') === 'true',
      };
    };
    const own = read(kid(sp, localOf(sp) === 'grpSp' ? 'grpSpPr' : 'spPr'));
    if (own) return own;
    for (const inh of this.phChain(sp, sc)) {
      const r = read(kid(inh, 'spPr'));
      if (r) return r;
    }
    return null;
  }

  group(el: Element, map: Mapper, sc: Scene, depth: number): SceneNode | null {
    const gp = kid(el, 'grpSpPr');
    const x = kid(gp, 'xfrm');
    const off = kid(x, 'off');
    const ext = kid(x, 'ext');
    const choff = kid(x, 'chOff');
    const chext = kid(x, 'chExt');
    if (!x || !off || !ext) return null;
    const ox = numAttr(off, 'x') ?? 0;
    const oy = numAttr(off, 'y') ?? 0;
    const w = numAttr(ext, 'cx') ?? 0;
    const h = numAttr(ext, 'cy') ?? 0;
    const cox = numAttr(choff, 'x') ?? ox;
    const coy = numAttr(choff, 'y') ?? oy;
    const cw = numAttr(chext, 'cx') || w || 1;
    const ch = numAttr(chext, 'cy') || h || 1;
    const sx = w / cw;
    const sy = h / ch;
    const own = map.rect(ox, oy, w, h);
    const inner: Mapper = { rect: (cx, cy, cwid, chei) => ({ x: px((cx - cox) * sx), y: px((cy - coy) * sy), w: px(cwid * sx), h: px(chei * sy) }) };
    const children: SceneNode[] = [];
    this.convertTree(el, inner, { ...sc, template: null }, children, depth + 1);
    if (!children.length) return null;
    const node = createNode('group', {
      name: attr(dig(el, 'nvGrpSpPr/cNvPr'), 'name') || 'Group',
      x: own.x,
      y: own.y,
      width: Math.max(0.01, own.w),
      height: Math.max(0.01, own.h),
      children,
    });
    const rot = (numAttr(x, 'rot') ?? 0) / 60000;
    if (rot) node.rotation = round(rot, 100);
    if (attr(x, 'flipH') === '1') node.scaleX = -1;
    if (attr(x, 'flipV') === '1') node.scaleY = -1;
    return node;
  }

  picture(el: Element, map: Mapper, sc: Scene): SceneNode | null {
    const nv = dig(el, 'nvPicPr');
    const name = attr(kid(nv, 'cNvPr'), 'name') || 'Picture';
    const alt = attr(kid(nv, 'cNvPr'), 'descr');
    const nvPr = kid(nv, 'nvPr');
    if (nvPr && Array.from(nvPr.getElementsByTagName('*')).some((e) => ['videoFile', 'audioFile', 'media', 'wavAudioFile'].includes(localOf(e)))) this.skip('media', sc.slide);
    const bf = kid(el, 'blipFill');
    const id = this.blipAsset(kid(bf, 'blip'), sc);
    if (!id) {
      this.skip('picture', sc.slide);
      return null;
    }
    const xf = this.xfrm(el, sc);
    if (!xf) return null;
    const r = map.rect(xf.x, xf.y, xf.w, xf.h);
    const src = kid(bf, 'srcRect');
    const crop = { l: (numAttr(src, 'l') ?? 0) / 100000, t: (numAttr(src, 't') ?? 0) / 100000, r: (numAttr(src, 'r') ?? 0) / 100000, b: (numAttr(src, 'b') ?? 0) / 100000 };
    const cropped = crop.l || crop.t || crop.r || crop.b;
    const flips = (n: SceneNode): void => {
      if (xf.flipH) n.scaleX = -1;
      if (xf.flipV) n.scaleY = -1;
    };
    let node: SceneNode;
    if (cropped && crop.l + crop.r < 0.99 && crop.t + crop.b < 0.99) {
      // the whole picture, larger than the frame, with the frame clipping it
      const fw = r.w / (1 - crop.l - crop.r);
      const fh = r.h / (1 - crop.t - crop.b);
      const image = createNode('image', { name, assetId: id, fit: 'fill', x: round(-crop.l * fw, 100) || 0, y: round(-crop.t * fh, 100) || 0, width: round(fw, 100), height: round(fh, 100) });
      node = createNode('frame', { name, x: r.x, y: r.y, width: r.w, height: r.h, clip: true, fill: null, stroke: null, children: [image] });
      if (xf.rot && (xf.flipH || xf.flipV)) this.skip('crop', sc.slide);
    } else {
      node = createNode('image', { name, assetId: id, fit: 'fill', x: r.x, y: r.y, width: r.w, height: r.h });
    }
    if (xf.rot) node.rotation = round(xf.rot, 100);
    flips(node);
    if (alt) node.ariaLabel = alt;
    const geom = attr(dig(el, 'spPr/prstGeom'), 'prst');
    if (geom === 'roundRect' && node.type === 'image') node.cornerRadius = round(Math.min(r.w, r.h) * 0.16667, 100);
    return node;
  }

  // ------------------------------------------------------------ shapes

  shape(sp: Element, map: Mapper, sc: Scene): SceneNode | null {
    const isPh = !!dig(sp, 'nvSpPr/nvPr/ph');
    // a placeholder on the layout or master is a prompt, not something drawn on the slide
    if (isPh && sc.template) return null;
    const nvPr = localOf(sp) === 'cxnSp' ? dig(sp, 'nvCxnSpPr') : dig(sp, 'nvSpPr');
    const name = attr(kid(nvPr, 'cNvPr'), 'name') || 'Shape';
    const alt = attr(kid(nvPr, 'cNvPr'), 'descr');
    const xf = this.xfrm(sp, sc);
    if (!xf) return null;
    const r = map.rect(xf.x, xf.y, xf.w, xf.h);
    const chain = this.phChain(sp, sc);
    const spPr = kid(sp, 'spPr');
    // paints: the shape's own, then the placeholder's it inherits, then its style reference
    let fill: Paint | null | undefined = this.fillOf(spPr, sc);
    if (fill === undefined) for (const c of chain) if ((fill = this.fillOf(kid(c, 'spPr'), sc)) !== undefined) break;
    if (fill === undefined) fill = this.styleFill(dig(sp, 'style/fillRef'), sc.cx.theme.fills, sc);
    const geom = this.geometry(sp, spPr, r.w, r.h, sc);
    let stroke: Stroke | null = this.strokeOf(sp, sc, !geom.closed);
    if (!kid(spPr, 'ln')) for (const c of chain) if (kid(kid(c, 'spPr'), 'ln')) { stroke = this.strokeOf(c, sc, !geom.closed); break; }
    if (!geom.closed) fill = null;
    const shadow = this.shadowOf(spPr, sc);
    const hasGeom = !!(fill || stroke);
    const text = this.text(sp, chain, r.w, r.h, sc);
    if (!hasGeom && !text) return null;

    let shapeNode: SceneNode | null = null;
    if (hasGeom) {
      shapeNode = this.geometryNode(name, geom, r.w, r.h);
      Object.assign(shapeNode, { fill: fill ?? null, stroke });
      if (shadow) shapeNode.shadow = shadow;
      if (xf.flipH && geom.kind !== 'line') shapeNode.scaleX = -1;
      if (xf.flipV && geom.kind !== 'line') shapeNode.scaleY = -1;
      if (geom.kind === 'line') this.orientLine(shapeNode as PathNode, xf.flipH, xf.flipV);
    }
    let node: SceneNode;
    if (shapeNode && text) {
      node = createNode('group', { name, x: r.x, y: r.y, width: Math.max(0.01, r.w), height: Math.max(0.01, r.h), children: [shapeNode, text] });
    } else if (shapeNode) {
      shapeNode.x = r.x;
      shapeNode.y = r.y;
      node = shapeNode;
      node.name = name;
    } else {
      node = text!;
      node.x += r.x;
      node.y += r.y;
      node.name = name;
    }
    if (xf.rot) node.rotation = round(xf.rot, 100);
    if (alt) node.ariaLabel = alt;
    return node;
  }

  /** The outline of a shape: a preset (with its adjust values) or a freeform path. */
  geometry(sp: Element, spPr: Element | null, w: number, h: number, sc: Scene): Geometry {
    const cust = kid(spPr, 'custGeom');
    if (cust) return this.custom(cust, w, h, sc);
    const prst = kid(spPr, 'prstGeom');
    const name = attr(prst, 'prst') ?? (localOf(sp) === 'cxnSp' ? 'line' : 'rect');
    const adj = (k: string, d: number): number => {
      for (const gd of kids(kid(prst, 'avLst'), 'gd')) {
        if (attr(gd, 'name') === k) {
          const m = /val\s+(-?\d+)/.exec(attr(gd, 'fmla') ?? '');
          if (m) return Number(m[1]);
        }
      }
      return d;
    };
    switch (name) {
      case 'rect':
      case 'flowChartProcess':
      case 'flowChartAlternateProcess':
      case 'textBox':
        return { kind: 'rect', closed: true, radius: 0 };
      case 'roundRect':
        return { kind: 'rect', closed: true, radius: Math.min(w, h) * Math.min(50000, Math.max(0, adj('adj', 16667))) / 100000 };
      case 'ellipse':
      case 'flowChartConnector':
        return { kind: 'ellipse', closed: true };
      case 'line':
      case 'straightConnector1':
        return { kind: 'line', closed: false };
      case 'bentConnector2':
      case 'bentConnector3':
      case 'bentConnector4':
      case 'bentConnector5':
      case 'curvedConnector2':
      case 'curvedConnector3':
      case 'curvedConnector4':
      case 'curvedConnector5':
        this.skip('connectors', sc.slide);
        return { kind: 'line', closed: false };
      case 'triangle': {
        const a = (Math.min(100000, Math.max(0, adj('adj', 50000))) / 100000) * w;
        return { kind: 'path', closed: true, paths: [{ closed: true, points: [{ x: a, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }] };
      }
      case 'rtTriangle':
        return { kind: 'path', closed: true, paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: w, y: h }, { x: 0, y: h }] }] };
      case 'diamond':
      case 'flowChartDecision':
        return { kind: 'path', closed: true, paths: [{ closed: true, points: [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }] }] };
      case 'pentagon':
        return { kind: 'polygon', closed: true, sides: 5 };
      case 'hexagon':
        return { kind: 'polygon', closed: true, sides: 6 };
      case 'octagon':
        return { kind: 'polygon', closed: true, sides: 8 };
      case 'star4':
        return { kind: 'star', closed: true, points: 4, ratio: 0.38 };
      case 'star5':
        return { kind: 'star', closed: true, points: 5, ratio: 0.38 };
      case 'star6':
        return { kind: 'star', closed: true, points: 6, ratio: 0.58 };
      case 'star8':
        return { kind: 'star', closed: true, points: 8, ratio: 0.7 };
      default:
        this.skip('preset', sc.slide);
        return { kind: 'rect', closed: true, radius: 0 };
    }
  }

  custom(cust: Element, w: number, h: number, sc: Scene): Geometry {
    const paths: SubPath[] = [];
    let closed = false;
    for (const p of kids(kid(cust, 'pathLst'), 'path')) {
      const pw = numAttr(p, 'w') || 0;
      const ph = numAttr(p, 'h') || 0;
      // a path with no w/h of its own is in the shape's EMU size
      const sx = pw ? w / pw : 1 / EMU;
      const sy = ph ? h / ph : 1 / EMU;
      const pt = (e: Element | null): { x: number; y: number } => ({ x: (numAttr(e, 'x') ?? 0) * sx, y: (numAttr(e, 'y') ?? 0) * sy });
      let cur: SubPath | null = null;
      const flush = (): void => {
        if (cur && cur.points.length > 1) paths.push(cur);
        cur = null;
      };
      for (const c of kids(p)) {
        const op = localOf(c);
        if (op === 'moveTo') {
          flush();
          cur = { closed: false, points: [pt(kid(c, 'pt'))] };
        } else if (op === 'lnTo' && cur) {
          cur.points.push(pt(kid(c, 'pt')));
        } else if ((op === 'cubicBezTo' || op === 'quadBezTo') && cur) {
          const ps = kids(c, 'pt').map((e) => pt(e));
          const last = cur.points[cur.points.length - 1] as PathPoint;
          const end = ps[ps.length - 1];
          if (!end) continue;
          const [c1, c2] = op === 'cubicBezTo' ? [ps[0], ps[1] ?? ps[0]] : [{ x: last.x + (2 / 3) * (ps[0].x - last.x), y: last.y + (2 / 3) * (ps[0].y - last.y) }, { x: end.x + (2 / 3) * (ps[0].x - end.x), y: end.y + (2 / 3) * (ps[0].y - end.y) }];
          last.out = { x: round(c1.x - last.x, 100), y: round(c1.y - last.y, 100) };
          cur.points.push({ x: end.x, y: end.y, in: { x: round(c2.x - end.x, 100), y: round(c2.y - end.y, 100) } });
        } else if (op === 'arcTo' && cur) {
          // the end point of an arc needs the preset angle maths; keep the shape connected with a straight run
          this.skip('arc', sc.slide);
        } else if (op === 'close' && cur) {
          cur.closed = true;
          closed = true;
          flush();
        }
      }
      flush();
    }
    if (!paths.length) return { kind: 'rect', closed: true, radius: 0 };
    return { kind: 'path', closed: closed && paths.every((s) => s.closed), paths: paths.map((s) => ({ ...s, points: s.points.map((q) => ({ ...q, x: round(q.x, 100), y: round(q.y, 100) })) })) };
  }

  geometryNode(name: string, g: Geometry, w: number, h: number): SceneNode {
    const box = { name, x: 0, y: 0, width: Math.max(0.01, w), height: Math.max(0.01, h) };
    switch (g.kind) {
      case 'ellipse':
        return createNode('ellipse', box);
      case 'polygon':
        return createNode('polygon', { ...box, sides: g.sides });
      case 'star':
        return createNode('star', { ...box, points: g.points, innerRatio: g.ratio });
      case 'line':
        return createNode('path', { ...box, paths: [{ closed: false, points: [{ x: 0, y: 0 }, { x: round(w, 100), y: round(h, 100) }] }] });
      case 'path':
        return createNode('path', { ...box, paths: g.paths });
      default:
        return createNode('rect', { ...box, cornerRadius: round(g.radius, 100) });
    }
  }

  orientLine(n: PathNode, flipH: boolean, flipV: boolean): void {
    const [a, b] = n.paths[0].points;
    if (flipH) {
      a.x = n.width;
      b.x = 0;
    }
    if (flipV) {
      a.y = n.height;
      b.y = 0;
    }
  }

  // ------------------------------------------------------------ text

  /** The text of a shape as a text layer filling the shape's box (position is relative to the shape's own corner), or null when it has none. */
  text(sp: Element, chain: Element[], w: number, h: number, sc: Scene): TextNode | null {
    const body = kid(sp, 'txBody');
    if (!body) return null;
    const paras = kids(body, 'p');
    const plain = paras.map((p) => kids(p).map((e) => (localOf(e) === 'r' || localOf(e) === 'fld' ? kid(e, 't')?.textContent ?? '' : '')).join('')).join('');
    if (!plain.trim()) return null;
    const theme = sc.cx.theme;
    const isPh = chain.length > 0 || !!dig(sp, 'nvSpPr/nvPr/ph');
    const phType = attr(dig(sp, 'nvSpPr/nvPr/ph'), 'type');
    // body properties: master, layout and slide each add to the last
    const bodyPrs = [...chain].reverse().map((c) => dig(c, 'txBody/bodyPr')).concat([kid(body, 'bodyPr')]).filter((e): e is Element => !!e);
    const bp = (k: string): string | null => {
      let v: string | null = null;
      for (const e of bodyPrs) v = attr(e, k) ?? v;
      return v;
    };
    const own = kid(body, 'bodyPr');
    if (bp('vert') && bp('vert') !== 'horz') this.skip('vertical', sc.slide);
    const ins = (k: string, d: number): number => {
      const v = bp(k);
      const n = v === null ? NaN : Number(v);
      return (Number.isFinite(n) ? n : d) / EMU;
    };
    const l = ins('lIns', 91440);
    const t = ins('tIns', 45720);
    const rr = ins('rIns', 91440);
    const b = ins('bIns', 45720);
    const anchor = bp('anchor');
    const verticalAlign: TextNode['verticalAlign'] = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
    const na = dig(own, 'normAutofit');
    const fontScale = (numAttr(na, 'fontScale') ?? 100000) / 100000;
    const lnReduce = (numAttr(na, 'lnSpcReduction') ?? 0) / 100000;

    // the list style for a paragraph at `lvl`
    const levelFor = (lvl: number): Level => {
      const lv: Level = { rPr: {} };
      mergeStyle(lv, this.defaultStyle, lvl, sc.cx, theme);
      if (isPh && sc.master) {
        const tx = kid(sc.master.root, 'txStyles');
        const style = kid(tx, phType === 'title' || phType === 'ctrTitle' ? 'titleStyle' : phType === 'body' || phType === 'subTitle' || !phType ? 'bodyStyle' : 'otherStyle');
        mergeStyle(lv, style, lvl, sc.cx, theme);
        for (const c of [...chain].reverse()) mergeStyle(lv, dig(c, 'txBody/lstStyle'), lvl, sc.cx, theme);
      } else {
        // text in a shape with a style reference takes the colour that reference names
        const fc = colorIn(dig(sp, 'style/fontRef'), sc.cx);
        if (fc) lv.rPr.color = css(fc);
      }
      mergeStyle(lv, kid(body, 'lstStyle'), lvl, sc.cx, theme);
      return lv;
    };

    const pieces: TextPiece[] = [];
    const aligns: string[] = [];
    const spacings: { first: Level; sz: number }[] = [];
    let usedBullets = false;
    const counters = new Map<number, number>();
    let firstLine = true;
    paras.forEach((p) => {
      const pPr = kid(p, 'pPr');
      const lvl = Math.max(0, Math.min(8, numAttr(pPr, 'lvl') ?? 0));
      const lv = levelFor(lvl);
      mergeLevel(lv, pPr, sc.cx, theme);
      aligns.push(lv.algn ?? 'l');
      const defaults = lv.rPr;
      const make = (props: RunProps, text: string): TextPiece => {
        const f = this.fonts.face(props.font ?? theme.minor, '', props.b ? 700 : 400, !!props.i);
        const size = round(((props.sz ?? 1800) * SZ) * fontScale, 100);
        return { text: text, family: f.family, weight: f.weight, italic: f.italic, size, color: props.color ?? '#000000', spacing: round(((props.spc ?? 0) / 100) * (96 / 72), 100), underline: !!props.u, strike: !!props.strike };
      };
      const runs: { props: RunProps; text: string }[] = [];
      for (const e of kids(p)) {
        const n = localOf(e);
        if (n === 'r' || n === 'fld') {
          const props: RunProps = { ...defaults };
          mergeRun(props, kid(e, 'rPr'), sc.cx, theme);
          runs.push({ props, text: kid(e, 't')?.textContent ?? '' });
        } else if (n === 'br') {
          const props: RunProps = { ...defaults };
          mergeRun(props, kid(e, 'rPr'), sc.cx, theme);
          runs.push({ props, text: '\n' });
        }
      }
      const end: RunProps = { ...defaults };
      mergeRun(end, kid(p, 'endParaRPr'), sc.cx, theme);
      const hasText = runs.some((r) => r.text.replace(/\n/g, '').length > 0);
      if (!firstLine) pieces.push({ ...make(runs[0]?.props ?? end, '\n'), text: '\n' });
      firstLine = false;
      if (hasText && lv.bullet && lv.bullet.kind !== 'none') {
        usedBullets = true;
        let label: string;
        if (lv.bullet.kind === 'num') {
          const n = (counters.get(lvl) ?? (lv.bullet.start ?? 1) - 1) + 1;
          counters.set(lvl, n);
          label = numberLabel(lv.bullet.numType ?? 'arabicPeriod', n);
        } else {
          label = lv.bullet.char === '§' || lv.bullet.char === 'Ø' || lv.bullet.char === 'ü' || lv.bullet.char === 'v' || lv.bullet.char === '–' ? '•' : lv.bullet.char ?? '•';
        }
        for (const k of [...counters.keys()]) if (k > lvl) counters.delete(k);
        pieces.push(make(runs[0].props, `${' '.repeat(lvl * 2)}${label} `));
      } else if (!hasText) {
        counters.clear();
      }
      for (const r of runs) {
        if (!r.text) continue;
        const text = r.props.caps ? r.text.toUpperCase() : r.text;
        pieces.push(make(r.props, text));
      }
      if (!runs.length) {
        // an empty paragraph still takes a line of its own size
        pieces.push({ ...make(end, ''), text: '' });
      }
      spacings.push({ first: lv, sz: (runs[0]?.props ?? end).sz ?? 1800 });
    });
    if (usedBullets) this.skip('bullets', sc.slide);
    // single layer: the first paragraph's alignment, line height and spacing stand for the rest
    if (new Set(aligns).size > 1) this.skip('align', sc.slide);
    const first = spacings[0];
    const sizePx = first.sz * SZ * fontScale;
    const lh = first.first.lnPts !== undefined ? (first.first.lnPts * 96) / 72 / Math.max(1, sizePx) : (first.first.lnPct ?? 1) * 1.2;
    const lineHeight = round(Math.max(0.8, lh - lnReduce * 1.2), 100);
    const second = spacings[1] ?? first;
    const gap = (sz: number, pct: number | undefined, pts: number | undefined): number => (pts !== undefined ? (pts * 96) / 72 : (pct ?? 0) * sz * SZ * fontScale * 1.2);
    const paragraphSpacing = round(Math.max(0, gap(first.sz, first.first.aftPct, first.first.aftPts) + gap(second.sz, second.first.befPct, second.first.befPts)), 100);

    const bw = Math.max(1, w - l - rr);
    const bh = Math.max(1, h - t - b);
    const algn = aligns[0] ?? 'l';
    const node = buildTextNode({
      name: 'Text',
      pieces,
      align: algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : algn === 'just' || algn === 'dist' ? 'justify' : 'left',
      lineHeight,
      origin: { x: l + bw / 2, y: t + bh / 2 },
      rotation: 0,
      box: { l: -bw / 2, t: -bh / 2, w: bw, h: bh },
    });
    node.verticalAlign = verticalAlign;
    if (paragraphSpacing > 0) node.paragraphSpacing = paragraphSpacing;
    if (bp('wrap') === 'none') node.wrap = false;
    return node;
  }
}

type Geometry =
  | { kind: 'rect'; closed: boolean; radius: number }
  | { kind: 'ellipse'; closed: boolean }
  | { kind: 'line'; closed: boolean }
  | { kind: 'polygon'; closed: boolean; sides: number }
  | { kind: 'star'; closed: boolean; points: number; ratio: number }
  | { kind: 'path'; closed: boolean; paths: SubPath[] };

// ---------------------------------------------------------------- the entry point

const DEFAULT_MAP: Record<string, string> = { bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };

function clrMapOf(...els: (Element | null)[]): Record<string, string> {
  const map = { ...DEFAULT_MAP };
  for (const el of els) {
    if (!el) continue;
    for (const a of Array.from(el.attributes)) map[a.name] = a.value;
  }
  return map;
}

export function importPptx(bytes: Uint8Array, baseName: string): PptxImport {
  if (!isZip(bytes)) throw new Error('This is not a PowerPoint file (it is not a ZIP archive). Older .ppt files have to be saved as .pptx first.');
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        return f.originalSize <= MAX_ENTRY && !/\.(bin|xlsx|docx|pptx)$/i.test(f.name) && !/^ppt\/(embeddings|media\/[^/]*\.(mp4|mov|m4v|wmv|avi|mp3|wav|m4a))/i.test(f.name);
      },
    });
  } catch (e) {
    throw new Error(`This PowerPoint file can’t be unzipped (${e instanceof Error ? e.message : String(e)})`);
  }
  if (total > MAX_TOTAL) throw new Error('This PowerPoint file is too large to import');
  const imp = new Importer(files);
  const pres = imp.part('ppt/presentation.xml');
  if (!pres) throw new Error('This is not a PowerPoint file (no ppt/presentation.xml inside)');
  imp.defaultStyle = kid(pres.root, 'defaultTextStyle');
  const size = kid(pres.root, 'sldSz');
  const width = Math.max(1, px(numAttr(size, 'cx') ?? 9144000));
  const height = Math.max(1, px(numAttr(size, 'cy') ?? 6858000));
  if (width > 20000 || height > 20000) throw new Error('This presentation’s slides are too large to import');

  // slides in presentation order
  let slidePaths: string[] = kids(kid(pres.root, 'sldIdLst'), 'sldId')
    .map((s) => pres.rels.get(nsAttr(s, 'id') ?? '')?.target ?? '')
    .filter((p) => p && files[p]);
  if (!slidePaths.length) {
    slidePaths = Object.keys(files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  }
  if (!slidePaths.length) throw new Error('This PowerPoint file has no slides to import');
  if (slidePaths.length > MAX_SLIDES) {
    imp.notes.add(`Only the first ${MAX_SLIDES} of ${slidePaths.length} slides were imported`);
    slidePaths = slidePaths.slice(0, MAX_SLIDES);
  }

  const artboards: Artboard[] = [];
  const base = baseName.trim() || 'PowerPoint import';
  let x = 0;
  slidePaths.forEach((path, i) => {
    const slide = imp.part(path);
    if (!slide) {
      imp.notes.add(`Slide ${i + 1} could not be read and was left out`);
      return;
    }
    const no = i + 1;
    const layoutRel = imp.relOfType(slide, 'slideLayout');
    const layout = layoutRel ? imp.part(layoutRel.target) : null;
    const masterRel = layout ? imp.relOfType(layout, 'slideMaster') : null;
    const master = masterRel ? imp.part(masterRel.target) : null;
    const theme = imp.theme(master);
    const clrMap = clrMapOf(kid(master?.root, 'clrMap'), dig(layout?.root ?? null, 'clrMapOvr/overrideClrMapping'), dig(slide.root, 'clrMapOvr/overrideClrMapping'));
    const cx: ColorCtx = { theme, clrMap };
    const sceneOf = (part: Part, template: string | null): Scene => ({ part, cx, slide: no, template, layout, master });

    // background: the slide's own, else the layout's, else the master's
    let background: Paint | null = null;
    for (const part of [slide, layout, master]) {
      if (!part) continue;
      const bg = dig(part.root, 'cSld/bg');
      if (!bg) continue;
      const sc = sceneOf(part, null);
      const own = kid(bg, 'bgPr') ? imp.fillOf(kid(bg, 'bgPr'), sc) : imp.styleFill(kid(bg, 'bgRef'), theme.bgFills.length ? theme.bgFills : theme.fills, sc);
      if (own !== undefined) {
        background = own;
        break;
      }
    }
    if (hiddenSlide(slide)) imp.skip('hidden', no);

    const children: SceneNode[] = [];
    const showMaster = attr(slide.root, 'showMasterSp') !== '0';
    if (master && showMaster && attr(layout?.root ?? null, 'showMasterSp') !== '0') imp.convertTree(dig(master.root, 'cSld/spTree') ?? master.root, TOP, sceneOf(master, 'Master'), children);
    if (layout && showMaster) imp.convertTree(dig(layout.root, 'cSld/spTree') ?? layout.root, TOP, sceneOf(layout, 'Layout'), children);
    imp.convertTree(dig(slide.root, 'cSld/spTree') ?? slide.root, TOP, sceneOf(slide, null), children);

    // what is left out
    const every = Array.from(slide.root.getElementsByTagName('*'));
    if (every.some((e) => localOf(e) === 'transition')) imp.skip('transition', no);
    if (every.some((e) => localOf(e) === 'cTn' && attr(e, 'presetClass'))) imp.skip('animation', no);
    const notesRel = imp.relOfType(slide, 'notesSlide');
    const notes = notesRel ? imp.part(notesRel.target) : null;
    if (notes && Array.from(notes.root.getElementsByTagName('*')).some((e) => localOf(e) === 't' && (e.textContent ?? '').trim() && !/^\d+$/.test((e.textContent ?? '').trim()))) imp.skip('notes', no);

    artboards.push(createArtboard({ name: slidePaths.length === 1 ? base : `${base} / Slide ${no}`, width, height, background: background ?? { type: 'solid', color: '#ffffff' }, children, canvasX: x, canvasY: 0 }));
    x += width + 100;
  });
  if (!artboards.length) throw new Error('This PowerPoint file has no slides that can be imported');
  return { artboard: artboards[0], artboards, assets: imp.assets, fonts: imp.fonts.refs(), warnings: imp.report() };
}

function hiddenSlide(slide: Part): boolean {
  return attr(slide.root, 'show') === '0';
}
