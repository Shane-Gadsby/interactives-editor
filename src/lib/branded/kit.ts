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
import { createArtboard, createNode, createProject, uid, type Artboard, type LogicEdge, type LogicNode, type LookKey, type Paint, type Project, type SceneNode, type TemplateChecklistItem, type TextNode, type ThemeDef } from 'interactives-player';
import { starterThemes } from '../themes';
import { BRAND_FONT, COLOURWAYS, CONTENT_TOKENS, HIGH_CONTRAST, type BrandKey, type Colourway } from './looks';

export type StarterSet = 'assessment' | 'explore' | 'drag' | 'story';

export const SET_NAMES: Record<StarterSet, string> = {
  assessment: 'Quizzes and questions',
  explore: 'Explore and reveal',
  drag: 'Drag, sort and timelines',
  story: 'Stories and presentations',
};

export interface BrandedStarter {
  /** Stable, used in the project's template record: `<set>/<name>`, e.g. `assessment/multi-page-quiz`. */
  key: string;
  set: StarterSet;
  name: string;
  description: string;
  tags: string[];
  build(colourway: Colourway): { project: Project; checklist: TemplateChecklistItem[] };
}

export type ColourKey = LookKey | BrandKey;

/** What a starter builds with: the project, the colourway it opens in, and every colour as a token reference (`L.text`, `L.gradientStart`...). */
export interface BrandedCtx {
  project: Project;
  colourway: Colourway;
  L: Record<ColourKey, string>;
}

/** The page size every branded page uses unless a starter asks otherwise (16:10, like the slides). */
export const PAGE = { width: 1024, height: 640 } as const;
const SIDE = 48;
const TOP = 40;
const FOOTER = 44;

/** Marks a layer as part of the brand (logo, sweeps, bars, footer line): locked in branded projects. */
export const CHROME_TAG = 'brand-chrome';
export const isChrome = (n: SceneNode): boolean => (n as { tags?: string[] }).tags?.includes(CHROME_TAG) ?? false;
export const chrome = <T extends SceneNode>(n: T): T => Object.assign(n, { tags: [...((n as { tags?: string[] }).tags ?? []), CHROME_TAG] });

const BRAND_TOKEN_NAMES: Record<BrandKey, string> = {
  gradientStart: 'brand/gradient-start',
  gradientEnd: 'brand/gradient-end',
  onGradient: 'brand/on-gradient',
  deep: 'brand/deep',
  onDeep: 'brand/on-deep',
  accent: 'brand/accent',
  warm: 'brand/warm',
  logoMark: 'brand/logo-mark',
  logoText: 'brand/logo-text',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

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
  return { project, colourway, L };
}

export type PageKind = 'content' | 'hero' | 'section' | 'end';

/** The brand gradient as a paint: start to end colour of the colourway, at an angle. */
export const gradient = (ctx: BrandedCtx, angle = 135): Paint => ({ type: 'linear', angle, stops: [{ offset: 0, color: ctx.L.gradientStart }, { offset: 1, color: ctx.L.gradientEnd }] });

/** The soft sweeps of the title slides: big overlapping curves in the gradient's colours, low key. Chrome. */
export function sweeps(ctx: BrandedCtx, ab: Artboard): SceneNode[] {
  const w = ab.width, h = ab.height;
  const a = chrome(createNode('ellipse', { name: 'Brand sweep 1', x: w * 0.35, y: -h * 0.6, width: w * 1.3, height: h * 1.5, rotation: -18, fill: { type: 'linear', angle: 200, stops: [{ offset: 0, color: ctx.L.gradientEnd }, { offset: 1, color: ctx.L.gradientStart }] }, opacity: 0.55 }));
  const b = chrome(createNode('ellipse', { name: 'Brand sweep 2', x: -w * 0.4, y: h * 0.45, width: w * 1.2, height: h * 1.1, rotation: 12, fill: { type: 'linear', angle: 30, stops: [{ offset: 0, color: ctx.L.gradientStart }, { offset: 1, color: ctx.L.gradientEnd }] }, opacity: 0.45 }));
  return [a, b];
}

/**
 * The logo, top left on hero pages and bottom left on content pages. A stand-in (a mark and the university's name in the
 * logo colours) until the vector logo from the brand files replaces it in this one function; it is always a group named
 * "UniSQ logo", chrome, `width` wide, coloured by the logo tokens so it follows the colourway.
 */
