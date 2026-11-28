# action nodes, part 1 of 5

### action.timeline — Control timeline (action)
Plays, pauses, stops, restarts, reverses or jumps a timeline. "Blend in" fades its pose in over the pose the layers have now, instead of cutting to it (for switching between looks).
- timeline (timeline)
- op (select: play|restart|pause|stop|reverse|toggle|seek, default "play")
- time (expr, default "0")
- fade (expr, default "0")
- fadeEase (easing, default "linear"): Shapes the blend-in: how fast the new look takes over. Linear is an even cross-fade.
- outgoing (expr, default ""): The timelines and blends this replaces, by name: "Idle" or ["Idle", "Walk"]. They keep running while the new look blends in over them, then stop. With no blend-in time they stop straight away.
- hold (boolean, default false): The timelines and blends being replaced stop where they are instead of running on while the new look blends in
- earlyExit (boolean, default false): Another change (a Wait for blend-in node) may cut in before this blend-in is done
- continue (select: end|percent|start, default "end"): When the next node runs: when this finishes, part-way through, or straight away
- continueAt (number, default 50): How far through, 0 to 100

### action.blendPlay — Play blend (action)
Starts a blend: its timelines play together, mixed by the weights of its number variables. It plays until it is stopped. Does nothing if it is already playing. "Blend in" fades its pose in over the pose the layers have now.
- blend (blend)
- fade (expr, default "0")
- fadeEase (easing, default "linear"): Shapes the blend-in: how fast the new look takes over. Linear is an even cross-fade.
- outgoing (expr, default ""): The timelines and blends this replaces, by name: "Idle" or ["Idle", "Walk"]. They keep running while the new look blends in over them, then stop. With no blend-in time they stop straight away.
- hold (boolean, default false): The timelines and blends being replaced stop where they are instead of running on while the new look blends in
- earlyExit (boolean, default false): Another change (a Wait for blend-in node) may cut in before this blend-in is done

### action.blendStop — Stop blend (action)
Stops a blend. The mixed pose stays where it is, except for additive blends, which take their change back out.
- blend (blend)

### action.setVariable — Set variable (action)
Sets, adds to, toggles, steps through a range, resets or changes the list of a variable. Change list items where a field is a value changes every item that matches in one step. A live variable (worked out from its formula) cannot be set. Next and Previous move a number on by one between First and Last, and go round to the other end (or stop) past either: for slides, cards and tabs.
- variable (variable)
- op (select: set|add|toggle|push|remove|clear|reset|toggleItem|removeValue|setItem|changeWhere|next|previous, default "set")
- first (expr, default "0"): The lowest number it goes to: 0 or 1 for a list of slides, cards or tabs.
- last (expr, default ""): The highest number it goes to. For a list that counts from 1 that is its length (slides.length); counting from 0 it is slides.length - 1. Empty means no top end.
- ends (select: round|stop, default "round"): Past the last number: go round to the first (and the other way), or stay where it is.
- index (expr, default ""): Which item to change (0 is the first). Left empty it is event.index, the item the event came from (a repeater copy that was clicked, a drag that landed on one).
- whereField (text, default ""): The field to look at in each item, like state. Dots reach inside (owner.name). Empty looks at the item itself (for a list of words or numbers). With this and the next box both empty, every item changes.
- whereValue (expr, default ""): The value it has to be, like "up" (words go in quotes) or 3. Every item that matches is changed.
- field (text, default ""): Optional. Change only this field of the item and keep the rest (for items that are objects). Empty replaces the whole item.
- value (expr, default "0"): Expression, e.g. 1, "hi", score * 2. For a list: the item to append ({name: "Ann"}), the position to remove (0 is the first), the value to add or take out, or what to put in the item or items (item and index are available: item.count + 1).
- over (expr, default "0"): For a number: ease to the new value over this long instead of jumping. 0 is at once. A newer change to the same variable takes over from wherever it has got to. Anything that reads the variable (a blend, a binding) follows it as it moves. Skipped when the viewer asks for less motion.
- overEase (easing, default "easeInOut"): How the number eases while it moves
- continue (select: start|percent|end, default "start"): When the next node runs: straight away, part-way through the ease, or when the number has arrived
- continueAt (number, default 50): How far through, 0 to 100
- say (text, default ""): Optional. Words a screen reader says, politely, once the change is made. Put a value in curly brackets to say it: Slide {slide} of {slides.length}. Left empty, nothing is said. Does nothing when accessibility is off in the preferences.

