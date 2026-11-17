import type { BuildTutorial } from './index';
import { all, layerWhere, question, renamed, saw, allNodes } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 24,
  level: 'intermediate',
  minutes: 20,
  example: 'tut-label',
  topic: {
    id: 'tutorial-label',
    title: 'Label the diagram',
    group: 'Build it',
    summary: 'A picture with empty spots the learner drags labels onto, checked spot by spot, with a text alternative so it works without seeing the picture.',
    keywords: 'tutorial label labels diagram picture image drag drop slots drop zones spots parts plant alt text text alternative accessibility matching remove auto layout move',
    body: `You will make a labelled diagram: a picture of a plant with four empty spots, and a pile of labels for the learner to drag onto them. One label belongs nowhere. **Check answer** marks each spot on its own. It is a matching question whose slots you move onto the picture, so the marking, tries and keyboard use all come with it. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Label the diagram**. **Play** runs it and **Make my copy** gives you your own copy. Its diagram is drawn with shapes, so it needs no picture file.

Do [Drag and drop matching](tutorial-drag-match) first: this tutorial starts from the same question. You need a picture with four parts to label. Any picture of a plant will do, or use a diagram from your own course.

## 1. Make a project and add the question

1. On the projects page press **New project**. Keep **Blank project**, type **Parts of a plant** as the name and press **Create project**.
2. In the tool bar, open the **Web** group, click **Add question** and pick **Matching (drag and drop)**.

## 2. Write the labels and the spots

Each pair is a label (the term the learner drags) and a spot (what it matches).

1. Replace the **Prompt** with \`Drag each label onto its part of the plant.\`
2. Type over the four sample pairs (France and Paris, and so on), the label in the numbered box and the spot in the box under it:
   - \`Flower\` and \`Spot 1, top left\`
   - \`Leaf\` and \`Spot 2, middle right\`
   - \`Stem\` and \`Spot 3, middle left\`
   - \`Roots\` and \`Spot 4, bottom right\`
3. Under **Extra terms**, press **+ Add extra term** and type \`Bark\`.

The spot's words won't show on the page by the end, but a screen reader says them when a label is dropped there. So say where the spot is, not what goes in it.

## 3. Make room for the picture

1. With **Question 1** selected, set **X** to **40** and **W** to **720** in the **Layer** section. The card gets wider.
2. In the **Layers** panel, open **Question 1** and then **Matching** with their arrows, and click **Matches**. It is the column of slots on the right.
3. In its **Auto layout** section, press **Remove auto layout**. The slots stay where they are, but now each **Match** row can be moved anywhere.
4. Set the height of **Matches**, **H**, to **300**.

![Matches selected in the Layers panel and on the card, with the Auto layout section and its Remove auto layout button in the Properties panel.](help/tutorial-label-matches.png)

## 4. Put the picture in

1. Drop your picture file on the canvas (or use the **Image** tool in the **Media** group of the tool bar).
2. In the **Layers** panel, drag the picture's row onto the middle of the **Matches** row, so it goes inside it.
3. Right-click the picture on the canvas and choose **Order**, then **Send to back** (<kbd>Ctrl</kbd> with the left square bracket key does the same). It goes behind the slots.
4. Set its **X** and **Y** to **0**, **W** to **482** and **H** to **300**, so it fills **Matches**. If changing **W** changes **H** as well, click the link between them first.
5. In its **Accessibility** section, type a **Text alternative** that says where each part is: \`A flowering plant. The flower is at the top, the leaf grows to the right halfway down, the stem runs down the middle, and the roots spread under the ground at the bottom.\`

With that and the spot names, someone who can't see the picture can still do the activity from the keyboard.

## 5. Cut each row down to its slot

Each **Match** row is the spot's words (**Definition**), the dashed **Slot**, and a **Match result** line that says ✓ or ✗ after the question finishes. On a picture you only want the slot.

1. In the **Layers** panel, open **Match 1** to **Match 4**, their **Match line** rows and the **Slot** inside each: the **Definition** sits inside the slot. Click the first **Definition**, <kbd>Ctrl</kbd>+click the other three, and press <kbd>Delete</kbd>.
2. Click **Match 1** and <kbd>Ctrl</kbd>+click **Match 2**, **Match 3** and **Match 4**. Set **W** to **170**, the width of a slot.
3. Click the first **Match result** and <kbd>Ctrl</kbd>+click the other three. In the **Layout item** section, set the first box of **Inset from the frame** (left) to **0**, so each result sits under its slot.

## 6. Move the slots onto the picture

Select **Match 1** and drag it on the canvas to the empty place beside the flower. Do the same for the others: **Match 2** beside the leaf, **Match 3** beside the stem and **Match 4** below the ground near the roots.

The example's diagram uses these places, if you'd like to type them in as **X** and **Y**:

| Row | X | Y |
|---|---|---|
| Match 1 | 20 | 24 |
| Match 2 | 292 | 112 |
| Match 3 | 20 | 150 |
| Match 4 | 292 | 220 |

Leave room under each slot for its result line, and keep the slots inside the picture.

## 7. Marking and feedback

1. Under **Marking**, set **Points** to **4** and **Tries** to **3**. **Part marks** is already ticked.
2. In **Hints**, replace the sample with \`The roots are the only part under the ground.\`
3. Change the feedback lines:
   - **Right**: \`Every label is in the right place. Well done!\`
   - **Wrong**: \`Not yet. Look at where each spot points.\`
   - **Partly right**: \`Some are right, but not all. Move a few and check again.\`
   - **Out of tries**: \`Out of tries. Each spot now shows the label that belongs there.\`

## 8. Try it

1. Press **Preview** at the top right.
2. Drag the labels onto the spots, leaving one wrong, and press **Check answer**. The feedback says how many are right, such as *3 of 4 matched correctly*.

![Preview of the finished example: Flower, Leaf and Stem on their spots, Bark on the roots spot, Roots left in the pile, and the Partly right line with 3 of 4 matched correctly.](help/tutorial-label-partly.png)

3. Use your tries up. The question finishes: each spot is marked ✓ Right or ✗ Wrong in the result line under it, and a wrong one says which label belongs there.

![Out of tries: Flower, Leaf and Stem marked Right in green, Bark marked Wrong in red with The answer is Roots under it, the Out of tries line, Try again and Score: 2.](help/tutorial-label-finished.png)

4. Try it with the keyboard: <kbd>Tab</kbd> to a label, <kbd>Space</kbd> to pick it up, the arrow keys to move between the spots and <kbd>Space</kbd> to drop it.

Press <kbd>Esc</kbd> to close the Preview.

## Go further

- **Lines from the spots.** Draw a line from each slot to its part with the **Pen** tool, inside **Matches** and behind the slots. Set each line's **Role** to **Decorative (hidden from screen readers)** in its **Accessibility** section, since the text alternative already says where everything is.
- **A ready-made one.** The **Label the diagram** starter (**Templates**, **Built-in**) has six spots on a placeholder picture, with a results page.

## What you learned

- A labelled diagram is a matching question whose slots are moved onto a picture. **Check answer** reads which slot each label is in, wherever the slot sits.
- **Remove auto layout** frees a frame's layers to go anywhere, and **Send to back** puts the picture behind them.
- The picture's **Text alternative** and the spot names (the box under each label in the **Question** section) make the activity usable without seeing the picture.

**Next:** see [Accessibility](accessibility) for text alternatives and the keyboard, and [Drag and drop](drag-and-drop) for drop zones on any layer. Every question type is in [Questions and quizzes](question-kit).`,
  },
  guide: {
    1: { check: all(renamed, question('matching')), show: ['project-name', 'add-question'] },
    2: { check: question('matching', (q) => q.pairs.length >= 4 && !q.pairs.some((p) => /^(France|Japan|Egypt|Peru)$/.test(p.term)) && (q.extras ?? []).some((x) => x.text.trim() !== '')), show: 'panel-inspector' },
    3: { check: layerWhere('frame', (n) => /^matches$/i.test(n.name) && !n.layout), show: 'panel-layers' },
    4: { check: (c) => allNodes(c.project).some((n) => (n.type === 'image' || n.role === 'image') && (n.ariaLabel ?? '').trim().length > 20), show: ['tool-image', 'panel-inspector'] },
    5: { check: all(question('matching'), (c) => !allNodes(c.project).some((n) => /^definition/i.test(n.name))), show: 'panel-layers' },
    6: { check: (c) => new Set(allNodes(c.project).filter((n) => /^match \d/i.test(n.name)).map((n) => Math.round(n.x))).size >= 2, show: 'panel-layers' },
    7: { check: question('matching', (q) => q.attempts > 0 && q.points > 1 && q.feedbackPartial.trim() !== ''), show: 'panel-inspector' },
    8: { check: saw('previewed'), show: 'preview' },
  },
};
