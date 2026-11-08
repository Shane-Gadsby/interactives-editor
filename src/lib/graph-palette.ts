/**
 * What the Interactions panel's node palette lists: the catalog's nodes under their category (Events, Actions, Logic) and, inside
 * it, their topic (Pointer and keys, Variables...), filtered by a typed search and by chips, and folded by the person. The folds
 * are kept in this browser, like the panel widths. Pure, so the rules are tested without a screen.
 */
import { CATALOG, NODE_GROUPS, type Category, type NodeDef, type NodeGroup } from 'interactives-player';
import { rankNodes } from './node-search';

export const CATEGORIES: { id: Category; title: string }[] = [
  { id: 'event', title: 'Events' },
  { id: 'action', title: 'Actions' },
  { id: 'logic', title: 'Logic' },
];

export interface PaletteGroup {
  key: string;
  category: Category;
  group: NodeGroup;
  defs: NodeDef[];
}

export const groupKey = (category: Category, group: string): string => `${category}/${group}`;

/** Every topic that has nodes, by category and then in the topics' own order. */
export function paletteGroups(defs: NodeDef[] = CATALOG): PaletteGroup[] {
  const out: PaletteGroup[] = [];
  for (const c of CATEGORIES)
    for (const g of NODE_GROUPS) {
      const list = defs.filter((d) => d.category === c.id && d.group === g);
      if (list.length) out.push({ key: groupKey(c.id, g), category: c.id, group: g, defs: list });
    }
  return out;
}

export interface PaletteFilter {
  query: string;
  categories: Category[];
  topics: NodeGroup[];
}

export const NO_FILTER: PaletteFilter = { query: '', categories: [], topics: [] };
export const isFiltering = (f: PaletteFilter): boolean => !!f.query.trim() || f.categories.length > 0 || f.topics.length > 0;

/**
 * The palette under a filter. Chips narrow what is searched (categories together, topics together, and both with the text); the
 * text ranks what is left. Groups come back with only their hits, the groups with the best hit first within each category.
 */
export function filterPalette(f: PaletteFilter, defs: NodeDef[] = CATALOG): { groups: PaletteGroup[]; count: number } {
  const pool = defs.filter((d) => (!f.categories.length || f.categories.includes(d.category)) && (!f.topics.length || f.topics.includes(d.group)));
  const ranked = rankNodes(f.query, pool);
  const rank = new Map(ranked.map((d, i) => [d.kind, i]));
  const groups = paletteGroups(ranked)
    .map((g) => ({ ...g, defs: [...g.defs].sort((a, b) => rank.get(a.kind)! - rank.get(b.kind)!) }))
    .sort((a, b) => CATEGORIES.findIndex((c) => c.id === a.category) - CATEGORIES.findIndex((c) => c.id === b.category) || (f.query.trim() ? rank.get(a.defs[0].kind)! - rank.get(b.defs[0].kind)! : 0));
  return { groups, count: ranked.length };
}

// ---------------------------------------------------------------- folds

/** Events and the actions most flows start with are open the first time; the rest are folded until someone wants them. */
export const DEFAULT_OPEN: string[] = [groupKey('event', 'Start and load'), groupKey('event', 'Pointer and keys'), groupKey('action', 'Variables'), groupKey('action', 'Navigation'), groupKey('action', 'Layers and looks'), groupKey('logic', 'Branching')];

/** Only what the person has changed from the defaults is stored: group key to open (true) or folded (false). */
export type Folds = Record<string, boolean>;

export const isOpen = (folds: Folds, key: string): boolean => folds[key] ?? DEFAULT_OPEN.includes(key);
export const toggled = (folds: Folds, key: string): Folds => ({ ...folds, [key]: !isOpen(folds, key) });
export const allSet = (keys: string[], open: boolean): Folds => Object.fromEntries(keys.map((k) => [k, open]));
/** Just this group open, every other folded. */
export const onlyOpen = (keys: string[], key: string): Folds => Object.fromEntries(keys.map((k) => [k, k === key]));

export const FOLDS_STORAGE_KEY = 'ix-palette-folds';

/** The saved folds, or none when there are none or they are not usable (a private window, or something else wrote the key). */
export function loadFolds(): Folds {
  try {
    const v = JSON.parse(localStorage.getItem(FOLDS_STORAGE_KEY) ?? 'null');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v).filter(([, o]) => typeof o === 'boolean')) as Folds;
  } catch {
    return {};
  }
}

export function saveFolds(folds: Folds): void {
  try {
    localStorage.setItem(FOLDS_STORAGE_KEY, JSON.stringify(folds));
  } catch {
    // private window or full: the folds still work for this visit
  }
}
