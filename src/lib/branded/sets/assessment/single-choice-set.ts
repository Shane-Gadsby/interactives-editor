import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, item, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { whenTrue } from './gate';
import { announce, bind, click, go, graph, heroPage, panel, setVar, variable } from './shared';

//Study skills again, neutral and short: three options each, one right (answer is the position of the right one, from 0).
const QUESTIONS = [
  { q: 'What is the best first step when you get an assignment?', options: ['Start writing the introduction', 'Read the task and the marking criteria', 'Search for a template to copy'], answer: 1, why: 'The task and the criteria say what is being asked and how it is marked. Everything else follows from them.' },
  { q: 'Spaced practice means...', options: ['studying a little, often, over several days', 'studying for one very long session', 'studying only after the due date is set'], answer: 0, why: 'Spreading study over days gives your memory time to settle, which helps you remember more than one long session.' },
  { q: 'Which is a good way to test yourself?', options: ['Re-read your notes once more', 'Close the book and write what you remember', 'Highlight the whole page'], answer: 1, why: 'Pulling an answer out of memory is what builds memory. Re-reading and highlighting only feel like learning.' },
  { q: 'A paraphrase still needs...', options: ['a reference to where the idea came from', 'no reference, it is your own words', 'quotation marks around every word'], answer: 0, why: 'Putting an idea in your own words does not make it your idea. Reference the source.' },
  { q: 'When is a short break most useful?', options: ['Before you have started', 'Part-way through a long session', 'Only once everything is finished'], answer: 1, why: 'A few minutes away from the desk during a long session helps your attention last.' },
  { q: 'Which note-taking habit helps you most?', options: ['Writing down every word you hear', 'Writing key ideas in your own words', 'Copying slides exactly'], answer: 1, why: 'Choosing and rewording the key ideas makes you think about the material, so you remember it better.' },
  { q: 'You are stuck on a question. What is a good move?', options: ['Give up on the course', 'Ask your teacher or tutor', 'Guess and never check'], answer: 1, why: 'Asking early is part of learning. Your teacher, tutor or the library can help you get unstuck.' },
  { q: 'What helps you to start a big task?', options: ['Wait until you feel ready', 'Break it into small steps', 'Do it all in one go'], answer: 1, why: 'A small first step is easy to begin, and the next one is easier. Waiting to feel ready often means not starting.' },
];

//The pause after a right answer before the next question comes up
const FLASH_MS = 1000;
const PICKS = [0, 1, 2];

