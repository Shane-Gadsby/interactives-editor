# Shared responses
Short answers people add, counted for a whole class (a word cloud, a poll) or kept for each person, switched by one setting.

A **Shared responses** data source holds short answers that the people playing add: the words in a word cloud, the votes in a poll, a list the whole class builds. The answers are **counted** and **anonymous**: a page gets how many people gave each answer, never who.

## Adding one
In the **Data** tab choose **+ Shared responses**. It is a data source like any other, in scope by its name (`responses`), so its answers can fill a list, a repeat, a chart or a [word cloud](expressions).

| In expressions | What it is |
|---|---|
| `responses.answers` | The counted answers, most given first: `text`, `count` and `weight` (the same number, so the list goes straight into `cloud(...)`) |
| `responses.ready` | True once there is somewhere that keeps the answers. Show the person's own words until then |
| `responses.mine` | What this person added, in order |
| `responses.left`, `responses.limit` | How many more this person may add, and the most they may |
| `responses.people`, `responses.total` | How many people have added something, and how many answers there are in all |
| `responses.problem` | `blocked` or `full` after an add that was refused, or empty |

Put answers in with the **Add to shared responses** node (the answer is an expression: text, or a list of texts), or `await ix.shared.add('responses', 'sleep')` in a script. **Take back shared responses** and `ix.shared.withdraw(name, answer)` take this person's own answers out again (the one named, or all of theirs); they never touch anyone else's. **Add to shared responses** continues from **Added** when something was kept and from **Not added** when nothing was (blocked, already there, over the limit, or nowhere to keep it).

## Who sees it
- **Everyone in this class**: everyone in the same course sees every answer, counted. A class is the project plus the StudyDesk course the person came from.
- **Only me**: each person only ever sees their own answers.

This is one setting on the data source, **Who sees it**. To let the same project run either way, set **Switch with** to a text variable (a choice variable named `whoSees` with the options *Only me* and *Everyone in this class*, say): it takes who sees from the variable's value, so one setting in the project, or a button the learner presses, flips the whole page. A variable that says Only me, alone or private keeps answers private; one that says everyone, class or shared shows them to the class. Answers kept for Only me are stored apart from the class's, so switching a project to the class later never shows anyone what they kept to themselves.

## Where it runs
The class lives on the server, and the server only knows who someone is on the **StudyDesk learner page** (**Share**, then **Link for StudyDesk**, see [Share link](export#share-link)). There each person's answers are kept under their signed-in account and course, and what the class sees **updates live**: when anyone in the course adds an answer, takes one back, or you hide, remove or clear one, the page is told and reads the new counts at once (within a second or so). The page is only ever told that something changed, never what, and it reads the answers the same way as always, so nothing new is shown to anyone. If the live link cannot be made (a busy server, a network that blocks it), or while the page is open in a background tab, it checks every **Look again** seconds instead, and carries on from there when the link comes back.

Anywhere else (an exported file, an ordinary share link, the page open on its own) there is no class. **Only me** still works, keeping the person's own answers in their browser. **Everyone in this class** answers `ready: false`, so the page can quietly show their own words. **Preview** pretends: the class is your sample answers plus whatever you add in the preview.

The rules are fixed when the project is shared. After you add or change a shared source, **Update to the latest version** in the Share dialog or the learner page will not know about it.

## The settings
- **Longest answer** and **Answers each**: how long an answer may be (up to 120 characters) and how many different answers one person may have in (up to 50). The same answer twice from one person counts once.
- **Show at**: an answer waits until this many people have given it, so one person's odd answer does not show on its own.
- **Blocked words**: words and phrases nobody may add. Whole words only, so blocking *ass* leaves *class* alone. Words already in stop showing as soon as they are blocked and you share again.
- **Look again**: how often the page checks for what the class has added while it is open (at least 2 seconds). On the StudyDesk learner page the live link does the work and this is only the backup, checked a sixth as often while the link is up. 0 reads once, and then the live link is not used either.
- **Poll options**: the answers a poll offers, one a line. Each is always in the list, in this order, with 0 until someone picks it, so a chart has a bar for every option from the start and keeps its shape as votes come in. Anything else people add comes after them.
- **Sample answers**: for you only. The canvas and Preview show them as a class, so a page can be laid out with nobody in it. Learners never see them.

## Moderating
Below the settings, **What the class has said** lists every answer by course, with how many people gave it and why one may not be showing (hidden by you, a blocked word, or still waiting for enough people). **Hide** keeps an answer but takes it away from the class, and **Show** brings it back. **Remove** takes it out of everyone's list (they can add it again). **Clear this course** empties the course. Only the project's **owner or a power user** sees this, since it is other people's answers; collaborators do not. It shows what the server holds, so it needs the project to be shared and to have had some answers.

## What is kept
One list of answers per person, per shared source, per project and per course, with the account that added them (never sent to anyone's page), kept until the project is deleted for good (the Bin's **Delete forever**, or after 30 days there). **Clear results** does not touch them; the moderation list does. Nothing about the person comes back in a count.

## Limits and safety
Answers are cut to the length, stripped of control and invisible characters, and a person who adds too fast is slowed (the page is told it is busy). Everything is held to what was declared when the project was shared, never to what a browser sends, and who someone is comes from their StudyDesk session.

See the **Word cloud** starter for the class cloud wired up: the same page for Only me and for the class. For a passport or badge case that several projects in a course share, one learner at a time, see [Course collections](course-collections).
