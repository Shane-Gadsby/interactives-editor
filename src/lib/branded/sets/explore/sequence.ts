/**
 * Image sequence: six pictures shown one at a time as a slider moves through them (a process or growth over time), with a
 * caption for each, Previous and Next, clickable stage names under the slider, and the keyboard arrows on the slider.
 */
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, navBarY, picture, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { addVar, announce, bind, click, focus, graph, graphNote, set } from '../../graph-kit';
import { stack } from '../../parts';
import { heroButtons } from './helpers';

const STAGES = [
  { short: 'Seed', title: 'A dry seed', caption: 'A bean seed holds a tiny plant and a store of food. It waits until it has warmth and water.' },
  { short: 'Germination', title: 'Germination', caption: 'The seed soaks up water and swells. The root pushes out first and grows downwards.' },
  { short: 'Seedling', title: 'A seedling', caption: 'A shoot rises above the soil and the first leaves open to catch the light.' },
  { short: 'Young plant', title: 'A young plant', caption: 'More leaves grow and the stem gets taller. The plant makes its own food from sunlight.' },
  { short: 'Flowering', title: 'Flowering', caption: 'Flowers open. Once a flower is pollinated it starts to form a pod.' },
  { short: 'Seed pods', title: 'Seed pods', caption: 'The pods swell with new beans. When they dry, the seeds are ready for the next cycle.' },
];
const N = STAGES.length;
const PIC_W = 560;
const PIC_H = 296;

