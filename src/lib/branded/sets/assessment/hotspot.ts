import { createNode, defaultAutoLayout, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setAreaShape, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, byName, contentBox, heading, item, picture, solid, stroke, text } from '../../kit';
import { fill, extrasChecklist, questionExtras, stack } from '../../parts';
import type { Colourway } from '../../looks';
import { announce, bind, brandQuestionFrame, click, goNext, graph, heroPage, noteBelow, scorePage, setVar, variable } from './shared';

// ------------------------------------------------------------------------------------------------ Find the hotspot

//The question kit's hotspot question, in the brand: the picture is a grey placeholder with a few sample labels on it (so the
//sample plays before there is an image), the areas are invisible until picked, and the outlines come from tokens
const AREAS = [
  { id: 'o1', text: 'Planner', shape: 'rect' as const, x: 40, y: 128, w: 150, h: 84, label: 'Planner' },
  { id: 'o2', text: 'Clock', shape: 'ellipse' as const, x: 440, y: 16, w: 92, h: 92, label: 'Clock' },
  { id: 'o3', text: 'Laptop', shape: 'rect' as const, x: 224, y: 84, w: 170, h: 120, label: 'Laptop' },
  { id: 'o4', text: 'Plant', shape: 'rect' as const, x: 480, y: 128, w: 80, h: 96, label: 'Plant' },
];

