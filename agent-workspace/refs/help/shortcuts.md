# Keyboard shortcuts
Every keyboard shortcut in the editor, and how to change the keys to your own.

Press <kbd>?</kbd> (or <kbd>Ctrl</kbd>+<kbd>/</kbd>) anywhere to open the **Keyboard shortcuts** page of [Preferences](preferences). It lists every shortcut in plain words, grouped, with the part of the editor it works in. Press it again to close.

The tables below are the keys the editor starts with. On a Mac, <kbd>Ctrl</kbd> is <kbd>Cmd</kbd> and <kbd>Alt</kbd> is <kbd>Option</kbd>. The sheet, the tooltips, the menus and the [command palette](command-palette) all show **your** keys, if you have changed any.

## Every panel, tool and action can have a key
The sheet lists **everything** you can do in the editor, not only the commands that start with a key. That includes every tool, every panel (Open Layers, Open Timeline, Open Accessibility...), the windows (Preferences, Share, Export, Revision history), the layers you can add, the page commands, the animation presets, the interaction recipes, the question types, the workspaces and the export types.

Most of them start with **No key**. To give one a key:

1. Search for it. The search matches what the command does, not only its name.
2. Press **Set key**.
3. Press the keys you want.

**Only ones with a key** hides the rest when you only want a reminder of the keys you have. If a command depends on what you have picked, pressing its key with nothing picked tells you what to pick first (*Select one layer first*).

A few new commands do start with a key: <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> fits the page to the selected layers (below), <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> hides or shows the selected layers and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> locks or unlocks them. Zoom in, zoom out, zoom to the page, three more exports and several page and graph commands can be given keys too.

