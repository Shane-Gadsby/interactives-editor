/**
 * Sticky notes on the editor canvas (`Artboard.notes`, `Project.notes`; see the player's notes.ts). Everything that changes one goes
 * through `EditorStore.update`, so notes undo, save, and reach collaborators as ordinary id-addressed ops. Notes are not layers: no
 * function here touches the layer tree.
 */
import { apply, invert, makeNote, NOTE_COLOURS, NOTE_MAX_TEXT, NOTE_MIN_H, NOTE_MIN_W, type Note, type NoteColour, type Project } from 'interactives-player';
import type { Draft } from 'immer';
import { getArtboard, locate, nodeToArtboard } from '../store/doc';
import { store } from '../store/store';
import { sessionUser } from './session';

/** An artboard id for a note on an artboard, null for a note on the canvas itself. */
export type NoteOwner = string | null;

export interface NoteRef {
  note: Note;
  owner: NoteOwner;
}

export const notesOf = (p: Project, owner: NoteOwner): Note[] => (owner === null ? p.notes : getArtboard(p, owner)?.notes) ?? [];

/** Every note in the project: the canvas ones first, then each artboard's in artboard order. */
export function allNotes(p: Project): NoteRef[] {
  return [...(p.notes ?? []).map((note) => ({ note, owner: null as NoteOwner })), ...p.artboards.flatMap((a) => (a.notes ?? []).map((note) => ({ note, owner: a.id as NoteOwner })))];
}

export function findNote(p: Project, id: string): NoteRef | null {
  return allNotes(p).find((r) => r.note.id === id) ?? null;
}

export interface NotePlace {
  /** Top left corner in the owner's coordinates (artboard pixels, or canvas pixels for a canvas note). */
  x: number;
  y: number;
  /** The layer it was attached to is gone: it stays where it was left. */
  detached: boolean;
}

/** Where a note is drawn right now: at its anchor layer's corner when it has one that still exists, otherwise where it was left. */
export function notePlace(p: Project, owner: NoteOwner, note: Note): NotePlace {
  const ab = owner === null ? undefined : getArtboard(p, owner);
  if (note.anchor && ab && locate(ab, note.anchor.layerId)) {
    const at = apply(nodeToArtboard(ab, note.anchor.layerId), note.anchor.lx, note.anchor.ly);
    return { x: at.x, y: at.y, detached: false };
  }
  return { x: note.x, y: note.y, detached: !!note.anchor };
}

/** How big a note is drawn at a zoom: it follows the zoom, but stays readable when zoomed far out and doesn't swamp the canvas zoomed in. */
export const noteScale = (zoom: number): number => Math.min(1.6, Math.max(0.6, zoom));

let me = '';
let asked = false;
/** The signed in person's name, for the byline of a new note (empty until the session answers). */
function author(): string {
  if (!asked) {
    asked = true;
    void sessionUser().then((u) => (me = u?.name ?? ''));
  }
  return me;
}

function listFor(d: Draft<Project>, owner: NoteOwner): Note[] | null {
  if (owner === null) return (d.notes ??= []) as Note[];
  const ab = d.artboards.find((a) => a.id === owner);
  return ab ? ((ab.notes ??= []) as Note[]) : null;
}

/** Drop an emptied list so the document doesn't carry `notes: []` around. */
function tidy(d: Draft<Project>): void {
  if (d.notes && !d.notes.length) delete d.notes;
  for (const a of d.artboards) if (a.notes && !a.notes.length) delete a.notes;
}

export interface NewNote {
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  colour?: NoteColour;
  /** A layer (on the same artboard) the note follows. */
  layerId?: string;
}

/** Add a note and return its id. With `layerId` the note follows that layer, keeping its offset from the layer's corner. */
export function addNote(owner: NoteOwner, n: NewNote, opts: { author?: string } = {}): string | null {
  const s = store();
  const p = s.get().project;
  if (owner !== null && !getArtboard(p, owner)) return null;
  const by = opts.author ?? author();
  const note = makeNote({ x: round(n.x), y: round(n.y), w: n.w, h: n.h, text: n.text ?? '', colour: n.colour, author: by || undefined, created: new Date().toISOString() });
  if (n.layerId && owner !== null) {
    const a = anchorFor(p, owner, n.layerId, note.x, note.y);
    if (a) note.anchor = a;
  }
  s.update((d) => {
    listFor(d, owner)?.push(note);
  });
  return note.id;
}

const round = (v: number) => Math.round(v * 10) / 10;

/** The anchor that keeps a note at artboard point (x, y) relative to a layer, or null when the layer isn't there. */
function anchorFor(p: Project, artboardId: string, layerId: string, x: number, y: number): Note['anchor'] | null {
  const ab = getArtboard(p, artboardId);
  if (!ab || !locate(ab, layerId)) return null;
  const local = apply(invert(nodeToArtboard(ab, layerId)), x, y);
  return { layerId, lx: round(local.x), ly: round(local.y) };
}

type NotePatch = Partial<Pick<Note, 'w' | 'h' | 'text' | 'colour'>>;

/** Change a note's size, text or colour. Typing and dragging pass a `coalesce` key so a burst is one undo step. */
export function patchNote(id: string, patch: NotePatch, coalesce?: string): void {
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

/** Put a note's top left corner at (x, y) in its owner's coordinates. An attached note keeps following its layer from the new offset. */
export function moveNote(id: string, x: number, y: number, coalesce?: string): void {
  const s = store();
  const p = s.get().project;
  const ref = findNote(p, id);
  if (!ref) return;
  const anchor = ref.note.anchor && ref.owner !== null ? anchorFor(p, ref.owner, ref.note.anchor.layerId, x, y) : null;
  s.update(
    (d) => {
      const n = noteIn(d, id);
      if (!n) return;
      n.x = round(x);
      n.y = round(y);
      if (anchor) n.anchor = anchor;
    },
    { coalesce },
  );
}

/** Make a note follow a layer on its artboard from where it is now, or let go of the one it follows. */
export function attachNote(id: string, layerId: string | null): boolean {
  const s = store();
  const p = s.get().project;
  const ref = findNote(p, id);
  if (!ref || ref.owner === null) return false;
  const at = notePlace(p, ref.owner, ref.note);
  const anchor = layerId ? anchorFor(p, ref.owner, layerId, at.x, at.y) : null;
  if (layerId && !anchor) return false;
  s.update((d) => {
    const n = noteIn(d, id);
    if (!n) return;
    n.x = round(at.x);
    n.y = round(at.y);
    if (anchor) n.anchor = anchor;
    else delete n.anchor;
  });
  return true;
}

/** Stop typing in the note being edited. A note left empty goes away instead of cluttering the canvas. */
export function leaveNote(): void {
  const s = store();
  const id = s.get().editingNote;
  if (!id) return;
  s.set({ editingNote: null });
  const ref = findNote(s.get().project, id);
  if (ref && !ref.note.text.trim()) {
    removeNote(id);
    s.set({ selectedNote: null });
  }
}

export function removeNote(id: string): void {
  const ref = findNote(store().get().project, id);
  if (!ref) return;
  store().update((d) => {
    const list = listFor(d, ref.owner);
    if (list) list.splice(list.findIndex((n) => n.id === id), 1);
    tidy(d);
  });
}

function noteIn(d: Draft<Project>, id: string): Draft<Note> | undefined {
  return d.notes?.find((n) => n.id === id) ?? d.artboards.flatMap((a) => a.notes ?? []).find((n) => n.id === id);
}
