# Drag and drop
Layers people can drag, drop zones that take them, and the same thing by keyboard and by tapping: sorting, matching, labelling and small games.

Any layer can be made **draggable**, and any layer can be a **drop zone** that takes some of the draggable layers. That is all a sorting activity, a matching exercise, a labelled diagram or a jigsaw needs, and it works with a mouse, a finger, a pen, the keyboard and a screen reader.

## A worked example: sort the animals
Two buckets, four cards. Dropping a card in the right bucket keeps it there; dropping it in the wrong one sends it back.

1. Draw two rectangles and name them **Mammals** and **Birds**. Put a text label on each.
2. Select **Mammals**. In the **Drop zone** section of the inspector press **+**. Set **Takes tags** to `mammal`. Do the same for **Birds** with the tag `bird`.
3. Draw four cards (a rectangle with some text, grouped): *Dog*, *Cat*, *Eagle*, *Owl*. They must be **above** the buckets in the layers list, or the buckets would cover them.
4. Select a card. In the **Draggable** section press **+**. Put its tag in **Tags** (`mammal` for Dog and Cat, `bird` for the others). Set **Dropped off a zone** to *Goes back to where it started*. Select all four to set that once.
5. Open **Preview**. Drag a card into a bucket. The **Hit areas** button outlines every draggable layer (blue) and drop zone (green, with what it takes and how full it is) while you work out why a drop did not land.
6. Give feedback in **Interactions**: a **When dropped** event with **Result** *Taken by the zone* → **Announce** `event.layer + " is a " + event.zone`, and one with *Refused by the zone* → **Announce** `"Not that one. Try again"`.
7. Score it. On the first card pick a **Zone variable** (a text variable): it always holds the name of the bucket the card is in, or nothing. A zone's **Contents variable** (a list variable) holds the names of the cards in it. Compare them in an expression such as `mammalsBucket.length == 2`.

## The Draggable section
- **Can be dragged**: untick to lock the layer. The **Allow dragging** action does the same while the project runs (lock the answers once they are checked).
- **Tags**: words that say what the layer is, separated by commas. A drop zone takes a layer when they share a tag.
- **Moves**: anywhere, or only left and right, or only up and down (a slider handle, a lane).
- **Stays inside**: nothing, its parent, the artboard, or another layer. The layer's whole box is kept inside.
- **Dropped off a zone**: stays where it was let go, or goes back to where the drag began (and to the zone it was in). Off a zone means no zone there, the wrong tag, or a full zone.
- **Zone decided by**: the layer's centre (the default), the pointer, or whichever zone it overlaps most. Use the pointer for a big card going onto a small slot.
- **Grid**: snaps the position to a grid of this many pixels while dragging.
- **Glide**: how long it glides into a zone or back (none when the viewer asked for less motion).
- **Tap to move**, **Hold to drag on touch**, **Key step**, **Name read out**, **Do not announce**: see below.

## Drop zones
- **Takes tags**: leave empty to take any draggable layer.
- **Holds**: how many layers fit (0 is no limit). **When full** either refuses the new layer, or **swaps**: the layer that has been there longest goes to where the dragged one came from, and the dragged one takes its place. Swapping is how slot puzzles and reordering work.
- **Dropped layers**: stay where they were dropped, centre in the zone, sit at its top left corner, or **Fill the zone**: the layer takes the zone's place, size and corner radius while it's in it, and its own size again when it leaves, so a card dropped in a slot becomes the slot's shape. A layer sent by the keyboard, a tap or an action goes to the centre when this is left alone.
- **Outline when a layer is over it**: an outline appears on the zone while a layer it takes is over it (and a fainter one while any such layer is being dragged). Untick it if your artwork shows the state itself.
- A layer can be both: a tile that can be dropped on and then dragged on again.

### A zone's own rules
**Takes it when** is a formula that has to be true for the zone to take a layer. `item.name`, `item.tags` and `item.index` are the layer held, and `zone.name`, `zone.count` and `zone.contents` the zone. Give a text instead of false and the text is the reason: `zone.count < 3 || "A trimester takes three courses"`. The reason is read out, the layer goes back, and **On refused** runs with it as `event.why`, so a **Show toast** after it is the whole message. Only the zones that would take what's held are marked as places it could go, so the marks follow the rule with nothing to repaint.

