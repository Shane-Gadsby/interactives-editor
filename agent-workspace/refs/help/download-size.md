# Download size and lite versions
What each page asks a learner to download, how to show it to them, and how to offer a lesson as video, audio only and text only.

Many learners study on mobile data or a shared connection. This page is about showing them what a lesson costs before they commit, and about offering a lighter way to take it.

## Seeing what an artboard weighs
Select a page and open **Download size** in the Inspector. The heading says what this page needs in total. Open it to see its heaviest files, and a bar for every page in the project so you can compare the versions of a lesson.

- Sizes are the ones the project already stores for each file. While [Optimise output](project-settings) is on and the lighter copy of a picture has been made, its size is used.
- A file counts once however many layers use it. A page shown inside another as an [instance](instances) counts what that page needs. A file that another page only links to with **Go to a page** belongs to that page.
- Fonts and data files load for every page, so they are listed apart and left out of each page's number.

## What the player loads, and when
The player draws one page at a time, and a page the learner has not opened asks for nothing: no pictures, no video, no sound. When they get to it, it loads everything it has. Every timeline's sound is fetched on arrival, started or not, so the first play does not wait.

- **Hidden layers still load.** A layer with Visible off is not drawn, but a video in it still starts loading (it may be carrying the sound for an audio version), and an instance layer still loads its page. To keep a version's files off the wire, put the version on its own page and go to it. Do not hide layers.
- Fonts and data sources are the project's, so they load at the start whichever page shows.
- **A single HTML file, a share link and the Link for StudyDesk carry every file inside the page.** All the versions arrive in the first download, so the choice saves memory and playing, not the download. Only a copy whose files are hosted separately loads only the chosen version. The lesson tells the learner which case they are in, with the `assetsEmbedded` name below.

## Showing a size to learners
These names work in any expression, text template or binding. A variable with the same name wins.
- **downloadSize("Video lesson")**: the bytes of the files that page needs. Give several names to add up what a version needs (each file once). With no name it means the page that is showing.
- **fileSize(bytes)**: a size as people say it, such as "340 KB" or "12 MB".
- **saveData**: true when the browser says the learner has turned on Data Saver.
- **connectionType**: `4g`, `3g`, `2g` or `slow-2g`, or empty. Only some browsers say; Safari and Firefox say nothing.
- **lowBandwidth**: true when Data Saver is on, or the connection is 3g or slower.
- **assetsEmbedded**: true when the files travel inside the page, as in a share link.

For example, a text layer can read `{fileSize(downloadSize("Video lesson"))}`. The hints are only hints: use them to mark a card, never to choose for the learner.

## The Lite lesson starter
Under **Listen, watch and capture** in the branded starter packs, **Lite lesson** is a lesson in three weights. The learner picks **Video**, **Audio only** or **Text only**, each card showing what that version weighs. The choice is a **user data** variable (`version`), so it comes back by itself and a returning learner goes straight to it, with **Change version** on every page to come back. On a slow connection or with Data Saver on, the lighter card is marked **Suggested for your connection**; nothing is chosen for them.

All three versions show one transcript, kept in the **transcript** variable, so they cannot drift apart, and all three finish on the same **Done** page, which is the project's completion point, so the result is recorded the same whichever version was used. Text only loads no video and no sound. Audio only loads no video: it is a Video layer holding the soundtrack, with a poster picture that shows the whole time and the captions as its transcript.

What the starter cannot do for you is make the three versions. The soundtrack must make sense with no picture: "as you can see here" fails for someone who is only listening. Keep the transcript and the key images in step with the video when you change it.

## Good to know
- Test the lighter versions on a throttled connection in your browser's developer tools before you tell anyone they are light.
- If you rename a version's page, change its name in the size line on the Choose page.
