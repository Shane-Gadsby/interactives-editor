# Expressions
Short JavaScript formulas in text, bindings and node settings.

An expression is a short formula that works out a value: a total, a piece of text, a yes or no. You write them in text, bindings and node settings, in a safe subset of JavaScript. Your variables and data sources are available by name.

```
score + 1
name.toUpperCase()
lives > 0 ? "Play again" : "Game over"
Math.round(progress * 100) + "%"
count(products, "inStock", true)
```

## Where they go
You can write an expression in four places:
- **Text**: anything in `{braces}`.
- **Bindings**: a property's value. See [Bindings](bindings).
- **Node settings** marked *expr*, such as the value of **Change a value or counter** or the condition of **Check a condition**.
- **Repeat → Repeat for each**: the list to repeat over (a list variable, a data source, items you type, or a formula).

In repeated copies, `item` and `index` are the current list item and its position. In interactions, `event` describes what fired.

## Suggestions as you type
**Expression suggestions as you type** help you write a formula without remembering every name. They appear in every field that takes an expression: the Formula of a binding, a node's expression settings (a Check a condition node's condition, Change a value or counter's value...), a variable's formula, Repeat's items, a joystick's X and Y, and the `{braces}` in a text layer's words, a button's label or a link's address (there they only suggest inside the braces).

Type the start of a name, or press the dot after one, and a short list appears. Each choice shows its type and its value right now.

The list offers:
- your variables, `context` (and its fields, such as `context.firstName`) and your data sources;
- the names the player supplies (`reducedMotion`, `voiceAvailable`, `micLevel`, `downloadSize`...);
- the helpers below, with their arguments;
- what the setting itself has: `event` in a graph node, `value` in a converter, `self` in a binding.

After a dot it lists what can follow: the fields of an object, `self.width`, or the methods of text and lists. Inside `layer("` it lists your layers' names.

**Up** and **Down** move through the list, **Enter** or **Tab** puts the choice in, and **Esc** closes it. With no list showing, Enter and Tab do what they always did.

## Checks as you type
A line under every formula field tells you what the formula is doing, a moment after you stop typing:
- **Green**: what it works out to right now, such as *currently true*, *currently 12* or *currently “Hello”*. A formula that depends on what has happened (it uses `event`) says *depends on what happens when it runs*, and one that uses `Math.random()`, `randInt` or the date says *changes each time it runs*. It is not run to show you a value that would be different the next time.
- **Red**: what is wrong, in a sentence. *There is no value called scoer. Did you mean score?* comes with a **Use score** button that fixes every use of it in one click. A bracket or quote that is not closed, a symbol missing at the end, a single `=` where `==` was meant, and a formula that cannot be worked out with today's values are all said in words.

The check uses the same scope as the suggestions, and the values are the project's starting values, as on the canvas.

## Conditions without typing
You don't have to write a yes/no condition as a formula. A field that asks for one (see [Interactions](interactions)) offers pickers instead of a text box: **[value] [is at least] [5]**, with **+ and** and **+ or** for more rows, and **Edit as formula** for the text. The pickers write an ordinary formula, so anything you built with them can be edited by typing, and a formula they cannot show opens as text.

## Calculations without typing
A formula that works out a number or some text can be picked instead of typed. Under a **Worked out** variable's formula, a **Data bindings** formula and the **Value** of **Change a value or counter**, press **Pick a calculation**. A menu offers plain templates, and each one is filled in with pickers:
- **Add two values**, **Take one value from another**, **Multiply two values**, **Divide one value by another**: `score + 1`.
- **What percentage one value is of another**: `total > 0 ? Math.round(score / total * 100) : 0`. A whole of 0 gives 0 instead of a broken number.
- **How many items in a list match**: pick the list, then *Every item*, or *Only the items that match* with the field to look at, how to compare and the value, for example `count(cards, "state", "matched")`. The field box offers the fields the list's first item has.
- **The total of a number in each list item**: `sum(prices, "amount")`.
- **The larger of two values**, **The smaller of two values**: `Math.max(score, 0)`.
- **Round a number** to a number of decimal places: `Math.round(price * 100) / 100`.
- **One thing if a condition holds, otherwise another**: choose the condition with the same pickers as an **Only if**, then what it is when true and when not: `score >= 5 ? "Pass" : "Try again"`.
- **Join text and values together**: pieces of text and values, in the order you give them, made into one piece of text. A text piece "Score: " and the value `score` give *Score: 7*. Numbers joined this way stay text, so two scores do not add up.

