import type { Concept } from './index';

export const concept: Concept = {
  order: 160,
  area: 'construction',
  topic: {
    id: 'concept-a11y-names',
    title: 'Roles, names and focus order',
    group: 'Concepts',
    summary: 'A screen reader knows a layer by its role and name, not by how it looks. A keyboard moves through tab stops in the Tab order, not in the order things sit on the page.',
    keywords: 'concept accessibility screen reader role name text alternative label keyboard tab stop tab order focus order clickable shape no name drag keyboard decorative wcag',
    body: `A screen reader can't see your page. For each layer it says what the layer **is** (its **role**: button, heading, image) and what it is **called** (its **name**). A keyboard user can't point. They press <kbd>Tab</kbd> to move between **tab stops**, and <kbd>Enter</kbd> or <kbd>Space</kbd> to press the one they are on.

Buttons, inputs and links are real controls, so they already have a role and work from the keyboard. A shape, picture or group that you made clickable with *When clicked or hovered* doesn't, until its **Accessibility** section says so. With **Tab stop** left on *Automatic*, a layer with a click becomes a tab stop that Enter and Space click.

![The Accessibility section of a clickable ellipse: Role None (plain shape), Text alternative Switch the lamp on or off, Tab stop Automatic, and the line Reachable with Tab (On pointer click). Enter and Space click it.](help/concept-a11y-names-section.png)

## Where people get caught out

- **"The screen reader just says *button*."** The layer has no name. Give it a **Text alternative** that says what it does (*Next question*), not what it looks like (*green arrow*). The checker calls this the ARIA label, and its finding goes away as soon as the layer has one. A layer's own words count as its name when it has text.
- **"The screen reader reads out every flourish."** Set the **Role** of layers that are only decoration to *Decorative*, and they are skipped.
- **"The drag task can't be done from the keyboard."** Layers made **draggable** (the Draggable section) get a keyboard way of their own: Space to pick up, the arrows to choose a drop zone, Space to drop. Older drag events, hover, press and release can't be done from a keyboard, so give those a click as well.
- **"Tab jumps all over the page after I rearranged it."** Tab follows the layer order (the bottom of the Layers list first), not where things sit, so moving layers around on the page doesn't change it. Set the order in the **Tab order** section, or reorder the layers.
- **"Focus is lost after the page changes."** Moving focus somewhere sensible isn't automatic. Use a *Focus layer* node.

## How to tell what is going on

- The **Accessibility** checker (bottom panel) lists, page by page, clickable layers with **No name for a screen reader**, layers marked **Only works with a mouse or touch** (no keyboard way), pictures with **Picture has no description** and more. Click a finding to read why it matters, and **Select layer** takes you to it.

![The Accessibility checker with one problem: No name for a screen reader on the layer Bulb, with the explanation beside it.](help/concept-a11y-names-finding.png)

- With nothing selected, the **Tab order** section lists every tab stop on the page in the order Tab visits them. Its arrows move a layer earlier or later, and **Reset to layer order** appears once you have.

![The Tab order section with Switch moved above Bulb by its arrows, and the Reset to layer order button under the list.](help/concept-a11y-names-tab-order.png)

- In Preview, press <kbd>Tab</kbd> and watch the focus ring. Roles, tab stops and the ring only work while **Accessibility** is on in Preview's bar. Switch on **Screen reader** there to see a strip of what Announce nodes and scripts would tell a screen reader.

**More:** [Accessibility: roles and keyboard](accessibility), [Tab order](accessibility#tab-order), [Accessibility checker](accessibility-checker), [Drag and drop](drag-and-drop#keyboard-touch-and-screen-readers), and [Label the diagram](tutorial-label), which gives a picture a text alternative and tries the activity from the keyboard.`,
  },
};
