/** Accordion: five sections whose words are one list, each a header button that opens its panel and pushes the rest down (auto layout reflows them). */
import { createNode, defaultAutoLayout, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, byName, contentBox, item, solid, text, type BrandedStarter } from '../../kit';
import { addVar, click, graph, join, put } from '../../graph-kit';
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
  description: 'Five sections, their words in one list, each a header button that opens or closes its panel while the sections below move up or down. One section is open at a time, or set the "allowMany" variable to let several stay open. Headers are real buttons that say whether they are expanded.',
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
    const which = addVar(project, 'which', 'number', 0);

    const box = contentBox(page);
    const W = box.width - 8;

    //The sections: a header button over a panel that only takes room while its section is open. Words come from the list by place
    const sections: SceneNode[] = [];
    const headers: SceneNode[] = [];
    const bodies: SceneNode[] = [];
    SECTIONS.forEach((_, i) => {
      const isOpen = `open.includes(${i})`;
      const marker = createNode('rect', { name: `Section ${i + 1} open marker`, x: 10, y: 12, width: 5, height: 32, cornerRadius: 3, fill: solid(L.accent), stroke: null, decorative: true, bindings: { visible: isOpen } } as never);
      const title = text(ctx, `Section ${i + 1} title`, `{sections[${i}].title}`, 28, 15, 780, { fontSize: 20, fontWeight: 600, lineHeight: 1.3 });
      const sign = text(ctx, `Section ${i + 1} sign`, '+', 868, 10, 32, { fontSize: 28, fontWeight: 600, align: 'center', color: L.deep, decorative: true, bindings: { text: `${isOpen} ? "–" : "+"` } });
      const header = createNode('frame', {
        name: `Section ${i + 1} header`,
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
      const body = text(ctx, `Section ${i + 1} text`, `{sections[${i}].body}`, 0, 0, 100, { fontSize: 17, lineHeight: 1.45, layoutItem: { width: 'fill' } } as never);
      const panel = createNode('frame', {
        name: `Section ${i + 1} panel`,
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
      sections.push(
        createNode('frame', {
          name: `Section ${i + 1}`,
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
        } as never)
      );
      headers.push(header);
      bodies.push(body);
    });
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
      children: sections,
    } as never);
    page.children.push(list);

    //Pressing a header says which section it was, and one shared run does the rest: toggle it, or (without allowMany) shut the others
    {
      const g = graph(page);
      const many = put(page, 'logic.if', 0, 0, { condition: 'allowMany' });
      const toggle = put(page, 'action.setVariable', 0, 0, { variable: open.id, op: 'toggleItem', value: 'which' });
      const only = put(page, 'action.setVariable', 0, 0, { variable: open.id, op: 'set', value: 'open.includes(which) ? [] : [which]' });
      join(page, many, toggle, 'true');
      join(page, many, only, 'false');
      headers.forEach((h, i) => {
        const press = click(g, h, i === 0 ? 'Open or close a section' : undefined);
        join(page, g.then(press, 'action.setVariable', { variable: which.id, op: 'set', value: String(i) }), many);
      });
    }

    const below = (x: number) => ({ x, y: page.height + 14, w: 300, h: 100 });
    addNote(page, { ...below(0), colour: 'sky', text: '**One shared run** Each header only says which section it is (`which`). The If and the two Set nodes after them do the opening, so a change to how it behaves is made once.' });
    addNote(page, { ...below(316), colour: 'sky', text: '**Auto layout** The sections are a column, so an open panel pushes the rest down and a closed one takes no room. `open` is a list of the places that are open, and `toggleItem` adds or takes one out.' });
    addNote(page, { ...below(632), colour: 'gold', text: '[ ] Write the five entries in `sections`. Set `allowMany` to true to let several stay open, and `open` to choose what starts open.' });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write each section: the "sections" list variable (Variables panel) has a title and a text for each, in the order of the Section layers. The sections below move to make room', bodies[0], page),
      item('To let several sections stay open at once, set the variable "allowMany" to true (Variables panel)', undefined, page),
      item('Choose which sections start open: the "open" list variable holds their places, from 0 (the first is [0])', undefined, page),
      item('To add a section: add an entry to "sections", duplicate a Section, point its three "sections[n]" and "open.includes(n)" expressions at the new place, and give its header a flow that sets "which" to n and joins the shared If (Interactions tab)', sections[0], page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
