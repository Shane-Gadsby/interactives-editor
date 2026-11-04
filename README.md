# interactives-editor

The browser editor for Interactives. You use it to build interactive 2D experiences:
- artboards with vector shapes, pen paths, text and images;
- real web controls: buttons, inputs, links, HTML/iframe embeds and video;
- keyframe timelines;
- a node-based interaction graph;
- variables and data bindings;
- custom JavaScript;
- step-through explainers: a timeline's markers become steps (Next plays to the next marker, Back plays back, dots, a generated step bar, scroll to scrub);
- responsive artboard sets: variants of an artboard shown by the page's width (Responsive section of the artboard, Add narrow/wide variant, breakpoints, a pairing report of what would not carry), listed under their base in Layers, with pills on the canvas and a Page width slider with breakpoint marks in Preview. The runtime side is the player's `variants.ts`.
- script layers: a box painted by a script every frame (generative art, charts), with starter templates.
- a public interface for developers who embed a project (Public interface tab: variables as inputs and outputs, messages sent and received, with descriptions; a generated reference page and TypeScript definitions; export warns when the list has drifted; an option to take only public inputs from outside). The player side is in `interactives-player/src/interface.ts`; the list is edited by `src/lib/public-interface.ts` and `src/panels/InterfacePanel.tsx`.
- shader layers: a box painted by a GPU fragment shader (WebGL) with animatable, bindable uniforms, a library of starter presets, and a shader filter for image layers.

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
| `POST /api/projects/:id/duplicate` | copy a project and its assets under a new id made by the server (`{name?}` in, `{id}` out) |
| `GET /api/projects/:id/assets` | asset list |
| `PUT/GET/DELETE /api/projects/:id/assets/:assetId` | raw asset bytes |
| `GET /api/projects/:id/live?clientId&since` | live editing stream (Server-Sent Events: `hello`, `ops`, `presence`, `reset`, `deleted`) |
| `POST /api/projects/:id/ops` | a batch of document ops (`shared/ops.mjs`); the server orders, applies and broadcasts them |
| `POST /api/projects/:id/presence` | cursor, artboard and selection |
| `GET /api/projects/:id/revisions` | revision history (newest 100, no documents) |
| `GET /api/projects/:id/revisions/:revId` | one revision's project |
| `POST /api/projects/:id/revisions/:revId/restore` | snapshot the current document ("Before restore"), then restore; live rooms get `reset` |
| `GET/PUT/DELETE /api/projects/:id/share` | share link state / publish a standalone HTML body (creates the token on first use) / turn off and delete the file |
| `GET/POST /api/projects/:id/comments`, `POST .../comments/:cid/replies`, `PATCH .../comments/:cid` (`{status?, assignee?}`), `PATCH/DELETE .../comments/:cid/messages/:mid`, `DELETE .../comments/:cid` | review comments for the owner and power users: pin a note (`{anchor, text, context?, mentions?, assignee?}`), reply, resolve or reopen, hand to someone, edit and delete. One row per message in `lti-interactives.comments` (see `shared/comments.mjs`), so they are never part of the project document, an export or a share link |
| `GET /api/projects/:id/comments/live` | the comments stream (Server-Sent Events: `hello`, `thread` with the whole changed thread and who the write was for, `gone`). Separate from the editing room, because reviewers are not in it |
| `GET/PUT/DELETE /api/projects/:id/review` | the review link: its own token (`review.token`), `{guests}` says whether people without a session may comment. Turning it off ends the link and anyone watching through it; the comments stay |
| `GET /api/notices`, `POST /api/notices/read` | in-app notices (assigned to you, mentioned, a reply in a thread you are in), newest 50 and the unread count; `commentNotices: false` in the preferences switches them off |
| `GET /review/:token`, `GET /review/:token/assets/:assetId`, `GET /review/:token/live`, and the same comment routes as above under `/review/:token/comments...` | the review page's side, by the link instead of a staff session (the session is read if there is one). A link with guests off wants a signed in user. Guests give a display name, can pin and reply (no mentions, no resolving), and are limited to 10 writes per 10 minutes per address (last `X-Forwarded-For` entry, the one haproxy added) and 60 an hour per link. Signed in reviewers comment under their own name, can resolve, and edit or delete their own |
| `GET /api/libraries` | libraries you can use: your own, ones shared with you or with everyone (no snapshots) |
| `GET /api/libraries/:id` | one library with its latest snapshot (`{library, snapshot}`) |
| `GET /api/libraries/:id/assets/:assetId` | an asset of the latest snapshot (the library keeps its own copy of the files) |
| `POST /api/projects/:id/library/publish` | `{note?}`: owner only, the project must have `settings.library` and an artboard marked `publish`. Snapshots the project (the live room's copy if open) as the next version; nothing changed means no new version (`unchanged: true`) |
| `GET /api/projects/:id/library` | this project's own library record, or null |
| `PUT /api/projects/:id/library/share` | `{everyone, users[]}`: who else can use the published library |
| `DELETE /api/projects/:id/library` | stop publishing (projects that copied components keep them) |
| `GET /play/:token` | the learner page for a share link: a small page that frames `/s/:token` in its sandbox and answers the project's progress requests (postMessage) by calling the `/learn` routes below with the session id it was opened with (`?sessionID=` or sessionStorage). Give this link to learners in StudyDesk. Served with its own nonce CSP; can be framed |
| `GET/PUT /learn/:token/progress`, `POST /learn/:token/report` | a learner's remembered variables, artboard, attempts and reported results (`{result}`), for the project whose share link is on. Identity (username, userID, name) and the course (`activity.courseLabel`) come from the session, never from the request; with no session they answer `{available: false}` and the player keeps progress in the browser. Outside `/api` because that is staff only. Bodies are shape- and size-checked in `shared/learner.mjs` |
| `GET/DELETE /api/projects/:id/results` | owner (or power user): counts, completion and pass rates, average best score and attempts, courses, and the 200 most recently active learners / delete every record for the project |
| `GET /api/projects/:id/insights` | owner (or power user): what learners did in the project as counts (learners, visits, artboard views, clicks as grid cells and per layer, steps, question checks per option, named records, courses, learners per day). `?days=` is 7, 30 (default), 90, 365 or 0 for all; reads at most 100,000 rows, newest first, and says `truncated` past that. Nobody is listed |
| `GET /s/:token` | a shared project, **no session** (a link in a new tab can't carry one). Tokens are 24 random base64url chars; off until the owner turns it on. Served with `Content-Security-Policy: sandbox allow-scripts ...` (no `allow-same-origin`), so a shared page can't touch the editor's origin; its `localStorage` is not available |

Learner records are in `lti-analytics.interactives-user-data` (the suite's shared analytics database), one per project + username + course (the unique index `project_1_username_1_course_1` is in `suite-libs/indexes.js`, with `share.token_1` on `projects`): `{project, username, course, userID, name, courseLabel, courseCode, lmsURL, variables (JSON text), artboard, attempts, attemptCompleted, completed, completedAt, passed, reports, lastScore/lastMax/lastPercent/lastPassed/lastReportAt, bestScore/bestMax/bestPercent, progressAt, created, updated}`. Everything in it is the learner's own browser's word. Deleting a project deletes its records.

Learner activity records (Insights) are not kept in this app's database. The learner page (`/play/:token`) loads the suite's `/utilities.js` from the host and passes each record the project posts (`{source: 'interactives-record', record}`) to `reportAnalytics('Interactives', <kind>, <project id>, {project, run, rec})`, so it reaches `lti-analytics.ingest` through `si-analytics` like every other toolbox app's analytics, with the usual slimmed `meta.user` and `meta.activity` (`suite-libs/ingest-lean.js` keeps `username`, `userID`, `isStudent`, `email`, `courseLabel`, `lmsURL`, `courseCode`; `meta.rec` and `meta.run` are untouched). `app` is `Interactives`, `feature` the kind (`view`, `click`, `step`, `answer`, `custom`) and `featureID` the project id, which lets the read use the existing `idx_app_featureID_timestamp` index (no new index). The page checks every record with `cleanRecord` from `shared/records.mjs` (its source is embedded in the page), files it under the project the link is for whatever the record says, holds records until `fetchActivity` has said who the user is (no signed-in user, nothing sent), and sends at most 600 per page load. The insights route reads the rows back and `insights()` in the same file counts them; anyone can post to the analytics endpoint, so every row is cleaned again when read. The page's CSP allows `script-src 'self'` for `/utilities.js`. The player side is `interactives-player/src/records.ts`; the tab is `panels/InsightsPanel.tsx` (counts and bars, the click heat drawn by `Canvas.tsx` from `store.heat`, CSV from `lib/insights.ts`) and the switches are `panels/RecordsSection.tsx` writing `settings.records`.

Data lives in two places:
- **MongoDB:** database `lti-interactives`.
  - `projects`: `{_id, name, owner, created, updated, rev, meta, doc, share?}`, where `doc` is the project JSON stored as a string.
  - `libraries`: `{_id (the project id), name, owner, version, hash, updated, note, shared: {everyone, users[]}, components, internals, styles, history[], snapshot}`. One per published library; `snapshot` is the latest version's JSON string (artboards, variables, fonts, data sources, asset records, styles) and `history` keeps a short list of what each version held. A project's own document gets `library: {version, updated}` when published, and `meta.library` says it is marked as a library.
  - `revisions`: `{_id, project, created, rev, by, reason, size, doc}`. A snapshot at most every 5 minutes per project while it is saved (PUT or live room save), plus one before each restore. The newest 100 per project are kept.
- **Asset files:** stored under `storage/<projectId>/<assetId>`, each with a `.json` sidecar. A published library's snapshot assets are copied to `storage/_libraries/<projectId>/` (same layout) so they survive edits to the library project. Share links are `storage/shares/<token>.html`. `INTERACTIVES_STORAGE` moves that folder; on test and prod it is symlinked to the larger storage pool. `storage/` is gitignored. Because a project id is a folder name, `validID` (in `shared/safety.mjs`) refuses `shares`, `thumbs`, `_libraries` and anything starting with `_`. Asset responses (project and library) go through `assetHeaders` in the same file: `nosniff`; images (not svg), video, audio, fonts, JSON, CSV and plain text keep their type; svg gets a CSP that stops scripts; anything else is served as `application/octet-stream` with `Content-Disposition: attachment`.

**Live editing.** Opening a project joins a room held in memory by the server, which holds the document, an op log and the connected clients. Edits are diffed into id-addressed ops (`shared/ops.mjs`, the same file the server uses): set a property, insert after an id, delete an id. The last write wins per property, in the server's order.

- Order in a list is settled on the client, not on the wire: each session keeps a copy of the server's document (every op the server sends, its own included) and, after someone else inserts into or deletes from a list it also has edits waiting in, works out the order the server will end up with (`orderFixes` in `shared/ops.mjs`) and moves its own list to match. The moves are a local-only `mv` op; nothing new goes to the server, so old and new clients and servers mix freely.
- The server saves the room to MongoDB a second after the last op, when the room empties, and on SIGINT/SIGTERM.
- Clients reconnect with `since=<seq>`, and missed ops are replayed.
- Undo only reverts your own changes, because remote ops are also applied to the undo history.
- A plain PUT (a non-live client or an import) replaces the room and tells everyone to reload.
- Rooms live in one process, so run a single instance per box.

The projects list wants the index `owner.username_1_updated_-1`, and revision history `project_1_created_-1` on `revisions`, both in `suite-libs/indexes.js`. The libraries list (`$or` of owner, shared with everyone, shared with a username) wants `owner.username_1`, `shared.everyone_1` and `shared.users_1` on `libraries`. Everything else is looked up by `_id`.

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
| `lib/draw-edit.ts`, `lib/draw-templates.ts` | script layers on the canvas: one still frame painted in the sandbox (lazy chunk, aliased `@player-sandbox`), error registry for the inspector, starter templates |
| `lib/shader-edit.ts`, `lib/shader-uniform-edit.ts`, `panels/ShaderInspector.tsx` | shader layers on the canvas: a still frame per layer on the player's shared WebGL context (or live with "Animate while editing"), the compile-problem registry for the inspector, and the document edits for uniforms and presets (they keep timeline tracks and bindings that name a uniform by index in step). Pictures (`image-export.ts`) paint each shader once and embed its canvas as an image |
| `panels/` | layers + assets, inspector, timeline, interaction graph (React Flow over the player's node catalog), scripts (CodeMirror), variables |
| `lib/still-cache.ts` | artboard stills kept in IndexedDB (`interactives-stills`) from one session to the next, keyed by project + artboard and valid only for a content hash (the artboard, the artboards its instances draw, variables, fonts, data sources, assets, this build). `Editor.tsx` primes it while the project downloads; `ArtboardView` starts with the saved picture showing and builds the live DOM behind it in small bites; the canvas holds a big project's first fill back and fades it in together (`Canvas.tsx` `opening`) |
| `lib/db.ts` | API client, `.ixp` import/export |
| `lib/export.ts` | single-file HTML (embeds the player IIFE build, plus the script sandbox when used), `.ixp`, JSON |
| `panels/ReportingSection.tsx`, `components/ProjectModals.tsx` (`ResultsModal`, the Link for StudyDesk in `ShareModal`) | Project > Results and progress (score variable, top score, pass mark, completion rule, resume) writing `settings.reporting`, and the owner's results view over `GET /api/projects/:id/results`. The player side is `interactives-player/src/progress.ts`; the learner page and routes are in `index.js` |
| `lib/comments.ts`, `lib/comment-anchor.ts`, `lib/comment-jump.ts`, `shared/comments.mjs`, `components/CommentUI.tsx`, `panels/CommentsPanel.tsx`, `canvas/CommentLayer.tsx`, `Review.tsx`, `components/NoticeBell.tsx` | review comments: the client (threads, filters, writes, the comments stream, `openShareForReview()` for any Share menu), where a pin sits and follows its layer, the shared validators and filters, the conversation pieces, the Comments panel, the pins over the canvas (Comment tool, C), the review page (`#/review/<token>`: still artboards with pins, Play in a sandbox) and the projects page bell. The Share for review dialog is `ShareForReviewModal` in `components/ProjectModals.tsx` |
| `lib/live.ts`, `shared/ops.mjs` | live editing client and the shared op diff/apply |
| `lib/lottie-import.ts`, `lib/lottie-export.ts` | Lottie / dotLottie in and out (text animators with range selectors import as text modifiers) |
| `lib/text-modifiers.ts` | text modifiers on a project draft: add / remove (tracks renumbered) and the Typewriter / Wave presets (modifier + timeline in one undo step); the player side is `src/textmod.ts` |
| `lib/links.ts`, `lib/link-reconcile.ts` | Linked design files: File System Access handles in IndexedDB, the watcher (`LinkManager`), and the pure three-way merge of a re-import into the artboard (`Artboard.source` keeps the baseline) |
| `lib/ai-import.ts`, `lib/pdf-parse.ts`, `lib/pdf-color.ts`, `lib/pdf-font.ts` | Illustrator `.ai` (the PDF inside) and `.pdf` import: a minimal PDF reader, then the page content operators replayed into path, text, image and mask layers (one artboard per page) |
| `lib/rive-import.ts`, `lib/rive-defs.ts`, `lib/rev-import.ts` | `.riv` import (joysticks with handles, layer masks, text modifiers, scroll constraints and artboard component lists map onto the native joysticks, masks, modifiers, scrollable frames and repeaters, with warnings for what they do not cover; view models become shared variables, DataBinds on layers become bindings with converters; layouts become auto layout, with grids, flex basis, weights and aspect ratios; cubic value curves are normalised into eases); defs generated from rive-runtime headers by `research/rive/gen_defs.py`; `rev-import.ts` reads the Rive editor's own `.rev` (a flat list of editor objects keyed by id, no published spec) and rewrites it into the object list a `.riv` holds, then runs the same importer, so a `.rev` gives the `.riv` result plus the layer names and artboards the export drops. Format notes: `research/rive/rev-format.md`; `test/rev.test.ts` compares the matched sample pair |
| `panels/LayoutItemSection.tsx`, `lib/layout-item.ts` | The inspector's "Layout item" section for a child of an auto-layout frame: position and insets, fixed / hug / fill / percent sizes, grow and basis, aspect ratio, wrap text, auto margins, grid cell. It shows only what the parent's kind of layout reads (`parentLayoutKind`), edits several selected layers together, and writes `layoutItem` through `EditorStore.setEach`; `patchLayoutItem` keeps defaults out of the document |
| `components/GridAlignFields.tsx`, `components/AlignPicker.tsx` | A grid or stack frame's alignment in the Auto layout section: a 3x3 picker (`justifyItems` x `alignItems`) and the content selects |
| `lib/grid-tracks.ts` | Reads and writes a grid's tracks as text (`100px 25% 1fr auto`) for the inspector |
| `components/Converters.tsx` | the binding converters editor in the inspector's Data bindings section |
| `lib/dxf-parse.ts`, `lib/dxf-import.ts`, `lib/dwg-import.ts` | AutoCAD `.dxf` import (ASCII and binary: tables, blocks / inserts, entities, hatches; model space fitted to a 1600 px artboard, one group per layer) and DWG version detection with a "save as DXF" message (no DWG reader). |
| `lib/vectorcraft-import.ts`, `lib/photocraft-import.ts`, `lib/craft-shared.ts`, `lib/zstd.ts` | VectorCraft (`.vectorcraft`, JSON or gzip, pictures after a marker) and PhotoCraft (`.pcraft`, a ZIP of a JSON manifest and zstd-compressed pixel tiles) import. `craft-shared.ts` holds the matrices, colours, gradients and text placement both use; `zstd.ts` is a small zstd decoder because browsers have none. Format notes: `research/craft/FORMATS.md`; sample files in `research/craft/samples/` drive `test/craft.test.ts` |
| `lib/libraries.ts`, `lib/library-actions.ts`, `panels/LibrariesPanel.tsx`, `shared/library.mjs` | Component libraries: `shared/library.mjs` (server and browser) builds and hashes the snapshot, decides access and the version number; `libraries.ts` is what a project does with one (copy components in as linked read-only `Artboard.library` copies, find and describe updates, update in place keeping instances and variables, detach, and named colour / text styles that layers follow); `library-actions.ts` talks to the server and the store; the panel is the left panel's Libraries tab. `EditorStore.update` refuses edits to library artboards unless the call passes `{library: true}` |
| `lib/boolean.ts` | union/subtract/intersect/exclude (polygon-clipping) |
| `lib/rig.ts`, `panels/RigSection.tsx` | bones and skinning: bone drawing and glyph geometry, binding paths and image meshes to bones with automatic weights, per-point weight editing (the maths is `interactives-player/src/skeleton.ts`); the Bone tool and glyphs live in `canvas/Canvas.tsx`; `.riv` bones, skins, meshes, IK and distance constraints are imported by `lib/rive-import.ts` |
| `lib/a11y/`, `panels/AccessibilityPanel.tsx` | The accessibility checker (bottom **Accessibility** tab). `checks.ts` reads a project and returns findings per artboard (contrast, small text, keyboard path, names, descriptions, target size, autoplay, pausing, flashing, captions, title), each with a plain reason and an optional fix; `backdrop.ts` works out what is painted behind a text from the document (solid fills, gradient stops, sampled pictures via `images.ts`, and an honest "could not check" for video, shaders, blend modes), `colour.ts` is the WCAG maths, `flash.ts` counts flashes in timeline tracks, `fixes.ts` applies a fix, `report.ts` writes the sign-off HTML and CSV, `reviewed.ts` keeps the "reviewed" marks per project in localStorage. All pure apart from `images.ts` loading and `measure.ts`. It reads the layer-semantics fields (`altText`, `decorative`, `focusable`, `role`) when a layer has them. It reports checks found, never "compliant" |
| `panels/PaintLayers.tsx` | the Fill and Stroke sections as lists: several fills and strokes per shape (`fill` + `fills`, `stroke` + `strokes`), each with an eye, up/down and drag reorder, remove, opacity, blend, feather and offset (stroke: cap, join, align, dash, trim). Structure changes write the paint fields together (`paintFields` from the player: `fill`/`fills`, `stroke`/`strokes` and `paintOrder`); the first of each list is always the base paint. The Paint order section lists fills and strokes in one list (up/down or drag, `movePaint`) when a shape has both |
| `lib/path-edit.ts` | path point maths: bend a segment, split to add a point, box shapes as paths, and keeping shape keys (point tracks) renumbered when points are added or removed |
| `lib/gradient-space.ts` | Moves a gradient's points (Rive, Lottie) from the shape's space into the layer's box (`Paint.from/to/center/radius` are px from the box's top-left) |
| `lib/svg-import.ts` | SVG files to editable layers (paths with transforms baked in, groups, gradients, text) |
| `lib/image-export.ts` | PNG/SVG pictures of an artboard (the renderer inside `<foreignObject>`, assets and fonts inlined) |
| `lib/question-kit.ts`, `panels/QuestionSection.tsx` | The question kit. Add question (toolbar) builds a frame of real layers (prompt, one option layer repeated over `<prefix>_items`, buttons, feedback), the question's variables and a few interaction nodes (tagged `kit`). `syncQuestion` brings variables, answer area and graph in line after any settings change without rewriting the look of layers that exist (a type change rebuilds only the answer area; a prefix change renames variables and what reads them; a copy of a question is made independent by `adoptQuestions`). Layers are found by their `questionPart` marker. Settings, grading and banks are the player's `question.ts`. Tests: `test/question-kit.test.ts` |
| `lib/prefs.ts` | per-person preferences in localStorage (wheel zoom vs pan, tooltips, rulers, accessibility features). `accessibility` (default on) is passed to Preview as the player's `accessibility` option through `standaloneHtml`; exports and embeds keep it on |
| `panels/AccessibilitySections.tsx` | the inspector's Accessibility section (role, text alternative, description, tab stop) and the artboard's Tab order list |
| `help/` | the in-app help: `topics.ts` (the docs, with the node and property references generated from the catalog), `tutorials.ts` (the Getting started tutorials), search, drawer, `#/help/<topic>` page, F1 / Ctrl+K quick search. `markdown.tsx` also shows pictures and clips: put `![Caption](help/name.png)` (or `.mp4`) on a line of its own and the file in `public/help/` (Vite copies it to `dist/help/`; keep pictures under 150 KB and clips under 1.5 MB). `test/help.test.ts` checks every topic link, anchor and media file |
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
