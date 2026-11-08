/**
 * Flowchart: one to follow and one to complete. Follow: the chart is drawn from a list of steps and a list of links, laid out by
 * `flowChart(...)` (rows from the start, branches either side of a decision), with proper shapes and elbow connectors; the learner is
 * walked through it, answering each decision, and the route taken lights up. Complete: the same kind of chart with blank shapes, the
 * missing steps dragged into them (a matching question, so tries, feedback and marks come with it). A text version of the chart is
 * one button away.
 */
import { createNode, walk, type FrameNode, type PathNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { flowChart, flowLinks } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../../question-kit';
import { BRAND_FONT } from '../../looks';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import { addVar, announce, bind, click, goNext, goPrevious, graph, set, toggleVar } from '../../graph-kit';
import { fill, stack } from '../../parts';
import { boxText, dressQuestion, endPage, goNextOn, retray } from '../drag/shared';
import { heroButtons } from './helpers';

const STEPS = [
  { id: 's1', kind: 'start', label: 'Need a quiet place to study?', detail: 'Start here. The library has rooms you can book for a few hours, free for students.' },
  { id: 'd1', kind: 'decision', label: 'Is a room free?', detail: 'Open the booking page and look at the day and time you want. A room is free when its slot is green.' },
  { id: 'io1', kind: 'io', label: 'Enter your student number', detail: 'You need your student number and your university email to book. Both are on your student card.' },
  { id: 'p1', kind: 'process', label: 'Book the room', detail: 'Pick the slot and press Book. You can book up to three hours at a time.' },
  { id: 'p2', kind: 'process', label: 'Wait for the confirmation', detail: 'A confirmation email arrives within a minute. If it does not, check your spam folder before booking again.' },
  { id: 'e1', kind: 'end', label: 'Go and study', detail: 'Take your student card: you tap it on the door to get in. Enjoy the quiet.' },
  { id: 'p3', kind: 'process', label: 'Pick another time', detail: 'Rooms are busiest at midday. Early morning and late afternoon are easier.' },
];
const LINKS = [
  { from: 's1', to: 'd1' },
  { from: 'd1', to: 'io1', label: 'Yes' },
  { from: 'd1', to: 'p3', label: 'No' },
  { from: 'io1', to: 'p1' },
  { from: 'p1', to: 'p2' },
  { from: 'p2', to: 'e1' },
  { from: 'p3', to: 'd1' },
];

/** The sizes of the shapes in the chart you follow (the slanted input and output shape is drawn at this size, so it keeps it). */
const SIZES = { start: [140, 40], end: [140, 40], process: [160, 46], decision: [180, 76], io: [160, 46] } as const;
const CHART_W = 600;
const CHART_H = 400;

/** The completed chart's blanks and the labels that go in them, and a label that fits nowhere. */
const BLANKS = [
  { id: 'book', kind: 'process', label: 'Book the room' },
  { id: 'other', kind: 'process', label: 'Pick another time' },
  { id: 'go', kind: 'end', label: 'Go and study' },
];
const EXTRA = 'Cancel the booking';
const DONE_STEPS = [{ id: 'start', kind: 'start', label: 'Need a study room?' }, { id: 'free', kind: 'decision', label: 'Is a room free?' }, ...BLANKS];
const DONE_LINKS = [
  { from: 'start', to: 'free' },
  { from: 'free', to: 'book', label: 'Yes' },
  { from: 'free', to: 'other', label: 'No' },
  { from: 'book', to: 'go' },
  { from: 'other', to: 'free' },
];
const DONE_SIZES = { start: [130, 36], end: [130, 36], process: [150, 40], decision: [150, 64], io: [150, 40] } as const;
const PIC_H = 290;

/** States for the layout check: the walk-through at its end (long route, the last step), the text version, and the activity checked with every label wrong. */
export const FLOWCHART_LAYOUT_STATES: LayoutState[] = [
  { label: 'at a decision', page: 'Follow the flowchart', vars: { current: 'd1', path: ['s1', 'd1'] } },
  { label: 'at the end of a long route', page: 'Follow the flowchart', vars: { current: 'e1', path: ['s1', 'd1', 'p3', 'd1', 'p3', 'd1', 'io1', 'p1', 'p2', 'e1'] } },
  { label: 'as a list', page: 'Follow the flowchart', vars: { showList: true } },
  {
    label: 'checked, all wrong',
    page: 'Complete the flowchart',
    vars: {
      flow_answered: true,
      flow_locked: true,
      flow_feedback: '0 of 3 matched correctly. Out of tries. The right step is shown under each blank.',
      flow_items: BLANKS.map((b, i) => ({ id: `p${i + 1}`, text: b.label, label: `Blank ${i + 1}`, number: i + 1, selected: false, state: 'wrong', answer: 'Book the room' })),
    },
  },
];

/** The three shapes a step can be (a rounded box, a diamond, a slanted box), as layers that each show for their own kinds, painted by the state of the walk. */
function stepShapes(ctx: BrandedCtx, state: { fill: string; line: string; width: string }) {
  const { L } = ctx;
  const paint = { 'fill.color': state.fill, 'stroke.paint.color': state.line, 'stroke.width': state.width };
  const [iw, ih] = SIZES.io;
  const rounded = createNode('rect', {
    name: 'Box shape',
    x: 0,
    y: 0,
    width: 160,
    height: 46,
    cornerRadius: 8,
    fill: solid(L.surface),
    stroke: stroke(L.muted, 2),
    decorative: true,
    bindings: { width: 'item.w', height: 'item.h', cornerRadius: 'item.kind == "start" || item.kind == "end" ? item.h / 2 : 8', visible: 'item.kind != "decision" && item.kind != "io"', ...paint },
  } as never);
  const diamond = createNode('polygon', {
    name: 'Decision shape',
    x: 0,
    y: 0,
    width: 180,
    height: 76,
    sides: 4,
    fill: solid(L.surface),
    stroke: stroke(L.muted, 2),
    decorative: true,
    bindings: { width: 'item.w', height: 'item.h', visible: 'item.kind == "decision"', ...paint },
  } as never);
  const skew = 14;
  const slanted = createNode('path', {
    name: 'Input and output shape',
    x: 0,
    y: 0,
    width: iw,
    height: ih,
    fill: solid(L.surface),
    stroke: stroke(L.muted, 2),
    decorative: true,
    paths: [{ closed: true, points: [{ x: skew, y: 0 }, { x: iw, y: 0 }, { x: iw - skew, y: ih }, { x: 0, y: ih }] }],
    bindings: { visible: 'item.kind == "io"', ...paint },
  } as never) as PathNode;
  return [rounded, diamond, slanted];
}

export const flowchartStarter: BrandedStarter = {
  key: 'explore/flowchart',
  set: 'explore',
  name: 'Flowchart',
  description: 'A flowchart to follow and one to complete. Follow: drawn from a list of steps and links with proper shapes and arrows, the learner answers each decision and the route they took lights up, with a numbered text version beside it. Complete: drag the missing steps into the blank shapes of a chart, marked by the question kit. Edit the lists, not the shapes.',
  tags: ['flowchart', 'diagram', 'connectors', 'keyboard friendly', 'drag'],
  layoutStates: FLOWCHART_LAYOUT_STATES,
  build(colourway) {
    const ctx = brandedProject(colourway, 'Flowchart');
    const { L, project } = ctx;

    const hero = brandedPage(ctx, 'Flowcharts', { kind: 'hero', subtitle: 'Follow a flowchart step by step, then complete one yourself.', name: 'Start' });
    const walkPage = brandedPage(ctx, 'Booking a study room', { name: 'Follow the flowchart', footer: 'Follow the flowchart  ·  Page {pageNumber} of {pageCount}' });
    const donePage = brandedPage(ctx, 'Complete the flowchart', { name: 'Complete the flowchart', footer: 'Complete the flowchart  ·  Page {pageNumber} of {pageCount}' });
    const results = endPage(ctx, 'Well done', 'You put {flow_score} of ' + BLANKS.length + ' steps in the right place.', 'Try again');
    heroButtons(ctx, hero, [
      { name: 'Follow button', label: 'Follow a flowchart', to: walkPage, width: 230 },
      { name: 'Complete button', label: 'Complete a flowchart', to: donePage, width: 250 },
    ]);
    const box = contentBox(walkPage);

    // ------------------------------------------------------------------ follow
    addVar(project, 'steps', 'list', STEPS);
    addVar(project, 'links', 'list', LINKS);
    //Where the learner is (a step's id) and the steps they have been through, in order
    const current = addVar(project, 'current', 'string', 's1');
    const path = addVar(project, 'path', 'list', ['s1']);
    const showList = addVar(project, 'showList', 'boolean', false);
    const sizes = JSON.stringify(Object.fromEntries(Object.entries(SIZES)));
    addVar(project, 'fc', 'list', [], { formula: `flowChart(steps, links, {width: ${CHART_W}, height: ${CHART_H}, sizes: ${sizes}, gapY: 24})`, live: true });
    addVar(project, 'fl', 'list', [], { formula: 'flowLinks(steps, links)', live: true });
    //Where the learner is in the chart's list, the links they can follow from there, and whether there is nowhere left to go
    addVar(project, 'here', 'number', 0, { formula: 'Math.max(0, fc.findIndex(s => s.id == current))', live: true });
    addVar(project, 'outs', 'list', [], { formula: 'fl.filter(l => l.from == current && l.b >= 0)', live: true });
    addVar(project, 'atEnd', 'boolean', false, { formula: 'outs.length == 0', live: true });
    addVar(project, 'route', 'string', '', { formula: '(path.length > 4 ? "... > " : "") + path.slice(-4).map(id => (steps.find(s => s.id == id) ?? {}).label).join(" > ")', live: true });
    addVar(project, 'flowText', 'string', '', { formula: 'flowOutline(steps, links)', live: true });

    //The shapes follow the walk: the step you are at in the button colour with a dark outline, the ones you have been through in the success colour
    const state = {
      fill: `item.id == current ? "${L.button}" : path.includes(item.id) ? "${L.successSurface}" : "${L.surface}"`,
      line: `item.id == current ? "${L.text}" : path.includes(item.id) ? "${L.success}" : "${L.muted}"`,
      width: 'item.id == current ? 3 : 2',
    };
    const words = text(ctx, 'Step text', '{item.label}', 0, 0, 140, {
      fontSize: 14,
      fontWeight: 600,
      align: 'center',
      autoSize: 'none',
      height: 40,
      verticalAlign: 'middle',
      lineHeight: 1.2,
      bindings: {
        x: '(item.w - (item.kind == "decision" ? item.w * 0.62 : item.w - 20)) / 2',
        width: 'item.kind == "decision" ? item.w * 0.62 : item.w - 20',
        height: 'item.h',
        fontSize: 'item.kind == "decision" ? 13 : 14',
        color: `item.id == current ? "${L.onButton}" : "${L.text}"`,
      },
    } as never);
    const step = createNode('group', {
      name: 'Flowchart step',
      x: 0,
      y: 0,
      width: 160,
      height: 46,
      fitContents: false,
      children: [...stepShapes(ctx, state), words],
      bindings: { x: 'item.x', y: 'item.y', width: 'item.w', height: 'item.h', ariaCurrent: 'item.id == current ? "step" : false' },
    } as never);
    const repeat = (items: string) => ({ items, layout: 'none' as const, gap: 0, columns: 1 });
    const area = { x: 0, y: 0, width: CHART_W, height: CHART_H, fitContents: false };
    const steps_ = createNode('group', { name: 'Flowchart steps', ...area, repeat: repeat('fc'), children: [step] } as never);
    //An arrow for each link, from the step it leaves to the step it enters, labelled with the answer; the ones the learner has taken are heavier and green
    const taken = 'path.some((id, i) => id == item.from && path[i + 1] == item.to)';
    const arrow = createNode('connector', {
      name: 'Flow arrow',
      from: { layer: { repeat: step.id, index: 'item.a' } },
      to: { layer: { repeat: step.id, index: 'item.b' } },
      route: 'elbow',
      endCap: 'arrow',
      gap: 3,
      cornerRadius: 10,
      fill: solid(L.background),
      stroke: stroke(L.muted, 2),
      color: L.text,
      fontSize: 13,
      fontWeight: 600,
      fontFamily: BRAND_FONT,
      label: '',
      bindings: {
        'from.side': 'item.outSide',
        'to.side': 'item.inSide',
        label: 'item.label ?? ""',
        'stroke.paint.color': `${taken} ? "${L.success}" : "${L.muted}"`,
        'stroke.width': `${taken} ? 3.5 : 2`,
      },
    } as never);
    const arrows = createNode('group', { name: 'Flowchart arrows', ...area, repeat: repeat('fl'), children: [arrow] } as never);
    const chart = bind(
      createNode('frame', { name: 'Flowchart', x: box.x, y: box.y, width: CHART_W, height: CHART_H, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Flowchart. The steps are read in order; the text version lists where every step leads.', children: [arrows, steps_] } as never),
      { visible: '!showList' },
    );
    const listText = text(ctx, 'Flowchart as text', '{flowText}', 20, 16, CHART_W - 40, { fontSize: 16, lineHeight: 1.45 });
    const listFrame = bind(
      createNode('frame', { name: 'Flowchart text version', x: box.x, y: box.y, width: CHART_W, height: CHART_H, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: true, scroll: 'vertical', role: 'region', ariaLabel: 'Flowchart as text', children: [listText] } as never),
      { visible: 'showList' },
    );
    walkPage.children.push(chart, listFrame);
    const view = button(ctx, 'View button', '{showList ? "Show the flowchart" : "Show as a list"}', box.x, box.y + CHART_H + 14, 230, false);
    walkPage.children.push(view);

    //The panel: where you are, what to do, and the answers as buttons
    const here = createNode('text', { name: 'You are here', text: 'You are here', fontSize: 14, fontWeight: 600, color: L.muted, fontFamily: BRAND_FONT, width: 100 } as never);
    const title = bind(text(ctx, 'Current step', '{fc[here].label}', 0, 0, 100, { fontSize: 22, fontWeight: 700, lineHeight: 1.25, role: 'heading', headingLevel: 2 }), {});
    const detail = text(ctx, 'Current detail', '{fc[here].detail}', 0, 0, 100, { fontSize: 16, lineHeight: 1.4 });
    const choice = button(ctx, 'Choice button', '{item.label || "Continue"}', 0, 0, 100, true);
    Object.assign(choice, { role: 'button', focusable: true });
    fill(choice);
    const choices = createNode('frame', {
      name: 'Choices',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      fill: null,
      stroke: null,
      clip: false,
      ariaLabel: 'Choices',
      layout: { direction: 'column', gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', justify: 'start', wrap: false, hugHeight: true, hugWidth: false, reverse: false },
      repeat: { items: 'outs', layout: 'vertical', gap: 10, columns: 1 },
      keyNav: { mode: 'list', orientation: 'vertical' },
      children: [choice],
    } as never) as FrameNode;
    fill(choices);
    const back = bind(button(ctx, 'Step back button', 'Step back', 0, 0, 100, false), { visible: 'path.length > 1' });
    const again = bind(button(ctx, 'Start again button', 'Start again', 0, 0, 100, false), { visible: 'atEnd' });
    const readout = text(ctx, 'Route readout', 'Step {path.length}. Your route: {route}', 0, 0, 100, { fontSize: 14, lineHeight: 1.35, color: L.muted });
    const panel = stack('Walk panel', box.x + CHART_W + 24, box.y, box.width - CHART_W - 24, {
      gap: 12,
      padding: 20,
      box: { fill: solid(L.surface), cornerRadius: 16 },
      extra: { role: 'region', ariaLabel: 'Where you are in the flowchart' },
      children: [here, title, detail, choices, stack('Walk buttons', 0, 0, 100, { direction: 'row', gap: 10, children: [fill(back), fill(again)] }), readout],
    });
    walkPage.children.push(panel);

    {
      const g = graph(walkPage);
      //One flow for every answer: the click lands on a copy of the button (event.childIndex), which names the link to follow
      const onChoice = g.event('event.pointer', { target: choices.id, type: 'click', childrenOnly: true }, 'Follow an answer');
      g.run(onChoice, ['action.setVariable', { variable: path.id, op: 'push', value: 'outs[event.childIndex].to' }], set(current, 'path[path.length - 1]'), announce('"Now at: " + fc[here].label + (atEnd ? ". This is the end of the flowchart." : "")'));
      g.run(click(g, back, 'Go back one step'), set(path, 'path.slice(0, path.length - 1)'), set(current, 'path[path.length - 1]'), announce('"Back at: " + fc[here].label'));
      g.run(click(g, again, 'Start again'), ['action.resetVariables', { variables: [current.id, path.id] }], announce('"Back at the start: " + fc[here].label'));
      g.run(click(g, view, 'Flowchart or text'), toggleVar(showList));
    }

    // ------------------------------------------------------------------ complete
    const cbox = contentBox(donePage);
    const qid = addQuestion(project, donePage.id, 'matching', { at: { x: cbox.x, y: cbox.y - 8 } })!;
    setQuestionSettings(project, donePage.id, qid, {
      prefix: 'flow',
      prompt: 'Drag each step into the blank shape where it belongs in the flowchart.',
      points: BLANKS.length,
      shuffle: true,
      attempts: 3,
      pairs: BLANKS.map((b, i) => ({ id: `p${i + 1}`, term: b.label, match: `Blank ${i + 1}` })),
      extras: [{ id: 'x1', text: EXTRA }],
      hints: [],
      feedbackCorrect: 'Every step is in the right place. Well done!',
      feedbackPartial: 'Move the steps marked wrong and check again.',
      feedbackIncorrect: 'Not quite. Move the steps marked wrong and check again.',
      feedbackOutOfTries: 'Out of tries. The right step is shown under each blank.',
      reveal: true,
      report: null,
    });
    const frame = donePage.children.find((n) => n.id === qid) as FrameNode;
    frame.name = 'Flowchart question';
    dressQuestion(ctx, frame, cbox.width, { pad: 14, gap: 8 });
    const parts = partsOf(frame);
    walk(frame.children, (n: SceneNode) => {
      if (n.type === 'text' && n.questionPart === 'prompt') n.fontSize = 18;
    });
    //The chart on the left and the steps to place on the right: the matches column becomes a free canvas with the chart on it
    const body = parts.matching[0] as FrameNode;
    body.layout = { ...body.layout!, reverse: false, gap: 20 };
    const matches = parts.matches[0] as FrameNode;
    matches.layout = null;
    matches.height = PIC_H;
    const terms = parts.terms[0] as FrameNode;
    retray(terms, 1, 190, 42, 10);
    const canvasW = cbox.width - 48 - terms.width - 20;
    matches.width = canvasW;
    const dsizes = Object.fromEntries(Object.entries(DONE_SIZES).map(([k, v]) => [k, [...v]])) as never;
    const laid = flowChart(DONE_STEPS, DONE_LINKS, { width: canvasW, height: PIC_H, sizes: dsizes, gapY: 26 });
    const sides = flowLinks(DONE_STEPS, DONE_LINKS);
    const shapeIds: string[] = [];
    const flowShape = (p: (typeof laid)[number], label: string): SceneNode => {
      const diamond = p.kind === 'decision';
      const shape = diamond
        ? createNode('polygon', { name: `${label} shape`, x: 0, y: 0, width: p.w, height: p.h, sides: 4, fill: solid(L.surface), stroke: stroke(L.muted, 2), decorative: true } as never)
        : createNode('rect', { name: `${label} shape`, x: 0, y: 0, width: p.w, height: p.h, cornerRadius: p.kind === 'start' || p.kind === 'end' ? p.h / 2 : 8, fill: solid(L.surface), stroke: stroke(L.muted, 2), decorative: true } as never);
      const tw = diamond ? p.w * 0.64 : p.w - 16;
      const g = createNode('group', { name: label, x: p.x, y: p.y, width: p.w, height: p.h, fitContents: false, children: [shape, boxText(ctx, `${label} text`, label, (p.w - tw) / 2, 0, tw, p.h, { fontSize: diamond ? 13 : 14, fontWeight: 600, align: 'center', lineHeight: 1.2, decorative: false })] } as never);
      shapeIds.push(g.id);
      return g;
    };
    //What is already on the chart (the start and the decision) and the blanks, which are the question's own drop zones
    const known = laid.map((p, i) => ({ p, i })).filter(({ p }) => !BLANKS.some((b) => b.id === p.id));
    const shapes = known.map(({ p }) => flowShape(p, String(DONE_STEPS.find((s) => s.id === p.id)!.label)));
    const rowOf = new Map<string, FrameNode>();
    const slotOf = new Map<string, SceneNode>();
    BLANKS.forEach((b, k) => {
      const p = laid.find((x) => x.id === b.id)!;
      const r = parts.matchRow[k] as FrameNode;
      Object.assign(r, { name: `Blank ${k + 1} area`, layout: null, x: p.x, y: p.y, width: p.w, height: p.h + 18 });
      const line = parts.matchLine.find((l) => r.children.includes(l)) as FrameNode;
      Object.assign(line, { name: `Blank ${k + 1} line`, layout: null, x: 0, y: 0, width: p.w, height: p.h });
      line.children = line.children.filter((c) => c.questionPart !== 'matchDefinition');
      const slot = line.children[0] as FrameNode;
      Object.assign(slot, { name: `Blank ${k + 1}`, x: 0, y: 0, width: p.w, height: p.h, cornerRadius: p.kind === 'end' ? p.h / 2 : 8 });
      slot.children = [boxText(ctx, `Blank ${k + 1} number`, `Blank ${k + 1}`, 0, 0, p.w, p.h, { fontSize: 14, fontWeight: 700, color: L.muted, align: 'center' })];
      const result = r.children.find((c) => c.questionPart === 'matchState')!;
      result.name = `Blank ${k + 1} result`;
      //The result goes where no arrow does: to the left of a blank on the left of the chart, under one on the right (its arrow leaves from the side)
      const onLeft = p.x + p.w / 2 < canvasW * 0.55;
      Object.assign(result, onLeft ? { x: -130, y: p.h / 2 - 9, width: 122, fontSize: 12, align: 'right', layoutItem: undefined } : { x: 0, y: p.h + 3, width: p.w, fontSize: 12, align: 'center', layoutItem: undefined });
      rowOf.set(b.id, r);
      slotOf.set(b.id, slot);
    });
    const endFor = (id: string): string => (slotOf.get(id) ?? shapes.find((s) => s.name === String(DONE_STEPS.find((x) => x.id === id)!.label)))!.id;
    const wires = DONE_LINKS.map((l, k) => {
      const labelled = l.label ? { label: l.label } : {};
      return createNode('connector', {
        name: `${DONE_STEPS.find((s) => s.id === l.from)!.label} to ${DONE_STEPS.find((s) => s.id === l.to)!.label}`,
        from: { layer: endFor(l.from), side: sides[k].outSide },
        to: { layer: endFor(l.to), side: sides[k].inSide },
        route: 'elbow',
        endCap: 'arrow',
        gap: 3,
        cornerRadius: 10,
        fill: solid(L.background),
        stroke: stroke(L.muted, 2),
        color: L.text,
        fontSize: 13,
        fontWeight: 600,
        fontFamily: BRAND_FONT,
        ...labelled,
      } as never);
    });
    matches.children.unshift(...wires, ...shapes);
    //Each step is named by its words
    for (const t of parts.matchTerm) {
      const label = t.ariaLabel ?? t.name;
      t.name = label;
      for (const c of (t as FrameNode).children) c.name = `${label} text`;
    }
    const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a step, press Space to pick it up, use the arrow keys to choose a blank and Space to drop it.', 0, 0, 100, { fontSize: 14, color: L.muted });
    frame.children.splice(1, 0, keys);
    const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'flow_locked' });
    (parts.buttons[0] as FrameNode).children.push(next);

    goNextOn(hero, byName(hero, 'Follow button')!, 'Navigation');
    goNextOn(donePage, next, 'Navigation');
    {
      const g = graph(results.page);
      g.run(click(g, results.again, 'Try again'), goPrevious());
    }
    void goNext;

    // ------------------------------------------------------------------ notes and checklist
    const below = (page: typeof walkPage, x: number) => ({ x, y: page.height + 14, w: 440, h: 96 });
    addNote(walkPage, { ...below(walkPage, 0), text: '**Data, not shapes** The chart is the `steps` and `links` lists. The live variable `fc` lays it out with `flowChart(...)`, and one repeater draws the shapes and one the arrows.', colour: 'sky' });
    addNote(walkPage, { ...below(walkPage, 456), text: '**Connectors** Each arrow joins one step to another and follows if the layout moves. A decision sends its answers out of its corners, and a link back up goes round the side.', colour: 'sky' });
    addNote(walkPage, { ...below(walkPage, 912), text: '**The walk** `current` is the step the learner is at and `path` the steps so far. The shapes and arrows light up from them, and the answers are one button repeated over the links out of `current`.', colour: 'sky' });
    addNote(walkPage, { ...below(walkPage, 1368), text: '[ ] Write your own `steps` (id, kind, label, detail) and `links` (from, to, answer). A `start` step is where the walk begins, and `current` and `path` must name it.', colour: 'gold' });
    addNote(donePage, { ...below(donePage, 0), text: '**Matching question** The steps, the blank each belongs in and the wrong one are settings of the question (Question section). Check answer, tries and part marks come with it.', colour: 'sky' });
    addNote(donePage, { ...below(donePage, 456), text: '**Blanks** are the question\'s drop zones, drawn as flowchart shapes with arrows to them. Move a blank or a shape and its arrows follow.', colour: 'sky' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
      item('Write the flowchart you want learners to follow: the "steps" variable (Variables panel) has an id, a kind (start, process, decision, io or end), a label and a detail for each step', step, walkPage),
      item('Join the steps: the "links" variable has a from, a to (step ids) and an answer label for each arrow. A decision has one link for each answer. A link back to an earlier step draws a loop', arrow, walkPage),
      item('Set where the walk begins: the "current" and "path" variables hold the id of the first step (the one of kind start)', undefined, walkPage),
      item('Keep the chart to about six rows and two steps across. A bigger one shrinks its gaps and then its shapes to fit', byName(walkPage, 'Flowchart'), walkPage),
      item('Change the page title and the footer text on the Follow page', byName(walkPage, 'Page title'), walkPage),
      item('Complete the flowchart: move the shapes and blanks on the chart to match your own, and type your steps in the Question section (blank 1 takes the first pair). Add wrong steps under Extras', frame, donePage),
      item('Set the tries, the points (the results say "of 3") and the feedback messages', frame, donePage),
      item('Check the text version: press Show as a list on the Follow page and read it as a learner using a screen reader would', byName(walkPage, 'View button'), walkPage),
      item('Change the results page text', results.result, results.page),
    ];
    return { project, checklist };
  },
};
