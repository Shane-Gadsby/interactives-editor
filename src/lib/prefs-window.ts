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
  /** The editor is on screen, so its Workspace page (panel layouts) means something. */
  editor: boolean;
}

let state: State = { open: false, page: 'general', pendingImport: null, editor: false };
const subs = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};

/** Open the window, on `page` when given (else on the page it was last on). */
export function openPrefs(page?: PageId): void {
  set({ open: true, ...(page ? { page } : {}) });
}
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
