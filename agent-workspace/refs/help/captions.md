# Narration, captions and transcript
Put a voice-over on a timeline, caption it by pasting a transcript, and let viewers turn captions on, change their size and jump around with the transcript.

A [timeline](timelines) can carry **sound** and **captions**. The sound plays while the timeline plays and stays with it: pause the timeline and it pauses, jump the playhead and it jumps, change the speed and it follows. The captions are timed text that the player draws over the page, with buttons so each viewer can switch them off, make them bigger, or open a **transcript** that jumps the timeline to any line.

## Worked example: narrate a short explanation
![The timeline with a narration clip and its waveform, and four captions under it.](help/narration-timeline.png)

1. Open the **Timeline** tab and pick or make a timeline. In the **Sound** row choose **+ Add sound…** and pick an audio file (**Upload audio…** adds a new one to the project). It appears as a clip with its waveform, starting at the playhead, and the timeline grows to hold it.
2. In the **Captions** row choose **Paste a transcript…**. Paste what the voice says, leave **Timing** on **Across the narration** and press **Make captions**. Each sentence becomes a caption, long ones are split at a comma, and the time is shared out in proportion to the words.
3. Play the timeline (the sound plays in the editor too). Where a caption comes in early or late, drag the caption's edges in the lane, or select it and press **Start = playhead** or **End = playhead** at the right moment.
4. Press **Preview**. The captions show over the page, the **CC**, **A−**, **A+**, **Transcript**, **Sound** and **Pause** buttons sit in the top corner, and pressing a line in the transcript jumps to it.
5. Run the [accessibility check](accessibility-checker). If the narration has no captions, or they cover little of it, it says so.

