//The dialog kit: modals, prompts and tooltips. Each one is a page of its own, marked as an overlay, which belongs to no
//screen and is shown beside (or over) whatever layer points at it. Adding one builds that page and, when a layer is
//selected, links it straight away. The page holds ordinary layers, so the Inspector edits it like any other page.
//Pure functions over a project draft (see store.update).
import { createArtboard, createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type LogicNode, type Project, type SceneNode, type Variable } from 'interactives-player';
import { defaultParams } from 'interactives-player';
import { lookFor } from './themes';

//'input' is the prompt that takes typing: it has its own name in the file because 'prompt' used to mean the confirmation
export type DialogKind = 'modal' | 'confirm' | 'input' | 'tooltip';

export const DIALOG_KINDS: { value: DialogKind; label: string; hint: string }[] = [
  { value: 'tooltip', label: 'Tooltip', hint: 'A small box beside the layer you point it at, while that layer is hovered or focused' },
  { value: 'modal', label: 'Modal', hint: 'A box over the whole page, opened by clicking the layer you point it at' },
  { value: 'confirm', label: 'Confirmation', hint: 'Asks a question and takes an answer from its buttons, which you add to and rename as a list' },
  { value: 'input', label: 'Prompt', hint: 'Asks for something typed, and keeps the answer where your interactions can read it' },
];

/** What each kind is called where a page or a variable is named after it. */
const KIND_WORDS: Record<DialogKind, { page: string; stem: string; showing: string }> = {
  tooltip: { page: 'Tooltip', stem: 'tooltip', showing: 'Tooltip showing' },
  modal: { page: 'Dialog', stem: 'dialog', showing: 'Dialog showing' },
  confirm: { page: 'Confirmation', stem: 'confirm', showing: 'Confirmation showing' },
  input: { page: 'Prompt', stem: 'prompt', showing: 'Prompt showing' },
};

const solid = (color: string) => ({ type: 'solid' as const, color });

/** A name nothing else in the project is using. */
function freeName(taken: Set<string>, want: string): string {
  if (!taken.has(want)) return want;
  for (let i = 2; ; i++) if (!taken.has(`${want} ${i}`)) return `${want} ${i}`;
}

/** A variable name nothing in the project is using, from a stem. */
function freeStem(d: Project, base: string): string {
  const used = new Set(d.variables.map((v) => v.name));
  for (let i = 1; ; i++) if (!used.has(`${base}${i}Open`)) return `${base}${i}`;
}

function addVariable(d: Project, v: Omit<Variable, 'id'>): string {
  const full: Variable = { id: uid('v'), ...v };
  d.variables.push(full);
  return full.id;
}

/** An event node and the actions it runs, laid out as a row below whatever is in that page's graph already. */
function wire(ab: Artboard, event: { kind: string; params: Record<string, unknown> }, actions: { kind: string; params: Record<string, unknown> }[]): void {
  const logic = ab.logic;
  const y = logic.nodes.length ? Math.max(...logic.nodes.map((n) => n.y)) + 120 : 40;
  const ev: LogicNode = { id: uid('l'), kind: event.kind, x: 40, y, params: { ...defaultParams(event.kind), ...event.params } };
  logic.nodes.push(ev);
  let from = ev.id;
  actions.forEach((a, i) => {
    const node: LogicNode = { id: uid('l'), kind: a.kind, x: 40 + 320 * (i + 1), y, params: { ...defaultParams(a.kind), ...a.params } };
    logic.nodes.push(node);
    logic.edges.push({ id: uid('e'), from, fromPort: 'out', to: node.id, toPort: 'in' });
    from = node.id;
  });
}

const setVar = (variableId: string, value: string) => ({ kind: 'action.setVariable', params: { variable: variableId, op: 'set', value } });

/**
 * Add an overlay page of this kind, and point `targetId` at it when one is given. Gives back the new page's id, and the
 * layer it was linked to, so the editor can select and show them.
 */
export function addDialog(d: Project, kind: DialogKind, opts: { targetId?: string | null; artboardId?: string | null } = {}): { overlayId: string; linked: string | null } {
  const l = lookFor(d.themes);
  const names = new Set(d.artboards.map((a) => a.name));
  const right = Math.max(0, ...d.artboards.map((a) => a.canvasX + a.width));
  //The page is only where the card is designed: room round it so it reads on the canvas. The card is what is shown
  const size = kind === 'tooltip' ? { width: 320, height: 140 } : { width: 520, height: 320 };
  const page = createArtboard({
    name: freeName(names, KIND_WORDS[kind].page),
    ...size,
    canvasX: right + 120,
    canvasY: 0,
  });
  page.overlay = { kind, side: 'auto', offset: 8 };
  page.background = solid(l.background);
  if (kind === 'tooltip') fillTooltip(page, l);
  else fillBox(d, page, l, kind);
  d.artboards.push(page);

  //Linking it to the selected layer is the whole point, so do it when there is one
  let linked: string | null = null;
  if (opts.targetId) {
    const host = d.artboards.find((a) => a.id === opts.artboardId) ?? d.artboards.find((a) => findNode(a.children, opts.targetId!));
    const node = host ? findNode(host.children, opts.targetId) : null;
    if (node) {
      node.overlay = { overlayId: page.id };
      linked = node.id;
    }
  }
  return { overlayId: page.id, linked };
}

