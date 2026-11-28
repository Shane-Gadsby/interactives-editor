# Auto layout
Frames that arrange their children in rows, columns, grids or stacks, with fill, hug and percent sizes, grow, margins and aspect ratios.

Turn on **Auto layout** on a frame and its children are placed for you, like CSS flexbox.

| Setting | Meaning |
|---|---|
| Direction | Row (left to right) or column (top to bottom) |
| Gap | Space between children, in px or a percent |
| Padding | Space inside the frame's edges (top, right, bottom, left), in px or a percent |
| Justify | Where children sit along the direction: start, centre, end, space between |
| Align | Across the direction: start, centre, end, stretch |
| Wrap | Start a new row/column when one is full (row or column layouts; a grid has no wrap). **Line gap** (shown while Wrap is ticked) is the space between the wrapped rows, or columns in a column layout. It starts out equal to Gap; type a different number to separate the rows more or less than the items in them |
| Hug width / height | The frame shrinks or grows to fit its children |
| Layout | *Row or column* (above), *Grid* or *Stack*: see [Grids and stacks](#grids-and-stacks) below |

A **hidden** layer takes no space in the frame, in the editor and in the player: hide one and the others close up over the gap it left, show it and they make room again.

![A frame whose Wrap is ticked: the nine cards fill a row, then continue on the next. Gap is 12 between cards and Line gap is 40 between the rows.](help/line-gap.png)

![Changing Line gap and Gap: the rows move apart and the cards spread or regroup.](help/line-gap.mp4)

## Percent padding, margin and gap
Every padding, gap and margin field takes **px** (the default) or a **percent**. Type `10%` (or `10px` to go back), or press the small **px / %** button at the right of the field; pressing it keeps the size the value comes to now, so 20 px in a 400 px wide frame turns into 5%. Each side can have its own unit.

A percent is worked out again on every layout, so it follows the frame as it is resized or the page changes size. It is a share of a **width**, on both axes (the way CSS and Rive do it, so a 10% padding is the same all the way round):

- **Padding and gap**: the inner width of the auto-layout frame this one sits in, or this frame's own width when it is not in one (the artboard's top layout, for one).
- **Margin**: the inner width of the frame that lays the layer out.

![The Auto layout section of a frame with the Gap switched to a percent: the small button at the right of the field says % and shows px again when pressed.](help/layout-percent.png)

A frame that hugs its width measures a percent against the width it had before the layout ran, so it settles in a pass or two rather than chasing itself. Percent **sizes** of a layer are separate (see *Percent* under child sizing); a track in a grid can be a percent too.

## Size limits
**Min W**, **Max W**, **Min H** and **Max H** hold the frame's own size, whoever decides it: hugging its content, filling its parent, or being stretched by it. Leave one empty for no limit.

A box that grows with its text but never gets wider than 480 is **Hug width** on with **Max W** 480. A sidebar that fills what's left but never gets narrower than 240 is **Min W** 240. If you set a min above a max the min wins, so a frame is never given a negative size.

## Grids and stacks
Set **Layout** to **Grid** to put the children in the cells of a table instead of along a line, or to **Stack** to put them all on top of each other.

- **Columns** and **Rows** list the size of each track, separated by spaces, like `100px 25% 1fr auto`. A track is a size in px (a bare number is px too), a percent of the frame's inner size, `fr` (a share of what is left once the other tracks are taken, so `1fr 2fr` gives the second twice the first), or `auto` (as big as the biggest thing in it). Rows past the ones you list are `auto`, so an empty **Rows** box makes a row for every line of children. What you type stays as you typed it until you leave the box or press Enter, then it is tidied (`120 1fr` becomes `120px 1fr`). If a word is not a size the box says which one and saves nothing yet, so fix it or press Escape to put back what was saved. With no columns listed there is one column; a frame that hugs its width has `%` and `fr` tracks only as big as what is in them.
- **Column gap** and **Row gap** are the spaces between tracks. (A grid has no **Wrap** or **Direction**: children fill the cells in layer order, left to right and then down, unless a child is given its own cell in **Layout item**.)
- **Cell alignment** is a 3x3 picker. A child smaller than its cell sits where you click: the top left corner, the centre, the bottom right and so on. A child set to **Fill** stretches to the whole cell instead.
- **Justify content** (*Start*, *Centre*, *Space between*) and **Align content** (*Start*, *Centre*) place the tracks when they don't add up to the frame's size, for example fixed-size tracks in a larger frame.
- A **stack** has no tracks: every child goes in one cell as big as the frame. There the picker is called **Stack position** and says where the children sit in the frame (in the picture, the pink tag sits in the bottom right of the stack); a child set to **Fill** covers the frame. Going back from Stack to Grid finds the tracks you had.

![A grid of 100px, 25%, 1fr and auto columns with the cell alignment picker at the centre, and a stack below it with its position at the bottom right.](help/grid-layout.png)

