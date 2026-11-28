# Page masters
One artboard holds what every page shares (logo, accent bar, footer); pages draw it under their own layers. Change it once and every page follows.

Pages in a deck repeat the same things: a logo, an accent bar, a footer line, Back and Next buttons. Copying them onto every page makes every project bigger, and a change means editing every page. A **page master** is an artboard that holds those layers once. A page that uses it draws the master's layers under its own, in the same renderer (it is not an [instance](instances), so there is no nested player). Edit the master and every page changes at once, while you work and in the player.

## Quick start
1. Build an artboard with the shared layers: the logo, the bar, the footer. It does not need a background; the page keeps its own.
2. Right-click it in the Layers panel and choose **Make this a master** (or **Make this a master** in its **Page master** section).
3. Select a page, open **Page master** in the Inspector and pick the master. Or select the master and choose **Use as master for…**, or **Use for all other pages**.
4. To change the shared layers, click **Edit master** on any page. The master's own layers are read-only on a page: clicking where one is selects the page, not the master's layer. With the page selected, the layers it gets from the master are outlined with a dashed line on the canvas, under a tag saying **From page master** and the master's name, so you can see which ones to change in the master.

## On a page
- **Master**: the artboard drawn under this page, or **None**. A page set to None keeps its slot text and hidden layers, so they are back if it gets a master again.
- **Show these master layers on this page**: untick a layer to leave it off this page only (matched by the layer's name, at any depth). Name the layers clearly in the master.
- **Text slots**: put `{pageTitle}` (any name) in a text layer of the master and the page's **Text slots** list gets a field for it. What you type is what that page says. A slot with nothing typed shows the project variable of that name, if there is one. What you type can use `{variable}` itself.
- **Detach** copies the master's layers into the page as ordinary, editable layers, with the master's flows and animations that run on pages (pointed at the new copies), and stops using the master.

## On the master
- **Draw over the pages**: tick the top-level layers that should sit over the pages' own layers (a corner fold, a footer bar). Everything else goes under.
- The list of pages that use it. A master that pages use can't be turned back into an ordinary artboard until they stop. Deleting a master takes it off its pages (Undo brings it back).
- A master can't have a master of its own, and a page that is a master can't use one.

## Buttons and clicks on a master
A master's buttons work on every page that draws it, and what they do is wired once, on the master.

1. On the master, add a button (or a link, or any layer you want clickable) and name it.
2. With the button selected, add **When clicked** in its **Interactions** section, then add what should happen: **Go to a page** (Next page or Previous page), **Change a value or counter**, **Show / hide**, **Control an animation**. These run on whichever page is showing, so Next on the master goes to the page after the one the learner is on.
3. Or select the master and use **Page navigation** to put Back, Next and the page number on it in one go.

What works from a master:
- **Events**: When clicked or hovered (not dragging), When a key is pressed, When focused, When the page is shown (*On start*), Every so often (timer), When a value changes, When an animation ends or reaches a marker, and When a message arrives. Drag, step, video, data and load events are about one page, so they do nothing from a master.
- **Actions**: all of them, acting on the page that is showing. A **Show / hide**, **Set property** or **Control an animation** reaches the master's own layers and animations. A formula or script that finds a layer by name looks on the page, not the master.
- **Animations** on a master move the master's layers. They start again on each page (an animation set to play automatically plays when the page appears) and stop when the learner leaves it. Sound, captions and descriptions on a master's animation are left out: put them on the page.
- **Keys**: a *When a key is pressed* on the master with nothing picked listens on every page, so one arrow key flow serves the whole deck. A **Shortcut** on a master button works on every page too.
- **Leaving it off a page**: untick a master layer under **Show these master layers on this page** and that page does not draw it, and the flows that listen to it do nothing there.
- **On the page** the Interactions tab lists the master's flows, read only, under **From the page master**, with **Edit the master** to change them. On the master the same tab edits its flows, and says how many pages they run on and which events do nothing.

## What a master layer is
- **Decorative unless it is a control.** A picture, shape or piece of text on a master is hidden from screen readers, is never a tab stop, and the pointer goes through it to the page. A layer with a **Role** or an **Accessible name** (a logo with alt text) stays in the reading order.
- **Controls are real.** A button, a link, a layer with a link, or any layer the master's flows listen to for clicks, keys or focus takes the pointer, is a tab stop, keeps its role, label and cursor, and works from the keyboard like it does on a page.
- **Reading and tab order.** The master's layers that sit under the page come first on the page, and the ones that sit over it come last. So a Back and Next that are drawn over the page (tick them under **Draw over the pages**, which **Page navigation** does for you) are the last stops, after the page's own controls. A page's own Tab order numbers don't move a master's controls: the ones under the page still come first and the ones over it last.
- **Shapes, paths, text, pictures, progress bars, groups and frames only, and buttons and links as controls.** Inputs, video, embeds, instances, script layers and shaders are left out of a master, since they are heavy or hold their own state. Put those on the page.
- **Bindings still work**, so a progress bar or a title bound to a variable is fine in a master.
- **Names and ids never clash.** The master's layers can't be targeted from a page's graph, timeline or script (only from the master's own), and a page layer with the same name is never confused with one.
- **Responsive sets**: every member is an artboard of its own, so give each its own master of the right size. A master is drawn at its own coordinates.

## Everywhere else
Pictures (PNG, SVG, PDF, animated GIF), thumbnails, the single-file export, `.ixp` packages and the player all draw the master. A **Lottie** export flattens it into the animation. A library component that uses a master brings the master along (as an inner artboard). In a project made from a branded starter, the master's brand layers are locked like any other brand layer, and a page can't leave them off or drop its master.
