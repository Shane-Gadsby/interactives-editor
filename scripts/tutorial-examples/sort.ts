//The sort into groups tutorial's finished project: one Add question categorise card, six energy sources to drop into two
//groups, each drop answered as it lands, and a reason for the two that are easy to get wrong
import type { Project } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../src/lib/question-kit';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Energy sort');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'categorise');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Drag each energy source into the group it belongs to.',
    groups: [
      { id: 'g1', name: 'Renewable' },
      { id: 'g2', name: 'Non-renewable' },
    ],
    cards: [
      { id: 'c1', text: 'Solar', group: 'g1' },
      { id: 'c2', text: 'Wind', group: 'g1' },
      { id: 'c3', text: 'Coal', group: 'g2' },
      { id: 'c4', text: 'Oil', group: 'g2' },
      { id: 'c5', text: 'Hydro', group: 'g1', feedback: 'Hydro runs on flowing water, which rain keeps topping up.' },
      { id: 'c6', text: 'Natural gas', group: 'g2', feedback: 'Natural gas took millions of years to form, so once it is burnt it is gone.' },
    ],
    dropFeedback: true,
    shuffle: true,
    points: 6,
    partial: true,
    attempts: 2,
    hints: ['Ask: will it run out if we keep using it?'],
    feedbackCorrect: 'All six are in the right group. Well done!',
    feedbackPartial: 'Some are right, but not all. Move a few and check again.',
    feedbackIncorrect: 'Not yet. Think about which ones can run out.',
    feedbackOutOfTries: 'Out of tries. Where each one goes is listed below.',
    reveal: true,
  });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-sort',
  topic: 'tutorial-sort',
  title: 'Sort into groups',
  description: 'Six energy sources to drag into Renewable and Non-renewable, with each drop answered as it lands and a count of how many are right: the Sort into groups tutorial\'s project.',
  tags: ['question', 'quiz', 'drag', 'categorise'],
  build,
  notes: [
    { text: '**Made by Add question.** Select *Question 1*: the groups, the items, which group each Belongs in and each item\'s wrong group feedback are in the Question section.' },
    { text: '**Each group box is a drop zone with no limit,** so it holds any number of items. Every box takes every item: whether it is right is for Check answer to say.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 0, text: '**Add question wired Start, Check answer, Hint and Try again.** Check marks every item at once and counts how many are in the right group.' },
    { at: 8, text: '**One drop flow for each group,** made when you ticked Say right or wrong as each item is dropped. Item dropped in a group answers as the item lands, without using a try.', colour: 'sky' },
  ],
};
