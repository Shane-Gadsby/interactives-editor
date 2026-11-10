//The multiple choice tutorial's finished project: one Add question card, set up the way the tutorial's steps leave it
import type { Project } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../src/lib/question-kit';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Planet quiz');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'single');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Which planet is closest to the Sun?',
    options: [
      { id: 'o1', text: 'Venus', feedback: 'Venus is second. It is the hottest, though, because of its thick air.' },
      { id: 'o2', text: 'Mercury', correct: true },
      { id: 'o3', text: 'Earth', feedback: 'Earth is third from the Sun.' },
      { id: 'o4', text: 'Mars', feedback: 'Mars is fourth, past Earth.' },
    ],
    shuffle: true,
    attempts: 2,
    hints: ['It is also the smallest planet.'],
    feedbackCorrect: 'Right! Mercury goes round the Sun in just 88 days.',
    feedbackIncorrect: 'Not quite. You have one more try.',
    feedbackOutOfTries: 'The answer is Mercury, the smallest planet.',
    reveal: true,
    report: 'complete',
  });
  p.reporting = { scoreFrom: 'questions', passMark: 50 };
  return p;
}

export const example: TutorialExample = {
  key: 'tut-mcq',
  topic: 'tutorial-mcq',
  title: 'Multiple choice question',
  description: 'One multiple choice question with two tries, a hint, feedback for each wrong answer and a result reported when it finishes: the Multiple choice tutorial\'s project.',
  tags: ['question', 'quiz', 'score'],
  build,
  notes: [
    { text: '**Made by Add question.** Select *Question 1* and everything is in the Question section of the Properties panel: the options, Tries, the hint, the feedback and Report result.' },
    { text: '**Each wrong option has its own feedback.** Type it under the option in the Question section. Leave it empty and the plain Wrong feedback shows instead.', colour: 'sky' },
  ],
  graphNotes: [{ at: 0, text: '**Add question wired all of this.** The page starting and Try again reset the question, an option click chooses it, Check answer marks it and then reports the result. Change the question in the Question section, not here.' }],
};
