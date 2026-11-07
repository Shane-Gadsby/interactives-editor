//Listening lab: a sound check, then four short ear-training rounds (identify the sound, compare A and B, sort clips by dragging, what changed) with a score at the end.
//Every clip is a Play sound node on its own button, so looping and slow replay come from the node's own Loop and Speed (the Loop and Slow buttons just flip two variables).
//The sounds are placeholder tones the author swaps; each clip also has a written description, the way in for anyone who cannot or would rather not listen.
import { createNode, type Artboard, type FrameNode, type SceneNode, type TemplateChecklistItem, type Variable } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, picture, solid, stroke, text, type BrandedCtx, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { whenTrue } from '../assessment/gate';
import { announce, bind, click, go, graph, panel, setVar, toggleVar, variable } from '../assessment/shared';
import { boxText, endPage, goButton, heroPage, join, put, seq } from '../drag/shared';
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

//A clip: its card with a waveform picture, Play and Stop, and its written description (shown when descriptions are on)
function clipCard(ctx: BrandedCtx, page: Artboard, g: G, clip: Clip, x: number, y: number, w: number): { card: SceneNode; play: SceneNode } {
  const { L } = ctx;
  const cardBox = card(ctx, `${clip.title} card`, x, y, w, 200);
  const title = heading(ctx, `${clip.title} title`, clip.title, x + 20, y + 14, w - 40, { fontSize: 20 });
  const wave = picture(ctx, `${clip.title} waveform`, x + 20, y + 48, w - 40, 50);
  const play = button(ctx, `${clip.title} play button`, 'Play', x + 20, y + 108, 130);
  play.ariaLabel = `Play ${clip.title}`;
  const stop = button(ctx, `${clip.title} stop button`, 'Stop', x + 162, y + 108, 110, false);
  stop.ariaLabel = `Stop ${clip.title}`;
  const description = bind(text(ctx, `${clip.title} description`, `Description: ${clip.description}`, x + 20, y + 160, w - 40, { fontSize: 14, lineHeight: 1.3, color: L.muted }), { visible: 'showText' });
  page.children.push(cardBox, title, wave, play, stop, description);
  const ev = click(g, play, `Play ${clip.title}`);
  g.then(ev, 'action.sound', { asset: clip.asset, loop: 'looping', speed: `slow ? ${SLOW} : 1`, keepPitch: true, solo: true, continue: 'start' });
  g.then(click(g, stop, `Stop ${clip.title}`), 'action.stopSound', {});
  return { card: cardBox, play };
}

//Loop, Slow and Descriptions: three switches, each a variable with its state in its label
function switches(ctx: BrandedCtx, page: Artboard, g: G, v: Vars, x: number, y: number): SceneNode[] {
  const make = (name: string, w: number, label: string, on: Variable, dx: number, hint: string) => {
    const b = bind(button(ctx, name, label, x + dx, y, w, false), { label: `${on.name} ? ${JSON.stringify(`${label}: on`)} : ${JSON.stringify(`${label}: off`)}` });
    b.ariaDescription = hint;
    g.run(click(g, b, name), toggleVar(on));
    return b;
  };
  const list = [
    make('Loop switch', 128, 'Loop', v.looping, 0, 'Plays a clip round and round until you press Stop. Applies the next time you press Play.'),
    make('Slow switch', 128, 'Slow', v.slow, 140, 'Plays clips at a slower speed without changing the pitch. Applies the next time you press Play.'),
    make('Descriptions switch', 184, 'Descriptions', v.showText, 280, 'Shows a written description of each clip.'),
  ];
  page.children.push(...list);
  return list;
}

