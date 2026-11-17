//The poll tutorial's finished project: a start page that says votes are anonymous, a dropdown and a Vote button that put the
//learner's answer into a Shared responses data source, and a results page whose bar chart reads the class's counted answers
import { cleanSharedSettings, createNode, defaultParams, uid, type Artboard, type LogicNode, type Project, type SceneNode } from 'interactives-player';
import { writeClickFlow } from '../../src/lib/click-flow';
import { lookDefaults } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';

const OPTIONS = ['Bus', 'Train', 'Car', 'Bike', 'Walk'];
//What the canvas and Preview show as the class (one line is one person); learners never see them
const SAMPLE = ['Bus', 'Bus', 'Bus', 'Bus', 'Car', 'Car', 'Car', 'Walk', 'Walk', 'Train', 'Bike'];

function layer<T extends SceneNode['type']>(p: Project, type: T, props: Record<string, unknown>) {
  return createNode(type, { ...lookDefaults(p, type), ...props } as never);
}
const words = (p: Project, name: string, text: string, x: number, y: number, width: number, fontSize: number, extra: Record<string, unknown> = {}) =>
  layer(p, 'text', { name, text, x, y, width, height: Math.ceil(fontSize * 1.4), fontSize, ...extra });

function page(p: Project, name: string): Artboard {
  //as + Add page makes one, then renamed, with the same background as Home
  const home = p.artboards[0];
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const ab: Artboard = { ...home, id: uid('ab'), name, canvasX: right + 100, canvasY: 0, children: [], timelines: [], logic: { nodes: [], edges: [] } };
  p.artboards.push(ab);
  return ab;
}

//+ When clicked... > Go to the next (or previous) page, as its recipe writes it (recipes.ts itself pulls in the browser-only asset store)
function whenClicked(ab: Artboard, layerId: string, to: 'next' | 'previous') {
  writeClickFlow(ab, layerId, [{ kind: 'action.artboard', params: { to } }]);
}

function build(): Project {
  const p = blankProject('Class poll');
  const home = p.artboards[0];
  const vote = page(p, 'Vote');
  const results = page(p, 'Results');

  //The answer the dropdown holds, and the shared source that counts everyone's
  const choice = { id: uid('v'), name: 'choice', type: 'string' as const, initial: '' };
  p.variables.push(choice);
  const ds = { id: uid('ds'), name: 'responses', kind: 'json' as const, source: 'shared' as const, shared: cleanSharedSettings({ perPerson: 1, refresh: 5, sample: SAMPLE, options: OPTIONS }) };
  p.dataSources.push(ds);

  // ---- Home: what it is, and that votes are anonymous
  const start = layer(p, 'button', { name: 'Start button', label: 'Start', x: 80, y: 380, width: 160, height: 48 });
  home.children.push(
    words(p, 'Title', 'Class poll', 80, 110, 640, 40, { fontWeight: 700, role: 'heading', headingLevel: 1 }),
    words(p, 'Intro', 'One question and one vote. Then see how the whole class answered.', 80, 190, 640, 20, { height: 56 }),
    words(p, 'Anonymous', 'Your vote is anonymous. The chart shows how many people chose each answer, never who chose it.', 80, 270, 640, 20, { height: 56 }),
    start,
  );
  whenClicked(home, start.id, 'next');

  // ---- Vote: the question, a dropdown tied to "choice", and Vote
  const pick = layer(p, 'input', {
    name: 'Answer',
    inputType: 'select',
    options: OPTIONS.join('\n'),
    x: 80,
    y: 200,
    width: 320,
    height: 44,
    ariaLabel: 'How you usually get to campus',
    bindings: { value: choice.name },
    bindingModes: { value: 'both' },
  });
  const send = layer(p, 'button', { name: 'Vote button', label: 'Vote', x: 80, y: 290, width: 160, height: 48 });
  vote.children.push(words(p, 'Question', 'How do you usually get to campus?', 80, 100, 640, 30, { fontWeight: 700, role: 'heading', headingLevel: 1 }), pick, send);

  //When Vote is clicked: only with an answer picked, take back this person's old vote, add the new one, then show the results
  const node = (kind: string, x: number, params: Record<string, unknown>): LogicNode => ({ id: uid('lg'), kind, x, y: 40, params: { ...defaultParams(kind), ...params } });
  const ev = node('event.pointer', 40, { target: send.id, type: 'click' });
  const check = node('logic.if', 300, { condition: 'choice != ""' });
  const back = node('action.sharedWithdraw', 560, { source: ds.id, text: '' });
  const add = node('action.sharedAdd', 820, { source: ds.id, text: 'choice' });
  const go = node('action.artboard', 1080, { to: 'picked', artboard: results.id });
  vote.logic.nodes.push(ev, check, back, add, go);
  const wire = (from: LogicNode, port: string, to: LogicNode) => vote.logic.edges.push({ id: uid('e'), from: from.id, fromPort: port, to: to.id, toPort: 'in' });
  wire(ev, 'out', check);
  wire(check, 'true', back);
  wire(back, 'out', add);
  wire(add, 'out', go);

  // ---- Results: the class's counted answers as a bar chart
  const chart = layer(p, 'chart', {
    name: 'Results chart',
    kind: 'bar',
    data: 'responses.answers',
    labelKey: 'text',
    valueKey: 'count',
    valueLabels: true,
    x: 80,
    y: 110,
    width: 640,
    height: 300,
    ariaLabel: 'Bar chart of how many people chose each way of getting to campus',
  });
  const again = layer(p, 'button', { name: 'Change my vote button', label: 'Change my vote', x: 80, y: 500, width: 200, height: 48 });
  results.children.push(
    words(p, 'Results title', 'How the class gets to campus', 80, 40, 640, 30, { fontWeight: 700, role: 'heading', headingLevel: 1 }),
    chart,
    words(p, 'Vote count', '{responses.people} {responses.people == 1 ? "person has" : "people have"} voted so far.', 80, 430, 640, 18),
    again,
  );
  whenClicked(results, again.id, 'previous');
  return p;
}

export const example: TutorialExample = {
  key: 'tut-survey-chart',
  topic: 'tutorial-survey-chart',
  title: 'Poll with a live chart',
  description: 'One question with a Vote button, and a bar chart of how the whole class answered, counted and anonymous: the Poll with a live chart tutorial\'s project.',
  tags: ['poll', 'survey', 'chart', 'shared responses', 'data'],
  build,
  notes: [
    { text: '**The class lives in one data source.** Open the Data tab and pick *responses*: it is a Shared responses source. Answers each is 1, Look again is 5 seconds, and the Sample answers are what the canvas and Preview pretend the class said.', page: 1 },
    { text: '**The chart only reads it.** Select *Results chart*: its Data is `responses.answers`, Label key `text` and Value key `count`. It redraws each time the page looks again.', colour: 'sky', page: 2 },
  ],
};
