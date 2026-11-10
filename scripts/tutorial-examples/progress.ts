//The progress and badges tutorial's finished project: five pages that all draw one page master, a panel with a progress bar and
//three badges that read the "done" list, and a Mark as done button on each task page that adds its name to the list (or takes it out)
import type { Artboard, Project } from 'interactives-player';
import { addPageNavigation } from '../../src/lib/page-nav';
import { blankProject, type TutorialExample } from './kit';
import { addPage, addVariable, after, button, emptyClick, layer, look, q, words } from './_story-helpers';

export const TASKS = [
  { page: 'Plan your week', name: 'Planning', badge: 'Planner', letter: 'P', tip: 'Block out your classes, then put two study sessions for each course into the gaps. Write the due dates in too.' },
  { page: 'Read actively', name: 'Reading', badge: 'Reader', letter: 'R', tip: 'Before you read, skim the headings and write one question. As you read, note the answer in your own words.' },
  { page: 'Write a draft', name: 'Writing', badge: 'Writer', letter: 'W', tip: 'Write the messy first draft quickly, without editing. Fix it tomorrow, when you can see it with fresh eyes.' },
];

function task(p: Project, ab: Artboard, t: (typeof TASKS)[number], done: string) {
  ab.children.push(words(p, 'Heading', t.page, 60, 120, 680, { fontSize: 32, fontWeight: 700, height: 44 }));
  ab.children.push(words(p, 'Tip', t.tip, 60, 190, 680, { fontSize: 20, lineHeight: 1.45, height: 90 }));
  const mark = button(p, 'Mark as done', `{done.includes(${q(t.name)}) ? "Done ✓" : "Mark as done"}`, 60, 320, 220, 52);
  ab.children.push(mark);
  //+ On click (empty), then Change a value or counter dragged off it: add to the list, or take out if it is there
  after(ab, emptyClick(ab, mark), 'action.setVariable', { variable: done, op: 'toggleItem', value: q(t.name) });
}

function build(): Project {
  const p = blankProject('Study skills tour', 'Welcome');
  const L = look(p);
  const welcome = p.artboards[0];
  const done = addVariable(p, 'list', 'done');

  welcome.children.push(words(p, 'Title', 'Study skills tour', 60, 120, 680, { fontSize: 40, fontWeight: 700, height: 54 }));
  welcome.children.push(words(p, 'Intro', 'Three short tips. Try each one, press Mark as done, and earn its badge in the panel at the top.', 60, 196, 680, { fontSize: 20, lineHeight: 1.45, height: 60 }));
  const pages = TASKS.map((t) => {
    const ab = addPage(p, t.page);
    task(p, ab, t, done.id);
    return ab;
  });
  const end = addPage(p, 'All done');
  end.children.push(words(p, 'Title', 'All done', 60, 120, 680, { fontSize: 40, fontWeight: 700, height: 54 }));
  end.children.push(words(p, 'Result', 'You earned {done.length} of 3 badges. {done.length == 3 ? "Every one!" : "Go back for the rest whenever you like."}', 60, 196, 680, { fontSize: 20, height: 60 }));

  //The master: a panel along the top that every page draws under its own layers
  const panel = addPage(p, 'Progress panel');
  panel.isMaster = true;
  panel.children.push(layer('rect', 'Panel background', 0, 0, 800, 84, { fill: { type: 'solid', color: L.surface } }));
  panel.children.push(words(p, 'Progress label', 'Your progress: {done.length} of 3 done', 24, 14, 300, { fontSize: 16, fontWeight: 700, height: 22 }));
  panel.children.push(layer('rect', 'Bar track', 24, 48, 260, 14, { cornerRadius: 7, fill: { type: 'solid', color: L.surfaceMuted } }));
  panel.children.push(layer('rect', 'Bar fill', 24, 48, 260, 14, { cornerRadius: 7, fill: { type: 'solid', color: L.button }, bindings: { width: '260 * done.length / 3' } }));
  TASKS.forEach((t, i) => {
    const disc = layer('ellipse', 'Badge disc', 6, 0, 44, 44, { fill: { type: 'solid', color: L.button } });
    const letter = words(p, 'Badge letter', t.letter, 6, 10, 44, { fontSize: 18, fontWeight: 700, align: 'center', height: 24 });
    const label = words(p, 'Badge name', t.badge, 0, 50, 56, { fontSize: 12, align: 'center', height: 16 });
    panel.children.push(layer('group', `${t.badge} badge`, 520 + i * 90, 6, 56, 66, { children: [disc, letter, label], bindings: { opacity: `done.includes(${q(t.name)}) ? 1 : 0.25` } }));
  });
  for (const ab of [welcome, ...pages, end]) ab.master = panel.id;

  //Page navigation: Back and Next, on every page
  addPageNavigation(p, [welcome, ...pages, end].map((a) => a.id), 'back-next');
  return p;
}

export const example: TutorialExample = {
  key: 'tut-progress',
  topic: 'tutorial-progress',
  title: 'Progress, badges and a page master',
  description: 'A five-page tour where every page draws the same page master: a panel with a progress bar and three badges that light up as the learner marks each task done: the Progress and badges tutorial\'s project.',
  tags: ['progress', 'badges', 'page master', 'variables'],
  build,
  notes: [
    { text: '**One panel, every page.** *Progress panel* is a page master. Every page draws it under its own layers, so change it once there and all five follow.', page: 5 },
    { text: '**One list drives it all.** `done` holds the names of the tasks marked done. The bar\'s width, the label and each badge\'s opacity are bindings that read it.', colour: 'sky', page: 2 },
  ],
  graphNotes: [1, 2, 3].map((page) => ({
    page,
    at: 0,
    text: '**Mark as done is one node.** Change a value or counter adds the task name to done, or takes it out when it is there already. The other two rows are Back and Next.',
  })),
};
