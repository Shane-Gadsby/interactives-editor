# Troubleshooting and common questions
Quick answers: the box won't move, a layer can't be selected, text shows braces, imports and links, saving conflicts.

Short answers to the things new users ask most. Each links to the page with the full story.

## Animation
**My layer doesn't move when the timeline plays.**
A track needs **two or more** keyframes. With one key it holds that value. Add a second at another time. See [Tutorial 1](tutorial-first-animation).

**I'm in Record mode but nothing is keyed.**
- The **Timeline** tab must be open, with a timeline chosen. In **Design view (no timeline)** changes are ordinary edits.
- The property must be one that can animate (see [Animatable properties](animatable-properties)).
- A property driven by a [binding](bindings) can't be keyed. Remove the binding first.

**The timeline plays once and stops.**
Set **Play once** to **Loop** or **Ping-pong**, and tick **Autoplay** if it should start by itself. See [Timelines and keyframes](timelines).

**An edit I make shows up as a keyframe I didn't want.**
Record is still on. Press the red dot to switch it off.

## Selecting and seeing layers
**I can't click a layer on the canvas.**
It is probably **locked**, or **hidden** (shown as a faint ghost). Hover it for the badge that unlocks or shows it, or use the eye and padlock in the Layers panel. See [Layers, hidden and locked layers](layers-panel).

**A layer is in the editor but not in Preview.**
Check that it is **Visible**; that it isn't hidden by a **Solo** group's active child; that it sits inside the page (**Clip content to page** hides what is outside in Preview and in exports; on the canvas the part outside shows faintly); and that no mask above it is clipping it. See [Groups and frames](groups-frames).

**I change a field and it goes back.**
The property is probably bound: the binding sets it again straight away. Look in the layer's **Data bindings** section, and remove the binding there to edit it by hand. See [Bindings](bindings).

## Text, variables and expressions
**My text shows `{score}` instead of the number.**
The variable needs to exist with exactly that name (it's case sensitive). Make it in the **Variables** tab. To show a real brace, write `{{`. See [Variables](variables).

**It says "Formulas need a name with letters, digits and _ only".**
Formulas use a variable's **Name in formulas**, so that one can't contain spaces or dashes. Type your own words in the name field (**Quiz score**) and the editor offers `quizScore`; if you changed that box to something with a space or a dash, try `high_score`. Data source names must be plain like this too. A name that is empty or not valid is not saved: it stays in the field as a draft, with the message, and the project keeps the last good name until you fix it.

**The tops of some letters were cut off until I selected the text.**
That was Chrome leaving part of a line unpainted in a project fitted to a frame at a size like 1.05 (StudyDesk), after the page appeared or its frame was resized to fit. The player now paints every text layer as a group of its own, which Chrome always draws whole, so it doesn't happen any more. If you still see it, say where.

**A script does nothing.**
Open **Preview** and look at the **Events** list for an error message. Scripts in the sandbox can only use `ix`, timers and `console`. See [Scripts](scripts).

## Colours and themes
**I switch between Light, Dark and High contrast and nothing changes.**
Only a colour that follows a token changes with the theme. Press **Link colours to tokens** in the Themes tab to link the plain colours that match a token. See [When switching the theme changes nothing](themes#when-switching-the-theme-changes-nothing).

**A colour won't let me type a hex in a branded starter.**
Branded projects only take theme colours. Pick one from the **Tokens** tab of the colour picker. See [Branded starter packs](branded-starters#what-is-locked-and-why).

## Importing and updating design files
**The designer saved a new version of the Photoshop (or Illustrator, ...) file.**
Select one of its pages and press **Update from file…** in the inspector, or **Update…** beside it under **Design files** in the Assets panel, then pick the new file. Your own edits are kept. See [Updating a design file](import#updating-a-design-file).

**A bar asks me to Reconnect.**
That's a page linked to a file on disk the older way. Press **Reconnect** to let the browser read it again, or use **Update from file…**.

**"The linked file was moved, renamed or deleted."**
Use **Update from file…** and pick it where it is now.

**An Illustrator file says to save with "Create PDF Compatible File".**
Re-save it from Illustrator with that option ticked. **A DWG file** must be saved as DXF first. See [Importing](import).

## Beta tester questions
**Where is the version number?**
Hover the small **(i)** icon beside **Help** (on the help page and the projects page), or the one in the title bar of **Preferences**: it reads like `Version 0.5.0 · build 1a2b3c4.5d6e7f8`. Click it to copy it, and put it in any problem report. See [Getting started as a beta tester](welcome#getting-started-as-a-beta-tester).

**A tool I'm looking for isn't in the tool bar.**
Some groups start folded. Click **Media** (text, script layer, shader layer, video, image), **Web** (button, input, link, embed, Add question) or **Rig** (bones) to open them. See [The editor at a glance](interface).

**A faded layer won't take clicks in Preview.**
A layer that is partly see-through lets the pointer through. Tick **Clickable while see-through** in its **Interactions** section. See [Interactions](interactions).

**I invited someone and they can't see the project.**
They need to be signed in to StudyDesk, and to reload their projects page. Check you picked them from the list, or typed their username exactly. See [Live editing and saving](live-editing#inviting-people).

**The Link for StudyDesk shows no Results or Insights.**
Both only count learners who are signed in to StudyDesk and opened the **Link for StudyDesk** (not the plain share link) while it was on. After you change score or record settings, press **Update to the latest version**. See [Results and progress](results) and [Insights](insights).

## Saving and sharing
**The label says Save failed.**
Hover it for the reason. A network or server problem is retried by itself until it works, so keep the tab open. **This project is too big to save** means it is over 64 MB, usually because of a large picture pasted into a layer: move it into the Assets panel. See [When a save fails](live-editing#when-a-save-fails).

**A red bar says the project changed in another tab or by someone else.**
Another copy saved first. **Reload theirs** brings in what is saved, and **Overwrite with mine** keeps your version. Pick carefully: the other one is lost. See [Live editing and saving](live-editing).

**Undo doesn't undo someone else's change.**
Undo only undoes your own changes. Use the [revision history](live-editing#revision-history) to go back further.

**A video doesn't autoplay.**
Browsers only autoplay *muted* video. Tick **Muted**.

**Data from a web address doesn't load.**
The address must allow cross-origin requests (CORS) from where the interactive is shown, and, if the project lists **Allowed data hosts**, its host must be on the list. See [Data sources](data-sources).

**A formula with a pattern (`/…/`) says "Pattern not allowed", or its `{…}` shows as written in text.**
The pattern could freeze the page on some text, so it is refused. See *Patterns* in [Expressions](expressions#patterns-regular-expressions).

## The editor itself
**The page zooms when I scroll.**
That's the default. Set **Mouse wheel** to **Pan (Ctrl+wheel zooms)** in [Preferences](preferences).

**A shortcut doesn't work.**
Shortcuts are ignored while a text box is focused. Click the canvas first. See [Keyboard shortcuts](shortcuts).

**Export doesn't have my share link any more.**
Sharing moved to its own **Share** button next to Export. See [Exporting](export#sharing).

**Where's my project?**
Check the projects page for an active folder, tag or search (the **Clear filters** button resets them). You only see your own projects. See [Projects page](projects).
