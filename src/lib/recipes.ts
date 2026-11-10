import { nameFromWords } from './friendly-names';
import { defaultParams, DEFAULT_TRANSITION_MS, isPageTransition, uid, walk, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type Script, type Variable } from 'interactives-player';
import { assetKind } from './assets';
import { buildFlow, flowSentence } from './flow-describe';
import { writeBranchFlow, writeFlow, type FlowStep } from './click-flow';
import { conditionToExpr, opTakesValue, rowToExpr, type CondOp } from './condition';
import { uniqueIdentifier } from '../store/doc';
import { buildDone, doneHowOf, doneLayers, type DoneKit } from './all-done';

/**
 * Behaviour recipes: "When this is clicked, go to the next page / show a layer / play a sound / change a number". Each one
 * writes ordinary nodes (an event and one or more actions, joined, with an Only if or a Check a condition when asked) plus any
 * variable it needs, and nothing else: no hidden node kinds, so the graph stays the one place the truth lives and a recipe's
 * result can be taken further there. `buildBehaviour` is pure (it returns what to write); `applyBehaviour` writes it as one undo step.
 */

/** What starts it. Clicked and hovered over are the layer's own; the rest are the events the graph already has. */
export type Trigger = 'click' | 'pointerenter' | 'start' | 'timer' | 'value' | 'drop' | 'key' | 'video' | 'all';

export const TRIGGER_WORDS: Record<Trigger, string> = { click: 'clicked', pointerenter: 'hovered over', start: 'shown', timer: 'timed', value: 'reached', drop: 'dropped', key: 'pressed', video: 'reached', all: 'done' };

export type NeedKind =
  | 'layer'
  | 'page'
  | 'timeline'
  | 'sound'
  | 'link'
  | 'counter'
  | 'switch'
  | 'transition'
  | 'speed'
  | 'video'
  | 'seconds'
  | 'script'
  | 'room'
  // changing a number
  | 'numhow'
  | 'switchhow'
  | 'amount'
  // going round a range (carousels, slideshows)
  | 'startat'
  | 'last'
  | 'ends'
  // text and choices
  | 'textvar'
  | 'textvalue'
  | 'words'
  // a layer's look
  | 'lookwhat'
  | 'colour'
  | 'percent'
  | 'size'
  // sets of things
  | 'layerset'
  | 'varset'
  // triggers
  | 'delay'
  | 'watch'
  | 'reachop'
  | 'reachto'
  | 'zone'
  | 'key'
  | 'cuetime'
  // counting what is done
  | 'doneset'
  | 'donehow'
  | 'donename';

export interface Need {
  key: string;
  kind: NeedKind;
  label: string;
  /** The name a new variable gets when this need makes one (counter: count, switch: isOn). */
  newName?: string;
  /** Only asked for while this holds of the answers so far (the look recipe asks for a colour or a size, not both). */
  when?: (a: Answers) => boolean;
  /** An empty answer is fine. */
  optional?: boolean;
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
  action?(a: Answers, ctx: RecipeCtx): { kind: string; params: Record<string, unknown> };
  /** Several nodes in a row, for the recipes that are more than one step (Show only one of a set, a look with two sizes). */
  steps?(a: Answers, ctx: RecipeCtx): FlowStep[];
}

export const THIS_LAYER = '__self__';

const first = <T,>(xs: T[]): T | undefined => xs[0];

/** What "all of these are done" and "Count what is done" ask: which layers, what counts as done, and what to call the count. */
const DONE_NEEDS: Need[] = [
  { key: 'donehow', kind: 'donehow', label: 'Each counts as done when it is' },
  { key: 'doneset', kind: 'doneset', label: 'These layers' },
  { key: 'donename', kind: 'donename', label: 'Call the count' },
];

