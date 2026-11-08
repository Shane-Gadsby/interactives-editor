//Photo prompts notebook: a privacy pledge first, then about six prompts, each with a photo slot (the device's photo picker, or the
//author's example picture when there is no camera), a caption, a tag and a "why this one" box, with retake, delete and skip (with a
//reason). The notebook page shows the same prompts as a list or as a bingo board (the "bingo" variable, with a toggle for the
//learner), and the hand-in page downloads one web page report with the pictures inside it, for upload to a Moodle assignment.
//Built from the media bridge's Take or choose a photo and Download a file nodes (the report is an HTML string with [[image:id]]
//marks that the learner page fills in), list variables and repeaters. Photos live in memory only, so the wording says download
//before leaving.
import { createNode, type FrameNode, type ImageNode, type InputNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { addNote, brandedPage, brandedProject, button, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import { BRAND_FONT, type Colourway } from '../../looks';
import { Graph, addVar, announce, bind, go, goNext, goPrevious, heroPage, lit, placeholderPicture as placeholder, resetVars, set, setItem, textBox, tickList, toggleItem, toggleVar } from './shared';

const PROMPTS = [
  { title: 'A rule or sign that keeps people safe', hint: 'Look for a sign, a marking or a barrier. Photograph the thing, not a person using it.', exampleAlt: 'A yellow wet floor sign standing in an empty corridor' },
  { title: 'Something that moves water, air or people', hint: 'A drain, a vent, a crossing, a stairwell. What is it moving, and where to?', exampleAlt: 'A stormwater drain beside a footpath' },
  { title: 'Something that has been repaired, adapted or reused', hint: 'A patched fence, a chair used as a doorstop. What problem did the fix solve?', exampleAlt: 'A cracked step repaired with a metal plate' },
  { title: 'A pattern that repeats', hint: 'Bricks, leaves, windows, queues. Where does the pattern stop or change?', exampleAlt: 'A wall of identical windows in even rows' },
  { title: 'A place where design helps someone, or gets in the way', hint: 'A ramp, a heavy door, a small label. Who is it working for, and who is it not?', exampleAlt: 'A ramp beside a flight of steps' },
  { title: 'Something you cannot explain yet', hint: 'Choose something that makes you ask "why is it like that?" Say what you wonder.', exampleAlt: 'A pipe that ends at a blank wall' },
];

const PLEDGES = [
  'I will not photograph anyone\'s face, or anyone who has not agreed.',
  'I will not photograph patients, clients or anyone I work with or care for.',
  'I will not photograph number plates, name tags, screens or papers with personal details.',
  'I will check the background of each photo, and retake it if it shows something I should not share.',
];

const TAGS = ['No tag', 'Key idea', 'Example', 'Safety or risk', 'A question I have'];

const BINGO_COLUMNS = 3;

const done = (e: string) => `(${e}.status == "photo" || ${e}.status == "example")`;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Photo prompts notebook');
  const { project, L } = ctx;
  project.settings.sensors = { photos: true, purpose: 'take or choose photos for your notebook. Nothing is uploaded' };

  const photoIds = PROMPTS.map((_p, i) => placeholder(project, `Photo ${i + 1} (replaced by the learner's photo)`, 'Your photo', `Prompt ${i + 1}`));
  const exampleIds = PROMPTS.map((_p, i) => placeholder(project, `Example picture ${i + 1}`, 'Example picture', `Prompt ${i + 1}: replace me`));

  addVar(project, 'prompts', 'list', PROMPTS.map((p, i) => ({ ...p, photo: photoIds[i], example: exampleIds[i] })));
  addVar(project, 'pledges', 'list', PLEDGES);
  const agreed = addVar(project, 'agreed', 'list', []);
  //One entry per prompt, worked out from the prompts when the notebook starts (and again on Reset variables), so a prompt added to the list gets its entry
  const entries = addVar(project, 'entries', 'list', [], { formula: 'prompts.map(p => ({status: "empty", caption: "", tag: "No tag", why: "", reason: ""}))' });
  const cur = addVar(project, 'current', 'number', 0);
  const caption = addVar(project, 'caption', 'string', '');
  const tag = addVar(project, 'tag', 'string', TAGS[0]);
  const why = addVar(project, 'why', 'string', '');
  const reason = addVar(project, 'skipReason', 'string', '');
  const skipping = addVar(project, 'skipping', 'boolean', false);
  const bingo = addVar(project, 'bingo', 'boolean', false);
  addVar(project, 'notebookTitle', 'string', 'My photo notebook');
  //Live variables: what the notebook page and the hand-in page both say about how far the learner has got, and the one list the list and the board repeat over
  const ent = (f: string, d: string) => `((entries[i] ?? {}).${f} ?? ${d})`;
  addVar(project, 'rows', 'list', [], { formula: `prompts.map((p, i) => ({n: i + 1, title: p.title, photo: p.photo, example: p.example, exampleAlt: p.exampleAlt, status: ${ent('status', '"empty"')}, caption: ${ent('caption', '""')}, tag: ${ent('tag', '"No tag"')}, reason: ${ent('reason', '""')}}))`, live: true });
  addVar(project, 'doneCount', 'number', 0, { formula: 'entries.filter(e => e.status == "photo" || e.status == "example").length', live: true });
  addVar(project, 'skippedCount', 'number', 0, { formula: 'entries.filter(e => e.status == "skipped").length', live: true });
  addVar(project, 'lines', 'number', 0, { formula: `[0, 1, 2, 3].filter(r => r * ${BINGO_COLUMNS} + ${BINGO_COLUMNS - 1} < prompts.length && [0, 1, 2].every(c => ${done('entries[r * 3 + c]')})).length`, live: true });

  const checklist: TemplateChecklistItem[] = [];

  const { page: hero, start } = heroPage(ctx, 'Photo prompts notebook', 'Photograph things near you, say why you chose each one, and hand in your finished notebook.');
  const privacy = brandedPage(ctx, 'Before you take any photo', { footer: 'Photo prompts notebook' });
  const prompt = brandedPage(ctx, 'Photo prompt', { footer: 'Photo prompts notebook' });
  const notebook = brandedPage(ctx, 'My notebook', { footer: 'Photo prompts notebook' });
  const handin = brandedPage(ctx, 'Hand in your notebook', { footer: 'Photo prompts notebook' });

  //The current prompt's caption, tag and the two text boxes go back into its entry (status changed when one is given)
  const commit = (status?: string): [string, Record<string, unknown>] => setItem(entries, `{status: ${status ?? 'item.status'}, caption: caption, tag: tag, why: why, reason: skipReason}`, { index: 'current' });
  //Show prompt number `idx` (an expression): save the one on screen, then load the new one's words into the boxes
  const open = (idx: string): [string, Record<string, unknown>][] => [
    commit(),
    set(cur, idx),
    set(caption, 'entries[current].caption'),
    set(tag, 'entries[current].tag'),
    set(why, 'entries[current].why'),
    set(reason, 'entries[current].reason'),
    set(skipping, 'false'),
  ];

  // ---------------------------------------------------------------- hero
  const hg = new Graph(hero);
  hg.run(hg.click(start, 'Begin'), resetVars(entries, cur, caption, tag, why, reason, skipping), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero));

  // ---------------------------------------------------------------- privacy page
  const pb = contentBox(privacy);
  const intro = text(ctx, 'Privacy intro', 'This notebook is about things and places, not people. Tick each line to show you agree, then start.', pb.x, pb.y, pb.width, { fontSize: 18, lineHeight: 1.35, autoSize: 'none', height: 30 });
  const { list: rows, row } = tickList(ctx, 'Pledges', 'Pledge row', pb.x, pb.y + 44, pb.width, { items: 'pledges', ticked: agreed, ariaLabel: 'Things you agree to before you start', rows: 4, rowHeight: 48, gap: 8 });
  const privacyCard = card(ctx, 'Privacy note panel', pb.x, pb.y + 44 + 4 * 48 + 3 * 8 + 18, pb.width, 86);
  const privacyNote = text(ctx, 'Privacy note', 'Your photos are not uploaded anywhere by this page. They stay on your device, in this page, until you download your notebook and hand it in. If you close or reload the page they are gone, so download before you leave. No camera? Every prompt has an example picture you can use instead.', pb.x + 20, pb.y + 44 + 4 * 48 + 3 * 8 + 28, pb.width - 40, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: 66 });
  const pContinue = button(ctx, 'Continue', 'I agree, start', pb.x, pb.y + pb.height - 46, 240, true);
  bind(pContinue, { disabled: 'agreed.length < pledges.length', opacity: 'agreed.length < pledges.length ? 0.5 : 1' });
  const pLeft = text(ctx, 'Pledges left', '', pb.x + 256, pb.y + pb.height - 36, 500, { fontSize: 15, color: L.muted, bindings: { text: 'agreed.length < pledges.length ? "Tick all " + pledges.length + " lines to start." : ""' } } as never);
  privacy.children.push(intro, rows, privacyCard, privacyNote, pContinue, pLeft);
  const pg = new Graph(privacy);
  pg.run(pg.click(row, 'Tick or untick a line'), toggleItem(agreed, 'event.index'));
  //The button is disabled until then, and the event's Only if checks too, so a click that gets past a disabled button still goes nowhere
  const start2 = pg.add('event.pointer', { target: pContinue.id, type: 'click', onlyIf: 'agreed.length >= pledges.length' }, null, 'out', { note: 'Start the prompts' });
  pg.run(start2, goNext());
  checklist.push(item('Read the four lines on the privacy page and make them fit your task (Project > Variables > "pledges"). Have your privacy office read them, and say plainly who may be photographed, if anyone', rows, privacy));

  // ---------------------------------------------------------------- prompt page
  const b = contentBox(prompt);
  const LW = 380;
  const RX = b.x + LW + 28;
  const RW = b.width - LW - 28;

  const counter = text(ctx, 'Prompt counter', 'Prompt {current + 1} of {prompts.length}', b.x, b.y, LW, { fontSize: 14, color: L.muted, autoSize: 'none', height: 20 });
  const title = heading(ctx, 'Prompt title', '{prompts[current].title}', b.x, b.y + 22, LW, { fontSize: 21, autoSize: 'none', height: 52, lineHeight: 1.25 });
  const hint = text(ctx, 'Prompt hint', '{prompts[current].hint}', b.x, b.y + 76, LW, { fontSize: 14, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: 38 });

  //The photo frame: the photo (or the example picture) when there is one, words when there is not
  const statusIs = (s: string) => `entries[current].status == "${s}"`;
  const photoY = b.y + 120;
  const frameH = 220;
  const photo = createNode('image', {
    name: 'Photo',
    x: 0,
    y: 0,
    width: LW,
    height: frameH,
    assetId: photoIds[0],
    fit: 'contain',
    ariaLabel: 'Your photo for this prompt',
  } as Partial<ImageNode>) as ImageNode;
  bind(photo, {
    visible: `${statusIs('photo')} || ${statusIs('example')}`,
    assetId: `${statusIs('example')} ? prompts[current].example : prompts[current].photo`,
    ariaLabel: `${statusIs('example')} ? "Example picture: " + prompts[current].exampleAlt : (caption.trim() != "" ? "Your photo: " + caption : "Your photo for this prompt")`,
  });
  const emptyNote = text(ctx, 'Empty slot note', '', 24, 72, LW - 48, {
    fontSize: 17,
    align: 'center',
    color: L.muted,
    lineHeight: 1.35,
    autoSize: 'none',
    height: 90,
    bindings: {
      text: `${statusIs('skipped')} ? "Skipped. Your reason: " + entries[current].reason : (photos == "ready" ? "No photo yet. Take or choose one, or use the example picture." : "Photos are not available here. Use the example picture.")`,
      visible: `!(${done('entries[current]')})`,
    },
  } as never);
  const photoFrame = createNode('frame', {
    name: 'Photo slot',
    x: b.x,
    y: photoY,
    width: LW,
    height: frameH,
    cornerRadius: 16,
    fill: solid(L.surfaceMuted),
    stroke: null,
    clip: true,
    role: 'region',
    ariaLabel: 'Photo slot',
    children: [photo, emptyNote],
  }) as FrameNode;
  const badge = createNode('frame', { name: 'Example badge frame', x: b.x + 12, y: photoY + frameH - 34, width: 140, height: 24, cornerRadius: 12, fill: solid(L.button), stroke: null, clip: false, decorative: true, children: [text(ctx, 'Example badge text', 'Example picture', 0, 2, 140, { fontSize: 13, fontWeight: 700, color: L.onButton, align: 'center', autoSize: 'none', height: 20, decorative: true })] }) as FrameNode;
  bind(badge, { visible: statusIs('example') });

  const BH = 46;
  const row1 = photoY + frameH + 12;
  const row2 = row1 + BH + 8;
  const takeBtn = button(ctx, 'Take or choose a photo', 'Take or choose a photo', b.x, row1, 228, true);
  bind(takeBtn, { label: `${statusIs('photo')} ? "Retake photo" : "Take or choose a photo"`, disabled: 'photos != "ready"', opacity: 'photos != "ready" ? 0.5 : 1' });
  takeBtn.ariaLabel = 'Take or choose a photo for this prompt';
  const exampleBtn = button(ctx, 'Use the example picture', 'Use the example', b.x + 240, row1, 180, false);
  exampleBtn.ariaLabel = 'Use the example picture instead of a photo';
  const deleteBtn = button(ctx, 'Delete photo', 'Delete photo', b.x, row2, 150, false);
  bind(deleteBtn, { disabled: `!(${statusIs('photo')})`, opacity: `${statusIs('photo')} ? 1 : 0.5` });
  const skipBtn = button(ctx, 'Skip this prompt', 'Skip this prompt', b.x + 162, row2, 218, false);
  bind(skipBtn, { label: `${statusIs('skipped')} ? "Undo skip" : "Skip this prompt"` });

  //Right: caption, tag, why
  const capLabel = text(ctx, 'Caption label', 'Caption', RX, b.y, RW, { fontSize: 15, fontWeight: 700 });
  const capBox = textBox(ctx, 'Caption box', caption, RX, b.y + 22, RW, 62, 'What is in the photo? Say it so someone who cannot see it would know.', 'Caption for this photo');
  const tagLabel = text(ctx, 'Tag label', 'Tag', RX, b.y + 96, RW, { fontSize: 15, fontWeight: 700 });
  const tagBox = createNode('input', {
    name: 'Tag',
    x: RX,
    y: b.y + 118,
    width: RW,
    height: 44,
    inputType: 'select',
    options: TAGS.join('\n'),
    variableId: tag.id,
    ariaLabel: 'Tag for this photo',
    ...lookDefaults(project, 'input'),
    stroke: stroke(L.border, 2),
    cornerRadius: 10,
    fontSize: 17,
    fontFamily: BRAND_FONT,
  } as Partial<InputNode>);
  const whyLabel = text(ctx, 'Why label', 'Why this one?', RX, b.y + 174, RW, { fontSize: 15, fontWeight: 700 });
  const whyBox = textBox(ctx, 'Why box', why, RX, b.y + 196, RW, 118, 'What made you choose it? Which idea from the course does it show?', 'Why you chose this photo');
  bind(whyLabel, { visible: '!skipping' });
  bind(whyBox, { visible: '!skipping' });

  //Skipping asks for a reason, in place of the why box
  const skipLabel = text(ctx, 'Skip reason label', 'Why are you skipping this prompt?', RX, b.y + 174, RW, { fontSize: 15, fontWeight: 700 });
  const skipBox = textBox(ctx, 'Skip reason box', reason, RX, b.y + 196, RW, 66, 'For example: I could not find one without people in it.', 'Your reason for skipping this prompt');
  const confirmSkip = button(ctx, 'Confirm skip', 'Skip it', RX, b.y + 272, 150, true);
  bind(confirmSkip, { disabled: 'skipReason.trim() == ""', opacity: 'skipReason.trim() == "" ? 0.5 : 1' });
  const cancelSkip = button(ctx, 'Cancel skip', 'Cancel', RX + 162, b.y + 272, 150, false);
  for (const n of [skipLabel, skipBox, confirmSkip, cancelSkip]) bind(n, { visible: 'skipping' });

  const warnTop = b.y + 326;
  const warnCard = card(ctx, 'Download warning panel', RX, warnTop, RW, 66);
  const warn = text(ctx, 'Download warning', 'Your photos live only in this page. Download your notebook before you close it or leave.', RX + 16, warnTop + 10, RW - 32, { fontSize: 14, lineHeight: 1.35, autoSize: 'none', height: 46 });

  const prevBtn = button(ctx, 'Previous', 'Previous', RX, row2, 140, false);
  bind(prevBtn, { disabled: 'current == 0', opacity: 'current == 0 ? 0.5 : 1' });
  const nextBtn = button(ctx, 'Next', 'Next', RX + 152, row2, 140, false);
  bind(nextBtn, { label: 'current + 1 < prompts.length ? "Next" : "Finish"' });
  const bookBtn = button(ctx, 'My notebook', 'My notebook', RX + 304, row2, RW - 304, true);
  prompt.children.push(counter, title, hint, photoFrame, badge, takeBtn, exampleBtn, deleteBtn, skipBtn, capLabel, capBox, tagLabel, tagBox, whyLabel, whyBox, skipLabel, skipBox, confirmSkip, cancelSkip, warnCard, warn, prevBtn, nextBtn, bookBtn);

  checklist.push(item('Write your prompts: Project > Variables > "prompts" (title, hint, and exampleAlt, which describes the example picture for a screen reader). Six prompts fit; fewer, delete rows from the end. For more, add image assets and put their ids in a new row\'s photo and example fields', title, prompt));
  checklist.push(item('Replace the six "Example picture" assets in the Assets panel with your own example for each prompt, a picture you may use with its attribution, and write what it shows in "exampleAlt". The example is how a learner without a camera finishes', exampleBtn, prompt));
  checklist.push(item('Choose the tags learners can pick from: select the Tag layer and change its options (keep "No tag" first)', tagBox, prompt));

  const g = new Graph(prompt);
  const onTake = g.click(takeBtn, 'Take or choose a photo');
  const got = g.add('action.photo', { op: 'take', source: 'pick', assetExpr: 'prompts[current].photo', maxEdge: 1600 }, onTake);
  g.runFrom(got, 'out', set(skipping, 'false'), commit('"photo"'), announce('"Photo added for prompt " + (current + 1) + ". Now write a caption and say why you chose it."'));
  g.add('action.announce', { text: '"No photo was added."', politeness: 'polite' }, got, 'none', { dy: 70 });
  g.gap(80);

  g.run(g.click(exampleBtn, 'Use the example picture'), set(skipping, 'false'), commit('"example"'), announce('"Example picture used for prompt " + (current + 1) + "."'));

  //Delete: the learner page forgets the photo, and the slot shows its words again
  g.run(g.click(deleteBtn, 'Delete the photo'), ['action.photo', { op: 'remove', assetExpr: 'prompts[current].photo' }], commit('"empty"'), announce('"Photo deleted."'));

  const onSkip = g.click(skipBtn, 'Skip, or undo a skip');
  const isSkipped = g.add('logic.if', { condition: statusIs('skipped') }, onSkip);
  g.runFrom(isSkipped, 'true', commit('"empty"'), announce('"Skip undone."'));
  g.runFrom(isSkipped, 'false', set(skipping, 'true'), announce('"Say why you are skipping this prompt, then choose Skip it."'));
  g.gap(80);
  //A skip needs its reason: the button is disabled without one, and the event's Only if holds a click that got past it
  const onConfirm = g.add('event.pointer', { target: confirmSkip.id, type: 'click', onlyIf: 'skipReason.trim() != ""' }, null, 'out', { note: 'Skip it' });
  g.run(onConfirm, ['action.photo', { op: 'remove', assetExpr: 'prompts[current].photo' }], commit('"skipped"'), set(skipping, 'false'), announce('"Prompt " + (current + 1) + " skipped."'));
  g.gap(80);
  g.run(g.click(cancelSkip, 'Cancel the skip'), set(skipping, 'false'));

  g.run(g.click(prevBtn, 'Previous prompt'), ...open('current - 1'));
  const onNext = g.click(nextBtn, 'Next prompt, or finish');
  const more = g.add('logic.if', { condition: 'current + 1 < prompts.length' }, onNext);
  g.runFrom(more, 'true', ...open('current + 1'));
  g.runFrom(more, 'false', commit(), goNext());
  g.gap(80);
  g.run(g.click(bookBtn, 'See my notebook'), commit(), goNext());

  // ---------------------------------------------------------------- notebook page
  const nb = contentBox(notebook);
  const summary = text(ctx, 'Summary', '', nb.x, nb.y + 6, nb.width - 280, {
    fontSize: 17,
    fontWeight: 600,
    autoSize: 'none',
    height: 30,
    bindings: { text: 'doneCount + " of " + prompts.length + " done" + (skippedCount > 0 ? ", " + skippedCount + " skipped" : "") + (bingo ? ". Lines of three complete: " + lines : "") + (doneCount == prompts.length ? ". Full board!" : "")' },
  } as never);
  const viewToggle = button(ctx, 'Switch view', 'Show as bingo board', nb.x + nb.width - 260, nb.y, 260, false);
  bind(viewToggle, { label: 'bingo ? "Show as a list" : "Show as bingo board"' });
  viewToggle.ariaLabel = 'Switch between the list and the bingo board';

  const gridY = nb.y + 52;
  //The list: a card per prompt
  const CW = (nb.width - 12) / 2;
  const CH = 108;
  const thumb = createNode('image', { name: 'Thumbnail', x: 10, y: 10, width: 120, height: CH - 20, assetId: photoIds[0], fit: 'cover', cornerRadius: 10, decorative: true } as Partial<ImageNode>) as ImageNode;
  bind(thumb, { visible: `${done('item')}`, assetId: 'item.status == "example" ? item.example : item.photo' });
  const thumbEmpty = createNode('frame', { name: 'Thumbnail empty', x: 10, y: 10, width: 120, height: CH - 20, cornerRadius: 10, fill: solid(L.surfaceMuted), stroke: null, clip: false, decorative: true, children: [text(ctx, 'Prompt number', '{item.n}', 0, 24, 120, { fontSize: 30, fontWeight: 700, color: L.muted, align: 'center', decorative: true, autoSize: 'none', height: 40 })] }) as FrameNode;
  bind(thumbEmpty, { visible: `!${done('item')}` });
  const cardTitle = text(ctx, 'Card title', '{item.n}. {item.title}', 142, 10, CW - 154, { fontSize: 15, fontWeight: 700, decorative: true, autoSize: 'none', height: 40, lineHeight: 1.25, overflow: 'ellipsis' });
  const cardState = text(ctx, 'Card state', '', 142, 52, CW - 154, {
    fontSize: 13,
    color: L.muted,
    decorative: true,
    autoSize: 'none',
    height: 18,
    bindings: { text: 'item.status == "photo" ? "Photo" : item.status == "example" ? "Example picture" : item.status == "skipped" ? "Skipped" : "Not done yet"' },
  } as never);
  const cardCaption = text(ctx, 'Card caption', '', 142, 72, CW - 154, {
    fontSize: 13,
    decorative: true,
    autoSize: 'none',
    height: 28,
    overflow: 'ellipsis',
    bindings: { text: 'item.status == "skipped" ? item.reason : item.caption' },
  } as never);
  const listCard = createNode('frame', { name: 'List card', x: 0, y: 0, width: CW, height: CH, cornerRadius: 14, fill: solid(L.surface), stroke: stroke(L.border, 1.5), clip: false, role: 'button', focusable: true, cursor: 'pointer', children: [thumb, thumbEmpty, cardTitle, cardState, cardCaption] }) as FrameNode;
  const cardLabel = (what: string) => `"Prompt " + item.n + ", " + item.title + ". " + (item.status == "photo" ? "Photo" : item.status == "example" ? "Example picture used" : item.status == "skipped" ? "Skipped" : "Not done yet") + ". ${what}"`;
  bind(listCard, { ariaLabel: cardLabel('Press to open it.'), 'stroke.paint.color': `${done('item')} ? "${L.primary}" : "${L.border}"` });
  const list = createNode('frame', { name: 'Notebook list', x: nb.x, y: gridY, width: nb.width, height: 3 * CH + 2 * 10, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your prompts', repeat: { items: 'rows', layout: 'grid', gap: 10, columns: 2 }, children: [listCard] }) as FrameNode;
  bind(list, { visible: '!bingo' });

  //The bingo board: the same prompts as squares
  const SW = (nb.width - 2 * 14) / BINGO_COLUMNS;
  const SH = 168;
  const squareImg = createNode('image', { name: 'Square picture', x: 0, y: 0, width: SW, height: SH, assetId: photoIds[0], fit: 'cover', decorative: true } as Partial<ImageNode>) as ImageNode;
  bind(squareImg, { visible: `${done('item')}`, assetId: 'item.status == "example" ? item.example : item.photo' });
  const squareNum = text(ctx, 'Square number', '{item.status == "skipped" ? "Skipped" : item.n}', 0, 40, SW, { fontSize: 40, fontWeight: 700, color: L.muted, align: 'center', decorative: true, autoSize: 'none', height: 52 });
  bind(squareNum, { visible: `!${done('item')}` });
  const band = createNode('rect', { name: 'Square band', x: 0, y: SH - 50, width: SW, height: 50, fill: solid(L.surface), stroke: null, decorative: true });
  const bandText = text(ctx, 'Square title', '{item.title}', 12, SH - 44, SW - 56, { fontSize: 13, fontWeight: 600, decorative: true, autoSize: 'none', height: 38, lineHeight: 1.25, overflow: 'ellipsis' });
  const checkDisc = createNode('frame', { name: 'Square tick', x: SW - 42, y: SH - 40, width: 30, height: 30, cornerRadius: 15, fill: solid(L.button), stroke: null, clip: false, decorative: true, children: [text(ctx, 'Tick', '✓', 0, 3, 30, { fontSize: 17, fontWeight: 700, color: L.onButton, align: 'center', decorative: true, autoSize: 'none', height: 24 })] }) as FrameNode;
  bind(checkDisc, { visible: `${done('item')}` });
  const square = createNode('frame', { name: 'Bingo square', x: 0, y: 0, width: SW, height: SH, cornerRadius: 14, fill: solid(L.surfaceMuted), stroke: stroke(L.border, 2), clip: true, role: 'button', focusable: true, cursor: 'pointer', children: [squareImg, squareNum, band, bandText, checkDisc] }) as FrameNode;
  bind(square, { ariaLabel: cardLabel('Press to open it.'), 'stroke.paint.color': `${done('item')} ? "${L.primary}" : "${L.border}"` });
  const board = createNode('frame', { name: 'Bingo board', x: nb.x, y: gridY, width: nb.width, height: 2 * SH + 14, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your bingo board', repeat: { items: 'rows', layout: 'grid', gap: 14, columns: BINGO_COLUMNS }, children: [square] }) as FrameNode;
  bind(board, { visible: 'bingo' });

  const nbY = nb.y + nb.height - 46;
  const handBtn = button(ctx, 'Hand in my notebook', 'Hand in my notebook', nb.x, nbY, 260, true);
  const backBtn = button(ctx, 'Back to the prompts', 'Back to the prompts', nb.x + 272, nbY, 230, false);
  const nbWarn = text(ctx, 'Notebook download note', 'Your photos live only in this page. Download before you leave.', nb.x + 520, nbY + 2, nb.width - 520, { fontSize: 14, color: L.muted, lineHeight: 1.3, autoSize: 'none', height: 42 });
  notebook.children.push(summary, viewToggle, list, board, handBtn, backBtn, nbWarn);

  const ng = new Graph(notebook);
  ng.run(ng.click(viewToggle, 'Switch between list and bingo board'), toggleVar(bingo), announce('bingo ? "Showing the bingo board." : "Showing the list."'));
  ng.run(ng.click(listCard, 'Open a prompt from the list'), ...open('event.index'), go(prompt));
  ng.run(ng.click(square, 'Open a prompt from the board'), ...open('event.index'), go(prompt));
  ng.run(ng.click(backBtn, 'Back to the prompts'), goPrevious());
  ng.run(ng.click(handBtn, 'Hand in'), goNext());
  checklist.push(item('Choose the layout learners open in: Project > Variables > "bingo" (true is the bingo board, false the list). They can switch with the button either way. The board has rows of three, so six prompts make two lines', viewToggle, notebook));

  // ---------------------------------------------------------------- hand-in page
  const hb = contentBox(handin);
  const stepsText = text(
    ctx,
    'Hand-in steps',
    '1. Download your notebook. It is one web page with your photos, captions and reasons inside it.\n2. Open the file and check every photo and caption is there.\n3. Upload the file to your assignment in StudyDesk. Choose the notebook file when it asks for your submission.',
    hb.x,
    hb.y,
    hb.width,
    { fontSize: 18, lineHeight: 1.45, autoSize: 'none', height: 112 },
  );
  const warnPanel = card(ctx, 'Hand-in warning panel', hb.x, hb.y + 128, hb.width, 92);
  const warnText = text(ctx, 'Hand-in warning', 'Download before you leave. Your photos are held in this page only, not on any server. If you close it, reload it or lose your connection they are gone, and the file you downloaded is the only copy. Download again after any change.', hb.x + 20, hb.y + 140, hb.width - 40, { fontSize: 16, lineHeight: 1.4, autoSize: 'none', height: 72 });
  const count = text(ctx, 'Hand-in count', '', hb.x, hb.y + 238, hb.width, {
    fontSize: 16,
    color: L.muted,
    autoSize: 'none',
    height: 24,
    bindings: { text: '"Your notebook has " + doneCount + " of " + prompts.length + " prompts done" + (skippedCount > 0 ? " and " + skippedCount + " skipped" : "") + "."' },
  } as never);
  const saveBtn = button(ctx, 'Download my notebook', 'Download my notebook', hb.x, hb.y + 284, 300, true);
  const again = button(ctx, 'Back to my notebook', 'Back to my notebook', hb.x + 312, hb.y + 284, 260, false);
  const saved = text(ctx, 'Download result', 'The file is called photo-notebook.html. Look in your downloads folder, and keep it until your mark is back.', hb.x, hb.y + 346, hb.width, { fontSize: 15, color: L.muted, lineHeight: 1.35, autoSize: 'none', height: 44 });
  handin.children.push(stepsText, warnPanel, warnText, count, saveBtn, again, saved);
  checklist.push(item('Name your assignment in the hand-in steps (and tell learners which file type it accepts: an .html file). Check the assignment allows file uploads of that size, a notebook with six photos is a few megabytes', stepsText, handin));

  //The report: one web page, the photos inside it. [[image:id]] is replaced by the picture when the page saves; html() makes what the learner typed safe.
  const nl = (e: string) => `html(${e}).split("\\n").join("<br>")`;
  const isEx = 'entries[i].status == "example"';
  const section =
    `prompts.map((p, i) => '<section><h2>' + (i + 1) + '. ' + html(p.title) + '</h2>' + (` +
    `${done('entries[i]')} ? '<figure><img src="[[image:' + (${isEx} ? p.example : p.photo) + ']]" alt="' + html(${isEx} ? p.exampleAlt : (entries[i].caption.trim() != "" ? entries[i].caption : "Photo for this prompt")) + '"><figcaption>' + (${isEx} ? 'Example picture used instead of a photo. ' : '') + html(entries[i].caption) + '</figcaption></figure>' + (entries[i].tag != "No tag" ? '<p class="tag">Tag: ' + html(entries[i].tag) + '</p>' : '') + '<h3>Why this one</h3><p>' + (entries[i].why.trim() != "" ? ${nl('entries[i].why')} : 'Not written.') + '</p>' : ` +
    `entries[i].status == "skipped" ? '<p><strong>Skipped.</strong> Reason: ' + ${nl('entries[i].reason')} + '</p>' : '<p>Not done.</p>') + '</section>').join("")`;
  const css = 'body{font-family:"Open Sans",Arial,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#2d2d2d;line-height:1.5}h1{font-size:1.8rem}h2{font-size:1.25rem;margin-top:2rem}h3{font-size:1rem;margin-bottom:0}img{max-width:100%;height:auto;border-radius:8px}figure{margin:1rem 0}figcaption{font-style:italic}.tag{font-size:.9rem}section{border-top:1px solid #ccc}';
  const report = `'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + html(notebookTitle) + '</title><style>${css}</style></head><body><h1>' + html(notebookTitle) + '</h1><p>Saved ' + new Date().toLocaleDateString() + '. ' + doneCount + ' of ' + prompts.length + ' prompts done.</p>' + ${section} + '</body></html>'`;
  const hg2 = new Graph(handin);
  hg2.run(hg2.click(saveBtn, 'Download the notebook'), ['action.saveFile', { name: lit('photo-notebook'), mime: 'text/html', text: report }], announce('"Your notebook was saved to your device. Upload it to your assignment."'));
  hg2.run(hg2.click(again, 'Back to the notebook'), goPrevious());
  checklist.push(item('Check the report: open the file the Download button gives you and read it. Photos are inside the file as pictures, so it works offline and uploads as one file', saveBtn, handin));
  checklist.push(item('Turn on photos for the share link: Project settings > Microphone and camera has "photos" ticked already. Update the link for StudyDesk after any change, and test on a phone and a laptop with no camera (the file chooser then opens instead)', start, hero));

  //Notes for whoever edits the template, below each page
  const below = (page: typeof prompt, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(privacy, { ...below(privacy, 0, 440), text: '**Tick list** The pledges are a repeater with one Set variable that adds a line to `agreed` or takes it out, so there is no If. Continue stays off until every line is in `agreed`.', colour: 'sky' });
  addNote(prompt, { ...below(prompt, 0, 440), text: '**Set item** Each prompt\'s entry is changed in place with Set variable (change one list item), so a photo, a skip or a retake touches only that prompt.', colour: 'sky' });
  addNote(prompt, { ...below(prompt, 456, 440), text: '[ ] Replace the six example pictures in the Assets panel and say what each shows in `exampleAlt`. They are how a learner with no camera finishes.', colour: 'gold' });
  addNote(notebook, { ...below(notebook, 0, 440), text: '**Live variables** `rows`, `doneCount`, `skippedCount` and `lines` are worked out from `entries`, so the list, the board, the summary and the hand-in count all read the same numbers.', colour: 'sky' });
  return { project, checklist };
}

/** States for the layout check: the prompt page with a skip being written and the longest prompt, and the notebook as a board with some done. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'skipping', page: 'Photo prompt', vars: { skipping: true, current: 2, skipReason: 'No safe place to stand' } },
  { label: 'photo taken', page: 'Photo prompt', vars: { entries: [{ status: 'photo', caption: 'A sign', tag: 'Key idea', why: '', reason: '' }, ...Array.from({ length: 5 }, () => ({ status: 'empty', caption: '', tag: 'No tag', why: '', reason: '' }))] } },
  { label: 'bingo board', page: 'My notebook', vars: { bingo: true } },
];

export const photoNotebook: BrandedStarter = {
  key: 'media/photo-notebook',
  set: 'media',
  name: 'Photo prompts notebook',
  description: 'A privacy pledge first, then about six prompts. Each has a photo slot (take or choose a photo, or use your example picture when there is no camera), a caption, a tag and a "why this one" box, with retake, delete and skip with a reason. See it as a list or as a bingo board, then download one report with the photos inside it to upload to a Moodle assignment. Photos are held in the page only, so the wording says download before leaving.',
  tags: ['photo', 'camera', 'fieldwork', 'bingo', 'report download', 'privacy', 'list variable'],
  build,
  layoutStates: LAYOUT_STATES,
};
