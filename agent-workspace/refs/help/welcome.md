# Welcome to Ixia
What Ixia is, how a project fits together, and where to start.

Ixia builds 2D interactive pieces for the web: animated diagrams, explainers, quizzes, small games and UI prototypes. You draw on pages, animate with timelines, wire up behaviour with an interaction graph, and publish a single HTML file or a package that the player runs anywhere. Everything runs in your browser and saves as you work.

Ixia used to be called Interactives. Only the name changed: your projects, links and embeds are as they were, the address still says `/interactives`, scripts still use `ix` and packages are still `.ixp` files.

![The editor: tools down the left edge, then Layers, Assets, Libraries and Comments, the pages in the middle, the Properties panel on the right, and the Timeline, Interactions, Scripts, Variables, Data and other tabs along the bottom. Share and Export are at the top right.](help/editor-overview.png)

## Your first five minutes

On a new account the projects page opens with **What do you want to make?**: *Test what learners know*, *Explain something step by step*, *Practise a skill*, *Tell a story or show a picture with clickable spots*, or *Start from nothing*. A goal suggests one starter, with two others to pick instead. Press **Try it first** to play it (nothing is saved), then **Start with ...** to make your own project from it. **See all the starters** goes to the Templates tab, and **I'll look around by myself** puts the question away.

Your first project opens in the **Essentials** workspace: only Timeline, Interactions, Variables and (for a starter) the Checklist along the bottom, and the Shapes, Media and Web tools on the left. **More panels** at the right of the bottom tabs and **More tools** under the tool groups bring back what is put away (the **Icons** tab is one of them); anything your project already uses (scripts, data sources, a public interface, attributions, libraries, review comments, charts, bones) shows its tab anyway. **Show all panels and tools** leaves Essentials, and **Preferences > Workspace** switches between it and the others at any time.

Under the top bar, the **Getting started** strip lists five jobs that tick themselves as you do them: **Add a shape**, **Move it**, **Make it do something when clicked**, **Preview it** and **Share it**. Each one opens its two-minute tutorial. Put the strip away with the **x**, or turn it off under **Preferences > Getting started strip**; it also goes for good once all five are ticked. The ticks are kept in your preferences, so they follow you between browsers.

## Getting started as a beta tester

Thank you for trying Ixia 0.5. It is a beta: the main parts work, a few edges are rough, and what you find now decides what gets fixed next. You don't need to read anything first. Follow the list below, and open the help page it links to when you want the detail.

### What to try first

About half an hour, in this order. Each step says what should happen, so you can tell when it doesn't.