export function buildSingleChoiceSet(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Single choice set');
  const { project, L } = ctx;
  const N = QUESTIONS.length;

  variable(project, 'questions', 'list', QUESTIONS);
  const index = variable(project, 'index', 'number', 0);
  const locked = variable(project, 'locked', 'boolean', false);
  const choice = variable(project, 'choice', 'number', -1);
  const lastRight = variable(project, 'lastRight', 'boolean', false);
  const score = variable(project, 'score', 'number', 0);
  variable(project, 'messageHigh', 'string', 'Excellent. Those habits will serve you well.');
  variable(project, 'messageMid', 'string', 'A good start. Have another go and see if you can beat your score.');
  variable(project, 'messageLow', 'string', 'Have another look at the explanations, then try again.');

  const { page: hero, start } = heroPage(ctx, 'Single choice set', `${N} quick questions, one at a time, three answers each. Get it right and it moves on by itself.`, 'Start');
  const play = brandedPage(ctx, 'Quick questions', { footer: 'Question {index + 1} of {questions.length}. Score: {score}' });
  const result = brandedPage(ctx, 'Your score', { footer: 'Single choice set' });
  const box = contentBox(play);

  //Progress as a row of dots
  const prog = text(ctx, 'Progress', 'Question {index + 1} of {questions.length}', box.x, box.y, 400, { fontSize: 16, fontWeight: 600, color: L.muted });
  const track = createNode('rect', { name: 'Progress track', x: box.x, y: box.y + 30, width: box.width, height: 10, cornerRadius: 5, fill: { type: 'solid', color: L.surfaceMuted }, stroke: null, decorative: true } as never);
  const fill = createNode('rect', { name: 'Progress fill', x: box.x, y: box.y + 30, width: 0, height: 10, cornerRadius: 5, fill: { type: 'solid', color: L.accent }, stroke: null, decorative: true, bindings: { width: `(index + (locked ? 1 : 0)) / questions.length * ${box.width}` } } as never);
  const questionCard = card(ctx, 'Question card', box.x, box.y + 56, box.width, 100);
  const question = text(ctx, 'Question', '{questions[index].q}', box.x + 32, box.y + 84, box.width - 64, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  play.children.push(prog, track, fill, questionCard, question);

  //The three answers, full width, one under the other
  const answers = PICKS.map((i) => {
    const b = button(ctx, `Answer ${i + 1}`, `Answer ${i + 1}`, box.x, box.y + 176 + i * 62, box.width, false);
    Object.assign(b, { height: 52, cornerRadius: 14, fontSize: 18 });
    const right = `locked && questions[index].answer == ${i}`;
    const wrongPick = `locked && choice == ${i} && questions[index].answer != ${i}`;
    bind(b, {
      label: `(${right} ? "✓  " : ${wrongPick} ? "✗  " : "") + questions[index].options[${i}]`,
      disabled: 'locked',
      opacity: `locked && !(${right}) && !(${wrongPick}) ? 0.5 : 1`,
      'fill.color': `${right} ? "${L.successSurface}" : ${wrongPick} ? "${L.errorSurface}" : "${L.background}"`,
      'stroke.paint.color': `${right} ? "${L.success}" : ${wrongPick} ? "${L.error}" : "${L.border}"`,
      ariaDescription: `${right} ? "Right answer" : ${wrongPick} ? "Wrong" : ""`,
    });
    return b;
  });
  //The feedback flash: a short line for a right answer, the explanation for a wrong one
  const flashText = text(ctx, 'Feedback text', '{lastRight ? "✓ Correct" : "✗ Not quite. " + questions[index].why}', 20, 14, box.width - 40 - 190, { fontSize: 17, fontWeight: 600, lineHeight: 1.3 });
  const flash = bind(panel(ctx, 'Feedback', box.x, box.y + 176 + 3 * 62, box.width, 74, [flashText], { role: 'region', stroke: stroke(L.border, 2) }), {
    visible: 'locked',
    'fill.color': `lastRight ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `lastRight ? "${L.success}" : "${L.error}"`,
    ariaLabel: '(lastRight ? "Correct" : "Not quite. " + questions[index].why)',
  });
  const next = bind(button(ctx, 'Next button', 'Next question', box.x + box.width - 190 - 12, box.y + 176 + 3 * 62 + 14, 190), {
    visible: 'locked && !lastRight',
    label: 'index >= questions.length - 1 ? "See my score" : "Next question"',
  });
  play.children.push(...answers, flash, next);

  {
    const g = graph(play);
    PICKS.forEach((i) => {
      const ev = click(g, answers[i], `Answer ${i + 1}`);
      const open = g.then(ev, 'logic.if', { condition: `!locked && questions[index].options.length > ${i}` });
      const set = whenTrue(
        g,
        open,
        setVar(locked, 'true'),
        setVar(choice, String(i)),
        setVar(lastRight, `questions[index].answer == ${i}`),
        setVar(score, 'lastRight ? 1 : 0', 'add'),
        announce('(lastRight ? "Correct." : "Not quite. The right answer was " + questions[index].options[questions[index].answer] + ". " + questions[index].why)'),
      );
      //Right: wait a moment, then on to the next question (or the score)
      const right = g.then(set, 'logic.if', { condition: 'lastRight' });
      const waited = g.then(right, 'action.delay', { ms: FLASH_MS }, 'true');
      const last = g.then(waited, 'logic.if', { condition: 'index >= questions.length - 1' });
      g.then(last, ...go(result), 'true');
      g.run(g.then(last, ...setVar(index, '1', 'add'), 'false'), setVar(locked, 'false'), setVar(choice, '-1'), announce('"Question " + (index + 1) + " of " + questions.length + ": " + questions[index].q'));
    });
    const ev = click(g, next, 'Next question');
    const last = g.then(ev, 'logic.if', { condition: 'index >= questions.length - 1' });
    g.then(last, ...go(result), 'true');
    g.run(g.then(last, ...setVar(index, '1', 'add'), 'false'), setVar(locked, 'false'), setVar(choice, '-1'), announce('"Question " + (index + 1) + " of " + questions.length + ": " + questions[index].q'));
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(play));
  }

  //The score page
  const body = contentBox(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 230);
  const scoreLabel = text(ctx, 'Score label', 'Your score', body.x + 28, body.y + 26, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{score} / {questions.length}', body.x + 28, body.y + 62, 330, { fontSize: 72, fontWeight: 700, lineHeight: 1.1 });
  const scorePercent = text(ctx, 'Score percent', '{Math.round(score / questions.length * 100)}%', body.x + 28, body.y + 160, 330, { fontSize: 28, fontWeight: 600, color: L.muted });
  const message = text(ctx, 'Result message', '{score / questions.length >= 0.75 ? messageHigh : score / questions.length >= 0.5 ? messageMid : messageLow}', body.x + 420, body.y + 24, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const again = button(ctx, 'Try again button', 'Try again', body.x + 420, body.y + 170, 170);
  result.children.push(scoreCard, scoreLabel, scoreText, scorePercent, message, again);
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Score page'), announce('"You scored " + score + " out of " + questions.length + ". " + (score / questions.length >= 0.75 ? messageHigh : score / questions.length >= 0.5 ? messageMid : messageLow)'));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your own questions: the "questions" variable (Variables tab) is a list with, for each, q (the question), options (three answers), answer (the number of the right one, counting from 0) and why (the explanation shown after a wrong answer). Keep those four names in each entry', question, play),
    item(`Add or remove questions in that list: the progress bar, the "Question n of ${N}" footer, the score and the result all follow its length`, undefined, play),
    item('Change how long a right answer stays on screen before it moves on: the Wait node (Interactions tab) after each Answer button\'s right branch, in milliseconds', answers[0], play),
    item('Reword the three score messages: the messageHigh, messageMid and messageLow variables (Variables tab)', message, result),
    item('Try it with the keyboard: Tab to an answer and press Enter', undefined, play),
  ];
  return { project, checklist };
}
