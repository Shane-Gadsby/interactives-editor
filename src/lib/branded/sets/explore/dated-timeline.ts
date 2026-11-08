/**
 * Dated timeline: events and eras written once as lists with real dates, placed on a real scale. A live variable runs them through
 * `timelineLayout(...)` for the stretch of years in view, which gives every event its place, the lane its label takes (so labels never
 * collide), the eras that show and the ticks of the scale; one layer repeated over each result draws it. Zoom steps from decades down to
 * months, Earlier and Later pan, Next and Previous walk the events, a click or Enter on an event opens its dialog, and a list view is the
 * text alternative. The page has a portrait variant (a responsive set) that runs the same layout down the page, and an ordering activity
 * made with the question kit follows it.
 */
import { createNode, walk, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { addQuestion, partOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, navBarY, overlay, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import { addVar, announce, bind, click, goNext, graph, graphNote, set, setVar, toggleVar } from '../../graph-kit';
import { dialogPanel, extrasChecklist, questionExtras, stack } from '../../parts';
import { clickOf, dressQuestion, endPage, kitNode } from '../drag/shared';
import { heroButtons } from './helpers';

const EVENTS = [
  { date: '1837', title: 'Babbage designs the Analytical Engine', detail: 'Charles Babbage describes a general purpose mechanical computer with a store, a mill and punched cards for its instructions. It is never finished in his lifetime.', image: '', priority: 0 },
  { date: '1843', title: 'Lovelace publishes the first program', detail: 'Ada Lovelace adds notes to a translation of an article about the engine, including a method for calculating Bernoulli numbers: the first published computer program.', image: '', priority: 0 },
  { date: '1936', title: 'Turing describes a universal machine', detail: 'Alan Turing publishes "On Computable Numbers", describing a machine that can carry out any calculation that can be written as steps. It is the idea behind every computer since.', image: '', priority: 0 },
  { date: '1943', end: '1945', title: 'Colossus breaks codes at Bletchley Park', detail: 'Britain builds Colossus, the first large electronic digital computer, to read enemy messages. Ten were built and in use until the end of the war.', image: '', priority: 0 },
  { date: '1946-02-14', title: 'ENIAC is unveiled', detail: 'The Electronic Numerical Integrator and Computer is shown to the public in Philadelphia. It fills a large room and is programmed by rewiring.', image: '', priority: 0 },
  { date: '1947-12', title: 'The transistor is invented', detail: 'Researchers at Bell Labs make the first working transistor, a small switch that replaces the glowing valves in early computers.', image: '', priority: 0 },
  { date: '1949-11', title: 'CSIRAC runs its first program', detail: 'In Sydney, CSIR Mark 1 (later CSIRAC) runs its first test program. It is Australia\'s first computer and one of the first in the world to play music.', image: '', priority: 0 },
  { date: '1958-09', title: 'The integrated circuit', detail: 'Jack Kilby demonstrates the first working integrated circuit at Texas Instruments, putting several parts on one piece of semiconductor.', image: '', priority: 0 },
  { date: '1969-10-29', title: 'The first message on ARPANET', detail: 'A message from UCLA to the Stanford Research Institute is the first sent over the ARPANET, the network that grew into the internet.', image: '', priority: 1 },
  { date: '1969', end: '1990', title: 'ARPANET is in service', detail: 'The network grows from four sites to hundreds before it is shut down in 1990, after the internet has replaced it.', image: '', priority: 0 },
  { date: '1971-11', title: 'The first microprocessor', detail: 'Intel introduces the 4004, a whole processor on one chip.', image: '', priority: 0 },
  { date: '1975-04', title: 'Microsoft is founded', detail: 'Bill Gates and Paul Allen start a company to write software for the new personal computers.', image: '', priority: 0 },
  { date: '1976-04', title: 'The Apple I goes on sale', detail: 'Steve Wozniak and Steve Jobs sell the Apple I, a circuit board for hobbyists to turn into a computer.', image: '', priority: 0 },
  { date: '1981-08-12', title: 'The IBM PC', detail: 'IBM releases its Personal Computer, built from off the shelf parts. Other makers copy it and the PC becomes the standard.', image: '', priority: 1 },
  { date: '1984-01-24', title: 'The Macintosh', detail: 'Apple introduces the Macintosh, a computer with a mouse and windows that most people can use without typing commands.', image: '', priority: 0 },
  { date: '1989-03', title: 'A proposal for the web', detail: 'Tim Berners-Lee at CERN writes "Information Management: A Proposal", the first sketch of the World Wide Web.', image: '', priority: 0 },
  { date: '1991-08-06', title: 'The first website goes online', detail: 'Tim Berners-Lee puts the first website on the public internet, explaining what the web is and how to use it.', image: '', priority: 1 },
  { date: '1991-08-25', title: 'Linux is announced', detail: 'Linus Torvalds, a student in Helsinki, tells a newsgroup he is writing a free operating system as a hobby.', image: '', priority: 0 },
  { date: '1993-04', title: 'Mosaic opens the web', detail: 'The Mosaic browser brings pictures and text together and makes the web something anyone can use.', image: '', priority: 0 },
  { date: '1995', end: '2000', title: 'The dot-com boom', detail: 'Money pours into internet companies. Many fail when the bubble bursts in 2000 and 2001, and a few become giants.', image: '', priority: 0 },
  { date: '1998-09', title: 'Google is founded', detail: 'Larry Page and Sergey Brin start a search engine that ranks pages by the links pointing to them.', image: '', priority: 0 },
  { date: '2001-01-15', title: 'Wikipedia launches', detail: 'A free encyclopaedia that anyone can edit goes online.', image: '', priority: 0 },
  { date: '2007-01-09', title: 'The iPhone is unveiled', detail: 'A phone with a touch screen and a full web browser starts the era of the smartphone.', image: '', priority: 1 },
  { date: '2022-11-30', title: 'A chatbot reaches the public', detail: 'A conversational AI service opens to everyone and reaches a hundred million users in two months.', image: '', priority: 0 },
];

const ERAS = [
  { name: 'Mechanical dreams', from: '1830', to: '1939' },
  { name: 'Valves and war', from: '1939', to: '1958' },
  { name: 'Chips and mainframes', from: '1958', to: '1975' },
  { name: 'Personal computers', from: '1975', to: '1993' },
  { name: 'The web', from: '1993', to: '2007' },
  { name: 'Phones and cloud', from: '2007', to: '2030' },
];

//The steps of the ordering activity, in their right order, written as events the timeline names
const STEPS = [
  'Lovelace publishes the first program',
  'Turing describes a universal machine',
  'ENIAC is unveiled',
  'The transistor is invented',
  'The first message on ARPANET',
  'The first website goes online',
];

//The portrait variant shows when the box the player is in is narrower than this
const BREAKPOINT = 560;
const LAND = { portrait: false, width: 1024, height: 640 };
const PORT = { portrait: true, width: 480, height: 960 };
type Geo = typeof LAND | typeof PORT;

/** States the layout check adds: a dialog open, the list view, zoomed in on a cluster, and an event with a picture. */
export const DATED_TIMELINE_LAYOUT_STATES: LayoutState[] = [
  { label: 'event open', page: ['Timeline', 'Timeline (portrait)'], vars: { open: true, current: 8 } },
  { label: 'list view', page: ['Timeline', 'Timeline (portrait)'], vars: { asList: true, current: 3 } },
  { label: 'zoomed in', page: ['Timeline', 'Timeline (portrait)'], vars: { zoom: 6, pan: 0.93 } },
  { label: 'zoomed in a little', page: ['Timeline', 'Timeline (portrait)'], vars: { zoom: 3, pan: 0.8, current: 12 } },
  { label: 'ordered', page: 'Put in order', vars: { order_answered: true, order_locked: true, order_feedback: 'Out of tries. The right order is shown.' } },
];

//The stage, inside its own coordinates
const AXIS_MARGIN = 24;
//a label's chip is this much wider than its words on the right, a little less on the left (the leader line comes down beside it), and half as much taller
const CHIP_PAD = 6;
const CHIP_LEFT = 4;
const LANDSCAPE = { stageW: 928, stageH: 352, axisLength: 880, axisY: 170, laneH: 64, dot: 18 };
const PORTRAIT = { stageW: 384, stageH: 604, axisLength: 556, axisX: 84, colX: 108, colW: 128, colGap: 8, dot: 18 };

/** Everything the page needs from the shared variables (names, since formulas read them by name). */
interface Vars {
  current: Variable;
  open: Variable;
  asList: Variable;
  zoom: Variable;
  pan: Variable;
  stepZoom: Variable;
}

//Where a copy's block (the bar, then its label under it) starts, from its lane: lanes alternate above and below the axis, row by row
const TOP = `(item.lane % 2 == 0 ? ${LANDSCAPE.axisY - 12 - LANDSCAPE.laneH} - ${LANDSCAPE.laneH} * Math.floor(item.lane / 2) : ${LANDSCAPE.axisY + 30} + ${LANDSCAPE.laneH} * Math.floor(item.lane / 2))`;

/** A frame that repeats its one child over a list, each copy placed by its own bindings (layout none). */
function repeated(name: string, items: string, w: number, h: number, tpl: SceneNode, extra: Record<string, unknown> = {}): FrameNode {
  return createNode('frame', { name, x: 0, y: 0, width: w, height: h, fill: null, stroke: null, clip: false, repeat: { items, layout: 'none', gap: 0, columns: 1 }, children: [tpl], ...extra } as never) as FrameNode;
}

function timelinePage(ctx: BrandedCtx, geo: Geo, v: Vars, tl: string, to: { next: boolean }) {
  const { L } = ctx;
  const portrait = geo.portrait;
  const page = brandedPage(ctx, 'A short history of computing', { name: portrait ? 'Timeline (portrait)' : 'Timeline', footer: 'Dated timeline  ·  Page {pageNumber} of {pageCount}', width: geo.width, height: geo.height });
  const box = contentBox(page);
  const lit = (s: string) => JSON.stringify(s);
  const G = portrait ? PORTRAIT : LANDSCAPE;
  const M = AXIS_MARGIN;
  const dot = G.dot;

  // ------------------------------------------------------------------ the stage
  const ev = `${tl}Events`;
  const fills = (a: string, b: string) => `index % 2 == 0 ? ${lit(a)} : ${lit(b)}`;

  //Eras: bands behind everything, alternating, each named. Landscape: tall bands with the name at the top; portrait: strips with the name running up the left edge
  const bandLen = `(item.len + (item.clipStart ? ${M} : 0) + (item.clipEnd ? ${M} : 0))`;
  const bandAt = `(${M} + item.pos - (item.clipStart ? ${M} : 0))`;
  const eraName = portrait
    ? createNode('text', {
        name: 'Era name',
        text: '{item.name}',
        x: 0,
        y: 0,
        width: 100,
        height: 16,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: 'Open Sans',
        color: L.text,
        align: 'center',
        autoSize: 'none',
        wrap: false,
        rotation: -90,
        fitText: { min: 9, max: 12 },
        decorative: true,
        bindings: { width: `${bandLen} - 8`, x: `9 - (${bandLen} - 8) / 2`, y: `${bandLen} / 2 - 8` },
      } as never)
    : createNode('text', { name: 'Era name', text: '{item.name}', x: 10, y: 6, width: 100, height: 18, fontSize: 13, fontWeight: 700, fontFamily: 'Open Sans', color: L.text, autoSize: 'none', wrap: false, fitText: { min: 10, max: 13 }, decorative: true, bindings: { width: `${bandLen} - 20` } } as never);
  const band = createNode('frame', {
    name: 'Era',
    x: 0,
    y: 0,
    width: 100,
    height: G.stageH,
    fill: solid(L.surface),
    stroke: null,
    clip: true,
    decorative: true,
    bindings: portrait
      ? { y: bandAt, height: bandLen, width: `${G.stageW}`, visible: 'item.inView', 'fill.color': fills(L.surface, L.surfaceMuted) }
      : { x: bandAt, width: bandLen, visible: 'item.inView', 'fill.color': fills(L.surface, L.surfaceMuted) },
    children: [eraName],
  } as never);
  const bands = repeated('Eras', `${tl}Eras`, G.stageW, G.stageH, band, { role: 'group', ariaLabel: 'Eras' });

  //The scale: the axis line and a tick with its date for each step
  const axis = portrait
    ? createNode('rect', { name: 'Axis', x: PORTRAIT.axisX - 1, y: M, width: 3, height: PORTRAIT.axisLength, fill: solid(L.text), stroke: null, decorative: true } as never)
    : createNode('rect', { name: 'Axis', x: M, y: LANDSCAPE.axisY - 1, width: LANDSCAPE.axisLength, height: 3, fill: solid(L.text), stroke: null, decorative: true } as never);
  const tickMark = portrait
    ? createNode('rect', { name: 'Tick mark', x: 66, y: 7, width: 12, height: 2, fill: solid(L.muted), stroke: null, decorative: true } as never)
    : createNode('rect', { name: 'Tick mark', x: 39, y: 0, width: 2, height: 10, fill: solid(L.muted), stroke: null, decorative: true } as never);
  const tickLabel = portrait
    ? createNode('text', { name: 'Tick label', text: '{item.label}', x: 0, y: 0, width: 62, height: 16, fontSize: 12, fontFamily: 'Open Sans', color: L.text, align: 'right', autoSize: 'none', decorative: true, bindings: { fontWeight: 'item.major ? 700 : 400' } } as never)
    : createNode('text', { name: 'Tick label', text: '{item.label}', x: 0, y: 12, width: 80, height: 18, fontSize: 13, fontFamily: 'Open Sans', color: L.text, align: 'center', autoSize: 'none', decorative: true, bindings: { fontWeight: 'item.major ? 700 : 400' } } as never);
  const tick = createNode('frame', {
    name: 'Tick',
    x: 0,
    y: 0,
    width: portrait ? 80 : 80,
    height: portrait ? 16 : 30,
    fill: null,
    stroke: null,
    clip: false,
    decorative: true,
    bindings: portrait ? { x: '6', y: `${M} + item.pos - 8` } : { x: `${M} + item.pos - 40`, y: `${LANDSCAPE.axisY + 2}` },
    children: [tickMark, tickLabel],
  } as never);
  const ticks = repeated('Ticks', `${tl}Ticks`, G.stageW, G.stageH, tick, { role: 'group', ariaLabel: 'Scale' });

  //The marker (today, or the date you choose): a line across the stage, named at the foot on the wide page
  const markerOn = `${tl}Marker.length > 0 && ${tl}Marker[0].inView`;
  const marker = portrait
    ? createNode('rect', { name: 'Marker line', x: 0, y: 0, width: G.stageW, height: 2, fill: solid(L.error), stroke: null, decorative: true, bindings: { y: `${M} + ${tl}Marker[0].pos - 1`, visible: markerOn } } as never)
    : createNode('rect', { name: 'Marker line', x: 0, y: 0, width: 2, height: G.stageH, fill: solid(L.error), stroke: null, decorative: true, bindings: { x: `${M} + ${tl}Marker[0].pos - 1`, visible: markerOn } } as never);
  const markerLabel = portrait
    ? createNode('text', { name: 'Marker label', text: '{markerLabel}', x: 250, y: 0, width: 128, height: 16, fontSize: 12, fontWeight: 700, fontFamily: 'Open Sans', color: L.text, align: 'right', autoSize: 'none', decorative: true, bindings: { y: `${M} + ${tl}Marker[0].pos - 18`, visible: markerOn } } as never)
    : createNode('text', { name: 'Marker label', text: '{markerLabel}', x: 0, y: G.stageH - 22, width: 110, height: 18, fontSize: 13, fontWeight: 700, fontFamily: 'Open Sans', color: L.text, autoSize: 'none', decorative: true, bindings: { x: `${tl}Marker[0].pos > ${LANDSCAPE.axisLength - 120} ? ${M} + ${tl}Marker[0].pos - 116 : ${M} + ${tl}Marker[0].pos + 6`, align: `${tl}Marker[0].pos > ${LANDSCAPE.axisLength - 120} ? "right" : "left"`, visible: markerOn } } as never);

  //Leader lines and bars: a thin line from each labelled event to its label, and a bar the length of a range
  const colOf = `(${PORTRAIT.colX} + item.lane * ${PORTRAIT.colW + PORTRAIT.colGap})`;
  const stemNode = portrait
    ? createNode('rect', { name: 'Leader line', x: 0, y: 0, width: 10, height: 2, fill: solid(L.muted), stroke: null, decorative: true, bindings: { x: `${PORTRAIT.axisX + 9}`, y: `${M} + item.pos - 1`, width: `${colOf} - 10 - ${PORTRAIT.axisX + 9}`, visible: 'item.labelled && item.inView' } } as never)
    : createNode('rect', { name: 'Leader line', x: 0, y: 0, width: 2, height: 40, fill: solid(L.muted), stroke: null, decorative: true, bindings: { x: `${M} + item.pos - 1`, y: `item.lane % 2 == 0 ? ${TOP} + 4 : ${LANDSCAPE.axisY}`, height: `item.lane % 2 == 0 ? ${LANDSCAPE.axisY} - ${TOP} - 4 : ${TOP} + 4 - ${LANDSCAPE.axisY}`, visible: 'item.labelled && item.inView' } } as never);
  const stems = repeated('Leader lines', ev, G.stageW, G.stageH, stemNode);
  const barNode = portrait
    ? createNode('rect', { name: 'Range bar', x: 0, y: 0, width: 6, height: 6, cornerRadius: 3, fill: solid(L.text), stroke: null, decorative: true, bindings: { x: `${colOf} - 10`, y: `${M} + item.pos`, height: 'Math.max(6, item.len)', visible: 'item.range && item.labelled && item.inView' } } as never)
    : createNode('rect', { name: 'Range bar', x: 0, y: 0, width: 6, height: 8, cornerRadius: 4, fill: solid(L.text), stroke: null, decorative: true, bindings: { x: `${M} + item.pos`, y: `${TOP}`, width: 'Math.max(6, item.len)', visible: 'item.range && item.labelled && item.inView' } } as never);
  const bars = repeated('Range bars', ev, G.stageW, G.stageH, barNode);

  //Labels: the date, then the title in bold, in the lane the layout chose; a click on one opens the event too
  //(each on a chip of the page colour: the marker line, the bars and the bands all run behind labels, and the words need a plain ground)
  const labelText = createNode('text', {
    name: 'Event label text',
    text: '',
    runs: [{ text: '{item.dateText}\n', fontWeight: 400 }, { text: '{item.title}', fontWeight: 700 }],
    x: CHIP_LEFT,
    y: CHIP_PAD / 2,
    width: 100,
    height: 40,
    fontSize: 13,
    lineHeight: 1.25,
    fontFamily: 'Open Sans',
    color: L.text,
    autoSize: 'none',
    wrap: true,
    decorative: true,
    bindings: { width: 'item.labelW + 4', height: 'item.labelH' },
  } as never);
  const chipW = 'item.labelW + 4 + ' + (CHIP_PAD + CHIP_LEFT);
  const chipH = 'item.labelH + ' + CHIP_PAD;
  const labelNode = createNode('frame', {
    name: 'Event label',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    cornerRadius: 6,
    fill: solid(L.background),
    stroke: null,
    clip: false,
    decorative: true,
    bindings: portrait
      ? { x: `${colOf} - ${CHIP_LEFT}`, y: `${M} + item.labelPos - ${CHIP_PAD / 2}`, width: chipW, height: chipH, visible: 'item.labelled && item.inView' }
      : { x: `${M} + item.labelPos + 6 - ${CHIP_LEFT}`, y: `${TOP} + 12 - ${CHIP_PAD / 2}`, width: chipW, height: chipH, visible: 'item.labelled && item.inView' },
    children: [labelText],
  } as never);
  const labels = repeated('Event labels', ev, G.stageW, G.stageH, labelNode);

  //The events themselves: one button each at its date, in date order, one Tab stop with the arrow keys moving between them
  const dotNode = createNode('button', {
    name: 'Event dot',
    label: '',
    x: 0,
    y: 0,
    width: dot,
    height: dot,
    cornerRadius: dot / 2,
    fill: solid(L.background),
    stroke: stroke(L.text, 3),
    color: L.text,
    bindings: {
      ...(portrait ? { x: `${PORTRAIT.axisX} - ${dot / 2}`, y: `${M} + item.pos - ${dot / 2}` } : { x: `${M} + item.pos - ${dot / 2}`, y: `${LANDSCAPE.axisY - dot / 2}` }),
      visible: 'item.inView',
      ariaLabel: 'item.spoken + ": " + item.title',
      ariaCurrent: 'current == index ? "date" : false',
      'fill.color': `current == index ? ${lit(L.text)} : ${lit(L.background)}`,
      //the chosen one is solid with a ring of the page colour, so it still stands off the axis it sits on
      'stroke.paint.color': `current == index ? ${lit(L.background)} : ${lit(L.text)}`,
      scaleX: 'current == index ? 1.3 : 1',
      scaleY: 'current == index ? 1.3 : 1',
    },
  } as never);
  const dots = repeated('Event dots', ev, G.stageW, G.stageH, dotNode, {
    role: 'group',
    ariaLabel: 'Events in date order',
    keyNav: { mode: 'list', orientation: 'both', countHidden: true, indexVariable: v.current.id },
  });

  const view = createNode('frame', {
    name: 'Timeline view',
    x: 0,
    y: 0,
    width: G.stageW,
    height: G.stageH,
    fill: null,
    stroke: null,
    clip: false,
    bindings: { visible: '!asList' },
    children: [bands, ticks, axis, marker, markerLabel, stems, bars, labels, dots],
  } as never) as FrameNode;

  //The list view: every event, in date order, with its date, its era and its title (the text alternative to the scale)
  const rowH = portrait ? 56 : 42;
  const rowKids = portrait
    ? [
        text(ctx, 'Row date', '{item.dateText}', 14, 6, 190, { fontSize: 13, fontWeight: 700, autoSize: 'none', height: 18, decorative: true } as never),
        text(ctx, 'Row era', '{item.eraName}', 208, 7, 120, { fontSize: 12, color: L.muted, autoSize: 'none', height: 16, align: 'right', decorative: true } as never),
        text(ctx, 'Row title', '{item.title}', 14, 25, G.stageW - 56, { fontSize: 15, autoSize: 'none', height: 24, decorative: true } as never),
      ]
    : [
        text(ctx, 'Row date', '{item.dateText}', 16, 10, 190, { fontSize: 16, fontWeight: 700, autoSize: 'none', height: 22, decorative: true } as never),
        text(ctx, 'Row title', '{item.title}', 216, 10, 470, { fontSize: 16, autoSize: 'none', height: 22, decorative: true } as never),
        text(ctx, 'Row era', '{item.eraName}', 700, 10, 190, { fontSize: 14, color: L.muted, autoSize: 'none', height: 22, align: 'right', decorative: true } as never),
      ];
  const row = createNode('frame', {
    name: 'Event row',
    x: 0,
    y: 0,
    width: G.stageW - 32,
    height: rowH,
    cornerRadius: 12,
    fill: solid(L.background),
    stroke: null,
    clip: true,
    role: 'button',
    bindings: { ariaLabel: 'item.spoken + ": " + item.title', ariaCurrent: 'current == index ? "date" : false', 'fill.color': `current == index ? ${lit(L.surfaceMuted)} : ${lit(L.background)}` },
    children: rowKids,
  } as never);
  const list = createNode('frame', {
    name: 'Event list',
    x: 16,
    y: 16,
    width: G.stageW - 32,
    height: G.stageH - 32,
    fill: null,
    stroke: null,
    clip: true,
    scroll: 'vertical',
    role: 'region',
    ariaLabel: 'Events in date order',
    repeat: { items: ev, layout: 'vertical', gap: 6, columns: 1 },
    keyNav: { mode: 'list', orientation: 'vertical', indexVariable: v.current.id },
    bindings: { visible: 'asList' },
    children: [row],
  } as never) as FrameNode;

  const stage = createNode('frame', {
    name: 'Timeline stage',
    x: box.x,
    y: portrait ? 290 : box.y + 48,
    width: G.stageW,
    height: G.stageH,
    cornerRadius: 16,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    clip: true,
    role: 'region',
    ariaLabel: 'Timeline',
    bindings: {
      ariaDescription: `"Showing " + ${tl}Info[0].rangeText + ". " + ${ev}.filter(e => e.inView).length + " of " + ${ev}.length + " events are in view. Events are buttons in date order: use the arrow keys to move between them. View as list shows every event."`,
    },
    children: [view, list],
  } as never) as FrameNode;
  page.children.push(stage);

  // ------------------------------------------------------------------ controls
  const pill = (name: string, label: string, x: number, y: number, w: number, extra: Record<string, unknown> = {}, primary = false) => {
    const b = button(ctx, name, label, x, y, w, primary);
    Object.assign(b, { height: 40, cornerRadius: 20, fontSize: 15 }, extra);
    return b;
  };
  const noScale = 'asList || zoom == 0';
  let earlier: SceneNode, later: SceneNode, zin: SceneNode, zout: SceneNode, fit: SceneNode, prev: SceneNode, next: SceneNode, step: SceneNode, view2: SceneNode, activity: SceneNode, status: SceneNode;
  if (portrait) {
    const y1 = box.y;
    const y2 = box.y + 48;
    const y3 = box.y + 96;
    earlier = bind(pill('Earlier button', 'Earlier', box.x, y1, 86, { shortcut: 'PageUp' }), { disabled: `${noScale} || pan <= 0` });
    later = bind(pill('Later button', 'Later', box.x + 92, y1, 72, { shortcut: 'PageDown' }), { disabled: `${noScale} || pan >= 1` });
    zin = bind(pill('Zoom in button', 'Zoom in', box.x + 170, y1, 96, { shortcut: '+' }), { disabled: 'asList || zoom >= maxZoom' });
    zout = bind(pill('Zoom out button', 'Zoom out', box.x + 272, y1, 112, { shortcut: '-' }), { disabled: noScale });
    fit = bind(pill('Fit all button', 'Fit all', box.x, y2, 84), { disabled: noScale });
    prev = bind(pill('Previous event button', 'Previous', box.x + 90, y2, 92, { ariaLabel: 'Previous event' }), { disabled: `current <= 0` });
    next = bind(pill('Next event button', 'Next', box.x + 188, y2, 70, { ariaLabel: 'Next event' }), { disabled: `current >= ${ev}.length - 1` });
    step = pill('Step through button', 'Step through', box.x + 264, y2, 120, {}, false);
    view2 = bind(pill('View button', 'View as list', box.x, y3, 150), { label: 'asList ? "View as timeline" : "View as list"' });
    activity = bind(pill('Activity button', 'Try the activity', box.x + 158, y3, 190, {}, true), { visible: to.next ? 'pageNumber < pageCount' : 'false' });
    status = text(ctx, 'Timeline status', `{${tl}Info[0].rangeText}{${tl}Info[0].unlabelled > 0 ? " · " + ${tl}Info[0].unlabelled + " without labels, zoom in" : ""}`, box.x, y3 + 54, box.width, { fontSize: 14, color: L.muted });
  } else {
    const y1 = box.y;
    earlier = bind(pill('Earlier button', 'Earlier', box.x, y1, 100, { shortcut: 'PageUp' }), { disabled: `${noScale} || pan <= 0` });
    later = bind(pill('Later button', 'Later', box.x + 110, y1, 90, { shortcut: 'PageDown' }), { disabled: `${noScale} || pan >= 1` });
    zin = bind(pill('Zoom in button', 'Zoom in', box.x + 210, y1, 108, { shortcut: '+' }), { disabled: 'asList || zoom >= maxZoom' });
    zout = bind(pill('Zoom out button', 'Zoom out', box.x + 328, y1, 118, { shortcut: '-' }), { disabled: noScale });
    fit = bind(pill('Fit all button', 'Fit all', box.x + 456, y1, 90), { disabled: noScale });
    view2 = bind(pill('View button', 'View as list', box.x + box.width - 164, y1, 164), { label: 'asList ? "View as timeline" : "View as list"' });
    const y2 = navBarY(page);
    prev = bind(pill('Previous event button', 'Previous event', box.x, y2, 160), { disabled: `current <= 0` });
    next = bind(pill('Next event button', 'Next event', box.x + 170, y2, 140), { disabled: `current >= ${ev}.length - 1` });
    step = pill('Step through button', 'Step through', box.x + 320, y2, 150, {}, false);
    activity = bind(pill('Activity button', 'Try the activity', box.x + box.width - 190, y2, 190, {}, true), { visible: to.next ? 'pageNumber < pageCount' : 'false' });
    status = text(ctx, 'Timeline status', `{${tl}Info[0].rangeText}{${tl}Info[0].unlabelled > 0 ? " · " + ${tl}Info[0].unlabelled + " without labels" : ""}`, box.x + 486, y2 + 10, 240, { fontSize: 14, color: L.muted, autoSize: 'none', height: 20 } as never);
  }
  page.children.push(earlier, later, zin, zout, fit, prev, next, step, view2, activity, status);

  // ------------------------------------------------------------------ the dialog
  const when = text(ctx, 'Event date', '{' + `${ev}[current]?.dateText` + '}', 0, 0, 100, { fontSize: 22, fontWeight: 700, layoutItem: { width: 'fill' } } as never);
  const era = bind(text(ctx, 'Event era', '{' + `${ev}[current]?.eraName` + '}', 0, 0, 100, { fontSize: 15, fontWeight: 600, color: L.muted, layoutItem: { width: 'fill' } } as never), { visible: `!!${ev}[current]?.eraName` });
  const detail = text(ctx, 'Event detail', '{' + `${ev}[current]?.detail` + '}', 0, 0, 100, { fontSize: 18, lineHeight: 1.4, layoutItem: { width: 'fill' } } as never);
  const words = stack('Event words', 0, 0, portrait ? 384 : 360, { gap: 10, children: [when, era, detail] });
  words.layoutItem = { ...(words.layoutItem ?? {}), width: 'fill' };
  const picW = portrait ? 384 : 252;
  const picH = portrait ? 216 : 200;
  const pic = createNode('frame', {
    name: 'Event picture',
    x: 0,
    y: 0,
    width: picW,
    height: picH,
    cornerRadius: 12,
    fill: solid(L.surfaceMuted),
    stroke: null,
    clip: true,
    ariaLabel: 'Picture of the event: put its image in the event\'s image field',
    bindings: { visible: `!!${ev}[current]?.image` },
    children: [createNode('image', { name: 'Event image', x: 0, y: 0, width: picW, height: picH, assetId: null, fit: 'cover', cornerRadius: 0, decorative: true, bindings: { assetId: `${ev}[current]?.image` } } as never)],
  } as never);
  const body = stack('Event dialog body', 24, portrait ? 104 : 64, portrait ? 384 : 652, { direction: portrait ? 'column' : 'row', gap: 20, align: 'start', children: portrait ? [pic, words] : [words, pic] });
  const dialog = dialogPanel(ctx, page, 'Event dialog', v.open, portrait ? { x: 24, y: 150, width: 432, height: 620, title: 'Event', children: [body] } : { x: 162, y: 130, width: 700, height: 380, title: 'Event', children: [body] });
  bind(dialog.title, { text: `${ev}[current]?.title` });
  bind(dialog.frame, { ariaLabel: `${ev}[current]?.title` });
  overlay(dialog.frame);

  // ------------------------------------------------------------------ the graph
  const g = graph(page);
  //A click on an event, or on its label, or on a row of the list: that event, and its dialog
  const openOn = (target: SceneNode, note: string) => {
    const press = g.event('event.pointer', { target: target.id, type: 'click', childrenOnly: true }, note);
    g.run(press, setVar(v.current, 'event.childIndex'), set(v.open, 'true'));
    return press;
  };
  const dotPress = openOn(dots, 'Open an event');
  openOn(labels, 'Open an event');
  openOn(list, 'Open an event');
  graphNote(page, { anchor: dotPress, colour: 'sky', text: '**The dots, the labels and the list rows each get the same flow.** `event.childIndex` is the event\'s place in the date-sorted list, so one `current` says which the dialog shows, whichever way it was opened.' });
  //Zooming keeps the middle of what you are looking at (or the event you are on) where it is
  const panFor = (spanExpr: string) => `clamp((centreAt - (${spanExpr}) / 2 - bounds[0]) / Math.max(0.001, bounds[2] - (${spanExpr})), 0, 1)`;
  const zinClick = click(g, zin, 'Zoom in');
  graphNote(page, { anchor: zinClick, colour: 'sky', text: '**Pan is set before zoom,** because `centreAt` (live) reads the view as it is now: the middle of what you see, or the event you are on. The new pan keeps that point where it was.' });
  g.run(zinClick, setVar(v.pan, panFor('bounds[2] / 2 ** (zoom + 1)')), setVar(v.zoom, 'zoom + 1'), announce(`"Zoomed in. Showing " + ${tl}Info[0].rangeText`));
  g.run(click(g, zout, 'Zoom out'), setVar(v.pan, panFor('bounds[2] / 2 ** (zoom - 1)')), setVar(v.zoom, 'zoom - 1'), announce(`"Zoomed out. Showing " + ${tl}Info[0].rangeText`));
  g.run(click(g, fit, 'Fit all'), setVar(v.zoom, '0'), setVar(v.pan, '0'), announce(`"Showing everything, " + ${tl}Info[0].rangeText`));
  //Earlier and Later move a quarter of the view
  const shift = (sign: string) => `clamp(pan ${sign} 0.25 * viewSpan / Math.max(0.001, bounds[2] - viewSpan), 0, 1)`;
  const earlierClick = click(g, earlier, 'Earlier');
  graphNote(page, { anchor: earlierClick, colour: 'sky', text: '**Earlier and Later slide the view a quarter of its width,** and clamp `pan` between 0 and 1, so they stop at the ends of the data. `viewSpan` is live and shrinks as the zoom goes up.' });
  g.run(earlierClick, setVar(v.pan, shift('-')), announce(`"Showing " + ${tl}Info[0].rangeText`));
  g.run(click(g, later, 'Later'), setVar(v.pan, shift('+')), announce(`"Showing " + ${tl}Info[0].rangeText`));
  //Walking the events: the view follows when the one you land on is out of it (the variable flow below), and it is said aloud
  g.run(click(g, next, 'Next event'), setVar(v.current, `Math.min(${ev}.length - 1, current + 1)`));
  g.run(click(g, prev, 'Previous event'), setVar(v.current, 'Math.max(0, current - 1)'));
  const stepClick = click(g, step, 'Step through');
  graphNote(page, { anchor: stepClick, colour: 'sky', text: '**Step through sets `current` to -1, then 0, on purpose.** Follow the event fires on a change, so going via -1 makes it run even when you were already on the first event. [ ] `stepZoom` is how far in it goes.' });
  g.run(stepClick, setVar(v.zoom, 'Math.min(maxZoom, stepZoom)'), setVar(v.pan, '0'), setVar(v.current, '-1'), setVar(v.current, '0'));
  g.run(click(g, view2, 'View as list'), toggleVar(v.asList), announce('asList ? "Showing the list, in date order" : "Showing the timeline"'));
  const moved = g.event('event.variable', { variable: v.current.id, onlyIf: `current >= 0 && !!${ev}[current]` }, 'Follow the event');
  graphNote(page, { anchor: moved, colour: 'sky', text: '**Follow the event runs on any change of `current`** (Next, Previous, a dot, Step through). It pans only if the event is out of view (`inView`), then says it aloud. *Only if* keeps -1, nothing picked, quiet.' });
  g.run(moved, setVar(v.pan, `${ev}[current].inView ? pan : clamp((${ev}[current].start - viewSpan / 2 - bounds[0]) / Math.max(0.001, bounds[2] - viewSpan), 0, 1)`), announce(`${ev}[current].spoken + ": " + ${ev}[current].title + ". Event " + (current + 1) + " of " + ${ev}.length`));
  if (to.next) g.run(click(g, activity, 'Pages'), goNext());

  return { page, stage, dots, labels, bands, ticks, list, dialog, earlier, zin, fit, prev, next, step, view: view2, activity, bars, stems, pic, row, band, status };
}

export const datedTimeline: BrandedStarter = {
  key: 'explore/dated-timeline',
  set: 'explore',
  name: 'Dated timeline',
  description: 'A timeline on a real scale: events and eras with dates, written once as lists. Events sit where their dates fall (a range is a bar), eras shade the background, and labels stack into lanes so they never collide. Zoom from decades to months, pan, or step through the events one at a time; an event opens in a dialog. The events are buttons in date order, there is a list view, a portrait version for phones, and an ordering activity. Beside the simpler Interactive timeline.',
  tags: ['timeline', 'dates', 'zoom', 'keyboard friendly', 'responsive', 'ordering'],
  layoutStates: DATED_TIMELINE_LAYOUT_STATES,
  build(colourway) {
    const ctx = brandedProject(colourway, 'Dated timeline');
    const { L, project } = ctx;
    //Viewers who ask for less motion lose nothing: nothing here moves except by the viewer's own press
    const hero = brandedPage(ctx, 'A short history of computing', { kind: 'hero', subtitle: 'Explore the events on a timeline: zoom in from the centuries to the months, then put some of them in order.' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next', width: 180 }]);

    //The events and the eras are lists with dates written as people write them (1969, 1969-07, 1969-07-20); a range has an end
    addVar(project, 'events', 'list', EVENTS);
    addVar(project, 'eras', 'list', ERAS);
    //A date to mark with a line ("today", or any date; empty for none) and what to call it
    addVar(project, 'markerDate', 'string', 'today');
    addVar(project, 'markerLabel', 'string', 'Today');
    addVar(project, 'stepZoom', 'number', 4);
    //The view: how far in (0 is everything, each step halves the years shown) and how far along (0 the start, 1 the end)
    //(it opens a step in and at the later end, so the sample's busy years have room; Fit all shows everything)
    const zoom = addVar(project, 'zoom', 'number', 1);
    const pan = addVar(project, 'pan', 'number', 1);
    addVar(project, 'bounds', 'list', [], { formula: 'timeBounds(events, eras, markerDate)', live: true });
    addVar(project, 'maxZoom', 'number', 0, { formula: 'Math.max(0, Math.floor(Math.log2(bounds[2] / 0.5)))', live: true });
    addVar(project, 'viewSpan', 'number', 0, { formula: 'bounds[2] / 2 ** zoom', live: true });
    addVar(project, 'viewFrom', 'number', 0, { formula: 'bounds[0] + pan * (bounds[2] - viewSpan)', live: true });
    addVar(project, 'viewTo', 'number', 0, { formula: 'viewFrom + viewSpan', live: true });
    const current = addVar(project, 'current', 'number', -1);
    const open = addVar(project, 'open', 'boolean', false);
    const asList = addVar(project, 'asList', 'boolean', false);
    //Two layouts of the same lists: along the wide page and down the phone page
    const wide = `{length: ${LANDSCAPE.axisLength}, labelSize: 13, lanes: 4, maxLabel: 170, maxLines: 2, dateLine: true, gap: 14, marker: markerDate}`;
    const tall = `{length: ${PORTRAIT.axisLength}, orientation: "vertical", labelSize: 13, lanes: 2, sides: 1, columnWidth: ${PORTRAIT.colW}, maxLines: 3, dateLine: true, gap: 8, marker: markerDate}`;
    //A variable holds a list, so each layout is handed over a part at a time: the events, the eras, the ticks, the marker (none or one) and one row of facts
    for (const [name, opts] of [['tl', wide], ['tlp', tall]] as const) {
      for (const [suffix, part] of [['Events', 'events'], ['Eras', 'eras'], ['Ticks', 'ticks'], ['Marker', 'marker'], ['Info', 'info']] as const) {
        addVar(project, `${name}${suffix}`, 'list', [], { formula: `timelineLayout(events, eras, viewFrom, viewTo, ${opts}, "${part}")`, live: true });
      }
    }
    addVar(project, 'centreAt', 'number', 0, { formula: 'current >= 0 && tlEvents[current] && tlEvents[current].inView ? tlEvents[current].start : viewFrom + viewSpan / 2', live: true });
    const v: Vars = { current, open, asList, zoom, pan, stepZoom: project.variables.find((x) => x.name === 'stepZoom')! };

    //The wide page is the base of a responsive set, the portrait page its phone variant (same layer names, laid out down the page)
    const land = timelinePage(ctx, LAND, v, 'tl', { next: true });
    const port = timelinePage(ctx, PORT, v, 'tlp', { next: true });
    port.page.variantOf = land.page.id;
    port.page.minWidth = 0;
    land.page.minWidth = BREAKPOINT;

    // ------------------------------------------------------------------ the activity
    const activity = brandedPage(ctx, 'Put these events in order', { name: 'Put in order', footer: 'Dated timeline  ·  Page {pageNumber} of {pageCount}' });
    const results = endPage(ctx, 'Well done', 'You scored {order_score} of 6.', 'Try again');
    const abox = contentBox(activity);
    const qid = addQuestion(project, activity.id, 'ordering', { at: { x: abox.x, y: abox.y - 8 }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
    setQuestionSettings(project, activity.id, qid, {
      prefix: 'order',
      prompt: 'Put these events from the timeline in order, earliest first, using the arrows.',
      points: 6,
      shuffle: true,
      attempts: 3,
      options: STEPS.map((t, i) => ({ id: `o${i + 1}`, text: t })),
      hints: ['Look at the scale on the timeline: the earliest events are furthest to the left.'],
      feedbackCorrect: 'Correct. That is the order they happened in.',
      feedbackPartial: 'Some are in the right place. Check the ones marked wrong against the timeline.',
      feedbackIncorrect: 'Not quite. Go back to the timeline and find each date.',
      feedbackOutOfTries: 'Out of tries. The right order is shown.',
    });
    const frame = activity.children.find((n) => n.id === qid) as FrameNode;
    frame.name = 'Order question';
    dressQuestion(ctx, frame, abox.width, { pad: 16, gap: 10 });
    walk(frame.children, (n: SceneNode) => {
      const part = partOf(n);
      if (n.type === 'button' && (part === 'moveUp' || part === 'moveDown')) {
        n.cornerRadius = 16;
        n.height = 28;
        n.fill = solid(L.surfaceMuted);
        n.stroke = null;
      }
      if (n.type === 'frame' && part === 'option') {
        n.cornerRadius = 20;
        n.height = 40;
        if (n.layout) n.layout.padding = { top: 6, right: 10, bottom: 6, left: 18 };
      }
      if (n.type === 'text' && part === 'prompt') Object.assign(n, { fontWeight: 700, fontSize: 18 });
      if (n.type === 'frame' && part === 'options' && n.layout) n.layout.gap = 6;
    });
    const see = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'order_locked' });
    (frame.children.find((n) => partOf(n) === 'buttons') as FrameNode).children.push(see);
    {
      const g = graph(activity);
      g.run(click(g, see, 'Pages'), goNext());
      graphNote(activity, { anchor: kitNode(activity, 'moveUp:event'), colour: 'sky', text: '**One flow for Move up and one for Move down serve every event.** `event.index` is the one whose button was pressed. The question kit wired Start, Check, Hint and Try again as well.' });
      graphNote(activity, { anchor: clickOf(activity, see), colour: 'sky', text: '**See results shows once `order_locked` is true,** right or out of tries, and goes to the next page in the order.' });
      const g2 = graph(results.page);
      g2.run(click(g2, results.again, 'Try again'), ['action.artboard', { to: 'previous', transition: 'fade', duration: 250 }]);
    }

    // ------------------------------------------------------------------ notes
    const below = (p: Artboard, x: number, w = 300) => ({ x, y: p.height + 14, w, h: 130 });
    const lp = land.page;
    addNote(lp, { ...below(lp, 0), colour: 'sky', text: '**Real scale** `events` and `eras` are lists with dates (1969, 1969-07, 1969-07-20; add an `end` for a range). `tl` is a live variable, `timelineLayout(...)`, that places each one for the years in view, so the gaps mean something and the layout is the same on the canvas and in the player.' });
    addNote(lp, { ...below(lp, 316), colour: 'sky', text: '**Lanes** A label takes the first lane with room, the events with a higher `priority` first, so labels never collide and a leader line never runs through another label. An event with no room is still a button; zoom in, or use the list, to read it.' });
    addNote(lp, { ...below(lp, 632), colour: 'gold', text: '[ ] Write your events and eras in the Variables tab. Set `markerDate` to a date (or empty for no marker line) and `stepZoom` for how far Step through zooms in. The page and the portrait page share the lists.' });
    addNote(port.page, { ...below(port.page, 0, 220), colour: 'sky', text: '**Portrait variant** The same layer names laid out down the page, shown under 560 px wide. It reads `tlp`, the same lists laid out for a vertical axis. A change to wording or layout on one page is made on the other.' });
    addNote(activity, { ...below(activity, 0, 440), colour: 'sky', text: '**Ordering question** The steps are listed in their RIGHT order in the Question section; the learner sees them shuffled. [ ] Change them to events from your own timeline (and the points and hint).' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
      item('Write your events: the "events" list variable (Variables tab). Each has a date (1969, 1969-07 or 1969-07-20), a title, a detail for its dialog, an optional end date to make it a range, an optional "image" (an asset id) and a "priority" (higher gets a label first). Any order: they are placed by date', land.dots, lp),
      item('Write your eras: the "eras" variable has a name and a from and to date each. They shade the background behind the events. Leave it empty for none', land.bands, lp),
      item('To give an event a picture, upload the image and put its asset id in that event\'s "image", and say what it shows in the event\'s detail. With no image the dialog has none', land.pic, lp),
      item('Choose the marker line: "markerDate" is a date, "today", or empty for none, and "markerLabel" is what it is called', land.stage, lp),
      item('Check the scale: zoom runs from the whole span down to months, and "stepZoom" is how far Step through zooms in. A date that cannot be read is skipped, so check every event shows in the list view', land.stage, lp),
      item('The portrait page is a phone variant of the timeline (a responsive set shown under 560 px wide) with the same layer names. Wording and layout changes are made on both. Check it in the Preview with a narrow window', port.stage, port.page),
      item('Change the ordering activity: the steps in the Question section, in their right order, and the points, hint and feedback. Delete the page to end after the timeline: the "Try the activity" buttons hide themselves', frame, activity),
      item('Try it with the keyboard: Tab to the events, the arrow keys to move along them, Enter to open one, Esc to close it; Page Up and Page Down pan, plus and minus zoom', land.dots, lp),
      item('Change the footer lines and pick the colourway on the Themes tab', byName(lp, 'Footer text'), lp),
    ];
    checklist.push(item(extrasChecklist({ hint: true, tryAgain: true })));
    return { project, checklist };
  },
};
