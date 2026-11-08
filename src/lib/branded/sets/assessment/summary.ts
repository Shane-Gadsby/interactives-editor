import { createNode, defaultAutoLayout, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, byName, contentBox, item, solid, text, todo, type LayoutState } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { fill, stack } from '../../parts';
import { bankQuestion, bind, click, goNext, graph, graphNote, heroPage, kitNode, noteBelow, variable } from './shared';

//The water cycle, one stage per step. In each step one statement is true (correct is its place, counting from 1): it is the sentence that goes into the summary.
const STEPS = [
  {
    heading: 'The water cycle starts here',
    options: ['The sun heats water in oceans and rivers, and some of it becomes vapour.', 'The sun makes water disappear for good.', 'Water only moves when it rains.', 'Oceans give water to the air only at night.'],
    correct: 1,
    line: 'The sun heats water, and some of it rises as vapour (evaporation).',
  },
  {
    heading: 'High in the air',
    options: ['Vapour gets warmer as it rises and spreads out.', 'Vapour cools as it rises and turns into tiny droplets that form clouds.', 'Vapour turns into salt.'],
    correct: 2,
    line: 'In cooler air the vapour turns into droplets and forms clouds (condensation).',
  },
  {
    heading: 'Back to the ground',
    options: ['Clouds keep every droplet forever.', 'Droplets fall as rain, hail or snow once they are heavy enough.', 'Water falls only into the sea.', 'Rain is made on the ground and floats up to the clouds.'],
    correct: 2,
    line: 'When droplets are heavy enough they fall as rain, hail or snow (precipitation).',
  },
  {
    heading: 'On the land',
    options: ['Water that lands on the ground may run downhill into streams and rivers.', 'Water on land always stays where it falls.', 'Rivers flow away from the sea.'],
    correct: 1,
    line: 'Some of the water runs downhill into streams and rivers (runoff).',
  },
  {
    heading: 'Under the ground',
    options: ['Soil cannot hold any water.', 'Some of the water soaks in, feeds plants and refills groundwater.', 'Water below the ground never comes out again.'],
    correct: 2,
    line: 'Some soaks into the soil and feeds plants and groundwater (infiltration), and the cycle goes on.',
  },
].map((s) => ({ ...s, prompt: 'Which statement is true?' }));

/** The play page with the summary part built and a wrong pick showing, and the finished summary, so the layout check sees the fullest they get. */
export const SUMMARY_LAYOUT_STATES: LayoutState[] = [
  { label: 'summary growing', page: 'Build the summary', vars: { q1_bankIndex: 2, q1_setPos: 3, q1_setCount: 5, q1_setLeft: 3, q1_answered: true, q1_correct: false, q1_feedback: 'Not that one. Read the statements again and choose the one that is true.', q1_setLog: STEPS.slice(0, 2).map((_, i) => ({ i, s: 1, p: 1, c: true })) } },
  { label: 'finished', page: 'Your summary', vars: { q1_setLog: STEPS.map((_, i) => ({ i, s: 1, p: 1, c: true })), q1_setScore: 4, q1_setMax: 5 } },
];