The box under the picker shows the formula it will write and what it works out to now. Nothing changes until you press **Use this calculation**, and **Cancel** leaves the formula as it was. The formula is ordinary text, so you can keep editing it by hand. When the formula already in the box is one of these, the picker opens filled in. When it is anything else (a formula with `.filter` in it, say) the picker says so and leaves it alone until you choose a calculation to replace it.

![The Pick a calculation box opened under the formula hours * pay: Calculation set to Multiply two values, another value hours times another value pay, the line It writes hours * pay, currently 420, and Use this calculation and Cancel.](help/pick-a-calculation.png)

## Helpers
Helpers are ready-made functions for common jobs: showing a number as text, mapping one range onto another, counting words, laying out a puzzle or a diagram. These work in every expression:

| Call | Gives |
|---|---|
| `fmt(n, decimals, thousands)` | A number as text: `fmt(1234.5, 2, true)` is `1,234.50` |
| `remap(v, inMin, inMax, outMin, outMax, clamp)` | One range mapped onto another |
| `clamp(v, min, max)` | A number held between two limits |
| `lookup(v, {a: 1, b: 2}, fallback)` | The value stored under a key |
| `pad(n, width)` | Zero padding: `pad(7, 3)` is `007` |
| `html(text)` | Text made safe to put in a web page (a downloaded report): `<`, `>`, `&` and quotes are replaced |
| `crossword(words, size)` | A crossword laid out from a list of `{answer, clue}` rows (or plain words), inside a `size` by `size` grid. Each row comes back with `row`, `col` (its first letter, from 0 at the top left) and `down` added, in reading order. Words that are too long, or that cannot cross the others, are left out. The same words always make the same puzzle. Best used as a variable's [formula](variables) |
| `wordSearch(words, size, seed)` | A `size` by `size` letter grid hiding the words (across, down, diagonal and backwards), one string per row. The same words and seed always make the same grid |
| `mindMap(nodes, options)` | A mind map laid out on both sides of its middle idea. `nodes` is a list of `{id, parent, ...}` (the item with no parent is the middle; list order is branch order); `options` is `{width, height, nodeW, nodeH, gapX, gapY, collapsed}` (`collapsed` lists the ids of folded branches). Each item comes back with its own fields and `x`, `y`, `w`, `h`, `depth`, `side` (`root`, `left` or `right`), `branch`, `visible`, `kids`, `folded`, `parentIndex` (the copy a connector joins) and `right`, `left`, `up`, `down` (the copy each arrow key goes to, -1 for nowhere). Boxes shrink to fit `width` by `height`. Best used as a [live variable](variables) feeding a [repeater](repeaters) and [connectors](connectors) |
| `mindMapEdit(nodes, op, at, arg)` | The tree after one change, as a new list: `"add"` (a child of item `at` labelled `arg`), `"rename"`, `"delete"` (with everything under it), `"up"`, `"down"`, `"indent"`, `"outdent"` and `"reparent"` (under item number `arg`). A change that makes no sense (deleting the middle, putting an idea under itself) gives the list back as it was. `mindMapNextId(nodes)` is the id an added item gets, `mindMapOutline(nodes, {detail: "detail"})` the map as an indented text outline and `mindMapSvg(placed)` a laid out map as an SVG picture for a download |
| `flowChart(steps, links, options)` | A flowchart laid out in rows from its start. `steps` is `{id, kind, label, ...}` with `kind` one of `start`, `end`, `process`, `decision` or `io`; `links` is `{from, to, label}` by step id; `options` is `{width, height, direction: "down" or "right", sizes, gapX, gapY}`. Each step comes back with `x`, `y`, `w`, `h`, `layer`, `order` and `kind`. Links that loop back are left out of the rows; a decision's branches open out either side |
| `flowLinks(steps, links)` | The same links with the step numbers they join (`a`, `b`, -1 when a step is missing), `back` (a link that loops back up) and the sides they should use (`outSide`, `inSide`), for the connectors that draw them. `flowOutline(steps, links)` is the chart as numbered text, branches included |
| `cloud(words, width, height, options)` | A word cloud packed onto a stage `width` by `height`. `words` is plain text (each mention counts once) or rows `{text, weight, ...}`; the same word in other capitals is one word and the weights add. It comes back one row per word, the biggest first, each with `size` (the font size), `x`, `y`, `w`, `h` (its box on the stage, nothing overlapping), `rank`, `tier` (0 biggest, 2 smallest), `shown` (false when it cannot fit even small) and its own other fields. Options: `minSize`, `maxSize`, `scale` ("sqrt", "linear" or "log"), `gap`, `grow`, `max`, `minCount` and `blocked` (a list of words to leave out). The same words always make the same cloud |
| `timelineLayout(events, eras, from, to, options, part)` | A dated timeline for the years `from` to `to`. Events are rows `{date, end, title, ...}` with dates written 1969, 1969-07 or 1969-07-20 (an `end` makes a range, counted to the end of its period); eras are `{name, from, to}`. `part` picks the list you get back: "events" (the default: each with `pos` and `pos2` along an axis `options.length` px long, `lane`, `labelled`, `labelPos`, `labelW`, `labelH`, `dateText`, `spoken`, `inView` and `eraName`), "eras", "ticks", "marker" (no row or one) or "info" (one row: `rangeText`, `unlabelled`, `earlier`, `later`, `problems`). Options: `length`, `orientation`, `labelSize`, `lanes`, `sides`, `dateLine`, `maxLabel`, `columnWidth`, `maxLines`, `gap`, `tickSpace` and `marker`. Labels never overlap and a leader line never crosses another label |
| `timeBounds(events, eras, marker)` | `[from, to, span, count]`: the whole years that hold every event, era and marker, with room at each end |
| `wordCount(text)` | How many words a text has (runs of anything but spaces). `wordCount("one two  three")` is 3 |
| `band(value, thresholds, labels)` | A label for where a value falls. Thresholds go from the highest down and there is one more label than thresholds: `band(score / total, [0.75, 0.5], ["Great", "Good", "Keep going"])` |
| `clock(seconds)` | Seconds as `m:ss` (`h:mm:ss` from an hour): `clock(95)` is `1:35` |
| `today(format)` | Today's date as text: `today('dd-mm-yyyy')` is `19-11-2026`. The letters are `yyyy` and `yy`, `mmmm` (November), `mmm` (Nov), `mm` and `m`, `dddd` (Thursday), `ddd` (Thu), `dd` and `d`, `HH` for hours and `nn` for minutes. With no format it's `2026-11-19`, which sorts |
| `date(value, format)` | Any date as text, the same way: `date(dueDate, 'd mmmm')`. Empty when the value isn't a date |
| `shuffle(list, seed)` | The list in a new order. Give a seed (a number) to get the same order every time |
| `randInt(a, b)` | A whole number from `a` to `b`, both included. `randInt(6)` is 0 to 6 |
| `count(list)`, `count(list, field, value)` | How many items a list has, or how many match: `count(tasks)`, `count(tasks, "state", "done")`. For a list of plain words or numbers leave the field out: `count(answers, "yes")` |
| `count(list, field, ">", value)` | The same with a comparison instead of an exact match. The comparisons are `"=="`, `"!="`, `">"`, `">="`, `"<"`, `"<="` and `"contains"`: `count(products, "price", ">", 5)` |
| `where(list, field, value)` | The items that match, as a list. It takes the same arguments as `count`: `where(products, "inStock", true)` |
| `positions(list, field, value)` | The positions of the items that match (0 is the first): `positions(cards, "state", "up")` |
| `sum(list, field)` | The numbers added up, from one field of each item or (`sum(scores)`) a plain list of numbers. Anything that is not a number counts as 0 |
| `pluck(list, field)` | One field of every item as a list: `pluck(people, "name")`. A field can reach inside with dots: `"owner.name"` |
| `includesAll(list, items)`, `includesAny(list, items)` | Whether the list (or text) has every one of the items, or at least one, ignoring capitals: `includesAny(answer, ["cat", "kitten"])` |
| `enums.name` | The options of a choice variable |
| `instanceInput(layer, name)` | The current value of a variable inside an [instance](instances) layer (by name or id) |
| `artboard.width`, `artboard.height` | The page's size (and `artboard.name`), in the same units as a layer's X and Y, whatever size the player is shown at |
| `self` | In a [binding](bindings) (and its converters): the layer it's on. `self.width`, `self.opacity`, `self.text`, any plain setting it has, and for a video `self.time`, `self.duration`, `self.playing`, `self.ended` and `self.rate` |
| `layer(name)` | The same for any layer, by name or id: `layer('Knob').width`. X and Y are inside its parent, as in the Inspector |