![Editing the columns, then moving the 3x3 picker: the tiles shift inside their cells. Then the stack's picker moves the badge around the photo.](help/grid-layout.mp4)

## Child sizing
Select a child of an auto-layout frame and its **Layout item** section says how it sits in the frame; it sits right under the first section of the Inspector. Only the settings that frame's kind of layout reads are shown (a stack has no margins, wrapping or aspect, for example). With several children selected (from the same frame), a change applies to all of them, and a field shows *Mixed* where they differ. Select layers from different kinds of layout and the section only tells you so.

![The Layout item section for the orange card: Fill width and fixed height, grow 2 from a zero basis. The dark button at the top right is pushed there by an auto margin.](help/layout-item.png)

![Ticking Auto margin: Left on the button pushes it to the end of the toolbar. Then changing Grow on a card changes how much of the free room it takes.](help/layout-item.mp4)

- **Position**: *In flow* (laid out with its siblings), *Absolute* (placed by **Inset** from the frame's edges, e.g. pinned to the bottom right; leave a side empty (*auto*) to leave that edge free, and set left and right, or top and bottom, to stretch a layer that isn't fixed size) or *Ignore* (keeps its own x/y and takes no room, and has no sizing fields). While a layer is *In flow* or *Absolute*, its **X** and **Y** in the Inspector are greyed out and a line says which frame places it: set *Ignore* to place it yourself.
- **W** and **H** (width and height):
  - *Fixed*: its own size.
  - *Hug*: fits its own contents (frames and text).
  - *Fill*: along a row or column, shares the frame's free space with the other fill children; across it, stretches; in a grid, fills its cell.
  - *Percent*: a share of the frame's inner size (of the cell, in a grid). Where the frame hugs that size, the frame is as big as everything else needs, and the percent layer then takes its share of that.
- **Grow** and **Basis** (row and column, on the axis the frame runs along, for a *Fill* layer): a fill layer starts from its basis (*Zero*, *Pixels*, *Percent* of the frame, or *Content*: as big as what is inside it), and the free space is shared on top of it by grow (default 1; 0 takes none). Layers that are over the line shrink in proportion to their basis. A wrapping line breaks at each fill layer's basis (zero when it has none), not at the size it was left with by the last layout.
- **Aspect** (width over height, like 1.78): when one side hugs and the other is known, the hugging side follows the ratio instead of its content. The field shows up once a ratio is set or exactly one side is *Hug* (in a grid: the height); *From size* takes the ratio from the layer's current size, and 0 clears it. **Derive** chooses between *Either side* and *Height only* (the width then keeps hugging). In a grid only the height is derived.
- **Wrap text** (text in a row or column): a text that hugs its width (Sizing set to *Auto width*; the section says so when it isn't) wraps at the room its frame offers, and then shrinks to its widest line.
- **Column**, **Row**, **Col span**, **Row span** (grid): which cell it starts in (1 is the first, negative counts back from the last, 0 takes the next free cell) and how many tracks it covers. Layers without a cell fill the free cells in order.
- **Margin** around it (top, right, bottom, left), in a row, column or grid, in px or a percent of the frame's inner width (see [Percent padding, margin and gap](#percent-padding-margin-and-gap)). In a row or column, **Auto margin** on a side makes that side take the free room of the line, split equally between the auto sides: it pushes a layer to the end or centres it, ahead of Justify. Across the line, auto on both sides centres the layer and on one side pushes it to the other edge.

These settings are not keyframed: they are part of the layout, not of an animation. Animate a layer's size or position with a timeline, or change the frame's layout from an action.

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.

## Animate changes
Turn on **Animate changes** in the frame's Auto layout section and, while the project plays (Preview and the published player), children glide to their new place instead of jumping. It covers layers shown or hidden, a solo or draw order switching, text changing length, a list gaining or losing items, the frame being resized, and direction, gap, padding or alignment being set by an action.

| Setting | Meaning |
|---|---|
| Duration | How long a glide takes, in milliseconds |
| Easing | A preset, or *Custom* to drag the curve's handles |
| Enter | How a layer looks as it appears (a layer shown, or a new list item): *None*, *Fade*, *Scale* (grows from nothing) or *Fade and scale* (from 80%) |
| Exit | How a layer looks as it goes (hidden, or a list item removed): it fades or shrinks where it was, then goes. Until it has gone it keeps its place in the layout, so the layers around it stay put and a frame that hugs its content keeps its size; then they glide together |
| Keep its place while leaving | Shows when **Exit** is set, and starts on. Untick it and the others move at once while the leaving layer fades where it was, so a frame that clips its content folds shut over it. That is how an accordion's section closes |

- A frame that hugs its content on an axis glides its own size along with its children when the content changes size (a layer shown or hidden, a list gaining or losing items).
- If a layer returns while it is still leaving, it fades back in from where it had got to and nothing moves. A layer that appears while another is still leaving waits until the layout is released. A solo swaps its layers at once with no hold.
- **Timelines win.** If a timeline or an *Animate a layer's setting* action is moving a layer's x, y, width or height, the frame follows it exactly rather than gliding behind it, and a property a timeline has a track on is never glided.
- Text that sizes itself changes size at once (its position still glides), and layers set to *Ignore* are not moved by layout so they don't glide.
- The editor canvas always snaps, so you can design without things moving. Scrubbing a timeline snaps too.
- With **Respect reduced motion** on in Project settings, viewers who ask for less motion see everything snap.
