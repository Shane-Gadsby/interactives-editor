//Whether the keyboard shortcuts sheet (? , and Preferences > Keyboard shortcuts) is open. The app mounts it once, so it opens from
//the home page and the editor alike.
import { useSyncExternalStore } from 'react';

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Open the sheet, or close it when it is already open. */
export function openShortcuts(toggle = true): void {
  open = toggle ? !open : true;
  emit();
}
export function closeShortcuts(): void {
  if (!open) return;
  open = false;
  emit();
}
export const shortcutsOpen = (): boolean => open;
export function useShortcutsOpen(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => open,
  );
}
