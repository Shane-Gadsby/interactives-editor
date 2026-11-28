# Results and progress
Report a score and completion, remember progress between visits, and see how learners did.

A project can report how a learner did and remember where they were, so closing the page does not lose their progress.

## Set it up
Open **Results and progress** in the Project section of the Inspector (click an empty part of the canvas).

| Setting | Meaning |
|---|---|
| Score from | **A score variable** (the default) or **Total of all questions**. The total adds up every question's points, out of the most they can score, so adding a question needs nothing else here (see [the whole quiz](question-kit#the-whole-quiz)). It shows only when the project has questions |
| Score variable | The number variable that holds the score |
| Top score | The score that counts as 100% (the default is 100). A score above it is reported as 100% |
| Pass mark | Tick it and give a percentage to report pass or fail as well as the score |
| Complete when | **Report result node only**, **Reaching a page**, **A variable turns on** (a true/false one), **Score meets the pass mark** or **A step-through page reaches its last step** (see [Steps](steps)). Completing reports the result once |
| Resume on the same page | A returning learner opens on the page they left |

Then tick **Remember** on each variable that should keep its value between visits (the Variables tab).

With **Total of all questions** there is no score variable or top score: the pass mark is a percentage of the questions' points, and Report result with its Score empty sends the total (the kit's own Report result nodes do that for you). A question marked on the server counts the mark the server keeps (its first go; with retakes the best or latest round, as set), so a practice go afterwards changes nothing.

## Report result and Start over
- **Report result** (action node) sends the result: *Complete* marks this attempt complete, *Score so far* reports the score without completing. Leave **Score** empty to use the score variable, or give an expression such as `correct * 10`. In scripts: `ix.report({ completed: true, score: 7 })`.
- **Start over** (action node, or `ix.startOver()`) puts every variable back to its starting value, clears remembered progress, counts a new attempt and shows the start page. Nothing after it in the same flow runs. Scripts keep their own state.
- `ix.result` reads the result as it stands, `{completed, score, max, percent, passed}`. Reading it reports nothing.

## Where it goes
The player works with no server: with nothing else around it, **Remember** keeps values in the browser and a reported result goes nowhere (the page around an iframe also receives it as a message).

Inside StudyDesk, give learners the **Link for StudyDesk** from [Share link](export#share-link) rather than the share link. It plays the same project and keeps one record per learner per course in the Toolbox's own database: completion, score, pass or fail, attempts and the remembered variables. Learners are identified by their StudyDesk session.

The same link tells the project which course it is in and the learner's first name, for [Course and learner context](course-context). It never passes a username or email, and none of it goes into results or Insights. It also counts what learners do, for [Insights](insights).

Someone opening it with no session plays as normal, and their progress stays in their own browser. Nothing is sent to the LMS gradebook yet.

A slow server is waited for: the project stays on its loading screen until the saved values arrive, however busy the StudyDesk page is. So is StudyDesk itself: the page waits to know who the learner is before it loads or saves anything, so their work is there on every load and not only the ones where StudyDesk was quick. That wait is the project's **Wait for user session before start** setting ([Project settings](project-settings)): ticked, it waits for as long as it takes; unticked, the project starts at once and a learner whose session arrives late starts from nothing that visit. If the server fails to give them back at all, the project starts from its starting values and saves nothing over what was kept, so the learner's work is there on their next visit. A save that doesn't get through is tried again.

Projects shared before 19 November 2026 gave up on a slow server after a second and a half, and could start a returning learner over with an empty plan. The Link for StudyDesk now fetches the saved values as soon as it opens, which makes that much rarer, but to fix it for good, open the project and press **Update** in [Share link](export#share-link) once.

## Save user data and Load user data
**Remember** keeps a variable's value all the time, on its own. When you'd rather choose the moment, use the two action nodes instead: **Save progress** keeps the variables you tick, as they are right then (say, when the learner presses *Submit*), and **Load saved progress** puts them back on a later visit. Put the load in **Before activity loads** so the values are in place before anything shows. *Load saved progress* goes on from **Loaded** when anything came back, and from **Nothing saved** on a first visit, so you can set up a fresh start there.

Most of the time you don't need the nodes. Tick **Save as user data** on a variable in the [Variables](variables) tab and it is loaded before the project starts and saved as it changes.

Both ways go to the same places as remembered progress. On the **Link for StudyDesk** it is one record per learner per course, kept by their StudyDesk session. With no session, or in an export, it is kept in the browser. Each save only changes the variables it names.

**Preview** keeps saved data and remembered progress too, for that project in this browser. Closing and reopening Preview is like a learner coming back. **Forget saved data** in Preview's bar starts you again as a new learner.

User data is kept apart from remembered progress and from results, so **Clear results** and **Start over** leave it alone. It goes when the project goes for good: 30 days after it's deleted, or straight away with **Delete forever**.

## See the results
**View results…** in this section, or **Results…** in Share link, shows learners, the percentage who completed and passed, the average best score and attempts, and a row per learner. The owner and people invited to collaborate can see it. **Export CSV** downloads every learner's record as a spreadsheet: username, name, course, completed, passed, attempts, best and last score and percentage, and when they were last active (the list in the dialog shows the latest 200). **Clear results** deletes every record for the project (handy after testing); only the owner can use it (collaborators see it greyed out), since it can't be undone.

## Collect responses, one row each
A score says how someone did. For what they actually did (a survey's answers, where each card went in a card sort, what they picked in a configurator) use the **Send a response** node. Its **Values** are named values, `{ q1: answer1, mood: mood }`, or a list of records such as `cards.map(c => ({ card: c.name, group: c.group }))`. **Kind of response** (`card-sort`, `survey`) keeps two kinds apart in one app.

Each response is a row in the **Responses** tab of **Results**, with when it came and the course. **Download** gives:

- **CSV**: a row per response, a column per value.
- **CSV, a row per item**: a row per record of the list in each response, the response's other values repeated on each. One row per card placed is the shape card sort analysis tools take.
- **JSON**: every response as it was sent.

Responses are kept without names to start with: each person's are under a code that is the same for them every time and says nothing about who they are, which is what a survey or a card sort usually wants. Tick **Responses with names** in Project settings, and **Update** the share, to keep names. A person can send up to 300 an hour. In Preview and a downloaded HTML file there is no server, so the browser keeps the last 200 instead.

## Good to know
- A result is what the learner's browser says. It is good for tracking progress, not for marks that must be tamper-proof, unless the questions are set to **Mark answers on the server**. Then the server marks them, keeps the tries and writes the result itself, and any result the browser reports is ignored for that project. See [Question kit](question-kit).
- The project's share link has to be on: results are only kept while it is.
- **Update to the latest version** in Share link after changing these settings, so the link plays the new version.
