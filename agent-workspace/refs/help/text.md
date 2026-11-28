# Text
Text layers, fonts, sizing and live values in text.

Use the **Text** tool (<kbd>T</kbd>): click for text that grows as you type, or drag a box for wrapping text. Double-click text to edit it, and <kbd>Escape</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

- **Sizing**: *Auto width* (one line, grows sideways), *Auto height* (fixed width, wraps and grows down) or *Fixed* (you set both). With *Fixed*, **Overflow** says what happens to lines that don't fit: *Show* them anyway, *Clip* them at the box, or cut the last line that fits with an *Ellipsis …*. Untick **Wrap lines** to keep the lines as written (long ones run on, or are clipped or cut by the overflow setting).
- **Fit text to box**: tick it and the editor picks the size for you, the largest that fits the box. See [Fit text to box](#fit-text-to-box).
- **Animating the box**: a text layer's **Height**, **Width** and **Pivot X / Y** can be keyed in a timeline like any other layer's. With *Fixed* sizing, a changing height clips or ellipsises the lines that no longer fit, and the vertical alignment keeps following the box. *Auto width* and *Auto height* text work their size out from the text, so keys on the size they work out have no effect. The pivot is the point the layer turns and scales around (0 is the top, 1 the bottom).
- **Font**: a search box over every Google font. Click it and type to filter ("playf" finds Playfair Display), then use <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> or click to pick, <kbd>Esc</kbd> to close. Each row is drawn in its own font. The chips above the list narrow it to Sans, Serif, Display, Handwriting or Mono. The project's own fonts come first (tagged *In project* or *Uploaded*), then a few system fonts, then the rest. See [Fonts](#fonts).
- Weight, italic, size, line height, letter spacing, alignment, vertical alignment, case and decoration.
- **Paragraph spacing**: extra space, in pixels, between paragraphs (the pieces of text between line breaks), on top of the line height. An *Auto height* or *Auto width* box grows to fit it. It does not apply to text with [modifiers](text-modifiers).

## Fit text to box
Tick **Fit text to box** on a text layer, a button or a link, and the size of the text is chosen for you. It is the largest size that makes the text fit the box, wrapping as usual. A short word fills the box and a long sentence shrinks to fit it.

- **Smallest** and **Largest** keep the size between two limits, in pixels. Leave one blank (it says *any*) for no limit on that side: *any* Smallest goes down to 1, and *any* Largest goes as big as the box height allows. If the Smallest is higher than the Largest, the Largest wins.
- It follows the text as it changes, including `{variables}` and text a binding sets. It re-fits when you resize the box, change the font or switch to another [responsive variant](responsive), in the editor and in the player alike.
- **Sizing** is *Fixed* (and greyed out) while it is on, because fitting needs a box that stays put. A button's label and a link's text have no Sizing to switch.
- The **Size** field is greyed out too. Neither it nor a timeline or binding on the font size does anything while Fit text to box is on, because the fitted size wins.
- Words styled with their own size in [rich text](text#several-styles-in-one-text-layer) scale along with the rest.
- A long word is never broken to make it fit, so a narrow box ends up with a smaller size instead. If the text is too long even at the Smallest, it overflows by the layer's **Overflow** setting (and a long word is broken).

## Fonts
Picking a Google font the project doesn't have yet adds it to the project's **Fonts** with the weights the text uses, so the player and exports load it. One undo takes both back. Changing the **Weight** later loads that weight too.

- A name that isn't on the list can still be used as typed. It isn't added to the project's fonts, so add it there if it is a Google font.
- A font file you upload in the [Assets panel](assets) is added to the fonts for you and shows in the list as *Uploaded*.
- New text starts in your [default font](preferences), Open Sans unless you changed it.

### No flash of the wrong font
Google fonts are fetched once and then served from the same place as the editor, so the editor, Preview, share pages and the StudyDesk learner page never contact Google. Open Sans is ready from the start.

Text doesn't pop from one font to another. The player waits up to 1.5 seconds for the first page's fonts before it shows anything. The canvas waits for a page's fonts, and a page's picture is never made with a stand-in font.

## Several styles in one text layer
Double-click a text layer to edit it. A small **toolbar floats over the text** while you do, like the one in a word processor:

![The toolbar over a text layer being edited: bold, italic, underline, strike-through, colour, size and font, with a word in bold on the layer.](help/text-toolbar.png)

Select some of the text (or just put the caret in a word) and use:

- **B**, **I**, **U** and **S**: bold, italic, underline and strikethrough. A button that is lit means all the selected text has it; a button with a ring around it means only some of it does (press it to switch it on for all of it).
- **A** (colour): click it for the colour picker, or its arrow for the toolbox palette. The bar under the A shows the colour of the selection, a rainbow when it has several.
- **Size**: type a size in pixels and press <kbd>Enter</kbd>, or pick one from the list. The box is empty (it says *mixed*) when the selection has several sizes.
- **Font**: the project's fonts and the standard ones; *Mixed* when the selection has several. For any other Google font, pick it in the Inspector's **Font** field.
- **Link**: add a link to the selection, or edit the one the caret is in. Type the address (a web address, `mailto:` or `tel:`; `example.com` becomes `https://example.com`), choose whether it opens in a new tab, and press <kbd>Enter</kbd>. **Remove** takes it off. Linked text is marked with a thin line under it while you edit.
- **Tx** (clear formatting): takes every style off the selection, so it goes back to the layer's own.

With nothing selected the buttons work on the word the caret is in. Between words there is nothing to style, so they are switched off.

Shortcuts, in the text or in the toolbar (<kbd>Cmd</kbd> on a Mac): <kbd>Ctrl</kbd>+<kbd>B</kbd> bold, <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, <kbd>Ctrl</kbd>+<kbd>U</kbd> underline, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> strikethrough, <kbd>Ctrl</kbd>+<kbd>K</kbd> link (while editing text, where it does not open the command palette; <kbd>F1</kbd> still opens the help search), <kbd>Ctrl</kbd>+<kbd>\</kbd> clear formatting.

The toolbar works from the keyboard too, and it never takes the focus off the control you are using. <kbd>Tab</kbd> (or <kbd>Alt</kbd>+<kbd>F10</kbd>) goes from the text into the toolbar, <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move between its controls, and the left and right arrows move along the buttons. <kbd>Enter</kbd> or <kbd>Space</kbd> presses a button and the focus stays on it, so you can press the next one. In the size box, type a number and press <kbd>Enter</kbd>, or press <kbd>Up</kbd> and <kbd>Down</kbd> to step it (<kbd>Shift</kbd> steps by ten); the box keeps the focus. In the font box, <kbd>Down</kbd> opens the list, the arrows move through it and <kbd>Enter</kbd> picks. Whichever control you change, the change goes to the characters that were selected when you left the text (they stay highlighted while you are in the toolbar). <kbd>Esc</kbd> goes back to the text with that selection, and so does <kbd>Shift</kbd>+<kbd>Tab</kbd> from the first button, or a click in the text. The toolbar sits above the text box, or below it when there is no room, and stays on the canvas. It works the same for *Auto width*, *Auto height* and *Fixed* text. A button's label is edited in a plain box with no toolbar.

While part of the text is selected, the Font, Size, Weight, Letter, Colour, Italic and Decoration fields in the inspector change just that selection too. Select all of a layer that has no styled parts and they change the whole layer, as usual. Click outside the text to go back to styling the whole layer.

Each differently styled stretch is stored as a **run**. A run only records how it differs from the layer's own style, so changing the layer's colour or font still changes every run that doesn't set its own. You never need to see them, but the **Text runs** list is still there under **Advanced** in the inspector (closed until you open it) for fixing them by hand: edit a run's text, its styles and its link, add a run, or clear all run styling. Neighbouring runs with the same style merge by themselves. A run with a link is a hyperlink to that address in the player (links are inert while editing).

Things to know:
- The layer's **Text** field always shows the runs joined. Typing in it keeps the styling around your edit.
- Sizing, alignment, line height, case and the shadow belong to the whole layer, not to runs. Line height is one value for the whole layer, so a much bigger run makes its lines taller but not by a different multiplier.
- A **binding** on Text (or a timeline, tween or *Change a layer's setting* action that sets Text) replaces the runs with that plain text for as long as it applies. Variables in braces like `{score}` still work inside each run, but a `{...}` slot should sit within one run.
- Lottie export writes the text in the layer's own style (Lottie text has one style per layer). SVG and PNG export, the player and the single-file export keep every run. Rive files with several text runs import as runs.

## Numbers that count up
Tick **Count up** and the numbers in a text count up (or down) to their new value when it changes, over the time in **Over**: `Score: {score}` rolls from 0 to 80 when the page opens, and from 80 to 95 when the score goes up. Each number keeps its decimals. Anyone who asks for less motion sees the new number straight away.

## Bullets and numbers
Double-click a text and the toolbar over it has **Bulleted list** and **Numbered list**: they put a bullet or a number on the paragraphs the cursor or the selection is in, and press again to take it off. **Tab** moves a list paragraph in a level and **Shift+Tab** out (the arrows on the toolbar do the same). Numbers go 1, 2, 3, then a, b, c a level in, then i, ii, iii. Wrapped lines line up under the words, not under the marker.

A screen reader hears a list, with how many items it has and where each one is, which typed dashes never gave it. Pressing Enter in a list item starts another item; a line with no list on it ends the list, and numbering starts again after it.

## Code
**Show as code** in the **Text** section shows the text as code: a fixed-width font, coloured by language (JavaScript, TypeScript, Python, HTML, CSS, JSON, SQL, Java, C, Shell, or **Code, no colours**), on a light or dark panel. Tick **Line numbers** to number the lines, and **Copy button** for a button in the corner that copies the code when it plays. The line numbers aren't copied or read out.

## Formulas
Tick **Formulas between $ signs** and maths typed the LaTeX way is drawn as maths: `$\frac{a}{b}$` in a line, `$$x^2 + y^2 = r^2$$` on a line of its own. A preview under the box shows each formula as you type. It knows fractions (`\frac`), roots (`\sqrt`, `\sqrt[3]{x}`), powers and indices (`^`, `_`), Greek letters (`\alpha`, `\pi`), `\sum`, `\int`, `\lim`, `\sin` and the other functions, `\times`, `\le`, `\neq` and their kind, brackets that grow (`\left( ... \right)`), `\text{}` and matrices (`\begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}`). A command it doesn't know shows up in red as typed.

The browser draws it, so it scales with the text and follows its colour, and a screen reader reads it as maths. Write `\$` for a dollar sign. A dollar sign on its own, as in `$5`, stays as it is.

## Live values in text
Anything in braces is an [expression](expressions): `Score: {score}`, `{name.toUpperCase()}`, `{items.length} items`. Write `{{` for a literal brace.

You do not have to type the braces. Put the cursor where the value should go and press **Insert value** under the **Text** box. A list opens with a box to search it, and each choice says what it is right now (`score`, number, 7). The choices are:
- **Your variables**, and how many items each list has.
- **Data**: how many rows a data source has, and the fields of its first row.
- **The learner and course**: their first name, the course title and code, the study period and year. They show a sample name in the editor and the real one when it plays.
- **The page**: which page this is and how many there are.
- **Questions**: the quiz score, total and percent, when the project has questions.
- **This item of the repeat**, for a layer inside a [repeater](repeaters): the fields of the item (a list of people with `name` and `age` offers both) and its number.

![A text layer's Text box holding Slide {slide} of {slides.length}, with a line under it saying it reads Slide 1 of 4, and the Insert value list open: a search box, Your variables with How many in slides, slide and playing, then The learner and course.](help/insert-value-menu.png)

Pick one with the arrow keys and **Enter**, or click it. It goes in as `{name}` at the cursor, over any words you had selected, and the line under the box shows what the whole text says now. The same button is on a button's **Label** and on a connector's label.


### A bold label and its words, from a list
In a repeater's copy, a styled part of a text can hold a value too. To make "**Core** - Complete 2: SCI6103" on one line for every row of a list: double-click the text, press **{ }** (**Insert value**) on the text toolbar and pick `item.label`, select it and press **B**, then type ` - ` and insert `item.text` after it in plain. Each value goes in where the cursor is and takes the style of the words around it, so the bold part stays bold and the rest stays plain, and the whole line wraps as one paragraph.

A bold label isn't a heading to a screen reader: it's read as part of the line. When the label is something people would jump between (a section name), use two layers, a heading and its text, instead.
## Drag a value onto the page
You can also drag a value to where it should show. In the **Variables** tab, each variable has a small text-icon handle (its name reads **Show it on the page**) beside its name. In the **Data** tab, each field of a data source has the same handle. Drag it onto the page:
- **Onto a text layer**: it is added to the end of that text as `{name}`, with a space before it, and the text keeps its styling. Dropping `score` on *Your score:* gives *Your score: {score}*.
- **Anywhere else on a page**: a new text layer is made there that shows it, named after the value. A list variable shows how many items it holds, and a data field shows the first row's value.

A line beside the pointer says which of the two letting go will do, and the page is outlined when it is a new text. **Undo** takes it back in one step.

Without a mouse, select a text layer and press the handle: the value is added to that text. With no text layer selected it makes a new text near the top left of the open page. **Insert value** above is the way to put a value in at the cursor.

To animate a text layer one letter, word or line at a time (typewriter, wave), see [Text modifiers](text-modifiers).
