import type { Concept } from './index';

export const concept: Concept = {
  order: 170,
  area: 'construction',
  topic: {
    id: 'concept-user-data',
    title: 'What is remembered, for whom, and for how long',
    group: 'Concepts',
    summary: 'Variables start again on every visit unless you ask for them to be kept. Kept values are per person, per course and per project, and only reach the server from the Link for StudyDesk.',
    keywords: 'concept remember save user data keep between visits next week come back lost answers reset old values testing forget saved data guest browser per course per person',
    body: `Every variable starts at its starting value each time the project opens. Nothing is kept from last time unless you ask for it, in one of two ways (both under **Options** on a variable in the Variables tab):

- **Remember** keeps the value as part of the learner's progress. A **Score** variable (from **+ Add variable**) has it ticked already. **Start over** puts remembered values back to the start.
- **Save as user data** keeps the value for that person on its own: it is put back before the project starts, and saved a moment after it changes. Use it for the learner's own work, like journal answers. **Start over** and **Clear results** leave it alone.

![A variable's Options opened in the Variables tab: Remember (Keeps the value when the learner comes back) and Save as user data (Saves the value for each person on the server, so it follows them to another device).](help/concept-user-data-options.png)

Kept values belong to **one person, in one course, in one project**. The same learner in another course starts fresh, and so does the same course in a copy of the project.

## Where it is kept

- **From the Link for StudyDesk**, with a StudyDesk session: on the server, so it follows the learner to another computer.
- **With no session, from the plain share link, or in an exported file**: at best in that browser only. Another browser or device starts fresh.
- **In Preview**: in your browser, for this project, so closing and reopening Preview is like a learner coming back.

## Where people get caught out

- **"Their answers were gone the next week."** The variable had neither **Remember** nor **Save as user data** ticked, or they opened it from a link that keeps nothing on the server.
- **"I see my old answers when I test."** Preview, and the Link for StudyDesk, are keeping your own values from last time. In Preview, **Forget saved data** in the bar starts you as a new learner. **Restart** does not: it runs the project again for the same learner.
- **"Guests lose everything."** Someone with no StudyDesk session still plays as normal, but what they do is kept in their browser at best, never on the server.
- **"It isn't saved inside my embedded page."** An embedded page (an instance) keeps no user data. Tick it on a variable in the main project.

## How to tell what is going on

- In Preview, **Forget saved data** only appears once something has been kept, so seeing it tells you a save happened.
- **Variables (live)** in Preview shows the values the project opened with. If they aren't the starting values, they came back from a save.
- \`userData.loaded\` is true once saved values have been looked for, and \`userData.restored\` is how many came back. Put \`{userData.restored}\` in a text layer while testing.

**More:** [Save as user data](variables#save-as-user-data), [Save user data and Load user data](results#save-user-data-and-load-user-data), [Where it goes](results#where-it-goes), [A reflection journal that remembers](tutorial-journal).`,
  },
};
