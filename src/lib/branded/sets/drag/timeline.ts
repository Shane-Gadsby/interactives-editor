/**
 * Interactive timeline: events on a line, a detail card for the chosen one, Previous and Next, and an intro that draws the line. The
 * events are one list; the markers are one layer repeated over it and one click flow serves every dot (event.childIndex).
 */
import { createNode, uid, type FrameNode, type Keyframe, type SceneNode, type TemplateChecklistItem, type Timeline, type Track } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, announce, bind, click, graph, setVar } from '../../graph-kit';
import { goNextOn, heroPage, lit, resetVars } from './shared';
import { fill, progressBar, stack } from '../../parts';

interface Moment {
  date: string;
  short: string;
  title: string;
  body: string;
}

const MOMENTS: Moment[] = [
  { date: '1957', short: 'Sputnik 1', title: 'Sputnik 1 is launched', body: 'The Soviet Union launched Sputnik 1 on 4 October 1957. It was the first artificial satellite to orbit Earth, and it began the space age.' },
  { date: '1961', short: 'First human in space', title: 'Yuri Gagarin orbits Earth', body: 'On 12 April 1961 Yuri Gagarin made one orbit of Earth aboard Vostok 1. He was the first human to travel into space.' },
  { date: '1969', short: 'Moon landing', title: 'Apollo 11 lands on the Moon', body: 'On 20 July 1969 Neil Armstrong and Buzz Aldrin landed on the Moon while Michael Collins stayed in orbit. Armstrong was the first to step onto the surface.' },
  { date: '1981', short: 'First shuttle flight', title: 'The first Space Shuttle flight', body: 'Columbia launched on 12 April 1981. The Space Shuttle was the first orbital spacecraft designed to be flown more than once.' },
  { date: '1990', short: 'Hubble launched', title: 'The Hubble Space Telescope is launched', body: 'Launched on 24 April 1990, Hubble orbits above the atmosphere, which gives it a much clearer view of distant objects than telescopes on the ground.' },
  { date: '1998', short: 'Space station begins', title: 'Building the International Space Station', body: 'The first module, Zarya, was launched in November 1998. The station has been continuously crewed since November 2000.' },
  { date: '2012', short: 'Curiosity on Mars', title: 'Curiosity lands on Mars', body: 'NASA\'s Curiosity rover landed in Gale Crater on 6 August 2012 to find out whether Mars once had conditions that could support life.' },
];
const N = MOMENTS.length;
//The markers are 112 wide and spread across 864, so the line runs from the middle of the first to the middle of the last
const MARK_W = 112;
const ROW = { x: 80, w: 864, y: 131 };
const LINE_Y = ROW.y + 16;

