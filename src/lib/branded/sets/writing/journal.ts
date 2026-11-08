//Reflection journal: four structured prompts in the order of a Gibbs-style reflection (what happened, how I felt, what I learnt, what I will do next), a text box and word count on each, kept as it is written and resumable, and a last page that shows the whole reflection.
import { createNode, type Artboard, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { progressBar } from '../../parts';
import { panel } from '../assessment/shared';
import { groupPages } from '../story/common';
import { addVar, bind, click, empty, goNext, goPrevious, graph, reportExpr, setVar, textBox, writingHero } from './shared';

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

const pageName = (i: number) => `Part ${i + 1}: ${PROMPTS[i].short}`;

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

  //What the learner writes is user data: kept as it is written and put back before the journal opens
  const vars = PROMPTS.map((p) => addVar(project, p.key, 'string', '', { userData: true }));
  const reflection = addVar(project, 'reflection', 'string', '');
  //Words the count line asks for; the author can change it
  addVar(project, 'aim', 'number', 50);
  //Live: somebody coming back, the four parts (number, short name, the page it goes to, whether it is written), the total words, and the first part still empty
  const returning = addVar(project, 'returning', 'boolean', false, { formula: 'userData.restored > 0', live: true });
  addVar(project, 'parts', 'list', [], { formula: `[${PROMPTS.map((p, i) => `{n: ${i + 1}, short: ${JSON.stringify(p.short)}, page: ${JSON.stringify(pageName(i))}, done: !(${empty(p.key)})}`).join(', ')}]`, live: true });
  addVar(project, 'totalWords', 'number', 0, { formula: PROMPTS.map((p) => `wordCount(${p.key})`).join(' + '), live: true });
  addVar(project, 'resumeAt', 'string', '', { formula: `${PROMPTS.map((p, i) => `${empty(p.key)} ? ${JSON.stringify(pageName(i))} : `).join('')}"My reflection"`, live: true });

  const { page: hero, start, resume } = writingHero(
    ctx,
    TITLE,
    'Think back on something you did, one step at a time. Four short prompts with a text box for each. Your writing is saved, so you can come back to it.',
    'Start my reflection',
    'Welcome back. Your reflection from last time is saved.',
    returning,
  );
  const pages: Artboard[] = PROMPTS.map((p, i) => brandedPage(ctx, p.title, { name: pageName(i), footer: TITLE }));
  const whole = brandedPage(ctx, 'My reflection', { footer: TITLE });
  //The four parts and the whole reflection are one group: Next and Back follow its order (the first Back leaves through No artboard, to the first page)
  groupPages(project, 'Journal', [...pages, whole]);
  const checklist: TemplateChecklistItem[] = [];

  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...goNext());
    //Continue goes to the first part still empty, or the whole reflection: its name is the live "resumeAt"
    g.then(click(g, resume, 'Continue'), 'action.artboard', { to: 'expression', expr: 'resumeAt', transition: 'fade', duration: 250 });
  }

  PROMPTS.forEach((p, i) => {
    const page = pages[i];
    const box = contentBox(page);
    const v = vars[i];

    //The four parts as pills across the top (one pill repeated over the live "parts" list): a tick on each one that is written, the part you are on in the button colour, each one a button that goes there
    const pillW = (box.width - 3 * 12) / 4;
    const pillLabel = bind(text(ctx, 'Pill label', '{item.done ? "✓" : "○"}  {item.n}. {item.short}', 14, 10, pillW - 24, { fontSize: 15, fontWeight: 600, decorative: true, wrap: false, height: 22, autoSize: 'none' }), { color: `artboard.name == item.page ? "${L.onButton}" : "${L.text}"`, fontWeight: 'artboard.name == item.page ? 700 : 600' });
    const pill = bind(
      createNode('frame', { name: 'Part pill', x: 0, y: 0, width: pillW, height: 42, cornerRadius: 10, fill: solid(L.background), stroke: stroke(L.border, 1.5), clip: false, role: 'button', focusable: true, cursor: 'pointer', children: [pillLabel] }) as FrameNode,
      {
        ariaLabel: '"Part " + item.n + ": " + item.short + ": " + (item.done ? "written" : "not written yet")',
        'fill.color': `artboard.name == item.page ? "${L.button}" : "${L.background}"`,
        'stroke.paint.color': `artboard.name == item.page ? "${L.primary}" : "${L.border}"`,
      },
    );
    const pills = createNode('frame', { name: 'Part pills', x: box.x, y: box.y - 4, width: box.width, height: 42, fill: null, stroke: null, clip: false, repeat: { items: 'parts', layout: 'horizontal', gap: 12, columns: 1 }, children: [pill] } as never);
    page.children.push(pills);

    //The prompt card: the lead line and three things to think about
    const lead = text(ctx, 'Prompt lead', p.lead, 20, 20, CARD_W - 40, { fontSize: 18, fontWeight: 700, lineHeight: 1.35, role: 'heading', headingLevel: 2 });
    const think = text(ctx, 'Think about', 'Think about:\n' + p.questions.map((q) => `•  ${q}`).join('\n'), 20, 112, CARD_W - 40, { fontSize: 16, lineHeight: 1.45, paragraphSpacing: 10 });
    const card = panel(ctx, 'Prompt card', box.x, box.y + 58, CARD_W, 340, [lead, think], { role: 'region', ariaLabel: 'Prompts for this part' });

    const field = textBox(ctx, 'Text box', v, FIELD_X, box.y + 58, FIELD_W, 270, p.placeholder, p.title.replace(/^Part \d: /, ''));
    const count = text(ctx, 'Word count', `{wordCount(${v.name})} words{wordCount(${v.name}) >= aim ? "  ✓ a good length" : "  (aim for about " + aim + ")"}`, FIELD_X, box.y + 340, 320, { fontSize: 15, color: L.muted });
    //A thin Progress bar that fills as the writing reaches the aim
    const trackW = 160;
    const bar = progressBar(ctx, 'Length bar', FIELD_X + FIELD_W - trackW, box.y + 346, trackW, { value: `wordCount(${v.name})`, max: 'Math.max(1, aim)', label: 'Length', valueText: '{value} of {max} words', height: 8 });
    const note = text(ctx, 'Saved note', 'Saved as you write.', FIELD_X, box.y + 366, FIELD_W, { fontSize: 15, color: L.muted });

    const back = button(ctx, 'Back button', i === 0 ? 'Back to the start' : 'Back', box.x, 524, i === 0 ? 170 : 130, false);
    const next = button(ctx, 'Next button', i === PROMPTS.length - 1 ? 'See my reflection' : 'Next part', 976 - 200, 524, 200);
    page.children.push(card, field, count, bar, note, back, next);

    const g = graph(page);
    //One flow for the pills: a pill goes to its part's page (the pill for the page you are on does nothing)
    const onPill = g.event('event.pointer', { target: pill.id, type: 'click', onlyIf: 'parts[event.index].page != artboard.name' }, 'A part pill');
    g.then(onPill, 'action.artboard', { to: 'expression', expr: 'parts[event.index].page', transition: 'fade', duration: 250 });
    const goBack = g.then(click(g, back, 'Back'), ...goPrevious());
    if (i === 0) g.then(goBack, 'action.artboard', { artboard: hero.id, transition: 'fade', duration: 250 }, 'none');
    g.then(click(g, next, 'Next'), ...goNext());
    checklist.push(item(`Part ${i + 1}: write your own lead line, the three things to think about and the placeholder`, lead, page));
  });

  //The whole reflection: each part with its tick (a button back to it) beside everything in one box
  {
    const box = contentBox(whole);
    const rowText = text(ctx, 'Row label', '{item.done ? "✓" : "○"}  {item.short}', 14, 11, 268 - 24, { fontSize: 16, fontWeight: 600, decorative: true, wrap: false, height: 22, autoSize: 'none' });
    const row = bind(
      createNode('frame', { name: 'Part row', x: 0, y: 0, width: 268, height: 44, cornerRadius: 10, fill: solid(L.background), stroke: stroke(L.border, 1.5), clip: false, role: 'button', focusable: true, cursor: 'pointer', children: [rowText] }) as FrameNode,
      { ariaLabel: '"Edit part " + item.n + ": " + item.short + ": " + (item.done ? "written" : "not written yet")' },
    );
    const rows = createNode('frame', { name: 'Part rows', x: 16, y: 48, width: 268, height: 4 * 52 - 8, fill: null, stroke: null, clip: false, repeat: { items: 'parts', layout: 'vertical', gap: 8, columns: 1 }, children: [row] } as never);
    const heading = text(ctx, 'Parts heading', 'Your four parts', 16, 14, 268, { fontSize: 14, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 });
    const total = text(ctx, 'Total words', '{totalWords} words in all. Press a part to go back and change it.', 16, 48 + 4 * 52 + 4, 268, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const list = panel(ctx, 'Parts list', box.x, box.y, 300, 48 + 4 * 52 + 80, [heading, rows, total], { role: 'region', ariaLabel: 'The four parts of your reflection' });
    const all = textBox(ctx, 'Whole reflection', reflection, box.x + 324, box.y, box.width - 324, 320, '', 'Your whole reflection, ready to copy');
    const hint = text(ctx, 'Copy hint', 'Click in the box, press Ctrl+A (Cmd+A on a Mac) to select it all and Ctrl+C to copy it, or download it as a text file. To change what you wrote, use the parts on the left.', box.x + 324, box.y + 332, box.width - 324, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
    const back = button(ctx, 'Back button', 'Back', box.x, 524, 130, false);
    const save = button(ctx, 'Download button', 'Download as a file', 976 - 230, 524, 230);
    whole.children.push(list, all, hint, back, save);

    const g = graph(whole);
    const arrive = g.event('event.start', {}, 'Put it all together');
    g.run(arrive, setVar(reflection, reportExpr('My reflection', PROMPTS.map((p, i) => [p.short, vars[i]] as [string, typeof reflection]), '(Not written yet)')));
    g.then(g.event('event.pointer', { target: row.id, type: 'click' }, 'A part row'), 'action.artboard', { to: 'expression', expr: 'parts[event.index].page', transition: 'fade', duration: 250 });
    g.run(click(g, back, 'Back'), goPrevious());
    g.run(click(g, save, 'Download'), ['action.saveFile', { name: '"my-reflection"', text: 'reflection', mime: 'text/plain' }]);
    checklist.push(
      item('Change the headings the whole reflection uses: the Set variable node after "Put it all together" (Interactions tab) lists each part with its heading', all, whole),
      item('Change the file name the learner gets in the Download a file node on this page (it saves the whole reflection as a .txt)', save, whole),
    );
  }

  checklist.unshift(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));
  checklist.push(
    item('Change how many words the count line asks for: the "aim" variable (Variables tab)', undefined, pages[0]),
    item('The four pills are one layer repeated over the live "parts" variable (Variables tab): if you rename a part, change its name and page name there and rename the page to match. A pill goes to the page it names', undefined, pages[1]),
    item('Writing is kept as it is written: the four text variables are ticked Save as user data (Variables tab), so there is no Save or Load node to maintain. To add a part, duplicate a part page into the Journal group, add a text variable for it ticked Save as user data, and add it to "parts", "totalWords" and "resumeAt"', undefined, hero),
    item('Check where it is saved: on the Link for StudyDesk each learner\'s reflection is kept under their StudyDesk session, anywhere else it stays in their browser (Share)', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: whole.id };
  //Notes for whoever edits the template, below the pages
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(pages[0], { ...below(pages[0], 0, 440), text: '**User data** The four text variables are ticked Save as user data: kept as they change and put back before the journal opens. There are no Save or Load nodes, and `returning` is live from `userData.restored`.', colour: 'sky' });
  addNote(pages[0], { ...below(pages[0], 456, 440), text: '**One pill, four parts.** The pills and the rows on the last page are one layer repeated over the live `parts` list, and one flow goes to `parts[event.index].page` by name.', colour: 'sky' });
  addNote(hero, { ...below(hero, 0, 440), text: '[ ] **Make it yours** in the Variables tab. Write your own prompts. The word count and the length bar both read `aim`, in the Variables tab.', colour: 'gold' });
  addNote(whole, { ...below(whole, 0, 440), text: '**Download a file** saves the whole reflection as a .txt after a tap. It needs no microphone or camera. [ ] Change the file name in its node.', colour: 'gold' });

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
