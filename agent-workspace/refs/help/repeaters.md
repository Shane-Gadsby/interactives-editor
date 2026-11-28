# Repeated lists
Copy a layer once per item in a list, with item and index in scope.

A **repeater** copies one layout once for each item in a list: a row for every product, a card for every question. Add an item to the list and a new copy appears.

## Turn it on
Select a group or frame and, in its **Repeat (list)** section, tick **Repeat the first child for each item**. Its **first child** is then copied once per item in **Items**. **Repeat for each** is where the items come from. Pick one of:

- a **List** [variable](variables), so the items are the table in the Variables tab,
- a [data source](data-sources),
- **Type my own items**, which opens the same table right here, with a row for each copy and a column for each thing it holds. Nothing else needs to exist: the items live on this layer. Inside the copies use `{item.text}` for a column called *text*, or `{item}` for a plain list of words or numbers,
- **A formula (advanced)**, an expression that gives a list, like `products.filter(p => p.inStock)` or `[1, 2, 3]`. A list that is already a name or typed table is shown as one of the choices above.

![A repeater's Repeat (list) section: the first child ticked, Repeat for each set to A formula (advanced) with tips.cards in Items and currently 4 items under it, Layout Grid, Gap 16, Cols 2, Fill order Rows first and Selection None.](help/concept-repeaters-items.png)

The repeater redraws when the list changes, so a *Change a value or counter* node that adds to the list adds a row.

Inside the copies, `item` is the current item and `index` is its position, counting from 0: `{index + 1}. {item.name} - {item.price}`. In a text or button label inside the copies, **Insert value** lists the item's fields (read from the first item) so you can pick one instead of typing it.

## Layout
**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best).

A grid has a **Fill** direction. *Rows first* goes across each row and then down (1 2 3 / 4 5 6 / 7). *Columns first* goes down each column and then across (1 4 7 / 2 5 / 3 6). **Cols** is still the number of columns.

## Text in the copies sizes itself
A text layer in the template set to *Auto height* or *Auto width* is measured in every copy, with the item's own words, the font and the width it has there. A long item gets a tall row and a short one a short row. Frames that hug their content (an [auto layout](auto-layout) repeater, or a card with its own layout) follow, on a page and inside a dialog, tooltip or other overlay alike. You don't need to guess a height from the number of characters.

A height or width you bind on the template layer still wins. Only copies whose text changed are measured again.

## Instances in a repeater
Instances in a repeater can take their [inputs](instances) from the item. Select the instance, open *Bindings*, add *Input <name>* and write an expression such as `item.title` or `item.score * 10`. Every copy then shows its own item's values, and follows the list when it changes.

## A list in a list
A repeater can go inside the copy of another one: groups that hold cards, a table's rows and their cells, a board's columns. Give the outer list items that have a list in them (`{name: "Fruit", cards: ["apple", "pear"]}`) and set the inner repeater's **Repeat for each** to `item.cards`. Each group then draws its own cards.

Inside the inner copies, `item` and `index` are the card and its place in its group, and `outer.item` and `outer.index` are the group. So a card can say `{outer.item.name}: {item}`. A click on a card gives its own place in its group as `event.index`.

## Dragging the copies
Tick **Reorder by dragging** and people can drag a copy to another place in the list: the others make room, and the list variable changes, so the new order is kept like any other value. From the keyboard, Space picks a copy up, the arrow keys move it and Space puts it down (Escape puts everything back).

To drag copies from one list into another, give the first a **Tag** (`cards`) and the second **Takes items from** `cards`. Two separate list variables trade items. For a card sort, keep one list of cards and show it twice: a pool repeating `cards.filter(c => !c.group)` and, inside a list of groups, `cards.filter(c => c.group == outer.item.name)`. Set **Items are in** to `cards` on both, **A drop writes field** `group`, and **To** `outer.item.name` on the groups (`""` on the pool). Dropping a card in a group writes the group's name into it, and both repeaters redraw from the one list.

