//Guided writing workbook: a goals page, three steps with a prompt and a text box each, a progress list on every page, and an export page that puts everything on one page to copy or download. The writing is learner user data, kept as it is written.
import { createNode, type Artboard, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { groupPages } from '../story/common';
import { addVar, bind, click, empty, goNext, goPrevious, graph, graphNote, reportExpr, setVar, textBox, writingHero } from './shared';
import { panel } from '../assessment/shared';

const TITLE = 'Study plan workbook';
const LIST_W = 250;
const COL_X = 48 + LIST_W + 28;
const COL_W = 976 - COL_X;

interface Part {
  key: 'goals' | 'step1' | 'step2' | 'step3';
  label: string;
  title: string;
  guide: string;
  placeholder: string;
  heading: string;
}

const PARTS: Part[] = [
  {
    key: 'goals',
    label: 'My goals',
    title: 'My goals',
    heading: 'My goals',
    guide: 'Write a few sentences about what you would like to be different about your study by the end of the term, and why it matters to you. Be specific: "finish the readings before the tutorial" is easier to work with than "study more".',
    placeholder: 'By the end of the term I want to...',
  },
  {
    key: 'step1',
    label: 'Step 1: Where I am',
    title: 'Step 1: Where am I now?',
    heading: 'Where I am now',
    guide: 'Describe how you study at the moment: when and where you study, for how long, and what usually gets in the way. Write what actually happens, not what you think should happen.',
    placeholder: 'At the moment I usually...',
  },
  {
    key: 'step2',
    label: 'Step 2: One change',
    title: 'Step 2: Which one change will I try?',
    heading: 'The one change I will try',
    guide: 'Pick one change that would move you towards your goals and describe it. Say what you will do differently and why you think it will help. One small change you keep up beats five big ones you drop.',
    placeholder: 'The change I will try is...',
  },
  {
    key: 'step3',
    label: 'Step 3: My plan',
    title: 'Step 3: What is my plan?',
    heading: 'My plan',
    guide: 'Say when and where you will do it, what you need to have ready, and how you will know it is working after two weeks. Add what you will do if a week goes badly.',
    placeholder: 'I will start on...',
  },
];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, TITLE);
  const { project, L } = ctx;

  //What the learner writes: user data, so it is kept as it is written and put back before the workbook opens
  const goals = addVar(project, 'goals', 'string', '', { userData: true });
  const step1 = addVar(project, 'step1', 'string', '', { userData: true });
  const step2 = addVar(project, 'step2', 'string', '', { userData: true });
  const step3 = addVar(project, 'step3', 'string', '', { userData: true });
  const exported = addVar(project, 'exported', 'boolean', false, { userData: true });
  const report = addVar(project, 'report', 'string', '');
  const written = [goals, step1, step2, step3];
  //Live: somebody coming back, the progress list (a label, the page it goes to and whether it is written, for each part and the export), how many parts are written, and the first part still empty
  const returning = addVar(project, 'returning', 'boolean', false, { formula: 'userData.restored > 0', live: true });
  addVar(project, 'parts', 'list', [], { formula: `[${PARTS.map((p) => `{label: ${JSON.stringify(p.label)}, page: ${JSON.stringify(p.label)}, done: !(${empty(p.key)})}`).join(', ')}, {label: "Export", page: "Export", done: exported}]`, live: true });
  addVar(project, 'writtenCount', 'number', 0, { formula: 'parts.slice(0, 4).filter(p => p.done).length', live: true });
  addVar(project, 'resumeAt', 'string', '', { formula: `${PARTS.map((p) => `${empty(p.key)} ? ${JSON.stringify(p.label)} : `).join('')}"Export"`, live: true });

  const { page: hero, start, resume } = writingHero(
    ctx,
    TITLE,
    'A guided workbook: a few goals, three short steps, and your plan on one page at the end. Your writing is saved, so you can stop and come back.',
    'Start my workbook',
    'Welcome back. Your writing from last time is saved.',
    returning,
  );
  const pages: Artboard[] = PARTS.map((p) => brandedPage(ctx, p.title, { name: p.label, footer: TITLE }));
  const exportPage = brandedPage(ctx, 'My study plan', { name: 'Export', footer: TITLE });
  const everyPage = [...pages, exportPage];
  //The parts and the export are one group, so Next and Back follow their order (and the first Back and the last Next leave through the No artboard output)
  groupPages(project, 'Workbook', everyPage);
  const checklist: TemplateChecklistItem[] = [];

  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...goNext());
    //Continue goes to the first part still empty, or the export: its name is the live "resumeAt"
    g.then(click(g, resume, 'Continue'), 'action.artboard', { to: 'expression', expr: 'resumeAt', transition: 'fade', duration: 250 });
  }

  //The progress list, on every page: one row layer repeated over the live "parts" list, a tick for what is written, the page you are on in the button colour, and each row goes to its page
  const progressList = (page: Artboard) => {
    const label = bind(text(ctx, 'Row label', '{item.done ? "✓" : "○"}  {item.label}', 14, 11, LIST_W - 32 - 24, { fontSize: 16, fontWeight: 600, decorative: true, wrap: false, height: 22, autoSize: 'none' }), { color: `artboard.name == item.page ? "${L.onButton}" : "${L.text}"`, fontWeight: 'artboard.name == item.page ? 700 : 600' });
    const row = bind(
      createNode('frame', { name: 'Progress row', x: 0, y: 0, width: LIST_W - 32, height: 44, cornerRadius: 10, fill: solid(L.background), stroke: stroke(L.border, 1.5), clip: false, role: 'button', focusable: true, cursor: 'pointer', children: [label] }) as FrameNode,
      {
        ariaLabel: 'item.label + ": " + (item.done ? "written" : "not written yet")',
        'fill.color': `artboard.name == item.page ? "${L.button}" : "${L.background}"`,
        'stroke.paint.color': `artboard.name == item.page ? "${L.primary}" : "${L.border}"`,
      },
    );
    const heading = text(ctx, 'Progress heading', 'Progress', 16, 14, LIST_W - 32, { fontSize: 14, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 });
    const rows = createNode('frame', { name: 'Progress rows', x: 16, y: 44, width: LIST_W - 32, height: 5 * 52 - 8, fill: null, stroke: null, clip: false, repeat: { items: 'parts', layout: 'vertical', gap: 8, columns: 1 }, children: [row] } as never);
    const count = text(ctx, 'Progress count', '{writtenCount} of 4 parts written', 16, 44 + 5 * 52 + 4, LIST_W - 32, { fontSize: 15, color: L.muted });
    const box = contentBox(page);
    const list = panel(ctx, 'Progress list', box.x, box.y, LIST_W, 44 + 5 * 52 + 44, [heading, rows, count], { role: 'region', ariaLabel: 'Your progress' });
    page.children.push(list);
    //One flow: a row goes to its page (the row for the page you are on does nothing)
    const g = graph(page);
    const onRow = g.event('event.pointer', { target: row.id, type: 'click', onlyIf: 'parts[event.index].page != artboard.name' }, 'A progress row');
    g.then(onRow, 'action.artboard', { to: 'expression', expr: 'parts[event.index].page', transition: 'fade', duration: 250 });
    if (page === pages[0] || page === exportPage) graphNote(page, { anchor: onRow, colour: 'sky', text: '**One flow serves every progress row.** `event.index` picks the row from the live `parts` list, and *Only if* leaves the row for the page you are already on alone. [ ] A new part is a new entry in `parts` with a page of the same name.' });
    return list;
  };

  //The three steps and the goals page share a shape: a prompt, a text box, a word count, Back and Next (what is written is kept as it is typed)
  PARTS.forEach((p, i) => {
    const page = pages[i];
    const box = contentBox(page);
    const v = written[i];
    progressList(page);
    const guide = text(ctx, 'Prompt', p.guide, COL_X, box.y, COL_W, { fontSize: 17, lineHeight: 1.45 });
    const field = textBox(ctx, 'Text box', v, COL_X, box.y + 100, COL_W, 250, p.placeholder, p.heading);
    const count = text(ctx, 'Word count', `{wordCount(${v.name})} words`, COL_X, box.y + 362, 200, { fontSize: 15, color: L.muted });
    const state = text(ctx, 'Saved note', 'Saved as you write.', COL_X + 220, box.y + 362, COL_W - 220, { fontSize: 15, color: L.muted, align: 'right' });
    const back = button(ctx, 'Back button', i === 0 ? 'Back to the start' : 'Back', COL_X, 524, i === 0 ? 170 : 130, false);
    const next = button(ctx, 'Next button', i === PARTS.length - 1 ? 'See my workbook' : 'Next step', 976 - 200, 524, 200);
    page.children.push(guide, field, count, state, back, next);
    const g = graph(page);
    //Back and Next follow the group's order; Back from the first part leaves through No artboard, to the first page
    const onBack = click(g, back, 'Back');
    const goBack = g.then(onBack, ...goPrevious());
    if (i === 0) g.then(goBack, 'action.artboard', { artboard: hero.id, transition: 'fade', duration: 250 }, 'none');
    g.then(click(g, next, 'Next'), ...goNext());
    graphNote(page, { anchor: onBack, colour: 'sky', text: i === 0 ? '**Back from the first part has no page before it in the group**, so its **No artboard** output goes to the start page instead. Writing is kept as it is typed, so leaving loses nothing.' : '**Back and Next follow the page order** of the group, so a new part needs no wiring. What is written is kept as it is typed (`userData`), so leaving a page loses nothing.' });
    checklist.push(item(i === 0 ? 'Write your own goals prompt, and the placeholder in its text box' : `Step ${i}: write your own prompt, the placeholder in the text box and the page title`, guide, page));
  });

  //Export: everything the learner wrote, on one page, in a box they can copy from or download
  {
    const box = contentBox(exportPage);
    progressList(exportPage);
    const intro = text(ctx, 'Intro', 'Everything you wrote is below, in one piece. Click in the box, press Ctrl+A (Cmd+A on a Mac) to select it all and Ctrl+C to copy it, or download it as a text file. You can still edit it here before you copy.', COL_X, box.y, COL_W, { fontSize: 17, lineHeight: 1.45 });
    const field = textBox(ctx, 'Whole workbook', report, COL_X, box.y + 100, COL_W, 250, '', 'Your whole workbook, ready to copy');
    const missing = text(ctx, 'Missing note', '{(' + written.map((v) => empty(v.name)).join(' || ') + ') ? "Some parts are still empty. Use the progress list to go back and finish them." : "Everything is written. Copy it or download it as a text file."}', COL_X, box.y + 362, COL_W, { fontSize: 15, color: L.muted });
    const back = button(ctx, 'Back button', 'Back to editing', COL_X, 524, 190, false);
    const save = button(ctx, 'Download button', 'Download as a file', 976 - 230, 524, 230);
    exportPage.children.push(intro, field, missing, back, save);
    const g = graph(exportPage);
    const arrive = g.event('event.start', {}, 'Put it all together');
    g.run(arrive, setVar(report, reportExpr('My study plan', PARTS.map((p, i) => [p.heading, written[i]] as [string, typeof goals]), '(Not written yet)')), setVar(exported, 'true'));
    g.run(click(g, back, 'Back'), goPrevious());
    const onSave = click(g, save, 'Download');
    graphNote(exportPage, { anchor: arrive, colour: 'sky', text: '**Arriving builds the whole text** into `report`, each part under its heading with "(Not written yet)" for gaps, and marks `exported` so the progress list ticks it. [ ] Reword the headings in this Set variable.' });
    graphNote(exportPage, { anchor: onSave, colour: 'sky', text: '**Download saves report as plain text.** [ ] Change the file name `my-study-plan` in the node.' });
    g.run(onSave, ['action.saveFile', { name: '"my-study-plan"', text: 'report', mime: 'text/plain' }]);
    checklist.push(
      item('Change the export: the Set variable node after "Put it all together" (Interactions tab) lists each part with its heading, so reword the headings there, and the title line at the top', field, exportPage),
      item('Change the file name the learner gets in the Download a file node on the export page (it saves the whole text as a .txt)', save, exportPage),
    );
  }

  checklist.unshift(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));
  checklist.push(
    item('The progress list on every page is one row layer repeated over the live "parts" variable (Variables tab): if you rename a step, change its label and its page name there, and rename the page to match. A row goes to the page it names', undefined, pages[1]),
    item('Writing is kept as it is written: the four text variables and "exported" are ticked Save as user data (Variables tab), so there is no Save or Load node to maintain. To add a step, duplicate a step page into the Workbook group, add a text variable for it ticked Save as user data, and add its row to "parts" and "resumeAt"', undefined, hero),
    item('Check where it is saved: on the Link for StudyDesk each learner\'s writing is kept under their StudyDesk session, anywhere else it stays in their browser (Share)', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: exportPage.id };
  //Notes for whoever edits the template, below the pages
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(pages[0], { ...below(pages[0], 0, 440), text: '**User data** The four text variables and `exported` are ticked Save as user data. They are kept as they change and put back before the workbook opens, so there are no Save or Load nodes, and `returning` is live from `userData.restored`.', colour: 'sky' });
  addNote(pages[0], { ...below(pages[0], 456, 440), text: '**Page groups** The parts and the export are one group called Workbook, so Next and Back follow the page order. The progress rows go to a page by name with an expression, from the live `parts` list.', colour: 'sky' });
  addNote(hero, { ...below(hero, 0, 440), text: '[ ] **Make it yours** in the Variables tab. Write your own prompts. Adding a step means a new page in the group, a new text variable and a row in `parts` and `resumeAt`.', colour: 'gold' });
  addNote(exportPage, { ...below(exportPage, 0, 440), text: '**Download a file** saves the `report` text as a .txt after a tap. It needs no microphone or camera, so there is nothing to declare. [ ] Change the file name in its node.', colour: 'gold' });

  return { project, checklist };
}

export const workbook: BrandedStarter = {
  key: 'writing/documentation-tool',
  set: 'writing',
  name: 'Guided writing workbook',
  description: 'A guided workbook: a goals page and three steps, each with a prompt and a text box, a progress list on every page, and an export page that gathers everything the learner wrote into one page to copy or download. Saved as learner user data, so they can come back.',
  tags: ['writing', 'workbook', 'user data', 'export'],
  build,
};
