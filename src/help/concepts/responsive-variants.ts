import type { Concept } from './index';

export const concept: Concept = {
  order: 140,
  area: 'construction',
  topic: {
    id: 'concept-responsive-variants',
    title: 'Responsive variants: one page, several widths',
    group: 'Concepts',
    summary: 'A page can have narrow and wide variants, each a whole page of its own. The player shows the one that fits the width it has, and carries what the learner did across by matching names.',
    keywords: 'concept responsive variant narrow wide phone breakpoint width set base pairing report paired by name edit one other does not follow switch',
    body: `A **responsive set** is a page (the **base**) and its **variants**. Each variant is a whole page of its own, shown from a **breakpoint** width up. The player measures the box it is in and shows the member that fits, switching as the box is resized or a phone is turned.

When it switches, the learner isn't sent back to the start. Variables stay, because they belong to the project. Timelines and layers are **paired by name**: a timeline carries on from the same moment in its namesake, and what interactions did to a layer goes to the layer with the same name.

## Where people get caught out

- **"I changed the wide one and the narrow one didn't follow."** They are separate pages. **Add narrow variant** copies the page once, and after that each has its own layers, timelines and interactions. If both should change, change both.
- **"Something got lost when it switched."** Only layers and timelines with a namesake in the other member carry over. Rename one and the pairing breaks.
- **"What does the report in the Responsive section mean?"** For each pair of members it counts the layers paired by name, then lists what would not carry: a layer or timeline only one of them has, several layers sharing a name, a layer that is a different kind in each, and steps, cards or drop zones in only one.
- **"I placed the narrow variant as a component and it never switches."** An instance always shows the page it names. Variants switch only for the page the learner is on.
- **"It switches at the wrong size."** The width that counts is the box the player is in (the page, an iframe), not the screen.

## How to tell what is going on

- Select a page and open **Responsive** in the Properties panel: it lists the members, their widths and the pairing report.

![The Responsive section of a page: Home narrow from 0 px, Home from 560 px, and the report saying 0 layers paired by name, Logo only in Home narrow and Box only in Home.](help/concept-responsive-variants-report.png)
- In the **Layers** panel the variants are listed right after their base, each with the range it is shown at. On the canvas, a pill for each member sits above the page and the one you are on is highlighted: click another to go and edit it. The pills only show when the page is wide enough on screen, so zoom in if you can't see them.

![The Layers panel with Home, 560 and wider, and Home narrow, 0 to 559, and above the Home page on the canvas two pills, Home narrow and Home.](help/concept-responsive-variants-set.png)
- In Preview, drag the **Page width** slider under the top bar across a breakpoint and watch it switch while it runs.

![The Preview's Page width slider at 420 px, past the 560 mark, with Showing Home narrow beside it.](help/concept-responsive-variants-width.png)

**More:** [Responsive artboards](responsive), [How a set works](responsive#how-a-set-works), [What carries when it switches](responsive#what-carries-when-it-switches), [Instances (components)](instances).`,
  },
};
