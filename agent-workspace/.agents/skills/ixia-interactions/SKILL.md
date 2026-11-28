---
name: ixia-interactions
description: Use this skill when the designer wants things to respond to clicks, hovers, keys or changes, or asks for show and hide, tabs, accordions, tooltips, modals, confirmations, prompts, scores, conditions, lists drawn from data, or keyboard navigation. It covers click flows, expressions, bindings, layer states, disclosure, overlays and repeaters.
---

# Interactions

Prefer the built-in features over hand-wired flows: an accordion or tabs frame needs no nodes, a repeater with selection needs no nodes, a layer state needs no nodes, a binding needs no nodes. Reach for interaction nodes only for what those cannot say. For simple "when clicked do this" on a new page, `build` with `does` is quicker (ixia-blueprint).

## The graph: events, actions, logic

Each artboard has an interaction graph. Make nodes and wires with the edit op `add_interactions` (full syntax in ixia-edit-ops). Find kinds in `refs/nodes/INDEX.md`, then open the file it names for the parameters.

```
{"op":"add_interactions","artboard_id":"Quiz","nodes":[
 {"ref":"click","kind":"event.pointer","params":{"target":"Reveal button","type":"click"}},
 {"ref":"show","kind":"action.visibility","params":{"target":"Answer","op":"toggle"}},
 {"ref":"add","kind":"action.setVariable","params":{"variable":"seen","op":"add","value":"1"}}],
 "edges":[{"from":"click","to":"show"},{"from":"show","to":"add"}]}
```

- Events start a flow: `event.start` (page shown), `event.pointer` (click, hover, drag; `target` is the layer, `type` is click, dblclick, pointerenter and so on), `event.key` (`key`, with `target` to react only while that layer has focus), `event.variable`, `event.timer`, `event.drop`, `event.step`, `event.overlayOpen`. Every event has `onlyIf`, an expression that must be true or the flow does not run.
- Actions do things: `action.visibility` (`op` show, hide or toggle), `action.setVariable` (`op` set, add, toggle, push, remove, clear, reset, toggleItem, next, previous and more), `action.setProperty`, `action.animate`, `action.timeline`, `action.artboard` (go to a page: `to` picked, next, previous, back or expression), `action.reportResult`, `action.startOver`, `action.announce` (screen reader text), `action.toast`, `action.celebrate`, `action.focus`, `action.script`.
- Logic: `logic.if` (`condition`, outputs `true` and `false`), `logic.random`, `logic.once`, `logic.forEach`, `logic.repeat`, `logic.sequence` (outputs 1, 2, 3).
- Use `from_port` on an edge when the node has named outputs: `{"from":"check","to":"yes","from_port":"true"}`. `action.questionCheck` outputs `correct`, `wrong`, `finished`, `setDone`.
- Layers, variables, pages, timelines and scripts in params can be given by exact name, by id or by `$ref`.
- Add a short `note` on a node when the flow is not obvious, or an `add_graph_note` for a group of nodes.
- Inspect what exists with `get_interactions` before adding more. Do not duplicate a flow that is there.

## Expressions

Short JavaScript formulas, in `{braces}` in text, in bindings, in node params marked expr, and in a repeater's items. Variables and data sources are in scope by name.

- Text needs quotes: `answer == "Paris"`. Compare with `==`. A single `=` sets nothing in a formula.
- Lists count from 0: `items[0]`. `index` and `event.index` count from 0, so show `{index + 1}` to learners.
- Inside a repeater copy, `item` and `index` are the copy's list item and place, and `isSelected` is true for a picked copy.
- `event` describes what fired (`event.index`, `event.child`, `event.key`, `event.zone`).
- Handy: `lives > 0`, `correct ? "Well done" : "Try again"`, `Math.round(progress * 100) + "%"`, `wordCount(text)`, `count(...)`, `fmt(price, 2)`. A typo after a dot reads nothing and is not an error. A slot that cannot be worked out stays as written in text, which is how a mistyped name shows up.
- `validate` finds expressions that do not parse. Read `refs/help/expressions.md` and `refs/help/concept-expressions.md` for the helpers.

## Bindings

`bindings {property path: expression}` on a layer keeps a property up to date: `visible: "step === 3"`, `width: "progress * 300"`, `fill.color: "correct ? \"token:color/success\" : \"token:color/error\""`, `text: "..."`. A binding can return a `"token:..."` string for a colour. An input's `value` is tied to a variable both ways by `bindings: {value: "name"}` plus `bindingModes: {value: "both"}`, so typing writes the variable. Converters (`converters {prop: [{type: ...}]}`) change a value on its way. Paths are in `refs/properties.md`, the rest in `refs/help/bindings.md`.

## Layer states (hover, pressed, focus, disabled, expression)

