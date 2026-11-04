import { currentPalette, loadPalette, refreshLinkedTokens, setLivePalette, type Project } from 'interactives-player';
import { store } from '../store/store';

/**
 * The starter look comes from the shared StudyDesk palette (/styles/palette.min.css). It is fetched once when the editor starts;
 * until it arrives, and if it never does, the generated snapshot in the player stands in. When it arrives the colours new layers
 * start with change to match, and the palette-linked tokens of the open project are refreshed (a hand-edited colour has
 * no link, so it stays).
 */
let started: Promise<boolean> | null = null;

export function startPalette(): Promise<boolean> {
  started ??= loadPalette().then((vars) => {
    if (!vars) return false;
    setLivePalette(vars);
    try {
      // Not an edit the person made: no undo step, but the next save carries it
      store().patchSilently((d) => void refreshLinkedTokens(d.themes as never, currentPalette()));
    } catch {
      /* no project open yet: it is refreshed when it opens */
    }
    return true;
  });
  return started;
}

/**
 * A project that was just loaded, brought in line with the palette (waits briefly for it, never for long). Without the live
 * palette nothing changes: the colours the project stored are the last known ones, not the snapshot's.
 */
export async function syncProjectWithPalette(p: Project): Promise<number> {
  const live = await Promise.race([startPalette(), new Promise<boolean>((r) => setTimeout(() => r(false), 600))]);
  return live ? refreshLinkedTokens(p.themes, currentPalette()) : 0;
}
