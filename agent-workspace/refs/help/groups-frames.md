# Groups and frames
Grouping layers, frames that clip and lay out, masks, solo groups, draw order and scrolling frames.

- A **group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) moves, scales and animates its layers together. Its box stays around its layers: move, resize, add or remove one and the group's box follows (nothing moves on the canvas, and keys on the layers' positions are adjusted to match). Untick **Size to contents** in the Group section to keep a box you set yourself. A rotated or scaled group, and a repeater, keep the box they have, since refitting would move the point they turn around.
- A **frame** (<kbd>F</kbd>) is a box with its own fill, stroke and corner radius. It can **clip** its contents and can use [auto layout](auto-layout).

Press <kbd>Enter</kbd> on a group or frame to work inside it; <kbd>Escape</kbd> goes back out.

## Masks
Tick **Use as mask** on a shape or group and it clips the layers above it in the same group, up to the next mask, so they only show inside its outline (the way masks work in most design tools). A group masks with the shapes inside it. A picture used as a mask clips by its transparency (so a cut-out PNG works as a stencil), as long as it is stretched to its box (fit *fill*) and only moved or scaled. The mask itself is not drawn in the player; on the canvas it shows as a faint ghost so you can still pick it. Hide the mask layer to turn the clipping off. To clip just one layer, put the mask and that layer together in their own group.

**Mask mode** (shown once *Use as mask* is on) chooses how the mask's coverage is worked out. *Alpha* (the default) shows the layers where the mask has shapes. *Inverted* shows them everywhere the mask has none, a hole where the shapes are. *Luminance* shows them as brightly as the mask's painted shapes are: white lets everything through, black nothing, a grey, a gradient or a half-transparent shape part-way (a picture counts as the picture itself). *Inverted luminance* is the opposite of that. The inverted and luminance modes are drawn with an SVG mask, so they are not limited to the layer's box (and a picture works by its pixels in them); the plain alpha mode is the crisp clip path.

## Solo groups
Tick **Solo** on a group or frame and it shows only one child at a time, the one chosen under **Active child**. Use it for states of a character or a button: build each state as a child, then switch between them. The active child can be keyed on a timeline (a step change, like a cut) or set from interactions with **Change a layer's setting** and the property *Solo: active child*, whose value can be a quoted layer name such as `"Happy"`. Children that are not active take no room in auto layout.

## Draw order
A group's **Draw order** section lists its children front to back with arrows to move them. With **Record** on, or with the diamond, a change becomes a keyframe on the *Draw order (children)* property, so layers can pass in front of and behind each other during an animation. Keys always step from one order to the next. Layers you do not list keep their place. From interactions or scripts, set **Draw order (children)** to a list of layer names, back to front (scripts call this setting `drawOrder`).

## Scrolling frames
Set a frame's **Overflow** to *Scroll vertically*, *Scroll horizontally* or *Scroll both*. Content beyond the frame can then be scrolled with the wheel, a trackpad or touch in the player, like a scrollable panel. A **When scrolled** event set to *Is scrolled* fires as it scrolls, with `event.scrollTop`, `event.scrollLeft` and `event.progress` (0 to 1). In the editor the frame stays still so you can edit it; scroll it in Preview.
