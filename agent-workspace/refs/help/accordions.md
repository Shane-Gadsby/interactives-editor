# Accordions and tabs
A frame whose sections open one at a time, or a row of tabs with one panel showing. No wiring.

An **accordion** is a stack of sections where opening one closes the others. **Tabs** are the same idea lying down: a row of headers with one panel showing. Both are a setting on a frame, so there is nothing to wire up.

**Add one:** **Accordion** and **Tabs** each have a button of their own in the **Web** group of the tool bar (it starts folded: click **Web** to open it), and both are in the command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>). One click builds it on the open page. You get three sections and the variable that remembers which is open. A section of the accordion folds open and shut rather than blinking, and the ones under it glide to make room. That is **Animate changes** in each frame's [Auto layout](auto-layout#animate-changes) section, so you can change its speed or turn it off.

## How a frame becomes one
Turn on **Make this an accordion** in the frame's **Accordion** section. Then:

- Each layer in the frame is a **section**. Its **first** layer is the header (the part you click) and everything after it is the panel.
- **Open** is **One at a time** (the usual accordion, and what tabs need) or **Any number**.
- **Keeps what's open in** is a variable: a number for one at a time (counting from 0, with -1 for none), a list for any number. Without one, nothing opens when you click.
- **Clicking the open one closes it** lets an accordion close fully. Tabs leave it off.

Because what's open is just a variable, anything else can read or change it: a **Next** button, a binding, a script, a [starting point](page-navigation#named-starting-points).

## Tabs
Set **Panels** to a layer inside the frame whose own layers are the panels, and **Tab list** to the layer whose own layers are the tabs. Tabs and panels are matched in order: first tab, first panel. The **Tabs** button builds exactly this, drawn the way tabs are on most of the web: a row of tabs standing on a thin line, the showing tab with a heavier label and a line under it in the button colour, and each panel a box of its own with room round its words. Changing tab fades the new panel in.

## What you get for free
Both work the way accordions and tabs do everywhere else on the web (they follow the W3C's published patterns), without you setting anything.

**An accordion:**

- Each header is a button inside a heading, and says whether its section is expanded: a screen reader reads "Section 2, button, collapsed, heading level 3".
- The pointer turns to a hand over a header, whatever kind of layer the header is.
- Each header has a **chevron** at its far end that turns over as the section opens. Untick **Chevron on each header** to go without.
- Only the **header** opens and closes a section. Clicking in a panel's own words does nothing, so reading a section never shuts it.
- <kbd>Enter</kbd> and <kbd>Space</kbd> open and close. <kbd>Tab</kbd> goes from header to header and into an open panel.
- Each panel is a named region, so a screen reader can jump to it. A closed section takes no room: the ones under it move up.

**Tabs:**

- A screen reader says "tab list, 3 tabs", which tab is selected, and that each panel belongs to its tab.
- <kbd>Tab</kbd> lands on the selected tab, then goes into the panel. <kbd>←</kbd> and <kbd>→</kbd> move along the tabs and wrap round at the ends, <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last. Each tab is shown as you reach it. A column of tabs uses <kbd>↑</kbd> and <kbd>↓</kbd> instead.
- Tabs made before **Tab list** existed keep working, with the tabs beside the panels. Set **Tab list** to get the rest.

**Good to know:** the editor canvas shows the first section open, whatever the variable says, so you can style the open and closed looks without playing it. [Layer states](layer-states) are the tidy way to make an open header look different.

**More:** [Groups and frames](groups-frames), [Auto layout](auto-layout), [Variables](variables), [Layer states](layer-states).
