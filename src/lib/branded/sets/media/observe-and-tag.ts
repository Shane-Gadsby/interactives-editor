//Observe and tag: the learner watches a recording and taps category tags (or presses their number keys) as they notice things. Each tap
//stores the video's time in the "tags" list variable. The last page draws their tags under the expert's on one timeline, with the
//author's comment on each expert tag, and counts agreements (same kind, within a window of seconds) and misses. Built from the video
//layer's bound playback position, list variables and two repeaters; no special engine support.
import { createNode, uid, type ContainerNode, type InputNode, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { brandedPage, brandedProject, button, card, contentBox, heading, item, picture, solid, stroke, text, type BrandedStarter } from '../../kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { Graph, addVar, announce, bind, go, heroPage, lit, set, spreadPages } from '../games/common';

const CATEGORIES = ['Good questioning', 'Missed cue', 'Clear explanation', 'Risk to safety'];

//What the expert tagged: the time in seconds, the category (its number in the list above, starting at 1) and the comment the learner reads
const EXPERT = [
  { t: 12, cat: 1, comment: 'An open question that invites the person to say more, rather than a yes or no.' },
  { t: 31, cat: 2, comment: 'Their voice drops and they look away. A good moment to pause and check how they are.' },
  { t: 47, cat: 3, comment: 'The next step is put in plain words, with one example.' },
  { t: 66, cat: 4, comment: 'The equipment is left where someone could trip on it. Worth raising straight away.' },
  { t: 82, cat: 1, comment: 'Asks what the person already knows before explaining anything new.' },
];

const TRANSCRIPT = '[0:05] Thanks for coming in. Tell me a bit about how the week has gone.\n\n[0:12] What has been the hardest part so far?\n\n[0:31] It has been a lot, to be honest. (looks away)\n\n[0:47] So the next step is to check the plan with the whole team. For example, we read it out together.\n\n[1:06] Mind the cables on the floor there.\n\n[1:22] Before we start, what do you already know about this?';

const VIDEO_W = 560;
const VIDEO_H = 315;
const MAX_KEYS = 6;

//Timeline strip geometry on the compare page
const STRIP_X = 48;
const STRIP_W = 928;
const AXIS_LEFT = 14;
const AXIS_W = 900;
const MARKER = 24;

/** minutes:seconds for a number of seconds in an expression */
const clock = (s: string) => `(Math.floor(${s} / 60) + ":" + String(Math.floor(${s} % 60)).padStart(2, "0"))`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Observe and tag');
  const { project, L } = ctx;
  const vtime = addVar(project, 'videoTime', 'number', 0);
  const vplaying = addVar(project, 'videoPlaying', 'boolean', false);
  addVar(project, 'videoLength', 'number', 0);
  addVar(project, 'videoEnded', 'boolean', false);
  addVar(project, 'categories', 'list', CATEGORIES);
  addVar(project, 'expert', 'list', EXPERT);
  const tags = addVar(project, 'tags', 'list', []);
  addVar(project, 'tolerance', 'number', 3);
  const note = addVar(project, 'noteText', 'string', '');
  const showTranscript = addVar(project, 'showTranscript', 'boolean', false);
  addVar(project, 'audioOnly', 'boolean', false);
  const stripLength = addVar(project, 'stripLength', 'number', 90);
  const pickedExpert = addVar(project, 'pickedExpert', 'number', -1);
  const pickedYou = addVar(project, 'pickedYou', 'number', -1);

  //The expressions both pages use
  const agrees = (a: string, b: string) => `${a}.cat == ${b}.cat && Math.abs(${a}.t - ${b}.t) <= tolerance`;
  const expertMatched = (e: string) => `tags.some(t => ${agrees('t', e)})`;
  const youMatched = (y: string) => `expert.some(e => ${agrees('e', y)})`;
  const agreed = `expert.filter(e => ${expertMatched('e')}).length`;
  const extra = `tags.filter(y => !(${youMatched('y')})).length`;

  const { page: hero, start } = heroPage(ctx, 'Observe and tag', 'Watch the recording and tag what you notice. Then see how your tags line up with an expert\'s.');
  const watch = brandedPage(ctx, 'Watch and tag', { footer: 'Observe and tag' });
  const compare = brandedPage(ctx, 'Compare with the expert', { footer: 'Observe and tag' });
  const checklist: TemplateChecklistItem[] = [];

  //Starting again from the first page or the compare page
  const reset = [set(tags, '[]'), set(note, '""'), set(showTranscript, 'false'), set(pickedExpert, '-1'), set(pickedYou, '-1'), set(vtime, '0'), set(vplaying, 'false')] as [string, Record<string, unknown>][];

  //Hero
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), ...reset, go(watch));
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  // ---------------------------------------------------------------- watch page
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
    speedControl: true,
    frameStepControl: true,
    frameRate: 30,
    fit: 'contain',
    ariaLabel: 'The recording to tag',
    captionLang: 'en',
    captions: [
      { id: uid('cap'), start: 5000, end: 11000, speaker: 'Coach', text: 'Thanks for coming in. Tell me a bit about how the week has gone.' },
      { id: uid('cap'), start: 12000, end: 17000, speaker: 'Coach', text: 'What has been the hardest part so far?' },
      { id: uid('cap'), start: 31000, end: 36000, speaker: 'Learner', text: 'It has been a lot, to be honest.' },
    ],
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
    ariaLabel: 'No recording chosen yet',
    bindings: { visible: '!layer("Video").src && !layer("Video").assetId' },
    children: [
      heading(ctx, 'Placeholder title', 'Choose a recording', 30, 100, VIDEO_W - 60, { align: 'center', fontSize: 26 }),
      text(ctx, 'Placeholder text', 'Select the Video layer, then pick a video (or an audio file) in the inspector. This note hides itself once one is chosen.', 50, 146, VIDEO_W - 100, { align: 'center', fontSize: 16, color: L.muted, lineHeight: 1.4 }),
    ],
  });
  //Audio only: the audio goes in the video layer and a still picture sits over the top of it, clear of the controls along the bottom and the speed buttons at the top
  const still = picture(ctx, 'Still image', box.x, box.y + 48, VIDEO_W, VIDEO_H - 48 - 56);
  (still as { ariaLabel?: string }).ariaLabel = 'A still picture shown while the audio plays';
  (still as { cornerRadius?: number }).cornerRadius = 0;
  bind(still, { visible: 'audioOnly' });
  watch.children.push(video, holder, still);
  checklist.push(item('Choose your recording: select the Video layer and pick a file in the inspector. Check you have consent from everyone in it. The grey note goes away by itself', video, watch));
  checklist.push(item('Audio only? Put the audio file in the Video layer too, set Project > Variables > "audioOnly" to true, and replace the grey Still image with your picture. Give the picture a description, and write a full transcript', still, watch));
  checklist.push(item('Add captions to the Video layer (Captions in the inspector). The three sample lines are placeholders for the example recording', video, watch));

  const noteBox = createNode('input', {
    name: 'Note',
    x: box.x,
    y: box.y + VIDEO_H + 12,
    width: VIDEO_W,
    height: 44,
    inputType: 'text',
    variableId: note.id,
    placeholder: 'Optional note for your next tag, then tap or press the tag',
    ariaLabel: 'Optional note for your next tag',
    ...lookDefaults(project, 'input'),
    stroke: stroke(L.border, 2),
    cornerRadius: 10,
    fontSize: 16,
    fontFamily: BRAND_FONT,
  } as Partial<InputNode>);
  const status = text(ctx, 'Status', '', box.x, box.y + VIDEO_H + 66, VIDEO_W, { fontSize: 15, color: L.muted, autoSize: 'none', height: 24, bindings: { text: `videoEnded ? "The recording has finished. Press Finish to compare." : "At " + ${clock('videoTime')} + (videoLength > 0 ? " of " + ${clock('videoLength')} : "")` } } as never);
  const undo = button(ctx, 'Undo last tag', 'Undo last tag', box.x, box.y + VIDEO_H + 108, 150, false);
  bind(undo, { disabled: 'tags.length == 0', opacity: 'tags.length == 0 ? 0.5 : 1' });
  const transcriptBtn = button(ctx, 'Transcript', 'Transcript', box.x + 160, box.y + VIDEO_H + 108, 150, false);
  const finish = button(ctx, 'Finish', 'Finish and compare', box.x + 320, box.y + VIDEO_H + 108, 240, true);
  watch.children.push(noteBox, status, undo, transcriptBtn, finish);

  //The tag buttons, one per category in the list, each with its number key
  const colX = box.x + 584;
  const colW = box.width - 584;
  const tagHead = heading(ctx, 'Tag heading', 'Tag what you notice', colX, box.y, colW, { fontSize: 22 });
  const tagHint = text(ctx, 'Tag hint', 'Press play, then tap a tag or press its number key the moment you notice it. Click out of the note box first so the keys work. The buttons over the video slow it down or step a frame.', colX, box.y + 34, colW, { fontSize: 14, color: L.muted, lineHeight: 1.4, autoSize: 'none', height: 76 });
  const tagButton = button(ctx, 'Tag', '{index + 1}   {item}', 0, 0, colW, true);
  tagButton.height = 44;
  tagButton.cornerRadius = 12;
  bind(tagButton, { ariaLabel: '"Tag: " + item + ", key " + (index + 1)' });
  const tagButtons = createNode('frame', {
    name: 'Tag buttons',
    x: colX,
    y: box.y + 118,
    width: colW,
    height: 4 * 44 + 3 * 8,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Tags',
    repeat: { items: 'categories', layout: 'vertical', gap: 8, columns: 1 },
    children: [tagButton],
  });
  const tagsHead = text(ctx, 'Your tags heading', 'Your tags ({tags.length})', colX, box.y + 330, colW, { fontSize: 18, fontWeight: 600 });
  const recentRow = text(ctx, 'Recent tag', '{' + clock('item.t') + '}  {categories[item.cat - 1]}{item.note ? ": " + item.note : ""}', 0, 0, colW, { fontSize: 15, autoSize: 'none', height: 24 });
  const recent = createNode('frame', {
    name: 'Recent tags',
    x: colX,
    y: box.y + 362,
    width: colW,
    height: 4 * 24,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Your latest tags',
    repeat: { items: 'tags.slice(-4)', layout: 'vertical', gap: 0, columns: 1 },
    children: [recentRow],
  });
  watch.children.push(tagHead, tagHint, tagButtons, tagsHead, recent);
  checklist.push(item('Name your tags: Project > Variables > "categories" (one name per line of the list, up to six; each gets the number key that matches its place)', tagButtons, watch));

  //The transcript, over the page when asked for. Everything in it is its children, so hiding it hides all
  const panelW = box.width;
  const panelH = box.height;
  const closeT = button(ctx, 'Close transcript', 'Close transcript', panelW - 220, panelH - 64, 200, true);
  const scroller = createNode('frame', {
    name: 'Transcript scroll',
    x: 24,
    y: 62,
    width: panelW - 48,
    height: panelH - 62 - 80,
    fill: null,
    stroke: null,
    clip: true,
    scroll: 'vertical',
    role: 'region',
    ariaLabel: 'Transcript text',
    focusable: true,
    children: [text(ctx, 'Transcript text', TRANSCRIPT, 0, 0, panelW - 80, { fontSize: 17, lineHeight: 1.5 })],
  } as never);
  const transcript = createNode('frame', {
    name: 'Transcript panel',
    x: box.x,
    y: box.y,
    width: panelW,
    height: panelH,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: stroke(L.border, 1.5),
    clip: true,
    role: 'region',
    ariaLabel: 'Transcript',
    bindings: { visible: 'showTranscript' },
    children: [heading(ctx, 'Transcript heading', 'Transcript', 24, 18, 400, { fontSize: 22 }), scroller, closeT],
  });
  watch.children.push(transcript);
  checklist.push(item('Write the transcript (it is the only way in for audio-only material, and helps everyone with a noisy recording)', scroller, watch));

  //The wiring
  const g = new Graph(watch);
  const tagIt = (idx: string) =>
    [
      set(tags, `[...tags, {t: Math.round(videoTime * 10) / 10, cat: ${idx}, note: noteText.trim()}]`),
      set(note, '""'),
      announce(`"Tagged " + categories[${idx} - 1] + " at " + ${clock('videoTime')} + ". " + tags.length + " tags so far."`),
    ] as [string, Record<string, unknown>][];
  g.run(g.click(tagButton, 'A tag button'), ...tagIt('event.index + 1'));
  //Number keys (the player ignores keys typed into the note box)
  for (let k = 1; k <= MAX_KEYS; k++) {
    const onKey = g.key(String(k), undefined, `Key ${k}`);
    const have = g.add('logic.if', { condition: `categories.length >= ${k}` }, onKey);
    g.runFrom(have, 'true', ...tagIt(String(k)));
    g.gap(-60);
  }
  g.gap(100);
  g.run(g.click(undo, 'Undo'), set(tags, 'tags.slice(0, -1)'), announce('"Removed the last tag. " + tags.length + " left."'));
  g.run(g.click(transcriptBtn, 'Open transcript'), set(showTranscript, 'true'), set(vplaying, 'false'));
  g.run(g.click(closeT, 'Close transcript'), set(showTranscript, 'false'));
  g.run(g.click(finish, 'Compare'), set(vplaying, 'false'), set(pickedExpert, '-1'), set(pickedYou, '-1'), set(stripLength, 'videoLength > 0 ? videoLength : Math.max(60, expert.concat(tags).reduce((m, x) => Math.max(m, x.t), 0) + 5)'), go(compare));

  // ---------------------------------------------------------------- compare page
  const cb = contentBox(compare);
  const framing = text(ctx, 'Framing', 'This is about agreement, not exactness. Tagging is a judgement call, so one of your tags agrees with the expert\'s when it is the same kind of moment and within {tolerance} seconds of it. A tag the expert did not make is not a mistake: it is something worth talking about.', cb.x, cb.y, cb.width, { fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 68 });
  compare.children.push(framing);
  checklist.push(item('Read the framing text on the compare page and make it suit your group. Change the window of seconds in Project > Variables > "tolerance"', framing, compare));

  const statW = (cb.width - 40) / 3;
  const stats: [string, string, string][] = [
    ['Agreed with the expert', `{${agreed}} of {expert.length}`, 'Agreed'],
    ['Expert tags you missed', `{expert.length - ${agreed}}`, 'Missed'],
    ['Extra tags of your own', `{${extra}}`, 'Extra'],
  ];
  stats.forEach(([label, value, name], i) => {
    const x = cb.x + i * (statW + 20);
    compare.children.push(card(ctx, `${name} panel`, x, cb.y + 76, statW, 76), text(ctx, `${name} label`, label, x + 20, cb.y + 84, statW - 40, { fontSize: 14, color: L.muted }), text(ctx, name, value, x + 20, cb.y + 106, statW - 40, { fontSize: 32, fontWeight: 700, autoSize: 'none', height: 40 }));
  });

  //The strip: expert tags above the axis, the learner's below, both placed by time
  const stripY = cb.y + 164;
  compare.children.push(card(ctx, 'Strip panel', STRIP_X, stripY, STRIP_W, 150));
  const markerX = (t: string) => `${AXIS_LEFT} + Math.min(1, Math.max(0, ${t} / stripLength)) * ${AXIS_W} - ${MARKER / 2}`;
  const marker = (name: string, radius: number) =>
    createNode('frame', {
      name,
      x: 0,
      y: 0,
      width: MARKER,
      height: MARKER,
      cornerRadius: radius,
      clip: false,
      role: 'button',
      focusable: true,
      cursor: 'pointer',
      fill: solid(L.background),
      stroke: stroke(L.text, 2),
      children: [text(ctx, 'Marker number', '{item.cat}', 0, 3, MARKER, { fontSize: 14, fontWeight: 700, align: 'center', decorative: true, autoSize: 'none', height: 18 })],
    });
  const expertMarker = marker('Expert marker', 4);
  bind(expertMarker, {
    x: markerX('item.t'),
    'fill.color': `${expertMatched('item')} ? "${L.success}" : "${L.background}"`,
    'stroke.paint.color': `${expertMatched('item')} ? "${L.success}" : "${L.error}"`,
    ariaLabel: `"Expert tag at " + ${clock('item.t')} + ", " + categories[item.cat - 1] + (${expertMatched('item')} ? ", you agreed" : ", you missed this one") + ". Press for the comment."`,
  });
  bind(expertMarker.children[0], { color: `${expertMatched('item')} ? "${L.background}" : "${L.text}"` });
  const youMarker = marker('Your marker', 12);
  bind(youMarker, {
    x: markerX('item.t'),
    'fill.color': `${youMatched('item')} ? "${L.success}" : "${L.button}"`,
    'stroke.paint.color': `${youMatched('item')} ? "${L.success}" : "${L.button}"`,
    ariaLabel: `"Your tag at " + ${clock('item.t')} + ", " + categories[item.cat - 1] + (${youMatched('item')} ? ", the expert agreed" : ", the expert did not tag this") + ". Press for the detail."`,
  });
  bind(youMarker.children[0], { color: `${youMatched('item')} ? "${L.background}" : "${L.onButton}"` });
  const expertRow = createNode('frame', { name: 'Expert tags', x: STRIP_X, y: stripY + 18, width: STRIP_W, height: MARKER, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'The expert\'s tags along the recording', repeat: { items: 'expert', layout: 'none', gap: 0, columns: 1 }, children: [expertMarker] } as never) as ContainerNode;
  const youRow = createNode('frame', { name: 'Your tags', x: STRIP_X, y: stripY + 82, width: STRIP_W, height: MARKER, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your tags along the recording', repeat: { items: 'tags', layout: 'none', gap: 0, columns: 1 }, children: [youMarker] } as never) as ContainerNode;
  const axis = createNode('rect', { name: 'Axis', x: STRIP_X + AXIS_LEFT, y: stripY + 62, width: AXIS_W, height: 4, cornerRadius: 2, fill: solid(L.border), stroke: null, decorative: true });
  const startLabel = text(ctx, 'Start time', '0:00', STRIP_X + AXIS_LEFT, stripY + 66, 80, { fontSize: 12, color: L.muted, autoSize: 'none', height: 16, decorative: true });
  const endLabel = text(ctx, 'End time', '', STRIP_X + AXIS_LEFT + AXIS_W - 80, stripY + 66, 80, { fontSize: 12, color: L.muted, align: 'right', autoSize: 'none', height: 16, decorative: true, bindings: { text: clock('stripLength') } } as never);
  const legend = text(ctx, 'Strip legend', 'Top row: the expert\'s tags (square). Bottom row: yours (round). The number is the tag. Filled green: agreed. Hollow with a red edge: you missed it. Select any tag to read about it.', STRIP_X + 14, stripY + 112, AXIS_W, { fontSize: 13, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: 34 });
  compare.children.push(axis, startLabel, endLabel, expertRow, youRow, legend);
  checklist.push(item('Set the expert tags: Project > Variables > "expert" (t is the second in the recording, cat is the tag\'s number, comment is what the learner reads)', expertRow, compare));

  //What was picked
  const pickText =
    `pickedExpert >= 0 ? "Expert tag at " + ${clock('expert[pickedExpert].t')} + ", " + categories[expert[pickedExpert].cat - 1] + ". " + expert[pickedExpert].comment + (${expertMatched('expert[pickedExpert]')} ? " You tagged this too." : " You did not tag this one.") : ` +
    `pickedYou >= 0 ? "Your tag at " + ${clock('tags[pickedYou].t')} + ", " + categories[tags[pickedYou].cat - 1] + (tags[pickedYou].note ? ": " + tags[pickedYou].note : ".") + (${youMatched('tags[pickedYou]')} ? " The expert tagged this too." : " The expert did not tag this one. If you can say why you did, that is worth sharing with your group.") : ` +
    lit('Select a tag on the strip to read the expert\'s comment, or to see your own note. If you disagree with the expert, say why in your group.');
  const detail = card(ctx, 'Detail panel', cb.x, stripY + 162, cb.width, 90);
  const detailText = text(ctx, 'Detail', '', cb.x + 20, stripY + 172, cb.width - 40, { fontSize: 17, lineHeight: 1.4, autoSize: 'none', height: 72, bindings: { text: pickText } } as never);
  const back = button(ctx, 'Back to the video', 'Back to the video', cb.x, stripY + 262, 220, false);
  const again = button(ctx, 'Start again', 'Start again', cb.x + 232, stripY + 262, 180, true);
  compare.children.push(detail, detailText, back, again);

  const cg = new Graph(compare);
  const onShow = cg.start('Say how it went');
  cg.run(onShow, announce(`"You agreed with " + ${agreed} + " of " + expert.length + " expert tags, missed " + (expert.length - ${agreed}) + ", and made " + ${extra} + " of your own."`));
  cg.run(cg.click(expertMarker, 'An expert tag'), set(pickedExpert, 'event.index'), set(pickedYou, '-1'));
  cg.run(cg.click(youMarker, 'One of your tags'), set(pickedYou, 'event.index'), set(pickedExpert, '-1'));
  cg.run(cg.click(back, 'Back'), go(watch));
  cg.run(cg.click(again, 'Again'), ...reset, go(watch));

  spreadPages(project);
  return { project, checklist: checklist as TemplateChecklistItem[] };
}

export const observeAndTag: BrandedStarter = {
  key: 'media/observe-and-tag',
  set: 'media',
  name: 'Observe and tag',
  description: 'The learner watches a recording and taps category tags (or number keys) at the moments they notice something. Their tags are then drawn over the expert\'s on one timeline, with the expert\'s comment on each, and a count of agreements and misses. Choose your recording and write your expert tags; audio-only works with a still picture.',
  tags: ['video', 'audio', 'observation', 'feedback', 'list variable'],
  build,
};