On the draggable, **Only these zones** names the zones it may go in, whatever their tags say: a piece that may move within its column but not out of it.

### Counting units, and zones counted together
A draggable can carry values of its own: **Its own values**, one a line, as `units: 2` or `code: MSC6100`. Then:

- **Holds** on a zone can count one of them instead of layers: **Holds** 2 **of** units takes a 1 unit card and a 1 unit card, or one 2 unit card, but not a third. A layer without the value counts as 1.
- **Zone groups** count several zones together. Press **+ New zone group** on one of them, name it (`Year 1`), give it a limit (**Holds** 8 **of** units) and what to say when it's full (`{name} is 8 units at most.`), then tick it on the other zones. A drop that would take the group over is refused wherever in the group it lands, and the learner hears your words. Moving a card within the group is fine: it's only counted once.
- **Takes it when** gets `item.data` (`item.data.units`), `zone.total` (what **Holds** counts, without the held layer) and `zone.groups` (the names of its groups).

### Totals in any formula
`count('Year 1')` is how many layers a zone or zone group holds, `sum('Year 1', 'units')` adds up one of their values, and `items('Trimester 1')` lists them, each with `name`, `zone`, `tags` and its own values, for a repeater. A name with `*` covers every zone it matches (`sum('T*', 'units')`). Text bound to them, and variables that keep their formula up to date, change after every drop: `Year 1 · {sum('Year 1', 'units')} / 8 units`. Given a list, `count` and `sum` work on the list as they always have. On the canvas nothing has been dropped yet, so they show 0.

### A zone that lays out what it holds
Tick **Arrange what it holds** and the zone lays its layers out in rows that wrap, with a **Gap** between them, **As they came** or **By name**. With **Fit its height** it grows and shrinks to fit them, keeping room for its **Least rows** when it's empty. Take one out and the rest close up; put one back and it takes its place in the order. A pool of course cards that shrinks as cards leave it is one tick. Reset sends each layer home to its place in the order, not to where it first stood.

Scripts can change where a layer goes home to with `ix.drag.home('Card', x, y, 'Pool')`.

