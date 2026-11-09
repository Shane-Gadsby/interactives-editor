import type { Artboard, Project } from 'interactives-player';
import { store } from '../store/store';
import type { MenuItem } from '../components/ContextMenu';

/**
 * Ruler guides, two kinds, both one endless line across the canvas (drawn through every page they cross and everything in between,
 * and layers on those pages snap to them). A universal guide is fixed on the canvas (`Project.canvasGuides`, canvas coordinates), so
 * moving a page leaves it where it is. An attached guide belongs to the page it was dropped on (`Artboard.guides`, artboard pixels
 * from that page's own top left) and moves with it. Which kind a new guide is comes from the `attachGuides` preference (off: universal),
 * with Alt while dragging giving the other one. Editor only: the player ignores them, and the editor's exports leave them out.
 * Old files had a third kind (`Project.guides`, on every page); the player's `migrateProjectGuides` moves those onto the start page.
 */

export type Axis = 'x' | 'y';
export type Guides = { x: number[]; y: number[] };

export type GuideKind = 'page' | 'universal';

export interface GuideRef {
  axis: Axis;
  /** Its place in its list (the page's, or the project's for a universal one). */
  index: number;
  /** Artboard pixels for an attached guide, canvas pixels for a universal one. */
  at: number;
  kind: GuideKind;
}

/** The guides of one page, each with where it lives so it can be moved or removed. */
export function guidesOf(ab: Pick<Artboard, 'guides'>): GuideRef[] {
  const out: GuideRef[] = [];
  for (const axis of ['x', 'y'] as const) (ab.guides?.[axis] ?? []).forEach((at, index) => out.push({ axis, index, at, kind: 'page' }));
  return out;
}

/** The universal guides (canvas pixels), each with where it lives so it can be moved or removed. */
export function universalGuidesOf(project: Pick<Project, 'canvasGuides'>): GuideRef[] {
  const out: GuideRef[] = [];
  for (const axis of ['x', 'y'] as const) (project.canvasGuides?.[axis] ?? []).forEach((at, index) => out.push({ axis, index, at, kind: 'universal' }));
  return out;
}

/** How many universal guides there are. */
export const universalCount = (project: Pick<Project, 'canvasGuides'>): number => (project.canvasGuides?.x.length ?? 0) + (project.canvasGuides?.y.length ?? 0);

/** How many guides there are, in the whole project: attached to pages and universal. */
export const guideCount = (project: Pick<Project, 'artboards' | 'canvasGuides'>): number => project.artboards.reduce((n, a) => n + (a.guides?.x.length ?? 0) + (a.guides?.y.length ?? 0), 0) + universalCount(project);

/** The page under a canvas point, if any (library copies left off the canvas don't count). */
export function pageAtCanvas(project: Pick<Project, 'artboards'>, x: number, y: number): Artboard | undefined {
  return project.artboards.find((a) => !a.canvasHidden && x >= a.canvasX && x <= a.canvasX + a.width && y >= a.canvasY && y <= a.canvasY + a.height);
}

/**
 * The page a universal guide would attach to: the open one when the line crosses it, else the first page it crosses, else none.
 */
export function pageForUniversal(project: Pick<Project, 'artboards'>, ref: Pick<GuideRef, 'axis' | 'at'>, activeId: string | null): Artboard | undefined {
  const crosses = (a: Artboard) => !a.canvasHidden && (ref.axis === 'x' ? ref.at >= a.canvasX && ref.at <= a.canvasX + a.width : ref.at >= a.canvasY && ref.at <= a.canvasY + a.height);
  const open = project.artboards.find((a) => a.id === activeId);
  return open && crosses(open) ? open : project.artboards.find(crosses);
}

/**
 * Every guide line that crosses `ab`, of both kinds and whichever page it is attached to, in `ab`'s own pixels (a guide on another
 * page sits at that page's canvas position, so it lands wherever the page is; a universal one is at its canvas position). A vertical
 * line crosses the page when it falls between its left and right edges, a horizontal one between its top and bottom. Pages left off
 * the canvas (library copies) have no attached guides on show.
 */
export function guidesAcross(project: Pick<Project, 'artboards' | 'canvasGuides'>, ab: Pick<Artboard, 'id' | 'canvasX' | 'canvasY' | 'width' | 'height'>): Guides {
  const out: Guides = { x: [], y: [] };
  for (const at of project.canvasGuides?.x ?? []) {
    const here = at - ab.canvasX;
    if (here >= 0 && here <= ab.width && !out.x.includes(here)) out.x.push(here);
  }
  for (const at of project.canvasGuides?.y ?? []) {
    const here = at - ab.canvasY;
    if (here >= 0 && here <= ab.height && !out.y.includes(here)) out.y.push(here);
  }
  for (const from of project.artboards) {
    if (from.canvasHidden || !from.guides) continue;
    for (const at of from.guides.x) {
      const here = from.canvasX + at - ab.canvasX;
      if (here >= 0 && here <= ab.width && !out.x.includes(here)) out.x.push(here);
    }
    for (const at of from.guides.y) {
      const here = from.canvasY + at - ab.canvasY;
      if (here >= 0 && here <= ab.height && !out.y.includes(here)) out.y.push(here);
    }
  }
  return out;
}

