# Variables
Named values (number, text, true/false, colour, choice) shared by the whole project.

A variable is a named value the activity remembers while it runs: a score, a name, whether a panel is open. Use variables when something on one page has to change something else, on the same page or another. They belong to the project, so every page sees the same values.

Add them in the **Variables** tab. Each has a name, a type and a starting value.

## Renaming a variable
Type a new name in its name box. Everything that reads it follows: bindings, `{templates}` in text and labels, expressions in the Interactions graph, other variables' formulas, repeaters, charts and instance inputs. A name after a dot (`item.score`) or inside quotes in an expression is left alone, because it isn't this variable. The editor says how many places changed, and **Undo** puts it all back in one step.

You're asked first in two cases:
- **Scripts or code snippets mention it.** They're listed with the lines that would change. Choose **Rename, scripts too**, or **Rename, leave scripts** when a script uses the same word for something of its own.
- **It keeps learners' values** (Remember progress or Save as user data) **and it's used somewhere.** Saved values are kept under the name, so the variable remembers its old names, and the player reads a learner's saved value from the old name when it finds nothing under the new one. Nobody loses their progress.

A name that another variable or a data source already has is refused. A question's own variables (`q1_score` and so on) are renamed with the question's **Name prefix**, not one by one.

| Type | Holds |
|---|---|
| Number | `0`, `3.5` |
| Text | `"Hello"` |
| True/false | `true` or `false` |
| Colour | `#ffb448` |
| Choice | One of a list of options you define, like `easy`, `medium`, `hard` |
| List | Items, usually a row of fields each: a table with a column for `name`, a row for Ann and a row for Bo |

Choice variables show as a dropdown wherever you set them, so you can't type a value that isn't on the list. In expressions, `enums.difficulty` is the list of that choice's options, so `enums.difficulty.indexOf(difficulty)` is its position. A solo group's **active child** can be bound straight to a choice whose options are the children's names.

## Lists
A list variable holds the items a [repeater](repeaters) draws. Pick it in the repeater's **Repeat for each**, and `item` and `index` are the current one.

The starting items are a **table** in the Variables tab: a row for each item and a column for each thing it holds (`name`, `price`). Type in a cell to change it, and use the **Row** and **Column** buttons above the table to add, copy, delete and move them. A cell can hold text, a number, yes or no, or nothing (the **Cell** choice above the table says which). A plain list of words or numbers is a table with one column, `value`. Give that column another name, or add a column, and the items become records with fields. Press **JSON text** over the table to see and type the same list as JSON, for example `[{"name": "Ann"}, {"name": "Bo"}]`, and **Table** to come back. A list with lists or groups inside its items has no table, only the text. Text that is not a JSON array makes an empty list.

![The Variables tab with a List variable called pairs shown as a table: a Table and JSON text switch, Row and Column buttons, a Cell holds choice, and six rows of two columns, a and b, Cat and Kitten down to Duck and Duckling.](help/variables-list-table.png)

