/** Interactive timeline: seven events on a line, a detail panel for the chosen one, Previous and Next, and an intro that draws the line. */
import { createNode, uid, type Keyframe, type SceneNode, type TemplateChecklistItem, type Timeline, type Track } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, picture, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, goButton, heroPage, join, lit, put, seq } from './shared';

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
const LINE = { x: 80, w: 864, y: 147 };
//Dot centres run from near the left end of the line to near the right end
const centre = (i: number) => 100 + i * (824 / (N - 1));

export function interactiveTimeline(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Interactive timeline');
  const { L, project } = ctx;
  //Viewers who ask for less motion see the finished line straight away
  project.settings.reducedMotion = true;
  const { page: hero, start } = heroPage(ctx, 'Space exploration timeline', 'Choose an event on the timeline to read about it, or step through them one at a time.');
  const page = brandedPage(ctx, 'Milestones of space exploration', { name: 'Timeline', footer: 'Choose an event' });
  const box = contentBox(page);

  const current = addVar(project, 'current', 'number', 0);

  //The line, the part of it the chosen event has reached, and the dots with their dates
  const line = createNode('rect', { name: 'Timeline line', x: LINE.x, y: LINE.y, width: LINE.w, height: 6, cornerRadius: 3, fill: solid(L.surfaceMuted), originX: 0, originY: 0.5 });
  const reached = createNode('rect', {
    name: 'Timeline progress',
    x: LINE.x,
    y: LINE.y,
    width: 0,
    height: 6,
    cornerRadius: 3,
    fill: solid(L.text),
    decorative: true,
    bindings: { width: `current == 0 ? 0 : ${(100 - LINE.x).toFixed(0)} + (current - 1) * ${(824 / (N - 1)).toFixed(2)}` },
  });
  page.children.push(line, reached);
  const dots: SceneNode[] = [];
  const dates: SceneNode[] = [];
  const shorts: SceneNode[] = [];
  MOMENTS.forEach((m, i) => {
    const on = `current == ${i + 1}`;
    dots.push(
      createNode('button', {
        name: `Event ${i + 1} dot`,
        label: '',
        ariaLabel: `${m.date}: ${m.short}`,
        x: centre(i) - 16,
        y: LINE.y + 3 - 16,
        width: 32,
        height: 32,
        cornerRadius: 16,
        fill: solid(L.background),
        stroke: stroke(L.text, 3),
        color: L.text,
        bindings: {
          'fill.color': `${on} ? ${lit(L.text)} : ${lit(L.background)}`,
          scaleX: `${on} ? 1.3 : 1`,
          scaleY: `${on} ? 1.3 : 1`,
          ariaDescription: `${on} ? "Showing" : ""`,
        },
      })
    );
    dates.push(text(ctx, `Event ${i + 1} date`, m.date, centre(i) - 60, LINE.y + 32, 120, { fontSize: 20, fontWeight: 700, align: 'center', color: L.text, decorative: true }));
    shorts.push(text(ctx, `Event ${i + 1} caption`, m.short, centre(i) - 62, LINE.y + 58, 124, { fontSize: 13, align: 'center', color: L.muted, decorative: true }));
  });
  page.children.push(...dots, ...dates, ...shorts);

  //The detail panel: one card, a panel for each event on top of it, shown by which event is chosen
  const panelCard = card(ctx, 'Detail card', box.x, 266, box.width, 240);
  page.children.push(panelCard);
  const idle = text(ctx, 'Nothing chosen', 'Choose an event on the timeline, or press Next, to read about it.', box.x + 40, 266 + 96, box.width - 80, { fontSize: 20, align: 'center', color: L.muted, bindings: { visible: 'current == 0' } });
  page.children.push(idle);
  const panels = MOMENTS.map((m, i) =>
    createNode('frame', {
      name: `Event ${i + 1} details`,
      x: box.x + 20,
      y: 266 + 16,
      width: box.width - 40,
      height: 208,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      ariaLabel: `Event ${i + 1} details`,
      visible: false,
      bindings: { visible: `current == ${i + 1}` },
      children: [
        picture(ctx, 'Event picture', 0, 0, 260, 208),
        text(ctx, 'Event date', m.date, 284, 0, 560, { fontSize: 34, fontWeight: 700 }),
        heading(ctx, 'Event heading', m.title, 284, 52, 584, { fontSize: 24 }),
        text(ctx, 'Event text', m.body, 284, 98, 584, { fontSize: 18, lineHeight: 1.45 }),
      ],
    })
  );
  page.children.push(...panels);

  const prev = button(ctx, 'Previous button', 'Previous', box.x, 524, 160, false);
  prev.bindings = { disabled: 'current <= 1' };
  const next = button(ctx, 'Next button', 'Next', box.x + 176, 524, 160);
  next.bindings = { disabled: `current >= ${N}` };
  const counter = text(ctx, 'Event counter', `Event {current} of ${N}`, box.x + 360, 536, 300, { fontSize: 16, color: L.muted, bindings: { visible: 'current > 0' } });
  page.children.push(prev, next, counter);

  //Choosing an event: a click or tabbing onto its dot opens it. Previous and Next walk along.
  dots.forEach((d, i) => {
    const set = put(page, 'action.setVariable', 560, i * 90, { variable: current.id, op: 'set', value: String(i + 1) }, i === 0 ? 'Choose an event' : undefined);
    join(page, put(page, 'event.pointer', 0, i * 90, { target: d.id, type: 'click' }), set);
    join(page, put(page, 'event.focus', 280, i * 90, { target: d.id, type: 'focus' }), set);
  });
  seq(page, N * 90 + 40, ['event.pointer', { target: next.id, type: 'click' }, 'Walk the events'], ['action.setVariable', { variable: current.id, op: 'add', value: '1' }]);
  seq(page, N * 90 + 150, ['event.pointer', { target: prev.id, type: 'click' }], ['action.setVariable', { variable: current.id, op: 'add', value: '-1' }]);
  seq(page, N * 90 + 260, ['event.variable', { variable: current.id }, 'Say which one'], ['action.announce', { text: `current > 0 ? "Event " + current + " of ${N}" : ""` }]);
  //Opening the page again starts from nothing chosen
  seq(page, N * 90 + 370, ['event.start', {}, 'Start over'], ['action.setVariable', { variable: current.id, op: 'set', value: '0' }]);

  //The intro: the line is drawn from the left, then the dots and their dates come in one after another
  const key = (t: number, value: number): Keyframe => ({ id: uid('k'), t, value, ease: 'easeOut' });
  const track = (n: SceneNode, prop: string, keys: Keyframe[]): Track => ({ id: uid('tr'), nodeId: n.id, prop, keys });
  const at = (i: number) => 700 + i * 170;
  const tracks: Track[] = [track(line, 'scaleX', [key(0, 0), key(1000, 1)])];
  for (let i = 0; i < N; i++) {
    for (const n of [dots[i], dates[i], shorts[i]]) {
      n.opacity = 0;
      tracks.push(track(n, 'opacity', [key(at(i), 0), key(at(i) + 300, 1)]));
    }
  }
  const intro: Timeline = { id: uid('tl'), name: 'Intro', duration: at(N - 1) + 300, loop: 'once', autoplay: true, speed: 1, tracks, markers: [] };
  page.timelines.push(intro);

  goButton(hero, start, page, 0);

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Type each date and its short caption under the line (Event 1 date, Event 1 caption and so on)', dates[0], page),
    item('Write each event\'s details: the date, heading and text in "Event 1 details" and the others. Swap the grey box in each for a picture', panels[0], page),
    item('Give each dot a Text alternative that says its date and event, so screen readers hear it (Accessibility)', dots[0], page),
    item('To add an event: duplicate a dot, its date, caption and details, then point the copies at the next number: the "current ==" visible rule, the click and focus interactions, and the "of 7" in the counter and the Next rule', counter, page),
    item('Retime the intro on the "Intro" timeline (Timeline tab). Viewers who ask for less motion see the finished line at once', undefined, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  return { project, checklist };
}
