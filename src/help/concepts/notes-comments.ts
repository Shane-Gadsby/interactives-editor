import type { Concept } from './index';

export const concept: Concept = {
  order: 210,
  area: 'interface',
  topic: {
    id: 'concept-notes-comments',
    title: 'Sticky notes are for editors; comments are for reviewers',
    group: 'Concepts',
    summary: 'A note is part of the project, for whoever edits it next, and reviewers never see it. A comment is a conversation kept beside the project, for reviewers and the people answering them.',
    keywords: 'concept note notes sticky comment comments review reviewer feedback instructions which one cannot see hidden collaborator co-author template explanation pin thread resolve',
    body: `The editor has two ways to leave words on the canvas, and they go to different people.

- A **note** (the **Note** tool, <kbd>S</kbd>) is a sticky note that is part of the project. It goes wherever the project goes: copies, templates, remixes, and everyone editing it live. It is for the people who **make** the project. Nobody who plays it ever sees it: not Preview, not a share link, not an export, and not the review page either.
- A **comment** (the **Comment** tool, <kbd>C</kbd>) is a conversation pinned to a layer or a spot, kept on the server beside the project, not in it. It is for **reviewing**: replies, **Resolve**, **Assigned to**, @mentions and notices. Reviewers reach it through the review link; editors see it in the **Comments** tab.

![A sticky note on the page with a pin numbered 1 beside the box, the notes eye button with its badge of 1 and the Comments tab with a badge of 1.](help/concept-notes-comments-canvas.png)

## Where people get caught out

- **"The reviewer says there were no instructions."** You wrote them as notes, and notes are taken out of the review page. Leave reviewers a comment instead, or put the instructions in the message with the review link.
- **"My co-author never saw my feedback."** Comments sit in the **Comments** tab, which someone editing may never open. A note on the canvas, attached to the layer it is about, is in front of them while they work. Or assign the comment to them: they get a notice, and it shows under **Assigned to me**.
- **"The template came with notes everywhere."** They are the template's explanations. The eye button beside the **Note** tool hides them on your canvas only, and they never reach learners either way.
- **"I duplicated the project and the comments didn't come."** Comments are not part of the project, so a copy starts with none. Notes do come with it.

## How to tell what is going on

- Notes are sticky cards with their text showing. Comments are numbered pins: grey with a tick once resolved, an amber ring when assigned to you.
- The badge on the notes eye button counts the notes. The number on the **Comments** tab counts the open conversations.

![The Comments tab: Open 1, Resolved 0 and All, a filter, and the one conversation, numbered 1 and pinned to Home, Box.](help/concept-notes-comments-tab.png)

**More:** [Notes](notes), [Players never see notes](notes#players-never-see-notes), [Review comments](comments), [The review link](comments#the-review-link). [Tutorial 5](tutorial-publish) covers sharing for review.`,
  },
};
