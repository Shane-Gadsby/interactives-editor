# Preferences
Your own editor settings in one window, in pages: look, canvas and snapping, timeline, interactions, fonts, accessibility, keyboard shortcuts and sets of keys, and your workspace.

![The Preferences window, on the General page: Appearance, Help and hints, Notifications and a Tutorials section with Tutorial badges and cheers, Soft chime with the cheers and Reset tutorial progress.](help/preferences.png)

Preferences are your own settings for the editor. Open **Preferences** from the gear in the top bar (or on the projects page), or press <kbd>?</kbd> to go straight to the **Keyboard shortcuts** page.

It is one window with a list of **pages** down the left and the settings of one page on the right. Your settings are saved with your account, so they follow you to any browser you sign in on.

The small **(i)** icon in the title bar shows the version of Ixia you are running when you hover it (for example `Version 0.5.0 · build 1a2b3c4.5d6e7f8`: the release, then the editor build and the player build), and copies it when you click it. Put it in every problem report. The same icon is beside **Help** on the help and projects pages.

## Using the window
- **Changes apply at once.** There is no OK and no Cancel: tick a box and the editor changes. <kbd>Esc</kbd> or the **×** closes the window.
- **Search all preferences** (the box across the title bar) finds a setting on any page by its name, by what it does or by another word for it (try *dark*, *alt text*, *pan*, *typeface*). Pick a result, or press <kbd>Enter</kbd> for the first, and the window goes to that page, scrolls to the setting, marks it for a moment and puts focus on it. When shortcuts match too, the last result opens the Keyboard shortcuts page with your search filled in. <kbd>Esc</kbd> clears the search first.
- **Reset this page** puts every setting on the page you are looking at back to how the editor starts (it asks first, and is greyed out when the page is already as it starts). **Reset everything** does it for every page, and puts your keys back to the Default set. The keyboard sets and workspace layouts you saved stay, and so do your projects.
- Drag the corner of the window to make it bigger or smaller (double-click the corner to put it back). On a phone or a narrow window it fills the screen and the pages become a row of tabs along the top.
- With the keyboard: <kbd>Tab</kbd> goes into the list of pages, <kbd>↑</kbd> and <kbd>↓</kbd> (<kbd>←</kbd> and <kbd>→</kbd> in the narrow row) move between pages, <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last, and <kbd>Tab</kbd> again goes to the settings. A screen reader hears a list of tabs, one panel, and each field with its name. The editor's own keys stand down while the window is open.

## General
- **Theme**: *Dark*, *Light*, or *Auto (follow the system)*. Both are made from the StudyDesk palette, the same colours as the rest of the Toolbox: its greys and UniSQ gold. Gold is every chosen thing (the open tab, a selected row, a ticked option, a selected layer on the canvas) and every keyboard focus ring, so wherever you are the ring is the same gold with a thin dark edge that keeps it visible on white panels, gold rows and dark ones. Links are underlined: dark text in the light theme, gold in the dark one.
  - In Light, the palette's grey for secondary text is a little under the usual contrast guideline (4.4:1 on panels and 4.1:1 on the background, against 4.5:1). It is left as the palette has it so the editor matches the Toolbox.
- **Code editor colours**: *Follow the editor* (the default), *Light* or *Dark*. It sets the colours of every code box: the **Scripts** tab, the raw text of a data file, and the HTML and code fields in the Properties panel.
  - *Follow the editor* draws code light when the editor is light (or Auto on a light system) and dark when it is dark, and switches the moment the theme does.
  - *Light* or *Dark* keeps the code that way whatever the editor does, so you can have a dark editor with light code or the other way round. The light colours are all at least 4.5:1 on their background.
  - The same choice is a **Code colours** switch (**Follow**, **Light**, **Dark**) in the header of the Scripts tab and of a data file's raw text, so you can change it where you are typing.
  - It is yours, not the project's: nobody else sees it, and it follows you between browsers.
