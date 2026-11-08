//Whether the command palette (Ctrl/Cmd+K) is open, and whether there is one to open. The editor mounts it; the home page does not,
//so there Ctrl+K falls back to searching the help (help/Help.tsx asks `openPalette()` and takes the false as "no palette here").
import { useSyncExternalStore } from 'react';

let open = false;
let hosts = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** The palette's component calls this while it is mounted. */
export function registerPaletteHost(): () => void {
  hosts++;
  return () => void (hosts = Math.max(0, hosts - 1), open && !hosts && ((open = false), emit()));
}

/** Open (or, if open, close) the palette. False when no palette is mounted. */
export function openPalette(toggle = true): boolean {
  if (!hosts) return false;
  open = toggle ? !open : true;
  emit();
  return true;
}

export function closePalette(): void {
  if (!open) return;
  open = false;
  emit();
}

export const paletteIsOpen = (): boolean => open;

export function usePaletteOpen(): boolean {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => open,
  );
}