/** The optional Say it box on the recipes that change a value: words a screen reader says once it has changed, with {slots} for values. */
const SAY: Need = { key: 'say', kind: 'words', label: 'Say it (optional)', optional: true };
const sayParam = (a: Answers): Record<string, unknown> => ((a.say ?? '').trim() ? { say: a.say.trim() } : {});

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
    id: 'only-one',
    label: 'Show only one of a set…',
    hint: 'Shows one layer and hides the others you tick. Good for tabs: each tab shows its own panel and hides the rest.',
    group: 'Layers',
    needs: [
      { key: 'layer', kind: 'layer', label: 'Show' },
      { key: 'set', kind: 'layerset', label: 'Hide these' },
    ],
    steps: (a, ctx) => {
      const shown = layerOf(a, ctx);
      const hide = splitSet(a.set).filter((id) => id !== shown);
      return [...hide.map((id): FlowStep => ({ kind: 'action.visibility', params: { ...defaultParams('action.visibility'), target: id, op: 'hide' } })), { kind: 'action.visibility', params: { ...defaultParams('action.visibility'), target: shown, op: 'show' } }];
    },
  },
  {
    id: 'look',
    label: 'Change a layer’s look…',
    hint: 'Changes the colour, the text, how see-through or how big a layer is, with the same pickers as the Inspector.',
    group: 'Layers',
    needs: [
      { key: 'layer', kind: 'layer', label: 'Which layer' },
      { key: 'what', kind: 'lookwhat', label: 'Change its' },
      { key: 'colour', kind: 'colour', label: 'Colour', when: (a) => (a.what ?? 'colour') === 'colour' },
      { key: 'words', kind: 'words', label: 'Text', optional: true, when: (a) => a.what === 'text' },
      { key: 'percent', kind: 'percent', label: 'Opacity (%)', when: (a) => a.what === 'opacity' },
      { key: 'width', kind: 'size', label: 'Width (px)', optional: true, when: (a) => a.what === 'size' },
      { key: 'height', kind: 'size', label: 'Height (px)', optional: true, when: (a) => a.what === 'size' },
    ],
    steps: (a, ctx) => {
      const target = layerOf(a, ctx);
      const node = findLayer(ctx.ab, target);
      const set = (prop: string, value: string): FlowStep => ({ kind: 'action.setProperty', params: { ...defaultParams('action.setProperty'), target, prop, value } });
      switch (a.what ?? 'colour') {
        case 'text':
          return [set(node?.type === 'button' ? 'label' : 'text', JSON.stringify(a.words ?? ''))];
        case 'opacity':
          return [set('opacity', String(Math.round(Math.min(100, Math.max(0, Number(a.percent ?? '100'))) * 100) / 10000))];
        case 'size':
          return [...((a.width ?? '').trim() ? [set('width', String(Number(a.width)))] : []), ...((a.height ?? '').trim() ? [set('height', String(Number(a.height)))] : [])];
        default:
          return [set(node?.type === 'text' ? 'color' : 'fill.color', JSON.stringify(a.colour ?? '#000000'))];
      }
    },
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
    label: 'Change a number…',
    hint: 'Adds to a number, takes some off, or sets it to an amount: a score, a tally, how many times it happens. You can show it or test it.',
    group: 'Counting and switches',
    needs: [
      { key: 'counter', kind: 'counter', label: 'Which number' },
      { key: 'numhow', kind: 'numhow', label: 'What to do' },
      { key: 'amount', kind: 'amount', label: 'Amount' },
      SAY,
    ],
    action: (a) => {
      const how = a.numhow ?? 'add';
      const amount = (a.amount ?? '1').trim() || '1';
      const value = how === 'subtract' ? (/^\d+(\.\d+)?$/.test(amount) ? `-${amount}` : `-(${amount})`) : amount;
      return { kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.counter ?? '', op: how === 'set' ? 'set' : 'add', value, ...sayParam(a) } };
    },
  },
  {
    id: 'item-next',
    label: 'Go to the next item…',
    hint: 'Moves a number on by one, for a slideshow or carousel. Goes back to the start after the last, or stops there.',
    group: 'Counting and switches',
    needs: [
      { key: 'counter', kind: 'counter', label: 'Which number', newName: 'slide' },
      { key: 'startat', kind: 'startat', label: 'The first one is' },
      { key: 'last', kind: 'last', label: 'How many items' },
      { key: 'ends', kind: 'ends', label: 'After the last' },
      SAY,
    ],
    action: (a, ctx) => ({ kind: 'action.setVariable', params: roundParams(a, ctx, 'next') }),
  },
  {
    id: 'item-previous',
    label: 'Go to the previous item…',
    hint: 'Moves a number back by one, for a slideshow or carousel. Goes round to the end from the first, or stops there.',
    group: 'Counting and switches',
    needs: [
      { key: 'counter', kind: 'counter', label: 'Which number', newName: 'slide' },
      { key: 'startat', kind: 'startat', label: 'The first one is' },
      { key: 'last', kind: 'last', label: 'How many items' },
      { key: 'ends', kind: 'ends', label: 'Before the first' },
      SAY,
    ],
    action: (a, ctx) => ({ kind: 'action.setVariable', params: roundParams(a, ctx, 'previous') }),
  },
  {
    id: 'text-set',
    label: 'Set a text or choice…',
    hint: 'Puts a piece of text in a variable, or picks one of its choices: the answer chosen, the current mode, a name.',
    group: 'Counting and switches',
    needs: [
      { key: 'textvar', kind: 'textvar', label: 'Which text or choice' },
      { key: 'textvalue', kind: 'textvalue', label: 'Set it to' },
    ],
    action: (a, ctx) => ({ kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.textvar ?? '', op: 'set', value: JSON.stringify(textValueOf(a, ctx)) } }),
  },
  {
    id: 'switch',
    label: 'Switch something on or off',
    hint: 'Flips a yes/no setting each time, such as sound on or off. Or turns it on, or off, every time.',
    group: 'Counting and switches',
    needs: [
      { key: 'switch', kind: 'switch', label: 'Which switch' },
      { key: 'how', kind: 'switchhow', label: 'What to do' },
      SAY,
    ],
    action: (a) => {
      const how = a.how ?? 'flip';
      return { kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.switch ?? '', ...(how === 'on' || how === 'off' ? { op: 'set', value: how === 'on' ? 'true' : 'false' } : { op: 'toggle', value: '' }), ...sayParam(a) } };
    },
  },
  {
    id: 'count-done',
    label: 'Count what has been done…',
    hint: 'Keeps count of which layers have been clicked, opened or answered, so you can show “3 of 5 explored” or use it in a condition. It writes a list the layers add themselves to, and numbers made from it.',
    group: 'Counting and switches',
    needs: DONE_NEEDS,
    //it is not something that happens when this layer is clicked: each layer you tick gets its own small flow, so there is no step to write here
    steps: () => [],
  },
  {
    id: 'reset',
    label: 'Put values back to the start…',
    hint: 'Puts the numbers, text and switches you tick back to what they were at the start. Nothing else changes.',
    group: 'Counting and switches',
    needs: [{ key: 'vars', kind: 'varset', label: 'Put these back' }],
    action: (a) => ({ kind: 'action.resetVariables', params: { ...defaultParams('action.resetVariables'), variables: splitSet(a.vars) } }),
  },
  {
    id: 'announce',
    label: 'Say something to screen readers',
    hint: 'A screen reader reads the message out. Nothing changes on screen. Good for “Correct” or “3 of 5 done”.',
    group: 'Other',
    needs: [{ key: 'words', kind: 'words', label: 'What to say' }],
    action: (a) => ({ kind: 'action.announce', params: { ...defaultParams('action.announce'), text: JSON.stringify(a.words ?? '') } }),
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
    id: 'room-send',
    label: 'Send a message to a room…',
    hint: 'Sends the text a person typed to everyone in the room, then empties the box. Add a Room in the Data tab first.',
    group: 'Other',
    needs: [
      { key: 'room', kind: 'room', label: 'Which room' },
      { key: 'textvar', kind: 'textvar', label: 'The text to send' },
    ],
    steps: (a, ctx) => {
      const typed = ctx.project.variables.find((v) => v.id === a.textvar);
      return [
        { kind: 'action.roomSend', params: { ...defaultParams('action.roomSend'), source: a.room ?? '', text: typed?.name ?? '' } },
        { kind: 'action.setVariable', params: { ...defaultParams('action.setVariable'), variable: a.textvar ?? '', op: 'set', value: JSON.stringify('') } },
      ];
    },
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

/** A set of layers or values is one answer: their ids, one after another with a bar between. */
export const SET_SEP = '|';
export const splitSet = (v: string | undefined): string[] => (v ?? '').split(SET_SEP).filter(Boolean);
export const joinSet = (ids: string[]): string => ids.join(SET_SEP);

export function findLayer(ab: Artboard, id: string): SceneNode | undefined {
  let found: SceneNode | undefined;
  walk(ab.children, (n) => void (n.id === id && (found = n)));
  return found;
}

/** The colour a layer has now, so the colour picker starts where the Inspector's would. */
export function currentColour(node: SceneNode | undefined): string {
  const n = node as unknown as { type?: string; color?: unknown; fill?: { color?: unknown } | null } | undefined;
  const c = n?.type === 'text' ? n.color : n?.fill?.color;
  return typeof c === 'string' && c ? c : n?.type === 'text' ? '#000000' : '#e0b200';
}

/** What the look recipe's colour starts as for a layer. */
export const lookColour = (ctx: RecipeCtx, layer: string): string => currentColour(findLayer(ctx.ab, !layer || layer === THIS_LAYER ? ctx.layerId : layer));

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

/** The project's Room data sources, for Send a message to a room. */
export const roomChoices = (project: Project) => project.dataSources.filter((d) => d.source === 'room');

export const audioAssets = (project: Project) => project.assets.filter((a) => assetKind(a.mime, a.name) === 'audio');

/** Number variables a counter can be (not live ones, which cannot be set). */
export const counterChoices = (project: Project): Variable[] => project.variables.filter((v) => v.type === 'number' && !v.live && !v.formula);

/** On or off variables a switch can be. */
export const switchChoices = (project: Project): Variable[] => project.variables.filter((v) => v.type === 'boolean' && !v.live && !v.formula);

/** Text and choice variables Set a text or choice can change. */
export const textChoices = (project: Project): Variable[] => project.variables.filter((v) => (v.type === 'string' || v.type === 'enum') && !v.live && !v.formula);

/** Lists, whose length says how many items a slideshow has. */
export const listChoices = (project: Project): Variable[] => project.variables.filter((v) => v.type === 'list');

/** Values Put values back to the start can reach (a live one is worked out, so there is nothing to put back). */
export const resettable = (project: Project): Variable[] => project.variables.filter((v) => !v.live);

export const NEW_PREFIX = 'new:';
const NEW_NAME: Partial<Record<NeedKind, string>> = { counter: 'count', switch: 'isOn', textvar: 'message' };
const newNameOf = (n: Need): string => n.newName ?? NEW_NAME[n.kind] ?? 'value';
/** Needs that make a variable when the answer is `new:Name`. */
const MAKES_VARIABLE: NeedKind[] = ['counter', 'switch', 'textvar'];

/** The text a Set a text or choice writes: for a choice it is one of the choices, whatever was typed before. */
export function textValueOf(a: Answers, ctx: RecipeCtx): string {
  const v = ctx.project.variables.find((x) => x.id === a.textvar);
  const v0 = a.textvalue ?? '';
  if (v?.type === 'enum' && v.options?.length) return v.options.includes(v0) ? v0 : v.options[0];
  return v0;
}

/** Next / Previous item: the Change a value settings, from the answers. How many items is a count, so counting from 0 the last number is one less. */
function roundParams(a: Answers, ctx: RecipeCtx, op: 'next' | 'previous'): Record<string, unknown> {
  const from = a.startat === '0' ? '0' : '1';
  const raw = (a.last ?? '').trim();
  let last: string;
  if (raw.startsWith('list:')) {
    const name = ctx.project.variables.find((v) => v.id === raw.slice(5))?.name ?? 'items';
    last = from === '0' ? `${name}.length - 1` : `${name}.length`;
  } else if (/^\d+$/.test(raw)) last = String(from === '0' ? Math.max(0, Number(raw) - 1) : Number(raw));
  else last = from === '0' ? `(${raw || '1'}) - 1` : raw;
  return { ...defaultParams('action.setVariable'), variable: a.counter ?? '', op, first: from, last, ends: a.ends === 'stop' ? 'stop' : 'round', ...sayParam(a) };
}

// ---------------------------------------------------------------- triggers

export interface TriggerDef {
  id: Trigger;
  /** What fills "When ___" (also the heading). */
  label: (who: string) => string;
  needs: Need[];
}

export const TRIGGERS: TriggerDef[] = [
  { id: 'click', label: (who) => `“${who}” is clicked`, needs: [] },
  { id: 'pointerenter', label: (who) => `“${who}” is hovered over`, needs: [] },
  { id: 'start', label: () => 'the page is shown', needs: [] },
  { id: 'timer', label: () => 'some seconds have passed', needs: [{ key: 'delay', kind: 'delay', label: 'After how many seconds' }] },
  {
    id: 'value',
    label: () => 'a value reaches something',
    needs: [
      { key: 'watch', kind: 'watch', label: 'Which value' },
      { key: 'reachop', kind: 'reachop', label: 'It' },
      { key: 'reachto', kind: 'reachto', label: 'This', when: (a) => opTakesValue((a.reachop ?? 'atleast') as CondOp) },
    ],
  },
  { id: 'all', label: () => 'all of these are done', needs: DONE_NEEDS },
  { id: 'drop', label: (who) => `“${who}” is dropped on something`, needs: [{ key: 'zone', kind: 'zone', label: 'Dropped on' }] },
  { id: 'key', label: () => 'a key is pressed', needs: [{ key: 'key', kind: 'key', label: 'Which key' }] },
  {
    id: 'video',
    label: () => 'a video reaches a time',
    needs: [
      { key: 'video', kind: 'video', label: 'Which video' },
      { key: 'cuetime', kind: 'cuetime', label: 'At how many seconds' },
    ],
  },
];

export const TRIGGER_BY_ID: Record<Trigger, TriggerDef> = Object.fromEntries(TRIGGERS.map((t) => [t.id, t])) as Record<Trigger, TriggerDef>;

/** The words after "When", for the heading and the trigger list. */
export const triggerLabel = (t: Trigger, who: string): string => TRIGGER_BY_ID[t].label(who);

/** Why a trigger cannot be used here, or null. */
export function triggerUnavailable(t: Trigger, ctx: RecipeCtx): string | null {
  if (t === 'value' && !ctx.project.variables.length) return 'There are no values yet. Add one in the Variables tab first.';
  if (t === 'video' && !videoChoices(ctx.ab).length) return 'This page has no video layer yet. Add one with the Video tool (Web, in the tool bar) first.';
  return null;
}

/** The comparisons "reaches" offers for a value of this kind. */
export function reachOps(v: Variable | undefined): CondOp[] {
  if (v?.type === 'boolean') return ['true', 'false'];
  if (v?.type === 'number') return ['atleast', 'atmost', 'more', 'less', 'is'];
  return ['is', 'isnot'];
}

/** The keys the Key box offers by name (anything else is typed). */
export const KEY_CHOICES: { value: string; label: string }[] = [
  { value: 'Enter', label: 'Enter' },
  { value: 'Space', label: 'Space bar' },
  { value: 'Escape', label: 'Escape' },
  { value: 'ArrowLeft', label: 'Left arrow' },
  { value: 'ArrowRight', label: 'Right arrow' },
  { value: 'ArrowUp', label: 'Up arrow' },
  { value: 'ArrowDown', label: 'Down arrow' },
];

/** Layers that take drops, for "dropped on". */
export function zoneChoices(ab: Artboard): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  walk(ab.children, (n) => void ((n as { dropZone?: unknown }).dropZone && out.push({ id: n.id, name: n.name })));
  return out;
}

