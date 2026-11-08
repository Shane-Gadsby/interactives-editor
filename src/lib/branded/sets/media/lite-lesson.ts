//Lite lesson: one lesson in three weights. The learner picks Video, Audio only or Text only, each card showing what that version really
//weighs (downloadSize() reads the sizes of the files on its artboard), and the pick is remembered. A slow-connection or data-saver hint
//only highlights the lighter card, it never chooses. All three versions finish on the same page, so the completion record is the same.
//The transcript is one variable shown on every version, so the three never drift apart. Audio only and Text only load no video, and Text only loads no media at all.
//The remembered version is a user data variable (no save and load steps), the audio version is a Video layer with a sound and a poster picture, and an empty video says so itself.
import { createNode, uid, type Artboard, type CaptionCue, type FrameNode, type SceneNode, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { pillButton, stack } from '../../parts';
import { addVar, announce, bind, click, endPage, go, graph, heroPage, placeholderPicture, resetVars, toggleVar } from './shared';
import { addPlaceholderSound, type Note } from './sounds';

//Artboard names are what downloadSize() is asked about on the Choose page
const VIDEO = 'Video lesson';
const AUDIO = 'Audio only lesson';
const TEXT = 'Text only lesson';

const TRANSCRIPT = [
  'Most journal articles are built the same way, and once you know the pattern you can read them in the order that suits you.',
  'Start with the abstract. It tells you in a paragraph what the researchers asked, how they went about it and what they found. Then read the introduction and the conclusion: together they say why the question matters and what the authors make of the answer.',
  'Only then go to the methods and the results. Read them with a question in mind, such as whether the sample is big enough to trust. Skim anything you do not need yet, and come back to it.',
].join('\n\n');

//A short placeholder tone, as long as the caption under it
const TONE: Note[] = [
  { hz: 523, ms: 500, gap: 150 },
  { hz: 659, ms: 500, gap: 150 },
  { hz: 784, ms: 800 },
];
const TONE_MS = 2600;

//The three version cards on the Choose page: what each is called and says, and which artboard it takes its size from
const CARDS = [
  { id: 'video', title: 'Video', board: VIDEO, says: 'The whole lesson with pictures and sound. Best on wifi or a good connection.', go: 'Use video' },
  { id: 'audio', title: 'Audio only', board: AUDIO, says: 'Just the soundtrack, with the transcript and key images beside it. Good for listening while you do something else.', go: 'Use audio only' },
  { id: 'text', title: 'Text only', board: TEXT, says: 'The transcript and key images, with no sound or video loaded. The lightest, and quick on a weak connection.', go: 'Use text only' },
];

//What a learner is told a version weighs: nothing at all reads as "Nothing to download", not as "0 B"
const sizeLine = (board: string) => `downloadSize("${board}") == 0 ? "Nothing to download" : fileSize(downloadSize("${board}"))`;

//The bottom row every version has: back to the chooser, and finish (the same page for all three, so the completion is the same)
function footerRow(ctx: BrandedCtx, page: Artboard, done: Artboard, choose: Artboard): void {
  const b = contentBox(page);
  const change = button(ctx, 'Change version button', 'Change version', b.x, b.y + b.height - 46, 200, false);
  const finish = button(ctx, 'Finish button', 'Finish the lesson', b.x + b.width - 230, b.y + b.height - 46, 230);
  page.children.push(change, finish);
  const g = graph(page);
  g.run(click(g, change, 'Change version'), go(choose));
  g.run(click(g, finish, 'Finish'), go(done));
}

/** States for the layout check: the transcript open on the video version. */
const LAYOUT_STATES: LayoutState[] = [{ label: 'transcript open', page: 'Video lesson', vars: { showText: true } }];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Lite lesson');
  const { project, L } = ctx;
  //The chosen version is user data: it comes back by itself the next visit, with no save and load steps
  const version = addVar(project, 'version', 'string', '', { userData: true });
  addVar(project, 'suggested', 'string', '');
  const showText = addVar(project, 'showText', 'boolean', false);
  addVar(project, 'transcript', 'string', TRANSCRIPT);

  const { page: hero, start } = heroPage(ctx, 'Lite lesson', 'One lesson, three ways to take it: video, audio only or text only. You see what each one costs to load before you choose.', 'Start', 'Start button');
  hero.name = 'Start';
  const choose = brandedPage(ctx, 'Choose a version', { footer: 'Lite lesson' });
  const video = brandedPage(ctx, 'The lesson: video', { name: VIDEO, footer: 'Video version' });
  const audio = brandedPage(ctx, 'The lesson: audio only', { name: AUDIO, footer: 'Audio only version' });
  const plain = brandedPage(ctx, 'The lesson: text only', { name: TEXT, footer: 'Text only version' });
  const done = endPage(ctx, 'Lesson complete', 'You finished the lesson using the {version == "video" ? "video" : version == "audio" ? "audio only" : "text only"} version.', 'Choose again');
  done.page.name = 'Done';
  const checklist: TemplateChecklistItem[] = [];
  const pages: Record<string, Artboard> = { video, audio, text: plain };

  // ---------------------------------------------------------------- start: a remembered version skips the chooser
  {
    const g = graph(hero);
    //One Go to artboard names the page the remembered version sits on; nothing remembered (or a version that is not one of the three) leaves by No artboard to the chooser
    const open = g.run(click(g, start, 'Begin'), ['action.artboard', { to: 'expression', expr: CARDS.map((c) => `version == "${c.id}" ? "${c.board}" : `).join('') + '""', transition: 'fade', duration: 250 }]);
    g.then(open, 'action.artboard', { to: 'next', transition: 'fade', duration: 250 }, 'none');
    checklist.push(item('Write the title and the line under it on the first page. A learner who has already chosen a version goes straight to it from here, and "Change version" on each lesson page brings the chooser back', hero.children.find((n) => n.name === 'Subtitle'), hero));
  }

  // ---------------------------------------------------------------- choose
  {
    const b = contentBox(choose);
    const g = graph(choose);
    const intro = text(ctx, 'Intro text', 'It is the same lesson in all three. Pick the way that suits your connection and your day. You can change your mind at any time.', 0, 0, b.width, { fontSize: 17, lineHeight: 1.3 });
    const hint = bind(text(ctx, 'Connection hint', 'Your connection looks slow, or Data Saver is on. The lightest option is marked, but the choice is yours.', 0, 0, b.width, { fontSize: 15, fontWeight: 600, lineHeight: 1.3 }), { visible: 'lowBandwidth' });
    const W = 288;
    const GAP = (b.width - W * 3) / 2;
    const buttons: SceneNode[] = [];
    const cards = CARDS.map((c) => {
      const title = heading(ctx, `${c.title} title`, c.title, 20, 16, W - 40, { fontSize: 24 });
      const says = text(ctx, `${c.title} description`, c.says, 20, 54, W - 40, { fontSize: 15, lineHeight: 1.35, color: L.muted, autoSize: 'none', height: 92 } as never);
      const size = text(ctx, `${c.title} size`, `{${sizeLine(c.board)}}`, 20, 156, W - 40, { fontSize: 22, fontWeight: 700 });
      const sizeNote = text(ctx, `${c.title} size note`, '{assetsEmbedded ? "of media in this lesson" : "to load"}', 20, 188, W - 40, { fontSize: 14, color: L.muted });
      const badge = bind(text(ctx, `${c.title} suggested`, 'Suggested for your connection', 20, 214, W - 40, { fontSize: 14, fontWeight: 700 }), { visible: `lowBandwidth && suggested == "${c.id}"` });
      const pick = button(ctx, `${c.title} button`, c.go, 20, 240, W - 40, c.id === 'video');
      pick.ariaLabel = `${c.go}. ${c.title} version`;
      buttons.push(pick);
      //Choosing remembers the version (it is user data) and opens it
      g.run(click(g, pick, c.title), ['action.setVariable', { variable: version.id, op: 'set', value: `"${c.id}"` }], go(pages[c.id]));
      //The marked card gets the accent outline, only when the connection says so
      return bind(createNode('frame', { name: `${c.title} card`, x: 0, y: 0, width: W, height: 300, cornerRadius: 16, fill: solid(L.surface), stroke: stroke(L.border, 2), clip: false, role: 'region', ariaLabel: `${c.title} version`, children: [title, says, size, sizeNote, badge, pick] }) as FrameNode, { 'stroke.paint.color': `lowBandwidth && suggested == "${c.id}" ? "${L.accent}" : "${L.border}"` });
    });
    const row = stack('Version cards', 0, 0, b.width, { direction: 'row', gap: GAP, align: 'start', children: cards });
    const note = text(ctx, 'Size note', '{assetsEmbedded ? "This copy of the lesson already holds all three versions, so the sizes show what each one contains. Choosing changes what plays, not what has been downloaded." : "Only the version you choose is loaded. Sizes are what its pictures, sound and video weigh."}', 0, 0, b.width, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    choose.children.push(stack('Choose column', b.x, b.y, b.width, { gap: 12, children: [intro, hint, row, note] }));
    //The connection hint: the lightest option for a data-saver or very slow connection, the middle one for a slower one. It is only ever a mark on a card
    g.run(g.event('event.start', {}, 'Mark the lighter option'), ['action.setVariable', { variable: project.variables.find((x) => x.name === 'suggested')!.id, op: 'set', value: 'saveData || connectionType == "slow-2g" || connectionType == "2g" ? "text" : lowBandwidth ? "audio" : "video"' }]);
    checklist.push(
      item('Check the three cards. The sizes are read from the files on each version\'s artboard (downloadSize in the text), so they fill in by themselves when you add your video, sound and pictures. If you rename an artboard (Video lesson, Audio only lesson, Text only lesson) change its name in the size line too', byName(choose, 'Video size'), choose),
      item('Change the line under "Choose a version" if you want to say more about when to use each. The marked card only shows when the browser reports a slow connection or Data Saver; it never picks for the learner', intro, choose),
    );
  }

  // ---------------------------------------------------------------- video version
  {
    const b = contentBox(video);
    const g = graph(video);
    //Until a video is chosen the layer says so itself (emptyText)
    const clip = createNode('video', {
      name: 'Video',
      x: 0,
      y: 0,
      width: 560,
      height: 315,
      cornerRadius: 12,
      autoplay: false,
      controls: true,
      fit: 'contain',
      ariaLabel: 'The lesson video',
      emptyText: 'No video has been chosen yet.',
    } as Partial<VideoNode>);
    const aside = text(ctx, 'Video note', 'Turn on captions from the buttons in the corner of the page. The transcript is the same text the other two versions show.', 0, 0, 560, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    const toggle = bind(pillButton(ctx, 'Transcript button', 'Show transcript', 0, 0, 168), { label: 'showText ? "Hide transcript" : "Show transcript"', ariaExpanded: 'showText' });
    toggle.ariaLabel = 'Show or hide the transcript';
    //a small secondary button at the top right of the transcript (its own bar, pushed to the end), so the lesson's one full size button is the one that finishes it
    const words = bind(createNode('frame', { name: 'Transcript panel', x: 0, y: 0, width: 344, height: 338, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: true, role: 'region', ariaLabel: 'Transcript', children: [text(ctx, 'Transcript text', '{transcript}', 20, 16, 304, { fontSize: 15, lineHeight: 1.4 })] }) as FrameNode, { visible: 'showText' });
    video.children.push(stack('Clip column', b.x, b.y, 560, { gap: 16, children: [clip, aside] }), stack('Transcript column', b.x + 584, b.y, 344, { gap: 14, children: [stack('Transcript bar', 0, 0, 344, { direction: 'row', justify: 'end', align: 'center', children: [toggle] }), words] }));
    g.run(click(g, toggle, 'Transcript'), toggleVar(showText), announce('showText ? "Transcript shown" : "Transcript hidden"'));
    g.run(g.event('event.start', {}, 'Transcript starts hidden'), resetVars(showText));
    footerRow(ctx, video, done.page, choose);
    checklist.push(item('Video version: select the Video layer and pick your video in the inspector. Until you do, the layer says no video has been chosen. Add captions to it there too', clip, video));
  }

  // ---------------------------------------------------------------- audio only version
  {
    const b = contentBox(audio);
    //The soundtrack is a Video layer with a sound file in it and a poster picture, which shows the whole time under the controls
    const sound = addPlaceholderSound(project, 'Soundtrack (replace).wav', TONE);
    const poster = placeholderPicture(project, 'Key image (replace)', 'Key image', 'Replace me', { width: 880, height: 496 });
    const cue: CaptionCue = { id: uid('cap'), start: 0, end: TONE_MS, text: 'Replace this sound with the soundtrack, then caption it from the transcript.' };
    const player = createNode('video', {
      name: 'Soundtrack',
      x: 0,
      y: 0,
      width: 440,
      height: 248,
      cornerRadius: 12,
      assetId: sound,
      posterAssetId: poster,
      autoplay: false,
      controls: true,
      fit: 'contain',
      ariaLabel: 'The lesson soundtrack. Key image: replace the poster picture and describe what it shows',
      captionLang: 'en',
      captions: [cue],
    } as Partial<VideoNode>);
    const aside = text(ctx, 'Listen note', 'Everything that is said is also written in the transcript beside this player.', 0, 0, 440, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    const words = createNode('frame', { name: 'Transcript panel', x: b.x + 464, y: b.y, width: 464, height: 382, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: true, role: 'region', ariaLabel: 'Transcript', children: [heading(ctx, 'Transcript title', 'Transcript', 20, 14, 424, { fontSize: 20 }), text(ctx, 'Transcript text', '{transcript}', 20, 52, 424, { fontSize: 15, lineHeight: 1.4 })] }) as FrameNode;
    audio.children.push(stack('Listen column', b.x, b.y, 440, { gap: 14, children: [player, aside] }), words);
    footerRow(ctx, audio, done.page, choose);
    checklist.push(
      item('Audio only version: replace the placeholder "Soundtrack (replace)" in the Assets panel with your audio (the arrow beside it). It should make sense with no picture: "as you can see here" does not work for someone who is only listening, so re-record or reword those lines', player, audio),
      item('Replace the grey poster picture on the Soundtrack layer (Poster in the inspector) with a still from the lesson and write what it shows in the layer\'s description. It shows the whole time a sound plays', player, audio),
    );
  }

  // ---------------------------------------------------------------- text only version
  {
    const b = contentBox(plain);
    const words = createNode('frame', { name: 'Transcript panel', x: b.x, y: b.y, width: 536, height: 382, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: true, role: 'region', ariaLabel: 'Transcript', children: [heading(ctx, 'Transcript title', 'Transcript', 20, 14, 496, { fontSize: 20 }), text(ctx, 'Transcript text', '{transcript}', 20, 52, 496, { fontSize: 16, lineHeight: 1.45 })] }) as FrameNode;
    const one = picture(ctx, 'Key image 1', 0, 0, 368, 162);
    one.ariaLabel = 'Key image 1: replace this picture and describe what it shows';
    const oneCaption = text(ctx, 'Key image 1 caption', 'Key image 1: say what it shows.', 0, 0, 368, { fontSize: 14, color: L.muted });
    const two = picture(ctx, 'Key image 2', 0, 0, 368, 162);
    two.ariaLabel = 'Key image 2: replace this picture and describe what it shows';
    const twoCaption = text(ctx, 'Key image 2 caption', 'Key image 2: say what it shows.', 0, 0, 368, { fontSize: 14, color: L.muted });
    plain.children.push(words, stack('Key images', b.x + 560, b.y, 368, { gap: 6, children: [one, oneCaption, two, twoCaption] }));
    footerRow(ctx, plain, done.page, choose);
    checklist.push(
      item('Text only version: replace the two grey key images with the pictures that carry the lesson, and write the captions under them. Keep them small: this version is for weak connections. It loads no video or sound', one, plain),
      item('The transcript is one variable, "transcript" in the Variables tab, shown on all three versions. Replace the sample text with what your lesson says, so the versions stay in step', byName(plain, 'Transcript text'), plain),
    );
  }

  // ---------------------------------------------------------------- done: the same page whichever version was used
  {
    const g = graph(done.page);
    g.run(click(g, done.again, 'Choose again'), go(choose));
    g.run(g.event('event.start', {}, 'Done'), announce('"Lesson complete."'));
    checklist.push(item('Change the closing line. Every version finishes on this page, and this page is the completion point, so the result is recorded the same whichever version was used', done.result, done.page));
  }

  //One completion record for all three versions
  project.settings.reporting = { completion: 'artboard', completionArtboard: done.page.id };

  //Notes for whoever edits the template, below each page
  const below = (page: Artboard, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(hero, { ...below(hero, 0, 440), text: '**Remembered choice** `version` is a user data variable, so it comes back by itself. One Go to artboard names the page it sits on, and a first visit leaves by No artboard to the chooser.', colour: 'sky' });
  addNote(choose, { ...below(choose, 0, 440), text: '**Sizes** are `downloadSize()` of each version\'s artboard, so they fill in as you add files. A rename of an artboard needs the same rename in the size line.', colour: 'sky' });
  addNote(audio, { ...below(audio, 0, 440), text: '**Audio only** is a Video layer holding a sound, with a poster picture. [ ] Swap the placeholder sound and the poster, and describe the poster.', colour: 'gold' });
  addNote(video, { ...below(video, 0, 440), text: '**Empty state** The Video layer says no video is chosen until you pick one.', colour: 'sky' });
  return { project, checklist };
}

export const liteLesson: BrandedStarter = {
  key: 'media/lite-lesson',
  set: 'media',
  name: 'Lite lesson',
  description: 'A lesson in three weights: Video, Audio only or Text only, each card showing what that version weighs, the choice remembered, and a slow-connection or Data Saver hint that marks the lighter one without ever choosing for the learner. One transcript feeds all three, and every version finishes on the same page. Placeholder sound and pictures to replace.',
  tags: ['video', 'audio', 'text', 'low bandwidth', 'accessibility', 'data saver'],
  build,
  layoutStates: LAYOUT_STATES,
};
