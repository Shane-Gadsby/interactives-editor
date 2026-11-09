// The artboard commands the canvas, the Layers panel and the keyboard share: each asks what it needs to (a name, a yes), then
// does one store operation. The store methods themselves never ask anything, so they stay easy to test.
import { keyHints } from './keymap';
import { store } from '../store/store';
import { confirmDialog, promptDialog } from '../components/dialogs';
import type { MenuItem } from '../components/ContextMenu';
import { freshGroupName, groupOf, pickedArtboardIds } from './artboard-groups';
import { tidyArtboardsCommand } from './tidy-command';
import { linkColoursCommand } from './link-colours-action';
import { placeInMenu } from './components';

/** Delete artboards. Several at once is asked about first (one undo brings them back); one is deleted straight away as it always was. */
export async function deleteArtboardsCommand(ids: string[]): Promise<void> {
  const s = store();
  const list = ids.filter((id) => s.get().project.artboards.some((a) => a.id === id));
  if (!list.length) return;
  if (list.length > 1 && !(await confirmDialog({ title: `Delete ${list.length} pages?`, message: 'They and everything on them go. Undo (Ctrl+Z) brings them back.', confirmLabel: `Delete ${list.length} pages`, danger: true }))) return;
  s.deleteArtboards(list);
}

/**
 * The Delete key: the selected layers (with an Undo message saying what went), or the selected artboards. From the keyboard a
 * page or component is always asked about first, since it takes everything on it along and a stray key is easy.
 */
export async function deleteSelectionCommand(opts: { keyboard?: boolean } = {}): Promise<void> {
  const s = store();
  const st = s.get();
  if (st.artboardSelected) {
    const ids = pickedArtboardIds(st);
    if (opts.keyboard && ids.length === 1) {
      const ab = st.project.artboards.find((a) => a.id === ids[0]);
      if (ab && !(await confirmDialog({ title: `Delete the page "${ab.name}"?`, message: 'It and everything on it go. Undo (Ctrl+Z) brings it back.', confirmLabel: 'Delete', danger: true }))) return;
    }
    await deleteArtboardsCommand(ids);
    return;
  }
  const names = s.selectedNodes().map((n) => n.name);
  if (!names.length) return;
  const mark = s.historyMark();
  s.deleteSelection();
  s.toastUndo(names.length === 1 ? `Deleted ${names[0]}.` : `Deleted ${names.length} layers.`, mark);
}

/** Group the artboards, asking for a name first. */
export async function groupArtboardsCommand(ids: string[]): Promise<string | null> {
  const s = store();
  if (!ids.length) return null;
  const name = await promptDialog({ title: 'Group pages', label: 'Group name', initial: freshGroupName(s.get().project), confirmLabel: 'Group', validate: (v) => (v.trim() ? null : 'Give the group a name') });
  if (name === null) return null;
  return s.groupArtboards(ids, name);
}

export async function renameGroupCommand(gid: string): Promise<void> {
  const s = store();
  const g = s.get().project.artboardGroups?.find((x) => x.id === gid);
  if (!g) return;
  const name = await promptDialog({ title: 'Rename group', label: 'Group name', initial: g.name, confirmLabel: 'Rename', validate: (v) => (v.trim() ? null : 'Give the group a name') });
  if (name !== null) s.renameArtboardGroup(gid, name);
}

/** What the groups menu items need to know about a selection of artboards. */
export function selectionGroupInfo(ids: string[]) {
  const p = store().get().project;
  const boards = p.artboards.filter((a) => ids.includes(a.id));
  const groups = new Set(boards.map((a) => groupOf(p, a)?.id).filter(Boolean) as string[]);
  return { boards, inAGroup: groups.size > 0, oneGroup: groups.size === 1 ? [...groups][0] : null };
}

/**
 * The context menu for artboards: `ids` are the selected ones (the Layers panel and the canvas both build it from the selection),
 * `gid` is set when it is the menu of a group's own title or row. Callers add what only they can do (zoom, make start).
 */