## Changing the keys
- Open the page with <kbd>?</kbd>, or **Preferences → Keyboard shortcuts**, or **Keyboard shortcuts** in the command palette.
- **Search** by what a command is called, or press **Find a key** and then the keys to see what they do.
- **Add key** (or **Set key** on a command with none) listens for the next keys you press; <kbd>Esc</kbd> cancels. The **×** beside a key takes it off. **Reset** puts that command back to its default; **Reset this page** (at the bottom of the window) does it for every key, back to the Default set.
- If another command in the same place already uses the keys you pressed, the sheet says which and asks whether to move it over. A key used twice shows a warning at the top; only the command earlier in the list works.
- The **Keyboard set** at the top picks a set of keys to begin with: *Default*, or *Illustration style* (shapes on the keys drawing programs usually use). Your own changes stay on top of whichever you pick, and you can keep them as a set of your own (see [Keyboard sets](shortcuts#keyboard-sets)).
- Your keys are saved with **you**, like your other preferences. They follow you between browsers and are never saved in a project. New default keys still reach you for anything you did not change.
- **One-key shortcuts** turns off every shortcut that is a single letter, number or Space (V, H, P, S, Space...). Shortcuts with <kbd>Ctrl</kbd> or <kbd>Alt</kbd>, and keys such as <kbd>Delete</kbd>, the arrows and <kbd>F2</kbd>, keep working, and the tool bar and menus do the same jobs. It is there for people who use speech input or press keys by accident.
- A one-key shortcut never fires while you are typing in a box.

## Keyboard sets
**Keyboard sets** are named collections of keys. Keep more than one and swap between them, for example one for drawing and one for animating. The **Keyboard set** box at the top of the page picks the set in use, and applies it the moment you pick:

![The set picker and its More menu.](help/keyboard-sets.png)

- **Default** and **Illustration style** are built in and never change. Change a key while one of them is picked and the box reads *Default (changed)*: your changes sit on top of it until you save them.
- **Save as…** keeps the keys in use under a name of your own and carries on with that set. From then on every key you change is kept in it. Sets are listed under **Mine** in the box, up to 16.
- **More** has **Rename…**, **Duplicate** (a copy to change without touching the first), **Delete…** (your keys go back to the Default set), **Export to a file**, **Share…** and **Import…**. Rename, Duplicate and Delete are for your own sets only.
- Switching away from keys you changed but did not save asks first, and offers to save them as a set.
- **Export to a file** saves a small `.keymap.json` file to keep or send.
- **Share…** gives a **share code** to copy and a **link**. Anyone signed in to the editor can paste the code into **Import…**, or open the link, and see the keys before they are added. The set travels inside the code and the link, so nothing is kept on a server, and what you share is a copy.
- **Import…** takes a share code, a link or the text of an exported file (or **Choose a file…**). It shows what it would do **before anything is added**: how many commands it gives keys to, any commands this editor does not have (left out), keys that are not keys (left out), and any key that two commands in the same place would share. It is always added as a new set, never over one of yours. Choose **Add and use it** or **Add, keep my keys**.

![Importing a set: what it would do, and the key two commands would share.](help/keyboard-sets-import.png)

Your sets, like your keys, are saved with you: they follow you between browsers and are never saved in a project.

## Keys you hold while dragging
A few commands are not a key you press but keys you **hold** while the mouse does something. They sit under **Guides** on the page, marked *While dragging a guide*: **Round a guide to the nearest 5 px** (<kbd>Ctrl</kbd>), **Round a guide to the nearest 10 px** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>) and **Make a new guide the other kind** (<kbd>Alt</kbd>). See [Rulers and guides](canvas#rulers-and-guides).

To change one, press **Add key** (or **Set key**) and then **hold** the keys you want, <kbd>Ctrl</kbd>, <kbd>Shift</kbd> and <kbd>Alt</kbd> in any mix, and let go. The most you held together is taken. They are at-least keys: with Ctrl held for 5 and Ctrl+Shift held for 10, holding both Ctrl and Shift gives 10, because it asks for more. If you give a hold keys that another hold already has, the page asks, as it does for any key.

## Where a key works
The same letter can mean different things in different places, because a key looks first at the panel you last clicked in. Click in the Timeline and <kbd>P</kbd>, <kbd>S</kbd>, <kbd>R</kbd>, <kbd>T</kbd> and <kbd>A</kbd> take you to a property (see [Timeline](shortcuts#timeline)). Click the canvas, the Layers list or anywhere else and they are tools again.

## Changed keys
- <kbd>?</kbd> now opens this sheet. Help for the selection is <kbd>Shift</kbd>+<kbd>F1</kbd>.
- <kbd>Shift</kbd>+letter no longer picks a tool.
- <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>Shift</kbd>+arrow no longer nudges by 10. <kbd>Shift</kbd>+arrow does. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+arrow nudges by 1 and ignores the grid.

## Tools
| Key | Tool |
|---|---|
| <kbd>V</kbd> | Select |
| <kbd>H</kbd> | Hand (or hold <kbd>Space</kbd>) |
| <kbd>A</kbd> | Page |
| <kbd>F</kbd> | Frame |
| <kbd>R</kbd> | Rectangle |
| <kbd>O</kbd> | Ellipse |
| <kbd>L</kbd> | Line |
| <kbd>P</kbd> | Pen |
| <kbd>N</kbd> | Pencil (freehand) |
| <kbd>K</kbd> | Connector (drag from one layer to another; see [Connectors](connectors)) |
| <kbd>W</kbd> | Bend (drag an edge into a curve) |
| <kbd>T</kbd> | Text |
| <kbd>B</kbd> | Button |
| <kbd>C</kbd> | Comment (pin a review note where you click) |
| <kbd>S</kbd> | Note (draw a sticky note for the people editing; players never see it, see [Notes](notes)) |

## Editing
| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy / cut / paste (pasting image files inserts them). After clicking in the timeline they copy and paste the selected keys, see [Copy, snap and stagger keys](timelines#copy-snap-and-stagger-keys) |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate. A copy of a layer brings its interactions, pointed at the copy. See [Copying a layer with what it does](interactions#copying-a-layer-with-what-it-does) |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> | Duplicate layer only, without its interactions |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all on the page |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection (or the selected keyframes) |
| Arrow keys (<kbd>Shift</kbd> for 10px) | Nudge. With Snap to grid on they step to the next grid line instead (<kbd>Shift</kbd>: a stronger line). <kbd>Ctrl</kbd> + arrow nudges by 1px and ignores the grid |
| <kbd>Alt</kbd>+arrow keys | Move the selected layer in the Layers list: up or down past a neighbour, right into the group above, left out of its group |
| <kbd>]</kbd> / <kbd>[</kbd> | Bring forward / send backward (<kbd>Ctrl</kbd> for front / back) |
| <kbd>Enter</kbd> | Go into a group or frame, edit a path's points, or edit text |
| <kbd>Escape</kbd> | Stop editing, go up a level, clear the selection, then back to Select |
| <kbd>I</kbd> | **Insert a component here…**: pick a page (a component) to place on the open page |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | **Fit page to selection**: the open page shrinks (or grows) to the selected layers, which stay where they were on the canvas. One undo step. **Fit page to selection with space around…** and **Fit page to its layers** are in the command palette and the right-click menus, with no key until you give them one |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> | Hide or show / lock or unlock the selected layers |
| <kbd>F2</kbd> | Rename the selected layer in the Layers list |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save now |

## Safer Delete
- Deleting a layer with the keyboard tells you what went (*Deleted Blend ball.*) with an **Undo** button.
- Deleting a page from the keyboard asks first.
- After you click in the Interactions graph, keys always go to the graph. <kbd>Delete</kbd> removes the selected node and never the layer.

A message after a big change also carries an **Undo** button. See [Messages at the bottom](dialogs#messages-at-the-bottom).

## View
| Key | Does |
|---|---|
| <kbd>Shift</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to selection (the whole page when nothing is selected). **Zoom to the open page**, **Zoom in** and **Zoom out** have no key until you give them one |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |
| <kbd>Shift</kbd>+<kbd>R</kbd> | Show or hide rulers |
| <kbd>Shift</kbd>+<kbd>G</kbd> | Show or hide the grid |
| <kbd>Ctrl</kbd>+<kbd>'</kbd> | Turn the Grid snap target on or off (it switches snapping on too, if it was off) |

## Timeline
These work after you click in the Timeline. See [Timelines and keyframes](timelines) for what the Timeline does.

| Key | Does |
|---|---|
| <kbd>Space</kbd> or <kbd>K</kbd> | Play or pause the Timeline |
| <kbd>L</kbd> | Play |
| <kbd>J</kbd> or <kbd>Home</kbd> / <kbd>End</kbd> | Go to the start / the end |
| <kbd>,</kbd> / <kbd>.</kbd> | Step back / forward one frame (on the timeline's frame rate, 30 per second if it has none) |
| <kbd>Shift</kbd>+<kbd>L</kbd> | Show or hide the list of this page's timelines beside the Timeline |
| <kbd>Shift</kbd>+<kbd>,</kbd> / <kbd>Shift</kbd>+<kbd>.</kbd> | Jump to the previous / next key of the selected layers (of every layer when none is selected) |
| <kbd>P</kbd> / <kbd>S</kbd> / <kbd>R</kbd> / <kbd>T</kbd> / <kbd>A</kbd> | Go to the selected layer's **P**osition, **S**cale, **R**otation, opacity (**T**ransparency) or **A**nchor point: the Properties panel opens that field and focuses it, and the Timeline track for it, if the layer has one, is marked |

## Properties
| Key | Does |
|---|---|
| <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd> | Go to the property search box (it is the **/** in the box) |
| <kbd>Alt</kbd>+<kbd>Up</kbd> / <kbd>Alt</kbd>+<kbd>Down</kbd> on a section's title | Move that section up or down the Properties panel. See [Moving sections](properties-panel#moving-sections) |
| <kbd>Alt</kbd>+arrow keys on a tool bar group's name or a tool | Move it earlier or later on the tool bar. See [The editor at a glance](interface#putting-the-tools-in-your-own-order) |

## Help
| Key | Does |
|---|---|
| <kbd>?</kbd> or <kbd>Ctrl</kbd>+<kbd>/</kbd> | This sheet of keyboard shortcuts |
| <kbd>F1</kbd> | Search the help (<kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to open) |
| <kbd>Shift</kbd>+<kbd>F1</kbd> | Open the help for what you have selected (the same as the **Help** button); press it again to close |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>Cmd</kbd>+<kbd>K</kbd> on a Mac) | The [command palette](command-palette): type what you want to do (add a button, go to a page, turn the grid on, share) and press <kbd>Enter</kbd>. Matching help pages are listed under the commands. While editing text it is the link shortcut instead |
| <kbd>Alt</kbd>+<kbd>Left</kbd> / <kbd>Alt</kbd>+<kbd>Right</kbd> | Back and forward through the pages you have read, in the help drawer |

## Text
Double-click a text layer to edit it. Select some of the text, then:

| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Bold / italic / underline the selection |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | Strikethrough |
| <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Finish editing |

(Use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd> on a Mac.)

## Interactions, dialogs and Preview
| Key | Does |
|---|---|
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | Delete the selected node or connection in the graph. After you click in the graph this is always the graph's, never the selected layer's |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate the selected node |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> / <kbd>Ctrl</kbd>+<kbd>G</kbd> | Select everything in the graph / group the picked nodes |
| <kbd>/</kbd> | Go to the node search |
| <kbd>Alt</kbd>+<kbd>Up</kbd> / <kbd>Down</kbd> (or <kbd>Ctrl</kbd>+<kbd>[</kbd> / <kbd>]</kbd>) | The previous / next page's graph |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy, cut or paste the selected node in the graph (it pastes into another page's graph too) |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> | Accept / cancel a [dialog](dialogs) |
| <kbd>Esc</kbd> | Close the Preview, Preferences or any open box |

## Mouse
| Do this | To |
|---|---|
| Menu key or <kbd>Shift</kbd>+<kbd>F10</kbd> on a key in the Timeline | Open its right-click menu (a text key has **Swap text**) |
| Hold <kbd>Alt</kbd> while drawing or resizing | Work from the centre |
| Hold <kbd>Ctrl</kbd> while dragging | Move, resize or draw without snapping to anything (grid, artboard, layers, guides, spacing, points) |
| Hold <kbd>Ctrl</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd> while dragging a guide | Round it to the nearest 5 px, or the nearest 10 px (rebindable under **Guides**, see [Rulers and guides](canvas#rulers-and-guides)) |
| Click the Snap button on the tool bar | Open the snapping menu: the switch and a tick for each target |
| Right-click the grid or snap button on the tool bar, or an empty part of the canvas | Snapping choices, the grid size and how often a stronger line shows |
| Drag the **Tools** title over an edge of the canvas | Dock the tool bar there (left, right or a strip along the bottom or the top) |
| Hold <kbd>Alt</kbd> (<kbd>Option</kbd> on a Mac) and drag a layer, a group, a page, a page group or a row in the Layers list | Drag a copy of it. The original stays put and the pointer shows a copy cursor. In the Layers list, drop the copy where the line is. The first few plain drags say "Alt: drag a copy"; **Always show the Alt-drag hint** in [Preferences](preferences) shows it on every drag |
| <kbd>Alt</kbd>-click a path point | Switch it between curve and corner |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>-click a layer | Add it to the selection, or take it out (it picks the deepest layer inside groups, so you can gather layers from different groups) |
| <kbd>Shift</kbd>-click a layer in the Layers list | Select every layer between the one you last clicked and this one. <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>-click toggles one layer, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>-click adds a range, and <kbd>Shift</kbd>+<kbd>Up</kbd> / <kbd>Down</kbd> extend the pick a row at a time |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>-click a node in the Interactions graph | Add it to the selection, or take it out |
| Double-click a group | Select inside it |

While dragging: <kbd>Shift</kbd> keeps proportions or snaps angles, <kbd>Alt</kbd> resizes from the centre. In number fields, drag the label to scrub (<kbd>Shift</kbd> ×10, <kbd>Alt</kbd> ×0.1), use arrow keys to step, or type sums like `100/2`.
