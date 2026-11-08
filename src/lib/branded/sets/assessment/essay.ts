import { createNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { addNote, brandedPage, brandedProject, button, byName, contentBox, heading, item, solid, stroke, text, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, click, graph, graphNote, goNext, goPrevious, heroPage, setVar, variable } from './shared';
import { fill, progressBar, stack } from '../../parts';

//A keyword is a stem matched anywhere in the answer, whatever the case, so "evaporat" catches evaporate, evaporation...
const HAS = (list: string) => `${list}.filter(k => essay.toLowerCase().includes(k.toLowerCase()))`;
const LACKS = (list: string) => `${list}.filter(k => !essay.toLowerCase().includes(k.toLowerCase()))`;

/** States the layout check runs the pages in besides how they start: a full length answer with every keyword, and a long model answer. */
export const ESSAY_LAYOUT_STATES: LayoutState[] = [
  { label: 'answer in', vars: { essay: `${Array.from({ length: 60 }, () => 'word').join(' ')} spaced memory forget cram sleep review` } },
  { label: 'long answer and model', page: ['Write your answer', 'Your feedback'], vars: { essay: `${Array.from({ length: 170 }, () => 'word').join(' ')} spaced`, modelAnswer: Array.from({ length: 12 }, () => 'When you study a little each day, you come back to the material just as you are starting to forget it.').join(' '), showModel: true } },
];

export function buildEssay(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Essay');
  const { project, L } = ctx;

  variable(project, 'prompt', 'string', 'Explain why studying a little each day works better than cramming the night before. Use your own words.');
  const essay = variable(project, 'essay', 'string', '');
  variable(project, 'required', 'list', ['spac', 'memory', 'forget', 'cram']);
  variable(project, 'optional', 'list', ['test yourself', 'sleep', 'review']);
  variable(project, 'minWords', 'number', 50);
  variable(project, 'maxWords', 'number', 150);
  variable(project, 'modelAnswer', 'string', 'When you study a little each day, you come back to the material just as you are starting to forget it. Each return pulls it out of memory again, which makes the memory stronger and slower to fade. Cramming puts everything in at once, so it feels productive but most of it is gone within days. Spacing the sessions out, testing yourself and getting enough sleep between them all help the material stick, so you remember it for the exam and beyond.');
  const showModel = variable(project, 'showModel', 'boolean', false);
  //Live variables: worked out from the answer as it is typed, so the counter, the bar, Submit and the feedback page all read the same numbers
  variable(project, 'wc', 'number', 0, { formula: 'wordCount(essay)', live: true });
  variable(project, 'foundReq', 'list', [], { formula: HAS('required'), live: true });
  variable(project, 'missingReq', 'list', [], { formula: LACKS('required'), live: true });
  variable(project, 'foundOpt', 'list', [], { formula: HAS('optional'), live: true });
  variable(project, 'missingOpt', 'list', [], { formula: LACKS('optional'), live: true });
  variable(project, 'lengthState', 'string', '', { formula: 'wc < minWords ? "short" : wc > maxWords ? "long" : "ok"', live: true });

  const { page: hero, start } = heroPage(ctx, 'Write an answer', 'Write a short answer to a prompt, then check it for the key ideas. A self-check to help you learn, not a mark.', 'Start');
  const write = brandedPage(ctx, 'Write your answer', { footer: '{wc == 0 ? "Not started" : "Draft"}  ·  Step {pageNumber - 1} of {pageCount - 1}' });
  const feedbackPage = brandedPage(ctx, 'Your feedback', { footer: 'Formative self-check: it is not marked  ·  Step {pageNumber - 1} of {pageCount - 1}' });

  //The writing page: the prompt, the answer box beside the counter, then Submit, in one column so a prompt that wraps pushes the rest down
  const box = contentBox(write);
  const prompt = text(ctx, 'Prompt', '{prompt}', 0, 0, box.width, { fontSize: 20, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const input = createNode('input', {
    name: 'Answer box',
    ...lookDefaults(project, 'input'),
    inputType: 'textarea',
    placeholder: 'Type your answer here',
    ariaLabel: 'Your answer',
    variableId: essay.id,
    x: 0,
    y: 0,
    width: 620,
    height: 290,
    cornerRadius: 12,
    fontSize: 18,
    fontFamily: BRAND_FONT,
    stroke: stroke(L.border, 2),
  });
  bind(input, { ariaDescription: '"Word count " + wc + ". Aim for between " + minWords + " and " + maxWords + " words."' });
  const countLabel = text(ctx, 'Word count label', 'Word count', 0, 0, 100, { fontSize: 15, fontWeight: 600, color: L.muted });
  const countText = bind(text(ctx, 'Word count', '{wc}', 0, 0, 100, { fontSize: 44, fontWeight: 700, lineHeight: 1.1 }), { color: `wc > maxWords ? "${L.error}" : "${L.text}"` });
  const bar = progressBar(ctx, 'Word count bar', 0, 0, 100, { value: 'wc', max: 'maxWords', label: 'Words written', valueText: '{value} of {max} words' });
  const countCard = stack('Word count card', 0, 0, 100, { gap: 6, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16 }, children: [countLabel, countText, bar] });
  const aim = text(ctx, 'Aim', 'Aim for {minWords} to {maxWords} words.', 0, 0, 100, { fontSize: 16, fontWeight: 600 });
  const how = text(ctx, 'How it works', 'This is a self-check, not marking. Submit looks for the key ideas your teacher listed and tells you which are in your answer and which are missing. Then you can compare your answer with a model one.', 0, 0, 100, { fontSize: 15, lineHeight: 1.4, color: L.muted });
  const side = fill(stack('Counter column', 0, 0, 100, { gap: 14, children: [countCard, aim, how] }));
  const answerRow = stack('Answer row', 0, 0, box.width, { direction: 'row', gap: 28, align: 'start', children: [input, side] });
  const submit = bind(button(ctx, 'Submit button', 'Submit for feedback', 0, 0, 230), { disabled: 'wc == 0' });
  const submitRow = stack('Submit row', 0, 0, box.width, { direction: 'row', align: 'start', children: [submit] });
  const body = stack('Write body', box.x, box.y, box.width, { gap: 16, children: [prompt, answerRow, submitRow] });
  write.children.push(body);

  //The feedback page: what was found, what is missing, how the length went, and the model answer on request, in one column
  const fb = contentBox(feedbackPage);
  const summaryText = bind(text(ctx, 'Length feedback', '{lengthState == "ok" ? "✓ Length: " + wc + " words, within " + minWords + " to " + maxWords + "." : lengthState == "short" ? "✗ Length: " + wc + " words, which is under " + minWords + ". Say a bit more." : "✗ Length: " + wc + " words, which is over " + maxWords + ". Try to be briefer."}', 0, 0, fb.width, { fontSize: 19, fontWeight: 700, lineHeight: 1.3, role: 'heading', headingLevel: 2 }), { color: `lengthState == "ok" ? "${L.success}" : "${L.error}"` });
  const keyPanel = fill(stack('Required panel', 0, 0, 100, {
    gap: 8,
    padding: 20,
    box: { fill: solid(L.surface), cornerRadius: 16 },
    extra: { role: 'region', ariaLabel: 'Key ideas' },
    children: [
      heading(ctx, 'Required heading', 'Key ideas', 0, 0, 100, { fontSize: 18 }),
      text(ctx, 'Required found', '{foundReq.length == 0 ? "✗ None of the key ideas yet." : "✓ Key ideas you covered: " + foundReq.join(", ")}', 0, 0, 100, { fontSize: 17, lineHeight: 1.35 }),
      bind(text(ctx, 'Required missing', '{"✗ Key ideas not found yet: " + missingReq.join(", ")}', 0, 0, 100, { fontSize: 17, lineHeight: 1.35, fontWeight: 600, color: L.error }), { visible: 'missingReq.length > 0' }),
      bind(text(ctx, 'Required all found', '✓ Every key idea is in your answer.', 0, 0, 100, { fontSize: 17, lineHeight: 1.35, fontWeight: 600, color: L.success }), { visible: 'missingReq.length == 0' }),
    ],
  }));
  const extrasPanel = fill(stack('Optional panel', 0, 0, 100, {
    gap: 8,
    padding: 20,
    box: { fill: solid(L.surface), cornerRadius: 16 },
    extra: { role: 'region', ariaLabel: 'Extras' },
    children: [
      heading(ctx, 'Optional heading', 'Extras that would strengthen it', 0, 0, 100, { fontSize: 18 }),
      text(ctx, 'Optional found', '{foundOpt.length == 0 ? "None of the extras yet." : "✓ Extras you mentioned: " + foundOpt.join(", ")}', 0, 0, 100, { fontSize: 17, lineHeight: 1.35 }),
      bind(text(ctx, 'Optional missing', '{"You could also have mentioned: " + missingOpt.join(", ")}', 0, 0, 100, { fontSize: 17, lineHeight: 1.35, color: L.muted }), { visible: 'missingOpt.length > 0' }),
    ],
  }));
  const panels = stack('Feedback panels', 0, 0, fb.width, { direction: 'row', gap: 24, children: [keyPanel, extrasPanel] });
  const modelCard = bind(stack('Model answer panel', 0, 0, fb.width, { height: 150, padding: 20, box: { fill: solid(L.surface), cornerRadius: 16, clip: true }, extra: { role: 'region', ariaLabel: 'Model answer', scroll: 'vertical' }, children: [text(ctx, 'Model answer', '{modelAnswer}', 0, 0, 100, { fontSize: 14, lineHeight: 1.4 })] }), { visible: 'showModel' });
  const reveal = bind(button(ctx, 'Show model answer button', 'Show a model answer', 0, 0, 230), { visible: '!showModel' });
  const revealRow = stack('Model row', 0, 0, fb.width, { direction: 'row', align: 'start', children: [reveal] });
  const edit = button(ctx, 'Edit button', 'Edit my answer', 0, 0, 170, false);
  const again = button(ctx, 'Start again button', 'Start again', 0, 0, 190, false);
  const endRow = stack('End row', 0, 0, fb.width, { direction: 'row', gap: 12, justify: 'end', align: 'start', children: [edit, again] });
  feedbackPage.children.push(stack('Feedback body', fb.x, fb.y, fb.width, { gap: 16, children: [summaryText, panels, modelCard, revealRow, endRow] }));

  //Next and Previous follow the page order, so there is nothing to rewire if a page is added
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), goNext());
  }
  {
    const g = graph(write);
    const submitClick = click(g, submit, 'Submit');
    graphNote(write, { anchor: submitClick, colour: 'sky', text: '**Submit announces the live counts** (`wc`, `foundReq`) before moving on, so a screen reader hears the same numbers as the feedback page. The marking itself is the live variables, not a node.' });
    g.run(submitClick, announce('"Feedback ready. " + wc + " words. " + foundReq.length + " of " + required.length + " key ideas found."'), goNext());
  }
  {
    const g = graph(feedbackPage);
    const revealClick = click(g, reveal, 'Show model answer');
    graphNote(feedbackPage, { anchor: revealClick, colour: 'sky', text: '**`showModel` is what shows the model answer.** The announcement reads `modelAnswer` out too, since text that appears on its own is easy for a screen reader to miss. [ ] Write your own `modelAnswer`.' });
    g.run(revealClick, setVar(showModel, 'true'), announce('"Model answer: " + modelAnswer'));
    const editClick = click(g, edit, 'Edit my answer');
    graphNote(feedbackPage, { anchor: editClick, colour: 'sky', text: '**Edit my answer** hides the model again before going back, so the next visit starts with it closed. `essay` is not touched, so the writing is still there.' });
    g.run(editClick, setVar(showModel, 'false'), goPrevious());
    g.run(click(g, again, 'Start again'), ['action.startOver', {}]);
  }

  //Notes for whoever edits the template, below each page (the gap between rows leaves room)
  const below = (page: typeof write, x: number, w: number) => ({ x, y: page.height + 14, w, h: 84 });
  addNote(hero, { ...below(hero, 0, 440), text: '**Next page** Start, Submit and Edit use Go to artboard (next and previous), so adding or moving a page needs no rewiring.', colour: 'sky' });
  addNote(write, { ...below(write, 0, 440), text: '**Live variables** `wc`, `foundReq`, `missingReq`, `foundOpt`, `missingOpt` and `lengthState` are worked out from the answer as it is typed. The counter, the bar, Submit and the feedback page all read them.', colour: 'sky' });
  addNote(write, { ...below(write, 456, 440), text: '[ ] Put your prompt, keyword stems and word limits in the Variables tab. A stem like `spac` matches spaced and spacing.', colour: 'gold' });
  addNote(feedbackPage, { ...below(feedbackPage, 0, 440), text: '**Auto layout** The panels, model answer and buttons are one column, so a panel that wraps pushes the rest down. The model answer box is a fixed height that scrolls, so a long one never reaches the buttons.', colour: 'sky' });

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', byName(hero, 'Page title'), hero),
    item('Write your prompt: the "prompt" variable (Variables tab)', prompt, write),
    item('List the key ideas a good answer must have: the "required" variable (Variables tab) is a list of words or word stems, one per idea. A stem like "evaporat" matches evaporate, evaporation and evaporating. Matching ignores capital letters, and it looks for the text anywhere in the answer', input, write),
    item('List the extras that would make an answer stronger but are not needed: the "optional" variable (same format)', input, write),
    item('Set the length: the "minWords" and "maxWords" variables (Variables tab)', byName(write, 'Aim'), write),
    item('Write your model answer: the "modelAnswer" variable (Variables tab). A long one scrolls inside its box', byName(feedbackPage, 'Model answer panel'), feedbackPage),
    item('Check what the learner is told: this is automatic feedback from keywords, so it cannot judge meaning. Say so to your learners, and keep the "not marked" wording on both pages', byName(write, 'How it works'), write),
    item('Try it with the keyboard: Tab into the answer box, type, Tab to Submit and press Enter', undefined, write),
  ];
  return { project, checklist };
}

