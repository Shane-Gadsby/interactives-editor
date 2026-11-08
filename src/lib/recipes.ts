import { defaultParams, uid, walk, type Artboard, type LogicEdge, type LogicNode, type Project, type Variable } from 'interactives-player';
import { assetKind } from './assets';
import { buildFlow, flowSentence } from './flow-describe';
import { writeClickFlow } from './click-flow';
import { uniqueIdentifier } from '../store/doc';

/**
 * Behaviour recipes: "When this is clicked, go to the next page / show a layer / play a sound / add 1 to a counter". Each one
 * writes ordinary nodes (an On pointer event and an action, joined) plus any variable it needs, and nothing else: no hidden node
 * kinds, so the graph stays the one place the truth lives and a recipe's result can be taken further there. `buildBehaviour` is
 * pure (it returns what to write); `applyBehaviour` writes it as one undo step.
 */

export type Trigger = 'click' | 'pointerenter';

export const TRIGGER_WORDS: Record<Trigger, string> = { click: 'clicked', pointerenter: 'hovered over' };

export type NeedKind = 'layer' | 'page' | 'timeline' | 'sound' | 'link' | 'counter' | 'switch';

export interface Need {
  key: string;
  kind: NeedKind;
  label: string;
}

export interface RecipeCtx {
  project: Project;
  ab: Artboard;
  /** The layer the behaviour is for (the one that is clicked). */
  layerId: string;
}

/** What a person chose, by need: a layer, page, timeline or sound id, the text of a link, or a variable id or `new:Name`. */
export type Answers = Record<string, string>;

export interface Recipe {
  id: string;
  /** Short and plain: how it reads in the list. */
  label: string;
  /** One line under it. */
  hint: string;
  group: 'Pages' | 'Layers' | 'Motion and sound' | 'Counting and switches' | 'Other';
  needs: Need[];
  /** The action node to write: its kind and settings. */
  action(a: Answers, ctx: RecipeCtx): { kind: string; params: Record<string, unknown> };
}

export const THIS_LAYER = '__self__';

const first = <T,>(xs: T[]): T | undefined => xs[0];

export const RECIPES: Recipe[] = [
  {
    id: 'page-next',
    label: 'Go to the next page',
    hint: 'Moves on to the page after this one.',
    group: 'Pages',
    needs: [],
    action: () => ({ kind: 'action.artboard', params: { ...defaultParams('action.artboard'), to: 'next' } }),
  },
  {
    id: 'page-previous',
    label: 'Go to the previous page',
    hint: 'Goes back one page.',
    group: 'Pages',
    needs: [],
    action: () => ({ kind: 'action.artboard', params: { ...defaultParams('action.artboard'), to: 'previous' } }),
  },
  {
    id: 'page-pick',
    label: 'Go to a page…',
    hint: 'Jumps to the page you choose.',
    group: 'Pages',
    needs: [{ key: 'page', kind: 'page', label: 'Which page' }],
    action: (a) => ({ kind: 'action.artboard', params: { ...defaultParams('action.artboard'), to: 'picked', artboard: a.page ?? '' } }),
  },
  {
    id: 'show',
    label: 'Show a layer',
    hint: 'Makes a hidden layer appear. A layer other than this one starts hidden.',
    group: 'Layers',
    needs: [{ key: 'layer', kind: 'layer', label: 'Which layer' }],
    action: (a, ctx) => ({ kind: 'action.visibility', params: { ...defaultParams('action.visibility'), target: layerOf(a, ctx), op: 'show' } }),
  },
  {
    id: 'hide',
    label: 'Hide a layer',
    hint: 'Makes a layer disappear.',
    group: 'Layers',
    needs: [{ key: 'layer', kind: 'layer', label: 'Which layer' }],
    action: (a, ctx) => ({ kind: 'action.visibility', params: { ...defaultParams('action.visibility'), target: layerOf(a, ctx), op: 'hide' } }),
  },
  {
    id: 'toggle',
    label: 'Show or hide a layer',
    hint: 'Each time: shows it if it is hidden, hides it if it is showing.',
    group: 'Layers',
    needs: [{ key: 'layer', kind: 'layer', label: 'Which layer' }],
    action: (a, ctx) => ({ kind: 'action.visibility', params: { ...defaultParams('action.visibility'), target: layerOf(a, ctx), op: 'toggle' } }),
  },
  {
    id: 'view-layer',
    label: 'Move the view to a layer…',
    hint: 'Pans and zooms the page to frame a layer. The page master stays put.',
    group: 'Layers',
    needs: [{ key: 'layer', kind: 'layer', label: 'Which layer' }],
    action: (a, ctx) => ({ kind: 'action.moveView', params: { ...defaultParams('action.moveView'), to: 'layer', target: layerOf(a, ctx) } }),
  },
  {
    id: 'view-page',
    label: 'Show the whole page again',
    hint: 'Pans and zooms back out after the view was moved to a layer.',
    group: 'Layers',
    needs: [],
    action: () => ({ kind: 'action.moveView', params: { ...defaultParams('action.moveView'), to: 'page' } }),
  },
  {
    id: 'animation',
    label: 'Play an animation',
    hint: 'Plays one of this page’s timelines.',
    group: 'Motion and sound',
    needs: [{ key: 'timeline', kind: 'timeline', label: 'Which animation' }],
    action: (a) => ({ kind: 'action.timeline', params: { ...defaultParams('action.timeline'), timeline: a.timeline ?? '', op: 'play' } }),
  },
  {
    id: 'sound',
    label: 'Play a sound',
    hint: 'Plays a sound file once.',
    group: 'Motion and sound',
    needs: [{ key: 'sound', kind: 'sound', label: 'Which sound' }],
    action: (a) => ({ kind: 'action.sound', params: { ...defaultParams('action.sound'), asset: a.sound ?? '' } }),
  },
  {
    id: 'counter',
    label: 'Add 1 to a counter',
    hint: 'Counts how many times it happens, in a number you can show or test.',
    group: 'Counting and switches',
    needs: [{ key: 'counter', kind: 'counter', label: 'Which counter' }],
    action: (a) => ({ kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.counter ?? '', op: 'add', value: '1' } }),
  },
  {
    id: 'switch',
    label: 'Switch something on or off',
    hint: 'Flips a yes/no setting each time, such as sound on or off.',
    group: 'Counting and switches',
    needs: [{ key: 'switch', kind: 'switch', label: 'Which switch' }],
    action: (a) => ({ kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.switch ?? '', op: 'toggle', value: '' } }),
  },
  {
    id: 'link',
    label: 'Open a link',
    hint: 'Opens a web address in a new tab.',
    group: 'Other',
    needs: [{ key: 'link', kind: 'link', label: 'Web address' }],
    action: (a) => ({ kind: 'action.url', params: { ...defaultParams('action.url'), url: JSON.stringify(a.link ?? ''), target: '_blank' } }),
  },
  {
    id: 'start-over',
    label: 'Start over',
    hint: 'Clears everything the learner did and goes back to the first page.',
    group: 'Other',
    needs: [],
    action: () => ({ kind: 'action.startOver', params: { ...defaultParams('action.startOver') } }),
  },
];

