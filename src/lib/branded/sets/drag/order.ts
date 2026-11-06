/** Put in order: six steps of a process to arrange, made with the question kit's ordering question (up and down buttons, so the keyboard works). */
import { walk, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partOf, setQuestionSettings } from '../../../question-kit';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke } from '../../kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { endPage, goButton, heroPage } from './shared';

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
    prompt: 'Put the steps of writing an assignment in order. Use the arrows to move a step up or down.',
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

  //The kit builds it for the plain look; dress it in the brand without changing what it is made of
  frame.width = box.width;
  frame.cornerRadius = 16;
  frame.fill = solid(L.surface);
  const layout = frame.layout!;
  layout.padding = { top: 16, right: 24, bottom: 16, left: 24 };
  layout.gap = 10;
  walk(frame.children, (n: SceneNode) => {
    if (n.type === 'text' || n.type === 'button') n.fontFamily = BRAND_FONT;
    if (n.type === 'button') {
      const part = partOf(n);
      n.cornerRadius = part === 'moveUp' || part === 'moveDown' ? 16 : 22;
      if (part === 'check') {
        n.fill = solid(L.button);
        n.color = L.onButton;
      } else if (part !== 'moveUp' && part !== 'moveDown') {
        n.fill = solid(L.background);
        n.color = L.text;
        n.stroke = stroke(L.border);
      }
      if (part === 'moveUp' || part === 'moveDown') n.height = 30;
    }
    if (n.type === 'frame' && partOf(n) === 'option') {
      n.cornerRadius = 22;
      n.height = 44;
      if (n.layout) n.layout.padding = { top: 6, right: 10, bottom: 6, left: 18 };
    }
    if (n.type === 'text' && partOf(n) === 'prompt') n.fontWeight = 700;
  });

  //After the question is finished, a way on to the results
  const next = button(ctx, 'See results button', 'See results', box.x, box.y + box.height - 40, 200);
  next.bindings = { visible: 'order_locked' };
  const buttons = frame.children.find((n) => partOf(n) === 'buttons') as FrameNode;
  buttons.children.push(next);
  goButton(page, next, results.page, 700);
  goButton(hero, start, page, 0);
  goButton(results.page, results.again, page, 0);

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
