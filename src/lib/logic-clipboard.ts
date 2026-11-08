import { cleanNotes, uid, type LogicEdge, type LogicGroup, type LogicNode, type Note } from 'interactives-player';

/**
 * Copy and paste for interaction graph nodes. Kept apart from the layer clipboard
 * (lib/clipboard.ts) under its own marker, so a node copied in the graph never pastes
 * onto the artboard as a layer, and the other way round.
 *
 * What's copied is a piece of graph: the nodes, the connections that run between two of
 * them (a connection to a node that wasn't copied is left behind), and any groups.
 */
const MARKER = 'interactives/logic-nodes';

export interface LogicFragment {
  nodes: LogicNode[];
  edges: LogicEdge[];
  groups: LogicGroup[];
  /** Graph notes that go with them: the ones that were chosen, and the ones following a copied node or group. */
  notes?: Note[];
}

const EMPTY: LogicFragment = { nodes: [], edges: [], groups: [] };
let memory: LogicFragment = EMPTY;

/**
 * The piece of graph a selection copies: the chosen nodes, the nodes inside any chosen group (a group goes with what's
 * in it), the chosen groups, and only the connections with both ends among those nodes.
 */
export function fragmentOf(
  graph: { nodes: LogicNode[]; edges: LogicEdge[]; groups?: LogicGroup[]; notes?: Note[] },
  ids: Iterable<string>,
  membersOf: (g: LogicGroup) => LogicNode[],
): LogicFragment {
  const want = new Set(ids);
  const groups = (graph.groups ?? []).filter((g) => want.has(g.id));
  const nodeIds = new Set(graph.nodes.filter((n) => want.has(n.id)).map((n) => n.id));
  for (const g of groups) for (const n of membersOf(g)) nodeIds.add(n.id);
  const nodes = graph.nodes.filter((n) => nodeIds.has(n.id));
  const edges = graph.edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));
  const groupIds = new Set(groups.map((g) => g.id));
  const notes = (graph.notes ?? []).filter((n) => want.has(n.id) || (n.anchor && (nodeIds.has(n.anchor.layerId) || groupIds.has(n.anchor.layerId))));
  return notes.length ? { nodes, edges, groups, notes } : { nodes, edges, groups };
}

/**
 * A copy of the fragment with new ids everywhere, moved by (dx, dy). Its connections are rewired to the new nodes, so the
 * copies are linked to each other the way the originals were (and never to the originals).
 */
export function cloneFragment(f: LogicFragment, dx: number, dy: number): LogicFragment {
  const ids = new Map<string, string>();
  const nodes = f.nodes.map((n) => {
    const id = uid('lg');
    ids.set(n.id, id);
    return { ...structuredClone(n), id, x: Math.round(n.x + dx), y: Math.round(n.y + dy) };
  });
  const edges = f.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ ...e, id: uid('e'), from: ids.get(e.from)!, to: ids.get(e.to)! }));
  const groups = f.groups.map((g) => {
    const id = uid('lgg');
    ids.set(g.id, id);
    return { ...structuredClone(g), id, x: Math.round(g.x + dx), y: Math.round(g.y + dy) };
  });
  // a note follows the copy of what it followed, or (when that wasn't copied) just stays where it was, moved with the rest
  const notes = (f.notes ?? []).map((n) => {
    const c = { ...structuredClone(n), id: uid('note_'), x: Math.round(n.x + dx), y: Math.round(n.y + dy) };
    if (n.anchor) {
      const to = ids.get(n.anchor.layerId);
      if (to) c.anchor = { ...n.anchor, layerId: to };
      else delete c.anchor;
    }
    return c;
  });
  return notes.length ? { nodes, edges, groups, notes } : { nodes, edges, groups };
}

/** The top left corner of everything in the fragment (where a paste at a point lines up). */
export function fragmentOrigin(f: LogicFragment): { x: number; y: number } {
  const xs = [...f.nodes.map((n) => n.x), ...f.groups.map((g) => g.x), ...(f.notes ?? []).map((n) => n.x)];
  const ys = [...f.nodes.map((n) => n.y), ...f.groups.map((g) => g.y), ...(f.notes ?? []).map((n) => n.y)];
  return { x: xs.length ? Math.min(...xs) : 0, y: ys.length ? Math.min(...ys) : 0 };
}

export function copyLogic(f: LogicFragment): void {
  if (!f.nodes.length && !f.groups.length && !f.notes?.length) return;
  memory = JSON.parse(JSON.stringify(f));
  void navigator.clipboard?.writeText(JSON.stringify({ [MARKER]: memory })).catch(() => undefined);
}

/** What to paste: from the clipboard text when it's ours, otherwise the in-memory copy. */
export function logicToPaste(text?: string | null): LogicFragment {
  if (text) {
    try {
      const parsed = JSON.parse(text);
      const v = parsed?.[MARKER];
      // Before connections and groups were copied it was just the list of nodes
      if (Array.isArray(v)) return { nodes: v, edges: [], groups: [] };
      if (v && Array.isArray(v.nodes)) {
        const notes = cleanNotes(v.notes);
        return { nodes: v.nodes, edges: Array.isArray(v.edges) ? v.edges : [], groups: Array.isArray(v.groups) ? v.groups : [], ...(notes ? { notes } : {}) };
      }
    } catch {
      /* not ours */
    }
    // Something else is on the clipboard (copied after our nodes), so there's nothing of ours to paste
    return EMPTY;
  }
  return memory;
}
