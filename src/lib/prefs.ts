import { useSyncExternalStore } from 'react';

/** Per-person editor preferences, kept in this browser. */
export interface Prefs {
  /** 'zoom': the wheel zooms and Shift+wheel pans; 'ctrl': the wheel pans and Ctrl/Cmd+wheel zooms. */
  wheel: 'zoom' | 'ctrl';
  /** Show hover tooltips. */
  tooltips: boolean;
  /** Rulers along the canvas edges (Shift+R). */
  rulers: boolean;
}

const KEY = 'ix-prefs';
const DEFAULTS: Prefs = { wheel: 'zoom', tooltips: true, rulers: false };

let current: Prefs = (() => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
})();
const subs = new Set<() => void>();

export function prefs(): Prefs {
  return current;
}

export function setPrefs(patch: Partial<Prefs>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: keep it for this session */
  }
  subs.forEach((f) => f());
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
