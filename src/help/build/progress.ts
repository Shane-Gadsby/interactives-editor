import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 43,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-progress',
  topic: {
    id: 'tutorial-progress',
    title: 'Progress, badges and a page master',
    group: 'Build it',
    summary: 'A panel on every page with a progress bar and badges that light up as tasks are done, drawn once on a page master.',
    keywords: 'tutorial progress bar badges badge achievement reward page master shared panel header every page list variable tick list mark as done state across pages binding width opacity',
    body: `You will make a short tour of three study tips. Along the top of every page sits a panel with a progress bar and three badges. Pressing **Mark as done** on a tip fills the bar a third of the way and lights up that tip's badge, and both stay as the learner moves between pages. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Progress, badges and a page master**. **Play** runs it and **Make my copy** gives you your own copy.

Two ideas make it work. A **page master** draws the same panel on every page, so it is built once. And one **List** variable, \`done\`, holds the tasks that are finished. Variables belong to the whole project, so every page sees the same list.

## 1. Make the project and its pages

1. On the projects page press **New project**. Keep **Blank project**, type **Study skills tour** and press **Create project**.
2. Click the page's name and change **Name** to \`Welcome\`.
3. Press **+ Add page** at the bottom of the **Layers** panel four times, and name the pages \`Plan your week\`, \`Read actively\`, \`Write a draft\` and \`All done\`.
4. Press **+ Add page** once more and name it \`Progress panel\`. This one becomes the master.

## 2. The list of tasks done

Open the **Variables** tab, press **+ Add variable** and pick **List**. Name it \`done\` and leave its value as \`[]\`.

## 3. Build the panel

Work on **Progress panel**. Keep everything in the top 85 pixels of the page, because that strip is drawn over every page.

1. Press <kbd>R</kbd> and drag a rectangle across the whole top, about 800 by 84, starting at the top left corner. Name it **Panel background** and give it a light fill.
2. Add a text layer at the top left: \`Your progress: {done.length} of 3 done\`. Name it **Progress label**.
3. Draw a thin rectangle under it, 260 by 14, with **Radius** 7 and a pale grey fill. Name it **Bar track**.
4. Draw another exactly on top of it, the same size, in a strong colour. Name it **Bar fill**. In **Data bindings** press **+ Add binding**, pick **Width**, choose **Formula** and type:

\`\`\`
260 * done.length / 3
\`\`\`

With nothing done the bar is 0 wide; with all three it covers the track.

![Bar fill selected on Progress panel, with Read actively above it already drawing the panel, and its Data bindings: Width, In, Formula, 260 * done.length / 3, currently 0.](help/tutorial-progress-bar-binding.png)

5. Make the first badge on the right of the panel: a circle (<kbd>O</kbd>, hold <kbd>Shift</kbd>) about 44 across, a text layer with the letter \`P\` on top of it, and the word \`Planner\` in small text underneath. Select all three and press <kbd>Ctrl</kbd>+<kbd>G</kbd> to group them. Name the group **Planner badge**.
6. On the group, press **+ Add binding** in **Data bindings**, pick **Opacity**, choose **Formula** and type:

\`\`\`
done.includes("Planning") ? 1 : 0.25
\`\`\`

A binding's opacity runs from 0 to 1, so the badge shows faintly until *Planning* is in the list, then fully.

![The Planner badge group's Opacity binding: In, Formula, done.includes("Planning") ? 1 : 0.25, currently 0.25.](help/tutorial-progress-badge-opacity.png)

7. Copy the group twice (<kbd>Ctrl</kbd>+<kbd>D</kbd>) and move the copies along. Make them **Reader badge** (\`R\`, \`Reader\`, \`"Reading"\` in its binding) and **Writer badge** (\`W\`, \`Writer\`, \`"Writing"\`).

> The bar here is two rectangles so you can see a binding set a width. A **Progress bar** layer works on a master too, and gives a screen reader its value: see [Progress bars](progress-bars).

## 4. Make it the master of every page

1. Right-click **Progress panel** (its name above the page, or its row in the **Layers** panel) and choose **Make this a master**.
2. With it selected, open the **Page master** section of the Properties panel and press **Use for all other pages**.

Every page now shows the panel under its own layers. The panel's layers can't be clicked or changed on a page: **Edit master** in a page's **Page master** section takes you back to **Progress panel** to change them.

## 5. A task page

On **Plan your week**:

1. Add a heading \`Plan your week\` below the panel, and a tip under it: \`Block out your classes, then put two study sessions for each course into the gaps. Write the due dates in too.\`
2. Press <kbd>B</kbd> and drag a button under the tip. Name it **Mark as done** and set its **Label** to:

\`\`\`
{done.includes("Planning") ? "Done ✓" : "Mark as done"}
\`\`\`

3. In its **Interactions** section press **+ On click (empty)**. The **Interactions** tab opens on the new **When clicked or hovered** node.
4. Drag from the **When clicked or hovered** node's dot into empty space, type \`change\` in **Find a node…** and pick **Change a value or counter**. Set **Variable** to **done**, **Do** to **Add to the list, or take out if it is there** and **Value** to \`"Planning"\` (with the quotes).

![The graph for Plan your week: Mark as done's When clicked or hovered joined to Change a value or counter, with its settings: Variable done, Do Add to the list, or take out if it is there, Value "Planning". Back and Next have their own Go to a page rows.](help/tutorial-progress-toggle-node.png)

One press adds *Planning* to the list, so the bar grows and the Planner badge lights up. A second press takes it out again, so the button works as a tick box.

## 6. The other two tasks

Build **Read actively** and **Write a draft** the same way. Copy the heading, tip and button from **Plan your week** if you like, but each button needs its own click: copying a layer doesn't copy its interactions.

| Page | Tip | The task's name (in the label and the Value) |
|---|---|---|
| Read actively | Before you read, skim the headings and write one question. As you read, note the answer in your own words. | \`"Reading"\` |
| Write a draft | Write the messy first draft quickly, without editing. Fix it tomorrow, when you can see it with fresh eyes. | \`"Writing"\` |

## 7. The welcome, the end and the way through

1. On **Welcome**, add a title and a line such as \`Three short tips. Try each one, press Mark as done, and earn its badge in the panel at the top.\`
2. On **All done**, add a title and \`You earned {done.length} of 3 badges.\`
3. Select **Welcome**, open **Page navigation** in the Properties panel, choose **Back and Next** and press **Add to all 5 pages**. The master is left out, so it never becomes a stop on the way.

## 8. Try it

1. Select **Welcome** and press **Preview**.
2. Press **Next**, then **Mark as done** on **Plan your week**. The bar fills a third and the Planner badge lights up.
3. Press **Next**. The panel on **Read actively** shows the same progress: it is the same list, read again on a new page.
4. Go back and press **Done ✓** to take it out again. Press <kbd>Esc</kbd> to close.

![Preview on Plan your week after Mark as done: Your progress: 1 of 3 done, the bar a third full, the Planner badge lit and the other two faint, the button reading Done ✓, and done holding Planning in Variables (live).](help/tutorial-progress-preview.png)

## Go further

- **Remember it.** In the Variables tab, open **Options** under \`done\` and tick **Remember**. A learner who comes back finds their badges still lit.
- **Different badges.** A badge can read anything: \`done.length == 3\` for a gold star at the end, or a score from a quiz.
- **Leave it off a page.** On **Welcome**, untick a layer under **Show these master layers on this page** in the **Page master** section.
- **Screen readers.** Master layers are decorative, so a screen reader doesn't read the panel. The **Mark as done** label says the state on each page, and **All done** says the count.

## What you learned

- A **page master** holds what every page shares, and its bindings still follow the variables.
- A **List** variable and **Add to the list, or take out if it is there** make a tick list.
- Variables belong to the project, so state set on one page shows on every page.
- **Width** and **Opacity** bindings turn a list into a bar and badges.

**Next:** [An animated scene with speech bubbles](tutorial-scene). More in [Page masters](page-master), [Page navigation](page-navigation), [Bindings](bindings) and [Variables](variables#lists).`,
  },
};
