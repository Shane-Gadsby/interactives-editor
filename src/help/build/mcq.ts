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

A card called **Question 1** appears on the page, already working: a prompt, four options, **Check answer**, **Hint**, **Try again**, a feedback line and a score. It is selected, and the **Question** section is open at the top of the Properties panel.

## 3. Write the question

In the **Question** section:

1. Replace the **Prompt** with \`Which planet is closest to the Sun?\`
2. Type the four options in the boxes under it, one per box: \`Venus\`, \`Mercury\`, \`Earth\`, \`Mars\`.
3. Click the round button beside **Mercury**. It marks the one right answer (the help line above the options says **Mark the one right option**).
4. Under each wrong option is a box saying **Feedback if chosen (optional)**. Type why it is wrong:
   - Venus: \`Venus is second. It is the hottest, though, because of its thick air.\`
   - Earth: \`Earth is third from the Sun.\`
   - Mars: \`Mars is fourth, past Earth.\`
5. Tick **Shuffle**, so the options come in a different order each time. The right answer is still Mercury wherever it lands.

Need more options? **+ Add option** adds one, the arrows move one up or down, and **×** removes one.

## 4. Tries, the hint and the feedback

Still in the **Question** section:

1. Under **Marking**, set **Tries** to **2**. After two wrong checks the question locks.
2. Leave **Show the right answer when finished wrong** ticked, so a learner who runs out of tries sees Mercury marked.
3. Under **Hints and feedback**, type a hint in **Hints**: \`It is also the smallest planet.\` Each press of **Hint** shows the next line, so you can give more than one.
4. Change the feedback lines:
   - **Right**: \`Right! Mercury goes round the Sun in just 88 days.\`
   - **Wrong**: \`Not quite. You have one more try.\`
   - **Out of tries**: \`The answer is Mercury, the smallest planet.\`

An option's own feedback, from step 3, shows instead of **Wrong** when that option was picked.

## 5. Report the result

1. Near the bottom of the **Question** section, set **Report result** to **Complete, with the score**. When the question finishes (right, or out of tries) its score goes to the project's results.
2. Click an empty part of the canvas, away from the page, so the Properties panel shows the project. Open **Results and progress**.
3. Set **Score from** to **Total of all questions**. Tick **Pass mark** and set **Pass at** to **50**.

With one question worth one point, getting it right is 100% and a pass.

## 6. Try it

1. Press **Preview** at the top right.
2. Pick **Venus** and press **Check answer**. The Venus feedback shows and you have one try left.
3. Press **Hint** to see the hint, then pick **Mercury** and check again. It says *Right!* and the score shows.
4. Press **Try again** and get it wrong twice to see the question lock with Mercury marked.

The **Variables (live)** list on the left of the Preview shows the question's own variables changing: \`q1_attempts\`, \`q1_correct\`, \`q1_score\` and the rest. Press <kbd>Esc</kbd> to close the Preview.

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
