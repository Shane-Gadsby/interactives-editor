//The dialog kit: modals, prompts, tooltips and toasts. Each one is a page of its own, marked as an overlay, which belongs to no
//screen and is shown beside (or over) whatever layer points at it. Adding one builds that page and, when a layer is
//selected, links it straight away. The page holds ordinary layers, so the Inspector edits it like any other page.
//Pure functions over a project draft (see store.update).
import { cardOf, createArtboard, createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type LogicNode, type Project, type SceneNode, type Variable } from 'interactives-player';
import { defaultParams } from 'interactives-player';
import { lookFor } from './themes';
import { CONTROL_H, RADIUS, SHADOW, SPACE, TYPE, pad } from './design-scale';

//'input' is the prompt that takes typing: it has its own name in the file because 'prompt' used to mean the confirmation
export type DialogKind = 'modal' | 'confirm' | 'input' | 'tooltip' | 'toast';

export const DIALOG_KINDS: { value: DialogKind; label: string; hint: string }[] = [
  { value: 'tooltip', label: 'Tooltip', hint: 'A small box beside the layer you point it at, while that layer is hovered or focused' },
  { value: 'modal', label: 'Modal', hint: 'A box over the whole page, opened by clicking the layer you point it at' },
  { value: 'confirm', label: 'Confirmation', hint: 'Asks a question and takes an answer from its buttons, which you add to and rename as a list' },
  { value: 'input', label: 'Prompt', hint: 'Asks for something typed, and keeps the answer where your interactions can read it' },
  { value: 'toast', label: 'Toast', hint: 'A short message in a corner of the page that goes by itself, shown by a Show toast node' },
];

/** What each kind is called where a page or a variable is named after it. */
const KIND_WORDS: Record<DialogKind, { page: string; stem: string; showing: string }> = {
  tooltip: { page: 'Tooltip', stem: 'tooltip', showing: 'Tooltip showing' },
  modal: { page: 'Dialog', stem: 'dialog', showing: 'Dialog showing' },
  confirm: { page: 'Confirmation', stem: 'confirm', showing: 'Confirmation showing' },
  input: { page: 'Prompt', stem: 'prompt', showing: 'Prompt showing' },
  toast: { page: 'Toast', stem: 'toast', showing: 'Toast showing' },
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
  const size = kind === 'tooltip' ? { width: 320, height: 140 } : kind === 'toast' ? { width: 400, height: 110 } : { width: 520, height: 320 };
  const page = createArtboard({
    name: freeName(names, KIND_WORDS[kind].page),
    ...size,
    canvasX: right + 120,
    canvasY: 0,
  });
  page.overlay = kind === 'toast' ? { kind, place: 'bottom-right', motion: 'slide' } : { kind, side: 'auto', offset: 8 };
  page.background = solid(l.background);
  if (kind === 'tooltip') fillTooltip(page, l);
  else if (kind === 'toast') fillToast(d, page, l);
  else fillBox(d, page, l, kind);
  //The page is the overlay: the card is bound to it, so the page's size is the overlay's and nobody sizes the two apart
  bindCardToPage(page);
  d.artboards.push(page);

  //Nothing points at a toast: a Show toast node shows it. With a layer picked, clicking that layer is wired to show it,
  //which is nearly always what was meant (a Save button, a Copy button)
  if (kind === 'toast') {
    const host = opts.targetId ? (d.artboards.find((a) => a.id === opts.artboardId) ?? d.artboards.find((a) => findNode(a.children, opts.targetId!))) : null;
    const node = host && !host.overlay ? findNode(host.children, opts.targetId!) : null;
    if (host && node) wire(host, { kind: 'event.pointer', params: { target: node.id, type: 'click' } }, [{ kind: 'action.toast', params: { toast: page.id, text: '' } }]);
    return { overlayId: page.id, linked: node ? node.id : null };
  }

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

/**
 * Bind an overlay page's card to the page, so the page is in charge of the overlay's size (`Overlay.bindCard`). The page
 * takes the card's size as it is now, so nothing that is shown changes: it fits its content on each axis the card hugs
 * (a tooltip is as wide as its words, a modal as tall as its message) and is a set size on the others. Its own background
 * goes, since the card is all there is to see and its rounded corners would otherwise sit on a square. False when the page
 * isn't an overlay or doesn't hold a single card.
 */
export function bindCardToPage(page: Artboard): boolean {
  const card = cardOf(page.children);
  if (!page.overlay || !card) return false;
  page.overlay = { ...page.overlay, bindCard: true };
  card.x = 0;
  card.y = 0;
  page.width = Math.max(1, Math.round(card.width));
  page.height = Math.max(1, Math.round(card.height));
  if (card.layout?.hugWidth) page.hugWidth = true;
  else delete page.hugWidth;
  if (card.layout?.hugHeight) page.hugHeight = true;
  else delete page.hugHeight;
  delete page.hugPadding;
  page.background = null;
  //the card's shadow falls outside the page
  page.clip = false;
  return true;
}

/** Let an overlay's card go from its page again: both keep the size they have, and are sized separately from here on. */
export function unbindCard(page: Artboard): void {
  if (!page.overlay?.bindCard) return;
  const { bindCard: _was, ...rest } = page.overlay;
  page.overlay = rest;
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

/**
 * The close button every dismissable overlay on the web has in its corner: a small square you can press, named Close for a
 * screen reader, holding a drawn cross (not a letter x, which reads as a letter and sits wrong on its line).
 */
export function closeButton(l: Record<string, string>): FrameNode {
  const SIZE = 32;
  const ARM = 10;
  const at = (SIZE - ARM) / 2;
  const cross = createNode('path', {
    name: 'Cross',
    x: at,
    y: at,
    width: ARM,
    height: ARM,
    paths: [
      { closed: false, points: [{ x: 0, y: 0 }, { x: ARM, y: ARM }] },
      { closed: false, points: [{ x: ARM, y: 0 }, { x: 0, y: ARM }] },
    ],
    fill: null,
    stroke: { paint: solid(l.text), width: 1.75 },
    lineCap: 'round',
    decorative: true,
  });
  return createNode('frame', {
    name: 'Close',
    width: SIZE,
    height: SIZE,
    //nothing behind the cross until the pointer is on it, so it sits on whatever card it is in
    fill: null,
    cornerRadius: RADIUS.control,
    clip: false,
    role: 'button',
    ariaLabel: 'Close',
    focusable: true,
    cursor: 'pointer',
    states: [{ id: uid('st'), name: 'Hover', when: 'hover', props: { fill: solid(l.surfaceMuted) } }],
    //it keeps its own corner of a row: the title beside it takes the room, this never shrinks
    layoutItem: { position: 'flow' },
    children: [cross],
  }) as FrameNode;
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
    fontSize: TYPE.small,
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
    cornerRadius: RADIUS.small,
    stroke: null,
    clip: false,
    shadow: SHADOW.raised,
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 6, right: 10, bottom: 6, left: 10 }, align: 'start', hugWidth: true, hugHeight: true },
    children: [words],
  }) as FrameNode;
  page.children = [card];
}

