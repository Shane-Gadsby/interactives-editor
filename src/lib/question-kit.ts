//The question kit's document side: "Add question" builds a frame of ordinary layers (prompt, an option layer repeated per
//option, buttons, feedback), the variables the question keeps and the few interaction nodes that run it. After that the
//question settings can be changed any time: syncQuestion brings the variables, the answer area and the graph in line with
//them and never touches the look of layers it already made. Pure functions over a project draft (see store.update).
import {
  CATALOG_BY_KIND,
  QUESTION_SUFFIXES,
  buildItems,
  createNode,
  defaultAutoLayout,
  defaultParams,
  isContainer,
  newQuestion,
  questionVars,
  renamePrefix,
  uid,
  varName,
  walk,
  type Artboard,
  type ContainerNode,
  type FrameNode,
  type LogicNode,
  type Project,
  type Question,
  type QuestionKind,
  type SceneNode,
  type Variable,
} from 'interactives-player';
import { locate, uniqueName, nodeNames } from '../store/doc';

//The look a new question starts with. Everything is a plain layer afterwards: change any of it.
const INK = '#1b2333';
const MUTED = '#5b6577';
const LINE = '#cfd6e0';
const ACCENT = '#3b5bfd';
const SELECTED_BG = '#e8edff';
const OK = '#0a7d33';
const OK_BG = '#e3f6e9';
const BAD = '#b3261e';
const BAD_BG = '#fde8e6';
const MISS = '#8a5a00';
const MISS_BG = '#fff4d6';

type Style = 'radio' | 'check' | 'blank' | 'order';

export const bodyStyle = (kind: QuestionKind): Style => (kind === 'multiple' ? 'check' : kind === 'blank' ? 'blank' : kind === 'ordering' ? 'order' : 'radio');

export const RESET_LABELS = { again: 'Try again', next: 'Next question' };

