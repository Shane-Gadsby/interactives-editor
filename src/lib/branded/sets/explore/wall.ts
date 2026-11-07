/**
 * Information wall: twelve panels (title, text, picture, tags) in a grid that a search box filters as you type and tag buttons
 * narrow down. The panels are one repeated layer over a list variable, so the wall is written once, in the "panels" list.
 */
import { createNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { Flow, announce, heroButtons, n, onClick, setVar, small, variable } from './helpers';

const PANELS = [
  { title: 'Make a weekly plan', text: 'Block out classes, study and rest before the week begins.', tags: ['Planning'] },
  { title: 'Break big tasks down', text: 'Split an assignment into small steps, each with its own date.', tags: ['Planning', 'Writing'] },
  { title: 'Set up a study space', text: 'A tidy, quiet spot with what you need close by helps you start.', tags: ['Planning', 'Wellbeing'] },
  { title: 'Skim before you read', text: 'Look at headings and summaries first to see where a text is going.', tags: ['Reading'] },
  { title: 'Read with a question', text: 'Decide what you want to find out, then read to answer it.', tags: ['Reading'] },
  { title: 'Take notes in your words', text: 'Putting ideas in your own words shows what you understand.', tags: ['Reading', 'Writing'] },
  { title: 'Plan before you write', text: 'A short outline keeps your argument in order.', tags: ['Writing'] },
  { title: 'One idea per paragraph', text: 'Start with the point, then back it up with evidence.', tags: ['Writing'] },
  { title: 'Reference as you go', text: 'Note each source when you use it, so citing is easy later.', tags: ['Writing', 'Reading'] },
  { title: 'Take regular breaks', text: 'Short breaks help you keep your focus over a long session.', tags: ['Wellbeing'] },
  { title: 'Sleep and food matter', text: 'Rest and regular meals help you remember what you study.', tags: ['Wellbeing'] },
  { title: 'Ask for help early', text: 'Talk to your teacher or support services before things pile up.', tags: ['Wellbeing', 'Planning'] },
].map((p) => ({ ...p, image: '' }));
const TAGS = ['Planning', 'Reading', 'Writing', 'Wellbeing'];

//Which panels the search box and the tag let through. Used by the wall and by the count, so they always agree
const SHOWN =
  'panels.filter(p => (tag == "" || p.tags.includes(tag)) && (query.trim() == "" || (p.title + " " + p.text + " " + p.tags.join(" ")).toLowerCase().includes(query.trim().toLowerCase())))';

const TILE_W = 224;
const TILE_H = 120;
const GAP = 8;

export const informationWall: BrandedStarter = {
  key: 'explore/information-wall',
  set: 'explore',
  name: 'Information wall',
  description: 'A wall of twelve information panels, each with a title, a line of text, a picture and tags. A search box filters the wall as you type, tag buttons narrow it to a topic, and a count says how many panels are showing. Write the panels once, in a list.',
  tags: ['search', 'filter', 'reference', 'tags'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Information wall');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'Study skills wall', { kind: 'hero', subtitle: 'Twelve tips in one place. Search the wall, or pick a topic to narrow it down.' });
    const page = brandedPage(ctx, 'Study skills wall', { footer: 'Study skills' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Open the wall', to: page, width: 220 }]);

    variable(ctx, 'panels', 'list', JSON.stringify(PANELS, null, 1));
    const query = variable(ctx, 'query', 'string', '');
    const tag = variable(ctx, 'tag', 'string', '');

    const box = contentBox(page);
    //The search box, the count and a way back to everything
    const search = createNode('input', {
      name: 'Search box',
      ...lookDefaults(project, 'input'),
      inputType: 'text',
      placeholder: 'Search the wall',
      variableId: query.id,
      value: '',
      x: box.x,
      y: box.y,
      width: 380,
      height: 40,
      cornerRadius: 20,
      fontSize: 17,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
      ariaLabel: 'Search the wall',
    } as never);
    const count = text(ctx, 'Count', `Showing {${SHOWN}.length} of {panels.length}`, box.x + 404, box.y + 9, 300, { fontSize: 17, fontWeight: 700 });
    const clear = small(button(ctx, 'Clear button', 'Clear filters', box.x + box.width - 160, box.y, 160, false));
    clear.bindings = { visible: 'query != "" || tag != ""' };
    page.children.push(search, count, clear);

    //Tag buttons: the chosen one is filled, and pressing it again lets everything through
    const ty = box.y + 48;
    const tagButtons: SceneNode[] = [];
    let tx = box.x;
    const tagList = [{ name: 'All', value: '' }, ...TAGS.map((t) => ({ name: t, value: t }))];
    tagList.forEach((t) => {
      const width = Math.max(72, t.name.length * 10 + 40);
      const b = small(button(ctx, `Tag ${t.name}`, t.name, tx, ty, width, false), 34);
      const on = `tag == ${JSON.stringify(t.value)}`;
      Object.assign(b, {
        bindings: {
          'fill.color': `${on} ? ${JSON.stringify(L.button)} : ${JSON.stringify(L.background)}`,
          color: `${on} ? ${JSON.stringify(L.onButton)} : ${JSON.stringify(L.text)}`,
          ariaDescription: `${on} ? "Showing this topic" : ""`,
        },
      });
      tagButtons.push(b);
      page.children.push(b);
      tx += width + 10;
    });

    //The wall: one tile repeated for every panel that gets through
    const picture = createNode('frame', {
      name: 'Panel picture',
      x: 10,
      y: 10,
      width: 44,
      height: 44,
      cornerRadius: 10,
      fill: solid(L.surfaceMuted),
      stroke: null,
      clip: true,
      decorative: true,
      children: [createNode('image', { name: 'Panel image', x: 0, y: 0, width: 44, height: 44, assetId: null, fit: 'cover', cornerRadius: 0, decorative: true, bindings: { assetId: 'item.image' } } as never)],
    } as never);
    const tile = createNode('frame', {
      name: 'Panel',
      x: 0,
      y: 0,
      width: TILE_W,
      height: TILE_H,
      cornerRadius: 14,
      fill: solid(L.surface),
      stroke: null,
      clip: false,
      role: 'region',
      bindings: { ariaLabel: 'item.title + ". Topics: " + item.tags.join(", ")' },
      children: [
        picture,
        text(ctx, 'Panel title', '{item.title}', 62, 8, TILE_W - 72, { fontSize: 15, fontWeight: 700, lineHeight: 1.2, autoSize: 'none', height: 48, verticalAlign: 'middle', decorative: true }),
        text(ctx, 'Panel text', '{item.text}', 10, 62, TILE_W - 20, { fontSize: 12.5, lineHeight: 1.35, autoSize: 'none', height: 34, decorative: true }),
        text(ctx, 'Panel tags', '{item.tags.join(" · ")}', 10, 98, TILE_W - 20, { fontSize: 11.5, fontWeight: 600, color: L.muted, autoSize: 'none', height: 16, decorative: true }),
      ],
    } as never);
    const wall = createNode('frame', {
      name: 'Wall',
      x: box.x,
      y: box.y + 94,
      width: TILE_W * 4 + GAP * 3,
      height: TILE_H * 3 + GAP * 2,
      fill: null,
      stroke: null,
      clip: false,
      role: 'region',
      ariaLabel: 'Study tips',
      repeat: { items: SHOWN, layout: 'grid', gap: GAP, columns: 4 },
      children: [tile],
    } as never);
    const none = text(ctx, 'Nothing found', 'No panels match. Try another word, or clear the filters.', box.x, box.y + 110, box.width, { fontSize: 20, fontWeight: 600, color: L.muted, align: 'center', bindings: { visible: `${SHOWN}.length == 0` } });
    page.children.push(wall, none);

    const flow = new Flow(page);
    tagList.forEach((t, i) => flow.chain(onClick(tagButtons[i], 'Tag buttons'), setVar(tag, t.value ? `tag == ${JSON.stringify(t.value)} ? "" : ${JSON.stringify(t.value)}` : '""')));
    flow.chain(onClick(clear, 'Clear'), setVar(query, '""'), setVar(tag, '""'));
    //Say how many are left when the search or the tag changes (the wall itself redraws without any help)
    const say = () => announce(`${SHOWN}.length + " of " + panels.length + " panels showing"`);
    flow.chain(n('event.variable', { variable: query.id }, 'Say the count'), say());
    flow.chain(n('event.variable', { variable: tag.id }, 'Say the count'), say());

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write your twelve panels in the "panels" list variable (Variables panel): a title, a line of text, a list of tags and an image for each. The wall, the search and the count all follow it', wall, page),
      item('Keep the text short, about 60 characters: a tile has room for two lines. For longer text, make the tile taller and the wall frame to match', byName(page, 'Count'), page),
      item('To give a panel its own picture, upload the image and put its asset id in that entry\'s "image" (the grey box shows until you do)', wall, page),
      item('Restyle the tile once (the layers inside the Wall frame): every panel is the same layer, repeated', tile, page),
      item('Change the tag buttons to match your tags: rename a button, then change the name in its click flow (Interactions tab). Tags in "panels" must be spelled the same way', tagButtons[1], page),
      item('To add or remove a panel, add or remove an entry in "panels". For more than twelve, make the Wall frame taller and mind the footer', wall, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project, checklist };
  },
};
