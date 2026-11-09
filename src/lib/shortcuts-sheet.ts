//The keyboard shortcuts sheet is the Keyboard shortcuts page of the Preferences window (lib/prefs-window.ts); these are the
//names the ? key, the command palette and the help links already use.
import { closePrefs, openPrefs, prefsWindow, usePrefsWindow } from './prefs-window';

/** Open the Keyboard shortcuts page, or close the window when it is already showing that page. */
export function openShortcuts(toggle = true): void {
  if (toggle && shortcutsOpen()) closePrefs();
  else openPrefs('keys');
}
export function closeShortcuts(): void {
  if (shortcutsOpen()) closePrefs();
}
export const shortcutsOpen = (): boolean => prefsWindow().open && prefsWindow().page === 'keys';
export function useShortcutsOpen(): boolean {
  const w = usePrefsWindow();
  return w.open && w.page === 'keys';
}
