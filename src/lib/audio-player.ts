//The editor's one little audio player: the Play button of a word's audio, a recording's Listen and a voice Preview all go through it,
//so only one sound is ever playing and anything that cares can ask who it is.
import { useSyncExternalStore } from 'react';

interface Playing {
  key: string;
  el: HTMLAudioElement;
  done?: () => void;
}

let current: Playing | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function finish(p: Playing) {
  if (current !== p) return;
  current = null;
  p.done?.();
  emit();
}

/** Stop whatever is playing, or only a sound whose key says it is this owner's (keys are `<owner>|<what>`). */
export function stopAudio(owner?: string): void {
  if (!current || (owner !== undefined && !current.key.startsWith(`${owner}|`))) return;
  const p = current;
  p.el.pause();
  finish(p);
}

/** Play a sound, first stopping the one playing. `done` runs when it ends or is stopped, so a temporary url can be let go. Rejects when the browser cannot play it. */
export async function playAudio(key: string, src: string, done?: () => void): Promise<void> {
  stopAudio();
  const el = new Audio(src);
  const p: Playing = { key, el, done };
  current = p;
  el.addEventListener('ended', () => finish(p));
  el.addEventListener('error', () => finish(p));
  emit();
  try {
    await el.play();
  } catch (e) {
    finish(p);
    throw e;
  }
}

export const playingKey = (): string | null => current?.key ?? null;

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/** Is this key the sound playing now. */
export function useAudioPlaying(key: string): boolean {
  return useSyncExternalStore(subscribe, () => current?.key === key);
}
