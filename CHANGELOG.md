# Changelog

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
