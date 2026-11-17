/**
 * Where each person is in the tutorials (Build it, Getting started, Concepts). Kept with the editor's preferences, so it follows
 * the person between browsers: `tutorialProgress` maps a help topic id to the steps ticked and, once the whole tutorial is done,
 * when. Everything here is plain data in and out; the help and the dashboard draw from it and lib/celebrate.ts does the cheering.
 */

export interface TutorialEntry {
  /** The step numbers ticked, as they are numbered in the tutorial (the "3." of "## 3. Draw the box"). */
  steps?: number[];
  /** When the whole tutorial was finished (ms since 1970). Stays once set: ticking a step off again doesn't take a badge away. */
  done?: number;
}
export type TutorialProgressMap = Record<string, TutorialEntry>;

/** A group of tutorials with a badge for finishing every one of them. */
export interface TutorialSet {
  id: string;
  name: string;
  /** Help topic ids. */
  members: string[];
}

/** Most entries and steps the server keeps (index.js cleanPrefs holds the same limits). */
export const PROGRESS_LIMITS = { entries: 120, steps: 40 };

export interface Step {
  n: number;
  title: string;
}

/** The numbered steps of a tutorial: `## 1. Make a project` (or `### 4.` under a Part heading). Code blocks are skipped. */
export function stepsOf(body: string): Step[] {
  const out: Step[] = [];
  let code = false;
  for (const line of body.replace(/\r/g, '').split('\n')) {
    if (line.startsWith('```')) code = !code;
    if (code) continue;
    const m = /^#{2,3}\s+(\d+)\.\s+(.+)$/.exec(line);
    if (m) out.push({ n: Number(m[1]), title: m[2].replace(/[`*]/g, '').trim() });
  }
  return out;
}

/** Does this heading text (without its #s) carry a step number? Same rule as stepsOf, for the help's Markdown to put a tick on it. */
export const stepNumber = (heading: string, level: number): number | null => {
  const m = level >= 2 && level <= 3 ? /^(\d+)\.\s+\S/.exec(heading) : null;
  return m ? Number(m[1]) : null;
};

export const entryOf = (map: TutorialProgressMap | undefined, id: string): TutorialEntry => map?.[id] ?? {};
export const isDone = (map: TutorialProgressMap | undefined, id: string): boolean => !!entryOf(map, id).done;

/** Step numbers that count: ticked ones that the tutorial still has. */
export function ticked(map: TutorialProgressMap | undefined, id: string, steps: Step[]): number[] {
  const have = new Set(entryOf(map, id).steps ?? []);
  return steps.filter((s) => have.has(s.n)).map((s) => s.n);
}

export interface Change {
  map: TutorialProgressMap;
  /** The tutorial became finished by this change. */
  finished: boolean;
}

const withEntry = (map: TutorialProgressMap, id: string, e: TutorialEntry): TutorialProgressMap => {
  const next = { ...map };
  if (!e.steps?.length && !e.done) delete next[id];
  else next[id] = { ...(e.steps?.length ? { steps: e.steps } : {}), ...(e.done ? { done: e.done } : {}) };
  return next;
};

/** Tick (or untick) one step. Ticking the last one finishes the tutorial. */
export function setStep(map: TutorialProgressMap | undefined, id: string, steps: Step[], n: number, on: boolean, now = Date.now()): Change {
  const base = map ?? {};
  const e = entryOf(base, id);
  const have = new Set(e.steps ?? []);
  if (on) have.add(n);
  else have.delete(n);
  const list = [...have].sort((a, b) => a - b).slice(0, PROGRESS_LIMITS.steps);
  const all = steps.length > 0 && steps.every((s) => have.has(s.n));
  const finished = on && all && !e.done;
  return { map: withEntry(base, id, { steps: list, done: e.done ?? (finished ? now : undefined) }), finished };
}

/** Finish the whole tutorial in one go (every step ticked), or a concept with no steps. */
export function finish(map: TutorialProgressMap | undefined, id: string, steps: Step[], now = Date.now()): Change {
  const base = map ?? {};
  const e = entryOf(base, id);
  return { map: withEntry(base, id, { steps: steps.map((s) => s.n).slice(0, PROGRESS_LIMITS.steps), done: e.done ?? now }), finished: !e.done };
}

/** Back to not started: no steps, no badge. */
export function restart(map: TutorialProgressMap | undefined, id: string): TutorialProgressMap {
  return withEntry(map ?? {}, id, {});
}

export interface SetStatus {
  set: TutorialSet;
  done: number;
  total: number;
  earned: boolean;
}

export function setStatus(map: TutorialProgressMap | undefined, set: TutorialSet): SetStatus {
  const done = set.members.filter((m) => isDone(map, m)).length;
  return { set, done, total: set.members.length, earned: set.members.length > 0 && done === set.members.length };
}

/** The sets a change completed: earned after, not before. */
export function newSets(before: TutorialProgressMap | undefined, after: TutorialProgressMap | undefined, sets: TutorialSet[]): TutorialSet[] {
  return sets.filter((s) => setStatus(after, s).earned && !setStatus(before, s).earned);
}

/** How many of these are done, for a card or the dashboard's total. */
export const countDone = (map: TutorialProgressMap | undefined, ids: string[]): number => ids.filter((i) => isDone(map, i)).length;
