import { defaultAutoLayout, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings, syncQuestion } from '../../../question-kit';
import { brandedPage, brandedProject, button, contentBox, item, text, todo, type LayoutState } from '\.\./\.\./kit';
import { type Colourway } from '../../looks';
import { after, bind, brandQuestionFrame, click, goNext, graph, graphNote, heroPage, kitNode, noteBelow, setVar } from './shared';
import { questionExtras } from '../../parts';

//A short passage on the water cycle, one sentence a line: the text before a blank, the accepted answers (| between alternatives), and the text after it.
const SENTENCES: { before: string; answers: string; after: string }[] = [
  { before: 'Heat from the', answers: 'sun', after: 'makes water at the surface turn into vapour.' },
  { before: 'This change from a liquid to a gas is called', answers: 'evaporation|evaporating', after: '.' },
  { before: 'Rising vapour cools and turns back into droplets, called', answers: 'condensation|condensing', after: '.' },
  { before: 'Many droplets gather together to form', answers: 'clouds|cloud', after: '.' },
  { before: 'When the droplets get heavy they fall as rain or snow, called', answers: 'precipitation', after: '.' },
  { before: 'Water that flows over the land and into rivers is called', answers: 'runoff|run-off|run off', after: '.' },
];

/** Checked with the longest sentence's blank wrong, and the answers shown, so the layout check sees the page at its fullest. */
export const BLANKS_LAYOUT_STATES: LayoutState[] = [
  { label: 'checked', page: 'Fill in the blanks', vars: { q1_answered: true, q1_locked: true, q1_correct: false, q1_feedback: 'Out of goes. The blanks marked ✗ show the answer.', q1_score: 3, q1_items: SENTENCES.map((s, i) => ({ id: `b${i + 1}`, text: '', label: s.before, number: i + 1, selected: false, state: i % 2 ? 'wrong' : 'correct', answer: s.answers.split('|')[0] })) } },
];

