---
name: ixia-learning-design
description: Use this skill before building or changing any learner-facing activity, and whenever the designer asks about pedagogy, accessibility, contrast, feedback wording, assessment or academic integrity. It sets what a good activity looks like at UniSQ.
---

# Learning design and accessibility

The learners are UniSQ students. Many study online, part time and on phones, and many are first in family. Activities have to be quick to understand, work on a small screen and respect their time. The designer knows the subject; you turn their idea into a solid first version they can refine.

## Before you build

- Work out the purpose: recall a term, apply a rule, spot a mistake, make a decision, practise a step. If the purpose is missing and would change what you build, ask one short question. Otherwise pick the likeliest and say what you assumed.
- Keep what is there. Read the project first, build beside the designer's work in their fonts, colours, spacing and naming. Never remove or restyle their content unless asked.
- Match the scale of the request. "Add a question" is one question. "Make a quiz" with no number is 3 to 5 questions.
- Use the subject content the designer gives you. When you must invent content, keep it accurate and neutral and call it a starting point ("Here are three draft questions to edit").

## Shape of a good activity

- One idea per page. Put short instructions at the top saying what to do and how learners will know they are done.
- Practice before assessment. Let learners try, see feedback and try again. Use one attempt only when the designer asks.
- Show progress on anything longer than two pages ("Question 2 of 5", page dots or a progress bar) and always give a way back.
- End with closure: a summary, a score with what it means, or what to do next. No dead ends. A final page usually needs a "Start again" or "Back" button.
- Pick the simplest interaction that does the job. Multiple choice beats drag and drop when the skill is recognition. Use drag, sort, order or label when arranging or matching is the skill.
- Motion is for meaning (showing a process, drawing attention to a change). Keep it short and gentle.
- Practice activities should say so ("This doesn't count towards your grade"). If an activity is graded, say so in the instructions and state attempts and scoring.

## Accessibility rules (build so the checker finds nothing)

| Area | Rule |
|---|---|
| Text contrast | At least 4.5:1 against what is behind it, 3:1 for large text (24 px, or 18.66 px bold). Dark on light is the safe default. |
| Text size | Body text at least 16 px, never under 12 px. Headings clearly larger. |
| Click targets | At least 24 by 24 px, 44 px is better (the design scale's CONTROL_H), with space between them. |
| Keyboard | Everything a pointer can do, a keyboard can do. Use real buttons for actions. Anything dragged needs a click or tap way to do it too. |
| Names | Every button, link, field and clickable layer has a clear accessible name. Button text says what happens ("Check answer", "Next page"), never "Click here". |
| Pictures | Alt text says what the image shows and why it matters, in one sentence (`ariaLabel`). Decorative images get `decorative: true`. |
| Colour | Never the only carrier of meaning. Show right and wrong with a word or icon as well as green and red. |
| Motion | Nothing flashes more than three times a second. Autoplaying animation is short or can be paused. Turn on `reducedMotion` in the project settings and test the end pose (see ixia-advanced-media). |
| Audio and video | Captions for speech. No sound that plays by itself. |
| Sensors | Never require a microphone or camera to finish. Offer a typed alternative. |
| Title | Give the project a meaningful title. |

Questions made by `build` are accessible by default: radio groups, live-region feedback, keyboard and screen reader access to drags. Keep that by not deleting their parts.

## Writing for UniSQ learners

- Plain Australian English: short sentences, everyday words, active voice, "you" for the learner. Australian spelling (organise, colour, behaviour).
- Explain a discipline term the first time it appears, unless the designer's content assumes it.
- Inclusive and respectful: diverse names and contexts, no stereotypes, no assumptions about gender, culture, age, family or ability. Acknowledge Aboriginal and Torres Strait Islander perspectives respectfully when the topic touches them, and never invent cultural content.
- Encouraging, never patronising. Mistakes are part of learning.
- No em dashes. Keep on-screen text short, because learners skim.

## Look and layout in one paragraph

Follow the project's existing look. One heading per page, then instructions, then the activity, then the controls (Check, Next). Leave space and align things. StudyDesk embeds at about 800 px wide, and many learners are on phones, so use one column of cards (two at most) and keep anything important away from the edges. Exact numbers are in ixia-visual-polish.

## Assessment and academic integrity

- Where AI use matters to the task, follow the AI use level the course sets under UniSQ's AI Use in Assessment framework. Never invent the level. Ask the designer if it is not stated.
- Server-marked questions keep answers out of the page. If an activity must be trustworthy for grades, say the designer can tick "Mark answers on the server" in the question's Marking part, and that only the Link for StudyDesk can check answers. Details are in refs/help/question-kit.md under "Marking on the server".
- Results are kept only when a learner plays from the Link for StudyDesk. Preview and the plain share link keep none (refs/help/concept-results.md).

## Your reply

Say what you made, where it is (page and layer names), anything you assumed, and one suggestion for what to improve next. Two to four sentences, no technical words. When a piece of this skill shaped a choice, say so briefly ("I gave every wrong answer its own feedback so learners see why"). You cannot see the canvas, so say so if asked how it looks and suggest they check Preview.

## Pointers

- refs/help/accessibility.md and refs/help/accessibility-checker.md: what the editor checks and how it is fixed.
- refs/help/concept-reduced-motion.md: what reduced motion changes and the traps.
- refs/help/concept-a11y-names.md: accessible names for layers.
- refs/help/tutorial-accessible.md: building an accessible activity step by step.
- refs/help/before-you-share.md: the pre-publish checks.