/** Point a layer at an overlay page, or take its link off again. */
export function linkOverlay(d: Project, targetId: string, overlayId: string | null): void {
  for (const ab of d.artboards) {
    const node = findNode(ab.children, targetId);
    if (!node) continue;
    if (overlayId) node.overlay = { ...(node.overlay ?? {}), overlayId };
    else delete node.overlay;
    return;
  }
}

/** Every layer in the project pointing at this overlay page, with the page it sits on. */
export function overlayTargets(d: Project, overlayId: string): { node: SceneNode; artboard: Artboard }[] {
  const out: { node: SceneNode; artboard: Artboard }[] = [];
  for (const ab of d.artboards) {
    const visit = (list: SceneNode[]) => {
      for (const n of list) {
        if (n.overlay?.overlayId === overlayId) out.push({ node: n, artboard: ab });
        if ('children' in n && Array.isArray(n.children)) visit(n.children as SceneNode[]);
      }
    };
    visit(ab.children);
  }
  return out;
}

/** Where the card sits on its page, so there is a margin of page round it on the canvas. */
const CARD_AT = 24;

/**
 * The tooltip: one small card, dark with light words whatever the page's theme, so it reads as sitting on top. Its words size
 * the card: they stay on one line up to 260 wide and wrap after that, and the card hugs them.
 */
function fillTooltip(page: Artboard, l: Record<string, string>): void {
  page.clip = false;
  const words = createNode('text', {
    name: 'Tip text',
    text: 'What this is for.',
    fontSize: 13,
    lineHeight: 1.35,
    color: l.background,
    autoSize: 'width',
    maxWidth: 260,
    //what the editor measures it as; it measures again the first time the page is drawn
    width: 118,
    height: 18,
  });
  const card = createNode('frame', {
    name: 'Tooltip',
    x: CARD_AT,
    y: CARD_AT,
    width: 118 + 20,
    height: 18 + 12,
    fill: solid(l.text),
    cornerRadius: 6,
    stroke: null,
    clip: false,
    shadow: { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.18)' },
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 6, right: 10, bottom: 6, left: 10 }, align: 'start', hugWidth: true, hugHeight: true },
    children: [words],
  }) as FrameNode;
  page.children = [card];
}

/**
 * The card of the three that cover the page: a heading, a message and a row of buttons, stacked by auto layout so a longer
 * message pushes the buttons down rather than running into them. Rounded, bordered and lifted off the page with a shadow.
 *
 * The heading and the message come from variables, and the page says it takes them (`props`), so one of these can serve
 * any number of layers, each handing over its own words as it opens. **For** is a word each layer can set to say what the
 * answer is about, so one flow can tell them apart.
 */
