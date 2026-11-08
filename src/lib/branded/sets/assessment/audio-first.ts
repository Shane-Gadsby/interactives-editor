import { createNode, defaultAutoLayout, type FrameNode, type LogicNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setKitOptions, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, byName, contentBox, edge, solid, stroke, text, todo, type LayoutState } from '\.\./\.\./kit';
import type { Colourway } from '../../looks';
import { extrasChecklist, extrasShort, questionExtras, stack } from '\.\./\.\./parts';
import { after, bind, brandQuestionFrame, click, goNext, graph, graphNote, heroPage, kitNode, noteBelow, scorePage, variable } from './shared';


//Study skills, kept general. Each row of the question bank: the prompt, an optional `spoken` (what a voice says instead of the prompt), the
//options (two to four, so a true or false row has two), `correct` (the place of the right option, from 1), `explain` (said and shown
//after the answer) and an optional `hint`.
const QUESTIONS = [
  {
    prompt: 'Which way of studying is usually best for remembering something for a long time?',
    options: ['Reading your notes again and again', 'Testing yourself from memory', 'Highlighting the key lines', 'Copying your notes out neatly'],
    correct: 2,
    explain: 'Trying to recall an idea from memory strengthens it more than re-reading does. Re-reading only makes the page feel familiar.',
    hint: 'Think about which one makes your brain work the hardest.',
  },
  {
    prompt: 'True or false: spreading your study over several days works better than doing it all the night before.',
    options: ['True', 'False'],
    correct: 1,
    explain: 'Short sessions over several days give you time to forget a little and recall it again, and that is what builds memory.',
    hint: 'Cramming can feel productive, but how much stays a week later?',
  },
  {
    prompt: 'How often should you take a short break in a long study session?',
    spoken: 'How often should you take a short break when you study for a long time?',
    options: ['Never, a break ruins your focus', 'Every 25 to 50 minutes', 'Only when you are too tired to carry on', 'Once, at the very end'],
    correct: 2,
    explain: 'Regular short breaks help you keep your attention up. Somewhere between twenty-five and fifty minutes suits most people.',
    hint: 'Most people cannot stay sharp for hours without stopping.',
  },
  {
    prompt: 'True or false: listening to songs with words is the best way to concentrate while you read.',
    options: ['True', 'False'],
    correct: 2,
    explain: 'The words in a song compete with the words you are reading. Quiet, or music without words, is easier for most people.',
    hint: 'Your brain is trying to follow two lots of words at once.',
  },
  {
    prompt: 'What is a good first step when an assignment feels too big?',
    options: ['Wait until the deadline is closer', 'Break it into smaller tasks with dates', 'Start with the last paragraph', 'Read everything ever written on it first'],
    correct: 2,
    explain: 'Small tasks with their own dates are easier to start and show you your progress.',
    hint: 'A big job is easier when it is a list of small ones.',
  },
  {
    prompt: 'Which of these is the best check that you really understand an idea?',
    options: ['You can explain it in your own words', 'You recognise it when you see it', 'You have underlined it', 'Your friend says it is easy'],
    correct: 1,
    explain: 'Explaining an idea in your own words shows you what you know and what you only recognise.',
    hint: 'Recognising something and being able to say it are not the same.',
  },
];

/** Answered wrong, with the longest question and its explanation showing, and the score page with every question missed, so the layout check sees the fullest they get. */
export const AUDIO_FIRST_LAYOUT_STATES: LayoutState[] = [
  { label: 'answered', page: 'Audio-first quiz', vars: { q1_bankIndex: 2, q1_answered: true, q1_locked: true, q1_correct: false, q1_feedback: 'Not quite.', q1_hint: QUESTIONS[2].hint, q1_hintsUsed: 1, q1_setPos: 3, q1_setCount: 6, voiceAvailable: true, readRate: 0.75 } },
  { label: 'all missed', page: 'Your result', vars: { q1_missed: [0, 1, 2, 3, 4, 5], q1_setScore: 0, q1_setMax: 6, voiceAvailable: true } },
];

