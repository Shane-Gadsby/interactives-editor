// Artboard groups in the editor: named sets of artboards (Project.artboardGroups, Artboard.group) that the Layers panel lists
// together and the canvas draws a frame around. Pure helpers, written against the project type so they take an immer draft
// as well as a plain project; the store's methods wrap them in one update() each.
import { setMembers, type Artboard, type ArtboardGroup, type Project } from 'interactives-player';
import { uid } from 'interactives-player';
import { orderedArtboards } from './variants-edit';
import { TIDY_GROUP_PAD, TIDY_GROUP_TOP } from './artboard-tidy';

/** What the store keeps about the artboard selection (see `pickedArtboardIds`). */
export interface ArtboardPickState {
  artboardSelected: boolean;
  activeArtboardId: string;
  artboardPicked: string[];
}

/** The artboards that are selected: none when it is layers that are, the active one alone unless several were picked. */
export const pickedArtboardIds = (st: ArtboardPickState): string[] => (!st.artboardSelected ? [] : st.artboardPicked.includes(st.activeArtboardId) ? st.artboardPicked : [st.activeArtboardId]);

/** The group an artboard is in, when it is in one that exists. */
export const groupOf = (p: Pick<Project, 'artboardGroups'>, ab: Pick<Artboard, 'group'>): ArtboardGroup | undefined => (ab.group ? p.artboardGroups?.find((g) => g.id === ab.group) : undefined);

/** The artboards in a group, in the order of the project's list. */
export const groupMembers = (p: Pick<Project, 'artboards'>, gid: string): Artboard[] => p.artboards.filter((a) => a.group === gid);

/** One line of the Layers panel's artboard list: a group with its artboards, or an artboard on its own. */
export type ArtboardEntry = { kind: 'group'; group: ArtboardGroup; boards: Artboard[] } | { kind: 'board'; ab: Artboard };

/**
 * The artboards as the Layers panel lists them: in the usual order (a responsive set's variants after their base), except that
 * a group's artboards are gathered under their group, which sits where its first artboard is. The list order in the document
 * is left alone, so nothing has to move (and nothing big is sent to the other people editing) to put a group together.
 */
export function artboardEntries(p: Pick<Project, 'artboards' | 'artboardGroups'>): ArtboardEntry[] {
  const out: ArtboardEntry[] = [];
  const done = new Set<string>();
  for (const ab of orderedArtboards(p.artboards)) {
    const g = groupOf(p, ab);
    if (!g) {
      out.push({ kind: 'board', ab });
      continue;
    }
    if (done.has(g.id)) continue;
    done.add(g.id);
    out.push({ kind: 'group', group: g, boards: orderedArtboards(p.artboards).filter((a) => a.group === g.id) });
  }
  return out;
}

/** A group's frame on the canvas, in canvas units: round the artboards on the canvas, with room above for their name labels and the group's title. */
export function groupFrame(p: Pick<Project, 'artboards'>, gid: string): { x: number; y: number; width: number; height: number } | null {
  const on = groupMembers(p, gid).filter((a) => !a.canvasHidden);
  if (!on.length) return null;
  const l = Math.min(...on.map((a) => a.canvasX));
  const t = Math.min(...on.map((a) => a.canvasY));
  const r = Math.max(...on.map((a) => a.canvasX + a.width));
  const b = Math.max(...on.map((a) => a.canvasY + a.height));
  return { x: l - TIDY_GROUP_PAD, y: t - TIDY_GROUP_TOP, width: r - l + 2 * TIDY_GROUP_PAD, height: b - t + TIDY_GROUP_TOP + TIDY_GROUP_PAD };
}

/** The artboards plus the rest of each one's responsive set: a set is moved, grouped and tidied as one. */
export function withSets(p: Pick<Project, 'artboards'>, ids: string[]): string[] {
  const out = new Set(ids);
  for (const id of ids) {
    const ab = p.artboards.find((a) => a.id === id);
    if (ab) for (const m of setMembers(p.artboards, ab)) out.add(m.id);
  }
  return p.artboards.filter((a) => out.has(a.id)).map((a) => a.id);
}

/** Take away every group that has no artboard left in it. */
export function pruneGroups(d: Project): void {
  if (!d.artboardGroups) return;
  const used = new Set(d.artboards.map((a) => a.group));
  d.artboardGroups = d.artboardGroups.filter((g) => used.has(g.id));
  if (!d.artboardGroups.length) delete d.artboardGroups;
}

/** A name not used by another group: "Group", "Group 2", ... */
export function freshGroupName(p: Pick<Project, 'artboardGroups'>, base = 'Group'): string {
  const names = new Set((p.artboardGroups ?? []).map((g) => g.name));
  if (!names.has(base)) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** Put these artboards in a new group (they leave any group they were in). Returns the group's id, or null when there was nothing to group. */
export function makeGroup(d: Project, ids: string[], name?: string): string | null {
  const members = d.artboards.filter((a) => ids.includes(a.id));
  if (!members.length) return null;
  const g: ArtboardGroup = { id: uid('abg'), name: (name ?? '').trim() || freshGroupName(d) };
  (d.artboardGroups ??= []).push(g);
  for (const a of members) a.group = g.id;
  pruneGroups(d);
  return g.id;
}

/** Break a group up: its artboards stay where they are, ungrouped. */
export function removeGroup(d: Project, gid: string): void {
  for (const a of d.artboards) if (a.group === gid) delete a.group;
  pruneGroups(d);
}

/** Take these artboards out of their groups. */
export function leaveGroups(d: Project, ids: string[]): void {
  for (const a of d.artboards) if (ids.includes(a.id)) delete a.group;
  pruneGroups(d);
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/** Line the artboards up on one edge or centre of the set (the extreme one stays where it is). Needs two or more. */
export function alignBoards(d: Project, ids: string[], mode: AlignMode): void {
  const on = d.artboards.filter((a) => ids.includes(a.id));
  if (on.length < 2) return;
  const l = Math.min(...on.map((a) => a.canvasX));
  const r = Math.max(...on.map((a) => a.canvasX + a.width));
  const t = Math.min(...on.map((a) => a.canvasY));
  const b = Math.max(...on.map((a) => a.canvasY + a.height));
  for (const a of on) {
    if (mode === 'left') a.canvasX = l;
    else if (mode === 'right') a.canvasX = r - a.width;
    else if (mode === 'center') a.canvasX = Math.round((l + r) / 2 - a.width / 2);
    else if (mode === 'top') a.canvasY = t;
    else if (mode === 'bottom') a.canvasY = b - a.height;
    else a.canvasY = Math.round((t + b) / 2 - a.height / 2);
  }
}

/** Space the artboards evenly across (or down) the span they cover now: the same gap between each. Needs three or more. */
export function distributeBoards(d: Project, ids: string[], axis: 'x' | 'y'): void {
  const on = d.artboards.filter((a) => ids.includes(a.id));
  if (on.length < 3) return;
  const pos = (a: Artboard) => (axis === 'x' ? a.canvasX : a.canvasY);
  const size = (a: Artboard) => (axis === 'x' ? a.width : a.height);
  const sorted = [...on].sort((a, b) => pos(a) - pos(b));
  const start = pos(sorted[0]);
  const end = Math.max(...sorted.map((a) => pos(a) + size(a)));
  const gap = (end - start - sorted.reduce((n, a) => n + size(a), 0)) / (sorted.length - 1);
  let at = start;
  for (const a of sorted) {
    if (axis === 'x') a.canvasX = Math.round(at);
    else a.canvasY = Math.round(at);
    at += size(a) + gap;
  }
}
