# Steps
Turn a timeline's markers into the steps of an explainer: Next plays to the next marker, Back plays back, a step bar does the clicking.

**Steps** turn a [timeline's](timelines) markers into the steps of a "watch, then click Next" explainer. You animate the whole story on one timeline and put a marker at the end of each part. Next plays to the next marker and stops there, Back plays back to the one before, and a **step bar** (Back, Next, a dot for every step, "Step 3 of 7", the title and caption) does the clicking. Add or move a marker and the steps follow; nothing is wired by hand.

![The Steps section of the artboard, with the example explainer's four steps.](help/steps-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected.
2. Open **Steps** and click **Build an example to try**. You get a ball, a timeline with four markers (each with a title and a caption), Steps turned on, and a step bar along the bottom.
3. Click **Preview** and press **Next**. The ball grows, rolls across and turns green, one marker at a time. **Back** plays it in reverse. Click a dot to jump straight to a step. The Left and Right arrow keys work too.

## Make your own
1. Build the whole story on **one timeline**: key the layers as they should look at the end of each part.
2. Put a **marker** at the end of each part (**+ Marker** in the timeline bar, at the playhead). A marker at 0 is step 1; the editor adds one for you when you turn Steps on.
3. Click a marker on the ruler: with Steps on its **Title** and **Caption** appear beside the timeline. The title is the marker's name when left empty. A marker you untick **Is a step** stays out of the steps.
4. Select the artboard and open **Steps**. Pick the timeline (or press **Steps** in the timeline bar) to turn them on.
5. Click **Add a step bar**. It is made once as ordinary layers and nodes: restyle it, move it, delete the parts you do not want, or add another. Nothing needs updating when the markers change.

## What Next, Back and the dots do
- **Next** and **Back** play the timeline to the neighbouring marker, at the timeline's speed, and stop exactly on it. Press Next while a step is still playing and it finishes that step and goes on. Press Back and it turns round from where it has got to.
- A dot, **Go to step** with a number, **First step** and **Last step** show that step straight away (one step along plays). With reduced motion on, every move is straight away.
- The **step in view** changes as the move starts, so the caption is always the one for what is playing.
- The timeline does not autoplay: the steps own it. Do not also play it with a node.

## What jumping does with changes your interactions made
A jump shows the timeline's pose at that step. But the learner may have clicked something that changed a layer the timeline never animates, and the timeline cannot undo that. **Back and jumps** in the Steps section decides:

| Setting | Back and jumps |
|---|---|
| **Pose only** (default) | Only the timeline's pose is shown. Layers and values that interactions changed stay as they are |
| **Reset, then pose** | Every layer first goes back to how you authored it (running Animate property tweens stop, other timelines keep their pose), then the pose is shown |

**Next never resets**: it just plays on, so what the learner did in this step is still there in the next. **Variables are never reset** by either setting: use a **When the step changes** node to set them for each step ("when step 3 is chosen, set *answered* to false").

## Step variables and the step list
Turning Steps on creates four variables the player keeps up to date: **step** (the number, from 1), **stepCount**, **stepTitle** and **stepCaption**. Use them in text (`Step {step} of {stepCount}`) and [bindings](bindings) (`step >= stepCount` for a Next button's *Button disabled*). Tick **Remember** on the step variable to bring a learner back to the step they left on.

Expressions also see `steps`, a list with one entry per step: `step`, `title`, `caption`, `current` and `done`. The step bar's dots are a [repeater](repeaters) over `steps`, so there is one dot per marker. A variable or data source of your own called `steps` wins.

## Events, nodes and scripts
- **When the step changes** runs when a step is chosen, or (**When**) when its animation has finished. Give a step number to run for that step only. `event.step`, `event.count`, `event.title`, `event.caption`, `event.from` and `event.direction` (1 forward, -1 back) are in scope.
- **Go to step** is the action: next, previous, first, last, or a step number. In a repeated dot use `event.index + 1`.
- Scripts have `ix.steps`: `step`, `count`, `title`, `caption`, `moving`, `next()`, `back()`, `first()`, `last()` and `goTo(n)`.
- In [Results and progress](results), **Complete when** can be **A step-through artboard reaches its last step**.

## Accessibility
- Every step change says "Step 3 of 7: title. caption" through the same live region as the [Announce](accessibility) node (turn it off with **Announce each step**). The first step is not announced.
- Back and Next are real buttons. The dots are focusable (Tab, then Enter or Space), named "Go to step 3: title".
- **Arrow keys step** (on by default): Left and Right go back and forward while focus is inside the player, or when the player is alone in its frame. They are left alone in text fields.

## Scroll to scrub
Pick a frame under **Scroll to scrub** and scrolling it moves the timeline: the top of the scroll is step 1, the bottom is the last step, with the same stretch of scrolling for each step, and the nearest step is the one in view. Next and Back scroll the frame. The frame needs scrolling content taller than itself (a frame's **Scroll** setting, and children that reach past its bottom): **Add a scroll column** makes one, ready to use. Put the story's layers outside it so they stay still while the column scrolls, and put your own words in the column.

## Good to know
- Each artboard has its own steps. A marker's title and caption live on the marker, so editing them in the timeline changes the step bar at once.
- A timeline with no markers has no steps, and then plays as a normal timeline.
- **Turn off Steps** (the bin in the section header) keeps the timeline, markers, variables and step bar.
