import { useSyncExternalStore } from 'react';
import { isContainer, type Artboard, type InstanceNode, type Project, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { makeInstance } from './libraries';
import { artboardEntries } from './artboard-groups';
import type { MenuItem } from '../components/ContextMenu';

/**
 * Components: a page placed inside another page. The document calls it an instance layer, the Inspector's Use in menu
 * says "Component in…", and the help is titled "Instances (components)"; everything an author reads now says component.
 * These are the target-side ways in (right-click in a page, drag a page from the Layers list onto another, the picker).
 * Each one writes the same ordinary instance layer that Use in does.
 */

/** What a page dragged out of the Layers list carries, read by the canvas on drop. */
export const PAGE_DRAG = 'application/x-interactives-page';

/** The page being dragged out of the Layers list right now (the drag only exposes its type until the drop). */
let draggedPage: string | null = null;
export const setDraggedPage = (id: string | null): void => void (draggedPage = id);
export const getDraggedPage = (): string | null => draggedPage;

function walk(list: SceneNode[], fn: (n: SceneNode) => void): void {
  for (const n of list) {
    fn(n);
    if (isContainer(n)) walk(n.children, fn);
  }
}

/** Every page that one page places (directly, or inside what it places). */
export function placedInside(project: Pick<Project, 'artboards'>, artboardId: string): Set<string> {
  const seen = new Set<string>();
  const visit = (id: string) => {
    const ab = project.artboards.find((a) => a.id === id);
    if (!ab) return;
    walk(ab.children, (n) => {
      if (n.type !== 'instance') return;
      const to = (n as InstanceNode).artboardId;
      if (to && !seen.has(to)) {
        seen.add(to);
        visit(to);
      }
    });
  };
  visit(artboardId);
  return seen;
}

/** Putting the component in the host would make a page contain itself (the player stops it, but it is never what anyone meant). */
export const wouldLoop = (project: Pick<Project, 'artboards'>, hostId: string, componentId: string): boolean => hostId === componentId || placedInside(project, componentId).has(hostId);

export interface ComponentChoice {
  id: string;
  name: string;
  /** "800 × 600" */
  size: string;
  group?: string;
  /** Where it comes from, when that is worth saying. */
  note?: string;
}

const describe = (ab: Artboard, group?: string): ComponentChoice => ({
  id: ab.id,
  name: ab.name,
  size: `${Math.round(ab.width)} × ${Math.round(ab.height)}`,
  group,
  note: ab.library ? (ab.library.brand ? 'brand kit' : 'library') : ab.isMaster ? 'page master' : undefined,
});

/** The pages that can be placed in the host, in the order of the Layers list. */
export function componentChoices(project: Project, hostId: string): ComponentChoice[] {
  const out: ComponentChoice[] = [];
  const add = (ab: Artboard, group?: string) => {
    if (!wouldLoop(project, hostId, ab.id)) out.push(describe(ab, group));
  };
  for (const e of artboardEntries(project)) {
    if (e.kind === 'board') add(e.ab);
    else e.boards.forEach((b) => add(b, e.group.name));
  }
  return out;
}

/** The pages a component can be placed in (a library copy is read-only until detached, so not those). */
export function hostChoices(project: Project, componentId: string): ComponentChoice[] {
  const out: ComponentChoice[] = [];
  for (const e of artboardEntries(project)) {
    const boards = e.kind === 'board' ? [e.ab] : e.boards;
    for (const ab of boards) if (!ab.library && !wouldLoop(project, ab.id, componentId)) out.push(describe(ab, e.kind === 'group' ? e.group.name : undefined));
  }
  return out;
}

/**
 * Place a page in another as a component: at a point of the host (page pixels, centred on it) or in the middle. One undo step,
 * the new layer is selected. Answers the new layer's id, or null with a note on screen saying why not.
 */
export function insertComponent(componentId: string, hostId: string, at?: { x: number; y: number }): string | null {
  const s = store();
  const p = s.get().project;
  const host = p.artboards.find((a) => a.id === hostId);
  const comp = p.artboards.find((a) => a.id === componentId);
  if (!host || !comp) return null;
  if (host.library) {
    s.toast(`“${host.name}” comes from a library, so it can't be changed until it's detached.`, 'error');
    return null;
  }
  if (wouldLoop(p, hostId, componentId)) {
    s.toast(comp.id === host.id ? 'A page can’t be placed inside itself.' : `“${comp.name}” already has “${host.name}” inside it, so it can’t go the other way round too.`, 'error');
    return null;
  }
  const node = makeInstance(p, hostId, componentId, at);
  if (!node) return null;
  // bigger than the page it goes on: shrunk to fit, keeping its proportions
  const fit = Math.min(1, host.width / node.width, host.height / node.height);
  if (fit < 1) {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    node.width = Math.round(node.width * fit * 100) / 100;
    node.height = Math.round(node.height * fit * 100) / 100;
    node.x = Math.round(cx - node.width / 2);
    node.y = Math.round(cy - node.height / 2);
  }
  // stays inside the page it was dropped on
  node.x = Math.max(0, Math.min(Math.round(host.width - node.width), node.x));
  node.y = Math.max(0, Math.min(Math.round(host.height - node.height), node.y));
  const mark = s.historyMark();
  s.set({ activeArtboardId: hostId, artboardSelected: false });
  s.addNodes([node], { artboardId: hostId });
  s.toastUndo(`Placed the component “${comp.name}” in “${host.name}”.`, mark);
  return node.id;
}

/** The right-click entry "Place in…" for a page: a submenu of the pages it can go in. Null when there is nowhere to put it. */
export function placeInMenu(componentId: string): MenuItem | null {
  const hosts = hostChoices(store().get().project, componentId);
  if (!hosts.length) return null;
  return {
    label: 'Place in…',
    title: 'Place this page inside another page, as a component',
    items: hosts.map((h) => ({ label: h.name, title: h.group ? `In the group ${h.group}` : undefined, onClick: () => void insertComponent(componentId, h.id) })),
  };
}

// ---------------------------------------------------------------- the picker

export interface PickerAsk {
  hostId: string;
  /** Where in the page (page pixels), or the middle. */
  at?: { x: number; y: number };
}

let ask: PickerAsk | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/**
 * Open the "Insert component" picker: a searchable list of the pages that can go in the host (default: the open page), at a
 * point or in the middle. Called by the right-click menu and the command palette; the keymap wires a key to it.
 * False when there is nothing to insert into.
 */
export function openInsertComponentPicker(opts: Partial<PickerAsk> = {}): boolean {
  const st = store().get();
  const hostId = opts.hostId ?? st.activeArtboardId;
  if (!st.project.artboards.some((a) => a.id === hostId)) return false;
  ask = { hostId, at: opts.at };
  emit();
  return true;
}

export function closeInsertComponentPicker(): void {
  if (!ask) return;
  ask = null;
  emit();
}

export const insertPickerIsOpen = (): boolean => !!ask;

export function useInsertComponentAsk(): PickerAsk | null {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    () => ask,
  );
}

/** Words typed into the picker against what a choice is called (every word has to be somewhere in it). */
export function filterChoices(list: ComponentChoice[], q: string): ComponentChoice[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((c) => {
    const hay = `${c.name} ${c.group ?? ''} ${c.note ?? ''} ${c.size}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
