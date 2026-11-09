/**
 * The shared builders for the branded starter packs. Every branded starter is made with these, so its pages share the
 * UniSQ look (from the PowerPoint templates: full-bleed gradient hero pages with soft sweeps, white content pages with the
 * logo and a footer line, deep purple section pages) and every colour is a theme token, so swapping the colourway (a theme)
 * re-colours the whole piece live.
 *
 * The contract for a starter: `build(colourway)` returns a fresh project from `brandedProject`, pages from `brandedPage`,
 * content placed inside `contentBox(page)`, every colour from `ctx.L` (never a hex literal), Open Sans via the text helpers,
 * and a checklist. Layers made by `chrome(...)` (the logo, sweeps, bars, footer line) are the brand: they're locked in
 * branded projects (./lock.ts).
 */
import { apply, createArtboard, createNode, createProject, invert, makeNote, uid, type Artboard, type Note, type NoteColour, type LogicEdge, type LogicNode, type LookKey, type Paint, type PathNode, type Project, type SceneNode, type TemplateChecklistItem, type TextNode, type ThemeDef } from 'interactives-player';
import logoOnWhite from './assets/unisq-logo-on-white.svg?raw';
import { importSvg } from '../svg-import';
import { starterThemes } from '../themes';
import { locate, nodeToArtboard } from '../../store/doc';
import type { FormMaker } from './form-kit';
import { BRAND_FONT, COLOURWAYS, CONTENT_TOKENS, HIGH_CONTRAST, type BrandKey, type Colourway } from './looks';

export type StarterSet = 'assessment' | 'explore' | 'drag' | 'story' | 'games' | 'writing' | 'practice' | 'media';

export const SET_NAMES: Record<StarterSet, string> = {
  assessment: 'Quizzes and questions',
  explore: 'Explore and reveal',
  drag: 'Drag, sort and timelines',
  story: 'Stories and presentations',
  games: 'Games and puzzles',
  writing: 'Writing and reflection',
  practice: 'Speaking and practice',
  media: 'Listen, watch and capture',
};

/**
 * A state of a starter to run the layout check in as well as its starting one (`test/starter-layout.test.ts`): the feedback page with
 * long answers in it, a panel that is open. `vars` are variable values (by name) put in over the starting values, for `page` (a page
 * name or names; all pages when left out). The check only sees what shows at the start, so anything that appears later (a feedback
 * message, a dialog, a long answer) needs a state to be checked.
 */
export interface LayoutState {
  label: string;
  page?: string | string[];
  vars: Record<string, unknown>;
}

export interface BrandedStarter {
  /** Stable, used in the project's template record: `<set>/<name>`, e.g. `assessment/multi-page-quiz`. */
  key: string;
  set: StarterSet;
  name: string;
  description: string;
  tags: string[];
  build(colourway: Colourway): { project: Project; checklist: TemplateChecklistItem[] };
  /** Extra states for the layout check to run each page in (see `LayoutState`). */
  layoutStates?: LayoutState[];
  /** The plain form for the content an author fills in (Fill in panel), written in the set's `forms.ts`; see `./form-kit.ts`. */
  form?: FormMaker;
}

export type ColourKey = LookKey | BrandKey;

/** What a starter builds with: the project, the colourway it opens in, and every colour as a token reference (`L.text`, `L.gradientStart`...). */
export interface BrandedCtx {
  project: Project;
  colourway: Colourway;
  L: Record<ColourKey, string>;
  /** The page masters made so far, by kind and page size (see `brandedPage`). */
  masters: Map<string, Artboard>;
}

