import type { Concept } from './index';

export const concept: Concept = {
  order: 150,
  area: 'construction',
  topic: {
    id: 'concept-reduced-motion',
    title: 'Reduced motion: it has to work without the movement',
    group: 'Concepts',
    summary: 'Some learners ask their device for less motion. Then animations that start by themselves show their end, transitions are instant, and anything that only exists mid-animation is lost.',
    keywords: 'concept reduced motion less motion prefers reduced motion vestibular calm skip for less motion respect reduced motion autoplay jump to end animation preset transition test',
    body: `Some people set their device to ask for **less motion**, because movement on screen makes them unwell or distracts them. The player listens for that setting in two ways:

- **Respect reduced motion** (Project settings). With it on, for those viewers, timelines that **autoplay** show where they end up instead of playing (a looping one stays on its first frame), page changes are instant, blend-ins are off, and auto layout glides and similar movement snap.
- **Skip for less motion** (in a timeline's settings). For those viewers that timeline jumps to its last pose however it is started: autoplay, a **Play or stop an animation** node or a script. The [animation presets](animation-presets) turn it on. It works without the project setting.

A timeline with neither, started by an interaction, still plays for everyone.

![Timeline settings with Autoplay and Skip for less motion both ticked.](help/concept-reduced-motion-timeline.png)

## Where people get caught out

- **"The learner never saw the hint."** If something only shows part-way through an animation (a label that fades in and out again, a caption that flies past), a viewer who gets the end pose never sees it. Put what matters in the end pose, or show it some other way too.
- **"My Skip button does nothing for some people."** With reduced motion the intro may already be at its end, so a button that waits for it to finish, or skips to a marker, may have nothing to do. Make sure the page still makes sense when the animation has already finished.
- **"I marked it calm and it still moves."** **Skip for less motion** only changes things for viewers whose device asks for less motion. For everyone else it plays as usual.
- **"I can't see the difference in Preview."** Preview follows your own device's setting until you press **Less motion** in Preview's header. Then it plays as a viewer who asked for less motion sees it, without changing your computer. Press it again to go back.

## How to tell what is going on

- The **Accessibility** checker flags **Animation starts by itself** when timelines autoplay and the project doesn't respect reduced motion, and its **Fix** turns the setting on. It also flags **No way to pause moving content**.

![The Accessibility tab with one probable finding, Animation starts by itself, saying the Timeline plays on its own and the project does not respect the viewer's reduced motion setting.](help/concept-reduced-motion-checker.png)
- Open a timeline's settings (the gear on the Timeline bar) to see whether **Skip for less motion** is ticked.
- With your device set to less motion, run the whole activity in Preview from start to finish and check nothing is missing.

**More:** [Animation presets](animation-presets#for-people-who-prefer-less-motion), [Project settings](project-settings), [Timeline settings](timelines#timeline-settings), [Accessibility checker](accessibility-checker#the-checks).`,
  },
};
