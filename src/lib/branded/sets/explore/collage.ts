/**
 * Collage: six pictures with captions on one page, in four layouts (grid, banner, feature, columns). The "layout" variable
 * says which shows, buttons let a viewer switch it, and an author keeps the one they like and hides the buttons.
 *
 * The six pictures are one layer repeated over a live list (`cells`): each copy takes its place and size from the layout's row of
 * the "layouts" list, and its caption and picture from "items". A layout change moves the same six pictures, so an author puts
 * a picture in once, not once for each layout.
 */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, picture, solid, text, todo, type BrandedStarter } from '\.\./\.\./kit';
import { addVar, announce, bind, graph, set } from '../../graph-kit';
import { keyNavList, stack } from '../../parts';
import { heroButtons } from './helpers';

const CAPTIONS = ['Lectures', 'The library', 'Group work', 'Labs and studios', 'Exam time', 'Time to rest'];
const LAYOUTS = ['Grid', 'Banner', 'Feature', 'Columns'];
const W = 928;
const H = 408;
const G = 10;
const r1 = (v: number) => Math.round(v * 10) / 10;

type Rect = [number, number, number, number];

//Where the six pictures go in each layout, inside a W x H area
function layouts(): Rect[][] {
  const colW = (W - 2 * G) / 3;
  const rowH = (H - G) / 2;
  const grid: Rect[] = [0, 1, 2, 3, 4, 5].map((i) => [(i % 3) * (colW + G), Math.floor(i / 3) * (rowH + G), colW, rowH]);
  const small5 = (W - 4 * G) / 5;
  const banner: Rect[] = [[0, 0, W, 196], ...[0, 1, 2, 3, 4].map((i): Rect => [i * (small5 + G), 206, small5, H - 206])];
  const bigW = 500;
  const sideW = (W - bigW - 2 * G) / 2;
  const sideH = (H - 2 * G) / 3;
  const x2 = bigW + G + sideW + G;
  const feature: Rect[] = [[0, 0, bigW, H], [bigW + G, 0, sideW, sideH], [x2, 0, sideW, sideH], [bigW + G, sideH + G, sideW, sideH], [x2, sideH + G, sideW, sideH], [bigW + G, 2 * (sideH + G), W - bigW - G, sideH]];
  const tall = (W - 5 * G) / 6;
  const columns: Rect[] = [0, 1, 2, 3, 4, 5].map((i) => [i * (tall + G), 0, tall, H]);
  return [grid, banner, feature, columns].map((l) => l.map((r) => r.map(r1) as Rect));
}

