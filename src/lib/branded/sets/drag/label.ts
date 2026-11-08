/**
 * Label the diagram: six labels (and a wrong one) to drag onto six spots of a picture, made with the question kit's matching
 * question. The spots are the matching slots laid over the picture, so Check answer marks each one, an extra label fits nowhere,
 * and tries, hints, part marks and Try again come with the question.
 */
import { walk, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, picture, text, todo, type LayoutState } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { bind, click, goPrevious, graph } from '../../graph-kit';
import { boxText, clickOf, dressQuestion, endPage, goNextOn, graphNote, heroPage, kitNode, retray } from './shared';
import { extrasChecklist, extrasShort, questionExtras } from '\.\./\.\./parts';

const LABELS = ['Evaporation', 'Condensation', 'Precipitation', 'Collection', 'Transpiration', 'Runoff'];
//A label that fits no spot, mixed in on purpose
const EXTRA = 'Infiltration';
//Where each spot sits on the picture (top left of a 150 x 40 box, in the picture)
const SPOTS: [number, number][] = [[28, 22], [366, 22], [28, 118], [366, 118], [28, 214], [366, 214]];
const SPOT_W = 150;
const SPOT_H = 40;
const PIC_H = 290;
const N = LABELS.length;

/** After a check with every label on the wrong spot, so the longest feedback and the right answers under the spots show. */
export const LABEL_LAYOUT_STATES: LayoutState[] = [
  {
    label: 'checked, all wrong',
    page: 'Activity',
    vars: {
      label_answered: true,
      label_locked: true,
      label_feedback: '0 of 6 matched correctly. Out of tries. The right label is shown under each spot.',
      label_items: LABELS.map((word, i) => ({ id: `p${i + 1}`, text: word, label: `Spot ${i + 1}`, number: i + 1, selected: false, state: 'wrong', answer: 'Precipitation' })),
    },
  },
];

