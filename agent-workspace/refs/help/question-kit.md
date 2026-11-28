# Questions and quizzes
Questions that mark themselves: choices, blanks, ordering, matching, hotspots, banks and spelling tests.

A question that checks itself, without wiring every button by hand. **Add question** (in the **Web** group of the tool bar, which starts folded: click **Web** to open it) builds a question on the open page from ordinary layers, with the variables it keeps and a few interaction nodes. The **Question** section in the Inspector then changes the wording, answers, tries, hints and feedback whenever you like, without touching how it looks.

Already have the questions in Word, Excel or Moodle? You can [paste them in](paste-questions) or import a GIFT file instead of typing them again.

A chosen option looks chosen the way it does on any form: a **tick** in a multiple-response option's box, a **dot** in a single choice's ring, with the row tinted and outlined as well. The label over a blank is in the text colour, so it can be read; the quiet grey is kept for hints.

## Add one

Click **Add question** and pick a type. A card appears with a prompt, the answers, a Check answer button, a Hint button, feedback text, a score and a Try again button. Edit the prompt and answers in the **Question** section, then press **Preview**.

| Type | The learner | Right when |
|---|---|---|
| Multiple choice (one answer) | picks one option | the picked option is marked right |
| Multiple response | ticks any number | exactly the right ones are ticked |
| True or false | picks True or False | it matches the statement |
| Fill in the blank | types into one or more inputs | each blank matches an accepted answer |
| Put in order | moves or drags items up and down | every item is in its place |
| Matching (drag and drop) | drags each term onto its definition | every term is in its own slot (and no extra term is in one) |
| Categorise (drag into groups) | drags each item into a group box | every item is in the group it belongs to |
| Hotspot (click the right place) | clicks an area of a picture | the picked area is marked right (or all of the right ones) |

## What gets built

Nothing is hidden. A question is a **frame** (named Question 1, Question 2 and so on) made of ordinary layers:

- a **Prompt** text;
- an **answer area**. For choices it is one **Option** layer repeated once per option (a [repeater](repeaters), so you restyle the one template and every option follows). For blanks it is a label and an input per blank. For ordering it is an **Item** layer with Move up and Move down buttons;
- for matching, a **Terms** pile of draggable layers (one per pair) and a **Matches** column with, per pair, a definition text and a dashed **Slot** (a [drop zone](drag-and-drop) that holds one term);
- for a hotspot, a **Picture** and, over it, one invisible **Area** layer per area;
- **Hint text**, **Feedback**, and a row of **Check answer**, **Hint**, **Try again** and **Score**.

Every layer is yours: recolour it, change the font, move things around, swap a rectangle for an image, add animation. The layers are bound to the question's variables, so they keep working.

The **Restyle a part** buttons at the bottom of the Question section select a part for you. Selecting any part shows a note saying it belongs to the question.

## Looks

The **Looks** part of the Question section sets how an item looks when it is **Right**, **Wrong**, **Missed** (the right answer, shown when it was left out) and **Picked** (chosen, before the answer is checked, for choice questions). Open one to change its **Fill**, **Border** and **Text** colour, from the picker or a [theme token](themes). Every option, item, chip and blank the kit made follows, so changing the green for Right is one change, not one per layer. **Back to the starter looks** puts them back.

