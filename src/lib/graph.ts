import { CATALOG, CATALOG_BY_KIND } from 'interactives-player';

/** Which end of a connection the user dragged from: an output port (forwards) or an input port (backwards). */
export type DragDirection = 'from-output' | 'from-input';

/**
 * Node kinds that can be connected to a dragged port, in catalog order.
 * From an output: anything with an input (actions and logic). From an input: anything with outputs (events, actions, logic).
 */
export function compatibleKinds(direction: DragDirection): string[] {
  return CATALOG.filter((d) => (direction === 'from-output' ? d.hasInput : d.outputs.length > 0)).map((d) => d.kind);
}

/** The port a new node should connect through when dropped from `direction`: its input, or its first output. */
export function newNodePort(kind: string, direction: DragDirection): string | undefined {
  const def = CATALOG_BY_KIND[kind];
  if (!def) return undefined;
  return direction === 'from-output' ? (def.hasInput ? 'in' : undefined) : def.outputs[0]?.id;
}
