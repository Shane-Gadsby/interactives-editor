/** Sort into groups: eight cards to drag into three groups, a right or wrong drop each time, a live count and Try again. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, boxText, endPage, goButton, heroPage, join, put, seq } from './shared';

const GROUPS: { name: string; tag: string }[] = [
  { name: 'Solid', tag: 'solid' },
  { name: 'Liquid', tag: 'liquid' },
  { name: 'Gas', tag: 'gas' },
];
//The cards in the order they sit in the tray: the word, then the group it goes in
const CARDS: [string, string][] = [
  ['Water vapour', 'gas'],
  ['Brick', 'solid'],
  ['Honey', 'liquid'],
  ['Oxygen', 'gas'],
  ['Ice cube', 'solid'],
  ['Orange juice', 'liquid'],
  ['Wooden chair', 'solid'],
  ['Helium', 'gas'],
];

export function sortIntoGroups(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Sort into groups');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Sort into groups', 'Drag each card into the group it belongs to. You will see straight away whether it fits.');
  const page = brandedPage(ctx, 'Solid, liquid or gas?', { name: 'Activity', footer: 'Drag each card into a group' });
  const results = endPage(ctx, 'All sorted', 'You sorted all eight cards.', 'Try again');
  const box = contentBox(page);

  const lists = GROUPS.map((g) => addVar(project, `${g.tag}Cards`, 'list', '[]'));
  const misses = addVar(project, 'misses', 'number', 0);
  const message = addVar(project, 'message', 'string', '');
  const total = lists.map((v) => `${v.name}.length`).join(' + ');

  const prompt = text(ctx, 'Prompt', 'Drag each card into the group it belongs to.', box.x, box.y - 4, box.width, { fontSize: 16, color: L.muted });
  page.children.push(prompt);

  const groupW = 296;
  const zones: SceneNode[] = GROUPS.map((g, i) =>
    createNode('frame', {
      name: g.name,
      x: box.x + i * (groupW + 20),
      y: box.y + 28,
      width: groupW,
      height: 200,
      cornerRadius: 16,
      fill: solid(L.surface),
      stroke: { paint: solid(L.muted), width: 2, dash: [8, 5] },
      clip: false,
      dropZone: { accepts: [g.tag], snap: 'none', label: g.name, contentsVariable: lists[i].id },
      children: [boxText(ctx, `${g.name} heading`, g.name, 20, 12, groupW - 40, 36, { fontSize: 22, fontWeight: 700, align: 'center' })],
    })
  );
  page.children.push(...zones);

  const cards: SceneNode[] = CARDS.map(([word, tag], i) =>
    createNode('frame', {
      name: word,
      x: box.x + (i % 4) * 156,
      y: box.y + 270 + Math.floor(i / 4) * 56,
      width: 136,
      height: 40,
      cornerRadius: 20,
      fill: solid(L.background),
      stroke: stroke(L.text, 2),
      clip: false,
      shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
      draggable: { tags: [tag], onMiss: 'return', label: word },
      ariaLabel: word,
      children: [boxText(ctx, `${word} text`, word, 6, 0, 124, 40, { fontSize: 15, fontWeight: 600, align: 'center' })],
    })
  );
  page.children.push(...cards);

  const count = text(ctx, 'Count', `Sorted {${total}} of ${CARDS.length}`, 700, box.y + 270, 276, { fontSize: 22, fontWeight: 700 });
  const wrong = text(ctx, 'Wrong drops', 'Wrong drops: {misses}', 700, box.y + 304, 276, { fontSize: 16, color: L.muted });
  const feedback = text(ctx, 'Feedback', '{message}', box.x, box.y + 390, 620, { fontSize: 20, fontWeight: 600, bindings: { visible: 'message != ""' } });
  const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a card, press Space to pick it up, use the arrow keys to choose a group and Space to drop it.', box.x, box.y + 432, 620, { fontSize: 14, color: L.muted });
  const next = button(ctx, 'See results button', 'See results', 700, box.y + 346, 200);
  next.bindings = { visible: `${total} == ${CARDS.length}` };
  const again = button(ctx, 'Try again button', 'Try again', 700, box.y + 400, 200, false);
  page.children.push(count, wrong, feedback, keys, next, again);
  results.result.text = 'You sorted all eight cards with {misses} wrong {misses == 1 ? "drop" : "drops"}.';

  //A card taken by a group, and one a group refused
  const ok = seq(page, 0, ['event.drop', { result: 'accepted' }, 'Sorting'], ['action.setVariable', { variable: message.id, op: 'set', value: 'event.layer + " goes in " + event.zone + ". Right."' }]);
  const done = put(page, 'logic.if', 520, 0, { condition: `${total} == ${CARDS.length}` });
  const finished = put(page, 'action.setVariable', 780, -60, { variable: message.id, op: 'set', value: `"All ${CARDS.length} sorted. Well done!"` });
  const sayDone = put(page, 'action.announce', 1040, -60, { text: 'message' });
  join(page, ok[1], done);
  join(page, done, finished, 'true');
  join(page, finished, sayDone);
  seq(
    page,
    170,
    ['event.drop', { result: 'rejected' }, 'Sorting'],
    ['action.setVariable', { variable: misses.id, op: 'add', value: '1' }],
    ['action.setVariable', { variable: message.id, op: 'set', value: 'event.layer + " does not go in " + event.zone + ". Try another group."' }],
    ['action.announce', { text: 'message' }]
  );

  //Starting the page, and Try again, put everything back
  const reset: [string, Record<string, unknown>][] = [['action.dragReset', {}], ['action.setVariable', { variable: misses.id, op: 'set', value: '0' }], ['action.setVariable', { variable: message.id, op: 'set', value: '""' }]];
  seq(page, 340, ['event.start', {}, 'Start over'], ...reset);
  seq(page, 480, ['event.pointer', { target: again.id, type: 'click' }, 'Try again'], ...reset);

  goButton(hero, start, page, 0);
  goButton(page, next, results.page, 620);
  goButton(results.page, results.again, page, 0);

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title, the instruction and the footer text', byName(page, 'Page title'), page),
    item('Rename the three groups: the box name, the heading inside it and its Name read out (Drop zone section)', zones[0], page),
    item('Type your own cards and set each one\'s group: its Tags (Draggable section) must match the Takes tags of its group. Also change the Text alternative so screen readers hear it', cards[0], page),
    item(`To add a card: duplicate one and fix the "of ${CARDS.length}" in the count, the See results button and the If node in the Interactions tab`, count, page),
    item('Rewrite the messages for a right drop, a wrong drop and finishing (Interactions tab)', feedback, page),
    item('Change the results page text', results.result, results.page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  return { project, checklist };
}
