import { useSyncExternalStore } from 'react';
import type { Artboard, Project } from 'interactives-player';
import { store } from '../store/store';
import type { MenuItem } from '../components/ContextMenu';

/**
 * Ruler guides come in two kinds. A **page** guide belongs to one artboard (`Artboard.guides`). A **project** guide
 * (`Project.guides`) belongs to all of them: it is in artboard pixels from each artboard's own top left, so it lines up on
 * every page of the same size, and it shows on each page it falls inside (a guide at 900 is no use on a page 600 wide).
 * Editor only: the player ignores both, and the editor's exports leave them out.
 */

export type GuideScope = 'project' | 'page';
export type Axis = 'x' | 'y';
export type Guides = { x: number[]; y: number[] };

export interface GuideRef {
  scope: GuideScope;
  axis: Axis;
  /** Its place in the list it lives in (the project's, or the page's). */
  index: number;
  /** Artboard pixels. */
  at: number;
}

/** How far past a page's edge a guide is drawn, in screen pixels. */
export const GUIDE_REACH = 32;

const size = (ab: Pick<Artboard, 'width' | 'height'>, axis: Axis) => (axis === 'x' ? ab.width : ab.height);

/** The project guides this page shows: the ones that fall on it. */
export function projectGuidesOn(project: Pick<Project, 'guides'>, ab: Pick<Artboard, 'width' | 'height'>): Guides {
  const keep = (list: number[] | undefined, axis: Axis) => (list ?? []).filter((v) => v >= 0 && v <= size(ab, axis));
  return { x: keep(project.guides?.x, 'x'), y: keep(project.guides?.y, 'y') };
}

/** Every guide a page shows, project ones first, each with where it lives so it can be moved or removed. */
export function guidesOn(project: Pick<Project, 'guides'>, ab: Pick<Artboard, 'width' | 'height' | 'guides'>): GuideRef[] {
  const out: GuideRef[] = [];
  for (const axis of ['x', 'y'] as const) {
    (project.guides?.[axis] ?? []).forEach((at, index) => {
      if (at >= 0 && at <= size(ab, axis)) out.push({ scope: 'project', axis, index, at });
    });
  }
  for (const axis of ['x', 'y'] as const) (ab.guides?.[axis] ?? []).forEach((at, index) => out.push({ scope: 'page', axis, index, at }));
  return out;
}

export const guideCount = (project: Pick<Project, 'guides' | 'artboards'>) => ({
  project: (project.guides?.x.length ?? 0) + (project.guides?.y.length ?? 0),
  pages: project.artboards.reduce((n, a) => n + (a.guides?.x.length ?? 0) + (a.guides?.y.length ?? 0), 0),
});

// ---------------------------------------------------------------- the document edits (on a draft)

const listOf = (d: Project, abId: string, scope: GuideScope): Guides | null => {
  if (scope === 'project') return (d.guides ??= { x: [], y: [] });
  const ab = d.artboards.find((a) => a.id === abId);
  return ab ? (ab.guides ??= { x: [], y: [] }) : null;
};

/** Tidy up after an edit: empty lists go, so a project that never used guides carries none. */
function tidy(d: Project, abId: string): void {
  if (d.guides && !d.guides.x.length && !d.guides.y.length) delete d.guides;
  const ab = d.artboards.find((a) => a.id === abId);
  if (ab?.guides && !ab.guides.x.length && !ab.guides.y.length) delete ab.guides;
}

export function addGuide(d: Project, abId: string, scope: GuideScope, axis: Axis, at: number): void {
  const list = listOf(d, abId, scope);
  if (list && !list[axis].includes(at)) list[axis].push(at);
}

export function moveGuide(d: Project, abId: string, ref: Pick<GuideRef, 'scope' | 'axis' | 'index'>, at: number): void {
  const list = listOf(d, abId, ref.scope);
  if (list && ref.index < list[ref.axis].length) list[ref.axis][ref.index] = at;
}

export function removeGuide(d: Project, abId: string, ref: Pick<GuideRef, 'scope' | 'axis' | 'index'>): void {
  const list = listOf(d, abId, ref.scope);
  if (list) list[ref.axis].splice(ref.index, 1);
  tidy(d, abId);
}

/** Move a guide between the page and the project (the same place on the page it is on). A twin already there is not doubled. */
export function convertGuide(d: Project, abId: string, ref: Pick<GuideRef, 'scope' | 'axis' | 'index' | 'at'>, to: GuideScope): void {
  if (ref.scope === to) return;
  removeGuide(d, abId, ref);
  addGuide(d, abId, to, ref.axis, ref.at);
  tidy(d, abId);
}

