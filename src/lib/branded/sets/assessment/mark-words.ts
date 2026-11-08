import { createNode, defaultAutoLayout, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { type Colourway } from '../../looks';
import { BRAND_FONT } from '../../looks';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type LayoutState } from '../../kit';
import { stack } from '../../parts';
import { bind, click, goNext, graph, graphNote, heroPage, noteBelow, variable } from './shared';

//A word between asterisks is one the learner should mark; the asterisks themselves never show.
const PASSAGE = 'Maya *opened* her laptop, *read* the assignment brief and *planned* her week. She *wrote* a first draft on Monday and *asked* her tutor for feedback.';
const RULE = 'Click every verb (an action or doing word) in the passage.';

/** Checked with every word picked, so the marks widen the chips and the score lines show: the fullest the page gets with the sample passage. */
export const MARK_WORDS_LAYOUT_STATES: LayoutState[] = [
  { label: 'checked', page: 'Passage', vars: { checked: true, picked: Array.from({ length: 28 }, (_, i) => i) } },
];

export function buildMarkWords(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Mark the words');
  const { project, L } = ctx;

  variable(project, 'passage', 'string', PASSAGE);
  variable(project, 'rule', 'string', RULE);
  const picked = variable(project, 'picked', 'list', []);
  const checked = variable(project, 'checked', 'boolean', false);
  //Live variables: every word of the passage as a row (its text, whether it is a right one, whether it is picked), and the score from the picks as they are made
  variable(project, 'words', 'list', [], { formula: 'passage.split(" ").map((w, i) => ({text: w.replaceAll("*", ""), right: w.includes("*"), picked: picked.includes(i)}))', live: true });
  variable(project, 'found', 'number', 0, { formula: 'words.filter(w => w.picked && w.right).length', live: true });
  variable(project, 'wrong', 'number', 0, { formula: 'words.filter(w => w.picked && !w.right).length', live: true });
  variable(project, 'totalRight', 'number', 0, { formula: 'words.filter(w => w.right).length', live: true });
  variable(project, 'score', 'number', 0, { formula: 'Math.max(0, found - wrong)', live: true });

  const { page: hero, start } = heroPage(ctx, 'Mark the words', 'Read a short passage and click the words that fit the rule. Then check your marks and see your score.', 'Start');
  const page = brandedPage(ctx, 'Mark the words', { name: 'Passage', footer: '{checked ? "Score: " + score + " out of " + totalRight : picked.length + " words marked"}' });
  const box = contentBox(page);

  const rule = text(ctx, 'Rule', '{rule}', 0, 0, box.width, { fontSize: 20, fontWeight: 600, role: 'heading', headingLevel: 2 });

  //The passage is a repeater over the words: each one is a chip that is as wide as its word (the player measures the text in every copy) and toggles when clicked, or on Enter or Space
  const chipText = createNode('text', {
    name: 'Word text',
    text: '{item.text + (checked ? (item.picked ? (item.right ? " ✓" : " ✗") : (item.right ? " ←" : "")) : "")}',
    fontSize: 22,
    color: L.text,
    fontFamily: BRAND_FONT,
    align: 'left',
    wrap: false,
    autoSize: 'width',
    width: 40,
    height: 30,
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
    layout: { ...defaultAutoLayout('row'), gap: 0, padding: { top: 7, right: 14, bottom: 7, left: 14 }, align: 'center', hugWidth: true, hugHeight: true },
    children: [chipText],
  }) as FrameNode;
  bind(chip, {
    ariaChecked: 'item.picked',
    ariaLabel: 'item.text',
    ariaDescription: 'checked ? (item.picked ? (item.right ? "Right" : "Wrong") : (item.right ? "Missed" : "")) : ""',
    'fill.color': `checked ? (item.picked ? (item.right ? "${L.successSurface}" : "${L.errorSurface}") : (item.right ? "${L.warningSurface}" : "${L.background}")) : (item.picked ? "${L.button}" : "${L.background}")`,
    'stroke.paint.color': `checked ? (item.picked ? (item.right ? "${L.success}" : "${L.error}") : (item.right ? "${L.warning}" : "${L.border}")) : (item.picked ? "${L.primary}" : "${L.border}")`,
  });
  const passage = createNode('frame', {
    name: 'Passage',
    x: 0,
    y: 0,
    width: box.width,
    height: 200,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'The passage. Each word is a checkbox.',
    layout: { ...defaultAutoLayout('row'), gap: 8, crossGap: 10, padding: { top: 28, right: 28, bottom: 28, left: 28 }, align: 'start', wrap: true, hugHeight: true },
    repeat: { items: 'words', layout: 'none', gap: 0, columns: 1 },
    //one Tab stop for the passage, the arrow keys move from word to word
    keyNav: { mode: 'list', orientation: 'horizontal' },
    children: [chip],
  } as never) as FrameNode;

  const check = bind(button(ctx, 'Check button', 'Check answer', 0, 0, 170), { disabled: 'checked' });
  const again = bind(button(ctx, 'Try again button', 'Try again', 0, 0, 160, false), { visible: 'checked' });
  const actions = stack('Actions', 0, 0, box.width, { direction: 'row', gap: 14, align: 'center', children: [check, again] });
  const scoreText = text(ctx, 'Score', 'Score: {score} out of {totalRight}', 0, 0, 100, { fontSize: 24, fontWeight: 700 });
  const detail = text(ctx, 'Score detail', 'You found {found} of the {totalRight} right words and marked {wrong} wrong. Each wrong word takes one point off.', 0, 0, 100, { fontSize: 16, color: L.muted });
  const legend = text(ctx, 'Legend', '✓ a right word you found     ✗ marked, but not a right word     ← a right word you missed', 0, 0, 100, { fontSize: 15, color: L.muted });
  const results = bind(stack('Results', 0, 0, box.width, { gap: 4, children: [scoreText, detail, legend] }), { visible: 'checked' });
  page.children.push(stack('Mark body', box.x, box.y, box.width, { gap: 14, children: [rule, passage, actions, results] }));

  {
    const g = graph(page);
    //Clicking a word toggles its place in the picked list, until the answers are checked
    const onWord = g.event('event.pointer', { target: chip.id, type: 'click', onlyIf: '!checked' }, 'Pick a word');
    g.run(onWord, ['action.setVariable', { variable: picked.id, op: 'toggleItem', value: 'event.index' }]);
    const checkClick = click(g, check, 'Check');
    g.run(checkClick, ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }], ['action.announce', { text: '"You found " + found + " of " + totalRight + " right words and marked " + wrong + " wrong. Score " + score + " out of " + totalRight + "."', politeness: 'polite' }]);
    const againClick = click(g, again, 'Try again');
    g.run(againClick, ['action.resetVariables', { variables: [picked.id, checked.id] }]);
    graphNote(page, { anchor: onWord, colour: 'sky', text: '**One flow serves every word.** `event.index` is the word pressed and `toggleItem` adds or takes it out of `picked`. *Only if* `!checked` stops picking once the answer is marked.' });
    graphNote(page, { anchor: checkClick, colour: 'sky', text: '**Check only sets `checked`.** The ticks, crosses and the score are live variables worked out from `picked`, so there is no marking in this graph.' });
    graphNote(page, { anchor: againClick, colour: 'sky', text: '**Reset variables** puts `picked` and `checked` back to their starting values, which clears every chip and the score.' });
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  noteBelow(page, { text: '**Live variables** `words` is the passage as a row for each word, and `found`, `wrong` and `score` are worked out from the picks as they are made. Check only turns `checked` on.', colour: 'sky' });
  noteBelow(page, { x: 456, text: '**Measured chips** Each word\'s chip is as wide as its text, which the player measures in every copy, so a longer passage or a bigger font needs no sizing. [ ] Put * on each side of the words to mark.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    item('Write your own passage: the "passage" variable (Variables tab). Put an asterisk on each side of every word the learner should mark, like *opened*. The asterisks never show. Separate words with single spaces, and any punctuation stuck to a word counts as part of that word', passage, page),
    item('Say what to mark: the "rule" variable (Variables tab), for example "Click every noun in the passage."', rule, page),
    item('Check the Preview: the words wrap into lines by themselves and each chip fits its word, so a longer or shorter passage needs no other change (the passage panel grows with it)', passage, page),
    item('Change how a wrong word is scored: the "score" variable (Variables tab) is a live formula that takes the wrong words off the found ones', scoreText, page),
    item('Reword the legend that explains the ✓, ✗ and ← marks if you change what they mean', legend, page),
  ];
  return { project, checklist };
}
