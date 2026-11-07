import { store } from '../store/store';

/** The "Tidy up artboards" command (Layers panel, canvas right-click menu): lays the artboards out, says so, and fits them all on screen. */
export function tidyArtboardsCommand(): void {
  const s = store();
  const moved = s.tidyArtboards();
  s.toast(moved ? `Tidied ${moved} ${moved === 1 ? 'artboard' : 'artboards'} into a grid, in the order of the Artboards list. Undo (Ctrl+Z) puts them back.` : 'The artboards are already tidy.', 'info');
  if (moved) requestAnimationFrame(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true })));
}
