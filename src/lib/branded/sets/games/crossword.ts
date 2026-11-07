//Crossword: a 10 by 10 grid laid out from a list of words and clues each time it plays (and in the editor preview), cells typed into from the keyboard, clues you can click, Check and Reveal.
import { createNode, layoutCrossword as layout, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, card, contentBox, item, solid, stroke, text, heading, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, emit, focus, go, heroPage, lit, set, spreadPages } from './common';

export const SIZE = 10;
const CELL = 40;
const GAP = 2;

export interface CrossWord {
  answer: string;
  clue: string;
}
export interface Placed extends CrossWord {
  row: number;
  col: number;
  down: boolean;
}

//Study words, the first thing a student meets when writing an essay
export const WORDS: CrossWord[] = [
  { answer: 'PARAPHRASE', clue: "Put someone else's idea into your own words" },
  { answer: 'PROOFREAD', clue: 'Check a finished draft for small errors' },
  { answer: 'REFERENCE', clue: 'An entry in the list at the end of your work' },
  { answer: 'ARGUMENT', clue: 'A claim supported by reasons and evidence' },
  { answer: 'CITATION', clue: 'A short note in your text that credits a source' },
  { answer: 'SUMMARY', clue: 'A short account of the main points' },
  { answer: 'THESIS', clue: 'The main claim your whole essay supports' },
  { answer: 'SOURCE', clue: 'Where an idea or fact came from' },
  { answer: 'ESSAY', clue: 'A piece of writing that builds an argument' },
  { answer: 'DRAFT', clue: 'An early version of your writing' },
];

// ------------------------------------------------------------------ the layout (the player works it out, from the words)

/** The same layout the `crossword(words, size)` formula runs in the player, kept here so the starter has a fallback to start from and the tests can read it. */
export const layoutCrossword = (words: CrossWord[], size = SIZE): Placed[] => layout(words, size) as Placed[];

// ------------------------------------------------------------------ expressions the page runs on

