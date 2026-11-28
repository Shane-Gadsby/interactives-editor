# Data sources
JSON, CSV, TSV or text from an uploaded file or a URL, used by name.

A **data source** is a file or web address of information that your project reads by name: a list of products, quiz questions, a table of results. Open the **Data** tab and add a source **From file** (upload) or **From URL** (fetched by the player).

- **Format**: JSON, CSV or TSV (first row is the column names), or plain text. CSV and TSV become a list of rows, with numbers and true/false converted.
- **URL**: fetched as soon as you press Enter or leave the field. **Reload** fetches it again.
- **Refresh** (URLs): fetch again every n seconds; 0 loads once.
- The right-hand side shows the file and lets you change it: see **Editing a data file** below. For any source it also lists the field names you can use.

Use a source by its **name** anywhere expressions go: `{products.length} products`, a binding `products[0].price`, or **Repeat → Repeat for each** **Data: products**. Scripts read `ix.data.products`.

**Load data** reloads a source (optionally from a different URL), and **When data has loaded** fires when it arrives. The host page can push data with `player.setData('products', [...])`.

**+ Shared responses** adds a different kind of source: answers the people playing add, counted for the class or kept for each person. See [Shared responses](shared-responses).

**+ Room** adds a live message list for the people in the same class: a chat or a question wall. See [Rooms](rooms).

## Show a field on the page
Under a loaded source the **item fields** (or **fields**, for one object) are listed with the same text-icon handle as a variable. Drag one onto the page to show its value, or press it to add it to the selected text layer. For a list the value is the first row's (`products[0].name`); put it inside a [repeater](repeaters) when each row should show its own. See [Live values in text](text#drag-a-value-onto-the-page).

## Editing a data file
A source **From: Uploaded file** can be edited right there, in up to four views: **Form**, **Table**, **Tree** and **Raw text**. Which ones you get depends on the file. They show the same text, so a change in one shows in the others.

### Form
**Form** is the view a JSON file opens in. It shows the file as labelled fields, for people who would rather not see braces and quotes.

- Every group is a card of fields. A key name is made into plain words: `startLabel` and `start_label` both read **Start label**. Hover a label to see the real key.
- Short text is a line. Long text (or text with line breaks) is a box that grows as you type.
- A number is a number box. It waits until what you typed is a number, and never turns into text.
- Yes or no is a switch.
- An empty value shows **empty** with **Fill in**. That makes it a number or yes/no when the same field is one in the other cards, and text otherwise.

A list of groups, such as `dilemmas`, `choices` or `opening`, is a stack of cards. Each is titled from the item's title, name, label, question or id (or its first short text) with its number, like **Dilemma 1: The old assignment**.

- Each card opens and closes. **Open all** and **Close all** do every card.
- Each card has **Up**, **Down**, **Copy** and **Delete**.
- **Add another** at the end of a list adds a card with the same fields as the ones already there, left empty and keeping their types (a number starts at 0, a yes/no at no).
- A list of plain values is a list of fields with the same buttons.
- A list of simple rows can be shown as **Cards** or as a **Table**. Many short rows open as a table.

The **outline** at the side (above the form when the panel is narrow) lists every list and card. Pick one to jump to it, open it and move to it.

The form can change what is in the file, and add, copy, move or delete items. To add a new field, rename a key or change what a field holds (text to number, say), use **Tree**. Every card and list has an **In Tree** button that opens Tree on that very spot.

A file with an error in it shows the raw text until it parses again, because the form needs a file that does.

### Table and Tree
**Table** is for CSV and TSV, and for JSON that is a list of flat objects. **Tree** is for any other JSON, and is where JSON's structure changes go. Change a cell or a value by typing in it.

- Buttons above add, copy, delete and move rows and columns. In a tree they add inside or next to a row, copy, delete, move, and open or close everything.
- **Cell holds** (or **Holds**) changes a value between text, number, yes/no, empty, list and group, so 12 and "12" are not the same thing.
- In a tree, a list of flat objects opens as a table (the **Table / List** switch turns that off). So `opening` or `choices` inside a bigger file are edited like a spreadsheet.

### Raw text
The file's own text, coloured for its format: JSON, and a colour for each column of a CSV or TSV.

