//Lite lesson: one lesson in three weights. The learner picks Video, Audio only or Text only, each card showing what that version really
//weighs (downloadSize() reads the sizes of the files on its artboard), and the pick is remembered. A slow-connection or data-saver hint
//only highlights the lighter card, it never chooses. All three versions finish on the same page, so the completion record is the same.
//The transcript is one variable shown on every version, so the three never drift apart. Audio only and Text only load no video, and Text only loads no media at all.
import { createNode, uid, type Artboard, type SceneNode, type TemplateChecklistItem, type Timeline, type VideoNode } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, picture, solid, stroke, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, click, go, graph, panel, setVar, variable } from '../assessment/shared';
import { endPage, heroPage } from '../drag/shared';
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

//The three version cards on the Choose page: where each sits, what it is called and says, and which artboard it takes its size from
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

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Lite lesson');
  const { project, L } = ctx;
  const version = variable(project, 'version', 'string', '');
  const suggested = variable(project, 'suggested', 'string', '');
  const showText = variable(project, 'showText', 'boolean', false);
  variable(project, 'transcript', 'string', TRANSCRIPT);

  const { page: hero, start } = heroPage(ctx, 'Lite lesson', 'One lesson, three ways to take it: video, audio only or text only. You see what each one costs to load before you choose.');
  const choose = brandedPage(ctx, 'Choose a version', { footer: 'Lite lesson' });
  const video = brandedPage(ctx, 'The lesson: video', { name: VIDEO, footer: 'Video version' });
  const audio = brandedPage(ctx, 'The lesson: audio only', { name: AUDIO, footer: 'Audio only version' });
  const plain = brandedPage(ctx, 'The lesson: text only', { name: TEXT, footer: 'Text only version' });
  const done = endPage(ctx, 'Lesson complete', 'You finished the lesson using the {version == "video" ? "video" : version == "audio" ? "audio only" : "text only"} version.', 'Choose a version again');
  done.page.name = 'Done';
  const checklist: TemplateChecklistItem[] = [];
  const pages: Record<string, Artboard> = { video, audio, text: plain };

  // ---------------------------------------------------------------- start: a remembered version skips the chooser
  {
    const g = graph(hero);
    const open = g.run(click(g, start, 'Begin'), ['action.loadUserData', { variables: [version.id] }]);
    //Nothing saved (a first visit) goes to the chooser; so does a saved version that is not one of the three
    g.then(open, 'action.artboard', { artboard: choose.id, transition: 'fade', duration: 250 }, 'none');
    const isVideo = g.then(open, 'logic.if', { condition: 'version == "video"' });
    g.then(isVideo, 'action.artboard', { artboard: video.id, transition: 'fade', duration: 250 }, 'true');
    const isAudio = g.then(isVideo, 'logic.if', { condition: 'version == "audio"' }, 'false');
    g.then(isAudio, 'action.artboard', { artboard: audio.id, transition: 'fade', duration: 250 }, 'true');
    const isText = g.then(isAudio, 'logic.if', { condition: 'version == "text"' }, 'false');
    g.then(isText, 'action.artboard', { artboard: plain.id, transition: 'fade', duration: 250 }, 'true');
    g.then(isText, 'action.artboard', { artboard: choose.id, transition: 'fade', duration: 250 }, 'false');
    checklist.push(item('Write the title and the line under it on the first page. A learner who has already chosen a version goes straight to it from here, and "Change version" on each lesson page brings the chooser back', hero.children.find((n) => n.name === 'Subtitle'), hero));
  }

  // ---------------------------------------------------------------- choose
  {
    const b = contentBox(choose);
    const g = graph(choose);
    const intro = text(ctx, 'Intro text', 'It is the same lesson in all three. Pick the way that suits your connection and your day. You can change your mind at any time.', b.x, b.y, b.width, { fontSize: 17, lineHeight: 1.3 });
    const hint = bind(text(ctx, 'Connection hint', 'Your connection looks slow, or Data Saver is on. The lightest option is marked, but the choice is yours.', b.x, b.y + 34, b.width, { fontSize: 15, fontWeight: 600, lineHeight: 1.3 }), { visible: 'lowBandwidth' });
    choose.children.push(intro, hint);
    const W = 288;
    const GAP = (b.width - W * 3) / 2;
    const top = b.y + 78;
    const cardTop = top;
    const buttons: SceneNode[] = [];
    CARDS.forEach((c, i) => {
      const x = b.x + i * (W + GAP);
      const box = card(ctx, `${c.title} card`, x, cardTop, W, 300);
      box.stroke = stroke(L.border, 2);
      Object.assign(box, { decorative: true });
      //The marked card gets the accent outline, only when the connection says so
      bind(box, { 'stroke.paint.color': `lowBandwidth && suggested == "${c.id}" ? "${L.accent}" : "${L.border}"` });
      const title = heading(ctx, `${c.title} title`, c.title, x + 20, cardTop + 16, W - 40, { fontSize: 24 });
      const says = text(ctx, `${c.title} description`, c.says, x + 20, cardTop + 54, W - 40, { fontSize: 15, lineHeight: 1.35, color: L.muted, autoSize: 'none', height: 92 } as never);
      const size = text(ctx, `${c.title} size`, `{${sizeLine(c.board)}}`, x + 20, cardTop + 156, W - 40, { fontSize: 22, fontWeight: 700 });
      const sizeNote = text(ctx, `${c.title} size note`, '{assetsEmbedded ? "of media in this lesson" : "to load"}', x + 20, cardTop + 188, W - 40, { fontSize: 14, color: L.muted });
      const badge = bind(text(ctx, `${c.title} suggested`, 'Suggested for your connection', x + 20, cardTop + 214, W - 40, { fontSize: 14, fontWeight: 700 }), { visible: `lowBandwidth && suggested == "${c.id}"` });
      const pick = button(ctx, `${c.title} button`, c.go, x + 20, cardTop + 240, W - 40, c.id === 'video');
      pick.ariaLabel = `${c.go}. ${c.title} version`;
      choose.children.push(box, title, says, size, sizeNote, badge, pick);
      buttons.push(pick);
      //Choosing remembers the version (for next time) and opens it
      g.run(click(g, pick, c.title), setVar(version, `"${c.id}"`), ['action.saveUserData', { variables: [version.id] }], go(pages[c.id]));
    });
    const note = text(ctx, 'Size note', '{assetsEmbedded ? "This copy of the lesson already holds all three versions, so the sizes show what each one contains. Choosing changes what plays, not what has been downloaded." : "Only the version you choose is loaded. Sizes are what its pictures, sound and video weigh."}', b.x, cardTop + 316, b.width, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    choose.children.push(note);
    //The connection hint: the lightest option for a data-saver or very slow connection, the middle one for a slower one. It is only ever a mark on a card
    g.run(g.event('event.start', {}, 'Mark the lighter option'), setVar(suggested, 'saveData || connectionType == "slow-2g" || connectionType == "2g" ? "text" : lowBandwidth ? "audio" : "video"'));
    checklist.push(
      item('Check the three cards. The sizes are read from the files on each version\'s artboard (downloadSize in the text), so they fill in by themselves when you add your video, sound and pictures. If you rename an artboard (Video lesson, Audio only lesson, Text only lesson) change its name in the size line too', byName(choose, 'Video size'), choose),
      item('Change the line under "Choose a version" if you want to say more about when to use each. The marked card only shows when the browser reports a slow connection or Data Saver; it never picks for the learner', intro, choose),
    );
  }

  // ---------------------------------------------------------------- video version
  {
    const b = contentBox(video);
    const g = graph(video);
    const clip = createNode('video', {
      name: 'Video',
      x: b.x,
      y: b.y,
      width: 560,
      height: 315,
      cornerRadius: 12,
      autoplay: false,
      controls: true,
      fit: 'contain',
      ariaLabel: 'The lesson video',
    } as Partial<VideoNode>);
    const holder = createNode('frame', {
      name: 'Video placeholder',
      x: b.x,
      y: b.y,
      width: 560,
      height: 315,
      cornerRadius: 12,
      clip: true,
      fill: solid(L.surfaceMuted),
      stroke: null,
      role: 'region',
      ariaLabel: 'No video chosen yet',
      bindings: { visible: '!layer("Video").src && !layer("Video").assetId' },
      children: [
        heading(ctx, 'Placeholder title', 'Choose a video', 30, 100, 500, { align: 'center', fontSize: 26 }),
        text(ctx, 'Placeholder text', 'Select the Video layer, then pick a video file in the inspector. This note hides itself once a video is chosen.', 50, 146, 460, { align: 'center', fontSize: 16, color: L.muted }),
      ],
    });
    const aside = text(ctx, 'Video note', 'Turn on captions from the buttons in the corner of the page. The transcript is the same text the other two versions show.', b.x, b.y + 331, 560, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    const toggle = bind(button(ctx, 'Transcript button', 'Show transcript', b.x + 584, b.y, 344, false), { label: 'showText ? "Hide transcript" : "Show transcript"' });
    toggle.ariaLabel = 'Show or hide the transcript';
    const words = bind(panel(ctx, 'Transcript panel', b.x + 584, b.y + 58, 344, 338, [text(ctx, 'Transcript text', '{transcript}', 20, 16, 304, { fontSize: 15, lineHeight: 1.4 })], { role: 'region', ariaLabel: 'Transcript' }), { visible: 'showText' });
    video.children.push(clip, holder, aside, toggle, words);
    g.run(click(g, toggle, 'Transcript'), ['action.setVariable', { variable: showText.id, op: 'toggle' }], announce('showText ? "Transcript shown" : "Transcript hidden"'));
    g.run(g.event('event.start', {}, 'Transcript starts hidden'), setVar(showText, 'false'));
    footerRow(ctx, video, done.page, choose);
    checklist.push(item('Video version: select the Video layer and pick your video in the inspector. The grey note on top of it goes away by itself. Add captions to it there too', clip, video));
  }

  // ---------------------------------------------------------------- audio only version
  {
    const b = contentBox(audio);
    const g = graph(audio);
    const sound = addPlaceholderSound(project, 'Soundtrack (replace).wav', TONE);
    const tl: Timeline = {
      id: uid('tl'),
      name: 'Soundtrack',
      duration: TONE_MS,
      loop: 'once',
      autoplay: false,
      speed: 1,
      tracks: [],
      audio: [{ id: uid('au'), name: 'Soundtrack', assetId: sound, offset: 0, volume: 1, role: 'narration', duration: TONE_MS }],
      captions: [{ id: uid('ct'), name: 'English', lang: 'en', cues: [{ id: uid('cap'), start: 0, end: TONE_MS, text: 'Replace this sound with the soundtrack, then caption it from the transcript.' }] }],
    };
    audio.timelines.push(tl);
    const box = card(ctx, 'Listen card', b.x, b.y, 440, 170);
    Object.assign(box, { decorative: true });
    const title = heading(ctx, 'Listen title', 'Listen', b.x + 20, b.y + 14, 400, { fontSize: 22 });
    const play = button(ctx, 'Play or pause button', 'Play or pause', b.x + 20, b.y + 54, 200);
    play.ariaLabel = 'Play or pause the audio';
    const again = button(ctx, 'Start over button', 'Start over', b.x + 232, b.y + 54, 188, false);
    again.ariaLabel = 'Start the audio again from the beginning';
    const aside = text(ctx, 'Listen note', 'Everything that is said is also written in the transcript beside this card.', b.x + 20, b.y + 118, 400, { fontSize: 14, color: L.muted, lineHeight: 1.3 });
    const still = picture(ctx, 'Key image', b.x, b.y + 186, 440, 196);
    still.ariaLabel = 'Key image: replace this picture and describe what it shows';
    const words = panel(ctx, 'Transcript panel', b.x + 464, b.y, 464, 382, [heading(ctx, 'Transcript title', 'Transcript', 20, 14, 424, { fontSize: 20 }), text(ctx, 'Transcript text', '{transcript}', 20, 52, 424, { fontSize: 15, lineHeight: 1.4 })], { role: 'region', ariaLabel: 'Transcript' });
    audio.children.push(box, title, play, again, aside, still, words);
    g.run(click(g, play, 'Play or pause'), ['action.timeline', { timeline: tl.id, op: 'toggle' }]);
    g.run(click(g, again, 'Start over'), ['action.timeline', { timeline: tl.id, op: 'restart' }]);
    footerRow(ctx, audio, done.page, choose);
    checklist.push(
      item('Audio only version: replace the placeholder "Soundtrack (replace)" in the Assets panel with your audio (the arrow beside it), and set the timeline\'s length to match. It should make sense with no picture: "as you can see here" does not work for someone who is only listening, so re-record or reword those lines', play, audio),
      item('Replace the grey Key image on the Audio only page with a still from the lesson and write its alt text. Add more stills if the audio needs them', still, audio),
    );
  }

  // ---------------------------------------------------------------- text only version
  {
    const b = contentBox(plain);
    const words = panel(ctx, 'Transcript panel', b.x, b.y, 536, 382, [heading(ctx, 'Transcript title', 'Transcript', 20, 14, 496, { fontSize: 20 }), text(ctx, 'Transcript text', '{transcript}', 20, 52, 496, { fontSize: 16, lineHeight: 1.45 })], { role: 'region', ariaLabel: 'Transcript' });
    const one = picture(ctx, 'Key image 1', b.x + 560, b.y, 368, 162);
    one.ariaLabel = 'Key image 1: replace this picture and describe what it shows';
    const oneCaption = text(ctx, 'Key image 1 caption', 'Key image 1: say what it shows.', b.x + 560, b.y + 168, 368, { fontSize: 14, color: L.muted });
    const two = picture(ctx, 'Key image 2', b.x + 560, b.y + 200, 368, 162);
    two.ariaLabel = 'Key image 2: replace this picture and describe what it shows';
    const twoCaption = text(ctx, 'Key image 2 caption', 'Key image 2: say what it shows.', b.x + 560, b.y + 368, 368, { fontSize: 14, color: L.muted });
    plain.children.push(words, one, oneCaption, two, twoCaption);
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
  return { project, checklist };
}

export const liteLesson: BrandedStarter = {
  key: 'media/lite-lesson',
  set: 'media',
  name: 'Lite lesson',
  description: 'A lesson in three weights: Video, Audio only or Text only, each card showing what that version weighs, the choice remembered, and a slow-connection or Data Saver hint that marks the lighter one without ever choosing for the learner. One transcript feeds all three, and every version finishes on the same page. Placeholder sound and pictures to replace.',
  tags: ['video', 'audio', 'text', 'low bandwidth', 'accessibility', 'data saver'],
  build,
};
