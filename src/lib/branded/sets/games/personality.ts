//Personality quiz: six questions whose answers add points to four outcomes (study styles), a results page with the top outcome, its description, a picture and the scores, and Retake.
import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, heading, item, picture, solid, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { Graph, addVar, announce, bind, go, heroPage, set, spreadPages } from './common';

//The four outcomes, in the order the points below use
export const OUTCOMES = [
  { name: 'The Planner', text: 'You like to know where you are heading. A clear schedule, a calendar full of due dates and a checklist to tick off keep you calm and on track. Keep it up, and leave a little slack in the plan for the week it all goes sideways.' },
  { name: 'The Explorer', text: 'Curiosity drives you. You read around a topic, chase the interesting tangent and learn best when something surprises you. Try pairing that with a simple deadline for each stage so the good ideas make it into your final work.' },
  { name: 'The Collaborator', text: 'You learn by talking things through. Study groups, tutorials and a friendly argument over an idea help it stick. Make sure you also set aside time to work alone, so you know what you can do without the group.' },
  { name: 'The Reflector', text: 'You like to think before you act and to understand why something is true. Quiet time, your own notes and a good summary work well for you. Test yourself out loud now and then, so the thinking turns into answers.' },
];

//Each answer adds points to the outcomes in the same order: two to the one it fits best, one to a second
type Answer = { text: string; points: number[] };
export const QUESTIONS: { q: string; answers: Answer[] }[] = [
  {
    q: 'It is the start of semester. What do you do first?',
    answers: [
      { text: 'Put every due date in a calendar', points: [2, 0, 0, 1] },
      { text: 'Browse every course site to see what looks interesting', points: [0, 2, 1, 0] },
      { text: 'Message people in my course to see who is studying what', points: [0, 1, 2, 0] },
      { text: 'Read the course outline slowly and think about what it asks of me', points: [1, 0, 0, 2] },
    ],
  },
  {
    q: 'How do you like to prepare for an exam?',
    answers: [
      { text: 'Hunt for extra examples and read around the topic', points: [0, 2, 0, 1] },
      { text: 'Work through a study timetable I made weeks ago', points: [2, 1, 0, 0] },
      { text: 'Reread my notes and write a summary in my own words', points: [0, 0, 1, 2] },
      { text: 'Quiz each other in a study group', points: [0, 0, 2, 0] },
    ],
  },
  {
    q: 'A hard idea is not making sense. What do you do?',
    answers: [
      { text: 'Ask a classmate or a tutor to talk it through with me', points: [0, 0, 2, 1] },
      { text: 'Break it into small steps and take one a day', points: [2, 0, 0, 1] },
      { text: 'Look for a video or a different explanation', points: [0, 2, 1, 0] },
      { text: 'Leave it overnight and come back with fresh eyes', points: [0, 1, 0, 2] },
    ],
  },
  {
    q: 'Where do you study best?',
    answers: [
      { text: 'A quiet corner with no distractions', points: [0, 0, 0, 2] },
      { text: 'Somewhere new each week, like a cafe or the library', points: [0, 2, 1, 0] },
      { text: 'A tidy desk with everything where it belongs', points: [2, 0, 0, 1] },
      { text: 'A busy room where other people are working too', points: [1, 0, 2, 0] },
    ],
  },
  {
    q: 'An assignment has just been released. You...',
    answers: [
      { text: 'Think it over for a day before writing anything down', points: [0, 0, 1, 2] },
      { text: 'Plan backwards from the due date', points: [2, 0, 0, 0] },
      { text: 'Read widely before choosing an angle', points: [0, 2, 0, 1] },
      { text: 'Talk through ideas with other students first', points: [0, 1, 2, 0] },
    ],
  },
  {
    q: 'What do you enjoy most about learning?',
    answers: [
      { text: 'Sharing what I know with other people', points: [0, 0, 2, 1] },
      { text: 'Understanding why something is true', points: [1, 0, 0, 2] },
      { text: 'Ticking things off and seeing my progress', points: [2, 1, 0, 0] },
      { text: 'Finding something I did not expect', points: [0, 2, 1, 0] },
    ],
  },
];