/** Why a recipe cannot be added here, or null when it can. */
export function unavailable(recipe: Recipe, ctx: RecipeCtx): string | null {
  if (recipe.id === 'page-pick' && !otherPages(ctx).length) return 'There is no other page to go to yet.';
  if (recipe.id === 'animation' && !ctx.ab.timelines.length) return 'This page has no timelines yet. Make one in the Timeline tab first.';
  if (recipe.id === 'reset' && !resettable(ctx.project).length) return 'There are no values to put back yet. Add one in the Variables tab first.';
  if (recipe.id === 'room-send' && !roomChoices(ctx.project).length) return 'There is no room yet. Add one in the Data tab (+ Room) first.';
  if (recipe.id === 'only-one' && layerChoices(ctx.ab).length < 2) return 'This page has no other layers yet.';
  if (recipe.needs.some((n) => n.kind === 'video') && !videoChoices(ctx.ab).length) return 'This page has no video layer yet. Add one with the Video tool (Web, in the tool bar) first.';
  return null;
}

/** What each need starts as, so the common case is one click: this layer, the next page, the first sound, a new counter. */
function defaultsFor(needs: Need[], ctx: RecipeCtx, id: string): Answers {
  const out: Answers = {};
  for (const n of needs) {
    if (n.kind === 'layer') {
      // showing something: the likeliest layer is one that is hidden already; toggling: one other than this; hiding: this one
      const others = layerChoices(ctx.ab).filter((l) => l.id !== ctx.layerId);
      const pick = id === 'show' ? (others.find((l) => l.hidden) ?? others[0]) : id === 'toggle' || id === 'view-layer' || id === 'only-one' ? others[0] : undefined;
      out[n.key] = pick?.id ?? THIS_LAYER;
    } else if (n.kind === 'page') out[n.key] = first(otherPages(ctx))?.id ?? '';
    else if (n.kind === 'timeline') out[n.key] = first(ctx.ab.timelines)?.id ?? '';
    else if (n.kind === 'room') out[n.key] = first(roomChoices(ctx.project))?.id ?? '';
    else if (n.kind === 'sound') out[n.key] = first(audioAssets(ctx.project))?.id ?? '';
    else if (n.kind === 'counter') out[n.key] = first(counterChoices(ctx.project))?.id ?? NEW_PREFIX + newNameOf(n);
    else if (n.kind === 'switch') out[n.key] = first(switchChoices(ctx.project))?.id ?? NEW_PREFIX + newNameOf(n);
    else if (n.kind === 'textvar') out[n.key] = first(textChoices(ctx.project))?.id ?? NEW_PREFIX + newNameOf(n);
    else if (n.kind === 'textvalue') out[n.key] = first(textChoices(ctx.project))?.options?.[0] ?? '';
    else if (n.kind === 'transition') out[n.key] = 'fade';
    else if (n.kind === 'speed') out[n.key] = String(DEFAULT_TRANSITION_MS);
    else if (n.kind === 'video') out[n.key] = videoChoices(ctx.ab).some((v) => v.id === ctx.layerId) ? THIS_LAYER : (first(videoChoices(ctx.ab))?.id ?? '');
    else if (n.kind === 'seconds') out[n.key] = '0';
    else if (n.kind === 'script') out[n.key] = first(ctx.project.scripts.filter((x) => !x.runOnStart))?.id ?? NEW_PREFIX + 'onClick';
    else if (n.kind === 'numhow') out[n.key] = 'add';
    else if (n.kind === 'switchhow') out[n.key] = 'flip';
    else if (n.kind === 'amount') out[n.key] = '1';
    else if (n.kind === 'startat') out[n.key] = '1';
    else if (n.kind === 'last') out[n.key] = first(listChoices(ctx.project)) ? `list:${first(listChoices(ctx.project))!.id}` : '3';
    else if (n.kind === 'ends') out[n.key] = 'round';
    else if (n.kind === 'lookwhat') out[n.key] = 'colour';
    else if (n.kind === 'colour') out[n.key] = currentColour(findLayer(ctx.ab, ctx.layerId));
    else if (n.kind === 'percent') out[n.key] = '50';
    else if (n.kind === 'size') out[n.key] = '';
    else if (n.kind === 'varset') out[n.key] = joinSet(resettable(ctx.project).map((v) => v.id));
    else if (n.kind === 'delay') out[n.key] = '5';
    else if (n.kind === 'watch') out[n.key] = (first(ctx.project.variables.filter((v) => v.type === 'number')) ?? first(ctx.project.variables))?.id ?? '';
    else if (n.kind === 'reachop') out[n.key] = reachOps(ctx.project.variables.find((v) => v.id === out.watch))[0];
    else if (n.kind === 'reachto') out[n.key] = '1';
    else if (n.kind === 'key') out[n.key] = 'ArrowRight';
    else if (n.kind === 'cuetime') out[n.key] = '10';
    //the layer it was opened from is the likeliest first one to count
    else if (n.kind === 'doneset') out[n.key] = ctx.layerId;
    else if (n.kind === 'donehow') out[n.key] = 'click';
    else if (n.kind === 'donename') out[n.key] = 'explored';
    else out[n.key] = '';
  }
  return out;
}

