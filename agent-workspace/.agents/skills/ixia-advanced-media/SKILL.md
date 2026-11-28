---
name: ixia-advanced-media
description: Use this skill when the designer asks for animation, timelines, easing, drag and drop that is not a marked question, progress bars, charts, connectors, drawn or generative graphics, shaders, or scripts. It covers reduced motion, keyboard parity for drags and the sandboxed ix script API.
---

# Motion, drag and drop, charts and scripts

These are the heavier tools. Use them only when the designer asks or the learning point needs them, and keep each one accessible. If a simpler feature does the job (a binding, a layer state, a native question), use that instead.

## Timelines and easing

`add_timeline {artboard_id, name, duration, loop: once|loop|pingpong, autoplay, tracks: [{node_id, prop, dip?, keys: [{t, value, ease}]}], ref?}`. Times are in ms from the start. A track animates one property of one layer (paths in `refs/properties.md`: `x`, `y`, `opacity`, `scaleX`, `rotation`, `fill.color`, `stroke.paint.color` and more). Each key's `ease` shapes the move from that key to the next.

- Easing names: `linear`, `step`, `easeIn`, `easeOut`, `easeInOut`, `backIn`, `backOut`, `elasticOut`, `bounceOut`, or a custom curve drawn in the editor. `easeOut` for things arriving, `easeIn` for things leaving, `easeInOut` for moves from one place to another. Elastic and bounce are rarely right for learning content (`refs/help/easing.md`).
- Text, label and true/false keys hold until the next key and never ease. To soften a text change, key `opacity` and/or `blur` dipping to 0 and 8 either side of it on separate tracks marked `dip: true`. Reduced motion leaves those out.
- Control a timeline from a flow with `action.timeline {timeline, op: play|restart|pause|stop|reverse|toggle|seek}`, or react with `event.timelineEnd` and `event.timelineMarker`. A timeline that `autoplay`s should be short, or give the learner a way to pause it.
- Markers are named points in time. With the artboard's Steps setting on, markers become the steps of a "watch, then click Next" explainer (`refs/help/steps.md`). That setting is switched on in the editor, so tell the designer if they ask for it.
- Ready-made one-click motion (Fade in, Slide in, Pop, Pulse, Shake, Fade out) is in the editor's Animate section: `refs/help/animation-presets.md`.
- Motion is for meaning (a process, a change of state, drawing the eye), never decoration. Short and gentle. Nothing flashes more than three times a second.

## Reduced motion (always)

Some learners ask their device for less movement. Then autoplaying timelines should show their end, page changes are instant and movement snaps.

- Set the project setting: `set_project_settings {props: {reducedMotion: true}}` ("Respect reduced motion"), unless the designer has turned it off on purpose.
- A timeline's `calm` flag ("Skip for less motion") makes it jump to its last pose for those viewers however it starts. `add_timeline` has no argument for it, so use `set_props` only if you can, otherwise tell the designer to tick it in the timeline's settings.
- Put what matters in the END pose. A hint that only shows part-way (a label that fades in then out) is never seen by those learners. A button that waits for an intro to finish must still work when the intro is already at its end.
- `reducedMotion` is also an expression value and `ix.reducedMotion` in scripts.
- Read `refs/help/concept-reduced-motion.md`.

## Drag and drop that is not a question

For sorting, matching and ordering that is marked, use a native question (ixia-questions). Hand-build drag layers only for free-form tasks such as a labelled diagram, a slider or a jigsaw.

- Make a layer draggable with `draggable {tags[], axis: both|x|y, bounds: none|parent|artboard|<layer id>, onMiss: stay|return, hit: center|pointer|overlap, grid, glideMs, step, tapToMove, holdToDrag, label, silent, zoneVariable}`.
- Make a layer a drop zone with `dropZone {accepts[], capacity, whenFull: reject|swap, snap: none|center|topLeft, label, highlight, contentsVariable}`. `accepts` are tags and empty means any. `capacity` 0 means no limit. `swap` is how slot puzzles and reordering work. Put the zone behind the layers that go in it in the layer order.
- Events: `event.dragStart`, `event.dragOver`, `event.drop` (with `result` accepted, rejected, missed or any), `event.dragEnd`. Actions: `action.dragPlace`, `action.dragReset`, `action.dragEnable`. Drop events carry names, not ids: `event.layer`, `event.zone`, `event.from`, `event.tags`, `event.keyboard`.
- Keyboard and touch parity is built in: Tab to a layer, Space to pick it up, arrow keys to choose a zone, Space to drop, Escape to put it back, and `tapToMove` for tap users. Always set `label` (the name read out) and an `ariaLabel`, and announce results with `action.announce` ("Eagle goes in Birds. Right.") so colour is never the only feedback. Never ship a drag with only a pointer way to finish.
- Score with the zone variables (`zoneVariable` on the draggable, `contentsVariable` on the zone) in an expression, or give each drop its own feedback with `event.drop` then `action.announce` or `action.toast`.
- `refs/runtime.md` says what drag events carry and how `ix.drag.reset` and `ix.drag.enable` behave. Full guide: `refs/help/drag-and-drop.md`, walkthroughs `tutorial-sort.md`, `tutorial-drag-match.md`, `tutorial-label.md`.

