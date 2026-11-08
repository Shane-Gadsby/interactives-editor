//Observe and tag: the learner watches a recording and taps category tags (or presses their number keys) as they notice things. Each tap
//stores the video's time in the "tags" list variable. The last page draws their tags under the expert's on one timeline, with the
//author's comment on each expert tag, and counts agreements (same kind, within a window of seconds) and misses. Built from the video
//layer's bound playback position, list variables and two repeaters. The agreement is live variables, the transcript is the viewer's own
//(the video's captions), and the tag keys are one On key event.
import { createNode, uid, type CaptionCue, type ContainerNode, type FrameNode, type InputNode, type TemplateChecklistItem, type VideoNode } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, contentBox, heading, item, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { fill, stack } from '../../parts';
import { join } from '../../graph-kit';
import { Graph, addVar, announce, bind, goNext, goPrevious, graphNote, heroPage, lit, resetVars, set } from './shared';

const CATEGORIES = ['Good questioning', 'Missed cue', 'Clear explanation', 'Risk to safety'];

//What the expert tagged: the time in seconds, the category (its number in the list above, starting at 1) and the comment the learner reads
const EXPERT = [
  { t: 12, cat: 1, comment: 'An open question that invites the person to say more, rather than a yes or no.' },
  { t: 31, cat: 2, comment: 'Their voice drops and they look away. A good moment to pause and check how they are.' },
  { t: 47, cat: 3, comment: 'The next step is put in plain words, with one example.' },
  { t: 66, cat: 4, comment: 'The equipment is left where someone could trip on it. Worth raising straight away.' },
  { t: 82, cat: 1, comment: 'Asks what the person already knows before explaining anything new.' },
];

//The transcript is the video's captions: every line of what is said, in time order, which the viewer's own Transcript button lists
const cue = (start: number, end: number, speaker: string, line: string): CaptionCue => ({ id: uid('cap'), start: start * 1000, end: end * 1000, speaker, text: line });
const CAPTIONS: CaptionCue[] = [
  cue(5, 11, 'Coach', 'Thanks for coming in. Tell me a bit about how the week has gone.'),
  cue(12, 17, 'Coach', 'What has been the hardest part so far?'),
  cue(31, 36, 'Learner', 'It has been a lot, to be honest. (looks away)'),
  cue(47, 55, 'Coach', 'So the next step is to check the plan with the whole team. For example, we read it out together.'),
  cue(66, 70, 'Coach', 'Mind the cables on the floor there.'),
  cue(82, 88, 'Coach', 'Before we start, what do you already know about this?'),
];

const VIDEO_W = 560;
const VIDEO_H = 315;

