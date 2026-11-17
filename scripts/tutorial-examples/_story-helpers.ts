//What the Stories and games tutorials' examples share: pages, layers and flows made the way the editor makes them (the
//+ When clicked… recipes, a node dragged off an output, + Add variable), so each example is what its steps leave behind. No
//example of its own, so tutorialExamples() skips it.
import { createArtboard, createNode, defaultParams, DEFAULT_TRANSITION_MS, uid, type Artboard, type LogicNode, type NodeType, type Project, type SceneNode, type Variable } from 'interactives-player';
import { appendStep, writeFlow } from '../../src/lib/click-flow';
import { lookFor } from '../../src/lib/themes';
import { VARIABLE_KINDS, variableFor } from '../../src/lib/variable-kinds';

/** The project's starter colours (token references), as a new layer takes them. */
export const look = (p: Project) => lookFor(p.themes);

/** + Add page, renamed: the same size and background as the first page, to the right of the last one. */
export function addPage(p: Project, name: string): Artboard {
  const first = p.artboards[0];
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const ab = createArtboard({ name, width: first.width, height: first.height, background: structuredClone(first.background), canvasX: right + 100, canvasY: 0 });
  p.artboards.push(ab);
  return ab;
}

/** + Add variable with the kind picked from its menu, then renamed (and anything else the Variables tab sets on it). */
export function addVariable(p: Project, kind: 'counter' | 'switch' | 'text' | 'list' | 'score', name: string, patch: Partial<Variable> = {}): Variable {
  const k = VARIABLE_KINDS.find((x) => x.id === kind)!;
  const v = variableFor(k, p.variables.map((x) => x.name));
  v.name = name;
  Object.assign(v, patch);
  p.variables.push(v);
  return v;
}

export const varByName = (p: Project, name: string): Variable => {
  const v = p.variables.find((x) => x.name === name);
  if (!v) throw new Error(`no variable called ${name}`);
  return v;
};

/** A layer the way its tool draws it, with the settings the steps change. */
export function layer<T extends NodeType>(type: T, name: string, x: number, y: number, width: number, height: number, more: Record<string, unknown> = {}): Extract<SceneNode, { type: T }> {
  return createNode(type, { name, x, y, width, height, ...more } as never);
}

/** A text layer, coloured with the project's text token. */
export function words(p: Project, name: string, text: string, x: number, y: number, width: number, more: Record<string, unknown> = {}) {
  const fontSize = (more.fontSize as number) ?? 16;
  const lines = Math.max(1, Math.ceil((text.length * fontSize * 0.5) / width));
  return layer('text', name, x, y, width, Math.ceil(lines * fontSize * 1.35), { text, color: look(p).text, ...more });
}

/** A button from the Button tool, in the project's button colours. */
export function button(p: Project, name: string, label: string, x: number, y: number, width = 200, height = 48) {
  const L = look(p);
  return layer('button', name, x, y, width, height, { label, fill: { type: 'solid', color: L.button }, color: L.onButton });
}

/**
 * + When clicked… on a layer: the action one recipe of src/lib/recipes.ts writes, joined after a When clicked or hovered, as the
 * dialog writes it (recipes.ts itself can't be loaded outside a browser). `counter` takes a variable or `new:name`, which makes a
 * number starting at 0 as the dialog's "A new counter…" does. Returns the action node.
 */
export function whenClicked(p: Project, ab: Artboard, target: SceneNode, recipe: 'counter' | 'start-over' | 'page-pick' | 'page-next' | 'animation', answer = ''): LogicNode {
  let kind: string;
  let params: Record<string, unknown>;
  if (recipe === 'counter') {
    let id = answer;
    if (answer.startsWith('new:')) {
      const v: Variable = { id: uid('v'), name: answer.slice(4), type: 'number', initial: 0 };
      p.variables.push(v);
      id = v.id;
    }
    kind = 'action.setVariable';
    params = { variable: id, op: 'add', value: '1' };
  } else if (recipe === 'start-over') {
    kind = 'action.startOver';
    params = {};
  } else if (recipe === 'animation') {
    kind = 'action.timeline';
    params = { timeline: answer, op: 'play' };
  } else {
    kind = 'action.artboard';
    params = { ...(recipe === 'page-next' ? { to: 'next' } : { to: 'picked', artboard: answer }), transition: 'fade', duration: DEFAULT_TRANSITION_MS };
  }
  return writeFlow(ab, { kind: 'event.pointer', params: { target: target.id, type: 'click' } }, [{ kind, params }]).steps[0];
}

/** + On click (empty): a When clicked or hovered with nothing after it, and its Only if when one is given. */
export function emptyClick(ab: Artboard, target: SceneNode, onlyIf?: string): LogicNode {
  return writeFlow(ab, { kind: 'event.pointer', params: { target: target.id, type: 'click', ...(onlyIf ? { onlyIf } : {}) } }, []).event;
}

/** An event dropped from the palette onto an empty part of the graph. */
export function event(ab: Artboard, kind: string, params: Record<string, unknown> = {}): LogicNode {
  return writeFlow(ab, { kind, params }, []).event;
}

/** A node dragged off `prev`'s output (or a named one, such as an If's true or false) into empty space, and set up. */
export function after(ab: Artboard, prev: LogicNode, kind: string, params: Record<string, unknown> = {}, port = 'out'): LogicNode {
  if (port === 'out') return appendStep(ab, prev, { kind, params });
  const node: LogicNode = { id: uid('lg'), kind, x: prev.x + 260, y: prev.y + 140, params: { ...defaultParams(kind), ...params } };
  ab.logic.nodes.push(node);
  ab.logic.edges.push({ id: uid('e'), from: prev.id, fromPort: port, to: node.id, toPort: 'in' });
  return node;
}

/** Steps one after another from `from`; returns the last. */
export function chain(ab: Artboard, from: LogicNode, ...steps: [string, Record<string, unknown>][]): LogicNode {
  return steps.reduce((prev, [kind, params]) => after(ab, prev, kind, params), from);
}

/** A string as an expression. */
export const q = (s: string) => JSON.stringify(s);
