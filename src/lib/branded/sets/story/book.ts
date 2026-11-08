//Interactive book: a cover, a contents page, three chapters of two or three pages (text, a picture, and a check your understanding question at the end of each chapter), a progress bar per chapter, a Contents button on every page and a summary of chapters completed and questions right.
import { createNode, type Artboard, type FrameNode, type LogicNode, type Question, type QuestionKind, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, contentBox, item, picture, text, todo, type BrandedStarter } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { after, announce, bind, brandQuestionFrame, click, go, graph, graphNote, panel } from '../assessment/shared';
import { extrasChecklist, extrasShort, progressBar, questionExtras } from '\.\./\.\./parts';
import { addVar, groupPages } from './common';

const TITLE = 'A short guide to academic integrity';
const BODY_Y = 140;
const NAV_Y = 524;

interface QuestionDef {
  kind: QuestionKind;
  patch: Partial<Question>;
}

interface PageDef {
  title: string;
  paragraphs?: string[];
  question?: QuestionDef;
}

interface Chapter {
  name: string;
  blurb: string;
  pages: PageDef[];
}

//Kept neutral and accurate. Three chapters, each ending in one question.
const CHAPTERS: Chapter[] = [
  {
    name: 'What integrity means',
    blurb: 'The values behind academic integrity, and where they show up in your study.',
    pages: [
      {
        title: 'Honesty, trust and fairness',
        paragraphs: [
          'Academic integrity means being honest about your own work and about where your ideas come from.',
          'It rests on values most of us already share: honesty, trust, fairness, respect and responsibility.',
          'When you act with integrity, your marks and your qualification mean something, to you and to everyone who relies on them.',
        ],
      },
      {
        title: 'Where it shows up',
        paragraphs: [
          'Academic integrity is not only about essays. It shows up in assignments, exams, group work, lab reports and the data you collect.',
          'It also covers the small decisions: whether you did the reading you cite, whether you share your answers, and whether you ask when you are not sure.',
        ],
      },
      {
        title: 'Check your understanding',
        question: {
          kind: 'single',
          patch: {
            prompt: 'Which of these is an example of academic integrity?',
            options: [
              { id: 'o1', text: 'Writing your own answer and citing the sources you used', correct: true },
              { id: 'o2', text: 'Sharing your finished assignment so a friend can copy it' },
              { id: 'o3', text: 'Handing in a past student\'s work as your own' },
            ],
            hints: ['Which one is honest about whose work it is?'],
            hintPenalty: 0.5,
            feedbackCorrect: 'Yes. Your own work, with your sources acknowledged, is what integrity looks like.',
            feedbackIncorrect: 'Not quite. Only one of these is honest about whose work it is.',
          },
        },
      },
    ],
  },
  {
    name: 'Using sources well',
    blurb: 'Why we reference, and how to quote and paraphrase.',
    pages: [
      {
        title: 'Why we reference',
        paragraphs: [
          'A reference tells your reader where an idea or a fact came from, so they can find it and check it.',
          'It also gives credit to the people whose work you built on.',
          'Using someone else\'s words or ideas without saying so is plagiarism, even when it is not on purpose.',
        ],
      },
      {
        title: 'Quote, paraphrase, reference',
        paragraphs: [
          'Quote when the exact words matter: use quotation marks and give the source.',
          'Paraphrase to put an idea in your own words and your own sentence structure. Changing a few words is not enough.',
          'In both cases, reference the source. Check which referencing style your unit uses.',
        ],
      },
      {
        title: 'Check your understanding',
        question: {
          kind: 'truefalse',
          patch: {
            prompt: 'True or false: if you put an author\'s idea into your own words, you do not need to reference it.',
            options: [
              { id: 'o1', text: 'True' },
              { id: 'o2', text: 'False', correct: true },
            ],
            feedbackCorrect: 'False. The idea is still the author\'s, so it needs a reference.',
            feedbackIncorrect: 'It is false. The idea is still the author\'s, so it needs a reference even in your own words.',
          },
        },
      },
    ],
  },
  {
    name: 'Getting help',
    blurb: 'What help is fine, what is not, and what to do when you are unsure.',
    pages: [
      {
        title: 'Help that is fine, and help that is not',
        paragraphs: [
          'Fine: study groups, feedback on a draft, writing and maths support, and asking your lecturer questions.',
          'Not fine: someone else writing or rewriting your work, buying or sharing assignments, or using material you are not allowed to use.',
          'If you are not sure, check your unit\'s assessment rules or ask before you submit. That includes tools such as generative AI.',
        ],
      },
      {
        title: 'Check your understanding',
        question: {
          kind: 'single',
          patch: {
            prompt: 'A friend offers to read your draft and suggest improvements. Is that all right?',
            options: [
              { id: 'o1', text: 'Yes, if the assessment allows it. The work must still be yours', correct: true },
              { id: 'o2', text: 'No. Nobody may ever see a draft' },
              { id: 'o3', text: 'Yes, and they can rewrite parts of it for you' },
            ],
            hints: ['Feedback helps you improve your work. Who should do the writing?'],
            hintPenalty: 0.5,
            feedbackCorrect: 'Yes. Feedback is fine where the assessment allows it, as long as the work you hand in is still yours.',
            feedbackIncorrect: 'Not quite. Feedback is fine where the assessment allows it, but the writing must stay yours.',
          },
        },
      },
    ],
  },
];

