# Pages (artboards)
Screens with their own size, background, timelines and interactions. Called artboards in the settings and the file.

A page (also called an **artboard**) is one screen of the interactive. The file, the advanced settings and a few menus (**Duplicate artboard**, **Delete artboard**) use the name artboard.

Each page has its own size, background, layers, timelines and interactions. Variables, scripts, data and assets belong to the whole project, so every artboard shares them.

## Adding and selecting
- Make a new page with the **Page** tool (<kbd>A</kbd>), the **+ Add page** button at the bottom of the **Layers** panel, or by right-clicking empty canvas and choosing **New page here**.
- Click a page's name above it on the canvas, or its row in the **Layers** panel, to select it.
- Drag the name to move the page around the canvas. Drag its corners to resize it.

## Fit height to content
Turn on **Fit height to content** in the **Page** section and the page is as tall as its lowest showing layer. Its height is no longer typed in (the **H** box is greyed out): it follows the layers. That keeps going while the project plays, so the page grows and shrinks as a list fills from data, a layer is shown or hidden, or text gets longer. In StudyDesk the embed's iframe follows it, so nothing is cut off and there's no empty space under it.

- **Space below** keeps some room under the lowest layer.
- **Fit width to content** is the same idea sideways: the page is as wide as its furthest showing layer, and the **W** box is greyed out. The editor keeps it measured as you change the page; a page playing in an embed is drawn at the width it was saved with, because an embed's width is set by the page it sits in. With it on, **Space below** is kept to the right as well.
- The page is measured as it's drawn: every copy of a repeater and the words a bound text really shows, the same way it plays. So a list in the middle of a column pushes what's under it down the page on the canvas too.
- A hidden layer, a mask, and anything inside a frame that clips or scrolls (past the frame's own edge) take no room.
- A **dialog** takes no room either. Dialogs open over the page, so opening one never makes the page (or the StudyDesk embed) taller. One taller than the page keeps the page the height it was, so give that dialog its own scrolling.
- Any other layer can be left out the same way: turn on **Not counted in the page height** in its **Layer** section. That's for toasts, tooltips and anything else that floats on top.
- **Animate height changes** eases the page to its new height instead of jumping. **Duration** is the **Project default** (**Page height time** in the project settings, 300 ms unless you change it) or **Custom**, with its own **Time**. A viewer whose device asks for less motion always gets the jump. The first height, as the page opens, never animates.

## Selecting several pages
Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) and click page names on the canvas, or rows in the **Layers** panel. <kbd>Ctrl</kbd>+click on a chosen page takes it out again. <kbd>Shift</kbd>+click on a name adds it, and <kbd>Shift</kbd>+click on a row selects every row between it and the one you clicked before.

Chosen pages have a gold name and row, and the same gold outline as a single page. Drag any chosen page's name to move them all together.

With several chosen, the Inspector shows what you can do to all of them:
- align their edges or centres, and distribute them evenly (three or more);
- **Group pages…**, **Ungroup** and **Tidy up**;
- duplicate (<kbd>Ctrl</kbd>+<kbd>D</kbd>) and delete (<kbd>Del</kbd>, which asks first).

Each is one undo step.

## Copying a page
Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) and drag a page's name, or an empty part of the page. You drag a **copy**: it keeps its layers, timelines and interactions, and the original stays where it was. Do it on several chosen pages, or on a group's name, to copy them all together. The pointer shows a **+** while Alt is down, and the first few plain drags carry a reminder.

## Page groups
**Group pages…** (also called **Group artboards**) keeps a big project organised. Select some pages, choose **Group pages…** (in the right-click menu, the Inspector or the **Layers** panel) and name the group.

- The **Layers** panel lists the group as a folder row with its pages under it. Its arrow folds them away (the pages stay on the canvas).
- On the canvas the group gets a dashed frame, with its name on a gold chip above the top left corner.
- Click the chip, or the group's row, to select all its pages. Drag the chip to move the group.
- Right-click either for **Select all in group**, **Rename group…** (double-clicking the row does too), **Ungroup** (the pages stay where they are), **Tidy up**, **Duplicate** and **Delete**.

A page is in one group at most, and a [responsive set](responsive) goes into a group as a whole. Duplicating every page of a group makes a new group of the copies.

A group is also a chapter when the project plays. The **Next page** and **Previous page** actions of **Go to a page** stay inside the page's group, in the project's order, and `pageNumber` and `pageCount` count its pages (see [Interactions](interactions)).

## Tidy up the pages
**Tidy up pages** (also called **Tidy up artboards**) is at the bottom of the **Layers** panel and in the right-click menu on the canvas. It lays all the pages out in a neat grid, in the order of the Layers list, with even gaps and room for each name. It is one undo step.

- The start page goes first if it isn't already.
- A responsive variant stays beside its main page.
- A page that only exists to be used inside others (a [component](instances)) goes last.
- Pages you have hidden from the canvas stay where they are.
- A page group is laid out as a block of its own, so its pages stay together wherever they are in the list.

With several pages selected, **Tidy up** (in their right-click menu and the Inspector) lays out only those, among themselves, from where their top left corner is now. To change the order, drag the pages in the **Layers** panel, then tidy up again.

Starters, and projects you build from them, open already laid out this way, in order, with each responsive variant beside its page.

## Fit page to selection
**Fit page to selection** shrinks the page to the layers you have selected. Use it on the canvas right-click menu, from the command palette, or with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>.

- **Fit page to selection with space around…** leaves the room you ask for on every side.
- **Fit page to its layers** (right-click the page) does it for everything on the page.

Nothing moves on the canvas. The page's corner goes to the selection's, and every layer and its position keyframes shift to match. Layers outside the new edge are still there, just outside the page. It isn't offered while several pages are selected. It is one undo step.

## Page settings
With a page selected, the Inspector shows:
- **Name**, **W** and **H**, and **Size presets…** such as Desktop, Tablet or Phone;
- **Background**;
- **Clip content to artboard**: the parts of layers outside the page still show faintly on the canvas (see [Preferences](preferences));
- **Make start page**, **Duplicate artboard** and **Delete artboard**;
- then its **Joysticks** and **Blends**, the **Project** settings and the **Fonts**.

The **start page** is the one the player shows first. It has a **start** badge in the **Layers** panel. **Make start page** (also in the right-click menu) changes it.

## Related
- Let go of dragged layers over another page and you're asked whether to move them there: see [Moving layers to another artboard](layers-panel#moving-layers-to-another-artboard).
- For a different arrangement on narrow or wide screens, add a variant: see [Responsive artboards](responsive).
- Move between pages while the project plays with the **Go to a page** action (with a transition), or `ix.goTo('Name', 'fade')` in a script.
- A page can be placed inside another as a reusable component: see [Instances](instances). The **Use in** menu in the Inspector does it in one step.
- To see what a page asks a learner to download, open **Download size** in its Inspector: see [Download size and lite versions](download-size).
- To bring a design file in as a page, see [Importing](import).
- To share the logo, footer and other repeated layers between pages, see [Page masters](page-master).