//Timeline strip geometry on the compare page (the strip is one frame, so these are inside it)
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
  const tagNo = addVar(project, 'tagNo', 'number', 0);
  const pickedExpert = addVar(project, 'pickedExpert', 'number', -1);
  const pickedYou = addVar(project, 'pickedYou', 'number', -1);
  //Live variables: the comparison is worked out from the tags as they are made, so the compare page only reads it
  const agrees = (a: string, b: string) => `${a}.cat == ${b}.cat && Math.abs(${a}.t - ${b}.t) <= tolerance`;
  addVar(project, 'expertHit', 'list', [], { formula: `expert.map(e => tags.some(t => ${agrees('t', 'e')}))`, live: true });
  addVar(project, 'youHit', 'list', [], { formula: `tags.map(y => expert.some(e => ${agrees('e', 'y')}))`, live: true });
  addVar(project, 'agreed', 'number', 0, { formula: 'expertHit.filter(h => h).length', live: true });
  addVar(project, 'missed', 'number', 0, { formula: 'expert.length - agreed', live: true });
  addVar(project, 'extra', 'number', 0, { formula: 'youHit.filter(h => !h).length', live: true });
  //The strip runs to the end of the recording, or a little past the last tag when there is no length yet
  addVar(project, 'stripLength', 'number', 90, { formula: 'videoLength > 0 ? videoLength : Math.max(60, expert.concat(tags).reduce((m, x) => Math.max(m, x.t), 0) + 5)', live: true });

  const { page: hero, start } = heroPage(ctx, 'Observe and tag', 'Watch the recording and tag what you notice. Then see how your tags line up with an expert\'s.');
  const watch = brandedPage(ctx, 'Watch and tag', { footer: 'Observe and tag  ·  Step {pageNumber - 1} of {pageCount - 1}' });
  const compare = brandedPage(ctx, 'Compare with the expert', { footer: 'Observe and tag  ·  Step {pageNumber - 1} of {pageCount - 1}' });
  const checklist: TemplateChecklistItem[] = [];

  //Starting again from the first page or the compare page: one node puts these back (the live ones follow by themselves)
  const reset = resetVars(tags, note, pickedExpert, pickedYou, vtime, vplaying);

  //Hero
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), reset, goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  // ---------------------------------------------------------------- watch page
  const box = contentBox(watch);
  const video = createNode('video', {
    name: 'Video',
    x: 0,
    y: 0,
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
    emptyText: 'No recording has been chosen yet.',
    captionLang: 'en',
    captions: CAPTIONS,
    bindings: { 'media.time': 'videoTime', 'media.playing': 'videoPlaying', 'media.duration': 'videoLength', 'media.ended': 'videoEnded' },
    bindingModes: { 'media.time': 'both', 'media.playing': 'both', 'media.duration': 'out', 'media.ended': 'out' },
  } as Partial<VideoNode>);
  checklist.push(item('Choose your recording: select the Video layer and pick a file in the inspector. Check you have consent from everyone in it. Until you do, the layer says so itself', video, watch));
  checklist.push(item('Audio only? Put the audio file in the Video layer too and give it a Poster picture (with a description). A sound file shows its poster the whole time. Write a full transcript as captions', video, watch));
  checklist.push(item('Write the captions on the Video layer (Captions in the inspector). They are also the Transcript button the viewer gets, so give every line, not just the speech. The six sample lines are placeholders for the example recording', video, watch));

  const status = text(ctx, 'Status', '', 0, 0, VIDEO_W, { fontSize: 15, color: L.muted, autoSize: 'none', height: 24, bindings: { text: `videoEnded ? "The recording has finished. Press Finish to compare." : "At " + ${clock('videoTime')} + (videoLength > 0 ? " of " + ${clock('videoLength')} : "")` } } as never);
  const noteBox = createNode('input', {
    name: 'Note',
    x: 0,
    y: 0,
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
  const undo = bind(button(ctx, 'Undo last tag', 'Undo last tag', 0, 0, 170, false), { disabled: 'tags.length == 0' });
  const finish = button(ctx, 'Finish', 'Finish and compare', 0, 0, 240, true);
  const buttons = stack('Watch buttons', 0, 0, VIDEO_W, { direction: 'row', gap: 12, align: 'start', children: [undo, finish] });
  watch.children.push(stack('Watch column', box.x, box.y, VIDEO_W, { gap: 8, children: [video, status, noteBox, buttons] }));

  //The tag buttons, one per category in the list, each with its number key
  const colX = box.x + 584;
  const colW = box.width - 584;
  const tagHead = heading(ctx, 'Tag heading', 'Tag what you notice', 0, 0, colW, { fontSize: 22 });
  const tagHint = text(ctx, 'Tag hint', 'Press play, then tap a tag or press its number key the moment you notice it. Click out of the note box first so the keys work. The buttons over the video slow it down or step a frame.', 0, 0, colW, { fontSize: 14, color: L.muted, lineHeight: 1.4 });
  const tagButton = button(ctx, 'Tag', '{index + 1}   {item}', 0, 0, colW, true);
  tagButton.height = 44;
  tagButton.cornerRadius = 12;
  bind(tagButton, { ariaLabel: '"Tag: " + item + ", key " + (index + 1)' });
  const tagButtons = createNode('frame', {
    name: 'Tag buttons',
    x: 0,
    y: 0,
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
  const tagsHead = text(ctx, 'Your tags heading', 'Your tags ({tags.length})', 0, 0, colW, { fontSize: 18, fontWeight: 600 });
  const recentRow = text(ctx, 'Recent tag', '{' + clock('item.t') + '}  {categories[item.cat - 1]}{item.note ? ": " + item.note : ""}', 0, 0, colW, { fontSize: 15, autoSize: 'none', height: 24 });
  const recent = createNode('frame', {
    name: 'Recent tags',
    x: 0,
    y: 0,
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
  watch.children.push(stack('Tag column', colX, box.y, colW, { gap: 10, children: [tagHead, tagHint, tagButtons, tagsHead, recent] }));
  checklist.push(item('Name your tags: Project > Variables > "categories" (one name per line of the list, up to nine; each gets the number key that matches its place)', tagButtons, watch));

  //The wiring. A tag from a button and a tag from a number key run the same steps, so the button and the key each just say which tag it is
  const g = new Graph(watch);
  const byButton = g.click(tagButton, 'A tag button');
  const setNo = g.add('action.setVariable', { variable: tagNo.id, op: 'set', value: 'event.index + 1' }, byButton);
  //One On key with no key named hears all of them, and its Only if lets through 1 to the number of categories (the player ignores keys typed into the note box)
  const byKey = g.add('event.key', { key: '', type: 'keydown', onlyIf: 'Number(event.key) >= 1 && Number(event.key) <= categories.length' }, null, 'out', { note: 'A number key' });
  const keyNo = g.add('action.setVariable', { variable: tagNo.id, op: 'set', value: 'Number(event.key)' }, byKey);
  const tagged = g.add('action.setVariable', { variable: tags.id, op: 'push', value: '{t: Math.round(videoTime * 10) / 10, cat: tagNo, note: noteText.trim()}' }, setNo);
  g.run(tagged, set(note, '""'), announce(`"Tagged " + categories[tagNo - 1] + " at " + ${clock('videoTime')} + ". " + tags.length + " tags so far."`));
  join(watch, keyNo, tagged);
  graphNote(watch, { anchor: byButton, colour: 'sky', text: '**A tag button and a number key both just say which tag it is** (`tagNo`), then share one Push. The tag is stamped with `videoTime`, which the video keeps current, and the note box is cleared for the next.' });
  g.run(g.click(undo, 'Undo'), set(tags, 'tags.slice(0, -1)'), announce('"Removed the last tag. " + tags.length + " left."'));
  g.run(g.click(finish, 'Compare'), set(vplaying, 'false'), resetVars(pickedExpert, pickedYou), goNext());

  // ---------------------------------------------------------------- compare page
  const cb = contentBox(compare);
  const framing = text(ctx, 'Framing', 'This is about agreement, not exactness. Tagging is a judgement call, so one of your tags agrees with the expert\'s when it is the same kind of moment and within {tolerance} seconds of it. A tag the expert did not make is not a mistake: it is something worth talking about.', 0, 0, cb.width, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: 62 });
  checklist.push(item('Read the framing text on the compare page and make it suit your group. Change the window of seconds in Project > Variables > "tolerance"', framing, compare));

  const stats: [string, string, string][] = [
    ['Agreed with the expert', '{agreed} of {expert.length}', 'Agreed'],
    ['Expert tags you missed', '{missed}', 'Missed'],
    ['Extra tags of your own', '{extra}', 'Extra'],
  ];
  const statCards = stats.map(([label, value, name]) => fill(stack(`${name} panel`, 0, 0, 100, { gap: 2, padding: { top: 8, right: 20, bottom: 8, left: 20 }, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [text(ctx, `${name} label`, label, 0, 0, 100, { fontSize: 14, color: L.muted }), text(ctx, name, value, 0, 0, 100, { fontSize: 28, fontWeight: 700, autoSize: 'none', height: 36 })] })));
  const statRow = stack('Stats', 0, 0, cb.width, { direction: 'row', gap: 20, children: statCards });

  //The strip: expert tags above the axis, the learner's below, both placed by time (the markers read the live hit lists)
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
    'fill.color': `expertHit[index] ? "${L.success}" : "${L.background}"`,
    'stroke.paint.color': `expertHit[index] ? "${L.success}" : "${L.error}"`,
    ariaLabel: `"Expert tag at " + ${clock('item.t')} + ", " + categories[item.cat - 1] + (expertHit[index] ? ", you agreed" : ", you missed this one") + ". Press for the comment."`,
  });
  bind(expertMarker.children[0], { color: `expertHit[index] ? "${L.background}" : "${L.text}"` });
  const youMarker = marker('Your marker', 12);
  bind(youMarker, {
    x: markerX('item.t'),
    'fill.color': `youHit[index] ? "${L.success}" : "${L.button}"`,
    'stroke.paint.color': `youHit[index] ? "${L.success}" : "${L.primary}"`,
    ariaLabel: `"Your tag at " + ${clock('item.t')} + ", " + categories[item.cat - 1] + (youHit[index] ? ", the expert agreed" : ", the expert did not tag this") + ". Press for the detail."`,
  });
  bind(youMarker.children[0], { color: `youHit[index] ? "${L.background}" : "${L.onButton}"` });
  const expertRow = createNode('frame', { name: 'Expert tags', x: 0, y: 14, width: STRIP_W, height: MARKER, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'The expert\'s tags along the recording', repeat: { items: 'expert', layout: 'none', gap: 0, columns: 1 }, children: [expertMarker] } as never) as ContainerNode;
  const youRow = createNode('frame', { name: 'Your tags', x: 0, y: 72, width: STRIP_W, height: MARKER, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your tags along the recording', repeat: { items: 'tags', layout: 'none', gap: 0, columns: 1 }, children: [youMarker] } as never) as ContainerNode;
  const axis = createNode('rect', { name: 'Axis', x: AXIS_LEFT, y: 54, width: AXIS_W, height: 4, cornerRadius: 2, fill: solid(L.border), stroke: null, decorative: true });
  const startLabel = text(ctx, 'Start time', '0:00', AXIS_LEFT, 58, 80, { fontSize: 12, color: L.muted, autoSize: 'none', height: 16, decorative: true });
  const endLabel = text(ctx, 'End time', '', AXIS_LEFT + AXIS_W - 80, 58, 80, { fontSize: 12, color: L.muted, align: 'right', autoSize: 'none', height: 16, decorative: true, bindings: { text: clock('stripLength') } } as never);
  const legend = text(ctx, 'Strip legend', 'Top row: the expert\'s tags (square). Bottom row: yours (round). The number is the tag. Filled green: agreed. Hollow with a red edge: you missed it. Select any tag to read about it.', 14, 104, AXIS_W, { fontSize: 13, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: 34 });
  const strip = createNode('frame', { name: 'Strip panel', x: 0, y: 0, width: STRIP_W, height: 144, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false, children: [axis, startLabel, endLabel, expertRow, youRow, legend] } as never) as FrameNode;
  checklist.push(item('Set the expert tags: Project > Variables > "expert" (t is the second in the recording, cat is the tag\'s number, comment is what the learner reads)', expertRow, compare));

  //What was picked
  const pickText =
    `pickedExpert >= 0 ? "Expert tag at " + ${clock('expert[pickedExpert].t')} + ", " + categories[expert[pickedExpert].cat - 1] + ". " + expert[pickedExpert].comment + (expertHit[pickedExpert] ? " You tagged this too." : " You did not tag this one.") : ` +
    `pickedYou >= 0 ? "Your tag at " + ${clock('tags[pickedYou].t')} + ", " + categories[tags[pickedYou].cat - 1] + (tags[pickedYou].note ? ": " + tags[pickedYou].note : ".") + (youHit[pickedYou] ? " The expert tagged this too." : " The expert did not tag this one. If you can say why you did, that is worth sharing with your group.") : ` +
    lit('Select a tag on the strip to read the expert\'s comment, or to see your own note. If you disagree with the expert, say why in your group.');
  const detailText = text(ctx, 'Detail', '', 12, 10, cb.width - 24, { fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 64, bindings: { text: pickText } } as never);
  const detail = createNode('frame', { name: 'Detail panel', x: 0, y: 0, width: cb.width, height: 84, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false, role: 'region', ariaLabel: 'Tag detail', children: [detailText] } as never) as FrameNode;
  const back = button(ctx, 'Back to the video', 'Back to the video', 0, 0, 220, false);
  const again = button(ctx, 'Start again', 'Start again', 0, 0, 180, true);
  const endRow = stack('Compare buttons', 0, 0, cb.width, { direction: 'row', gap: 12, align: 'start', children: [back, again] });
  compare.children.push(stack('Compare column', cb.x, cb.y, cb.width, { gap: 8, children: [framing, statRow, strip, detail, endRow] }));

  const cg = new Graph(compare);
  const onShow = cg.start('Say how it went');
  cg.run(onShow, announce('"You agreed with " + agreed + " of " + expert.length + " expert tags, missed " + missed + ", and made " + extra + " of your own."'));
  graphNote(compare, { anchor: onShow, colour: 'sky', text: '**The comparison is already worked out.** `agreed`, `missed` and `extra` are live, from `tags` against `expert` within `tolerance` seconds, so this only reads them aloud. [ ] Widen `tolerance` to be kinder about timing.' });
  const onExpert = cg.click(expertMarker, 'An expert tag');
  cg.run(onExpert, set(pickedExpert, 'event.index'), set(pickedYou, '-1'));
  cg.run(cg.click(youMarker, 'One of your tags'), set(pickedYou, 'event.index'), set(pickedExpert, '-1'));
  graphNote(compare, { anchor: onExpert, colour: 'sky', text: '**Picking an expert tag clears your pick, and the other way round**, so the detail box always shows one comment. `pickedExpert` and `pickedYou` are -1 when nothing is picked.' });
  cg.run(cg.click(back, 'Back'), goPrevious());
  cg.run(cg.click(again, 'Again'), reset, goPrevious());

  //Notes for whoever edits the template, below each page
  const below = (page: typeof watch, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(watch, { ...below(watch, 0, 440), text: '**Tag keys** One On key event with no key named hears every key, and its Only if lets through 1 to the number of tags. The buttons are a repeater over `categories`, so a new tag name is a new button and a new key.', colour: 'sky' });
  addNote(watch, { ...below(watch, 456, 440), text: '**Transcript** The viewer\'s own Transcript button lists the Video layer\'s captions, so there is no panel to build. [ ] Caption every line, not just the speech.', colour: 'gold' });
  addNote(compare, { ...below(compare, 0, 440), text: '**Live variables** `expertHit`, `youHit`, `agreed`, `missed`, `extra` and `stripLength` are worked out from `tags`, `expert` and `tolerance` as the tags are made. The numbers and the markers only read them.', colour: 'sky' });
  addNote(compare, { ...below(compare, 456, 440), text: '[ ] Write your own expert tags and comments in the `expert` variable. They line up with the recording by seconds.', colour: 'gold' });

  return { project, checklist: checklist as TemplateChecklistItem[] };
}

/** States for the layout check: tags made, one picked on the compare page (its comment is the longest line that page shows). */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'four tags, one picked', vars: { tags: [{ t: 12, cat: 1, note: 'a note' }, { t: 30, cat: 2, note: '' }, { t: 48, cat: 3, note: '' }, { t: 90, cat: 4, note: 'late' }], videoTime: 95, videoLength: 100, pickedExpert: 0 } },
  { label: 'your tag picked', page: 'Compare with the expert', vars: { tags: [{ t: 12, cat: 1, note: 'I would have asked the same thing in the same words as the coach did here' }], pickedYou: 0 } },
];

export const observeAndTag: BrandedStarter = {
  key: 'media/observe-and-tag',
  set: 'media',
  name: 'Observe and tag',
  description: 'The learner watches a recording and taps category tags (or number keys) at the moments they notice something. Their tags are then drawn over the expert\'s on one timeline, with the expert\'s comment on each, and a count of agreements and misses. Choose your recording and write your expert tags; audio-only works with a still picture.',
  tags: ['video', 'audio', 'observation', 'feedback', 'list variable'],
  build,
  layoutStates: LAYOUT_STATES,
};
