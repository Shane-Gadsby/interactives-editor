//Game map: a map page with five stage markers that unlock in order, a small activity page behind each, ticks for the ones done, and a reward page at the end.
import { createNode, type Artboard, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, contentBox, item, picture, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, darkButton, focus, go, goNext, groupPages, heroPage, lit, set } from './common';

export const STAGES = [
  {
    name: 'Find your sources',
    prompt: 'You need reliable sources for an assignment. Where is the best place to start?',
    options: ['The first result in a web search', 'Your library\'s search tools and databases', 'A friend\'s old assignment'],
    right: 1,
    why: 'Library databases hold published, reviewed work that you can cite.',
  },
  {
    name: 'Read critically',
    prompt: 'A website makes a big claim, but names no author and gives no sources. What should you do?',
    options: ['Copy the claim into your notes as fact', 'Use it, because it came up first in the search', 'Be careful with it and look for a more reliable source'],
    right: 2,
    why: 'Check who wrote it, when, and what evidence they give before you rely on it.',
  },
  {
    name: 'Take notes',
    prompt: 'True or false: writing notes in your own words, and noting the source as you go, helps you avoid accidental plagiarism.',
    options: ['True', 'False'],
    right: 0,
    why: 'Recording the source as you go means you can cite it properly later.',
  },
  {
    name: 'Write and cite',
    prompt: 'You use an idea from a source, in your own words. What must you do?',
    options: ['Cite the source', 'Nothing, it is in your own words now', 'Cite it only if it is a direct quote'],
    right: 0,
    why: 'A paraphrased idea still belongs to its author, so it needs a citation.',
  },
  {
    name: 'Review and submit',
    prompt: 'What is a good last step before you submit your work?',
    options: ['Submit straight away so it is not late', 'Delete the reference list to save space', 'Proofread, and check each citation matches your reference list'],
    right: 2,
    why: 'A last check catches small errors and missing references.',
  },
];

