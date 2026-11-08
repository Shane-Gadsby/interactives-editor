//Memory game: twelve face-down cards in a repeater (one card layer, one click handler), dealt in a new order every play. The cards are a key-navigation grid and what is face up, matched and busy is worked out from the cards themselves.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { keyNavList } from '../../parts';
import { addNote, brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, darkButton, go, goNext, graphNote, set } from './common';

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
  //Live, worked out from the cards: the two that are face up, pairs found, and whether a turn is still being looked at (two up, so clicks wait)
  addVar(project, 'ups', 'list', [], { formula: 'cards.map((c, i) => c.state == "up" ? i : -1).filter(i => i >= 0)', live: true });
  addVar(project, 'matched', 'number', 0, { formula: 'cards.filter(c => c.state == "matched").length / 2', live: true });
  addVar(project, 'busy', 'boolean', false, { formula: 'ups.length >= 2', live: true });

  const hero = brandedPage(ctx, 'Match the terms', { kind: 'hero', subtitle: 'Turn over two cards at a time and pair each term with what it means.' });
  const play = brandedPage(ctx, 'Find the matching pairs', { footer: 'Memory game' });
  const done = brandedPage(ctx, 'All the pairs found', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), goNext());
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
    stroke: stroke(L.primary, 3),
    bindings: {
      ariaLabel: '"Card " + (index + 1) + (item.state == "down" ? ", face down" : ": " + item.text + (item.state == "matched" ? ", matched" : ""))',
      'fill.color': `item.state == "down" ? "${L.button}" : item.state == "matched" ? "${L.successSurface}" : "${L.background}"`,
      'stroke.paint.color': `item.state == "matched" ? "${L.success}" : item.state == "up" ? "${L.primary}" : "${L.primary}"`,
    },
    children: [back, face],
  });
  //The cards are one Tab stop and the arrow keys move around them
  const grid = keyNavList('Cards', box.x, gridTop, CARD_W * 4 + GAP * 3, CARD_H * 3 + GAP * 2, { items: 'cards', row: card, mode: 'grid', columns: 4, gap: GAP, ariaLabel: 'Cards' });
  play.children.push(status, found, again, grid);

  //Dealing: both halves of every pair, shuffled
  const deal = 'pairs.length > 0 ? shuffle([...pairs.map((p, i) => ({text: p.term, pair: i, state: "down"})), ...pairs.map((p, i) => ({text: p.match, pair: i, state: "down"}))]) : []';
  const g = new Graph(play);
  const onStart = g.add('event.start', {}, null, 'out', { note: 'New game' });
  g.add('action.emit', { name: 'deal' }, onStart);
  const onAgain = g.click(again, 'New game');
  g.add('action.emit', { name: 'deal' }, onAgain);
  const onDeal = g.add('event.message', { name: 'deal' }, null, 'out', { note: 'Shuffle and deal: edit the shuffle here' });
  g.run(onDeal, set(cards, deal), ['action.resetVariables', { variables: [moves.id] }], ['action.announce', { text: '"Cards dealt. " + cards.length + " cards, face down."' }]);

  graphNote(play, { anchor: onDeal, colour: 'sky', text: '**Opening the page and New game both send deal**, so the shuffle lives in one Set variable. It doubles every pair into two face-down cards. [ ] Change the shuffle there, not in two places.' });
  //One click handler for every card: event.index says which one. A card that is face down turns up (a set item on it), and the second one up is a move
  const pick = g.add('event.pointer', { target: card.id, type: 'click', onlyIf: '!busy && cards[event.index].state == "down"' }, null, 'out', { note: 'Turn a card' });
  const up = g.add('action.setVariable', { variable: cards.id, op: 'setItem', index: '', field: 'state', value: '"up"' }, pick);
  const second = g.add('logic.if', { condition: 'ups.length == 2' }, up);
  g.runFrom(second, 'false', ['action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text' }]);
  const count = g.add('action.setVariable', { variable: moves.id, op: 'add', value: '1' }, second, 'true');
  const same = g.add('logic.if', { condition: 'cards[ups[0]].pair == cards[ups[1]].pair' }, count);
  graphNote(play, { anchor: pick, colour: 'sky', text: '**One flow serves every card.** *Only if* `!busy` ignores clicks while two cards are up (`busy` is live, from `ups`), and Set item turns just the card clicked. Only the second card up counts as a move.' });
  //A match: both stay up
  const keep = g.add('action.setVariable', { variable: cards.id, op: 'set', value: 'cards.map(c => c.state == "up" ? {...c, state: "matched"} : c)' }, same, 'true');
  const sayYes = g.add('action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text + ". Matched."' }, keep);
  const over = g.add('logic.if', { condition: 'matched >= pairs.length' }, sayYes);
  g.runFrom(over, 'true', ['action.delay', { ms: 700 }], goNext());
  graphNote(play, { anchor: same, colour: 'sky', text: '**Match** locks both as `matched` and moves on once the live `matched` reaches the pair count. **No match** has its own row below: it waits a second while `busy` blocks clicks, then turns both back down.' });
  //No match: a moment to look (clicks wait, because two are still up), then both flip back
  const sayNo = g.add('action.announce', { text: '"Card " + (event.index + 1) + ": " + cards[event.index].text + ". Not a match."' }, same, 'false', { dy: 220 });
  g.run(sayNo, ['action.delay', { ms: 1000 }], ['action.setVariable', { variable: cards.id, op: 'set', value: 'cards.map(c => c.state == "up" ? {...c, state: "down"} : c)' }]);

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

  //Notes for whoever edits the template, below the pages
  const below = (p: typeof play, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(play, { ...below(play, 0, 440), text: '**Live variables** `ups`, `matched` and `busy` are worked out from the cards, so a click only turns one card up. Nothing keeps a count or a lock by hand, and a new deal clears them by itself.', colour: 'sky' });
  addNote(play, { ...below(play, 456, 440), text: '**Shuffle** The deal uses `shuffle(list)`. The cards are a key-navigation grid: one Tab stop, arrow keys between cards, Enter turns one.', colour: 'sky' });
  addNote(hero, { ...below(hero, 0, 440), text: '[ ] **Make it yours** in the Variables tab. Put your own pairs in the `pairs` variable (term and what it matches). Six pairs fill the grid of twelve.', colour: 'gold' });

  return { project, checklist };
}

/** The board with every card face up, so the longest term and definition are checked on the cards. */
const MEMORY_LAYOUT_STATES: LayoutState[] = [{ label: 'all cards face up', page: 'Find the matching pairs', vars: { cards: [...PAIRS.map((p, i) => ({ text: p.term, pair: i, state: 'up' })), ...PAIRS.map((p, i) => ({ text: p.match, pair: i, state: 'matched' }))] } }];

export const memory: BrandedStarter = {
  key: 'story/memory-game',
  set: 'story',
  name: 'Memory game',
  description: 'Twelve face-down cards, six pairs of term and definition. Cards flip on a click or Enter, matched pairs stay up, a miss flips back after a moment, with a moves counter and a finished page. Dealt in a new order every play.',
  tags: ['game', 'revision', 'variables'],
  build,
  layoutStates: MEMORY_LAYOUT_STATES,
};
