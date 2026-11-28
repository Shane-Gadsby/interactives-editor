# action nodes, part 3 of 5

### action.recordStart — Start recording (action)
Starts recording from the learner's microphone or camera into a named recording. The page around the project asks the learner first (one plain consent screen made from Project > Microphone and camera), starts only after a real tap, and shows a recording bar with the level, a timer and a Stop button that the project cannot hide. It stops at the length limit. Continues from Recording when it has started, or from Could not start (not allowed, no device, the learner said no, or nowhere to ask: see `mediaMessage`). Recordings stay in memory and are gone when the page is left. With "Start or stop" one button does both: pressed while that name is recording it stops and continues from Recorded, and otherwise it starts.
Outputs: out, recorded, failed
- op (select: start|toggle, default "start"): Start or stop makes one button the record and stop button: it stops if this recording is going, and starts otherwise
- quiet (boolean, default true): Stop every sound, recording playback and spoken voice before the microphone opens, so the model answer does not leak into the recording
- slot (text, default "recording"): A name for this recording. A project can keep several, each under its own name (up to 8).
- source (select: microphone|camera-mic|camera, default "microphone")
- maxSeconds (number, default 0): Stop by itself after this long. 0 uses the limit in Project > Microphone and camera.

### action.listen — Listen live (action)
Turns live listening on or off, so the microphone can drive numbers you use anywhere. While it is on, the microphone drives numbers you can use anywhere: `micLevel` (how loud, 0 to 1) and `micBands` (a list of 8 numbers from low to high sound, 0 to 1 each, about 25 times a second), and `listening` is true. Nothing is recorded or kept, and only those numbers reach the project. The page around the project asks the learner first (the one consent screen, made from Project > Microphone and camera, which needs Live listening ticked), starts only after a real tap, and shows a Listening bar with a Stop button the project cannot hide. Continues from Listening when it has started (or stopped), or from Could not start (not allowed, no device, the learner said no, or nowhere to ask: see `mediaMessage`). Read the numbers in bindings and text, and give a way to play without the microphone.
Outputs: out, failed
- op (select: start|stop, default "start")
- stopOnLeave (boolean, default true): On by default, so the microphone is not left open behind another page. Untick it to listen across several pages (the learner can still press Stop on the Listening bar).

### action.recordStop — Stop recording (action)
Stops the recording and continues once it is ready to play. The learner can also press Stop on the recording bar, which fires On microphone or camera (A recording is ready) instead. Continues from Nothing to stop when that name was not recording and holds nothing.
Outputs: out, failed
- slot (text, default "recording"): A name for this recording. A project can keep several, each under its own name (up to 8).

### action.recordPlay — Play recording (action)
Plays a finished recording back. A sound recording plays through the project's own sound, so the viewer's sound button and volume apply. A video recording plays in the layer chosen below, from the page around the project. Continues from Nothing recorded when that name holds no recording yet, and from Stopped when a sound recording is stopped before it finishes (with Stopped wired, "When it finishes" only continues on a natural end).
Outputs: out, none, stopped
- op (select: play|stop, default "play")
- slot (text, default "recording"): A name for this recording. A project can keep several, each under its own name (up to 8).
- volume (number, default 1)
- target (node): For a video recording: the layer whose place the video plays in. Not needed for sound.
- continue (select: end|percent|start, default "end"): When the next node runs: when this finishes, part-way through, or straight away
- continueAt (number, default 50): How far through, 0 to 100

### action.recordDiscard — Discard recording (action)
Throws a recording away so the learner can record again. Stops it first if it is playing or still recording.
- slot (text, default "recording"): A name for this recording. A project can keep several, each under its own name (up to 8).

### action.recordDownload — Download recording (action)
Offers the learner a file of the recording to save on their device. The page around the project does it, after a tap. It is the only way a recording leaves memory.
- slot (text, default "recording"): A name for this recording. A project can keep several, each under its own name (up to 8).
- name (expr, default "\"my-recording\""): Without the extension, which comes from the recording. An expression, e.g. "answer-" + question

