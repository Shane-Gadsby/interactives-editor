# Interaction node reference
Every event, action and logic node with its settings.

This is every node you can use in the **Interactions** tab, with its settings. There are three kinds. **Events** start a flow: a click, a key, a timer. **Actions** do something: play a sound, go to a page, change a value. **Logic** chooses the way through: check a condition, do things in order. To build flows, see [Interactions](interactions).

Nodes are named for what happens, for example *Go to a page*. The name in brackets after it is the technical name the node has in the file, which search also finds. Preferences has a **Technical wording** switch if you would rather see those names.

Settings that take an expression are worked out as a formula: see [Expressions](expressions). In them, `event` holds what started the flow, and a node's **Gives** line lists what it adds.

## Events

### When the page is shown (On start)

Runs when the page is shown.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### Before activity loads

Runs once as the activity opens, before anything is shown.

It comes before On activity load and On start. The activity waits for everything this sets off to finish (up to 10 seconds), so a Load user data or Set variable here is in place for the first frame. Remembered progress is already restored. Fires on the page the activity opens on.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When the activity has loaded (On activity load)

Runs once when the activity has loaded and is showing.

It comes just before the first On start. Unlike On start it does not fire again when another page is shown, or after Start over. Fires on the page the activity opens on.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When clicked or hovered (On pointer)

Runs when a layer is clicked, pressed, hovered or dragged.

Moves and drags give event.x / event.y (page coordinates) and event.stepX / event.stepY (movement since the last event); drags also give event.dx / event.dy (movement since the press), event.index (the repeated copy the pointer is over now) and event.startIndex (the copy it was pressed on). With a layer picked, event.child is the name of its own layer that was hit and event.childIndex that layer's place in it from 0 (-1 and null when it landed on the layer itself): one flow can serve every item in a set of layers. On a chart layer, event.index is the chart item (bar, slice, point) that was hit, null away from them.

**Gives:** `event.x`, `event.y`, `event.stepX`, `event.stepY`, `event.dx`, `event.dy`, `event.index`, `event.startIndex`, `event.child`, `event.childIndex`.

- **Layer**
- **Event**: Click / tap, Double click, Press, Release, Hover start, Hover end, Pointer moves over it, Drag starts, Dragging, Drag ends
- **Only when a child is hit**: Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a key is pressed (On key)

Runs when a key is pressed or released.

Leave the key empty for any key. Modifiers that are ticked must be held. Pick a layer to react only while that layer (or one inside it) has keyboard focus. Keys typed into a text box are ignored unless "Also while typing" is ticked. A key that runs a flow does not also scroll the page, unless "Let the browser act too" is ticked. event.key, event.code and event.shift / ctrl / alt / meta say what was pressed. event.index is the number of the item that has focus when it is a copy of a repeater or in a list with Keyboard navigation. With a layer picked, event.child and event.childIndex say which of its own layers holds the focus.

**Gives:** `event.key`, `event.code`, `event.shift`, `event.ctrl`, `event.alt`, `event.meta`, `event.index`, `event.child`, `event.childIndex`.

- **Key**: Leave empty for any key
- **Shift held**: Must be held when the key is pressed
- **Ctrl held**: Must be held when the key is pressed
- **Alt held**: Must be held when the key is pressed
- **Meta held**: Must be held when the key is pressed
- **Fire again while held**: Key down repeats while the key is held
- **Also while typing in a text box**: Normally keys typed into a text box or text area are left alone, so typing never sets things off. Tick this (with the key Enter and the box picked below) to run the flow when Enter is pressed in the box, like submitting a form
- **Let the browser act too**: Normally when this node runs for an arrow key, Space, Page Up/Down, Home, End, Enter, Backspace or a letter, and it names a key or a layer, the browser is told not to also use it (so the page does not scroll under a game). Tick this to let the key do its usual thing as well
- **Only while this layer has focus**: Pick a layer to react to the key only while that layer, or a layer inside it, has keyboard focus (the layer becomes focusable). Leave empty to react wherever the focus is
- **Only when a child is hit**: Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- **Event**: Key down, Key up
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a layer is focused (On focus)

Runs when a layer gains or loses keyboard focus.

Tabbing to it, clicking it, arrowing to it and the Focus layer node all count. The layer becomes focusable. event.index is its number when it is a copy of a repeater or in a list with Keyboard navigation. With a layer picked, event.child and event.childIndex say which of its own layers took or lost the focus. For a chart layer it fires as the arrow keys move between its items, with event.index the item.

**Gives:** `event.index`, `event.child`, `event.childIndex`.

- **Layer**
- **Only when a child is hit**: Only run when the event landed inside one of the layer's own layers, not on the layer itself. Needs a layer picked
- **Event**: Gains focus, Loses focus
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a timer goes off (On timer)

Runs after a delay, and can repeat.

Repeating is optional. The delay is an expression read again each time round, so it can follow a variable. "Only while" holds the timer back while its condition is false and starts the wait over when it turns true. event.count is how many times it has fired and event.elapsed how many milliseconds it has been running (time held back by "Only while" is not counted).

**Gives:** `event.count`, `event.elapsed`.

- **Every (ms)**: Milliseconds, at least 16. An expression such as 1000 or 1500 - level * 100
- **Repeat**
- **Only while**: Optional. The timer fires only while this is true. Each time it turns true the wait starts over
- **Steady**: Keep time from the start: each fire is planned from the one before it, so a late fire does not push every later one back. For a clock or a beat that must not drift
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a value changes (On variable change)

Runs when a variable changes value.

- **Variable**
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When an animation finishes (On timeline end)

Runs when a play-once timeline finishes.

- **Timeline**
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When an animation reaches a marker (On timeline marker)

Runs when a timeline plays past a marker.

It fires when playback passes the marker going forwards or backwards, on every lap of a loop. `event.marker` is the marker name, `event.time` its time in ms.

**Gives:** `event.marker`, `event.time`.

- **Timeline**
- **Marker name**: Leave empty to fire for every marker on the timeline
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a video reaches a cue point (On video cue)

Runs when a video layer's playback reaches one of its cue points.

Set the cue points in the video layer's Cues. `event.name` is the cue's name, `event.time` its time in seconds, `event.index` its place in the list and `event.layer` the video's name. Only playing across a cue counts: seeking past it (the controls, a chapter, Control video) fires nothing, and seeking back arms it again. A cue marked Pause has already paused the video when this fires, so a question can be asked and Control video can play on afterwards. Bind the video's Hold paused to keep it paused until then.

**Gives:** `event.name`, `event.time`, `event.index`, `event.layer`.

- **Video layer**: Leave empty to fire for every video layer's cues
- **Cue name**: Leave empty to fire for every cue on the video
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When the step changes (On step)

Runs when a step is chosen in a step-through page, or when its animation has finished.

Turn on Steps in the page settings first. A step is chosen by Next, Back, a jump or scrolling, and it fires again when its animation has finished playing. `event.step` is the step number from 1, `event.count` the number of steps, `event.title` and `event.caption` its text, `event.from` the step it came from and `event.direction` is 1 going forward and -1 going back.

**Gives:** `event.step`, `event.count`, `event.title`, `event.caption`, `event.from`, `event.direction`.

- **Step**: Step number from 1. Leave empty to run for every step
- **When**: The step is chosen, Its animation has finished
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When a message arrives (On message)

Runs when a message arrives from a script, a Send message node or the host page.

The host page sends one with player.send.

- **Message**
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When scrolled (On scroll)

Runs when a layer scrolls into or out of view, or while a frame scrolls.

A scrollable frame also gives event.scrollTop, event.scrollLeft and event.progress (0 to 1).

**Gives:** `event.scrollTop`, `event.scrollLeft`, `event.progress`.

- **Layer**
- **When**: Enters view, Leaves view, Is scrolled (scrollable frame)
- **Only once**
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When dragging starts (On drag start)

Runs when a draggable layer is picked up.