export function buildSummary(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Summary');
  const { project, L } = ctx;
  const N = STEPS.length;

  variable(project, 'steps', 'list', STEPS);
  variable(project, 'messageHigh', 'string', 'Well done. You built the whole summary, almost without a slip.');
  variable(project, 'messageMid', 'string', 'You built the summary. Read it through, then have another go for a clean run.');
  variable(project, 'messageLow', 'string', 'You built the summary in the end. Read it through and try again.');

  const { page: hero, start } = heroPage(ctx, 'Build a summary', `A summary takes ${N} steps. In each one, pick the true statement and it is added to your summary.`, 'Start');
  const play = brandedPage(ctx, 'Build the summary', { footer: 'Step {q1_setPos} of {q1_setCount}. Right first time: {q1_setScore}' });
  const result = brandedPage(ctx, 'Your summary', { footer: 'Build a summary' });
  const box = contentBox(play);

  //Each step is a row of a question bank: the statements are its options, and a wrong pick can be tried again but costs the point
  const { frame, P, progressRow, check } = bankQuestion(ctx, project, play, {
    kind: 'single',
    name: 'Step question',
    items: 'steps',
    noun: 'step',
    progressLabel: 'Steps built',
    tally: false,
    compose: false,
    patch: {
      prompt: STEPS[0].prompt,
      options: STEPS[0].options.map((t, i) => ({ id: `o${i + 1}`, text: t, ...(i + 1 === STEPS[0].correct ? { correct: true } : {}) })),
      attempts: 0,
      attemptPenalty: 1,
      reveal: false,
      feedbackCorrect: 'Yes. That sentence is added to your summary.',
      feedbackIncorrect: 'Not that one. Read the statements again and choose the one that is true.',
    },
  });
  //the live variable the summary panel and the result page read: the line of each step finished so far
  variable(project, 'summary', 'list', [], { formula: `${P}_setLog.map(e => steps[e.i].line)`, live: true });
  variable(project, 'message', 'string', '', { formula: `band(${P}_setMax > 0 ? ${P}_setScore / ${P}_setMax : 0, [0.8, 0.5], [messageHigh, messageMid, messageLow])`, live: true });

  const heading = text(ctx, 'Step heading', `Step {${P}_setPos} of {${P}_setCount}: {steps[Math.max(0, ${P}_bankIndex)].heading}`, 0, 0, 100, { fontSize: 22, fontWeight: 700, role: 'heading', headingLevel: 2 });
  const left = stack('Step column', 0, 0, 580, { gap: 16, children: [progressRow, heading, frame] });

  //The growing summary: a panel with a line for each sentence picked so far
  const sideTitle = text(ctx, 'Summary title', 'Your summary so far', 0, 0, 100, { fontSize: 18, fontWeight: 700, role: 'heading', headingLevel: 2 });
  const empty = bind(text(ctx, 'Summary empty', 'Nothing here yet. Each true statement you find is added here.', 0, 0, 100, { fontSize: 15, color: L.muted }), { visible: 'summary.length == 0' });
  const lines = (name: string, aria: string, size: number, gap: number) => createNode('frame', {
    name,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    role: 'list',
    ariaLabel: aria,
    layout: { ...defaultAutoLayout('column'), gap, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'summary', layout: 'none', gap: 0, columns: 1 },
    children: [text(ctx, 'Summary line', '•  {item}', 0, 0, 100, { fontSize: size, lineHeight: 1.3, autoSize: 'height' })],
  } as never);
  const sidePanel = fill(stack('Summary panel', 0, 0, 100, { gap: 12, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16 }, extra: { role: 'region', ariaLabel: 'Your summary so far' }, children: [sideTitle, empty, lines('Summary lines', 'The summary so far', 15, 10)] }));
  play.children.push(stack('Play body', box.x, box.y, box.width, { direction: 'row', gap: 28, align: 'start', children: [left, sidePanel] }));

  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }
  graphNote(play, { anchor: kitNode(play, 'start:event'), colour: 'sky', text: '**The question kit wired Start, Choose option and Next.** Next is the kit\'s Try again button relabelled: it deals the next step, and its Done output goes on to the summary page.' });
  graphNote(play, { anchor: check, colour: 'sky', text: '**Check answer follows Choose option,** so a statement is marked the moment it is picked. A wrong pick can be chosen again, but the second check costs the point.' });

  //The result page: the finished summary and how many steps went right first time
  const scoreLabel = text(ctx, 'Score label', 'Right first time', 0, 0, 100, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', `{${P}_setScore} of {${P}_setMax}`, 0, 0, 100, { fontSize: 44, fontWeight: 700, lineHeight: 1.1 });
  const scoreWords = text(ctx, 'Score words', 'steps where your first pick was the true statement', 0, 0, 100, { fontSize: 16, color: L.muted });
  const again = button(ctx, 'Try again button', 'Try again', 0, 0, 170);
  const scoreCard = stack('Score card', 0, 0, 280, { gap: 8, padding: 24, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [scoreLabel, scoreText, scoreWords] });
  const msg = text(ctx, 'Result message', '{message}', 0, 0, 100, { fontSize: 22, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const done = stack('Finished summary', 0, 0, 100, { gap: 8, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16 }, extra: { role: 'region', ariaLabel: 'Your finished summary' }, children: [lines('Finished lines', 'Your finished summary', 17, 8)] });
  const right = fill(stack('Result column', 0, 0, 100, { gap: 16, children: [msg, done] }));
  const left2 = stack('Score column', 0, 0, 280, { gap: 20, align: 'start', children: [scoreCard, again] });
  const boxR = contentBox(result);
  result.children.push(stack('Result body', boxR.x, boxR.y, boxR.width, { direction: 'row', gap: 32, align: 'start', children: [left2, right] }));
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Result page'), ['action.announce', { text: `"Your summary is done. Right first time: " + ${P}_setScore + " of " + ${P}_setMax + ". " + summary.join(" ")`, politeness: 'polite' }]);
  }

  noteBelow(play, { text: '**Question bank** Each step is a row of `steps`: its `options` are the statements and `correct` is the place of the true one. Attempts are unlimited, but a second check takes the point off, so the score is steps right first time.', colour: 'sky' });
  noteBelow(play, { x: 456, text: '**Live variable** `summary` is built from the question\'s own log of finished steps, so the panel and the result page read the same list. [ ] Put the steps in the order the finished summary should read.', colour: 'sky' });
  noteBelow(result, { text: '[ ] Reword the three messages in the Variables tab. `message` is a live variable banded from the score.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    todo('Write your own steps and their options', 'Write your own steps: the "steps" variable (Variables tab) is a list. Each step has a heading, a prompt that is the question shown ("Which statement is true?" for them all), options (three or four statements, one of them true), correct (the number of the true one, counting from 1) and line (the sentence that goes into the summary). Keep those five names in each entry', frame, play),
    todo('Add or remove steps as you need', `Add or remove steps in that list: the footer, the "Step n of ${N}" heading and the score all follow its length`, undefined, play),
    todo('Reword the right, wrong and result messages', 'Reword the messages: the right and wrong pick messages are the question\'s Right and Wrong feedback (Question section of the inspector), and messageHigh, messageMid and messageLow on the last page (Variables tab)', byName(result, 'Result message'), result),
    todo('Put the steps in the order the summary reads', 'Check the summary panel on the right: the sentences are listed in the order the steps were done, so the steps should be in the order the finished summary reads', byName(play, 'Summary panel'), play),
    todo('Change the points or allow part marks', 'Change the points: a step scores when the first pick was right. Set Retry on the question to something under 100% to give part marks for a second go', frame, play),
    todo('Try it with the keyboard only', 'Try it with the keyboard: Tab to a statement and press Enter', undefined, play),
  ];
  return { project, checklist };
}
