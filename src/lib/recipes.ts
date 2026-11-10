import { defaultParams, DEFAULT_TRANSITION_MS, isPageTransition, uid, walk, type Artboard, type LogicEdge, type LogicNode, type Project, type Script, type Variable } from 'interactives-player';
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

export type NeedKind = 'layer' | 'page' | 'timeline' | 'sound' | 'link' | 'counter' | 'switch' | 'transition' | 'speed' | 'video' | 'seconds' | 'script';

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

/** How the page changes: asked for by the page recipes, and always optional (the usual fade when left alone). */
const HOW: Need = { key: 'transition', kind: 'transition', label: 'How the page changes' };
/** How long it takes: asked with the look, and only when there is a look to time (Instant has no length). Answered in ms. */
const SPEED: Need = { key: 'speed', kind: 'speed', label: 'Speed' };
const pageParams = (a: Answers, to: Record<string, unknown>) => ({
  ...defaultParams('action.artboard'),
  ...to,
  ...(isPageTransition(a.transition ?? '') ? { transition: a.transition } : {}),
  ...((a.speed ?? '').trim() !== '' && Number.isFinite(Number(a.speed)) && Number(a.speed) >= 0 ? { duration: Number(a.speed) } : {}),
});

export const RECIPES: Recipe[] = [
  {
    id: 'page-next',
    label: 'Go to the next page',
    hint: 'Moves on to the page after this one.',
    group: 'Pages',
    needs: [HOW, SPEED],
    action: (a) => ({ kind: 'action.artboard', params: pageParams(a, { to: 'next' }) }),
  },
  {
    id: 'page-previous',
    label: 'Go to the previous page',
    hint: 'Goes back one page.',
    group: 'Pages',
    needs: [HOW, SPEED],
    action: (a) => ({ kind: 'action.artboard', params: pageParams(a, { to: 'previous' }) }),
  },
  {
    id: 'page-pick',
    label: 'Go to a page…',
    hint: 'Jumps to the page you choose.',
    group: 'Pages',
    needs: [{ key: 'page', kind: 'page', label: 'Which page' }, HOW, SPEED],
    action: (a) => ({ kind: 'action.artboard', params: pageParams(a, { to: 'picked', artboard: a.page ?? '' }) }),
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
    id: 'soundtrack',
    label: 'Play music that carries on across pages',
    hint: 'The soundtrack: it keeps playing when the page changes, goes quiet under narration, and stops at Stop the music.',
    group: 'Motion and sound',
    needs: [{ key: 'sound', kind: 'sound', label: 'Which music' }],
    action: (a) => ({ kind: 'action.sound', params: { ...defaultParams('action.sound'), asset: a.sound ?? '', loop: 'true', soundtrack: true } }),
  },
  {
    id: 'soundtrack-stop',
    label: 'Stop the music',
    hint: 'Fades the soundtrack out. Other sounds stop too.',
    group: 'Motion and sound',
    needs: [],
    action: () => ({ kind: 'action.stopSound', params: { ...defaultParams('action.stopSound') } }),
  },
  {
    id: 'sound-toggle',
    label: 'Turn the sound off or on',
    hint: 'Mutes every sound and video, or brings the sound back. The viewer\'s browser remembers the choice.',
    group: 'Motion and sound',
    needs: [],
    action: () => ({ kind: 'action.captions', params: { ...defaultParams('action.captions'), op: 'soundToggle' } }),
  },
  {
    id: 'video-toggle',
    label: 'Play or pause a video',
    hint: 'Plays the video if it is paused, pauses it if it is playing.',
    group: 'Motion and sound',
    needs: [{ key: 'video', kind: 'video', label: 'Which video' }],
    action: (a, ctx) => ({ kind: 'action.video', params: { ...defaultParams('action.video'), target: videoOf(a, ctx), op: 'toggle' } }),
  },
  {
    id: 'video-seek',
    label: 'Jump a video to a time…',
    hint: 'Goes to a moment in the video, like a chapter button.',
    group: 'Motion and sound',
    needs: [{ key: 'video', kind: 'video', label: 'Which video' }, { key: 'seconds', kind: 'seconds', label: 'Seconds in' }],
    action: (a, ctx) => ({ kind: 'action.video', params: { ...defaultParams('action.video'), target: videoOf(a, ctx), op: 'seek', seconds: String(a.seconds ?? '0').trim() || '0' } }),
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
    id: 'script',
    label: 'Run a script',
    hint: 'Runs one of the project\'s scripts, or a new one to write in the Scripts tab. event says what was clicked.',
    group: 'Other',
    needs: [{ key: 'script', kind: 'script', label: 'Which script' }],
    action: (a) => ({ kind: 'action.script', params: { ...defaultParams('action.script'), script: a.script ?? '' } }),
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
const videoOf = (a: Answers, ctx: RecipeCtx): string => (!a.video || a.video === THIS_LAYER ? ctx.layerId : a.video);

/** Video layers on the page, to pick which one a button controls. */
export function videoChoices(ab: Artboard): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  walk(ab.children, (n) => void (n.type === 'video' && out.push({ id: n.id, name: n.name })));
  return out;
}

//What a new script made by Run a script starts as
export const CLICK_SCRIPT = `// Runs when the layer is clicked. event says what happened, ix is the player.\nix.log('clicked', event);\n`;

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
  if (recipe.needs.some((n) => n.kind === 'video') && !videoChoices(ctx.ab).length) return 'This page has no video layer yet. Add one with the Video tool (Web, in the tool bar) first.';
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
    else if (n.kind === 'transition') out[n.key] = 'fade';
    else if (n.kind === 'speed') out[n.key] = String(DEFAULT_TRANSITION_MS);
    else if (n.kind === 'video') out[n.key] = videoChoices(ctx.ab).some((v) => v.id === ctx.layerId) ? THIS_LAYER : (first(videoChoices(ctx.ab))?.id ?? '');
    else if (n.kind === 'seconds') out[n.key] = '0';
    else if (n.kind === 'script') out[n.key] = first(ctx.project.scripts.filter((x) => !x.runOnStart))?.id ?? NEW_PREFIX + 'onClick';
    else out[n.key] = '';
  }
  return out;
}

