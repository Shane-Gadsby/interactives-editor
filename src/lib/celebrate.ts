import { useSyncExternalStore } from 'react';
import { prefs } from './prefs';

/**
 * The small cheers for tutorial progress: a line when a step is ticked, and a badge card (with a short burst of confetti, or a
 * still badge for people who asked their system for less motion) when a tutorial or a whole set is finished. Never blocks anything:
 * it sits in a corner, clears itself, and Esc or its Close puts it away at once. Off entirely when Preferences says so.
 */
export type Cheer =
  | { kind: 'step'; key: number; text: string }
  | { kind: 'badge'; key: number; title: string; lines: string[]; still: boolean };

let current: Cheer | null = null;
let key = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** The cheers can be turned off in Preferences (Tutorial badges and cheers). */
export const cheersOn = (): boolean => prefs().tutorialBadges !== false;

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function show(c: Cheer, ms: number): void {
  if (timer) clearTimeout(timer);
  current = c;
  emit();
  timer = setTimeout(dismissCheer, ms);
}

export function dismissCheer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (current) {
    current = null;
    emit();
  }
}

/** One short line, like "Step 3 done. 4 to go." */
export function cheerLine(text: string): void {
  if (!cheersOn()) return;
  show({ kind: 'step', key: ++key, text }, 2200);
  chime(false);
}

/** A tutorial (and perhaps sets) was finished: the badge card. `title` is what was finished, `lines` the other badges it brought. */
export function cheerBadge(title: string, lines: string[] = []): void {
  if (!cheersOn()) return;
  show({ kind: 'badge', key: ++key, title, lines, still: reducedMotion() }, 7000);
  chime(true);
}

/** What was last shown, for tests. */
export const lastCheer = (): Cheer | null => current;

export function useCheer(): Cheer | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
  );
}

//A soft two-note chime, only if the person turned sounds on in Preferences (never by default)
let ctx: AudioContext | null = null;
function chime(big: boolean): void {
  if (!prefs().tutorialSound || typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime;
    (big ? [523.25, 659.25, 783.99] : [659.25]).forEach((hz, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      o.type = 'sine';
      o.frequency.value = hz;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.08, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.5);
      o.connect(g).connect(ctx!.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.55);
    });
  } catch {
    /* no audio here */
  }
}
