import type { FontRef } from 'interactives-player';
import { nearestWeight } from './font-use';

/** The families Google Fonts offers, as shipped in src/data/google-fonts.json (scripts/google-fonts.mjs rebuilds it). */
export type FontCategory = 'sans' | 'serif' | 'display' | 'handwriting' | 'mono';

export const CATEGORIES: { id: FontCategory; label: string }[] = [
  { id: 'sans', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'mono', label: 'Mono' },
];

export interface CatalogFont {
  family: string;
  category: FontCategory;
  weights: number[];
}

const CODE: Record<string, FontCategory> = { s: 'sans', r: 'serif', d: 'display', h: 'handwriting', m: 'mono' };

/** The JSON rows ([family, category code, weights]) as fonts. */
export function parseCatalog(raw: { fonts: [string, string, number[]][] }): CatalogFont[] {
  return raw.fonts.map(([family, c, weights]) => ({ family, category: CODE[c] ?? 'sans', weights }));
}

let catalog: CatalogFont[] | null = null;
let byName = new Map<string, CatalogFont>();
let loading: Promise<CatalogFont[]> | null = null;

/** The list is its own chunk: it is fetched the first time something needs it. */
export function loadCatalog(): Promise<CatalogFont[]> {
  if (catalog) return Promise.resolve(catalog);
  loading ??= import('../data/google-fonts.json').then((m) => setCatalog(parseCatalog((m.default ?? m) as unknown as { fonts: [string, string, number[]][] })));
  return loading;
}

export function setCatalog(list: CatalogFont[]): CatalogFont[] {
  catalog = list;
  byName = new Map(list.map((f) => [f.family.toLowerCase(), f]));
  return list;
}

/** The list if it has been loaded already. */
export const catalogNow = (): CatalogFont[] | null => catalog;

/** A family's entry, whatever the case it was typed in. */
export const catalogFont = (family: string): CatalogFont | undefined => byName.get(family.trim().toLowerCase());

/** The first family of a CSS font-family value, without quotes: `"Open Sans", system-ui` is Open Sans. */
export function firstFamily(stack: string): string {
  const m = /^\s*(?:"([^"]*)"|'([^']*)'|([^,]*))/.exec(stack ?? '');
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim();
}

const GENERIC: Record<FontCategory, string> = { sans: 'sans-serif', serif: 'serif', display: 'sans-serif', handwriting: 'cursive', mono: 'monospace' };

/** A font-family value for a family: quoted when it has a space, with a fallback that suits its category. */
export function fontStack(family: string, category?: FontCategory): string {
  const cat = category ?? catalogFont(family)?.category ?? 'sans';
  const name = /^[A-Za-z][\w-]*$/.test(family) ? family : `"${family.replace(/"/g, '')}"`;
  return `${name}, ${cat === 'sans' || cat === 'display' ? 'system-ui, ' : ''}${GENERIC[cat]}`;
}

/** The weights to load for a family: what the text asks for (and regular and bold), moved to what the family really has. */
export function weightsFor(family: string, wanted: number[] = []): number[] {
  const want = [...new Set([400, 700, ...wanted].filter((w) => Number.isFinite(w) && w >= 100 && w <= 900))];
  const have = catalogFont(family)?.weights;
  const out = have?.length ? want.map((w) => nearestWeight(w, have)) : want;
  return [...new Set(out)].sort((a, b) => a - b);
}

export interface EnsureOptions {
  /** Add a name the list doesn't know (a typed one), as long as the name is not empty */
  force?: boolean;
  /** Only top up a Google font the project already has; never add one */
  existing?: boolean;
}

/**
 * Make sure a project's font list loads `family` in the weights `wanted` (a Google font from the list, or any name with
 * `force`). A family that is already there gets the missing weights; an uploaded font of the same name is left alone.
 * Works on a draft. Returns whether the list changed.
 */
export function ensureGoogleFont(fonts: FontRef[], family: string, wanted: number[] = [], opts: EnsureOptions = {}): boolean {
  const known = catalogFont(family);
  const name = known?.family ?? family.trim();
  if (!name) return false;
  const have = fonts.find((f) => f.source !== 'system' && f.family.toLowerCase() === name.toLowerCase());
  if (have) {
    if (have.source !== 'google') return false;
    const cur = have.weights?.length ? have.weights : [400, 700];
    const next = [...new Set([...cur, ...weightsFor(name, wanted)])].sort((a, b) => a - b);
    // A top-up that adds nothing new is not a change
    if (next.length === cur.length) return false;
    have.weights = next;
    return true;
  }
  if (opts.existing || (!known && !opts.force)) return false;
  fonts.push({ family: name, source: 'google', weights: weightsFor(name, wanted) });
  return true;
}