//Where each marker sits on the map picture (top left of its circle, from the picture's top left), the reward last
const SPOTS: [number, number][] = [[80, 270], [250, 130], [430, 240], [610, 100], [770, 230], [820, 40]];
const MARK = 64;
const MAP_H = 380;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Game map');
  const { project, L } = ctx;
  addVar(project, 'stages', 'list', STAGES.map((s) => s.name));
  const done = addVar(project, 'done', 'number', 0);
  const picked = addVar(project, 'picked', 'number', -1);
  //Each stage page says which option is right when it opens, and "right" follows from it, so every stage page runs the same flows
  const answer = addVar(project, 'answer', 'number', 0);
  const right = addVar(project, 'right', 'boolean', false, { formula: 'picked >= 0 && picked == answer', live: true });
  const message = addVar(project, 'message', 'string', '');

  const hero = heroPage(ctx, 'The research journey', 'Five stages from a blank page to a finished piece of work. Finish each one to unlock the next, then collect your reward.');
  const map = brandedPage(ctx, 'Choose your next stage', { name: 'Map', footer: '{done} of {stages.length} stages complete' });
  const stagePages: Artboard[] = STAGES.map((_, i) => brandedPage(ctx, `Stage ${i + 1}`, { footer: 'Stage {pageNumber} of {pageCount}' }));
  //The five stages are a chapter: pageNumber counts them from 1 whatever pages come before, so a stage page knows which stage it is
  groupPages(project, 'Stages', stagePages);
  const reward = brandedPage(ctx, 'You made it', { kind: 'end', name: 'Reward' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), goNext());
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The map: a picture to replace, a path, and a marker for each stage and the reward
  const box = contentBox(map);
  const mapPic = picture(ctx, 'Map picture', box.x, box.y, box.width, MAP_H);
  const centres = SPOTS.map(([x, y]) => [box.x + x + MARK / 2, box.y + y + MARK / 2] as [number, number]);
  const x0 = Math.min(...centres.map((c) => c[0]));
  const y0 = Math.min(...centres.map((c) => c[1]));
  const path = createNode('path', {
    name: 'Map path',
    x: x0,
    y: y0,
    width: Math.max(...centres.map((c) => c[0])) - x0,
    height: Math.max(...centres.map((c) => c[1])) - y0,
    fill: null,
    //white, so a marker's own outline (the border colour) stands off the path where it meets it
    stroke: stroke(L.background, 4),
    decorative: true,
    paths: [{ closed: false, points: centres.map(([x, y]) => ({ x: x - x0, y: y - y0 })) }],
  } as never);
  map.children.push(mapPic, path);

  const markers: SceneNode[] = [];
  const tags: SceneNode[] = [];
  const mg = new Graph(map);
  SPOTS.forEach(([x, y], i) => {
    const isReward = i === STAGES.length;
    const mark = text(ctx, `Stage ${i + 1} number`, isReward ? '★' : `{done > ${i} ? "✓" : ${i + 1}}`, 0, 13, MARK, { fontSize: 28, fontWeight: 700, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: 38, decorative: true });
    bind(mark, { color: isReward ? `done >= ${i} ? "${L.onButton}" : "${L.muted}"` : `done > ${i} ? "${L.background}" : done == ${i} ? "${L.onButton}" : "${L.muted}"` });
    const marker = createNode('frame', {
      name: isReward ? 'Reward marker' : `Stage ${i + 1} marker`,
      x,
      y,
      width: MARK,
      height: MARK,
      cornerRadius: MARK / 2,
      clip: false,
      role: 'button',
      focusable: true,
      cursor: 'pointer',
      fill: solid(L.surface),
      stroke: stroke(L.border, 3),
      children: [mark],
    } as never);
    bind(marker, {
      ariaLabel: isReward
        ? `"Reward, " + (done >= ${i} ? "ready, press Enter to open it" : "locked until all five stages are complete")`
        : `stages[${i}] + ", stage ${i + 1}, " + (done > ${i} ? "complete" : done == ${i} ? "ready, press Enter to start" : "locked, finish stage ${i} first")`,
      'fill.color': isReward ? `done >= ${i} ? "${L.button}" : "${L.surface}"` : `done > ${i} ? "${L.success}" : done == ${i} ? "${L.button}" : "${L.surface}"`,
      'stroke.paint.color': isReward ? `done >= ${i} ? "${L.primary}" : "${L.border}"` : `done > ${i} ? "${L.success}" : done == ${i} ? "${L.primary}" : "${L.border}"`,
    });
    //A name under it, on a small white tag so it reads over any picture
    tags.push(createNode('frame', { name: isReward ? 'Reward tag' : `Stage ${i + 1} tag`, x: box.x + x + MARK / 2 - 80, y: box.y + y + MARK + 6, width: 160, height: 28, cornerRadius: 14, clip: false, fill: solid(L.background), stroke: null, decorative: true, children: [text(ctx, isReward ? 'Reward label' : `Stage ${i + 1} label`, isReward ? 'Reward' : `{stages[${i}]}`, 0, 4, 160, { fontSize: 14, fontWeight: 600, align: 'center', autoSize: 'none', height: 20, decorative: true })] } as never));
    markers.push(marker);
  });
  //The markers are the children of one group, so one flow serves them all (event.childIndex is the marker: 0 to 4 the stages, 5 the reward)
  const markerGroup = createNode('group', { name: 'Stage markers', x: box.x, y: box.y, width: box.width, height: MAP_H, children: markers } as never);
  map.children.push(markerGroup, ...tags);
  const onMarker = mg.add('event.pointer', { target: markerGroup.id, type: 'click', childrenOnly: true, onlyIf: 'done >= event.childIndex' }, null, 'out', { note: 'A marker that is open' });
  mg.run(onMarker, ['action.artboard', { to: 'expression', expr: 'event.childIndex < stages.length ? "Stage " + (event.childIndex + 1) : "Reward"', transition: 'fade', duration: 300 }]);
  const onLocked = mg.add('event.pointer', { target: markerGroup.id, type: 'click', childrenOnly: true, onlyIf: 'done < event.childIndex' }, null, 'out', { note: 'A marker that is still locked' });
  mg.run(onLocked, set(message, 'event.childIndex >= stages.length ? "The reward unlocks when all five stages are complete." : "Stage " + (event.childIndex + 1) + " is locked. Finish stage " + event.childIndex + " first."'), announce('message'));
  const progress = text(ctx, 'Progress', '{message != "" ? message : done >= stages.length ? "Every stage is complete. Open the star to collect your reward." : "Choose stage " + (done + 1) + ". Each stage unlocks when you finish the one before."}', box.x, box.y + MAP_H + 14, box.width, { fontSize: 18, fontWeight: 600, autoSize: 'none', height: 52, lineHeight: 1.3 });
  map.children.push(progress);
  const onMapStart = mg.start('Back on the map');
  mg.run(onMapStart, ['action.resetVariables', { variables: [message.id] }], announce('done + " of " + stages.length + " stages complete"'));

  checklist.push(
    item('Swap the grey picture on the map for your own artwork, then drag the markers onto it. The path behind them is a plain line you can redraw or delete', mapPic, map),
    item('Rename the stages: Project > Variables > "stages". The map labels and the stage headings follow it (the page names in the page list are separate)', markers[0], map),
    item('Write each stage\'s activity: open the stage pages and change the prompt, the options, and the feedback line. Each stage is its own page, so a stage can be a different kind of task', stagePages[0].children.find((n) => n.name === 'Prompt'), stagePages[0]),
    item('Say which option is right on each stage page: the first step of its On start flow in the Interactions tab sets "answer" (0 is the first option, 1 the second). "right" is a live variable that follows from it', stagePages[0].children.find((n) => n.name === 'Option 1'), stagePages[0]),
    item('Stages unlock in order by the "done" count. To open them in any order, change the Only if on the open marker flow and the locked one (they read done and event.childIndex)', markers[1], map),
    item('Change the reward: the picture, the words and what happens next', reward.children.find((n) => n.name === 'Reward text'), reward),
  );

  //The five stage pages: a prompt, the options, feedback, then Complete the stage
  STAGES.forEach((s, i) => {
    const page = stagePages[i];
    const sb = contentBox(page);
    const title = page.children.find((n) => n.name === 'Page title') as SceneNode;
    bind(title, { text: '"Stage " + pageNumber + ": " + stages[pageNumber - 1]' });
    const prompt = text(ctx, 'Prompt', s.prompt, sb.x, sb.y, 620, { fontSize: 22, fontWeight: 600, lineHeight: 1.3, autoSize: 'none', height: 90 });
    const pic = picture(ctx, 'Stage picture', sb.x + 660, sb.y, 268, 250);
    const options = s.options.map((o, k) => {
      const label = text(ctx, `Option ${k + 1} text`, o, 20, 10, 580, { fontSize: 19, lineHeight: 1.25, autoSize: 'none', height: 46, verticalAlign: 'middle', decorative: true });
      const frame = createNode('frame', {
        name: `Option ${k + 1}`,
        x: 0,
        y: k * 76,
        width: 620,
        height: 66,
        cornerRadius: 14,
        clip: false,
        role: 'button',
        focusable: true,
        ariaLabel: `Option ${k + 1}: ${o}`,
        fill: solid(L.surface),
        stroke: stroke(L.border, 2),
        children: [label],
      } as never);
      bind(frame, {
        'fill.color': `picked == ${k} ? (right ? "${L.successSurface}" : "${L.errorSurface}") : "${L.surface}"`,
        'stroke.paint.color': `picked == ${k} ? (right ? "${L.success}" : "${L.error}") : "${L.border}"`,
        ariaDescription: `picked == ${k} ? (right ? "Right" : "Not quite") : ""`,
      });
      return frame;
    });
    //The options are the children of one group: one flow serves them all (event.childIndex is the option picked)
    const optionGroup = createNode('group', { name: 'Options', x: sb.x, y: sb.y + 104, width: 620, height: s.options.length * 76 - 10, role: 'group', ariaLabel: 'Options', children: options } as never);
    const feedbackY = sb.y + 104 + s.options.length * 76 + 4;
    const feedback = text(ctx, 'Feedback', `{picked < 0 ? "" : right ? "That is right. " + ${lit(s.why)} : "Not quite. Have another look and try again."}`, sb.x, feedbackY, 620, { fontSize: 18, fontWeight: 600, lineHeight: 1.3, autoSize: 'none', height: 60 });
    bind(feedback, { color: `right ? "${L.success}" : picked >= 0 ? "${L.error}" : "${L.text}"` });
    const finish = bind(button(ctx, 'Complete the stage', 'Complete the stage', sb.x, sb.y + sb.height - 46, 240, true), { visible: 'right' });
    const back = button(ctx, 'Back to the map', 'Back to the map', sb.x + 256, sb.y + sb.height - 46, 200, false);
    page.children.push(prompt, pic, optionGroup, feedback, finish, back);

    const g = new Graph(page);
    const onStart = g.start('Fresh stage: which option is right');
    g.run(onStart, ['action.resetVariables', { variables: [picked.id] }], set(answer, String(s.right)));
    const onOption = g.add('event.pointer', { target: optionGroup.id, type: 'click', childrenOnly: true }, null, 'out', { note: 'Choose an option' });
    g.run(onOption, set(picked, 'event.childIndex'), announce(`right ? "That is right. " + ${lit(s.why)} : "Not quite. Have another look and try again."`));
    const onFinish = g.click(finish, 'Complete the stage');
    g.run(onFinish, set(done, 'Math.max(done, pageNumber)'), go(map));
    const onBack = g.click(back, 'Back to the map');
    g.run(onBack, go(map));
    //Focus goes to Complete the stage once it shows
    const onRight = g.add('event.variable', { variable: right.id, onlyIf: 'right' }, null, 'out', { note: 'Right answer' });
    g.run(onRight, focus(finish));
  });

  //The reward
  const rw = createNode('rect', { name: 'Reward picture', x: 452, y: 96, width: 120, height: 120, cornerRadius: 60, fill: solid(L.surfaceMuted), stroke: null, ariaLabel: 'Picture placeholder: replace with your own reward image' } as never);
  const rewardText = text(ctx, 'Reward text', 'You finished all {stages.length} stages. Well done!', 112, 400, 800, { align: 'center', color: L.onGradient, fontSize: 24, fontWeight: 700 });
  const replay = darkButton(ctx, 'Play again', 'Play again', 422, 470, 180);
  const rewardNote = text(ctx, 'Reward note', 'Add what the learner has earned here: a link, a code, a certificate or the next activity.', 112, 444, 800, { align: 'center', color: L.onGradient, fontSize: 17 });
  reward.children.push(rw, rewardText, rewardNote, replay);
  const rg = new Graph(reward);
  rg.run(rg.click(replay, 'Play again'), ['action.resetVariables', { variables: [done.id] }], go(map));

  //Notes for whoever edits the template, below the pages
  const below = (p: Artboard, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(map, { ...below(map, 0, 440), text: '**One flow for six markers.** They are the children of the Stage markers group, and one On pointer reads `event.childIndex`. Go to artboard is set to "named by an expression", so a stage page is found by its name, **Stage 1** to **Stage 5**, and **Reward**.', colour: 'sky' });
  addNote(map, { ...below(map, 456, 440), text: '[ ] Swap the grey map picture, then drag the markers onto it. Add a stage by duplicating a marker and a stage page (name the page **Stage 6**).', colour: 'gold' });
  addNote(stagePages[0], { ...below(stagePages[0], 0, 440), text: '**Live variable** `right` is `picked == answer`. Each stage page sets `answer` when it opens, and `pageNumber` (the page within the Stages group) is the stage number, so the five pages share the same flows.', colour: 'sky' });
  addNote(stagePages[0], { ...below(stagePages[0], 456, 440), text: '[ ] Change the prompt and options, and set which one is right in the On start flow (`answer`, counting from 0).', colour: 'gold' });

  return { project, checklist };
}

/** The map with every stage done, and each stage page with an answer picked (so its feedback shows). */
const MAP_LAYOUT_STATES: LayoutState[] = [
  { label: 'all stages done', page: 'Map', vars: { done: 5 } },
  { label: 'right option picked', page: STAGES.map((_, i) => `Stage ${i + 1}`), vars: { picked: 0, answer: 0 } },
  { label: 'wrong option picked', page: STAGES.map((_, i) => `Stage ${i + 1}`), vars: { picked: 1, answer: 0 } },
];

export const gameMap: BrandedStarter = {
  key: 'games/game-map',
  set: 'games',
  name: 'Game map',
  description: 'A map with five stage markers on a path. Stages unlock one after another, each opens its own activity page (a question to answer), finished stages get a tick, and finishing all five opens a reward page. Markers work with the keyboard and say whether they are locked.',
  tags: ['game', 'map', 'multi-page', 'variables'],
  build,
  layoutStates: MAP_LAYOUT_STATES,
};