export function logo(ctx: BrandedCtx, x: number, y: number, width = 150, onContent = false): SceneNode {
  const s = width / 150;
  const mark = createNode('rect', { name: 'Logo mark', x: 0, y: 0, width: 34 * s, height: 40 * s, cornerRadius: 6 * s, fill: { type: 'solid', color: onContent ? ctx.L.accent : ctx.L.logoMark } });
  const words = createNode('text', { name: 'Logo words', text: 'University of\nSouthern\nQueensland', x: 42 * s, y: 0, width: 108 * s, fontSize: 11 * s, lineHeight: 1.15, fontWeight: 700, color: onContent ? ctx.L.deep : ctx.L.logoText, fontFamily: BRAND_FONT } as Partial<TextNode>);
  return chrome(createNode('group', { name: 'UniSQ logo', x, y, width, height: 42 * s, children: [mark, words], role: 'image', ariaLabel: 'University of Southern Queensland' } as unknown as Partial<SceneNode>));
}

/**
 * A page. `content` (the default): white, a title at the top, the logo small bottom left and a footer line bottom right.
 * `hero`: the full-bleed gradient with sweeps, the logo top left and a big title. `section`: deep purple with the accent
 * line. `end`: the gradient, the logo and unisq.edu.au. The first page made becomes the start artboard. Put content inside
 * `contentBox(page)`.
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
    kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: TOP, width: width - SIDE * 2, fontSize: 30, fontWeight: 600, color: L.text, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
    kids.push(chrome(createNode('rect', { name: 'Brand accent', x: SIDE, y: TOP + 50, width: 56, height: 4, cornerRadius: 2, fill: { type: 'solid', color: L.accent } })));
    kids.push(logo(ctx, SIDE, height - FOOTER + 4, 96, true));
    kids.push(createNode('text', { name: 'Footer text', text: opts.footer ?? '', x: width / 2, y: height - FOOTER + 14, width: width / 2 - SIDE, fontSize: 12, color: L.muted, align: 'right', fontFamily: BRAND_FONT } as Partial<TextNode>));
  } else if (kind === 'section') {
    ab.background = { type: 'solid', color: L.deep };
    kids.push(chrome(createNode('rect', { name: 'Brand accent', x: SIDE, y: height / 2 + 20, width: 72, height: 6, cornerRadius: 3, fill: { type: 'solid', color: L.accent } })));
    kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height / 2 - 60, width: width - SIDE * 2, fontSize: 44, fontWeight: 700, color: L.onDeep, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
    kids.push(logo(ctx, SIDE, height - FOOTER - 8, 96, false));
  } else {
    ab.background = gradient(ctx);
    kids.push(...sweeps(ctx, ab));
    kids.push(logo(ctx, SIDE, TOP - 8, 150));
    if (kind === 'hero') {
      kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height * 0.42, width: width * 0.7, fontSize: 48, fontWeight: 700, color: L.onGradient, role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
      if (opts.subtitle !== undefined) kids.push(createNode('text', { name: 'Subtitle', text: opts.subtitle, x: SIDE, y: height * 0.42 + 72, width: width * 0.6, fontSize: 20, color: L.onGradient, fontFamily: BRAND_FONT } as Partial<TextNode>));
    } else {
      kids.push(createNode('text', { name: 'Page title', text: title, x: SIDE, y: height / 2 - 30, width: width - SIDE * 2, fontSize: 40, fontWeight: 700, color: L.onGradient, align: 'center', role: 'heading', headingLevel: 1, fontFamily: BRAND_FONT } as Partial<TextNode>));
      kids.push(chrome(createNode('text', { name: 'Brand web address', text: 'unisq.edu.au', x: SIDE, y: height / 2 + 30, width: width - SIDE * 2, fontSize: 18, fontWeight: 600, color: L.onGradient, align: 'center', fontFamily: BRAND_FONT } as Partial<TextNode>)));
    }
  }
  ab.children.push(...kids);
  ctx.project.artboards.push(ab);
  if (ctx.project.artboards.length === 1) ctx.project.settings.startArtboardId = ab.id;
  return ab;
}

/** Where a page's content goes. Content pages: below the title, above the footer. */
export function contentBox(page: Artboard): { x: number; y: number; width: number; height: number } {
  return { x: SIDE, y: TOP + 74, width: page.width - SIDE * 2, height: page.height - TOP - 74 - FOOTER - 16 };
}

// ------------------------------------------------------------------ small builders, all colours from the colourway

export const solid = (color: string) => ({ type: 'solid' as const, color });
export const stroke = (color: string, width = 1.5) => ({ paint: solid(color), width });

export const text = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  createNode('text', { name, text: value, x, y, width, fontSize: 18, color: ctx.L.text, fontFamily: BRAND_FONT, ...extra });

export const heading = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, width, { fontSize: 24, fontWeight: 700, role: 'heading', headingLevel: 2, ...extra });

export const button = (ctx: BrandedCtx, name: string, label: string, x: number, y: number, width = 180, primary = true) =>
  createNode('button', {
    name,
    label,
    x,
    y,
    width,
    height: 46,
    cornerRadius: 23,
    fill: solid(primary ? ctx.L.button : ctx.L.background),
    stroke: primary ? null : stroke(ctx.L.border),
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
