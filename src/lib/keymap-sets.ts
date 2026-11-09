//Keyboard shortcut sets: the built-in Default and Illustration style (read-only bases), and sets the person saves under a name.
//The keys in use are still prefs.keymap (overrides) on top of prefs.keymapPreset (the base), which is what keymap.ts reads, so
//nothing else in the editor knows sets exist. A saved set is a copy of those two, linked by prefs.keymapActive: while one is
//active, every key change writes through to it. Everything here is in the person's prefs, never in a project, and a share code
//is the set itself (no server storage).
import { prefs, setPrefs, type KeymapSet, type Prefs } from './prefs';
import { COMMANDS, PRESETS, allConflicts, bindingsIn, commandById, isValidCombo, normalCombo, type Preset } from './keymap';
import { ensureCommandKeys } from './command-keys';

export type { KeymapSet };
export const MAX_SETS = 16;
export const MAX_NAME = 60;
const MAX_KEYS_PER_COMMAND = 4;
const MAX_IMPORT_CHARS = 200_000;
export const EXPORT_FORMAT = 'interactives-keymap';
export const CODE_PREFIX = 'ixk1.';

const isPreset = (v: unknown): v is Preset => v === 'default' || v === 'illustration';

/** The saved sets, with anything that does not look like one left out (the server checks too). */
export function customSets(p: Prefs = prefs()): KeymapSet[] {
  const seen = new Set<string>();
  return (Array.isArray(p.keymapSets) ? p.keymapSets : []).filter((s) => {
    if (!s || typeof s.id !== 'string' || typeof s.name !== 'string' || !isPreset(s.base) || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

export type ActiveSet = { kind: 'built-in'; id: Preset; name: string; modified: boolean } | { kind: 'saved'; set: KeymapSet; name: string };

/** Which set the keys in use belong to. A built-in with keys changed on top reads as modified, until it is saved under a name. */
export function activeSet(p: Prefs = prefs()): ActiveSet {
  const saved = customSets(p).find((s) => s.id === p.keymapActive);
  if (saved) return { kind: 'saved', set: saved, name: saved.name };
  const id: Preset = isPreset(p.keymapPreset) ? p.keymapPreset : 'default';
  return { kind: 'built-in', id, name: PRESETS.find((x) => x.id === id)?.label ?? 'Default', modified: Object.keys(p.keymap ?? {}).length > 0 };
}

/** "Illustration style (changed)", "Mine": what the set picker shows for the one in use. */
export const activeLabel = (a: ActiveSet): string => (a.kind === 'built-in' && a.modified ? `${a.name} (changed)` : a.name);

const uid = (): string => `ks-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

/** A name not already used by a built-in set or a saved one ("Mine", then "Mine 2"...). */
export function uniqueName(want: string, taken: string[]): string {
  const base = want.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) || 'My keys';
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  if (!lower.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base.slice(0, MAX_NAME - String(n).length - 1)} ${n}`;
    if (!lower.has(next.toLowerCase())) return next;
  }
  return base;
}
const takenNames = (except?: string): string[] => [...PRESETS.map((x) => x.label), ...customSets().filter((s) => s.id !== except).map((s) => s.name)];

/** Change the keys in use (and the set they start from). Written through to the saved set that is active, so saved sets never go stale. */
export function setKeymap(keys: Record<string, string[]>, base?: Preset): void {
  const p = prefs();
  const patch: Partial<Prefs> = { keymap: keys };
  if (base) patch.keymapPreset = base;
  const a = activeSet(p);
  if (a.kind === 'saved') {
    patch.keymapSets = customSets(p).map((s) => (s.id === a.set.id ? { ...s, keys: { ...keys }, base: base ?? s.base } : s));
  }
  setPrefs(patch);
}

/** Use a built-in set. The keys changed on top of the one in use are dropped, so ask first when there are unsaved ones (activeSet().modified). */
export function useBuiltIn(id: Preset): void {
  setPrefs({ keymap: {}, keymapPreset: id, keymapActive: undefined });
}

/** Use a saved set. */
export function useSaved(id: string): boolean {
  const s = customSets().find((x) => x.id === id);
  if (!s) return false;
  setPrefs({ keymap: { ...s.keys }, keymapPreset: s.base, keymapActive: s.id });
  return true;
}

const add = (name: string, base: Preset, keys: Record<string, string[]>, use: boolean): KeymapSet | null => {
  const sets = customSets();
  if (sets.length >= MAX_SETS) return null;
  const set: KeymapSet = { id: uid(), name: uniqueName(name, takenNames()), base, keys: JSON.parse(JSON.stringify(keys)) };
  setPrefs(use ? { keymapSets: [...sets, set], keymap: { ...set.keys }, keymapPreset: set.base, keymapActive: set.id } : { keymapSets: [...sets, set] });
  return set;
};

/** Keep the keys in use under a name, and carry on with that set. Null when there are already as many sets as there is room for. */
export function saveCurrentAs(name: string): KeymapSet | null {
  const p = prefs();
  return add(name, isPreset(p.keymapPreset) ? p.keymapPreset : 'default', p.keymap ?? {}, true);
}

export function renameSet(id: string, name: string): void {
  const sets = customSets();
  if (!sets.some((s) => s.id === id)) return;
  const next = uniqueName(name, takenNames(id));
  setPrefs({ keymapSets: sets.map((s) => (s.id === id ? { ...s, name: next } : s)) });
}

/** A copy under a new name, which becomes the one in use. */
export function duplicateSet(id: string, name?: string): KeymapSet | null {
  const s = customSets().find((x) => x.id === id);
  return s ? add(name || `${s.name} copy`, s.base, s.keys, true) : null;
}

/** Take a saved set away. When it was the one in use the keys go back to the Default set. */
export function deleteSet(id: string): void {
  const sets = customSets();
  if (!sets.some((s) => s.id === id)) return;
  const patch: Partial<Prefs> = { keymapSets: sets.filter((s) => s.id !== id) };
  if (prefs().keymapActive === id) Object.assign(patch, { keymap: {}, keymapPreset: 'default', keymapActive: undefined });
  setPrefs(patch);
}

/** Put every key back to its default: the built-in Default set, with nothing changed. Saved sets are left as they are. */
export function resetKeymap(): void {
  const a = activeSet();
  //(a saved set that is active is a place the person keeps keys, so emptying it empties the set too; use Default instead)
  if (a.kind === 'saved') useBuiltIn('default');
  else setPrefs({ keymap: {}, keymapPreset: 'default' });
}

// ---------------------------------------------------------------- export, share code, import

export interface KeymapFile {
  format: typeof EXPORT_FORMAT;
  version: 1;
  name: string;
  base: Preset;
  keys: Record<string, string[]>;
}

/** The set in use as something to export or share: its name, the base it starts from and the keys changed on top. */
export function currentAsFile(p: Prefs = prefs()): KeymapFile {
  const a = activeSet(p);
  return { format: EXPORT_FORMAT, version: 1, name: activeLabel(a), base: isPreset(p.keymapPreset) ? p.keymapPreset : 'default', keys: JSON.parse(JSON.stringify(p.keymap ?? {})) };
}

export const exportFileName = (f: KeymapFile): string => `${f.name.replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'keys'}.keymap.json`;
export const exportText = (f: KeymapFile): string => JSON.stringify(f, null, 2);

const toB64 = (s: string): string => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string): string => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** A short text that holds the whole set: paste it into Import on another account or browser. */
export function shareCode(f: KeymapFile = currentAsFile()): string {
  return CODE_PREFIX + toB64(JSON.stringify({ n: f.name, b: f.base, k: f.keys }));
}

/** A link that opens the editor and offers the set for import (the code is in the part of the address after #, so no server sees it). */
export function shareLink(f: KeymapFile = currentAsFile()): string {
  const base = typeof document !== 'undefined' ? document.baseURI.split('#')[0] : '';
  return `${base}#/keys/${shareCode(f)}`;
}

export const KEYS_ROUTE = /^#\/keys\/(ixk1\.[A-Za-z0-9_-]+)/;

export interface ImportReview {
  name: string;
  base: Preset;
  /** What will be saved: only commands this editor has and can change, with valid keys. */
  keys: Record<string, string[]>;
  /** What each command gets, in the registry's order, for the list the person reads before saying yes. */
  entries: { id: string; name: string; keys: string[] }[];
  /** Command ids this editor does not have (a newer or older editor, or a typo). Left out. */
  unknown: string[];
  /** Commands whose keys the browser or the page owns. Left out. */
  fixed: string[];
  /** Keys that are not keys (how many were dropped). */
  badKeys: number;
  /** Keys in this set that two commands in the same place would share. */
  clashes: { combo: string; names: string[] }[];
  /** How many commands end up with keys different from the ones in use now. */
  differs: number;
}

export type ImportResult = { ok: true; review: ImportReview } | { ok: false; error: string };

/** Read what someone gave us: a share code, a share link, or the text of an exported file. Nothing is changed. */
export function reviewImport(text: string): ImportResult {
  ensureCommandKeys();
  const raw = (text ?? '').trim();
  if (!raw) return { ok: false, error: 'Paste a share code, a link, or the text of an exported file.' };
  if (raw.length > MAX_IMPORT_CHARS) return { ok: false, error: 'That is too big to be a set of keys.' };
  let obj: unknown;
  try {
    if (raw.startsWith('{')) obj = JSON.parse(raw);
    else {
      const code = /ixk1\.[A-Za-z0-9_-]+/.exec(raw)?.[0];
      if (!code) return { ok: false, error: 'That does not look like a share code, a link or an exported file.' };
      obj = JSON.parse(fromB64(code.slice(CODE_PREFIX.length)));
    }
  } catch {
    return { ok: false, error: 'That could not be read. A share code or file may have been cut short when it was copied.' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'That is not a set of keys.' };
  const o = obj as Record<string, unknown>;
  if (typeof o.format === 'string' && o.format !== EXPORT_FORMAT) return { ok: false, error: 'That file is not a set of keys from this editor.' };
  if (typeof o.version === 'number' && o.version > 1) return { ok: false, error: 'That set was made by a newer editor. Update, then try again.' };
  const given = o.keys ?? o.k;
  if (!given || typeof given !== 'object' || Array.isArray(given)) return { ok: false, error: 'That does not have any keys in it.' };
  const nameIn = o.name ?? o.n;
  const baseIn = o.base ?? o.b;
  const name = typeof nameIn === 'string' && nameIn.trim() ? nameIn.trim().slice(0, MAX_NAME) : 'Imported keys';
  const base: Preset = isPreset(baseIn) ? baseIn : 'default';

  const keys: Record<string, string[]> = {};
  const unknown: string[] = [];
  const fixed: string[] = [];
  let badKeys = 0;
  for (const [id, list] of Object.entries(given as Record<string, unknown>).slice(0, 600)) {
    const def = commandById(id);
    if (!def) {
      if (unknown.length < 200) unknown.push(id.slice(0, 60));
      continue;
    }
    if (def.fixed) {
      fixed.push(id);
      continue;
    }
    if (!Array.isArray(list)) {
      badKeys++;
      continue;
    }
    const clean: string[] = [];
    for (const k of list) {
      if (typeof k !== 'string' || !isValidCombo(k)) {
        badKeys++;
        continue;
      }
      const n = normalCombo(k);
      if (!clean.includes(n)) clean.push(n);
    }
    //the base already gives these keys: nothing to carry
    const baseKeys = bindingsIn(base, undefined, id);
    if (clean.length === baseKeys.length && clean.every((k, i) => k === baseKeys[i])) continue;
    keys[id] = clean.slice(0, MAX_KEYS_PER_COMMAND);
  }
  const clashes = allConflicts((id) => bindingsIn(base, keys, id)).map((c) => ({ combo: c.combo, names: c.commands.map((x) => x.name) }));
  const now = prefs();
  const entries = COMMANDS.filter((c) => keys[c.id]).map((c) => ({ id: c.id, name: c.name, keys: keys[c.id] }));
  const differs = COMMANDS.filter((c) => {
    const a = bindingsIn(base, keys, c.id);
    const b = bindingsIn(now.keymapPreset, now.keymap, c.id);
    return a.length !== b.length || a.some((k, i) => k !== b[i]);
  }).length;
  return { ok: true, review: { name, base, keys, entries, unknown, fixed, badKeys, clashes, differs } };
}

/** Save a reviewed import as a new set (never over one of theirs), and carry on with it when `use`. Null when the sets are full. */
export function addImported(review: ImportReview, name: string, use: boolean): KeymapSet | null {
  return add(name || review.name, review.base, review.keys, use);
}
