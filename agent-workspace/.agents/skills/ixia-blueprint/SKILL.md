---
name: ixia-blueprint
description: Use this skill when the designer wants a whole page, several pages, a quiz, a branching scenario or a simple explainer made from scratch, or content added to an existing page. It teaches the Blueprint, the argument of the build tool, with three worked examples.
---

# The Blueprint (the `build` tool)

`build` takes one Blueprint object and turns it into pages, native question cards, buttons and simple behaviours, in the look of the open page (its master, background and title). It is much better than assembling the same thing layer by layer, because it uses the editor's own question kit and page styling.

Pass the Blueprint as the tool's argument (you do not write a fenced block). Then give the designer a short plain-words summary.

## When to use build, and when not

- Use `build` for new pages, questions, headings and text, lists, buttons that go to pages, show or hide, scores and picture placeholders.
- Use `edit` (see ixia-edit-ops) for anything precise: exact colours and positions, auto layout, accordions and tabs, repeaters, overlays, timelines, drag and drop, themes, scripts. A Blueprint can carry `edit` changes in `raw`, but only as a last resort.
- Make every page you need in one Blueprint, so buttons can point at pages made in the same go.
- Before building, read the outline you were given. A page name that already exists adds elements below what is on it. A new name makes a new page.

## Shape

Every part is optional.

```
{
 "variables": [{"name": "score", "type": "number", "initial": 0}],
 "pages": [{"name": "Quiz", "title": "Check your understanding", "elements": [ ... ]}],
 "behaviours": [{"on": "Start button", "page": "Page 1", "does": ["when clicked, go to the page called Quiz"]}],
 "raw": [ ... edit changes ... ]
}
```

Pages
- `name`: an existing page (any case) adds the elements below what is on it. A new name makes a new page.
- `rename`: a new name for an existing page. `like`: the page to copy the look from. `after`: the page the new one follows. `title`: the heading of a new page.

Elements run top to bottom in one column
- `{"type":"heading","text":"...","level":1}` (level 1 to 3)
- `{"type":"text","text":"...","size":"normal","align":"left"}` (size small, normal or large; align left, center or right)
- `{"type":"list","items":["...","..."],"ordered":false}`
- `{"type":"image","alt":"what the picture shows"}` is a grey placeholder with its alt text. The designer drops the picture in. Say so in your reply.
- `{"type":"button","label":"Next","does":"go to the next page"}`
- `{"type":"shape","shape":"rect","w":200,"h":100,"fill":"surface"}` (shape rect or ellipse; fill surface, muted, accent or primary)
- `{"type":"row","items":[ ...elements... ]}` puts elements side by side. No questions inside a row.
- `{"type":"question", ...}` (see below, and ixia-questions)
- Any element may also have `name` (how you refer to it later), `ref` (a short key, used as "$key" in raw changes) and `does`. Add `x` and `y` to put one at an exact spot instead of in the column.

Questions: `kind` is one of single, multiple, truefalse, blank, ordering, matching, categorise. The fields for each are in ixia-questions. There is no hotspot kind in `build`.

## What things do (`does` and `behaviours`)

`does` is one short phrase, or a list with one step per item. The first item may start with a trigger. Clicked is the default.

- Pages: go to the next page | go back to the previous page | go to the page called X | start over
- Show and hide: show X | hide X | toggle X | show only X
- Numbers and switches: add 1 to score | subtract 1 from lives | set score to 0 | turn sound on | reset score
- Screen readers: say well done | say "Moving on"
- Look: change the text of X to "..." | make X red | set the opacity of X to 50 percent
- Other: play the sound called X | play the animation called X | open https://example.com
- Triggers (first item only): when clicked | when hovered | after 5 seconds | when the page opens | when score reaches 5 | when the Enter key is pressed
- The first item holds the trigger and its first action together, joined by a comma: "when the page opens, hide Condensation text". Each item after it is one more action.
- Condition: only if score is at least 3, otherwise ...

X is the exact name of a layer or page, in the project or in this Blueprint. Declare every number or switch you use in `variables`. Keep steps short and one thing each. A step the editor cannot read comes back to you as a problem: fix it and build again. `behaviours` attaches the same phrases to a layer that already exists: `on` is its name, `page` the page it is on.

"show only X" hides X's siblings (the other layers in the same group), which in a one-column page can include your headings. For a click-to-reveal set, spell out each `show` and `hide` instead.

## Rules

