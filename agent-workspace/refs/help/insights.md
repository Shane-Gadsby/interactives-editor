# Insights: what learners did
See where learners go, click and struggle: pages reached, a click heat map, steps, answers to each question, what they did with every control, and your own records and events, as counts.

The **Insights** tab (bottom panel) answers "where do learners get stuck?" with counts. It shows nothing until learners have played the project from the **Link for StudyDesk** (see [Share link](export#share-link)) while signed in to StudyDesk.

## What you see
- **Learners, visits, clicks, answers checked.** A learner is one StudyDesk user however many times they came back. A visit is one time the page was opened.
- **Pages reached.** A bar per page, in the project's order, of how many different learners saw it, and what share of the people who reached the start page that is. A big drop between two bars is where people left, or where nothing led them on.
- **Steps reached** for each step-through page, so you can see which step people stopped at.
- **One card per question.** How many learners answered, how many checks were right, how many were right the first time, and a bar for how often each option was chosen (the right answer in green). An option nobody chose shows as zero. Typed and ordered answers are only counted as right or wrong.
- **Where learners clicked.** The buttons, links and clickable layers learners clicked most. Tick **Click heat on the canvas** to draw every click over the page you are editing: blue is a few, red is many. Clicks that land on nothing show up too, which is how you find the thing people expected to be clickable.
- **What else learners did.** Every other thing on a page that takes an action: a tick box, slider or dropdown changed (and what to), a text box changed, a layer dropped (where, and whether the zone took it), a video played, paused or watched to the end, and an accordion section, a tab or a dialog opened.
- **Your records**, from the *Record* node and `ix.record`.
- **Your analytics events**, from the *Send analytics* node, with how often each value came up.
- **Courses**, when the project is used in more than one.

Choose how far back to count (7 days to all time) and press **Refresh**. **Export CSV** downloads every count in a spreadsheet-friendly file.

## Your own records
Add a **Record** action node (Interactions tab) anywhere in a flow: give it a **Name** ("opened hint") and, if you like, a **Value** (an expression: a choice, a level, a score band). Insights counts how often each name happened, how many learners it happened to, and how often each value came up. In scripts: `ix.record('chose route', 'B')`. Names are cut at 60 characters and values at 120.

## Send analytics
The **Send analytics** node (Interactions tab, Results and data) sends a named event with a few values of your choosing: a **Name** ("finished level") and **Data**, a formula such as `{level: level, time: seconds}`. It goes to the same analytics as everything else, with the learner and the course on it, and Insights counts it by name.

- **Leave Saved and Not saved alone** and it joins the queue every Toolbox app reports through, which is sent every few seconds. The flow carries straight on.
- **Join something to Saved** (or **Not saved**) and it is sent at once and waited for instead. **Saved** runs once the row is kept, with `event.ids` and `event.id` to hold on to. **Not saved** runs with `event.reason`: nobody is signed in, it is a preview, there is no page to keep it, recording is off, or this visit has sent too many. The bottom port still continues straight away.

Use **Record** for a simple count. Use **Send analytics** when you want several values together, or need to know it arrived. In the editor's Preview nothing is sent: Saved runs with a pretend id so you can try what follows it.

## What is and is not recorded
- Automatic records: a page was shown, a click (where, and which button or link), a step was reached, a question was checked (right or wrong, which options were chosen), a control was changed, a layer was dropped, a video was played, paused or finished, and a section or dialog was opened.
- Nothing a learner types is recorded. A typed answer is only marked right or wrong, and a text box only says that it was changed.
- Insights shows counts and numbers of different learners. It never lists a learner. With only a handful of learners a count can be one person, so wait for more before drawing conclusions.
- The records go to the Toolbox's usual analytics as the learner's StudyDesk session (the same way every other toolbox item is counted), so the people who read those reports can see which user they came from. Tell learners what is counted, the way you would for any other usage statistics.
- A page load sends at most 500 records, 300 of them clicks.
- Switch recording off, or any kind of automatic record, in **Learner records** in the Project section (click an empty part of the canvas). Off means off: Record and Send analytics nodes send nothing either.
- The player on its own sends nothing anywhere. A standalone export, the editor's Preview and a plain share link keep no records. Only the Link for StudyDesk passes them on.

## Good to know
- Records are the learner's browser's word, so they are good for seeing patterns, not for proof.
- Records reach the suite analytics only when learners open the project from the **Link for StudyDesk** (see [Share link](export#share-link)), signed in to StudyDesk. Use **Record** nodes for anything of your own, and keep anything personal out of their names and values.
- A very busy project's counts cover only the most recent records. Choose a shorter period to cover all of it.
- Only the project's owner (and power users) can open Insights.
- **Update to the latest version** in Share link after changing record settings or adding Record nodes, so the link plays the new version.
