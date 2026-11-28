# Sketch pads
A rectangle people draw on as it plays, with a smoothed pen, an eraser, undo and redo, and the drawing saved with their work.

A **sketch pad** is a rectangle people draw on as the project plays: label a diagram, show working, sign their name, sketch an idea. The pen smooths out a shaky hand, and a stylus draws thinner or thicker with how hard it presses.

**Make one:** select a rectangle and press **+** on its **Sketch pad** section. Its fill is the paper.

**Keep the drawing:** pick a list variable in **Strokes kept in**. Each stroke goes in it as plain data, so ticking **Save as user data** on that variable keeps people's drawings between visits, and **Reset variables** clears them. Without one, the drawing lasts as long as the page.

**The pen:** **Colour** and **Size** are what it starts with. **Colour from** and **Size from** read a variable instead, so a row of colour buttons that set `penColour` and a slider on `penSize` make a palette. **Eraser when** turns it into an eraser while a variable is true (or holds the text eraser).

**Undo, redo and clear:** the **Undo a stroke**, **Redo a stroke** and **Clear a sketch pad** nodes, on buttons of your own. A clear can be undone too. Undo keeps the last 100 changes.

**Take it out:** **Picture of a layer** on the sketch pad (or the frame around it) gives a PNG to download or keep, drawing and all.

**Good to know:**
- A pad holds up to 1000 strokes. Very long ones are thinned as they are drawn, so a drawing stays small enough to save.
- The editor canvas shows the empty pad; draw on it in **Preview**.
- A sketch pad takes the pointer, so put buttons beside it rather than over it.

help:drag-and-drop help:variables