function fillBox(d: Project, page: Artboard, l: Record<string, string>, kind: 'modal' | 'confirm' | 'input'): void {
  const words = KIND_WORDS[kind];
  const stem = freeStem(d, words.stem);
  const openVar = `${stem}Open`;
  const openId = addVariable(d, { name: openVar, label: words.showing, type: 'boolean', initial: false });
  page.overlay = { ...page.overlay!, openVariable: openId, scrim: solid('rgba(0,0,0,0.5)') };

  const starts = {
    modal: { title: 'A heading', message: 'Write what this is about here.' },
    confirm: { title: 'Are you sure?', message: 'This cannot be undone.' },
    input: { title: 'What should it be called?', message: 'You can change it later.' },
  }[kind];
  const titleId = addVariable(d, { name: `${stem}Title`, label: 'Heading', type: 'string', initial: starts.title });
  const messageId = addVariable(d, { name: `${stem}Message`, label: 'Message', type: 'string', initial: starts.message });
  page.props = [
    { variable: titleId, label: 'Heading' },
    { variable: messageId, label: 'Message' },
  ];
  if (kind !== 'modal') {
    const forId = addVariable(d, { name: `${stem}For`, label: 'What it is for', type: 'string', initial: '' });
    page.props.push({ variable: forId, label: 'For', help: 'A word for what this answer is about, so one flow can tell which layer asked' });
  }

  const cardW = 440;
  const inner = cardW - 48;
  const title = createNode('text', {
    name: 'Title',
    width: inner,
    height: 28,
    text: `{${stem}Title}`,
    fontSize: 20,
    fontWeight: 700,
    color: l.text,
    autoSize: 'height',
    role: 'heading',
    headingLevel: 2,
  });
  const body = createNode('text', {
    name: 'Message',
    width: inner,
    height: 22,
    text: `{${stem}Message}`,
    fontSize: 15,
    lineHeight: 1.45,
    color: l.muted,
    autoSize: 'height',
  });
  const row = createNode('frame', {
    name: 'Buttons',
    width: inner,
    height: 40,
    fill: null,
    //A row that only lays things out should never cut anything off
    clip: false,
    layout: { ...defaultAutoLayout('row'), gap: 8, padding: { top: 8, right: 0, bottom: 0, left: 0 }, justify: 'end', align: 'center', hugHeight: true },
  }) as FrameNode;
  const card = createNode('frame', {
    name: words.page,
    x: CARD_AT,
    y: CARD_AT,
    width: cardW,
    height: 200,
    fill: solid(l.surface),
    cornerRadius: 12,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    clip: false,
    shadow: { x: 0, y: 16, blur: 40, spread: 0, color: 'rgba(0,0,0,0.22)' },
    layout: { ...defaultAutoLayout('column'), gap: 10, padding: { top: 24, right: 24, bottom: 20, left: 24 }, align: 'stretch', hugWidth: false, hugHeight: true },
    children: [title, body, row],
  }) as FrameNode;
  page.children = [card];

  const plain = (name: string, label: string) =>
    createNode('button', { name, label, width: 96, height: 40, fill: solid(l.surface), color: l.text, cornerRadius: 8, stroke: { paint: solid(l.border), width: 1, align: 'inside' } });
  const main = (name: string, label: string) => createNode('button', { name, label, width: 96, height: 40, fill: solid(l.button), color: l.onButton, cornerRadius: 8 });

  if (kind === 'modal') {
    const close = main('Close', 'Close');
    row.children.push(close);
    wire(page, { kind: 'event.pointer', params: { target: close.id, type: 'click' } }, [setVar(openId, 'false')]);
    return;
  }

  if (kind === 'input') {
    //What is being typed, and what was last answered. The answer only changes on OK, so a flow can wait for it
    const valueVar = `${stem}Value`;
    const answerVar = `${stem}Answer`;
    const valueId = addVariable(d, { name: valueVar, label: 'What is being typed', type: 'string', initial: '' });
    const answerId = addVariable(d, { name: answerVar, label: 'What they answered', type: 'string', initial: '' });
    const box = createNode('input', {
      name: 'Answer box',
      width: inner,
      height: 44,
      inputType: 'text',
      placeholder: 'Type here',
      ariaLabel: 'Your answer',
      //both ways: typing writes the variable, and clearing the variable empties the box
      bindings: { value: valueVar },
      bindingModes: { value: 'both' },
      cornerRadius: 8,
      fontSize: 16,
      fill: solid(l.background),
      color: l.text,
      stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    });
    card.children = [title, body, box, row];
    const cancel = plain('Cancel', 'Cancel');
    const ok = main('OK', 'OK');
    row.children.push(cancel, ok);
    //OK keeps what was typed as the answer, closes, and clears the box for next time. Cancel just closes and clears
    wire(page, { kind: 'event.pointer', params: { target: ok.id, type: 'click' } }, [setVar(answerId, valueVar), setVar(openId, 'false'), setVar(valueId, '""')]);
    wire(page, { kind: 'event.pointer', params: { target: cancel.id, type: 'click' } }, [setVar(openId, 'false'), setVar(valueId, '""')]);
    return;
  }

  //The confirmation's buttons are a repeated list, so adding one is adding a row rather than copying a layer and rewiring
  //it. A row marked main is the answer you mean, and looks it; the others are ways out
  const buttonsVar = `${stem}Buttons`;
  const pickVar = `${stem}Pick`;
  const choiceVar = `${stem}Choice`;
  addVariable(d, { name: buttonsVar, label: 'Confirmation buttons', type: 'list', initial: JSON.stringify([{ label: 'Cancel', value: 'cancel' }, { label: 'Yes, do it', value: 'yes', main: true }]) });
  const pickId = addVariable(d, { name: pickVar, label: 'Button picked (position)', type: 'number', initial: -1 });
  const choiceId = addVariable(d, { name: choiceVar, label: 'What they chose', type: 'string', initial: '' });

  const button = createNode('button', {
    name: 'Answer button',
    label: 'Button',
    width: 120,
    height: 40,
    fill: solid(l.surface),
    color: l.text,
    cornerRadius: 8,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    bindings: {
      label: 'item.label',
      'fill.color': `item.main ? "${l.button}" : "${l.surface}"`,
      color: `item.main ? "${l.onButton}" : "${l.text}"`,
    },
  });
  row.children.push(button);
  row.repeat = { items: buttonsVar, layout: 'horizontal', gap: 8, columns: 1, select: { mode: 'one', variable: pickId } };

  //Picking a button writes what it stands for, closes it, then puts the pick back to none so it opens clean again.
  //Every step guards on the pick, so the node firing again for the reset changes nothing
  wire(page, { kind: 'event.variable', params: { variable: pickId } }, [
    setVar(choiceId, `${pickVar} >= 0 ? (${buttonsVar}[${pickVar}]?.value ?? "") : ${choiceVar}`),
    setVar(openId, `${pickVar} < 0 && ${openVar}`),
    setVar(pickId, '-1'),
  ]);
}

function findNode(list: SceneNode[], id: string): SceneNode | null {
  for (const n of list) {
    if (n.id === id) return n;
    if ('children' in n && Array.isArray(n.children)) {
      const hit = findNode(n.children as SceneNode[], id);
      if (hit) return hit;
    }
  }
  return null;
}
