//The dialog kit: modals, prompts and tooltips. Each one is a page of its own, marked as an overlay, which belongs to no
//screen and is shown beside (or over) whatever layer points at it. Adding one builds that page and, when a layer is
//selected, links it straight away. The page holds ordinary layers, so the Inspector edits it like any other page.
//Pure functions over a project draft (see store.update).
import { createArtboard, createNode, defaultAutoLayout, uid, type Artboard, type FrameNode, type LogicNode, type Project, type SceneNode, type Variable } from 'interactives-player';
import { defaultParams } from 'interactives-player';
import { lookFor } from './themes';

export type DialogKind = 'modal' | 'prompt' | 'tooltip';

export const DIALOG_KINDS: { value: DialogKind; label: string; hint: string }[] = [
  { value: 'tooltip', label: 'Tooltip', hint: 'A small box beside the layer you point it at, while that layer is hovered or focused' },
  { value: 'modal', label: 'Modal', hint: 'A box over the whole page, opened by clicking the layer you point it at' },
  { value: 'prompt', label: 'Prompt', hint: 'A modal that asks something, with buttons you add to and rename as a list' },
];

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
  const size = kind === 'tooltip' ? { width: 240, height: 72 } : { width: 480, height: 200 };
  const page = createArtboard({
    name: freeName(names, kind === 'tooltip' ? 'Tooltip' : kind === 'prompt' ? 'Prompt' : 'Dialog'),
    ...size,
    canvasX: right + 120,
    canvasY: 0,
  });
  page.overlay = { kind, side: 'auto', offset: 8 };
  page.background = solid(l.surface);
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

/** The tooltip's own page: a line of words, with room around them. */
function fillTooltip(page: Artboard, l: Record<string, string>): void {
  page.clip = false;
  page.children = [
    createNode('text', {
      name: 'Tip text',
      x: 12,
      y: 10,
      width: page.width - 24,
      height: page.height - 20,
      text: 'What this is for.',
      fontSize: 14,
      color: l.text,
      autoSize: 'height',
    }),
  ];
}

/** The modal's and the prompt's page: a heading, a message and a row of buttons. */
function fillBox(d: Project, page: Artboard, l: Record<string, string>, kind: 'modal' | 'prompt'): void {
  const stem = freeStem(d, kind === 'prompt' ? 'prompt' : 'dialog');
  const openVar = `${stem}Open`;
  const openId = addVariable(d, { name: openVar, label: kind === 'prompt' ? 'Prompt showing' : 'Dialog showing', type: 'boolean', initial: false });
  page.overlay = { ...page.overlay!, openVariable: openId, scrim: solid('rgba(0,0,0,0.5)') };

  const inner = page.width - 48;
  const title = createNode('text', {
    name: 'Title',
    x: 24,
    y: 24,
    width: inner,
    height: 28,
    text: kind === 'prompt' ? 'Are you sure?' : 'A heading',
    fontSize: 20,
    fontWeight: 700,
    color: l.text,
    role: 'heading',
    headingLevel: 2,
  });
  const body = createNode('text', {
    name: 'Message',
    x: 24,
    y: 64,
    width: inner,
    height: 44,
    text: kind === 'prompt' ? 'This cannot be undone.' : 'Write what this is about here.',
    fontSize: 16,
    color: l.text,
    autoSize: 'height',
  });
  const row = createNode('frame', {
    name: 'Buttons',
    x: 24,
    y: page.height - 64,
    width: inner,
    height: 40,
    fill: null,
    layout: { ...defaultAutoLayout('row'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'end', align: 'center', hugHeight: true },
  }) as FrameNode;
  page.children = [title, body, row];

  if (kind === 'modal') {
    const close = createNode('button', { name: 'Close', label: 'Close', width: 96, height: 40, fill: solid(l.button), color: l.onButton, cornerRadius: 8 });
    row.children.push(close);
    wire(page, { kind: 'event.pointer', params: { target: close.id, type: 'click' } }, [setVar(openId, 'false')]);
    return;
  }

  //The prompt's buttons are a repeated list, so adding one is adding a row rather than copying a layer and rewiring it
  const buttonsVar = `${stem}Buttons`;
  const pickVar = `${stem}Pick`;
  const choiceVar = `${stem}Choice`;
  addVariable(d, { name: buttonsVar, label: 'Prompt buttons', type: 'list', initial: JSON.stringify([{ label: 'Cancel', value: 'cancel' }, { label: 'Yes, do it', value: 'yes' }]) });
  const pickId = addVariable(d, { name: pickVar, label: 'Button picked (position)', type: 'number', initial: -1 });
  const choiceId = addVariable(d, { name: choiceVar, label: 'What they chose', type: 'string', initial: '' });

  const button = createNode('button', {
    name: 'Prompt button',
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
