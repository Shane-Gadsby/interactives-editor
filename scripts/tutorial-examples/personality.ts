//The "which one are you?" tutorial's finished project: three question pages (the first built by hand, the others duplicates of
//it with new words), every answer adding to two of three tallies, and a live "result" that names the result page to go to
import type { Artboard, Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { addPage, addVariable, button, chain, varByName, whenClicked, words } from './_story-helpers';

//Each answer adds 2 to one tally and 1 to another: the first answer on every page leans Planner, the second Explorer, the third Collaborator
const POINTS: [string, string][] = [
  ['planner', 'collaborator'],
  ['explorer', 'planner'],
  ['collaborator', 'explorer'],
];

export const QUESTIONS = [
  { q: 'It is the start of semester. What do you do first?', answers: ['Put every due date in a calendar', 'Browse the course sites to see what looks interesting', 'Message people in my course to see who is studying what'] },
  { q: 'How do you like to prepare for an exam?', answers: ['Work through a study timetable I made weeks ago', 'Hunt for extra examples and read around the topic', 'Quiz each other in a study group'] },
  { q: 'A hard idea is not making sense. What do you do?', answers: ['Break it into small steps and take one a day', 'Look for a video or a different explanation', 'Ask a classmate to talk it through with me'] },
];

const RESULTS = [
  { page: 'You are a Planner', text: 'A clear plan keeps you calm and on track. Leave a little slack in it for the week it all goes sideways.' },
  { page: 'You are an Explorer', text: 'Curiosity drives you. Give each stage a simple deadline so the good ideas make it into your final work.' },
  { page: 'You are a Collaborator', text: 'You learn by talking things through. Set aside some time to work alone as well.' },
];

function question(p: Project, ab: Artboard, n: number, last: boolean) {
  const { q, answers } = QUESTIONS[n];
  ab.children.push(words(p, 'Question number', `Question ${n + 1} of 3`, 60, 50, 400, { fontSize: 16, fontWeight: 600, height: 22 }));
  ab.children.push(words(p, 'Question', q, 60, 84, 680, { fontSize: 28, fontWeight: 700, height: 76 }));
  answers.forEach((text, i) => {
    const b = button(p, `Answer ${i + 1}`, text, 60, 200 + i * 84, 620, 64);
    ab.children.push(b);
    const [two, one] = POINTS[i];
    const exists = p.variables.some((v) => v.name === two);
    //+ When clicked…, Add 1 to a counter (a new one, named, on the first page), its Value set to 2, then the second tally and the page
    const add = whenClicked(p, ab, b, 'counter', exists ? varByName(p, two).id : `new:${two}`);
    add.params.value = '2';
    chain(
      ab,
      add,
      ['action.setVariable', { variable: '', op: 'add', value: '1', _second: one }],
      last ? ['action.artboard', { to: 'expression', expr: 'result' }] : ['action.artboard', { to: 'next' }],
    );
  });
}

function build(): Project {
  const p = blankProject('Which study style are you?', 'Question 1');
  const q1 = p.artboards[0];
  question(p, q1, 0, false);
  //the second tally of each answer is picked once all three counters exist (the third answer made the last one)
  const fill = (ab: Artboard) => {
    for (const n of ab.logic.nodes) {
      const second = n.params._second as string | undefined;
      if (!second) continue;
      n.params.variable = varByName(p, second).id;
      delete n.params._second;
    }
  };
  fill(q1);
  //Duplicate twice, then the words changed (the flows are the same; the last page's three go to the result instead)
  const q2 = addPage(p, 'Question 2');
  question(p, q2, 1, false);
  fill(q2);
  const q3 = addPage(p, 'Question 3');
  question(p, q3, 2, true);
  fill(q3);

  for (const r of RESULTS) {
    const ab = addPage(p, r.page);
    ab.children.push(words(p, 'Title', r.page, 60, 70, 680, { fontSize: 36, fontWeight: 700, height: 50 }));
    ab.children.push(words(p, 'Description', r.text, 60, 150, 680, { fontSize: 20, lineHeight: 1.4, height: 60 }));
    ab.children.push(words(p, 'Scores', 'Your points: Planner {planner}, Explorer {explorer}, Collaborator {collaborator}', 60, 260, 680, { fontSize: 17, height: 24 }));
    const again = button(p, 'Take it again', 'Take it again', 60, 330, 220, 52);
    ab.children.push(again);
    whenClicked(p, ab, again, 'start-over');
  }
  addVariable(p, 'text', 'result', {
    formula: 'planner >= explorer && planner >= collaborator ? "You are a Planner" : explorer >= collaborator ? "You are an Explorer" : "You are a Collaborator"',
    live: true,
  });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-personality',
  topic: 'tutorial-personality',
  title: 'Which one are you? quiz',
  description: 'Three questions whose answers each add to two of three tallies, ending on the result page with the highest score: the "Which one are you?" tutorial\'s project.',
  tags: ['quiz', 'game', 'personality', 'variables', 'score'],
  build,
  notes: [
    { text: '**Three tallies, one per result.** `planner`, `explorer` and `collaborator` are counters. Each answer adds 2 to the result it fits best and 1 to another.', page: 2 },
    { text: '**The highest wins.** `result` (Variables tab) is worked out from the three and kept up to date: it is the name of a result page. Question 3 goes to the page it names.', colour: 'sky', page: 5 },
  ],
  graphNotes: [0, 1, 2].map((page) => ({
    page,
    at: 0,
    text: page < 2
      ? '**One row per answer.** Each adds 2 to one tally and 1 to another, then goes to the next page. To change the points, change the Value in the two Change a value nodes.'
      : '**The last answers go to the result.** Go to a page is set to One named by an expression, and the expression is `result`, the page with the highest tally.',
  })),
};
