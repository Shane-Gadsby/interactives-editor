//Interactive book: a cover, a contents page, three chapters of two or three pages (text, a picture, and a check your understanding question at the end of each chapter), a progress bar per chapter, a Contents button on every page and a summary of chapters completed and questions right.
import { createNode, uid, type Artboard, type FrameNode, type Question, type QuestionKind, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { addQuestion, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, contentBox, item, picture, solid, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { after, announce, bind, brandQuestionFrame, click, go, graph, panel, setVar } from '../assessment/shared';
import { spreadPages } from './common';

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

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Interactive book');
  const { project, L } = ctx;
  const checklist: TemplateChecklistItem[] = [];

  //Per chapter: pages reached (c), and the question's score (s, -1 until it is answered). Remembered, so a returning reader keeps their place and progress
  const remember = (name: string, initial: number): Variable => {
    const v: Variable = { id: uid('v'), name, type: 'number', initial, persist: true };
    project.variables.push(v);
    return v;
  };
  const reached = CHAPTERS.map((_, i) => remember(`c${i + 1}`, 0));
  const result = CHAPTERS.map((_, i) => remember(`s${i + 1}`, -1));
  const score = remember('score', 0);
  const scoreExpr = result.map((v) => `Math.max(0, ${v.name})`).join(' + ');

  //How far through chapter n: the pages read before the last one, plus one more once its question is answered
  const size = (n: number) => CHAPTERS[n].pages.length;
  const done = (n: number) => `(Math.min(c${n + 1}, ${size(n) - 1}) + (s${n + 1} >= 0 ? 1 : 0))`;
  const complete = (n: number) => `(${done(n)} == ${size(n)})`;
  const chaptersDone = CHAPTERS.map((_, n) => `(${complete(n)} ? 1 : 0)`).join(' + ');

  const cover = brandedPage(ctx, TITLE, { kind: 'hero', name: 'Cover', subtitle: `An interactive book in ${OUT_OF} chapters. Read at your own pace, answer a question at the end of each chapter, and come back any time: it remembers where you were.` });
  const contents = brandedPage(ctx, 'Contents', { footer: TITLE });
  const chapterPages: Artboard[][] = CHAPTERS.map((ch, c) => ch.pages.map((p, i) => brandedPage(ctx, p.title, { name: `${c + 1}.${i + 1} ${p.title}`, footer: TITLE })));
  const summary = brandedPage(ctx, 'Your summary', { footer: TITLE });
  const order = chapterPages.flat();

  //Cover
  {
    const begin = button(ctx, 'Start reading button', 'Start reading', 48, cover.height * 0.42 + 190, 200);
    const menu = button(ctx, 'Contents button', 'Contents', 264, cover.height * 0.42 + 190, 160, false);
    cover.children.push(begin, menu);
    const g = graph(cover);
    g.run(click(g, begin, 'Start reading'), go(order[0]));
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

  //A bar that fills with a fraction expression (0 to 1)
  const bar = (name: string, x: number, y: number, width: number, fraction: string, height = 10) => {
    const track = createNode('rect', { name: `${name} track`, x, y, width, height, cornerRadius: height / 2, fill: solid(L.surfaceMuted), stroke: null, decorative: true });
    const fill = bind(createNode('rect', { name, x, y, width: 0, height, cornerRadius: height / 2, fill: solid(L.button), stroke: null, decorative: true }), { width: `${width} * ${fraction}` });
    return [track, fill];
  };

  //Contents: a card per chapter with its progress and a button to open it
  {
    const box = contentBox(contents);
    const w = (box.width - 2 * 20) / 3;
    const heads: SceneNode[] = [];
    CHAPTERS.forEach((ch, n) => {
      const label = text(ctx, 'Chapter number', `CHAPTER ${n + 1}`, 22, 20, w - 44, { fontSize: 13, fontWeight: 700, color: L.muted });
      const name = text(ctx, 'Chapter name', ch.name, 22, 44, w - 44, { fontSize: 22, fontWeight: 700, lineHeight: 1.25, role: 'heading', headingLevel: 2 });
      const blurb = text(ctx, 'Chapter blurb', ch.blurb, 22, 110, w - 44, { fontSize: 16, lineHeight: 1.4, color: L.muted });
      const status = text(ctx, 'Chapter status', `{${complete(n)} ? "Completed" : ${done(n)} > 0 ? "In progress" : "Not started"}  ·  {${done(n)}} of ${size(n)}`, 22, 214, w - 44, { fontSize: 15, fontWeight: 600 });
      const [track, fill] = bar('Chapter progress', 22, 246, w - 44, `${done(n)} / ${size(n)}`);
      const open = bind(button(ctx, 'Open chapter button', `Open chapter ${n + 1}`, 22, 276, w - 44), { label: `${done(n)} > 0 && !${complete(n)} ? "Continue chapter ${n + 1}" : "Open chapter ${n + 1}"` });
      const card = panel(ctx, `Chapter ${n + 1} card`, box.x + n * (w + 20), box.y, w, 348, [label, name, blurb, status, track, fill, open], { role: 'region', ariaLabel: `Chapter ${n + 1}: ${ch.name}` });
      contents.children.push(card);
      heads.push(name);
      const g = graph(contents);
      g.run(click(g, open, `Chapter ${n + 1}`), go(chapterPages[n][0]));
    });
    const tally = text(ctx, 'Chapters completed', `{${chaptersDone}} of ${OUT_OF} chapters completed`, box.x, 512, 500, { fontSize: 17, fontWeight: 600 });
    const finish = button(ctx, 'Summary button', 'See my summary', 976 - 220, NAV_Y - 12, 220, false);
    contents.children.push(tally, finish);
    const g = graph(contents);
    g.run(click(g, finish, 'Summary'), go(summary));
    checklist.push(item('Rename the chapters and rewrite what each card says (the chapter names are repeated on each chapter\'s pages, in the footer and on the summary page)', heads[0], contents));
  }

  //The chapter pages
  CHAPTERS.forEach((ch, c) => {
    ch.pages.forEach((def, i) => {
      const page = chapterPages[c][i];
      const n = c + 1;
      const globalIndex = order.indexOf(page);
      const box = contentBox(page);
      const g0 = graph(page);

      //Reading a page counts it towards the chapter (never takes progress back)
      g0.run(g0.event('event.start', {}, 'Count this page'), setVar(reached[c], `Math.max(c${n}, ${i + 1})`));

      //The chapter strip: its name and a bar of how far through it you are
      const strip = text(ctx, 'Chapter strip', `Chapter ${n}: ${ch.name}`, 48, 102, 600, { fontSize: 14, fontWeight: 600, color: L.muted });
      const [track, fill] = bar('Chapter progress', 700, 108, 200, `${done(c)} / ${size(c)}`);
      const amount = text(ctx, 'Chapter progress text', `{${done(c)}} of ${size(c)}`, 912, 102, 64, { fontSize: 14, fontWeight: 600, color: L.muted, align: 'right' });
      page.children.push(strip, track, fill, amount);
      menuButton(page);

      //Body: text and a picture, or a question with a note and a picture beside it
      if (def.question) {
        //The question takes the whole width: its feedback and buttons grow it downwards, and wide options stay on one line
        const id = addQuestion(project, page.id, def.question.kind, { at: { x: box.x, y: BODY_Y } })!;
        setQuestionSettings(project, page.id, id, { ...def.question.patch, attempts: 2, points: 1, reveal: true, report: null });
        const frame = page.children.find((x) => x.id === id) as FrameNode;
        frame.width = box.width;
        frame.name = `Question ${n}`;
        frame.layout = { ...frame.layout!, gap: 12, padding: { top: 16, right: 24, bottom: 16, left: 24 } };
        syncQuestion(project, page.id, id);
        brandQuestionFrame(ctx, frame);
        const prefix = frame.question!.prefix;
        //When the question is finished keep its first result, and the score across the book is the sum of the chapters' results
        const check = page.logic.nodes.find((x) => x.kit?.slot === 'check:action')!;
        const keep = after(page, check, 'action.setVariable', { variable: result[c].id, op: 'set', value: `s${n} < 0 ? ${prefix}_score : s${n}` }, 'finished');
        after(page, keep, 'action.setVariable', { variable: score.id, op: 'set', value: scoreExpr });
        checklist.push(item(`Chapter ${n} question: write your own question and answers (Question section in the inspector). Its result is kept in the "s${n}" variable by the Set variable node after Check answer`, frame, page));
      } else {
        const body = text(ctx, 'Page text', (def.paragraphs ?? []).join('\n'), box.x, BODY_Y, 470, { fontSize: 20, lineHeight: 1.45, paragraphSpacing: 18 });
        const pic = picture(ctx, 'Picture', box.x + 510, BODY_Y, box.width - 510, 300);
        page.children.push(body, pic);
        checklist.push(item(`Chapter ${n}, page ${i + 1}: write your own text, and swap the picture for yours`, body, page));
      }

      //Previous, "page n of m" and Next along the bottom, and the arrow keys on pages that have no question to answer
      const prevTo = globalIndex === 0 ? contents : order[globalIndex - 1];
      const nextTo = globalIndex === order.length - 1 ? summary : order[globalIndex + 1];
      const lastOfChapter = i === ch.pages.length - 1;
      const prev = button(ctx, 'Previous button', globalIndex === 0 ? 'Contents' : 'Previous', box.x, NAV_Y, 150, false);
      const count = text(ctx, 'Page count', `Page ${i + 1} of ${ch.pages.length}`, 300, NAV_Y + 11, 424, { fontSize: 15, color: L.muted, align: 'center' });
      const nextLabel = !lastOfChapter ? 'Next' : c === CHAPTERS.length - 1 ? 'Finish' : 'Next chapter';
      const next = button(ctx, 'Next button', nextLabel, 976 - 170, NAV_Y, 170);
      page.children.push(prev, count, next);
      const g = graph(page);
      g.run(click(g, prev, 'Previous'), go(prevTo));
      g.run(click(g, next, 'Next'), go(nextTo));
      if (!def.question) {
        g.run(g.event('event.key', { key: 'ArrowLeft', type: 'keydown' }, 'Arrow keys'), go(prevTo));
        g.run(g.event('event.key', { key: 'ArrowRight', type: 'keydown' }, 'Arrow keys'), go(nextTo));
      }
    });
  });

  //Summary: chapters completed, the questions' score, a line for each chapter, and the way back
  {
    const box = contentBox(summary);
    menuButton(summary);
    const chapterLine = (n: number) => `{${complete(n)} ? "✓" : "○"}  Chapter ${n + 1}: ${CHAPTERS[n].name}`;
    const left = panel(ctx, 'Chapters card', box.x, box.y, 440, 360, [
      text(ctx, 'Chapters label', 'Chapters completed', 28, 24, 384, { fontSize: 18, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 }),
      text(ctx, 'Chapters count', `{${chaptersDone}} of ${OUT_OF}`, 28, 58, 384, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }),
      ...CHAPTERS.map((_, n) => text(ctx, `Chapter ${n + 1} line`, chapterLine(n), 28, 160 + n * 36, 384, { fontSize: 17 })),
      text(ctx, 'Chapters note', 'A chapter is complete when you have read its pages and answered its question.', 28, 280, 384, { fontSize: 15, color: L.muted, lineHeight: 1.4 }),
    ], { role: 'region', ariaLabel: 'Chapters completed' });
    const total = `(${scoreExpr})`;
    const verdict = `${total} >= ${OUT_OF} ? "Every question right. Well done." : ${total} >= ${OUT_OF - 1} ? "Most of them right. Have another look at the one you missed." : "Have another look at the chapters, then try the questions again."`;
    const right = panel(ctx, 'Score card', box.x + 464, box.y, box.width - 464, 360, [
      text(ctx, 'Score label', 'Check your understanding', 28, 24, box.width - 464 - 56, { fontSize: 18, fontWeight: 700, color: L.muted, role: 'heading', headingLevel: 2 }),
      text(ctx, 'Score', `{Math.round(${total} * 10) / 10} of ${OUT_OF}`, 28, 58, box.width - 464 - 56, { fontSize: 64, fontWeight: 700, lineHeight: 1.1 }),
      ...CHAPTERS.map((_, n) => text(ctx, `Chapter ${n + 1} question`, `Chapter ${n + 1}: {s${n + 1} < 0 ? "not answered" : s${n + 1} >= 1 ? "right" : s${n + 1} > 0 ? "part right" : "not right"}`, 28, 160 + n * 36, box.width - 464 - 56, { fontSize: 17 })),
      text(ctx, 'Score message', `{${verdict}}`, 28, 280, box.width - 464 - 56, { fontSize: 17, fontWeight: 600, lineHeight: 1.4 }),
    ], { role: 'region', ariaLabel: 'Questions right' });
    const back = button(ctx, 'Back to contents button', 'Back to contents', box.x, NAV_Y, 200, false);
    const again = button(ctx, 'Start again button', 'Start again', 976 - 170, NAV_Y, 170);
    summary.children.push(left, right, back, again);
    const g = graph(summary);
    g.run(click(g, back, 'Contents'), go(contents));
    g.run(click(g, again, 'Start again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Summary'), announce(`"You have completed " + (${chaptersDone}) + " of ${OUT_OF} chapters and got " + Math.round(${total} * 10) / 10 + " of ${OUT_OF} questions right."`));
    checklist.push(item('Check the summary: it reads the c, s and score variables (Variables tab) and the verdict wording in the Score message', right, summary));
  }

  checklist.unshift(item('Write the book title and the line under it on the cover', cover.children.find((n) => n.name === 'Subtitle'), cover));
  checklist.push(
    item('To add a page to a chapter: duplicate one of its pages, then rewire Previous and Next on it and on the pages either side, change its footer and "Page n of m" text, and change the chapter size in the "Count this page" Set variable node and in the progress bar and text bindings (the number after the divide sign)', undefined, chapterPages[0][1]),
    item('Progress is remembered: the c1, c2, c3, s1, s2, s3 and score variables are ticked Remember (Variables tab), and Project > Results and progress > Resume on the same artboard is on, so a returning reader opens where they stopped. On the Link for StudyDesk it is kept under their StudyDesk session', undefined, contents),
    item('The score is reported to StudyDesk (Project > Results and progress): the "score" variable out of ' + OUT_OF + ', complete on reaching the summary page. Change the top score if you add or remove questions', undefined, summary),
  );

  project.settings.reporting = { scoreVariable: score.id, maxScore: OUT_OF, completion: 'artboard', completionArtboard: summary.id, resumeArtboard: true };
  spreadPages(project);
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