`states [{id, name?, when: hover|pressed|focus|disabled|expr, expr?, props {path: value}}]` gives a layer looks for a state in place of a ternary in four or five bindings. `props` uses the same paths as a binding (`fill.color`, `stroke.paint.color`, `color`, `opacity`, `scaleX`, `scaleY`, `cornerRadius`). Only what is listed changes, later states win, and a state beats a binding on the same property. Pointer states come on only while it runs. An `expr` state shows on the canvas too. A `focus` state is the place for a visible focus look (use `color/focus`). See `refs/layers/states.md` and `refs/help/layer-states.md`.

## Accordions and tabs (disclosure)

A frame or group becomes an accordion with `disclosure {open: "one"|"many", variable, toggle?, panels?}`. Each child is a section: its first layer is the header and the rest is the panel. The clicking, showing and `aria-expanded` are the frame's own job, so no nodes are needed.

- `variable` is a number variable for `one` (counts from 0, -1 for none) or a list variable for `many`. Without a variable nothing opens when clicked. Make it first with `add_variable` and refer to it by `"$ref"`.
- `toggle: true` (one only) lets clicking the open section close it. Tabs leave it off.
- `panels` is the id of a container whose children are the panels, matched to the frame's other children in order, which makes a set of tabs. Tabs can also set `tabs` for the tab list container.
- Keep the accordion frame in auto layout so the sections under an opened one glide down.
- Read `refs/layers/overlays-dialogs-accordions.md` and `refs/help/accordions.md`, and `refs/help/tutorial-accordion.md` for the build.

## Overlays (tooltips, modals, confirms, prompts) and dialogs

- An overlay is a page (artboard) with `overlay {kind: "tooltip"|"modal"|"confirm"|"input", side?, offset?, scrim?, openVariable?}` and, for a tooltip, `fade?`, `tail?`, `stay?`. A layer shows it with `overlay {overlayId, trigger?, side?, offset?, inputs?, inputExprs?}`: the layer is the target (a tooltip sits beside it). When the overlay page holds a single frame, that frame is the card and is drawn at its own auto layout size.
- `input` asks for something typed (the editor calls it a prompt). `confirm` asks with buttons. A modal, confirm or input shows while its `openVariable` is on, and a click on the trigger turns it on, so a Close button inside is a plain Set variable.
- `inputs` hand values to the overlay as it opens (by variable name, listed in the overlay page's `props`), so one overlay can serve many layers. `inputExprs` does the same with expressions (`layer.name`, and `item` and `index` in a repeater).
- An overlay page is never opened on its own, never counts in `pageCount` and never grows a fitted page.
- A frame with `dialog {modal (default true), scrim, closeOnEscape (default true), closeOnOutsideClick, initialFocus, returnFocus (default true), openVariable}` opens over the page. It shows while `openVariable` is on and Escape turns it off. Give it an `ariaLabel`. Tab stays inside while it is open.
- Make the toast page first, then `action.toast` with `toast` and `text`. A toast announces itself to screen readers.
- Read `refs/help/overlays.md` and `refs/help/dialogs.md`.

## Repeaters and selection

A frame or group with `repeat {items, layout: "vertical"|"horizontal"|"grid"|"none", gap, columns}` draws its first child once per item in `items` (an expression for a list). Restyling the one template restyles all copies, and adding a line to the list adds a copy.

- `repeat.select {mode: "one"|"several", variable, toggle?}` makes a click, Space or Enter pick a copy, with no nodes. `variable` is a number variable (one, -1 for none) or a list of numbers (several). Each copy sees `isSelected`, copies become radios or checkboxes with `aria-checked`, and arrows move between them.
- A list variable holds the content: `add_variable {name: "cards", type: "list", initial: "[{\"front\":\"Plagiarism\",\"back\":\"...\"}]"}`. In the template use `{item.front}`.
- Keep a repeater's frame in auto layout (`layout`) so copies reflow.
- Read `refs/layers/repeaters-keynav.md`, `refs/help/repeaters.md` and `refs/help/concept-repeaters.md`.

## Keyboard navigation (keyNav)

`keyNav {mode: "list"|"grid"|"radio", orientation: "vertical"|"horizontal"|"both", columns, wrap, indexVariable, countHidden}` on a frame or group makes one item the Tab stop and moves between a repeater's copies or a container's children with arrows, Home and End. `radio` also selects the item it lands on. Use it on any custom list, grid of cards or toolbar of buttons that is not already a repeater with selection.

## Always

- Every clickable thing must work from the keyboard: a real `button` layer, or `role: "button"` plus a name and a `shortcut`/key event. Name it (`ariaLabel`).
- Say what changed to screen readers when something appears (`action.announce`, or `liveRegion` on a text layer).
- After wiring, `validate` once.

## Pointers

- refs/nodes/INDEX.md, refs/nodes/event-1.md, refs/nodes/action-1.md, refs/nodes/logic.md
- refs/help/interactions.md, concept-events-actions.md, concept-only-if.md, variables.md
- refs/help/tutorial-first-interaction.md, tutorial-reveal.md, tutorial-accordion.md