/** The page size every branded page uses unless a starter asks otherwise (16:10, like the slides). */
export const PAGE = { width: 1024, height: 640 } as const;
const SIDE = 48;
const TOP = 40;
const FOOTER = 44;
//The logo on the white pages and the purple ones sits this far from the bottom edge of the page
const LOGO_BOTTOM = 18;
/** The clear space round the logo, as a share of the logo's height: nothing but the page's own background goes inside it (the layout check, test/starter-layout.test.ts, holds pages to it). */
export const LOGO_CLEAR = 0.3;
/** Layer tag for something that overlaps other layers on purpose (a panel over its own text, a scrim): the layout check skips it and everything inside it. */
export const OVERLAY_TAG = 'layout-overlay';
export const overlay = <T extends SceneNode>(n: T): T => Object.assign(n, { tags: [...((n as { tags?: string[] }).tags ?? []), OVERLAY_TAG] });

/**
 * Marks a layer as part of the brand (logo, sweeps, bars, footer line): locked in branded projects. It is tagged, and it also
 * carries the ordinary layer lock (`locked`), which is what keeps it off the canvas picking, the marquee, select all and drags.
 * The tag is what the brand lock (./lock.ts) holds it by, so unlocking one layer by hand is refused outside the F9 override.
 */
export const CHROME_TAG = 'brand-chrome';
export const isChrome = (n: SceneNode): boolean => (n as { tags?: string[] }).tags?.includes(CHROME_TAG) ?? false;
export const chrome = <T extends SceneNode>(n: T): T => Object.assign(n, { locked: true, tags: [...((n as { tags?: string[] }).tags ?? []), CHROME_TAG] });

export const BRAND_TOKEN_NAMES: Record<BrandKey, string> = {
  gradientStart: 'brand/gradient-start',
  gradientEnd: 'brand/gradient-end',
  onGradient: 'brand/on-gradient',
  deep: 'brand/deep',
  onDeep: 'brand/on-deep',
  accent: 'brand/accent',
  warm: 'brand/warm',
  logoMark: 'brand/logo-mark',
  logoText: 'brand/logo-text',
  logoMarkOnLight: 'brand/logo-mark-on-light',
  logoTextOnLight: 'brand/logo-text-on-light',
  scrim: 'brand/scrim',
  accentButton: 'brand/accent-button',
  onAccentButton: 'brand/on-accent-button',
};

export const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * A new branded project: one theme per colourway plus High contrast, every starter token and the brand tokens valued for
 * each, opening in `colourway`, with Open Sans. No pages yet.
 */
export function brandedProject(colourway: Colourway, name: string): BrandedCtx {
  const project = createProject(name);
  project.artboards = [];
  const ways = [...COLOURWAYS, HIGH_CONTRAST];
  const list: ThemeDef[] = ways.map((w) => ({ id: `theme-${w.id}`, name: w.name, mode: w === HIGH_CONTRAST ? 'dark' : 'light', ...(w === HIGH_CONTRAST ? { highContrast: true } : {}) }));
  const starter = starterThemes();
  const light = starter.list.find((t) => t.mode === 'light' && !t.highContrast) ?? starter.list[0];
  const tokens = starter.tokens.map((tk) => {
    const key = (Object.keys(CONTENT_TOKENS) as LookKey[]).concat(['primary', 'onPrimary', 'button', 'onButton', 'focus']).find((k) => tk.name === `color/${kebab(k)}`);
    const values: Record<string, string> = {};
    ways.forEach((w, i) => {
      values[list[i].id] = (key && (w.tokens[key] ?? (w === HIGH_CONTRAST ? undefined : CONTENT_TOKENS[key]))) || tk.values[light.id];
    });
    return { id: tk.id, name: tk.name, values, palette: {} };
  });
  for (const [key, tokenName] of Object.entries(BRAND_TOKEN_NAMES) as [BrandKey, string][]) {
    const values: Record<string, string> = {};
    ways.forEach((w, i) => (values[list[i].id] = w.brand[key]));
    tokens.push({ id: uid('tk'), name: tokenName, values, palette: {} });
  }
  //Opens in the chosen colourway; follow lets a viewer who asks for more contrast get High contrast
  project.themes = { list, tokens, default: `theme-${colourway.id}`, follow: true };
  const ref = (n: string) => `token:${tokens.find((t) => t.name === n)!.id}`;
  const L = {} as Record<ColourKey, string>;
  for (const tk of tokens) {
    const m = /^color\/(.*)$/.exec(tk.name);
    if (m) L[m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) as LookKey] = `token:${tk.id}`;
  }
  for (const [key, tokenName] of Object.entries(BRAND_TOKEN_NAMES) as [BrandKey, string][]) L[key] = ref(tokenName);
  project.fonts.push({ family: BRAND_FONT, source: 'google', weights: [400, 600, 700] });
  project.brandLook = { id: colourway.id, name: colourway.name };
  return { project, colourway, L, masters: new Map() };
}