const R = (v: string) => `Math.floor(${v} / ${SIZE})`;
const C = (v: string) => `(${v} % ${SIZE})`;
const covers = (e: string, r: string, c: string) => `(${e}.down ? (${e}.col == ${c} && ${r} >= ${e}.row && ${r} < ${e}.row + ${e}.answer.length) : (${e}.row == ${r} && ${c} >= ${e}.col && ${c} < ${e}.col + ${e}.answer.length))`;
const LETTERS = `entries.flatMap(e => e.answer.toUpperCase().split("").map((l, k) => ({i: (e.row + (e.down ? k : 0)) * ${SIZE} + e.col + (e.down ? 0 : k), l})))`;
const STARTS = `entries.map(e => e.row * ${SIZE} + e.col).filter((v, i, a) => a.indexOf(v) == i).sort((a, b) => a - b)`;
const CELLS = `Array.from({length: ${SIZE * SIZE}}, (_, i) => ({r: Math.floor(i / ${SIZE}), c: i % ${SIZE}, ch: (letters.find(x => x.i == i) ?? {l: ""}).l, num: starts.indexOf(i) + 1, t: "", s: ""}))`;
const clueList = (down: boolean) => `entries.map((e, i) => ({i, n: starts.indexOf(e.row * ${SIZE} + e.col) + 1, clue: e.clue, len: e.answer.length, down: e.down, start: e.row * ${SIZE} + e.col})).filter(x => x.down == ${down}).sort((a, b) => a.n - b.n)`;
const WORD_UNDER_SEL = `sel < 0 ? -1 : (entries.findIndex(e => e.down == (dir == "down") && ${covers('e', R('sel'), C('sel'))}) >= 0 ? entries.findIndex(e => e.down == (dir == "down") && ${covers('e', R('sel'), C('sel'))}) : entries.findIndex(e => ${covers('e', R('sel'), C('sel'))}))`;
const WORD_CELLS = `aw < 0 ? [] : Array.from({length: entries[aw].answer.length}, (_, k) => (entries[aw].row + (entries[aw].down ? k : 0)) * ${SIZE} + entries[aw].col + (entries[aw].down ? 0 : k))`;
const CLUE_LINE = `aw < 0 ? "Select a square, then type." : (starts.indexOf(entries[aw].row * ${SIZE} + entries[aw].col) + 1) + (entries[aw].down ? " down: " : " across: ") + entries[aw].clue + " (" + entries[aw].answer.length + ")"`;
const ALL_RIGHT = 'cells.every(c => c.ch == "" || c.t == c.ch)';
const LAND_ON = (step: number, room: string) => `Array.from({length: ${room}}, (_, k) => sel + ${step} * (k + 1)).find(j => cells[j].ch != "") ?? sel`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Crossword');
  const { project, L } = ctx;
  //The author's list is just words and clues. "entries" is worked out from it by a formula (the player lays the words out), and so is everything built from the entries, so the canvas preview and the play both follow the list. The typed value of "entries" is only the fallback
  addVar(project, 'words', 'list', WORDS);
  addVar(project, 'entries', 'list', layoutCrossword(WORDS), `crossword(words, ${SIZE})`);
  const letters = addVar(project, 'letters', 'list', [], LETTERS);
  const starts = addVar(project, 'starts', 'list', [], STARTS);
  const cells = addVar(project, 'cells', 'list', [], CELLS);
  const across = addVar(project, 'acrossClues', 'list', [], clueList(false));
  const down = addVar(project, 'downClues', 'list', [], clueList(true));
  const sel = addVar(project, 'sel', 'number', -1);
  const dir = addVar(project, 'dir', 'string', 'across');
  const aw = addVar(project, 'aw', 'number', -1);
  const wordCells = addVar(project, 'wordCells', 'list', []);
  const current = addVar(project, 'current', 'string', '');
  const status = addVar(project, 'status', 'string', '');
  const done = addVar(project, 'done', 'boolean', false);

  const hero = heroPage(ctx, 'Study words crossword', 'Fill the grid from the clues. Type into a square, use the arrow keys to move, and check as you go.');
  const play = brandedPage(ctx, 'Crossword', { footer: '{cells.filter(c => c.ch != "" && c.t != "").length} of {cells.filter(c => c.ch != "").length} letters filled' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(play));
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The grid: one repeated square, so restyling one restyles them all
  const box = contentBox(play);
  const num = text(ctx, 'Square number', '{item.num > 0 ? item.num : ""}', 3, 1, 22, { fontSize: 10, fontWeight: 600, autoSize: 'none', height: 12, decorative: true });
  bind(num, { color: 'index == sel ? "' + L.onButton + '" : "' + L.muted + '"' });
  const letter = text(ctx, 'Square letter', '{item.t}', 0, 6, CELL, { fontSize: 22, fontWeight: 700, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: 32, decorative: true });
  bind(letter, { color: 'index == sel ? "' + L.onButton + '" : "' + L.text + '"' });
  const square = createNode('frame', {
    name: 'Square',
    x: 0,
    y: 0,
    width: CELL,
    height: CELL,
    cornerRadius: 4,
    clip: false,
    decorative: true,
    focusable: false,
    cursor: 'pointer',
    fill: solid(L.background),
    stroke: stroke(L.border, 1.5),
    children: [letter, num],
  });
  bind(square, {
    visible: 'item.ch != ""',
    'fill.color': `index == sel ? "${L.button}" : item.s == "bad" ? "${L.errorSurface}" : item.s == "ok" ? "${L.successSurface}" : item.s == "shown" ? "${L.surfaceMuted}" : wordCells.includes(index) ? "${L.warm}" : "${L.background}"`,
    'stroke.paint.color': `index == sel ? "${L.button}" : item.s == "bad" ? "${L.error}" : item.s == "ok" ? "${L.success}" : "${L.border}"`,
  });
  const side = SIZE * CELL + (SIZE - 1) * GAP;
  const grid = createNode('frame', {
    name: 'Grid',
    x: box.x,
    y: box.y,
    width: side,
    height: side,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Crossword grid. Use the arrow keys to move between squares and type a letter to fill one. Backspace clears.',
    repeat: { items: 'cells', layout: 'grid', gap: GAP, columns: SIZE },
    children: [square],
  });

  //The clues, two columns of buttons (a click picks the word)
  const colX = box.x + side + 34;
  const colW = 236;
  const clueRow = (name: string, items: string, dirName: string) => {
    const row = createNode('frame', {
      name,
      x: 0,
      y: 0,
      width: colW,
      height: 42,
      cornerRadius: 8,
      clip: false,
      role: 'button',
      focusable: true,
      fill: solid(L.surface),
      stroke: stroke(L.surface, 1.5),
      children: [text(ctx, `${name} text`, '{item.n}. {item.clue} ({item.len})', 10, 3, colW - 20, { fontSize: 14, lineHeight: 1.25, autoSize: 'none', height: 36, verticalAlign: 'middle', decorative: true })],
    });
    bind(row, {
      ariaLabel: `item.n + " ${dirName}, " + item.clue + ", " + item.len + " letters"`,
      'fill.color': `item.i == aw ? "${L.warm}" : "${L.surface}"`,
      'stroke.paint.color': `item.i == aw ? "${L.button}" : "${L.surface}"`,
    });
    return createNode('frame', {
      name: `${name}s`,
      x: 0,
      y: 0,
      width: colW,
      height: 6 * 46,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      ariaLabel: `${dirName} clues`,
      repeat: { items, layout: 'vertical', gap: 4, columns: 1 },
      children: [row],
    });
  };
  const acrossList = clueRow('Across clue', 'acrossClues', 'across');
  const downList = clueRow('Down clue', 'downClues', 'down');
  Object.assign(acrossList, { x: colX, y: box.y + 34 });
  Object.assign(downList, { x: colX + colW + 16, y: box.y + 34 });
  const acrossHead = heading(ctx, 'Across heading', 'Across', colX, box.y, colW, { fontSize: 20 });
  const downHead = heading(ctx, 'Down heading', 'Down', colX + colW + 16, box.y, colW, { fontSize: 20 });

  const bannerY = box.y + 34 + 6 * 46 + 8;
  const banner = card(ctx, 'Clue banner', colX, bannerY, colW * 2 + 16, 56);
  const clueLine = text(ctx, 'Current clue', '{current}', colX + 14, bannerY + 6, colW * 2 - 12, { fontSize: 16, fontWeight: 600, autoSize: 'none', height: 44, verticalAlign: 'middle' });
  const message = bind(text(ctx, 'Status', '{status}', colX, bannerY + 62, colW * 2 + 16, { fontSize: 15, fontWeight: 600, autoSize: 'none', height: 22 }), { color: `done ? "${L.success}" : "${L.text}"` });
  const buttonsY = box.y + box.height - 46;
  const check = button(ctx, 'Check', 'Check', colX, buttonsY, 100, true);
  const revealWord = button(ctx, 'Reveal word', 'Reveal word', colX + 108, buttonsY, 140, false);
  const revealAll = button(ctx, 'Reveal all', 'Reveal all', colX + 256, buttonsY, 120, false);
  const clear = button(ctx, 'Clear', 'Clear', colX + 384, buttonsY, 100, false);
  play.children.push(grid, acrossHead, acrossList, downHead, downList, banner, clueLine, message, check, revealWord, revealAll, clear);

  //Setting the puzzle up
  const g = new Graph(play);
  const onStart = g.start('Clear the puzzle (the entries come from the words list)');
  g.run(
    onStart,
    set(letters, LETTERS),
    set(starts, STARTS),
    set(cells, CELLS),
    set(across, clueList(false)),
    set(down, clueList(true)),
    set(sel, '-1'),
    set(dir, '"across"'),
    set(aw, '-1'),
    set(wordCells, '[]'),
    set(current, '"Select a square, then type."'),
    set(status, '""'),
    set(done, 'false'),
  );

  //Whenever the chosen square or direction changes: which word it is in, its squares, its clue
  const onPick = g.message('pick', 'Work out the word under the chosen square');
  g.run(
    onPick,
    set(aw, WORD_UNDER_SEL),
    set(dir, 'aw >= 0 ? (entries[aw].down ? "down" : "across") : dir'),
    set(wordCells, WORD_CELLS),
    set(current, CLUE_LINE),
    announce('aw < 0 ? "No word here" : current + ". Letter " + (wordCells.indexOf(sel) + 1) + " of " + wordCells.length + (cells[sel].t == "" ? ", empty" : ", " + cells[sel].t)'),
  );

  //Clicking a square: the same one again turns the word the other way
  const onSquare = g.click(square, 'Choose a square');
  g.run(onSquare, set(dir, 'sel == event.index ? (dir == "across" ? "down" : "across") : dir'), set(sel, 'event.index'), emit('pick'), focus(grid));
  //Clicking a clue
  for (const [list, name, key] of [[acrossList, 'across', across], [downList, 'down', down]] as const) {
    const row = list.children?.[0] ?? list;
    const onClue = g.click(row, `Choose a ${name} clue`);
    g.run(onClue, set(dir, lit(name)), set(sel, `${key.name}[event.index].start`), emit('pick'), focus(grid));
  }
  //Tabbing into the grid starts on the first square
  const onFocus = g.add('event.focus', { target: grid.id, type: 'focus' }, null, 'out', { note: 'Tab into the grid' });
  const lone = g.add('logic.if', { condition: 'sel < 0' }, onFocus);
  g.runFrom(lone, 'true', set(sel, 'cells.findIndex(c => c.ch != "")'), emit('pick'));

  //Typing a letter fills the square and moves along the word
  const onType = g.key('', grid, 'Type a letter');
  const isLetter = g.add('logic.if', { condition: 'sel >= 0 && event.key.length == 1 && !event.ctrl && !event.alt && !event.meta && "abcdefghijklmnopqrstuvwxyz".includes(event.key.toLowerCase())' }, onType);
  g.runFrom(
    isLetter,
    'true',
    set(cells, 'cells.map((c, j) => j == sel ? {...c, t: event.key.toUpperCase(), s: ""} : c)'),
    set(status, '""'),
    set(done, ALL_RIGHT),
    set(sel, 'wordCells.indexOf(sel) >= 0 && wordCells.indexOf(sel) < wordCells.length - 1 ? wordCells[wordCells.indexOf(sel) + 1] : sel'),
    emit('pick'),
  );
  //Backspace clears this square, or steps back and clears the one before
  const onBack = g.key('Backspace', grid, 'Backspace');
  const canBack = g.add('logic.if', { condition: 'sel >= 0' }, onBack);
  g.runFrom(
    canBack,
    'true',
    set(sel, 'cells[sel].t != "" || wordCells.indexOf(sel) < 1 ? sel : wordCells[wordCells.indexOf(sel) - 1]'),
    set(cells, 'cells.map((c, j) => j == sel ? {...c, t: "", s: ""} : c)'),
    set(done, 'false'),
    set(status, '""'),
    emit('pick'),
  );
  const onDelete = g.key('Delete', grid, 'Delete');
  const canDelete = g.add('logic.if', { condition: 'sel >= 0' }, onDelete);
  g.runFrom(canDelete, 'true', set(cells, 'cells.map((c, j) => j == sel ? {...c, t: "", s: ""} : c)'), set(done, 'false'), set(status, '""'), emit('pick'));
  //Arrow keys: on to the next square that has a letter in it
  const arrows: [string, string, string, string][] = [
    ['ArrowLeft', 'across', LAND_ON(-1, 'cells[sel].c'), 'Left'],
    ['ArrowRight', 'across', LAND_ON(1, `${SIZE - 1} - cells[sel].c`), 'Right'],
    ['ArrowUp', 'down', LAND_ON(-SIZE, 'cells[sel].r'), 'Up'],
    ['ArrowDown', 'down', LAND_ON(SIZE, `${SIZE - 1} - cells[sel].r`), 'Down'],
  ];
  for (const [key, way, land, note] of arrows) {
    const k = g.key(key, grid, `Move ${note.toLowerCase()}`);
    const can = g.add('logic.if', { condition: 'sel >= 0' }, k);
    g.runFrom(can, 'true', set(dir, lit(way)), set(sel, land), emit('pick'));
  }

  //Finishing: said once, when the last letter goes in or the answers are revealed
  const onDone = g.add('event.variable', { variable: done.id }, null, 'out', { note: 'Crossword finished' });
  const isDone = g.add('logic.if', { condition: 'done' }, onDone);
  g.runFrom(isDone, 'true', ['action.setVariable', { variable: status.id, op: 'set', value: 'status == "" ? "Crossword complete. Well done!" : status' }], announce('status'));

  //Check marks every typed letter right or wrong
  const onCheck = g.click(check, 'Check');
  g.run(
    onCheck,
    set(cells, 'cells.map(c => c.ch != "" && c.t != "" && c.s != "shown" ? {...c, s: c.t == c.ch ? "ok" : "bad"} : c)'),
    set(status, 'cells.filter(c => c.s == "bad").length > 0 ? cells.filter(c => c.s == "bad").length + " letter" + (cells.filter(c => c.s == "bad").length == 1 ? " is" : "s are") + " wrong (marked red)." : cells.filter(c => c.ch != "" && c.t == "").length > 0 ? "No mistakes so far. " + cells.filter(c => c.ch != "" && c.t == "").length + " squares still empty." : "Every letter is right."'),
    set(done, ALL_RIGHT),
    announce('status'),
  );
  //Reveal word fills the chosen word, Reveal all fills the grid
  const onRevealWord = g.click(revealWord, 'Reveal the chosen word');
  const hasWord = g.add('logic.if', { condition: 'aw >= 0' }, onRevealWord);
  g.runFrom(hasWord, 'true', set(cells, 'cells.map((c, j) => wordCells.includes(j) ? {...c, t: c.ch, s: "shown"} : c)'), set(status, '"Word revealed."'), set(done, ALL_RIGHT), announce('"Word revealed: " + entries[aw].answer'));
  const noWord = g.add('action.setVariable', { variable: status.id, op: 'set', value: '"Select a square first."' }, hasWord, 'false', { dy: 110 });
  g.run(noWord, announce('status'));
  const onRevealAll = g.click(revealAll, 'Reveal everything');
  g.run(onRevealAll, set(cells, 'cells.map(c => c.ch != "" ? {...c, t: c.ch, s: "shown"} : c)'), set(status, '"All the answers are showing."'), set(done, 'true'));
  const onClear = g.click(clear, 'Clear');
  g.run(onClear, set(cells, 'cells.map(c => ({...c, t: "", s: ""}))'), set(done, 'false'), set(status, '""'), announce('"Grid cleared"'));

  checklist.push(
    item('Write your own words and clues: Project > Variables > "words". Each row is {"answer": "PARAPHRASE", "clue": "Put someone else\'s idea into your own words"}, the answer in letters only (capitals or not, spaces and dashes are dropped). That is all you do: the grid, the numbers and both clue lists are laid out from it, in the canvas preview and every time the puzzle plays', grid, play),
    item(`The grid is ${SIZE} by ${SIZE}, so an answer longer than ${SIZE} letters is left out, and so is a word that cannot cross the others. Try the list in the canvas preview and read the clue lists: a longer list than about ten may not all fit, and a word that is left out just needs another word with a shared letter`, grid, play),
    item('You do not edit the grid positions. "entries" (Variables) is a formula, crossword(words, 10), that works the layout out from "words" (the same words always make the same puzzle). To lay one word by hand, clear the formula on "entries" and write its rows yourself: {answer, clue, row, col, down} with row and column counting from 0 at the top left', grid, play),
    item('Check the clue lists after a change: they hold about six clues each before they run into the clue box, and the number of each clue comes from where its word starts', acrossList, play),
    item('Restyle one Square (the letter, the number, the corners): every square is the same layer, repeated. The highlight colours come from the bindings on the Square layer', square, play),
    item('Change the completion message ("Crossword complete. Well done!"): the Crossword finished flow in the Interactions tab', message, play),
  );

  spreadPages(project);
  return { project, checklist };
}

export const crossword: BrandedStarter = {
  key: 'games/crossword',
  set: 'games',
  name: 'Crossword',
  description: 'A 10 by 10 crossword laid out from a list of words and clues, with numbered squares, across and down clue lists, typing and arrow-key movement, Check, Reveal word, Reveal all and a completion message. Edit the word list to make your own.',
  tags: ['game', 'vocabulary', 'keyboard friendly', 'variables'],
  build,
};
