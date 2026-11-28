# Instances (components)
Place one artboard inside another, with its own timelines, interactions and inputs.

Any page can be placed inside another as a **component**. The layer it makes is called an **instance**, and the Inspector shows it as **Component**. It is a live copy that runs its own timelines and interactions on the parent's clock. Edit the source page and every instance updates.

## Placing a component
There are four ways, and all of them make the same instance layer.

- **From the page you are working on**: right-click an empty part of the page (or a layer on it) and choose **Insert component here…**. A box lists the other pages. Type a few letters of a name to find one and press <kbd>Enter</kbd>. It lands centred where you right-clicked. **Insert a component here…** is also in the command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>), where it puts the component in the middle of the open page.
- **By dragging**: drag a page's row from the **Layers** list onto another page on the canvas. The page it would land in is outlined in gold, and the component lands centred under the pointer.
- **From the page you want to reuse**: right-click it (its name on the canvas, or its row in **Layers**) and choose **Place in…**, then the page to put it in. Or select it and pick the page from **Use in** (it says **Component in…**).
- **In the instance itself**: choose a page in an instance layer's **Artboard** field.

A component bigger than the page it goes on is shrunk to fit. Pages that would contain each other, and library copies (read-only until detached), aren't offered. Instances can be nested up to six deep, and a page that contains itself stops at that limit.

## Settings on an instance
- **Fit** decides how the page sits in the instance's box: **Stretch to the box**, **Contain**, **Cover** or **Actual size, centred**.
- **Fit to page content** is the fifth, and it only shows when the source page has [Fit height to content](artboards) on. The box keeps the width you give it, and its height follows whatever the page inside needs while the project plays: a dialog's text growing, a tooltip opening, a list filling from data. It eases if the source page does (**Animate height changes**), so there's one movement, not two. The height typed on the instance layer is ignored while this is on.
- **Reset size** puts the box back to the page's own size.
- **Edit** followed by the page's name jumps to the source page.
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source. If the source page says what it takes (below), those come first as ordinary fields and this box is only for anything else. Write it as JSON, such as `{"level": 3}`.
- Messages sent inside an instance (**Send message**, `ix.emit`) bubble up to the parent.

## What the component takes
A page's variables are already its settings. **What it takes** (a section on the page, under **Page**) says which of them an instance may set, so every instance shows proper fields instead of a box of JSON.

- Pick a variable under **Add**. It joins the list.
- **Name** is what the instance calls it. Leave it empty and it uses the variable's own name.
- **Hint** is a line under the field saying what it does.
- The arrows move a setting up or down; the bin takes it off the list again.

The variable's own type decides the field: a number gets a number box, a true/false gets a tick, a colour gets the colour picker, and a variable with choices on it gets a dropdown of those choices. Every field starts on **The page's own value**, so an instance only carries what you actually changed.

The section only shows once the page is used somewhere as a component, or once it already takes something.

## Steering an instance while it plays
The parent can change an instance while the project plays.

- **Give an embedded page a value** (an action) sets one of the instance's variables by name. Pick the instance layer, write the variable's name as it is in the instance's page, and give a value (an expression).
- **Trigger something in an embedded page** sends a message into that instance only. Its *When a message arrives* nodes and scripts run, and the parent's own nodes do not hear it.
- Scripts do the same with `ix.setInstanceInput('Badge', 'level', 3)` and `ix.fireInstanceTrigger('Badge', 'ping', payload)`. Both return `false` when no such instance is showing. A repeated instance answers in every copy.
- Read an input back with `instanceInput('Badge', 'level')` in any expression (so *Give an embedded page a value* can flip a true/false input with `!instanceInput('Badge', 'flag')`), or `ix.getInstanceInput('Badge', 'level')` in a script. It gives the first copy's current value, and nothing when the instance is not showing.

## Animating inputs
Inputs can be **animated**. Select the instance, pick *Input level* (any number or true/false variable of the project, and the inputs the layer already sets) in the Timeline's property list and press **+ Key**. A number tweens between keys inside the instance. A true/false or text input steps. Blends mix input tracks like any other number, and a [binding](bindings) can drive an input too. A value you set with *Give an embedded page a value* or a script stays until the track's next key changes it.

Components can also be shared between projects: see [Libraries](libraries). To repeat shared layers such as a logo or footer on every page, a [page master](page-master) is lighter.
