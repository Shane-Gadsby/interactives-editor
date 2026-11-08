import {
  LIGHT_LOOK,
  OLD_STARTER_VALUES,
  STARTER_TOKEN_DEFS,
  bakeTheme,
  starterHex,
  countTokenUse,
  createProject,
  defaultTheme,
  fillList,
  findTheme,
  hasTokens,
  isTokenRef,
  makeColorResolver,
  strokeList,
  tokenByName,
  tokenIdOf,
  tokenRef,
  tokenValue,
  uid,
  walk,
  type ColorResolver,
  type LookKey,
  type NodeType,
  type Paint,
  type Project,
  type ProjectThemes,
  type SceneNode,
  type StarterTokenDef,
  type ThemeDef,
  type ThemeToken,
} from 'interactives-player';
import { contrastRatio, over, toRgba } from './a11y/colour';
import { syncNodeStyles } from './libraries';

/**
 * Theme tokens in the editor: the Themes panel's operations on a project draft, and what the canvas, picker and checks need
 * to read them. The format and the runtime are in the player (`themes.ts`); a colour that says `token:<id>` follows a token.
 */

export const STARTER_THEMES: ThemeDef[] = [
  { id: 'theme-light', name: 'Light', mode: 'light' },
  { id: 'theme-dark', name: 'Dark', mode: 'dark' },
  { id: 'theme-high-contrast', name: 'High contrast', mode: 'dark', highContrast: true },
];

/** The starter tokens, made from the shared palette: each colour is the palette's now, and the token remembers the property it came from. */
export function starterThemes(): ProjectThemes {
  const list = STARTER_THEMES.map((t) => ({ ...t }));
  const tokens: ThemeToken[] = STARTER_TOKEN_DEFS.map((d) => starterToken(d, list));
  return { list, tokens, follow: true };
}

type Column = 'light' | 'dark' | 'highContrast';
const columnOf = (t: ThemeDef): Column => (t.highContrast ? 'highContrast' : t.mode === 'dark' ? 'dark' : 'light');

/** A starter token's values and palette links for a list of themes (a theme goes by its mode: Light, Dark, or High contrast). */
function starterToken(d: StarterTokenDef, list: ThemeDef[], id = uid('tk')): ThemeToken {
  const token: ThemeToken = { id, name: d.name, values: {}, palette: {} };
  for (const th of list) {
    const column = columnOf(th);
    token.values[th.id] = starterHex(d, column);
    token.palette![th.id] = d[column];
  }
  return token;
}

/**
 * A blank new project in the toolbox look: the starter themes with their palette-linked tokens, the artboard on `color/background`,
 * so layers added to it (which follow the tokens by name) change with the theme from the start.
 */
export function newProjectWithThemes(name = 'Untitled project'): Project {
  const p = createProject(name);
  p.themes = starterThemes();
  const bg = tokenByName(p.themes, 'color/background');
  if (bg) for (const ab of p.artboards) ab.background = { type: 'solid', color: tokenRef(bg.id) };
  return p;
}

// ---------------------------------------------------------------- the starter look in new layers

/**
 * The starter colours for a project: a reference to the project's own token where it has one by the starter name
 * (`color/text`, `color/button`, ...), else the Light colour as a plain value. A project with no tokens gets plain values only.
 */
export function lookFor(themes: ProjectThemes | undefined | null): Record<LookKey, string> {
  const out = { ...LIGHT_LOOK };
  if (!hasTokens(themes)) return out;
  for (const d of STARTER_TOKEN_DEFS) {
    const token = tokenByName(themes, d.name);
    if (token) out[d.key] = tokenRef(token.id);
  }
  return out;
}

const solid = (color: string) => ({ type: 'solid' as const, color });

/**
 * What a new layer of this type paints with in a project that has theme tokens: the same colours `createNode` starts with,
 * as references to the starter tokens the project has. Nothing for a project without tokens (its layers keep the plain defaults).
 */
