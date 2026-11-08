import { useSyncExternalStore } from 'react';
import { DEFAULT_GRID } from './grid';
import { installSessionHeader, sessionUser } from './session';

/**
 * Per-person editor preferences. The server keeps them per user (GET/PUT api/prefs), so they follow you between
 * browsers; this browser keeps a copy per user so the theme is right before the server answers.
 */
export interface Prefs {
  /** 'zoom': the wheel zooms and Shift+wheel pans; 'ctrl': the wheel pans and Ctrl/Cmd+wheel zooms. */
  wheel: 'zoom' | 'ctrl';
  /** Show hover tooltips. */
  tooltips: boolean;
  /** Rulers along the canvas edges (Shift+R). */
  rulers: boolean;
  /** The grid drawn on the canvas (Shift+G). It never shows in Preview or exports. */
  showGrid: boolean;
  /** Moves, resizes, new shapes, pen points and arrow-key nudges land on the grid (Ctrl+'). Ctrl while dragging turns it off. */
  snapGrid: boolean;
  /** Grid cell size in artboard pixels. An artboard can override it (`artboard.grid`). */
  gridSize: number;
  /** A stronger line every this many cells. */
  gridSubdivisions: number;
  /** Colour theme; 'auto' follows the system. */
  theme: 'dark' | 'light' | 'auto';
  /** Font family for new text layers and the font every new project includes. */
  defaultFont: string;
  /**
   * Layer semantics and keyboard operation in Preview (the player's `accessibility` option): tab stops, Enter/Space, ARIA
   * roles, focus ring, announcements. On by default; switch it off to check whether a problem comes from it.
   */
  accessibility: boolean;
  /** The Screen reader strip under Preview, showing what would be announced. Off by default; it only shows while accessibility is on too. */
  screenReader: boolean;
  /** In-app notices for review comments handed to you, mentioning you, or replied to. On by default; the server checks it too. */
  commentNotices: boolean;
  /** Draw the parts of layers that hang outside an artboard that clips faintly beside it, so they can be seen and picked. On by default; the player and exports still clip. */
  ghostOutside: boolean;
  /** Draw the sticky notes authors leave on the canvas (never part of the player or an export). On by default; templates carry their own explanations as notes, so this is how they are put away. */
  showNotes: boolean;
  /** Panel arrangements saved under a name (lib/workspaces.ts checks each one before using it). */
  workspaces?: unknown[];
}

export const DEFAULT_FONT = 'Open Sans';
const DEFAULTS: Prefs = { wheel: 'zoom', tooltips: true, rulers: false, showGrid: false, snapGrid: false, gridSize: DEFAULT_GRID.size, gridSubdivisions: DEFAULT_GRID.subdivisions, theme: 'dark', defaultFont: DEFAULT_FONT, accessibility: true, screenReader: false, commentNotices: true, ghostOutside: true, showNotes: true };
const LAST_USER = 'ix-prefs-user';
const keyFor = (user: string) => `ix-prefs:${user}`;

const read = (key: string): Partial<Prefs> => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
};
const write = (key: string, v: unknown) => {
  try {
    localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
};

let user: string = (() => {
  try {
    return localStorage.getItem(LAST_USER) ?? 'guest';
  } catch {
    return 'guest';
  }
})();
let current: Prefs = { ...DEFAULTS, ...read(keyFor(user)) };
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

export function prefs(): Prefs {
  return current;
}

/** Put the theme on <html> so the stylesheet can switch colours. */
export function applyTheme(): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = current.theme;
}
applyTheme();

const API = typeof document !== 'undefined' ? new URL('api/prefs', document.baseURI).href : '';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void fetch(API, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: current }) }).catch(() => undefined);
  }, 400);
}

// Changes made before the server's copy arrived, laid back over it when it does
let early: Partial<Prefs> | null = {};

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  if (early) Object.assign(early, patch);
  applyTheme();
  write(keyFor(user), current);
  notify();
  save();
}

/** Load this person's preferences from the server (called once at start-up). */
export async function loadUserPrefs(): Promise<void> {
  try {
    // App.tsx calls this as it's imported, which is before main.tsx installs the session header. Without the header
    // and the session the server answers for "guest", and that copy replaced the person's own on every load
    installSessionHeader();
    await sessionUser();
    const res = await fetch(API, { credentials: 'same-origin' });
    if (!res.ok) {
      early = null;
      return;
    }
    const body = (await res.json()) as { user: string; prefs: Partial<Prefs> };
    user = body.user || 'guest';
    write(LAST_USER, user);
    const fromServer = body.prefs ?? {};
    // Nothing on the server yet: start from what this browser had (preferences used to be per browser)
    const first = !Object.keys(fromServer).length;
    const local = first ? { ...read('ix-prefs'), ...read(keyFor(user)) } : {};
    const changed = early ?? {};
    early = null;
    current = { ...DEFAULTS, ...local, ...fromServer, ...changed };
    write(keyFor(user), current);
    applyTheme();
    notify();
    if ((first && Object.keys(local).length) || Object.keys(changed).length) save();
  } catch {
    early = null;
    /* offline: keep the cached copy */
  }
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}
