import type { LogicNode } from 'interactives-player';

/**
 * Copy and paste for interaction graph nodes. Kept apart from the layer clipboard
 * (lib/clipboard.ts) under its own marker, so a node copied in the graph never pastes
 * onto the artboard as a layer, and the other way round.
 */
const MARKER = 'interactives/logic-nodes';
let memory: LogicNode[] = [];

export function copyLogicNodes(nodes: LogicNode[]): void {
  if (!nodes.length) return;
  memory = JSON.parse(JSON.stringify(nodes));
  void navigator.clipboard?.writeText(JSON.stringify({ [MARKER]: memory })).catch(() => undefined);
}

/** The nodes to paste: from the clipboard text when it's ours, otherwise the in-memory copy. */
export function logicNodesToPaste(text?: string | null): LogicNode[] {
  if (text) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed[MARKER])) return parsed[MARKER];
    } catch {
      /* not ours */
    }
    // Something else is on the clipboard (copied after our nodes), so there's nothing of ours to paste
    return [];
  }
  return memory;
}