//One round's question: the prompt, up to three answers read from rounds[index], a feedback panel and Next
function round(ctx: BrandedCtx, page: Artboard, g: G, v: Vars, index: number, next: Artboard, o: { prompt: { x: number; y: number; w: number }; answers: { x: number; y: number; w: number; row: boolean }; feedback: { x: number; y: number; w: number }; nextLabel?: string }): SceneNode {
  const { L } = ctx;
  const r = `rounds[${index}]`;
  const prompt = heading(ctx, 'Question', '{' + r + '.q}', o.prompt.x, o.prompt.y, o.prompt.w, { fontSize: 22, autoSize: 'none', height: o.answers.row ? 34 : 56, lineHeight: 1.25 } as never);
  page.children.push(prompt);
  const answers = [0, 1, 2].map((k) => {
    const b = button(ctx, `Answer ${k + 1}`, `Answer ${k + 1}`, o.answers.row ? o.answers.x + k * ((o.answers.w + 20) / 3) : o.answers.x, o.answers.row ? o.answers.y : o.answers.y + k * 58, o.answers.row ? (o.answers.w - 40) / 3 : o.answers.w, false);
    Object.assign(b, { height: 48, cornerRadius: 14, fontSize: 17 });
    const right = `locked && ${r}.answer == ${k}`;
    const wrongPick = `locked && choice == ${k} && ${r}.answer != ${k}`;
    bind(b, {
      label: `(${right} ? "✓  " : ${wrongPick} ? "✗  " : "") + ${r}.options[${k}]`,
      visible: `${r}.options.length > ${k}`,
      disabled: 'locked',
      opacity: `locked && !(${right}) && !(${wrongPick}) ? 0.5 : 1`,
      'fill.color': `${right} ? "${L.successSurface}" : ${wrongPick} ? "${L.errorSurface}" : "${L.background}"`,
      'stroke.paint.color': `${right} ? "${L.success}" : ${wrongPick} ? "${L.error}" : "${L.border}"`,
      ariaDescription: `${right} ? "Right answer" : ${wrongPick} ? "Wrong" : ""`,
    });
    return b;
  });
  const flashText = text(ctx, 'Feedback text', `{lastRight ? "✓ Correct. " : "✗ Not quite. "}{${r}.why}`, 20, 12, o.feedback.w - 40 - 190, { fontSize: 16, fontWeight: 600, lineHeight: 1.3 });
  const flash = bind(panel(ctx, 'Feedback', o.feedback.x, o.feedback.y, o.feedback.w, 74, [flashText], { role: 'region', stroke: stroke(L.border, 2) }), {
    visible: 'locked',
    'fill.color': `lastRight ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `lastRight ? "${L.success}" : "${L.error}"`,
    ariaLabel: `(lastRight ? "Correct. " : "Not quite. ") + ${r}.why`,
  });
  const nextBtn = bind(button(ctx, 'Next button', o.nextLabel ?? 'Next', o.feedback.x + o.feedback.w - 190 - 12, o.feedback.y + 14, 190), { visible: 'locked' });
  page.children.push(...answers, flash, nextBtn);
  answers.forEach((b, k) => {
    const open = g.then(click(g, b, `Answer ${k + 1}`), 'logic.if', { condition: `!locked && ${r}.options.length > ${k}` });
    whenTrue(g, open, setVar(v.locked, 'true'), setVar(v.choice, String(k)), setVar(v.lastRight, `${r}.answer == ${k}`), setVar(v.score, 'lastRight ? 1 : 0', 'add'), announce(`(lastRight ? "Correct. " : "Not quite. The right answer was " + ${r}.options[${r}.answer] + ". ") + ${r}.why`));
  });
  g.run(click(g, nextBtn, 'Next'), go(next));
  g.run(g.event('event.start', {}, 'Round starts'), setVar(v.locked, 'false'), setVar(v.choice, '-1'), setVar(v.lastRight, 'false'));
  return answers[0];
}

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Listening lab');
  const { project, L } = ctx;
  const v: Vars = {
    looping: variable(project, 'looping', 'boolean', false),
    slow: variable(project, 'slow', 'boolean', false),
    showText: variable(project, 'showText', 'boolean', false),
    score: variable(project, 'score', 'number', 0),
    locked: variable(project, 'locked', 'boolean', false),
    choice: variable(project, 'choice', 'number', -1),
    lastRight: variable(project, 'lastRight', 'boolean', false),
    misses: variable(project, 'misses', 'number', 0),
    message: variable(project, 'message', 'string', ''),
  };
  variable(project, 'rounds', 'list', ROUNDS);
  const highs = variable(project, 'highSounds', 'list', []);
  const lows = variable(project, 'lowSounds', 'list', []);

  const { page: hero, start } = heroPage(ctx, 'Listening lab', 'Train your ear: name a sound, compare two clips, sort sounds by dragging and spot what changed. Every clip also has a written description.');
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
    g.run(click(g, start, 'Navigation'), go(check));
    checklist.push(item('Write the title and the line under it on the first page', byName(hero, 'Subtitle'), hero));
  }

  //Sound check: headphones and volume, a test tone, and the way in without sound
  const box = contentBox(check);
  const tips = text(ctx, 'Sound check text', '1. Put your headphones on if you have them. Clips are easier to tell apart that way.\n2. Set your device volume to a comfortable level, about halfway.\n3. Press Play test sound. You should hear one steady note.\nOn a phone or tablet each clip needs its own tap to start.', box.x, box.y, 620, { fontSize: 19, lineHeight: 1.45 });
  const testBtn = button(ctx, 'Play test sound button', 'Play test sound', box.x, box.y + 214, 220, false);
  const heard = button(ctx, 'Heard it button', 'I heard it, start', box.x + 240, box.y + 214, 240);
  const noSound = button(ctx, 'No sound button', 'I can\'t use sound: show descriptions', box.x, box.y + 280, 480, false);
  const assure = text(ctx, 'Descriptions note', 'Every clip has a written description for anyone who cannot or would rather not listen. You can switch descriptions on or off on any round with the Descriptions button.', box.x, box.y + 350, 620, { fontSize: 16, color: L.muted, lineHeight: 1.4 });
  check.children.push(tips, testBtn, heard, noSound, assure);
  {
    const g = graph(check);
    g.then(click(g, testBtn, 'Test tone'), 'action.sound', { asset: sounds.test, solo: true, continue: 'start' });
    g.run(click(g, heard, 'Continue'), go(identify));
    g.run(click(g, noSound, 'Without sound'), setVar(v.showText, 'true'), go(identify));
  }
  checklist.push(item('Check the sound check wording suits your learners, and swap the test tone for your own if you like (the Play sound node on the test button)', tips, check));

  //Round 1: identify the sound
  {
    const b = contentBox(identify);
    const g = graph(identify);
    clipCard(ctx, identify, g, { title: 'Sound 1', asset: sounds.doorbell, description: 'Two soft bell notes, a higher one then a lower one, with a short gap between.' }, b.x, b.y, 448);
    switches(ctx, identify, g, v, b.x, b.y + 212);
    round(ctx, identify, g, v, 0, compare, { prompt: { x: b.x + 480, y: b.y, w: 448 }, answers: { x: b.x + 480, y: b.y + 62, w: 448, row: false }, feedback: { x: b.x, y: b.y + 290, w: b.width } });
  }

  //Round 2: compare two clips (playing one stops the other, so only one is heard at a time)
  {
    const b = contentBox(compare);
    const g = graph(compare);
    clipCard(ctx, compare, g, { title: 'Clip A', asset: sounds.steady, description: 'A steady, smooth note that stays the same.' }, b.x, b.y, 448);
    clipCard(ctx, compare, g, { title: 'Clip B', asset: sounds.rough, description: 'The same note, but it wobbles and buzzes.' }, b.x + 480, b.y, 448);
    switches(ctx, compare, g, v, b.x, b.y + 210);
    round(ctx, compare, g, v, 1, sort, { prompt: { x: b.x, y: b.y + 266, w: b.width }, answers: { x: b.x, y: b.y + 306, w: b.width, row: true }, feedback: { x: b.x, y: b.y + 366, w: b.width } });
  }

  //Round 3: sort the clips into two groups by dragging
  const sortBox = contentBox(sort);
  const sortedVars = [highs, lows];
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
  const total = sortedVars.map((l) => `${l.name}.length`).join(' + ');
  let firstChip: SceneNode;
  let firstZone: SceneNode;
  {
    const g = graph(sort);
    switches(ctx, sort, g, v, sortBox.x, sortBox.y);
    const count = text(ctx, 'Count', `Sorted {${total}} of ${CHIPS.length}. Wrong drops: {misses}`, sortBox.x + 500, sortBox.y + 10, 428, { fontSize: 18, fontWeight: 700, align: 'right' });
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
      const play = button(ctx, `${c.title} play button`, 'Play', sortBox.x + i * 232 + 156, chipY, 70, false);
      play.ariaLabel = `Play ${c.title}`;
      const desc = bind(text(ctx, `${c.title} description`, `Description: ${c.description}`, sortBox.x + i * 232, chipY + 54, 222, { fontSize: 14, lineHeight: 1.3, color: L.muted }), { visible: 'showText' });
      sort.children.push(chip, play, desc);
      g.then(click(g, play, `Play ${c.title}`), 'action.sound', { asset: c.asset, loop: 'looping', speed: `slow ? ${SLOW} : 1`, keepPitch: true, solo: true, continue: 'start' });
      return chip;
    });
    firstChip = chips[0];
    const feedback = text(ctx, 'Feedback', '{message}', sortBox.x, sortBox.y + 372, 700, { fontSize: 19, fontWeight: 600, bindings: { visible: 'message != ""' } });
    const keys = text(ctx, 'Keyboard help', 'With the keyboard: Tab to a sound, press Space to pick it up, use the arrow keys to choose a group and Space to drop it.', sortBox.x, sortBox.y + 424, 700, { fontSize: 13, color: L.muted });
    const see = bind(button(ctx, 'See next button', 'Next', sortBox.x + sortBox.width - 190, sortBox.y + 372, 190), { visible: `${total} == ${CHIPS.length}` });
    sort.children.push(feedback, keys, see);
    //A sound taken by a group, and one a group refused (below the Play rows of the graph)
    const by = Math.max(0, ...sort.logic.nodes.map((n) => n.y)) + 150;
    const ok = seq(sort, by, ['event.drop', { result: 'accepted' }, 'Sorting'], ['action.setVariable', { variable: v.message.id, op: 'set', value: 'event.layer + " goes in " + event.zone + ". Right."' }]);
    const done = put(sort, 'logic.if', 520, by, { condition: `${total} == ${CHIPS.length}` });
    const finished = put(sort, 'action.setVariable', 780, by - 60, { variable: v.message.id, op: 'set', value: `"All ${CHIPS.length} sorted. Well done!"` });
    const sayDone = put(sort, 'action.announce', 1040, by - 60, { text: 'message' });
    join(sort, ok[1], done);
    join(sort, done, finished, 'true');
    join(sort, finished, sayDone);
    seq(sort, by + 160, ['event.drop', { result: 'rejected' }, 'Sorting'], ['action.setVariable', { variable: v.misses.id, op: 'add', value: '1' }], ['action.setVariable', { variable: v.message.id, op: 'set', value: 'event.layer + " does not go in " + event.zone + ". Listen again and try the other group."' }], ['action.announce', { text: 'message' }]);
    seq(sort, by + 320, ['event.start', {}, 'Round starts'], ['action.dragReset', {}], ['action.setVariable', { variable: v.misses.id, op: 'set', value: '0' }], ['action.setVariable', { variable: v.message.id, op: 'set', value: '""' }]);
    goButton(sort, see, changed, by + 480);
  }

  //Round 4: what changed (the second clip is the first with one thing different)
  {
    const b = contentBox(changed);
    const g = graph(changed);
    clipCard(ctx, changed, g, { title: 'Before', asset: sounds.before, description: 'Three short beeps, all at the same pitch.' }, b.x, b.y, 448);
    clipCard(ctx, changed, g, { title: 'After', asset: sounds.after, description: 'Three short beeps, all higher than before.' }, b.x + 480, b.y, 448);
    switches(ctx, changed, g, v, b.x, b.y + 210);
    round(ctx, changed, g, v, 2, results.page, { prompt: { x: b.x, y: b.y + 266, w: b.width }, answers: { x: b.x, y: b.y + 306, w: b.width, row: true }, feedback: { x: b.x, y: b.y + 366, w: b.width }, nextLabel: 'See results' });
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
    item('To add a sound to the sorting round: duplicate a chip, its Play button and its description, then add a Play sound node for the new button and fix the "of 4" in the count, the Next button and the If node (Interactions tab)', firstChip, sort),
    item('Try the Loop, Slow and Descriptions buttons: Loop and Slow are the Loop and Speed settings of every Play sound node (Interactions tab), and "Stop other sounds first" is on so two clips never play over each other', byName(identify, 'Loop switch'), identify),
    item('Change the results text, and pick the colourway on the Themes tab. The brand parts are locked', results.result, results.page),
  );
  return { project, checklist };
}

export const listeningLab: BrandedStarter = {
  key: 'media/listening-lab',
  set: 'media',
  name: 'Listening lab',
  description: 'Ear training in four short rounds: identify a sound, compare A and B, sort sounds by dragging and spot what changed. Clips loop and play slowly with the pitch kept, each has a written description, and a sound check comes first. Placeholder tones to swap.',
  tags: ['audio', 'listening', 'sound', 'compare'],
  build,
};