/** Make every guide of this page a project guide. Answers how many moved. */
export function shareAllPageGuides(d: Project, abId: string): number {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab?.guides) return 0;
  let n = 0;
  for (const axis of ['x', 'y'] as const) {
    for (const at of ab.guides[axis]) {
      addGuide(d, abId, 'project', axis, at);
      n++;
    }
  }
  delete ab.guides;
  return n;
}

export type ClearWhich = 'page' | 'project' | 'all';

export function clearGuides(d: Project, abId: string, which: ClearWhich): void {
  if (which !== 'page') delete d.guides;
  if (which === 'page') {
    const ab = d.artboards.find((a) => a.id === abId);
    if (ab) delete ab.guides;
  }
  if (which === 'all') for (const a of d.artboards) delete a.guides;
}

// ---------------------------------------------------------------- what new guides are

const KEY = 'ix-guide-scope';
const subs = new Set<() => void>();
let scope: GuideScope | null = null;

/** Which kind a guide dragged out of a ruler is. Every page unless this browser was told otherwise (it is a habit, not part of the project). */
export function getGuideScope(): GuideScope {
  if (scope) return scope;
  try {
    //this page only unless you chose every page: a guide belongs to the page you drop it on
    scope = localStorage.getItem(KEY) === 'project' ? 'project' : 'page';
  } catch {
    scope = 'page';
  }
  return scope;
}

export function setGuideScope(s: GuideScope): void {
  scope = s;
  try {
    localStorage.setItem(KEY, s);
  } catch {
    // storage unavailable: it lasts until the page closes
  }
  subs.forEach((f) => f());
}

export function useGuideScope(): GuideScope {
  return useSyncExternalStore(
    (f) => (subs.add(f), () => void subs.delete(f)),
    getGuideScope,
  );
}

// ---------------------------------------------------------------- commands (shared by the ruler menus and the command palette)

export function setGuidesLocked(locked: boolean): void {
  store().update((d) => void (locked ? (d.guidesLocked = true) : delete d.guidesLocked));
}

export function clearGuidesCommand(which: ClearWhich, abId: string): void {
  const s = store();
  const mark = s.historyMark();
  const before = guideCount(s.get().project);
  s.update((d) => clearGuides(d, abId, which));
  const after = guideCount(s.get().project);
  const gone = before.project + before.pages - (after.project + after.pages);
  s.toastUndo(gone ? `Cleared ${gone} ${gone === 1 ? 'guide' : 'guides'}.` : 'There were no guides to clear.', mark);
}

export function shareGuidesCommand(abId: string): void {
  const s = store();
  const mark = s.historyMark();
  let n = 0;
  s.update((d) => void (n = shareAllPageGuides(d, abId)));
  s.toastUndo(n ? `${n} ${n === 1 ? 'guide' : 'guides'} now show on every page.` : 'This page has no guides of its own.', mark);
}

const tick = (on: boolean, label: string) => `${on ? '✓ ' : '   '}${label}`;

/** The guides menu: the ruler corner opens it, and a guide's right-click menu starts with its own items then carries on with these. */
export function guidesMenuItems(abId: string): MenuItem[] {
  const p = store().get().project;
  const n = guideCount(p);
  const ab = p.artboards.find((a) => a.id === abId);
  const mine = ab?.guides ? ab.guides.x.length + ab.guides.y.length : 0;
  const now = getGuideScope();
  return [
    { heading: 'New guides go on' },
    { label: tick(now === 'project', 'Every page'), title: 'A guide you drag out of a ruler shows on every page it fits (project guides, purple)', onClick: () => setGuideScope('project') },
    { label: tick(now === 'page', 'This page only'), title: 'A guide you drag out of a ruler stays on the page it was made on (page guides, pink). Hold Alt while you drag to get the other kind for that one guide', onClick: () => setGuideScope('page') },
    { separator: true },
    { label: 'Show this page’s guides on every page', title: 'Turn the guides that belong only to this page into project guides', disabled: !mine || !!p.guidesLocked, onClick: () => shareGuidesCommand(abId) },
    { label: p.guidesLocked ? 'Unlock guides' : 'Lock guides', title: p.guidesLocked ? 'Let guides be moved, removed and added again' : 'Stop guides being moved, removed or added by accident (they still snap)', onClick: () => setGuidesLocked(!p.guidesLocked) },
    { separator: true },
    { label: 'Clear this page’s guides', disabled: !mine || !!p.guidesLocked, onClick: () => clearGuidesCommand('page', abId) },
    { label: 'Clear the every-page guides', disabled: !n.project || !!p.guidesLocked, onClick: () => clearGuidesCommand('project', abId) },
    { label: 'Clear all guides', danger: true, disabled: !(n.project + n.pages) || !!p.guidesLocked, title: 'Every guide in the project, on every page. Undo (Ctrl+Z) brings them back', onClick: () => clearGuidesCommand('all', abId) },
  ];
}