## Sound
- **Moving and trimming.** Drag a clip to start it later or earlier. Drag its left edge to skip the start of the file, its right edge to stop it sooner. The fields beside the timeline give exact milliseconds.
- **Volume.** The clip has a level, and **volume keys** that multiply it over time: double-click the clip to add one, drag it up and down for the level and sideways for the time. **Fade out** adds two keys for you.
- **Role.** **Narration** (the default) is speech and needs captions. **Music** and **Sound effect** do not. For music that runs across pages, see [Soundtrack music](captions#soundtrack-music). Muting a clip (the **M** button) keeps it in step but silent.
- **It follows the timeline.** The sound plays when the timeline plays forwards inside the clip. It is silent when the timeline is paused, reversed or outside the clip, and it follows the timeline's speed (between a quarter and four times). When a timeline blends in, its sound comes in with it. A timeline that never started stays silent.
- **Speed and pitch.** At another speed a clip keeps its pitch (it is time-stretched, like a browser's own audio player does it), so a voice at 1.25x sounds quicker, not higher. Untick **Keep pitch at other speeds** in the clip's settings for the record-player effect instead: faster is higher, slower is lower.
- **Play sound, with options.** The **Play sound** node has a **Volume** (0 to 1), a **Speed** (0.25 to 4, 1 is as recorded) and a **Loop**. Each one takes a plain value or an expression, so a variable can drive them (a speed slider, a "looping" toggle). **Keep the pitch when the speed changes** is on by default, so a slowed clip stays at its own pitch where the browser allows it. **Stop other sounds first** is for comparing two clips: only one is heard at a time. Leave all of these alone and the node plays the sound once at full volume, as it always did.
- **Which sound.** Pick it in **Sound**, or fill **Sound from expression** to work it out while the project runs: a list item's sound field (an asset's name or id), say, so one button and one node can play any clip in a repeater. When the expression is filled it wins, and an empty answer plays nothing.
- **Stopped, and what is playing.** **Play sound** and **Play recording** have a **Stopped** output. Wire it and **When it finishes** only continues when the sound really ends; if a **Stop sound** node (or another sound with **Stop other sounds first**) cuts it short, the flow goes out of **Stopped** instead. With the next node set to run straight away, or a loop, **Stopped** still fires later when it is stopped. Leave it unwired and nothing changes from before. In formulas, `soundPlaying()` is true while any Play sound sound is going (`soundPlaying("Ding")` for one asset by name), and `soundsPlaying` lists their names, so one button can read "Stop" while its sound plays. Scripts have `ix.soundPlaying()` and `ix.soundsPlaying()`.
- **Stopping a loop.** A looping sound plays until a **Stop sound** node ends it (all of them, or just one sound), or until the viewer leaves the page, pauses the project or the tab goes to the background (the soundtrack is the exception: it carries on across pages). A loop never finishes, so the next node runs straight away. **Stop sound** also cuts a sound that is still playing once. It does not touch timeline audio, which follows its timeline.
- **Media keys don't touch it.** Sound plays through the browser's Web Audio, not an audio player of its own, so the keyboard's play/pause key, headphone buttons and the system's media controls don't stop it behind the project's back. Only the project (its timelines and **Play sound**) decides what sounds.
- **When the browser says no.** Browsers will not start sound until the viewer has clicked, tapped or pressed a key. Then the player shows **Sound is waiting. Press to start it**, and any click or key press on the page starts it too. That includes a **Play sound** that runs before anyone has clicked (from **When the page is shown** or a timer): it waits and plays at that first press. If several are waiting, only the latest plays, so a run of hover sounds doesn't all go off at once. Put a **Start** button in front of an autoplaying narration if the first seconds matter.

## Soundtrack music
Music that carries on from page to page, instead of ending when the page changes.

1. In **Interactions**, add a **Play sound** node and pick the music.
2. Tick **Soundtrack: keep playing on the next pages**, and **Loop** too if the music should go round.
3. Start it from the first page (or any page). Every page can safely start it.

Without the nodes, **+ When clicked…** on a layer has **Play music that carries on across pages** and **Stop the music**.

What it does:
- It carries on when the page changes, and keeps going silently if the project is paused or the tab is hidden, coming back with the page.
- It goes quiet (to a quarter) while a narration clip, a description or **Speak** is heard over it, and comes back up after.
- There is one soundtrack at a time. A page that starts the one already playing carries on, with no second copy. Starting a different one crossfades to it.
- It ends at a **Stop sound** node (it fades out), when the project is closed, or when the viewer starts over.
- Starting it inside an embedded page still makes it the project's.
- The viewer's sound button silences it like any other sound.

## Captions
- **Typing, pasting, importing.** Double-click empty space in a caption lane for a new caption, or use the **Captions** menu: **New caption at the playhead**, **Paste a transcript…**, **Import WebVTT or SRT…**, **Export WebVTT**, **Export SRT** and **Add a language…**.
- **Pasting.** Cut by sentence, line or paragraph. Time them **across the narration** (or the whole timeline), **one per marker** (a [marker](timelines) at the start of each new caption), or **at reading speed**. A transcript with times at the start of its lines ("0:12 Welcome", "[01:05] Next") keeps them.
- **Each caption** has its words, an optional **speaker** (shown as "Dr Lee: …"), and a start and end. **Split at playhead** and **Merge with next** reshape them.
- **Languages.** Add a track per language. With more than one the viewer gets a language menu; the transcript follows.
- **Video layers** take captions too: select the layer and use **Captions** in its settings. They show through the video's own caption display and follow the viewer's CC button. Import a WebVTT or SRT file made for this video; its times are seconds from the start of the video. A video with no captions makes the accessibility check ask you to confirm it has them.
- **Describing the picture.** Captions say what is heard. For what is only in the picture, see [Describe what you see](describe-what-you-see).

## What viewers see
Captions are on to start (unless you turn **Captions on to start** off in Project settings) and the viewer's choices (on or off, size, language, sound) are remembered in their browser. The **Captions and narration** section of the Project settings sets the look: the caption box's position, size, colours and font, or **A text layer of my own** (the player fills a text variable, and **Add a caption layer** makes the layer), and whether the buttons show. If you hide them, the **Captions and sound** [node](interaction-nodes) does the same jobs from your own buttons.

## Transcript and screen readers
The transcript is a labelled region of buttons, one per caption, with its time, the speaker and the words; the one showing is marked current. It is the way for a screen reader user to read what is said, so the caption box itself is hidden from screen readers (they would otherwise talk over the narration). Escape closes the transcript and returns focus to its button. Every viewer button works from the keyboard. When the timeline or a video layer has [descriptions](describe-what-you-see), the transcript lists them among the captions and is called **Transcript with descriptions**.

## Draft voice
Tick **Read aloud (draft voice)** on a caption track and the player reads each caption aloud with a voice installed on the viewer's computer, as a stand-in until the real recording is made. It uses only voices that run on the device: a voice that sends the words to an internet service is never used, and a device with no suitable voice says nothing. Browsers cannot save speech as a file, so this cannot make a recording for you; record the narration and add it as sound.

## With Steps
A [Steps](steps) timeline can carry sound and captions too: Next plays the narration to the next marker and it stops there. The step's own caption (on the marker) stays a separate thing in the step bar.

## Good to know
- Sound and captions belong to a timeline, so they stop with the artboard. An artboard shown inside another (an instance) brings its own.
- Exported files and share links carry the audio inside them, so a long recording makes a larger file.
- The timeline length is not changed by captions; adding a sound makes the timeline at least as long as the sound.
