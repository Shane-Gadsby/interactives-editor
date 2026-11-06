import { createNode, defaultAutoLayout, type TemplateChecklistItem } from 'interactives-player';
import { brandedPage, brandedProject, button, card, contentBox, item, stroke, text } from '../../kit';
import type { Colourway } from '../../looks';
import { announce, bind, click, go, graph, heroPage, panel, setVar, variable } from './shared';

//Academic integrity, kept general: nothing here states a particular university's rules.
const STATEMENTS = [
  { text: 'Putting someone else\'s idea into your own words without saying where it came from is still plagiarism.', answer: true, why: 'Plagiarism is using someone\'s words or ideas without credit, however you phrase them. Reference the source of an idea as well as a quotation.' },
  { text: 'You only need to reference direct quotations.', answer: false, why: 'Paraphrased ideas, data, images and figures need a reference too, not just the words you quote.' },
  { text: 'Two students may share the answers to an individual assignment if they both agree to it.', answer: false, why: 'Agreement between students does not change the rules. An individual assignment has to be your own work unless the task says otherwise.' },
  { text: 'Talking through a topic with classmates before you write your own answer is usually fine.', answer: true, why: 'Discussing ideas is part of learning. Then write your answer yourself, in your own words, unless your course says otherwise.' },
  { text: 'Changing a few words in a paragraph you found online makes it your own writing.', answer: false, why: 'Swapping a few words is not paraphrasing. Rewrite the idea properly, and reference where it came from.' },
  { text: 'Handing in work you already submitted in another course, without asking, can break the rules.', answer: true, why: 'Work that has already been assessed is not new work. Ask your teacher before you reuse any of it.' },
  { text: 'A reference manager means you no longer need to check your reference list.', answer: false, why: 'Tools save time on formatting but they can get details wrong. Check each reference against the referencing guide.' },
  { text: 'If you are not sure whether something needs a reference, asking your teacher is a good idea.', answer: true, why: 'Asking is always better than guessing. Your teacher or the library can help you work it out.' },
];

