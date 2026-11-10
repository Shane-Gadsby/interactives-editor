import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 42,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-personality',
  topic: {
    id: 'tutorial-personality',
    title: 'A "which one are you?" quiz',
    group: 'Build it',
    summary: 'Three questions whose answers each add to several tallies, ending on the result page for the highest score.',
    keywords: 'tutorial personality quiz which one are you what type study style tally tallies several scores outcome result page highest score formula worked out live counter duplicate page',
    body: `You will make a three-question quiz: *Which study style are you?* Every answer adds points to two of three tallies (Planner, Explorer and Collaborator), and the last answer goes to the result page of whichever tally is highest. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Which one are you? quiz**. **Play** runs it and **Make my copy** gives you your own copy. The **Personality quiz** starter (**Templates**, **Built-in**, **Branded starter packs**) is a longer one in the UniSQ look.

There is no right answer, so nothing is marked. Each result has its own counter, and a formula picks the biggest.

## 1. Make the project

On the projects page press **New project**. Keep **Blank project**, type **Which study style are you?** and press **Create project**. Click the page's name and change **Name** to \`Question 1\`.

## 2. Build the first question

1. Press <kbd>T</kbd> and add a small line at the top saying \`Question 1 of 3\`, then a bigger, bold one with the question: \`It is the start of semester. What do you do first?\`
2. Press <kbd>B</kbd> and drag three wide buttons under it. Name them **Answer 1**, **Answer 2** and **Answer 3**, and give them these **Label**s:
   - \`Put every due date in a calendar\`
   - \`Browse the course sites to see what looks interesting\`
   - \`Message people in my course to see who is studying what\`

The first answer on every page will lean to Planner, the second to Explorer, the third to Collaborator. Keeping that order is what lets you copy the page in step 5.

## 3. Three tallies

Each answer makes one counter as you wire it.

1. Select **Answer 1**. In its **Interactions** section press **+ When clicked…** and choose **Add 1 to a counter**. Under **Which counter** pick **A new counter…** and name it \`planner\`. Press **Add**.
2. Do the same for **Answer 2** with a new counter named \`explorer\`, and **Answer 3** with \`collaborator\`.

The **Variables** tab now has the three counters, each starting at 0.

## 4. Points to two tallies, then the next page

An answer that fits Planner best might also fit Collaborator a little. So each answer gives 2 points to one tally and 1 to another.

1. Under **Answer 1**'s sentence press **Show in graph**. Click its **Change a value or counter** node and change **Value** to \`2\`.
2. Drag from the node's dot into empty space, type \`change\` in **Find a node…** and pick **Change a value or counter**. Set **Variable** to **collaborator**, **Do** to **Add to it** and **Value** to \`1\`.
3. Drag from that node into empty space and pick **Go to a page**. Set **Go to** to **Next page**.
4. Do the same for the other two answers:

| Answer | 2 points to | 1 point to |
|---|---|---|
| Answer 1 | planner | collaborator |
| Answer 2 | explorer | planner |
| Answer 3 | collaborator | explorer |

Press **Read as sentences** above the graph: each answer should read as two counters and a page change.

## 5. Copy the page for the other questions

1. Right-click the name **Question 1** above the page and choose **Duplicate**. The copy, **Question 2**, has the same layers and the same interactions, already joined to its own buttons.
2. Duplicate **Question 1** once more for **Question 3**.
3. Change the words on the copies. Keep the order: Planner first, Explorer second, Collaborator third.

| Page | Question | Answer 1 | Answer 2 | Answer 3 |
|---|---|---|---|---|
| Question 2 | How do you like to prepare for an exam? | Work through a study timetable I made weeks ago | Hunt for extra examples and read around the topic | Quiz each other in a study group |
| Question 3 | A hard idea is not making sense. What do you do? | Break it into small steps and take one a day | Look for a video or a different explanation | Ask a classmate to talk it through with me |

Remember the line at the top: \`Question 2 of 3\` and \`Question 3 of 3\`.

## 6. The result pages

1. Press **+ Add page** at the bottom of the **Layers** panel three times, and name the pages \`You are a Planner\`, \`You are an Explorer\` and \`You are a Collaborator\`.
2. On each one, add the page's name as a title, a line or two about that style, and a text layer saying:

\`\`\`
Your points: Planner {planner}, Explorer {explorer}, Collaborator {collaborator}
\`\`\`

3. Add a **Take it again** button to each. In its **Interactions** section press **+ When clicked…**, choose **Start over** and press **Add**. It sets the tallies back to 0 and goes to the first page.

Ideas for the words: a Planner likes a clear schedule; an Explorer follows their curiosity; a Collaborator learns by talking things through.

## 7. Pick the highest

1. In the **Variables** tab press **+ Add variable**, pick **Text** and name it \`result\`.
2. Change **Starts as a value** to **Worked out** and type:

\`\`\`
planner >= explorer && planner >= collaborator ? "You are a Planner" : explorer >= collaborator ? "You are an Explorer" : "You are a Collaborator"
\`\`\`

3. Tick **Keep up to date**.

\`result\` is now the name of the result page with the highest tally. Ties go to the one asked about first: Planner, then Explorer.

## 8. Send the last answers to the result

On **Question 3**, open the **Interactions** tab. Each answer's last node is a **Go to a page** set to **Next page**. For all three, set **Go to** to **One named by an expression** and type \`result\` in **Page name or id**.

## 9. Try it

1. Select **Question 1** and press **Preview**.
2. Pick the first answer every time. You land on **You are a Planner**, with 6 Planner points and 3 Collaborator points.
3. Press **Take it again** and try a mix. Watch the tallies and \`result\` in **Variables (live)** as you go. Press <kbd>Esc</kbd> to close.

## Make it yours

- **More results.** Add a fourth counter and page, then add it to every answer's points and to \`result\`'s formula. With four or more, a list is tidier: the **Personality quiz** starter keeps one \`scores\` list and works out the top with \`scores.reduce((m, s, i) => s > scores[m] ? i : m, 0)\`.
- **Uneven weights.** An answer can give 3 to one tally and nothing to the others. Keep the totals roughly fair, or one result will win too often.
- **More questions.** Duplicate any question page; just move the result questions' **Go to a page** change to whichever page is last.

## What you learned

- Several **Counter** variables can each keep a tally, and one click can add to two of them.
- **Duplicate** copies a page with its interactions, so a pattern is built once.
- A **Worked out** variable with **Keep up to date** picks the highest, and **One named by an expression** goes to the page it names.

**Next:** [Progress, badges and a page master](tutorial-progress) keeps state across every page. More on formulas in [Variables](variables#worked-out-from-a-formula) and [Expressions](expressions), and the branching version of this idea in [A branching scenario](tutorial-branching).`,
  },
};
