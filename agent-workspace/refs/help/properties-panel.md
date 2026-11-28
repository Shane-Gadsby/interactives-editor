# The Properties panel and its search
What the right-hand panel shows for a layer, an artboard and the project, and how to find a property with the search box.

The **Properties** panel is on the right. It shows the settings of whatever is selected: a layer (or several), an artboard, or, with nothing selected, the artboard's and the project's settings. Each group of settings is a **section** with a title. Click the title to fold it, and the **?** beside it opens that section's page in the help.

Under many sections there is a one-line note that ends with **More about …**. It opens the help at the place with the full explanation. The notes stay short on purpose, so the detail is here in the help.

## How fields line up
Every field has its name on the left, in one column, and its box to the right. The boxes in a section all start in the same place and end in the same place, so a dropdown never sits further along than the number box above it.

- A long name wraps onto a second line inside its column instead of pushing the box along.
- Dropdowns, text boxes, number boxes and colour boxes are the same height.
- A small unit (%, px, ms) or a key diamond (the ◆ that adds a keyframe) has its own space at the right end. The space is kept whether or not the row has one, so the right edges match.
- The whole panel is one grid of four columns: a name, a box, a second name, a second box. A single field has its name in the first column and its box running across the other three. Two number boxes share a line (X and Y, W and H, Rotation and Opacity), and the second name is in the same place in every pair, so the second boxes line up too. A dropdown or a text box always has a line to itself.
- A name goes above its box only for a text area, code and lists.
- Tick boxes start under the boxes, not under the names. Two of them share a line, side by side, each as wide as its words (**Hug width** and **Hug height** stay on one line); if they would not fit the second drops to its own line.
- A dropdown that cuts a long choice short with … shows the whole choice when you hover over it. In **Blends**, each timeline's dropdown takes all the room the number and the remove button leave, and a weight per timeline has its weight on a second line.
- Rows of buttons are equal-width cells from the left edge, and wrap onto a new line when they would be squeezed.
- Every line is the same height and the same distance from the next. A group of settings starts a little lower than the line before it.
- Make the panel narrow (drag its edge) and the pairs turn into one field per line, so nothing is squeezed.
- The Interactions settings column and the Timeline's Keyframe column use the same layout.

## Folding sections
Click a section's title to fold it or open it. The editor remembers your folds. Fold **Accessibility** on one layer and it stays folded on the next layer, and after you reload.

- Folds are kept with your preferences, so they follow you to any computer you sign in on. Without a signed in session they are kept in this browser instead.
- Only the sections you changed are kept. A section you never touched follows the editor's own default.
- **Alt**-click a title to open only that section and fold the rest.
- Right-click a title, or use the arrow button beside the search box, for **fold all**, **unfold all** and **Back to the default folds**.
- Searching opens every section so nothing is hidden from it, and your folds come back when you clear the box.
- The **+** buttons open their section so you can see what you added.

## Moving sections
Put the sections of the Properties panel in the order you work in. Drag a section by its title (a small grip shows in the margin as you point at it) and let go where the gold line is, or click a title and press <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Alt</kbd>+<kbd>Down</kbd>. Right-click a title for **Move this section up**, **Move this section down** and **Back to the default section order**. A screen reader says where it went ("Fill moved to position 3 of 12"). <kbd>Esc</kbd> while dragging puts it back.

- Each kind of layer keeps its own order: one for rectangles, one for text, one for the page, one for Libraries, and so on. Move **Accessibility** to the bottom for text and it stays there for every text layer.
- The order is saved with you, never in the project, so nobody else sees it. It is kept with your preferences, so it follows you to any computer you sign in on (without a signed in session, it is kept in this browser).
- The tool bar works the same way: drag its groups, and the tools inside them, by their titles.
- A section the editor adds later turns up in its own default place instead of being thrown to the bottom. A section that only shows for some layers keeps its place relative to the others when it appears.
- Folding, searching and the help links work the same wherever a section sits. While you search the properties the sections sort by how well they match, and your order comes back when you clear the box.
- **Preferences** has **Reset section and tool order**, which puts every panel and the tool bar back. The order is the same for the whole editor: there is no per-project copy.

## Searching the properties
The box at the top of the panel finds a property by what it does or what it is called. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd> while the focus is in the panel (or click the box).

- It matches the label, the tooltip, the section title and other names people use. Try *transparency* (finds **Opacity**), *round* (**Corner radius**), *alt* or *aria* (**Description** and **Text alternative**), *hide* (**Visible**), *colour* or *color* (the colours), *font size* (**Size**), *z-order* (**Draw order**) or *width* (**W**).
- Small typos are fine (*opacty*, *blnd*), and the order of the words doesn't matter (*radius corner*). Every word you type has to match something.
- The best matches win: a property named exactly what you typed beats one that starts with it, which beats one with a word that starts with it, which beats a looser guess. Weaker guesses are left out when there are good matches.
- The panel shows only the matching rows. Sections that start folded open, sections with nothing in them go away, and the section with the best match comes first. A line under the box says how many properties it found.
- If nothing matches it says so and offers the closest name (*Did you mean Opacity?*); click it to use it.
- The down arrow (or <kbd>Enter</kbd>) in the box moves to the first match. <kbd>Esc</kbd> clears the search, and the panel goes back to how it was.
- Found fields work as they always do: type in them, drag their labels, key them with the diamond. The search stays while you pick other layers, so you can look at one property across several layers.

The search works for a layer, several layers, an artboard, several artboards and the project settings.