export function artboardMenuItems(ids: string[], gid?: string): MenuItem[] {
  const s = store();
  const p = s.get().project;
  const { boards, inAGroup, oneGroup } = selectionGroupInfo(ids);
  const group = gid ? p.artboardGroups?.find((g) => g.id === gid) : oneGroup ? p.artboardGroups?.find((g) => g.id === oneGroup) : undefined;
  const heading = gid && group ? `${group.name} (group)` : boards.length === 1 ? boards[0].name : `${boards.length} pages`;
  const items: MenuItem[] = [{ heading }];
  if (gid) {
    items.push({ label: 'Select all in group', onClick: () => s.pickGroup(gid) });
    items.push({ label: 'Rename group…', onClick: () => void renameGroupCommand(gid) });
    items.push({ label: 'Ungroup', title: 'Break the group up. Its pages stay where they are', onClick: () => s.ungroupArtboards(gid) });
  } else {
    items.push({ label: 'Group pages…', title: 'Put the selected pages in a named group: listed together in the Layers panel, and framed on the canvas', onClick: () => void groupArtboardsCommand(ids) });
    if (inAGroup) items.push({ label: 'Ungroup', title: 'Take the selected pages out of their group', onClick: () => s.leaveArtboardGroups(ids) });
    if (group) {
      items.push({ label: 'Rename group…', onClick: () => void renameGroupCommand(group.id) });
      items.push({ label: 'Select all in group', onClick: () => s.pickGroup(group.id) });
    }
  }
  items.push({ separator: true });
  const target = gid ? p.artboards.filter((a) => a.group === gid).map((a) => a.id) : ids;
  const tidyAll = !gid && boards.length < 2;
  items.push({
    label: tidyAll ? 'Tidy up pages' : 'Tidy up',
    title: tidyAll ? 'Lay all the pages out in a grid' : 'Lay these pages out in a grid among themselves',
    disabled: tidyAll ? p.artboards.filter((a) => !a.canvasHidden).length < 2 : target.length < 2,
    onClick: () => (tidyAll ? tidyArtboardsCommand() : tidyTheseCommand(target)),
  });
  if (!gid && boards.length === 1 && !boards[0].library) {
    const ab = boards[0];
    if (ab.master) items.push({ label: 'Edit master', title: 'Select the page master this page draws, to change the layers every page shares', onClick: () => s.editMasterOf(ab.id) });
    else if (!ab.isMaster) items.push({ label: 'Make this a master', title: 'A page master holds the layers every page shares (logo, accent bar, footer). Pages that use it draw its layers under their own', onClick: () => s.markAsMaster(ab.id, true) });
    else {
      items.push({ label: 'Use as master for…', title: 'Choose the pages that draw this page as their master (in its Page master section)', onClick: () => s.set({ activeArtboardId: ab.id, artboardSelected: true, selection: [], activeTimelineId: null }) });
      if (!p.artboards.some((x) => x.master === ab.id)) items.push({ label: 'Not a page master', onClick: () => s.markAsMaster(ab.id, false) });
    }
  }
  items.push({ label: 'Link colours to tokens…', title: 'Turn the plain colours on these pages that are the same as a token\'s colour into that token, so they change with the theme', onClick: () => void linkColoursCommand(target) });
  const place = !gid && boards.length === 1 ? placeInMenu(boards[0].id) : null;
  if (place) items.push(place);
  items.push({ label: 'Duplicate', onClick: () => s.duplicateArtboards(target) });
  items.push({ label: gid ? 'Delete pages in group' : boards.length > 1 ? 'Delete pages' : 'Delete page', hint: gid ? undefined : keyHints('delete'), danger: true, onClick: () => void deleteArtboardsCommand(target) });
  return items;
}

/** Tidy up exactly these artboards. */
export function tidyTheseCommand(ids: string[]): void {
  const s = store();
  const mark = s.historyMark();
  const moved = s.tidyArtboards(ids);
  if (moved) s.toastUndo(`Tidied ${moved} ${moved === 1 ? 'page' : 'pages'} into a grid.`, mark);
  else s.toast('Those pages are already tidy.', 'info');
}
