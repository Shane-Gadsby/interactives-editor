//Questionnaire: one page with a rating scale, a multiple choice and an open text question. The answers are learner user data (kept as they are given), and Submit shows a thank-you with (optionally) a summary of what was answered.
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { addNote, brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter, type LayoutState } from '../../kit';
import type { Colourway } from '../../looks';
import { panel } from '../assessment/shared';
import { keyNavList } from '../../parts';
import { addVar, bind, click, goNext, goPrevious, graph, setVar, textBox, writingHero } from './shared';

const TITLE = 'Study experience survey';
const CARD_W = 296;
const CARD_GAP = 20;
const OPTIONS = ['At home', 'At the library or on campus', 'On the move', 'It changes a lot'];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, TITLE);
  const { project, L } = ctx;

  //The answers are user data: kept for the learner as they are given, and put back before the activity opens
  const rating = addVar(project, 'rating', 'number', 0, { userData: true });
  const place = addVar(project, 'place', 'string', '', { userData: true });
  const comment = addVar(project, 'comment', 'string', '', { userData: true });
  const submitted = addVar(project, 'submitted', 'boolean', false, { userData: true });
  //The choices for question 2, one per row of the list
  addVar(project, 'places', 'list', OPTIONS);
  //Live: somebody coming back (some of their answers were put back), and whether the two required questions are answered
  const returning = addVar(project, 'returning', 'boolean', false, { formula: 'userData.restored > 0', live: true });
  addVar(project, 'ready', 'boolean', false, { formula: 'rating > 0 && place != ""', live: true });
  //Set to false to leave the answers out of the thank-you page
  const showSummary = addVar(project, 'showSummary', 'boolean', true);

  const { page: hero, start, resume } = writingHero(
    ctx,
    TITLE,
    'Three quick questions about how study is going for you. It takes about two minutes, and your answers are kept so you can come back.',
    'Start the survey',
    'Welcome back. Your answers from last time are saved.',
    returning,
  );
  const survey = brandedPage(ctx, 'About your study', { name: 'Survey', footer: TITLE });
  const thanks = brandedPage(ctx, 'Thank you', { name: 'Thank you', footer: TITLE });
  const checklist: TemplateChecklistItem[] = [];

  //The card around each question: a Required or Optional tag, the question and then the answer controls
  const box = contentBox(survey);
  const cardX = (i: number) => box.x + i * (CARD_W + CARD_GAP);
  const question = (i: number, tag: string, ask: string, answer: SceneNode[]): FrameNode => {
    const flag = text(ctx, 'Question tag', tag, 22, 18, CARD_W - 44, { fontSize: 13, fontWeight: 700, color: L.muted });
    const heading = text(ctx, 'Question', ask, 22, 40, CARD_W - 44, { fontSize: 18, fontWeight: 700, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
    const card = panel(ctx, `Question ${i + 1} card`, cardX(i), box.y, CARD_W, 366, [flag, heading, ...answer], { role: 'region', ariaLabel: `Question ${i + 1}` });
    survey.children.push(card);
    return card;
  };

  //1 A rating scale: five round buttons that are one radio group (one Tab stop, the arrow keys move and choose), made from one copy
  const dot = bind(
    createNode('frame', {
      name: 'Rating',
      x: 0,
      y: 0,
      width: 40,
      height: 40,
      cornerRadius: 20,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'radio',
      focusable: true,
      cursor: 'pointer',
      children: [bind(text(ctx, 'Number', '{item}', 0, 8, 40, { fontSize: 17, fontWeight: 700, align: 'center', decorative: true, height: 24, autoSize: 'none' }), { color: `rating == item ? "${L.onButton}" : "${L.text}"` })],
    }) as FrameNode,
    {
      ariaLabel: 'item + " out of 5"',
      ariaChecked: 'rating == item',
      'fill.color': `rating == item ? "${L.button}" : "${L.background}"`,
      'stroke.paint.color': `rating == item ? "${L.button}" : "${L.border}"`,
    },
  );
  const scale = keyNavList('Rating scale', 22, 136, CARD_W - 44, 40, { items: '[1, 2, 3, 4, 5]', row: dot, mode: 'radio', orientation: 'horizontal', gap: 13, ariaLabel: 'How confident are you managing your study time, from 1 not at all to 5 very' });
  const low = text(ctx, 'Scale low', '1 = Not at all', 22, 186, 120, { fontSize: 13, color: L.muted });
  const high = text(ctx, 'Scale high', '5 = Very confident', CARD_W - 22 - 140, 186, 140, { fontSize: 13, color: L.muted, align: 'right' });
  const chosen = text(ctx, 'Rating chosen', '{rating > 0 ? "You chose " + rating + " out of 5." : "Choose a number."}', 22, 222, CARD_W - 44, { fontSize: 16, fontWeight: 600 });
  const q1 = question(0, 'REQUIRED', '1. How confident are you managing your study time?', [scale, low, high, chosen]);

  //2 Multiple choice, one answer, as radio rows: a repeater over the "places" list
  const row = bind(
    createNode('frame', {
      name: 'Choice',
      x: 0,
      y: 0,
      width: CARD_W - 44,
      height: 44,
      cornerRadius: 10,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'radio',
      focusable: true,
      cursor: 'pointer',
      children: [bind(text(ctx, 'Choice text', '{item}', 14, 10, CARD_W - 44 - 28, { fontSize: 16, fontWeight: 600, decorative: true, height: 24, autoSize: 'none', wrap: false }), { color: `place == item ? "${L.onButton}" : "${L.text}"` })],
    }) as FrameNode,
    { ariaLabel: 'item', ariaChecked: 'place == item', 'fill.color': `place == item ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `place == item ? "${L.button}" : "${L.border}"` },
  );
  const choices = keyNavList('Place choices', 22, 136, CARD_W - 44, 4 * 54 - 10, { items: 'places', row, mode: 'radio', gap: 10, ariaLabel: 'Where do you usually study' });
  const q2 = question(1, 'REQUIRED', '2. Where do you usually study?', [choices]);

  //3 Open text
  const open = textBox(ctx, 'Comment box', comment, 22, 136, CARD_W - 44, 206, 'Type your answer here', 'What one thing would make studying easier');
  const q3 = question(2, 'OPTIONAL', '3. What one thing would make studying easier?', [open]);

  //Submit, and a line that says what is missing (the answers are kept as they are given, so there is nothing to save)
  const state = text(ctx, 'Survey status', '{ready ? "Your answers are saved as you go." : "Questions 1 and 2 need an answer before you can submit."}', box.x, 518, 520, { fontSize: 15, color: L.muted });
  const submit = bind(button(ctx, 'Submit button', 'Submit', 976 - 200, 512, 200), { disabled: '!ready' });
  survey.children.push(state, submit);

  //Thank you, and the answers back (when showSummary is on)
  const tbox = contentBox(thanks);
  const message = text(ctx, 'Thank you message', 'Thanks for taking part', tbox.x, tbox.y, 420, { fontSize: 30, fontWeight: 700, role: 'heading', headingLevel: 2 });
  const lead = text(ctx, 'Thank you text', 'Your answers have been saved. They help us see what would make studying easier for you and the people studying with you.', tbox.x, tbox.y + 52, 420, { fontSize: 19, lineHeight: 1.45 });
  const change = button(ctx, 'Change answers button', 'Change my answers', tbox.x, tbox.y + 180, 230, false);
  const lines = [
    ['Confidence managing study time', '{rating} out of 5'],
    ['Where you usually study', '{place}'],
    ['What would make studying easier', '{comment.trim() ? (comment.length > 140 ? comment.slice(0, 140) + "..." : comment) : "No answer given"}'],
  ];
  const heads = lines.map(([label, value], i) => [
    text(ctx, `Answer ${i + 1} label`, label, 28, 64 + i * 78, 392 - 56, { fontSize: 14, fontWeight: 700, color: L.muted }),
    text(ctx, `Answer ${i + 1}`, value, 28, 88 + i * 78, 392 - 56, { fontSize: 18, lineHeight: 1.3 }),
  ]).flat();
  const summary = bind(
    panel(ctx, 'Summary card', tbox.x + tbox.width - 392, tbox.y, 392, 320, [text(ctx, 'Summary heading', 'Your answers', 28, 22, 336, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 3 }), ...heads], { role: 'region', ariaLabel: 'Your answers' }),
    { visible: showSummary.name },
  );
  thanks.children.push(message, lead, change, summary);

  //Wiring
  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...goNext());
    //Coming back: straight to the thank-you if they already submitted, otherwise to the survey with their answers in (one Go to artboard, by a name worked out)
    g.then(click(g, resume, 'Continue'), 'action.artboard', { to: 'expression', expr: 'submitted ? "Thank you" : "Survey"', transition: 'fade', duration: 250 });
  }
  {
    const g = graph(survey);
    //One flow for the rating and one for the choices: event.index is the button or row that was chosen (an arrow key choosing one is a click too)
    g.run(click(g, dot, 'Rating'), setVar(rating, 'event.index + 1'));
    g.run(click(g, row, 'Choice'), setVar(place, 'places[event.index]'));
    const send = click(g, submit, 'Submit');
    //Counts only (no free text) go to Insights, so the author can see how the answers fell
    g.run(send, setVar(submitted, 'true'), ['action.record', { name: 'survey rating', value: 'rating' }], ['action.record', { name: 'survey place', value: 'place' }], goNext());
  }
  {
    const g = graph(thanks);
    g.run(click(g, change, 'Change my answers'), setVar(submitted, 'false'), goPrevious());
  }

  checklist.push(
    item('Write the survey title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero),
    item('Question 1: write your own rating question, and the labels at each end of the scale (the scale is one radio group of five round buttons made from one copy, so the arrow keys choose and one flow sets "rating")', q1, survey),
    item('Question 2: change the choices in the "places" variable (Variables tab), one row for each. The rows are one layer repeated, and one flow sets the "place" variable to the row chosen', q2, survey),
    item('Question 3: write your own open question. Its box is tied to the "comment" variable', q3, survey),
    item('Decide which questions are required: Submit stays off until the live "ready" variable is true (it is rating > 0 && place != "", in the Variables tab)', submit, survey),
    item('Write your own thank-you message, and turn the answers summary off if you do not want it: set the "showSummary" variable to false (Variables tab)', message, thanks),
    item('The Record nodes after Submit send counts of the rating and the choice to Insights, with no names and no free text. Change or remove them (Interactions tab), and turn recording off in Project > Learner records if you do not want any', submit, survey),
    item('Answers are learner user data: on the Link for StudyDesk they are kept under the learner\'s StudyDesk session, anywhere else in their browser, saved as they change and put back before the survey opens. A question you add needs its variable ticked Save as user data (Variables tab)', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: thanks.id };
  //Notes for whoever edits the template, below the pages
  const below = (p: typeof survey, x: number, w: number) => ({ x, y: p.height + 14, w, h: 96 });
  addNote(survey, { ...below(survey, 0, 440), text: '**User data** The four answer variables are ticked Save as user data, so they are kept as they change and put back before the page opens. There is no Save or Load node to maintain, and `returning` is live from `userData.restored`.', colour: 'sky' });
  addNote(survey, { ...below(survey, 456, 440), text: '**Radio keyNav** The scale and the choices are radio groups: one Tab stop, the arrow keys move and choose, and one On pointer flow serves every button through `event.index`.', colour: 'sky' });
  addNote(hero, { ...below(hero, 0, 440), text: '[ ] **Make it yours** in the Variables tab. Change the choices in the `places` variable. A new question needs its own variable ticked **Save as user data**.', colour: 'gold' });

  return { project, checklist };
}

/** The thank-you page with a long answer in (the summary cuts it short), and the survey with a rating and a choice made. */
const SURVEY_LAYOUT_STATES: LayoutState[] = [
  { label: 'long answer', page: 'Thank you', vars: { rating: 4, place: OPTIONS[1], comment: `${Array.from({ length: 70 }, () => 'quiet').join(' ')} room` } },
  { label: 'answered', page: 'Survey', vars: { rating: 3, place: OPTIONS[1] } },
];

export const questionnaire: BrandedStarter = {
  key: 'writing/questionnaire',
  set: 'writing',
  name: 'Questionnaire',
  description: 'A short survey on one page: a rating scale, a multiple choice and an open text question. Submit shows a thank-you with an optional summary of the answers. Answers are saved as learner user data, and counts go to Insights.',
  tags: ['survey', 'rating', 'multiple choice', 'user data'],
  build,
  layoutStates: SURVEY_LAYOUT_STATES,
};
