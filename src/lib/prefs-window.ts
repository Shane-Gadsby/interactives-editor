//Whether the Preferences window is open, and on which page. One window for the whole editor: the gear, the ? key and the
//command palette all open it, the ? key on its Keyboard shortcuts page. The app mounts it once (components/PrefsModal.tsx).
import { useSyncExternalStore } from 'react';

/** The pages, in the order the list down the left shows them. */
export const PAGES = ['general', 'canvas', 'timeline', 'interactions', 'text', 'accessibility', 'keys', 'workspace'] as const;
export type PageId = (typeof PAGES)[number];

interface State {
  open: boolean;
  page: PageId;
  /** A share code or link someone opened the editor with, waiting on the Keyboard shortcuts page for a look before it is added. */
  pendingImport: string | null;
  /** What to type into the shortcuts search when the Keyboard shortcuts page opens (a search in Preferences that matched commands). */
  keysSearch: string | null;
  /** The editor is on screen, so its Workspace page (panel layouts) means something. */
  editor: boolean;
  /** A setting to scroll to and mark when the window opens (a link from somewhere else in the editor), by its id in PrefsPages. */
  setting: string | null;
}

let state: State = { open: false, page: 'general', pendingImport: null, keysSearch: null, editor: false, setting: null };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

/** Open the window, on `page` when given (else on the page it was last on). */
export function openPrefs(page?: PageId): void {
  set({ open: true, ...(page ? { page } : {}) });
}
/** Open the window on a page, and take them to one setting on it (the panel's "Use my own Cogniti allowance" link). */
export function openPrefsSetting(page: PageId, setting: string): void {
  set({ open: true, page, setting });
}
export const takeSetting = (): string | null => {
  const t = state.setting;
  if (t !== null) state = { ...state, setting: null };
  return t;
};
export function closePrefs(): void {
  if (state.open) set({ open: false });
}
export function setPrefsPage(page: PageId): void {
  if (state.page !== page) set({ page });
}
export const prefsWindow = (): Readonly<State> => state;
export function usePrefsWindow(): Readonly<State> {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => state,
  );
}

/** Hand the window a share code or link to look at: opens it on the Keyboard shortcuts page. */
export function offerImport(text: string): void {
  set({ open: true, page: 'keys', pendingImport: text });
}
export const takeImport = (): string | null => {
  const t = state.pendingImport;
  if (t !== null) set({ pendingImport: null });
  return t;
};

/** The editor says it is on screen (so Workspace has something to arrange) and when it is not. */
export function setEditorShown(on: boolean): void {
  if (state.editor !== on) set({ editor: on });
}

/** Open the Keyboard shortcuts page with its search already filled in. */
export function searchShortcuts(q: string): void {
  set({ open: true, page: 'keys', keysSearch: q });
}
export const takeKeysSearch = (): string | null => {
  const t = state.keysSearch;
  if (t !== null) state = { ...state, keysSearch: null };
  return t;
};
