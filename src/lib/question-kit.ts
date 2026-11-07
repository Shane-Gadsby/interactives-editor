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
  isMultiple,
  newQuestion,
  questionVars,
  renamePrefix,
  serverMarkingProblem,
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
  type QuestionOption,
  type QuestionPair,
  type SceneNode,
  type Variable,
} from 'interactives-player';
import { locate, uniqueName, nodeNames } from '../store/doc';
import { lookFor } from './themes';

//The look a new question starts with: the starter colours (see lookFor), so a project with the starter tokens gets tokens and one
//without gets the toolbox Light values. Set when a question is added or synced. Everything is a plain layer afterwards: change any of it.
let L = lookFor(undefined);
const AREA_OFF = '#00000000';
const AREA_ON = '#fb940033';
const AREA_OK = '#2f6f1740';
const AREA_BAD = '#b3261e40';
const AREA_MISS = '#8a520040';

type Style = 'radio' | 'check' | 'blank' | 'order' | 'match' | 'spot';

export const bodyStyle = (kind: QuestionKind): Style =>
  kind === 'multiple' ? 'check' : kind === 'blank' ? 'blank' : kind === 'ordering' ? 'order' : kind === 'matching' ? 'match' : kind === 'hotspot' ? 'spot' : 'radio';

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

