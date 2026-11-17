//The script tutorial's finished project: a spelling question that accepts a near miss. One Run script works out how far
//the typed word is from the answer, and a binding on the feedback text turns that number into words
import { createNode, uid, type Project, type Script } from 'interactives-player';
import { lookDefaults } from '../../src/lib/themes';
import { Graph, addVar, finishGraphs } from '../../src/lib/branded/graph-kit';
import { blankProject, type TutorialExample } from './kit';

/** The script exactly as the tutorial has people type it. */
export const CLOSE_ENOUGH = `// How many letters would have to change to turn what was typed into the answer.
// 0 is spelt right, 1 or 2 is a near miss. The words on the page are worked out from it by a binding.
const typed = String(ix.vars.answer).trim().toLowerCase();
const target = 'ganymede';

let row = [];
for (let j = 0; j <= target.length; j++) row.push(j);
for (let i = 1; i <= typed.length; i++) {
  const next = [i];
  for (let j = 1; j <= target.length; j++) {
    const change = typed[i - 1] === target[j - 1] ? 0 : 1;
    next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + change);
  }
  row = next;
}
ix.vars.distance = row[target.length];
`;

/** The Feedback text's Text binding. */
export const FEEDBACK_FORMULA =
  'distance < 0 ? "" : distance == 0 ? "Right! Ganymede is the largest moon in the solar system." : distance <= 2 ? "Right, nearly. It is spelt Ganymede." : "Not quite. Try again."';

function build(): Project {
  const p = blankProject('Spell it');
  const ab = p.artboards[0];
  const look = (type: Parameters<typeof lookDefaults>[1]) => lookDefaults(p, type);

  addVar(p, 'answer', 'string', '');
  addVar(p, 'distance', 'number', -1);

  const question = createNode('text', { name: 'Question', x: 60, y: 80, width: 680, height: 42, text: 'Name the largest moon in the solar system.', fontSize: 30, fontWeight: 700, ...look('text') });
  const hint = createNode('text', { name: 'Hint', x: 60, y: 136, width: 680, height: 26, text: 'It goes round Jupiter.', fontSize: 18, ...look('text') });
  const box = createNode('input', {
    name: 'Answer box',
    x: 60,
    y: 200,
    width: 360,
    height: 48,
    placeholder: "Type the moon's name",
    noAssist: true,
    fontSize: 18,
    ...look('input'),
    bindings: { value: 'answer' },
    bindingModes: { value: 'both' },
  });
  const check = createNode('button', { name: 'Check', x: 440, y: 200, width: 160, height: 48, label: 'Check', fontSize: 18, ...look('button') });
  const feedback = createNode('text', { name: 'Feedback', x: 60, y: 280, width: 680, height: 30, text: 'Feedback', fontSize: 20, ...look('text'), bindings: { text: FEEDBACK_FORMULA } });
  ab.children.push(question, hint, box, check, feedback);

  const script: Script = { id: uid('sc'), name: 'Close enough', code: CLOSE_ENOUGH, runOnStart: false };
  p.scripts.push(script);

  const g = new Graph(ab);
  g.add('action.script', { script: script.id }, g.click(check));
  finishGraphs(p);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-script',
  topic: 'tutorial-script',
  title: 'When you need a script',
  description: 'A spelling question that accepts a near miss: one short script measures how far the typed word is from the answer, and a binding says so in words. The When you need a script tutorial\'s project.',
  tags: ['script', 'code', 'spelling'],
  build,
  notes: [
    { text: '**The script is in the Scripts tab**, called *Close enough*. It only works out one number, `distance`, and Run on start is off: the Check button runs it.' },
    { text: '**The words are not in the script.** Select *Feedback* and look under Data bindings: its Text is a formula of `distance`, so you can change what it says without touching code.', colour: 'sky' },
  ],
};
