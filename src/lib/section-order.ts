import { createContext, useContext, useLayoutEffect, type KeyboardEvent, type PointerEvent as ReactPointer, type RefObject } from 'react';
import { subscribePrefs } from './prefs';
import { announce } from './announce';
import { arrange, getOrder, mergeOrder, moved, setOrder } from './reorder';
import { armReorderDrag } from './reorder-drag';

/**
 * Inspector sections in the order a person set (lib/reorder.ts keeps the list). The sections are written as plain siblings all
 * over the panels, so the order is done the way the properties search already does it: a CSS `order` on the siblings, worked out
 * from the page after React has drawn it. Sections move among the places the sections hold, and everything else between them
 * (a note, a lone field) stays exactly where it was. Nothing changes for someone who has not moved a section.
 */

/** Which panel a Section belongs to (the layer kind, the page, ...). Without one a section can't be moved. */
export const SectionOrderScope = createContext<string | null>(null);

interface Watch {
  scope: string;
  uses: number;
  obs: MutationObserver;
}
const watched = new Map<HTMLElement, Watch>();
let queued = false;
const dirty = new Set<HTMLElement>();
let unsub: (() => void) | null = null;

const sectionsOf = (parent: HTMLElement): HTMLElement[] => [...parent.children].filter((c): c is HTMLElement => c instanceof HTMLElement && c.classList.contains('section') && !!c.dataset.reorderKey);

/** The sections of one group with their keys, a repeated title getting a number so every key is its own. */
export function groupKeys(parent: HTMLElement): { els: HTMLElement[]; keys: string[] } {
  const els = sectionsOf(parent);
  const seen = new Map<string, number>();
  const keys = els.map((e) => {
    const k = e.dataset.reorderKey!;
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    return n > 1 ? `${k}#${n}` : k;
  });
  return { els, keys };
}

function apply(parent: HTMLElement, scope: string): void {
  if (!parent.isConnected) return;
  // the properties search sorts by how well each section matched, so it has the say while it is open
  if (parent.closest('.ps-on')) return;
  const kids = [...parent.children] as HTMLElement[];
  const { els, keys } = groupKeys(parent);
  const arranged = arrange(keys, getOrder('sectionOrder', scope));
  const plain = arranged.every((k, i) => k === keys[i]);
  const wasSet = parent.classList.contains('reordered');
  if (plain) {
    if (wasSet) {
      kids.forEach((k) => (k.style.order = ''));
      parent.classList.remove('reordered');
    }
    return;
  }
  // every child gets the place it has in the page, and the sections take the places of the sections in the new order
  kids.forEach((k, i) => (k.style.order = String(i)));
  els.forEach((e, j) => {
    const at = keys.indexOf(arranged[j]);
    els[at].style.order = String(kids.indexOf(e));
  });
  parent.classList.add('reordered');
}

function flush() {
  queued = false;
  for (const p of dirty) {
    const w = watched.get(p);
    if (w) apply(p, w.scope);
  }
  dirty.clear();
}
function schedule(parent: HTMLElement) {
  dirty.add(parent);
  if (queued) return;
  queued = true;
  queueMicrotask(flush);
}

function watch(parent: HTMLElement, scope: string): () => void {
  let w = watched.get(parent);
  if (!w) {
    const obs = new MutationObserver(() => schedule(parent));
    obs.observe(parent, { childList: true });
    w = { scope, uses: 0, obs };
    watched.set(parent, w);
  }
  w.scope = scope;
  w.uses++;
  if (!unsub) unsub = subscribePrefs(() => watched.forEach((_, p) => schedule(p)));
  schedule(parent);
  return () => {
    const cur = watched.get(parent);
    if (!cur) return;
    if (--cur.uses > 0) return schedule(parent);
    cur.obs.disconnect();
    watched.delete(parent);
    if (!watched.size) (unsub?.(), (unsub = null));
  };
}

/** Called by a Section for its own element: it joins its group so the order reaches it, and says whether it can be moved. */
export function useSectionOrder(ref: RefObject<HTMLElement | null>, key: string): string | null {
  const scope = useContext(SectionOrderScope);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!scope || !parent) return;
    return watch(parent, scope);
  }, [ref, scope]);
  // a section whose key changes (a count in its title) sits in a different place in the list
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (scope && parent) schedule(parent);
  }, [ref, scope, key]);
  return scope;
}

const titleOf = (el: HTMLElement) => el.dataset.sectionTitle || el.dataset.reorderKey || 'Section';

/** The sections of this one's group in the order they show now. */
function shownGroup(el: HTMLElement) {
  const parent = el.parentElement;
  if (!parent) return null;
  const { els, keys } = groupKeys(parent);
  const scope = watched.get(parent)?.scope;
  if (!scope) return null;
  const arranged = arrange(keys, getOrder('sectionOrder', scope));
  return { scope, arranged, els, keys, mine: keys[els.indexOf(el)], title: titleOf(el) };
}

function save(scope: string, shown: string[]) {
  setOrder('sectionOrder', scope, mergeOrder(getOrder('sectionOrder', scope), shown));
}

/** Move a section up (-1) or down (+1) among its group. Returns where it went (1 based), or 0 when it can't go that way. */
export function moveSection(el: HTMLElement, by: number): number {
  const g = shownGroup(el);
  if (!g) return 0;
  const from = g.arranged.indexOf(g.mine);
  const to = from + by;
  if (to < 0 || to >= g.arranged.length) {
    announce(`${g.title} is already ${by < 0 ? 'first' : 'last'}`);
    return 0;
  }
  save(g.scope, moved(g.arranged, from, to));
  announce(`${g.title} moved to position ${to + 1} of ${g.arranged.length}`);
  return to + 1;
}

/** Alt+Up and Alt+Down on a section's header. */
export function sectionKeyMove(e: KeyboardEvent, el: HTMLElement | null): void {
  if (!el || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  e.stopPropagation();
  moveSection(el, e.key === 'ArrowUp' ? -1 : 1);
}

/** Press on a section's header: if it turns into a drag, the section is dropped between its neighbours. */
export function sectionDragStart(e: ReactPointer, el: HTMLElement | null): void {
  if (!el) return;
  const g = shownGroup(el);
  if (!g || g.arranged.length < 2) return;
  const parent = el.parentElement!;
  armReorderDrag({
    event: e,
    el,
    label: g.title,
    // top to bottom as they are drawn now
    items: () => [...sectionsOf(parent)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top),
    layout: 'column',
    onMove: (to) => {
      const now = shownGroup(el);
      if (!now) return;
      const from = now.arranged.indexOf(now.mine);
      save(now.scope, moved(now.arranged, from, to));
      announce(`${now.title} moved to position ${to + 1} of ${now.arranged.length}`);
      el.classList.add('reorder-landed');
      setTimeout(() => el.classList.remove('reorder-landed'), 1200);
    },
  });
}

/** Where this section sits among its group (for the menu: can it go up, can it go down). */
export function sectionPlace(el: HTMLElement | null): { index: number; count: number; scope: string } | null {
  const g = el ? shownGroup(el) : null;
  return g ? { index: g.arranged.indexOf(g.mine), count: g.arranged.length, scope: g.scope } : null;
}
