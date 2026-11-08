//Guess the answer: a picture and a question on a card, the learner thinks, then turns the card to see the answer, across a set of five.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, gradient, item, picture, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { stack } from '../../parts';
import { Graph, addVar, announce, bind, darkButton, emit, focus, go, goNext, heroPage, set } from './common';

const CARDS = [
  { q: 'Which planet is known as the Red Planet?', a: 'Mars', note: 'Iron oxide, a kind of rust, in its soil gives it the red colour.' },
  { q: 'Which gas do plants take in from the air to make their food?', a: 'Carbon dioxide', note: 'They use it with water and light in photosynthesis, and give out oxygen.' },
  { q: 'How many millilitres are in one litre?', a: '1000', note: '"Milli" means one thousandth, so a litre is a thousand millilitres.' },
  { q: 'What is the largest ocean on Earth?', a: 'The Pacific Ocean', note: 'It is bigger than all of the land on Earth put together.' },
  { q: 'Which part of a cell holds its genetic material?', a: 'The nucleus', note: 'The DNA in the nucleus holds the instructions the cell works from.' },
];

const CARD_W = 928;
const CARD_H = 330;
const TURN_MS = 160;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Guess the answer');
  const { project, L } = ctx;
  addVar(project, 'cards', 'list', CARDS);
  const card = addVar(project, 'card', 'number', 0);
  const turned = addVar(project, 'turned', 'boolean', false);
  const knew = addVar(project, 'knew', 'number', 0);

  const hero = heroPage(ctx, 'Guess the answer', 'Five questions. Think about each one, then turn the card to check your answer.');
  const page = brandedPage(ctx, 'Think, then turn the card', { footer: 'Guess the answer' });
  const done = brandedPage(ctx, 'That is all five', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The card: a question face and an answer face, which turns over
  const box = contentBox(page);
  const face = (side: 'front' | 'back') => {
    const front = side === 'front';
    const pic = picture(ctx, front ? 'Question picture' : 'Answer picture', 24, 24, 360, CARD_H - 48);
    const label = text(ctx, `${front ? 'Question' : 'Answer'} label`, front ? 'Question {card + 1}' : 'Answer', 416, 30, 480, { fontSize: 16, fontWeight: 700, color: front ? L.muted : L.onGradient, decorative: true });
    const main = text(ctx, front ? 'Question text' : 'Answer text', front ? CARDS[0].q : CARDS[0].a, 416, 66, 480, {
      fontSize: front ? 32 : 40,
      fontWeight: 700,
      lineHeight: 1.25,
      color: front ? L.text : L.onGradient,
      autoSize: 'none',
      height: front ? 160 : 100,
      verticalAlign: front ? 'top' : 'middle',
      bindings: { text: front ? 'cards[card].q' : 'cards[card].a' },
    } as never);
    const sub = front
      ? text(ctx, 'Think prompt', 'Take a moment to think about it. Then turn the card.', 416, 250, 480, { fontSize: 17, color: L.muted, decorative: true })
      : text(ctx, 'Answer note', 'Why', 416, 190, 480, { fontSize: 19, lineHeight: 1.35, color: L.onGradient, autoSize: 'none', height: 110, bindings: { text: 'cards[card].note' } } as never);
    return createNode('frame', {
      name: front ? 'Question face' : 'Answer face',
      x: 0,
      y: 0,
      width: CARD_W,
      height: CARD_H,
      cornerRadius: 20,
      clip: false,
      fill: front ? solid(L.surface) : gradient(ctx, 135),
      stroke: front ? stroke(L.border, 2) : null,
      bindings: { visible: front ? '!turned' : 'turned' },
      children: [pic, label, main, sub],
    } as never);
  };
  const deck = createNode('frame', {
    name: 'Card',
    x: box.x,
    y: box.y,
    width: CARD_W,
    height: CARD_H,
    fill: null,
    stroke: null,
    clip: false,
    role: 'button',
    focusable: true,
    children: [face('front'), face('back')],
    bindings: { ariaLabel: 'turned ? "Answer: " + cards[card].a + ". " + cards[card].note : "Question " + (card + 1) + ": " + cards[card].q + ". Press Enter to turn the card and see the answer."' },
  } as never);
  const by = box.y + CARD_H + 18;
  const reveal = bind(button(ctx, 'Turn the card', 'Turn the card', box.x, by, 220, true), { visible: '!turned' });
  reveal.shortcut = 't';
  //The two ratings are the children of one row, so one flow below serves both (event.childIndex says which was pressed)
  const knewIt = button(ctx, 'I knew it', 'I knew it', 0, 0, 200, true);
  const learning = button(ctx, 'Still learning', 'Still learning', 0, 0, 200, false);
  const rating = bind(stack('Rating buttons', box.x, by, 416, { direction: 'row', gap: 16, children: [knewIt, learning] }), { visible: 'turned' });
  const progress = text(ctx, 'Progress', 'Card {card + 1} of {cards.length}', box.x + box.width - 300, by + 10, 300, { fontSize: 18, fontWeight: 600, align: 'right', color: L.muted });
  page.children.push(deck, reveal, rating, progress);

  const g = new Graph(page);
  const onStart = g.start('Back to the first card');
  g.run(onStart, ['action.resetVariables', { variables: [card, turned, knew].map((v) => v.id) }], ['action.setProperty', { target: deck.id, prop: 'scaleX', value: '1' }], announce('"Card 1 of " + cards.length + ": " + cards[0].q'));

  //Turning: the card squashes edge on, swaps faces, and opens again. The card, its button and the T key all send the same message, held back once it is turned
  const onCard = g.click(deck, 'Turn the card');
  g.run(onCard, emit('turn'));
  const onReveal = g.click(reveal, 'Turn the card');
  g.run(onReveal, emit('turn'));
  const onTurn = g.add('event.message', { name: 'turn', onlyIf: '!turned' }, null, 'out', { note: 'Turn the card over' });
  g.run(
    onTurn,
    ['action.animate', { target: deck.id, prop: 'scaleX', to: '0', duration: TURN_MS, ease: 'easeIn', continue: 'end' }],
    set(turned, 'true'),
    ['action.animate', { target: deck.id, prop: 'scaleX', to: '1', duration: TURN_MS, ease: 'easeOut', continue: 'end' }],
    announce('"Answer: " + cards[card].a + ". " + cards[card].note'),
    focus(knewIt),
  );

  //Rating the guess moves to the next card, or to the end: one flow for both buttons
  const onRate = g.add('event.pointer', { target: rating.id, type: 'click', childrenOnly: true }, null, 'out', { note: 'I knew it / Still learning' });
  const counted = g.add('action.setVariable', { variable: knew.id, op: 'add', value: 'event.childIndex == 0 ? 1 : 0' }, onRate);
  const more = g.add('logic.if', { condition: 'card + 1 < cards.length' }, counted);
  g.runFrom(more, 'true', set(card, 'card + 1'), ['action.resetVariables', { variables: [turned.id] }], ['action.setProperty', { target: deck.id, prop: 'scaleX', value: '1' }], announce('"Card " + (card + 1) + " of " + cards.length + ": " + cards[card].q'), focus(deck));
  g.add('action.artboard', { to: 'next', transition: 'fade', duration: 250 }, more, 'false', { dy: 110 });

  checklist.push(
    item('Write your own five cards: Project > Variables > "cards", a question (q), its answer (a) and a line of why (note) for each. The card, the counter and the finished page follow the list', deck, page),
    item('Swap the grey picture on the question face for your own, and the one on the answer face (they are separate layers so the answer can show something different)', byName(page, 'Question picture'), page),
    item('For a different picture on each card, put one picture per card on top and set each one\'s visibility binding to the card it belongs to, for example card == 2 for the third card', byName(page, 'Question picture'), page),
    item('Add or remove cards by adding or removing rows in "cards": "Card 3 of 5" and the last-card check follow the length of the list', progress, page),
    item('Change the two rating buttons, or what they count: the "knew" variable adds one for I knew it, and the finished page shows it', knewIt, page),
    item('Change how fast the card turns: the two Animate property nodes in the Turn the card over flow (Interactions tab), 160 ms each', deck, page),
    item('Add a third rating ("Nearly"): duplicate a button in the Rating buttons row. One flow serves every button in the row, so you only change what event.childIndex does there', rating, page),
    item('Reword the finished page and its three ratings', done.children.find((n) => n.name === 'Result note'), done),
  );

  //Finished
  const result = text(ctx, 'Result', 'You knew {knew} of {cards.length} answers.', 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 24, fontWeight: 700 });
  const note = text(ctx, 'Result note', '{knew == cards.length ? "You knew every one. Well done!" : knew >= cards.length / 2 ? "A good start. Go again to firm up the rest." : "Go through them again and see how many you can get."}', 112, 444, 800, { align: 'center', color: L.onGradient, fontSize: 18 });
  const replay = darkButton(ctx, 'Go again', 'Go again', 422, 510, 180);
  done.children.push(result, note, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Go again'), go(page));

  //Notes for whoever edits the template, below the pages
  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 84 });
  addNote(page, { ...below(0, 440), text: '**One flow for two buttons.** I knew it and Still learning are children of the Rating buttons row. One On pointer on the row reads `event.childIndex` (0 is the first button), so a third rating needs no new wiring.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '[ ] Put your own cards in the `cards` variable (question, answer, a line of why). Swap the two grey picture boxes on the card. The card turns on a click, Enter or the T key.', colour: 'gold' });

  return { project, checklist };
}

/** The card turned over, to check the answer face. */
const GUESS_LAYOUT_STATES: LayoutState[] = [{ label: 'card turned', page: 'Think, then turn the card', vars: { turned: true } }];

export const guessTheAnswer: BrandedStarter = {
  key: 'games/guess-the-answer',
  set: 'games',
  name: 'Guess the answer',
  description: 'Five question cards, each with a picture placeholder. Think first, then turn the card over to see the answer and a line of why, and say whether you knew it. Turns on a click, Enter or the Turn the card button; ends with how many you knew.',
  tags: ['game', 'self-check', 'cards', 'variables'],
  build,
  layoutStates: GUESS_LAYOUT_STATES,
};