//What a voice says, or a screen reader is told when the voice is off or there is none (Read aloud's "With no voice" setting, and Only speak when)
const say = (text: string, extra: Record<string, unknown> = {}): [string, Record<string, unknown>] => ['action.speak', { op: 'text', text, fallback: 'announce', only: 'spokenOn', ...extra }];

export function buildAudioFirstQuiz(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Audio-first quiz: study skills');
  const { project, L } = ctx;
  //Spoken prompts use a voice for this language only: change it with the text if you translate the quiz
  project.settings.readAloud = { lang: 'en' };

  variable(project, 'questions', 'list', QUESTIONS);
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
  const play = brandedPage(ctx, 'Audio-first quiz', { footer: 'Question {q1_setPos} of {q1_setCount}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'Audio-first quiz: study skills' });

  //The questions are the rows of a bank gone through once. The kit's number keys choose an option, its Listen button reads the question and is the Repeat button, and the options sit two to a row
  const box = contentBox(play);
  const id = addQuestion(project, play.id, 'single', { at: { x: box.x, y: box.y }, ...questionExtras(project, { hint: true }) })!;
  setQuestionSettings(project, play.id, id, {
    prompt: QUESTIONS[0].prompt,
    options: QUESTIONS[0].options.map((t, i) => ({ id: `o${i + 1}`, text: t, ...(i + 1 === QUESTIONS[0].correct ? { correct: true } : {}) })),
    hints: [QUESTIONS[0].hint],
    hintPenalty: 0,
    points: 1,
    attempts: 1,
    reveal: true,
    report: null,
    feedbackCorrect: 'Correct.',
    feedbackIncorrect: 'Not quite.',
    numberKeys: true,
    listen: true,
    bank: { items: 'questions', order: 'sequence', end: 'finish' },
  });
  const frame = play.children.find((c) => c.id === id) as FrameNode;
  const P = frame.question!.prefix;
  frame.name = 'Audio question';
  frame.layout = { ...frame.layout!, gap: 8, padding: { top: 14, right: 24, bottom: 14, left: 24 } };
  Object.assign(partsOf(frame).prompt[0], { fontSize: 22 });
  //Picking an option answers, so no Check button; the verdict and the explanation are one line of feedback
  const buttonRow = partsOf(frame).buttons[0] as FrameNode;
  buttonRow.children = buttonRow.children.filter((c) => c.questionPart !== 'check' && c.questionPart !== 'score');
  Object.assign(partsOf(frame).feedback[0], { text: `{${P}_feedback}{${P}_answered ? " " + rowExplain : ""}` });
  //two options to a row
  const options = partsOf(frame).options[0] as FrameNode;
  options.layout = { ...options.layout!, direction: 'row', gap: 10, crossGap: 10, wrap: true, align: 'start', hugHeight: true };
  const template = options.children[0] as FrameNode;
  template.width = Math.floor((box.width - 48 - 10) / 2);
  syncQuestion(project, play.id, id);
  brandQuestionFrame(ctx, frame);
  const next = partsOf(frame).reset[0] as unknown as { label: string; shortcut?: string; bindings?: Record<string, string> };
  next.bindings = { ...next.bindings, label: `${P}_setLeft == 0 ? "See my score" : "Next question"` };
  next.shortcut = 'n';
  const hint = partsOf(frame).hint[0] as unknown as { label: string; shortcut?: string };
  Object.assign(hint, { label: 'Hint (H)', shortcut: 'h' });
  const repeat = partsOf(frame).listen[0] as unknown as { label: string; shortcut?: string; bindings?: Record<string, string> };
  Object.assign(repeat, { label: 'Repeat (R)', shortcut: 'r' });
  repeat.bindings = { ...repeat.bindings, visible: 'voiceAvailable && spokenOn' };
  //Repeat reads this question again, so it is the question's own: it leads the button row in the accent colour, and Next goes to the far right
  Object.assign(repeat, { fill: solid(ctx.L.accentButton), stroke: stroke(ctx.L.onAccentButton), color: ctx.L.onAccentButton });
  setKitOptions(project, play.id, id, { leadControls: [partsOf(frame).listen[0]] });

  //Live variables: what the row showing says (so the feedback and the speech read it once), and the banded message for the score page
  const rowNow = `questions[Math.max(0, ${P}_bankIndex)]`;
  variable(project, 'rowExplain', 'string', '', { formula: `${rowNow}.explain`, live: true });
  variable(project, 'rightPlace', 'number', 0, { formula: `${rowNow}.correct`, live: true });
  variable(project, 'rightText', 'string', '', { formula: `${rowNow}.options[${rowNow}.correct - 1]`, live: true });
  variable(project, 'message', 'string', '', { formula: `band(${P}_setMax > 0 ? ${P}_setScore / ${P}_setMax : 0, [0.75, 0.5], [messageHigh, messageMid, messageLow])`, live: true });

  //Controls under the question: slower, pause, spoken prompts on or off, and the pace
  const control = (name: string, label: string, shortcut: string | null, bindings: Record<string, string> = {}, width = 190) => {
    const b = button(ctx, name, label, 0, 0, width, false);
    Object.assign(b, { height: 40, fontSize: 14, cornerRadius: 20, ...(shortcut ? { shortcut } : {}) });
    return bind(b, bindings);
  };
  const slower = control('Slower button', 'Slower (S)', 's', { visible: 'voiceAvailable && spokenOn', label: '"Slower (S): " + readRate + "x"' });
  const pause = control('Pause button', 'Pause (Space)', 'Space', { visible: 'voiceAvailable && spokenOn' });
  const spoken = control('Spoken prompts button', 'Spoken prompts: on', null, { visible: 'voiceAvailable', label: 'spokenOn ? "Spoken prompts: on" : "Spoken prompts: off"' }, 210);
  const paceBtn = control('Pace button', 'Next: by hand', null, { label: 'pace == 0 ? "Next: by hand" : "Next: after " + pace + " s"' }, 190);
  const controls = stack('Controls', 0, 0, box.width, { direction: 'row', gap: 10, align: 'center', children: [slower, pause, spoken, paceBtn] });
  play.children = play.children.filter((c) => c.id !== id);
  play.children.push(stack('Play body', box.x, box.y, box.width, { gap: 8, children: [frame, controls] }));

  {
    const g = graph(play);
    //Say the question: where it is in the quiz, then the question with its numbered options (the question's own reading, with its "say it like" row)
    const sayQuestion = (from: LogicNode, port = 'out') => {
      const where = after(play, from, 'action.speak', say(`"Question " + ${P}_setPos + " of " + ${P}_setCount + "."`)[1], port);
      return after(play, where, 'action.speak', { op: 'question', question: frame.id, fallback: 'announce', only: 'spokenOn' });
    };
    //The page is only ever reached by a press (Start, or the review button), which is the tap that lets the first question be spoken
    //(arriving keeps the row showing: the review button has dealt the first of the missed ones already)
    kitNode(play, 'start:action').params.next = false;
    sayQuestion(kitNode(play, 'start:action'));
    const resetAct = kitNode(play, 'reset:action');
    sayQuestion(resetAct);
    after(play, resetAct, 'action.artboard', { to: 'next', transition: 'fade', duration: 250 }, 'done');
    graphNote(play, { anchor: kitNode(play, 'start:event'), colour: 'sky', text: '**Opening a question says it:** where it is in the quiz, then the question with its numbered options. Next does the same. *Only when* `spokenOn`, and the fallback announces it where the browser has no voice.' });
    //Picking an option, or its number key, checks it
    const check = after(play, kitNode(play, 'option:action'), 'action.questionCheck', { question: frame.id });
    play.logic.edges.push(edge(kitNode(play, 'numberKeys:action'), check));
    //Once it is checked: note when, say the feedback with the explanation (the right answer too when it was wrong), and with a pace set the next question follows
    graphNote(play, { anchor: check, colour: 'sky', text: '**A pick and a number key share one Check answer.** Its Finished output runs once, when the question is done.' });
    const when = after(play, check, 'action.setVariable', { variable: answeredAt.id, op: 'set', value: 'Date.now()' }, 'finished');
    const feedback = after(play, when, 'action.speak', say(`${P}_feedback + " " + (${P}_correct ? "" : "The answer was " + rightPlace + ", " + rightText + ". ") + rowExplain`, { wait: true })[1]);
    const pacing = after(play, feedback, 'logic.if', { condition: 'pace > 0' });
    const wait = after(play, pacing, 'action.delay', { ms: 'pace <= 4 ? 4000 : 8000' }, 'true');
    graphNote(play, { anchor: pacing, colour: 'sky', text: '**The pace is a timer, not a loop.** With `pace` above 0 the Wait runs and the If asks again, so a timer from an earlier answer, or one overtaken by pressing Next, does nothing.' });
    //a stale timer does nothing: it checks the answer is the one it waited for
    const still = after(play, wait, 'logic.if', { condition: `${P}_answered && Date.now() - answeredAt >= pace * 1000 - 100` });
    play.logic.edges.push(edge(still, resetAct, 'true'));
    //The hint is said as well as shown
    after(play, kitNode(play, 'hint:action'), 'action.speak', say(`"Hint. " + ${P}_hint`)[1]);
    //Enter moves on as well as N (the Next button's shortcut), once the question is answered
    const enterKey = g.event('event.key', { key: 'Enter', type: 'keydown', onlyIf: `${P}_locked` }, 'Key Enter');
    play.logic.edges.push(edge(enterKey, resetAct));
    graphNote(play, { anchor: enterKey, colour: 'sky', text: '**Enter moves on as well as N,** the Next button\'s own shortcut, and only once the question is finished (`locked`). It runs the kit\'s Next, so the last question goes to the score.' });
    //Slower, one step down for good (remembered with the learner's other choices), and pause or carry on
    const slowerClick = click(g, slower, 'Slower');
    graphNote(play, { anchor: slowerClick, colour: 'sky', text: '**Slower steps the speech down for good:** the voice settings are remembered with the learner\'s other choices. Pause toggles, and Spoken prompts toggles `spokenOn` and stops anything mid-sentence.' });
    g.run(slowerClick, ['action.speak', { op: 'slower' }]);
    g.run(click(g, pause, 'Pause'), ['action.speak', { op: 'toggle' }]);
    //Turn off spoken prompts (and on again)
    g.run(click(g, spoken, 'Spoken prompts'), ['action.setVariable', { variable: spokenOn.id, op: 'toggle' }], ['action.speak', { op: 'stop' }]);
    //The pace
    g.run(click(g, paceBtn, 'Pace'), ['action.setVariable', { variable: pace.id, op: 'set', value: 'pace == 0 ? 4 : pace == 4 ? 8 : 0' }]);
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Start'), goNext());
  }

  //The result page
  const review = bind(button(ctx, 'Missed questions button', 'Go through the missed ones (M)', 0, 0, 320), { visible: `${P}_missed.length > 0` });
  const again = button(ctx, 'Try again button', 'Try the whole quiz again', 0, 0, 260, false);
  const hear = bind(button(ctx, 'Hear again button', 'Hear it again (R)', 0, 0, 220, false), { visible: 'voiceAvailable && spokenOn' });
  Object.assign(review, { shortcut: 'm' });
  Object.assign(hear, { shortcut: 'r' });
  const reviewHeading = bind(text(ctx, 'Review heading', 'Questions to look at again', 0, 0, 100, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 2 }), { visible: `${P}_missed.length > 0` });
  const line = text(ctx, 'Review question', '•  {item.prompt}', 0, 0, 100, { fontSize: 15, lineHeight: 1.25, autoSize: 'height' });
  const reviewList = createNode('frame', {
    name: 'Review list',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: `${P}_missed.map(i => questions[i])`, layout: 'none', gap: 0, columns: 1 },
    children: [line],
  });
  scorePage(ctx, result, {
    label: 'Your score',
    score: `{${P}_setScore} of {${P}_setMax}`,
    caption: 'questions right first time',
    message: '{message}',
    buttons: [review, again, hear],
    below: [stack('Review', 0, 0, box.width, { gap: 8, children: [reviewHeading, reviewList] })],
  });
  {
    const g = graph(result);
    const arrive = g.event('event.start', {}, 'Result page');
    graphNote(result, { anchor: arrive, colour: 'sky', text: '**The result is spoken as the page opens,** the score, the message and how to go through the missed ones. With no voice it is announced to a screen reader instead.' });
    g.run(arrive, say(`"You got " + ${P}_setScore + " of " + ${P}_setMax + ". " + message + (${P}_missed.length > 0 ? " You missed " + ${P}_missed.length + (${P}_missed.length == 1 ? " question. Press M to go through it again." : " questions. Press M to go through them again.") : "")`));
    //The missed questions again: the kit draws a new run from the missed list, and the page before asks the first of them
    const reviewClick = click(g, review, 'Missed questions');
    graphNote(result, { anchor: reviewClick, colour: 'sky', text: '**Missed questions** deals a new run from only the rows got wrong, then goes back a page, where Start speaks the first of them. The M key does the same.' });
    g.run(reviewClick, ['action.questionReset', { question: frame.id, run: 'missed' }], ['action.artboard', { to: 'previous', transition: 'fade', duration: 250 }]);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(click(g, hear, 'Hear it again'), ['action.speak', { op: 'repeat' }]);
  }

  noteBelow(play, { text: '**Question bank** The questions are the rows of `questions`, asked once each. The kit\'s number keys answer, its Listen button is Repeat, and Read aloud\'s "With no voice" and "Only speak when" send the words to a screen reader when spoken prompts are off.', colour: 'sky' });
  noteBelow(play, { x: 456, text: '**Shortcuts** R, S, H, N, M and Space are each button\'s Shortcut field, so there is no key node for them. [ ] Keep the key in the label ("Repeat (R)") so sighted learners see it too.', colour: 'sky' });
  noteBelow(result, { text: '**Live variables** `rowExplain`, `rightPlace` and `rightText` read the row showing, and `message` is banded from the score. [ ] Reword the three messages in the Variables tab.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    todo('Change the title and the lines under it', 'Change the title and the line under it on the first page, and the note about the keys under the Start button', hero.children.find((c) => c.name === 'Page title'), hero),
    todo('Write your own questions and their options', 'Write your own questions: the "questions" variable (Variables tab) is a list, one entry per question. Each has a prompt, the options (two to four; a true or false question has two), correct (the place of the right option, counting from 1), explain (said and shown after the answer) and an optional hint', frame, play),
    todo('Add a spoken version for questions a voice reads badly', 'Add "spoken" to a question when a voice reads it badly (a formula, an abbreviation, a long scenario): it is said instead of the prompt, and the options are still read after it', frame, play),
    todo('Add or remove questions as you need', 'Add or remove questions in that list: the "Question n of N" footer, the score and the review all follow its length', undefined, play),
    todo('Keep each option short: a voice reads them all', 'Say the options the way you want them heard, and keep each one short: a voice reads all of them before the learner can answer', partsOf(frame).options[0], play),
    todo('Set the language of the spoken prompts', 'Set the language of the spoken prompts in Project settings, Read aloud (it is English here). A voice for another language is never used, so translating the questions means changing it too', undefined, play),
    todo('Choose how the quiz moves on after an answer', 'Decide how the quiz moves on: by hand is the default. The "pace" variable is 0 (by hand), 4 or 8 (seconds after the answer has been spoken); the Pace button on the question page cycles it for the learner', paceBtn, play),
    todo('Reword the three result messages', 'Reword the three result messages: the messageHigh, messageMid and messageLow variables', byName(result, 'Result message'), result),
    todo('Try it with a voice installed and with none', 'Try it with a voice installed and with none (turn it off in your computer\'s settings or use another browser). With no voice the spoken buttons hide and it is an ordinary keyboard quiz with the same feedback announced', undefined, play),
    todo('Do not rely on it for screen reader users', 'Do not offer it as the route for a screen reader user: they already have a reader, and two voices at once is worse. "Spoken prompts" turns the voice off, and the feedback is then announced to the reader instead', spoken, play),
    todo('Pick a colourway for the whole piece', 'Change the colours for the whole piece with the Themes tab: the colourways are already set up', undefined, play),
  ];
  checklist.push(todo(extrasShort({ hint: true }), extrasChecklist({ hint: true })));
  return { project, checklist };
}
