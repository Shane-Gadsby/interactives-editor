import { useSyncExternalStore } from 'react';
import { announce } from './announce';
import { tourSelector, tourTarget, type TourId } from './tour-targets';

/**
 * Show me: a tutorial step points at the control it talks about. This is only the state (what is highlighted, or where to look when
 * it is not on screen); help/TourOverlay.tsx draws it. It never blocks anything. It goes away on Esc, on the person's next click or
 * key press, when the tutorial is closed, or by itself after a while.
 */
export interface Tour {
  key: number;
  /** The control, when it is on screen. */
  el: HTMLElement | null;
  /** What the label says: the control's name. */
  label: string;
  /** Where to find the control, said when it is not on screen. */
  where: string | null;
}

export const TOUR_SHOWN_MS = 15000;

let current: Tour | null = null;
let key = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let detach = () => {};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** On screen: it is in the page and takes up room (a folded group's buttons are not drawn at all, a closed panel's neither). */
export function isShown(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

/** The first of these controls that is on screen, or null. */
export function findTarget(ids: TourId[], root: ParentNode = document): { id: TourId; el: HTMLElement } | null {
  for (const id of ids) {
    const el = [...root.querySelectorAll(tourSelector(id))].find(isShown);
    if (el) return { id, el };
  }
  return null;
}

export function hideTour(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  detach();
  detach = () => {};
  if (current) {
    current = null;
    emit();
  }
}

export const tourActive = (): boolean => current !== null;
export const currentTour = (): Tour | null => current;

/** Highlight the first of these controls that is on screen, or say where the first one is. Ids is what a step's `show` names. */
export function showMe(ids: TourId[]): void {
  hideTour();
  if (!ids.length) return;
  const hit = findTarget(ids);
  const first = tourTarget(ids[0]);
  if (hit) {
    //keep it in view (a long Properties panel, a scrolled list) without a smooth scroll nobody asked for
    hit.el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    current = { key: ++key, el: hit.el, label: tourTarget(hit.id).label, where: null };
    announce(`Highlighted: ${current.label}`);
  } else {
    current = { key: ++key, el: null, label: first.label, where: first.where };
    announce(`${first.label}. ${first.where}`);
  }
  //the next thing the person does puts it away (the click itself still goes through: nothing here stops an event)
  const off = (e: Event) => {
    if (e instanceof KeyboardEvent && ['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
    hideTour();
  };
  window.addEventListener('pointerdown', off, true);
  window.addEventListener('keydown', off, true);
  detach = () => {
    window.removeEventListener('pointerdown', off, true);
    window.removeEventListener('keydown', off, true);
  };
  timer = setTimeout(hideTour, TOUR_SHOWN_MS);
  emit();
}

export function useTour(): Tour | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => current,
    () => null,
  );
}
