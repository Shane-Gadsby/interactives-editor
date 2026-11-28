# Bones and skinning
Rig a character with bones, bend paths and images with them, and pose limbs with IK.

A **bone** is a layer that only exists to be posed. Draw a chain of bones, **bind** paths and images to them, and the shapes bend where the bones turn. Bones are drawn on the canvas as gold glyphs while you edit; the player never shows them.

## Try bones in two minutes
Not sure where to start? Let the editor build a working rig, then take it apart.

1. With nothing selected, open the **Bones** section in the Inspector (the right panel) and click **Build an example to try**. (A selected bone has the same button.)
2. On the artboard you get a three-bone arm with a shape skinned to it, an **orange dot**, a **Wave** button and the instruction *Drag the orange dot*. The gold lines inside the arm are the bones; they show in the editor, never in the player. Click a bone in **Layers** (*Upper arm*, *Forearm*, *Hand*) to see it.
3. Click **Preview** (top right) and **drag the orange dot**. The arm bends to follow it: the dot is the target of an **IK** constraint on the *Hand* bone, three bones long. Drag it out of reach and the arm straightens toward it.
4. Press **Wave**. A timeline called *Example: wave* swings the bones by hand for two seconds, with the IK **Strength** keyed down to 0 so the keyed poses win. As the strength comes back to 1 the arm returns to the dot.
5. Close Preview, select the *Hand* bone and look at **Constraints**: *IK*, target *IK target (drag me)*, 3 bones. Try **Bend the other way**, or drop the bones to 2 to see the hand end swing free. Select *Arm* to see its **Skin**, and a point's weights in **Weights of**.

![The example arm bent toward the orange dot, with the Bones section of the Inspector open.](help/bones-example.png)

![Dragging the orange dot in Preview: the arm follows it. Then Wave swings the bones and hands the arm back to the dot.](help/bones-example.mp4)

The finished result is also on the **Templates** tab, under **Examples**, as **Bones and IK**: play it, or make your own copy.

The example is ordinary layers, bones, a timeline and two interaction nodes, so everything in it can be changed, copied or deleted. Press **Build an example to try** again for another copy.

## Drawing bones
A bone points along its own x axis from its base (**X**, **Y**), for its length. Turn it with **rotation** or drag it on the canvas; child bones and layers inside it follow.

Pick the **Bone** tool (<kbd>J</kbd>) and drag from a bone's base to its tip. To carry on a chain, start the next drag on the tip of the last bone: the new bone becomes its child, and turning a parent moves everything below it. A drag that starts anywhere else begins a new bone (inside the group you went into, if you double-clicked into one). Hold <kbd>Shift</kbd> to snap angles to 15°. The eye button in the toolbar (<kbd>Shift</kbd>+<kbd>J</kbd>) hides the glyphs.

With the Select tool, click a glyph to select the bone, drag its body or tip to turn it, and drag its round base to move it. A bone is posed like any layer: **X, Y**, **rotation**, **scale** and **length** (the *Len* field, which is the layer's width) can all be keyed on the [timeline](timelines), so turning a bone while recording makes a keyframe. Layers dropped inside a bone ride on it, which is the quickest rig of all: a hand shape inside the forearm bone needs no skinning.

## Skinning
Select a **path**, then in **Skin** pick the bones and press **Bind to bones** (or select the path and the bones together and press **Bind to selected bones**). Every point is given weights from its distance to the bones, up to 4 per point, so a point on a bone follows it and one between two bones blends them. The poses the bones are in when you bind become the **bind pose**: the shape looks exactly as drawn until a bone moves. Bind with the rig in its rest pose.

- A skinned path follows its bones, not its own position, so move the rig, not the path.
- **Weights of** shows one point's influences. Change a bone's weight (they are scaled to add up to 1), add or remove a bone, or press **Auto** to work the point out again. **Re-bind** works all of them out again from the current pose.
- Bezier handles are pulled along with their point.
- If the number of points changes after binding, points without weights keep their own position: re-bind.

An **image** can be skinned too. Binding makes a grid mesh over the picture (a few cells per 40 px) and weights its vertices the same way; the picture is drawn warped through that mesh. **Remove mesh** goes back to the plain picture.

## IK and distance
Add an **IK** constraint (see [Constraints](constraints)) to the bone at the *end* of a chain and pick a target layer: the chain turns so the end bone's tip reaches the target. **Chain bones** is how many bones turn, counting the end bone and its parents (1 points one bone at the target; 2 or 3 make a limb, like an arm reaching for a hand target). **Bend the other way** puts the elbow or knee on the other side. A target out of reach straightens the chain toward it. **Strength** mixes IK with the keyed pose, and can be animated, so a limb can swing from its animation onto a target.

A **Distance** constraint keeps a layer (or bone) a set distance from a target: exactly at it, no farther than it, or no nearer. Animate the distance to pull in or push out.

Constraints run first, then skinning, so a skinned shape follows bones that IK has moved.

## Importing
A Rive file's bones, skins (weights) and meshes, and its IK and distance constraints, come in as bones, skins and meshes. Rive's IK bend direction may come out mirrored: tick **Bend the other way** on the constraint if it does.

## Limits
Skinning is linear blend skinning: strong twists can pinch, so use more bones or weight points between them. There is no weight painting brush yet; set weights per point in the inspector. Meshes are regular grids made for you (an imported mesh keeps its own triangles).
