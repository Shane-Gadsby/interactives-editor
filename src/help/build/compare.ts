import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 34,
  level: 'beginner',
  minutes: 15,
  example: 'tut-compare',
  topic: {
    id: 'tutorial-compare',
    title: 'Before and after compare',
    group: 'Build it',
    summary: 'Two pictures stacked, with a divider handle you drag, or move with the keyboard, to show more of one or the other. No nodes: a handle, a variable and two bindings.',
    keywords: 'tutorial before after compare comparison slider divider handle drag draggable reveal wipe clip mask width binding both ways keyboard arrow keys then now picture',
    body: `You will put two pictures on top of each other, a *before* and an *after*, with a round handle on the line between them. Drag the handle right and more of the Before picture shows; drag it left and more of After shows. Keyboard users move it with the arrow keys. It takes about fifteen minutes, and there are no interaction nodes at all.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Before and after compare**. **Play** runs it and **Make my copy** gives you your own copy.

How it works: the handle's **X** is tied to a number variable both ways. Dragging the handle changes the number, and the number sets how wide the Before picture's frame is. The frame clips its picture, so a narrower frame shows less of it.

## 1. Make a project and the variable

1. On the projects page press **New project**. Keep **Blank project**, type **Before and after** as the name and press **Create project**.
2. Add a title at the top with the **Text** tool: \`Then and now\`.
3. Open the **Variables** tab, press **+ Add variable**, pick **Counter** and name it \`handleX\`. Set its starting value to **380**.

## 2. The After picture

1. Drop your After picture on the page. (No pictures to hand? Press <kbd>R</kbd> and draw a box, and give it a pale green fill.)
2. Name it **After picture** and, in the Properties panel, set **X** to **60**, **Y** to **100**, **W** to **680** and **H** to **380**.
3. Add a text \`After\` in its top right corner.

Both pictures must be the same size and in the same place, so they line up exactly.

## 3. The Before picture, in a clipping frame

1. Press <kbd>F</kbd> and draw a frame over the left half of the After picture. Name it **Before reveal** and set **X** **60**, **Y** **100**, **W** **340**, **H** **380**.
2. In its **Frame** section make sure **Clip content** is ticked. In **Fill**, press the **×** beside its fill (**Remove fill**), so it has no colour of its own.
3. Draw a box inside the frame with the **Rectangle** tool and give it a pale brown fill, or drop your Before picture on the page and, in the **Layers** panel, drag its row onto the middle of the **Before reveal** row so it goes inside. Name it **Before picture** and set its **X** and **Y** to **0**, **W** **680** and **H** **380**. It is as big as the After picture, but the frame only shows its left half.
4. Add a text \`Before\` inside the frame, in its top left corner.

Positions inside a frame count from the frame's own corner, which is why the picture's X and Y are 0.

## 4. The handle and the line

Anything you draw over a frame goes inside it, and these two must not, so draw them on an empty part of the page (under the pictures) and then type where they go.

1. Press <kbd>R</kbd> and draw a thin box. Name it **Divider line**, give it a white fill, and set **X** **398**, **Y** **100**, **W** **4**, **H** **380**. It jumps to the middle of the pictures.
2. Press <kbd>O</kbd> and draw a circle, holding <kbd>Shift</kbd>. Name it **Divider handle**, give it a dark fill and a white stroke, and set **W** and **H** **40**, **X** **380**, **Y** **270**. It sits on the line.

## 5. Let people drag the handle

1. With **Divider handle** selected, find the **Draggable** section and press its **+**.
2. Set **Moves** to **Left and right only**.
3. Set **Stays inside** to **Layer: After picture**. The handle can't be dragged past the pictures.
4. Set **Key step** to **34**. That is how far each arrow key moves it.
5. In **Accessibility**, type \`Divider\` in **Text alternative**.

## 6. Tie everything to handleX

1. Still on **Divider handle**, open **Data bindings**, press **+ Add binding** and pick **X**.
2. At the top of the binding press **⇄ Both**, and pick the variable **handleX**. Now the handle starts where \`handleX\` says, and dragging it writes its new X into \`handleX\`.
3. Select **Before reveal**. Add a binding on **Width**, choose **Formula**, and type:

\`\`\`
handleX + 20 - 60
\`\`\`

The handle is 40 wide, so its middle is \`handleX + 20\`, and the pictures start at 60. The frame is as wide as the distance from the pictures' left edge to the handle's middle.

4. Select **Divider line** and bind its **X** to the formula \`handleX + 18\`, so the 4 px line sits under the middle of the handle.

The grey line under each binding works it out with \`handleX\` at 380: the width is 340 and the line's X is 398, exactly what you drew.

## 7. Try it

1. Press **Preview**.
2. Drag the handle right: more of Before shows. Drag it left: more of After.
3. Now the keyboard. Press <kbd>Tab</kbd> until the handle has the focus ring, press <kbd>Space</kbd> to pick it up, use the left and right arrow keys to move it, and <kbd>Space</kbd> to put it down. <kbd>Esc</kbd> puts it back where it was.
4. Watch \`handleX\` change in **Variables (live)**.

Add a line of instructions under the pictures saying how to use the keyboard, since not everyone knows a handle can be picked up with Space.

## Make it yours

- **Buttons to jump.** A **Show Before** button with **+ On click (empty)** and a **Change a value or counter** that sets \`handleX\` to \`700\`, and **Show After** setting it to \`60\`, help people who can't drag at all.
- **Describe both pictures.** Give each picture a **Text alternative** that says what it shows.
- **Ready-made.** The **Before and after** starter (Templates, **Explore and reveal**) has the university look, labels on chips, and the handle moves to wherever you press on the pictures. It moves with the arrow keys straight away, without picking it up first.

## What you learned

- A **Draggable** layer can be locked to one direction and kept inside another layer, and it can be moved by the keyboard.
- A **⇄ Both** binding ties a layer's setting to a variable both ways, so dragging writes the variable.
- A frame with **Clip content** shows as much of its picture as it is wide, and a **Width** binding makes that follow the variable.

**Next:** [A course presentation](tutorial-presentation). More on [Drag and drop](drag-and-drop) and [Bindings](bindings#which-way-in-out-or-both).`,
  },
};