### action.cameraPreview — Camera preview (action)
Shows the learner's camera live in the place of a layer, or takes it down. The page around the project draws the picture, over the project, so the project never sees the camera's pixels (use Take or choose a photo for a still). Asks the learner first, like Start recording. Continues from Could not start when it is not allowed or there is no camera.
Outputs: out, failed
- op (select: on|off, default "on")
- target (node): The layer whose place the camera picture takes. It follows the layer if the layer moves.
- mirror (boolean, default true)
- facing (select: user|environment, default "user")

### action.photo — Take or choose a photo (action)
Gets a picture and puts it in an image asset, so every layer that uses the asset shows it. From the device's photo picker (choose a file, or take one with the camera, depending on the device), or a still of the live camera preview. The picture is scaled down so its longer side is at most the size below. Nothing is uploaded. Continues from No photo when the learner backs out or it is not allowed.
Outputs: out, none
- op (select: take|remove, default "take"): Throwing it away puts the asset's own picture back and forgets the photo.
- source (select: pick|pick-environment|pick-user|live, default "pick")
- asset (asset): An image asset in the project (any picture will do as the placeholder). Layers showing it change to the photo.
- assetExpr (expr, default ""): Optional, and it wins over the asset picked above. It gives an asset's id or name (a list item's photo field, for instance), so one node can fill a different asset for each item.
- maxEdge (number, default 1600)

### action.saveFile — Download a file (action)
Offers the learner a file to save: a report, a CSV, notes, or a picture or PDF of a layer. Built here and handed to the page around the project, which saves it after a tap. Works in any project, no microphone or camera needed. Text only, up to 2 MB (a web page with pictures in it, 16 MB). A picture or a PDF of a layer is the layer as it is on screen, with an optional footer, and is saved straight away. Characters a file name can't hold (a colon, a slash) are replaced.
- name (expr, default "\"report\""): Without the extension
- text (expr, default "\"Score: \" + score"): For a web page (.html), write [[image:id]] where a picture goes, with an asset's id or name (a photo the learner took, say), and it is replaced by the picture itself so the file carries its images. Use html(text) around anything the learner typed.
- mime (select: text/plain|text/csv|application/json|text/markdown|text/html|image/png|application/pdf, default "text/plain")
- layer (node): The layer to save as it is on screen now. Empty: the page. Layers ticked Not in downloads are left out
- page (select: layer|a4-landscape|a4-portrait, default "layer")
- footerLeft (expr, default ""): A line at the foot of the page, on the left. Empty: no footer
- footerRight (expr, default ""): The same line, on the right

### action.picture — Picture of a layer (action)
Makes a picture of a layer or the page as it is now, to download or keep in a variable. Kept, the picture goes in a text variable as a data address: bind an image layer's picture to it to show it, and save the variable as user data to keep it for the person (pictures up to about 1 MB). Layers ticked Not in downloads are left out. Continues from Failed when the picture could not be made.
Outputs: out, failed
- layer (node)
- do (select: download|keep, default "download")
- name (expr, default "\"picture\""): Without the extension
- variable (variable)
- scale (select: 1|2, default "2")

### action.copy — Copy to clipboard (action)
Puts text on the clipboard, for a Copy button beside a code, a link or a result. Put it on a click: browsers only let a page copy when the person has just pressed something. Continues from Copied, or from Not copied when the page around the project refuses (an old embed without clipboard access), so you can show the text to copy by hand instead.
Outputs: out, failed
- text (expr, default ""): What to copy, e.g. a variable, or "Your code is " + code

