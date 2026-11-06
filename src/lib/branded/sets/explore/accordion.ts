/** Accordion: five sections, each a header button that opens its panel and pushes the rest down (auto layout reflows them). */
import { createNode, defaultAutoLayout, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, byName, contentBox, item, solid, text, type BrandedStarter } from '../../kit';
import { Flow, heroButtons, onClick, setVar, toggleVar, variable } from './helpers';

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
  description: 'Five sections, each a header button that opens or closes its panel while the sections below move up or down. One section is open at a time, or set the "allowMany" variable to let several stay open. Headers are real buttons that say whether they are expanded.',
  tags: ['Reveal', 'Auto layout', 'Keyboard friendly', 'Text'],
  build(colourway) {
    const ctx = brandedProject(colourway, 'Accordion');
    const { L } = ctx;
    const hero = brandedPage(ctx, 'Five study habits', { kind: 'hero', subtitle: 'Open each section for a short idea you can try this week.' });
    const page = brandedPage(ctx, 'Five study habits', { footer: 'Study skills' });
    heroButtons(ctx, hero, [{ name: 'Start', label: 'Start', to: page }]);

    const open = SECTIONS.map((_, i) => variable(ctx, `open${i + 1}`, 'boolean', i === 0));
    variable(ctx, 'allowMany', 'boolean', false);

    const box = contentBox(page);
    const sections: SceneNode[] = [];
    const headers: SceneNode[] = [];
    const bodies: SceneNode[] = [];
    SECTIONS.forEach((s, i) => {
      const o = open[i].name;
      const title = text(ctx, `Section ${i + 1} title`, s.title, 28, 15, 780, { fontSize: 20, fontWeight: 600, lineHeight: 1.3 });
      const bar = createNode('rect', { name: `Section ${i + 1} open marker`, x: 10, y: 12, width: 5, height: 32, cornerRadius: 3, fill: solid(L.accent), stroke: null, decorative: true, bindings: { visible: o } } as never);
      const sign = text(ctx, `Section ${i + 1} sign`, '+', 868, 10, 32, { fontSize: 28, fontWeight: 600, align: 'center', color: L.deep, decorative: true, bindings: { text: `${o} ? "–" : "+"` } });
      const header = createNode('frame', {
        name: `Section ${i + 1} header`,
        x: 0,
        y: 0,
        width: box.width - 8,
        height: HEADER,
        fill: null,
        stroke: null,
        clip: false,
        cornerRadius: 14,
        role: 'button',
        ariaExpanded: i === 0,
        bindings: { ariaExpanded: o },
        children: [bar, title, sign],
      } as never);
      const body = text(ctx, `Section ${i + 1} text`, s.body, 0, 0, 100, { fontSize: 17, lineHeight: 1.45, layoutItem: { width: 'fill' } } as never);
      const panel = createNode('frame', {
        name: `Section ${i + 1} panel`,
        x: 0,
        y: HEADER,
        width: box.width - 8,
        height: 80,
        fill: null,
        stroke: null,
        layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 28, bottom: 22, left: 28 }, align: 'stretch', hugHeight: true },
        bindings: { visible: o },
        children: [body],
      } as never);
      const section = createNode('frame', {
        name: `Section ${i + 1}`,
        x: 0,
        y: 0,
        width: box.width - 8,
        height: HEADER,
        cornerRadius: 14,
        fill: solid(L.surface),
        stroke: null,
        clip: false,
        layout: { ...defaultAutoLayout('column'), gap: 0, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
        children: [header, panel],
      } as never);
      sections.push(section);
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
      layout: { ...defaultAutoLayout('column'), gap: 10, padding: { top: 4, right: 4, bottom: 4, left: 4 }, align: 'stretch', hugHeight: false },
      children: sections,
    } as never);
    page.children.push(list);

    //Opening one: it flips, and every other one stays only when "allowMany" is on
    const flow = new Flow(page);
    headers.forEach((h, i) => {
      const others = open.filter((_, j) => j !== i).map((v) => setVar(v, `allowMany && ${v.name}`));
      flow.chain(onClick(h, `Section ${i + 1}`), toggleVar(open[i]), ...others);
    });

    const checklist: TemplateChecklistItem[] = [
      item('Change the title and the introduction on the first page', byName(hero, 'Page title'), hero),
      item('Write each section title (the header text)', byName(page, 'Section 1 title'), page),
      item('Write the text of each panel; the sections below move to make room', bodies[0], page),
      item('To let several sections stay open at once, set the variable "allowMany" to true (Variables panel)', undefined, page),
      item('Choose which section starts open: set open1 to open5 in the Variables panel, and match the "Expanded" setting on the header', headers[0], page),
      item('To add a section: duplicate one, add an openN variable, bind its panel and header to it, and copy its click flow (Interactions tab)', sections[0], page),
      item('Change the footer line', byName(page, 'Footer text'), page),
    ];
    return { project: ctx.project, checklist };
  },
};
