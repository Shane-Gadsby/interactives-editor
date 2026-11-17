//The fill in the blanks tutorial's finished project: one Add question card with four typed gaps (alternatives, a near number, a
//pattern, a case that counts), and a tip under the third gap that shows only when that gap is marked wrong
import { createNode, type FrameNode, type Project } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../src/lib/question-kit';
import { lookFor } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Science gaps');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'blank');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Fill in each gap, then press Check answer.',
    blanks: [
      { id: 'b1', label: 'The largest ocean on Earth is the', answers: ['Pacific', 'Pacific Ocean', 'the Pacific'] },
      { id: 'b2', label: 'Light from the Sun reaches Earth in about this many minutes:', answers: ['8.3'], tolerance: 0.5 },
      { id: 'b3', label: 'Plants take in this gas from the air:', answers: ['carbon dioxide', '/^(carbon\\s+dioxide|co2)$/i'] },
      { id: 'b4', label: 'The chemical symbol for sodium is', answers: ['Na'], caseSensitive: true },
    ],
    points: 4,
    partial: true,
    attempts: 2,
    hints: ['The ocean is between Asia and the Americas.', 'Sodium\'s symbol comes from its Latin name, natrium.'],
    feedbackCorrect: 'All four are right. Well done!',
    feedbackPartial: 'Some are right, but not all. Have another look and check again.',
    feedbackIncorrect: 'None are right yet. Have another look and check again.',
    feedbackOutOfTries: 'Out of tries. Each gap you missed shows its answer.',
    reveal: true,
  });

  //The tip for gap 3: an ordinary text in that blank's row, shown once the question has finished with that gap wrong (no gap is marked before then)
  const frame = ab.children.find((n) => n.id === id) as FrameNode;
  const row = partsOf(frame).blankRow[2] as FrameNode;
  const L = lookFor(p.themes);
  row.children.push(
    createNode('text', {
      name: 'Gap 3 tip',
      text: 'Tip: it is the gas you breathe out. CO2 is accepted too.',
      fontSize: 14,
      color: L.muted,
      autoSize: 'height',
      width: 400,
      height: 20,
      bindings: { visible: 'q1_items[2]?.state == "wrong"' },
    }),
  );
  return p;
}

export const example: TutorialExample = {
  key: 'tut-blanks',
  topic: 'tutorial-blanks',
  title: 'Fill in the blanks',
  description: 'Four gaps to type into: alternatives, a near number, a pattern and a case that counts, with part marks and a tip for one gap: the Fill in the blanks tutorial\'s project.',
  tags: ['question', 'quiz', 'blanks', 'typing'],
  build,
  notes: [
    { text: '**Made by Add question.** Select *Question 1* and each gap is in the Question section: its label, its accepted answers one per line, Match case and ± Tolerance.' },
    { text: '**Gap 3 accepts a pattern,** `/^(carbon\\s+dioxide|co2)$/i`: `i` ignores case and `\\s+` takes any spaces between the words. The plain line above it is what shows when the answer is revealed.', colour: 'sky' },
    { text: '**The tip under gap 3** is an ordinary text layer in the Blank 3 row. Its Visible binding is `q1_items[2]?.state == "wrong"`, so it shows only when the question finishes with that gap wrong.', colour: 'gold' },
  ],
  graphNotes: [{ at: 0, text: '**Add question wired all of this.** The page starting and Try again reset the question, Check answer marks every gap, and Enter in a gap checks too. Change the gaps in the Question section, not here.' }],
};