export const defaultAnswers = (recipe: Recipe, ctx: RecipeCtx): Answers => defaultsFor(recipe.needs, ctx, recipe.id);
export const defaultTriggerAnswers = (t: Trigger, ctx: RecipeCtx): Answers => defaultsFor(TRIGGER_BY_ID[t].needs, ctx, t);

const isNumber = (v: string): boolean => v.trim() !== '' && Number.isFinite(Number(v));

function gapsIn(needs: Need[], a: Answers, project?: Project, ab?: Artboard): string | null {
  for (const n of needs) {
    if (n.when && !n.when(a)) continue;
    const v = (a[n.key] ?? '').trim();
    if (n.kind === 'transition' || n.kind === 'speed' || n.optional) continue;
    if (n.kind === 'donehow') continue;
    if (n.kind === 'donename') {
      if (!v) return 'Name what you are counting, such as explored.';
      continue;
    }
    if (n.kind === 'doneset') {
      if (!splitSet(v).length) return 'Tick the layers that count.';
      //only the layers that can be done in the chosen way count: a question to be answered, a dialog to be opened
      const can = ab && project ? doneLayers(ab, project, doneHowOf(a.donehow)).map((l) => l.id) : null;
      if (can && !splitSet(v).some((id) => can.includes(id))) return a.donehow === 'answered' ? 'None of the ticked layers is a question.' : 'None of the ticked layers is a dialog with an open value.';
      continue;
    }
    if (n.kind === 'size' || n.kind === 'cuetime') continue;
    if (n.kind === 'amount') {
      if (!v) return 'Say how much.';
      continue;
    }
    if (n.kind === 'textvalue' || n.kind === 'numhow' || n.kind === 'switchhow' || n.kind === 'startat' || n.kind === 'ends' || n.kind === 'lookwhat') continue;
    if (n.kind === 'words') {
      if (!v) return `Write ${n.label.toLowerCase()}.`;
      continue;
    }
    if (n.kind === 'last') {
      if (!v) return 'Say how many items.';
      continue;
    }
    if (n.kind === 'layerset') {
      if (!splitSet(v).length) return 'Tick the layers to hide.';
      continue;
    }
    if (n.kind === 'varset') {
      if (!splitSet(v).length) return 'Tick the values to put back.';
      continue;
    }
    if (n.kind === 'percent') {
      if (!isNumber(v) || Number(v) < 0 || Number(v) > 100) return 'Opacity is a number from 0 to 100.';
      continue;
    }
    if (n.kind === 'delay') {
      if (!isNumber(v) || Number(v) <= 0) return 'Say how many seconds, as a number.';
      continue;
    }
    if (n.kind === 'reachto') {
      const watched = project?.variables.find((x) => x.id === a.watch);
      if (watched?.type === 'number' ? !isNumber(v) : !v && watched?.type !== 'string') return watched?.type === 'number' ? 'Say the number it reaches.' : 'Say what it reaches.';
      continue;
    }
    if (n.kind === 'reachop' || n.kind === 'zone') continue;
    if (n.kind === 'key') {
      if (!v) return 'Choose which key.';
      continue;
    }
    if (n.kind === 'watch') {
      if (!v) return 'Choose which value.';
      continue;
    }
    if (!v) return `Choose ${n.label.toLowerCase()}.`;
    if (MAKES_VARIABLE.includes(n.kind) && v.startsWith(NEW_PREFIX) && !v.slice(NEW_PREFIX.length).trim()) return `Name the ${n.kind === 'counter' ? 'counter' : n.kind === 'switch' ? 'switch' : 'variable'}.`;
    if (n.kind === 'script' && v.startsWith(NEW_PREFIX) && !v.slice(NEW_PREFIX.length).trim()) return 'Name the script.';
    if (n.kind === 'link' && !/^(https?:\/\/|mailto:|\/)/i.test(v)) return 'A web address starts with https://';
  }
  return null;
}

