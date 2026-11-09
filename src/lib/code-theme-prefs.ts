import { useSyncExternalStore } from 'react';
import { usePrefs, type Prefs } from './prefs';

/**
 * The colours of every code editor (Scripts, the Data tab's raw text, the Inspector's code boxes). One per-person
 * preference, `codeTheme`: follow the editor's own light/dark theme (the default), or stay light or dark whatever it is.
 * Each editor keeps the theme in a Compartment, so a change reaches open editors without rebuilding them.
 */
export type CodeTheme = 'follow' | 'light' | 'dark';

export const CODE_THEMES: { value: CodeTheme; label: string; tip: string }[] = [
  { value: 'follow', label: 'Follow the editor', tip: 'Code is drawn light when the editor is light and dark when the editor is dark, and switches with it' },
  { value: 'light', label: 'Light', tip: 'Dark code on a light page, whatever the editor looks like' },
  { value: 'dark', label: 'Dark', tip: 'Light code on a dark page, whatever the editor looks like' },
];

const LIGHT_QUERY = '(prefers-color-scheme: light)';

/** True while the system asks for a light scheme (what the editor's Auto theme follows; it is dark otherwise). */
export function systemLight(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(LIGHT_QUERY).matches;
}
export function subscribeSystem(f: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(LIGHT_QUERY);
  mq.addEventListener?.('change', f);
  return () => mq.removeEventListener?.('change', f);
}

/** Is the editor itself drawn dark right now? Preferences > Theme, with Auto resolved against the system. */
export function editorIsDark(p: Pick<Prefs, 'theme'>, light: boolean = systemLight()): boolean {
  return p.theme === 'dark' || (p.theme === 'auto' && !light);
}

/** Are code editors drawn dark right now? The Code editor colours choice, with Follow the editor resolved against the editor's theme. */
export function codeIsDark(p: Pick<Prefs, 'theme' | 'codeTheme'>, light: boolean = systemLight()): boolean {
  return p.codeTheme === 'dark' || (p.codeTheme !== 'light' && editorIsDark(p, light));
}

/** Live: re-renders when the preference, the editor theme or (for Auto) the system scheme changes. */
export function useCodeIsDark(): boolean {
  const p = usePrefs();
  const light = useSyncExternalStore(subscribeSystem, systemLight, () => false);
  return codeIsDark(p, light);
}
