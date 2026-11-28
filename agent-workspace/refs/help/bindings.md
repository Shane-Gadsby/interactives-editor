# Bindings
Tie a layer property to a variable: in (the variable sets it), out (it sets the variable) or both ways.

A binding connects a layer's setting to a variable, so the layer changes by itself when the variable does: a bar that grows with the score, a name that shows in a text layer, a layer that appears at step 3. It sets the property from an [expression](expressions) and keeps it up to date as variables and data change.

## Adding a binding
In the **Data bindings** section of the Inspector, press **+ Add binding** (or the **+** in the section's header) and pick the property; type in the search box at the top to find it quickly (*opa* finds Opacity).

Each binding then says where its value comes from:
- **Variable**: pick a variable from the list (search it by name), or **+ New variable…** at the bottom of the list to make one. The property takes that variable's value as it is.
- **Formula**: work the value out from variables, for example `lives > 0` for *Visible*, or `progress * 3` for *Width*. As you type it suggests your variables, `context`, `self` and the helpers (see [Expressions](expressions#suggestions-as-you-type)).
- **By value**: a small table for "when this is that, the property is this". Pick what it depends on (a variable, or inside a [repeater](repeaters) a field of the item such as `item.state`, or **Write a formula…** for a condition), then give the result for each value it can have, using the property's own box: a colour picker for a colour, a number box for a number. A choice variable or a true/false one gets its lines for you; for anything else press **+ Add a value** and type the value. **Otherwise** is used for any value with no line of its own (leave it as *keeps the value as it is* to change nothing). It is the *Look up* converter underneath, so a binding made by hand that way opens as the table too.

![The By value table on a card's Fill colour: item.state this item at the top, down giving gold #f6c344, matched giving green #bfe5c4, otherwise white, an Add a value button and the line that works it through for the first card.](help/bindings-by-value.png)

Under the Variable and Formula views, **+ Convert…** changes the value on its way, and the grey line at the bottom works the whole thing through with every variable at its starting value: *value2 is 1 → Look up: no line for 1, so it stays 1 → Opacity is set to 1*. If a binding doesn't do what you expect, that line shows where it goes another way. Bindings are separated by a short rule; the bin removes one.

![The Data bindings section: a binding on the fill colour set to a formula, with a Pick a calculation link under it, and the + Convert… menu.](help/bindings-section.png)

Examples:

| Property | Expression |
|---|---|
| Width | `progress * 300` |
| Fill colour | `correct ? "#2e7d32" : "#c62828"` |
| Visible | `step === 3` |
| Text | `products[0].name` |
| Rotation | `speed * 3` |
| Solo: active child | `mode` (a choice whose options are the children's names) |

A bound property takes its value from the binding, on the canvas and in Preview, so a value typed into its field or keyed on a timeline is replaced by the binding's. A field set by a binding (in, or both ways) has a small link mark after its label, with a dashed box, so you can see why a typed value won't stick; hover or focus the mark for the reason. **Data bindings** lists everything that is bound. A binding that only writes out to a variable (**Out**) doesn't mark its field, because what you type still sticks. Remove the binding to set the property by hand. Every animatable property can be bound (see [Animatable properties](animatable-properties)), and so can every other plain setting the layer has, such as a video's **Autoplay** or **Src**, or a polygon's sides. A video layer also lists **Playback position (s)**, **Playing**, **Length (s)** and **Ended**, which come from the video itself.

## Which way: in, out or both
Each binding has **← In**, **Out →** and **⇄ Both** at the top.
- **In** (the usual): the variable or formula sets the property, as above. The formula can read the layer it's on as `self`: `self.width / 2` for a height, `self.time / self.duration` on a video for how far through it is. `self` is the layer before its own bindings apply, so a binding never reads its own result.
- **Out**: the property's value is written into a variable whenever it changes, and nothing sets the property from it. Use it to *read* something: a draggable layer's **X** as it is dragged, a video's **Playback position**, a timeline-animated **Opacity**. Read-only attributes (a video's **Length**, **Ended**) can only go out.
- **Both**: the property and the variable are kept equal. At the start the property takes the variable's value; after that, change either one and the other follows. A slider bound to the same variable as a video's **Playback position** both shows the position and scrubs the video; setting a video's **Playing** to false pauses it.
- An **Input field**'s **Value** is the common case for Both: typing writes the variable and the variable fills the box (the **Bind to a variable…** button in the Input section adds exactly this). Out leaves the box showing its own text.
- A **draggable** layer with its X or Y bound **In** never tells the variable it moved, so a Save user data or a remembered variable keeps the old value. Bind it **⇄ Both** to save where the learner left it; the Bindings section says so and has a button for it.

Out and Both name a variable (no formula, no converters), and the grey line says what will happen in words.

**Videos.** On the editing canvas a video has no time or length yet. On a video's **Playback position** and **Playing** an *In* binding seeks, plays or pauses the video whenever the formula's value changes, and leaves the video alone while it doesn't, so it still plays on by itself.

The value is made to fit the property (settings that can't be animated, like a video's **Loop**, go by the type they already have): a number property takes a number (`true`/`false` become 1/0, numeric text is read) and is left as it was if the expression gives something that is not a number; a true/false property takes a boolean; text and colour properties take text.

## Converters
Under a binding, the **+ Convert…** menu changes its value before it is set. They run in order, so a few can be chained.

| Converter | Does |
|---|---|
| Number to text | Decimals, thousands separators, zero padding, text before and after: `$1,234.50`, `42%` |
| Round | Round, floor or ceil to some decimals |
| Invert (not) | true/false flipped (a number becomes 1 - x) |
| Remap range | One range onto another, optionally kept inside it: 0-1 to 0-100 |
| Look up | A value to anything else. Bound to a **choice** variable, it lists every option for you to fill in. *Otherwise* is used for values not listed. When it is the only converter, the binding shows as the **By value** table |
| To number / text / true/false | Change the type |
| Seconds to m:ss | A number of seconds as a clock, `95` becomes `1:35` |
| Expression | Any [expression](expressions), with `value` as the incoming value |

Anything a converter does can also be written straight into the expression with the helpers (`fmt`, `remap`, `lookup`…), which is what to use in text `{slots}`.

Choices and lists work with bindings like any other value: bind a fill colour to a choice with **By value**, a text layer to `people.length + " people"`, or a [repeater](repeaters) to a list variable. Importing a Rive file turns its data bindings on layers into bindings with converters, and its view models into shared variables (see [Importing](import)).