export function buildTrueFalse(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'True or false: academic integrity');
  const { project, L } = ctx;
  const N = STATEMENTS.length;

  variable(project, 'statements', 'list', STATEMENTS);
  const index = variable(project, 'index', 'number', 0);
  const answered = variable(project, 'answered', 'boolean', false);
  const lastRight = variable(project, 'lastRight', 'boolean', false);
  const tally = variable(project, 'tally', 'number', 0);
  const missed = variable(project, 'missed', 'list', []);
  variable(project, 'messageHigh', 'string', 'Great work. You know your way around academic integrity.');
  variable(project, 'messageMid', 'string', 'A good start. Look again at the statements below.');
  variable(project, 'messageLow', 'string', 'Have another look at the explanations, then try again.');

  const { page: hero, start } = heroPage(ctx, 'True or false: academic integrity', `Eight statements, one at a time. Say whether each is true or false and see why straight away.`, 'Start');
  const play = brandedPage(ctx, 'True or false', { footer: 'Statement {index + 1} of {statements.length}' });
  const result = brandedPage(ctx, 'Your result', { footer: 'True or false: academic integrity' });

  //The play page
  const box = contentBox(play);
  const statementCard = card(ctx, 'Statement card', box.x, box.y, box.width, 160);
  const statementLabel = text(ctx, 'Statement label', 'Is this statement true or false?', box.x + 32, box.y + 22, 600, { fontSize: 15, fontWeight: 600, color: L.muted });
  const statement = text(ctx, 'Statement', '{statements[index].text}', box.x + 32, box.y + 54, box.width - 64, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const isTrue = button(ctx, 'True button', 'True', box.x, box.y + 184, 190);
  const isFalse = button(ctx, 'False button', 'False', box.x + 206, box.y + 184, 190);
  bind(isTrue, { disabled: 'answered', opacity: 'answered ? 0.5 : 1' });
  bind(isFalse, { disabled: 'answered', opacity: 'answered ? 0.5 : 1' });
  const running = text(ctx, 'Running tally', 'Correct so far: {tally} of {index + (answered ? 1 : 0)}', box.x + box.width - 400, box.y + 195, 400, { fontSize: 18, fontWeight: 600, align: 'right', color: L.muted });
  const heading = text(ctx, 'Feedback heading', '{lastRight ? "✓ Correct" : "✗ Not quite"}', 24, 18, 400, { fontSize: 22, fontWeight: 700 });
  const why = text(ctx, 'Explanation', '{statements[index].why}', 24, 56, box.width - 48, { fontSize: 18, lineHeight: 1.35 });
  const feedback = bind(panel(ctx, 'Feedback', box.x, box.y + 258, box.width, 124, [heading, why], { role: 'region', stroke: stroke(L.border, 2) }), {
    visible: 'answered',
    'fill.color': `lastRight ? "${L.successSurface}" : "${L.errorSurface}"`,
    'stroke.paint.color': `lastRight ? "${L.success}" : "${L.error}"`,
    ariaLabel: '(lastRight ? "Correct. " : "Not quite. ") + statements[index].why',
  });
  const next = bind(button(ctx, 'Next button', 'Next statement', box.x + box.width - 230, box.y + 398, 230), {
    visible: 'answered',
    label: `index >= statements.length - 1 ? "See my result" : "Next statement"`,
  });
  play.children.push(statementCard, statementLabel, statement, isTrue, isFalse, running, feedback, next);

  {
    const g = graph(play);
    for (const [btn, value] of [[isTrue, 'true'], [isFalse, 'false']] as const) {
      const ev = click(g, btn, `Answer ${value}`);
      const end = g.run(
        ev,
        setVar(answered, 'true'),
        setVar(lastRight, `statements[index].answer == ${value}`),
        setVar(tally, 'lastRight ? 1 : 0', 'add'),
        announce('(lastRight ? "Correct. " : "Not quite. ") + statements[index].why'),
      );
      g.then(g.then(end, 'logic.if', { condition: '!lastRight' }), 'action.setVariable', { variable: missed.id, op: 'push', value: 'statements[index].text' }, 'true');
    }
    const ev = click(g, next, 'Next statement');
    const last = g.then(ev, 'logic.if', { condition: 'index >= statements.length - 1' });
    //The true branch goes to the result page; the false branch moves on to the next statement
    g.then(last, ...go(result), 'true');
    g.run(
      g.then(last, ...setVar(index, '1', 'add'), 'false'),
      setVar(answered, 'false'),
      announce('"Statement " + (index + 1) + " of " + statements.length + ": " + statements[index].text'),
    );
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), go(play));
  }

  //The result page
  const body = contentBox(result);
  const scoreCard = card(ctx, 'Score card', body.x, body.y, 380, 230);
  const scoreLabel = text(ctx, 'Score label', 'Your tally', body.x + 28, body.y + 26, 320, { fontSize: 18, fontWeight: 600, color: L.muted });
  const scoreText = text(ctx, 'Score', '{tally} of {statements.length}', body.x + 28, body.y + 64, 330, { fontSize: 56, fontWeight: 700, lineHeight: 1.1 });
  const scoreWords = text(ctx, 'Score words', 'statements right first time', body.x + 28, body.y + 150, 330, { fontSize: 18, color: L.muted });
  const message = text(ctx, 'Result message', '{tally / statements.length >= 0.75 ? messageHigh : tally / statements.length >= 0.5 ? messageMid : messageLow}', body.x + 420, body.y + 24, body.width - 420, { fontSize: 26, fontWeight: 600, lineHeight: 1.3, role: 'heading', headingLevel: 2 });
  const again = button(ctx, 'Try again button', 'Try again', body.x + 420, body.y + 150, 170);
  const reviewHeading = bind(text(ctx, 'Review heading', 'Statements to look at again', body.x, body.y + 252, 600, { fontSize: 20, fontWeight: 700, role: 'heading', headingLevel: 2 }), { visible: 'missed.length > 0' });
  const line = text(ctx, 'Review statement', '•  {item}', 0, 0, body.width, { fontSize: 15, lineHeight: 1.25 });
  const reviewList = createNode('frame', {
    name: 'Review list',
    x: body.x,
    y: body.y + 282,
    width: body.width,
    height: 100,
    fill: null,
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 4, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'stretch', hugHeight: true },
    repeat: { items: 'missed', layout: 'none', gap: 0, columns: 1 },
    children: [line],
  });
  result.children.push(scoreCard, scoreLabel, scoreText, scoreWords, message, again, reviewHeading, reviewList);
  {
    const g = graph(result);
    g.run(click(g, again, 'Try again'), ['action.startOver', {}]);
    g.run(g.event('event.start', {}, 'Result page'), announce('"You got " + tally + " of " + statements.length + " right. " + (tally / statements.length >= 0.75 ? messageHigh : tally / statements.length >= 0.5 ? messageMid : messageLow)'));
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    item('Write your own statements: the "statements" variable (Variables tab) is a list, one entry per statement, with its text, answer (true or false) and the explanation shown afterwards. Keep the same three names in each entry', statement, play),
    item(`Add or remove statements in that list: the "Statement n of ${N}" footer, the tally and the result all follow its length`, undefined, play),
    item('Reword the three result messages: the messageHigh, messageMid and messageLow variables (Variables tab)', message, result),
    item('Change the instruction above the statement ("Is this statement true or false?")', statementLabel, play),
    item('Change the colours for the whole piece with the Themes tab: the colourways are already set up', undefined, play),
  ];
  return { project, checklist };
}
