# action nodes, part 2 of 5

### action.sketchRedo — Redo a stroke (action)
Puts back what Undo a stroke last took away on a sketch pad.
Outputs: out, none
- layer (node): A rectangle with Sketch pad ticked

### action.sketchClear — Clear a sketch pad (action)
Rubs out everything drawn on a sketch pad, which Undo a stroke can bring back.
Outputs: out
- layer (node): A rectangle with Sketch pad ticked

### action.tableAdd — Add a row to a shared table (action)
Adds a row to a shared table everyone sees: a name on a sign-up sheet, a card on a board. Only the fields the table has are kept. The server checks who may add and the limits (rows per person, per slot, the table's size); a refusal goes on from Not done with `event.problem` (not-allowed, per-person, slot-full, full, busy). The table's value is the new table either way.
Outputs: out, refused
- source (data): A data source set to Shared table
- values (expr, default "{ name: context.firstName }"): The row: { field: value, ... }

### action.tableChange — Change a row of a shared table (action)
Changes some fields of one row of a shared table, if the table's rules let this person. Row is the row itself (`item` in a repeater of the table's rows) or its id. A refusal goes on from Not done with `event.problem`.
Outputs: out, refused
- source (data)
- row (expr, default "item"): The row, or its id
- values (expr, default "{ }"): The fields to change: { field: value, ... }

### action.tableRemove — Take a row out of a shared table (action)
Takes one row out of a shared table, if the table's rules let this person. Row is the row itself (`item` in a repeater of the table's rows) or its id. A refusal goes on from Not done with `event.problem`.
Outputs: out, refused
- source (data)
- row (expr, default "item"): The row, or its id

### action.saveSetup — Save setup (action)
Keeps the values of the variables marked Part of the setup for everyone who opens this setup. For an app set up where it sits: the tiles, the cards or a picture the people who look after it chose. Only the project's owner, its collaborators, power users and staff can save; anyone else goes on from Not saved, with `event.problem`. Everyone who opens the setup afterwards starts with these values. Put it on a Save button on the app's editing page, shown when `context.canEdit`.
Outputs: out, failed

### action.respond — Send a response (action)
Files what a person did as one row of your Responses table: answers, choices, where cards went. Values is an object of named values (`{ q1: answer1, mood: mood }`) or a list, such as a card sort's placements (`cards.map(c => ({ card: c.name, group: c.group }))`). Each response is kept under the person, the time and the course, with their name only when Project settings > Responses says With names (otherwise a code that is the same for them every time). See them in the Responses tab of Results, and download them as CSV (a row per response, or a row per item of a list in it) or JSON. Needs the project shared to StudyDesk; in Preview and a downloaded file they are kept in the browser. Continues from Sent, or Not sent when there is nowhere to send it or it was refused.
Outputs: out, none
- set (text, default "responses"): A name for this kind of response, so one app can collect two kinds and download them apart
- values (expr, default "{ answer: answer }"): What to keep: { name: value, ... }, or a list of records

### action.sharedAdd — Add to shared responses (action)
Adds an answer to a Shared responses data source, such as a word for a class cloud. Adds a short answer (or a list of them) to a Shared responses data source: what a person types for a word cloud, a poll, a shared list. The data source says who sees the answers (only the person, or everyone in their class on the StudyDesk learner page), how long an answer may be, how many one person may add and which words are blocked. Answers are counted and anonymous: the data source holds the counts, never names. Continues from Added when something was kept, and from Not added when nothing was (blocked, already there, over the limit, or nowhere to keep it).
Outputs: out, none
- source (data): A data source set to Shared responses
- text (expr, default ""): The answer to add: text, or a list of texts. Capitals and spacing are ignored when answers are counted.

### action.sharedWithdraw — Take back shared responses (action)
Takes this person's own answers back out of a Shared responses data source. Takes this person's own answers out of a Shared responses data source: the one named, or all of theirs when the answer is empty. It never touches anyone else's. Continues when done.
- source (data): A data source set to Shared responses
- text (expr, default ""): The answer to take back, or a list of them. Leave empty to take back everything this person added.

### action.roomSend — Send to room (action)
Sends a message to a Room data source, for a chat or a question wall everyone in the class sees. Sends a message to a Room data source. Everyone in the same StudyDesk course who has the project open sees it at once, shown under a made-up seat name (or a first name, if the data source says so). Blocked words and empty messages are not sent and take the Not sent path. The messages, and how many people are here, are in the data source itself (for example a repeater over its messages). In Preview the room is your own pretend one, and outside StudyDesk there is nobody to send to.
Outputs: out, none
- source (data): A data source set to Room
- text (expr, default ""): The message to send: text, such as what a person typed into an input.

### action.courseAdd — Add to course collection (action)
Adds a stamp, or raises a counter, in a named collection that every interactive in the same course shares. A course collection is a passport or badge case with a name you choose. Every project that uses the same name, in the same StudyDesk course, adds to and reads the same collection for each learner. A stamp is a short text kept once (capitals do not matter). A counter keeps the larger number, never the latest, so two pieces counting the same thing cannot take each other back. On the StudyDesk learner page (Share > Link for StudyDesk) it is kept on the server under the signed-in person and their course. Anywhere else (Preview, an export, a link opened outside StudyDesk) there is no course, so it is kept in that browser only. Continues from Added when something was new, and from Nothing new when it was already there, was empty, or there was nowhere to keep it.
Outputs: out, none
- collection (text): The collection name. Use the same name in every project that should share it
- what (select: stamp|counter, default "stamp")
- name (expr, default ""): The stamp, or the counter, as plain words. Use a formula (a quoted text, a variable, a list of texts for several stamps) to work it out
- value (expr, default 1): The number the counter should reach. It only ever goes up, so a smaller number changes nothing

