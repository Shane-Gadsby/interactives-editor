import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 45,
  level: 'advanced',
  minutes: 35,
  example: 'tut-wordgames',
  topic: {
    id: 'tutorial-wordgames',
    title: 'Word search and crossword from a word list',
    group: 'Build it',
    summary: 'Puzzles made from a list you type, so the grid changes when the words do: how the Word search and Crossword starters work, and how to change them.',
    keywords: 'tutorial word search wordsearch crossword puzzle grid word list clues letters across down formula wordSearch crossword seed repeater grid select cells drag check words game vocabulary',
    body: `You will make two word puzzles about the water cycle: a word search and a crossword. Neither grid is drawn by hand. Each is worked out from a list of words you type, so changing a word changes the puzzle, in the editor and when it plays. It takes about thirty-five minutes.

**Just want to look?** The finished puzzles are on the projects page: **Templates**, then under **Examples** find **Build it**, **Word search and crossword**. **Play** runs them and **Make my copy** gives you your own copy. In the tutorial they are two projects; in the example they sit one after the other in one project, and the crossword's list is called \`clues\` so the two lists can't be mixed up.

Building a word search from a blank page means a few dozen nodes and formulas, so this tutorial starts from the two starters instead. You change the words, then take a guided look at how each part works, so you can change more than the words with confidence.

## Part 1: the word search

### 1. Start from the starter

1. On the projects page open **Templates**, then **Built-in**. **Branded starter packs** is at the top.
2. Pick a colourway, find **Word search** under **Games and puzzles** and press **Use template**.
3. Type **Water cycle word search** in **Name of your new project** and press **Create project**.

![The Games and puzzles row of the branded starters: Crossword, Word search, Arithmetic quiz and Guess the answer, each with Play and Use template.](help/tutorial-wordgames-starters.png)

A **Checklist** tab opens in the bottom panel. You will do its main job in the next step, and can tick items off as you go.

### 2. Type your words

1. Open the **Variables** tab. The first row is \`words\`: a **List** of eight words.
2. Replace its value with your own list and click away:

\`\`\`
["EVAPORATE", "CONDENSE", "CLOUD", "RAINFALL", "RIVER", "OCEAN", "VAPOUR", "RUNOFF"]
\`\`\`

3. Look at the **Find the words** page. The letters have changed and your words are hidden in them, across, down, on diagonals and backwards. The **Words to find** list beside the grid shows your eight.

That is the whole job of making a new puzzle. The rest of Part 1 is how it works.

### 3. Grid data: one formula

Find \`rows\` in the **Variables** tab. It says **Worked out**, its formula is \`wordSearch(words, 12)\`, and **Keep up to date** is ticked.

- \`wordSearch(words, size, seed)\` hides the words in a **size** by **size** grid and fills the gaps with random letters. It gives back one text per row: twelve rows of twelve letters.
- **Keep up to date** works it out again whenever \`words\` changes. That is why the grid followed your list.
- The same words and seed always make the same grid. Leave the seed out and it is 7. Change the formula to \`wordSearch(words, 12, 3)\` for the same words in another arrangement, and try a few numbers until you like one.
- A word longer than 12 letters can't fit and is left out. Keep to about eight words: the **Words to find** list has room for eight.

![The Variables tab: words is a List that starts as a value, and rows is Worked out with the formula wordSearch(words, 12) and Keep up to date ticked.](help/tutorial-wordgames-variables.png)

### 4. A repeater in a grid

1. On **Find the words**, select **Grid** in the **Layers** panel.
2. Open its **Repeat (list)** section. **Items** is:

\`\`\`
rows.join("").split("").map((l, i) => ({l, i}))
\`\`\`

That joins the twelve rows into one run of 144 letters and makes an item for each: its letter \`l\` and its place \`i\`. **Layout** is **Grid** with **Cols** \`12\`, so the 144 copies wrap into twelve rows.

3. Select **Letter square**, the one layer inside **Grid**. It is copied 144 times. Its text layer, **Letter**, says \`{item.l}\`. Its **Data bindings** colour it: \`line.includes(index)\` for the squares being chosen, \`foundCells.includes(index)\` for words already found.
4. **Grid** also has **Keyboard navigation** on: the whole grid is one stop for <kbd>Tab</kbd>, the arrow keys move between squares, and <kbd>Enter</kbd> chooses one.

![The Repeat (list) section of Grid on Find the words: Items starts rows.join, currently 144 items, Layout Grid, Cols 12, and below it Keyboard navigation in Grid mode.](help/tutorial-wordgames-grid-repeat.png)

To restyle the squares, restyle **Letter square** once: every copy follows.

### 5. Selecting across cells

A word is chosen by its first and last square. Two variables hold them, \`start\` and \`end\` (\`-1\` means not chosen), and two **Worked out** variables follow them:

- \`line\` is the list of squares from \`start\` to \`end\` when they are in a straight line (across, down or diagonal), worked out with \`Math.floor(start / 12)\` for the row and \`start % 12\` for the column.
- \`hit\` is the number of the word those squares spell, forwards or backwards, or \`-1\` if they spell none.

Open the **Interactions** tab on **Find the words**. Every way of choosing ends up setting \`start\` and \`end\`:

- **Dragging.** Three **When clicked or hovered** nodes on **Grid**, with **Event** set to **Drag starts**, **Dragging** and **Drag ends**. The first sets \`start\` from \`event.startIndex\` (the square pressed on); the others set \`end\` from \`event.index\` (the square under the pointer). Letting go sends the message \`try\`.
- **Clicking.** A **When clicked or hovered** on **Letter square** with a **Check a condition** of \`start < 0\`: the first click sets \`start\`, the second sets \`end\` and sends \`try\`.
- **The arrow keys.** A **When a value changes** on \`cursor\` (the square the keyboard is on) stretches \`end\` while a start is chosen.

### 6. Checking the word

Find the **When a message arrives** node for \`try\` (its **Note** says *Is it one of the words?*). Because \`hit\` already knows which word the line spells, the flow only reads it:

1. \`message\` is set to *Found RIVER!*, or says why it didn't count.
2. If \`hit\` is a word, its squares are added to \`foundCells\` and its number to \`found\`. Then \`start\` and \`end\` go back to \`-1\`.
3. A **Check a condition** of \`found.length >= words.length\` pauses the clock and goes to the next page when every word is found.

### 7. Try it

Press **Preview**, then **Start**. Drag across a word: it turns green and is struck off the list. Click the first and last letters of another. With the keyboard, use the arrows and <kbd>Enter</kbd> on the first and last letter. Watch \`start\`, \`end\`, \`line\` and \`hit\` in **Variables (live)** as you choose (press **Debug** in Preview's bar if you don't see it). Press <kbd>Esc</kbd> to close.

![Preview after dragging across EVAPORATE: its squares are ringed in green, it is struck off the Words to find list, Found 1 of 8, and the Debug panel shows found, foundCells, start and end.](help/tutorial-wordgames-found.png)

## Part 2: the crossword

### 8. Start from the starter and type your clues

1. Back on the projects page, open **Templates**, **Built-in**, and press **Use template** on **Crossword** (also under **Games and puzzles**). Name it **Water cycle crossword** and press **Create project**.
2. In the **Variables** tab, \`words\` is a list of answers and clues. Replace it with:

\`\`\`
[{"answer": "EVAPORATE", "clue": "What water does when the sun turns it into a gas"},
 {"answer": "CONDENSE", "clue": "What vapour does as it cools into droplets"},
 {"answer": "CLOUD", "clue": "Tiny droplets of water floating in the sky"},
 {"answer": "RAIN", "clue": "Water falling from the clouds"},
 {"answer": "RIVER", "clue": "Carries water downhill to the sea"},
 {"answer": "OCEAN", "clue": "Holds most of the water on Earth"},
 {"answer": "VAPOUR", "clue": "Water as a gas"},
 {"answer": "SNOW", "clue": "Frozen flakes that fall in winter"},
 {"answer": "RUNOFF", "clue": "Water flowing over the ground into streams"},
 {"answer": "STREAM", "clue": "A small river"}]
\`\`\`

3. Look at the **Crossword** page: a new grid, numbered, with the across and down clues listed beside it.

### 9. Grid data for a crossword

- \`entries\` is **Worked out** as \`crossword(words, 10)\`, kept up to date. It lays the words out in a 10 by 10 grid, crossing where they share a letter, and adds \`row\`, \`col\` and \`down\` to each. The same words always give the same puzzle; to try another layout, change the order of the list.
- A word that is too long, or can't cross any other, is **left out**. Count the clues in **Across** and **Down** after a change: if one is missing, add a word that shares a letter with it, or drop it.
- \`cells\` is the 100 squares, each with its answer letter \`ch\` (empty for a black square), what was typed \`t\` and a mark \`s\` (right, wrong or shown). Unlike \`entries\` it isn't kept up to date, because it holds the learner's typing; opening the page puts it back to its formula.
- \`acrossClues\`, \`downClues\`, \`aw\` (the word under the chosen square) and \`done\` all follow from these.

### 10. The grid and the typing

1. Select **Grid**. Its **Repeat (list)** has **Items** \`cells\`, **Layout** **Grid**, **Cols** \`10\`. Its one child, **Square**, has a **Visible** binding, \`item.ch != ""\`, so squares with no letter are hidden.
2. In the **Interactions** tab, the **When a key is pressed** node with the **Note** *Type a letter* runs for any key on a square. A **Check a condition** lets only letters through, then **Change a value or counter** writes the letter into \`cells\` and moves the chosen square along the word.
3. **Check letters** marks every typed letter right or wrong; **Reveal word** and **Reveal all** fill letters in. The live \`done\` is true once every square holds its answer, and its **When a value changes** says so.

### 11. Try it

Press **Preview** and **Start**. Click a clue, type the answer, and press **Check letters**. Click a square twice to switch between across and down.

![The crossword in Preview after Check letters: EVAPORATE across is green, SLOW typed for 1 down has its wrong L marked red, and the line under the clue says 1 letter is wrong.](help/tutorial-wordgames-crossword.png)

## Make it yours

- **One topic, two puzzles.** Use the same words in both, so learners meet them twice: the word search first, then the crossword's clues to recall them.
- **Bigger grids.** The word search's checklist says what else must change with the size: the formula's size, the repeater's **Cols** and the 12 in the \`line\` and \`hit\` formulas. Keep to the starters' sizes unless you need more room.
- **No clock.** In the word search, set \`showTimer\` to false in the Variables tab.

## What you learned

- A **Worked out** variable can build a whole puzzle from a list: \`wordSearch(words, 12, seed)\` and \`crossword(words, 10)\`.
- A repeater with **Layout** **Grid** turns a long list into rows and columns of one repeated square.
- Choosing across cells is just two numbers, \`start\` and \`end\`, with live variables working out the line and the word.
- Checking reads those live variables, so every way of choosing shares one check.

**Next:** [Repeated lists](repeaters), [Expressions](expressions#helpers) for the puzzle helpers, and [Branded starter packs](branded-starters) for the other games. A smaller game built from scratch: [A memory card game](tutorial-memory).`,
  },
};
