//The Flip cards tutorial's finished project: one card layer repeated over a list, flipped by a click or Enter, and Turn all back
import { createNode, type Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, clickFlow, change, line, solid, text, variable } from './_content-helpers';

const CARDS = [
  { front: 'Plagiarism', back: "Presenting someone else's words or ideas as your own." },
  { front: 'Paraphrase', back: 'Putting an idea in your own words. You still cite the source.' },
  { front: 'Citation', back: 'A short note in your text that points to the full reference.' },
  { front: 'Reference list', back: 'The full details of every source you cited, at the end.' },
  { front: 'Collusion', back: 'Working with others on work that must be your own.' },
  { front: 'Common knowledge', back: 'Facts that are widely known and easy to check.' },
];

const W = 220;
const H = 150;
const isUp = 'flipped.includes(index)';

function build(): Project {
  const p = blankProject('Key terms');
  const ab = p.artboards[0];
  ab.children.push(
    text('Title', 'Key terms', 40, 28, 520, { fontSize: 28, fontWeight: 700 }),
    text('Hint', 'Select a card, or press Enter on it, to turn it over.', 40, 72, 600, { fontSize: 16, color: C.muted }),
  );

  variable(p, 'cards', 'list', CARDS);
  const flipped = variable(p, 'flipped', 'list', []);

  const front = bind(text('Card front', '{item.front}', 16, 16, W - 32, { fontSize: 22, fontWeight: 700, color: C.white, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: H - 32 }), { visible: `!${isUp}` });
  const back = bind(text('Card back', '{item.back}', 16, 16, W - 32, { fontSize: 16, lineHeight: 1.35, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: H - 32 }), { visible: isUp });
  const card = bind(
    createNode('frame', {
      name: 'Card',
      x: 0,
      y: 0,
      width: W,
      height: H,
      cornerRadius: 16,
      fill: solid(C.navy),
      stroke: line(C.navy, 2),
      role: 'button',
      ariaDescription: 'Press Enter to turn the card over',
      children: [front, back],
    } as never),
    { 'fill.color': `${isUp} ? "${C.white}" : "${C.navy}"`, ariaPressed: isUp },
  );
  //Ctrl+G on the card makes the group the repeater; its first child is the card
  const cards = createNode('group', { name: 'Cards', x: 40, y: 110, width: W, height: H, repeat: { items: 'cards', layout: 'grid', gap: 20, columns: 3 }, children: [card] } as never);
  const reset = createNode('button', { name: 'Turn all back', label: 'Turn all back', x: 40, y: 470, width: 180, height: 44 });
  ab.children.push(cards, reset);

  clickFlow(ab, card, [change(flipped, 'event.index', 'toggleItem')]);
  clickFlow(ab, reset, [{ kind: 'action.resetVariables', params: { variables: [flipped.id] } }]);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-flipcards',
  topic: 'tutorial-flipcards',
  title: 'Flip cards from a list',
  description: 'Six term and meaning cards drawn by one repeated card over a list, each turned over by a click or Enter: the Flip cards tutorial\'s project.',
  tags: ['cards', 'repeater', 'list', 'keyboard friendly'],
  build,
  notes: [
    { text: '**One card, drawn six times.** The Cards group repeats its first child for each item of the cards list (Variables tab). Add an item there and a seventh card appears.' },
    { text: '**flipped is a list of the cards turned over.** A click adds the card\'s place (event.index) or takes it out, and each face is Visible only when that fits.', colour: 'sky' },
  ],
};
