//The put the steps in order tutorial's finished project: one Add question ordering card, six steps dealt shuffled and moved with
//their up and down buttons, part marks, and the step template restyled once so every step follows
import { walk, type FrameNode, type Project, type SceneNode } from 'interactives-player';
import { addQuestion, partOf, setQuestionSettings } from '../../src/lib/question-kit';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Make a cup of tea');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'ordering');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Put the steps for making a cup of tea in order.',
    options: ['Boil the water', 'Put a tea bag in the cup', 'Pour the hot water in', 'Let it brew for three minutes', 'Take the tea bag out', 'Add milk if you like'].map((text, i) => ({ id: `o${i + 1}`, text })),
    shuffle: true,
    points: 6,
    partial: true,
    attempts: 2,
    hints: ['You can\'t brew anything until the water is hot.'],
    feedbackCorrect: 'That\'s the order. Enjoy your tea!',
    feedbackPartial: 'Some steps are in the right place, but not all. Move a few and check again.',
    feedbackIncorrect: 'Not yet. Think about what has to happen first.',
    feedbackOutOfTries: 'Out of tries. Here is the right order.',
    reveal: true,
  });

  //Restyled once, on the repeated Item and its text, so every step follows
  const frame = ab.children.find((n) => n.id === id) as FrameNode;
  walk(frame.children, (n: SceneNode) => {
    if (n.type === 'frame' && partOf(n) === 'option') n.cornerRadius = 26;
    if (n.type === 'text' && partOf(n) === 'optionLabel') n.fontWeight = 600;
  });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-order',
  topic: 'tutorial-order',
  title: 'Put the steps in order',
  description: 'Six steps for making a cup of tea, dealt shuffled and moved up and down with buttons that work from the keyboard, with part marks: the Put the steps in order tutorial\'s project.',
  tags: ['question', 'quiz', 'ordering', 'sequence'],
  build,
  notes: [
    { text: '**Made by Add question.** Select *Question 1*: the steps are listed in their RIGHT order in the Question section, and the learner gets them shuffled.' },
    { text: '**One Item layer is repeated for every step.** It was restyled once (Radius 26, the text at weight 600) and all six follow. Restyle a part in the Question section selects it.', colour: 'sky' },
  ],
  graphNotes: [{ at: 0, text: '**Add question wired all of this.** One flow for the up buttons and one for the down buttons serve every step, so adding a step adds no nodes.' }],
};