/** How many questions are set to be marked on the server, and how many of those can't be (they stay marked in the page). */
export function serverMarkedCounts(p: Project): { marked: number; inPage: number } {
  let marked = 0;
  let inPage = 0;
  for (const ab of p.artboards)
    for (const f of questionFrames(ab)) {
      if (!f.question!.serverMarked) continue;
      if (serverMarkingProblem(f.question!)) inPage++;
      else marked++;
    }
  return { marked, inPage };
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

const STATE_FILL = (c: string) => `item.state == "correct" ? "${L.successSurface}" : item.state == "wrong" ? "${L.errorSurface}" : item.state == "missed" ? "${L.warningSurface}" : ${c}`;
const STATE_LINE = (c: string) => `item.state == "correct" ? "${L.success}" : item.state == "wrong" ? "${L.error}" : item.state == "missed" ? "${L.warning}" : ${c}`;
const STATE_WORDS = '{item.state == "correct" ? "✓ Right" : item.state == "wrong" ? "✗ Wrong" : item.state == "missed" ? "← Right answer" : ""}';
const STATE_DESCRIPTION = 'item.state == "correct" ? "Right" : item.state == "wrong" ? "Wrong" : item.state == "missed" ? "This was the right answer" : ""';

function text(name: string, part: string, value: string, o: Record<string, unknown> = {}): SceneNode {
  return createNode('text', { name, questionPart: part, text: value, fontSize: 16, color: L.text, autoSize: 'height', width: 200, height: 24, ...o });
}

function button(name: string, part: string, label: string, primary: boolean, bindings?: Record<string, string>): SceneNode {
  return createNode('button', {
    name,
    questionPart: part,
    label,
    width: 150,
    height: 44,
    fill: solid(primary ? L.button : L.surfaceMuted),
    color: primary ? L.onButton : L.text,
    ...(bindings ? { bindings } : {}),
  });
}

function optionTemplate(style: Style): SceneNode {
  const base = { height: 52, fill: solid(L.background), cornerRadius: 10, clip: false };
  if (style === 'order') {
    return createNode('frame', {
      ...base,
      name: 'Item',
      questionPart: 'option',
      stroke: stroke(L.border),
      layout: { ...row(12), padding: { top: 10, right: 12, bottom: 10, left: 16 } },
      bindings: { 'fill.color': STATE_FILL(`"${L.background}"`), 'stroke.paint.color': STATE_LINE(`"${L.border}"`), ariaDescription: STATE_DESCRIPTION },
      children: [
        text('Number', 'optionNumber', '{item.number}.', { width: 28, color: L.muted, fontWeight: 600, decorative: true }),
        text('Label', 'optionLabel', '{item.text}', { layoutItem: { width: 'fill' } }),
        text('Result', 'optionState', STATE_WORDS, { fontSize: 13, fontWeight: 600, color: L.muted, autoSize: 'width', width: 90, decorative: true }),
        createNode('button', { name: 'Move up', questionPart: 'moveUp', label: '↑', width: 40, height: 36, fill: solid(L.surfaceMuted), color: L.text, bindings: { ariaLabel: '"Move " + item.text + " up"' } }),
        createNode('button', { name: 'Move down', questionPart: 'moveDown', label: '↓', width: 40, height: 36, fill: solid(L.surfaceMuted), color: L.text, bindings: { ariaLabel: '"Move " + item.text + " down"' } }),
      ],
    });
  }
  const checkbox = style === 'check';
  const markerBase = { name: 'Marker', questionPart: 'marker', width: 22, height: 22, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true, bindings: { 'fill.color': 'item.selected ? "' + L.primary + '" : "' + L.background + '"', 'stroke.paint.color': 'item.selected ? "' + L.primary + '" : "' + L.border + '"' } };
  return createNode('frame', {
    ...base,
    name: 'Option',
    questionPart: 'option',
    role: checkbox ? 'checkbox' : 'radio',
    focusable: true,
    stroke: stroke(L.border),
    layout: { ...row(12), padding: { top: 12, right: 16, bottom: 12, left: 16 } },
    bindings: {
      ariaChecked: 'item.selected',
      ariaLabel: 'item.text',
      ariaDescription: STATE_DESCRIPTION,
      'fill.color': STATE_FILL(`item.selected ? "${L.surfaceMuted}" : "${L.background}"`),
      'stroke.paint.color': STATE_LINE(`item.selected ? "${L.primary}" : "${L.border}"`),
    },
    children: [
      checkbox ? createNode('rect', { ...markerBase, cornerRadius: 5 }) : createNode('ellipse', markerBase),
      text('Label', 'optionLabel', '{item.text}', { layoutItem: { width: 'fill' }, decorative: true }),
      text('Result', 'optionState', STATE_WORDS, { fontSize: 13, fontWeight: 600, color: L.muted, autoSize: 'width', width: 110, decorative: true }),
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
      text('Blank label', 'blankLabel', q.blanks[i]?.label ?? '', { fontSize: 14, fontWeight: 600, color: L.muted, bindings: { text: `${at}?.label ?? ""` } }),
      createNode('input', {
        name: 'Blank input',
        questionPart: 'blankInput',
        placeholder: 'Your answer',
        ariaLabel: q.blanks[i]?.label || 'Answer',
        ...(q.blanks[i]?.spelling ? { noAssist: true } : {}),
        variableId,
        width: 280,
        height: 44,
        bindings: { 'stroke.paint.color': `${at}?.state == "correct" ? "${L.success}" : ${at}?.state == "wrong" ? "${L.error}" : "${L.border}"`, ariaLabel: `${at}?.label || "Answer"` },
      }),
      text('Blank answer', 'blankAnswer', `{${at}?.answer ? "Accepted answer: " + ${at}.answer : ""}`, { fontSize: 13, color: L.warning, bindings: { visible: `!!${at}?.answer` } }),
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


// ---------------------------------------------------------------------------------------------------------------------
//Matching: a static layer set per pair, because draggables can't sit inside a repeater

const TERM_W = 170;
const TERM_H = 52;
const TERM_PITCH = 76;
const AREA_W = 592;
const AREA_H = 280;

/** The binding scope's tag for a matching question's terms: only they go into its slots. */
const termTag = (q: Question) => `${q.prefix}-term`;
const itemAt = (q: Question, i: number) => `${varName(q, 'items')}[${i}]`;

/** The same state wording as the choice options, for any row reference (the repeater's `item`, or `q1_items[2]`). */
const stateFor = (ref: string) => {
  const r = `${ref}?`;
  return {
    fill: (c: string) => `${r}.state == "correct" ? "${L.successSurface}" : ${r}.state == "wrong" ? "${L.errorSurface}" : ${r}.state == "missed" ? "${L.warningSurface}" : ${c}`,
    line: (c: string) => `${r}.state == "correct" ? "${L.success}" : ${r}.state == "wrong" ? "${L.error}" : ${r}.state == "missed" ? "${L.warning}" : ${c}`,
    description: (right: string, wrong: string) => `${r}.state == "correct" ? "Right" : ${r}.state == "wrong" ? ${wrong} : ${r}.state == "missed" ? ${right} : ""`,
  };
};

/** A fixed order that is not the pairs' own, so the first deal is never already right (the player deals again when it starts). */
export function dealOrder(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let h = 7;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let i = n - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (n > 1 && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}

function matchTerm(q: Question, p: QuestionPair, i: number, slot: number): SceneNode {
  const st = stateFor(itemAt(q, i));
  return createNode('frame', {
    name: `Term ${i + 1}`,
    questionPart: `matchTerm:${p.id}`,
    x: 0,
    y: slot * TERM_PITCH,
    width: TERM_W,
    height: TERM_H,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    cornerRadius: 10,
    clip: false,
    layout: { ...row(8), padding: { top: 8, right: 12, bottom: 8, left: 12 }, hugHeight: false },
    ariaLabel: p.term,
    draggable: { tags: [termTag(q)], onMiss: 'return', label: p.term },
    shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(0,0,0,0.15)' },
    bindings: { 'fill.color': st.fill(`"${L.background}"`), 'stroke.paint.color': st.line(`"${L.border}"`) },
    children: [text('Term text', 'matchTermText', `{${itemAt(q, i)}?.text}`, { layoutItem: { width: 'fill' }, decorative: true })],
  });
}

function matchRow(q: Question, p: QuestionPair, i: number): SceneNode {
  const at = itemAt(q, i);
  const st = stateFor(at);
  return createNode('frame', {
    name: `Match ${i + 1}`,
    questionPart: `matchRow:${p.id}`,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...column(4), align: 'stretch' as const },
    children: [
      createNode('frame', {
        name: 'Match line',
        questionPart: 'matchLine',
        fill: null,
        stroke: null,
        clip: false,
        layout: row(12),
        children: [
          text('Definition', 'matchDefinition', `{${at}?.label}`, { layoutItem: { width: 'fill' } }),
          createNode('frame', {
            name: `Slot ${i + 1}`,
            questionPart: `matchZone:${p.id}`,
            width: TERM_W,
            height: TERM_H,
            fill: null,
            stroke: { ...stroke(L.border, 2), dash: [6, 4] },
            cornerRadius: 10,
            clip: false,
            dropZone: { accepts: [termTag(q)], capacity: 1, whenFull: 'swap', snap: 'center', label: p.match },
            bindings: { 'stroke.paint.color': st.line(`"${L.border}"`), ariaDescription: st.description('"This was the right answer"', `"Wrong. The answer is " + ${at}?.answer`) },
          }),
        ],
      }),
      text('Match result', 'matchState', `{${at}?.state == "correct" ? "✓ Right" : ${at}?.state == "wrong" ? "✗ Wrong" + (${at}?.answer ? ". The answer is " + ${at}.answer : "") : ""}`, {
        fontSize: 13,
        fontWeight: 600,
        color: L.muted,
        decorative: true,
        width: TERM_W,
        height: 18,
        //Out of the flow on purpose. A hidden layer takes no room in the layout now (task 217), so it is not about measuring any more,
        //but showing it in the flow would still push the rows below it down on Check, and the terms already dropped in the slots stay put
        layoutItem: { position: 'absolute', inset: { left: 402 - TERM_W, top: TERM_H + 2 } },
        bindings: { visible: `!!${at}?.state` },
      }),
    ],
  });
}

function matchingBody(q: Question): SceneNode {
  const n = q.pairs.length;
  const order = dealOrder(n, q.prefix);
  return createNode('frame', {
    name: 'Matching',
    questionPart: 'matching',
    fill: null,
    stroke: null,
    clip: false,
    //The terms are the later layer so they paint over the slots, and the reversed layout puts them on the left
    layout: { ...row(20), align: 'start' as const, reverse: true },
    children: [
      createNode('frame', {
        name: 'Matches',
        questionPart: 'matches',
        fill: null,
        stroke: null,
        clip: false,
        layout: { ...column(24), align: 'stretch' as const },
        layoutItem: { width: 'fill' },
        children: q.pairs.map((p, i) => matchRow(q, p, i)),
      }),
      createNode('frame', {
        name: 'Terms',
        questionPart: 'terms',
        width: TERM_W,
        height: Math.max(TERM_H, n * TERM_PITCH - (TERM_PITCH - TERM_H)),
        fill: null,
        stroke: null,
        clip: false,
        layout: null,
        children: order.map((pi, slot) => matchTerm(q, q.pairs[pi], pi, slot)),
      }),
    ],
  });
}

/** `[n]` of this question's items in a layer's bindings and text, pointed at row `idx`. */
function reindex(frameNode: SceneNode, q: Question, idx: number): void {
  const re = new RegExp(`${varName(q, 'items').replace(/\$/g, '\\$')}\\[\\d+\\]`, 'g');
  const to = itemAt(q, idx);
  walk([frameNode], (n) => {
    if (n.bindings) for (const k of Object.keys(n.bindings)) n.bindings[k] = n.bindings[k].replace(re, to);
    if (n.type === 'text') {
      n.text = n.text.replace(re, to);
      for (const r of n.runs ?? []) r.text = r.text.replace(re, to);
    }
  });
}

/** The layer a kit part marks for one pair or area: `matchTerm:p1`. */
function partWithId(frame: ContainerNode, part: string, id: string): SceneNode | undefined {
  return (partsOf(frame)[part] ?? []).find((n) => n.questionPart === `${part}:${id}`);
}

//Hotspot: a picture, with the clickable areas drawn over it as layers of their own

export type AreaShape = 'rect' | 'ellipse' | 'polygon';
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}


/** Where the sample question's four areas sit on its sample picture. */
const SAMPLE_AREAS: Record<string, { shape: AreaShape; box: Box; points?: [number, number][] }> = {
  Roof: { shape: 'polygon', box: { x: 130, y: 58, w: 210, h: 80 }, points: [[0, 80], [105, 0], [210, 80]] },
  Sun: { shape: 'ellipse', box: { x: 456, y: 18, w: 98, h: 98 } },
  Tree: { shape: 'rect', box: { x: 384, y: 92, w: 112, h: 150 } },
  Door: { shape: 'rect', box: { x: 216, y: 168, w: 54, h: 76 } },
};

export const shapeOfArea = (n: SceneNode): AreaShape => (n.type === 'ellipse' ? 'ellipse' : n.type === 'path' ? 'polygon' : 'rect');

/** Where a new area goes when nothing says: a modest box, stepped along so they do not sit on each other. */
const defaultBox = (k: number): Box => ({ x: 40 + ((k * 46) % 360), y: 40 + ((k * 38) % 150), w: 90, h: 70 });

function pentagon(w: number, h: number) {
  return [[0.5, 0], [1, 0.4], [0.8, 1], [0.2, 1], [0, 0.4]].map(([x, y]) => ({ x: Math.round(x * w), y: Math.round(y * h) }));
}

function spotArea(q: Question, o: QuestionOption, i: number, shape: AreaShape, box: Box, points?: [number, number][]): SceneNode {
  const at = itemAt(q, i);
  const r = `${at}?`;
  const common = {
    name: `Area: ${o.text || i + 1}`,
    questionPart: `spot:${o.id}`,
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    role: isMultiple(q) ? ('checkbox' as const) : ('radio' as const),
    focusable: true,
    ariaLabel: o.text,
    fill: solid('#ffffff01'),
    stroke: stroke(AREA_OFF, 3),
    cursor: 'pointer',
    bindings: {
      ariaChecked: `${r}.selected`,
      ariaLabel: `${r}.text`,
      ariaDescription: stateFor(at).description('"This was the right answer"', '"Wrong"'),
      'fill.color': `${r}.state == "correct" ? "${AREA_OK}" : ${r}.state == "wrong" ? "${AREA_BAD}" : ${r}.state == "missed" ? "${AREA_MISS}" : ${r}.selected ? "${AREA_ON}" : "#ffffff01"`,
      'stroke.paint.color': `${r}.state == "correct" ? "${L.success}" : ${r}.state == "wrong" ? "${L.error}" : ${r}.state == "missed" ? "${L.warning}" : ${r}.selected ? "${L.primary}" : "${AREA_OFF}"`,
    },
  };
  if (shape === 'ellipse') return createNode('ellipse', common);
  if (shape === 'polygon') return createNode('path', { ...common, paths: [{ closed: true, points: points ? points.map(([x, y]) => ({ x, y })) : pentagon(box.w, box.h) }] });
  return createNode('rect', { ...common, cornerRadius: 8 });
}

/** The sample picture: a house, a tree and the sun, drawn with shapes so the question works before there is any image. Swap it for yours. */
function samplePicture(): SceneNode {
  const shape = (type: 'rect' | 'ellipse', name: string, x: number, y: number, w: number, h: number, color: string, extra: object = {}) =>
    createNode(type, { name, x, y, width: w, height: h, fill: solid(color), stroke: null, decorative: true, ...extra } as never);
  return createNode('frame', {
    name: 'Picture',
    questionPart: 'picture',
    width: AREA_W,
    height: AREA_H,
    fill: solid('#cfe8ff'),
    stroke: null,
    cornerRadius: 10,
    clip: true,
    role: 'image',
    ariaLabel: 'A house with a red roof and a door, a tree beside it and the sun in the sky',
    children: [
      shape('ellipse', 'Sun', 466, 28, 78, 78, '#ffcf33'),
      shape('rect', 'Ground', 0, 224, AREA_W, 56, '#9bd18b'),
      shape('rect', 'Walls', 150, 138, 170, 104, '#e8c9a0'),
      createNode('path', { name: 'Roof', x: 130, y: 62, width: 210, height: 76, fill: solid('#b5523b'), stroke: null, decorative: true, paths: [{ closed: true, points: [{ x: 0, y: 76 }, { x: 105, y: 0 }, { x: 210, y: 76 }] }] } as never),
      shape('rect', 'Door', 224, 178, 38, 64, '#7a4a2b'),
      shape('rect', 'Trunk', 428, 168, 20, 74, '#7a4a2b'),
      shape('ellipse', 'Leaves', 394, 98, 90, 88, '#3f9a4a'),
    ],
  });
}

function hotspotBody(q: Question): SceneNode {
  const areas = q.options.map((o, i) => {
    const sample = SAMPLE_AREAS[o.text];
    return sample ? spotArea(q, o, i, sample.shape, sample.box, sample.points) : spotArea(q, o, i, 'rect', defaultBox(i));
  });
  const prompt = varName(q, 'prompt');
  const items = varName(q, 'items');
  return createNode('frame', {
    name: 'Hotspots',
    questionPart: 'hotspots',
    fill: null,
    stroke: null,
    clip: false,
    layout: column(8),
    children: [
      createNode('frame', {
        name: 'Picture area',
        questionPart: 'spots',
        width: AREA_W,
        height: AREA_H,
        fill: null,
        stroke: stroke(L.divider, 1),
        cornerRadius: 10,
        clip: false,
        role: isMultiple(q) ? 'region' : 'radiogroup',
        bindings: { ariaLabel: prompt },
        children: [samplePicture(), ...areas],
      }),
      text('Picks', 'spotPicks', `Selected: {${items}.filter(i => i.selected).map(i => i.text + (i.state == "correct" ? " (right)" : i.state == "wrong" ? " (wrong)" : "")).join(", ")}`, {
        fontSize: 14,
        color: L.muted,
        bindings: { visible: `${items}.some(i => i.selected)` },
      }),
      text('Right areas', 'spotAnswer', `Right answer: {${items}.filter(i => i.state == "missed").map(i => i.text).join(", ")}`, {
        fontSize: 14,
        fontWeight: 600,
        color: L.warning,
        bindings: { visible: `${items}.some(i => i.state == "missed")` },
      }),
    ],
  });
}

/** The default look of the Try again / Next question button for this question. */
export const resetLabel = (q: Question): string => (q.bank ? RESET_LABELS.next : RESET_LABELS.again);
//A question that is retaken with the whole set has no Try again of its own: a Retake button elsewhere starts the next round for all of them
const resetVisible = (q: Question): string => (q.retake ? 'false' : q.bank ? varName(q, 'locked') : `${varName(q, 'locked')} && !${varName(q, 'correct')}`);

function bodyFor(q: Question, style: Style, blankVars: string[]): SceneNode {
  if (style === 'blank') return blanksBody(q, blankVars);
  if (style === 'match') return matchingBody(q);
  if (style === 'spot') return hotspotBody(q);
  return optionsBody(q, style);
}

function frameFor(q: Question, blankVars: string[], at: { x: number; y: number }): FrameNode {
  const p = (s: string) => varName(q, s);
  const style = bodyStyle(q.kind);
  const body = bodyFor(q, style, blankVars);
  return createNode('frame', {
    name: 'Question',
    x: at.x,
    y: at.y,
    width: 640,
    height: 420,
    role: 'region',
    question: q,
    //A flat grey card on the page, like the toolbox's cards
    fill: solid(L.surface),
    stroke: null,
    cornerRadius: 8,
    clip: false,
    bindings: { ariaLabel: `"Question: " + ${p('prompt')}` },
    layout: { ...defaultAutoLayout('column'), gap: 16, padding: { top: 24, right: 24, bottom: 24, left: 24 }, align: 'stretch', hugHeight: true },
    children: [
      text('Prompt', 'prompt', `{${p('prompt')}}`, { role: 'heading', headingLevel: 3, fontSize: 20, fontWeight: 600, lineHeight: 1.35 }),
      body,
      text('Hint text', 'hintText', `Hint: {${p('hint')}}`, { fontSize: 14, fontStyle: 'italic', color: L.muted, bindings: { visible: `${p('hint')} != ""` } }),
      text('Feedback', 'feedback', `{${p('feedback')}}`, {
        fontWeight: 600,
        bindings: { visible: `${p('feedback')} != ""`, color: `${p('answered')} ? (${p('correct')} ? "${L.success}" : "${L.error}") : "${L.muted}"` },
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
          text('Score', 'score', `Score: {${p('score')}}`, { fontWeight: 600, color: L.muted, autoSize: 'width', width: 90, bindings: { visible: p('locked') } }),
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
    } else if (['prompt', 'items', 'triesLeft', 'hintsLeft', 'retakesLeft'].includes(def.suffix)) v.initial = def.initial;
    out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
//The interaction graph

interface Slot {
  /** A fixed option number for the Choose option node (hotspot areas: the node is about one area). */
  option?: string;
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

/** The Choose option node's expression for the number keys: the key pressed, as a place in the list (from 0). */
export const KEY_OPTION = 'Number(event.key) - 1';

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
  if (style === 'spot') {
    q.options.forEach((o, i) => {
      const target = partWithId(frame, 'spot', o.id)?.id;
      if (target) out.push({ eventSlot: `spot:${o.id}:event`, actionSlot: `spot:${o.id}:action`, option: String(i), event: { kind: 'event.pointer', params: { target, type: 'click' } }, action: { kind: 'action.questionChoose', params: { question: frame.id, option: String(i) } } });
    });
  }
  if (style === 'order') {
    click('moveUp', 'action.questionMove', { item: 'event.index', direction: 'up' });
    click('moveDown', 'action.questionMove', { item: 'event.index', direction: 'down' });
  }
  click('check', 'action.questionCheck');
  //Fill-in-the-blank questions: Enter in a box checks the answer too (the key node says it may hear typing, and only fires inside this question)
  if (style === 'blank') out.push({ eventSlot: 'enterCheck:event', actionSlot: 'enterCheck:action', event: { kind: 'event.key', params: { key: 'Enter', type: 'keydown', typing: true, target: frame.id } }, action: { kind: 'action.questionCheck', params: { question: frame.id } } });
  click('hint', 'action.questionHint');
  click('reset', 'action.questionReset', { next: true });
  //Read aloud: the Listen button says the question, and the feedback once it has been checked
  if (q.listen) click('listen', 'action.speak', { op: 'auto', question: frame.id });
  //Number keys 1 to 9 choose the option in that place (a key that is not a number lands outside the list and does nothing)
  if (q.numberKeys && (style === 'radio' || style === 'check')) {
    out.push({ eventSlot: 'numberKeys:event', actionSlot: 'numberKeys:action', event: { kind: 'event.key', params: { key: '', type: 'keydown' } }, action: { kind: 'action.questionChoose', params: { question: frame.id, option: KEY_OPTION } } });
  }
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
    const own = w.event.kind === 'event.pointer' || (w.event.kind === 'event.key' && w.event.params.target) ? ['target'] : w.event.kind === 'event.dataLoaded' ? ['source'] : [];
    for (const k of own) ev.params[k] = w.event.params[k];
    ac.params.question = frame.id;
    if (w.option !== undefined) ac.params.option = w.option;
    else if (w.actionSlot === 'numberKeys:action') ac.params.option = KEY_OPTION;
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
      if (n.type === 'input') {
        n.variableId = varIds[i];
        //A word to spell gets no red underline, no autocorrect and no capital letter put on it by the browser
        if (q.blanks[i]?.spelling) n.noAssist = true;
      }
    });
  });
}


/** Matching: one term, definition and slot per pair, in the settings' order. Added and removed pairs change the layers; the rest keep their look. */
function syncPairs(frame: FrameNode, q: Question, ab: Artboard): void {
  const matches = partsOf(frame).matches?.[0] as FrameNode | undefined;
  const terms = partsOf(frame).terms?.[0] as FrameNode | undefined;
  if (!matches || !terms) return;
  const ids = new Set(q.pairs.map((p) => p.id));
  const rowId = (n: SceneNode) => /^matchRow:(.+)$/.exec(n.questionPart ?? '')?.[1];
  const termId = (n: SceneNode) => /^matchTerm:(.+)$/.exec(n.questionPart ?? '')?.[1];
  const had = terms.children.filter((c) => termId(c)).map((c) => termId(c)!);
  matches.children = matches.children.filter((c) => !rowId(c) || ids.has(rowId(c)!));
  terms.children = terms.children.filter((c) => !termId(c) || ids.has(termId(c)!));
  const names = nodeNames(ab);
  let changed = had.length !== terms.children.filter((c) => termId(c)).length;
  q.pairs.forEach((p, i) => {
    if (!matches.children.some((c) => rowId(c) === p.id)) {
      const made = matchRow(q, p, i);
      made.name = uniqueName(names, made.name);
      matches.children.push(made);
    }
    if (!terms.children.some((c) => termId(c) === p.id)) {
      const made = matchTerm(q, p, i, terms.children.length);
      made.name = uniqueName(names, made.name);
      terms.children.push(made);
      changed = true;
    }
  });
  //The rows follow the settings' order
  const rank = new Map(q.pairs.map((p, i) => [p.id, i]));
  matches.children.sort((a, b) => (rank.get(rowId(a) ?? '') ?? 0) - (rank.get(rowId(b) ?? '') ?? 0));
  q.pairs.forEach((p, i) => {
    const row = matches.children.find((c) => rowId(c) === p.id)!;
    const term = terms.children.find((c) => termId(c) === p.id)!;
    reindex(row, q, i);
    reindex(term, q, i);
    //Names follow the position while they are still the kit's own
    if (/^Match \d+$/.test(row.name)) row.name = `Match ${i + 1}`;
    if (/^Term \d+$/.test(term.name)) term.name = `Term ${i + 1}`;
    const slot = partWithId(matches, 'matchZone', p.id);
    if (slot && /^Slot \d+$/.test(slot.name)) slot.name = `Slot ${i + 1}`;
    term.ariaLabel = p.term;
    if (term.draggable) {
      term.draggable.label = p.term;
      term.draggable.tags = [termTag(q)];
    }
    const zone = partWithId(matches, 'matchZone', p.id);
    if (zone?.dropZone) {
      zone.dropZone.label = p.match;
      zone.dropZone.accepts = [termTag(q)];
    }
  });
  //A different number of pairs: lay the pile out again, one under the other
  if (changed) {
    terms.children.forEach((c, k) => {
      c.x = 0;
      c.y = k * TERM_PITCH;
    });
  }
  terms.height = Math.max(TERM_H, q.pairs.length * TERM_PITCH - (TERM_PITCH - TERM_H));
}

/** Hotspot: one area layer per option. New options get a default box on the picture; the rest keep their shape, place and look. */
function syncAreas(frame: FrameNode, q: Question, ab: Artboard): void {
  const spots = partsOf(frame).spots?.[0] as FrameNode | undefined;
  if (!spots) return;
  const idOf = (n: SceneNode) => /^spot:(.+)$/.exec(n.questionPart ?? '')?.[1];
  const ids = new Set(q.options.map((o) => o.id));
  spots.children = spots.children.filter((c) => !idOf(c) || ids.has(idOf(c)!));
  const names = nodeNames(ab);
  const several = isMultiple(q);
  let fresh = 0;
  q.options.forEach((o, i) => {
    let area = spots.children.find((c) => idOf(c) === o.id);
    if (!area) {
      area = spotArea(q, o, i, 'rect', defaultBox(spots.children.filter((c) => idOf(c)).length + fresh++));
      area.name = uniqueName(names, area.name);
      spots.children.push(area);
    }
    reindex(area, q, i);
    area.role = several ? 'checkbox' : 'radio';
    area.ariaLabel = o.text;
    if (area.name.startsWith('Area: ')) area.name = `Area: ${o.text || i + 1}`;
  });
  spots.role = several ? 'region' : 'radiogroup';
}

/** Change the shape of one area (rectangle, ellipse or polygon), keeping its place, size, look and the wiring that points at it. */
export function setAreaShape(d: Project, abId: string, frameId: string, optionId: string, shape: AreaShape): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = ab && locate(ab, frameId)?.node;
  if (!ab || !frame || frame.type !== 'frame' || !frame.question) return;
  const old = partWithId(frame, 'spot', optionId);
  const at = old && locate(ab, old.id);
  if (!old || !at || shapeOfArea(old) === shape) return;
  const q = frame.question;
  const i = q.options.findIndex((o) => o.id === optionId);
  if (i < 0) return;
  const made = spotArea(q, q.options[i], i, shape, { x: old.x, y: old.y, w: old.width, h: old.height });
  const look = old as unknown as { fill?: unknown; stroke?: unknown };
  Object.assign(made, { id: old.id, name: old.name, bindings: old.bindings, fill: look.fill, stroke: look.stroke, rotation: old.rotation, opacity: old.opacity });
  at.siblings.splice(at.index, 1, made);
}

/** Make every area bigger (or smaller, with a negative number) by `px` on each side, so a click a little off still lands. */
export function growAreas(d: Project, abId: string, frameId: string, px: number): void {
  const ab = d.artboards.find((a) => a.id === abId);
  const frame = ab && locate(ab, frameId)?.node;
  if (!ab || !frame || frame.type !== 'frame') return;
  for (const n of partsOf(frame).spot ?? []) {
    const w = Math.max(8, n.width + 2 * px);
    const h = Math.max(8, n.height + 2 * px);
    if (n.type === 'path' && n.width > 0 && n.height > 0) {
      const sx = w / n.width;
      const sy = h / n.height;
      for (const sp of n.paths) for (const pt of sp.points) Object.assign(pt, { x: Math.round(pt.x * sx * 10) / 10, y: Math.round(pt.y * sy * 10) / 10 });
    }
    n.x -= (w - n.width) / 2;
    n.y -= (h - n.height) / 2;
    n.width = w;
    n.height = h;
  }
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
  L = lookFor(d.themes);
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
  const bodyNow = parts.blanks?.[0] ? 'blank' : parts.matching?.[0] ? 'match' : parts.hotspots?.[0] ? 'spot' : (parts.options?.[0]?.questionPart ?? '').split(':')[1];
  if (bodyNow !== style) {
    //A different kind of answer needs a different answer area
    const old = parts.blanks?.[0] ?? parts.matching?.[0] ?? parts.hotspots?.[0] ?? parts.options?.[0];
    const blankVars = q.blanks.map((_, i) => variables.find((v) => v.name === varName(q, `blank${i + 1}`))?.id ?? '');
    const body = bodyFor(q, style, blankVars);
    const names = nodeNames(ab);
    body.name = uniqueName(names, body.name);
    if (old) {
      const at = locate(ab, old.id);
      if (at) at.siblings.splice(at.index, 1, body);
    } else (frame as FrameNode).children.splice(1, 0, body);
  } else if (style === 'blank') syncBlankRows(frame, q, variables);
  else if (style === 'match') syncPairs(frame as FrameNode, q, ab);
  else if (style === 'spot') syncAreas(frame as FrameNode, q, ab);
  //The reset button's wording and when it shows depend on there being a bank. Only the default wording follows.
  const reset = partsOf(frame).reset?.[0];
  if (reset && reset.type === 'button') {
    if (!before || Boolean(before.bank) !== Boolean(q.bank) || Boolean(before.retake) !== Boolean(q.retake)) {
      const other = before?.bank ? RESET_LABELS.next : RESET_LABELS.again;
      if (reset.label === other || !before) reset.label = resetLabel(q);
      reset.bindings = { ...(reset.bindings ?? {}), visible: resetVisible(q) };
    }
  }
  syncListen(ab, frame as FrameNode, q);
  syncKeysHint(frame as FrameNode, q);
  ensureGraph(d, ab, frame as FrameNode, q);
}

/** The Listen button in the buttons row: there when the question offers read aloud, gone when it does not. It hides itself when the device has no voice. */
function syncListen(ab: Artboard, frame: FrameNode, q: Question): void {
  const row = partsOf(frame).buttons?.[0];
  if (!row || !isContainer(row)) return;
  const has = row.children.find((c) => c.questionPart === 'listen');
  if (q.listen && !has) {
    const at = Math.min(row.children.length, Math.max(0, row.children.findIndex((c) => c.questionPart === 'hint') + 1));
    const b = button(uniqueName(nodeNames(ab), 'Listen'), 'listen', 'Listen', false, { visible: 'voiceAvailable' });
    b.ariaLabel = 'Listen to the question';
    row.children.splice(at, 0, b);
  } else if (!q.listen && has) row.children = row.children.filter((c) => c !== has);
}

/** "Press 1 to 4 to choose": a small line under the options while the number keys are on. */
function syncKeysHint(frame: FrameNode, q: Question): void {
  const parts = partsOf(frame);
  const has = parts.keysHint?.[0];
  const want = !!q.numberKeys && (bodyStyle(q.kind) === 'radio' || bodyStyle(q.kind) === 'check');
  if (want && !has) {
    const body = parts.options?.[0];
    const at = body ? frame.children.findIndex((c) => c === body) : -1;
    const line = text('Number keys hint', 'keysHint', `Press 1 to {${varName(q, 'items')}.length} to choose`, { fontSize: 14, color: L.muted });
    frame.children.splice(at >= 0 ? at + 1 : 2, 0, line);
  } else if (!want && has) {
    const loc = locateIn(frame, has.id);
    if (loc) loc.siblings.splice(loc.index, 1);
  }
}

/** Where a layer sits inside a frame: its list of siblings and its place in it. */
function locateIn(frame: ContainerNode, id: string): { siblings: SceneNode[]; index: number } | null {
  const look = (list: SceneNode[]): { siblings: SceneNode[]; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) return { siblings: list, index: i };
      const c = list[i];
      if (isContainer(c)) {
        const hit = look(c.children);
        if (hit) return hit;
      }
    }
    return null;
  };
  return look(frame.children);
}

// ---------------------------------------------------------------------------------------------------------------------
//Entry points

/** Add a question of a kind to an artboard (or inside a frame). Returns the new frame's id. */
export function addQuestion(d: Project, abId: string, kind: QuestionKind, opts: { parentId?: string | null; at?: { x: number; y: number } } = {}): string | null {
  const ab = d.artboards.find((a) => a.id === abId);
  if (!ab) return null;
  L = lookFor(d.themes);
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
