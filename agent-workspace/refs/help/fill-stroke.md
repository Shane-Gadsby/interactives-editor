# Fill, stroke and effects
Solid, gradient and image fills; several fills and strokes per shape; strokes, dashes and trim; feather and drop shadows; shadow, blur and blend modes; parallax depth.

This topic covers how a layer is painted: fills, strokes and effects, and the layer settings next to them (opacity, scale, pivot and blend). Further down, **Depth (parallax)** makes layers shift as the viewer moves the pointer.

## Fill
Choose the type from the dropdown at the top of a fill: **None** (removes it), **Solid**, **Linear gradient**, **Radial gradient** or **Image** (cover, contain or fill). For a gradient, set the colour and position of each stop, press **+ Add stop** for more, and set the **Angle** of a linear one. You can type a colour as hex (such as #ffcc00), `rgb()`, `hsl()` or a colour name. The number box beside a colour is its opacity.

**The colour picker.** Click a colour's swatch and the picker opens under it. It works the same wherever there's a colour: a fill, a stroke, a shadow, text.

- The **square** sets how strong the colour is (across) and how bright (up). Drag in it, or use the arrow keys, with <kbd>Shift</kbd> for bigger steps.
- The **hue** strip under it chooses which colour.
- The **opacity** strip under that sets how see-through it is, from clear to solid. It's drawn over grey and white squares, so see-through looks see-through. It and the number box beside the colour are the same value: move one and the other follows. Both strips are sliders: arrow keys, <kbd>Home</kbd> and <kbd>End</kbd>.
- Picking another colour **keeps the opacity** it had. It never goes back to 100 by itself.
- The swatch itself shows the squares behind any colour that isn't fully solid.
- At the foot are the colour as text, the **eyedropper** (pick a colour from anywhere on the screen, in browsers that have one) and a small rainbow square for your **browser's own picker**, which only knows solid colours.
- <kbd>Esc</kbd> or a click outside closes it. One drag is one undo.

**Good to know:** a colour that follows a [token](themes) shows the token's name instead, and has no opacity of its own here: the token decides the colour. To make that paint see-through, use the fill's or the layer's own **Opacity**, or detach it from the token first.

#### Exact gradient points
By default a linear gradient runs corner to corner along its angle, and a radial one from the middle of the layer to its farthest corner, so both stretch with the layer. **Set start and end points** (linear) or **Set centre and radius** (radial) pins the gradient to numbers instead: **From** and **To** (or **Centre** and **Radius**) in pixels from the layer's top-left corner. Pinned gradients stay where they are when the layer is resized, which is how Rive and Lottie place them. With the layer selected, the points also show on the canvas as dots joined by a dashed line (a radial one has a dot at its centre and one on its radius): drag them. **Use angle instead of points** (or **Use the box…**) goes back to the stretching kind. Points can be animated like any other number. In a timeline's property list choose the gradient's start, end, centre or radius (the same for strokes and for the later fills), or a stop's colour or position. While recording, dragging a point on the canvas makes the keyframe.

### Toolbox palette
The small arrow beside every colour box (fills, strokes, gradient stops, text colours, variables, styles) opens the StudyDesk toolbox palette. It holds the brand colours, greys, link and status colours, feature colours and gradient stops used across the suite. Hover a swatch for its name.

Picking one sets an ordinary colour on the layer (the opacity is kept), so exports never depend on the palette. If the palette isn't available (a copy of the editor running outside the suite), the arrow isn't shown.

## Several fills and strokes
A shape can have as many fills and strokes as you like. The **+** in the **Fill** or **Stroke** header adds one on top of the others; the list shows the front-most first, like the layers panel. Each entry has:

- an **eye** to hide it without removing it, **↑** and **↓** (or drag its heading) to change the order, and a **×** to remove it;
- its own paint (solid, gradient or image) and, for a stroke, **W**idth, **Dash**, **Trim**, **Cap**, **Join** and **Align** (centre, inside or outside the outline; boxes default to inside, vector shapes to the centre);
- **Opacity** (how solid that paint is on its own, as a percent), **Blend** (how it mixes with what is under it), **Feather** (a soft blur of that paint, in pixels) and an **X / Y** offset.

Fills are drawn under strokes unless you change the paint order (below). Fills are numbered from the bottom: **Fill 1** is the shape's own fill (the one a style refers to), **Fill 2** the next, and so on.

Some things to build with it:

- **Layered gradients**: a solid fill under a see-through gradient with **Blend** set to *multiply* or *overlay*.
- **An outline plus a glow**: a thin dark stroke over a wide, see-through stroke with a **Feather**.
- **A drop shadow that follows a shape's fill or stroke**: add a fill, make it dark and see-through (transparency in its colour, or **Opacity**), set **Feather** to 12 or so and **Y** to a few pixels, and move it down the list so it sits under the real fill. Rive files import their drop shadows this way.

## Animating a paint
Each paint's numbers can be animated: look for the diamond next to a field. That covers a paint's colour, opacity, feather and offset, and a stroke's width and trim. Bindings, **Change a layer's setting** nodes and scripts reach them by name. The names are in [Animatable properties](animatable-properties).

Buttons and inputs draw only their first fill and stroke. Lottie export keeps every fill and stroke with their opacity, and leaves out the blend modes, feathered and offset paints (shadows), which Lottie cannot hold.

### Paint order
Some shapes need a stroke *under* a fill, or between two fills: an outline that shows only where a fill leaves it uncovered, or a fill that overlaps the inner half of its own stroke. Select one shape that has both a fill and a stroke and a **Paint order** section appears under **Stroke**, listing every paint in one list, front-most first (buttons and inputs, and several layers selected at once, don't have it). Press **↑** or **↓**, or drag a row, to move a paint in front of or behind the others. Each row shows a swatch and what the paint is (its colour, the kind of gradient, a stroke's width). Moving a fill past another fill swaps those two fills, so the numbers stay where they are while their colours trade places; the list in the **Fill** section follows. The moved row is highlighted and the arrow you pressed keeps the keyboard focus, so pressing it again keeps moving the same paint. A shape you have not reordered keeps all its fills under all its strokes, as before.

![Paint order of a shape with one fill and two strokes: the wide red stroke is moved under the yellow fill, so only its outer half shows. The list reads Stroke 2, Fill, Stroke 1 from the front.](help/paint-order.png)

![Pressing the arrows in the Paint order list: the wide stroke goes under the fill and comes back, and the picture follows.](help/paint-order-reorder.mp4)

On a frame, rectangle or ellipse, strokes that end up in front of the last fill are still drawn above the shape's children. Strokes placed under a fill are drawn under the children with it. Rive files import with the order they were drawn in, and Lottie export follows it.

## Stroke
A stroke has a colour, a width, a **cap** (butt, round, square), a **join** (miter, round, bevel), an **align** (centre, inside, outside) and a **dash**. Type the dash as a pair of numbers: `8 4` is 8 pixels on, then 4 off.

### Trim path
The **Trim** row in the Stroke section has a start (**Trim**), an end (**to**) and an offset (**Off**), all 0 to 100%. They draw only part of a stroke. Animate the end from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
Use **+** in the **Effects** section to add a shadow or a layer blur; each one has a **×** to remove it.

- **Shadow**: **X**, **Y**, **Blur**, **Spread** and **Colour**. Tick **Inner** to draw the shadow inside the shape instead of behind it.
- **Layer blur**: blurs the whole layer by an **Amount** in pixels.
- **Shader filter** (image layers only): draws the picture through a GPU shader, such as wave distortion, CRT scanlines, halftone dots or film grain. See [Shader layers](shader-layers#shader-filter-on-an-image).

These settings are in the **Layer** section at the top of the Inspector, with the position fields:

- **Opacity** is how solid the whole layer is, as a percent (100% solid, 0% invisible).
- **Scale W** and **Scale H** are the layer's scale as percents of its drawn size (100% is as drawn, -100% flips it). The chain between them keeps the shape.
- **Pivot** is the point the layer turns and scales around. Pick one of the nine dots, or type a percent across and down for anywhere between.
- **Blend** is how the layer mixes with what is under it: *Normal*, *Dissolve*, *Darken*, *Multiply*, *Colour burn*, *Lighten*, *Screen*, *Colour dodge*, *Add (linear dodge)*, *Overlay*, *Soft light*, *Hard light*, *Difference*, *Exclusion*, *Hue*, *Saturation*, *Colour* or *Luminosity*. **Dissolve** draws each pixel either solid or not at all, with the layer's opacity as the odds: at 40% opacity, 40% of the pixels show at full strength, scattered, instead of everything fading. Animate the opacity for a speckled fade in or out. A single fill or stroke (in the paint list) can use every mode except Dissolve.

## Depth (parallax)
The **Depth** section gives a layer a depth, so it shifts as the viewer moves the pointer across the page (or tilts their phone), for a layered-postcard look. Nearer layers move further than far ones, so a background might have a Small depth and the foreground a Large one.

1. Select a layer and open **Depth** in the Properties panel.
2. Pick **Small**, **Medium** or **Large**, or type your own **Amount** as a percent. **None** keeps the layer still.
3. Open **Preview** and move the pointer over the page.

A negative amount moves the layer the other way, with the pointer. Everything inside a frame or group goes with it.

- **How far:** 100% is the project's **Depth range** (40 px unless you change it in [Project settings](project-settings)). A layer at 50% moves half that.
- **Only when playing:** the canvas stays still while you edit. The shift shows in Preview and in the exported player. Clicks and hovers land where the layer is drawn.
- **Reduced motion:** nothing moves for a viewer whose device asks for less motion, whatever the project settings say.
- **Tilt:** turn on **Tilt moves depth layers** in the Project settings (off by default). On an iPhone or iPad the viewer's first tap asks permission for the motion sensor, never before. If they say no, or the device has no sensor, the layers follow the pointer only.
- **Draggable layers** hold still, so they don't slide about under a finger. A connector joining two moving layers does not follow the shift.

Depth can be animated: look for the diamond next to a field. See [Animatable properties](animatable-properties).
