/**
 * Drag the words: a passage with six gaps and a bank of word chips (two of them wrong on purpose) to drag into the gaps, made with
 * the question kit's fill the blanks question answered by dragging. Check answer marks every gap, tries and Try again come with
 * the question, and the words can be moved by tap and by keyboard.
 */
import { defaultAutoLayout, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { bind, click, goPrevious, graph } from '../../graph-kit';
import { dressQuestion, endPage, goNextOn, heroPage, lit } from './shared';
import { extrasChecklist, questionExtras } from '../../parts';

//The passage, one sentence a row. A number is a gap (its index in ANSWERS), a string is the text around it
const SENTENCES: (string | number)[][] = [
  ['When you use someone else\'s ideas, you', 0, 'them in your text.'],
  ['Putting an idea into your own words is called', 1, '.'],
  ['Words copied exactly go inside', 2, 'and are cited.'],
  ['A', 3, 'at the end of your work gives full details of every source.'],
  ['Copying someone\'s work without credit is', 4, '.'],
  ['Facts that most people already know are called', 5, '.'],
];
//The right word for each gap, in order
const ANSWERS = ['cite', 'paraphrasing', 'quotation marks', 'reference list', 'plagiarism', 'common knowledge'];
//Words that fit nowhere
const EXTRAS = ['collusion', 'proofreading'];
const N = ANSWERS.length;
const GAP_W = 164;
const ROW_H = 30;
const CHIP_W = 160;

/** After a check with every gap wrong, so the right words beside the marks and the feedback show at their longest. */
export const DRAG_WORDS_LAYOUT_STATES: LayoutState[] = [
  {
    label: 'checked, all wrong',
    page: 'Activity',
    vars: {
      words_answered: true,
      words_locked: true,
      words_feedback: 'Out of tries. The right words are beside the marks.',
      words_items: ANSWERS.map((a, i) => ({ id: `b${i + 1}`, text: a, label: `Gap ${i + 1}`, number: i + 1, selected: false, state: 'wrong', answer: ANSWERS[(i + 3) % N] })),
    },
  },
];

export function dragTheWords(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Drag the words');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Drag the words', 'Drag each word into the gap where it belongs, then check your answers.');
  const page = brandedPage(ctx, 'Referencing and integrity', { name: 'Activity', footer: 'Drag each word into a gap' });
  const results = endPage(ctx, 'Well done', 'You filled {words_score} of ' + N + ' gaps with the right word.', 'Try again');
  const box = contentBox(page);

  const id = addQuestion(project, page.id, 'blank', { at: { x: box.x, y: box.y - 8 }, ...questionExtras(project, { tryAgain: true }) })!;
  setQuestionSettings(project, page.id, id, {
    prefix: 'words',
    prompt: 'Drag each word into the gap where it belongs.',
    answerBy: 'drag',
    points: N,
    shuffle: true,
    attempts: 3,
    blanks: ANSWERS.map((a, i) => ({ id: `b${i + 1}`, label: `Gap ${i + 1}`, answers: [a] })),
    extras: EXTRAS.map((w, i) => ({ id: `x${i + 1}`, text: w })),
    hints: [],
    feedbackCorrect: 'All six gaps are right. Well done!',
    feedbackPartial: 'Move the words marked wrong and check again.',
    feedbackIncorrect: 'Not quite. Move the words marked wrong and try again.',
    feedbackOutOfTries: 'Out of tries. The right words are beside the marks.',
    reveal: true,
    report: null,
  });
  const frame = page.children.find((n) => n.id === id) as FrameNode;
  frame.name = 'Words question';
  dressQuestion(ctx, frame, box.width, { pad: 14, gap: 8 });
  const parts = partsOf(frame);
  for (const t of frame.children) if (t.type === 'text' && t.questionPart === 'prompt') t.fontSize = 18;

  //The passage: each blank's row becomes a sentence, text then the gap then text and a mark that says how the gap went
  const blanks = parts.blanks[0] as FrameNode;
  blanks.name = 'Passage';
  blanks.layout = { ...blanks.layout!, gap: 2 };
  const items = 'words_items';
  parts.blankRow.forEach((row, i) => {
    const r = row as FrameNode;
    const [before, , after] = SENTENCES[i] as [string, number, string];
    const gap = parts.blankZone.find((z) => r.children.includes(z)) as FrameNode;
    const st = `${items}[${i}]?.state`;
    //a full stop after a gap sits against it
    const sentence = (name: string, words: string, tight = false) => text(ctx, name, words, 0, 0, 100, { fontSize: 17, autoSize: 'width', wrap: false, decorative: true, ...(tight && words.length < 3 ? { layoutItem: { margin: { top: 0, right: 0, bottom: 0, left: -3 } } } : {}) });
    Object.assign(gap, { name: `Gap ${i + 1}`, width: GAP_W, height: ROW_H });
    const mark = text(ctx, `Gap ${i + 1} mark`, `{${st} == "correct" ? "✓" : ${st} == "wrong" ? "✗" + (${items}[${i}]?.answer ? " " + ${items}[${i}].answer : "") : ""}`, 0, 0, 22, {
      fontSize: 17,
      fontWeight: 700,
      autoSize: 'width',
      wrap: false,
      decorative: true,
      bindings: { color: `${st} == "correct" ? ${lit(L.success)} : ${lit(L.error)}` },
    });
    r.name = `Sentence ${i + 1}`;
    r.layout = { ...defaultAutoLayout('row'), gap: 6, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'center', hugHeight: true, hugWidth: false };
    r.children = [sentence(`Sentence ${i + 1} start`, before), gap, ...(after ? [sentence(`Sentence ${i + 1} end`, after, true)] : []), mark];
  });
  //The words: the bank is a box, four to a row, a little smaller than the kit's
  const bank = parts.wordBank[0] as FrameNode;
  bank.name = 'Word bank';
  const label = parts.wordBankLabel?.[0];
  if (label) (frame.children.find((c) => c.questionPart === 'dragBlanks') as FrameNode).children = (frame.children.find((c) => c.questionPart === 'dragBlanks') as FrameNode).children.filter((c) => c !== label);
  //five to a row across the bank, so eight words sit in two rows
  const cols = 5;
  const pad = 8;
  const inner = box.width - 48;
  const pitch = (inner - pad * 2 - CHIP_W) / (cols - 1);
  bank.children.forEach((c, k) => {
    const chip = c as FrameNode;
    Object.assign(chip, { x: Math.round(pad + (k % cols) * pitch), y: pad + Math.floor(k / cols) * (ROW_H + 6), width: CHIP_W, height: ROW_H, cornerRadius: ROW_H / 2 });
    chip.layout = { ...chip.layout!, padding: { top: 2, right: 6, bottom: 2, left: 6 } };
    const word = chip.ariaLabel ?? chip.name;
    chip.name = word;
    for (const t of chip.children) {
      t.name = `${word} text`;
      Object.assign(t, { fontSize: 14, fontWeight: 600, align: 'center' });
    }
  });
  Object.assign(bank, { width: inner, height: pad * 2 + 2 * ROW_H + 6, fill: solid(L.background), stroke: stroke(L.border, 2), cornerRadius: 14, role: 'region', ariaLabel: 'Word bank' });

  //How to do it from the keyboard, under the question
  const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a word, press Space to pick it up, use the arrow keys to choose a gap and Space to drop it. Taps work too.', 0, 0, 100, { fontSize: 14, color: L.muted });
  frame.children.splice(1, 0, keys);

  //A way on to the results once the question is finished
  const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'words_locked' });
  (parts.buttons[0] as FrameNode).children.push(next);

  goNextOn(hero, start, 'Navigation');
  goNextOn(page, next, 'Navigation');
  {
    const g = graph(results.page);
    g.run(click(g, results.again, 'Try again'), goPrevious());
  }

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Fill the blanks question** answered by dragging. The gaps, the right word for each and the wrong words are settings of the question (Question section); the word bank fills itself from them.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Sentences** are each gap\'s row: text, the gap, text, and a mark. Edit the words around a gap in place. Gap 1 takes the first blank, gap 2 the second.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Write your passage, then give each gap its right word (and any wrong words) in the Question section. Keep it to six gaps or less so it fits above the footer.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Write your own passage: edit the text before and after each gap (the text layers inside each "Sentence" row, Layers panel)', parts.blankRow[0], page),
    item('Set the right word for each gap in the Question section (each blank\'s accepted answer; the first one is the word that goes in the bank). Add wrong words under Extras', frame, page),
    item('Set the tries, the points (the results page says "of 6") and the feedback messages in the Question section', frame, page),
    item('Change the results page text', results.result, results.page),
    item('Try it with the keyboard: Tab to a word, Space, arrow keys, Space, then Check answer', undefined, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked; the passage, words and gaps are yours', undefined, page),
  ];
  checklist.push(item(extrasChecklist({ tryAgain: true })));
  return { project, checklist };
}
