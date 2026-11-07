import { defaultTheme, hasTokens, isContainer, isTokenRef, tokenRef, tokenValue, type Artboard, type Paint, type Project, type ProjectThemes, type SceneNode, type ThemeToken } from 'interactives-player';
import { toRgba } from './a11y/colour';
import { isBrandLocked, isChromeNode } from './branded/lock';

/**
 * Link colours to tokens: the plain colours on the artboards that exactly match a token's colour in the default theme become
 * references to that token, so a theme switch has something to change. Projects that were imported, or built before the
 * tokens, hold plain hex everywhere and a theme can only change a colour that follows a token.
 */

/** What a colour is for, which decides which token wins when two have the same value. */
export type ColourRole = 'background' | 'fill' | 'text' | 'stroke' | 'buttonFill' | 'buttonText' | 'link' | 'inputFill' | 'shadow';

/** The summary's groups, in the order they are read out. */
export type ColourKind = 'backgrounds' | 'fills' | 'text' | 'strokes' | 'shadows';
export const KIND_ORDER: ColourKind[] = ['backgrounds', 'fills', 'text', 'strokes', 'shadows'];
const KIND_WORD: Record<ColourKind, [string, string]> = {
  backgrounds: ['background', 'backgrounds'],
  fills: ['fill', 'fills'],
  text: ['text', 'text'],
  strokes: ['stroke', 'strokes'],
  shadows: ['shadow', 'shadows'],
};

const KIND_OF: Record<ColourRole, ColourKind> = {
  background: 'backgrounds',
  fill: 'fills',
  buttonFill: 'fills',
  inputFill: 'fills',
  text: 'text',
  buttonText: 'text',
  link: 'text',
  stroke: 'strokes',
  shadow: 'shadows',
};

/** Token names a role prefers, best first. Anything else a value shares goes to the first token in the list. */
export const ROLE_PREFERENCE: Record<ColourRole, string[]> = {
  background: ['color/background', 'color/surface'],
  fill: ['color/surface', 'color/surface-muted', 'color/primary'],
  buttonFill: ['color/button', 'color/primary'],
  inputFill: ['color/background', 'color/surface'],
  text: ['color/text', 'color/muted'],
  buttonText: ['color/on-button', 'color/on-primary'],
  link: ['color/link', 'color/text'],
  stroke: ['color/border', 'color/divider'],
  shadow: [],
};

export interface LinkOptions {
  /** Only these artboards (the artboard menu); all of them when absent. */
  artboardIds?: string[];
  /** The F9 brand override: brand layers are fair game. */
  brandOverride?: boolean;
}

export interface LeftOver {
  /** The colour as written. */
  color: string;
  count: number;
  /** A few of the layers it is on, so it can be found. */
  where: string[];
}

export interface LinkSummary {
  /** Colours that would be (or were) linked. */
  total: number;
  byKind: Record<ColourKind, number>;
  /** Plain colours that match no token, most used first. */
  left: LeftOver[];
  /** Colours that already follow a token. */
  already: number;
}

/** One place a colour is stored: what it says, what it is for, and how to change it. */
interface Slot {
  get: () => string;
  set: (v: string) => void;
  role: ColourRole;
  where: string;
}

/** Normal form of a colour for comparing: rounded channels and alpha, so #fff, #ffffff and rgb(255,255,255) are the same. Null for what cannot be read or is invisible. */
export function colourKey(c: unknown): string | null {
  const v = toRgba(c);
  if (!v || v[3] <= 0) return null;
  return `${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])},${Math.round(v[3] * 1000) / 1000}`;
}

/** Every token by the colour it has in the default theme (tokens with the same colour share a list, in token order). */
export function tokensByColour(themes: ProjectThemes): Map<string, ThemeToken[]> {
  const out = new Map<string, ThemeToken[]>();
  const def = defaultTheme(themes).id;
  for (const token of themes.tokens) {
    const key = colourKey(tokenValue(themes, token, def));
    if (!key) continue;
    const list = out.get(key);
    if (list) list.push(token);
    else out.set(key, [token]);
  }
  return out;
}

/** The token a plain colour should become for a role, or undefined when no token has that colour. */
export function matchToken(table: Map<string, ThemeToken[]>, color: string, role: ColourRole): ThemeToken | undefined {
  const key = colourKey(color);
  const list = key ? table.get(key) : undefined;
  if (!list?.length) return undefined;
  for (const name of ROLE_PREFERENCE[role]) {
    const hit = list.find((t) => t.name.trim().toLowerCase() === name);
    if (hit) return hit;
  }
  return list[0];
}

