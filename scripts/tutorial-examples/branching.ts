//The branching scenario tutorial's finished project: a situation page with three choices, three consequence pages with two
//each, and three endings. Every choice adds its points to score, adds its words to taken and goes on, to a page or to the
//ending the live "ending" variable names
import type { Artboard, Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { addPage, addVariable, button, chain, q, varByName, whenClicked, words } from './_story-helpers';

interface Choice {
  label: string;
  points: number;
  path: string;
  /** A page, or null for the ending the score earns. */
  to: Artboard | null;
}

function scene(p: Project, ab: Artboard, story: string, prompt: string, choices: Choice[]) {
  ab.children.push(words(p, 'Situation', story, 60, 50, 680, { fontSize: 19, lineHeight: 1.45, height: 150 }));
  ab.children.push(words(p, 'Prompt', prompt, 60, 230, 680, { fontSize: 22, fontWeight: 700, height: 30 }));
  choices.forEach((c, i) => {
    const b = button(p, `Choice ${i + 1}`, c.label, 60, 290 + i * 70, 620, 52);
    ab.children.push(b);
    //+ When clicked…, Add 1 to a counter (a new counter called score the first time), then its Value changed to the points
    const add = whenClicked(p, ab, b, 'counter', p.variables.some((v) => v.name === 'score') ? varByName(p, 'score').id : 'new:score');
    add.params.value = String(c.points);
    chain(
      ab,
      add,
      ['action.setVariable', { variable: varByName(p, 'taken').id, op: 'push', value: q(c.path) }],
      c.to ? ['action.artboard', { to: 'picked', artboard: c.to.id }] : ['action.artboard', { to: 'expression', expr: 'ending' }],
    );
  });
  ab.children.push(words(p, 'Path so far', 'Path so far: {taken.length ? taken.join(" > ") : "just starting"}', 60, 520, 680, { fontSize: 15, height: 22 }));
}

function ending(p: Project, ab: Artboard, title: string, outcome: string) {
  ab.children.push(words(p, 'Title', title, 60, 70, 680, { fontSize: 34, fontWeight: 700, height: 46 }));
  ab.children.push(words(p, 'Outcome', outcome, 60, 150, 680, { fontSize: 19, lineHeight: 1.45, height: 84 }));
  ab.children.push(words(p, 'Score', 'Score: {score} out of 6', 60, 270, 680, { fontSize: 20, fontWeight: 700, height: 28 }));
  ab.children.push(words(p, 'Your path', 'Your path: {taken.join(" > ")}', 60, 312, 680, { fontSize: 16, height: 44 }));
  const again = button(p, 'Start again', 'Start again', 60, 400, 200, 48);
  ab.children.push(again);
  whenClicked(p, ab, again, 'start-over');
}

function build(): Project {
  const p = blankProject('Group work scenario', 'Tuesday: a quiet group');
  const start = p.artboards[0];
  const sam = addPage(p, 'Sam replies');
  const alone = addPage(p, 'Wednesday night');
  const lecturer = addPage(p, 'The lecturer replies');
  const strong = addPage(p, 'A strong outcome');
  const mixed = addPage(p, 'A mixed outcome');
  const learning = addPage(p, 'A learning moment');

  addVariable(p, 'list', 'taken');

  scene(p, start, 'Your group assignment is due on Friday. The four of you agreed to write one section each, but Sam, who has the data analysis, has not posted anything in the group chat for a week. The read-through is tomorrow.', 'What do you do?', [
    { label: 'Message Sam and ask how it is going', points: 3, path: 'Asked Sam', to: sam },
    { label: "Quietly write Sam's section yourself", points: 0, path: 'Wrote it yourself', to: alone },
    { label: 'Email the lecturer and ask them to step in', points: 2, path: 'Emailed the lecturer', to: lecturer },
  ]);
  //score came from the first choice's + When clicked…; the ending is worked out from it, so it is made after
  addVariable(p, 'text', 'ending', { formula: `score >= 5 ? ${q(strong.name)} : score >= 3 ? ${q(mixed.name)} : ${q(learning.name)}`, live: true });
  scene(p, sam, 'Sam answers within the hour. They have been unwell and fell behind. They can finish most of it by Thursday morning, but they are worried about the quality.', 'How do you respond?', [
    { label: 'Agree a draft to the group by Wednesday night', points: 3, path: 'Set a checkpoint', to: null },
    { label: 'Offer to take half the section', points: 2, path: 'Shared the work', to: null },
  ]);
  scene(p, alone, 'You finish Sam\'s section at midnight. Your own section is rushed. On Wednesday Sam appears in the chat: "Sorry, nearly done with mine!"', 'What now?', [
    { label: 'Tell the group what happened and agree how to merge', points: 3, path: 'Told the group', to: null },
    { label: 'Say nothing and hand in both versions', points: 0, path: 'Said nothing', to: null },
  ]);
  scene(p, lecturer, "The lecturer thanks you and suggests you talk to Sam and the group first, using the course's group work guide.", 'What next?', [
    { label: 'Message the group, following the guide', points: 3, path: 'Followed the guide', to: null },
    { label: 'Wait for the lecturer to contact Sam', points: 0, path: 'Waited', to: null },
  ]);

  ending(p, strong, 'A strong outcome', 'You raised it early, kept everyone talking and the work stayed fair.');
  ending(p, mixed, 'A mixed outcome', 'The assignment got done, but some of it was harder than it needed to be. Talking sooner would have helped.');
  ending(p, learning, 'A learning moment', 'Staying quiet or waiting made the problem bigger. Start again and take a different path.');
  return p;
}

export const example: TutorialExample = {
  key: 'tut-branching',
  topic: 'tutorial-branching',
  title: 'Branching scenario',
  description: 'A group work dilemma with three choices, consequence pages that branch again and three endings picked by the score, with a path so far line and Start again: the Branching scenario tutorial\'s project.',
  tags: ['scenario', 'story', 'choices', 'score'],
  build,
  notes: [
    { text: '**Every page is a scene.** Each choice button adds its points to `score`, adds its words to `taken`, then goes to the next scene. The path line reads `taken`.', page: 2 },
    { text: '**The endings are picked by a formula.** `ending` (Variables tab) is worked out from `score` and kept up to date, and the last choices go to the page it names.', colour: 'sky', page: 5 },
  ],
  graphNotes: [0, 1, 2, 3].map((page) => ({
    page,
    at: 0,
    text: page === 0
      ? '**One row per choice.** The click adds the points to score, adds the choice to taken, then goes to the page that follows it. Change the points in the first node of each row.'
      : '**These choices end the story.** Go to a page is set to One named by an expression, and the expression is just `ending`, the page the score has earned.',
  })),
};
