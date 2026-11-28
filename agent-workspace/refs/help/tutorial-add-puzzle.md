# Add a puzzle
Put a puzzle in a story: a question in the puzzle frame, hints bought with hint coins, called from the script, with the story answering how it went.

You will add a puzzle to a story: Ren asks the reader a riddle, the reader can buy hints with hint coins, and Ren answers differently when it's solved. It takes about ten minutes. Use the story from [Your first visual novel](tutorial-visual-novel), or start a new project from the **Visual novel** template.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Add a puzzle**.

A puzzle is a page the story goes to and comes back from. Its frame (the number and value along the top, the hints and coins down the side, the big right or wrong moment) is already wired; you write the question and the hints.

## 1. Make a puzzle page

In the **Story** tab press **+ New puzzle**. A new page opens with a question in the middle and the puzzle frame around it. (The Visual novel template has a **Puzzle 1** already, so yours is **Puzzle 2**.)

## 2. Write the question

Select the question on the page and change it in the **Properties** panel:

- **Question**: `What gets wetter the more it dries?`
- The options: **A towel** (right), **The rain**, **A sponge**.

## 3. Title, value and hints

Click an empty part of the page so the page itself is selected, and open its **Puzzle** section:

- **Title**: `Ren's riddle`
- **Hint 1**: `Think about what you use after a shower.`
- **Hint 2**: `It hangs in the bathroom.`
- **Big hint**: `You dry yourself with it.`

Each hint costs a hint coin the first time; a new game starts with 3.

## 4. Call it from the story

In the **Story** tab, under Ren's lines, add (use your puzzle page's name):

```
Ren: Before you sit down, answer me this.
[call Puzzle 2]
if story.result == "solved"
    Ren (happy): Clever. You can stay.
else
    Ren: We'll call that a maybe.
```

## 5. Play it

Press **Preview**, play to the riddle, open a hint, answer it wrong once to see the value drop, then right. **Continue** takes you back to the story, which answers how it went.

help:story-puzzles help:story
