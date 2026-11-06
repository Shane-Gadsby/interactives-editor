/** Image hotspots: a picture with numbered points; each opens a panel with a heading, text and an optional picture. */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { Flow, announce, focusOn, goTo, heroButtons, ifNode, onClick, onKey, setVar, startOver, variable, wait } from './helpers';

const SPOTS = [
  { title: '1. Evaporation', body: 'The sun warms the water in oceans, lakes and rivers. Some of it turns into water vapour and rises into the air.', x: 110, y: 190 },
  { title: '2. Condensation', body: 'High in the air it is cooler. The vapour cools and turns back into tiny droplets, which gather as clouds.', x: 340, y: 110 },
  { title: '3. Precipitation', body: 'When the droplets in a cloud grow heavy enough they fall as rain, hail or snow.', x: 500, y: 240 },
  { title: '4. Runoff', body: 'Water that lands on the ground and cannot soak in flows downhill into streams and rivers, and back towards the sea.', x: 230, y: 330 },
  { title: '5. Infiltration', body: 'Some of the water soaks into the soil and moves down into the ground, where it feeds plants and refills groundwater.', x: 440, y: 370 },
];

const HOT = 44;

export const imageHotspots: BrandedStarter = {
  key: 'explore/image-hotspots',
  set: 'explore',
  name: 'Image hotspots',
  description: 'A large picture with five numbered points. Selecting one (or pressing Enter on it) opens a panel with a heading, text and an optional picture, with a Close button and Esc. Points you have opened show a ring, and a count says how many you have explored.',
  tags: ['picture', 'reveal', 'keyboard friendly', 'hotspots'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Image hotspots');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'The water cycle', { kind: 'hero', subtitle: 'Explore the picture and open each numbered point to find out what happens at that stage.' });
    const page = brandedPage(ctx, 'Explore the water cycle', { footer: 'The water cycle' });
    const end = brandedPage(ctx, 'You have explored every point', { kind: 'end' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: page }]);

    const open = variable(ctx, 'open', 'number', 0);
    const explored = variable(ctx, 'explored', 'number', 0);
    variable(ctx, 'total', 'number', SPOTS.length);
    const seen = SPOTS.map((_, i) => variable(ctx, `seen${i + 1}`, 'boolean', false));

    const box = contentBox(page);
    const PICW = 616;
    const pic = picture(ctx, 'Main picture', box.x, box.y, PICW, 452);
    const picHint = text(ctx, 'Picture hint', 'Replace this with your picture', box.x, box.y + 210, PICW, { align: 'center', color: L.muted, fontSize: 16, decorative: true });
    page.children.push(pic, picHint);

    //Right column: what to do, the count and a bar
    const colX = box.x + PICW + 32;
    const colW = box.width - PICW - 32;
    const intro = text(ctx, 'Instructions', 'Select each numbered point on the picture to learn about that stage. Press Esc to close a panel.', colX, box.y, colW, { fontSize: 18 });
    const count = text(ctx, 'Explored count', '{explored} of {total} explored', colX, box.y + 150, colW, { fontSize: 24, fontWeight: 700, color: L.deep });
    const track = createNode('rect', { name: 'Progress track', x: colX, y: box.y + 196, width: colW, height: 10, cornerRadius: 5, fill: solid(L.surfaceMuted), stroke: null, decorative: true } as never);
    const fill = createNode('rect', { name: 'Progress fill', x: colX, y: box.y + 196, width: 0, height: 10, cornerRadius: 5, fill: solid(L.accent), stroke: null, decorative: true, bindings: { width: `explored / total * ${colW}` } } as never);
    const finish = button(ctx, 'Finish', 'Finish', colX, box.y + 240, 160);
    Object.assign(finish, { bindings: { visible: 'explored >= total' } });
    page.children.push(intro, count, track, fill, finish);

    //Hotspots
    const hots: SceneNode[] = [];
    SPOTS.forEach((s, i) => {
      const ring = createNode('ellipse', { name: `Hotspot ${i + 1} explored ring`, x: -7, y: -7, width: HOT + 14, height: HOT + 14, fill: null, stroke: stroke(L.success, 4), decorative: true, bindings: { visible: seen[i].name } } as never);
      const num = text(ctx, `Hotspot ${i + 1} number`, String(i + 1), 0, 10, HOT, { fontSize: 18, fontWeight: 700, align: 'center', color: L.onButton, decorative: true });
      const hot = createNode('frame', {
        name: `Hotspot ${i + 1}`,
        x: box.x + s.x,
        y: box.y + s.y,
        width: HOT,
        height: HOT,
        cornerRadius: HOT / 2,
        fill: solid(L.button),
        stroke: stroke(L.background, 3),
        clip: false,
        role: 'button',
        ariaLabel: `Hotspot ${i + 1}: ${s.title.replace(/^\d+\.\s*/, '')}`,
        bindings: { ariaDescription: `${seen[i].name} ? "Already explored" : ""` },
        children: [ring, num],
      } as never);
      hots.push(hot);
      page.children.push(hot);
    });

    //The panels, last so they sit above everything, each with a Close button
    const scrim = createNode('rect', { name: 'Panel backdrop', x: 0, y: 0, width: page.width, height: page.height, fill: solid(L.deep), stroke: null, opacity: 0.6, decorative: true, bindings: { visible: 'open > 0' } } as never);
    page.children.push(scrim);
    const heads: SceneNode[] = [];
    const bodies: SceneNode[] = [];
    const closes: SceneNode[] = [];
    const pics: SceneNode[] = [];
    SPOTS.forEach((s, i) => {
      const h = heading(ctx, `Panel ${i + 1} heading`, s.title, 32, 28, 636, { fontSize: 26, focusable: true });
      const b = text(ctx, `Panel ${i + 1} text`, s.body, 32, 84, 380, { fontSize: 18, lineHeight: 1.4 });
      const p = picture(ctx, `Panel ${i + 1} picture`, 448, 84, 220, 224);
      const c = button(ctx, `Panel ${i + 1} close`, 'Close', 32, 324, 140, true);
      const panel = createNode('frame', {
        name: `Panel ${i + 1}`,
        x: 162,
        y: 120,
        width: 700,
        height: 394,
        cornerRadius: 20,
        fill: solid(L.background),
        stroke: stroke(L.border, 2),
        clip: false,
        role: 'region',
        bindings: { visible: `open == ${i + 1}` },
        children: [h, b, p, c],
      } as never);
      heads.push(h);
      bodies.push(b);
      closes.push(c);
      pics.push(p);
      page.children.push(panel);
    });

    //The end page
    const again = button(ctx, 'Explore again', 'Explore again', (end.width - 200) / 2, end.height / 2 + 90, 200, false);
    end.children.push(again);
    new Flow(end).chain(onClick(again, 'Start over'), startOver());

    //The graph: open a panel (marking the point explored), close it, Esc
    const flow = new Flow(page);
    const sum = seen.map((v) => `(${v.name} ? 1 : 0)`).join(' + ');
    SPOTS.forEach((_, i) => {
      flow.chain(onClick(hots[i], 'Open a panel'), setVar(seen[i], 'true'), setVar(explored, sum), setVar(open, String(i + 1)), wait(80), focusOn(heads[i]));
    });
    SPOTS.forEach((_, i) => {
      flow.chain(onClick(closes[i], 'Close a panel'), setVar(open, '0'), wait(80), focusOn(hots[i]));
      flow.gate([onKey('Escape', undefined, 'Close a panel')], ifNode(`open == ${i + 1}`), [setVar(open, '0'), wait(80), focusOn(hots[i])]);
    });
    flow.chain(onClick(finish, 'Pages'), announce('"All " + total + " points explored"'), goTo(end));

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the one-line introduction on the first page', byName(hero, 'Page title'), hero),
      item('Replace the grey picture with your own (select it and swap the image, or place an image over it)', pic, page),
      item('Drag each numbered point to the right place on your picture, and rename it so a screen reader says where it is (Text alternative)', hots[0], page),
      item('Write the heading and the text of each panel', bodies[0], page),
      item('Add a picture to a panel, or delete the grey picture in the panels that do not need one', pics[0], page),
      item('To add a point: duplicate a hotspot and its panel, add a seen variable and copy the open, close and Esc flows (Interactions tab), then raise the "total" variable', undefined, page),
      item('Change the footer line and the text on the last page', byName(page, 'Footer text'), page),
      item('Try it with the keyboard: Tab to a point, Enter to open it, Esc to close it', undefined, page),
    ];
    return { project: ctx.project, checklist };
  },
};
