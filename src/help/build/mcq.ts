import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 10,
  level: 'beginner',
  minutes: 10,
  example: 'tut-mcq',
  topic: {
    id: 'tutorial-mcq',
    title: 'A multiple choice question with scoring and feedback',
    group: 'Build it',
    summary: 'One question with four options, two tries, a hint, feedback for each wrong answer, and a result sent when it finishes.',
    keywords: 'tutorial multiple choice question quiz mcq options right answer feedback hint tries attempts score points result report pass mark check answer',
    body: `You will make one multiple choice question: which planet is closest to the Sun? The learner gets two tries and a hint. Each wrong answer says why it is wrong, and when the question finishes its score is reported. It takes about ten minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Multiple choice question**. **Play** runs it and **Make my copy** gives you your own copy.

You don't draw anything or wire anything by hand. **Add question** builds the whole card from ordinary layers, and the **Question** section of the Properties panel changes it.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Planet quiz** as the name and press **Create project**. The editor opens with one page called **Home**.

## 2. Add the question

1. In the tool bar down the left, find the **Web** group. It starts folded: click **Web** to open it.
2. Click **Add question** and pick **Multiple choice (one answer)**.

![The Web group open in the tool bar, with the Add question menu listing Multiple choice (one answer) first.](help/tutorial-mcq-add-question.png)

A card called **Question 1** appears on the page, already working, with a sample question about prime numbers: a prompt, four options, **Check answer**, **Hint**, **Try again**, a feedback line and a score. It is selected, and the **Question** section is open in the Properties panel, just under **Layer**.

## 3. Write the question

In the **Question** section:

1. Replace the **Prompt** with \`Which planet is closest to the Sun?\`
2. Type over the four sample options, one per box: \`Venus\`, \`Mercury\`, \`Earth\`, \`Mars\`.
3. Click the round button beside **Mercury**. It marks the one right answer (the help line above the options says **Mark the one right option**).
4. Under each wrong option is a box saying **Feedback if chosen (optional)**. Type why it is wrong:
   - Venus: \`Venus is second. It is the hottest, though, because of its thick air.\`
   - Earth: \`Earth is third from the Sun.\`
   - Mars: \`Mars is fourth, past Earth.\`
5. Tick **Shuffle** (under **Marking**, below the options), so the options come in a different order each time. The right answer is still Mercury wherever it lands. Each option now has a **Stays in place when shuffled** box too, for an option such as *None of these* that belongs at the end.

![The canvas and the Question section: the planet prompt, Mercury marked as the right option, and feedback typed under Venus, Earth and Mars.](help/tutorial-mcq-question.png)

Need more options? **+ Add option** adds one, the arrows move one up or down, and **×** removes one.

## 4. Tries, the hint and the feedback

Still in the **Question** section:

1. Under **Marking**, set **Tries** to **2**. After two wrong checks the question locks.
2. Leave **Show the right answer when finished wrong** ticked, so a learner who runs out of tries sees Mercury marked.
3. Under **Hints and feedback**, replace the sample hint in **Hints** with \`It is also the smallest planet.\` Each press of **Hint** shows the next line, so you can give more than one.
4. Change the feedback lines:
   - **Right**: \`Right! Mercury goes round the Sun in just 88 days.\`
   - **Wrong**: \`Not quite. You have one more try.\`
   - **Out of tries**: \`The answer is Mercury, the smallest planet.\`

When a wrong option was picked, its own feedback from step 3 is added after the **Wrong** (or **Out of tries**) line.

## 5. Report the result

1. Near the bottom of the **Question** section, set **Report result** to **Complete, with the score**. When the question finishes (right, or out of tries) its score goes to the project's results.

![Marking, Hints and feedback, and Report result filled in: Tries 2, Shuffle ticked, the hint and the three feedback lines, and Report result set to Complete, with the score.](help/tutorial-mcq-marking.png)
2. Click an empty part of the canvas, away from the page, so the Properties panel shows the project. Open **Results and progress**.
3. Set **Score from** to **Total of all questions**. Tick **Pass mark** (it appears once you pick the total) and set **Pass at** to **50**.

![Results and progress with Score from set to Total of all questions, Pass mark ticked and Pass at 50.](help/tutorial-mcq-results.png)

With one question worth one point, getting it right is 100% and a pass.

## 6. Try it

1. Press **Preview** at the top right.
2. Pick **Venus** and press **Check answer**. The Wrong line and the Venus feedback show, and you have one try left. There's no **Try again** yet: while tries are left, the learner just picks again.
3. Press **Hint** to see the hint, then pick **Mercury** and check again. It says *Right!* and the score shows. The question is finished now, so the buttons go quiet.
4. Press **Restart** in Preview's bar and get it wrong twice. The question locks, Mercury is marked **Right answer**, and **Try again** appears.

![Preview after a wrong check: Venus picked, the Wrong line and the Venus feedback in red, and the Debug panel's live variables on the left.](help/tutorial-mcq-preview-wrong.png)

![Out of tries: Mercury marked Right answer, Venus marked Wrong, the Out of tries line, and Try again.](help/tutorial-mcq-out-of-tries.png)

The **Variables (live)** list on the left of the Preview shows the question's own variables changing: \`q1_attempts\`, \`q1_correct\`, \`q1_score\` and the rest. It is part of **Debug** in Preview's bar; press **Debug** if you don't see it. Press <kbd>Esc</kbd> to close the Preview.

> Preview remembers results and saved progress for this project in your browser. **Forget saved data** in Preview's bar starts you again as a new learner.

## Make it yours

The card is made of ordinary layers, so restyle it like anything else. The **Restyle a part** buttons at the bottom of the **Question** section select a part for you, such as the options or the buttons. Every option is one **Option** layer repeated, so restyling one restyles them all.

## What you learned

- **Add question** builds a working question; the **Question** section changes it without touching how it looks.
- Each option can have its own feedback, and **Tries**, **Hints** and **Show the right answer** shape what a learner sees.
- **Report result** and the project's **Results and progress** send the score.

**Next:** more question types are in [Questions and quizzes](question-kit). To turn a list of questions into a quiz in one go, see [Pasting questions in](paste-questions). How results reach StudyDesk is in [Results and progress](results).`,
  },
};
