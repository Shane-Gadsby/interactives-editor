import type { HelpTopic } from './topics';

/**
 * The Getting started path: five hands-on tutorials, read in order. Each one is a topic with numbered steps a new person can
 * follow exactly, and each ends with a link to the next. Pictures and clips are in public/help/.
 */
export const TUTORIALS: HelpTopic[] = [
  {
    id: 'tutorial-first-animation',
    title: 'Tutorial 1: Your first animation',
    group: 'Getting started',
    summary: 'Draw a box and make it slide across the artboard with two keyframes. About five minutes.',
    keywords: 'tutorial first animation start beginner keyframe record timeline rectangle move slide learn how to',
    body: `In this tutorial you draw a box and make it slide from the left of the page to the right. You will meet the **Layers** panel, the **Properties** panel, the **Timeline** and keyframes. It takes about five minutes and you don't need anything installed.

This is how it looks when it is done:

![The finished animation in the Timeline tab: Play slides the box from the left to the right in one second, and the Record button turns the Properties panel's top bar red so every change becomes a keyframe.](help/first-animation.mp4)

## 1. Make a project

1. Open the Interactives page and press **New project**. A window called **Start a new project** asks how to begin: keep **Blank project**, leave the name as it is (or type your own) and press **Create project**. The editor opens with one page called **Home**, 800 by 600.
2. Click the project name at the top left (it says *Untitled project*), type **My first animation** and press <kbd>Enter</kbd>. Everything saves by itself. The label next to the name says **Saved** when it has.

## 2. Draw the box

1. Press <kbd>R</kbd> to pick the **Rectangle** tool (or click the rectangle in the tool bar down the left edge).
2. Drag on the page, from about a quarter of the way down the left side, to make a square. Hold <kbd>Shift</kbd> while you drag to keep it square.
3. The new layer is selected. In the **Layers** panel on the left it shows under **Home**. In the **Properties** panel on the right, change **Name** to **Box**.
4. In the Properties panel's **Fill** section, click the colour swatch and pick a colour you like. Set **Radius** (under **Rectangle**) to 16 for rounded corners.

![The editor with the Box selected: Layers on the left, the page in the middle, the Properties panel on the right and the Timeline underneath.](help/editor-overview.png)

## 3. Make a timeline

A **timeline** holds the animation. Each page can have as many as you like.

1. Click the **Timeline** tab at the bottom of the window. It opens a panel.
2. Press **+ New timeline**. You get a timeline called **Timeline**, 1000 ms (one second) long, set to **Play once**.
3. Look at the Properties panel. Small diamonds now sit beside the number fields. These are **key buttons**, and they only show while the Timeline tab is open.

## 4. Set the start and the end

A **keyframe** says "at this moment, this property has this value". With two keyframes the player works out everything in between.

1. Make sure the playhead (the red line) is at **0 ms**. The time shows next to the red record dot.
2. With **Box** selected, click the diamond next to **X**. It turns gold: the box's starting X is now keyed at 0 ms.
3. Press the red **Record** button in the Timeline bar. A red bar across the top of the Properties panel says **Recording keyframes at 0 ms**. While Record is on, any animatable property you change becomes a keyframe at the playhead.
4. Move the playhead to the end: click the ruler at the far right, at **1s**. The readout shows **1000 ms**.
5. Drag the box to the right edge of the page. Or type a new **X** value, such as 560. A second keyframe appears on the box's **X** track.
6. Press **Record** again to switch it off. Otherwise your next edit would become a keyframe too.

![The timeline: one track for the Box's X, with a keyframe at 0 and one at 1s. The Length, loop and Autoplay settings are in the bar above.](help/timeline-panel.png)

## 5. Play it

Press the **Play preview** triangle in the Timeline bar. The box slides across. Drag the playhead along the ruler to scrub through by hand.

> If the box doesn't move, check that there are **two** keys on the **X** track. A track with one key just holds that value.

## 6. Make it nicer

- **Easing.** The line between two keys is a *tween*. Click it, and in the **Tween** box on the right choose **easeOut** or **bounceOut** from **Ease**. You can also drag the two round handles on the little graph to draw your own curve. See [Easing](easing).
- **Loop.** Change **Play once** to **Loop** or **Ping-pong**, and tick **Autoplay** so it starts as soon as the page shows.
- **More properties.** Select the box, press **+ Key** with **Opacity**, **Rotation** or **Fill colour** chosen in the dropdown at the top left of the Timeline, or use Record and change them at different times.
- **Preview.** Press **Preview** at the top right to see it exactly as the exported file will play it. Press <kbd>Esc</kbd> to close.

## What you learned

- Projects save as you work.
- The **Layers** panel lists everything; the **Properties** panel edits the selection.
- A timeline has tracks, and a track has keyframes.
- **Record** turns every change into a keyframe at the playhead.

**Next:** [Tutorial 2: Your first interaction](tutorial-first-interaction), where a button starts the animation. More on timelines: [Timelines and keyframes](timelines).`,
  },
  {
    id: 'tutorial-first-interaction',
    title: 'Tutorial 2: Your first interaction',
    group: 'Getting started',
    summary: 'Add a button that plays your animation when someone clicks it, using the Interactions graph.',
    keywords: 'tutorial interaction button click event action node graph connect wire drag empty space control timeline play',
    body: `Now make the animation wait for a click. You will use the **Interactions** tab, where an *event* (something happens) starts a flow of *actions* (do something). It builds on [Tutorial 1](tutorial-first-animation): open that project, or any project with a timeline in it.

## 1. Stop the timeline starting by itself

1. Open the **Timeline** tab and check that **Autoplay** is **off**. If it is on, the box would slide as soon as the page shows.

## 2. Add a button

1. Press <kbd>B</kbd> for the **Button** tool and drag a button below the box.
2. In the Properties panel, change **Label** to **Slide the box**. The label is the text on the button. Change **Name** to **Slide button** so you can find it later.

## 3. Say what should happen

1. With the button selected, scroll the Properties panel to its **Interactions** section and press **+ When clicked…**.
2. A short list of things that can happen opens. Choose **Play an animation**, then pick your timeline under **Which animation**. The line at the bottom reads back what it will do: *When clicked: play “Timeline”*.
3. Press **Add**. The **Interactions** graph opens at the bottom, zoomed in on the two new nodes (more on them in step 4), and the section now says it in a sentence: **When clicked: play “Timeline”.** (If you would rather the view stayed put, untick **Show new interactions in the graph** in [Preferences](preferences#interactions).)

That is the whole interaction. The same list can go to another page, show or hide a layer, play a sound, open a link, add 1 to a counter or switch something on or off. Every one is added to the **Interactions** graph as ordinary nodes, so you can always take it further.

> A shortcut: right-click a layer, choose **Add interaction**, then **When clicked…**.

## 4. See what it made

1. The bottom panel has switched to **Interactions** and picked the new nodes. (If you look away, **Show in graph** under the sentence brings you back to them.)
2. There are two nodes, joined: a **When clicked or hovered** event (its settings say **Layer: Slide button** and **Event: Click / tap**) and a **Play or stop an animation** action. The sentence in the Properties panel is made from exactly these.
3. The **Read as sentences** button above the graph shows the whole page this way. Use it to read a graph somebody else built.

![The Interactions tab: the node palette on the left, the graph in the middle and the selected node's settings on the right.](help/interactions-panel.png)

## 5. Build the same thing by hand

The graph can do much more than the list, and it helps to have drawn one flow yourself. Remove the sentence (**Remove** under it), then:

1. Press **+ On click (empty)** in the Interactions section. A **When clicked or hovered** node appears with nothing joined to it.
2. Find the small dot on the right edge of the **When clicked or hovered** node. That is its output. Drag from the dot into empty space and let go.
3. A menu called **ADD AND CONNECT** opens. It lists only the nodes that make sense there. Choose **Action**, then **Play or stop an animation**. The new node appears where you let go, already connected.
4. Click the **Play or stop an animation** node. Set **Timeline** to **Timeline** (the one you made), and **Do** to **Play**.
5. Leave **Continue** on **When it finishes**. That setting decides when the *next* node would run. It matters once you chain more actions after this one.

![Dragging a connection into empty space: let go, pick a node, and it is added and joined for you.](help/drag-to-connect.mp4)

## 6. Try it

1. Press **Preview**.
2. Click **Slide the box**. The box slides.
3. Want it to start from the left every time you click? Set **Do** to **Restart** on the **Play or stop an animation** node instead of **Play**.

## Go further

- **Toggle.** Add an **Alternate between two paths** node after the event. Join its **a** output to **Control timeline: Play** and its **b** output to **Control timeline: Play in reverse**. Each click now alternates.
- **Hover.** Use **+ When hovered…** in the Properties panel for a hover effect, such as **Show a layer**. For more control, **+ On hover (empty)** and the **Show or hide a layer** or **Animate a layer's setting** actions.
- **Wait.** A **Wait** node pauses a flow for some milliseconds before the next node.
- **Log.** A **Log** node writes to your browser's console, which is handy when you're not sure a flow ran. The Preview's event list also shows every event as it fires.

## What you learned

- **Events** (green) start flows, **actions** (blue) do things, **logic** (purple) chooses the way.
- **+ When clicked…** writes the nodes for you, and **Show in graph** shows them. You can also drag from an output into empty space to add and join a node in one move.
- The **Preview** and its event list are the quickest way to test.

**Next:** [Tutorial 3: A state machine with variables](tutorial-state-machine). More on the graph: [Interactions](interactions) and [Interaction node reference](interaction-nodes).`,
  },
  {
    id: 'tutorial-state-machine',
    title: 'Tutorial 3: A state machine with variables',
    group: 'Getting started',
    summary: 'Build a lamp that switches on and off, with a tap counter, using variables, a data binding and Set variable nodes.',
    keywords: 'tutorial state machine variable boolean number toggle binding set variable counter lamp switch text expression braces state',
    body: `A *state machine* is a thing that is always in one state, and moves to another when something happens. In Interactives the state lives in **variables**, the things that happen are **events**, and the look of each state comes from **bindings**.

You will build a lamp. A button switches it on and off, and a counter shows how many times you pressed. It takes about ten minutes.

## 1. Make a project and two variables

1. Press **New project** on the projects page. In **Start a new project** keep **Blank project**, type **Lamp** as the name and press **Create project**.
2. Open the **Variables** tab at the bottom, press **+ Add variable** and pick **Switch (on or off)**. A row appears.
3. In **Name** type \`lit\`, then press <kbd>Tab</kbd> (the name is saved when you leave the field). The **Type** is already **True/false (switch)**. Leave the starting value unticked (false).
4. Press **+ Add variable** again and pick **Counter**. Name it \`taps\`. The **Type** is **Number (counter, score)** with the starting value 0.

Names can only use letters, digits and \`_\`, and can't start with a digit. That is so they work inside expressions.

![The Variables tab: lit is true/false and starts false, taps is a number and starts at 0.](help/variables-panel.png)

## 2. Draw the lamp

1. Press <kbd>O</kbd> for the **Ellipse** tool. Drag on the page holding <kbd>Shift</kbd> to make a circle. Name it **Bulb**.
2. In the Properties panel's **Fill**, set the colour to a pale grey, \`#c9ced6\`.
3. Press <kbd>T</kbd> for the **Text** tool and click under the bulb. Type \`Taps: {taps}\` and press <kbd>Escape</kbd> to finish. Anything in braces is an *expression*, so the text will show the number. Name the layer **Counter**.
4. Press <kbd>B</kbd>, drag a button under the text and set its **Label** to **Switch**.

## 3. Bind the bulb's colour to the variable

A *binding* keeps a property up to date with an expression.

1. Select **Bulb** and scroll the Properties panel to **Data bindings**.
2. Press **+ Add binding** and pick **Fill colour** (type \`fill\` to find it quickly).
3. A row for the binding appears. Choose **Formula** rather than **Variable**, and in the box under it type:

\`\`\`
lit ? "#ffd23f" : "#c9ced6"
\`\`\`

That says: if \`lit\` is true the colour is yellow, otherwise it is grey. The fill now shows a link icon and can't be edited by hand while it is bound.

![The Data bindings section with a binding on fill.color. The + Convert… menu below changes the value before it is set.](help/bindings-section.png)

## 4. Add the interaction

1. Select the **Switch** button. In its **Interactions** section press **+ When clicked…**.
2. Choose **Switch something on or off** and, under **Which switch**, pick **lit**. Press **Add**.
3. Press **+ When clicked…** again. Choose **Add 1 to a counter** and pick **taps**. Press **Add**.

The section now reads: **When clicked: switch lit on or off** and **When clicked: add 1 to taps**. Two flows start from the same click, and both run. (In the graph they are a **When clicked or hovered** joined to a **Change a value or counter** each, with **Do** on **Flip on or off** and on **Add to it**.)

## 5. Try it

1. Press **Preview**.
2. Click **Switch**. The bulb turns yellow and the counter goes up. Click again and the bulb goes grey.
3. On the left of the Preview, the **Variables (live)** list shows \`lit\` and \`taps\`. Tick \`lit\` yourself, or type a number into \`taps\` and press <kbd>Enter</kbd>, to set them by hand. The **Events** list underneath records each click and the nodes it ran.

![The Preview with its debug panel: live variables on the left, the lamp in the middle and the events list underneath.](help/preview-debug.png)

## Go further: more than two states

- Make a variable called \`mode\` with **Type** **Choice** and the options \`off, on, broken\`. A choice shows as a dropdown wherever you set it.
- Bind the bulb's fill through a **Look up** converter (use **+ Convert…** under the binding): it lists every option for you to give a colour.
- Use a **Check a condition** node with a condition like \`taps >= 5\` to move to \`broken\` after five presses. **Check a condition** has a **true** and a **false** output.
- Tick **Remember** (under **Options**) on a variable in the Variables tab to remember its value in the visitor's browser between visits.

## What you learned

- **Variables** hold state. They are shared by every page.
- **Change a value or counter** changes them. **When a value changes** reacts to a change.
- **Bindings** and \`{braces}\` in text show the state.

**Next:** [Tutorial 4: Importing a design file](tutorial-import-design). More: [Variables](variables), [Bindings](bindings) and [Expressions](expressions).`,
  },
  {
    id: 'tutorial-import-design',
    title: 'Tutorial 4: Importing a design file',
    group: 'Getting started',
    summary: 'Bring in a design or animation file, read the import report and update it later.',
    keywords: 'tutorial import psd photoshop illustrator ai pdf dxf autocad rive riv lottie svg link embed reconnect watch report design file update from file source file artboard',
    body: `You don't have to draw everything in Interactives. You can bring in a design from another app, then add the motion and the behaviour here. This tutorial uses a Photoshop file; the others work the same way.

## 1. Pick a file

Any of these will do:

| Format | File | Becomes |
|---|---|---|
| Photoshop | \`.psd\` | One page, with real layers and editable text |
| Illustrator | \`.ai\` (saved with **Create PDF Compatible File**) | One page per artboard in the file |
| PDF | \`.pdf\` | One page per PDF page |
| AutoCAD | \`.dxf\` (not \`.dwg\`) | One page with a group per CAD layer |
| Rive | \`.riv\` | A page for each Rive artboard, with timelines and state machines |
| Rive editor | \`.rev\` | The same, with the layer names the export strips |
| Lottie | \`.json\` or \`.lottie\` | A page and a timeline |
| SVG | \`.svg\` | A group of editable shapes |

If you don't have one handy, any Photoshop file with a few layers and a text layer is a good test.

## 2. Bring it in

There are three ways:

- **Drop it** on the canvas of an open project. \`.psd\`, \`.ai\`, \`.pdf\` and \`.dxf\` files become new pages.
- Press **+ Import file as page** at the bottom of the **Layers** panel. This adds pages to the open project.
- Press **Import** on the projects page. This makes a **new project** from the file.

## 3. The file is copied in

For Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft and PowerPoint files, the editor copies the file into the project and remembers which file it came from. There is nothing to choose. The imported pages say **From Poster.psd** in their **Source file** section, and that is how you bring in a newer version later (step 7).

## 4. Read the report

When the import finishes, a box lists anything that couldn't be carried over exactly, for example a blend mode with no equivalent. Read it once, then press the **×**. Nothing is hidden: it is the whole list.

![An import report. It says what was approximated, so you know what to check.](help/import-report.png)

## 5. Look at what you got

![A Photoshop file after import: each layer is a layer in the Layers panel, and the text is a live text layer with its own styling.](help/psd-import-result.png)

- Pixel layers became image layers. Folders became groups. Hidden layers stay hidden and show as faint ghosts on the canvas.
- Click a text layer. It is real text: change the words in the **Text** box. If it has several styles, a **Text runs** button lists them.
- If a font isn't a Google font, check the **Font** field in the Properties panel. A font that isn't installed on the viewer's computer won't show.

## 6. Make it move

1. Select a layer and follow [Tutorial 1](tutorial-first-animation) to animate it, or add a button and follow [Tutorial 2](tutorial-first-interaction).
2. Your timelines, interactions and bindings are never touched when you update from a file.

## 7. Bring in a newer version of the file

When the designer saves a new version of the file:

1. Select one of the imported pages. The Properties panel's **Source file** section says **From Poster.psd** and when it was last brought in.
2. Press **Update from file…** and pick the new version of the file. It can have a new name.
3. A message says something like **Poster.psd updated: 3 layers changed, 1 added**. The whole update is one undo step.

What you changed here is kept. **Forget source file** drops the connection and leaves the layers as they are.

Full details, including what each format does and doesn't carry over, are in [Importing](import).

**Next:** [Tutorial 5: Publishing and sharing](tutorial-publish).`,
  },
  {
    id: 'tutorial-publish',
    title: 'Tutorial 5: Publishing and sharing',
    group: 'Getting started',
    summary: 'Check it in Preview, set the page options, then export a single HTML file or make a share link. Also how to hand a project over and get it back.',
    keywords: 'tutorial publish share export html single file link embed iframe ixp package backup revision history restore collaborate preview fit page title',
    body: `Your interactive is ready. This tutorial gets it to other people. It works with any project; the lamp from [Tutorial 3](tutorial-state-machine) is a good one to use.

## 1. Check it in Preview

1. Press **Preview** at the top right. It plays the project exactly as the exported file will.
2. The dropdown at the top says **From the start artboard** or **From this artboard**. Use the second to test just the page you're working on.
3. Press **Restart** to start from scratch. Press <kbd>Esc</kbd> to close.

## 2. Set the page options

1. Click an empty part of the canvas, or the page's name, so nothing is selected. The Properties panel shows **Page** and **Project**.
2. Under **Project**, set **Page title** (the title of the browser tab), **Fit** (how the page scales to its space) and **Page background** (the colour around the page).
3. Under **Page**, make sure the page people should see first is the start page. The button says **Start page** (greyed out) when it already is. If not, press **Make start page**.

![The Project section of the Properties panel: name, page title, description, fit, page background, sandbox and reduced motion.](help/project-settings.png)

## 3. Export a single file

1. Press **Export** at the top right (it is only for files).
2. Choose **Single HTML file**. Your browser downloads one \`.html\` file that holds the player, the project and every image, font and sound.
3. Upload it anywhere that serves web pages, or show it in an iframe. It works offline too.

![The Export menu.](help/export-menu.png)

## 4. Or make a share link

A share link needs no uploading. Anyone with the link can play the project in their browser. They can't edit it.

1. Choose **Share → Share…** (the **Share** button is next to **Export**). If something looks unfinished (a button that does nothing, sample words, a picture with no description) a short [Before you share](before-you-share) list comes first.
2. Under **Where will people use it?** choose **Anyone with a link**, and press **Create the link**. The link appears.
3. Press **Copy** and send it, or **Open** to try it.
4. The link is a snapshot. When you've changed the project, open the dialog again and press **Update to the latest version**.
5. To stop sharing, open **More ways to share**, press **Turn off link** and confirm. The link then shows a "turned off" page.

To use it inside StudyDesk, choose **In a StudyDesk page, and keep learners' results** instead and copy the code it shows into the page's Source code view: each learner's score and progress are kept, and you can see [Insights](insights). Under **More ways to share**, tick **Allow remix** if you are happy for staff to copy the project into their own projects.

![The Share menu: Share link, Invite to collaborate, Save as template and Share for review.](help/share-menu.png)

![The Share dialog: Where will people use it?, the thing to copy, and More ways to share folded underneath.](help/share-where.png)

## 5. Put it on a page

See [Embedding and the player API](embedding) for the iframe snippet, how the page can set variables and listen for messages, and the \`<interactives-player>\` web component.

## 6. Back it up, or hand it over

- **Export → Project package (.ixp)** saves the whole project with its assets. Anyone can bring it back with **Import** on the projects page.
- On the projects page, the download button on a project card does the same without opening it.
- The **history** button (the clock at the top) lists earlier saved versions. Pick one to preview it, then press **Restore this version**. What was there before is saved first, so you can come back. See [Live editing and saving](live-editing).

## 7. Work with other people

- **Invite someone to edit with you.** Choose **Share → Invite to collaborate…**, type their name and pick them from the list. The project appears on their projects page. When two or more people are in it, their initials appear at the top and you see each other's cursors. See [Live editing and saving](live-editing#inviting-people).
- **Ask for comments, not edits.** Choose **Share → Share for review…** and send the review link. Reviewers pin notes on the project and you answer them in the **Comments** tab. See [Review comments](comments).
- **Let others start from yours.** Choose **Share → Save as template…** to make a template with a checklist, or tick **Allow remix** on the Link for StudyDesk. See [Templates, examples and remix](templates).
- To let someone just play it, send a share link.
- An AI agent can join the same way. See [AI agents (MCP)](ai-agents).

## You're done

You've built, animated, wired up, imported and published. Keep going with the topics on the left. Good places to go next: [Timelines and keyframes](timelines), [Groups and frames](groups-frames), [Auto layout](auto-layout), [Data sources](data-sources) and [Troubleshooting and common questions](troubleshooting).`,
  },
];