## Progress bars, charts and connectors

Details are in `refs/layers/charts-progress-connectors.md`.

- Progress (type `progress`): `value`, `max` (both take bindings), `barFill`, `orientation`, `semantics` (progressbar, meter or none), `valueText` (`{value}`, `{max}`, `{percent}`). Give it an `ariaLabel`. Bind `value` to a variable such as `explored` or `quiz.finished`, and say the number as text too. See `refs/help/progress-bars.md`.
- Chart (type `chart`): `kind` column, bar, line, pie or donut; `data` is an expression for a list (numbers, objects with `labelKey` and `valueKey`, or [label, value] pairs); `colors` as tokens; `legend`, `valueLabels`, `table` (a hidden data table for screen readers, leave it on) and an `ariaLabel`. A chart must also show its numbers as text or in value labels, not colour alone. See `refs/help/charts.md`.
- Connector (type `connector`): a line or arrow joining two layers that follows them. `from` and `to` are `{layer, side?}`, `route` straight, elbow or curved, `endCap` arrow. It is hidden from screen readers unless it has an `ariaLabel`, so give the page a text alternative for what it shows. Leave x, y, width and height at 0. See `refs/help/connectors.md`.

## Script layers (drawn graphics)

A layer of type `draw` is a box painted by a script every frame, for generative art, particles and custom visualisations. Its `code` defines `function draw(g, t, dt)` and optionally `function setup(g)`. `g` records drawing commands (it is not a canvas): `g.clear`, `g.fill`, `g.stroke`, `g.rect`, `g.circle`, `g.ellipse`, `g.line`, `g.path`, `g.text`, `g.image`, `g.save`/`g.restore`, `g.translate`/`g.rotate`/`g.scale`, `g.alpha`, `g.random`, and `g.width`, `g.height`, `g.pointer`. It reads variables with `ix.vars.name` and cannot move other layers. Draw everything every frame. Set a modest `fps` for anything that does not need 60. It must be decorative or carry an `ariaLabel`, because a canvas has no text. Full API: `refs/layers/draw-script.md`, guide `refs/help/script-layers.md`.

## Shader layers

A layer of type `shader` is a WebGL fragment shader. `code` defines `void mainImage(out vec4 fragColor, in vec2 fragCoord)` using `u_time`, `u_resolution`, `u_mouse`, `u_frame`, `v_uv`. `uniforms` is a list of `{name, type: float|vec2|vec3|vec4|color|image, value, min?, max?}`, declared for you. Compile errors stop that layer only. An image layer can carry `shaderFilter`. Shaders are decoration: mark them `decorative: true`, keep them gentle and low contrast to text, and never put the only copy of information in one. A fill can also be `{type: "shader", preset, uniforms}` using a starter preset. See `refs/layers/shader.md` and `refs/help/shader-layers.md`. Do not write long shaders unless asked.

## Scripts (the ix API)

`add_script {name, code, run_on_start}` adds JavaScript that runs in a sandbox (a separate engine with no page, cookie or network access). Use scripts only for what nodes and bindings cannot do. Scope: every script is its own async function with `ix`, `event` and `vars` in scope. A `const` in one is not visible in another, but `globalThis` is shared.

Common calls: `ix.vars.name` and `ix.set(name, v)` (not for live variables), `ix.node('Name')` with `.get`, `.set`, `.show()`, `.hide()`, `.toggle()` and `await .animate(prop, v, {duration, ease})`, `ix.timeline('Name').play()`, `ix.goTo('Page', 'fade')`, `ix.announce(text, 'polite')`, `ix.toast`, `ix.on('reset', fn)`, `ix.onFrame((dt, t) => ...)`, `ix.reducedMotion`, `ix.drag.reset(layer)` and `ix.drag.enable(layer, false)`. A `.set()` wins over an `.animate()` still on its way. Stay with the documented calls.

Tell the designer plainly what a script does and where it is (Scripts tab). A script with a syntax error never starts, so keep them short, and mention the Preview console as the place runtime errors show. Prefer `action.script` or `run_on_start` over clever hidden triggers. Full table: `refs/help/scripts.md`, tutorial `refs/help/tutorial-script.md`.

## Pointers

- refs/help/timelines.md, concept-timelines.md, easing.md, animation-presets.md, steps.md
- refs/help/drag-and-drop.md, progress-bars.md, charts.md, connectors.md, script-layers.md, shader-layers.md, scripts.md
- refs/runtime.md, refs/properties.md