export function buildBlanks(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Fill in the blanks: the water cycle');
  const { project, L } = ctx;
  const N = SENTENCES.length;

  const { page: hero, start } = heroPage(ctx, 'The water cycle', 'Fill in the missing words in a short passage. Check as you go, or reveal the answers.', 'Start');
  const page = brandedPage(ctx, 'Fill in the blanks', { name: 'Fill in the blanks', footer: '{q1_answered ? q1_score + " of " + q1_items.length + " right" : "Fill in " + q1_items.length + " blanks, then press Check"}' });
  const box = contentBox(page);

  //The passage is a fill in the blank question: a blank for each sentence, with the accepted answers, marking, part marks and the answers shown at the end all the question kit's own
  const id = addQuestion(project, page.id, 'blank', { at: { x: box.x, y: box.y }, ...questionExtras(project, {}) })!;
  setQuestionSettings(project, page.id, id, {
    prompt: 'Type the missing word in each gap, then press Check.',
    //one point for each blank, so the score is the number right; three goes, then the ones still wrong are marked and the answers shown
    points: N,
    attempts: 3,
    partial: true,
    reveal: true,
    report: null,
    hints: [],
    feedbackCorrect: 'Every blank is right. Well done.',
    feedbackPartial: 'Some are right. Change the ones that are not and press Check again.',
    feedbackIncorrect: 'None are right yet. Have another look at the passage and press Check again.',
    feedbackOutOfTries: 'Out of goes. The blanks marked ✗ show the answer.',
    blanks: SENTENCES.map((s, i) => ({ id: `b${i + 1}`, label: s.before, answers: s.answers.split('|') })),
  });
  const frame = page.children.find((c) => c.id === id) as FrameNode;
  const P = frame.question!.prefix;
  frame.name = 'Passage question';
  frame.width = box.width;
  frame.layout = { ...frame.layout!, gap: 12, padding: { top: 16, right: 24, bottom: 16, left: 24 } };
  const prompt = partsOf(frame).prompt[0];
  Object.assign(prompt, { fontSize: 17, fontWeight: 400, color: L.muted });
  (partsOf(frame).blanks[0] as FrameNode).layout!.gap = 8;
  //the feedback says how many are right: the score is one point for each blank
  Object.assign(partsOf(frame).feedback[0], { text: `{${P}_feedback}{${P}_answered && !${P}_correct ? " " + ${P}_score + " of " + ${P}_items.length + " right." : ""}` });
  //Each blank row reads as a sentence: the text before, the box, the mark, the text after
  const inputs: SceneNode[] = [];
  const rows = (partsOf(frame).blanks[0] as FrameNode).children as FrameNode[];
  rows.forEach((row, i) => {
    const label = row.children.find((c) => c.questionPart === 'blankLabel')!;
    const input = row.children.find((c) => c.questionPart === 'blankInput')!;
    const accepted = row.children.find((c) => c.questionPart === 'blankAnswer')!;
    Object.assign(label, { fontSize: 20, fontWeight: 400, color: L.text, autoSize: 'width', wrap: false, width: 100 });
    Object.assign(input, { width: 150, height: 40, placeholder: `blank ${i + 1}`, ariaLabel: `Blank ${i + 1} of ${N}` });
    const mark = bind(text(ctx, `Blank ${i + 1} mark`, `{${P}_items[${i}]?.state == "correct" ? "✓" : "✗"}`, 0, 0, 22, { fontSize: 22, fontWeight: 700, autoSize: 'width', decorative: true }), {
      visible: `${P}_items[${i}]?.state == "correct" || ${P}_items[${i}]?.state == "wrong"`,
      color: `${P}_items[${i}]?.state == "correct" ? "${L.success}" : "${L.error}"`,
    });
    const tail = text(ctx, `Sentence ${i + 1} end`, SENTENCES[i].after, 0, 0, 100, { fontSize: 20, autoSize: 'width', wrap: false, ...(SENTENCES[i].after.length < 3 ? { layoutItem: { margin: { top: 0, right: 0, bottom: 0, left: -4 } } } : {}) });
    row.layout = { ...defaultAutoLayout('row'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'center', hugHeight: true };
    row.name = `Sentence ${i + 1}`;
    row.children = [label, input, mark, tail, accepted];
    inputs.push(input);
  });
  //Check answer, Start again, Show answers: one row
  const buttons = partsOf(frame).buttons[0] as FrameNode;
  const check = partsOf(frame).check[0] as SceneNode;
  const again = partsOf(frame).reset[0] as SceneNode;
  Object.assign(again as unknown as { label: string }, { label: 'Start again' });
  const reveal = button(ctx, 'Show answers button', 'Show answers', 0, 0, 170, false);
  buttons.children = [check, reveal, again, ...buttons.children.filter((c) => c !== check && c !== again)];
  syncQuestion(project, page.id, id);
  brandQuestionFrame(ctx, frame);
  //after the sync, which sets when Try again shows: here it is Start again, and it shows once there is something to clear
  again.bindings = { ...again.bindings, visible: `${P}_answered` };

  {
    const g = graph(page);
    //Show answers types the first accepted answer into every blank, then checks, and says so
    const feedbackVar = project.variables.find((v) => v.name === `${P}_feedback`)!;
    const blankVars = SENTENCES.map((_, i) => project.variables.find((v) => v.name === `${P}_blank${i + 1}`)!);
    const revealClick = click(g, reveal, 'Show answers');
    const filled = g.run(revealClick, ...blankVars.map((b, i) => setVar(b, JSON.stringify(SENTENCES[i].answers.split('|')[0]))));
    const checked = g.then(filled, 'action.questionCheck', { question: frame.id });
    //Check answer carries on by its own outputs: right, once every blank holds an answer
    g.run(g.then(checked, 'action.setVariable', { variable: feedbackVar.id, op: 'set', value: '"These are the answers. Press Start again to have another go."' }, 'correct'), ['action.announce', { text: '"The answers are filled in."', politeness: 'polite' }]);
    //Start again also puts the cursor back in the first blank
    const refocus = after(page, kitNode(page, 'reset:action'), 'action.focus', { op: 'focus', target: inputs[0].id });
    graphNote(page, { anchor: kitNode(page, 'start:event'), colour: 'sky', text: '**The question kit wired Start, Check, Enter, Hint and Start again.** Enter in a blank checks too: that key event has `typing` on, which a key event normally ignores. [ ] Edit the blanks in the Question section.' });
    graphNote(page, { anchor: revealClick, colour: 'sky', text: '**Show answers types the first accepted answer into every blank,** then checks. [ ] If you change an answer in the Question section, change it in these Set variable nodes as well.' });
    graphNote(page, { anchor: refocus, colour: 'sky', text: '**Start again puts the cursor back in the first blank,** after the kit has cleared them, so a keyboard user can type straight away.' });
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }

  noteBelow(page, { text: '**Fill in the blank question** The passage is one question with a blank for each sentence. Marking, part marks, the ✓ and ✗, Enter to check and the answers shown at the end are the question kit\'s, so there is no results list to maintain.', colour: 'sky' });
  noteBelow(page, { x: 456, text: '[ ] Edit each blank in the Question section: the text before it, and the accepted answers (one per line). The text after a blank is the layer "Sentence n end". If you change an answer, change it in the Show answers button\'s Set variable nodes too.', colour: 'gold' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    todo('Write your own passage with its blanks', 'Write your own passage: each blank\'s text before it is its label in the Question section, and the text after it is the "Sentence n end" layer (Layers panel)', frame, page),
    todo('Set the accepted answers for each blank', 'Set the accepted answers for each blank: the Question section lists them one to a line, so evaporation and evaporating can both be accepted. Capital letters and spaces round the answer are ignored, and a line written /colou?r/i is a pattern', frame, page),
    todo('To add a blank, use Add blank on the question', 'Add a blank: press Add blank in the Question section (it takes the look of the last one), then add its "Sentence n end" text and a Set variable for it in the Show answers flow (Interactions tab)', frame, page),
    todo('To remove a blank, take it out of the question', 'Remove a blank: take it out of the Question section, and its Set variable out of the Show answers flow', inputs[N - 1], page),
    todo('Reword the instruction and the feedback messages', 'Reword the instruction line (the question\'s prompt) and the feedback messages for all right, some right and none right: Question section', frame, page),
  ];
  return { project, checklist };
}
