import { CATALOG_BY_KIND, uid, type Artboard, type LogicNode } from 'interactives-player';

/**
 * Duplicate a layer with what it does. When layers are copied, the interactions that start from them are copied too, as
 * ordinary nodes and wires in the same graph, with every layer they point at inside the copy now pointing at the copy.
 *
 * What counts as "starting from" a layer: an event node (a click, a hover, a drop...) with a layer setting that names one of the
 * copied layers. From each such event the copy follows the wires. A step that works on layers is copied when at least one of them is
 * inside the copy (the copied button shows the copied dialog). A step that touches only layers outside the copy, or is part of a
 * question's own wiring, is not copied: the copy's wire joins the original step instead, so the copied button still shows the same
 * "Feedback" layer, and what comes after it is not repeated. Steps that name no layer (change a variable, wait, go to a page) are
 * copied with the rest of their chain, so the copy does the same thing.
 */

/** The layer ids a node's settings point at, by the layer settings its kind has in the catalog. */
function layerRefs(n: LogicNode): string[] {
  const def = CATALOG_BY_KIND[n.kind];
  if (!def) return [];
  const out: string[] = [];
  for (const p of def.params) {
    if (p.type !== 'node') continue;
    const v = n.params[p.key];
    if (typeof v === 'string' && v) out.push(v);
  }
  return out;
}

/** The same settings, with the layers that were copied pointing at their copies. */
function retarget(n: LogicNode, idMap: ReadonlyMap<string, string>): Record<string, unknown> {
  const params = JSON.parse(JSON.stringify(n.params)) as Record<string, unknown>;
  const def = CATALOG_BY_KIND[n.kind];
  for (const p of def?.params ?? []) {
    if (p.type !== 'node') continue;
    const v = params[p.key];
    if (typeof v === 'string' && idMap.has(v)) params[p.key] = idMap.get(v);
  }
  return params;
}

export interface BehaviourCopied {
  /** The events (what starts it) that were copied. */
  events: number;
  /** All nodes made, events included. */
  nodes: number;
}

/**
 * Copy the interactions of the layers in `idMap` (old layer id to its copy's id, descendants included) into `ab.logic`. A plain object or
 * an immer draft. The new nodes are laid out as a block under the lowest node that is already there, keeping their arrangement.
 */
export function copyBehaviour(ab: Pick<Artboard, 'logic'>, idMap: ReadonlyMap<string, string>): BehaviourCopied {
  const none = { events: 0, nodes: 0 };
  if (!idMap.size) return none;
  const g = ab.logic;
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  for (const e of g.edges) (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.id);
  const edgeById = new Map(g.edges.map((e) => [e.id, e]));
  const inside = (id: string) => idMap.has(id);
  //the question kit writes and rewrites its own wiring, so it is never copied by hand (a copied question gets its own)
  const mine = (n: LogicNode) => !n.kit;
  const triggers = g.nodes.filter((n) => mine(n) && CATALOG_BY_KIND[n.kind]?.category === 'event' && layerRefs(n).some(inside));
  if (!triggers.length) return none;

  //which nodes get a copy: the triggers, and whatever follows them that is about the copied layers or about no layer at all
  const copied = new Set<string>();
  const walk = (n: LogicNode) => {
    if (copied.has(n.id)) return;
    copied.add(n.id);
    for (const eid of out.get(n.id) ?? []) {
      const next = byId.get(edgeById.get(eid)!.to);
      if (!next || !mine(next)) continue;
      const refs = layerRefs(next);
      //a step that only touches layers outside the copy is shared, not copied
      if (refs.length && !refs.some(inside)) continue;
      walk(next);
    }
  };
  for (const t of triggers) walk(t);

  const block = g.nodes.filter((n) => copied.has(n.id));
  const top = Math.min(...block.map((n) => n.y));
  const dy = g.nodes.reduce((m, n) => Math.max(m, n.y), -100) + 140 - top;
  const fresh = new Map<string, string>();
  const made: LogicNode[] = [];
  for (const n of block) {
    const id = uid('lg');
    fresh.set(n.id, id);
    made.push({ id, kind: n.kind, x: n.x, y: n.y + dy, params: retarget(n, idMap), ...(n.note ? { note: n.note } : {}) });
  }
  g.nodes.push(...made);
  for (const e of [...g.edges]) {
    if (!copied.has(e.from)) continue;
    //(a wire from a copied step to one that was not copied joins the original: the shared end)
    const to = fresh.get(e.to) ?? e.to;
    g.edges.push({ id: uid('e'), from: fresh.get(e.from)!, fromPort: e.fromPort, to, toPort: e.toPort });
  }
  return { events: triggers.length, nodes: made.length };
}
