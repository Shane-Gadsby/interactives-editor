# action nodes, part 4 of 5

### action.celebrate — Celebrate (action)
Throws a short burst of confetti or stars over the page, with words if you like. It never takes a click or the focus, so the next button works straight away, and it clears itself in under two seconds. A viewer whose device asks for less motion sees a still badge with the same words instead. The words are read out politely to screen readers. Pick a sound to play with it.
- look (select: confetti|stars, default "confetti")
- text (expr, default ""): Shown on a badge in the middle and read out. Empty: no badge
- asset (asset): Optional. Played with it
- colours (select: party|theme, default "party")
- wait (boolean, default false): Off, the next node runs straight away

### action.storyStart — Start the story (action)
Starts the story from the top (a New game button), or from a scene or chapter you name. Goes to the story's stage page if it isn't showing. Everything the story kept (its own values, who's on stage, the choices taken) starts again; project variables are left alone, so reset them first if a new game should clear them too.
- from (text): A scene title or chapter name. Empty: the first chapter

### action.storyGoOn — Go on (action)
Finishes the line that's typing, or goes on to the next one, and cuts a [wait] short. The story stage already goes on with a click anywhere, Space or Enter. A page with a Go on node of its own (on its dialogue box, say) keeps clicks to itself, so a click on a picture doesn't move the story on.

### action.storyPick — Pick choice (action)
Picks one of the story's choices on show, counting from 1. Wired to a click on the copy of a list of story.choices, the default picks the copy that was clicked. The keys 1 to 9 pick choices too. A greyed-out choice can't be picked.
Outputs: out, none
- choice (expr, default "event.index + 1"): Which choice, from 1. The default is the clicked copy of a list

### action.storyBack — Back to the story (action)
From a page a [call ...] line went to: back to the story stage, carrying on after that line. The result is in story.result, so a line after the call can say "if story.result == 'solved'". From any other page it goes nowhere and runs Not called.
Outputs: out, none
- result (expr): What the page hands back (story.result)

### action.storyMode — Auto or Skip (action)
Turns Auto (lines go on by themselves) or Skip (read lines fly past) on, off, or the other way. Auto waits for a line's voice to finish. Skip only goes through lines read before (on this device), and stops at a choice and at the first new line, unless Skip unread is on in the reader's settings.
- mode (select: auto|skip|both, default "auto")
- to (select: toggle|on|off, default "toggle")

### action.storyRollBack — Go back a line (action)
Takes the story back to an earlier line, undoing what happened since (values, choices, who was on stage). Wired to a click on a copy of a list of story.history, Lines back picks that line. The history holds the last 200 lines.
Outputs: out, none
- steps (expr, default "1"): How many lines back. In a list of story.history: story.history.length - event.index

### action.storySave — Save the story (action)
Saves where the story is, and every variable, in a slot on this device, or deletes a slot. Slots are 1, 2, 3 and so on (a list of story.saves shows them, with the chapter, the scene, the last words and when), plus quick. The story saves itself in auto at every choice. Saves stay in this browser, like a game's saves on a console.
Outputs: out, none
- slot (expr, default "'quick'"): A number, 'quick' or 'auto'. In a list of story.saves: event.index + 1
- do (select: save|delete, default "save")

### action.storyLoad — Load the story (action)
Puts the story back where a save left it, with the variables as they were, and shows the stage. Slot latest is the newest save of all, which is what a Continue button wants (story.canContinue says whether there is one). A line deleted since the save carries on from the nearest line before it that's still there.
Outputs: out, none
- slot (expr, default "'latest'"): A number, 'quick', 'auto' or 'latest'. In a list of story.saves: event.index + 1

### action.storyPref — Story setting (action)
Changes one of the reader's settings for the story, kept on their device. Text speed (letters a second; empty for the story's own), Auto speed (2 is twice as quick), Skip unread lines, Music, Voice and Effects volumes (0 to 1), Text size (1 as designed) and Readable font. Captions for sounds and Show song titles are on or off too. Read them back as story.prefs, for sliders and toggles on a settings page.
- pref (select: textSpeed|autoSpeed|skipUnread|music|voice|effects|textSize|readable|captions|songTitles, default "textSpeed")
- value (expr, default "event.value"): The new value. From a slider or a toggle: event.value

