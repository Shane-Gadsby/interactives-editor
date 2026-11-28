# The grid and snapping
The Snap menu (grid, artboard, layers, guides, spacing, pixels, points), the grid and its size, a grid of one artboard's own, and what snaps.

The grid is a set of lines measured from each artboard's top left corner. **Show grid** draws it on the canvas, and **Snap to grid** makes things land on it. They are separate: snapping works whether or not the grid is showing.

## The Snap menu
The **Snap** button on the tool bar (the magnet) opens a menu that stays open while you tick several things. The same choices are in the canvas right-click menu (under **Snapping**) and in **Preferences**. They are yours, kept with your account.
- **Snapping** is the master switch. Switch it off and nothing snaps, but your ticks are kept for when you switch it back on. Ticking a target while it is off switches it on.
- **Grid**: land on the grid lines (this is Snap to grid: <kbd>Ctrl</kbd>+<kbd>'</kbd> ticks and unticks it). Off to begin with.
- **Artboard**: the artboard's edges and centre. Moving an artboard on the canvas, it goes to the other artboards' edges and centres.
- **Layers**: the edges and centres of other layers. By default it means the layers beside the one you drag (the same parent); tick **Layers: all, not just siblings** to reach every layer on the artboard.
- **Guides**: guides made from the rulers: a universal guide is an endless line and snaps layers on every page it crosses, an attached guide is a short line and snaps layers on its own page. See [Rulers and guides](canvas#rulers-and-guides).
- **Spacing** (equal gaps): drag a layer beside two that have a gap between them and it snaps to the same gap (or centres between them), and the distances show as orange measures. It only works while moving layers.
- **Pixels** (whole pixels): positions and sizes land on whole pixels. Untick it to let a layer sit between pixels.
- **Points** (path points): the anchor points of paths and the joints of bones. The pen, and dragging a path point, snap to them: a ring shows the one it caught. Off to begin with.
- **Snap distance**: how close (2 to 24 screen pixels, 6 to begin with) something has to be. It is in screen pixels, so zooming in makes it finer.

Artboard, Layers, Guides and Pixels are on to begin with, which is how snapping behaved before the menu. Show grid, Spacing and Points are off.

## What snapped
The nearest target inside the snap distance wins. A line in the target's colour runs across the artboard, and a chip in the corner says "Snapped to Layers" (or Artboard, Guides, Spacing, Points, Grid). The grid always has a line within half a cell, so it only takes over when nothing else is as close; if a layer's edge is as close as the grid line, the layer wins. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) while dragging to skip every target for that drag.

## The grid
- The **Show grid** button on the tool bar (beside Snap) draws it; <kbd>Shift</kbd>+<kbd>G</kbd> shows or hides it. Snapping to the grid works whether or not it is showing.
- Right-click an empty part of the canvas for **Show grid**, **Snapping** and **Grid size**, or open **Preferences**, which has a **Canvas** block with the same settings.
- While **Grid** is ticked a gold chip in the corner of the canvas says so with the size; click it to change the size or open the snapping choices.
- The grid buttons live on the **Tools** rail. Drag its **Tools** title over the left, right, bottom or top edge of the canvas to dock it there (see [The editor at a glance](interface)).

## Size and stronger lines
**Grid size** is the width of one cell in pixels: pick 1, 2, 4, 5, 8, 10, 12, 16, 20, 24, 32, 48, 50 or 64, or choose **Custom…** for anything from 1 to 512. **Stronger line every** draws every Nth line heavier (4 by default; 1 draws them all alike). They are yours, kept with your account, and the size shows in the chip while snapping is on.

## A grid for one artboard
A 1920 wide slide and a 375 wide phone page want different grids. Right-click a page (its empty area) and open **Grid for this page** to give it its own size and stronger line, or **My default** to go back to yours. It is saved in the project, so people editing with you see it, and it is never exported.

## What snaps
Moving layers, resizing them, drawing new shapes (and artboards), moving artboards, placing pen points, dragging a path's points, and the arrow keys. A moved or resized layer's edges (a rotated layer's outer bounds) land on a grid line. The other targets work with it: if another layer's edge or centre or a ruler guide is as close as the grid line, or closer, that wins and shows its line. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) while dragging to skip all snapping.

The arrow keys step to the next grid line in that direction (a layer that is off the grid goes to its nearest line first). <kbd>Shift</kbd> + arrow goes a stronger line at a time, or ten cells when stronger lines are off. <kbd>Ctrl</kbd> + arrow nudges by 1 px or 10 px as usual.

## What it doesn't do
The grid is never in **Preview**, in exports, in share links or in pictures of the artboard: it is only on the editor's canvas. Spacing only measures when moving layers (not resizing or drawing), and the arrow keys only use the grid and whole pixels.
