//The drag and drop matching tutorial's finished project: one Add question matching card, four countries to drop on their
//capitals and one country that has no capital here, with tries, part marks and Try again
import type { Project } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../src/lib/question-kit';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Capital cities');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'matching');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Drag each country onto its capital city. One country has no capital here.',
    pairs: [
      { id: 'p1', term: 'Australia', match: 'Canberra' },
      { id: 'p2', term: 'Canada', match: 'Ottawa' },
      { id: 'p3', term: 'Brazil', match: 'Brasília' },
      { id: 'p4', term: 'Kenya', match: 'Nairobi' },
    ],
    extras: [{ id: 'x1', text: 'Spain' }],
    shuffle: true,
    points: 4,
    partial: true,
    attempts: 3,
    hints: ['Canberra was built to be the capital, between Sydney and Melbourne.'],
    feedbackCorrect: 'All four matched. Well done!',
    feedbackPartial: 'Some are right, but not all. Move a few and check again.',
    feedbackIncorrect: 'Not yet. Move the countries and check again.',
    feedbackOutOfTries: 'Out of tries. Each slot now shows the country that belongs there.',
    reveal: true,
  });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-drag-match',
  topic: 'tutorial-drag-match',
  title: 'Drag and drop matching',
  description: 'Drag each country onto its capital, with a country that fits nowhere, three tries, part marks and Try again: the Drag and drop matching tutorial\'s project.',
  tags: ['question', 'quiz', 'drag', 'matching'],
  build,
  notes: [
    { text: '**Made by Add question.** Select *Question 1*: the pairs, the extra term (Spain), Tries and Part marks are all in the Question section of the Properties panel.' },
    { text: '**Every slot is a drop zone that holds one term.** Dropping a second term on a full slot swaps them. Select a Slot to see its Drop zone section.', colour: 'sky' },
  ],
  graphNotes: [{ at: 0, text: '**Add question wired all of this.** The page starting and Try again put the terms back in the pile, and Check answer reads which slot each term is in. Dragging needs no nodes at all.' }],
};