- A mistake in JSON is marked on its line with the line and column and what is wrong. **Go to this spot** (the line and column link) jumps to it.
- **Tidy up** lays JSON out again with two-space indents.
- The **Code colours** buttons beside it (**Follow**, **Light**, **Dark**) set the colours of the text box. **Follow** goes light or dark with the editor's theme. It is your own setting, not saved in the project, and it is also in [Preferences](preferences).

### Saving
A change is saved a moment after you stop typing (or when you leave the box), as a new version of the file. **Undo** and **Redo** bring the old text back, other people editing see the change, and the canvas, bindings, repeaters and Preview use it at once.

JSON that doesn't parse is **not** saved. The interactive keeps using the last good version until it does. CSV and TSV never fail to parse, but a quote that never closes or a row with the wrong number of cells gets a warning.

### Things to know
- If more than one source reads the same file, a note says so before you edit: the edit changes all of them. **Give it its own copy** makes the file separate for this source.
- A source **From: URL** can be looked at but not changed here, because the file isn't yours. **Make a copy to edit** saves what the URL gave as an uploaded file and reads that instead (**Undo** goes back to the URL).
- Long tables show 100 rows at a time (use Next and Previous). The raw text has no limit.
- In a table, **Tab** goes into and out of the table, the arrow keys move between cells (Left and Right at the ends of the text), **Enter** goes down, and **Escape** puts the cell back.
- In a tree, Up and Down move, Right opens (or goes in), Left closes (or goes out), **Enter** or **F2** edits the row, **Delete** removes it, and **Alt+Up** and **Alt+Down** move it.
- In the form, **Tab** moves through the fields and buttons in order, each card's title is a heading with a button that opens and closes it, and every field has a real label. Nothing waits to be confirmed: each change is saved a moment after you stop typing.
- Each save leaves the earlier file on the server so Undo works. **Remove unused assets** in the Usage tab clears them.

## Shared tables
A sign-up sheet, a board, a register, a booking list: rows the people using the app add, change and take away, that everyone in the class sees. **+ Shared table** makes one. Give it its **Fields** (`name, slot, note`), then say:

- **Who may add**: anyone signed in, or staff only.
- **Who may change a row** and **Who may take a row away**: whoever added it (and staff), staff only, or for changing, anyone.
- **Rows each**: how many one person may have (1 for a sign-up sheet). **Slot field** and **Rows a slot**: so many per time or group.
- **At most**: the table's size, up to 2000 rows. Say on the page how many places are left; a table that quietly stops taking rows looks broken.
- **Show names**: each row carries who added it as `row.by`. Off, nobody's name is shown.

Its value is `{ rows, count, max, mine }`: repeat `signups.rows`, and each row says whether it's yours (`item.mine`). The **Add a row to a shared table**, **Change a row of a shared table** and **Take a row out of a shared table** nodes do the rest, with **Row** being `item` in a repeater. The server checks every rule and limit; a refusal goes on from **Not done** with `event.problem` (not-allowed, per-person, slot-full, full). Each class has its own rows. Share again after changing the settings. In Preview the table is kept in your browser, with you as its only person.

## The built-in context
The list always starts with **context**, a read-only source that is there without adding anything: the course and the learner (`{context.firstName}`, `context.courseCode`). Pick it to see its fields, set sample values to design with, and give different courses different starting values. See [Course and learner context](course-context).

## What may be loaded
Every data request, from a source, the **Load data** node or `ix.loadData(name, url)`, follows the same rules:

- Only `http:` and `https:` addresses load, plus `blob:` and `data:` addresses up to 1,000,000 characters. `file:`, `javascript:` and anything else is refused.
- Cookies and logins are sent only to the page's own site, never to another site.
- Relative addresses and the page's own site always work.
- **Allowed data hosts** (Project settings) is an optional list. Leave it empty to allow any http(s) host. Once it has entries, other sites must match one: `api.example.com`, `*.example.com` (its subdomains, not `example.com` itself), `example.com:8080` (an entry without a port matches any port), or a full origin like `https://api.example.com` (that scheme and port only). A redirect to a site off the list is refused too. Files uploaded to the project are not affected.

A refused request loads nothing and writes a warning to the console; in a script, `ix.loadData` throws.

> URLs must allow cross-origin requests (CORS) from wherever the interactive is published.
