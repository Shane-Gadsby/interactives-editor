# Moving around the canvas
Zoom, pan, fit, the wheel preference, rulers and guides.

You move around the canvas with the mouse wheel, the Hand tool or the keyboard.

## Zoom and pan

| Do this | To |
|---|---|
| Scroll the mouse wheel | Zoom in and out around the pointer (default) |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + wheel, or pinch on a trackpad | Zoom (always) |
| <kbd>Shift</kbd> + wheel | Pan sideways |
| Hold <kbd>Space</kbd> and drag, or drag with the middle button | Pan |
| <kbd>H</kbd> | Hand tool (drag to pan) |
| <kbd>Shift</kbd>+<kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to the selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |

## Choosing things on the canvas
- Click a layer to select it. <kbd>Shift</kbd>+click or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click adds a layer to the selection, or takes it out if it is already in. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click picks the deepest layer inside groups, so you can gather layers from different groups.
- Double-click a group to select inside it.
- <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+click or <kbd>Shift</kbd>+click page names to choose several pages, then move, align, distribute, tidy, duplicate or delete them together. See [Pages](artboards).
- Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) while you drag to drag a copy. See [Alt-drag](shortcuts#mouse).

## Rulers and guides
Turn the rulers on with <kbd>Shift</kbd>+<kbd>R</kbd> (or **Show rulers** in Preferences). Drag out of the top ruler for a horizontal guide and out of the left ruler for a vertical one. The number beside the pointer is the guide's position on the open page, in page pixels. Layers snap to guides when **Guides** is ticked in the Snap menu. Drag a guide to move it, drag it onto its ruler and let go to remove it (a note by the pointer says so), and right-click it for more.

- **Two kinds.** A **universal** guide is fixed on the canvas itself, so it stays exactly where it is when you move pages. It is one endless dashed line across the whole canvas, drawn through every page it crosses and the gaps between them. This is what a new guide is, unless you change that in Preferences. An **attached** guide belongs to one page (it is measured from that page's top left corner and moves when you move that page). It is a short dashed line: it runs across its own page and only a little past the edges, so it never looks like it crosses the pages beside it. Both are the same pink.
- **Telling them apart.** An endless line is universal and a short one is attached. A guide's tooltip and the first line of its right-click menu say which it is.
- **Which kind a new guide is.** **Attach new guides to the page they're dropped on** in Preferences (Canvas and guides) is off by default, so a new guide is universal. Turn it on and a new guide attaches to the page under the pointer (that page becomes the open one). Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) while you drag to get the other kind for that one guide; a note by the pointer says which kind you are making and what Alt would do.
- **Rounding while you drag.** Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) while dragging a guide, new or existing, and it goes to the nearest multiple of **5** px. Hold <kbd>Ctrl</kbd>+<kbd>Shift</kbd> and it goes to the nearest multiple of **10**. The number beside the pointer is the rounded one and ends in *nearest 5* or *nearest 10*, and it is measured where the ruler measures: from the open page for a universal guide, from its own page for an attached one. Let go and it stays on that number. These holds are in **Keyboard shortcuts** under **Guides**, where you can give each one other keys (see [Keyboard shortcuts](shortcuts#keys-you-hold-while-dragging)). Ctrl does not turn snapping off here: guides are not layers, so they never snap to anything but these multiples.
- **Changing your mind.** Right-click a guide: **Make it universal** (for an attached one) fixes it on the canvas where it is, and **Attach to** the page (for a universal one) ties it to the page it crosses (the open page if it crosses that, otherwise the first page it crosses). The line does not move.
- **Grabbing.** A universal guide can be grabbed anywhere along its length, over any page and the space between. An attached guide can only be grabbed over its own page (and a little past it), where its line is; the attached guides of other pages are drawn a little dimmer and can be grabbed once you open their page.
- **Removing.** Drag a guide onto its ruler and let go to remove either kind. An attached guide is also removed by letting go off its page, and a universal one by letting go off the edge of the canvas. Nothing goes until you let go.
- **Snapping.** A layer snaps to the universal guides that cross its page and to its own page's attached guides. An attached guide does not pull layers on other pages, because it is not drawn there.
- **Old projects.** Guides already attached to a page stay attached. Very old projects had guides for every page; opening one moves them onto its start page (any with a negative position are dropped, since they never showed anywhere).
- **Lock and clear.** The small button in the corner of the rulers opens the **guides menu**, which is also at the bottom of a guide's right-click menu. **Lock guides** stops guides being moved, removed or added by accident (they still snap). **Clear this page's guides**, **Clear universal guides** and **Clear all guides** are in the same menu, and **Lock the guides**, **Clear universal guides** and **Clear all guides** are in the command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>). Undo brings cleared guides back.
- Guides are for you while you edit: they never show in Preview, downloads, share links or embeds.

## Big projects and artboard pictures
Pages you aren't working on are shown as a *still*: a picture of themselves. That keeps panning and zooming smooth in projects with many pages. Click a page (or a layer in it) and it comes alive for editing. The still updates by itself shortly after anything in it changes, so you never need to refresh it. If a page looks slightly soft while you pan, that is the still; click it to see it sharp. Stills are kept in this browser between sessions, so a big project opens with its pages already showing instead of filling in one by one. A page that was changed since (by you or someone else) is drawn again. While a project with several pages opens, the canvas waits for the pages in view (a moment) and then fades them in together.

## What the canvas shows
- **Notes** are drawn at the canvas's own zoom. Zoomed out, they no longer spread over neighbouring notes and pages. **Tidy up pages** leaves room for each page's notes.
- A results page that reads `quiz` (the score, the most you can score, the questions) shows numbers on the canvas instead of its formula in huge type.
- A page master's locked brand sweeps no longer show their faint overhang across the canvas.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.
