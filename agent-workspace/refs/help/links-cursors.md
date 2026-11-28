# Links and cursors
Make any layer a link, and choose the cursor shown when hovering it.

## Link
In the **Link** section, give any layer a **URL** and it becomes a real link. **Open in** chooses where: a new tab, the same frame, the parent frame, or the whole page (useful when the interactive is embedded in an iframe). URLs can contain `{expressions}`. Links go to `http(s)`, `mailto`, `tel` or relative addresses; anything else (such as `javascript:`) is ignored.

The **Open a web address** action does the same from an interaction.

## Go to a page
The **Go to page** section links a layer to another page, so clicking it opens that page.

**Link a page by dragging.** Select the layer. A round **Go to page** handle sits on it on the canvas. Drag the handle onto the page you want: the page lights up as you pass over it, and letting go makes the link. Or choose the page from the **Goes to** list in the section. **No page** (or dragging the handle onto empty canvas) takes the link away.

Nothing special is behind it. The editor writes a **When clicked or hovered** event on the layer and a **Go to a page** node after it. You can see and change both in [Interactions](interactions), and the list follows if you edit them there. A click that has an **Only if**, or that does something else first, is left as you built it, and the link is added after what is there.

Faint arrows between the pages on the canvas show every route the project can take, from these links and from Next and Previous steps. Switch them off from the canvas's right-click menu. They show only in the editor.

For Back, Next and a page counter along the bottom of your pages, see [Page navigation](page-navigation).

## How the page changes
**How the page changes** picks the look of a change of page. It appears wherever you choose one: here, **Go to a page** in the graph (where it is called **Transition**), **+ When clicked…**, [Page navigation](page-navigation) and a layer's **Go to page**. These are the looks, by the names the editor shows:
- **Instant** and **Fade**.
- **Slide left**, **Slide right** and **Slide up**.
- **Wipe left**, **Wipe right**, **Wipe up** and **Wipe down**: the new page is uncovered from that edge. **Wipe diagonally** starts from the top left corner.
- **Push left**, **Push right**, **Push up** and **Push down**: the new page shoves the old one off, which dims as it goes.
- **Iris (a circle opens)** and **Zoom in** (the old page grows round a point as it fades, and the new one grows in).
- **Star (opens out)**, **Diamond (opens out)** and **Heart (opens out)**, and **Clock (sweeps round)**, a hand that sweeps the new page in.
- **Barn doors (open from the middle)**, **Blinds**, **Grid of squares**, **Crosshatch** and **Dots**: shapes or lines that grow until they meet.
- **Dissolve**: the new page appears a scatter of pixels at a time.
- **Cube (turns)**: both pages turn like the sides of a box.

Dissolve is the heaviest for the device to draw, so on a big stage or an older laptop it is the one most likely to stutter.

Iris, Zoom in, Star, Diamond, Heart and Clock start from **Opens from**: **The clicked layer** (the middle of the page when nothing was clicked, say from a timer), **The middle of the page**, or **A point on the page** that you give as percentages.

**Speed** says how long the change takes: **Slow** (600 ms), **Medium** (300 ms), **Fast** (150 ms) or **Custom**, which shows a box for the milliseconds. It sits beside the look and is left out for Instant. Medium is what every page change already had, so nothing in an existing project plays differently. The Inspector's sentences say it too, as in "go to the next page (iris, slow)".

With **Respect reduced motion** ticked in the [Project settings](project-settings), a learner whose device asks for less motion gets an instant change instead. It is off in a new project, so tick it when your pages move. The [accessibility check](accessibility) flags a page that animates by itself while it is off, and its Fix turns it on.

In a script, `ix.goTo('Page 2', 'iris', 400, 'Door')` opens from the layer named Door, and a point is `{ x: 25, y: 50, percent: true }`. See [Scripts](scripts).

## Cursor
**Cursor on hover** sets the cursor shown while the pointer is over the layer and its children, the way CSS `:hover { cursor: pointer }` works. *Automatic* gives links and layers with a click, press or release interaction a pointer. Choose the cursor shown over the layer (pointer, grab, crosshair, text, not-allowed, …) or **Custom image** with a hotspot (the point of the image that clicks). Change it at runtime with **Change the mouse pointer**, `ix.setCursor('grab')` or `node.set('cursor', …)`. Browsers may ignore a custom image over 32×32 px.