export type PageKind = 'content' | 'hero' | 'section' | 'end';

/** The brand gradient as a paint: start to end colour of the colourway, at an angle. */
export const gradient = (ctx: BrandedCtx, angle = 135): Paint => ({ type: 'linear', angle, stops: [{ offset: 0, color: ctx.L.gradientStart }, { offset: 1, color: ctx.L.gradientEnd }] });

/**
 * The scrim of the Orange and Red colourways as a layer for a panel that paints the gradient itself (a card face): put it right over the
 * gradient and under the words. Clear in the others. See the scrim in looks.ts for why.
 */
export const scrimOver = (ctx: BrandedCtx, width: number, height: number, cornerRadius = 0): SceneNode =>
  createNode('rect', { name: 'Brand scrim', x: 0, y: 0, width, height, cornerRadius, fill: { type: 'solid', color: ctx.L.scrim }, decorative: true } as Partial<SceneNode>);

/** The soft sweeps of the title slides: big overlapping curves in the gradient's colours, low key. Chrome. */
export function sweeps(ctx: BrandedCtx, ab: Artboard): SceneNode[] {
  const w = ab.width, h = ab.height;
  const a = chrome(createNode('ellipse', { name: 'Brand sweep 1', x: w * 0.35, y: -h * 0.6, width: w * 1.3, height: h * 1.5, rotation: -18, fill: { type: 'linear', angle: 200, stops: [{ offset: 0, color: ctx.L.gradientEnd }, { offset: 1, color: ctx.L.gradientStart }] }, opacity: 0.55 }));
  const b = chrome(createNode('ellipse', { name: 'Brand sweep 2', x: -w * 0.4, y: h * 0.45, width: w * 1.2, height: h * 1.1, rotation: 12, fill: { type: 'linear', angle: 30, stops: [{ offset: 0, color: ctx.L.gradientStart }, { offset: 1, color: ctx.L.gradientEnd }] }, opacity: 0.45 }));
  return [a, b];
}

//The logo files come from the university's own PowerPoint templates and this is the university's own tool, so they are used as they are (first party artwork, no third party licence in the way). White is the one with the mark and the words in separate colours, so it is the one we cut up.
const LOGO_SOURCE = logoOnWhite;
let logoParts: { nodes: PathNode[]; width: number; height: number } | null = null;

//The files' two colours: the gold mark and the purple words. Anything else in a file counts as words
const MARK_FILL = '#ffb448';

function logoShapes() {
  if (logoParts) return logoParts;
  const svg = importSvg(LOGO_SOURCE);
  const nodes = svg.nodes.filter((n): n is PathNode => n.type === 'path');
  //Trim to the artwork itself, the files carry a margin
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);
    y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.width);
    y1 = Math.max(y1, n.y + n.height);
  }
  logoParts = { nodes: nodes.map((n) => ({ ...n, x: n.x - x0, y: n.y - y0 })), width: x1 - x0, height: y1 - y0 };
  return logoParts;
}

//One decimal is plenty at logo sizes and keeps a page that carries the wordmark light
const round1 = (v: number) => Math.round(v * 10) / 10;
const scaleHandle = (h: { x: number; y: number } | null | undefined, s: number) => (h && (Math.abs(h.x * s) >= 0.05 || Math.abs(h.y * s) >= 0.05) ? { x: round1(h.x * s), y: round1(h.y * s) } : undefined);