### action.openFile — Open a file (action)
Asks the person for a CSV, JSON or text file from their device and puts it in a variable. Put it on a click: the browser only opens its file chooser for one. A CSV or TSV becomes a list with a row per line, keyed by the first row; JSON becomes its value; anything else stays text. Up to 2 MB. Nothing is sent anywhere: the file is read in the page. Continues from Opened, or from Not opened when they cancel or the file is too big.
Outputs: out, none
- kind (select: any|csv|json|text, default "any")
- variable (variable): A list variable for a CSV, any variable for the rest
- nameVariable (variable): A text variable that gets the file's name

### action.fullscreen — Full screen (action)
Fills the whole screen with the project, or comes back out. Put it on a click: browsers only go full screen for one. The viewer can always leave with Escape. `fullscreen` in a formula is true while it is, for a button that says Enter or Leave. Continues from Not allowed when the page around the project does not let it go full screen.
Outputs: out, failed
- op (select: toggle|enter|exit, default "toggle")

### action.print — Print (action)
Opens the browser's print dialog for the page, where the person can also save it as a PDF. It prints what is on the page as it is now. For a file of one layer, use Download a file instead. Continues from Not allowed when the page around the project does not allow printing.
Outputs: out, failed

### action.sendData — Send to a web address (action)
Sends a value to a web address as JSON, and keeps the answer. For a form that goes to your own service, a webhook or an API. It keeps to the hosts the project may load data from (Project settings, Allowed data hosts), never sends the viewer's cookies or logins, and gives up after 15 seconds. Continues from Sent when the address answers with success, and from Failed otherwise; the answer goes in the variable either way, and `event.status` holds the HTTP status.
Outputs: out, failed
- url (expr, default "\"https://\""): An https address, e.g. "https://example.com/api/answers"
- method (select: POST|PUT|PATCH|DELETE, default "POST")
- body (expr, default "{ answer: answer }"): Sent as JSON: a variable, a list, or { name: value, ... }
- variable (variable): What the address sends back

### action.sensorsOff — Offer: do not use my microphone or camera (action)
Asks the learner whether to stop using their microphone and camera from now on. It asks in a screen of the page around the project. If they say yes it is remembered in their browser, every activity then shows its plain version (`microphone` and `camera` read off), and the project cannot undo it. Only the learner decides. Put it on a button such as "Use the keyboard instead".

### action.script — Run script (action)
Runs a custom JavaScript script. `event` holds what triggered it.
- script (script)

### action.code — Run code (action)
Runs an inline JavaScript snippet with ix, event and variables in scope.
- code (text, default "ix.log(\"hello\")")

### action.emit — Send message (action)
Sends a named message to scripts, On message nodes and the host page.
- name (text)
- payload (expr, default "")

### action.steps — Go to step (action)
Moves a step-through artboard to another step. Turn on Steps in the artboard settings first. Next and Back play the animation to the neighbouring step; going to a step further away shows it straight away. Does nothing on an artboard without steps, or past the first or last step.
- op (select: next|back|first|last|goto, default "next")
- step (expr, default "1"): From 1. In a dot of the step bar: event.index + 1

### action.captions — Captions and sound (action)
Changes the viewer's choices for captions, descriptions, the transcript and sound. It can turn captions or descriptions of what is on screen on or off, make them larger or smaller, open the transcript, and mute or unmute: whatever the viewer has chosen. For your own buttons when the built-in ones are hidden in Project settings. The choices are remembered in the viewer's browser.
- op (select: captionsToggle|captionsOn|captionsOff|descriptionsToggle|descriptionsOn|descriptionsOff|larger|smaller|transcriptToggle|transcriptShow|transcriptHide|soundToggle|soundOn|soundOff|start, default "captionsToggle")

### action.toast — Show toast (action)
Shows a toast: a short message over a corner of the page that goes by itself. Make the toast first with the Toast button in the Web tools. It is read out to screen readers as it appears, so it needs no Announce node beside it. Showing one that is already up gives it the new words and its full time again; different toasts stack.
- toast (artboard): The toast page to show
- text (expr, default ""): The words it says this time, as an expression, e.g. "Saved " + name. Empty leaves the words the toast already has
