# Tooltips, modals, confirmations, prompts and toasts
Overlays: pages that belong to no screen, shown beside or over whatever layer points at them.

A **tooltip**, a **modal**, a **confirmation**, a **prompt** and a **toast** are all the same idea: a page that isn't a screen of its own, shown beside or over the page you're on. The page is called an **overlay**.

**Add one:** **Tooltip**, **Modal**, **Confirmation**, **Prompt** and **Toast** each have a button of their own in the **Web** group of the tool bar (it starts folded: click **Web** to open it), and all five are in the command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>). One click builds it, wired up. Pick the layer it belongs to first and it's pointed at that layer straight away; the new overlay page opens so you can write its words.

## Target and trigger
- The **target** is the layer the overlay belongs to: a tooltip appears beside it, and the link lives on it. It's whichever layer's **Overlay** section names the page.
- The **trigger** is what makes it show. It's the target itself unless you pick another layer, so most of the time you set nothing.
- To pick a trigger, choose it in the **Trigger** list, or press the button beside that list and click a layer on the canvas.

That split is what lets a tooltip belong to a small icon while a much bigger area around it opens the tooltip.

**The pointer says what will happen.** Over a trigger that opens a modal, a confirmation or a prompt it turns to a hand, whatever kind of layer the trigger is, because a click does something. Over a tooltip's trigger it stays as it was: resting there is enough, and a hand would promise a click that does nothing. A layer with a **Cursor** of its own keeps it, and a disabled button never shows the hand.

