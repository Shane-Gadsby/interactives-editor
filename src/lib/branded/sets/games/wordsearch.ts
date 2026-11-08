//Word search: a 12 by 12 letter grid, made from the word list each time it plays (and in the editor preview), with eight hidden words, picked by dragging across them or by choosing the first and last letter (click or keyboard).
import { createNode, makeWordSearch, type TemplateChecklistItem } from 'interactives-player';
import { addNote, barY, brandedPage, brandedProject, button, card, contentBox, heading, item, solid, stroke, text, todo, type BrandedStarter } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { keyNavList } from '../../parts';
import { Graph, addVar, announce, bind, darkButton, emit, go, goNext, graphNote, heroPage, set } from './common';

export const SIZE = 12;
const CELL = 36;
//Where the grid sits on the page
const GX = 56;
const GY = 122;

export const WORDS = ['PLANNER', 'LIBRARY', 'REVISE', 'SUMMARY', 'ESSAY', 'QUOTE', 'SOURCE', 'NOTES'];

// ------------------------------------------------------------------ the grid (the player makes it, from the words)

//Right, down, down-right, up-right, left, up, down-left, up-left
export const DIRECTIONS: [number, number][] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [1, -1], [-1, -1]];

/** The same grid the `wordSearch(words, size)` formula makes in the player, kept here so the starter has a fallback to start from and the tests can read it. Returns one string per row. */
export const makeGrid = (words: string[], size = SIZE, seed = 7): string[] => makeWordSearch(words, size, seed);

