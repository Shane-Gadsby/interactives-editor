import type { Concept } from './index';

export const concept: Concept = {
  order: 110,
  area: 'construction',
  topic: {
    id: 'concept-coordinates',
    title: 'Positions are measured from the parent',
    group: 'Concepts',
    summary: 'A layer\'s X and Y are measured from the top left of whatever holds it: the page, or the group or frame it is in.',
    keywords: 'concept x y position coordinates relative parent group frame numbers changed moved into group off screen binding x event.x local world top left',
    body: `A layer's **X** and **Y** are its distance from the top left corner of its **parent**: the page for a layer at the top of the list, or the group or frame it sits in. A layer at X 20 inside a group at X 300 is 320 from the edge of the page.

![Group 2 selected, at X 200 and Y 90 on the page, and below it its child Counter selected, at X 50 and Y 240: the Counter sits 250 across and 330 down on the page.](help/concept-coordinates-parent.png)

## Where people get caught out

- **"I put a layer in a group and its numbers changed."** It didn't move on the page; its X and Y are now counted from the group's corner instead of the page's. Making a group, dragging a layer into one in **Layers**, or ungrouping all keep the layer where it was and change the numbers to match.
- **"I changed a layer's X inside a group and the group's X changed instead."** A group is as big as the layers in it, so it moves to stay around them. Put a layer at X 20 and the group's X moves 20 to the right, while the layer's own X goes back to 0 (it is counted from the group's corner, and the group's corner moved). The layer is where you put it on the page. To keep a group still, turn off **Size to contents** on it. (Ungroup leaves a group that is rotated or scaled alone.)
- **"My animation jumped after I grouped the layer."** Keyframes on X and Y are not changed when a layer moves into or out of a group, so they now count from the new parent's corner. Move the keys, or group the layer before you animate it.
- **"I bound X and the layer went off the page."** A binding or a **Change a layer's setting** on X is measured from the parent too. \`event.x\` and \`event.y\` from a click or drag are measured on the page, so they only line up for a layer at the top of the list. For dragging, \`start + event.dx\` (how far the pointer has moved) works wherever the layer is.
- **"I can't move a layer inside an auto layout frame."** That frame places its children, so their X and Y are greyed out in the Inspector (they show where the layout put the child). Set the child's **Position** to **Ignore** in Layout item and they are yours again. See [Auto layout](auto-layout).
- **"I want a layer to keep to the bottom right as the frame changes size."** In an auto layout frame, set the child's **Position** to **Absolute** and give it an **Inset** from the edges you want.

## How to tell what is going on

- Hover **X** in the Inspector: it says the distance is from the left edge of the parent.
- The **Layers** panel shows what each layer is inside. Drag a layer out to the top of the list and its X and Y are counted from the page again.
- In Preview, **Variables (live)** shows the values your bindings use, so you can see the number a layer is being given.

**More:** [Groups, frames and masks](groups-frames), [Child sizing](auto-layout#child-sizing), [Constraints](constraints), [When clicked or hovered](interactions#when-clicked-or-hovered).`,
  },
};
