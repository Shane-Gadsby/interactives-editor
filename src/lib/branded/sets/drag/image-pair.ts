/**
 * Image pairing: six pictures to drag, each onto its partner card (a word and a line). A partner only takes its own picture, so
 * every drop says right or wrong straight away, the pair is marked, a count follows and Try again starts over.
 */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, boxText, goButton, heroPage, join, lit, put, seq } from './shared';

//The pictures in the order they stand on the left: what the picture should show, then the partner it goes with
const PAIRS: { shows: string; term: string; line: string }[] = [
  { shows: 'a cloud', term: 'Condensation', line: 'Vapour cools into droplets' },
  { shows: 'rain falling', term: 'Precipitation', line: 'Water falls from clouds' },
  { shows: 'the sun over the sea', term: 'Evaporation', line: 'Heat turns water to vapour' },
  { shows: 'a river reaching the sea', term: 'Runoff', line: 'Water flows over the land' },
  { shows: 'leaves on a tree', term: 'Transpiration', line: 'Plants release water vapour' },
  { shows: 'a garden after rain', term: 'Infiltration', line: 'Water soaks into the soil' },
];
//The order the partners stand in on the right (indexes into PAIRS), so the first look is never the answer
const PARTNERS = [2, 4, 0, 5, 3, 1];
const N = PAIRS.length;
const PIC_W = 112;
const ROW_H = 62;
const PITCH = 70;