/**
 * The UniSQ logo from the brand files, as vector path layers (the mark and the wordmark), top left on hero pages and bottom
 * left on content pages. A chrome group named "UniSQ logo", `width` wide, painted with tokens: the mark and the words each
 * have their own (`logoMark`/`logoText` on the gradient and deep pages, the on-light pair on white content pages) so it follows
 * the colourway (`onContent`: true on white, 'deep' on the purple section pages). Role image with an accessible name.
 */
export function logo(ctx: BrandedCtx, x: number, y: number, width = 150, onContent: boolean | 'deep' = false): SceneNode {
  const parts = logoShapes();
  const s = width / parts.width;
  //Gold mark on white or on the deep purple, the words purple on white and white on the purple
  const mark = onContent ? ctx.L.logoMarkOnLight : ctx.L.logoMark;
  const words = onContent === 'deep' ? ctx.L.onDeep : onContent ? ctx.L.logoTextOnLight : ctx.L.logoText;
  const children = parts.nodes.map((n, i) => {
    const color = n.fill?.type === 'solid' && n.fill.color.toLowerCase() === MARK_FILL ? mark : words;
    return createNode('path', {
      name: color === mark ? `Logo mark ${i}` : 'Logo words',
      x: round1(n.x * s),
      y: round1(n.y * s),
      width: Math.max(0.01, round1(n.width * s)),
      height: Math.max(0.01, round1(n.height * s)),
      fill: { type: 'solid', color },
      stroke: null,
      fillRule: n.fillRule,
      paths: n.paths.map((sp) => ({
        closed: sp.closed,
        points: sp.points.map((p) => {
          const hin = scaleHandle(p.in, s);
          const hout = scaleHandle(p.out, s);
          return { x: round1(p.x * s), y: round1(p.y * s), ...(hin ? { in: hin } : {}), ...(hout ? { out: hout } : {}) };
        }),
      })),
    });
  });
  return chrome(createNode('group', { name: 'UniSQ logo', x, y, width, height: round1(parts.height * s), children, role: 'image', ariaLabel: 'University of Southern Queensland' } as unknown as Partial<SceneNode>));
}

/** The logo's height for a width (the artwork's own proportions), so a page can place it by its bottom edge. */
const logoHeight = (width: number) => round1((logoShapes().height * width) / logoShapes().width);

/** The height, on a page of this height, of the line the logo and the footer text sit on (the middle of the small logo). */
export const footerMidY = (height: number): number => round1(height - LOGO_BOTTOM - logoHeight(80) / 2);
/** The page's side margin, for what lines up with the content's edge. */
export const SIDE_MARGIN = SIDE;

/**
 * The page master for a kind of page at a size: the chrome (logo, accent bar, sweeps, web address) built once per project and
 * named by every page of that kind, instead of copied onto each. Masters sit after the pages in the artboard list. On the white
 * pages the logo goes over the page (`masterOver`), so a screen reader meets it last, as it did when it was a page layer.
 */
