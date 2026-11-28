# Using this help
Search, tooltips and help links.

## Searching
- Press <kbd>F1</kbd> anywhere for quick search. Type a few words and press <kbd>Enter</kbd> to open the best match, or use <kbd>↑</kbd> <kbd>↓</kbd> to choose.
- <kbd>Ctrl</kbd>+<kbd>K</kbd> opens the [command palette](command-palette), which lists matching help pages under its commands.
- The drawer has its own **Search help** box.

## The Help button
The **Help** button in the top bar (or <kbd>Shift</kbd>+<kbd>F1</kbd>) opens the page for whatever is highlighted. It looks in this order:

1. The **field** you last clicked in the Properties panel (its section's page, or its own when it has one).
2. The **node** selected in Interactions, or the **key** selected in the Timeline, while that is the panel you are working in.
3. The **tool** you picked on the tool bar (not Select or Hand).
4. The **layer type** you selected (Chart, Text, Button, Rectangle...).
5. A selected **page** or **page master**.
6. The **panel** you last worked in.
7. The general help.

The button's tooltip names what it will open, and the drawer says "Help for Chart layer" at the top, with a **Back to general help** link. Only selection and focus count, not what the pointer is over. The tool bar has no Help button of its own: right-click it for **Help for the tools**. The **Help** link is also on the projects page.

## Tutorials, badges and progress
The **Tutorials** button on the projects page (next to **Help**) lists every tutorial as a card: the **Getting started** ones, the **Build it** ones by level and the **Concepts**. Each card has the finished project's picture, a line about it, how long it takes and where you are. **Start** (or **Carry on**) opens it in this help. **Open the finished example** plays the finished project, and **Make my copy** there gives you your own to pull apart. The search box at the top finds a tutorial by any word in its title or summary.

![The Tutorials window over the projects page: a search box, 0 of 38 tutorials finished with a badge for each set, then the Getting started cards, each with a picture of the finished project, how long it takes, Start or Carry on, and Open the finished example.](help/tutorials-window.png)

In a tutorial, each numbered step has a tick box beside its heading. Tick it when you have done the step. A short line says how many are left, and a strip under the title shows how many steps you have ticked. Tick the last one and you get a **badge card** in the corner of the screen with a quick burst of confetti. It clears itself after a few seconds, never stops you working, and **Esc** or its **x** puts it away at once. Did it without ticking along? **I have done all of this**, at the foot of the tutorial, counts the lot. **Start again** in the strip clears that one's ticks and badge. A concept has one button instead, **Mark as read**.

Every **Getting started** and **Build it** tutorial is **guided** while a project is open. A step that can be checked ticks itself the moment you have done it: draw a rectangle and step 2 of the first animation ticks, add a timeline and step 3 does, and so on. You get the same short line as when you tick by hand. It only looks at the project you have open, a moment after each change, so a step that is already true of the project when you open the tutorial ticks too. A step with nothing to check, such as one that is about reading, is yours to tick. Ticking by hand always works, and so does taking a tick off: if you untick a step that ticked itself, it stays unticked until you undo the thing and do it again. **Start again** does the same for everything already in the project. Preview counts too: a step that says to try it ticks once you have opened Preview (or pressed Play in the Timeline) with the tutorial showing. On the projects page, with no project open, nothing ticks itself, and the strip under the title says so.

A step that talks about a control has a **Show me** button at its right. Press it and the control gets a gold ring and its name for a few seconds: a tool in the tool bar, a tab of the bottom panel, **Preview**, **+ When clicked…** and so on. The ring never blocks anything, so you can click the control straight through it. It goes when you press <kbd>Esc</kbd> (that <kbd>Esc</kbd> does nothing else), when you click or press a key, when you close the tutorial, or by itself after a few seconds. If the control is not on screen, because its tool group is folded or its panel is closed, a note says where it is instead. With reduced motion on, the ring does not pulse. It works the same when you start a tutorial from the **Tutorials** window. Every **Getting started** and **Build it** tutorial has its steps checked and its **Show me** buttons. The **Concepts** are for reading, so you mark those as read. A few steps in a guided tutorial have nothing to check, such as one that only asks you to read, a file you make outside the editor, or something a project cannot show afterwards (what the Accessibility tab found, say). Those still have **Show me** when there is a control to point at, and you tick them by hand.

Finishing every tutorial in a set earns a **set badge**: Getting started, Questions, Show and explain, Games and stories, Learners, media and data, Polish and advanced, all of Build it, and the Concepts. The badges and your totals show at the top of the **Tutorials** window, and a tick appears beside each finished tutorial in this help's contents.

Your progress is kept with your [Preferences](preferences), so it follows you to any browser. If your system asks for less motion the badge card is still, with no confetti. Nothing makes a sound unless you turn on **Soft chime with the cheers**. To switch all of it off, or to clear your progress and start again, see **Tutorial badges and cheers** and **Reset tutorial progress** in [Preferences](preferences).

## Home, Back and Forward
The three buttons at the left of the drawer's top.

- **Home** is the welcome page.
- **Back** and **Forward** walk through the pages and sections you have visited. Links, search results and the Help button all count, and each page comes back scrolled to where you left it.
- <kbd>Alt</kbd>+<kbd>Left</kbd> and <kbd>Alt</kbd>+<kbd>Right</kbd> do the same while the drawer has the focus, and so do the mouse's back and forward buttons over it.
- The history is kept when you close the drawer, so Back from a new Help button press returns to what you were reading.
- The full help page (the **new tab** button) uses the browser's own Back and Forward, since each page has its own address.

## More about … links and ? links
Many sections in the Properties panel, and in the other side panels, have a short line saying what the section is for. At the end of it is a **More about …** link. It opens the help at the right place, where the longer detail is.

A **?** beside a section's title opens the same page. The panels' tabs don't have a **?**: use the **Help** button, or right-click the tab and choose **Help for this panel**.

## While Preview is open
Preview sits above the help drawer so it never covers its controls. Asking for help then (the Help button, <kbd>F1</kbd>, <kbd>Shift</kbd>+<kbd>F1</kbd>, a **?** link) opens the help in a new window instead. <kbd>Esc</kbd> closes Preview, not a drawer behind it, and <kbd>Tab</kbd> stays inside Preview until you close it.

## Finding your way around
- **Getting started**: the five tutorials start at [Tutorial 1](tutorial-first-animation). Stuck? See [Troubleshooting and common questions](troubleshooting).
- **Contents**: the list on the left groups every page. In the narrow drawer, the button at its top left shows and hides it. **Previous** and **next** links at the bottom of each page walk through them in order.
- **Pictures and clips**: click a picture to open it full size. Clips play on a loop without sound, and have controls if you want to pause.
- **Tooltips**: hover a button or a field's name for a short explanation. Turn them off in [Preferences](preferences).
- **Version**: the small **(i)** icon beside **Help** (and in the help drawer, the <kbd>F1</kbd> quick search and Preferences) shows the version you are running when you hover it, and copies it when you click it. Include it when you report a problem: see [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).
