/**
 * Drag the words: a passage with six gaps and a bank of word chips (two of them wrong on purpose) to drag into the gaps. Check
 * marks every gap right or wrong, Show answers fills them in and Try again starts over. Taps and the keyboard work too.
 */
import { createNode, defaultAutoLayout, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, boxText, goButton, heroPage, join, lit, put, seq } from './shared';

//The passage, one sentence a row. A number is a gap (its index in ANSWERS), a string is the text around it
const SENTENCES: (string | number)[][] = [
  ['When you use someone else\'s ideas, you ', 0, ' them in your text.'],
  ['Putting an idea into your own words is called ', 1, '.'],
  ['Words copied exactly go inside ', 2, ' and are cited.'],
  ['A ', 3, ' at the end of your work gives full details of every source.'],
  ['Copying someone\'s work without credit is ', 4, '.'],
  ['Facts that most people already know are called ', 5, '.'],
];
//The right word for each gap, in order. Each one is also the name of a chip
const ANSWERS = ['cite', 'paraphrasing', 'quotation marks', 'reference list', 'plagiarism', 'common knowledge'];
//Words that fit nowhere
const EXTRAS = ['collusion', 'proofreading'];
const WORDS = [...ANSWERS, ...EXTRAS];
//The order the chips start in the bank (indexes into WORDS), so the first look is never the answer
const BANK = [3, 6, 1, 4, 7, 0, 5, 2];
const N = ANSWERS.length;
const GAP_W = 156;
const GAP_H = 34;
const CHIP_W = 148;
const CHIP_H = 38;