function masterFor(ctx: BrandedCtx, kind: PageKind, width: number, height: number): Artboard {
  const key = `${kind}|${width}x${height}`;
  const have = ctx.masters.get(key);
  if (have) return have;
  const { L } = ctx;
  const size = width === PAGE.width && height === PAGE.height ? '' : ` ${width}x${height}`;
  const master = createArtboard({ name: `${kind[0].toUpperCase()}${kind.slice(1)} master${size}`, width, height, background: null, isMaster: true });
  const kids: SceneNode[] = [];
  if (kind === 'content') {
    kids.push(chrome(createNode('rect', { name: 'Brand accent', x: SIDE, y: TOP + 50, width: 56, height: 4, cornerRadius: 2, fill: { type: 'solid', color: L.accent } })));
    const mark = logo(ctx, SIDE, round1(height - LOGO_BOTTOM - logoHeight(80)), 80, true);
    kids.push(mark);
    master.masterOver = [mark.id];
  } else if (kind === 'section') {
    kids.push(chrome(createNode('rect', { name: 'Brand accent', x: SIDE, y: height / 2 + 20, width: 72, height: 6, cornerRadius: 3, fill: { type: 'solid', color: L.logoMarkOnLight } })));  //gold on the deep purple in every colourway (the accent is purple in Gold)
    kids.push(logo(ctx, SIDE, round1(height - LOGO_BOTTOM - logoHeight(96)), 96, 'deep'));
  } else {
    kids.push(...sweeps(ctx, master));
    //clear in most colourways: see the scrim in looks.ts
    kids.push(chrome(createNode('rect', { name: 'Brand scrim', x: 0, y: 0, width, height, fill: { type: 'solid', color: L.scrim }, decorative: true } as Partial<SceneNode>)));
    kids.push(logo(ctx, SIDE, TOP - 8, 150));
    if (kind === 'end') kids.push(chrome(createNode('text', { name: 'Brand web address', text: 'unisq.edu.au', x: SIDE, y: height / 2 + 30, width: width - SIDE * 2, fontSize: 18, fontWeight: 600, color: L.onGradient, align: 'center', fontFamily: BRAND_FONT } as Partial<TextNode>)));
  }
  master.children.push(...(kids as Artboard['children']));
  ctx.masters.set(key, master);
  ctx.project.artboards.push(master);
  return master;
}

/**
 * A page. `content` (the default): white, a title at the top, the logo small bottom left and a footer line bottom right.
 * `hero`: the full-bleed gradient with sweeps, the logo top left and a big title. `section`: deep purple with the accent
 * line. `end`: the gradient, the logo and unisq.edu.au. The first page made becomes the start artboard. Put content inside
 * `contentBox(page)`.
 *
 * The chrome (logo, accent bar, sweeps, web address) is not on the page: it is the page's master (`masterFor`), shared by every
 * page of the kind and size, and locked like any chrome. What stays on the page is what an author edits per page: the title, the
 * subtitle and the footer text. Pages go ahead of the masters in the artboard list.
 */
export function brandedPage(ctx: BrandedCtx, title: string, opts: { kind?: PageKind; name?: string; footer?: string; subtitle?: string; width?: number; height?: number } = {}): Artboard {
  const { L } = ctx;
  const kind = opts.kind ?? 'content';
  const width = opts.width ?? PAGE.width;
  const height = opts.height ?? PAGE.height;
  const ab = createArtboard({ name: opts.name ?? title, width, height });
  const kids: SceneNode[] = [];
  if (kind === 'content') {
    ab.background = { type: 'solid', color: L.background };
    //A title that is too long for one line shrinks to fit (down to 18) instead of wrapping onto the accent bar and the content
    kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: TOP, width: width - SIDE * 2, height: 46, autoSize: 'none', fitText: { min: 18, max: 30 }, fontSize: 30, fontWeight: 600, color: L.text, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
    //The footer line sits level with the middle of the logo
    kids.push(createNode('text', { name: 'Footer text', text: opts.footer ?? '', x: width / 2, y: round1(height - LOGO_BOTTOM - logoHeight(80) / 2 - 8), width: width / 2 - SIDE, fontSize: 12, color: L.muted, align: 'right', fontFamily: BRAND_FONT } as Partial<TextNode>));
  } else if (kind === 'section') {
    ab.background = { type: 'solid', color: L.deep };
    kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height / 2 - 60, width: width - SIDE * 2, height: 76, autoSize: 'none', fitText: { min: 24, max: 44 }, fontSize: 44, fontWeight: 700, color: L.onDeep, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
  } else {
    ab.background = gradient(ctx);
    if (kind === 'hero') {
      //A title that wraps takes its second line upwards, so it never lands on the subtitle (about 0.52 of the size per character in Open Sans bold)
      const lines = Math.max(1, Math.ceil((title.length * 48 * 0.52) / (width * 0.7)));
      kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height * 0.42 - (lines - 1) * 58, width: width * 0.7, fontSize: 48, fontWeight: 700, color: L.onGradient, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
      if (opts.subtitle !== undefined) kids.push(createNode('text', { name: 'Subtitle', text: opts.subtitle, x: SIDE, y: height * 0.42 + 72, width: width * 0.6, fontSize: 20, color: L.onGradient, fontFamily: BRAND_FONT } as Partial<TextNode>));
    } else {
      kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height / 2 - 30, width: width - SIDE * 2, height: 52, autoSize: 'none', fitText: { min: 20, max: 40 }, fontSize: 40, fontWeight: 700, color: L.onGradient, align: 'center', role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
    }
  }
  ab.master = masterFor(ctx, kind, width, height).id;
  ab.children.push(...kids);
  //pages go ahead of the masters, so a starter can count on its pages being the first artboards
  const arts = ctx.project.artboards;
  const firstMaster = arts.findIndex((a) => a.isMaster);
  if (firstMaster < 0) arts.push(ab);
  else arts.splice(firstMaster, 0, ab);
  if (arts.filter((a) => !a.isMaster).length === 1) ctx.project.settings.startArtboardId = ab.id;
  return ab;
}

