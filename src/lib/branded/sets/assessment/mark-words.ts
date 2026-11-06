import { createNode, defaultAutoLayout, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { type Colourway } from '../../looks';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text } from '../../kit';
import { announce, bind, click, go, graph, heroPage, setVar, variable } from './shared';

//A word between asterisks is one the learner should mark; the asterisks themselves never show.
const PASSAGE = 'Maya *opened* her laptop, *read* the assignment brief and *planned* her week. She *wrote* a first draft on Monday and *asked* her tutor for feedback.';
const RULE = 'Click every verb (an action or doing word) in the passage.';

//Every word of the passage as a row: its text, whether it is a right one, and whether the learner has picked it
const WORDS = 'passage.split(" ").map((w, i) => ({text: w.replaceAll("*", ""), right: w.includes("*"), picked: picked.includes(i)}))';

//A chip is as wide as its letters (and the mark after a checked word) need: text in a repeated copy is not measured by the player
const CHIP_WIDTH = 'Math.max(20, (item.text.length + (checked && (item.picked || item.right) ? 2 : 0)) * 12.6)';

export function buildMarkWords(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Mark the words');
  const { project, L } = ctx;

  variable(project, 'passage', 'string', PASSAGE);
  variable(project, 'rule', 'string', RULE);
  const picked = variable(project, 'picked', 'list', []);
  const checked = variable(project, 'checked', 'boolean', false);
  const found = variable(project, 'found', 'number', 0);
  const wrong = variable(project, 'wrong', 'number', 0);
  const totalRight = variable(project, 'totalRight', 'number', 0);

  const { page: hero, start } = heroPage(ctx, 'Mark the words', 'Read a short passage and click the words that fit the rule. Then check your marks and see your score.', 'Start');
  const page = brandedPage(ctx, 'Mark the words', { name: 'Passage', footer: '{checked ? "Score: " + Math.max(0, found - wrong) + " out of " + totalRight : picked.length + " words marked"}' });
  const box = contentBox(page);

  const rule = text(ctx, 'Rule', '{rule}', box.x, box.y, box.width, { fontSize: 20, fontWeight: 600, role: 'heading', headingLevel: 2 });

  //The passage is a repeater over the words: each one is a chip that toggles when clicked, or on Enter or Space
  const chipText = createNode('text', {
    name: 'Word text',
    text: '{item.text + (checked ? (item.picked ? (item.right ? " ✓" : " ✗") : (item.right ? " ←" : "")) : "")}',
    fontSize: 22,
    color: L.text,
    fontFamily: 'Open Sans',
    align: 'left',
    wrap: false,
    width: 220,
    height: 30,
    x: 14,
    y: 7,
    decorative: true,
  });
  bind(chipText, { color: `!checked && item.picked ? "${L.onButton}" : "${L.text}"` });
  const chip = createNode('frame', {
    name: 'Word',
    width: 80,
    height: 44,
    cornerRadius: 10,
    fill: solid(L.background),
    stroke: stroke(L.border, 2),
    clip: false,
    role: 'checkbox',
    focusable: true,
    cursor: 'pointer',
    children: [chipText],
  }) as FrameNode;
  bind(chip, {
    width: `${CHIP_WIDTH} + 28`,
    ariaChecked: 'item.picked',
    ariaLabel: 'item.text',
    ariaDescription: 'checked ? (item.picked ? (item.right ? "Right" : "Wrong") : (item.right ? "Missed" : "")) : ""',
    'fill.color': `checked ? (item.picked ? (item.right ? "${L.successSurface}" : "${L.errorSurface}") : (item.right ? "${L.warningSurface}" : "${L.background}")) : (item.picked ? "${L.button}" : "${L.background}")`,
    'stroke.paint.color': `checked ? (item.picked ? (item.right ? "${L.success}" : "${L.error}") : (item.right ? "${L.warning}" : "${L.border}")) : (item.picked ? "${L.button}" : "${L.border}")`,
  });
  const passage = createNode('frame', {
    name: 'Passage',
    x: box.x,
    y: box.y + 44,
    width: box.width,
    height: 200,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'The passage. Each word is a checkbox.',
    layout: { ...defaultAutoLayout('row'), gap: 8, crossGap: 10, padding: { top: 28, right: 28, bottom: 28, left: 28 }, align: 'start', wrap: true, hugHeight: true },
    repeat: { items: WORDS, layout: 'none', gap: 0, columns: 1 },
    children: [chip],
  }) as FrameNode;

  const buttonsY = box.y + 44 + 270;
  const check = bind(button(ctx, 'Check button', 'Check', box.x, buttonsY, 140), { disabled: 'checked', opacity: 'checked ? 0.5 : 1' });
  const again = bind(button(ctx, 'Try again button', 'Try again', box.x + 154, buttonsY, 160, false), { visible: 'checked' });
  const score = bind(text(ctx, 'Score', 'Score: {Math.max(0, found - wrong)} out of {totalRight}', box.x + 340, buttonsY - 2, box.width - 340, { fontSize: 24, fontWeight: 700 }), { visible: 'checked' });
  const detail = bind(text(ctx, 'Score detail', 'You found {found} of the {totalRight} right words and marked {wrong} wrong. Each wrong word takes one point off.', box.x + 340, buttonsY + 32, box.width - 340, { fontSize: 16, color: L.muted }), { visible: 'checked' });
  const legend = bind(text(ctx, 'Legend', '✓ a right word you found     ✗ marked, but not a right word     ← a right word you missed', box.x, buttonsY + 88, box.width, { fontSize: 15, color: L.muted }), { visible: 'checked' });
  page.children.push(rule, passage, check, again, score, detail, legend);

  {
    const g = graph(page);
    //Clicking a word toggles its place in the picked list, until the answers are checked
    const onWord = g.event('event.pointer', { target: chip.id, type: 'click' }, 'Pick a word');
    const open = g.then(onWord, 'logic.if', { condition: '!checked' });
    const has = g.then(open, 'logic.if', { condition: 'picked.includes(event.index)' }, 'true');
    g.then(has, 'action.setVariable', { variable: picked.id, op: 'remove', value: 'picked.indexOf(event.index)' }, 'true');
    g.then(has, 'action.setVariable', { variable: picked.id, op: 'push', value: 'event.index' }, 'false');

    const onCheck = click(g, check, 'Check');
    g.run(
      onCheck,
      setVar(found, `${WORDS}.filter(w => w.picked && w.right).length`),
      setVar(wrong, `${WORDS}.filter(w => w.picked && !w.right).length`),
      setVar(totalRight, `${WORDS}.filter(w => w.right).length`),
      setVar(checked, 'true'),
      announce('"You found " + found + " of " + totalRight + " right words and marked " + wrong + " wrong. Score " + Math.max(0, found - wrong) + " out of " + totalRight + "."'),
    );
    const onAgain = click(g, again, 'Try again');
    g.run(onAgain, ['action.setVariable', { variable: picked.id, op: 'clear' }], setVar(checked, 'false'), setVar(found, '0'), setVar(wrong, '0'), setVar(totalRight, '0'));
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(page));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    item('Write your own passage: the "passage" variable (Variables tab). Put an asterisk on each side of every word the learner should mark, like *opened*. The asterisks never show. Separate words with single spaces, and any punctuation stuck to a word counts as part of that word', passage, page),
    item('Say what to mark: the "rule" variable (Variables tab), for example "Click every noun in the passage."', rule, page),
    item('Check the Preview: the words wrap into lines by themselves, so a longer or shorter passage needs no other change (the passage panel grows with it)', passage, page),
    item('Change how a wrong word is scored: the "Score" text on the page takes the wrong words off the found ones, and the Check button\'s nodes in the Interactions tab count them', score, page),
    item('Reword the legend that explains the ✓, ✗ and ← marks if you change what they mean', legend, page),
  ];
  return { project, checklist };
}
