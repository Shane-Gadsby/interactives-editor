import type { BuildTutorial } from './index';
import { all, bound, layerNamed, question, renamed, saw } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 20,
  level: 'intermediate',
  minutes: 15,
  example: 'tut-blanks',
  topic: {
    id: 'tutorial-blanks',
    title: 'Fill in the blanks with typed answers',
    group: 'Build it',
    summary: 'Four gaps the learner types into, accepting other wordings, near numbers and a pattern, with part marks and a tip for one gap.',
    keywords: 'tutorial fill in the blank blanks gap gaps cloze typed answer type accepted answers alternatives pattern regex regular expression match case capitals spaces tolerance number near part marks tip per gap feedback',
    body: `You will make one question with four gaps to type into. Each gap shows a different way of deciding what counts as right: other wordings of the same answer, a number that only has to be close, a pattern, and a gap where capital letters matter. One gap also gets its own tip when it is answered wrong. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Fill in the blanks**. **Play** runs it and **Make my copy** gives you your own copy.

If you haven't made a question before, do [A multiple choice question](tutorial-mcq) first. This one uses the same **Question** section.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Science gaps** as the name and press **Create project**.

## 2. Add the question

1. In the tool bar down the left, open the **Web** group (click **Web** if it is folded).
2. Click **Add question** and pick **Fill in the blank**.

A card called **Question 1** appears with a sample prompt, *Complete the sentence.*, and one gap, *The capital of France is*, that accepts *Paris*. It is selected and the **Question** section is open in the Properties panel. Leave **Answer by** on **Typing**.

## 3. Write the gaps

1. Replace the **Prompt** with \`Fill in each gap, then press Check answer.\`
2. Each gap has a **Blank** box (the words shown above the box the learner types in) and an **Accepted answers** box, with **Match case** and **± Tolerance** under it.

**Gap 1: other wordings.** In **Blank 1** type \`The largest ocean on Earth is the\`. In **Accepted answers** type three lines:

\`\`\`
Pacific
Pacific Ocean
the Pacific
\`\`\`

Any one line is right. Capital letters and extra spaces are ignored, so *pacific  ocean* counts too.

**Gap 2: a near number.** Press **+ Add blank** (under the last gap). The new gap says *Answer 2*: type over it. In **Blank 2** type \`Light from the Sun reaches Earth in about this many minutes:\` and in **Accepted answers** type \`8.3\`. Set **± Tolerance** to **0.5**. A number is compared as a number, so *8*, *8.5* and *8.30* all count, and *9* does not.

**Gap 3: a pattern.** Press **+ Add blank**. In **Blank 3** type \`Plants take in this gas from the air:\` and give it two lines of accepted answers:

\`\`\`
carbon dioxide
/^(carbon\\s+dioxide|co2)$/i
\`\`\`

A line written between slashes is a pattern. This one accepts *carbon dioxide* or *CO2*: \`^\` and \`$\` mean the whole answer, \`|\` means or, \`\\s+\` is any number of spaces, and the \`i\` at the end ignores capitals. Keep the plain line first: it is what the learner is shown if the gap is revealed, and a pattern has nothing to show. A **Shown as** box appears under any gap that has a pattern. Left empty it uses that plain line; if every line is a pattern, type the word to show there. Each gap also has a **Feedback if wrong (optional)** box for a line to add when that gap is wrong.

![The canvas and the Question section: the prompt, then Blank 1 with three accepted answers, Blank 2 with 8.3 and a tolerance of 0.5, and Blank 3 with a plain line, a pattern and a Shown as box.](help/tutorial-blanks-gaps.png)

**Gap 4: capitals count.** Press **+ Add blank**. In **Blank 4** type \`The chemical symbol for sodium is\` and accept \`Na\`. Tick **Match case**, so *NA* and *na* are wrong.

The **×** beside a blank removes it.

## 4. Marking, hints and feedback

1. Under **Marking**, set **Points** to **4** and **Tries** to **2**. **Part marks** is already ticked, so each right gap is worth a share: three right out of four scores 3.
2. In **Hints**, type two lines: \`The ocean is between Asia and the Americas.\` and \`Sodium's symbol comes from its Latin name, natrium.\` Each press of **Hint** shows the next one.
3. Change the feedback lines:
   - **Right**: \`All four are right. Well done!\`
   - **Wrong**: \`None are right yet. Have another look and check again.\`
   - **Partly right**: \`Some are right, but not all. Have another look and check again.\`
   - **Out of tries**: \`Out of tries. Each gap you missed shows its answer.\`
4. Leave **Show the right answer when finished wrong** ticked. When the tries run out, each wrong gap shows *Accepted answer:* and the first plain line of its answers.

![Marking with Points 4, Tries 2 and Part marks ticked, and Hints and feedback filled in: two hints and the Right, Wrong, Partly right and Out of tries lines.](help/tutorial-blanks-marking.png)

While the learner still has a try left, the feedback only says how it went overall. Which gaps are right is not shown until the question finishes, so a learner can't find the answers by changing one gap at a time.

## 5. A tip for one gap

When the question finishes, it marks each gap on its own: the box of a right gap turns green and a wrong one red. You can use that to show a tip under one gap only.

1. Press <kbd>T</kbd> for the **Text** tool and click on the page below the card. Type \`Tip: it is the gas you breathe out. CO2 is accepted too.\` and press <kbd>Escape</kbd>. The layer is called **Text**: change its **Name**, at the top of the **Layer** section, to **Gap 3 tip**.
2. In the **Layers** panel, open **Question 1** and then **Blanks** with their arrows. Drag **Gap 3 tip** onto the middle of the **Blank 3** row, so it goes inside it. It now sits inside **Blank 3**, at the top of its rows, and shows under the third gap.
3. With **Gap 3 tip** selected, open **Data bindings** in the Properties panel and press **+ Add binding**. Pick **Visible** from the list (typing *vis* finds it), then choose **Formula**. Visible offers pickers for a condition first: press **Edit as formula** and type \`q1_items[2]?.state == "wrong"\` in **Condition**.

\`q1_items\` is the question's list of gaps, counted from 0, so \`[2]\` is the third. Its \`state\` is *correct* or *wrong* once the question has finished. The tip disappears from the canvas, because nothing has been marked yet. The binding says *currently false*.

![Gap 3 tip inside Blank 3 in the Layers panel, and its Visible binding set to a formula on the third gap's state being wrong, currently false.](help/tutorial-blanks-tip.png)

## 6. Try it

1. Press **Preview** at the top right.
2. Type \`pacific ocean\`, \`8\`, \`Carbon dioxide\` and \`NA\`, then press **Check answer** (or <kbd>Enter</kbd> in any gap). The **Partly right** feedback shows: three are right, and *NA* is wrong because **Match case** is on.

![Preview after the first check: the four answers typed, the Partly right line in red, and the Debug panel's live variables showing one try left and a score of 3.](help/tutorial-blanks-preview-partly.png)

3. Change the last gap to \`Na\` and the third to \`oxygen\`, and check again. That was the last try, so the question finishes: three boxes turn green and gap 3 red, the tip and *Accepted answer: carbon dioxide* show under it, and the score is 3.

![The finished question: three green boxes, oxygen in a red box with Accepted answer: carbon dioxide and the tip under it, the Out of tries line, Try again and Score: 3.](help/tutorial-blanks-preview-finished.png)

4. Press **Try again** to start over. Press <kbd>Esc</kbd> to close the Preview.

## Go further

- **A spelling test.** Tick **Spelling: letters must match exactly** on a gap and every letter has to be there, with no near misses. The **Spelling test** starter (**Templates**, **Built-in**) builds a whole test this way: see [Spelling tests](question-kit#spelling-tests).
- **Drag the words in instead.** Set **Answer by** to **Dragging words from a word bank**. Each gap becomes a slot, and the first plain answer of each gap becomes a word to drag. **Extra words** adds words that fit no gap.
- **A gap in the middle of a sentence.** The **Fill in the blanks** starter on **Templates**, **Built-in** puts the end of each sentence after its box, so the passage reads as one paragraph.

## What you learned

- **Accepted answers** take one answer per line, and capitals and spaces are ignored unless **Match case** is ticked.
- A number is compared as a number, and **± Tolerance** accepts one that is close. A line between slashes is a pattern.
- **Part marks** give a share for each right gap. Once the question finishes, \`q1_items\` tells you how each gap went, so a binding can react to one gap.

**Next:** more about every question type is in [Questions and quizzes](question-kit). Patterns are explained in [Expressions](expressions#patterns-regular-expressions), and the **Text patterns** example (**Templates**, **Examples**) has more to try. Bindings are explained in [Bindings](bindings). For a question answered by dragging, try [Drag and drop matching](tutorial-drag-match).`,
  },
  guide: {
    1: { check: renamed, show: 'project-name' },
    2: { check: question('blank'), show: 'add-question' },
    3: { check: question('blank', (q) => q.blanks.length >= 4 && q.blanks.some((b) => (b.tolerance ?? 0) > 0) && q.blanks.some((b) => b.answers.some((a) => /^\/.+\/[a-z]*$/.test(a))) && q.blanks.some((b) => b.caseSensitive) && !q.blanks.some((b) => /capital of France/i.test(b.label))), show: 'panel-inspector' },
    4: { check: question('blank', (q) => q.hints.length >= 2 && q.attempts > 0 && q.points > 1 && q.feedbackPartial.trim() !== ''), show: 'panel-inspector' },
    5: { check: all(layerNamed('text', /gap 3 tip/i), bound('text', 'visible', 'wrong')), show: ['tool-text', 'panel-layers'] },
    6: { check: saw('previewed'), show: 'preview' },
  },
};
