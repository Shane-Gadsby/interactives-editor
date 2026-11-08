//Timed talk rehearsal: the learner draws a random card from an author-written bank (a viva question, an interview question, a topic to explain to a
//friend), gets a preparation countdown, then a speaking timer. When it ends they tap a delivery tally while thinking back (fillers, long pauses, a clear
//opening, a clear close), compare with the card's model answer and tick the points they made, and a summary page shows every attempt. The attempts are
//a remembered variable, so they survive a reload. The timers can be switched off (a variable, and a button for the learner) or lengthened (two
//variables): an accessibility adjustment, since a strict clock raises anxiety for some learners. By default no microphone: they talk to a friend, a voice memo or the room.
//The tally is the learner's own reflection and is never presented as measurement; nothing detects fillers or pace.
//The countdowns are the native Countdown / clock node (its Time up output moves on) with a Progress bar, the card pool is a live variable, and the points are a
//tick list with one Toggle in list step.
//
//OPTIONAL RECORDING (the media bridge): the starter does not declare the microphone, so as shipped it records nothing and the two record layers never show.
//An author ticks Microphone in Project > Microphone and camera and they appear: "Recording step" on the talk stage (Record, then Stop recording) and
//"Replay step" on the tally stage (play it back while tallying). Both show only while the microphone is ready, so a learner who says no, has no device or
//chooses "Do not use my microphone or camera" gets the rehearsal exactly as before. It is off by default because a rehearsal is private and low stakes, the
//first start asks the learner for the microphone on a consent screen, and a course page that does not allow the microphone would otherwise show a step
//that cannot work. The take ("talk") is ended when the talk stage is left, kept for the tally and the model answer, and dropped on the next card.
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, barY, brandedPage, brandedProject, button, byName, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { join } from '../../graph-kit';
import { progressBar } from '../../parts';
import { Graph, addVar, announce, bind, clearVar, goNext, goPrevious, graphNote, heroPage, resetVars, set, setVar, tickList, toggleItem, toggleVar } from '../media/shared';
import { MIC_READY, dropTakeWhen, labelled, playLabel, playToggle, rec, recordLabel, recordStatus, recordToggle, stopTakeWhen } from './recording';

//The bank. type is the label on the card, q the question, model a short model answer and points what a good answer makes (up to four)
const CARDS = [
  {
    type: 'Viva question',
    q: 'Explain the main limitation of your approach and what you would do differently.',
    model: 'A limitation of my approach is that it relied on a small sample, so I cannot say the result would hold for other groups. With more time I would collect a second sample, check whether the pattern repeats, and report that comparison alongside the first result.',
    points: ['Names one real limitation clearly', 'Says why it matters for the conclusion', 'Says what you would change', 'Stays calm and does not over-apologise'],
  },
  {
    type: 'Viva question',
    q: 'Why did you choose this method over the alternatives?',
    model: 'I chose it because it answers the question directly and I could carry it out properly in the time. I looked at two other methods. One needed data I could not get and the other would have answered a slightly different question.',
    points: ['Links the choice to the question', 'Mentions at least one alternative', 'Gives a fair reason for rejecting it', 'Does not claim it was the only way'],
  },
  {
    type: 'Interview question',
    q: 'Tell us about a time you worked in a team and something went wrong.',
    model: 'In a group project our plan fell behind when two of us misread the deadline. I called a short meeting, we split the remaining work by strength, and agreed one checkpoint. We finished a day early and I now write down dates in the group chat.',
    points: ['Sets the scene in one or two sentences', 'Says what you personally did', 'Gives the result', 'Ends with what you learned'],
  },
  {
    type: 'Interview question',
    q: 'Why are you interested in this role, and what would you bring to it?',
    model: 'The role matches what I enjoyed most in my studies, which was explaining ideas to other people. I bring reliable teamwork, clear writing, and a habit of checking my work. I would also like to keep learning from the people already doing it well.',
    points: ['Links the role to your own interests', 'Names two or three strengths', 'Gives a short example', 'Finishes with a clear close'],
  },
  {
    type: 'Explain it to a friend',
    q: 'Pick one idea from this course and explain it to a friend who has never studied it.',
    model: 'An idea from this course is the difference between a source and the claim it makes. A source is where something comes from, and a claim is what someone says it shows. So I always ask: does the source actually back up what is being claimed?',
    points: ['Starts with the idea in one plain sentence', 'Uses an everyday example', 'Avoids jargon, or explains it', 'Checks the friend would understand'],
  },
  {
    type: 'One-minute talk',
    q: 'Describe a study habit that works for you, and why.',
    model: 'A habit that works for me is a short review each evening. I write three lines on what I learned that day. It takes five minutes, it shows me what I did not understand, and it means revision before an exam is a reminder, not a first look.',
    points: ['Names the habit clearly', 'Says how it works in practice', 'Gives a reason it helps', 'Closes with one sentence of summary'],
  },
];

