import type { Concept } from './index';

export const concept: Concept = {
  order: 80,
  area: 'construction',
  topic: {
    id: 'concept-auto-layout',
    title: 'Auto layout: the frame places its children',
    group: 'Concepts',
    summary: 'Inside a frame with auto layout, the frame decides where each child goes. Each child is fixed, hugs its content or fills, and its x and y are worked out for it.',
    keywords: 'concept auto layout hug fill fixed percent jumps back snaps back drag child will not move text will not grow gap padding margin ignore absolute order flex',
    body: `Turn on **Auto layout** on a frame and the frame places its children for you: in a row, a column, a grid or a stack, in layer order, with a **Gap** between them and **Padding** inside its edges. The layout is worked out again after every change, on the canvas and in the player.

Each child says how big it is, in its **Layout item** section:

- **Fixed**: its own width or height.
- **Hug**: as big as what is inside it (a frame's children, a text's words).
- **Fill**: takes a share of the room the frame has left.
- **Percent**: a share of the frame's inner size.

A frame can hug too: **Hug width** and **Hug height** make it grow and shrink with its children.

## Where people get caught out

- **"I drag a child and it jumps back."** Its x and y belong to the layout, so the frame puts it back. To change the order, move it up or down in the **Layers** panel. To place one child freely, set its **Position** to *Absolute* (pinned by insets from the frame's edges) or *Ignore* (keeps its own x and y and takes no room).
- **"My text box won't grow."** A text grows only if its **Sizing** lets it: *Auto width* or *Auto height*, not *Fixed*. The frame around it has to grow too: a frame with a fixed height stays that height, so turn on **Hug height** on it.
- **"Gap or padding?"** **Gap** is the space between children. **Padding** is the space between the frame's edges and the children. **Margin** (in Layout item) is extra space around one child.
- **"I hid a layer and everything moved."** A hidden layer takes no room, so the others close up. That is on purpose.
- **"My layout settings aren't on the timeline."** They aren't keyframed. Animate a layer's size or position with a timeline, or turn on **Animate changes** on the frame so children glide when the layout changes while it plays.

## How to tell what is going on

- Select the child and read its **Layout item** section: it says how it sits in its frame, and only shows the settings that kind of layout uses.
- Select the frame and read its **Auto layout** section for direction, gap, padding and hugging.
- The children are placed in layer order, so if the order looks wrong, the Layers panel is where to change it.

**More:** [Auto layout](auto-layout), [Child sizing](auto-layout#child-sizing), [Grids and stacks](auto-layout#grids-and-stacks), [Text](text), [Groups and frames](groups-frames).`,
  },
};
