import { passing, type Guide, type GuideCtx } from './tutorial-checks';

/**
 * Respecting the person who unticks a step. A tutorial's step ticks itself when its check passes; once somebody takes the tick
 * off by hand it stays off until the check has gone false and come true again, and "Start again" does the same for every step
 * that already passes. Kept for the session, by tutorial id, so closing and opening the help does not undo it.
 */
const held = new Map<string, Set<number>>();
const restarted = new Set<string>();

/** A step was unticked by hand. */
export function noteUntick(id: string, n: number): void {
  const h = held.get(id) ?? new Set<number>();
  h.add(n);
  held.set(id, h);
}

const watchers = new Map<string, Set<() => void>>();

/** A guided tutorial's watcher says it is looking at this tutorial, and how to make it look now. Returns the way to stop. */
export function watching(id: string, look: () => void): () => void {
  const l = watchers.get(id) ?? new Set<() => void>();
  l.add(look);
  watchers.set(id, l);
  return () => void l.delete(look);
}

/** The tutorial was started again: whatever passes right now is left unticked (only when something is watching to tick it again). */
export function noteRestart(id: string): void {
  const l = watchers.get(id);
  if (!l?.size) return;
  restarted.add(id);
  l.forEach((look) => look());
}

/** Nothing can tick this one now (no project is open), so a restart does not need remembering. */
export function forgetRestart(id: string): void {
  restarted.delete(id);
}

/** Forget everything (a test, or progress reset). */
export function clearHolds(): void {
  held.clear();
  restarted.clear();
}

/** The steps to tick now: passing, not ticked yet, and not held off by the person. Also lets go of a hold whose check no longer passes. */
export function pendingTicks(id: string, guide: Guide, ctx: GuideCtx, ticked: ReadonlySet<number>): number[] {
  const ok = new Set(passing(guide, ctx));
  const hold = held.get(id) ?? new Set<number>();
  held.set(id, hold);
  for (const n of [...hold]) if (!ok.has(n)) hold.delete(n);
  if (restarted.delete(id)) {
    ok.forEach((n) => hold.add(n));
    return [];
  }
  return [...ok].filter((n) => !ticked.has(n) && !hold.has(n)).sort((a, b) => a - b);
}