/** Why the answers are not enough yet (the Add button says so), or null. */
export function incomplete(recipe: Recipe, a: Answers, project?: Project, ab?: Artboard): string | null {
  const gap = gapsIn(recipe.needs, a, project, ab);
  if (gap) return gap;
  //a size with neither number says nothing
  if (recipe.id === 'look' && a.what === 'size') {
    const w = (a.width ?? '').trim();
    const h = (a.height ?? '').trim();
    if (!w && !h) return 'Give a width or a height.';
    if ((w && !(isNumber(w) && Number(w) >= 0)) || (h && !(isNumber(h) && Number(h) >= 0))) return 'Width and height are numbers, 0 or more.';
  }
  return null;
}

/** Why the trigger's answers are not enough yet, or null. */
export const triggerIncomplete = (t: Trigger, w: Answers, project?: Project, ab?: Artboard): string | null => {
  const gap = gapsIn(TRIGGER_BY_ID[t].needs, w, project, ab);
  if (gap) return gap;
  if (t === 'video' && !(isNumber(w.cuetime ?? '') && Number(w.cuetime) >= 0)) return 'Say how many seconds in, as a number.';
  return null;
};

/** The condition an "Only if" row starts as: the first value, asked in the way that fits it, so it is a real sentence at once. */
export function seedCondition(project: Project): string {
  const v = project.variables.find((x) => /^[A-Za-z_$][\w$]*$/.test(x.name));
  if (!v) return '';
  const op: CondOp = v.type === 'number' ? 'atleast' : v.type === 'boolean' ? 'true' : v.type === 'list' ? 'notempty' : 'is';
  const right = !opTakesValue(op) ? undefined : v.type === 'number' ? ({ t: 'num', value: 1 } as const) : ({ t: 'str', value: '' } as const);
  return conditionToExpr({ join: 'and', rows: [{ left: v.name, op, right }] });
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
  /** The first thing it does. */
  actionId: string;
  /** What it will do, as the Inspector will say it. */
  sentence: string;
}

