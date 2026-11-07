/**
 * Collage: six pictures with captions on one page, in four layouts (grid, banner, feature, columns). The "layout" variable
 * says which shows, buttons let a viewer switch it, and an author keeps the one they like and hides the buttons.
 */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, picture, solid, text, type BrandedStarter } from '../../kit';
import { Flow, announce, heroButtons, onClick, setVar, small, variable } from './helpers';

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
  return [grid, banner, feature, columns];
}

export const collage: BrandedStarter = {
  key: 'explore/collage',
  set: 'explore',
  name: 'Collage',
  description: 'A page of six picture placeholders with captions, for a visual summary, in four layouts: grid, banner, feature and columns. A variable picks the layout and buttons let a viewer switch it. Keep the layout you like and hide the buttons.',
  tags: ['pictures', 'summary', 'layout', 'captions'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Collage');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'A week at university', { kind: 'hero', subtitle: 'A visual summary in six pictures. Try the four layouts to see the pictures arranged different ways.' });
    const page = brandedPage(ctx, 'A week at university', { footer: 'Student life' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'See the collage', to: page, width: 220 }]);

    const layout = variable(ctx, 'layout', 'number', 1);
    variable(ctx, 'showButtons', 'boolean', true);
    variable(ctx, 'items', 'list', JSON.stringify(CAPTIONS.map((c) => ({ caption: c })), null, 1));

    const box = contentBox(page);
    //The layout buttons: the current one is filled
    const label = text(ctx, 'Layout label', 'Layout', box.x, box.y + 8, 70, { fontSize: 15, fontWeight: 700, color: L.muted, bindings: { visible: 'showButtons' } });
    page.children.push(label);
    const switches: SceneNode[] = LAYOUTS.map((name, i) => {
      const b = small(button(ctx, `Layout ${i + 1} button`, name, box.x + 72 + i * 122, box.y, 112, false), 36);
      const on = `layout == ${i + 1}`;
      Object.assign(b, {
        ariaLabel: `${name} layout`,
        bindings: {
          visible: 'showButtons',
          'fill.color': `${on} ? ${JSON.stringify(L.button)} : ${JSON.stringify(L.background)}`,
          color: `${on} ? ${JSON.stringify(L.onButton)} : ${JSON.stringify(L.text)}`,
          ariaDescription: `${on} ? "Current layout" : ""`,
        },
      });
      page.children.push(b);
      return b;
    });

    //Each layout is a frame of its own, with its own six pictures; only the chosen one shows. Captions come from one list
    const areaTop = box.y + 52;
    const frames: SceneNode[] = [];
    const firstPics: SceneNode[] = [];
    layouts().forEach((rects, li) => {
      const kids = rects.flatMap(([x, y, w, h], i) => {
        const pic = picture(ctx, `${LAYOUTS[li]} picture ${i + 1}`, r1(x), r1(y), r1(w), r1(h));
        if (i === 0) firstPics.push(pic);
        const hint = text(ctx, `${LAYOUTS[li]} picture ${i + 1} hint`, `Picture ${i + 1}`, r1(x), r1(y + h / 2 - 22), r1(w), { align: 'center', fontSize: 15, color: L.muted, decorative: true });
        const bar = createNode('rect', { name: `${LAYOUTS[li]} caption ${i + 1} bar`, x: r1(x), y: r1(y + h - 38), width: r1(w), height: 38, cornerRadii: [0, 0, 16, 16], cornerRadius: 0, fill: solid(L.deep), stroke: null, opacity: 0.88, decorative: true } as never);
        const cap = text(ctx, `${LAYOUTS[li]} caption ${i + 1}`, `{items[${i}].caption}`, r1(x + 10), r1(y + h - 38), r1(w - 20), { fontSize: 14, fontWeight: 700, color: L.onDeep, autoSize: 'none', height: 38, verticalAlign: 'middle', lineHeight: 1.15 });
        return [pic, hint, bar, cap];
      });
      const f = createNode('frame', {
        name: `Layout ${li + 1} ${LAYOUTS[li]}`,
        x: box.x,
        y: areaTop,
        width: W,
        height: H,
        fill: null,
        stroke: null,
        clip: false,
        role: 'region',
        ariaLabel: `Collage, ${LAYOUTS[li].toLowerCase()} layout`,
        bindings: { visible: `layout == ${li + 1}`, y: `showButtons ? ${areaTop} : ${box.y}` },
        children: kids,
      } as never);
      frames.push(f);
      page.children.push(f);
    });

    const flow = new Flow(page);
    switches.forEach((b, i) => flow.chain(onClick(b, 'Layout buttons'), setVar(layout, String(i + 1)), announce(`"${LAYOUTS[i]} layout"`)));

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Choose your layout: set the "layout" variable (Variables panel) to 1 Grid, 2 Banner, 3 Feature or 4 Columns. Then delete the layout frames you do not want and set "showButtons" to false to hide the buttons (or delete them)', frames[0], page),
      item('Replace each grey picture in your layout with your own, and give it a text alternative that says what it shows', firstPics[0], page),
      item('Write the six captions once, in the "items" list variable. Every layout reads it. Keep them short, about 20 characters, so they fit the small pictures', frames[0], page),
      item('To use fewer pictures, delete the last ones in the layout and give the rest more room by resizing them', firstPics[2], page),
      item('To change the look of the caption bars, restyle them in your layout (they use the Deep colour of the colourway)', byName(page, 'Grid caption 1 bar'), page),
      item('Change the page title and the footer line', byName(page, 'Page title'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