/** What one row of the picker stands for */
export interface FontOption {
  family: string;
  /** The font-family value to store on a layer */
  stack: string;
  kind: 'project' | 'upload' | 'system' | 'google' | 'typed';
  category?: FontCategory;
  /** A project font that is a Google one: picking it may need more weights loaded */
  google?: boolean;
}

const SYSTEM_STACKS = ['system-ui, sans-serif', 'Georgia, serif', '"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Courier New", monospace', 'ui-monospace, monospace'];

const categoryOfStack = (stack: string): FontCategory | undefined => (/monospace\s*$/.test(stack) ? 'mono' : /sans-serif\s*$/.test(stack) ? 'sans' : /serif\s*$/.test(stack) ? 'serif' : undefined);

/** Every row, in the order they show with nothing typed: the project's own fonts, the system ones, then every Google family. */
export function fontOptions(project: FontRef[], list: CatalogFont[], opts: { system?: boolean } = {}): FontOption[] {
  const seen = new Set<string>();
  const out: FontOption[] = [];
  const add = (o: FontOption) => {
    const k = o.family.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(o);
  };
  for (const f of project) {
    const known = catalogFont(f.family);
    add({ family: f.family, stack: fontStack(f.family, known?.category), kind: f.source === 'asset' ? 'upload' : 'project', category: known?.category, google: f.source === 'google' });
  }
  if (opts.system !== false) {
    for (const s of SYSTEM_STACKS) add({ family: firstFamily(s), stack: s, kind: 'system', category: categoryOfStack(s) });
  }
  for (const g of list) add({ family: g.family, stack: fontStack(g.family, g.category), kind: 'google', category: g.category, google: true });
  return out;
}

/** How well a name matches what was typed: 0 is best, -1 is no match. Every word has to be in the name. */
export function matchRank(name: string, words: string[]): number {
  if (!words.length) return 0;
  const n = name.toLowerCase();
  if (!words.every((w) => n.includes(w))) return -1;
  const q = words.join(' ');
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (words.every((w) => n.split(/[\s-]+/).some((p) => p.startsWith(w)))) return 2;
  return 3;
}

/** The rows that match a search and a category, best matches first. Rows of the same rank keep their order (the project's, then popularity). */
export function filterOptions(all: FontOption[], query: string, category: FontCategory | '' = ''): FontOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length && !category) return all;
  const out: { o: FontOption; rank: number; i: number }[] = [];
  all.forEach((o, i) => {
    if (category && o.category !== category) return;
    const rank = matchRank(o.family, words);
    if (rank >= 0) out.push({ o, rank, i });
  });
  // Where the project's and the system's rows sit above the rest, they keep to that at the same rank
  return out.sort((a, b) => a.rank - b.rank || a.i - b.i).map((x) => x.o);
}

const previewed = new Set<string>();

/**
 * Load the families' names in their own fonts, for the rows of the picker that are on screen. One small request per
 * family (the Google Fonts css2 API with `text=` asks for just the letters of the name). Families the project loads
 * in full are left alone: a second, name-only copy of the same family would win over the full one.
 */
export function previewFonts(families: string[], skip: Iterable<string> = []): void {
  if (typeof document === 'undefined') return;
  const skipped = new Set([...skip].map((s) => s.toLowerCase()));
  for (const family of families) {
    const k = family.toLowerCase();
    if (previewed.has(k) || skipped.has(k)) continue;
    previewed.add(k);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.dataset.fontPreview = family;
    // From this server's font route, Google's own if it is down
    link.href = localPreviewUrl(family);
    link.addEventListener('error', () => { if (!link.href.includes('fonts.googleapis.com')) link.href = previewUrl(family); });
    document.head.appendChild(link);
  }
}

export const previewUrl = (family: string): string => `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}&display=swap`;

/** The same preview from this server's font route (it keeps the answer, so Google is asked about a family once, ever). */
export const localPreviewUrl = (family: string): string => `${new URL('fonts', document.baseURI).href}/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}`;

/** Whether the picker already asked for this family's preview */
export const wasPreviewed = (family: string): boolean => previewed.has(family.toLowerCase());