// ---------------------------------------------------------------- the document edits (on a draft)

/** Tidy up after an edit: an empty list goes, so a page that never used guides carries none. */
function tidy(ab: Artboard | undefined): void {
  if (ab?.guides && !ab.guides.x.length && !ab.guides.y.length) delete ab.guides;
}

export function addGuide(d: Project, abId: string, axis: Axis, at: number): void {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return;
  const list = (ab.guides ??= { x: [], y: [] });
  if (!list[axis].includes(at)) list[axis].push(at);
}

export function moveGuide(d: Project, abId: string, ref: Pick<GuideRef, 'axis' | 'index'>, at: number): void {
  const list = d.artboards.find((a) => a.id === abId)?.guides;
  if (list && ref.index < list[ref.axis].length) list[ref.axis][ref.index] = at;
}

export function removeGuide(d: Project, abId: string, ref: Pick<GuideRef, 'axis' | 'index'>): void {
  const ab = d.artboards.find((a) => a.id === abId);
  ab?.guides?.[ref.axis].splice(ref.index, 1);
  tidy(ab);
}

/** Universal guides. */
export function addUniversalGuide(d: Project, axis: Axis, at: number): void {
  const list = (d.canvasGuides ??= { x: [], y: [] });
  if (!list[axis].includes(at)) list[axis].push(at);
}

export function moveUniversalGuide(d: Project, ref: Pick<GuideRef, 'axis' | 'index'>, at: number): void {
  const list = d.canvasGuides;
  if (list && ref.index < list[ref.axis].length) list[ref.axis][ref.index] = at;
}

export function removeUniversalGuide(d: Project, ref: Pick<GuideRef, 'axis' | 'index'>): void {
  d.canvasGuides?.[ref.axis].splice(ref.index, 1);
  tidyProject(d);
}

function tidyProject(d: Project): void {
  if (d.canvasGuides && !d.canvasGuides.x.length && !d.canvasGuides.y.length) delete d.canvasGuides;
}

/** An attached guide becomes universal: same line on the canvas, no longer tied to its page. */
export function makeUniversal(d: Project, abId: string, ref: Pick<GuideRef, 'axis' | 'index'>): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const at = ab?.guides?.[ref.axis][ref.index];
  if (!ab || at === undefined) return;
  removeGuide(d, abId, ref);
  addUniversalGuide(d, ref.axis, (ref.axis === 'x' ? ab.canvasX : ab.canvasY) + at);
}

/** A universal guide becomes the page's: same line on the canvas, now moving with that page. */
export function attachToPage(d: Project, abId: string, ref: Pick<GuideRef, 'axis' | 'index'>): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const at = d.canvasGuides?.[ref.axis][ref.index];
  if (!ab || at === undefined) return;
  removeUniversalGuide(d, ref);
  addGuide(d, abId, ref.axis, at - (ref.axis === 'x' ? ab.canvasX : ab.canvasY));
}

export type ClearWhich = 'page' | 'universal' | 'all';

export function clearGuides(d: Project, abId: string, which: ClearWhich): void {
  if (which === 'universal') delete d.canvasGuides;
  else if (which === 'all') {
    for (const a of d.artboards) delete a.guides;
    delete d.canvasGuides;
  } else {
    const ab = d.artboards.find((a) => a.id === abId);
    if (ab) delete ab.guides;
  }
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
  const gone = before - guideCount(s.get().project);
  s.toastUndo(gone ? `Cleared ${gone} ${gone === 1 ? 'guide' : 'guides'}.` : 'There were no guides to clear.', mark);
}

/** The guides menu: the ruler corner opens it, and a guide's right-click menu starts with its own items then carries on with these. */
export function guidesMenuItems(abId: string): MenuItem[] {
  const p = store().get().project;
  const ab = p.artboards.find((a) => a.id === abId);
  const mine = ab?.guides ? ab.guides.x.length + ab.guides.y.length : 0;
  const loose = universalCount(p);
  return [
    { label: p.guidesLocked ? 'Unlock guides' : 'Lock guides', title: p.guidesLocked ? 'Let guides be moved, removed and added again' : 'Stop guides being moved, removed or added by accident (they still snap)', onClick: () => setGuidesLocked(!p.guidesLocked) },
    { separator: true },
    { label: 'Clear this page’s guides', title: 'The guides attached to this page. Their lines stop crossing the other pages too. Universal guides stay', disabled: !mine || !!p.guidesLocked, onClick: () => clearGuidesCommand('page', abId) },
    { label: 'Clear universal guides', title: 'The guides fixed on the canvas. Guides attached to pages stay', disabled: !loose || !!p.guidesLocked, onClick: () => clearGuidesCommand('universal', abId) },
    { label: 'Clear all guides', danger: true, disabled: !guideCount(p) || !!p.guidesLocked, title: 'Every guide in the project, universal and attached to any page. Undo (Ctrl+Z) brings them back', onClick: () => clearGuidesCommand('all', abId) },
  ];
}