1. **Play something finished.** On the projects page open the **Templates** tab, then **Examples**. Press **Play** on *Lamp*, *Bones and IK*, *Matching question* and *Hotspot question*. They should run with nothing to set up. Press **Make my copy** on one and change something in it. See [Templates, examples and remix](templates).
2. **Build something small.** Do [Tutorial 1](tutorial-first-animation) and [Tutorial 2](tutorial-first-interaction). A box should slide across the page, then a button should make it slide.
3. **Add a question.** Open **Web** in the tool bar, press **Add question** and choose **Matching (drag and drop)**. Press **Preview**, drop two terms in the wrong places and press **Check answer**, then fix them and check again. See [Questions and quizzes](question-kit).
4. **Start from a template.** Press **New project**: the **Start a new project** window opens. Choose **Built-in template**, then **Quiz**, then **Create project**. Work down the **Checklist** tab along the bottom, ticking things off as you change them. (The **Templates** tab has the same starters.) Also try the other choices in that window: **Copy a project or template** and **Copy an example** each have a search box, and the arrow keys move through the list.
5. **Share it.** Choose **Share → Share…**, pick **Anyone with a link**, press **Create the link** and open the link in a private window: it should play. Then choose **Share → Share for review…**, press **Create review link** and open it (in a tab of its own it asks you to sign in with StudyDesk first). Click on the page and write a note. Back in the editor the **Comments** tab shows it. See [Exporting](export#sharing) and [Review comments](comments).
6. **Bring in a file of your own.** Use **Import** on the projects page with a Rive, Photoshop, Illustrator, SVG or Lottie file you already have. The import report lists anything that didn't come across exactly. See [Importing](import).

### What is new to look at

Everything here is new or much changed in 0.5, and each has a page in this help:

- [Themes and colour tokens](themes): name a colour once and give it a value for Light, Dark and High contrast.
- Layers that hang outside a clipping page now show as a faint, diagonally striped copy beside it on the canvas, and a hidden layer in an auto-layout frame takes no space. See [Layers](layers-panel) and [Auto layout](auto-layout).
- [Questions and quizzes](question-kit): matching and hotspot questions. [Bones and skinning](bones): **Build an example to try**.
- [Auto layout](auto-layout#percent-padding-margin-and-gap): percent padding, margin and gap.
- [Review comments](comments), [inviting people by name](live-editing#inviting-people) and the **Share** menu next to **Export**.
- [Insights](insights) and [Results and progress](results), through the **Link for StudyDesk**.
- [Importing](import): Rive **.riv** files and the Rive editor's **.rev** files.
- Folding tool groups in the tool bar, and the gear beside the timeline for its settings. See [The editor at a glance](interface) and [Timelines and keyframes](timelines#timeline-settings).

### Reporting a problem

A small **(i)** icon shows which version you are running. It sits beside **Help** at the top of the help page and of the projects page, next to the open-in-new-tab icon in the help drawer, at the bottom right of the <kbd>F1</kbd> quick search, and in the title bar of **Preferences**. **Hover** it to read the version, for example `Version 0.5.0 · build 1a2b3c4.5d6e7f8`: the release, then the editor build and the player build. **Click** it to copy that line, then paste it into your report. **Put it in every report**, because it tells us exactly which code you had.

![The version icon beside Help at the top right of the help page.](help/version-icon.png)

A report that can be acted on has:
- the **version** (click the **(i)** icon to copy it);
- what you were trying to do, what you expected and what happened instead (a screenshot helps, and a short screen recording is better still);
- the **project name**, and the steps from a fresh project if you can find them. If the project is the problem and you can share it, send a **.ixp** package: **Export**, then **Project package**;
- your **browser**, and anything red in its console (<kbd>F12</kbd>, then **Console**) if you know how to look.

Send it straight to whoever invited you to the beta, by email or Teams. The editor also records its own faults on its own, without any names or content (see [What the editor records](what-is-recorded)), so a short note from you about what you were doing is what tells us the rest. Quick answers to common questions are in [Troubleshooting and common questions](troubleshooting).

### Known limits in 0.5

- **Browser.** Use a current Chrome or Edge. Other current browsers are meant to work too.
- **Results are the Toolbox's own.** A learner's score and completion are kept per learner and course in the Toolbox. A mark reaches the StudyDesk gradebook only when you share the project **In the StudyDesk gradebook, with a mark** (see [Sharing](export#where-will-people-use-it)). Results and Insights only come from the **Link for StudyDesk**, and only for learners signed in to StudyDesk. See [Results and progress](results) and [Insights](insights).
- **Share links are snapshots.** After you change a project, press **Publish** in the top bar (or **Update to the latest version** in the Share link dialog), or learners keep seeing the old one.
- **Undo is yours alone.** In a live session it only undoes your own changes. Use the revision history to go further back. See [Live editing and saving](live-editing).
- **Comments have no email.** You are told in the editor (and by the bell on the projects page), not by mail. Anyone with a review link who signs in can read the whole project.
- **Libraries** carry pages, styles, variables, fonts, data and assets, not project scripts, and only the latest version is kept. See [Libraries](libraries).
- **Themes are colours only.** Fonts, sizes and spacing don't follow a theme yet, and colours inside script and shader layers don't either.
- **Bones** have no weight painting brush yet: set weights per point in the Properties panel.
- **Imports are close, not exact.** Lottie expressions, masks and mattes, and some Rive and Photoshop effects, can't be carried over, and `.dwg` files have to be saved as `.dxf` first. The import report is the whole list.
- **The accessibility checker reports what it found**, never that a project is compliant. See [Accessibility checker](accessibility-checker).

## New here? Start with the tutorials

Five short, hands-on tutorials, in order. Each has numbered steps you can follow exactly, and each ends with a link to the next.

1. [Your first animation](tutorial-first-animation): draw a box and make it slide with two keyframes.
2. [Your first interaction](tutorial-first-interaction): a button that plays the animation when it is clicked.
3. [A state machine with variables](tutorial-state-machine): a lamp that switches on and off, with a tap counter.
4. [Importing a design file](tutorial-import-design): bring in a Photoshop, Illustrator, PDF, AutoCAD, Rive or Lottie file.
5. [Publishing and sharing](tutorial-publish): export a single HTML file or make a share link.

Then [Build it](build-it) has a tutorial for each kind of activity people make (a quiz question, flip cards, a branching story, a journal...), each with its finished project to open. When something behaves in a way you didn't expect, [Concepts](concepts) explains the ideas behind it.

Prefer to start from something finished? The **Templates** tab on the projects page has built-in starters and example projects you can play and copy: see [Templates, examples and remix](templates). If you like to look around first, read [The editor at a glance](interface). If something isn't working as you expect, try [Troubleshooting and common questions](troubleshooting).

## How a project fits together

- **Pages** are the screens. Each has its own layers, timelines and interactions. See [Pages](artboards).
- **Layers** are shapes, text, images, groups, frames, script layers and real web elements (buttons, inputs, links, embeds, video). See [Layers, hidden and locked layers](layers-panel).
- **Timelines** animate layer properties through keyframes. See [Timelines and keyframes](timelines).
- **Interactions** are a node graph: an event (a click, a key, a timer, a variable change) runs actions (play a timeline, set a variable, go to another page). See [Interactions](interactions).
- **Variables** and **data sources** hold values that text, bindings and lists read. See [Variables](variables) and [Data sources](data-sources).
- **Scripts** are JavaScript for anything the nodes can't do. See [Scripts](scripts).
- **Assets** are the files in the project: images, video, audio, fonts and data. See [The Assets panel](assets).

## Words you'll see

| Word | Means |
|---|---|
| Page | One screen of the interactive, with its own size, background, layers, timelines and interactions. The settings, the file and the help for advanced features call it an *artboard*. Both words mean the same thing |
| Layer | One thing on a page: a shape, some text, a button, a group... |
| Properties panel | The panel on the right that edits whatever is selected |
| Timeline | A set of tracks that animate layer properties over time |
| Keyframe (key) | A moment on a track with a value. The player works out the in-between |
| Record | The red button that turns every property change into a keyframe |
| Event, action, logic | The three kinds of node in the Interactions graph: what starts a flow (*When clicked or hovered*), what it does (*Change a value or counter*), and how it chooses (*Check a condition*). Each also has a technical name, such as *On pointer* or *Set variable*, in its tooltip and in Preferences when you turn on **Technical wording** |
| Variable | A named value (number, text, true/false, colour, choice, list) shared by the whole project |
| Binding | A rule that keeps a layer property equal to an expression, such as `lit ? "#ffd23f" : "#c9ced6"` |
| Instance | One page placed inside another, like a reusable component |
| Preview | Plays the project exactly as the exported file will |

The editor talks like an author, not a programmer. These **plain words** are the default:

- **Pages** rather than artboards, and nodes with names such as **When clicked or hovered**, **Go to a page**, **Change a value or counter** and **Show or hide a layer**.
- Opacity and scale are shown as **percents**, and a layer's pivot is a 3×3 picker.
- Variables come as Counter, Switch, Score, Text or List.

The technical name of a node is in its tooltip and in search, and **Technical wording** in [Preferences](preferences#interactions) shows the technical names everywhere. See [The interaction nodes](interaction-nodes) for both names.

## Where to get help

- <kbd>F1</kbd> searches these pages from anywhere in the editor.
- <kbd>Shift</kbd>+<kbd>F1</kbd>, or the **Help** button in the top bar, opens the page about what you have selected.
- <kbd>Ctrl</kbd>+<kbd>K</kbd> opens the [command palette](command-palette). It does things for you, and lists matching help pages under its commands.
- <kbd>?</kbd> lists every [keyboard shortcut](shortcuts).
- Many sections in the Properties panel have a **?** beside the title and a short line with a **More about …** link. Both open the page for that section. Hovering a button or field shows a short explanation.
- The small **(i)** icon beside **Help** shows the version you are running when you hover it, and copies it when you click it. Include it when you report a problem.

See [Using this help](help) for the detail.

> Everything saves automatically. The label next to the project name says **Saved**, **Saving…** or **Unsaved**.
