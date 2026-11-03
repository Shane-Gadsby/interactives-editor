# interactives-editor

The browser editor for Interactives. You use it to build interactive 2D experiences:
- artboards with vector shapes, pen paths, text and images;
- real web controls: buttons, inputs, links, HTML/iframe embeds and video;
- keyframe timelines;
- a node-based interaction graph;
- variables and data bindings;
- custom JavaScript.

Projects are stored on the server in MongoDB. They export as a single self-contained HTML file or as a `.ixp` package (zip), and import back from `.ixp`.

The runtime lives in the sibling repo [interactives-player](https://github.com/Shane-Gadsby/interactives-player). The editor draws its canvas with that player's renderer, and its exports embed that player.

## Layout on disk

Like the rest of the StudyDesk Toolbox suite, this app expects sibling checkouts:

```
apps/
  suite-libs/            mongo-connect, cache-headers, session-check, version-reporting, crash-guard
  toolbox/               public/sys/js/powerUser.js (power user rule)
  interactives-player/   only needed to build the frontend
  interactives-editor/   this repo
```

## Run

```bash
npm install
npm run build    # builds ../interactives-player, then the editor into dist/ (committed)
npm start        # node index.js, http://127.0.0.1:3048/interactives/ (behind haproxy: /interactives)
npm run server   # same, under nodemon
npm run dev      # vite dev server with HMR; /api is proxied to the server on 3048
npm test         # vitest
```

`dist/` is committed on purpose. Test and prod deploy with `git pull` + `npm install` + restart and have no build step. Run `npm run build` before every commit that changes `src/`.

## Server (`index.js`)

The server is an Express 5 app mounted at `/interactives` on port 3048. It follows the suite conventions: `crash-guard`, `mongo-connect`, `cache-headers` (stamped document, trailing-slash redirect), `session-check({staff})`, and `version-reporting`.

| Route | Does |
|---|---|
| `GET /api/session` | who the session is, and whether they're a power user |
| `GET /api/projects` | your projects. `?all=1` returns everyone's, and is honoured only for admins and power users |
| `GET/PUT/DELETE /api/projects/:id` | load / save (`{project, rev}`, a stale `rev` gets a 409) / delete with assets |
| `PATCH /api/projects/:id/meta` | `{tags?, folder?}`: the projects page's tags (up to 20, 40 characters each) and one-level folder. Stored on the mongo document beside `name`, not in the project JSON, and no rev bump |
| `POST /api/projects/:id/duplicate` | copy a project and its assets under `{newId}` |
| `GET /api/projects/:id/assets` | asset list |
| `PUT/GET/DELETE /api/projects/:id/assets/:assetId` | raw asset bytes |
| `GET /api/projects/:id/live?clientId&since` | live editing stream (Server-Sent Events: `hello`, `ops`, `presence`, `reset`, `deleted`) |
| `POST /api/projects/:id/ops` | a batch of document ops (`shared/ops.mjs`); the server orders, applies and broadcasts them |
| `POST /api/projects/:id/presence` | cursor, artboard and selection |
| `GET /api/projects/:id/revisions` | revision history (newest 100, no documents) |
| `GET /api/projects/:id/revisions/:revId` | one revision's project |
| `POST /api/projects/:id/revisions/:revId/restore` | snapshot the current document ("Before restore"), then restore; live rooms get `reset` |
| `GET/PUT/DELETE /api/projects/:id/share` | share link state / publish a standalone HTML body (creates the token on first use) / turn off and delete the file |
| `GET /s/:token` | a shared project, **no session** (a link in a new tab can't carry one). Tokens are 24 random base64url chars; off until the owner turns it on |

Data lives in two places:
- **MongoDB:** database `lti-interactives`.
  - `projects`: `{_id, name, owner, created, updated, rev, meta, doc, share?}`, where `doc` is the project JSON stored as a string.
  - `revisions`: `{_id, project, created, rev, by, reason, size, doc}`. A snapshot at most every 5 minutes per project while it is saved (PUT or live room save), plus one before each restore. The newest 100 per project are kept.
- **Asset files:** stored under `storage/<projectId>/<assetId>`, each with a `.json` sidecar. Share links are `storage/shares/<token>.html`. `INTERACTIVES_STORAGE` moves that folder; on test and prod it is symlinked to the larger storage pool. `storage/` is gitignored.

**Live editing.** Opening a project joins a room held in memory by the server, which holds the document, an op log and the connected clients. Edits are diffed into id-addressed ops (`shared/ops.mjs`, the same file the server uses): set a property, insert after an id, delete an id. The last write wins per property, in the server's order.
- The server saves the room to MongoDB a second after the last op, when the room empties, and on SIGINT/SIGTERM.
- Clients reconnect with `since=<seq>`, and missed ops are replayed.
- Undo only reverts your own changes, because remote ops are also applied to the undo history.
- A plain PUT (a non-live client or an import) replaces the room and tells everyone to reload.
- Rooms live in one process, so run a single instance per box.

The projects list wants the index `owner.username_1_updated_-1`, and revision history `project_1_created_-1` on `revisions`, both in `suite-libs/indexes.js`. Everything else is looked up by `_id`.

Access works like this:
- A person sees and changes only their own projects.
- Admins and power users (si-admin's "Power Users", the toolbox's `powerUser.canUse`) see everyone's projects with F9 / Ctrl+F8 on the projects page.
- Until `SUITE_SESSION_ENFORCE=1` is set, refusals are only logged, same as `session-check`.

| Env | Default | |
|---|---|---|
| `PORT` | 3048 | |
| `MONGO_URI` / `mongodb_user` / `mongodb_pass` | dev/dev on 127.0.0.1 | via suite-libs |
| `INTERACTIVES_STORAGE` | `./storage` | asset files |
| `SUITE_SESSION_ENFORCE` | unset | `1` to refuse instead of log |

## MCP server (`mcp/`)

`mcp/server.ts` is an MCP server (stdio JSON-RPC, no dependencies) that lets an AI agent join a project's live room as `<name> (AI)`, read it, edit it through the same ops as the editor, and see each person's selection. `npm run build:mcp` (also part of `npm run build`) bundles it with the player's catalog and the help topics into `mcp/dist/interactives-mcp.mjs`, which is committed like `dist/`. Env: `INTERACTIVES_URL`, `INTERACTIVES_SESSION_ID` (sent as `X-Session-ID`), `INTERACTIVES_AGENT_NAME`. The help page "AI agents (MCP)" has the client setup. The live stream takes `?agent=<name>` for this.

## Frontend (`src/`)

| Path | What |
|---|---|
| `store/store.ts` | `EditorStore`: the immer document, undo/redo with drag coalescing, selection, recording keyframes |
| `store/doc.ts` | tree lookups, world matrices, hit testing |
| `canvas/` | viewport (pan/zoom), artboards drawn by the player's `Renderer` in edit mode, overlay handles, tools, pen and path editing, snapping, in-place text |
| `panels/` | layers + assets, inspector, timeline, interaction graph (React Flow over the player's node catalog), scripts (CodeMirror), variables |
| `lib/db.ts` | API client, `.ixp` import/export |
| `lib/export.ts` | single-file HTML (embeds the player IIFE build, plus the script sandbox when used), `.ixp`, JSON |
| `lib/live.ts`, `shared/ops.mjs` | live editing client and the shared op diff/apply |
| `lib/lottie-import.ts`, `lib/lottie-export.ts` | Lottie / dotLottie in and out |
| `lib/links.ts`, `lib/link-reconcile.ts` | Linked design files: File System Access handles in IndexedDB, the watcher (`LinkManager`), and the pure three-way merge of a re-import into the artboard (`Artboard.source` keeps the baseline) |
| `lib/rive-import.ts`, `lib/rive-defs.ts` | `.riv` import; defs generated from rive-runtime headers by `research/rive/gen_defs.py` |
| `lib/ai-import.ts`, `lib/pdf-parse.ts`, `lib/pdf-color.ts`, `lib/pdf-font.ts` | Illustrator `.ai` (the PDF inside) and `.pdf` import: a minimal PDF reader, then the page content operators replayed into path, text, image and mask layers (one artboard per page) |
| `lib/boolean.ts` | union/subtract/intersect/exclude (polygon-clipping) |
| `lib/svg-import.ts` | SVG files to editable layers (paths with transforms baked in, groups, gradients, text) |
| `lib/image-export.ts` | PNG/SVG pictures of an artboard (the renderer inside `<foreignObject>`, assets and fonts inlined) |
| `lib/prefs.ts` | per-person preferences in localStorage (wheel zoom vs pan, tooltips, rulers) |
| `help/` | the in-app help: `topics.ts` (the docs, with the node and property references generated from the catalog), search, drawer, `#/help/<topic>` page, F1 / Ctrl+K quick search |
| `components/tooltips.ts`, `components/tips.ts` | styled tooltips for every `title`, and the standard explanations for field labels |
| `components/ContextMenu.tsx` | right-click menus (interaction graph) |

Preview runs the single-file export in a sandboxed iframe, so it behaves exactly like the downloaded file.

## Shortcuts

| Keys | Action |
|---|---|
| V H A F R O L P N T B | select, hand, artboard, frame, rectangle, ellipse, line, pen, pencil, text, button |
| Space-drag, wheel, Ctrl+wheel | pan, zoom (or pan, with the Preferences wheel setting), zoom |
| Shift+R | rulers (drag out guides) |
| F1 / Ctrl+K, ? | search help, open help |
| Shift+1 / Shift+2 / Ctrl+1 | fit all / fit selection / 100% |
| Ctrl+Z, Ctrl+Shift+Z | undo, redo |
| Ctrl+C / X / V / D | copy, cut, paste, duplicate |
| Ctrl+G, Ctrl+Shift+G | group, ungroup |
| [ ] (Ctrl for front/back) | z-order |
| Arrows (Shift ×10) | nudge |
| Enter / double-click | edit text, path points, or enter a group |
| Delete | delete layers, or the selected keyframes |