/** Where a page's content goes. Content pages: below the title, above the footer. */
export function contentBox(page: Artboard): { x: number; y: number; width: number; height: number } {
  return { x: SIDE, y: TOP + 74, width: page.width - SIDE * 2, height: page.height - TOP - 74 - FOOTER - 16 };
}

/** How tall the buttons in a page's bottom bar are (the kit's own button height). */
export const NAV_HEIGHT = 46;

/**
 * The top of the bottom bar every starter puts its Back and Next buttons on: the last row of the content box, a little clear of the
 * footer and the logo. Back goes at the left edge of the box, Next (the primary one) at the right, and a page counter between them.
 * 524 on a 1024 by 640 page. `barY(box)` is the same for a box that is not the page's own content box.
 */
export const barY = (box: { y: number; height: number }): number => box.y + box.height - NAV_HEIGHT - 10;
export const navBarY = (page: Artboard): number => barY(contentBox(page));

// ------------------------------------------------------------------ small builders, all colours from the colourway

export const solid = (color: string) => ({ type: 'solid' as const, color });
export const stroke = (color: string, width = 1.5) => ({ paint: solid(color), width });

export const text = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  createNode('text', { name, text: value, x, y, width, fontSize: 18, color: ctx.L.text, fontFamily: BRAND_FONT, ...extra });

export const heading = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, width, { fontSize: 24, fontWeight: 700, role: 'heading', headingLevel: 2, ...extra });

//`accent`: a question's own action (Play the word, Repeat, a clip's Play), in the accent button colours so it never looks like Submit
export const button = (ctx: BrandedCtx, name: string, label: string, x: number, y: number, width = 180, primary: boolean | 'accent' = true) =>
  primary === 'accent'
    ? createNode('button', { name, label, x, y, width, height: 46, cornerRadius: 23, fill: solid(ctx.L.accentButton), stroke: stroke(ctx.L.onAccentButton), color: ctx.L.onAccentButton, fontSize: 16, fontWeight: 600, fontFamily: BRAND_FONT })
    : createNode('button', {
    name,
    label,
    x,
    y,
    width,
    height: 46,
    cornerRadius: 23,
    fill: solid(primary ? ctx.L.button : ctx.L.background),
    //The edge of a button is its fill (a secondary one: its stroke) and has to stand off what is round it by 3:1. A primary button's own colour
    //can match the page it is on (gold on white in Purple, the gradient's own blue on the Blue hero), so it carries a stroke in the colour of its
    //label, which is always far from the button and, on those pages, far from the page too.
    stroke: primary ? stroke(ctx.L.onButton) : stroke(ctx.L.border),
    color: primary ? ctx.L.onButton : ctx.L.text,
    fontSize: 16,
    fontWeight: 600,
    fontFamily: BRAND_FONT,
  });

