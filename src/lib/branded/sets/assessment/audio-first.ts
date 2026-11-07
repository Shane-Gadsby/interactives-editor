import { createNode, defaultAutoLayout, type LogicNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, card, contentBox, edge, item, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { bind, click, go, graph, heroPage, panel, setVar, variable } from './shared';

//Study skills, kept general. Each row: the prompt, an optional `say` (what a voice says instead of the prompt), the options
//(two to four, so a true or false row has two), `answer` (the place of the right option, from 1), `explain` (said and shown
//after the answer) and an optional `hint`.
const QUESTIONS = [
  {
    prompt: 'Which way of studying is usually best for remembering something for a long time?',
    options: ['Reading your notes again and again', 'Testing yourself from memory', 'Highlighting the key lines', 'Copying your notes out neatly'],
    answer: 2,
    explain: 'Trying to recall an idea from memory strengthens it more than re-reading does. Re-reading only makes the page feel familiar.',
    hint: 'Think about which one makes your brain work the hardest.',
  },
  {
    prompt: 'True or false: spreading your study over several days works better than doing it all the night before.',
    options: ['True', 'False'],
    answer: 1,
    explain: 'Short sessions over several days give you time to forget a little and recall it again, and that is what builds memory.',
    hint: 'Cramming can feel productive, but how much stays a week later?',
  },
  {
    prompt: 'How often should you take a short break in a long study session?',
    say: 'How often should you take a short break when you study for a long time?',
    options: ['Never, a break ruins your focus', 'Every 25 to 50 minutes', 'Only when you are too tired to carry on', 'Once, at the very end'],
    answer: 2,
    explain: 'Regular short breaks help you keep your attention up. Somewhere between twenty-five and fifty minutes suits most people.',
    hint: 'Most people cannot stay sharp for hours without stopping.',
  },
  {
    prompt: 'True or false: listening to songs with words is the best way to concentrate while you read.',
    options: ['True', 'False'],
    answer: 2,
    explain: 'The words in a song compete with the words you are reading. Quiet, or music without words, is easier for most people.',
    hint: 'Your brain is trying to follow two lots of words at once.',
  },
  {
    prompt: 'What is a good first step when an assignment feels too big?',
    options: ['Wait until the deadline is closer', 'Break it into smaller tasks with dates', 'Start with the last paragraph', 'Read everything ever written on it first'],
    answer: 2,
    explain: 'Small tasks with their own dates are easier to start and show you your progress.',
    hint: 'A big job is easier when it is a list of small ones.',
  },
  {
    prompt: 'Which of these is the best check that you really understand an idea?',
    options: ['You can explain it in your own words', 'You recognise it when you see it', 'You have underlined it', 'Your friend says it is easy'],
    answer: 1,
    explain: 'Explaining an idea in your own words shows you what you know and what you only recognise.',
    hint: 'Recognising something and being able to say it are not the same.',
  },
];
const MAX_OPTIONS = 4;

//The question showing, written once: `order` holds the question numbers in the order they are asked (all of them, then just the missed ones)
const CUR = 'questions[order[pos]]';
const SAY_QUESTION = `"Question " + (pos + 1) + " of " + order.length + ". " + (${CUR}.say || ${CUR}.prompt) + " " + ${CUR}.options.map((o, i) => (i + 1) + ". " + o).join(". ") + "."`;
const SAY_FEEDBACK = `(lastRight ? "Correct. " : "Not quite. The answer was " + ${CUR}.answer + ", " + ${CUR}.options[${CUR}.answer - 1] + ". ") + ${CUR}.explain`;
const SAY_HINT = `"Hint. " + ${CUR}.hint`;
const VOICE = 'spokenOn && voiceAvailable';

export function buildAudioFirstQuiz(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Audio-first quiz: study skills');
  const { project, L } = ctx;
  //Spoken prompts use a voice for this language only: change it with the text if you translate the quiz
  project.settings.readAloud = { lang: 'en' };

  variable(project, 'questions', 'list', QUESTIONS);
  const order = variable(project, 'order', 'list', QUESTIONS.map((_, i) => i));
  const pos = variable(project, 'pos', 'number', 0);
  const answered = variable(project, 'answered', 'boolean', false);
  const chosen = variable(project, 'chosen', 'number', 0);
  const lastRight = variable(project, 'lastRight', 'boolean', false);
  const tally = variable(project, 'tally', 'number', 0);
  const missed = variable(project, 'missed', 'list', []);
  const round = variable(project, 'round', 'number', 1);
  const hintShown = variable(project, 'hintShown', 'boolean', false);
  const spokenOn = variable(project, 'spokenOn', 'boolean', true);
  //0: the learner moves on by hand (the default). 4 or 8: the next question comes that many seconds after the answer has been spoken
  const pace = variable(project, 'pace', 'number', 0);
  const answeredAt = variable(project, 'answeredAt', 'number', 0);
  variable(project, 'messageHigh', 'string', 'Great work. You know your study skills.');
  variable(project, 'messageMid', 'string', 'A good start. Go through the ones you missed.');
  variable(project, 'messageLow', 'string', 'Have another go at the ones you missed, and listen to the explanations.');

  const { page: hero, start } = heroPage(ctx, 'Study skills: an audio-first quiz', 'Six questions you can answer by ear. Press 1 to 4, or tap an answer.', 'Start');
  const keysNote = text(ctx, 'Keys note', 'With a voice installed on your device each question is read aloud. R repeats it, S slows it down, H gives a hint, Space pauses, and 1 to 4 answers. Nothing is recorded or sent anywhere.', 48, hero.height * 0.42 + 256, hero.width * 0.62, { fontSize: 16, color: L.onGradient, lineHeight: 1.35 });
  hero.children.push(keysNote);
  const play = brandedPage(ctx, 'Audio-first quiz', { footer: 'Question {pos + 1} of {order.length}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'Audio-first quiz: study skills' });

  //The play page
  const box = contentBox(play);
  const qCard = card(ctx, 'Question card', box.x, box.y, box.width, 128);
  const qLabel = text(ctx, 'Question label', `Press 1 to {${CUR}.options.length}, or tap an answer`, box.x + 28, box.y + 16, 420, { fontSize: 15, fontWeight: 600, color: L.muted });
  const qText = text(ctx, 'Question', `{${CUR}.prompt}`, box.x + 28, box.y + 46, box.width - 56, { fontSize: 25, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const paceBtn = bind(button(ctx, 'Pace button', 'Next: by hand', box.x + box.width - 214, box.y + 12, 190, false), { label: 'pace == 0 ? "Next: by hand" : "Next: after " + pace + " s"' });
  Object.assign(paceBtn, { height: 34, fontSize: 14, cornerRadius: 17 });
  const bw = (box.width - 16) / 2;
  const answers: SceneNode[] = [];
  for (let k = 1; k <= MAX_OPTIONS; k++) {
    const b = button(ctx, `Answer ${k} button`, `${k}.  Option`, box.x + ((k - 1) % 2) * (bw + 16), box.y + 144 + Math.floor((k - 1) / 2) * 66, bw, false);
    Object.assign(b, { height: 56, cornerRadius: 14, fontSize: 17 });
    bind(b, {
      visible: `${CUR}.options.length >= ${k}`,
      label: `"${k}.  " + ${CUR}.options[${k - 1}]`,
      disabled: 'answered',
      'fill.color': `answered ? (${k} == ${CUR}.answer ? "${L.successSurface}" : ${k} == chosen ? "${L.errorSurface}" : "${L.background}") : "${L.background}"`,
      'stroke.paint.color': `answered ? (${k} == ${CUR}.answer ? "${L.success}" : ${k} == chosen ? "${L.error}" : "${L.border}") : "${L.border}"`,
    });
    answers.push(b);
  }
  const cw = (box.width - 4 * 10) / 5;
  const control = (name: string, label: string, i: number, bindings: Record<string, string>) => {
    const b = button(ctx, name, label, box.x + i * (cw + 10), box.y + 284, cw, false);
    Object.assign(b, { height: 40, fontSize: 14, cornerRadius: 20 });
    return bind(b, bindings);
  };
  const repeat = control('Repeat button', 'Repeat (R)', 0, { visible: 'voiceAvailable && spokenOn' });
  const slower = control('Slower button', 'Slower (S)', 1, { visible: 'voiceAvailable && spokenOn', label: '"Slower (S): " + readRate + "x"' });
  const hint = control('Hint button', 'Hint (H)', 2, { visible: `!answered && !!${CUR}.hint`, disabled: 'hintShown' });
  const pause = control('Pause button', 'Pause (Space)', 3, { visible: 'voiceAvailable && spokenOn' });
  const spoken = control('Spoken prompts button', 'Spoken prompts: on', 4, { visible: 'voiceAvailable', label: 'spokenOn ? "Spoken prompts: on" : "Spoken prompts: off"' });
  const hintText = bind(text(ctx, 'Hint text', `Hint: {${CUR}.hint}`, box.x, box.y + 336, box.width, { fontSize: 16, fontStyle: 'italic', color: L.muted }), { visible: 'hintShown && !answered' });
  const heading = text(ctx, 'Feedback heading', '{lastRight ? "✓ Correct" : "✗ Not quite"}', 24, 14, 400, { fontSize: 22, fontWeight: 700 });
  const why = text(ctx, 'Explanation', `{lastRight ? "" : "The answer was " + ${CUR}.answer + ": " + ${CUR}.options[${CUR}.answer - 1] + ". "}{${CUR}.explain}`, 24, 50, box.width - 48 - 200, { fontSize: 17, lineHeight: 1.35 });
  const next = bind(button(ctx, 'Next button', 'Next question', box.width - 24 - 180, 56, 180), { label: 'pos >= order.length - 1 ? "See my score" : "Next question"' });
  const feedback = bind(panel(ctx, 'Feedback', box.x, box.y + 356, box.width, 110, [heading, why, next], { role: 'region', stroke: stroke(L.border, 2) }), {
    visible: 'answered',
    'fill.color': `lastRight ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `lastRight ? "${L.success}" : "${L.error}"`,
    ariaLabel: `${SAY_FEEDBACK}`,
  });
  play.children.push(qCard, qLabel, qText, paceBtn, ...answers, repeat, slower, hint, pause, spoken, hintText, feedback);

  //Say it with the voice, or tell a screen reader when spoken prompts are off or the device has no voice
  const said = (g: ReturnType<typeof graph>, from: LogicNode, expr: string, port = 'out', wait = false): { voice: LogicNode; quiet: LogicNode } => {
    const gate = g.then(from, 'logic.if', { condition: VOICE }, port);
    const voice = g.then(gate, 'action.speak', { op: 'text', text: expr, wait }, 'true');
    const quiet = g.then(gate, 'action.announce', { text: expr, politeness: 'polite' }, 'false');
    return { voice, quiet };
  };
  const key = (g: ReturnType<typeof graph>, k: string, note?: string) => g.event('event.key', { key: k, type: 'keydown' }, note);
  const feed = (ev: LogicNode, first: LogicNode) => play.logic.edges.push(edge(ev, first));

  {
    const g = graph(play);
    //The page is only ever reached by a press (Start, or the review button), which is the tap that lets the first question be spoken
    said(g, g.event('event.start', {}, 'Say the question'), SAY_QUESTION);
    //The way on: Next, N or Enter. At the last question it goes to the score, else to the next question and says it.
    const nextEvent = click(g, next, 'Next question');
    const nextGuard = g.then(nextEvent, 'logic.if', { condition: 'answered' });
    feed(key(g, 'n', 'Key N'), nextGuard);
    feed(key(g, 'Enter', 'Key Enter'), nextGuard);
    const last = g.then(nextGuard, 'logic.if', { condition: 'pos >= order.length - 1' }, 'true');
    g.then(last, ...go(result), 'true');
    const advance = g.run(g.then(last, ...setVar(pos, '1', 'add'), 'false'), setVar(answered, 'false'), setVar(chosen, '0'), setVar(hintShown, 'false'));
    said(g, advance, SAY_QUESTION);

    //Answering: a click on the answer or its number key
    for (let k = 1; k <= MAX_OPTIONS; k++) {
      const ev = click(g, answers[k - 1], `Answer ${k}`);
      const guard = g.then(ev, 'logic.if', { condition: `!answered && ${CUR}.options.length >= ${k}` });
      feed(key(g, String(k), `Key ${k}`), guard);
      const marked = g.run(g.then(guard, ...setVar(chosen, String(k)), 'true'), setVar(answered, 'true'), setVar(answeredAt, 'Date.now()'), setVar(lastRight, `${k} == ${CUR}.answer`));
      //A miss goes on the list for the review at the end
      g.then(g.then(marked, 'logic.if', { condition: '!lastRight' }), 'action.setVariable', { variable: missed.id, op: 'push', value: 'order[pos]' }, 'true');
      const counted = g.then(marked, ...setVar(tally, 'lastRight ? 1 : 0', 'add'));
      const { voice, quiet } = said(g, counted, SAY_FEEDBACK, 'out', true);
      //With a pace set, the next question follows once the feedback has been said (a stale timer does nothing: it checks the answer is the one it waited for)
      const pacing = g.then(voice, 'logic.if', { condition: 'pace > 0' });
      play.logic.edges.push(edge(quiet, pacing));
      const short = g.then(pacing, 'logic.if', { condition: 'pace <= 4' }, 'true');
      const wait4 = g.then(short, 'action.delay', { ms: 4000 }, 'true');
      const wait8 = g.then(short, 'action.delay', { ms: 8000 }, 'false');
      const stillHere = g.then(wait4, 'logic.if', { condition: 'answered && Date.now() - answeredAt >= pace * 1000 - 100' });
      play.logic.edges.push(edge(wait8, stillHere));
      play.logic.edges.push(edge(stillHere, nextGuard, 'true'));
    }

    //Repeat: the question, or the feedback once it has been answered
    const rep = click(g, repeat, 'Repeat');
    const repGate = g.then(rep, 'logic.if', { condition: VOICE });
    g.then(repGate, 'action.speak', { op: 'text', text: `answered ? ${SAY_FEEDBACK} : ${SAY_QUESTION}` }, 'true');
    feed(key(g, 'r', 'Key R'), repGate);
    //Slower: one step down for good (it is remembered with the learner's other choices)
    const slow = click(g, slower, 'Slower');
    const slowGate = g.then(slow, 'logic.if', { condition: VOICE });
    g.then(slowGate, 'action.speak', { op: 'slower' }, 'true');
    feed(key(g, 's', 'Key S'), slowGate);
    //Hint
    const hintEv = click(g, hint, 'Hint');
    const hintGate = g.then(hintEv, 'logic.if', { condition: `!answered && !hintShown && !!${CUR}.hint` });
    feed(key(g, 'h', 'Key H'), hintGate);
    said(g, g.then(hintGate, ...setVar(hintShown, 'true'), 'true'), SAY_HINT);
    //Pause and carry on
    const pauseEv = click(g, pause, 'Pause');
    const pauseGate = g.then(pauseEv, 'logic.if', { condition: 'speaking' });
    g.then(pauseGate, 'action.speak', { op: 'pause' }, 'true');
    g.then(pauseGate, 'action.speak', { op: 'resume' }, 'false');
    feed(g.event('event.key', { key: 'Space', type: 'keydown' }, 'Key Space'), pauseGate);
    //Turn off spoken prompts (and on again)
    g.run(click(g, spoken, 'Spoken prompts'), ['action.setVariable', { variable: spokenOn.id, op: 'toggle' }], ['action.speak', { op: 'stop' }]);
    //The pace
    g.run(click(g, paceBtn, 'Pace'), setVar(pace, 'pace == 0 ? 4 : pace == 4 ? 8 : 0'));
  }
  {
    const g = graph(hero);
    g.run(
      click(g, start, 'Start'),
      setVar(order, 'questions.map((q, i) => i)'),
      setVar(pos, '0'),
      setVar(answered, 'false'),
      setVar(chosen, '0'),
      setVar(tally, '0'),
      ['action.setVariable', { variable: missed.id, op: 'clear' }],
      setVar(round, '1'),
      setVar(hintShown, 'false'),
      go(play),
    );
  }

  //The result page
  const body = contentBox(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 220);
  const scoreLabel = text(ctx, 'Score label', '{round > 1 ? "This time" : "Your score"}', body.x + 28, body.y + 24, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{tally} of {order.length}', body.x + 28, body.y + 60, 330, { fontSize: 56, fontWeight: 700, lineHeight: 1.1 });
  const scoreWords = text(ctx, 'Score words', 'questions right first time', body.x + 28, body.y + 146, 330, { fontSize: 18, color: L.muted });
  const message = text(ctx, 'Result message', '{tally / order.length >= 0.75 ? messageHigh : tally / order.length >= 0.5 ? messageMid : messageLow}', body.x + 420, body.y + 22, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3 });
  const review = bind(button(ctx, 'Missed questions button', 'Go through the missed ones (M)', body.x + 420, body.y + 120, 320), { visible: 'missed.length > 0' });
  const again = button(ctx, 'Try again button', 'Try the whole quiz again', body.x + 420, body.y + 176, 260, false);
  const hear = bind(button(ctx, 'Hear again button', 'Hear it again (R)', body.x + 700, body.y + 176, 220, false), { visible: 'voiceAvailable && spokenOn' });
  const reviewHeading = bind(text(ctx, 'Review heading', 'Questions to look at again', body.x, body.y + 244, 600, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 2 }), { visible: 'missed.length > 0' });
  const line = text(ctx, 'Review question', '•  {questions[item].prompt}', 0, 0, body.width, { fontSize: 15, lineHeight: 1.25 });
  const reviewList = createNode('frame', {
    name: 'Review list',
    x: body.x,
    y: body.y + 274,
    width: body.width,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'missed', layout: 'none', gap: 0, columns: 1 },
    children: [line],
  });
  result.children.push(scoreCard, scoreLabel, scoreText, scoreWords, message, review, again, hear, reviewHeading, reviewList);
  const SAY_SCORE = `"You got " + tally + " of " + order.length + (round > 1 ? " this time" : "") + ". " + (tally / order.length >= 0.75 ? messageHigh : tally / order.length >= 0.5 ? messageMid : messageLow) + (missed.length > 0 ? " You missed " + missed.length + (missed.length == 1 ? " question. Press M to go through it again." : " questions. Press M to go through them again.") : "")`;
  {
    const g = graph(result);
    said(g, g.event('event.start', {}, 'Result page'), SAY_SCORE);
    //The missed questions again: the order becomes the missed list, which starts empty again
    const redo = click(g, review, 'Missed questions');
    const redoGate = g.then(redo, 'logic.if', { condition: 'missed.length > 0' });
    feed2(result, key(g, 'm', 'Key M'), redoGate);
    g.run(g.then(redoGate, ...setVar(order, 'missed'), 'true'), setVar(pos, '0'), setVar(round, '1', 'add'), setVar(tally, '0'), ['action.setVariable', { variable: missed.id, op: 'clear' }], setVar(answered, 'false'), setVar(chosen, '0'), setVar(hintShown, 'false'), go(play));
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    const hearEv = click(g, hear, 'Hear it again');
    const hearGate = g.then(hearEv, 'logic.if', { condition: VOICE });
    g.then(hearGate, 'action.speak', { op: 'text', text: SAY_SCORE }, 'true');
    feed2(result, key(g, 'r', 'Key R'), hearGate);
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page, and the note about the keys under the Start button', hero.children.find((c) => c.name === 'Page title'), hero),
    item('Write your own questions: the "questions" variable (Variables tab) is a list, one entry per question. Each has a prompt, the options (two to four; a true or false question has two), answer (the place of the right option, counting from 1), explain (said and shown after the answer) and an optional hint', qText, play),
    item('Add "say" to a question when a voice reads it badly (a formula, an abbreviation, a long scenario): it is said instead of the prompt, and the options are still read after it', qText, play),
    item('Add or remove questions in that list: the "Question n of N" footer, the score and the review all follow its length', undefined, play),
    item('Say the options the way you want them heard, and keep each one short: a voice reads all of them before the learner can answer', answers[0], play),
    item('Set the language of the spoken prompts in Project settings, Read aloud (it is English here). A voice for another language is never used, so translating the questions means changing it too', undefined, play),
    item('Decide how the quiz moves on: by hand is the default. The "pace" variable is 0 (by hand), 4 or 8 (seconds after the answer has been spoken); the Pace button on the question page cycles it for the learner', paceBtn, play),
    item('Reword the three result messages: the messageHigh, messageMid and messageLow variables', message, result),
    item('Try it with a voice installed and with none (turn it off in your computer\'s settings or use another browser). With no voice the spoken buttons hide and it is an ordinary keyboard quiz with the same feedback on the page', undefined, play),
    item('Do not offer it as the route for a screen reader user: they already have a reader, and two voices at once is worse. "Spoken prompts" turns the voice off, and the feedback is then announced to the reader instead', spoken, play),
    item('Change the colours for the whole piece with the Themes tab: the colourways are already set up', undefined, play),
  ];
  return { project, checklist };
}

//An extra wire from one event to a node (an event that feeds a chain another event already starts)
function feed2(page: { logic: { edges: ReturnType<typeof edge>[] } }, ev: LogicNode, first: LogicNode): void {
  page.logic.edges.push(edge(ev, first));
}
