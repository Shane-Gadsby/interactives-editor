import type { BuildTutorial } from './index';
import { all, bound, clickThen, layerWhere, layers, renamed, saw, variables, allNodes } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 30,
  level: 'beginner',
  minutes: 20,
  example: 'tut-reveal',
  topic: {
    id: 'tutorial-reveal',
    title: 'Click to reveal: image hotspots',
    group: 'Build it',
    summary: 'A picture with numbered points. Each opens a dialog with a heading, text and a picture, closed by a button or Esc, and a point turns green once it has been opened.',
    keywords: 'tutorial hotspots hotspot image picture points reveal click show hide layer dialog popup modal close escape esc focus keyboard enter visited seen explored label diagram',
    body: `You will make a picture of the water cycle with three numbered points on it. Selecting a point opens a dialog that explains that stage, with a heading, a few lines of text and a picture. **Close** or <kbd>Esc</kbd> shuts it, and a point you have opened turns green. Everything works from the keyboard too. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Click to reveal: image hotspots**. **Play** runs it and **Make my copy** gives you your own copy.

You will meet **Show a layer** and **Hide a layer**, a frame that is a **dialog**, and a switch variable that remembers which points have been opened.

## 1. Make a project and put the picture in

1. On the projects page press **New project**. Keep **Blank project**, type **Water cycle** as the name and press **Create project**.
2. Drop a picture onto the page: a diagram, a photo or a map. It becomes an image layer. Make it about 520 wide and place it on the left, leaving room for a column of text on the right.
3. No picture to hand? Press <kbd>R</kbd> for the **Rectangle** tool and draw a large box instead, and name it **Picture**. (The finished example draws a sea, some land, the sun and a cloud with a few shapes.)
4. Press <kbd>T</kbd> for the **Text** tool and click above the picture. Type \`The water cycle\` and press <kbd>Escape</kbd>.
5. Add a second text in the space to the right of the picture: \`Select each numbered point to find out what happens there. Press Esc to close the panel.\`

If your picture is a photo, describe it when the editor asks **What is this a picture of?**. A screen reader reads that instead of the picture.

## 2. Make the first point

A point is a small button. Buttons already work with the keyboard: <kbd>Tab</kbd> reaches them and <kbd>Enter</kbd> presses them.

1. In the tool bar down the left, click **Web** to open that group, then pick **Button** (or press <kbd>B</kbd>).
2. Drag a small square over the place on the picture where water evaporates, such as the sea.
3. In the Properties panel set **W** and **H** to **44**, then in the **Button** section set **Label** to \`1\` and **Radius** to **22**. It is now a round button with a 1 on it.
4. Change **Name** to **Point 1**.
5. Open the **Accessibility** section and type \`Point 1: Evaporation\` in **Text alternative**. That is what a screen reader says, so it says more than "1".

## 3. Make the dialog

A **dialog** is a panel that sits over everything else. While it is open, <kbd>Tab</kbd> stays inside it, and <kbd>Esc</kbd> closes it.

1. Press <kbd>F</kbd> for the **Frame** tool and draw a panel over the middle of the picture, about 480 wide and 300 high. Name it **Dialog 1**.
2. Give it a white fill in **Fill**, and a **Radius** of **16** so its corners are rounded.
3. With the **Text** tool, click inside the frame and type \`Evaporation\`. Make it bigger: **Size** 24 and **Weight** 700. Anything you draw over a frame goes inside it.
4. Click inside the frame again, under the heading, and type the text: \`The sun warms the sea. Some of the water turns into vapour and rises into the air.\` Keep it to the left half of the panel.
5. Drop a small picture into the right half of the panel, or draw a rectangle there as a stand-in.
6. Press <kbd>B</kbd> and draw a button in the bottom right corner of the panel. Set its **Label** to \`Close\` and its **Name** to **Close**.

Now tell the editor it is a dialog. Select **Dialog 1** again (click its row in the **Layers** panel):

1. Open the **Dialog** section and tick **This frame is a dialog**. **Modal**, **Close on Escape** and **Return focus** come ticked. Leave them on.
2. Tick **Scrim** too. It dims the page behind the dialog while it is open. Leave **Close on click outside** unticked, so a stray click doesn't shut it.
3. In the **Accessibility** section, type \`Evaporation\` in **Text alternative**. A screen reader announces the dialog by that name.

**Initial focus** says which layer the keyboard lands on when the dialog opens. **Automatic (first tab stop)** is the **Close** button here, which is what you want.

![Dialog 1 selected, with the Dialog section ticked: This frame is a dialog, Modal, Close on Escape, Return focus and Scrim, and Initial focus on Automatic (first tab stop).](help/tutorial-reveal-dialog.png)

## 4. The Close button hides the dialog

1. In the **Layers** panel, open **Dialog 1** and select its **Close** button.
2. In its **Interactions** section press **+ When clicked…**.
3. Choose **Hide a layer** (under **Layers**), and under **Which layer** pick **Dialog 1**. Press **Add**. The section reads *When clicked: hide Dialog 1*.

<kbd>Esc</kbd> needs nothing more. A dialog with no **Open variable** hides itself when <kbd>Esc</kbd> is pressed.

## 5. The point shows its dialog

1. Select **Point 1** and press **+ When clicked…**.
2. Choose **Show a layer**, and under **Which layer** pick **Dialog 1**. Press **Add**.

![The When Point 1 is clicked dialog: Show a layer picked under Layers, Which layer set to Dialog 1 (hidden), and the line It will do this: When clicked: show Dialog 1.](help/tutorial-reveal-when-clicked.png)

**Show a layer** hides the dialog for you when you add it, because a layer that is already showing can't be shown. The dialog now looks faint on the canvas: hidden layers show as ghosts while you edit, so you can still find them.

## 6. Copy the point and its dialog for the other points

One point and one dialog are wired, so copy the pair. A copy of a layer brings what it does: the click that shows or hides something is copied too, and points at the copy.

1. In the **Layers** panel select **Point 1**, then <kbd>Ctrl</kbd>+click **Dialog 1** to add it, and press <kbd>Ctrl</kbd>+<kbd>D</kbd>. The copies are selected, so press <kbd>Ctrl</kbd>+<kbd>D</kbd> once more. You now have three points and three dialogs, and the dialogs sit on top of each other. That is fine: only one will ever show at a time.
2. Rename the copies **Point 2**, **Point 3**, **Dialog 2** and **Dialog 3**. **Point 2** shows **Dialog 2** and its **Close** hides **Dialog 2**, with nothing for you to wire. Select a point and press **Show in graph** under its sentence if you want to see it.
3. Set the labels of the points to \`2\` and \`3\`, drag each onto its place on the picture (a cloud, then the rain), and change their **Text alternative** to \`Point 2: Condensation\` and \`Point 3: Precipitation\`.
4. In the **Layers** panel, open **Dialog 2** and select its heading. Change the words in the **Text** box of the Properties panel to \`Condensation\`. Select its text and change it to \`High up the air is cooler. The vapour turns back into tiny drops of water, which gather as clouds.\` Set the dialog's **Text alternative** to \`Condensation\`.
5. Do the same for **Dialog 3**: \`Precipitation\`, with \`When the drops in a cloud grow heavy enough they fall as rain, hail or snow.\`

The points have to sit **below** the dialogs in the **Layers** panel, or they would show through an open dialog. Drag their rows down if they are not.

> Want only the layer, without what it does? Use **Duplicate layer only** in the right-click menu, or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>.

## 7. Colour the points you have opened

Each point needs a switch that remembers whether it has been opened.

1. Open the **Variables** tab at the bottom. Press **+ Add variable**, pick **Switch (on or off)** and name it \`seen1\`. Add \`seen2\` and \`seen3\` the same way. They all start unticked (false).
2. Select **Point 1** and press **Show in graph** under its sentence. The **Interactions** tab opens on its two nodes.
3. Drag from the dot on the right edge of the **Show or hide a layer** node into empty space and let go. In **Add and connect**, type \`change\` in **Find a node…** and pick **Change a value or counter**.
4. In its settings set **Variable** to **seen1**, **Do** to **Set to** and **Value** to \`true\`.
5. Back on **Point 1**, open **Data bindings** and press **+ Add binding**. Pick **Fill colour**, choose **Formula**, and type:

\`\`\`
seen1 ? "#a5d6a7" : "#ffd54f"
\`\`\`

The point is yellow until \`seen1\` is true, then green.

6. Press **+ Add binding** again, pick **Accessible description**, choose **Formula** and type \`seen1 ? "Already explored" : ""\`. A screen reader now says so too, since the colour alone tells it nothing.
7. Repeat steps 2 to 6 for **Point 2** with \`seen2\` and **Point 3** with \`seen3\`. These interactions and bindings were added after the copying, so each point needs its own.

## 8. Try it

1. Press **Preview** at the top right.
2. Click **1**. The page dims and the Evaporation dialog opens, and \`seen1\` is ticked in the **Variables (live)** list. Press **Close**. The point is green now.

![Preview with the Evaporation dialog open over the dimmed picture, its text, picture and Close button, and seen1 ticked in the live variables.](help/tutorial-reveal-open.png)

![After closing: point 1 is green, points 2 and 3 are still yellow.](help/tutorial-reveal-visited.png)

3. Now use only the keyboard. Press <kbd>Tab</kbd> until point **2** has the focus ring, then <kbd>Enter</kbd>. The dialog opens with the focus on **Close**. Press <kbd>Tab</kbd>: the focus stays inside the dialog.
4. Press <kbd>Esc</kbd>. The dialog closes and the focus goes back to point **2**, so a keyboard user carries on from where they were.

The **Variables (live)** list on the left shows \`seen1\`, \`seen2\` and \`seen3\` turning true. Press <kbd>Esc</kbd> to close the Preview.

## Make it yours

- **More points.** Select a point and its dialog and press <kbd>Ctrl</kbd>+<kbd>D</kbd>: the clicks come with them. Then add a \`seen4\` switch and the **Change a value or counter** step and bindings for it.
- **A progress line.** A text that says \`{count([seen1, seen2, seen3], true)} of 3 explored\` counts as the learner goes.
- **Know when every point is done.** Select **Point 1**, press **+ When clicked…**, choose **Count what has been done…**, tick the three points and name it \`explored\`. It keeps \`exploredCount\` and \`exploredTotal\` for a line such as \`{exploredCount} of {exploredTotal} explored\`. Or choose a thing to happen, such as **Show a layer** on a well-done message, and set **It starts when** to **all of these are done**.
- **Ready-made.** The **Image hotspots** starter (Templates, **Explore and reveal**) does all of this with one dialog for every point, reading its words from a list. Its points are one frame, so adding a point is copying a layer.

## What you learned

- **+ When clicked…** has **Show a layer** and **Hide a layer**. Showing a layer starts it hidden.
- A frame with **This frame is a dialog** ticked keeps the keyboard inside, closes on <kbd>Esc</kbd>, and puts the focus back where it came from.
- A switch variable and a **Fill colour** binding give a visited style, and a bound description says it out loud.

**Next:** [Flip cards from a list](tutorial-flipcards). More on dialogs in [Accessibility](accessibility#dialogs), and on the nodes in [Interactions](interactions).`,
  },
  guide: {
    1: { check: all(renamed, layers('text', 2)), show: ['project-name', 'tool-text'] },
    2: { check: layerWhere('button', (n) => /^point \d/i.test(n.name) && (n.ariaLabel ?? '').trim() !== ''), show: ['tool-button', 'panel-inspector'] },
    3: { check: layerWhere('frame', (n) => !!n.dialog && (n.ariaLabel ?? '').trim() !== ''), show: ['tool-frame', 'panel-inspector'] },
    4: { check: (c) => allNodes(c.project).filter((n) => n.type === 'frame' && !!n.dialog).length >= 3 && allNodes(c.project).filter((n) => n.type === 'button' && /^point \d/i.test(n.name)).length >= 3, show: 'panel-layers' },
    5: { check: clickThen('button', 'action.visibility', (n) => n.params.op === 'hide', 3), show: 'add-when-clicked' },
    6: { check: clickThen('button', 'action.visibility', (n) => n.params.op === 'show', 3), show: 'add-when-clicked' },
    7: { check: all(variables(['seen1', 'boolean'], ['seen2', 'boolean'], ['seen3', 'boolean']), bound('button', 'fill', 'seen'), clickThen('button', 'action.setVariable', undefined, 3)), show: ['add-variable', 'panel-variables'] },
    8: { check: saw('previewed'), show: 'preview' },
  },
};
