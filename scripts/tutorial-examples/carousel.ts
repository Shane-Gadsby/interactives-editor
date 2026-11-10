//The carousel tutorial's finished project: one slide drawn from a list by a number variable, Previous, Next, dots, arrow keys and an autoplay that pauses
import { createNode, type Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, change, clickFlow, eventFlow, solid, text, variable, whenClicked } from './_content-helpers';

const SLIDES = [
  { title: 'Choose a topic', body: 'Start with a question you can say in one sentence.', colour: '#cfe8f7' },
  { title: 'Find sources', body: 'Search the library and note where each idea came from.', colour: '#d7ecd0' },
  { title: 'Take notes', body: 'Write the main points in your own words, with the page number.', colour: '#fbe7c6' },
  { title: 'Draft and review', body: 'Write a first version, then check it against the task and the criteria.', colour: '#e6dcf5' },
];

const NEXT = 'slide >= slides.length ? 1 : slide + 1';
const PREVIOUS = 'slide <= 1 ? slides.length : slide - 1';

function build(): Project {
  const p = blankProject('Research steps');
  const ab = p.artboards[0];
  variable(p, 'slides', 'list', SLIDES);
  const slide = variable(p, 'slide', 'number', 1);
  const playing = variable(p, 'playing', 'boolean', false);

  //The slide: a coloured panel standing in for a picture, the heading and the caption, all read from slides[slide - 1]
  const panel = bind(createNode('rect', { name: 'Slide picture', x: 40, y: 40, width: 720, height: 320, cornerRadius: 16, fill: solid(SLIDES[0].colour), decorative: true } as never), { 'fill.color': 'slides[slide - 1].colour' });
  const counter = text('Slide number', 'Slide {slide} of {slides.length}', 64, 64, 300, { fontSize: 16, fontWeight: 600, color: C.ink });
  const heading = text('Slide heading', '{slides[slide - 1].title}', 40, 384, 720, { fontSize: 26, fontWeight: 700 });
  const caption = text('Slide caption', '{slides[slide - 1].body}', 40, 424, 720, { fontSize: 18, lineHeight: 1.4 });
  ab.children.push(panel, counter, heading, caption);

  //The controls along the bottom
  const prev = createNode('button', { name: 'Previous', label: 'Previous', x: 40, y: 520, width: 130, height: 44, shortcut: 'ArrowLeft' } as never);
  const next = createNode('button', { name: 'Next', label: 'Next', x: 630, y: 520, width: 130, height: 44, shortcut: 'ArrowRight' } as never);
  const play = bind(createNode('button', { name: 'Play', label: 'Play', x: 480, y: 520, width: 130, height: 44 }), { label: 'playing ? "Pause" : "Play"', ariaPressed: 'playing' });
  const dot = bind(
    createNode('ellipse', { name: 'Dot', x: 0, y: 0, width: 18, height: 18, fill: solid(C.navy), stroke: null, role: 'button' } as never),
    { 'fill.color': `slide == index + 1 ? "${C.navy}" : "${C.grey}"`, ariaCurrent: 'slide == index + 1', ariaLabel: '"Go to slide " + (index + 1)' },
  );
  const dots = createNode('group', { name: 'Dots', x: 260, y: 533, width: 18, height: 18, repeat: { items: 'slides', layout: 'horizontal', gap: 14, columns: 1 }, children: [dot] } as never);
  ab.children.push(prev, dots, play, next);

  clickFlow(ab, next, [change(playing, 'false'), change(slide, NEXT)]);
  clickFlow(ab, prev, [change(playing, 'false'), change(slide, PREVIOUS)]);
  clickFlow(ab, dot, [change(playing, 'false'), change(slide, 'event.index + 1')]);
  whenClicked(ab, play, 'switch', playing);
  eventFlow(ab, 'event.timer', { ms: '4000', repeat: true, while: 'playing && !reducedMotion' }, [change(slide, NEXT)]);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-carousel',
  topic: 'tutorial-carousel',
  title: 'Image slider (carousel)',
  description: 'Four slides drawn from a list by one number, with Previous, Next, a dot for each slide, the arrow keys and an autoplay that pauses: the carousel tutorial\'s project.',
  tags: ['carousel', 'slider', 'timer', 'keyboard friendly'],
  build,
  notes: [
    { text: '**slide is the whole state.** The picture, the heading and the caption read slides[slide - 1], so Next only has to change one number. Coloured panels stand in for pictures.' },
    { text: '**The timer runs only while playing and not reducedMotion,** so it never starts for someone who asked for less movement. Previous, Next and the dots set playing to false first.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 0, text: '**Next, Previous and the dots each stop the autoplay, then move slide.** Next and Previous wrap round at the ends. The arrow keys are the Shortcut of each button, so they need no nodes.' },
    { at: 11, text: '**When a timer goes off every 4000 ms,** but Only while playing and not reducedMotion. Play flips playing on and off, and its label and Pressed state follow it.', colour: 'sky' },
  ],
};