/** One more thing to do after the first: a recipe and what it was asked. */
export interface Step {
  recipe: string;
  answers: Answers;
}

/** What the dialog adds to the one recipe: another trigger and its answers, more steps, an Only if, and an Otherwise. */
export interface Extras {
  /** The trigger's own answers (a delay, a key, a value to reach...). */
  when?: Answers;
  /** More steps, each after the one before. */
  then?: Step[];
  /** A yes/no formula: the flow runs only if it is true. */
  only?: string;
  /** What to do when `only` is not true. Writes a Check a condition node instead of an Only if. */
  otherwise?: Step | null;
}

const identifier = (raw: string, taken: string[], fallback: string): string => uniqueIdentifier(taken, raw.trim().replace(/[^\w$]+/g, '_').replace(/^(\d)/, '_$1') || fallback);

interface Acc {
  variables: Variable[];
  scripts: Script[];
  patches: Behaviour['patches'];
  taken: string[];
}

/** The nodes of one recipe, with the variables and script it makes added to `acc`. */
function stepsFor(ctx: RecipeCtx, recipeId: string, answers: Answers, makeId: (prefix: string) => string, acc: Acc): FlowStep[] {
  const recipe = RECIPE_BY_ID[recipeId];
  if (!recipe) throw new Error(`No behaviour called ${recipeId}`);
  const a: Answers = { ...answers };
  for (const n of recipe.needs) {
    if (n.kind === 'script' && (a[n.key] ?? '').startsWith(NEW_PREFIX)) {
      const names = [...ctx.project.scripts, ...acc.scripts].map((x) => x.name);
      const name = uniqueIdentifier(names, a[n.key].slice(NEW_PREFIX.length).trim() || 'onClick');
      const sc: Script = { id: makeId('sc'), name, code: CLICK_SCRIPT, runOnStart: false };
      acc.scripts.push(sc);
      a[n.key] = sc.id;
      continue;
    }
    if (MAKES_VARIABLE.includes(n.kind) && (a[n.key] ?? '').startsWith(NEW_PREFIX)) {
      //words with spaces or capitals ("Quiz score") become quizScore, and are kept as the variable's label
      const made = nameFromWords(a[n.key].slice(NEW_PREFIX.length), acc.taken);
      const name = made ? uniqueIdentifier(acc.taken, made.name) : identifier(a[n.key].slice(NEW_PREFIX.length), acc.taken, newNameOf(n));
      acc.taken.push(name);
      //a slideshow number starts on its first item
      const initial = n.kind === 'counter' ? (recipe.id.startsWith('item-') && a.startat !== '0' ? 1 : 0) : n.kind === 'switch' ? false : '';
      const v: Variable = { id: makeId('v'), name, ...(made?.label && made.label !== name ? { label: made.label } : {}), type: n.kind === 'counter' ? 'number' : n.kind === 'switch' ? 'boolean' : 'string', initial };
      acc.variables.push(v);
      a[n.key] = v.id;
    }
  }
  // showing another layer: it has to be hidden to begin with, or there is nothing to show
  if (recipe.id === 'show') {
    const target = layerOf(a, ctx);
    const layer = layerChoices(ctx.ab).find((l) => l.id === target);
    if (layer && target !== ctx.layerId && !layer.hidden && !acc.patches.some((p) => p.id === target)) acc.patches.push({ id: target, props: { visible: false } });
  }
  //a new text variable carries the text, and a new variable made here is not in the project yet
  const withNew: RecipeCtx = acc.variables.length ? { ...ctx, project: { ...ctx.project, variables: [...ctx.project.variables, ...acc.variables] } } : ctx;
  if (recipe.steps) return recipe.steps(a, withNew);
  const act = recipe.action!(a, withNew);
  return [{ kind: act.kind, params: act.params }];
}

