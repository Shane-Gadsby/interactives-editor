import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 52,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-whatif',
  topic: {
    id: 'tutorial-whatif',
    title: 'A what-if explorer (sliders and formulas)',
    group: 'Build it',
    summary: 'A weekly budget with sliders for hours, pay and rent, and the totals and a chart worked out again as the learner drags.',
    keywords: 'tutorial what if explorer model simulation slider range input formula worked out keep up to date live variable chart budget money number format fmt decimals bind variable',
    body: `You will make a what-if explorer for a student's week: how many hours of paid work, the pay per hour and the rent. As the learner drags a slider, the income, the spending, what is left over and a chart all change with it. There is not a single interaction to wire. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **What-if budget explorer**. **Play** runs it and **Make my copy** gives you your own copy.

The model is made of **variables**. Three are inputs, each tied to a slider. Three more are **worked out** from the others with a formula, and are worked out again whenever an input changes. Text and the chart only read them.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Weekly budget** as the name and press **Create project**. The editor opens with one page called **Home**.

## 2. The inputs

1. Open the **Variables** tab at the bottom of the window.
2. Press **+ Add variable** and choose **Counter**. A number variable called \`count\` appears. Type \`hours\` in its name box, and set its starting value (the number in the **Value** column) to **15**.
3. Do the same three more times:
   - \`pay\`, starting at **28** (dollars an hour);
   - \`rent\`, starting at **220** (dollars a week);
   - \`food\`, starting at **150** (food and bills a week). This one has no slider. It is a fixed part of the model you can change in one place.

## 3. The worked out values

1. Add one more **Counter** and call it \`income\`.
2. In its **Value** column, change **Starts as a value** to **Worked out**. A formula box appears. Type \`hours * pay\` and press <kbd>Enter</kbd>.
3. Tick **Keep up to date**. Now \`income\` is worked out again every time \`hours\` or \`pay\` changes, not only at the start. It is read only: nothing can set it by hand.
4. Add two more the same way:
   - \`spending\`, worked out as \`rent + food\`;
   - \`leftover\`, worked out as \`income - spending\`.

![The Variables tab: income is Worked out with the formula hours * pay, currently 420, and Keep up to date ticked; spending below it is Worked out as rent + food.](help/tutorial-whatif-worked-out.png)

A worked out value can read other worked out values, so \`leftover\` follows both of the others.

## 4. The sliders

1. In the tool bar down the left, click **Web** to open that group and pick **Input field**. Drag a box near the top left of the page, about 320 wide and 32 high.
2. In the **Input** section of the Properties panel, set **Type** to **range**. The box becomes a slider.
3. Set **Min** to **0**, **Max** to **40** and **Step** to **1**.
4. Beside **Variable**, press **Bind to a variable…** and choose \`hours\`. The slider jumps to 15. Dragging it now sets \`hours\`, and changing \`hours\` moves it: it is a two-way (**⇄ Both**) binding.
5. Change its **Name** to **Hours slider**, and in the **Accessibility** section type a **Text alternative**: \`Hours of paid work a week\`. A slider has no words on it, so this is what a screen reader should say. (Right now the player puts an input field's text alternative on the box around it rather than on the slider itself, so a screen reader may not say it yet.)
6. Make two more sliders under it the same way:
   - **Pay slider**: **Min** 20, **Max** 40, **Step** 0.5, bound to \`pay\`;
   - **Rent slider**: **Min** 100, **Max** 500, **Step** 10, bound to \`rent\`.

![The hours slider selected on the page, with its Input section: Type range, Value is bound ⇄ Both hours, Min 0, Max 40 and Step 1.](help/tutorial-whatif-slider.png)

## 5. Formulas in text

Text can show a value as it changes: anything in curly brackets is worked out as the page plays.

1. Press <kbd>T</kbd> for the **Text** tool and click just above the hours slider. Type \`Hours of paid work: {hours}\`.
2. Above the pay slider: \`Pay per hour: \${fmt(pay, 2)}\`. **fmt** writes a number with a set number of decimals, so 28.5 shows as 28.50.
3. Above the rent slider: \`Rent: \${rent} a week\`. Under it: \`Food and bills: \${food} a week\`.
4. Under the sliders, three lines in bold:
   - \`Income: \${fmt(income, 2, true)}\`
   - \`Spending: \${fmt(spending, 2, true)}\`
   - \`{leftover < 0 ? "Short by $" + fmt(-leftover, 2, true) : "Left over: $" + fmt(leftover, 2, true)}\`

The third argument of **fmt**, \`true\`, puts a comma in every three digits. The last line picks its own words: when the week runs short it says so, instead of showing a minus sign.

## 6. The chart

1. A new project keeps the **Data** tools put away. Under the tool groups on the left, click **More tools** so the **Draw**, **Data** and **Rig** groups show. Then click **Data** to open it and pick **Chart**. Drag a box on the right half of the page.
2. In the **Chart** section, set **Data** to:

   \`[{label: "Income", value: income}, {label: "Rent", value: rent}, {label: "Food and bills", value: food}, {label: "Left over", value: leftover}]\`

   That is a list written out, one item per column, each reading a variable. The preview under **Data** shows the four items with today's numbers.
3. Tick **A colour for each item** and **Value labels**.
4. Set **Prefix** to \`$\` and **Decimals** to **0**, so each column says *$420* rather than *420*.
5. In the **Accessibility** section, give the chart a **Text alternative**: \`Column chart of a week of income, rent, food and bills, and what is left over\`.

![The Chart section for the budget chart: Kind Column, the list written out in Data with its four items listed under it, A colour for each item and Value labels ticked, Decimals 0 and Prefix $.](help/tutorial-whatif-chart.png)

## 7. Try it

1. Press **Preview** at the top right.
2. Drag the hours slider. The income line, the left over line and the Income and Left over columns change as you drag.
3. Drag the rent up past 300. The last line says *Short by* and the Left over column drops below zero.
4. Tab to a slider and use the arrow keys: it moves one **Step** at a time.

![Preview with the rent dragged to 350: Spending is $500.00, the last line says Short by $80.00, the Left over column drops below zero, and the Debug panel shows leftover at -80.](help/tutorial-whatif-short.png)

The **Variables (live)** list on the left of the Preview shows all seven values changing (press **Debug** in Preview's bar if you don't see it). Press <kbd>Esc</kbd> to close the Preview.

## Make it yours

- **Change the model, not the page.** Swap the formulas in the Variables tab and every text and the chart follow. A savings goal, a dose by body weight or a break-even point all work the same way.
- **Add an input.** Give \`food\` a slider of its own, or add a \`transport\` counter and make \`spending\` \`rent + food + transport\`.
- **Colour the result.** In the left over line's **Data bindings**, press **+ Add binding**, pick **Text colour** and use a **Formula** such as \`leftover < 0 ? "#b00020" : "#1b5e20"\`.

## What you learned

- A slider is an **Input field** of **Type** **range**, bound to a number variable.
- A variable that is **Worked out** with **Keep up to date** ticked recalculates whenever what it reads changes.
- \`{...}\` in text shows a formula's value, and \`fmt(n, decimals, true)\` writes money neatly.
- A **Chart** can read a list written out in its **Data**, and redraws as the variables change.

**Next:** more about worked out values is in [Variables](variables), and every helper like **fmt** is in [Expressions](expressions). Chart settings are in [Charts](charts). To chart what a whole class says, try [A poll with a live chart](tutorial-survey-chart).`,
  },
};
