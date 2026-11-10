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

## Where people get caught out

- **"The screen reader just says *button*."** The layer has no name. Give it a **Text alternative** that says what it does (*Next question*), not what it looks like (*green arrow*). Its words count as its name when it has text.
- **"The screen reader reads out every flourish."** Set the **Role** of layers that are only decoration to *Decorative*, and they are skipped.
- **"The drag task can't be done from the keyboard."** Layers made **draggable** (the Draggable section) get a keyboard way of their own: Space to pick up, the arrows to choose a drop zone, Space to drop. Older drag events, hover, press and release can't be done from a keyboard, so give those a click as well.
- **"Tab jumps all over the page after I rearranged it."** Tab follows the layer order, not where things sit, so moving layers around on the page doesn't change it. Set the order in the **Tab order** section, or reorder the layers.
- **"Focus is lost after the page changes."** Moving focus somewhere sensible isn't automatic. Use a *Focus layer* node.

## How to tell what is going on

- The **Accessibility** checker (bottom panel) lists clickable layers with **No name for assistive technology**, layers that **Needs a mouse or touch** (no keyboard way), pictures with **No description** and more, page by page. Click a finding to select the layer.
- With nothing selected, the **Tab order** section lists every tab stop on the page in the order Tab visits them.
- In Preview, press <kbd>Tab</kbd> and watch the focus ring. Switch on **Screen reader** in Preview's bar to see a strip of what would be announced.

**More:** [Accessibility: roles and keyboard](accessibility), [Tab order](accessibility#tab-order), [Accessibility checker](accessibility-checker), [Drag and drop](drag-and-drop#keyboard-touch-and-screen-readers), and [Label the diagram](tutorial-label), which gives a picture a text alternative and tries the activity from the keyboard.`,
  },
};
