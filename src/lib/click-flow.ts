//Write "when this layer is clicked, do these" into an artboard's graph as ordinary nodes and wires: an On pointer event on the
//layer, then each step after the one before. Nothing hidden: what this writes is what the Interactions tab shows and edits.
//Shared by the things that set up behaviour without the graph (drag a button to a page, the page navigation generator).
import { defaultParams, uid, type Artboard, type LogicNode } from 'interactives-player';

export interface FlowStep {
	kind: string;
	/** Over the catalog's defaults. */
	params?: Record<string, unknown>;
}

export interface FlowWritten {
	event: LogicNode;
	steps: LogicNode[];
}

/**
 * Add an event (`kind`, with `params`) and a chain of steps to the artboard (a plain object or an immer draft: it pushes onto
 * `logic.nodes` and `logic.edges`). New nodes go under the lowest one there is, event on the left and the steps to its right.
 */
export function writeFlow(ab: Pick<Artboard, 'logic'>, event: { kind: string; params?: Record<string, unknown>; note?: string }, steps: FlowStep[]): FlowWritten {
	const y = ab.logic.nodes.reduce((m, n) => Math.max(m, n.y), -100) + 140;
	const ev: LogicNode = { id: uid('lg'), kind: event.kind, x: 40, y, params: { ...defaultParams(event.kind), ...event.params }, ...(event.note ? { note: event.note } : {}) };
	const made = steps.map((s, i): LogicNode => ({ id: uid('lg'), kind: s.kind, x: 300 + i * 260, y, params: { ...defaultParams(s.kind), ...s.params } }));
	ab.logic.nodes.push(ev, ...made);
	let from = ev;
	for (const n of made) {
		ab.logic.edges.push({ id: uid('e'), from: from.id, fromPort: 'out', to: n.id, toPort: 'in' });
		from = n;
	}
	return { event: ev, steps: made };
}

/** `writeFlow` for the commonest event: a layer is clicked (or hovered, with `type: 'pointerenter'`). */
export const writeClickFlow = (ab: Pick<Artboard, 'logic'>, layerId: string, steps: FlowStep[], type = 'click', note?: string): FlowWritten => writeFlow(ab, { kind: 'event.pointer', params: { target: layerId, type }, note }, steps);

/** Hang one more step off a node (its first output), at the end of the row it is on. Returns the new node. */
export function appendStep(ab: Pick<Artboard, 'logic'>, after: LogicNode, step: FlowStep): LogicNode {
	const x = ab.logic.nodes.filter((n) => n.y === after.y).reduce((m, n) => Math.max(m, n.x), after.x) + 260;
	const node: LogicNode = { id: uid('lg'), kind: step.kind, x, y: after.y, params: { ...defaultParams(step.kind), ...step.params } };
	ab.logic.nodes.push(node);
	ab.logic.edges.push({ id: uid('e'), from: after.id, fromPort: 'out', to: node.id, toPort: 'in' });
	return node;
}
