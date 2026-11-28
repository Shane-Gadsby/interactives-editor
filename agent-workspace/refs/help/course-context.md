# Course and learner context
The built-in context source (course label, first name, student or staff) and per-course variable values.

Every project has a built-in, read-only data source called **context**. It holds the course the project is in and the person playing, so a project can greet someone by name, show the unit code, or change what it says for staff and students. You do not add it and you cannot edit it; it is always in the **Data** tab's list, first.

## What is in it
| Field | What it is |
|---|---|
| `context.courseLabel` | The StudyDesk course label, like `MAT1000_26S1_ONC` |
| `context.courseCode` | The label up to its first underscore, like `MAT1000` |
| `context.courseName` | The course's title |
| `context.offering` | The label after the code, like `26S1_ONC`: one run of the course |
| `context.term`, `context.year` | The study period (`S1`) and the year (`2026`) when the label has them, otherwise empty |
| `context.lmsUrl`, `context.lmsName` | The learning management system, as StudyDesk reports it |
| `context.firstName`, `context.displayName` | The learner's first name, and the name to greet them by |
| `context.signedIn` | Someone is signed in to StudyDesk |
| `context.isStudent`, `context.isStaff` | Signed in as a student, or signed in and not a student |

Term and year are worked out from the label as well as they can be, and are empty when the label does not say.

## Using it
Use it by name anywhere expressions go, the same as any [data source](data-sources):

- Text: `Welcome, {context.firstName}`. A learner with no name sees `Welcome, `, so word it to cope.
- [Bindings](bindings): show a layer only for staff with `context.isStaff`, or pick a message with `context.courseCode == "MAT1000" ? "A" : "B"`.
- The interaction graph: anywhere a node takes an expression, such as the **Check a condition** condition.
- Scripts: `ix.context.firstName`.

A variable or data source that you name `context` hides the built-in one, and the Data tab warns about it.

## Who is looking
An app can show more to the people who look after it, such as a results view, a moderation list or editing tools:

- `context.isOwner`: they own this project. `context.isCollaborator`: they help make it.
- `context.canEdit`: they may change what it shows: the owner, a collaborator, a power user, or staff with StudyDesk's editing mode on.
- `context.isEditing`: StudyDesk's editing mode is on for the page it's on, so editing tools can wait until someone is editing.
- `context.groups`: which of the suite's groups (as si-admin keeps them) they are in, out of the ones you list in **Groups it can check** in Project settings. `context.groups.includes("tutors")` is true for a tutor. The app never learns about any other group, and **Update** the share after changing the list.

These are worked out on the server from the person's own StudyDesk session, except `isEditing`, which comes from the page. They show what to show; they don't keep anything safe on their own. An admin viewing a course as a student counts as nobody special. Outside StudyDesk every one of them is false.

## Where the values come from
- **The Link for StudyDesk** fills it in from the signed in StudyDesk session. Use that link, not the plain share link, when you want it.
- **Preview and the canvas** use made-up **sample values**, which you edit in the Data tab under **context** (first name, course label and so on). The code, term and year follow the sample label. Clear a field to see the project with it blank. Sample values are for designing: they are never in an exported file or a share link.
- **Anywhere else**, such as a downloaded file or a share link opened outside StudyDesk, nobody is known: the text is empty and the flags are false.

## Per-course values
One project can serve several courses without being copied. In the **Data** tab, pick **context** and use **Per-course values**: add a row with a course label, then pick the variables that row changes and give each its value for that course.

- The label can use `*` for any run of characters and `?` for one character, and is not case sensitive: `MAT1000_*` is every run of MAT1000, and `MAT1000_26S1_ONC` is exactly one. Commas give several: `MAT1000_*, MAT1001_*`.
- Rows apply when the project starts on the Link for StudyDesk page, in order from the top. Every matching row applies, and a later row wins where two set the same variable. A course that matches no row gets each variable's own starting value.
- It changes the starting value only. **Start over** goes back to it. A learner's own remembered progress (variables ticked **Remember**) still wins over it, so leave **Remember** off for a variable you set per course. A value the embedding page sets itself (an input attribute) wins too.
- Preview uses the sample course, and each row says whether it matches, so you can try each course by changing the sample course label.

Results are already kept per course, so each course's learners start clean without anything here.

