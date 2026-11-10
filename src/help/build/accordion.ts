import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 32,
  level: 'intermediate',
  minutes: 20,
  example: 'tut-accordion',
  topic: {
    id: 'tutorial-accordion',
    title: 'Accordion and tabs from data',
    group: 'Build it',
    summary: 'Sections that open and close while the ones below move to make room, one open at a time, drawn from one list. Then the same list as tabs.',
    keywords: 'tutorial accordion tabs collapsible expand collapse sections open close show more faq repeater list auto layout reflow hug height expanded aria screen reader event.index current tab',
    body: `You will make an accordion: four sections, each a heading you select to open the text under it. The sections below slide down to make room, and opening one closes the one that was open. A screen reader is told whether each section is open. All four come from one list, so you build one section. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Accordion from data**. **Play** runs it and **Make my copy** gives you your own copy.

Do [Flip cards from a list](tutorial-flipcards) first if you haven't used a repeater before. This one adds **auto layout**, which moves the copies when one grows or shrinks.

## 1. Make a project and the list

1. On the projects page press **New project**. Keep **Blank project**, type **Study habits** as the name and press **Create project**.
2. Add a title at the top with the **Text** tool: \`Four study habits\`.
3. Open the **Variables** tab. Press **+ Add variable**, pick **List** and name it \`sections\`. Replace its \`[]\` with:

\`\`\`
[
  {"title": "Plan your week", "body": "Put classes, work and study in one calendar at the start of the week, so a crowded day is no surprise."},
  {"title": "Study in short blocks", "body": "Forty-five minutes of focused work, then a real break, suits most people better than one long sitting."},
  {"title": "Test yourself", "body": "Close the book and try to recall the main points. Remembering an idea strengthens it more than reading it again."},
  {"title": "Ask for help early", "body": "If something does not make sense, ask your teaching team sooner rather than later."}
]
\`\`\`

4. Add another **List** called \`open\` and set it to \`[0]\`. It holds the places of the open sections, counting from 0, so the first section starts open. Use \`[]\` to start with everything closed.

## 2. The frame that holds the sections

1. Press <kbd>F</kbd> and draw a frame under the title, 720 wide and about 440 high. Name it **Accordion**.
2. In its **Auto layout** section press the **+** (**Add auto layout**). **Layout** is **Row or column** and **Direction** is **Column ↓**: its layers now stack top to bottom.
3. Set **Gap** to **10**, **Align** to **Stretch**, all four **Padding** boxes to **0**, and untick **Hug height**. The empty frame shrank to almost nothing when you added auto layout, so now type **440** in **H**, in the **Layer** section, to give it its height back.

## 3. One section

1. Draw a second frame somewhere empty on the page, 720 wide and 60 high. Name it **Section**, give it a light grey **Fill** (\`#f3f4f8\`) and a **Radius** of **12**.
2. Press the **+** in its **Auto layout** section too. Set **Align** to **Stretch**, so the text inside spans the whole width. Leave **Hug height** ticked: the section is always as tall as what is in it.
3. Press <kbd>T</kbd> and click inside **Section**. Type \`{open.includes(index) ? "-" : "+"}  {item.title}\` and press <kbd>Escape</kbd>. Name it **Section header**, and make it **Size** 20, **Weight** 600.
4. Click inside **Section** again, under the header, and type \`{item.body}\`. Name it **Section text**.

Auto layout puts the text under the header for you. Both are empty until the section is repeated.

## 4. Put the section in the accordion and repeat it

1. In the **Layers** panel, drag the **Section** row onto the middle of the **Accordion** row. Accordion is outlined, and Section goes inside it.
2. Select **Accordion**. In **Repeat (list)** tick **Repeat the first child for each item** and set **Repeat for each** to **List: sections**. Leave **Layout** on **Column**.

Four sections appear, one under the other, each with its own title and text. The first has a minus sign, because \`open\` holds 0, and the others have a plus.

![The Accordion frame selected, with Section and its two texts inside it in the Layers panel, and its Auto layout section: Row or column, Column, Gap 10, Align Stretch, Padding 0 and Hug height unticked.](help/tutorial-accordion-layout.png)

## 5. Open and close

\`open.includes(index)\` is true for an open section. Use it to show the text:

1. Select **Section text**. In **Data bindings** add **Visible**, choose **Formula**, press **Edit as formula** and type \`open.includes(index)\`.

Only the first section shows its text now (on the canvas the hidden text is a faint ghost, and it is gone in Preview). A hidden layer takes no room in auto layout, so the closed sections shrink to their header, and the column closes up.

The line under the formula works it out for the first section (\`index\` 0).

Now make the header open its section:

1. Select **Section header**. In **Interactions** press **+ On click (empty)**. The **Interactions** tab opens with a **When clicked or hovered** node for the header.
2. Drag from the dot on the right of that node into empty space, type \`change\` in **Find a node…** and pick **Change a value or counter** (the second one in the list, after *Change a layer's setting*).
3. Set **Variable** to **open**, **Do** to **Set to**, and **Value** to:

\`\`\`
open.includes(event.index) ? [] : [event.index]
\`\`\`

\`event.index\` is the section that was clicked. If it is open, \`open\` becomes empty and it closes. If not, \`open\` becomes just that one, which closes every other section at the same time.

## 6. Make it work for everyone

The header is a text layer, so tell the keyboard and screen readers it is a button that opens something.

1. With **Section header** selected, open **Accessibility** and set **Role** to **Button**. <kbd>Tab</kbd> now reaches each header and <kbd>Enter</kbd> clicks it.
2. In **Data bindings**, add **Expanded (button role)**, choose **Formula**, press **Edit as formula** and type \`open.includes(index)\`. A screen reader says *expanded* or *collapsed*.
3. Add **Text alternative**, choose **Formula** and type \`item.title\`. The screen reader then says the title without the plus or minus sign.

## 7. Try it

1. Press **Preview**.
2. Open **Test yourself**. The first section closes, Test yourself opens, and the ones below it move to make room.
3. Open it again and it closes. Watch \`open\` in **Variables (live)** (part of **Debug** in Preview's bar).

![Preview with Test yourself open under a minus sign, the other three closed under plus signs, and open listing 2 in the live variables.](help/tutorial-accordion-preview.png)

4. Use <kbd>Tab</kbd> and <kbd>Enter</kbd> to do the same with the keyboard. This needs the **Accessibility** button in Preview's bar to be on, which it is unless you have turned it off in Preferences.

## Go further: let several stay open

Change the **Value** in step 5 to \`event.index\` and **Do** to **Add to the list, or take out if it is there**. Each header now opens or closes just its own section.

## Go further: the same list as tabs

Tabs show one section's text at a time under a row of titles. They read the same \`sections\` list.

1. Add a **Counter** variable called \`tab\`, starting at 0.
2. Make a button with the **Label** \`{item.title}\`, select it, press <kbd>Ctrl</kbd>+<kbd>G</kbd> and give the group **Repeat (list)** with **Repeat for each** set to **List: sections** and **Layout** **Row**. One button per section appears in a row.
3. On the button, press **+ On click (empty)** and add **Change a value or counter**: **Variable** \`tab\`, **Do** **Set to**, **Value** \`event.index\`.
4. Bind the button's **Current (true, or page, step, location)** to \`tab == index\`, and its **Fill colour** to \`tab == index ? "#ffd54f" : "#e8eefc"\`, so the open tab looks and reads as the current one.
5. Under the row, add a text \`{sections[tab].body}\`. It shows the open tab's text.

## Make it yours

- **Add a section.** Add a line to \`sections\`. A fifth section appears, already working.
- **Too many for the frame?** Set the **Accordion** frame's **Overflow** to **Scroll vertically** so it scrolls in the player.
- **Ready-made.** The **Accordion** starter (Templates, **Explore and reveal**) is this, with the university look, a header button with its own sign, and a switch to let several stay open. Its **Fill in** tab edits the sections as a form.

## What you learned

- **Auto layout** stacks a frame's layers and closes the gap when one is hidden. A repeater in an auto layout frame reflows as its copies change size.
- A list such as \`open\` holds the state of every copy, and \`index\` reads it per copy.
- **Expanded (button role)** and a **Text alternative** binding make a text header a proper button for screen readers.

**Next:** [An image slider (carousel)](tutorial-carousel). More on [Auto layout](auto-layout), [Repeated lists](repeaters) and [Accessibility](accessibility#pressed-and-current).`,
  },
};
