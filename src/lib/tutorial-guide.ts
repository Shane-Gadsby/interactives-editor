import { maybeStore, onCurrentStore, type EditorStore } from '../store/store';
import { onPreviewOpened } from './overlays';
import { prefs } from './prefs';
import { tickStep, type Tracked } from './tutorial-actions';
import { forgetRestart, pendingTicks, watching } from './tutorial-hold';
import type { Guide, GuideCtx, GuideSeen } from './tutorial-checks';
import type { TutorialSet } from './tutorial-progress';

/** How long after a change to the project the checks look again (they run at most this often, not on every mouse move). */
export const LOOK_EVERY_MS = 300;

/**
 * Watches the open project while a guided tutorial is on screen in the help, and ticks a step when its check passes. Cheap: the
 * store tells it about every change, and it only does something about it once per LOOK_EVERY_MS. Follows the project that is open
 * (none: nothing happens, and the tutorial is ticked by hand like any other). Returns the way to stop.
 */
export function startGuide(t: Tracked, guide: Guide, sets: TutorialSet[]): () => void {
  let seen: GuideSeen = { played: false, recorded: false, previewed: false };
  let store: EditorStore | null = null;
  let detach = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;

  const look = () => {
    timer = undefined;
    if (!store) return forgetRestart(t.id);
    const s = store.get();
    const ctx: GuideCtx = { project: s.project, state: s, seen };
    const have = new Set(prefs().tutorialProgress?.[t.id]?.steps ?? []);
    const todo = pendingTicks(t.id, guide, ctx, have).filter((n) => t.steps.some((x) => x.n === n));
    todo.forEach((n, i) => tickStep(t, n, true, sets, i < todo.length - 1));
  };
  const soon = () => {
    if (timer === undefined) timer = setTimeout(look, LOOK_EVERY_MS);
  };
  //what the project cannot say afterwards: it was played, Record was on
  const changed = () => {
    if (store) {
      const s = store.get();
      if (s.previewPlaying) seen.played = true;
      if (s.recording) seen.recorded = true;
    }
    soon();
  };
  const attach = (next: EditorStore | null) => {
    detach();
    store = next;
    seen = { played: false, recorded: false, previewed: false };
    if (!next) return;
    const off = [
      next.subscribe(changed),
      onPreviewOpened(() => {
        seen.previewed = true;
        soon();
      }),
    ];
    detach = () => off.forEach((f) => f());
    soon();
  };

  attach(maybeStore());
  const offStore = onCurrentStore(attach);
  const offHold = watching(t.id, look);
  return () => {
    offStore();
    offHold();
    detach();
    if (timer !== undefined) clearTimeout(timer);
  };
}
