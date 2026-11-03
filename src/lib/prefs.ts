import { useSyncExternalStore } from 'react';

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
}

export const DEFAULT_FONT = 'Open Sans';
const DEFAULTS: Prefs = { wheel: 'zoom', tooltips: true, rulers: false, theme: 'dark', defaultFont: DEFAULT_FONT, accessibility: true, screenReader: false };
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

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  applyTheme();
  write(keyFor(user), current);
  notify();
  save();
}

/** Load this person's preferences from the server (called once at start-up). */
export async function loadUserPrefs(): Promise<void> {
  try {
    const res = await fetch(API, { credentials: 'same-origin' });
    if (!res.ok) return;
    const body = (await res.json()) as { user: string; prefs: Partial<Prefs> };
    user = body.user || 'guest';
    write(LAST_USER, user);
    const fromServer = body.prefs ?? {};
    // Nothing on the server yet: start from what this browser had (preferences used to be per browser)
    const first = !Object.keys(fromServer).length;
    const local = first ? { ...read('ix-prefs'), ...read(keyFor(user)) } : {};
    current = { ...DEFAULTS, ...local, ...fromServer };
    write(keyFor(user), current);
    applyTheme();
    notify();
    if (first && Object.keys(local).length) save();
  } catch {
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
