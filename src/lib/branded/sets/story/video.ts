//Video with questions: a video layer that stops at set times for a question from the question kit, a chapter list that seeks, and a summary page.
//The video is tied to variables (position and playing both ways, length and ended out), so pausing and seeking are just Set variable nodes.
import { createNode, type ContainerNode, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../../question-kit';
import { brandedPage, brandedProject, button, card, contentBox, heading, item, solid, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, darkButton, go, set, spreadPages } from './common';

const QUESTIONS = [
  { at: 20, prompt: 'What is the first thing worth reading in an academic article?', options: ['The abstract', 'The reference list', 'The last paragraph'], hint: 'It is a short summary at the start.' },
  { at: 45, prompt: 'Why skim the headings before reading closely?', options: ['To see the structure and the main points', 'To avoid reading the article', 'To find the longest section'], hint: 'Think about what a map is for.' },
  { at: 70, prompt: 'What helps you remember what you read?', options: ['Writing a short summary in your own words', 'Copying out the whole text', 'Highlighting every line'], hint: 'Which one makes you think about it?' },
];

const CHAPTERS = [
  { n: 0, title: 'Why read this way', time: 0 },
  { n: 1, title: 'Skim first', time: 25 },
  { n: 2, title: 'Read closely', time: 50 },
  { n: 3, title: 'Make notes', time: 75 },
];

const VIDEO_W = 616;
const VIDEO_H = 347;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Video with questions');
  const { project, L } = ctx;
  const vtime = addVar(project, 'videoTime', 'number', 0);
  const vplaying = addVar(project, 'videoPlaying', 'boolean', false);
  addVar(project, 'videoLength', 'number', 0);
  const vended = addVar(project, 'videoEnded', 'boolean', false);
  const asked = addVar(project, 'asked', 'number', 0);
  const popup = addVar(project, 'popup', 'number', 0);
  addVar(project, 'questionTimes', 'list', QUESTIONS.map((q) => q.at));
  addVar(project, 'chapters', 'list', CHAPTERS);

  const hero = brandedPage(ctx, 'Learn from video', { kind: 'hero', subtitle: 'Watch, and answer a few questions as you go. The video waits for you.' });
  const watch = brandedPage(ctx, 'Watch and answer', { footer: 'Video with questions' });
  const summary = brandedPage(ctx, 'Summary', { footer: 'Video with questions' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const start = darkButton(ctx, 'Start', 'Start', 48, 450, 180);
  hero.children.push(start);
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), go(watch));
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
    bindings: { 'media.time': 'videoTime', 'media.playing': 'videoPlaying', 'media.duration': 'videoLength', 'media.ended': 'videoEnded' },
    bindingModes: { 'media.time': 'both', 'media.playing': 'both', 'media.duration': 'out', 'media.ended': 'out' },
  } as Partial<VideoNode>);
  const holder = createNode('frame', {
    name: 'Video placeholder',
    x: box.x,
    y: box.y,
    width: VIDEO_W,
    height: VIDEO_H,
    cornerRadius: 12,
    clip: true,
    fill: solid(L.surfaceMuted),
    stroke: null,
    role: 'region',
    ariaLabel: 'No video chosen yet',
    bindings: { visible: '!layer("Video").src && !layer("Video").assetId' },
    children: [
      heading(ctx, 'Placeholder title', 'Choose a video', 40, 120, VIDEO_W - 80, { align: 'center', fontSize: 28 }),
      text(ctx, 'Placeholder text', 'Select the Video layer, then pick a video file (or paste a link) in the inspector. This note hides itself once a video is chosen.', 60, 168, VIDEO_W - 120, { align: 'center', fontSize: 17, color: L.muted, lineHeight: 1.4 }),
    ],
  });
  //Behind the questions, so a short one never lets the video show underneath it
  const cover = createNode('rect', { name: 'Question cover', x: box.x, y: box.y, width: VIDEO_W, height: VIDEO_H, cornerRadius: 12, fill: solid(L.surface), stroke: null, decorative: true, bindings: { visible: 'popup > 0' } });
  watch.children.push(video, holder, cover);
  checklist.push(item('Choose your video: select the Video layer and pick a file in the inspector. The grey note on top of it goes away by itself', video, watch));

  //The pop-up questions, over the video, shown one at a time by the "popup" variable
  const frames: ContainerNode[] = [];
  QUESTIONS.forEach((q, i) => {
    const id = addQuestion(project, watch.id, 'single', { at: { x: box.x, y: box.y } })!;
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
  checklist.push(item('Write your own three questions (select a question, then the Question section in the inspector), and set the second each one appears at: Project > Variables > "questionTimes"', frames[0], watch));

  //Beside the video: the chapters and a status
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
      'fill.color': `chapters.filter(c => c.time <= videoTime).length == item.n + 1 ? "${L.surfaceMuted}" : "${L.surface}"`,
    },
    children: [
      text(ctx, 'Chapter title', '{item.title}', 16, 14, 190, { fontSize: 17, fontWeight: 600, decorative: true }),
      text(ctx, 'Chapter time', '{Math.floor(item.time / 60)}:{String(item.time % 60).padStart(2, "0")}', 206, 15, 66, { fontSize: 15, align: 'right', color: L.muted, decorative: true }),
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
    repeat: { items: 'chapters', layout: 'vertical', gap: 8, columns: 1 },
    children: [chapter],
  });
  const status = text(ctx, 'Status', 'Questions answered: {asked} of {questionTimes.length}', box.x + 640, box.y + 300, 288, { fontSize: 17, fontWeight: 600 });
  const hint = text(ctx, 'Hint', 'Press play. The video stops for each question and carries on when you press Continue.', box.x + 640, box.y + 332, 288, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
  const toSummary = button(ctx, 'Go to summary', 'Go to the summary', box.x + 640, box.y + 400, 288, false);
  watch.children.push(chapHead, chapters, status, hint, toSummary);
  checklist.push(item('Rename the chapters and set where each one starts: Project > Variables > "chapters" (title and time in seconds)', chapters, watch));

  //The wiring
  const g = new Graph(watch);
  const onStart = g.add('event.start', {}, null, 'out', { note: 'Start from the beginning' });
  g.run(onStart, set(asked, '0'), set(popup, '0'), set(vplaying, 'false'), set(vtime, '0'));

  //Reaching the next question time: pause and show it
  const onTime = g.add('event.variable', { variable: vtime.id }, null, 'out', { note: 'A question is due' });
  const due = g.add('logic.if', { condition: 'popup == 0 && asked < questionTimes.length && videoTime >= questionTimes[asked]' }, onTime);
  g.runFrom(due, 'true', set(popup, 'asked + 1'), set(vplaying, 'false'), ['action.announce', { text: '"Question " + popup + " of " + questionTimes.length + ". The video is paused."' }]);
  g.gap(40);

  //Someone pressing play on the video's own controls while a question is open
  const onPlay = g.add('event.variable', { variable: vplaying.id }, null, 'out', { note: 'Keep it paused behind a question' });
  const sneaky = g.add('logic.if', { condition: 'popup > 0 && videoPlaying' }, onPlay);
  //(the short wait lets the player see the video start before the variable says stop, or the change is swallowed in the same frame)
  g.runFrom(sneaky, 'true', ['action.delay', { ms: 40 }], set(vplaying, 'false'));

  //Continue after a question
  frames.forEach((frame) => {
    const btn = (frame.children.find((c) => (c as { questionPart?: string }).questionPart === 'buttons') as ContainerNode).children.find((c) => c.name === 'Continue')!;
    g.run(g.click(btn, 'Carry on'), set(popup, '0'), ['action.setVariable', { variable: asked.id, op: 'add', value: '1' }], set(vplaying, 'true'));
  });

  //A chapter: seek, and re-arm the questions after that point
  const onChapter = g.click(chapter, 'Chapter list');
  g.run(onChapter, set(vtime, 'chapters[event.index].time'), set(asked, 'questionTimes.filter(t => t <= chapters[event.index].time).length'), set(popup, '0'), set(vplaying, 'true'));

  //The end of the video, or the button
  const onEnd = g.add('event.variable', { variable: vended.id }, null, 'out', { note: 'Finished watching' });
  const ended = g.add('logic.if', { condition: 'videoEnded' }, onEnd);
  g.runFrom(ended, 'true', go(summary));
  g.run(g.click(toSummary, 'Summary'), go(summary));

  //Summary
  const sbox = contentBox(summary);
  const points = text(ctx, 'Summary text', '•  Read the abstract first.\n\n•  Skim the headings to see the structure.\n\n•  Make notes in your own words.', sbox.x, sbox.y, 520, { fontSize: 21, lineHeight: 1.4 });
  const panel = card(ctx, 'Score panel', sbox.x + 570, sbox.y, sbox.width - 570, 190);
  const label = text(ctx, 'Score label', 'Questions answered correctly', sbox.x + 594, sbox.y + 24, sbox.width - 618, { fontSize: 17, color: L.muted });
  const sum = QUESTIONS.map((_, i) => `${(frames[i] as unknown as { question: { prefix: string } }).question.prefix}_score`).join(' + ');
  const score = text(ctx, 'Score', `{${sum}} of {questionTimes.length}`, sbox.x + 594, sbox.y + 70, sbox.width - 618, { fontSize: 48, fontWeight: 700 });
  const again = button(ctx, 'Watch again', 'Watch again', sbox.x, sbox.y + 300, 200, true);
  summary.children.push(points, panel, label, score, again);
  const sg = new Graph(summary);
  sg.run(sg.click(again, 'Watch again'), go(watch));
  checklist.push(item('Write the summary points', points, summary));

  spreadPages(project);
  return { project, checklist: checklist as TemplateChecklistItem[] };
}

export const videoQuestions: BrandedStarter = {
  key: 'story/video-questions',
  set: 'story',
  name: 'Video with questions',
  description: 'A video that pauses at set times for a question, then carries on. A chapter list that jumps around the video, and a summary with the score. Choose your video in the inspector; until then a note says so.',
  tags: ['video', 'question kit', 'chapters'],
  build,
};