export function labelTheDiagram(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Label the diagram');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Label the diagram', 'Drag each label onto the right place on the picture, then check your answers.');
  const page = brandedPage(ctx, 'Label the water cycle', { name: 'Activity', footer: 'Drag each label onto the diagram' });
  const results = endPage(ctx, 'Well done', 'You put {label_score} of ' + N + ' labels on the right spot.', 'Try again');
  const box = contentBox(page);

  const id = addQuestion(project, page.id, 'matching', { at: { x: box.x, y: box.y - 8 }, ...questionExtras(project, { tryAgain: true }) })!;
  setQuestionSettings(project, page.id, id, {
    prefix: 'label',
    prompt: 'Drag each label onto the right place on the picture.',
    points: N,
    shuffle: true,
    attempts: 3,
    pairs: LABELS.map((word, i) => ({ id: `p${i + 1}`, term: word, match: `Spot ${i + 1}` })),
    extras: [{ id: 'x1', text: EXTRA }],
    hints: [],
    feedbackCorrect: 'Every label is on the right spot. Well done!',
    feedbackPartial: 'Move the labels marked wrong and check again.',
    feedbackIncorrect: 'Not quite. Move the labels marked wrong and check again.',
    feedbackOutOfTries: 'Out of tries. The right label is shown under each spot.',
    reveal: true,
    report: null,
  });
  const frame = page.children.find((n) => n.id === id) as FrameNode;
  frame.name = 'Label question';
  dressQuestion(ctx, frame, box.width, { pad: 14, gap: 8 });
  const parts = partsOf(frame);
  walk(frame.children, (n: SceneNode) => {
    if (n.type === 'text' && n.questionPart === 'prompt') n.fontSize = 18;
  });

  //The picture on the left and the labels on the right: the matches column becomes a free canvas, the slots sit on the picture
  const body = parts.matching[0] as FrameNode;
  body.layout = { ...body.layout!, reverse: false, gap: 20 };
  const matches = parts.matches[0] as FrameNode;
  matches.layout = null;
  matches.height = PIC_H;
  const terms = parts.terms[0] as FrameNode;
  retray(terms, 2, 150, 44, 12);
  const picW = box.width - 48 - terms.width - 20;
  const pic = picture(ctx, 'Diagram picture', 0, 0, picW, PIC_H);
  matches.children.unshift(pic);
  parts.matchRow.forEach((row, i) => {
    const r = row as FrameNode;
    const [x, y] = SPOTS[i];
    Object.assign(r, { name: `Spot ${i + 1} area`, layout: null, x, y, width: SPOT_W, height: SPOT_H + 20 });
    const line = parts.matchLine.find((l) => r.children.includes(l)) as FrameNode;
    Object.assign(line, { name: `Spot ${i + 1} line`, layout: null, x: 0, y: 0, width: SPOT_W, height: SPOT_H });
    //The definition text is the spot's name for the question; on a picture the spot is just numbered
    line.children = line.children.filter((c) => c.questionPart !== 'matchDefinition');
    const slot = line.children[0] as FrameNode;
    Object.assign(slot, { name: `Spot ${i + 1}`, x: 0, y: 0, width: SPOT_W, height: SPOT_H });
    slot.children = [boxText(ctx, `Spot ${i + 1} number`, String(i + 1), 0, 0, SPOT_W, SPOT_H, { fontSize: 16, fontWeight: 700, color: L.muted, align: 'center' })];
    const result = r.children.find((c) => c.questionPart === 'matchState')!;
    result.name = `Spot ${i + 1} result`;
    Object.assign(result, { x: 0, y: SPOT_H + 2, width: SPOT_W, fontSize: 12, align: 'center', layoutItem: undefined });
  });
  //Each label is named by its word
  for (const t of parts.matchTerm) {
    const word = t.ariaLabel ?? t.name;
    t.name = word;
    for (const c of (t as FrameNode).children) c.name = `${word} text`;
  }

  //How to do it from the keyboard, under the question
  const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a label, press Space to pick it up, use the arrow keys to choose a spot and Space to drop it.', 0, 0, 100, { fontSize: 14, color: L.muted });
  frame.children.splice(1, 0, keys);

  //A way on to the results once the question is finished
  const next = bind(button(ctx, 'See results button', 'See results', 0, 0, 180), { visible: 'label_locked' });
  (parts.buttons[0] as FrameNode).children.push(next);

  goNextOn(hero, start, 'Navigation');
  goNextOn(page, next, 'Navigation');
  graphNote(page, { anchor: kitNode(page, 'start:event'), colour: 'sky', text: '**The matching question wired Start, Check, Hint and Try again.** Dragging a label onto a spot is the question\'s own behaviour, so no node is needed per label. [ ] Change labels and spots in the Question section.' });
  graphNote(page, { anchor: clickOf(page, next), colour: 'sky', text: '**See results is hidden until `label_locked`,** which the question sets once it is right or out of tries. Start resets the question each time the page opens, so going Back from Results finds it fresh.' });
  {
    const g = graph(results.page);
    g.run(click(g, results.again, 'Try again'), goPrevious());
  }

  const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(page, { ...below(0, 440), text: '**Matching question** The labels, the spot each belongs on, and the wrong label are settings of the question (Question section). Check answer, tries and part marks come with it.', colour: 'sky' });
  addNote(page, { ...below(456, 440), text: '**Spots** are the matching slots, moved onto the picture. Keep each Spot inside its "Spot n area" layer so the right answer shows under it after a check.', colour: 'sky' });
  addNote(page, { ...below(912, 440), text: '[ ] Replace the grey picture with your diagram, move the numbered spots onto its parts, then type your labels in the Question section (spot 1 takes the first pair).', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    todo('Replace the grey picture with your own diagram', 'Replace the grey picture with your own diagram (add an image in its place, then delete the grey box)', pic, page),
    todo('Move each numbered spot onto its part and name it', 'Move each numbered Spot onto its part of the diagram (move its "Spot n area" layer), and write what it is in its Name read out (Drop zone section)', parts.matchZone[0], page),
    todo('Type your own labels and the spot each belongs on', 'Type your own labels in the Question section: each pair is a label and the spot it belongs on. Pair 1 belongs on Spot 1, pair 2 on Spot 2 and so on. Add wrong labels under Extras', frame, page),
    todo('Set the tries, points and feedback messages', 'Set the tries, the points (the results say "of 6") and the feedback messages', frame, page),
    item('Change the results page text', results.result, results.page),
    todo('Pick a colourway (the brand parts are locked)', 'Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  checklist.push(todo(extrasShort({ tryAgain: true }), extrasChecklist({ tryAgain: true })));
  return { project, checklist };
}
