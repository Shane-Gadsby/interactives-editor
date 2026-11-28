# Joysticks
Scrub one or two timelines from numbers, for dials, eyes that follow the pointer and blends.

A **joystick** connects numbers to timeline positions. Instead of playing over time, the timeline sits at the position the numbers say.

Add one in the **Joysticks** section of the artboard (select the artboard).

- **X timeline** and **Y timeline**: one or two timelines to drive (Y is optional).
- **X value** and **Y value**: [expressions](expressions) from 0 to 1, for example `pointer.x / artboard.width` or a variable `volume`.

- **Handle**: a layer (a knob or stick) that something else moves, for example a drag. Where its origin sits inside the **Area** (a rectangle in artboard pixels, shown when a handle is chosen) is `handle.x` and `handle.y`, from 0 at the left and top to 1 at the right and bottom. Use them in the value expressions: `handle.x` for X and `handle.y` for Y give a stick that scrubs two timelines, and `1 - handle.x` turns an axis round. Without a handle both are 0.5.

Examples: a dial that turns with a variable, a character whose eyes follow the pointer (a left-right timeline and an up-down timeline), or a gauge that fills with a score. `pointer` (`{x, y}` on the artboard) and `artboard` (`{width, height}`) are in scope.