- **Show tooltips**: explanations when you hover buttons and fields.
- **Getting started strip**: the five jobs along the top of the editor that tick themselves. On until you put it away or tick all five; turning it on again brings it back (with the ticks kept, or cleared if all five were done). See [Your first five minutes](welcome#your-first-five-minutes).
- **Tutorial badges and cheers**: on by default. Gives every tutorial a tick box on each step, a short line when you tick one, a badge card (with a quick burst of confetti) when you finish a whole tutorial or a set of them, and your progress on the **Tutorials** button on the projects page. Turn it off and all of that goes: no tick boxes, no badges, no cheers, no progress marks, no self-ticking steps and no **Show me** buttons. What you had ticked is kept, and comes back if you turn it on again. If your system is set to reduce motion, the badge card is still and there is no confetti. See [Tutorials, badges and progress](help#tutorials-badges-and-progress).
- **Soft chime with the cheers**: off by default. Nothing in the editor makes a sound unless you ask. Tick it for a short, quiet chime with the cheers. It is greyed out while the badges and cheers are off.
- **Reset tutorial progress**: after you press it and say yes, every tutorial goes back to not started: the steps you ticked, the finished marks and every badge are cleared. It is greyed out when nothing has been started, it asks first, and it cannot be undone. It leaves the two switches above as they are, and **Reset this page** and **Reset everything** do not touch your progress.
- **Always show the Alt-drag hint**: off by default. Dragging a layer, a page, a page group or a row in Layers says "Alt: drag a copy" for your first three drags, then goes quiet. Tick this to see it on every drag. See [Alt-drag](shortcuts#mouse).
- **Comment notices**: a bell on the projects page, and a message while a project is open, when a review comment is handed to you, mentions you or gets a reply in a conversation you are in.

## Canvas and guides
- **Mouse wheel**: *Zoom (Shift+wheel pans)* or *Pan (Ctrl+wheel zooms)*. See [Moving around the canvas](canvas).
- **Canvas**: **Show rulers** (rulers and guides on the canvas, also <kbd>Shift</kbd>+<kbd>R</kbd>), **Attach new guides to the page they're dropped on** (off: new guides are universal, fixed on the canvas), **Show grid** (<kbd>Shift</kbd>+<kbd>G</kbd>), **Snapping** and a switch for each target (**Snap to grid** is <kbd>Ctrl</kbd>+<kbd>'</kbd>; the others are artboard, layers, guides, spacing, pixels and points), **Layers: all, not just siblings**, **Snap distance**, **Grid size** (1 to 512 px, with presets under it) and **Stronger line every** (cells, 1 to 32). See [The grid and snapping](grid). These follow you with your account like the rest.
- **Show layers outside clipped artboards**: on by default. When a page has **Clip content to page** on, the parts of layers that hang outside it are drawn faintly, in diagonal stripes, beside it on the canvas. You can still see them and click them to select. It only changes how the canvas looks: Preview and exports still clip. Switch it off if the faint shapes get in the way.
- **Show notes on the canvas**: the sticky notes authors leave, including the explanations a template comes with. Players, Preview and exports never show them.

## Timeline
- **Show the list of timelines** (the column beside the Timeline), **Fold Sound and captions when empty**, and **Show the Sound lane**, **Show the Captions lane** and **Show the Descriptions lane**. The Timeline's own **View** menu has the same switches. See [Timelines](timelines).

## Interactions
- **Technical wording**: off by default. The interaction nodes and their choices read as what happens (*When clicked or hovered*, *Change a value or counter*, *Flip on or off*). Turn it on to see the names they have in the file (*On pointer*, *Set variable*, *Toggle (boolean)*), which is what an agent or a script sees. Search and help find either name whichever is showing. Pages are called artboards in the advanced settings.
- **Show new interactions in the graph**: on by default. After you add one with **+ When clicked…** (or **When hovered…**, an empty event, or **When the playhead reaches this…**), the Interactions tab opens and zooms to the new nodes. They are picked and glow for a moment, and keyboard focus goes to the new event, so Delete and the arrows act on the graph. Nothing moves for undo, redo, someone else's live edit or an agent.
  - Turn it off if you build only from the Properties panel and want the view left alone. The new nodes are then only picked in the graph.
  - See [Interactions](interactions).

## Text and fonts
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. It is Open Sans unless you change it. Click the box and type to search every Google font (the chips narrow it by Sans, Serif, Display, Handwriting or Mono), then pick one with <kbd>Enter</kbd> or a click; <kbd>Esc</kbd> closes the list. A name that isn't on the list can be used as typed. It applies to projects and text you make from now on, not to ones that exist.

## Accessibility
- **Accessibility features**: on by default. Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements while you Preview (and in the exports you make, which always keep them on). Switch it off to check whether a problem comes from it. See [Accessibility](accessibility).
- **Ask what a picture shows**: on by default. When you add a picture or video, a small box at the top of its settings asks what it shows. See [Describing a picture as you add it](accessibility#describing-a-picture-as-you-add-it). Switch it off if you add a lot of pictures at once.
- **Screen reader strip**: off by default. A strip under Preview that shows what a screen reader would be told by Announce nodes, as it is spoken. It only shows while Accessibility features is on. The same switch is in the Preview header, next to Accessibility.

## Keyboard shortcuts
The whole shortcuts sheet is this page: a **Keyboard set** picker at the top (see [Keyboard shortcuts](shortcuts#keyboard-sets)), **One-key shortcuts** (switches off every shortcut that is a single letter, number or Space), and then every command with its keys, to search and change. The <kbd>?</kbd> key and **Keyboard shortcuts** in the command palette open the window on this page. See [Keyboard shortcuts](shortcuts).

![The Keyboard shortcuts page.](help/preferences-keys.png)

## Workspace
*(In the editor only.)*
- **Panel layouts**: switch every panel's place in one go. **Standard** is where everything starts; **Essentials** puts away every panel and tool group a first project does not need (see [Your first five minutes](welcome#your-first-five-minutes)); **Animate** has a tall timeline; **Interactions** has a big interaction graph with Variables and Scripts beside the properties; **Big canvas** puts all the panels in one column on the right and folds the bottom away; **Review** opens Comments and the accessibility checker. **Save current layout as…** keeps the way you've arranged things (see [Arranging the panels](interface#arranging-the-panels)) under a name of your own, up to 12, with rename and delete beside each. Saved workspaces follow you to any browser you sign in on.
- **Section and tool order**: **Reset section and tool order** puts the Properties panel's sections and the tool bar's groups and tools back in the editor's own order, after you have dragged them about. See [Moving sections](properties-panel#moving-sections).

## Not in Preferences
- **What the editor records** has no setting. See [What the editor records](what-is-recorded).
- **Project-wide settings** (start page, fit, sandbox) are in the Properties panel with nothing selected. See [Project settings](project-settings).