/**
 * The toast: one small card that hugs its words, lifted off the page with a shadow. It follows the theme like everything
 * else on the page (light on a light theme, dark on a dark one, the colourway's colours on a colourway), on the page's own
 * ground with a line round it. Its words come from a variable the page
 * says it takes, and the toast names that variable as where a Show toast node's Message goes, so one toast serves every
 * message.
 */
function fillToast(d: Project, page: Artboard, l: Record<string, string>): void {
  page.clip = false;
  const used = new Set(d.variables.map((v) => v.name));
  let stem = 'toast1';
  for (let i = 1; used.has(`toast${i}Message`); i++) stem = `toast${i + 1}`;
  const messageVar = `${stem}Message`;
  const messageId = addVariable(d, { name: messageVar, label: 'Toast message', type: 'string', initial: 'Saved' });
  page.props = [{ variable: messageId, label: 'Message' }];
  page.overlay = { ...page.overlay!, message: messageId };
  const words = createNode('text', {
    name: 'Message',
    text: `{${messageVar}}`,
    fontSize: TYPE.body,
    lineHeight: 1.4,
    color: l.text,
    autoSize: 'width',
    maxWidth: 320,
    width: 42,
    height: 20,
  });
  const close = closeButton(l);
  const card = createNode('frame', {
    name: 'Toast',
    x: CARD_AT,
    y: CARD_AT,
    width: 42 + 32,
    height: 20 + 24,
    fill: solid(l.background),
    cornerRadius: RADIUS.control,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    clip: false,
    shadow: SHADOW.raised,
    layout: { ...defaultAutoLayout('row'), gap: SPACE.m, padding: { top: SPACE.s, right: SPACE.s, bottom: SPACE.s, left: SPACE.l }, align: 'center', hugWidth: true, hugHeight: true },
    children: [words, close],
  }) as FrameNode;
  page.children = [card];
  //Being able to close it early doesn't stop it going by itself: only something else to press does that
  wire(page, { kind: 'event.pointer', params: { target: close.id, type: 'click' } }, [{ kind: 'action.toastHide', params: { toast: page.id } }]);
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
    fontSize: TYPE.heading,
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
    fontSize: TYPE.body,
    lineHeight: 1.45,
    //the message is what you came to read, so it is the text colour: the quiet grey is for hints
    color: l.text,
    autoSize: 'height',
  });
  const row = createNode('frame', {
    name: 'Buttons',
    width: inner,
    height: 40,
    fill: null,
    //A row that only lays things out should never cut anything off
    clip: false,
    layout: { ...defaultAutoLayout('row'), gap: SPACE.s, padding: { top: SPACE.s, right: 0, bottom: 0, left: 0 }, justify: 'end', align: 'center', hugHeight: true },
  }) as FrameNode;
  const card = createNode('frame', {
    name: words.page,
    x: CARD_AT,
    y: CARD_AT,
    width: cardW,
    height: 200,
    //the page's own ground, not the grey of a panel: a dialog is the brightest thing on a dimmed page
    fill: solid(l.background),
    cornerRadius: RADIUS.card,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    clip: false,
    shadow: SHADOW.floating,
    layout: { ...defaultAutoLayout('column'), gap: SPACE.m, padding: pad(SPACE.xl), align: 'stretch', hugWidth: false, hugHeight: true },
    children: [title, body, row],
  }) as FrameNode;
  page.children = [card];

  const plain = (name: string, label: string) =>
    createNode('button', { name, label, width: 96, height: CONTROL_H, fill: solid(l.background), color: l.text, fontSize: TYPE.body, fontWeight: 600, cornerRadius: RADIUS.control, stroke: { paint: solid(l.border), width: 1, align: 'inside' } });
  const main = (name: string, label: string) => createNode('button', { name, label, width: 96, height: CONTROL_H, fill: solid(l.button), color: l.onButton, fontSize: TYPE.body, fontWeight: 600, cornerRadius: RADIUS.control });

  if (kind === 'modal') {
    //A modal has a way out in its corner as well as its button: the cross is where people look for it
    const corner = closeButton(l);
    title.width = inner - corner.width - SPACE.s;
    title.layoutItem = { width: 'fill' };
    const head = createNode('frame', {
      name: 'Header',
      width: inner,
      height: corner.height,
      fill: null,
      clip: false,
      layout: { ...defaultAutoLayout('row'), gap: SPACE.s, padding: pad(0), align: 'start', hugHeight: true },
      children: [title, corner],
    }) as FrameNode;
    card.children = [head, body, row];
    const close = main('Close button', 'Close');
    row.children.push(close);
    wire(page, { kind: 'event.pointer', params: { target: close.id, type: 'click' } }, [setVar(openId, 'false')]);
    wire(page, { kind: 'event.pointer', params: { target: corner.id, type: 'click' } }, [setVar(openId, 'false')]);
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
      height: CONTROL_H,
      inputType: 'text',
      placeholder: 'Type here',
      ariaLabel: 'Your answer',
      //both ways: typing writes the variable, and clearing the variable empties the box
      bindings: { value: valueVar },
      bindingModes: { value: 'both' },
      cornerRadius: RADIUS.control,
      fontSize: TYPE.body,
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
    //Enter in the box is OK, as in every form with one field
    wire(page, { kind: 'event.key', params: { key: 'Enter', target: box.id, typing: true } }, [setVar(answerId, valueVar), setVar(openId, 'false'), setVar(valueId, '""')]);
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
    height: CONTROL_H,
    fill: solid(l.background),
    color: l.text,
    fontSize: TYPE.body,
    fontWeight: 600,
    cornerRadius: RADIUS.control,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    bindings: {
      label: 'item.label',
      //three jobs, three looks: the answer you mean, the one that destroys something (red, so it can't be pressed in
      //passing), and the ways out
      'fill.color': `item.danger ? "${l.error}" : item.main ? "${l.button}" : "${l.background}"`,
      color: `item.danger ? "${l.background}" : item.main ? "${l.onButton}" : "${l.text}"`,
      'stroke.paint.color': `item.danger ? "${l.error}" : "${l.border}"`,
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
