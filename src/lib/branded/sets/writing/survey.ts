//Questionnaire: one page with a rating scale, a multiple choice and an open text question. Submit saves the answers as learner user data and shows a thank-you with (optionally) a summary of what was answered.
import { createNode, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, contentBox, item, solid, stroke, text, type BrandedStarter } from '../../kit';
import type { Colourway } from '../../looks';
import { panel } from '../assessment/shared';
import { spreadPages } from '../story/common';
import { bind, click, go, graph, loadOnOpen, saveData, setVar, textBox, variable, writingHero } from './shared';

const TITLE = 'Study experience survey';
const CARD_W = 296;
const CARD_GAP = 20;
const OPTIONS = ['At home', 'At the library or on campus', 'On the move', 'It changes a lot'];

function build(colourway: Colourway) {
  const ctx = brandedProject(colourway, TITLE);
  const { project, L } = ctx;

  const rating = variable(project, 'rating', 'number', 0);
  const place = variable(project, 'place', 'string', '');
  const comment = variable(project, 'comment', 'string', '');
  const submitted = variable(project, 'submitted', 'boolean', false);
  const status = variable(project, 'status', 'string', '');
  const returning = variable(project, 'returning', 'boolean', false);
  //Set to false to leave the answers out of the thank-you page
  const showSummary = variable(project, 'showSummary', 'boolean', true);
  const answers = [rating, place, comment, submitted];

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

  //1 A rating scale, five round buttons that behave as radio buttons
  const dots: FrameNode[] = [1, 2, 3, 4, 5].map((n) =>
    bind(
      createNode('frame', {
        name: `Rating ${n}`,
        x: (n - 1) * 53,
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
        ariaLabel: `${n} out of 5`,
        children: [text(ctx, 'Number', String(n), 0, 8, 40, { fontSize: 17, fontWeight: 700, align: 'center', decorative: true, height: 24, autoSize: 'none' })],
      }) as FrameNode,
      {
        ariaChecked: `rating == ${n}`,
        'fill.color': `rating == ${n} ? "${L.button}" : "${L.background}"`,
        'stroke.paint.color': `rating == ${n} ? "${L.button}" : "${L.border}"`,
      },
    ),
  );
  dots.forEach((d, i) => bind(d.children[0], { color: `rating == ${i + 1} ? "${L.onButton}" : "${L.text}"` }));
  const scale = createNode('frame', { name: 'Rating scale', x: 22, y: 136, width: CARD_W - 44, height: 40, fill: null, stroke: null, clip: false, role: 'radiogroup', ariaLabel: 'How confident are you managing your study time, from 1 not at all to 5 very', children: dots } as never);
  const low = text(ctx, 'Scale low', '1 = Not at all', 22, 186, 120, { fontSize: 13, color: L.muted });
  const high = text(ctx, 'Scale high', '5 = Very confident', CARD_W - 22 - 140, 186, 140, { fontSize: 13, color: L.muted, align: 'right' });
  const chosen = text(ctx, 'Rating chosen', '{rating > 0 ? "You chose " + rating + " out of 5." : "Choose a number."}', 22, 222, CARD_W - 44, { fontSize: 16, fontWeight: 600 });
  const q1 = question(0, 'REQUIRED', '1. How confident are you managing your study time?', [scale, low, high, chosen]);

  //2 Multiple choice, one answer, as radio rows
  const rows: FrameNode[] = OPTIONS.map((label, i) => {
    const row = createNode('frame', {
      name: `Choice ${i + 1}`,
      x: 0,
      y: i * 54,
      width: CARD_W - 44,
      height: 44,
      cornerRadius: 10,
      fill: solid(L.background),
      stroke: stroke(L.border, 2),
      clip: false,
      role: 'radio',
      focusable: true,
      cursor: 'pointer',
      ariaLabel: label,
      children: [text(ctx, 'Choice text', label, 14, 10, CARD_W - 44 - 28, { fontSize: 16, fontWeight: 600, decorative: true, height: 24, autoSize: 'none', wrap: false })],
    }) as FrameNode;
    const pick = `place == ${JSON.stringify(label)}`;
    bind(row, { ariaChecked: pick, 'fill.color': `${pick} ? "${L.button}" : "${L.background}"`, 'stroke.paint.color': `${pick} ? "${L.button}" : "${L.border}"` });
    bind(row.children[0], { color: `${pick} ? "${L.onButton}" : "${L.text}"` });
    return row;
  });
  const choices = createNode('frame', { name: 'Place choices', x: 22, y: 136, width: CARD_W - 44, height: 4 * 54 - 10, fill: null, stroke: null, clip: false, role: 'radiogroup', ariaLabel: 'Where do you usually study', children: rows } as never);
  const q2 = question(1, 'REQUIRED', '2. Where do you usually study?', [choices]);

  //3 Open text
  const open = textBox(ctx, 'Comment box', comment, 22, 136, CARD_W - 44, 206, 'Type your answer here', 'What one thing would make studying easier');
  const q3 = question(2, 'OPTIONAL', '3. What one thing would make studying easier?', [open]);

  //Submit, with Save for later beside it, and a line that says what is missing
  const ready = 'rating > 0 && place != ""';
  const state = text(ctx, 'Survey status', `{${ready} ? status : "Questions 1 and 2 need an answer before you can submit."}`, box.x, 518, 520, { fontSize: 15, color: L.muted });
  const later = button(ctx, 'Save for later button', 'Save for later', 976 - 200 - 16 - 170, 512, 170, false);
  const submit = bind(button(ctx, 'Submit button', 'Submit', 976 - 200, 512, 200), { disabled: `!(${ready})`, opacity: `${ready} ? 1 : 0.5` });
  survey.children.push(state, later, submit);

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
  loadOnOpen(hero, answers, returning);
  {
    const g = graph(hero);
    g.then(click(g, start, 'Begin'), ...go(survey));
    //Coming back: straight to the thank-you if they already submitted, otherwise to the survey with their answers in
    const again = click(g, resume, 'Continue');
    const done = g.then(again, 'logic.if', { condition: 'submitted' });
    g.then(done, 'action.artboard', go(thanks)[1], 'true');
    g.then(done, 'action.artboard', go(survey)[1], 'false');
  }
  {
    const g = graph(survey);
    //A choice is kept as soon as it is made; the text is kept by Save for later and Submit
    dots.forEach((d, i) => g.run(click(g, d, 'Rating'), setVar(rating, String(i + 1)), setVar(status, '""'), saveData([rating])));
    rows.forEach((r, i) => g.run(click(g, r, 'Choice'), setVar(place, JSON.stringify(OPTIONS[i])), setVar(status, '""'), saveData([place])));
    g.run(click(g, later, 'Save for later'), saveData(answers), setVar(status, '"Saved. You can close this and finish later."'));
    g.run(g.event('event.variable', { variable: comment.id }, 'Edited'), setVar(status, '""'));
    const send = click(g, submit, 'Submit');
    //Counts only (no free text) go to Insights, so the author can see how the answers fell
    g.run(send, setVar(submitted, 'true'), saveData(answers), ['action.record', { name: 'survey rating', value: 'rating' }], ['action.record', { name: 'survey place', value: 'place' }], go(thanks));
  }
  {
    const g = graph(thanks);
    g.run(click(g, change, 'Change my answers'), setVar(submitted, 'false'), saveData([submitted]), go(survey));
  }

  checklist.push(
    item('Write the survey title and the line under it on the first page', hero.children.find((n) => n.name === 'Subtitle'), hero),
    item('Question 1: write your own rating question, and the labels at each end of the scale (the scale is five round buttons, each a radio button with its own click in the Interactions tab)', q1, survey),
    item('Question 2: change the choices. Each choice is a layer with a click that sets the "place" variable to its wording, so change the layer text, the Set variable node and its aria label together', q2, survey),
    item('Question 3: write your own open question. Its box is tied to the "comment" variable', q3, survey),
    item('Decide which questions are required: Submit stays off until the rating and the choice are answered (the condition is in the Submit button\'s Bindings)', submit, survey),
    item('Write your own thank-you message, and turn the answers summary off if you do not want it: set the "showSummary" variable to false (Variables tab)', message, thanks),
    item('The Record nodes after Submit send counts of the rating and the choice to Insights, with no names and no free text. Change or remove them (Interactions tab), and turn recording off in Project > Learner records if you do not want any', submit, survey),
    item('Answers are saved as learner user data: on the Link for StudyDesk under the learner\'s StudyDesk session, anywhere else in their browser. A question you add needs its variable ticked in the Save user data and Load user data nodes', undefined, hero),
  );

  project.settings.reporting = { completion: 'artboard', completionArtboard: thanks.id };
  spreadPages(project);
  return { project, checklist };
}

export const questionnaire: BrandedStarter = {
  key: 'writing/questionnaire',
  set: 'writing',
  name: 'Questionnaire',
  description: 'A short survey on one page: a rating scale, a multiple choice and an open text question. Submit shows a thank-you with an optional summary of the answers. Answers are saved as learner user data, and counts go to Insights.',
  tags: ['survey', 'rating', 'multiple choice', 'user data'],
  build,
};
