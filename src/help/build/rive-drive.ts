import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 66,
  level: 'advanced',
  minutes: 25,
  example: 'tut-rive-drive',
  topic: {
    id: 'tutorial-rive-drive',
    title: 'Drive an imported Rive or Lottie animation',
    group: 'Build it',
    summary: 'Import an animation made elsewhere, then put the learner in charge of it: a play and pause button, a knob that scrubs it, and your own controls for a Rive state machine.',
    keywords: 'tutorial rive riv lottie json import imported animation state machine input trigger view model shared variable blend joystick scrub knob handle play pause toggle control drive slider',
    body: `You will bring in an animation made in another tool and hand the controls to the learner: a button that plays and pauses it, and a knob they drag to scrub through it. Then, if your file is a Rive file, you will drive its state machine from your own buttons and sliders. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Drive an imported animation**. **Play** runs it and **Make my copy** gives you your own copy. Its animation is a small Lottie file of a bouncing ball.

You need an animation file of your own: a Lottie file (\`.json\` or \`.lottie\`, the kind After Effects and many animation sites give you) or a Rive file (\`.riv\`, exported from the Rive editor). Steps 1 to 7 work with either. Step 8 is for Rive files only. [Tutorial 4](tutorial-import-design) is the general introduction to importing.

## 1. Import the file

1. On the projects page press **Import** and pick your file.
2. A new project opens, named after the animation. If anything couldn't be carried over exactly, a box lists it. Read it once, then press the **×**.

## 2. Look at what you got

- **A Lottie file** becomes one page and one timeline, named after the animation. Open the **Timeline** tab to see it: it is set to **Loop**, with **Autoplay** on, so it plays as soon as the page shows.
- **A Rive file** becomes a page for each Rive artboard and a timeline for each animation. Its **state machine** becomes ordinary flows in the **Interactions** tab: press **Read as sentences** above the graph to read them. Its **inputs** become variables in the **Variables** tab (a true/false input is a true/false variable, a number input a number), and its **triggers** become messages. Blend states are in the page's **Blends** section and joysticks in its **Joysticks** section.

Nothing imported is locked. Every flow, timeline and variable can be changed like one you made yourself.

## 3. Stop it playing by itself

1. In the **Timeline** tab, pick your animation's timeline in the list at the top left.
2. Press the gear (**Timeline settings**) and untick **Autoplay**.

Now nothing moves until the learner says so. (A Rive state machine may start animations itself, in its **When the page is shown** flow. Pick a timeline the state machine doesn't play, or try step 8 instead.)

## 4. A Play or pause button

1. Press <kbd>B</kbd> for the **Button** tool and draw a button under the animation. Change **Label** to **Play or pause** and **Name** to **Play button**.
2. In its **Interactions** section press **+ When clicked…**, choose **Play an animation**, pick your timeline under **Which animation** and press **Add**.
3. The **Interactions** graph opens on the two new nodes. Click the **Play or stop an animation** node and change **Do** from **Play** to **Toggle play/pause**.

![The Interactions graph: Play button's When clicked or hovered node joined to a Play or stop an animation node, with Do set to Toggle play/pause in its settings on the right.](help/tutorial-rive-drive-toggle.png)

The sentence under the button's **Interactions** section now says what it does. **Do** has more choices: **Restart**, **Stop (reset)**, **Play in reverse** and **Jump to time** each make a good button too.

## 5. A knob that scrubs it

A **joystick** sets a timeline's position from a number between 0 and 1 instead of from time. Here the number is where a knob sits on a track.

1. Press <kbd>R</kbd> for the **Rectangle** tool and draw a long, low bar near the bottom of the page, about 480 by 36. Name it **Track**, give it a light grey **Fill**, and set **Radius** to 18.
2. Press <kbd>O</kbd> for the **Ellipse** tool and <kbd>Shift</kbd>-drag a circle 36 across at the left end of the track. Name it **Knob** and give it a strong colour.
3. In the Knob's **Draggable** section press **+**. Set **Moves** to **Left and right only** and **Stays inside** to **Layer: Track**. Type \`Scrub the bounce\` (or what your animation does) in **Name read out**.
4. Select the page: click its name above it on the canvas. In the **Joysticks** section press **+**.
5. Change **Name** to **Scrub**. Set **X timeline** to your timeline and type \`handle.x\` in **X value**.
6. Set **Handle** to **Knob**. An **Area** appears. It is where the knob's centre can go, so make it the track less half a knob at each end: **Area X** is the track's X plus 18, **Area W** is the track's width less 36, and **Y** and **H** are the track's.

A warning under **X value** may say *There is no value called handle*. Ignore it: \`handle\` only exists once a **Handle** is set, and the joystick works.

![The page with the Track and the Knob, and its Joysticks section: Name Scrub, X timeline Bouncing ball, X value handle.x, Handle Knob and the Area boxes.](help/tutorial-rive-drive-joystick.png)

\`handle.x\` is 0 when the knob's centre is at the left of the area and 1 at the right, so dragging along the track runs the timeline from start to end. A joystick only acts when its number changes: dragging the knob pauses the timeline where it is, and **Play or pause** carries on from there.

## 6. Say what to do

Press <kbd>T</kbd> for the **Text** tool, click above the animation and type \`Press Play or pause, or drag the knob to scrub\`.

The imported page has a plain white background, so dark text like this reads fine in Preview. To use another colour, click the page's name above it on the canvas and change **Background**.

## 7. Try it

1. Press **Preview** at the top right. Nothing moves.
2. Press **Play or pause**. It plays; press it again and it stops where it is.
3. Drag the knob slowly along the track. The animation follows your hand, forwards and backwards.
4. Press <kbd>Tab</kbd> until the knob is focused, press <kbd>Space</kbd> to pick it up, move it with the arrow keys and press <kbd>Space</kbd> again to drop it: the keyboard scrubs it too. Press **Screen reader off** in Preview's bar to turn it on, and a strip under the preview says what is happening, using the **Name read out** you typed.

![Preview after scrubbing with the keyboard: the knob part way along the track, the ball part way down, and the Screen reader strip saying Scrub the bounce dropped.](help/tutorial-rive-drive-preview.png)

Press <kbd>Esc</kbd> to close the Preview.

## 8. A Rive file: drive the state machine

A Rive file's state machine already decides what plays when. You change what it decides by changing its inputs, so your controls only need to set the variables it reads. Open the **Variables** tab to see their names.

- **A true/false input** (say \`isOpen\`): draw a button, press **+ When clicked…**, choose **Switch something on or off** and pick the input under **Which switch**. Each click flips it, and the state machine's flows that watch it move to the other state.
- **A number input** (say \`level\`): open the **Web** group in the tool bar, draw an **Input field**, and set its **Type** to **range**. Set **Min** and **Max** to the numbers the file uses, then under **Variable** press **Bind to a variable…** and pick the input. Dragging the slider sets the number. If a blend state reads it, the slider blends the animations as it moves.
- **A trigger** (say \`jump\`): triggers are messages. On a button press **+ On click (empty)**, drag from the new node's output dot into empty space, and choose **Action**, then **Send message**. Type the trigger's name exactly in **Message**. The imported flows that wait for it start when it arrives.
- **A view model property** comes in as a variable too, and drives it the same way. It is **shared**: one value for the page and every embedded page inside it, as in Rive, so a control on the main page reaches a button nested in another artboard.

Preview, then watch the **Variables (live)** list on the left of the Preview as you press your buttons. If nothing happens, the **Events** list under it says which flows ran.

## Go further

- **Follow the pointer.** A joystick doesn't need a handle. Leave **Handle** on **None** and keep the **X value** the **+** gave you, \`pointer.x / artboard.width\`, and the timeline follows the pointer across the page. Add a **Y timeline** for up and down. The **Joysticks** example has eyes made this way.
- **Mix two timelines.** A **blend** plays several timelines at once and mixes them by a number variable. Bind that number to a range slider and the learner mixes the poses. See the **Blends** example.
- **See a big import.** The **Breathing for calm** example is a whole Rive file brought in: its splash screen, choices and end screen are all imported state machine flows.

## What you learned

- **Import** on the projects page makes a project from a Lottie or Rive file, with its timelines, and a Rive file's state machine as ordinary flows and variables.
- A **Play or stop an animation** node can play, pause, toggle, restart or jump a timeline.
- A **joystick** sets a timeline's position from a number; with a **Handle** that number is where a dragged knob sits.
- A Rive state machine is driven by its inputs: true/false and number inputs are variables, triggers are messages, and view model values are shared variables.

**Next:** what each format brings in is in [Importing](import). More on the pieces: [Joysticks](joysticks), [Blends](blends) and [Variables](variables). To make your own poses rather than import them, see [Rig a character with bones](tutorial-bones).`,
  },
};