### action.resetVariables — Reset variables (action)
Puts the chosen variables back to their starting values. That is the typed value, the value for this course, or their formula worked out again. Live variables are left alone. Unlike Start over, nothing else changes.
- variables (variables): The variables to put back

### action.setProperty — Set property (action)
Changes a layer property instantly.
- target (node)
- prop (prop, default "opacity")
- value (expr, default "1")

### action.animate — Animate property (action)
Animates a layer property to a value (a tween).
- target (node)
- prop (prop, default "x")
- to (expr, default "0")
- relative (boolean, default false)
- duration (number, default 400)
- ease (easing, default "easeInOut")
- continue (select: end|percent|start, default "end"): When the next node runs: when this finishes, part-way through, or straight away
- continueAt (number, default 50): How far through, 0 to 100

### action.moveView — Move view (action)
Pans and zooms the page to frame a layer, or back out to the whole page. Everything on the page moves together, so clicks and drags still land on the right layer. The page master's layers (a logo, a footer, a score bar) stay where they are. The layer is framed as large as fits, with the space around it you set, never zoomed in past the limit. Choose the whole page to come back. Changing page starts the new page on its whole view, and a learner who asked for less motion gets there at once. Use it for a map the learner travels across, or to read a comic panel by panel. An embedded page keeps a view of its own.
- to (select: layer|page, default "layer")
- target (node): The layer to frame
- padding (number, default 40): Page pixels left clear around the layer
- maxZoom (number, default 4): Stops a small layer filling the page. 0 means no limit
- duration (number, default 600): 0 moves at once
- ease (easing, default "easeInOut")
- continue (select: end|percent|start, default "end"): When the next node runs: when this finishes, part-way through, or straight away
- continueAt (number, default 50): How far through, 0 to 100

### action.visibility — Show / hide (action)
Shows, hides or toggles a layer.
- target (node)
- op (select: show|hide|toggle, default "toggle")

### action.artboard — Go to artboard (action)
Switches to another artboard: one you pick, the next or previous page, or one an expression names. It can also go back to the one the learner came from. Next and previous follow the artboards in the project's order, inside the artboard's group when it is in one, leaving out the narrow and wide versions of a responsive set and a library component's own copy. pageNumber and pageCount say where the artboard is. Back follows the learner's own path, and Previous follows the project's order. Continues from No artboard when there is nowhere to go (the last page, nothing to go back to, a name that matches nothing). To move through the steps of one artboard use Go to step.
Outputs: out, none
- to (select: picked|next|previous|back|expression, default "picked")
- artboard (artboard)
- expr (expr, default ""): The artboard's name or id. Nothing matching continues from No artboard
- transition (select: none|fade|slideLeft|slideRight|slideUp|wipeLeft|wipeRight|wipeUp|wipeDown|iris|zoom|pushLeft|pushRight|pushUp|pushDown|wipeDiagonal|barnDoors|star|diamond|heart|clock|blinds|grid|crosshatch|dots|dissolve|cube, default "fade"): Wipe and push have a direction. Iris opens a circle and Zoom goes into the page, both from the place below. Reduced motion makes every one instant
- from (select: clicked|centre|point, default "clicked"): Where the circle opens or the zoom goes. With nothing clicked (a timer, a message) it uses the middle
- x (number, default 50)
- y (number, default 50)
- duration (number, default 300): How long the change takes, in milliseconds. Fast is 150, Medium is 300, Slow is 600; any other number is Custom