const solid = (color: string) => ({ type: 'solid' as const, color });
const stroke = (color: string, width = 1.5) => ({ paint: solid(color), width });
const row = (gap: number) => ({ ...defaultAutoLayout('row'), gap, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'center' as const, hugHeight: true });
const column = (gap: number) => ({ ...defaultAutoLayout('column'), gap, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch' as const });

/** The part name of a layer: `options:radio` is the part `options`. */
export const partOf = (n: SceneNode): string => (n.questionPart ?? '').split(':')[0];

/** A question frame's marked layers by part name, in layer order. */
export function partsOf(frame: ContainerNode): Record<string, SceneNode[]> {
  const out: Record<string, SceneNode[]> = {};
  walk(frame.children, (n) => {
    const p = partOf(n);
    if (p) (out[p] ??= []).push(n);
  });
  return out;
}

export const questionFrames = (ab: Artboard): FrameNode[] => {
  const out: FrameNode[] = [];
  walk(ab.children as SceneNode[], (n) => {
    if (n.type === 'frame' && n.question) out.push(n);
  });
  return out;
};

/** The first `base1`, `base2`, ... prefix no question in the project uses. */
export function freePrefix(p: Project, base = 'q'): string {
  const used = new Set<string>();
  for (const ab of p.artboards) for (const f of questionFrames(ab)) used.add(f.question!.prefix);
  for (const v of p.variables) {
    const m = /^(.+?)_(?:prompt|items|answered)$/.exec(v.name);
    if (m) used.add(m[1]);
  }
  for (let i = 1; ; i++) if (!used.has(`${base}${i}`)) return `${base}${i}`;
}

/** Other question frames in the project that keep their variables under the same prefix as this one. */
export function sharedPrefix(p: Project, frame: FrameNode): FrameNode[] {
  const out: FrameNode[] = [];
  for (const ab of p.artboards) for (const f of questionFrames(ab)) if (f.id !== frame.id && f.question!.prefix === frame.question!.prefix) out.push(f);
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
//Layers

const STATE_FILL = (c: string) => `item.state == "correct" ? "${OK_BG}" : item.state == "wrong" ? "${BAD_BG}" : item.state == "missed" ? "${MISS_BG}" : ${c}`;
const STATE_LINE = (c: string) => `item.state == "correct" ? "${OK}" : item.state == "wrong" ? "${BAD}" : item.state == "missed" ? "${MISS}" : ${c}`;
const STATE_WORDS = '{item.state == "correct" ? "✓ Right" : item.state == "wrong" ? "✗ Wrong" : item.state == "missed" ? "← Right answer" : ""}';
const STATE_DESCRIPTION = 'item.state == "correct" ? "Right" : item.state == "wrong" ? "Wrong" : item.state == "missed" ? "This was the right answer" : ""';

function text(name: string, part: string, value: string, o: Record<string, unknown> = {}): SceneNode {
  return createNode('text', { name, questionPart: part, text: value, fontSize: 16, color: INK, autoSize: 'height', width: 200, height: 24, ...o });
}

function button(name: string, part: string, label: string, primary: boolean, bindings?: Record<string, string>): SceneNode {
  return createNode('button', {
    name,
    questionPart: part,
    label,
    width: 150,
    height: 44,
    fill: solid(primary ? ACCENT : '#eef1f8'),
    color: primary ? '#ffffff' : INK,
    ...(bindings ? { bindings } : {}),
  });
}

function optionTemplate(style: Style): SceneNode {
  const base = { height: 52, fill: solid('#ffffff'), cornerRadius: 10, clip: false };
  if (style === 'order') {
    return createNode('frame', {
      ...base,
      name: 'Item',
      questionPart: 'option',
      stroke: stroke(LINE),
      layout: { ...row(12), padding: { top: 10, right: 12, bottom: 10, left: 16 } },
      bindings: { 'fill.color': STATE_FILL('"#ffffff"'), 'stroke.paint.color': STATE_LINE(`"${LINE}"`), ariaDescription: STATE_DESCRIPTION },
      children: [
        text('Number', 'optionNumber', '{item.number}.', { width: 28, color: MUTED, fontWeight: 600, decorative: true }),
        text('Label', 'optionLabel', '{item.text}', { layoutItem: { width: 'fill' } }),
        text('Result', 'optionState', STATE_WORDS, { fontSize: 13, fontWeight: 600, color: MUTED, autoSize: 'width', width: 90, decorative: true }),
        createNode('button', { name: 'Move up', questionPart: 'moveUp', label: '↑', width: 40, height: 36, fill: solid('#eef1f8'), color: INK, bindings: { ariaLabel: '"Move " + item.text + " up"' } }),
        createNode('button', { name: 'Move down', questionPart: 'moveDown', label: '↓', width: 40, height: 36, fill: solid('#eef1f8'), color: INK, bindings: { ariaLabel: '"Move " + item.text + " down"' } }),
      ],
    });
  }
  const checkbox = style === 'check';
  const markerBase = { name: 'Marker', questionPart: 'marker', width: 22, height: 22, fill: solid('#ffffff'), stroke: stroke('#8a94a6', 2), decorative: true, bindings: { 'fill.color': 'item.selected ? "' + ACCENT + '" : "#ffffff"', 'stroke.paint.color': 'item.selected ? "' + ACCENT + '" : "#8a94a6"' } };
  return createNode('frame', {
    ...base,
    name: 'Option',
    questionPart: 'option',
    role: checkbox ? 'checkbox' : 'radio',
    focusable: true,
    stroke: stroke(LINE),
    layout: { ...row(12), padding: { top: 12, right: 16, bottom: 12, left: 16 } },
    bindings: {
      ariaChecked: 'item.selected',
      ariaLabel: 'item.text',
      ariaDescription: STATE_DESCRIPTION,
      'fill.color': STATE_FILL(`item.selected ? "${SELECTED_BG}" : "#ffffff"`),
      'stroke.paint.color': STATE_LINE(`item.selected ? "${ACCENT}" : "${LINE}"`),
    },
    children: [
      checkbox ? createNode('rect', { ...markerBase, cornerRadius: 5 }) : createNode('ellipse', markerBase),
      text('Label', 'optionLabel', '{item.text}', { layoutItem: { width: 'fill' }, decorative: true }),
      text('Result', 'optionState', STATE_WORDS, { fontSize: 13, fontWeight: 600, color: MUTED, autoSize: 'width', width: 110, decorative: true }),
    ],
  });
}

function optionsBody(q: Question, style: Style): SceneNode {
  const items = varName(q, 'items');
  return createNode('frame', {
    name: style === 'order' ? 'Items' : 'Options',
    questionPart: `options:${style}`,
    fill: null,
    stroke: null,
    clip: false,
    // A group of radio buttons is named by the question; the checkboxes and the ordering list are just a group
    ...(style === 'radio' ? { role: 'radiogroup' as const, bindings: { ariaLabel: varName(q, 'prompt') } } : {}),
    layout: column(10),
    repeat: { items, layout: 'none', gap: 0, columns: 1 },
    children: [optionTemplate(style)],
  });
}

function blankRow(q: Question, i: number, variableId: string): SceneNode {
  const items = varName(q, 'items');
  const at = `${items}[${i}]`;
  return createNode('frame', {
    name: `Blank ${i + 1}`,
    questionPart: 'blankRow',
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...column(6), align: 'stretch' as const },
    children: [
      text('Blank label', 'blankLabel', q.blanks[i]?.label ?? '', { fontSize: 14, fontWeight: 600, color: MUTED, bindings: { text: `${at}?.label ?? ""` } }),
      createNode('input', {
        name: 'Blank input',
        questionPart: 'blankInput',
        placeholder: 'Your answer',
        ariaLabel: q.blanks[i]?.label || 'Answer',
        variableId,
        width: 280,
        height: 44,
        bindings: { 'stroke.paint.color': `${at}?.state == "correct" ? "${OK}" : ${at}?.state == "wrong" ? "${BAD}" : "#c4c4c4"`, ariaLabel: `${at}?.label || "Answer"` },
      }),
      text('Blank answer', 'blankAnswer', `{${at}?.answer ? "Accepted answer: " + ${at}.answer : ""}`, { fontSize: 13, color: MISS, bindings: { visible: `!!${at}?.answer` } }),
    ],
  });
}

function blanksBody(q: Question, variableIds: string[]): SceneNode {
  return createNode('frame', {
    name: 'Blanks',
    questionPart: 'blanks',
    fill: null,
    stroke: null,
    clip: false,
    layout: column(14),
    children: q.blanks.map((_, i) => blankRow(q, i, variableIds[i])),
  });
}

/** The default look of the Try again / Next question button for this question. */
export const resetLabel = (q: Question): string => (q.bank ? RESET_LABELS.next : RESET_LABELS.again);
const resetVisible = (q: Question): string => (q.bank ? varName(q, 'locked') : `${varName(q, 'locked')} && !${varName(q, 'correct')}`);

function frameFor(q: Question, blankVars: string[], at: { x: number; y: number }): FrameNode {
  const p = (s: string) => varName(q, s);
  const style = bodyStyle(q.kind);
  const body = style === 'blank' ? blanksBody(q, blankVars) : optionsBody(q, style);
  return createNode('frame', {
    name: 'Question',
    x: at.x,
    y: at.y,
    width: 640,
    height: 420,
    role: 'region',
    question: q,
    fill: solid('#ffffff'),
    stroke: stroke('#dfe3ea', 1),
    cornerRadius: 14,
    clip: false,
    shadow: { x: 0, y: 4, blur: 16, spread: 0, color: 'rgba(20,30,60,0.10)' },
    bindings: { ariaLabel: `"Question: " + ${p('prompt')}` },
    layout: { ...defaultAutoLayout('column'), gap: 16, padding: { top: 24, right: 24, bottom: 24, left: 24 }, align: 'stretch', hugHeight: true },
    children: [
      text('Prompt', 'prompt', `{${p('prompt')}}`, { role: 'heading', headingLevel: 3, fontSize: 20, fontWeight: 600, lineHeight: 1.35 }),
      body,
      text('Hint text', 'hintText', `Hint: {${p('hint')}}`, { fontSize: 14, fontStyle: 'italic', color: MUTED, bindings: { visible: `${p('hint')} != ""` } }),
      text('Feedback', 'feedback', `{${p('feedback')}}`, {
        fontWeight: 600,
        bindings: { visible: `${p('feedback')} != ""`, color: `${p('answered')} ? (${p('correct')} ? "${OK}" : "${BAD}") : "${MUTED}"` },
      }),
      createNode('frame', {
        name: 'Buttons',
        questionPart: 'buttons',
        fill: null,
        stroke: null,
        clip: false,
        layout: { ...row(12), align: 'center' },
        children: [
          button('Check answer', 'check', 'Check answer', true, { disabled: p('locked') }),
          button('Hint', 'hint', 'Hint', false, { visible: `${p('hintsLeft')} > 0 && !${p('locked')}` }),
          button('Try again', 'reset', resetLabel(q), false, { visible: resetVisible(q) }),
          text('Score', 'score', `Score: {${p('score')}}`, { fontWeight: 600, color: MUTED, autoSize: 'width', width: 90, bindings: { visible: p('locked') } }),
        ],
      }),
    ],
  }) as FrameNode;
}

// ---------------------------------------------------------------------------------------------------------------------
//Variables

/** Make sure the question's variables exist, and the ones the settings decide (starting prompt, items, hints left) match them. */
function ensureVariables(d: Project, q: Question): Variable[] {
  const out: Variable[] = [];
  for (const def of questionVars(q)) {
    const name = varName(q, def.suffix);
    let v = d.variables.find((x) => x.name === name);
    if (!v) {
      v = { id: uid('v'), name, type: def.type, initial: def.initial };
      d.variables.push(v);
    } else if (['prompt', 'items', 'triesLeft', 'hintsLeft'].includes(def.suffix)) v.initial = def.initial;
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
//The interaction graph

interface Slot {
  /** Which event node and which action node of the question this wire is (several events can feed one action). */
  eventSlot: string;
  actionSlot: string;
  event: { kind: string; params: Record<string, unknown> };
  action: { kind: string; params: Record<string, unknown> };
}

/** The data source a bank expression starts from (`quiz` or `quiz.items` -> the source named quiz). */
export function bankSource(p: Project, expr: string | undefined): string | null {
  const head = /^\s*([A-Za-z_$][\w$]*)/.exec(expr ?? '')?.[1];
  const name = head === 'data' ? /^\s*data\s*\.\s*([A-Za-z_$][\w$]*)/.exec(expr ?? '')?.[1] : head;
  return name && p.dataSources.some((s) => s.name === name) ? name : null;
}

function wantedSlots(d: Project, frame: FrameNode, q: Question): Slot[] {
  const parts = partsOf(frame);
  const id = (part: string) => parts[part]?.[0]?.id;
  const resetAction = { kind: 'action.questionReset', params: { question: frame.id, next: true } };
  const out: Slot[] = [{ eventSlot: 'start:event', actionSlot: 'start:action', event: { kind: 'event.start', params: {} }, action: resetAction }];
  const source = q.bank ? bankSource(d, q.bank.items) : null;
  if (source) out.push({ eventSlot: 'dataLoaded:event', actionSlot: 'start:action', event: { kind: 'event.dataLoaded', params: { source } }, action: resetAction });
  const click = (part: string, actionKind: string, extra: Record<string, unknown> = {}) => {
    const target = id(part);
    if (target) out.push({ eventSlot: `${part}:event`, actionSlot: `${part}:action`, event: { kind: 'event.pointer', params: { target, type: 'click' } }, action: { kind: actionKind, params: { question: frame.id, ...extra } } });
  };
  const style = bodyStyle(q.kind);
  if (style === 'radio' || style === 'check') click('option', 'action.questionChoose', { option: 'event.index' });
  if (style === 'order') {
    click('moveUp', 'action.questionMove', { item: 'event.index', direction: 'up' });
    click('moveDown', 'action.questionMove', { item: 'event.index', direction: 'down' });
  }
  click('check', 'action.questionCheck');
  click('hint', 'action.questionHint');
  click('reset', 'action.questionReset', { next: true });
  return out;
}

/** Create the nodes and wires the question needs that are not there yet, repoint the ones that are, and remove the ones whose layer or setting has gone. */
function ensureGraph(d: Project, ab: Artboard, frame: FrameNode, q: Question): void {
  const wanted = wantedSlots(d, frame, q);
  const logic = ab.logic;
  const mine = (n: LogicNode) => n.kit?.frame === frame.id;
  const keep = new Set<string>();
  //A wire is an event node and the action it runs, side by side. New rows go below everything else in the graph.
  const existingMine = logic.nodes.filter(mine);
  let nextY = existingMine.length ? Math.max(...existingMine.map((n) => n.y)) + 110 : logic.nodes.length ? Math.max(...logic.nodes.map((n) => n.y)) + 160 : 40;
  const startX = existingMine.length ? Math.min(...existingMine.map((n) => n.x)) : 40;
  const find = (slot: string) => logic.nodes.find((n) => mine(n) && n.kit!.slot === slot);
  for (const w of wanted) {
    let ev = find(w.eventSlot);
    let ac = find(w.actionSlot);
    if (!ev) {
      ev = { id: uid('l'), kind: w.event.kind, x: startX, y: ac ? ac.y : nextY, params: { ...defaultParams(w.event.kind), ...w.event.params }, kit: { frame: frame.id, slot: w.eventSlot } };
      logic.nodes.push(ev);
      if (!ac) nextY += 110;
    }
    if (!ac) {
      ac = { id: uid('l'), kind: w.action.kind, x: startX + 320, y: ev.y, params: { ...defaultParams(w.action.kind), ...w.action.params }, kit: { frame: frame.id, slot: w.actionSlot } };
      logic.nodes.push(ac);
    }
    //Repoint what the kit owns (the layer or question the node is about) and leave the rest as the person set it
    const own = w.event.kind === 'event.pointer' ? ['target'] : w.event.kind === 'event.dataLoaded' ? ['source'] : [];
    for (const k of own) ev.params[k] = w.event.params[k];
    ac.params.question = frame.id;
    keep.add(ev.id);
    keep.add(ac.id);
    const evId = ev.id;
    const acId = ac.id;
    if (!logic.edges.some((e) => e.from === evId && e.to === acId && e.fromPort === 'out' && e.toPort === 'in')) {
      logic.edges.push({ id: uid('e'), from: evId, fromPort: 'out', to: acId, toPort: 'in' });
    }
  }
  //Report the result when the question finishes (the Results settings' Report result node), off the Check answer node's finished port
  const check = find('check:action');
  if (q.report && check) {
    let rep = find('report:action');
    if (!rep) {
      rep = { id: uid('l'), kind: 'action.reportResult', x: check.x + 320, y: check.y + 40, params: { ...defaultParams('action.reportResult'), score: varName(q, 'score') }, kit: { frame: frame.id, slot: 'report:action' } };
      logic.nodes.push(rep);
    }
    rep.params.completed = q.report;
    keep.add(rep.id);
    const repId = rep.id;
    if (!logic.edges.some((e) => e.from === check.id && e.fromPort === 'finished' && e.to === repId)) logic.edges.push({ id: uid('e'), from: check.id, fromPort: 'finished', to: repId, toPort: 'in' });
  }
  //Drop the kit's nodes for things that are not there any more (a deleted button, a setting that turned a piece off)
  const gone = new Set(logic.nodes.filter((n) => mine(n) && !keep.has(n.id)).map((n) => n.id));
  if (gone.size) {
    logic.nodes = logic.nodes.filter((n) => !gone.has(n.id));
    logic.edges = logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
//Keeping the layers in line with the settings

/** Every place in the project text that names a question's variables: layer bindings and text, repeaters, graph expressions. */
function renameEverywhere(d: Project, from: string, to: string, only?: FrameNode): void {
  const fix = (s: string) => renamePrefix(s, from, to);
  let walked = false;
  for (const ab of d.artboards) {
    walk(only ? (walked ? [] : [only]) : (ab.children as SceneNode[]), (n) => {
      if (n.bindings) for (const k of Object.keys(n.bindings)) n.bindings[k] = fix(n.bindings[k]);
      if (n.type === 'text') {
        n.text = fix(n.text);
        for (const r of n.runs ?? []) r.text = fix(r.text);
      }
      if (n.type === 'button') n.label = fix(n.label);
      if (isContainer(n) && n.repeat) n.repeat.items = fix(n.repeat.items);
    });
    for (const l of ab.logic.nodes) if (!only || l.kit?.frame === only.id) for (const [k, v] of Object.entries(l.params)) if (typeof v === 'string') l.params[k] = fix(v);
    walked = true;
  }
}

/** Add or remove blank rows so there is one per blank in the settings; new rows copy the last one's look. */
function syncBlankRows(frame: FrameNode, q: Question, variables: Variable[]): void {
  const container = partsOf(frame).blanks?.[0] as FrameNode | undefined;
  if (!container) return;
  const rows = container.children.filter((c) => partOf(c) === 'blankRow');
  const varIds = q.blanks.map((_, i) => variables.find((v) => v.name === varName(q, `blank${i + 1}`))!.id);
  while (rows.length > q.blanks.length) {
    const gone = rows.pop()!;
    container.children = container.children.filter((c) => c.id !== gone.id);
  }
  while (rows.length < q.blanks.length) {
    const i = rows.length;
    const made = blankRow(q, i, varIds[i]);
    const last = rows[rows.length - 1];
    if (last) {
      //Copy the previous row's look, with this row's own ids and index
      const copy = JSON.parse(JSON.stringify(last)) as SceneNode;
      const reid = (n: SceneNode) => {
        n.id = uid('n');
        if (isContainer(n)) n.children.forEach(reid);
      };
      reid(copy);
      const old = new RegExp(`\\[${i - 1}\\]`, 'g');
      walk([copy], (n) => {
        if (n.bindings) for (const k of Object.keys(n.bindings)) n.bindings[k] = n.bindings[k].replace(old, `[${i}]`);
        if (n.type === 'text') n.text = n.text.replace(old, `[${i}]`);
        if (n.type === 'input') n.variableId = varIds[i];
      });
      copy.name = `Blank ${i + 1}`;
      container.children.push(copy);
      rows.push(copy);
    } else {
      container.children.push(made);
      rows.push(made);
    }
  }
  rows.forEach((r, i) => {
    walk([r], (n) => {
      if (n.type === 'input') n.variableId = varIds[i];
    });
  });
}

/**
 * Bring a question frame's variables, answer area and graph in line with its settings. `before` is what the settings were
 * (a changed prefix renames the variables and what refers to them; a changed type rebuilds the answer area). Layers the person
 * already restyled keep their look: only what the settings decide is written.
 */
export function syncQuestion(d: Project, abId: string, frameId: string, before?: Question | null): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const loc = ab && locate(ab, frameId);
  const frame = loc?.node;
  if (!ab || !frame || frame.type !== 'frame' || !frame.question) return;
  const q = frame.question;
  if (before && before.prefix !== q.prefix) {
    //Rename in place when nobody else keeps variables under the old prefix (a copy that is being made independent leaves
    //its original alone); the new variables are created below
    const othersUse = d.artboards.some((a) => questionFrames(a).some((f) => f.id !== frame.id && f.question!.prefix === before.prefix));
    if (othersUse) renameEverywhere(d, before.prefix, q.prefix, frame as FrameNode);
    else renameEverywhere(d, before.prefix, q.prefix);
    if (!othersUse) {
      for (const v of d.variables) {
        const m = new RegExp(`^${before.prefix.replace(/\$/g, '\\$')}_(.+)$`).exec(v.name);
        if (m && (QUESTION_SUFFIXES.includes(m[1]) || /^blank\d+$/.test(m[1])) && !d.variables.some((x) => x.name === `${q.prefix}_${m[1]}`)) v.name = `${q.prefix}_${m[1]}`;
      }
    }
  }
  const variables = ensureVariables(d, q);
  const style = bodyStyle(q.kind);
  const parts = partsOf(frame);
  const bodyNow = parts.blanks?.[0] ? 'blank' : (parts.options?.[0]?.questionPart ?? '').split(':')[1];
  if (bodyNow !== style) {
    //A different kind of answer needs a different answer area
    const old = parts.blanks?.[0] ?? parts.options?.[0];
    const blankVars = q.blanks.map((_, i) => variables.find((v) => v.name === varName(q, `blank${i + 1}`))?.id ?? '');
    const body = style === 'blank' ? blanksBody(q, blankVars) : optionsBody(q, style);
    const names = nodeNames(ab);
    body.name = uniqueName(names, body.name);
    if (old) {
      const at = locate(ab, old.id);
      if (at) at.siblings.splice(at.index, 1, body);
    } else (frame as FrameNode).children.splice(1, 0, body);
  } else if (style === 'blank') syncBlankRows(frame, q, variables);
  //The reset button's wording and when it shows depend on there being a bank. Only the default wording follows.
  const reset = partsOf(frame).reset?.[0];
  if (reset && reset.type === 'button') {
    if (!before || Boolean(before.bank) !== Boolean(q.bank)) {
      const other = before?.bank ? RESET_LABELS.next : RESET_LABELS.again;
      if (reset.label === other || !before) reset.label = resetLabel(q);
      reset.bindings = { ...(reset.bindings ?? {}), visible: resetVisible(q) };
    }
  }
  ensureGraph(d, ab, frame as FrameNode, q);
}

// ---------------------------------------------------------------------------------------------------------------------
//Entry points

/** Add a question of a kind to an artboard (or inside a frame). Returns the new frame's id. */
export function addQuestion(d: Project, abId: string, kind: QuestionKind, opts: { parentId?: string | null; at?: { x: number; y: number } } = {}): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return null;
  const q = newQuestion(kind, freePrefix(d));
  const variables = ensureVariables(d, q);
  const blankVars = q.blanks.map((_, i) => variables.find((v) => v.name === varName(q, `blank${i + 1}`))!.id);
  const at = opts.at ?? { x: Math.max(0, (ab.width - 640) / 2), y: 40 };
  const frame = frameFor(q, blankVars, at);
  const names = nodeNames(ab);
  frame.name = uniqueName(names, `Question ${q.prefix.replace(/^\D+/, '') || ''}`.trim());
  const parent = opts.parentId ? locate(ab, opts.parentId)?.node : null;
  if (parent && isContainer(parent)) parent.children.push(frame);
  else ab.children.push(frame);
  ensureGraph(d, ab, frame, q);
  return frame.id;
}

/** Change a question's settings and bring everything in line. */
export function setQuestionSettings(d: Project, abId: string, frameId: string, patch: Partial<Question>): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = ab && locate(ab, frameId)?.node;
  if (!frame || frame.type !== 'frame' || !frame.question) return;
  const before = JSON.parse(JSON.stringify(frame.question)) as Question;
  frame.question = { ...frame.question, ...patch };
  syncQuestion(d, abId, frameId, before);
}

/** A copied question shares its original's variables. Give it its own, keeping its layers. */
export function makeIndependent(d: Project, abId: string, frameId: string): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = ab && locate(ab, frameId)?.node;
  if (!frame || frame.type !== 'frame' || !frame.question) return;
  setQuestionSettings(d, abId, frameId, { prefix: freePrefix(d, frame.question.prefix.replace(/\d+$/, '') || 'q') });
}

/** Remove the kit's graph nodes whose question frame is not on the artboard any more. */
export function dropOrphanKitNodes(ab: Artboard): void {
  const frames = new Set(questionFrames(ab).map((f) => f.id));
  const gone = new Set(ab.logic.nodes.filter((n) => n.kit && !frames.has(n.kit.frame)).map((n) => n.id));
  if (!gone.size) return;
  ab.logic.nodes = ab.logic.nodes.filter((n) => !gone.has(n.id));
  ab.logic.edges = ab.logic.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to));
}

/**
 * Layers were just added by copy, paste or duplicate. A copied question shares its original's variables, so it gets its own
 * (and its own interaction nodes); a pasted one whose original is gone just gets its wiring back.
 */
export function adoptQuestions(d: Project, abId: string, nodeIds: string[]): void {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return;
  const frames: string[] = [];
  for (const id of nodeIds) {
    const n = locate(ab, id)?.node;
    if (n) walk([n], (x) => void (x.type === 'frame' && x.question && frames.push(x.id)));
  }
  for (const id of frames) {
    const f = locate(ab, id)?.node;
    if (!f || f.type !== 'frame') continue;
    if (sharedPrefix(d, f).length) makeIndependent(d, abId, id);
    else syncQuestion(d, abId, id);
  }
  dropOrphanKitNodes(ab);
}

export { buildItems };
export const KIT_CATALOG = ['action.questionCheck', 'action.questionReset', 'action.questionHint', 'action.questionChoose', 'action.questionMove'].filter((k) => CATALOG_BY_KIND[k]);
