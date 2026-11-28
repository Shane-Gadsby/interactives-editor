---
name: ixia-activity-patterns
description: Use this skill when the designer asks for a familiar kind of activity such as flip cards, a branching scenario, a step-through explainer, an annotated picture with hotspots, comparison cards, drag-and-drop sorting or a reflection journal. It describes the gold-standard composition of each in terms of the build and edit tools.
---

# Activity patterns

These are the compositions the editor's own starter packs use (78 branded starters, listed in `refs/help/branded-starters.md`, with hand-building walkthroughs as `refs/help/tutorial-*.md`). Build the pattern from the designer's content, name every layer, and say what you assumed. Check what the project already has first, then add beside it.

General recipe: put the content in a list variable (so adding a line adds a card), draw one template, repeat it, and use the built-in selection, disclosure or question features instead of hand-wired nodes. Use `build` for the pages, text, buttons and questions, and `edit` for the parts below that `build` cannot say. Practices from ixia-learning-design apply: one idea per page, instructions up top, feedback that explains, a way back, closure at the end.

## 1. Flip cards (term and meaning)

One card layer drawn once per item, turned over by the repeater's own selection.

1. `add_variable {name: "cards", type: "list", initial: "[{\"front\":\"Plagiarism\",\"back\":\"Presenting someone else's words or ideas as your own.\"}, ...]", ref: "cards"}` and `add_variable {name: "flipped", type: "list", initial: "[]", ref: "flipped"}`.
2. A group `Cards` holding one frame `Card` (about 220 by 150, `cornerRadius` 12, tokens for fill) with two texts: `Card front` with text `{item.front}` and `Card back` with `{item.back}`. Give the group `repeat {items: "cards", layout: "grid", columns: 3, gap: 20, select: {mode: "several", variable: "$flipped"}}`.
3. Bindings: `Card back` `visible: "isSelected"`, `Card front` `visible: "!isSelected"`, and `Card` `fill.color: "isSelected ? \"token:color/surface\" : \"token:color/primary\""` with text colours that stay readable on both (on-primary on the front). Give `Card` `ariaDescription: "Press Enter to turn the card over"`.
4. A button `Turn all back` with `event.pointer` then `action.resetVariables {variables: [flipped]}`.
5. Six to eight cards. For a stack stepped one at a time use a `card` number variable and `action.setVariable {op: "next"/"previous", first: "0", last: "cards.length - 1"}`.

Walkthrough: `refs/help/tutorial-flipcards.md`.

## 2. Branching scenario

Each page is a scene, each choice is a button that adds points, notes the path and goes to a page.

- `build` the pages: a situation text, a "What do you do?" heading, two or three choice buttons per page, and end pages (`does` such as `["add 3 to score","go to the page called Sam replies"]`, `"start over"` on a Start again button). See the worked example in ixia-blueprint.
- Track the path: `add_variable {name: "taken", type: "list", initial: "[]"}`, then each choice also pushes words: `action.setVariable {variable: "taken", op: "push", value: "\"Asked Sam\""}`. A text layer reads `Path so far: {taken.length ? taken.join(" > ") : "just starting"}`.
- Pick the ending from the score on the last choices: `add_variable {name: "ending", type: "string", formula: "score >= 5 ? \"A strong outcome\" : score >= 3 ? \"A mixed outcome\" : \"A learning moment\"", live: true}`, and on the final choices use `action.artboard {to: "expression", expr: "ending"}`. Name the end pages exactly as the formula says.
- Show `Score: {score} out of 6` and the path on each ending, plus Start again. Three to five scenes is enough. Make every ending say why, not just win or lose.

Walkthrough: `refs/help/tutorial-branching.md`.

## 3. Step-through explainer

Show one idea at a time, with Back and Next and "Step 2 of 4".

- Page per step, with the open page's master carrying Back and Next: one `build` with a page per step and buttons `go to the next page` and `go back to the previous page`. Add "Step {pageNumber} of {pageCount}" text with `edit` (those two values come from the page navigation).
- One page, several steps: a number variable `step` (initial 1) and each step's layers with `bindings {visible: "step === 2"}`. Next is `action.setVariable {variable: "step", op: "next", first: "1", last: "4", ends: "stop"}`, Back is `op: "previous"`. Say `"Step {step} of 4"` with `say` on the node so screen readers hear the change.
- Animated steps: one timeline with a marker at the end of each part, and the artboard's Steps setting turns the markers into Next, Back and a step bar. That setting is switched on in the editor's Steps section, so tell the designer if they ask for it. See `refs/help/steps.md` and ixia-advanced-media.
- Finish with a short check question and a summary page.