### action.storyGoTo — Go to a scene (action)
Carries the story on from a scene or chapter you name, and shows the stage. For a map: a place's button goes to its scene. Unlike Start the story nothing is forgotten (values, coins, things carried stay), and a page the story called is left behind. {values} work, so a list of story.places can say {story.places[event.index]}.
Outputs: out, none
- where (text): A scene title (a # line) or a chapter name. {values} work

### action.puzzleAnswer — Puzzle answer (action)
Says the puzzle on this page was answered right or wrong, for the big moment and the score. Right marks it solved for what it's worth now (puzzle.value) and shows puzzle.right; wrong takes a little off and shows puzzle.wrong. Try again clears the wrong mark. A question on a puzzle page does this by itself when it's checked, so this is for a puzzle made of anything else: drag and drop, a dial, a code lock.
Outputs: out, none
- answer (select: right|wrong|again, default "right")

### action.puzzleHint — Open a hint (action)
Opens one of the puzzle's hints (paying hint coins the first time) and shows it, or puts it away. Hints open in order, then the big hint. One already open shows again for free. puzzle.hintText is the hint showing, puzzle.coins what the reader has left. Wired to a click on a copy of a list of puzzle.hints, the default opens that one.
Outputs: out, short, none
- do (select: open|close, default "open")
- hint (expr, default "event.index + 1"): Which hint, from 1 (the big hint comes after the others), or 'next' for the next to open

### action.puzzleMemo — Puzzle memo (action)
Shows or hides the memo, a sketch pad over the puzzle for working things out. puzzle.memo says whether it is showing: bind the memo layer's Visible to it.
- to (select: toggle|on|off, default "toggle")

### action.puzzleLeave — Leave the puzzle (action)
Back to the story from a puzzle, or to the page before when it was played from the index. Skip it marks an unsolved puzzle skipped. story.result is 'solved', 'skipped' or empty, so the script can say if story.result == 'solved'. A skipped puzzle stays in the index to come back to.
Outputs: out, none
- skip (boolean, default false): Mark it skipped if it is not solved yet

### action.puzzleCoins — Hint coins (action)
Gives the reader hint coins, or takes some away. story.coins (and puzzle.coins) is how many they have. A save keeps them, and a new game starts again from the number in the Story settings.
- do (select: give|take, default "give")
- amount (expr, default "1")

### action.toastHide — Hide toast (action)
Puts a toast away before its time is up, or one that stays until dismissed. A Close button inside a toast is a click wired to this. With no toast chosen it puts every toast away.
- toast (artboard): The toast to put away. None chosen puts them all away

### action.announce — Announce (action)
Says something to screen readers through a live region. For example "Correct, 3 of 5". Nothing visible changes. Does nothing when accessibility is off in the preferences.
- text (expr, default "\"Correct\""): An expression, e.g. "Correct, " + score + " of 5"
- politeness (select: polite|assertive, default "polite")

### action.speak — Read aloud (action)
Says something aloud with a voice installed on the learner's own device. It can say a text expression, a question with its options, or the feedback after a check. Nothing is recorded or sent anywhere, and with no local voice for the language nothing is said (bind to voiceAvailable to hide what depends on it). It never starts by itself, so put it behind a click or key: iOS only lets the first words start from a tap. The learner's speed choice (0.75 to 1.5, remembered) applies on top of Speed here. A layer's "Say it like" text is what the voice says for that layer. Also: stop, pause, resume, slower, faster, repeat.
- op (select: text|question|feedback|auto|page|stop|pause|resume|toggle|repeat|slower|faster, default "text")
- text (expr, default "\"Hello\""): An expression, e.g. "Question " + (index + 1) + ". " + questions[index].prompt
- question (node): The question frame (made with Add question)
- lang (text): Only a voice on the device for this language is used. Words in another language read with the wrong sounds, so none is used then
- rate (number, default 1): A multiplier for this reading, 1 is normal. The learner's own speed choice is applied on top
- wait (boolean, default false): Hold the next node until the words have been said (or stopped, or there is no voice)
- fallback (select: none|announce, default "none"): When no voice on the device can read this language (or Only speak when is false), send the words to the live region instead, so a screen reader user does not miss the feedback
- only (expr, default ""): Optional. A condition such as a "spoken prompts" variable. While it is false the voice stays quiet (and Announce is used if chosen above). Empty: always.

### action.questionCheck — Check answer (action)
Checks the answer on a question and updates its answered, correct, attempts, score and feedback variables. A question is made with Add question. This locks it when it is right or out of tries, and tells screen readers the feedback. Continues from "right" or "wrong", then also from "finished" once the question is locked. For a question bank that is gone through once, "set done" also continues when that was the last question of the run.
Outputs: correct, wrong, finished, setDone
- question (node): The question frame

### action.questionReset — Reset question (action)
Puts a question back to the start: no answer, no hints, all tries back. Options are reshuffled when the question shuffles. With a question bank it moves on to the next row. Run it on start to set the question up. A bank that is gone through once ("When the rows run out: finish") continues from "set done" instead of "out" when there is no next row, and can start a new run or a review of the ones missed.
Outputs: out, done
- question (node): The question frame
- next (boolean, default true): With a question bank: draw the next row. Off keeps the row showing and only clears the answer.
- keepAnswer (boolean, default false): Do nothing when the question has already started this visit, so the answer is still there when the learner comes back to the page. The start of a question set to keep its answer uses this; a Try again button must have it off.
- run (select: next|again|missed, default "next"): For a bank that is gone through once: carry on, draw a new run from the rows, or run only the questions the last run got wrong.
- retake (boolean, default false): For questions that have Retakes (a test marked on the server): start the next go at the whole set, once every question is finished and a go is left. Without it a finished question only comes back showing how it finished.

### action.questionHint — Show hint (action)
Shows the next hint of a question and tells screen readers. Does nothing when there are none left or the question is finished.
- question (node): The question frame

### action.questionChoose — Choose option (action)
Selects an option of a choice question. It swaps the choice for a single answer and toggles it for several. Normally run from a click on the option layer, where event.index is which option was clicked.
- question (node): The question frame
- option (expr, default "event.index"): Which option, counting from 0 in the order shown

### action.questionMove — Move item (action)
Moves an item of an ordering question one place up or down. It tells screen readers where the item went.
- question (node): The question frame
- item (expr, default "event.index"): Which item, counting from 0 in the order shown
- direction (select: up|down, default "up")

### action.questionDrop — Item dropped in a group (action)
Says whether the item just dropped is in the group it belongs to, for a categorise question. Sets the question's feedback and tells screen readers. It does not check the answer or use a try.
Outputs: correct, wrong
- question (node): The question frame

### action.focus — Focus layer (action)
Gives a layer keyboard focus, or takes focus away from whatever has it. Only tab stops can take focus: layers with an On focus event or a click (with accessibility on), buttons, inputs and links.
- op (select: focus|clear, default "focus")
- target (node)

### action.dragPlace — Put layer in drop zone (action)
Moves a draggable layer into a drop zone as if it had been dropped there. It settles by the zone's snap setting, or goes to the zone's centre. Does nothing if the zone would not take it. Fires no drag events, so it cannot start a loop; it does update the zone variables. Leave the layer empty to send every draggable layer, or pick a container to send everything inside it; a tag keeps only the layers that carry it. They go in one after another until the zone is full.
- layer (node): A draggable layer, or a container to send everything inside it
- zone (node)
- tag (text): When sending several, only layers with this tag