export const RECIPE_BY_ID: Record<string, Recipe> = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

const layerOf = (a: Answers, ctx: RecipeCtx): string => (!a.layer || a.layer === THIS_LAYER ? ctx.layerId : a.layer);

// ---------------------------------------------------------------- choices

/** Layers on the artboard to pick from, nested ones indented with their parents' order. */
export function layerChoices(ab: Artboard): { id: string; name: string; hidden: boolean }[] {
  const out: { id: string; name: string; hidden: boolean }[] = [];
  walk(ab.children, (n) => void out.push({ id: n.id, name: n.name, hidden: n.visible === false }));
  return out;
}

/** The pages other than the one being edited. */
export const otherPages = (ctx: RecipeCtx) => ctx.project.artboards.filter((a) => a.id !== ctx.ab.id);

export const audioAssets = (project: Project) => project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio');

/** Number variables a counter can be (not live ones, which cannot be set). */
export const counterChoices = (project: Project): Variable[] => project.variables.filter((v) => v.type === 'number' && !v.live && !v.formula);

/** On or off variables a switch can be. */
export const switchChoices = (project: Project): Variable[] => project.variables.filter((v) => v.type === 'boolean' && !v.live && !v.formula);

export const NEW_PREFIX = 'new:';
const NEW_NAME: Record<'counter' | 'switch', string> = { counter: 'count', switch: 'isOn' };

/** Why a recipe cannot be added here, or null when it can. */
export function unavailable(recipe: Recipe, ctx: RecipeCtx): string | null {
  if (recipe.id === 'page-pick' && !otherPages(ctx).length) return 'There is no other page to go to yet.';
  if (recipe.id === 'animation' && !ctx.ab.timelines.length) return 'This page has no timelines yet. Make one in the Timeline tab first.';
  return null;
}

/** What each need starts as, so the common case is one click: this layer, the next page, the first sound, a new counter. */
export function defaultAnswers(recipe: Recipe, ctx: RecipeCtx): Answers {
  const out: Answers = {};
  for (const n of recipe.needs) {
    if (n.kind === 'layer') {
      // showing something: the likeliest layer is one that is hidden already; toggling: one other than this; hiding: this one
      const others = layerChoices(ctx.ab).filter((l) => l.id !== ctx.layerId);
      const pick = recipe.id === 'show' ? (others.find((l) => l.hidden) ?? others[0]) : recipe.id === 'toggle' || recipe.id === 'view-layer' ? others[0] : undefined;
      out[n.key] = pick?.id ?? THIS_LAYER;
    } else if (n.kind === 'page') out[n.key] = first(otherPages(ctx))?.id ?? '';
    else if (n.kind === 'timeline') out[n.key] = first(ctx.ab.timelines)?.id ?? '';
    else if (n.kind === 'sound') out[n.key] = first(audioAssets(ctx.project))?.id ?? '';
    else if (n.kind === 'counter') out[n.key] = first(counterChoices(ctx.project))?.id ?? NEW_PREFIX + NEW_NAME.counter;
    else if (n.kind === 'switch') out[n.key] = first(switchChoices(ctx.project))?.id ?? NEW_PREFIX + NEW_NAME.switch;
    else out[n.key] = '';
  }
  return out;
}