const RIGHT_X = 456;
const CLOCK = (v: string) => `Math.floor(${v} / 60) + ":" + pad(${v} % 60, 2)`;
//Only look at a card while one is on show: before the first draw there is none
const ON_SHOW = 'current >= 0 && stage != "draw"';

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Timed talk rehearsal');
  const { project, L } = ctx;
  const stage = addVar(project, 'stage', 'string', 'draw');
  const timersOn = addVar(project, 'timersOn', 'boolean', true);
  addVar(project, 'prepSeconds', 'number', 30);
  addVar(project, 'talkSeconds', 'number', 60);
  const left = addVar(project, 'left', 'number', 0);
  addVar(project, 'cards', 'list', CARDS);
  const current = addVar(project, 'current', 'number', -1);
  const seen = addVar(project, 'seen', 'list', []);
  //Live: the cards still to draw, never the one just drawn. The draw picks from it, so there is no step that works it out
  addVar(project, 'pool', 'list', [], { formula: 'cards.map((c, i) => i).filter(i => !seen.includes(i) && (cards.length < 2 || i != current))', live: true });
  const fillers = addVar(project, 'fillers', 'number', 0);
  const pauses = addVar(project, 'pauses', 'number', 0);
  const opening = addVar(project, 'clearOpening', 'boolean', false);
  const closing = addVar(project, 'clearClose', 'boolean', false);
  const covered = addVar(project, 'covered', 'list', []);
  //Remembered: kept across visits (the learner's record inside StudyDesk, the browser's own storage otherwise)
  const attempts = addVar(project, 'attempts', 'list', []);
  attempts.persist = true;

  const hero = heroPage(ctx, 'Rehearse a talk against the clock', `Draw a card, get a moment to prepare, then talk out loud. Tally how it went and compare with a model answer. {${MIC_READY} ? "You can also record yourself and play it back. The recording stays on this device." : "No microphone is used."}`);
  const rehearse = brandedPage(ctx, 'Draw, prepare, talk', { footer: 'Rehearsal, not assessed' });
  const summary = brandedPage(ctx, 'Your attempts', { footer: 'Your own tally, remembered for you' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page. Keep it clear that this is practice and not assessed', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  const box = contentBox(rehearse);
  const rx = box.x + RIGHT_X;
  const rw = box.width - RIGHT_X;

  //The card: always on the left, face down until one is drawn
  const face = card(ctx, 'Card', box.x, box.y, 424, box.height);
  const cardType = text(ctx, 'Card type', `{${ON_SHOW} ? cards[current].type : "Your card"}`, box.x + 28, box.y + 28, 368, { fontSize: 14, fontWeight: 700, color: L.muted });
  const cardQ = text(ctx, 'Card question', `{${ON_SHOW} ? cards[current].q : "Draw a card to begin."}`, box.x + 28, box.y + 64, 368, { fontSize: 28, fontWeight: 700, lineHeight: 1.3, autoSize: 'none', height: 280 });
  const cardCount = text(ctx, 'Card count', '{cards.length} cards in the bank. {seen.length} drawn so far.', box.x + 28, box.y + box.height - 44, 368, { fontSize: 14, color: L.muted });
  rehearse.children.push(face, cardType, cardQ, cardCount);

  //A small circular helper: a stage is a frame whose visibility follows the stage variable
  const stageFrame = (name: string, when: string, children: SceneNode[]) => {
    const f = createNode('frame', { name, x: rx, y: box.y, width: rw, height: box.height, fill: null, stroke: null, clip: false, children }) as FrameNode;
    return bind(f, { visible: when });
  };

  //Stage: draw
  const drawHead = heading(ctx, 'Draw heading', 'Draw a card', 0, 0, rw, { fontSize: 24 });
  const drawHelp = text(ctx, 'Draw help', `Draw a random card, get time to prepare, then talk out loud: to a friend, into the voice memo on your phone, or to the room.{${MIC_READY} ? " You can also record yourself while you talk and play it back. The recording stays on this device and is dropped when you save and go on." : " Nothing is recorded here."}`, 0, 44, rw, { fontSize: 17, lineHeight: 1.4 });
  const draw = button(ctx, 'Draw a card', 'Draw a card', 0, 158, 240, true);
  const timerSwitch = bind(button(ctx, 'Timer switch', 'Timers: on', 0, 218, 240, false), { label: 'timersOn ? "Timers: on" : "Timers: off"' });
  timerSwitch.ariaLabel = 'Switch the countdowns on or off';
  const timerHelp = text(ctx, 'Timer help', '{timersOn ? "Preparation " + prepSeconds + " seconds, then " + talkSeconds + " seconds to talk. " : "No countdowns: take as long as you need. "}Switch the timers off if a clock makes it harder.', 0, 280, rw, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
  const toSummary = bind(button(ctx, 'See my summary', 'See my summary', 0, 408, 240, false), { visible: 'attempts.length > 0' });
  const drawStage = stageFrame('Draw stage', 'stage == "draw"', [drawHead, drawHelp, draw, timerSwitch, timerHelp, toSummary]);

  //Stages: prepare and talk share a shape: a clock, a bar, a line of help and one button. The clock itself is a Countdown node in the graph, which writes `left`
  const countdown = (name: string, when: string, title: string, total: string, help: string, label: string, extra: SceneNode[] = []) => {
    const h = heading(ctx, `${name} heading`, title, 0, 0, rw, { fontSize: 24 });
    const clock = text(ctx, `${name} clock`, `{timersOn ? ${CLOCK('left')} : "No timer"}`, 0, 44, rw, { fontSize: 72, fontWeight: 700 });
    const bar = bind(progressBar(ctx, `${name} bar`, 0, 150, rw, { value: 'Math.max(0, left)', max: `Math.max(1, ${total})`, decorative: true }), { visible: 'timersOn' });
    const t = text(ctx, `${name} help`, help, 0, 180, rw, { fontSize: 17, lineHeight: 1.4 });
    const b = button(ctx, `${name} button`, label, 0, 408, 300, true);
    return { frame: stageFrame(`${name} stage`, when, [h, clock, bar, t, b, ...extra]), button: b, clock };
  };
  const prep = countdown('Prepare', 'stage == "prep"', 'Get ready', 'prepSeconds', 'Jot down two or three points, or say your opening line in your head. Start talking when you are ready, or when the clock runs out.', 'I\'m ready, start the talk');
  //The recording step: optional, there only while the microphone is ready (the author ticks it in Project > Microphone and camera). Record, then Stop recording
  const record = bind(button(ctx, 'Record this talk', 'Record this talk', 0, 0, 230, false), { label: recordLabel('talk', 'Record this talk') });
  record.ariaDescription = 'Records your voice while you talk. Asks you first, the first time. The recording stays on this device.';
  const recStatus = text(ctx, 'Record status', `{${recordStatus('talk', 'Optional. Not recorded.')}}`, 244, 2, rw - 244, { fontSize: 14, lineHeight: 1.3, color: L.muted, autoSize: 'none', height: 48 });
  const recStep = bind(createNode('frame', { name: 'Recording step', x: 0, y: 340, width: rw, height: 52, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Record this talk', children: [record, recStatus] }) as FrameNode, { visible: MIC_READY });
  const talk = countdown('Talk', 'stage == "talk"', 'Talk now', 'talkSeconds', 'Talk out loud now: to a friend, into a voice memo on your phone, or to the room. Keep going until the clock stops, or press the button when you are done.', 'I\'ve finished', [recStep]);

  //Stage: the delivery tally
  const tallyHead = heading(ctx, 'Tally heading', 'Delivery tally', 0, 0, rw, { fontSize: 24 });
  const tallyHelp = text(ctx, 'Tally help', `{${rec('talk').has} ? "Play your recording while you tap what you noticed." : "Think back, or play your voice memo."} Tap what you noticed. It is your own reflection, not a measurement.`, 0, 38, rw, { fontSize: 15, color: L.muted, lineHeight: 1.4 });
  const counter = (name: string, label: string, v: typeof fillers, y: number) => {
    const row = card(ctx, `${name} row`, 0, y, rw, 48);
    const l = text(ctx, `${name} label`, label, 16, y + 13, 250, { fontSize: 17, fontWeight: 600 });
    const minus = button(ctx, `${name} fewer`, '−', rw - 170, y + 4, 40, false);
    minus.ariaLabel = `One fewer: ${label}`;
    const n = text(ctx, `${name} count`, `{${v.name}}`, rw - 124, y + 8, 56, { fontSize: 24, fontWeight: 700, align: 'center' });
    const plus = button(ctx, `${name} more`, '+', rw - 52, y + 4, 40, true);
    plus.ariaLabel = `One more: ${label}`;
    return { nodes: [row, l, minus, n, plus] as SceneNode[], minus, plus, v };
  };
  const fill = counter('Fillers', 'Filler words (um, like)', fillers, 92);
  const paus = counter('Pauses', 'Long pauses', pauses, 148);
  const flag = (name: string, label: string, v: typeof opening, y: number) => {
    const bg = createNode('frame', { name, x: 0, y, width: rw, height: 48, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false, role: 'checkbox', focusable: true, cursor: 'pointer', ariaLabel: label }) as FrameNode;
    const box22 = createNode('rect', { name: `${name} box`, x: 14, y: 13, width: 22, height: 22, cornerRadius: 6, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true });
    bind(box22, { 'fill.color': `${v.name} ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `${v.name} ? "${L.primary}" : "${L.border}"` });
    const mark = bind(text(ctx, `${name} mark`, '✓', 18, 12, 18, { fontSize: 16, fontWeight: 700, color: L.onButton, decorative: true }), { visible: v.name });
    const l = text(ctx, `${name} label`, label, 50, 13, rw - 64, { fontSize: 17, fontWeight: 600, decorative: true });
    bg.children = [box22, mark, l];
    bind(bg, { ariaChecked: v.name });
    return bg;
  };
  const openRow = flag('Clear opening', 'Clear opening: I said what I would talk about', opening, 212);
  const closeRow = flag('Clear close', 'Clear close: I finished on a clear final sentence', closing, 268);
  //The replay step: the learner's recording plays here while they tally, only when there is one
  const playTalk = bind(button(ctx, 'Play my talk', 'Play my talk', 0, 0, 170, false), { label: playLabel('talk', 'Play my talk'), ariaLabel: `${rec('talk').playing} ? "Stop my recording" : "Play my recording"` });
  const replayNote = text(ctx, 'Replay note', 'Stays on this device. Dropped when you save and go on.', 190, 2, rw - 190, { fontSize: 13, lineHeight: 1.3, color: L.muted, autoSize: 'none', height: 44 });
  const replaySlot = bind(createNode('frame', { name: 'Replay step', x: 0, y: 336, width: rw, height: 48, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Play my recording', children: [playTalk, replayNote] }) as FrameNode, { visible: `${MIC_READY} && ${rec('talk').has}` });
  const toModel = button(ctx, 'To the model answer', 'Compare with the model answer', 0, 408, 330, true);
  const tallyStage = stageFrame('Tally stage', 'stage == "tally"', [tallyHead, tallyHelp, ...fill.nodes, ...paus.nodes, openRow, closeRow, replaySlot, toModel]);

  //Stage: the model answer and the points
  const modelHead = heading(ctx, 'Model heading', 'A model answer', 0, 0, rw, { fontSize: 20 });
  const modelCard = card(ctx, 'Model panel', 0, 28, rw, 150);
  const model = text(ctx, 'Model answer', `{${ON_SHOW} ? cards[current].model : ""}`, 16, 40, rw - 32, { fontSize: 15, lineHeight: 1.35, autoSize: 'none', height: 130 });
  const pointsHead = heading(ctx, 'Points heading', 'Points a good answer makes. Tick the ones you made.', 0, 188, rw, { fontSize: 17 });
  const { list: points, row: pointRow } = tickList(ctx, 'Points', 'Point row', 0, 214, rw, { items: `${ON_SHOW} ? cards[current].points : []`, ticked: covered, ariaLabel: 'Points a good answer makes', rows: 4, background: false });
  const madeCount = text(ctx, 'Points made', `Points made: {covered.length} of {${ON_SHOW} ? cards[current].points.length : 0}`, 0, 374, rw, { fontSize: 15, color: L.muted });
  const saveNext = button(ctx, 'Save and next card', 'Save, then next card', 0, 408, (rw - 10) / 2, true);
  const saveSummary = button(ctx, 'Save and see summary', 'Save, see my summary', (rw - 10) / 2 + 10, 408, (rw - 10) / 2, false);
  const compareStage = stageFrame('Compare stage', 'stage == "compare"', [modelHead, modelCard, model, pointsHead, points, madeCount, saveNext, saveSummary]);

  rehearse.children.push(drawStage, prep.frame, talk.frame, tallyStage, compareStage);

  //The wiring
  const g = new Graph(rehearse);
  g.run(g.start('A fresh start each time the page opens'), resetVars(stage, left));

  //The talk stage, from the end of the preparation (its clock ran out, or Ready early): a talk countdown that ends in the tally
  const talkNode = g.add('action.setVariable', { variable: stage.id, op: 'set', value: '"talk"' });
  const talkSaid = g.add('action.announce', { text: 'timersOn ? "Time to talk. " + talkSeconds + " seconds." : "Talk now. Press I have finished when you are done."', politeness: 'polite' }, talkNode);
  const talkTimed = g.add('logic.if', { condition: 'timersOn' }, talkSaid);
  const talkClock = g.add('action.clock', { variable: left.id, op: 'start', mode: 'down', seconds: 'talkSeconds' }, talkTimed, 'true');
  g.run(g.add('action.setVariable', { variable: stage.id, op: 'set', value: '"tally"' }, talkClock, 'done'), announce('"Time is up. Tally how it went."'));

  graphNote(rehearse, { anchor: talkNode, colour: 'sky', text: '**Two ways into the talk, one chain.** The prep clock\'s **Time up** output and Ready early both land here, so the talk stage is written once. The talk clock\'s own **Time up** moves on to the tally.' });

  //Draw: a random card from the pool (never one already drawn until the whole bank has been, then a fresh round), then into preparation with its own countdown
  const onDraw = g.click(draw, 'Draw a random card');
  const drawn = g.run(
    onDraw,
    set(seen, 'cards.every((c, i) => seen.includes(i)) ? [] : seen'),
    set(current, 'pool[Math.floor(Math.random() * pool.length)]'),
    setVar(seen, 'current', 'push'),
    resetVars(fillers, pauses, opening, closing, covered, left),
    set(stage, '"prep"'),
    announce('"Your card: " + cards[current].q + (timersOn ? " You have " + prepSeconds + " seconds to prepare." : " Take as long as you need to prepare.")'),
  );
  graphNote(rehearse, { anchor: onDraw, colour: 'sky', text: '**A card never repeats until the bank is used up.** The live `pool` leaves out `seen` and the current card, and once every card has been seen `seen` is emptied first so a new round starts. [ ] Add cards to `cards`.' });
  const prepTimed = g.add('logic.if', { condition: 'timersOn' }, drawn);
  const prepClock = g.add('action.clock', { variable: left.id, op: 'start', mode: 'down', seconds: 'prepSeconds' }, prepTimed, 'true');
  //The preparation clock running out starts the talk, the same as Ready early does
  join(rehearse, prepClock, talkNode, 'done');
  g.gap(60);
  const onTimers = g.click(timerSwitch, 'Timers on or off');
  graphNote(rehearse, { anchor: onTimers, colour: 'sky', text: '**Timers off only flips timersOn.** Both Ifs read it, so neither clock starts and the learner moves on with the buttons. It is there for anyone a strict clock stresses.' });
  g.run(onTimers, toggleVar(timersOn), announce('timersOn ? "Timers on." : "Timers off. Take as long as you need."'));
  g.run(g.click(toSummary, 'See the summary'), goNext());

  //Ready early starts the talk by hand (a new Start on the same clock takes over from the preparation one)
  join(rehearse, g.click(prep.button, 'Ready early'), talkNode);
  g.run(g.click(talk.button, 'Finished early'), ['action.clock', { variable: left.id, op: 'reset', mode: 'down', seconds: '0' }], set(stage, '"tally"'), announce('"Tally how it went."'));

  //The optional recording: one button records and stops, the take ends when the talk stage is left (the clock ran out, or Finished early), plays back on
  //the tally stage (one button, Stop while it plays), and is dropped on the next card
  recordToggle(g, record, 'talk', 'Record this talk, or stop');
  graphNote(rehearse, { anchor: labelled(rehearse, /^Record this talk, or stop$/), colour: 'sky', text: '**Recording is off as shipped.** These flows only run once Microphone is ticked in Project > Microphone and camera, and the record layers stay hidden until the learner says yes. [ ] Tick it and say what it is for.' });
  stopTakeWhen(g, stage, 'talk', 'stage != "talk"', 'End the take when the talk stage is left');
  playToggle(g, playTalk, 'talk', 'Play or stop my talk');
  dropTakeWhen(g, stage, 'talk', '(stage == "draw" || stage == "prep")', 'Drop the take on the next card');
  g.gap(40);

  //The tally counters and flags
  const bump = (btn: SceneNode, v: typeof fillers, delta: 1 | -1, what: string) =>
    g.run(g.click(btn, `${what}${delta > 0 ? ' more' : ' fewer'}`), set(v, delta > 0 ? `${v.name} + 1` : `Math.max(0, ${v.name} - 1)`));
  bump(fill.plus, fillers, 1, 'Filler words');
  bump(fill.minus, fillers, -1, 'Filler words');
  bump(paus.plus, pauses, 1, 'Long pauses');
  bump(paus.minus, pauses, -1, 'Long pauses');
  graphNote(rehearse, { anchor: labelled(rehearse, /^Filler words more$/), colour: 'sky', text: '**Four tally buttons, one pattern:** plus adds one and minus stops at 0. The tally is the learner\'s own reflection, never a measurement, because nothing here listens.' });
  g.run(g.click(openRow, 'Clear opening'), toggleVar(opening));
  g.run(g.click(closeRow, 'Clear close'), toggleVar(closing));
  g.run(g.click(toModel, 'To the model answer'), set(stage, '"compare"'), announce('"Model answer and points shown. Tick the points you made."'));

  //The points
  g.run(g.click(pointRow, 'Tick or untick a point'), toggleItem(covered, 'event.index'));

  //Saving an attempt: one row in the remembered list. The page then goes back to draw, or to the summary
  const save = setVar(attempts, '{n: attempts.length + 1, type: cards[current].type, q: cards[current].q, fillers: fillers, pauses: pauses, opening: clearOpening, close: clearClose, made: covered.length, of: cards[current].points.length}', 'push');
  g.run(g.click(saveNext, 'Save this attempt and go on'), save, set(stage, '"draw"'), announce('"Attempt " + attempts.length + " saved. Draw another card when you are ready."'));
  g.run(g.click(saveSummary, 'Save this attempt and see the summary'), save, set(stage, '"draw"'), goNext());
  graphNote(rehearse, { anchor: labelled(rehearse, /^Save this attempt and go on$/), colour: 'sky', text: '**Both save buttons share one Set variable**, which adds a row to `attempts`. That list is remembered (it survives a reload) and is all the summary page reads.' });

  checklist.push(
    item('Write your bank of cards: Project > Variables > "cards". Each card has a type (the label on it), q (the question or topic), model (a short model answer) and points (up to four things a good answer makes). The six samples cover a viva, an interview and a short talk. Delete or replace them', cardQ, rehearse),
    item('Set the timers: Project > Variables > "timersOn" (false switches the countdowns off for everyone), "prepSeconds" (30) and "talkSeconds" (60). Longer times are an accessibility adjustment, so offer them. Learners also get a Timers on or off button on the first stage', timerSwitch, rehearse),
    item('Check the tally wording on the tally stage: filler words, long pauses, clear opening, clear close. Change the labels to suit your task (for example, "Used a technical term correctly"). It is the learner\'s own reflection, so do not describe it as a measurement', fill.nodes[0], rehearse),
    item('Tell learners where to talk: the help text on the draw, prepare and talk stages. They talk to a friend, a voice memo on their phone or the room. With recording switched on (see the item for it) the draw stage says they can record themselves too', drawHelp, rehearse),
    item('Check the summary page: the attempts are the remembered variable "attempts", so they are still there on the next visit (inside StudyDesk they go with the learner\'s record, otherwise they stay in that browser). "Clear my history" empties them', byName(summary, 'Attempts'), summary),
    item('OPTIONAL RECORDING: it is off as shipped, so nothing is recorded and the record and replay layers never show. To offer it, tick Microphone in Project > Microphone and camera and write the one-sentence purpose that fills in "It is used to ...". Then "Record this talk" appears on the talk stage and "Play my talk" on the tally stage, for learners whose microphone works. Anyone who says no, has no microphone or chooses "Do not use my microphone or camera" rehearses exactly as before. The recording stays in the learner\'s browser, is dropped when they save and go on, and is never sent', recStep, rehearse),
    item('Keep it rehearsal, not assessment: nothing is scored or sent, and a graded viva belongs in a live conversation or a Moodle recorded answer instead. Say so on the first page if you use this for an assessed task', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page),
  );

  //The summary: the numbers across attempts, then the last six
  const sb = contentBox(summary);
  const empty = text(ctx, 'Empty note', '{attempts.length == 0 ? "No attempts yet. Draw a card and give it a go." : ""}', sb.x, sb.y, sb.width, { fontSize: 18, color: L.muted });
  const tileW = (sb.width - 48) / 4;
  const tile = (i: number, name: string, value: string, label: string) => {
    const c = card(ctx, `${name} tile`, sb.x + i * (tileW + 16), sb.y + 32, tileW, 96);
    const v = text(ctx, name, `{${value}}`, sb.x + i * (tileW + 16) + 16, sb.y + 44, tileW - 32, { fontSize: 28, fontWeight: 700 });
    const l = text(ctx, `${name} label`, label, sb.x + i * (tileW + 16) + 16, sb.y + 92, tileW - 32, { fontSize: 14, color: L.muted });
    summary.children.push(c, v, l);
  };
  const tileList: [string, string, string][] = [
    ['Attempts', 'attempts.length', 'Attempts so far'],
    ['Fillers', 'attempts.length > 1 ? attempts[0].fillers + " to " + attempts[attempts.length - 1].fillers : attempts.length == 1 ? attempts[0].fillers : "-"', 'Filler words, first to latest'],
    ['Openings', 'attempts.filter(a => a.opening).length + " of " + attempts.length', 'Clear openings'],
    ['Closes', 'attempts.filter(a => a.close).length + " of " + attempts.length', 'Clear closes'],
  ];
  summary.children.push(empty);
  tileList.forEach(([n, v, l], i) => tile(i, n, v, l));

  //The table: a header and the last six attempts (a repeater over the end of the list)
  const COLS: [string, number, number][] = [['No.', 12, 50], ['Card', 70, 300], ['Fillers', 390, 80], ['Pauses', 480, 80], ['Opening', 570, 100], ['Close', 680, 100], ['Points', 790, 130]];
  const headY = sb.y + 140;
  COLS.forEach(([label, x, w]) => summary.children.push(text(ctx, `Header ${label}`, label, sb.x + x, headY, w, { fontSize: 14, fontWeight: 700, color: L.muted })));
  const cell = (label: string, value: string, x: number, w: number) => text(ctx, `Cell ${label}`, `{${value}}`, x, 9, w, { fontSize: 15, autoSize: 'none', height: 22, overflow: 'ellipsis' });
  const rowFrame = createNode('frame', {
    name: 'Attempt row',
    x: 0,
    y: 0,
    width: sb.width,
    height: 38,
    cornerRadius: 10,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    children: [
      cell('No.', 'item.n', 12, 50),
      cell('Card', 'item.q', 70, 300),
      cell('Fillers', 'item.fillers', 390, 80),
      cell('Pauses', 'item.pauses', 480, 80),
      cell('Opening', 'item.opening ? "Yes" : "No"', 570, 100),
      cell('Close', 'item.close ? "Yes" : "No"', 680, 100),
      cell('Points', 'item.made + " of " + item.of', 790, 130),
    ],
  }) as FrameNode;
  bind(rowFrame, { ariaLabel: '"Attempt " + item.n + ": " + item.fillers + " filler words, " + item.pauses + " long pauses, opening " + (item.opening ? "clear" : "not clear") + ", close " + (item.close ? "clear" : "not clear") + ", " + item.made + " of " + item.of + " points"' });
  rowFrame.role = 'region';
  const rows = createNode('frame', { name: 'Attempts', x: sb.x, y: headY + 26, width: sb.width, height: 248, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your last six attempts', repeat: { items: 'attempts.slice(-6)', layout: 'grid', gap: 4, columns: 1 }, children: [rowFrame] }) as FrameNode;
  const another = button(ctx, 'Draw another card', 'Draw another card', sb.x, barY(sb), 240, true);
  const clear = bind(button(ctx, 'Clear my history', 'Clear my history', sb.x + 256, barY(sb), 220, false), { visible: 'attempts.length > 0' });
  summary.children.push(rows, another, clear);
  const sg = new Graph(summary);
  sg.run(sg.click(another, 'Draw another card'), goPrevious());
  sg.run(sg.click(clear, 'Clear my history'), clearVar(attempts), clearVar(seen), announce('"History cleared."'));
  graphNote(summary, { anchor: labelled(summary, /^Draw another card$/), colour: 'sky', text: '**Clear my history empties attempts and seen**, so the card bank starts fresh as well as the table.' });

  //Notes for whoever edits the template, below each page
  const below = (page: typeof rehearse, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(rehearse, { ...below(rehearse, 0, 440), text: '**Countdowns** are the native Countdown / clock node: its Time up output moves on, so there is no one second timer and no Set step for the clock. The same variable `left` serves both stages.', colour: 'sky' });
  addNote(rehearse, { ...below(rehearse, 456, 440), text: '**Live variable** `pool` is the cards still to draw, never the one just drawn. [ ] Write your own bank in `cards`.', colour: 'gold' });
  addNote(summary, { ...below(summary, 0, 440), text: '**Remembered** `attempts` keeps its value across visits (inside StudyDesk it goes with the learner\'s record), so the summary survives a reload.', colour: 'sky' });
  return { project, checklist };
}

/** States for the layout check: the tally and model stages, and the summary with six attempts. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'tally', page: 'Draw, prepare, talk', vars: { stage: 'tally', current: 0, fillers: 12, pauses: 3, clearOpening: true, clearClose: true } },
  { label: 'model answer', page: 'Draw, prepare, talk', vars: { stage: 'compare', current: 4, covered: [0, 1] } },
  { label: 'six attempts', page: 'Your attempts', vars: { attempts: Array.from({ length: 6 }, (_, i) => ({ n: i + 1, type: 'Viva question', q: 'Why did you choose this method?', fillers: 14, pauses: 2, opening: true, close: false, made: 3, of: 4 })) } },
];

export const timedTalk: BrandedStarter = {
  key: 'practice/timed-talk-rehearsal',
  set: 'practice',
  name: 'Timed talk rehearsal',
  description: 'Practise a viva answer, an interview answer or a one-minute talk with no microphone. The learner draws a random card from your bank, gets a preparation countdown and a speaking timer (switch the timers off or lengthen them), tallies their own delivery (fillers, long pauses, a clear opening and close), compares with a model answer and points checklist, and sees a summary across attempts that is remembered. Rehearsal only, nothing is scored.',
  tags: ['speaking', 'viva', 'interview', 'timer', 'rehearsal'],
  build,
  layoutStates: LAYOUT_STATES,
};
