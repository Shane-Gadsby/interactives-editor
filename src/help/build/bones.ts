import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 67,
  level: 'advanced',
  minutes: 30,
  example: 'tut-bones',
  topic: {
    id: 'tutorial-bones',
    title: 'Rig a character with bones',
    group: 'Build it',
    summary: 'An arm drawn with the Pen, bound to three bones, that reaches for a dot you drag (IK) and waves when a button is pressed.',
    keywords: 'tutorial bones bone rig rigging skeleton skin skinning bind weights ik inverse kinematics constraint reach target arm character puppet pose wave timeline strength chain',
    body: `You will rig an arm. You draw its outline, put three bones inside it and bind the outline to them, so the arm bends where the bones turn. Then an IK constraint makes the arm reach for an orange dot the learner drags, and a **Wave** button plays a keyed pose before handing the arm back to the dot. It takes about thirty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Arm rig with bones**. **Play** runs it and **Make my copy** gives you your own copy.

If you only want to see bones working first, [Try bones in two minutes](bones#try-bones-in-two-minutes) builds a ready-made arm with one click. This tutorial builds the same kind of rig yourself, one piece at a time, so you can rig your own characters afterwards. Do [Tutorial 1](tutorial-first-animation) first if you haven't made a timeline before.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Arm rig** as the name and press **Create project**. The editor opens with one page called **Home**, 800 by 600.

## 2. Draw the arm

The arm is one closed outline. Skinning moves each point of the outline with the bones near it, so the outline needs points along its length, not just at its corners. A point every 50 px or so bends smoothly.

1. Press <kbd>P</kbd> for the **Pen** tool (or click the pen in the **Draw** group of the tool bar).
2. Click once for each point, without dragging (a drag makes a curve handle). Go along the top edge from left to right, about 40 px above the middle of the page: seven clicks, roughly 50 px apart, from about x 200 to x 500.
3. Click once just past the right end, level with the middle, to round off the hand end.
4. Come back along the bottom edge from right to left, about 40 px below the top edge: seven more clicks, under the first seven.
5. Click once just past the left end, level with the middle, then click your very first point to close the outline.
6. In the Properties panel change **Name** to **Arm**. In **Fill** pick a light colour, and in **Stroke** a darker one.

You now have a long bar, about 340 by 40, with sixteen points. It doesn't need to be neat.

## 3. Draw the bones

A **bone** only exists to be posed. It is drawn as a gold glyph in the editor and the player never shows it.

1. In the tool bar find the **Rig** group. It starts folded: click **Rig** to open it, then click **Bone** (or press <kbd>J</kbd>).
2. Hold <kbd>Shift</kbd> (it keeps the angle straight) and drag from the left end of the arm, along its middle, about a third of the way. That is the first bone.
3. Start the next drag **on the tip** of that bone (the small round end) and drag another third. Starting on a tip carries on the chain: the new bone is the first one's child.
4. Do it once more from the second bone's tip to the right end of the arm.
5. Press <kbd>V</kbd> for the Select tool. In the **Layers** panel the bones sit one inside the other. Open them and rename them, from the outside in: **Upper arm**, **Forearm** and **Hand**. (Select one and change **Name** in the Properties panel, or double-click its name in Layers.)

Click the **Forearm** glyph and look at the **Bone** section of the Properties panel. A bone points along its own x axis from its base, for its **Length**. Change its **Rotation** to 40: the Forearm and the Hand inside it turn, but the arm outline stays put. Set **Rotation** back to 0 before you carry on.

## 4. Bind the arm to the bones

1. Select **Arm**. The **Skin** section in the Properties panel lists your three bones, each ticked.
2. Leave **Max per point** at 4 and press **Bind to 3 bones**.

Every point gets weights from how close it is to each bone, and the pose the bones are in now becomes the **bind pose**. That is why you bind with the arm straight.

3. Select **Forearm** again and set **Rotation** to 40. This time the outline bends at the elbow. Set it back to 0.
4. Select **Arm** and look at **Weights of** in the **Skin** section. Pick a point near the elbow: it lists two bones with a weight each. Pick a point near the shoulder: only **Upper arm** pulls on it. You can change a weight here, or press **Auto** to work it out again.

> Move the rig, not the arm. A bound outline follows its bones, not its own position, so to move the whole arm drag **Upper arm** by its round base.

## 5. Add the dot to reach for

1. Press <kbd>O</kbd> for the **Ellipse** tool and <kbd>Shift</kbd>-drag a small circle, about 44 px across, above and to the right of the elbow.
2. Change **Name** to **Target** and pick an orange **Fill**.
3. Find the **Draggable** section and press its **+**. Set **Stays inside** to **The artboard**, so it can't be dragged off the page.
4. Type \`Orange dot, the arm reaches for it\` in **Name read out**. A screen reader says it when the dot is picked up with the keyboard.

## 6. Make the arm reach: IK

An **IK** (inverse kinematics) constraint turns a chain of bones so the tip of the last one reaches a target. It goes on the bone at the **end** of the chain.

1. Select **Hand** (open **Upper arm** and **Forearm** in Layers to find it).
2. In the **Constraints** section press **+**. A constraint is added as **Follow path**.
3. Set **Type** to **IK (reach a target)** and **Target** to **Target**.
4. Set **Chain bones** to **3**, so the Hand, the Forearm and the Upper arm all turn.

The arm bends on the canvas straight away, reaching for the dot. If the elbow points the wrong way, tick **Bend the other way**. Drag the dot somewhere out of reach and the arm straightens towards it.

**Strength** (at the bottom of the constraint) mixes the IK with the bones' own rotations: 1 is all IK, 0 is all the rotations you set. You'll animate it next.

## 7. Key a wave

A timeline can pose bones like any other layer. While the IK is at full strength it would win over your keys, so the wave turns **Strength** down first and back up at the end.

1. Open the **Timeline** tab and press **+ New timeline**. Press the gear (**Timeline settings**), change **Name** to **Wave** and **Length** to **2000**. Leave it on **Play once**, with **Autoplay** off.
2. With the playhead at **0 ms**, select **Hand** and click the key diamond beside **Strength**. Select **Upper arm** and click the diamond beside **Rotation**, then do the same for **Forearm**. That keys the starting pose.
3. Press the red **Record** button.
4. Click the ruler at about **300 ms**. Select **Hand** and set **Strength** to **0**. Select **Upper arm** and set **Rotation** to **-60**, and **Forearm** to **-40**. The arm lifts.
5. At about **700 ms**, set **Forearm**'s **Rotation** to **10**. At **1100 ms** set it to **-40**, and at **1500 ms** to **10** again. That is the wave.
6. At about **1700 ms**, click the diamonds beside **Hand**'s **Strength** and **Upper arm**'s **Rotation**, so they hold still until here.
7. At the end, **2000 ms**, set **Hand**'s **Strength** to **1**, and **Rotation** to **0** on **Upper arm** and **Forearm**.
8. Press **Record** again to switch it off, then press the **Play preview** triangle. The arm lifts, waves twice, and swings back to the dot.

## 8. Add the Wave button and the words

1. Press <kbd>B</kbd> for the **Button** tool and draw a button under the arm. Change **Label** to **Wave** and **Name** to **Wave button**.
2. In its **Interactions** section press **+ When clicked…**, choose **Play an animation**, pick **Wave** under **Which animation** and press **Add**.
3. Press <kbd>T</kbd> for the **Text** tool, click above the arm and type \`Drag the orange dot\`. Make it big and bold so learners see it first.

## 9. Try it

1. Press **Preview** at the top right. The bones are gone; only the arm, the dot, the button and the words show.
2. Drag the orange dot round the page. The arm follows it, bending at the elbow and the wrist.
3. Press **Wave**. The arm waves, then reaches for the dot again wherever you left it.
4. Press <kbd>Tab</kbd> until the dot is focused and move it with the arrow keys. The arm follows the keyboard too.

Press <kbd>Esc</kbd> to close the Preview.

## Make it yours

- **Draw a real character.** Any closed path can be bound the same way, and so can a picture: select an image and its section is called **Mesh and skin**. Binding lays a grid mesh over the picture and bends it with the bones.
- **Ride, don't bind.** A layer dropped inside a bone in Layers rides on it with no skinning at all, which is the quickest way to attach a hand or a hat.
- **Try two bones.** Set **Chain bones** to **2** and the hand swings free while the forearm and upper arm do the reaching.
- **Hide the glyphs.** The eye button in the tool bar (**Hide bones on the canvas**, <kbd>Shift</kbd>+<kbd>J</kbd>) hides them while you design.

## What you learned

- Bones are drawn in chains with the **Bone** tool; starting on a tip makes a child bone.
- **Bind to bones** in the **Skin** section gives each point weights, from the pose the bones are in at the time.
- An **IK (reach a target)** constraint on the last bone turns the chain towards a target, and **Strength** mixes it with the keyed pose.
- Bones are keyed on a timeline like any layer, Strength included.

**Next:** everything about bones, skinning and IK is in [Bones and skinning](bones), and the other constraints are in [Constraints](constraints). For a pose that follows the pointer without a drag, see [Joysticks](joysticks).`,
  },
};
