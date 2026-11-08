import { useSyncExternalStore } from 'react';
import { onPrefsLoaded, prefs, prefsUser, setPrefs } from './prefs';

/**
 * Which inspector sections the person has folded or opened, by a stable section key (the Section's `id`, else its title). One
 * state per key across every layer. Only what differs from the section's own default is stored, so a default that changes in a
 * later version still reaches everyone who never touched that section.
 *
 * A signed in person's folds live in their preferences (`sectionFolds`, saved to the server with the rest, so they follow the
 * person between machines). The localStorage copy is what guests keep, what any fold made before the server's preferences have
 * arrived goes to, and the old per-browser value that is moved into the preferences, once, when they do.
 */
const KEY = 'ix-section-folds';

const clean = (v: unknown): Record<string, boolean> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (Object.fromEntries(Object.entries(v).filter(([k, o]) => k && typeof o === 'boolean')) as Record<string, boolean>) : {};

function load(): Record<string, boolean> {
  try {
    return clean(JSON.parse(localStorage.getItem(KEY) ?? '{}'));
  } catch {
    return {};
  }
}

// the server's preferences have answered (or couldn't be reached), so a signed in person's folds are in them
let ready = false;
const inPrefs = () => ready && prefsUser() !== 'guest';

let saved = load();
let version = 0;
const subs = new Set<() => void>();
// the sections on screen right now (for fold all and for the header button's label)
const mounted = new Map<number, { key: string; def: boolean }>();
let nextId = 1;

const persist = () => {
  // setPrefs keeps its own copy in this browser and debounces the save to the server
  if (inPrefs()) return setPrefs({ sectionFolds: { ...saved } });
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* storage unavailable: the folds last until the page reloads */
  }
};
const emit = () => {
  version++;
  subs.forEach((f) => f());
};

/** The section's key: an explicit id, else the title when that is plain text. */
export function sectionKey(id: string | undefined, title: unknown): string {
  return id ?? (typeof title === 'string' ? title : '');
}

export function isSectionOpen(key: string, def: boolean): boolean {
  return key && key in saved ? saved[key] : def;
}

export function setSectionOpen(key: string, open: boolean, def: boolean): void {
  if (!key) return;
  const had = key in saved;
  if (open === def) delete saved[key];
  else saved[key] = open;
  if (had || key in saved) (persist(), emit());
}

/** Register a mounted section; returns the cleanup. */
export function registerSection(key: string, def: boolean): () => void {
  const id = nextId++;
  mounted.set(id, { key, def });
  emit();
  return () => {
    mounted.delete(id);
    emit();
  };
}

/** Fold or open every section on screen. */
export function setAllSections(open: boolean): void {
  for (const { key, def } of mounted.values()) if (key) (open === def ? delete saved[key] : (saved[key] = open));
  persist();
  emit();
}

/** Alt-click: this section open, every other one on screen folded. */
export function onlySectionOpen(key: string): void {
  for (const m of mounted.values()) {
    if (!m.key) continue;
    const open = m.key === key;
    open === m.def ? delete saved[m.key] : (saved[m.key] = open);
  }
  persist();
  emit();
}

/** Forget every choice: each section goes back to its own default. */
export function resetSectionFolds(): void {
  saved = {};
  persist();
  emit();
}

export function allSectionsFolded(): boolean {
  const all = [...mounted.values()].filter((m) => m.key);
  return all.length > 0 && all.every((m) => !isSectionOpen(m.key, m.def));
}

export const sectionFoldCount = () => mounted.size;

export function useSectionFoldVersion(): number {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => version,
  );
}

const same = (a: Record<string, boolean>, b: Record<string, boolean>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

// Once the preferences are in: a guest carries on from localStorage; a signed in person takes the preferences' folds, with an
// old per-browser value added under them (what's on the server wins) and then cleared. Offline, the cached copy is used and
// the old value is left where it is for the next time.
onPrefsLoaded((ok) => {
  ready = true;
  if (prefsUser() === 'guest') {
    saved = load();
    return emit();
  }
  const mine = clean(prefs().sectionFolds);
  const old = load();
  if (!ok) {
    if (Object.keys(mine).length) saved = mine;
    return emit();
  }
  saved = { ...old, ...mine };
  if (Object.keys(old).length) {
    if (!same(saved, mine)) setPrefs({ sectionFolds: { ...saved } });
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable */
    }
  }
  emit();
});

/** Test hook: read the store again from where it lives and clear the mounted list. */
export function reloadSectionFolds(): void {
  saved = inPrefs() ? clean(prefs().sectionFolds) : load();
  mounted.clear();
  emit();
}