export function buildFindHotspot(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Find the hotspot');
  const { project, L } = ctx;
  const { page: hero, start } = heroPage(ctx, 'Find the hotspot', 'Look at the picture and click the right place. You have two tries.', 'Start');
  const page = brandedPage(ctx, 'Find the spot', { footer: 'Find the hotspot' });
  const box = contentBox(page);

  const id = addQuestion(project, page.id, 'hotspot', { at: { x: box.x, y: box.y }, ...questionExtras(project, { hint: true, tryAgain: true }) })!;
  setQuestionSettings(project, page.id, id, {
    prompt: 'Click the item on the desk that helps you plan your week.',
    options: AREAS.map((a) => ({ id: a.id, text: a.text, ...(a.id === 'o1' ? { correct: true, feedback: 'Yes, the planner is where you lay out your week.' } : { feedback: `Not the ${a.text.toLowerCase()}. Look for something you would write plans in.` }) })),
    hints: ['You would write in it, and it shows days and dates.'],
    hintPenalty: 0,
    attempts: 2,
    feedbackCorrect: 'You found it. A planner helps you see the whole week at a glance.',
    feedbackIncorrect: 'Not there. Have another look at the picture and try again.',
    feedbackOutOfTries: 'Out of tries. The planner is outlined for you.',
    reveal: true,
    report: null,
  });
  const frame = page.children.find((c) => c.id === id) as FrameNode;
  const P = frame.question!.prefix;
  frame.name = 'Hotspot question';
  frame.width = 640;
  frame.layout = { ...frame.layout!, padding: { top: 16, right: 24, bottom: 16, left: 24 } };
  const spots = partsOf(frame).spots[0] as FrameNode;
  spots.height = 236;
  //The areas are one group the question's single click flow reads: the picked area's place in it is the option
  const group = partsOf(frame).spotAreas[0] as FrameNode;
  group.height = 236;
  //The picture: a grey placeholder with sample labels to delete once the real picture is in
  const pic = partsOf(frame).picture[0] as FrameNode;
  Object.assign(pic, { height: 236, fill: solid(L.surfaceMuted), ariaLabel: 'Picture placeholder: a desk with a planner, a clock, a laptop and a plant. Replace with your own image and describe it here.' });
  pic.children = AREAS.map((a) => text(ctx, `Sample label: ${a.label}`, a.label, a.x, a.y + a.h / 2 - 12, a.w, { fontSize: 15, color: L.muted, align: 'center', decorative: true }));
  for (const a of AREAS) setAreaShape(project, page.id, id, a.id, a.shape);
  syncQuestion(project, page.id, id);
  const areas = AREAS.map((a, i) => {
    const n = partsOf(frame).spot.find((s) => s.questionPart === `spot:${a.id}`) as SceneNode & { fill?: unknown; stroke?: unknown };
    const row = `${frame.question!.prefix}_items[${i}]?`;
    Object.assign(n, { x: a.x, y: a.y, width: a.w, height: a.h, fill: solid('transparent'), stroke: stroke('transparent', 4) });
    //Invisible until picked, then the token colours say how it went (the kit's own use plain hex)
    n.bindings = {
      ...n.bindings,
      'fill.color': `${row}.state == "correct" ? "${L.successSurface}" : ${row}.state == "wrong" ? "${L.errorSurface}" : ${row}.state == "missed" ? "${L.warningSurface}" : "transparent"`,
      'stroke.paint.color': `${row}.state == "correct" ? "${L.success}" : ${row}.state == "wrong" ? "${L.error}" : ${row}.state == "missed" ? "${L.warning}" : ${row}.selected ? "${L.primary}" : "transparent"`,
    };
    return n;
  });
  brandQuestionFrame(ctx, frame);

  //The side card: what to do, tries left, how it went. One column, so nothing in it can land on anything else
  const sideTitle = heading(ctx, 'How it works title', 'How it works', 0, 0, 100, { fontSize: 20 });
  const sideBody = text(ctx, 'How it works text', 'Select the area you think is right, then press Check answer. Use Tab and the arrow keys to move between areas, and Enter or Space to select one.', 0, 0, 100, { fontSize: 15, lineHeight: 1.4 });
  const tries = text(ctx, 'Tries left', `Tries left: {Math.max(0, ${P}_triesLeft)}`, 0, 0, 100, { fontSize: 18, fontWeight: 700, color: L.logoTextOnLight });
  const outcome = bind(text(ctx, 'Outcome', `{${P}_correct ? "✓ You found it" : "✗ Out of tries"}`, 0, 0, 100, { fontSize: 18, fontWeight: 700 }), { visible: `${P}_locked`, color: `${P}_correct ? "${L.success}" : "${L.error}"` });
  const side = fill(stack('How it works card', 0, 0, 100, { gap: 12, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [sideTitle, sideBody, tries, outcome] }));
  page.children = page.children.filter((c) => c.id !== id);
  page.children.push(stack('Play body', box.x, box.y, box.width, { direction: 'row', gap: 32, align: 'start', children: [frame, side] }));

  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  noteBelow(page, { text: '**One flow for every area** The areas sit in the "Areas" group and a single click flow hands Choose option the area\'s place, so adding an area in the Question section adds no flow.', colour: 'sky' });
  noteBelow(page, { x: 456, text: '[ ] Put your picture in the grey placeholder, delete the sample labels, then drag each area over its place. Areas are invisible to a learner until picked.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Swap the grey picture for your own: select the "Picture" layer inside the question and put your image in it, and write what it shows in its text alternative', pic, page),
    item('Delete the grey "Sample label" texts on the picture once your own picture is in', pic.children[0], page),
    item('Move and resize each "Area" layer over the right place on your picture (they are invisible when playing, so a learner sees nothing until they pick one). Use the Question section to rename an area, set the right one and write the feedback for each', areas[0], page),
    item('Write your question, the hint and the three feedback messages in the Question section of the inspector', frame, page),
    item('Change how many tries a learner gets (Question section, Tries) and keep the "Tries left" text on the right in step', tries, page),
    item('Try it with the keyboard: Tab to an area, Enter to select it, then Check answer', undefined, page),
  ];
  checklist.push(item(extrasChecklist({ hint: true, tryAgain: true })));
  return { project, checklist };
}

// ------------------------------------------------------------------------------------- Find multiple hotspots

//A water cycle picture to find five things in. The targets are one list the author edits; the areas are layers over the picture.
const TARGETS = [
  { name: 'The sun', feedback: 'The sun warms the water and drives the whole cycle.', x: 480, y: 14, w: 100, h: 100 },
  { name: 'A cloud', feedback: 'Water vapour cools and gathers into clouds.', x: 250, y: 40, w: 170, h: 84 },
  { name: 'Falling rain', feedback: 'When the droplets grow heavy they fall as rain.', x: 300, y: 150, w: 120, h: 110 },
  { name: 'The river', feedback: 'Runoff gathers into streams and rivers, heading for the sea.', x: 40, y: 330, w: 250, h: 62 },
  { name: 'The hills', feedback: 'Rain that lands on hills runs downhill, or soaks into the ground.', x: 30, y: 200, w: 200, h: 110 },
];