- Plain, short, friendly words. Real, useful content, never "Lorem ipsum" or "Click here".
- Reach for elements and questions first. `raw` is the last resort.
- Use `raw` with `ref` names: give an element `"ref":"hero"` and a raw change can say `{"op":"set_props","id":"$hero","props":{"opacity":0.9}}`. The ops are in ixia-edit-ops.
- The compiler also reads a few extra question fields: `shuffle` (true or false), `feedbackPartial`, `checkLabel` (the Check button's words), `dropFeedback` (categorise: answer each drop at once) and `answerBy: "drag"` (blank questions answered by dragging words). Options may be plain strings.

## Worked example 1: a quiz question set

```
{"pages":[{"name":"Referencing quiz","title":"Check your understanding of referencing","elements":[
 {"type":"text","text":"Answer each question and press Check answer. You can try again. This quiz is practice and does not count towards your grade."},
 {"type":"question","kind":"single","name":"Question 1","prompt":"Which of these is an example of paraphrasing?",
  "options":[
   {"text":"Copying a sentence and putting it in quotation marks","feedback":"That is a direct quote. Paraphrasing means using your own words."},
   {"text":"Explaining an author's idea in your own words and citing them","correct":true,"feedback":"Yes. Your own words plus a citation is a paraphrase."},
   {"text":"Changing two words in a sentence and citing it","feedback":"Too close to the original. Rewrite the whole idea."}],
  "hints":["A paraphrase still needs a citation."],
  "feedbackCorrect":"Well done. A paraphrase is your own wording of someone else's idea.",
  "feedbackIncorrect":"Not quite. Think about whose words are on the page.",
  "attempts":2,"points":1,"report":"complete"},
 {"type":"question","kind":"truefalse","name":"Question 2","prompt":"You only need to cite a source when you quote it word for word.","answer":false,
  "feedbackCorrect":"Right. You also cite when you paraphrase or use someone's idea.",
  "feedbackIncorrect":"Not quite. Ideas need citing too.","attempts":2,"points":1,"report":"complete"},
 {"type":"question","kind":"blank","name":"Question 3","prompt":"Complete the sentence.",
  "blanks":[{"label":"The full details of every source you cited go in the","answers":["reference list","references"]}],
  "feedbackCorrect":"Yes, the reference list sits at the end of your work.",
  "feedbackIncorrect":"Look at where the full details of each source are collected.","attempts":2,"points":1,"report":"complete"}
]}]}
```

## Worked example 2: a branching decision

```
{"variables":[{"name":"score","type":"number","initial":0}],
 "pages":[
  {"name":"Quiet group","title":"Your group has gone quiet","elements":[
   {"type":"text","text":"Your assignment is due on Friday. Sam has the data analysis but has not posted for a week."},
   {"type":"heading","text":"What do you do?","level":2},
   {"type":"button","label":"Message Sam and ask how it is going","name":"Message Sam","does":["add 3 to score","go to the page called Sam replies"]},
   {"type":"button","label":"Write Sam's section yourself","name":"Write it yourself","does":["go to the page called Learning moment"]}]},
  {"name":"Sam replies","title":"Sam replies","elements":[
   {"type":"text","text":"Sam has been unwell but can finish most of it by Thursday morning."},
   {"type":"button","label":"Agree a draft by Wednesday night","does":["add 3 to score","go to the page called Strong outcome"]},
   {"type":"button","label":"Offer to take half the section","does":["add 1 to score","go to the page called Strong outcome"]}]},
  {"name":"Strong outcome","title":"A strong outcome","elements":[
   {"type":"text","text":"You raised it early and the work stayed fair."},
   {"type":"button","label":"Start again","does":"start over"}]},
  {"name":"Learning moment","title":"A learning moment","elements":[
   {"type":"text","text":"Working alone left the group in the dark. Next time, check in early."},
   {"type":"button","label":"Start again","does":"start over"}]}
 ]}
```

To pick an ending from the score with one button, use a condition: `"only if score is at least 4, go to the page called Strong outcome, otherwise go to the page called Learning moment"`.

## Worked example 3: an interactive explainer

```
{"pages":[{"name":"Water cycle","title":"The water cycle","elements":[
 {"type":"image","alt":"A diagram of the water cycle showing the sea, a cloud and rain","name":"Water cycle diagram"},
 {"type":"text","text":"Select a stage to find out what happens.","size":"small"},
 {"type":"row","items":[
  {"type":"button","label":"Evaporation","name":"Evaporation button","does":["show Evaporation text","hide Condensation text"]},
  {"type":"button","label":"Condensation","name":"Condensation button","does":["hide Evaporation text","show Condensation text"]}]},
 {"type":"text","name":"Evaporation text","text":"The sun warms the sea. Some water turns into vapour and rises."},
 {"type":"text","name":"Condensation text","text":"Higher up it is cooler. The vapour turns into droplets that gather as clouds."}
]}],
 "behaviours":[{"on":"Evaporation text","page":"Water cycle","does":["when the page opens, hide Condensation text"]}]}
```

For anything richer (a dialog per point, a count of what is explored, flip cards from a list), switch to `edit`. See ixia-activity-patterns.

## Pointers

- refs/help/build-it.md and refs/help/concept-events-actions.md: how the editor builds the same things by hand.
- refs/help/question-kit.md: everything a question card can do after `build` makes it.
