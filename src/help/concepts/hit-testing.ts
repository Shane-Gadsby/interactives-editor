import type { Concept } from './index';

export const concept: Concept = {
  order: 100,
  area: 'interface',
  topic: {
    id: 'concept-hit-testing',
    title: 'What gets clicked',
    group: 'Concepts',
    summary: 'A click goes to the front layer under the pointer that can take it, and to the groups around that layer. See-through and hidden layers let it pass.',
    keywords: 'concept click hit test which layer clicked hotspot transparent see-through invisible opacity not clickable group click order front behind on top nothing happens event.child',
    body: `When a learner clicks, the click goes to the layer **in front** under the pointer, then to every group and frame that layer sits in. A **When clicked or hovered** event on a group therefore fires when any layer inside it is clicked. An event on a layer that is behind something else never hears the click, because the layer in front took it.

While the project plays, some layers let the pointer straight through to whatever is underneath:
- **hidden** layers, always;
- **see-through** layers: opacity under 100%, or a shape whose fills and strokes are all under 100%, and every layer inside one. Tick **Clickable while see-through** in a layer's **Interactions** section to keep it clickable;
- **page master** layers, which belong to the master, not the page;
- paths, polygons and stars between their painted parts: they take the click where they are drawn, not across their whole box.

## Where people get caught out

- **"My invisible hotspot can't be clicked."** A shape with its fill at 0% is see-through, so the click goes past it. Tick **Clickable while see-through** on it.
- **"The button stopped working while it faded in."** It takes clicks again once it is fully showing. Tick **Clickable while see-through** if it should work during the fade.
- **"The event on my group never fires."** Something outside the group is in front of it: a background, a big text box, a frame. Move the group up in the **Layers** panel (the front layer is at the top) or move the other layer down.
- **"The frame's event fires when I click its background."** A click on the layer itself, not on anything inside it, counts too. Tick **Only when a child is hit** on the event to leave those out.
- **"I want to know which card was clicked."** Put one event on the group that holds the cards and read \`event.child\` (the name of the child that was hit) or \`event.childIndex\` (its place, from 0). For a repeater, \`event.index\` is the copy.

## How to tell what is going on

- In Preview with **Beside editor**, a ring flashes round the layer each click landed on: green when the click started something, red when it started nothing. The ring is on the layer that actually took the click, which may not be the one you meant.
- When a click starts nothing, the **Events** list says why under **Why did nothing happen?**: the click landed on empty space, nothing listens for a click on that layer (an upper layer may be in the way), or an **Only if** said no.
- A layer with a click event or a link says so in its **Interactions** section when it is see-through and can't be clicked while playing.

**More:** [See-through layers don't take clicks](interactions#see-through-layers-don-t-take-clicks), [Which layer inside was hit](interactions#which-layer-inside-was-hit), [See what ran](interactions#see-what-ran), [Order](arrange#order).`,
  },
};
