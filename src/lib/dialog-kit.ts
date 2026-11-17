//The dialog kit: ready-made modals, prompts and tooltips. Each one builds ordinary layers, the variables it keeps and the
//few interaction nodes that run it, then gets out of the way: there's no second settings panel, so the Inspector edits the
//text, the buttons and the look the same as any other layer. Pure functions over a project draft (see store.update).
import { createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type LogicNode, type Project, type SceneNode, type Variable } from 'interactives-player';
import { defaultParams } from 'interactives-player';
import { lookFor } from './themes';

export type DialogKind = 'modal' | 'prompt' | 'tooltip';

export const DIALOG_KINDS: { value: DialogKind; label: string; hint: string }[] = [
  { value: 'modal', label: 'Modal', hint: 'A box over the page with a title, some words and a Close button' },
  { value: 'prompt', label: 'Prompt', hint: 'A modal that asks something, with buttons you can add to and rename' },
  { value: 'tooltip', label: 'Tooltip', hint: 'A small box that shows while you hover or focus a layer, and can hold links and buttons' },
];

const solid = (color: string) => ({ type: 'solid' as const, color });

/** A name nothing else on the artboard is using. */
function uniqueName(taken: Set<string>, want: string): string {
  if (!taken.has(want)) {
    taken.add(want);
    return want;
  }
  for (let i = 2; ; i++) {
    const n = `${want} ${i}`;
    if (!taken.has(n)) {
      taken.add(n);
      return n;
    }
  }
}

function namesOn(ab: Artboard): Set<string> {
  const out = new Set<string>();
  const walk = (list: SceneNode[]) => {
    for (const n of list) {
      out.add(n.name);
      if ('children' in n && Array.isArray(n.children)) walk(n.children as SceneNode[]);
    }
  };
  walk(ab.children);
  return out;
}

/** A variable name nothing in the project is using, from a stem like `dialog1`. */
function freeStem(d: Project, base: string): string {
  const used = new Set(d.variables.map((v) => v.name));
  for (let i = 1; ; i++) if (!used.has(`${base}${i}Open`)) return `${base}${i}`;
}

function addVariable(d: Project, v: Omit<Variable, 'id'>): string {
  const full: Variable = { id: uid('v'), ...v };
  d.variables.push(full);
  return full.id;
}

/** An event node and the actions it runs, laid out as a row below whatever is in the graph already. */
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

//Graph nodes name a variable by its id; expressions inside a value name it the way an author writes it
const setVar = (variableId: string, value: string) => ({ kind: 'action.setVariable', params: { variable: variableId, op: 'set', value } });

/**
 * Add a modal, a prompt or a tooltip to an artboard. Gives back the id of the layer it made, or null when there's no such
 * artboard. `at` is where it goes; a modal and a prompt are centred on the page when it isn't given.
 */
export function addDialog(d: Project, abId: string, kind: DialogKind, opts: { parentId?: string | null; at?: { x: number; y: number } } = {}): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return null;
  const l = lookFor(d.themes);
  const names = namesOn(ab);
  const made = kind === 'tooltip' ? buildTooltip(d, ab, l, names, opts.at) : buildBox(d, ab, l, names, kind, opts.at);
  const parent = opts.parentId ? findNode(ab.children, opts.parentId) : null;
  if (parent && 'children' in parent && Array.isArray(parent.children)) (parent.children as SceneNode[]).push(made);
  else ab.children.push(made);
  return made.id;
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

