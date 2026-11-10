import type { BuildTutorial } from './index';
import { bound, clickThen, layers, repeats, saw, setsVariable, textHas, variables, all } from '../../lib/tutorial-checks';

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
    keywords: 'tutorial flip cards flashcards card term meaning definition front back turn over list table repeater repeat item index selection several isSelected grid keyboard enter checkbox toggle reset',
    body: `You will make six cards with a term on the front and its meaning on the back. Selecting a card, or pressing <kbd>Enter</kbd> on it, turns it over. You build **one** card and a list of words, and the editor draws a card for every line of the list. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Flip cards from a list**. **Play** runs it and **Make my copy** gives you your own copy.

You will meet a **List** variable shown as a table, a **repeater** that draws one layer once per item, \`item\` inside it, and the repeater's **Selection**, which keeps track of which cards are turned over without any nodes.

## 1. Make a project and write the cards

1. On the projects page press **New project**. Keep **Blank project**, type **Key terms** as the name and press **Create project**.
2. Press <kbd>T</kbd> and click near the top left of the page. Type \`Key terms\` and press <kbd>Escape</kbd>.
3. Open the **Variables** tab at the bottom. Press **+ Add variable** and pick **List**. Name it \`cards\`.
4. Its starting value is shown as a table: one row for each item and one column for each thing an item holds. It starts empty, so there is only a \`value\` column. Click the \`value\` heading, type \`front\` and press <kbd>Enter</kbd>. Press **Column**, **Add**, then click the new heading and name it \`back\`.
5. Press **Row**, **Add** six times. Fill each row in, a card to a row:

| front | back |
| --- | --- |
| Plagiarism | Presenting someone else's words or ideas as your own. |
| Paraphrase | Putting an idea in your own words. You still cite the source. |
| Citation | A short note in your text that points to the full reference. |
| Reference list | The full details of every source you cited, at the end. |
| Collusion | Working with others on work that must be your own. |
| Common knowledge | Facts that are widely known and easy to check. |

Prefer typing? Press **JSON text** above the table to see the same list as text, and **Table** to come back. Each card there is a pair of braces with a \`front\` and a \`back\`.

## 2. Draw one card

1. Press <kbd>F</kbd> for the **Frame** tool and draw a card under the title, about 220 wide and 150 high (set **W** and **H** to be exact). Name it **Card**.
2. Give it a dark blue **Fill**, \`#1f3a68\`, and a **Radius** of **16**.
3. Press <kbd>T</kbd> and click inside the card. Type \`{item.front}\` and press <kbd>Escape</kbd>. Name the layer **Card front**. Make it white (**Colour** \`#ffffff\`), **Size** 22, **Weight** 700, **Align** center.
4. Click inside the card again and type \`{item.back}\`. Name it **Card back**, **Align** center. Leave it dark.

The two texts are empty for now. \`item\` is the card the copy is drawing, and there are no copies yet.

## 3. Repeat it for every card

1. Select **Card** and press <kbd>Ctrl</kbd>+<kbd>G</kbd>. It goes into a new group. Name the group **Cards**.
2. With **Cards** selected, open the **Repeat (list)** section and tick **Repeat the first child for each item**.
3. Set **Repeat for each** to **List: cards**, **Layout** to **Grid**, **Cols** to **3** and **Gap** to **20**.

Six cards appear in two rows, each with its own term. That is the same **Card** layer drawn six times, so restyling it restyles them all. Inside a copy, \`item\` is that card's line from the list and \`index\` is its place, counting from 0.

![The Cards group selected, with Repeat (list) ticked, Repeat for each set to List: cards, Layout Grid, Gap 20 and Cols 3, and the six cards on the canvas.](help/tutorial-flipcards-repeat.png)

## 4. Let a click turn a card over

Turn the repeater's own **Selection** on, and a card turns over when you click it, or press <kbd>Enter</kbd> or <kbd>Space</kbd> on it. There is nothing to wire.

1. With **Cards** selected, in **Repeat (list)** set **Selection** to **Several**.
2. A box asks for a name for the variable that remembers the pick. Type \`flipped\` and press **Create variable**. It is an ordinary list variable, and it will hold the places of the cards that are turned over: \`[0, 3]\` means the first and the fourth.

Each card is now a checkbox that a screen reader says is checked or not, the arrow keys move between the cards, and \`flipped\` fills with the places of the cards turned over. Inside a copy, \`isSelected\` is true for a card that is turned.

## 5. Show one face at a time

1. Select **Card back** (in the **Layers** panel, inside **Card**). In **Data bindings** press **+ Add binding** and pick **Visible**. Choose **Formula**, press **Edit as formula**, and type \`isSelected\`.
2. Select **Card front** and do the same with \`!isSelected\`. The \`!\` means *not*.
3. Select **Card** and add a binding to **Fill colour**: **Formula**, \`isSelected ? "#ffffff" : "#1f3a68"\`. A turned card is white, so the dark words on its back show.
4. Select **Card**, open **Accessibility** and type \`Press Enter to turn the card over\` in **Description**.

The line under each formula works it out for the first card.

Every card shows its front now, because nothing is selected yet. (You could also pick the **By value** source for these bindings and fill in a small table for true and false.)

## 6. Turn them all back

1. Press <kbd>B</kbd> and draw a button under the cards. Set its **Label** to \`Turn all back\`.
2. Press **+ On click (empty)**, drag from the dot on the new node and pick **Put values back to the start**.
3. In its **Variables** list, tick **flipped**. It goes back to \`[]\`, so no card is selected and every card shows its front.

## 7. Try it

1. Press **Preview**.
2. Click a few cards. Each turns over on its own, and turns back on a second click.
3. Press <kbd>Tab</kbd> to reach a card and <kbd>Enter</kbd> to turn it.
4. Watch \`flipped\` in **Variables (live)** on the left: it lists the places of the cards that are turned. It is part of **Debug** in Preview's bar; press **Debug** if you don't see it.

![Preview with the first and fifth cards turned over to their meanings, and flipped listing 0 and 4 in the live variables.](help/tutorial-flipcards-preview.png)

5. Press **Turn all back**.

## Make it yours

- **Add a card.** Add a row to \`cards\` in the Variables tab. A seventh card appears in the grid: there is nothing to copy or wire. Make sure the button under the grid still has room.
- **A picture on the front.** Lay a picture over **Card front** inside **Card**, and give it the same **Visible** binding.
- **Only one turned at a time.** Set **Selection** to **One at a time** instead, and tick **Click again to clear** so a second click turns the card back. The variable then holds one number, or -1 for none.
- **Turning motion.** The faces swap at once, the same as in the starter. A timeline can't turn just one copy, because every copy is the same layer.
- **Ready-made.** The **Flip and dialog cards** starter (Templates, **Explore and reveal**) has these cards plus a page that steps through them one at a time. A starter has a **Fill in** tab where the cards are rows of a form, so nobody has to type braces and quotes (see [Fill in this starter](fill-in-starter)).

## What you learned

- A **List** variable holds the content, and you can edit it as a table. A group's **Repeat (list)** draws its first child once per item.
- Inside the copies, \`item\` is the item and \`index\` its place.
- **Selection** on the repeater lets people pick copies with a click, Enter or Space. It writes the picked places to a variable, gives each copy \`isSelected\`, and needs no nodes.

**Next:** [Accordion and tabs from data](tutorial-accordion). More on lists in [Repeated lists](repeaters) and [Variables](variables#lists).`,
  },
  guide: {
    1: { check: variables(['cards', 'list'], ['flipped', 'list']), show: ['add-variable', 'panel-variables'] },
    2: { check: all(layers('frame'), textHas('{item.front}'), textHas('{item.back}')), show: 'tool-frame' },
    3: { check: repeats('cards'), show: 'panel-inspector' },
    4: { check: all(bound('text', 'visible', 'flipped'), bound('frame', 'fill', 'flipped')), show: 'panel-inspector' },
    5: { check: clickThen('frame', 'action.setVariable', setsVariable('flipped')), show: 'add-empty-click' },
    6: { check: clickThen('button', 'action.resetVariables'), show: 'tool-button' },
    7: { check: saw('previewed'), show: 'preview' },
  },
};
