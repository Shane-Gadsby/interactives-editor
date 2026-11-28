# Notes
Sticky notes for the people making a project: draw them on the canvas, attach them to a layer, and know that players, exports and share links never see them.

A **note** is a small sticky note you leave on the canvas for whoever edits the project next, including you next week: "swap this photo before release", "this branch is for the hard version", "change the three red words". Templates use them to explain what each part is for.

The interaction graph has notes too: see **Notes on the graph** in [Interactions](interactions). They are the same notes, hide with the same eye button, and never reach players either.

Notes are not comments. [Review comments](comments) are threaded conversations with reviewers, kept on the server beside the project. A note is part of the project document, so it comes along when the project is copied, saved as a template or remixed, and everyone editing at the same moment sees it appear. It is **never** a layer: it is not in the Layers list, the interactions graph, auto layout or bindings.

## Players never see notes
A note is never drawn when the project is played, in **Preview**, in the **Single HTML file**, a **share link**, a **Link for StudyDesk**, an embed, the review page, or a **PNG**, **SVG**, **Lottie** or **GIF** picture of a page. The text is also taken out of the project data those pages carry, and the server takes it out again when a page is shared, so it is not in anything that plays. The **project package (.ixp)** and the **project JSON** are for editing, so they keep notes.

## Add a note
Pick the **Note** tool (<kbd>S</kbd>, in the tools bar next to **Comment**) and click, or drag out the size you want. A note drawn on a page belongs to that page and moves with it (it can hang outside the page's edge). A note drawn on empty canvas belongs to the canvas itself. Type straight away; <kbd>Esc</kbd> or a click elsewhere finishes, and a note left empty goes away.

- **Move** it by dragging it, **resize** it from its bottom right corner.
- **Double-click** it, or press <kbd>Enter</kbd> with it focused, to change the text.
- With a note picked, a small bar above it sets the **colour** (yellow, orange, green, blue, purple or pink), **attaches** it to the layer you have selected on the same page, and **deletes** it. <kbd>Delete</kbd> removes a picked note too.
- **Right-click** a note for its own menu: **Edit text**, **Add a title** (or **Rename**), **Colour**, following the selected layer, and **Delete note**. Right-clicking inside the text while you type still gives the browser's menu, for spelling and paste.
- **A title**: the bar across the top of a note says who wrote it until you give it a title. Double-click the bar (or use **Add a title** in the menu), type, and press <kbd>Enter</kbd>. <kbd>Esc</kbd> leaves it as it was, and emptying it goes back to the author's name. Graph notes take a title the same way.
- Notes are small on purpose. They grow with the zoom but never get tiny or huge, and a picked note has a gold outline.

Keyboard: <kbd>Tab</kbd> reaches every note on the canvas. With one focused, the arrow keys move it (<kbd>Shift</kbd> for 10), <kbd>Alt</kbd>+arrows resize it, <kbd>Enter</kbd> edits it, <kbd>Delete</kbd> removes it and <kbd>Esc</kbd> lets go. Every button on the bar has a label for a screen reader.

## Attach a note to a layer
Select a layer, pick a note on the same page and press **Attach to the selected layer**. The note now follows that layer when it moves, scales or rotates, and its header says which layer it is on. Dragging the note changes how far it sits from the layer. Delete the layer and the note stays where it was (its outline turns dashed). **Detach** lets go. Canvas notes cannot be attached.

## What a note can say
Plain text with a little markdown:

| Write | Shows |
|---|---|
| `**bold**`, `*italic*`, `code` | **bold**, *italic*, `code` |
| `- an item` | a bullet |
| `[ ] a task` and `[x] a done task` | a tick box you can click on the canvas, which rewrites the text. A `[ ]` partway through a line shows as a box too |

Code can sit inside **bold** too. Nothing in a note is ever treated as markup.

## Show and hide notes
The eye button beside the **Note** tool shows or hides every note on your canvas, and its badge counts them. It is your own preference (also under **Preferences > Show notes on the canvas**), so putting a template's explanations away changes nothing for anyone else. Notes are never drawn while you Preview.

## Notes in starters and examples
Every starter's pages and interaction graphs carry short notes. They say what each chain of nodes does, why it is built that way and what to change. The examples' bigger graphs and pages carry a note or two saying what to look at. Hide them with the eye button once you have read them. They come with your copy of the project like any other note.

## Notes and templates
A project made from a template starts with the template's notes, so the explanations arrive on the canvas next to the parts they are about. **Save as template** keeps your notes. **Update from template** leaves your notes alone. Hide them with the eye button once you have read them, or delete them.

## Working together and undo
Adding, typing in, moving, recolouring and deleting a note are ordinary edits: they undo with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, save with the project, and appear live for the other people in the project (and for an AI agent, which can list, add, edit and remove notes).
