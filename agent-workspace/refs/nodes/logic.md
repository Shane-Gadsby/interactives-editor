# logic nodes

### logic.if — If (logic)
Continues down "true" or "false" depending on a condition.
Outputs: true, false
- condition (expr, default "score > 10")

### logic.switch — Toggle (logic)
Alternates between "a" and "b" each time it runs.
Outputs: a, b

### logic.random — Random (logic)
Continues down one of its outputs, picked at random. "Weights" gives each output its chance (a list, in output order: [1, 3] makes output 2 three times as likely). "Only if" is a list of conditions in the same order; an output whose condition is false cannot be picked. Nothing continues when none can.
Outputs: 1, 2, 3, 4, 5, 6
- weights (expr, default "[1, 1]"): One number per output, in order. 0 never gets picked (unless nothing else can be).
- valid (expr, default "[true, true]"): One condition per output, in order, e.g. [score > 3, true]

### logic.once — Once (logic)
Lets the flow through the first time only.

### logic.forEach — For each item (logic)
Runs the Each item steps once for every item of a list, in order, then Done. The steps after Each item see `event.item` (the item), `event.index` (from 0) and `event.count`. Each run finishes, waits included, before the next starts, so a Set variable that adds up a total works. Up to 5000 items.
Outputs: each, done
- list (expr, default ""): A list variable, a data source, or a formula that gives a list. A number n counts 0 to n - 1

### logic.repeat — Repeat (logic)
Runs the Again steps a number of times, or while something is true, then Done. The steps after Again see `event.index` (from 0). Each run finishes before the next starts. With While, it stops as soon as that is false, checked before each run, and never more than 5000 times.
Outputs: each, done
- times (expr, default "3"): How many times. Leave empty to use While alone
- while (expr, default ""): Keep going only while this is true

### logic.sequence — Sequence (logic)
Runs "1", then "2", then "3" in order.
Outputs: 1, 2, 3
