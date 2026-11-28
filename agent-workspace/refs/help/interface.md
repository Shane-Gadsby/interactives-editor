# The editor at a glance
Top bar, tools, Layers and Assets, canvas, Inspector, bottom tabs, arranging the panels, and Preview.

![The editor with a project open.](help/editor-overview.png)

## Top bar
From left to right:

- **All projects** (the house): back to your [projects page](projects), with the project you left highlighted for a moment.
- The **project name**. Click to rename.
- The save state: **Saved**, **Saving…**, **Unsaved** or **Save failed** (hover it for the reason). A save that failed because of the network or the server tries again by itself, and says **Saved again** when it gets there. A big project is sent squeezed (compressed), so saving it takes far less of a slow upload, and there is nothing to switch on.
- **Live**: the project's live connection, **Live**, **Reconnecting** or **Deleted**. When other people are in the project too, their initials show beside it. See [Live editing and saving](live-editing).
- **Revision history** (the clock): earlier saved versions of the project.
- **Undo** and **Redo**.
- Zoom: **−**, the percentage (click it to fit everything) and **+**.
- **Preferences** (the gear, with the version **(i)** icon in its title bar). See [Preferences](preferences).
- **Help**: opens the page for whatever you have highlighted, and its tooltip says which ("Help: Chart layer"). With nothing highlighted it opens the general help. See [Using this help](help).
- **Preview**, then **Export** (a menu of files to download, see [Exporting](export)) and **Share** (a menu: **Share…**, **Invite to collaborate…**, **Save as template…** and **Share for review…**, see [Sharing](export#sharing)). Once the project has [themes](themes), a theme box shows in the bar too.

## Tool bar (left edge, unless you move it)
**Select** and **Hand** sit at the top. Below them the tools are in groups. Click a group's name to fold it or open it. The editor remembers which groups you keep open, and a folded group still shows the tool you're using.

- **Shapes** (page, frame, rectangle, ellipse, polygon, star) and **Draw** (line, connector, pen, pencil, bend) start open.
- **Media** (text, script layer, shader layer, video, image and the Photography Catalogue), **Data** ([progress bar](progress-bars), [chart](charts)), **Web** (button, input, link, embed, Add question) and **Rig** (bone, show/hide bones) start folded.

Hover a tool to see its name and shortcut. See [Shapes and paths](shapes), [Shape morphing and the Bend tool](shape-morphing), [Web elements](web-elements) and [Script layers](script-layers).

### Putting the tools in your own order
You can put the groups, and the tools inside a group, in the order you like.

1. Drag a group by its name, or a tool by its button.
2. Let go at the gold line.

With the keyboard, focus a group's name or a tool and press <kbd>Alt</kbd> with an arrow key. Up and left move it earlier, down and right move it later. You can also right-click a group or a tool for **Move … up** and **Move … down** (or **earlier** and **later**) and **Reset tool order**.

The order is saved with you, never in the project, so it follows you between browsers. **Reset section and tool order** in [Preferences](preferences#workspace) puts everything back. The Properties panel's sections can be moved the same way: see [Moving sections](properties-panel#moving-sections).

### Below the groups
- **Comment** (<kbd>C</kbd>) pins a review note where you click. See [Review comments](comments).
- **Note** (<kbd>S</kbd>) draws a sticky note for the people editing. Players never see it. An eye button next to it shows or hides notes. See [Notes](notes).
- **Show grid** (<kbd>Shift</kbd>+<kbd>G</kbd>) and **Snap to grid** (<kbd>Ctrl</kbd>+<kbd>'</kbd>) are lit gold while on. Right-click either for the grid size. See [The grid and snapping](grid).
- The **Photography Catalogue** button sits in the **Media** group with image and video. It opens the photo library in a window and puts the photo you choose on the page. It is an action rather than a tool, so it doesn't stay lit after you use it. See [The Photography Catalogue](media-catalogue).

There is no Help button on the tool bar. **Help** is in the top bar, and right-clicking the tool bar has **Help for the tools**.

## What the pointer shows
The pointer tells you what a press will do.

- Over a selected layer it is the **move** cross. Over a page's name it is the move cross too.
- Over a resize handle it is a double arrow along the way that handle drags, turned with the layer if the layer is turned.
- Just outside a corner it is the **rotate** arrows, turned to sit round that corner.
- Over a gradient handle it is an open hand.
- In point-edit mode a point shows the move cross, and the outline shows an arrow with a **+** (double-click adds a point there).
- The **Pen** is a nib, with a ring over the first point (a click there closes the shape). The **Pencil** is a pencil. The **Hand** is an open hand that closes while you pan.
- The **Connector** tool is a crosshair, and the layer it would join lights up with a dot on each side. The **Bone** tool is a crosshair too, with a ring over a tip (a click there continues the chain).
- Edges between panels show the resize arrows. The Timeline's empty lanes and ruler show a sideways arrow (a press scrubs). A port in the interaction graph shows a crosshair.
- While you hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) over something you can drag, the pointer shows a copy cursor. See [Alt-drag](shortcuts#mouse).

When pressing will ask you something first, a note beside the pointer says so before you press: over a rectangle, ellipse, polygon or star the **Bend** tool says it will ask to turn it into a path, and dragging layers over another page says letting go will offer to move them there.

## Left panel
Four tabs:

- **Layers**: every page in the project, with its layer tree. Click to select, drag to reorder or nest, hover for the lock and the eye. See [Layers, hidden and locked layers](layers-panel).
- **Assets**: images, video, audio, fonts and data files in the project. See [The Assets panel](assets).
- **Libraries**: components and styles shared between projects. See [Libraries](libraries).
- **Comments**: the review notes pinned on the project, with filters. See [Review comments](comments).

Drag the left and right panels' inner edges (beside the canvas) to make them wider or narrower. Double-click an edge to put it back. With an edge focused, the arrow keys move it (<kbd>Shift</kbd> for bigger steps). The left panel starts 300 px wide so its tabs and the help button aren't clipped. Any width you drag a panel to is remembered in this browser.

## Canvas
All pages side by side. See [Moving around the canvas](canvas). Right-click for menus: see [Layers, hidden and locked layers](layers-panel#right-click-menus).

## Properties panel (right)
The settings for whatever is selected. See [The Properties panel](properties-panel) for everything in it.

- The search box at the top finds a property by name or by what it does.
- A layer's settings start with **Layer** (name, position, size, rotation, opacity, scale, pivot, visibility, blend). Then comes a section named after its kind (**Path**, **Text**, **Image**...) with what only that kind has.
- Click a section's title to fold it away or open it again. The arrow beside the title points down when it's open and right when it's folded.
- Drag a section by its title, or press <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Alt</kbd>+<kbd>Down</kbd> on it, to put the sections in your own order. See [Moving sections](properties-panel#moving-sections).
- With several layers selected, the bar of align buttons at the top lines them up.
- With nothing selected, or only a page, it shows the page and its **Responsive**, **Steps**, **Blends**, **Joysticks** and **Bones** sections, then the **Project** settings and the **Fonts**.
- A **?** beside a section's title opens that section's page in this help. The diamonds beside fields key them on the timeline.

The chain between **W** and **H** (and between **Scale W** and **Scale H**, and on a page's size) links the two. Linked, changing one changes the other and keeps their ratio, and the canvas's resize handles keep it too (hold <kbd>Shift</kbd> to resize freely). Each layer remembers its own.

The panel starts 320 px wide.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables**, **Data**, **Accessibility**, **Insights**, **Public interface**, **Themes** and **Usage**. A project made from a template also has a **Checklist** tab, and one made from a starter a **Fill in** tab (the content as a plain form, see [Fill in this starter](fill-in-starter)). Click a tab to open it, click the open one again to fold the bottom panel down to its tabs, and drag the top edge to resize. Each has its own page: [Timelines](timelines), [Interactions](interactions), [Scripts](scripts), [Variables](variables), [Data sources](data-sources), [Accessibility checker](accessibility-checker), [Insights](insights), [Public interface](public-interface), [Themes](themes), [Usage](usage) and [Templates](templates#use-a-template).

## Arranging the panels
Every panel can go anywhere: the left, right, bottom or top area, or a window of its own floating over the canvas. Drag a panel by its tab.
- Onto another area's tabs: it docks there, in the gap you drop it in (a line shows where). Drag along its own tabs to change their order.
- Onto the canvas: it opens in its own window there (an outline shows where). While you drag, **Dock left**, **Dock right**, **Dock at the bottom** and **Dock at the top** strips appear on the canvas's edges, so an area can be docked into even when nothing is in it yet.
- Onto a floating window's tabs: it joins that window.

The **bottom** area's height follows the window until you set one: on a taller window it opens taller (up to about 440 pixels), so the Timeline and its Keyframe panel have room. Drag its top edge (or focus the edge and use the arrow keys) to set your own height, which is then kept, and double-click the edge to go back to following the window. It never takes more than the window less 200 pixels, so the canvas keeps some room on a short one.

A floating window moves by its title bar and resizes from its bottom-right corner. Its **×** closes it and sends its panels back to where they started. An area nothing is docked in takes no room.

The **Essentials** workspace (Preferences > Workspace) goes a step further: it puts panels and tool groups away until they are wanted, with **More panels** at the right of the bottom tabs and **More tools** in the tool bar to bring them back, and **Show all panels and tools** to leave it. A panel your project already uses keeps its tab. See [Your first five minutes](welcome#your-first-five-minutes).

The **top** area sits under the header and above the canvas and its rulers, across the page, and takes no height until a panel is docked in it (so nothing looks different until you use it).

Drag its bottom edge (or focus the edge and use the arrow keys) to resize it, double-click the edge to reset its height, click the open tab or the arrow at the end of its tabs to fold it down to its tabs, and click a tab to open it again. Its height and whether it is folded are kept with the layout, so saved workspaces carry them too. Old layouts and workspaces open the same as before, with an empty top area. The canvas gets whatever room is left, and the rulers stay on the canvas.

Right-click a tab (or press <kbd>Shift</kbd>+<kbd>F10</kbd> on it) for **Dock on the left / right / at the bottom / at the top**, **Float in its own window**, **Help for this panel** and **Reset panel layout** (everything back where it started).

The tool bar docks the same way. Drag its **Tools** title out onto the page to float it (a floating tool bar moves by the same title). Drag it over an edge of the canvas to dock it there: the same **Dock left**, **Dock right**, **Dock at the bottom** and **Dock at the top** strips show, labelled for the tools, and the one you are over lights up.

Along the bottom or the top the tool bar becomes a strip across the page with its groups side by side (at the top it sits under the header, over the top panels). It is a bar, not a tab, so it can't join a panel's tabs (the drag says so over them). <kbd>Esc</kbd> while dragging leaves it floating where it is.

Right-click the tool bar for **Dock on the left**, **Dock on the right**, **Dock at the bottom**, **Dock at the top** or **Floating**. Saved workspaces remember where the tool bar was.

The layout is remembered in this browser. Whatever opens a panel for you (choosing a timeline, **Edit** on an interaction) shows it wherever it is, and the timeline's keyframing follows whether the Timeline panel is on screen.

## Preview
**Preview** runs the project exactly as the exported file will, from the start page or the one you're on (the dropdown at the top). **Restart** starts again, and <kbd>Esc</kbd> closes it. **Less motion** plays it as a viewer whose device asks for less motion sees it (calm timelines at their end, and with Respect reduced motion on, autoplay at its end and instant page changes), without changing your own computer; it's off each time Preview opens. Preview sits above everything else in the editor, the help drawer included, and keeps the keyboard focus until it closes; help asked for from inside it opens in a new window (see [Using this help](help)). The **Debug** panel (on by default) shows:

- **Now showing**: the page on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables (live)**: every value as it changes, starting with any saved user data or remembered progress the preview put back. Type a new value and press <kbd>Enter</kbd> (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too, and so are errors from script layers. With **Auto-scroll** ticked (the default) the list keeps the newest event in view; untick it to read back through earlier ones while the preview keeps running.

![The Preview with the Debug panel: live variables on the left and the Events list underneath.](help/preview-debug.png)

When the project reads [values on the link](course-context#values-on-the-link) (`link.program`, `ix.link.program`), the top bar has a field for each: pick or type a value and Preview starts again as if the link carried it. The project's own sample doesn't change.

When the project has [responsive pages](responsive), a **Page width** slider appears under the top bar. Drag it to resize the page the project runs in; the breakpoints are marked on the track and the player switches page as you cross them.

**View at embed size** shows it the way StudyDesk shows the embed code: no wider than 800 px, and exactly as tall as the project asks the page for, changing as it runs. A page with **Fit height to content** grows and shrinks here as it would in the course, and anything the embed would cut off or leave empty shows. Scroll the preview when it's taller than the window.

## See what ran
Press **Beside editor** in the Preview's header and Preview moves up to the right, leaving the canvas and the Interactions graph underneath showing. Then you can see what your clicks set off:

- Every node that runs lights up green, with the word *ran*.
- An event whose **Only if** said no goes grey (*held back*).
- The wires the flow followed pulse.
- A ring flashes round the layer your click landed on. It is green when the click started something and red when it started nothing.

When a click starts nothing, the Events list says why under **Why did nothing happen?**. Either nothing listens for a click on that layer, the click landed on empty space, or an **Only if** said no. Click an event's name in the list to select its node in the graph.

The lights are only in the editor. Exports and shared links never carry them, and with reduced motion on they hold still instead of pulsing. See [Interactions](interactions) for the graph.

## Big projects

The editor stays quick on large projects: a change only lays out again the pages it touched, even with auto layout on every page, and picking or dragging a node in a big Interactions graph only redraws that node. What slows a big project down most is how much is on screen at once, so fold away panels and pages you are not using, and zoom in on the page you are working on.

## Opening the editor

The editor draws its frames straight away and fills them in as your project arrives. Help, the starter templates, the code boxes, the Interactions graph and the Preview player are fetched the first time you use them, and the editor fetches the likely ones quietly a moment after opening, so they are usually there before you ask. On a slow connection the first use of one of them can show a short **Loading** line where it will appear.