export function imagePairing(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Image pairing');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Image pairing', 'Drag each picture onto the card it goes with. You will see straight away whether it fits.');
  const page = brandedPage(ctx, 'Match the pictures', { name: 'Activity', footer: 'Drag each picture onto its partner' });
  const box = contentBox(page);

  const pairVars = PAIRS.map((_, i) => addVar(project, `pair${i + 1}`, 'list', '[]'));
  const misses = addVar(project, 'misses', 'number', 0);
  const message = addVar(project, 'message', 'string', '');
  const matchedExpr = `[${pairVars.map((v) => v.name).join(', ')}].filter(p => p.length > 0).length`;

  const prompt = text(ctx, 'Prompt', 'Drag a picture onto its partner card. With the keyboard: Tab to a picture, press Space to pick it up, use the arrow keys to choose a card and Space to drop it.', box.x, box.y - 4, box.width - 280, { fontSize: 14, color: L.muted, lineHeight: 1.35 });
  const rowY = (r: number) => box.y + 38 + r * PITCH;

  //The partner cards sit on the right, each one a drop zone that only takes its own picture
  const partnerX = box.x + 330;
  const partners: SceneNode[] = PARTNERS.map((p, r) => {
    const v = pairVars[p].name;
    return createNode('frame', {
      name: `Partner ${p + 1}`,
      x: partnerX,
      y: rowY(r),
      width: 400,
      height: ROW_H,
      cornerRadius: 14,
      fill: solid(L.surface),
      stroke: { paint: solid(L.border), width: 2, dash: [6, 4] },
      clip: false,
      dropZone: { accepts: [`pair${p + 1}`], capacity: 1, snap: 'topLeft', label: `${PAIRS[p].term}: ${PAIRS[p].line}`, contentsVariable: pairVars[p].id },
      bindings: {
        'fill.color': `${v}.length > 0 ? ${lit(L.successSurface)} : ${lit(L.surface)}`,
        'stroke.paint.color': `${v}.length > 0 ? ${lit(L.success)} : ${lit(L.border)}`,
        ariaDescription: `${v}.length > 0 ? "Matched" : "Waiting for its picture"`,
      },
      children: [
        boxText(ctx, 'Partner term', PAIRS[p].term, PIC_W + 16, 6, 400 - PIC_W - 28, 28, { fontSize: 19, fontWeight: 700, verticalAlign: 'bottom' }),
        boxText(ctx, 'Partner line', PAIRS[p].line, PIC_W + 16, 34, 400 - PIC_W - 28, 22, { fontSize: 14, color: L.muted, verticalAlign: 'top' }),
      ],
    });
  });
  page.children.push(prompt, ...partners);

  //The pictures stand in a column on the left. Each is a grey placeholder, with a hint of what to put there
  const pics: SceneNode[] = PAIRS.map((p, i) =>
    createNode('frame', {
      name: `Picture ${i + 1}`,
      x: box.x + 40,
      y: rowY(i),
      width: PIC_W,
      height: ROW_H,
      cornerRadius: 14,
      fill: solid(L.surfaceMuted),
      stroke: stroke(L.text, 2),
      clip: false,
      shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
      draggable: { tags: [`pair${i + 1}`], onMiss: 'return', label: `Picture ${i + 1}: ${p.shows}` },
      ariaLabel: `Picture ${i + 1}: ${p.shows}`,
      children: [
        boxText(ctx, 'Picture number', String(i + 1), 8, 4, 24, 24, { fontSize: 15, fontWeight: 700 }),
        boxText(ctx, 'Picture hint', `Add a picture of ${p.shows}`, 8, 26, PIC_W - 16, 32, { fontSize: 11, color: L.muted, lineHeight: 1.2, verticalAlign: 'middle' }),
      ],
    })
  );
  page.children.push(...pics);

  const count = text(ctx, 'Count', `Matched {${matchedExpr}} of ${N}`, box.x + 760, box.y + 38, 168, { fontSize: 20, fontWeight: 700 });
  const wrong = text(ctx, 'Wrong drops', 'Wrong drops: {misses}', box.x + 760, box.y + 72, 168, { fontSize: 15, color: L.muted });
  const feedback = text(ctx, 'Feedback', '{message}', box.x + 760, box.y + 108, 168, { fontSize: 17, fontWeight: 600, lineHeight: 1.35, bindings: { visible: 'message != ""' } });
  const again = button(ctx, 'Try again button', 'Try again', box.x + 760, rowY(5), 168, false);
  page.children.push(count, wrong, feedback, again);

  //A picture taken by its partner, and one a partner refused
  const ok = seq(page, 0, ['event.drop', { result: 'accepted' }, 'Matching'], ['action.setVariable', { variable: message.id, op: 'set', value: 'event.layer + " matches its partner. Right."' }]);
  const done = put(page, 'logic.if', 520, 0, { condition: `${matchedExpr} == ${N}` });
  const finished = put(page, 'action.setVariable', 780, -60, { variable: message.id, op: 'set', value: `"All ${N} pairs matched. Well done!"` });
  const sayDone = put(page, 'action.announce', 1040, -60, { text: 'message' });
  const sayOk = put(page, 'action.announce', 780, 60, { text: 'message' });
  join(page, ok[1], done);
  join(page, done, finished, 'true');
  join(page, done, sayOk, 'false');
  join(page, finished, sayDone);
  seq(
    page,
    170,
    ['event.drop', { result: 'rejected' }, 'Matching'],
    ['action.setVariable', { variable: misses.id, op: 'add', value: '1' }],
    ['action.setVariable', { variable: message.id, op: 'set', value: 'event.layer + " is not the partner of that card. Try another."' }],
    ['action.announce', { text: 'message' }]
  );

  //Starting the page, and Try again, put everything back
  const reset: [string, Record<string, unknown>][] = [['action.dragReset', {}], ['action.setVariable', { variable: misses.id, op: 'set', value: '0' }], ['action.setVariable', { variable: message.id, op: 'set', value: '""' }]];
  seq(page, 340, ['event.start', {}, 'Start over'], ...reset);
  seq(page, 480, ['event.pointer', { target: again.id, type: 'click' }, 'Try again'], ...reset);

  goButton(hero, start, page, 0);

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title, the instruction and the footer text', byName(page, 'Page title'), page),
    item('Replace each grey picture with your own (put an image in the picture\'s frame, then delete the hint text), and rewrite its Text alternative so it says what the picture shows', pics[0], page),
    item('Write each partner card: the word and the line under it, and the Name read out (Drop zone section). To pair a picture with a picture instead, put a second grey picture in the card in place of the text', partners[0], page),
    item('Picture 1 goes with Partner 1, Picture 2 with Partner 2 and so on: a picture\'s Tags (Draggable section) must match the Takes tags of its partner. Keep them as they are unless you change the pairs', pics[1], page),
    item(`To add a pair: duplicate a picture and its partner card, add a list variable (pair${N + 1}) and set it as the card's Contents variable (Drop zone section), match the tags, then raise the "of ${N}" in the count and add the variable to the formulas in the count and the If node (Interactions tab)`, count, page),
    item('Rewrite the messages for a right pair, a wrong one and finishing (Interactions tab)', feedback, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked', undefined, page),
  ];
  return { project, checklist };
}
