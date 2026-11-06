/** The assessment set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { buildQuiz } from './assessment/quiz';
import { buildBlanks } from './assessment/blanks';
import { buildMarkWords } from './assessment/mark-words';
import { buildTrueFalse } from './assessment/true-false';

export const STARTERS: BrandedStarter[] = [
  {
    key: 'assessment/multi-page-quiz',
    set: 'assessment',
    name: 'Multi-page quiz',
    description: 'A hero page, five questions with one on each page (single choice, multiple response, true or false, fill in the blank and putting in order), Next and Back, a "Question 2 of 5" line in each footer, and a score page with the total, a pass or fail message and Try again. It reports the score to the Link for StudyDesk.',
    tags: ['quiz', 'question kit', 'score', 'results'],
    build: buildQuiz,
  },
  {
    key: 'assessment/true-or-false',
    set: 'assessment',
    name: 'True or false',
    description: 'Eight statements, one at a time. The learner picks True or False and sees at once whether they were right, with an explanation, and a running tally. The last page shows the total and lists the statements to look at again.',
    tags: ['true or false', 'feedback', 'variables'],
    build: buildTrueFalse,
  },
  {
    key: 'assessment/fill-in-the-blanks',
    set: 'assessment',
    name: 'Fill in the blanks',
    description: 'A short passage with six blanks to type into. Check marks each blank right or wrong (with a tick or a cross, not just colour), says how many are right, and Show answers fills them in. Start again clears it. The accepted answers are one list the author edits.',
    tags: ['fill in the blanks', 'text input', 'feedback'],
    build: buildBlanks,
  },
  {
    key: 'assessment/mark-the-words',
    set: 'assessment',
    name: 'Mark the words',
    description: 'A passage where the learner clicks the words that fit a rule (every verb, say). Words switch on and off with a click, Enter or Space, and Check marks each one right, wrong or missed with a score. The author changes the passage and the right words in two text variables.',
    tags: ['mark the words', 'click', 'score', 'repeater'],
    build: buildMarkWords,
  },
];
