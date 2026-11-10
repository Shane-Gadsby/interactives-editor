import type { Concept } from './index';

export const concept: Concept = {
  order: 200,
  area: 'interface',
  topic: {
    id: 'concept-live-revisions',
    title: 'It saves as you go; revisions are the way back',
    group: 'Concepts',
    summary: 'There is no Save to remember: every change is saved, other editors see it live, and Revision history takes the project back to an earlier version.',
    keywords: 'concept save autosave no save button saved failed live editing collaborate two people same text revision history restore undo go back mistake bad change conflict 409 changed in another tab overwrite reload',
    body: `Every change you make is saved as you go. The label next to the project name says **Saved**, **Saving…** or **Save failed**, and <kbd>Ctrl</kbd>+<kbd>S</kbd> saves at once if you want to be sure.

When other people you invited have the project open, the **Live** badge shows, their initials appear in the top bar, and their changes arrive on your canvas as they make them.

The server also keeps **revisions**: a snapshot every few minutes while the project changes (the newest 100), plus any version you name. Those are the way back from a change you regret.

## Where people get caught out

- **"Where is Save?"** You don't need one. Close the tab when the label says **Saved**.
- **"I made a mess and undo isn't enough."** Open **Revision history** (the clock in the top bar), click a version to see a picture of it, and press **Restore this version**. What is there now is saved into the history first, so a restore can itself be undone the same way. Before a big change, **Save a named version…** pins a version that is never cleared out.
- **"Undo took back my change, but not hers."** Undo only undoes your own changes, never someone else's.
- **"We were both typing in the same text box."** The project keeps one value for each setting, and when two people change the same one at the same moment, the later change wins. Split the work by layer or by page.
- **"A red bar says the project was changed in another tab or by someone else."** The project was saved from somewhere that wasn't in the live session with you, such as a second tab, and the server refused to quietly write over it. **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Whichever you don't pick is lost, though the revision history may still have it.

## How to tell what is going on

- Hover **Save failed** for the reason. The editor keeps trying by itself, so keep the tab open until it says **Saved** again.
- The **Live** badge says **Reconnecting** while the connection is down. Your changes are kept and sent when it's back.

**More:** [Live editing and saving](live-editing), [Revision history](live-editing#revision-history), [When a save fails](live-editing#when-a-save-fails), [When two copies disagree](live-editing#when-two-copies-disagree), [Inviting people](live-editing#inviting-people). [Tutorial 5](tutorial-publish) restores a version and invites someone to edit with you.`,
  },
};
