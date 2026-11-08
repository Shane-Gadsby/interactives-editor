import { ANIMATABLE_PROPS, CATALOG, DRAW_API, DRAW_TEMPLATES, PACKAGE_EXTENSION, SHADER_PRESETS, type NodeDef } from 'interactives-player';
import { TUTORIALS } from './tutorials';

export interface HelpTopic {
  id: string;
  title: string;
  group: string;
  /** One line, shown in search results and as the tooltip for "?" links. */
  summary: string;
  /** Extra words people might search for. */
  keywords?: string;
  /** The editor icon (a name in components/icons) drawn beside the title, for a topic about one button. */
  icon?: string;
  body: string | (() => string);
}

/**
 * What the branded starters topic lists, supplied by the editor (`./branded-help.ts`) so this file stays free of the starters
 * themselves: the MCP server bundles these topics without the DOM.
 */
export interface BrandedHelpSource {
  colourways: { name: string; description: string }[];
  sets: { name: string; starters: { name: string; description: string }[] }[];
}
let brandedHelp: (() => BrandedHelpSource) | null = null;
export const provideBrandedHelp = (fn: () => BrandedHelpSource): void => {
  brandedHelp = fn;
};

export const GROUPS = ['Getting started', 'Design', 'Web elements', 'Motion', 'Interactivity', 'Data', 'Import and export', 'Working together', 'Reference'];

export const TOPICS: HelpTopic[] = [
  // ---------------------------------------------------------------- getting started
  {
    id: 'welcome',
    title: 'Welcome to Interactives',
    group: 'Getting started',
    summary: 'What Interactives is, how a project fits together, and where to start.',
    keywords: 'intro overview start getting started tutorial beginner first learn new user onboarding glossary words',
    body: `Interactives builds 2D interactive pieces for the web: animated diagrams, explainers, quizzes, small games and UI prototypes. You draw on artboards, animate with timelines, wire up behaviour with an interaction graph, and publish a single HTML file or a package that the player runs anywhere. Everything runs in your browser and saves as you work.

![The editor: tools down the left edge, then Layers, Assets, Libraries and Comments, the artboards in the middle, the Inspector on the right, and the Timeline, Interactions, Scripts, Variables, Data and other tabs along the bottom. Share and Export are at the top right.](help/editor-overview.png)

## Your first five minutes

On a new account the projects page opens with **What do you want to make?**: *Test what learners know*, *Explain something step by step*, *Practise a skill*, *Tell a story or show a picture with clickable spots*, or *Start from nothing*. A goal suggests one starter, with two others to pick instead. Press **Try it first** to play it (nothing is saved), then **Start with ...** to make your own project from it. **See all the starters** goes to the Templates tab, and **I'll look around by myself** puts the question away.

Your first project opens in the **Essentials** workspace: only Timeline, Interactions, Variables and (for a starter) the Checklist along the bottom, and the Shapes, Media and Web tools on the left. **More panels** at the right of the bottom tabs and **More tools** under the tool groups bring back what is put away; anything your project already uses (scripts, data sources, a public interface, attributions, libraries, review comments, charts, bones) shows its tab anyway. **Show all panels and tools** leaves Essentials, and **Preferences > Workspace** switches between it and the others at any time.

Under the top bar, the **Getting started** strip lists five jobs that tick themselves as you do them: **Add a shape**, **Move it**, **Make it do something when clicked**, **Preview it** and **Share it**. Each one opens its two-minute tutorial. Put the strip away with the **x**, or turn it off under **Preferences > Getting started strip**; it also goes for good once all five are ticked. The ticks are kept in your preferences, so they follow you between browsers.

## Getting started as a beta tester

Thank you for trying Interactives 0.5. It is a beta: the main parts work, a few edges are rough, and what you find now decides what gets fixed next. You don't need to read anything first. Follow the list below, and open the help page it links to when you want the detail.

### What to try first

About half an hour, in this order. Each step says what should happen, so you can tell when it doesn't.

1. **Play something finished.** On the projects page open the **Templates** tab, then **Examples**. Press **Play** on *Lamp*, *Bones and IK*, *Matching question* and *Hotspot question*. They should run with nothing to set up. Press **Make my copy** on one and change something in it. See [Templates, examples and remix](templates).
2. **Build something small.** Do [Tutorial 1](tutorial-first-animation) and [Tutorial 2](tutorial-first-interaction). A box should slide across the artboard, then a button should make it slide.
3. **Add a question.** Open **Web** in the tool bar, press **Add question** and choose **Matching (drag and drop)**. Press **Preview**, drop two terms in the wrong places and press **Check answer**, then fix them and check again. See [Questions and quizzes](question-kit).
4. **Start from a template.** Press **New project**: the **Start a new project** window opens. Choose **Built-in template**, then **Quiz**, then **Create project**. Work down the **Checklist** tab along the bottom, ticking things off as you change them. (The **Templates** tab has the same starters.) Also try the other choices in that window: **Copy a project or template** and **Copy an example** each have a search box, and the arrow keys move through the list.
5. **Share it.** Choose **Share**, then **Share link**, and open the link in a private window: it should play. Then choose **Share for review**, press **Create review link** and open it (tick **Let people comment without signing in** if you open it somewhere you aren't signed in to StudyDesk). Click on the artboard and write a note. Back in the editor the **Comments** tab shows it. See [Exporting](export#sharing) and [Review comments](comments).
6. **Bring in a file of your own.** Use **Import** on the projects page with a Rive, Photoshop, Illustrator, SVG or Lottie file you already have. The import report lists anything that didn't come across exactly. See [Importing](import).

### What is new to look at

Everything here is new or much changed in 0.5, and each has a page in this help:

- [Themes and colour tokens](themes): name a colour once and give it a value for Light, Dark and High contrast.
- Layers that hang outside a clipping artboard now show as a faint, diagonally striped copy beside it on the canvas, and a hidden layer in an auto-layout frame takes no space. See [Layers](layers-panel) and [Auto layout](auto-layout).
- [Questions and quizzes](question-kit): matching and hotspot questions. [Bones and skinning](bones): **Build an example to try**.
- [Auto layout](auto-layout#percent-padding-margin-and-gap): percent padding, margin and gap.
- [Review comments](comments), [inviting people by name](live-editing#inviting-people) and the **Share** menu next to **Export**.
- [Insights](insights) and [Results and progress](results), through the **Link for StudyDesk**.
- [Importing](import): Rive **.riv** files and the Rive editor's **.rev** files.
- Folding tool groups in the tool bar, and the gear beside the timeline for its settings. See [The editor at a glance](interface) and [Timelines and keyframes](timelines#timeline-settings).

### Reporting a problem

A small **(i)** icon shows which version you are running. It sits beside **Help** at the top of the help page and of the projects page, next to the open-in-new-tab icon in the help drawer, at the bottom right of the <kbd>F1</kbd> quick search, and in the title bar of **Preferences**. **Hover** it to read the version, for example \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`: the release, then the editor build and the player build. **Click** it to copy that line, then paste it into your report. **Put it in every report**, because it tells us exactly which code you had.

![The version icon beside Help at the top right of the help page.](help/version-icon.png)

A report that can be acted on has:
- the **version** (click the **(i)** icon to copy it);
- what you were trying to do, what you expected and what happened instead (a screenshot helps, and a short screen recording is better still);
- the **project name**, and the steps from a fresh project if you can find them. If the project is the problem and you can share it, send a **.ixp** package: **Export**, then **Project package**;
- your **browser**, and anything red in its console (<kbd>F12</kbd>, then **Console**) if you know how to look.

Send it straight to whoever invited you to the beta, by email or Teams. The editor also records its own faults on its own, without any names or content (see [What the editor records](what-is-recorded)), so a short note from you about what you were doing is what tells us the rest. Quick answers to common questions are in [Troubleshooting and common questions](troubleshooting).

### Known limits in 0.5

- **Browser.** Use a current Chrome or Edge. Linking design files (so changes in Photoshop or Illustrator flow in) needs the browser's file access, which only those two have. Everything else is meant to work in any current browser.
- **Results are the Toolbox's own.** A learner's score and completion are kept per learner and course in the Toolbox, not sent to the StudyDesk gradebook yet. Results and Insights only come from the **Link for StudyDesk**, and only for learners signed in to StudyDesk. See [Results and progress](results) and [Insights](insights).
- **Share links are snapshots.** After you change a project, press **Update to the latest version** in the Share link dialog, or learners keep seeing the old one.
- **Undo is yours alone.** In a live session it only undoes your own changes. Use the revision history to go further back. See [Live editing and saving](live-editing).
- **Comments have no email.** You are told in the editor (and by the bell on the projects page), not by mail. Anyone with a review link can read the whole project.
- **Libraries** carry artboards, styles, variables, fonts, data and assets, not project scripts, and only the latest version is kept. See [Libraries](libraries).
- **Themes are colours only.** Fonts, sizes and spacing don't follow a theme yet, and colours inside script and shader layers don't either.
- **Bones** have no weight painting brush yet: set weights per point in the Inspector.
- **Imports are close, not exact.** Lottie expressions, masks and mattes, and some Rive and Photoshop effects, can't be carried over, and \`.dwg\` files have to be saved as \`.dxf\` first. The import report is the whole list.
- **The accessibility checker reports what it found**, never that a project is compliant. See [Accessibility checker](accessibility-checker).

## New here? Start with the tutorials

Five short, hands-on tutorials, in order. Each has numbered steps you can follow exactly, and each ends with a link to the next.

1. [Your first animation](tutorial-first-animation): draw a box and make it slide with two keyframes.
2. [Your first interaction](tutorial-first-interaction): a button that plays the animation when it is clicked.
3. [A state machine with variables](tutorial-state-machine): a lamp that switches on and off, with a tap counter.
4. [Importing a design file](tutorial-import-design): bring in a Photoshop, Illustrator, PDF, AutoCAD, Rive or Lottie file.
5. [Publishing and sharing](tutorial-publish): export a single HTML file or make a share link.

Prefer to start from something finished? The **Templates** tab on the projects page has built-in starters and example projects you can play and copy: see [Templates, examples and remix](templates). If you like to look around first, read [The editor at a glance](interface). If something isn't working as you expect, try [Troubleshooting and common questions](troubleshooting).

## How a project fits together

- **Artboards** are the screens. Each has its own layers, timelines and interactions. See [Artboards](artboards).
- **Layers** are shapes, text, images, groups, frames, script layers and real web elements (buttons, inputs, links, embeds, video). See [Layers, hidden and locked layers](layers-panel).
- **Timelines** animate layer properties through keyframes. See [Timelines and keyframes](timelines).
- **Interactions** are a node graph: an event (a click, a key, a timer, a variable change) runs actions (play a timeline, set a variable, go to another artboard). See [Interactions](interactions).
- **Variables** and **data sources** hold values that text, bindings and lists read. See [Variables](variables) and [Data sources](data-sources).
- **Scripts** are JavaScript for anything the nodes can't do. See [Scripts](scripts).
- **Assets** are the files in the project: images, video, audio, fonts and data. See [The Assets panel](assets).

## Words you'll see

| Word | Means |
|---|---|
| Artboard | One screen of the interactive, with its own size, background, layers, timelines and interactions |
| Layer | One thing on an artboard: a shape, some text, a button, a group... |
| Inspector | The panel on the right that edits whatever is selected |
| Timeline | A set of tracks that animate layer properties over time |
| Keyframe (key) | A moment on a track with a value. The player works out the in-between |
| Record | The red button that turns every property change into a keyframe |
| Event, action, logic | The three kinds of node in the Interactions graph: what starts a flow, what it does, and how it chooses |
| Variable | A named value (number, text, true/false, colour, choice, list) shared by the whole project |
| Binding | A rule that keeps a layer property equal to an expression, such as \`lit ? "#ffd23f" : "#c9ced6"\` |
| Instance | One artboard placed inside another, like a reusable component |
| Preview | Plays the project exactly as the exported file will |

## Where to get help

Press <kbd>F1</kbd> (or <kbd>Ctrl</kbd>+<kbd>K</kbd>) anywhere to search these pages, or <kbd>?</kbd> for the page about what you have selected. The **?** beside an Inspector section opens its page, and hovering a button or field shows a short explanation. The small **(i)** icon beside **Help** shows the version you are running when you hover it, and copies it when you click it: include it when you report a problem. See [Using this help](help).

> Everything saves automatically. The label next to the project name says **Saved**, **Saving…** or **Unsaved**.`,
  },
  ...TUTORIALS,
  {
    id: 'projects',
    title: 'Projects page',
    group: 'Getting started',
    summary: 'Start a new project (blank, a copy, a built-in template or an example), open, duplicate, import and delete projects, and organise them with folders, tags, search and sort.',
    keywords: 'home new project start blank chooser copy clone import duplicate delete package ixp god mode power user folder folders tag tags search sort organise organize filter bin trash undelete restore recover deleted',
    body: `The projects page lists the projects you own. Each card shows a picture of the project's start artboard, its name, when it last changed, how many artboards it has, its tags and a folder menu.

![The projects page: the folder list on the left, the search box, sort menu and tag filter along the top, and a card for each project.](help/projects-page.png)

## Making and opening projects

- **New project** (top right, or the **+** card) opens **Start a new project**, one window with four ways to begin. Pick one on the left (<kbd>Up</kbd> and <kbd>Down</kbd> move between them), then give the project a name and a folder at the bottom and press **Create project**. It opens straight away.
  - **Blank project**: one empty artboard called **Home**, with the Light, Dark and High contrast themes. Your default font (Open Sans unless you changed it) is added to it. See [Preferences](preferences).
  - **Copy a project or template**: a list of your own projects, your own templates and the ones shared with you. A project is copied whole, with its pictures, and the copy is called **Copy of ...**. A template opens with its checklist, as under [Templates](templates).
  - **Built-in template**: the starters that come with Interactives, shown with their pictures.
  - **Copy an example**: the finished examples, shown with their pictures. You get your own copy to change.
  
  The search box above each list filters it as you type. Press <kbd>Down</kbd> to move from the search box to the list, the arrow keys to move through it, and <kbd>Enter</kbd> to create the project from the one you picked. <kbd>Esc</kbd> closes the window without making anything. The name starts as something sensible and follows what you pick until you type your own. The folder starts as the one you were looking at, and you can change it.
- Click a card's picture to open the project. **Help** and the gear (**Preferences**) are at the top right too.
- The **Templates** tab (next to **Projects**) starts a project from a template, or from one of the finished examples. See [Templates, examples and remix](templates).
- **Import** (also the **import a file** link on the **+** card) opens a \`${PACKAGE_EXTENSION}\` package (a whole project with its assets), a project JSON file, or a design or animation file: Lottie (\`.json\`, \`.lottie\`), Rive (\`.riv\`, \`.rev\`), Photoshop (\`.psd\`), Illustrator (\`.ai\`), PDF, AutoCAD (\`.dxf\`), VectorCraft (\`.vectorcraft\`), PhotoCraft (\`.pcraft\`) or PowerPoint (\`.pptx\`). A package or JSON file comes back as a project of its own, and importing the same file twice gives you two copies. Any other file becomes a **new project**, and for design files the **Import design file** dialog first asks whether to link or embed ([Tutorial 4](tutorial-import-design)).
- Each card has three icon buttons: **Duplicate** (a copy of the project and its assets), **Export** a \`${PACKAGE_EXTENSION}\` package (a download of the whole project) and **Delete**. Delete asks first, then moves the project to the [Bin](projects#the-bin), with an **Undo** straight after. If its share or review link is on, or learners have results or progress in it, the question says so, with the courses, how many learners each has and when they were last active.
- With no projects yet the page shows **Create your first project**, which opens the same **Start a new project** window.

## The bin

A deleted project goes to the **Bin** for 30 days. The **Bin** shows at the bottom of the folder list whenever something is in it.

- While a project is in the Bin, nobody can open it, and its share link, review link and **Link for StudyDesk** stop working.
- Its pictures and files, revision history, review comments and learner records are all kept, so **Restore** puts it back exactly as it was, links included.
- Each one says when it was deleted, by whom, and how many days it has left. After 30 days it goes for good, with everything above.
- **Delete forever** removes it now, for good. Use it when a project has to go (learner data you were asked to remove, say). It asks first.
- A library published from the project stays available to the projects that use it until the project goes for good.
- Only the owner can delete, restore or delete forever. Staff with power-user access see everyone's Bin in the power-user view.

## Search and sort

- The **Search name or tag** box shows only projects whose name or tags contain what you type. **Clear filters** appears if nothing matches.
- **Sort** orders the cards by **Last updated** (newest first, the default) or **Name**. The choice is remembered in this browser.
- **Thumbnails** and **Details** switch between cards with a picture and a one-row-per-project list. In Thumbnails, the slider next to them makes the pictures bigger or smaller. Both choices are remembered in this browser, the same as in the Assets tab. The page lays out at any window width: the header and folder list wrap instead of squeezing.

## Folders

Folders keep a long list tidy. A project is in one folder at most, and folders are one level deep.

- The list on the left shows **All projects**, **No folder** and each folder with its project count. Click one to show only those projects.
- Use the folder menu at the bottom of a card to **move the project to a folder**. Choose **New folder…** to start a new one: a dialog asks for its name. A folder exists as long as at least one project is in it.
- With a folder selected, a project you create or import goes into that folder, and **Start a new project** has it chosen in its **Folder** menu (change it there if you like). With **All projects** or **No folder** selected it starts in *No folder*.
- With a folder selected, the pencil **renames** it and the bin **deletes** it (both ask in a dialog). Deleting a folder never deletes projects: they just go back to *No folder*.

## Tags

Tags are short free-text labels, up to 20 per project and 40 characters each.

- Click **+ tag** on a card, type a tag and press <kbd>Enter</kbd> (<kbd>Esc</kbd> cancels). Tags you've used before are suggested. Click the **×** on a tag to remove it.
- The tag row at the top lists every tag in use with a count. Click one to show only projects with that tag, and click it again to clear it.

Folders and tags belong to the project record on the server, not to the project file, so they don't appear in exports, package files or the revision history.

## Who sees what

You see your own projects and the ones other people have invited you to collaborate on (their cards say *shared with you by* and the owner's name; see [Inviting people](live-editing#inviting-people)). Staff with power-user access can toggle the power-user view (the suite's shared shortcut, shown in a banner as **F9**) to see and open every project; the server checks that access again. In that view you can also file and tag other people's projects.`,
  },
  {
    id: 'interface',
    title: 'The editor at a glance',
    group: 'Getting started',
    summary: 'Top bar, tools, Layers and Assets, canvas, Inspector, bottom tabs, arranging the panels, and Preview.',
    keywords: 'layout panels toolbar inspector layers dock undock float floating window drag tab rearrange move panel reset layout ui top bar save live history undo zoom preview debug tabs tour',
    body: `![The editor with a project open.](help/editor-overview.png)

## Top bar
From left to right:

- **All projects** (the house): back to the projects page.
- The **project name**. Click to rename.
- The save state: **Saved**, **Saving…**, **Unsaved** or **Save failed** (hover it for the reason). A save that failed because of the network or the server tries again by itself, and says **Saved again** when it gets there.
- **Live**: the project's live connection, **Live**, **Reconnecting** or **Deleted**. When other people are in the project too, their initials show beside it. See [Live editing and saving](live-editing).
- **Revision history** (the clock): earlier saved versions of the project.
- **Undo** and **Redo**.
- Zoom: **−**, the percentage (click it to fit everything) and **+**.
- **Preferences** (the gear, with the version **(i)** icon in its title bar) and **Help**. Help opens the page for whatever you have highlighted, and its tooltip says which ("Help: Chart layer"): the Properties field you are in, the selected layer's type, the selected node in Interactions or key in the Timeline, the tool you picked, a selected artboard or page master, or the panel you last worked in; with none of those it is the general help. See [Using this help](help).
- **Preview**, then **Export** (a menu of files to download, see [Exporting](export)) and **Share** (a menu: **Share link**, **Invite to collaborate**, **Save as template** and **Share for review**, see [Sharing](export#sharing)). Once the project has [themes](themes), a theme box shows in the bar too.

## Tool bar (left edge, unless you move it)
**Select** and **Hand** at the top, then the tools in groups you can fold and open with one click on their name: **Shapes** (artboard, frame, rectangle, ellipse, polygon, star) and **Draw** (line, connector, pen, pencil, bend) start open; **Media** (text, script layer, shader layer, video, image and the Media Catalogue), **Data** ([progress bar](progress-bars), [chart](charts)), **Web** (button, input, link, embed, Add question) and **Rig** (bone, show/hide bones) start folded. The editor remembers which groups you keep open, and a folded group still shows the tool you're using. The **Comment** tool (<kbd>C</kbd>) sits below the groups: it pins a review note where you click, see [Review comments](comments). Next to it the **Note** tool (<kbd>S</kbd>) draws a sticky note for the people editing, which players never see (see [Notes](notes)), and an eye button shows or hides notes. Beside it are **Show grid** (<kbd>Shift</kbd>+<kbd>G</kbd>) and **Snap to grid** (<kbd>Ctrl</kbd>+<kbd>'</kbd>), both lit gold while on (right-click either for the grid size, see [The grid and snapping](grid)). The **Media Catalogue** button sits in the **Media** group with image and video: it opens the photo library in a window and puts the photo you choose on the artboard (see [The Media Catalogue](media-catalogue)). It is an action rather than a tool, so it doesn't stay lit after you use it. There is no Help button on the tool bar: **Help** is in the top bar, and right-clicking the tool bar has **Help for the tools**. Hover a tool to see its name and shortcut: **Select**, **Hand**, **Artboard**, **Frame**, **Rectangle**, **Ellipse**, **Polygon**, **Star**, **Line**, **Pen**, **Pencil (freehand)**, **Bend**, **Text**, **Script layer**, **Image**, then **Button**, **Input field**, **Link**, **Embed (HTML or iframe)** and **Video**. See [Shapes and paths](shapes), [Shape morphing and the Bend tool](shape-morphing), [Web elements](web-elements) and [Script layers](script-layers).

## What the pointer shows
The pointer says what a press will do. Over a selected layer it is the **move** cross; over a resize handle it is the double arrow along the way that handle drags, turned with the layer if the layer is turned; just outside a corner it is the **rotate** arrows, turned to sit round that corner; over a gradient handle an open hand; over an artboard's name the move cross. In point-edit mode a point shows the move cross and the outline shows an arrow with a **+** (double-click adds a point there). The Pen is a nib (with a ring over the first point, where a click closes the shape), the Pencil a pencil, the Hand an open hand that closes while you pan, the Connector tool a crosshair (the layer it would join lights up with a dot on each side), and the Bone tool a crosshair (with a ring over a tip, which continues the chain). Edges between panels show the resize arrows, the timeline's empty lanes and ruler show a sideways arrow (a press scrubs), and a port in the interaction graph shows a crosshair.

When pressing will ask you something first, a note beside the pointer says so before you press: over a rectangle, ellipse, polygon or star the **Bend** tool says it will ask to turn it into a path, and dragging layers over another artboard says letting go will offer to move them there.

## Left panel
Four tabs:

- **Layers**: every artboard in the project, with its layer tree. Click to select, drag to reorder or nest, hover for the lock and the eye. See [Layers, hidden and locked layers](layers-panel).
- **Assets**: images, video, audio, fonts and data files in the project. See [The Assets panel](assets).
- **Libraries**: components and styles shared between projects. See [Libraries](libraries).
- **Comments**: the review notes pinned on the project, with filters. See [Review comments](comments).

Drag the left and right panels' inner edges (beside the canvas) to make them wider or narrower; double-click an edge to put it back. With an edge focused, the arrow keys move it (<kbd>Shift</kbd> for bigger steps). The widths are remembered in this browser.

## Canvas
All artboards side by side. See [Moving around the canvas](canvas). Right-click for menus: see [Layers, hidden and locked layers](layers-panel#right-click-menus).

## Inspector (right)
Settings for the selection. The search box at the top finds a property by name or by what it does ([The Properties panel](properties-panel)). A layer's settings start with **Layer** (name, position, size, visibility, blend), then a section named after its kind (**Path**, **Text**, **Image**...) with what only that kind has. Click a section's title to fold it away or open it again; the arrow beside the title points down when it's open and right when it's folded. With several layers selected, the bar of align buttons at the top lines them up. With nothing selected, or just an artboard, it shows the artboard and its **Responsive**, **Steps**, **Joysticks**, **Blends** and **Bones** sections, then the **Project** settings and the **Fonts**. The chain between **W** and **H** (and between **Sx** and **Sy**, and on an artboard's size) links the two: linked, changing one changes the other and keeps their ratio, and the canvas's resize handles keep it too (hold <kbd>Shift</kbd> to resize freely). Each layer remembers its own. The Inspector starts 320 px wide. Section titles with a **?** link to the page in these docs, and the diamonds beside fields key them on the timeline.

## Bottom panel
**Timeline**, **Interactions**, **Scripts**, **Variables**, **Data**, **Accessibility**, **Insights**, **Public interface**, **Themes** and **Usage**. A project made from a template also has a **Checklist** tab. Click a tab to open it, click the open one again to fold the bottom panel down to its tabs, and drag the top edge to resize. Each has its own page: [Timelines](timelines), [Interactions](interactions), [Scripts](scripts), [Variables](variables), [Data sources](data-sources), [Accessibility checker](accessibility-checker), [Insights](insights), [Public interface](public-interface), [Themes](themes), [Usage](usage) and [Templates](templates#use-a-template).

## Arranging the panels
Every panel can go anywhere: the left, right, bottom or top area, or a window of its own floating over the canvas. Drag a panel by its tab.
- Onto another area's tabs: it docks there, in the gap you drop it in (a line shows where). Drag along its own tabs to change their order.
- Onto the canvas: it opens in its own window there (an outline shows where). While you drag, **Dock left**, **Dock right**, **Dock at the bottom** and **Dock at the top** strips appear on the canvas's edges, so an area can be docked into even when nothing is in it yet.
- Onto a floating window's tabs: it joins that window.

A floating window moves by its title bar and resizes from its bottom-right corner. Its **×** closes it and sends its panels back to where they started. An area nothing is docked in takes no room.

The **Essentials** workspace (Preferences > Workspace) goes a step further: it puts panels and tool groups away until they are wanted, with **More panels** at the right of the bottom tabs and **More tools** in the tool bar to bring them back, and **Show all panels and tools** to leave it. A panel your project already uses keeps its tab. See [Your first five minutes](welcome#your-first-five-minutes).

The **top** area sits under the header and above the canvas and its rulers, across the page, and takes no height until a panel is docked in it (so nothing looks different until you use it). Drag its bottom edge (or focus the edge and use the arrow keys) to resize it, double-click the edge to reset its height, click the open tab or the arrow at the end of its tabs to fold it down to its tabs, and click a tab to open it again. Its height and whether it is folded are kept with the layout, so saved workspaces carry them too. Old layouts and workspaces open the same as before, with an empty top area. The canvas gets whatever room is left, and the rulers stay on the canvas.

Right-click a tab (or press Shift+F10 on it) for **Dock on the left / right / at the bottom / at the top**, **Float in its own window**, **Help for this panel** and **Reset panel layout** (everything back where it started). The tool bar docks the same way. Drag its **Tools** title out onto the page to float it (a floating tool bar moves by the same title), and drag it over an edge of the canvas to dock it there: the same **Dock left**, **Dock right**, **Dock at the bottom** and **Dock at the top** strips show, labelled for the tools, and the one you are over lights up. Along the bottom or the top it becomes a strip across the page with its groups side by side (at the top it sits under the header, over the top panels). It is a bar, not a tab, so it can't join a panel's tabs (the drag says so over them). <kbd>Esc</kbd> while dragging leaves it floating where it is. Right-click the tool bar for **Dock on the left**, **Dock on the right**, **Dock at the bottom**, **Dock at the top** or **Floating**. Saved workspaces remember where the tool bar was. The layout is remembered in this browser. Whatever opens a panel for you (choosing a timeline, **Edit** on an interaction) shows it wherever it is, and the timeline's keyframing follows whether the Timeline panel is on screen.

## Preview
**Preview** runs the project exactly as the exported file will, from the start artboard or the one you're on (the dropdown at the top). **Restart** starts again, and <kbd>Esc</kbd> closes it. Preview sits above everything else in the editor, the help drawer included, and keeps the keyboard focus until it closes; help asked for from inside it opens in a new window (see [Using this help](help)). The **Debug** panel (on by default) shows:

- **Now showing**: the artboard on screen and how many instances it contains.
- **Timelines**: the ones running, with a progress bar (green dot = playing).
- **Variables (live)**: every value as it changes. Type a new value and press <kbd>Enter</kbd> (or tick, or choose) to set it while it runs; filter by name when there are many.
- **Events** (underneath): each interaction event as it fires, which layer it came from, and what it set off, including events inside instances. Messages sent to the host page are listed too, and so are errors from script layers. With **Auto-scroll** ticked (the default) the list keeps the newest event in view; untick it to read back through earlier ones while the preview keeps running.

![The Preview with the Debug panel: live variables on the left and the Events list underneath.](help/preview-debug.png)

**Watch it run.** Press **Beside editor** in the top bar and Preview moves up to the right, leaving the canvas and the Interactions graph underneath showing. While you click through it, every node that runs lights up green (with the word *ran*), an event whose **Only if** said no goes grey (*held back*), the wires it followed pulse, and a ring flashes round the layer your click landed on (green when the click started something, red when it started nothing). When a click starts nothing, the Events list says why under **Why did nothing happen?**: nothing listens for a click on that layer, the click landed on empty space, or an **Only if** said no. Click an event's name in the list to select its node in the graph. The lights are only in the editor; exports and shared links never carry them, and with reduced motion on they hold still instead of pulsing.

When the project has [responsive artboards](responsive), a **Page width** slider appears under the top bar. Drag it to resize the page the project runs in; the breakpoints are marked on the track and the player switches artboard as you cross them.`,
  },
  {
    id: 'canvas',
    title: 'Moving around the canvas',
    group: 'Getting started',
    summary: 'Zoom, pan, fit, and the wheel preference.',
    keywords: 'zoom pan scroll wheel trackpad pinch fit hand space middle mouse ctrl',
    body: `| Do this | To |
|---|---|
| Scroll the mouse wheel | Zoom in and out around the pointer (default) |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + wheel, or pinch on a trackpad | Zoom (always) |
| <kbd>Shift</kbd> + wheel | Pan sideways |
| Hold <kbd>Space</kbd> and drag, or drag with the middle button | Pan |
| <kbd>H</kbd> | Hand tool (drag to pan) |
| <kbd>Shift</kbd>+<kbd>1</kbd> or <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to the selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |

## Big projects and artboard pictures
Artboards you aren't working on are shown as a *still*: a picture of themselves. That keeps panning and zooming smooth in projects with many artboards. Click an artboard (or a layer in it) and it comes alive for editing. The still updates by itself shortly after anything in it changes, so you never need to refresh it. If an artboard looks slightly soft while you pan, that is the still; click it to see it sharp. Stills are kept in this browser between sessions, so a big project opens with its artboards already showing instead of filling in one by one. An artboard that was changed since (by you or someone else) is just drawn again. While a project with several artboards opens, the canvas waits for the artboards in view (a moment) and then fades them in together.

## Wheel preference
If you'd rather the wheel scrolled the canvas, open **Preferences** (the gear in the top bar) and set **Mouse wheel** to *Pan (Ctrl+wheel zooms)*. With that setting the wheel and two-finger trackpad scrolling pan, and <kbd>Ctrl</kbd>+wheel or a pinch zooms. The setting is kept in this browser.`,
  },
  {
    id: 'preferences',
    title: 'Preferences',
    group: 'Getting started',
    summary: 'Your own editor settings: wheel, theme, default font, rulers, grid and snapping, tooltips, layers outside clipped artboards.',
    keywords: 'settings options wheel tooltips',
    body: `![The Preferences dialog.](help/preferences.png)

Open **Preferences** from the gear in the top bar (or on the projects page). They are yours: saved with your account, so they follow you to any browser you sign in on. The small **(i)** icon in the title bar shows the version of Interactives you are running when you hover it (for example \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`: the release, then the editor build and the player build), and copies it when you click it. It is the first thing to put in a problem report, and the same icon is beside **Help** on the help and projects pages.

- **Mouse wheel**: *Zoom (Shift+wheel pans)* or *Pan (Ctrl+wheel zooms)*. See [Moving around the canvas](canvas).
- **Theme**: *Dark*, *Light*, or *Auto (follow the system)*. Both are made from the StudyDesk palette (the same colours as the rest of the Toolbox): its greys, its blue for selection and focus, and UniSQ gold on primary buttons, the open tab and the line under the top bar. In Light, the palette's grey for secondary text is a little under the usual contrast guideline (4.4:1 on panels, 4.1:1 on the background, against 4.5:1); it is left as the palette has it so the editor matches the Toolbox.
- **Workspace** (in the editor only): switch every panel's place in one go. **Standard** is where everything starts; **Essentials** puts away every panel and tool group a first project does not need (see [Your first five minutes](welcome#your-first-five-minutes)); **Animate** has a tall timeline; **Interactions** has a big interaction graph with Variables and Scripts beside the properties; **Big canvas** puts all the panels in one column on the right and folds the bottom away; **Review** opens Comments and the accessibility checker. **Save current layout as…** keeps the way you've arranged things (see [Arranging the panels](interface#arranging-the-panels)) under a name of your own, up to 12, with rename and delete beside each. Saved workspaces follow you to any browser you sign in on.
- **Default font**: the font for new text, buttons, inputs and links, added to every new project you create. It is Open Sans unless you change it. Click the box and type to search every Google font (the chips narrow it by Sans, Serif, Display, Handwriting or Mono), then pick one with <kbd>Enter</kbd> or a click; <kbd>Esc</kbd> closes the list. A name that isn't on the list can be used as typed. It applies to projects and text you make from now on, not to ones that exist.
- **Canvas**: **Show rulers** (rulers and guides on the canvas, also <kbd>Shift</kbd>+<kbd>R</kbd>), **Show grid** (<kbd>Shift</kbd>+<kbd>G</kbd>), **Snapping** and a switch for each target (**Snap to grid** is <kbd>Ctrl</kbd>+<kbd>'</kbd>; the others are artboard, layers, guides, spacing, pixels and points), **Snap distance**, **Grid size** (1 to 512 px, with presets under it) and **Stronger line every** (cells, 1 to 32). See [The grid and snapping](grid). These follow you with your account like the rest.
- **Show layers outside clipped artboards**: on by default. When an artboard has **Clip content to artboard** on, the parts of layers that hang outside it are drawn faintly, in diagonal stripes, beside it on the canvas, so you can still see them and click them to select. It is only how the canvas looks: Preview and exports still clip. Switch it off if the faint shapes get in the way.
- **Show tooltips**: explanations when you hover buttons and fields.
- **Getting started strip**: the five jobs along the top of the editor that tick themselves. On until you put it away or tick all five; turning it on again brings it back (with the ticks kept, or cleared if all five were done). See [Your first five minutes](welcome#your-first-five-minutes).
- **Accessibility features**: on by default. Layer roles, tab stops that Enter and Space click, the focus ring and screen reader announcements while you Preview (and in the exports you make, which always keep them on). Switch it off to check whether a problem comes from it. See [Accessibility](accessibility).
- **Recording**: there is none to set. See [What the editor records](what-is-recorded).
- **Screen reader strip**: off by default. A strip under Preview that shows what a screen reader would be told by Announce nodes, as it is spoken. It only shows while Accessibility features is on. The same switch is in the Preview header, next to Accessibility.

Press <kbd>Esc</kbd> or the **×** to close. Project-wide settings (start artboard, fit, sandbox) are in the inspector with nothing selected. See [Project settings](project-settings).`,
  },
  {
    id: 'what-is-recorded',
    title: 'What the editor records',
    group: 'Getting started',
    summary: 'The editor records how it is used, and its errors, to make it better. What is kept, what never is, and that there is no off switch.',
    keywords: 'privacy analytics tracking data collected telemetry usage statistics errors bugs opt out consent record',
    body: `The editor records how it is used, and the faults it runs into, so that the people who make it can see what is used, what gets in the way and what breaks. **This is always on. There is no setting to turn it off.** It goes into the same StudyDesk analytics as the other Toolbox tools.

## What is recorded

- **That you were here**: a visit started, how long you were actively working (time with the tab showing and something being done), your browser and its version, your operating system and a rough window size.
- **Which parts you use**: the tool you pick and how long you stay in it, which panels and tabs you open, which layers you add (by kind: rectangle, text, button...), which properties you change (by name: *fill*, *opacity*...), and the bigger features you use (questions, steps, drag and drop, captions, responsive sets, the public interface, libraries, accessibility fixes, sharing).
- **Imports and exports**: the file type (*svg*, *riv*, *psd*...), how big it was, and whether it worked. For an export, the kind of file and its size.
- **Help**: which help topics you open, and how many words a search had and whether anything matched.
- **Previews**: that you opened one, and how long the project took to start.
- **Which parts of the server were called**, with the ids taken out (*projects/:id/comments*), how long they took, and the ones that failed.
- **Faults**: when something breaks (an error in the page, a part of the editor that stopped, a failed save, a file that could not be imported, a script or shader layer that failed), a short description of the error with anything in quotes, web addresses and long numbers taken out, which part it happened in, the browser, and the editor version.
- **Who and which project**: the rows carry your StudyDesk username and the id of the project you had open, like every other Toolbox analytics row.

Nothing is sent for every click. Events are added up and sent about once a minute, as a count with the time spent.

## What is never recorded

- Anything you type: text in layers, names of projects, layers, variables, artboards, libraries or files, search words, comments, captions, code, shader code.
- The contents of your projects, your images and your files. Only the *type* of a file you import or export is kept, never its name.
- The values you give properties (only that you changed *fill*, not to what).

## Published projects

A project shown through the **Link for StudyDesk** (in the Share link dialog) also reports how it ran: how long it took to show, and any script, shader, picture or data fault, with a short scrubbed description and the player version. This is for fixing bugs. This part records nothing a learner did or typed. What learners do (artboards reached, clicks, steps, answers) is a separate thing that you can read and switch off in the project, see [Insights](insights). A project exported as a file, or opened through the plain *Share link*, sends nothing anywhere.

## Who sees it

The people who make the product, as counts and lists of errors. If you are one of them, power user mode (**F9** on the projects page) has a *Usage and errors* page.`,
  },
  {
    id: 'dialogs',
    title: 'Dialogs and confirmations',
    group: 'Getting started',
    summary: 'The editor asks in its own dialogs, not the browser\'s pop-ups: what they look like, which keys work, and when you will see one.',
    keywords: 'dialog confirm prompt alert popup modal ok cancel enter escape delete are you sure danger red button link embed new folder rename move',
    body: `Whenever the editor needs an answer from you, it shows a dialog on top of the page. They look the same everywhere and work with the keyboard.

![A confirmation dialog.](help/move-to-artboard.png)

## How they work
- The **dialog** dims the page behind it. Nothing else can be clicked until you answer.
- <kbd>Enter</kbd> presses the main button. <kbd>Esc</kbd> cancels. <kbd>Tab</kbd> moves between the buttons and stays inside the dialog.
- A **red** main button, such as **Delete project**, means the action destroys something. Read the message first.
- Some dialogs have a text box, such as **New folder**. It is selected for you, so you can type straight away. If a name isn't allowed, a message under the box says why.
- Dialogs queue up: if two are needed, you get one after the other.
- None of them are the browser's own pop-ups, so they aren't blocked and they keep the editor's look.

## Where you'll see them
| Dialog | When |
|---|---|
| **Delete project**, **Delete folder** | On the projects page: move a project to the Bin (restorable for 30 days) or delete a folder (its projects are kept) |
| **New folder**, **Rename folder** | Moving a project to **New folder…**, or renaming with the pencil |
| **Move to artboard** | You dropped layers over a different artboard. See [Layers](layers-panel#moving-layers-to-another-artboard) |
| **Delete asset**, **Delete N assets**, **Remove unused assets** | Deleting from the [Assets panel](assets) or the [Usage](usage) tab. They list the files and warn about any still in use |
| **Delete timeline**, **Delete script** | The bin beside a timeline or script |
| **New variable** | Choosing **+ Create new variable…** in a node's settings |
| **Restore version** | Restoring from the [revision history](live-editing#revision-history) |
| **Turn off share link** | Stopping a [share link](export#share-link) |

The **Import design file** dialog has a **Link** / **Embed** switch for each file, plus **Embed all** and **Link all** buttons and **Cancel**. Files that can only be embedded (and every file in a browser without file linking) say so under their name. The dialog remembers your last choice.`,
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Getting started',
    summary: 'Every keyboard shortcut in the editor.',
    keywords: 'keys hotkeys keyboard',
    body: `## Tools
| Key | Tool |
|---|---|
| <kbd>V</kbd> | Select |
| <kbd>H</kbd> | Hand (or hold <kbd>Space</kbd>) |
| <kbd>A</kbd> | Artboard |
| <kbd>F</kbd> | Frame |
| <kbd>R</kbd> | Rectangle |
| <kbd>O</kbd> | Ellipse |
| <kbd>L</kbd> | Line |
| <kbd>P</kbd> | Pen |
| <kbd>N</kbd> | Pencil (freehand) |
| <kbd>K</kbd> | Connector (drag from one layer to another; see [Connectors](connectors)) |
| <kbd>W</kbd> | Bend (drag an edge into a curve) |
| <kbd>T</kbd> | Text |
| <kbd>B</kbd> | Button |
| <kbd>C</kbd> | Comment (pin a review note where you click) |
| <kbd>S</kbd> | Note (draw a sticky note for the people editing; players never see it, see [Notes](notes)) |

## Editing
| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (<kbd>Ctrl</kbd>+<kbd>Y</kbd>) | Undo / redo |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> | Copy / cut / paste (pasting image files inserts them). After clicking in the timeline they copy and paste the selected keys, see [Copy, snap and stagger keys](timelines#copy-snap-and-stagger-keys) |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> | Group / ungroup |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all on the artboard |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the selection (or the selected keyframes) |
| Arrow keys (<kbd>Shift</kbd> for 10px) | Nudge. With Snap to grid on they step to the next grid line instead (<kbd>Shift</kbd>: a stronger line), and <kbd>Ctrl</kbd> + arrow nudges by 1px or 10px as usual |
| <kbd>Alt</kbd>+arrow keys | Move the selected layer in the Layers list: up or down past a neighbour, right into the group above, left out of its group |
| <kbd>]</kbd> / <kbd>[</kbd> | Bring forward / send backward (<kbd>Ctrl</kbd> for front / back) |
| <kbd>Enter</kbd> | Go into a group or frame, edit a path's points, or edit text |
| <kbd>Escape</kbd> | Stop editing, go up a level, clear the selection, then back to Select |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save now |

## View
| Key | Does |
|---|---|
| <kbd>Shift</kbd>+<kbd>1</kbd>, <kbd>Ctrl</kbd>+<kbd>0</kbd> | Fit everything |
| <kbd>Shift</kbd>+<kbd>2</kbd> | Zoom to selection |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> | 100% |
| <kbd>Shift</kbd>+<kbd>R</kbd> | Show or hide rulers |
| <kbd>Shift</kbd>+<kbd>G</kbd> | Show or hide the grid |
| <kbd>Ctrl</kbd>+<kbd>'</kbd> | Turn the Grid snap target on or off (it switches snapping on too, if it was off) |

## Help
| Key | Does |
|---|---|
| <kbd>F1</kbd> or <kbd>Ctrl</kbd>+<kbd>K</kbd> | Search the help |
| <kbd>?</kbd> | Open the help for what is highlighted (the Help button); <kbd>?</kbd> again closes it |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Search the help (<kbd>↑</kbd> <kbd>↓</kbd> to choose, <kbd>Enter</kbd> to open) |
| <kbd>Alt</kbd>+<kbd>Left</kbd> / <kbd>Alt</kbd>+<kbd>Right</kbd> | Back and forward through the pages you have read, in the help drawer |
| <kbd>?</kbd> | Open the help |

## Text
Double-click a text layer to edit it. Select some of the text, then:

| Key | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>B</kbd> / <kbd>I</kbd> / <kbd>U</kbd> | Bold / italic / underline the selection |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> | Strikethrough |
| <kbd>Esc</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> | Finish editing |

(Use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd> on a Mac.)

## Interactions, dialogs and Preview
| Key | Does |
|---|---|
| <kbd>Del</kbd> / <kbd>Backspace</kbd> | Delete the selected node or connection in the graph |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate the selected node |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy, cut or paste the selected node in the graph (it pastes into another artboard's graph too) |
| <kbd>Enter</kbd> / <kbd>Esc</kbd> | Accept / cancel a [dialog](dialogs) |
| <kbd>Esc</kbd> | Close the Preview, Preferences or any open box |

## Mouse
| Do this | To |
|---|---|
| Hold <kbd>Alt</kbd> while drawing or resizing | Work from the centre |
| Hold <kbd>Ctrl</kbd> while dragging | Move, resize or draw without snapping to anything (grid, artboard, layers, guides, spacing, points) |
| Click the Snap button on the tool bar | Open the snapping menu: the switch and a tick for each target |
| Right-click the grid or snap button on the tool bar, or an empty part of the canvas | Snapping choices, the grid size and how often a stronger line shows |
| Drag the **Tools** title over an edge of the canvas | Dock the tool bar there (left, right or a strip along the bottom or the top) |
| <kbd>Alt</kbd>-click a path point | Switch it between curve and corner |
| <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>-click a layer | Add it to the selection, or take it out (it picks the deepest layer inside groups, so you can gather layers from different groups) |
| Double-click a group | Select inside it |

While dragging: <kbd>Shift</kbd> keeps proportions or snaps angles, <kbd>Alt</kbd> resizes from the centre. In number fields, drag the label to scrub (<kbd>Shift</kbd> ×10, <kbd>Alt</kbd> ×0.1), use arrow keys to step, or type sums like \`100/2\`.`,
  },

  // ---------------------------------------------------------------- design
  {
    id: 'artboards',
    title: 'Artboards',
    group: 'Design',
    summary: 'Screens with their own size, background, timelines and interactions.',
    keywords: 'screen page scene size background start preset duplicate delete move resize clip',
    body: `An artboard is one screen of the interactive. Each has a size, a background, its layers, its timelines and its interactions. Variables, scripts, data and assets belong to the whole project and are shared.

- Make a new one with the **Artboard** tool (<kbd>A</kbd>), the **+ Add artboard** button at the bottom of the **Layers** panel, or by right-clicking empty canvas and choosing **New artboard here**.
- Click an artboard's name above it on the canvas, or its row in the **Layers** panel, to select it. Drag the name to move the artboard around the canvas, and drag its corners to resize it.
- To select several artboards, hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) and click their names on the canvas or their rows in the **Layers** panel. <kbd>Ctrl</kbd>+click on one that is already chosen takes it out again. <kbd>Shift</kbd>+click on a name adds it, and <kbd>Shift</kbd>+click on a row selects every row between it and the one you had. Chosen artboards have a gold name and row, and the same blue outline as one. Drag any chosen artboard's name to move them all together. With several chosen, the Inspector shows what you can do to all of them: align their edges or centres, distribute them evenly (three or more), **Group artboards…**, **Ungroup**, **Tidy up**, duplicate and delete. <kbd>Del</kbd> deletes them after asking, and <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicates them. Each is one undo step.
- **Artboard groups** keep a big project organised. Select some artboards and choose **Group artboards…** (in the right-click menu, in the Inspector, or on the Layers panel) and give the group a name. The Layers panel lists the group as a folder row with its artboards under it, and its arrow folds them away (the artboards stay on the canvas). On the canvas the group gets a dashed frame with its name on a chip above its top left corner. Click the chip, or the group's row, to select all its artboards, and drag the chip to move the group. Right-click either for **Select all in group**, **Rename group…** (double-clicking the row does too), **Ungroup** (the artboards stay where they are), **Tidy up**, **Duplicate** and **Delete**. An artboard is in one group at most, and a responsive set goes into a group as a whole. Duplicating every artboard of a group makes a new group of the copies. A group is also a chapter when the project plays: **Go to artboard → Next artboard** and **Previous artboard** stay inside the artboard's group, in the project's order, and \`pageNumber\` and \`pageCount\` count its pages (see [Interactions](interactions)).
- With an artboard selected, the Inspector shows **Name**, **W** and **H** (and **Size presets…** such as Desktop, Tablet or Phone), **Background**, **Clip content to artboard** (the parts of layers outside it still show faintly on the canvas, see [Preferences](preferences)), **Make start artboard**, **Duplicate artboard** and **Delete artboard**. Then come its **Joysticks** and **Blends**, the **Project** settings and the **Fonts**.
- **Tidy up artboards** (at the bottom of the **Layers** panel, and in the right-click menu on the canvas) lays all the artboards out in a neat grid, in the order of the Artboards list, with even gaps and room for each name. The start artboard goes first if it isn't already, a responsive variant stays beside its main artboard, and an artboard that only exists to be used inside others (a component) goes last. Artboards you have hidden from the canvas stay where they are. It is one undo step (<kbd>Ctrl</kbd>+<kbd>Z</kbd>), and the group stays where it was on the canvas. An artboard group is laid out as a block of its own, with room for its frame, so a group's artboards stay together wherever they are in the list. With several artboards selected, **Tidy up** (in their right-click menu and the Inspector) lays out just those, among themselves, where their top left corner is now. To change the order, drag the artboards in the **Layers** panel, then tidy up again.
- **Fit artboard to selection** (right-click the selected layers on the canvas) resizes the artboard to just those layers. Nothing moves on the canvas: the artboard's corner goes to the selection's, and every layer and its X and Y keyframes shift to match. Layers outside the new edge are still there, just outside the artboard. It isn't offered while several artboards are selected. One undo step.
- The **start artboard** is the one the player shows first. It has a **start** badge in the Layers panel. Use **Make start artboard** (also in the right-click menu) to change it.
- Drag layers and let go over another artboard and you're asked whether to move them there. See [Moving layers to another artboard](layers-panel#moving-layers-to-another-artboard).
- To show a different arrangement of an artboard on narrow or wide pages, add a variant: see [Responsive artboards](responsive).
- Move between artboards at runtime with the **Go to artboard** action (with a transition) or \`ix.goTo('Name', 'fade')\`.
- An artboard can also be placed inside another as an [instance](instances), like a reusable component. The **Use in** menu in the Inspector does it in one step.
- To see what an artboard asks a learner to download, open **Download size** in its Inspector. See [Download size and lite versions](download-size).
- To bring a design file in as an artboard, see [Importing](import).`,
  },
  {
    id: 'layers-panel',
    title: 'Layers, hidden and locked layers',
    group: 'Design',
    summary: 'The Layers panel, hiding and locking layers, ghosts and badges on the canvas, moving layers between artboards, and right-click menus.',
    keywords: 'layers panel tree select rename reorder drag hide show hidden visible eye lock locked unlock ghost badge quick unlock move to artboard another artboard context menu right-click order group solo',
    body: `The **Layers** tab in the left panel lists every artboard in the project, with each artboard's layers beneath it, front-most first.

![The Layers panel. Sun is hidden, so its name is faded. Backdrop is locked.](help/layers-panel.png)

## Working with the list
- Click a layer to select it. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) or <kbd>Shift</kbd> and click to select several.
- The same works on the artboard rows: <kbd>Ctrl</kbd>+click adds an artboard to the selection or takes it out, and <kbd>Shift</kbd>+click selects the rows from the one you had to this one. Chosen rows are gold. Right-click a chosen row for **Group artboards…**, **Ungroup**, **Tidy up**, **Duplicate** and **Delete** on all of them; **Tidy up artboards** at the bottom becomes **Tidy up N selected artboards**.
- A named **artboard group** is a folder row above its artboards, which sit one step in under it. Click the arrow to fold it, click the row to select its artboards, double-click to rename it, and right-click it for **Select all in group**, **Rename group…**, **Ungroup**, **Tidy up**, **Duplicate** and **Delete**. Folding is just for this panel. The artboards stay on the canvas inside a dashed frame with the group's name. See [Artboards](artboards).
- Click the arrow beside a group, a frame or an artboard to open or close it. The artboard marked **start** is the one the player shows first.
- Double-click a name to rename it. <kbd>Enter</kbd> finishes and <kbd>Esc</kbd> cancels.
- Drag a row to reorder. A line shows where the layer will land, and how far it is indented shows which list it joins. Over the top or bottom third of a row the layer goes before or after it. Over the middle of a group or frame row the group is outlined and the layer goes inside it, at the front.
- Where a group ends, move the pointer left to drop the layer under the group instead of inside it: the line steps out one level for each step left. The empty space under the last row is the end of the list, so you can always drop at the very bottom without landing in a group that happens to be last. Drop on the artboard's own row to bring the layer to the top level, in front.
- From the keyboard, select one layer and press <kbd>Alt</kbd>+<kbd>Up</kbd> or <kbd>Down</kbd> to step it past a neighbour (and out of its group at the end), <kbd>Alt</kbd>+<kbd>Right</kbd> to put it inside the group just above it and <kbd>Alt</kbd>+<kbd>Left</kbd> to take it out, under that group.
- Type in **Filter layers** above the list to show only the layers whose name has those letters. The groups and artboards they sit in stay, faded, so you can see where each one is, and a collapsed group doesn't hide a match. Press **Text** beside the box to match the words in text layers, buttons and links as well, rich text included. <kbd>Esc</kbd> clears the box. While a filter is on, the rows can't be dragged.
- Right-click a layer for **Select same fill** and **Select same font**. They select every unlocked layer on the same artboard with that fill (any of a layer's fills counts, and a text layer's colour counts as a fill) or set in that font (a rich-text run in it counts). Then change them all at once in the Inspector. To change a colour or font across the whole project, use the named colour and text styles in [Libraries](libraries#styles) instead: layers that follow a style change with it.
- **+ Add artboard** and **+ Import file as artboard** are at the bottom, with **Tidy up artboards**, which puts the artboards in a tidy grid in list order. See [Artboards](artboards) and [Importing](import).

## Hide and lock
Hover a row and two small buttons appear at its right: a padlock (**Lock** / **Unlock**) and an eye (**Hide** / **Show**). They stay visible for any layer that is locked or hidden. The **Visible** and **Locked** ticks in the Inspector do the same.

- **Hidden** layers are not drawn by the player or in Preview. In the editor they show as a faint **ghost** on the canvas, so you can still see where they are and pick them. Their names are faded in the Layers panel. Hide a mask layer and its clipping stops.
- **Outside a clipping artboard**: when an artboard has **Clip content to artboard** on, the part of a layer that hangs past its edge is also drawn as a faint, diagonally striped ghost on the canvas, and clicking it selects the layer. Preview and exports still cut it off. You can switch this off in [Preferences](preferences).
- **Locked** layers can't be selected or moved by clicking on the canvas, so a backdrop never gets in your way. You can still select one in the Layers panel and edit it in the Inspector.
- The **brand layers** of a [branded project](branded-starters) (the logo, the sweeps, the footer line) are locked harder. They are skipped by clicking, dragging, the selection box and Select all, and in the Layers panel they show a padlock you can't turn off and can't be selected there either, so there is nothing on them to change by accident.
- A layer that is hidden only because its parent is a [Solo group](groups-frames#solo-groups) and it isn't the active child looks the same. Its eye says **Hidden by Solo on …: show this one instead**, and pressing it makes it the active child.

### Quick badges on the canvas
With the **Select** tool, move the pointer over a ghost or over a locked layer. A small badge appears at the top right of the layer:

- an eye with a line through it: click to **show** the layer;
- a padlock: click to **unlock** the layer.

Clicking selects the layer afterwards, ready to edit.

![A hidden layer (the faint circle) with its Show badge.](help/hidden-layer-ghost.png)

![Hovering the locked backdrop shows an Unlock badge at its top right.](help/locked-layer-badge.png)

## Moving layers to another artboard
Select layers and drag them on the canvas. If you let go over a **different artboard**, a dialog asks **Move to artboard**: *Move “Card” to the artboard “Menu”?* Press **Move** to do it or **Cancel** to put them back.

![The Move to artboard dialog.](help/move-to-artboard.png)

- The layers keep their place on the canvas, but now belong to the other artboard.
- Their keys in the old artboard's timelines are removed.
- Interactions in the old artboard that used them will need fixing. The [Usage](usage) tab's **Broken** list shows exactly which.

## Right-click menus
- **A layer**: **Cut**, **Copy**, **Paste**, **Duplicate**, **Delete**, **Order** (**Bring to front**, **Bring forward**, **Send backward**, **Send to back**), **Group**, **Ungroup**, **Combine shapes** (union, subtract, intersect, exclude), **Hide** or **Show**, **Lock**, **Select same fill**, **Select same font**, **Add interaction** (**When clicked…**, **When hovered…**, or an empty **On click** or **On hover** event) and, for text, buttons and links, **Edit text**. The shortcuts are shown beside each item.
- **An artboard**: **New** (a menu of layers to add where you clicked), **Paste**, **Make start artboard**, **Duplicate artboard**, **Zoom to artboard** and **Delete artboard**.
- **Empty canvas**: **New artboard here**, **Paste**, **Zoom to fit everything**, **Show rulers** or **Hide rulers**, and **Help**.`,
  },
  {
    id: 'properties-panel',
    title: 'The Properties panel and its search',
    group: 'Design',
    summary: 'What the right-hand panel shows for a layer, an artboard and the project, and how to find a property with the search box.',
    keywords: 'properties inspector panel right search find filter property fuzzy synonym transparency opacity round corner radius alt description hide visible colour color z-order draw order aria typo did you mean slash ctrl f',
    body: `The **Properties** panel is on the right. It shows the settings of whatever is selected: a layer (or several), an artboard, or, with nothing selected, the artboard's and the project's settings. Each group of settings is a **section** with a title. Click the title to fold it, and the **?** beside it opens that section's page.

## Folding sections
Click a section's title to fold it or open it. The editor remembers: fold **Accessibility** on one layer and it stays folded on the next layer, and after you reload (it is kept with your preferences, so it follows you to any machine you sign in on; only the sections you changed are kept, so a section you never touched still follows the editor's own default. Without a signed in session it is kept in this browser instead). **Alt**-click a title to open only that section and fold the rest. Right-click a title, or use the arrow button beside the search box, to **fold all** or **unfold all**; the menu also has **Back to the default folds**. Searching still opens every section so nothing is hidden from it, and your folds come back when you clear the box. The **+** buttons open their section so you can see what you added.

## Searching the properties
The box at the top of the panel finds a property by what it does or what it is called. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd> while the focus is in the panel (or click the box).

- It matches the label, the tooltip, the section title and other names people use. Try *transparency* (finds **Opacity**), *round* (**Corner radius**), *alt* or *aria* (**Description** and **Text alternative**), *hide* (**Visible**), *colour* or *color* (the colours), *font size* (**Size**), *z-order* (**Draw order**) or *width* (**W**).
- Small typos are fine (*opacty*, *blnd*), and the order of the words doesn't matter (*radius corner*). Every word you type has to match something.
- The best matches win: a property named exactly what you typed beats one that starts with it, which beats one with a word that starts with it, which beats a looser guess. Weaker guesses are left out when there are good matches.
- The panel shows only the matching rows. Sections that start folded open, sections with nothing in them go away, and the section with the best match comes first. A line under the box says how many properties it found.
- If nothing matches it says so and offers the closest name (*Did you mean Opacity?*); click it to use it.
- The down arrow (or <kbd>Enter</kbd>) in the box moves to the first match. <kbd>Esc</kbd> clears the search, and the panel goes back to how it was.
- Found fields work as they always do: type in them, drag their labels, key them with the diamond. The search stays while you pick other layers, so you can look at one property across several layers.

The search works for a layer, several layers, an artboard, several artboards and the project settings.`,
  },
  {
    id: 'shapes',
    title: 'Shapes and paths',
    group: 'Design',
    summary: 'Rectangles, ellipses, polygons, stars, lines, the pen and the pencil, and editing points.',
    keywords: 'rectangle ellipse circle polygon star line pen pencil freehand bezier vertices points path draw',
    body: `Pick a tool and drag on an artboard. Hold <kbd>Shift</kbd> for squares, circles and 45° lines, and <kbd>Alt</kbd> to draw from the centre. A single click makes a default-sized shape.

## Pen (P)
Click to add corner points, drag to add smooth points with handles. Click the first point to close the shape, or press <kbd>Enter</kbd>/<kbd>Escape</kbd> to finish an open path.

## Pencil (N)
Draw freehand. The stroke is smoothed into a few bezier curves when you let go. End where you started to make a closed, filled shape.

## Editing points
Select a path and press <kbd>Enter</kbd> (or double-click). Drag points and handles, click a point and press <kbd>Delete</kbd> to remove it, and <kbd>Alt</kbd>-click a point to switch it between a curve and a corner. <kbd>Escape</kbd> or <kbd>Enter</kbd> finishes. Double-click the outline to add a point. Drag an edge with the Bend tool (<kbd>W</kbd>) to curve it, and animate points to morph the shape: see [Shape morphing and the Bend tool](shape-morphing).

## Shape settings
- **Rectangle** (and **Frame**): corner radius. There are four fields, one per corner (top-left, top-right, bottom-left, bottom-right) and a padlock. Locked (the default while all four are the same), changing any field sets all four. Unlock it to give each corner its own radius, and each corner gets its own keyframe diamond so you can animate them separately. Locking again sets all four to the top-left value.
- **Polygon**: number of sides. **Star**: points and inner ratio (how deep the points are).
- **Path**: closed or open, fill rule (non-zero or even-odd for holes).
- Any shape can be a **mask** for the layers above it: tick *Use as mask* ([Groups and frames](groups-frames#masks)).

Boolean operations (union, subtract, intersect, exclude) turn several shapes into one path. See [Align, arrange and combine](arrange).`,
  },
  {
    id: 'fill-stroke',
    title: 'Fill, stroke and effects',
    group: 'Design',
    summary: 'Solid, gradient and image fills; several fills and strokes per shape; strokes, dashes and trim; feather and drop shadows; shadow, blur and blend modes.',
    keywords: 'colour color palette swatch preset toolbox brand gradient linear radial image fill stroke border dash cap join align inside outside shadow blur blend opacity trim path layers several multiple feather glow drop shadow eye hide reorder',
    body: `## Fill
Choose the type from the dropdown at the top of a fill: **None** (removes it), **Solid**, **Linear gradient**, **Radial gradient** or **Image** (cover, contain or fill). For a gradient, set the colour and position of each stop, press **+ Add stop** for more, and set the **Angle** of a linear one. Colours accept hex, \`rgb()\`, \`hsl()\` and names; the number box beside a colour is its opacity.

#### Exact gradient points
By default a linear gradient runs corner to corner along its angle, and a radial one from the middle of the layer to its farthest corner, so both stretch with the layer. **Set start and end points** (linear) or **Set centre and radius** (radial) pins the gradient to numbers instead: **From** and **To** (or **Centre** and **Radius**) in pixels from the layer's top-left corner. Pinned gradients stay where they are when the layer is resized, which is how Rive and Lottie place them. With the layer selected, the points also show on the canvas as dots joined by a dashed line (a radial one has a dot at its centre and one on its radius): drag them. **Use angle instead of points** (or **Use the box…**) goes back to the stretching kind. Points can be animated like any other number: choose \`Fill gradient start X\`, \`Fill gradient end Y\`, \`Fill gradient centre X\`, \`Fill gradient radius\` and so on in a timeline (the same for strokes and for the later fills), and a gradient stop's colour and position as \`fill.stops.1.color\` or \`fill.stops.1.offset\`. While recording, dragging a point on the canvas makes the keyframe.

### Toolbox palette
The small arrow beside every colour box (fills, strokes, gradient stops, text colours, variables, styles) opens the StudyDesk toolbox palette: the brand colours, greys, link and status colours, feature colours and gradient stops used across the suite. Hover a swatch for its name. A colour is named after its property (\`--ilar-swatch-yellow-dark\` is *Yellow dark*) unless the stylesheet gives it a name with a comment of three stars each side, \`/***name: Gold***/\`, written after the declaration on the same line, or on its own line just above it; the property name is still shown beside it. Picking one sets an ordinary colour on the layer (opacity is kept), so exports never depend on the palette. The palette is read from the toolbox's \`/styles/palette.css\` (or the minified \`palette.min.css\`, which has the colours but not the names, because minifying removes comments) when the editor opens, so changes to it appear after a reload. Where that stylesheet isn't available (a copy running outside the suite) the arrow simply isn't shown.

## Several fills and strokes
A shape can have as many fills and strokes as you like. The **+** in the **Fill** or **Stroke** header adds one on top of the others; the list shows the front-most first, like the layers panel. Each entry has:

- an **eye** to hide it without removing it, **↑** and **↓** (or drag its heading) to change the order, and a **×** to remove it;
- its own paint (solid, gradient or image) and, for a stroke, **W**idth, **Dash**, **Trim**, **Cap**, **Join** and **Align** (centre, inside or outside the outline; boxes default to inside, vector shapes to the centre);
- **α** (the opacity of that paint alone), **Blend** (how it mixes with what is under it), **Feather** (a soft blur of that paint, in pixels) and an **X / Y** offset.

Fills are drawn under strokes unless you change the paint order (below). Layers are numbered from the bottom: **Fill 1** is the shape's own fill (the one \`fill.color\` and a style refer to), **Fill 2** the next, and so on.

Some things to build with it:

- **Layered gradients**: a solid fill under a see-through gradient with **Blend** set to *multiply* or *overlay*.
- **An outline plus a glow**: a thin dark stroke over a wide, see-through stroke with a **Feather**.
- **A drop shadow that follows a shape's fill or stroke**: add a fill, make it dark and see-through (alpha in its colour or **α**), set **Feather** to 12 or so and **Y** to a few pixels, and move it down the list so it sits under the real fill. It is the way a Rive drop shadow is built, and Rive files import that way.

Each paint's numbers can be animated: look for the diamond next to a field. The property names are \`fill.opacity\`, \`fills.0.color\`, \`fills.0.opacity\`, \`fills.0.feather\`, \`fills.0.offsetX\`, \`strokes.0.width\`, \`strokes.0.paint.color\`, \`strokes.0.trimEnd\` and so on (\`fills.0\` is the second fill, \`strokes.1\` the third stroke); bindings, **Set property** nodes and scripts use the same names. A shape with one plain fill and stroke is drawn as before; a shape with layers, or with opacity, blend, feather, an offset, a cap, join or align on a paint, is drawn as SVG. Buttons and inputs draw only their first fill and stroke. Lottie export keeps every fill and stroke with their opacity, and leaves out the blend modes, feathered and offset paints (shadows), which Lottie cannot hold.

### Paint order
Some shapes need a stroke *under* a fill, or between two fills: an outline that shows only where a fill leaves it uncovered, or a fill that overlaps the inner half of its own stroke. Select one shape that has both a fill and a stroke and a **Paint order** section appears under **Stroke**, listing every paint in one list, front-most first (buttons and inputs, and several layers selected at once, don't have it). Press **↑** or **↓**, or drag a row, to move a paint in front of or behind the others. Each row shows a swatch and what the paint is (its colour, the kind of gradient, a stroke's width). Moving a fill past another fill swaps those two fills, so the numbers stay where they are while their colours trade places; the list in the **Fill** section follows. The moved row is highlighted and the arrow you pressed keeps the keyboard focus, so pressing it again keeps moving the same paint. A shape you have not reordered keeps all its fills under all its strokes, as before.

![Paint order of a shape with one fill and two strokes: the wide red stroke is moved under the yellow fill, so only its outer half shows. The list reads Stroke 2, Fill, Stroke 1 from the front.](help/paint-order.png)

![Pressing the arrows in the Paint order list: the wide stroke goes under the fill and comes back, and the picture follows.](help/paint-order-reorder.mp4)

On a frame, rectangle or ellipse the strokes that end up in front of the last fill are still drawn above the shape's children; strokes placed under a fill are drawn under the children with it. In a saved project the order is the shape's \`paintOrder\`, a list of \`"fill"\` and \`"stroke"\` entries from the bottom up (for example \`["fill", "stroke", "fill"]\`); it is left out when every fill is under every stroke. Rive files import with the order they were drawn in, and Lottie export follows it.

## Stroke
Colour, width, **cap** (butt, round, square), **join** (miter, round, bevel), **align** (centre, inside, outside) and **dash** (e.g. \`8 4\` for 8 on, 4 off).

### Trim path
The **Trim** row in the Stroke section has a start (**Trim**), an end (**to**) and an offset (**Off**), all 0–100%. They draw only part of a stroke. Animate the end (the *Trim end %* property) from 0 to 100 to make a line draw itself on. Works on every shape with a stroke.

## Effects
Use **+** in the **Effects** section to add a shadow or a layer blur; each one has a **×** to remove it.

- **Shadow**: **X**, **Y**, **Blur**, **Spread** and **Colour**. Tick **Inner** to draw the shadow inside the shape instead of behind it.
- **Layer blur**: blurs the whole layer by an **Amount** in pixels.
- **Shader filter** (image layers only): draws the picture through a GPU shader, such as wave distortion, CRT scanlines, halftone dots or film grain. See [Shader layers](shader-layers#shader-filter-on-an-image).

Two related settings are in the **Layer** section at the top of the Inspector, with the position fields:

- **α** is the opacity of the whole layer (0 to 1).
- **Blend** is how the layer mixes with what is under it: *Normal*, *Dissolve*, *Darken*, *Multiply*, *Colour burn*, *Lighten*, *Screen*, *Colour dodge*, *Add (linear dodge)*, *Overlay*, *Soft light*, *Hard light*, *Difference*, *Exclusion*, *Hue*, *Saturation*, *Colour* or *Luminosity*. **Dissolve** draws each pixel either solid or not at all, with the layer's opacity as the odds: at 40% opacity, 40% of the pixels show at full strength, scattered, instead of everything fading. Animate the opacity for a speckled fade in or out. A single fill or stroke (in the paint list) can use every mode except Dissolve.

Most of these can be animated: look for the diamond next to a field. See [Animatable properties](animatable-properties).`,
  },
  {
    id: 'text',
    title: 'Text',
    group: 'Design',
    summary: 'Text layers, fonts, sizing and live values in text.',
    keywords: 'font typography type size weight align template variables google fonts upload rich text runs bold italic underline selection range several styles',
    body: `Use the **Text** tool (<kbd>T</kbd>): click for text that grows as you type, or drag a box for wrapping text. Double-click text to edit it, and <kbd>Escape</kbd> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to finish.

- **Sizing**: *Auto width* (one line, grows sideways), *Auto height* (fixed width, wraps and grows down) or *Fixed* (you set both). With *Fixed*, **Overflow** says what happens to lines that don't fit: *Show* them anyway, *Clip* them at the box, or cut the last line that fits with an *Ellipsis …*. Untick **Wrap lines** to keep the lines as written (long ones run on, or are clipped or cut by the overflow setting).
- **Fit text to box**: tick it and the size of the text is chosen for you, as the largest that makes the text fit the box (width and height, wrapping as usual), so a short word fills the box and a long sentence shrinks to fit it. **Smallest** and **Largest** keep the size between two limits, in pixels; leave one blank (it says *any*) for no limit on that side: *any* Smallest goes down to 1, *any* Largest goes as big as the box height allows. If the Smallest is higher than the Largest, the Largest wins. It follows the text as it changes, including \`{variables}\` and text a binding sets, and it re-fits when you resize the box, change the font or switch to another [responsive variant](responsive), in the editor and in the player alike. Things to know: fitting needs a box that stays put, so **Sizing** is *Fixed* (and greyed out) while it is on; the **Size** field is greyed out too, and neither it nor a timeline or binding on the font size does anything while it is on (the fitted size wins); words that are styled with their own size in [rich text](text#several-styles-in-one-text-layer) scale along with the rest; a long word is never broken to make it fit, so a narrow box ends up with a smaller size instead; and if the text is too long even at the Smallest, it overflows by the layer's **Overflow** setting (and a long word is broken). It also works on a [button](web-elements)'s label and a link's text, which have no Sizing to switch.
- **Animating the box**: a text layer's **Height**, **Width** and **Origin X / Y** can be keyed in a timeline like any other layer's. With *Fixed* sizing a changing height clips or ellipsises the lines that no longer fit, and the vertical alignment keeps following the box. *Auto width* and *Auto height* text work their size out from the text, so keys on the size they work out have no effect. **Origin Y** moves the pivot of the layer's turn and scale (0 top, 1 bottom).
- **Font**: a search box over every Google font. Click it and type to filter ("playf" finds Playfair Display), then use <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> or click to pick, <kbd>Esc</kbd> to close. Each row is drawn in its own font. The chips above the list narrow it to Sans, Serif, Display, Handwriting or Mono. The project's own fonts come first (tagged *In project* or *Uploaded*), then a few system fonts, then the rest. Picking a Google font the project doesn't have yet adds it to the project's **Fonts** with the weights the text uses, so the player and exports load it; one undo takes both back. Changing the **Weight** later loads that weight too. A name that isn't on the list can still be used as typed (it is not added to the project's fonts, so add it there if it is a Google font). A font file you upload in the [Assets panel](assets) is added to the fonts for you and shows in the list as *Uploaded*. New text starts in your [default font](preferences), Open Sans unless you changed it.
- Weight, italic, size, line height, letter spacing, alignment, vertical alignment, case and decoration.
- **Paragraph spacing**: extra space, in pixels, between paragraphs (the pieces of text between line breaks), on top of the line height. An *Auto height* or *Auto width* box grows to fit it. It does not apply to text with [modifiers](text-modifiers).

## Several styles in one text layer
Double-click a text layer to edit it. A small **toolbar floats over the text** while you do, like the one in a word processor:

![The toolbar over a text layer being edited, with "big" bold and a colour, size and link set on other words.](help/text-toolbar.png)

Select some of the text (or just put the caret in a word) and use:

- **B**, **I**, **U** and **S**: bold, italic, underline and strikethrough. A button that is lit means all the selected text has it; a button with a ring around it means only some of it does (press it to switch it on for all of it).
- **A** (colour): click it for the colour picker, or its arrow for the toolbox palette. The bar under the A shows the colour of the selection, a rainbow when it has several.
- **Size**: type a size in pixels and press <kbd>Enter</kbd>, or pick one from the list. The box is empty (it says *mixed*) when the selection has several sizes.
- **Font**: the project's fonts and the standard ones; *Mixed* when the selection has several. For any other Google font, pick it in the Inspector's **Font** field.
- **Link**: add a link to the selection, or edit the one the caret is in. Type the address (a web address, \`mailto:\` or \`tel:\`; \`example.com\` becomes \`https://example.com\`), choose whether it opens in a new tab, and press <kbd>Enter</kbd>. **Remove** takes it off. Linked text is marked with a thin line under it while you edit.
- **Tx** (clear formatting): takes every style off the selection, so it goes back to the layer's own.

With nothing selected the buttons work on the word the caret is in. Between words there is nothing to style, so they are switched off.

Shortcuts, in the text or in the toolbar (<kbd>Cmd</kbd> on a Mac): <kbd>Ctrl</kbd>+<kbd>B</kbd> bold, <kbd>Ctrl</kbd>+<kbd>I</kbd> italic, <kbd>Ctrl</kbd>+<kbd>U</kbd> underline, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> strikethrough, <kbd>Ctrl</kbd>+<kbd>K</kbd> link (while editing text; <kbd>F1</kbd> still opens the help search), <kbd>Ctrl</kbd>+<kbd>\\</kbd> clear formatting.

The toolbar works from the keyboard too, and it never takes the focus off the control you are using. <kbd>Tab</kbd> (or <kbd>Alt</kbd>+<kbd>F10</kbd>) goes from the text into the toolbar, <kbd>Tab</kbd> and <kbd>Shift</kbd>+<kbd>Tab</kbd> move between its controls, and the left and right arrows move along the buttons. <kbd>Enter</kbd> or <kbd>Space</kbd> presses a button and the focus stays on it, so you can press the next one. In the size box, type a number and press <kbd>Enter</kbd>, or press <kbd>Up</kbd> and <kbd>Down</kbd> to step it (<kbd>Shift</kbd> steps by ten); the box keeps the focus. In the font box, <kbd>Down</kbd> opens the list, the arrows move through it and <kbd>Enter</kbd> picks. Whichever control you change, the change goes to the characters that were selected when you left the text (they stay highlighted while you are in the toolbar). <kbd>Esc</kbd> goes back to the text with that selection, and so does <kbd>Shift</kbd>+<kbd>Tab</kbd> from the first button, or a click in the text. The toolbar sits above the text box, or below it when there is no room, and stays on the canvas. It works the same for *Auto width*, *Auto height* and *Fixed* text. A button's label is edited in a plain box with no toolbar.

While part of the text is selected, the Font, Size, Weight, Letter, Colour, Italic and Decoration fields in the inspector change just that selection too. Select all of a layer that has no styled parts and they change the whole layer, as usual. Click outside the text to go back to styling the whole layer.

Each differently styled stretch is stored as a **run**. A run only records how it differs from the layer's own style, so changing the layer's colour or font still changes every run that doesn't set its own. You never need to see them, but the **Text runs** list is still there under **Advanced** in the inspector (closed until you open it) for fixing them by hand: edit a run's text, its styles and its link, add a run, or clear all run styling. Neighbouring runs with the same style merge by themselves. A run with a link is a hyperlink to that address in the player (links are inert while editing).

Things to know:
- The layer's **Text** field always shows the runs joined. Typing in it keeps the styling around your edit.
- Sizing, alignment, line height, case and the shadow belong to the whole layer, not to runs. Line height is one value for the whole layer, so a much bigger run makes its lines taller but not by a different multiplier.
- A **binding** on Text (or a timeline, tween or *Set property* action that sets Text) replaces the runs with that plain text for as long as it applies. Variables in braces like \`{score}\` still work inside each run, but a \`{...}\` slot should sit within one run.
- Lottie export writes the text in the layer's own style (Lottie text has one style per layer). SVG and PNG export, the player and the single-file export keep every run. Rive files with several text runs import as runs.

## Live values in text
Anything in braces is an [expression](expressions): \`Score: {score}\`, \`{name.toUpperCase()}\`, \`{items.length} items\`. Write \`{{\` for a literal brace.

To animate a text layer one letter, word or line at a time (typewriter, wave), see [Text modifiers](text-modifiers).`,
  },
  {
    id: 'text-modifiers',
    title: 'Text modifiers',
    group: 'Design',
    summary: 'Animate text one letter, word or line at a time: typewriter, waves and staggered effects.',
    keywords: 'text modifier animator range selector per letter word line typewriter wave stagger reveal offset start end shape randomize split chars characters',
    body: `A **text modifier** changes the letters, words or lines of a text layer inside a *range*. Slide the range along the text over time and the change travels through the text: a typewriter reveal, a wave, letters dropping in one after another. Select a text layer and open **Text modifiers** in the inspector.

## One click
- **Typewriter** adds a modifier that hides every letter, plus a timeline that slides its range off the end so the letters appear in order. The timeline plays when the artboard starts.
- **Wave** adds a modifier that lifts the letters under a smooth hump, plus a looping timeline that rolls the hump through the text.

Both create a new timeline named after the preset and open it, so you can change its length, easing or loop straight away.

## How a modifier works
- **Per**: the unit the range counts: *Letters* (spaces are skipped), *Words* or *Lines* (found from how the text wraps, so they follow the layer's width).
- **Start** and **End**: the range, as a percent of the text. **Offset** slides the whole range along the text, even past either end (-100 to 100). Keying the **Offset** is how most effects are made.
- **Shape**: how strongly units are hit across the range. *Square* hits all of them equally, *Ramp up* and *Ramp down* grow or fade across it, *Triangle*, *Round* and *Smooth* peak in the middle (*Smooth* has soft edges). *Falloff (ramps)* is Rive's range falloff: the weight climbs in a straight line from **Start** to **Ramp up to**, stays full, then falls in a straight line from **Ramp down from** to **End** (a Ramp up to at or before Start, or a Ramp down from at or after End, leaves that side a hard edge, and where the two cross the ramp up wins). Both points are percents of the text and move with **Offset**, and can be keyed. **Ease** shapes the weight.
- **Randomize** hits the units in a scrambled but repeatable order; change the **Seed** for another order.
- **Strength** is how much of the modifier applies, 0 to 100.
- The changes at full strength: **X** and **Y** move, **↻** turns and **Scale** scales (around the centre of each letter, word or line), **Opacity** fades, **Tint** mixes toward a colour, **Spacing** adds letter spacing and **Blur** blurs.

A unit halfway into the range gets half of each change. Several modifiers stack, top to bottom.

## Animating them
**Start**, **End**, **Offset**, **Strength** and the amounts all have a key button (◆) like any other property: turn on recording in the [timeline](timelines) and change them, or key them by hand. The tracks are named like \`modifiers.0.offset\`, the number being the modifier's position in the list. Deleting a modifier removes its tracks and renumbers the later ones. Bindings, *Set property* actions and scripts can set the same paths.

## Things to know
- Everything except **Spacing** is purely visual: it does not change how the text wraps or the layer's auto size. Letter spacing really spaces the letters, so the text may reflow.
- Modifiers work on rich text too: each letter keeps its run's styling. A word that crosses a run boundary is still one word.
- Letters and words are drawn as separate pieces, so kerning pairs and ligatures between them are not applied while a modifier is on (a modifier that only fades or tints keeps them as far as the browser allows).
- With **reduced motion** on, modifiers still apply, but timelines that animate them show their last frame instead of playing.
- Lottie files with text animators import as modifiers (range selector and the position, scale, rotation, opacity, colour and tracking properties). The Lottie export does not write them.`,
  },
  {
    id: 'assets',
    title: 'The Assets panel',
    group: 'Design',
    summary: 'Every file in the project: upload, preview as thumbnails or a list, place on an artboard, check several and delete.',
    keywords: 'assets files upload drop drag thumbnails details size slider checkbox select all delete remove place unused image video audio font data panel',
    body: `The **Assets** tab in the left panel lists every file in the project: images, video, audio, fonts and data files.

![The Assets panel in thumbnail view, with one asset checked and the Delete button showing.](help/assets-panel.png)

## Adding files
- **Upload files** opens a file picker. You can pick several at once.
- Drop files on the **Assets** panel itself to add them without placing anything: images, video, audio (\`.mp3\`, \`.wav\`, \`.ogg\`...), fonts and data files. The panel shows a dashed outline while you're over it.
- Or drop files on the canvas, or paste them. Dropped pictures and video are also placed on the artboard where you dropped them.
- Font files (\`.woff\`, \`.woff2\`, \`.ttf\`, \`.otf\`) are added to the project's fonts as well, and a message tells you.
- Data files (JSON, CSV, TSV, text) are used from the **Data** tab. See [Data sources](data-sources).
- Design files (\`.psd\`, \`.ai\`, \`.pdf\`, \`.dxf\`) aren't stored as assets: they become new artboards. They are listed under **Design files** at the top of the panel, each with **Update…** to bring in a new version. See [Updating a design file](import#updating-a-design-file).

## Replacing a file
The **↑** button on an asset (beside the bin) replaces its file with a new version of the same kind: a new picture, sound, video, font or data file. Everything that uses it (layers, fills, **Play sound** actions, timeline audio, fonts, data sources) shows the new file, and one undo puts the old one back. An image or video layer's inspector has **Replace file…** for the same thing. A sound on a timeline gets the new file's length, and if the timeline was exactly as long as the old sound (or the new one runs past its end) you are asked whether to set the timeline to match, so a swapped soundtrack does not leave silence or cut off the end.

## Looking at them
- **Thumbnails** shows a picture for each asset. Drag the slider beside it to make the thumbnails bigger or smaller.
- **Details** is a list with each asset's kind and size, and **unused** if nothing in the project refers to it. Once you have started an attributions list, it also says **no attribution** beside a file no entry covers yet (the thumbnails carry a small **No attribution** tag instead). For a big picture it also says what its lighter copies are doing: **Editing copy** (what the canvas shows, see below) and **Output** with the size a download or share link carries and how much that saves, or **already small enough** when the picture is left as it is.
- Hover an asset for its full name and size. Your choice of view and thumbnail size is remembered in this browser.

## Crediting them
The **©** button on an asset (beside the **↑**) opens the [Attributions](attributions) tab on the entry for that file, making one named after the file if it has none. Fill in who made it, where it came from and the licence there. When some files still have no entry, a line above the list says how many and opens the tab.

## Big pictures
Every picture stays in the project at its full size. Camera photos are heavy, so two lighter copies are made from them in your browser and kept beside the original on the server:
- **An editing copy**, for a picture over about 2 MB or 2560 px on the long side. The canvas shows it instead of the original, so a large photo does not slow down editing. It is made a moment after you add the picture (or the first time you open a project that has big ones), and you won't see a difference at normal zoom.
- **An output copy**, made when you download or share, if [Optimise output](project-settings) is on. See [Exporting](export#optimised-pictures).

Only JPEG, PNG and WebP pictures are touched. SVG, GIF and animated PNG or WebP files are always left exactly as they are, and so is any picture that is already small. Replacing a picture with **↑** makes new copies for the new file. The original is never changed, and turning Optimise output off sends everything at full size again.

## Using them
- **Place** puts an image or video on the artboard you have open, in the middle, at 300 by 200. You can then resize it.
- Image fills, video and image layers, **Play sound** nodes and fonts pick their file from a dropdown of the project's assets. Most of those dropdowns also offer **+ Add a new image…** (or sound, video or data file), which uploads and selects in one step.

## Checking and deleting
- **Find duplicate files** (under Upload files) looks for files that were added more than once, such as the same logo dropped in three times. It lists them and offers to merge: everything that used a copy uses one file instead, and the copies leave the list. Undo puts them back.
- Click an asset, or its checkbox, to check it. <kbd>Shift</kbd>+click checks a range. The box above the list, **Select all**, checks or unchecks every asset.
- When anything is checked a red **Delete** button appears with the count. A dialog lists the files and warns if any are used. Deleting an asset that layers still use leaves those layers empty.
- The bin on one asset deletes just that one (it asks first).
- To clear out everything nothing uses, see [Usage](usage#removing-unused-assets).`,
  },
  {
    id: 'attributions',
    title: 'Attributions and references',
    group: 'Design',
    summary: 'Keep a list of where the pictures, sounds, text and data came from and what the project draws on, link entries to assets, and choose whether learners get a Credits button.',
    keywords: 'attributions references credits citations sources licence license copyright creative commons cc by cc0 public domain permission creator author year bibliography credit button acknowledgements assets no attribution',
    body: `Most projects use something somebody else made: a photograph, a sound, a passage of text, a data set, a font or a script. Many licences ask for a credit when you do, and a good course also says what it draws on. The **Attributions** tab (bottom panel) is where you keep that list. It is optional: nothing in the project needs it, and a project that never uses it carries nothing extra.

## Adding entries
Press **Add entry** and fill in what you know. Everything except the kind can stay empty while you gather it.

| Field | What goes in it |
|---|---|
| Kind | **Image**, **Audio or video**, **Text**, **Data**, **Software**, **Other**, or **Reference** for a book, article or page the project draws on rather than something it contains |
| Title | The name of the work, or what it is (*Sunset over the bay*, *Chapter 4*) |
| Creator | Who made it: a person, a studio, an agency |
| Year | When it was made or published. Any text works: *2019*, *2019-2021*, *n.d.* |
| Source link | Where it can be found. A web address becomes a link learners can open in a new tab. Anything else (a page number, a shelf mark) shows as plain text |
| Licence | The terms, in your own words. **Suggestions** offers the common ones (CC BY 4.0, CC BY-SA 4.0, CC BY-NC 4.0, CC0, Public domain, All rights reserved, Used with permission), and you can type anything else |
| Notes | For you only: who gave permission, when it expires, where the original is. They never reach learners and are left out of exported and shared pages |
| Files | The project assets this entry covers. **Link a file…** lists the Assets panel's files |

Under each entry you see the citation as learners will see it, for example: *Jane Smith (2021). Sunset over the bay [Image]. Licence: CC BY 4.0.* followed by the link. With no creator the title leads and the year follows it. An entry with no title, no creator and no link is not shown to learners.

Use the arrows to reorder entries and the bin to delete one. **Copy as text** puts every entry on its own line on the clipboard, ready to paste into a document or a course page.

## Which files have no credit yet
Link each entry to the files it covers. Once the list has entries, the [Assets](assets) panel marks every file that no entry covers (**no attribution** in the details view, a **No attribution** tag on a thumbnail) and says how many there are. **Add for files without one** in this tab makes one entry for each of them, named after the file, for you to fill in. Deleting a file takes it off the entries that listed it.

## Showing it to learners
- **Show a Credits button to learners** adds a small **Credits** button in the bottom left corner of the player. It opens a dialog with the list as readable citations, under the heading you choose (the default is *Credits and references*). Links open in a new tab. It works from the keyboard: the dialog takes focus, <kbd>Tab</kbd> stays inside it, <kbd>Esc</kbd> or **Close** shuts it and focus goes back to the button. It also works on a shared link, where the page runs in its sandbox.
- **Keep the list in exported and shared pages** puts the list (without your notes) into pages you download or share even when there is no button, for anyone who reads the page's data. While the button is on this is always the case, since the button needs the list.
- With both off, the list is your own record. It stays in the editor, in the project file (**Export** as \`.ixp\` or JSON) and in templates made from the project, notes included, and the pages you export and share carry none of it.

The same two settings are in the **Credits** section of the project settings (see [Project settings](project-settings)). Preview shows the button when it is on.

## Working together
The list is part of the project, so people editing it live see each other's changes like any other edit, and undo covers it.

Copyright reporting for a course is run at course level, and this tab does not replace it. It is the place to keep the facts while you work.`,
  },
  {
    id: 'images-media',
    title: 'Images, video and audio',
    group: 'Design',
    summary: 'Adding files, the Assets panel, and 9-slice scaling for images.',
    keywords: 'image picture photo svg video audio sound mp3 upload drop paste asset nine slice 9-slice n-slice',
    body: `Drop files on the canvas, paste them, or use the **Image** tool. SVG files become editable vector layers; other images become image layers. Video files become video layers; audio files are stored as assets for the **Play sound** action.

Pictures dropped or pasted onto an artboard are scaled to fit (up to 600 px for images and 640 px for video) and centred where you dropped them. The **Media Catalogue** button in the tool bar's Media group finds a photo in the suite's library instead: see [The Media Catalogue](media-catalogue). Every file is also kept in the project's **Assets** panel: see [The Assets panel](assets) for thumbnails, details, checking several at once and deleting.

## Image settings
**Fit** (cover, contain, stretch), corner radius, and:

### 9-slice scaling
Turn on **9-slice** and set the four insets (in image pixels). The corners keep their size and the edges and middle stretch, so a rounded panel or button image can be resized without distortion. **Fill edges** chooses between *Stretch* and *Tile*: with *Tile* the edges and middle repeat the picture at its own size instead of stretching.

## Video
Autoplay, loop, muted, controls and fit. Most browsers only autoplay muted video.

### Poster, and a video with nothing to play
**Poster** is a picture shown before the video plays. It also stays up the whole time when the file is sound only (choose a sound in the **Video** list and the layer becomes a player with the browser's own controls, speed and captions), under the controls. It counts in the download size and goes with exports. A video with no file or address shows a grey **Choose a video** panel while you edit; learners see a plain grey box, or the words in **Text when empty**. The accessibility check warns about a video with nothing to play, so it gets filled in or deleted before you share.

### Cue points and chapters
**Add a cue** puts a named point on the video, in seconds. When the video plays across it the **On video cue** event fires (\`event.name\`, \`event.time\`, \`event.index\`), and a cue ticked **Pause the video here** has already paused it, so a question can appear. Play on with a **Control video** node when it is answered, or bind the layer's **Hold paused** to something like \`!answered\` to keep the video paused until then (the controls cannot start it). Jumping past a cue (dragging the bar, a chapter, a **Control video** seek) fires nothing, and jumping back arms it again, so you never need to keep count of which questions were asked. **Chapters** are named sections: the video's own controls list them in browsers that show chapters, \`self.chapters\` and \`layer("Clip").chapters\` give the list to formulas, and the **Chapter showing** binding says which one the video is in (1 is the first, 0 before it).

### Speed and frame step
**Speed** sets how fast the video plays: 1 is normal, 0.5 is half speed, 2 is double. The pitch stays where it was, so slowed speech still sounds like the speaker. Tick **Speed buttons** to put Slower, a speed readout (press it to go back to normal) and Faster over the video for the viewer, and **Frame step** for Back and Forward one frame (the video pauses first). Set **Frames per second** to the video's own rate (most are 24, 25 or 30) so a step is one real frame. Everything is a real button, so Tab and Enter or Space work, and with focus on the video or the buttons, <kbd>,</kbd> and <kbd>.</kbd> step a frame and <kbd>&lt;</kbd> and <kbd>&gt;</kbd> change the speed.

To drive it from the project, use a **Playback speed** [data binding](bindings) (it goes both ways, so a variable shows the speed the viewer chose and can set it too), or the **Control video** [node](interaction-nodes): play, pause, play or pause, go to a time, skip forward or back, step a frame, set the speed, or move to the next speed up or down. In an expression, \`layer("Clip").rate\` is the speed it is playing at right now.

## Video playback in variables
Add a [data binding](bindings) on the video layer: **Playback position (s)**, **Playing**, **Playback speed**, **Length (s)**, **Ended**, **Chapter showing** (read only) or **Hold paused** (while true the video cannot play), and pick which way it goes. **Out** keeps a variable up to date with the video (show the time in text, \`{videoTime} s\`, or bind a progress bar's width to \`videoTime / videoLength\`). **Both** lets the variable drive the video too: set the position variable from a slider, a **Set variable** node or a script and the video jumps there; set **Playing** to false and it pauses. **In** drives it from a formula: to scrub the video with a dragged knob, bind the knob's **X** out to \`knobX\`, **Length (s)** out to \`videoLength\`, and **Playback position (s)** in to \`remap(knobX, 0, artboard.width - layer('Knob').width, 0, videoLength, true)\`. For the position as a percentage, use \`remap(knobX, 0, artboard.width - layer('Knob').width, 0, 100, true)\` (in a text layer, or another binding). Positions are to the hundredth of a second. They work in Preview and in exports, not on the editing canvas, where the video doesn't play.`,
  },
  {
    id: 'groups-frames',
    title: 'Groups and frames',
    group: 'Design',
    summary: 'Grouping layers, frames that clip and lay out, masks, solo groups, draw order and scrolling frames.',
    keywords: 'group frame container clip mask masking clipping solo state switch draw order z-order nest focus scroll scrollable overflow',
    body: `- A **group** (<kbd>Ctrl</kbd>+<kbd>G</kbd>) moves, scales and animates its layers together. Its box stays around its layers: move, resize, add or remove one and the group's box follows (nothing moves on the canvas, and keys on the layers' positions are adjusted to match). Untick **Size to contents** in the Group section to keep a box you set yourself. A rotated or scaled group, and a repeater, keep the box they have, since refitting would move the point they turn around.
- A **frame** (<kbd>F</kbd>) is a box with its own fill, stroke and corner radius. It can **clip** its contents and can use [auto layout](auto-layout).

Press <kbd>Enter</kbd> on a group or frame to work inside it; <kbd>Escape</kbd> goes back out.

## Masks
Tick **Use as mask** on a shape or group and it clips the layers above it in the same group, up to the next mask, so they only show inside its outline (the way masks work in most design tools). A group masks with the shapes inside it. A picture used as a mask clips by its transparency (so a cut-out PNG works as a stencil), as long as it is stretched to its box (fit *fill*) and only moved or scaled. The mask itself is not drawn in the player; on the canvas it shows as a faint ghost so you can still pick it. Hide the mask layer to turn the clipping off. To clip just one layer, put the mask and that layer together in their own group.

**Mask mode** (shown once *Use as mask* is on) chooses how the mask's coverage is worked out. *Alpha* (the default) shows the layers where the mask has shapes. *Inverted* shows them everywhere the mask has none, a hole where the shapes are. *Luminance* shows them as brightly as the mask's painted shapes are: white lets everything through, black nothing, a grey, a gradient or a half-transparent shape part-way (a picture counts as the picture itself). *Inverted luminance* is the opposite of that. The inverted and luminance modes are drawn with an SVG mask, so they are not limited to the layer's box (and a picture works by its pixels in them); the plain alpha mode is the crisp clip path.

## Solo groups
Tick **Solo** on a group or frame and it shows only one child at a time, the one chosen under **Active child**. Use it for states of a character or a button: build each state as a child, then switch between them. The active child can be keyed on a timeline (a step change, like a cut) or set from interactions with **Set property** and the property *Solo: active child*, whose value can be a quoted layer name such as \`"Happy"\`. Children that are not active take no room in auto layout.

## Draw order
A group's **Draw order** section lists its children front to back with arrows to move them. With **Record** on, or with the diamond, a change becomes a keyframe on the *Draw order (children)* property, so layers can pass in front of and behind each other during an animation. Keys always step from one order to the next. Layers you do not list keep their place. From interactions or scripts, set the property \`drawOrder\` to a list of layer names, back to front.

## Scrolling frames
Set a frame's **Overflow** to *Scroll vertically*, *Scroll horizontally* or *Scroll both*. Content beyond the frame can then be scrolled with the wheel, a trackpad or touch in the player, like a scrollable panel. An **On scroll** event set to *Is scrolled* fires as it scrolls, with \`event.scrollTop\`, \`event.scrollLeft\` and \`event.progress\` (0 to 1). In the editor the frame stays still so you can edit it; scroll it in Preview.`,
  },
  {
    id: 'auto-layout',
    title: 'Auto layout',
    group: 'Design',
    summary: 'Frames that arrange their children in rows, columns, grids or stacks, with fill, hug and percent sizes, grow, margins and aspect ratios.',
    keywords: 'flex flexbox grid row column stack gap padding justify align wrap hug fill percent absolute responsive grow basis aspect ratio margin auto cell span layout item',
    body: `Turn on **Auto layout** on a frame and its children are placed for you, like CSS flexbox.

| Setting | Meaning |
|---|---|
| Direction | Row (left to right) or column (top to bottom) |
| Gap | Space between children, in px or a percent |
| Padding | Space inside the frame's edges (top, right, bottom, left), in px or a percent |
| Justify | Where children sit along the direction: start, centre, end, space between |
| Align | Across the direction: start, centre, end, stretch |
| Wrap | Start a new row/column when one is full (row or column layouts; a grid has no wrap). **Line gap** (shown while Wrap is ticked) is the space between the wrapped rows, or columns in a column layout. It starts out equal to Gap; type a different number to separate the rows more or less than the items in them |
| Hug width / height | The frame shrinks or grows to fit its children |
| Layout | *Row or column* (above), *Grid* or *Stack*: see [Grids and stacks](#grids-and-stacks) below |

A **hidden** layer takes no space in the frame, in the editor and in the player: hide one and the others close up over the gap it left, show it and they make room again.

![A frame whose Wrap is ticked: the nine cards fill a row, then continue on the next. Gap is 12 between cards and Line gap is 40 between the rows.](help/line-gap.png)

![Changing Line gap and Gap: the rows move apart and the cards spread or regroup.](help/line-gap.mp4)

## Percent padding, margin and gap
Every padding, gap and margin field takes **px** (the default) or a **percent**. Type \`10%\` (or \`10px\` to go back), or press the small **px / %** button at the right of the field; pressing it keeps the size the value comes to now, so 20 px in a 400 px wide frame turns into 5%. Each side can have its own unit.

A percent is worked out again on every layout, so it follows the frame as it is resized or the page changes size. It is a share of a **width**, on both axes (the way CSS and Rive do it, so a 10% padding is the same all the way round):

- **Padding and gap**: the inner width of the auto-layout frame this one sits in, or this frame's own width when it is not in one (the artboard's top layout, for one).
- **Margin**: the inner width of the frame that lays the layer out.

![The Auto layout section of a frame with the Gap switched to a percent: the small button at the right of the field says % and shows px again when pressed.](help/layout-percent.png)

A frame that hugs its width measures a percent against the width it had before the layout ran, so it settles in a pass or two rather than chasing itself. Percent **sizes** of a layer are separate (see *Percent* under child sizing); a track in a grid can be a percent too.

## Grids and stacks
Set **Layout** to **Grid** to put the children in the cells of a table instead of along a line, or to **Stack** to put them all on top of each other.

- **Columns** and **Rows** list the size of each track, separated by spaces, like \`100px 25% 1fr auto\`. A track is a size in px (a bare number is px too), a percent of the frame's inner size, \`fr\` (a share of what is left once the other tracks are taken, so \`1fr 2fr\` gives the second twice the first), or \`auto\` (as big as the biggest thing in it). Rows past the ones you list are \`auto\`, so an empty **Rows** box makes a row for every line of children. Words that are not sizes are dropped. With no columns listed there is one column; a frame that hugs its width has \`%\` and \`fr\` tracks only as big as what is in them.
- **Column gap** and **Row gap** are the spaces between tracks. (A grid has no **Wrap** or **Direction**: children fill the cells in layer order, left to right and then down, unless a child is given its own cell in **Layout item**.)
- **Cell alignment** is a 3x3 picker. A child smaller than its cell sits where you click: the top left corner, the centre, the bottom right and so on. A child set to **Fill** stretches to the whole cell instead.
- **Justify content** (*Start*, *Centre*, *Space between*) and **Align content** (*Start*, *Centre*) place the tracks when they don't add up to the frame's size, for example fixed-size tracks in a larger frame.
- A **stack** has no tracks: every child goes in one cell as big as the frame. There the picker is called **Stack position** and says where the children sit in the frame (in the picture, the pink tag sits in the bottom right of the stack); a child set to **Fill** covers the frame. Going back from Stack to Grid finds the tracks you had.

![A grid of 100px, 25%, 1fr and auto columns with the cell alignment picker at the centre, and a stack below it with its position at the bottom right.](help/grid-layout.png)

![Editing the columns, then moving the 3x3 picker: the tiles shift inside their cells. Then the stack's picker moves the badge around the photo.](help/grid-layout.mp4)

## Child sizing
Select a child of an auto-layout frame and its **Layout item** section says how it sits in the frame; it sits right under the first section of the Inspector. Only the settings that frame's kind of layout reads are shown (a stack has no margins, wrapping or aspect, for example). With several children selected (from the same frame), a change applies to all of them, and a field shows *Mixed* where they differ. Select layers from different kinds of layout and the section only tells you so.

![The Layout item section for the orange card: Fill width and fixed height, grow 2 from a zero basis. The dark button at the top right is pushed there by an auto margin.](help/layout-item.png)

![Ticking Auto margin: Left on the button pushes it to the end of the toolbar. Then changing Grow on a card changes how much of the free room it takes.](help/layout-item.mp4)

- **Position**: *In flow* (laid out with its siblings), *Absolute* (placed by **Inset** from the frame's edges, e.g. pinned to the bottom right; leave a side empty (*auto*) to leave that edge free, and set left and right, or top and bottom, to stretch a layer that isn't fixed size) or *Ignore* (keeps its own x/y and takes no room, and has no sizing fields).
- **Width** and **Height**:
  - *Fixed*: its own size.
  - *Hug*: fits its own contents (frames and text).
  - *Fill*: along a row or column, shares the frame's free space with the other fill children; across it, stretches; in a grid, fills its cell.
  - *Percent*: a share of the frame's inner size (of the cell, in a grid). Where the frame hugs that size, the frame is as big as everything else needs, and the percent layer then takes its share of that.
- **Grow** and **Basis** (row and column, on the axis the frame runs along, for a *Fill* layer): a fill layer starts from its basis (*Zero*, *Pixels*, *Percent* of the frame, or *Content*: as big as what is inside it), and the free space is shared on top of it by grow (default 1; 0 takes none). Layers that are over the line shrink in proportion to their basis. A wrapping line breaks at each fill layer's basis (zero when it has none), not at the size it was left with by the last layout.
- **Aspect** (width over height, like 1.78): when one side hugs and the other is known, the hugging side follows the ratio instead of its content. The field shows up once a ratio is set or exactly one side is *Hug* (in a grid: the height); *From size* takes the ratio from the layer's current size, and 0 clears it. **Derive** chooses between *Either side* and *Height only* (the width then keeps hugging). In a grid only the height is derived.
- **Wrap text** (text in a row or column): a text that hugs its width (Sizing set to *Auto width*; the section says so when it isn't) wraps at the room its frame offers, and then shrinks to its widest line.
- **Column**, **Row**, **Col span**, **Row span** (grid): which cell it starts in (1 is the first, negative counts back from the last, 0 takes the next free cell) and how many tracks it covers. Layers without a cell fill the free cells in order.
- **Margin** around it (top, right, bottom, left), in a row, column or grid, in px or a percent of the frame's inner width (see [Percent padding, margin and gap](#percent-padding-margin-and-gap)). In a row or column, **Auto margin** on a side makes that side take the free room of the line, split equally between the auto sides: it pushes a layer to the end or centres it, ahead of Justify. Across the line, auto on both sides centres the layer and on one side pushes it to the other edge.

These settings are not keyframed: they are part of the layout, not of an animation. Animate a layer's size or position with a timeline, or change the frame's layout from an action.

Layout is worked out again whenever something changes, in the editor and in the player, so repeated lists and text that changes length reflow by themselves.

## Animate changes
Turn on **Animate changes** in the frame's Auto layout section and, while the project plays (Preview and the published player), children glide to their new place instead of jumping. It covers layers shown or hidden, a solo or draw order switching, text changing length, a list gaining or losing items, the frame being resized, and direction, gap, padding or alignment being set by an action.

| Setting | Meaning |
|---|---|
| Duration | How long a glide takes, in milliseconds |
| Easing | A preset, or *Custom* to drag the curve's handles |
| Enter | How a layer looks as it appears (a layer shown, or a new list item): *None*, *Fade*, *Scale* (grows from nothing) or *Fade and scale* (from 80%) |
| Exit | How a layer looks as it goes (hidden, or a list item removed): it fades or shrinks where it was, then goes. Until it has gone it keeps its place in the layout, so the layers around it stay put and a frame that hugs its content keeps its size; then they glide together |

- A frame that hugs its content on an axis glides its own size along with its children when the content changes size (a layer shown or hidden, a list gaining or losing items).
- If a layer returns while it is still leaving, it fades back in from where it had got to and nothing moves. A layer that appears while another is still leaving waits until the layout is released. A solo swaps its layers at once with no hold.
- **Timelines win.** If a timeline or an *Animate property* action is moving a layer's x, y, width or height, the frame follows it exactly rather than gliding behind it, and a property a timeline has a track on is never glided.
- Text that sizes itself changes size at once (its position still glides), and layers set to *Ignore* are not moved by layout so they don't glide.
- The editor canvas always snaps, so you can design without things moving. Scrubbing a timeline snaps too.
- With **Respect reduced motion** on in Project settings, viewers who ask for less motion see everything snap.`,
  },
  {
    id: 'arrange',
    title: 'Align, arrange and combine',
    group: 'Design',
    summary: 'Align and distribute, layer order, and boolean shape operations.',
    keywords: 'align distribute center order front back boolean union subtract intersect exclude combine snap',
    body: `## Align and distribute
With several layers selected, the bar at the top of the inspector aligns their edges or centres, and distributes three or more evenly. With one layer selected it aligns to the parent.

## Snapping
Things snap while you drag. The **Snap** button on the tool bar opens the choices: **Grid**, **Artboard** (edges and centre), **Layers** (other layers' edges and centres), **Guides**, **Spacing** (equal gaps), **Pixels** and **Points**, and a **Snapping** switch for all of them. Lines in a colour for each kind show what snapped and a chip in the corner names it. Hold <kbd>Ctrl</kbd> to drag without snapping. See [The grid and snapping](grid). Rulers (<kbd>Shift</kbd>+<kbd>R</kbd>) show positions: drag **down** out of the top ruler for a horizontal guide and **right** out of the left ruler for a vertical one, and layers snap to it. Drag a guide back onto the ruler it came from to remove it.

## Order
<kbd>]</kbd> and <kbd>[</kbd> move a layer up and down; add <kbd>Ctrl</kbd> to go to the top or bottom. Or drag in the Layers panel.

## Boolean operations
Select two or more shapes and press **Union**, **Subtract**, **Intersect** or **Exclude** in the Inspector (the four buttons in the shape section), or right-click and choose **Combine shapes**. *Subtract* takes the other shapes away from the bottom-most one. The result is a single path; the originals are replaced.`,
  },
  {
    id: 'grid',
    title: 'The grid and snapping',
    group: 'Design',
    summary: 'The Snap menu (grid, artboard, layers, guides, spacing, pixels, points), the grid and its size, a grid of one artboard\'s own, and what snaps.',
    keywords: 'grid snap snapping size subdivisions cells pixels nudge align magnet guides override targets artboard layers spacing equal gaps points anchors distance menu master switch rulers',
    body: `The grid is a set of lines measured from each artboard's top left corner. **Show grid** draws it on the canvas, and **Snap to grid** makes things land on it. They are separate: snapping works whether or not the grid is showing.

## The Snap menu
The **Snap** button on the tool bar (the magnet) opens a menu that stays open while you tick several things. The same choices are in the canvas right-click menu (under **Snapping**) and in **Preferences**. They are yours, kept with your account.
- **Snapping** is the master switch. Switch it off and nothing snaps, but your ticks are kept for when you switch it back on. Ticking a target while it is off switches it on.
- **Grid**: land on the grid lines (this is Snap to grid: <kbd>Ctrl</kbd>+<kbd>'</kbd> ticks and unticks it). Off to begin with.
- **Artboard**: the artboard's edges and centre. Moving an artboard on the canvas, it goes to the other artboards' edges and centres.
- **Layers**: the edges and centres of other layers. By default it means the layers beside the one you drag (the same parent); tick **Layers: all, not just siblings** to reach every layer on the artboard.
- **Guides**: guides made from the rulers.
- **Spacing**: equal gaps. Drag a layer beside two that have a gap between them and it snaps to the same gap (or centres between them), and the distances show as orange measures. Moving layers only.
- **Pixels**: whole-pixel positions and sizes. Untick it to let a layer sit between pixels.
- **Points**: the anchor points of paths and the joints of bones. The pen, and dragging a path point, snap to them: a ring shows the one it caught. Off to begin with.
- **Snap distance**: how close (2 to 24 screen pixels, 6 to begin with) something has to be. It is in screen pixels, so zooming in makes it finer.

Artboard, Layers, Guides and Pixels are on to begin with, which is how snapping behaved before the menu. Show grid, Spacing and Points are off.

## What snapped
The nearest target inside the snap distance wins. A line in the target's colour runs across the artboard, and a chip in the corner says "Snapped to Layers" (or Artboard, Guides, Spacing, Points, Grid). The grid always has a line within half a cell, so it only takes over when nothing else is as close; if a layer's edge is as close as the grid line, the layer wins. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) while dragging to skip every target for that drag.

## The grid
- The **Show grid** button on the tool bar (beside Snap) draws it; <kbd>Shift</kbd>+<kbd>G</kbd> shows or hides it. Snapping to the grid works whether or not it is showing.
- Right-click an empty part of the canvas for **Show grid**, **Snapping** and **Grid size**, or open **Preferences**, which has a **Canvas** block with the same settings.
- While **Grid** is ticked a gold chip in the corner of the canvas says so with the size; click it to change the size or open the snapping choices.

## Size and stronger lines
**Grid size** is the width of one cell in pixels: pick 1, 2, 4, 5, 8, 10, 12, 16, 20, 24, 32, 48, 50 or 64, or choose **Custom…** for anything from 1 to 512. **Stronger line every** draws every Nth line heavier (4 by default; 1 draws them all alike). They are yours, kept with your account, and the size shows in the chip while snapping is on.

## A grid for one artboard
A 1920 wide slide and a 375 wide phone page want different grids. Right-click an artboard (its empty area) and open **Grid for this artboard** to give it its own size and stronger line, or **My default** to go back to yours. It is saved in the project, so people editing with you see it, and it is never exported.

## What snaps
Moving layers, resizing them, drawing new shapes (and artboards), moving artboards, placing pen points, dragging a path's points, and the arrow keys. A moved or resized layer's edges (a rotated layer's outer bounds) land on a grid line. The other targets work with it: if another layer's edge or centre or a ruler guide is as close as the grid line, or closer, that wins and shows its line. Hold <kbd>Ctrl</kbd> (<kbd>Cmd</kbd> on a Mac) while dragging to skip all snapping.

The arrow keys step to the next grid line in that direction (a layer that is off the grid goes to its nearest line first). <kbd>Shift</kbd> + arrow goes a stronger line at a time, or ten cells when stronger lines are off. <kbd>Ctrl</kbd> + arrow nudges by 1 px or 10 px as usual.

## What it doesn't do
The grid is never in **Preview**, in exports, in share links or in pictures of the artboard: it is only on the editor's canvas. Spacing only measures when moving layers (not resizing or drawing), and the arrow keys only use the grid and whole pixels.`,
  },
  {
    id: 'media-catalogue',
    title: 'The Media Catalogue',
    group: 'Design',
    summary: 'Put a photo from the suite\'s Media Catalogue on an artboard, and how it is saved and exported.',
    keywords: 'media catalogue photo photography gallery library insert picture image studydesk',
    icon: 'catalogue',
    body: `The **Media Catalogue** button, in the tool bar's **Media** group (open the group if it is folded) with the same icon as the catalogue button in StudyDesk's editor, opens the suite's photo library in a window over the editor. Search or browse, open a photo, and press **Insert**: the window closes and the photo is on the open artboard as an image layer, centred and scaled to fit (up to 600 px). Close the window without inserting with its **×**, <kbd>Esc</kbd> or the catalogue's own close button. If you open it with a picture layer that came from the catalogue selected, it opens where that photo was found.

## How it is stored
The picture is **linked, not copied**: the layer points at the photo's address in the catalogue. The Assets panel shows it like any picture. Saving, share links, review links, Preview and embeds keep the link, so they stay small and follow the catalogue. The same photo inserted twice is one asset.

## Exporting
Files that must work without a network fetch the picture when they are made and put it inside:
- **Download** the single-file page: the picture is embedded as data, and the address and where it was found in the catalogue are left out.
- **Download** the package (\`.ixp\`): the picture is stored under \`assets/\` with the others.

If the catalogue can't be reached or doesn't answer when one of these is made, a message lists which pictures and why. The file is still made, **without** those pictures (their layers show nothing) rather than with a link that might not work for whoever opens it. Fix the connection and export again. The JSON export keeps the links as they are.

Photos in the catalogue have their own terms of use. Check them before you publish a project that uses one, and credit them in [Attributions and references](attributions) where they ask for it.`,
  },
  {
    id: 'responsive',
    title: 'Responsive artboards',
    group: 'Design',
    summary: 'Variants of an artboard for narrow and wide pages: the player picks one by the width of its box and switches live, keeping what the viewer has done.',
    keywords: 'responsive variant variants mobile phone tablet desktop breakpoint width container media query narrow wide switch resize layout set page width slider adaptive',
    body: `A diagram that reads well at 900 px often needs another arrangement at 360 px. A **responsive set** is an artboard and its **variants**: whole artboards of their own, each shown from a **breakpoint** (a minimum width) up. The player measures the box it is in, shows the member that fits, and switches as the box is resized or the phone is turned. Nothing has to be wired: the set is the wiring.

## Quick start: a phone version
1. Select an artboard (click its name above it on the canvas) and open **Responsive** in the Inspector.
2. Click **Add narrow variant**. You get a copy, 360 px wide, to the right on the canvas. The original becomes the **base** and is shown from **600 px**; the copy is shown below that.
3. Rearrange the copy for a narrow page: move, resize and restyle its layers. Its timelines and interactions are its own copies too, so change them if the phone needs something different.
4. Click **Preview**. A **Page width** slider appears under the top bar, with the breakpoint marked. Drag it across 600 and the player switches artboard while it runs.

![The Responsive section, with a base artboard and its narrow variant.](help/responsive-section.png)

## How a set works
- Each member has a **from** width in the Responsive section. The player shows the member with the largest *from* that the box reaches, and the narrowest member when the box is narrower than all of them. *Narrow 0–599 px* and *Wide 600+ px* is the usual pair.
- In the **Layers** panel the variants sit under their base, each with the range it is shown at. On the canvas every member of a set has a pill for each of the others above it: click one to go and edit it.
- **Add narrower** and **Add wider** put a new member below the narrowest or above the widest. Change a breakpoint at any time. **Make standalone** takes an artboard out of the set; **Make a variant of…** puts a loose artboard into one. Deleting the base promotes its narrowest variant.
- Everything else treats the set as one artboard. **Go to artboard**, the start artboard, the completion artboard, remembered progress and learner results all name the base, and the player shows whichever member fits. They are listed once in the pickers, as *Name (responsive)*.
- The width that counts is the width of the box the player is in (the page, an iframe or the \`<interactives-player>\` element), not the screen. An artboard used as an [instance](instances) always shows the artboard it names, so use the base for the page and variants only as pieces.

## What carries when it switches
When the box crosses a breakpoint the viewer is not sent back to the start, and **On start** does not run again.
- **Variables** are the project's, so they just stay.
- **Timelines** are paired by name. Each one keeps its time, direction and whether it was playing, so a timeline mid-way keeps going. One that has no namesake starts as that artboard says.
- **Layers** are paired by name. What interactions did to a layer (a Set property, a script, an animation that was still running, how far it was dragged) goes to the layer with the same name. What a timeline drives is left to that artboard's own timeline, at the carried time.
- **Drag and drop**: cards stay in the zones they were dropped in, by name, and sit in the new artboard's zones.
- **Steps**: the step in view stays. **Keyboard focus** moves to the layer of the same name.
- **Questions** live in variables, so answers and scores stay.
- These do not carry: a flow that was part-way through a **Wait**, a layer's state inside an instance, and **Blends** (they start as the new artboard says).

Name the layers and timelines the same in every member, and the pairing is exact. The **Responsive** section lists what would not carry between each two members:

- a layer or timeline only one of them has,
- several layers sharing a name (they pair in order),
- a layer that is a different kind in the two,
- steps in only one, and a card or drop zone in only one.

## A worked example: score keeper
A page has a **Score** variable, a bar chart that grows on a timeline called **Intro**, and a panel that fades out when it is clicked.
1. On the *Chart* artboard, name the layers **Bars**, **Panel** and **Title**, and the timeline **Intro**. Click **Add narrow variant**.
2. On *Chart narrow* stack the bars vertically and make the title smaller. Keep the names. The **Intro** timeline came across with the copy; edit its keys if the bars move differently.
3. **Preview** and let **Intro** start playing, then click the panel so it fades. Drag the **Page width** slider below 600: the artboard changes to the vertical one while **Intro** carries on from the same moment, the panel is still faded and **Score** is unchanged. Drag back above 600 and the wide one returns, still in step.

## Tips
- Build the wide artboard first, then add the narrow one: the copy has all the layers, interactions and timelines, so the pairing is complete from the start.
- A change to the wide artboard's interactions is not copied to the narrow one. If both should behave alike, change both (the report tells you when layers have drifted apart).
- Only small things are lost on a switch, but a viewer part-way through dragging a card or typing in a field can notice it. Breakpoints between 600 and 900 px are the ones people cross by turning a tablet.
- The **Fit width** setting in Project settings suits a set: each artboard fills the width of the page and the page height follows the artboard that is showing.
- A host page can listen for the switch: \`player.on('variantchange', ({ from, to, set, width }) => ...)\`, or \`ix-variant\` on the \`<interactives-player>\` element. \`player.resize()\` makes the player re-measure its box if the page changes its size without the browser reporting it.`,
  },
  {
    id: 'page-master',
    title: 'Page masters',
    group: 'Design',
    summary: 'One artboard holds what every page shares (logo, accent bar, footer); pages draw it under their own layers. Change it once and every page follows.',
    keywords: 'master page template chrome logo footer header shared background brand repeat layers slide master text slot hide',
    body: `Pages in a deck repeat the same things: a logo, an accent bar, a footer line. Copying them onto every page makes every project bigger, and a change means editing every page. A **page master** is an artboard that holds those layers once. A page that uses it draws the master's layers under its own, in the same renderer (it is not an [instance](instances), so there is no nested player). Edit the master and every page changes at once, while you work and in the player.

## Quick start
1. Build an artboard with the shared layers: the logo, the bar, the footer. It does not need a background; the page keeps its own.
2. Right-click it in the Layers panel and choose **Make this a master** (or **Make this a master** in its **Page master** section).
3. Select a page, open **Page master** in the Inspector and pick the master. Or select the master and choose **Use as master for…**, or **Use for all other pages**.
4. To change the shared layers, click **Edit master** on any page. The master's own layers are read-only on a page: clicking where one is selects the page, not the master's layer.

## On a page
- **Master**: the artboard drawn under this page, or **None**.
- **Show these master layers on this page**: untick a layer to leave it off this page only (matched by the layer's name, at any depth). Name the layers clearly in the master.
- **Text slots**: put \`{pageTitle}\` (any name) in a text layer of the master and the page's **Text slots** list gets a field for it. What you type is what that page says. A slot with nothing typed shows the project variable of that name, if there is one. What you type can use \`{variable}\` itself.
- **Detach** copies the master's layers into the page as ordinary, editable layers and stops using the master.

## On the master
- **Draw over the pages**: tick the top-level layers that should sit over the pages' own layers (a corner fold, a footer bar). Everything else goes under.
- The list of pages that use it. A master that pages use can't be turned back into an ordinary artboard until they stop. Deleting a master takes it off its pages (Undo brings it back).
- A master can't have a master of its own, and a page that is a master can't use one.

## What a master layer is
- **Read-only and decorative.** Master layers are hidden from screen readers, are never tab stops, and the pointer goes through them to the page. A layer with a **Role** or an **Accessible name** (a logo with alt text) stays in the reading order. The master's layers come first (under) or last (over) in a page's reading order.
- **Shapes, paths, text, pictures, groups and frames only.** Buttons, inputs, links, video, embeds, instances, script layers and shaders are left out. A master has no interactions or timelines of its own that run on a page, so **On click** on a master layer does nothing: put interactive things on the page.
- **Bindings still work**, so a progress bar or a title bound to a variable is fine in a master.
- **Names and ids never clash.** The master's layers can't be targeted from a page's graph, timeline or script, and a page layer with the same name is never confused with one.
- **Responsive sets**: every member is an artboard of its own, so give each its own master of the right size. A master is drawn at its own coordinates.

## Everywhere else
Pictures (PNG, SVG, PDF, animated GIF), thumbnails, the single-file export, \`.ixp\` packages and the player all draw the master. A **Lottie** export flattens it into the animation. A library component that uses a master brings the master along (as an inner artboard). In a project made from a branded starter, the master's brand layers are locked like any other brand layer, and a page can't leave them off or drop its master.`,
  },
  {
    id: 'instances',
    title: 'Instances (components)',
    group: 'Design',
    summary: 'Place one artboard inside another, with its own timelines, interactions and inputs.',
    keywords: 'component nested artboard reuse symbol instance inputs',
    body: `Any artboard can be placed inside another as an **instance**: a live copy that runs its own timelines and interactions on the parent's clock. Edit the source artboard and every instance updates.

- Select the artboard you want to reuse and pick the artboard to put it in from **Use in** (it says **Instance in…**). Or choose an artboard in an instance layer's **Artboard** field.
- **Fit** decides how the artboard sits in the instance's box: **Stretch to the box**, **Contain**, **Cover** or **Actual size, centred**. **Reset size** puts the box back to the artboard's own size, and **Edit** followed by the artboard's name jumps to the source artboard.
- **Inputs** set the instance's own variable values (for example a different label or colour per copy) without changing the source. Write them as JSON, such as \`{"level": 3}\`.
- Messages sent inside an instance (**Send message**, \`ix.emit\`) bubble up to the parent.
- The parent can steer an instance while it plays. **Set instance input** (an action) sets one of the instance's variables by name: pick the instance layer, write the variable's name as it is in the instance's artboard, and give a value (an expression). **Fire instance trigger** sends a message into that instance only, so its *On message* nodes and scripts run, and the parent's own nodes do not hear it. Scripts do the same with \`ix.setInstanceInput('Badge', 'level', 3)\` and \`ix.fireInstanceTrigger('Badge', 'ping', payload)\`; both return \`false\` when no such instance is showing. A repeated instance answers in every copy.
- Read an instance's input back with \`instanceInput('Badge', 'level')\` in any expression (so *Set instance input* can flip a true/false input with \`!instanceInput('Badge', 'flag')\`) or \`ix.getInstanceInput('Badge', 'level')\` in a script. It gives the first copy's current value, and nothing when the instance is not showing.
- Inputs can be **animated**. Select the instance, pick *Input level* (any number or true/false variable of the project, and the inputs the layer already sets) in the Timeline's property list and press **+ Key**: a number tweens between keys inside the instance, a true/false or text input steps. Blends mix input tracks like any other number, and a [binding](bindings) can drive an input too. A value you set with *Set instance input* or a script stays until the track's next key changes it.

Instances can be nested up to six deep. An artboard that contains itself stops at that limit.

Components can also be shared between projects: see [Libraries](libraries).`,
  },
  {
    id: 'constraints',
    title: 'Constraints',
    group: 'Design',
    summary: 'Make a layer follow a path or copy another layer\'s position, rotation or scale.',
    keywords: 'constraint follow path motion path copy transform translation rotation scale attach',
    body: `Constraints keep a layer tied to another one while things move. Add one in the **Constraints** section of the inspector.

| Constraint | What it does |
|---|---|
| Follow path | Places the layer along a path. **Distance** (0–100%) is how far along; animate it to move along the path. **Orient** turns the layer to face along the path. |
| Copy position | Takes another layer's position (plus an offset). Untick **Copy x** or **Copy y** to take only one axis. |
| Copy rotation | Takes another layer's rotation. |
| Copy scale | Takes another layer's scale (untick **Copy x** or **Copy y** for one axis). |
| IK, Distance | Reach a target with a chain of bones, or keep a set distance from a layer. See [Bones and skinning](bones). |

The three copy constraints share some options. **Read** chooses *World values* (where the other layer ends up on the artboard) or *Local values* (its own position, rotation or scale inside its parent). **Factor** multiplies what is copied (0.5 follows half as far, -1 mirrors it). **Add to own** adds the copied value to the layer's own instead of replacing it (for scale it multiplies). **Limit** keeps the result within a range: *Min* and *Max* for x or rotation or horizontal scale, and *Min y* and *Max y* for the vertical ones.

Every constraint has a **Strength** (0–100%) that mixes between the layer's own value and the constrained one, and it can be animated. Constraints are applied in the player and on the canvas.`,
  },

  {
    id: 'bones',
    title: 'Bones and skinning',
    group: 'Motion',
    summary: 'Rig a character with bones, bend paths and images with them, and pose limbs with IK.',
    keywords: 'bone skeleton rig rigging skin skinning weights bind mesh deform ik inverse kinematics distance constraint character puppet example demo try tutorial arm',
    body: `A **bone** is a layer that only exists to be posed. Draw a chain of bones, **bind** paths and images to them, and the shapes bend where the bones turn. Bones are drawn on the canvas as blue glyphs while you edit; the player never shows them.

## Try bones in two minutes
Not sure where to start? Let the editor build a working rig, then take it apart.

1. With nothing selected, open the **Bones** section in the Inspector (the right panel) and click **Build an example to try**. (A selected bone has the same button.)
2. On the artboard you get a three-bone arm with a shape skinned to it, an **orange dot**, a **Wave** button and the instruction *Drag the orange dot*. The blue lines inside the arm are the bones; they show in the editor, never in the player. Click a bone in **Layers** (*Upper arm*, *Forearm*, *Hand*) to see it.
3. Click **Preview** (top right) and **drag the orange dot**. The arm bends to follow it: the dot is the target of an **IK** constraint on the *Hand* bone, three bones long. Drag it out of reach and the arm straightens toward it.
4. Press **Wave**. A timeline called *Example: wave* swings the bones by hand for two seconds, with the IK **Strength** keyed down to 0 so the keyed poses win. As the strength comes back to 1 the arm returns to the dot.
5. Close Preview, select the *Hand* bone and look at **Constraints**: *IK*, target *IK target (drag me)*, 3 bones. Try **Bend the other way**, or drop the bones to 2 to see the hand end swing free. Select *Arm* to see its **Skin**, and a point's weights in **Weights of**.

![The example arm bent toward the orange dot, with the Bones section of the Inspector open.](help/bones-example.png)

![Dragging the orange dot in Preview: the arm follows it. Then Wave swings the bones and hands the arm back to the dot.](help/bones-example.mp4)

The finished result is also on the **Templates** tab, under **Examples**, as **Bones and IK**: play it, or make your own copy.

The example is ordinary layers, bones, a timeline and two interaction nodes, so everything in it can be changed, copied or deleted. Press **Build an example to try** again for another copy.

## Drawing bones
Pick the **Bone** tool (<kbd>J</kbd>) and drag from a bone's base to its tip. To carry on a chain, start the next drag on the tip of the last bone: the new bone becomes its child, and turning a parent moves everything below it. A drag that starts anywhere else begins a new bone (inside the group you went into, if you double-clicked into one). Hold <kbd>Shift</kbd> to snap angles to 15°. The eye button in the toolbar (<kbd>Shift</kbd>+<kbd>J</kbd>) hides the glyphs.

With the Select tool, click a glyph to select the bone, drag its body or tip to turn it, and drag its round base to move it. A bone is posed like any layer: **X, Y**, **rotation**, **scale** and **length** (the *Len* field, which is the layer's width) can all be keyed on the [timeline](timelines), so turning a bone while recording makes a keyframe. Layers dropped inside a bone ride on it, which is the quickest rig of all: a hand shape inside the forearm bone needs no skinning.

## Skinning
Select a **path**, then in **Skin** pick the bones and press **Bind to bones** (or select the path and the bones together and press **Bind to selected bones**). Every point is given weights from its distance to the bones, up to 4 per point, so a point on a bone follows it and one between two bones blends them. The poses the bones are in when you bind become the **bind pose**: the shape looks exactly as drawn until a bone moves. Bind with the rig in its rest pose.

- A skinned path follows its bones, not its own position, so move the rig, not the path.
- **Weights of** shows one point's influences. Change a bone's weight (they are scaled to add up to 1), add or remove a bone, or press **Auto** to work the point out again. **Re-bind** works all of them out again from the current pose.
- Bezier handles are pulled along with their point.
- If the number of points changes after binding, points without weights keep their own position: re-bind.

An **image** can be skinned too. Binding makes a grid mesh over the picture (a few cells per 40 px) and weights its vertices the same way; the picture is drawn warped through that mesh. **Remove mesh** goes back to the plain picture.

## IK and distance
Add an **IK** constraint (see [Constraints](constraints)) to the bone at the *end* of a chain and pick a target layer: the chain turns so the end bone's tip reaches the target. **Chain bones** is how many bones turn, counting the end bone and its parents (1 points one bone at the target; 2 or 3 make a limb, like an arm reaching for a hand target). **Bend the other way** puts the elbow or knee on the other side. A target out of reach straightens the chain toward it. **Strength** mixes IK with the keyed pose, and can be animated, so a limb can swing from its animation onto a target.

A **Distance** constraint keeps a layer (or bone) a set distance from a target: exactly at it, no farther than it, or no nearer. Animate the distance to pull in or push out.

Constraints run first, then skinning, so a skinned shape follows bones that IK has moved.

## Importing
A Rive file's bones, skins (weights) and meshes, and its IK and distance constraints, come in as bones, skins and meshes. Rive's IK bend direction may come out mirrored: tick **Bend the other way** on the constraint if it does.

## Limits
Skinning is linear blend skinning: strong twists can pinch, so use more bones or weight points between them. There is no weight painting brush yet; set weights per point in the inspector. Meshes are regular grids made for you (an imported mesh keeps its own triangles).`,
  },

  // ---------------------------------------------------------------- web
  {
    id: 'web-elements',
    title: 'Web elements',
    group: 'Web elements',
    summary: 'Real buttons, inputs, links, embeds and video that work with keyboards and screen readers.',
    keywords: 'button input text field checkbox slider range select dropdown link embed iframe html video aria accessibility',
    body: `Web elements are real HTML controls, so they work with keyboards, screen readers and forms.

- **Button** (<kbd>B</kbd>): a label (which can use \`{expressions}\`), fill, stroke and corner radius. Use **On pointer → Click** to react. Tick **Fit text to box** to have the label's size chosen to fit the button (see [Text](text)). **Disabled** (also bindable, for a Next button that waits for an answer) greys it out and takes it out of the Tab sequence, and a disabled button or input looks dimmed by itself: **Disabled look** sets how opaque it is (0.5 by default, 1 for no dimming). A layer whose Opacity is bound keeps doing its own dimming.
- **Input**: text, number, email, password, multi-line, checkbox, slider (range) or dropdown (select). **Bind to a variable…** (under *Value*) ties the box to a variable with an ordinary [data binding](bindings) on its **Value**, set to **⇄ Both**: typing writes the variable and the variable fills the box. Change the way, or the variable, under **Data bindings**; choose **Out →** to only write the variable and keep the box's own value. (Older projects that had a *Variable* setting on an input are changed to this when they open.) **On variable change** then reacts to what was typed. **No browser help** (text boxes) turns off the spellcheck underline, autocorrect, automatic capitals and autofill, for a spelling test. **Block paste and drop** refuses pasted or dragged text, so the answer has to be typed. To do something when Enter is pressed in a text box, use an **On key** node set to \`Enter\` with **Also while typing in a text box** ticked (see [Interactions](interactions)).
- **Link**: text that opens a URL. **Fit text to box** works here too.
- **Embed**: an iframe from an \`https://\` URL, or your own HTML. The HTML runs in a sandboxed frame that can't reach the page it is on, so it can't read its cookies or call its code. In the editor an embed shows as a labelled box; open Preview to see it. Projects whose scripts don't run in the sandbox can switch on **Run embedded HTML in the page** in Project settings for HTML they wrote themselves.
- **Video**: a video file or URL.

## Accessibility
Every layer has an **Accessibility** section (roles, text alternative, keyboard reach, hiding decorative layers): see [Accessibility](accessibility). The **CSS class** is in the Advanced section. The [Accessibility checker](accessibility-checker) lists the layers that need a text alternative. The player honours the viewer's *reduce motion* setting when the project setting **Respect reduced motion** is on.`,
  },
  {
    id: 'accessibility',
    title: 'Accessibility: roles and keyboard',
    group: 'Web elements',
    summary: 'Make shapes usable by keyboard and screen reader: roles, text alternatives, tab stops, Tab order and Announce.',
    keywords: 'accessibility a11y aria role screen reader keyboard focus tab order enter space announce live region alt text decorative heading checkbox button wcag',
    body: `Buttons, inputs and links are real controls, so keyboards and screen readers already handle them. A **shape** (or text, image, group) with an *On pointer → Click* is different: a mouse can click it, but a keyboard or screen reader user can't reach it. The **Accessibility** section in the inspector closes that gap.

## The Accessibility section
- **Role**: what the layer is to a screen reader. *Button* and *Checkbox* make it a tab stop that Enter and Space click. *Heading* (with a level 1 to 6), *Image* and *Region* describe structure. *Decorative* hides the layer from screen readers and keyboards completely (backgrounds, flourishes).
- **Text alternative**: the name a screen reader says. For a picture, describe what it shows; for a clickable shape, say what it does ("Next question"). It can be bound or animated like other properties.
- **Description**: a longer explanation read after the name.
- **Say it like**: what [read aloud](read-aloud) says for the layer instead of its text, for an abbreviation, a formula or a name a voice gets wrong. It is not shown and screen readers ignore it.
- **Tab stop**: *Automatic* (a layer is reachable when it has an *On pointer → Click*, an *On focus*, or a button or checkbox role), *Always*, or *Never*. The line underneath says what you get.
- A **Checkbox** role needs its state told: bind **Checked (checkbox role)** in Data bindings to the variable that holds it (see [Bindings](bindings)).
- **Pressed state** and **Current**: see [Pressed and current](accessibility#pressed-and-current).
- **Shortcut**: a key that clicks the layer, see [Shortcuts](accessibility#shortcuts).
- Buttons, inputs and links show only the text alternative and description. They already have the right role and keyboard behaviour.

## What the keyboard does
- **Tab** and **Shift+Tab** move between tab stops, in layer order unless you set a tab order (below). A visible ring shows where the focus is (only for the keyboard, not after a mouse click). It is two tones, the theme's focus colour with a black or white halo either side of it, so it can be seen on any background.
- **Enter** clicks the focused layer, **Space** clicks it when released, the same way a real button does. It runs the layer's *On pointer → Click* nodes exactly like a mouse click, with the pointer position at the layer's centre.
- Only the layer itself is activated. A button or input inside a clickable frame does its own thing, so nothing runs twice.
- An Enter or Space that clicked a layer, or that was pressed on a button or link, does not also run an *On key* node for the same key, so a game's "press Space" and a button's click can't both fire from one press.
- A key an *On key* node handled does not also scroll the page, so a crossword or word search can use the arrows and Space without the course page moving behind it. Pick the grid in the node's **Only while this layer has focus** and the arrows (and, with an any-key node, Space and typing) belong to the activity only while the grid has focus; everywhere else the page scrolls as normal. Tab is never taken, so keyboard users can always leave. See [Interactions](interactions).
- Only *On pointer → Click* can be done from a keyboard. Hover, press, release and the older drag events can't, so give those layers a click alternative. Layers made [draggable](drag-and-drop) get a keyboard way (Space, arrows, Space) of their own.

## Pressed and current
A button that is on or off (a toggle, a segmented control, a filter chip) should say so. On a **Button** layer, or a layer with the *Button* role, set **Pressed state** to *Not pressed* or *Pressed* and a screen reader says "toggle button, pressed" (aria-pressed). Bind **Pressed (button, toggle)** in Data bindings to the variable that holds it, such as \`mode == "list"\`. *Not a toggle* says nothing.

**Current** marks the one layer of a set that is where you are: the open tab, the current page in a list, the step you are on. *Yes* is aria-current true, and *Current page*, *Current step* and *Current location* say which kind. It works on any layer, buttons and links included. Bind **Current (true, or page, step, location)** in Data bindings, for example \`tab == 2\`, or an expression that gives \`"page"\` for the current one and false for the rest. Use it instead of describing the state in the text alternative ("Showing now").

## Shortcuts
A layer's **Shortcut** is a key, or a key with modifiers (\`r\`, \`1\`, \`Ctrl+Enter\`, \`Alt+N\`, \`Shift+/\`), that clicks the layer from anywhere on the page: it runs the layer's *On pointer → Click* flows, presses a button or follows a link, the way Enter on the layer does. It follows the same rules as an *On key* node: keys typed into a text box are left alone (unless the shortcut holds Ctrl, Alt or Meta, so Ctrl+Enter can submit from a text area), holding a key does not repeat it, and an extra Ctrl, Alt or Meta means a browser shortcut, so it is ignored. A hidden or disabled layer ignores its shortcut, and while a modal [dialog](accessibility#dialogs) is open the layers behind it do too. A layer that repeats uses its first copy. Screen readers are told the key (aria-keyshortcuts); show it in the label too, such as "Replay (R)". The field warns when two layers use the same keys, or when an *On key* node listens for them as well. Shortcuts count as the key way to a clickable shape for the [Accessibility checker](accessibility-checker).

## Dialogs
Select a **frame** and tick **This frame is a dialog** in its *Dialog* section. The player then announces it as a dialog (role dialog, with aria-modal when **Modal**, and the frame's **Text alternative** as its name, so give it one). The dialog is **open while the frame is visible**, so show it however you like: bind its Visible to a variable, use a *Show / hide* node, or pick an **Open variable** and the frame shows while that variable is on (true, not 0, not empty).

When it opens, focus moves inside: to the **Initial focus** layer if you picked one, otherwise the first button, field or clickable layer in it, otherwise the dialog itself. While a **modal** dialog is open, Tab and Shift+Tab stay inside it, focus that slips behind it is brought back, and clicks on the rest of the artboard are ignored (tick **Close on click outside** to make them close it instead). **Escape** closes the dialog on top: it turns the Open variable off (false, 0 or empty) or, with no variable, hides the frame. When it closes, **Return focus** puts focus back on the layer that had it when the dialog opened. A dialog that is showing from the start does not take focus. A **Scrim** paints a colour over the rest of the artboard behind the dialog (it is drawn as a shadow, so it follows the frame and goes when the frame hides).

A dialog works inside an iframe or a page that embeds the player: the trap, Escape and focus use the player's own document. Keep the dialog at the top level of the artboard, not inside a clipping frame, so the scrim and the "outside" are the whole artboard. The [checker](accessibility-checker) flags a dialog with no name or nothing inside it a keyboard can reach.

## Keyboard navigation
A list of options is one Tab stop, not one per option. Select a **repeater**, or a group or frame whose layers are the options, and tick **Arrow keys move between the items** in *Keyboard navigation*. One item is the Tab stop (the one last focused), and the arrow keys, Home and End move focus between the rest, so a keyboard user Tabs past the whole list.

- **List**: Up and Down for a column (Left and Right for a repeater laid out as a row, or choose under **Arrows**). **Wrap round** goes from the last to the first.
- **Grid**: all four arrows move by row and column, using the repeater's columns (and its *Columns first* order), or the **Columns** you set on a container. Home and End go to the ends of the row, Ctrl+Home and Ctrl+End to the ends of the grid.
- **Radio buttons**: the radio-group pattern. All four arrows move and wrap, and **moving also selects**: the item it lands on is clicked, so the *On pointer → Click* flows that choose an option run. The group is a radio group and the items radio buttons for screen readers, with aria-checked following the focus, unless your items set their own **Checked** (bound to your selection variable), which then wins.

**Focused item** writes the focused item's number (from 0) to a number variable, and setting that variable moves the Tab stop, and the focus itself when it is inside the list at the time (so typing a letter that moves a cursor along a word moves the keyboard focus with it, and the next arrow goes on from there). To move focus into the list from outside (a clue button that picks a square), use *Focus layer* on the list: it lands on the Tab stop.

**Count hidden items** keeps every copy's number even when some are hidden (a square whose *Visible* is bound to false, a blank in a crossword), so item 12 stays item 12 and the index variable can be used straight as a position in your list. A hidden item is never focused, and in a grid the arrows step over it to the next shown item in the same row or column. Without it hidden copies are not counted, so the numbers shift. The number also arrives as \`event.index\` in *On focus*, *On pointer* and *On key* events for the items (as it already does for a repeater's copies). Keys typed into a text box and the arrows of a [draggable](drag-and-drop) item are left alone, and **an *On key* node you wired for an arrow wins**: the navigation does nothing for a key that one of your nodes names, so nothing fires twice.

## Tab order
With nothing selected, the **Tab order** section in the inspector lists every tab stop on the artboard in the order Tab visits them. Use the arrows to move a layer earlier or later, or click its name to select it. **Reset to layer order** goes back to the default. The order only applies within the player; stops you haven't placed follow the others in layer order.

## Announce
The **Announce** action says something to screen readers without showing anything: write the text as an expression, such as \`"Correct, " + score + " of 5"\`. *Polite* waits for the current speech to finish; *Assertive* interrupts, for errors and urgent feedback. Scripts do the same with \`ix.announce(text, 'polite' | 'assertive')\`. In **Preview**, a strip under the preview shows what would be said, once you switch **Screen reader** on (a button in the Preview header, or Preferences; it is off by default).

## Turning it off
**Preferences → Accessibility features** (also a button in Preview) switches all of the above off in Preview: no extra tab stops, no keyboard clicks, no roles, no announcements, as projects played before these features existed. It is on by default. The **Screen reader** strip under Preview, which shows what would be announced, is a separate preference (also a button in the Preview header) and is off by default. If something looks wrong, check it with the setting off; if it goes away, report it. Exported files and embedded players keep the features on. A page embedding the player can pass \`accessibility: false\` (or \`accessibility="off"\` on the web component) to turn them off.

## What it doesn't do
Reading order is the layer order (rearrange layers to change it). Moving focus after a button changes the artboard isn't automatic; use *Focus layer* to put it somewhere sensible. Colour contrast, missing descriptions and other problems are for an accessibility checker, not these settings.`,
  },
  {
    id: 'links-cursors',
    title: 'Links and cursors',
    group: 'Web elements',
    summary: 'Make any layer a link, and choose the cursor shown when hovering it.',
    keywords: 'hyperlink url href target new tab cursor pointer hand custom cursor image hotspot go to page link button drag arrow route map navigate',
    body: `## Link
In the **Link** section, give any layer a **URL** and it becomes a real link. **Open in** chooses where: a new tab, the same frame, the parent frame, or the whole page (useful when the interactive is embedded in an iframe). URLs can contain \`{expressions}\`. Links go to \`http(s)\`, \`mailto\`, \`tel\` or relative addresses; anything else (such as \`javascript:\`) is ignored.

The **Open URL** action does the same from an interaction.

## Go to a page
The **Go to page** section links a layer to another page. Choose the page from the list, or drag the round **Go to page** handle that sits on the selected layer on the canvas onto the page you want: the page lights up as you pass over it, and letting go makes the link. Choosing **No page** (or dragging it onto the empty canvas) takes the link away. There is nothing special behind it: the editor writes an **On pointer** click on the layer and a **Go to artboard** node after it, which you can see and change in **Interactions**, and the list follows if you edit them there. A click that has an **Only if**, or one that does something else first, is left as you built it (the link is added after the existing click). Faint arrows between the pages on the canvas show every route the project can take, from these links and from Next and Previous steps; switch them off from the canvas's right-click menu. They are only in the editor.

## Cursor
**Cursor on hover** sets the cursor shown while the pointer is over the layer and its children, the way CSS \`:hover { cursor: pointer }\` works. *Automatic* gives links and layers with a click, press or release interaction a pointer. Choose the cursor shown over the layer (pointer, grab, crosshair, text, not-allowed, …) or **Custom image** with a hotspot (the point of the image that clicks). Change it at runtime with **Set cursor** or \`ix.setCursor('grab')\`.`,
  },

  {
    id: 'page-navigation',
    title: 'Page navigation',
    group: 'Interactivity',
    summary: 'Back, Next, the page number, page dots and a progress bar along the bottom of your pages, in one click.',
    keywords: 'next back previous page number progress bar dots navigation buttons pages 3 of 8 bottom bar go to next artboard generate',
    body: `Every piece with more than one page needs **Next** and **Back**, and often "Page 3 of 8". Select a page and open **Page navigation** in the properties panel (or select several pages and open it there), pick a style and press **Add to this page**, **Add to these pages** or **Add to all pages**.

- **Back and Next**: Back on the left, Next (the main button) on the right and *Page 3 of 8* between them.
- **Next only**: just a Next button on the right.
- **Back, Next and page dots**: a row of dots between them, the current page filled.
- **Back, Next and a progress bar**: the page number, with a thin bar along the bottom that fills as you go.
- **Page number only**: *Page 3 of 8* and no buttons.

It all goes along the bottom of the page, in a bottom bar. Back is hidden on the first page and Next on the last, and the number and bar follow the order of your pages (see **Go to artboard** in [Interactions](interactions)), so adding, removing or moving a page needs no rewiring. The colours come from your project's colours, so they follow the theme and a branded project's look, and on a branded page the bar sits inside the content box, clear of the logo and footer.

Nothing is hidden: you get ordinary buttons, text, a progress bar and the clicks and **Go to artboard** nodes in **Interactions**, all of which you can restyle, move or rewire. They are tagged, so adding navigation again with another style swaps the old one for the new (and **Remove** takes it away). A page that already has its own Next or Back button is left alone, and the message says which. Page dots are drawn for the number of pages there are now: press **Add** again after adding or removing pages to refresh them.

Buttons go on the page itself. A [page master](page-master) can hold the logo and the footer but not buttons, so the master is not where this goes.`,
  },
  // ---------------------------------------------------------------- motion
  {
    id: 'timelines',
    title: 'Timelines and keyframes',
    group: 'Motion',
    summary: 'Animate properties with keyframes, record mode, looping and playback.',
    keywords: 'animation animate keyframe key record playhead loop ping pong autoplay speed duration track copy paste snap stagger offset',
    body: `Each artboard can have any number of timelines. A timeline has **tracks**; each track animates one property of one layer through **keyframes**.

For the common cases there is no need to build one: [Animation presets](animation-presets) (Fade in, Slide in, Pop, Pulse, Shake, Fade out) write a timeline and its trigger for you.

## Adding keyframes
- Press **Record** (the red dot). A red bar at the top of the Inspector says **Recording keyframes at …**. While recording, every change you make to an animatable property at the playhead becomes a keyframe. Press it again to stop.
- Or click the diamond next to a field in the inspector to key the value it shows at the playhead (between two keys, that's the in-between value). With several layers selected it keys all of them. The diamond is filled when there's already a key at the playhead, and clicking it then updates that key.
- Once a property has keys on the open timeline, changing it in the inspector or on the canvas changes its key at the playhead (or adds one there), with or without Record, since the value you see is the timeline's. To change a layer's own value, the one it has before the timeline plays, switch to **Design view (no timeline)**.
- On a timeline set to **Whole frames**, a key goes on the start of the frame the playhead is in.
- Or select a layer, choose a property in the dropdown at the top left of the Timeline and press **+ Key**.
- Drag keys to retime them, <kbd>Shift</kbd>-click to select several, <kbd>Delete</kbd> to remove. The diamond on a layer's own row moves all of that layer's keys at that time. See [Copy, snap and stagger keys](timelines#copy-snap-and-stagger-keys) for the rest.

## Copy, snap and stagger keys
**Copy and paste.** Select keys (on one track or several, with <kbd>Shift</kbd>-click or by pressing a layer's own diamond), press <kbd>Ctrl</kbd>+<kbd>C</kbd>, move the playhead and press <kbd>Ctrl</kbd>+<kbd>V</kbd>. The first copied key lands on the playhead and the others keep their spacing, values and easing. <kbd>Ctrl</kbd>+<kbd>X</kbd> copies and removes them. The pasted keys end up selected, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd> takes the whole paste back. Where they go:
- By default back onto the tracks they came from.
- Select a different layer on the canvas (when the keys came from one layer) and they go onto the same properties of that layer, with a new track where it has none. Properties that only mean something on the layer they came from (draw order, solo child, shape points, shader uniforms) are left out, and the message says so.
- Select the keys of one other track (when you copied from one track) and they go onto that track. The two properties must hold the same kind of value (a number onto a number, a colour onto a colour); otherwise nothing is pasted.
- A pasted key replaces any key already at that time on the track. Keys that would land past the end of the timeline are left out.

Pressing <kbd>Ctrl</kbd>+<kbd>C</kbd> copies keys while your last click was in the timeline, and layers otherwise.

**Snapping.** While you drag keys they pull onto the playhead (where it was when you grabbed the key) and onto markers when they come within a few pixels, and the keys you are dragging keep their spacing. Away from both they follow the 10 ms grid (100 ms with <kbd>Shift</kbd>). Hold <kbd>Alt</kbd> to drag without the pull.

**Stagger.** Select two or more layers that have keys on the timeline and press **Stagger…** in the Timeline bar. Enter a step in milliseconds: the first layer stays where it is, the next one's keys move later by the step, the next by twice the step, and so on. The order is the Layers panel's, top to bottom; layers with no keys on the timeline are skipped. A negative step runs the other way. Run it again and the offsets add up. If any key would leave the timeline, nothing moves and the message says how long to make it. It is one undo step.

## Timeline settings
The Timeline bar shows a short summary (length, loop, speed, autoplay, frame rate). Click the **gear** beside it to change them, and to rename the timeline; Esc or a click outside closes it.

| Setting | Meaning |
|---|---|
| Length | Duration in milliseconds |
| **Play once** / **Loop** / **Ping-pong** | What happens at the end |
| Autoplay | Start when the artboard is shown |
| Speed | Playback rate (2 is twice as fast). To play backwards use a **Control timeline** node set to **Play in reverse** |
| Frame rate | Frames per second the animation was made at (1 to 240); 0 leaves it free |
| Whole frames | Shown once a frame rate is set. Values are read at the start of the frame, so they step from frame to frame instead of gliding. Playback time, markers, sound and captions still use the real time. Applies in the player, blends and the canvas. Imported animations that snap to frames (for example 24 fps hand-drawn motion) come in with it on |

![The Timeline bar with its settings open: name, length, loop, autoplay, speed and frame rate.](help/timeline-settings.png)

A timeline can also carry **sound** (a voice-over that follows the playhead, with a waveform) and **captions** (timed text with a transcript for viewers). See [Narration, captions and transcript](captions).

The line between two keys is a **tween**: it shows its [easing](easing) as a little curve. Click it to choose how the value moves from the first key to the second (or *Use for all tweens*). In the Tween panel, drag the two handles on the graph to make your own curve; the dashed lines mark the start (0) and end (1) values, and the graph grows to show overshoot. Select a key to change its time or value.

## Markers
A **marker** is a named point in time. Press **+ Marker** to add one at the playhead; it shows as a flag on the ruler and is called *Marker 1*, *Marker 2* and so on until you rename it. **Click** a marker to select it: it turns yellow, a dashed line runs down through the tracks, and a **Marker** panel appears at the right of the timeline with its name, its time, and (when [Steps](steps) use the timeline) its title and caption. Drag it to move it, press the <kbd>←</kbd> and <kbd>→</kbd> arrow keys to nudge it (10 ms, 100 ms with Shift, or one frame when the timeline has a frame rate), and press <kbd>Delete</kbd> to remove it. Right-click a marker for the same things as a menu, and right-click the ruler to add a marker there.

To **do something when playback reaches a marker**, select it and press **+ When the playhead reaches this…**. That adds an **On timeline marker** node for the marker and a **Set variable** node after it, and opens the Interactions tab on the Set variable node: pick the variable and the value there. The Marker panel says how many interactions already use the marker and has an **Open** link to them. If you rename the marker the nodes follow it. An **On timeline marker** node runs its flow whenever playback passes the marker: going forwards or in reverse, and on every lap of a loop or ping-pong. Leave *Marker name* empty to react to every marker on the timeline; \`event.marker\` and \`event.time\` say which one fired. Scrubbing and seeking do not fire markers, only playing.

![The timeline bar and tracks. The flag on the ruler is a marker.](help/timeline-markers.png)

## Design view and timeline view
There are two ways to look at an artboard.

- **Design view**: the canvas shows the layers as they really are, with no animation applied. This is where you place and style things. Opening an artboard starts here, and the Timeline tab says **Design view: the canvas shows the layers as they are. Choose a timeline to see and edit its animation.**
- **Timeline view**: choose a timeline from the dropdown at the top left of the Timeline tab and the canvas shows that timeline at the playhead. Drag the playhead to see any frame, and with **Record** on, changes become keyframes.

Choose **Design view (no timeline)** in the same dropdown to go back. Record turns itself off when you do.

## Switching children and draw order
Two properties are not numbers. **Solo: active child** on a [solo group](groups-frames) switches which child shows, and **Draw order (children)** changes which child is in front. Both step at their keys instead of blending. Key them from the group's Solo and Draw order sections in the inspector.

## Playing from interactions
**Control timeline** plays, restarts, pauses, stops, reverses, toggles or jumps to a time in a timeline. Give *Play*, *Restart* or *Reverse* a **Blend in** time (ms) to fade the timeline's pose in over the pose the layers have now instead of cutting to it: numbers and colours mix, anything else switches once the new pose weighs more. That is how to switch between looks (idle to wave) smoothly. Blend-in is off with reduced motion. For what the look being left does meanwhile, the easing of the blend and cutting in on one, see [Transitions between looks](timelines#transitions-between-looks). From scripts: \`ix.timeline('Intro').play()\`. **On timeline end** fires when one finishes, and **On timeline marker** fires at each [marker](timelines#markers).

## Transitions between looks
A transition is a **Blend in** on the node that starts the next look (**Control timeline**, or **Play blend** for a [blend](blends)). These settings shape it:

| Setting | What it does |
|---|---|
| Blend in (ms) | How long the new look takes to take over. 0 cuts straight to it |
| Blend easing | The curve of the take-over. Linear is an even cross-fade; *Ease in* starts slowly, *Ease out* starts fast, or draw a bezier curve |
| Blend out of | The timelines and blends being replaced, by name: \`"Idle"\` or \`["Idle", "Walk"]\`. They **keep running** under the blend-in, so a walk cycle does not freeze mid-step while the wave fades in, and stop when it is done. With no blend-in time they stop at once. Leave it empty to leave things as they are (pause the old timeline yourself) |
| Freeze while blending out | The ones being replaced stand still where they are instead of running on |
| Can be left early | Another change is allowed to cut in before this blend-in has finished |

A blend works as a look too: a timeline can blend into a blend, a blend into a timeline, or a blend into another blend. Into a blend, its whole pose fades in (numbers and colours mix; anything else switches once the new pose weighs more).

Two more nodes make a state machine out of these:

- **Wait for blend-in** holds the flow while a timeline or blend is still blending in, so a change does not cut it short. It lets the flow through at once if the blend-in is marked *Can be left early* or nothing is blending in. With **Give up instead of waiting** the change is dropped instead, like a button press that is ignored during a transition.
- **Wait for time in timeline** holds the flow until a timeline has played to a time in milliseconds or a percentage of its length (an exit time: leave the idle only after it has played half through). It carries on at once if the timeline is already past that time.

Put **Wait for time in timeline** after a condition to leave "no sooner than" a point in the animation, and **Wait for blend-in** just before a change of look that should not interrupt the last one. **Random** (in the [interaction graph](interactions)) picks the next look.`,
  },
  {
    id: 'animation-presets',
    title: 'Animation presets',
    group: 'Motion',
    summary: 'Fade in, Slide in, Pop, Pulse, Shake and Fade out on any layer, with one click.',
    keywords: 'animate animation preset fade in slide in pop pulse shake fade out entrance appear intro attention wiggle bounce click page opens delay reduced motion',
    body: `Select a layer and open **Animate** in the Properties panel (or right-click the layer and choose **Animate**). Pick a preset and the layer is animated.

## The presets
- **Fade in**: starts clear and fades up to how the layer is now.
- **Slide in**: glides in from the left, right, top or bottom while it fades up. It travels a fifth of the page (never less than 60 or more than 400 pixels).
- **Pop**: springs up from half size with a little overshoot.
- **Pulse**: swells by about a tenth and settles back, to catch the eye.
- **Shake**: swings side to side and settles, for "not quite".
- **Fade out**: fades away. The layer stays on the page, just clear.

Every preset ends with the layer as it was (Fade out ends clear), so you can still design the layer as normal.

## When it plays
**When** picks what starts it: **The page opens**, or **This layer is clicked**. **Delay** waits before it starts and **Length** changes how long it takes (0 uses the preset's own). Your choices are remembered, and the right-click menu uses them too. An entrance preset that starts on a click replays the entrance when the layer is clicked.

## What it writes
Nothing is hidden. A preset writes:
- a [timeline](timelines) named for the layer, such as **Title: fade in**, with ordinary keyframes you can move, ease or add to;
- an **On start** (or **On pointer**, click) event in [Interactions](interactions), joined to a **Control timeline** node set to **Restart**.

Choosing the same preset on the same layer again replaces both rather than stacking another. Different presets on one layer each get their own timeline, and you can change what they do by editing the keyframes or rewiring the nodes.

## Auto layout and repeated layers
Auto layout (and a repeater) decides where a layer sits, so it would put a sliding layer straight back. On such a layer **Slide in** grows the layer in from a little smaller as it fades, and **Shake** rocks it a few degrees instead of moving it sideways. The message under the presets says when that happened.

## For people who prefer less motion
The timelines are marked **Skip for less motion** (in the timeline's settings). For someone whose device asks for less motion they jump straight to the last pose instead of playing, so a Fade in just shows the layer and a Fade out hides it. This works however the timeline is started, and does not need the project's **Respect reduced motion** setting.

Text can also be animated letter by letter: see [Text modifiers](text-modifiers).`,
  },
  {
    id: 'shape-morphing',
    title: 'Shape morphing and the Bend tool',
    group: 'Motion',
    summary: 'Bend edges into curves, key the points of a path and morph one shape into another.',
    keywords: 'morph morphing vertex vertices points path shape keyframe bend curve warp handle tween blob',
    body: `Every point of a path, and the two handles on it, can be animated. Moving points over time makes a shape **morph**: a circle that squashes, a blob that wobbles, a mouth that opens.

## Bend an edge
1. Pick the **Bend** tool (<kbd>W</kbd>).
2. Move over an edge: the pointer becomes the **bend cursor** (an arrow with a bowed line) when a press there would bend it, and stays a plain arrow when it wouldn't. Press on the edge and drag. The edge turns into a curve that follows the pointer; a straight edge becomes curved by moving the handles of the two points at its ends.
3. Hold <kbd>Alt</kbd> to bend one side only: just the handle at the nearer end moves and the far end stays as it is.

On a rectangle, ellipse, polygon or star the tool first asks to **convert it to a path** (its outline needs points to bend). Its place, fill, stroke and keys stay; its corner radius, sides or inner ratio are replaced by the points, and its width and height no longer stretch the outline. You can also convert from the inspector (*Convert to path*).

## Morph a shape
1. Select the path layer and open the **Timeline** tab (make or pick a timeline).
2. Put the playhead where the morph starts (usually 0) and press **◆ Key shape** in the path's inspector section. Every point, and the handles it has, gets a key.
3. Move the playhead to where the shape should end up and turn on **Record**.
4. Edit the shape: drag points and handles in point-edit mode (double-click the path, or <kbd>Enter</kbd>), or drag edges with the Bend tool. Each point you change is keyed at the playhead; the points you leave alone stay where they were.
5. Play it, or scrub: the shape blends between the two poses. Click the line between two keys to change the [easing](easing).

Without Record, point edits change the layer's own shape and add no keys (where a point is keyed, the canvas shows its keys, not the layer's own shape, so edit keyed shapes while recording). **◆ Key shape** at a later time keys the shape as the canvas shows it there, which is a quick way to hold a pose.

## In the timeline
A path layer's shape keys are grouped by point: **Shape: point 3** holds that point's X and Y and the in and out handle numbers. Click a point's name to fold or open it (layers with many points start folded). The diamonds on a point's row stand for all its keys at that time: drag them to retime a point, select them and press <kbd>Delete</kbd>. Open the point to select single keys, edit a key's value, or click the line between two keys to change its easing. The **×** on a point's row removes its keys; **Clear shape keys** in the inspector removes every shape key of the layer from the open timeline.

## Adding and removing points
Point numbers are shared by all the keys of a path, so the editor keeps them in step:
- **Add a point** by double-clicking the outline while editing points. The point sits on the curve and the outline does not change. In every timeline that keys the path, the new point gets a key at each of the path's key times, placed on the curve of that frame (and its two neighbours' handles are adjusted to match), so existing morphs keep their shape. Later points are renumbered.
- **Delete a point** (select it, press <kbd>Delete</kbd>): its keys go and later points are renumbered in every timeline. In each frame the neighbours join directly, so the outline loses that corner.
- A handle that did not exist before (a corner you bend into a curve) is keyed as zero at the path's earlier key times, so earlier poses stay straight. A point's X and Y keyed for the first time at a later time hold that value before it, like any other property.

## Good to know
- Keys hold point positions in the layer's own coordinates. A path with shape keys keeps its box and points as they are when you leave point-edit mode, and resizing the layer scales its own shape but not its keys; resize before you key.
- Morphs look best when the two poses have the same points in the same order. Add points to the simpler pose first, then key.
- Turning a point between curve and corner (<kbd>Alt</kbd>-click) while recording keys that point's handle numbers at the playhead.
- Imported Rive animations with moving vertices use the same keys, so you can edit them here.`,
  },
  {
    id: 'easing',
    title: 'Easing',
    group: 'Motion',
    summary: 'How a value moves between two keyframes.',
    keywords: 'ease interpolation curve bezier linear step elastic bounce back cubic',
    body: `| Easing | Feels like |
|---|---|
| linear | Constant speed |
| step | Jumps at the next key (no in-between) |
| easeIn | Starts slow, ends fast |
| easeOut | Starts fast, settles gently |
| easeInOut | Slow at both ends |
| backIn / backOut | Pulls back before, or overshoots after |
| elasticOut | Springs past and wobbles into place |
| bounceOut | Bounces at the end |
| Custom bezier | Your own curve: drag the two handles |

The same names work in **Animate property** nodes and in \`node.animate(prop, value, { ease: 'easeOut' })\`.

## Choosing and drawing an easing
On a timeline, click the line between two keyframes (a *tween*). The **Tween** box shows the curve. Pick a name from **Ease**, or drag the two round handles on the graph to draw your own: the dashed lines mark the start (0) and the end (1) values, and the graph grows to show overshoot. **Use for all tweens** gives every tween in the timeline the same easing.

![The Tween box: a curve with two draggable handles, the Ease menu and Use for all tweens.](help/easing-editor.png)`,
  },
  {
    id: 'joysticks',
    title: 'Joysticks',
    group: 'Motion',
    summary: 'Scrub one or two timelines from numbers, for dials, eyes that follow the pointer and blends.',
    keywords: 'joystick blend scrub drive timeline progress follow pointer dial gauge',
    body: `A **joystick** connects numbers to timeline positions. Instead of playing over time, the timeline sits at the position the numbers say.

Add one in the **Joysticks** section of the artboard (select the artboard).

- **X timeline** and **Y timeline**: one or two timelines to drive (Y is optional).
- **X value** and **Y value**: [expressions](expressions) from 0 to 1, for example \`pointer.x / artboard.width\` or a variable \`volume\`.

- **Handle**: a layer (a knob or stick) that something else moves, for example a drag. Where its origin sits inside the **Area** (a rectangle in artboard pixels, shown when a handle is chosen) is \`handle.x\` and \`handle.y\`, from 0 at the left and top to 1 at the right and bottom. Use them in the value expressions: \`handle.x\` for X and \`handle.y\` for Y give a stick that scrubs two timelines, and \`1 - handle.x\` turns an axis round. Without a handle both are 0.5.

Examples: a dial that turns with a variable, a character whose eyes follow the pointer (a left-right timeline and an up-down timeline), or a gauge that fills with a score. \`pointer\` (\`{x, y}\` on the artboard) and \`artboard\` (\`{width, height}\`) are in scope.`,
  },

  {
    id: 'blends',
    title: 'Blends',
    group: 'Motion',
    summary: 'Mix several timelines at once, weighted by numbers: idle, walk and run by speed, or a lean on top of a loop.',
    keywords: 'blend mix weight 1d direct additive layer timelines locomotion speed rive blend state input',
    body: `A **blend** plays several [timelines](timelines) together and mixes their poses. How much each one counts comes from number [variables](variables), so a single number can turn *idle* into *walk* into *run*.

Add one in the **Blends** section of the artboard (select the artboard), then start it with a **Play blend** node (or tick *Start with the artboard*). **Stop blend** ends it.

![The Blends section with the example blend: Mode, Input, Start with the artboard and two timelines.](help/blends-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected (the inspector shows the artboard's settings).
2. Open the **Blends** section and click **Build an example to try**. On the artboard you get a ball and, under it, a slider with the caption **Drag me: blend weight** (with *0 = small and red* and *1 = big and blue* at its ends and the live value of *mix* below it). Behind them are two timelines (*Example: small and red* and *Example: big and blue*), a variable called *mix* that the slider is bound to, and a blend that starts with the artboard.
3. Click **Preview** (the button at the top right of the editor). The artboard opens in the Preview window: the slider is the horizontal bar under the ball. Drag its knob from the left end to the right end. At 0 the ball is small and red, at 1 it is big and blue, and in between it is a mix of the two. (In the Preview window's left panel, **Variables (live)** also has a *mix* box you can type a number into.)
4. Open either example timeline to see that each one is just a pose: the same values at the start and the end.

![Preview of the example: changing mix from 0 to 1 turns the small red ball into the big blue one.](help/blends-mix.mp4)

## Make your own, step by step
1. **Make the poses.** Create one timeline per pose (say *Idle*, *Walk*, *Run*) and key the layers in each. A pose can be still (the same keys at the start and end) or a loop that moves.
2. **Make the number.** In the **Variables** tab add a *number* variable, say *speed*. Anything can change it: a slider (an **Input field** with type *Range* bound to the variable), a **Set variable** node, a [joystick](joysticks), or a script.
3. **Add the blend.** Select the artboard, open **Blends** and click **+**. Leave the mode on **1D**, set **Input** to *speed*, and add your timelines with **+ timeline**. Give each one the value of *speed* where it should count fully, e.g. *Idle* 0, *Walk* 1, *Run* 2.
4. **Start it.** Tick **Start with the artboard**, or add a **Play blend** node to a flow in the Interactions tab.
5. **Preview** and change the number.

Use **Direct** when each pose should have its own weight (e.g. a *smile* and a *frown* amount from two sliders), and **Additive** to layer a small motion (a lean, a breath) on top of whatever is already playing.

## Modes
| Mode | How the weights work |
|---|---|
| **1D** | One *Input* variable is a position. Each timeline sits at a *value* along it. The two timelines either side of the input are mixed in proportion; below the first or above the last, that end timeline counts fully. |
| **Direct** | Each timeline has its own weight: a variable (from 0 up to *Full weight at*, so use 100 for percentages) or a fixed weight from 0 to 1. Weighted timelines are averaged. If the weights add up to less than 1 the rest is whatever the layer already had; if they add up to more than 1 they are scaled down. |
| **Additive** | Each timeline adds its *change from its first frame*, times its weight, on top of the layer's current value. Stopping the blend takes the change back out. |

## What gets mixed
- Numbers (position, size, rotation, opacity ...) and colours are blended.
- Everything else (visible, text, draw order, solo child) takes the value of the heaviest timeline that animates it, as long as the weights covering it add up to at least 0.5. Additive blends leave these alone.
- Only the properties the blend's timelines animate are touched, and only where the weights say something.

## How it plays
While a blend is on, each of its timelines plays on a playhead of the blend's own, following the timeline's loop setting. The same timeline can also play normally. Every frame the order is: normal timelines, [joysticks](joysticks), blends (in the order listed), then Animate property tweens. A blend therefore wins over a normal timeline animating the same property, except that Additive blends add to what the timeline wrote. *Play blend* does nothing if the blend is already on; *Stop blend* leaves the mixed pose where it is (Additive blends excepted).

## Imported blend states
Importing a Rive file turns its 1D and direct blend states into blends. Entering the state plays the blend; leaving stops it. Direct blend inputs run 0 to 100 as in Rive.`,
  },

  // ---------------------------------------------------------------- interactivity
  {
    id: 'steps',
    title: 'Steps',
    group: 'Motion',
    summary: 'Turn a timeline\'s markers into the steps of an explainer: Next plays to the next marker, Back plays back, a step bar does the clicking.',
    keywords: 'steps step through explainer next back story walkthrough slideshow tutorial marker caption dots progress scroll scrub scrollytelling stepper wizard',
    body: `**Steps** turn a [timeline's](timelines) markers into the steps of a "watch, then click Next" explainer. You animate the whole story on one timeline and put a marker at the end of each part. Next plays to the next marker and stops there, Back plays back to the one before, and a **step bar** (Back, Next, a dot for every step, "Step 3 of 7", the title and caption) does the clicking. Add or move a marker and the steps follow; nothing is wired by hand.

![The Steps section of the artboard, with the example explainer's four steps.](help/steps-section.png)

## Quick start: try the example
1. Click an empty part of the canvas so the **artboard** is selected.
2. Open **Steps** and click **Build an example to try**. You get a ball, a timeline with four markers (each with a title and a caption), Steps turned on, and a step bar along the bottom.
3. Click **Preview** and press **Next**. The ball grows, rolls across and turns green, one marker at a time. **Back** plays it in reverse. Click a dot to jump straight to a step. The Left and Right arrow keys work too.

## Make your own
1. Build the whole story on **one timeline**: key the layers as they should look at the end of each part.
2. Put a **marker** at the end of each part (**+ Marker** in the timeline bar, at the playhead). A marker at 0 is step 1; the editor adds one for you when you turn Steps on.
3. Click a marker on the ruler: with Steps on its **Title** and **Caption** appear beside the timeline. The title is the marker's name when left empty. A marker you untick **Is a step** stays out of the steps.
4. Select the artboard and open **Steps**. Pick the timeline (or press **Steps** in the timeline bar) to turn them on.
5. Click **Add a step bar**. It is made once as ordinary layers and nodes: restyle it, move it, delete the parts you do not want, or add another. Nothing needs updating when the markers change.

## What Next, Back and the dots do
- **Next** and **Back** play the timeline to the neighbouring marker, at the timeline's speed, and stop exactly on it. Press Next while a step is still playing and it finishes that step and goes on. Press Back and it turns round from where it has got to.
- A dot, **Go to step** with a number, **First step** and **Last step** show that step straight away (one step along plays). With reduced motion on, every move is straight away.
- The **step in view** changes as the move starts, so the caption is always the one for what is playing.
- The timeline does not autoplay: the steps own it. Do not also play it with a node.

## What jumping does with changes your interactions made
A jump shows the timeline's pose at that step. But the learner may have clicked something that changed a layer the timeline never animates, and the timeline cannot undo that. **Back and jumps** in the Steps section decides:

| Setting | Back and jumps |
|---|---|
| **Pose only** (default) | Only the timeline's pose is shown. Layers and values that interactions changed stay as they are |
| **Reset, then pose** | Every layer first goes back to how you authored it (running Animate property tweens stop, other timelines keep their pose), then the pose is shown |

**Next never resets**: it just plays on, so what the learner did in this step is still there in the next. **Variables are never reset** by either setting: use an **On step** node to set them for each step ("when step 3 is chosen, set *answered* to false").

## Step variables and the step list
Turning Steps on creates four variables the player keeps up to date: **step** (the number, from 1), **stepCount**, **stepTitle** and **stepCaption**. Use them in text (\`Step {step} of {stepCount}\`) and [bindings](bindings) (\`step >= stepCount\` for a Next button's *Button disabled*). Tick **Remember** on the step variable to bring a learner back to the step they left on.

Expressions also see \`steps\`, a list with one entry per step: \`step\`, \`title\`, \`caption\`, \`current\` and \`done\`. The step bar's dots are a [repeater](repeaters) over \`steps\`, so there is one dot per marker. A variable or data source of your own called \`steps\` wins.

## Events, nodes and scripts
- **On step** runs when a step is chosen, or (**When**) when its animation has finished. Give a step number to run for that step only. \`event.step\`, \`event.count\`, \`event.title\`, \`event.caption\`, \`event.from\` and \`event.direction\` (1 forward, -1 back) are in scope.
- **Go to step** is the action: next, previous, first, last, or a step number. In a repeated dot use \`event.index + 1\`.
- Scripts have \`ix.steps\`: \`step\`, \`count\`, \`title\`, \`caption\`, \`moving\`, \`next()\`, \`back()\`, \`first()\`, \`last()\` and \`goTo(n)\`.
- In [Results and progress](results), **Complete when** can be **A step-through artboard reaches its last step**.

## Accessibility
- Every step change says "Step 3 of 7: title. caption" through the same live region as the [Announce](accessibility) node (turn it off with **Announce each step**). The first step is not announced.
- Back and Next are real buttons. The dots are focusable (Tab, then Enter or Space), named "Go to step 3: title".
- **Arrow keys step** (on by default): Left and Right go back and forward while focus is inside the player, or when the player is alone in its frame. They are left alone in text fields.

## Scroll to scrub
Pick a frame under **Scroll to scrub** and scrolling it moves the timeline: the top of the scroll is step 1, the bottom is the last step, with the same stretch of scrolling for each step, and the nearest step is the one in view. Next and Back scroll the frame. The frame needs scrolling content taller than itself (a frame's **Scroll** setting, and children that reach past its bottom): **Add a scroll column** makes one, ready to use. Put the story's layers outside it so they stay still while the column scrolls, and put your own words in the column.

## Good to know
- Each artboard has its own steps. A marker's title and caption live on the marker, so editing them in the timeline changes the step bar at once.
- A timeline with no markers has no steps, and then plays as a normal timeline.
- **Turn off Steps** (the bin in the section header) keeps the timeline, markers, variables and step bar.`,
  },
  {
    id: 'captions',
    title: 'Narration, captions and transcript',
    group: 'Motion',
    summary: 'Put a voice-over on a timeline, caption it by pasting a transcript, and let viewers turn captions on, change their size and jump around with the transcript.',
    keywords: 'captions subtitles narration voice over voiceover audio sound transcript srt vtt webvtt waveform speech read aloud closed captions cc accessibility music volume fade deaf hearing',
    body: `A [timeline](timelines) can carry **sound** and **captions**. The sound plays while the timeline plays and stays with it: pause the timeline and it pauses, jump the playhead and it jumps, change the speed and it follows. The captions are timed text that the player draws over the page, with buttons so each viewer can switch them off, make them bigger, or open a **transcript** that jumps the timeline to any line.

## Worked example: narrate a short explanation
![The timeline with a narration clip and its waveform, and four captions under it.](help/narration-timeline.png)

1. Open the **Timeline** tab and pick or make a timeline. In the **Sound** row choose **+ Add sound…** and pick an audio file (**Upload audio…** adds a new one to the project). It appears as a clip with its waveform, starting at the playhead, and the timeline grows to hold it.
2. In the **Captions** row choose **Paste a transcript…**. Paste what the voice says, leave **Timing** on **Across the narration** and press **Make captions**. Each sentence becomes a caption, long ones are split at a comma, and the time is shared out in proportion to the words.
3. Play the timeline (the sound plays in the editor too). Where a caption comes in early or late, drag the caption's edges in the lane, or select it and press **Start = playhead** or **End = playhead** at the right moment.
4. Press **Preview**. The captions show over the page, the **CC**, **A−**, **A+**, **Transcript**, **Sound** and **Pause** buttons sit in the top corner, and pressing a line in the transcript jumps to it.
5. Run the [accessibility check](accessibility-checker). If the narration has no captions, or they cover little of it, it says so.

## Sound
- **Moving and trimming.** Drag a clip to start it later or earlier. Drag its left edge to skip the start of the file, its right edge to stop it sooner. The fields beside the timeline give exact milliseconds.
- **Volume.** The clip has a level, and **volume keys** that multiply it over time: double-click the clip to add one, drag it up and down for the level and sideways for the time. **Fade out** adds two keys for you.
- **Role.** **Narration** (the default) is speech and needs captions. **Music** and **Sound effect** do not. Muting a clip (the **M** button) keeps it in step but silent.
- **It follows the timeline.** The sound plays when the timeline plays forwards inside the clip. It is silent when the timeline is paused, reversed or outside the clip, and it follows the timeline's speed (between a quarter and four times). When a timeline blends in, its sound comes in with it. A timeline that never started stays silent.
- **Speed and pitch.** At another speed a clip keeps its pitch (it is time-stretched, like a browser's own audio player does it), so a voice at 1.25x sounds quicker, not higher. Untick **Keep pitch at other speeds** in the clip's settings for the record-player effect instead: faster is higher, slower is lower.
- **Play sound, with options.** The **Play sound** node has a **Volume** (0 to 1), a **Speed** (0.25 to 4, 1 is as recorded) and a **Loop**. Each one takes a plain value or an expression, so a variable can drive them (a speed slider, a "looping" toggle). **Keep the pitch when the speed changes** is on by default, so a slowed clip stays at its own pitch where the browser allows it. **Stop other sounds first** is for comparing two clips: only one is heard at a time. Leave all of these alone and the node plays the sound once at full volume, as it always did.
- **Which sound.** Pick it in **Sound**, or fill **Sound from expression** to work it out while the project runs: a list item's sound field (an asset's name or id), say, so one button and one node can play any clip in a repeater. When the expression is filled it wins, and an empty answer plays nothing.
- **Stopped, and what is playing.** **Play sound** and **Play recording** have a **Stopped** output. Wire it and **When it finishes** only continues when the sound really ends; if a **Stop sound** node (or another sound with **Stop other sounds first**) cuts it short, the flow goes out of **Stopped** instead. With the next node set to run straight away, or a loop, **Stopped** still fires later when it is stopped. Leave it unwired and nothing changes from before. In formulas, \`soundPlaying()\` is true while any Play sound sound is going (\`soundPlaying("Ding")\` for one asset by name), and \`soundsPlaying\` lists their names, so one button can read "Stop" while its sound plays. Scripts have \`ix.soundPlaying()\` and \`ix.soundsPlaying()\`.
- **Stopping a loop.** A looping sound plays until a **Stop sound** node ends it (all of them, or just one sound), or until the viewer leaves the page, pauses the project or the tab goes to the background. A loop never finishes, so the next node runs straight away. **Stop sound** also cuts a sound that is still playing once. It does not touch timeline audio, which follows its timeline.
- **Media keys don't touch it.** Sound plays through the browser's Web Audio, not an audio player of its own, so the keyboard's play/pause key, headphone buttons and the system's media controls don't stop it behind the project's back. Only the project (its timelines and **Play sound**) decides what sounds.
- **When the browser says no.** Browsers will not start sound until the viewer has clicked, tapped or pressed a key. Then the player shows **Sound is waiting. Press to start it**, and any click or key press on the page starts it too. That includes a **Play sound** that runs before anyone has clicked (from **On start** or a timer): it waits and plays at that first press. If several are waiting, only the latest plays, so a run of hover sounds doesn't all go off at once. Put a **Start** button in front of an autoplaying narration if the first seconds matter.

## Captions
- **Typing, pasting, importing.** Double-click empty space in a caption lane for a new caption, or use the **Captions** menu: **New caption at the playhead**, **Paste a transcript…**, **Import WebVTT or SRT…**, **Export WebVTT**, **Export SRT** and **Add a language…**.
- **Pasting.** Cut by sentence, line or paragraph. Time them **across the narration** (or the whole timeline), **one per marker** (a [marker](timelines) at the start of each new caption), or **at reading speed**. A transcript with times at the start of its lines ("0:12 Welcome", "[01:05] Next") keeps them.
- **Each caption** has its words, an optional **speaker** (shown as "Dr Lee: …"), and a start and end. **Split at playhead** and **Merge with next** reshape them.
- **Languages.** Add a track per language. With more than one the viewer gets a language menu; the transcript follows.
- **Video layers** take captions too: select the layer and use **Captions** in its settings. They show through the video's own caption display and follow the viewer's CC button.
- **Describing the picture.** Captions say what is heard. For what is only in the picture, see [Describe what you see](describe-what-you-see).

## What viewers see
Captions are on to start (unless you turn **Captions on to start** off in Project settings) and the viewer's choices (on or off, size, language, sound) are remembered in their browser. The **Captions and narration** section of the Project settings sets the look: the caption box's position, size, colours and font, or **A text layer of my own** (the player fills a text variable, and **Add a caption layer** makes the layer), and whether the buttons show. If you hide them, the **Captions and sound** [node](interaction-nodes) does the same jobs from your own buttons.

## Transcript and screen readers
The transcript is a labelled region of buttons, one per caption, with its time, the speaker and the words; the one showing is marked current. It is the way for a screen reader user to read what is said, so the caption box itself is hidden from screen readers (they would otherwise talk over the narration). Escape closes the transcript and returns focus to its button. Every viewer button works from the keyboard. When the timeline or a video layer has [descriptions](describe-what-you-see), the transcript lists them among the captions and is called **Transcript with descriptions**.

## Draft voice
Tick **Read aloud (draft voice)** on a caption track and the player reads each caption aloud with a voice installed on the viewer's computer, as a stand-in until the real recording is made. It uses only voices that run on the device: a voice that sends the words to an internet service is never used, and a device with no suitable voice says nothing. Browsers cannot save speech as a file, so this cannot make a recording for you; record the narration and add it as sound.

## With Steps
A [Steps](steps) timeline can carry sound and captions too: Next plays the narration to the next marker and it stops there. The step's own caption (on the marker) stays a separate thing in the step bar.

## Good to know
- Sound and captions belong to a timeline, so they stop with the artboard. An artboard shown inside another (an instance) brings its own.
- Exported files and share links carry the audio inside them, so a long recording makes a larger file.
- The timeline length is not changed by captions; adding a sound makes the timeline at least as long as the sound.`,
  },
  {
    id: 'describe-what-you-see',
    title: 'Describe what you see',
    group: 'Motion',
    summary: 'Add short descriptions of what is on screen to a timeline or a video, read by the viewer\'s own voice in the gaps, and listed with the captions in one transcript.',
    keywords: 'audio description described video describe picture blind low vision screen reader transcript with descriptions wcag 1.2.5 ducking voice narration accessibility visual',
    body: `Captions say what is **heard**. Many videos and animations also carry information only in the **picture**: a graph that rises, a diagram that builds, a gesture, text on a slide. People who cannot see it miss that part. A **description track** is short timed sentences saying what is on screen when it matters.

**This is a cheaper aid, not a recorded described version.** The words are read by a voice already on the viewer's device, so it sounds like a screen reader, not a person. Where a course is formally required to have an audio described version, record one and use this as well, or instead mark the accessibility finding reviewed. The transcript with descriptions below always works, with or without a voice.

## How it works for the viewer
- The description cues are never drawn. When the viewer has **Descriptions** on, a voice on their device reads each one as the timeline (or the video) reaches it, in the gap where you put it, and the sound is **turned down** while it speaks, then back up.
- The **Descriptions** button sits with the caption buttons. It only shows when a voice on the device can read one, and it starts **off** unless you tick **Descriptions on to start** in Project settings (Captions and narration). The viewer's own choice is remembered in their browser.
- Pausing, jumping to another point or turning descriptions off stops the voice. A description is read once as the media reaches it; jump back and it is read again.
- If a description is still being read when the next one comes up, it is not cut off: the next waits (a few at most).
- Only voices that run on the device are used. A voice that sends the words to an internet service is never used, and nothing is recorded.
- The viewer's sound button also mutes the voice, and the read-aloud speed they chose applies.

## Worked example: describe a lecture clip
1. Caption the clip first (see [Narration, captions and transcript](captions)) so you can see where the speech is and where it is not.
2. On a **timeline**: in the **Descriptions** row choose **New description at the playhead**, then type one sentence in **Text**. For a **video layer**: select it and use **Add one** under **Descriptions (what is on screen)** in its settings, then set **From**, **To** and the text.
3. Put each one in a **gap** between speech. A description that overlaps a caption is drawn with a dashed amber edge in the lane (and flagged in the layer's settings) because the voice would talk over the speaker.
4. Press **Preview**, turn **Descriptions** on and play it. Listen on a phone too: a synthetic voice over the speaker is the thing to check.
5. Open the **Transcript with descriptions** and read it start to finish. If it makes sense without the picture, the descriptions are doing their job.

## Describing well
- Say what a person who could see would **need** to follow, not everything. Do not repeat what the narration already says.
- Present tense, plain words: "A line graph appears. Hours of study are on the side and weeks along the bottom. The line climbs steadily."
- Read out text that appears on screen and matters (a title, a formula, a label).
- Name people the way the speech does. Do not add opinions ("a beautiful chart").
- Fit the gap: about two or three words a second, so ten words need roughly four seconds. The voice speeds up a little to fit and never above a clear pace.
- Describe a diagram once, in the order you would explain it. For a long or dense one, also put the full description in the page's text.

## Timelines and video layers
- **Timelines.** The **Descriptions** row sits under **Captions**. It works like captions: lanes of cues you drag and retime, one track per language, **Import WebVTT or SRT…**, **Export WebVTT**, **Export SRT** and **Add a language…**. The viewer's caption language picks the descriptions in that language when there is one.
- **Video layers.** In the layer's settings, **Descriptions (what is on screen)**: add, retime, import or export a WebVTT file made for this video, and set the **Language** (it picks the voice). Times are seconds from the start of the video. The video is turned down while a description is read, and put back to the level the viewer had.
- A second cue track is a second thing to keep in step. When you replace a video or re-time a timeline, check the descriptions again.

## Transcript with descriptions
With descriptions on the page the viewer's **Transcript** button opens **Transcript with descriptions**: the captions and the descriptions in one list in time order (a description comes first when it starts with the words), each line a button that jumps there. Each description line says **Description** in its text, so a screen reader or a braille display tells it apart, and a tick box hides the descriptions to read just what was said. It works when there is no voice, and it is ordinary page text, so it can be searched. A video layer with descriptions gets its own group in the transcript with its captions and descriptions together.

## Your own buttons
If you hide the viewer buttons in Project settings, the **Captions and sound** [node](interaction-nodes) has **Descriptions: flip**, **on** and **off**.

## Not done yet
Reading **while the video waits** (it pauses itself for a description that does not fit a gap) is not built. For now keep descriptions short enough to fit the gaps, or leave a longer pause in the video.

## Good to know
- The [accessibility check](accessibility-checker) asks you to look at a video without captions and points here for the pictures (WCAG 1.2.5). It cannot tell whether a description is accurate.
- Exported files and share links carry the descriptions inside them.
- The **Described video** starter in the Templates tab has a video layer with the track wired up and a one-page checklist on describing well.`,
  },
  {
    id: 'read-aloud',
    title: 'Read it to me',
    group: 'Interactivity',
    summary: 'Let learners hear any text, question or feedback with a voice on their own device: a Listen button, a Read aloud node, a project setting and a speed choice.',
    keywords: 'read aloud listen speak speech voice text to speech tts narrator dyslexia low vision say it like pronunciation speed rate 0.75 1.25 1.5 voiceAvailable ix.speech accessibility',
    body: `**Read it to me** lets a learner hear what is on the page. The words are spoken by a voice already installed on **their own device**: nothing is recorded, saved as a file or sent anywhere, and nothing needs permission. It helps learners with dyslexia, low vision, a second language or a tired pair of eyes, and it is never the only way to get at something (images still need a text alternative).

## Three ways to use it
- **Project setting.** In Project settings open **Read aloud** and tick **Offer read-aloud**. Every artboard gets one **Listen** button, a pause and a speed choice in the same corner. It reads the text layers that show, in layer order. Set **Language** (such as *en* or *fr-CA*) so only a voice for that language is used.
- **A Listen button layer.** Press **Add a Listen button to this artboard** in the same section. It is an ordinary button with two nodes behind it (one reads the artboard, one stops it), and a line that shows when the device has no voice. Restyle and move it as you like.
- **The Read aloud node.** In the Interactions tab, **Read aloud** says a text expression, a question and its options, the feedback after a check, or the whole artboard. The same node can **stop**, **pause**, **carry on**, say the **last thing again**, and make the learner's speed **slower** or **faster**. **Continue when it finishes** holds the next node until the words are said. **With no voice** set to *Announce the same words to screen readers* sends the words to the live region when the device has no voice for the language, so nobody misses feedback; **Only speak when** takes a condition (a "spoken prompts" variable, say) and while it is false the voice stays quiet and the words are announced instead if that choice is on.

## What the learner gets
**Listen** starts it, the same button pauses and carries on, and a speed menu offers 0.75, 1, 1.25 and 1.5. The speed is remembered in their browser with their caption and sound choices. Reading never starts by itself: iOS only lets the first words start from a tap, and a voice starting uninvited clashes with a screen reader. Speech stops when the learner moves to another artboard.

## With no voice
Only voices that run on the device are used (a browser's network voices are skipped), and only for the right language. When there is none, the Listen button is left out and a short line says why. In your own graph, bind a layer's **Visible** to **voiceAvailable** to hide anything that needs it, and always keep the text readable on its own. Test on the devices your learners use: some Linux and managed computers have no voice.

## Words a voice gets wrong
Select a layer and fill **Say it like** in the Accessibility section: the voice says that instead of the layer's text. Write the sounds ("pie one", "the Ma-too-eye people"), spell out a formula, or leave out a decoration. A group with **Say it like** is read as a whole, not twice. For a question, **Say the prompt like** and **Spoken explanation** do the same (see [Questions](question-kit)).

## Expression names
- **voiceAvailable**: true when a voice on this device can read the project's language.
- **speaking**: true while a voice is reading.
- **readRate**: the learner's speed.
A variable with the same name wins.

## Scripts
A script can call **ix.speech.say(text, {lang, rate})** (it answers true when it was said to the end), **stop**, **pause**, **resume**, **repeat**, and read **available**, **speaking**, **paused**, **rate**, with **setRate**. It works in sandboxed scripts too.

## Good to know
- Maths, drug names, abbreviations and mixed-language text read badly: use **Say it like**.
- A screen reader user already has a reader, and two voices at once is worse than one. The Listen button is a plain button they can skip, and it is not the route to offer them.
- The first words must start from a click or tap, so put a Read aloud node behind a button or key, not a timer.
- The **Audio-first quiz** starter (Templates, Built-in, Quizzes and questions) is a whole quiz built on this: it reads each question and its options, the keys 1 to 4 answer, R repeats, S slows, H gives a hint and Space pauses, and the score page speaks the score and offers the missed questions again. With no voice it is an ordinary keyboard quiz.`,
  },
  {
    id: 'interactions',
    title: 'Interactions',
    group: 'Interactivity',
    summary: 'The node graph: events start a flow, actions do things, logic chooses the way.',
    keywords: 'interaction graph node event action logic state machine wire edge connect flow group frame label organise comment box tidy clean up auto layout arrange align crossing behaviour recipe when clicked hovered show hide next page sound counter switch sentences read explain condition picker only if turn off remove',
    body: `Open the **Interactions** tab. Each artboard has its own graph.

**Room for the graph.** The bottom panel is a short strip, so opening **Interactions** (from a layer's **+ On click**, one of its interaction chips, or the tab itself) lifts the panel to a comfortable height, and puts it back when you move to another tab. It only does that when the panel is still at its normal height: one you sized yourself is left alone. Drag the top edge of the panel while the graph is open and that height is remembered for next time (in this browser).

**See-through layers don't take clicks.** While the project plays, a layer that is partly see-through (its opacity under 100%, or a shape whose fill and stroke are all under 100%, say from a tween on *fill.opacity*) lets the pointer through to whatever is underneath: its link, hand cursor, clicks and hovers are off, for it and every layer inside it, until it is fully showing again (a fade-in finishes, for example). Hidden layers never take the pointer. To keep a faded layer clickable, tick **Clickable while see-through** in its **Interactions** section. Paths, polygons and stars also only take the pointer where they're painted, not across their whole box.

![The Interactions section of a layer whose opacity is 50%: the note says it can't be clicked while playing until it is fully showing, and the Clickable while see-through tick overrides that.](help/see-through-toggle.png)

- **Events** (green) start a flow: a click, a key, a timer, a variable changing, a timeline ending, a message from the host page, scrolling, data loading, the artboard starting, or the activity loading.
- **Actions** (blue) do something and continue: **Control timeline**, **Play blend**, **Wait** (milliseconds, or an expression such as \`pace <= 4 ? 4000 : 8000\`, worked out when the wait starts), **Wait for blend-in**, **Wait for time in timeline**, **Set variable**, **Reset variables**, **Set property**, **Animate property**, **Show / hide**, **Go to artboard**, **Open URL**, **Play sound**, **Control video**, **Run script**, **Send message**, **Wait** and more.
- **Logic** (purple) chooses where to go: **If** (a **true** and a **false** output), **Toggle** (alternates between **a** and **b**), **Once**, **Sequence** (runs **1**, then **2**, then **3**) and **Random** (continues down one of up to six outputs, picked at random; *Weights* is a list that sets each output's chance, [1, 3] making the second three times as likely, and *Only if* is a list of conditions, so an output whose condition is false is never picked).

![The Interactions tab: the node palette, the graph and the settings of the selected node.](help/interactions-panel.png)

**On pointer** reacts to a click, double click, press, release, hover start and end, the pointer **moving over** a layer, and **dragging** it: *Drag starts* (once the pointer has moved a few pixels with the button held), *Dragging* (on every move after that, even outside the layer) and *Drag ends*. Moves and drags give \`event.x\` and \`event.y\` (artboard coordinates) and \`event.stepX\`, \`event.stepY\` (movement since the last event); drags also give \`event.dx\` and \`event.dy\` (movement since the press), so *Set property* with \`x\` and an expression like \`start + event.dx\` moves a layer with the pointer. Drags also give \`event.index\`, the [repeated](repeaters) copy the pointer is over right now (\`null\` over anything else), and \`event.startIndex\`, the copy it was pressed on, so a word-search grid or a board of cells can tell which cell the learner has reached without any maths on positions.

**Which layer inside was hit.** With a layer picked, *On pointer*, *On key* and *On focus* also give \`event.child\`, the name of the layer's own child (the direct child, however deep the hit) that the event landed in, and \`event.childIndex\`, that child's place in the layer from 0 (they are \`null\` and \`-1\` when it landed on the layer itself). For a [repeater](repeaters) the children are its copies, so \`event.childIndex\` is the copy. Put one *On pointer* on the group that holds a row of hotspots, dots or cards and use \`event.child\` or \`event.childIndex\` in the flow, instead of one event and one chain of nodes for each. Adding an item is then duplicating a layer. Tick **Only when a child is hit** to leave out clicks that land on the group's own background.

**On key** reacts to a key going down or up anywhere on the page (the page itself, not only the artboard). Leave **Key** empty for any key, or write a name such as \`ArrowLeft\`, \`Enter\`, \`a\` or \`Space\`. Tick **Shift held**, **Ctrl held**, **Alt held** or **Meta held** to ask for a chord; they must all be down. A key held down fires once, unless **Fire again while held** is ticked. \`event.key\`, \`event.code\` and \`event.shift\`, \`event.ctrl\`, \`event.alt\`, \`event.meta\` say what was pressed. Pick a layer in **Only while this layer has focus** to hear the key only while that layer, or a layer inside it, has keyboard focus (the layer becomes a tab stop, and you can use the [Focus layer node](interaction-nodes) to move the focus there); leave it empty to react wherever the focus is. Keys typed into a text box or text area are left alone, so typing never sets a flow off. To run something when the learner presses **Enter in a box** (an answer box that checks, a search that runs), set **Key** to \`Enter\`, pick the box (or the frame around it) in **Only while this layer has focus**, and tick **Also while typing in a text box**. A key that runs a flow is not also used by the browser: an arrow key, <kbd>Space</kbd>, Page Up and Down, Home, End, Enter, Backspace or a letter that an *On key* node handled does not also scroll the page, so a game or a grid can use them. Tab, Escape, the function keys and anything held with Ctrl, Alt or Meta are never taken, and an *On key* with no key and no layer picked (it hears everything) takes nothing. Tick **Let the browser act too** on a node that should leave the key to the page as well.

**Before activity loads** and **On activity load** run once each time the activity is opened, unlike **On start**, which runs every time an artboard is shown. *Before activity loads* runs first, before anything is on screen, and the activity waits for everything it sets off to finish (up to 10 seconds) before it shows: the place for a **Load user data** or a **Set variable** that the first frame should already have. *On activity load* runs once the activity is showing, just before the first *On start*. Both fire on the artboard the activity opens on, so put them in that artboard's graph. **Start over** doesn't run them again.

**On focus** reacts to a layer gaining or losing keyboard focus, which is what tabbing, clicking or the **Focus layer** action does. A layer with an *On focus* node becomes a tab stop; buttons, inputs and links already are, and so is any layer with a click or a button role (see [Accessibility](accessibility)). **Focus layer** gives a layer focus, or clears whatever has it (for example on <kbd>Escape</kbd>). It draws any change that has not been drawn yet first, so a layer an earlier node has just shown can take the focus straight away without a **Wait** in front of it. A layer that is still hidden or disabled is tried again for a few frames, then left alone.

**Only if.** Every event node has an **Only if** field. Leave it empty and the event always runs its flow. Write an expression and the flow runs only when it is true: \`running\` on a timer, \`event.value >= 0\` on a variable change, \`selected >= 0\` on a key. \`event\` is in scope, so it can look at what fired. The condition is on the node, with a short \`if …\` under its name, so the graph reads without a guard **If** after every event. A key whose condition is false is not taken from the browser either, so the page still scrolls.

**On timer.** *Every (ms)* is an expression read again every time round, so a pace can follow a variable (\`1500 - level * 100\`). **Only while** is a condition: while it is false the timer does not fire and its time does not count, and when it turns true the wait starts over, so \`running\` makes a timer you can stop and start. Tick **Steady** for a clock or a beat: each fire is planned from the start, so a slow moment is made up for and the timer does not drift. \`event.count\` is how many times it has fired and \`event.elapsed\` how many milliseconds it has been running. The editor's canvas does not run timers; Preview does.

**Countdown / clock** keeps time for you. Pick a number variable, then **Start** it counting **down** from a number of seconds, or **up** (to a limit, or without end when the limit is 0). It writes the variable about four times a second, as whole seconds by default, so a text layer showing \`{left}\` is a countdown. **Pause** holds it, **Resume** carries on, **Reset** puts the variable back and stops it. When a countdown reaches 0 (or a clock its limit) the **Time up** output continues. Leaving the artboard holds the clock still where it was; a new **Start** or **Resume** takes it up again. There is one clock for each variable.

**Go to artboard** goes to the artboard you pick, or to **Next artboard** or **Previous artboard**, or **Back** to where the learner came from (their own path, however they got there), or to the artboard an **expression** names (a name or an id). Next and previous follow the artboards in the project's order, in the artboard's [group](artboards) when it is in one (an artboard in no group counts every page), leaving out the narrow and wide versions of a [responsive set](responsive) and a library component's own copy. Duplicating or reordering a page keeps the links right, with no neighbours to rewire. When there is nowhere to go (the last page, the first, nothing to go back to, a name that matches nothing) the flow continues from the **No artboard** output, so a Next button can do something else on the last page. In an expression, \`pageNumber\` is the page's place from 1 and \`pageCount\` how many pages there are, for a footer like \`Page {pageNumber} of {pageCount}\`; \`artboard.index\` (from 0), \`artboard.count\` and \`artboard.group\` say the same. **Go to step** is the other kind of Next: it moves through the steps of one artboard.

Drag from an output port to the next node's input to connect them. Actions that take time (**Control timeline**, **Animate property**, **Play sound**) have a **Continue** setting: the next node runs when it finishes, part-way through (a percentage), or straight away. Let go on empty space instead and a menu offers only the nodes that fit (actions and logic when you drag from an output, anything with an output when you drag backwards from an input); the one you pick is added where you let go and connected for you, and one <kbd>Ctrl</kbd>+<kbd>Z</kbd> takes the node and its connection back together (clicking a node only selects it, which is not an undo step). Press <kbd>Escape</kbd> or click away to cancel.

![Dragging a connection into empty space adds a node and joins it.](help/drag-to-connect.mp4)

Click a node in the palette on the left (or drag it onto the graph) to add it; select a node to edit its settings on the right. Settings that name a variable or a sound also offer **+ Create new variable…** or **+ Add a new sound…** in their dropdown, so you don't have to leave the graph. Each node has a **Note** box for a reminder to yourself, and **Delete node** at the bottom.

## Notes on the graph
A **graph note** is the same sticky note as on the canvas, but it lives in a graph, for the people reading the flows: what a chain does and why it is built that way, which setting to change to adapt it, the output that is easy to miss. Players never see them, and they never ship (see [Notes](notes)).
- Add one with the **note button** on the graph's own controls, or right-click: **Add note here** on empty graph, **Add note to this node** on a node, **Add note to this group** on a group. A note added to a node or group sits just above it and **follows it**, so it moves when you move the node or group and when you **Tidy up**. A note added to empty graph stays where you put it, and Tidy up only moves it if it landed on a node.
- Double-click a note, or press <kbd>Enter</kbd> on it, to type on it (light markdown works: **bold**, *italic*, - lists and [ ] tasks). Drag it to move it, drag its corners to resize it, <kbd>Del</kbd> removes it. Select one and the settings column shows its text, its colour, **Follows** (the node or group it moves with, or nothing) and **Delete note**. Notes undo, and other people editing the project see them as they are written.
- **Tidy up** leaves room for the notes that follow a node or group, and keeps loose ones off the nodes.
- The **eye button** that hides the notes on the canvas hides graph notes too, and its count includes them. Copying a node or group copies the notes that follow it.

## The palette, search and the artboard picker
- The **artboard picker** at the top of the left column says whose graph you are looking at, with its node count (**Word · 12 nodes**, or **no nodes yet**). Open it to switch: the artboards are grouped as in the Layers panel, and page masters are listed apart at the end. With many artboards it has a search box. It is the same thing as selecting the artboard on the canvas or in Layers, so each follows the other, and picking one also brings the canvas to that artboard. <kbd>Alt</kbd>+<kbd>Up</kbd> and <kbd>Alt</kbd>+<kbd>Down</kbd> (or <kbd>Ctrl</kbd>+<kbd>[</kbd> and <kbd>Ctrl</kbd>+<kbd>]</kbd>) step to the previous or next artboard's graph while you are in the Interactions tab. Choosing an artboard changes what you see, never the project, so nobody else editing is disturbed.
- **Search nodes** finds a node by what it does, not only by its name: *goto*, *navigate* or *page* find **Go to artboard**; *condition* finds **If**; *wait*, *delay* or *pause* find **Wait**; *audio* finds **Play sound**; *tap* finds **On pointer**. Small typos are forgiven. Press <kbd>/</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd> anywhere in the tab to go to it, <kbd>Esc</kbd> to clear it, <kbd>Enter</kbd> to add the best match, or the down arrow to move onto the matches. The menu you get from right-clicking the graph, or from dragging a connection into empty space, searches the same way.
- The **Events**, **Actions** and **Logic** chips show just that kind, and **Topics** has a chip for each topic (Pointer and keys, Variables, Questions, Dragging and so on). Chips combine with each other and with what you type.
- Each topic heading folds. Click it (or press <kbd>Enter</kbd> or <kbd>Space</kbd> on it) to fold or open it; a folded one still shows how many nodes it holds. <kbd>Alt</kbd>+click, or right-click and **Only this one open**, leaves just that topic open, and the right-click menu also has **Fold all** and **Open all**. Which are open is remembered in this browser, with the common ones open to begin with. While you search or use a chip, every topic with a hit opens for as long as you do, and your folds come back when you clear it.

## Selecting, moving around and copying
- **Drag on empty space** to draw a selection box: the nodes (and groups) entirely inside it are selected. <kbd>Shift</kbd>+drag draws one from anywhere, inside a group too. <kbd>Ctrl</kbd>+click (<kbd>Cmd</kbd>+click on a Mac) adds a node to the selection or takes it out, as many as you like. <kbd>Ctrl</kbd>+<kbd>A</kbd> selects everything.
- **Pan** by holding <kbd>Space</kbd> and dragging, or dragging with the middle mouse button. The wheel zooms.
- Drag any selected node to move them all (one undo step).
- <kbd>Ctrl</kbd>+<kbd>C</kbd> copies the selection with the connections between the copied nodes; <kbd>Ctrl</kbd>+<kbd>V</kbd> pastes copies that are wired to each other the same way (never to the originals). A copied group brings the nodes inside it. <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicates, <kbd>Ctrl</kbd>+<kbd>G</kbd> puts the selected nodes in a new group, <kbd>Del</kbd> deletes them.

## Right-click and shortcuts
- Right-click empty graph for **Add node** and **Paste**. Start typing to filter the menu down to the nodes that match (by name, other names people know it by, topic or what it does), then use the arrow keys and <kbd>Enter</kbd>, or click one. The menu you get by dragging a connection into empty space filters the same way.
- Right-click one of several selected nodes for what applies to all of them: **Cut**, **Copy**, **Duplicate**, **Put in a new group**, **Disconnect** (between them, from everything else, or all) and **Delete**.
- Right-click a node for **Connect to new node**, **Connect to existing node**, **Disconnect**, **Cut**, **Copy** (<kbd>Ctrl</kbd>+<kbd>C</kbd>), **Duplicate** (<kbd>Ctrl</kbd>+<kbd>D</kbd>), **Help for this node** and **Delete** (<kbd>Del</kbd>).
- In the graph, <kbd>Ctrl</kbd>+<kbd>C</kbd> and <kbd>Ctrl</kbd>+<kbd>V</kbd> copy and paste nodes, not the layers on the artboard.
- Right-click a connection to **Delete connection**.

## Tidy up
**Tidy up** (the button under the zoom buttons, or right-click empty graph) lays the whole graph out for you: events in the first column and each step one column to the right of what leads into it, nodes ordered so as few connections cross as possible (a node's outputs stay in their order), separate chains stacked one under another, and every group resized to fit its nodes. A loop back to an earlier node doesn't push things further right. It's one undo step.

## Groups
A **group** is a labelled frame around nodes that belong together ("Score", "Intro", "Wrong answers"), so a big graph stays readable. It doesn't change what runs.
- Right-click empty graph and choose **New group here**, or select some nodes and press <kbd>Ctrl</kbd>+<kbd>G</kbd> (or right-click and choose **Put in a new group**) to frame them. Drag more nodes into the frame.
- A node is in a group when its middle is inside the frame. Click the group (its title or any empty space inside it) to select it, and drag it the same way to move it with every node in it; drag its edges or corners to resize it. Right-click inside a group for **Add node here** as well as its own settings.
- Double-click the title to rename it (or **Rename…** in its right-click menu). **Colour** gives it one of a few tints.
- <kbd>Del</kbd> on a group with nodes inside asks: **Just the group** (the frame goes, the nodes stay where they are) or **Group and N nodes** (everything goes, in one undo step). An empty group just goes. Its right-click menu has **Ungroup (keep the nodes)** and **Delete group and N nodes** too, and **Copy** and **Duplicate** for the group with its nodes.

## Behaviours: "When this is clicked…"
The quick way to make a layer do something, with no graph to draw. Select a layer and, in the Inspector's **Interactions** section, press **+ When clicked…** (or **+ When hovered…**), or right-click it and choose **Add interaction**, then **When clicked…**.

A short list asks what should happen:
- **Go to the next page**, **Go to the previous page**, **Go to a page…** (you pick which).
- **Show a layer**, **Hide a layer**, **Show or hide a layer**: this layer or another. Showing a layer other than this one also sets it to start hidden, so there is something to show.
- **Play an animation** (a timeline of this page) and **Play a sound**.
- **Add 1 to a counter** and **Switch something on or off**: pick a number or an on/off variable you already have, or name a new one in plain words and it is made for you.
- **Open a link** and **Start over**.

Pick one, answer the question it asks (the line at the bottom reads back what it will do), and press **Add**. It is added in one step, so one undo takes it all back, including a new variable or the layer set to start hidden. A behaviour is just an **On pointer** event joined to an action (and the variable it needs), the same nodes you would have drawn: select the new node in the graph to change anything about it. Nothing special marks them, and nothing hidden runs.

The empty **+ On click (empty)** and **+ On hover (empty)** buttons add only the event, for building the flow by hand in the graph.

## What a layer does, in sentences
The Inspector's **Interactions** section lists what the layer does as sentences made from its graph: **When clicked: show Hint text, then wait 2 s, then hide Hint text.** A check reads **check whether score is at least 5 (if so: …; if not: …)**, and a long chain stops with **and 4 more steps**. An event with nothing joined to it says **nothing happens yet**, so a click that does nothing is no longer a mystery. Under each sentence:
- **Show in graph** opens the Interactions tab with that event picked.
- **Turn off** stops it without removing it, and **Turn on** brings it back. Turning off puts a \`false\` in front of the event's **Only if**, which the graph shows (a condition that was there stays behind it).
- **Remove** deletes the event and the steps only it reaches. A step another flow also runs stays.

## Read as sentences
The **Read as sentences** button over the graph (beside **Graph**) shows the whole artboard as sentences, one block per event, with the steps and the ways a check splits underneath. It is read only and made from the graph each time, so it cannot say something the graph does not. Pick a line to see that node's settings, **Show in graph** to go back to it, or **Copy as text** for all of it. Steps nothing starts are listed at the end as **Not joined to anything, so these never run**. It is the quickest way to understand a template someone else built.

## Conditions with pickers
Wherever the graph asks for a yes/no condition (**If**'s condition, an event's **Only if**, a timer's **Only while**, and the formula of a yes/no binding such as visible), the field is three pickers: a value (a variable), how to compare it (**is**, **is not**, **is at least**, **is at most**, **is more than**, **is less than**, **contains**, **is empty**, **is not empty**, **is on**, **is off**) and what to compare it with (a number, a piece of text, on or off, or another value). **+ and** and **+ or** add rows. **Edit as formula** shows the formula the pickers write (\`score >= 5 && !done\`) and lets you type it. A formula the pickers cannot show in full, such as one with arithmetic, brackets or a function, simply opens as a formula and is never rewritten. The line under it says what it works out to now.

Test in **Preview**: the event list shows each event as it fires. Every node is listed in [Interaction node reference](interaction-nodes). For a walk-through, see [Tutorial 2](tutorial-first-interaction).

## What's in scope
Expression fields can use every variable and data source by name, \`event\` (details of what fired: \`event.key\`, \`event.x\`, \`event.index\` for a repeated copy, \`event.child\` for the layer inside that was hit, \`event.count\` and \`event.elapsed\` on a timer, \`event.payload\` for a message), \`pageNumber\` and \`pageCount\`, and \`Math\`.

## Messages to and from the host page
**Send message** (and \`ix.emit\`) posts \`{source: 'interactives', name, payload}\` to the page the interactive is in. The page can send messages back with \`player.send(name, payload)\` and **On message** reacts. See [Embedding and the player API](embedding).`,
  },
  {
    id: 'drag-and-drop',
    title: 'Drag and drop',
    group: 'Interactivity',
    summary: 'Layers people can drag, drop zones that take them, and the same thing by keyboard and by tapping: sorting, matching, labelling and small games.',
    keywords: 'drag drop draggable drop zone sort sorting match matching label diagram game slot snap swap return bounds axis grid keyboard touch tap accessible tags capacity',
    body: `Any layer can be made **draggable**, and any layer can be a **drop zone** that takes some of the draggable layers. That is all a sorting activity, a matching exercise, a labelled diagram or a jigsaw needs, and it works with a mouse, a finger, a pen, the keyboard and a screen reader.

## A worked example: sort the animals
Two buckets, four cards. Dropping a card in the right bucket keeps it there; dropping it in the wrong one sends it back.

1. Draw two rectangles and name them **Mammals** and **Birds**. Put a text label on each.
2. Select **Mammals**. In the **Drop zone** section of the inspector press **+**. Set **Takes tags** to \`mammal\`. Do the same for **Birds** with the tag \`bird\`.
3. Draw four cards (a rectangle with some text, grouped): *Dog*, *Cat*, *Eagle*, *Owl*. They must be **above** the buckets in the layers list, or the buckets would cover them.
4. Select a card. In the **Draggable** section press **+**. Put its tag in **Tags** (\`mammal\` for Dog and Cat, \`bird\` for the others). Set **Dropped off a zone** to *Goes back to where it started*. Select all four to set that once.
5. Open **Preview**. Drag a card into a bucket. The **Hit areas** button outlines every draggable layer (blue) and drop zone (green, with what it takes and how full it is) while you work out why a drop did not land.
6. Give feedback in **Interactions**: an **On drop** event with **Result** *Taken by the zone* → **Announce** \`event.layer + " is a " + event.zone\`, and one with *Refused by the zone* → **Announce** \`"Not that one. Try again"\`.
7. Score it. On the first card pick a **Zone variable** (a text variable): it always holds the name of the bucket the card is in, or nothing. A zone's **Contents variable** (a list variable) holds the names of the cards in it. Compare them in an expression such as \`mammalsBucket.length == 2\`.

## The Draggable section
- **Can be dragged**: untick to lock the layer. The **Allow dragging** action does the same while the project runs (lock the answers once they are checked).
- **Tags**: words that say what the layer is, separated by commas. A drop zone takes a layer when they share a tag.
- **Moves**: anywhere, or only left and right, or only up and down (a slider handle, a lane).
- **Stays inside**: nothing, its parent, the artboard, or another layer. The layer's whole box is kept inside.
- **Dropped off a zone**: stays where it was let go, or goes back to where the drag began (and to the zone it was in). Off a zone means no zone there, the wrong tag, or a full zone.
- **Zone decided by**: the layer's centre (the default), the pointer, or whichever zone it overlaps most. Use the pointer for a big card going onto a small slot.
- **Grid**: snaps the position to a grid of this many pixels while dragging.
- **Glide**: how long it glides into a zone or back (none when the viewer asked for less motion).
- **Tap to move**, **Hold to drag on touch**, **Key step**, **Name read out**, **Do not announce**: see below.

## Drop zones
- **Takes tags**: leave empty to take any draggable layer.
- **Holds**: how many layers fit (0 is no limit). **When full** either refuses the new layer, or **swaps**: the layer that has been there longest goes to where the dragged one came from, and the dragged one takes its place. Swapping is how slot puzzles and reordering work.
- **Dropped layers**: stay where they were dropped, centre in the zone, or sit at its top left corner. A layer sent by the keyboard, a tap or an action goes to the centre when this is left alone.
- **Outline when a layer is over it**: an outline appears on the zone while a layer it takes is over it (and a fainter one while any such layer is being dragged). Untick it if your artwork shows the state itself.
- A layer can be both: a tile that can be dropped on and then dragged on again.

## Events and actions
- **On drag start**, **On drag over zone** (moves over / off), **On drop** (taken, refused, or dropped on no zone) and **On drag end** (always fires, after On drop, and also when the pick-up is cancelled). Leave the layer empty to hear every draggable layer or zone. Each fires once per drag, however it ends.
- **On drag move** fires over and over while a layer is held and moving (dragged, nudged with Shift+arrows, or sent between zones with the arrow keys), at most once a frame. \`event.layerX\`/\`event.layerY\` say where the layer is, \`event.dx\`/\`event.dy\` how far it has come since it was picked up: set a variable from them to drive a gauge, move another layer along, or play a sound as it crosses a line.
- Their \`event\` holds \`layer\` (the draggable layer's name), \`zone\` (the zone it is in now), \`from\` (where it was), \`accepted\`, \`reason\` (\`tags\` or \`full\`), \`swapped\`, \`tags\`, \`result\` (accepted, rejected, missed or cancelled) and \`keyboard\` (true when it was not dragged).
- **Put layer in drop zone** moves a layer into a zone as if it had been dropped there; **Reset draggable** sends one (or all of them, for *Start again*) back to where it started; **Allow dragging** switches a draggable layer or a drop zone on and off. None of them fires the drag events, so they cannot start a loop.
- **Allow dragging** and **Put layer in drop zone** also work in bulk: leave the layer empty for every draggable layer, or pick a container (a group or frame) to change everything inside it, and fill **Only tagged** to keep just the layers that carry that tag. **Changes** on Allow dragging adds the drop zones (or only them). One Allow dragging node with the layer empty locks every answer at once; scripts do the same with \`ix.drag.enable(undefined, false)\` and \`{ tag, what }\` as a third argument.
- The older **On pointer → Dragging** events still work for scripted drags. Use the draggable settings when the point is to move a layer and drop it somewhere.
- Scripts have \`ix.drag.zoneOf('Dog')\`, \`ix.drag.contents('Mammals')\`, \`ix.drag.state()\` (every layer and its zone), \`ix.drag.put(layer, zone)\`, \`ix.drag.reset(layer?)\` and \`ix.drag.enable(layer, on, { tag, what }?)\` (no layer: all of them, or everything inside a container). The page that holds the player can read \`player.dragState()\`.

## Keyboard, touch and screen readers
Everyone should be able to finish the activity, so every drag has two ways that need no dragging.

- **Keyboard** (when [accessibility](accessibility) is on): Tab to a draggable layer, press **Space** or **Enter** to pick it up. The **arrow keys** step through the drop zones that take it (it moves onto each one so you can see it), **Home** and **End** jump to the first and last, **Space** drops it, **Escape** puts it back. With no zone to go to, or with **Shift** held, the arrows nudge it by the *Key step* (Shift: five times as far, Alt: a tenth). A layer with an *On pointer → Click* event keeps Enter for the click and is picked up with Space.
- **Tap to move**: tapping or clicking a draggable layer picks it up, and tapping a drop zone drops it there; tapping the layer again, or anywhere else, puts it back. This is on unless the layer has a click event of its own (the setting can force it on). It is the way to do it for someone who cannot drag at all.
- **Screen readers** hear the layer called a "draggable item", then what happens: picked up, which zone it is on (*Mammals, 1 of 2*, and *full* or *swaps with…* when that applies), dropped in, refused, put back. **Name read out** sets what they call the layer or zone (it uses the text alternative, then the layer name, otherwise). Tick **Do not announce** to say it yourself with Announce nodes. The Preview shows what would be spoken.
- **Touch**: a draggable layer stops the browser scrolling or selecting text under the finger. A layer locked to one axis leaves the other axis for scrolling. Inside a scrolling frame, tick **Hold to drag on touch**: the finger must rest a moment before the layer follows it, so swiping from the layer still scrolls the frame.

## Things to know
- Dragging changes the layer's **X** and **Y**. Do not animate those on a timeline that plays at the same time; animate a group around it instead.
- A pointer drag never changes the layer's parent or its place in the layer order; it is raised above everything while it is held. Drop zones can sit in another group or frame. A frame the viewer has scrolled is allowed for: a zone is found where it is drawn.
- Layers made by a [repeater](repeaters) cannot be dragged (every copy would move). A layer inside an auto layout frame can only be dragged when its **Position** (Layout section) is *Ignore*, otherwise the layout puts it back. The inspector says so.
- Layers that start inside a zone that takes them count as being in it.
- A draggable layer and the zones for it have to be on the same artboard, and in the same instance if they are inside one.
- The accessibility checker counts a draggable layer as interactive, so it asks for a name.`,
  },
  {
    id: 'interaction-nodes',
    title: 'Interaction node reference',
    group: 'Interactivity',
    summary: 'Every event, action and logic node with its settings.',
    keywords: 'nodes catalog reference events actions logic parameters',
    body: () => {
      const section = (title: string, cat: NodeDef['category']) =>
        `## ${title}\n\n` +
        CATALOG.filter((d) => d.category === cat)
          .map((d) => {
            const params = d.params
              .map((p) => `- **${p.label}**${p.help ? `: ${p.help}` : p.options ? `: ${p.options.map((o) => o.label).join(', ')}` : ''}`)
              .join('\n');
            const outs = d.outputs.filter((o) => o.label).map((o) => o.label);
            const rest = `${d.details ?? ''}${outs.length ? `${d.details ? ' ' : ''}Outputs: ${outs.join(', ')}.` : ''}`;
            const gives = d.gives ? `**Gives:** ${d.gives.map((g) => `\`${g}\``).join(', ')}.` : '';
            return [`### ${d.label}`, d.summary, rest, gives, params].filter(Boolean).join('\n\n');
          })
          .join('\n\n');
      return [section('Events', 'event'), section('Actions', 'action'), section('Logic', 'logic')].join('\n\n');
    },
  },
  {
    id: 'question-kit',
    title: 'Questions and quizzes',
    group: 'Interactivity',
    summary: 'Add multiple choice, true/false, fill in the blank (typed or dragged), ordering, matching and categorise (drag and drop) and hotspot (click the right place) questions that check themselves, with hints, tries, score, shuffle and question banks, or bring in questions from a GIFT file or paste them from Word or Excel.',
    keywords: 'question quiz test assessment import gift moodle converter multiple choice true false fill blank ordering sequence matching match drag drop categorise sort groups word bank distractor extra pairs terms definitions hotspot click picture image diagram area region answer correct feedback hint attempts score shuffle bank random self check learning',
    body: `Quizzes without wiring every button by hand. **Add question** (in the **Web** group of the tool bar, which starts folded: click **Web** to open it) builds a question on the open artboard out of ordinary layers, the variables it keeps and a few interaction nodes. Then the **Question** section in the Inspector changes the wording, answers, tries, hints and feedback whenever you like, without touching how it looks.

## Add one

Click **Add question**, pick a type, and a card appears with a prompt, the answers, a Check answer button, a Hint button, feedback text, a score and a Try again button. Edit the prompt and answers in the **Question** section, then press **Preview**.

| Type | The learner | Right when |
|---|---|---|
| Multiple choice (one answer) | picks one option | the picked option is marked right |
| Multiple response | ticks any number | exactly the right ones are ticked |
| True or false | picks True or False | it matches the statement |
| Fill in the blank | types into one or more inputs | each blank matches an accepted answer |
| Put in order | moves items up and down | every item is in its place |
| Matching (drag and drop) | drags each term onto its definition | every term is in its own slot (and no extra term is in one) |
| Categorise (drag into groups) | drags each item into a group box | every item is in the group it belongs to |
| Hotspot (click the right place) | clicks an area of a picture | the picked area is marked right (or all of the right ones) |

## What gets built

Nothing is hidden. The question is a **frame** (named Question 1, Question 2, ...) holding:

- a **Prompt** text, \`{q1_prompt}\`;
- an **answer area**: for choices, one **Option** layer repeated once per option (a [repeater](repeaters) over \`q1_items\`, so you restyle the one template and every option follows); for blanks, a label and an input per blank; for ordering, an **Item** layer with Move up and Move down buttons;
- for matching, a **Terms** pile of draggable layers (one per pair) and a **Matches** column with, per pair, a definition text and a dashed **Slot** (a [drop zone](drag-and-drop) that holds one term); for a hotspot, a **Picture** and, over it, one invisible **Area** layer per area;
- **Hint text**, **Feedback**, and a row of **Check answer**, **Hint**, **Try again** and **Score**.

Every layer is yours: recolour it, change the font, move things around, swap a rectangle for an image, add animation. The layers are bound to the question's variables (for example the option fill follows \`item.selected\` and \`item.state\`), so they keep working. The **Restyle a part** buttons at the bottom of the Question section select a part for you; selecting any part shows a note saying it belongs to the question.

The behaviour is a handful of nodes in the **Interactions** tab, in rows of an event and what it runs: *On start* then **Reset question**; a click on the option then **Choose option**; a click on Check answer then **Check answer**; and so on. Add your own nodes after them. **Check answer** has three outputs: *right*, *wrong*, and *finished* (once the question is locked, because it is right or out of tries), so "when it is right, play the confetti timeline" is one wire.

## Listening and number keys
Three settings in the Question section's **Listening and keys** group:
- **Listen button** adds a Listen button beside Check. It reads the question and its numbered options aloud, and once the answer has been checked it reads the feedback and the spoken explanation instead. It uses a voice installed on the learner's own device, never starts by itself, and hides itself when the device has no voice. See [Read it to me](read-aloud).
- **Say the prompt like** and **Spoken explanation** are text only a voice says. The first replaces the prompt when it is read (the options still follow it); the second is said after the feedback. For a data bank, the columns *spoken* and *explain* do the same per row.
- **Number keys 1 to 9 choose** lets the learner press 1 to 9 to choose the option in that place (several choices toggle; other keys do nothing). A small line under the options says so. Choosing still needs **Check answer**. It listens on the whole page, so use it on one question at a time. It is offered for single choice, multiple choice and true or false.

## Variables

Each question keeps its state in variables named from its **Name prefix** (\`q1\` by default): \`q1_answered\`, \`q1_correct\`, \`q1_attempts\`, \`q1_triesLeft\`, \`q1_score\`, \`q1_locked\`, \`q1_feedback\`, \`q1_hint\`, \`q1_hintsUsed\`, \`q1_hintsLeft\`, \`q1_prompt\` and \`q1_items\` (what is shown, with \`selected\` and \`state\` per row). Use them anywhere: \`q1_score + q2_score\`, a progress bar bound to \`q1_attempts\`, a Next button shown when \`q1_correct\`. Renaming the prefix renames the variables and everything that reads them.

**Score** is the question's points times the share that is right, less **Retry −%** for each check after the first and **Hint −%** for each hint taken. With **Part marks** on, a multiple response, ordering or fill in the blank question is worth the share it got right.

## Worked examples

Two finished ones to play first: **Matching question** and **Hotspot question** on the **Templates** tab, under **Examples**. Press **Make my copy** and change the pairs, or the picture and the right area.

**Multiple choice.** Add question, *Multiple choice*. Type the prompt, type each option, and tick the right one. Set **Tries** to 2 and write a hint. In Preview pick a wrong option and press **Check answer**: the feedback says *Not quite*, and with a try left you can pick again. The second miss locks the question and (if **Show the right answer** is on) marks the right option.

**Multiple response.** Tick every right option. Turn **Part marks** on to give a share of the points for a half-right answer, and write **Partly right** feedback.

**True or false.** Write the statement as the prompt and set **Statement is** to True or False. Edit the two labels for other wording ("Agree" and "Disagree").

**Fill in the blank.** The accepted answers go one per line: \`Paris\`, \`city of light\`. Case and extra spaces are ignored unless you tick **Match case**. A number is compared as a number (\`3\` accepts \`3.0\`), and **± Tolerance** accepts near misses. A line written \`/colou?r/i\` is a pattern. **Add blank** adds another input in the look of the last one. Tick **Spelling: letters must match exactly** for a word to spell (see [Spelling tests](question-kit#spelling-tests)).

**Put in order.** List the items in the **right** order; the learner sees them shuffled (the first deal is never already right). Part marks give the share of items in the right place. When the question finishes wrong, the items snap to the right order and the ones that were out of place are marked.

**Extra terms and extra words.** Matching has an **Extra terms** list in the Question section, and fill the blanks a list of **Extra words**. They are dragged like the others but belong nowhere, so the learner has to leave them alone. Left in the pile is right. One dropped into a matching slot is marked wrong and takes that pair's slot, and with part marks each extra in a slot takes one pair's share off.

**Categorise.** Add question, *Categorise (drag into groups)*. The Question section lists the **groups** and the **items**, and each item says which group it belongs in. The learner drags every item into a group box (a box takes any number of items, and an item stays where it is let go), or uses the keyboard as for matching. Every box takes every item, so a wrong drop is allowed and **Check answer** says how it went: right when every item is in its own group, part marks give the share in the right group, and the feedback says how many (*3 of 4 in the right group*). An item can have **Feedback if put in the wrong group**, said with the result. Tick **Say right or wrong as each item is dropped** and each drop answers straight away (*Eagle goes in Birds. Right.*) without using a try, through an *Item dropped in a group* node the kit wires to each box. Categorise questions are marked in the page, not on the server, because which group an item belongs in is part of how the layers are set up. Finished, the items stop moving, and (with **Show the right answer**) the wrong ones are listed with their group.

**Fill the blanks by dragging.** On *Fill in the blank* set **Answer by** to *Dragging words from a word bank*. Each blank becomes a slot, and a bank of word chips appears: the first plain (not a /pattern/) accepted answer of each blank, plus any **Extra words**. Check reads the word in each slot as what was typed, so accepted answers, case, tolerance, part marks and retries all work as for typing. Because only the answer words are in the page (not which blank each fits), a drag the blanks question can still be marked on the server. **Shuffle the word bank** deals the chips again each time it starts.

**Matching.** Add question, *Matching (drag and drop)*. Each pair in the Question section is a term and what it matches (a country and its capital, a word and its meaning, a label and a place on a diagram). The learner drags each term into the slot beside a definition, or uses the keyboard: Tab to a term, Space to pick it up, the arrow keys to choose a slot, Space to drop, Escape to put it back (see [Drag and drop](drag-and-drop)). A slot holds one term; dropping another on it swaps them. **Check answer** is right when every term is in its own slot. With **Part marks** the score is the share of terms in the right place, and the feedback says how many (*2 of 4 matched correctly*). When the question finishes, each slot is marked ✓ Right or ✗ Wrong and (with **Show the right answer**) says which term belongs there; the terms stop moving. **Try again** puts the terms back. **Shuffle** deals the terms to different places each time it starts. Add or remove a pair and the layers follow; a new one takes the look of the others. To match labels to a diagram, move the slots over the picture and restyle the terms: they are ordinary layers.

![A matching question: four country names to drag onto their capitals, with dashed slots on the right.](help/question-matching.png)

**Hotspot.** Add question, *Hotspot (click the right place)*. The sample picture is drawn with shapes so the question works straight away: put your own image in its place (delete the shapes in the **Picture** layer, add an image, or give the Picture frame an image fill). The areas sit together in one **Areas** group over the picture, and the question has one click flow for all of them (an *On pointer* on the group, *Only when a child is hit*, feeding *Choose option* the area's place with \`event.childIndex\`), so adding an area adds no flow. Each **Area** in the Question section is a name, a tick for right, and a shape (rectangle, ellipse or polygon); **Edit on canvas** selects its layer so you can move, resize or reshape it with the usual tools, and **Show all areas** selects every one, since they are invisible until a learner picks one. Tick more than one area as right and the learner has to mark all of them (the areas become checkboxes, and **Part marks** score the share). Clicking an area picks it with a ring and a tint; after the question finishes the right areas are marked and *Right answer: Roof* is written under the picture, so it is not shown by colour alone. If clicks near an area should count, **Grow areas 8 px** makes every area bigger on each side (and **Shrink** the reverse). Each area can have its own feedback, said when it is the one clicked.

![A hotspot question over a drawn house: the Roof area is selected and shown with its outline.](help/question-hotspot.png)

## Paste questions from Word or Excel

Choose **Paste questions from Word or Excel** in the Add question menu: see [Paste questions](paste-questions), with templates to download.

## Import questions from a GIFT file

If you already have questions in Moodle, or made them with the GIFT converter from a Word document, you do not have to retype them. Open the **Add question** menu and press **Import questions from a GIFT file**, then pick the file (\`.gift\` or \`.txt\`).

Each question gets an artboard of its own, named after its title if it has one and otherwise "Question 3" and so on, in rows below what is already on the canvas. An empty artboard that is open (a new project's first one) takes the first question. They are ordinary questions from then on: the **Question** section changes anything, and you restyle them like any other. The whole import is one undo. Up to 100 questions come in from one file; the report says how many were left over.

| In the GIFT file | Becomes |
|---|---|
| One \`=\` right answer and some \`~\` wrong ones | Multiple choice (one answer) |
| Several \`=\` answers with \`~\` ones, or \`~%50%\` style weights that are positive for the right ones | Multiple response |
| \`{T}\`, \`{F}\`, \`{TRUE}\`, \`{FALSE}\` | True or false |
| Only \`=\` answers (short answer) | Fill in the blank, every \`=\` answer accepted. A \`*\` in an answer matches anything |
| \`{#3.14:0.01}\`, \`{#1..5}\` (numerical) | Fill in the blank with a margin of error |
| \`=term -> definition\` lines | Matching (drag and drop) |

The text after a \`#\` on an answer becomes that option's feedback. The text after \`####\` is added to the "Correct" message. On true or false, the two \`#\` parts are the feedback for the wrong choice and the right one. A question written as \`The capital is {=Paris ~Rome}.\` shows a gap (\`_____\`) where the answers were. Backslash escapes (\`\\~\`, \`\\=\`, \`\\#\`, \`\\{\`, \`\\}\`, \`\\:\`, \`\\n\`) work as in Moodle, comment lines starting with \`//\` are ignored, and options stay in the order of the file (turn on **Shuffle** to deal them).

When it finishes, a report lists everything that did not come across, or came across changed, with the line number in the file. Nothing is dropped quietly:

- **Left out**: essay questions (a person marks them), plain text with no answers (GIFT's description), more than one set of braces in a question, a question with no right answer, one that is not valid GIFT, more than 30 choices or 8 matching pairs.
- **Changed**: part marks (a kit question is right or wrong, or scored by the share of right choices), answers worth less than full marks in a short answer, feedback on individual short answers or pairs, extra wrong matches, HTML formatting and pictures (the text is kept, plain), and maths markup, which shows as written. \`$CATEGORY\` lines are ignored.

Moodle XML files are not read yet.

## Shuffle

**Shuffle** deals the options (or ordering items, or a matching question's terms) in a new order every time the question starts or resets. In a multiple choice, tick **Stays in place when shuffled** on an option such as "None of these". Feedback and marking follow the option, not its place.

## The whole quiz

Every project has a built-in \`quiz\` that adds up its questions, for a results page that needs no wiring per question:

| Name | Holds |
|---|---|
| \`quiz.score\`, \`quiz.max\`, \`quiz.percent\` | points earned, the most all the questions can score, and the share (two places) |
| \`quiz.passed\`, \`quiz.passMark\` | at or over the pass mark from [Results and progress](results) (false and empty when there is none) |
| \`quiz.count\`, \`quiz.finished\`, \`quiz.right\`, \`quiz.done\` | how many questions, how many are finished, how many of those are right, and whether all are finished |
| \`quiz.questions\` | one entry for each question: \`prefix\`, \`page\` (its artboard's name), \`score\`, \`points\`, \`correct\`, \`locked\` |

Use \`quiz.questions\` as a repeater's items to show a row for each question: \`{item.page}: {item.score} of {item.points}\`. Adding a question to the quiz adds a row, and a question's own settings are all there is to wire. A bank gone through once counts as one question with the run's score and points. A variable or data source called \`quiz\` takes the name over, as for any built-in. In Results and progress, **Score from: Total of all questions** makes the project's reported score this total.

Two settings in the Question section help a quiz of several pages: **Keep the answer when the page is revisited** (coming back to the page in the same visit finds the question as it was left, rather than set up again; a drag question puts its layers back where the last check found them) and **Hide Try again** (leaves out the button, for a test that is marked once).

## Question banks from data

Banks work with the choice, true/false, fill in the blank and ordering types. A matching or hotspot question is built from layers you place, so it takes only the prompt, hints, feedback and points from a row.

Tick **Take the question from data** and give the name of a [data source](data-sources) (or part of one, like \`quiz.questions\`). Each row is a question; what a row leaves out stays as set in the Question section (except hints, which come only from the row). With a bank the card's Try again button becomes **Next question**, which draws the next row (**Random** shows every row once before any repeats; **In order** goes round).

The rows can also be a **list variable** (pick one under **Or a list variable**): a list of objects with the same columns, such as questions the project builds itself.

### Going through the rows once

By default a bank loops for ever. Set **When the rows run out** to *Finish after one go through* and it is a **run**: the learner is asked each row once, then it is done. **Questions to draw** asks that many rows, picked at random (or the first ones for *In order*); 0 asks them all. The question keeps the run in these variables (with its own prefix, here \`q1\`):

| Variable | Holds |
|---|---|
| \`q1_setPos\`, \`q1_setCount\`, \`q1_setLeft\` | which question of the run this is, how many it has, how many are not finished |
| \`q1_setScore\`, \`q1_setMax\` | points earned so far, and the most the run can score (each row's own \`points\`, else the question's) |
| \`q1_setDone\` | true once every question is finished |
| \`q1_missed\` | the rows (counting from 0) that finished wrong, in this run |

**Check answer** has a **set done** output that fires when the question just checked was the last of the run, and **Reset question** has one that fires when there is no next question, so a Next question button can go straight to a results page. Moving on from a question without finishing it counts it as missed. On Reset question, **Bank run** set to *Start a new run* draws a fresh run with clean totals, and *Review the missed ones* runs only the rows in \`q1_missed\` (with nothing missed it is done at once).

Columns a row can have:

| Column | For |
|---|---|
| \`prompt\` | the question text |
| \`options\` | choices, as a list or text separated by \`\\|\` (also the items to order, right order first) |
| \`correct\` | the right choice(s) as text or position counting from 1 (\`B\` or \`2\`, several as \`A\\|C\`); true/false takes \`true\` or \`false\` |
| \`answer\`, \`answer2\` | accepted answers for each blank, several separated by \`\\|\` |
| \`items\` | ordering items, right order first |
| \`hint\`, \`hint2\`, \`feedback\`, \`feedbackCorrect\`, \`feedbackIncorrect\`, \`points\` | as the names say |

A CSV works the same way: the header names are the columns, in any case. The question reloads when its data source finishes loading.

## Results

**Report result** in the Question section adds a *Report result* node after **Check answer**'s *finished* output, sending the question's score (\`q1_score\`) to the project's Results (see the Results settings for the top score, pass mark and completion). With several questions, leave it off and report once yourself, for example a *Report result* node with the score \`q1_score + q2_score\` after the last one.

## Marking on the server

Everything above marks in the learner's browser, so the right answers are in the file the learner downloads and a score is only ever what their browser says. For marks that have to be trustworthy, tick **Mark answers on the server** in the Marking part of the Question section. Both the share link and the **Link for StudyDesk** then serve the project without its answers (press **Update to the latest version** in [Share link](export#share-link) after you change it), and the **Link for StudyDesk** is the one that can check an answer:

- The page that is served has the right answers taken out: which options are right, accepted answers and their patterns and tolerances, the feedback, and the hints. The right order of an ordering question is hidden too. Anyone who looks at the page's code finds none of it.
- **Check answer** sends the learner's answer to the server, which marks it with the same marking the player uses, and sends back right or wrong, the score and the feedback to show. The tries, hints and score are kept by the server, so a learner who reloads or starts again does not get a fresh set of tries.
- The server records the result itself. The mark that counts for each question is how it finished the first time (unless the set has **Retakes**, below). **Try again** after that is practice and does not change the recorded mark. The project's score is the total of those marks out of the questions' total points, it counts as complete when every server-marked question has finished, and it passes at the pass mark set in the Results settings.
- A **Report result** node, or anything else the browser sends as a result, is ignored for a project with server-marked questions: the server's own record is the only one. Questions that are not set to be marked on the server still do their normal marking in the page, but they add nothing to that record.
- Checks and hints are limited to 30 a minute for each learner, so an answer can't be found by guessing over and over. A learner who goes over is asked to wait.
- A learner who came in from an LMS over LTI 1.3 has their score sent to the LMS gradebook by the server when the whole set is finished, and again if their kept score changes. See [Spelling tests](question-kit#spelling-tests) for how.

What it does not do:

- The answers are only taken out of the two links. **Preview**, an exported HTML file or package, and anyone who opens your project in the editor still have the answers, and mark in the page as usual.
- Learners need the **Link for StudyDesk** (and to be signed in to StudyDesk) to have an answer checked. On the plain share link with no session, the question says it can only be checked from StudyDesk.
- **Matching**, **Categorise** and questions taken from a **data bank** can't be marked on the server: which term belongs where is part of how the layers are set up, and a bank is data the learner downloads. They stay marked in the page, and the Question section says so. A fill the blanks question answered by dragging words can be marked on the server (it is sent the words in the slots).
- Unlimited tries can still be used to find an answer slowly. Set **Tries** to limit them.
- A script or a custom node that holds an answer of its own is not touched.
- Staff who open the project in the editor, or Remix it from the Link for StudyDesk, see the full project with its answers.

## Spelling tests

A spelling test plays a word and the learner types it. Build one with one **Fill in the blank** question for each word, one to a page the way the **Spelling test** starter does, and for each:

1. Tick **Mark answers on the server** and **Spelling: letters must match exactly** on its blank.
2. List every accepted spelling, one per line (\`judgement\` and \`judgment\`). Tick **Also accept American spellings** to accept the American form of each as well: the editor shows the forms it adds, so nothing is accepted that you can't see. It knows the common differences (colour/color, organise/organize, centre/center, travelled/traveled, paediatric/pediatric and a few dozen words that just differ) and leaves a word alone when it is not sure, so add anything else as its own line.
3. Give the word its audio (see **The spoken word** below): a **Play sound** node on a button plays it. Write nothing of the word anywhere else (not in a layer name, a label or the prompt).

**The spoken word.** With **Spelling** ticked, the question has a **Voice for the word** section. **Word audio** says where the sound comes from: **Made with a voice** or **My own audio**. With a made voice, press **Make the audio with a voice** and the server turns the first accepted spelling into speech and saves it as an ordinary sound in the project's Assets, picked in that word's **Play sound** node (a page with no Play sound node gets a **Play the word** button with one). **Make the audio for all words** does every word with the same voice and speed. The speech is made here, while you are editing, so the learner's page only ever has the sound.

- **Voice** and **Speed**: eight British voices (there is no Australian voice yet). A little under normal speed, the default, is clear for a spelling test.
- **Preview** plays it without saving anything, so you can hear a word before it goes in.
- **Say it like**: when the voice says a word wrongly, or does not know it, type the word as it sounds in ordinary English words (\`cull er\` for colour). It is only used to make the audio and is never in the page. A word the voice does not know says so and nothing is made until you give it a **Say it like**.
- **Sentence** is said after the word, as a teacher would (\`The colour of the sky is blue.\`), and **Say the word again at the end** gives word, sentence, word. Both are only in the audio.
- The first time anyone uses it, the server has to download the voice once (about 130 MB), and the section offers **Set up the voice**. If the server has no speech engine it says so, and you can still record the words yourself, upload the files and pick them in the **Play sound** node.
- **My own audio** hides the voice controls and shows a sound picker: choose a sound already in Assets, **Add a new sound** (upload), or **Record it now** with your microphone. It goes in the same **Play sound** node the made voice uses, so the page's buttons and graph do not change. Switching between the two never deletes either file: the made audio and your own both stay in Assets and each question remembers which is in use. **Make the audio for all words** skips words set to My own audio. Marking on the server, and the word being kept off the learner's page, work exactly as before, because your audio is still the only place the word is. The editor warns when the audio file's name contains the word (Preview and exported files keep file names, and the share link renames them), so name it something else. Recordings are made in the browser (webm, ogg or m4a depending on the browser): use an uploaded mp3 or wav if you need a particular format.
- Make a word again after you change it, and the new audio replaces the old. Listen to every word before you share: a voice can say an unusual word wrongly, and **Say it like** fixes that.

**Practice mode.** Tick **Practice mode** and the learner's own device reads the word aloud instead (the **Play sound** node becomes a **Read aloud** node holding the word). The device voice has to be given the word, so **the word is in the page, where anyone can read it in their browser's developer tools**. Use it for practice, never a graded test. The question is then marked in the page and sends no grade, **Mark answers on the server** is turned off, and the share link does not hide the word. The voice is whatever the learner's device has, and with none for the language nothing is said. Turning it off puts the audio back but does not turn server marking back on: do that yourself.

**What counts as right.** Every letter, in order. Case is ignored unless **Match case** is on, and spaces round the word are ignored. A curly apostrophe typed on a phone counts as a plain one, but a missing apostrophe or hyphen is wrong, and accents have to be there (cafe is not café). Numbers are not compared as numbers. The box has the browser's own spellcheck, autocorrect and automatic capitals switched off (**No browser help** in the input's settings), so it neither underlines nor fixes the word.

**Spell checkers and writing tools.** With **Spelling** ticked, the question also has a **Spell checkers and writing tools** section. What the page can switch off, it does: the answer box asks for no spellcheck, autocorrect, automatic capitals or autofill, carries the opt-out attributes Grammarly and LanguageTool honour (\`data-gramm\`, \`data-enable-grammarly\`, \`data-lt-active\`), and with **Block paste and drop into the box** ticked the answer has to be typed. What it can't switch off, it looks for. The page watches for what writing tools put into it (Grammarly, LanguageTool, Microsoft Editor, ProWritingAid, QuillBot and Ginger) and for an answer that changes without anyone typing. **When a writing tool is found** chooses what happens:

- **Block until it is turned off** puts up a panel that says what was found and how to turn that tool off for this site. Nothing behind it can be reached. The page checks again by itself and the panel goes as soon as nothing is found; **Check again** does it on the spot. If the answer changed by itself, the learner presses a button and the answer goes back to what they typed.
- **Warn only** shows the same panel as a notice the learner can dismiss.
- **Off** looks for nothing (the other ticks still apply).

New spelling questions start on **Block** with paste refused. Existing ones are left as they were until you change them. Whatever was found is kept with the learner's result: **Results** shows the tools found and how often the panel came up, and the results spreadsheet has a **writing tools found** column. That works on the Link for StudyDesk, where there is a learner to keep it for. The settings, the watching and the panel are part of the player, so they work the same on the share link, in the StudyDesk embed and inside an exported single file (an exported file has no learner record to keep what was found in, so there the panel is all there is). In **Preview** the panel has a **Skip (Preview only)** button so you are not locked out of your own test.

**Assistive technology.** Screen readers, magnifiers, switch devices and other assistive technology put nothing in the page and are never looked for. If a tool a learner relies on does look like a writing tool, set an **Exemption code**: the learner types it in the panel and is let through for the rest of their visit, and their result says an exemption was used. The page only holds a scrambled form of the code, so give the code itself to that learner only. The panel also tells learners to ask their teacher about an exemption.

**What the guard cannot do.** Be plain with yourself about this, and with learners if you like:

- The keyboard on a phone or tablet, and a computer's own autocorrect and text suggestions, are outside the page. The page can't see them or turn them off. On an iPhone or iPad the autocorrect setting is only a hint the keyboard may ignore.
- A second device, a desktop program, or a tool that puts nothing in the page can't be seen at all.
- The list of markers is what each tool is known (or, for Microsoft Editor, ProWritingAid, QuillBot and Ginger, generally believed) to put in a page. A tool that changes its markers slips through until the list (\`src/guard-tools.ts\` in the player) is updated, which is why the page also watches for an answer changing without typing.
- A writing helper only shows it is on in the page if it is allowed to run on this site. A learner can turn one on after the panel has gone.

So treat it as a strong nudge and a record, not a lock. It works best alongside what the test already does: the word is marked on the server and only in the audio.

**Keeping the word out of the page.** The page learners get has no accepted spellings in it, because the question is marked on the server. The word is in the audio, so the audio is the only place it is. In a project with spelling questions, **Update to the latest version** on the share link also renames every audio asset to a plain name (\`colour.mp3\` becomes \`audio-1.mp3\`) and cuts the title and comment tags out of mp3 and wav files. Other kinds of audio keep their tags, and the share says so: use mp3 or wav. Speech made on the learner's own device (the browser reading text aloud) is not an option for a graded test: it would need the word as text in the page, which is why **Practice mode** is only for practice. Make the words with the **Voice for the word** section, or record them and upload the files. Audio the voice makes is a plain wav with no tags.

What this does not protect against: a learner who writes down what they hear (that is the test), who runs the audio through speech recognition, or who has your project open in the editor. **Preview** and any file you export still carry the answers.

**Submit, Try again and Hint.** The starter's answer button says **Submit answer**, since the word is marked once and the mark is final, and **Play the word** switches itself off (reading "Playing...") while the word is going, so a second press can't play it over the first. It switches back on when the word ends, is stopped or cannot be loaded. **Try again** and **Hint** are off to begin with, each one project variable you change once for every word: \`allowTryAgain\` (a learner who got a word wrong may clear the box and have another go, for practice, so the first mark still stands) and \`offerHint\` (a small **Hint** pill at the top right of the card, opposite the prompt, which shows the hint typed for the word in **Hints** in the Question section; the hint stays on the server with the answers, and it never holds the word). Set them in the Variables tab: the starter's initial value is what the learner opens with. A word page you copy keeps all of it.

**Tries and retakes.** **Tries** is how many goes at one word (1 for a test). **Retakes** (in the Marking part, set the same on every word) lets the learner go through the whole test again: a round is every word finished once, the server keeps each round, and the score that counts is the **Best round** or the **Latest round**. Choose a set number of retakes, or unlimited. A **Reset question** node with **Retake** on (the starter's **Retake** button) starts the next round for every word at once, and only when the round is finished and a retake is left, so opening a page again never uses one up. Until the last retake the right spelling is not shown after a wrong word, so a learner can't read the answers off one round to use in the next. The question's \`round\`, \`retakesLeft\`, \`kept\` and \`keptMax\` variables say where the learner is and what is on record, for a results page to show.

**Grading in the LMS.** Add the project to a course with the LMS's **Select content** picker (or an external tool link) and, when the LMS has a grade for that link, the server sends the score to it. It sends the kept score with the test's total points once every word is finished in a round, and again only when the kept score changes. It needs the LMS to be registered for LTI 1.3 with grade passback allowed, and the link has to be set up for grades in the course. A learner signed in another way gets everything but the grade. If the LMS refuses a score, the server tries again a moment later and with the learner's next click, and the record shows what was sent.

## Accessible by default

The prompt is a heading, the options are a radio group (or checkboxes) with their text as the name and *Right* / *Wrong* / *This was the right answer* as the description once they are marked, every part is reachable with Tab and operated with Enter and Space, and **Check answer**, **Hint** and the ordering moves announce through the live region (see [Accessibility](accessibility)): the feedback, the hint, "Evaporation, position 2 of 4". Right and wrong are shown with words (✓ Right, ✗ Wrong) as well as colour. A matching question's terms are named buttons that screen readers announce as draggable, picked up and dropped with the keyboard, and told where they landed. A hotspot's areas are focusable radio buttons (checkboxes when several are right) named after the area, so the picture can be answered without a mouse; give every area a name, and the picture an accessible description. These need the Accessibility preference on, which is the default.

## Copies, deleting and changing type

- **Duplicate** a question and the copy shares the original's variables, so the Question section warns and offers **Make this one independent**, which gives the copy its own variables and nodes.
- Changing **Type** rebuilds the answer area (a different set of layers) and keeps the prompt, buttons and feedback as you styled them. Settings that make no sense for the new type are left alone.
- Delete a button you don't want (say Hint): its wiring goes the next time settings change, and nothing else is affected. The Hint button hides itself when the question has no hints.

## Reference

The question frame holds its settings in \`question\`, and each part layer carries a \`questionPart\` marker so the settings can find it again after it is renamed or moved. Both are in the exported file; the player uses the settings and ignores the markers. The nodes are **Check answer**, **Reset question**, **Show hint**, **Choose option** and **Move item** in the [node reference](interaction-nodes). Not yet in the kit: matching (which would use [Drag and drop](drag-and-drop)) and hotspots.
`,
  },
  {
    id: 'paste-questions',
    title: 'Paste questions from Word or Excel',
    group: 'Interactivity',
    summary: 'Paste a list or table of questions from Word or a spreadsheet, or open a filled in template, see a preview, and add them as kit questions.',
    keywords: 'paste questions import word docx excel xlsx spreadsheet csv table template list quiz bank bulk multiple choice true false blank matching',
    body: `If your questions are already in Word or a spreadsheet, you do not have to retype them. Open the **Add question** menu and choose **Paste questions from Word or Excel**, then paste them in (or press **Open a file** to read a filled in template). A preview shows the questions it understood and the lines it did not, and nothing is added until you press **Add**. Each question gets an artboard of its own and is an ordinary [kit question](question-kit) from then on. Press <kbd>Ctrl</kbd>+<kbd>K</kbd> and type "paste questions" to open it from the command palette.

## Templates to fill in
Each template has a worked example of every kind of question it reads: multiple choice, multiple answer, true/false, fill in the blank and matching.

- [Word template (.docx)](templates/question-template.docx): a block of lines for each question.
- [Excel template (.xlsx)](templates/question-template.xlsx): a row for each question, with a second sheet of instructions.
- [CSV template (.csv)](templates/question-template.csv): the same rows, as a plain file for any spreadsheet.

Delete the examples (or write under them), fill in your own, then copy what you wrote and paste it in, or open the saved file. Headings and grey notes in the Word file are ignored, so it does not matter if you leave the examples in. Only the first sheet of the Excel file is read.

## As lines (Word, email, a text file)
One question in each block, with a blank line between questions. The first line is the question (a number in front of it, like \`1.\` or \`Q1:\`, is dropped) and every line after it is a choice:

\`\`\`
Type: Multiple choice
1. Which planet is closest to the Sun?
a) Venus
b) Mercury *
c) Earth
Feedback: Mercury orbits closest.
\`\`\`

- **Right choice**: put a \`*\` after it (or before it), or a tick, \`(correct)\`, \`[x]\`. Or give an **Answer** line with its letter, number or text: \`Answer: B\`. For more than one: \`Answer: A, C\`, or mark each.
- **Letters and bullets** (\`a)\`, \`A.\`, \`1)\`, \`-\`) in front of a choice are optional, and a plain list pasted from Word works.
- **True/False**: the question, then \`Answer: True\` or \`Answer: False\`. Choices called True and False with one marked work too.
- **Fill in the blank**: the question, then \`Answer: H2O | h2o\`, every accepted answer split by \`|\`.
- **Matching**: a pair on each line, written \`France = Paris\` (or \`->\`), two to 8 pairs.
- **Type** is optional: Multiple choice, Multiple answer, True/False, Fill in the blank or Matching. Without it the kind is worked out (a question with two or more right choices becomes Multiple answer). **Title** names the artboard. **Feedback** is shown once the question is finished.

## As a table (Excel, Word table, CSV)
Copy the cells (with the headings) and paste. The headings are matched by their words, in any order: **Type**, **Question**, **Option 1**, **Option 2** and so on (as many as you like), **Correct** and **Feedback**. **Correct** takes the letter or number of the right choice (\`B\` or \`2\`), several as \`A, C\`, or \`True\`/\`False\`. You can also mark the right option with a \`*\` instead. For fill in the blank the option cells are the accepted answers, and for matching each option cell is a pair, \`term = match\`. With no heading row, the first cell of a line is the question and the others are choices.

## What it will not read
Ordering, categorise and hotspot questions are not pasted (add them from the Add question menu), and nor are pictures, part marks or feedback on individual choices. Every line it cannot use is listed in the preview with its line (or row) number and why, so you can fix it in the box and see it change. At most 100 questions are added at once.`,
  },
  {
    id: 'variables',
    title: 'Variables',
    group: 'Interactivity',
    summary: 'Named values (number, text, true/false, colour, choice) shared by the whole project.',
    keywords: 'variable state value number string boolean color enum choice options input',
    body: `Variables hold the state of an interactive: a score, a name, whether a panel is open. They belong to the project, so every artboard sees the same values.

Add them in the **Variables** tab. Each has a name, a type and a starting value.

| Type | Holds |
|---|---|
| Number | \`0\`, \`3.5\` |
| Text | \`"Hello"\` |
| True/false | \`true\` or \`false\` |
| Colour | \`#ffb448\` |
| Choice | One of a list of options you define, like \`easy\`, \`medium\`, \`hard\` |
| List | Items, usually objects: \`[{"name": "Ann"}, {"name": "Bo"}]\` |

Choice variables show as a dropdown wherever you set them, so you can't type a value that isn't on the list. In expressions, \`enums.difficulty\` is the list of that choice's options, so \`enums.difficulty.indexOf(difficulty)\` is its position. A solo group's **active child** can be bound straight to a choice whose options are the children's names.

## Lists
A list variable holds the items a [repeater](repeaters) draws: put its name in **Repeat → Items**, and \`item\`/\`index\` are the current one. The starting items are JSON text in the Variables tab. Change the list while it runs with **Set variable**: *Append to list* adds an item (\`{name: "Cy"}\`), *Remove from list* takes out the item at a position (0 is the first), *Empty* clears it, and *Set to* replaces it. The other list ops are *Add to list, or take out if there* (a tick-list: adds the value, or removes it when it is already in), *Remove from list (value)* (every item equal to the value, objects compared by what they hold) and *Change one list item*: give the item's position (left empty it is \`event.index\`, the item the event came from), an optional **Field** to change only that field of an object item, and the new value, which can read \`item\` (what is there now) and \`index\` (\`item.count + 1\`). A position that is not in the list changes nothing. In scripts use \`ix.toggleItem('picked', 'b')\`, \`ix.removeValue('picked', 'b')\` and \`ix.setItem('cards', 2, 'down', 'state')\`, or assign a new array: \`ix.vars.people = [...ix.vars.people, {name: 'Cy'}]\`. Text that is not a JSON array makes an empty list.

## Worked out from a formula
Instead of typing a starting value, give a variable a **formula** (the line under its value in the Variables tab): an [expression](expressions) over the variables above it in the list. The player works it out each time the project starts (and after **Start over**), and the canvas preview works it out too, so what you see while editing follows the variables it depends on. The typed value is only what it falls back to if the formula fails. It is an ordinary variable once it plays, so Set variable can change it, unless you tick **Keep up to date** (see *Live variables* below): then it is read only and is worked out again whenever what it reads changes. The branded Crossword and Word search starters use this: you edit a plain list of words (and clues) and the grid is laid out from it, with \`crossword(words, 10)\` and \`wordSearch(words, 12)\` (see [Expressions](expressions)). Clear the formula to type or lay the value out yourself.

## Live variables
Tick **Keep up to date** under a variable's formula and it becomes *live*: the formula is worked out again whenever a variable it reads changes (and, for a formula that reads layers, data or the microphone, whenever something moves), not just at the start. Use one for anything you would otherwise paste the same long expression for in several places: a word count (\`wordCount(essay)\`), whether the score passes (\`score / total >= 0.5\`), a band (\`band(score / total, [0.75, 0.5], ["Great", "Good", "Keep going"])\`), a list filtered by another variable. Layers then just show \`{wordsLeft}\`.

- A live variable is **read only**. *Set variable*, scripts, inputs and the page cannot change it (they are told so in the console), and the Usage tab lists a *Set variable* or *Reset variables* node that names one under **Broken**. Untick it to set it by hand again.
- Live variables can read each other, in any order in the list. If they read each other in a circle (or one reads itself) they stay at their starting value and the Variables tab and **Usage** say so.
- **On variable change** fires when a live variable's value changes, like any other, and a script's \`ix.get\` always sees the current value.
- The typed value is what it falls back to when the formula fails (data not loaded yet, say). The canvas preview shows live variables worked out too.

## Save as user data
Tick **Save as user data** on a variable and the player looks after the rest. Its saved value is put back **before the project starts**, so the first thing a returning learner sees is their own work; it is saved a moment after it changes (a burst of typing is one save), and straight away when they move to another artboard or leave the page. It goes to the same place as the *Save user data* and *Load user data* nodes (see [Results and resume](results)), so you no longer need a *Save user data* node before every Next and Back. In expressions, \`userData.loaded\` is true once the saved values have been looked for (for a "Welcome back" panel that should not flash on a first visit) and \`userData.restored\` is how many variables came back. A live variable cannot be saved. Instances inside a page keep nothing: tick it in the main project.

## Putting variables back
*Set variable → Back to its starting value* puts one variable back, and the **Reset variables** node puts several back in one go (tick them in the node's list, or **All**). A starting value is the one for this course if there is one, else the typed value, else the formula worked out again (so a formula that shuffles gives a fresh order). Live variables are left alone. This is lighter than **Start over**, which also leaves the page. Scripts: \`ix.reset('score', 'answers')\`.

## Different values for different courses
One project can start with different values in different courses (a due date, a unit name, a week count). In the **Data** tab, pick **context** and add a row under **Per-course values**: a course label such as \`MAT1000_*\`, and the variables it changes. See [Course and learner context](course-context).

## Using variables
- In text: \`Score: {score}\`.
- In [bindings](bindings): drive any property from a variable.
- In interactions: **Set variable** (set, add, toggle, list changes, reset), **Reset variables**, **On variable change**.
- On inputs: bind a text field, checkbox or slider's **Value** to a variable, usually **⇄ Both** (see [Bindings](bindings)).
- In scripts: \`ix.vars.score += 1\`.
- From the host page: \`player.setVariable('score', 10)\`.

Variable names must be letters, digits and \`_\` so expressions can use them. The name is saved when you leave the field. Tick **Remember** to keep the value between visits (for a score, a saved choice or a name): in the learner's record when the project is played from the Link for StudyDesk, otherwise in their browser. See [Results and progress](results). Press **+ Add variable** to make one, and the bin to delete it. See [Tutorial 3](tutorial-state-machine) for a worked example.

![The Variables tab.](help/variables-panel.png)`,
  },
  {
    id: 'expressions',
    title: 'Expressions',
    group: 'Interactivity',
    summary: 'Short JavaScript formulas in text, bindings and node settings.',
    keywords: 'expression formula javascript template braces condition ternary math',
    body: `An expression is a short formula that gives a value, written in a safe subset of JavaScript. Variables and data sources are in scope by name.

\`\`\`
score + 1
name.toUpperCase()
lives > 0 ? "Play again" : "Game over"
Math.round(progress * 100) + "%"
products.filter(p => p.inStock).length
\`\`\`

## Where they go
- **Text**: anything in \`{braces}\`.
- **Bindings**: a property's value. See [Bindings](bindings).
- **Node settings** marked *expr*, such as Set variable's value or If's condition.
- **Repeat → Items**: the list to repeat over.

In repeated copies, \`item\` and \`index\` are the current list item and its position. In interactions, \`event\` describes what fired.

## Suggestions as you type
Every field that takes an expression suggests as you type: the Formula of a binding, a node's expression settings (If's condition, Set variable's value...), a variable's formula, Repeat's items, a joystick's X and Y, and the \`{braces}\` in a text layer's words, a button's label or a link's address (there it only suggests inside the braces).

Type the start of a name, or press the dot after one, and a short list appears with each choice's type and its value right now. It offers your variables, \`context\` (and its fields, such as \`context.firstName\`), your data sources, the names the player supplies (\`reducedMotion\`, \`voiceAvailable\`, \`micLevel\`, \`downloadSize\`...), the helpers below with their arguments, and what the setting itself has (\`event\` in a graph node, \`value\` in a converter, \`self\` in a binding). After a dot it lists what can follow: the fields of an object, \`self.width\`, or the methods of text and lists. Inside \`layer("\` it lists your layers' names.

**Up** and **Down** move through the list, **Enter** or **Tab** puts the choice in, and **Esc** closes it. With no list showing, Enter and Tab do what they always did.

## Checks as you type
A line under every formula field says what the formula is doing, a moment after you stop typing:
- **Green**: what it works out to right now, such as *currently true*, *currently 12* or *currently “Hello”*. A formula that depends on what has just happened (it uses \`event\`) says *depends on what happens when it runs*, and one that uses \`Math.random()\`, \`randInt\` or the date says *changes each time it runs*. It is not run to show you a value that would be different the next time.
- **Red**: what is wrong, in a sentence. *There is no value called scoer. Did you mean score?* comes with a **Use score** button that fixes every use of it in one click. A bracket or quote that is not closed, a symbol missing at the end, a single \`=\` where \`==\` was meant, and a formula that cannot be worked out with today's values are all said in words.

The check uses the same scope as the suggestions, and the values are the project's starting values, as on the canvas.

## Conditions without typing
A field that asks for a yes/no condition (see [Interactions](interactions)) offers pickers instead of a text box: **[value] [is at least] [5]**, with **+ and** and **+ or** for more rows, and **Edit as formula** for the text. The pickers write an ordinary formula, so anything you built with them can be edited by typing, and a formula they cannot show opens as text.

## Helpers
These work in every expression:

| Call | Gives |
|---|---|
| \`fmt(n, decimals, thousands)\` | A number as text: \`fmt(1234.5, 2, true)\` is \`1,234.50\` |
| \`remap(v, inMin, inMax, outMin, outMax, clamp)\` | One range mapped onto another |
| \`clamp(v, min, max)\` | A number held between two limits |
| \`lookup(v, {a: 1, b: 2}, fallback)\` | The value stored under a key |
| \`pad(n, width)\` | Zero padding: \`pad(7, 3)\` is \`007\` |
| \`html(text)\` | Text made safe to put in a web page (a downloaded report): \`<\`, \`>\`, \`&\` and quotes are replaced |
| \`crossword(words, size)\` | A crossword laid out from a list of \`{answer, clue}\` rows (or plain words), inside a \`size\` by \`size\` grid. Each row comes back with \`row\`, \`col\` (its first letter, from 0 at the top left) and \`down\` added, in reading order. Words that are too long, or that cannot cross the others, are left out. The same words always make the same puzzle. Best used as a variable's [formula](variables) |
| \`wordSearch(words, size, seed)\` | A \`size\` by \`size\` letter grid hiding the words (across, down, diagonal and backwards), one string per row. The same words and seed always make the same grid |
| \`mindMap(nodes, options)\` | A mind map laid out on both sides of its middle idea. \`nodes\` is a list of \`{id, parent, ...}\` (the item with no parent is the middle; list order is branch order); \`options\` is \`{width, height, nodeW, nodeH, gapX, gapY, collapsed}\` (\`collapsed\` lists the ids of folded branches). Each item comes back with its own fields and \`x\`, \`y\`, \`w\`, \`h\`, \`depth\`, \`side\` (\`root\`, \`left\` or \`right\`), \`branch\`, \`visible\`, \`kids\`, \`folded\`, \`parentIndex\` (the copy a connector joins) and \`right\`, \`left\`, \`up\`, \`down\` (the copy each arrow key goes to, -1 for nowhere). Boxes shrink to fit \`width\` by \`height\`. Best used as a [live variable](variables) feeding a [repeater](repeaters) and [connectors](connectors) |
| \`mindMapEdit(nodes, op, at, arg)\` | The tree after one change, as a new list: \`"add"\` (a child of item \`at\` labelled \`arg\`), \`"rename"\`, \`"delete"\` (with everything under it), \`"up"\`, \`"down"\`, \`"indent"\`, \`"outdent"\` and \`"reparent"\` (under item number \`arg\`). A change that makes no sense (deleting the middle, putting an idea under itself) gives the list back as it was. \`mindMapNextId(nodes)\` is the id an added item gets, \`mindMapOutline(nodes, {detail: "detail"})\` the map as an indented text outline and \`mindMapSvg(placed)\` a laid out map as an SVG picture for a download |
| \`flowChart(steps, links, options)\` | A flowchart laid out in rows from its start. \`steps\` is \`{id, kind, label, ...}\` with \`kind\` one of \`start\`, \`end\`, \`process\`, \`decision\` or \`io\`; \`links\` is \`{from, to, label}\` by step id; \`options\` is \`{width, height, direction: "down" or "right", sizes, gapX, gapY}\`. Each step comes back with \`x\`, \`y\`, \`w\`, \`h\`, \`layer\`, \`order\` and \`kind\`. Links that loop back are left out of the rows; a decision\'s branches open out either side |
| \`flowLinks(steps, links)\` | The same links with the step numbers they join (\`a\`, \`b\`, -1 when a step is missing), \`back\` (a link that loops back up) and the sides they should use (\`outSide\`, \`inSide\`), for the connectors that draw them. \`flowOutline(steps, links)\` is the chart as numbered text, branches included |
| \`cloud(words, width, height, options)\` | A word cloud packed onto a stage \`width\` by \`height\`. \`words\` is plain text (each mention counts once) or rows \`{text, weight, ...}\`; the same word in other capitals is one word and the weights add. It comes back one row per word, the biggest first, each with \`size\` (the font size), \`x\`, \`y\`, \`w\`, \`h\` (its box on the stage, nothing overlapping), \`rank\`, \`tier\` (0 biggest, 2 smallest), \`shown\` (false when it cannot fit even small) and its own other fields. Options: \`minSize\`, \`maxSize\`, \`scale\` ("sqrt", "linear" or "log"), \`gap\`, \`grow\`, \`max\`, \`minCount\` and \`blocked\` (a list of words to leave out). The same words always make the same cloud |
| \`timelineLayout(events, eras, from, to, options, part)\` | A dated timeline for the years \`from\` to \`to\`. Events are rows \`{date, end, title, ...}\` with dates written 1969, 1969-07 or 1969-07-20 (an \`end\` makes a range, counted to the end of its period); eras are \`{name, from, to}\`. \`part\` picks the list you get back: "events" (the default: each with \`pos\` and \`pos2\` along an axis \`options.length\` px long, \`lane\`, \`labelled\`, \`labelPos\`, \`labelW\`, \`labelH\`, \`dateText\`, \`spoken\`, \`inView\` and \`eraName\`), "eras", "ticks", "marker" (no row or one) or "info" (one row: \`rangeText\`, \`unlabelled\`, \`earlier\`, \`later\`, \`problems\`). Options: \`length\`, \`orientation\`, \`labelSize\`, \`lanes\`, \`sides\`, \`dateLine\`, \`maxLabel\`, \`columnWidth\`, \`maxLines\`, \`gap\`, \`tickSpace\` and \`marker\`. Labels never overlap and a leader line never crosses another label |
| \`timeBounds(events, eras, marker)\` | \`[from, to, span, count]\`: the whole years that hold every event, era and marker, with room at each end |
| \`wordCount(text)\` | How many words a text has (runs of anything but spaces). \`wordCount("one two  three")\` is 3 |
| \`band(value, thresholds, labels)\` | A label for where a value falls. Thresholds go from the highest down and there is one more label than thresholds: \`band(score / total, [0.75, 0.5], ["Great", "Good", "Keep going"])\` |
| \`clock(seconds)\` | Seconds as \`m:ss\` (\`h:mm:ss\` from an hour): \`clock(95)\` is \`1:35\` |
| \`shuffle(list, seed)\` | The list in a new order. Give a seed (a number) to get the same order every time |
| \`randInt(a, b)\` | A whole number from \`a\` to \`b\`, both included. \`randInt(6)\` is 0 to 6 |
| \`includesAll(list, items)\`, \`includesAny(list, items)\` | Whether the list (or text) has every one of the items, or at least one, ignoring capitals: \`includesAny(answer, ["cat", "kitten"])\` |
| \`enums.name\` | The options of a choice variable |
| \`instanceInput(layer, name)\` | The current value of a variable inside an [instance](instances) layer (by name or id) |
| \`artboard.width\`, \`artboard.height\` | The artboard's size (and \`artboard.name\`), in the same units as a layer's X and Y, whatever size the player is shown at |
| \`self\` | In a [binding](bindings) (and its converters): the layer it's on. \`self.width\`, \`self.opacity\`, \`self.text\`, any plain setting it has, and for a video \`self.time\`, \`self.duration\`, \`self.playing\`, \`self.ended\` and \`self.rate\` |
| \`layer(name)\` | The same for any layer, by name or id: \`layer('Knob').width\`. X and Y are inside its parent, as in the Inspector |

## What you can write
Expressions are read by a small interpreter, not run as JavaScript, so a project can't use them to reach the page. These work:

- **Values**: numbers (\`12\`, \`.5\`, \`1e3\`, \`0xff\`), text in \`"…"\`, \`'…'\` or backticks with \`\${…}\` slots, \`true\`, \`false\`, \`null\`, \`undefined\`, lists \`[1, 2, ...more]\`, objects \`{a: 1, b}\`, and patterns \`/regex/flags\`.
- **Operators**: \`+ - * / % **\`, \`== != === !==\`, \`< > <= >=\`, \`&& || ??\`, \`!\`, \`typeof\`, \`in\`, \`a ? b : c\`, bit operators, and \`,\` inside brackets.
- **Looking inside**: \`a.b\`, \`a[b]\` and \`a?.b\`. Only the values you put there are readable: your variables, data, \`artboard\`, \`self\`, what \`layer()\` gives and \`item\`, \`event\`, \`value\`; \`__proto__\`, \`constructor\` and \`prototype\` never are.
- **Calls**: the helpers above, \`Math.*\`, \`Number\`, \`String\`, \`Boolean\`, \`parseInt\`, \`parseFloat\`, \`isNaN\`, \`JSON.parse/stringify\`, \`Object.keys/values/entries\`, \`Array.isArray/from\`, \`Date.now()\` and \`new Date(…)\`, and the usual methods of text (\`slice\`, \`split\`, \`replace\`, \`padStart\`, \`toUpperCase\`…), numbers (\`toFixed\`, \`toLocaleString\`…), lists (\`map\`, \`filter\`, \`find\`, \`some\`, \`every\`, \`reduce\`, \`join\`, \`includes\`, \`slice\`, \`sort\`…) and dates.
- **Arrow functions** for those list methods: \`x => x * 2\`, \`(a, b) => a + b\`. They take plain names and an expression, not a block.

These don't: assignment (\`=\`, \`++\`), statements, \`function\`, \`this\`, loops, \`window\`, \`document\`, \`fetch\`, \`eval\`, and list methods that change a list in place (\`push\`, \`splice\`; \`sort\` and \`reverse\` give a sorted copy and leave the list alone). A slot that can't be read or fails is left as written in text and gives nothing elsewhere. Very large lists or text, and expressions that run for very long, are cut off.

## Patterns (regular expressions)
A \`/pattern/flags\` works with \`match\`, \`matchAll\`, \`search\`, \`replace\`, \`replaceAll\`, \`split\`, \`.test(text)\` and \`.exec(text)\`. Some patterns can make a browser freeze on the wrong text (a pattern like \`(a+)+$\` takes twice as long with every extra character), so patterns are checked before they run. A pattern is refused, with a message, when:

- it has a **backreference** (\`\\1\`, \`\\k<name>\`);
- a **repeated group contains another repetition**: \`(a+)+\`, \`(\\w+\\s?)*\`, \`(.*x){5}\`. Write it flat instead, for example \`[a-z]+\`;
- a repeated group has **alternatives that can start the same way** (letters that differ only in case count as the same with the \`i\` flag), or an alternative that begins with an optional part, or any optional part at all: \`(a|aa)+\`, \`(a|A)+\` with \`i\`, \`(a?b|b)+\` are refused, \`(cat|dog)+\` is fine;
- a repeated group has **more than one optional part**, or one that could also begin the group: \`(a?b?)+\`, \`(\\d\\d?)+\`; \`(\\d{3}-?)+\` is fine;
- the parts that **vary in length but are not open-ended multiply up** past 65,536: \`a?a?a?...\` thirty times followed by thirty \`a\`, or \`a{0,30}\` six times in a row;
- it has **more than 3 open-ended repetitions** (\`*\`, \`+\`, \`{n,}\`) or is **over 300 characters**.

The text a pattern runs over is limited too: 10,000 characters for a pattern with no more than one open-ended repetition, 1,000 with two and 200 with three. Patterns with bounded repetitions such as \`\\w{0,50}\` get a shorter limit still. Longer text gives an error rather than a freeze. Text you pass to \`match\`, \`matchAll\` and \`search\` is a pattern and follows the same rules; to \`replace\`, \`replaceAll\` and \`split\` it is plain text. The rules are cautious on purpose: some harmless patterns, like \`(\\.[a-z]+)+\`, are refused too.

A pattern that gets past these rules still never runs in the browser's own pattern engine, which can't be stopped once it is going. The player runs it with its own matcher, which remembers every place it has been and never works through the same one twice, so how a pattern is written can't make it slow, and each match has a time allowance (and so do all the matches in a page together, such as one pattern run over every row of a long list). A match that uses its allowance gives an error like the other refusals, instead of freezing the page. The matches are the same ones the browser would find (greedy and lazy, groups, \`$1\` and \`$<name>\` in replacements, lookahead and lookbehind, the \`i\`, \`m\`, \`s\`, \`u\`, \`g\`, \`y\` and \`d\` flags). The one difference: the text a group inside a lookbehind (or inside a repeat that can match nothing, \`(a*)*\`) captures can differ in rare corner cases.

In a text layer, a slot whose pattern is refused (or whose text is too long for it) is left as written, braces and all, as in the last line below; elsewhere it gives nothing.

![Three text slots with patterns: the first two work, the third, with a nested repetition, is refused and left as written.](help/patterns-refused.png)

> Expressions are for values. For several steps, waiting or loops, use a [script](scripts).`,
  },
  {
    id: 'bindings',
    title: 'Bindings',
    group: 'Interactivity',
    summary: 'Tie a layer property to a variable: in (the variable sets it), out (it sets the variable) or both ways.',
    keywords: 'bind binding data binding property drive reactive two-way both ways out in video position playing length drag x y attribute scrub artboard size width layer',
    body: `A binding sets a layer's property from an [expression](expressions), and keeps it up to date as variables and data change. In the **Data bindings** section of the Inspector, press **+ Add binding** (or the **+** in the section's header) and pick the property; type in the search box at the top to find it quickly (*opa* finds Opacity).

Each binding then says where its value comes from:
- **Variable**: pick a variable from the list (search it by name), or **+ New variable…** at the bottom of the list to make one. The property takes that variable's value as it is.
- **Formula**: work the value out from variables, for example \`lives > 0\` for *Visible*, or \`progress * 3\` for *Width*. As you type it suggests your variables, \`context\`, \`self\` and the helpers (see [Expressions](expressions#suggestions-as-you-type)).

Under it, **+ Convert…** changes the value on its way, and the grey line at the bottom works the whole thing through with every variable at its starting value: *value2 is 1 → Look up: no line for 1, so it stays 1 → Opacity is set to 1*. If a binding doesn't do what you expect, that line shows where it goes another way. Bindings are separated by a short rule; the bin removes one.

![The Data bindings section: a binding on the fill colour, and the + Convert… menu.](help/bindings-section.png)

Examples:

| Property | Expression |
|---|---|
| Width | \`progress * 300\` |
| Fill colour | \`correct ? "#2e7d32" : "#c62828"\` |
| Visible | \`step === 3\` |
| Text | \`products[0].name\` |
| Rotation | \`speed * 3\` |
| Solo: active child | \`mode\` (a choice whose options are the children's names) |

A bound property shows a link icon and can't be changed by hand or keyframed until you remove the binding. Every animatable property can be bound (see [Animatable properties](animatable-properties)), and so can every other plain setting the layer has, such as a video's **Autoplay** or **Src**, or a polygon's sides. A video layer also lists **Playback position (s)**, **Playing**, **Length (s)** and **Ended**, which come from the video itself.

## Which way: in, out or both
Each binding has **← In**, **Out →** and **⇄ Both** at the top.
- **In** (the usual): the variable or formula sets the property, as above. The formula can read the layer it's on as \`self\`: \`self.width / 2\` for a height, \`self.time / self.duration\` on a video for how far through it is. \`self\` is the layer before its own bindings apply, so a binding never reads its own result. On the editing canvas a video has no time or length yet. On a video's **Playback position** and **Playing** it seeks, plays or pauses the video whenever the formula's value changes, and leaves the video alone while it doesn't, so it still plays on by itself.
- **Out**: the property's value is written into a variable whenever it changes, and nothing sets the property from it. Use it to *read* something: a draggable layer's **X** as it is dragged, a video's **Playback position**, a timeline-animated **Opacity**. Read-only attributes (a video's **Length**, **Ended**) can only go out.
- **Both**: the property and the variable are kept equal. At the start the property takes the variable's value; after that, change either one and the other follows. A slider bound to the same variable as a video's **Playback position** both shows the position and scrubs the video; setting a video's **Playing** to false pauses it.
- An **Input field**'s **Value** is the common case for Both: typing writes the variable and the variable fills the box (the **Bind to a variable…** button in the Input section adds exactly this). Out leaves the box showing its own text.
- A **draggable** layer with its X or Y bound **In** never tells the variable it moved, so a Save user data or a remembered variable keeps the old value. Bind it **⇄ Both** to save where the learner left it; the Bindings section says so and has a button for it.

Out and Both name a variable (no formula, no converters), and the grey line says what will happen in words.

The value is made to fit the property (settings that can't be animated, like a video's **Loop**, go by the type they already have): a number property takes a number (\`true\`/\`false\` become 1/0, numeric text is read) and is left as it was if the expression gives something that is not a number; a true/false property takes a boolean; text and colour properties take text.

## Converters
Under a binding, the **+ Convert…** menu changes its value before it is set. They run in order, so a few can be chained.

| Converter | Does |
|---|---|
| Number to text | Decimals, thousands separators, zero padding, text before and after: \`$1,234.50\`, \`42%\` |
| Round | Round, floor or ceil to some decimals |
| Invert (not) | true/false flipped (a number becomes 1 - x) |
| Remap range | One range onto another, optionally kept inside it: 0-1 to 0-100 |
| Look up | A value to anything else. Bound to a **choice** variable, it lists every option for you to fill in. *Otherwise* is used for values not listed |
| To number / text / true/false | Change the type |
| Seconds to m:ss | A number of seconds as a clock, \`95\` becomes \`1:35\` |
| Expression | Any [expression](expressions), with \`value\` as the incoming value |

Anything a converter does can also be written straight into the expression with the helpers (\`fmt\`, \`remap\`, \`lookup\`…), which is what to use in text \`{slots}\`.

Choices and lists work with bindings like any other value: bind a fill colour to a choice through a *Look up* converter, a text layer to \`people.length + " people"\`, or a [repeater](repeaters) to a list variable. Importing a Rive file turns its data bindings on layers into bindings with converters, and its view models into shared variables (see [Importing](import)).`,
  },
  {
    id: 'scripts',
    title: 'Scripts',
    group: 'Interactivity',
    summary: 'JavaScript with the ix API, run safely in a sandbox.',
    keywords: 'script javascript code ix api sandbox quickjs wasm onframe animate await',
    body: `Scripts are JavaScript for what the nodes can't do. Add them in the **Scripts** tab. A script runs on start (tick **Run on start**) or from a **Run script** node; short code can go straight into a **Run code** node.

\`\`\`
const ball = ix.node('Ball');
ix.onFrame((dt) => ball.set('x', (ball.get('x') + dt * 0.1) % ix.artboard.width));
ix.on('reset', () => { ix.vars.score = 0; });
await ix.node('Title').animate('opacity', 1, { duration: 600, ease: 'easeOut' });
\`\`\`

## The ix API
| Call | Does |
|---|---|
| \`ix.vars.name\`, \`ix.get(name)\`, \`ix.set(name, v)\` | Read and write variables (not a live one: those are worked out from their formula and read only) |
| \`ix.reset(name, ...)\` | Put variables back to their starting values |
| \`ix.toggleItem(name, v)\`, \`ix.removeValue(name, v)\`, \`ix.setItem(name, index, v, field?)\` | Change a list variable: add or take out a value, take out every match, or replace one item (or one field of it) |
| \`ix.node('Name')\` | A layer by name or id: \`.get(prop)\`, \`.set(prop, v)\`, \`.show()\`, \`.hide()\`, \`.toggle()\`, \`await .animate(prop, v, {duration, ease})\` |
| \`ix.timeline('Name')\` | \`.play()\`, \`.pause()\`, \`.stop()\`, \`.restart()\`, \`.reverse()\`, \`.seek(ms)\` |
| \`ix.goTo('Artboard', 'fade')\` | Go to another artboard |
| \`ix.emit(name, data)\` / \`ix.on(name, fn)\` | Send messages to the host page / react to them |
| \`ix.announce(text, 'polite' | 'assertive')\` | Say something to screen readers (see [Accessibility](accessibility)) |
| \`ix.soundPlaying(name?)\` / \`ix.soundsPlaying()\` | Is a Play sound sound going (any, or one asset by name or id), and the names of the ones going |
| \`ix.setTheme(name)\` / \`ix.getTheme()\` / \`ix.themes()\` | Show a [theme](themes) by name (\`'auto'\` follows the viewer), read the one showing, list them |
| \`ix.record(name, value?)\` | Count that something happened, for [Insights](insights) (a name up to 60 characters, a short value) |
| \`ix.setInstanceInput(layer, name, v)\` / \`ix.getInstanceInput(layer, name)\` / \`ix.fireInstanceTrigger(layer, name, data)\` | Set or read a variable inside an [instance](instances), or send a message into it only |
| \`ix.onFrame((dt, t) => …)\` | Run every frame |
| \`ix.pointer\`, \`ix.artboard\` | Pointer \`{x, y, down}\`, artboard \`{name, width, height}\` |
| \`ix.data.name\`, \`await ix.loadData(name)\` | Data sources |
| \`ix.context.firstName\`, \`ix.context.courseCode\`, \`ix.context.isStaff\` | The course and learner, read only ([Course and learner context](course-context)) |
| \`ix.setCursor('grab')\`, \`ix.log(…)\` | Cursor, logging |

\`.set()\` and \`.animate()\` change the properties in the [Animatable properties](animatable-properties) (position, size, colour, text, visibility, link URL…) and a layer's \`fill\`, \`stroke\`, \`shadow\` and auto layout. Anything else, such as an embed's \`html\`, \`className\`, \`bindings\` or a layer's \`repeat\`, is part of how the project was built: the call throws an error saying so. Links only go to \`http(s)\`, \`mailto\`, \`tel\` or relative addresses.

To paint a layer from a script every frame (generative art, particles, charts), use a [Script layer](script-layers).

## The sandbox
New projects run scripts in a sandbox: a separate JavaScript engine compiled to WebAssembly. Scripts there can only use \`ix\`, timers and \`console\`, with no access to the page, cookies or the network (use [data sources](data-sources) for data). A script that runs too long without yielding is stopped. One thing the sandbox does not hide: \`ix.loadData(name, url)\` fetches the URL the script gives it, from the viewer's browser, so a script can read from, and send data to, the network that way. It follows the project's [data rules](data-sources#what-may-be-loaded): http(s) only, no cookies to other sites, and, if you list **Allowed data hosts** in Project settings, only those hosts. A refused URL makes \`loadData\` throw, so use \`try\`/\`catch\`. Without an allowed-hosts list, only run projects whose scripts you trust. Turn **Run scripts in the sandbox** off in Project settings only for code you trust that needs the page (\`node.element\`, \`fetch\`).`,
  },
  {
    id: 'script-layers',
    title: 'Script layers',
    group: 'Interactivity',
    summary: 'A layer painted by a script every frame: generative art, particles, charts and custom visualisations.',
    keywords: 'script layer draw canvas generative art particles chart graph visualisation visualization animation code g.rect g.circle fps pixel ratio sandbox',
    body: () => `A **Script layer** is a box that a script paints every frame. Use it for things shapes and timelines can't do well: particles, generative art, live charts, custom meters and any other visualisation that is easier to compute than to draw by hand.

Pick the **Script layer** tool (in the **Media** group of the tool bar, which starts folded: click **Media** to open it) and drag a box. It starts with a small script that already runs, and the **Start from** menu in the inspector replaces it with a starter: ${DRAW_TEMPLATES.map((t) => `**${t.name}**`).join(', ')}.

## The script

\`\`\`
// Anything declared outside the functions keeps its value between frames
const dots = [];

function setup(g) {
  for (let i = 0; i < 50; i++) dots.push({ x: g.random(g.width), y: g.random(g.height) });
}

function draw(g, t, dt) {
  g.clear('#10131a');
  g.fill('#6f8cff');
  for (const d of dots) g.circle(d.x, (d.y + t * 20) % g.height, 3);
}
\`\`\`

- \`draw(g, t, dt)\` runs every frame. **t** is seconds since the layer started and **dt** is seconds since its last frame.
- \`setup(g)\` is optional and runs once first.
- The layer is **cleared before every frame**, so draw everything each time. Keep animation state in variables outside \`draw\`.
- Coordinates are layer pixels, 0,0 at the top-left of the box. Resize the layer and \`g.width\` and \`g.height\` follow.
- Read project variables and data with \`ix.vars.name\` and \`ix.data.name\`, as in any [script](scripts). A bar chart can read a list variable, a meter a number. A script layer reads the project; it can't move other layers.

## The drawing API

\`g\` is a small recorder, not a canvas: each call adds a drawing command, and the player paints the list onto a real canvas. Fill and stroke are set first and then used by the shapes that follow.

| Call | Does |
|---|---|
${DRAW_API.map(([sig, what]) => `| \`${sig.replace(/\|/g, '\\|')}\` | ${what.replace(/\|/g, '\\|')} |`).join('\n')}

## Settings

- **FPS**: a frame rate cap. 0 draws on every frame; 30 is plenty for most charts.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the artboard's scale, up to 3. A fixed number is sharper but slower; very large layers are held to what the browser can allocate.
- **Paint while editing**: draws a single still frame on the canvas, at the timeline's time (0 when no timeline is showing), so you can lay out the artboard. Turn it off for a heavy script; the layer then shows as a placeholder. **Preview** always runs it.

The layer is an ordinary layer otherwise: move, rotate, fade, blend, mask and animate it, and click it with an **On pointer** event. Inside the script, \`g.pointer\` gives the pointer in the layer's own pixels (\`x\`, \`y\`, \`down\`, \`inside\`), correct even if the layer is rotated or inside a group.

## Errors and limits

- The script runs in the [sandbox](scripts) when the project has **Run scripts in the sandbox** on (the default): no page, network or storage access, and a frame that takes more than about 100 ms is stopped. Without the sandbox bundle the layer shows nothing.
- An error in the script **stops that layer only**. The message shows under the code, in the layer on the canvas, and in the Preview's event list. Edit the code to start it again.
- A frame is limited to 20,000 drawing commands. Past that, the rest are dropped and a warning is shown. Join many segments into one path with \`g.path\`.
- \`g.random()\` is seeded: the layer draws the same numbers on every run. Call \`g.seed(1)\` at the start of \`draw\` for a picture that stays the same from frame to frame.`,
  },

  {
    id: 'shader-layers',
    title: 'Shader layers',
    group: 'Interactivity',
    summary: 'A layer painted by a GPU shader: clouds, plasma, ripples, glows, distortion of pictures, and your own GLSL.',
    keywords: 'shader glsl webgl gpu fragment effect filter noise clouds plasma ripples glow voronoi grain crt scanlines halftone wave distortion uniform u_time u_mouse u_resolution preset image texture bloom',
    body: () => `A **Shader layer** is a box painted by a small program that runs on the graphics card for every pixel, many times a second. Use it for backgrounds that move, glows, noise, ripples and distortions of pictures: effects that shapes and timelines can't do.

Pick the **Shader layer** tool (in the **Media** group of the tool bar, which starts folded) and drag a box. It starts with drifting clouds, so you have a result at once. The **Start from** menu in the inspector replaces the shader with a preset: ${SHADER_PRESETS.map((p) => `**${p.name}**`).join(', ')}. The presets marked *(image)* filter a picture: choose an image for their \`u_image\` uniform (until you do, they show a built-in test picture).

## The code

You write one function. Everything else (precision, the built-in values, your uniforms) is added for you.

\`\`\`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / u_resolution;          // 0 to 1 across the layer, y up
  float glow = 0.5 + 0.5 * sin(u_time * speed + uv.x * 6.0);
  fragColor = vec4(tint.rgb * glow, 1.0);      // straight alpha
}
\`\`\`

- \`fragCoord\` is the pixel being painted, in canvas pixels with the origin at the **bottom-left**. \`fragColor\` is the colour to paint, with **straight** (not premultiplied) alpha.
- It is GLSL ES: WebGL 2 (ES 3.00) when the browser has it, otherwise WebGL 1 (ES 1.00). Write code that works in both: \`texture2D\` and \`texture\` both work, and loops need constant limits.
- Don't write \`main\` or declare \`uniform\`s for the built-ins: the player does.

## Built-in values

| Name | What |
|---|---|
| \`u_time\` | Seconds since the layer started. Frozen for viewers who prefer reduced motion. |
| \`u_resolution\` | \`vec2\`: the canvas size in pixels. |
| \`u_mouse\` | \`vec3\`: the pointer over the layer, x and y from 0 to 1 (y up), z is 1 while the button is down. Correct even if the layer is rotated or inside a group. |
| \`u_frame\` | Frames drawn so far. |
| \`v_uv\` | \`vec2\`: 0 to 1 across the layer, y up. |

## Uniforms: your own values

The **Uniforms** list gives the shader values you can change. Press **Add a uniform**, choose a type, and give it a **name**: that name is a variable in the code. Types: **Number** (a \`float\`), **Vector 2**, **Vector 3** and **Vector 4** (\`vec2\`, \`vec3\`, \`vec4\`), **Colour** (a \`vec4\` of red, green, blue and alpha, 0 to 1) and **Image** (a \`sampler2D\`, with \`name_size\` as a \`vec2\` of its pixel size, 0 until it has loaded).

- **Animate** them: the **◆** beside a value keys it at the playhead on the timeline. A vector keys each part (x, y, z, w) on its own track, a colour fades between colours, and an image uniform switches picture at each key. The tracks are \`uniforms.<number>.value\`, and \`uniforms.<number>.value.<part>\` for the parts of a vector, counting from 0 in list order.
- **Bind** them to variables in **Data bindings**: pick the uniform from the property list (for example *Uniform speed*) and type an expression, such as \`score / 100\`.
- A name has letters, digits and underscores, can't start with a digit, and can't be a built-in or a GLSL word. A uniform with a bad name is left out and the inspector says why.
- Removing a uniform also removes the tracks and bindings that were aimed at it, and the ones after it move up.

## Settings

- **FPS**: a frame rate cap while it animates. 0 draws on every frame.
- **Pixel ratio**: canvas pixels per layer pixel. **Auto** follows the screen's density and the artboard's scale, up to 2. Shaders cost time for every pixel, so a layer is held to about 4 million pixels however large it is: past that it is drawn smaller and stretched.
- **Animate while editing**: runs the shader live on the editor canvas. Off (the default) paints one still frame at the timeline's time (0 when none is showing), which keeps editing smooth. **Preview** always runs it.

## Errors

If the shader doesn't compile, the layer shows a placeholder and the inspector lists each problem with its **line number** in your code; those lines are marked in the editor. The same messages appear in Preview's event list. Other layers carry on. Fix the code and the shader starts again.

## Limits and performance

- All shader layers on a page share **one WebGL context**, so the browser's limit on contexts doesn't apply. Each layer is limited to 24 on a page; extra ones show a placeholder and a warning.
- A shader is **paused while it is off screen** or the browser tab is hidden. A shader that reads neither \`u_time\` nor \`u_mouse\` (it only uses its uniforms) is drawn only when something changes.
- Without WebGL (some remote desktops and very old devices) the layer shows a placeholder and says so.
- **Pictures** you use as image uniforms must come from your project's assets (or a site that allows it); a picture the browser won't hand to WebGL is skipped with a warning.
- **Export**: shader layers work in the single-file export, **.ixp** packages and the embeddable player. A **PNG or SVG picture** of an artboard shows the layer's current frame (at the timeline's time, or 0), not a running animation.

## Shader filter on an image

An **image** layer can draw itself through a shader: **+** in **Effects**, then **Shader filter**. It has the same code editor, uniforms and settings, and \`u_image\` (the layer's own picture, with its fit applied) and \`u_image_size\` are ready to use. The plain picture shows until the shader has drawn, and again if it fails. This works for **image layers only** (not with a 9-slice); other layers can't be filtered this way. To run a shader over something else, make it a **Shader layer** with an image uniform.`,
  },

  {
    id: 'progress-bars',
    title: 'Progress bars',
    group: 'Interactivity',
    summary: 'A bar that fills to a value: scores, steps and timers, with a screen reader role and spoken value.',
    keywords: 'progress bar meter gauge value max fill track percent score steps timer aria progressbar',
    body: `A **Progress bar** layer is a track with a bar that fills it up to a **value** out of a **max**. Use it for a score, the step someone is on, a countdown, or how much of a list is done. It replaces the pair of rectangles and the width formula that bars used to be made from, and unlike them it can tell a screen reader what it is.

Pick the **Progress bar** tool (in the **Data** group of the tool bar, which starts folded) and drag a box, or right-click the canvas and choose **New**, **Progress bar**. It starts at 40 of 100.

## Value and max

- **Value** and **Max** in the *Progress bar* section are the numbers. A value past either end is held at it: 150 of 100 is a full bar, below zero is an empty one.
- To make the bar follow something, open **Bindings**, add *Value* and write an expression: \`score\`, \`step / 5 * 100\`, \`timeLeft\`. *Max* can be bound too, so \`questions.length\` can be the whole bar.
- **Value** can be keyed on a [timeline](timelines) (the **\u25c6** beside it), set by a **Set property** or **Animate property** node (pick *Progress value* in the list), or by a script with \`ix.node('Bar').set('value', 60)\`. Animate it from 0 to 100 over a few seconds and you have a countdown.

## Look

- The **track** is the layer's own **Fill** (shown as *Track fill*) and **Stroke**: any colour, gradient, token or several paints, a stroke around it, a shadow. The **bar** is the **Bar** paint in the progress section. Both can use [theme tokens](themes), so a bar restyles with the theme and the colourway.
- **Direction** is *Across* (it grows from the left) or *Up* (from the bottom). **From the far end** grows it from the right, or the top, instead.
- **Radius** rounds the track, and the bar is clipped to it. A gradient bar is laid over the whole track and uncovered as the bar grows, so a green-to-red meter shows red only when it is nearly full.

## For screen readers

**Tells screen readers** chooses what the layer is: a **progress bar** (work towards a goal), a **meter** (a measurement in a range, like volume) or nothing. The first two put \`role\` and \`aria-valuenow\`, \`aria-valuemin\` (0), \`aria-valuemax\` and \`aria-valuetext\` on the layer, kept up to date as the value changes. Give the layer a **text alternative** in *Accessibility* ("Course progress"): the [checker](accessibility-checker) asks for one. A layer marked **Decorative** is hidden from screen readers whatever this says.

**Spoken value** is what is read out for the number. Blank says the percentage ("40%"). Write your own with \`{value}\`, \`{max}\`, \`{percent}\` and any variable: \`Step {step} of 5\`. A max of 0 or less makes the bar indeterminate: it has no value to announce.

## Where it works

Progress bars draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of an artboard. They are **not** part of a Lottie export (the export lists them as left out).`,
  },
  {
    id: 'charts',
    title: 'Charts',
    group: 'Interactivity',
    summary: 'Column, bar, line, pie and donut charts drawn from a list, with an axis, a legend, a hover readout, keyboard reading and a table for screen readers.',
    keywords: 'chart graph bar column line pie donut data visualisation axis legend gridlines tooltip readout colours table accessible event index',
    body: `A **Chart** layer draws a chart from a list: sales by month, a quiz score breakdown, answers from a poll. It scales its axis to the data, restyles with the theme, can be read with the keyboard, and gives a screen reader the numbers as a table.

Pick the **Chart** tool (in the **Data** group of the tool bar, which starts folded) and drag a box, or right-click the canvas and choose **New**, **Chart**. It starts as a column chart of four made-up items so there is something to look at.

## The data

**Data** is an expression that gives the list: a [list variable](variables) (\`scores\`), a [data source](data-sources) (\`sales\`), or one written out (\`[3, 5, 2]\`). Items can be:

- **numbers**: \`[3, 5, 2]\`, labelled 1, 2, 3;
- **objects**: \`[{label: "Mon", value: 4}, ...]\`. **Label key** and **Value key** say which fields to use; left blank the chart looks for \`label\`, \`name\`, \`title\` or the first text, and \`value\`, \`y\`, \`count\` or the first number;
- **pairs**: \`[["Mon", 4], ["Tue", 8]]\`;
- **one object**: \`{Mon: 4, Tue: 8}\`.

Anything that is not a number counts as 0. A chart draws up to 200 items.

## Hiding a value

An object item with \`hidden: true\` is a placeholder, for a guessing page where one bar is the answer: \`[{label: "Mon", value: 4}, {label: "Tue", hidden: true}, ...]\`. It is drawn as a dashed, empty mark with a **?** (even with **Value labels** off), and the hover readout, the screen reader and the table say *hidden* instead of a number. Put \`hidden\` on from a variable and the real bar can be revealed later by changing the data (\`hidden: !answered\`). **Hidden key** names another field to use instead of \`hidden\`.

A hidden item without a number of its own is left out when the axis is worked out, and shows as a slot the full length of the axis (a column or bar), a hollow point halfway up with a gap in the line (a line chart), and nothing in a pie or donut (it has no share). Give it a \`value\` as well and the dashed mark is drawn at that size and counts for the axis, which is how to show an outline of where the bar will land.

 Under the expression, a **preview** shows the first few items as the chart reads them (and what is wrong when it can't), using the project's variables at their starting values and the loaded data. The chart redraws when a variable or data source it reads changes.

## Kinds and look

- **Column** (vertical bars), **Bar** (sideways), **Line** (one point per item, joined), **Pie** and **Donut** (shares of the total; negative values count as 0; **Hole** sizes the donut's).
- The axis runs from zero (or lower, for negative values) to a round number above the biggest value. **Axis min** and **Axis max** fix either end.
- **Gridlines**, **Axis labels**, **Value labels** (the number on each mark) and **Legend** (when each item has its own colour) switch on and off. **Decimals**, **Prefix** and **Suffix** control how numbers are written (\`$\`, \`kg\`, \`%\`). Prefix and suffix take variables in braces (\`{unit}\`), so changing a unit variable relabels the whole chart. Crowded labels are shortened or thinned out.
- **Colours** is a list of colours or [theme tokens](themes) handed out in turn. With one colour every bar and the line use it; **A colour for each item** gives each item the next colour (pie and donut charts always do). **Text colour**, **Font** and **Size** style the labels and axes. Using tokens, a chart changes with the theme and the colourway like everything else.

## Reading it

- **Hover** a bar, slice or point to see a readout with its name and value. **Tab** moves into the chart and the **arrow keys**, **Home** and **End** move between items, with the same readout. **Enter** or **Space** clicks the item.
- Clicks, presses and hovers on a mark run **On pointer** nodes on the chart layer with \`event.index\`: the item's place in the list, from 0 (\`event.index\` is null away from the marks). **Pointer moves over it** gives it for each item you cross; **Hover start** only for the item you first entered. Arrowing between items fires **On focus** nodes with \`event.index\` too. So \`scores[event.index].name\` is the item that was clicked.
- A **Table for screen readers** (on by default) puts the same numbers in a table that only a screen reader finds, with a share column for pie and donut charts. Give the chart a **text alternative** in *Accessibility* that says what it shows ("Sales by month, 2026"): the [checker](accessibility-checker) asks for one. A chart marked **Decorative** is hidden from screen readers.
- **Grow in** makes columns and bars rise, slices and points pop, and a line draw itself, the first time the chart appears. Viewers whose device asks for less motion just get the chart (the project's *reduced motion* setting turns it on for you, as it does for animations).

## Where it works

Charts draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of an artboard (as they look when fully grown, without the readout). They are **not** part of a Lottie export. There is no 3D, stacking or mixing of kinds. For anything else, a [Script layer](script-layers) can draw whatever you like.`,
  },
  {
    id: 'connectors',
    title: 'Connectors',
    group: 'Interactivity',
    summary: 'Lines and arrows that join two layers and follow them: straight, elbow or curved, with arrow heads, a label, and one per item of a list.',
    keywords: 'connector connect line arrow join link edge flowchart mind map diagram elbow curved straight label follow snap side repeater links graph',
    body: `A **Connector** is a line or arrow that joins two layers and follows them. Move, resize, turn or animate either layer, change the screen size, or let a repeater or auto layout move it, and the connector re-routes by itself: you never position it. It is how the mind map and flowchart starters draw their lines, and it is what to use for any diagram where boxes are joined.

## Drawing one

Pick the **Connector** tool (<kbd>K</kbd>, in the **Draw** group) and drag from one layer to another. The layer under the pointer lights up with a dot on each side: let go near a dot and the end attaches to that **side**; let go anywhere else on the layer and it is **auto**, the side that faces the other end. Let go on empty canvas and that end is a **loose point** that stays where it was dropped. Hold <kbd>Shift</kbd> to keep the tool. The new connector is selected, with a gold handle on each end: drag a handle onto another layer to re-attach it.

You can also add one in the **Connector** section of the Inspector, which lists the layers on the artboard for each end.

## The Connector section

- **Route**: **Straight** goes edge to edge along the line between the two centres (round layers meet where the ellipse is, not where the box is), **Elbow** turns in right angles and goes round both layers instead of through them, with the fewest corners, and **Curved** leaves each side along its edge and bends smoothly.
- **Start** and **End** (under *On layer*): the layer, its **Side** (auto, top, right, bottom, left) and **Slide**, which moves the end along that side so two lines can leave the same side apart.
- **Ends**: a **Plain** end, an **Arrow** or a **Dot**, each end separately. **Cap size** is 0 to size them from the line's width. **Gap** stops the line short of each layer. **Corner radius** rounds an elbow's corners (and the label's background).
- **Label**: words on a background chip at **Position** (0 is the start, 1 the end). Variables work in braces: \`{score}\`. The label's background is the layer's **Fill**, its text colour and font are in the section.
- The line itself is the layer's **Stroke**: colour (a [theme token](themes) works), width, dash, round or butt ends. Animate **Trim end** from 0 to 100 to draw the line in.

A connector has no position or size to set: its box is the route. A connector is **hidden** while either layer is hidden or gone (the Inspector says when a layer is gone).

## Repeaters: one connector per link

A layer inside a [repeater](repeaters) has one copy per item, and a copy's number is its place in the list (from 0). Connect two copies with a **Which copy** expression on each end. Put the connector in a repeater of its own over a list of links, and the expression sees that link as \`item\`:

- the boxes: a group repeating \`nodes\`, with a box as its template (its first child);
- the lines: a group repeating \`links\` (\`[{from: 0, to: 2}, ...]\`) with one connector as its template. Its **Start** is the box, **Which copy** \`item.from\`; its **End** the same box, **Which copy** \`item.to\`.

Add a link to the list and a line appears; change a link and it moves. A link that names a copy that isn't there (an index past the end, or text) simply isn't drawn. When you drag the Connector tool onto a layer that is in a repeater, the end is made for you as copy 0.

## Reading it

A connector is **decorative**: screen readers skip it, and so does the keyboard. A diagram needs a text version, so give the page a plain alternative: a nested list for a mind map, a numbered list of steps for a flowchart. For one line that says something on its own, give the connector a **Text alternative** (Accessibility), such as "Yes leads to Book a room"; it is then read as a picture with that name. The label chip is part of the drawing and is not read separately.

## Where it works

Connectors draw in the editor, Preview, the single-file export, **.ixp** packages and the embeddable player, and in PNG and SVG pictures of an artboard. They are left out of Lottie files (the export says so). A connector takes no clicks or hovers; put the events on the layers it joins. An artboard with connectors is redrawn whole on each edit in the editor, which is still fast at diagram sizes.

## Starters that use them

The **Mind map** and **Flowchart** starters (Explore and reveal) draw all their lines with connectors, from lists: the boxes and the lines are each one repeater over a layout the [expression helpers](expressions) \`mindMap(...)\` and \`flowChart(...)\` work out, so adding an idea or a step to the list is all it takes. Each has a text version (an outline, a numbered list) for anyone who can't see the picture.

See also [Repeaters](repeaters), [Charts](charts) and [Accessibility](accessibility).`,
  },
  {
    id: 'usage',
    title: 'Usage: what uses what',
    group: 'Reference',
    summary: 'Find where an asset, variable, artboard, script, timeline or data source is used, and clear out what is not.',
    keywords: 'usage dependencies dependency graph unused references used by find remove cleanup orphan broken missing',
    body: `![The Usage tab: variables on the left, and what each one is used by on the right.](help/usage-tab.png)

The **Usage** tab (bottom panel) answers "what is this used by?" for the whole project, and shows what nothing uses.

Pick a group along the top (**Artboards**, **Assets**, **Variables**, **Data**, **Scripts**, **Timelines**, **Layers**) and an item on the left. The right side lists everything that uses it. **Click an entry to jump there**: layers are selected on the canvas, artboards and timelines are opened, and interactions open the **Interactions** tab on that node. Scripts and data sources open their tab.

A yellow **unused** flag marks items nothing refers to, and the number on each group is how many there are. Tick **Unused only** to list just those.

## What counts as a use

- **Assets**: image and video layers, image fills and strokes, cursor images, artboard backgrounds, fonts, data files and *Play sound* nodes.
- **Artboards**: instances, *Go to artboard* nodes, and being the start artboard.
- **Variables**: input fields bound to them, bindings, text and link templates (\`{score}\`), repeaters, joysticks, blends, instance inputs, and interaction nodes that name them or use them in an expression.
- **Data sources**: the same expressions, plus *Load data* and *On data loaded* nodes, and being a font or data file.
- **Scripts**: *Run script* nodes, or having *Run on start* ticked.
- **Timelines**: *Control timeline*, *On timeline end* and *On timeline marker* nodes, joysticks, blends, autoplay, and scripts that name them.
- **Layers** tab: layers that a constraint, a connector, an interaction node or a timeline track points at.

Uses found by reading script or *Run code* text are marked **?**. A name in code can match something that is not really a use, so check before deleting something that is used only by a **?**.

## Removing unused assets

**Remove unused assets** deletes every asset flagged unused, after a confirmation that lists them. It only ever touches assets, and the project text is searched for the asset's id before it is called unused. The removal can be undone with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, but the uploaded file itself is deleted from the server, so you would need to upload it again.

## Broken references

The **Broken** group lists references that point at something that has been deleted, such as a button that targets a layer that no longer exists. Click one to go to the thing holding the reference and fix it.`,
  },
  {
    id: 'themes',
    title: 'Themes and colour tokens',
    group: 'Design',
    summary: 'Name a colour once, give it a value for Light, Dark and High contrast, and let layers follow it.',
    keywords: 'link colours to tokens fixed plain colours switch does nothing theme themes token tokens colour color dark mode light high contrast prefers-color-scheme prefers-contrast forced colours moodle css variables bs-primary setTheme style styles palette contrast',
    body: `![The Themes tab: the starter tokens down the side with their Light, Dark and High contrast colours, and the contrast check.](help/themes-panel.png)

A **token** is a name for a colour, like \`color/primary\`. A **theme** (Light, Dark, High contrast) is a column of values for those names. A fill, stroke, gradient stop, shadow, text or rich text colour that **uses a token** changes when the theme does. A colour that is just a colour never changes. A **new project** starts with the three themes and the starter tokens already in it, the artboard on the Light background, and every layer you add follows the tokens, so it looks right in Dark and High contrast without you picking anything. Projects made before this, and imported ones, have none until you add them in the Themes tab, and behave exactly as before.


**The UniSQ colourways.** **+ Colourway…** in the Themes tab adds any of the branded starter packs' colourways (Gold, Purple, Blue, Green, Orange, Red) to this project as a theme: the starter tokens get its colours and its brand tokens (the gradient, deep, accent and logo colours) are added, so layers that use them follow it. A project with no themes yet can start from one. High contrast is the one every project already has.

**While it loads.** When a project has to wait before its first page shows (remembered progress or saved data coming from StudyDesk, a **Before activity loads** flow, the first page's fonts), a spinner appears after a quarter of a second, in the project's own colours: the **color/primary** token (or **color/button**) for the ring and **color/background** behind it, from the theme the viewer gets. A viewer who asks for less motion sees it pulse instead of spin. A quick start never shows it.
## The Themes panel
Open the **Themes** tab (bottom panel). A new project already has the starter themes. For one without (an older or imported project), **Add Light, Dark and High contrast** makes the three themes and the starter tokens, in the same look as the StudyDesk toolbox: its greys, and its gold for buttons with black, bolder text.
- **color/background**, **color/surface** and **color/surface-muted** are the page, a card and a hover or quiet grey. **color/text** and **color/muted** are the copy on them.
- **color/button** and **color/on-button** are the gold button and its black label. **color/primary** and **color/on-primary** are the accent for selections, which in the toolbox is the same gold. **color/link** is the toolbox's hyperlink blue, used by new Link layers.
- **color/border** is the outline of controls, **color/divider** a quiet line, and **color/focus** the keyboard focus ring. The ring is two tones: this colour, with a thin black or white halo either side of it (whichever is further from it, worked out for you), so it stays visible on a white page, a gradient and a dark panel alike. You only choose the one colour.
- **color/success**, **color/error** and **color/warning** each come with a **-surface** tint, for the right, wrong and missed answers.

**Toolbox colours come from the shared StudyDesk palette and stay in step with it.** Light is the toolbox exactly as the toolbox draws itself: each token takes the palette colour the toolbox uses for that job (cards are the palette's grey 1, text grey 7, outlines and quiet text grey 4, buttons the primary button colours, the accent and focus ring the primary gold), read from \`/styles/palette.min.css\`. A token made this way remembers the palette colour it came from, shown by a small link mark beside its colour. Whenever the editor opens the project it refreshes those colours from the live palette, and the player does the same when the page it runs in can reach \`/styles/palette.min.css\`, so a change to the palette reaches published pieces without re-editing them. **Change a colour by hand and that colour stops following the palette.** If the palette can't be reached (an exported file, offline, another host) the last stored colour is used. Dark and High contrast are built for contrast and take their colours from the same palette where it has suitable ones; a few tints and lighter or darker shades are mixed from two palette colours.

Dark and High contrast are the same names with values made for them. Then:
- Each row is a token, each column a theme. Click a colour to change it. **Used** counts the places that follow the token.
- **+ Theme** copies the default theme. **+ Token** adds a row. Rename either; layers keep following a renamed token.
- A theme can answer to a **Light** or **Dark scheme**, be marked **High contrast**, and be the **Default**. These decide which theme a viewer gets (see below).
- **Showing** (and the theme box in the top bar) picks the theme the canvas draws while you edit. It is not saved with the project. Pictures, SVG and PNG exports, and Lottie, write the colours of the theme being shown.
- **Convert colour styles to tokens** makes a token from every colour style, with its colour in every theme to start with. Layers that follow a style keep following it, now through the token. Styles from a library convert too, and a library update keeps the link.
- **Update starter colours** shows on a project made before this look that still has the old starter tokens. It gives the tokens you never edited the new values and adds the ones the project lacks. Layers that follow those tokens change with them; plain colours and tokens you edited do not. Nothing changes until you press it.
- The count at the top says how many plain colours are **not following a theme**, with a **Link colours to tokens** button beside it (see below).

## Using a token
In any colour picker in the inspector, open the arrow beside the swatch and choose the **Tokens** tab. Pick a token and the swatch shows a ring and link badge, and a one-line named chip replaces the hex box. Hover the chip to read the token's value in each theme. The **x** on the chip **detaches** it: the colour as it is now stays, as a plain colour. Choosing any other colour does the same.

## When switching the theme changes nothing
A theme can only change a colour that follows a token. A project built with plain colours (an imported file, or one made before the themes were added) has nothing to change, so the Light, Dark and High contrast switches, on the canvas, in Preview and in the Themes tab, all look the same. When that is the case you see a line, **Nothing here follows the theme: these colours are fixed**, with a **Link colours to tokens** button.

**Link colours to tokens** (also in the Themes tab, and in the right-click menu of an artboard, where it covers just the selected artboards) goes through artboard backgrounds, layer fills, strokes, text and rich text colours, button, input and link colours, shadows and gradient stops. A plain colour that is exactly the colour of a token in the default theme (same alpha, \`#fff\` and \`#ffffff\` are alike) becomes that token. Before anything changes it says what it will do, like "Link 7 colours: 3 backgrounds, 2 fills, 2 text", and lists the colours that match no token. Those stay as they are: link them by hand from the picker's Tokens tab, or add a token with that colour and run it again. Undo (Ctrl+Z) takes the whole thing back in one step.

When two tokens have the same colour (the button and the primary, say) the layer's job decides: artboard backgrounds prefer \`color/background\` then \`color/surface\`, text prefers \`color/text\`, button fills \`color/button\`, button text \`color/on-button\`, strokes \`color/border\`. Anything else takes the first of them in the Themes tab. Layers that follow a colour style are left to the style (use **Convert colour styles to tokens**), library artboards are read-only, and the brand layers of a branded starter are skipped unless the power user override is on. Colours written inside a binding expression are not touched.

## New layers, questions and starters
A new button is gold with black, bolder text, an input has a grey outline, a shape is a neutral grey, text is the toolbox black. In a project that has the starter tokens, new layers, the [question kit](question-kit) and the step bar follow those tokens instead, so a new layer looks right in Dark and High contrast without you picking anything. In a project with no tokens they get the same colours as plain ones. The built-in [starters](templates) come with the themes and use the tokens.

## Imported files keep plain colours
Lottie, Rive, PSD, SVG and package imports bring their colours in as plain colours. Nothing guesses which colour "is" the primary. Mixing plain and token colours in one project is normal.

## Contrast
- The Themes panel checks the pairs that matter in every theme, by token name: **color/text** and **color/muted** on **color/background**, **color/surface** and **color/surface-muted**, **color/on-primary** on **color/primary**, **color/on-button** on **color/button**, each of **success**, **error** and **warning** on its surface, and **color/primary**, **color/border** and **color/focus** against **color/background** and **color/surface**. Dark and High contrast pass every one. **Light does not, and that is expected:** it is the shared StudyDesk palette as the toolbox uses it, and these pairs fall below WCAG AA in it: muted text on background 2.59:1, muted text on surface 2.38:1, muted text on muted surface 1.96:1, primary on background 1.75:1, link on background 3.60:1, link on surface 3.30:1, outline against background 2.59:1, outline against surface 2.38:1, focus ring on background 1.75:1, focus ring on surface 1.61:1, success on its surface 3.90:1, error on its surface 3.13:1, warning on its surface 2.67:1. The Themes panel and the [Accessibility checker](accessibility-checker) report them as they are and are not told to ignore them. Choose different colours for a piece that has to pass. A pair that is too low shows its ratio on the cell and in the list.
- The [Accessibility checker](accessibility-checker) checks text contrast in every theme, not only the one shown. A finding that starts "In Dark:" is about Dark. It offers no automatic fix for text that follows a token, since a fix would write a plain colour over the token.
- **Theme colour on a fixed colour** is a warning for text that follows a token but sits on a plain colour. The theme changes one and not the other, so white text on a plain white card goes unreadable in Dark.

## How the finished interactive picks a theme
In this order:
1. The page or a script chose one: \`player.setTheme('Dark')\`, \`ix.setTheme('Dark')\`, the **Set theme** action, or \`theme="Dark"\` on \`<interactives-player>\`. A message \`{ target: 'interactives', type: 'setTheme', theme: 'Dark' }\` to the single-file export does the same.
2. Otherwise, with **Follow the viewer's settings** on (the default): a **High contrast** theme for a viewer who asks for more contrast (\`prefers-contrast: more\`) or uses forced colours, a **Dark scheme** theme for \`prefers-color-scheme: dark\`, else the default theme. It changes live when the viewer's setting does.
3. \`"auto"\` or \`null\` in step 1 goes back to step 2.

\`player.getTheme()\` / \`ix.getTheme()\` give the name showing and \`ix.themes()\` the list. A \`themechange\` event (\`ix-theme\` on the element, with \`{ id, name }\`) says when it changed. The player's stage carries \`data-ix-theme\`.

**Preview** has a theme box (a theme, or follow the viewer), a **Viewer** box to pretend dark mode or more contrast is on, and, with the page option below, a **Host** box.

## Taking colours from the page
Tick **Map tokens from the page's CSS variables** and a token is read from a CSS variable on the page that holds the player before the theme's own value. The **Moodle** preset maps the starter names onto Bootstrap's: \`color/primary\` and \`color/button\` to \`--bs-primary\`, \`color/on-button\` to \`--bs-white\`, \`color/background\` to \`--bs-body-bg\`, \`color/text\` to \`--bs-body-color\`, \`color/muted\` to \`--bs-secondary-color\`, \`color/border\` to \`--bs-border-color\`, and so on. Type your own variable names (comma separated, tried in order) beside a token to map any other. A missing or odd variable just leaves the theme's colour, and only plain colours are accepted. A High contrast theme is never replaced by the page's colours. The player option \`hostVariables: false\` ignores all of this.

## Branded projects
A project made from a [branded starter pack](branded-starters) carries a theme for each UniSQ colourway (Gold, Purple, Blue, Green, Orange, Red) and High contrast. Its **Project** settings have a **Colourway** row that picks the default theme, and an option to let learners switch. Its layers can only use the project's tokens, so edit a colourway's colours here rather than typing a hex.

## Not yet
Tokens are colours only. Fonts, radii and spacing are not tokens. Colours inside script and shader layers, captions settings, and images do not follow themes. A keyframe that animates a colour between two token colours snaps instead of blending.`,
  },
  {
    id: 'accessibility-checker',
    title: 'Accessibility checker',
    group: 'Reference',
    summary: 'Find contrast, keyboard, label, autoplay and flashing problems per artboard, fix the safe ones, and export a report for sign-off.',
    keywords: 'accessibility a11y wcag contrast check checker audit screen reader keyboard aria label alt text description captions autoplay reduced motion flashing seizure target size report sign off compliance',
    body: `![The Accessibility tab: findings listed under their artboard on the left, and on the right what was found, why it matters, what to do and a fix button.](help/accessibility-checker.png)

The **Accessibility** tab (bottom panel) runs a set of automatic checks over the whole project and lists what it found, artboard by artboard. It is there so you find out while you are designing, not from an audit at the end.

**It lists checks found. It does not say the project is accessible or that it complies with WCAG.** Some problems cannot be seen by a program, and some checks cannot be sure; those come back as **to look at** and a person decides. What the checks cannot see is listed under [What it cannot see](accessibility-checker#what-it-cannot-see), and in every exported report.

## Reading the list

Each finding has a coloured dot:

- **Problem** (red): a check found a problem, for example grey text on white at 2.8:1 when it needs 4.5:1.
- **Probable** (amber): probably a problem, and a person decides, for example a picture with no description (it might be decoration).
- **To look at** (blue): the checker could not tell, for example text over a photo that is only partly dark, a video (it cannot hear captions) or embedded HTML.

Click a finding to **select the layer** (and open its artboard). The right side says what was found, with the numbers, **why it matters** to the person using the page in plain words, **what to do**, and which WCAG 2.2 success criteria it speaks to. The dots at the top are filters: click one to hide that group.

## The checks

| Check | Looks for |
|---|---|
| **Text contrast** | Text colour against what is behind it (in every [theme](themes) when the project has colour tokens): layers drawn under the text, solid fills, gradients (every stop must pass), pictures (sampled from the file) and the layer's own opacity. Normal text needs 4.5:1, large text (24 px, or 18.66 px and bold) needs 3:1. Rich text is checked run by run. |
| **Small text** | Text under 12 px on the artboard, counting the scale of any group it is in. This is a rule of thumb, not a WCAG number. |
| **Needs a mouse or touch** | A layer that reacts to a click, hover or drag, is not a Button or link, and has no *On key* interaction that does the same thing. |
| **No name for assistive technology** | Clickable layers, buttons, links and fields with no text and no ARIA label. A field named only by its placeholder is a probable problem. |
| **No description** | Pictures, videos and embedded pages with no ARIA label. Script and shader layers are listed to look at. |
| **Small click target** | Anything clicked or used that is under 24 by 24 px. |
| **Animation starts by itself** | Autoplay timelines when the project does not respect reduced motion. |
| **No way to pause moving content** | An autoplaying timeline that loops or runs over 5 seconds, with no *Control timeline* node set to pause, stop or toggle it. |
| **Video starts by itself** | Autoplay video with sound or without controls. Also a timeline that plays sound on its own when the viewer buttons are hidden and nothing mutes or pauses it. |
| **Flashing** | A timeline that makes a large layer (a tenth of the artboard or more) go bright and dark more than three times in a second. |
| **Video and narration need captions** | Narration on a timeline with no captions is an issue, and captions that cover under half of it a warning (music and effects are left alone; see [Narration, captions and transcript](captions)). A video layer with imported captions passes; one without is listed to look at, since a program cannot tell if the file has them, and it points you at [Describe what you see](describe-what-you-see) for the pictures (WCAG 1.2.5). Descriptions that run while a caption is showing, so the voice would talk over the speech, are a warning. |
| **Page title** | The project has no title. |

### How contrast is worked out

The checker does not take a screenshot. It reads the layers: the artboard background, then everything drawn before the text, in drawing order, at a grid of points over the part of the box the words fill. Where a gradient or a picture is behind the text it takes the range of colours there. If every point passes, there is no finding. If every point fails, it is a problem. If some pass and some do not, or the colour behind cannot be known (a video, a shader, a script layer, a blend mode, a freeform shape), it says **to look at** instead of guessing. Pictures are sampled from the asset file at a coarse resolution once they have loaded.

A binding or timeline that changes a colour while the page runs is not followed: only the starting colour is checked, and the finding says so.

## Fixing

When a fix is safe, the finding has a **Fix** button, and a green **fix** tag in the list.

- **Text contrast**: moves the text colour toward black or white by the smallest amount that passes. Not offered when the colour comes from a style, a binding, or a faded parent.
- **Small text**: raises it to 12 px. Check the layout around it.
- **Names and descriptions**: type the label and press **Apply** (or Enter). A layer name that reads like a name ("Logo") is offered as the starting text; "Rectangle 4" is not.
- **Autoplay**: turns on *Respect reduced motion*, mutes a video, shows its controls.
- **Page title**: uses the project name.

Every fix is one undo step. **Apply quick fixes** does every fix that needs no typing in the current list at once. Nothing is fixed behind your back.

## Marking reviewed

For a finding you have looked at and accepted ("it is decoration", "the captions are in the player"), use **Mark reviewed**. It leaves the finding out of the counts, and the report lists it with the date. The marks are kept in this browser, per project, and do not travel with the file.

## Exporting a report

**Export report** downloads one printable HTML page: a summary per artboard, every finding with why it matters and what to do, which ones were reviewed, the checks that ran, what was not checked, and a box to sign. **CSV** downloads the findings as a spreadsheet.

## What it cannot see

- Whether text is right: reading order, headings, plain language, the page language.
- Anything a script or code node does, and embedded HTML or pages.
- Whether a video has captions or audio description in the file itself, or whether a description says what is really on screen. It only sees the captions and descriptions you added here.
- Colour as the only way to tell things apart, and text that is part of a picture.
- Flashing that does not come from a timeline.
- Tab order and focus rings. Layer order sets the Tab order.

Test with a keyboard, a screen reader and your own eyes as well.`,
  },
  // ---------------------------------------------------------------- data
  {
    id: 'data-sources',
    title: 'Data sources',
    group: 'Data',
    summary: 'JSON, CSV, TSV or text from an uploaded file or a URL, used by name.',
    keywords: 'data json csv tsv text url fetch api spreadsheet refresh cors',
    body: `Open the **Data** tab and add a source **From file** (upload) or **From URL** (fetched by the player).

- **Format**: JSON, CSV or TSV (first row is the column names), or plain text. CSV and TSV become a list of rows, with numbers and true/false converted.
- **URL**: fetched as soon as you press Enter or leave the field. **Reload** fetches it again.
- **Refresh** (URLs): fetch again every n seconds; 0 loads once.
- The preview on the right shows what was loaded, with the field names you can use.

Use a source by its **name** anywhere expressions go: \`{products.length} products\`, a binding \`products[0].price\`, or **Repeat → Items** \`products\`. Scripts read \`ix.data.products\`.

**Load data** reloads a source (optionally from a different URL); **On data loaded** fires when it arrives. **+ Shared responses** adds a different kind of source, answers the people playing add, counted for the class or kept for each person: see [Shared responses](shared-responses). The host page can push data with \`player.setData('products', [...])\`.

## The built-in context
The list always starts with **context**, a read-only source that is there without adding anything: the course and the learner (\`{context.firstName}\`, \`context.courseCode\`). Pick it to see its fields, set sample values to design with, and give different courses different starting values. See [Course and learner context](course-context).

## What may be loaded
Every data request, from a source, the **Load data** node or \`ix.loadData(name, url)\`, follows the same rules:

- Only \`http:\` and \`https:\` addresses load, plus \`blob:\` and \`data:\` addresses up to 1,000,000 characters. \`file:\`, \`javascript:\` and anything else is refused.
- Cookies and logins are sent only to the page's own site, never to another site.
- Relative addresses and the page's own site always work.
- **Allowed data hosts** (Project settings) is an optional list. Leave it empty to allow any http(s) host. Once it has entries, other sites must match one: \`api.example.com\`, \`*.example.com\` (its subdomains, not \`example.com\` itself), \`example.com:8080\` (an entry without a port matches any port), or a full origin like \`https://api.example.com\` (that scheme and port only). A redirect to a site off the list is refused too. Files uploaded to the project are not affected.

A refused request loads nothing and writes a warning to the console; in a script, \`ix.loadData\` throws.

> URLs must allow cross-origin requests (CORS) from wherever the interactive is published.`,
  },
  {
    id: 'shared-responses',
    title: 'Shared responses',
    group: 'Data',
    summary: 'Short answers people add, counted for a whole class (a word cloud, a poll) or kept for each person, switched by one setting.',
    keywords: 'shared responses class poll word cloud answers moderation blocklist blocked hide remove clear only me everyone anonymous counts course studydesk learner page add to shared responses take back',
    body: `A **Shared responses** data source holds short answers that the people playing add: the words in a word cloud, the votes in a poll, a list the whole class builds. The answers are **counted** and **anonymous**: a page gets how many people gave each answer, never who.

## Adding one
In the **Data** tab choose **+ Shared responses**. It is a data source like any other, in scope by its name (\`responses\`), so its answers can fill a list, a repeat, a chart or a [word cloud](expressions).

| In expressions | What it is |
|---|---|
| \`responses.answers\` | The counted answers, most given first: \`text\`, \`count\` and \`weight\` (the same number, so the list goes straight into \`cloud(...)\`) |
| \`responses.ready\` | True once there is somewhere that keeps the answers. Show the person's own words until then |
| \`responses.mine\` | What this person added, in order |
| \`responses.left\`, \`responses.limit\` | How many more this person may add, and the most they may |
| \`responses.people\`, \`responses.total\` | How many people have added something, and how many answers there are in all |
| \`responses.problem\` | \`blocked\` or \`full\` after an add that was refused, or empty |

Put answers in with the **Add to shared responses** node (the answer is an expression: text, or a list of texts), or \`await ix.shared.add('responses', 'sleep')\` in a script. **Take back shared responses** and \`ix.shared.withdraw(name, answer)\` take this person's own answers out again (the one named, or all of theirs); they never touch anyone else's. **Add to shared responses** continues from **Added** when something was kept and from **Not added** when nothing was (blocked, already there, over the limit, or nowhere to keep it).

## Who sees it
- **Everyone in this class**: everyone in the same course sees every answer, counted. A class is the project plus the StudyDesk course the person came from.
- **Only me**: each person only ever sees their own answers.

This is one setting on the data source, **Who sees it**. To let the same project run either way, set **Switch with** to a text variable (a choice variable named \`whoSees\` with the options *Only me* and *Everyone in this class*, say): it takes who sees from the variable's value, so one setting in the project, or a button the learner presses, flips the whole page. A variable that says Only me, alone or private keeps answers private; one that says everyone, class or shared shows them to the class. Answers kept for Only me are stored apart from the class's, so switching a project to the class later never shows anyone what they kept to themselves.

## Where it runs
The class lives on the server, and the server only knows who someone is on the **StudyDesk learner page** (**Share**, then **Link for StudyDesk**, see [Share link](export#share-link)). There each person's answers are kept under their signed-in account and course, and what the class sees is read every few seconds while the page is open. Anywhere else (an exported file, an ordinary share link, the page open on its own) there is no class: **Only me** still works, keeping the person's own answers in their browser, and **Everyone in this class** answers \`ready: false\` so the page can quietly show their own words. **Preview** pretends: the class is your sample answers plus whatever you add in the preview.

The rules are fixed when the project is shared. After you add or change a shared source, **Update to the latest version** in the Share dialog or the learner page will not know about it.

## The settings
- **Longest answer** and **Answers each**: how long an answer may be (up to 120 characters) and how many different answers one person may have in (up to 50). The same answer twice from one person counts once.
- **Show at**: an answer waits until this many people have given it, so one person's odd answer does not show on its own.
- **Blocked words**: words and phrases nobody may add. Whole words only, so blocking *ass* leaves *class* alone. Words already in stop showing as soon as they are blocked and you share again.
- **Look again**: how often the page asks what the class has added while it is open (at least 2 seconds, 0 reads once).
- **Sample answers**: for you only. The canvas and Preview show them as a class, so a page can be laid out with nobody in it. Learners never see them.

## Moderating
Below the settings, **What the class has said** lists every answer by course, with how many people gave it and why one may not be showing (hidden by you, a blocked word, or still waiting for enough people). **Hide** keeps an answer but takes it away from the class, and **Show** brings it back. **Remove** takes it out of everyone's list (they can add it again). **Clear this course** empties the course. Only the project's **owner or a power user** sees this, since it is other people's answers; collaborators do not. It shows what the server holds, so it needs the project to be shared and to have had some answers.

## What is kept
One list of answers per person, per shared source, per project and per course, with the account that added them (never sent to anyone's page), kept until the project is deleted for good (the Bin's **Delete forever**, or after 30 days there). **Clear results** does not touch them; the moderation list does. Nothing about the person comes back in a count.

## Limits and safety
Answers are cut to the length, stripped of control and invisible characters, and a person who adds too fast is slowed (the page is told it is busy). Everything is held to what was declared when the project was shared, never to what a browser sends, and who someone is comes from their StudyDesk session.

See the **Word cloud** starter for the class cloud wired up: the same page for Only me and for the class.`,
  },
  {
    id: 'course-context',
    title: 'Course and learner context',
    group: 'Data',
    summary: 'The built-in context source (course label, first name, student or staff) and per-course variable values.',
    keywords: 'context course label code term year learner first name display name student staff studydesk per-course values offering rollover duplicate fetchactivity session greeting',
    body: `Every project has a built-in, read-only data source called **context**. It holds the course the project is in and the person playing, so a project can greet someone by name, show the unit code, or change what it says for staff and students. You do not add it and you cannot edit it; it is always in the **Data** tab's list, first.

## What is in it
| Field | What it is |
|---|---|
| \`context.courseLabel\` | The StudyDesk course label, like \`MAT1000_26S1_ONC\` |
| \`context.courseCode\` | The label up to its first underscore, like \`MAT1000\` |
| \`context.courseName\` | The course's title |
| \`context.offering\` | The label after the code, like \`26S1_ONC\`: one run of the course |
| \`context.term\`, \`context.year\` | The study period (\`S1\`) and the year (\`2026\`) when the label has them, otherwise empty |
| \`context.lmsUrl\`, \`context.lmsName\` | The learning management system, as StudyDesk reports it |
| \`context.firstName\`, \`context.displayName\` | The learner's first name, and the name to greet them by |
| \`context.signedIn\` | Someone is signed in to StudyDesk |
| \`context.isStudent\`, \`context.isStaff\` | Signed in as a student, or signed in and not a student |

Term and year are worked out from the label as well as they can be, and are empty when the label does not say.

## Using it
Use it by name anywhere expressions go, the same as any [data source](data-sources):

- Text: \`Welcome, {context.firstName}\`. A learner with no name sees \`Welcome, \`, so word it to cope.
- [Bindings](bindings): show a layer only for staff with \`context.isStaff\`, or pick a message with \`context.courseCode == "MAT1000" ? "A" : "B"\`.
- The interaction graph: anywhere a node takes an expression, such as the **If** condition.
- Scripts: \`ix.context.firstName\`.

A variable or data source that you name \`context\` hides the built-in one, and the Data tab warns about it.

## Where the values come from
- **The Link for StudyDesk** fills it in from the signed in StudyDesk session. Use that link, not the plain share link, when you want it.
- **Preview and the canvas** use made-up **sample values**, which you edit in the Data tab under **context** (first name, course label and so on). The code, term and year follow the sample label. Clear a field to see the project with it blank. Sample values are for designing: they are never in an exported file or a share link.
- **Anywhere else**, such as a downloaded file or a share link opened outside StudyDesk, nobody is known: the text is empty and the flags are false.

## Per-course values
One project can serve several courses without being copied. In the **Data** tab, pick **context** and use **Per-course values**: add a row with a course label, then pick the variables that row changes and give each its value for that course.

- The label can use \`*\` for any run of characters and \`?\` for one character, and is not case sensitive: \`MAT1000_*\` is every run of MAT1000, and \`MAT1000_26S1_ONC\` is exactly one. Commas give several: \`MAT1000_*, MAT1001_*\`.
- Rows apply when the project starts on the Link for StudyDesk page, in order from the top. Every matching row applies, and a later row wins where two set the same variable. A course that matches no row simply gets each variable's own starting value.
- It changes the starting value only. **Start over** goes back to it. A learner's own remembered progress (variables ticked **Remember**) still wins over it, so leave **Remember** off for a variable you set per course. A value the embedding page sets itself (an input attribute) wins too.
- Preview uses the sample course, and each row says whether it matches, so you can try each course by changing the sample course label.

Results are already kept per course, so each course's learners start clean without anything here.

After changing per-course values, press **Update to the latest version** in [Share link](export#share-link) so the Link for StudyDesk plays the new version.

## Privacy
Only the course, the learner's first name and display name, and whether they are a student or staff go to the project. Never a username, email, student number or anything that could look a person up. Nothing from \`context\` is sent to analytics, results or diagnostics by the player or the Link for StudyDesk page. A project that records a name itself (a script saving \`ix.context.firstName\` with **Record**) is doing that on purpose, so don't.`,
  },
  {
    id: 'repeaters',
    title: 'Repeated lists',
    group: 'Data',
    summary: 'Copy a layer once per item in a list, with item and index in scope.',
    keywords: 'repeat repeater list loop for each item index grid table',
    body: `Select a group or frame and, in its **Repeat (list)** section, tick **Repeat the first child for each item**. Its **first child** is then copied once per item in **Items** (an expression that gives a list, like \`products\` or \`[1, 2, 3]\`).

**Items** can be a [data source](data-sources) or a *List* [variable](variables): the repeater redraws when the list changes, so a *Set variable* node that appends to the list adds a row.

Inside the copies, \`item\` is the current item and \`index\` its position (from 0): \`{index + 1}. {item.name} - {item.price}\`.

**Layout** places the copies: vertical, horizontal, grid (with columns), or none (when the frame uses [auto layout](auto-layout), which is usually best). A grid has a **Fill** direction: *Rows first* goes across each row and then down (1 2 3 / 4 5 6 / 7), *Columns first* goes down each column and then across (1 4 7 / 2 5 / 3 6), with **Cols** still the number of columns.

**Text in the copies sizes itself.** A text layer in the template set to *Auto height* or *Auto width* is measured in every copy, with the item's own words, the font and the width it has there, so a long item gets a tall row and a short one a short row. Frames that hug their content (an [auto layout](auto-layout) repeater, or a card with its own layout) follow. There is no need to guess a height from the number of characters. A height or width you bind on the template layer still wins. Only copies whose text changed are measured again.

**Instances in a repeater** can take their [inputs](instances) from the item: select the instance, open *Bindings*, add *Input <name>* and write an expression such as \`item.title\` or \`item.score * 10\`. Every copy then shows its own item's values, and follows the list when it changes.

Clicks on a copy fire **On pointer** for the template layer with \`event.index\`, so \`products[event.index]\` is the item that was clicked.

For lists a keyboard user moves through, tick **Keyboard navigation** under the repeater: one copy is the Tab stop and the arrow keys move between the rest (see [Accessibility](accessibility#keyboard-navigation)).`,
  },
  {
    id: 'results',
    title: 'Results and progress',
    group: 'Getting started',
    summary: 'Report a score and completion, remember progress between visits, and see how learners did.',
    keywords: 'results score pass mark completion complete report progress remember resume start over attempts learners studydesk lms grade save load user data',
    body: `A project can report how a learner did and remember where they were, so closing the page does not lose their progress.

## Set it up
Open **Results and progress** in the Project section of the Inspector (click an empty part of the canvas).

| Setting | Meaning |
|---|---|
| Score from | **A score variable** (the default) or **Total of all questions**. The total adds up every question's points, out of the most they can score, so adding a question needs nothing else here (see [the whole quiz](question-kit#the-whole-quiz)). It shows only when the project has questions |
| Score variable | The number variable that holds the score |
| Top score | The score that counts as 100% (the default is 100). A score above it is reported as 100% |
| Pass mark | Tick it and give a percentage to report pass or fail as well as the score |
| Complete when | **Report result node only**, **Reaching an artboard**, **A variable turns on** (a true/false one), **Score meets the pass mark** or **A step-through artboard reaches its last step** (see [Steps](steps)). Completing reports the result once |
| Resume on the same artboard | A returning learner opens on the artboard they left |

Then tick **Remember** on each variable that should keep its value between visits (the Variables tab).

With **Total of all questions** there is no score variable or top score: the pass mark is a percentage of the questions' points, and Report result with its Score empty sends the total (the kit's own Report result nodes do that for you). A question marked on the server counts the mark the server keeps (its first go; with retakes the best or latest round, as set), so a practice go afterwards changes nothing.

## Report result and Start over
- **Report result** (action node) sends the result: *Complete* marks this attempt complete, *Score so far* reports the score without completing. Leave **Score** empty to use the score variable, or give an expression such as \`correct * 10\`. In scripts: \`ix.report({ completed: true, score: 7 })\`.
- **Start over** (action node, or \`ix.startOver()\`) puts every variable back to its starting value, clears remembered progress, counts a new attempt and shows the start artboard. Nothing after it in the same flow runs. Scripts keep their own state.
- \`ix.result\` reads the result as it stands, \`{completed, score, max, percent, passed}\`. Reading it reports nothing.

## Where it goes
The player works with no server: with nothing else around it, **Remember** keeps values in the browser and a reported result goes nowhere (the page around an iframe also receives it as a message).

Inside StudyDesk, give learners the **Link for StudyDesk** from [Share link](export#share-link) rather than the share link. It also tells the project which course it is in and the learner's first name, for [Course and learner context](course-context) (never their username or email, and none of it goes into results or Insights). It plays the same project, and keeps one record per learner per course in the Toolbox's own database: completion, score, pass or fail, attempts and the remembered variables. Learners are identified by their StudyDesk session. The same link also counts what learners do for [Insights](insights). Someone opening it with no session plays as normal and their progress stays in their own browser. Nothing is sent to the LMS gradebook yet.

## Save user data and Load user data
**Remember** keeps a variable's value all the time, on its own. When you'd rather choose the moment, use the two action nodes instead: **Save user data** keeps the variables you tick, as they are right then (say, when the learner presses *Submit*), and **Load user data** puts them back on a later visit. Put the load in **Before activity loads** so the values are in place before anything shows. *Load user data* goes on from **Loaded** when anything came back, and from **Nothing saved** on a first visit, so you can set up a fresh start there.

Most of the time you do not need the nodes: tick **Save as user data** on a variable in the [Variables](variables) tab and it is loaded before the project starts and saved as it changes. They go to the same places as remembered progress: on the **Link for StudyDesk**, one record per learner per course, kept by their StudyDesk session; with no session or in an export, in the browser. **Preview** keeps them too, for that project in this browser, so closing and reopening Preview is like a learner coming back; **Forget saved data** in Preview's bar starts you again as a new learner. Each save only changes the variables it names. User data is kept apart from remembered progress and from results, so **Clear results** and **Start over** leave it alone; it goes when the project goes for good (30 days after it's deleted, or straight away with **Delete forever**).

## See the results
**View results…** in this section, or **Results…** in Share link, shows learners, the percentage who completed and passed, the average best score and attempts, and a row per learner. The owner and people invited to collaborate can see it. **Export CSV** downloads every learner's record as a spreadsheet: username, name, course, completed, passed, attempts, best and last score and percentage, and when they were last active (the list in the dialog shows the latest 200). **Clear results** deletes every record for the project (handy after testing); only the owner can use it (collaborators see it greyed out), since it can't be undone.

## Good to know
- A result is what the learner's browser says. It is good for tracking progress, not for marks that must be tamper-proof, unless the questions are set to **Mark answers on the server**. Then the server marks them, keeps the tries and writes the result itself, and any result the browser reports is ignored for that project. See [Question kit](question-kit).
- The project's share link has to be on: results are only kept while it is.
- **Update to the latest version** in Share link after changing these settings, so the link plays the new version.`,
  },
  {
    id: 'insights',
    title: 'Insights: what learners did',
    group: 'Getting started',
    summary: 'See where learners go, click and struggle: artboards reached, a click heat map, steps, answers to each question and your own records, as counts.',
    keywords: 'insights analytics records record learners activity funnel heat map heatmap clicks steps answers questions struggle csv export privacy consent studydesk',
    body: `The **Insights** tab (bottom panel) answers "where do learners get stuck?" with counts. It shows nothing until learners have played the project from the **Link for StudyDesk** (see [Share link](export#share-link)) while signed in to StudyDesk.

## What you see
- **Learners, visits, clicks, answers checked.** A learner is one StudyDesk user however many times they came back. A visit is one time the page was opened.
- **Artboards reached.** A bar per artboard, in the project's order, of how many different learners saw it, and what share of the people who reached the start artboard that is. A big drop between two bars is where people left, or where nothing led them on.
- **Steps reached** for each step-through artboard, so you can see which step people stopped at.
- **One card per question.** How many learners answered, how many checks were right, how many were right the first time, and a bar for how often each option was chosen (the right answer in green). An option nobody chose shows as zero. Typed and ordered answers are only counted as right or wrong.
- **Where learners clicked.** The buttons, links and clickable layers learners clicked most. Tick **Click heat on the canvas** to draw every click over the artboard you are editing: blue is a few, red is many. Clicks that land on nothing show up too, which is how you find the thing people expected to be clickable.
- **Your records**, from the *Record* node and \`ix.record\`.
- **Courses**, when the project is used in more than one.

Choose how far back to count (7 days to all time) and press **Refresh**. **Export CSV** downloads every count in a spreadsheet-friendly file.

## Your own records
Add a **Record** action node (Interactions tab) anywhere in a flow: give it a **Name** ("opened hint") and, if you like, a **Value** (an expression: a choice, a level, a score band). Insights counts how often each name happened, how many learners it happened to, and how often each value came up. In scripts: \`ix.record('chose route', 'B')\`. Names are cut at 60 characters and values at 120.

## What is and is not recorded
- Automatic records: an artboard was shown, a click (where, and which button or link), a step was reached, and a question was checked (right or wrong, which options were chosen).
- Nothing a learner types is recorded. A typed answer is only marked right or wrong.
- Insights shows counts and numbers of different learners. It never lists a learner. With only a handful of learners a count can be one person, so wait for more before drawing conclusions.
- The records go to the Toolbox's usual analytics as the learner's StudyDesk session (the same way every other toolbox item is counted), so the people who read those reports can see which user they came from. Tell learners what is counted, the way you would for any other usage statistics.
- A page load sends at most 500 records, 300 of them clicks.
- Switch recording off, or any kind of automatic record, in **Learner records** in the Project section (click an empty part of the canvas). Off means off: Record nodes send nothing either.
- The player on its own sends nothing anywhere. A standalone export, the editor's Preview and a plain share link keep no records. Only the Link for StudyDesk passes them on.

## Good to know
- Records are the learner's browser's word, so they are good for seeing patterns, not for proof.
- Only the project's owner (and power users) can open Insights.
- **Update to the latest version** in Share link after changing record settings or adding Record nodes, so the link plays the new version.`,
  },
  {
    id: 'sensors',
    title: 'Microphone, camera and photos',
    group: 'Interactivity',
    summary: 'Record a voice, show the camera, take or choose a photo: declare it in Project settings, build the plain version, and know what learners are asked and what the page needs.',
    keywords: 'microphone mic camera listen live loudness meter level bands frequency bars sound lab noise micLevel micBands simulator slider webcam photo picture notebook bingo fieldwork report html download record recording voice audio video capture sensor consent permission privacy iframe allow download level speaking opt out do not use my microphone or camera accessibility alternative preview denied blocked device',
    body: `A project can listen through the learner's **microphone**, show their **camera**, or take or choose a **photo**. It never touches a device itself. The page it plays in does, behind one plain consent screen and a recording bar the project cannot hide, and tells the project only what it needs.

## Turn it on
In the Project section (click an empty part of the canvas) open **Microphone and camera** and tick what the project uses. Nothing undeclared works. Add one sentence for **What it is used for** ("record your answer to the speaking question"), and a **Longest recording** if the default (120 seconds of sound, 60 of video) is too long. The box under it shows exactly what learners are asked, made from your choices.

**Update to the latest version** in [Share link](export#share-link) after changing these: the page reads what you declared when the link was last updated, not what the project says now.

## What learners see
- **One consent screen** the first time something is used in a visit. It names what is used, what for, that recordings stay in the page on the device and are not saved on a server, and what they can do instead. Its buttons are **Continue**, **Not now** and **Do not use my microphone or camera**.
- **A recording bar** at the top centre of the page, over the project (leave a little room there), whenever a device is live, with the level, a timer and a **Stop** that always works. Recording starts only after a real tap, stops by itself at the length limit, and the device is let go the moment it ends.
- **Plain messages** when it cannot work: the browser said no, there is no device, another app is using it, or the course page does not allow it.
- **Do not use my microphone or camera** is remembered in the learner's browser. Every project then reads \`off\` and shows its plain version. Only the learner can turn it back on, from the button that stays at the bottom left. Browsers keep this per course site, so it holds for that site until they clear their data.

## Build the plain version first
Learners who cannot, or would rather not, use a microphone or camera must be able to finish. Read the state in a condition, a binding or a text layer:
- \`microphone\` and \`camera\` are \`unavailable\` (cannot, here), \`denied\` (they or their browser said no), \`ready\` or \`off\` (they chose not to use them).
- \`photos\` is the same for the photo picker.
- \`mediaMessage\` is the plain sentence to show when something is not ready.
- \`micLevel\` (0 to 1, how loud) and \`micBands\` (a list of 8 numbers, 0 to 1 each, from low to high sound) while the project is listening live, and \`listening\` (true while it is). \`recording\` is true while recording, and \`micLevel\` follows a recording too.
- \`recording\` \`recordingSeconds\`, and \`recordings.<name>.state\` (\`empty\`, \`recording\`, \`ready\`, \`playing\`), \`.seconds\` and \`.hasRecording\` for each recording, for meters, timers and buttons.

The Accessibility tab has a check for this (Listen live counts as a sensor node, and its **Could not start** output as the way on): a project that uses a sensor needs a click, key or typed way to reach the same finish (Report result, Go to artboard, Steps, Check answer or the completion variable) that does not go through the sensor. The check passes when a button or typed answer finishes without it, including carrying on from a node's **Could not start** output. If there truly cannot be an equal way (an assessment of speaking, say), say why in **No equal way to finish**: learners are told, and the check becomes a note for you to review. The check finds that there is another way, not that it is a good one. The **Sign practice with self-review** starter is an example: the learner can do the whole walk, and reach the summary, without ever turning the camera on.

## Listen live: the microphone as a number
Tick **Live listening** under Microphone (and **Only ever listen, never record** if that is all the project does: the page then refuses every Start recording, and the consent screen says so). A **Listen live** node turns it on and off. While it is on the microphone drives numbers you can bind anywhere: \`micLevel\` (how loud) and \`micBands\` (8 bands, log-spaced from about 80 Hz to 8 kHz: \`micBands[0]\` is a low hum, \`micBands[7]\` the highest whistle overtones), about 25 times a second. Bar heights, circle sizes, colours and shaders can read them like any variable. For example, a bar's height binding \`200 * micBands[3]\`.
- **Nothing is recorded.** The page measures the sound and throws it away; only those numbers reach the project, and a **Listening** bar says so at the top of the page, with a **Stop** that always works. Learners are asked first, on the same consent screen, and only after a tap.
- **It stops** when the learner presses Stop, the device goes away, a new page of the project opens (unless you untick **Stop when the learner leaves this page** on the node) or they leave. \`listening\` then reads false and the numbers go back to 0. **On microphone or camera** with *Live listening started or stopped* fires each time (\`event.reason\` is \`started\`, \`stopped\`, \`device-lost\` or \`released\`).
- **It is a rough guide.** Phones and many laptops tidy the sound themselves (automatic gain, noise removal), so the numbers say louder or quieter and higher or lower, not decibels or exact pitch. The page asks the browser not to, and some ignore it. Do not use it for a safety measurement, and word anything about noise levels as a guide. There is no pitch tracking: the bands show where the sound is, not which note.
- **Give a way to play without it.** The loudness and frequency starters add a slider that makes the same numbers (\`simLevel\`, \`simPitch\`): show it when \`!listening\`, and bind the display to \`listening ? micLevel : simLevel\`. It also works in Preview, where a pretend microphone makes a swelling level and a moving bump of bands.
- Listening and recording share the one microphone: starting a recording ends live listening, and Listen live cannot start while a recording runs.

## Nodes
All are in the Interactions palette, and described there.
- **Listen live** (start or stop, stop when the learner leaves this page) continues from **Listening** or **Could not start**.
- **Start recording** (a name for the recording, sound or video, a longest time) continues from **Recording** or **Could not start**. A project can keep several recordings, each under its own name. Set **Do** to *Start or stop* and one button does both: pressed while that recording is going it stops it and continues from **Recorded**, otherwise it starts. **Quiet other sounds first** (on) stops Play sound sounds, recording playback and the voice before the microphone opens, so a model answer does not leak into the take.
- **Stop recording**, **Discard recording**, **Play recording** (sound plays through the project's own sound, so the viewer's sound button applies; video plays in the layer you choose) and **Download recording** (offers a file, after a tap: it is the only way a recording leaves memory).
- **Camera preview** shows the camera live in a layer's place. The page draws it over the project, so the project never sees the camera's pixels.
- **Take or choose a photo** puts a picture, scaled to at most 1600 px on the long side, into an image asset. Every image layer that uses the asset shows it. From the device's photo picker (with the front or back camera if the device offers it) or a still from the live preview. To fill a different asset for each item of a list, give **Or the asset from an expression** an asset's id or name (such as \`prompts[current].photo\`); it wins over the asset picked. Set **Do** to **Throw the photo away** to put the asset's own picture back and forget the photo.
- **Download a file** saves text you build (a report, a CSV) after a tap. It works in any project: it needs no microphone or camera, so there is nothing to tick in Project > Microphone and camera. With the type **Web page (.html)** it can carry pictures: write \`[[image:id]]\` where one goes, with the id or name of an asset (a photo the learner took, or one of your own pictures), and the learner's page swaps it for the picture itself, so the file is one page with its images inside and works offline. Put \`html(text)\` around anything the learner typed so it cannot break the page. A web page can be up to 16 MB (other files 2 MB), and every one is saved with a rule that stops it running script or loading anything when it is opened, so it is a report and nothing more. If a picture cannot be found the mark is left empty, so give each image a good \`alt\`. The **Photo prompts notebook** starter builds its whole report this way, for upload to a Moodle assignment.
- **Offer: do not use my microphone or camera** asks the learner, in the page's own screen, whether to stop using them for good. Put it on a "Use the keyboard instead" button. Only the learner decides.
- **On microphone or camera** fires when a recording starts, a recording is ready (\`event.reason\` is \`stopped\`, \`limit\` or \`device-lost\`: the learner can press Stop on the bar too), something could not start (\`event.problem\` and \`event.message\`), the state changed, a video finished playing, a photo arrived, or live listening started or stopped.

## Try it
**Preview** has a pretend microphone and camera, because the real ones need the page the project is shared in. It makes a made-up level and short tone for a recording, a swelling level and moving bands for live listening, and a sample picture. The **Microphone and camera** menu above the preview makes it fail the ways a real one does (denied, no device, blocked by the course page, the learner chose not to use them), so you can build and check the plain version. A small "Simulated" note shows while it records. Try the real devices from the **Link for StudyDesk** on the page you will use.

## Where it works, and what it needs
- Play it from the **Link for StudyDesk** (\`/interactives/play/<token>\`). The plain share link (\`/s/<token>\`) cannot use a microphone or camera: its sandbox has no origin, and the browser refuses any device to such a page, so every node there goes down its **Could not start** output.
- The StudyDesk page that holds the link's iframe needs **allow="microphone; camera"** on that iframe, or the browser refuses the page too. Without it learners are told, in plain words, that the course page does not allow it. Tell whoever builds the page. Another learning system that launches the project over LTI 1.3 decides its own iframe attributes and may not allow it at all.
- It needs a secure page (https) and a recent Chrome, Edge, Firefox or Safari. The Moodle App and in-app browsers may not allow a microphone in an embedded page: test there before relying on it.
- Recordings and photos are kept in memory, in the page, so they are gone when the learner leaves or reloads. Say so ("download before you leave"), and offer **Download recording** or a downloaded report. Nothing is uploaded or stored on a server, and the Insights records never carry audio, video, photos or what was said. The project's own code can use a recording it plays, so do not put code you do not trust in a project that uses a microphone.
- For anything marked, use the Moodle assignment's own recording or upload: this does not submit a recording anywhere.`,
  },
  {
    id: 'public-interface',
    title: 'Public interface: inputs and outputs for developers',
    group: 'Import and export',
    summary: 'List the variables and messages a page that embeds the project may use, with descriptions; get a reference page, TypeScript definitions, player.describe() and web component options.',
    keywords: 'public interface inputs outputs host embed developer api attributes input- inputs lazy loading poster start click pause offscreen describe typescript d.ts reference page web component restrict messages ix-variable ix-message postMessage',
    body: `Someone who embeds your project should not have to read through it to find which variables and messages are meant for them. The **Public interface** tab (bottom panel) is that list.

## The list
- **Variables** are marked **Input** (the page sets it), **Output** (the page reads it) or **Both**, each with a description. They are held by the variable, not its name: rename a variable and the row says so, with **Use the new name** to accept it (the page then has to change too).
- **Messages** are the ones the project **receives** from the page (the ones *On message* nodes and \`ix.on\` handlers listen for) and the ones it **sends** (*Send message* nodes and \`ix.emit\`). Each can have a description and a payload shape: nothing, text, number, true or false, anything, or an object with named fields.
- **Add from what the project uses** finds every message in the project's flows and scripts, and the variables its flows and controls work with. A message found but not listed shows as a **+** button under the messages. Pick any other variable from **Add a variable…**.
- A row is flagged when a listed variable was renamed or deleted, or when no node or script sends or listens for a listed message.

## What you get
- **Reference page** (button in the tab, and **Export > Public interface reference**): inputs, outputs, messages, the element options and a worked embed example, as a page you can send to a developer. A \`${PACKAGE_EXTENSION}\` package of a project with a public interface also holds it as \`reference.html\`, with \`interface.d.ts\` beside it.
- **TypeScript definitions** (the **.d.ts** button, **Export > TypeScript definitions**): types for each input, output and message, and a player type whose \`setVariable\`, \`getVariable\`, \`send\` and \`on\` know your names.
- **player.describe()** returns the same list at run time: \`{ title, declared, restrictInputs, variables: [{ name, type, direction, description, initial, options }], messages: [{ name, direction, description, payload }], issues }\`.
- **Exporting asks first** when the list no longer matches the project (renamed or deleted variables, messages nothing handles), so an embed does not break without anyone knowing.

## Embedding with options
\`\`\`html
<script src="interactives-player.iife.js"></script>
<interactives-player src="quiz.ixp" style="width:800px;height:600px"
    loading="lazy" poster="quiz.jpg" pause-offscreen
    input-level="hard" input-learnername="Sam"></interactives-player>
<script>
  const el = document.querySelector('interactives-player');
  el.addEventListener('ix-variable', (e) => console.log(e.detail.name, e.detail.value)); // outputs
  el.addEventListener('ix-message', (e) => console.log(e.detail.name, e.detail.payload));
  el.addEventListener('ix-ready', () => el.player.send('addToCart', { sku: 'A1' }));
</script>
\`\`\`
- **\`input-<name>="value"\`** and a JSON **\`inputs='{"level": "hard"}'\`** attribute set variables before the first frame, and again whenever they change. Names are matched ignoring case (attribute names are lower case). Values are converted to the variable's type: a number must be a number, a choice must be one of its options, a list must be JSON. A value that does not fit is skipped with a console warning.
- **\`loading="lazy"\`**: the project is not fetched until the element is within 200 px of the viewport.
- **\`poster="image"\`**: an image shows until the project is ready (and while it waits to load).
- **\`start="click"\`**: the poster (or a plain box) with a play button, and nothing loads until it is used. \`el.start()\` does the same from script. The click also lets the browser play sound.
- **\`pause-offscreen\`**: timelines and sound pause while the element is not on screen, and carry on when it comes back.
- **\`label\`**: the play button's accessible name.
- Outputs arrive as **\`ix-variable\`** events (\`detail\` is \`{ name, value, previous }\`) and, from the single-file export inside an iframe, as \`{ source: 'interactives-variable', name, value }\` posted to the parent page. Only variables listed as outputs are announced.

## Only public inputs can be set from outside
Off by default, so embeds that already exist keep working. Turn it on and attributes on the element, and \`{ target: 'interactives', type: 'setVariable' | 'send' }\` messages from the page around an exported file, can only set the **Input** and **Both** variables and send the **Received** messages on the list. Anything else is refused with a console warning. Code that holds the player object (\`el.player.setVariable\`) is the page's own code and is not held to it.

## Good to know
- The list is documentation first. Nothing about how the project plays changes when you add to it, apart from this option.
- Message names found in scripts are only the ones written out as text (\`ix.emit('done')\`), not names built from other values. Add those by hand.
- **Update to the latest version** in Share link after changing the list, so the link plays the new version.`,
  },
  {
    id: 'project-settings',
    title: 'Project settings',
    group: 'Getting started',
    summary: 'Start artboard, fit, page title, fonts, sandbox, reduced motion and Optimise output.',
    keywords: 'settings start artboard fit scale page title background fonts sandbox reduced motion optimise output pictures size quality slider',
    body: `![The Project section of the Inspector, with Allowed data hosts filled in and the library and reduced motion boxes below it.](help/project-settings.png)

Click an empty part of the canvas, or an artboard's name, to see the **Project** settings in the Inspector (below the artboard's own).

| Setting | Meaning |
|---|---|
| Name | The project's name, as on the projects page |
| Page title | The title of the browser tab for the exported page |
| Description | A note about the project, kept in the file |
| Fit | How the artboard scales to the space it's given: **Contain (letterbox)**, **Cover (crop)**, **Stretch**, **Fit width (page height follows)** or **Actual size** |
| Page background | The colour around the artboard in the exported page |
| Run scripts in the sandbox | See [Scripts](scripts) |
| Run embedded HTML in the page | Only shown while the sandbox box above is off. Lets Embed layers with HTML reach the page, for HTML you wrote and trust. See [Web elements](web-elements) |
| Allowed data hosts | Hosts that data may be loaded from, one per line (\`api.example.com\`, \`*.example.com\`). Empty allows any http(s) host. See [Data sources](data-sources#what-may-be-loaded) |
| This project is a library | Shares the artboards you publish, with the project's styles and assets, as components for other projects. See [Libraries](libraries) |
| Respect reduced motion | When the viewer asks for less motion, autoplaying timelines start at their end and transitions are instant |
| Optimise output | On by default. Downloads and share links carry smaller copies of big pictures; your originals stay at full size. The slider under it runs from **Smaller files** to **Better quality** (it starts at **Better quality**). **Optimise pictures now** makes the copies straight away and tells you what they save. See [Exporting](export#optimised-pictures) |
| Results and progress | The score, pass mark and when the project counts as complete. See [Results and progress](results) |
| Credits | Whether learners get a **Credits** button, and whether exported and shared pages carry the attributions list. The entries are in the **Attributions** tab. See [Attributions and references](attributions) |
| Start artboard | Shown first in the player: set with **Make start artboard** on an artboard |
| Fonts | The fonts the project loads. **Add a Google font…** is a search box over every Google font (type, then <kbd>Enter</kbd> or click; the chips narrow it by Sans, Serif, Display, Handwriting or Mono), or upload font files in the **Assets** panel. New projects start with Open Sans. Choosing a font for a text layer adds it here by itself. Fonts come from this server (it keeps a copy of each Google font the first time it is used), and a lesson waits a moment for its fonts before it shows, so text never appears in one font and then changes |`,
  },

  {
    id: 'download-size',
    title: 'Download size and lite versions',
    group: 'Interactivity',
    summary: 'What each artboard asks a learner to download, how to show it to them, and how to offer a lesson as video, audio only and text only.',
    keywords: 'download size weight bandwidth lite low data saver metered mobile slow connection audio only text only version video size megabytes mb file size lazy loading transcript saveData lowBandwidth downloadSize fileSize',
    body: `Many learners study on mobile data or a shared connection. This page is about showing them what a lesson costs before they commit, and about offering a lighter way to take it.

## Seeing what an artboard weighs
Select an artboard and open **Download size** in the Inspector. The heading says what this artboard needs in total. Open it to see its heaviest files, and a bar for every artboard in the project so you can compare the versions of a lesson.

- Sizes are the ones the project already stores for each file. While [Optimise output](project-settings) is on and the lighter copy of a picture has been made, its size is used.
- A file counts once however many layers use it. An artboard shown inside another as an [instance](instances) counts what that artboard needs. A file that another artboard only links to with **Go to artboard** belongs to that artboard.
- Fonts and data files load for every artboard, so they are listed apart and left out of each artboard's number.

## What the player loads, and when
The player draws one artboard at a time, and an artboard the learner has not opened asks for nothing: no pictures, no video, no sound. When they get to it, it loads everything it has. Every timeline's sound is fetched on arrival, started or not, so the first play does not wait.

- **Hidden layers still load.** A layer with Visible off is not drawn, but a video in it still starts loading (it may be carrying the sound for an audio version), and an instance layer still loads its artboard. To keep a version's files off the wire, put the version on its own artboard and go to it. Do not hide layers.
- Fonts and data sources are the project's, so they load at the start whichever artboard shows.
- **A single HTML file, a share link and the Link for StudyDesk carry every file inside the page.** All the versions arrive in the first download, so the choice saves memory and playing, not the download. Only a copy whose files are hosted separately loads just the chosen version. The lesson tells the learner which case they are in, with the \`assetsEmbedded\` name below.

## Showing a size to learners
These names work in any expression, text template or binding. A variable with the same name wins.
- **downloadSize("Video lesson")**: the bytes of the files that artboard needs. Give several names to add up what a version needs (each file once). With no name it means the artboard that is showing.
- **fileSize(bytes)**: a size as people say it, such as "340 KB" or "12 MB".
- **saveData**: true when the browser says the learner has turned on Data Saver.
- **connectionType**: \`4g\`, \`3g\`, \`2g\` or \`slow-2g\`, or empty. Only some browsers say; Safari and Firefox say nothing.
- **lowBandwidth**: true when Data Saver is on, or the connection is 3g or slower.
- **assetsEmbedded**: true when the files travel inside the page, as in a share link.

For example, a text layer can read \`{fileSize(downloadSize("Video lesson"))}\`. The hints are only hints: use them to mark a card, never to choose for the learner.

## The Lite lesson starter
Under **Listen, watch and capture** in the branded starter packs, **Lite lesson** is a lesson in three weights. The learner picks **Video**, **Audio only** or **Text only**, each card showing what that version weighs. The choice is a **user data** variable (\`version\`), so it comes back by itself and a returning learner goes straight to it, with **Change version** on every page to come back. On a slow connection or with Data Saver on, the lighter card is marked **Suggested for your connection**; nothing is chosen for them.

All three versions show one transcript, kept in the **transcript** variable, so they cannot drift apart, and all three finish on the same **Done** page, which is the project's completion point, so the result is recorded the same whichever version was used. Text only loads no video and no sound. Audio only loads no video: it is a Video layer holding the soundtrack, with a poster picture that shows the whole time and the captions as its transcript.

What the starter cannot do for you is make the three versions. The soundtrack must make sense with no picture: "as you can see here" fails for someone who is only listening. Keep the transcript and the key images in step with the video when you change it.

## Good to know
- Test the lighter versions on a throttled connection in your browser's developer tools before you tell anyone they are light.
- If you rename a version's artboard, change its name in the size line on the Choose page.`,
  },

  // ---------------------------------------------------------------- import/export
  {
    id: 'import',
    title: 'Importing Lottie, Rive (.riv and .rev), Photoshop, Illustrator, PDF, AutoCAD, VectorCraft, PhotoCraft, PowerPoint and SVG',
    group: 'Import and export',
    summary: 'Bring in Lottie JSON / dotLottie, Rive .riv and Rive editor .rev files, Photoshop .psd files, Illustrator .ai files, PDFs, AutoCAD DXF (and what to do with DWG), VectorCraft .vectorcraft and PhotoCraft .pcraft files, PowerPoint .pptx slides, SVG and project packages.',
    keywords: 'import powerpoint pptx slides deck presentation slide show vectorcraft drawcraft photocraft pcraft lottie dotlottie rive riv rev editor project backup svg after effects bodymovin convert photoshop psd layers illustrator ai pdf autocad cad dxf dwg drawing plan layers artboards vector link linked embed watch reimport re-import update new version source file changes reconnect',
    body: `| File | Becomes | Update from file |
|---|---|---|
| Lottie (\`.json\`, \`.lottie\`) | An artboard and a timeline | No |
| Rive (\`.riv\`) | An artboard for each Rive artboard, with timelines, state machines and bindings | No |
| Rive editor project (\`.rev\`) | The same, plus the layer names and the artboards a \`.riv\` export leaves out | No |
| Photoshop (\`.psd\`) | An artboard of layers, with editable text | Yes |
| Illustrator (\`.ai\`) and PDF | An artboard per page, as vector art | Yes |
| AutoCAD (\`.dxf\`) | An artboard with a group per CAD layer (\`.dwg\` must be saved as DXF first) | Yes |
| VectorCraft, PhotoCraft | Artboards of layers | Yes |
| PowerPoint (\`.pptx\`) | An artboard per slide, with editable text, pictures and shapes | Yes |
| SVG | A group of editable shapes | No |

New to this? [Tutorial 4](tutorial-import-design) walks through an import step by step.

Lottie, Rive (\`.riv\` or \`.rev\`), Photoshop, Illustrator, PDF, AutoCAD (\`.dxf\`), VectorCraft, PhotoCraft and PowerPoint files: use **+ Import file as artboard** in the Layers panel (adds artboards to this project) or on the projects page (makes a new project). A \`.psd\`, \`.ai\`, \`.pdf\` or \`.dxf\` file dropped on the canvas also becomes new artboards.

## Lottie (.json, .lottie)
Shape layers, groups, fills, strokes, gradients (with their exact start and end points, centre and radius, see [exact gradient points](fill-stroke#exact-gradient-points); they are written out the same way), transforms, trim paths and keyframes with easing become layers and a timeline. Text animators with range selectors become [text modifiers](text-modifiers). Expressions, layer masks, track mattes, layer effects, skew and time remapping are not carried over, and the import report lists what was dropped.

## Rive (.riv)
![A Rive file after import: each Rive artboard is an artboard, with its animations as timelines and its state machine as interactions.](help/rive-import-result.png)

Each Rive artboard becomes an artboard: shapes, paths, fills, strokes, gradients, images, text, timelines, nested artboards (as [instances](instances)), layouts (as [auto layout](auto-layout)) and state machines (as interactions). Shape morphing (animated path points), holes, clipping shapes (a clip shape that follows another shape keeps following it) and the translation, rotation, scale, transform and follow path constraints (with factors, limits and local space) are carried over, and so are bones, skins (weights), image meshes, and IK and distance constraints (see [Bones and skinning](bones)); other constraints are not. A transition's blend time becomes a **Blend in** on the next state's *Control timeline* or *Play blend* (a percentage of the old animation is converted to milliseconds, disabled transitions are skipped), with its mix curve as the blend easing, the state left running on under it (or frozen, for *pause on exit*) and *early exit* as *Can be left early*; a state that is being mixed into cannot be left until the mix is done, unless that allows it (a trigger pressed meanwhile is lost, as in Rive). An exit time becomes a **Wait for time in timeline**. Transitions out of one state that carry different random weights become one **Random** node (up to six; a weight of 0 is never picked). Transitions from the Any state are not held up by a mix in progress. Layout padding, margins and gaps given as percentages stay percentages (a share of the width of the layout around them, the way Rive does it, so they follow the layout when it is resized), and absolute insets given as percentages are worked out against the layout's size (and fixed at the file's size); a layout's border widths take room inside it like padding, auto margins push a layer to the end, and a gap between wrapped lines keeps its own value. Rectangles and layouts with a different radius on each corner keep them, and dash lengths given as a share of the outline become pixels (fixed at the file's size). A fill and a stroke that Rive draws in a mixed order keep that [paint order](fill-stroke#paint-order). A text box's vertical alignment, overflow (clip, ellipsis) and no-wrap come in; paragraph spacing comes in too (as the layer's *Paragraph spacing*); shrink-to-fit does not. Rive centres a stroke on its outline, so a stroked rectangle or ellipse comes in a stroke-width bigger to keep the same outer edge. State machine layers that start an animation from any state with nothing to wait for (the looping animations of an icon) start when the artboard does. A transition that has an exit time at the end of the animation and also conditions is taken as soon as both hold, even when the conditions come true long after the animation finished (a splash that plays once and waits for a button); with no exit time and nothing to wait for it is taken the moment the state is entered. An entry transition that has conditions leaves the layer idle until they hold. Actions on a state or a transition (set a view model property when it is entered, left, started or finished) become *Set variable* nodes. A layer's open-link event does not fire when the artboard starts, and one link is not opened twice within two seconds. Listeners on a nested artboard (the buttons of a layout built from several artboards) change the shared view model variables the main artboard's state machine reads. In play, an imported Rive artboard lets the pointer through every layer except the ones its listeners name (the artboard's **pointerThrough** setting in a saved project), so a hidden panel or a picture on top of a button does not stop its click, as in Rive.

Rive **listeners** import as events: pointer enter, exit, press, release, click, move and drag as *On pointer*, **keyboard listeners** as *On key* (the key, its modifiers, and the down, repeat and up phases; the key codes are the ones Rive uses, so letters, digits, arrows, function and numpad keys all map), and **focus** and **blur** listeners as *On focus*, with Rive's focus actions as *Focus layer* (focus traversal actions are not imported). A keyboard listener on a layer imports with *Only while this layer has focus* set to it, so it hears the key only while that layer (or one inside it) has the focus, as in Rive; one on the artboard reacts wherever the focus is. Rive has no scroll-wheel listener, so there is nothing to import there; gamepad, text input and semantic listeners are listed in the report. **Nested artboards** keep their starting inputs, and what Rive does to their inputs comes in too: a listener action that sets a nested number or bool or fires a nested trigger becomes *Set instance input* or *Fire instance trigger* (a nested bool that Rive toggles flips what it is now: the instance's input is read back with \`instanceInput()\`). Keys on a nested bool or trigger in an animation become [timeline markers](timelines) (named like *Badge: flag = true*) with an *On timeline marker* flow, and a nested number animated between keys becomes a track on the instance's input (*Input level*), so it tweens (see [instances](instances)). A **9-slice image** (an image with slice axes) imports with its insets, and tile modes become **Fill edges**; Rive scales such an image to resize it, so the box is resized here and the corners keep their size (when the scale is animated the scale is kept instead). N-sliced groups, which resize a group's shapes, import as plain groups.

Rive pointer listeners are tested **by shape**, the way the Rive runtime does it: a listener's target is under the pointer where the shapes inside it cover (their fill, whatever its colour or opacity, not their stroke and not the box around them), and every target is tested on its own, so regions that overlap are all hovered. Targets entered at the same moment act from the front of the layers to the back, so the one lowest in the layers has the last word (that is what Rive answers at an overlap). Layers that are not shown (a [solo](groups-frames) that has moved on) are not in the way. A state's animation that has played out keeps its last pose while the machine stays in that state, over the layers before it, as in Rive (it matters when a later layer holds a region view that an earlier layer's hover exit would otherwise put away). Re-import a Rive file made before this to get it.

Rive **events** become messages: a *Send message* node with the event's name, and its custom properties as the payload (an object, e.g. \`event.payload.power\`). An event keyed on an animation becomes a [timeline marker](timelines) with an *On timeline marker* node; events fired by listeners and by states or transitions (at their start or end) become *Send message* nodes in those flows, and Rive event listeners become *On message* nodes. An **audio event** also plays its embedded sound (a *Play sound* node, with the audio stored as a project asset), and an **open URL event** also opens its link (an *Open URL* node). Audio that is hosted on Rive's CDN instead of embedded is skipped, and the import report says so.

Rive **gradients** keep their exact start and end points (a radial one its centre and radius), moved into the layer's box, so they land where Rive draws them and stay put when the layer is resized; keys on the points and on the stops' colours and positions become timeline tracks (see [exact gradient points](fill-stroke#exact-gradient-points)). **Text** boxes can animate their height and origin: a fixed-size text box keeps its top left where Rive keeps it while its height or origin is keyed (lines that no longer fit are clipped or cut with an ellipsis as the box shrinks, and the vertical alignment follows the box), while the height of auto-width and auto-height text is worked out from its text, as in Rive, and its keys are ignored. **Actions on states and transitions** that set a view model property (at the start or end of a state or a transition) become *Set variable* nodes in the state's flow, next to the ones for Rive events.

Rive **view models** become shared [variables](variables): numbers, true/false, text, colours, triggers (a count that goes up when it fires) and enums (a *Choice* with the enum's options), and a list property becomes a *List* of the first items' values. Transitions and listeners that read or write them keep working. **Data binds on layers** (a view model value driving a layer's position, rotation, scale, opacity, text, fill or stroke colour, stroke width and so on) become [bindings](bindings), with the bind's converters (to text with decimals, rounding, boolean negate, range mapper, add, subtract, multiply, divide, to number, string pad and trim, formulas that are plain arithmetic) as converters. Two-way and to-source binds are brought in one way only (value to layer), and interpolating converters apply instantly.

Rive **joysticks** become [joysticks](joysticks): a joystick that has a handle layer gets that layer and its rectangle as the **Handle** and **Area**, so the timelines follow where the handle sits (inverted axes are turned round, and a joystick without a handle keeps its set position). A *listener action that aligns a layer to the pointer* (what moves a joystick handle on drag) becomes *Set property* nodes that set the layer's x and y from the pointer. Keys that move a joystick's own x and y are not imported.

Rive **layer masks** become [masks](groups-frames#masks): the masked layer goes in a group with a masking copy of the source layer (a shape, a group of shapes, an image) in front of it, and the source itself is hidden unless the mask says it keeps drawing. Inverted, luminance and inverted luminance masks keep their mode (see *Mask mode* in [Groups and frames](groups-frames#masks)); custom bounds and the mask resolution are ignored, and the report lists those.

Rive **text modifiers** become [text modifiers](text-modifiers): each range of a group is one modifier, with the group's move, turn, scale and fade (the units are letters, words or lines, ranges by percent or by index, with the offset, strength and falloff) and keys on a range or group follow onto it. Falloffs import as the *Falloff* shape, which matches Rive letter for letter (it was measured against Rive's own runtime), and ranges that combine by subtracting, multiplying, min or max, ranges limited to one text run, text follow path and per-letter variable font axes are not imported; the report lists them.

Rive **scroll constraints** make the layout a scrollable [frame](groups-frames) in the direction they scroll, and the browser scrolls it. Elastic bounce and momentum, snapping, endless and virtualised lists, drag speed and a starting offset are not imported, and neither are scroll bars (the browser draws its own). A scroll constraint the viewer cannot drag is skipped.

Rive **artboard component lists** become a frame that repeats an [instance](instances) of the item artboard once per item of the list [variable](variables), laid out along the parent's direction with its gap. Each item shows its own values: the properties of the item's view model that the item artboard reads become that instance's inputs, bound to the matching fields of the item (*Input title* bound to \`item.title\`; nested view models as \`item.style.color\`), and those variables are one per instance rather than shared. A list that shows different artboards for different kinds of items shows the first, and a list without a list property or an item artboard is skipped.


## Rive editor project (.rev)
A \`.rev\` is the file the Rive editor itself saves (the project or a backup of it), as opposed to the \`.riv\` it exports for playing. It opens through the same import as a \`.riv\`, so everything above applies, and an artboard comes out the same as the one from the \`.riv\` exported from that project. What the editor file adds:

- **Layer names.** An export strips the names of everything but artboards, animations and state machines; the editor file still has them, so layers keep names like *Hover* or *Shape 7* instead of *Group*.
- **Artboards the export leaves out.** Every artboard in the project comes in, in the order the file has them, with the project's default artboard first.
- Only fonts, images and sounds something uses come in; the editor also keeps the files it was given and never used.

The editor's own organisation (folders, the original SVG files that were imported, the position of states in the state machine graph, built-in enum tables) is skipped. Nothing about the format is published, so the reader was written from real files: if a \`.rev\` holds something it does not understand, the report says so and carries on with the rest, and a file it cannot read at all fails with a message. Export a \`.riv\` from the Rive editor and import that if it does.
## Photoshop (.psd)
![A Photoshop file after import: layers, a live text layer, and hidden layers kept hidden.](help/psd-import-result.png)

The document becomes an artboard of the same size. Every pixel layer becomes an image layer (stored as a PNG asset) at its position, folders become groups, and the layer name, visibility, opacity (including fill opacity) and blend modes carry over: normal, dissolve, multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge (add), difference, exclusion, hue, saturation, color and luminosity. Modes a browser can't draw come in as the nearest one there is, and the report lists them: linear burn as multiply, darker color as darken, lighter color as lighten, vivid, linear and pin light and hard mix as hard light, and divide as color dodge. 8 and 16 bit RGB and grayscale files import as layers. Indexed colour and CMYK files (and files with no layers) import as one flattened picture, and 32 bit, bitmap, Lab, duotone and multichannel files are not supported. Layers with nothing in them are skipped without comment.

**Text layers** become real, editable text layers: the text, font, size, colour, alignment, line height, letter spacing (tracking) and bold, italic, underline and strikethrough, with a style run for each stretch that differs (so a heading with one red word stays one layer). Photoshop stores a font as a PostScript name such as \`Montserrat-SemiBold\`; the importer turns it into a family and weight. Families that are Google fonts are added to the project's fonts so they load; any other font keeps its name and shows only where that font is installed, so check the font field in the inspector. Point text (a click on the canvas) becomes a box that does not wrap, paragraph text (a dragged box) keeps its width and height. Text with a layer mask stays real text, with the mask over it. Only text Photoshop warps, sets vertically or stores in a way the importer can't read stays a picture of its pixels. That layer is named after the text with **(text as picture)**, shows with the picture icon in the Layers panel (real text has the **T**), and the import report lists it by name with the reason, so you know which ones to retype.

**Clipping groups.** In Photoshop a layer set to *Create clipping mask* only shows inside the layer below it. Each such base and its clipped layers become a group named after the base with "(clipped)" added: the base, then a copy of the base used as a [mask](groups-frames#masks) (a picture masks by its transparency), then the clipped layers. The group carries the base's opacity and blend mode. Move or resize the base and its mask copy together, or delete the mask copy to stop the clipping.

**Masks.** A layer's pixel mask is baked into the layer's transparency. A folder's pixel mask becomes a mask picture placed over the folder, inside a wrapper group. A vector mask becomes a path layer used as a mask, in a group with the layer (edit the path to reshape the cut-out); the outline of a shape layer is not a mask and is left alone.

Not carried over, and listed in the report: layer styles and effects (shadows, strokes, glows), adjustment layers, smart-object filters, the subtract blend mode (it imports as normal), and layer comps. Each layer is stored at its full size, so a large document with many layers makes a big project.

## Illustrator (.ai) and PDF
Illustrator saves a PDF inside its files when **Create PDF Compatible File** is ticked in the save options (it is by default). The importer reads that PDF, so a \`.ai\` file saved without it can't be imported: you'll see "Save the file with 'Create PDF Compatible File' ticked", and re-saving from Illustrator fixes it. Ordinary \`.pdf\` files import the same way.

Every page becomes an artboard of the page's size (the trim box when the file has one), laid out side by side. A file with one artboard gives an artboard named after the file; with several, each is named *file / Artboard 2* and so on.

What you get is editable vector art:

- **Paths** become path layers, with fills, strokes (width, caps, joins, dashes) and even-odd fills. The positions and any scaling or rotation are applied to the points, so every shape sits where it was.
- **Colours** in grayscale, RGB, CMYK, spot (separation) and indexed spaces; CMYK is converted with an approximation, so print colours can look a little different on screen.
- **Gradients**: linear and radial gradients (axial and radial shadings) become linear and radial fills. A radial gradient is centred on its shape.
- **Clipping** becomes a [mask](groups-frames#masks): a group holding a path used as a mask in front of the layers it clips. Clips that cover everything inside them are dropped.
- **Opacity** (fill and stroke) and these blend modes: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, difference, exclusion, hue, saturation, color and luminosity.
- **Text** becomes text layers with the font name, size and colour. Pieces on one baseline join into one layer, and following lines in the same style become one multi-line layer. Fonts are matched by name, so install or [choose](text) the real font if it isn't available. Text that has no Unicode mapping in the file may show wrong characters.
- **Pictures** become image layers (PNG assets, or the original JPEG), with soft masks as transparency and stencil masks in the fill colour.
- **Layers**: Illustrator's layers become groups with the layer's name, and hidden layers stay hidden.

Not carried over, and listed in the report: pattern fills, gradient meshes, opacity masks, blend modes outside the list, live effects (the PDF holds what they produced, as paths or pictures), overprint, Type 3 fonts, JPEG 2000 and fax pictures, and encrypted files. Artboard names can't be read from the file, so they are numbered.

## AutoCAD (.dxf, and .dwg)
![An AutoCAD drawing after import: lines, a hatch and text as editable layers.](help/dxf-import-result.png)

A **DXF** file becomes one artboard of editable vector layers, named after the file. ASCII and binary DXF both work. Only the **model space** is imported; paper space layouts (sheets) are skipped and reported. If the file has nothing in the model space, its paper space is imported instead.

- **Fitting.** The drawing is scaled evenly, with the y axis flipped (CAD has y up), so its longest side is 1600 px, plus a 20 px margin. The report tells you the scale ("1 px = 5 mm") from the file's drawing units. Objects on layers that are off or frozen don't count when fitting. If a stray object far from the drawing would shrink it, the artboard shows the extents saved in the file instead and says so.
- **Layers.** Each DXF layer becomes a group with the layer's name, in the file's order. Layers that are off or frozen are imported hidden, so you can show them again. A layer with hundreds of plain lines has them merged into a few path layers (per colour, width and dash) to keep the project light.
- **Shapes.** Lines, polylines (with arc segments), circles, arcs, ellipses, splines (as cubic curves), points, solids, 3D faces (outline only) and leaders become path layers. Hatches become filled paths with their holes (even-odd), and gradient hatches become a two colour gradient.
- **Blocks.** Block inserts are expanded in place, including nested blocks, scale, rotation, mirroring and row / column arrays. Layer 0 and BYBLOCK properties follow the insert. Dimensions are drawn from the shapes AutoCAD saved with them. Attributes become text.
- **Text.** TEXT and MTEXT become text layers with their height, rotation and alignment. Formatting codes are removed and stacked fractions become *a/b*. CAD fonts aren't in the file as real fonts, so the text uses the default font and the box is an estimate: check long labels.
- **Colours.** AutoCAD colour numbers, BYLAYER, BYBLOCK and true colours all work. White (and AutoCAD's colour 7) is drawn **black**, because the artboard is white.
- **Line weights and linetypes.** CAD lines are thin, so lines without a weight are 1 px; a weight of 0.25 mm is 1 px, 0.5 mm is 2 px, 1 mm is 4 px (up to 14 px). Linetypes (dashed, dotted, ...) become dash patterns, scaled by the file's linetype scale.

Not carried over, and listed in the report: hatch pattern lines (a pattern hatch is a light tint of its colour), images, 3D solids and surfaces, multileaders, external references, infinite lines, mesh surfaces and proxy objects.

**DWG files** (the AutoCAD drawing format itself) can't be read directly: you'll see "DWG version AC1032 (AutoCAD 2018 and later): save it as DXF from your CAD program". In AutoCAD, BricsCAD, DraftSight, LibreCAD and similar, use **File > Save As > DXF** (any version; R2000 or later keeps the most) and import that file. Like Photoshop and Illustrator files, a DXF can be updated later with **Update from file…**.

## VectorCraft (.vectorcraft)
A VectorCraft file (and the older \`.drawcraft\` name) is read as editable vector art. Each artboard in the file becomes an artboard (one artboard is named after the file, several are named *file - Artboard name*), holding the artwork that touches it.

- **Layers and groups** become groups with the same name; hidden stays hidden, and opacity and these blend modes are kept: multiply, screen, overlay, soft light, hard light, darken, lighten, color dodge, color burn, linear dodge, difference, exclusion, hue, saturation, color and luminosity. A clip group or clipped layer becomes a [mask](groups-frames#masks) in front of what it clips.
- **Paths and compound paths** become path layers. Solid, linear and radial gradient fills and strokes (width, caps, joins, dashes) are kept, and an object with several fills or strokes becomes a group with one path layer for each. CMYK, gray and Lab colours are converted to RGB with a simple formula, so print colours can look a little different.
- **Live objects**: shapes keep their outline, symbols are placed as copies, Repeat objects (radial, grid, mirror) become copies, and a Blend between two paths with the same points gets its steps. Envelope distortions are not applied: the art stays undistorted. Gradient meshes become flat patches.
- **Text** becomes text layers (font, size, colour, tracking, leading, alignment and style runs). Fonts are matched by name, so check the font field when a family is not one of the Google fonts.
- **Pictures** become image layers. A picture linked to a file on disk comes across only when VectorCraft saved its preview in the file.
- **Effects**: drop shadow and outer glow become the layer's shadow, and Gaussian blur its blur.

Not carried over, and listed in the report: opacity masks, pattern fills, brushes and variable-width strokes, arrowheads, inside and outside stroke alignment, type on a path, other live effects, placed documents, and blend modes outside the list.

## PhotoCraft (.pcraft)
A PhotoCraft file is read like a Photoshop file: pixel layers become image layers (PNG assets), folders become groups, and an artboard folder becomes an artboard.

- Opacity (times fill opacity), blend modes, visibility, **clipping layers** (as in Photoshop: a group with a copy of the base used as a mask), layer masks (baked into the pixels, or a mask picture for text, shapes and folders) and vector masks (a path used as a mask).
- **Text** becomes text layers: font, size, colour, tracking, leading, alignment and style runs. Warped, vertical and on-a-path text keeps its rendered pixels.
- **Shape layers** become path layers with fill, gradient and stroke; **fill layers** become a rectangle over the canvas. Smart objects use their rendered pixels.
- A drop shadow becomes the layer's shadow.

Not carried over, and listed in the report: adjustment layers, other layer styles, pattern fills, blend modes outside the list, and mask feather. A file that is a folder rather than a ZIP archive has to be zipped first. If nothing can be rebuilt, the flattened picture saved in the file is imported instead.

## PowerPoint (.pptx)
Each slide becomes an artboard, the size of the slide, named after the file and the slide number. Older \`.ppt\` files have to be saved as \`.pptx\` in PowerPoint first.

- **Text** becomes text layers: font, size, bold, italic, underline, strike, capitals, colour, letter spacing, alignment, line and paragraph spacing, vertical anchor and the box's padding. Placeholders (titles, body text) take their position and look from the slide's layout and master when the slide doesn't set them. Bullets and numbers are typed in as characters, and a layer has one alignment, so a text box with mixed alignment takes the first paragraph's.
- **Pictures** become image layers (assets of the project), with any crop kept as a clipped frame and the alt text as the layer's label. Pictures that are only linked, or saved as EMF, WMF or TIFF, are skipped.
- **Shapes**: rectangles, rounded rectangles, ellipses, triangles, diamonds, regular polygons, stars, lines and freeform paths, with solid, gradient or picture fill, outline (width, dash, cap) and drop shadow. A shape with text becomes a group of the shape and its text. Other preset shapes (arrows, callouts, ...) are drawn as rectangles.
- **Groups** keep their position, size, rotation and flip. **Backgrounds** (colour, gradient or picture) come from the slide, its layout or its master, and the logos and other decoration the layout and master draw come across as locked layers named *Master: ...* and *Layout: ...*.

Not carried over, and listed in the report with the slides they were on: charts, SmartArt, tables, embedded objects, audio and video (the poster picture is kept), animations, slide transitions, speaker notes, arrowheads, glow and other effects, and vertical text. The result is a starting point to design from rather than a copy of the deck: for the exact look of a slide, save the deck as PDF and import that instead.

## SVG
Drop an SVG file on the canvas, paste it, or pick it with the **Image** tool. It becomes a group of editable vector layers: shapes and paths (with their transforms applied), groups, solid and gradient fills, strokes and dashes, and simple text. Masks, filters, patterns and embedded images are listed as not carried over.

## Updating a design file
A Photoshop, Illustrator, PDF, AutoCAD (DXF), VectorCraft, PhotoCraft or PowerPoint file is copied into the project when you import it, and its artboards remember which file they came from. When the designer saves a new version, bring it in with **Update from file…**:
- Select one of its artboards: the inspector's **Source file** section says **From Poster.psd (Photoshop, updated 2 h ago)** and has **Update from file…**.
- Or open the **Assets** panel: **Design files** at the top lists each file with **Update…**.

Pick the new version (it can have a new name; the artboards then say they came from that one). The editor can't notice a file changing on your computer by itself, since it runs in a web page, so updating is always this one step.

How a re-import merges (your edits are kept):
- Layers are matched by name (in the same folder, the nth layer of a repeated name), and a layer renamed in the file is recognised by its picture or text and position.
- A property (position, size, opacity, visibility, text, style, ...) the file changed is updated **unless you changed it too**: what you edited stays. Pictures that changed in the file are replaced; one you swapped for another picture stays.
- New layers in the file appear in their place in the layer order. Layers you added yourself, and all timelines, interactions and bindings, are left alone.
- A layer the file no longer has is removed. If you gave it keys, interactions or bindings it stays instead, hidden, and is renamed "(removed from file)", so nothing you built is lost. A layer you deleted here stays deleted.
- One undo step undoes a whole re-import. Pictures the file no longer uses are kept in the project (so undo can bring them back); they show as unused in the Usage tab, and **Remove unused assets** deletes them. A toast says what happened ("Poster.psd updated: 3 layers changed, 1 added").

**Forget source file**, under the button, drops the connection: the layers stay as they are and **Update from file** goes away.

Artboards that were *linked* to a file on disk before (an older way of doing this, in Chrome and Edge only) keep **Re-import now** and **Watch for changes** beside **Update from file…** in the browser that linked them.

After an import, a report lists anything that couldn't be carried over exactly. It is the whole list: nothing is skipped without a note. Press the **×** to close it.

![An import report for a DXF file.](help/import-report-dxf.png)`,
  },
  {
    id: 'export',
    title: 'Exporting',
    group: 'Import and export',
    summary: 'Single HTML file, project package, JSON, Lottie, PNG, SVG, video, GIF and PNG frames.',
    keywords: 'embed code iframe staffdesk open site export download html single file package ixp json lottie png svg image publish video mp4 webm gif frames sequence zip animation record',
    body: `**Export** in the top bar:

| Export | Gives you |
|---|---|
| Single HTML file | One file with the player, the project and every asset (big pictures as their [optimised copies](export#optimised-pictures)). Every file is inside it, so a lesson offered in lighter versions still sends all of them in the first download: see [Download size](download-size#what-the-player-loads-and-when). Upload or embed it anywhere. Google fonts are copied into the file, so opening it never calls Google (if a font can't be fetched when you export, a message says so and that font loads from Google instead). |
| Project package (${PACKAGE_EXTENSION}) | The whole project with assets at full size, to re-import or play with the player library |
| Project JSON | The document only, without asset files |
| Public interface reference…, TypeScript definitions (.d.ts) | What a page that embeds the project can set, read and hear, as a reference page and typed names. See [Public interface](public-interface). These three exports ask first when the list no longer matches the project |
| Lottie JSON (this artboard), dotLottie (this artboard) | The open artboard's shapes and timeline, for Lottie players (no interactivity). A report lists what couldn't be written |
| PNG image (this artboard), PNG image, 1× | The open artboard as a picture, at 2× or at actual size, at the timeline's playhead |
| SVG image (this artboard) | The open artboard as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |
| Video, GIF or frames… | One timeline of the open artboard as an MP4 or WebM video, an animated GIF, or a ZIP of PNG pictures, one per frame (below) |

Sharing is on its own button, **Share**, next to Export (below).

The files are named after the project (and the artboard, for pictures, Lottie and video).

## Video, GIF and frames
**Export → Video, GIF or frames…** turns one timeline of the open artboard into moving pictures you can put in a slide deck, an email or a lecture recording. It plays the timeline once through, from the start, and draws every frame at its exact time: the result is smooth however slow or busy your computer is, and it is the same drawing as **PNG image**, so a frame looks just like the canvas with the playhead there.

| Setting | What it does |
|---|---|
| Timeline | Which timeline of the open artboard to draw. It starts on the one you have open |
| Format | **MP4 video (H.264)** and **WebM video (VP9)** play almost everywhere and are small. **Animated GIF** plays anywhere, including in email, but is larger and limited to 256 colours a frame. **PNG frames (ZIP)** is one picture per frame (frame-0001.png and so on) for a video editor |
| Width | How wide the picture is in pixels; the height follows the artboard's shape. Videos always have even sides, so the width can come out a pixel smaller |
| Frames per second | Starts at the timeline's own rate (30 if it has none). GIF goes up to 50, the rest up to 60 |
| Repeat for ever | GIF only. Off, the GIF plays once and stops |

The dialog says how many frames that makes. A bar shows the progress, and **Cancel** stops it with nothing saved. Longer clips and bigger pictures take longer. The limit is 3600 frames.

Things to know:
- **No audio yet.** Sound on the timeline and narration are not mixed into the file.
- **Video and embed layers show as empty boxes**, the same as in a PNG, and a message says so when it happens. Script layers do too. Shader layers are drawn.
- **Video and GIF are drawn on white**, because neither keeps transparency the way you would want. PNG frames keep it.
- **The open theme is used**, the one in the theme box in the top bar.
- **Browsers without video encoding** (older ones, and some that block it) hide the MP4 and WebM options and say so. GIF and PNG frames always work. Which video formats appear can also depend on the size: a very large width may not be encodable.
- Interaction is not part of a clip: it shows the timeline only, with the variables at their starting values.

![The Export menu.](help/export-menu.png)

## Optimised pictures
A phone photo can be 5 MB or more, and an export or share link carries every picture inside it. With **Optimise output** on in the [Project settings](project-settings) (it is on by default), the **Single HTML file** and the **Share link** carry a smaller copy of each big picture instead, and your originals stay in the project at full size.

- The **slider** under the box goes from **Smaller files** to **Better quality**, in five steps. Each step sets how large a picture may stay (from 1280 px up to 3840 px on the long side) and how hard it is compressed. The default is **Better quality**, the fourth step. Pictures are never made bigger.
- Pictures without transparency become JPEG, and ones with transparency become WebP, so cut-outs keep their edges. Colour profiles are not carried over, and a photo that relied on one can shift very slightly.
- SVG, GIF, animated PNG and WebP, and pictures that are already small are left as they are. So is any picture that would not come out clearly smaller.
- The first export or share after a change works the copies out, which can take a few seconds for a project full of photos. They are kept on the server for each step of the slider, so the next export is quick. **Optimise pictures now** in the Project settings does that work ahead of time and says what it saves, and the [Assets panel](assets#looking-at-them) shows the saving for each picture in its Details view.
- The **Project package** and **Preview** always use the full-size pictures, and so do the PNG and SVG image exports. A share link made earlier keeps whatever it was made with until you update it.
- Turn the box off to put every picture in at full size again.

## Sharing
**Share** in the top bar (next to Export) has three ways to share a project:

| Share | Gives you |
|---|---|
| Share link… | A link that plays the project in the browser (below), and a second one, the **Link for StudyDesk**, that keeps learners' results |
| Invite to collaborate… | People who can open and edit the project with you, live, found by name, email or username (see [Collaborating](live-editing#inviting-people)) |
| Save as template… | A copy other people (or you) start new projects from, with a checklist of what to change (see [Templates](templates#save-as-template)) |
| Share for review… | A link where reviewers look at the project and leave comments, without editing it (see [Review comments](comments)) |

![The Share menu.](help/share-menu.png)

Export gives you **files**; Share gives you **links and people**. Nothing under Share downloads anything.

## Share link
**Share → Share link** publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it); links are long and random so they can't be guessed. The project's Google fonts are copied into the page when you publish, so viewers' browsers never call Google (a message tells you if a font couldn't be fetched, and that font loads from Google instead). It is a snapshot: press **Update to the latest version** to publish later changes (the page it replaces is kept: if the update was a mistake, **Revert to previous version** puts it back for everyone at once, and pressing it again switches back), or **Turn off link** to stop it working (after you confirm, the link shows a "turned off" page). The **Link for StudyDesk** is the same link, so it stops too: if learners have results or progress in the project, the confirm lists how many in each course and when each was last active, so you can tell a link a course is using this term from an old one. **Copy** copies the link and **Open** opens it in a new tab.

![The Share link dialog.](help/share-link-dialog.png)

A share link carries big pictures as their [optimised copies](export#optimised-pictures) while **Optimise output** is on in the Project settings.

**Link for StudyDesk** plays the same project but keeps each signed-in learner's score, completion and progress. Use it in StudyDesk when you set a score or tick **Remember** on variables, and see [Results and progress](results). **Results…** shows how learners did.

That link opens the **learner page**: a small page around your project that knows who the learner is from their StudyDesk session. It gives the project the learner's saved progress, keeps their results, and, when **Learner records** is on, passes on the activity that [Insights](insights) counts. Put this link in your StudyDesk page, not the plain one. A learner who isn't signed in just plays it, and their progress stays in their own browser. **Allow remix**, under the link, adds a **Remix this** button for signed-in staff who open it, which copies the project into their own projects: see [Templates, examples and remix](templates#allow-remix-on-a-share-link).

A project that uses a microphone, camera or photos (see [Microphone, camera and photos](sensors)) only works through the **Link for StudyDesk**, and the iframe that holds that link on the StudyDesk page needs \`allow="microphone; camera"\`. The **Embed code** below writes that for you. Update the link after changing what the project declares.

### Embed code
Under the Link for StudyDesk, **Embed code** is the link already wrapped in the iframe the Toolbox writes for its own items, ready to paste. Press **Copy embed code**, then in StudyDesk, StaffDesk or the open site edit the page, open the editor's **Source code** view (the \`<>\` button), paste where it should go and save. The page treats it like any other Toolbox item.

It is one code for all three sites. Each of them has the same Toolbox script and the same host for the link, so nothing in it changes between them. The host comes from the address you are using the editor on, so code copied from the test editor points at the test host: copy it again from the editor on the site the page is for.

What the code carries:
- **A title** made from the project name (for example \`Interactive: Fractions lab\`), which is what a screen reader calls the frame.
- **The shape of the project**: the start artboard's width and height as an aspect ratio, so the frame is the right height before anything loads. The page then asks StudyDesk to set the real height, and keeps asking as the project resizes, the same way the Toolbox's own items do. A project with [responsive artboards](responsive) changes shape with its width, and the frame follows.
- **\`allow="autoplay; fullscreen"\`**, so video, sound and the fullscreen button work. When the project declares the microphone or camera, \`microphone\` and \`camera\` are added; photos are a file picker and need nothing. The list follows what the project declared when the link was last updated, so press **Update to the latest version** first if you have just changed it, then copy the code again.
- **An id** (\`data-cdt-id\`) that StudyDesk uses to tell this item from the others on the page.

Updating or turning off the share link changes what the embed shows without touching the page it is in, since the code only holds the link.

For a walk-through, see [Tutorial 5](tutorial-publish).`,
  },
  {
    id: 'embedding',
    title: 'Embedding and the player API',
    group: 'Import and export',
    summary: 'Put an interactive on a page, size it, and talk to it from JavaScript.',
    keywords: 'embed iframe player api web component script host postmessage height resize toolbox',
    body: `## The simplest way
For StudyDesk, StaffDesk and the open site, use the **Embed code** in [Share link](export#embed-code): one iframe to paste into the page's Source code view, sized and labelled like any other Toolbox item.

Anywhere else, upload the **Single HTML file** and show it in an iframe. Inside the StudyDesk Toolbox the player reports its height to the page so the iframe fits (the suite's \`setILARSize\` or a \`{width: null, height, cacheID}\` message).

## The web component
\`\`\`
<script src="interactives-player.iife.js"></script>
<interactives-player src="scene.ixp" fit="contain" style="width:800px;height:600px"></interactives-player>
\`\`\`
Messages the project sends arrive as \`ix-message\` events. Add \`accessibility="off"\` to play without layer roles and keyboard operation (see [Accessibility](accessibility)). Add \`theme="Dark"\` to show one of the project's [themes](themes); without it the viewer's colour scheme and contrast settings choose, and \`ix-theme\` events report a change.

## From JavaScript
\`\`\`
import { Player, loadProject } from 'interactives-player';
const player = new Player(document.getElementById('stage'), await loadProject('scene.ixp'));
player.on('message', ({ name, payload }) => console.log(name, payload));
player.send('addToCart', { sku: 'A1' });
player.setVariable('score', 10);
player.timeline('Intro').play();
player.goTo('Checkout', 'fade');
player.setTheme('Dark');   // or null to follow the viewer
player.setData('products', [...]);
\`\`\``,
  },

  // ---------------------------------------------------------------- together
  {
    id: 'libraries',
    title: 'Libraries (shared components and styles)',
    group: 'Working together',
    summary: 'Publish components, colours, text styles and assets from one project and use them, with updates, in others.',
    keywords: 'library component share publish update detach style swatch version design system',
    body: `A **library** is an ordinary project that publishes some of its artboards as **components**, along with its named colour and text styles and the assets they use. Other projects add the library, drag its components onto the canvas, and are told when a newer version is published. It is how you keep one button, header or colour palette in step across many projects. Everything lives in the **Libraries** tab of the left panel.

## Making a library
1. Turn on **This project is a library** (Inspector, **Project** section, or **Make this project a library** in the Libraries tab). The projects page marks it with a **Library** badge.
2. Select an artboard and tick **Publish to library**. Do this for each artboard you want to offer. An artboard that a published one uses as an [instance](instances) comes along automatically.
3. In the Libraries tab press **Publish**, with an optional note. Each publish with something new in it makes the next **version** (v1, v2 ...). Publishing with nothing changed does not.
4. **Share**: tick **Everyone can use it**, or type usernames, then **Save sharing**. Only you see the library until you do. **Stop publishing** withdraws it; projects that already use it keep their copies.

## Using a library
- Under **Available libraries** press **Add**. Its components and colours appear under **Libraries in this project**.
- **Drag a component onto the canvas**, or press **Place** to put it in the open artboard. The first time, the component's artboard is copied into your project as a **library artboard** (badged *library* in the layers list) and an [instance](instances) of it is placed. That copy is only there for the instance to use, so it is kept **off the canvas**: you see one thing placed, not two. The eye on its row in Layers shows it on the canvas (and hides it again), and picking the row shows it too. Placing it again reuses the same copy. **Add artboard** copies it onto the canvas as an artboard of its own, without placing anything.
- A library artboard is **read-only**: its layers, timelines and interactions come from the library. You can move it and rename it. Variables, fonts, data sources and assets it needs are added to your project (a variable or data source you already have with the same name is left alone).
- Libraries are copied, not linked live: the artboards, assets and styles are in your project, so [exports](export) and the player are self-contained.

## Updates
When the library publishes a new version, its entry shows **Updates available**. Press it to **review**: each changed component lists what changed (layers added, removed or changed, size, timelines, interactions), and styles are listed too. Then **Update all**, or **Update this one** per component.

What is kept when you update: the instances you placed in your own artboards, their **Inputs**, their position and size, your variables (and their values), your own artboards and your own styles. A component the library has removed stays in your project as it is until you detach or delete it.

## Detach
**Detach to edit** (Inspector, or in the library's list) turns a library artboard into a normal artboard you can edit. It stops getting updates. **Stop using this library** detaches everything from it and makes its styles your own.

## Styles
**Styles** holds named colours and text styles.
- **+ Colour** and **+ Text** create one from the selected layer. A colour made from a layer's fill is also that layer's fill from then on, so changing the colour changes the layer; select other layers and press **Fill**, **Stroke** or **Text** on a style to make them follow it too. Double-click a name to rename it; the colour box edits a colour.
- **Fill**, **Stroke** and **Text** (colours), and **Apply** (text styles) set the selected layers from a style. A layer **follows** the style: edit the style, or update the library it came from, and the layer changes too. Changing that property on the layer yourself stops it following.
- A library's styles are added to your project when you add the library, kept in step on update, and cannot be edited here.

## Brand kits
A library can be published as a **brand kit**: the same thing, but what a project takes from it is locked so it stays on brand. See [Brand kits](brand-kits).

## Limits
- Components carry artboards (with their timelines and interaction graphs), variables, fonts, data sources and assets. Project **scripts** are not carried; instances do not run scripts of their own anyway.
- An update replaces a copy's content by layer id. Inputs that name a variable the library renamed or removed are left as they were.
- Only the latest version is kept on the server, so you cannot go back to an older one (undo works right after an update, and the [revision history](live-editing#revision-history) goes further back).`,
  },
  {
    id: 'templates',
    title: 'Templates, examples and remix',
    group: 'Working together',
    summary: 'Start a project from a template with a checklist of what to change, save your own, play and copy the examples, allow remix on a share link, and pull template updates in.',
    keywords: 'template starter checklist example remix copy duplicate update version save share quiz flip cards sorting branching story timeline intro review',
    body: `A **template** is a whole project saved so other people (or you) can start new projects from it. Nobody has to begin from a blank artboard, and a **checklist** walks whoever uses it through replacing the sample content, so a template's wording does not end up in front of learners. Everything is on the **Templates** tab of the projects page (next to **Projects**).

![The Templates tab on the projects page: Mine, Shared, Built-in and Examples, with a card for each built-in starter.](help/templates-tab.png)

## The Templates tab
- **Mine**: templates you saved. **Shared**: templates other people saved and let everyone use. **Built-in**: starters that come with Interactives. **Examples**: finished projects to play and copy (below).
- A card shows the picture, title, what it is for, its version, and how many things it asks you to change. **Use template** makes your own project from it, in the folder you pick.
- **New project** on the **Projects** tab opens **Start a new project**, which offers the same templates and examples as one of its choices (**Copy a project or template**, **Built-in template**, **Copy an example**) next to **Blank project**, without leaving the projects page. It makes the project the same way as **Use template** and **Make my copy** do, so a template still opens with its checklist.
- On your own templates, the pencil changes the title, description, checklist and who can use it; the bin deletes it (projects already made from it keep their content).

## Find and try a starter
The **Built-in** tab has a search box and a row of goal chips: **Everything**, **Quiz**, **Explain**, **Practise**, **Story** and **Media**, each with how many starters it holds. Type words and every one of them has to match the starter's name, description, tags or goal, so "quiz pictures" finds the picture quizzes. A chip narrows the list to what it is for (a starter can belong to more than one), and the numbers on the other chips follow your search. The tags on the cards are in plain words; the tool's own words ("question kit", "variables") are not shown but still searchable.

Every starter has a **Play** button, like the examples. It builds the starter right there and runs it the way a share link would. Nothing is saved and no project is made until you press **Use this template** in the Play window (or **Use template** on the card). Branded starters play in the colourway chosen above them.

## Use a template
1. **Templates** > pick a card > **Use template**. The window lists the checklist first, so you see what it expects of you.
2. Give the project a name and pick a folder, then **Create project**. It opens with the **Checklist** tab already open along the bottom.
3. Work down the list. **Click an item** and the editor selects the layer it is about and puts it in the middle of the canvas; change it, then **tick the item off**.
   Each item is one short action. A **Why and how** fold under it holds the detail (which panel, which variable, what to watch for): open it when you need it. Items in templates made before the fold have no detail.
4. A badge saying **Still the template's** means the layer an item points at has not been changed at all yet, even if you ticked it. **Layer deleted** means it was removed.
5. **Review** (top of the Checklist tab) before you share: it lists what is not ticked and what is ticked but untouched, each one a link to the layer. **Mark as reviewed** when you are happy. **Remove** takes the checklist away and leaves the project as it is.

![A project made from the Quiz starter, with the Checklist tab open along the bottom: one item ticked, the layer of the next one selected.](help/templates-checklist.png)

### A worked example
Pick **Quiz** under **Built-in**, then **Use template**. The checklist asks you to:
- change the title and the line under it: click the item, then double-click the text on the canvas and type;
- write your own question and answer options: click the item and look under **Question** in the Inspector;
- mark the right option and add a hint, reword the feedback, and set the points.
Tick each as you go. When all five are ticked, press **Review**. If you ticked "Change the quiz title" without actually changing it, the Review lists it under "ticked, but the layer is still exactly the template's".

## Save as template
Open a project and choose **Share > Save as template**.
- **Title** and **Description** are what the card shows. Say what the template is for.
- **Everyone can use this template** (off: only you see it). People who use it get their own copy; yours is never changed.
- **Checklist**: one line for each thing to change ("Replace the question text"). Select a layer first and press **Link** on an item to point it at that layer, or **Add for the selected layers** for one item per layer. Clicking an item later selects the layer. Reword the items for the person who will use it, not for you.
- The picture on the card is the project's own thumbnail, and the whole project (artboards, pictures, fonts, variables, interactions and [notes](notes), which are the right place to explain each part) goes with it. Review comments and results do not.
- Saving again from the same project, choosing **The next version of ...**, makes **version 2**, **3** and so on. Saving with nothing changed only updates the title, description, checklist and visibility.

![The Save as template window: title, description, who can use it, and a checklist whose first item points at the selected layer.](help/templates-save.png)

Do not leave real names, private pictures or course content in a template that is shared with everyone: anyone can use it, and the pictures go with it.

## Update from template
Projects made from a saved template remember which version they came from, and what every artboard, layer, timeline, interaction node and variable was when they were copied. When the author saves a newer version, the Checklist tab shows **Update available**. Press it to see:
- parts the template changed that **you have not touched**: they are updated, in place, with your own layers inside them left alone;
- parts the template **added**: they are added where they sit in the template;
- parts you changed: **kept as they are**, listed so you know the template changed them too;
- things you deleted stay deleted, and things the author removed stay in your project.
![The Update from template window: a changed layer and a new layer offered, and the layer the person had edited kept as it is.](help/templates-update.png)

Untick anything you do not want, then **Update**. It is one undo step (Ctrl+Z). Built-in starters are generated by the editor, so they have no newer versions to pull.

## Pre-branded templates
A template made from a project that already has a [brand kit](brand-kits) added, with some of its items placed, is a **pre-branded template**. Its card says **Brand kit**, and projects made from it start with the kit's logos and headers in place and locked, so they stay on brand. Everything else in the project is the author's to change.

## Examples
**Examples** are finished projects that ship with Interactives: the tutorial projects (**First animation**, **First interaction**, **Lamp**), layout and drawing demos, web controls, an imported Rive animation, **Bones and IK**, and the **Matching question** and **Hotspot question**. They are the same for everybody and **read only**: nobody can change one. **Play** runs it in a window without touching anything of yours; **Make my copy** puts your own editable copy in your projects (in the folder you choose), where you can change or break it freely.

## Allow remix on a share link
In **Share > Share link**, tick **Allow remix**. People who open the **Link for StudyDesk** while signed in to the editor get a **Remix this** button; pressing it copies the project into their own projects and opens it. The copy is theirs: it does not change your project, and it is not tied to it. A remix copies the project **as it is now** (not the version last published to the link), with every artboard, layer and picture, including parts the page does not show, so only allow it for projects you are happy to give away. Turn it off at any time; copies already made stay.

## Good to know
- Layer ids stay the same in a copy, so a checklist and updates can find things. Duplicating or pasting layers inside the copy makes new ids as usual.
- The server keeps a template as a snapshot with its own copy of the files, so deleting or editing the project it came from does not change it.
- Templates are one level: a copy of a template does not become a template of its own until you save it as one.
- The **Built-in** tab also has the UniSQ [branded starter packs](branded-starters): ready-made activities in a choice of colourways, with the brand locked. Every built-in starter opens with its artboards laid out in order in a tidy grid (and you can do the same to any project with **Tidy up artboards**, see [Artboards](artboards)).`,
  },
  {
    id: 'branded-starters',
    title: 'Branded starter packs',
    group: 'Working together',
    summary: 'UniSQ-branded ready-made activities in six colourways: what is locked and why, how to switch colourway, and every starter by set.',
    keywords: 'branded brand starter pack unisq colourway colourways theme logo locked open sans chrome template quiz switch colour gold purple blue green orange red',
    body: () => {
      const src = brandedHelp?.();
      const ways = src ? src.colourways.map((c) => `- **${c.name}**: ${c.description}`).join('\n') : 'Gold, Purple, Blue, Green, Orange and Red, from the UniSQ palette.';
      const list = src?.sets.length
        ? src.sets.map((set) => `### ${set.name}\n\n${set.starters.map((s) => `- **${s.name}**: ${s.description}`).join('\n')}`).join('\n\n')
        : 'The list of starters is in the editor (Templates, Built-in).';
      return `A **branded starter pack** is a ready-made activity in the UniSQ look: a gradient title page with the logo, white content pages with a footer line, and sections on deep purple. You write the content; the look is already done, and it stays done.

## Using one
Open **Templates** (on the projects page), then **Built-in**. The **Branded starter packs** section is at the top. Pick a **colourway** (the swatches; your choice is remembered in this browser), find the starter in its set, and press **Use template**. The pictures show the first page in the colourway you chose. You get a checklist of everything to change, like any other [template](templates#use-a-template): the pictures are grey placeholders, and the sample text is yours to replace. A starter with sound (the **Listening lab**) comes with short placeholder tones in the project's **Assets**, named "(replace)": use the arrow beside each one to swap in your own clip, and the **Play sound** nodes follow it. **Keep the beat** has no metronome timer to drift: one steady 16 ms clock (held back by its **Only while** until a drill is running) reads \`Date.now()\` against the start time, so every beat is exactly where it should be, and each tap is scored the moment it arrives. Its drills, tempos and how close a tap has to be are the **presets** variable (Variables tab). **Sign practice with self-review** keeps the model clip on one page, **Model clips** (one Video layer whose asset follows the sign in view: each sign in the **signs** variable names its clip, a placeholder tone in **Assets** to swap for the signer's video), and every other page shows it. Its Watch and choose half needs no camera, and its camera half records a short video take that stays on the learner's device. Each page has a phone version that stacks the model above the camera (see [Responsive artboards](responsive)), with the same layer names, so a change to wording or layout on one is made on the other too. It says plainly that it supports practice and is not feedback from a Deaf teacher, so keep that in; you also need the signer's consent and the rights to each clip. The **Live sound lab** uses the microphone as a number and records nothing: a loudness meter with a target band (steady volume, or a noise check worded as a rough guide) and eight frequency bars. Its project is set to listen only, the learner is asked once and sees a Listening bar with Stop, and a slider on each scene makes the same numbers when there is no microphone (see [Microphone, camera and photos](sensors)). Try the real microphone from the Link for StudyDesk, not Preview. Its target band, noise line and band names are variables. The **Photo prompts notebook** has a privacy pledge, about six prompts (each a photo slot, caption, tag and "why this one" box, with retake, delete and skip with a reason), a list or bingo board view (the **bingo** variable) and a hand-in page that downloads one web page with the photos inside it. Photos are only held in the page, so it tells learners to download before leaving. The **prompts** variable holds the prompts; each has a photo and example field naming two image assets, and the example is the way through for a learner with no camera. **Shadow the model** (Speaking and practice) is a few phrase cards: each plays a model clip (with a **Slow** switch that keeps the pitch), the learner records themselves, plays their take or the model then their take back to back, ticks your self-check and rates themselves. It declares the microphone, so open **Project > Microphone and camera** to see the purpose and the 30 second cap, and untick Microphone for a listen-and-repeat version. A learner who says no, has no microphone or chooses "Do not use my microphone or camera" gets the plain version (listen, say it aloud, self-check), so nobody is shut out. The recording stays in their browser, is dropped when they go to the next card and is gone on a reload, and the page says so. Each card is a row of the **cards** variable (phrase, note, sound, checks); the sound is the clip's asset, so replacing a placeholder with the arrow in **Assets** keeps the card pointing at it, and for a new row you type the clip's name in **sound**. The **Difficult conversation** and **Timed talk** rehearsals ship with an optional recording step that is switched off: tick Microphone in the same place and *Record my reply* or *Record this talk* and the play-back buttons appear, only for learners whose microphone works. The **Word cloud** (Explore and reveal) makes a cloud from a list of words and weights, \`ourWords\` (a text, a weight, and a detail and link for the dialog a word opens), with the **cloud** formula helper: sizes follow weights, nothing overlaps, and the same words always give the same picture. Words are buttons in one Tab stop with the arrow keys moving through them biggest first, and **View as list** is the text alternative with the counts. Its second page lets one learner type words and watch their own cloud grow (kept as user data, with a **blocked** list and a **minCount**). One author setting, **whoSees**, will choose Only me or Everyone in this class: Only me works now, and the class option arrives with shared responses (until then it keeps showing the learner's own words). The **Dated timeline** (Explore and reveal) is a timeline on a real scale: **events** and **eras** are lists with dates, and the **timelineLayout** helper places them for the years in view, lays the labels out in lanes so they never collide and picks the scale (decades, years, then months) as you zoom. Earlier, Later, Zoom and Fit all move the view, Next event and Previous event walk the events and the view follows, a click or Enter opens an event in a dialog, and **View as list** is the text alternative. Its page is the base of a responsive set with a portrait variant under 560 px wide (same layer names, so a change to wording or layout is made on both), and an ordering activity follows it. The simpler **Interactive timeline** is still in Drag, sort and timelines.

## Colourways
Every branded project carries all of these as [themes](themes), plus **High contrast**, which a viewer who asks for more contrast gets automatically. Every colour in the project is a theme colour, so switching colourway re-colours the whole thing at once.

${ways}

### Switching colourway
Select nothing (or an artboard) and open **Project** in the inspector. The **Colourway** swatches change the theme the project opens in. It is one undo step, and the canvas and Preview show it straight away.

Tick **Let learners switch colourway** to add a small row of swatches to the top right of the start page. Each one is a button that runs the interaction graph's **Set theme** action, so learners can pick the colour they find easiest to read. The swatches are brand layers: they stay where they are, and unticking the box removes them.

### Contrast
Every starter, in every colourway and High contrast, meets WCAG 2.2 AA: 4.5:1 for text (3:1 for large text), and 3:1 for the edge of a button, the focus ring, a progress bar against its track and chart marks. A test holds every page of every starter to it, in the states that show feedback and open dialogs too, so a colourway change can't slip under it. Things you may notice: the Orange and Red colourways carry a soft dark scrim over the gradient on the first and last pages (white words reach only 3.6:1 on the bare gradient); a button's edge is an outline in its label colour (gold buttons in Purple have a dark one); and selected outlines, bars and chart marks use the **primary** colour (purple in Purple), keeping the button colour for fills with a label on them. The keyboard focus ring is two tones, so it holds 3:1 everywhere, with nothing to choose: the **color/focus** colour (3 px) with a 2 px halo of black or white either side of it, whichever is further from that colour (white round Purple's and Blue's dark ring, black round a gold one). Whatever is behind a control, one of the two tones stands clear of it: the colour itself on the white pages, the halo on the dark ends of the Blue, Green and Purple gradients and on deep panels. The contrast test checks that on every page, first and last pages and deep panels included, and lists nothing.

## What is locked, and why
Branded projects are held to the brand so every activity looks like it came from the same place, whoever writes it.

- **Brand layers** are the logo, the sweeps, the accent bars, the footer line and the web address on the end page. They are locked: clicking on the canvas goes straight through them to whatever is behind, the selection box and Select all skip them, and in the **Layers** panel they carry a padlock and can't be selected. They can't be edited, moved, deleted or detached either. You can still delete a whole page, and add your own layers to it.
- **Colours** have to be theme colours. The colour picker offers the project's **Tokens**; typing a hex colour or picking one from elsewhere is refused with a note that this is a branded project. A new layer you draw or paste gets the nearest theme colour instead of its plain one.
- **Fonts** are Open Sans.

The accessibility checks, the [themes](themes) panel and everything else work as they do in any project. A power user can turn the lock off for a session with F9 (the brand kit override), which also lifts the brand kit lock, to fix something in the pack itself. With it on, brand layers show in the Layers panel like any layer: select one there, and press its padlock to unlock it for clicking on the canvas. Nothing is saved with it.

## The starters
Question starters share two switches and a look. **Hint** is a small pill at the top right of the question card, so the one full size button is the one that answers. The two optional extras are one project variable each, changed once in the **Variables** tab for every question: \`offerHint\` shows or hides the Hint pill, and \`allowTryAgain\` shows or hides Try again after a wrong answer (the practice starters open with both on, the Spelling test and the multi-page quiz with Try again off). A button says what happens to the answer: **Submit answer** where it is final, **Check answer** where there are tries. A button that starts a sound is disabled and reads "Playing..." until the sound ends, so it can't be pressed over itself.

${list}
`;
    },
  },
  {
    id: 'brand-kits',
    title: 'Brand kits and pre-branded templates',
    group: 'Working together',
    summary: 'A library marked as a brand kit keeps its logos, headers, colours and fonts on brand: locked in the projects that use it, while everything else stays free.',
    keywords: 'brand kit branding logo header footer locked colours fonts palette off-brand compliance template pre-branded corporate style guide',
    body: `A **brand kit** is a [library](libraries) that the people who look after your brand have published and marked as one. It carries the brand's colours, text styles, fonts and components (logos, headers, footers). A project can use it like any library, with one difference: **what comes from the kit is locked**. The rest of the project is yours.

## Using a brand kit
1. In the **Libraries** tab, a kit is badged **Brand kit** under **Available libraries**. Press **Add with starter items** to add it and have its header, footer and logo placed in the artboard you have open (whatever the kit marks for new projects). **Add** adds the kit without placing anything; then drag its components onto the canvas or press **Place**, as with any library.
2. Colours and text styles from the kit show in **Styles** with the kit's name. Use **Fill**, **Stroke**, **Text** and **Apply** as usual.
3. When the kit publishes a new version, **Updates available** appears and you review it as for any library.

## What is locked
Only the items that come from the kit. Your own artboards, layers, colours and fonts are never locked.
- **Its artboards** (the copies in your project, badged *library* and kept off the canvas) can't be edited, **detached**, deleted or copied, and **Stop using this library** is switched off. You can move and rename the artboard.
- **Text the kit marks as editable** can be changed. Double-click it, or edit it in the Inspector, and the words are yours; its font, size, colour and position stay the kit's. Your words are kept when the kit updates.
- **Instances** of a kit item in your own artboards are yours to move, rotate and fade. Their size keeps the item's **proportions**, and can go from half to double its own size; a resize outside that snaps back. Their **Inputs** are yours too.
- Colours and text styles from the kit can't be edited or deleted, as with any library. A layer of your own that follows one still stops following it if you change that property.

If something is refused, a message on screen says so. A brand kit is a guard rail, not a vault: it stops the easy ways of ending up off brand, and it can't stop you copying a layer's look by eye.

## Off-brand check
A project that uses a kit has a **Brand check** section in the Libraries tab. **Check against the brand kit** lists the colours and fonts used in your own artboards that the kit doesn't have, how many times, and on which artboards. It is only a list: nothing is blocked or changed, and a colour that is a theme token counts as the colour it holds in the default theme. The kit's colours are its colour styles and the colours of its text styles; its fonts are its text styles' fonts and the fonts it lists.

## Making a brand kit
1. Make the library as usual: a project with **This project is a library** on, and the logo, header and footer artboards marked **Publish to library**. Add the brand's **colour styles** and **text styles** in the Libraries tab (**Styles**), and the fonts they use to the project.
2. For text people should be able to change (a course title in a header), select the text layer and tick **Editable in brand kit projects**.
3. For items a new project should start with, select the artboard and set **Brand kit start** (top, bottom, a corner, or centre). **Add with starter items** places those.
4. **Publish**, share it (**Everyone can use it**), then tick **This is a brand kit**. The projects that already use the library pick up the lock the next time they open the Libraries tab.

**Who can do this:** only the people who look after brand kits can mark one, and publish a new version of or withdraw one that is marked. The server decides, as it does for the power-user view on the [projects page](projects#who-sees-what): power users, plus anyone in the group the administrators name for brand kits. Anyone else who owns the library project can still edit it, and sees that it is a brand kit, but can't turn that on or off, and the server refuses a new version from them.

## Pre-branded templates
Add a kit with **Add with starter items**, set up the rest of the project, then **Share > Save as template** ([Templates](templates)). The template remembers the kit: its card says **Brand kit**, and a project made from it has the kit added and its items locked from the start. Updates of the kit reach those projects like any other library update.

## For brand kit managers
Power users (and the brand group) can switch the lock off while they work, with **F9** (or Ctrl+F8) in the editor. A banner says it is off. They can then edit, copy, delete and detach kit items; the banner goes and the lock is back when they press F9 again or reload. Nothing about it is saved in the project.

## Good to know
- The lock lives in the editor, as library read-only does. It isn't a server-side check on every save, so treat it as policy support, not security.
- A kit marked after projects copied it locks those copies the next time they open the Libraries tab. A kit no longer marked unlocks them the same way.
- Colours and fonts the kit carries are the ones in its styles; theme tokens are not part of a library.`,
  },
  {
    id: 'live-editing',
    title: 'Live editing and saving',
    group: 'Working together',
    summary: 'Several people in one project, autosave, revisions and conflicts.',
    keywords: 'multiplayer collaborate live share presence cursor save autosave conflict undo revision history version restore save failed too big retry offline',
    body: `Everything saves as you work. A project can be opened by its owner, by people the owner has invited to collaborate (below), and by staff with power-user access (see [Projects page](projects#who-sees-what)); to let anyone else play it, use a [share link](export#share-link). When more than one person opens the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.
- If the server refuses a batch of changes for good (too large, not allowed), live editing stops with a message and the whole project is saved the normal way instead. A temporary server error is retried, waiting a little longer each time.
- The server writes the project to its database a second after the last change, and at least every 10 seconds while people keep working. If that write fails, everyone in the project sees **Save failed** with **Not saved yet** and the reason, and a message says so once. Your changes are kept on the server, which keeps trying by itself; when it gets there the label goes back to **Saved** and a message says **Saved again**. Keep the tab open until then.

## When a save fails
The label next to the project name says **Save failed**; hover it for the reason.
- **Could not reach the Interactives server**, or **The server could not save this project**: the network or the server had a problem. The editor tries again by itself, waiting a little longer each time (up to a minute), and straight away when your computer is back online. Keep the tab open; nothing you did is lost.
- **This project is too big to save**: the project is over 64 MB. Large pictures or data pasted straight into layers are the usual cause. Put pictures in the [Assets panel](assets) and point layers at them instead; then the next change saves.
- The red conflict bar: someone else saved first (below).

Very big projects are fine: the server splits anything too big for one database record into parts and puts them back together when the project opens.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **Revision history** button (the clock) in the top bar. The list on the left shows each version with its date and how long ago it was; click one to see a picture of it and a count of its artboards and variables. **Restore this version** asks **Restore version** in a dialog first. What is there now is saved in the history before the restore, so you can come back to it, and the page reloads with the restored project.

**Named versions.** **Save a named version…** keeps the project as it is right now under a name you choose ("Sent to the coordinator", "Before the redesign"), and pins it. **Name it** (or **Rename**) names any version in the list, and **Pin** keeps one. Pinned versions show a pin and their name in the list, and are never cleared out of the history however old they get; a project keeps up to 20. **Unpin** lets one be cleared like the others, once 100 newer ones have built up.

![The Revision history dialog.](help/revision-history.png)

## When two copies disagree
If the project was saved from another tab, or by someone else without live editing, a red bar says **This project was changed in another tab or by someone else since you opened it. Your edits are not saved.** **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Pick carefully: the other one is lost (the revision history may still have it).

## Inviting people
**Share → Invite to collaborate…** lets other people open and edit the project with you.

1. Open the project and choose **Share**, then **Invite to collaborate…**.
2. Start typing their name, email or username. A list of matching people appears: pick the right one and they are invited at once. If you already know their StudyDesk username (for example *u1234567*) you can type it and press **Invite**.
3. They are listed under the box. The bin beside a name takes them off again (you are asked first, and their changes stay).
4. The project now shows on their own projects page, marked *shared with you by* your name. When you both have it open you see each other's cursors and changes live.

![The Invite to collaborate window: a search box for a name, email or username, and the list of people already invited.](help/invite-dialog.png)

Only staff who have used the StudyDesk Toolbox before can be found by name, and students are never listed. Someone who isn't found can still be invited by typing their exact username. Collaborators can edit, comment, export and share it; only the owner can delete the project, clear its results or change who's invited (a collaborator can take themselves off the list).

To hand a project to someone else (you're leaving, or it belongs to another unit now), invite them first, then press **Make owner** beside their name. They become the owner and you stay on as a collaborator. The project keeps its id, so its share link, the **Link for StudyDesk** in every course page and a library published from it carry on working. A power user can do this for anyone's project, which is how a project is moved on when its owner has already left. To let someone look and comment without editing, use **Share for review** instead ([Review comments](comments)).`,
  },

  {
    id: 'notes',
    title: 'Notes',
    group: 'Working together',
    summary: 'Sticky notes for the people making a project: draw them on the canvas, attach them to a layer, and know that players, exports and share links never see them.',
    keywords: 'note notes sticky annotation annotate hand-off handoff todo reminder explain template hint hide show colour markdown',
    body: `A **note** is a small sticky note you leave on the canvas for whoever edits the project next, including you next week: "swap this photo before release", "this branch is for the hard version", "change the three red words". Templates use them to explain what each part is for.

The interaction graph has notes too: see **Notes on the graph** in [Interactions](interactions). They are the same notes, hide with the same eye button, and never reach players either.

Notes are not comments. [Review comments](comments) are threaded conversations with reviewers, kept on the server beside the project. A note is part of the project document, so it comes along when the project is copied, saved as a template or remixed, and everyone editing at the same moment sees it appear. It is **never** a layer: it is not in the Layers list, the interactions graph, auto layout or bindings.

## Players never see notes
A note is never drawn when the project is played, in **Preview**, in the **Single HTML file**, a **share link**, a **Link for StudyDesk**, an embed, the review page, or a **PNG**, **SVG**, **Lottie** or **GIF** picture of an artboard. The text is also taken out of the project data those pages carry, and the server takes it out again when a page is shared, so it is not in anything that plays. The **project package (.ixp)** and the **project JSON** are for editing, so they keep notes.

## Add a note
Pick the **Note** tool (<kbd>S</kbd>, in the tools bar next to **Comment**) and click, or drag out the size you want. A note drawn on an artboard belongs to that artboard and moves with it (it can hang outside the artboard's edge). A note drawn on empty canvas belongs to the canvas itself. Type straight away; <kbd>Esc</kbd> or a click elsewhere finishes, and a note left empty goes away.

- **Move** it by dragging it, **resize** it from its bottom right corner.
- **Double-click** it, or press <kbd>Enter</kbd> with it focused, to change the text.
- With a note picked, a small bar above it sets the **colour** (yellow, orange, green, blue, purple or pink), **attaches** it to the layer you have selected on the same artboard, and **deletes** it. <kbd>Delete</kbd> removes a picked note too.
- Notes are small on purpose. They grow with the zoom but never get tiny or huge, and a picked note has a gold outline.

Keyboard: <kbd>Tab</kbd> reaches every note on the canvas. With one focused, the arrow keys move it (<kbd>Shift</kbd> for 10), <kbd>Alt</kbd>+arrows resize it, <kbd>Enter</kbd> edits it, <kbd>Delete</kbd> removes it and <kbd>Esc</kbd> lets go. Every button on the bar has a label for a screen reader.

## Attach a note to a layer
Select a layer, pick a note on the same artboard and press **Attach to the selected layer**. The note now follows that layer when it moves, scales or rotates, and its header says which layer it is on. Dragging the note changes how far it sits from the layer. Delete the layer and the note stays where it was (its outline turns dashed). **Detach** lets go. Canvas notes cannot be attached.

## What a note can say
Plain text with a little markdown:

| Write | Shows |
|---|---|
| \`**bold**\`, \`*italic*\`, \`code\` | **bold**, *italic*, \`code\` |
| \`- an item\` | a bullet |
| \`[ ] a task\` and \`[x] a done task\` | a tick box you can click on the canvas, which rewrites the text |

Nothing in a note is ever treated as markup.

## Show and hide notes
The eye button beside the **Note** tool shows or hides every note on your canvas, and its badge counts them. It is your own preference (also under **Preferences > Show notes on the canvas**), so putting a template's explanations away changes nothing for anyone else. Notes are never drawn while you Preview.

## Notes and templates
A project made from a template starts with the template's notes, so the explanations arrive on the canvas next to the parts they are about. **Save as template** keeps your notes. **Update from template** leaves your notes alone. Hide them with the eye button once you have read them, or delete them.

## Working together and undo
Adding, typing in, moving, recolouring and deleting a note are ordinary edits: they undo with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, save with the project, and appear live for the other people in the project (and for an AI agent, which can list, add, edit and remove notes).`,
  },

  {
    id: 'comments',
    title: 'Review comments',
    group: 'Working together',
    summary: 'Pin notes to a layer or a spot, reply, resolve and assign them, and collect comments from reviewers with a review link.',
    keywords: 'comment comments review reviewer feedback note pin thread reply resolve assign assignee mention notify notification guest share link subject expert',
    body: `Comments are notes pinned to the project. Subject experts and reviewers can say what they think right where it applies, and you can reply, hand a note to someone, and tick it off when it is dealt with, instead of collecting email and screenshots.

Comments are kept on the server apart from the project. They are never part of the project file, an **export**, a **.ixp package**, a **share link** or **Preview**, and a duplicate of the project starts with none. Deleting the project deletes its comments.

![The Comments tab with two open conversations, and the first one open on the canvas: its pin follows the Bulb layer, with Resolve, Assigned to and a reply box.](help/comments-panel.png)

## Leaving a comment
Pick the **Comment** tool (<kbd>C</kbd>) and click where you want to say something. If there is a layer under the click, the note is pinned to that layer at that spot, so the pin **follows the layer** when it moves, scales or rotates. If the layer is deleted the pin stays where it was, drawn with a dashed edge, and the **Comments** panel says the layer is gone. A click on empty artboard pins the note to that point of the artboard.

Type the note and press **Comment** (<kbd>Ctrl</kbd>+<kbd>Enter</kbd> sends too). Type **@** to mention someone from the list of people in the project. As the owner you can pick an **Assign to** person as you send it.

## Replies, resolve and assign
Click a pin to open its conversation next to it. Reply in the box under it; edit or delete your own messages (the owner and power users can delete any). **Resolve** marks a conversation as dealt with and **Reopen** brings it back. **Assigned to** hands it to a person from the list: the owner, and everyone who has commented. They are told (see below), and it shows under **Assigned to me** in their Comments panel.

Pins are numbered. A resolved pin turns grey with a tick, a pin handed to you has an amber ring, and the one that is open has a halo. **Escape** puts a conversation away.

## The Comments panel
The **Comments** tab beside Layers lists every conversation with its first words, where it is, who wrote it and how many replies it has. Click one to go to it: the artboard, the layer, the pin in the middle of the canvas and its conversation open.

Filter by **Open**, **Resolved** or **All**, by **Everyone**, **Mine** (conversations you took part in) or **Assigned to me**, and by **artboard**. The eye button hides the pins on the canvas (your choice is remembered in this browser); the panel still lists them. The number on the tab is how many are open. The projects page shows the same number on each project's card, ringed in amber when some are for you.

## The review link
In **Share**, **Can comment: review link** makes a second link, apart from the share link. Send it to reviewers. They see the project as it is now, one artboard at a time as a still with the pins on it, can open any artboard from the top, **Play** the real thing, and leave, reply to and resolve comments. They cannot change the project. Because the page always reads the project as it is, there is nothing to update when you change it.

- **Signed in to StudyDesk** (open the link from StudyDesk): comments carry the reviewer's own name. They can resolve, and edit or delete their own.
- **Let people comment without signing in**: anyone with the link can comment after giving a **display name**. Guests are marked *(guest)*, cannot resolve, assign or mention, and are limited to a few comments every few minutes per address and per link. Leave this off when the project is not meant for people outside StudyDesk. Without it, the link asks for a signed in StudyDesk user.
- **Turn off review link** ends the link at once, including for anyone who has it open. The comments are kept.

Anyone who has the review link can read the whole project, as with a share link. The link is long and random so it cannot be guessed; do not post it anywhere public.

## Notices
When a conversation is **assigned to you**, you are **mentioned**, or someone **replies** in a conversation you are in, you are told: a message appears while a project is open, and a bell on the projects page counts what is unread. Opening the project clears its notices. Turn this off with **Comment notices** in [Preferences](preferences). There is no email.

## Live
Comments arrive for everyone looking at the project as they are written, in the editor and on the review page, without reloading. If the connection drops, *offline* shows in the panel and anything missed is fetched when it is back.

## Limits
A note is up to 2000 characters, a conversation holds 200 messages, and a project 1000 comments. See [Keyboard shortcuts](shortcuts) and [Share links](export#share-link).`,
  },

  {
    id: 'ai-agents',
    title: 'AI agents (MCP)',
    group: 'Working together',
    summary: 'Let an AI agent join your editing session to build, change and debug alongside you.',
    keywords: 'ai agent claude mcp model context protocol assistant automation llm copilot url connect http',
    body: () => {
      // The address of this editor, read from the page, so the commands below are the ones to paste for this server.
      // Read outside a browser (the MCP server's read_reference), there is no page, so it shows placeholders
      const page = typeof location !== 'undefined' && /^https?:$/.test(location.protocol) ? location : null;
      const base = page ? `${page.origin}${page.pathname.replace(/\/(index\.html)?$/, '')}` : 'https://<your server>/interactives';
      const url = `${base}/mcp?agent=Claude`;
      let sid = '';
      try {
        const v = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('sessionID') : null;
        if (v && v !== 'null') sid = v;
      } catch {
        /* no storage */
      }
      const session = sid || '<your session id>';
      return `An AI agent can join a project like another person: it shows in the top bar as **<name> (AI)**, its edits appear for everyone as it makes them, and it can see what you have selected, so you can say "make the selected button pulse when hovered".

It connects to this editor's **MCP server** over the network. There is nothing to download or install: any MCP client that can use an HTTP server (Claude Code, Claude Desktop and others) only needs the address below.

## A first conversation
1. Open a project in the editor, so you can watch.
2. Add the MCP server to your agent (below).
3. Ask the agent: *List my projects, then join the one called Lamp.* A person called **<name> (AI)** appears in the top bar.
4. Select a layer yourself, then ask: *Make the selected button pulse when I hover over it.* The agent reads your selection and makes the change while you watch.
5. Ask it to run **validate** when it is done, to find broken references and expressions that don't parse.

## Setting it up
The MCP server for this editor is at:

\`\`\`
${url}
\`\`\`

In **Claude Code**, run:

\`\`\`
claude mcp add --transport http interactives "${url}" --header "X-Session-ID: ${session}"
\`\`\`

For a client set up with a JSON file (Claude Desktop and most others):

\`\`\`
{
  "mcpServers": {
    "interactives": {
      "type": "http",
      "url": "${url}",
      "headers": { "X-Session-ID": "${session}" }
    }
  }
}
\`\`\`

Use the **Copy** button on each box.

${
  sid
    ? `> The \`X-Session-ID\` above is **your** sign-in for this tab. The agent can open and change whatever you can, so treat it like a password and don't paste it anywhere shared. It stops working when your StudyDesk session ends: open this page again for a fresh one and update the setting.`
    : `> **<your session id>** is your StudyDesk sign-in. Open this page from the editor while signed in and it is filled in for you. Without one the agent sees what a signed-out visitor sees, which on most servers is nothing.`
}

| Part | Meaning |
|---|---|
| \`?agent=Claude\` | The name people see in the top bar, as **Claude (AI)**. Change it to anything (up to 40 letters) |
| \`X-Session-ID\` | Who the agent works as. It can only open the projects that session can open. \`Authorization: Bearer <session id>\` works too |

## What the agent can do
| Tool | Does |
|---|---|
| list_projects | Your projects |
| join_session | Joins a project's live session; reports who is there and what they have selected |
| leave_session | Leaves the session |
| get_selection | The layers each person has selected, in full |
| get_overview, get_layers, get_interactions | Read artboards, layer trees, timelines, variables, interactions |
| edit | Add, change, move and delete layers; add artboards, variables, timelines, interactions and scripts, in one batch |
| validate | Find broken references, unconnected events and expressions that don't parse |
| read_reference | These help pages, plus generated references for layer fields, interaction nodes and animatable properties |

## Staying in control
- Everything the agent does goes through the same live editing as people, so you watch it happen.
- Your **Undo** only undoes your own changes. To roll back an agent's work, use the [revision history](live-editing#revision-history) (a snapshot is kept every few minutes while the project changes). A snapshot that has an agent's changes in it says so, for example **Autosave (edited with Claude (AI))**, so you can find the version from before it started. **Save a named version…** there first is the surest way back.
- The agent can only open projects its session can open.
- An agent that goes quiet for two hours is disconnected and leaves any project it was in. Its client reconnects by itself the next time it is used.
- The people who run the server can switch agent access off altogether. Then connecting says **AI agent access is turned off on this server**, and that is not something you can change from the editor.`;
    },
  },

  // ---------------------------------------------------------------- reference
  {
    id: 'animatable-properties',
    title: 'Animatable properties',
    group: 'Reference',
    summary: 'Every property timelines, bindings and the property nodes can change.',
    keywords: 'property properties animatable list prop path',
    body: () =>
      `These properties can be keyframed, bound to an expression, and changed with **Set property** and **Animate property**. The path (left) is what scripts use: \`ix.node('Box').set('fill.color', '#f00')\`.\n\n| Path | Property | Kind |\n|---|---|---|\n` +
      ANIMATABLE_PROPS.map((p) => `| \`${p.prop}\` | ${p.label} | ${p.kind} |`).join('\n'),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting and common questions',
    group: 'Reference',
    summary: 'Quick answers: the box won\'t move, a layer can\'t be selected, text shows braces, imports and links, saving conflicts.',
    keywords: 'troubleshoot problem help faq not working stuck cannot cant why does nothing happens missing wont move select locked hidden record keyframe blank preview conflict save link reconnect dwg cors autoplay',
    body: `Short answers to the things new users ask most. Each links to the page with the full story.

## Animation
**My layer doesn't move when the timeline plays.**
A track needs **two or more** keyframes. With one key it just holds that value. Add a second at another time. See [Tutorial 1](tutorial-first-animation).

**I'm in Record mode but nothing is keyed.**
- The **Timeline** tab must be open, with a timeline chosen. In **Design view (no timeline)** changes are ordinary edits.
- The property must be one that can animate (see [Animatable properties](animatable-properties)).
- A property driven by a [binding](bindings) can't be keyed. Remove the binding first.

**The timeline plays once and stops.**
Set **Play once** to **Loop** or **Ping-pong**, and tick **Autoplay** if it should start by itself. See [Timelines and keyframes](timelines).

**An edit I make shows up as a keyframe I didn't want.**
Record is still on. Press the red dot to switch it off.

## Selecting and seeing layers
**I can't click a layer on the canvas.**
It is probably **locked**, or **hidden** (shown as a faint ghost). Hover it for the badge that unlocks or shows it, or use the eye and padlock in the Layers panel. See [Layers, hidden and locked layers](layers-panel).

**A layer is in the editor but not in Preview.**
Check that it is **Visible**; that it isn't hidden by a **Solo** group's active child; that it sits inside the artboard (**Clip content to artboard** hides what is outside in Preview and in exports; on the canvas the part outside shows faintly); and that no mask above it is clipping it. See [Groups and frames](groups-frames).

**A field is greyed out and has a link icon.**
It is bound to an expression. Remove the binding in **Data bindings** to edit it by hand. See [Bindings](bindings).

## Text, variables and expressions
**My text shows \`{score}\` instead of the number.**
The variable needs to exist with exactly that name (it's case sensitive). Make it in the **Variables** tab. To show a real brace, write \`{{\`. See [Variables](variables).

**It says "Use letters, digits and _ only".**
Variable and data source names are used inside expressions, so they can't contain spaces or dashes. Try \`high_score\`. A variable whose name is empty or not valid is not saved: it stays in the field as a draft, with this message, and the project keeps the last good name until you fix it.

**A script does nothing.**
Open **Preview** and look at the **Events** list for an error message. Scripts in the sandbox can only use \`ix\`, timers and \`console\`. See [Scripts](scripts).

## Importing and updating design files
**The designer saved a new version of the Photoshop (or Illustrator, ...) file.**
Select one of its artboards and press **Update from file…** in the inspector, or **Update…** beside it under **Design files** in the Assets panel, then pick the new file. Your own edits are kept. See [Updating a design file](import#updating-a-design-file).

**A bar asks me to Reconnect.**
That's an artboard linked to a file on disk the older way. Press **Reconnect** to let the browser read it again, or just use **Update from file…**.

**"The linked file was moved, renamed or deleted."**
Use **Update from file…** and pick it where it is now.

**An Illustrator file says to save with "Create PDF Compatible File".**
Re-save it from Illustrator with that option ticked. **A DWG file** must be saved as DXF first. See [Importing](import).

## Beta tester questions
**Where is the version number?**
Hover the small **(i)** icon beside **Help** (on the help page and the projects page), or the one in the title bar of **Preferences**: it reads like \`Version 0.5.0 · build 1a2b3c4.5d6e7f8\`. Click it to copy it, and put it in any problem report. See [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).

**A tool I'm looking for isn't in the tool bar.**
Some groups start folded. Click **Media** (text, script layer, shader layer, video, image), **Web** (button, input, link, embed, Add question) or **Rig** (bones) to open them. See [The editor at a glance](interface).

**A faded layer won't take clicks in Preview.**
A layer that is partly see-through lets the pointer through. Tick **Clickable while see-through** in its **Interactions** section. See [Interactions](interactions).

**I invited someone and they can't see the project.**
They need to be signed in to StudyDesk, and to reload their projects page. Check you picked them from the list, or typed their username exactly. See [Live editing and saving](live-editing#inviting-people).

**The Link for StudyDesk shows no Results or Insights.**
Both only count learners who are signed in to StudyDesk and opened the **Link for StudyDesk** (not the plain share link) while it was on. After you change score or record settings, press **Update to the latest version**. See [Results and progress](results) and [Insights](insights).

## Saving and sharing
**The label says Save failed.**
Hover it for the reason. A network or server problem is retried by itself until it works, so keep the tab open. **This project is too big to save** means it is over 64 MB, usually because of a large picture pasted into a layer: move it into the Assets panel. See [When a save fails](live-editing#when-a-save-fails).

**A red bar says the project changed in another tab or by someone else.**
Another copy saved first. **Reload theirs** brings in what is saved, and **Overwrite with mine** keeps your version. Pick carefully: the other one is lost. See [Live editing and saving](live-editing).

**Undo doesn't undo someone else's change.**
Undo only undoes your own changes. Use the [revision history](live-editing#revision-history) to go back further.

**A video doesn't autoplay.**
Browsers only autoplay *muted* video. Tick **Muted**.

**Data from a web address doesn't load.**
The address must allow cross-origin requests (CORS) from where the interactive is shown, and, if the project lists **Allowed data hosts**, its host must be on the list. See [Data sources](data-sources).

**A formula with a pattern (\`/…/\`) says "Pattern not allowed", or its \`{…}\` shows as written in text.**
The pattern could freeze the page on some text, so it is refused. See *Patterns* in [Expressions](expressions#patterns-regular-expressions).

## The editor itself
**The page zooms when I scroll.**
That's the default. Set **Mouse wheel** to **Pan (Ctrl+wheel zooms)** in [Preferences](preferences).

**A shortcut doesn't work.**
Shortcuts are ignored while a text box is focused. Click the canvas first. See [Keyboard shortcuts](shortcuts).

**Export doesn't have my share link any more.**
Sharing moved to its own **Share** button next to Export. See [Exporting](export#sharing).

**Where's my project?**
Check the projects page for an active folder, tag or search (the **Clear filters** button resets them). You only see your own projects. See [Projects page](projects).`,
  },
  {
    id: 'help',
    title: 'Using this help',
    group: 'Reference',
    summary: 'Search, tooltips and help links.',
    keywords: 'help docs search tooltip question',
    body: `- **Search**: press <kbd>Ctrl</kbd>+<kbd>K</kbd> anywhere for quick search, or type in the drawer's **Search help** box. Type a few words and press <kbd>Enter</kbd> to open the best match.
- **The Help button** (top bar, or <kbd>?</kbd>) opens the page for whatever is highlighted, in this order: the **field** you last clicked in Properties (its section's page, or its own when it has one); the **node** selected in Interactions or the **keyframe** selected in the Timeline, while that is the panel you are working in; the **tool** you picked on the tool bar (not Select or Hand); the **layer type** you selected (Chart, Text, Button, Rectangle...); a selected **artboard** or **page master**; the **panel** you last worked in; then the general help. Its tooltip names what it will open, and the drawer says "Help for Chart layer" at the top with a **Back to general help** link. Only selection and focus count, not what the pointer is over. The tool bar has no Help button of its own: right-click it for **Help for the tools**. <kbd>Ctrl</kbd>+<kbd>K</kbd> is the quick search.
- **Home, Back and Forward**: the three buttons at the left of the drawer's top. **Home** is the welcome page. **Back** and **Forward** walk through the pages and sections you have visited (links, search results and the Help button all count), and each page comes back scrolled to where you left it. <kbd>Alt</kbd>+<kbd>Left</kbd> and <kbd>Alt</kbd>+<kbd>Right</kbd> do the same while the drawer has the focus, and so do the mouse's back and forward buttons over it. The history is kept when you close the drawer, so Back from a new Help button press returns to what you were reading. The full help page (the **new tab** button) uses the browser's own Back and Forward, since each page has its own address.
- **While Preview is open**: Preview sits above the help drawer so it never covers its controls. Asking for help then (the Help button, <kbd>F1</kbd>, <kbd>?</kbd>, a **?** link or <kbd>Ctrl</kbd>+<kbd>K</kbd>) opens the help in a new window instead. <kbd>Esc</kbd> closes Preview, not a drawer behind it, and Tab stays inside Preview until you close it.
- **The Help link** is also on the projects page.
- **Getting started**: the five tutorials start at [Tutorial 1](tutorial-first-animation). Stuck? [Troubleshooting and common questions](troubleshooting).
- **Contents**: the list on the left groups every page. In the narrow drawer, the button at its top left shows and hides it. **Previous** and **next** links at the bottom of each page walk through them in order.
- **Pictures and clips**: click a picture to open it full size. Clips play on a loop without sound, and have controls if you want to pause.
- **Tooltips**: hover a button or a field's name for a short explanation. Turn them off in [Preferences](preferences).
- **Version**: the small **(i)** icon beside **Help** (and in the help drawer, the <kbd>Ctrl</kbd>+<kbd>K</kbd> quick search and Preferences) shows the version you are running when you hover it, and copies it when you click it. Include it when you report a problem: see [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).
- **? links**: inspector sections have a **?** that opens their page here. The panels' tabs don't have one: use the top bar's, or right-click the tab.`,
  },
];

export function topicBody(t: HelpTopic): string {
  return typeof t.body === 'function' ? t.body() : t.body;
}

export function getTopic(id: string): HelpTopic | undefined {
  return TOPICS.find((t) => t.id === id);
}
