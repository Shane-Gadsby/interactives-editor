//Arithmetic quiz: ten sums made fresh every play (the operation and the range are variables), answered by typing or by picking from four options, with a score, an optional clock and Play again.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { BRAND_FONT } from '../../looks';
import { lookDefaults } from '../../../themes';
import { keyNavList, progressBar } from '../../parts';
import { Graph, addVar, announce, bind, darkButton, emit, focus, go, goNext, heroPage, set } from './common';

//The sums, in steps so each can be read: the numbers, then the working, then the four options (shuffle and randInt are the expression helpers)
const PAIRS = 'Array.from({length: howMany}, (_) => ({a: randInt(lowest, highest), b: randInt(lowest, highest), o: operation == "mixed" ? ["+", "-", "×"][randInt(0, 2)] : operation}))';
const WORKING = `draft.map(p => p.o == "+" ? {...p, t: p.a + " + " + p.b, ans: p.a + p.b} : p.o == "-" ? {...p, t: Math.max(p.a, p.b) + " − " + Math.min(p.a, p.b), ans: Math.abs(p.a - p.b)} : p.o == "÷" ? {...p, t: Math.max(1, p.a) * p.b + " ÷ " + Math.max(1, p.a), ans: p.b} : {...p, t: p.a + " × " + p.b, ans: p.a * p.b})`;
const OPTIONS = 'draft.map(s => ({t: s.t, ans: s.ans, opts: shuffle([s.ans, ...shuffle([1, -1, 2, -2, 10, -10, 3, -3].filter(o => s.ans + o >= 0)).slice(0, 3).map(o => s.ans + o)])}))';

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Arithmetic quiz');
  const { project, L } = ctx;
  addVar(project, 'operation', 'string', 'mixed');
  addVar(project, 'lowest', 'number', 2);
  addVar(project, 'highest', 'number', 12);
  addVar(project, 'howMany', 'number', 10);
  addVar(project, 'mode', 'string', 'type');
  addVar(project, 'showTimer', 'boolean', true);
  const draft = addVar(project, 'draft', 'list', []);
  const sums = addVar(project, 'sums', 'list', []);
  const q = addVar(project, 'q', 'number', 0);
  const score = addVar(project, 'score', 'number', 0);
  const answered = addVar(project, 'answered', 'boolean', false);
  const given = addVar(project, 'given', 'string', '');
  const typed = addVar(project, 'typed', 'string', '');
  //Live: the mark and the words that go with it follow what was given, so the flows below only ever set "given" and "answered"
  addVar(project, 'correct', 'boolean', false, { formula: 'answered && sums.length > 0 && Number(given) == sums[q].ans', live: true });
  const warn = addVar(project, 'warn', 'boolean', false);
  addVar(project, 'feedback', 'string', '', { formula: 'answered ? (correct ? "Correct!" : "Not quite. " + sums[q].t + " = " + sums[q].ans) : warn ? "Type your answer first." : ""', live: true });
  const seconds = addVar(project, 'seconds', 'number', 0);

  const hero = heroPage(ctx, 'Quick sums', 'Ten sums, made fresh every time. Work them out, see your score, and play again to beat it.');
  const page = brandedPage(ctx, 'Work it out', { footer: 'Question {Math.min(q + 1, sums.length)} of {sums.length}' });
  const done = brandedPage(ctx, 'All done', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The question panel
  const box = contentBox(page);
  const panelW = 576;
  const panel = card(ctx, 'Question panel', box.x, box.y, panelW, 290);
  const sum = text(ctx, 'Sum', '{sums.length > 0 ? sums[q].t + " = ?" : ""}', box.x, box.y + 84, panelW, { fontSize: 76, fontWeight: 700, align: 'center', autoSize: 'none', height: 110, verticalAlign: 'middle' });
  const askText = text(ctx, 'Ask', '{mode == "choose" ? "Pick the answer" : "Type the answer"}', box.x, box.y + 30, panelW, { fontSize: 20, fontWeight: 600, align: 'center', color: L.muted });

  //Type the answer
  const input = createNode('input', {
    name: 'Answer',
    ...lookDefaults(project, 'input'),
    inputType: 'number',
    placeholder: 'Your answer',
    ariaLabel: 'Your answer',
    variableId: typed.id,
    x: box.x,
    y: box.y + 314,
    width: 300,
    height: 56,
    cornerRadius: 12,
    fontSize: 24,
    fontFamily: BRAND_FONT,
    stroke: stroke(L.border, 2),
  });
  bind(input, { visible: 'mode != "choose"', 'stroke.paint.color': `answered ? (correct ? "${L.success}" : "${L.error}") : "${L.border}"` });
  const check = bind(button(ctx, 'Check', 'Check answer', box.x + 316, box.y + 314, 170, true), { visible: 'mode != "choose"', disabled: 'answered' });

  //Or pick from four options: a grid whose copies are one Tab stop and move with the arrow keys
  const optionText = text(ctx, 'Option text', '{item}', 0, 12, 270, { fontSize: 26, fontWeight: 700, align: 'center', autoSize: 'none', height: 36, decorative: true });
  const option = createNode('frame', {
    name: 'Option',
    x: 0,
    y: 0,
    width: 270,
    height: 60,
    cornerRadius: 14,
    clip: false,
    role: 'button',
    focusable: true,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    children: [optionText],
  });
  bind(option, {
    ariaLabel: '"Answer " + (index + 1) + ": " + item',
    ariaDescription: 'answered ? (item == sums[q].ans ? "Right answer" : item == Number(given) ? "Your answer, wrong" : "") : ""',
    'fill.color': `answered ? (item == sums[q].ans ? "${L.successSurface}" : item == Number(given) ? "${L.errorSurface}" : "${L.background}") : "${L.background}"`,
    'stroke.paint.color': `answered ? (item == sums[q].ans ? "${L.success}" : item == Number(given) ? "${L.error}" : "${L.border}") : "${L.border}"`,
  });
  const options = bind(keyNavList('Options', box.x, box.y + 306, 270 * 2 + 36, 60 * 2 + 16, { items: 'sums.length > 0 ? sums[q].opts : []', row: option, mode: 'grid', columns: 2, gap: 16, ariaLabel: 'Answer options' }), { visible: 'mode == "choose"' });

  //The side: where you are, the score and clock, how it went, on to the next
  const sideX = box.x + panelW + 32;
  const sideW = box.width - panelW - 32;
  const where = heading(ctx, 'Where', 'Question {Math.min(q + 1, sums.length)} of {sums.length}', sideX, box.y, sideW, { fontSize: 22 });
  const bar = progressBar(ctx, 'Progress bar', sideX, box.y + 44, sideW, { value: 'q + (answered ? 1 : 0)', max: 'Math.max(1, sums.length)', label: 'Quiz progress', valueText: '{value} of {max} answered' });
  const tally = text(ctx, 'Tally', 'Score: {score}{showTimer ? "     Time: " + clock(seconds) : ""}', sideX, box.y + 72, sideW, { fontSize: 19, fontWeight: 700 });
  const verdict = bind(text(ctx, 'Feedback', '{feedback}', sideX, box.y + 126, sideW, { fontSize: 22, fontWeight: 700, lineHeight: 1.3, autoSize: 'none', height: 110 }), { color: `answered ? (correct ? "${L.success}" : "${L.error}") : "${L.text}"` });
  const next = bind(button(ctx, 'Next', 'Next question', sideX, box.y + box.height - 46, 220, true), { disabled: '!answered', label: 'q + 1 >= sums.length ? "See results" : "Next question"' });
  page.children.push(panel, askText, sum, input, check, options, where, bar, tally, verdict, next);

  //Making the sums, each time the page opens (the clock counts up from the same moment)
  const g = new Graph(page);
  const onStart = g.start('A fresh set of sums');
  g.run(onStart, set(draft, PAIRS), set(draft, WORKING), set(sums, OPTIONS), ['action.resetVariables', { variables: [q, score, answered, given, typed, warn].map((v) => v.id) }], ['action.clock', { variable: seconds.id, op: 'start', mode: 'up', seconds: '0' }], announce('"Question 1 of " + sums.length + ": " + sums[0].t'));

  //Answering: typed (Check, or Enter in the box) or picked (an option); both end up in "given" and mark the same way
  const onCheck = g.click(check, 'Check the typed answer');
  g.run(onCheck, emit('check'));
  const onEnter = g.enterIn(input, 'Enter in the answer box checks it');
  g.run(onEnter, emit('check'));
  const onAsked = g.add('event.message', { name: 'check', onlyIf: '!answered' }, null, 'out', { note: 'Check the typed answer' });
  const canCheck = g.add('logic.if', { condition: 'typed.trim() != ""' }, onAsked);
  g.runFrom(canCheck, 'true', set(warn, 'false'), set(given, 'typed.trim()'), emit('mark'));
  g.runFrom(canCheck, 'false', set(warn, 'true'), announce('feedback'));
  const onPick = g.add('event.pointer', { target: option.id, type: 'click', onlyIf: '!answered' }, null, 'out', { note: 'Pick an option' });
  g.run(onPick, set(given, 'sums[q].opts[event.index]'), emit('mark'));
  const onMark = g.add('event.message', { name: 'mark', onlyIf: '!answered' }, null, 'out', { note: 'Mark the answer' });
  g.run(
    onMark,
    set(answered, 'true'),
    set(score, 'score + (correct ? 1 : 0)'),
    announce('feedback'),
    focus(next),
  );

  //On to the next question, or the results
  const onNext = g.add('event.pointer', { target: next.id, type: 'click', onlyIf: 'answered' }, null, 'out', { note: 'Next question' });
  const more = g.add('logic.if', { condition: 'q + 1 < sums.length' }, onNext);
  const stepped = g.runFrom(more, 'true', set(q, 'q + 1'), ['action.resetVariables', { variables: [answered, given, typed, warn].map((v) => v.id) }], announce('"Question " + (q + 1) + " of " + sums.length + ": " + sums[q].t'));
  const typing = g.add('logic.if', { condition: 'mode != "choose"' }, stepped);
  g.runFrom(typing, 'true', focus(input));
  g.runFrom(more, 'false', ['action.clock', { variable: seconds.id, op: 'pause' }], goNext());

  checklist.push(
    item('Choose the kind of sums: Project > Variables > "operation" is + (add), - (subtract), × (multiply), ÷ (divide) or mixed (add, subtract and multiply together)', sum, page),
    item('Set the range: "lowest" and "highest" are the smallest and largest numbers a sum uses (2 and 12 by default). Division sums use them for the answer, so 12 means answers up to 12', sum, page),
    item('Set how many sums: "howMany" (10 by default). The question counter and the progress bar follow it', where, page),
    item('Choose how learners answer: "mode" is type (a box and a Check button) or choose (four options to pick from, a grid the arrow keys move around). In the box, Enter checks the answer too: the On key (Enter) node in the Interactions tab has "Also while typing in a text box" ticked, which is what lets a key press in a box run a flow', input, page),
    item('Turn the clock off by setting "showTimer" to false', tally, page),
    item('Change the feedback ("Correct!", "Not quite...") and the message on the finished page: the "feedback" variable in the Variables tab, and the Result text on the Finished page', verdict, page),
  );

  //Finished
  const result = text(ctx, 'Result', 'You scored {score} out of {sums.length}', 112, 392, 800, { align: 'center', color: L.onGradient, fontSize: 28, fontWeight: 700 });
  const note = text(ctx, 'Result note', '{score == sums.length ? "A perfect score!" : score >= sums.length * 0.7 ? "Great work." : score >= sums.length * 0.4 ? "Good effort. Play again to improve." : "Keep practising, it gets quicker."}{showTimer ? "  Time: " + clock(seconds) : ""}', 112, 436, 800, { align: 'center', color: L.onGradient, fontSize: 20 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 500, 180);
  done.children.push(result, note, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Play again'), go(page));
  checklist.push(item('Change what the finished page says and the three ratings (they read the score)', note, done));

  //Notes for whoever edits the template, below the pages
  const below = (p: typeof page, x: number, w: number) => ({ x, y: p.height + 14, w, h: 84 });
  addNote(page, { ...below(page, 0, 440), text: '**Countdown / clock** One node counts the seconds up into `seconds` and stops when the last answer is in. It holds still if the learner leaves the page, with no timer or running flag to keep.', colour: 'sky' });
  addNote(page, { ...below(page, 456, 440), text: '**Live variables** `correct` and `feedback` are worked out from `given`, so a flow only sets what was given and the marking, the colours and the words follow.', colour: 'sky' });
  addNote(hero.page, { ...below(hero.page, 0, 440), text: '[ ] **Set the quiz up** in the Variables tab. Change `operation`, `lowest`, `highest` and `howMany` in the Variables tab. The sums use `randInt` and the wrong options use `shuffle`, so every play is a new set.', colour: 'gold' });

  return { project, checklist };
}

export const arithmeticQuiz: BrandedStarter = {
  key: 'games/arithmetic-quiz',
  set: 'games',
  name: 'Arithmetic quiz',
  description: 'Ten sums made fresh every play: pick the operation (or mix them) and the number range in variables, answer by typing or by choosing from four options, with a score, an optional clock, feedback after each answer and Play again for a new set.',
  tags: ['game', 'maths', 'variables', 'assessment'],
  build,
};
