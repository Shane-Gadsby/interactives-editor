# Charts
Column, bar, line, pie and donut charts drawn from a list, with an axis, a legend, a hover readout, keyboard reading and a table for screen readers.

A **Chart** layer draws a chart from a list: sales by month, a quiz score breakdown, answers from a poll. It scales its axis to the data, restyles with the theme, can be read with the keyboard, and gives a screen reader the numbers as a table.

Pick the **Chart** tool (in the **Data** group of the tool bar, which starts folded) and drag a box, or right-click the canvas and choose **New**, **Chart**. It starts as a column chart of four made-up items so there is something to look at.

## The data

**Data** is an expression that gives the list: a [list variable](variables) (`scores`), a [data source](data-sources) (`sales`), or one written out (`[3, 5, 2]`). Items can be:

- **numbers**: `[3, 5, 2]`, labelled 1, 2, 3;
- **objects**: `[{label: "Mon", value: 4}, ...]`. **Label key** and **Value key** say which fields to use; left blank the chart looks for `label`, `name`, `title` or the first text, and `value`, `y`, `count` or the first number;
- **pairs**: `[["Mon", 4], ["Tue", 8]]`;
- **one object**: `{Mon: 4, Tue: 8}`.

Anything that is not a number counts as 0. A chart draws up to 200 items.

Under the expression, a **preview** shows the first few items as the chart reads them (and what is wrong when it can't), using the project's variables at their starting values and the loaded data. The chart redraws when a variable or data source it reads changes.

## Hiding a value

A chart can **hide a value**: one bar, point or slice shows as a guess instead of its number. Use it for a guessing page where one bar is the answer. The item is drawn as a dashed, empty mark with a **?** (even with **Value labels** off). The hover readout, the screen reader and the table say *hidden* instead of a number.

To hide an item, give it `hidden: true` in the data: `[{label: "Mon", value: 4}, {label: "Tue", hidden: true}, ...]`. To reveal the real bar later, set `hidden` from a variable (`hidden: !answered`) and change the variable. **Hidden key** names another field to use instead of `hidden`.

A hidden item without a number of its own is left out when the axis is worked out. It shows as a slot the full length of the axis (a column or bar), a hollow point halfway up with a gap in the line (a line chart), and nothing in a pie or donut (it has no share). Give it a `value` as well and the dashed mark is drawn at that size and counts for the axis, which is how to show an outline of where the bar will land.

## Kinds and look

- **Column** (vertical bars), **Bar** (sideways), **Line** (one point per item, joined), **Pie** and **Donut** (shares of the total; negative values count as 0; **Hole** sizes the donut's).
- The axis runs from zero (or lower, for negative values) to a round number above the biggest value. **Axis min** and **Axis max** fix either end.
- **Gridlines**, **Axis labels**, **Value labels** (the number on each mark) and **Legend** (when each item has its own colour) switch on and off. **Decimals**, **Prefix** and **Suffix** control how numbers are written (`$`, `kg`, `%`). Prefix and suffix take variables in braces (`{unit}`), so changing a unit variable relabels the whole chart. Crowded labels are shortened or thinned out.
- **Colours** is a list of colours or [theme tokens](themes) handed out in turn. With one colour every bar and the line use it; **A colour for each item** gives each item the next colour (pie and donut charts always do). **Text colour**, **Font** and **Size** style the labels and axes. Using tokens, a chart changes with the theme and the colourway like everything else.

## Stacked, area, scatter and histogram
- **Stacked columns** stack several fields of each item on one another, one colour each: name them in **Stacked fields** (`home, away`) and the legend names them too.
- **Area** is a line with the space under it filled, for a total that builds up.
- **Scatter** places each item by two numbers: **Across field** (`x`) and the value field up. For two measures of the same people, such as hours studied and the mark. A list of pairs (`[[1, 10], [4, 40]]`) works too.
- **Histogram** counts the values of a list into ranges and draws a bar for each, touching. **Bars** sets how many ranges; blank picks from how many values there are. For how a class's marks are spread.

## Reading it

- **Hover** a bar, slice or point to see a readout with its name and value. **Tab** moves into the chart and the **arrow keys**, **Home** and **End** move between items, with the same readout. **Enter** or **Space** clicks the item.
- Clicks, presses and hovers on a mark run **When clicked or hovered** nodes on the chart layer with `event.index`: the item's place in the list, from 0 (`event.index` is null away from the marks). **Pointer moves over it** gives it for each item you cross; **Hover start** only for the item you first entered. Arrowing between items fires **When a layer is focused** nodes with `event.index` too. So `scores[event.index].name` is the item that was clicked.
- A **Table for screen readers** (on by default) puts the same numbers in a table that only a screen reader finds, with a share column for pie and donut charts. Give the chart a **text alternative** in *Accessibility* that says what it shows ("Sales by month, 2026"): the [checker](accessibility-checker) asks for one. A chart marked **Decorative** is hidden from screen readers.
- **Grow in** makes columns and bars rise, slices and points pop, and a line draw itself, the first time the chart appears. Viewers whose device asks for less motion get the chart as it is (the project's *reduced motion* setting turns it on for you, as it does for animations).

## Where it works

Charts draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of a page (as they look when fully grown, without the readout). They are **not** part of a Lottie export. There is no 3D, stacking or mixing of kinds. For anything else, a [Script layer](script-layers) can draw whatever you like.
