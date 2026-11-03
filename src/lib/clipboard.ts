import { cloneWithNewIds, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { selectionBounds, topmost, locate } from '../store/doc';

const MARKER = 'interactives/nodes';
let memory: SceneNode[] = [];

export function copySelection(cut = false): void {
  const ab = store().artboard();
  if (!ab) return;
  const ids = topmost(ab, store().get().selection);
  const nodes = ids.map((id) => locate(ab, id)?.node).filter(Boolean) as SceneNode[];
  if (!nodes.length) return;
  memory = JSON.parse(JSON.stringify(nodes));
  void navigator.clipboard?.writeText(JSON.stringify({ [MARKER]: memory })).catch(() => undefined);
  if (cut) store().deleteSelection();
}

/** Paste nodes from the system clipboard text (if ours) or the in-memory copy. Returns false when there was nothing to paste. */
export function pasteNodes(text?: string): boolean {
  let nodes = memory;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed[MARKER])) nodes = parsed[MARKER];
    } catch {
      /* not ours */
    }
  }
  if (!nodes.length) return false;
  const ab = store().artboard();
  if (!ab) return false;
  const copies = nodes.map((n) => cloneWithNewIds(JSON.parse(JSON.stringify(n)) as SceneNode));
  // Same artboard: offset so the copy is visible. Otherwise keep coordinates.
  const existing = selectionBounds(ab, nodes.map((n) => n.id).filter((id) => locate(ab, id)));
  for (const c of copies) {
    if (existing) {
      c.x += 16;
      c.y += 16;
    }
  }
  memory = JSON.parse(JSON.stringify(copies));
  store().addNodes(copies);
  return true;
}
