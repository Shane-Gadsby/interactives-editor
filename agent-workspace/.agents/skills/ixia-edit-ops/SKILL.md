---
name: ixia-edit-ops
description: Use this skill whenever you make a precise change with the edit tool, such as adding or restyling layers, variables, timelines, interactions, scripts, themes, tokens, text styles, pages, data sources or project settings. It lists every op and how to batch them with ref and $ref.
---

# The edit tool

`edit` changes the project. Changes apply in order as one batch and reach everyone in the live session at once (the server keeps revision history, so a person can roll back). Each change is `{op, ...}`. Put related changes in one call, and name every layer you make so the designer can find it.

Read before you change. The outline in the prompt is a summary. Use `get_overview` (give an artboard for full depth), `get_layers` (full JSON by id), `get_interactions` (an artboard's graph), `get_variables`, `get_selection` (when the designer says "this") and `list_notes`. Look up fields in `refs/` before using something for the first time: layers in `refs/layers/`, nodes in `refs/nodes/INDEX.md`, paths in `refs/properties.md`, colours in `refs/tokens.md`.

## ref and $ref (batching)

Give `ref` to name something you create (a layer, artboard, variable, timeline, script, token, note, interaction node). Later changes in the same batch use `"$ref"` wherever an id fits: `id`, `parent_id`, `artboard_id`, a layer id inside props, a variable id in `disclosure.variable` or `repeat.select.variable`, a timeline track's `node_id`. A colour says `"token:$ref"`. Refs from `duplicate` are `ref1`, `ref2` and so on. A ref only works for things made earlier in the same call. Params of interaction nodes that point at a layer, variable, script, timeline, blend, artboard or asset take its id, its exact name or a `$ref`.

## Layers

- `set_props {id or ids: [...], props: {path: value}}`: paths like `"fill.color"`, `"stroke.width"`, `"bindings.width"`. `ids` sets the same props on several layers.
- `add_layer {artboard_id, type, props?, children?: [{type, props?, children?, ref?}], parent_id?, index?, ref?}`: a whole tree in one op. With no colour given, a layer follows the starter tokens, as in the editor. Only a group or frame can have children. Set `name` in props.
- `duplicate {id, count?, dx?, dy?, columns?, name?, ref?}`: copies with everything inside, each `dx`/`dy` on from the last. With `columns` they wrap into a grid. `name` can be "Card {n}" (the original is 1).
- `delete {id}`.
- `move {id, parent_id?, artboard_id?, index?}`.

Defaults per type are in `refs/layers/defaults.md`, fields every layer has in `refs/layers/common.md`.

## Pages (artboards)

- `add_artboard {name, width, height, ref?}`.
- `delete_artboard {id, force?}`: refuses while another page uses it as a page master or a component unless `force` is true. The start page moves to the first one left.
- `set_artboard {id, props}`. Props include `master` (id or name of a page master), `masterHide` [layer names], `masterSlots` {slot: text}, `masterOver` [layer ids, on the master], `isMaster`, and `hugHeight` true to fit the page height to its content as it plays (`hugPadding` px under the lowest layer, `hugAnimate` to ease the change, `hugDuration` ms or the project's `settings.hugDuration`, default 300). A fitted page leaves out hidden layers, masks, dialog frames and any layer with `hugIgnore` true, so a dialog, toast or tooltip opens over the page instead of growing it. `props [{variable (id), label?, help?}]` says what the page takes when used as a component: each is a field on every instance, set through InstanceNode.inputs by the variable's name. Declare them rather than describing them in a note.
- An overlay page (tooltip, modal, confirm, input) is an artboard with `overlay {...}` set through `set_artboard`. See ixia-interactions.

## Variables

- `add_variable {name, type: number|string|boolean|color|enum|list, initial, options?, shared?, formula?, live?, user_data?, persist?, ref?}`. For a list, `initial` is JSON text, an array of objects. `options` is for enum. `formula` is an expression worked out at the start. `live` needs a formula: it is kept up to date as what it reads changes, and is read only (nothing can set it). `user_data` saves it for the learner, loaded before the start.
- `set_variable {id or name, props}`: props such as `formula`, `live`, `userData`, `persist`.
- `rename_variable {id or name, name, scripts?}`: renames it and everything that names it, keeping saved learner values. `scripts` defaults to true, false leaves scripts and code snippets alone. Never rename with `set_variable`.

## Timelines

`add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, dip?, keys: [{t, value, ease}]}], ref?}`. Text, label and true/false keys hold until the next key and never ease. To soften a text change, key `opacity` and/or `blur` dipping to 0 / 8 either side of it on separate tracks marked `dip: true`, which reduced motion leaves out. Easing names are in `refs/help/easing.md`.

## Interactions

- `add_interactions {artboard_id, nodes: [{ref, kind, params, note?}], edges: [{from, to, from_port?}]}`. `kind` is a node kind such as `event.pointer` or `action.visibility` (`refs/nodes/INDEX.md`). `from` and `to` are refs or ids. Use `from_port` when a node has several outputs (`true` or `false` on `logic.if`, `correct`, `wrong`, `finished` on `action.questionCheck`).
- `remove_interactions {artboard_id, ids}`.
- `set_interaction {artboard_id, id, params?, note?, x?, y?}`: change a node in place, its connections kept. `params` are merged in, and null removes one.
- `connect {artboard_id, from, to, from_port?}`.
- `disconnect {artboard_id, id}` or `{artboard_id, from, to, from_port?}`.

## Scripts

- `add_script {name, code, run_on_start, ref?}`.
- `set_script {id or name, code?, name?, run_on_start?}`.

## Themes, colours and text styles

- `add_theme {name, copy_from?, mode?: light|dark, high_contrast?, ref?}`. The first one also makes Light, Dark, High contrast and the starter tokens. `remove_theme {id}`.
- `add_colourway {colourway: gold|purple|blue|green|orange|red|high-contrast, default?}` (as + Colourway in the Themes tab).
- `add_token {name (like "color/accent"), value? (every theme), values? {theme id or name: colour}, ref?}`.
- `set_token {id or name, name?, value?, values?}`. `remove_token {id or name}` (layers keep its colour).
- `set_themes {default? (theme id or name), follow? (switch with dark mode and contrast settings), learner_switcher? (swatches that let learners pick a colourway)}`.
- `add_text_style {name, props: {fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, color?}, ref?}`. `set_text_style {id or name, props}`. A layer follows one with props `styleRefs: {text: id or name}`.

## Project, data and notes

- `set_project_settings {props: {path: value}, name?}`: paths into the project settings, as `export_project` shows them (for example `reducedMotion`).
- `add_data_source {name, kind: json|csv|tsv|text, text? | url? (fetched when it plays, refresh? seconds) | asset_id?, ref?}`. `set_data_source {id or name, name?, kind?, url?, asset_id?, refresh?}`. `remove_data_source {id or name}`. `text` is uploaded for you.
- Notes: `add_note {artboard_id? (omit for a canvas note), x?, y?, w?, h?, text, colour?: gold|orange|green|sky|purple|rose, layer_id?, ref?}`, `set_note {id, x?, y?, w?, h?, text?, colour?, layer_id? (null lets go)}`, `delete_note {id}`, `add_graph_note {artboard_id, node_id?, x?, y?, w?, h?, text, colour?, ref?}`. Notes are for the people editing and are never shown to players. You also have the separate tools `add_note`, `add_graph_note`, `edit_note`, `remove_note` and `list_notes`. Prefer those for notes.

## Colours and tokens

Anywhere a colour goes it takes a CSS colour or `"token:<name>"` (like `token:color/primary`), which follows Light, Dark, High contrast and any colourway. Prefer tokens. The edit tool stores a name as the token's id. `validate` reports a token that does not exist. Starter token names are in `refs/tokens.md`.

## A batch, for the shape of it

```
[
 {"op":"add_variable","name":"flipped","type":"list","initial":"[]","ref":"flipped"},
 {"op":"add_layer","artboard_id":"Flip cards","type":"frame","ref":"card","props":{"name":"Card","width":240,"height":150,"cornerRadius":12,"fill":{"type":"solid","color":"token:color/surface"}},
  "children":[{"type":"text","props":{"name":"Card front","text":"{item.front}"}}]},
 {"op":"set_props","id":"$card","props":{"layoutItem":{"width":"fill"}}}
]
```

## Habits that avoid trouble

- One batch per piece of work. A rejected change is named in the error (like "change 3 (add_layer)"), so fix that op and send the batch again.
- A text layer's `text` always equals its `runs` joined. Set `runs` to restyle part of a text (`refs/layers/text.md`).
- Changing a layer's position inside an auto layout frame is pointless, because the layout sets it (`refs/layers/layout-frames.md`).
- Never delete the designer's layers to "start clean". Add beside them, or ask.
- After editing, run `validate` once and fix anything you caused. Mention problems that were already there.

## Pointers

- refs/layers/defaults.md, refs/layers/common.md, refs/properties.md, refs/runtime.md
- refs/nodes/INDEX.md and the node files it names
- refs/help/concept-pages-masters.md, refs/help/concept-variables-data-bindings.md, refs/help/concept-themes-tokens.md
