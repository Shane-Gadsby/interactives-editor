/** Image slider: a carousel of five slides written once in a list, each a picture and a caption, with Previous/Next, dots, arrow keys and optional autoplay. */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, navBarY, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { addVar, announce, bind, click, graph, graphNote, set, toggleVar } from '../../graph-kit';
import { heroButtons } from './helpers';

//Each slide: its words, an image (an asset id once you have uploaded one, the grey box shows until then) and what the picture shows
const SLIDES = [
  { title: 'Choose a topic', body: 'Start with something you can say in a sentence. A narrow, clear question is easier to research than a broad subject.' },
  { title: 'Find sources', body: 'Search the library for books and journal articles. Note where each idea came from as you go, so you can cite it later.' },
  { title: 'Read and take notes', body: 'Read with your question in mind. Write the main points in your own words and keep a short note of the page or link.' },
  { title: 'Draft your work', body: 'Write a first version without worrying about polish. Put your own argument first and use sources to support it.' },
  { title: 'Review and reference', body: 'Check your draft against the task, fix the wording, and make sure every source you used is cited and in your reference list.' },
].map((s, i) => ({ ...s, image: '', alt: `Picture placeholder for slide ${i + 1}: replace with your own image and describe it here` }));

const SLIDE_W = 928;
const SLIDE_H = 392;
const DOT = 28;

