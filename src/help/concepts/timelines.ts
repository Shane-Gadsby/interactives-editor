import type { Concept } from './index';

export const concept: Concept = {
  order: 70,
  area: 'construction',
  topic: {
    id: 'concept-timelines',
    title: 'Timelines, keyframes and recording',
    group: 'Concepts',
    summary: 'A timeline is a named animation of layer properties. Record turns your changes into keyframes, and several timelines can play at once.',
    keywords: 'concept timeline keyframe key record recording animation design view playhead one key nothing moves two timelines same property fight wins order autoplay',
    body: `A **timeline** is a named animation on a page. It holds a track for each property it animates, and each track has **keyframes**: a value at a time. Between two keys the value moves from one to the other. A page can have any number of timelines, and more than one can play at the same time.

There are two ways to look at a page. **Design view** shows the layers as they are, with no timeline applied. Pick a timeline in the list beside the Timeline and the canvas shows that timeline at the playhead instead.

**Record** (the red dot) turns every change you make to an animatable property into a keyframe at the playhead. While it is on, a red bar across the top of the Properties panel says **Recording keyframes at …**.

![The Timeline open with Record on: the red Recording keyframes at 0 ms bar over the Properties panel, the Box's X track with two keys and its Y track with the single key that changing Y just made, and the list of timelines saying Nothing plays it and Animates Box.](help/concept-timelines-recording.png)

## Where people get caught out

- **"I moved a box to tidy the page and now it slides."** Record was on, so the move became a key. Undo it, switch Record off, and do layout in **Design view**. Going back to Design view switches Record off for you.
- **"I changed the colour, but only at one point in the animation."** Once a property has keys on the open timeline, changing it changes the key at the playhead (or adds one there), with or without Record. To change the layer's own value, go to Design view.
- **"My one keyframe does nothing."** A single key holds that value for the whole timeline. Movement needs at least two keys with different values, at different times.
- **"The animation is there but never plays."** A timeline only plays when something starts it: **Autoplay** in its settings, a **Play or stop an animation** node, a joystick, a blend or a script. The list of timelines says **Nothing plays it** when none of those does.
- **"Two timelines fight over the same layer."** If both animate the same property while they play, the one further down the list of timelines is applied last and wins. The list now warns you: each of the two says **⚠ Also animated by** and the other's name, with the layer and property, and its tooltip says which wins. Animate different properties, stop one before playing the other, or use a **Blend in** to hand over from one to the other.

## How to tell what is going on

- The **list of timelines** shows what each timeline animates, what starts it, marks the timelines that animate the selected layer with **Animates …**, and warns with **⚠ Also animated by …** when another timeline animates the same property of the same layer.
- In the Properties panel, the diamond beside a field is coloured when the open timeline animates that property, and glows when there is a key at the playhead. Its tooltip says **Add a keyframe** or **Update the keyframe**.
- The red bar at the top of the Properties panel is there whenever Record is on.
- In Preview, the **Events** list and the run highlights on the graph show whether the node that plays the timeline ran.

**More:** [Timelines and keyframes](timelines), [Design view and timeline view](timelines#design-view-and-timeline-view), [Transitions between looks](timelines#transitions-between-looks), [Animation presets](animation-presets), and [Tutorial 1: Your first animation](tutorial-first-animation).`,
  },
};
