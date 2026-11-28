# The Frameling integration is parked (18 Nov 2026)

Frameling is a desktop app for drawing animation frame by frame. The editor played its `.flplay` packages as an
**animation** layer, with **Edit in Frameling** to send one back for changes. It is hidden for now, not removed: nothing
in the editor makes a new one or mentions it, and a project that already has one still opens, plays, and lets the layer be
selected, changed and deleted.

## The switch

`src/lib/parked.ts`: `parked.frameling`. Set it to `false` and all of the below comes back.

## What it hides while it's on

- The **Frameling animation** tool (Media group of the tool rail), its command palette entries (`Add: Frameling animation`,
  `Tool: Frameling animation`), the canvas menu's Add entry and its row in Keyboard shortcuts.
- A `.flplay` dropped or picked is turned away with a message (`insert.ts`). Dropping one on an existing animation layer
  still replaces that layer's file, so a project that has one isn't stuck.
- **Place** on an animation asset in the Assets panel.
- In the animation layer's Inspector: **Edit in Frameling**, **Replace file…**, **+ Add a new Frameling animation…** and
  the links to the help topic. The play settings (clip, playing, loop, speed, still frame, copy offset) stay.
- The five animation nodes (`event.animationEnd`, `event.animationMarker`, `action.animationPlay`, `action.animationStop`,
  `action.animationFrame`) in the node palette, the node menus and the node reference, **unless the open project already
  has an animation layer**.
- Help: the **Frameling animations** topic, its row in the scripting table, the four Frameling rows in Animatable
  properties, and the mention under Preview's Less motion.

## What is untouched

- The player: the `animation` layer, `frameling.ts`, the nodes, `ix.playClip` and friends. Exports and old projects play.
- `src/lib/frameling-import.ts`, `src/panels/AnimationInspector.tsx`, the asset kind, usage tracking.
- The MCP server's references are generated from the player's catalog, so an agent can still read about the animation
  nodes. It has no way of making an animation layer's file, so nothing there needed hiding.
- Tests: `test/frameling-layer.test.tsx` switches the flag off for itself. `test/parked-frameling.test.tsx` checks what is
  hidden and what still works.

## To bring it back

1. `parked.frameling = false` in `src/lib/parked.ts`.
2. CHANGELOG lines (Unreleased) that were removed:

- **Edit in Frameling**: a Frameling animation layer whose file has its drawing inside has an Edit in Frameling button. It downloads the .flplay and shows the steps: open it in Frameling, save, then drop the saved file on the layer (or use the new Replace file… button). Every layer keeps its settings. Frameling animations also hold still on a Still frame for viewers who ask for less motion (with Respect reduced motion on), unless marked Essential motion; the copies in a repeater can be staggered with Copy offset; and an animation's pictures are let go once no layer shows it.
- **Frameling animations**: drop a `.flplay` file from Frameling (File > Export for Interactives there) onto the canvas and it plays as its own layer, crisp for pixel art. Pick the clip, whether it plays, loops and how fast in the inspector, with a small preview. Play a Frameling clip, Stop a Frameling animation and Show a Frameling frame control it from a click, When a Frameling clip ends and When a Frameling animation reaches a marker act on it, timelines can scrub its frame, and scripts use `ix.playClip`. Packages and single-file exports carry it.

3. Help-coverage rows (`test/help-coverage.test.ts`):

```
  'Frameling animations': [['frameling-animations', '.flplay']],
  'Edit in Frameling': [['frameling-animations', '## Edit in Frameling'], ['frameling-animations', '**Still frame**'], ['frameling-animations', '**Copy offset**']],
```

4. Turn `test/parked-frameling.test.tsx` round or delete it, and put `'Frameling animation': 'add.animation'` back in
   `test/keymap-coverage.test.ts` if it was taken out.
5. The toolbox docs (`/toolbox-docs`, in si-manager) never mentioned it, so there is nothing to restore there. Add it.
