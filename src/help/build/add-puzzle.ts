import type { Artboard, SceneNode } from 'interactives-player';
import type { BuildTutorial } from './index';
import { saw, type Check } from '../../lib/tutorial-checks';

//The Visual novel template's own sample puzzle and a new puzzle's sample question, so a check can tell what the learner did
const SAMPLE_TITLES = ['who brought the biscuits?'];
const SAMPLE_PROMPT = 'Which of these is a prime number?';
const SAMPLE_HINT = 'A prime number can only be divided evenly by 1 and by itself.';

const theirs = (c: Parameters<Check>[0]): Artboard[] => c.project.artboards.filter((a) => a.puzzle && !SAMPLE_TITLES.includes(String(a.puzzle.title ?? '').trim().toLowerCase()));
const questionOf = (a: Artboard) => {
  let q: { prompt: string } | undefined;
  const walk = (list: SceneNode[]) => {
    for (const n of list) {
      if (!q && n.type === 'frame' && n.question) q = n.question;
      if ('children' in n && Array.isArray(n.children)) walk(n.children as SceneNode[]);
    }
  };
  walk(a.children);
  return q;
};

const madeOne: Check = (c) => theirs(c).length > 0;
const ownQuestion: Check = (c) => theirs(c).some((a) => {
  const q = questionOf(a);
  return !!q && q.prompt.trim() !== '' && q.prompt.trim() !== SAMPLE_PROMPT;
});
const ownHints: Check = (c) => theirs(c).some((a) => {
  const p = a.puzzle!;
  return !!String(p.title ?? '').trim() && String(p.title).trim() !== 'Prime time' && (p.hints ?? []).some((h) => h.trim() && h.trim() !== SAMPLE_HINT);
});
const called: Check = (c) => {
  const text = (c.project.story?.chapters ?? []).flatMap((ch) => ch.lines.map((l) => l.text.trim().toLowerCase()));
  return theirs(c).some((a) => text.includes(`[call ${a.name.trim().toLowerCase()}]`)) && text.some((l) => l.includes('story.result'));
};

export const tutorial: BuildTutorial = {
  order: 47,
  level: 'beginner',
  minutes: 10,
  example: 'tut-add-puzzle',
  topic: {
    id: 'tutorial-add-puzzle',
    title: 'Add a puzzle',
    group: 'Build it',
    summary: 'Put a puzzle in a story: a question in the puzzle frame, hints bought with hint coins, called from the script, with the story answering how it went.',
    keywords: 'tutorial puzzle puzzles story visual novel hint hints hint coins value score frame call story result question',
    body: `You will add a puzzle to a story: Ren asks the reader a riddle, the reader can buy hints with hint coins, and Ren answers differently when it's solved. It takes about ten minutes. Use the story from [Your first visual novel](tutorial-visual-novel), or start a new project from the **Visual novel** template.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Add a puzzle**.

A puzzle is a page the story goes to and comes back from. Its frame (the number and value along the top, the hints and coins down the side, the big right or wrong moment) is already wired; you write the question and the hints.

## 1. Make a puzzle page

In the **Story** tab press **+ New puzzle**. A new page opens with a question in the middle and the puzzle frame around it. (The Visual novel template has a **Puzzle 1** already, so yours is **Puzzle 2**.)

## 2. Write the question

Select the question on the page and change it in the **Properties** panel:

- **Question**: \`What gets wetter the more it dries?\`
- The options: **A towel** (right), **The rain**, **A sponge**.

## 3. Title, value and hints

Click an empty part of the page so the page itself is selected, and open its **Puzzle** section:

- **Title**: \`Ren's riddle\`
- **Hint 1**: \`Think about what you use after a shower.\`
- **Hint 2**: \`It hangs in the bathroom.\`
- **Big hint**: \`You dry yourself with it.\`

Each hint costs a hint coin the first time; a new game starts with 3.

## 4. Call it from the story

In the **Story** tab, under Ren's lines, add (use your puzzle page's name):

\`\`\`
Ren: Before you sit down, answer me this.
[call Puzzle 2]
if story.result == "solved"
    Ren (happy): Clever. You can stay.
else
    Ren: We'll call that a maybe.
\`\`\`

## 5. Play it

Press **Preview**, play to the riddle, open a hint, answer it wrong once to see the value drop, then right. **Continue** takes you back to the story, which answers how it went.

help:story-puzzles help:story`,
  },
  guide: {
    1: { check: madeOne, show: 'panel-story' },
    2: { check: ownQuestion, show: 'panel-inspector' },
    3: { check: ownHints, show: 'panel-inspector' },
    4: { check: called, show: 'panel-story' },
    5: { check: saw('previewed'), show: 'preview' },
  },
};