const ANSWER_W = 456;
const ANSWER_H = 100;

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'What is your study style?');
  const { project, L } = ctx;
  addVar(project, 'outcomes', 'list', OUTCOMES);
  addVar(project, 'questions', 'list', QUESTIONS);
  const q = addVar(project, 'q', 'number', 0);
  const scores = addVar(project, 'scores', 'list', OUTCOMES.map(() => 0));
  const top = addVar(project, 'top', 'number', 0);

  const hero = heroPage(ctx, 'What is your study style?', 'Six quick questions about how you like to learn. There are no wrong answers.');
  const page = brandedPage(ctx, 'Pick the answer that sounds most like you', { name: 'Questions', footer: 'Study style quiz' });
  const result = brandedPage(ctx, 'Your study style', { name: 'Your result', footer: 'Study style quiz' });
  const checklist: TemplateChecklistItem[] = [];

  const hg = new Graph(hero.page);
  hg.run(hg.click(hero.start, 'Begin'), go(page));
  checklist.push(item('Write the title and the line under it on the first page', hero.page.children.find((n) => n.name === 'Subtitle'), hero.page));

  //The question and its four answers
  const box = contentBox(page);
  const where = text(ctx, 'Where', 'Question {q + 1} of {questions.length}', box.x, box.y, 400, { fontSize: 17, fontWeight: 600, color: L.muted });
  const track = createNode('rect', { name: 'Progress track', x: box.x, y: box.y + 30, width: box.width, height: 8, cornerRadius: 4, fill: solid(L.surfaceMuted), stroke: null, decorative: true });
  const bar = createNode('rect', { name: 'Progress bar', x: box.x, y: box.y + 30, width: 8, height: 8, cornerRadius: 4, fill: solid(L.button), stroke: null, decorative: true });
  bind(bar, { width: `Math.max(8, ${box.width} * q / Math.max(1, questions.length))` });
  const ask = heading(ctx, 'Question', QUESTIONS[0].q, box.x, box.y + 58, box.width, { fontSize: 28, autoSize: 'none', height: 80, bindings: { text: 'questions[q].q' } } as never);
  const answerText = text(ctx, 'Answer text', '{item.text}', 20, 12, ANSWER_W - 40, { fontSize: 20, lineHeight: 1.3, autoSize: 'none', height: ANSWER_H - 24, verticalAlign: 'middle', decorative: true });
  const answer = createNode('frame', {
    name: 'Answer',
    x: 0,
    y: 0,
    width: ANSWER_W,
    height: ANSWER_H,
    cornerRadius: 16,
    clip: false,
    role: 'button',
    focusable: true,
    fill: solid(L.surface),
    stroke: { paint: solid(L.border), width: 2 },
    children: [answerText],
    bindings: { ariaLabel: '"Answer " + (index + 1) + ": " + item.text' },
  } as never);
  const answers = createNode('frame', {
    name: 'Answers',
    x: box.x,
    y: box.y + 150,
    width: ANSWER_W * 2 + 16,
    height: ANSWER_H * 2 + 16,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'Answers',
    repeat: { items: 'questions.length > 0 ? questions[q].answers : []', layout: 'grid', gap: 16, columns: 2 },
    children: [answer],
  } as never);
  page.children.push(where, track, bar, ask, answers);

  const g = new Graph(page);
  const onStart = g.start('Back to the first question');
  g.run(onStart, set(q, '0'), set(scores, '[0, 0, 0, 0]'), set(top, '0'), announce('"Question 1 of " + questions.length + ": " + questions[0].q'));
  //One click handler for every answer: event.index says which one
  const onAnswer = g.click(answer, 'Choose an answer');
  const scored = g.add('action.setVariable', { variable: scores.id, op: 'set', value: 'scores.map((s, i) => s + questions[q].answers[event.index].points[i])' }, onAnswer);
  const more = g.add('logic.if', { condition: 'q + 1 < questions.length' }, scored);
  g.runFrom(more, 'true', set(q, 'q + 1'), announce('"Question " + (q + 1) + " of " + questions.length + ": " + questions[q].q'));
  const last = g.add('action.setVariable', { variable: top.id, op: 'set', value: 'scores.reduce((m, s, i) => s > scores[m] ? i : m, 0)' }, more, 'false', { dy: 110 });
  g.run(last, go(result));

  //The result
  const rbox = contentBox(result);
  const pic = picture(ctx, 'Result picture', rbox.x, rbox.y, 360, 300);
  const rx = rbox.x + 392;
  const rw = rbox.width - 392;
  const kicker = text(ctx, 'Result label', 'Your study style is', rx, rbox.y, rw, { fontSize: 17, fontWeight: 600, color: L.muted });
  const name = heading(ctx, 'Result name', OUTCOMES[0].name, rx, rbox.y + 26, rw, { fontSize: 42, autoSize: 'none', height: 56, bindings: { text: 'outcomes[top].name' } } as never);
  const about = text(ctx, 'Result description', OUTCOMES[0].text, rx, rbox.y + 92, rw, { fontSize: 18, lineHeight: 1.4, autoSize: 'none', height: 170, bindings: { text: 'outcomes[top].text' } } as never);
  //How the four compared
  const rowName = text(ctx, 'Score name', '{item.name}', 0, 3, 150, { fontSize: 15, fontWeight: 600, autoSize: 'none', height: 22, decorative: true });
  const rowTrack = createNode('rect', { name: 'Score track', x: 160, y: 7, width: 280, height: 14, cornerRadius: 7, fill: solid(L.surfaceMuted), stroke: null, decorative: true });
  const rowBar = bind(createNode('rect', { name: 'Score bar', x: 160, y: 7, width: 8, height: 14, cornerRadius: 7, fill: solid(L.button), stroke: null, decorative: true }), { width: 'Math.max(8, item.pct * 2.8)', 'fill.color': `item.top ? "${L.button}" : "${L.border}"` });
  const rowPct = text(ctx, 'Score percent', '{item.pct}%', 452, 3, 60, { fontSize: 15, color: L.muted, autoSize: 'none', height: 22, decorative: true });
  const row = createNode('frame', { name: 'Score', x: 0, y: 0, width: rw, height: 28, fill: null, stroke: null, clip: false, children: [rowName, rowTrack, rowBar, rowPct], bindings: { ariaLabel: 'item.name + ", " + item.pct + " percent"' } } as never);
  const rows = createNode('frame', {
    name: 'Scores',
    x: rx,
    y: rbox.y + 276,
    width: rw,
    height: 4 * 34,
    fill: null,
    stroke: null,
    clip: false,
    role: 'region',
    ariaLabel: 'How your answers split across the four styles',
    repeat: { items: 'outcomes.map((o, i) => ({name: o.name, pct: Math.round(100 * scores[i] / Math.max(1, scores.reduce((a, b) => a + b, 0))), top: i == top}))', layout: 'vertical', gap: 6, columns: 1 },
    children: [row],
  } as never);
  const retake = button(ctx, 'Retake', 'Retake the quiz', rbox.x, rbox.y + rbox.height - 46, 220, true);
  result.children.push(pic, kicker, name, about, rows, retake);
  const rg = new Graph(result);
  rg.run(rg.click(retake, 'Retake'), go(page));

  checklist.push(
    item('Write your own outcomes: Project > Variables > "outcomes", a name and a description for each of the four. The result page shows the one with the most points', name, result),
    item('Write your own questions: Project > Variables > "questions", a question (q) and its answers, each with its text and a points list. The points go to the four outcomes in the order of the outcomes list, for example [2, 0, 0, 1] gives two to the first outcome and one to the fourth', ask, page),
    item('Keep the four points in every answer, and give each outcome a fair chance: every outcome should be the best fit for about as many answers as the others, or one will always win', answers, page),
    item('Each question has four answers (the layout is two by two). Add or remove whole questions freely: the counter and the progress bar follow the list', answers, page),
    item('Swap the grey picture on the result page for your own. For a picture per outcome, put one picture per outcome on top and bind each one\'s visibility to top == 0, top == 1 and so on', pic, result),
    item('Ties go to the outcome that comes first in the list. To change that, edit the Choose an answer flow: the node that sets "top"', answers, page),
  );

  spreadPages(project);
  return { project, checklist };
}

export const personalityQuiz: BrandedStarter = {
  key: 'games/personality-quiz',
  set: 'games',
  name: 'Personality quiz',
  description: 'Six questions, four answers each, every answer adding points to four study-style outcomes. A progress bar as you go, then a results page with the top style, its description, a picture placeholder and how your answers split across all four, and Retake.',
  tags: ['game', 'quiz', 'reflection', 'variables'],
  build,
};
