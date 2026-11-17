import { useSyncExternalStore } from 'react';
import { Badge } from '../components/Badge';
import { maybeStore, onCurrentStore } from '../store/store';
import { finishTutorial, restartTutorial, type Tracked } from '../lib/tutorial-actions';
import { ticked, isDone, type TutorialProgressMap } from '../lib/tutorial-progress';
import type { Guide } from '../lib/tutorial-checks';
import { TUTORIAL_SETS, catalogItem } from './tutorial-catalog';

/** What the help tracks for a topic: a tutorial with numbered steps, or a concept (read or not). Null for every other page. */
export function trackedFor(id: string): Tracked | null {
  const c = catalogItem(id);
  return c ? { id: c.id, title: c.title, steps: c.steps, concept: c.group === 'Concepts' } : null;
}

/** The checks and Show me targets of a tutorial, when it has them. */
export const guideFor = (id: string): Guide | undefined => catalogItem(id)?.guide;

/** Is a project open in the editor? Guided tutorials only work while one is (the help can also be on the projects page). */
export function useEditorOpen(): boolean {
  return useSyncExternalStore(
    (f) => onCurrentStore(f),
    () => !!maybeStore(),
    () => false,
  );
}

/** The strip under a tutorial's title: how many steps are ticked, the badge once it is finished, and Start again. */
export function TutorialHead({ t, progress }: { t: Tracked; progress: TutorialProgressMap | undefined }) {
  const guided = !!guideFor(t.id);
  const editorOpen = useEditorOpen();
  const done = isDone(progress, t.id);
  const n = ticked(progress, t.id, t.steps).length;
  const text = done ? (t.concept ? 'You have read this' : 'Finished. Badge earned') : t.concept ? 'Not marked as read yet' : `${n} of ${t.steps.length} steps ticked`;
  return (
    <div className="tutorial-bar" role="group" aria-label="Your progress in this tutorial">
      <Badge earned={done} size={24} />
      <span className="tutorial-bar-text">{text}</span>
      {!t.concept && t.steps.length > 0 && <progress value={n} max={t.steps.length} aria-label="Steps ticked" />}
      {(done || n > 0) && (
        <button type="button" className="link-btn inline" title="Clear the ticks and the badge for this one" onClick={() => restartTutorial(t.id)}>
          Start again
        </button>
      )}
      {guided && !done && (
        <span className="tutorial-guided muted">{editorOpen ? 'Steps tick themselves as you work. Show me points at the control a step talks about.' : 'Open a project and this tutorial ticks its steps for you as you work.'}</span>
      )}
    </div>
  );
}

/** At the foot: for someone who did it without ticking along, one press counts the whole thing. */
export function TutorialFoot({ t, progress }: { t: Tracked; progress: TutorialProgressMap | undefined }) {
  if (isDone(progress, t.id)) return null;
  return (
    <div className="tutorial-foot">
      <button type="button" className="btn small-btn" title={t.concept ? 'Count this one as read' : 'Count every step of this tutorial as done'} onClick={() => finishTutorial(t, TUTORIAL_SETS)}>
        {t.concept ? 'Mark as read' : 'I have done all of this'}
      </button>
    </div>
  );
}
