import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 36,
  level: 'intermediate',
  minutes: 20,
  example: 'tut-diagram',
  topic: {
    id: 'tutorial-diagram',
    title: 'Mind maps and flowcharts from data',
    group: 'Build it',
    summary: 'A mind map whose branches fold and open on a click, and a flowchart learners follow one decision at a time, each drawn from a list by one box and one line.',
    keywords: 'tutorial mind map mindmap flowchart flow chart diagram concept map tree branches connector connectors lines arrows layout mindMap flowChart flowLinks list data repeater fold collapse decision follow step',
    body: `You will make two diagrams without placing a single box by hand. A **mind map** of study habits whose branches fold away and open again when you select them, and a **flowchart** for booking a study room that learners follow one answer at a time. Each is a list in the Variables tab, one box layer and one line layer: add a line to the list and a box and its line appear in the right place. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Mind map and flowchart from data**. **Play** runs it and **Make my copy** gives you your own copy.

Do [Flip cards from a list](tutorial-flipcards) first if you haven't used a repeater before. This one adds **connectors**, and a formula, \`mindMap(...)\`, that works out where every box goes.

## 1. Make a project and the list of ideas

1. On the projects page press **New project**. Keep **Blank project**, type **Diagrams** as the name and press **Create project**. Rename the page **Mind map**.
2. Open the **Variables** tab. Press **+ Add variable**, pick **List** and name it \`ideas\`. Replace its \`[]\` with:

\`\`\`
[
  {"id": "root", "label": "Healthy study"},
  {"id": "sleep", "parent": "root", "label": "Sleep"},
  {"id": "sleep1", "parent": "sleep", "label": "Same bedtime"},
  {"id": "sleep2", "parent": "sleep", "label": "No screens late"},
  {"id": "breaks", "parent": "root", "label": "Breaks"},
  {"id": "breaks1", "parent": "breaks", "label": "Every hour"},
  {"id": "food", "parent": "root", "label": "Food"},
  {"id": "food1", "parent": "food", "label": "Water at hand"},
  {"id": "move", "parent": "root", "label": "Movement"},
  {"id": "move1", "parent": "move", "label": "Walk between classes"}
]
\`\`\`

Each idea has an \`id\`, its words in \`label\`, and the \`id\` of the idea it hangs off in \`parent\`. The one with no parent is the middle of the map.

3. Add another **List** called \`folded\` and leave it as \`[]\`. It will hold the ids of the branches that are folded away.
4. Add a third **List** called \`map\`. Next to its type, change **Starts as a value** to **Worked out**, and type this formula in the box that appears:

\`\`\`
mindMap(ideas, {width: 720, height: 440, collapsed: folded})
\`\`\`

5. Tick **Keep up to date**, so \`map\` is worked out again whenever \`ideas\` or \`folded\` changes.

\`map\` is the same ideas with a place worked out for each: \`x\`, \`y\`, \`w\` and \`h\`, its \`depth\`, whether it is \`visible\`, and \`parentIndex\`, the place in the list of the idea it hangs off. The branches are spread either side of the middle, in a 720 by 440 area.

## 2. One box for every idea

1. Press <kbd>F</kbd> and draw a small frame where the top left corner of the map should be, under a title: **X** 40, **Y** 120, **W** 130, **H** 44. Name it **Idea**, give it a pale fill (\`#e8eefc\`), a dark **Stroke** and a **Radius** of 10.
2. Press <kbd>T</kbd>, click inside it and type \`{item.label}\`. Set **Sizing** to **Fixed**, **Align** center and **V-align** middle.
3. Select **Idea** and press <kbd>Ctrl</kbd>+<kbd>G</kbd>. Name the group **Ideas**. In **Repeat (list)** tick **Repeat the first child for each item**, set **Items** to \`map\` and **Layout** to **Free (bind x/y)**.

All ten boxes are on top of each other for now. Tell each copy where it goes:

4. Select **Idea** (inside **Ideas**). In **Data bindings** add four bindings, each a **Formula**: **X** \`item.x\`, **Y** \`item.y\`, **Width** \`item.w\`, **Height** \`item.h\`.
5. Select the text inside it and bind its **Width** to \`item.w\` and **Height** to \`item.h\`, so the words stay centred in a box of any size.

The map spreads out: the middle idea with four branches round it. The positions count from the corner where you drew the box.

6. Back on **Idea**, add **Fill colour** with \`item.depth == 0 ? "#ffd54f" : "#e8eefc"\`, so the middle stands out.

## 3. One line for every idea

1. Open the **Draw** group in the tool bar and pick **Connector** (or press <kbd>K</kbd>). Drag from the middle box to any other box and let go. A curved line joins them. Both ends are on **Idea**, copy 0 for now.
2. In the **Connector** section, under **Start**, set **Which copy** to \`item.parentIndex\`. Under **End**, set **Which copy** to \`index\`. That is: from this idea's parent, to this idea.
3. Set the **End** cap to **Plain**: mind map lines have no arrow.
4. With the connector selected, press <kbd>Ctrl</kbd>+<kbd>G</kbd> and name the group **Lines**. In **Repeat (list)**, tick it, set **Items** to \`map\` and **Layout** to **Free (bind x/y)**.
5. In the **Layers** panel, drag **Lines** below **Ideas**, so the lines go under the boxes.

There is now one line for each idea, from its parent to it. The middle idea has no parent (its \`parentIndex\` is -1), so it gets no line.

## 4. Fold and open branches

1. Select **Idea**. Add a binding on **Visible**: **Formula**, **Edit as formula**, \`item.visible\`. An idea inside a folded branch hides, and so does its line: a connector hides when the layer at either end is hidden.
2. In **Accessibility**, set **Role** to **Button**, and bind **Text alternative** to \`item.label + (item.folded ? ", " + item.kids + " ideas folded away" : "")\`.
3. Press **+ On click (empty)** and **Show in graph**. Drag from the event's dot and add **Change a value or counter**: **Variable** **folded**, **Do** **Add to the list, or take out if it is there**, **Value** \`map[event.index].id\`.

Press **Preview** and select **Sleep**: its two ideas fold into it, and selecting it again opens them. Then try the real point of it: close the Preview, add a line to \`ideas\` such as \`{"id": "food2", "parent": "food", "label": "Fruit for snacks"}\`, and the map makes room for it.

## 5. A flowchart to follow

A flowchart is the same idea with two lists, the steps and the links between them, and arrows instead of lines.

1. Press **+ Add page** at the bottom of the **Layers** panel and name it **Flowchart**.
2. Add two **List** variables. \`steps\`:

\`\`\`
[
  {"id": "s1", "kind": "start", "label": "Need a quiet room?"},
  {"id": "d1", "kind": "decision", "label": "Is a room free?"},
  {"id": "p1", "kind": "process", "label": "Book the room"},
  {"id": "p2", "kind": "process", "label": "Pick another time"},
  {"id": "e1", "kind": "end", "label": "Go and study"}
]
\`\`\`

and \`links\`, where \`label\` is the answer that takes you along it:

\`\`\`
[
  {"from": "s1", "to": "d1"},
  {"from": "d1", "to": "p1", "label": "Yes"},
  {"from": "d1", "to": "p2", "label": "No"},
  {"from": "p1", "to": "e1"},
  {"from": "p2", "to": "d1"}
]
\`\`\`

3. Add a **Text** variable called \`current\`, set to \`s1\`. It is the step the learner is on.
4. Add three **Worked out** lists, each with **Keep up to date** ticked:
   - \`chart\`: \`flowChart(steps, links, {width: 440, height: 440})\`, a place for every step, row by row from the start.
   - \`arrows\`: \`flowLinks(steps, links)\`, every link with \`a\` and \`b\`, the places of the steps it joins.
   - \`outs\`: \`arrows.filter(l => l.from == current && l.b >= 0)\`, the links out of the step the learner is on.
5. Go back to **Mind map**, select **Ideas** and **Lines** together, press <kbd>Ctrl</kbd>+<kbd>C</kbd>, select the **Flowchart** page and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. Rename them **Steps** and **Arrows**.
6. Change the **Items** of **Steps** to \`chart\` and of **Arrows** to \`arrows\`.
7. Select the connector inside **Arrows**. Set **Which copy** to \`item.a\` for **Start** and \`item.b\` for **End**, **Route** to **Elbow (right angles)**, the **End** cap to **Arrow**, and its label **Text** to \`{item.label ?? ""}\`, so the decision's arrows say Yes and No.
8. Select the box inside **Steps**. Remove the **Visible** binding and change **Fill colour** to \`item.id == current ? "#ffd54f" : "#ffffff"\`: the step you are on is yellow. Set its **Role** back to **None (plain shape)**, and bind **Current (true, or page, step, location)** to \`item.id == current ? "step" : false\`.

Now the panel that walks the learner through it, to the right of the chart:

9. A text \`{steps.find(s => s.id == current).label}\`, large and bold. It says where you are.
10. A button with the **Label** \`{item.label || "Continue"}\`. Select it, press <kbd>Ctrl</kbd>+<kbd>G</kbd>, and give the group **Repeat (list)** with **Items** \`outs\` and **Layout** **Column**. At the start there is one button, **Continue**. At the decision there are two, **Yes** and **No**.
11. On that button, **+ On click (empty)** and **Change a value or counter**: **Variable** **current**, **Do** **Set to**, **Value** \`outs[event.index].to\`.
12. A **Start again** button with **Change a value or counter** setting **current** to \`"s1"\`.

The copy of the mind map's click came with nothing joined to it on this page: interactions belong to a page, and only the layers were copied.

## 6. Try it

1. Select the **Flowchart** page and press **Preview**.
2. Press **Continue**. *Is a room free?* lights up and the buttons say **Yes** and **No**.
3. Press **No**: you are at *Pick another time*, and **Continue** takes you back to the question. Press **Yes** this time and carry on to *Go and study*.

## Make it yours

- **A text version.** A diagram is a picture to a screen reader. Add a text with \`{mindMapOutline(ideas)}\` on the mind map page, and \`{flowOutline(steps, links)}\` on the flowchart page: each gives the whole diagram as indented or numbered lines.
- **Shapes for each kind.** Bind the step's **Corner radius** to \`item.kind == "start" || item.kind == "end" ? item.h / 2 : 6\` for rounded ends.
- **Ready-made.** The **Mind map** and **Flowchart** starters (Templates, **Explore and reveal**) go much further: learners can add their own ideas to the map, the flowchart has proper diamond shapes, lights up the route taken and has a second page where learners drag the missing steps into place.

## What you learned

- \`mindMap(...)\` and \`flowChart(...)\` work out a place for every item, in a **Worked out** variable that keeps itself up to date.
- One box repeated with **Free (bind x/y)** and bindings on X, Y, Width and Height draws every item where it belongs.
- A **Connector** in a repeater joins two copies by their places in the list, with **Which copy**. You edit the data, never the boxes.

**Next:** back to [Build it](build-it) for the other tutorials. More on [Connectors](connectors), [Repeated lists](repeaters) and worked out variables in [Variables](variables#worked-out-from-a-formula).`,
  },
};
