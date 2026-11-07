import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, picture, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, click, go, graph, heroPage, setVar, variable } from './shared';

//Six study spaces, each a picture the author swaps. The label and the alt text (what a screen reader says) are one list.
const OPTIONS = [
  { label: 'A quiet desk by a window', alt: 'A tidy desk beside a window with natural light, a laptop and a notebook', correct: true },
  { label: 'The sofa with the television on', alt: 'A sofa in front of a television that is switched on', correct: false },
  { label: 'A library study table', alt: 'A long table in a quiet library with students reading', correct: true },
  { label: 'A bed with a laptop on it', alt: 'A laptop balanced on a rumpled bed', correct: false },
  { label: 'A desk with the phone put away', alt: 'A clear desk with a phone face down inside a drawer', correct: true },
  { label: 'A crowded cafe table', alt: 'A small table in a loud, crowded cafe', correct: false },
];

const COLS = 3;
const GAP = 20;
const CARD_H = 166;

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
  const nRight = variable(project, 'nRight', 'number', 0);
  const nWrong = variable(project, 'nWrong', 'number', 0);
  const nTotal = variable(project, 'nTotal', 'number', 0);
  variable(project, 'feedbackCorrect', 'string', 'Right. Somewhere quiet, with the phone out of reach, is where studying works best.');
  variable(project, 'feedbackPartial', 'string', 'Part right. Some of your choices are good places to study and some are missing or do not belong.');
  variable(project, 'feedbackWrong', 'string', 'Not quite. Think about where you can concentrate without noise or distractions.');

  const { page: hero, start } = heroPage(ctx, 'Image choice', 'Look at six pictures and choose the ones that answer the question. Then check and see why.', 'Start');
  const page = brandedPage(ctx, 'Choose the pictures', { footer: '{checked ? "Checked" : picked.length + " selected"}' });
  const box = contentBox(page);

  const prompt = text(ctx, 'Prompt', '{prompt}', box.x, box.y, box.width, { fontSize: 21, fontWeight: 600, role: 'heading', headingLevel: 2 });
  page.children.push(prompt);

  //The cards, one layer each so every picture can be swapped on its own
  const cardW = (box.width - GAP * (COLS - 1)) / COLS;
  const cards: FrameNode[] = [];
  const pics: SceneNode[] = [];
  const stateWords = (i: number) => `checked ? (picked.includes(${i}) ? (options[${i}].correct ? "✓ Right" : "✗ Wrong") : (options[${i}].correct ? "← Right answer" : "")) : (picked.includes(${i}) ? "Selected" : "")`;
  OPTIONS.forEach((_, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = box.x + col * (cardW + GAP);
    const y = box.y + 40 + row * (CARD_H + 14);
    const pic = picture(ctx, `Picture ${i + 1}`, 10, 10, cardW - 20, 96);
    Object.assign(pic, { cornerRadius: 10, decorative: true, ariaLabel: undefined });
    const hint = text(ctx, `Picture ${i + 1} hint`, `Picture ${i + 1}`, 10, 46, cardW - 20, { fontSize: 14, color: L.muted, align: 'center', decorative: true });
    const label = text(ctx, `Label ${i + 1}`, `{options[${i}].label}`, 12, 114, cardW - 150, { fontSize: 16, fontWeight: 600, lineHeight: 1.25, decorative: true });
    const state = text(ctx, `Result ${i + 1}`, `{${stateWords(i)}}`, cardW - 140, 114, 128, { fontSize: 14, fontWeight: 700, align: 'right', color: L.muted, decorative: true });
    bind(state, { color: `checked ? (picked.includes(${i}) ? (options[${i}].correct ? "${L.success}" : "${L.error}") : "${L.warning}") : "${L.muted}"` });
    const frame = createNode('frame', {
      name: `Choice ${i + 1}`,
      x,
      y,
      width: cardW,
      height: CARD_H,
      cornerRadius: 14,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'checkbox',
      focusable: true,
      cursor: 'pointer',
      children: [pic, hint, label, state],
    }) as FrameNode;
    bind(frame, {
      ariaChecked: `picked.includes(${i})`,
      ariaLabel: `options[${i}].label + ". " + options[${i}].alt`,
      ariaDescription: `checked ? (picked.includes(${i}) ? (options[${i}].correct ? "Right" : "Wrong") : (options[${i}].correct ? "This was a right answer" : "")) : ""`,
      'fill.color': `checked ? (picked.includes(${i}) ? (options[${i}].correct ? "${L.successSurface}" : "${L.errorSurface}") : (options[${i}].correct ? "${L.warningSurface}" : "${L.background}")) : (picked.includes(${i}) ? "${L.surfaceMuted}" : "${L.background}")`,
      'stroke.paint.color': `checked ? (picked.includes(${i}) ? (options[${i}].correct ? "${L.success}" : "${L.error}") : (options[${i}].correct ? "${L.warning}" : "${L.border}")) : (picked.includes(${i}) ? "${L.primary}" : "${L.border}")`,
    });
    cards.push(frame);
    pics.push(pic);
    page.children.push(frame);
  });

  //Check, Try again and the feedback sit in one row under the cards
  const rowY = box.y + 40 + 2 * (CARD_H + 14) + 2;
  const check = bind(button(ctx, 'Check button', 'Check', box.x, rowY, 140), { disabled: 'checked || picked.length == 0', opacity: 'checked || picked.length == 0 ? 0.5 : 1' });
  const again = bind(button(ctx, 'Try again button', 'Try again', box.x + 154, rowY, 150, false), { visible: 'checked' });
  const feedback = text(ctx, 'Feedback', '{nRight == nTotal && nWrong == 0 ? "✓ " + feedbackCorrect : nRight > 0 ? "✓ " + feedbackPartial : "✗ " + feedbackWrong}', box.x + 330, rowY - 2, box.width - 330, { fontSize: 16, lineHeight: 1.3, role: 'region', fontWeight: 600 });
  bind(feedback, { visible: 'checked', color: `nRight == nTotal && nWrong == 0 ? "${L.success}" : nRight > 0 ? "${L.warning}" : "${L.error}"`, ariaLabel: 'nRight == nTotal && nWrong == 0 ? feedbackCorrect : nRight > 0 ? feedbackPartial : feedbackWrong' });
  page.children.push(check, again, feedback);

  {
    const g = graph(page);
    const marks = `picked.filter(i => options[i].correct).length`;
    const wrongs = `picked.filter(i => !options[i].correct).length`;
    cards.forEach((c, i) => {
      const ev = click(g, c, `Choose picture ${i + 1}`);
      const open = g.then(ev, 'logic.if', { condition: '!checked' });
      const has = g.then(open, 'logic.if', { condition: `picked.includes(${i})` }, 'true');
      g.then(has, 'action.setVariable', { variable: picked.id, op: 'remove', value: `picked.indexOf(${i})` }, 'true');
      const several = g.then(has, 'logic.if', { condition: 'multiple' }, 'false');
      g.then(several, 'action.setVariable', { variable: picked.id, op: 'push', value: String(i) }, 'true');
      g.then(several, 'action.setVariable', { variable: picked.id, op: 'set', value: `[${i}]` }, 'false');
    });
    const onCheck = click(g, check, 'Check');
    g.run(
      onCheck,
      setVar(nRight, marks),
      setVar(nWrong, wrongs),
      setVar(nTotal, 'options.filter(o => o.correct).length'),
      setVar(checked, 'true'),
      announce('(nRight == nTotal && nWrong == 0 ? feedbackCorrect : nRight > 0 ? feedbackPartial : feedbackWrong) + " You chose " + nRight + " right and " + nWrong + " wrong, out of " + nTotal + " right answers."'),
    );
    const redo = click(g, again, 'Try again');
    g.run(redo, ['action.setVariable', { variable: picked.id, op: 'clear' }], setVar(checked, 'false'), setVar(nRight, '0'), setVar(nWrong, '0'), setVar(nTotal, '0'));
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(page));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your question: the "prompt" variable (Variables tab)', prompt, page),
    item('Swap each grey picture for your own image (select "Picture 1" to "Picture 6" and put the image in), and delete the grey "Picture n" hint texts over them', pics[0], page),
    item(`Write the label, the picture's description for a screen reader (alt) and whether it is right for each choice: the "options" variable (Variables tab) is a list of ${N}, in the order of the cards. Keep the three names label, alt and correct in each entry`, cards[0], page),
    item('Choose one answer or several: the "multiple" variable (Variables tab). Turn it off for one right answer, and set the cards\' Role to Radio in the inspector to match', cards[0], page),
    item('Reword the three feedback messages: feedbackCorrect, feedbackPartial and feedbackWrong (Variables tab)', byName(page, 'Feedback'), page),
    item('To use fewer than six pictures, delete the last cards and their entries in "options" (the Choose flows in the Interactions tab for the deleted cards can go too)', undefined, page),
    item('Try it with the keyboard: Tab to a picture, Space to select it, then Check', undefined, page),
  ];
  return { project, checklist };
}
