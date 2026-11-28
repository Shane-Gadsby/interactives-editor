# Accessibility: roles and keyboard
Make shapes usable by keyboard and screen reader: roles, text alternatives, tab stops, Tab order and Announce.

Buttons, inputs and links are real controls, so keyboards and screen readers already handle them. A **shape** (or text, image, group) with a *When clicked or hovered → Click* is different: a mouse can click it, but a keyboard or screen reader user can't reach it. The **Accessibility** section in the inspector closes that gap.

## The Accessibility section
- **Role**: what the layer is to a screen reader. *Button* and *Checkbox* make it a tab stop that Enter and Space click. *Heading* (with a level 1 to 6), *Image* and *Region* describe structure. *Decorative* hides the layer from screen readers and keyboards completely (backgrounds, flourishes).
- **Text alternative**: the name a screen reader says. For a picture, describe what it shows; for a clickable shape, say what it does ("Next question"). It can be bound or animated like other properties.
- **Description**: a longer explanation read after the name.
- **Say it like**: what [read aloud](read-aloud) says for the layer instead of its text, for an abbreviation, a formula or a name a voice gets wrong. It is not shown and screen readers ignore it.
- **Read changes aloud** (text layers): a screen reader says the layer's words whenever they change while the project plays. See [Read changes aloud](accessibility#read-changes-aloud).
- **Tab stop**: *Automatic* (a layer is reachable when it has a *When clicked or hovered → Click*, a *When a layer is focused*, or a button or checkbox role), *Always*, or *Never*. The line underneath says what you get.
- A **Checkbox** role needs its state told: bind **Checked (checkbox role)** in Data bindings to the variable that holds it (see [Bindings](bindings)).
- **Pressed state** and **Current**: see [Pressed and current](accessibility#pressed-and-current).
- **Shortcut**: a key that clicks the layer, see [Shortcuts](accessibility#shortcuts).
- **Disabled look**: how dimmed a disabled button or input looks. See [Web elements](web-elements).
- A frame can be a **dialog**: see [Dialogs](accessibility#dialogs). A list, grid or radio group can use **Keyboard navigation**: see [Keyboard navigation](accessibility#keyboard-navigation).
- Buttons, inputs and links show only the text alternative and description. They already have the right role and keyboard behaviour.

## Describing a picture as you add it
Add a picture or a video (dropped, pasted, from the **Image** tool or the **Media Catalogue**) and the top of its settings shows a small box: **What is this a picture of?**. A few words is enough. **Save** (or <kbd>Enter</kbd>) writes them as the layer's **Text alternative**, which a screen reader reads in place of the picture. **Decorative** marks a picture that only decorates the page, so a screen reader skips it. **Skip** (or <kbd>Escape</kbd>) puts the box away for that layer.

The box never stops you doing anything else. Its example text comes from the file's name, or from the Media Catalogue's own description of the photo, and is never saved unless you type it. A picture you skip or answer is not asked about again, and the list of pictures still waiting is kept per project in your browser. The [Accessibility checker](accessibility-checker) still lists any picture with no description until it has one.

Turn the box off in [Preferences](preferences) (**Ask what a picture shows**) if you add many pictures at once and would rather describe them later from the checker.

## The focus ring
**Keyboard focus you can always see.** Whenever the keyboard moves to a layer, a ring shows which one. It appears for the keyboard only, not after a mouse click.

The ring is two-tone: the colourway's focus colour with a thin black or white edge. That way it shows on white pages, dark gradients and deep panels alike. Buttons, inputs and links show the same ring instead of the browser's own, so every tab stop looks the same. Nothing needs setting up. The focus colour follows the colourway you picked.

## What the keyboard does
- **Tab** and **Shift+Tab** move between tab stops, in layer order unless you set a tab order (below). A visible ring shows where the focus is (see [The focus ring](accessibility#the-focus-ring)).
- **Enter** clicks the focused layer, **Space** clicks it when released, the same way a real button does. It runs the layer's *When clicked or hovered → Click* nodes exactly like a mouse click, with the pointer position at the layer's centre.
- Only the layer itself is activated. A button or input inside a clickable frame does its own thing, so nothing runs twice.
- An Enter or Space that clicked a layer, or that was pressed on a button or link, does not also run a *When a key is pressed* node for the same key, so a game's "press Space" and a button's click can't both fire from one press.
- A key a *When a key is pressed* node handled does not also scroll the page, so a crossword or word search can use the arrows and Space without the course page moving behind it. Pick the grid in the node's **Only while this layer has focus** and the arrows (and, with an any-key node, Space and typing) belong to the activity only while the grid has focus; everywhere else the page scrolls as normal. Tab is never taken, so keyboard users can always leave. See [Interactions](interactions).
- Only *When clicked or hovered → Click* can be done from a keyboard. Hover, press, release and the older drag events can't, so give those layers a click alternative. Layers made [draggable](drag-and-drop) get a keyboard way (Space, arrows, Space) of their own.

## Pressed and current
A button that is on or off (a toggle, a segmented control, a filter chip) should say so. On a **Button** layer, or a layer with the *Button* role, set **Pressed state** to *Not pressed* or *Pressed* and a screen reader says "toggle button, pressed" (aria-pressed). Bind **Pressed (button, toggle)** in Data bindings to the variable that holds it, such as `mode == "list"`. *Not a toggle* says nothing.

**Current** marks the one layer of a set that is where you are: the open tab, the current page in a list, the step you are on. *Yes* is aria-current true, and *Current page*, *Current step* and *Current location* say which kind. It works on any layer, buttons and links included. Bind **Current (true, or page, step, location)** in Data bindings, for example `tab == 2`, or an expression that gives `"page"` for the current one and false for the rest. Use it instead of describing the state in the text alternative ("Showing now").

## Shortcuts
A layer's **Shortcut** is a key, or a key with modifiers (`r`, `1`, `Ctrl+Enter`, `Alt+N`, `Shift+/`), that clicks the layer from anywhere on the page: it runs the layer's *When clicked or hovered → Click* flows, presses a button or follows a link, the way Enter on the layer does.

It follows the same rules as a *When a key is pressed* node: keys typed into a text box are left alone (unless the shortcut holds Ctrl, Alt or Meta, so Ctrl+Enter can submit from a text area), holding a key does not repeat it, and an extra Ctrl, Alt or Meta means a browser shortcut, so it is ignored.

A hidden or disabled layer ignores its shortcut, and while a modal [dialog](accessibility#dialogs) is open the layers behind it do too. A layer that repeats uses its first copy.

Screen readers are told the key (aria-keyshortcuts); show it in the label too, such as "Replay (R)". The field warns when two layers use the same keys, or when a *When a key is pressed* node listens for them as well. Shortcuts count as the key way to a clickable shape for the [Accessibility checker](accessibility-checker).

## Dialogs
Select a **frame** and tick **This frame is a dialog** in its *Dialog* section. The player then announces it as a dialog (role dialog, with aria-modal when **Modal**, and the frame's **Text alternative** as its name, so give it one). The dialog is **open while the frame is visible**, so show it however you like: bind its Visible to a variable, use a *Show or hide a layer* node, or pick an **Open variable** and the frame shows while that variable is on (true, not 0, not empty).

When it opens, focus moves inside: to the **Initial focus** layer if you picked one, otherwise the first button, field or clickable layer in it, otherwise the dialog itself.

While a **modal** dialog is open, Tab and Shift+Tab stay inside it, focus that slips behind it is brought back, and clicks on the rest of the artboard are ignored (tick **Close on click outside** to make them close it instead).

**Escape** closes the dialog on top: it turns the Open variable off (false, 0 or empty) or, with no variable, hides the frame. When it closes, **Return focus** puts focus back on the layer that had it when the dialog opened. A dialog that is showing from the start does not take focus. A **Scrim** paints a colour over the rest of the artboard behind the dialog (it is drawn as a shadow, so it follows the frame and goes when the frame hides).

A dialog works inside an iframe or a page that embeds the player: the trap, Escape and focus use the player's own document. Keep the dialog at the top level of the artboard, not inside a clipping frame, so the scrim and the "outside" are the whole artboard. The [checker](accessibility-checker) flags a dialog with no name or nothing inside it a keyboard can reach.

## Keyboard navigation
A list of options is one Tab stop, not one per option. Select a **repeater**, or a group or frame whose layers are the options, and tick **Arrow keys move between the items** in *Keyboard navigation*. One item is the Tab stop (the one last focused), and the arrow keys, Home and End move focus between the rest, so a keyboard user Tabs past the whole list.

- **List**: Up and Down for a column (Left and Right for a repeater laid out as a row, or choose under **Arrows**). **Wrap round** goes from the last to the first.
- **Grid**: all four arrows move by row and column, using the repeater's columns (and its *Columns first* order), or the **Columns** you set on a container. Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the ends of the grid.
- **Radio buttons**: the radio-group pattern. All four arrows move and wrap, and **moving also selects**: the item it lands on is clicked, so the *When clicked or hovered → Click* flows that choose an option run. The group is a radio group and the items radio buttons for screen readers, with aria-checked following the focus, unless your items set their own **Checked** (bound to your selection variable), which then wins.

**Focused item** writes the focused item's number (from 0) to a number variable, and setting that variable moves the Tab stop, and the focus itself when it is inside the list at the time (so typing a letter that moves a cursor along a word moves the keyboard focus with it, and the next arrow goes on from there). To move focus into the list from outside (a clue button that picks a square), use *Focus layer* on the list: it lands on the Tab stop.

**Count hidden items** keeps every copy's number even when some are hidden (a square whose *Visible* is bound to false, a blank in a crossword), so item 12 stays item 12 and the index variable can be used straight as a position in your list. A hidden item is never focused, and in a grid the arrows step over it to the next shown item in the same row or column. Without it hidden copies are not counted, so the numbers shift.

The number also arrives as `event.index` in *When a layer is focused*, *When clicked or hovered* and *When a key is pressed* events for the items (as it already does for a repeater's copies). Keys typed into a text box and the arrows of a [draggable](drag-and-drop) item are left alone, and **a *When a key is pressed* node you wired for an arrow wins**: the navigation does nothing for a key that one of your nodes names, so nothing fires twice.

## Tab order
With nothing selected, the **Tab order** section in the inspector lists every tab stop on the artboard in the order Tab visits them. Use the arrows to move a layer earlier or later, or click its name to select it. **Reset to layer order** goes back to the default. The order only applies within the player; stops you haven't placed follow the others in layer order.

## Read changes aloud
A status line, a score or a “Slide 2 of 5” caption can say itself. Select the text layer and, in its **Accessibility** section, set **Read changes aloud** to *Yes, politely* or *Yes, urgently (interrupts)*. From then on a screen reader says the layer's words every time they change while the project plays, so you do not need an **Announce** node after the change. *Politely* waits for what is being read; *urgently* interrupts, which is for errors and not much else.

Words that are there when the page first shows are not said, only changes. The layer must stay on screen: a hidden layer says nothing, and neither does one marked **Decorative**. It reads the whole text each time, so keep it short. The **Screen reader** strip in Preview only shows what Announce nodes and **Say it** boxes say, not these.

## Say it
**Change a value or counter** has a **Say it** box. Put the words a screen reader should say once the change has happened, with any value in curly brackets: `Slide {slide} of {slides.length}`. It is said politely, after the new value is in, so `{slide}` is the new number. Left empty, nothing is said. The **+ When clicked…** list's **Change a number…**, **Go to the next item…**, **Go to the previous item…** and **Switch something on or off** ask for it too (optional). It is the same thing as an **Announce** node straight after the change, which is why the ready-made templates use it. Use an **Announce** node where the words depend on more than one change, or need to be urgent.

## Announce
The **Announce** action says something to screen readers without showing anything: write the text as an expression, such as `"Correct, " + score + " of 5"`. *Polite* waits for the current speech to finish; *Assertive* interrupts, for errors and urgent feedback. Scripts do the same with `ix.announce(text, 'polite' | 'assertive')`. In **Preview**, a strip under the preview shows what would be said, once you switch **Screen reader** on (a button in the Preview header, or Preferences; it is off by default).

## Turning it off
**Preferences → Accessibility features** (also a button in Preview) switches all of the above off in Preview: no extra tab stops, no keyboard clicks, no roles, no announcements, as projects played before these features existed. It is on by default.

The **Screen reader** strip under Preview, which shows what would be announced, is a separate preference (also a button in the Preview header) and is off by default.

If something looks wrong, check it with the setting off; if it goes away, report it. Exported files and embedded players keep the features on. A page embedding the player can pass `accessibility: false` (or `accessibility="off"` on the web component) to turn them off.

## What it doesn't do
Reading order is the layer order (rearrange layers to change it). Moving focus after a button changes the artboard isn't automatic; use *Focus layer* to put it somewhere sensible. Colour contrast, missing descriptions and other problems are for an accessibility checker, not these settings.