export const imageSequence: BrandedStarter = {
  key: 'explore/image-sequence',
  set: 'explore',
  name: 'Image sequence',
  description: 'Six pictures shown one at a time as a slider moves along, for a process or growth over time. Each stage has a caption, the slider answers the arrow keys, and Previous, Next and the stage names under the slider jump about too.',
  tags: ['slider', 'pictures', 'process', 'keyboard friendly'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Image sequence');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'The life of a bean plant', { kind: 'hero', subtitle: 'Move the slider through six stages of growth, from seed to seed.' });
    const page = brandedPage(ctx, 'From seed to seed', { footer: 'Plant life cycles' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next' }]);

    const step = addVar(project, 'step', 'number', 1);
    addVar(project, 'stages', 'list', STAGES.map((s) => ({ title: s.title, caption: s.caption })));
    //Live: the number of stages follows the list, so the count, the ends of Previous and Next and the slider's top need no editing
    addVar(project, 'total', 'number', N, { formula: 'stages.length', live: true });

    const box = contentBox(page);
    //One frame for each picture. The Solo group shows only the child named for the current stage
    const pics: SceneNode[] = [];
    const frames = STAGES.map((s, i) => {
      const pic = picture(ctx, `Image ${i + 1} picture`, 0, 0, PIC_W, PIC_H);
      const hint = text(ctx, `Image ${i + 1} picture hint`, 'Replace with your picture', 0, PIC_H / 2 - 12, PIC_W, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
      pics.push(pic);
      return createNode('frame', { name: `Image ${i + 1}`, x: 0, y: 0, width: PIC_W, height: PIC_H, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: `Image ${i + 1} of ${N}: ${s.title}`, children: [pic, hint] } as never);
    });
    const images = createNode('frame', {
      name: 'Images',
      x: box.x,
      y: box.y,
      width: PIC_W,
      height: PIC_H,
      fill: null,
      stroke: null,
      clip: false,
      solo: { active: null },
      bindings: { 'solo.active': '"Image " + step' },
      children: frames,
    } as never) as FrameNode;
    page.children.push(images);

    //The text beside the picture, one column so a long caption pushes the keyboard help down instead of landing on it
    const colX = box.x + PIC_W + 32;
    const colW = box.width - PIC_W - 32;
    const kicker = text(ctx, 'Stage count', 'Stage {step} of {total}', 0, 0, 100, { fontSize: 15, fontWeight: 700, color: L.muted });
    const title = heading(ctx, 'Stage title', '{stages[step - 1].title}', 0, 0, 100, { fontSize: 26 });
    const caption = text(ctx, 'Stage caption', '{stages[step - 1].caption}', 0, 0, 100, { fontSize: 18, lineHeight: 1.45 });
    //Previous and Next are on the bottom bar, like every starter's page buttons
    const prev = bind(button(ctx, 'Previous', 'Previous', box.x, navBarY(page), 160, false), { disabled: 'step <= 1' });
    const next = bind(button(ctx, 'Next', 'Next', box.x + box.width - 160, navBarY(page), 160, true), { disabled: 'step >= total' });
    const help = text(ctx, 'Keyboard help', 'Drag the slider, or use the left and right arrow keys. Home and End go to the first and last stage.', 0, 0, 100, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
    const side = stack('Stage text', colX, box.y, colW, { gap: 14, children: [kicker, title, caption, help] });
    page.children.push(side);

    //The slider, with the stage names under it
    const sy = box.y + PIC_H + 24;
    const slider = createNode('input', {
      name: 'Stage slider',
      ...lookDefaults(project, 'input'),
      inputType: 'range',
      variableId: step.id,
      min: 1,
      max: N,
      step: 1,
      value: '1',
      x: box.x,
      y: sy,
      width: PIC_W,
      height: 32,
      fontFamily: BRAND_FONT,
      color: L.button,
      ariaLabel: 'Stage',
      bindings: { max: 'total', ariaDescription: '"Stage " + step + " of " + total + ": " + stages[step - 1].title' },
    } as never);
    page.children.push(slider);
    //(a range's thumb runs from half a thumb in to half a thumb short of each end)
    const span = PIC_W - 16;
    const names: SceneNode[] = STAGES.map((s, i) =>
      text(ctx, `Stage ${i + 1} name`, s.short, 8 + (i * span) / (N - 1) - 46, 0, 92, {
        fontSize: 13,
        align: 'center',
        role: 'button',
        ariaLabel: `Go to stage ${i + 1}: ${s.title}`,
        bindings: { fontWeight: `step == ${i + 1} ? 700 : 400`, color: `step == ${i + 1} ? ${JSON.stringify(L.text)} : ${JSON.stringify(L.muted)}`, ariaCurrent: `step == ${i + 1} ? "step" : false` },
      })
    );
    const nameRow = createNode('frame', { name: 'Stage names', x: box.x, y: sy + 40, width: PIC_W, height: 20, fill: null, stroke: null, clip: false, children: names } as never);
    page.children.push(nameRow, prev, next);

    //Moving to a stage says which one. Previous and Next set the same variable the slider is tied to, and the names are one flow for all six
    const g = graph(page);
    const opened = g.event('event.start', {}, 'Start on the slider');
    graphNote(page, { anchor: opened, colour: 'sky', text: '**Opening the page puts the keyboard on the slider,** so the arrow keys step through the stages straight away. It is the only node that touches focus.' });
    g.run(opened, focus(slider));
    const prevClick = click(g, prev, 'Step');
    graphNote(page, { anchor: prevClick, colour: 'sky', text: '**Previous and Next stop at the ends** rather than wrapping, and move `step`, the one variable the slider, the names and the pictures all read.' });
    g.run(prevClick, set(step, 'step <= 1 ? 1 : step - 1'));
    g.run(click(g, next, 'Step'), set(step, 'step >= total ? total : step + 1'));
    g.run(g.event('event.pointer', { target: nameRow.id, type: 'click', childrenOnly: true }, 'Stage names'), set(step, 'event.childIndex + 1'));
    const said = g.event('event.variable', { variable: step.id }, 'Say the stage');
    graphNote(page, { anchor: said, colour: 'sky', text: '**One announcement for every way of moving.** Variable changed fires on `step` whether the slider, a name or a button moved it.' });
    g.run(said, announce('"Stage " + step + " of " + total + ": " + stages[step - 1].title'));

    //Notes for whoever edits the template, below the page
    const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 84 });
    addNote(page, { ...below(0, 440), text: '**Solo group** `Images` shows only the child named "Image {step}". To add a stage: duplicate an Image frame, rename it with the next number and add a line to `stages`.', colour: 'sky' });
    addNote(page, { ...below(456, 440), text: '**Stage names** are one flow for all six: the click gives `event.childIndex`, the name\'s place in the row. `total` is live, so the count and the Next button follow the `stages` list.', colour: 'sky' });
    addNote(page, { ...below(912, 380), text: '[ ] Swap each grey picture for your own and say what it shows in its text alternative.', colour: 'gold' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace each grey picture with your own, and give it a text alternative that says what it shows. The pictures are in the Image 1 to Image 6 frames inside the Images group, which shows one at a time', pics[0], page),
      item('Write each stage\'s title and caption in the "stages" list variable (Variables panel), in order', caption, page),
      item('Rename the stage names under the slider to match (and their Text alternative)', names[0], page),
      item('To change the number of stages: duplicate an Image frame (name it with the next number) and a stage name, add an entry to "stages", and space the names along the slider. "total" and the slider\'s top follow the list by themselves', images, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to the slider, then the arrow keys, Home and End', slider, page),
    ];
    return { project, checklist };
  },
};
