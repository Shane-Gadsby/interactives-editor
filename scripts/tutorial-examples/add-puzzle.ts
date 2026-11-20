//Add a puzzle's finished project: Your first visual novel's story, with Ren's riddle as a puzzle page (a question, a title,
//two hints and a big one) that the At the library scene calls and answers to
import type { Project } from 'interactives-player';
import type { TutorialExample } from './kit';
import { visualNovel } from '../../src/lib/story-template';
import { linesOf } from '../../src/lib/story';
import { addPuzzlePage } from '../../src/lib/puzzle-page';
import { STARTER_GRAPH_NOTES, withRen } from './visual-novel';

export const CALL = `Ren: Before you sit down, answer me this.
[call Puzzle 2]
if story.result == "solved"
    Ren (happy): Clever. You can stay.
else
    Ren: We'll call that a maybe.`;

function build(): Project {
  const { project } = visualNovel();
  project.settings.title = 'The library';
  delete project.template;
  withRen(project);
  addPuzzlePage(project, {
    name: 'Puzzle 2',
    title: 'Ren’s riddle',
    hints: ['Think about what you use after a shower.', 'It hangs in the bathroom.'],
    bigHint: 'You dry yourself with it.',
    question: {
      prompt: 'What gets wetter the more it dries?',
      options: [
        { id: 'o1', text: 'A towel', correct: true },
        { id: 'o2', text: 'The rain' },
        { id: 'o3', text: 'A sponge' },
      ],
      shuffle: false,
    },
  });
  project.artboards.forEach((a, i) => (a.canvasX = i * (1280 + 160)));
  project.story!.chapters[0].lines.push(...linesOf(CALL));
  return project;
}

export const example: TutorialExample = {
  key: 'tut-add-puzzle',
  topic: 'tutorial-add-puzzle',
  title: 'Add a puzzle',
  description: 'Ren asks a riddle: a puzzle page with hints bought with hint coins, called from the story, which answers to how it went. The Add a puzzle tutorial\'s project.',
  tags: ['story', 'visual novel', 'puzzles'],
  build,
  notes: [
    { text: '**Puzzle 2 is the riddle.** Its title, value and hints are under *Puzzle* in the page settings; the question answers the puzzle when it\'s checked.' },
    { text: '**The Story tab calls it** with `[call Puzzle 2]`, then `if story.result == "solved"` picks Ren\'s answer.', colour: 'sky' },
  ],
  graphNotes: [...STARTER_GRAPH_NOTES, { page: 8, at: 0, text: '**Ren\'s riddle has the same frame** as Puzzle 1: its buttons are wired already, and the question answers it.' }],
};
