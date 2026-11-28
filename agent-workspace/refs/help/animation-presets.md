# Animation presets
Fade in, Slide in, Pop, Pulse, Shake and Fade out on any layer, with one click.

**Animation presets** are ready-made movements for a layer: Fade in, Slide in, Pop, Pulse, Shake and Fade out, each added with one click and no timeline to build.

Select a layer and open **Animate** in the Properties panel (or right-click the layer and choose **Animate**). Pick a preset and the layer is animated.

![The Animate section of the Properties panel: the six preset buttons, When, Slide in from, Delay and Length.](help/animation-presets.png)

## The presets
- **Fade in**: starts clear and fades up to how the layer is now.
- **Slide in**: glides in from the left, right, top or bottom while it fades up. It travels a fifth of the page (never less than 60 or more than 400 pixels).
- **Pop**: springs up from half size with a little overshoot.
- **Pulse**: swells by about a tenth and settles back, to catch the eye.
- **Shake**: swings side to side and settles, for "not quite".
- **Fade out**: fades away. The layer stays on the page, just clear.

Every preset ends with the layer as it was (Fade out ends clear), so you can still design the layer as normal.

## When it plays
**When** picks what starts it: **The page opens**, or **This layer is clicked**. **Delay** waits before it starts and **Length** changes how long it takes (0 uses the preset's own). Your choices are remembered, and the right-click menu uses them too. An entrance preset that starts on a click replays the entrance when the layer is clicked.

## What it writes
Nothing is hidden. A preset writes:
- a [timeline](timelines) named for the layer, such as **Title: fade in**, with ordinary keyframes you can move, ease or add to;
- an **On start** (or **On pointer**, click) event in [Interactions](interactions), joined to a **Control timeline** node set to **Restart**.

Choosing the same preset on the same layer again replaces both rather than stacking another. Different presets on one layer each get their own timeline, and you can change what they do by editing the keyframes or rewiring the nodes.

## Auto layout and repeated layers
Auto layout (and a repeater) decides where a layer sits, so it would put a sliding layer straight back. On such a layer **Slide in** grows the layer in from a little smaller as it fades, and **Shake** rocks it a few degrees instead of moving it sideways. The message under the presets says when that happened.

## For people who prefer less motion
The timelines are marked **Skip for less motion** (in the timeline's settings). For someone whose device asks for less motion they jump straight to the last pose instead of playing, so a Fade in just shows the layer and a Fade out hides it. This works however the timeline is started, and does not need the project's **Respect reduced motion** setting.

Text can also be animated letter by letter: see [Text modifiers](text-modifiers).
