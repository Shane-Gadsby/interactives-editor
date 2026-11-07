//Arithmetic quiz: ten sums made fresh every play (the operation and the range are variables), answered by typing or by picking from four options, with a score, an optional clock and Play again.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { BRAND_FONT } from '../../looks';
import { lookDefaults } from '../../../themes';
import { Graph, addVar, announce, bind, darkButton, emit, focus, go, heroPage, set, spreadPages } from './common';

//The sums, in three steps so each can be read: the numbers, then the working, then the four options
const PAIRS = 'Array.from({length: howMany}, (_) => ({a: lowest + Math.floor(Math.random() * (highest - lowest + 1)), b: lowest + Math.floor(Math.random() * (highest - lowest + 1)), o: operation == "mixed" ? ["+", "-", "×"][Math.floor(Math.random() * 3)] : operation, r: Math.random(), r2: Math.random()}))';
const WORKING = `draft.map(p => p.o == "+" ? {...p, t: p.a + " + " + p.b, ans: p.a + p.b} : p.o == "-" ? {...p, t: Math.max(p.a, p.b) + " − " + Math.min(p.a, p.b), ans: Math.abs(p.a - p.b)} : p.o == "÷" ? {...p, t: Math.max(1, p.a) * p.b + " ÷ " + Math.max(1, p.a), ans: p.b} : {...p, t: p.a + " × " + p.b, ans: p.a * p.b})`;
const OFFSETS = '[1, -1, 2, -2, 10, -10, 3, -3].filter(o => s.ans + o >= 0)';
const WRONG = `draft.map(s => ({...s, d: [...${OFFSETS}.slice(Math.floor(s.r * 3)), ...${OFFSETS}.slice(0, Math.floor(s.r * 3))].slice(0, 3).map(o => s.ans + o)}))`;
const OPTIONS = 'draft.map(s => ({t: s.t, ans: s.ans, opts: s.d.slice(0, Math.floor(s.r2 * 4)).concat([s.ans], s.d.slice(Math.floor(s.r2 * 4)))}))';
const CLOCK = 'Math.floor(seconds / 60) + ":" + pad(seconds % 60, 2)';

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
  const correct = addVar(project, 'correct', 'boolean', false);
  const feedback = addVar(project, 'feedback', 'string', '');
  const seconds = addVar(project, 'seconds', 'number', 0);
  const running = addVar(project, 'running', 'boolean', false);

  const hero = heroPage(ctx, 'Quick sums', 'Ten sums, made fresh every time. Work them out, see your score, and play again to beat it.');
  const page = brandedPage(ctx, 'Work it out', { footer: 'Question {Math.min(q + 1, sums.length)} of {sums.length}' });
  const done = brandedPage(ctx, 'All done', { kind: 'end', name: 'Finished' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(page));
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
  const check = bind(button(ctx, 'Check', 'Check', box.x + 316, box.y + 314, 150, true), { visible: 'mode != "choose"', disabled: 'answered', opacity: 'answered ? 0.5 : 1' });

  //Or pick from four options
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
  const options = createNode('frame', {
    name: 'Options',
    x: box.x,
    y: box.y + 306,
    width: 270 * 2 + 36,
    height: 60 * 2 + 16,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Answer options',
    repeat: { items: 'sums.length > 0 ? sums[q].opts : []', layout: 'grid', gap: 16, columns: 2 },
    children: [option],
    bindings: { visible: 'mode == "choose"' },
  });

  //The side: where you are, the score and clock, how it went, on to the next
  const sideX = box.x + panelW + 32;
  const sideW = box.width - panelW - 32;
  const where = heading(ctx, 'Where', 'Question {Math.min(q + 1, sums.length)} of {sums.length}', sideX, box.y, sideW, { fontSize: 22 });
  const track = createNode('rect', { name: 'Progress track', x: sideX, y: box.y + 44, width: sideW, height: 10, cornerRadius: 5, fill: solid(L.surfaceMuted), stroke: null, decorative: true });
  const bar = createNode('rect', { name: 'Progress bar', x: sideX, y: box.y + 44, width: 8, height: 10, cornerRadius: 5, fill: solid(L.button), stroke: null, decorative: true });
  bind(bar, { width: 'Math.max(8, ' + sideW + ' * (q + (answered ? 1 : 0)) / Math.max(1, sums.length))' });
  const tally = text(ctx, 'Tally', 'Score: {score}{showTimer ? "     Time: " + ' + CLOCK + ' : ""}', sideX, box.y + 72, sideW, { fontSize: 19, fontWeight: 700 });
  const verdict = bind(text(ctx, 'Feedback', '{feedback}', sideX, box.y + 126, sideW, { fontSize: 22, fontWeight: 700, lineHeight: 1.3, autoSize: 'none', height: 110 }), { color: `answered ? (correct ? "${L.success}" : "${L.error}") : "${L.text}"` });
  const next = bind(button(ctx, 'Next', 'Next question', sideX, box.y + box.height - 46, 220, true), { disabled: '!answered', opacity: 'answered ? 1 : 0.5', label: 'q + 1 >= sums.length ? "See results" : "Next question"' });
  page.children.push(panel, askText, sum, input, check, options, where, track, bar, tally, verdict, next);

  //Making the sums, each time the page opens
  const g = new Graph(page);
  const onStart = g.start('A fresh set of sums');
  g.run(onStart, set(draft, PAIRS), set(draft, WORKING), set(draft, WRONG), set(sums, OPTIONS), set(q, '0'), set(score, '0'), set(answered, 'false'), set(given, '""'), set(typed, '""'), set(feedback, '""'), set(seconds, '0'), set(running, 'true'), announce('"Question 1 of " + sums.length + ": " + sums[0].t'));
  const onTick = g.add('event.timer', { ms: 1000, repeat: true }, null, 'out', { note: 'Clock' });
  const ticking = g.add('logic.if', { condition: 'running' }, onTick);
  g.runFrom(ticking, 'true', ['action.setVariable', { variable: seconds.id, op: 'add', value: '1' }]);

  //Answering: typed (Check) or picked (an option); both end up in "given" and mark the same way
  const onCheck = g.click(check, 'Check the typed answer');
  const canCheck = g.add('logic.if', { condition: '!answered && typed.trim() != ""' }, onCheck);
  g.runFrom(canCheck, 'true', set(given, 'typed.trim()'), emit('mark'));
  const needs = g.add('logic.if', { condition: '!answered' }, canCheck, 'false', { dy: 110 });
  g.runFrom(needs, 'true', set(feedback, '"Type your answer first."'), announce('feedback'));
  const onPick = g.click(option, 'Pick an option');
  const open = g.add('logic.if', { condition: '!answered' }, onPick);
  g.runFrom(open, 'true', set(given, 'sums[q].opts[event.index]'), emit('mark'));
  const onMark = g.message('mark', 'Mark the answer');
  const fresh = g.add('logic.if', { condition: '!answered' }, onMark);
  g.runFrom(
    fresh,
    'true',
    set(answered, 'true'),
    set(correct, 'Number(given) == sums[q].ans'),
    set(score, 'score + (correct ? 1 : 0)'),
    set(feedback, 'correct ? "Correct!" : "Not quite. " + sums[q].t + " = " + sums[q].ans'),
    announce('feedback'),
    //a beat, so the Next button has switched on before it is given the focus
    ['action.delay', { ms: 60 }],
    focus(next),
  );

  //On to the next question, or the results
  const onNext = g.click(next, 'Next question');
  const ready = g.add('logic.if', { condition: 'answered' }, onNext);
  const more = g.add('logic.if', { condition: 'q + 1 < sums.length' }, ready, 'true');
  const stepped = g.runFrom(more, 'true', set(q, 'q + 1'), set(answered, 'false'), set(given, '""'), set(typed, '""'), set(feedback, '""'), announce('"Question " + (q + 1) + " of " + sums.length + ": " + sums[q].t'));
  const typing = g.add('logic.if', { condition: 'mode != "choose"' }, stepped);
  g.runFrom(typing, 'true', focus(input));
  g.runFrom(more, 'false', set(running, 'false'), go(done));

  checklist.push(
    item('Choose the kind of sums: Project > Variables > "operation" is + (add), - (subtract), × (multiply), ÷ (divide) or mixed (add, subtract and multiply together)', sum, page),
    item('Set the range: "lowest" and "highest" are the smallest and largest numbers a sum uses (2 and 12 by default). Division sums use them for the answer, so 12 means answers up to 12', sum, page),
    item('Set how many sums: "howMany" (10 by default). The question counter and the progress bar follow it', where, page),
    item('Choose how learners answer: "mode" is type (a box and a Check button) or choose (four options to pick from)', input, page),
    item('Turn the clock off by setting "showTimer" to false', tally, page),
    item('Change the feedback ("Correct!", "Not quite...") and the message on the finished page: the Mark the answer flow in the Interactions tab, and the Result text on the Finished page', verdict, page),
  );

  //Finished
  const result = text(ctx, 'Result', 'You scored {score} out of {sums.length}', 112, 392, 800, { align: 'center', color: L.onGradient, fontSize: 28, fontWeight: 700 });
  const note = text(ctx, 'Result note', '{score == sums.length ? "A perfect score!" : score >= sums.length * 0.7 ? "Great work." : score >= sums.length * 0.4 ? "Good effort. Play again to improve." : "Keep practising, it gets quicker."}{showTimer ? "  Time: " + ' + CLOCK + ' : ""}', 112, 436, 800, { align: 'center', color: L.onGradient, fontSize: 20 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 500, 180);
  done.children.push(result, note, replay);
  const dg = new Graph(done);
  dg.run(dg.click(replay, 'Play again'), go(page));
  checklist.push(item('Change what the finished page says and the three ratings (they read the score)', note, done));

  spreadPages(project);
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
