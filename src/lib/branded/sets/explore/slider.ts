/** Image slider: a carousel of five slides, each a picture and a caption, with Previous/Next, dots, arrow keys and optional autoplay. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { Flow, announce, heroButtons, ifNode, n, onClick, onKey, setVar, variable } from './helpers';

const SLIDES = [
  { title: 'Choose a topic', body: 'Start with something you can say in a sentence. A narrow, clear question is easier to research than a broad subject.' },
  { title: 'Find sources', body: 'Search the library for books and journal articles. Note where each idea came from as you go, so you can cite it later.' },
  { title: 'Read and take notes', body: 'Read with your question in mind. Write the main points in your own words and keep a short note of the page or link.' },
  { title: 'Draft your work', body: 'Write a first version without worrying about polish. Put your own argument first and use sources to support it.' },
  { title: 'Review and reference', body: 'Check your draft against the task, fix the wording, and make sure every source you used is cited and in your reference list.' },
];

const SLIDE_W = 928;
const SLIDE_H = 392;
const DOT = 28;

export const imageSlider: BrandedStarter = {
  key: 'explore/image-slider',
  set: 'explore',
  name: 'Image slider',
  description: 'A carousel of five slides, each a picture and a caption, with Previous and Next buttons, a dot for every slide, left and right arrow keys, and optional autoplay that waits for people who ask for less motion and stops when someone steps through by hand.',
  tags: ['carousel', 'pictures', 'keyboard friendly', 'autoplay'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Image slider');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'The research process', { kind: 'hero', subtitle: 'Five steps from a question to a finished piece of work.' });
    const page = brandedPage(ctx, 'The research process', { footer: 'Study skills' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: page }]);

    const slide = variable(ctx, 'slide', 'number', 1);
    const playing = variable(ctx, 'playing', 'boolean', false);
    variable(ctx, 'total', 'number', SLIDES.length);

    const box = contentBox(page);
    const frames: SceneNode[] = [];
    const captions: SceneNode[] = [];
    const pics: SceneNode[] = [];
    SLIDES.forEach((s, i) => {
      const pic = picture(ctx, `Slide ${i + 1} picture`, 0, 0, SLIDE_W, 288);
      const hint = text(ctx, `Slide ${i + 1} picture hint`, 'Replace with your picture', 0, 128, SLIDE_W, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
      const h = heading(ctx, `Slide ${i + 1} caption heading`, s.title, 0, 304, SLIDE_W, { fontSize: 22 });
      const c = text(ctx, `Slide ${i + 1} caption`, s.body, 0, 340, SLIDE_W, { fontSize: 17, lineHeight: 1.4 });
      const f = createNode('frame', {
        name: `Slide ${i + 1}`,
        x: box.x,
        y: box.y,
        width: SLIDE_W,
        height: SLIDE_H,
        fill: null,
        stroke: null,
        clip: false,
        role: 'region',
        ariaLabel: `Slide ${i + 1} of ${SLIDES.length}`,
        bindings: { visible: `slide == ${i + 1}` },
        children: [pic, hint, h, c],
      } as never);
      frames.push(f);
      captions.push(c);
      pics.push(pic);
      page.children.push(f);
    });

    //Controls: Previous, the dots, Play/Pause, Next
    const cy = box.y + SLIDE_H + 12;
    const prev = button(ctx, 'Previous', 'Previous', box.x, cy, 140, false);
    const next = button(ctx, 'Next', 'Next', box.x + box.width - 140, cy, 140, true);
    const play = button(ctx, 'Play or pause', 'Play slides', box.x + box.width - 140 - 16 - 160, cy, 160, false);
    Object.assign(play, { bindings: { label: 'playing ? "Pause" : "Play slides"' } });
    //the dots sit centred in the gap between Previous and Play
    const dotsW = SLIDES.length * DOT + (SLIDES.length - 1) * 8;
    const dotsX = (box.x + 140 + play.x - dotsW) / 2;
    const dots: SceneNode[] = SLIDES.map((_, i) => {
      const ring = createNode('ellipse', { name: `Dot ${i + 1} ring`, x: 6, y: 6, width: 16, height: 16, fill: null, stroke: stroke(L.button, 2), decorative: true } as never);
      const dotFill = createNode('ellipse', { name: `Dot ${i + 1} fill`, x: 9, y: 9, width: 10, height: 10, fill: solid(L.button), stroke: null, decorative: true, bindings: { visible: `slide == ${i + 1}` } } as never);
      return createNode('frame', {
        name: `Dot ${i + 1}`,
        x: dotsX + i * (DOT + 8),
        y: cy + 9,
        width: DOT,
        height: DOT,
        fill: null,
        stroke: null,
        clip: false,
        role: 'button',
        ariaLabel: `Go to slide ${i + 1}`,
        bindings: { ariaDescription: `slide == ${i + 1} ? "Current slide" : ""` },
        children: [ring, dotFill],
      } as never);
    });
    page.children.push(prev, ...dots, play, next);

    //Stepping by hand also stops autoplay. Autoplay never runs when the device asks for less motion
    const said = announce('"Slide " + slide + " of " + total');
    const flow = new Flow(page);
    flow.join([onClick(next, 'Step'), onKey('ArrowRight', undefined, 'Step')], [setVar(playing, 'false'), setVar(slide, 'slide >= total ? 1 : slide + 1'), said]);
    const said2 = announce('"Slide " + slide + " of " + total');
    flow.join([onClick(prev, 'Step'), onKey('ArrowLeft', undefined, 'Step')], [setVar(playing, 'false'), setVar(slide, 'slide <= 1 ? total : slide - 1'), said2]);
    dots.forEach((d, i) => flow.chain(onClick(d, 'Dots'), setVar(playing, 'false'), setVar(slide, String(i + 1)), announce('"Slide " + slide + " of " + total')));
    flow.chain(onClick(play, 'Autoplay'), setVar(playing, '!playing'));
    flow.gate([n('event.timer', { ms: 5000, repeat: true }, 'Autoplay')], ifNode('playing && !reducedMotion'), [setVar(slide, 'slide >= total ? 1 : slide + 1')]);

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace each grey picture with your own, and give it a text alternative that says what it shows', pics[0], page),
      item('Write the heading and caption of each slide', captions[0], page),
      item('To start with the slides playing, set the variable "playing" to true (Variables panel). Autoplay waits for people who ask their device for less motion, and any Previous, Next or dot stops it', undefined, page),
      item('Change the time between slides: the "On timer" node in the Interactions tab (5000 ms)', undefined, page),
      item('To add a slide: duplicate a slide and a dot, bind them to the next number, raise the "total" variable and copy the dot\'s click flow', frames[0], page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
