/**
 * Small builders the Content and explore tutorials' examples share (reveal, flip cards, accordion, carousel, compare, presentation,
 * diagram). Each writes what the editor's own buttons write: `whenClicked` is one of the "+ When clicked…" choices (the
 * nodes recipes.ts writes: recipes.ts itself can't be loaded outside a browser, it reaches the asset store), `clickFlow` is
 * "+ On click (empty)" with nodes dragged off it (click-flow.ts, catalog defaults), `variable` is a row of the Variables tab, and
 * `page` is "+ Add page". No `example` export, so the example list leaves this file out.
 */
import { createArtboard, createNode, uid, type Artboard, type LogicNode, type Paint, type Project, type SceneNode, type TextNode, type Variable, type VariableType } from 'interactives-player';
import { appendStep, writeClickFlow, writeFlow, type FlowStep } from '../../src/lib/click-flow';

export const solid = (color: string): Paint => ({ type: 'solid', color });
export const line = (color: string, width = 2) => ({ paint: solid(color), width });

/** The colours the tutorials name, so the steps and the examples agree. */
export const C = {
  navy: '#1f3a68',
  ink: '#1c1e26',
  muted: '#555b6b',
  white: '#ffffff',
  yellow: '#ffd54f',
  green: '#a5d6a7',
  pale: '#e8eefc',
  grey: '#c9ced6',
  panel: '#f3f4f8',
};

/** A variable as the Variables tab keeps it (a list's starting items as JSON text). */
export function variable(p: Project, name: string, type: VariableType, initial: number | string | boolean | unknown[], extra: Partial<Variable> = {}): Variable {
  const v: Variable = { id: uid('v'), name, type, initial: Array.isArray(initial) ? JSON.stringify(initial) : initial, ...extra };
  p.variables.push(v);
  return v;
}

/** A text layer as the Text tool makes it, with the words and settings given. */
export const text = (name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  createNode('text', { name, text: value, x, y, width, ...extra } as never) as TextNode;

/** A layer's data bindings (In, the usual way). */
export const bind = <T extends SceneNode>(n: T, bindings: Record<string, string>): T => Object.assign(n, { bindings: { ...(n.bindings ?? {}), ...bindings } });

/**
 * "+ When clicked…" > Show a layer, Hide a layer or Switch something on or off, as recipes.ts writes them: the click and one action.
 * Showing another layer starts it hidden, as the recipe does. Returns the action node, to hang more off.
 */
export function whenClicked(ab: Artboard, layer: SceneNode, what: 'show' | 'hide', target: SceneNode): LogicNode;
export function whenClicked(ab: Artboard, layer: SceneNode, what: 'switch', target: Variable): LogicNode;
export function whenClicked(ab: Artboard, layer: SceneNode, what: 'show' | 'hide' | 'switch', target: SceneNode | Variable): LogicNode {
  if (what === 'switch') return writeClickFlow(ab, layer.id, [{ kind: 'action.setVariable', params: { variable: target.id, op: 'toggle', value: '' } }]).steps[0];
  if (what === 'show' && target !== layer) (target as SceneNode).visible = false;
  return writeClickFlow(ab, layer.id, [{ kind: 'action.visibility', params: { target: target.id, op: what } }]).steps[0];
}

/** "+ On click (empty)" and the nodes dragged off it, one after the other. Returns the event and the steps. */
export const clickFlow = (ab: Artboard, layer: SceneNode, steps: FlowStep[]) => writeClickFlow(ab, layer.id, steps);

/** Any other event, added from the node list, and the steps after it. */
export const eventFlow = (ab: Artboard, kind: string, params: Record<string, unknown>, steps: FlowStep[]) => writeFlow(ab, { kind, params }, steps);

/** One more node after `after` (not called then: a module exporting then is taken for a promise when it is imported). */
export const andThen = (ab: Artboard, after: LogicNode, step: FlowStep): LogicNode => appendStep(ab, after, step);

/** A Change a value or counter step. */
export const change = (v: Variable, value: string, op = 'set'): FlowStep => ({ kind: 'action.setVariable', params: { variable: v.id, op, value } });

/** "+ Add page": a white 800 by 600 page to the right of the others. */
export function page(p: Project, name: string): Artboard {
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const ab = createArtboard({ name, canvasX: right + 100, canvasY: 0 });
  p.artboards.push(ab);
  return ab;
}