export function lookDefaults(project: Project, type: NodeType): Record<string, unknown> {
  if (!hasTokens(project.themes)) return {};
  const l = lookFor(project.themes);
  switch (type) {
    case 'rect':
    case 'ellipse':
    case 'polygon':
    case 'star':
      return { fill: solid(l.surfaceMuted) };
    case 'path':
      return { stroke: { paint: solid(l.text), width: 2 } };
    case 'text':
      return { color: l.text };
    case 'frame':
      return { fill: solid(l.background) };
    case 'button':
      return { fill: solid(l.button), color: l.onButton };
    case 'input':
      return { fill: solid(l.background), stroke: { paint: solid(l.border), width: 1 }, color: l.text };
    case 'link':
      return { color: l.link };
    case 'progress':
      return { fill: solid(l.surfaceMuted), barFill: solid(l.button) };
    case 'chart':
      return { colors: [l.button, l.link, l.success, l.warning, l.error, l.muted], color: l.text };
    default:
      return {};
  }
}

// ---------------------------------------------------------------- projects made before the toolbox look

export interface StarterUpgrade {
  /** Starter tokens still on their old, never edited values. */
  restyle: ThemeToken[];
  /** Starter tokens the project does not have yet. */
  missing: string[];
}

/** What "Update the starter colours" would do to a project's themes. Nothing to do when both are empty. */
export function starterUpgrade(t: ProjectThemes | undefined): StarterUpgrade {
  const none = { restyle: [], missing: [] };
  if (!hasTokens(t)) return none;
  const old = t.tokens.filter((x) => OLD_STARTER_VALUES[x.name.trim().toLowerCase()]);
  // Only a project that started from the starter tokens gets offered the rest of them
  if (!old.length) return none;
  const col = { light: 0, dark: 1, highContrast: 2 } as const;
  const restyle = old.filter((x) => {
    const was = OLD_STARTER_VALUES[x.name.trim().toLowerCase()];
    return t.list.every((th) => (x.values[th.id] ?? '').toLowerCase() === was[col[columnOf(th)]]);
  });
  const missing = STARTER_TOKEN_DEFS.filter((d) => !tokenByName(t, d.name)).map((d) => d.name);
  return { restyle, missing };
}

/**
 * Move a project's starter tokens to the toolbox look: tokens still on their old values get the new ones, and the starter
 * tokens it lacks are added. Layers that follow a token change with it; raw colours and edited tokens are left alone.
 */
export function upgradeStarterTokens(draft: Project): { restyled: number; added: number } {
  const t = draft.themes;
  const todo = starterUpgrade(t);
  if (!t || (!todo.restyle.length && !todo.missing.length)) return { restyled: 0, added: 0 };
  const def = (name: string) => STARTER_TOKEN_DEFS.find((x) => x.name === name)!;
  for (const token of todo.restyle) {
    const fresh = starterToken(def(token.name.trim().toLowerCase()), t.list, token.id);
    token.values = fresh.values;
    token.palette = fresh.palette;
  }
  for (const name of todo.missing) t.tokens.push(starterToken(def(name), t.list));
  return { restyled: todo.restyle.length, added: todo.missing.length };
}

/** The project's themes, created from the starters on first use. */
export function ensureThemes(draft: Project): ProjectThemes {
  draft.themes ??= starterThemes();
  return draft.themes;
}

/** The theme the canvas shows: the one picked there, else the project's default. Undefined when the project has no themes. */
export function shownTheme(project: Project, canvasTheme: string | null): ThemeDef | undefined {
  const t = project.themes;
  if (!t?.list.length) return undefined;
  return (canvasTheme ? t.list.find((x) => x.id === canvasTheme) : undefined) ?? defaultTheme(t);
}

const resolvers = new WeakMap<ProjectThemes, Map<string, ColorResolver>>();

