import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 31,
  level: 'beginner',
  minutes: 15,
  example: 'tut-flipcards',
  topic: {
    id: 'tutorial-flipcards',
    title: 'Flip cards from a list',
    group: 'Build it',
    summary: 'Term and meaning cards that turn over on a click or Enter, all drawn by one card layer from one list, so adding a card is adding a line.',
    keywords: 'tutorial flip cards flashcards card term meaning definition front back turn over list repeater repeat item index event.index grid keyboard enter pressed toggle reset',
    body: `You will make six cards with a term on the front and its meaning on the back. Selecting a card, or pressing <kbd>Enter</kbd> on it, turns it over. You build **one** card and a list of words, and the editor draws a card for every line of the list. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Flip cards from a list**. **Play** runs it and **Make my copy** gives you your own copy.

You will meet a **List** variable, a **repeater** that draws one layer once per item, \`item\` and \`index\` inside it, and \`event.index\`, which says which copy was clicked.

## 1. Make a project and write the cards

1. On the projects page press **New project**. Keep **Blank project**, type **Key terms** as the name and press **Create project**.
2. Press <kbd>T</kbd> and click near the top left of the page. Type \`Key terms\` and press <kbd>Escape</kbd>.
3. Open the **Variables** tab at the bottom. Press **+ Add variable** and pick **List**. Name it \`cards\`.
4. Its value is a box of text that holds the items. Replace \`[]\` with this, one card per line:

\`\`\`
[
  {"front": "Plagiarism", "back": "Presenting someone else's words or ideas as your own."},
  {"front": "Paraphrase", "back": "Putting an idea in your own words. You still cite the source."},
  {"front": "Citation", "back": "A short note in your text that points to the full reference."},
  {"front": "Reference list", "back": "The full details of every source you cited, at the end."},
  {"front": "Collusion", "back": "Working with others on work that must be your own."},
  {"front": "Common knowledge", "back": "Facts that are widely known and easy to check."}
]
\`\`\`

Each card is a pair of braces with a \`front\` and a \`back\`. Keep the quotes and the commas between cards: if the text isn't a proper list, a red line under the box says so, and the list starts empty.

5. Press **+ Add variable** again, pick **List** and name it \`flipped\`. Leave it as \`[]\`. It will hold the places of the cards that are turned over: \`[0, 3]\` means the first and the fourth.

## 2. Draw one card

1. Press <kbd>F</kbd> for the **Frame** tool and draw a card under the title, about 220 wide and 150 high (set **W** and **H** to be exact). Name it **Card**.
2. Give it a dark blue **Fill**, \`#1f3a68\`, and a **Radius** of **16**.
3. Press <kbd>T</kbd> and click inside the card. Type \`{item.front}\` and press <kbd>Escape</kbd>. Name the layer **Card front**. Make it white (**Colour** \`#ffffff\`), **Size** 22, **Weight** 700, **Align** center.
4. Click inside the card again and type \`{item.back}\`. Name it **Card back**, **Align** center. Leave it dark.

The two texts are empty for now. \`item\` is the card the copy is drawing, and there are no copies yet.

## 3. Repeat it for every card

1. Select **Card** and press <kbd>Ctrl</kbd>+<kbd>G</kbd>. It goes into a new group. Name the group **Cards**.
2. With **Cards** selected, open the **Repeat (list)** section and tick **Repeat the first child for each item**.
3. Set **Items** to \`cards\`, **Layout** to **Grid**, **Cols** to **3** and **Gap** to **20**.

Six cards appear in two rows, each with its own term. That is the same **Card** layer drawn six times, so restyling it restyles them all. Inside a copy, \`item\` is that card's line from the list and \`index\` is its place, counting from 0.

![The Cards group selected, with Repeat (list) ticked, Items set to cards (currently 6 items), Layout Grid, Gap 20 and Cols 3, and the six cards on the canvas.](help/tutorial-flipcards-repeat.png)

## 4. Show one face at a time

A card is turned over when its place is in \`flipped\`. The formula for that is \`flipped.includes(index)\`.

1. Select **Card back** (in the **Layers** panel, inside **Card**). In **Data bindings** press **+ Add binding** and pick **Visible**. Choose **Formula**, press **Edit as formula**, and type \`flipped.includes(index)\`.
2. Select **Card front** and do the same with \`!flipped.includes(index)\`. The \`!\` means *not*.
3. Select **Card** and add a binding to **Fill colour**: **Formula**, \`flipped.includes(index) ? "#ffffff" : "#1f3a68"\`. A turned card is white, so the dark words on its back show.

Every card shows its front now, because \`flipped\` is empty.

## 5. Turn a card over on a click

1. With **Card** selected, open **Accessibility** and set **Role** to **Button**. The card is now a tab stop, and <kbd>Enter</kbd> or <kbd>Space</kbd> clicks it.
2. Type \`Press Enter to turn the card over\` in **Description**.
3. In **Data bindings**, add **Pressed (button, toggle)** with the formula \`flipped.includes(index)\`. A screen reader then says whether the card is turned.
4. In the **Interactions** section press **+ On click (empty)**, then **Show in graph**.
5. Drag from the dot on the right of the **When clicked or hovered** node into empty space. In **Find a node…** type \`change\` and pick **Change a value or counter**.
6. Set **Variable** to **flipped**, **Do** to **Add to the list, or take out if it is there**, and **Value** to \`event.index\`.

A click on any copy runs this one flow, and \`event.index\` is the place of the card that was clicked. If it isn't in \`flipped\` it goes in, and the card turns over; if it is, it comes out, and the card turns back.

## 6. Turn them all back

1. Press <kbd>B</kbd> and draw a button under the cards. Set its **Label** to \`Turn all back\`.
2. Press **+ On click (empty)** and **Show in graph**, drag from its dot and pick **Put values back to the start**.
3. In its **Variables** list, tick **flipped**. It goes back to \`[]\`, so every card shows its front.

## 7. Try it

1. Press **Preview**.
2. Click a few cards. Each turns over on its own, and turns back on a second click.
3. Press <kbd>Tab</kbd> to reach a card and <kbd>Enter</kbd> to turn it.
4. Watch \`flipped\` in **Variables (live)** on the left: it lists the places of the cards that are turned. It is part of **Debug** in Preview's bar; press **Debug** if you don't see it.

![Preview with the first and fifth cards turned over to their meanings, and flipped reading [0,4] in the live variables.](help/tutorial-flipcards-preview.png)

5. Press **Turn all back**.

## Make it yours

- **Add a card.** Add a line to \`cards\` in the Variables tab. A seventh card appears in the grid: there is nothing to copy or wire. Make sure the button under the grid still has room.
- **A picture on the front.** Lay a picture over **Card front** inside **Card**, and give it the same **Visible** binding.
- **Turning motion.** The faces swap at once, the same as in the starter. A timeline can't turn just one copy, because every copy is the same layer.
- **Ready-made.** The **Flip and dialog cards** starter (Templates, **Explore and reveal**) has these cards plus a page that steps through them one at a time. A starter has a **Fill in** tab where the cards are rows of a form, so nobody has to type braces and quotes (see [Fill in this starter](fill-in-starter)).

## What you learned

- A **List** variable holds the content, and a group's **Repeat (list)** draws its first child once per item.
- Inside the copies, \`item\` is the item and \`index\` its place. In a click, \`event.index\` says which copy was clicked.
- **Add to the list, or take out if it is there** keeps one list of which cards are turned, and bindings on **Visible** show the right face.

**Next:** [Accordion and tabs from data](tutorial-accordion). More on lists in [Repeated lists](repeaters) and [Variables](variables#lists).`,
  },
};