After changing per-course values, press **Update to the latest version** in [Share link](export#share-link) so the Link for StudyDesk plays the new version.

## Setups
One app, many setups. A card sort made once can run on a second set of cards without copying the project. Under **Setups** in the **Context** panel, **+ Add a setup** and give it:

- a **name** (`setup.name` in formulas),
- its own starting values for any variables (**Set a variable…**),
- its own contents for any data source: tick **Its own cards** and paste the JSON or CSV it uses instead of the file or address.

Each setup has its own link once the project is shared: the Link for StudyDesk with `?setup=` and the setup's id on it, which **Copy link** copies. Put that link on the course page. A setup's values win over a per-course row's, and responses say which setup they came from. Without `?setup=` the project plays as you made it.

## An editing mode
An app can be set up where it sits, by the people who look after it, without opening the editor. A tiles app shows pens and a plus sign to them and plain tiles to everyone else.

1. Tick **Part of the setup** (under a variable's **Options**) on what they set up: the tiles, the cards, a picture they picked with **Picture of a layer**.
2. Make a page for it and tick **Editing page** in its **Page** section. It opens instead of the start page for anyone who may edit the app (`context.canEdit`) while StudyDesk's editing mode is on, and nobody else can be sent to it.
3. Put a **Save** button on it that runs **Save setup**. It keeps those variables' values, for the setup the link plays, and everyone who opens it afterwards starts with them.

Only the owner, collaborators, power users and staff can save; anyone else goes on from **Not saved**. StudyDesk's editing mode decides when the editing page shows, never who may save. In Preview the saved setup is kept in your browser, to try it out.

## Values on the link
**link** sits beside context: it holds the values on the address the project was opened with, so one project can serve several programs or courses from different links. Add `&program=GCSC` to the end of the address in the embed code (or `?program=GCSC` to a link with nothing after it), and the project reads:

- Text and bindings: `{link.program}`, `link.program == 'GCSC'`.
- Scripts: `ix.link.program`, whether or not they run in the sandbox.

Every value is text, and a name that isn't there is empty, so give it a fallback: `link.program || 'MSCN'`. A name is letters, digits, `.`, `_` and `-` (up to 40), a value is up to 200 letters, and there are 20 at most. `title` and `cdtID` (the embed code's own), `sessionID`, `ixm` and `lti` are never handed on.

It works from the Link for StudyDesk and from a plain share link. To see the project with values on its address while you build it, open **Data**, pick **context**, and under **link** press **+ Add a link value**: give it a name (`program`) and a sample value (`GCSC`). The canvas and Preview then behave as if the project were opened with `&program=GCSC`. Sample values are for designing only: a share link, an embed or an export never carries them, and leaving a name out of the samples is how you check what the project does with no value. A project shared before 19 November 2026 needs **Update** in Share to get it.

### A variable from the link
A variable can start from a value on the link, so you don't need a script to read it. Open the variable's **Options** and type the link value's name in **Starts from the link** (`program`). When the link carries `&program=GDSI`, the variable starts as `GDSI`: over an embed attribute (`input-program`), a course row, a setup and its own starting value, and again on **Start over**. With nothing on the link, it starts as it always did.

A value saved for the learner (**Save as user data**, **Remember**) still comes back when the link names nothing, and the link wins when it does, so a link for one program always opens that program. A value that doesn't fit (a choice the variable hasn't got, text for a number) is ignored. The canvas uses the sample value from Data > context > link.

### Choices, and trying each one
Give a link value its **Choices** in the same table, with commas between them (`MSCN, GDSI, GCSC`). The sample then picks from them, and so do these two:

- **Preview's bar** has a field for every link value the project reads (from `link.` in text, bindings and formulas, and `ix.link.` in scripts), plus the ones in the table: a list when it has choices, otherwise a box to type in (Enter applies it). Changing one starts Preview again, opened with that value. It's for this run only: the sample in Data stays as it was, so a reviewer can try every program without changing the project.
- **Share** shows the same fields as **Open it with:** above the embed code and the share link. Pick a value and what you copy carries it (`&program=GCSC`). Leave it on **none** for the plain link.

Anyone can change what's on an address they open, so use a value to pick what to show, never to decide what someone may do or to set a score.

## Privacy
Only the course, the learner's first name and display name, and whether they are a student or staff go to the project. Never a username, email, student number or anything that could look a person up. Nothing from `context` is sent to analytics, results or diagnostics by the player or the Link for StudyDesk page. A project that records a name itself (a script saving `ix.context.firstName` with **Record**) is doing that on purpose, so don't.