A repeater with a **Selection** writes the copies people pick into a variable: a *Number* for one pick (the place of the copy, from 0, or -1 for none) or a *List* for several (the places picked). Read it like any other variable (see [Repeated lists](repeaters#selection)).

Change the list while it runs with **Change a value or counter**. Its **Do** box has these list choices:
- *Add to the end of the list* adds an item (`{name: "Cy"}`).
- *Remove from the list (by position)* takes out the item at a position (0 is the first).
- *Empty (list, number or text)* clears it, and *Set to* replaces it.
- *Add to the list, or take out if it is there* works as a tick-list: it adds the value, or removes it when it is already in.
- *Remove from the list (by value)* takes out every item equal to the value. Objects are compared by what they hold.
- *Change one list item* changes the item at a position you give. Left empty, the position is `event.index`, the item the event came from. An optional **Field** changes only that field of an object item. The new value can read `item` (what is there now) and `index`, for example `item.count + 1`. A position that is not in the list changes nothing.
- *Change list items where a field is a value* changes every item that matches, in one step. Type the field to look at (**Items where this field**, like `state`) and the value it has to be (**Is**, like `"up"`), then the **Field** to change and its new **Value**. A memory game turns every face-up card to matched with *Items where this field* `state`, *Is* `"up"`, *Field* `state`, *Value* `"matched"`. Leave both *where* boxes empty to change every item.

In scripts use `ix.toggleItem('picked', 'b')`, `ix.removeValue('picked', 'b')` and `ix.setItem('cards', 2, 'down', 'state')`, or assign a new array: `ix.vars.people = [...ix.vars.people, {name: 'Cy'}]`.

## Next and previous in a range
For a slideshow, a carousel or a set of tabs, **Change a value or counter** has two more **Do** choices: *Go to the next number in a range* and *Go to the previous number in a range*. **First number** and **Last number** say where the range is (1 and `slides.length` for a list of slides counted from 1; 0 and `slides.length - 1` counted from 0), and **At the ends** says whether going past the last one *goes round to the other end* or *stops there*. It replaces a formula like `slide >= slides.length ? 1 : slide + 1` that you would otherwise type twice. **+ When clicked…** has it as **Go to the next item…** and **Go to the previous item…**. With **Last number** empty there is no top end: next just counts up.

## Easing a number to a new value
**Change a value or counter** can make a number run up (or down) to its new value instead of jumping. Use it for a score that counts up, or a bar that fills. It has two settings when **Do** is *Set to* or *Add to it* on a number:

- **Over (ms)** is how long the change takes. 0 jumps, as always. 400 runs the number to its new value in 0.4 seconds, and anything reading it moves with it: a bar, a text, a [blend](blends).
- **Easing** is how the number speeds up and slows down on the way (see [Easing](easing)).

**Continue** says whether the next node runs straight away, part-way, or once the number has arrived. A newer change to the same variable takes over from wherever it has got to, and so does any other write to it. With reduced motion it sets at once.

## Worked out from a formula
Instead of typing a starting value, you can give a variable a **formula**: an [expression](expressions) over the variables above it in the list. Choose **Worked out** next to the type, and a box for the formula appears under the value.

The player works the formula out each time the project starts (and after **Start over**). The canvas preview works it out too, so what you see while editing follows the variables it depends on. The typed value is only what it falls back to if the formula fails.

Once it plays it is an ordinary variable, so **Change a value or counter** can change it. Tick **Keep up to date** (see *Live variables* below) and it is read only instead, and is worked out again whenever what it reads changes.

The branded Crossword and Word search starters use this: you edit a plain list of words (and clues) and the grid is laid out from it, with `crossword(words, 10)` and `wordSearch(words, 12)`. Clear the formula to type or lay the value out yourself.

## Live variables
Tick **Keep up to date** under a variable's formula and it becomes *live*. The formula is worked out again whenever a variable it reads changes, not only at the start. (A formula that reads layers, data or the microphone is worked out again whenever something moves.)

Use one for anything you would otherwise paste the same long expression for in several places. Layers then just show `{wordsLeft}`. Examples:
- a word count: `wordCount(essay)`;
- whether the score passes: `score / total >= 0.5`;
- a band: `band(score / total, [0.75, 0.5], ["Great", "Good", "Keep going"])`;
- a list filtered by another variable.

Press **Pick a calculation** under the formula box to build a sum, a percentage, a count or a total from pickers (see [Expressions](expressions#calculations-without-typing)).

`wordCount`, `band`, `clock`, `shuffle`, `randInt`, `includesAll`, `includesAny`, `count`, `where`, `positions`, `sum` and `pluck` are formula helpers made for this: see [Expressions](expressions#helpers). To show seconds as `1:35`, use `clock(seconds)` in a formula, or the **Seconds to m:ss** [converter](bindings#converters) on a binding.

- A live variable is **read only**. *Change a value or counter*, scripts, inputs and the page cannot change it (they are told so in the console), and the Usage tab lists a *Change a value or counter* or *Put values back to the start* node that names one under **Broken**. Untick it to set it by hand again.
- Live variables can read each other, in any order in the list. If they read each other in a circle (or one reads itself) they stay at their starting value and the Variables tab and **Usage** say so.
- **When a value changes** fires when a live variable's value changes, like any other, and a script's `ix.get` always sees the current value.
- The typed value is what it falls back to when the formula fails (data not loaded yet, say). The canvas preview shows live variables worked out too.

## Save as user data
Tick **Save as user data** on a variable (under **Options**) and the player looks after the rest. Its saved value is put back **before the project starts**, so the first thing a returning learner sees is their own work.

It is saved a moment after it changes (a burst of typing is one save), and straight away when the learner moves to another page or leaves. It goes to the same place as the *Save progress* and *Load saved progress* nodes (see [Results and resume](results)), so you no longer need a *Save progress* node before every Next and Back.

In expressions, `userData.loaded` is true once the saved values have been looked for (for a "Welcome back" panel that should not flash on a first visit), and `userData.restored` is how many variables came back. `userData.failed` is true when they couldn't be loaded on this visit (the server was down, say): the project starts from its starting values, and **nothing is saved over the learner's saved work** until they come back, so you can show a "Your saved work couldn't be loaded, try again soon" message. A live variable cannot be saved. Embedded pages (instances) keep nothing: tick it in the main project.

## Putting variables back
**Change a value or counter** with **Do** set to *Back to its starting value* puts one variable back. The **Put values back to the start** node puts several back in one go (tick them in the node's list, or **All**).

A starting value is the one for this course if there is one, else the typed value, else the formula worked out again (so a formula that shuffles gives a fresh order). Live variables are left alone. This is lighter than **Start over**, which also leaves the page. In scripts: `ix.reset('score', 'answers')`.

## Undo and redo
Somebody arranging tiles, a board or a mind map wants to take a step back. Tick **Keeps history** (under **Options**) on the variables that hold their work, and the **Undo** and **Redo** nodes step all of those back and forward together. Put them on two buttons.

- Changes close together (within a quarter of a second, like a drag or one click that sets three things) are one step. Undo goes back up to 100 steps.
- `canUndo` and `canRedo` in a formula say whether there's anything to undo or redo, so a button's **Disabled** can be `!canUndo`.
- A new change after an Undo clears what could be redone, as in any app. **Start over** clears the history.
- Only the ticked variables move. A score or a page number without the tick stays where it is.

## Different values for different courses
One project can start with different values in different courses (a due date, a unit name, a week count). In the **Data** tab, pick **context** and add a row under **Per-course values**: a course label such as `MAT1000_*`, and the variables it changes. See [Course and learner context](course-context).

## Using variables
- In text: `Score: {score}`.
- In [bindings](bindings): drive any property from a variable.
- In interactions: **Change a value or counter** (set, add, toggle, list changes, reset), **Put values back to the start**, **When a value changes**.
- On inputs: bind a text field, checkbox or slider's **Value** to a variable, usually **⇄ Both** (see [Bindings](bindings)).
- In scripts: `ix.vars.score += 1`.
- From the host page: `player.setVariable('score', 10)`.

## Adding a variable
Press **+ Add variable** and pick what it is for: a **Counter** (a number that goes up and down), a **Switch (on or off)**, **Text**, a **Score** (a running total, remembered between visits), a **List**, a **Choice** or a **Colour**. Each one is an ordinary variable of that type with a name you can change, so the table still shows the type and starting value. See [Tutorial 3](tutorial-state-machine) for a worked example.

## Naming a variable
Type the name in your own words, spaces and capitals included: **Quiz score**. Formulas need a short name with letters, digits and `_` only, so the editor offers one made from your words, `quizScore`, in a small **Name in formulas** box under the field. Leave it, or change it. Your words are kept as the variable's **label**.

![A Variables tab row named Quiz score, with a small Name in formulas box under it holding quizScore, and its Options open below the value.](help/variables-labelled.png)

Everywhere you pick a variable (the Variables tab, the pickers in the graph and the bindings, the sentences that say what an interaction does, **Insert value**, the live list in Preview) you see your words, with the formula name small beside them. Formulas, `{braces}` in text and scripts always use the formula name: `Score: {quizScore}`.

A name that is already plain, like `score` or `high_score`, is used as typed and has no separate label. Change the words later and the formula name stays, so nothing that uses it breaks; change the **Name in formulas** and the project follows everywhere it is used, as renaming always did.

The name is saved when you leave the field. If there is nothing to build a name from (only symbols, say) or the **Name in formulas** is not valid, the field stays as a draft with a message and the project keeps the last good name until you fix it.

Next to the type, **Starts as a value** is the number, text or switch the project starts with. **Worked out** is for a variable that is calculated, such as a crossword grid: it shows a box for the formula (for example `crossword(words, 10)`), and the value stays as what it falls back to if the formula fails. **Keep up to date** (for a formula) works it out again whenever something it reads changes.

## Show a variable on the page
The text-icon handle beside a variable's name puts it on the page: drag it onto a text layer to add it to that text, or onto an empty part of a page to make a text that shows it. Press the handle instead of dragging to add it to the selected text layer. See [Live values in text](text#drag-a-value-onto-the-page).

## Options on a variable
**Options** is folded away until something in it is on. It holds three switches, each with a sentence saying what it does:
- **Remember** keeps the value between visits (for a score, a saved choice or a name). It is kept in the learner's record when the project is played from the Link for StudyDesk, otherwise in their browser. See [Results and progress](results).
- **Save as user data** keeps it on the server for each person (see above).
- **Shared with instances**: one value for this page and every [instance](instances) of a component inside it, so changing it in one copy changes it in all of them. Off, each instance has its own. Variables from an imported Rive view model come in with it on.

## Where a variable is used
Under each name the table says **used in 3 places** (or **not used yet**). Click it to list the places (layers, expressions, interactions, scripts), and click one to go there.

The bin asks first when the variable is used, naming the places, because they stop working once the name is gone. A variable nothing uses goes straight away, and the message at the bottom has an **Undo**.

![The Variables tab: lit, a true/false switch, and taps, a number, each with a small T button at the left of its name that you can drag onto the page to show the value, a count of where it is used, and the + Add variable button.](help/variables-panel.png)
