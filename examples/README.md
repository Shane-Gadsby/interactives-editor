# Examples

Finished projects that ship with the editor and show on the Templates tab under **Examples**. They are data in this repo, not
rows in mongo, so they are the same on dev, test and prod and nobody can change one (the server has no route that writes them).
Anyone can play one, or use it to get their own copy to change.

```
examples/
  index.json            [{key, title, description, group, tags, artboards, preview}]
  <key>/project.json    the project document
  <key>/assets/<id>     the files it names, each with an <id>.json sidecar {mime, size}
  <key>/thumb.jpg       the card picture
```

## Adding one

1. Build it in the editor (dev server).
2. `node scripts/export-example.mjs <projectId> <key> --title "Title" --description "What it shows" --group "Getting started" --tags a,b`
   (add `--from http://host/interactives` to read from another server). Run it again to replace an example.
3. Make the picture. Any JPEG of the first artboard works, saved as `examples/<key>/thumb.jpg`. The quickest is the one the server already keeps for the project's card on the projects page: `curl -o examples/<key>/thumb.jpg <server>/api/projects/<projectId>/thumbnail` (a 400 px wide JPEG). To draw a bigger one with the editor: run
   `npm run dev`, open the editor in a browser and, from the console (a project id on the server the dev server proxies to):
   `const db = await import('/src/lib/db.ts'), ie = await import('/src/lib/image-export.ts'); const blob = await ie.projectThumbnail(await db.loadProjectRecord('<projectId>'), 480)`,
   then save `blob` (for example by POSTing it to a small local script that writes the file).
4. Commit `examples/`. Keep an example small (under a few MB with its files).

## Keeping them tidy

`node scripts/upgrade-examples.mjs [key ...]` (also `npm run examples:upgrade`) is the one place the shipped examples are brought up to the
editor's native features: it edits each `project.json` with the editor's own helpers (graph tidy for every interaction graph, the artboard
tidy for the canvas, the player's layout for the layout demos), applies the per-example changes written in `scripts/examples-upgrade.ts`, and
gives each example its author notes. The notes (ids starting `note_example_`) sit beside the artboard, never over a layer, are never drawn
by the player, and are replaced rather than added to on a second run, so running it twice changes nothing (`test/examples.test.ts` checks
that, plays every example, and keeps the notes off the artboards). When you add an example, add its entry to `UPGRADES` there. Rebuild a
`thumb.jpg` whenever an upgrade changes what the first artboard looks like.
