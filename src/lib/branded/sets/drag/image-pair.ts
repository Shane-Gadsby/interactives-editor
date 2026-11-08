/**
 * Image pairing: six pictures to drag, each onto its partner card (a word and a line), made with the question kit's matching
 * question. A wrong picture is mixed in, Check answer marks every card, and tries, part marks and Try again come with the question.
 */
import { defaultAutoLayout, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { bind, click, goPrevious, graph } from '../../graph-kit';
import { clickOf, dressQuestion, endPage, goNextOn, graphNote, heroPage, kitNode } from './shared';
import { extrasChecklist, questionExtras } from '../../parts';

//The pictures: what each should show, then the partner it goes with (a word and a line)
const PAIRS: { shows: string; term: string; line: string }[] = [
  { shows: 'a cloud', term: 'Condensation', line: 'Vapour cools into droplets' },
  { shows: 'rain falling', term: 'Precipitation', line: 'Water falls from clouds' },
  { shows: 'the sun over the sea', term: 'Evaporation', line: 'Heat turns water to vapour' },
  { shows: 'a river reaching the sea', term: 'Runoff', line: 'Water flows over the land' },
  { shows: 'leaves on a tree', term: 'Transpiration', line: 'Plants release water vapour' },
  { shows: 'a garden after rain', term: 'Infiltration', line: 'Water soaks into the soil' },
];
//A picture that goes with none of the cards
const EXTRA = 'a desert at noon';
const N = PAIRS.length;
const PIC_W = 112;
const ROW_H = 56;
const CARD_W = 430;

/** After a check with every card wrong, so the answers beside the marks show at their longest. */
export const IMAGE_PAIR_LAYOUT_STATES: LayoutState[] = [
  {
    label: 'checked, all wrong',
    page: 'Activity',
    vars: {
      pairs_answered: true,
      pairs_locked: true,
      pairs_feedback: '0 of 6 matched correctly. Out of tries. The right picture is named beside each card.',
      pairs_items: PAIRS.map((p, i) => ({ id: `p${i + 1}`, text: p.shows, label: p.term, number: i + 1, selected: false, state: 'wrong', answer: 'a river reaching the sea' })),
    },
  },
];

export function imagePairing(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Image pairing');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Image pairing', 'Drag each picture onto the card it goes with. Check to see which pairs are right.');
  const page = brandedPage(ctx, 'Match the pictures', { name: 'Activity', footer: 'Drag each picture onto its partner' });
  const results = endPage(ctx, 'Well done', 'You matched {pairs_score} of ' + N + ' pictures to their cards.', 'Try again');
  const box = contentBox(page);

  const id = addQuestion(project, page.id, 'matching', { at: { x: box.x, y: box.y - 8 }, ...questionExtras(project, { tryAgain: true }) })!;
  setQuestionSettings(project, page.id, id, {
    prefix: 'pairs',
    prompt: 'Drag each picture onto the card it goes with.',
    points: N,
    shuffle: true,
    attempts: 3,
    pairs: PAIRS.map((p, i) => ({ id: `p${i + 1}`, term: p.shows, match: p.term })),
    extras: [{ id: 'x1', text: EXTRA }],
    hints: [],
    feedbackCorrect: 'Every picture is on the right card. Well done!',
    feedbackPartial: 'Move the pictures marked wrong and check again.',
    feedbackIncorrect: 'Not quite. Move the pictures marked wrong and check again.',
    feedbackOutOfTries: 'Out of tries. The right picture is named beside each card.',
    reveal: true,
    report: null,
  });
  const frame = page.children.find((n) => n.id === id) as FrameNode;
  frame.name = 'Pairing question';
  dressQuestion(ctx, frame, box.width, { pad: 14, gap: 8 });
  const parts = partsOf(frame);
  for (const t of frame.children) if (t.type === 'text' && t.questionPart === 'prompt') t.fontSize = 18;
  const inner = box.width - 48;

  //The pictures in a row on top, the cards in two columns under them
  const body = parts.matching[0] as FrameNode;
  body.layout = { ...body.layout!, direction: 'column', align: 'stretch', gap: 12, reverse: true };
  const terms = parts.terms[0] as FrameNode;
  terms.name = 'Pictures';
  terms.height = ROW_H;
  const pitch = (inner - PIC_W) / (terms.children.length - 1);
  terms.children.forEach((c, k) => {
    const chip = c as FrameNode;
    Object.assign(chip, { x: Math.round(k * pitch), y: 0, width: PIC_W, height: ROW_H });
    chip.layout = { ...chip.layout!, padding: { top: 4, right: 6, bottom: 4, left: 6 } };
    const extra = chip.questionPart === 'matchTerm:x1';
    const n = extra ? 'Wrong picture' : `Picture ${PAIRS.findIndex((_, i) => chip.questionPart === `matchTerm:p${i + 1}`) + 1}`;
    chip.name = n;
    for (const t of chip.children) {
      t.name = `${n} hint`;
      Object.assign(t, { fontSize: 12, align: 'center', color: L.muted, lineHeight: 1.2 });
    }
  });
  const matches = parts.matches[0] as FrameNode;
  matches.name = 'Cards';
  //two cards to a row, as a grid so the cards stay direct children of the matches frame the question keeps in step
  matches.layout = { ...defaultAutoLayout('row'), gap: 20, crossGap: 12, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'start', hugHeight: true, grid: { columns: [{ type: 'fr', value: 1 }, { type: 'fr', value: 1 }], rows: [] } };
  parts.matchRow.forEach((row, i) => {
    const r = row as FrameNode;
    Object.assign(r, { name: `Partner ${i + 1} card`, layout: null, width: CARD_W, height: ROW_H, cornerRadius: 14, fill: solid(L.background), stroke: stroke(L.border, 2) });
    const line = parts.matchLine.find((l) => r.children.includes(l)) as FrameNode;
    Object.assign(line, { name: `Partner ${i + 1} line`, layout: null, x: 0, y: 0, width: CARD_W, height: ROW_H });
    const slot = parts.matchZone.find((z) => line.children.includes(z)) as FrameNode;
    Object.assign(slot, { name: `Partner ${i + 1}`, x: 0, y: 0, width: PIC_W, height: ROW_H, cornerRadius: 14 });
    const word = parts.matchDefinition.find((d) => line.children.includes(d))!;
    Object.assign(word, { name: `Partner ${i + 1} word`, x: PIC_W + 12, y: 6, width: 176, fontSize: 18, fontWeight: 700 });
    const sentence = text(ctx, `Partner ${i + 1} line text`, PAIRS[i].line, PIC_W + 12, 32, 176, { fontSize: 13, color: L.muted, decorative: true });
    line.children = [slot, word, sentence];
    const result = r.children.find((c) => c.questionPart === 'matchState')!;
    result.name = `Partner ${i + 1} result`;
    Object.assign(result, { x: PIC_W + 12 + 176 + 6, y: 8, width: CARD_W - (PIC_W + 12 + 176 + 6) - 8, fontSize: 12, align: 'right', layoutItem: undefined });
  });

  //How to do it from the keyboard, under the question
  const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a picture, press Space to pick it up, use the arrow keys to choose a card and Space to drop it.', 0, 0, 100, { fontSize: 14, color: L.muted });
  frame.children.splice(1, 0, keys);

  //A way on to the results once the question is finished
  const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'pairs_locked' });
  (parts.buttons[0] as FrameNode).children.push(next);

  goNextOn(hero, start, 'Navigation');
  goNextOn(page, next, 'Navigation');
  graphNote(page, { anchor: kitNode(page, 'start:event'), colour: 'sky', text: '**The matching question wired Start, Check, Hint and Try again.** Dragging a picture onto a card is the question\'s own behaviour, so no node is needed per picture. [ ] Change the pairs in the Question section.' });
  graphNote(page, { anchor: clickOf(page, next), colour: 'sky', text: '**See results is hidden until `pairs_locked`,** when every card is matched or the tries run out. Start resets the question when the page opens, so Back from Results finds it fresh.' });
  {
    const g = graph(results.page);
    g.run(click(g, results.again, 'Try again'), goPrevious());
  }

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Matching question** The pictures, the card each belongs on, and the wrong picture are settings of the question (Question section). The pictures are shuffled for you.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Pictures** are grey placeholders named after what they should show. The line under each card is plain text in the card, so change it there.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Put a real image in each picture (and its text alternative), delete the hint text, and write the cards in the Question section (a pair is what the picture shows and the card it goes on).', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Replace each grey picture with your own (put an image in the picture\'s frame, then delete the hint text), and make its Text alternative say what the picture shows', parts.matchTerm[0], page),
    item('Write each card: the pairs in the Question section give the card\'s word and what its picture shows. The line under the word is a text layer in the card (Layers panel). To pair a picture with a picture, put a second grey picture in the card in place of the text', parts.matchRow[0], page),
    item('Add or remove pairs, and the wrong picture (Extras), in the Question section. The layers follow. Keep two cards to a row; three rows fit above the footer', frame, page),
    item('Set the tries, the points (the results say "of 6") and the feedback messages', frame, page),
    item('Change the results page text', results.result, results.page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  checklist.push(item(extrasChecklist({ tryAgain: true })));
  return { project, checklist };
}