export function dragTheWords(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Drag the words');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Drag the words', 'Drag each word into the gap where it belongs, then check your answers.');
  const page = brandedPage(ctx, 'Referencing and integrity', { name: 'Activity', footer: 'Drag each word into a gap' });
  const box = contentBox(page);

  addVar(project, 'answers', 'list', JSON.stringify(ANSWERS));
  const gapVars = ANSWERS.map((_, i) => addVar(project, `gap${i + 1}`, 'list', '[]'));
  const results = addVar(project, 'results', 'list', JSON.stringify(ANSWERS.map(() => false)));
  const checked = addVar(project, 'checked', 'boolean', false);
  const shown = addVar(project, 'shown', 'boolean', false);
  const message = addVar(project, 'message', 'string', '');

  const instruction = text(ctx, 'Instruction', 'Drag each word into a gap. With the keyboard: Tab to a word, press Space to pick it up, use the arrow keys to choose a gap and Space to drop it. Taps work too.', box.x, box.y - 4, box.width, { fontSize: 14, color: L.muted, lineHeight: 1.35 });

  //The passage: a panel with a row for each sentence, text then a gap then text, and a mark that says how the gap went
  const rowLayout = { ...defaultAutoLayout('row'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'center' as const, hugWidth: true, hugHeight: true };
  const gaps: SceneNode[] = [];
  const sentences: FrameNode[] = SENTENCES.map((parts, r) => {
    const kids: SceneNode[] = [];
    parts.forEach((part, k) => {
      if (typeof part === 'string') {
        kids.push(text(ctx, `Sentence ${r + 1} text ${k === 0 ? 'start' : 'end'}`, part, 0, 0, 100, { fontSize: 19, autoSize: 'width', wrap: false, ...(part.length < 3 ? { layoutItem: { margin: { top: 0, right: 0, bottom: 0, left: -4 } } } : {}) }));
        return;
      }
      const i = part;
      const g = gapVars[i].name;
      const right = `results[${i}]`;
      const gap = createNode('frame', {
        name: `Gap ${i + 1}`,
        width: GAP_W,
        height: GAP_H,
        cornerRadius: 12,
        fill: solid(L.background),
        stroke: { paint: solid(L.muted), width: 2, dash: [6, 4] },
        clip: false,
        dropZone: { accepts: [], capacity: 1, whenFull: 'swap', snap: 'center', label: `Gap ${i + 1} of ${N}`, contentsVariable: gapVars[i].id },
        bindings: {
          'fill.color': `checked ? (${right} ? ${lit(L.successSurface)} : ${lit(L.errorSurface)}) : ${lit(L.background)}`,
          'stroke.paint.color': `checked ? (${right} ? ${lit(L.success)} : ${lit(L.error)}) : ${lit(L.muted)}`,
          ariaDescription: `checked ? (${right} ? "Right" : "Wrong") : (${g}.length > 0 ? "Filled" : "Empty")`,
        },
        children: [boxText(ctx, 'Gap number', String(i + 1), 0, 0, GAP_W, GAP_H, { fontSize: 15, fontWeight: 700, color: L.muted, align: 'center' })],
      });
      gaps.push(gap);
      const mark = text(ctx, `Gap ${i + 1} mark`, `{${right} ? "✓" : "✗"}`, 0, 0, 22, {
        fontSize: 22,
        fontWeight: 700,
        autoSize: 'width',
        decorative: true,
        bindings: { opacity: 'checked ? 1 : 0', color: `${right} ? ${lit(L.success)} : ${lit(L.error)}` },
      });
      kids.push(gap, mark);
    });
    return createNode('frame', { name: `Sentence ${r + 1}`, fill: null, stroke: null, clip: false, layout: rowLayout, children: kids }) as FrameNode;
  });
  const passage = createNode('frame', {
    name: 'Passage',
    x: box.x,
    y: box.y + 44,
    width: box.width,
    height: 272,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 8, padding: { top: 14, right: 28, bottom: 14, left: 28 }, align: 'start', hugHeight: true },
    children: sentences,
  }) as FrameNode;

  //The word bank is a zone too, so a word put in a gap can be dragged back out
  const bankY = box.y + 328;
  const bank = createNode('frame', {
    name: 'Word bank',
    x: box.x,
    y: bankY,
    width: 648,
    height: 106,
    cornerRadius: 16,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    clip: false,
    dropZone: { accepts: [], snap: 'none', label: 'Word bank' },
    children: [],
  });
  const chips: SceneNode[] = WORDS.map((word, i) => {
    const slot = BANK.indexOf(i);
    return createNode('frame', {
      name: word,
      x: box.x + 10 + (slot % 4) * 160,
      y: bankY + 10 + Math.floor(slot / 4) * 48,
      width: CHIP_W,
      height: CHIP_H,
      cornerRadius: CHIP_H / 2,
      fill: solid(L.background),
      stroke: stroke(L.text, 2),
      clip: false,
      shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
      draggable: { tags: ['word'], onMiss: 'return', label: word },
      ariaLabel: word,
      children: [boxText(ctx, 'Word', word, 6, 0, CHIP_W - 12, CHIP_H, { fontSize: 15, fontWeight: 600, align: 'center' })],
    });
  });

  const progress = text(ctx, 'Progress', `Gaps filled: {[${gapVars.map((v) => v.name).join(', ')}].filter(g => g.length > 0).length} of ${N}`, box.x + 672, bankY + 72, 256, { fontSize: 16, fontWeight: 700 });
  const check = button(ctx, 'Check button', 'Check', box.x + 672, bankY + 2, 124);
  const showBtn = button(ctx, 'Show answers button', 'Show answers', box.x + 804, bankY + 2, 124, false);
  showBtn.bindings = { visible: 'checked && !shown && !results.every(r => r)' };
  const again = button(ctx, 'Try again button', 'Try again', box.x + 672, bankY + 52, 256, false);
  again.bindings = { visible: 'checked' };
  progress.bindings = { visible: '!checked' };
  const feedback = text(ctx, 'Feedback', '{message}', box.x, bankY + 114, box.width, { fontSize: 18, fontWeight: 600, bindings: { visible: 'message != ""' } });
  page.children.push(instruction, passage, bank, ...chips, progress, check, showBtn, again, feedback);

  //Check: work out which gaps are right (the word in a gap has to be the answer for that gap), say how it went
  const nowRight = `[${gapVars.map((v, i) => `${v.name}.length > 0 && ${v.name}[0] == answers[${i}]`).join(', ')}]`;
  const checkRow = seq(page, 0, ['event.pointer', { target: check.id, type: 'click' }, 'Check'], ['action.setVariable', { variable: results.id, op: 'set', value: nowRight }], ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }]);
  const verdict = put(page, 'logic.if', 780, 0, { condition: 'results.every(r => r)' });
  const allRight = put(page, 'action.setVariable', 1040, -60, { variable: message.id, op: 'set', value: `"All ${N} gaps are right. Well done!"` });
  const someRight = put(page, 'action.setVariable', 1040, 70, { variable: message.id, op: 'set', value: `results.filter(r => r).length + " of ${N} gaps are right. Look for the marks, move the words that are wrong and check again, or show the answers."` });
  const say = put(page, 'action.announce', 1300, 0, { text: 'message' });
  join(page, checkRow[2], verdict);
  join(page, verdict, allRight, 'true');
  join(page, verdict, someRight, 'false');
  join(page, allRight, say);
  join(page, someRight, say);

  //Moving a word after a Check clears the marks, so they never describe a gap that has changed
  seq(page, 160, ['event.drop', { result: 'any' }, 'Moving a word'], ['action.setVariable', { variable: checked.id, op: 'set', value: 'false' }], ['action.setVariable', { variable: message.id, op: 'set', value: '""' }]);

  //Show answers: every word back to the bank, then each answer into its own gap, and the words are locked
  const lock = chips.map((c) => ['action.dragEnable', { target: c.id, op: 'disable' }] as [string, Record<string, unknown>]);
  seq(
    page,
    300,
    ['event.pointer', { target: showBtn.id, type: 'click' }, 'Show answers'],
    ['action.dragReset', {}],
    ...ANSWERS.map((_, i) => ['action.dragPlace', { layer: chips[i].id, zone: gaps[i].id }] as [string, Record<string, unknown>]),
    ['action.setVariable', { variable: results.id, op: 'set', value: 'answers.map(a => true)' }],
    ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }],
    ['action.setVariable', { variable: shown.id, op: 'set', value: 'true' }],
    ['action.setVariable', { variable: message.id, op: 'set', value: '"Here are the right words. Press Try again to have another go."' }],
    ['action.announce', { text: 'message' }],
    ...lock
  );

  //Try again: let the words be dragged, put them back, clear the marks
  seq(
    page,
    450,
    ['event.pointer', { target: again.id, type: 'click' }, 'Try again'],
    ...chips.map((c) => ['action.dragEnable', { target: c.id, op: 'enable' }] as [string, Record<string, unknown>]),
    ['action.dragReset', {}],
    ['action.setVariable', { variable: checked.id, op: 'set', value: 'false' }],
    ['action.setVariable', { variable: shown.id, op: 'set', value: 'false' }],
    ['action.setVariable', { variable: results.id, op: 'set', value: JSON.stringify(ANSWERS.map(() => false)) }],
    ['action.setVariable', { variable: message.id, op: 'set', value: '""' }]
  );

  goButton(hero, start, page, 0);

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title, the instruction and the footer text', byName(page, 'Page title'), page),
    item('Write your own passage: edit the text before and after each gap (the text layers inside each "Sentence" row, Layers panel)', sentences[0], page),
    item('Set the right word for each gap: the "answers" variable (Variables tab) is a list with one word for each gap, in order. A word chip counts as right when its layer name is exactly that word, so rename the chip too (and type the same word on the chip and as its Text alternative)', chips[0], page),
    item('Change or add wrong words: duplicate a chip and give it a name that is not in "answers". It then fits no gap', chips[N], page),
    item(`To add a gap: duplicate a "Sentence" row and its chip, add a list variable (gap${N + 1}) and set it as the new gap's Contents variable (Drop zone section), then add it to the "Set variable: results" formula in the Interactions tab and to the "Gaps filled" count. Add the word to "answers"`, gaps[N - 1], page),
    item('Rewrite the messages after Check and Show answers (Interactions tab)', feedback, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked; the passage, words and gaps are yours', undefined, page),
  ];
  return { project, checklist };
}