## 4. Annotated picture with hotspots (click to reveal)

A picture with numbered points. Each opens a panel with a heading and text, and a point shows it has been opened.

- Variables: `spots` (list of `{title, body}`), `seen` (list of false, one per spot), `explored` (number, `formula: "seen.filter(s => s).length"`, `live: true`), `open` (boolean false), `current` (number 0).
- Layers: an `image` (or a placeholder, with `ariaLabel` saying what it shows), a frame `Points` over it holding point frames `Point 1` to `Point n`. Each is 44 by 44, `cornerRadius` 22, `role: "button"`, `ariaLabel` like "Point 1: Evaporation", numbered text inside. The designer drags the points to the right spots, so place them evenly and say so.
- One click flow serves every point: `event.pointer {target: Points, type: "click", childrenOnly: true}`, then `action.setVariable {variable: current, op: set, value: "event.childIndex"}`, then `action.setVariable {variable: seen, op: setItem, index: "event.childIndex", value: "true"}`, then `action.setVariable {variable: open, op: set, value: "true"}`.
- One dialog frame `Detail panel`, `dialog {modal: true, scrim, closeOnEscape: true, openVariable: open}`, with `{spots[current].title}`, `{spots[current].body}`, and a Close button (`action.setVariable open false`). Give it an `ariaLabel`.
- A text `{explored} of 5 explored` and a progress layer bound to `explored`. Points show a ring when `seen[i]`.

Walkthrough: `refs/help/tutorial-reveal.md`. A different, simpler version: buttons that `show` and `hide` named texts (ixia-blueprint example 3).

## 5. Comparison cards

Two or three options side by side (two at 800 px wide, or stacked on a phone).

- A list `options` of `{title, pros, cons}` objects, a repeater frame with `layout: grid, columns: 2`, and one card template: title heading, two short texts, a divider. Keep text short and parallel, with the same fields on every card.
- Or a two-picture "before and after": a clipping frame (`clip: true`) whose width is bound to a number variable that a draggable handle writes. See `refs/help/tutorial-compare.md` (this one needs a drag layer, see ixia-advanced-media).
- End with a prompt: "Which would you choose and why?" in an input, or a question about the difference.

## 6. Drag-and-drop sort

For sorting items into groups, use a native `categorise` question through `build` (groups and cards, with feedback). It is accessible, marked and reports to Results. For matching terms to definitions use `matching`. For putting steps in order use `ordering`. Only hand-build drag layers (ixia-advanced-media) when the activity is not marking an answer, such as a labelled diagram with free placement. See ixia-questions and `refs/help/tutorial-sort.md`.

## 7. Reflection journal

Prompts with text boxes that remember what was written.

- Variables: a `string` variable per prompt (`happened`, `learnt`) with `user_data: true` so the writing is saved for the learner and put back before the project starts.
- Per prompt: a heading with the question, an `input` layer with `inputType: "textarea"`, a placeholder and `ariaLabel`, `bindings {value: "happened"}` with `bindingModes {value: "both"}` (typing writes the variable), and a text `{wordCount(happened)} words`.
- A welcome line: `{userData.restored > 0 ? "Welcome back. Your writing is just as you left it." : "Your writing is saved as you type, so you can come back to it."}`.
- A final page with a worked-out `reflection` variable joining the answers (`"WHAT HAPPENED\n" + (happened.trim() || "(Not written yet)") + ...`, `live: true`) and a Download button, `action.saveFile {name: "\"My reflection\"", text: "reflection", mime: "text/plain"}`.
- Use a Gibbs-style order if the designer has no structure: what happened, how I felt, what I learnt, what I will do next. Offer a model answer or checklist to compare with. Say writing is private unless they add something that shares it.

Walkthrough: `refs/help/tutorial-journal.md`.

## When none fits

Describe the closest pattern in one sentence, build the pieces you can with `build`, and say what is left for the designer. Do not leave a half-built substitute. Starters can also be copied by the designer from Templates, then Branded starter packs (`refs/help/branded-starters.md`, `refs/help/templates.md`).

## Pointers

- refs/help/tutorial-flipcards.md, tutorial-branching.md, tutorial-reveal.md, tutorial-compare.md, tutorial-sort.md, tutorial-journal.md, tutorial-accordion.md, tutorial-diagram.md, tutorial-carousel.md, tutorial-progress.md
- refs/help/repeaters.md, variables.md, dialogs.md, steps.md