function boardSlots(ab: Artboard, brandOverride: boolean, project: Project, into: Slot[]): void {
  // A library copy is read-only (a brand kit's only with the override), so the edit would be refused whole
  if (ab.library && !(ab.library.brand && brandOverride)) return;
  const held = !brandOverride && isBrandLocked(project);
  const field = (o: Record<string, unknown>, key: string, role: ColourRole, where: string) => {
    if (typeof o[key] === 'string') into.push({ get: () => o[key] as string, set: (v) => void (o[key] = v), role, where });
  };
  const paint = (p: Paint | null | undefined, role: ColourRole, where: string) => {
    if (!p || typeof p !== 'object') return;
    if (p.type === 'solid') field(p as unknown as Record<string, unknown>, 'color', role, where);
    else if (p.type === 'linear' || p.type === 'radial') for (const s of p.stops ?? []) if (s) field(s as unknown as Record<string, unknown>, 'color', role, where);
  };
  if (ab.background) paint(ab.background, 'background', ab.name);
  const visit = (list: SceneNode[], inChrome: boolean) => {
    for (const n of list) {
      const chrome = inChrome || (held && isChromeNode(n));
      if (!chrome) nodeSlots(n);
      if (isContainer(n)) visit(n.children, chrome);
    }
  };
  const nodeSlots = (n: SceneNode) => {
    const o = n as unknown as Record<string, unknown>;
    const refs = n.styleRefs;
    const where = n.name || n.type;
    // A part that follows a colour style is the style's to colour (the Themes panel turns styles into tokens)
    const fillRole: ColourRole = n.type === 'button' ? 'buttonFill' : n.type === 'input' ? 'inputFill' : n.type === 'frame' ? 'background' : 'fill';
    const textRole: ColourRole = n.type === 'button' ? 'buttonText' : n.type === 'link' ? 'link' : 'text';
    if (!refs?.fill) {
      paint(o.fill as Paint | null, fillRole, where);
      for (const p of (o.fills as Paint[]) ?? []) paint(p, fillRole, where);
    }
    if (!refs?.stroke) {
      paint((o.stroke as { paint?: Paint } | null)?.paint, 'stroke', where);
      for (const s of (o.strokes as { paint?: Paint }[]) ?? []) paint(s?.paint, 'stroke', where);
    }
    if (!refs?.color && !refs?.text) {
      field(o, 'color', textRole, where);
      for (const r of (o.runs as Record<string, unknown>[]) ?? []) if (r) field(r, 'color', textRole, where);
    }
    const sh = o.shadow as Record<string, unknown> | null | undefined;
    if (sh) field(sh, 'color', 'shadow', where);
  };
  visit(ab.children as SceneNode[], false);
}

/** Every colour slot on the artboards in scope. */
function collect(project: Project, opts: LinkOptions): Slot[] {
  const slots: Slot[] = [];
  const only = opts.artboardIds ? new Set(opts.artboardIds) : null;
  for (const ab of project.artboards) if (!only || only.has(ab.id)) boardSlots(ab, !!opts.brandOverride, project, slots);
  return slots;
}

/**
 * Work out (and with `apply`, do) the linking on `project`. Pass a draft to apply it; a finished project is only read.
 * Colours that match no token stay as they are and come back in `left`.
 */
function run(project: Project, opts: LinkOptions, apply: boolean): LinkSummary {
  const out: LinkSummary = { total: 0, byKind: { backgrounds: 0, fills: 0, text: 0, strokes: 0, shadows: 0 }, left: [], already: 0 };
  const themes = project.themes;
  const table = hasTokens(themes) ? tokensByColour(themes) : null;
  const left = new Map<string, LeftOver>();
  for (const slot of collect(project, opts)) {
    const c = slot.get();
    if (isTokenRef(c)) {
      out.already++;
      continue;
    }
    const key = colourKey(c);
    if (!key) continue;
    const token = table ? matchToken(table, c, slot.role) : undefined;
    if (token) {
      out.total++;
      out.byKind[KIND_OF[slot.role]]++;
      if (apply) slot.set(tokenRef(token.id));
      continue;
    }
    // Spelled differently but the same colour is one entry
    const seen = left.get(key);
    if (seen) {
      seen.count++;
      if (seen.where.length < 3 && !seen.where.includes(slot.where)) seen.where.push(slot.where);
    } else left.set(key, { color: c, count: 1, where: [slot.where] });
  }
  out.left = [...left.values()].sort((a, b) => b.count - a.count);
  return out;
}

/** What linking would do, without doing it. */
export function planLinkColours(project: Project, opts: LinkOptions = {}): LinkSummary {
  return run(project, opts, false);
}

/** Link the colours on a project draft (one `store.update` is one undo step). */
export function linkColours(draft: Project, opts: LinkOptions = {}): LinkSummary {
  return run(draft, opts, true);
}

/** "Link 7 colours: 3 backgrounds, 2 fills, 2 text". */
export function describeLink(s: LinkSummary, verb = 'Link'): string {
  const parts = KIND_ORDER.filter((k) => s.byKind[k] > 0).map((k) => `${s.byKind[k]} ${KIND_WORD[k][s.byKind[k] === 1 ? 0 : 1]}`);
  return `${verb} ${s.total} ${s.total === 1 ? 'colour' : 'colours'}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

export interface FollowCounts {
  /** Colours on the artboards that follow a token. */
  followed: number;
  /** Colours that are plain (and visible). */
  plain: number;
}

/** How many colours on the artboards follow a token and how many do not: nothing followed is what makes a theme switch do nothing. */
export function followCounts(project: Project, artboardIds?: string[]): FollowCounts {
  const out: FollowCounts = { followed: 0, plain: 0 };
  // Brand layers count too: they are on the page whether or not they can be edited
  for (const slot of collect(project, { artboardIds, brandOverride: true })) {
    const c = slot.get();
    if (isTokenRef(c)) out.followed++;
    else if (colourKey(c)) out.plain++;
  }
  return out;
}

/** True when the project has tokens, there are colours on the artboards, and none of them follows a token. */
export function nothingFollowsTheme(project: Project, artboardIds?: string[]): boolean {
  if (!hasTokens(project.themes)) return false;
  const c = followCounts(project, artboardIds);
  return c.followed === 0 && c.plain > 0;
}