/** The colour resolver for the theme being shown (cached per themes object, so an unchanged one keeps the same function). Null without tokens. */
export function canvasResolver(project: Project, canvasTheme: string | null): ColorResolver | null {
  const t = project.themes;
  if (!hasTokens(t)) return null;
  const theme = shownTheme(project, canvasTheme)!;
  let byTheme = resolvers.get(t);
  if (!byTheme) resolvers.set(t, (byTheme = new Map()));
  let r = byTheme.get(theme.id);
  if (!r) byTheme.set(theme.id, (r = makeColorResolver(t, theme.id)));
  return r;
}

/** A colour as drawn in the theme being shown (raw colours come back as they are). */
export function shownColor(project: Project, canvasTheme: string | null, color: string): string {
  if (!isTokenRef(color)) return color;
  return canvasResolver(project, canvasTheme)?.(color) ?? 'transparent';
}

/** The project with every token replaced by its value in the theme being shown, for exports that have no tokens. Same object when there are none. */
export function bakedForExport(project: Project, canvasTheme: string | null): Project {
  const t = project.themes;
  if (!hasTokens(t)) return project;
  return bakeTheme(project, t, shownTheme(project, canvasTheme)!.id);
}

export function tokenById(themes: ProjectThemes | undefined, id: string): ThemeToken | undefined {
  return themes?.tokens.find((x) => x.id === id);
}

// ---------------------------------------------------------------- editing

export function addTheme(draft: Project, name: string, copyFrom?: string): ThemeDef {
  const t = ensureThemes(draft);
  const from = copyFrom ?? defaultTheme(t).id;
  const theme: ThemeDef = { id: uid('th'), name: name.trim() || 'Theme' };
  t.list.push(theme);
  for (const token of t.tokens) {
    const v = token.values[from] ?? tokenValue(t, token, from);
    if (v) token.values[theme.id] = v;
    // A copy of a colour that follows the palette follows it too
    if (token.palette?.[from]) token.palette[theme.id] = token.palette[from];
  }
  return theme;
}

/** Remove a theme (the last one stays). Tokens keep their other values. */
export function removeTheme(draft: Project, id: string): boolean {
  const t = draft.themes;
  if (!t || t.list.length < 2 || !t.list.some((x) => x.id === id)) return false;
  t.list = t.list.filter((x) => x.id !== id);
  for (const token of t.tokens) {
    delete token.values[id];
    if (token.palette) dropLink(token, id);
  }
  if (t.default === id) delete t.default;
  return true;
}

export function addToken(draft: Project, name: string, color = '#808080'): ThemeToken {
  const t = ensureThemes(draft);
  const token: ThemeToken = { id: uid('tk'), name: name.trim() || 'color/new', values: Object.fromEntries(t.list.map((x) => [x.id, color])) };
  t.tokens.push(token);
  return token;
}

/** What every place that follows a token is changed to when the token goes: the colour it has in the default theme. */
function detachAll(draft: Project, id: string, to: string): void {
  const ref = tokenRef(id);
  const fix = (c: string) => (c === ref ? to : c);
  const paint = (p: Paint | null | undefined) => {
    if (!p) return;
    if (p.type === 'solid') p.color = fix(p.color);
    else if (p.type === 'linear' || p.type === 'radial') for (const s of p.stops) s.color = fix(s.color);
  };
  const visit = (n: SceneNode) => {
    const o = n as unknown as Record<string, unknown>;
    if (o.fill) paint(o.fill as Paint);
    for (const p of (o.fills as Paint[]) ?? []) paint(p);
    if (o.stroke) paint((o.stroke as { paint: Paint }).paint);
    for (const s of (o.strokes as { paint: Paint }[]) ?? []) paint(s.paint);
    if (typeof o.color === 'string') o.color = fix(o.color);
    if (o.barFill) paint(o.barFill as Paint);
    if (n.type === 'chart' && Array.isArray(o.colors)) o.colors = (o.colors as string[]).map(fix);
    const sh = o.shadow as { color: string } | null | undefined;
    if (sh) sh.color = fix(sh.color);
    for (const r of (o.runs as { color?: string }[]) ?? []) if (r.color) r.color = fix(r.color);
  };
  for (const ab of draft.artboards) {
    if (ab.background) paint(ab.background);
    walk(ab.children as SceneNode[], visit);
  }
}

