# Describe what you see
Add short descriptions of what is on screen to a timeline or a video, read by the viewer's own voice in the gaps, and listed with the captions in one transcript.

Captions say what is **heard**. Many videos and animations also carry information only in the **picture**: a graph that rises, a diagram that builds, a gesture, text on a slide. People who cannot see it miss that part. A **description track** is short timed sentences saying what is on screen when it matters.

**This is a cheaper aid, not a recorded described version.** The words are read by a voice already on the viewer's device, so it sounds like a screen reader, not a person. Where a course is formally required to have an audio described version, record one and use this as well, or instead mark the accessibility finding reviewed. The transcript with descriptions below always works, with or without a voice.

## How it works for the viewer
- The description cues are never drawn. When the viewer has **Descriptions** on, a voice on their device reads each one as the timeline (or the video) reaches it, in the gap where you put it, and the sound is **turned down** while it speaks, then back up.
- The **Descriptions** button sits with the caption buttons. It only shows when a voice on the device can read one, and it starts **off** unless you tick **Descriptions on to start** in Project settings (Captions and narration). The viewer's own choice is remembered in their browser.
- Pausing, jumping to another point or turning descriptions off stops the voice. A description is read once as the media reaches it; jump back and it is read again.
- If a description is still being read when the next one comes up, it is not cut off: the next waits (a few at most).
- Only voices that run on the device are used. A voice that sends the words to an internet service is never used, and nothing is recorded.
- The viewer's sound button also mutes the voice, and the read-aloud speed they chose applies.

## Worked example: describe a lecture clip
1. Caption the clip first (see [Narration, captions and transcript](captions)) so you can see where the speech is and where it is not.
2. On a **timeline**: in the **Descriptions** row choose **New description at the playhead**, then type one sentence in **Text**. For a **video layer**: select it and use **Add one** under **Descriptions (what is on screen)** in its settings, then set **From**, **To** and the text.
3. Put each one in a **gap** between speech. A description that overlaps a caption is drawn with a dashed amber edge in the lane (and flagged in the layer's settings) because the voice would talk over the speaker.
4. Press **Preview**, turn **Descriptions** on and play it. Listen on a phone too: a synthetic voice over the speaker is the thing to check.
5. Open the **Transcript with descriptions** and read it start to finish. If it makes sense without the picture, the descriptions are doing their job.

## Describing well
- Say what a person who could see would **need** to follow, not everything. Do not repeat what the narration already says.
- Present tense, plain words: "A line graph appears. Hours of study are on the side and weeks along the bottom. The line climbs steadily."
- Read out text that appears on screen and matters (a title, a formula, a label).
- Name people the way the speech does. Do not add opinions ("a beautiful chart").
- Fit the gap: about two or three words a second, so ten words need roughly four seconds. The voice speeds up a little to fit and never above a clear pace.
- Describe a diagram once, in the order you would explain it. For a long or dense one, also put the full description in the page's text.

## Timelines and video layers
- **Timelines.** The **Descriptions** row sits under **Captions**. It works like captions: lanes of cues you drag and retime, one track per language, **Import WebVTT or SRT…**, **Export WebVTT**, **Export SRT** and **Add a language…**. The viewer's caption language picks the descriptions in that language when there is one.
- **Video layers.** In the layer's settings, **Descriptions (what is on screen)**: add, retime, import or export a WebVTT file made for this video, and set the **Language** (it picks the voice). Times are seconds from the start of the video. The video is turned down while a description is read, and put back to the level the viewer had.
- A second cue track is a second thing to keep in step. When you replace a video or re-time a timeline, check the descriptions again.

## Transcript with descriptions
With descriptions on the page the viewer's **Transcript** button opens **Transcript with descriptions**: the captions and the descriptions in one list in time order (a description comes first when it starts with the words), each line a button that jumps there. Each description line says **Description** in its text, so a screen reader or a braille display tells it apart, and a tick box hides the descriptions to read just what was said. It works when there is no voice, and it is ordinary page text, so it can be searched. A video layer with descriptions gets its own group in the transcript with its captions and descriptions together.

## Your own buttons
If you hide the viewer buttons in Project settings, the **Captions and sound** [node](interaction-nodes) has **Descriptions: flip**, **on** and **off**.

## Not done yet
Reading **while the video waits** (it pauses itself for a description that does not fit a gap) is not built. For now keep descriptions short enough to fit the gaps, or leave a longer pause in the video.

## Good to know
- The [accessibility check](accessibility-checker) asks you to look at a video without captions and points here for the pictures (WCAG 1.2.5). It cannot tell whether a description is accurate.
- Exported files and share links carry the descriptions inside them.
- The **Described video** starter in the Templates tab has a video layer with the track wired up and a one-page checklist on describing well.
