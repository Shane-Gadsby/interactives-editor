import { varName, walk, type Artboard, type Dialog, type Project, type Question, type SceneNode, type Variable } from 'interactives-player';
import type { FlowStep } from './click-flow';
import { uniqueIdentifier } from '../store/doc';

/**
 * "When all of these are done" and "how many are done". Pick some layers and what counts as done (clicked, opened, answered) and this
 * works out the ordinary pieces that do it: a list variable each layer adds itself to once, a live number for how many are in it, a
 * number for how many there are, and for each layer an On pointer click (or On variable change) that adds it. The When all of these are
 * done event is then an On variable change on the list with an Only if that every layer is in it. Nothing here is hidden: it is all in
 * the graph and the Variables tab, named for what it counts, and the author can take any of it further there.
 */

export type DoneHow = 'click' | 'opened' | 'answered';

export const DONE_HOWS: { value: DoneHow; label: string }[] = [
  { value: 'click', label: 'clicked' },
  { value: 'opened', label: 'opened (a pop-up or dialog layer)' },
  { value: 'answered', label: 'answered (a question)' },
];

export const doneHowOf = (v: string | undefined): DoneHow => (v === 'opened' || v === 'answered' ? v : 'click');

/** The variable that says a layer is done, for the ways that have one: a question's answered, a dialog's open value. */
function doneVariable(project: Project, node: SceneNode, how: DoneHow): Variable | undefined {
  const layer = node as { question?: Question | null; dialog?: Dialog | null };
  if (how === 'answered') return layer.question ? project.variables.find((v) => v.name === varName(layer.question!, 'answered')) : undefined;
  if (how === 'opened') {
    const id = layer.dialog?.openVariable;
    return id ? project.variables.find((v) => v.id === id) : undefined;
  }
  return undefined;
}

/** The layers that can be counted as done in this way: any layer for clicked, a question for answered, a dialog with an open value for opened. */
export function doneLayers(ab: Artboard, project: Project, how: DoneHow): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  walk(ab.children, (n) => void ((how === 'click' || doneVariable(project, n, how)) && out.push({ id: n.id, name: n.name })));
  return out;
}

export interface DoneTracker {
  event: { kind: string; params: Record<string, unknown> };
  steps: FlowStep[];
}

export interface DoneKit {
  /** The new variables: the list, how many are in it, how many there are. */
  variables: Variable[];
  /** What each layer does to be counted: when it happens, add it to the list (once). */
  trackers: DoneTracker[];
  /** The When all of these are done event: On variable change on the list, only if every layer is in it. */
  all: { kind: string; params: Record<string, unknown>; onlyIf: string };
  /** What it is, in words, for the preview. */
  sentence: string;
  list: Variable;
  count: Variable;
}

const word = (how: DoneHow) => (how === 'click' ? 'clicked' : how === 'opened' ? 'opened' : 'answered');

/** The name a new variable gets from what the person typed: letters, digits and _, not starting with a digit, and not one that is taken. */
function nameFor(raw: string, taken: string[], fallback: string): string {
  const name = uniqueIdentifier(taken, raw.trim().replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || fallback);
  taken.push(name);
  return name;
}

/**
 * The pieces for counting these layers as done. `taken` is the variable names already used (the new names are added to it). Throws
 * when no layer can be counted in this way (the dialog says so before it gets here).
 */
export function buildDone(ab: Artboard, project: Project, how: DoneHow, layerIds: string[], rawName: string, makeId: (prefix: string) => string, taken: string[]): DoneKit {
  const ok = new Map(doneLayers(ab, project, how).map((l) => [l.id, l.name]));
  const picked = layerIds.filter((id) => ok.has(id));
  if (!picked.length) throw new Error('No layer to count');
  const name = nameFor(rawName, taken, 'explored');
  const countName = nameFor(`${name}Count`, taken, 'doneCount');
  const totalName = nameFor(`${name}Total`, taken, 'doneTotal');
  const list: Variable = { id: makeId('v'), name, type: 'list', initial: '[]' };
  const count: Variable = { id: makeId('v'), name: countName, type: 'number', initial: 0, formula: `${name}.length`, live: true };
  const total: Variable = { id: makeId('v'), name: totalName, type: 'number', initial: picked.length, formula: String(picked.length) };
  //what goes in the list is the layer's name, so the graph reads (and a second layer with the same name is told apart)
  const seen = new Set<string>();
  const keys = picked.map((id) => {
    const base = ok.get(id) || 'Layer';
    let key = base;
    for (let i = 2; seen.has(key); i++) key = `${base} ${i}`;
    seen.add(key);
    return key;
  });
  const layers = new Map<string, SceneNode>();
  walk(ab.children, (n) => void layers.set(n.id, n));
  const add: FlowStep = { kind: 'action.setVariable', params: { variable: list.id, op: 'push' } };
  const trackers: DoneTracker[] = picked.map((id, i) => {
    const layer = layers.get(id)!;
    const notYet = `!includesAll(${name}, [${JSON.stringify(keys[i])}])`;
    const step: FlowStep = { ...add, params: { ...add.params, value: JSON.stringify(keys[i]) } };
    if (how === 'click') return { event: { kind: 'event.pointer', params: { target: id, type: 'click', onlyIf: notYet } }, steps: [step] };
    const v = doneVariable(project, layer, how)!;
    return { event: { kind: 'event.variable', params: { variable: v.id, onlyIf: `${v.name} && ${notYet}` } }, steps: [step] };
  });
  const every = `includesAll(${name}, [${keys.map((k) => JSON.stringify(k)).join(', ')}])`;
  return {
    variables: [list, count, total],
    trackers,
    all: { kind: 'event.variable', params: { variable: list.id }, onlyIf: every },
    sentence: `count each of ${picked.length} layers once it is ${word(how)}, in ${name} (${countName} says how many, out of ${totalName})`,
    list,
    count,
  };
}
