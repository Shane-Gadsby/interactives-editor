# Before you share
One list of what is most likely wrong, shown when you press Share or Export, with a way to go and look at each and to fix some.

**Before you share** is a short list of what is most likely to be wrong with your project, so you can fix it before learners see it. It never stops you sharing.

It opens by itself when you press **Share → Share…**, or **Export → Single HTML file** or **Project package**, and there is something to look at. The heading counts the problems, for example **3 things to look at**. If there is nothing, you go straight through. The Share dialog also carries a line at the top saying the same (**Show me** opens the list). For the Share dialog itself, see [Sharing](export#share-link).

![The Before you share list: a button that does nothing, template items still to do, sample words, a picture with no description.](help/before-you-share.png)

## What it looks for
- **Buttons that do nothing when clicked.** A button layer with no click, press or hover on it (or on what holds it), that is not switched off. **Choose what it does** opens the [behaviour chooser](interactions#behaviours-when-this-is-clicked) on it.
- **Pages nothing leads to.** Pages no button or link can reach from the start page, following **Go to a page** (and Next and Previous). It stays quiet if a graph picks pages by expression, since that could lead anywhere, and pages another page draws as an [instance](instances) or as a master do not count.
- **Things from the template still to do.** The [checklist](templates#use-a-template): items not ticked, ticked but the layer is still the template's, or pointing at a layer that is gone. **Open the checklist** opens it.
- **Sample words.** Text, button and link words that still say "Text" or "Button", "Lorem ipsum", "Your title here", "Replace this", "[Your name]", "TBC" and the like. **Go there** puts the cursor in the text.
- **Pictures and videos with no description.** Type the description in the list and press **Add it**. See [Accessibility checker](accessibility-checker).
- **Text that is hard to read.** The checker's colour contrast problems. **Fix them for me** applies the safe fixes in one step (undo with <kbd>Ctrl</kbd>+<kbd>Z</kbd>). When only some can be fixed safely it reads **Fix 2 of them for me**.
- **Links and references that lead nowhere.** A link layer with no address, or things the [Usage](usage) panel finds pointing at something that is gone.
- **Files that add up to a lot**, over 25 MB, with the biggest named, and **files nothing uses**. **Remove the files nothing uses…** asks first, like the Usage panel. See [Download size](download-size).

Layers that are locked (the brand's logo and footer) are left out: they are not yours to change.

## Going there, fixing, and "This is fine"
Each kind of problem is one line, saying how many there are. Click it (or press <kbd>Enter</kbd> on it) to open it and see each one, why it matters and the fixes; click again to close it. When there is only one kind it starts open.

**Go there** closes the list, takes you to the page, selects the layer and (for words) lets you type. Press Share again when you are ready.

Each row has **This is fine** for the ones that are meant to be like that (a decorative button, a picture that is only decoration). It leaves that one off the list from then on. The mark is kept in this browser for the project, like the accessibility checker's **reviewed** marks (a picture's mark is the same one the checker uses). **Forget what I marked as fine** at the bottom puts them all back.

**Share anyway** (or **Export anyway**) carries on regardless: the list only ever advises.

The same checks are available piece by piece: the [Accessibility](accessibility-checker) and [Usage](usage) tabs, the template checklist's review, and the [Download size](download-size) readout.