## The five kinds
- **Tooltip.** Sits beside its target while the trigger is hovered or focused. **Side** chooses above, below, left or right, and **Wherever it fits** (the default) tries each in turn. A side you choose is kept unless there's no room there and there is on the opposite side, when it goes across (a tooltip below a card at the foot of the page would land on the card). Near the page's edge it slides in rather than changing side. **Gap** is the space between.
  - The **trigger is the whole layer**: point anywhere on a card made of a frame and its words, or tab to something inside it, and its tooltip shows. While a layer is being **dragged** its tooltip is put away.
  - It shows after the pointer has rested on the trigger for a moment: **Delay**, 300 ms unless you change it, so sweeping the pointer across a page doesn't set every tooltip off. Reaching the trigger with the keyboard shows it at once, and so does moving straight from one tooltip's trigger to another's.
  - A screen reader reads the tooltip as the **description** of its trigger.
  - It **fades** in and out. **Fade** is the **Project default** (the project's own transition time, **Page height time** in the project settings) or **Custom** with its own **Time**. A viewer whose device asks for less motion gets no fade.
  - It has a **Tail**: a small triangle on the side facing the target, pointing at the middle of it, in the tooltip's own colour. It follows whichever side the tooltip ended up on. Give the card a border and the tail takes it too, as one outline with the card, the same weight at any size the page is drawn. Untick **Tail** to go without.
  - **Stays while you're on it** keeps it open when the pointer moves from the trigger onto the tooltip, with a moment's grace to cross the gap, so a link or a button inside it can be reached. Turn it off for a plain label that should go the moment you leave. <kbd>Esc</kbd> puts a tooltip away either way.
  - The **keyboard reaches what's inside** the same way. With the trigger focused, <kbd>Tab</kbd> goes to the first link or button in the tooltip, <kbd>Tab</kbd> off the last one carries on to whatever follows the trigger, and <kbd>Shift</kbd>+<kbd>Tab</kbd> from the first goes back to the trigger. <kbd>Esc</kbd> from inside puts the tooltip away and hands the focus back to the trigger. A tooltip with nothing to press in it changes nothing about <kbd>Tab</kbd>.
- **Modal.** Covers the page, opened by clicking the trigger. The page behind it is dimmed, the keyboard stays inside, and <kbd>Esc</kbd>, a click outside, its **Close** button or the cross in its corner closes it. It **eases in and out** (and not at all for a viewer who asks for less motion), and when it closes the focus goes back to what opened it. It opens in the **middle of what the viewer can see**: on a tall page embedded in a course that is the part on screen, not the middle of the page, which may be out of sight. It stays where it opened if they scroll. The same goes for a confirmation and a prompt. A screen reader calls it by its **page's name**, so name the page for what it is ("Your progress", not "Dialog 2"); the same goes for a confirmation and a prompt. The dimming and the blocking of what's behind are part of being a modal, so they're there even with **Accessibility off** in Preview; only moving the focus in and keeping <kbd>Tab</kbd> inside follow that switch. The card of a new modal, confirmation or prompt is the page's own background colour, the brightest thing on the dimmed page.
- **Confirmation.** Asks a question and takes the answer from its buttons. A screen reader hears it as an **alert dialog**, named by its heading and described by its message, and the focus starts on the first button, so put the safe answer (**Cancel**) first. The buttons are a **list**: add one by adding a row, rename one by changing its label, and mark the answer you mean with `"main": true` so it stands out from the ways out. For an answer that deletes or can't be undone, use `"danger": true` instead and the button is red (label it **Delete**, not **Yes**: say what it does). Picking a button writes what it stands for into **What they chose** and closes it. A click outside doesn't dismiss a confirmation.
- **Prompt.** Asks for something typed. The focus starts in the box. **OK**, or <kbd>Enter</kbd> in the box, keeps what was typed in **What they answered** and closes; **Cancel** or <kbd>Esc</kbd> closes and leaves the last answer alone. Read that variable, or start a flow when it changes.
- **Toast.** A short message that appears over a corner of the page, stays a moment and goes by itself: "Plan saved", "Copied", "Couldn't reach the server". See [Toasts](#toasts) below. A new toast is a small card in the theme's own colours (light on a light theme, dark on a dark one), lifted off the page with a shadow.

## Opening one without a layer
A modal, a confirmation and a prompt each have a **showing** variable (**Dialog showing**, and so on). Turn it on and the overlay opens, on whichever page is open, with **no layer pointing at it**: a **Change a value** node at the end of a flow, a script, or a timer. Its page's **Overlay** section says so when nothing points at it. A tooltip always needs a layer, since it has to sit beside something.

A layer **inside an overlay** can point at another overlay too. A **More information** button in a tooltip opens a modal the ordinary way: select the button on the tooltip's page and choose the modal under **Overlay**.

## Toasts
**Add one:** the **Toast** button in the **Web** tools. Pick a button first (a **Save**, a **Copy**) and clicking that button is wired to show the toast. Otherwise add a **Show toast** node to any flow and choose the toast in it.

- **Show toast** has a **Message**: the words it says this time, as an expression (`"Plan saved"`, or `"Saved " + name`). They go into the toast's own text variable, so **one toast serves every message**. Leave it empty and the toast keeps the words it had.
- **Place** is a corner, or the middle of the top or bottom edge, and **Gap** is how far in from the edge. On a tall page it is the corner of the part the viewer can see. A bar the course page keeps fixed across its top can't be seen from inside the piece, so a toast at the top can end up under it: the bottom places are the safe ones.
- **Stays** is **For a time** (4 seconds unless you change **Time**) or **Until dismissed**. The time waits while the pointer or the keyboard is on the toast. A toast with **something to press besides its close button always stays until dismissed**, so nobody has to race a timer to press it.
- A new toast has a **close button** (a cross, named Close) wired to **Hide toast**, so whoever is reading it can put it away early. Delete the layer if you don't want one. Its own close button doesn't stop a toast going by itself: only something else to press does.
- **Comes and goes** is **Slides and fades** (what a new toast starts with: it moves up into place as it fades in and back down as it goes, or the other way up at the top of the page) or plain **Fades**. Both take the **Fade** time, the same setting a tooltip has, and a viewer who asks for less motion gets neither.
- It's **read out** to a screen reader as it appears, so it needs no **Announce** node beside it. Tick **It's an error** for something that has gone wrong and it interrupts instead of waiting its turn. It **never takes the focus**.
- Showing a toast that's already up gives it the new words and its full time again. Different toasts **stack**, the newest nearest the edge.
- **On its own** makes a toast show alone: showing it puts any other toast away, and showing another puts it away. Tick it on every toast and there is only ever one at a time, the latest.
- Nothing points at a toast, so it has no target or trigger and no lines on the canvas.
- **Its size works like a modal's.** The toast's page is its size: a new one has **Fit width** and **Fit height** on, so it hugs its words. Untick either and drag the page (or the card) to give it a set size. A toast made before this can be tied the same way with **The page sizes the overlay**.
- **Show toast** and **Hide toast** list only your toasts, not every page.

From a script: `ix.toast('Toast', 'Plan saved')` and `ix.hideToast('Toast')`.

## Seeing what it's linked to
An overlay lives on a page of its own, so the canvas draws its links for you. Open the overlay's page and a line runs from it to every layer it's linked to: a **solid blue** line to its **Target** (the layer a tooltip sits beside) and a **dashed gold** line to its **Trigger** (the layer that shows it), each with its word on it. Where the target is its own trigger there is one line, marked **Target and trigger**. A modal, a confirmation and a prompt aren't placed beside anything, so they show only what opens them.

Select a layer that shows an overlay, or one that is a trigger, and the same lines are drawn from that overlay. They are never part of the piece: Preview and exports don't have them.

## One overlay, many layers
An overlay page is a definition, so any number of layers can point at the same one, each with its own **Side** and **Gap**. Its own section lists everything pointing at it, and clicking a row jumps to that layer.

Each layer can also hand the overlay **its own words** as it opens. A modal, a confirmation and a prompt say what they take (**What it takes** on the overlay's page: a **Heading**, a **Message**, and for the last two a **For**), and those show as fields in the layer's **Overlay** section. So one confirmation can ask "Delete the photo?" from one button and "Leave the group?" from another.

**From a formula.** Under each of those fields is the same one as a formula, worked out as the overlay opens, and used instead of the typed value. `layer.name` is the name of the layer that opened it, and on a layer in a repeater `item` and `index` are that copy's own. So one link on a course card's info button serves every card: `item.title` fills the heading with the course it was opened from.

**On overlay open** and **On overlay close** go in the overlay page's own **Interactions**. They run however it was opened (a layer, its variable, a flow), after what it was handed is set and before it has faded in, so a flow there can fill the page for this opening. `event.layer`, `event.index` and `event.inputs` say who opened it and what it was given.

**For** is how you tell the answers apart: give each layer a word (`photo`, `group`), and the flow that reads **What they chose** can check **For** to see which layer asked. Add your own variables to **What it takes** and they become fields the same way.

An overlay can open another: a button inside a tooltip can open a modal, and the tooltip goes as the modal comes.

Overlays never appear in **Next** and **Previous**, never count in `pageCount`, and never make a page with [Fit height to content](artboards) any taller: they open over the page.

## The card
What those buttons make is a page holding one **card**: a single frame with the overlay's look on it (its rounded corners, border, shadow and padding). When an overlay page holds just one frame like that, the card *is* the overlay.

**The page sizes the overlay.** The card fills its page exactly, so there is one thing to size, not two: the page.

- A modal, a confirmation or a prompt has a set **Width** and **Fit height to content** on. Change the page's width and the card follows; its height is whatever the message and buttons need.
- A tooltip and a toast have **Fit width to content** on as well, so they are as big as their words. A tooltip's words stay on one line up to 260 wide and wrap after that.
- Want a fixed size? Untick the page's **Fit height to content** (or width) and type one. The card stops hugging on that side and is the size you give the page.
- Resize the card instead (its handles, or its own **W**) and the page takes that size, so either works. On a side that fits its content, the content decides and a pull springs back.
- The card's look (corners, border, shadow, padding) is still the card's own: select it to change them.

It's the **The page sizes the overlay** tick in the page's **Overlay** section. Untick it and the card is sized by itself again, with the page only somewhere to draw it. Overlays made before this keep working as they were; tick it on one and the page takes the card's size, so nothing that is shown changes.

The card uses [auto layout](auto-layout), so a modal's buttons sit under its message and a longer message pushes them down rather than running into them.

Put more than one layer straight on the page and the whole page is the overlay instead, at the page's size.

## Changing what's in one
An overlay page holds ordinary layers, timelines and interactions, so everything you know works there: repeated lists and bindings included. A modal's **Close** button is a plain **Set variable** on the page's own showing variable, which is also what <kbd>Esc</kbd> turns off.

**More:** [Pages](artboards), [Interactions](interactions), [Variables](variables), [Accessibility](accessibility).
