# Dialogs and confirmations
The editor asks in its own dialogs, not the browser's pop-ups: what they look like, which keys work, and when you will see one.

Whenever the editor needs an answer from you, it shows a dialog on top of the page. They look the same everywhere and work with the keyboard.

![A confirmation dialog.](help/move-to-artboard.png)

## How they work
- The **dialog** dims the page behind it. Nothing else can be clicked until you answer.
- <kbd>Enter</kbd> presses the main button. <kbd>Esc</kbd> cancels. <kbd>Tab</kbd> moves between the buttons and stays inside the dialog.
- A **red** main button, such as **Delete project**, means the action destroys something. Read the message first.
- Some dialogs have a text box, such as **New folder**. It is selected for you, so you can type straight away. If a name isn't allowed, a message under the box says why.
- Dialogs queue up: if two are needed, you get one after the other.
- None of them are the browser's own pop-ups, so they aren't blocked and they keep the editor's look.

## Where you'll see them
| Dialog | When |
|---|---|
| **Delete project**, **Delete folder** | On the projects page: move a project to the Bin (restorable for 30 days) or delete a folder (its projects are kept) |
| **New folder**, **Rename folder** | Moving a project to **New folder…**, or renaming with the pencil |
| **Move to page** | You dropped layers over a different page. See [Layers](layers-panel#moving-layers-to-another-artboard) |
| **Delete asset**, **Delete N assets**, **Remove unused assets** | Deleting from the [Assets panel](assets) or the [Usage](usage) tab. They list the files and warn about any still in use |
| **Delete timeline**, **Delete script** | The bin beside a timeline or script |
| **New variable** | Choosing **+ Create new variable…** in a node's settings |
| **Restore version** | Restoring from the [revision history](live-editing#revision-history) |
| **Turn off share link** | Stopping a [share link](export#share-link) |

## Messages at the bottom
Not everything asks. When something small happens, a message appears at the bottom of the editor and goes away by itself. An ordinary one stays for a few seconds, and an error (such as **Not saved**) for a little longer.

A message about a big change has an **Undo** button: tidying the pages, linking colours to tokens, deleting a page, moving layers to another page, replacing a file, importing a file, changing the colourway, applying accessibility fixes, or updating from a template.

- The button takes back exactly that change, even if it took several steps. Then the message says **Undone** with a **Redo** button.
- The moment you change anything else, the button greys out, so it can never take back something you did afterwards. <kbd>Ctrl</kbd>+<kbd>Z</kbd> still undoes the latest change as always.
- A message with an **Undo** button stays for nine seconds, whatever else you do.
- While a dialog such as Preferences is open, the message sits underneath it so it never covers the dialog. Errors still show on top.

Deleting with the keyboard works the same way: the message says what went (*Deleted Blend ball.*) with an **Undo** button. See [Keyboard shortcuts](shortcuts#safer-delete).
