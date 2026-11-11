import type { Concept } from './index';

export const concept: Concept = {
  order: 200,
  area: 'interface',
  topic: {
    id: 'concept-live-revisions',
    title: 'It saves as you go; revisions are the way back',
    group: 'Concepts',
    summary: 'There is no Save to remember: every change is saved, other editors see it live once you turn Live collaboration on, and Revision history takes the project back to an earlier version.',
    keywords: 'concept live collaboration setting off on save autosave no save button saved failed live editing collaborate two people same text revision history restore undo go back mistake bad change conflict 409 changed in another tab overwrite reload',
    body: `Every change you make is saved as you go. The label next to the project name says **Saved**, **Saving…** or **Save failed**, and <kbd>Ctrl</kbd>+<kbd>S</kbd> saves at once if you want to be sure.

**Live collaboration** is a setting of the project, and it starts off. Turn it on in **Project settings** (or when you invite someone in **Share → Invite to collaborate…**) and, when other people you invited have the project open, the **Live** badge shows, their initials appear in the top bar, and their changes arrive on your canvas as they make them. A second tab of your own on the same project counts as another person. With it off, your editor sends nothing but the save, and tells you when you come back to a tab that the project was changed somewhere else.

![The top bar of a project with two tabs open: Saved, Live and a TU badge for the other tab, and on the canvas that tab's cursor labelled Test User and the dashed outline round the layer it has selected, which it has just renamed to Logo.](help/concept-live-revisions-live.png)

The server also keeps **revisions**: a snapshot every few minutes while the project changes (the newest 100), plus any version you name. Those are the way back from a change you regret.

![The Revision history dialog: a list of Autosave versions with the oldest, Copied from an example, picked, a picture of it, and the buttons Restore this version, Name it, Pin and Save a named version.](help/concept-live-revisions-history.png)

## Where people get caught out

- **"Where is Save?"** You don't need one. Close the tab when the label says **Saved**.
- **"I made a mess and undo isn't enough."** Open **Revision history** (the clock in the top bar), click a version to see a picture of it, press **Restore this version** and confirm with **Restore**. What is there now is saved into the history first, as **Before restore**, so a restore can itself be undone the same way. The editor reloads the project when it is done. Before a big change, **Save a named version…** saves what is there now under a name and pins it, and **Pin** does the same for a version in the list: pinned versions are never cleared out.
- **"Undo took back my change, but not hers."** Undo only undoes your own changes, never someone else's.
- **"We were both typing in the same text box."** The project keeps one value for each setting, and when two people change the same one at the same moment, the later change wins. Split the work by layer or by page.
- **"A red bar says the project was changed in another tab or by someone else."** With Live collaboration on, two tabs on one project share one live session and just see each other's changes, so this is rare. With it off, you get it when another tab, a collaborator or an AI assistant has saved the project since this tab opened it, and you then change something. The server refused to quietly write over it. **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Whichever you don't pick is lost, though the revision history may still have it.

## How to tell what is going on

- Hover **Save failed** for the reason. The editor keeps trying by itself, so keep the tab open until it says **Saved** again.
- The **Live** badge says **Reconnecting** while the connection is down. Your changes are kept and sent when it's back.

![The top bar with the label Saved and the badge Reconnecting.](help/concept-live-revisions-reconnecting.png)

**More:** [Live editing and saving](live-editing), [Revision history](live-editing#revision-history), [When a save fails](live-editing#when-a-save-fails), [When two copies disagree](live-editing#when-two-copies-disagree), [Inviting people](live-editing#inviting-people). [Tutorial 5](tutorial-publish) restores a version and invites someone to edit with you.`,
  },
};