It can be dragged by the mouse or a finger, or lifted with the keyboard (Space) or a tap. Set up dragging in the layer's Draggable section. `event.layer` is its name, `event.zone` the drop zone it was in (empty if none), `event.tags` its tags, `event.keyboard` true when it was not dragged.

**Gives:** `event.layer`, `event.zone`, `event.tags`, `event.keyboard`.

- **Draggable layer**: Leave empty to fire for every draggable layer
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### While dragging (On drag move)

Runs over and over while a draggable layer is held and moving.

It can be dragged by the mouse or a finger, nudged with Shift+arrows, or sent to another zone with the arrow keys. At most once a frame. `event.layerX` and `event.layerY` are where the layer is now, `event.dx` and `event.dy` how far it has come since it was picked up, `event.x` and `event.y` the pointer, `event.zone` the zone it is over (empty if none), `event.keyboard` true when it is not being dragged.

**Gives:** `event.layerX`, `event.layerY`, `event.dx`, `event.dy`, `event.x`, `event.y`, `event.zone`, `event.keyboard`.

- **Draggable layer**: Leave empty to fire for every draggable layer
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When dragged over a drop zone (On drag over zone)

Runs when a dragged layer moves over a drop zone, or off it.

`event.zone` is the zone, `event.layer` the layer, `event.accepted` whether the zone would take it (right tag, room).

**Gives:** `event.zone`, `event.layer`, `event.accepted`.

- **Drop zone**: Leave empty to fire for every drop zone
- **Draggable layer**: Leave empty for every draggable layer
- **When**: Moves over the zone, Moves off the zone
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When dropped (On drop)

Runs when a draggable layer is let go.

A drop with the keyboard or a tap counts too. Pick what to react to: dropped in a zone that took it, dropped on a zone that refused it (wrong tag, or full), or dropped where there is no zone. `event.layer`, `event.zone` (the zone it is in now), `event.from` (where it was), `event.accepted`, `event.reason` (tags or full), `event.swapped` (the layer a swap sent back) and `event.tags` are available. `event.reason` is rule, and `event.why` the words of the zone, when its Accepts when said no.

**Gives:** `event.layer`, `event.zone`, `event.from`, `event.accepted`, `event.reason`, `event.why`, `event.swapped`, `event.tags`.

- **Drop zone**: Leave empty to fire for every drop zone (and, with Missed, for drops on no zone)
- **Draggable layer**: Leave empty for every draggable layer
- **Result**: Taken by the zone, Refused by the zone, Dropped on no zone, Any drop
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On refused

Runs when a drop zone says no to a layer let go on it, with the reason why.

The reason is `event.why`: the words the zone's Accepts when gave ("STA6200 runs in T1 and T3"), or nothing for a plain no. `event.reason` is rule, tags or full. Put a Show toast with `event.why` after it and the person sees why. The layer has already gone back.

**Gives:** `event.layer`, `event.zone`, `event.from`, `event.reason`, `event.why`, `event.tags`.

- **Drop zone**: Leave empty for every drop zone
- **Draggable layer**: Leave empty for every draggable layer
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On list drop

Runs when a copy of a list is dragged to another place in it or to another list.

The list variable has already changed. `event.item` is the item that moved, `event.from` and `event.to` the names of the lists, `event.index` its new place (from 0), `event.fromIndex` where it was, and `event.moved` is true when it went to another list.

**Gives:** `event.item`, `event.from`, `event.to`, `event.index`, `event.fromIndex`, `event.moved`.

- **Into list**: A repeater that items are dragged into. Empty: every one
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When dragging ends (On drag end)

Runs when a draggable layer is let go anywhere, or the pick-up is cancelled.

Escape cancels a pick-up. Fires after On drop. `event.result` is accepted, rejected, missed or cancelled; `event.zone` the zone it is in now, `event.dropped` true when a zone took it.

**Gives:** `event.result`, `event.zone`, `event.dropped`.

- **Draggable layer**: Leave empty to fire for every draggable layer
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When the microphone or camera is used (On microphone or camera)

Runs when something happens with a recording, the camera or a photo.

Something happened with a recording, the camera or a photo: a recording started, a recording is ready (the learner pressed Stop, a length limit was reached, or the device went away; `event.reason` says which), a recording could not start (`event.problem` and `event.message` say why, in plain words), the microphone or camera state changed (including the learner choosing not to use them), a video recording finished playing, or a photo arrived. Needs the microphone, camera or photos ticked in Project > Microphone and camera.

**Gives:** `event.reason`, `event.problem`, `event.message`.

- **When**: A recording is ready, A recording started, Something could not start, Microphone or camera state changed, A video recording finished playing, A photo arrived, Live listening started or stopped
- **Recording name**: Only for this recording. Leave empty for any.
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### When data has loaded (On data loaded)

Runs when a data source finishes loading or refreshing.

`event.data` holds the value.

**Gives:** `event.data`.

- **Data source**
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On overlay open

Runs on an overlay page (a tooltip, modal, confirmation, prompt or toast) as it opens, whoever opened it.

Put it on the overlay page itself. It runs before the overlay has faded in, after what the layer hands it is set, so a flow here can fill the page for this opening. event.layer is the name of the layer that opened it (empty when its variable or a flow did), event.index the number of that layer when it is a copy of a repeater, and event.inputs what it was handed.

**Gives:** `event.layer`, `event.index`, `event.inputs`, `event.overlay`.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On overlay close

Runs on an overlay page as it closes, however it was closed.

Put it on the overlay page itself. event.layer is the layer that had opened it, as for On overlay open.

**Gives:** `event.layer`, `event.index`, `event.overlay`.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On story end

Runs when the story reaches an -> end line, with the ending it named.

The ending is in event.ending ("Joined the club" for -> end Joined the club, empty for a plain -> end). Wire it to a page of endings, or to Go to page for the title screen. The story keeps showing its last line until something moves on.

**Gives:** `event.ending`.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On story line

Runs as each line of the story comes up, or only someone's lines.

event.speaker is who says it (empty for narration), event.text the words and event.line the line's hidden id. For a reaction the script doesn't need to know about: a portrait in a corner, a count of lines read, a sound.

**Gives:** `event.speaker`, `event.text`, `event.line`.

- **Speaker**: Only this person's lines (as the script names them). Empty: every line
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On story choice

Runs when the reader picks one of the story's choices.

event.number is which one (from 1, among those on show) and event.choice its words.

**Gives:** `event.number`, `event.choice`.

- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### On story scene

