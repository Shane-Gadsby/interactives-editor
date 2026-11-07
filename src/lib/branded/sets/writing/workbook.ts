//Guided writing workbook: a goals page, three steps with a prompt and a text box each, a progress list on every page, and an export page that puts everything on one page to copy or email. Saved as learner user data.
import type { Artboard, SceneNode, TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, item, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { spreadPages } from '../story/common';
import { click, continueChain, empty, go, graph, loadOnOpen, mailExpr, navRow, reportExpr, saveData, setVar, textBox, variable, words, writingHero } from './shared';
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

  //What the learner writes, and the few things the pages say about it
  const goals = variable(project, 'goals', 'string', '');
  const step1 = variable(project, 'step1', 'string', '');
  const step2 = variable(project, 'step2', 'string', '');
  const step3 = variable(project, 'step3', 'string', '');
  const exported = variable(project, 'exported', 'boolean', false);
  const returning = variable(project, 'returning', 'boolean', false);
  const status = variable(project, 'status', 'string', '');
  const report = variable(project, 'report', 'string', '');
  const written = [goals, step1, step2, step3];
  const saved = [...written, exported];

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
  const checklist: TemplateChecklistItem[] = [];

  //Before the activity opens: bring back what was saved
  loadOnOpen(hero, saved, returning);
  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...go(pages[0]));
    continueChain(hero, resume, [[goals, pages[0]], [step1, pages[1]], [step2, pages[2]], [step3, pages[3]]], exportPage);
  }

  //The progress list, on every page: a tick for what is written, the page you are on in the button colour, each row a button that saves and goes there
  const progressList = (page: Artboard, current: number) => {
    const rows: SceneNode[] = [];
    const heading = text(ctx, 'Progress heading', 'Progress', 16, 14, LIST_W - 32, { fontSize: 14, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 });
    PARTS.forEach((p, i) => rows.push(navRow(ctx, `Progress: ${p.label}`, p.label, 16, 44 + i * 52, LIST_W - 32, 44, { done: `!${empty(p.key)}`, current: current === i, ariaLabel: p.label })));
    rows.push(navRow(ctx, 'Progress: Export', 'Export', 16, 44 + 4 * 52, LIST_W - 32, 44, { done: 'exported', current: current === 4, ariaLabel: 'Export' }));
    const count = text(ctx, 'Progress count', `{${written.map((v) => `(${empty(v.name)} ? 0 : 1)`).join(' + ')}} of 4 parts written`, 16, 44 + 5 * 52 + 4, LIST_W - 32, { fontSize: 15, color: L.muted });
    const box = contentBox(page);
    const list = panel(ctx, 'Progress list', box.x, box.y, LIST_W, 44 + 5 * 52 + 44, [heading, ...rows, count], { role: 'region', ariaLabel: 'Your progress' });
    page.children.push(list);
    //Each row saves, then goes to its page (the one you are on does nothing)
    const g = graph(page);
    rows.forEach((row, i) => {
      if (i === current) return;
      g.run(click(g, row, 'Progress list'), saveData(saved), go(everyPage[i]));
    });
    return list;
  };

  //The three steps and the goals page share a shape: a prompt, a text box, a word count, Back, Save and Next
  PARTS.forEach((p, i) => {
    const page = pages[i];
    const box = contentBox(page);
    const v = written[i];
    progressList(page, i);
    const guide = text(ctx, 'Prompt', p.guide, COL_X, box.y, COL_W, { fontSize: 17, lineHeight: 1.45 });
    const field = textBox(ctx, 'Text box', v, COL_X, box.y + 100, COL_W, 250, p.placeholder, p.heading);
    const count = text(ctx, 'Word count', `{${words(v.name)}} words`, COL_X, box.y + 362, 200, { fontSize: 15, color: L.muted });
    const state = text(ctx, 'Saved note', '{status}', COL_X + 220, box.y + 362, COL_W - 220, { fontSize: 15, color: L.muted, align: 'right' });
    const back = button(ctx, 'Back button', i === 0 ? 'Back to the start' : 'Back', COL_X, 524, i === 0 ? 170 : 130, false);
    const save = button(ctx, 'Save button', 'Save', COL_X + (i === 0 ? 186 : 146), 524, 120, false);
    const next = button(ctx, 'Next button', i === PARTS.length - 1 ? 'See my workbook' : 'Next step', 976 - 200, 524, 200);
    page.children.push(guide, field, count, state, back, save, next);
    const g = graph(page);
    g.run(click(g, back, 'Back'), saveData(saved), go(i === 0 ? hero : pages[i - 1]));
    g.run(click(g, save, 'Save'), saveData(saved), setVar(status, '"Saved."'));
    g.run(click(g, next, 'Next'), saveData(saved), go(i === PARTS.length - 1 ? exportPage : pages[i + 1]));
    //Typing again takes the "Saved." note away, since what is on screen is no longer what was saved
    g.run(g.event('event.variable', { variable: v.id }, 'Edited'), setVar(status, '""'));
    checklist.push(item(i === 0 ? 'Write your own goals prompt, and the placeholder in its text box' : `Step ${i}: write your own prompt, the placeholder in the text box and the page title`, guide, page));
  });

  //Export: everything the learner wrote, on one page, in a box they can copy from or email
  {
    const box = contentBox(exportPage);
    progressList(exportPage, 4);
    const intro = text(ctx, 'Intro', 'Everything you wrote is below, in one piece. Click in the box, press Ctrl+A (Cmd+A on a Mac) to select it all and Ctrl+C to copy it, or email it to yourself. You can still edit it here before you copy.', COL_X, box.y, COL_W, { fontSize: 17, lineHeight: 1.45 });
    const field = textBox(ctx, 'Whole workbook', report, COL_X, box.y + 100, COL_W, 250, '', 'Your whole workbook, ready to copy');
    const missing = text(ctx, 'Missing note', '{(' + written.map((v) => empty(v.name)).join(' || ') + ') ? "Some parts are still empty. Use the progress list to go back and finish them." : "Everything is written. Copy it or email it to yourself."}', COL_X, box.y + 362, COL_W, { fontSize: 15, color: L.muted });
    const back = button(ctx, 'Back button', 'Back to editing', COL_X, 524, 190, false);
    const mail = button(ctx, 'Email button', 'Email it to myself', 976 - 230, 524, 230);
    exportPage.children.push(intro, field, missing, back, mail);
    const g = graph(exportPage);
    const arrive = g.event('event.start', {}, 'Put it all together');
    g.run(arrive, setVar(report, reportExpr('My study plan', PARTS.map((p, i) => [p.heading, written[i]] as [string, typeof goals]), '(Not written yet)')), setVar(exported, 'true'), saveData([exported]));
    g.run(click(g, back, 'Back'), go(pages[PARTS.length - 1]));
    g.run(click(g, mail, 'Email'), ['action.url', { url: mailExpr('My study plan', 'report'), target: '_self' }]);
    checklist.push(
      item('Change the export: the Set variable node after "Put it all together" (Interactions tab) lists each part with its heading, so reword the headings there, and the title line at the top', field, exportPage),
      item('Change the subject line of the email in the Open URL node on the export page', mail, exportPage),
    );
  }

  checklist.unshift(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));
  checklist.push(
    item('The progress list is repeated on every page: if you rename a step, change its label in the list on each page (and its page name)', undefined, pages[1]),
    item('Writing is saved by Save user data nodes (Back, Save, Next and the progress list) and brought back by the Load user data node in "Before activity loads" on the first page. To add a step, duplicate a step page, add a text variable for it and tick it in every Save user data and Load user data node', undefined, hero),
    item('Check where it is saved: on the Link for StudyDesk each learner\'s writing is kept under their StudyDesk session, anywhere else it stays in their browser (Share)', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: exportPage.id };
  spreadPages(project);
  return { project, checklist };
}

export const workbook: BrandedStarter = {
  key: 'writing/documentation-tool',
  set: 'writing',
  name: 'Guided writing workbook',
  description: 'A guided workbook: a goals page and three steps, each with a prompt and a text box, a progress list on every page, and an export page that gathers everything the learner wrote into one page to copy or email. Saved as learner user data, so they can come back.',
  tags: ['writing', 'workbook', 'user data', 'export'],
  build,
};
