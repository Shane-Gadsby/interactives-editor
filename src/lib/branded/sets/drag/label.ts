/** Label the diagram: six labels to drag onto six spots of a picture, a Check that marks each, Show answers and Try again. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { addVar, boxText, goButton, heroPage, join, lit, put, seq } from './shared';

const LABELS = ['Evaporation', 'Condensation', 'Precipitation', 'Collection', 'Transpiration', 'Runoff'];
//Where each spot sits on the picture (top left of a 150 x 40 box)
const SPOTS: [number, number][] = [[64, 140], [434, 140], [64, 270], [434, 270], [64, 396], [434, 396]];
//The order the labels start in the tray (indexes into LABELS), so the first look is never the answer
const TRAY = [3, 0, 5, 2, 4, 1];
const N = LABELS.length;

export function labelTheDiagram(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Label the diagram');
  const { L, project } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Label the diagram', 'Drag each label onto the right place on the picture, then check your answers.');
  const page = brandedPage(ctx, 'Label the water cycle', { name: 'Activity', footer: 'Drag each label onto the diagram' });
  const box = contentBox(page);

  const checked = addVar(project, 'checked', 'boolean', false);
  const shown = addVar(project, 'shown', 'boolean', false);
  const score = addVar(project, 'score', 'number', 0);
  const message = addVar(project, 'message', 'string', '');
  const spotVars = LABELS.map((_, i) => addVar(project, `label${i + 1}Spot`, 'string', ''));

  const pic = picture(ctx, 'Diagram picture', box.x, box.y, 560, 340);
  page.children.push(pic);

  //The spots sit above the picture, the labels above the spots
  const spots = SPOTS.map(([x, y], i) =>
    createNode('frame', {
      name: `Spot ${i + 1}`,
      x,
      y,
      width: 150,
      height: 40,
      cornerRadius: 12,
      fill: solid(L.background),
      stroke: { paint: solid(L.muted), width: 2, dash: [6, 4] },
      clip: false,
      dropZone: { accepts: [], capacity: 1, snap: 'center', label: `Spot ${i + 1}` },
      children: [boxText(ctx, 'Spot number', String(i + 1), 0, 0, 150, 40, { fontSize: 16, fontWeight: 700, color: L.muted, align: 'center' })],
    })
  );
  page.children.push(...spots);

  const trayX = [640, 816];
  const cards: SceneNode[] = [];
  const num = (i: number) => spotVars[i].name;
  LABELS.forEach((word, i) => {
    const slot = TRAY.indexOf(i);
    const here = `${num(i)} == "Spot ${i + 1}"`;
    const pick = (ok: string, none: string, bad: string, off: string) => `checked ? (${here} ? ${ok} : ${num(i)} == "" ? ${none} : ${bad}) : ${off}`;
    cards.push(
      createNode('frame', {
        name: `Label ${i + 1}`,
        x: trayX[slot % 2],
        y: 150 + Math.floor(slot / 2) * 52,
        width: 160,
        height: 40,
        cornerRadius: 20,
        fill: solid(L.background),
        stroke: stroke(L.text, 2),
        clip: false,
        shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
        draggable: { tags: ['label'], onMiss: 'return', zoneVariable: spotVars[i].id, label: word },
        ariaLabel: word,
        bindings: {
          'fill.color': pick(lit(L.successSurface), lit(L.warningSurface), lit(L.errorSurface), lit(L.background)),
          'stroke.paint.color': pick(lit(L.success), lit(L.warning), lit(L.error), lit(L.text)),
          ariaDescription: pick('"Right"', '"Not placed"', '"Wrong"', '""'),
        },
        children: [
          boxText(ctx, 'Mark', '', 8, 0, 24, 40, { fontSize: 16, fontWeight: 700, align: 'center', bindings: { text: pick('"✓"', '"–"', '"✗"', '""') } }),
          boxText(ctx, 'Label text', word, 34, 0, 120, 40, { fontSize: 15, fontWeight: 600 }),
        ],
      })
    );
  });
  page.children.push(...cards);

  const labelsHead = heading(ctx, 'Labels heading', 'Labels', 640, box.y, 336, { fontSize: 20 });
  const progress = text(ctx, 'Progress', `Placed {[${spotVars.map((v) => v.name).join(', ')}].filter(z => z != "").length} of ${N}`, box.x, box.y + 350, 560, { fontSize: 18, fontWeight: 700 });
  const help = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a label, press Space to pick it up, use the arrow keys to choose a spot and Space to drop it.', box.x, box.y + 382, 560, { fontSize: 14, color: L.muted });
  const feedback = text(ctx, 'Feedback', '{message}', 640, 470, 336, { fontSize: 18, fontWeight: 600, bindings: { visible: 'message != ""' } });
  const check = button(ctx, 'Check button', 'Check', 640, 350, 160);
  check.bindings = { disabled: 'checked' };
  const showBtn = button(ctx, 'Show answers button', 'Show answers', 816, 350, 160, false);
  showBtn.bindings = { visible: `checked && !shown && score < ${N}` };
  const again = button(ctx, 'Try again button', 'Try again', 640, 406, 160, false);
  again.bindings = { visible: 'checked' };
  page.children.push(labelsHead, progress, help, feedback, check, showBtn, again);

  //Check: mark every label, count the right ones, say how it went, lock the labels
  const right = spotVars.map((v, i) => `(${v.name} == "Spot ${i + 1}" ? 1 : 0)`).join(' + ');
  const lock = cards.map((c) => ['action.dragEnable', { target: c.id, op: 'disable' }] as [string, Record<string, unknown>]);
  const checkRow = seq(page, 0, ['event.pointer', { target: check.id, type: 'click' }, 'Check'], ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }], ['action.setVariable', { variable: score.id, op: 'set', value: right }]);
  const verdict = put(page, 'logic.if', 780, 0, { condition: `score == ${N}` });
  const allRight = put(page, 'action.setVariable', 1040, -60, { variable: message.id, op: 'set', value: `"All ${N} labels are in the right place. Well done!"` });
  const someRight = put(page, 'action.setVariable', 1040, 70, { variable: message.id, op: 'set', value: `score + " of ${N} are right. Look for the marks on the labels, then try again or show the answers."` });
  const say = put(page, 'action.announce', 1300, 0, { text: 'message' });
  join(page, checkRow[2], verdict);
  join(page, verdict, allRight, 'true');
  join(page, verdict, someRight, 'false');
  join(page, allRight, say);
  join(page, someRight, say);
  const locks = seq(page, 150, ...lock);
  join(page, say, locks[0]);

  //Show answers: everything back to the tray, then each label onto its own spot
  const place = cards.map((c, i) => ['action.dragPlace', { layer: c.id, zone: spots[i].id }] as [string, Record<string, unknown>]);
  seq(
    page,
    300,
    ['event.pointer', { target: showBtn.id, type: 'click' }, 'Show answers'],
    ['action.dragReset', {}],
    ...place,
    ['action.setVariable', { variable: checked.id, op: 'set', value: 'true' }],
    ['action.setVariable', { variable: shown.id, op: 'set', value: 'true' }],
    ['action.setVariable', { variable: message.id, op: 'set', value: '"Here are the right places. Press Try again to have another go."' }],
    ['action.announce', { text: 'message' }],
    ...lock
  );

  //Try again: let the labels be dragged, put them back, clear the marks
  seq(
    page,
    450,
    ['event.pointer', { target: again.id, type: 'click' }, 'Try again'],
    ...cards.map((c) => ['action.dragEnable', { target: c.id, op: 'enable' }] as [string, Record<string, unknown>]),
    ['action.dragReset', {}],
    ['action.setVariable', { variable: checked.id, op: 'set', value: 'false' }],
    ['action.setVariable', { variable: shown.id, op: 'set', value: 'false' }],
    ['action.setVariable', { variable: score.id, op: 'set', value: '0' }],
    ['action.setVariable', { variable: message.id, op: 'set', value: '""' }]
  );

  goButton(hero, start, page, 0);

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the Start page', byName(hero, 'Page title'), hero),
    item('Change the page title and the footer text', byName(page, 'Page title'), page),
    item('Replace the grey picture with your own diagram (add an image in its place, then delete the grey box)', pic, page),
    item('Move each dashed Spot onto its part of the diagram, and give it a name a screen reader can use (Drop zone > Name read out)', spots[0], page),
    item('Type your own labels, and the same word as each label\'s Text alternative (Accessibility) so screen readers hear it. Label 1 belongs in Spot 1, Label 2 in Spot 2 and so on: that pairing is what Check marks (the score formula in the Interactions tab), so keep it or change the formula', cards[0], page),
    item('To add a label: duplicate a label and a spot, add a text variable for it (Variables tab) and set it as the label\'s Zone variable, then add it to the score formula and to the "Placed" count', progress, page),
    item('Rewrite the messages after Check and Show answers (Interactions tab)', feedback, page),
    item('Pick the colourway on the Themes tab. The brand parts are locked; the labels, spots and text are yours', undefined, page),
  ];
  return { project, checklist };
}
