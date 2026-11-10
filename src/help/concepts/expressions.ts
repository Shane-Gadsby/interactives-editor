import type { Concept } from './index';

export const concept: Concept = {
  order: 50,
  area: 'construction',
  topic: {
    id: 'concept-expressions',
    title: 'Formulas, and {braces} in text',
    group: 'Concepts',
    summary: 'Bindings, conditions and the {slots} in text take small formulas, not plain words: quotes around text, == to compare, lists counted from 0.',
    keywords: 'concept formula expression braces curly text slot quotes equals == = index zero typo nothing shows blank cheat sheet',
    body: `Wherever a field works a value out (a binding, a condition, the value of a **Change a value or counter** node, **Repeat → Items**, and anything in \`{braces}\` in a text layer), it takes a small **formula**, not plain words. Your variables and data sources are there by name.

A few you will use all the time:

| Formula | Gives |
|---|---|
| \`score + 1\` | One more than the score |
| \`lives > 0\` | true or false, for a condition or a Visible binding |
| \`answer == "Paris"\` | Whether the answer is the text *Paris* |
| \`name.length\` | How many letters the name has |
| \`items[index].title\` | The title of an item in a list |
| \`correct ? "Well done" : "Try again"\` | One text or the other |
| \`fmt(price, 2)\` | A number shown with two decimals |

In a text layer, \`Score: {score} of {total}\` puts the values in among the words. To show a real brace, type it twice: \`{{\`.

## Where people get caught out

- **"Paris" vs Paris.** Text needs quotes. \`answer == Paris\` looks for a variable called Paris, finds none, and the line under the field says so.
- **= vs ==.** A single \`=\` sets something, and a formula can't. To compare, write \`==\`. To change a variable, use a **Change a value or counter** node.
- **Lists start at 0.** The first item is \`items[0]\`, and \`index\` and \`event.index\` count from 0 too. Show \`{index + 1}\` when a learner should see *1*.
- **"My text shows {scoer} with the braces."** A slot that can't be worked out is left as written in a text layer, and gives nothing in a binding. That is how a typo in a name shows up.
- **"It shows nothing at all."** A typo after a dot (\`item.titel\`) isn't an error: it reads a field that isn't there, which is nothing. Check the field names in the data.

## How to tell what is going on

- **The line under every formula field.** Green says what it works out to right now (*currently 12*), with the starting values. A warning says what is wrong in a sentence, and for a mistyped name it offers a fix: *There is no value called scoer. Did you mean score?* with a **Use score** link that puts it right.

![A Button label binding with the formula playng ? "Pause" : "Play" and, under it, There is no value called playng. Did you mean playing? Use playing.](help/concept-expressions-did-you-mean.png)

- **Suggestions as you type.** Start a name, or type a dot after one, and the list shows what is there, with each value.
- **Conditions without typing.** A field that wants a yes or no offers pickers (**[score] [is at least] [5]**), which write the formula for you.
- A formula that uses \`event\` can only say *depends on what happens when it runs*. Try it in Preview and watch **Variables (live)**.

**More:** [Expressions](expressions), [Checks as you type](expressions#checks-as-you-type), [Helpers](expressions#helpers), [What you can write](expressions#what-you-can-write), [A what-if explorer](tutorial-whatif).`,
  },
};
