# Layers, hidden and locked layers
The Layers panel, hiding and locking layers, ghosts and badges on the canvas, moving layers between artboards, and right-click menus.

The **Layers** tab in the left panel lists every artboard in the project, with each artboard's layers beneath it, front-most first.

![The Layers panel. Sun is hidden, so its name is faded. Backdrop is locked.](help/layers-panel.png)

## Working with the list
- Click a layer to select it. Double-click a name to rename it: <kbd>Enter</kbd> finishes and <kbd>Esc</kbd> cancels.
- Click the arrow beside a group, a frame or a page to open or close it. The page marked **start** is the one the player shows first.
- **+ Add page** and **+ Import file as artboard** are at the bottom, with **Tidy up pages** (also called **Tidy up artboards**), which puts the pages in a tidy grid in list order. See [Pages](artboards) and [Importing](import).

### Selecting several layers
- **Shift-click a range**: click one layer, hold <kbd>Shift</kbd> and click another, and every layer between them in the list is selected too. A folded group counts as one row, and the range stays on one page.
- <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) and click adds one layer or takes it out.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+click adds a whole range to what you already have.
- With a layer focused in the list, <kbd>Shift</kbd>+<kbd>Up</kbd> and <kbd>Shift</kbd>+<kbd>Down</kbd> grow the selection a row at a time.
- Right-click a layer for **Fit page to selection** (and **Fit page to selection with space around…**), which shrinks the open page to the picked layers, the same as on the canvas. It sits above **Select same fill** and **Select same font**, and is left out when layers are picked on more than one page. The two **Select same** items select every unlocked layer on the same page with that fill (any of a layer's fills counts, and a text layer's colour counts as a fill) or set in that font (a rich-text run in it counts). Then change them all at once in the Inspector. To change a colour or font across the whole project, use the named colour and text styles in [Libraries](libraries#styles) instead: layers that follow a style change with it.

### Selecting several pages
The same keys work on the page rows: <kbd>Ctrl</kbd>+click adds a page to the selection or takes it out, and <kbd>Shift</kbd>+click selects the rows from the one you had to this one. Chosen rows are gold. Right-click a chosen row for **Group pages…**, **Ungroup**, **Tidy up**, **Duplicate** and **Delete** on all of them. **Tidy up pages** at the bottom becomes **Tidy up N selected pages**.

A named **page group** is a folder row above its pages, which sit one step in under it. Click the arrow to fold it, click the row to select its pages and double-click to rename it. Right-click it for **Select all in group**, **Rename group…**, **Ungroup**, **Tidy up**, **Duplicate** and **Delete**. Folding only changes this panel: the pages stay on the canvas inside a dashed frame with the group's name. See [Pages](artboards#page-groups).

### Copying with Alt
Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) while you drag a row, and a **copy** goes where the line is while the original stays. This works for layers, groups, pages and page groups. The pointer shows a **+** while Alt is down, and the first few plain drags carry a reminder. On the canvas, <kbd>Alt</kbd>-drag a layer or a group the same way. A copied layer brings its interactions, as **Duplicate** does.

### Reordering
- Drag a row to reorder. A line shows where the layer will land, and how far it is indented shows which list it joins.
- Over the top or bottom third of a row, the layer goes before or after it. Over the middle of a group or frame row, the group is outlined and the layer goes inside it, at the front.
- Where a group ends, move the pointer left to drop the layer under the group instead of inside it: the line steps out one level for each step left.
- The empty space under the last row is the end of the list, so you can always drop at the very bottom without landing in a group that happens to be last.
- Drop on the page's own row to bring the layer to the top level, in front.
- From the keyboard, select one layer and press <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Down</kbd> to step it past a neighbour (and out of its group at the end). <kbd>Alt</kbd>+<kbd>Right</kbd> puts it inside the group just above it and <kbd>Alt</kbd>+<kbd>Left</kbd> takes it out, under that group.

### Filtering
Type in **Filter layers** above the list to show only the layers whose name has those letters. The groups and pages they sit in stay, faded, so you can see where each one is, and a collapsed group doesn't hide a match. Press **Text** beside the box to match the words in text layers, buttons and links as well, rich text included. <kbd>Esc</kbd> clears the box. While a filter is on, the rows can't be dragged.