## Events and actions
- **When dragging starts**, **When dragged over a drop zone** (moves over / off), **When dropped** (taken, refused, or dropped on no zone) and **When dragging ends** (always fires, after On drop, and also when the pick-up is cancelled). Leave the layer empty to hear every draggable layer or zone. Each fires once per drag, however it ends.
- **While dragging** fires over and over while a layer is held and moving (dragged, nudged with Shift+arrows, or sent between zones with the arrow keys), at most once a frame. `event.layerX`/`event.layerY` say where the layer is, `event.dx`/`event.dy` how far it has come since it was picked up: set a variable from them to drive a gauge, move another layer along, or play a sound as it crosses a line.
- Every one of their `event`s holds `type`, `layer` (the draggable layer's name), `tags` (its tags), `x` and `y` (the pointer) and `zone`. The rest depends on the event, so a script can tell them apart by `event.type`:

| Event | `type` | Also holds |
|---|---|---|
| When dragging starts | `dragStart` | `from` (the zone it was in), `keyboard` |
| When dragged over a drop zone | `enter` or `leave` | `accepted` (whether that zone would take it) |
| While dragging | `dragMove` | `layerX`, `layerY`, `dx`, `dy`, `keyboard` |
| When dropped | `drop` | `from`, `result` (accepted, rejected or missed), `accepted`, `reason` (`tags` or `full` when refused), `swapped`, `keyboard` |
| When dragging ends | `dragEnd` | `from`, `result` (as When dropped, or cancelled), `dropped` (true when a zone took it), `cancelled`, `keyboard` |

`keyboard` is true when it was moved without dragging (keys, or a tap to pick up).
- **Put layer in drop zone** moves a layer into a zone as if it had been dropped there; **Reset draggable** sends one (or all of them, for *Start again*) back to where it started; **Allow dragging** switches a draggable layer or a drop zone on and off. None of them fires the drag events, so they cannot start a loop.
- **Allow dragging** and **Put layer in drop zone** also work in bulk: leave the layer empty for every draggable layer, or pick a container (a group or frame) to change everything inside it, and fill **Only tagged** to keep just the layers that carry that tag. **Changes** on Allow dragging adds the drop zones (or only them). One Allow dragging node with the layer empty locks every answer at once; scripts do the same with `ix.drag.enable(undefined, false)` and `{ tag, what }` as a third argument.
- The older **On pointer → Dragging** events still work for scripted drags. Use the draggable settings when the point is to move a layer and drop it somewhere.
- Scripts have `ix.drag.zoneOf('Dog')`, `ix.drag.contents('Mammals')`, `ix.drag.state()` (every layer and its zone), `ix.drag.put(layer, zone)`, `ix.drag.reset(layer?)` (both glide there for the layer's glide time; add `{ instant: true }` to put it there now, so the script can move it again straight away) and `ix.drag.enable(layer, on, { tag, what }?)` (no layer: all of them, or everything inside a container). The page that holds the player can read `player.dragState()`.

## Buttons on a card
A draggable layer can hold its own controls: an info button on a course card, a link, a layer with a click flow or an overlay link. A press on one of those is the control's, so the button opens its dialog and the card stays where it is. Press anywhere else on the card to drag it or pick it up. While a card is picked up, its own buttons still work, and it stays picked up. A picked-up card rides over the rest of the page, but a dialog, tooltip or toast it opens is always drawn on top of it.

To a screen reader a card holding buttons is a **group** rather than a button, so the buttons inside are read and pressed as they are. Space on the card itself still picks it up.

## Keyboard, touch and screen readers
Everyone should be able to finish the activity, so every drag has two ways that need no dragging.

- **Keyboard** (when [accessibility](accessibility) is on): Tab to a draggable layer, press **Space** or **Enter** to pick it up. The **arrow keys** step through the drop zones that take it (it moves onto each one so you can see it), **Home** and **End** jump to the first and last, **Space** drops it, **Escape** puts it back. With no zone to go to, or with **Shift** held, the arrows nudge it by the *Key step* (Shift: five times as far, Alt: a tenth). A layer with a *When clicked or hovered → Click* event keeps Enter for the click and is picked up with Space.
- **Tap to move**: tapping or clicking a draggable layer picks it up, and tapping a drop zone drops it there; tapping the layer again, or anywhere else, puts it back. This is on unless the layer has a click event of its own (the setting can force it on). It is the way to do it for someone who cannot drag at all. A layer that has been picked up like this can still be dragged: press on it and drag, and it carries on from there.
- **Screen readers** hear the layer called a "draggable item", then what happens: picked up, which zone it is on (*Mammals, 1 of 2*, and *full* or *swaps with…* when that applies), dropped in, refused, put back. **Name read out** sets what they call the layer or zone (it uses the text alternative, then the layer name, otherwise). Tick **Do not announce** to say it yourself with Announce nodes. The Preview shows what would be spoken.
- **Touch**: a draggable layer stops the browser scrolling or selecting text under the finger. A layer locked to one axis leaves the other axis for scrolling. Inside a scrolling frame, tick **Hold to drag on touch**: the finger must rest a moment before the layer follows it, so swiping from the layer still scrolls the frame.

## Things to know
- A picked-up layer comes up over everything else on the page. Tick **Stays behind when picked up** on one that should keep its place in the stack.
- Dragging changes the layer's **X** and **Y**. Do not animate those on a timeline that plays at the same time; animate a group around it instead.
- A pointer drag never changes the layer's parent or its place in the layer order; it is raised above everything while it is held. Drop zones can sit in another group or frame. A frame the viewer has scrolled is allowed for: a zone is found where it is drawn.
- Layers made by a [repeater](repeaters) cannot be dragged (every copy would move). A layer inside an auto layout frame can only be dragged when its **Position** (Layout section) is *Ignore*, otherwise the layout puts it back. The inspector says so.
- Layers that start inside a zone that takes them count as being in it.
- A draggable layer and the zones for it have to be on the same artboard, and in the same instance if they are inside one.
- The accessibility checker counts a draggable layer as interactive, so it asks for a name.
