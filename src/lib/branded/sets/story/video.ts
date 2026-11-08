//Video with questions: a video layer that stops at set times for a question from the question kit, a chapter list that seeks, and a summary page.
//The questions are cues on the video (each one pauses it as it is reached), the chapters are the video's own, and the video is held paused while a question is open.
import { createNode, uid, type ContainerNode, type LogicNode, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../../question-kit';
import { addNote, brandedPage, brandedProject, button, card, contentBox, heading, item, solid, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, darkButton, go, goNext, graphNote, set } from './common';
import { extrasChecklist, questionExtras } from '../../parts';

const QUESTIONS = [
  { at: 20, prompt: 'What is the first thing worth reading in an academic article?', options: ['The abstract', 'The reference list', 'The last paragraph'], hint: 'It is a short summary at the start.' },
  { at: 45, prompt: 'Why skim the headings before reading closely?', options: ['To see the structure and the main points', 'To avoid reading the article', 'To find the longest section'], hint: 'Think about what a map is for.' },
  { at: 70, prompt: 'What helps you remember what you read?', options: ['Writing a short summary in your own words', 'Copying out the whole text', 'Highlighting every line'], hint: 'Which one makes you think about it?' },
];

const CHAPTERS = [
  { title: 'Why read this way', time: 0 },
  { title: 'Skim first', time: 25 },
  { title: 'Read closely', time: 50 },
  { title: 'Make notes', time: 75 },
];

const VIDEO_W = 616;
const VIDEO_H = 347;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Video with questions');
  const { project, L } = ctx;
  //The video tells these: whether it has ended, and which chapter it is in (the position, length and playing are the video's own business now)
  const vended = addVar(project, 'videoEnded', 'boolean', false);
  addVar(project, 'chapterNow', 'number', 0);
  //How many questions the video has (its cues), kept for the summary page, which has no video of its own
  const questionCount = addVar(project, 'questionCount', 'number', QUESTIONS.length);
  //Which question is open (0 for none); the video is held paused while one is
  const popup = addVar(project, 'popup', 'number', 0);

  const hero = brandedPage(ctx, 'Learn from video', { kind: 'hero', subtitle: 'Watch, and answer a few questions as you go. The video waits for you.' });
  const watch = brandedPage(ctx, 'Watch and answer', { footer: 'Video with questions' });
  const summary = brandedPage(ctx, 'Summary', { footer: 'Video with questions' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  //The video and what shows until there is one
  const box = contentBox(watch);
  const video = createNode('video', {
    name: 'Video',
    x: box.x,
    y: box.y,
    width: VIDEO_W,
    height: VIDEO_H,
    cornerRadius: 12,
    autoplay: false,
    controls: true,
    ariaLabel: 'Video',
    emptyText: 'Choose a video: select this layer and pick a video file, or paste a link, in the inspector.',
    //The questions are cues that pause the video where they are reached. Seeking past one never fires it and seeking back arms it again, so nothing counts which were asked
    cues: QUESTIONS.map((q, i) => ({ id: uid('vc'), time: q.at, name: `Question ${i + 1}`, pause: true })),
    chapters: CHAPTERS.map((c) => ({ id: uid('vh'), time: c.time, title: c.title })),
    bindings: { 'media.hold': 'popup > 0', 'media.ended': 'videoEnded', 'media.chapter': 'chapterNow' },
    bindingModes: { 'media.ended': 'out', 'media.chapter': 'out' },
  } as Partial<VideoNode>);
  //Behind the questions, so a short one never lets the video show underneath it
  const cover = createNode('rect', { name: 'Question cover', x: box.x, y: box.y, width: VIDEO_W, height: VIDEO_H, cornerRadius: 12, fill: solid(L.surface), stroke: null, decorative: true, bindings: { visible: 'popup > 0' } });
  watch.children.push(video, cover);
  checklist.push(item('Choose your video: select the Video layer and pick a file in the inspector. Until you do, the video says so itself (its empty text)', video, watch));

  //The pop-up questions, over the video, shown one at a time by the "popup" variable
  const frames: ContainerNode[] = [];
  QUESTIONS.forEach((q, i) => {
    const id = addQuestion(project, watch.id, 'single', { at: { x: box.x, y: box.y }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
    setQuestionSettings(project, watch.id, id, {
      prompt: q.prompt,
      options: q.options.map((text, k) => ({ id: `o${k + 1}`, text, ...(k === 0 ? { correct: true } : {}) })),
      hints: [q.hint],
      attempts: 2,
      shuffle: true,
      feedbackCorrect: 'Yes, that is right.',
      feedbackIncorrect: 'Not quite. Have another look.',
      feedbackOutOfTries: 'The right answer is marked above.',
    });
    const frame = watch.children.find((n) => n.id === id) as ContainerNode;
    frame.width = VIDEO_W;
    frame.bindings = { ...(frame.bindings ?? {}), visible: `popup == ${i + 1}` };
    const row = frame.children.find((c) => (c as { questionPart?: string }).questionPart === 'buttons') as ContainerNode;
    const prefix = (frame as unknown as { question: { prefix: string } }).question.prefix;
    const carryOn = button(ctx, 'Continue', 'Continue video', 0, 0, 170, true);
    carryOn.height = 44;
    carryOn.bindings = { visible: `${prefix}_locked` };
    row.children.push(carryOn);
    frames.push(frame);
  });
  //Live: how many questions are finished, from the question kit's own locked flags
  addVar(project, 'answered', 'number', 0, { formula: `[${frames.map((f) => `${(f as unknown as { question: { prefix: string } }).question.prefix}_locked`).join(', ')}].filter(x => x).length`, live: true });
  checklist.push(item('Write your own three questions (select a question, then the Question section in the inspector), and set the second each one appears at: select the Video layer and change its Cues (each cue is a question, in order, and is ticked to pause the video)', frames[0], watch));

  //Beside the video: the chapters (the video's own list) and a status
  const chapHead = heading(ctx, 'Chapters heading', 'Chapters', box.x + 640, box.y, 288, { fontSize: 22 });
  const chapter = createNode('frame', {
    name: 'Chapter',
    x: 0,
    y: 0,
    width: 288,
    height: 52,
    cornerRadius: 12,
    clip: false,
    role: 'button',
    focusable: true,
    fill: solid(L.surface),
    stroke: null,
    bindings: {
      ariaLabel: '"Go to " + item.title + ", " + Math.floor(item.time / 60) + " minutes " + item.time % 60 + " seconds"',
      'fill.color': `chapterNow == index + 1 ? "${L.surfaceMuted}" : "${L.surface}"`,
    },
    children: [
      text(ctx, 'Chapter title', '{item.title}', 16, 14, 190, { fontSize: 17, fontWeight: 600, decorative: true }),
      text(ctx, 'Chapter time', '{clock(item.time)}', 206, 15, 66, { fontSize: 15, align: 'right', color: L.muted, decorative: true }),
    ],
  });
  const chapters = createNode('frame', {
    name: 'Chapters',
    x: box.x + 640,
    y: box.y + 40,
    width: 288,
    height: CHAPTERS.length * 52 + (CHAPTERS.length - 1) * 8,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Chapters',
    repeat: { items: 'layer("Video").chapters', layout: 'vertical', gap: 8, columns: 1 },
    children: [chapter],
  });
  const status = text(ctx, 'Status', 'Questions answered: {answered} of {layer("Video").cues.length}', box.x + 640, box.y + 300, 288, { fontSize: 17, fontWeight: 600 });
  const hint = text(ctx, 'Hint', 'Press play. The video stops for each question and carries on when you press Continue.', box.x + 640, box.y + 332, 288, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
  const toSummary = button(ctx, 'Go to summary', 'Go to the summary', box.x + 640, box.y + 400, 288, false);
  watch.children.push(chapHead, chapters, status, hint, toSummary);
  checklist.push(item('Rename the chapters and set where each one starts: select the Video layer and change its Chapters (title and time). The list here, the video\'s own controls and the highlight all read them', chapters, watch));

  //The wiring
  const g = new Graph(watch);
  const onStart = g.add('event.start', {}, null, 'out', { note: 'Start from the beginning' });
  g.run(onStart, ['action.resetVariables', { variables: [popup.id] }], set(questionCount, 'layer("Video").cues.length'), ['action.video', { target: video.id, op: 'seek', seconds: '0' }]);

  const kitStart = watch.logic.nodes.find((n) => n.kit);
  if (kitStart) graphNote(watch, { anchor: kitStart, colour: 'sky', text: '**The three short rows of question nodes are the question kit\'s**: choose, check, hint and Try again for each question. They never touch the video. [ ] Change a question in the inspector, and its time on the Video layer\'s cues.' });
  graphNote(watch, { anchor: onStart, colour: 'sky', text: '**Opening the page rewinds the video** and clears `popup`. `questionCount` is read from the video\'s own cue list, so adding a cue adds a question to the count.' });
  //A question cue: the video has already paused, so show the question
  const onCue = g.add('event.videoCue', { target: video.id }, null, 'out', { note: 'A question is due' });
  g.run(onCue, set(popup, 'event.index + 1'), ['action.announce', { text: '"Question " + popup + " of " + layer("Video").cues.length + ". The video is paused."' }]);

  //Continue after a question: let go of the hold, then play on (the hold lets go on the next frame)
  const carryOns: LogicNode[] = [];
  frames.forEach((frame) => {
    const btn = (frame.children.find((c) => (c as { questionPart?: string }).questionPart === 'buttons') as ContainerNode).children.find((c) => c.name === 'Continue')!;
    const onContinue = g.click(btn, 'Carry on');
    carryOns.push(onContinue);
    g.run(onContinue, ['action.resetVariables', { variables: [popup.id] }], ['action.delay', { ms: 40 }], ['action.video', { target: video.id, op: 'play' }]);
  });

  graphNote(watch, { anchor: onCue, colour: 'sky', text: '**The video has already paused itself** when the cue fires. This only sets `popup` to the question\'s number (`event.index + 1`), and each question\'s frame shows when `popup` is its own number.' });
  graphNote(watch, { anchor: carryOns[0], colour: 'sky', text: '**Continue clears popup, waits 40 ms, then plays.** The Hold paused binding lets go on the next frame, so a Play sent any sooner would be ignored.' });
  //A chapter: seek there and play. One flow for every chapter in the list
  const onChapter = g.click(chapter, 'Chapter list');
  g.run(onChapter, ['action.resetVariables', { variables: [popup.id] }], ['action.video', { target: video.id, op: 'seek', seconds: 'layer("Video").chapters[event.index].time' }], ['action.delay', { ms: 40 }], ['action.video', { target: video.id, op: 'play' }]);

  graphNote(watch, { anchor: onChapter, colour: 'sky', text: '**One flow serves every chapter.** `event.index` picks the chapter from the Video layer\'s own list, so a new chapter there needs no new wiring. It clears any open question first.' });
  //The end of the video, or the button
  const onEnd = g.add('event.variable', { variable: vended.id, onlyIf: 'videoEnded' }, null, 'out', { note: 'Finished watching' });
  g.run(onEnd, goNext());
  g.run(g.click(toSummary, 'Summary'), goNext());

  //Summary
  const sbox = contentBox(summary);
  const points = text(ctx, 'Summary text', '•  Read the abstract first.\n\n•  Skim the headings to see the structure.\n\n•  Make notes in your own words.', sbox.x, sbox.y, 520, { fontSize: 21, lineHeight: 1.4 });
  const panel = card(ctx, 'Score panel', sbox.x + 570, sbox.y, sbox.width - 570, 190);
  const label = text(ctx, 'Score label', 'Questions answered correctly', sbox.x + 594, sbox.y + 24, sbox.width - 618, { fontSize: 17, color: L.muted });
  const score = text(ctx, 'Score', `{${QUESTIONS.map((_, i) => `${(frames[i] as unknown as { question: { prefix: string } }).question.prefix}_score`).join(' + ')}} of {questionCount}`, sbox.x + 594, sbox.y + 70, sbox.width - 618, { fontSize: 48, fontWeight: 700 });
  const again = button(ctx, 'Watch again', 'Watch again', sbox.x, sbox.y + 300, 200, true);
  summary.children.push(points, panel, label, score, again);
  const sg = new Graph(summary);
  sg.run(sg.click(again, 'Watch again'), go(watch));
  checklist.push(item('Write the summary points', points, summary));

  //Notes for whoever edits the template, below the pages
  const below = (p: typeof watch, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(watch, { ...below(watch, 0, 440), text: '**Video cues** Each question is a cue on the Video layer that pauses it. **On video cue** shows the question, and **Hold paused** is bound to `popup > 0`, so the controls cannot start the video behind it. Seeking past a cue asks nothing.', colour: 'sky' });
  addNote(watch, { ...below(watch, 456, 440), text: '**Chapters** are the video\'s own, so the list here and the controls in the browser share them. One flow seeks to `chapters[event.index].time`.', colour: 'sky' });
  addNote(hero, { ...below(hero, 0, 440), text: '[ ] **Before you share it** pick your video, then set each cue\'s time to where its question belongs, and write the three questions to match.', colour: 'gold' });

  checklist.push(item(extrasChecklist({ hint: true, tryAgain: true })));
  return { project, checklist: checklist as TemplateChecklistItem[] };
}

/** Each question open over the video. */
const VIDEO_LAYOUT_STATES: LayoutState[] = QUESTIONS.map((_, i) => ({ label: `question ${i + 1} open`, page: 'Watch and answer', vars: { popup: i + 1 } }));

export const videoQuestions: BrandedStarter = {
  key: 'story/video-questions',
  set: 'story',
  name: 'Video with questions',
  description: 'A video that pauses at set times for a question, then carries on. A chapter list that jumps around the video, and a summary with the score. Choose your video in the inspector; until then a note says so.',
  tags: ['video', 'question kit', 'chapters'],
  build,
  layoutStates: VIDEO_LAYOUT_STATES,
};