### Deleting
<kbd>Delete</kbd> removes the selected layers and shows a message with **Undo** (<kbd>Ctrl</kbd>+<kbd>Z</kbd> does the same). Deleting a page with the keyboard asks first, and the page's own delete button shows **Undo** afterwards. Keys pressed after clicking in the interactions graph go to the graph, so <kbd>Delete</kbd> there removes the node and never the layer.

## Hide and lock
Hover a row and two small buttons appear at its right: a padlock (**Lock** / **Unlock**) and an eye (**Hide** / **Show**). They stay visible for any layer that is locked or hidden. The **Visible** and **Locked** ticks in the Inspector do the same.

- **Hidden** layers are not drawn by the player or in Preview. In the editor they show as a faint **ghost** on the canvas, so you can still see where they are and pick them. The exception is a hidden layer that an auto layout frame places: it takes no room in Preview, so it is not drawn on the canvas either (the others close up, as in Preview). Pick it in the Layers panel and its outline shows where it sat. Their names are faded in the Layers panel. Hide a mask layer and its clipping stops.
- **Outside a clipping artboard**: when an artboard has **Clip content to artboard** on, the part of a layer that hangs past its edge is also drawn as a faint, diagonally striped ghost on the canvas, and clicking it selects the layer. Preview and exports still cut it off. You can switch this off in [Preferences](preferences).
- **Locked** layers can't be selected or moved by clicking on the canvas, so a backdrop never gets in your way. You can still select one in the Layers panel and edit it in the Inspector.
- **Brand-locked layers** are the brand layers of a [branded project](branded-starters) (the logo, the sweeps, the footer line). They are really locked: you can't select or drag them on the canvas or in the Layers panel, and the selection box and Select all skip them. Their padlock in the list can't be turned off. Projects made before this was added are locked when you open them. That leaves nothing on them to change by accident.
- A layer that is hidden only because its parent is a [Solo group](groups-frames#solo-groups) and it isn't the active child looks the same. Its eye says **Hidden by Solo on …: show this one instead**, and pressing it makes it the active child.

### Quick badges on the canvas
With the **Select** tool, move the pointer over a ghost or over a locked layer. A small badge appears at the top right of the layer:

- an eye with a line through it: click to **show** the layer;
- a padlock: click to **unlock** the layer.

Clicking selects the layer afterwards, ready to edit.

![A hidden layer (the faint circle) with its Show badge.](help/hidden-layer-ghost.png)

![Hovering the locked backdrop shows an Unlock badge at its top right.](help/locked-layer-badge.png)

## Moving layers to another artboard
Select layers and drag them on the canvas. If you let go over a **different page**, a dialog asks **Move to page**: *Move “Card” to the page “Menu”?* It adds that the layer's keys in this page's timelines are removed and interactions here that use it will need fixing. Press **Move** to do it or **Cancel** to put them back.

![The Move to page dialog.](help/move-to-artboard.png)

- The layers keep their place on the canvas, but now belong to the other artboard.
- Their keys in the old artboard's timelines are removed.
- Interactions in the old artboard that used them will need fixing. The [Usage](usage) tab's **Broken** list shows exactly which.

## Right-click menus
- **A layer**: **Cut**, **Copy**, **Paste**, **Duplicate**, **Duplicate layer only**, **Delete**, **Order** (**Bring to front**, **Bring forward**, **Send backward**, **Send to back**), **Group**, **Ungroup**, **Combine shapes** (union, subtract, intersect, exclude), **Hide** or **Show**, **Lock**, **Select same fill**, **Select same font**, **Add interaction** (**When clicked…**, **When hovered…**, or an empty **On click** or **On hover** event) and, for text, buttons and links, **Edit text**. The shortcuts are shown beside each item.
- **A page**: **New** (a menu of layers to add where you clicked), **Paste**, **Insert component here…**, **Make start page**, **Duplicate artboard**, **Zoom to page**, **Fit page to its layers** and **Delete artboard**. See [Instances](instances) and [Pages](artboards#fit-page-to-selection).
- **Empty canvas**: **New page here**, **Paste**, **Tidy up pages**, **Zoom to fit everything**, **Show rulers** or **Hide rulers**, and **Help**.
