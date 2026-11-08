import { createNode, defaultAutoLayout, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, edge, item, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { stack } from '../../parts';
import { after, bankQuestion, bind, click, goNext, graph, heroPage, kitNode, noteBelow, scorePage, variable } from './shared';

//Study skills again, neutral and short: three options each, one right (correct is the place of the right one, counting from 1).
const QUESTIONS = [
  { prompt: 'What is the best first step when you get an assignment?', options: ['Start writing the introduction', 'Read the task and the marking criteria', 'Search for a template to copy'], correct: 2, explain: 'The task and the criteria say what is being asked and how it is marked. Everything else follows from them.' },
  { prompt: 'Spaced practice means...', options: ['studying a little, often, over several days', 'studying for one very long session', 'studying only after the due date is set'], correct: 1, explain: 'Spreading study over days gives your memory time to settle, which helps you remember more than one long session.' },
  { prompt: 'Which is a good way to test yourself?', options: ['Re-read your notes once more', 'Close the book and write what you remember', 'Highlight the whole page'], correct: 2, explain: 'Pulling an answer out of memory is what builds memory. Re-reading and highlighting only feel like learning.' },
  { prompt: 'A paraphrase still needs...', options: ['a reference to where the idea came from', 'no reference, it is your own words', 'quotation marks around every word'], correct: 1, explain: 'Putting an idea in your own words does not make it your idea. Reference the source.' },
  { prompt: 'When is a short break most useful?', options: ['Before you have started', 'Part-way through a long session', 'Only once everything is finished'], correct: 2, explain: 'A few minutes away from the desk during a long session helps your attention last.' },
  { prompt: 'Which note-taking habit helps you most?', options: ['Writing down every word you hear', 'Writing key ideas in your own words', 'Copying slides exactly'], correct: 2, explain: 'Choosing and rewording the key ideas makes you think about the material, so you remember it better.' },
  { prompt: 'You are stuck on a question. What is a good move?', options: ['Give up on the course', 'Ask your teacher or tutor', 'Guess and never check'], correct: 2, explain: 'Asking early is part of learning. Your teacher, tutor or the library can help you get unstuck.' },
  { prompt: 'What helps you to start a big task?', options: ['Wait until you feel ready', 'Break it into small steps', 'Do it all in one go'], correct: 2, explain: 'A small first step is easy to begin, and the next one is easier. Waiting to feel ready often means not starting.' },
];

//The pause after a right answer before the next question comes up
const FLASH_MS = 1000;

/** A wrong answer with a long explanation on the play page, and the score page, so the layout check sees the fullest they get. */
export const SINGLE_CHOICE_LAYOUT_STATES: LayoutState[] = [
  { label: 'wrong answer', page: 'Quick questions', vars: { q1_bankIndex: 7, q1_answered: true, q1_locked: true, q1_correct: false, q1_feedback: '✗ Not quite', q1_setCount: 8, q1_setLeft: 5, q1_setPos: 3, q1_setScore: 2 } },
  { label: 'all missed', page: 'Your score', vars: { q1_missed: [0, 1, 2, 3, 4, 5, 6, 7], q1_setScore: 4, q1_setMax: 8 } },
];

export function buildSingleChoiceSet(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Single choice set');
  const { project, L } = ctx;
  const N = QUESTIONS.length;

  variable(project, 'questions', 'list', QUESTIONS);
  variable(project, 'messageHigh', 'string', 'Excellent. Those habits will serve you well.');
  variable(project, 'messageMid', 'string', 'A good start. Have another go and see if you can beat your score.');
  variable(project, 'messageLow', 'string', 'Have another look at the explanations, then try again.');

  const { page: hero, start } = heroPage(ctx, 'Single choice set', `${N} quick questions, one at a time, three answers each. Get it right and it moves on by itself.`, 'Start');
  const play = brandedPage(ctx, 'Quick questions', { footer: 'Question {q1_setPos} of {q1_setCount}. Score: {q1_setScore}' });
  const result = brandedPage(ctx, 'Your score', { footer: 'Single choice set' });

  //The questions are the rows of a bank gone through once. A right answer waits a moment and moves on; a wrong one stays, with its explanation and a Next button
  const { frame, P, check } = bankQuestion(ctx, project, play, {
    kind: 'single',
    name: 'Quick question',
    items: 'questions',
    noun: 'question',
    progressLabel: 'Questions answered',
    explain: (P) => `questions[${P}_bankIndex].explain`,
    explainWhen: (P) => `${P}_answered && !${P}_correct`,
    nextWhen: (P) => `${P}_locked && !${P}_correct`,
    patch: { prompt: QUESTIONS[0].prompt, options: QUESTIONS[0].options.map((t, i) => ({ id: `o${i + 1}`, text: t, ...(i + 1 === QUESTIONS[0].correct ? { correct: true } : {}) })), feedbackCorrect: '✓ Correct', feedbackIncorrect: '✗ Not quite' },
  });
  //Right: wait a moment, then the kit's own Next (which goes on to the score page after the last question)
  const wait = after(play, check, 'action.delay', { ms: FLASH_MS }, 'correct');
  play.logic.edges.push(edge(wait, kitNode(play, 'reset:action')));
  {
    const gh = graph(hero);
    gh.run(click(gh, start, 'Navigation'), goNext());
  }

  //The score page
  variable(project, 'message', 'string', '', { formula: `band(${P}_setMax > 0 ? ${P}_setScore / ${P}_setMax : 0, [0.75, 0.5], [messageHigh, messageMid, messageLow])`, live: true });
  const reviewHeading = bind(text(ctx, 'Review heading', 'Questions to look at again', 0, 0, 100, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 2 }), { visible: `${P}_missed.length > 0` });
  const line = text(ctx, 'Review question', '•  {item.prompt}', 0, 0, 100, { fontSize: 15, lineHeight: 1.25, autoSize: 'height' });
  const reviewList = createNode('frame', {
    name: 'Review list',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: `${P}_missed.map(i => questions[i])`, layout: 'none', gap: 0, columns: 1 },
    children: [line],
  });
  const box = contentBox(result);
  const review = stack('Review', 0, 0, box.width, { gap: 8, children: [reviewHeading, reviewList] });
  const again = button(ctx, 'Try again button', 'Try again', 0, 0, 170);
  const missedBtn = bind(button(ctx, 'Missed button', 'Practise the missed ones', 0, 0, 250, false), { visible: `${P}_missed.length > 0` });
  scorePage(ctx, result, {
    label: 'Your score',
    score: `{${P}_setScore} / {${P}_setMax}`,
    scoreSize: 72,
    lines: [text(ctx, 'Score percent', `{Math.round(${P}_setScore / ${P}_setMax * 100)}%`, 0, 0, 100, { fontSize: 28, fontWeight: 600, color: L.muted })],
    message: '{message}',
    buttons: [again, missedBtn],
    below: [review],
  });
  {
    const gr = graph(result);
    gr.run(click(gr, again, 'Try again'), ['action.startOver', {}]);
    gr.run(click(gr, missedBtn, 'Practise the missed ones'), ['action.questionReset', { question: frame.id, run: 'missed' }], ['action.artboard', { to: 'previous', transition: 'fade', duration: 250 }]);
    gr.run(gr.event('event.start', {}, 'Score page'), ['action.announce', { text: `"You scored " + ${P}_setScore + " out of " + ${P}_setMax + ". " + message`, politeness: 'polite' }]);
  }

  noteBelow(play, { text: '**Question bank** The questions are the rows of the `questions` list, asked once each. Picking an answer checks it. A right one waits a moment (the Wait node, in milliseconds) and moves on by itself.', colour: 'sky' });
  noteBelow(play, { x: 456, text: '[ ] Keep each answer short: the three options are rows of one question, so a long one wraps and pushes the Next button down.', colour: 'gold' });
  noteBelow(result, { text: '**Live variable** `message` is banded from the score, so the heading and the announcement read the same words. [ ] Reword the three messages in the Variables tab.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your own questions: the "questions" variable (Variables tab) is a list with, for each, a prompt that is the question text, options (three answers), correct (the number of the right one, counting from 1) and explain (the explanation shown after a wrong answer). Keep those four names in each entry', frame, play),
    item(`Add or remove questions in that list: the progress bar, the "Question n of ${N}" footer, the score and the result all follow its length`, undefined, play),
    item('Change how long a right answer stays on screen before it moves on: the Wait node (Interactions tab) after Check answer\'s "right" output, in milliseconds', undefined, play),
    item('Reword the three score messages: the messageHigh, messageMid and messageLow variables (Variables tab)', byName(result, 'Result message'), result),
    item('Try it with the keyboard: Tab to an answer and press Enter', undefined, play),
  ];
  return { project, checklist };
}
