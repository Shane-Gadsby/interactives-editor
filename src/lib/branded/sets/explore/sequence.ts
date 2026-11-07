/**
 * Image sequence: six pictures shown one at a time as a slider moves through them (a process or growth over time), with a
 * caption for each, Previous and Next, clickable stage names under the slider, and the keyboard arrows on the slider.
 */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { Flow, announce, focusOn, heroButtons, n, onClick, setVar, variable, wait } from './helpers';

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
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: page }]);

    const step = variable(ctx, 'step', 'number', 1);
    variable(ctx, 'total', 'number', N);
    variable(ctx, 'stages', 'list', JSON.stringify(STAGES.map((s) => ({ title: s.title, caption: s.caption })), null, 1));

    const box = contentBox(page);
    //One frame for each picture, only the current one showing
    const frames: SceneNode[] = [];
    const pics: SceneNode[] = [];
    STAGES.forEach((s, i) => {
      const pic = picture(ctx, `Image ${i + 1} picture`, 0, 0, PIC_W, PIC_H);
      const hint = text(ctx, `Image ${i + 1} picture hint`, 'Replace with your picture', 0, PIC_H / 2 - 12, PIC_W, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
      const f = createNode('frame', {
        name: `Image ${i + 1}`,
        x: box.x,
        y: box.y,
        width: PIC_W,
        height: PIC_H,
        fill: null,
        stroke: null,
        clip: false,
        role: 'region',
        ariaLabel: `Image ${i + 1} of ${N}: ${s.title}`,
        bindings: { visible: `step == ${i + 1}` },
        children: [pic, hint],
      } as never);
      frames.push(f);
      pics.push(pic);
      page.children.push(f);
    });

    //The caption beside the picture follows the stage
    const colX = box.x + PIC_W + 32;
    const colW = box.width - PIC_W - 32;
    const kicker = text(ctx, 'Stage count', 'Stage {step} of {total}', colX, box.y, colW, { fontSize: 15, fontWeight: 700, color: L.muted });
    const title = heading(ctx, 'Stage title', '{stages[step - 1].title}', colX, box.y + 26, colW, { fontSize: 26 });
    const caption = text(ctx, 'Stage caption', '{stages[step - 1].caption}', colX, box.y + 74, colW, { fontSize: 18, lineHeight: 1.45 });
    const prev = button(ctx, 'Previous', 'Previous', colX, box.y + 236, 160, false);
    const next = button(ctx, 'Next', 'Next', colX + colW - 160, box.y + 236, 160, true);
    Object.assign(prev, { bindings: { disabled: 'step <= 1' } });
    Object.assign(next, { bindings: { disabled: 'step >= total' } });
    const help = text(ctx, 'Keyboard help', 'Drag the slider, or use the left and right arrow keys. Home and End go to the first and last stage.', colX, box.y + 296, colW, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
    page.children.push(kicker, title, caption, prev, next, help);

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
      bindings: { ariaDescription: '"Stage " + step + " of " + total + ": " + stages[step - 1].title' },
    } as never);
    page.children.push(slider);
    //(a range's thumb runs from half a thumb in to half a thumb short of each end)
    const span = PIC_W - 16;
    const names: SceneNode[] = STAGES.map((s, i) =>
      text(ctx, `Stage ${i + 1} name`, s.short, box.x + 8 + (i * span) / (N - 1) - 46, sy + 40, 92, {
        fontSize: 13,
        align: 'center',
        role: 'button',
        ariaLabel: `Go to stage ${i + 1}: ${s.title}`,
        bindings: { fontWeight: `step == ${i + 1} ? 700 : 400`, color: `step == ${i + 1} ? ${JSON.stringify(L.text)} : ${JSON.stringify(L.muted)}`, ariaDescription: `step == ${i + 1} ? "Current stage" : ""` },
      })
    );
    page.children.push(...names);

    //Moving to a stage says which one. Previous, Next and the names set the same variable the slider is tied to
    const flow = new Flow(page);
    flow.chain(n('event.start'), wait(80), focusOn(slider));
    flow.chain(onClick(prev, 'Step'), setVar(step, 'step <= 1 ? 1 : step - 1'));
    flow.chain(onClick(next, 'Step'), setVar(step, 'step >= total ? total : step + 1'));
    names.forEach((nm, i) => flow.chain(onClick(nm, 'Stage names'), setVar(step, String(i + 1))));
    flow.chain(n('event.variable', { variable: step.id }, 'Say the stage'), announce('"Stage " + step + " of " + total + ": " + stages[step - 1].title'));

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace each grey picture with your own, and give it a text alternative that says what it shows. The pictures are in the Image 1 to Image 6 frames, one on top of the other', pics[0], page),
      item('Write each stage\'s title and caption in the "stages" list variable (Variables panel), in order', caption, page),
      item('Rename the stage names under the slider to match (and their Text alternative)', names[0], page),
      item('To change the number of stages: duplicate an Image frame and a stage name, bind them to the next number, add an entry to "stages", then raise "total" and the slider\'s Max (Inspector)', slider, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to the slider, then the arrow keys, Home and End', slider, page),
    ];
    return { project, checklist };
  },
};