Runs when the story reaches a scene (a # line), or one scene by its title.

event.scene is the scene's title and event.chapter the chapter's name.

**Gives:** `event.scene`, `event.chapter`.

- **Scene**: Only this scene. Empty: every scene
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

### Flow

Steps with a name that Call flow runs from anywhere on the page, so they are wired once.

Give it a name and, if it takes any, the names of its inputs. A Call flow node hands it values, and the steps after it read them as `event.<input>` (`event.amount`). Flows on the page master can be called from every page that uses it.

- **Name**
- **Inputs**: The names of the values it takes, separated by commas
- **Only if**: Runs the flow only when this is true. event is in scope, with what this event gives

## Actions

### Play or stop an animation (Control timeline)

Plays, pauses, stops, restarts, reverses or jumps a timeline.

"Blend in" fades its pose in over the pose the layers have now, instead of cutting to it (for switching between looks).

- **Timeline**
- **Do**: Play, Restart, Pause, Stop (reset), Play in reverse, Toggle play/pause, Jump to time
- **Time (ms)**
- **Blend in (ms)**
- **Blend easing**: Shapes the blend-in: how fast the new look takes over. Linear is an even cross-fade.
- **Blend out of**: The timelines and blends this replaces, by name: "Idle" or ["Idle", "Walk"]. They keep running while the new look blends in over them, then stop. With no blend-in time they stop straight away.
- **Freeze while blending out**: The timelines and blends being replaced stop where they are instead of running on while the new look blends in
- **Can be left early**: Another change (a Wait for blend-in node) may cut in before this blend-in is done
- **Continue**: When the next node runs: when this finishes, part-way through, or straight away
- **At (%)**: How far through, 0 to 100

### Start a blend (Play blend)

Starts a blend: its timelines play together, mixed by the weights of its number variables.

It plays until it is stopped. Does nothing if it is already playing. "Blend in" fades its pose in over the pose the layers have now.

- **Blend**
- **Blend in (ms)**
- **Blend easing**: Shapes the blend-in: how fast the new look takes over. Linear is an even cross-fade.
- **Blend out of**: The timelines and blends this replaces, by name: "Idle" or ["Idle", "Walk"]. They keep running while the new look blends in over them, then stop. With no blend-in time they stop straight away.
- **Freeze while blending out**: The timelines and blends being replaced stop where they are instead of running on while the new look blends in
- **Can be left early**: Another change (a Wait for blend-in node) may cut in before this blend-in is done

### Stop a blend (Stop blend)

Stops a blend.

The mixed pose stays where it is, except for additive blends, which take their change back out.

- **Blend**

### Change a value or counter (Set variable)

Sets, adds to, toggles, steps through a range, resets or changes the list of a variable.

Change list items where a field is a value changes every item that matches in one step. A live variable (worked out from its formula) cannot be set. Next and Previous move a number on by one between First and Last, and go round to the other end (or stop) past either: for slides, cards and tabs.

- **Variable**
- **Do**: Set to, Add to it, Flip on or off, Add to the end of the list, Remove from the list (by position), Empty (list, number or text), Back to its starting value, Add to the list, or take out if it is there, Remove from the list (by value), Change one list item, Change list items where a field is a value, Go to the next number in a range, Go to the previous number in a range
- **First number**: The lowest number it goes to: 0 or 1 for a list of slides, cards or tabs.
- **Last number**: The highest number it goes to. For a list that counts from 1 that is its length (slides.length); counting from 0 it is slides.length - 1. Empty means no top end.
- **At the ends**: Past the last number: go round to the first (and the other way), or stay where it is.
- **Item position**: Which item to change (0 is the first). Left empty it is event.index, the item the event came from (a repeater copy that was clicked, a drag that landed on one).
- **Items where this field**: The field to look at in each item, like state. Dots reach inside (owner.name). Empty looks at the item itself (for a list of words or numbers). With this and the next box both empty, every item changes.
- **Is**: The value it has to be, like "up" (words go in quotes) or 3. Every item that matches is changed.
- **Field**: Optional. Change only this field of the item and keep the rest (for items that are objects). Empty replaces the whole item.
- **Value**: Expression, e.g. 1, "hi", score * 2. For a list: the item to append ({name: "Ann"}), the position to remove (0 is the first), the value to add or take out, or what to put in the item or items (item and index are available: item.count + 1).
- **Over (ms)**: For a number: ease to the new value over this long instead of jumping. 0 is at once. A newer change to the same variable takes over from wherever it has got to. Anything that reads the variable (a blend, a binding) follows it as it moves. Skipped when the viewer asks for less motion.
- **Easing**: How the number eases while it moves
- **Continue**: When the next node runs: straight away, part-way through the ease, or when the number has arrived
- **At (%)**: How far through, 0 to 100
- **Say it**: Optional. Words a screen reader says, politely, once the change is made. Put a value in curly brackets to say it: Slide {slide} of {slides.length}. Left empty, nothing is said. Does nothing when accessibility is off in the preferences.

### Put values back to the start (Reset variables)

Puts the chosen variables back to their starting values.

That is the typed value, the value for this course, or their formula worked out again. Live variables are left alone. Unlike Start over, nothing else changes.

- **Variables**: The variables to put back

### Change a layer's setting (Set property)

Changes a layer property instantly.

- **Layer**
- **Property**
- **Value**

### Animate a layer's setting (Animate property)

Animates a layer property to a value (a tween).

- **Layer**
- **Property**
- **To**
- **Relative (add to current)**
- **Duration (ms)**
- **Easing**
- **Continue**: When the next node runs: when this finishes, part-way through, or straight away
- **At (%)**: How far through, 0 to 100

### Move the view to a layer (Move view)

Pans and zooms the page to frame a layer, or back out to the whole page.

Everything on the page moves together, so clicks and drags still land on the right layer. The page master's layers (a logo, a footer, a score bar) stay where they are. The layer is framed as large as fits, with the space around it you set, never zoomed in past the limit. Choose the whole page to come back. Changing page starts the new page on its whole view, and a learner who asked for less motion gets there at once. Use it for a map the learner travels across, or to read a comic panel by panel. An embedded page keeps a view of its own.

- **Move to**: A layer, The whole page
- **Layer**: The layer to frame
- **Space around it (px)**: Page pixels left clear around the layer
- **Zoom in no more than (times)**: Stops a small layer filling the page. 0 means no limit
- **Duration (ms)**: 0 moves at once
- **Easing**
- **Continue**: When the next node runs: when this finishes, part-way through, or straight away
- **At (%)**: How far through, 0 to 100

### Show or hide a layer (Show / hide)

Shows, hides or toggles a layer.

- **Layer**
- **Do**: Show, Hide, Toggle

### Go to a page (Go to artboard)

Switches to another page: one you pick, the next or previous page, or one an expression names.

It can also go back to the one the learner came from. Next and previous follow the pages in the project's order, inside the page's group when it is in one, leaving out the narrow and wide versions of a responsive set and a library component's own copy. pageNumber and pageCount say where the page is. Back follows the learner's own path, and Previous follows the project's order. Continues from No page when there is nowhere to go (the last page, nothing to go back to, a name that matches nothing). To move through the steps of one page use Go to step. Outputs: No page.

- **Go to**: A chosen page, Next page, Previous page, Back (where the learner came from), One named by an expression
- **Page**
- **Page name or id**: The page's name or id. Nothing matching continues from No page
- **Transition**: Wipe and push have a direction. Iris opens a circle and Zoom goes into the page, both from the place below. Reduced motion makes every one instant
- **Opens from**: Where the circle opens or the zoom goes. With nothing clicked (a timer, a message) it uses the middle
- **Across (%)**
- **Down (%)**
- **Speed**: How long the change takes, in milliseconds. Fast is 150, Medium is 300, Slow is 600; any other number is Custom

### Open a web address (Open URL)

Opens a link in a new tab, this frame, the parent frame or the whole page.

- **URL**
- **Open in**: New tab (_blank), Same frame (_self), Parent frame (_parent), Whole page (_top)

### Report result

Sends the learner's result (score, pass or fail, completion) to where the page keeps it.

Played from a share link in StudyDesk, that is the learner's record on the server. The score comes from the score variable in Project > Results and progress. Nothing is lost or broken if no record is kept.

- **Report as**: Complete, Score so far (not complete)
- **Score**: Leave empty to report the score variable. Or an expression, e.g. correct * 10.

### Record

Records that something happened, for Insights.

It counts how often each name was recorded, and each value it carried. Counts only, nobody is named, so do not put anything personal in the name or value. Learners' browsers send it to the page around the project (the StudyDesk learner page, which passes it to the analytics); nothing is sent from an export on its own, or when recording is off in Project > Learner records.

- **Name**: What happened, in a few words ("opened hint", "chose route B"). Up to 60 characters.
- **Value**: Something short to count separately: a choice, a level, a score band. Leave empty for just the name.

### Send analytics

Sends a named event, with a few values, to the analytics the Toolbox keeps.

With nothing joined to Saved or Not saved it joins the queue every Toolbox app reports through, which is sent every few seconds, and the flow carries straight on. Join Saved (or Not saved) and it is sent at once and waited for instead: Saved runs once the row is kept, with event.ids (and event.id, the first) to hold on to, and Not saved runs with event.reason when there is no page to keep it, nobody is signed in, it is a preview, the project records nothing or this visit has sent too many. The bottom port continues straight away either way. Data is a formula that gives a few named values, such as {level: level, time: seconds}; a single value is kept as "value". Learners' browsers send it to the page around the project (the StudyDesk learner page), so an export on its own sends nothing. Do not put anything personal in the name or the data. Outputs: Saved, Not saved.

- **Name**: What happened, in a few words ("finished level", "chose a pathway"). Up to 60 characters. {braces} are filled in.
- **Data**: A few named values to keep with it: text, numbers, yes or no, or short lists of those. Up to 20 names.

### Show the credits (Open credits)

Opens the list of credits and references, as the Credits button does.

Put it on a small button or link of your own and the automatic Credits button is left off that page. The list is the one in Project > Credits; with nothing in it the learner sees that no credits have been added yet. Focus goes into the list, and back to your button when it closes.

### Start over

Begins again: variables reset, progress is cleared and the start page shows.

It counts as a new attempt, and remembered progress is cleared. Nothing after this node runs.

### Change the mouse pointer (Set cursor)

Changes the mouse cursor over a layer, or over the whole player.

With no layer chosen it changes the whole player.

- **Layer**
- **Cursor**

### Save progress (Save user data)

Saves the chosen variables for the person playing, so Load user data can restore them later.

On the StudyDesk learner page (Share > Link for StudyDesk) they are kept on the server under the signed-in person and the course; anywhere else (an export, Preview, no sign-in) in the browser. Each save only changes the variables chosen here. Continues when saved.

- **Variables**: The variables to save

### Load saved progress (Load user data)

Restores the variables that Save user data last saved for the person playing.

Only the chosen variables are set, from the same places Save user data keeps them. A variable that was never saved keeps its value. Continues from Loaded when anything came back, and from Nothing saved when nothing did (a first visit, or nowhere to load from). Outputs: Loaded, Nothing saved.

- **Variables**: The variables to load

### Load data

Reloads a data source, optionally from a different URL.

Continues when loaded.

- **Data source**
- **URL (optional)**: Leave empty to reload from its own file/URL, e.g. "https://api.example.com/items?page=" + page

### Undo a stroke

Takes back the last stroke or clear on a sketch pad.

Outputs: Done, Nothing to undo.

- **Sketch pad**: A rectangle with Sketch pad ticked

### Redo a stroke

Puts back what Undo a stroke last took away on a sketch pad.

Outputs: Done, Nothing to redo.

- **Sketch pad**: A rectangle with Sketch pad ticked

### Clear a sketch pad

Rubs out everything drawn on a sketch pad, which Undo a stroke can bring back.

Outputs: Next.

- **Sketch pad**: A rectangle with Sketch pad ticked

### Add a row to a shared table

Adds a row to a shared table everyone sees: a name on a sign-up sheet, a card on a board.

Only the fields the table has are kept. The server checks who may add and the limits (rows per person, per slot, the table's size); a refusal goes on from Not done with `event.problem` (not-allowed, per-person, slot-full, full, busy). The table's value is the new table either way. Outputs: Done, Not done.

- **Shared table**: A data source set to Shared table
- **Values**: The row: { field: value, ... }

### Change a row of a shared table

Changes some fields of one row of a shared table, if the table's rules let this person.

Row is the row itself (`item` in a repeater of the table's rows) or its id. A refusal goes on from Not done with `event.problem`. Outputs: Done, Not done.

- **Shared table**
- **Row**: The row, or its id
- **Values**: The fields to change: { field: value, ... }

### Take a row out of a shared table

Takes one row out of a shared table, if the table's rules let this person.

Row is the row itself (`item` in a repeater of the table's rows) or its id. A refusal goes on from Not done with `event.problem`. Outputs: Done, Not done.

- **Shared table**
- **Row**: The row, or its id

### Save setup

Keeps the values of the variables marked Part of the setup for everyone who opens this setup.

For an app set up where it sits: the tiles, the cards or a picture the people who look after it chose. Only the project's owner, its collaborators, power users and staff can save; anyone else goes on from Not saved, with `event.problem`. Everyone who opens the setup afterwards starts with these values. Put it on a Save button on the app's editing page, shown when `context.canEdit`. Outputs: Saved, Not saved.

### Send a response

Files what a person did as one row of your Responses table: answers, choices, where cards went.

Values is an object of named values (`{ q1: answer1, mood: mood }`) or a list, such as a card sort's placements (`cards.map(c => ({ card: c.name, group: c.group }))`). Each response is kept under the person, the time and the course, with their name only when Project settings > Responses says With names (otherwise a code that is the same for them every time). See them in the Responses tab of Results, and download them as CSV (a row per response, or a row per item of a list in it) or JSON. Needs the project shared to StudyDesk; in Preview and a downloaded file they are kept in the browser. Continues from Sent, or Not sent when there is nowhere to send it or it was refused. Outputs: Sent, Not sent.

- **Kind of response**: A name for this kind of response, so one app can collect two kinds and download them apart
- **Values**: What to keep: { name: value, ... }, or a list of records

### Add to shared responses

Adds an answer to a Shared responses data source, such as a word for a class cloud.

Adds a short answer (or a list of them) to a Shared responses data source: what a person types for a word cloud, a poll, a shared list. The data source says who sees the answers (only the person, or everyone in their class on the StudyDesk learner page), how long an answer may be, how many one person may add and which words are blocked. Answers are counted and anonymous: the data source holds the counts, never names. Continues from Added when something was kept, and from Not added when nothing was (blocked, already there, over the limit, or nowhere to keep it). Outputs: Added, Not added.

- **Shared responses**: A data source set to Shared responses
- **Answer**: The answer to add: text, or a list of texts. Capitals and spacing are ignored when answers are counted.

### Take back shared responses

Takes this person's own answers back out of a Shared responses data source.

Takes this person's own answers out of a Shared responses data source: the one named, or all of theirs when the answer is empty. It never touches anyone else's. Continues when done.

- **Shared responses**: A data source set to Shared responses
- **Answer**: The answer to take back, or a list of them. Leave empty to take back everything this person added.

### Send to room

Sends a message to a Room data source, for a chat or a question wall everyone in the class sees.

Sends a message to a Room data source. Everyone in the same StudyDesk course who has the project open sees it at once, shown under a made-up seat name (or a first name, if the data source says so). Blocked words and empty messages are not sent and take the Not sent path. The messages, and how many people are here, are in the data source itself (for example a repeater over its messages). In Preview the room is your own pretend one, and outside StudyDesk there is nobody to send to. Outputs: Sent, Not sent.

- **Room**: A data source set to Room
- **Message**: The message to send: text, such as what a person typed into an input.

### Add a stamp to the course passport (Add to course collection)

Adds a stamp, or raises a counter, in a named collection that every interactive in the same course shares.

A course collection is a passport or badge case with a name you choose. Every project that uses the same name, in the same StudyDesk course, adds to and reads the same collection for each learner. A stamp is a short text kept once (capitals do not matter). A counter keeps the larger number, never the latest, so two pieces counting the same thing cannot take each other back. On the StudyDesk learner page (Share > Link for StudyDesk) it is kept on the server under the signed-in person and their course. Anywhere else (Preview, an export, a link opened outside StudyDesk) there is no course, so it is kept in that browser only. Continues from Added when something was new, and from Nothing new when it was already there, was empty, or there was nowhere to keep it. Outputs: Added, Nothing new.

- **Collection**: The collection name. Use the same name in every project that should share it
- **Add**: A stamp, To a counter
- **Name**: The stamp, or the counter, as plain words. Use a formula (a quoted text, a variable, a list of texts for several stamps) to work it out
- **Value**: The number the counter should reach. It only ever goes up, so a smaller number changes nothing

### Load the course passport (Load course collection)

Fetches a named course collection into a list variable of its stamps and a number variable of how many.

Asks for the collection as it stands now: what other interactives in the course added too. Both variables are optional. Check course collection can then ask about one stamp or counter without asking again. In Preview and anywhere there is no course it reads this browser's copy. Continues from Loaded when the collection has anything in it, and from Empty when it has nothing or there is nowhere to keep it. Outputs: Loaded, Empty.

- **Collection**: The collection name
- **Stamps into**: A list variable to fill with the stamps (optional)
- **Count into**: A number variable to fill with how many stamps there are (optional)

### Check the course passport (Check course collection)

Branches on whether a course collection has a stamp, or a counter that has reached a number.

Look for a stamp, a counter, or both (both must be true). With neither it asks whether the collection has anything. It reads what the last Load or Add fetched, and fetches the collection first if this project has not yet. A counter can also write its number into a variable. Continues from Has it or Not yet. Outputs: Has it, Not yet.

- **Collection**: The collection name
- **Stamp**: A stamp to look for (optional)
- **Counter**: A counter to look at (optional)
- **At least**: The counter must have reached this number
- **Counter into**: A number variable that gets the counter's number (optional)

### Countdown / clock

Runs a countdown (seconds left) or a clock (seconds gone) and writes it to a variable.

It writes the variable about four times a second while it runs. Start begins it from the top, Pause holds it, Resume carries on, Reset puts the variable back and stops it. Time up continues when a countdown reaches 0 (or a clock reaches its limit). It holds still when the learner leaves the page, and a new Start or Resume takes it up again. One clock per variable. Outputs: Time up.

- **Variable**: A number variable the clock writes
- **Do**: Start, Pause, Resume, Reset
- **Counts**: Down (seconds left), Up (seconds gone)
- **Seconds**: Counting down: where it starts. Counting up: where it stops (0 never stops)
- **Whole seconds**: Write 12 rather than 11.75. A countdown shows the second it is in (it reads 1 until it is done), a clock the seconds completed

### Play sound

Plays an audio asset, once or on a loop, at a chosen volume and speed.

The sound can be picked here or worked out by an expression (a list item's sound, say). Tick Soundtrack for music that should carry on through page changes. Continues from the bottom port, and from Stopped if a Stop sound node (or Stop other sounds first) ends it before it finishes. With Stopped wired, "When it finishes" only continues on a natural end. `soundPlaying()` and `soundsPlaying` say what is playing, for a button that toggles Play and Stop. Outputs: Stopped.

- **Sound**
- **Sound from expression**: Optional, and it wins over the sound picked above. It gives a sound's id or name from Assets (a list item's sound field, for instance), or the address of a sound file. Nothing plays if it comes out empty.
- **Volume (0-1)**: A number from 0 (silent) to 1 (full), or an expression such as a variable
- **Speed**: 1 is as recorded, 0.5 is half speed, 2 is double. From 0.25 to 4. A number or an expression such as a variable.
- **Keep the pitch when the speed changes**: On, a slowed sound stays at its own pitch (where the browser allows it); off, slower is lower and faster is higher
- **Loop**: true to play round and round until a Stop sound node, or until the page changes (unless it is the soundtrack, which carries on). Or an expression, such as a variable. A looping sound never finishes, so the next node runs straight away.
- **Soundtrack: keep playing on the next pages**: On, this is the project's music: it carries on when the page changes, goes quiet while a narration, a description or Speak is heard over it, and ends at a Stop sound node or when the project is closed or started over. Starting the same soundtrack again just carries on (no second copy), and a different one is crossfaded to. Tick Loop as well for music that goes round.
- **Stop other sounds first**: Stop every other sound played by Play sound before this one starts (for comparing two clips, so only one is heard at a time)
- **Continue**: When the next node runs: when this finishes, part-way through, or straight away
- **At (%)**: How far through, 0 to 100

### Control video

Plays, pauses, seeks, changes the speed of or steps a frame through a video layer.

Frame steps pause the video first. Slow playback keeps the pitch. Does nothing if the layer is not a video that is on the page.

- **Video layer**
- **Do**: Play, Pause, Play or pause, Go to a time (seconds), Skip forward or back (seconds), Step one frame forward, Step one frame back, Set the speed, Next speed up, Next speed down
- **Seconds**: An expression: 12, or -5 to skip back five seconds, or tags[0]
- **Speed**: 1 is normal, 0.5 is half speed, 2 is double. Between 0.0625 and 16

### Stop sound

Stops sounds that Play sound started: all of them, or just one.

The way to end a looping sound. It ends the soundtrack too, with a fade out. Timeline audio is not affected.

- **Only this sound**: Leave empty to stop every sound Play sound has going
- **Or the sound from an expression**: Optional, and it wins over the sound picked above. The same kind of answer Play sound takes.

### Start recording

Starts recording from the learner's microphone or camera into a named recording.

The page around the project asks the learner first (one plain consent screen made from Project > Microphone and camera), starts only after a real tap, and shows a recording bar with the level, a timer and a Stop button that the project cannot hide. It stops at the length limit. Continues from Recording when it has started, or from Could not start (not allowed, no device, the learner said no, or nowhere to ask: see `mediaMessage`). Recordings stay in memory and are gone when the page is left. With "Start or stop" one button does both: pressed while that name is recording it stops and continues from Recorded, and otherwise it starts. Outputs: Recording, Recorded, Could not start.

- **Do**: Start or stop makes one button the record and stop button: it stops if this recording is going, and starts otherwise
- **Quiet other sounds first**: Stop every sound, recording playback and spoken voice before the microphone opens, so the model answer does not leak into the recording
- **Recording name**: A name for this recording. A project can keep several, each under its own name (up to 8).
- **Record**: Sound from the microphone, Video with sound, Video, no sound
- **Longest (seconds)**: Stop by itself after this long. 0 uses the limit in Project > Microphone and camera.

### Listen live

Turns live listening on or off, so the microphone can drive numbers you use anywhere.

While it is on, the microphone drives numbers you can use anywhere: `micLevel` (how loud, 0 to 1) and `micBands` (a list of 8 numbers from low to high sound, 0 to 1 each, about 25 times a second), and `listening` is true. Nothing is recorded or kept, and only those numbers reach the project. The page around the project asks the learner first (the one consent screen, made from Project > Microphone and camera, which needs Live listening ticked), starts only after a real tap, and shows a Listening bar with a Stop button the project cannot hide. Continues from Listening when it has started (or stopped), or from Could not start (not allowed, no device, the learner said no, or nowhere to ask: see `mediaMessage`). Read the numbers in bindings and text, and give a way to play without the microphone. Outputs: Listening, Could not start.

- **Do**: Start listening, Stop listening
- **Stop when the learner leaves this page**: On by default, so the microphone is not left open behind another page. Untick it to listen across several pages (the learner can still press Stop on the Listening bar).

### Stop recording

Stops the recording and continues once it is ready to play.

The learner can also press Stop on the recording bar, which fires On microphone or camera (A recording is ready) instead. Continues from Nothing to stop when that name was not recording and holds nothing. Outputs: Recorded, Nothing to stop.

- **Recording name**: A name for this recording. A project can keep several, each under its own name (up to 8).

### Play recording

Plays a finished recording back.

A sound recording plays through the project's own sound, so the viewer's sound button and volume apply. A video recording plays in the layer chosen below, from the page around the project. Continues from Nothing recorded when that name holds no recording yet, and from Stopped when a sound recording is stopped before it finishes (with Stopped wired, "When it finishes" only continues on a natural end). Outputs: Nothing recorded, Stopped.

- **Do**: Play, Stop playing
- **Recording name**: A name for this recording. A project can keep several, each under its own name (up to 8).
- **Volume (0-1)**
- **Show video in**: For a video recording: the layer whose place the video plays in. Not needed for sound.
- **Continue**: When the next node runs: when this finishes, part-way through, or straight away
- **At (%)**: How far through, 0 to 100

### Discard recording

Throws a recording away so the learner can record again.

Stops it first if it is playing or still recording.

- **Recording name**: A name for this recording. A project can keep several, each under its own name (up to 8).

### Download recording

Offers the learner a file of the recording to save on their device.

The page around the project does it, after a tap. It is the only way a recording leaves memory.

- **Recording name**: A name for this recording. A project can keep several, each under its own name (up to 8).
- **File name**: Without the extension, which comes from the recording. An expression, e.g. "answer-" + question

### Camera preview

Shows the learner's camera live in the place of a layer, or takes it down.

The page around the project draws the picture, over the project, so the project never sees the camera's pixels (use Take or choose a photo for a still). Asks the learner first, like Start recording. Continues from Could not start when it is not allowed or there is no camera. Outputs: On, Could not start.

- **Do**: Show, Hide
- **Show in**: The layer whose place the camera picture takes. It follows the layer if the layer moves.
- **Mirror (like a mirror)**
- **Which camera**: Front (facing the learner), Back

### Take or choose a photo

Gets a picture and puts it in an image asset, so every layer that uses the asset shows it.

From the device's photo picker (choose a file, or take one with the camera, depending on the device), or a still of the live camera preview. The picture is scaled down so its longer side is at most the size below. Nothing is uploaded. Continues from No photo when the learner backs out or it is not allowed. Outputs: Got a photo, No photo.

- **Do**: Throwing it away puts the asset's own picture back and forgets the photo.
- **From**: Photo picker, Photo picker, back camera, Photo picker, front camera, The live camera preview
- **Put it in**: An image asset in the project (any picture will do as the placeholder). Layers showing it change to the photo.
- **Or the asset from an expression**: Optional, and it wins over the asset picked above. It gives an asset's id or name (a list item's photo field, for instance), so one node can fill a different asset for each item.
- **Longest side (px)**

### Download a file

Offers the learner a file to save: a report, a CSV, notes, or a picture or PDF of a layer.

Built here and handed to the page around the project, which saves it after a tap. Works in any project, no microphone or camera needed. Text only, up to 2 MB (a web page with pictures in it, 16 MB). A picture or a PDF of a layer is the layer as it is on screen, with an optional footer, and is saved straight away. Characters a file name can't hold (a colon, a slash) are replaced.

- **File name**: Without the extension
- **Contents**: For a web page (.html), write [[image:id]] where a picture goes, with an asset's id or name (a photo the learner took, say), and it is replaced by the picture itself so the file carries its images. Use html(text) around anything the learner typed.
- **Type**: Text (.txt), CSV (.csv), JSON (.json), Markdown (.md), Web page (.html), Picture of a layer (.png), PDF of a layer (.pdf)
- **Layer**: The layer to save as it is on screen now. Empty: the page. Layers ticked Not in downloads are left out
- **Page size**: The size of the layer, A4 landscape, A4 portrait
- **Footer, left**: A line at the foot of the page, on the left. Empty: no footer
- **Footer, right**: The same line, on the right

### Picture of a layer

Makes a picture of a layer or the page as it is now, to download or keep in a variable.

Kept, the picture goes in a text variable as a data address: bind an image layer's picture to it to show it, and save the variable as user data to keep it for the person (pictures up to about 1 MB). Layers ticked Not in downloads are left out. Continues from Failed when the picture could not be made. Outputs: Done, Failed.

- **Layer**
- **Then**: Download it, Keep it in a variable
- **File name**: Without the extension
- **Keep it in**
- **Sharpness**: As on screen, Twice (for print)

### Copy to clipboard

Puts text on the clipboard, for a Copy button beside a code, a link or a result.

Put it on a click: browsers only let a page copy when the person has just pressed something. Continues from Copied, or from Not copied when the page around the project refuses (an old embed without clipboard access), so you can show the text to copy by hand instead. Outputs: Copied, Not copied.

- **Text**: What to copy, e.g. a variable, or "Your code is " + code

### Open a file

Asks the person for a CSV, JSON or text file from their device and puts it in a variable.

Put it on a click: the browser only opens its file chooser for one. A CSV or TSV becomes a list with a row per line, keyed by the first row; JSON becomes its value; anything else stays text. Up to 2 MB. Nothing is sent anywhere: the file is read in the page. Continues from Opened, or from Not opened when they cancel or the file is too big. Outputs: Opened, Not opened.

- **Accepts**: CSV, JSON or text, CSV, JSON, Text
- **Put it in**: A list variable for a CSV, any variable for the rest
- **File name into (optional)**: A text variable that gets the file's name

### Full screen

Fills the whole screen with the project, or comes back out.

Put it on a click: browsers only go full screen for one. The viewer can always leave with Escape. `fullscreen` in a formula is true while it is, for a button that says Enter or Leave. Continues from Not allowed when the page around the project does not let it go full screen. Outputs: Done, Not allowed.

- **Do**: Switch between the two, Go full screen, Leave full screen

### Print

Opens the browser's print dialog for the page, where the person can also save it as a PDF.

It prints what is on the page as it is now. For a file of one layer, use Download a file instead. Continues from Not allowed when the page around the project does not allow printing. Outputs: Opened, Not allowed.

### Send to a web address

Sends a value to a web address as JSON, and keeps the answer.

For a form that goes to your own service, a webhook or an API. It keeps to the hosts the project may load data from (Project settings, Allowed data hosts), never sends the viewer's cookies or logins, and gives up after 15 seconds. Continues from Sent when the address answers with success, and from Failed otherwise; the answer goes in the variable either way, and `event.status` holds the HTTP status. Outputs: Sent, Failed.

- **Address**: An https address, e.g. "https://example.com/api/answers"
- **Method**: POST (add), PUT (replace), PATCH (change), DELETE
- **Value**: Sent as JSON: a variable, a list, or { name: value, ... }
- **Answer into (optional)**: What the address sends back

### Offer: do not use my microphone or camera

Asks the learner whether to stop using their microphone and camera from now on.

It asks in a screen of the page around the project. If they say yes it is remembered in their browser, every activity then shows its plain version (`microphone` and `camera` read off), and the project cannot undo it. Only the learner decides. Put it on a button such as "Use the keyboard instead".

### Run script

Runs a custom JavaScript script.

`event` holds what triggered it.

- **Script**

### Run code

Runs an inline JavaScript snippet with ix, event and variables in scope.

- **Code**

### Send message

Sends a named message to scripts, On message nodes and the host page.

- **Message**
- **Payload**

### Go to step

Moves a step-through page to another step.

Turn on Steps in the page settings first. Next and Back play the animation to the neighbouring step; going to a step further away shows it straight away. Does nothing on a page without steps, or past the first or last step.

- **Go to**: Next step, Previous step, First step, Last step, A step number
- **Step number**: From 1. In a dot of the step bar: event.index + 1

### Captions and sound

Changes the viewer's choices for captions, descriptions, the transcript and sound.

It can turn captions or descriptions of what is on screen on or off, make them larger or smaller, open the transcript, and mute or unmute: whatever the viewer has chosen. For your own buttons when the built-in ones are hidden in Project settings. The choices are remembered in the viewer's browser.

- **Do**: Captions: flip, Captions: on, Captions: off, Descriptions: flip, Descriptions: on, Descriptions: off, Captions: larger text, Captions: smaller text, Transcript: flip, Transcript: show, Transcript: hide, Sound: flip, Sound: on, Sound: off, Sound: start what the browser held back

### Show toast

Shows a toast: a short message over a corner of the page that goes by itself.

Make the toast first with the Toast button in the Web tools. It is read out to screen readers as it appears, so it needs no Announce node beside it. Showing one that is already up gives it the new words and its full time again; different toasts stack.

- **Toast**: The toast page to show
- **Message**: The words it says this time, as an expression, e.g. "Saved " + name. Empty leaves the words the toast already has

### Celebrate

Throws a short burst of confetti or stars over the page, with words if you like.

It never takes a click or the focus, so the next button works straight away, and it clears itself in under two seconds. A viewer whose device asks for less motion sees a still badge with the same words instead. The words are read out politely to screen readers. Pick a sound to play with it.

- **Look**: Confetti, Stars
- **Words**: Shown on a badge in the middle and read out. Empty: no badge
- **Sound**: Optional. Played with it
- **Colours**: Party colours, The project's accent colours
- **Wait for it to finish**: Off, the next node runs straight away

### Start the story

Starts the story from the top (a New game button), or from a scene or chapter you name.

Goes to the story's stage page if it isn't showing. Everything the story kept (its own values, who's on stage, the choices taken) starts again; project variables are left alone, so reset them first if a new game should clear them too.

- **From**: A scene title or chapter name. Empty: the first chapter

### Go on

Finishes the line that's typing, or goes on to the next one, and cuts a [wait] short.

The story stage already goes on with a click anywhere, Space or Enter. A page with a Go on node of its own (on its dialogue box, say) keeps clicks to itself, so a click on a picture doesn't move the story on.

### Pick choice

Picks one of the story's choices on show, counting from 1.

Wired to a click on the copy of a list of story.choices, the default picks the copy that was clicked. The keys 1 to 9 pick choices too. A greyed-out choice can't be picked. Outputs: Picked, Not a choice.

- **Choice**: Which choice, from 1. The default is the clicked copy of a list

### Back to the story

From a page a [call ...] line went to: back to the story stage, carrying on after that line.

The result is in story.result, so a line after the call can say "if story.result == 'solved'". From any other page it goes nowhere and runs Not called. Outputs: Not called.

- **Result**: What the page hands back (story.result)

### Auto or Skip

Turns Auto (lines go on by themselves) or Skip (read lines fly past) on, off, or the other way.

Auto waits for a line's voice to finish. Skip only goes through lines read before (on this device), and stops at a choice and at the first new line, unless Skip unread is on in the reader's settings.

- **Mode**: Auto, Skip, Both off
- **Turn it**: The other way, On, Off

### Go back a line

Takes the story back to an earlier line, undoing what happened since (values, choices, who was on stage).

Wired to a click on a copy of a list of story.history, Lines back picks that line. The history holds the last 200 lines. Outputs: Nothing to go back to.

- **Lines back**: How many lines back. In a list of story.history: story.history.length - event.index

### Save the story

Saves where the story is, and every variable, in a slot on this device, or deletes a slot.

Slots are 1, 2, 3 and so on (a list of story.saves shows them, with the chapter, the scene, the last words and when), plus quick. The story saves itself in auto at every choice. Saves stay in this browser, like a game's saves on a console. Outputs: Nothing to save.

- **Slot**: A number, 'quick' or 'auto'. In a list of story.saves: event.index + 1
- **Do**: Save, Delete the save

### Load the story

Puts the story back where a save left it, with the variables as they were, and shows the stage.

Slot latest is the newest save of all, which is what a Continue button wants (story.canContinue says whether there is one). A line deleted since the save carries on from the nearest line before it that's still there. Outputs: Empty slot.

- **Slot**: A number, 'quick', 'auto' or 'latest'. In a list of story.saves: event.index + 1

### Story setting

Changes one of the reader's settings for the story, kept on their device.

Text speed (letters a second; empty for the story's own), Auto speed (2 is twice as quick), Skip unread lines, Music, Voice and Effects volumes (0 to 1), Text size (1 as designed) and Readable font. Captions for sounds and Show song titles are on or off too. Read them back as story.prefs, for sliders and toggles on a settings page.

- **Setting**: Text speed, Auto speed, Skip unread lines, Music volume, Voice volume, Effects volume, Text size, Readable font, Captions for sounds, Show song titles
- **To**: The new value. From a slider or a toggle: event.value

### Go to a scene

Carries the story on from a scene or chapter you name, and shows the stage.

For a map: a place's button goes to its scene. Unlike Start the story nothing is forgotten (values, coins, things carried stay), and a page the story called is left behind. {values} work, so a list of story.places can say {story.places[event.index]}. Outputs: No such scene.

- **Scene or chapter**: A scene title (a # line) or a chapter name. {values} work

### Puzzle answer

Says the puzzle on this page was answered right or wrong, for the big moment and the score.

Right marks it solved for what it's worth now (puzzle.value) and shows puzzle.right; wrong takes a little off and shows puzzle.wrong. Try again clears the wrong mark. A question on a puzzle page does this by itself when it's checked, so this is for a puzzle made of anything else: drag and drop, a dial, a code lock. Outputs: Not a puzzle page.

- **Answer**: Right, Wrong, Try again (clear the wrong mark)

### Open a hint

Opens one of the puzzle's hints (paying hint coins the first time) and shows it, or puts it away.

Hints open in order, then the big hint. One already open shows again for free. puzzle.hintText is the hint showing, puzzle.coins what the reader has left. Wired to a click on a copy of a list of puzzle.hints, the default opens that one. Outputs: Not enough coins, No such hint yet.

- **Do**: Open and show it, Put it away
- **Hint**: Which hint, from 1 (the big hint comes after the others), or 'next' for the next to open

### Puzzle memo

Shows or hides the memo, a sketch pad over the puzzle for working things out.

puzzle.memo says whether it is showing: bind the memo layer's Visible to it.

- **Turn it**: The other way, On, Off

### Leave the puzzle

Back to the story from a puzzle, or to the page before when it was played from the index.

Skip it marks an unsolved puzzle skipped. story.result is 'solved', 'skipped' or empty, so the script can say if story.result == 'solved'. A skipped puzzle stays in the index to come back to. Outputs: Nowhere to go back to.

- **Skip it**: Mark it skipped if it is not solved yet

### Hint coins

Gives the reader hint coins, or takes some away.

story.coins (and puzzle.coins) is how many they have. A save keeps them, and a new game starts again from the number in the Story settings.

- **Do**: Give, Take away
- **How many**

### Hide toast

Puts a toast away before its time is up, or one that stays until dismissed.

A Close button inside a toast is a click wired to this. With no toast chosen it puts every toast away.

- **Toast**: The toast to put away. None chosen puts them all away

### Announce

Says something to screen readers through a live region.

For example "Correct, 3 of 5". Nothing visible changes. Does nothing when accessibility is off in the preferences.

- **Text**: An expression, e.g. "Correct, " + score + " of 5"
- **Priority**: Polite: after what is being read, Assertive: interrupt

### Read aloud

Says something aloud with a voice installed on the learner's own device.

It can say a text expression, a question with its options, or the feedback after a check. Nothing is recorded or sent anywhere, and with no local voice for the language nothing is said (bind to voiceAvailable to hide what depends on it). It never starts by itself, so put it behind a click or key: iOS only lets the first words start from a tap. The learner's speed choice (0.75 to 1.5, remembered) applies on top of Speed here. A layer's "Say it like" text is what the voice says for that layer. Also: stop, pause, resume, slower, faster, repeat.

- **Do**: Say a text expression, Say a question and its options, Say the feedback after a check, Say the feedback once checked, else the question, Say all the text on this page, Stop, Pause, Carry on, Pause or carry on, Say the last thing again, Slower (the learner's speed, one step), Faster (the learner's speed, one step)
- **Text**: An expression, e.g. "Question " + (index + 1) + ". " + questions[index].prompt
- **Question**: The question frame (made with Add question)
- **Language**: Only a voice on the device for this language is used. Words in another language read with the wrong sounds, so none is used then
- **Speed**: A multiplier for this reading, 1 is normal. The learner's own speed choice is applied on top
- **Continue when it finishes**: Hold the next node until the words have been said (or stopped, or there is no voice)
- **With no voice**: When no voice on the device can read this language (or Only speak when is false), send the words to the live region instead, so a screen reader user does not miss the feedback
- **Only speak when**: Optional. A condition such as a "spoken prompts" variable. While it is false the voice stays quiet (and Announce is used if chosen above). Empty: always.

### Check answer

Checks the answer on a question and updates its answered, correct, attempts, score and feedback variables.

A question is made with Add question. This locks it when it is right or out of tries, and tells screen readers the feedback. Continues from "right" or "wrong", then also from "finished" once the question is locked. For a question bank that is gone through once, "set done" also continues when that was the last question of the run. Outputs: right, wrong, finished, set done.

- **Question**: The question frame

### Reset question

Puts a question back to the start: no answer, no hints, all tries back.

Options are reshuffled when the question shuffles. With a question bank it moves on to the next row. Run it on start to set the question up. A bank that is gone through once ("When the rows run out: finish") continues from "set done" instead of "out" when there is no next row, and can start a new run or a review of the ones missed. Outputs: set done.

- **Question**: The question frame
- **Next from the bank**: With a question bank: draw the next row. Off keeps the row showing and only clears the answer.
- **Keep the answer**: Do nothing when the question has already started this visit, so the answer is still there when the learner comes back to the page. The start of a question set to keep its answer uses this; a Try again button must have it off.
- **Bank run**: For a bank that is gone through once: carry on, draw a new run from the rows, or run only the questions the last run got wrong.
- **Retake**: For questions that have Retakes (a test marked on the server): start the next go at the whole set, once every question is finished and a go is left. Without it a finished question only comes back showing how it finished.

### Show hint

Shows the next hint of a question and tells screen readers.

Does nothing when there are none left or the question is finished.

- **Question**: The question frame

### Choose option

Selects an option of a choice question.

It swaps the choice for a single answer and toggles it for several. Normally run from a click on the option layer, where event.index is which option was clicked.

- **Question**: The question frame
- **Option**: Which option, counting from 0 in the order shown

### Move item

Moves an item of an ordering question one place up or down.

It tells screen readers where the item went.

- **Question**: The question frame
- **Item**: Which item, counting from 0 in the order shown
- **Move**: Up (earlier), Down (later)

### Item dropped in a group

Says whether the item just dropped is in the group it belongs to, for a categorise question.

Sets the question's feedback and tells screen readers. It does not check the answer or use a try. Outputs: right, wrong.

- **Question**: The question frame

### Focus layer

Gives a layer keyboard focus, or takes focus away from whatever has it.

Only tab stops can take focus: layers with an On focus event or a click (with accessibility on), buttons, inputs and links.

- **Do**: Focus the layer, Clear focus
- **Layer**

### Put layer in drop zone

Moves a draggable layer into a drop zone as if it had been dropped there.

It settles by the zone's snap setting, or goes to the zone's centre. Does nothing if the zone would not take it. Fires no drag events, so it cannot start a loop; it does update the zone variables. Leave the layer empty to send every draggable layer, or pick a container to send everything inside it; a tag keeps only the layers that carry it. They go in one after another until the zone is full.

- **Draggable layer**: A draggable layer, or a container to send everything inside it
- **Drop zone**
- **Only tagged**: When sending several, only layers with this tag

### Reset draggable

Sends a draggable layer back to where it started.

Leave the layer empty to reset all of them ("Start again"). Fires no drag events.

- **Draggable layer**

### Allow dragging

Turns dragging on or off for a draggable layer, or a drop zone on or off.

Use it to lock an answer after checking it. Leave the layer empty to change every draggable layer, or pick a container to change everything inside it; a tag keeps only the layers that carry it.

- **Layer**: A draggable layer or a drop zone, or a container to change everything inside it
- **Only tagged**: When changing several, only layers with this tag (zones: ones that accept it)
- **Changes**: When changing several at once
- **Do**: Allow, Do not allow, Toggle

### Switch the colour theme (Set theme)

Shows one of the project's themes by name, or follows the viewer's colour scheme again.

Themes are Light, Dark, High contrast and so on. Use "auto" to follow the viewer's colour scheme and contrast settings again. Layers whose colours are theme tokens change with it.

- **Theme**: A theme name in quotes, or an expression. "auto" follows the viewer.

### Give an embedded page a value (Set instance input)

Sets a variable inside an instance layer's page, by name.

These are the instance's own inputs. Every copy of a repeated instance is set.

- **Instance layer**
- **Input**
- **Value**

### Trigger something in an embedded page (Fire instance trigger)

Sends a message into an instance layer's page only.

Its On message nodes and scripts hear it, the parent does not. Every copy of a repeated instance receives it.

- **Instance layer**
- **Trigger**
- **Payload**

### Wait

Pauses this flow for a time.

- **Milliseconds**: A number of milliseconds, or an expression worked out when the wait starts, e.g. pace <= 4 ? 4000 : 8000

### Wait for blend-in

Holds the flow while a timeline or blend is still blending in.

It holds unless that blend-in is marked "Can be left early" (see "Blend in" on Control timeline). Use it in front of a change that should not cut a blend-in short. With "Give up" the flow just stops there instead of waiting.

- **Timeline**
- **Or blend**
- **Give up instead of waiting**

### Wait for time in timeline

Holds the flow until a timeline has played to a point.

Carries on at once if it is already past it, and a looping timeline that comes round counts as past. Nothing happens while the timeline is paused short of it.

- **Timeline**
- **Measured in**: Milliseconds, Percent of the timeline
- **At**

### Log

Writes to the browser console, which is handy while building.

- **Message**

### Call flow

Runs a named Flow with the values you give it, and carries on when it has finished.

Continues from Not found when no Flow on the page has that name. Outputs: Finished, Not found.

- **Flow**: The name of a Flow node
- **Values**: The inputs it takes, as { name: value, ... }

### Undo

Steps the variables marked Keeps history back to how they were before the last change.

Tick Keeps history on the variables that hold what a person makes (the tiles, the board, the answers). Changes close together count as one step. `canUndo` in a formula says whether there is anything to undo, for a button that greys out. Continues from Nothing to undo when there is none. Outputs: Undone, Nothing to undo.

### Redo

Puts back a change Undo took away.

Any new change after an Undo clears what could be redone. `canRedo` in a formula says whether there is any. Outputs: Redone, Nothing to redo.

## Logic

### Check a condition (If)

Continues down "true" or "false" depending on a condition.

Outputs: true, false.

- **Condition**

### Alternate between two paths (Toggle)

Alternates between "a" and "b" each time it runs.

Outputs: a, b.

### Random

Continues down one of its outputs, picked at random.

"Weights" gives each output its chance (a list, in output order: [1, 3] makes output 2 three times as likely). "Only if" is a list of conditions in the same order; an output whose condition is false cannot be picked. Nothing continues when none can. Outputs: 1, 2, 3, 4, 5, 6.

- **Weights**: One number per output, in order. 0 never gets picked (unless nothing else can be).
- **Only if**: One condition per output, in order, e.g. [score > 3, true]

### Only the first time (Once)

Lets the flow through the first time only.

### For each item

Runs the Each item steps once for every item of a list, in order, then Done.

The steps after Each item see `event.item` (the item), `event.index` (from 0) and `event.count`. Each run finishes, waits included, before the next starts, so a Set variable that adds up a total works. Up to 5000 items. Outputs: Each item, Done.

- **List**: A list variable, a data source, or a formula that gives a list. A number n counts 0 to n - 1

### Repeat

Runs the Again steps a number of times, or while something is true, then Done.

The steps after Again see `event.index` (from 0). Each run finishes before the next starts. With While, it stops as soon as that is false, checked before each run, and never more than 5000 times. Outputs: Again, Done.

- **Times**: How many times. Leave empty to use While alone
- **While (optional)**: Keep going only while this is true

### Do these in order (Sequence)

Runs "1", then "2", then "3" in order.

Outputs: 1, 2, 3.

## Related

Two actions have more detail elsewhere. **Play sound** (volume, speed, loop, **Stop other sounds first**, music that carries across pages) and **Stop sound** are described under [Sound](captions#sound). **Change a value or counter** (with **Over (ms)** and **Easing**) and **Put values back to the start** are described in [Variables](variables).
