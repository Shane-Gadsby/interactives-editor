# Branded starter packs
UniSQ-branded ready-made activities in six colourways: what is locked and why, how to switch colourway, and every starter by set.

A **branded starter pack** is a ready-made activity in the UniSQ look: a gradient title page with the logo, white content pages with a footer line, and sections on deep purple. You write the content. The look is already done, and it stays done.

## Using one
Open **Templates** (on the projects page), then **Built-in**. The **Branded starter packs** section is at the top.

1. Pick a **colourway** (the swatches). Your choice is remembered in this browser, and the pictures show the first page in it.
2. Find the starter in its set. Press **Play** on its card to try it first: it runs the way a share link would, and nothing is saved.
3. Press **Use template**.

You get a checklist of everything to change, like any other [template](templates#use-a-template), and a **Fill in** tab beside it: a plain form for the words, questions and pictures ([Fill in this starter](fill-in-starter)). The pictures are grey placeholders, and the sample text is yours to replace.

## On every starter page
- Back and Next sit in a bar along the bottom of every page: Back on the left, Next on the right.
- The first page has a small **Credits** button in a corner (bottom right, level with the footer line, unless something of the starter's is in the way). It opens the project's list of credits, which you fill in under [Attributions](attributions); delete the button if you have nothing to credit. Each page of a phone version has its own.
- Checklist items are short, one job each, with **Why and how** folded underneath.
- Every starter's graphs and pages carry [notes](notes#notes-in-starters-and-examples) that say what each part does, why it is built that way and what to change.
- Every page is checked in every colourway, so a button never lands on text and nothing crowds the logo.

## Starter settings
These are in the **Fill in** tab, on the starter they belong to.
- **Keep the learner's map for next time** (**Mind map**, its **Build your own** page): on, the learner's map is saved for them as they build, on the StudyDesk learner page, and they get **Save**, **Start a new map** and **Open a saved map**. Off, the map lasts only until they leave. Either way they can download it as a text outline, as a picture, or as a copy to open later.
- **A soft chip behind each word** (the pills) and **Word colour** (**Plain** or **Colourway**) in the **Word cloud**.
- **Who sees the learners' cloud**, **Words not allowed** and **Show a word once it has been said** in the **Word cloud**. See below.
- **Offer a Hint** and **Offer Try again** in the question starters. See [The starters](branded-starters#the-starters).

## Notes on some starters
### Listening lab
It comes with short placeholder tones in the project's **Assets**, named "(replace)". Use the arrow beside each one to swap in your own clip, and the **Play sound** nodes follow it.

### Keep the beat
There is no metronome timer to drift. One steady 16 ms clock, held back until a drill is running, reads the real time against the start time, so every beat is exactly where it should be, and each tap is scored the moment it arrives. The drills, tempos and how close a tap has to be are in the **presets** variable (Variables tab).

### Sign practice with self-review
- The model clip is one Video layer on one page, **Model clips**, and every other page shows it. Its asset follows the sign in view: each sign in the **signs** variable names its clip, a placeholder tone in **Assets** to swap for the signer's video.
- The Watch and choose half needs no camera. The camera half records a short video take that stays on the learner's device.
- Each page has a phone version that stacks the model above the camera (see [Responsive pages](responsive)), with the same layer names, so a change to wording or layout on one is made on the other too.
- It says plainly that it supports practice and is not feedback from a Deaf teacher, so keep that in. You also need the signer's consent and the rights to each clip.

### Live sound lab
It uses the microphone as a number and records nothing: a loudness meter with a target band (steady volume, or a noise check worded as a rough guide) and eight frequency bars. The project is set to listen only. The learner is asked once and sees a Listening bar with Stop.

A slider on each scene makes the same numbers when there is no microphone (see [Microphone, camera and photos](sensors)). Try the real microphone from the Link for StudyDesk, not Preview. The target band, noise line and band names are variables.

### Photo prompts notebook
- A privacy pledge, then about six prompts. Each has a photo slot, a caption, a tag and a "why this one" box, with retake, delete and skip with a reason.
- A list or bingo board view (the **bingo** variable).
- A hand-in page that downloads one web page with the photos inside it. Photos are only held in the page, so it tells learners to download before leaving.
- The **prompts** variable holds the prompts. Each has a photo and an example field naming two image assets, and the example is the way through for a learner with no camera.

### Shadow the model (Speaking and practice)
A few phrase cards. Each plays a model clip (with a **Slow** switch that keeps the pitch), the learner records themselves, plays their take or the model then their take back to back, ticks your self-check and rates themselves.

- It declares the microphone, so open **Project > Microphone and camera** to see the purpose and the 30 second cap. Untick Microphone for a listen-and-repeat version.
- A learner who says no, has no microphone or chooses "Do not use my microphone or camera" gets the plain version (listen, say it aloud, self-check), so nobody is shut out.
- The recording stays in their browser, is dropped when they go to the next card and is gone on a reload, and the page says so.
- Each card is a row of the **cards** variable (phrase, note, sound, checks). The sound is the clip's asset, so replacing a placeholder with the arrow in **Assets** keeps the card pointing at it. For a new row, type the clip's name in **sound**.

### Difficult conversation and Timed talk
Both rehearsals ship with an optional recording step that is switched off. Tick Microphone in **Project > Microphone and camera**, then *Record my reply* or *Record this talk*, and the play-back buttons appear, only for learners whose microphone works.

### Word cloud (Explore and reveal)
A cloud from a list of words and weights, `ourWords` (a text, a weight, and a detail and link for the dialog a word opens), with the **cloud** formula helper. Sizes follow weights, nothing overlaps, and the same words always give the same picture.

- Words are buttons in one Tab stop, with the arrow keys moving through them biggest first. **View as list** is the text alternative, with the counts.
- Its second page lets a learner type words and watch a cloud grow, kept as user data, with a **blocked** list and a **minCount**.
- **Who sees the learners' cloud** chooses **Only me** or **Everyone in this class**. The class option uses a [Shared responses](shared-responses) source, so it only works from the StudyDesk learner page. Anywhere else the page shows the learner's own words.

### Dated timeline (Explore and reveal)
A timeline on a real scale. **events** and **eras** are lists with dates, and the **timelineLayout** helper places them for the years in view, lays the labels out in lanes so they never collide and picks the scale (decades, years, then months) as you zoom.

- Earlier, Later, Zoom and Fit all move the view. Next event and Previous event walk the events and the view follows.
- A click or Enter opens an event in a dialog. **View as list** is the text alternative.
- The page is the base of a responsive set with a portrait variant under 560 px wide (same layer names, so a change to wording or layout is made on both), and an ordering activity follows it.
- The simpler **Interactive timeline** is still in Drag, sort and timelines.

## Colourways
Every branded project carries all of these as [themes](themes), plus **High contrast**, which a viewer who asks for more contrast gets automatically. Every colour in the project is a theme colour, so switching colourway re-colours the whole thing at once.

Gold, Purple, Blue, Green, Orange and Red, from the UniSQ palette.

### Switching colourway
Select nothing (or a page) and open **Project** in the Inspector. The **Colourway** swatches change the theme the project opens in. It is one undo step, and the canvas and Preview show it straight away.

Tick **Let learners switch colourway** to add a small row of swatches to the top right of the start page. Each one is a button that runs the interaction graph's **Set theme** action, so learners can pick the colour they find easiest to read. The swatches are brand layers: they stay where they are, and unticking the box removes them.

### Contrast
Every starter, in every colourway and High contrast, meets WCAG 2.2 AA: 4.5:1 for text (3:1 for large text), and 3:1 for the edge of a button, the focus ring, a progress bar against its track and chart marks. A test holds every page of every starter to it, including the states that show feedback and open dialogs, so a colourway change can't slip under it.

What you may notice:
- The Orange and Red colourways carry a soft dark scrim over the gradient on the first and last pages, because white words reach only 3.6:1 on the bare gradient.
- A button's edge is an outline in its label colour (gold buttons in Purple have a dark one).
- Selected outlines, bars and chart marks use the **primary** colour (purple in Purple). The button colour is kept for fills with a label on them.

The keyboard focus outline is a 1 px line tight round the focused item, the way the toolbox draws its own: near black (grey 7) round a light item, the **color/focus** colour round a dark one. Round a dark item on a pale page the gold line is faint against the page itself (under 3:1), and the item's own dark edge is what marks it.

## What is locked, and why
Branded projects are held to the brand so every activity looks like it came from the same place, whoever writes it.

- **Brand layers** are the logo, the sweeps, the accent bars, the footer line and the web address on the end page. They are locked: clicking on the canvas goes straight through them to whatever is behind, the selection box and Select all skip them, and in the **Layers** panel they carry a padlock and can't be selected. They can't be edited, moved, deleted or detached either. You can still delete a whole page, and add your own layers to it.
- **Colours** have to be theme colours. The colour picker offers the project's **Tokens**; typing a hex colour or picking one from elsewhere is refused with a note that this is a branded project. A new layer you draw or paste gets the nearest theme colour instead of its plain one.
- **Fonts** are Open Sans.

The accessibility checks, the [themes](themes) panel and everything else work as they do in any project. Projects made before the lock existed are locked when they open.

A power user can turn the lock off for a session with F9 (the brand kit override), which also lifts the brand kit lock, to fix something in the pack itself. With it on, brand layers show in the Layers panel like any layer. Select one there, and press its padlock to unlock it for clicking on the canvas. Nothing is saved with it.

## The starters
Question starters share two switches and a look. **Hint** is a small pill at the top right of the question card, so the one full size button is the one that answers.

The two optional extras are one switch each, for every question. **Offer a Hint** shows or hides the Hint pill, and **Offer Try again** shows or hides Try again after a wrong answer. Change them once in the **Fill in** tab (they are the project variables `offerHint` and `allowTryAgain` if you prefer the **Variables** tab). The practice starters open with both on. The Spelling test and the multi-page quiz open with Try again off.

A button says what happens to the answer: **Submit answer** where it is final, **Check answer** where there are tries. A button that starts a sound is disabled and reads "Playing..." until the sound ends, so it can't be pressed over itself.

The list of starters is in the editor (Templates, Built-in).
