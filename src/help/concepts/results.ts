import type { Concept } from './index';

export const concept: Concept = {
  order: 180,
  area: 'construction',
  topic: {
    id: 'concept-results',
    title: 'Report result, and what StudyDesk sees',
    group: 'Concepts',
    summary: 'Report result sends a score and completion to the Toolbox\'s results for the project. Only the Link for StudyDesk keeps them; Preview and the plain share link keep none.',
    keywords: 'concept report result score grade completion complete pass fail studydesk results view results no grade preview share link more than once attempts best last record learner staff',
    body: `A project says how a learner did with **Report result**: a node in the Interactions graph, or the **Report result** setting on a question. It sends a score (and, with *Complete*, that this attempt is finished). What the score is out of, the pass mark and when the project counts as complete without a node are set in **Results and progress**, a section of the Properties panel below **Project** (click an empty part of the canvas to see it).

![The Results and progress section: Score variable, Complete when set to Report result node only, Resume on the same artboard, and the View results… button.](help/concept-results-section.png)

Where the result goes depends on how the project was opened:

- **From the Link for StudyDesk**, by someone with a StudyDesk session: it is kept as one record per person, per course, in the project's results. You see them with **View results…**.
- **In Preview, from the plain share link, or in an exported file**: nothing is kept anywhere. The project runs the same, and the result goes nowhere.

From the Link for StudyDesk, the results live in the Toolbox under the project, not in the StudyDesk gradebook.

## Where people get caught out

- **"I tested in Preview and there is no result."** Preview never sends one. To see a real record, play it from the Link for StudyDesk while signed in, then open **View results…**.
- **"I gave students the share link and nothing came back."** The share link keeps no results. Use the **Link for StudyDesk** from Share.
- **"Does reporting twice count twice?"** No. Each report updates the same record: the latest score is kept, the best is kept separately, and once someone has completed or passed, that stays. Report *Score so far* along the way if you like, and *Complete* at the end.
- **"There are rows for me and my colleagues."** Anyone with a session who plays it from the Link for StudyDesk makes a record, staff included. **Clear results** (owner only) empties them after testing, and can't be undone.
- **"Results stopped after I changed the settings."** Results are only kept while the share link is on, and the link plays the version you last published. Press **Update to the latest version** in Share.

## How to tell what is going on

- In Preview, **Variables (live)** shows the score variable as the learner earns it, which is what a report would send.
- **Results and progress** says how many variables are remembered between visits, and **View results…** lists every learner with their completion, pass, best and last score.
- A project whose questions are marked on the server ignores what the browser reports, and keeps the server's marks instead.

**More:** [Results and progress](results), [Report result and Start over](results#report-result-and-start-over), [Where it goes](results#where-it-goes), [The Link for StudyDesk](export#the-link-for-studydesk), [A multiple choice question](tutorial-mcq), [Tutorial 5](tutorial-publish).`,
  },
};
