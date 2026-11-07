/** The assessment set of branded starters (see ../kit.ts for the contract every starter keeps). */
import type { BrandedStarter } from '../kit';
import { buildQuiz } from './assessment/quiz';
import { buildBlanks } from './assessment/blanks';
import { buildMarkWords } from './assessment/mark-words';
import { buildTrueFalse } from './assessment/true-false';
import { buildFindHotspot, buildFindHotspots } from './assessment/hotspot';
import { buildImageChoice } from './assessment/image-choice';
import { buildSingleChoiceSet } from './assessment/single-choice-set';
import { buildSummary } from './assessment/summary';
import { buildEssay } from './assessment/essay';
import { buildAudioFirstQuiz } from './assessment/audio-first';
import { buildSpellingTest } from './assessment/spelling-test';

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
  {
    key: 'assessment/find-the-hotspot',
    set: 'assessment',
    name: 'Find the hotspot',
    description: 'A picture placeholder and a question: click the right place. The areas are invisible until picked, Check answer says if it was right with feedback for each area, a hint is on offer, and the learner has two tries before the right area is shown. Areas work with the keyboard. Made with the question kit, so the author edits it in the Question section.',
    tags: ['hotspot', 'picture', 'question kit', 'tries'],
    build: buildFindHotspot,
  },
  {
    key: 'assessment/find-multiple-hotspots',
    set: 'assessment',
    name: 'Find multiple hotspots',
    description: 'One picture with five things to find. Each right click is ticked off a list with a line of feedback, clicks on the wrong places are counted, and a result page shows how many wrong clicks it took. The things to find are one list the author edits. Areas can be reached with the keyboard.',
    tags: ['hotspot', 'picture', 'counter', 'find'],
    build: buildFindHotspots,
  },
  {
    key: 'assessment/image-choice',
    set: 'assessment',
    name: 'Image choice',
    description: 'A question with six picture options, each with a label and a description for screen readers. The learner picks one or several (the author turns that on or off), Check marks each pick right or wrong and shows the ones that were missed, with feedback for all right, part right and none right.',
    tags: ['image choice', 'pictures', 'multiple response', 'alt text'],
    build: buildImageChoice,
  },
  {
    key: 'assessment/single-choice-set',
    set: 'assessment',
    name: 'Single choice set',
    description: 'Rapid-fire questions, one at a time with three answers each. A right answer flashes "Correct" and moves on by itself; a wrong answer shows the right one and the explanation, and waits for Next. A progress bar runs along the top and the score page comes last. The questions are one list the author edits.',
    tags: ['quiz', 'rapid fire', 'score', 'variables'],
    build: buildSingleChoiceSet,
  },
  {
    key: 'assessment/summary',
    set: 'assessment',
    name: 'Summary',
    description: 'Build a summary step by step. Each step shows three or four statements and the learner picks the true one, which is added to a growing summary panel. A wrong pick is marked and can be tried again; the score counts the steps right first time. The last page shows the finished summary. The steps are one list the author edits.',
    tags: ['summary', 'steps', 'true statement', 'score'],
    build: buildSummary,
  },
  {
    key: 'assessment/essay',
    set: 'assessment',
    name: 'Essay',
    description: 'A writing prompt with a large answer box and a live word count. Submit gives automatic feedback from keywords the author sets (key ideas found and missing, optional extras, and whether the length is within a minimum and maximum), and a model answer can be revealed. It is a formative self-check for the learner, not marking: it matches words, it cannot judge meaning.',
    tags: ['essay', 'writing', 'keywords', 'word count', 'self-check'],
    build: buildEssay,
  },
  {
    key: 'assessment/audio-first-quiz',
    set: 'assessment',
    name: 'Audio-first quiz',
    description: 'A quiz that can be run by ear. With a voice on the learner\'s device it reads each question and its options; 1 to 4 (or a tap) answers, R repeats, S slows, H gives a hint and Space pauses. It speaks Correct or Not quite with a spoken explanation, moves on by hand unless a pace is set, and the score page speaks the score and offers the missed questions again. Spoken prompts can be turned off, and with no voice it is an ordinary keyboard quiz.',
    tags: ['quiz', 'audio', 'read aloud', 'keyboard', 'number keys', 'accessibility'],
    build: buildAudioFirstQuiz,
  },
  {
    key: 'assessment/spelling-test',
    set: 'assessment',
    name: 'Spelling test',
    description: 'Six words, one to a page. The learner plays the recording of a word and types it: every letter has to match, with the American spelling accepted as well, and the browser\'s own spellcheck is off in the box. The server marks the words and keeps the score, so the page has no answers in it; the test can be retaken a set number of times with the best round kept, and a result page shows this go and what is on record. Played from the Link for StudyDesk or an LTI 1.3 link, the score goes to the course gradebook. The author records the words and types the accepted spellings.',
    tags: ['spelling', 'dictation', 'audio', 'server marked', 'retakes', 'grade'],
    build: buildSpellingTest,
  },
];