## What you can write
This is exactly what an expression can contain. Expressions are read by a small interpreter, not run as JavaScript, so a project can't use them to reach the page. These work:

- **Values**: numbers (`12`, `.5`, `1e3`, `0xff`), text in `"…"`, `'…'` or backticks with `${…}` slots, `true`, `false`, `null`, `undefined`, lists `[1, 2, ...more]`, objects `{a: 1, b}`, and patterns `/regex/flags`.
- **Operators**: `+ - * / % **`, `== != === !==`, `< > <= >=`, `&& || ??`, `!`, `typeof`, `in`, `a ? b : c`, bit operators, and `,` inside brackets.
- **Looking inside**: `a.b`, `a[b]` and `a?.b`. Only the values you put there are readable: your variables, data, `artboard`, `self`, what `layer()` gives and `item`, `event`, `value`; `__proto__`, `constructor` and `prototype` never are.
- **Calls**: the helpers above, `Math.*`, `Number`, `String`, `Boolean`, `parseInt`, `parseFloat`, `isNaN`, `JSON.parse/stringify`, `Object.keys/values/entries`, `Array.isArray/from`, `Date.now()` and `new Date(…)`, and the usual methods of text (`slice`, `split`, `replace`, `padStart`, `toUpperCase`…), numbers (`toFixed`, `toLocaleString`…), lists (`map`, `filter`, `find`, `some`, `every`, `reduce`, `join`, `includes`, `slice`, `sort`…) and dates.
- **Arrow functions** for those list methods: `x => x * 2`, `(a, b) => a + b`. They take plain names and an expression, not a block. Most of the time you do not need one: `count`, `where`, `sum` and `pluck` cover counting, picking and adding up a list without it.