### action.courseLoad — Load course collection (action)
Fetches a named course collection into a list variable of its stamps and a number variable of how many. Asks for the collection as it stands now: what other interactives in the course added too. Both variables are optional. Check course collection can then ask about one stamp or counter without asking again. In Preview and anywhere there is no course it reads this browser's copy. Continues from Loaded when the collection has anything in it, and from Empty when it has nothing or there is nowhere to keep it.
Outputs: out, none
- collection (text): The collection name
- stamps (variable): A list variable to fill with the stamps (optional)
- count (variable): A number variable to fill with how many stamps there are (optional)

### action.courseCheck — Check course collection (action)
Branches on whether a course collection has a stamp, or a counter that has reached a number. Look for a stamp, a counter, or both (both must be true). With neither it asks whether the collection has anything. It reads what the last Load or Add fetched, and fetches the collection first if this project has not yet. A counter can also write its number into a variable. Continues from Has it or Not yet.
Outputs: out, none
- collection (text): The collection name
- stamp (expr, default ""): A stamp to look for (optional)
- counter (expr, default ""): A counter to look at (optional)
- atLeast (expr, default 1): The counter must have reached this number
- variable (variable): A number variable that gets the counter's number (optional)

### action.clock — Countdown / clock (action)
Runs a countdown (seconds left) or a clock (seconds gone) and writes it to a variable. It writes the variable about four times a second while it runs. Start begins it from the top, Pause holds it, Resume carries on, Reset puts the variable back and stops it. Time up continues when a countdown reaches 0 (or a clock reaches its limit). It holds still when the learner leaves the artboard, and a new Start or Resume takes it up again. One clock per variable.
Outputs: out, done
- variable (variable): A number variable the clock writes
- op (select: start|pause|resume|reset, default "start")
- mode (select: down|up, default "down")
- seconds (expr, default "60"): Counting down: where it starts. Counting up: where it stops (0 never stops)
- whole (boolean, default true): Write 12 rather than 11.75. A countdown shows the second it is in (it reads 1 until it is done), a clock the seconds completed

### action.sound — Play sound (action)
Plays an audio asset, once or on a loop, at a chosen volume and speed. The sound can be picked here or worked out by an expression (a list item's sound, say). Tick Soundtrack for music that should carry on through page changes. Continues from the bottom port, and from Stopped if a Stop sound node (or Stop other sounds first) ends it before it finishes. With Stopped wired, "When it finishes" only continues on a natural end. `soundPlaying()` and `soundsPlaying` say what is playing, for a button that toggles Play and Stop.
Outputs: out, stopped
- asset (asset)
- source (expr, default ""): Optional, and it wins over the sound picked above. It gives a sound's id or name from Assets (a list item's sound field, for instance), or the address of a sound file. Nothing plays if it comes out empty.
- volume (expr, default "1"): A number from 0 (silent) to 1 (full), or an expression such as a variable
- speed (expr, default "1"): 1 is as recorded, 0.5 is half speed, 2 is double. From 0.25 to 4. A number or an expression such as a variable.
- keepPitch (boolean, default true): On, a slowed sound stays at its own pitch (where the browser allows it); off, slower is lower and faster is higher
- loop (expr, default "false"): true to play round and round until a Stop sound node, or until the page changes (unless it is the soundtrack, which carries on). Or an expression, such as a variable. A looping sound never finishes, so the next node runs straight away.
- soundtrack (boolean, default false): On, this is the project's music: it carries on when the page changes, goes quiet while a narration, a description or Speak is heard over it, and ends at a Stop sound node or when the project is closed or started over. Starting the same soundtrack again just carries on (no second copy), and a different one is crossfaded to. Tick Loop as well for music that goes round.
- solo (boolean, default false): Stop every other sound played by Play sound before this one starts (for comparing two clips, so only one is heard at a time)
- continue (select: end|percent|start, default "end"): When the next node runs: when this finishes, part-way through, or straight away
- continueAt (number, default 50): How far through, 0 to 100

### action.video — Control video (action)
Plays, pauses, seeks, changes the speed of or steps a frame through a video layer. Frame steps pause the video first. Slow playback keeps the pitch. Does nothing if the layer is not a video that is on the page.
- target (node)
- op (select: play|pause|toggle|seek|skip|frameForward|frameBack|setRate|faster|slower, default "toggle")
- seconds (expr, default "0"): An expression: 12, or -5 to skip back five seconds, or tags[0]
- rate (expr, default "1"): 1 is normal, 0.5 is half speed, 2 is double. Between 0.0625 and 16

### action.stopSound — Stop sound (action)
Stops sounds that Play sound started: all of them, or just one. The way to end a looping sound. It ends the soundtrack too, with a fade out. Timeline audio is not affected.
- asset (asset): Leave empty to stop every sound Play sound has going
- source (expr, default ""): Optional, and it wins over the sound picked above. The same kind of answer Play sound takes.
