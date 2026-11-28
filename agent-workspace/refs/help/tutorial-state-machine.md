# Tutorial 3: A state machine with variables
Build a lamp that switches on and off, with a tap counter, using variables, a data binding and Set variable nodes.

A *state machine* is a thing that is always in one state, and moves to another when something happens. In Ixia the state lives in **variables**, the things that happen are **events**, and the look of each state comes from **bindings**.

You will build a lamp. A button switches it on and off, and a counter shows how many times you pressed. It takes about ten minutes.

## 1. Make a project and two variables

1. Press **New project** on the projects page. In **Start a new project** keep **Blank project**, type **Lamp** as the name and press **Create project**.
2. Open the **Variables** tab at the bottom, press **+ Add variable** and pick **Switch (on or off)**. A row appears.
3. In **Name** type `lit`, then press <kbd>Tab</kbd> (the name is saved when you leave the field). The **Type** is already **True/false (switch)**. Leave the starting value unticked (false).
4. Press **+ Add variable** again and pick **Counter**. Name it `taps`. The **Type** is **Number (counter, score)** with the starting value 0.

You can type a name in plain words too, such as **Lamp on**. Formulas need a name made of letters, digits and `_`, so the editor offers `lampOn` in a small **Name in formulas** box, and keeps your words as the label you see in lists. The names in this tutorial are already plain, so they are used as typed.

![The Variables tab: lit is true/false and starts false, taps is a number and starts at 0, each with a small T button at the left of its name.](help/variables-panel.png)

## 2. Draw the lamp

1. Press <kbd>O</kbd> for the **Ellipse** tool. Drag on the page holding <kbd>Shift</kbd> to make a circle. Name it **Bulb**.
2. In the Properties panel's **Fill**, set the colour to a pale grey, `#c9ced6`.
3. Press <kbd>T</kbd> for the **Text** tool and click under the bulb. Type `Taps: {taps}` and press <kbd>Escape</kbd> to finish. Anything in braces is an *expression*, so the text will show the number. Name the layer **Counter**.
4. Press <kbd>B</kbd>, drag a button under the text and set its **Label** to **Switch**.

## 3. Bind the bulb's colour to the variable

A *binding* keeps a property up to date with an expression.

1. Select **Bulb** and scroll the Properties panel to **Data bindings**.
2. Press **+ Add binding** and pick **Fill colour** (type `fill` to find it quickly).
3. A row for the binding appears. Choose **Formula** rather than **Variable**, and in the box under it type:

```
lit ? "#ffd23f" : "#c9ced6"
```

That says: if `lit` is true the colour is yellow, otherwise it is grey. While it is bound, the binding decides the fill: a colour picked by hand is replaced by the binding's.

![The Data bindings section with a binding on fill.color set to a formula, with a Pick a calculation link under it. The + Convert… menu below changes the value before it is set.](help/bindings-section.png)

## 4. Add the interaction

1. Select the **Switch** button. In its **Interactions** section press **+ When clicked…**.
2. Choose **Switch something on or off** and, under **Which switch**, pick **lit**. Press **Add**.
3. Press **+ When clicked…** again. Choose **Change a number…**, pick **taps** and press **Add** (it adds 1).

The section now reads: **When clicked: switch lit on or off** and **When clicked: add 1 to taps**. Two flows start from the same click, and both run. (In the graph they are a **When clicked or hovered** joined to a **Change a value or counter** each, with **Do** on **Flip on or off** and on **Add to it**.)

## 5. Try it

1. Press **Preview**.
2. Click **Switch**. The bulb turns yellow and the counter goes up. Click again and the bulb goes grey.
3. On the left of the Preview, the **Variables (live)** list shows `lit` and `taps`. Tick `lit` yourself, or type a number into `taps` and press <kbd>Enter</kbd>, to set them by hand. The **Events** list underneath records each click and the nodes it ran.

![The Preview with its debug panel: live variables on the left, the lamp in the middle and the events list underneath.](help/preview-debug.png)

## Go further: more than two states

- Make a variable called `mode` with **Type** **Choice** and the options `off, on, broken`. A choice shows as a dropdown wherever you set it.
- Bind the bulb's fill to `mode` and choose **By value** under the binding: it lists every option for you to give a colour.
- Use a **Check a condition** node with a condition like `taps >= 5` to move to `broken` after five presses. **Check a condition** has a **true** and a **false** output.
- Tick **Remember** (under **Options**) on a variable in the Variables tab to remember its value in the visitor's browser between visits.

## What you learned

- **Variables** hold state. They are shared by every page.
- **Change a value or counter** changes them. **When a value changes** reacts to a change.
- **Bindings** and `{braces}` in text show the state.

**Next:** [Tutorial 4: Importing a design file](tutorial-import-design). More: [Variables](variables), [Bindings](bindings) and [Expressions](expressions).
