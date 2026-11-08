import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { fill, keyNavList, stack } from '../../parts';
import { bind, click, goNext, graph, heroPage, noteBelow, variable } from './shared';

//Six study spaces, each a picture the author swaps. The label and the alt text (what a screen reader says) are one list, with the picture's asset beside them.
const OPTIONS = [
  { label: 'A quiet desk by a window', alt: 'A tidy desk beside a window with natural light, a laptop and a notebook', correct: true, image: '' },
  { label: 'The sofa with the television on', alt: 'A sofa in front of a television that is switched on', correct: false, image: '' },
  { label: 'A library study table', alt: 'A long table in a quiet library with students reading', correct: true, image: '' },
  { label: 'A bed with a laptop on it', alt: 'A laptop balanced on a rumpled bed', correct: false, image: '' },
  { label: 'A desk with the phone put away', alt: 'A clear desk with a phone face down inside a drawer', correct: true, image: '' },
  { label: 'A crowded cafe table', alt: 'A small table in a loud, crowded cafe', correct: false, image: '' },
];

const COLS = 3;
const GAP = 20;
const PIC_H = 88;

/** Checked, with every card picked and long labels, so the layout check sees the fullest the page gets. */
export const IMAGE_CHOICE_LAYOUT_STATES: LayoutState[] = [
  { label: 'checked', page: 'Choose the pictures', vars: { checked: true, picked: [0, 1, 2, 3, 4, 5] } },
];