/** The modal and the prompt: the same box, with a different bottom row. */
function buildBox(d: Project, ab: Artboard, l: Record<string, string>, names: Set<string>, kind: 'modal' | 'prompt', at?: { x: number; y: number }): FrameNode {
  const stem = freeStem(d, kind === 'prompt' ? 'prompt' : 'dialog');
  const openVar = `${stem}Open`;
  const openId = addVariable(d, { name: openVar, label: kind === 'prompt' ? 'Prompt showing' : 'Dialog showing', type: 'boolean', initial: false });

  const width = Math.min(480, Math.max(280, ab.width - 80));
  const x = at ? at.x : Math.round((ab.width - width) / 2);
  const y = at ? at.y : Math.round(Math.max(24, ab.height / 2 - 110));

  const title = createNode('text', {
    name: uniqueName(names, 'Title'),
    text: kind === 'prompt' ? 'Are you sure?' : 'A heading',
    fontSize: 20,
    fontWeight: 700,
    color: l.text,
    width: width - 48,
    height: 28,
    role: 'heading',
    headingLevel: 2,
  });
  const body = createNode('text', {
    name: uniqueName(names, 'Message'),
    text: kind === 'prompt' ? 'This cannot be undone.' : 'Write what this is about here.',
    fontSize: 16,
    color: l.text,
    width: width - 48,
    height: 44,
    autoSize: 'height',
  });

  const row = createNode('frame', {
    name: uniqueName(names, 'Buttons'),
    width: width - 48,
    height: 40,
    fill: null,
    layout: { ...defaultAutoLayout('row'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'end', align: 'center', hugHeight: true },
  }) as FrameNode;

  const frame = createNode('frame', {
    name: uniqueName(names, kind === 'prompt' ? 'Prompt' : 'Dialog'),
    x,
    y,
    width,
    height: 200,
    fill: solid(l.surface),
    cornerRadius: 12,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    shadow: { x: 0, y: 12, blur: 32, spread: 0, color: 'rgba(0,0,0,0.25)' },
    visible: false,
    layout: { ...defaultAutoLayout('column'), gap: 16, padding: { top: 24, right: 24, bottom: 24, left: 24 }, align: 'stretch', hugHeight: true },
    bindings: { visible: openVar },
    ariaLabel: kind === 'prompt' ? 'Are you sure?' : 'A heading',
    dialog: {
      openVariable: openVar,
      modal: true,
      scrim: solid('rgba(0,0,0,0.5)'),
      closeOnEscape: true,
      closeOnOutsideClick: kind === 'modal',
      returnFocus: true,
    },
    children: [title, body, row],
  }) as FrameNode;

  if (kind === 'modal') {
    const close = createNode('button', { name: uniqueName(names, 'Close'), label: 'Close', width: 96, height: 40, fill: solid(l.button), color: l.onButton, cornerRadius: 8 });
    row.children.push(close);
    wire(ab, { kind: 'event.pointer', params: { target: close.id, type: 'click' } }, [setVar(openId, 'false')]);
  } else {
    //The buttons are a repeated list, so adding one is adding a row rather than copying a layer and rewiring it
    const buttonsVar = `${stem}Buttons`;
    const pickVar = `${stem}Pick`;
    const choiceVar = `${stem}Choice`;
    addVariable(d, { name: buttonsVar, label: 'Prompt buttons', type: 'list', initial: JSON.stringify([{ label: 'Cancel', value: 'cancel' }, { label: 'Yes, do it', value: 'yes' }]) });
    const pickId = addVariable(d, { name: pickVar, label: 'Button picked (position)', type: 'number', initial: -1 });
    const choiceId = addVariable(d, { name: choiceVar, label: 'What they chose', type: 'string', initial: '' });

    const button = createNode('button', {
      name: uniqueName(names, 'Prompt button'),
      label: 'Button',
      width: 120,
      height: 40,
      fill: solid(l.button),
      color: l.onButton,
      cornerRadius: 8,
      bindings: { label: 'item.label' },
    });
    row.children.push(button);
    row.repeat = { items: buttonsVar, layout: 'horizontal', gap: 8, columns: 1, select: { mode: 'one', variable: pickId } };

    //Picking a button writes what it stands for, closes the prompt, then puts the pick back to none so it opens clean again.
    //Every step guards on the pick, so the node firing again for the reset changes nothing
    wire(ab, { kind: 'event.variable', params: { variable: pickId } }, [
      setVar(choiceId, `${pickVar} >= 0 ? (${buttonsVar}[${pickVar}]?.value ?? "") : ${choiceVar}`),
      setVar(openId, `${pickVar} < 0 && ${openVar}`),
      setVar(pickId, '-1'),
    ]);
  }
  return frame;
}

/**
 * The tooltip: the thing you hover and the tip itself, both inside one wrapper, so moving the pointer off the target and
 * into the tip doesn't close it. That's what lets a tip hold a link or a button. Keyboard focus opens it too.
 */
function buildTooltip(d: Project, ab: Artboard, l: Record<string, string>, names: Set<string>, at?: { x: number; y: number }): FrameNode {
  const stem = freeStem(d, 'tooltip');
  const openVar = `${stem}Open`;
  const openId = addVariable(d, { name: openVar, label: 'Tooltip showing', type: 'boolean', initial: false });

  const x = at ? at.x : 40;
  const y = at ? at.y : 40;

  const tip = createNode('frame', {
    name: uniqueName(names, 'Tip'),
    x: 0,
    y: 0,
    width: 220,
    height: 48,
    fill: solid(l.surface),
    cornerRadius: 8,
    stroke: { paint: solid(l.border), width: 1, align: 'inside' },
    shadow: { x: 0, y: 6, blur: 18, spread: 0, color: 'rgba(0,0,0,0.2)' },
    visible: false,
    //A tooltip floats over the page: it never makes a page that fits its height any taller
    hugIgnore: true,
    role: 'region',
    layout: { ...defaultAutoLayout('column'), gap: 6, padding: { top: 10, right: 12, bottom: 10, left: 12 }, align: 'stretch', hugHeight: true },
    bindings: { visible: openVar },
    children: [
      createNode('text', { name: uniqueName(names, 'Tip text'), text: 'What this is for.', fontSize: 14, color: l.text, width: 196, height: 20, autoSize: 'height' }),
    ],
  }) as FrameNode;

  const target = createNode('button', {
    name: uniqueName(names, 'Hover me'),
    x: 0,
    y: 60,
    label: 'Hover me',
    width: 120,
    height: 40,
    fill: solid(l.surfaceMuted),
    color: l.text,
    cornerRadius: 8,
    ariaDescription: 'What this is for.',
  });

  const wrap = createNode('frame', {
    name: uniqueName(names, 'Tooltip'),
    x,
    y,
    width: 220,
    height: 100,
    fill: null,
    clip: false,
    hugIgnore: true,
    children: [tip, target],
  }) as FrameNode;

  //Hovering anywhere in the wrapper opens it, leaving the wrapper closes it, so the pointer can travel from the target
  //into the tip without it vanishing. Focus does the same for the keyboard
  wire(ab, { kind: 'event.pointer', params: { target: wrap.id, type: 'pointerenter' } }, [setVar(openId, 'true')]);
  wire(ab, { kind: 'event.pointer', params: { target: wrap.id, type: 'pointerleave' } }, [setVar(openId, 'false')]);
  wire(ab, { kind: 'event.focus', params: { target: target.id, type: 'focus' } }, [setVar(openId, 'true')]);
  wire(ab, { kind: 'event.focus', params: { target: target.id, type: 'blur' } }, [setVar(openId, 'false')]);
  return wrap;
}