/** Delete a token. Layers that followed it keep its colour from the default theme, as a raw colour. */
export function removeToken(draft: Project, id: string): boolean {
  const t = draft.themes;
  const token = t?.tokens.find((x) => x.id === id);
  if (!t || !token) return false;
  detachAll(draft, id, tokenValue(t, token, defaultTheme(t).id) ?? '#808080');
  t.tokens = t.tokens.filter((x) => x.id !== id);
  for (const s of draft.styles?.colors ?? []) if (s.token === id) delete s.token;
  if (t.host?.map) delete t.host.map[id];
  syncNodeStyles(draft);
  return true;
}

/** Forget which palette property a theme's colour came from (the colour was edited by hand, so it no longer follows the palette). */
export function dropLink(token: ThemeToken, themeId: string): void {
  if (!token.palette) return;
  delete token.palette[themeId];
  if (!Object.keys(token.palette).length) delete token.palette;
}

export function setTokenValue(draft: Project, id: string, themeId: string, color: string): void {
  const token = draft.themes?.tokens.find((x) => x.id === id);
  if (!token) return;
  // The same colour the palette link gives is not an edit; any other colour cuts the link
  if (token.values[themeId] !== color) dropLink(token, themeId);
  token.values[themeId] = color;
  // A style that became this token keeps the default theme's colour, so its swatch and a library update still make sense
  const t = draft.themes!;
  if (themeId === defaultTheme(t).id) for (const s of draft.styles?.colors ?? []) if (s.token === id && !s.library) s.color = color;
}

// ---------------------------------------------------------------- colour styles become tokens

/**
 * Turn every colour style into a token (its colour in every theme) and point the layers that follow the style at it. Styles
 * from a library convert too; a library update keeps the link. Returns how many styles were converted.
 */
export function convertStylesToTokens(draft: Project): number {
  const colors = draft.styles?.colors ?? [];
  const todo = colors.filter((s) => !s.token);
  if (!todo.length) return 0;
  const t = ensureThemes(draft);
  for (const s of todo) {
    // The same name twice is the same token
    const name = s.name.includes('/') ? s.name : `color/${s.name}`;
    const token: ThemeToken = { id: uid('tk'), name, values: Object.fromEntries(t.list.map((x) => [x.id, s.color])) };
    t.tokens.push(token);
    s.token = token.id;
  }
  syncNodeStyles(draft);
  return todo.length;
}

// ---------------------------------------------------------------- counts and checks

export interface ThemeCounts {
  /** Places that follow each token, by token id. */
  used: Map<string, number>;
  /** Solid fills, strokes and text colours that are raw colours (they do not change with a theme). */
  raw: number;
}

export function themeCounts(project: Project): ThemeCounts {
  const used = new Map<string, number>();
  let raw = 0;
  const paint = (p: Paint | null | undefined) => {
    if (p && p.type === 'solid' && p.visible !== false && !isTokenRef(p.color)) raw++;
  };
  const count = (list: SceneNode[]) => {
    countTokenUse(list, used);
    walk(list, (n) => {
      for (const p of fillList(n as never)) paint(p);
      for (const s of strokeList(n as never)) paint(s.paint);
      const c = (n as unknown as { color?: unknown }).color;
      if (typeof c === 'string' && (n.type === 'text' || n.type === 'button' || n.type === 'link' || n.type === 'input') && !isTokenRef(c)) raw++;
    });
  };
  for (const ab of project.artboards) {
    count(ab.children);
    if (isTokenRef((ab.background as { color?: unknown } | null)?.color)) used.set(tokenIdOf((ab.background as { color: string }).color), (used.get(tokenIdOf((ab.background as { color: string }).color)) ?? 0) + 1);
  }
  return { used, raw };
}

