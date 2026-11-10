import type { BuildTutorial } from './index';
import { nodesOfKind, question, renamed, saw } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 22,
  level: 'intermediate',
  minutes: 12,
  example: 'tut-sort',
  topic: {
    id: 'tutorial-sort',
    title: 'Sort into groups',
    group: 'Build it',
    summary: 'Six cards to drag into two labelled groups, each drop answered as it lands, then all of them checked together with a count of how many are right.',
    keywords: 'tutorial sort sorting categorise categorize groups group boxes drag drop cards items belongs in drop feedback right wrong count part marks renewable energy',
    body: `You will make a sorting activity: six energy sources to drag into two groups, **Renewable** and **Non-renewable**. Each group box holds as many cards as you drop in it. As each card lands the learner is told whether it fits, and **Check answer** then marks all of them together and says how many are right. It takes about twelve minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Sort into groups**. **Play** runs it and **Make my copy** gives you your own copy.

If you haven't made a question before, [Drag and drop matching](tutorial-drag-match) is a gentler start. This one works the same way, except a box holds several cards.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Energy sort** as the name and press **Create project**.

## 2. Add the question

1. In the tool bar down the left, open the **Web** group (click **Web** if it is folded).
2. Click **Add question** and pick **Categorise (drag into groups)**.

A card called **Question 1** appears with a sample prompt, two group boxes, **Mammals** and **Birds**, and four animals under them to drag (Dog, Whale, Eagle and Penguin). It is selected and the **Question** section is open in the Properties panel.

## 3. Name the groups

1. Replace the **Prompt** with \`Drag each energy source into the group it belongs to.\`
2. The groups are listed first, one box each. Change **Mammals** to \`Renewable\` and **Birds** to \`Non-renewable\`. The headings in the boxes change as you type. The box layers in the **Layers** panel take the new names too, and so do the drop events in Preview's **Debug** list. A layer you have named yourself keeps its name.

**+ Add group** adds another box (up to six). With three groups the boxes share the width of the card.

## 4. Write the cards

Under the groups is one entry for each card: its words, and **Belongs in**, the group it is right in.

1. Type over the four sample cards with \`Solar\`, \`Wind\`, \`Coal\` and \`Oil\`. The first two already belong in **Renewable** and the last two in **Non-renewable**, because the animals they replace did.
2. Press **+ Add item** and type \`Hydro\` in the new, empty box. A new card belongs in the first group, which is right for Hydro.
3. Press **+ Add item** again and type \`Natural gas\`. Set its **Belongs in** to **Non-renewable**.
4. Under each card is **Feedback if put in the wrong group (optional)**. Give the two that are easiest to get wrong a reason:
   - Hydro: \`Hydro runs on flowing water, which rain keeps topping up.\`
   - Natural gas: \`Natural gas took millions of years to form, so once it is burnt it is gone.\`

The new cards appear under the boxes as you add them.

![The canvas and the Question section: the Renewable and Non-renewable boxes with six cards under them, and the six items with their Belongs in groups and Hydro's feedback.](help/tutorial-sort-items.png)

## 5. Answer each drop as it lands

Tick **Say right or wrong as each item is dropped**.

Now each drop answers straight away, in the feedback line and to screen readers: *Solar goes in Renewable. Right.* A card dropped in the wrong group says its own feedback from step 4, or *Coal does not go in Renewable. Try another group.* if it has none. This does not use a try, and the learner can still move the card. **Check answer** is what marks the activity.

Leave it unticked when the sort is a test and the learner should find out only at the end.

## 6. Marking, hints and feedback

1. Under **Marking**, set **Points** to **6** and **Tries** to **2**. **Part marks** is already ticked, so each card in the right group is worth one point.
2. In **Hints**, replace the sample with \`Ask: will it run out if we keep using it?\`
3. Change the feedback lines:
   - **Right**: \`All six are in the right group. Well done!\`
   - **Wrong**: \`Not yet. Think about which ones can run out.\`
   - **Partly right**: \`Some are right, but not all. Move a few and check again.\`
   - **Out of tries**: \`Out of tries. Where each one goes is listed below.\`

![Say right or wrong as each item is dropped ticked, Marking with Points 6 and Tries 2, and the hint and four feedback lines filled in.](help/tutorial-sort-marking.png)

The question adds the count to the feedback by itself, such as *4 of 6 in the right group*, and the reason of a card that ended up in the wrong group.

## 7. Try it

1. Press **Preview** at the top right.
2. Drag **Solar** into **Renewable**: the feedback says it is right. Drag **Natural gas** into **Renewable**: its own reason shows. A card lands where you let go of it, and the box doesn't arrange them, so drop each one in a different spot. Two dropped in the same place sit on top of each other and the one underneath is hidden.

![Preview: Natural gas dropped in the Renewable box, and its reason in the feedback line under the cards still to sort.](help/tutorial-sort-drop.png)

3. Put the rest where they belong, leave Natural gas where it is, and press **Check answer**. It says *Some are right* with *5 of 6 in the right group*.
4. Check once more without moving it. That was the last try: the question finishes, the cards are marked ✓ or ✗ and stop moving, and a line under the cards says where Natural gas goes.

![Out of tries: Natural gas marked with a cross in Renewable, Oil ticked in Non-renewable, the line Natural gas goes in Non-renewable, the Out of tries feedback with 5 of 6 in the right group, Try again and Score: 5. The other cards were dropped in the same spots, so they are hidden underneath.](help/tutorial-sort-finished.png)

5. Try it with the keyboard: <kbd>Tab</kbd> to a card, <kbd>Space</kbd> to pick it up, the arrow keys to choose a group and <kbd>Space</kbd> to drop it.

**Try again** puts the cards back. Press <kbd>Esc</kbd> to close the Preview.

## Go further

Open the **Interactions** tab. There is one **Item dropped in a group** node for each group, made when you ticked the box in step 5. It has a *right* and a *wrong* output, so you can add your own steps after it: a sound for a right drop, or a **Set variable** that adds 1 to a \`misses\` variable on *wrong*, to say on a results page how many wrong drops it took. The **Sort into groups** starter (**Templates**, **Built-in**) counts wrong drops that way.

## What you learned

- A group box is a drop zone with no limit, so it holds any number of cards, and every box takes every card. Whether it is right is for **Check answer** to say.
- **Belongs in** sets the right group, and a card's own feedback explains a wrong one.
- **Say right or wrong as each item is dropped** answers each drop without using a try, through an **Item dropped in a group** node per group.

**Next:** put the steps of a process in order in [Put the steps in order](tutorial-order). More about categorise questions is in [Questions and quizzes](question-kit), and about drop zones in [Drag and drop](drag-and-drop).`,
  },
  guide: {
    1: { check: renamed, show: 'project-name' },
    2: { check: question('categorise'), show: 'add-question' },
    3: { check: question('categorise', (q) => (q.groups ?? []).length >= 2 && !(q.groups ?? []).some((g) => /^(Mammals|Birds)$/.test(g.name))), show: 'panel-inspector' },
    4: { check: question('categorise', (q) => (q.cards ?? []).length >= 6 && !(q.cards ?? []).some((c) => /^(Dog|Whale|Eagle|Penguin)$/.test(c.text)) && (q.cards ?? []).some((c) => !!c.feedback?.trim())), show: 'panel-inspector' },
    5: { check: nodesOfKind('action.questionDrop'), show: 'panel-inspector' },
    6: { check: question('categorise', (q) => q.attempts > 0 && q.points > 1 && q.feedbackPartial.trim() !== ''), show: 'panel-inspector' },
    7: { check: saw('previewed'), show: 'preview' },
  },
};