These don't: assignment (`=`, `++`), statements, `function`, `this`, loops, `window`, `document`, `fetch`, `eval`, and list methods that change a list in place (`push`, `splice`; `sort` and `reverse` give a sorted copy and leave the list alone). A slot that can't be read or fails is left as written in text and gives nothing elsewhere. Very large lists or text, and expressions that run for very long, are cut off.

## Patterns (regular expressions)
A pattern describes text to look for, such as a postcode or a word that may be spelled two ways. A `/pattern/flags` works with `match`, `matchAll`, `search`, `replace`, `replaceAll`, `split`, `.test(text)` and `.exec(text)`. Some patterns can make a browser freeze on the wrong text (a pattern like `(a+)+$` takes twice as long with every extra character), so patterns are checked before they run. A pattern is refused, with a message, when:

- it has a **backreference** (`\1`, `\k<name>`);
- a **repeated group contains another repetition**: `(a+)+`, `(\w+\s?)*`, `(.*x){5}`. Write it flat instead, for example `[a-z]+`;
- a repeated group has **alternatives that can start the same way** (letters that differ only in case count as the same with the `i` flag), or an alternative that begins with an optional part, or any optional part at all: `(a|aa)+`, `(a|A)+` with `i`, `(a?b|b)+` are refused, `(cat|dog)+` is fine;
- a repeated group has **more than one optional part**, or one that could also begin the group: `(a?b?)+`, `(\d\d?)+`; `(\d{3}-?)+` is fine;
- the parts that **vary in length but are not open-ended multiply up** past 65,536: `a?a?a?...` thirty times followed by thirty `a`, or `a{0,30}` six times in a row;
- it has **more than 3 open-ended repetitions** (`*`, `+`, `{n,}`) or is **over 300 characters**.

The text a pattern runs over is limited too: 10,000 characters for a pattern with no more than one open-ended repetition, 1,000 with two and 200 with three. Patterns with bounded repetitions such as `\w{0,50}` get a shorter limit still. Longer text gives an error rather than a freeze. Text you pass to `match`, `matchAll` and `search` is a pattern and follows the same rules; to `replace`, `replaceAll` and `split` it is plain text. The rules are cautious on purpose: some harmless patterns, like `(\.[a-z]+)+`, are refused too.

A pattern that gets past these rules still never runs in the browser's own pattern engine, which can't be stopped once it is going. The player runs it with its own matcher, which remembers every place it has been and never works through the same one twice, so how a pattern is written can't make it slow, and each match has a time allowance (and so do all the matches in a page together, such as one pattern run over every row of a long list). A match that uses its allowance gives an error like the other refusals, instead of freezing the page. The matches are the same ones the browser would find (greedy and lazy, groups, `$1` and `$<name>` in replacements, lookahead and lookbehind, the `i`, `m`, `s`, `u`, `g`, `y` and `d` flags). The one difference: the text a group inside a lookbehind (or inside a repeat that can match nothing, `(a*)*`) captures can differ in rare corner cases.

In a text layer, a slot whose pattern is refused (or whose text is too long for it) is left as written, braces and all, as in the last line below; elsewhere it gives nothing.

![Three text slots with patterns: the first two work, the third, with a nested repetition, is refused and left as written.](help/patterns-refused.png)

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).
