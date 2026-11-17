//Folding the question kit's nodes in the Interactions graph. Every question the kit makes writes a handful of nodes (reset on start,
//choose an option, check, hint, reveal...) tagged `kit: {frame, slot}`. They are the same ordinary nodes as any other, but there
//can be dozens of them, so the graph shows each question's as one block that opens to show them, and the author's own flows stand
//out. This is only how the graph is drawn: nothing here changes the document. These are the pure parts: which nodes fold, where the
//block sits, and how the connections that cross its edge are drawn.
import type { LogicEdge, LogicNode } from 'interactives-player';

/** Id of the block that stands for one question's kit nodes (never a node of the document). */
export const FOLD_PREFIX = 'kitfold:';
export const foldId = (frame: string): string => FOLD_PREFIX + frame;
export const isFoldId = (id: string): boolean => id.startsWith(FOLD_PREFIX);

/** A question with fewer kit nodes than this is not worth a block. */
export const MIN_FOLD = 2;

export interface KitBlock {
  frame: string;
  id: string;
  members: LogicNode[];
  /** Top left of the nodes it covers. */
  x: number;
  y: number;
}

/** The kit nodes of each question, in the order the nodes are. Only questions with enough nodes to fold. */
export function kitBlocks(nodes: LogicNode[]): KitBlock[] {
  const by = new Map<string, LogicNode[]>();
  for (const n of nodes) if (n.kit?.frame) (by.get(n.kit.frame) ?? by.set(n.kit.frame, []).get(n.kit.frame)!).push(n);
  const out: KitBlock[] = [];
  for (const [frame, members] of by) {
    if (members.length < MIN_FOLD) continue;
    out.push({ frame, id: foldId(frame), members, x: Math.min(...members.map((m) => m.x)), y: Math.min(...members.map((m) => m.y)) });
  }
  return out;
}

/** Which node is hidden in which block: every member of a block that is not open. */
export function hiddenIn(blocks: KitBlock[], open: ReadonlySet<string>): Map<string, KitBlock> {
  const out = new Map<string, KitBlock>();
  for (const b of blocks) if (!open.has(b.frame)) for (const m of b.members) out.set(m.id, b);
  return out;
}

/** A connection as the graph draws it. */
export interface DrawnEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
}

/**
 * The connections to draw while some blocks are folded. One inside a block is not drawn; one that crosses its edge is drawn to the
 * block itself (its `out` and `in` handles), and several of those that would land on the same place are drawn once.
 */
export function foldedEdges(edges: LogicEdge[], hidden: Map<string, KitBlock>): DrawnEdge[] {
  const out: DrawnEdge[] = [];
  const seen = new Set<string>();
  for (const e of edges) {
    const from = hidden.get(e.from);
    const to = hidden.get(e.to);
    if (from && from === to) continue;
    const d: DrawnEdge = { id: e.id, source: from ? from.id : e.from, sourceHandle: from ? 'out' : e.fromPort, target: to ? to.id : e.to, targetHandle: to ? 'in' : e.toPort };
    const key = `${d.source}|${d.sourceHandle}|${d.target}|${d.targetHandle}`;
    if ((from || to) && seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** The questions to open so these nodes can be seen (a node picked from somewhere else, or one that was just added). */
export function framesToOpen(ids: string[], blocks: KitBlock[], open: ReadonlySet<string>): string[] {
  const want = new Set(ids);
  return blocks.filter((b) => !open.has(b.frame) && b.members.some((m) => want.has(m.id))).map((b) => b.frame);
}
