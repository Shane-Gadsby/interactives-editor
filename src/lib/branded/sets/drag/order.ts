/** Put in order: six steps of a process to arrange, made with the question kit's ordering question (up and down buttons, so the keyboard works). */
import { walk, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, solid, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { bind, click, goPrevious, graph } from '../../graph-kit';
import { dressQuestion, endPage, goNextOn, heroPage } from './shared';

/** After a wrong check: the longest feedback, with the steps marked, so the card at its tallest is checked against the footer. */
export const ORDER_LAYOUT_STATES: LayoutState[] = [
  {
    label: 'checked, wrong',
    page: 'Activity',
    vars: { order_answered: true, order_locked: true, order_feedback: 'Out of tries. The right order is shown.' },
  },
];

const STEPS = ['Read and analyse the question', 'Research and take notes', 'Plan an outline', 'Write a first draft', 'Edit and proofread', 'Reference and submit'];

export function putInOrder(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Put in order');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Put in order', 'Arrange the steps of writing an assignment in the right order, then check.');
  const page = brandedPage(ctx, 'Writing an assignment', { name: 'Activity', footer: 'Arrange the steps, then check' });
  const results = endPage(ctx, 'Well done', 'You scored {order_score} of 6.', 'Try again');
  const box = contentBox(page);

  const id = addQuestion(project, page.id, 'ordering', { at: { x: box.x, y: box.y - 8 } })!;
  setQuestionSettings(project, page.id, id, {
    prefix: 'order',
    prompt: 'Put the steps of writing an assignment in order, using the arrows.',
    points: 6,
    shuffle: true,
    attempts: 3,
    options: STEPS.map((t, i) => ({ id: `o${i + 1}`, text: t })),
    hints: ['Think about what has to happen before you can write anything at all.'],
    feedbackCorrect: 'Correct. That is the order most writers work in.',
    feedbackPartial: 'Some steps are in the right place. Look at the ones marked wrong and try again.',
    feedbackIncorrect: 'Not quite. Think about what has to come before each step.',
    feedbackOutOfTries: 'Out of tries. The right order is shown.',
  });
  const frame = page.children.find((n) => n.id === id) as FrameNode;
  frame.name = 'Order question';

  //The kit builds it for the plain look; dress it in the brand without changing what it is made of
  dressQuestion(ctx, frame, box.width, { pad: 16, gap: 10 });
  walk(frame.children, (n: SceneNode) => {
    const part = partOf(n);
    if (n.type === 'button' && (part === 'moveUp' || part === 'moveDown')) {
      n.cornerRadius = 16;
      n.height = 28;
      n.fill = solid(L.surfaceMuted);
      n.stroke = null;
    }
    if (n.type === 'frame' && part === 'option') {
      n.cornerRadius = 20;
      n.height = 40;
      if (n.layout) n.layout.padding = { top: 6, right: 10, bottom: 6, left: 18 };
    }
    if (n.type === 'text' && part === 'prompt') Object.assign(n, { fontWeight: 700, fontSize: 18 });
    //the kit's gaps are roomy for six steps above a footer
    if (n.type === 'frame' && part === 'options' && n.layout) n.layout.gap = 6;
  });

  //After the question is finished, a way on to the results
  const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'order_locked' });
  const buttons = frame.children.find((n) => partOf(n) === 'buttons') as FrameNode;
  buttons.children.push(next);
  goNextOn(hero, start, 'Navigation');
  goNextOn(page, next, 'Navigation');
  {
    const g = graph(results.page);
    g.run(click(g, results.again, 'Try again'), goPrevious());
  }

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Ordering question** The steps are listed in their RIGHT order in the Question section; the learner sees them shuffled. The up and down buttons are real buttons, so the keyboard works without drag.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Results** The See results button shows once the question is finished (`order_locked`), and the results page reads `order_score`.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Write your question and steps, then set the points (the results say "of 6"), the hint and the number of tries.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Write your own question and list the steps in their RIGHT order (Question section in the inspector). The learner sees them shuffled', frame, page),
    item('Change the hint, the number of tries and how many points it is worth (the results page says "of 6")', frame, page),
    item('Rewrite the feedback messages for right, partly right, wrong and out of tries', frame, page),
    item('Change the results page text', results.result, results.page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  return { project, checklist };
}
