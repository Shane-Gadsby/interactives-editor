//Shadow the model: a few phrase cards for pronunciation and intonation practice. Each card plays a model clip (with a Slow switch), the learner taps
//Record and says it, then plays their own take or the model and their take back to back, ticks an author-written self-check (stress, rising tone for a
//question, every sound there) and rates themselves. It is self assessment: nothing detects anything, nothing is scored, and nothing leaves the device.
//
//One recording name ("take") serves every card. It is dropped when the learner moves to the next card and is gone on a reload, and the page says so.
//The model clip comes from the card's own "sound" field through Play sound's "Sound from expression", so the author's cards are one list and one set
//of nodes. (Recording names are fixed text, not expressions, so a recording per card would need a hand-wired set of nodes per card; one take keeps
//the cards a plain list and keeps the memory in use small.)
//
//The microphone is the author's declaration (Project > Microphone and camera). When it is not ready (not declared, denied, no device, the course page
//does not allow it, or the learner chose not to use it) the page shows the plain version: listen, say it aloud, then the same self-check. That is the
//way to finish without a microphone that the accessibility check looks for, and it is the whole activity for anyone who cannot or would rather not record.
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, go, heroPage, set, spreadPages } from '../games/common';
import { addPlaceholderSound, type Note } from '../media/sounds';
import { MIC_READY, rec, recordStatus, dropTakeWhen, wirePlay, wireRecord } from './recording';

const SLOW = 0.7;
const RIGHT_X = 456;

//The sample cards. checks are what the author wants listened for (up to four); the placeholder tone for each card follows the rise and fall of the
//phrase so the pitch contour is something to shadow before the author swaps in a real voice
const CARDS: { phrase: string; note: string; checks: string[]; tone: Note[] }[] = [
  {
    phrase: 'Could you explain that again, please?',
    note: 'A polite question. Stress "explain", and let your voice rise a little on "please".',
    checks: ['Stressed "explain" more than the words around it', 'Voice rose at the end, like a question', 'Said every word, including "that" and "please"'],
    tone: [
      { hz: 392, ms: 160, gap: 30 },
      { hz: 392, ms: 120, gap: 30 },
      { hz: 440, ms: 140, gap: 20 },
      { hz: 523, ms: 260, gap: 60 },
      { hz: 440, ms: 130, gap: 30 },
      { hz: 440, ms: 110, gap: 20 },
      { hz: 494, ms: 220, gap: 80 },
      { hz: 587, ms: 420 },
    ],
  },
  {
    phrase: 'I would like to book an appointment for Thursday.',
    note: 'A statement, so the voice falls at the end. Listen for the soft "th" at the start of Thursday.',
    checks: ['Stressed "book" and "Thursday"', 'Voice fell at the end', 'Said the "th" in Thursday as a soft "th", not a "t"'],
    tone: [
      { hz: 440, ms: 120, gap: 20 },
      { hz: 440, ms: 130, gap: 20 },
      { hz: 440, ms: 100, gap: 30 },
      { hz: 587, ms: 240, gap: 50 },
      { hz: 440, ms: 110, gap: 20 },
      { hz: 440, ms: 220, gap: 40 },
      { hz: 392, ms: 120, gap: 20 },
      { hz: 523, ms: 260, gap: 30 },
      { hz: 330, ms: 480 },
    ],
  },
  {
    phrase: 'Where is the library?',
    note: 'A question that starts with "where" usually falls at the end, it does not rise. Say all three syllables of "library".',
    checks: ['Voice fell at the end', 'Stressed "library"', 'Said all three syllables of "library"'],
    tone: [
      { hz: 523, ms: 240, gap: 50 },
      { hz: 440, ms: 120, gap: 30 },
      { hz: 440, ms: 100, gap: 30 },
      { hz: 587, ms: 240, gap: 30 },
      { hz: 392, ms: 160, gap: 30 },
      { hz: 330, ms: 420 },
    ],
  },
  {
    phrase: 'That is a really interesting idea.',
    note: 'Put the feeling on "really" and on "interesting", and let your voice fall at the end.',
    checks: ['Stressed "really" and "interesting"', 'Said "interesting" with its beats, IN-tres-ting', 'Voice fell at the end'],
    tone: [
      { hz: 440, ms: 150, gap: 20 },
      { hz: 440, ms: 120, gap: 20 },
      { hz: 392, ms: 100, gap: 30 },
      { hz: 659, ms: 300, gap: 40 },
      { hz: 587, ms: 220, gap: 20 },
      { hz: 440, ms: 120, gap: 20 },
      { hz: 440, ms: 140, gap: 40 },
      { hz: 392, ms: 140, gap: 20 },
      { hz: 330, ms: 480 },
    ],
  },
];

