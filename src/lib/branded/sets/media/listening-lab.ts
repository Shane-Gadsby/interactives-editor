//Listening lab: a sound check, then four short ear-training rounds (identify the sound, compare A and B, sort clips by dragging, what changed) with a score at the end.
//Every clip is a Play sound node on its own button, so looping and slow replay come from the node's own Loop and Speed (the Loop and Slow buttons are pressed
//switches on two variables). The one button per clip is Play and Stop in one: its label reads soundPlaying() and a press stops the clip when it is going.
//The sounds are placeholder tones the author swaps; each clip also has a written description, the way in for anyone who cannot or would rather not listen.
import { createNode, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text, type BrandedCtx, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { keyNavList, stack } from '../../parts';
import { addVar, announce, bind, boxText, click, endPage, goNext, graph, graphNote, heroPage, resetVars, setVar, toggleVar } from './shared';
import { addPlaceholderSound, type Note } from './sounds';

//Three rounds, read from the "rounds" list in the Variables tab: the question, up to three answers, the right one (counting from 0) and why
export const ROUNDS = [
  { q: 'What is making this sound?', options: ['A doorbell', 'A phone ringing', 'A kettle whistling'], answer: 0, why: 'A doorbell usually plays two or three notes that step down. The tune is the clue.' },
  { q: 'Which clip sounds rough, with a wobble in it?', options: ['Clip A', 'Clip B', 'Both sound the same'], answer: 1, why: 'Clip B wobbles: the note keeps getting louder and quieter, which is what makes it sound rough.' },
  { q: 'What changed between the first clip and the second?', options: ['The pitch went up', 'The beeps got faster', 'A fourth beep was added'], answer: 0, why: 'The number of beeps and the speed are the same. Only the pitch went up.' },
];

const SLOW = 0.6;

//The placeholder sounds, as notes
const beeps = (hz: number): Note[] => [0, 1, 2].map(() => ({ hz, ms: 160, gap: 140 }));
const SOUNDS = {
  test: [{ hz: 523, ms: 700 }] as Note[],
  doorbell: [{ hz: 660, ms: 380, gap: 120 }, { hz: 523, ms: 700 }] as Note[],
  steady: [{ hz: 440, ms: 1500 }] as Note[],
  rough: [{ hz: 440, ms: 1500, wobble: 24 }] as Note[],
  before: beeps(440),
  after: beeps(660),
  high1: [{ hz: 880, ms: 220, gap: 160 }, { hz: 880, ms: 220 }] as Note[],
  high2: [{ hz: 988, ms: 450 }] as Note[],
  low1: [{ hz: 220, ms: 450, gap: 120 }, { hz: 220, ms: 450 }] as Note[],
  low2: [{ hz: 196, ms: 900 }] as Note[],
};

interface Vars {
  looping: Variable;
  slow: Variable;
  showText: Variable;
  score: Variable;
  locked: Variable;
  choice: Variable;
  lastRight: Variable;
  misses: Variable;
  message: Variable;
}

interface Clip {
  title: string;
  asset: string;
  description: string;
}

type G = ReturnType<typeof graph>;

//The first node on a page labelled like this (the flows the helpers below build are not handed back, so notes find them by their label)
const labelled = (page: Artboard, label: RegExp) => page.logic.nodes.find((n) => label.test(n.note ?? ''))!;

//Play when nothing of this clip is going, Stop when it is: the label and the press both read soundPlaying() for the clip's own sound
const toggleClip = (g: G, btn: SceneNode, name: string, asset: string, loopExpr: string, speedExpr: string): void => {
  const ev = click(g, btn, name);
  const going = g.then(ev, 'logic.if', { condition: `soundPlaying("${asset}")` });
  g.then(going, 'action.stopSound', { asset }, 'true');
  g.then(going, 'action.sound', { asset, loop: loopExpr, speed: speedExpr, keepPitch: true, solo: true, continue: 'start' }, 'false');
};
const playLabel = (asset: string) => `soundPlaying("${asset}") ? "Stop" : "Play"`;

//A clip: its card with a waveform picture, one Play or Stop button, and its written description (shown when descriptions are on)
function clipCard(ctx: BrandedCtx, page: Artboard, g: G, clip: Clip, x: number, y: number, w: number): { card: SceneNode; play: SceneNode } {
  const { L } = ctx;
  const title = heading(ctx, `${clip.title} title`, clip.title, 20, 14, w - 40, { fontSize: 20 });
  const wave = picture(ctx, `${clip.title} waveform`, 20, 48, w - 40, 50);
  const play = bind(button(ctx, `${clip.title} play button`, 'Play', 20, 108, 160), { label: playLabel(clip.asset), ariaLabel: `soundPlaying("${clip.asset}") ? "Stop ${clip.title}" : "Play ${clip.title}"` });
  const description = bind(text(ctx, `${clip.title} description`, `Description: ${clip.description}`, 20, 160, w - 40, { fontSize: 14, lineHeight: 1.3, color: L.muted }), { visible: 'showText' });
  const cardBox = createNode('frame', { name: `${clip.title} card`, x, y, width: w, height: 200, cornerRadius: 16, fill: solid(L.surface), stroke: null, clip: false, role: 'region', ariaLabel: clip.title, children: [title, wave, play, description] }) as FrameNode;
  page.children.push(cardBox);
  toggleClip(g, play, `Play or stop ${clip.title}`, clip.asset, 'looping', `slow ? ${SLOW} : 1`);
  return { card: cardBox, play };
}

//Loop, Slow and Descriptions: three switches, each a pressed button on a variable (a native pressed state, and a look that says so)
function switches(ctx: BrandedCtx, page: Artboard, g: G, v: Vars, x: number, y: number): SceneNode[] {
  const { L } = ctx;
  const make = (name: string, w: number, label: string, on: Variable, hint: string) => {
    const b = bind(button(ctx, name, label, 0, 0, w, false), { ariaPressed: on.name, 'fill.color': `${on.name} ? "${L.button}" : "${L.background}"`, color: `${on.name} ? "${L.onButton}" : "${L.text}"` });
    b.ariaDescription = hint;
    return [b, on] as const;
  };
  const made = [
    make('Loop switch', 128, 'Loop', v.looping, 'Plays a clip round and round until you press Stop. Applies the next time you press Play.'),
    make('Slow switch', 128, 'Slow', v.slow, 'Plays clips at a slower speed without changing the pitch. Applies the next time you press Play.'),
    make('Descriptions switch', 184, 'Descriptions', v.showText, 'Shows a written description of each clip.'),
  ];
  const list = made.map(([b]) => b);
  made.forEach(([b, on]) => g.run(g.event('event.pointer', { target: b.id, type: 'click' }, b.name), toggleVar(on)));
  page.children.push(stack('Switches', x, y, 440, { direction: 'row', gap: 12, align: 'start', children: list }));
  return list;
}

//One round's question: the prompt, up to three answers read from rounds[index] (a key-navigated repeater, so the arrow keys move between them), a feedback panel and Next
function round(ctx: BrandedCtx, page: Artboard, g: G, v: Vars, index: number, o: { prompt: { x: number; y: number; w: number }; answers: { x: number; y: number; w: number; row: boolean }; feedback: { x: number; y: number; w: number }; nextLabel?: string }): SceneNode {
  const { L } = ctx;
  const r = `rounds[${index}]`;
  const prompt = heading(ctx, 'Question', '{' + r + '.q}', o.prompt.x, o.prompt.y, o.prompt.w, { fontSize: 22, autoSize: 'none', height: o.answers.row ? 34 : 56, lineHeight: 1.25 } as never);
  page.children.push(prompt);
  const gap = o.answers.row ? 20 : 10;
  const w = o.answers.row ? (o.answers.w - 2 * gap) / 3 : o.answers.w;
  const right = `locked && ${r}.answer == index`;
  const wrongPick = `locked && choice == index && ${r}.answer != index`;
  const answer = bind(button(ctx, 'Answer', '{item}', 0, 0, w, false), {
    label: `(${right} ? "✓  " : ${wrongPick} ? "✗  " : "") + item`,
    ariaLabel: '"Answer " + (index + 1) + ": " + item',
    disabled: 'locked',
    opacity: `locked && !(${right}) && !(${wrongPick}) ? 0.5 : 1`,
    'fill.color': `${right} ? "${L.successSurface}" : ${wrongPick} ? "${L.errorSurface}" : "${L.background}"`,
    'stroke.paint.color': `${right} ? "${L.success}" : ${wrongPick} ? "${L.error}" : "${L.border}"`,
    ariaDescription: `${right} ? "Right answer" : ${wrongPick} ? "Wrong" : ""`,
  });
  Object.assign(answer, { height: 48, cornerRadius: 14, fontSize: 17 });
  const answers = keyNavList('Answers', o.answers.x, o.answers.y, o.answers.w, o.answers.row ? 48 : 3 * 48 + 2 * gap, { items: `${r}.options`, row: answer, orientation: o.answers.row ? 'horizontal' : 'vertical', gap, ariaLabel: 'Answers' });
  const flashText = text(ctx, 'Feedback text', `{lastRight ? "✓ Correct. " : "✗ Not quite. "}{${r}.why}`, 20, 12, o.feedback.w - 40 - 190, { fontSize: 16, fontWeight: 600, lineHeight: 1.3 });
  const nextBtn = button(ctx, 'Next button', o.nextLabel ?? 'Next', o.feedback.w - 190 - 12, 14, 190);
  const flash = bind(createNode('frame', { name: 'Feedback', x: o.feedback.x, y: o.feedback.y, width: o.feedback.w, height: 74, cornerRadius: 16, fill: solid(L.surface), stroke: stroke(L.border, 2), clip: false, role: 'region', children: [flashText, nextBtn] }) as FrameNode, {
    visible: 'locked',
    'fill.color': `lastRight ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `lastRight ? "${L.success}" : "${L.error}"`,
    ariaLabel: `(lastRight ? "Correct. " : "Not quite. ") + ${r}.why`,
  });
  page.children.push(answers, flash);
  //One flow for every answer: the event says which copy was pressed, and a locked round ignores the rest
  const onAnswer = g.event('event.pointer', { target: answer.id, type: 'click', onlyIf: '!locked' }, 'An answer');
  graphNote(page, { anchor: onAnswer, colour: 'sky', text: `**One flow serves every answer.** \`event.index\` is the option pressed, *Only if* \`!locked\` ignores any press after the first, and \`lastRight\` compares it with \`rounds[${index}].answer\` before the score takes one for a right answer.` });
  g.run(onAnswer, setVar(v.locked, 'true'), setVar(v.choice, 'event.index'), setVar(v.lastRight, `${r}.answer == event.index`), setVar(v.score, 'lastRight ? 1 : 0', 'add'), announce(`(lastRight ? "Correct. " : "Not quite. The right answer was " + ${r}.options[${r}.answer] + ". ") + ${r}.why`));
  g.run(click(g, nextBtn, 'Next'), goNext());
  g.run(g.event('event.start', {}, 'Round starts'), resetVars(v.locked, v.choice, v.lastRight));
  return answer;
}

/** States for the layout check: a round answered (the feedback panel shows), the sorting round with a long message, and descriptions on. */
const LAYOUT_STATES: LayoutState[] = [
  { label: 'answered, descriptions on', vars: { locked: true, choice: 1, lastRight: false, showText: true, message: 'Sound 2 does not go in Higher sounds. Listen again and try the other group.' } },
];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Listening lab');
  const { project, L } = ctx;
  const v: Vars = {
    looping: addVar(project, 'looping', 'boolean', false),
    slow: addVar(project, 'slow', 'boolean', false),
    showText: addVar(project, 'showText', 'boolean', false),
    score: addVar(project, 'score', 'number', 0),
    locked: addVar(project, 'locked', 'boolean', false),
    choice: addVar(project, 'choice', 'number', -1),
    lastRight: addVar(project, 'lastRight', 'boolean', false),
    misses: addVar(project, 'misses', 'number', 0),
    message: addVar(project, 'message', 'string', ''),
  };
  addVar(project, 'rounds', 'list', ROUNDS);
  const highs = addVar(project, 'highSounds', 'list', []);
  const lows = addVar(project, 'lowSounds', 'list', []);
  //A live variable: how many sounds are in a group, which the count, the Next button and the finish check all read
  addVar(project, 'sorted', 'number', 0, { formula: 'highSounds.length + lowSounds.length', live: true });

  const { page: hero, start } = heroPage(ctx, 'Listening lab', 'Train your ear: name a sound, compare two clips, sort sounds by dragging and spot what changed. Every clip also has a written description.', 'Start', 'Start button');
  hero.name = 'Start';
  const check = brandedPage(ctx, 'Before you start: sound check', { name: 'Sound check', footer: 'Listening lab' });
  const identify = brandedPage(ctx, 'Round 1: Identify the sound', { name: 'Identify the sound', footer: 'Loop and Slow apply from the next press of Play' });
  const compare = brandedPage(ctx, 'Round 2: Compare A and B', { name: 'Compare A and B', footer: 'Loop and Slow apply from the next press of Play' });
  const sort = brandedPage(ctx, 'Round 3: Sort the sounds', { name: 'Sort the sounds', footer: 'Loop and Slow apply from the next press of Play' });
  const changed = brandedPage(ctx, 'Round 4: What changed?', { name: 'What changed?', footer: 'Loop and Slow apply from the next press of Play' });
  const results = endPage(ctx, 'Listening lab complete', 'You answered {score} of {rounds.length} questions right and sorted the sounds with {misses} wrong {misses == 1 ? "drop" : "drops"}.', 'Try again');
  results.page.name = 'Results';
  const checklist: TemplateChecklistItem[] = [];

  const sounds = {
    test: addPlaceholderSound(project, 'Test tone (replace).wav', SOUNDS.test),
    doorbell: addPlaceholderSound(project, 'Sound 1 doorbell (replace).wav', SOUNDS.doorbell),
    steady: addPlaceholderSound(project, 'Clip A steady (replace).wav', SOUNDS.steady),
    rough: addPlaceholderSound(project, 'Clip B wobble (replace).wav', SOUNDS.rough),
    before: addPlaceholderSound(project, 'Before (replace).wav', SOUNDS.before),
    after: addPlaceholderSound(project, 'After (replace).wav', SOUNDS.after),
    high1: addPlaceholderSound(project, 'Sort 1 high (replace).wav', SOUNDS.high1),
    low1: addPlaceholderSound(project, 'Sort 2 low (replace).wav', SOUNDS.low1),
    low2: addPlaceholderSound(project, 'Sort 3 low (replace).wav', SOUNDS.low2),
    high2: addPlaceholderSound(project, 'Sort 4 high (replace).wav', SOUNDS.high2),
  };

  //Hero
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
    checklist.push(item('Write the title and the line under it on the first page', byName(hero, 'Subtitle'), hero));
  }

  //Sound check: headphones and volume, a test tone, and the way in without sound
  const box = contentBox(check);
  const tips = text(ctx, 'Sound check text', '1. Put your headphones on if you have them. Clips are easier to tell apart that way.\n2. Set your device volume to a comfortable level, about halfway.\n3. Press Play test sound. You should hear one steady note.\nOn a phone or tablet each clip needs its own tap to start.', 0, 0, 620, { fontSize: 19, lineHeight: 1.45 });
  const testBtn = bind(button(ctx, 'Play test sound button', 'Play test sound', 0, 0, 220, false), { label: `soundPlaying("${sounds.test}") ? "Stop test sound" : "Play test sound"` });
  const heard = button(ctx, 'Heard it button', 'I heard it, start', 0, 0, 240);
  const testRow = stack('Test row', 0, 0, 620, { direction: 'row', gap: 20, align: 'start', children: [testBtn, heard] });
  const noSound = button(ctx, 'No sound button', 'I can\'t use sound: show descriptions', 0, 0, 480, false);
  const assure = text(ctx, 'Descriptions note', 'Every clip has a written description for anyone who cannot or would rather not listen. You can switch descriptions on or off on any round with the Descriptions button.', 0, 0, 620, { fontSize: 16, color: L.muted, lineHeight: 1.4 });
  check.children.push(stack('Sound check column', box.x, box.y, 620, { gap: 18, children: [tips, testRow, noSound, assure] }));
  {
    const g = graph(check);
    toggleClip(g, testBtn, 'Test tone', sounds.test, 'false', '1');
    graphNote(check, { anchor: labelled(check, /^Test tone$/), colour: 'sky', text: '**Play and Stop are one button.** The If asks `soundPlaying()` for this clip\'s own sound, so a press stops it when it is going and starts it when it is not. The button\'s label reads the same expression.' });
    g.run(click(g, heard, 'Continue'), goNext());
    g.run(click(g, noSound, 'Without sound'), setVar(v.showText, 'true'), goNext());
    graphNote(check, { anchor: labelled(check, /^Without sound$/), colour: 'sky', text: '**"I can\'t use sound" only turns showText on** and carries on, so every round that follows can be done from the written descriptions.' });
  }
  checklist.push(item('Check the sound check wording suits your learners, and swap the test tone for your own if you like (the Play sound node on the test button)', tips, check));

  //Round 1: identify the sound
  {
    const b = contentBox(identify);
    const g = graph(identify);
    clipCard(ctx, identify, g, { title: 'Sound 1', asset: sounds.doorbell, description: 'Two soft bell notes, a higher one then a lower one, with a short gap between.' }, b.x, b.y, 448);
    switches(ctx, identify, g, v, b.x, b.y + 212);
    graphNote(identify, { anchor: labelled(identify, /^Play or stop/), colour: 'sky', text: '**The Play sound nodes read looping and slow as they start**, and Stop other sounds first is on. So the Loop and Slow switches (each just a Toggle) apply from the next press of Play.' });
    round(ctx, identify, g, v, 0, { prompt: { x: b.x + 480, y: b.y, w: 448 }, answers: { x: b.x + 480, y: b.y + 62, w: 448, row: false }, feedback: { x: b.x, y: b.y + 290, w: b.width } });
  }

  //Round 2: compare two clips (playing one stops the other, so only one is heard at a time)
  {
    const b = contentBox(compare);
    const g = graph(compare);
    clipCard(ctx, compare, g, { title: 'Clip A', asset: sounds.steady, description: 'A steady, smooth note that stays the same.' }, b.x, b.y, 448);
    clipCard(ctx, compare, g, { title: 'Clip B', asset: sounds.rough, description: 'The same note, but it wobbles and buzzes.' }, b.x + 480, b.y, 448);
    switches(ctx, compare, g, v, b.x, b.y + 210);
    graphNote(compare, { anchor: labelled(compare, /^Play or stop Clip A$/), colour: 'sky', text: '**Stop other sounds first** is on in both Play sound nodes, so starting Clip B stops Clip A and only one is ever heard. [ ] Keep it on if you swap in your own clips.' });
    round(ctx, compare, g, v, 1, { prompt: { x: b.x, y: b.y + 266, w: b.width }, answers: { x: b.x, y: b.y + 306, w: b.width, row: true }, feedback: { x: b.x, y: b.y + 366, w: b.width } });
  }

  //Round 3: sort the clips into two groups by dragging
  const sortBox = contentBox(sort);
  const GROUPS = [
    { name: 'Higher sounds', tag: 'high', list: highs },
    { name: 'Lower sounds', tag: 'low', list: lows },
  ];
  const CHIPS: { title: string; asset: string; tag: string; description: string }[] = [
    { title: 'Sound 1', asset: sounds.high1, tag: 'high', description: 'Two quick, thin beeps.' },
    { title: 'Sound 2', asset: sounds.low1, tag: 'low', description: 'Two slow, deep notes.' },
    { title: 'Sound 3', asset: sounds.low2, tag: 'low', description: 'One long, very deep note.' },
    { title: 'Sound 4', asset: sounds.high2, tag: 'high', description: 'One long, bright note.' },
  ];
  let firstChip: SceneNode;
  let firstZone: SceneNode;
  {
    const g = graph(sort);
    switches(ctx, sort, g, v, sortBox.x, sortBox.y);
    const count = text(ctx, 'Count', `Sorted {sorted} of ${CHIPS.length}. Wrong drops: {misses}`, sortBox.x + 500, sortBox.y + 10, 428, { fontSize: 18, fontWeight: 700, align: 'right' });
    sort.children.push(count);
    const zones = GROUPS.map((gr, i) =>
      createNode('frame', {
        name: gr.name,
        x: sortBox.x + i * 480,
        y: sortBox.y + 60,
        width: 448,
        height: 170,
        cornerRadius: 16,
        fill: solid(L.surface),
        stroke: { paint: solid(L.muted), width: 2, dash: [8, 5] },
        clip: false,
        dropZone: { accepts: [gr.tag], snap: 'none', label: gr.name, contentsVariable: gr.list.id },
        children: [boxText(ctx, `${gr.name} heading`, gr.name, 20, 12, 408, 36, { fontSize: 22, fontWeight: 700, align: 'center' })],
      }) as FrameNode
    );
    sort.children.push(...zones);
    firstZone = zones[0];
    const chipY = sortBox.y + 250;
    const chips = CHIPS.map((c, i) => {
      const chip = createNode('frame', {
        name: c.title,
        x: sortBox.x + i * 232,
        y: chipY,
        width: 148,
        height: 46,
        cornerRadius: 23,
        fill: solid(L.background),
        stroke: stroke(L.text, 2),
        clip: false,
        shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
        draggable: { tags: [c.tag], onMiss: 'return', label: c.title },
        ariaLabel: c.title,
        children: [boxText(ctx, `${c.title} text`, c.title, 6, 0, 136, 46, { fontSize: 16, fontWeight: 600, align: 'center' })],
      }) as FrameNode;
      const play = bind(button(ctx, `${c.title} play button`, 'Play', sortBox.x + i * 232 + 156, chipY, 70, false), { label: playLabel(c.asset), ariaLabel: `soundPlaying("${c.asset}") ? "Stop ${c.title}" : "Play ${c.title}"` });
      const desc = bind(text(ctx, `${c.title} description`, `Description: ${c.description}`, sortBox.x + i * 232, chipY + 54, 222, { fontSize: 14, lineHeight: 1.3, color: L.muted }), { visible: 'showText' });
      sort.children.push(chip, play, desc);
      toggleClip(g, play, `Play or stop ${c.title}`, c.asset, 'looping', `slow ? ${SLOW} : 1`);
      return chip;
    });
    firstChip = chips[0];
    const feedback = text(ctx, 'Feedback', '{message}', sortBox.x, sortBox.y + 372, 700, { fontSize: 19, fontWeight: 600, bindings: { visible: 'message != ""' } });
    const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a sound, press Space to pick it up, use the arrow keys to choose a group and Space to drop it.', sortBox.x + 8, sortBox.y + 420, 640, { fontSize: 13, color: L.muted });
    const see = bind(button(ctx, 'See next button', 'Next', sortBox.x + sortBox.width - 190, sortBox.y + 372, 190), { visible: `sorted == ${CHIPS.length}` });
    sort.children.push(feedback, keys, see);
    //A sound taken by a group (and the finish said once they are all in), and one a group refused
    const ok = g.event('event.drop', { result: 'accepted' }, 'Sorting');
    const done = g.then(g.then(ok, 'action.setVariable', { variable: v.message.id, op: 'set', value: 'event.layer + " goes in " + event.zone + ". Right."' }), 'logic.if', { condition: `sorted == ${CHIPS.length}` });
    g.run(g.then(done, 'action.setVariable', { variable: v.message.id, op: 'set', value: `"All ${CHIPS.length} sorted. Well done!"` }, 'true'), announce('message'));
    g.run(g.event('event.drop', { result: 'rejected' }, 'Sorting'), setVar(v.misses, '1', 'add'), setVar(v.message, 'event.layer + " does not go in " + event.zone + ". Listen again and try the other group."'), announce('message'));
    g.run(g.event('event.start', {}, 'Round starts'), ['action.dragReset', {}], resetVars(v.misses, v.message));
    g.run(click(g, see, 'Next'), goNext());
    graphNote(sort, { anchor: ok, colour: 'sky', text: '**A drop is accepted when the sound\'s Tags match the group\'s Takes tags**, so there is no right-answer list here. The live `sorted` reaching the chip count is what says "All sorted", once. A refused drop only counts a miss.' });
    graphNote(sort, { anchor: labelled(sort, /^Round starts$/), colour: 'sky', text: '**Drag reset puts every chip back** whenever the page opens, along with the misses and the message, so a second go starts clean.' });
  }

  //Round 4: what changed (the second clip is the first with one thing different)
  {
    const b = contentBox(changed);
    const g = graph(changed);
    clipCard(ctx, changed, g, { title: 'Before', asset: sounds.before, description: 'Three short beeps, all at the same pitch.' }, b.x, b.y, 448);
    clipCard(ctx, changed, g, { title: 'After', asset: sounds.after, description: 'Three short beeps, all higher than before.' }, b.x + 480, b.y, 448);
    switches(ctx, changed, g, v, b.x, b.y + 210);
    graphNote(changed, { anchor: labelled(changed, /^Play or stop Before$/), colour: 'sky', text: '**Before and After are the same pair of nodes as the compare round**, so the same switches and the same one-at-a-time rule apply. [ ] The second clip should differ from the first in just one thing.' });
    round(ctx, changed, g, v, 2, { prompt: { x: b.x, y: b.y + 266, w: b.width }, answers: { x: b.x, y: b.y + 306, w: b.width, row: true }, feedback: { x: b.x, y: b.y + 366, w: b.width }, nextLabel: 'See results' });
  }

  //Results
  {
    const g = graph(results.page);
    //Try again starts over (scores and switches back to how they began), not just back to the first page
    g.run(click(g, results.again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Results page'), announce('"You answered " + score + " of " + rounds.length + " questions right."'));
  }

  checklist.push(
    item('Swap each placeholder sound for your own clip: open the Assets panel and use the arrow beside each "(replace)" sound. The Play sound nodes on the Play buttons follow the new file', byName(identify, 'Sound 1 play button'), identify),
    item('Write your three questions: the "rounds" variable (Variables tab) is a list with, for each round, q (the question), options (up to three answers), answer (the number of the right one, counting from 0) and why (shown after the answer). Round 1 is Identify the sound, round 2 is Compare A and B, round 3 is What changed', byName(identify, 'Question'), identify),
    item('Write a description for every clip (the grey "Description:" line on its card or under its chip). It is the way in for learners who cannot or would rather not listen, so say what the sound is like without giving the answer away', byName(identify, 'Sound 1 description'), identify),
    item('Replace the grey waveform pictures with a waveform or spectrogram image, and write its alt text. Delete them if you do not want one', byName(identify, 'Sound 1 waveform'), identify),
    item('Round 3: rename the two groups (the box name, its heading and its Name read out) and give every sound the group it belongs to: its Tags (Draggable section) must match the Takes tags of its group', firstZone, sort),
    item('To add a sound to the sorting round: duplicate a chip, its Play button and its description, then add a Play sound node for the new button and fix the "of 4" in the count and the Next button (it shows when "sorted" reaches 4)', firstChip, sort),
    item('Try the Loop, Slow and Descriptions buttons: Loop and Slow are the Loop and Speed settings of every Play sound node (Interactions tab), and "Stop other sounds first" is on so two clips never play over each other', byName(identify, 'Loop switch'), identify),
    item('Change the results text, and pick the colourway on the Themes tab. The brand parts are locked', results.result, results.page),
  );

  //Notes for whoever edits the template, below each page
  const below = (page: Artboard, x: number, w: number) => ({ x, y: page.height + 14, w, h: 96 });
  addNote(identify, { ...below(identify, 0, 440), text: '**Play and Stop** are one button: its label reads `soundPlaying()` for that clip, and pressing it stops the clip when it is going, so there is no busy variable to keep.', colour: 'sky' });
  addNote(identify, { ...below(identify, 456, 440), text: '**One answer flow** The answers are a repeater over `rounds`, so one flow serves every answer and the arrow keys move between them. [ ] Write your questions in `rounds`.', colour: 'gold' });
  addNote(sort, { ...below(sort, 0, 440), text: '**Live variable** `sorted` counts the sounds in both groups. The count, the Next button and the "all sorted" message all read it.', colour: 'sky' });
  addNote(check, { ...below(check, 0, 440), text: '[ ] Swap the placeholder tones in the Assets panel for your own clips. Keep a written description for every one.', colour: 'gold' });

  return { project, checklist };
}

export const listeningLab: BrandedStarter = {
  key: 'media/listening-lab',
  set: 'media',
  name: 'Listening lab',
  description: 'Ear training in four short rounds: identify a sound, compare A and B, sort sounds by dragging and spot what changed. Clips loop and play slowly with the pitch kept, each has a written description, and a sound check comes first. Placeholder tones to swap.',
  tags: ['audio', 'listening', 'sound', 'compare'],
  build,
  layoutStates: LAYOUT_STATES,
};
