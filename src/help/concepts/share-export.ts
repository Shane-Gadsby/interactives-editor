import type { Concept } from './index';

export const concept: Concept = {
  order: 190,
  area: 'interface',
  topic: {
    id: 'concept-share-export',
    title: 'Share gives links, Export gives files',
    group: 'Concepts',
    summary: 'Share holds links and people: the share link, the Link for StudyDesk, collaborators and reviewers. Export only ever makes a file, which is a copy that never changes again.',
    keywords: 'concept share export which link studydesk link share link review link embed code iframe single html file package download students results grade update latest version snapshot old version fixes',
    body: `The top bar has two buttons that people mix up.

- **Export** makes **files**: a single HTML file, a project package, pictures, video and so on. A file is a copy of the project at the moment you downloaded it. Nothing you change afterwards reaches it.
- **Share** holds **links and people**. Nothing under it downloads anything.

The first line of the Export menu, **Want a link instead of a file?**, opens **Share…** for you, so if a link or a StudyDesk embed code is what you were after you land in the right place.

![The Export menu: Want a link instead of a file? first, with a line saying Share… asks where people will use it, then Single HTML file, Project package, Project JSON, the public interface reference and TypeScript definitions, Lottie, dotLottie, PNG and SVG pictures, and Video, GIF or frames.](help/concept-share-export-export.png)

Share has four entries:

- **Share…** asks **Where will people use it?** and gives you the one thing to copy for the answer: the embed code for a StudyDesk page (the **Link for StudyDesk**, which keeps each learner's results), the plain share link, the project name for the gradebook, or the file downloads.
- **Invite to collaborate…** is for people who will edit it with you. It also has the **Turn on live collaboration** button, for seeing each other's changes as they happen.
- **Save as template…** is for people who will start their own project from it.
- **Share for review…** is a link for reviewers to look and comment, not for learners.

![The Share menu with its four entries: Share, Invite to collaborate, Save as template and Share for review, each with a line saying who it is for.](help/concept-share-export-share.png)

## Where people get caught out

- **"I sent the review link to the students."** Anyone who has the review link and signs in can read the whole project and leave comments on it. It keeps no results. Learners need **Share…**, not **Share for review…**.
- **"Nobody's results are coming through."** The plain share link plays the project but keeps nothing for learners. In a StudyDesk page, choose **In a StudyDesk page, and keep learners' results** and paste the code it gives you: that uses the **Link for StudyDesk**, the same project with each signed-in learner's score and progress kept.
- **"I fixed it but the learners still see the old one."** A share link is a snapshot of when it was made. Open **Share…** and press **Update to the latest version**. Every page that holds the link, including the StudyDesk embed, shows the new version without being touched.
- **"I fixed it but the file I uploaded is still wrong."** An exported HTML file never updates. Export it again and upload the new file, or use a link instead.
- **"Can someone edit it from the link?"** No. Share links and review links can't change the project. Only people you invite can.

## How to tell what is going on

- **Share…** remembers your answer for the project in this browser, and says under the thing to copy what to do with it. Until the link exists, the box under your answer offers **Create the link** instead.

![The Share dialog: Nothing to look at before sharing, then Where will people use it? with five choices (StudyDesk page with results, StudyDesk page without, gradebook, anyone with a link, a file) and, under them, Create the link.](help/concept-share-export-where.png)
- A line at the top of the dialog says whether there is anything to look at first, from [Before you share](before-you-share).
- **Results…**, under **More ways to share** once the link exists, shows how learners did. If it is empty, the learners aren't using the Link for StudyDesk.

**More:** [Where will people use it?](export#where-will-people-use-it), [The Link for StudyDesk](export#the-link-for-studydesk), [Updating, reverting and turning off](export#updating-reverting-and-turning-off), [The review link](comments#the-review-link), [Exporting](export), [Results and progress](results). [Tutorial 5](tutorial-publish) walks through exporting, sharing and inviting people.`,
  },
};
