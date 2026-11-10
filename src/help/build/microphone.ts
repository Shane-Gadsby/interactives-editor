import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 56,
  level: 'intermediate',
  minutes: 20,
  example: 'tut-microphone',
  topic: {
    id: 'tutorial-microphone',
    title: 'Speaking practice with the microphone',
    group: 'Build it',
    summary: 'A one minute talk the learner records with one button, a countdown that ends the take, playback, and a slider to rate how it went.',
    keywords: 'tutorial microphone record recording voice speaking practice oral talk play back playback countdown timer clock consent permission sensors start recording stop recording play recording rate self assessment',
    body: `You will make a speaking practice page. The learner reads a prompt, presses **Start my talk** and speaks for up to a minute while a countdown runs. The recording stops by itself when the time is up, **Play it back** lets them hear it, and a slider asks how confident they sounded. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Speaking practice with the microphone**. **Play** runs it and **Make my copy** gives you your own copy.

Recordings stay on the learner's device, in the page, and are gone when they leave. Nothing is uploaded or marked. For a recording you need to mark, use the Moodle assignment's own recorder.

## 1. Make a project and turn the microphone on

1. On the projects page press **New project**. Keep **Blank project**, type **Speaking practice** as the name and press **Create project**.
2. Click an empty part of the canvas, away from the page, so the Properties panel shows the project. Open **Microphone and camera**.
3. Tick **Microphone**. A project can only use what is ticked here.
4. In **What it is used for**, type \`record your one minute talk so you can play it back and rate it\`. It finishes the sentence learners read before they are asked.
5. Set **Longest recording (seconds)** to **90**, a little over the minute.

Further down, the box headed **What learners are asked** shows the consent screen exactly as learners will see it, with its three buttons: **Continue**, **Not now** and **Do not use my microphone or camera**. Leave **No equal way to finish** empty: this activity still works without a microphone.

![The Microphone and camera section: Microphone ticked, What it is used for filled in, Longest recording 90, and the consent screen learners will see.](help/tutorial-microphone-settings.png)

## 2. Two variables

Open the **Variables** tab at the bottom. Press **+ Add variable**, pick **Counter**, name it \`left\` and set its **Value** to 60. Add another **Counter** called \`confidence\` with the **Value** 3.

## 3. The page

1. Press <kbd>T</kbd> for the **Text** tool and click near the top left. Type \`Talk for one minute\` and press <kbd>Escape</kbd>. Make it large and bold.
2. Add a second text under it with the prompt: \`Explain to a friend why sleep matters for learning. Give one reason and one example.\`
3. Add a text for the clock: \`{left} seconds left\`. Anything in braces is worked out, so it shows the number. Name it **Clock** and make it big.
4. Press <kbd>B</kbd> and drag a button under the clock. **Label** it **Start my talk** and **Name** it **Talk button**.
5. Add a second button beside it, **Label** **Play it back**, **Name** **Play button**.
6. Under the buttons add a small text with just \`{mediaMessage}\`. If the microphone can't be used it says why in plain words, and otherwise it is empty.

## 4. One button that records and stops

The **Talk button** starts the take and, pressed again, stops it. Its label should say so.

1. Select **Talk button**. In **Data bindings** press **+ Add binding** and pick **Button label**. Press **Formula** and type:

\`\`\`
recordings.talk.state == "recording" ? "Stop" : recordings.talk.hasRecording ? "Record again" : "Start my talk"
\`\`\`

\`talk\` is the name you will give the recording. \`recordings.talk.state\` says what it is doing and \`hasRecording\` whether there is a take yet.

2. In its **Interactions** section press **+ On click (empty)**. The **Interactions** tab opens with a **When clicked or hovered** node.
3. Drag from the node's output into empty space and choose **Start recording** (type \`record\` to find it). Set **Do** to **Start or stop** and **Recording name** to \`talk\`. Leave **Record** on **Sound from the microphone** and **Quiet other sounds first** ticked.

**Start recording** has three outputs: **Recording** (it started), **Recorded** (it was pressed while recording, so it stopped) and **Could not start**.

![Talk button's Properties: the Button label binding with its formula, and the Interactions section describing the whole chain in a sentence.](help/tutorial-microphone-talk-button.png)

## 5. The countdown

1. Drag from **Recording** into empty space and choose **Countdown / clock**. Set **Variable** to **left**, **Do** to **Start**, **Counts** to **Down (seconds left)** and **Seconds** to \`60\`.
2. Drag from **Could not start** onto the same **Countdown / clock** node. A learner who said no, or has no microphone, still gets the timed talk: they talk to the room instead.
3. Drag from **Recorded** into empty space and choose **Countdown / clock** again. Set **Variable** **left**, **Do** **Reset**, **Seconds** \`60\`. Stopping early puts the clock back.
4. From the first countdown's **Time up** output, add **Stop recording** with **Recording name** \`talk\`. When the minute is up the take ends.

The page around the project also shows a recording bar with its own **Stop**, which always works. To put the clock back when that is used too, add **When the microphone or camera is used** from **Search nodes** on the left, set **When** to **A recording is ready** and **Recording name** to \`talk\`, and join it to another **Countdown / clock** set to **Reset**.

![The Interactions graph: the Talk button's click starts the recording, Recording and Could not start both start the countdown, Time up stops the recording, and a recording that is ready resets the clock. The Play button plays it back.](help/tutorial-microphone-graph.png)

## 6. Play it back

1. Select **Play button**. Bind its **Visible** to \`recordings.talk.hasRecording\` (**+ Add binding**, **Visible**, **Formula**, then **Edit as formula**), so it only shows once there is something to play.
2. Press **+ On click (empty)**, drag from the node's output and choose **Play recording**. Set **Do** to **Play** and **Recording name** to \`talk\`.

The recording plays through the project's own sound, so the learner's sound button and volume apply.

## 7. Rate it

1. Add a text: \`How confident did you sound?\`
2. Open the **Web** group in the tool bar, click **Input field** and drag a box under the text. In the **Input** section set **Type** to **range**, **Min** to 1, **Max** to 5 and **Step** to 1.
3. Press **Bind to a variable…** and pick **confidence**. Moving the slider now sets \`confidence\`, both ways.
4. Add a text beside it: \`{confidence} out of 5\`.

Select the slider and fill in **Text alternative** in its **Accessibility** section, such as *How confident did you sound, 1 to 5*, so a screen reader says what it is for.

## 8. Try it

1. Press **Preview**. Preview has a pretend microphone, since a real one needs the page the project is shared in.
2. Press **Start my talk**. The clock counts down and the button says **Stop**. A small *Simulated microphone (Preview)* note shows while it records.
3. Press **Stop**. The clock goes back to 60, the button says **Record again** and **Play it back** appears. Press it to hear the pretend take.

![Preview while recording: the Simulated microphone (Preview) note at the top, the clock at 45 seconds left and the button saying Stop, with the Microphone and camera list in Preview's bar.](help/tutorial-microphone-preview.png)

4. Change the **Microphone and camera** list in Preview's bar from **Microphone and camera: Works** to **Microphone and camera: Denied by the learner**. Press **Restart**, then **Start my talk**: the clock still runs, and the status line under the button says why nothing is recorded.

![Preview with the microphone denied: the clock counting down anyway, and the status line explaining that the browser is not letting the page use the microphone.](help/tutorial-microphone-denied.png)

To try your real microphone, share the project with **In a StudyDesk page, and keep learners' results** (see [Publishing and sharing](tutorial-publish)) and open it in the course. The plain share link can't use a microphone at all, and the StudyDesk page's iframe must have \`allow="microphone; camera"\`, which StudyDesk pages keep.

## Make it yours

- **A model answer.** Add a **Play sound** of a model talk before the learner's turn, so they can compare.
- **Preparation time.** Add a **Get ready** button that starts a 30 second **Countdown / clock** on a new \`prep\` variable, and a text showing \`{prep}\`. Recording only starts from a real tap, so the learner still presses **Start my talk** when the time is up.
- **Keep the rating.** Tick **Remember** on \`confidence\` in the Variables tab, under **Options**, so it is there next time.

## What you learned

- **Microphone and camera** in the project settings declares the microphone and writes the consent screen.
- **Start recording** with **Start or stop** makes one button record and stop, and **Could not start** keeps the activity working without a microphone.
- **Countdown / clock** runs the timer, and its **Time up** output ends the take with **Stop recording**.
- **Play recording** plays the take back; \`recordings.talk\` tells bindings what it is doing.

**Next:** every microphone, camera and photo node is in [Microphone, camera and photos](sensors), with what learners see and what the page needs. More on the timer: [Interaction node reference](interaction-nodes).`,
  },
};
