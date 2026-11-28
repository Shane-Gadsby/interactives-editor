# Blends
Mix several timelines at once, weighted by numbers: idle, walk and run by speed, or a lean on top of a loop.

A **blend** plays several [timelines](timelines) together and mixes their poses. How much each one counts comes from number [variables](variables), so a single number can turn *idle* into *walk* into *run*.

Add one in the **Blends** section of the artboard (select the artboard; it sits directly above **Joysticks**), then start it with a **Start a blend** node (or tick *Start with the artboard*). **Stop a blend** ends it.

![The Blends section with the example blend: Mode, Input, Start with the artboard and two timelines.](help/blends-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected (the inspector shows the artboard's settings).
2. Open the **Blends** section and click **Build an example to try**. On the artboard you get a ball and, under it, a slider with the caption **Drag me: blend weight** (with *0 = small and red* and *1 = big and blue* at its ends and the live value of *mix* below it). Behind them are two timelines (*Example: small and red* and *Example: big and blue*), a variable called *mix* that the slider is bound to, and a blend that starts with the artboard.
3. Click **Preview** (the button at the top right of the editor). The artboard opens in the Preview window: the slider is the horizontal bar under the ball. Drag its knob from the left end to the right end. At 0 the ball is small and red, at 1 it is big and blue, and in between it is a mix of the two. (In the Preview window's left panel, **Variables (live)** also has a *mix* box you can type a number into.)
4. Open either example timeline to see that each one is just a pose: the same values at the start and the end.

![Preview of the example: changing mix from 0 to 1 turns the small red ball into the big blue one.](help/blends-mix.mp4)

## Make your own, step by step
1. **Make the poses.** Create one timeline per pose (say *Idle*, *Walk*, *Run*) and key the layers in each. A pose can be still (the same keys at the start and end) or a loop that moves.
2. **Make the number.** In the **Variables** tab add a *number* variable, say *speed*. Anything can change it: a slider (an **Input field** with type *Range* bound to the variable), a **Change a value or counter** node, a [joystick](joysticks), or a script.
3. **Add the blend.** Select the artboard, open **Blends** and click **+**. Leave the mode on **1D**, set **Input** to *speed*, and add your timelines with **+ timeline**. Give each one the value of *speed* where it should count fully, e.g. *Idle* 0, *Walk* 1, *Run* 2.
4. **Start it.** Tick **Start with the artboard**, or add a **Start a blend** node to a flow in the Interactions tab.
5. **Preview** and change the number.

Use **Direct** when each pose should have its own weight (e.g. a *smile* and a *frown* amount from two sliders), and **Additive** to layer a small motion (a lean, a breath) on top of whatever is already playing.

## Modes
| Mode | How the weights work |
|---|---|
| **1D** | One *Input* variable is a position. Each timeline sits at a *value* along it. The two timelines either side of the input are mixed in proportion; below the first or above the last, that end timeline counts fully. |
| **Direct** | Each timeline has its own weight: a variable (from 0 up to *Full weight at*, so use 100 for percentages) or a fixed weight from 0 to 1. Weighted timelines are averaged. If the weights add up to less than 1 the rest is whatever the layer already had; if they add up to more than 1 they are scaled down. |
| **Additive** | Each timeline adds its *change from its first frame*, times its weight, on top of the layer's current value. Stopping the blend takes the change back out. |

## What gets mixed
- Numbers (position, size, rotation, opacity ...) and colours are blended.
- Everything else (visible, text, draw order, solo child) takes the value of the heaviest timeline that animates it, as long as the weights covering it add up to at least 0.5. Additive blends leave these alone.
- Only the properties the blend's timelines animate are touched, and only where the weights say something.

## How it plays
While a blend is on, each of its timelines plays on a playhead of the blend's own, following the timeline's loop setting. The same timeline can also play normally. Every frame the order is: normal timelines, [joysticks](joysticks), blends (in the order listed), then Animate property tweens. A blend therefore wins over a normal timeline animating the same property, except that Additive blends add to what the timeline wrote. *Start a blend* does nothing if the blend is already on; *Stop a blend* leaves the mixed pose where it is (Additive blends excepted).

## Easing a jump: Transition
A number that jumps (a counter going from 0 to 1 when a button is pressed) makes the mix jump too. Give the blend a **Transition (ms)** and it eases its own mix to the new number over that long instead, say 250 for a quarter of a second. **Transition easing** shapes it (linear sweeps evenly).

The variable itself changes at once and is not touched, so anything else that reads it is unaffected. If the number changes again half way, the mix turns round from wherever it has got to. With the viewer's reduced motion setting on, the mix follows the number at once. There is no setting on a connector in the graph: connections carry no values here, so the time lives on the blend.

To ease the number itself, so that everything reading it moves smoothly (a bar bound to it, a text showing it), use **Over (ms)** on **Change a value or counter** (Set variable) with *Set to* or *Add*. Use that when you want the number visible as it moves, and a blend's Transition when only the pose should be smooth.

## Imported blend states
Importing a Rive file turns its 1D and direct blend states into blends. Entering the state plays the blend; leaving stops it. Direct blend inputs run 0 to 100 as in Rive.
