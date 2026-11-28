---
name: ixia-questions
description: Use this skill when the designer asks for a question, quiz, check-your-understanding, true or false, fill in the blanks, ordering, matching or sorting activity, or wants better feedback, hints, tries or scoring on questions. It covers the native question kinds, writing good distractors and feedback, and Results reporting.
---

# Questions and quizzes

Always build questions with `build`. It uses the editor's native question card: prompt, options, Check answer, Hint, feedback, score and Try again, all ordinary layers wired to the question's own variables. It is accessible out of the box (radio group or checkboxes, feedback read to screen readers, drags that work by keyboard). Do not hand-assemble a question from rectangles and buttons.

## The kinds `build` can make

Common fields on every question: `prompt`, `hints` (a list), `feedbackCorrect`, `feedbackIncorrect`, `feedbackOutOfTries`, `attempts`, `points`, `report`, and optionally `name`. Extra fields the compiler also reads: `feedbackPartial`, `shuffle`, `checkLabel`.

| kind | Learner | Fields |
|---|---|---|
| `single` | picks one option | `options: [{text, correct, feedback}]`, exactly one `correct: true` |
| `multiple` | ticks every right option | same options, several `correct: true` |
| `truefalse` | picks True or False | `answer: true` or `false`. The prompt is the statement. |
| `blank` | types into one or more blanks | `blanks: [{label, answers: [...]}]`, optional `tolerance` for numbers |
| `ordering` | puts items in order | `items: [...]` listed in the RIGHT order (the learner sees them shuffled) |
| `matching` | drags terms to definitions | `pairs: [{term, match}]`, optional `extras: [...]` that match nothing |
| `categorise` | drags items into groups | `groups: [...]`, `cards: [{text, group}]` where `group` is a group name |

Limits to know: at most 12 options, 8 blanks, 12 ordering items, 8 pairs, 6 groups and 24 cards. A choice question needs two or more options and at least one correct. If you mark several correct on `single`, the compiler turns it into `multiple` and tells you. `build` returns problems for answers that do not add up, so fix them and build again. The names `multiple-choice`, `mcq`, `true-false`, `fill`, `order`, `match`, `categorize` are accepted as aliases, but use the real names above.

A hotspot question (click the right place on a picture) exists in the editor (Add question, Hotspot) but `build` cannot make it. If the designer wants one, say so and either suggest the Add question menu and the "Hotspot question" example under Templates, or build the closest alternative you can (a picture with named points that show text, see ixia-activity-patterns) and say it is not a marked question. Details are in refs/help/question-kit.md under "Hotspot".

## Distractors, stems and feedback (the craft)

Stems
- Ask one clear thing, in the stem and not in the options. Avoid negatives. If you must, write NOT in capitals.
- Test understanding or application ("Which of these is an example of...", "What happens if...") rather than recall of the wording in the notes.

Options
- Three or four options with one clearly best answer.
- Wrong options are plausible: built from real misconceptions or common errors, and similar in length and style to the right one. Do not make the right answer the longest or most detailed.
- No "all of the above" or "none of the above", and no trick wording. Vary where the right answer sits.

Feedback
- Every option gets its own `feedback` saying why: what is right about the right answer and what the misconception is in each wrong one. "Correct!" or "Incorrect" alone is never enough.
- One or two sentences, encouraging and specific. Point to where to learn more when the designer has given you that.
- On a wrong answer let them try again (`attempts` 2 or 3) unless the designer wants a single attempt. Hints should nudge, not give the answer away.

Other types
- Blanks: blank the key term, not filler words. List sensible variants in `answers` (plural, common spellings). Case and extra spaces are ignored by default. Numbers are compared as numbers, so `3` accepts `3.0`, and `tolerance` accepts near misses.
- Matching, ordering and sorting: four to eight items, and every item has one defensible place.
- True or false only for genuinely binary facts, with feedback that explains.
- Open responses and reflections are not native questions. Use an input and a model answer to compare against (ixia-activity-patterns, reflection journal).

Scale: "add a question" is one question. "Make a quiz" with no number is 3 to 5. When you invent questions, keep them accurate and say they are drafts to edit.

## Tries, scoring and Results

- `attempts`: checks allowed before the question locks. 0 is no limit. 1 is a one-shot test. Use 2 or 3 for practice.
- `points`: what the question is worth. The score is points times the share right, less any retry and hint penalties the designer sets in the Question section. Part marks (multiple response, ordering, blanks) are a setting in that section too.
- `report`: `"complete"` sends the score and completion to the project's Results when the question finishes. `"progress"` sends the score so far. Leave it out for practice. With several questions, setting `report` on each is fine, but for one total tell the designer to set Results and progress to "Score from: Total of all questions".
- Every project has a built-in `quiz` value: `quiz.score`, `quiz.max`, `quiz.percent`, `quiz.passed`, `quiz.count`, `quiz.finished`, `quiz.right`, `quiz.done`, and `quiz.questions` (one entry each with `prefix`, `page`, `score`, `points`, `correct`, `locked`). Use them in text on a results page, for example `Score: {quiz.score} of {quiz.max}`. Add that text with `edit` (a text layer containing braces), since `build` text is plain.
- Results are only kept when a learner plays from the Link for StudyDesk, never in Preview or the plain share link. Say so if the designer asks why they see no results.
- Marking in the page means answers are in the file the learner downloads. For graded work, tell the designer about "Mark answers on the server" (Marking part of the Question section). Matching, categorise and data-bank questions cannot be server marked.

Question variables, if you need them in an `edit`: each question keeps `<prefix>_answered`, `_correct`, `_locked`, `_attempts`, `_triesLeft`, `_score`, `_feedback`, `_hint` and more (prefix is `q1` by default). The full table is in refs/help/question-kit.md under "Variables". Use `q1_correct` to show a Next button only when the question is right, for example a binding on `visible`.

## Changing questions that already exist

- Do not rebuild a question the designer already has. To change wording, edit the text layers in its frame (get its layers first). To change the kind, the options, hints, tries or marking, those live in the Question section of the Inspector. Tell the designer where, in plain words, unless a simple text change does it.
- Duplicated questions share variables until "Make this one independent" is used. Prefer building a new question over duplicating one.
- Restyling (colours for Right, Wrong, Missed, Picked) is the Looks part of the Question section.

## Other ways questions arrive

The designer can paste questions from Word or Excel, import a GIFT file, or take questions from a data source (a question bank), all from the Add question menu. If they have questions already written, point them there instead of retyping. See refs/help/paste-questions.md and the "Question banks from data" part of refs/help/question-kit.md.

## Pointers

- refs/help/question-kit.md: every type, setting, variable, the quiz total, banks and marking.
- refs/help/tutorial-mcq.md, tutorial-blanks.md, tutorial-order.md, tutorial-drag-match.md, tutorial-sort.md: hand-building walkthroughs.
- refs/help/results.md and refs/help/concept-results.md: Results and progress.
- refs/nodes/action-4.md: the Check answer, Reset question, Show hint, Choose option, Move item and Item dropped nodes.
