# Tutorial 1: Your first animation
Draw a box and make it slide across the artboard with two keyframes. About five minutes.

In this tutorial you draw a box and make it slide from the left of the page to the right. You will meet the **Layers** panel, the **Properties** panel, the **Timeline** and keyframes. It takes about five minutes and you don't need anything installed.

This is how it looks when it is done:

![The finished animation in the Timeline tab: Play slides the box from the left to the right in one second, and the Record button turns the Properties panel's top bar red so every change becomes a keyframe.](help/first-animation.mp4)

## 1. Make a project

1. Open the Ixia page and press **New project**. A window called **Start a new project** asks how to begin: keep **Blank project**, leave the name as it is (or type your own) and press **Create project**. The editor opens with one page called **Home**, 800 by 600.
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

**Next:** [Tutorial 2: Your first interaction](tutorial-first-interaction), where a button starts the animation. More on timelines: [Timelines and keyframes](timelines).
