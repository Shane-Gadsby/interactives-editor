# Moving the view
Pan and zoom a page to frame one of its layers: travel across a map, or read a comic panel by panel. Then go back to the whole page.

A page does not have to show everything at once. **Move the view to a layer** (the **Move view** node) pans and zooms the page's layers so one layer fills the screen, then another, and so on. Use it for a map the learner travels across, or to read a comic one panel at a time.

## Quick start

1. Draw the whole thing on one page: the map with a layer for each place, or the comic page with a layer around each panel. Give the layers names you will recognise.
2. Select a button (or any layer) and press **+ When clicked…** in its **Interactions** section. Choose **Move the view to a layer…** and pick the layer to travel to.
3. Add a second one on a button that brings the learner back: **Show the whole page again**.

The same choices are in the Interactions palette under Navigation, as the **Move the view to a layer** node (its technical name is **Move view**).

## The settings

- **Move to**: **A layer**, or **The whole page**, which puts everything back as it was drawn.
- **Layer**: the layer to frame. It is framed as large as fits, in the middle of the page.
- **Space around it (px)**: clear space left around the layer, in page pixels. 40 by default.
- **Zoom in no more than (times)**: stops a small layer, such as a pin, filling the whole screen. 4 by default, and 0 means no limit.
- **Duration** and **Easing**: how long the trip takes and how it speeds up and slows down. A duration of 0 moves at once.
- **Continue**: the next node runs when the move finishes, part-way through, or straight away.

## What stays put, and what moves

- Everything on the page moves together, so buttons, drags and clicks still land on the right layer, and the learner can still tab to them. A layer you cannot see on screen can still be reached with the keyboard, so keep what must be reachable in view, or move the view when the learner arrives at it.
- The layers of the [page master](page-master) stay where they are, so a logo, a footer or a score bar that belongs to every page does not slide away. A master cannot hold buttons, so a button that takes the learner back (Back to the map) goes on the page, inside the area being framed, or in each framed area.
- It frames the layer where it is now. If the layer moves later (a timeline, a drag), move the view again.
- The view is in page pixels, so resizing the player, or a phone turned on its side, keeps the same layer in frame. If the page changes to a narrow or wide version of itself, the same-named layer is framed on the new one.
- **Changing page starts the new page on its whole view.** The view does not follow a learner from page to page.
- An [embedded page](instances) has a view of its own: Move view on the outer page frames the embedded page as one layer.
- If the learner has asked for less motion (and the project's Reduced motion setting is on), the view jumps to the end instead of travelling.

## In a script

`await ix.moveView('Panel 2', { padding: 40, maxZoom: 4, duration: 600, ease: 'easeInOut' })` travels there and finishes when it arrives. `await ix.resetView({ duration: 400 })` goes back to the whole page. See [Scripts](scripts).
