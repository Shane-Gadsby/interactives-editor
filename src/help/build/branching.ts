import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 40,
  level: 'intermediate',
  minutes: 30,
  example: 'tut-branching',
  topic: {
    id: 'tutorial-branching',
    title: 'A branching scenario',
    group: 'Build it',
    summary: 'A situation with three choices, consequence pages that branch again, a path so far line and three endings picked by the score.',
    keywords: 'tutorial branching scenario story choices choose your own path decision consequence ending endings score points go to page scene path so far start again start over expression worked out formula live',
    body: `You will make a short scenario about group work. The first page sets out a problem and offers three choices. Each choice leads to a page of consequences with two more choices, and the last choice lands on one of three endings, picked by how many points the learner's choices earned. A line at the bottom of each page shows the path so far, and every ending has **Start again**. It takes about thirty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Branching scenario**. **Play** runs it and **Make my copy** gives you your own copy. The **Branching scenario** starter (**Templates**, **Built-in**, **Branded starter packs**) is a bigger version of the same idea in the UniSQ look.

Each page is one scene. A choice is a button that does three things in a row: it adds its points to a score, adds its words to the path, and goes to the next page.

## 1. Make the project and its pages

1. On the projects page press **New project**. Keep **Blank project**, type **Group work scenario** as the name and press **Create project**.
2. The editor opens with one page called **Home**. Click its name above the page, and in the Properties panel change **Name** (under **Page**) to \`Tuesday: a quiet group\`.
3. Press **+ Add page** at the bottom of the **Layers** panel six times, and name the new pages, in this order:
   - \`Sam replies\`
   - \`Wednesday night\`
   - \`The lecturer replies\`
   - \`A strong outcome\`
   - \`A mixed outcome\`
   - \`A learning moment\`

The names matter: the choices go to pages by name, and the endings are picked by name in step 6.

## 2. A list for the path

1. Open the **Variables** tab at the bottom and press **+ Add variable**. Pick **List**.
2. In **Name** type \`taken\` and press <kbd>Tab</kbd>. Leave its value as \`[]\`, an empty list.

Every choice adds a few words to \`taken\`, so the list is the learner's path.

## 3. Write the first scene

On **Tuesday: a quiet group**:

1. Press <kbd>T</kbd>, click near the top of the page and type the situation: \`Your group assignment is due on Friday. The four of you agreed to write one section each, but Sam, who has the data analysis, has not posted anything in the group chat for a week. The read-through is tomorrow.\` Press <kbd>Escape</kbd>. Widen the box so the text wraps across the page, and name the layer **Situation**.
2. Add another text layer under it saying \`What do you do?\`, named **Prompt**. Make it bold and a little bigger.
3. Press <kbd>B</kbd> and drag three wide buttons under the prompt, one under another. Set their **Label**s and **Name**s:
   - **Choice 1**: \`Message Sam and ask how it is going\`
   - **Choice 2**: \`Quietly write Sam's section yourself\`
   - **Choice 3**: \`Email the lecturer and ask them to step in\`
4. Add a small text layer at the bottom of the page, named **Path so far**, and type exactly:

\`\`\`
Path so far: {taken.length ? taken.join(" > ") : "just starting"}
\`\`\`

The part in braces is an expression. While \`taken\` is empty it says *just starting*; after two choices it says *Asked Sam > Set a checkpoint*.

## 4. Wire the first choice

1. Select **Choice 1**. In its **Interactions** section press **+ When clicked…** and choose **Change a number…**.
2. Under **Which number** pick **A new number…**, and in **Name the number** type \`score\`. Leave **What to do** on **Add to it** and set **Amount** to \`3\`: this choice is worth three points. Press **Add**. This makes the \`score\` variable for you.

![The When Choice 1 is clicked dialog: Pages, Layers, Motion and sound, Counting and switches and Other, with Change a number picked, and Which number, What to do and Amount below it.](help/tutorial-branching-when-clicked.png)

3. The **Interactions** tab opens by itself on two nodes: **When clicked or hovered** and **Change a value or counter**. (If it doesn't, press **Show in graph** under the sentence in the Properties panel.)
4. Drag from the small dot on the right edge of that node into empty space and let go. In the menu, type \`change\` in **Find a node…** and pick **Change a value or counter**. Set it up:
   - **Variable**: **taken**
   - **Do**: **Add to the end of the list**
   - **Value**: \`"Asked Sam"\` (with the quotes: it is text)
5. Drag from the new node's dot into empty space again, find **Go to a page** and pick it. Leave **Go to** on **A chosen page** and set **Page** to **Sam replies**.

That is one choice: click, add 3 to \`score\`, add *Asked Sam* to \`taken\`, go to **Sam replies**.

![The graph for Choice 1: When clicked or hovered, then Change a value or counter adding 3 to score, then another adding Asked Sam to the end of the list taken, then Go to a page, Sam replies.](help/tutorial-branching-graph.png)

## 5. Wire the other two choices

Do the same for **Choice 2** and **Choice 3**. From now on **Which number** already says **score**, so set **Amount** and press **Add**.

| Button | Amount (points) | Words for the path | Page |
|---|---|---|---|
| Choice 2 | \`0\` | \`"Wrote it yourself"\` | Wednesday night |
| Choice 3 | \`2\` | \`"Emailed the lecturer"\` | The lecturer replies |

Press **Read as sentences** above the graph to check all three rows read the way you expect.

![Read as sentences for the first page: When Choice 1 is clicked, then add 3 to score, then add Asked Sam to the list taken, then go to the page Sam replies, and the same for Choice 2 and Choice 3.](help/tutorial-branching-sentences.png)

## 6. The ending the score earns

The last choices don't go to a fixed page. They go to whichever ending the score has earned, so that is worked out in one place.

1. In the **Variables** tab press **+ Add variable** and pick **Text**. Name it \`ending\`.
2. Change **Starts as a value** to **Worked out**, and type this formula in the box that appears:

\`\`\`
score >= 5 ? "A strong outcome" : score >= 3 ? "A mixed outcome" : "A learning moment"
\`\`\`

3. Tick **Keep up to date**. Now \`ending\` is always the name of the page the score has earned, and it changes the moment \`score\` does.

## 7. The consequence pages

Each of the three middle pages is built like the first, with two choices instead of three: a **Situation**, a **Prompt**, **Choice 1** and **Choice 2**, and a **Path so far** text (copy it from the first page with <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd>).

Wire each choice as in step 4, with one change at the end: on the **Go to a page** node, set **Go to** to **One named by an expression** and type \`ending\` in **Page name or id**.

![The Go to a page node's settings: Go to set to One named by an expression, Page name or id ending, currently A learning moment.](help/tutorial-branching-goto-expression.png)

| Page | Situation | Choice 1 (points, path) | Choice 2 (points, path) |
|---|---|---|---|
| Sam replies | Sam answers within the hour. They have been unwell and fell behind. They can finish most of it by Thursday morning, but they are worried about the quality. | *Agree a draft to the group by Wednesday night* (\`3\`, \`"Set a checkpoint"\`) | *Offer to take half the section* (\`2\`, \`"Shared the work"\`) |
| Wednesday night | You finish Sam's section at midnight. Your own section is rushed. On Wednesday Sam appears in the chat: "Sorry, nearly done with mine!" | *Tell the group what happened and agree how to merge* (\`3\`, \`"Told the group"\`) | *Say nothing and hand in both versions* (\`0\`, \`"Said nothing"\`) |
| The lecturer replies | The lecturer thanks you and suggests you talk to Sam and the group first, using the course's group work guide. | *Message the group, following the guide* (\`3\`, \`"Followed the guide"\`) | *Wait for the lecturer to contact Sam* (\`0\`, \`"Waited"\`) |

Use the prompts *How do you respond?*, *What now?* and *What next?*. The best route, asking Sam and agreeing a checkpoint, scores 6.

## 8. The endings

On each of the three ending pages:

1. Add a title (\`A strong outcome\` and so on) and a line saying how it went, for example \`You raised it early, kept everyone talking and the work stayed fair.\`
2. Add a text layer saying \`Score: {score} out of 6\`, and one saying \`Your path: {taken.join(" > ")}\`.
3. Add a button labelled **Start again**. In its **Interactions** section press **+ When clicked…**, choose **Start over** and press **Add**. It clears \`score\` and \`taken\` and goes back to the first page.

## 9. Try it

1. Click an empty part of the canvas and press **Preview**.
2. Choose *Message Sam*. You land on **Sam replies**, and the path line says *Path so far: Asked Sam*.
3. Choose *Agree a draft*. You land on **A strong outcome** with a score of 6.
4. Press **Start again** and take the quiet route instead (*Quietly write Sam's section*, then *Say nothing*). That scores 0 and ends on **A learning moment**.

Watch \`score\`, \`taken\` and \`ending\` change in **Variables (live)** on the left of the Preview (press **Debug** in Preview's bar if it isn't showing). Press <kbd>Esc</kbd> to close it.

![Preview on Sam replies after Message Sam: How do you respond? with two choices, Path so far: Asked Sam, and Variables (live) showing taken Asked Sam, score 3 and ending A mixed outcome.](help/tutorial-branching-preview.png)

## Make it yours

- **Change the bands.** The numbers in \`ending\`'s formula decide which ending a score earns. If you add choices, raise them to match.
- **Branch deeper.** A choice can go to any page, including another consequence page. Only the last choices on a route need **One named by an expression**.
- **Go back a step.** A **Go to a page** node set to **Back (where the learner came from)** returns to the page before, but the score keeps the points. To undo a choice too, use **Change a value or counter** first: **Do** **Add to it** with a minus value, and **Remove from the list (by position)** on \`taken\`.

## What you learned

- Each page is a scene, and **Go to a page** moves between them.
- One click can run a row of nodes: add to a score, add to a list, then change page.
- A **Worked out** variable with **Keep up to date** turns the score into a page name, and **One named by an expression** goes there.
- **Start over** puts every variable back and returns to the first page.

**Next:** [A "which one are you?" quiz](tutorial-personality) uses several scores at once. More on the graph in [Interactions](interactions), on formulas in [Variables](variables#worked-out-from-a-formula) and [Expressions](expressions).`,
  },
};
