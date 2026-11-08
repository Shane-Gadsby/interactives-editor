/**
 * The parts of graph notes that need no store: where a note is drawn, and how tall its words need it to be. The starter kit (which
 * runs without an editor) and the tidy use these; the editing functions are in graph-notes.ts.
 */
import { NOTE_MIN_H, type LogicGraph, type Note } from 'interactives-player';

/** Where a graph note is drawn: at its anchor's corner plus the offset when the anchor is still in the graph, otherwise where it was left. */
export interface GraphNotePlace {
  x: number;
  y: number;
  /** What it was attached to is gone: it stays where it was left. */
  detached: boolean;
}

/** The top left corner of a node or group of this graph, or null when it isn't there. */
export function anchorOrigin(logic: Pick<LogicGraph, 'nodes' | 'groups'>, id: string): { x: number; y: number; kind: 'node' | 'group' } | null {
  const n = logic.nodes.find((x) => x.id === id);
  if (n) return { x: n.x, y: n.y, kind: 'node' };
  const g = logic.groups?.find((x) => x.id === id);
  return g ? { x: g.x, y: g.y, kind: 'group' } : null;
}

export function graphNotePlace(logic: Pick<LogicGraph, 'nodes' | 'groups'>, note: Note): GraphNotePlace {
  if (note.anchor) {
    const o = anchorOrigin(logic, note.anchor.layerId);
    if (o) return { x: o.x + note.anchor.lx, y: o.y + note.anchor.ly, detached: false };
  }
  return { x: note.x, y: note.y, detached: !!note.anchor };
}

/**
 * How tall a note has to be to show this text at this width, by a rough count of characters per line (the paper is 13px type): the
 * kit uses it to size the notes it writes, so a starter's notes open fitted to their words.
 */
export function noteHeightFor(text: string, w: number): number {
  const perLine = Math.max(12, Math.floor((w - 16) / 7.3));
  let lines = 0;
  for (const raw of text.split('\n')) lines += Math.max(1, Math.ceil(raw.replace(/\*\*|\*|`|^- |^\[[ x]\] /g, '').length / perLine));
  return Math.max(NOTE_MIN_H, 24 + lines * 17.5);
}
