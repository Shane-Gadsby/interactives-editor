//The memory game tutorial's finished project: twelve cards dealt from six pairs by a seeded shuffle, one repeated Card button,
//one click flow that turns a card and checks the pair, a Wait before a miss turns back, and a Well done page
import type { Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { addPage, addVariable, after, button, chain, emptyClick, event, layer, whenClicked, words } from './_story-helpers';

export const PAIRS = [
  { a: 'Cat', b: 'Kitten' },
  { a: 'Dog', b: 'Puppy' },
  { a: 'Cow', b: 'Calf' },
  { a: 'Sheep', b: 'Lamb' },
  { a: 'Horse', b: 'Foal' },
  { a: 'Duck', b: 'Duckling' },
];

export const DEAL = 'shuffle(pairs.flatMap((p, i) => [{text: p.a, pair: i, state: "down"}, {text: p.b, pair: i, state: "down"}]), seed)';
//Change list items where: every card whose state is "up" gets this state
const turnUp = (state: string) => ({ op: 'changeWhere', whereField: 'state', whereValue: '"up"', field: 'state', value: `"${state}"` });

function build(): Project {
  const p = blankProject('Animal pairs', 'Memory');
  const board = p.artboards[0];
  const done = addPage(p, 'Well done');

  //The Variables tab, top to bottom
  addVariable(p, 'list', 'pairs', { initial: JSON.stringify(PAIRS) });
  const seed = addVariable(p, 'counter', 'seed');
  const cards = addVariable(p, 'list', 'cards', { formula: DEAL });
  const moves = addVariable(p, 'counter', 'moves');
  addVariable(p, 'list', 'ups', { formula: 'positions(cards, "state", "up")', live: true });
  const matched = addVariable(p, 'counter', 'matched', { formula: 'count(cards, "state", "matched") / 2', live: true });

  //The board: a frame repeating one Card button over the cards, four to a row
  board.children.push(words(p, 'Moves', 'Moves: {moves}', 60, 40, 200, { fontSize: 22, fontWeight: 700, height: 30 }));
  board.children.push(words(p, 'Pairs found', 'Pairs found: {matched} of {pairs.length}', 300, 40, 380, { fontSize: 22, fontWeight: 700, height: 30 }));
  const card = button(p, 'Card', '{item.state == "down" ? "?" : item.text}', 0, 0, 170, 100);
  card.fontSize = 22;
  card.bindings = {
    'fill.color': 'item.state == "down" ? "#f6c344" : item.state == "matched" ? "#bfe5c4" : "#ffffff"',
    ariaLabel: '"Card " + (index + 1) + (item.state == "down" ? ", face down" : ": " + item.text)',
  };
  const grid = layer('frame', 'Cards', 60, 110, 4 * 170 + 3 * 12, 3 * 100 + 2 * 12, { fill: null, clip: false, children: [card], repeat: { items: 'cards', layout: 'grid', gap: 12, columns: 4 } });
  board.children.push(grid);

  //When the page is shown: a new seed and a fresh deal, and the moves back to 0
  const shown = event(board, 'event.start');
  chain(board, shown, ['action.setVariable', { variable: seed.id, op: 'add', value: '1' }], ['action.resetVariables', { variables: [cards.id, moves.id] }]);

  //A card: turn it up, and when it is the second one up, count a move and check the pair
  const pick = emptyClick(board, card, 'ups.length < 2 && cards[event.index].state == "down"');
  const turned = after(board, pick, 'action.setVariable', { variable: cards.id, op: 'setItem', index: '', field: 'state', value: '"up"' });
  const second = after(board, turned, 'logic.if', { condition: 'ups.length == 2' });
  const count = after(board, second, 'action.setVariable', { variable: moves.id, op: 'add', value: '1' }, 'true');
  const same = after(board, count, 'logic.if', { condition: 'cards[ups[0]].pair == cards[ups[1]].pair' });
  after(board, same, 'action.setVariable', { variable: cards.id, ...turnUp('matched') }, 'true');
  const wait = after(board, same, 'action.delay', { ms: '1000' }, 'false');
  after(board, wait, 'action.setVariable', { variable: cards.id, ...turnUp('down') });

  //Every pair found: a moment to see the last one, then the Well done page
  const all = event(board, 'event.variable', { variable: matched.id, onlyIf: 'matched == pairs.length' });
  chain(board, all, ['action.delay', { ms: '800' }], ['action.artboard', { to: 'next', transition: 'fade', duration: 400 }]);

  //Well done
  done.children.push(words(p, 'Title', 'Well done!', 60, 120, 680, { fontSize: 40, fontWeight: 700, height: 54, align: 'center' }));
  done.children.push(words(p, 'Result', 'You found all {pairs.length} pairs in {moves} moves.', 60, 200, 680, { fontSize: 22, height: 30, align: 'center' }));
  const again = button(p, 'Play again', 'Play again', 300, 280, 200, 52);
  done.children.push(again);
  whenClicked(p, done, again, 'page-pick', board.id);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-memory',
  topic: 'tutorial-memory',
  title: 'Memory card game',
  description: 'Twelve cards dealt face down from six pairs: turn two, keep a match, watch a miss turn back, with a moves count and a Well done page: the Memory card game tutorial\'s project.',
  tags: ['game', 'memory', 'shuffle', 'variables'],
  build,
  notes: [
    { text: '**One Card, repeated.** *Cards* repeats its one button over the `cards` list, four to a row, so restyle the Card once and all twelve change. `item` is the card each copy shows.' },
    { text: '**The deal is a formula.** `cards` is worked out with `shuffle(..., seed)`. Showing the page adds 1 to `seed` and puts `cards` back to its start, which works the formula out again: a new order.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 3, text: '**One flow for every card.** Only if lets a click through while fewer than two cards are up. The card turns up, and the second one up counts a move and checks the pair.' },
    { at: 9, text: '**A miss waits a second**, then turns every card that is up back down. A match keeps both as matched instead.', colour: 'sky' },
  ],
};
