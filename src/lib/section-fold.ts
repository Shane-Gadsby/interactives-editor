import { useSyncExternalStore } from 'react';

/**
 * Which inspector sections the person has folded or opened, by a stable section key (the Section's `id`, else its title). One
 * state per key across every layer, kept in this browser. Only what differs from the section's own default is stored, so a
 * default that changes in a later version still reaches everyone who never touched that section.
 */
const KEY = 'ix-section-folds';

function load(): Record<string, boolean> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, unknown>;
    return Object.fromEntries(Object.entries(v).filter(([, o]) => typeof o === 'boolean')) as Record<string, boolean>;
  } catch {
    return {};
  }
}

let saved = load();
let version = 0;
const subs = new Set<() => void>();
// the sections on screen right now (for fold all and for the header button's label)
const mounted = new Map<number, { key: string; def: boolean }>();
let nextId = 1;

const persist = () => {
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

/** Test hook: read the store again from storage and clear the mounted list. */
export function reloadSectionFolds(): void {
  saved = load();
  mounted.clear();
  emit();
}