/** A rounded panel on the warm grey surface, the PowerPoint content boxes. */
export const card = (ctx: BrandedCtx, name: string, x: number, y: number, width: number, height: number) =>
  createNode('rect', { name, x, y, width, height, cornerRadius: 16, fill: solid(ctx.L.surface), stroke: null });

/** A picture placeholder (grey, like the templates' image boxes), for the author to swap. */
export const picture = (ctx: BrandedCtx, name: string, x: number, y: number, width: number, height: number) =>
  createNode('rect', { name, x, y, width, height, cornerRadius: 16, fill: solid(ctx.L.surfaceMuted), stroke: null, ariaLabel: 'Picture placeholder: replace with your own image' } as Partial<SceneNode>);

export const gnode = (kind: string, x: number, y: number, params: Record<string, unknown> = {}, note?: string): LogicNode => ({ id: uid('ln'), kind, x, y, params, ...(note ? { note } : {}) });
export const edge = (a: LogicNode, b: LogicNode, fromPort = 'out'): LogicEdge => ({ id: uid('le'), from: a.id, fromPort, to: b.id, toPort: 'in' });
export const chain = (...nodes: LogicNode[]): LogicEdge[] => nodes.slice(1).map((n, i) => edge(nodes[i], n));

export const item = (text: string, node?: SceneNode, artboard?: Artboard): TemplateChecklistItem => ({ id: uid('ck'), text, ...(node ? { nodeId: node.id } : {}), ...(artboard ? { artboardId: artboard.id } : {}), done: false });

/**
 * A checklist item the way the starters write them: `text` is one short, plain action (about a dozen words, no layer, tab or variable
 * names), and `detail` is the how and why in as many words as it takes, shown in a fold under it. test/starter-checklist.test.ts holds
 * every starter to that.
 */
export const todo = (text: string, detail: string, node?: SceneNode, artboard?: Artboard): TemplateChecklistItem => ({ ...item(text, node, artboard), detail });

export const byName = (ab: Artboard, name: string): SceneNode | undefined => {
  const look = (list: SceneNode[]): SceneNode | undefined => {
    for (const n of list) {
      if (n.name === name) return n;
      if ('children' in n && Array.isArray(n.children)) {
        const hit = look(n.children as SceneNode[]);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return look(ab.children);
};

/**
 * A sticky note on a starter's artboard, for the person who uses the template ("replace this picture", "this is the question
 * text"). Notes are author-only: players, exports and share links never carry them (the player's notes.ts). `x`, `y` are artboard
 * pixels of the note's top left corner (it can sit outside the page); `anchor` is a layer (or its id) on this artboard for the
 * note to follow, kept at that offset from the layer. Returns the note.
 *
 *   addNote(page, { x: 880, y: 120, text: '**Swap the picture**\n- keep it landscape', colour: 'sky', anchor: photo });
 */
export function addNote(artboard: Artboard, n: { x: number; y: number; text: string; colour?: NoteColour; w?: number; h?: number; anchor?: SceneNode | string }): Note {
  const note = makeNote({ x: n.x, y: n.y, w: n.w, h: n.h, text: n.text, colour: n.colour, author: 'Template' });
  const layerId = typeof n.anchor === 'string' ? n.anchor : n.anchor?.id;
  if (layerId && locate(artboard, layerId)) {
    const local = apply(invert(nodeToArtboard(artboard, layerId)), n.x, n.y);
    note.anchor = { layerId, lx: Math.round(local.x * 10) / 10, ly: Math.round(local.y * 10) / 10 };
  }
  (artboard.notes ??= []).push(note);
  return note;
}