const RATINGS = ['Not yet', 'Getting there', 'Nailed it'];
//The model clip's own sound field, through Play sound's "Sound from expression"
const MODEL = 'cards[current].sound';

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Shadow the model');
  const { project, L } = ctx;
  //The microphone is the author's declaration; with it unticked every learner gets the plain version
  project.settings.sensors = { microphone: true, purpose: 'record yourself saying each phrase, so you can hear it next to the model', maxSeconds: 30 };

  const sounds = CARDS.map((c, i) => addPlaceholderSound(project, `Card ${i + 1} model (replace).wav`, c.tone));
  const stage = addVar(project, 'stage', 'string', 'listen');
  addVar(project, 'cards', 'list', CARDS.map((c, i) => ({ phrase: c.phrase, note: c.note, sound: sounds[i], checks: c.checks })));
  const current = addVar(project, 'current', 'number', 0);
  const slow = addVar(project, 'slow', 'boolean', false);
  const busy = addVar(project, 'busy', 'boolean', false);
  const checked = addVar(project, 'checked', 'list', []);
  const rating = addVar(project, 'rating', 'number', -1);
  const results = addVar(project, 'results', 'list', []);

  const hero = heroPage(ctx, 'Shadow the model', 'Hear a model say a phrase, say it yourself, then listen to both. If you record yourself, the recording stays on this device and is gone when you reload.');
  const practice = brandedPage(ctx, 'Listen, say it, compare', { footer: 'Practice, not assessed. Your recording is never sent or kept' });
  const end = brandedPage(ctx, 'Your results', { footer: 'Your own self-check. Nothing was scored or sent' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(practice));
  const intro = hero.page.children.find((n) => n.name === 'Subtitle');

  const box = contentBox(practice);
  const rx = box.x + RIGHT_X;
  const rw = box.width - RIGHT_X;

  //The card, on the left: which one, the phrase (its own transcript), what to listen for, and where a recording goes
  const face = card(ctx, 'Card', box.x, box.y, 424, box.height);
  const count = text(ctx, 'Card count', 'Card {current + 1} of {cards.length}', box.x + 28, box.y + 28, 368, { fontSize: 14, fontWeight: 700, color: L.muted });
  const phrase = text(ctx, 'Phrase', '{cards[current].phrase}', box.x + 28, box.y + 58, 368, { fontSize: 30, fontWeight: 700, lineHeight: 1.3, autoSize: 'none', height: 170 });
  const listenLabel = text(ctx, 'Listen for label', 'Listen for', box.x + 28, box.y + 236, 368, { fontSize: 14, fontWeight: 700, color: L.muted });
  const listenFor = text(ctx, 'Listen for', '{cards[current].note}', box.x + 28, box.y + 260, 368, { fontSize: 17, lineHeight: 1.4, autoSize: 'none', height: 100 });
  const where = text(
    ctx,
    'Where recordings go',
    `{${MIC_READY} ? "Your recording stays on this device. It is never sent or saved, it is dropped when you go to the next card, and it is gone if you reload this page." : "Nothing is recorded here. Say the phrase out loud, then check yourself."}`,
    box.x + 28,
    box.y + box.height - 76,
    368,
    { fontSize: 14, lineHeight: 1.35, color: L.muted, autoSize: 'none', height: 58 },
  );
  practice.children.push(face, count, phrase, listenLabel, listenFor, where);

  //Step 1, always there: listen to the model, slowly if you like, and stop
  const step1 = text(ctx, 'Step 1', '1. Listen to the model', rx, box.y, rw, { fontSize: 16, fontWeight: 700 });
  const playModel = bind(button(ctx, 'Play model', 'Play model', rx, box.y + 26, 150, true), { disabled: rec('take').recording });
  playModel.ariaLabel = 'Play the model';
  const slowSwitch = bind(button(ctx, 'Slow switch', 'Slow: off', rx + 160, box.y + 26, 150, false), { label: 'slow ? "Slow: on" : "Slow: off"' });
  slowSwitch.ariaDescription = 'Plays the model at a slower speed, with the pitch kept. Applies the next time you press Play model.';
  const stopAll = button(ctx, 'Stop', 'Stop', rx + 320, box.y + 26, 100, false);
  stopAll.ariaLabel = 'Stop playing';
  practice.children.push(step1, playModel, slowSwitch, stopAll);

  const stageFrame = (name: string, when: string, children: SceneNode[]) => {
    const f = createNode('frame', { name, x: rx, y: box.y + 90, width: rw, height: box.height - 90, fill: null, stroke: null, clip: false, children }) as FrameNode;
    return bind(f, { visible: when });
  };
  const bottom = box.height - 90 - 46;

  //Stage: say it (the microphone version, and the plain version for anyone without one)
  const step2 = text(ctx, 'Step 2', '2. Say it', 0, 0, rw, { fontSize: 16, fontWeight: 700 });
  const record = bind(button(ctx, 'Record', 'Record', 0, 26, 200, true), {
    label: `${rec('take').recording} ? "Stop recording" : ${rec('take').has} ? "Record again" : "Record"`,
    visible: MIC_READY,
  });
  record.ariaDescription = 'Records your voice. Asks you first, the first time.';
  const status = bind(text(ctx, 'Record status', `{${recordStatus('take')}}`, 214, 28, rw - 214, { fontSize: 14, lineHeight: 1.3, color: L.muted, autoSize: 'none', height: 44 }), { visible: MIC_READY });
  const mine = bind(button(ctx, 'Play mine', 'Play mine', 0, 82, 150, false), { visible: `${MIC_READY} && ${rec('take').has}`, disabled: rec('take').recording });
  mine.ariaLabel = 'Play my recording';
  const tip = bind(text(ctx, 'Echo tip', 'Try it like an echo: play the model, then say it straight after, the same way.', 0, 148, rw, { fontSize: 15, color: L.muted, lineHeight: 1.4 }), { visible: MIC_READY });
  const plain = bind(
    text(ctx, 'Plain version', `{"Play the model as often as you like. Then say the phrase out loud, with it and after it, as many times as you like." + (mediaMessage != "" ? " " + mediaMessage : "")}`, 0, 26, rw, { fontSize: 17, lineHeight: 1.4, autoSize: 'none', height: 130 }),
    { visible: `!(${MIC_READY})` },
  );
  const check = button(ctx, 'Check myself', 'Check myself', 0, bottom, 240, true);
  const sayStage = stageFrame('Say stage', 'stage == "listen"', [step2, record, status, mine, tip, plain, check]);

  //Stage: compare and check yourself
  const step3 = text(ctx, 'Step 3', '3. Compare, then check yourself', 0, 0, rw, { fontSize: 16, fontWeight: 700 });
  const mine2 = bind(button(ctx, 'Play mine again', 'Play mine', 0, 26, 150, false), { visible: MIC_READY, disabled: `!(${rec('take').has})` });
  mine2.ariaLabel = 'Play my recording';
  const both = bind(button(ctx, 'Model then mine', 'Model, then mine', 160, 26, 210, true), { visible: MIC_READY, disabled: `!(${rec('take').has})` });
  both.ariaDescription = 'Plays the model, then your recording straight after it.';
  const noTake = bind(text(ctx, 'No take note', 'No recording yet, so go back to the card to make one.', 380, 36, rw - 380, { fontSize: 13, color: L.muted, lineHeight: 1.2, autoSize: 'none', height: 40 }), { visible: `${MIC_READY} && !(${rec('take').has})` });
  const plain2 = bind(text(ctx, 'Plain compare', 'Play the model again and say it with it. Then tick what you managed.', 0, 26, rw, { fontSize: 15, color: L.muted, lineHeight: 1.4, autoSize: 'none', height: 44 }), { visible: `!(${MIC_READY})` });
  const checkHead = heading(ctx, 'Check heading', 'Self-check: tick what you managed', 0, 80, rw, { fontSize: 16 });
  const tick = createNode('rect', { name: 'Tick box', x: 6, y: 6, width: 22, height: 22, cornerRadius: 6, fill: solid(L.background), stroke: stroke(L.border, 2), decorative: true });
  bind(tick, { 'fill.color': `checked.includes(index) ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `checked.includes(index) ? "${L.button}" : "${L.border}"` });
  const tickMark = bind(text(ctx, 'Tick mark', '✓', 10, 5, 18, { fontSize: 16, fontWeight: 700, color: L.onButton, decorative: true }), { visible: 'checked.includes(index)' });
  const checkText = text(ctx, 'Check point', '{item}', 40, 6, rw - 52, { fontSize: 16, decorative: true });
  const checkRow = createNode('frame', { name: 'Check row', x: 0, y: 0, width: rw, height: 34, cornerRadius: 8, fill: solid(L.background), stroke: null, clip: false, role: 'checkbox', focusable: true, cursor: 'pointer', children: [tick, tickMark, checkText] }) as FrameNode;
  bind(checkRow, { ariaChecked: 'checked.includes(index)', ariaLabel: 'item', 'fill.color': `checked.includes(index) ? "${L.surface}" : "${L.background}"` });
  const checks = createNode('frame', { name: 'Checks', x: 0, y: 104, width: rw, height: 148, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Self-check', repeat: { items: 'cards[current].checks', layout: 'grid', gap: 4, columns: 1 }, children: [checkRow] }) as FrameNode;
  const rateHead = heading(ctx, 'Rating heading', 'How did it go?', 0, 258, rw, { fontSize: 16 });
  const RW = (rw - 20) / 3;
  const dots = RATINGS.map((label, k) => {
    const dot = createNode('frame', {
      name: `Rating ${label}`,
      x: k * (RW + 10),
      y: 0,
      width: RW,
      height: 38,
      cornerRadius: 19,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'radio',
      focusable: true,
      cursor: 'pointer',
      ariaLabel: label,
      children: [text(ctx, 'Rating label', label, 0, 7, RW, { fontSize: 15, fontWeight: 700, align: 'center', decorative: true, height: 24, autoSize: 'none' })],
    }) as FrameNode;
    bind(dot, { ariaChecked: `rating == ${k}`, 'fill.color': `rating == ${k} ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `rating == ${k} ? "${L.button}" : "${L.border}"` });
    bind(dot.children[0], { color: `rating == ${k} ? "${L.onButton}" : "${L.text}"` });
    return dot;
  });
  const scale = createNode('frame', { name: 'Rating scale', x: 0, y: 282, width: rw, height: 38, fill: null, stroke: null, clip: false, role: 'radiogroup', ariaLabel: 'How did it go for you', children: dots }) as FrameNode;
  const back = button(ctx, 'Back to the card', 'Back to the card', 0, bottom, 190, false);
  const next = bind(button(ctx, 'Next card', 'Next card', 200, bottom, rw - 200, true), { visible: 'current < cards.length - 1' });
  const finish = bind(button(ctx, 'See my results', 'See my results', 200, bottom, rw - 200, true), { visible: 'current >= cards.length - 1' });
  const checkStage = stageFrame('Check stage', 'stage == "check"', [step3, mine2, both, noTake, plain2, checkHead, checks, rateHead, scale, back, next, finish]);

  practice.children.push(sayStage, checkStage);

  //The wiring
  const g = new Graph(practice);
  g.run(g.start('A fresh start each time the page opens'), set(stage, '"listen"'), set(busy, 'false'));

  //Play the model: the card's own clip, at the Slow speed when it is on, with the pitch kept
  g.run(g.click(playModel, 'Play the model'), ['action.sound', { source: MODEL, speed: `slow ? ${SLOW} : 1`, keepPitch: true, solo: true, continue: 'start' }]);
  g.run(g.click(slowSwitch, 'Slow on or off'), set(slow, '!slow'), announce('slow ? "Slow on. The model plays slower." : "Slow off."'));
  const onStop = g.run(g.click(stopAll, 'Stop everything playing'), set(busy, 'false'), ['action.stopSound', {}]);
  const playing = g.add('logic.if', { condition: rec('take').playing }, onStop);
  g.add('action.recordPlay', { op: 'stop', slot: 'take' }, playing, 'true');
  g.gap(80);

  //Record, then play mine
  wireRecord(g, record, 'take', 'Record, or stop recording');
  wirePlay(g, mine, 'take', 'Play mine');
  wirePlay(g, mine2, 'take', 'Play mine');

  //The model, then the take straight after. Stop sets busy false first, and the second half only plays if it is still true
  const onBoth = g.click(both, 'Model, then mine');
  const setBusy = g.add('action.setVariable', { variable: busy.id, op: 'set', value: 'true' }, onBoth);
  const quiet = g.add('action.recordPlay', { op: 'stop', slot: 'take' }, setBusy);
  const model = g.add('action.sound', { source: MODEL, speed: `slow ? ${SLOW} : 1`, keepPitch: true, solo: true, continue: 'end' }, quiet);
  const still = g.add('logic.if', { condition: 'busy' }, model);
  const mineNow = g.add('action.recordPlay', { op: 'play', slot: 'take', volume: 1, continue: 'end' }, still, 'true');
  g.add('action.setVariable', { variable: busy.id, op: 'set', value: 'false' }, mineNow);
  g.gap(80);

  //A take is dropped when the learner moves to another card
  dropTakeWhen(g, current, 'take', 'true', 'Drop the take when the card changes');

  g.run(g.click(check, 'Check myself'), ['action.stopSound', {}], set(stage, '"check"'), announce('"Compare, then tick what you managed and say how it went."'));
  g.run(g.click(back, 'Back to the card'), ['action.stopSound', {}], set(busy, 'false'), set(stage, '"listen"'), announce('"Back to the card."'));

  //The self-check ticks
  const onTick = g.click(checkRow, 'Tick or untick a point');
  const has = g.add('logic.if', { condition: 'checked.includes(event.index)' }, onTick);
  g.add('action.setVariable', { variable: checked.id, op: 'remove', value: 'checked.indexOf(event.index)' }, has, 'true');
  g.add('action.setVariable', { variable: checked.id, op: 'push', value: 'event.index' }, has, 'false', { dy: 70 });
  g.gap(80);

  dots.forEach((d, k) => g.run(g.click(d, `Rate: ${RATINGS[k]}`), set(rating, String(k)), announce(`"Rated: ${RATINGS[k]}."`)));

  //Saving the card: one row in the results, then on to the next card (or the results)
  const save = ['action.setVariable', { variable: results.id, op: 'set', value: '[...results, {n: current + 1, phrase: cards[current].phrase, rating: rating, made: checked.length, of: cards[current].checks.length, took: recordings.take.hasRecording}]' }] as [string, Record<string, unknown>];
  const reset = (): [string, Record<string, unknown>][] => [['action.stopSound', {}], ['action.setVariable', { variable: checked.id, op: 'clear' }], set(rating, '-1'), set(busy, 'false'), set(stage, '"listen"')];
  g.run(g.click(next, 'Save and go to the next card'), save, ...reset(), set(current, 'current + 1'), announce('"Card " + (current + 1) + " of " + cards.length + ". " + cards[current].phrase'));
  g.run(g.click(finish, 'Save and see the results'), save, ...reset(), go(end));

  checklist.push(
    item('Write the title and the line under it on the first page. Keep it clear that this is practice, not assessed, and that a recording stays on the learner\'s device', intro, hero.page),
    item('Swap each placeholder clip for your own recording of the model: open the Assets panel and use the arrow beside each "(replace)" sound. The card follows the new file. Say the phrase once, clearly, at an ordinary pace', byName(practice, 'Play model'), practice),
    item('Write your cards: Project > Variables > "cards". Each card has a phrase (shown big, and it is the transcript of the clip), a note (what to listen for), a sound (the clip) and checks (up to four things a learner ticks). To add a card, add a row and type the clip\'s name exactly as it is in Assets in "sound"', phrase, practice),
    item('Write the checks as things a learner can hear in their own voice (stress, a rising tone for a question, a sound they find hard, every word there), not "sounded right". They are a self-check, not a score', byName(practice, 'Check heading'), practice),
    item('The slow speed is 0.7 (the Speed of the Play sound nodes, Interactions tab). The pitch is kept, so a slowed model still sounds like the speaker. Change it if your clips need more or less', byName(practice, 'Slow switch'), practice),
    item('RECORDING: Project > Microphone and camera has Microphone ticked, a one-sentence purpose that fills in "It is used to ..." on the consent screen, and a 30 second cap. Untick it for a listen-and-repeat version with no recording. Anyone who says no, has no microphone, or chooses "Do not use my microphone or camera" gets the plain version, which is the whole activity without the Record, Play mine and Model, then mine buttons', record, practice),
    item('Tell learners, plainly, that a recording stays on their device and is lost when they go on to the next card or reload. The note at the bottom left of the card says so, and so does the first page. Keep both', where, practice),
    item('On StudyDesk the page around the project has to allow the microphone. If it does not, learners see the plain version and a sentence saying why. Try a share link in StudyDesk before you rely on it', record, practice),
    item('Check the results page: it lists the last six cards with the learner\'s own rating and how many checks they ticked. The starter is laid out for up to six cards', byName(end, 'Cards tile'), end),
    item('Keep it self assessment: nothing hears the learner, nothing is scored or sent, and a recording is never kept. A graded speaking task belongs in a live conversation or a Moodle recorded answer', intro, hero.page),
  );

  //Results
  const eb = contentBox(end);
  const summary = text(ctx, 'Summary', '{"You shadowed " + results.length + " of " + cards.length + " cards. Any recording you made stayed on this device and is already gone."}', eb.x, eb.y, eb.width, { fontSize: 18, lineHeight: 1.4 });
  const tile = card(ctx, 'Cards tile', eb.x, eb.y + 44, 200, 80);
  const tileN = text(ctx, 'Cards done', '{results.length} of {cards.length}', eb.x + 16, eb.y + 54, 168, { fontSize: 26, fontWeight: 700 });
  const tileL = text(ctx, 'Cards done label', 'cards done', eb.x + 16, eb.y + 92, 168, { fontSize: 14, color: L.muted });
  end.children.push(summary, tile, tileN, tileL);
  const COLS: [string, number, number][] = [['Card', 12, 470], ['How it went', 500, 180], ['Self-check', 700, 200]];
  const headY = eb.y + 140;
  COLS.forEach(([label, x, w]) => end.children.push(text(ctx, `Header ${label}`, label, eb.x + x, headY, w, { fontSize: 14, fontWeight: 700, color: L.muted })));
  const cell = (label: string, value: string, x: number, w: number) => text(ctx, `Cell ${label}`, `{${value}}`, x, 9, w, { fontSize: 15, autoSize: 'none', height: 22, overflow: 'ellipsis' });
  const row = createNode('frame', {
    name: 'Result row',
    x: 0,
    y: 0,
    width: eb.width,
    height: 38,
    cornerRadius: 10,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    role: 'region',
    children: [
      cell('Card', 'item.phrase', 12, 470),
      cell('How it went', `item.rating >= 0 ? ${JSON.stringify(RATINGS)}[item.rating] : "Not rated"`, 500, 180),
      cell('Self-check', 'item.made + " of " + item.of + " ticked"', 700, 200),
    ],
  }) as FrameNode;
  bind(row, { ariaLabel: `"Card " + item.n + ": " + item.phrase + ". " + (item.rating >= 0 ? ${JSON.stringify(RATINGS)}[item.rating] : "Not rated") + ", " + item.made + " of " + item.of + " ticked"` });
  const table = createNode('frame', { name: 'Results', x: eb.x, y: headY + 26, width: eb.width, height: 252, fill: null, stroke: null, clip: false, role: 'region', ariaLabel: 'Your cards', repeat: { items: 'results.slice(-6)', layout: 'grid', gap: 4, columns: 1 }, children: [row] }) as FrameNode;
  const again = button(ctx, 'Start again', 'Start again', eb.x, eb.y + eb.height - 46, 200, true);
  end.children.push(table, again);

  const eg = new Graph(end);
  //Whatever is still in memory goes when the results show
  const open = eg.start('The results open');
  const drop = eg.add('logic.if', { condition: rec('take').has }, open);
  eg.add('action.recordDiscard', { slot: 'take' }, drop, 'true');
  eg.gap(80);
  eg.run(eg.click(again, 'Start again'), ['action.startOver', {}]);

  spreadPages(project);
  return { project, checklist };
}

export const shadowTheModel: BrandedStarter = {
  key: 'practice/shadow-the-model',
  set: 'practice',
  name: 'Shadow the model',
  description: 'Pronunciation and intonation practice on a few phrase cards. Each card plays a model clip (with a slow speed), the learner records themselves, plays their take or the model then their take back to back, ticks your self-check (stress, rising tone, every sound there) and rates themselves. The recording stays on their device and is lost on reload. With no microphone, or if they say no, the plain version is listen, say it aloud and self-check. Placeholder clips to swap, self assessment only.',
  tags: ['speaking', 'pronunciation', 'language', 'recording', 'microphone'],
  build,
};
