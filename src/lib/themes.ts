import {
  bakeTheme,
  countTokenUse,
  defaultTheme,
  fillList,
  findTheme,
  hasTokens,
  isTokenRef,
  makeColorResolver,
  strokeList,
  tokenIdOf,
  tokenRef,
  tokenValue,
  uid,
  walk,
  type ColorResolver,
  type Paint,
  type Project,
  type ProjectThemes,
  type SceneNode,
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

/** The starter tokens: name, then the value in Light, Dark and High contrast. */
const STARTER_TOKENS: [string, string, string, string][] = [
  ['color/background', '#ffffff', '#16181d', '#000000'],
  ['color/surface', '#f3f4f8', '#23262e', '#000000'],
  ['color/text', '#1c1e26', '#f1f2f6', '#ffffff'],
  ['color/muted', '#555b6b', '#b4b9c6', '#ffffff'],
  ['color/primary', '#3b5bfd', '#8fa3ff', '#ffff00'],
  ['color/on-primary', '#ffffff', '#0e1020', '#000000'],
  ['color/border', '#8a90a0', '#6d7384', '#ffffff'],
];

export function starterThemes(): ProjectThemes {
  const list = STARTER_THEMES.map((t) => ({ ...t }));
  const tokens: ThemeToken[] = STARTER_TOKENS.map(([name, ...values]) => ({ id: uid('tk'), name, values: Object.fromEntries(list.map((t, i) => [t.id, values[i]])) }));
  return { list, tokens, follow: true };
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
  }
  return theme;
}

/** Remove a theme (the last one stays). Tokens keep their other values. */
export function removeTheme(draft: Project, id: string): boolean {
  const t = draft.themes;
  if (!t || t.list.length < 2 || !t.list.some((x) => x.id === id)) return false;
  t.list = t.list.filter((x) => x.id !== id);
  for (const token of t.tokens) delete token.values[id];
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

export function setTokenValue(draft: Project, id: string, themeId: string, color: string): void {
  const token = draft.themes?.tokens.find((x) => x.id === id);
  if (!token) return;
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
  { fg: 'color/on-primary', bg: 'color/primary', label: 'label on primary', need: 4.5 },
  { fg: 'color/primary', bg: 'color/background', label: 'primary on background', need: 3 },
  { fg: 'color/border', bg: 'color/background', label: 'outline against background', need: 3 },
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
      out.push({ themeId: theme.id, label: p.label, foreground: f!, background: b!, ratio, need: p.need, pass: ratio >= p.need });
    }
  }
  return out;
}

export { findTheme };
