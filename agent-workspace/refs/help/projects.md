# Projects page
Start a new project (blank, a copy, a built-in template or an example), open, duplicate, import and delete projects, and organise them with folders, tags, search and sort.

The projects page lists the projects you own. Each card shows a picture of the project's start page, its name, when it last changed, how many pages it has, its tags and a folder menu.

![The projects page: Tutorials, Help, Import and New project at the top right, the folder list and the Bin on the left, the search box, sort menu and Thumbnails or Details switch along the top, and a card for each project.](help/projects-page.png)

## Making and opening projects

- **New project** (top right, or the **+** card) opens **Start a new project**, one window with four ways to begin. Pick one on the left (<kbd>Up</kbd> and <kbd>Down</kbd> move between them), then give the project a name and a folder at the bottom and press **Create project**. It opens straight away.
  - **Blank project**: one empty page called **Home**, with the Light, Dark and High contrast themes. Your default font (Open Sans unless you changed it) is added to it. See [Preferences](preferences).
  - **Copy a project or template**: a list of your own projects, your own templates and the ones shared with you. A project is copied whole, with its pictures, and the copy is called **Copy of ...**. A template opens with its checklist, as under [Templates](templates).
  - **Built-in template**: the starters that come with Ixia, shown with their pictures.
  - **Copy an example**: the finished examples, shown with their pictures. You get your own copy to change.
  
  The search box above each list filters it as you type. Press <kbd>Down</kbd> to move from the search box to the list, the arrow keys to move through it, and <kbd>Enter</kbd> to create the project from the one you picked. <kbd>Esc</kbd> closes the window without making anything. The name starts as something sensible and follows what you pick until you type your own. The folder starts as the one you were looking at, and you can change it.
- Click a card's picture to open the project. **Help** and the gear (**Preferences**) are at the top right too.
- **All projects** (the house in the editor's top bar) brings you back here, with the project you left highlighted for a moment.
- The **Tutorials** button (next to **Help**) lists every tutorial as a card, each with its finished example to open or copy, and keeps your progress and badges. See [Tutorials, badges and progress](help#tutorials-badges-and-progress).
- The **Templates** tab (next to **Projects**) starts a project from a template, or from one of the finished examples. See [Templates, examples and remix](templates).
- **Import** (also the **import a file** link on the **+** card) brings in a file. You can choose:
  - A `.ixp` package (a whole project with its assets) or a project JSON file. It comes back as a project of its own, and importing the same file twice gives you two copies.
  - A design or animation file: Lottie (`.json`, `.lottie`), Rive (`.riv`, `.rev`), Photoshop (`.psd`), Illustrator (`.ai`), PDF, AutoCAD (`.dxf`), VectorCraft (`.vectorcraft`), PhotoCraft (`.pcraft`) or PowerPoint (`.pptx`). It becomes a **new project**, and a design file remembers which file it came from so you can update it later. See [Importing](import) and [Tutorial 4](tutorial-import-design).
- Each card has three icon buttons: **Duplicate** (a copy of the project and its assets), **Export** a `.ixp` package (a download of the whole project) and **Delete**. Delete asks first, then moves the project to the [Bin](projects#the-bin), with an **Undo** straight after. If its share or review link is on, or learners have results or progress in it, the question says so, with the courses, how many learners each has and when they were last active.
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
- While a project is open, the browser tab is named after it (**Pumpkin parts - Ixia**), so two projects open side by side can be told apart.
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

You see your own projects and the ones other people have invited you to collaborate on (their cards say *shared with you by* and the owner's name; see [Inviting people](live-editing#inviting-people)). Staff with power-user access can toggle the power-user view (the suite's shared shortcut, shown in a banner as **F9**) to see and open every project; the server checks that access again. In that view you can also file and tag other people's projects.