### action.url — Open URL (action)
Opens a link in a new tab, this frame, the parent frame or the whole page.
- url (expr, default "\"https://example.com\"")
- target (select: _blank|_self|_parent|_top, default "_blank")

### action.reportResult — Report result (action)
Sends the learner's result (score, pass or fail, completion) to where the page keeps it. Played from a share link in StudyDesk, that is the learner's record on the server. The score comes from the score variable in Project > Results and progress. Nothing is lost or broken if no record is kept.
- completed (select: complete|progress, default "complete")
- score (expr, default ""): Leave empty to report the score variable. Or an expression, e.g. correct * 10.

### action.record — Record (action)
Records that something happened, for Insights. It counts how often each name was recorded, and each value it carried. Counts only, nobody is named, so do not put anything personal in the name or value. Learners' browsers send it to the page around the project (the StudyDesk learner page, which passes it to the analytics); nothing is sent from an export on its own, or when recording is off in Project > Learner records.
- name (text, default "milestone"): What happened, in a few words ("opened hint", "chose route B"). Up to 60 characters.
- value (expr, default ""): Something short to count separately: a choice, a level, a score band. Leave empty for just the name.

### action.analytics — Send analytics (action)
Sends a named event, with a few values, to the analytics the Toolbox keeps. With nothing joined to Saved or Not saved it joins the queue every Toolbox app reports through, which is sent every few seconds, and the flow carries straight on. Join Saved (or Not saved) and it is sent at once and waited for instead: Saved runs once the row is kept, with event.ids (and event.id, the first) to hold on to, and Not saved runs with event.reason when there is no page to keep it, nobody is signed in, it is a preview, the project records nothing or this visit has sent too many. The bottom port continues straight away either way. Data is a formula that gives a few named values, such as {level: level, time: seconds}; a single value is kept as "value". Learners' browsers send it to the page around the project (the StudyDesk learner page), so an export on its own sends nothing. Do not put anything personal in the name or the data.
Outputs: out, saved, failed
- name (text, default "event"): What happened, in a few words ("finished level", "chose a pathway"). Up to 60 characters. {braces} are filled in.
- data (expr, default ""): A few named values to keep with it: text, numbers, yes or no, or short lists of those. Up to 20 names.

### action.credits — Open credits (action)
Opens the list of credits and references, as the Credits button does. Put it on a small button or link of your own and the automatic Credits button is left off that page. The list is the one in Project > Credits; with nothing in it the learner sees that no credits have been added yet. Focus goes into the list, and back to your button when it closes.

### action.startOver — Start over (action)
Begins again: variables reset, progress is cleared and the start artboard shows. It counts as a new attempt, and remembered progress is cleared. Nothing after this node runs.

### action.cursor — Set cursor (action)
Changes the mouse cursor over a layer, or over the whole player. With no layer chosen it changes the whole player.
- target (node)
- cursor (cursor, default "pointer")

### action.saveUserData — Save user data (action)
Saves the chosen variables for the person playing, so Load user data can restore them later. On the StudyDesk learner page (Share > Link for StudyDesk) they are kept on the server under the signed-in person and the course; anywhere else (an export, Preview, no sign-in) in the browser. Each save only changes the variables chosen here. Continues when saved.
- variables (variables): The variables to save

### action.loadUserData — Load user data (action)
Restores the variables that Save user data last saved for the person playing. Only the chosen variables are set, from the same places Save user data keeps them. A variable that was never saved keeps its value. Continues from Loaded when anything came back, and from Nothing saved when nothing did (a first visit, or nowhere to load from).
Outputs: out, none
- variables (variables): The variables to load

### action.loadData — Load data (action)
Reloads a data source, optionally from a different URL. Continues when loaded.
- source (data)
- url (expr, default ""): Leave empty to reload from its own file/URL, e.g. "https://api.example.com/items?page=" + page

### action.sketchUndo — Undo a stroke (action)
Takes back the last stroke or clear on a sketch pad.
Outputs: out, none
- layer (node): A rectangle with Sketch pad ticked
