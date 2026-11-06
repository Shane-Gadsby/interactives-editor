import { createNode, type Artboard, type FrameNode, type LogicNode, type Question, type QuestionKind, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, card, contentBox, edge, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { after, announce, bind, brandQuestionFrame, click, go, graph, heroPage, variable } from './shared';

interface QuizQuestion {
  kind: QuestionKind;
  patch: Partial<Question>;
}

//Study skills, kept neutral and accurate. One of each kind the question kit makes for a quiz.
const QUESTIONS: QuizQuestion[] = [
  {
    kind: 'single',
    patch: {
      prompt: 'Which way of studying does research on memory support the most?',
      options: [
        { id: 'o1', text: 'Reading your notes again and again the night before' },
        { id: 'o2', text: 'Testing yourself on the material over several days', correct: true },
        { id: 'o3', text: 'Highlighting as much of the text as you can' },
        { id: 'o4', text: 'Studying one topic for six hours in a row' },
      ],
      hints: ['Think about what makes you pull an answer out of memory, rather than just look at it.'],
      hintPenalty: 0.5,
      feedbackCorrect: 'Yes. Quizzing yourself, spread over several days, helps you remember more than re-reading does.',
      feedbackIncorrect: 'Not quite. Re-reading and highlighting feel productive, but testing yourself over several days works better.',
    },
  },
  {
    kind: 'multiple',
    patch: {
      prompt: 'Which of these are good habits when planning an assignment? Select all that apply.',
      options: [
        { id: 'o1', text: 'Work backwards from the due date', correct: true },
        { id: 'o2', text: 'Break the task into smaller steps', correct: true },
        { id: 'o3', text: 'Start writing on the night before it is due' },
        { id: 'o4', text: 'Read the marking criteria early', correct: true },
      ],
      feedbackCorrect: 'Right. A plan with small steps and a clear target is much easier to keep to.',
      feedbackPartial: 'Part right. Some of the habits you chose help and some are missing.',
      feedbackIncorrect: 'Not quite. Leaving the writing to the last night is the one habit to avoid.',
    },
  },
  {
    kind: 'truefalse',
    patch: {
      prompt: 'True or false: short breaks during a long study session can help you stay focused.',
      options: [
        { id: 'o1', text: 'True', correct: true },
        { id: 'o2', text: 'False' },
      ],
      feedbackCorrect: 'True. A few minutes away from the desk now and then helps attention last.',
      feedbackIncorrect: 'It is true. A few minutes away from the desk now and then helps attention last.',
    },
  },
  {
    kind: 'blank',
    patch: {
      prompt: 'Complete the sentence.',
      blanks: [{ id: 'b1', label: 'Reviewing material at gradually longer intervals is called ____ practice.', answers: ['spaced', 'spacing'] }],
      hints: ['It describes how the reviews are spread out over time.'],
      hintPenalty: 0.5,
      feedbackCorrect: 'Yes, spaced practice.',
      feedbackIncorrect: 'Not quite. The answer is "spaced": the reviews are spread out over time.',
    },
  },
  {
    kind: 'ordering',
    patch: {
      prompt: 'Put the steps of a simple study plan in order.',
      options: [
        { id: 'o1', text: 'List everything you need to study' },
        { id: 'o2', text: 'Estimate how long each topic will take' },
        { id: 'o3', text: 'Block out study times in your calendar' },
        { id: 'o4', text: 'Review and adjust the plan each week' },
      ],
      shuffle: true,
      feedbackCorrect: 'That is the order. List, estimate, schedule, then keep adjusting.',
      feedbackIncorrect: 'Not quite. You cannot schedule the work until you know what it is and how long it takes.',
    },
  },
];

const OUT_OF = QUESTIONS.length;

export function buildQuiz(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Study skills quiz');
  const { project, L } = ctx;
  const box = (p: Artboard) => contentBox(p);

  //Variables the score page and the Results settings read
  const total = variable(project, 'total', 'number', 0);
  variable(project, 'outOf', 'number', OUT_OF);
  variable(project, 'passPercent', 'number', 60);
  variable(project, 'passMessage', 'string', 'You passed. You know your study skills well.');
  variable(project, 'failMessage', 'string', 'Not a pass this time. Have a look at the study skills pages, then try again.');

  const { page: hero, start } = heroPage(ctx, 'Study skills quiz', 'Five questions on planning and studying well. It takes about five minutes.', 'Start the quiz');
  const pages: Artboard[] = [];
  const frames: FrameNode[] = [];

  QUESTIONS.forEach((q, i) => {
    const n = i + 1;
    const page = brandedPage(ctx, `Question ${n}`, { footer: `Question ${n} of ${OUT_OF}` });
    const at = box(page);
    const id = addQuestion(project, page.id, q.kind, { at: { x: at.x, y: at.y } })!;
    setQuestionSettings(project, page.id, id, { ...q.patch, attempts: 1, points: 1, reveal: true, report: null });
    const frame = page.children.find((c) => c.id === id) as FrameNode;
    frame.width = at.width;
    frame.name = `Question ${n}`;
    frame.layout = { ...frame.layout!, padding: { top: 20, right: 24, bottom: 20, left: 24 } };
    //One check per question, so a wrong answer cannot be retried for a mark: the Try again button goes
    const reset = partsOf(frame).reset?.[0];
    const row = partsOf(frame).buttons?.[0] as FrameNode | undefined;
    if (reset && row) row.children = row.children.filter((x) => x.id !== reset.id);
    syncQuestion(project, page.id, id);
    brandQuestionFrame(ctx, frame);
    pages.push(page);
    frames.push(frame);
  });

  const result = brandedPage(ctx, 'Your result', { footer: 'Study skills quiz' });

  //Back and Next sit in the title row on every question page, so they are in the same place each time
  QUESTIONS.forEach((_, i) => {
    const page = pages[i];
    const prefix = `q${i + 1}`;
    const nextButton = button(ctx, 'Next button', i === OUT_OF - 1 ? 'See my score' : 'Next', page.width - 48 - 170, 30, 170);
    const backButton = button(ctx, 'Back button', 'Back', page.width - 48 - 170 - 12 - 110, 30, 110, false);
    bind(nextButton, { disabled: `!${prefix}_locked`, opacity: `${prefix}_locked ? 1 : 0.5` });
    page.children.push(backButton, nextButton);
    const g = graph(page);
    const toNext = click(g, nextButton, 'Navigation');
    g.run(toNext, go(i === OUT_OF - 1 ? result : pages[i + 1]));
    const toBack = click(g, backButton, 'Navigation');
    g.run(toBack, go(i === 0 ? hero : pages[i - 1]));

    //Add this question's score to the total once it is finished (right, or its one check used)
    const check = page.logic.nodes.find((x) => x.kit?.slot === 'check:action') as LogicNode;
    after(page, check, 'action.setVariable', { variable: total.id, op: 'add', value: `${prefix}_score` }, 'finished');

    //Coming back to a finished question keeps its answer; an unfinished one starts fresh
    const begin = page.logic.nodes.find((x) => x.kit?.slot === 'start:event') as LogicNode;
    const deal = page.logic.nodes.find((x) => x.kit?.slot === 'start:action') as LogicNode;
    page.logic.edges = page.logic.edges.filter((e) => !(e.from === begin.id && e.to === deal.id));
    const guard = after(page, begin, 'logic.if', { condition: `!${prefix}_locked` });
    guard.x = begin.x + 160;
    guard.y = begin.y + 55;
    page.logic.edges.push(edge(guard, deal, 'true'));
    guard.note = 'Only deal the question again when it is not finished';
  });

  //Hero: Start goes to question 1
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(pages[0]));
  }

  //The score page: the total, a pass or fail message from the variables, how each question went, Try again
  const body = box(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 250);
  const scoreLabel = text(ctx, 'Score label', 'Your score', body.x + 28, body.y + 26, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{Math.round(total * 10) / 10} / {outOf}', body.x + 28, body.y + 62, 330, { fontSize: 72, fontWeight: 700, lineHeight: 1.1 });
  const scorePercent = text(ctx, 'Score percent', '{Math.round(total / outOf * 100)}%', body.x + 28, body.y + 168, 330, { fontSize: 28, fontWeight: 600, color: L.muted });
  const passing = 'total / outOf * 100 >= passPercent';
  const message = bind(text(ctx, 'Result message', `{${passing} ? passMessage : failMessage}`, body.x + 420, body.y + 24, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 }), {
    color: `${passing} ? "${L.success}" : "${L.error}"`,
  });
  const again = button(ctx, 'Try again button', 'Try again', body.x + 420, body.y + 190, 170);
  result.children.push(scoreCard, scoreLabel, scoreText, scorePercent, message, again);
  const chipW = (body.width - 4 * 16) / 5;
  QUESTIONS.forEach((_, i) => {
    const prefix = `q${i + 1}`;
    const chip = createNode('frame', {
      name: `Question ${i + 1} result`,
      x: body.x + i * (chipW + 16),
      y: body.y + 286,
      width: chipW,
      height: 92,
      cornerRadius: 14,
      fill: solid(L.surface),
      stroke: stroke(L.border, 1.5),
      clip: false,
      role: 'region',
      children: [
        text(ctx, 'Chip title', `Question ${i + 1}`, 14, 14, chipW - 28, { fontSize: 15, fontWeight: 600, color: L.muted }),
        text(ctx, 'Chip result', `{${prefix}_score >= 1 ? "Right" : ${prefix}_score > 0 ? "Part right" : "Not right"}`, 14, 42, chipW - 28, { fontSize: 20, fontWeight: 700 }),
      ],
    });
    bind(chip, {
      'fill.color': `${prefix}_score >= 1 ? "${L.successSurface}" : ${prefix}_score > 0 ? "${L.warningSurface}" : "${L.errorSurface}"`,
      'stroke.paint.color': `${prefix}_score >= 1 ? "${L.success}" : ${prefix}_score > 0 ? "${L.warning}" : "${L.error}"`,
      ariaLabel: `"Question ${i + 1}: " + (${prefix}_score >= 1 ? "right" : ${prefix}_score > 0 ? "part right" : "not right")`,
    });
    result.children.push(chip);
  });
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    const arrive = g.event('event.start', {}, 'Score page');
    g.run(arrive, announce(`"You scored " + Math.round(total * 10) / 10 + " out of " + outOf + ". " + (${passing} ? passMessage : failMessage)`));
  }

  //Results settings: the total goes to StudyDesk when played from the Link for StudyDesk, complete on reaching the score page
  project.settings.reporting = { scoreVariable: total.id, maxScore: OUT_OF, passMark: 60, completion: 'artboard', completionArtboard: result.id };

  const checklist: TemplateChecklistItem[] = [
    item('Change the quiz title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    ...frames.map((f, i) => item(`Question ${i + 1}: write your own question, options and feedback (Question section in the inspector)`, f, pages[i])),
    item('Mark the right options in each question, and add or remove hints (Question section)', frames[0], pages[0]),
    item('To add a question: duplicate a question page and, in its Question section, give it a prefix of its own (q6) so it keeps its own score. Then fix its footer, and the Back and Next buttons of the pages either side', undefined, pages[1]),
    item('For a new question, copy the "add to total" Set variable node that follows Check answer in the Interactions tab, and point it at the new question\'s score (for q6, q6_score)', undefined, pages[0]),
    item(`Update the "Question n of ${OUT_OF}" footer on every page, and change the "outOf" variable (Variables tab) and Project > Results and progress > Top score to the new number of questions`, undefined, result),
    item('Reword the pass and fail messages: the passMessage and failMessage variables (Variables tab)', message, result),
    item('Change the pass mark: the passPercent variable, and Project > Results and progress > Pass mark (keep them the same)', scoreText, result),
    item('Check that the score is sent: Project > Results and progress should show the "total" variable as the score variable', undefined, result),
  ];
  return { project: ctx.project, checklist };
}