export function buildImageChoice(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Image choice');
  const { project, L } = ctx;
  const N = OPTIONS.length;

  variable(project, 'prompt', 'string', 'Which of these are good places to study? Select all that apply.');
  variable(project, 'options', 'list', OPTIONS);
  //Off: choosing a picture swaps the choice for a single answer instead of adding to it
  variable(project, 'multiple', 'boolean', true);
  const picked = variable(project, 'picked', 'list', []);
  const checked = variable(project, 'checked', 'boolean', false);
  variable(project, 'feedbackCorrect', 'string', 'Right. Somewhere quiet, with the phone out of reach, is where studying works best.');
  variable(project, 'feedbackPartial', 'string', 'Part right. Some of your choices are good places to study and some are missing or do not belong.');
  variable(project, 'feedbackWrong', 'string', 'Not quite. Think about where you can concentrate without noise or distractions.');
  //Live variables: worked out from the picks as they change, so the verdict, its colour and the announcement all read the same numbers
  variable(project, 'nRight', 'number', 0, { formula: 'picked.filter(i => options[i].correct).length', live: true });
  variable(project, 'nWrong', 'number', 0, { formula: 'picked.filter(i => !options[i].correct).length', live: true });
  variable(project, 'nTotal', 'number', 0, { formula: 'options.filter(o => o.correct).length', live: true });
  variable(project, 'outcome', 'string', 'none', { formula: 'nRight == nTotal && nWrong == 0 ? "good" : nRight > 0 ? "part" : "none"', live: true });
  variable(project, 'verdict', 'string', '', { formula: 'outcome == "good" ? feedbackCorrect : outcome == "part" ? feedbackPartial : feedbackWrong', live: true });

  const { page: hero, start } = heroPage(ctx, 'Image choice', 'Look at six pictures and choose the ones that answer the question. Then check and see why.', 'Start');
  const page = brandedPage(ctx, 'Choose the pictures', { footer: '{checked ? "Checked" : picked.length + " selected"}' });
  const box = contentBox(page);

  const prompt = text(ctx, 'Prompt', '{prompt}', 0, 0, box.width, { fontSize: 21, fontWeight: 600, role: 'heading', headingLevel: 2 });

  //One card, repeated for each option: a picture (the grey placeholder, with the option's own image over it once its asset is set), the label and how it went
  const cardW = (box.width - GAP * (COLS - 1)) / COLS;
  const state = '(checked ? (picked.includes(index) ? (item.correct ? "✓ Right" : "✗ Wrong") : (item.correct ? "← Right answer" : "")) : (picked.includes(index) ? "Selected" : ""))';
  const hint = text(ctx, 'Picture hint', 'Picture {index + 1}', 0, 36, cardW - 16, { fontSize: 14, color: L.muted, align: 'center', decorative: true });
  const image = createNode('image', { name: 'Picture image', x: 0, y: 0, width: cardW - 16, height: PIC_H, assetId: null, fit: 'cover', cornerRadius: 10, decorative: true, bindings: { assetId: 'item.image' } } as never);
  const pic = createNode('frame', { name: 'Picture', x: 0, y: 0, width: cardW - 16, height: PIC_H, cornerRadius: 10, fill: solid(L.surfaceMuted), stroke: null, clip: true, decorative: true, layoutItem: { width: 'fill' }, children: [hint, image] } as never);
  const label = text(ctx, 'Label', '{item.label}', 0, 0, 100, { fontSize: 16, fontWeight: 600, lineHeight: 1.25, decorative: true, autoSize: 'height' });
  const result = text(ctx, 'Result', `{${state}}`, 0, 0, 100, { fontSize: 14, fontWeight: 700, align: 'right', color: L.muted, decorative: true, autoSize: 'width' });
  bind(result, { color: `checked ? (picked.includes(index) ? (item.correct ? "${L.success}" : "${L.error}") : "${L.warning}") : "${L.muted}"` });
  const labelRow = stack('Label row', 0, 0, 100, { direction: 'row', gap: 8, align: 'start', children: [fill(label), result] });
  const card = stack('Choice', 0, 0, cardW, {
    gap: 8,
    padding: 8,
    box: { cornerRadius: 14, fill: solid(L.background), stroke: stroke(L.border, 2) },
    extra: { role: 'checkbox', focusable: true, cursor: 'pointer' },
    children: [pic, labelRow],
  });
  bind(card, {
    ariaChecked: 'picked.includes(index)',
    ariaLabel: 'item.label + ". " + item.alt',
    ariaDescription: 'checked ? (picked.includes(index) ? (item.correct ? "Right" : "Wrong") : (item.correct ? "This was a right answer" : "")) : ""',
    'fill.color': `checked ? (picked.includes(index) ? (item.correct ? "${L.successSurface}" : "${L.errorSurface}") : (item.correct ? "${L.warningSurface}" : "${L.background}")) : (picked.includes(index) ? "${L.surfaceMuted}" : "${L.background}")`,
    'stroke.paint.color': `checked ? (picked.includes(index) ? (item.correct ? "${L.success}" : "${L.error}") : (item.correct ? "${L.warning}" : "${L.border}")) : (picked.includes(index) ? "${L.primary}" : "${L.border}")`,
  });
  //the cards are one Tab stop and the arrow keys move between them
  const choices = keyNavList('Choices', 0, 0, box.width, 2 * 150 + GAP, { items: 'options', row: card, mode: 'grid', columns: COLS, gap: GAP, ariaLabel: 'The pictures' });

  //Check, Try again and the feedback sit in one row under the cards
  const check = bind(button(ctx, 'Check button', 'Check answer', 0, 0, 170), { disabled: 'checked || picked.length == 0' });
  const again = bind(button(ctx, 'Try again button', 'Try again', 0, 0, 150, false), { visible: 'checked' });
  const feedback = bind(text(ctx, 'Feedback', '{(outcome == "good" ? "✓ " : outcome == "part" ? "✓ " : "✗ ") + verdict}', 0, 0, 100, { fontSize: 16, lineHeight: 1.3, role: 'region', fontWeight: 600 }), { visible: 'checked', color: `outcome == "good" ? "${L.success}" : outcome == "part" ? "${L.warning}" : "${L.error}"`, ariaLabel: 'verdict' });
  const actions = stack('Actions', 0, 0, box.width, { direction: 'row', gap: 16, align: 'center', children: [check, again, fill(feedback)] });
  page.children.push(stack('Choose body', box.x, box.y, box.width, { gap: 14, children: [prompt, choices, actions] }));

  {
    const g = graph(page);
    //One flow for every card: the copy that was pressed gives event.index. Several answers toggle it in the list, one answer swaps it
    const several = g.event('event.pointer', { target: card.id, type: 'click', onlyIf: '!checked && multiple' }, 'Pick a picture');
    g.run(several, ['action.setVariable', { variable: picked.id, op: 'toggleItem', value: 'event.index' }]);
    const one = g.event('event.pointer', { target: card.id, type: 'click', onlyIf: '!checked && !multiple' }, 'Pick the one picture');
    g.run(one, ['action.setVariable', { variable: picked.id, op: 'set', value: '[event.index]' }]);
    g.run(click(g, check, 'Check'), ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }], ['action.announce', { text: 'verdict + " You chose " + nRight + " right and " + nWrong + " wrong, out of " + nTotal + " right answers."', politeness: 'polite' }]);
    g.run(click(g, again, 'Try again'), ['action.resetVariables', { variables: [picked.id, checked.id] }]);
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  noteBelow(page, { text: '**One repeated card** The six cards are one layer drawn for each row of `options`, in one Tab stop with the arrow keys moving between them. One click flow reads `event.index` and uses Add or remove from a list.', colour: 'sky' });
  noteBelow(page, { x: 456, text: '[ ] Put an image asset id in each row\'s `image` (Variables tab) and it shows over the grey placeholder. Try again is one Reset variables node.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your question: the "prompt" variable (Variables tab)', prompt, page),
    item('Give each choice its picture: put the image asset\'s id in that row\'s "image" in the "options" variable. The grey "Picture n" placeholder shows until there is one', pic, page),
    item(`Write the label, the picture's description for a screen reader (alt) and whether it is right for each choice: the "options" variable (Variables tab) is a list of ${N}. Keep the names label, alt, correct and image in each entry`, card, page),
    item('Choose one answer or several: the "multiple" variable (Variables tab). Turn it off for one right answer, and set the card\'s Role to Radio in the inspector to match', card, page),
    item('Reword the three feedback messages: feedbackCorrect, feedbackPartial and feedbackWrong (Variables tab)', byName(page, 'Feedback'), page),
    item('Use more or fewer pictures: add or remove rows in "options". The cards follow it, in rows of three', undefined, page),
    item('Try it with the keyboard: Tab to the pictures, the arrow keys to move between them, Space to select, then Check', undefined, page),
  ];
  return { project, checklist };
}
