import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 68,
  level: 'advanced',
  minutes: 25,
  example: 'tut-script',
  topic: {
    id: 'tutorial-script',
    title: 'When you need a script',
    group: 'Build it',
    summary: 'A spelling question that accepts a near miss: a short sandboxed script does the one sum the nodes can\'t, and the graph and a binding do the rest. Also when not to write one.',
    keywords: 'tutorial script scripts javascript code ix api sandbox run script run code node spelling near miss typo close enough levenshtein edit distance when to use a script',
    body: `You will make a spelling question: name the largest moon in the solar system. A learner who types *Ganymede* is right, and one who types *Ganimede* or *ganymed* is told they are right, nearly. Working out how close a spelling is needs a loop over the letters, which no interaction node does, so that one sum goes in a script. Everything else stays in ordinary nodes and bindings. It takes about twenty-five minutes, and you need to be happy reading a little JavaScript.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **When you need a script**. **Play** runs it and **Make my copy** gives you your own copy.

## First: do you need one?

Most of what people reach for a script to do already has a node, a binding or a formula, and those are easier for the next person to read and change. Before writing code, check this list:

| You want to | Use instead |
|---|---|
| Show, hide or move something when it is clicked | **+ When clicked…** in the layer's **Interactions** section |
| Count clicks, tries or points | **Add 1 to a counter**, or a **Change a value or counter** node |
| Mark a question and give feedback | **Add question** (see [Questions and quizzes](question-kit)) |
| Put a number or a name into some words | \`{braces}\` in the text, or a [binding](bindings) with a formula |
| Pick something at random | \`randInt\` or \`Math.random()\` in an [expression](expressions) |
| Do one thing after another, or wait | The graph: actions run in order, and **Wait** waits |

Reach for a script when the job is a real calculation (a loop, a search, a sum over a list that a formula can't express), or when something must happen every frame. Keep the script small: let it work out a value and put it in a variable, and let the page show that value.

## 1. Make the page

1. On the projects page press **New project**. Keep **Blank project**, type **Spell it** as the name and press **Create project**.
2. Press <kbd>T</kbd> for the **Text** tool, click near the top left of the page and type \`Name the largest moon in the solar system.\` In the Properties panel set **Name** to **Question**.
3. Add a second, smaller text under it: \`It goes round Jupiter.\` Name it **Hint**.
4. In the tool bar down the left, open the **Web** group (it starts folded: click **Web**). Pick **Input field** and drag a box under the hint, about 360 wide. Name it **Answer box**. In its **Input** section set **Placeholder** to \`Type the moon's name\` and tick **No browser help**, so the browser's spellcheck doesn't fix the word for the learner.
5. Pick **Button** in the same group and drag a button to the right of the box. Set **Label** to \`Check\` and **Name** to **Check**.
6. Add one more text under the box and name it **Feedback**. What it says doesn't matter: step 4 replaces it.

## 2. Make the two variables

The script reads one variable and writes another.

1. Select **Answer box**. In the **Input** section press **Bind to a variable…**, then **+ New variable…** at the bottom of the list, and call it \`answer\`. Whatever the learner types is now in \`answer\` (it is a **⇄ Both** binding on the box's value).
2. Open the **Variables** tab at the bottom of the window. Press **+ Add variable** and pick **Counter**. Rename it \`distance\` and set its **Value** to **-1**. It will hold how many letters are wrong; -1 means nothing has been checked yet.

## 3. Write the script

1. Open the **Scripts** tab at the bottom of the window and press **+ New script**. It starts with a short example.
2. In the box at the top of the code, rename it **Close enough**.
3. Untick **Run on start**. A script that runs on start runs once, when the player starts, which suits code that sets up \`ix.on\` handlers. This one should run each time **Check** is pressed, so the graph will run it.
4. Select all of the example code and replace it with this:

\`\`\`
// How many letters would have to change to turn what was typed into the answer.
// 0 is spelt right, 1 or 2 is a near miss. The words on the page are worked out from it by a binding.
const typed = String(ix.vars.answer).trim().toLowerCase();
const target = 'ganymede';

let row = [];
for (let j = 0; j <= target.length; j++) row.push(j);
for (let i = 1; i <= typed.length; i++) {
  const next = [i];
  for (let j = 1; j <= target.length; j++) {
    const change = typed[i - 1] === target[j - 1] ? 0 : 1;
    next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + change);
  }
  row = next;
}
ix.vars.distance = row[target.length];
\`\`\`

\`ix\` is the player: \`ix.vars.answer\` reads a variable and \`ix.vars.distance = ...\` sets one. The column on the right of the Scripts tab lists the rest of the **ix API**. Everything saves as you type.

## 4. Turn the number into words

The script doesn't write any feedback. The words live on the page, where anyone can change them without reading code.

1. Select **Feedback**. In the **Data bindings** section press **+ Add binding** and pick **Text**.
2. Press **Formula** and type:

\`\`\`
distance < 0 ? "" : distance == 0 ? "Right! Ganymede is the largest moon in the solar system." : distance <= 2 ? "Right, nearly. It is spelt Ganymede." : "Not quite. Try again."
\`\`\`

The grey line under it works the formula through with \`distance\` at -1, so the text is empty for now.

## 5. Run the script from the graph

1. Select **Check**. In its **Interactions** section press **+ On click (empty)**, then open the **Interactions** tab at the bottom. A **When clicked or hovered** node is there, with **Layer: Check** and **Event: Click / tap**.
2. Drag from the dot on its right edge into empty space and let go. In the **Add and connect** menu type \`script\` in **Find a node…** and pick **Run script**.
3. Click the new **Run script** node and set **Script** to **Close enough**.

**Read as sentences** now says the Check button runs the script \`Close enough\`. For a line or two of code you don't need a whole script: a **Run code** node holds the code in the node itself. A named script is easier to find, and several flows can run the same one.

## 6. Keep the sandbox on

Click an empty part of the canvas, away from the page, so the Properties panel shows the project. In the **Project** section, **Run scripts in the sandbox** is ticked: new projects start that way. In the sandbox a script only gets \`ix\`, timers and \`console\`. It can't reach the page, cookies or the network, and one that runs too long is stopped. The note at the top of the Scripts tab's right-hand column says which way the project is set.

Leave it ticked. Untick it only for code you trust that needs the page itself (\`node.element\` or \`fetch\`); this script needs neither. See [Scripts](scripts#the-sandbox).

## 7. Try it

1. Press **Preview** at the top right. (Scripts don't run on the editing canvas, only in Preview and the published player.)
2. Type \`Ganymede\` and press **Check**. It says *Right!*
3. Type \`ganimede\` and check again: *Right, nearly.* Then try \`Callisto\`: *Not quite.*
4. Watch \`distance\` in the **Variables (live)** list on the left of the Preview as you check. Press <kbd>Esc</kbd> to close the Preview.

> If nothing happens when you check, look in Preview's event list: an error in a script is shown there, with the line it was on. A typing slip in the code is the usual cause.

## Go further

- **More than one right answer.** Put the answers in a list and keep the smallest distance: \`ix.vars.distance = Math.min(...answers.map(score))\`, with the loop moved into a \`score(target)\` function.
- **Count the tries without code.** After **Run script**, connect a **Change a value or counter** node that adds 1 to a \`tries\` counter. The graph carries on once the script has finished.
- **Let Enter check it.** Add a **When a key is pressed** event for <kbd>Enter</kbd> with its layer set to **Answer box**, and connect it to the same **Run script** node.
- **Report a result** the way a question does: \`ix.report({ completed: true })\` from the script, or the project's [Results and progress](results).

## What you learned

- Most behaviour needs no code: nodes, bindings and formulas cover it and are easier to change.
- A script is for a real calculation. Keep it to working out a value and putting it in a variable.
- **Run on start** is for setting up; a **Run script** node runs a script each time a flow reaches it, and **Run code** holds a line or two.
- **Run scripts in the sandbox** keeps a script away from the page, cookies and the network. Leave it on.

**Next:** the whole \`ix\` API is in [Scripts](scripts). To paint a layer from code every frame, see [Script layers](script-layers). Formulas and their helpers are in [Expressions](expressions).`,
  },
};