export function buildFindHotspots(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Find the hotspots');
  const { project, L } = ctx;
  const N = TARGETS.length;

  //Each target carries its own place on the picture, so the areas are one repeated layer drawn from this list
  variable(project, 'targets', 'list', TARGETS);
  variable(project, 'showSampleLabels', 'boolean', true);
  const found = variable(project, 'found', 'list', []);
  const wrong = variable(project, 'wrong', 'number', 0);
  const message = variable(project, 'message', 'string', '');
  variable(project, 'wrongMessage', 'string', 'Nothing there. Keep looking.');
  variable(project, 'messageGood', 'string', 'Sharp eyes. You found everything without a wrong click.');
  variable(project, 'messageOk', 'string', 'You found them all. A few wrong clicks on the way, which is fine.');
  variable(project, 'messageLow', 'string', 'You found them all in the end. Look at the picture again and see where the wrong clicks went.');
  variable(project, 'allFound', 'boolean', false, { formula: 'found.length >= targets.length', live: true });
  variable(project, 'resultMessage', 'string', '', { formula: 'wrong == 0 ? messageGood : wrong <= 5 ? messageOk : messageLow', live: true });

  const { page: hero, start } = heroPage(ctx, 'Find the hotspots', 'Five things are hidden in one picture. Find them all, and see how many wrong clicks it takes.', 'Start');
  const page = brandedPage(ctx, 'Find them all', { footer: '{found.length} of {targets.length} found. Wrong clicks: {wrong}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'Find the hotspots' });
  const box = contentBox(page);

  const PICW = 616;
  const PICH = 420;
  const pic = picture(ctx, 'Main picture', 0, 0, PICW, PICH);
  Object.assign(pic, { role: 'button', focusable: false, ariaLabel: 'Picture placeholder: a landscape with the sun, a cloud, rain, a river and hills. Replace with your own image.' });

  //One area, repeated for each target: placed and sized from its row, outlined and ticked once found. Its sample label is the words inside it
  const tick = bind(text(ctx, 'Area tick', '✓', 4, 2, 28, { fontSize: 22, fontWeight: 700, color: L.success, decorative: true }), { visible: 'found.includes(index)' });
  const sample = bind(text(ctx, 'Sample label', '{item.name}', 0, 0, 100, { fontSize: 15, color: L.muted, align: 'center', decorative: true, autoSize: 'none', height: 24, verticalAlign: 'middle' }), { visible: 'showSampleLabels && !found.includes(index)', width: 'item.w', y: 'item.h / 2 - 12' });
  const area = createNode('frame', {
    name: 'Area',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    cornerRadius: 12,
    fill: solid('transparent'),
    stroke: stroke('transparent', 4),
    clip: false,
    role: 'button',
    focusable: true,
    cursor: 'pointer',
    ariaLabel: 'item.name',
    children: [sample, tick],
  } as never);
  bind(area, {
    x: 'item.x',
    y: 'item.y',
    width: 'item.w',
    height: 'item.h',
    'stroke.paint.color': `found.includes(index) ? "${L.success}" : "transparent"`,
    'fill.color': `found.includes(index) ? "${L.successSurface}" : "transparent"`,
    ariaLabel: 'item.name',
    ariaDescription: 'found.includes(index) ? "Found" : ""',
  });
  const areas = createNode('frame', {
    name: 'Areas',
    x: 0,
    y: 0,
    width: PICW,
    height: PICH,
    fill: null,
    stroke: null,
    clip: false,
    repeat: { items: 'targets', layout: 'none', gap: 0, columns: 1 },
    children: [area],
  } as never);
  const board = createNode('frame', { name: 'Picture board', x: 0, y: 0, width: PICW, height: PICH, fill: null, stroke: null, clip: false, children: [pic, areas] } as never);

  //Right column: the list, the counts and what just happened
  const listTitle = heading(ctx, 'Find these', 'Find these', 0, 0, 100, { fontSize: 22 });
  const row = text(ctx, 'Target', '{item.found ? "✓ " : "○ "}{item.name}', 0, 0, 100, { fontSize: 18, autoSize: 'height' });
  bind(row, { color: 'item.found ? "' + L.success + '" : "' + L.text + '"', fontWeight: 'item.found ? 700 : 400' });
  const list = createNode('frame', {
    name: 'Targets list',
    x: 0,
    y: 0,
    width: 100,
    height: 150,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: 'Things to find',
    layout: { ...defaultAutoLayout('column'), gap: 6, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'targets.map((t, i) => ({name: t.name, found: found.includes(i)}))', layout: 'none', gap: 0, columns: 1 },
    children: [row],
  } as never);
  const count = text(ctx, 'Found count', 'Found {found.length} of {targets.length}', 0, 0, 100, { fontSize: 20, fontWeight: 700, color: L.logoTextOnLight });
  const wrongCount = text(ctx, 'Wrong clicks', 'Wrong clicks: {wrong}', 0, 0, 100, { fontSize: 18, color: L.muted });
  const feedbackText = text(ctx, 'Feedback text', '{message}', 0, 0, 100, { fontSize: 16, lineHeight: 1.35 });
  const feedback = bind(stack('Feedback', 0, 0, 100, { padding: 16, box: { fill: solid(L.surface), stroke: stroke(L.border, 2), cornerRadius: 16 }, extra: { role: 'region' }, children: [feedbackText] }), {
    visible: 'message != ""',
    'fill.color': `found.length > 0 && message != wrongMessage ? "${L.successSurface}" : "${L.warningSurface}"`,
    'stroke.paint.color': `found.length > 0 && message != wrongMessage ? "${L.success}" : "${L.warning}"`,
    ariaLabel: 'message',
  });
  const finish = bind(button(ctx, 'See result button', 'See my result', 0, 0, 190), { visible: 'allFound' });
  const column = fill(stack('Find column', 0, 0, 100, { gap: 12, children: [listTitle, list, count, wrongCount, feedback, finish] }));
  page.children.push(stack('Play body', box.x, box.y, box.width, { direction: 'row', gap: 32, align: 'start', children: [board, column] }));

  {
    const g = graph(page);
    //One flow for every area: the copy that was pressed gives event.index, and a find that is already ticked does nothing
    const on = g.event('event.pointer', { target: area.id, type: 'click', onlyIf: '!found.includes(event.index)' }, 'Find an area');
    g.run(
      on,
      ['action.setVariable', { variable: found.id, op: 'push', value: 'event.index' }],
      setVar(message, 'targets[event.index].feedback'),
      announce('"Found " + targets[event.index].name + ". " + found.length + " of " + targets.length + ". " + targets[event.index].feedback'),
    );
    //Any other click on the picture is a wrong one, until everything is found
    const miss = g.event('event.pointer', { target: pic.id, type: 'click', onlyIf: '!allFound' }, 'A click on the picture, nowhere that counts');
    g.run(miss, setVar(wrong, '1', 'add'), setVar(message, 'wrongMessage'), announce('wrongMessage + " Wrong clicks: " + wrong'));
    g.run(click(g, finish, 'Navigation'), goNext());
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  //The result page
  const again = button(ctx, 'Try again button', 'Try again', 0, 0, 170);
  scorePage(ctx, result, {
    label: 'You found',
    score: '{found.length} of {targets.length}',
    caption: 'Wrong clicks: {wrong}',
    message: '{resultMessage}',
    buttons: [again],
  });
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Result page'), announce('"You found " + found.length + " of " + targets.length + " with " + wrong + " wrong clicks. " + resultMessage'));
  }

  noteBelow(page, { text: '**One repeated area** The areas are one layer drawn for each row of `targets`, placed by its `x`, `y`, `w` and `h`, and one click flow reads `event.index`. A new target is a new row, not a new layer and flow.', colour: 'sky' });
  noteBelow(page, { x: 456, text: '[ ] Put your picture in the grey placeholder, set each target\'s place in the Variables tab (the areas show on the canvas as you type), then turn `showSampleLabels` off.', colour: 'gold' });
  noteBelow(result, { text: '**Live variables** `allFound` shows the result button and `resultMessage` picks the wording from the wrong clicks. [ ] Reword the three messages in the Variables tab.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Swap the grey picture for your own and write what it shows in its text alternative', pic, page),
    item('Turn the grey sample labels off once your own picture is in: the "showSampleLabels" variable (Variables tab)', area, page),
    item('Write what to find, what to say when it is found and where it is: the "targets" variable (Variables tab) is a list with name, feedback and the area\'s x, y, w and h in pixels from the picture\'s top left. The areas move on the canvas as you edit them', area, page),
    item('Check the areas in the Preview: they are invisible until found, so move them over the thing they name until the outline sits right', area, page),
    item(`To add a target: add an entry to "targets" (there are ${N} now). The area, the list and the counts follow it`, undefined, page),
    item('Reword the message for a wrong click and the three result messages: the wrongMessage, messageGood, messageOk and messageLow variables (Variables tab)', byName(result, 'Result message'), result),
    item('Check the right-hand list: it follows the "targets" variable, so a longer list needs more room', list, page),
  ];
  return { project, checklist };
}
