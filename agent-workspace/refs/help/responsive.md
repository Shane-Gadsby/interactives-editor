# Responsive artboards
Variants of an artboard for narrow and wide pages: the player picks one by the width of its box and switches live, keeping what the viewer has done.

A diagram that reads well at 900 px often needs another arrangement at 360 px. A **responsive set** is an artboard and its **variants**: whole artboards of their own, each shown from a **breakpoint** (a minimum width) up. The player measures the box it is in, shows the member that fits, and switches as the box is resized or the phone is turned. Nothing has to be wired: the set is the wiring.

## Quick start: a phone version
1. Select an artboard (click its name above it on the canvas) and open **Responsive** in the Inspector.
2. Click **Add narrow variant**. You get a copy, 360 px wide, to the right on the canvas. The original becomes the **base** and is shown from about 70% of its own width, at most **600 px** (**560 px** for an 800 px page); the copy is shown below that. Change the **from** width to suit.
3. Rearrange the copy for a narrow page: move, resize and restyle its layers. Its timelines and interactions are its own copies too, so change them if the phone needs something different.
4. Click **Preview**. A **Page width** slider appears under the top bar, with the breakpoint marked. Drag it across 600 and the player switches artboard while it runs.

![The Responsive section, with a base artboard and its narrow variant.](help/responsive-section.png)

## How a set works
- Each member has a **from** width in the Responsive section. The player shows the member with the largest *from* that the box reaches, and the narrowest member when the box is narrower than all of them. *Narrow 0 to 599 px* and *Wide 600+ px* is the usual pair.
- In the **Layers** panel the variants sit under their base, each with the range it is shown at. On the canvas every member of a set has a pill for each of the others above it: click one to go and edit it.
- **Add narrower** and **Add wider** put a new member below the narrowest or above the widest. Change a breakpoint at any time. **Make standalone** takes an artboard out of the set; **Make a variant of…** puts a loose artboard into one. Deleting the base promotes its narrowest variant.
- Everything else treats the set as one artboard. **Go to a page**, the start artboard, the completion artboard, remembered progress and learner results all name the base, and the player shows whichever member fits. They are listed once in the pickers, as *Name (responsive)*.
- The width that counts is the width of the box the player is in (the page, an iframe or the `<interactives-player>` element), not the screen. An artboard used as an [instance](instances) always shows the artboard it names, so use the base for the page and variants only as pieces.

## What carries when it switches
When the box crosses a breakpoint the viewer is not sent back to the start, and **When the page is shown** does not run again.
- **Variables** are the project's, so they just stay.
- **Timelines** are paired by name. Each one keeps its time, direction and whether it was playing, so a timeline mid-way keeps going. One that has no namesake starts as that artboard says.
- **Layers** are paired by name. What interactions did to a layer (a Set property, a script, an animation that was still running, how far it was dragged) goes to the layer with the same name. What a timeline drives is left to that artboard's own timeline, at the carried time.
- **Drag and drop**: cards stay in the zones they were dropped in, by name, and sit in the new artboard's zones.
- **Steps**: the step in view stays. **Keyboard focus** moves to the layer of the same name.
- **Questions** live in variables, so answers and scores stay.
- These do not carry: a flow that was part-way through a **Wait**, a layer's state inside an instance, and **Blends** (they start as the new artboard says).

Name the layers and timelines the same in every member, and the pairing is exact. The **Responsive** section lists what would not carry between each two members:

- a layer or timeline only one of them has,
- several layers sharing a name (they pair in order),
- a layer that is a different kind in the two,
- steps in only one, and a card or drop zone in only one.

## A worked example: score keeper
A page has a **Score** variable, a bar chart that grows on a timeline called **Intro**, and a panel that fades out when it is clicked.
1. On the *Chart* artboard, name the layers **Bars**, **Panel** and **Title**, and the timeline **Intro**. Click **Add narrow variant**.
2. On *Chart narrow* stack the bars vertically and make the title smaller. Keep the names. The **Intro** timeline came across with the copy; edit its keys if the bars move differently.
3. **Preview** and let **Intro** start playing, then click the panel so it fades. Drag the **Page width** slider below 600: the artboard changes to the vertical one while **Intro** carries on from the same moment, the panel is still faded and **Score** is unchanged. Drag back above 600 and the wide one returns, still in step.

## Tips
- Build the wide artboard first, then add the narrow one: the copy has all the layers, interactions and timelines, so the pairing is complete from the start.
- A change to the wide artboard's interactions is not copied to the narrow one. If both should behave alike, change both (the report tells you when layers have drifted apart).
- Only small things are lost on a switch, but a viewer part-way through dragging a card or typing in a field can notice it. Breakpoints between 600 and 900 px are the ones people cross by turning a tablet.
- The **Fit width** setting in Project settings suits a set: each artboard fills the width of the page and the page height follows the artboard that is showing.

## For web developers
A page that embeds the player can listen for the switch: `player.on('variantchange', ({ from, to, set, width }) => ...)`, or `ix-variant` on the `<interactives-player>` element. `player.resize()` makes the player re-measure its box if the page changes its size without the browser reporting it.
