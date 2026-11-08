import { createNode, defaultAutoLayout, type Artboard, type FrameNode, type Question, type QuestionKind, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../../question-kit';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, brandQuestionFrame, click, goNext, graph, heroPage, noteBelow, questionNav, scorePage, variable } from './shared';

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


export function buildQuiz(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Study skills quiz');
  const { project, L } = ctx;
  const box = (p: Artboard) => contentBox(p);

  //The pass and fail wording the score page picks from. The score, the total and the pass mark come from the quiz itself (`quiz.score`, `quiz.max`, `quiz.passed`)
  variable(project, 'passMessage', 'string', 'You passed. You know your study skills well.');
  variable(project, 'failMessage', 'string', 'Not a pass this time. Have a look at the study skills pages, then try again.');

  const { page: hero, start } = heroPage(ctx, 'Study skills quiz', 'Five questions on planning and studying well. It takes about five minutes.', 'Start the quiz');
  const pages: Artboard[] = [];
  const frames: FrameNode[] = [];

  QUESTIONS.forEach((q, i) => {
    const n = i + 1;
    //The footer counts the question pages from the page order, so adding a page needs no retyping
    const page = brandedPage(ctx, `Question ${n}`, { footer: 'Question {pageNumber - 1} of {pageCount - 2}' });
    const at = box(page);
    const id = addQuestion(project, page.id, q.kind, { at: { x: at.x, y: at.y } })!;
    //One check per question, kept when the page is come back to, and no Try again: a wrong answer cannot be retried for a mark
    setQuestionSettings(project, page.id, id, { ...q.patch, attempts: 1, points: 1, reveal: true, report: null, keep: true, hideReset: true });
    const frame = page.children.find((c) => c.id === id) as FrameNode;
    frame.width = at.width;
    frame.name = `Question ${n}`;
    frame.layout = { ...frame.layout!, padding: { top: 20, right: 24, bottom: 20, left: 24 } };
    brandQuestionFrame(ctx, frame);
    pages.push(page);
    frames.push(frame);
  });

  const result = brandedPage(ctx, 'Your result', { footer: 'Study skills quiz' });

  //Back and Next sit in the title row on every question page, so they are in the same place each time
  QUESTIONS.forEach((_, i) => questionNav(ctx, pages[i], `q${i + 1}`));

  //Hero: Start goes to question 1
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  //The score page: the quiz's own total and pass, how each question went (one tile for each question the quiz holds), Try again
  const passing = 'quiz.passed';
  const again = button(ctx, 'Try again button', 'Try again', 0, 0, 170);
  const chip = createNode('frame', {
    name: 'Question result',
    x: 0,
    y: 0,
    width: 100,
    height: 92,
    cornerRadius: 14,
    fill: solid(L.surface),
    stroke: stroke(L.border, 1.5),
    clip: false,
    role: 'region',
    layoutItem: { width: 'fill' },
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 14, right: 14, bottom: 14, left: 14 }, align: 'stretch', hugHeight: true },
    children: [
      text(ctx, 'Chip title', '{item.page}', 0, 0, 100, { fontSize: 15, fontWeight: 600, color: L.muted }),
      text(ctx, 'Chip result', '{item.score >= item.points ? "Right" : item.score > 0 ? "Part right" : "Not right"}', 0, 0, 100, { fontSize: 20, fontWeight: 700 }),
    ],
  } as never);
  bind(chip, {
    'fill.color': `item.score >= item.points ? "${L.successSurface}" : item.score > 0 ? "${L.warningSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `item.score >= item.points ? "${L.success}" : item.score > 0 ? "${L.warning}" : "${L.error}"`,
    ariaLabel: 'item.page + ": " + (item.score >= item.points ? "right" : item.score > 0 ? "part right" : "not right")',
  });
  //one tile for each question: the repeater runs over the quiz's own list, so a question added to the project adds a tile
  const tiles = createNode('frame', {
    name: 'Question results',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: 'How each question went',
    layout: { ...defaultAutoLayout('row'), gap: 16, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'quiz.questions', layout: 'none', gap: 0, columns: 1 },
    children: [chip],
  } as never);
  const { message } = scorePage(ctx, result, {
    label: 'Your score',
    score: '{Math.round(quiz.score * 10) / 10} / {quiz.max}',
    scoreSize: 72,
    lines: [text(ctx, 'Score percent', '{Math.round(quiz.percent)}%', 0, 0, 100, { fontSize: 28, fontWeight: 600, color: L.muted })],
    message: `{${passing} ? passMessage : failMessage}`,
    messageColor: `${passing} ? "${L.success}" : "${L.error}"`,
    buttons: [again],
    below: [tiles],
  });
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    const arrive = g.event('event.start', {}, 'Score page');
    g.run(arrive, announce(`"You scored " + Math.round(quiz.score * 10) / 10 + " out of " + quiz.max + ". " + (${passing} ? passMessage : failMessage)`));
  }

  //Results settings: the total of all the questions goes to StudyDesk when played from the Link for StudyDesk, complete on reaching the score page
  project.settings.reporting = { scoreFrom: 'questions', passMark: 60, completion: 'artboard', completionArtboard: result.id };

  noteBelow(hero, { text: '**Quiz totals** The score page reads the quiz\'s own `quiz.score`, `quiz.max` and `quiz.passed`, and Results takes the score from the questions. There is no total to add up or copy per question.', colour: 'sky' });
  noteBelow(pages[0], { text: '**Keep the answer** and **Hide Try again** are on in each question\'s settings: coming Back finds a finished question as it was, and a wrong answer cannot be retried for a mark.', colour: 'sky' });
  noteBelow(pages[0], { x: 456, text: '[ ] To add a question, duplicate a question page and make its question independent. The footer, the Next button and the score page follow the page order by themselves.', colour: 'gold' });
  noteBelow(result, { text: '**Repeater** One tile for each entry of `quiz.questions`, so the tiles follow the questions. [ ] Pass mark: Project > Results and progress (60%).', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the quiz title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    ...frames.map((f, i) => item(`Question ${i + 1}: write your own question, options and feedback (Question section in the inspector)`, f, pages[i])),
    item('Mark the right options in each question, and add or remove hints (Question section)', frames[0], pages[0]),
    item('To add a question: duplicate a question page and, in its Question section, press Make this one independent so it keeps its own score. The footer, Back and Next, the total and the tiles on the score page all follow the page order and the questions', undefined, pages[1]),
    item('Reword the pass and fail messages: the passMessage and failMessage variables (Variables tab)', message, result),
    item('Change the pass mark: Project > Results and progress > Pass mark. The score page and the score sent to StudyDesk both read it', undefined, result),
    item('Check that the score is sent: Project > Results and progress should show Score from: Total of all questions', undefined, result),
  ];
  return { project: ctx.project, checklist };
}