interface EventSpec {
  kind: string;
  params: Record<string, unknown>;
  onlyIf?: string;
}

const clock = (secs: number): string => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** The event a trigger writes, and the layer setting it needs (a video cue to fire on). */
function eventFor(trigger: Trigger, w: Answers, ctx: RecipeCtx, acc: Acc, done?: DoneKit | null): EventSpec {
  switch (trigger) {
    case 'all':
      return done ? { kind: done.all.kind, params: done.all.params, onlyIf: done.all.onlyIf } : { kind: 'event.start', params: {} };
    case 'start':
      return { kind: 'event.start', params: {} };
    case 'timer':
      return { kind: 'event.timer', params: { ms: String(Math.round(Number(w.delay ?? '5') * 1000)), repeat: false } };
    case 'value': {
      const v = ctx.project.variables.find((x) => x.id === w.watch);
      const op = (w.reachop ?? reachOps(v)[0]) as CondOp;
      const raw = (w.reachto ?? '').trim();
      const right = !opTakesValue(op) ? undefined : v?.type === 'number' && isNumber(raw) ? ({ t: 'num', value: Number(raw) } as const) : ({ t: 'str', value: raw } as const);
      return { kind: 'event.variable', params: { variable: w.watch ?? '' }, onlyIf: v ? rowToExpr({ left: v.name, op, right }) : '' };
    }
    case 'drop':
      return { kind: 'event.drop', params: { target: w.zone ?? '', layer: ctx.layerId, result: 'accepted' } };
    case 'key':
      return { kind: 'event.key', params: { key: w.key ?? '', type: 'keydown' } };
    case 'video': {
      const id = videoOf({ video: w.video ?? '' }, ctx);
      const time = Math.max(0, Number(w.cuetime ?? '0'));
      const cues = ((findLayer(ctx.ab, id) as unknown as { cues?: { id: string; time: number; name: string; pause?: boolean }[] } | undefined)?.cues ?? []).slice();
      const same = cues.find((c) => Math.abs(c.time - time) < 0.001);
      const name = same?.name ?? `At ${clock(time)}`;
      if (!same) acc.patches.push({ id, props: { cues: [...cues, { id: uid('vc'), time, name }].sort((x, y) => x.time - y.time) } });
      return { kind: 'event.videoCue', params: { target: id, name } };
    }
    default:
      return { kind: 'event.pointer', params: { target: ctx.layerId, type: trigger === 'pointerenter' ? 'pointerenter' : 'click' } };
  }
}

