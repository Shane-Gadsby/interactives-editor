import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 60,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-responsive',
  topic: {
    id: 'tutorial-responsive',
    title: 'Make it work on a phone',
    group: 'Build it',
    summary: 'A page of cards laid out by auto layout, and a narrow variant that stacks them for a phone. The player swaps between them by width.',
    keywords: 'tutorial responsive phone mobile narrow wide variant breakpoint auto layout hug fill fixed grid stack column fr page width slider pairing report layout item',
    body: `You will make one page with a title, three cards about the rocky planets and a **Next** button. Nothing on it is placed by hand: auto layout arranges it. Then you add a narrow version for phones, where the cards stack in one column, and watch the player swap between the two as the page gets narrower. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Make it work on a phone**. **Play** runs it and **Make my copy** gives you your own copy.

Three words come up all the way through. A layer that is **Fixed** keeps the size you gave it. One that **hugs** shrinks or grows to fit what is in it. One that **fills** takes the room its frame has to give.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Rocky planets** as the name and press **Create project**. The editor opens with one page called **Home**, 800 by 600.

## 2. A frame that lays itself out

1. Press <kbd>F</kbd> for the **Frame** tool and drag a frame over the whole page.
2. In the Properties panel, change **Name** to **Content**. Set **X** and **Y** to 0, and **W** to 800.
3. Find the **Auto layout** section and press its **+** (**Add auto layout**). The frame is now a column.
4. Set **Gap** to 16, and all four boxes under **Padding (top, right, bottom, left)** to 32.

**Hug height** is ticked, so the frame shrinks to fit what is in it. It is empty for now, so it is only as tall as its padding. That is fine: it grows as you add things.

## 3. The title

1. Press <kbd>T</kbd> for the **Text** tool and drag a text box inside **Content**. A layer you draw inside a frame goes into it, and the frame places it.
2. Type \`The rocky planets\`, then press <kbd>Esc</kbd>. Name it **Title**, and in its **Text** section set **Size** to 32.
3. A **Layout item** section has appeared in the Properties panel, just under **Layer**. It says how this layer sits in its frame. Set **W** to **Fill** (W and H there are lists: **Fixed**, **Hug** and **Fill**). The title now runs the whole width of **Content**, inside the padding, however wide **Content** is.

## 4. A grid for the cards

1. Press <kbd>F</kbd> and draw a smaller frame anywhere on the page. Name it **Cards**.
2. A frame you draw always goes on the page itself, so move it in: in the **Layers** panel, drag **Cards** onto **Content**. It should sit under the title on the page. If it is above it, drag it again. (The Layers panel lists a frame's layers last first, so the one at the top of the list is the one at the bottom of a column.)
3. With **Cards** selected, set **W** to **Fill** and **H** to **Hug** in **Layout item**.
4. Press **+** on its **Auto layout** section, then change **Layout** to **Grid**.
5. Type \`1fr 1fr 1fr\` in **Columns** and press <kbd>Enter</kbd>: three columns, each an equal share. Leave **Rows** empty, and set **Column gap** and **Row gap** to 16.
6. Set the four **Padding** boxes to 0, so the cards line up with the title.

![The Auto layout section for Cards: Layout set to Grid, Columns 1fr 1fr 1fr, Rows empty, Column gap and Row gap 16, the four Padding boxes at 0 and Hug height ticked.](help/tutorial-responsive-grid.png)

## 5. The first card

1. Draw one more frame, name it **Mercury**, and drag it onto **Cards** in the Layers panel. It drops into the first cell of the grid.
2. Set **Radius** in its **Frame** section to 12. In **Fill**, press the small arrow beside the colour, open the **Tokens** tab and pick **color/surface**, a soft grey that changes with the theme.
3. Press **+** on its **Auto layout** section. Keep it a column, set **Gap** to 8 and the **Padding** boxes to 16.
4. In **Layout item**, set **W** to **Fill** (in a grid, that fills the cell) and **H** to **Hug**.
5. Press <kbd>T</kbd> and drag a text box inside **Mercury**. In the Properties panel's **Text** box, write the name on the first line and a fact on the second:

   \`\`\`
   Mercury
   The smallest planet, and the closest to the Sun.
   \`\`\`

6. Name the text **Mercury text**, and set its **W** to **Fill** in **Layout item**. The card now hugs its text: write more and it grows.

## 6. Two more cards and a button

1. Select the **Mercury** frame and press <kbd>Ctrl</kbd>+<kbd>D</kbd> (<kbd>Cmd</kbd>+<kbd>D</kbd> on a Mac) twice. The copies fill the second and third columns.
2. Rename them **Venus** and **Mars**, and their texts **Venus text** and **Mars text**. Change the words:
   - \`Venus\` and \`The hottest planet, under thick clouds.\`
   - \`Mars\` and \`The red planet, with the tallest volcano we know of.\`
3. Press <kbd>B</kbd> for the **Button** tool and drag a button inside **Content**, below the cards. Set its **Label** and **Name** to **Next**. Leave its **W** and **H** in **Layout item** on **Fixed**: a button should stay the size you made it.

Try changing **Content**'s **W** to 600 and back. The title and the grid follow it, the cards share the width, and the button stays the same.

## 7. Add a phone version

1. Click the page's name, **Home**, above it on the canvas. The Properties panel shows the page.
2. Open the **Responsive** section and press **Add narrow variant**.

A copy called **Home narrow**, 360 px wide, appears to the right of **Home**, and it is selected. The two are now a **responsive set**: **Home** is the **base**, shown from a page width of 560 px up, and **Home narrow** is shown below that. Its layers, timelines and interactions are copies of **Home**'s.

3. The usual breakpoint is 600. In the list in the **Responsive** section, set **Home**'s **from** to **600**.

Once a page is in a set, the section's buttons read **Add narrower** and **Add wider**, and the Layers panel shows each member's range beside its name.

![The Layers panel with Home (600+ px) and Home narrow (0 to 599 px), the two pages side by side on the canvas, and the Responsive section listing Home narrow from 0 and Home from 600, with the pairing line under them.](help/tutorial-responsive-set.png)

## 8. Rearrange the phone version

The copy is still laid out for 800 px, so it runs off its page. Fix it on **Home narrow** only:

1. Select **Content** on **Home narrow** and set **W** to 360. Set its four **Padding** boxes to 20.
2. Select **Cards** and change **Columns** to \`1fr\`. The three cards stack in one column, each as wide as the page.
3. Select **Title** and set its **Size** to 26.

If the button now sits below the bottom of the page, select the page (click **Home narrow** above it) and make its **H** bigger.

## 9. Read the pairing report

Select either page and look at the bottom of its **Responsive** section. It has a line for moving between the two, **Home ⇄ Home narrow**, and under it how many layers were **paired by name**, then **nothing left over**.

When a viewer's page changes width while they are using it, the player swaps pages and carries over what they did, matching layers and timelines **by name**. That is why the card texts have their own names. Rename **Mars text** to **Text** on one page only and the report lists it as only in one of them, so anything an interaction changed on it would be lost in the swap. Put the name back.

## 10. Try it

1. Press **Preview** at the top right.
2. A **Page width** slider shows under the top bar, with **600** marked on it. Next to it, **Showing** says which page is on screen.
3. Drag the slider slowly to the left. As it crosses 600 the three cards in a row become one column: **Showing Home narrow**. Drag back to the right and **Home** returns.

![Preview with the Page width slider at 480 px, below the 600 mark: Showing Home narrow, with the three cards stacked in one column.](help/tutorial-responsive-preview.png)

4. **Full width** puts the preview back to its whole width. Press <kbd>Esc</kbd> to close the Preview.

## Go further

- **Add wider** in the **Responsive** section adds a member above the widest one, for big screens.
- Mix fixed and shared tracks: **Columns** of \`200px 1fr\` gives a column that stays 200 px and one that takes the rest.
- **Stack** in **Layout** puts every child in one cell on top of each other, which is handy for a badge on a picture. **Stack position** says where they sit.
- Select a page and, in its **Project** section, set **Fit** to **Fit width (page height follows)**. Each page then fills the width of the box it is in, which suits a responsive set.

## What you learned

- **Auto layout** places a frame's children for you: a column, a row, or a **Grid** of tracks such as \`1fr 1fr 1fr\`.
- **Layout item** says how one layer sits in its frame: **Fixed**, **Hug** or **Fill**.
- **Add narrow variant** makes a phone version of a page; the player shows whichever member fits the width, from its breakpoint up.
- Layers and timelines pair **by name** across the set, and the pairing report says what would not carry.

**Next:** every auto layout setting is in [Auto layout](auto-layout), and how a set switches and what it keeps is in [Responsive artboards](responsive). To check the page for keyboard users and screen readers, do [Check and fix accessibility](tutorial-accessible).`,
  },
};
