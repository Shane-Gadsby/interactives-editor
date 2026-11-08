/**
 * Information wall: twelve panels (title, text, picture, tags) in a grid that a search box filters as you type and tag buttons
 * narrow down. The panels are one repeated layer over a list variable, so the wall is written once, in the "panels" list.
 */
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT } from '../../looks';
import { addVar, announce, bind, click, graph, set, type ActionStep } from '../../graph-kit';
import { fill, keyNavList, stack } from '../../parts';
import { heroButtons } from './helpers';

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
//The first topic is the one that lets everything through
const TOPICS = ['All', 'Planning', 'Reading', 'Writing', 'Wellbeing'];

//Which panels the search box and the tag let through: a live variable, so the wall, the count and the "nothing found" line always agree
const SHOWN =
  'panels.filter(p => (tag == "" || p.tags.includes(tag)) && (query.trim() == "" || (p.title + " " + p.text + " " + p.tags.join(" ")).toLowerCase().includes(query.trim().toLowerCase())))';

const TILE_W = 224;
const TILE_H = 112;
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
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Open the wall', to: 'next', width: 220 }]);

    addVar(project, 'panels', 'list', PANELS);
    addVar(project, 'topics', 'list', TOPICS);
    const query = addVar(project, 'query', 'string', '');
    const tag = addVar(project, 'tag', 'string', '');
    const shown = addVar(project, 'shown', 'list', [], { formula: SHOWN, live: true });

    const box = contentBox(page);
    //The search box, the count and a way back to everything, in one row (the count takes what the search box and Clear leave)
    const search = createNode('input', {
      name: 'Search box',
      ...lookDefaults(project, 'input'),
      inputType: 'text',
      placeholder: 'Search the wall',
      variableId: query.id,
      value: '',
      x: 0,
      y: 0,
      width: 380,
      height: 40,
      cornerRadius: 20,
      fontSize: 17,
      fontFamily: BRAND_FONT,
      stroke: stroke(L.border, 2),
      ariaLabel: 'Search the wall',
    } as never);
    const count = text(ctx, 'Count', 'Showing {shown.length} of {panels.length}', 0, 0, 100, { fontSize: 17, fontWeight: 700 });
    const clear = bind(button(ctx, 'Clear button', 'Clear filters', 0, 0, 160, false), { visible: 'query != "" || tag != ""' });
    Object.assign(clear, { height: 40, cornerRadius: 20 });
    const bar = stack('Search row', box.x, box.y, box.width, { direction: 'row', gap: 24, align: 'center', children: [search, fill(count), clear] });
    page.children.push(bar);

    //Topic buttons: one repeated button over the "topics" list. The chosen one is filled and pressed, and pressing it again lets everything through
    const on = '(item == topics[0] ? tag == "" : tag == item)';
    const topicButton = bind(button(ctx, 'Topic button', 'Topic', 0, 0, 110, false), {
      label: 'item',
      ariaPressed: on,
      'fill.color': `${on} ? ${JSON.stringify(L.button)} : ${JSON.stringify(L.background)}`,
      color: `${on} ? ${JSON.stringify(L.onButton)} : ${JSON.stringify(L.text)}`,
    });
    Object.assign(topicButton, { height: 34, cornerRadius: 17 });
    const topics = keyNavList('Topic buttons', box.x, box.y + 50, TOPICS.length * 110 + (TOPICS.length - 1) * 10, 34, { items: 'topics', row: topicButton, orientation: 'horizontal', gap: 10, ariaLabel: 'Topics' });

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
        text(ctx, 'Panel text', '{item.text}', 10, 58, TILE_W - 20, { fontSize: 12.5, lineHeight: 1.35, autoSize: 'none', height: 34, decorative: true }),
        text(ctx, 'Panel tags', '{item.tags.join(" · ")}', 10, 93, TILE_W - 20, { fontSize: 11.5, fontWeight: 600, color: L.muted, autoSize: 'none', height: 16, decorative: true }),
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
      repeat: { items: 'shown', layout: 'grid', gap: GAP, columns: 4 },
      children: [tile],
    } as never);
    const none = bind(text(ctx, 'Nothing found', 'No panels match. Try another word, or clear the filters.', box.x, box.y + 110, box.width, { fontSize: 20, fontWeight: 600, color: L.muted, align: 'center' }), { visible: 'shown.length == 0' });
    page.children.push(topics, wall, none);

    //One flow for all the topic buttons (event.childIndex is the copy that was pressed), Clear puts both back, and a change of the wall is announced
    const g = graph(page);
    const pick = g.event('event.pointer', { target: topics.id, type: 'click', childrenOnly: true }, 'Topic buttons');
    g.run(pick, set(tag, 'event.childIndex == 0 || tag == topics[event.childIndex] ? "" : topics[event.childIndex]'));
    const reset: ActionStep = ['action.resetVariables', { variables: [query.id, tag.id] }];
    g.run(click(g, clear, 'Clear'), reset);
    g.run(g.event('event.variable', { variable: shown.id }, 'Say the count'), announce('shown.length + " of " + panels.length + " panels showing"'));

    //Notes for whoever edits the template, below the page
    const below = (x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
    addNote(page, { ...below(0, 440), text: '**Live variable** `shown` is the panels the search and the topic let through. The wall, the count, the "no panels" line and the spoken update all read it.', colour: 'sky' });
    addNote(page, { ...below(456, 440), text: '**Topic buttons** are one repeated button over `topics` with one flow (`event.childIndex`), and the arrow keys move between them. [ ] Keep All first, and spell each tag in `panels` the same way.', colour: 'gold' });
    addNote(page, { ...below(912, 380), text: '**Restyle the tile once.** Every panel is the layer inside the Wall frame, repeated. Keep the text to about 60 characters.', colour: 'sky' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write your twelve panels in the "panels" list variable (Variables panel): a title, a line of text, a list of tags and an image for each. The wall, the search and the count all follow it', wall, page),
      item('Keep the text short, about 60 characters: a tile has room for two lines. For longer text, make the tile taller and the wall frame to match (and mind the logo bottom left)', byName(page, 'Count'), page),
      item('To give a panel its own picture, upload the image and put its asset id in that entry\'s "image" (the grey box shows until you do)', wall, page),
      item('Restyle the tile once (the layers inside the Wall frame): every panel is the same layer, repeated', tile, page),
      item('Change the topic buttons by editing the "topics" list (Variables panel), with All first. Tags in "panels" must be spelled the same way as the topics', topics, page),
      item('To add or remove a panel, add or remove an entry in "panels". For more than twelve, make the Wall frame taller and mind the footer', wall, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project, checklist };
  },
};
