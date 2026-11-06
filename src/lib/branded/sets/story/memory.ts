//Memory game: twelve face-down cards in a repeater (one card layer, one click handler), dealt in a new order every play.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, darkButton, go, set, spreadPages } from './common';

const PAIRS = [
  { term: 'Plagiarism', match: 'Presenting someone else\'s work as your own' },
  { term: 'Paraphrase', match: 'Putting an idea into your own words' },
  { term: 'Citation', match: 'A note in your text that credits a source' },
  { term: 'Reference list', match: 'The full details of every source you cited' },
  { term: 'Quotation', match: 'The exact words of a source, in quote marks' },
  { term: 'Collusion', match: 'Working with others when you should work alone' },
];

const CARD_W = 220;
const CARD_H = 112;
const GAP = 16;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Memory game');
  const { project, L } = ctx;
  addVar(project, 'pairs', 'list', PAIRS);
  const cards = addVar(project, 'cards', 'list', []);
  const moves = addVar(project, 'moves', 'number', 0);
  const matched = addVar(project, 'matched', 'number', 0);
  const first = addVar(project, 'first', 'number', -1);
  const busy = addVar(project, 'busy', 'boolean', false);

  const hero = brandedPage(ctx, 'Match the terms', { kind: 'hero', subtitle: 'Turn over two cards at a time and pair each term with what it means.' });
  const play = brandedPage(ctx, 'Find the matching pairs', { footer: 'Memory game' });
  const done = brandedPage(ctx, 'All the pairs found', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), go(play));
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  //The board
  const box = contentBox(play);
  const gridTop = box.y + 52;
  const status = text(ctx, 'Moves', 'Moves: {moves}', box.x, box.y + 8, 200, { fontSize: 20, fontWeight: 700 });
  const found = text(ctx, 'Pairs found', 'Pairs found: {matched} of {pairs.length}', box.x + 220, box.y + 8, 300, { fontSize: 20, fontWeight: 700 });
  const again = button(ctx, 'Play again', 'Play again', box.x + box.width - 160, box.y - 2, 160, false);

  const face = text(ctx, 'Card text', '{item.text}', 12, 8, CARD_W - 24, { fontSize: 17, fontWeight: 600, align: 'center', verticalAlign: 'middle', lineHeight: 1.3, autoSize: 'none', height: CARD_H - 16, bindings: { visible: 'item.state != "down"' } });
  const back = text(ctx, 'Card back', '?', 0, 8, CARD_W, { fontSize: 48, fontWeight: 700, align: 'center', verticalAlign: 'middle', color: L.onButton, autoSize: 'none', height: CARD_H - 16, decorative: true, bindings: { visible: 'item.state == "down"' } });
  const card = createNode('frame', {
    name: 'Card',
    x: 0,
    y: 0,
    width: CARD_W,
    height: CARD_H,
    cornerRadius: 16,
    clip: false,
    role: 'button',
    focusable: true,
    fill: solid(L.button),
    stroke: stroke(L.button, 3),
    bindings: {
      ariaLabel: '"Card " + (index + 1) + (item.state == "down" ? ", face down" : ": " + item.text + (item.state == "matched" ? ", matched" : ""))',
      'fill.color': `item.state == "down" ? "${L.button}" : item.state == "matched" ? "${L.successSurface}" : "${L.background}"`,
      'stroke.paint.color': `item.state == "matched" ? "${L.success}" : item.state == "up" ? "${L.accent}" : "${L.button}"`,
    },
    children: [back, face],
  });
  const grid = createNode('frame', {
    name: 'Cards',
    x: box.x,
    y: gridTop,
    width: CARD_W * 4 + GAP * 3,
    height: CARD_H * 3 + GAP * 2,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Cards',
    repeat: { items: 'cards', layout: 'grid', gap: GAP, columns: 4 },
    children: [card],
  });
  play.children.push(status, found, again, grid);

  //Dealing: both halves of every pair, shuffled
  const deal = 'pairs.length > 0 ? [...pairs.map((p, i) => ({text: p.term, pair: i, state: "down"})), ...pairs.map((p, i) => ({text: p.match, pair: i, state: "down"}))].map(t => ({t, r: Math.random()})).sort((a, b) => a.r - b.r).map(o => o.t) : []';
  const g = new Graph(play);
  const onStart = g.add('event.start', {}, null, 'out', { note: 'New game' });
  g.add('action.emit', { name: 'deal' }, onStart);
  const onAgain = g.click(again, 'New game');
  g.add('action.emit', { name: 'deal' }, onAgain);
  const onDeal = g.add('event.message', { name: 'deal' }, null, 'out', { note: 'Shuffle and deal: edit the shuffle here' });
  g.run(onDeal, set(cards, deal), set(moves, '0'), set(matched, '0'), set(first, '-1'), set(busy, 'false'), ['action.announce', { text: '"Cards dealt. 12 cards, face down."' }]);

  //One click handler for every card: event.index says which one
  const pick = g.click(card, 'Turn a card');
  const free = g.add('logic.if', { condition: '!busy && cards[event.index].state == "down"' }, pick);
  const up = g.add('action.setVariable', { variable: cards.id, op: 'set', value: 'cards.map((c, j) => j == event.index ? {...c, state: "up"} : c)' }, free, 'true');
  const isFirst = g.add('logic.if', { condition: 'first < 0' }, up);
  g.runFrom(isFirst, 'true', set(first, 'event.index'), ['action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text' }]);
  const lock = g.add('action.setVariable', { variable: busy.id, op: 'set', value: 'true' }, isFirst, 'false', { dy: 110 });
  const count = g.add('action.setVariable', { variable: moves.id, op: 'add', value: '1' }, lock);
  const same = g.add('logic.if', { condition: 'cards[first].pair == cards[event.index].pair' }, count);
  //A match: both stay up
  const keep = g.add('action.setVariable', { variable: cards.id, op: 'set', value: 'cards.map((c, j) => j == first || j == event.index ? {...c, state: "matched"} : c)' }, same, 'true');
  const sayYes = g.add('action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text + ". Matched."' }, keep);
  const more = g.run(sayYes, ['action.setVariable', { variable: matched.id, op: 'add', value: '1' }], set(first, '-1'), set(busy, 'false'));
  const over = g.add('logic.if', { condition: 'matched >= pairs.length' }, more);
  g.runFrom(over, 'true', ['action.delay', { ms: 700 }], go(done));
  //No match: a moment to look, then both flip back
  const sayNo = g.add('action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text + ". Not a match."' }, same, 'false', { dy: 220 });
  g.run(sayNo, ['action.delay', { ms: 1000 }], ['action.setVariable', { variable: cards.id, op: 'set', value: 'cards.map(c => c.state == "up" ? {...c, state: "down"} : c)' }], set(first, '-1'), set(busy, 'false'));

  checklist.push(
    item('Write your own six pairs: Project > Variables > "pairs", a list of terms and what each one matches (the cards, the count and the finished check all follow it)', grid, play),
    item('Restyle the card (back and face) once: every card is the same layer, repeated', card, play),
    item('Change how long unmatched cards stay face up: the Wait node at the end of the Interactions row for "Turn a card"', again, play),
  );

  //Finished
  const well = text(ctx, 'Result', 'You matched all {pairs.length} pairs in {moves} moves.', 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 22, fontWeight: 700 });
  const note = text(ctx, 'Result note', '{moves <= pairs.length + 4 ? "Excellent memory!" : moves <= pairs.length * 2 + 2 ? "Nicely done." : "Have another go and see if you can beat that."}', 112, 444, 800, { align: 'center', color: L.onGradient, fontSize: 18 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 510, 180);
  done.children.push(well, note, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Play again'), go(play));
  checklist.push(item('Change the finished message and its three ratings (they read the number of moves)', note, done));

  spreadPages(project);
  return { project, checklist };
}

export const memory: BrandedStarter = {
  key: 'story/memory-game',
  set: 'story',
  name: 'Memory game',
  description: 'Twelve face-down cards, six pairs of term and definition. Cards flip on a click or Enter, matched pairs stay up, a miss flips back after a moment, with a moves counter and a finished page. Dealt in a new order every play.',
  tags: ['game', 'revision', 'variables'],
  build,
};