const both = (a: string, b: string): string => (a && b ? `(${a}) && (${b})` : a || b);

/**
 * The nodes (and variable, and layer setting) for one recipe on one layer. Nothing is written: `applyBehaviour` does that, in one
 * undo step. `makeId` is for the ids of new variables (a test can then have predictable ones); the nodes come from the shared click-flow writer.
 * `extras` is what the dialog adds: another trigger, more steps, an Only if, an Otherwise.
 */
export function buildBehaviour(ctx: RecipeCtx, recipeId: string, trigger: Trigger, answers: Answers, makeId: (prefix: string) => string = uid, extras: Extras = {}): Behaviour {
  if (!RECIPE_BY_ID[recipeId]) throw new Error(`No behaviour called ${recipeId}`);
  const acc: Acc = { variables: [], scripts: [], patches: [], taken: ctx.project.variables.map((v) => v.name) };
  //counting what is done (the trigger All of these are done, or Count what has been done on its own) makes its variables first
  const doneIn = recipeId === 'count-done' ? answers : trigger === 'all' ? (extras.when ?? {}) : null;
  const done = doneIn ? buildDone(ctx.ab, ctx.project, doneHowOf(doneIn.donehow), splitSet(doneIn.doneset), doneIn.donename ?? '', makeId, acc.taken) : null;
  if (done) acc.variables.push(...done.variables);
  const counting = recipeId === 'count-done';
  const steps = counting ? [] : [{ recipe: recipeId, answers }, ...(extras.then ?? [])].flatMap((st) => stepsFor(ctx, st.recipe, st.answers, makeId, acc));
  const only = (extras.only ?? '').trim();
  const otherwise = !counting && only && extras.otherwise ? stepsFor(ctx, extras.otherwise.recipe, extras.otherwise.answers, makeId, acc) : [];
  // written onto a scratch copy of the graph by the shared click-flow writer, so the nodes land where a real write would put them
  const scratch = { logic: { nodes: [...ctx.ab.logic.nodes], edges: [] as LogicEdge[] } };
  let nodes: LogicNode[];
  let event: LogicNode;
  let firstStep: LogicNode | undefined;
  if (counting) {
    //no trigger of its own: the first layer's flow stands in for it
    const [head, ...rest] = done!.trackers;
    const w = writeFlow(scratch, head.event, head.steps);
    event = w.event;
    nodes = [w.event, ...w.steps];
    firstStep = w.steps[0];
    for (const t of rest) {
      const x = writeFlow(scratch, t.event, t.steps);
      nodes.push(x.event, ...x.steps);
    }
  } else {
    const ev = eventFor(trigger, extras.when ?? {}, ctx, acc, done);
    if (otherwise.length) {
      //an Otherwise needs a fork, so the condition is a Check a condition node (the event keeps only what its own trigger asks)
      const w = writeBranchFlow(scratch, { kind: ev.kind, params: { ...ev.params, ...(ev.onlyIf ? { onlyIf: ev.onlyIf } : {}) } }, only, steps, otherwise);
      event = w.event;
      nodes = [w.event, w.check, ...w.yes, ...w.no];
      firstStep = w.yes[0];
    } else {
      const onlyIf = both(ev.onlyIf ?? '', only);
      const w = writeFlow(scratch, { kind: ev.kind, params: { ...ev.params, ...(onlyIf ? { onlyIf } : {}) } }, steps);
      event = w.event;
      nodes = [w.event, ...w.steps];
      firstStep = w.steps[0];
    }
    //the trigger All of these are done also writes what counts them, under the flow it starts
    for (const t of done?.trackers ?? []) {
      const x = writeFlow(scratch, t.event, t.steps);
      nodes.push(x.event, ...x.steps);
    }
  }
  const edges = scratch.logic.edges;
  const shown: Artboard = { ...ctx.ab, logic: { ...ctx.ab.logic, nodes, edges } };
  const project: Project = { ...ctx.project, variables: [...ctx.project.variables, ...acc.variables], scripts: [...ctx.project.scripts, ...acc.scripts] };
  const flow = flowSentence(buildFlow(event, { ab: shown, project, self: ctx.layerId }, { limit: 40 }));
  const sentence = counting ? done!.sentence : flow;
  return { nodes, edges, variables: acc.variables, scripts: acc.scripts, patches: acc.patches, eventId: event.id, actionId: (firstStep ?? event).id, sentence };
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