/** Why the answers are not enough yet (the Add button says so), or null. */
export function incomplete(recipe: Recipe, a: Answers): string | null {
  for (const n of recipe.needs) {
    const v = (a[n.key] ?? '').trim();
    if (!v) return `Choose ${n.label.toLowerCase()}.`;
    if ((n.kind === 'counter' || n.kind === 'switch') && v.startsWith(NEW_PREFIX) && !v.slice(NEW_PREFIX.length).trim()) return `Name the ${n.kind}.`;
    if (n.kind === 'link' && !/^(https?:\/\/|mailto:|\/)/i.test(v)) return 'A web address starts with https://';
  }
  return null;
}

// ---------------------------------------------------------------- building

export interface Behaviour {
  nodes: LogicNode[];
  edges: LogicEdge[];
  /** Variables the behaviour needs that did not exist yet. */
  variables: Variable[];
  /** Layer settings to change as part of it (the thing a show recipe reveals starts hidden). */
  patches: { id: string; props: Record<string, unknown> }[];
  eventId: string;
  actionId: string;
  /** What it will do, as the Inspector will say it. */
  sentence: string;
}

const identifier = (raw: string, taken: string[], fallback: string): string => uniqueIdentifier(taken, raw.trim().replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || fallback);

/**
 * The nodes (and variable, and layer setting) for one recipe on one layer. Nothing is written: `applyBehaviour` does that, in one
 * undo step. `makeId` is for the ids of new variables (a test can then have predictable ones); the nodes come from the shared click-flow writer.
 */
export function buildBehaviour(ctx: RecipeCtx, recipeId: string, trigger: Trigger, answers: Answers, makeId: (prefix: string) => string = uid): Behaviour {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) throw new Error(`No behaviour called ${recipeId}`);
  const a: Answers = { ...answers };
  const variables: Variable[] = [];
  const taken = ctx.project.variables.map((v) => v.name);
  for (const n of recipe.needs) {
    if ((n.kind === 'counter' || n.kind === 'switch') && (a[n.key] ?? '').startsWith(NEW_PREFIX)) {
      const name = identifier(a[n.key].slice(NEW_PREFIX.length), taken, NEW_NAME[n.kind]);
      taken.push(name);
      const v: Variable = { id: makeId('v'), name, type: n.kind === 'counter' ? 'number' : 'boolean', initial: n.kind === 'counter' ? 0 : false };
      variables.push(v);
      a[n.key] = v.id;
    }
  }
  const act = recipe.action(a, ctx);
  // written onto a scratch copy of the graph by the shared click-flow writer, so the nodes land where a real write would put them
  const scratch = { logic: { nodes: [...ctx.ab.logic.nodes], edges: [] as LogicEdge[] } };
  const { event, steps } = writeClickFlow(scratch, ctx.layerId, [{ kind: act.kind, params: act.params }], trigger);
  const action = steps[0];
  const edges = scratch.logic.edges;
  const patches: Behaviour['patches'] = [];
  // showing another layer: it has to be hidden to begin with, or there is nothing to show
  if (recipe.id === 'show') {
    const target = layerOf(a, ctx);
    const layer = layerChoices(ctx.ab).find((l) => l.id === target);
    if (layer && target !== ctx.layerId && !layer.hidden) patches.push({ id: target, props: { visible: false } });
  }
  const shown: Artboard = { ...ctx.ab, logic: { ...ctx.ab.logic, nodes: [event, action], edges } };
  const project: Project = { ...ctx.project, variables: [...ctx.project.variables, ...variables] };
  return { nodes: [event, action], edges, variables, patches, eventId: event.id, actionId: action.id, sentence: flowSentence(buildFlow(event, { ab: shown, project, self: ctx.layerId })) };
}

/** Write a behaviour into the artboard: its nodes, edges, variables and layer settings, all in the one `update` (one undo step). */
export function applyBehaviour(update: (recipe: (d: Project) => void) => void, abId: string, b: Behaviour): void {
  update((d) => {
    const ab = d.artboards.find((x) => x.id === abId);
    if (!ab) return;
    for (const v of b.variables) d.variables.push(v);
    ab.logic.nodes.push(...b.nodes);
    ab.logic.edges.push(...b.edges);
    for (const p of b.patches) {
      walk(ab.children, (n) => {
        if (n.id === p.id) Object.assign(n, p.props);
      });
    }
  });
}