const OUT_OF = CHAPTERS.length;
const pageName = (c: number, i: number) => `${c + 1}.${i + 1} ${CHAPTERS[c].pages[i].title}`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Interactive book');
  const { project, L } = ctx;
  const checklist: TemplateChecklistItem[] = [];

  //The chapters as data: the contents cards, the summary and the strip on every page read this list ("first" is the name of the chapter's first page, which Open chapter goes to)
  addVar(project, 'chapters', 'list', CHAPTERS.map((ch, c) => ({ name: ch.name, blurb: ch.blurb, size: ch.pages.length, first: pageName(c, 0) })));
  //What the reader has done, one entry per chapter: pages reached, and the question's score (-1 until it is answered). Remembered, so a returning reader keeps their place and progress
  addVar(project, 'reached', 'list', CHAPTERS.map(() => 0), { persist: true });
  addVar(project, 'results', 'list', CHAPTERS.map(() => -1), { persist: true });
  //Live: how far through each chapter (the pages read before the last one, plus one more once its question is answered), how many are complete, and the score reported to StudyDesk
  addVar(project, 'progress', 'list', [], { formula: 'chapters.map((c, i) => ({name: c.name, size: c.size, done: Math.min(reached[i], c.size - 1) + (results[i] >= 0 ? 1 : 0)}))', live: true });
  addVar(project, 'chaptersDone', 'number', 0, { formula: 'progress.filter(c => c.done == c.size).length', live: true });
  const score = addVar(project, 'score', 'number', 0, { formula: 'results.reduce((a, r) => a + Math.max(0, r), 0)', live: true });
  const results = project.variables.find((v) => v.name === 'results')!;
  const reached = project.variables.find((v) => v.name === 'reached')!;

  const cover = brandedPage(ctx, TITLE, { kind: 'hero', name: 'Cover', subtitle: `An interactive book in ${OUT_OF} chapters. Read at your own pace, answer a question at the end of each chapter, and come back any time: it remembers where you were.` });
  const contents = brandedPage(ctx, 'Contents', { footer: TITLE });
  const chapterPages: Artboard[][] = CHAPTERS.map((ch, c) => ch.pages.map((p, i) => brandedPage(ctx, p.title, { name: pageName(c, i), footer: TITLE })));
  const summary = brandedPage(ctx, 'Your summary', { footer: TITLE });
  //Each chapter is an artboard group, so Next and Previous stay in the chapter and pageNumber and pageCount count its own pages
  CHAPTERS.forEach((ch, c) => groupPages(project, `Chapter ${c + 1}: ${ch.name}`, chapterPages[c]));

  //Cover
  {
    const begin = button(ctx, 'Start reading button', 'Start reading', 48, cover.height * 0.42 + 190, 200);
    const menu = button(ctx, 'Contents button', 'Contents', 264, cover.height * 0.42 + 190, 160, false);
    cover.children.push(begin, menu);
    const g = graph(cover);
    g.run(click(g, begin, 'Start reading'), go(chapterPages[0][0]));
    g.run(click(g, menu, 'Contents'), go(contents));
  }

  //The Contents button in the corner of every page that is not the contents page itself
  const menuButton = (page: Artboard): SceneNode => {
    const title = page.children.find((n) => n.name === 'Page title')!;
    (title as { width: number }).width = page.width - 96 - 160;
    const b = button(ctx, 'Contents button', 'Contents', page.width - 48 - 130, 32, 130, false);
    b.height = 38;
    b.cornerRadius = 19;
    b.ariaLabel = 'Open the contents page';
    page.children.push(b);
    const g = graph(page);
    g.run(click(g, b, 'Contents'), go(contents));
    return b;
  };

  //Contents: one card for each chapter (a repeater over the chapters list) with its progress and a button to open it
  {
    const box = contentBox(contents);
    const w = (box.width - 2 * 20) / 3;
    const label = text(ctx, 'Chapter number', 'CHAPTER {index + 1}', 22, 20, w - 44, { fontSize: 13, fontWeight: 700, color: L.muted });
    const name = text(ctx, 'Chapter name', '{item.name}', 22, 44, w - 44, { fontSize: 22, fontWeight: 700, lineHeight: 1.25, role: 'heading', headingLevel: 2 });
    const blurb = text(ctx, 'Chapter blurb', '{chapters[index].blurb}', 22, 110, w - 44, { fontSize: 16, lineHeight: 1.4, color: L.muted });
    const status = text(ctx, 'Chapter status', '{item.done == item.size ? "Completed" : item.done > 0 ? "In progress" : "Not started"}  ·  {item.done} of {item.size}', 22, 214, w - 44, { fontSize: 15, fontWeight: 600 });
    const bar = progressBar(ctx, 'Chapter progress', 22, 246, w - 44, { value: 'item.done', max: 'item.size', label: 'Chapter progress', valueText: '{value} of {max}' });
    const open = bind(button(ctx, 'Open chapter button', 'Open chapter', 22, 276, w - 44), { label: 'item.done > 0 && item.done < item.size ? "Continue chapter " + (index + 1) : "Open chapter " + (index + 1)' });
    const card = bind(panel(ctx, 'Chapter card', 0, 0, w, 348, [label, name, blurb, status, bar, open], { role: 'region' }), { ariaLabel: '"Chapter " + (index + 1) + ": " + item.name' });
    const cards = createNode('frame', { name: 'Chapter cards', x: box.x, y: box.y, width: box.width, height: 348, fill: null, stroke: null, clip: false, repeat: { items: 'progress', layout: 'grid', gap: 20, columns: 3 }, children: [card] } as never);
    const tally = text(ctx, 'Chapters completed', '{chaptersDone} of {progress.length} chapters completed', box.x, 512, 500, { fontSize: 17, fontWeight: 600 });
    const finish = button(ctx, 'Summary button', 'See my summary', 976 - 220, NAV_Y - 12, 220, false);
    contents.children.push(cards, tally, finish);
    const g = graph(contents);
    //One flow for every chapter's button: event.index is the card, and the chapters list says which page it opens
    const onOpen = click(g, open, 'Open the chapter');
    g.run(onOpen, ['action.artboard', { to: 'expression', expr: 'chapters[event.index].first', transition: 'fade', duration: 250 }]);
    graphNote(contents, { anchor: onOpen, colour: 'sky', text: '**One flow serves every chapter card.** `event.index` is the card, and Go to page reads that chapter\'s `first` page name from `chapters`. [ ] When you rename or move a chapter\'s first page, update `first` there.' });
    g.run(click(g, finish, 'Summary'), go(summary));
    checklist.push(todo('Rename the chapters and rewrite their cards', 'Rename the chapters and rewrite what each card says: Project > Variables > "chapters" (name, blurb, the number of pages, and the name of its first page). The cards, the strip on each page and the summary all read it', name, contents));
  }

  //The chapter pages
  CHAPTERS.forEach((ch, c) => {
    ch.pages.forEach((def, i) => {
      const page = chapterPages[c][i];
      const n = c + 1;
      const box = contentBox(page);
      const g0 = graph(page);

      //Reading a page counts it towards the chapter (never takes progress back): pageNumber is the page within the chapter
      const countStart = g0.event('event.start', {}, 'Count this page');
      g0.run(countStart, ['action.setVariable', { variable: reached.id, op: 'setItem', index: String(c), value: `Math.max(reached[${c}], pageNumber)` }]);

      //The chapter strip: its name and a bar of how far through it you are
      const strip = text(ctx, 'Chapter strip', `Chapter ${n}: ${ch.name}`, 48, 102, 600, { fontSize: 14, fontWeight: 600, color: L.muted, bindings: { text: `"Chapter ${n}: " + chapters[${c}].name` } } as never);
      const bar = progressBar(ctx, 'Chapter progress', 700, 108, 200, { value: `progress[${c}].done`, max: `chapters[${c}].size`, label: 'Chapter progress', valueText: '{value} of {max}', height: 10 });
      const amount = text(ctx, 'Chapter progress text', `{progress[${c}].done} of {chapters[${c}].size}`, 912, 102, 64, { fontSize: 14, fontWeight: 600, color: L.muted, align: 'right' });
      page.children.push(strip, bar, amount);
      menuButton(page);

      let check: LogicNode | undefined;
      //Body: text and a picture, or a question with a note and a picture beside it
      if (def.question) {
        //The question takes the whole width: its feedback and buttons grow it downwards, and wide options stay on one line
        const id = addQuestion(project, page.id, def.question.kind, { at: { x: box.x, y: BODY_Y }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
        setQuestionSettings(project, page.id, id, { ...def.question.patch, attempts: 2, points: 1, reveal: true, report: null });
        const frame = page.children.find((x) => x.id === id) as FrameNode;
        frame.width = box.width;
        frame.name = `Question ${n}`;
        frame.layout = { ...frame.layout!, gap: 12, padding: { top: 16, right: 24, bottom: 16, left: 24 } };
        syncQuestion(project, page.id, id);
        brandQuestionFrame(ctx, frame);
        const prefix = frame.question!.prefix;
        //When the question is finished keep its first result: the chapter's entry in "results" (the book's score is live, from that list)
        check = page.logic.nodes.find((x) => x.kit?.slot === 'check:action')!;
        after(page, check, 'action.setVariable', { variable: results.id, op: 'setItem', index: String(c), value: `results[${c}] < 0 ? ${prefix}_score : results[${c}]` }, 'finished');
        checklist.push(todo(`Chapter ${n} question: write the question and answers`, `Chapter ${n} question: write your own question and answers (Question section in the inspector). Its result is kept in the chapter's entry of the "results" variable by the Set variable node after Check answer`, frame, page));
      } else {
        const body = text(ctx, 'Page text', (def.paragraphs ?? []).join('\n'), box.x, BODY_Y, 470, { fontSize: 20, lineHeight: 1.45, paragraphSpacing: 18 });
        const pic = picture(ctx, 'Picture', box.x + 510, BODY_Y, box.width - 510, 300);
        page.children.push(body, pic);
        checklist.push(todo(`Chapter ${n}, page ${i + 1}: write your text and swap the picture`, `Chapter ${n}, page ${i + 1}: write your own text, and swap the picture for yours`, body, page));
      }

      //Previous, "page n of m" and Next along the bottom: the buttons follow the chapter's own page order, and the left and right arrow keys work on pages that have no question to answer
      const lastOfChapter = i === ch.pages.length - 1;
      const firstOfBook = c === 0 && i === 0;
      const prev = button(ctx, 'Previous button', firstOfBook ? 'Contents' : 'Previous', box.x, NAV_Y, 150, false);
      const count = text(ctx, 'Page count', 'Page {pageNumber} of {pageCount}', 300, NAV_Y + 11, 424, { fontSize: 15, color: L.muted, align: 'center' });
      const nextLabel = !lastOfChapter ? 'Next' : c === CHAPTERS.length - 1 ? 'Finish' : 'Next chapter';
      const next = button(ctx, 'Next button', nextLabel, 976 - 170, NAV_Y, 170);
      if (!def.question) {
        prev.shortcut = 'Left';
        next.shortcut = 'Right';
      }
      page.children.push(prev, count, next);
      const g = graph(page);
      //Next and Previous stop at the ends of the chapter: the No artboard output goes on to the next chapter (or the summary), and back to the chapter before (or the contents from the first page of the book)
      const onNext = click(g, next, 'Next');
      const goNext = g.run(onNext, ['action.artboard', { to: 'next', transition: 'fade', duration: 250 }]);
      g.then(goNext, 'action.artboard', { artboard: (c === CHAPTERS.length - 1 ? summary : chapterPages[c + 1][0]).id, transition: 'fade', duration: 250 }, 'none');
      const goPrev = g.run(click(g, prev, 'Previous'), ['action.artboard', { to: 'previous', transition: 'fade', duration: 250 }]);
      g.then(goPrev, 'action.artboard', { artboard: (c === 0 ? contents : chapterPages[c - 1][CHAPTERS[c - 1].pages.length - 1]).id, transition: 'fade', duration: 250 }, 'none');
      graphNote(page, { anchor: onNext, colour: 'sky', text: `**Next stays inside the chapter.** Go to page has nothing after the last page, so its **No artboard** output goes on to ${c === CHAPTERS.length - 1 ? 'the summary' : 'the next chapter'}, and Previous does the same the other way. [ ] A new page needs no wiring.` });
      if (i === 0) graphNote(page, { anchor: countStart, colour: 'sky', text: `**Reading a page counts it.** \`reached\` keeps the furthest page of chapter ${n} (never less), and the live \`progress\` turns that, plus the question, into the bar, the contents ticks and the summary.` });
      if (check) graphNote(page, { anchor: check, colour: 'sky', text: '**When the question is finished**, its first score is kept in the chapter\'s entry of `results`, and the live `score` adds those up for the summary. The kit\'s own flows handle everything before that.' });
    });
  });

  //Summary: chapters completed, the questions' score, a line for each chapter, and the way back
  {
    const box = contentBox(summary);
    menuButton(summary);
    const lineName = text(ctx, 'Chapter line', '{item.done == item.size ? "✓" : "○"}  Chapter {index + 1}: {item.name}', 0, 0, 384, { fontSize: 17 });
    const lines = createNode('frame', { name: 'Chapter lines', x: 28, y: 160, width: 384, height: CHAPTERS.length * 36, fill: null, stroke: null, clip: false, repeat: { items: 'progress', layout: 'vertical', gap: 10, columns: 1 }, children: [lineName] } as never);
    const left = panel(ctx, 'Chapters card', box.x, box.y, 440, 360, [
      text(ctx, 'Chapters label', 'Chapters completed', 28, 24, 384, { fontSize: 18, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 }),
      text(ctx, 'Chapters count', '{chaptersDone} of {progress.length}', 28, 58, 384, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }),
      lines,
      text(ctx, 'Chapters note', 'A chapter is complete when you have read its pages and answered its question.', 28, 280, 384, { fontSize: 15, color: L.muted, lineHeight: 1.4 }),
    ], { role: 'region', ariaLabel: 'Chapters completed' });
    const verdict = `score >= ${OUT_OF} ? "Every question right. Well done." : score >= ${OUT_OF - 1} ? "Most of them right. Have another look at the one you missed." : "Have another look at the chapters, then try the questions again."`;
    const rw = box.width - 464 - 56;
    const qLine = text(ctx, 'Chapter question', 'Chapter {item.n}: {item.r < 0 ? "not answered" : item.r >= 1 ? "right" : item.r > 0 ? "part right" : "not right"}', 0, 0, rw, { fontSize: 17 });
    const qLines = createNode('frame', { name: 'Question lines', x: 28, y: 160, width: rw, height: CHAPTERS.length * 36, fill: null, stroke: null, clip: false, repeat: { items: 'results.map((r, i) => ({n: i + 1, r}))', layout: 'vertical', gap: 10, columns: 1 }, children: [qLine] } as never);
    const right = panel(ctx, 'Score card', box.x + 464, box.y, box.width - 464, 360, [
      text(ctx, 'Score label', 'Check your understanding', 28, 24, rw, { fontSize: 18, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 }),
      text(ctx, 'Score', `{Math.round(score * 10) / 10} of ${OUT_OF}`, 28, 58, rw, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }),
      qLines,
      text(ctx, 'Score message', `{${verdict}}`, 28, 280, rw, { fontSize: 17, fontWeight: 600, lineHeight: 1.4 }),
    ], { role: 'region', ariaLabel: 'Questions right' });
    const back = button(ctx, 'Back to contents button', 'Back to contents', box.x, NAV_Y, 200, false);
    const again = button(ctx, 'Start again button', 'Start again', 976 - 170, NAV_Y, 170);
    summary.children.push(left, right, back, again);
    const g = graph(summary);
    g.run(click(g, back, 'Contents'), go(contents));
    const onAgain = click(g, again, 'Start again');
    g.run(onAgain, ['action.startOver', {}]);
    const onSummary = g.event('event.start', {}, 'Summary');
    g.run(onSummary, announce(`"You have completed " + chaptersDone + " of " + progress.length + " chapters and got " + Math.round(score * 10) / 10 + " of ${OUT_OF} questions right."`));
    graphNote(summary, { anchor: onSummary, colour: 'sky', text: '**The summary reads itself out** from the same live `chaptersDone` and `score` the screen shows. `reached` and `results` are remembered between visits, so a returning reader starts where they left off.' });
    graphNote(summary, { anchor: onAgain, colour: 'sky', text: '**Start over clears that memory too**: variables reset, progress is forgotten and the cover shows. Nothing after that node runs. [ ] Remove the button if readers should keep their progress.' });
    checklist.push(todo('Check the summary page reads right', 'Check the summary: it reads the chapters, reached and results variables (Variables tab) and the verdict wording in the Score message', right, summary));
  }

  checklist.unshift(item('Write the book title and the line under it on the cover', cover.children.find((n) => n.name === 'Subtitle'), cover));
  checklist.push(
    todo('To add a page to a chapter, copy one of its pages', 'To add a page to a chapter: duplicate one of its pages inside its artboard group. Next, Previous and "Page n of m" follow the group, so nothing is rewired. Change "size" for the chapter in the "chapters" variable (the progress bars read it)', undefined, chapterPages[0][1]),
    todo('Check that progress is remembered', 'Progress is remembered: the reached and results variables are ticked Remember (Variables tab), and Project > Results and progress > Resume on the same artboard is on, so a returning reader opens where they stopped. On the Link for StudyDesk it is kept under their StudyDesk session', undefined, contents),
    todo('Check the score is reported to StudyDesk', 'The score is reported to StudyDesk (Project > Results and progress): the live "score" variable out of ' + OUT_OF + ', complete on reaching the summary page. Change the top score if you add or remove questions', undefined, summary),
  );

  //Notes for whoever edits the template, beside the pages
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(contents, { ...below(contents, 0, 440), text: '**One card, three chapters.** The cards are a repeater over `progress`, a live list worked out from `chapters`, `reached` and `results`. One button flow opens the right chapter by name (`chapters[event.index].first`).', colour: 'sky' });
  addNote(contents, { ...below(contents, 456, 440), text: '[ ] Edit the `chapters` variable, not the cards. Keep each `first` the same as the name of that chapter\'s first page in the page list.', colour: 'gold' });
  addNote(chapterPages[0][0], { ...below(chapterPages[0][0], 0, 440), text: '**Artboard groups** Each chapter is a group, so Next and Previous stay in it and **Page {pageNumber} of {pageCount}** counts its pages. The end of a chapter takes the No artboard output on to the next one.', colour: 'sky' });
  addNote(chapterPages[0][2], { ...below(chapterPages[0][2], 0, 440), text: '**Question result** A set-item node after Check answer keeps the first result in this chapter\'s slot of `results`. The score on the summary is a live variable that adds the slots up.', colour: 'sky' });

  project.settings.reporting = { scoreVariable: score.id, maxScore: OUT_OF, completion: 'artboard', completionArtboard: summary.id, resumeArtboard: true };
  checklist.push(todo(extrasShort({ hint: true, tryAgain: true }), extrasChecklist({ hint: true, tryAgain: true })));
  return { project, checklist };
}

export const book: BrandedStarter = {
  key: 'story/interactive-book',
  set: 'story',
  name: 'Interactive book',
  description: 'A book with a cover, a contents page, three chapters of two or three pages (text, pictures and a check your understanding question), a progress bar for each chapter, a Contents button on every page and a summary of the chapters completed and the questions right. Remembers where the reader was.',
  tags: ['book', 'chapters', 'question kit', 'progress'],
  build,
};
