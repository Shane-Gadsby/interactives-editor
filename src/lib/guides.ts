import type { Artboard, Project } from 'interactives-player';
import { store } from '../store/store';
import type { MenuItem } from '../components/ContextMenu';

/**
 * Ruler guides. A guide belongs to the page it was dropped on (`Artboard.guides`, artboard pixels from that page's own top left,
 * so it moves with the page) but it is one endless line across the canvas: it is drawn through every page it happens to cross and
 * everything in between, and layers on those pages snap to it. Editor only: the player ignores them, and the editor's exports leave them out.
 * Old files had a second kind (`Project.guides`, on every page); the player's `migrateProjectGuides` moves those onto the start page.
 */

export type Axis = 'x' | 'y';
export type Guides = { x: number[]; y: number[] };

export interface GuideRef {
  axis: Axis;
  /** Its place in its page's list. */
  index: number;
  /** Artboard pixels. */
  at: number;
}

/** The guides of one page, each with where it lives so it can be moved or removed. */
export function guidesOf(ab: Pick<Artboard, 'guides'>): GuideRef[] {
  const out: GuideRef[] = [];
  for (const axis of ['x', 'y'] as const) (ab.guides?.[axis] ?? []).forEach((at, index) => out.push({ axis, index, at }));
  return out;
}

/** How many guides there are, in the whole project. */
export const guideCount = (project: Pick<Project, 'artboards'>): number => project.artboards.reduce((n, a) => n + (a.guides?.x.length ?? 0) + (a.guides?.y.length ?? 0), 0);

/**
 * Every guide line that crosses `ab`, whichever page it belongs to, in `ab`'s own pixels (a guide on another page sits at that
 * page's canvas position, so it lands wherever the page is). A vertical line crosses the page when it falls between its left and
 * right edges, a horizontal one between its top and bottom. Pages left off the canvas (library copies) have no guides on show.
 */
export function guidesAcross(project: Pick<Project, 'artboards'>, ab: Pick<Artboard, 'id' | 'canvasX' | 'canvasY' | 'width' | 'height'>): Guides {
  const out: Guides = { x: [], y: [] };
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

export type ClearWhich = 'page' | 'all';

export function clearGuides(d: Project, abId: string, which: ClearWhich): void {
  if (which === 'all') for (const a of d.artboards) delete a.guides;
  else {
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
  return [
    { label: p.guidesLocked ? 'Unlock guides' : 'Lock guides', title: p.guidesLocked ? 'Let guides be moved, removed and added again' : 'Stop guides being moved, removed or added by accident (they still snap)', onClick: () => setGuidesLocked(!p.guidesLocked) },
    { separator: true },
    { label: 'Clear this page’s guides', title: 'The guides you dropped on this page. Their lines stop crossing the other pages too', disabled: !mine || !!p.guidesLocked, onClick: () => clearGuidesCommand('page', abId) },
    { label: 'Clear all guides', danger: true, disabled: !guideCount(p) || !!p.guidesLocked, title: 'Every guide in the project, from every page. Undo (Ctrl+Z) brings them back', onClick: () => clearGuidesCommand('all', abId) },
  ];
}
