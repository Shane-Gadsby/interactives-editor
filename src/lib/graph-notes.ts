/**
 * Sticky notes in the interaction graph (`Artboard.logic.notes`): the same `Note` as the canvas ones, in graph coordinates, with an
 * optional anchor to a node or a group of that graph. An anchored note keeps its offset from the node's (or group's) top left corner,
 * so it moves with it. Everything that changes one goes through `EditorStore.update`, so they undo, save and reach collaborators as
 * ordinary id-addressed ops. They are not nodes: nothing here touches the graph's nodes or connections, and the player never reads them.
 */
import { makeNote, NOTE_COLOURS, NOTE_MAX_TEXT, NOTE_MIN_H, NOTE_MIN_W, type Artboard, type Note, type NoteColour, type Project } from 'interactives-player';
import type { Draft } from 'immer';
import { getArtboard } from '../store/doc';
import { anchorOrigin, graphNotePlace } from './graph-notes-core';

export * from './graph-notes-core';

const round = (v: number) => Math.round(v * 10) / 10;
import { store } from '../store/store';
import { sessionUser } from './session';



export const graphNotesOf = (ab: Pick<Artboard, 'logic'> | undefined): Note[] => ab?.logic.notes ?? [];

/** Every graph note in the project with the artboard it is on. */
export const allGraphNotes = (p: Project): { note: Note; artboardId: string }[] => p.artboards.flatMap((a) => (a.logic.notes ?? []).map((note) => ({ note, artboardId: a.id })));

export function findGraphNote(p: Project, id: string): { note: Note; artboardId: string } | null {
  return allGraphNotes(p).find((r) => r.note.id === id) ?? null;
}

let me = '';
let asked = false;
function author(): string {
  if (!asked) {
    asked = true;
    void sessionUser().then((u) => (me = u?.name ?? ''));
  }
  return me;
}

const listFor = (d: Draft<Project>, abId: string): Note[] | null => {
  const ab = d.artboards.find((a) => a.id === abId);
  return ab ? ((ab.logic.notes ??= []) as Note[]) : null;
};
const tidyLists = (d: Draft<Project>) => {
  for (const a of d.artboards) if (a.logic.notes && !a.logic.notes.length) delete a.logic.notes;
};
const noteIn = (d: Draft<Project>, id: string): Draft<Note> | undefined => d.artboards.flatMap((a) => a.logic.notes ?? []).find((n) => n.id === id);

export interface NewGraphNote {
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  colour?: NoteColour;
  /** A node or group of the same graph the note follows. */
  anchorId?: string;
}

/** Add a note to an artboard's graph and return its id. With `anchorId` it keeps its offset from that node or group. */
export function addGraphNote(artboardId: string, n: NewGraphNote, opts: { author?: string } = {}): string | null {
  const s = store();
  const ab = getArtboard(s.get().project, artboardId);
  if (!ab) return null;
  const by = opts.author ?? author();
  const note = makeNote({ x: round(n.x), y: round(n.y), w: n.w ?? 220, h: n.h ?? 110, text: n.text ?? '', colour: n.colour, author: by || undefined, created: new Date().toISOString() });
  if (n.anchorId) {
    const o = anchorOrigin(ab.logic, n.anchorId);
    if (o) note.anchor = { layerId: n.anchorId, lx: round(note.x - o.x), ly: round(note.y - o.y) };
  }
  s.update((d) => {
    listFor(d, artboardId)?.push(note);
  });
  return note.id;
}

type Patch = Partial<Pick<Note, 'w' | 'h' | 'text' | 'colour'>>;

/** Change a note's size, text or colour. Typing and dragging pass a `coalesce` key so a burst is one undo step. */
export function patchGraphNote(id: string, patch: Patch, coalesce?: string): void {
  store().update(
    (d) => {
      const n = noteIn(d, id);
      if (!n) return;
      if (patch.text !== undefined) n.text = patch.text.slice(0, NOTE_MAX_TEXT);
      if (patch.colour !== undefined && NOTE_COLOURS.includes(patch.colour)) n.colour = patch.colour;
      if (patch.w !== undefined) n.w = Math.max(NOTE_MIN_W, round(patch.w));
      if (patch.h !== undefined) n.h = Math.max(NOTE_MIN_H, round(patch.h));
    },
    { coalesce },
  );
}

/** Put a note's top left corner at (x, y) in the graph. An anchored note keeps following its node or group from the new offset. */
export function moveGraphNote(id: string, x: number, y: number, coalesce?: string): void {
  const s = store();
  const ref = findGraphNote(s.get().project, id);
  if (!ref) return;
  const ab = getArtboard(s.get().project, ref.artboardId)!;
  const o = ref.note.anchor ? anchorOrigin(ab.logic, ref.note.anchor.layerId) : null;
  s.update(
    (d) => {
      const n = noteIn(d, id);
      if (!n) return;
      n.x = round(x);
      n.y = round(y);
      if (o && n.anchor) {
        n.anchor.lx = round(x - o.x);
        n.anchor.ly = round(y - o.y);
      }
    },
    { coalesce },
  );
}

/** Make a note follow a node or group from where it is now, or let go of the one it follows. */
export function attachGraphNote(id: string, anchorId: string | null): boolean {
  const s = store();
  const ref = findGraphNote(s.get().project, id);
  if (!ref) return false;
  const ab = getArtboard(s.get().project, ref.artboardId)!;
  const at = graphNotePlace(ab.logic, ref.note);
  const o = anchorId ? anchorOrigin(ab.logic, anchorId) : null;
  if (anchorId && !o) return false;
  s.update((d) => {
    const n = noteIn(d, id);
    if (!n) return;
    n.x = round(at.x);
    n.y = round(at.y);
    if (o && anchorId) n.anchor = { layerId: anchorId, lx: round(at.x - o.x), ly: round(at.y - o.y) };
    else delete n.anchor;
  });
  return true;
}

export function removeGraphNotes(ids: string[]): void {
  if (!ids.length) return;
  store().update((d) => {
    for (const a of d.artboards) if (a.logic.notes) a.logic.notes = a.logic.notes.filter((n) => !ids.includes(n.id));
    tidyLists(d);
  });
}
export const removeGraphNote = (id: string): void => removeGraphNotes([id]);


/** Stop typing in the graph note being edited. A note left empty goes away instead of cluttering the graph. */
export function leaveGraphNote(id: string): void {
  const s = store();
  if (s.get().editingNote === id) s.set({ editingNote: null });
  const ref = findGraphNote(s.get().project, id);
  if (ref && !ref.note.text.trim()) removeGraphNote(id);
}
