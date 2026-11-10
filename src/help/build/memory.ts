import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 41,
  level: 'intermediate',
  minutes: 35,
  example: 'tut-memory',
  topic: {
    id: 'tutorial-memory',
    title: 'A memory card game',
    group: 'Build it',
    summary: 'Twelve cards dealt face down from six pairs: turn two, keep a match, a miss turns back after a moment, with a moves count and a win page.',
    keywords: 'tutorial memory game pairs cards concentration match matching flip turn shuffle seed deal repeater grid list change one list item wait timer moves game state live variable',
    body: `You will make a memory game. Six pairs of words (an animal and its young) are dealt as twelve cards, face down. The learner turns two at a time: a pair stays face up, a miss turns back after a second. A counter shows the moves, and finding every pair goes to a **Well done** page. It takes about thirty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Memory card game**. **Play** runs it and **Make my copy** gives you your own copy. The **Memory game** starter (**Templates**, **Built-in**, **Branded starter packs**) works the same way.

The whole game lives in one list. Each card is an item with its words, which pair it belongs to and its state: \`down\`, \`up\` or \`matched\`. A click changes one card's state, and everything on screen is worked out from the list.

## 1. Make the project

1. On the projects page press **New project**. Keep **Blank project**, type **Animal pairs** and press **Create project**.
2. Click the page's name and change **Name** to \`Memory\`. Press **+ Add page** at the bottom of the **Layers** panel and name the new page \`Well done\`.

## 2. The pairs and the deal

Open the **Variables** tab and add these, in this order, with **+ Add variable**. The name is saved when you press <kbd>Tab</kbd> or click away.

1. **List**, named \`pairs\`. Replace its value with the six pairs:

\`\`\`
[{"a": "Cat", "b": "Kitten"}, {"a": "Dog", "b": "Puppy"}, {"a": "Cow", "b": "Calf"}, {"a": "Sheep", "b": "Lamb"}, {"a": "Horse", "b": "Foal"}, {"a": "Duck", "b": "Duckling"}]
\`\`\`

2. **Counter**, named \`seed\`. It stays at 0.
3. **List**, named \`cards\`. In its **Value** column change **Starts as a value** to **Worked out**, and type this formula in the new box under the \`[]\`:

\`\`\`
shuffle(pairs.flatMap((p, i) => [{text: p.a, pair: i, state: "down"}, {text: p.b, pair: i, state: "down"}]), seed)
\`\`\`

It makes two face-down cards from every pair, both with the pair's number, and shuffles all twelve. \`shuffle(list, seed)\` gives the same order for the same seed, so changing \`seed\` deals a new order and you can always get a deal back to test it.

4. **Counter**, named \`moves\`.
5. **List**, named \`ups\`. **Worked out**, with \`cards.map((c, i) => c.state == "up" ? i : -1).filter(i => i >= 0)\`, and tick **Keep up to date**. It is the positions of the cards that are face up right now.
6. **Counter**, named \`matched\`. **Worked out**, with \`cards.filter(c => c.state == "matched").length / 2\`, and tick **Keep up to date**. It is how many pairs are found.

\`ups\` and \`matched\` are never set by hand. They follow \`cards\`, so the game state is all in one list.

## 3. Lay out the cards

1. On **Memory**, press <kbd>F</kbd> and drag a frame across most of the page, below the top. Name it **Cards**.
2. Press <kbd>B</kbd> and drag a button inside the frame, about 170 by 100. A layer you draw over a frame goes into it. Name the button **Card**.
3. Select **Cards**. In its **Repeat (list)** section tick **Repeat the first child for each item**. Set **Items** to \`cards\`, **Layout** to **Grid**, **Cols** to \`4\` and **Gap** to \`12\`. Twelve cards appear in three rows of four.
4. Select **Card** and set its **Label** to:

\`\`\`
{item.state == "down" ? "?" : item.text}
\`\`\`

\`item\` is the card each copy shows. Face down it says **?**; face up it shows its word.

![Cards selected: on the canvas twelve gold cards in three rows of four, and its Repeat (list) section with Items cards, currently 12 items, Layout Grid, Gap 12 and Cols 4.](help/tutorial-memory-grid.png)

5. Still on **Card**, open **Data bindings** and press **+ Add binding**. Pick **Fill colour**, choose **By value** and pick \`item.state\` from the list (it is the field of the item that says *down*, *up* or *matched*). Press **+ Add a value** twice: when it is \`down\` the fill is gold \`#f6c344\`, when it is \`matched\` it is green \`#bfe5c4\`. Press **Choose one** beside **Otherwise** and pick white: that is for a card turned up.
6. Add one more binding: **Text alternative**, **Formula**, \`"Card " + (index + 1) + (item.state == "down" ? ", face down" : ": " + item.text)\`, so a screen reader hears more than a question mark.

The line under each binding works it out for the first card, from the first item of the deal.

7. Above the frame, add two text layers: \`Moves: {moves}\` and \`Pairs found: {matched} of {pairs.length}\`.

## 4. Deal when the page opens

1. Open the **Interactions** tab. Type \`page is shown\` in **Search nodes** and click **When the page is shown** to add it.
2. Drag from its dot into empty space, find **Change a value or counter** and set **Variable** to **seed**, **Do** to **Add to it** and **Value** to \`1\`.
3. Drag from that node into empty space, find **Put values back to the start** and tick **cards** and **moves** in its list.

Putting \`cards\` back works its formula out again with the new seed, so every visit to the page is a fresh deal with the moves at 0.

## 5. Turn a card

This is the one flow for all twelve cards. A click on any copy runs it, and \`event.index\` says which card it was.

1. Select **Card** on the canvas and press **+ On click (empty)** in its **Interactions** section. A **When clicked or hovered** node appears in the graph.
2. Click the node. In **Only if**, press **Edit as formula** and type:

\`\`\`
ups.length < 2 && cards[event.index].state == "down"
\`\`\`

Clicks are ignored while two cards are already up, and on a card that is not face down. (Conditions in this tutorial are typed: wherever a condition box shows pickers, press **Edit as formula** first.)

3. Drag from its dot, find **Change a value or counter** and set: **Variable** **cards**, **Do** **Change one list item**, leave **Item position** empty (it is then \`event.index\`, the card that was clicked), **Field** \`state\`, **Value** \`"up"\`.

## 6. Check the pair

1. Drag from that node, find **Check a condition** and set **Condition** to \`ups.length == 2\`. Its **true** output runs when this was the second card up.
2. Drag from **true**, find **Change a value or counter**: **Variable** **moves**, **Do** **Add to it**, **Value** \`1\`. Two cards turned is one move.
3. Drag from that node, find **Check a condition** and set **Condition** to \`cards[ups[0]].pair == cards[ups[1]].pair\`: the two cards up belong to the same pair.
4. From its **true** output, add **Change a value or counter**: **Variable** **cards**, **Do** **Set to**, **Value**:

\`\`\`
cards.map(c => c.state == "up" ? {...c, state: "matched"} : c)
\`\`\`

5. From its **false** output, add **Wait** with **Milliseconds** \`1000\`. Then, after the **Wait**, add **Change a value or counter**: **Variable** **cards**, **Do** **Set to**, **Value**:

\`\`\`
cards.map(c => c.state == "up" ? {...c, state: "down"} : c)
\`\`\`

Press **Read as sentences** above the graph to check the whole flow in words.

![Read as sentences: When Card is clicked, only if ups.length < 2 and the card is down, then change an item of the list cards, then check whether ups.length is 2, and the match and miss branches under it; below it the deal when the page is shown and the win when matched changes.](help/tutorial-memory-sentences.png)

The **Wait** is the timer that turns cards back. For that second both cards are up, so \`ups.length\` is 2 and the **Only if** from step 5 holds every other click.

## 7. Win, and play again

1. Add a **When a value changes** node from the palette and set **Variable** to **matched**. In **Only if**, type \`matched == pairs.length\`.
2. Drag from it to a **Wait** of \`800\`, then to a **Go to a page** with **Go to** set to **Next page**.
3. On **Well done**, add a title and a text layer saying \`You found all {pairs.length} pairs in {moves} moves.\`
4. Add a **Play again** button. In its **Interactions** section press **+ When clicked…**, choose **Go to a page…**, pick **Memory** and press **Add**. Arriving on **Memory** runs the deal from step 4 again.

## 8. Try it

1. Click an empty part of **Memory** and press **Preview**.
2. Turn two cards that don't match. They stay up for a second and turn back; **Moves** says 1. Try clicking a third card while two are up: nothing happens.
3. Find a pair. Both turn green and stay.

![Preview mid-game: Puppy and Dog matched in green, Kitten and Foal turned up in white, Moves 3, Pairs found 1 of 6, and ups holding 4 and 9 in Variables (live).](help/tutorial-memory-preview.png)

4. In **Variables (live)** (press **Debug** in Preview's bar if it isn't showing), watch \`cards\`, \`ups\` and \`matched\` change as you play. Find every pair to reach **Well done**, then press **Play again** for a new deal.

## Make it yours

- **Your own pairs.** Change \`pairs\` in the Variables tab: a term and its meaning, a picture name and a word, a question and its answer. Six pairs fill four columns by three rows; for eight, set **Cols** to 4 and make the frame taller.
- **A fixed deal.** Take \`seed\` out of the start flow and every learner gets the same order, which is handy while you test. Or replace \`seed\` in the formula with \`Date.now()\` for an order nobody can predict.
- **A gentler pace.** Change the **Wait** after a miss to \`1500\` to give more time to remember.

## What you learned

- One **List** variable can hold a whole game's state, with **Worked out** variables that follow it.
- \`shuffle(list, seed)\` deals the same order for the same seed, and **Put values back to the start** deals again.
- A repeater shows a list with one layer, and one click flow serves every copy through \`event.index\`.
- **Change one list item** turns one card; **Only if** and **Wait** make the two-card turn.

**Next:** [Word search and crossword from a word list](tutorial-wordgames) builds bigger grids from a list. More in [Repeated lists](repeaters), [Variables](variables#lists) and [Expressions](expressions#helpers).`,
  },
};