export const imageSlider: BrandedStarter = {
  key: 'explore/image-slider',
  set: 'explore',
  name: 'Image slider',
  description: 'A carousel of five slides written once in a list, each a picture and a caption, with Previous and Next buttons, a dot for every slide, left and right arrow keys, and optional autoplay that waits for people who ask for less motion and stops when someone steps through by hand.',
  tags: ['carousel', 'pictures', 'keyboard friendly', 'autoplay'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Image slider');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'The research process', { kind: 'hero', subtitle: 'Five steps from a question to a finished piece of work.' });
    const page = brandedPage(ctx, 'The research process', { footer: 'Study skills  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next' }]);

    addVar(project, 'slides', 'list', SLIDES);
    const slide = addVar(project, 'slide', 'number', 1);
    const playing = addVar(project, 'playing', 'boolean', false);

    const box = contentBox(page);

    //One slide, drawn for the slide that is showing: the list is cut down to that one entry, so the picture, heading and caption are written once
    const pic = picture(ctx, 'Slide picture', 0, 0, SLIDE_W, 288);
    Object.assign(pic, { role: 'image', bindings: { ariaLabel: 'item.alt' } });
    const hint = text(ctx, 'Slide picture hint', 'Replace with your picture', 0, 128, SLIDE_W, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
    const image = createNode('image', { name: 'Slide image', x: 0, y: 0, width: SLIDE_W, height: 288, assetId: null, fit: 'cover', cornerRadius: 16, decorative: true, bindings: { assetId: 'item.image' } } as never);
    const h = heading(ctx, 'Slide caption heading', '{item.title}', 0, 304, SLIDE_W, { fontSize: 22 });
    const caption = text(ctx, 'Slide caption', '{item.body}', 0, 340, SLIDE_W, { fontSize: 17, lineHeight: 1.4 });
    const frame = createNode('frame', {
      name: 'Slide',
      x: 0,
      y: 0,
      width: SLIDE_W,
      height: SLIDE_H,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      bindings: { ariaLabel: '"Slide " + slide + " of " + slides.length' },
      children: [pic, hint, image, h, caption],
    } as never);
    const slidesFrame = createNode('frame', {
      name: 'Slides',
      x: box.x,
      y: box.y,
      width: SLIDE_W,
      height: SLIDE_H,
      fill: null,
      stroke: null,
      clip: false,
      repeat: { items: 'slides.slice(slide - 1, slide)', layout: 'none', gap: 0, columns: 1 },
      children: [frame],
    } as never);
    page.children.push(slidesFrame);

    //Controls: Previous, the dots, Play/Pause, Next
    const cy = navBarY(page);
    const prev = button(ctx, 'Previous', 'Previous', box.x, cy, 140, false);
    const next = button(ctx, 'Next', 'Next', box.x + box.width - 140, cy, 140, true);
    //The arrow keys press them from anywhere on the page
    Object.assign(prev, { shortcut: 'ArrowLeft' });
    Object.assign(next, { shortcut: 'ArrowRight' });
    const play = bind(button(ctx, 'Play or pause', 'Play slides', box.x + box.width - 140 - 16 - 160, cy, 160, false), { label: 'playing ? "Pause" : "Play slides"', ariaPressed: 'playing' });
    //the dots sit centred in the gap between Previous and Play
    const dotsW = SLIDES.length * DOT + (SLIDES.length - 1) * 8;
    const dotsX = (box.x + 140 + play.x - dotsW) / 2;
    const ring = createNode('ellipse', { name: 'Dot ring', x: 6, y: 6, width: 16, height: 16, fill: null, stroke: stroke(L.primary, 2), decorative: true } as never);
    const dotFill = createNode('ellipse', { name: 'Dot fill', x: 9, y: 9, width: 10, height: 10, fill: solid(L.button), stroke: null, decorative: true, bindings: { visible: 'slide == index + 1' } } as never);
    const dot = createNode('frame', {
      name: 'Dot',
      x: 0,
      y: 0,
      width: DOT,
      height: DOT,
      fill: null,
      stroke: null,
      clip: false,
      role: 'button',
      bindings: { ariaLabel: '"Go to slide " + (index + 1)', ariaCurrent: 'slide == index + 1' },
      children: [ring, dotFill],
    } as never);
    const dots = createNode('frame', { name: 'Dots', x: dotsX, y: cy + 9, width: dotsW, height: DOT, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Slides', repeat: { items: 'slides', layout: 'horizontal', gap: 8, columns: 1 }, children: [dot] } as never);
    page.children.push(prev, dots, play, next);

    //Stepping by hand also stops autoplay. Autoplay never runs when the device asks for less motion. The slide is said once, off the variable
    const wrapNext = 'slide >= slides.length ? 1 : slide + 1';
    const wrapPrev = 'slide <= 1 ? slides.length : slide - 1';
    {
      const g = graph(page);
      const nextClick = click(g, next, 'Step');
      graphNote(page, { anchor: nextClick, colour: 'sky', text: '**Moving by hand stops the autoplay first.** Next, Previous and the dots all set `playing` to false, then move `slide`, which wraps round at either end.' });
      g.run(nextClick, set(playing, 'false'), set(slide, wrapNext));
      g.run(click(g, prev, 'Step'), set(playing, 'false'), set(slide, wrapPrev));
      g.run(click(g, dot, 'Dots'), set(playing, 'false'), set(slide, 'event.index + 1'));
      g.run(click(g, play, 'Autoplay'), toggleVar(playing));
      const tick = g.event('event.timer', { ms: 5000, repeat: true, while: 'playing && !reducedMotion', steady: true }, 'Autoplay');
      graphNote(page, { anchor: tick, colour: 'sky', text: '**The timer runs only `while` `playing && !reducedMotion`,** so it never starts for someone who has asked for less movement. The Play button just flips `playing`. [ ] Change the 5000 ms for a slower or faster show.' });
      g.run(tick, set(slide, wrapNext));
      const said = g.event('event.variable', { variable: slide.id }, 'Say the slide');
      graphNote(page, { anchor: said, colour: 'sky', text: '**One announcement for every way of moving.** Variable changed fires on `slide` whether a button, a dot or the timer moved it.' });
      g.run(said, announce('"Slide " + slide + " of " + slides.length'));
    }

    const below = (x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(page, { ...below(0), colour: 'sky', text: '**One slide** The list is cut to the slide showing (`slides.slice(slide - 1, slide)`), so the picture, heading and caption are written once. The dots are one layer repeated, and `event.index` says which was pressed.' });
    addNote(page, { ...below(316), colour: 'sky', text: '**Shortcuts** Previous and Next carry the keys ArrowLeft and ArrowRight, and the dots say which is current with `ariaCurrent`. Autoplay is a steady timer that only runs while `playing`.' });
    addNote(page, { ...below(632), colour: 'gold', text: '[ ] Write the slides in `slides` and put each picture\'s asset id in `image`. Describe it in `alt`.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write each slide: the "slides" list variable (Variables panel) has a heading, a caption, an image and a text alternative for each. The slide and the dots follow it', caption, page),
      item('Give a slide its picture: upload the image and put its asset id in that entry\'s "image" (the grey box shows until you do), and say what it shows in "alt"', pic, page),
      item('To start with the slides playing, set the variable "playing" to true (Variables panel). Autoplay waits for people who ask their device for less motion, and any Previous, Next or dot stops it', undefined, page),
      item('Change the time between slides: the "On timer" node in the Interactions tab (5000 ms)', undefined, page),
      item('To add a slide, add an entry to "slides". The dots follow; for more than about eight, check they still fit between Previous and Play', slidesFrame, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