![The Looks part of a multiple choice question's Question section: four chips, Right in green, Wrong in red, Missed in orange and Picked in gold, each with an Aa sample, and the Back to the starter looks link.](help/question-looks.png)

Under the surface each coloured layer has an ordinary [binding](bindings) on its fill, border or text colour, set **By value** on the item's state, with the layer's own colour as the *otherwise*. You can see and edit it in the Inspector like any other. A colour you change on one layer by hand stays when you change the looks later, and a layer you gave a formula of your own is left alone. Hotspot questions keep their own area colours, and questions made before Looks existed keep the formulas they were made with.

## How a question behaves

The behaviour is a handful of nodes in the **Interactions** tab, each a row of an event and what it runs. *When the page is shown* runs **Reset question**. A click on an option runs **Choose option**. A click on Check answer runs **Check answer**. Add your own nodes after them. The graph folds these into one block per question so your own nodes stand out: click the block to open it (see [Question blocks](interactions#question-blocks)).

**Check answer** has three outputs: *right*, *wrong* and *finished* (once the question is locked, because it is right or out of tries). So "when it is right, play the confetti animation" is one wire.

## The button row on a question card

A question's own button leads the row, in the accent colour: **Play the word** on a spelling test, **Repeat**, or a clip's **Play**. **Submit answer** sits at the far right. The two are at opposite ends so they never look alike, in any theme.

## Listening and number keys

Three settings in the Question section's **Listening and keys** group let a learner hear a question, or answer it from the keyboard.

- **Listen button** adds a Listen button beside Check. It reads the question and its numbered options aloud. Once the answer has been checked it reads the feedback and the spoken explanation instead. It uses a voice installed on the learner's own device, never starts by itself, and hides itself when the device has no voice. See [Read it to me](read-aloud).
- **Say the prompt like** and **Spoken explanation** are words only a voice says. The first replaces the prompt when it is read (the options still follow it). The second is said after the feedback. For a data bank, the columns `spoken` and `explain` do the same for each row.
- **Number keys 1 to 9 choose** lets the learner press 1 to 9 to choose the option in that place (several choices toggle; other keys do nothing). A small line under the options says so. Choosing still needs **Check answer**.

Number keys listen on the whole page, so use them on one question at a time. They are offered for single choice, multiple choice and true or false.

## Variables

Each question keeps its progress in variables, named from its **Name prefix** (`q1` by default). Renaming the prefix renames the variables and everything that reads them. Use them anywhere: `q1_score + q2_score`, a progress bar bound to `q1_attempts`, or a Next button shown when `q1_correct`.

| Variable | Holds |
|---|---|
| `q1_prompt`, `q1_items` | the question text, and the options shown (each has `selected` and `state`) |
| `q1_answered`, `q1_correct`, `q1_locked` | whether it has been checked, whether it is right, and whether it is finished (right, or out of tries) |
| `q1_attempts`, `q1_triesLeft` | checks so far, and how many are left |
| `q1_hint`, `q1_hintsUsed`, `q1_hintsLeft` | the hint showing, hints taken, hints left |
| `q1_score`, `q1_feedback` | the score, and the feedback showing |

A question's score is its **Points** times the share that is right, less **Retry −%** for each check after the first and **Hint −%** for each hint taken. With **Part marks** on, a multiple response, ordering or fill in the blank question is worth the share it got right.

## Worked examples

Each type has its own settings in the **Question** section. Two finished ones are ready to play first: **Matching question** and **Hotspot question** on the **Templates** tab, under **Examples**. Press **Make my copy** and change the pairs, or the picture and the right area.

### Multiple choice

Add question, *Multiple choice (one answer)*. Type the prompt, type each option, and tick the right one.

Set **Tries** to 2 and write a hint. In Preview, pick a wrong option and press **Check answer**. The feedback says *Not quite*, and with a try left you can pick again. The second miss locks the question and, if **Show the right answer when finished wrong** is on, marks the right option.

### Multiple response

Tick every right option. Turn **Part marks** on to give a share of the points for a half-right answer, and write **Partly right** feedback.

### True or false

Write the statement as the prompt and set **Statement is** to True or False. Edit the two labels for other wording ("Agree" and "Disagree").

### Fill in the blank

The learner types into one or more inputs. Write the accepted answers one per line: `Paris`, `city of light`.

- Case and extra spaces are ignored unless you tick **Match case**.
- A number is compared as a number (`3` accepts `3.0`), and **± Tolerance** accepts near misses.
- A line written `/colou?r/i` is a pattern.
- **Feedback if wrong** is said after the question's own *Wrong* line whenever that blank is wrong, so you can say what went wrong in it (*Give the units*). Several wrong blanks say theirs in order.
- Each blank's box takes your theme's colours, so it goes dark in Dark and High contrast along with the rest of the question.
- **Shown as** appears when a blank accepts a pattern. It is what **Show the right answer when finished wrong** puts in the blank. Left empty it shows the first accepted answer that isn't a pattern, and a blank with only patterns shows nothing (the question's checks say so).
- **Add blank** adds another input in the look of the last one.
- Tick **Spelling: letters must match exactly** for a word to spell (see [Spelling tests](question-kit#spelling-tests)).

### Put in order

List the items in the **right** order. The learner sees them shuffled (the first deal is never already right) and moves them up and down, with each item's arrow buttons or the keyboard, or by dragging an item to its place.

Part marks give the share of items in the right place. When the question finishes wrong, the items snap to the right order and the ones that were out of place are marked.

### Extra terms and extra words

Matching has an **Extra terms** list in the Question section. A fill the blanks question answered by dragging has **Extra words**. They are dragged like the others but belong nowhere, so the learner has to leave them alone.

Left in the pile is right. One dropped into a matching slot is marked wrong and takes that pair's slot. With part marks, each extra in a slot takes one pair's share off.

### Categorise

Add question, *Categorise (drag into groups)*. The learner drags every item into a group box. In the Question section you list the **groups** and the **items**, and each item says which group it **Belongs in**.

A box takes any number of items, and an item stays where it is let go. The keyboard works as for matching. Every box takes every item, so a wrong drop is allowed, and **Check answer** says how it went.

- It is right when every item is in its own group. Part marks give the share in the right group, and the feedback says how many (*3 of 4 in the right group*).
- An item can have **Feedback if put in the wrong group**, said with the result.
- Tick **Say right or wrong as each item is dropped** and each drop answers straight away (*Eagle goes in Birds. Right.*) without using a try. The kit does this through an *Item dropped in a group* node on each box.
- When it finishes, the items stop moving, and with **Show the right answer when finished wrong** the wrong ones are listed with their group.

Categorise questions are marked in the page, not on the server, because which group an item belongs in is part of how the layers are set up.

### Fill the blanks by dragging

On *Fill in the blank*, set **Answer by** to *Dragging words from a word bank*. Each blank becomes a slot, and a bank of word chips appears: the first plain (not a /pattern/) accepted answer of each blank, plus any **Extra words**.

Check reads the word in each slot as if it had been typed, so accepted answers, case, tolerance, part marks and retries all work as for typing. **Shuffle the word bank** deals the chips again each time it starts.

This kind can still be marked on the server (see [Marking on the server](question-kit#marking-on-the-server)): only the answer words are in the page, not which blank each fits.

### Matching

Add question, *Matching (drag and drop)*. Each pair in the Question section is a term and what it matches: a country and its capital, a word and its meaning, a label and a place on a diagram. Add or remove a pair and the layers follow. A new pair takes the look of the others.

The learner drags each term into the slot beside a definition. A slot holds one term, and dropping another on it swaps them. With the keyboard: Tab to a term, Space to pick it up, the arrow keys to choose a slot, Space to drop, Escape to put it back (see [Drag and drop](drag-and-drop)).

**Check answer** is right when every term is in its own slot. With **Part marks** the score is the share of terms in the right place, and the feedback says how many (*2 of 4 matched correctly*). When the question finishes, each slot is marked ✓ Right or ✗ Wrong and, with **Show the right answer when finished wrong**, says which term belongs there. The terms stop moving.

**Try again** puts the terms back. **Shuffle** deals the terms to different places each time it starts. To match labels to a diagram, move the slots over the picture and restyle the terms: they are ordinary layers.

![A matching question: four country names to drag onto their capitals, with dashed slots on the right.](help/question-matching.png)

### Hotspot

Add question, *Hotspot (click the right place)*. The learner clicks an area of a picture. The sample picture is drawn with shapes so the question works straight away. Put your own image in its place: delete the shapes in the **Picture** layer and add an image, or give the Picture frame an image fill.

Each **Area** in the Question section has a name, a tick for right, and a shape (rectangle, ellipse or polygon). The areas are invisible until a learner picks one.

- **Edit on canvas** selects the area's layer, so you can move, resize or reshape it with the usual tools.
- **Show all areas** selects every one.
- Tick more than one area as right and the learner has to mark all of them. The areas become checkboxes, and **Part marks** score the share.
- If clicks near an area should count, **Grow areas 8 px** makes every area bigger on each side (**Shrink areas 8 px** does the reverse).
- Each area can have its own feedback, said when it is the one clicked.

Clicking an area picks it with a ring and a tint. After the question finishes the right areas are marked and *Right answer: Roof* is written under the picture, so it is not shown by colour alone.

The areas sit together in one **Areas** group over the picture, and the question has one click flow for all of them. Adding an area adds no flow. If you want to extend it: that flow is a *When clicked or hovered* on the group, set to *Only when a child is hit*, feeding *Choose option* the area's place with `event.childIndex`.

![A hotspot question over a drawn house: the Roof area is selected and shown with its outline.](help/question-hotspot.png)

## Paste questions from Word or Excel

Choose **Paste questions from Word or Excel** in the Add question menu: see [Paste questions](paste-questions), with templates to download.

## Import questions from a GIFT file

If you already have questions in Moodle, or made them with the GIFT converter from a Word document, you do not have to retype them. Open the **Add question** menu and press **Import questions from a GIFT file**, then pick the file (`.gift` or `.txt`).

Each question gets a page of its own, named after its title if it has one and otherwise "Question 3" and so on, in rows below what is already on the canvas. An empty page that is open (a new project's first one) takes the first question. They are ordinary questions from then on: the **Question** section changes anything, and you restyle them like any other. The whole import is one undo. Up to 100 questions come in from one file; the report says how many were left over.

| In the GIFT file | Becomes |
|---|---|
| One `=` right answer and some `~` wrong ones | Multiple choice (one answer) |
| Several `=` answers with `~` ones, or `~%50%` style weights that are positive for the right ones | Multiple response |
| `{T}`, `{F}`, `{TRUE}`, `{FALSE}` | True or false |
| Only `=` answers (short answer) | Fill in the blank, every `=` answer accepted. A `*` in an answer matches anything |
| `{#3.14:0.01}`, `{#1..5}` (numerical) | Fill in the blank with a margin of error |
| `=term -> definition` lines | Matching (drag and drop) |

Feedback comes across like this:

- The text after a `#` on an answer becomes that option's feedback.
- The text after `####` is added to the "Correct" message.
- On true or false, the two `#` parts are the feedback for the wrong choice and the right one.

A question written as `The capital is {=Paris ~Rome}.` shows a gap (`_____`) where the answers were. Backslash escapes (`\~`, `\=`, `\#`, `\{`, `\}`, `\:`, `\n`) work as in Moodle, and comment lines starting with `//` are ignored. Options stay in the order of the file (turn on **Shuffle** to deal them).

When it finishes, a report lists everything that did not come across, or came across changed, with the line number in the file. Nothing is dropped quietly:

- **Left out**: essay questions (a person marks them), plain text with no answers (GIFT's description), more than one set of braces in a question, a question with no right answer, one that is not valid GIFT, more than 30 choices or 8 matching pairs.
- **Changed**: part marks (a kit question is right or wrong, or scored by the share of right choices), answers worth less than full marks in a short answer, feedback on individual short answers or pairs, extra wrong matches, HTML formatting and pictures (the text is kept, plain), and maths markup, which shows as written. `$CATEGORY` lines are ignored.

Moodle XML files are not read yet.

## Shuffle

**Shuffle** deals the options (or ordering items, or a matching question's terms) in a new order every time the question starts or resets. In a multiple choice, tick **Stays in place when shuffled** on an option such as "None of these". Feedback and marking follow the option, not its place.

## The whole quiz

A project's questions can add themselves up, so a results page needs no wiring per question. Every project has a built-in `quiz` that does it:

| Name | Holds |
|---|---|
| `quiz.score`, `quiz.max`, `quiz.percent` | points earned, the most all the questions can score, and the share (two places) |
| `quiz.passed`, `quiz.passMark` | at or over the pass mark from [Results and progress](results) (false and empty when there is none) |
| `quiz.count`, `quiz.finished`, `quiz.right`, `quiz.done` | how many questions, how many are finished, how many of those are right, and whether all are finished |
| `quiz.questions` | one entry for each question: `prefix`, `page` (its page's name), `score`, `points`, `correct`, `locked` |

Use `quiz.questions` as a [repeater's](repeaters) items to show a row for each question: `{item.page}: {item.score} of {item.points}`. Adding a question to the quiz adds a row, and a question's own settings are all there is to wire.

A bank gone through once counts as one question, with the run's score and points. A variable or data source called `quiz` takes the name over, as for any built-in.

In Results and progress, **Score from: Total of all questions** makes the project's reported score this total.

Two settings in the Question section help a quiz of several pages: **Keep the answer when the page is revisited** (coming back to the page in the same visit finds the question as it was left, rather than set up again; a drag question puts its layers back where the last check found them) and **Hide Try again** (leaves out the button, for a test that is marked once).

## Question banks from data

Banks work with the choice, true/false, fill in the blank and ordering types. A matching or hotspot question is built from layers you place, so it takes only the prompt, hints, feedback and points from a row.

Tick **Take the question from data** and give the name of a [data source](data-sources) (or part of one, like `quiz.questions`). Each row is a question; what a row leaves out stays as set in the Question section (except hints, which come only from the row). With a bank the card's Try again button becomes **Next question**, which draws the next row (**Random** shows every row once before any repeats; **In order** goes round).

The rows can also be a **list variable** (pick one under **Or a list variable**): a list of objects with the same columns, such as questions the project builds itself.

### Going through the rows once

By default a bank loops for ever. Set **When the rows run out** to *Finish after one go through* and it is a **run**: the learner is asked each row once, then it is done. **Questions to draw** asks that many rows, picked at random (or the first ones for *In order*); 0 asks them all. The question keeps the run in these variables (with its own prefix, here `q1`):

| Variable | Holds |
|---|---|
| `q1_setPos`, `q1_setCount`, `q1_setLeft` | which question of the run this is, how many it has, how many are not finished |
| `q1_setScore`, `q1_setMax` | points earned so far, and the most the run can score (each row's own `points`, else the question's) |
| `q1_setDone` | true once every question is finished |
| `q1_missed` | the rows (counting from 0) that finished wrong, in this run |

**Check answer** has a **set done** output that fires when the question just checked was the last of the run. **Reset question** has one that fires when there is no next question. So a Next question button can go straight to a results page.

Moving on from a question without finishing it counts it as missed. On Reset question, **Bank run** set to *Start a new run* draws a fresh run with clean totals. *Review the missed ones* runs only the rows in `q1_missed` (with nothing missed it is done at once).

Columns a row can have:

| Column | For |
|---|---|
| `prompt` | the question text |
| `options` | choices, as a list or text separated by `\|` (also the items to order, right order first) |
| `correct` | the right choice(s) as text or position counting from 1 (`B` or `2`, several as `A\|C`); true/false takes `true` or `false` |
| `answer`, `answer2` | accepted answers for each blank, several separated by `\|` |
| `items` | ordering items, right order first |
| `hint`, `hint2`, `feedback`, `feedbackCorrect`, `feedbackIncorrect`, `points` | as the names say |

A CSV works the same way: the header names are the columns, in any case. The question reloads when its data source finishes loading.

## Results

A question can send its score to the project's Results (see the Results settings for the top score, pass mark and completion). Set **Report result** in the Question section to **Score so far** or **Complete, with the score**. It adds a *Report result* node after **Check answer**'s *finished* output, sending the question's score (`q1_score`).

With several questions, leave it on **No** and report once yourself, for example a *Report result* node with the score `q1_score + q2_score` after the last one. Or use **Score from: Total of all questions** (see [The whole quiz](question-kit#the-whole-quiz)).

## Marking on the server

Everything above marks in the learner's browser. The right answers are in the file the learner downloads, and a score is only ever what their browser says.

For marks that have to be trustworthy, tick **Mark answers on the server** in the Marking part of the Question section. Both the share link and the **Link for StudyDesk** then serve the project without its answers (press **Update to the latest version** in [Share link](export#share-link) after you change it). The **Link for StudyDesk** is the one that can check an answer.

How it works:

- The page that is served has the right answers taken out: which options are right, accepted answers and their patterns and tolerances, the feedback, the hints, and the right order of an ordering question. Anyone who looks at the page's code finds none of it.
- **Check answer** sends the learner's answer to the server, which marks it with the same marking the player uses, and sends back right or wrong, the score and the feedback to show. The tries, hints and score are kept by the server, so a learner who reloads or starts again does not get a fresh set of tries.
- The server records the result itself. The mark that counts for each question is how it finished the first time (unless the set has **Retakes**, see [Tries and retakes](question-kit#tries-and-retakes)). **Try again** after that is practice and does not change the recorded mark.
- The project's score is the total of those marks out of the questions' total points. It counts as complete when every server-marked question has finished, and it passes at the pass mark set in the Results settings.
- A **Report result** node, or anything else the browser sends as a result, is ignored for a project with server-marked questions: the server's own record is the only one. Questions that are not set to be marked on the server still do their normal marking in the page, but they add nothing to that record.
- Checks and hints are limited to 30 a minute for each learner, so an answer can't be found by guessing over and over. A learner who goes over is asked to wait.
- A learner who came in from an LMS over LTI 1.3 has their score sent to the LMS gradebook by the server when the whole set is finished, and again if their kept score changes. See [Grading in the LMS](question-kit#grading-in-the-lms).

What it does not do:

- The answers are only taken out of the two links. **Preview**, an exported HTML file or package, and anyone who opens your project in the editor still have the answers, and mark in the page as usual.
- Learners need the **Link for StudyDesk** (and to be signed in to StudyDesk) to have an answer checked. On the plain share link with no session, the question says it can only be checked from StudyDesk.
- **Matching**, **Categorise** and questions taken from a **data bank** can't be marked on the server: which term belongs where is part of how the layers are set up, and a bank is data the learner downloads. They stay marked in the page, and the Question section says so. A fill the blanks question answered by dragging words can be marked on the server (it is sent the words in the slots).
- Unlimited tries can still be used to find an answer slowly. Set **Tries** to limit them.
- A script or a custom node that holds an answer of its own is not touched.
- Staff who open the project in the editor, or Remix it from the Link for StudyDesk, see the full project with its answers.

## Spelling tests

A spelling test plays a word and the learner types it. You build one from **Fill in the blank** questions, one for each word and one to a page, the way the **Spelling test** starter does. The word is marked on the server and exists only in the audio, so it is not in the page for anyone to read.

### Setting up a word

For each word:

1. Tick **Mark answers on the server** and **Spelling: letters must match exactly** on its blank.
2. List every accepted spelling, one per line (`judgement` and `judgment`).
3. Give the word its audio (see [Voice for the word](question-kit#voice-for-the-word)). A **Play sound** node on a button plays it. Write nothing of the word anywhere else (not in a layer name, a label or the prompt).

Tick **Also accept American spellings** to accept the American form of each spelling as well. The editor shows the forms it adds, so nothing is accepted that you can't see. It knows the common differences (colour/color, organise/organize, centre/center, travelled/traveled, paediatric/pediatric and a few dozen words that are spelled differently). It leaves a word alone when it is not sure, so add anything else as its own line.

### What counts as right

Every letter, in order. Case is ignored unless **Match case** is on, and spaces round the word are ignored. A curly apostrophe typed on a phone counts as a plain one, but a missing apostrophe or hyphen is wrong, and accents have to be there (cafe is not café). Numbers are not compared as numbers.

The box has the browser's own spellcheck, autocorrect and automatic capitals switched off (**No browser help** in the input's settings), so it neither underlines nor fixes the word.

### Voice for the word

With **Spelling: letters must match exactly** ticked, the question has a **Voice for the word** section. **Word audio** says where the sound comes from: **Made with a voice** or **My own audio**. Switching between the two never deletes either file. Both stay in Assets, and each question remembers which one is in use.

**Play** (under **Word audio**, for either kind of audio) plays the sound the word's **Play sound** node plays now, so you can check it without leaving the Inspector or opening Preview.

- It reads **Stop** while it plays. It stops by itself at the end, when you move to another word or page, and when a new audio is made, chosen or recorded.
- Only one sound plays at a time.
- It is switched off, with the reason in its tooltip, until the word has audio.
- It plays in the editor only. Nothing changes in the learner's page.

If the page has more than one **Play sound** node, **Put the audio in** asks which one the word's button runs.

#### Made with a voice

Press **Make the audio with a voice**. The server turns the first accepted spelling into speech and saves it as an ordinary sound in the project's Assets, picked in that word's **Play sound** node. A page with no Play sound node gets a **Play the word** button with one. The speech is made while you are editing, so the learner's page only ever has the sound.

- **Make the audio for all words** does every word with the same voice and speed. Each word keeps its own **Say it like** and **Sentence**, and words set to My own audio are skipped.
- **Voice** and **Speed**: eight British voices (there is no Australian voice yet). A little under normal speed, the default, is clear for a spelling test.
- **Preview** plays the made voice without saving anything, so you can hear a word before it goes in.
- **Say it like**: when the voice says a word wrongly, or does not know it, type the word as it sounds in ordinary English words (`cull er` for colour). It is only used to make the audio and is never in the page. A word the voice does not know says so, and nothing is made until you give it a **Say it like**.
- **Sentence** is said after the word, as a teacher would (`The colour of the sky is blue.`). **Say the word again at the end** gives word, sentence, word. Both are only in the audio.

Make a word again after you change it (the button then reads **Make the audio again**) and the new audio replaces the old. Play every word before you share: a voice can say an unusual word wrongly, and **Say it like** fixes that.

The first time anyone uses it, the server has to download the voice once (about 130 MB), and the section offers **Set up the voice**. If the server has no speech engine it says so. You can still record the words yourself, or upload the files and pick them in the **Play sound** node.

#### My own audio

**My own audio** hides the voice controls and shows a sound picker. Choose a sound already in Assets, **+ Add a new sound…** to upload one, or **Record it now** to use your microphone. Say the word clearly and do not name the file after it. The editor warns when the file's name contains the word, because Preview and exported files keep file names (the share link renames them).

To record a word:

1. Press **Record it now**, say the word, then press **Stop recording**. The take is only held in the editor. It is not uploaded and it is not in the project yet.
2. Press **Listen** to hear it.
3. Press **Use this recording** to keep it. It is added to Assets and becomes the word's audio, as one undo step. Or press **Discard**: nothing is saved and there is nothing to undo.

**Record again** throws the take away and starts over. Moving to another word or page, or switching to **Made with a voice**, discards a take you have not used (a take of a couple of seconds or more is mentioned in a message). Closing the editor with one asks first.

Whatever you use goes in the same **Play sound** node the made voice uses, so the page's buttons and graph do not change. Marking on the server, and keeping the word off the learner's page, work as before, because your audio is still the only place the word is.

Recordings are made in the browser (webm, ogg or m4a depending on the browser). Use an uploaded mp3 or wav if you need a particular format.

### Practice mode

Tick **Practice mode** and the learner's own device reads the word aloud instead. The **Play sound** node becomes a **Read aloud** node holding the word.

The device voice has to be given the word, so **the word is in the page, where anyone can read it in their browser's developer tools**. Use it for practice, never a graded test. The question is then marked in the page and sends no grade, **Mark answers on the server** is turned off, and the share link does not hide the word.

The voice is whatever the learner's device has, and with none for the language nothing is said. Turning practice mode off puts the audio back but does not turn server marking back on: do that yourself.

### Spell checkers and writing tools

With **Spelling: letters must match exactly** ticked, the question also has a **Spell checkers and writing tools** section. It keeps spell check, Grammarly and similar tools from helping with the word. It switches off what the page can, and looks for what it can't.

**What the page switches off.** Ticking **Switch off browser spell check and writing helpers in the box** makes the answer box ask for no spellcheck, autocorrect, automatic capitals or autofill, and asks the writing tools that honour an opt-out (Grammarly and LanguageTool) to stay out. With **Block paste and drop into the box** ticked, the answer has to be typed.

**What it looks for.** The page watches for what writing tools put into it (Grammarly, LanguageTool, Microsoft Editor, ProWritingAid, QuillBot and Ginger) and for an answer that changes without anyone typing. **When a writing tool is found** chooses what happens:

- **Block until it is turned off** puts up a panel that says what was found and how to turn that tool off for this site. Nothing behind it can be reached.
- **Warn only** shows the same panel as a notice the learner can dismiss.
- **Off** looks for nothing (the other ticks still apply).

With Block, the page checks again by itself and the panel goes as soon as nothing is found. **Check again** does it on the spot. If the answer changed by itself, the learner presses a button and the answer goes back to what they typed.

New spelling questions start on **Block until it is turned off** with paste refused. Existing ones are left as they were until you change them.

**What is kept.** Whatever was found is kept with the learner's result. **Results** shows the tools found and how often the panel came up, and the results spreadsheet has a **writing tools found** column. That works on the Link for StudyDesk, where there is a learner to keep it for.

The settings, the watching and the panel are part of the player, so they work the same on the share link, in the StudyDesk embed and inside an exported single file. An exported file has no learner record to keep what was found in, so there the panel is all there is. In **Preview** the panel has a **Skip (Preview only)** button so you are not locked out of your own test.

#### Exemption code for assistive technology

Screen readers, magnifiers, switch devices and other assistive technology put nothing in the page and are never looked for. If a tool a learner relies on does look like a writing tool, set an **Exemption code**.

1. Type a code of at least 4 characters in **Exemption code** (it shows when the setting above is Block or Warn only) and press **Set code**.
2. Give the code to that learner only. The page holds only a scrambled form of it, and it is not shown again here.
3. The learner types it in the panel and is let through for the rest of their visit. Their result says an exemption was used.

**Remove code** takes it away. The panel also tells learners to ask their teacher about an exemption.

#### What the guard cannot do

Be plain with yourself about this, and with learners if you like.

- The keyboard on a phone or tablet, and a computer's own autocorrect and text suggestions, are outside the page. The page can't see them or turn them off. On an iPhone or iPad the autocorrect setting is only a hint the keyboard may ignore.
- A second device, a desktop program, or a tool that puts nothing in the page can't be seen at all.
- The list of tools is what each is known (or, for Microsoft Editor, ProWritingAid, QuillBot and Ginger, generally believed) to put in a page. A tool that changes its markers slips through until the player's list is updated, which is why the page also watches for an answer changing without typing.
- A writing helper only shows it is on in the page if it is allowed to run on this site. A learner can turn one on after the panel has gone.

So treat it as a strong nudge and a record, not a lock. It works best alongside what the test already does: the word is marked on the server and only in the audio.

### Keeping the word out of the page

The page learners get has no accepted spellings in it, because the question is marked on the server. The word is in the audio, so the audio is the only place it is.

In a project with spelling questions, **Update to the latest version** on the share link also renames every audio asset to a plain name (`colour.mp3` becomes `audio-1.mp3`) and cuts the title and comment tags out of mp3 and wav files. Other kinds of audio keep their tags, and the share says so, so use mp3 or wav. Audio the voice makes is a plain wav with no tags.

Speech made on the learner's own device (the browser reading text aloud) is not an option for a graded test. It would need the word as text in the page, which is why **Practice mode** is only for practice. Make the words with the **Voice for the word** section, or record them and upload the files.

This does not protect against a learner who writes down what they hear (that is the test), who runs the audio through speech recognition, or who has your project open in the editor. **Preview** and any file you export still carry the answers.

### Submit, Try again and Hint

On a spelling card, **Play the word** leads the button row and **Submit answer** sits at the far right (see [The button row on a question card](question-kit#the-button-row-on-a-question-card)). The starter's answer button says **Submit answer**, since the word is marked once and the mark is final. A Play the word button that the **Voice for the word** section adds to a page goes in the same place.

**Play the word** switches itself off (reading "Playing...") while the word is going, so a second press can't play it over the first. It switches back on when the word ends, is stopped or cannot be loaded.

**Try again** and **Hint** are off to begin with. Each is one project variable you change once for every word, in the Variables tab. The starter's initial value is what the learner opens with, and a word page you copy keeps all of it.

- `allowTryAgain`: a learner who got a word wrong may clear the box and have another go, for practice. The first mark still stands.
- `offerHint`: a small **Hint** pill at the top right of the card, opposite the prompt, shows the hint typed for the word in **Hints** in the Question section. The hint stays on the server with the answers, and it never holds the word.

### Tries and retakes

**Tries** is how many goes at one word (1 for a test). **Retakes**, in the Marking part and set the same on every word, lets the learner go through the whole test again. A round is every word finished once, and the server keeps each round.

- **Retakes** has three choices: **Off (first go counts, then practice)**, **A set number of retakes** (with **Retakes allowed**) and **Unlimited retakes**.
- **Score kept** says which round counts: the **Best round** or the **Latest round**.
- A **Reset question** node with **Retake** on (the starter's **Retake** button) starts the next round for every word at once. It works only when the round is finished and a retake is left, so opening a page again never uses one up.
- Until the last retake the right spelling is not shown after a wrong word, so a learner can't read the answers off one round to use in the next.

The question's `round`, `retakesLeft`, `kept` and `keptMax` variables say where the learner is and what is on record, for a results page to show.

### Grading in the LMS

Add the project to a course with the LMS's **Select content** picker (or an external tool link). When the LMS has a grade for that link, the server sends the score to it. It sends the kept score with the test's total points once every word is finished in a round, and again only when the kept score changes.

It needs the LMS to be registered for LTI 1.3 with grade passback allowed, and the link has to be set up for grades in the course. A learner signed in another way gets everything but the grade. If the LMS refuses a score, the server tries again a moment later and with the learner's next click, and the record shows what was sent.

## Accessible by default

Questions work with a keyboard and a screen reader without extra setup. These need the Accessibility preference on, which is the default.

- The prompt is a heading. The options are a radio group (or checkboxes) with their text as the name, and *Right*, *Wrong* or *This was the right answer* as the description once they are marked.
- Every part is reachable with Tab and operated with Enter and Space.
- **Check answer**, **Hint** and the ordering moves announce through the live region (see [Accessibility](accessibility)): the feedback, the hint, "Evaporation, position 2 of 4".
- Right and wrong are shown with words (✓ Right, ✗ Wrong) as well as colour.
- A matching question's terms are named buttons that screen readers announce as draggable. They are picked up and dropped with the keyboard, and the learner is told where they landed.
- A hotspot's areas are focusable radio buttons (checkboxes when several are right) named after the area, so the picture can be answered without a mouse. Give every area a name, and the picture an accessible description.

## Copies, deleting and changing type

- **Duplicate** a question and the copy shares the original's variables, so the Question section warns and offers **Make this one independent**, which gives the copy its own variables and nodes.
- Changing **Type** rebuilds the answer area (a different set of layers) and keeps the prompt, buttons and feedback as you styled them. Settings that make no sense for the new type are left alone.
- Delete a button you don't want (say Hint): its wiring goes the next time settings change, and nothing else is affected. The Hint button hides itself when the question has no hints.

## Reference

A question keeps its settings on its frame, and each part layer is marked as part of the question, so the settings can find it again after it is renamed or moved. Both are in the exported file. The player uses the settings and ignores the markers. The nodes are **Check answer**, **Reset question**, **Show hint**, **Choose option** and **Move item** in the [node reference](interaction-nodes).
