# event nodes, part 1 of 2

### event.start — On start (event)
Runs when the artboard is shown.
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.beforeLoad — Before activity loads (event)
Runs once as the activity opens, before anything is shown. It comes before On activity load and On start. The activity waits for everything this sets off to finish (up to 10 seconds), so a Load user data or Set variable here is in place for the first frame. Remembered progress is already restored. Fires on the artboard the activity opens on.
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.activityLoad — On activity load (event)
Runs once when the activity has loaded and is showing. It comes just before the first On start. Unlike On start it does not fire again when another artboard is shown, or after Start over. Fires on the artboard the activity opens on.
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.pointer — On pointer (event)
Runs when a layer is clicked, pressed, hovered or dragged. Moves and drags give event.x / event.y (artboard coordinates) and event.stepX / event.stepY (movement since the last event); drags also give event.dx / event.dy (movement since the press), event.index (the repeated copy the pointer is over now) and event.startIndex (the copy it was pressed on). With a layer picked, event.child is the name of its own layer that was hit and event.childIndex that layer's place in it from 0 (-1 and null when it landed on the layer itself): one flow can serve every item in a set of layers. On a chart layer, event.index is the chart item (bar, slice, point) that was hit, null away from them.
Gives: event.x, event.y, event.stepX, event.stepY, event.dx, event.dy, event.index, event.startIndex, event.child, event.childIndex
- target (node)
- type (select: click|dblclick|pointerdown|pointerup|pointerenter|pointerleave|pointermove|dragstart|drag|dragend, default "click")
- childrenOnly (boolean, default false): Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.key — On key (event)
Runs when a key is pressed or released. Leave the key empty for any key. Modifiers that are ticked must be held. Pick a layer to react only while that layer (or one inside it) has keyboard focus. Keys typed into a text box are ignored unless "Also while typing" is ticked. A key that runs a flow does not also scroll the page, unless "Let the browser act too" is ticked. event.key, event.code and event.shift / ctrl / alt / meta say what was pressed. event.index is the number of the item that has focus when it is a copy of a repeater or in a list with Keyboard navigation. With a layer picked, event.child and event.childIndex say which of its own layers holds the focus.
Gives: event.key, event.code, event.shift, event.ctrl, event.alt, event.meta, event.index, event.child, event.childIndex
- key (text): Leave empty for any key
- shift (boolean, default false): Must be held when the key is pressed
- ctrl (boolean, default false): Must be held when the key is pressed
- alt (boolean, default false): Must be held when the key is pressed
- meta (boolean, default false): Must be held when the key is pressed
- repeat (boolean, default false): Key down repeats while the key is held
- typing (boolean, default false): Normally keys typed into a text box or text area are left alone, so typing never sets things off. Tick this (with the key Enter and the box picked below) to run the flow when Enter is pressed in the box, like submitting a form
- allowDefault (boolean, default false): Normally when this node runs for an arrow key, Space, Page Up/Down, Home, End, Enter, Backspace or a letter, and it names a key or a layer, the browser is told not to also use it (so the page does not scroll under a game). Tick this to let the key do its usual thing as well
- target (node): Pick a layer to react to the key only while that layer, or a layer inside it, has keyboard focus (the layer becomes focusable). Leave empty to react wherever the focus is
- childrenOnly (boolean, default false): Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- type (select: keydown|keyup, default "keydown")
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.focus — On focus (event)
Runs when a layer gains or loses keyboard focus. Tabbing to it, clicking it, arrowing to it and the Focus layer node all count. The layer becomes focusable. event.index is its number when it is a copy of a repeater or in a list with Keyboard navigation. With a layer picked, event.child and event.childIndex say which of its own layers took or lost the focus. For a chart layer it fires as the arrow keys move between its items, with event.index the item.
Gives: event.index, event.child, event.childIndex
- target (node)
- childrenOnly (boolean, default false): Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- type (select: focus|blur, default "focus")
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.timer — On timer (event)
Runs after a delay, and can repeat. Repeating is optional. The delay is an expression read again each time round, so it can follow a variable. "Only while" holds the timer back while its condition is false and starts the wait over when it turns true. event.count is how many times it has fired and event.elapsed how many milliseconds it has been running (time held back by "Only while" is not counted).
Gives: event.count, event.elapsed
- ms (expr, default "1000"): Milliseconds, at least 16. An expression such as 1000 or 1500 - level * 100
- repeat (boolean, default true)
- while (expr, default ""): Optional. The timer fires only while this is true. Each time it turns true the wait starts over
- steady (boolean, default false): Keep time from the start: each fire is planned from the one before it, so a late fire does not push every later one back. For a clock or a beat that must not drift
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.variable — On variable change (event)
Runs when a variable changes value.
- variable (variable)
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.timelineEnd — On timeline end (event)
Runs when a play-once timeline finishes.
- timeline (timeline)
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.timelineMarker — On timeline marker (event)
Runs when a timeline plays past a marker. It fires when playback passes the marker going forwards or backwards, on every lap of a loop. `event.marker` is the marker name, `event.time` its time in ms.
Gives: event.marker, event.time
- timeline (timeline)
- marker (text): Leave empty to fire for every marker on the timeline
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.videoCue — On video cue (event)
Runs when a video layer's playback reaches one of its cue points. Set the cue points in the video layer's Cues. `event.name` is the cue's name, `event.time` its time in seconds, `event.index` its place in the list and `event.layer` the video's name. Only playing across a cue counts: seeking past it (the controls, a chapter, Control video) fires nothing, and seeking back arms it again. A cue marked Pause has already paused the video when this fires, so a question can be asked and Control video can play on afterwards. Bind the video's Hold paused to keep it paused until then.
Gives: event.name, event.time, event.index, event.layer
- target (node): Leave empty to fire for every video layer's cues
- name (text): Leave empty to fire for every cue on the video
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.step — On step (event)
Runs when a step is chosen in a step-through artboard, or when its animation has finished. Turn on Steps in the artboard settings first. A step is chosen by Next, Back, a jump or scrolling, and it fires again when its animation has finished playing. `event.step` is the step number from 1, `event.count` the number of steps, `event.title` and `event.caption` its text, `event.from` the step it came from and `event.direction` is 1 going forward and -1 going back.
Gives: event.step, event.count, event.title, event.caption, event.from, event.direction
- step (number): Step number from 1. Leave empty to run for every step
- type (select: change|settle, default "change")
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.message — On message (event)
Runs when a message arrives from a script, a Send message node or the host page. The host page sends one with player.send.
- name (text)
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.scroll — On scroll (event)
Runs when a layer scrolls into or out of view, or while a frame scrolls. A scrollable frame also gives event.scrollTop, event.scrollLeft and event.progress (0 to 1).
Gives: event.scrollTop, event.scrollLeft, event.progress
- target (node)
- type (select: enter|leave|scroll, default "enter")
- once (boolean, default true)
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dragStart — On drag start (event)
Runs when a draggable layer is picked up. It can be dragged by the mouse or a finger, or lifted with the keyboard (Space) or a tap. Set up dragging in the layer's Draggable section. `event.layer` is its name, `event.zone` the drop zone it was in (empty if none), `event.tags` its tags, `event.keyboard` true when it was not dragged.
Gives: event.layer, event.zone, event.tags, event.keyboard
- target (node): Leave empty to fire for every draggable layer
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dragMove — On drag move (event)
Runs over and over while a draggable layer is held and moving. It can be dragged by the mouse or a finger, nudged with Shift+arrows, or sent to another zone with the arrow keys. At most once a frame. `event.layerX` and `event.layerY` are where the layer is now, `event.dx` and `event.dy` how far it has come since it was picked up, `event.x` and `event.y` the pointer, `event.zone` the zone it is over (empty if none), `event.keyboard` true when it is not being dragged.
Gives: event.layerX, event.layerY, event.dx, event.dy, event.x, event.y, event.zone, event.keyboard
- target (node): Leave empty to fire for every draggable layer
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dragOver — On drag over zone (event)
Runs when a dragged layer moves over a drop zone, or off it. `event.zone` is the zone, `event.layer` the layer, `event.accepted` whether the zone would take it (right tag, room).
Gives: event.zone, event.layer, event.accepted
- target (node): Leave empty to fire for every drop zone
- layer (node): Leave empty for every draggable layer
- type (select: enter|leave, default "enter")
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.drop — On drop (event)
Runs when a draggable layer is let go. A drop with the keyboard or a tap counts too. Pick what to react to: dropped in a zone that took it, dropped on a zone that refused it (wrong tag, or full), or dropped where there is no zone. `event.layer`, `event.zone` (the zone it is in now), `event.from` (where it was), `event.accepted`, `event.reason` (tags or full), `event.swapped` (the layer a swap sent back) and `event.tags` are available. `event.reason` is rule, and `event.why` the words of the zone, when its Accepts when said no.
Gives: event.layer, event.zone, event.from, event.accepted, event.reason, event.why, event.swapped, event.tags
- target (node): Leave empty to fire for every drop zone (and, with Missed, for drops on no zone)
- layer (node): Leave empty for every draggable layer
- result (select: accepted|rejected|missed|any, default "accepted")
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives

### event.dragRefused — On refused (event)
Runs when a drop zone says no to a layer let go on it, with the reason why. The reason is `event.why`: the words the zone's Accepts when gave ("STA6200 runs in T1 and T3"), or nothing for a plain no. `event.reason` is rule, tags or full. Put a Show toast with `event.why` after it and the person sees why. The layer has already gone back.
Gives: event.layer, event.zone, event.from, event.reason, event.why, event.tags
- target (node): Leave empty for every drop zone
- layer (node): Leave empty for every draggable layer
- onlyIf (expr, default ""): Runs the flow only when this is true. event is in scope, with what this event gives