export const collage: BrandedStarter = {
  key: 'explore/collage',
  set: 'explore',
  name: 'Collage',
  description: 'A page of six picture placeholders with captions, for a visual summary, in four layouts: grid, banner, feature and columns. A variable picks the layout and buttons let a viewer switch it. Keep the layout you like and hide the buttons.',
  tags: ['pictures', 'summary', 'layout', 'captions'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Collage');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'A week at university', { kind: 'hero', subtitle: 'A visual summary in six pictures. Try the four layouts to see the pictures arranged different ways.' });
    const page = brandedPage(ctx, 'A week at university', { footer: 'Student life' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'See the collage', to: 'next', width: 220 }]);

    const layout = addVar(project, 'layout', 'number', 1);
    addVar(project, 'showButtons', 'boolean', true);
    addVar(project, 'layoutNames', 'list', LAYOUTS);
    addVar(project, 'items', 'list', CAPTIONS.map((c) => ({ caption: c, image: '' })));
    addVar(project, 'layouts', 'list', layouts());
    //Live: the six pictures for the chosen layout, each with its place, its size and its own caption and picture
    addVar(project, 'cells', 'list', [], { formula: 'layouts[layout - 1].map((r, i) => ({x: r[0], y: r[1], w: r[2], h: r[3], caption: items[i].caption, image: items[i].image}))', live: true });

    const box = contentBox(page);
    //The layout buttons, one repeated button over "layoutNames": the current one is filled and pressed
    const label = text(ctx, 'Layout label', 'Layout', 0, 0, 70, { fontSize: 15, fontWeight: 700, color: L.muted });
    const on = 'layout == index + 1';
    const pill = bind(button(ctx, 'Layout button', 'Layout', 0, 0, 112, false), {
      label: 'item',
      ariaLabel: 'item + " layout"',
      ariaPressed: on,
      'fill.color': `${on} ? ${JSON.stringify(L.button)} : ${JSON.stringify(L.background)}`,
      color: `${on} ? ${JSON.stringify(L.onButton)} : ${JSON.stringify(L.text)}`,
    });
    Object.assign(pill, { height: 36, cornerRadius: 18 });
    const buttons = keyNavList('Layout buttons', 0, 0, LAYOUTS.length * 112 + (LAYOUTS.length - 1) * 10, 36, { items: 'layoutNames', row: pill, orientation: 'horizontal', gap: 10, ariaLabel: 'Layouts' });
    const bar = bind(stack('Layout bar', box.x, box.y, box.width, { direction: 'row', gap: 12, align: 'center', children: [label, buttons] }), { visible: 'showButtons' });
    page.children.push(bar);

    //The pictures: one cell repeated, each copy placed by its row of the chosen layout. Captions and pictures come from "items"
    const pic = picture(ctx, 'Collage picture', 0, 0, W / 3, H / 2);
    bind(pic, { width: 'item.w', height: 'item.h', ariaLabel: '"Picture " + (index + 1) + ": " + item.caption' });
    const image = createNode('image', { name: 'Collage image', x: 0, y: 0, width: W / 3, height: H / 2, assetId: null, fit: 'cover', cornerRadius: 16, decorative: true, bindings: { assetId: 'item.image', width: 'item.w', height: 'item.h' } } as never);
    const hint = bind(text(ctx, 'Collage picture hint', 'Picture {index + 1}', 0, 0, W / 3, { align: 'center', fontSize: 15, color: L.muted, decorative: true }), { width: 'item.w', y: 'item.h / 2 - 22' });
    const bandBar = createNode('rect', { name: 'Caption bar', x: 0, y: H / 2 - 38, width: W / 3, height: 38, cornerRadii: [0, 0, 16, 16], cornerRadius: 0, fill: solid(L.deep), stroke: null, opacity: 0.88, decorative: true, bindings: { width: 'item.w', y: 'item.h - 38' } } as never);
    const caption = bind(text(ctx, 'Caption', '{item.caption}', 10, H / 2 - 38, W / 3 - 20, { fontSize: 14, fontWeight: 700, color: L.onDeep, autoSize: 'none', height: 38, verticalAlign: 'middle', lineHeight: 1.15 }), { width: 'item.w - 20', y: 'item.h - 38' });
    const cell = createNode('frame', {
      name: 'Collage cell',
      x: 0,
      y: 0,
      width: W / 3,
      height: H / 2,
      fill: null,
      stroke: null,
      clip: false,
      bindings: { x: 'item.x', y: 'item.y', width: 'item.w', height: 'item.h' },
      children: [pic, image, hint, bandBar, caption],
    } as never);
    const areaTop = box.y + 52;
    const area = createNode('frame', {
      name: 'Collage',
      x: box.x,
      y: areaTop,
      width: W,
      height: H,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      bindings: { y: `showButtons ? ${areaTop} : ${box.y}`, ariaLabel: '"Collage, " + layoutNames[layout - 1].toLowerCase() + " layout"' },
      repeat: { items: 'cells', layout: 'none', gap: 0, columns: 1 },
      children: [cell],
    } as never);
    page.children.push(area);

    //One flow for the four buttons: the click gives the copy that was pressed
    const g = graph(page);
    g.run(g.event('event.pointer', { target: buttons.id, type: 'click', childrenOnly: true }, 'Layout buttons'), set(layout, 'event.childIndex + 1'), announce('layoutNames[layout - 1] + " layout"'));

    //Notes for whoever edits the template, below the page
    const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
    addNote(page, { ...below(0, 440), text: '**One repeated cell.** The six pictures are a single layer over the live list `cells`; each layout is a row of rectangles in `layouts`. Switching layout moves the same pictures, so each picture is set once.', colour: 'sky' });
    addNote(page, { ...below(456, 440), text: '[ ] Put each picture\'s asset id and caption in `items`. To make a fifth layout, add a row of six rectangles to `layouts` and a name to `layoutNames`.', colour: 'gold' });
    addNote(page, { ...below(912, 380), text: '**Keeping one layout?** Set `layout` to it and `showButtons` to false: the pictures move up into the room the buttons had.', colour: 'sky' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      todo('Choose your layout and the buttons', 'Choose your layout: set the "layout" variable (Variables panel) to 1 Grid, 2 Banner, 3 Feature or 4 Columns, and set "showButtons" to false to hide the buttons (or delete them). The pictures move up into the room the buttons had', area, page),
      todo('Add your pictures, one to each entry', 'Put each picture in the "items" list variable: upload the image and put its asset id in that entry\'s "image" (the grey box shows until you do). Every layout shows the same six pictures', area, page),
      todo('Write the six captions, kept short', 'Write the six captions once, in the "items" list variable. Keep them short, about 20 characters, so they fit the small pictures', area, page),
      todo('To use fewer pictures, trim the list and the layouts', 'To use fewer pictures, remove the last entries from "items" and the last rectangles from each row of "layouts"; to move or resize a picture in a layout, change its rectangle (x, y, width, height) in "layouts"', area, page),
      todo('Restyle the caption bars if you like', 'To change the look of the caption bars, restyle them in the Collage cell (they use the Deep colour of the colourway)', cell, page),
      item('Change the page title and the footer line', byName(page, 'Page title'), page),
    ];
    return { project, checklist };
  },
};
