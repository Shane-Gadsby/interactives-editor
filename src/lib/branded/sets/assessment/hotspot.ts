import { createNode, defaultAutoLayout, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setAreaShape, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, byName, card, contentBox, heading, item, picture, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { whenTrue } from './gate';
import { announce, bind, brandQuestionFrame, click, go, graph, heroPage, panel, setVar, variable } from './shared';

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

  const id = addQuestion(project, page.id, 'hotspot', { at: { x: box.x, y: box.y } })!;
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

  //The side card: what to do, tries left, how it went
  const sideX = box.x + 640 + 32;
  const sideW = box.width - 640 - 32;
  const side = card(ctx, 'How it works card', sideX, box.y, sideW, 290);
  const sideTitle = heading(ctx, 'How it works title', 'How it works', sideX + 20, box.y + 18, sideW - 40, { fontSize: 20 });
  const sideBody = text(ctx, 'How it works text', 'Select the area you think is right, then press Check answer. Use Tab and the arrow keys to move between areas, and Enter or Space to select one.', sideX + 20, box.y + 54, sideW - 40, { fontSize: 15, lineHeight: 1.4 });
  const tries = text(ctx, 'Tries left', `Tries left: {Math.max(0, ${P}_triesLeft)}`, sideX + 20, box.y + 206, sideW - 40, { fontSize: 18, fontWeight: 700, color: L.deep });
  const outcome = bind(text(ctx, 'Outcome', `{${P}_correct ? "✓ You found it" : "✗ Out of tries"}`, sideX + 20, box.y + 238, sideW - 40, { fontSize: 18, fontWeight: 700 }), { visible: `${P}_locked`, color: `${P}_correct ? "${L.success}" : "${L.error}"` });
  page.children.push(side, sideTitle, sideBody, tries, outcome);

  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(page));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Swap the grey picture for your own: select the "Picture" layer inside the question and put your image in it, and write what it shows in its text alternative', pic, page),
    item('Delete the grey "Sample label" texts on the picture once your own picture is in', pic.children[0], page),
    item('Move and resize each "Area" layer over the right place on your picture (they are invisible when playing, so a learner sees nothing until they pick one). Use the Question section to rename an area, set the right one and write the feedback for each', areas[0], page),
    item('Write your question, the hint and the three feedback messages in the Question section of the inspector', frame, page),
    item('Change how many tries a learner gets (Question section, Tries) and keep the "Tries left" text on the right in step', tries, page),
    item('Try it with the keyboard: Tab to an area, Enter to select it, then Check answer', undefined, page),
  ];
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

  variable(project, 'targets', 'list', TARGETS.map((t) => ({ name: t.name, feedback: t.feedback })));
  const found = variable(project, 'found', 'list', []);
  const wrong = variable(project, 'wrong', 'number', 0);
  const message = variable(project, 'message', 'string', '');
  variable(project, 'wrongMessage', 'string', 'Nothing there. Keep looking.');
  variable(project, 'messageGood', 'string', 'Sharp eyes. You found everything without a wrong click.');
  variable(project, 'messageOk', 'string', 'You found them all. A few wrong clicks on the way, which is fine.');
  variable(project, 'messageLow', 'string', 'You found them all in the end. Look at the picture again and see where the wrong clicks went.');

  const { page: hero, start } = heroPage(ctx, 'Find the hotspots', 'Five things are hidden in one picture. Find them all, and see how many wrong clicks it takes.', 'Start');
  const page = brandedPage(ctx, 'Find them all', { footer: '{found.length} of {targets.length} found. Wrong clicks: {wrong}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'Find the hotspots' });
  const box = contentBox(page);

  const PICW = 616;
  const PICH = 420;
  const pic = picture(ctx, 'Main picture', box.x, box.y, PICW, PICH);
  Object.assign(pic, { role: 'button', focusable: false, ariaLabel: 'Picture placeholder: a landscape with the sun, a cloud, rain, a river and hills. Replace with your own image.' });
  const picKids: SceneNode[] = TARGETS.map((t, i) => text(ctx, `Sample label ${i + 1}`, t.name, box.x + t.x, box.y + t.y + t.h / 2 - 12, t.w, { fontSize: 15, color: L.muted, align: 'center', decorative: true }));
  page.children.push(pic, ...picKids);

  //One area per target, over the picture: nothing shows until it is found, then an outline and a tick
  const areas = TARGETS.map((t, i) => {
    const tick = bind(text(ctx, `Area ${i + 1} tick`, '✓', 4, 2, 28, { fontSize: 22, fontWeight: 700, color: L.success, decorative: true }), { visible: `found.includes(${i})` });
    const area = createNode('frame', {
      name: `Area ${i + 1}`,
      x: box.x + t.x,
      y: box.y + t.y,
      width: t.w,
      height: t.h,
      cornerRadius: 12,
      fill: solid('transparent'),
      stroke: stroke('transparent', 4),
      clip: false,
      role: 'button',
      focusable: true,
      cursor: 'pointer',
      ariaLabel: t.name,
      children: [tick],
    } as never);
    bind(area, {
      'stroke.paint.color': `found.includes(${i}) ? "${L.success}" : "transparent"`,
      'fill.color': `found.includes(${i}) ? "${L.successSurface}" : "transparent"`,
      ariaLabel: `targets[${i}].name`,
      ariaDescription: `found.includes(${i}) ? "Found" : ""`,
      opacity: `found.includes(${i}) ? 0.9 : 1`,
    });
    page.children.push(area);
    return area;
  });

  //Right column: the list, the counts and what just happened
  const colX = box.x + PICW + 32;
  const colW = box.width - PICW - 32;
  const listTitle = heading(ctx, 'Find these', 'Find these', colX, box.y, colW, { fontSize: 22 });
  const row = text(ctx, 'Target', '{item.found ? "✓ " : "○ "}{item.name}', 0, 0, colW, { fontSize: 18 });
  bind(row, { color: 'item.found ? "' + L.success + '" : "' + L.text + '"', fontWeight: 'item.found ? 700 : 400' });
  const list = createNode('frame', {
    name: 'Targets list',
    x: colX,
    y: box.y + 38,
    width: colW,
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
  const count = text(ctx, 'Found count', 'Found {found.length} of {targets.length}', colX, box.y + 200, colW, { fontSize: 20, fontWeight: 700, color: L.deep });
  const wrongCount = text(ctx, 'Wrong clicks', 'Wrong clicks: {wrong}', colX, box.y + 232, colW, { fontSize: 18, color: L.muted });
  const feedback = bind(panel(ctx, 'Feedback', colX, box.y + 272, colW, 92, [text(ctx, 'Feedback text', '{message}', 16, 14, colW - 32, { fontSize: 16, lineHeight: 1.35 })], { role: 'region', stroke: stroke(L.border, 2) }), {
    visible: 'message != ""',
    'fill.color': `found.length > 0 && message != wrongMessage ? "${L.successSurface}" : "${L.warningSurface}"`,
    'stroke.paint.color': `found.length > 0 && message != wrongMessage ? "${L.success}" : "${L.warning}"`,
    ariaLabel: 'message',
  });
  const finish = bind(button(ctx, 'See result button', 'See my result', colX, box.y + 380, 190), { visible: 'found.length >= targets.length' });
  page.children.push(listTitle, list, count, wrongCount, feedback, finish);

  {
    const g = graph(page);
    TARGETS.forEach((t, i) => {
      const on = click(g, areas[i], `Find ${t.name}`);
      const fresh = g.then(on, 'logic.if', { condition: `!found.includes(${i})` });
      whenTrue(
        g,
        fresh,
        ...([
          ['action.setVariable', { variable: found.id, op: 'push', value: String(i) }],
          setVar(message, `targets[${i}].feedback`),
          announce(`"Found " + targets[${i}].name + ". " + found.length + " of " + targets.length + ". " + targets[${i}].feedback`),
        ] as [string, Record<string, unknown>][]),
      );
    });
    //Any other click on the picture is a wrong one, until everything is found
    const miss = click(g, pic, 'A click on the picture, nowhere that counts');
    const open = g.then(miss, 'logic.if', { condition: 'found.length < targets.length' });
    whenTrue(g, open, setVar(wrong, '1', 'add'), setVar(message, 'wrongMessage'), announce('wrongMessage + " Wrong clicks: " + wrong'));
    g.run(click(g, finish, 'Navigation'), go(result));
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(page));
  }

  //The result page
  const body = contentBox(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 230);
  const scoreLabel = text(ctx, 'Score label', 'You found', body.x + 28, body.y + 26, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{found.length} of {targets.length}', body.x + 28, body.y + 62, 330, { fontSize: 56, fontWeight: 700, lineHeight: 1.1 });
  const scoreWords = text(ctx, 'Score words', 'Wrong clicks: {wrong}', body.x + 28, body.y + 150, 330, { fontSize: 22, fontWeight: 600, color: L.muted });
  const resultMessage = text(ctx, 'Result message', '{wrong == 0 ? messageGood : wrong <= 5 ? messageOk : messageLow}', body.x + 420, body.y + 24, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const again = button(ctx, 'Try again button', 'Try again', body.x + 420, body.y + 150, 170);
  result.children.push(scoreCard, scoreLabel, scoreText, scoreWords, resultMessage, again);
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Result page'), announce('"You found " + found.length + " of " + targets.length + " with " + wrong + " wrong clicks. " + (wrong == 0 ? messageGood : wrong <= 5 ? messageOk : messageLow)'));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Swap the grey picture for your own and write what it shows in its text alternative', pic, page),
    item('Delete the grey "Sample label" texts on the picture once your own picture is in', picKids[0], page),
    item('Write what to find and what to say when it is found: the "targets" variable (Variables tab) is a list of name and feedback, in the same order as the "Area" layers', areas[0], page),
    item('Move and resize each "Area" layer over the thing it names. Areas are invisible until found, so check them in the Preview', areas[0], page),
    item(`To add a target: add an entry to "targets", duplicate an Area layer and its "Find" flow in the Interactions tab, and change the index (${N}) in the copy's expressions`, undefined, page),
    item('Reword the message for a wrong click and the three result messages: the wrongMessage, messageGood, messageOk and messageLow variables (Variables tab)', resultMessage, result),
    item('Check the right-hand list: it follows the "targets" variable, so a longer list needs more room', list, page),
  ];
  return { project, checklist };
}
