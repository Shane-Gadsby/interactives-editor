# Microphone, camera and photos
Record a voice, show the camera, take or choose a photo: declare it in Project settings, build the plain version, and know what learners are asked and what the page needs.

A project can listen through the learner's **microphone**, show their **camera**, or take or choose a **photo**. It never touches a device itself. The page it plays in does, behind one plain consent screen and a recording bar the project cannot hide, and tells the project only what it needs.

## Turn it on
In the Project section (click an empty part of the canvas) open **Microphone and camera** and tick what the project uses. Nothing undeclared works. Add one sentence for **What it is used for** ("record your answer to the speaking question"), and a **Longest recording** if the default (120 seconds of sound, 60 of video) is too long. The box under it shows exactly what learners are asked, made from your choices.

**Update to the latest version** in [Share link](export#share-link) after changing these: the page reads what you declared when the link was last updated, not what the project says now.

## What learners see
- **One consent screen** the first time something is used in a visit. It names what is used, what for, that recordings stay in the page on the device and are not saved on a server, and what they can do instead. Its buttons are **Continue**, **Not now** and **Do not use my microphone or camera**.
- **A recording bar** at the top centre of the page, over the project (leave a little room there), whenever a device is live, with the level, a timer and a **Stop** that always works. Recording starts only after a real tap, stops by itself at the length limit, and the device is let go the moment it ends.
- **Plain messages** when it cannot work: the browser said no, there is no device, another app is using it, or the course page does not allow it.
- **Do not use my microphone or camera** is remembered in the learner's browser. Every project then reads `off` and shows its plain version. Only the learner can turn it back on, from the button that stays at the bottom left. Browsers keep this per course site, so it holds for that site until they clear their data.

## Build the plain version first
Learners who cannot, or would rather not, use a microphone or camera must be able to finish. Read the state in a condition, a binding or a text layer:
- `microphone` and `camera` are `unavailable` (cannot, here), `denied` (they or their browser said no), `ready` or `off` (they chose not to use them).
- `photos` is the same for the photo picker.
- `mediaMessage` is the plain sentence to show when something is not ready.
- `micLevel` (0 to 1, how loud) and `micBands` (a list of 8 numbers, 0 to 1 each, from low to high sound) while the project is listening live, and `listening` (true while it is). `recording` is true while recording, and `micLevel` follows a recording too.
- `recording` `recordingSeconds`, and `recordings.<name>.state` (`empty`, `recording`, `ready`, `playing`), `.seconds` and `.hasRecording` for each recording, for meters, timers and buttons.

The **Accessibility** tab has a check for this. A project that uses a sensor needs a click, key or typed way to reach the same finish without it. The finish can be Report result, Go to a page, Steps, Check answer or the completion variable.

The check counts **Listen live** as a sensor node, and a node's **Could not start** output as a way on. It passes when a button or typed answer finishes without the sensor, including carrying on from **Could not start**.

If there truly cannot be an equal way (an assessment of speaking, say), say why in **No equal way to finish**. Learners are told, and the check becomes a note for you to review. The check finds that there is another way, not that it is a good one.

The **Sign practice with self-review** starter is an example: the learner can do the whole walk, and reach the summary, without ever turning the camera on.

## Listen live: the microphone as a number
Tick **Live listening** under Microphone (and **Only ever listen, never record** if that is all the project does: the page then refuses every Start recording, and the consent screen says so). A **Listen live** node turns it on and off. While it is on the microphone drives numbers you can bind anywhere: `micLevel` (how loud) and `micBands` (8 bands, log-spaced from about 80 Hz to 8 kHz: `micBands[0]` is a low hum, `micBands[7]` the highest whistle overtones), about 25 times a second. Bar heights, circle sizes, colours and shaders can read them like any variable. For example, a bar's height binding `200 * micBands[3]`.
- **Nothing is recorded.** The page measures the sound and throws it away; only those numbers reach the project, and a **Listening** bar says so at the top of the page, with a **Stop** that always works. Learners are asked first, on the same consent screen, and only after a tap.
- **It stops** when the learner presses Stop, the device goes away, a new page of the project opens (unless you untick **Stop when the learner leaves this page** on the node) or they leave. `listening` then reads false and the numbers go back to 0. **When the microphone or camera is used** with *Live listening started or stopped* fires each time (`event.reason` is `started`, `stopped`, `device-lost` or `released`).
- **It is a rough guide.** Phones and many laptops tidy the sound themselves (automatic gain, noise removal), so the numbers say louder or quieter and higher or lower, not decibels or exact pitch. The page asks the browser not to, and some ignore it. Do not use it for a safety measurement, and word anything about noise levels as a guide. There is no pitch tracking: the bands show where the sound is, not which note.
- **Give a way to play without it.** The loudness and frequency starters add a slider that makes the same numbers (`simLevel`, `simPitch`): show it when `!listening`, and bind the display to `listening ? micLevel : simLevel`. It also works in Preview, where a pretend microphone makes a swelling level and a moving bump of bands.
- Listening and recording share the one microphone: starting a recording ends live listening, and Listen live cannot start while a recording runs.

## Nodes
All are in the Interactions palette, and described there.
- **Listen live** (start or stop, stop when the learner leaves this page) continues from **Listening** or **Could not start**.
- **Start recording** (a name for the recording, sound or video, a longest time) continues from **Recording** or **Could not start**. A project can keep several recordings, each under its own name. Set **Do** to *Start or stop* and one button does both: pressed while that recording is going it stops it and continues from **Recorded**, otherwise it starts. **Quiet other sounds first** (on) stops Play sound sounds, recording playback and the voice before the microphone opens, so a model answer does not leak into the take.
- **Stop recording**, **Discard recording**, **Play recording** (sound plays through the project's own sound, so the viewer's sound button applies; video plays in the layer you choose) and **Download recording** (offers a file, after a tap: it is the only way a recording leaves memory).
- **Camera preview** shows the camera live in a layer's place. The page draws it over the project, so the project never sees the camera's pixels.
- **Take or choose a photo** puts a picture, scaled to at most 1600 px on the long side, into an image asset. Every image layer that uses the asset shows it. From the device's photo picker (with the front or back camera if the device offers it) or a still from the live preview. To fill a different asset for each item of a list, give **Or the asset from an expression** an asset's id or name (such as `prompts[current].photo`); it wins over the asset picked. Set **Do** to **Throw the photo away** to put the asset's own picture back and forget the photo.
- **Download a file** saves text you build, such as a report or a CSV, after a tap, or a picture or a PDF of a layer. It works in any project. See [Download a file](sensors#download-a-file) below.
- **Offer: do not use my microphone or camera** asks the learner, in the page's own screen, whether to stop using them for good. Put it on a "Use the keyboard instead" button. Only the learner decides.
- **When the microphone or camera is used** fires when a recording starts, a recording is ready (`event.reason` is `stopped`, `limit` or `device-lost`: the learner can press Stop on the bar too), something could not start (`event.problem` and `event.message`), the state changed, a video finished playing, a photo arrived, or live listening started or stopped.

## Download a file
**Download a file** needs no microphone or camera, so there is nothing to tick in **Microphone and camera**. The journal and workbook starters use it on a **Download as a file** button, so a learner keeps their work without an email link. A project shared before this needs **Update to the latest version**.

- With the type **Web page (.html)** it can carry pictures. Write `[[image:id]]` where one goes, with the id or name of an asset (a photo the learner took, or one of your own pictures).
- The learner's page swaps the mark for the picture itself, so the file is one page with its images inside and works offline. If a picture can't be found the mark is left empty, so give each image a good `alt`.
- Put `html(text)` around anything the learner typed so it can't break the page.
- A web page can be up to 16 MB, and other files up to 2 MB.
- Every web page is saved with a rule that stops it running script or loading anything when it is opened, so it is a report and nothing more.

The **Photo prompts notebook** starter builds its whole report this way, for upload to a Moodle assignment.

### A picture or a PDF of a layer
Pick **Picture of a layer (.png)** or **PDF of a layer (.pdf)** as the type and the node saves a layer as it is on screen now, or the whole page with no **Layer** chosen. A study plan's grid, a certificate, a finished drawing.

- **Footer, left** and **Footer, right** put a line at the foot, such as `context.displayName` and `today("d mmmm yyyy")`.
- A PDF is the size of the layer, or an **A4** page with the layer fitted in its margins.
- Tick **Not in downloads** (in a layer's **Layer** section) on anything that means nothing on paper, like an info button or the Download button itself, and it's left out.
- **File name** is a formula like any other: `"Plan " + context.displayName + " " + today("dd-mm-yyyy")`. Characters a file name can't hold, such as a colon or a slash, are replaced with a space.
- These are saved straight away, without the tap a text file asks for. Text in them is a picture, so it can't be selected or searched, and a video or an embedded page shows as an empty box.

**Picture of a layer** is the same picture as its own node. **Then** downloads it, or keeps it in a text variable: bind an image layer's picture to that variable to show it, and tick **Save as user data** on the variable to keep it for the person (pictures of up to about 1 MB).

## Try it
**Preview** has a pretend microphone and camera, because the real ones need the page the project is shared in. It makes a made-up level and short tone for a recording, a swelling level and moving bands for live listening, and a sample picture. The **Microphone and camera** menu above the preview makes it fail the ways a real one does (denied, no device, blocked by the course page, the learner chose not to use them), so you can build and check the plain version. A small "Simulated" note shows while it records. Try the real devices from the **Link for StudyDesk** on the page you will use.

## Where it works, and what it needs
- Play it from the **Link for StudyDesk** (`/interactives/play/<token>`). The plain share link (`/s/<token>`) cannot use a microphone or camera: its sandbox has no origin, and the browser refuses any device to such a page, so every node there goes down its **Could not start** output.
- The StudyDesk page that holds the link's iframe needs **allow="microphone; camera"** on that iframe, or the browser refuses the page too. Without it learners are told, in plain words, that the course page does not allow it. Tell whoever builds the page. Another learning system that launches the project over LTI 1.3 decides its own iframe attributes and may not allow it at all.
- It needs a secure page (https) and a recent Chrome, Edge, Firefox or Safari. The Moodle App and in-app browsers may not allow a microphone in an embedded page: test there before relying on it.
- Recordings and photos are kept in memory, in the page, so they are gone when the learner leaves or reloads. Say so ("download before you leave"), and offer **Download recording** or a downloaded report. Nothing is uploaded or stored on a server, and the Insights records never carry audio, video, photos or what was said. The project's own code can use a recording it plays, so do not put code you do not trust in a project that uses a microphone.
- For anything marked, use the Moodle assignment's own recording or upload: this does not submit a recording anywhere.
