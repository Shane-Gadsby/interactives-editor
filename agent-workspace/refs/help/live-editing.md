# Live editing and saving
Live collaboration (off until you turn it on), autosave, revisions and conflicts.

Everything saves as you work, and <kbd>Ctrl</kbd>+<kbd>S</kbd> saves at once from anywhere in the editor. A project can be opened by its owner, by people the owner has invited to collaborate (below), and by staff with power-user access (see [Projects page](projects#who-sees-what)); to let anyone else play it, use a [share link](export#share-link). 

## Live collaboration
**Live collaboration** is a setting of each project, and it is **off** until someone turns it on. Turn it on in [Project settings](project-settings) (the **Live collaboration** box), or from the **Turn on live collaboration** button in **Share → Invite to collaborate…**, which is offered when you invite someone. Nothing turns it on for you.

- **Off** (the default): your editor works alone. It saves the whole project a moment after each change, and sends nothing else: no cursors, no stream of other people's changes. That keeps the data use of a project you work on by yourself as small as it can be. If someone else (or you, in another tab) saves the project meanwhile, you are told the next time you save, or when you come back to the tab (see *When two copies disagree* below).
- **On**: when more than one person opens the same project, the **Live** badge shows, their initials appear in the top bar and their cursors and selections show on the canvas. Changes appear for everyone as they happen.

Turning it on saves your project first and then joins the others; turning it off lets your last changes reach the server and goes back to plain saving. It is one undo step like any setting. Everyone who has the project open follows the setting. A copy of a project, or a project made from a template, starts with it off.

**An AI assistant** (the MCP server) edits through the same live room whatever the setting says, and its work is saved with the project like anyone's. If you have live collaboration off, you will not see it happen as it goes, but within about 15 seconds of it saving (or as soon as you come back to the tab) the editor loads the assistant's work by itself, as long as you have nothing unsaved. Undo starts again from there. If you start changing something first, the next save is refused with the red bar below, so the assistant's work is never written over by accident.

- **Undo** only undoes your own changes.
- If two people change the same setting at the same moment, the later change wins.
- If the connection drops, the badge says *Reconnecting*; your changes are kept and sent when it's back.
- If the server refuses a batch of changes for good (too large, not allowed), live editing stops with a message and the whole project is saved the normal way instead. A temporary server error is retried, waiting a little longer each time.
- The server writes the project to its database a second after the last change, and at least every 10 seconds while people keep working. If that write fails, everyone in the project sees **Save failed** with **Not saved yet** and the reason, and a message says so once. Your changes are kept on the server, which keeps trying by itself; when it gets there the label goes back to **Saved** and a message says **Saved again**. Keep the tab open until then.

## When a save fails
The label next to the project name says **Save failed**; hover it for the reason.
- **Could not reach the Ixia server**, or **The server could not save this project**: the network or the server had a problem. The editor tries again by itself, waiting a little longer each time (up to a minute), and straight away when your computer is back online. Keep the tab open; nothing you did is lost.
- **This project is too big to save**: the project is over 64 MB. Large pictures or data pasted straight into layers are the usual cause. Put pictures in the [Assets panel](assets) and point layers at them instead; then the next change saves.
- The red conflict bar: someone else saved first (below).

Very big projects are fine: the server splits anything too big for one database record into parts and puts them back together when the project opens.

## Revision history
The server keeps saved revisions of the project: a snapshot every few minutes while it changes (the newest 100 are kept), and one before every restore. Click the **Revision history** button (the clock) in the top bar. The list on the left shows each version with its date and how long ago it was; click one to see a picture of it and a count of its pages and variables. **Restore this version** asks **Restore version** in a dialog first. What is there now is saved in the history before the restore, so you can come back to it, and the page reloads with the restored project.

**Named versions.** **Save a named version…** keeps the project as it is right now under a name you choose ("Sent to the coordinator", "Before the redesign"), and pins it. **Name it** (or **Rename**) names any version in the list, and **Pin** keeps one. Pinned versions show a pin and their name in the list, and are never cleared out of the history however old they get; a project keeps up to 20. **Unpin** lets one be cleared like the others, once 100 newer ones have built up.

![The Revision history dialog.](help/revision-history.png)

## When two copies disagree
With live collaboration off, a second tab, a collaborator or an AI assistant can save the project while you have it open. The editor checks every 15 seconds while the tab is in view, and again when you come back to it. With nothing unsaved, it loads the newer copy by itself and says so (undo starts again from there). If it can't load it, a bar says **This project was changed somewhere else since you opened it** with a **Reload** button. If you do, saving shows the red bar. If the project was saved from another tab, or by someone else without live editing, a red bar says **This project was changed in another tab or by someone else since you opened it. Your edits are not saved.** **Reload theirs** loads what is saved. **Overwrite with mine** replaces it with your copy. Pick carefully: the other one is lost (the revision history may still have it).

## Inviting people
**Share → Invite to collaborate…** lets other people open and edit the project with you.

1. Open the project and choose **Share**, then **Invite to collaborate…**.
2. Start typing their name, email or username. A list of matching people appears: pick the right one and they are invited at once. If you already know their StudyDesk username (for example *u1234567*) you can type it and press **Invite**.
3. They are listed under the box. The bin beside a name takes them off again (you are asked first, and their changes stay).
4. The project now shows on their own projects page, marked *shared with you by* your name. If live collaboration is off, the window offers **Turn on live collaboration** (it stays off until you press it). With it on, when you both have the project open you see each other's cursors and changes live; with it off you each work on your own copy and the second to save is asked to reload.

![The Invite to collaborate window: a search box for a name, email or username, and the list of people already invited.](help/invite-dialog.png)

Only staff who have used the StudyDesk Toolbox before can be found by name, and students are never listed. Someone who isn't found can still be invited by typing their exact username. Collaborators can edit, comment, export and share it; only the owner can delete the project, clear its results or change who's invited (a collaborator can take themselves off the list).

To hand a project to someone else (you're leaving, or it belongs to another unit now), invite them first, then press **Make owner** beside their name. They become the owner and you stay on as a collaborator. The project keeps its id, so its share link, the **Link for StudyDesk** in every course page and a library published from it carry on working. A power user can do this for anyone's project, which is how a project is moved on when its owner has already left. To let someone look and comment without editing, use **Share for review** instead ([Review comments](comments)).
