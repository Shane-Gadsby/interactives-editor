import { createNode, defaultAutoLayout, type FrameNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, card, contentBox, item, solid, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { whenTrue } from './gate';
import { announce, bind, click, go, graph, heroPage, panel, setVar, variable } from './shared';

//The water cycle, one stage per step. In each step one statement is true: it is the sentence that goes into the summary.
const STEPS = [
  {
    prompt: 'The water cycle starts here',
    statements: ['The sun heats water in oceans and rivers, and some of it becomes vapour.', 'The sun makes water disappear for good.', 'Water only moves when it rains.', 'Oceans give water to the air only at night.'],
    answer: 0,
    line: 'The sun heats water, and some of it rises as vapour (evaporation).',
  },
  {
    prompt: 'High in the air',
    statements: ['Vapour gets warmer as it rises and spreads out.', 'Vapour cools as it rises and turns into tiny droplets that form clouds.', 'Vapour turns into salt.'],
    answer: 1,
    line: 'In cooler air the vapour turns into droplets and forms clouds (condensation).',
  },
  {
    prompt: 'Back to the ground',
    statements: ['Clouds keep every droplet forever.', 'Droplets fall as rain, hail or snow once they are heavy enough.', 'Water falls only into the sea.', 'Rain is made on the ground and floats up to the clouds.'],
    answer: 1,
    line: 'When droplets are heavy enough they fall as rain, hail or snow (precipitation).',
  },
  {
    prompt: 'On the land',
    statements: ['Water that lands on the ground may run downhill into streams and rivers.', 'Water on land always stays where it falls.', 'Rivers flow away from the sea.'],
    answer: 0,
    line: 'Some of the water runs downhill into streams and rivers (runoff).',
  },
  {
    prompt: 'Under the ground',
    statements: ['Soil cannot hold any water.', 'Some of the water soaks in, feeds plants and refills groundwater.', 'Water below the ground never comes out again.'],
    answer: 1,
    line: 'Some soaks into the soil and feeds plants and groundwater (infiltration), and the cycle goes on.',
  },
];

const SLOTS = [0, 1, 2, 3];

export function buildSummary(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Summary');
  const { project, L } = ctx;
  const N = STEPS.length;

  variable(project, 'steps', 'list', STEPS);
  const step = variable(project, 'step', 'number', 0);
  const tries = variable(project, 'tries', 'number', 0);
  const wrongs = variable(project, 'wrongs', 'list', []);
  const locked = variable(project, 'locked', 'boolean', false);
  const summary = variable(project, 'summary', 'list', []);
  const score = variable(project, 'score', 'number', 0);
  const message = variable(project, 'message', 'string', '');
  variable(project, 'wrongMessage', 'string', 'Not that one. Read the statements again and choose the one that is true.');
  variable(project, 'rightMessage', 'string', 'Yes. That sentence is added to your summary.');
  variable(project, 'messageHigh', 'string', 'Well done. You built the whole summary, almost without a slip.');
  variable(project, 'messageMid', 'string', 'You built the summary. Read it through, then have another go for a clean run.');
  variable(project, 'messageLow', 'string', 'You built the summary in the end. Read it through and try again.');

  const { page: hero, start } = heroPage(ctx, 'Build a summary', `A summary takes ${N} steps. In each one, pick the true statement and it is added to your summary.`, 'Start');
  const play = brandedPage(ctx, 'Build the summary', { footer: 'Step {step + 1} of {steps.length}. Right first time: {score}' });
  const result = brandedPage(ctx, 'Your summary', { footer: 'Build a summary' });
  const box = contentBox(play);

  const LEFT = 580;
  const heading = text(ctx, 'Step heading', 'Step {step + 1} of {steps.length}: {steps[step].prompt}', box.x, box.y, LEFT, { fontSize: 22, fontWeight: 700, role: 'heading', headingLevel: 2 });
  const sub = text(ctx, 'Instruction', 'Which statement is true?', box.x, box.y + 32, LEFT, { fontSize: 16, color: L.muted });
  play.children.push(heading, sub);

  //Up to four statements: a slot is hidden when the step has fewer
  const statements = SLOTS.map((i) => {
    const mark = text(ctx, `Statement ${i + 1} mark`, `{locked && steps[step].answer == ${i} ? "✓" : wrongs.includes(${i}) ? "✗" : ""}`, 560 - 44, 18, 28, { fontSize: 24, fontWeight: 700, align: 'right', decorative: true });
    bind(mark, { color: `wrongs.includes(${i}) ? "${L.error}" : "${L.success}"` });
    const words = text(ctx, `Statement ${i + 1} text`, `{steps[step].statements[${i}]}`, 18, 0, LEFT - 36 - 36, { fontSize: 17, lineHeight: 1.3, decorative: true, height: 68, verticalAlign: 'middle' });
    const frame = createNode('frame', {
      name: `Statement ${i + 1}`,
      x: box.x,
      y: box.y + 66 + i * 78,
      width: LEFT,
      height: 68,
      cornerRadius: 14,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'button',
      focusable: true,
      cursor: 'pointer',
      children: [words, mark],
    }) as FrameNode;
    mark.x = LEFT - 44;
    bind(frame, {
      visible: `steps[step].statements.length > ${i}`,
      ariaLabel: `steps[step].statements[${i}]`,
      ariaDescription: `locked && steps[step].answer == ${i} ? "True. Added to the summary." : wrongs.includes(${i}) ? "Not true" : ""`,
      opacity: `wrongs.includes(${i}) ? 0.55 : 1`,
      'fill.color': `locked && steps[step].answer == ${i} ? "${L.successSurface}" : wrongs.includes(${i}) ? "${L.errorSurface}" : "${L.background}"`,
      'stroke.paint.color': `locked && steps[step].answer == ${i} ? "${L.success}" : wrongs.includes(${i}) ? "${L.error}" : "${L.border}"`,
    });
    play.children.push(frame);
    return frame;
  });

  const feedback = bind(text(ctx, 'Feedback', '{message}', box.x, box.y + 66 + 4 * 78 - 2 + 0, LEFT - 210, { fontSize: 16, fontWeight: 600, lineHeight: 1.3, role: 'region' }), {
    visible: 'message != ""',
    color: `locked ? "${L.success}" : "${L.error}"`,
    ariaLabel: 'message',
  });
  const next = bind(button(ctx, 'Next step button', 'Next step', box.x + LEFT - 190, box.y + 66 + 4 * 78 - 8, 190), {
    visible: 'locked',
    label: 'step >= steps.length - 1 ? "See my summary" : "Next step"',
  });
  play.children.push(feedback, next);

  //The growing summary: a panel with a line for each sentence picked so far
  const sideX = box.x + LEFT + 28;
  const sideW = box.width - LEFT - 28;
  const sideTitle = text(ctx, 'Summary title', 'Your summary so far', 20, 16, sideW - 40, { fontSize: 18, fontWeight: 700, role: 'heading', headingLevel: 2 });
  const empty = bind(text(ctx, 'Summary empty', 'Nothing here yet. Each true statement you find is added here.', 20, 52, sideW - 40, { fontSize: 15, color: L.muted }), { visible: 'summary.length == 0' });
  //Text in a repeated row is not measured by the player, so each row says how tall it is (about 36 characters a line here)
  const line = bind(text(ctx, 'Summary line', '•  {item}', 0, 0, sideW - 40, { fontSize: 15, lineHeight: 1.3 }), { height: 'Math.ceil(item.length / 34) * 20' });
  const lines = createNode('frame', {
    name: 'Summary lines',
    x: 20,
    y: 52,
    width: sideW - 40,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: 'The summary so far',
    layout: { ...defaultAutoLayout('column'), gap: 10, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'summary', layout: 'none', gap: 0, columns: 1 },
    children: [line],
  } as never);
  const sidePanel = panel(ctx, 'Summary panel', sideX, box.y, sideW, box.height, [sideTitle, empty, lines], { role: 'region', ariaLabel: 'Your summary so far' });
  play.children.push(sidePanel);

  {
    const g = graph(play);
    SLOTS.forEach((i) => {
      const ev = click(g, statements[i], `Pick statement ${i + 1}`);
      const open = g.then(ev, 'logic.if', { condition: `!locked && !wrongs.includes(${i}) && steps[step].statements.length > ${i}` });
      const right = g.then(open, 'logic.if', { condition: `steps[step].answer == ${i}` }, 'true');
      whenTrue(
        g,
        right,
        setVar(locked, 'true'),
        ['action.setVariable', { variable: summary.id, op: 'push', value: 'steps[step].line' }],
        setVar(score, 'tries == 0 ? 1 : 0', 'add'),
        setVar(message, 'rightMessage'),
        announce('rightMessage + " " + steps[step].line'),
      );
      const wrong = g.then(right, 'action.setVariable', { variable: wrongs.id, op: 'push', value: String(i) }, 'false');
      g.run(wrong, setVar(tries, '1', 'add'), setVar(message, 'wrongMessage'), announce('wrongMessage'));
    });
    const ev = click(g, next, 'Next step');
    const last = g.then(ev, 'logic.if', { condition: 'step >= steps.length - 1' });
    g.then(last, ...go(result), 'true');
    g.run(
      g.then(last, ...setVar(step, '1', 'add'), 'false'),
      setVar(locked, 'false'),
      setVar(tries, '0'),
      ['action.setVariable', { variable: wrongs.id, op: 'clear' }],
      setVar(message, '""'),
      announce('"Step " + (step + 1) + " of " + steps.length + ": " + steps[step].prompt'),
    );
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(play));
  }

  //The result page: the finished summary and how many steps went right first time
  const body = contentBox(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 280, 250);
  const scoreLabel = text(ctx, 'Score label', 'Right first time', body.x + 24, body.y + 24, 240, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{score} of {steps.length}', body.x + 24, body.y + 60, 240, { fontSize: 44, fontWeight: 700, lineHeight: 1.1 });
  const scoreWords = text(ctx, 'Score words', 'steps where your first pick was the true statement', body.x + 24, body.y + 124, 240, { fontSize: 16, color: L.muted });
  const again = button(ctx, 'Try again button', 'Try again', body.x + 24, body.y + 184, 170);
  const msg = text(ctx, 'Result message', '{score / steps.length >= 0.8 ? messageHigh : score / steps.length >= 0.5 ? messageMid : messageLow}', body.x + 312, body.y, body.width - 312, { fontSize: 22, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const doneLine = bind(text(ctx, 'Summary line', '•  {item}', 0, 0, body.width - 312 - 40, { fontSize: 17, lineHeight: 1.3 }), { height: 'Math.ceil(item.length / 58) * 23' });
  const doneLines = createNode('frame', {
    name: 'Summary lines',
    x: 20,
    y: 20,
    width: body.width - 312 - 40,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: 'Your finished summary',
    layout: { ...defaultAutoLayout('column'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'summary', layout: 'none', gap: 0, columns: 1 },
    children: [doneLine],
  } as never);
  const done = panel(ctx, 'Finished summary', body.x + 312, body.y + 78, body.width - 312, body.height - 78, [doneLines], { role: 'region', ariaLabel: 'Your finished summary' });
  result.children.push(scoreCard, scoreLabel, scoreText, scoreWords, again, msg, done);
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Result page'), announce('"Your summary is done. Right first time: " + score + " of " + steps.length + ". " + summary.join(" ")'));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your own steps: the "steps" variable (Variables tab) is a list. Each step has a heading (its "prompt" entry), statements (three or four, one of them true), answer (the number of the true one, counting from 0) and line (the sentence that goes into the summary). Keep those four names in each entry', heading, play),
    item(`Add or remove steps in that list: the footer, the "Step n of ${N}" heading and the score all follow its length`, undefined, play),
    item('Reword the messages: wrongMessage and rightMessage for each pick, and messageHigh, messageMid and messageLow on the last page (Variables tab)', msg, result),
    item('Check the summary panel on the right: the sentences are listed in the order they were found, so the steps should be in the order the finished summary reads', sidePanel, play),
    item('Change the points: a step scores when the first pick was right, set in the Pick flows (the Set variable "score" node, Interactions tab)', undefined, play),
    item('Try it with the keyboard: Tab to a statement and press Enter', undefined, play),
  ];
  return { project, checklist };
}
