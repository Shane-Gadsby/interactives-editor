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
| `POST /api/projects/:id/duplicate` | copy a project and its assets under `{newId}` |
| `GET /api/projects/:id/assets` | asset list |
| `PUT/GET/DELETE /api/projects/:id/assets/:assetId` | raw asset bytes |

Data lives in two places:
- **MongoDB:** database `lti-interactives`, collection `projects`. Each document is `{_id, name, owner, created, updated, rev, meta, doc}`, where `doc` is the project JSON stored as a string.
- **Asset files:** stored under `storage/<projectId>/<assetId>`, each with a `.json` sidecar. `INTERACTIVES_STORAGE` moves that folder; on test and prod it is symlinked to the larger storage pool. `storage/` is gitignored.

The projects list wants the index `owner.username_1_updated_-1` from `suite-libs/indexes.js`. Everything else is looked up by `_id`.

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

## Frontend (`src/`)

| Path | What |
|---|---|
| `store/store.ts` | `EditorStore`: the immer document, undo/redo with drag coalescing, selection, recording keyframes |
| `store/doc.ts` | tree lookups, world matrices, hit testing |
| `canvas/` | viewport (pan/zoom), artboards drawn by the player's `Renderer` in edit mode, overlay handles, tools, pen and path editing, snapping, in-place text |
| `panels/` | layers + assets, inspector, timeline, interaction graph (React Flow over the player's node catalog), scripts (CodeMirror), variables |
| `lib/db.ts` | API client, `.ixp` import/export |
| `lib/export.ts` | single-file HTML (embeds the player IIFE build), `.ixp`, JSON |

Preview runs the single-file export in a sandboxed iframe, so it behaves exactly like the downloaded file.

## Shortcuts

| Keys | Action |
|---|---|
| V H A F R O L P T B | select, hand, artboard, frame, rectangle, ellipse, line, pen, text, button |
| Space-drag, wheel, Ctrl+wheel | pan, scroll, zoom |
| Shift+1 / Shift+2 / Ctrl+1 | fit all / fit selection / 100% |
| Ctrl+Z, Ctrl+Shift+Z | undo, redo |
| Ctrl+C / X / V / D | copy, cut, paste, duplicate |
| Ctrl+G, Ctrl+Shift+G | group, ungroup |
| [ ] (Ctrl for front/back) | z-order |
| Arrows (Shift ×10) | nudge |
| Enter / double-click | edit text, path points, or enter a group |
| Delete | delete layers, or the selected keyframes |