/** Where a word is in the grid, in any of the eight directions: its first square's row and column, and the direction. */
export function findWord(rows: string[], word: string): { row: number; col: number; dr: number; dc: number } | null {
  const size = rows.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of DIRECTIONS) {
        const ok = Array.from(word).every((ch, k) => rows[r + dr * k]?.[c + dc * k] === ch);
        if (ok) return { row: r, col: c, dr, dc };
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ expressions

const R = (v: string) => `Math.floor(${v} / ${SIZE})`;
const C = (v: string) => `(${v} % ${SIZE})`;
//The squares from `start` to `end` when they are in a straight line (across, down or on a diagonal); just `start` when they are not
const LINE = `start < 0 || end < 0 ? [] : (${R('start')} == ${R('end')} || ${C('start')} == ${C('end')} || Math.abs(${R('end')} - ${R('start')}) == Math.abs(${C('end')} - ${C('start')})) ? Array.from({length: Math.max(Math.abs(${R('end')} - ${R('start')}), Math.abs(${C('end')} - ${C('start')})) + 1}, (_, k) => (${R('start')} + Math.sign(${R('end')} - ${R('start')}) * k) * ${SIZE} + ${C('start')} + Math.sign(${C('end')} - ${C('start')}) * k) : [start]`;
const SPELLED = 'line.map(i => rows.join("").charAt(i)).join("")';
const HIT = `line.length < 2 ? -1 : words.findIndex((w, k) => !found.includes(k) && (w.toUpperCase() == ${SPELLED} || w.toUpperCase() == ${SPELLED}.split("").reverse().join("")))`;
//What a screen reader says for a square as the arrow keys land on it
const SAY_CELL = `"Row " + (${R('index')} + 1) + ", column " + (${C('index')} + 1) + ", " + item.l + (foundCells.includes(index) ? ", part of a found word" : "") + (start == index ? ", start of your selection" : "")`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Word search');
  const { project, L } = ctx;
  addVar(project, 'words', 'list', WORDS);
  //"rows" is worked out from "words" by a formula, so changing the words re-hides them (in the canvas preview too). The typed value is only the fallback
  addVar(project, 'rows', 'list', makeGrid(WORDS), { formula: `wordSearch(words, ${SIZE})`, live: true });
  const found = addVar(project, 'found', 'list', []);
  const foundCells = addVar(project, 'foundCells', 'list', []);
  const start = addVar(project, 'start', 'number', -1);
  const end = addVar(project, 'end', 'number', -1);
  //Live: the squares lined up between the first and last letter, and the word they spell, follow start and end wherever those come from (a drag, clicks, the arrow keys)
  addVar(project, 'line', 'list', [], { formula: LINE, live: true });
  addVar(project, 'hit', 'number', -1, { formula: HIT, live: true });
  //The square the arrow keys have focused: the grid is a key-navigation list that writes its focused item here
  const cursor = addVar(project, 'cursor', 'number', -1);
  const message = addVar(project, 'message', 'string', 'Drag across a word, or click its first and last letter.');
  const seconds = addVar(project, 'seconds', 'number', 0);
  addVar(project, 'showTimer', 'boolean', true);

  const hero = heroPage(ctx, 'Word search', 'Find the study words hidden in the grid. Drag across a word, or pick its first and last letter.');
  const page = brandedPage(ctx, 'Find the words', { footer: '{found.length} of {words.length} found' });
  const done = brandedPage(ctx, 'You found them all', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The grid: one repeated letter square, on a panel
  const box = contentBox(page);
  const side = SIZE * CELL;
  const panel = card(ctx, 'Grid panel', GX - 14, GY - 14, side + 28, side + 28);
  const letter = text(ctx, 'Letter', '{item.l}', 0, 4, CELL, { fontSize: 20, fontWeight: 600, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: 28, decorative: true });
  bind(letter, { color: `line.includes(index) ? "${L.onButton}" : "${L.text}"` });
  //Each square is a button (Enter and Space choose it) and a stop in the grid's key navigation, so the focus ring is the cursor
  const square = createNode('frame', {
    name: 'Letter square',
    x: 0,
    y: 0,
    width: CELL,
    height: CELL,
    cornerRadius: 10,
    clip: false,
    role: 'button',
    focusable: true,
    fill: solid(L.surface),
    stroke: stroke(L.surface, 2),
    children: [letter],
  });
  bind(square, {
    ariaLabel: SAY_CELL,
    'fill.color': `line.includes(index) ? "${L.button}" : foundCells.includes(index) ? "${L.successSurface}" : "${L.surface}"`,
    'stroke.paint.color': `foundCells.includes(index) ? "${L.success}" : "${L.surface}"`,
  });
  const grid = keyNavList('Grid', GX, GY, side, side, { items: 'rows.join("").split("").map((l, i) => ({l, i}))', row: square, mode: 'grid', columns: SIZE, gap: 0, indexVariable: cursor, ariaLabel: 'Letter grid, 12 rows of 12. Use the arrow keys to move, Enter to mark the first and last letter of a word, Escape to start the choice again.' });
  //The grid hears Escape (and a drag across it) but is not a stop of its own: the squares are
  Object.assign(grid, { role: 'region', focusable: false });

  //The side: the words to find, the count and clock, a line of feedback, Start again
  const colX = 520;
  const colW = 456;
  const head = heading(ctx, 'Words heading', 'Words to find', colX, box.y, colW, { fontSize: 22 });
  const how = text(ctx, 'How to play', 'Drag across a word, or click its first and last letter. With the keyboard, move with the arrow keys and press Enter on the first and the last letter.', colX, box.y + 34, colW, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
  const wordText = text(ctx, 'Word text', '{item.found ? "✓ " : ""}{item.w}', 0, 2, 200, { fontSize: 18, fontWeight: 600, autoSize: 'none', height: 24, decorative: true });
  bind(wordText, { textDecoration: 'item.found ? "line-through" : "none"', color: `item.found ? "${L.muted}" : "${L.text}"` });
  const wordRow = createNode('frame', { name: 'Word', x: 0, y: 0, width: 220, height: 28, fill: null, stroke: null, clip: false, children: [wordText] });
  const wordList = createNode('frame', {
    name: 'Word list',
    x: colX,
    y: box.y + 100,
    width: colW,
    height: 4 * 30,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Words to find',
    repeat: { items: 'words.map((w, i) => ({w, found: found.includes(i)}))', layout: 'grid', gap: 2, columns: 2, direction: 'columns' },
    children: [wordRow],
  });
  const counts = text(ctx, 'Counts', 'Found {found.length} of {words.length}{showTimer ? "     Time " + clock(seconds) : ""}', colX, box.y + 232, colW, { fontSize: 18, fontWeight: 700 });
  const say = bind(text(ctx, 'Message', '{message}', colX, box.y + 268, colW, { fontSize: 17, lineHeight: 1.3, autoSize: 'none', height: 70 }), { color: `found.length >= words.length || message.startsWith("Found") ? "${L.success}" : "${L.text}"` });
  const again = button(ctx, 'Start again', 'Start again', colX, barY(box), 170, false);
  page.children.push(panel, grid, head, how, wordList, counts, say, again);

  //Setting up and starting again: one Reset variables puts the board back, and the clock counts up from now
  const g = new Graph(page);
  const onStart = g.start('Begin');
  g.run(onStart, emit('reset'));
  const onReset = g.message('reset', 'Clear the board and the clock');
  g.run(onReset, ['action.resetVariables', { variables: [found, foundCells, start, end, cursor, message].map((v) => v.id) }], ['action.clock', { variable: seconds.id, op: 'start', mode: 'up', seconds: '0' }]);
  const onAgain = g.click(again, 'Start again');
  g.run(onAgain, emit('reset'), announce('"Board cleared. Find the " + words.length + " words."'));

  //A drag: pressed on the first letter (event.startIndex), the end follows the pointer (event.index), let go to try the word
  graphNote(page, { anchor: onReset, colour: 'sky', text: '**Opening the page and Start again both send reset**, so putting the board back (and restarting the clock) is written once.' });
  const onDragStart = g.pointer(grid, 'dragstart', 'A drag begins');
  g.run(onDragStart, set(start, 'event.startIndex ?? event.index'), set(end, 'event.index ?? event.startIndex'));
  const onDrag = g.pointer(grid, 'drag', 'Dragging');
  g.run(onDrag, set(end, 'event.index ?? end'));
  const onDragEnd = g.pointer(grid, 'dragend', 'Let go');
  g.run(onDragEnd, set(end, 'event.index ?? end'), emit('try'));

  //A click, a tap or Enter on a square: the first one sets the start, the second ends the word
  const onClick = g.click(square, 'Click a letter (or press Enter on it)');
  const first = g.add('logic.if', { condition: 'start < 0' }, onClick);
  const said = g.runFrom(first, 'true', set(start, 'event.index'), set(end, 'event.index'), set(message, `"Start set at " + rows.join("").charAt(event.index) + ". Now choose the last letter of the word."`));
  g.add('action.announce', { text: 'message', politeness: 'polite' }, said);
  const second = g.add('action.setVariable', { variable: end.id, op: 'set', value: 'event.index' }, first, 'false', { dy: 110 });
  g.run(second, emit('try'));

  graphNote(page, { anchor: onDragStart, colour: 'sky', text: '**Every way of choosing only sets start and end**, then sends `try`. Dragging does it in three events, a first and a second click do it in one flow, and the arrow keys stretch `end` from `cursor`.' });
  //With a start set, the arrow keys stretch the line: the end follows the focused square
  const onMove = g.add('event.variable', { variable: cursor.id, onlyIf: 'start >= 0 && cursor >= 0' }, null, 'out', { note: 'The arrow keys moved' });
  g.run(onMove, set(end, 'cursor'));

  //Trying the word that is lined up ("hit" is live, so it says which word the line spells before anything is changed)
  const onTry = g.add('event.message', { name: 'try', onlyIf: 'start >= 0' }, null, 'out', { note: 'Is it one of the words?' });
  const tried = g.run(
    onTry,
    set(message, 'hit >= 0 ? "Found " + words[hit] + "!" : line.length < 2 && end != start ? "Words run in a straight line: across, down or on a diagonal. Try again." : line.length < 2 ? "Selection cleared. Choose a first letter again." : "That is not one of the words. Try again."'),
    set(foundCells, 'hit >= 0 ? foundCells.concat(line) : foundCells'),
    set(found, 'hit >= 0 ? found.concat([hit]) : found'),
    set(start, '-1'),
    set(end, '-1'),
    announce('message'),
  );
  const all = g.add('logic.if', { condition: 'found.length >= words.length && words.length > 0' }, tried);
  g.runFrom(all, 'true', ['action.clock', { variable: seconds.id, op: 'pause' }], set(message, '"You found every word!"'), announce('message'), ['action.delay', { ms: 900 }], goNext());

  graphNote(page, { anchor: onTry, colour: 'sky', text: '**hit is live: it already names the word the line spells**, so the message, the found list and the coloured squares all read it. A crooked line or a non-word falls through and just clears the choice. The last word found pauses the clock.' });
  //Escape drops a half-made choice
  const onEscape = g.key('Escape', grid, 'Start the choice again');
  g.run(onEscape, set(start, '-1'), set(end, '-1'), set(message, '"Selection cleared."'), announce('message'));

  checklist.push(
    todo('Write your own words for the grid', 'Write your own words: Project > Variables > "words", one word in each row of the list (letters only, spaces and dashes are dropped). That is all you do: the grid is made from the list, in the canvas preview and every time the puzzle plays, with the words hidden across, down, on diagonals and backwards. The same words always make the same grid', wordList, page),
    todo('Keep to about eight words', `A word longer than ${SIZE} letters is left out of the grid. The "Words to find" list has room for eight, so keep to about eight words, or make the list taller. The finish check and the counts follow the list's length`, wordList, page),
    todo('Leave the grid letters alone', 'You do not edit the grid letters. "rows" (Variables) is a formula, wordSearch(words, 12), that hides the words and fills the gaps. To hide the words yourself, clear the formula on "rows" and write its 12 rows of 12 letters by hand: the check reads the letters straight off the grid, so a word works wherever it is', grid, page),
    todo('Leave the grid at 12 by 12 unless you must change it', 'The grid is 12 by 12. To make it bigger or smaller, change the formula\'s size, the repeater\'s columns and the 12 in the line and hit formulas together, so keep 12 rows of 12 unless you are prepared to change those', grid, page),
    todo('Turn the clock off if you want', 'Turn the clock off by setting the "showTimer" variable to false (Variables tab). Nothing else uses it, and Find the words still works the same', counts, page),
    todo('Reword the instructions and player messages', 'Reword the instructions under the heading and the messages players see (found, not a word, selection cleared): the "message" settings in the Interactions tab', how, page),
    todo('Change what the finished page says', 'Change what the finished page says and add your own picture or next step', done.children.find((n) => n.name === 'Result'), done),
  );

  //Finished
  const result = text(ctx, 'Result', 'You found all {words.length} words in {clock(seconds)}.', 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 22, fontWeight: 700 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 470, 180);
  done.children.push(result, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Play again'), go(page));

  //Notes for whoever edits the template, below the pages
  const below = (p: typeof page, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(page, { ...below(page, 0, 440), text: '**Key navigation** The grid is one Tab stop and the arrow keys move between its squares, writing the square to `cursor`. Enter on a square is a click, so keyboard and mouse share one flow.', colour: 'sky' });
  addNote(page, { ...below(page, 456, 440), text: '**Drag events** One drag flow reads `event.startIndex` and `event.index` (the square under the pointer), so there is no pointer maths to redo if the grid moves or changes size.', colour: 'sky' });
  addNote(hero.page, { ...below(hero.page, 0, 440), text: '[ ] **Make it yours** in the Variables tab. Put your own words in the `words` variable. `line` and `hit` are live variables, so they follow whatever picked the first and last letter.', colour: 'gold' });

  return { project, checklist };
}

export const wordSearch: BrandedStarter = {
  key: 'games/word-search',
  set: 'games',
  name: 'Word search',
  description: 'A 12 by 12 letter grid hiding eight words, across, down, diagonal and backwards. Drag across a word, or click (or press Enter on) its first and last letter. Found words are struck off the list and kept highlighted, with an optional clock and a finished page.',
  tags: ['game', 'vocabulary', 'keyboard friendly', 'variables'],
  build,
};
