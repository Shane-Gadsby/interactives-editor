import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 53,
  level: 'advanced',
  minutes: 25,
  example: 'tut-data-source',
  topic: {
    id: 'tutorial-data-source',
    title: 'Content from a data file',
    group: 'Build it',
    summary: 'A page whose heading, text and cards all come from one JSON file, so next term\'s rewrite is a file swap, not an edit of every layer.',
    keywords: 'tutorial data file data source json csv content words text from a file repeater repeat list cards binding bind item replace file swap rewrite reuse form view',
    body: `You will make a page of study tips where every word comes from one small file: the heading, the intro line, four cards and the footer. Each card even takes its colour from the file. Change the file and the page changes, so a new version for next term, or another course, is a file swap. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Content from a data file**. **Play** runs it and **Make my copy** gives you your own copy.

This tutorial uses **expressions**: words in braces, such as \`{tips.title}\`, that the player swaps for a value. If you haven't met them, do [Tutorial 3](tutorial-state-machine) first.

## 1. Write the data file

1. Open a plain text editor (Notepad on Windows, or TextEdit set to plain text on a Mac).
2. Copy this in, exactly as it is:

\`\`\`json
{
  "title": "Four study tips",
  "intro": "Small habits that make studying easier. Pick one to try this week.",
  "cards": [
    { "title": "Plan your week", "text": "Block out classes, study and rest before the week begins.", "colour": "#FFF4D6" },
    { "title": "Skim first", "text": "Read the headings and summary before the whole text.", "colour": "#E3F1FB" },
    { "title": "Use your own words", "text": "Notes in your own words show what you understand.", "colour": "#E6F4EA" },
    { "title": "Take breaks", "text": "A short break every hour keeps your focus.", "colour": "#F6E7F3" }
  ],
  "footer": "Study skills, week 1"
}
\`\`\`

3. Save it as \`tips.json\`. In Notepad, set **Save as type** to **All files** so it doesn't become \`tips.json.txt\`.

This is JSON. \`title\`, \`intro\` and \`footer\` are single values; \`cards\` is a list in square brackets, and each card in it has the same three fields. Keep those names: the page will ask for them.

## 2. Make a project and add the file

1. On the projects page press **New project**. Keep **Blank project**, type **Study tips** as the name and press **Create project**.
2. Open the **Data** tab at the bottom. If it isn't there, press **More panels** at the right of the bottom tabs and choose **Data**.
3. Press **+ From file** and pick \`tips.json\`.

The file is uploaded, and a data source called **tips** (from the file's name) appears in the list with a **json** badge. Pick it. On the left, **Name** says \`tips\`, **Format** says **JSON** and **From** says **Uploaded file**. On the right, the file opens in its **Form** view: **Title**, **Intro**, a card for each of the four tips, and **Footer**.

![The Data tab with tips picked: Name tips, Format JSON, From Uploaded file and File tips.json on the left, and the Form view on the right with Title, Intro and the four cards, the first one open.](help/tutorial-data-source-form.png)

## 3. Words from the file

1. Press <kbd>T</kbd> for the **Text** tool, click near the top left of the page and type \`{tips.title}\`. Press <kbd>Escape</kbd>. The canvas shows **Four study tips**: the words come from the file. Name the layer **Heading** and make it big.
2. Under it, add another text layer with \`{tips.intro}\`. Name it **Intro**.
3. Near the bottom of the page, add one with \`{tips.footer}\`. Name it **Footer**.

\`tips\` is the data source's name, and \`.title\` is a field in it. Anywhere an expression goes you can read the file this way.

## 4. One card, repeated

The cards are a **repeater**: you design one card, and it is copied once for each item in the list.

1. Press <kbd>F</kbd> for the **Frame** tool and drag a large box under the intro, most of the page wide and down to just above the footer. Name it **Cards**.
2. Press <kbd>R</kbd> and draw a rectangle inside the top left of **Cards**, about 350 wide and 150 high. Because you drew it over the frame, it goes inside it. Name it **Card background**, and give it a **Radius** of 12.
3. With the **Text** tool, click inside the rectangle and type \`{item.title}\`. Name it **Card title** and make it bold.
4. Click under it and type \`{item.text}\`. Name it **Card text**. Make it a little narrower than the rectangle so long lines wrap inside it.
5. In the **Layers** panel, click **Card background**, then <kbd>Shift</kbd>+click **Card text**, so all three are selected. Press <kbd>Ctrl</kbd>+<kbd>G</kbd> to group them, and name the group **Card**. It is now the only layer inside **Cards**.
6. Select the **Cards** frame. In the Properties panel open **Repeat (list)** and tick **Repeat the first child for each item**.
7. Change **Items** to \`tips.cards\` and press <kbd>Enter</kbd>. (It starts as \`tips\`, the whole file, which is not a list.)
8. Set **Layout** to **Grid**, **Cols** to **2** and **Gap** to **16**.

Four cards appear, two by two, each with its own tip. Inside a repeated layer, \`item\` is the item it was copied for, so \`{item.title}\` is that card's title. Change the card you drew (its size, its font) and every copy follows.

![The Cards frame selected, with four cards two by two on the canvas, and its Repeat (list) section: Items tips.cards, currently 4 items, Layout Grid, Gap 16 and Cols 2.](help/tutorial-data-source-repeat.png)

## 5. A colour from the file

The words aren't the only thing a file can hold. Each card has a \`colour\` too.

1. In the **Layers** panel pick **Card background** (inside **Card**, inside **Cards**).
2. In the Properties panel find **Data bindings** and press **+ Add binding**. Type \`fill\` and choose **Fill colour**.
3. Press **Formula** and type \`item.colour\`, then press <kbd>Enter</kbd>.

Each card now takes its colour from its own line in the file. The binding may say *There is no value called item* and *item is not defined* under the formula. Inside a repeated layer that warning is wrong: the cards on the canvas still show their colours.

![Card background selected, with a Fill colour binding set to the Formula item.colour, and the wrong warning that there is no value called item under it.](help/tutorial-data-source-binding.png) A **binding** ties any property to an expression in the same way: the position, the size, whether it shows.

## 6. Change the words in the editor

You don't have to go back to Notepad for small changes.

1. Open the **Data** tab and pick **tips**.
2. In the **Form** view, change **Footer** to \`Study skills, week 2\`. Wait a moment and the page shows it.
3. At the end of the cards press **Add another**. A fifth, empty card is added to the list, and a fifth copy appears on the page. Fill in its **Title**, **Text** and **Colour** (\`#FDEBDD\`).

Five cards don't fit two by two in the frame you drew. Make **Cards** taller, or set **Cols** to **3**. Every change in the form is saved as a new version of the file, and **Undo** brings the old one back.

## 7. Swap the whole file

This is the point of it: a new version is a new file, not an edit of every layer.

1. In your text editor, change \`tips.json\`: a new title, new tips, other colours. Keep the same field names (\`title\`, \`intro\`, \`cards\` with \`title\`, \`text\` and \`colour\`, and \`footer\`). Save it as \`tips-term2.json\`.
2. Open the **Assets** tab on the left and find **tips.json**.
3. Press the arrow on it (its tooltip says **Replace with a new version of the file**) and pick \`tips-term2.json\`.

![The Assets tab with tips.json, and the tooltip of its arrow button: Replace with a new version of the file.](help/tutorial-data-source-replace.png)

The page shows the new words at once. Everything that used the old file now uses the new one, and one **Undo** puts the old one back.

## 8. Try it

Press **Preview** at the top right. The page plays with the words from the file, exactly as a learner sees it. Press <kbd>Esc</kbd> to close it.

## Go further

- **A spreadsheet instead.** Save a sheet as CSV (first row the column names: \`title,text,colour\`) and add it with **+ From file**. A CSV becomes a list of rows, so **Items** is the source's name on its own, such as \`cards\`.
- **More than one page.** Every page can read the same source. A second page could show \`{tips.cards[0].text}\` large, for a tip of the week.
- **A file somebody else keeps up to date.** **+ From URL** reads the file from a web address each time the project opens. See [Data sources](data-sources).

## What you learned

- A **data source** is a file the project reads by name. **+ From file** in the **Data** tab adds one.
- \`{tips.title}\` in text shows a value from the file.
- A frame with **Repeat (list)** copies its first child once for each item, and \`item\` is that item.
- **Data bindings** set a property, such as **Fill colour**, from the data.
- The **Form** view edits the file in place, and the arrow in **Assets** swaps it for a new one.

**Next:** every way to read and edit a data file is in [Data sources](data-sources). Repeaters, grids and clicking a copy are in [Repeated lists](repeaters), and bindings in [Bindings](bindings).`,
  },
};
