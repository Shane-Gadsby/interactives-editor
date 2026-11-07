//Reflection journal: four structured prompts in the order of a Gibbs-style reflection (what happened, how I felt, what I learnt, what I will do next), a text box and word count on each, saved and resumable, and a last page that shows the whole reflection.
import type { Artboard, SceneNode, TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, item, solid, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { createNode } from 'interactives-player';
import { panel } from '../assessment/shared';
import { spreadPages } from '../story/common';
import { bind, click, continueChain, empty, go, graph, loadOnOpen, mailExpr, navRow, reportExpr, saveData, setVar, textBox, variable, words, writingHero } from './shared';

const TITLE = 'Reflection journal';
const CARD_W = 330;
const FIELD_X = 48 + CARD_W + 24;
const FIELD_W = 976 - FIELD_X;

interface Prompt {
  key: 'what' | 'felt' | 'learnt' | 'next';
  short: string;
  title: string;
  lead: string;
  questions: string[];
  placeholder: string;
}

const PROMPTS: Prompt[] = [
  {
    key: 'what',
    short: 'What happened',
    title: 'Part 1: What happened?',
    lead: 'Describe the experience as it happened, without judging it yet.',
    questions: ['What was the situation or task, and who was involved?', 'What did you do?', 'What did you expect, and what actually happened?'],
    placeholder: 'Describe what happened...',
  },
  {
    key: 'felt',
    short: 'How I felt',
    title: 'Part 2: How did I feel?',
    lead: 'Name your feelings and thoughts. They are part of what happened.',
    questions: ['What were you feeling before, during and after?', 'What were you thinking at the time?', 'Did your feelings change as it went on?'],
    placeholder: 'Write about how it felt...',
  },
  {
    key: 'learnt',
    short: 'What I learnt',
    title: 'Part 3: What did I learn?',
    lead: 'Look for what made it go the way it did, and what it tells you.',
    questions: ['What went well, and why?', 'What would you do differently?', 'What did you learn about the topic, and about yourself as a learner?'],
    placeholder: 'Write about what you learnt...',
  },
  {
    key: 'next',
    short: 'What I will do next',
    title: 'Part 4: What will I do next?',
    lead: 'Turn what you learnt into something you can do.',
    questions: ['What is one thing you will do next time?', 'What help or resources will you need?', 'When will you try it?'],
    placeholder: 'Write what you will do next...',
  },
];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, TITLE);
  const { project, L } = ctx;

  const vars = PROMPTS.map((p) => variable(project, p.key, 'string', ''));
  const reflection = variable(project, 'reflection', 'string', '');
  const returning = variable(project, 'returning', 'boolean', false);
  const status = variable(project, 'status', 'string', '');
  //Words the count line asks for; the author can change it
  variable(project, 'aim', 'number', 50);

  const { page: hero, start, resume } = writingHero(
    ctx,
    TITLE,
    'Think back on something you did, one step at a time. Four short prompts with a text box for each. Your writing is saved, so you can come back to it.',
    'Start my reflection',
    'Welcome back. Your reflection from last time is saved.',
    returning,
  );
  const pages: Artboard[] = PROMPTS.map((p) => brandedPage(ctx, p.title, { name: `Part ${PROMPTS.indexOf(p) + 1}: ${p.short}`, footer: TITLE }));
  const whole = brandedPage(ctx, 'My reflection', { footer: TITLE });
  const checklist: TemplateChecklistItem[] = [];

  loadOnOpen(hero, vars, returning);
  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...go(pages[0]));
    continueChain(hero, resume, PROMPTS.map((_, i) => [vars[i], pages[i]] as [typeof reflection, Artboard]), whole);
  }

  PROMPTS.forEach((p, i) => {
    const page = pages[i];
    const box = contentBox(page);
    const v = vars[i];
    const everyPage = [...pages, whole];

    //The four parts as pills across the top, a tick on each one that is written, each a button that saves and goes there
    const pillW = (box.width - 3 * 12) / 4;
    const pills = PROMPTS.map((q, j) => navRow(ctx, `Part ${j + 1} pill`, `${j + 1}. ${q.short}`, box.x + j * (pillW + 12), box.y - 4, pillW, 42, { done: `!${empty(vars[j].name)}`, current: j === i, ariaLabel: `Part ${j + 1}: ${q.short}`, fontSize: 15 }));
    page.children.push(...pills);

    //The prompt card: the lead line and three things to think about
    const lead = text(ctx, 'Prompt lead', p.lead, 20, 20, CARD_W - 40, { fontSize: 18, fontWeight: 700, lineHeight: 1.35, role: 'heading', headingLevel: 2 });
    const think = text(ctx, 'Think about', 'Think about:\n' + p.questions.map((q) => `•  ${q}`).join('\n'), 20, 112, CARD_W - 40, { fontSize: 16, lineHeight: 1.45, paragraphSpacing: 10 });
    const card = panel(ctx, 'Prompt card', box.x, box.y + 58, CARD_W, 340, [lead, think], { role: 'region', ariaLabel: 'Prompts for this part' });

    const field = textBox(ctx, 'Text box', v, FIELD_X, box.y + 58, FIELD_W, 270, p.placeholder, p.title.replace(/^Part \d: /, ''));
    const count = text(ctx, 'Word count', `{${words(v.name)}} words{${words(v.name)} >= aim ? "  ✓ a good length" : "  (aim for about " + aim + ")"}`, FIELD_X, box.y + 340, 320, { fontSize: 15, color: L.muted });
    //A thin bar that fills as the writing reaches the aim
    const trackW = 160;
    const track = createNode('rect', { name: 'Length track', x: FIELD_X + FIELD_W - trackW, y: box.y + 346, width: trackW, height: 8, cornerRadius: 4, fill: solid(L.surfaceMuted), stroke: null, decorative: true });
    const fill = bind(createNode('rect', { name: 'Length bar', x: FIELD_X + FIELD_W - trackW, y: box.y + 346, width: 0, height: 8, cornerRadius: 4, fill: solid(L.button), stroke: null, decorative: true }), { width: `${trackW} * Math.min(1, ${words(v.name)} / aim)` });
    const note = text(ctx, 'Saved note', '{status}', FIELD_X, box.y + 366, FIELD_W, { fontSize: 15, color: L.muted });

    const back = button(ctx, 'Back button', i === 0 ? 'Back to the start' : 'Back', box.x, 524, i === 0 ? 170 : 130, false);
    const save = button(ctx, 'Save button', 'Save', FIELD_X, 524, 120, false);
    const next = button(ctx, 'Next button', i === PROMPTS.length - 1 ? 'See my reflection' : 'Next part', 976 - 200, 524, 200);
    page.children.push(card, field, count, track, fill, note, back, save, next);

    const g = graph(page);
    pills.forEach((pill, j) => {
      if (j !== i) g.run(click(g, pill, 'Parts'), saveData(vars), go(everyPage[j]));
    });
    g.run(click(g, back, 'Back'), saveData(vars), go(i === 0 ? hero : pages[i - 1]));
    g.run(click(g, save, 'Save'), saveData(vars), setVar(status, '"Saved."'));
    g.run(click(g, next, 'Next'), saveData(vars), go(i === PROMPTS.length - 1 ? whole : pages[i + 1]));
    g.run(g.event('event.variable', { variable: v.id }, 'Edited'), setVar(status, '""'));
    checklist.push(item(`Part ${i + 1}: write your own lead line, the three things to think about and the placeholder`, lead, page));
  });

  //The whole reflection: each part with its word count (a button back to it) beside everything in one box
  {
    const box = contentBox(whole);
    const rows: SceneNode[] = PROMPTS.map((p, i) => navRow(ctx, `Part ${i + 1} row`, p.short, 16, 48 + i * 52, 268, 44, { done: `!${empty(vars[i].name)}`, current: false, ariaLabel: `Edit part ${i + 1}: ${p.short}` }));
    const heading = text(ctx, 'Parts heading', 'Your four parts', 16, 14, 268, { fontSize: 14, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 });
    const total = text(ctx, 'Total words', `{${vars.map((v) => words(v.name)).join(' + ')}} words in all. Press a part to go back and change it.`, 16, 48 + 4 * 52 + 4, 268, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const list = panel(ctx, 'Parts list', box.x, box.y, 300, 48 + 4 * 52 + 80, [heading, ...rows, total], { role: 'region', ariaLabel: 'The four parts of your reflection' });
    const all = textBox(ctx, 'Whole reflection', reflection, box.x + 324, box.y, box.width - 324, 320, '', 'Your whole reflection, ready to copy');
    const hint = text(ctx, 'Copy hint', 'Click in the box, press Ctrl+A (Cmd+A on a Mac) to select it all and Ctrl+C to copy it, or email it to yourself. To change what you wrote, use the parts on the left.', box.x + 324, box.y + 332, box.width - 324, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const back = button(ctx, 'Back button', 'Back', box.x, 524, 130, false);
    const mail = button(ctx, 'Email button', 'Email it to myself', 976 - 230, 524, 230);
    whole.children.push(list, all, hint, back, mail);

    const g = graph(whole);
    const arrive = g.event('event.start', {}, 'Put it all together');
    g.run(arrive, setVar(reflection, reportExpr('My reflection', PROMPTS.map((p, i) => [p.short, vars[i]] as [string, typeof reflection]), '(Not written yet)')));
    rows.forEach((row, i) => g.run(click(g, row, 'Parts'), go(pages[i])));
    g.run(click(g, back, 'Back'), go(pages[PROMPTS.length - 1]));
    g.run(click(g, mail, 'Email'), ['action.url', { url: mailExpr('My reflection', 'reflection'), target: '_self' }]);
    checklist.push(
      item('Change the headings the whole reflection uses: the Set variable node after "Put it all together" (Interactions tab) lists each part with its heading', all, whole),
      item('Change the subject line of the email in the Open URL node on this page', mail, whole),
    );
  }

  checklist.unshift(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));
  checklist.push(
    item('Change how many words the count line asks for: the "aim" variable (Variables tab)', undefined, pages[0]),
    item('The four pills are repeated on every part page: if you rename a part, change its pill on each page', undefined, pages[1]),
    item('Writing is saved by Save user data nodes (Back, Save, Next and the pills) and brought back by the Load user data node in "Before activity loads" on the first page. To add a part, duplicate a part page, add a text variable for it and tick it in every Save and Load user data node', undefined, hero),
    item('Check where it is saved: on the Link for StudyDesk each learner\'s reflection is kept under their StudyDesk session, anywhere else it stays in their browser (Share)', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: whole.id };
  spreadPages(project);
  return { project, checklist };
}

export const journal: BrandedStarter = {
  key: 'writing/reflection-journal',
  set: 'writing',
  name: 'Reflection journal',
  description: 'A reflection in four structured prompts (what happened, how I felt, what I learnt, what I will do next), each with a text box and a word count. Saved and resumable as learner user data, with a last page that shows the whole reflection.',
  tags: ['reflection', 'writing', 'word count', 'user data'],
  build,
};
