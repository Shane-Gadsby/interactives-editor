import { useSyncExternalStore } from 'react';
import type { SceneNode } from 'interactives-player';
import { prefs } from './prefs';

/**
 * The "What is this a picture of?" box. A picture or video that was just added (from a file, the Media Catalogue) is
 * remembered here as waiting for a description, with a hint for the box. The Inspector shows the box for a waiting layer
 * until it is answered, marked decorative or skipped, and each of those takes it off the list. The list is kept per project
 * in this browser, so a skip is still a skip after a reload, and nobody is asked twice about the same picture.
 * Nothing here is part of the document.
 */

const KEY = (projectId: string) => `ix-alt-ask:${projectId}`;
const LIMIT = 300;

export type Waiting = Record<string, string>;

const cache = new Map<string, Waiting>();
const subs = new Set<() => void>();

function load(projectId: string): Waiting {
  let w = cache.get(projectId);
  if (w) return w;
  w = {};
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(projectId)) ?? '{}');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw)) if (typeof v === 'string' && k !== '__proto__') w[k] = v.slice(0, 120);
  } catch {
    /* no storage, or not ours: start empty */
  }
  cache.set(projectId, w);
  return w;
}

function save(projectId: string, w: Waiting): void {
  // a new object each time, so a hook reading it sees the change
  cache.set(projectId, w);
  try {
    localStorage.setItem(KEY(projectId), JSON.stringify(w));
  } catch {
    /* storage unavailable: it lasts until the page is closed */
  }
  subs.forEach((f) => f());
}

/** A file name as words to start from: `IMG_2043-beach_sunset.JPG` is "Beach sunset"; a camera's own number gives nothing. */
export function hintFromFileName(name: string): string {
  const base = name.replace(/\.[^.\\/]+$/, '').replace(/[\\/]/g, ' ');
  const words = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_.+]+/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w &&
        !/^\d+$/.test(w) &&
        !/^(img|dsc|dscn|pxl|mvimi|vid|mov|p)\d+$/i.test(w) &&
        !/^(img|dsc|dscn|pxl|mvimi|vid|image|photo|picture|screenshot|screen|copy|final|edit|edited)$/i.test(w) &&
        !/^[a-f0-9]{8,}$/i.test(w),
    );
  if (!words.length) return '';
  const text = words.join(' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Layers worth asking about: a picture or a video, with nothing said about it yet. */
export const needsDescription = (n: SceneNode): boolean => (n.type === 'image' || n.type === 'video') && !n.ariaLabel && !n.decorative;

/** Put layers that were just added on the list (unless the person switched the asking off). `hint` is the box's placeholder. */
export function askAboutPictures(projectId: string, items: { node: SceneNode; hint?: string }[]): void {
  if (!prefs().askPictureDescription) return;
  const add = items.filter((i) => needsDescription(i.node));
  if (!add.length) return;
  const next: Waiting = { ...load(projectId) };
  for (const { node, hint } of add) next[node.id] = (hint ?? hintFromFileName(node.name)).slice(0, 120);
  // the oldest go first when it grows past the limit
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete next[k];
  save(projectId, next);
}

/** Take a layer off the list: it was answered, marked decorative or skipped. */
export function doneAsking(projectId: string, ids: string[]): void {
  const w = load(projectId);
  if (!ids.some((id) => id in w)) return;
  const next = { ...w };
  for (const id of ids) delete next[id];
  save(projectId, next);
}

/** The hint for a layer that is waiting, or undefined when it is not. */
export function waitingHint(projectId: string, id: string): string | undefined {
  return load(projectId)[id];
}

/** Re-renders when the list changes. */
export function useWaiting(projectId: string): Waiting {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => load(projectId),
  );
}

/** For tests: forget what is held in memory (the browser's storage is left to the test). */
export function resetAltPrompt(): void {
  cache.clear();
}