**On list drop** runs after a move, with `event.item`, `event.from`, `event.to` and `event.index`.

## Long lists, and lists that load
**At a time** shows so many copies at once: as **Load more**, which adds the next lot below, or as **Pages** with Next and Previous. **Add Load more and a count** (or **Add Next, Previous and a count**) puts the buttons inside the list, already wired, with a line that says how many there are. Each button hides itself when it has nothing to do.

The layers round the copies can say where the list is at: `{list.total}`, `{list.shown}`, `{list.from}`, `{list.to}`, `{list.page}` and `{list.pages}`. Say how many there are: a list that is cut off without saying so looks finished.

**Add loading, empty and fault looks** puts three texts in the list: one shown while its data loads, one when it's empty, and one when its data couldn't be loaded. Change their words and their look as you like. A list knows its data is loading or failed when its **Repeat for each** names a data source; `dataStatus.cards` says the same in any formula.

## A tree that folds
Tick **Show as a tree** and the list is drawn as an outline. Each item names its parent in the **Parent field** (`parent`), by the parent's **Id field** (`id`); items with no parent are the top level. A branch opens and closes with a click, **Enter** or **Space**, and the arrow keys move round it the way the W3C tree view pattern has them: **Right** opens a branch or goes into it, **Left** closes it or goes up to its parent, **Up**, **Down**, **Home** and **End** move between the rows. A screen reader hears a tree, with each item's level and whether it's open.

In the copies, `depth`, `hasChildren` and `isOpen` say where each one is, for a chevron that turns (`isOpen ? 90 : 0`) or a line. **Open branches in** keeps the open ones in a list variable, to save or set. A course outline, a file list and a tree test are all one list with a parent field.

## Selection
Set **Selection** under the repeater to let people pick copies without any nodes:

- **One at a time** keeps one pick: choosing a copy un-chooses the others (a choose-one picker, tabs, the open section of an accordion). The variable it writes holds the copy's number from 0, or -1 for none. Tick **Click again to clear** and a second click on the picked copy picks nothing.
- **Several** switches each copy on and off (flip cards, a tick-list). The variable it writes is a *List* of the numbers picked.

![The Repeat (list) section with Selection set to Several and Remember the pick in set to flipped, and the line In the copies, isSelected is true for a picked one.](help/concept-repeaters-selection.png)

When you choose one, a box asks for a name for the variable (it suggests `selectedIndex` or `selectedItems`); you can pick another variable of the right kind later in **Remember the pick in**. It is an ordinary variable: read it in formulas and bindings, put it back to the start with *Put values back to the start*, or change it from a node.

Inside the copies, `isSelected` is true for a picked copy, so a binding on Fill colour can be `isSelected ? "#ffffff" : "#1f3a68"`. If the items are records, `item.selected` says the same. **By value** offers `isSelected` as something to base a table on, with a row for true and one for false. Outside the copies, `index == selectedIndex` or `selectedItems.includes(index)` do the same job.

A click, <kbd>Enter</kbd> or <kbd>Space</kbd> on a copy picks it, and the arrow keys, <kbd>Home</kbd> and <kbd>End</kbd> move between the copies. The copies are radio buttons (one) or checkboxes (several) and say whether they are checked to a screen reader, and the repeater is a radio group for one. If the layer you repeat already has its own **Role** or **Checked** setting, that is kept. The click is also an ordinary click, so a **When clicked or hovered** event on the same layer still runs, after the pick is written.

## Clicks and the keyboard
Clicks on a copy fire **When clicked or hovered** for the template layer with `event.index`, so `products[event.index]` is the item that was clicked. For keeping track of which were clicked, **Selection** above does it for you.

For lists a keyboard user moves through, tick **Keyboard navigation** under the repeater. One copy is the Tab stop and the arrow keys move between the rest (see [Accessibility](accessibility#keyboard-navigation)).
