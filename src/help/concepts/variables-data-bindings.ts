import type { Concept } from './index';

export const concept: Concept = {
  order: 40,
  area: 'construction',
  topic: {
    id: 'concept-variables-data-bindings',
    title: 'Variables, data sources and bindings',
    group: 'Concepts',
    summary: 'Variables are what changes while it runs, data sources are content loaded from a file, and a binding makes a layer follow either one.',
    keywords: 'concept variable data source binding bound snaps back starting value state list questions content file json csv which one follow property link',
    body: `Three things work together here, and each has one job.

- A **variable** is a value that changes while the project runs: a score, whether a panel is open, what the learner typed. It has a starting value, and interactions change it from there. Add them in the **Variables** tab.
- A **data source** is content loaded from a file or a web address: a list of questions, a table of terms, a set of cards. The project reads it; interactions can load it again, but nothing edits it while it runs. Add them in the **Data** tab.
- A **binding** ties one setting of a layer to a variable or a formula, so the layer follows it by itself. Add them in the **Data bindings** section of the Inspector.

So a progress bar is a variable (\`done\`) plus a binding on the bar's Width (\`done / 10 * 300\`). The questions it counts through can be a data source.

## Which one do I want?

Ask: **does it change while it runs?**

- **Yes, because of what the learner does** (a score, a tick-list of what they picked): a variable. For a list of things, a *List* variable.
- **No, it's the content** (the questions, the glossary, next term's dates): a data source. Next term you swap the file, not every layer.
- **A layer should show it**: a binding (or \`{braces}\` in a text layer, which do the same for words).

## Where people get caught out

- **"I typed a value and it snapped back."** That setting is bound. The binding sets it every time the page is drawn, on the canvas and in Preview, so what you type never shows. Look in **Data bindings** (it opens by itself on a layer that has any) and change or remove the binding there.
- **"I changed the starting value but Preview still shows the old one."** Preview takes the starting values when it starts. Press **Restart** in Preview's bar.
- **"My Change a value or counter node does nothing."** The variable may be a live one (**Keep up to date** under its formula). A live variable is worked out from its formula and can't be set by hand; the Variables tab says how many nodes try to.
- **"The learner's dragged position is never saved."** A draggable layer whose X or Y is bound **← In** never writes back to the variable. Bind it **⇄ Both**.
- **"Should my questions be a variable or a data source?"** If you write them once and the learner only answers them, a data source. If the learner adds, removes or reorders items, a List variable (it can start from the same items).

## How to tell what is going on

- Under each binding, a grey line works it through with the starting values: *the formula is 1, Look up: no line for 1, so it stays 1*. If the layer looks wrong on the canvas, that line usually says why.

![A Play button's Data bindings: Button label set by the formula playing ? "Pause" : "Play", currently Play, and Pressed (button, toggle) set straight from the variable playing; under each, a line saying what it is set to at the start.](help/concept-variables-data-bindings-bindings.png)

- Under each variable's name, the Variables tab says **used in 3 places** or **not used yet**. Click it to go to each place.
- In Preview, **Variables (live)** shows every variable as it changes, and you can set one by hand to see what the bindings do with it.

**More:** [Variables](variables), [Data sources](data-sources), [Bindings](bindings#which-way-in-out-or-both), [Tutorial 3](tutorial-state-machine), [Content from a data file](tutorial-data-source).`,
  },
};
