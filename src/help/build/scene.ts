import type { BuildTutorial } from './index';
import { all, clickThen, layerNamed, layerWhere, named, nodesOfKind, pageNamed, renamed, saw, timelineWhere } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 44,
  level: 'advanced',
  minutes: 30,
  example: 'tut-scene',
  topic: {
    id: 'tutorial-scene',
    title: 'An animated scene with speech bubbles',
    group: 'Build it',
    summary: 'A layered scene where a character runs in and a speech bubble pops up for each speaker, with a Skip button, lines read to screen readers and a still version for less motion.',
    keywords: 'tutorial animated scene story character speech bubble dialogue conversation layers groups depth timelines autoplay marker skip jump to time seek reduced motion less motion calm announce screen reader accessibility',
    body: `You will make a short animated scene outside the library. Alex is waiting; Sam runs in from the left; then a speech bubble pops up over each of them in turn. A **Skip** button jumps straight to the end, a screen reader hears each line as its bubble appears, and anyone whose device asks for less motion sees the finished scene without the movement. It takes about thirty minutes, and everything is drawn with simple shapes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Animated scene with speech bubbles**. **Play** runs it and **Make my copy** gives you your own copy.

Do [Tutorial 1](tutorial-first-animation) first if you haven't made a timeline before: this one uses the same keyframes, two timelines at once.

## 1. Make the project

On the projects page press **New project**. Keep **Blank project**, type **Library morning** and press **Create project**. Click the page's name and change **Name** to \`Scene\`.

## 2. The set, at the back

Layers higher in the **Layers** panel are drawn in front. Build from the back forwards, and group each part so it moves and hides as one.

1. Press <kbd>R</kbd> and draw a rectangle over the top two thirds of the page, light blue. Name it **Sky**.
2. Draw a green rectangle over the bottom third: **Ground**.
3. Press <kbd>O</kbd> and draw a yellow circle in the top right: **Sun**.
4. Draw a brown rectangle standing on the ground at the left: **Library**, with a darker one at its foot for the **Door**.
5. Select all five (click the first, <kbd>Shift</kbd>-click the rest in the **Layers** panel) and press <kbd>Ctrl</kbd>+<kbd>G</kbd>. Name the group **Set**.

## 3. Two characters

1. Draw a tall rectangle with a big **Radius** (about 30) for a body, and a circle on top for a head. Group them (<kbd>Ctrl</kbd>+<kbd>G</kbd>) and name the group **Alex**. Put Alex on the ground in the middle of the page.
2. Make another the same way, in other colours, called **Sam**. Put Sam on the ground to the right of Alex. This is where Sam ends up.

Check the **Layers** panel: **Alex** and **Sam** must be above **Set**, or the set hides them. Drag a row up or down to change the order.

## 4. Two speech bubbles

1. Draw a white rectangle, about 250 by 96, with **Radius** 18 and a dark **Stroke**, above Alex's head. Press <kbd>T</kbd> and click inside it: type \`Morning! Have you seen the new study rooms in the library?\` Make the text box fit inside the rectangle.
2. Group the rectangle and its text and name the group **Alex bubble**.
3. Make another above Sam, **Sam bubble**, saying \`Not yet. Show me? I have an essay due on Friday.\`
4. Last, press <kbd>B</kbd> and add a button in the bottom right corner labelled **Skip**, named **Skip**.

Now the **Layers** panel reads, from the top: **Skip**, **Sam bubble**, **Alex bubble**, **Sam**, **Alex**, **Set**. That order is the depth of the scene.

## 5. Timeline one: Sam runs in

1. Open the **Timeline** tab and press **+ New timeline**. Click the gear in the Timeline bar and set **Name** to \`Run in\`, **Length** to \`1200\`, and tick **Autoplay**.
2. With the playhead at **0 ms**, select **Sam** and click the diamond next to **X** in the Properties panel. Then type \`-140\` in **X**: Sam starts off the page, to the left.
3. Click the ruler at the far right so the playhead is at **1200 ms**, and type Sam's resting X back in (the number it had before, about 560). A second key appears.
4. Click the line between the two keys and choose **easeOut** in **Ease**, so Sam slows down on arrival.

Press the **Play preview** triangle: Sam runs in.

## 6. Timeline two: the bubbles

A second timeline plays at the same time as the first. Each timeline only moves what it has keys for, so they never fight.

1. In the dropdown at the left of the Timeline bar, choose **+ New timeline** (the **+** at the top of the **Timelines** list beside it does the same). In its settings set **Name** to \`Talk\`, **Length** to \`3500\`, and tick **Autoplay**.
2. Playhead at **0 ms**: select **Alex bubble**, click the diamond next to **Opacity** and set **Opacity** to 0. Do the same for **Sam bubble**.
3. Put the playhead at **1300 ms**, select **Alex bubble** and click its **Opacity** diamond (it keys 0, the value there). Move to **1500 ms** and set **Opacity** to 100. Alex's bubble now pops up just after Sam arrives.
4. Do the same for **Sam bubble**: a key at **2800 ms** (still 0) and **100** at **3000 ms**.

![The Talk timeline open, with Opacity keys for Alex bubble and Sam bubble, and the gear's Timeline settings showing Name Talk, Length 3500, Autoplay and Skip for less motion ticked.](help/tutorial-scene-timeline-settings.png)

> The canvas shows the timeline that is open. Choose **Design view (no timeline)** in the same dropdown to see the layers as they really are: both bubbles fully visible.

## 7. Say each line to screen readers

The bubbles are ordinary text, so a screen reader can find them. Saying each one aloud as it appears is kinder.

1. On the **Talk** timeline, put the playhead at **1500 ms** and press **+ Marker**. In the **Marker** panel on the right, set **Name** to \`Alex speaks\`.
2. Press **+ When the playhead reaches this…**. The **Interactions** tab opens on two new nodes: **When an animation reaches a marker** and **Change a value or counter**.
3. Click the **Change a value or counter** node and press <kbd>Delete</kbd>. Drag from the marker node's dot into empty space, type \`announce\` in **Find a node…** and pick **Announce**. Set **Text** to \`"Alex says: Morning! Have you seen the new study rooms in the library?"\` (with the quotes).
4. Do the same with a marker called \`Sam speaks\` at **3000 ms**, announcing Sam's line.

![The Alex speaks marker selected on the Talk ruler, with the Marker panel showing its Name, At 1500 ms and the + When the playhead reaches this… button.](help/tutorial-scene-marker.png)

## 8. Skip to the end

1. Select **Skip**. In its **Interactions** section press **+ When clicked…**, choose **Play an animation**, pick **Run in** and press **Add**. The **Interactions** tab opens on the new nodes (if it doesn't, press **Show in graph** under the new line in the **Interactions** section).
2. Click the **Play or stop an animation** node. Set **Do** to **Jump to time** and **Time (ms)** to \`1200\`, the end of **Run in**.
3. Drag from its dot into empty space and add another **Play or stop an animation**: **Timeline** **Talk**, **Do** **Jump to time**, **Time (ms)** \`3500\`.
4. Drag from that one and add an **Announce** saying \`"Skipped. Alex says: Morning! Have you seen the new study rooms in the library? Sam says: Not yet. Show me? I have an essay due on Friday."\`

![The Interactions graph: each marker event runs an Announce, and Skip's click runs two Play or stop an animation nodes set to Jump to time, then the Skipped announcement.](help/tutorial-scene-graph.png)

Jumping never passes the markers, so the announcement in step 4 is what tells a screen reader both lines after a Skip.

## 9. Less motion

Some people set their device to ask for less motion, because movement on screen makes them unwell or distracts them.

1. Open **Run in**'s settings (the gear) and tick **Skip for less motion**.
2. Do the same for **Talk**.

For those viewers both timelines now jump straight to their last pose: Sam is already standing there and both bubbles are showing. Everyone else sees the animation. Your timelines don't change at all.

## 10. Try it

1. Press **Preview**. Sam runs in, Alex's bubble pops up, then Sam's.
2. Press **Screen reader off** in the Preview's bar so it says **Screen reader on**, then press **Restart**: a strip under the scene shows each line as its bubble appears.
3. Press **Restart** again and press **Skip** straight away. Everything lands at once and the strip shows the Skip announcement.
4. To see the still version, turn on your computer's reduce motion setting (in Windows: **Settings**, **Accessibility**, **Visual effects**, **Animation effects** off) and press **Restart**. Turn it back afterwards.

![Preview with Screen reader on: Alex's bubble is up, and the Screen reader strip under the scene shows Alex says: Morning! Have you seen the new study rooms in the library?](help/tutorial-scene-preview.png)

## Go further

- **Bubbles by speaker.** Give each character's bubble the colour of their shirt, so it is clear who is talking even without the tail.
- **A tail.** Put a small rotated square under each bubble, inside the bubble's group, so it fades with it.
- **More lines.** Lengthen **Talk**, add more bubbles with their own keys, and a marker and an **Announce** for each.
- **Ready-made motion.** [Animation presets](animation-presets) write a Fade in or Pop for you, already set to **Skip for less motion**.

## What you learned

- Layer order is depth: the set at the bottom, then characters, bubbles and buttons. Groups move and hide a part as one.
- Several timelines can play at once, each animating its own layers.
- **Jump to time** on **Play or stop an animation** skips to the end.
- **Skip for less motion** gives viewers who ask for less motion the finished pose, and markers with **Announce** read the lines aloud.

**Next:** more on keys, markers and timeline settings in [Timelines and keyframes](timelines), and on screen readers and less motion in [Accessibility](accessibility). Back to the list: [Build it](build-it).`,
  },
  guide: {
    1: { check: all(renamed, pageNamed(/scene/i)), show: ['project-name', 'panel-inspector'] },
    2: { check: layerWhere('group', (n) => /^set$/i.test(n.name)), show: ['tool-rect', 'panel-layers'] },
    3: { check: all(named(/^alex$/i), named(/^sam$/i)), show: ['tool-ellipse', 'panel-layers'] },
    4: { check: all(named(/alex bubble/i), named(/sam bubble/i), layerNamed('button', /skip/i)), show: ['tool-text', 'tool-button'] },
    5: { check: timelineWhere((t) => /run in/i.test(t.name) && t.autoplay && t.tracks.some((tr) => tr.keys.length >= 2)), show: ['timeline-new', 'panel-timeline'] },
    6: { check: timelineWhere((t) => /talk/i.test(t.name) && t.autoplay && t.tracks.filter((tr) => tr.keys.length >= 2).length >= 2), show: ['timeline-new', 'panel-timeline'] },
    7: { check: all(nodesOfKind('event.timelineMarker', 2), nodesOfKind('action.announce', 2)), show: 'panel-logic' },
    8: { check: all(clickThen('button', 'action.timeline', (n) => n.params.op === 'seek'), nodesOfKind('action.timeline', 2), nodesOfKind('action.announce', 3)), show: 'add-when-clicked' },
    9: { check: timelineWhere((t) => t.calm === true, 2), show: ['timeline-new', 'panel-timeline'] },
    10: { check: saw('previewed'), show: 'preview' },
  },
};
