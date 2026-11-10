import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 55,
  level: 'intermediate',
  minutes: 25,
  example: 'tut-video-chapters',
  topic: {
    id: 'tutorial-video-chapters',
    title: 'Interactive video with chapters and questions',
    group: 'Build it',
    summary: 'A video with chapter buttons that jump to each part, captions, and two questions that pause it at set times until they are answered.',
    keywords: 'tutorial video chapters chapter buttons seek jump cue cue points pause question interactive video captions subtitles vtt srt hold paused control video play',
    body: `You will make a video lesson. Three chapter buttons under the video jump to each part, and at two set times the video pauses and a question appears over it. When the question is finished, **Continue the video** plays on. It takes about twenty-five minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Video with chapters and questions**. **Play** runs it and **Make my copy** gives you your own copy. It has no video in it: pick your own (step 2) and it works.

You need a video file (an \`.mp4\` is safest) or a web address for one, and if you have them, captions for it as a WebVTT (\`.vtt\`) or SRT (\`.srt\`) file. This tutorial uses a short video about reading a research article, with chapters at 0, 35 and 75 seconds. Change the times to suit yours.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Video lesson** as the name and press **Create project**. The editor opens with one page called **Home**, 800 by 600.

## 2. Add the video

1. In the tool bar down the left, click **Media** to open the group, then click **Video**. Drag a box on the page.
2. In the Properties panel change **Name** to **Clip**, and set **X** to 80, **Y** to 40, **W** to 640 and **H** to 360. That is where the questions will sit too.
3. In the **Video** section, open the **Video** list and choose **+ Add a new video…** to pick your file. For a web address instead, leave it on **Use a URL** and paste the address into **URL**.
4. A new video layer starts silent and playing by itself on a loop. Untick **Autoplay**, **Loop** and **Muted**, and tick **Controls** so the learner gets play, pause and the time bar.

The video doesn't play on the editing canvas. It plays in **Preview**.

## 3. Captions

Further down the **Video** section, under **Captions** (below **Cue points** and **Chapters**), press **Import…** and pick your \`.vtt\` or \`.srt\` file. A message says how many captions came in. Type the language in **Language**, such as \`en\`.

Captions are what is said, for learners who can't hear it or would rather read. If you don't have a file yet, come back to this step before you share it. See [Captions](captions).

## 4. Chapters

Still in the **Video** section, under **Chapters**:

1. Press **Add a chapter** three times.
2. Fill in each one. **From** is the second it starts and **Title** is its name:
   - **0**, \`Start with the abstract\`
   - **35**, \`Skim the headings\`
   - **75**, \`Read closely\`

The video's own controls list the chapters in browsers that show them. The buttons you make next read the same list.

![Clip selected, with its Video section: Cue points at 30 (q1) and 70 (q2), both ticked Pause the video here, then Chapters at 0, 35 and 75 with their titles, and Captions with Import… under them.](help/tutorial-video-chapters-cues.png)

## 5. Chapter buttons

1. Press <kbd>B</kbd> for the **Button** tool and drag a button under the video. Set its **Label** to **Start with the abstract**, **Name** to **Chapter 1**, **X** to 80, **Y** to 416 and **W** to 200.
2. Make two more beside it: **Skim the headings** (**Chapter 2**, X 300) and **Read closely** (**Chapter 3**, X 520), both at Y 416 and W 200.
3. Select all three (<kbd>Shift</kbd>+click them in the **Layers** panel) and press <kbd>Ctrl</kbd>+<kbd>G</kbd> to group them. Name the group **Chapter buttons**.

Now make each one jump to its chapter:

1. Select **Chapter 1**. In its **Interactions** section press **+ On click (empty)**. The **Interactions** tab opens with a **When clicked or hovered** node for the button.
2. Drag from the dot on the right of that node into empty space and let go. In the **Add and connect** menu, type \`video\` and choose **Control video**.
3. In the new node set **Video layer** to **Clip** and **Do** to **Go to a time (seconds)**. In **Seconds** type:

\`\`\`
layer("Clip").chapters[0].time
\`\`\`

That is the start of the first chapter (the list counts from 0). Move a chapter in step 4 and the button follows.

4. Drag from that node's output into empty space again, choose **Control video**, set **Video layer** to **Clip** and **Do** to **Play**.
5. Do the same for **Chapter 2** with \`chapters[1]\` and **Chapter 3** with \`chapters[2]\`.

## 6. A variable for the open question

Open the **Variables** tab at the bottom, press **+ Add variable** and pick **Counter**. Name it \`question\` and leave its **Value** at 0. It says which question is showing: 0 for none, 1 for the first, 2 for the second.

## 7. Add the two questions

1. Open the **Web** group in the tool bar, click **Add question** and pick **Multiple choice (one answer)**. A card called **Question 1** appears over the video, the same width.
2. In the **Question** section, set the **Prompt** to \`What does the video say to read first?\` and the options to \`The abstract\`, \`The reference list\` and \`The last paragraph\` (press **×** on the fourth). Mark **The abstract** as the right one, tick **Shuffle** and set **Tries** to **2**. [A multiple choice question](tutorial-mcq) explains every setting.
3. Add a second one the same way: \`Why skim the headings before reading closely?\`, with \`To see the structure and the main points\` (right), \`So you can skip the reading\` and \`To find the longest section\`.

Now let each card show only at its turn:

1. Select **Question 1** in the **Layers** panel. In **Data bindings**, press **+ Add binding** and pick **Visible**.
2. Press **Formula**, then **Edit as formula**, and type \`question == 1\`.
3. Do the same for **Question 2** with \`question == 2\`.

Both cards fade to faint ghosts on the canvas, since \`question\` starts at 0. They are still there: pick them in the **Layers** panel to edit them. Bind **Chapter buttons** the same way, with \`question == 0\`, so the chapters are hidden while a question is open.

## 8. Cue points that pause

1. Select **Clip**. In the **Video** section, under **Cue points**, press **Add a cue** twice.
2. Set the first cue's **At** to **30** and **Name** to \`q1\`, and tick **Pause the video here**.
3. Set the second to **70**, \`q2\`, and tick **Pause the video here**.
4. In **Data bindings** on **Clip**, press **+ Add binding** and pick **Hold paused (it will not play while true)**. Press **Formula**, then **Edit as formula**, and type \`question > 0\`. While a question is open, nothing starts the video, not even its own play button. (The formula pickers write the same thing: **Condition** **question**, **is more than**, **a number**, **0**.)

![The Clip's Hold paused (it will not play while true) binding: Formula, with the Condition question is more than 0, currently false.](help/tutorial-video-chapters-hold-paused.png)

Now show the question when a cue is reached:

1. In the **Interactions** tab, type \`cue\` in **Search nodes** on the left and click **When a video reaches a cue point**. Set its **Video layer** to **Clip**.
2. Drag from its output into empty space and choose **Change a value or counter**. Set **Variable** to **question**, **Do** to **Set to** and **Value** to \`event.index + 1\`.

\`event.index\` is the cue's place in the list, counting from 0, so the first cue sets \`question\` to 1 and the second to 2.

## 9. Continue the video

1. Make one more button at **X** 80, **Y** 476, **W** 220. **Label** it **Continue the video** and **Name** it **Continue**.
2. Bind its **Visible** (as in step 7) to:

\`\`\`
(question == 1 && q1_locked) || (question == 2 && q2_locked)
\`\`\`

\`q1_locked\` turns true when the first question is finished (right, or out of tries), so the button shows once the open question is done.

3. Press **+ On click (empty)** on it and build this chain from the **When clicked or hovered** node:
   - **Change a value or counter**: **Variable** **question**, **Do** **Set to**, **Value** \`0\`.
   - **Wait**: **Milliseconds** \`40\`.
   - **Control video**: **Video layer** **Clip**, **Do** **Play**.

Setting \`question\` back to 0 hides the card and lets go of **Hold paused**. That happens on the next frame, which is what the short **Wait** is for: a **Play** any sooner is ignored.

Press **Read as sentences** at the top right of the graph to check the flows in words.

![The Interactions tab's Read as sentences view: when Clip reaches a cue point, set question to event.index + 1; when Continue is clicked, set question to 0, wait 0.04 s, then play Clip; and each chapter button going to its chapter's time, then playing.](help/tutorial-video-chapters-sentences.png)

## 10. Try it

1. Press **Preview**. Press play on the video.
2. At 30 seconds it pauses and **Question 1** shows. The chapter buttons are gone, and the video's play button does nothing.
3. Answer it. **Continue the video** appears. Press it and the video carries on.
4. Press a chapter button and the video jumps there. Drag the time bar past 70 seconds and no question shows: only playing across a cue counts. Drag back before it and it is ready again.

The **Variables (live)** list on the left of the Preview shows \`question\` changing (press **Debug** in Preview's bar if you don't see it). Press <kbd>Esc</kbd> to close.

## Go further

- **More questions.** Add a cue and a question card, and bind the card's **Visible** to its number. The cue flow needs nothing new.
- **Where am I?** Add a binding to **Clip** with **Chapter showing (1 is the first, 0 before it)** going **Out →** to a new variable, and bind each chapter button's fill colour to light up the one playing.
- **A score.** Each question has its own \`q1_score\`. A text layer with \`Score: {q1_score + q2_score} of 2\` adds them up, and **Report result** on each question sends them to the project's results. See [Results and progress](results).
- **Descriptions.** Under **Descriptions (what is on screen)** add short lines a voice reads for learners who can't see the picture.

## What you learned

- A video layer holds its own **Chapters**, **Cue points** and **Captions**, all in the **Video** section.
- **Control video** goes to a time and plays, and \`layer("Clip").chapters[0].time\` reads a chapter's start.
- A cue ticked **Pause the video here** fires **When a video reaches a cue point**, and **Hold paused** keeps it paused until the question is done.

**Next:** everything a video layer can do is in [Images, video and audio](images-media#cue-points-and-chapters). More on the question cards: [Questions and quizzes](question-kit). More on bindings: [Bindings](bindings).`,
  },
};
