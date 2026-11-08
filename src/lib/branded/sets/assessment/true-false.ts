import { createNode, defaultAutoLayout, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { stack } from '../../parts';
import { bankQuestion, bind, click, goNext, graph, graphNote, heroPage, kitNode, noteBelow, scorePage, variable } from './shared';

//Academic integrity, kept general: nothing here states a particular university's rules.
//Each row is a question bank row: prompt, correct (true or false) and explain (shown after the answer).
const STATEMENTS = [
  { prompt: 'Putting someone else\'s idea into your own words without saying where it came from is still plagiarism.', correct: true, explain: 'Plagiarism is using someone\'s words or ideas without credit, however you phrase them. Reference the source of an idea as well as a quotation.' },
  { prompt: 'You only need to reference direct quotations.', correct: false, explain: 'Paraphrased ideas, data, images and figures need a reference too, not just the words you quote.' },
  { prompt: 'Two students may share the answers to an individual assignment if they both agree to it.', correct: false, explain: 'Agreement between students does not change the rules. An individual assignment has to be your own work unless the task says otherwise.' },
  { prompt: 'Talking through a topic with classmates before you write your own answer is usually fine.', correct: true, explain: 'Discussing ideas is part of learning. Then write your answer yourself, in your own words, unless your course says otherwise.' },
  { prompt: 'Changing a few words in a paragraph you found online makes it your own writing.', correct: false, explain: 'Swapping a few words is not paraphrasing. Rewrite the idea properly, and reference where it came from.' },
  { prompt: 'Handing in work you already submitted in another course, without asking, can break the rules.', correct: true, explain: 'Work that has already been assessed is not new work. Ask your teacher before you reuse any of it.' },
  { prompt: 'A reference manager means you no longer need to check your reference list.', correct: false, explain: 'Tools save time on formatting but they can get details wrong. Check each reference against the referencing guide.' },
  { prompt: 'If you are not sure whether something needs a reference, asking your teacher is a good idea.', correct: true, explain: 'Asking is always better than guessing. Your teacher or the library can help you work it out.' },
];

/** The play page with a long statement answered wrong, and the result page with every statement missed, so the layout check sees the fullest they get. */
export const TRUE_FALSE_LAYOUT_STATES: LayoutState[] = [
  { label: 'long statement answered', page: 'True or false', vars: { q1_bankIndex: 2, q1_prompt: STATEMENTS[2].prompt + ' ' + STATEMENTS[0].prompt, q1_answered: true, q1_locked: true, q1_correct: false, q1_feedback: '✗ Not quite', q1_setCount: 8, q1_setLeft: 4, q1_setPos: 4, q1_setScore: 3 } },
  { label: 'all missed', page: 'Your result', vars: { q1_missed: [0, 1, 2, 3, 4, 5, 6, 7], q1_setScore: 0, q1_setMax: 8 } },
];

export function buildTrueFalse(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'True or false: academic integrity');
  const { project } = ctx;
  const N = STATEMENTS.length;

  variable(project, 'statements', 'list', STATEMENTS);
  variable(project, 'messageHigh', 'string', 'Great work. You know your way around academic integrity.');
  variable(project, 'messageMid', 'string', 'A good start. Look again at the statements below.');
  variable(project, 'messageLow', 'string', 'Have another look at the explanations, then try again.');

  const { page: hero, start } = heroPage(ctx, 'Academic integrity: true or false?', `Eight statements, one at a time. Say whether each is true or false and see why straight away.`, 'Start');
  const play = brandedPage(ctx, 'True or false', { footer: 'Statement {q1_setPos} of {q1_setCount}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'True or false: academic integrity' });

  //The statements are the rows of a question bank that is gone through once: the question kit keeps the position, the score and the missed list
  const box = contentBox(play);
  const { frame, P, check } = bankQuestion(ctx, project, play, {
    kind: 'truefalse',
    name: 'Statement question',
    items: 'statements',
    noun: 'statement',
    progressLabel: 'Statements answered',
    explain: (P) => `statements[${P}_bankIndex].explain`,
    patch: { prompt: STATEMENTS[0].prompt, feedbackCorrect: '✓ Correct', feedbackIncorrect: '✗ Not quite' },
  });
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }
  graphNote(play, { anchor: kitNode(play, 'start:event'), colour: 'sky', text: '**The question kit wired Start, Choose option and Next.** Next is the kit\'s Try again button, relabelled: it deals the next statement, and its Done output goes on to the result page.' });
  graphNote(play, { anchor: check, colour: 'sky', text: '**Check answer follows Choose option,** so True or False marks the statement at once. Take that node out and bring the Check button back for a two step answer.' });

  //The result page: the score from the run, a message banded from it, and the statements to look at again
  variable(project, 'message', 'string', '', { formula: `band(${P}_setMax > 0 ? ${P}_setScore / ${P}_setMax : 0, [0.75, 0.5], [messageHigh, messageMid, messageLow])`, live: true });
  const reviewHeading = bind(text(ctx, 'Review heading', 'Statements to look at again', 0, 0, 100, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 2 }), { visible: `${P}_missed.length > 0` });
  const line = text(ctx, 'Review statement', '•  {item.prompt}', 0, 0, 100, { fontSize: 15, lineHeight: 1.25, autoSize: 'height' });
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
    repeat: { items: `${P}_missed.map(i => statements[i])`, layout: 'none', gap: 0, columns: 1 },
    children: [line],
  });
  const review = stack('Review', 0, 0, box.width, { gap: 8, children: [reviewHeading, reviewList] });
  const tryAgain = button(ctx, 'Try again button', 'Try again', 0, 0, 170);
  const missedBtn = bind(button(ctx, 'Missed button', 'Practise the missed ones', 0, 0, 250, false), { visible: `${P}_missed.length > 0` });
  scorePage(ctx, result, {
    label: 'Your tally',
    score: `{${P}_setScore} of {${P}_setMax}`,
    caption: 'statements right first time',
    message: '{message}',
    buttons: [tryAgain, missedBtn],
    below: [review],
  });
  {
    const g = graph(result);
    g.run(click(g, tryAgain, 'Try again'), ['action.startOver', {}]);
    //Only the statements missed are asked again: the kit draws a run from the missed list, and the page before shows the first
    const missedClick = click(g, missedBtn, 'Practise the missed ones');
    g.run(missedClick, ['action.questionReset', { question: frame.id, run: 'missed' }], ['action.artboard', { to: 'previous', transition: 'fade', duration: 250 }]);
    const arrive = g.event('event.start', {}, 'Result page');
    g.run(arrive, ['action.announce', { text: `"You got " + ${P}_setScore + " of " + ${P}_setMax + " right. " + message`, politeness: 'polite' }]);
    graphNote(result, { anchor: missedClick, colour: 'sky', text: '**Practise the missed ones** runs the question again over only the rows got wrong (`run: missed`), then goes back a page to show the first of them.' });
    graphNote(result, { anchor: arrive, colour: 'sky', text: '**Read aloud as the page opens,** from `message`, the same live variable as the heading, so a screen reader hears what the screen says.' });
  }

  noteBelow(play, { text: '**Question bank** The statements are the rows of the `statements` list, asked once each. The question kit keeps the position, the score and the missed list for you (the `q1_set...` variables), so there is no counter to maintain.', colour: 'sky' });
  noteBelow(play, { x: 456, text: 'Picking True or False **checks at once**: the Choose option node is followed by Check answer. Delete that node and bring back the Check button for a two step answer.', colour: 'sky' });
  noteBelow(result, { text: '**Live variable** `message` is banded from the score, so the heading and the announcement read the same words. [ ] Reword the three messages in the Variables tab.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your own statements: the "statements" variable (Variables tab) is a list, one entry per statement, with its prompt, correct (true or false) and the explanation shown afterwards. Keep those three names in each entry', frame, play),
    item(`Add or remove statements in that list: the progress bar, the "Statement n of ${N}" footer, the tally and the result all follow its length`, undefined, play),
    item('Reword the three result messages: the messageHigh, messageMid and messageLow variables (Variables tab)', byName(result, 'Result message'), result),
    item('Ask only some of them, in a random order: select the question and, under Take the question from data, set Questions to draw and Random', frame, play),
    item('Change the colours for the whole piece with the Themes tab: the colourways are already set up', undefined, play),
  ];
  return { project, checklist };
}

