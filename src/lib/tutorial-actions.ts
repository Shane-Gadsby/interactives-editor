import { prefs, setPrefs } from './prefs';
import { cheerBadge, cheerLine, cheersOn } from './celebrate';
import { finish, newSets, restart, setStep, ticked, type Step, type TutorialSet } from './tutorial-progress';

/** What the actions need to know about a tutorial: its topic id, its title and its numbered steps (none for a concept). */
export interface Tracked {
  id: string;
  title: string;
  steps: Step[];
  concept?: boolean;
}

const finished = (t: Tracked, sets: TutorialSet[], before: ReturnType<typeof prefs>['tutorialProgress'], after: NonNullable<ReturnType<typeof prefs>['tutorialProgress']>) => {
  const got = newSets(before, after, sets);
  const extra = got.map((s) => `Badge for the whole set: ${s.name}`);
  if (t.concept && !got.length) cheerLine('Marked as read.');
  else cheerBadge(t.concept ? `Read: ${t.title}` : `Tutorial done: ${t.title}`, extra);
};

/** Tick or untick one step. The last tick finishes the tutorial; that gets the badge card, any other tick a line. */
export function tickStep(t: Tracked, n: number, on: boolean, sets: TutorialSet[]): void {
  const before = prefs().tutorialProgress;
  const c = setStep(before, t.id, t.steps, n, on);
  setPrefs({ tutorialProgress: c.map });
  if (!on || !cheersOn()) return;
  if (c.finished) finished(t, sets, before, c.map);
  else cheerLine(`Step ${n} done. ${t.steps.length - ticked(c.map, t.id, t.steps).length} to go.`);
}

/** Skip ahead: the whole tutorial counts as done (or, for a concept, as read). */
export function finishTutorial(t: Tracked, sets: TutorialSet[]): void {
  const before = prefs().tutorialProgress;
  const c = finish(before, t.id, t.steps);
  setPrefs({ tutorialProgress: c.map });
  if (c.finished && cheersOn()) finished(t, sets, before, c.map);
}

/** Start this one again: its ticks and its badge go. */
export function restartTutorial(id: string): void {
  setPrefs({ tutorialProgress: restart(prefs().tutorialProgress, id) });
}

/** Every tutorial back to not started, every tick and badge gone (Preferences > Reset tutorial progress). */
export function resetTutorialProgress(): void {
  setPrefs({ tutorialProgress: undefined });
}
