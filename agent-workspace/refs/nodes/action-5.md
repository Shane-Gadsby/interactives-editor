# action nodes, part 5 of 5

### action.dragReset — Reset draggable (action)
Sends a draggable layer back to where it started. Leave the layer empty to reset all of them ("Start again"). Fires no drag events.
- layer (node)

### action.dragEnable — Allow dragging (action)
Turns dragging on or off for a draggable layer, or a drop zone on or off. Use it to lock an answer after checking it. Leave the layer empty to change every draggable layer, or pick a container to change everything inside it; a tag keeps only the layers that carry it.
- target (node): A draggable layer or a drop zone, or a container to change everything inside it
- tag (text): When changing several, only layers with this tag (zones: ones that accept it)
- what (select: layers|zones|both, default "layers"): When changing several at once
- op (select: enable|disable|toggle, default "disable")

### action.setTheme — Set theme (action)
Shows one of the project's themes by name, or follows the viewer's colour scheme again. Themes are Light, Dark, High contrast and so on. Use "auto" to follow the viewer's colour scheme and contrast settings again. Layers whose colours are theme tokens change with it.
- theme (expr, default "\"Dark\""): A theme name in quotes, or an expression. "auto" follows the viewer.

### action.instanceInput — Set instance input (action)
Sets a variable inside an instance layer's artboard, by name. These are the instance's own inputs. Every copy of a repeated instance is set.
- target (node)
- name (text)
- value (expr, default "1")

### action.instanceTrigger — Fire instance trigger (action)
Sends a message into an instance layer's artboard only. Its On message nodes and scripts hear it, the parent does not. Every copy of a repeated instance receives it.
- target (node)
- name (text)
- payload (expr, default "")

### action.delay — Wait (action)
Pauses this flow for a time.
- ms (expr, default "500"): A number of milliseconds, or an expression worked out when the wait starts, e.g. pace <= 4 ? 4000 : 8000

### action.waitBlendIn — Wait for blend-in (action)
Holds the flow while a timeline or blend is still blending in. It holds unless that blend-in is marked "Can be left early" (see "Blend in" on Control timeline). Use it in front of a change that should not cut a blend-in short. With "Give up" the flow just stops there instead of waiting.
- timeline (timeline)
- blend (blend)
- drop (boolean, default false)

### action.animationPlay — Play animation clip (action)
Plays a clip of a Frameling animation layer, such as idle, wave or run. Leave the clip empty to carry on with the clip the layer has. It starts from the clip's first frame unless From is "Where it is". Loop and Speed change the layer's own settings. "When it finishes" waits for one pass of the clip, so a looping clip carries on after one lap. Run from On start or On timer, it doesn't set the layer going for a viewer who asks for less motion (when the project respects that and the layer isn't marked Essential): it takes the clip and shows its still frame.
- target (node)
- clip (expr, default ""): A clip name in quotes, such as "run", or an expression. Empty keeps the clip the layer has.
- from (select: start|current, default "start")
- loop (select: |loop|once, default "")
- speed (expr, default ""): 1 is the speed it was drawn at, 2 twice as fast, -1 backwards. Empty leaves the layer's speed.
- continue (select: start|end|percent, default "start"): When the next node runs: straight away, when the clip has played through, or part-way through
- continueAt (number, default 50): How far through, 0 to 100

### action.animationStop — Stop animation (action)
Stops a Frameling animation layer where it is, or back on its first frame.
- target (node)
- reset (boolean, default false)

### action.animationFrame — Go to animation frame (action)
Shows one frame of a Frameling animation layer's clip, then stops, plays on or leaves it. Frame 0 is the clip's first. A frame past the end shows the last one.
- target (node)
- frame (expr, default "0"): A number, counted from 0, or an expression
- then (select: stop|play|keep, default "stop")

### action.waitTimeline — Wait for time in timeline (action)
Holds the flow until a timeline has played to a point. Carries on at once if it is already past it, and a looping timeline that comes round counts as past. Nothing happens while the timeline is paused short of it.
- timeline (timeline)
- unit (select: ms|percent, default "ms")
- at (number, default 500)

### action.log — Log (action)
Writes to the browser console, which is handy while building.
- message (expr, default "\"clicked\"")

### action.callFlow — Call flow (action)
Runs a named Flow with the values you give it, and carries on when it has finished. Continues from Not found when no Flow on the page has that name.
Outputs: out, none
- flow (text): The name of a Flow node
- values (expr, default ""): The inputs it takes, as { name: value, ... }

### action.undo — Undo (action)
Steps the variables marked Keeps history back to how they were before the last change. Tick Keeps history on the variables that hold what a person makes (the tiles, the board, the answers). Changes close together count as one step. `canUndo` in a formula says whether there is anything to undo, for a button that greys out. Continues from Nothing to undo when there is none.
Outputs: out, none

### action.redo — Redo (action)
Puts back a change Undo took away. Any new change after an Undo clears what could be redone. `canRedo` in a formula says whether there is any.
Outputs: out, none
