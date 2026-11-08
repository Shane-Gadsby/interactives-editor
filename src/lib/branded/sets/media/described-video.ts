//Described video: a video lesson with the description track wired up. The video layer carries captions for the speech and descriptions of what the
//picture shows (short sentences in the gaps between speech). With the viewer's Descriptions button on, a voice on their device reads each one while
//the video is turned down; the Transcript lists the captions and the descriptions together in one reading order, which works with no voice. A last
//page is the author's checklist on describing well, to delete before publishing. A cheaper aid, never a recorded described version.
import { createNode, uid, type CaptionCue, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { addNote, barY, brandedPage, brandedProject, button, contentBox, heading, item, solid, text, todo, type BrandedStarter } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { fill, stack } from '../../parts';
import { Graph, goNext, goPrevious, heroPage } from './shared';

const VIDEO_W = 616;
const VIDEO_H = 347;

const cue = (start: number, end: number, text: string, speaker?: string): CaptionCue => ({ id: uid('cu'), start: start * 1000, end: end * 1000, text, ...(speaker ? { speaker } : {}) });

//What is said: the speech cues. The descriptions below sit in the gaps between them, one sentence each.
const SAID = [
  cue(1, 5, 'Welcome. Today we will read one graph together.', 'Presenter'),
  cue(10, 15, 'Look at how the line moves as the weeks go by.', 'Presenter'),
  cue(22, 28, 'So the more weeks of practice, the higher the score.', 'Presenter'),
  cue(36, 40, 'Always check the axes before you trust the trend.', 'Presenter'),
];
//What is shown and not said. Present tense, plain words, read out the text that matters, and short enough for the gap (about 2 to 3 words a second).
const SEEN = [
  cue(5.5, 9.5, 'A line graph. Score up the side, weeks along the bottom.'),
  cue(15.5, 21.5, 'The line starts low in week 1, at about 30, and climbs steadily to about 80 in week 8.'),
  cue(28.5, 35.5, 'A dashed arrow points at the end of the line. The text beside it reads: Practice helps.'),
];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Described video');
  const { project, L } = ctx;

  const { page: hero, start } = heroPage(ctx, 'Described video', 'Watch a short lesson. A voice can tell you what is on screen, and the transcript lists it with the words.');
  const watch = brandedPage(ctx, 'Watch the lesson', { footer: 'Described video' });
  const notes = brandedPage(ctx, 'Describing well', { footer: 'For authors: delete this page before you publish' });
  const checklist: TemplateChecklistItem[] = [];

  //Hero
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  // ---------------------------------------------------------------- the lesson
  const box = contentBox(watch);
  //Until a video is chosen the layer says so itself (emptyText), so there is no placeholder frame to hide
  const video = createNode('video', {
    name: 'Video',
    x: box.x,
    y: box.y,
    width: VIDEO_W,
    height: VIDEO_H,
    cornerRadius: 12,
    autoplay: false,
    controls: true,
    fit: 'contain',
    ariaLabel: 'A short lesson on reading a graph',
    emptyText: 'No video has been chosen yet.',
    captionLang: 'en',
    captions: SAID,
    descriptionLang: 'en',
    descriptions: SEEN,
  } as Partial<VideoNode>);
  watch.children.push(video);
  checklist.push(todo('Choose your video file', 'Choose your video: select the Video layer and pick a file in the inspector. Until you do, the layer says no video has been chosen', video, watch));
  checklist.push(todo('Replace the sample captions with your own', 'Replace the sample captions: Video layer > Captions > Import… (a WebVTT or SRT file made for your video). They say what is heard', video, watch));
  checklist.push(todo('Write your own audio descriptions', 'Write your own descriptions: Video layer > Descriptions. One short sentence each, in the gap between speech, saying what is only in the picture. Set the Language so the right voice reads them. Delete the three samples', video, watch));

  //Beside the video: what the learner can do, in one column so a line that wraps pushes the rest down
  const how = heading(ctx, 'How to listen', 'Hear what is on screen', 0, 0, 288, { fontSize: 22 });
  const hear = text(ctx, 'About descriptions', 'Press Descriptions (top right of the page) and a voice on your device says what the picture shows, in the gaps between the speech. The video gets quieter while it speaks.', 0, 0, 288, { fontSize: 15, lineHeight: 1.4 });
  const read = text(ctx, 'About the transcript', 'Press Transcript to read it all in order: the words and the descriptions together. It works without a voice and you can search it.', 0, 0, 288, { fontSize: 15, lineHeight: 1.4 });
  const help = text(ctx, 'About the voice', 'The Descriptions button only shows when your device has a voice that can read them. Nothing you hear is recorded or sent anywhere.', 0, 0, 288, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
  const toNotes = button(ctx, 'Author checklist', 'Author checklist', 0, 0, 288, false);
  watch.children.push(stack('Side column', box.x + 640, box.y, 288, { gap: 12, children: [how, hear, read, help, toNotes] }));
  checklist.push(todo('Decide whether descriptions start on', 'Decide whether descriptions start on: Project settings > Captions and narration > "Descriptions on to start". It starts off, because most viewers do not need it; each viewer\'s own choice is remembered', hear, watch));
  checklist.push(todo('Test it: descriptions on, on a phone, then the transcript', 'Test it: turn Descriptions on, play on a phone with and without headphones (the voice over the speaker is what to check), then open the Transcript and read it start to finish. Run the accessibility check', toNotes, watch));

  const wg = new Graph(watch);
  wg.run(wg.click(toNotes, 'To the checklist'), goNext());

  // ---------------------------------------------------------------- the author page
  const nbox = contentBox(notes);
  const panelW = 300;
  const listW = nbox.width - panelW - 32;
  const list = text(
    ctx,
    'Describing well',
    [
      '1.  Say what a person who could see would need to follow, not everything. Do not repeat the speech.',
      '2.  One clear sentence, present tense, plain words: "A line graph. Score up the side, weeks along the bottom."',
      '3.  Read out text that appears and matters: a title, a label, a formula.',
      '4.  Put each one in a gap between speech. About 2 to 3 words a second: ten words need about four seconds.',
      '5.  Describe a diagram once, in the order you would explain it. For a dense one, also put the full description in the page text.',
      '6.  No opinions ("a beautiful chart"). Name people the way the speech does.',
    ].join('\n\n'),
    0,
    0,
    listW,
    { fontSize: 16, lineHeight: 1.35 },
  );
  const limitsHead = heading(ctx, 'Limits heading', 'What this is', 0, 0, panelW - 40, { fontSize: 20 });
  const limitsText = text(
    ctx,
    'Limits text',
    'A cheaper aid, not a recorded described version. The words are read by a voice on the learner\'s own device, so it sounds like a screen reader.\n\nIf your course is formally required to have an audio described version, record one. The transcript with descriptions always works, with or without a voice.',
    0,
    0,
    panelW - 40,
    { fontSize: 15, lineHeight: 1.4 },
  );
  const limits = stack('Limits panel', 0, 0, panelW, { gap: 10, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [limitsHead, limitsText] });
  const columns = stack('Describing columns', nbox.x, nbox.y, nbox.width, { direction: 'row', gap: 32, align: 'start', children: [fill(list), limits] });
  const back = button(ctx, 'Back to the video', 'Back to the video', 0, 0, 220, true);
  const reminder = text(ctx, 'Delete reminder', 'Delete this page, and the Author checklist button on the video page, before you publish.', 0, 0, nbox.width - 244, { fontSize: 15, color: L.muted });
  const endRow = stack('Back row', nbox.x, barY(nbox), nbox.width, { direction: 'row', gap: 24, align: 'center', children: [back, fill(reminder)] });
  notes.children.push(columns, endRow);
  checklist.push(todo('Read the Describing well page, then delete it', 'Read the Describing well page, then delete it and the Author checklist button before you publish', list, notes));
  checklist.push(todo('Record a formal described version if you need one', 'Need a formally recorded described version? Record it: these descriptions do not replace one', limitsText, notes));

  const ng = new Graph(notes);
  ng.run(ng.click(back, 'Back'), goPrevious());

  //Notes for whoever edits the template, below each page
  const below = (page: typeof watch, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(watch, { ...below(watch, 0, 440), text: '**Empty state** The Video layer says no video is chosen until you pick one, so there is no placeholder frame to delete afterwards.', colour: 'sky' });
  addNote(watch, { ...below(watch, 456, 440), text: '**Descriptions** are not drawn. A voice on the viewer\'s device reads them in the gaps, and the viewer\'s Transcript lists them with the captions. [ ] Replace the samples with your own.', colour: 'gold' });
  addNote(notes, { ...below(notes, 0, 440), text: '[ ] Delete this page, and the Author checklist button on the video page, before you publish.', colour: 'orange' });

  return { project, checklist };
}

export const describedVideo: BrandedStarter = {
  key: 'media/described-video',
  set: 'media',
  name: 'Described video',
  description: 'A video lesson with a description track wired up: a voice on the learner\'s device says what is on screen in the gaps (the video turns down while it speaks), and the Transcript lists the speech and the descriptions in one order. Sample captions and descriptions, and a page on describing well. A cheaper aid, not a recorded described version.',
  tags: ['video', 'audio description', 'captions', 'transcript', 'accessibility'],
  build,
};