/** Why the answers are not enough yet (the Add button says so), or null. */
export function incomplete(recipe: Recipe, a: Answers): string | null {
  for (const n of recipe.needs) {
    const v = (a[n.key] ?? '').trim();
    if (n.kind === 'transition' || n.kind === 'speed') continue;
    if (!v) return `Choose ${n.label.toLowerCase()}.`;
    if ((n.kind === 'counter' || n.kind === 'switch' || n.kind === 'script') && v.startsWith(NEW_PREFIX) && !v.slice(NEW_PREFIX.length).trim()) return `Name the ${n.kind}.`;
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
  /** A script made for it (Run a script with a new one). */
  scripts: Script[];
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
  const scripts: Script[] = [];
  for (const n of recipe.needs) {
    if (n.kind === 'script' && (a[n.key] ?? '').startsWith(NEW_PREFIX)) {
      const names = ctx.project.scripts.map((x) => x.name);
      const name = uniqueIdentifier(names, a[n.key].slice(NEW_PREFIX.length).trim() || 'onClick');
      const sc: Script = { id: makeId('sc'), name, code: CLICK_SCRIPT, runOnStart: false };
      scripts.push(sc);
      a[n.key] = sc.id;
      continue;
    }
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
  const project: Project = { ...ctx.project, variables: [...ctx.project.variables, ...variables], scripts: [...ctx.project.scripts, ...scripts] };
  return { nodes: [event, action], edges, variables, scripts, patches, eventId: event.id, actionId: action.id, sentence: flowSentence(buildFlow(event, { ab: shown, project, self: ctx.layerId })) };
}

/** What `applyBehaviour` made, so the graph knows what to frame. */
export interface BehaviourWritten {
  /** Every node written, event first. Empty when the page was gone. */
  nodeIds: string[];
  eventId: string;
  actionId: string;
  /** Variables created for it (a new counter or switch). */
  variableIds: string[];
}

/** Write a behaviour into the artboard: its nodes, edges, variables and layer settings, all in the one `update` (one undo step). Says what it wrote. */
export function applyBehaviour(update: (recipe: (d: Project) => void) => void, abId: string, b: Behaviour): BehaviourWritten {
  let wrote = false;
  update((d) => {
    const ab = d.artboards.find((x) => x.id === abId);
    if (!ab) return;
    wrote = true;
    for (const v of b.variables) d.variables.push(v);
    for (const sc of b.scripts ?? []) d.scripts.push(sc);
    ab.logic.nodes.push(...b.nodes);
    ab.logic.edges.push(...b.edges);
    for (const p of b.patches) {
      walk(ab.children, (n) => {
        if (n.id === p.id) Object.assign(n, p.props);
      });
    }
  });
  return { nodeIds: wrote ? b.nodes.map((n) => n.id) : [], eventId: b.eventId, actionId: b.actionId, variableIds: wrote ? b.variables.map((v) => v.id) : [] };
}