export interface PairResult {
  /** The theme it was checked in. */
  themeId: string;
  /** What the pair is, like "text on background". */
  label: string;
  foreground: string;
  background: string;
  /** The two tokens' names, as PAIRS spells them. */
  fgName: string;
  bgName: string;
  ratio: number;
  need: number;
  pass: boolean;
}

/** The pairs that matter, by starter token name: text and body copy on the page and on cards, a button's label on its colour, outlines against the page. */
const PAIRS: { fg: string; bg: string; label: string; need: number }[] = [
  { fg: 'color/text', bg: 'color/background', label: 'text on background', need: 4.5 },
  { fg: 'color/text', bg: 'color/surface', label: 'text on surface', need: 4.5 },
  { fg: 'color/muted', bg: 'color/background', label: 'muted text on background', need: 4.5 },
  { fg: 'color/muted', bg: 'color/surface', label: 'muted text on surface', need: 4.5 },
  { fg: 'color/text', bg: 'color/surface-muted', label: 'text on muted surface', need: 4.5 },
  { fg: 'color/muted', bg: 'color/surface-muted', label: 'muted text on muted surface', need: 4.5 },
  { fg: 'color/on-primary', bg: 'color/primary', label: 'label on primary', need: 4.5 },
  { fg: 'color/on-button', bg: 'color/button', label: 'label on button', need: 4.5 },
  { fg: 'color/primary', bg: 'color/background', label: 'primary on background', need: 3 },
  { fg: 'color/link', bg: 'color/background', label: 'link on background', need: 4.5 },
  { fg: 'color/link', bg: 'color/surface', label: 'link on surface', need: 4.5 },
  { fg: 'color/border', bg: 'color/background', label: 'outline against background', need: 3 },
  { fg: 'color/border', bg: 'color/surface', label: 'outline against surface', need: 3 },
  { fg: 'color/focus', bg: 'color/background', label: 'focus ring on background', need: 3 },
  { fg: 'color/focus', bg: 'color/surface', label: 'focus ring on surface', need: 3 },
  { fg: 'color/success', bg: 'color/success-surface', label: 'success on its surface', need: 4.5 },
  { fg: 'color/error', bg: 'color/error-surface', label: 'error on its surface', need: 4.5 },
  { fg: 'color/warning', bg: 'color/warning-surface', label: 'warning on its surface', need: 4.5 },
  { fg: 'color/text', bg: 'color/success-surface', label: 'text on success surface', need: 4.5 },
  { fg: 'color/text', bg: 'color/error-surface', label: 'text on error surface', need: 4.5 },
  { fg: 'color/text', bg: 'color/warning-surface', label: 'text on warning surface', need: 4.5 },
];

/** Every token pair above, in every theme, with its contrast ratio. Pairs where a token is missing or its value cannot be read are left out. */
export function checkThemePairs(t: ProjectThemes | undefined): PairResult[] {
  if (!t) return [];
  const byName = new Map(t.tokens.map((x) => [x.name.trim().toLowerCase(), x]));
  const out: PairResult[] = [];
  for (const theme of t.list) {
    for (const p of PAIRS) {
      const fg = byName.get(p.fg);
      const bg = byName.get(p.bg);
      if (!fg || !bg) continue;
      const f = tokenValue(t, fg, theme.id);
      const b = tokenValue(t, bg, theme.id);
      const fc = toRgba(f);
      const bc = toRgba(b);
      if (!fc || !bc) continue;
      const back: [number, number, number] = over(bc, [255, 255, 255]);
      const ratio = contrastRatio(over(fc, back), back);
      out.push({ themeId: theme.id, label: p.label, foreground: f!, background: b!, fgName: p.fg, bgName: p.bg, ratio, need: p.need, pass: ratio >= p.need });
    }
  }
  return out;
}

export { findTheme };
