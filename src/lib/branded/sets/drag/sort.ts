/**
 * Sort into groups: eight cards to drag into three groups, made with the question kit's categorise question. Every drop says right
 * or wrong without using a try (Item dropped), wrong drops are counted, and Check answer marks the lot.
 */
import { walk, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, text, todo, type LayoutState } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { addVar, after, bind, click, goPrevious, graph } from '../../graph-kit';
import { dressQuestion, endPage, goNextOn, graphNote, heroPage, kitNode, retray } from './shared';
import { extrasChecklist, extrasShort, questionExtras } from '\.\./\.\./parts';

const GROUPS: { id: string; name: string }[] = [
  { id: 'g1', name: 'Solid' },
  { id: 'g2', name: 'Liquid' },
  { id: 'g3', name: 'Gas' },
];
//The cards: the word, then the id of the group it goes in
const CARDS: [string, string][] = [
  ['Water vapour', 'g3'],
  ['Brick', 'g1'],
  ['Honey', 'g2'],
  ['Oxygen', 'g3'],
  ['Ice cube', 'g1'],
  ['Orange juice', 'g2'],
  ['Wooden chair', 'g1'],
  ['Helium', 'g3'],
];

/** After a check: every card in the wrong group, with the right group named, so the longest feedback shows. */
export const SORT_LAYOUT_STATES: LayoutState[] = [
  {
    label: 'checked, all wrong',
    page: 'Activity',
    vars: {
      sort_answered: true,
      sort_locked: true,
      sort_feedback: '0 of 8 in the right group. Out of tries. Where each card goes is shown below.',
      sort_items: CARDS.map(([word], i) => ({ id: `c${i + 1}`, text: word, number: i + 1, selected: false, state: 'wrong', answer: 'Liquid' })),
    },
  },
];

export function sortIntoGroups(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Sort into groups');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Sort into groups', 'Drag each card into the group it belongs to. You will see straight away whether it fits.');
  const page = brandedPage(ctx, 'Solid, liquid or gas?', { name: 'Activity', footer: 'Wrong drops: {misses}' });
  const results = endPage(ctx, 'All sorted', 'You put {sort_score} of ' + CARDS.length + ' cards in the right group, with {misses} wrong {misses == 1 ? "drop" : "drops"} on the way.', 'Try again');
  const box = contentBox(page);

  const misses = addVar(project, 'misses', 'number', 0);

  const id = addQuestion(project, page.id, 'categorise', { at: { x: box.x, y: box.y - 8 }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
  setQuestionSettings(project, page.id, id, {
    prefix: 'sort',
    prompt: 'Drag each card into the group it belongs to.',
    points: CARDS.length,
    shuffle: true,
    attempts: 3,
    dropFeedback: true,
    groups: GROUPS,
    cards: CARDS.map(([word, group], i) => ({ id: `c${i + 1}`, text: word, group })),
    hints: ['Ask yourself: can you pour it, does it keep its shape, or does it spread to fill any container?'],
    feedbackCorrect: 'All eight are in the right group. Well done!',
    feedbackPartial: 'Move the cards marked wrong and check again.',
    feedbackIncorrect: 'Not quite. Move the cards marked wrong and check again.',
    feedbackOutOfTries: 'Out of tries. Where each card goes is shown below.',
    reveal: true,
    report: null,
  });
  const frame = page.children.find((n) => n.id === id) as FrameNode;
  frame.name = 'Sort question';
  dressQuestion(ctx, frame, box.width, { pad: 14, gap: 8 });

  //Shorter groups and the cards four to a row, so the question, its feedback and its buttons all sit above the footer
  const parts = partsOf(frame);
  for (const z of parts.catZone) {
    z.height = 104;
    //the kit names a group after the sample it started from, and a layer after its place in the list
    const g = GROUPS.find((x) => z.questionPart === `catZone:${x.id}`)!;
    z.name = g.name;
    for (const h of (z as FrameNode).children) h.name = `${g.name} heading`;
  }
  retray(parts.cardTray[0], 4, 150, 40, 12);
  for (const c of parts.catCard) {
    const word = c.ariaLabel ?? c.name;
    c.name = word;
    for (const t of (c as FrameNode).children) t.name = `${word} text`;
  }
  walk(frame.children, (n: SceneNode) => {
    if (n.type === 'text' && n.questionPart === 'prompt') n.fontSize = 18;
  });
  //How to do it from the keyboard, under the question
  const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a card, press Space to pick it up, use the arrow keys to choose a group and Space to drop it.', 0, 0, 100, { fontSize: 14, color: L.muted });
  frame.children.splice(1, 0, keys);

  //Results: a way on once the question is finished
  const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'sort_locked' });
  (parts.buttons[0] as FrameNode).children.push(next);

  goNextOn(hero, start, 'Navigation');
  goNextOn(page, next, 'Navigation');
  {
    const g = graph(results.page);
    g.run(click(g, results.again, 'Try again'), goPrevious());
  }

  //A wrong drop is counted, and starting the page (or Try again) puts the count back with the question
  const counted = page.logic.nodes.filter((x) => x.kind === 'action.questionDrop').map((n) => after(page, n, 'action.setVariable', { variable: misses.id, op: 'add', value: '1' }, 'wrong'));
  for (const slot of ['start:action', 'reset:action']) {
    const n = page.logic.nodes.find((x) => x.kit?.slot === slot);
    if (n) after(page, n, 'action.resetVariables', { variables: [misses.id] });
  }
  graphNote(page, { anchor: kitNode(page, 'drop:g1:event'), colour: 'sky', text: '**One drop flow for each group,** wired by the question: Item dropped says right or wrong as the card lands, without using a try. A new group in the Question section gets its own.' });
  graphNote(page, { anchor: counted[0], colour: 'sky', text: '**Only the Wrong output counts.** It adds 1 to `misses`, and Start and Try again put it back to 0 beside the question\'s own reset, so a retry starts clean.' });
  graphNote(page, { anchor: kitNode(page, 'start:event'), colour: 'sky', text: '**The question kit wired Start, Check, Hint and Try again.** Check marks every card at once, so a card moved after a drop is still marked where it ended up.' });

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Categorise question** The groups, the cards and which group each belongs to are settings of the question (Question section). Add a card or a group there and its layers appear, wired.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Item dropped** Each drop says right or wrong as it lands, without using a try. The wrong ones are counted in `misses` for the results page.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Rename the groups and cards in the Question section, then set the points (the results say "of 8") and the number of tries.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    todo('Write your groups and cards', 'Write your groups and cards: the Question section of the inspector lists each group and each card with the group it belongs in. The layers follow what you type', frame, page),
    todo('Write the hint, feedback, tries and points', 'Write the hint, the feedback messages, the number of tries and the points (the results page says "of 8", so change it with the points)', frame, page),
    todo('Rewrite what a wrong drop says', 'Rewrite what a wrong drop says: the card\'s own feedback line in the Question section', parts.catCard[0], page),
    item('Change the results page text', results.result, results.page),
    todo('Try it with the keyboard only', 'Try it with the keyboard: Tab to a card, Space, arrow keys, Space, then Check answer', undefined, page),
    todo('Pick a colourway (the brand parts are locked)', 'Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  checklist.push(todo(extrasShort({ hint: true, tryAgain: true }), extrasChecklist({ hint: true, tryAgain: true })));
  return { project, checklist };
}
