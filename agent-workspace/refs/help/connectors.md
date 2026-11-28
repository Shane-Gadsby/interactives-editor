# Connectors
Lines and arrows that join two layers and follow them: straight, elbow or curved, with arrow heads, a label, and one per item of a list.

A **Connector** is a line or arrow that joins two layers and follows them. Move, resize, turn or animate either layer, change the screen size, or let a repeater or auto layout move it, and the connector re-routes by itself: you never position it. It is how the mind map and flowchart starters draw their lines, and it is what to use for any diagram where boxes are joined.

## Drawing one

Pick the **Connector** tool (<kbd>K</kbd>, in the **Draw** group) and drag from one layer to another. The layer under the pointer lights up with a dot on each side: let go near a dot and the end attaches to that **side**; let go anywhere else on the layer and it is **auto**, the side that faces the other end. Let go on empty canvas and that end is a **loose point** that stays where it was dropped. Hold <kbd>Shift</kbd> to keep the tool.

The new connector is selected, with a gold handle on each end. Drag a handle onto another layer to re-attach it.

You can also add one in the **Connector** section of the Inspector, which lists the layers on the artboard for each end.

## The Connector section

- **Route**: **Straight** goes edge to edge along the line between the two centres (round layers meet where the ellipse is, not where the box is), **Elbow** turns in right angles and goes round both layers instead of through them, with the fewest corners, and **Curved** leaves each side along its edge and bends smoothly.
- **Start** and **End** (under *On layer*): the layer, its **Side** (auto, top, right, bottom, left) and **Slide**, which moves the end along that side so two lines can leave the same side apart.
- **Ends**: a **Plain** end, an **Arrow** or a **Dot**, each end separately. **Cap size** is 0 to size them from the line's width. **Gap** stops the line short of each layer. **Corner radius** rounds an elbow's corners (and the label's background).
- **Label**: words on a background chip at **Position** (0 is the start, 1 the end). Variables work in braces: `{score}`. The label's background is the layer's **Fill**, its text colour and font are in the section.
- The line itself is the layer's **Stroke**: colour (a [theme token](themes) works), width, dash, round or butt ends. Animate **Trim end** from 0 to 100 to draw the line in.

A connector has no position or size to set: its box is the route. A connector is **hidden** while either layer is hidden or gone (the Inspector says when a layer is gone).

## Repeaters: one connector per link

A layer inside a [repeater](repeaters) has one copy per item, and a copy's number is its place in the list (from 0). Connect two copies with a **Which copy** expression on each end. Put the connector in a repeater of its own over a list of links, and the expression sees that link as `item`:

- the boxes: a group repeating `nodes`, with a box as its template (its first child);
- the lines: a group repeating `links` (`[{from: 0, to: 2}, ...]`) with one connector as its template. Its **Start** is the box, **Which copy** `item.from`; its **End** the same box, **Which copy** `item.to`.

Add a link to the list and a line appears; change a link and it moves. A link that names a copy that isn't there (an index past the end, or text) isn't drawn. When you drag the Connector tool onto a layer that is in a repeater, the end is made for you as copy 0.

## Reading it

A connector is **decorative**: screen readers skip it, and so does the keyboard. A diagram needs a text version, so give the page a plain alternative: a nested list for a mind map, a numbered list of steps for a flowchart. For one line that says something on its own, give the connector a **Text alternative** (Accessibility), such as "Yes leads to Book a room"; it is then read as a picture with that name. The label chip is part of the drawing and is not read separately.

## Where it works

Connectors draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of a page. They are left out of Lottie files (the export says so). A connector takes no clicks or hovers; put the events on the layers it joins. A page with connectors is redrawn whole on each edit in the editor, which is still fast at diagram sizes.

## Starters that use them

The **Mind map** and **Flowchart** starters (Explore and reveal) draw all their lines with connectors, from lists: the boxes and the lines are each one repeater over a layout the [expression helpers](expressions) `mindMap(...)` and `flowChart(...)` work out, so adding an idea or a step to the list is all it takes. Each has a text version (an outline, a numbered list) for anyone who can't see the picture.

See also [Repeaters](repeaters), [Charts](charts) and [Accessibility](accessibility).
