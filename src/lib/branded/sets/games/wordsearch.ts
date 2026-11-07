//Word search: a 12 by 12 letter grid, made from the word list each time it plays (and in the editor preview), with eight hidden words, picked by dragging across them or by choosing the first and last letter (click or keyboard).
import { createNode, makeWordSearch, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, darkButton, emit, go, heroPage, set, spreadPages } from './common';

export const SIZE = 12;
const CELL = 36;
//Where the grid sits on the page, which the pointer maths below needs
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
const CELL_AT = `Math.min(${SIZE - 1}, Math.max(0, Math.floor((event.y - ${GY}) / ${CELL}))) * ${SIZE} + Math.min(${SIZE - 1}, Math.max(0, Math.floor((event.x - ${GX}) / ${CELL})))`;
//The squares from `start` to `end` when they are in a straight line (across, down or on a diagonal); just `start` when they are not
const LINE = `start < 0 || end < 0 ? [] : (${R('start')} == ${R('end')} || ${C('start')} == ${C('end')} || Math.abs(${R('end')} - ${R('start')}) == Math.abs(${C('end')} - ${C('start')})) ? Array.from({length: Math.max(Math.abs(${R('end')} - ${R('start')}), Math.abs(${C('end')} - ${C('start')})) + 1}, (_, k) => (${R('start')} + Math.sign(${R('end')} - ${R('start')}) * k) * ${SIZE} + ${C('start')} + Math.sign(${C('end')} - ${C('start')}) * k) : [start]`;
const SPELLED = 'line.map(i => rows.join("").charAt(i)).join("")';
const HIT = `line.length < 2 ? -1 : words.findIndex((w, k) => !found.includes(k) && (w.toUpperCase() == ${SPELLED} || w.toUpperCase() == ${SPELLED}.split("").reverse().join("")))`;
const SAY_CELL = `"Row " + (${R('cursor')} + 1) + ", column " + (${C('cursor')} + 1) + ", " + rows.join("").charAt(cursor) + (foundCells.includes(cursor) ? ", part of a found word" : "") + (start == cursor ? ", start of your selection" : "")`;
const CLOCK = 'Math.floor(seconds / 60) + ":" + pad(seconds % 60, 2)';

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Word search');
  const { project, L } = ctx;
  addVar(project, 'words', 'list', WORDS);
  //"rows" is worked out from "words" by a formula, so changing the words re-hides them (in the canvas preview too). The typed value is only the fallback
  addVar(project, 'rows', 'list', makeGrid(WORDS), `wordSearch(words, ${SIZE})`);
  const found = addVar(project, 'found', 'list', []);
  const foundCells = addVar(project, 'foundCells', 'list', []);
  const start = addVar(project, 'start', 'number', -1);
  const end = addVar(project, 'end', 'number', -1);
  const line = addVar(project, 'line', 'list', []);
  const dragging = addVar(project, 'dragging', 'boolean', false);
  const pressCell = addVar(project, 'pressCell', 'number', 0);
  const cursor = addVar(project, 'cursor', 'number', -1);
  const showCursor = addVar(project, 'showCursor', 'boolean', false);
  const hit = addVar(project, 'hit', 'number', -1);
  const message = addVar(project, 'message', 'string', '');
  const seconds = addVar(project, 'seconds', 'number', 0);
  const running = addVar(project, 'running', 'boolean', false);
  addVar(project, 'showTimer', 'boolean', true);

  const hero = heroPage(ctx, 'Word search', 'Find the study words hidden in the grid. Drag across a word, or pick its first and last letter.');
  const page = brandedPage(ctx, 'Find the words', { footer: '{found.length} of {words.length} found' });
  const done = brandedPage(ctx, 'You found them all', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(page));
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The grid: one repeated letter square, on a panel
  const box = contentBox(page);
  const side = SIZE * CELL;
  const panel = card(ctx, 'Grid panel', GX - 14, GY - 14, side + 28, side + 28);
  const letter = text(ctx, 'Letter', '{item.l}', 0, 4, CELL, { fontSize: 20, fontWeight: 600, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: 28, decorative: true });
  bind(letter, { color: `line.includes(index) ? "${L.onButton}" : "${L.text}"` });
  const square = createNode('frame', {
    name: 'Letter square',
    x: 0,
    y: 0,
    width: CELL,
    height: CELL,
    cornerRadius: 10,
    clip: false,
    decorative: true,
    focusable: false,
    fill: solid(L.surface),
    stroke: stroke(L.surface, 2),
    children: [letter],
  });
  bind(square, {
    'fill.color': `line.includes(index) ? "${L.button}" : foundCells.includes(index) ? "${L.successSurface}" : "${L.surface}"`,
    'stroke.paint.color': `showCursor && cursor == index ? "${L.text}" : foundCells.includes(index) ? "${L.success}" : "${L.surface}"`,
  });
  const grid = createNode('frame', {
    name: 'Grid',
    x: GX,
    y: GY,
    width: side,
    height: side,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Letter grid, 12 rows of 12. Use the arrow keys to move, Enter to mark the first and last letter of a word, Escape to start the choice again.',
    repeat: { items: 'rows.join("").split("").map((l, i) => ({l, i}))', layout: 'grid', gap: 0, columns: SIZE },
    children: [square],
  });

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
  const counts = text(ctx, 'Counts', 'Found {found.length} of {words.length}{showTimer ? "     Time " + ' + CLOCK + ' : ""}', colX, box.y + 232, colW, { fontSize: 18, fontWeight: 700 });
  const say = bind(text(ctx, 'Message', '{message}', colX, box.y + 268, colW, { fontSize: 17, lineHeight: 1.3, autoSize: 'none', height: 70 }), { color: `found.length >= words.length || message.startsWith("Found") ? "${L.success}" : "${L.text}"` });
  const again = button(ctx, 'Start again', 'Start again', colX, box.y + box.height - 46, 170, false);
  page.children.push(panel, grid, head, how, wordList, counts, say, again);

  //Setting up and starting again
  const g = new Graph(page);
  const onStart = g.start('Begin');
  g.run(onStart, emit('reset'));
  const onReset = g.message('reset', 'Clear the board and the clock');
  g.run(onReset, set(found, '[]'), set(foundCells, '[]'), set(start, '-1'), set(end, '-1'), set(line, '[]'), set(dragging, 'false'), set(cursor, '-1'), set(seconds, '0'), set(running, 'true'), set(message, '"Drag across a word, or click its first and last letter."'));
  const onAgain = g.click(again, 'Start again');
  g.run(onAgain, emit('reset'), announce('"Board cleared. Find the " + words.length + " words."'));
  const onTick = g.add('event.timer', { ms: 1000, repeat: true }, null, 'out', { note: 'Clock' });
  const ticking = g.add('logic.if', { condition: 'running' }, onTick);
  g.runFrom(ticking, 'true', ['action.setVariable', { variable: seconds.id, op: 'add', value: '1' }]);

  //A drag: pressed on the first letter, the end follows the pointer, let go to try the word
  const onDown = g.pointer(grid, 'pointerdown', 'Press');
  g.run(onDown, set(pressCell, CELL_AT));
  const onDragStart = g.pointer(grid, 'dragstart', 'A drag begins');
  g.run(onDragStart, set(start, 'pressCell'), set(end, 'pressCell'), set(dragging, 'true'), set(line, LINE));
  const onDrag = g.pointer(grid, 'drag', 'Dragging');
  const isDragging = g.add('logic.if', { condition: 'dragging' }, onDrag);
  g.runFrom(isDragging, 'true', set(end, CELL_AT), set(line, LINE));
  const onDragEnd = g.pointer(grid, 'dragend', 'Let go');
  const wasDragging = g.add('logic.if', { condition: 'dragging' }, onDragEnd);
  g.runFrom(wasDragging, 'true', emit('try'));
  //A tap or click (no drag): the same as pressing Enter on that square
  const onUp = g.pointer(grid, 'pointerup', 'Click a letter');
  const wasTap = g.add('logic.if', { condition: '!dragging' }, onUp);
  g.runFrom(wasTap, 'true', set(cursor, CELL_AT), emit('mark'));

  //Marking: the first press sets the start, the second ends the word
  const onMark = g.message('mark', 'First letter, then last letter');
  const first = g.add('logic.if', { condition: 'start < 0' }, onMark);
  const said = g.runFrom(first, 'true', set(start, 'cursor'), set(end, 'cursor'), set(line, LINE), set(message, `"Start set at " + rows.join("").charAt(cursor) + ". Now choose the last letter of the word."`));
  g.add('action.announce', { text: 'message', politeness: 'polite' }, said);
  const second = g.add('action.setVariable', { variable: end.id, op: 'set', value: 'cursor' }, first, 'false', { dy: 110 });
  g.run(second, set(line, LINE), emit('try'));

  //Trying the word that is lined up
  const onTry = g.message('try', 'Is it one of the words?');
  const live = g.add('logic.if', { condition: 'start >= 0' }, onTry);
  const tried = g.runFrom(
    live,
    'true',
    set(hit, HIT),
    set(foundCells, 'hit >= 0 ? foundCells.concat(line) : foundCells'),
    set(found, 'hit >= 0 ? found.concat([hit]) : found'),
    set(message, 'hit >= 0 ? "Found " + words[hit] + "!" : line.length < 2 && end != start ? "Words run in a straight line: across, down or on a diagonal. Try again." : line.length < 2 ? "Selection cleared. Choose a first letter again." : "That is not one of the words. Try again."'),
    set(start, '-1'),
    set(end, '-1'),
    set(line, '[]'),
    set(dragging, 'false'),
    announce('message'),
  );
  const all = g.add('logic.if', { condition: 'found.length >= words.length && words.length > 0' }, tried);
  g.runFrom(all, 'true', set(running, 'false'), set(message, '"You found every word!"'), announce('message'), ['action.delay', { ms: 900 }], go(done));

  //The keyboard: the arrow keys move the square, with a start set the line follows
  const onFocus = g.add('event.focus', { target: grid.id, type: 'focus' }, null, 'out', { note: 'Tab into the grid' });
  g.run(onFocus, set(showCursor, 'true'), set(cursor, 'cursor < 0 ? 0 : cursor'), announce(SAY_CELL));
  const onBlur = g.add('event.focus', { target: grid.id, type: 'blur' }, null, 'out', { note: 'Leave the grid' });
  g.run(onBlur, set(showCursor, 'false'));
  const moves: [string, string, string][] = [
    ['ArrowLeft', `${C('cursor')} > 0 ? cursor - 1 : cursor`, 'Left'],
    ['ArrowRight', `${C('cursor')} < ${SIZE - 1} ? cursor + 1 : cursor`, 'Right'],
    ['ArrowUp', `cursor >= ${SIZE} ? cursor - ${SIZE} : cursor`, 'Up'],
    ['ArrowDown', `cursor < ${SIZE * (SIZE - 1)} ? cursor + ${SIZE} : cursor`, 'Down'],
  ];
  for (const [key, to, note] of moves) {
    const k = g.key(key, grid, `Move ${note.toLowerCase()}`);
    g.run(k, set(showCursor, 'true'), set(cursor, to), set(end, 'start >= 0 ? cursor : end'), set(line, LINE), announce(SAY_CELL));
  }
  const onEnter = g.key('Enter', grid, 'Mark a letter');
  g.run(onEnter, emit('mark'));
  const onSpace = g.key('Space', grid, 'Mark a letter');
  g.run(onSpace, emit('mark'));
  const onEscape = g.key('Escape', grid, 'Start the choice again');
  g.run(onEscape, set(start, '-1'), set(end, '-1'), set(line, '[]'), set(message, '"Selection cleared."'), announce('message'));

  checklist.push(
    item('Write your own words: Project > Variables > "words", one word in each row of the list (letters only, spaces and dashes are dropped). That is all you do: the grid is made from the list, in the canvas preview and every time the puzzle plays, with the words hidden across, down, on diagonals and backwards. The same words always make the same grid', wordList, page),
    item(`A word longer than ${SIZE} letters is left out of the grid. The "Words to find" list has room for eight, so keep to about eight words, or make the list taller. The finish check and the counts follow the list's length`, wordList, page),
    item('You do not edit the grid letters. "rows" (Variables) is a formula, wordSearch(words, 12), that hides the words and fills the gaps. To hide the words yourself, clear the formula on "rows" and write its 12 rows of 12 letters by hand: the check reads the letters straight off the grid, so a word works wherever it is', grid, page),
    item('The grid is 12 by 12. To make it bigger or smaller, the formula\'s size, the layout and the pointer maths in the Interactions tab (the cell size, 36, and the grid\'s position) have to change with it, so keep 12 rows of 12 unless you are prepared to rebuild those', grid, page),
    item('Turn the clock off by setting the "showTimer" variable to false (Variables tab). Nothing else uses it, and Find the words still works the same', counts, page),
    item('Reword the instructions under the heading and the messages players see (found, not a word, selection cleared): the "message" settings in the Interactions tab', how, page),
    item('Change what the finished page says and add your own picture or next step', done.children.find((n) => n.name === 'Result'), done),
  );

  //Finished
  const result = text(ctx, 'Result', 'You found all {words.length} words in {' + CLOCK + '}.', 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 22, fontWeight: 700 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 470, 180);
  done.children.push(result, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Play again'), go(page));

  spreadPages(project);
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
