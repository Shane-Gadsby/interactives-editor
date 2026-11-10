import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 21,
  level: 'beginner',
  minutes: 10,
  example: 'tut-drag-match',
  topic: {
    id: 'tutorial-drag-match',
    title: 'Drag and drop matching',
    group: 'Build it',
    summary: 'Drag each country onto its capital, with a country that belongs nowhere, three tries, part marks and Try again.',
    keywords: 'tutorial drag drop matching match pairs terms definitions slots drop zone country capital extra term distractor tries part marks try again reset keyboard score',
    body: `You will make a matching question: the learner drags each country onto its capital city. One extra country has no capital on the list, so it has to be left alone. The learner gets three tries, a share of the points for each one in the right place, and **Try again** at the end. It takes about ten minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Drag and drop matching**. **Play** runs it and **Make my copy** gives you your own copy.

You don't make anything draggable by hand. **Add question** builds the countries as draggable layers and the slots as drop zones, and it checks where each country landed.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Capital cities** as the name and press **Create project**.

## 2. Add the question

1. In the tool bar down the left, open the **Web** group (click **Web** if it is folded).
2. Click **Add question** and pick **Matching (drag and drop)**.

A card called **Question 1** appears, already working, with four sample pairs (France and Paris, Japan and Tokyo, and so on). On the left is a pile of **terms** to drag. Next to it are the capitals, and each capital has a dashed **slot** on its right. The card is selected and the **Question** section is open in the Properties panel.

## 3. Write the pairs

Each pair in the **Question** section is a term (what the learner drags) and what it matches (the words beside its slot).

1. Replace the **Prompt** with \`Drag each country onto its capital city. One country has no capital here.\`
2. Type over the four sample pairs, the term in the numbered box and what it matches in the box under it:
   - \`Australia\` and \`Canberra\`
   - \`Canada\` and \`Ottawa\`
   - \`Brazil\` and \`Brasília\`
   - \`Kenya\` and \`Nairobi\`

![The canvas and the Question section: the country pile, the capitals and their dashed slots, the four pairs filled in, and Spain under Extra terms.](help/tutorial-drag-match-pairs.png)

The terms and the words beside the slots change on the canvas as you type. **+ Add pair** adds another (up to eight), the arrows move a pair, and **×** removes one.

## 4. Add a country that fits nowhere

Under the pairs is **Extra terms**. Press **+ Add extra term** and type \`Spain\` in the box it adds.

Spain joins the pile and is dragged like the others, but it has no slot of its own. Left in the pile is right. Dropped into a slot it is wrong, and it takes that slot from the country that belongs there.

The card grows to fit the longer pile, and it now runs a little past the bottom of the 800 × 600 page, so the buttons would be cut off in Preview. Click **Home** at the top of the **Layers** panel to select the page, and make **H** bigger in the **Page** section, such as \`700\`.

## 5. Tries, marks and feedback

1. Under **Marking**, set **Points** to **4** and **Tries** to **3**.
2. **Part marks** is already ticked, so three countries in the right place score 3. **Shuffle** is ticked too, so the pile is dealt in a different order each time.
3. In **Hints**, replace the sample with \`Canberra was built to be the capital, between Sydney and Melbourne.\`
4. Change the feedback lines:
   - **Right**: \`All four matched. Well done!\`
   - **Wrong**: \`Not yet. Move the countries and check again.\`
   - **Partly right**: \`Some are right, but not all. Move a few and check again.\`
   - **Out of tries**: \`Out of tries. Each slot now shows the country that belongs there.\`

The question adds how many are right to the feedback by itself, such as *2 of 4 matched correctly*. It doesn't say which ones until the question finishes, so a learner can't just try each country in each slot.

## 6. Try it

1. Press **Preview** at the top right.
2. Drag **Spain** onto the Canberra slot and the other three onto their own capitals, then press **Check answer**. The **Partly right** feedback shows, with *3 of 4 matched correctly*. Spain in a slot also costs a share of the points, so the score is 2.

![Preview after the first check: Spain in the Canberra slot, the other three on their capitals, and the Partly right line with 3 of 4 matched correctly.](help/tutorial-drag-match-partly.png)

3. Drag a country onto a slot that is already full: the two swap, and the one that was there goes back to where the new one came from.
4. Use your tries up with a wrong answer. The question finishes: the countries stop moving, every slot is marked ✓ Right or ✗ Wrong, each wrong one says *✗ Wrong. The answer is* and the country that belongs there (the line is only as wide as the slot, so the name may be cut off), the score shows, and **Try again** appears. Press it and the countries go back to the pile.

![Out of tries: Australia and Kenya marked Right in green, Brazil and Canada swapped and marked Wrong in red, the Out of tries line, Try again and the score.](help/tutorial-drag-match-finished.png)

5. Try it with the keyboard: <kbd>Tab</kbd> to a country, <kbd>Space</kbd> to pick it up, the arrow keys to choose a slot and <kbd>Space</kbd> to drop it. <kbd>Esc</kbd> puts it back.

Press <kbd>Esc</kbd> to close the Preview.

## Make it yours

The terms and slots are ordinary layers. The **Restyle a part** buttons at the bottom of the **Question** section select a **Term**, a **Slot** or a **Definition** for you. Unlike the options of a multiple choice question, each pair has layers of its own, so select all four terms in the **Layers** panel (<kbd>Ctrl</kbd>+click) to restyle them together.

## What you learned

- A matching question's terms are draggable layers and its slots are drop zones that hold one term each. **Check answer** reads which slot every term ended up in.
- **Extra terms** are dragged like the others but belong nowhere.
- **Tries**, **Part marks** and **Try again** come with the question, and **Try again** puts every term back.

**Next:** put the slots on a picture in [Label the diagram](tutorial-label), or let a box hold several items in [Sort into groups](tutorial-sort). How dragging works on any layer is in [Drag and drop](drag-and-drop).`,
  },
};