export function interactiveTimeline(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Interactive timeline');
  const { L, project } = ctx;
  //Viewers who ask for less motion see the finished line straight away
  project.settings.reducedMotion = true;
  const { page: hero, start } = heroPage(ctx, 'Space exploration timeline', 'Choose an event on the timeline to read about it, or step through them one at a time.');
  const page = brandedPage(ctx, 'Milestones of space exploration', { name: 'Timeline', footer: 'Choose an event' });
  const box = contentBox(page);

  //The events are one list (an `image` is an asset id for the event's picture); everything on the page reads it
  addVar(project, 'events', 'list', MOMENTS.map((m) => ({ ...m, image: '' })));
  const current = addVar(project, 'current', 'number', 0);
  addVar(project, 'total', 'number', N, { formula: 'events.length', live: true });

  //The line is a progress layer: it fills to the chosen event's dot
  const line = progressBar(ctx, 'Timeline line', ROW.x + MARK_W / 2, LINE_Y - 3, ROW.w - MARK_W, { value: 0, max: 100, decorative: true, height: 6 });
  Object.assign(line, { bindings: { value: 'current > 0 ? current - 1 : 0', max: 'total - 1' }, originX: 0, originY: 0.5, barFill: solid(L.text) });
  page.children.push(line);

  //One marker (a dot, its date and a short caption), repeated for every event and spread along the line
  const dot = createNode('button', {
    name: 'Event dot',
    label: '',
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    cornerRadius: 16,
    fill: solid(L.background),
    stroke: stroke(L.text, 3),
    color: L.text,
    bindings: {
      ariaLabel: 'item.date + ": " + item.short',
      'fill.color': `current == index + 1 ? ${lit(L.text)} : ${lit(L.background)}`,
      scaleX: 'current == index + 1 ? 1.3 : 1',
      scaleY: 'current == index + 1 ? 1.3 : 1',
      ariaCurrent: 'current == index + 1 ? "step" : false',
    },
  } as never);
  const date = fill(text(ctx, 'Event date', '{item.date}', 0, 0, 100, { fontSize: 20, fontWeight: 700, align: 'center', decorative: true }));
  const short = fill(text(ctx, 'Event caption', '{item.short}', 0, 0, 100, { fontSize: 13, align: 'center', color: L.muted, decorative: true }));
  const marker = stack('Event marker', 0, 0, MARK_W, { gap: 6, align: 'center', children: [dot, date, short] });
  const markers = createNode('frame', {
    name: 'Event markers',
    x: ROW.x,
    y: ROW.y,
    width: ROW.w,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Events',
    layout: { direction: 'row', gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, justify: 'space-between', align: 'start', wrap: false, hugWidth: false, hugHeight: true },
    repeat: { items: 'events', layout: 'none', gap: 0, columns: 1 },
    children: [marker],
  } as never) as FrameNode;
  page.children.push(markers);

  //The detail card: one panel that reads the chosen event
  const cardY = 266;
  const card = createNode('frame', { name: 'Detail card', x: box.x, y: cardY, width: box.width, height: 240, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false } as never) as FrameNode;
  const idle = bind(text(ctx, 'Nothing chosen', 'Choose an event on the timeline, or press Next, to read about it.', 40, 96, box.width - 80, { fontSize: 20, align: 'center', color: L.muted }), { visible: 'current == 0' });
  const pic = createNode('frame', {
    name: 'Event picture',
    x: 0,
    y: 0,
    width: 260,
    height: 208,
    cornerRadius: 16,
    fill: solid(L.surfaceMuted),
    stroke: null,
    clip: true,
    ariaLabel: 'Picture placeholder: replace with your own image',
    children: [createNode('image', { name: 'Event image', x: 0, y: 0, width: 260, height: 208, assetId: null, fit: 'cover', cornerRadius: 0, decorative: true, bindings: { assetId: 'events[current - 1]?.image', visible: '!!events[current - 1]?.image' } } as never)],
  } as never);
  const words = stack('Detail words', 284, 0, 584, {
    gap: 10,
    children: [
      fill(text(ctx, 'Detail date', '{events[current - 1]?.date}', 0, 0, 100, { fontSize: 34, fontWeight: 700 })),
      fill(heading(ctx, 'Detail heading', '{events[current - 1]?.title}', 0, 0, 100, { fontSize: 24 })),
      fill(text(ctx, 'Detail text', '{events[current - 1]?.body}', 0, 0, 100, { fontSize: 18, lineHeight: 1.45 })),
    ],
  });
  const details = createNode('frame', {
    name: 'Event details',
    x: 20,
    y: 16,
    width: box.width - 40,
    height: 208,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    bindings: { visible: 'current > 0', ariaLabel: '"Event " + current + " of " + total + ": " + events[current - 1]?.title' },
    children: [pic, words],
  } as never);
  card.children.push(idle, details);
  page.children.push(card);

  //Previous and Next walk along (the left and right arrow keys do too, as their shortcuts)
  const prev = bind(button(ctx, 'Previous button', 'Previous', box.x, 524, 160, false), { disabled: 'current <= 1' });
  const next = bind(button(ctx, 'Next button', 'Next', box.x + 176, 524, 160), { disabled: 'current >= total' });
  Object.assign(prev, { shortcut: 'ArrowLeft' });
  Object.assign(next, { shortcut: 'ArrowRight' });
  const counter = bind(text(ctx, 'Event counter', 'Event {current} of {total}', box.x + 360, 536, 300, { fontSize: 16, color: L.muted }), { visible: 'current > 0' });
  page.children.push(prev, next, counter);

  //Choosing an event: a click on a marker, or tabbing onto its dot, picks the copy it is (one flow for every event)
  const g = graph(page);
  const pick = g.event('event.pointer', { target: markers.id, type: 'click', childrenOnly: true }, 'Choose an event');
  g.run(pick, setVar(current, 'event.childIndex + 1'));
  const focused = g.event('event.focus', { target: markers.id, type: 'focus', childrenOnly: true }, 'Choose an event');
  g.run(focused, setVar(current, 'event.childIndex + 1'));
  g.run(click(g, next, 'Walk the events'), setVar(current, 'Math.min(total, current + 1)'));
  g.run(click(g, prev, 'Walk the events'), setVar(current, 'Math.max(1, current - 1)'));
  g.run(g.event('event.variable', { variable: current.id }, 'Say which one'), announce('current > 0 ? "Event " + current + " of " + total + ": " + events[current - 1]?.title : ""'));
  //Opening the page again starts from nothing chosen
  g.run(g.event('event.start', {}, 'Start over'), resetVars(current));

  //The intro: the line is drawn from the left, then the markers come in
  const key = (t: number, value: number): Keyframe => ({ id: uid('k'), t, value, ease: 'easeOut' });
  const track = (n: SceneNode, prop: string, keys: Keyframe[]): Track => ({ id: uid('tr'), nodeId: n.id, prop, keys });
  markers.opacity = 0;
  const tracks: Track[] = [track(line, 'scaleX', [key(0, 0), key(1000, 1)]), track(markers, 'opacity', [key(700, 0), key(1300, 1)])];
  const intro: Timeline = { id: uid('tl'), name: 'Intro', duration: 1300, loop: 'once', autoplay: true, speed: 1, tracks, markers: [] };
  page.timelines.push(intro);

  goNextOn(hero, start, 'Navigation');

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Repeater** The markers are one layer repeated over the `events` list, spread along the line. Add an event by adding a row to the list. One click flow serves every dot (`event.childIndex`).', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Live variable** `total` is `events.length`, so the counter, Next and the line all follow the list. The line is a Progress layer.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Write your events in the `events` list (Variables tab): a date, a short caption, a heading, the text and, for a picture, an image asset id. Seven fit along the line.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Write your events: the "events" list variable (Variables tab) has a date, a short caption, a heading and the text for each, in order. The markers, the detail card and the counter all follow it', markers, page),
    item('To give an event a picture, upload the image and put its asset id in that entry\'s "image" (the grey box shows until you do), and say what it shows in the picture\'s Text alternative', pic, page),
    item('Keep to about seven events so the captions fit under the line. For more, make the markers narrower (Event marker width) and check them in the Preview', marker, page),
    item('Retime the intro on the "Intro" timeline (Timeline tab). Viewers who ask for less motion see the finished line at once', undefined, page),
    item('Try it with the keyboard: Tab to a dot, Enter to open it, then the left and right arrow keys', dot, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  return { project, checklist };
}
