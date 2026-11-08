/** Image hotspots: a picture with numbered points; each opens a dialog with a heading, text and an optional picture. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, overlay, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { addVar, announce, bind, click, goNext, graph, set } from '../../graph-kit';
import { dialogPanel, progressBar, stack } from '../../parts';
import { heroButtons } from './helpers';

//The points are one list: what each is called, what its panel says. Where a point sits is its layer on the picture (drag it)
const SPOTS = [
  { title: 'Evaporation', body: 'The sun warms the water in oceans, lakes and rivers. Some of it turns into water vapour and rises into the air.', x: 110, y: 190 },
  { title: 'Condensation', body: 'High in the air it is cooler. The vapour cools and turns back into tiny droplets, which gather as clouds.', x: 340, y: 110 },
  { title: 'Precipitation', body: 'When the droplets in a cloud grow heavy enough they fall as rain, hail or snow.', x: 500, y: 240 },
  { title: 'Runoff', body: 'Water that lands on the ground and cannot soak in flows downhill into streams and rivers, and back towards the sea.', x: 230, y: 330 },
  { title: 'Infiltration', body: 'Some of the water soaks into the soil and moves down into the ground, where it feeds plants and refills groundwater.', x: 440, y: 370 },
];

const HOT = 44;

export const imageHotspots: BrandedStarter = {
  key: 'explore/image-hotspots',
  set: 'explore',
  name: 'Image hotspots',
  description: 'A large picture with five numbered points. Selecting one (or pressing Enter on it) opens a dialog with a heading, text and an optional picture, with a Close button and Esc. Points you have opened show a ring, and a count and a progress bar say how many you have explored.',
  tags: ['picture', 'reveal', 'keyboard friendly', 'hotspots'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Image hotspots');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'The water cycle', { kind: 'hero', subtitle: 'Explore the picture and open each numbered point to find out what happens at that stage.' });
    const page = brandedPage(ctx, 'Explore the water cycle', { footer: 'The water cycle  ·  Page {pageNumber} of {pageCount}' });
    const end = brandedPage(ctx, 'You have explored every point', { kind: 'end' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next' }]);

    addVar(project, 'spots', 'list', SPOTS.map(({ title, body }) => ({ title, body })));
    //One flag a point, in the order of the layers in Hotspots: the live count below reads them
    const seen = addVar(project, 'seen', 'list', SPOTS.map(() => false));
    addVar(project, 'explored', 'number', 0, { formula: 'seen.filter(s => s).length', live: true });
    const open = addVar(project, 'open', 'boolean', false);
    const current = addVar(project, 'current', 'number', 0);

    const box = contentBox(page);
    const PICW = 616;
    const pic = picture(ctx, 'Main picture', box.x, box.y, PICW, 452);
    const picHint = text(ctx, 'Picture hint', 'Replace this with your picture', box.x, box.y + 210, PICW, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
    page.children.push(pic, picHint);

    //The points sit in one frame over the picture: one click flow serves them all (event.childIndex is which)
    const hots: SceneNode[] = SPOTS.map((s, i) => {
      const ring = createNode('ellipse', { name: `Point ${i + 1} explored ring`, x: -7, y: -7, width: HOT + 14, height: HOT + 14, fill: null, stroke: stroke(L.success, 4), decorative: true, bindings: { visible: `seen[${i}]` } } as never);
      const num = text(ctx, `Point ${i + 1} number`, String(i + 1), 0, 10, HOT, { fontSize: 18, fontWeight: 700, align: 'center', color: L.onPrimary, decorative: true });
      return createNode('frame', {
        name: `Point ${i + 1}`,
        x: s.x,
        y: s.y,
        width: HOT,
        height: HOT,
        cornerRadius: HOT / 2,
        fill: solid(L.primary),
        stroke: stroke(L.background, 3),
        clip: false,
        role: 'button',
        ariaLabel: `Point ${i + 1}: ${s.title}`,
        bindings: { ariaDescription: `seen[${i}] ? "Already explored" : ""` },
        children: [ring, num],
      } as never);
    });
    const points = createNode('frame', { name: 'Points', x: box.x, y: box.y, width: PICW, height: 452, fill: null, stroke: null, clip: false, children: hots } as never);
    page.children.push(points);

    //Right column: what to do, the count and a bar. Finish only takes room once everything is open
    const colX = box.x + PICW + 32;
    const colW = box.width - PICW - 32;
    const intro = text(ctx, 'Instructions', 'Select each numbered point on the picture to learn about that stage. Press Esc to close the panel.', 0, 0, colW, { fontSize: 18 });
    const count = text(ctx, 'Explored count', '{explored} of {spots.length} explored', 0, 0, colW, { fontSize: 24, fontWeight: 700, color: L.logoTextOnLight });
    const bar = progressBar(ctx, 'Explored progress', 0, 0, colW, { value: 'explored', max: 'spots.length', label: 'Points explored', valueText: '{value} of {max} explored' });
    const finish = bind(button(ctx, 'Finish', 'Finish', 0, 0, 160), { visible: 'explored >= spots.length' });
    const finishRow = stack('Finish row', 0, 0, colW, { direction: 'row', align: 'start', children: [finish] });
    const side = stack('Side column', colX, box.y, colW, { gap: 20, children: [intro, count, bar, finishRow] });
    page.children.push(side);

    //The dialog: one panel for every point, its words read from the list by which point opened it
    const title = `spots[current].title`;
    const body = text(ctx, 'Dialog text', '{spots[current].body}', 24, 64, 380, { fontSize: 18, lineHeight: 1.4 });
    const dpic = picture(ctx, 'Dialog picture', 436, 64, 220, 224);
    const dialog = dialogPanel(ctx, page, 'Point dialog', open, { x: 162, y: 120, width: 680, height: 394, title: 'Point', children: [body, dpic] });
    bind(dialog.title, { text: `(current + 1) + ". " + ${title}` });
    bind(dialog.frame, { ariaLabel: title });
    //It sits over the picture and its points on purpose, once it is open
    overlay(dialog.frame);

    //The end page
    const again = button(ctx, 'Explore again', 'Explore again', (end.width - 200) / 2, end.height / 2 + 90, 200, false);
    end.children.push(again);
    {
      const g = graph(end);
      g.run(click(g, again, 'Start over'), ['action.startOver', {}]);
    }

    //Opening a point: mark it seen, remember which, open the dialog. Esc and Close come with the dialog
    {
      const g = graph(page);
      const press = click(g, points, 'Open a point');
      press.params.childrenOnly = true;
      g.run(press, ['action.setVariable', { variable: seen.id, op: 'setItem', index: 'event.childIndex', value: 'true' }], set(current, 'event.childIndex'), set(open, 'true'));
      g.run(click(g, finish, 'Pages'), announce('"All " + spots.length + " points explored"'), goNext());
    }

    const below = (x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(page, { ...below(0), colour: 'sky', text: '**One flow for every point** The points are layers of one frame, and `event.childIndex` says which was pressed, so the same flow opens the right entry of `spots`. Drag a point to move it.' });
    addNote(page, { ...below(316), colour: 'sky', text: '**Dialog** The panel is a native dialog: focus stays inside, Esc closes it and focus goes back to the point. It reads its heading and text from `spots`, so there is one panel to style.' });
    addNote(page, { ...below(632), colour: 'gold', text: '[ ] Swap the grey picture, drag each point onto its place, and write each point in `spots` in the same order as the layers in Points.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the one-line introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace the grey picture with your own (select it and swap the image, or place an image over it)', pic, page),
      item('Drag each numbered point to the right place on your picture, and rename it so a screen reader says where it is (Text alternative)', hots[0], page),
      item('Write what each point says: the "spots" list variable (Variables panel) has a title and text for each, in the same order as the points in the Points frame', undefined, page),
      item('Add a picture to the dialog, or delete the grey one if the points need none', dpic, page),
      item('To add a point: duplicate a point inside the Points frame, change its number and ring rule, add a false to the "seen" list and an entry to "spots". No flow to copy', points, page),
      item('Change the footer line and the text on the last page', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to a point, Enter to open it, Esc to close it', undefined, page),
    ];
    return { project, checklist };
  },
};
