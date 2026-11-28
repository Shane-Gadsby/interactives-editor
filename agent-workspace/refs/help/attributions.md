# Attributions and references
Keep a list of where the pictures, sounds, text and data came from and what the project draws on, link entries to assets, and choose whether learners get a Credits button.

Most projects use something somebody else made: a photograph, a sound, a passage of text, a data set, a font or a script. Many licences ask for a credit when you do, and a good course also says what it draws on. The **Attributions** tab (bottom panel) is where you keep that list. It is optional: nothing in the project needs it, and a project that never uses it carries nothing extra.

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
- **Show a Credits button to learners** adds a small, quiet **Credits** button in the bottom left corner of the page. It sits inside the page, so when the page does not fill the player (a wide page in a tall frame) it stays on the page and never out in the empty space round it. It opens a dialog with the list as readable citations, under the heading you choose (the default is *Credits and references*). Links open in a new tab. It works from the keyboard: the dialog takes focus, <kbd>Tab</kbd> stays inside it, <kbd>Esc</kbd> or **Close** shuts it and focus goes back to the button. It also works on a shared link, where the page runs in its sandbox.
- **Keep the list in exported and shared pages** puts the list (without your notes) into pages you download or share even when there is no button, for anyone who reads the page's data. While the button is on this is always the case, since the button needs the list.
- With both off, the list is your own record. It stays in the editor, in the project file (**Export** as `.ixp` or JSON) and in templates made from the project, notes included, and the pages you export and share carry none of it.

The same two settings are in the **Credits** section of the project settings (see [Project settings](project-settings)). Preview shows the button when it is on.

## A Credits button of your own
The automatic button has one fixed place. To put Credits where it suits the page, draw a small button or link, give it an **On pointer** click and wire that to **Open credits** (Navigation, in the Interactions tab). It opens the same list, with the same keyboard behaviour, and focus goes back to your button when the list closes. A page that has an **Open credits** node does not also get the automatic button, so there are never two. Pages without one still get it while the setting is on, and the list is kept in exported pages whenever a page opens it. With no entries yet, the list says no credits have been added. Every starter on the Templates tab comes with one of these on its first page: see [Branded starter packs](branded-starters).

## Working together
The list is part of the project, so people editing it live see each other's changes like any other edit, and undo covers it.

Copyright reporting for a course is run at course level, and this tab does not replace it. It is the place to keep the facts while you work.
