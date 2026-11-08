import type { Project } from 'interactives-player';
import { onTrack } from './analytics';
import { hasSavedLayout } from './dock';
import { prefs, setPrefs } from './prefs';
import type { EditorStore } from '../store/store';

/**
 * First-run: the five jobs the Getting started strip lists and ticks off as the author does them, and what is remembered about a
 * new person (in their preferences, so it follows them between browsers). Nothing here is a tour: the strip links to the
 * tutorials that already exist, and every job is something the editor was going to see happen anyway.
 */

export type JobId = 'shape' | 'move' | 'click' | 'preview' | 'share';

export interface Job {
  id: JobId;
  label: string;
  /** What to do, in a sentence, for the tooltip. */
  hint: string;
  /** The help topic of its two-minute tutorial. */
  tutorial: string;
}

export const JOBS: Job[] = [
  { id: 'shape', label: 'Add a shape', hint: 'Pick Rectangle in the tool bar on the left, then drag on the artboard', tutorial: 'tutorial-first-animation' },
  { id: 'move', label: 'Move it', hint: 'Drag the shape with the Select tool, or change its X and Y in the Properties panel', tutorial: 'tutorial-first-animation' },
  { id: 'click', label: 'Make it do something when clicked', hint: 'In the Interactions tab, add a Pointer event for the shape and connect it to an action', tutorial: 'tutorial-first-interaction' },
  { id: 'preview', label: 'Preview it', hint: 'Press Preview at the top to play it the way a learner will', tutorial: 'tutorial-first-interaction' },
  { id: 'share', label: 'Share it', hint: 'Share, then Share link: a page anyone you send it to can play', tutorial: 'tutorial-publish' },
];

const flags = (): Record<string, boolean> => prefs().onboarding ?? {};
const write = (patch: Record<string, boolean>) => setPrefs({ onboarding: { ...flags(), ...patch } });

export const jobDone = (id: JobId): boolean => !!flags()[`job-${id}`];
export const jobsDone = (): number => JOBS.filter((j) => jobDone(j.id)).length;

/** Tick a job. Does nothing for one that is ticked already, so it costs nothing to call on every event. */
export function markJob(id: JobId): void {
  if (jobDone(id)) return;
  write({ [`job-${id}`]: true });
}

/** Is the strip to be shown: it is on in Preferences, was not put away, and a job is left. */
export function stripShown(p = prefs()): boolean {
  const o = p.onboarding ?? {};
  return p.gettingStarted !== false && !o.dismissed && !JOBS.every((j) => o[`job-${j.id}`]);
}

/** Put the strip away for good (Preferences can bring it back). */
export function dismissStrip(): void {
  write({ dismissed: true });
}

/** Bring the strip back (Preferences). Jobs already ticked stay ticked, unless all of them were, which would leave nothing to show: then they start again. */
export function restartTips(): void {
  const all = JOBS.every((j) => jobDone(j.id));
  const keep = Object.fromEntries(Object.entries(flags()).filter(([k]) => k !== 'dismissed' && !(all && k.startsWith('job-'))));
  setPrefs({ gettingStarted: true, onboarding: keep });
}

/** The first-run screen has been seen, so this person is new: Essentials is theirs the first time they open a project. */
export function markWelcomed(): void {
  if (flags().welcomed) return;
  // someone who already arranged their panels in this browser keeps them
  write({ welcomed: true, fresh: !hasSavedLayout() });
}

/** Has the first-run screen been left behind (a goal picked, or skipped), so the projects page can show its ordinary empty state? */
export const welcomeLeft = (): boolean => !!flags().left;
export function leaveWelcome(): void {
  write({ left: true });
}

/** A new person who has not had the Essentials workspace yet. */
export const wantsEssentials = (): boolean => !!flags().fresh && !flags().essentials;
export function noteEssentialsApplied(): void {
  write({ essentials: true });
}

/** How many logic edges leave a pointer event, across the whole project: the jobs "make it do something when clicked" watches this go up. */
export function pointerEdges(project: Project): number {
  let n = 0;
  for (const ab of project.artboards) {
    const pointers = new Set(ab.logic.nodes.filter((x) => x.kind === 'event.pointer').map((x) => x.id));
    for (const e of ab.logic.edges) if (pointers.has(e.from)) n++;
  }
  return n;
}

/** What the analytics hooks hear, as jobs done. */
export function jobFor(area: string, action: string, thing: string | undefined): JobId | null {
  if (area === 'node' && action === 'add') return 'shape';
  if (area === 'inspector' && action === 'change' && (thing === 'x' || thing === 'y')) return 'move';
  if (area === 'preview' && (action === 'open' || (action === 'loaded' && thing === 'preview'))) return 'preview';
  if (area === 'feature' && action === 'share-publish') return 'share';
  return null;
}

/**
 * Ticks the jobs while an editor is open: the events the editor already reports (a layer added, a position changed, the preview
 * loaded, a link published) and a new connection from a click event in the document. Returns the function that stops watching.
 */
export function watchGettingStarted(store: EditorStore): () => void {
  let edges = pointerEdges(store.get().project);
  let project = store.get().project;
  const stopStore = store.subscribe(() => {
    const p = store.get().project;
    if (p === project) return;
    project = p;
    // hold off while the strip has nothing left to tick
    if (jobDone('click')) return;
    const now = pointerEdges(p);
    if (now > edges) markJob('click');
    edges = now;
  });
  const stopEvents = onTrack((area, action, thing) => {
    const job = jobFor(area, action, thing);
    if (job) markJob(job);
  });
  return () => {
    stopStore();
    stopEvents();
  };
}
