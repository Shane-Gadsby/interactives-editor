# Changelog

## Unreleased

- **Groups** in the interaction graph: labelled, coloured frames around related nodes. **New group here** on the graph's menu or **Put in a new group** on a node's; drag the title to move the group with its nodes, drag the edges to resize, double-click to rename, right-click for colour, Ungroup or Delete group and nodes. Del on a selected group removes only the frame.
- **Update from file** for design files: imported Photoshop, Illustrator, PDF, DXF, VectorCraft and PhotoCraft artboards remember the file they came from. The inspector's **Source file** section (was "Linked file") and the new **Design files** list at the top of the Assets panel pick a new version and merge it in the same way a linked re-import did (your edits kept, one undo). Imports no longer ask Link or Embed: a hosted page can't watch a file on someone's disk, so everything is embedded and updated by hand. Artboards linked the old way keep Re-import and Watch in the browser that linked them; the "linked from another browser" bar is gone.
- **Replace a file**: every asset has a replace button (↑) beside the bin, and image and video layers have **Replace file…**. The new file takes the asset's place everywhere it's used (layers, fills, Play sound, timeline audio, fonts, data), in one undo step. It's stored under a new id so other people in the session get it straight away.
- Assets someone else adds or replaces during a live session now show up for everyone without a reload (their files are fetched as the records arrive). Before, a picture uploaded by one person stayed blank for the others until they reopened the project.
- AI agents connect over the network: the editor serves its MCP server at `/interactives/mcp` (streamable HTTP). Nothing to download; `claude mcp add --transport http interactives "https://<host>/interactives/mcp?agent=Claude" --header "X-Session-ID: <id>"`. Each connection has its own session, name and live rooms; idle ones close after 2 hours.
- The **AI agents (MCP)** help page shows the exact address and commands for the server it's opened on, with your own session id filled in, and every help code block has a **Copy** button.
- Files dropped on the **Assets** panel are uploaded as assets (audio, video, images, fonts, data), with a dashed outline while you're over it. Nothing is placed on the artboard; the canvas still does that. Before, a drop there did nothing.
- The tools column holds two tools per row (it's a little wider), and when it still has to scroll it scrolls only up and down, never sideways.
- Accessibility panel: the **to look at** chip is one row like the others. The Review page's `.review` class was styling it (and every other `.review` dot) as a full-height column; that class is now `.review-page`.
- **Play sound** nodes in the graph show the sound's name instead of its id.
- Copy, cut and paste for interaction nodes: <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>X</kbd> / <kbd>V</kbd> with a node selected in the graph, and **Cut** / **Copy** / **Paste** in its right-click menus. A graph paste no longer drops the artboard's copied layers onto the artboard. Pasted nodes keep their settings, not their connections.
- The graph's **Add node** and **Add and connect** menus have a filter box: type to narrow every category to matching nodes (by name, then description), arrows and Enter to pick.
- **Save user data** / **Load user data** nodes, kept per learner per course in `lti-analytics.interactives-activity-user-data` through the learner page (new `/learn/:token/user-data` routes), and in the browser elsewhere. The graph's settings show a tick list for the variables.
- **Before activity loads** / **On activity load** events in the graph palette.
- The projects list with no session now lists only projects nobody owns, instead of everyone's until sessions are enforced. Admins still see only their own until they press F9.
- On test and prod (`NODE_ENV` `testing` or `production`) the projects list with no session is empty. The projects nobody owns are every beta tester's Guest project from before direct sign in, and they were showing to anyone whose session didn't reach the server. Dev keeps listing them.
- The editor puts `X-Session-ID` on its own requests instead of relying on si-manager's `utilities.js` to. Prod's `utilities.js` doesn't have that wrapper yet, so on prod the server never knew who anyone was: every project was saved without an owner and everyone saw all of them.
- Keyframe buttons (◆) made consistent with what the inspector shows:
  - ◆ keys the value shown at the playhead. It used to key the layer's own value, so between two keys it held an old value instead of the in-between one.
  - Changing a property the open timeline already animates changes its key at the playhead, with Record on or not. It used to change the layer's hidden own value, so the field snapped back and a later ◆ keyed that hidden value. Design view still edits the layer's own value.
  - On a **Whole frames** timeline keys go on the start of the frame, so the frame on screen shows them straight away and the filled-diamond "on a key" state matches.
  - With several layers selected, ◆ keys all of them (it keyed only the first).

Deploying: restart the server, and apply the new `interactives-activity-user-data` index in `suite-libs/indexes.js` on the box before the nodes are used there (it is the upsert key).

## 0.5.0 (beta), 2026-11-04

The first beta. The full tour is in the README under **What's in 0.5**, and every feature has a page in the in-app help (F1). The Welcome page has **Getting started as a beta tester**: what to try first, how to report a problem (with the version from the (i) icon) and the known limits.

Highlights:

- Share and Export split; collaborators invited by name; review comments with a review link.
- Templates, examples and remix, and a **Start a new project** chooser (blank, copy, built-in template, example).
- Learner page, results, Insights.
- Question kit with matching and hotspot questions.
- Themes and colour tokens; the starter look read live from the shared StudyDesk palette; a Google font picker (Open Sans by default).
- Auto layout with percent padding, margin and gap; hidden layers take no space; see-through layers don't take clicks; striped ghosts of layers outside a clipping artboard.
- Bones and IK with a built-in example; Rive `.riv` and `.rev` import.
- Version and build id behind an (i) icon in the help, the projects page, the quick search and Preferences.

Deploying: the server needs restarting (new routes for people, collaborators, templates, examples, remix and comments), and `suite-libs/indexes.js` has new interactives indexes to apply on the box (`node indexes.js --apply`, or `SUITE_INDEXES_APPLY=1`).
