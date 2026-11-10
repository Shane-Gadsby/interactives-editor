import type { Concept } from './index';

export const concept: Concept = {
  order: 60,
  area: 'construction',
  topic: {
    id: 'concept-repeaters',
    title: 'A repeater is one layer drawn many times',
    group: 'Concepts',
    summary: 'A repeater draws its first child once for each item in a list. There is one template, not many layers, and item, index and event.index say which row is which.',
    keywords: 'concept repeater repeat list copies template item index event.index which one clicked all change own event per item state cards rows',
    body: `A repeater is a group or frame with **Repeat the first child for each item** ticked (in its **Repeat (list)** section). Its first child is the **template**, and it is drawn once for each item in **Items**: a card per question, a row per product.

There is only one layer. The copies you see on the canvas and in Preview are drawn from it, so anything you change on the template, every copy gets. What makes the copies different is the item: inside the template, \`item\` is this copy's item and \`index\` is its position, counting from 0. A text layer reading \`{item.title}\` shows each item's own title.

![One Card inside the Cards repeater in the Layers panel, and four cards on the canvas, each with its own title: the Card layer is selected and its box sits on the first copy.](help/concept-repeaters-one-template.png)

## Where people get caught out

- **"I changed one card and they all changed."** There is one card. To make one look different, make the difference come from its item: a binding on Fill colour like \`item.done ? "#2e7d32" : "#ffffff"\`, or a Visible binding on \`index == 0\`.
- **"I want each card to have its own click."** Give the template one **When clicked or hovered** event. It fires for whichever copy was clicked, with \`event.index\` saying which. \`questions[event.index]\` is that copy's item, and a **Check a condition** on \`event.index == 2\` picks out one copy.
- **"How do I remember which ones were flipped?"** Keep it in the list. Make **Items** a *List* variable, and use **Change a value or counter** with **Change one list item**: left empty, its position is \`event.index\`, and **Field** changes one field of the item (\`flipped\`, to \`!item.flipped\`). The copy redraws from its item.
- **"My list has 6 items but I only see one."** Items has to give a list. A formula that fails gives an empty list, so check the line under **Items**.
- **"The first item is number 0."** \`index\` counts from 0. Show \`{index + 1}\` to a learner.

## How to tell what is going on

- The line under **Items** says what the list is right now, with the starting values (*currently 6 items*), or what is wrong with it.

![The Repeat (list) section of a repeater: Repeat the first child for each item ticked, Items tips.cards, and the line under it saying currently 4 items.](help/concept-repeaters-items.png)

- A text or binding in the template can read \`item\` and \`index\`. The line under a formula in the Properties panel works it out for the first copy.
- In Preview, the **Events** list shows each click with the nodes it ran, and **Variables (live)** shows the list variable change as you click.
- For keyboard users, **Keyboard navigation** on the repeater makes one copy the Tab stop and the arrow keys move between the rest.

**More:** [Repeated lists](repeaters), [Clicks and the keyboard](repeaters#clicks-and-the-keyboard), [Lists](variables#lists), [Content from a data file](tutorial-data-source), [Put the steps in order](tutorial-order).`,
  },
};
