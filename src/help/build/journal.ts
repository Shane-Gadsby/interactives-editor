import type { BuildTutorial } from './index';
import { all, bound, clickThen, layerWhere, nodesOfKind, pageNamed, renamed, saw, textHas, variableWhere } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 50,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-journal',
  topic: {
    id: 'tutorial-journal',
    title: 'A reflection journal that remembers',
    group: 'Build it',
    summary: 'Two reflection prompts with text boxes and word counts that are still there when the learner comes back, and a page that puts it all together to download.',
    keywords: 'tutorial journal reflection writing text box textarea word count wordCount save as user data save progress load saved progress before activity loads resume come back remember download a file export',
    body: `You will make a short reflection journal: two prompts, each with a text box and a word count. What the learner writes is saved as they type, so it is all still there when they come back. A second page puts the whole reflection together and downloads it as a text file. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Reflection journal**. **Play** runs it and **Make my copy** gives you your own copy.

The trick is that the text boxes are tied to variables, and those variables are ticked **Save as user data**. The player saves them and puts them back for you, so there is nothing to wire up for saving. The **Reflection journal** and **Guided writing workbook** starters work the same way.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **My learning journal** as the name and press **Create project**. Click the page so the Properties panel shows it, and change its **Name** to **Write**.

## 2. Make the two variables

Each text box needs a variable to keep what is typed in it.

1. Open the **Variables** tab at the bottom of the window.
2. Press **+ Add variable** and pick **Text**. A variable called **words** appears. Type **happened** over its name.
3. Open **Options** under it and tick **Save as user data**. That is the whole of the saving: the value is put back before the project starts, and saved a moment after it changes.
4. Do it again for a second **Text** variable called **learnt**, also ticked **Save as user data**.

![The Variables tab: happened and learnt are Text variables, each with Options open and Save as user data ticked.](help/tutorial-journal-variables.png)

## 3. Lay out the page

1. Pick the **Text** tool in the tool bar down the left, click near the top of the page and type \`My learning journal\`. Make it bigger in the Properties panel.
2. Add another text under it, for the prompt: \`What happened this week?\`
3. In the tool bar, click **Web** to open that group and pick **Input field**. Drag a wide box under the prompt, about 110 high.
4. In the Properties panel's **Input** section, set **Type** to **textarea** so it takes several lines, and write a **Placeholder** such as \`Describe what happened...\`
5. Still in the **Input** section, press **Bind to a variable…** and pick **happened**. The row now says the value is bound **⇄ Both**: typing writes the variable, and the variable fills the box.
6. In the **Accessibility** section, type \`What happened\` in **Text alternative**, so a screen reader can say what the box is for. The player puts it on the layer around the text box, not on the box itself, so a screen reader may still read just the placeholder: make the placeholder say it too.
7. Add a second prompt, \`What did you learn from it?\`, and a second text box bound to **learnt** the same way.

![The first text box selected on the Write page, with its Input section: Type textarea, the placeholder, and Value is bound ⇄ Both happened.](help/tutorial-journal-input.png)

## 4. Count the words

A text layer can show a formula: anything between curly brackets is worked out as the project plays.

1. Under the first box add a text: \`{wordCount(happened)} words\`. It reads **0 words** on the canvas and counts up as the learner types.
2. Under the second box add \`{wordCount(learnt)} words\`.
3. For a total, make a variable that works it out. In the **Variables** tab press **+ Add variable**, pick **Counter** and call it **totalWords**. Change **Starts as a value** to **Worked out** and type \`wordCount(happened) + wordCount(learnt)\` in the formula box. Tick **Keep up to date**, so it is worked out again whenever either answer changes.
4. Add a text near the bottom of the page: \`{totalWords} words so far. Aim for about 100.\`

## 5. Say welcome back

\`userData.restored\` is how many saved variables came back, so it is more than 0 only for someone returning. Add a text under the title:

\`{userData.restored > 0 ? "Welcome back. Your writing is just as you left it." : "Your writing is saved as you type, so you can come back to it."}\`

## 6. Put the whole reflection together

1. In the **Variables** tab add one more **Text** variable called **reflection**. Set it to **Worked out**, tick **Keep up to date**, and give it this formula (one line):

   \`"WHAT HAPPENED\\n" + (happened.trim() || "(Not written yet)") + "\\n\\nWHAT I LEARNT\\n" + (learnt.trim() || "(Not written yet)")\`

   \`\\n\` starts a new line, and \`||\` gives the words after it when nothing has been written. Leave **Save as user data** off: it is worked out from the two answers, which are saved already.
2. In the **Layers** panel press **+ Add page**. Change the new page's **Name** to **My reflection**.
3. Give it a title, **My reflection**, and a big text layer under it that says just \`{reflection}\`.
4. Go back to **Write** and add a **Button** at the bottom right. Change its **Label** to **See my reflection**. In its **Interactions** section press **+ When clicked…**, choose **Go to a page…**, pick **My reflection** under **Which page** and press **Add**.
5. On **My reflection**, add a **Back** button the same way, with **Go to the previous page**.

## 7. Download it

1. On **My reflection**, add one more button with the **Label** **Download as a file**.
2. In its **Interactions** section press **+ On click (empty)**. The **Interactions** tab opens on a **When clicked or hovered** node.
3. Drag from the dot on its right edge into empty space. In the **Add and connect** menu, type \`download\` in **Find a node…** and pick **Download a file**.
4. In the node's settings set **File name** to \`"my-reflection"\` (with the quotes: it is a formula), **Contents** to \`reflection\` and **Type** to **Text (.txt)**.

![The My reflection page's graph: Download button's When clicked or hovered joined to Download a file, with File name "my-reflection", Contents reflection and Type Text (.txt) in its settings.](help/tutorial-journal-download.png)

## 8. Count it as done

Click an empty part of the canvas, open **Results and progress**, and set **Complete when** to **Reaching an artboard**, then pick **My reflection**. A learner who gets to the end has completed it.

## 9. Try it

1. Press **Preview**. Type a few sentences in each box and watch the counts go up.
2. Press **See my reflection**: both answers are there under their headings. Press **Download as a file** to get **my-reflection.txt**.
3. Close the Preview with <kbd>Esc</kbd> and open it again. That is like a learner coming back: your writing is still in the boxes and the welcome line says so.
4. **Forget saved data** in Preview's bar makes you a new learner again. It shows once something has been saved.

![Preview opened again after typing: the welcome line says Welcome back, both answers are still in their boxes with 29 and 13 words, and the Debug panel shows happened, learnt, totalWords and reflection.](help/tutorial-journal-welcome-back.png)

On the **Link for StudyDesk** the writing is kept for each learner in each course, under their StudyDesk session, so it follows them to another computer. Anywhere else it stays in their browser.

## Go further: choose when it saves

**Save as user data** saves all the time, which suits a journal. If you would rather save at one moment, such as when the learner presses **Submit**, use two nodes instead (and untick **Save as user data**):

1. On the **Write** page, in the **Interactions** tab, type \`before\` in **Search nodes** and click **Before activity loads**. It runs once as the activity opens, before anything shows.
2. Join a **Load saved progress** node after it and tick **happened** and **learnt** under **Variables**. It goes on from **Loaded** when something came back and from **Nothing saved** on a first visit, so you can set up a fresh start there.
3. On the button that should save, add a **Save progress** node with the same two variables ticked.

Both ways save to the same place. See [Save user data and Load user data](results#save-user-data-and-load-user-data).

## Make it yours

- Add more prompts: one more **Text** variable ticked **Save as user data**, a box bound to it, a count line, and a part for it in the **reflection** formula.
- Change **Type** in **Download a file** to **Markdown (.md)** or **Web page (.html)** for a nicer file. Put \`html(...)\` around anything the learner typed in a web page.

## What you learned

- A text box bound **⇄ Both** to a variable keeps what is typed in that variable.
- **Save as user data** saves a variable for each learner and puts it back before the project starts. **Save progress** and **Load saved progress** do the same at moments you choose.
- \`wordCount\` and other formulas work in text, and a **Worked out** variable with **Keep up to date** follows the variables it reads.
- **Download a file** gives the learner their work as a file.

**Next:** more on saving in [Save as user data](variables#save-as-user-data) and [Results and progress](results). The formula helpers, \`wordCount\` among them, are in [Expressions](expressions#helpers). Saving reports and pictures is in [Download a file](sensors#download-a-file).`,
  },
  guide: {
    1: { check: all(renamed, pageNamed(/^write$/i)), show: ['project-name', 'panel-inspector'] },
    2: { check: all(variableWhere('happened', (v) => v.type === 'string' && v.userData === true), variableWhere('learnt', (v) => v.type === 'string' && v.userData === true)), show: ['add-variable', 'panel-variables'] },
    3: { check: all(layerWhere('input', (n) => n.inputType === 'textarea'), bound('input', 'value', 'happened'), bound('input', 'value', 'learnt')), show: ['tool-input', 'panel-inspector'] },
    4: { check: all(textHas('wordCount(happened)'), textHas('wordCount(learnt)'), variableWhere('totalWords', (v) => !!v.formula && !!v.live), textHas('{totalWords}')), show: ['tool-text', 'panel-variables'] },
    5: { check: textHas('userData.restored'), show: 'tool-text' },
    6: { check: all(variableWhere('reflection', (v) => !!v.formula && !!v.live), pageNamed(/my reflection/i), textHas('{reflection}'), clickThen('button', 'action.artboard', undefined, 2)), show: ['add-page', 'add-when-clicked'] },
    7: { check: all(nodesOfKind('action.saveFile'), clickThen('button', 'action.saveFile')), show: ['add-empty-click', 'panel-logic'] },
    8: { check: (c) => c.project.settings?.reporting?.completion === 'artboard' && !!c.project.settings.reporting.completionArtboard, show: 'panel-inspector' },
    9: { check: saw('previewed'), show: 'preview' },
  },
};
