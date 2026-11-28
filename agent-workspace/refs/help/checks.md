# Checks
Rules the project is checked against as it runs, with the words for each one that fails.

**Checks** are rules a project is checked against while it runs: a study plan that mustn't go over 8 units a year, a form that needs an email, a build that needs every part. Each check is a formula that's true when all is well, and the words to show when it isn't. They're worked out again after every change, so the list of what's wrong is always current.

## Add one
Select nothing (or the page), open **Checks** in Properties and press its **+**.

- **Passes when**: `sum('Year 1', 'units') <= 8`. Give a text instead of false and the text is the message: `sum('Year 1', 'units') <= 8 || 'Year 1 is over 8 units'`.
- **Otherwise say**: the words when it fails, with `{slots}`: `Year 1 has {sum('Year 1', 'units')} units, 8 at most.`
- **For each** (optional): a formula giving a list, `items('Year 1')`. The check runs once per item, with `item` and `index`, and each failure names its item: `Passes when` `item.offered.includes(item.zone)`, **Otherwise say** `{item.name} isn't offered in {item.zone}.`

## Show what fails
- In any formula: `checks.count`, `checks.passed`, and `checks.list`, where each failure has `check` (its name), `message` and `item`. A repeater over `checks.list` with a text of `{item.message}` is the whole issues list.
- On a layer, the state **A check fails for it** is on while a check fails for an item of the layer's name: the red outline on a card that's in the wrong place, with no script.
- Under the checks, **Failures**, **How many** and **All pass** write them to variables too, for a **Save user data** or an **On variable change**.

Good to know: a check whose formula can't be worked out counts as failing, so a typo never makes a plan look finished. The canvas runs them on the starting values. See [Drag and drop](drag-and-drop#totals-in-any-formula) for `count`, `sum` and `items`.
