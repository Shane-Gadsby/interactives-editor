import { createNode, defaultAutoLayout, type FrameNode, type SceneNode, type TemplateChecklistItem } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT, type Colourway } from '../../looks';
import { brandedPage, brandedProject, button, contentBox, edge, item, solid, stroke, text } from '../../kit';
import { announce, bind, click, graph, heroPage, setVar, variable } from './shared';

//A short passage on the water cycle, one sentence a line. A number is a blank (its index in ANSWERS), a string is the text around it.
const SENTENCES: (string | number)[][] = [
  ['Heat from the ', 0, ' makes water at the surface turn into vapour.'],
  ['This change from a liquid to a gas is called ', 1, '.'],
  ['Rising vapour cools and turns back into droplets, called ', 2, '.'],
  ['Many droplets gather together to form ', 3, '.'],
  ['When the droplets get heavy they fall as rain or snow, called ', 4, '.'],
  ['Water that flows over the land and into rivers is called ', 5, '.'],
];
//What is accepted for each blank, in lower case, with | between the alternatives
const ANSWERS = ['sun', 'evaporation|evaporating', 'condensation|condensing', 'clouds|cloud', 'precipitation', 'runoff|run-off|run off'];

export function buildBlanks(colourway: Colourway) {
  const ctx = brandedProject(colourway, 'Fill in the blanks: the water cycle');
  const { project, L } = ctx;
  const N = ANSWERS.length;

  variable(project, 'answers', 'list', ANSWERS);
  const blanks = ANSWERS.map((_, i) => variable(project, `blank${i + 1}`, 'string', ''));
  const results = variable(project, 'results', 'list', ANSWERS.map(() => false));
  const checked = variable(project, 'checked', 'boolean', false);
  const shown = variable(project, 'shown', 'boolean', false);

  const { page: hero, start } = heroPage(ctx, 'The water cycle', 'Fill in the missing words in a short passage. Check as you go, or reveal the answers.', 'Start');
  const page = brandedPage(ctx, 'Fill in the blanks', { name: 'Fill in the blanks', footer: '{checked ? results.filter(r => r).length + " of " + answers.length + " right" : "Fill in " + answers.length + " blanks, then press Check"}' });
  const box = contentBox(page);

  const instruction = text(ctx, 'Instruction', 'Type the missing word in each gap, then press Check.', box.x, box.y, box.width, { fontSize: 17, color: L.muted });

  //The passage: a panel with a row for each sentence, text then an input then text, and a mark that says how the blank went
  const rowLayout = { ...defaultAutoLayout('row'), gap: 8, padding: { top: 0, right: 0, bottom: 0, left: 0 }, align: 'center' as const, hugWidth: true, hugHeight: true };
  const inputs: SceneNode[] = [];
  const sentences: FrameNode[] = SENTENCES.map((parts, r) => {
    const kids: SceneNode[] = [];
    parts.forEach((part, k) => {
      if (typeof part === 'string') {
        kids.push(text(ctx, `Sentence ${r + 1} text ${k === 0 ? 'start' : 'end'}`, part, 0, 0, 100, { fontSize: 20, autoSize: 'width', wrap: false, ...(part.length < 3 ? { layoutItem: { margin: { top: 0, right: 0, bottom: 0, left: -4 } } } : {}) }));
        return;
      }
      const i = part;
      const input = createNode('input', {
        name: `Blank ${i + 1}`,
        ...lookDefaults(project, 'input'),
        placeholder: `blank ${i + 1}`,
        ariaLabel: `Blank ${i + 1} of ${N}`,
        variableId: blanks[i].id,
        width: 150,
        height: 40,
        cornerRadius: 10,
        fontSize: 18,
        fontFamily: BRAND_FONT,
        stroke: stroke(L.border, 2),
      });
      bind(input, {
        'stroke.paint.color': `checked ? (results[${i}] ? "${L.success}" : "${L.error}") : "${L.border}"`,
        ariaDescription: `checked ? (results[${i}] ? "Right" : "Wrong") : ""`,
      });
      inputs.push(input);
      const mark = bind(text(ctx, `Blank ${i + 1} mark`, `{results[${i}] ? "✓" : "✗"}`, 0, 0, 22, { fontSize: 22, fontWeight: 700, autoSize: 'width', decorative: true }), {
        visible: 'checked',
        color: `results[${i}] ? "${L.success}" : "${L.error}"`,
      });
      kids.push(input, mark);
    });
    return createNode('frame', { name: `Sentence ${r + 1}`, fill: null, stroke: null, clip: false, layout: rowLayout, children: kids }) as FrameNode;
  });
  const passage = createNode('frame', {
    name: 'Passage',
    x: box.x,
    y: box.y + 34,
    width: box.width,
    height: 300,
    cornerRadius: 16,
    fill: solid(L.surface),
    stroke: null,
    clip: false,
    layout: { ...defaultAutoLayout('column'), gap: 14, padding: { top: 22, right: 28, bottom: 22, left: 28 }, align: 'start', hugHeight: true },
    children: sentences,
  }) as FrameNode;

  const buttonsY = box.y + 34 + 6 * 40 + 5 * 14 + 44 + 18;
  const check = button(ctx, 'Check button', 'Check', box.x, buttonsY, 140);
  const reveal = button(ctx, 'Show answers button', 'Show answers', box.x + 154, buttonsY, 170, false);
  const again = bind(button(ctx, 'Start again button', 'Start again', box.x + 338, buttonsY, 160, false), { visible: 'checked' });
  const feedback = bind(
    text(ctx, 'Feedback', `{shown ? "These are the answers. Press Start again to have another go." : results.every(r => r) ? "Every blank is right. Well done." : results.filter(r => r).length + " of " + answers.length + " right. Fix the ones marked ✗ and press Check again."}`, box.x + 520, buttonsY + 1, box.width - 520, { fontSize: 17, fontWeight: 600, lineHeight: 1.3, role: 'region' }),
    { visible: 'checked', color: `!shown && !results.every(r => r) ? "${L.text}" : "${L.success}"` },
  );
  page.children.push(instruction, passage, check, reveal, again, feedback);

  {
    const g = graph(page);
    //Marking works out which blanks are right once, into the results list; Check and Show answers both go through it
    const typed = `[${blanks.map((b) => b.name).join(', ')}]`;
    const onCheck = click(g, check, 'Check');
    const hold = g.then(onCheck, ...setVar(shown, 'false'));
    const mark = g.then(hold, ...setVar(results, `${typed}.map((v, i) => answers[i].toLowerCase().split("|").includes(v.trim().toLowerCase()))`));
    g.run(mark, setVar(checked, 'true'), announce('shown ? "The answers are filled in." : results.filter(r => r).length + " of " + answers.length + " blanks right."'));
    //Show answers types the answers in for the learner, then goes through the same marking node as a Check
    const onShow = click(g, reveal, 'Show answers');
    const filled = g.run(onShow, ...blanks.map((b, i) => setVar(b, `answers[${i}].split("|")[0]`)), setVar(shown, 'true'));
    page.logic.edges.push(edge(filled, mark));
    const redo = click(g, again, 'Start again');
    g.run(redo, ...blanks.map((b) => setVar(b, '""')), setVar(checked, 'false'), setVar(shown, 'false'), setVar(results, '[]'), ['action.focus', { op: 'focus', target: inputs[0].id }]);
  }
  {
    const g = graph(hero);
    g.run(click(g, start, 'Navigation'), ['action.artboard', { artboard: page.id, transition: 'fade', duration: 250 }]);
  }

  const checklist: TemplateChecklistItem[] = [
    item('Change the title and the line under it on the first page', hero.children.find((c) => c.name === 'Page title'), hero),
    item('Write your own passage: edit the text before and after each blank (the text layers inside each "Sentence" row, Layers panel)', sentences[0], page),
    item('Set the accepted answers: the "answers" variable (Variables tab) is a list with one entry for each blank, in order. Write them in lower case, and put | between alternatives (evaporation|evaporating). Spaces round a typed answer and capital letters are ignored', undefined, page),
    item('Add a blank: duplicate a "Sentence" row, point its input at a new text variable (blank7), add an entry to "answers", and add the new variable to the list in the two "Set variable: results" nodes (Interactions tab). Copy the mark and the colour bindings, changing results[6]', inputs[0], page),
    item('Remove a blank: delete its input and mark, and take its entry out of "answers" and the variable out of both results nodes', inputs[N - 1], page),
    item('Reword the Instruction line and the feedback message under the buttons', instruction, page),
  ];
  return { project, checklist };
}
