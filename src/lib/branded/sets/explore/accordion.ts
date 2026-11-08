/** Accordion: one section repeated over a list, each a header button that opens its panel and pushes the rest down (the repeater is an auto layout column, so the copies reflow). */
import { createNode, defaultAutoLayout, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, byName, contentBox, item, solid, text, todo, type BrandedStarter } from '\.\./\.\./kit';
import { addVar, click, graph, graphNote } from '../../graph-kit';
import { heroButtons } from './helpers';

const SECTIONS = [
  { title: 'Plan your week', body: 'Put classes, work and study blocks in one calendar at the start of the week. Seeing the whole week makes it easier to spot a crowded day before you are in it.' },
  { title: 'Study in short blocks', body: 'Forty-five to sixty minutes of focused study, then a real break, works better for most people than one long sitting. Put your phone out of reach while you work.' },
  { title: 'Test yourself', body: 'Close the book and try to recall the main points, or answer practice questions. Retrieving an idea strengthens it far more than reading it again.' },
  { title: 'Take useful notes', body: 'Write in your own words and leave space to add to them later. Notes you have to think about are notes you are more likely to remember.' },
  { title: 'Ask for help early', body: 'If something is not making sense, ask your teaching team or a study support service sooner rather than later. A small question now saves a big gap later.' },
];

const HEADER = 56;

export const accordion: BrandedStarter = {
  key: 'explore/accordion',
  set: 'explore',
  name: 'Accordion',
  description: 'Five sections, one repeated layer over a list of words, each a header button that opens or closes its panel while the sections below move up or down. One section is open at a time, or set the "allowMany" variable to let several stay open. Headers are real buttons that say whether they are expanded.',
  tags: ['reveal', 'auto layout', 'keyboard friendly', 'text'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Accordion');
    const { L, project } = ctx;
    const hero = brandedPage(ctx, 'Five study habits', { kind: 'hero', subtitle: 'Open each section for a short idea you can try this week.' });
    const page = brandedPage(ctx, 'Five study habits', { footer: 'Study skills  ·  Page {pageNumber} of {pageCount}' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: 'next' }]);

    addVar(project, 'sections', 'list', SECTIONS);
    //The places of the sections that are open (from 0): the first starts open
    const open = addVar(project, 'open', 'list', [0]);
    addVar(project, 'allowMany', 'boolean', false);

    const box = contentBox(page);
    const W = box.width - 8;

    //One section, repeated over the list: a header button over a panel that only takes room while its section is open. Words come from the item
    const isOpen = 'open.includes(index)';
    const marker = createNode('rect', { name: 'Open marker', x: 10, y: 12, width: 5, height: 32, cornerRadius: 3, fill: solid(L.accent), stroke: null, decorative: true, bindings: { visible: isOpen } } as never);
    const title = text(ctx, 'Section title', '{item.title}', 28, 15, 780, { fontSize: 20, fontWeight: 600, lineHeight: 1.3 });
    const sign = text(ctx, 'Section sign', '+', 868, 10, 32, { fontSize: 28, fontWeight: 600, align: 'center', color: L.logoTextOnLight, decorative: true, bindings: { text: `${isOpen} ? "–" : "+"` } });
    const header = createNode('frame', {
      name: 'Section header',
      x: 0,
      y: 0,
      width: W,
      height: HEADER,
      fill: null,
      stroke: null,
      clip: false,
      cornerRadius: 14,
      role: 'button',
      bindings: { ariaExpanded: isOpen },
      children: [marker, title, sign],
    } as never);
    const body = text(ctx, 'Section text', '{item.body}', 0, 0, 100, { fontSize: 17, lineHeight: 1.45, layoutItem: { width: 'fill' } } as never);
    const panel = createNode('frame', {
      name: 'Section panel',
      x: 0,
      y: HEADER,
      width: W,
      height: 80,
      fill: null,
      stroke: null,
      layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 28, bottom: 22, left: 28 }, align: 'stretch', hugHeight: true },
      bindings: { visible: isOpen },
      children: [body],
    } as never);
    const section = createNode('frame', {
      name: 'Section',
      x: 0,
      y: 0,
      width: W,
      height: HEADER,
      cornerRadius: 14,
      fill: solid(L.surface),
      stroke: null,
      clip: false,
      layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
      children: [header, panel],
    } as never);
    //The repeater is itself an auto layout column, so the copies reflow when one opens or closes
    const list = createNode('frame', {
      name: 'Accordion',
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      fill: null,
      stroke: null,
      clip: true,
      scroll: 'vertical',
      role: 'region',
      ariaLabel: 'Study habits',
      layout: { ...defaultAutoLayout('column'), gap: 10, padding: { top: 4, right: 4, bottom: 4, left: 4 }, align: 'stretch', hugHeight: false },
      repeat: { items: 'sections', layout: 'vertical', gap: 10, columns: 1 },
      children: [section],
    } as never);
    page.children.push(list);

    //One flow for every header: toggle the section pressed (event.index), or without allowMany shut the others
    {
      const g = graph(page);
      const press = click(g, header, 'Open or close a section');
      const many = g.then(press, 'logic.if', { condition: 'allowMany' });
      g.then(many, 'action.setVariable', { variable: open.id, op: 'toggleItem', value: 'event.index' }, 'true');
      g.then(many, 'action.setVariable', { variable: open.id, op: 'set', value: 'open.includes(event.index) ? [] : [event.index]' }, 'false');
      graphNote(page, { anchor: press, colour: 'sky', text: '**One flow serves every header.** `event.index` says which section was pressed. With `allowMany` off, the false branch sets `open` to just that one, which shuts the rest.' });
    }

    const below = (x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(page, { ...below(0), colour: 'sky', text: '**One section, repeated** All five are the same layers over the `sections` list, and one flow serves every header (`event.index` says which was pressed), so a change to how it behaves is made once.' });
    addNote(page, { ...below(316), colour: 'sky', text: '**Auto layout** The repeater is a column, so an open panel pushes the copies below it down and a closed one takes no room. `open` is a list of the places that are open, and `toggleItem` adds or takes one out.' });
    addNote(page, { ...below(632), colour: 'gold', text: '[ ] Write the five entries in `sections`. Set `allowMany` to true to let several stay open, and `open` to choose what starts open.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      todo('Write each section\'s title and text', 'Write each section: the "sections" list variable (Variables panel) has a title and a text for each. The sections below move to make room', body, page),
      todo('Let several sections stay open at once', 'To let several sections stay open at once, set the variable "allowMany" to true (Variables panel)', undefined, page),
      todo('Choose which sections start open', 'Choose which sections start open: the "open" list variable holds their places, from 0 (the first is [0])', undefined, page),
      todo('To add a section, add its title and text to the list', 'To add a section, add an entry to "sections" (a title and a text). The repeater makes the layers, and the header flow already covers it', section, page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
