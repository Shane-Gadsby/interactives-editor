import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 51,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-survey-chart',
  topic: {
    id: 'tutorial-survey-chart',
    title: 'A poll with a live chart',
    group: 'Build it',
    summary: 'Learners vote on one question, then see a bar chart of how the whole class answered, counted and anonymous.',
    keywords: 'tutorial poll survey vote chart bar results class shared responses anonymous counts everyone live refresh look again dropdown select studydesk',
    body: `You will make a class poll: how do you usually get to campus? Each learner picks an answer and presses **Vote**, then sees a bar chart of how everyone in their class answered. Votes are counted and anonymous. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Poll with a live chart**. **Play** runs it and **Make my copy** gives you your own copy.

The class's answers live in a **Shared responses** data source. The Vote button adds the learner's answer to it, and the chart reads the counts back out. There are three pages: a start page, the question, and the results.

## 1. Make a project with three pages

1. On the projects page press **New project**. Keep **Blank project**, type **Class poll** as the name and press **Create project**. The editor opens with one page called **Home**.
2. In the **Layers** panel, press **+ Add page** twice. You now have **Home**, **Page 2** and **Page 3**.
3. Click **Page 2** in the Layers panel and change its **Name** in the Properties panel to **Vote**. Rename **Page 3** to **Results** the same way.

## 2. Make the shared responses

1. A new project keeps the **Data** tab put away. Press **More panels** at the right of the bottom tabs and choose **Data**.

![The More panels menu open over the editor, listing the panels put away for now: Icons, Libraries, Comments, Scripts, Data and the rest, with Show all panels and tools at the bottom.](help/tutorial-survey-chart-more-panels.png)

2. Press **+ Shared responses**. A data source called \`responses\` appears in the list with a **shared** badge, and its settings open beside it.
3. Leave **Who sees it** on **Everyone in this class**.
4. Set **Answers each** to **1**, so one person has one vote.
5. Set **Look again** to **5**. While the results page is open it asks for the class's answers every five seconds.
6. In **Sample answers**, type a few votes, one a line: \`Bus\`, \`Bus\`, \`Car\`, \`Walk\`, \`Train\`. Each line counts as one person. Only the canvas and Preview see them, so you can lay out the chart before anyone has voted.

![The Data tab: responses is selected with a shared badge, Who sees it is Everyone in this class, Answers each 1, Look again 5, and the counted answers show on the right.](help/tutorial-survey-chart-responses.png)

## 3. The start page

1. Click **Home** in the Layers panel to open it.
2. Press <kbd>T</kbd> for the **Text** tool, click near the top of the page and type \`Class poll\`. Make it big in the **Properties** panel.
3. Add a second text under it: \`One question and one vote. Then see how the whole class answered.\`
4. Add a third: \`Your vote is anonymous. The chart shows how many people chose each answer, never who chose it.\` Say this where people decide whether to take part. It is true of every Shared responses source: the page only ever gets counts.
5. Press <kbd>B</kbd> for the **Button** tool and drag a button under the text. Change its **Label** to **Start**.
6. With the button selected, press **+ When clicked…** in its **Interactions** section, choose **Go to the next page** and press **Add**.

## 4. The question

1. Open the **Vote** page. Add a text with the question: \`How do you usually get to campus?\`
2. In the tool bar down the left, click **Web** to open that group and pick **Input field**. Drag a box under the question.
3. In the **Input** section of the Properties panel, set **Type** to **select**. In **Options** type the answers, one per line: \`Bus\`, \`Train\`, \`Car\`, \`Bike\`, \`Walk\`.
4. Beside **Variable**, press **Bind to a variable…** and choose **+ New variable…**. Call it \`choice\` and press **Create variable**. Whatever the learner picks is now in \`choice\`.
5. Open the **Accessibility** section and type a **Text alternative**: \`How you usually get to campus\`. The player puts it on the layer around the dropdown, not on the dropdown itself, so a screen reader may not say it yet.
6. Add a button under the dropdown with the **Label** **Vote** and the **Name** **Vote button**.

## 5. Send the vote

The Vote button needs four things in a row, so build it in the **Interactions** graph.

1. With **Vote button** selected, press **+ On click (empty)** in its **Interactions** section, then open the **Interactions** tab at the bottom. A **When clicked or hovered** node is there with nothing joined to it.
2. Drag from the dot on its right edge into empty space and let go. In the **Add and connect** menu, type \`condition\` in **Find a node…** and choose **Check a condition**. Set its **Condition** to \`choice != ""\`, so nothing happens until an answer is picked.
3. Drag from its **true** dot and add **Take back shared responses**. Set **Shared responses** to \`responses\` and leave **Answer** empty. It takes this learner's earlier vote out, if they had one, so voting again changes their vote instead of being refused.
4. Drag from its output and add **Add to shared responses**. Set **Shared responses** to \`responses\` and **Answer** to \`choice\`.
5. Drag from its **Added** dot and add **Go to a page**. Set **Go to** to **A chosen page** and **Page** to **Results**.

![The Vote button's graph: When clicked or hovered, Check a condition, Take back shared responses, Add to shared responses and Go to a page, with Add to shared responses selected and its Answer set to choice.](help/tutorial-survey-chart-vote-graph.png)

> **Add to shared responses** goes on from **Not added** when the answer was refused: empty, a blocked word, or over the **Answers each** limit. Leave that dot unjoined here.

## 6. The chart

1. Open the **Results** page and add a heading text: \`How the class gets to campus\`.
2. A new project keeps the **Data** tools put away too. Under the tool groups on the left, click **More tools** so the **Draw**, **Data** and **Rig** groups show. Then click **Data** to open it and pick **Chart**. Drag a wide box under the heading. It starts as a column chart of four made-up items.
3. In the **Chart** section of the Properties panel:
   - Set **Kind** to **Bar (sideways)**, so long answers have room.
   - Set **Data** to \`responses.answers\`. That is the counted list, most votes first.
   - Set **Label key** to \`text\` and **Value key** to \`count\`.
   - Tick **Value labels**, so each bar says how many.

   The preview under **Data** lists your sample answers with their counts, and the chart on the canvas draws them.
4. Under the chart, add a text that counts the voters: \`{responses.people} people have voted so far.\` Anything in curly brackets is worked out as the page plays.
5. Add a button with the **Label** **Change my vote**. Give it **+ When clicked…**, **Go to the previous page**.

![The Chart section of the results chart: Kind Bar (sideways), Data responses.answers, Label key text and Value key count, and the four counted answers listed under Data: Bus 2, Car 1, Train 1, Walk 1.](help/tutorial-survey-chart-chart.png)

## 7. Try it

1. Go back to **Home** and press **Preview** at the top right.
2. Press **Start**, pick **Bike** and press **Vote**. The results page shows your sample answers as the class, plus your vote for Bike.
3. Press **Change my vote**, pick **Bus** and vote again. Bike drops out and Bus goes up by one: **Take back shared responses** did its job.

![Preview on the Results page after voting Bike: a sideways bar chart with Bus 2 and one each for Bike, Car, Train and Walk, a count on each bar, 6 people have voted so far, and Change my vote.](help/tutorial-survey-chart-results.png)

Press <kbd>Esc</kbd> to close the Preview.

## 8. Use it with a class

A real class only exists on the **StudyDesk learner page**: press **Share**, then **Share…**, choose **In a StudyDesk page, and keep learners’ results**, and put the **Link for StudyDesk** it gives you in your course. There each vote is kept under the learner's StudyDesk account and course, and everyone in the same course sees the same chart. Anywhere else (an exported file, an ordinary link) there is no class, so the chart stays empty.

Set the data source up before you share. Its rules are fixed when the project is shared, and **Update to the latest version** does not pick up a changed Shared responses source.

**How live is it?** The chart is not instant. The page asks for the class's votes again every **Look again** seconds (5 here, never less than 2), so a new vote shows up within a few seconds of being made.

## Make it yours

- **Show at** holds an answer back until that many people have given it. Set it to 3 or so for a small class, so one person's vote never shows on its own.
- An answer nobody has chosen has no bar, so the chart changes shape as votes come in. To keep a bar for every choice from the start, type them in the data source's **Poll options** (\`Bus\`, \`Train\`, \`Car\`, \`Bike\`, \`Walk\`): each one is always in \`responses.answers\`, in that order, with 0 until someone picks it. The finished example does this.
- The data source's **What the class has said** list shows every answer by course, with **Hide**, **Remove** and **Clear this course**. Only the project's owner (or a power user) sees it.

## What you learned

- A **Shared responses** data source counts what a class adds, and never says who.
- **Add to shared responses** and **Take back shared responses** put a learner's answer in and take it out again.
- A **Chart** reads any list: here \`responses.answers\` with \`text\` and \`count\`, and it redraws as the counts come in.

**Next:** every setting and where the answers are kept is in [Shared responses](shared-responses). More about the Chart layer is in [Charts](charts). To chart numbers the learner sets themselves, try [A what-if explorer](tutorial-whatif).`,
  },
};
