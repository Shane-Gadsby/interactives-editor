# Exporting
Single HTML file, project package, JSON, Lottie, PNG, SVG, video, GIF and PNG frames.

**Export** in the top bar:

| Export | Gives you |
|---|---|
| Single HTML file | One file with the player, the project and every asset. Upload or embed it anywhere. See [About the single HTML file](export#about-the-single-html-file) |
| Project package (.ixp) | The whole project with assets at full size, to re-import or play with the player library |
| Project JSON | The document only, without asset files |
| Public interface reference…, TypeScript definitions (.d.ts) | What a page that embeds the project can set, read and hear, as a reference page and typed names. See [Public interface](public-interface). These three exports ask first when the list no longer matches the project |
| Lottie JSON (this artboard), dotLottie (this artboard) | The open page's shapes and timeline, for Lottie players (no interactivity). A report lists what couldn't be written |
| PNG image (this artboard), PNG image, 1× | The open page as a picture, at 2× or at actual size, at the timeline's playhead |
| SVG image (this artboard) | The open page as an SVG file that scales cleanly. It uses HTML inside the SVG for text and web elements, so it opens in browsers but not in every drawing program |
| Video, GIF or frames… | One timeline of the open page as an MP4 or WebM video, an animated GIF, or a ZIP of PNG pictures, one per frame (below) |

Sharing is on its own button, **Share**, next to Export (below). Export only makes files, so the first line of the Export menu, **Want a link instead of a file?**, opens **Share…**, which asks **Where will people use it?** and gives you the link or code to copy.

The files are named after the project (and the page, for pictures, Lottie and video).

## About the single HTML file
- Big pictures go in as their [optimised copies](export#optimised-pictures).
- Every file is inside it, so a lesson offered in lighter versions still sends all of them in the first download. See [Download size](download-size#what-the-player-loads-and-when).
- Google fonts load from this server, the same place as the editor, so the file stays small and opening it never calls Google. Opened with no network, text shows in a standard font instead.

## About the project package
A **Project package** (`.ixp`) carries a copy of every Google font the project draws with, so it plays with no network. Importing a package links each font from this server again whenever the server has it, and leaves the copy out, so the project doesn't carry the font twice. A font the server can't give keeps its copy. If a font can't be fetched when you export, a message says so, and opened online it still loads from the server.

## Video, GIF and frames
**Export → Video, GIF or frames…** turns one timeline of the open page into moving pictures you can put in a slide deck, an email or a lecture recording. It plays the timeline once through, from the start, and draws every frame at its exact time: the result is smooth however slow or busy your computer is, and it is the same drawing as **PNG image**, so a frame looks like the canvas with the playhead there.

| Setting | What it does |
|---|---|
| Timeline | Which timeline of the open page to draw. It starts on the one you have open |
| Format | **MP4 video (H.264)** and **WebM video (VP9)** play almost everywhere and are small. **Animated GIF** plays anywhere, including in email, but is larger and limited to 256 colours a frame. **PNG frames (ZIP)** is one picture per frame (frame-0001.png and so on) for a video editor |
| Width | How wide the picture is in pixels; the height follows the page's shape. Videos always have even sides, so the width can come out a pixel smaller |
| Frames per second | Starts at the timeline's own rate (30 if it has none). GIF goes up to 50, the rest up to 60 |
| Repeat for ever | GIF only. Off, the GIF plays once and stops |

The dialog says how many frames that makes. A bar shows the progress, and **Cancel** stops it with nothing saved. Longer clips and bigger pictures take longer. The limit is 3600 frames.

Things to know:
- **No audio yet.** Sound on the timeline and narration are not mixed into the file.
- **Video and embed layers show as empty boxes**, the same as in a PNG, and a message says so when it happens. Script layers do too. Shader layers are drawn.
- **Video and GIF are drawn on white**, because neither keeps transparency the way you would want. PNG frames keep it.
- **The open theme is used**, the one in the theme box in the top bar.
- **Browsers without video encoding** (older ones, and some that block it) hide the MP4 and WebM options and say so. GIF and PNG frames always work. Which video formats appear can also depend on the size: a very large width may not be encodable.
- Interaction is not part of a clip: it shows the timeline only, with the variables at their starting values.

![The Export menu.](help/export-menu.png)

## Optimised pictures
A phone photo can be 5 MB or more, and an export or share link carries every picture inside it. With **Optimise output** on in the [Project settings](project-settings) (it is on by default), the **Single HTML file** and the **Share link** carry a smaller copy of each big picture instead, and your originals stay in the project at full size.

- The **slider** under the box goes from **Smaller files** to **Better quality**, in five steps. Each step sets how large a picture may stay (from 1280 px up to 3840 px on the long side) and how hard it is compressed. The default is **Better quality**, the fourth step. Pictures are never made bigger.
- Pictures without transparency become JPEG, and ones with transparency become WebP, so cut-outs keep their edges. Colour profiles are not carried over, and a photo that relied on one can shift very slightly.
- SVG, GIF, animated PNG and WebP, and pictures that are already small are left as they are. So is any picture that would not come out clearly smaller.
- The first export or share after a change works the copies out, which can take a few seconds for a project full of photos. They are kept on the server for each step of the slider, so the next export is quick. **Optimise pictures now** in the Project settings does that work ahead of time and says what it saves, and the [Assets panel](assets#looking-at-them) shows the saving for each picture in its Details view.
- The **Project package** and **Preview** always use the full-size pictures, and so do the PNG and SVG image exports. A share link made earlier keeps whatever it was made with until you update it.
- Turn the box off to put every picture in at full size again.

## Sharing
**Share** in the top bar (next to Export) has four ways to share a project:

| Share | Gives you |
|---|---|
| Share… | Opens with **Where will people use it?**: in a StudyDesk page (keeping learners' results or not), in the StudyDesk gradebook, anyone with a link, or as a file. It shows the one thing to copy for that, and the link settings are under **More ways to share** (below) |
| Invite to collaborate… | People who can open and edit the project with you, found by name, email or username, with an offer to turn on Live collaboration (see [Collaborating](live-editing#inviting-people)) |
| Save as template… | A copy other people (or you) start new projects from, with a checklist of what to change (see [Templates](templates#save-as-template)) |
| Share for review… | A link where reviewers look at the project and leave comments, without editing it (see [Review comments](comments)) |

![The Share menu.](help/share-menu.png)

Export gives you **files**; Share gives you **links and people**. Nothing under Share downloads anything.

## Where will people use it?
**Share → Share…** asks one question first, **Where will people use it?**, and shows the one thing to copy for the answer, with two lines on what to do with it. Your choice is remembered for the project.

| You choose | You copy | Notes |
|---|---|---|
| **In a StudyDesk page, and keep learners' results** | The [embed code](export#embed-code) (the Link for StudyDesk in an iframe) | Paste it in the page's **Source code** view. A project that uses the microphone, camera or photos needs this one, and the code already allows them |
| **In a StudyDesk page, no results needed** | The same iframe, around the plain share link | Nothing is kept for learners. Not offered for a project that uses the microphone, camera or photos, and it says so |
| **In the StudyDesk gradebook, with a mark** | The project's name, to pick in **Select content** | Needs questions set to **Mark answers on the server**, and says when none are |
| **Anyone with a link** | The share link | **Open** tries it in a new tab |
| **As a file to download** | Nothing to copy: buttons download the single HTML file or a project package | Does not keep results |

Until the link exists the dialog offers **Create the link**, and once it does, **Update to the latest version** sits under the thing to copy. Everything else the dialog used to show (both links, the embed code, **Results…**, **Allow remix**, **Revert to previous version**, **Turn off link**) is under **More ways to share, and the settings of the link**, described below. The links themselves have not changed.

At the top of the dialog a line says whether there is anything to look at first: see [Before you share](before-you-share).

## Share link
**Share → Share…**, under **More ways to share**, publishes the project as it is now to a link that plays it in the browser, like the single HTML file. Anyone with the link can view it (not edit it). Links are long and random so they can't be guessed. **Copy** copies the link and **Open** opens it in a new tab.

The page loads the project's Google fonts from this server, the same place as the editor, so viewers' browsers never call Google and the page stays small (the fonts used to be copied into it, which made a page several times bigger).

### Updating, reverting and turning off
The link is a snapshot of the project when you published it.

- Press **Update to the latest version** to publish later changes. **Publish**, beside **Share** in the top bar, does the same without opening the dialog. It asks first, since every link and embed (in every course, and any added later) changes to this version at once. A project that hasn't been shared yet is sent to **Share…** instead.
- The page it replaces is kept. If the update was a mistake, **Revert to previous version** puts it back for everyone at once, and pressing it again switches back.
- **Turn off link** stops it working. After you confirm, the link shows a "turned off" page.
- The **Link for StudyDesk** is the same link, so it stops too. If learners have results or progress in the project, the confirmation lists how many in each course and when each was last active, so you can tell a link a course is using this term from an old one.

![The Share dialog: Where will people use it? with the embed code to copy, and More ways to share folded underneath.](help/share-where.png)

A share link carries big pictures as their [optimised copies](export#optimised-pictures) while **Optimise output** is on in the Project settings.

### The Link for StudyDesk
The **Link for StudyDesk** plays the same project but keeps each signed-in learner's score, completion and progress. Use it in StudyDesk when you set a score or tick **Remember** on variables, and see [Results and progress](results). **Results…** shows how learners did.

That link opens the **learner page**: a small page around your project that knows who the learner is from their StudyDesk session. It gives the project the learner's saved progress, keeps their results, and, when **Learner records** is on, passes on the activity that [Insights](insights) counts. Put this link in your StudyDesk page, not the plain one. A learner who isn't signed in plays it as normal, and their progress stays in their own browser. **Allow remix**, under the link, adds a **Remix this** button for signed-in staff who open it, which copies the project into their own projects: see [Templates, examples and remix](templates#allow-remix-on-a-share-link).

A project that uses a microphone, camera or photos (see [Microphone, camera and photos](sensors)) only works through the **Link for StudyDesk**, and the iframe that holds that link on the StudyDesk page needs `allow="microphone; camera"`. The **Embed code** below writes that for you. Update the link after changing what the project declares.

**Values on the link.** Anything you add to the link's address, like `&program=GCSC` on the end of the embed code's, reaches the project as `link.program` (`ix.link.program` in a script). See [Values on the link](course-context#values-on-the-link).

### Embed code
Under the Link for StudyDesk, **Embed code** is the link already wrapped in the iframe the Toolbox writes for its own items, ready to paste. Press **Copy embed code**, then in StudyDesk, StaffDesk or the open site edit the page, open the editor's **Source code** view (the `<>` button), paste where it should go and save. The page treats it like any other Toolbox item.

It is one code for all three sites. Each of them has the same Toolbox script and the same host for the link, so nothing in it changes between them. The host comes from the address you are using the editor on, so code copied from the test editor points at the test host: copy it again from the editor on the site the page is for.

What the code carries:
- **A title** made from the project name (for example `Interactive: Fractions lab`), which is what a screen reader calls the frame.
- **The shape of the project**: the start page's width and height as an aspect ratio, so the frame is the right height before anything loads. The page then asks StudyDesk to set the real height, and keeps asking as the project resizes, the same way the Toolbox's own items do. A project with [responsive pages](responsive) changes shape with its width, and the frame follows.
- **`allow="autoplay; fullscreen"`**, so video, sound and the fullscreen button work. When the project declares the microphone or camera, `microphone` and `camera` are added; photos are a file picker and need nothing. The list follows what the project declared when the link was last updated, so press **Update to the latest version** first if you have just changed it, then copy the code again.
- **An id** (`data-cdt-id`) that StudyDesk uses to tell this item from the others on the page.

Updating or turning off the share link changes what the embed shows without touching the page it is in, since the code only holds the link.

For a walk-through, see [Tutorial 5](tutorial-publish).
