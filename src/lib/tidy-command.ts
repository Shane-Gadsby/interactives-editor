import { store } from '../store/store';

/** The "Tidy up artboards" command (Layers panel, canvas right-click menu): lays the artboards out, says so, and fits them all on screen. */
export function tidyArtboardsCommand(): void {
  const s = store();
  const mark = s.historyMark();
  const moved = s.tidyArtboards();
  if (moved) s.toastUndo(`Tidied ${moved} ${moved === 1 ? 'artboard' : 'artboards'} into a grid, in the order of the Artboards list.`, mark);
  else s.toast('The artboards are already tidy.', 'info');
  if (moved) requestAnimationFrame(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '!', code: 'Digit1', shiftKey: true })));
}
