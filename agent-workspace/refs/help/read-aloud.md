# Read it to me
Let learners hear any text, question or feedback with a voice on their own device: a Listen button, a Read aloud node, a project setting and a speed choice.

**Read it to me** lets a learner hear what is on the page. The words are spoken by a voice already installed on **their own device**: nothing is recorded, saved as a file or sent anywhere, and nothing needs permission. It helps learners with dyslexia, low vision, a second language or a tired pair of eyes, and it is never the only way to get at something (images still need a text alternative).

## Three ways to use it
- **Project setting.** In Project settings open **Read aloud** and tick **Offer read-aloud**. Every artboard gets one **Listen** button, a pause and a speed choice in the same corner. It reads the text layers that show, in layer order. Set **Language** (such as *en* or *fr-CA*) so only a voice for that language is used.
- **A Listen button layer.** Press **Add a Listen button to this artboard** in the same section. It is an ordinary button with two nodes behind it (one reads the artboard, one stops it), and a line that shows when the device has no voice. Restyle and move it as you like.
- **The Read aloud node.** In the Interactions tab, **Read aloud** says a text expression, a question and its options, the feedback after a check, or the whole artboard.

The same node can **stop**, **pause**, **carry on**, say the **last thing again**, and make the learner's speed **slower** or **faster**. **Continue when it finishes** holds the next node until the words are said. **With no voice** set to *Announce the same words to screen readers* sends the words to the live region when the device has no voice for the language, so nobody misses feedback; **Only speak when** takes a condition (a "spoken prompts" variable, say) and while it is false the voice stays quiet and the words are announced instead if that choice is on.

## What the learner gets
**Listen** starts it, the same button pauses and carries on, and a speed menu offers 0.75, 1, 1.25 and 1.5. The speed is remembered in their browser with their caption and sound choices. Reading never starts by itself: iOS only lets the first words start from a tap, and a voice starting uninvited clashes with a screen reader. Speech stops when the learner moves to another artboard.

## With no voice
Only voices that run on the device are used (a browser's network voices are skipped), and only for the right language. When there is none, the Listen button is left out and a short line says why. In your own graph, bind a layer's **Visible** to **voiceAvailable** to hide anything that needs it, and always keep the text readable on its own. Test on the devices your learners use: some Linux and managed computers have no voice.

## Words a voice gets wrong
Select a layer and fill **Say it like** in the Accessibility section: the voice says that instead of the layer's text. Write the sounds ("pie one", "the Ma-too-eye people"), spell out a formula, or leave out a decoration. A group with **Say it like** is read as a whole, not twice. For a question, **Say the prompt like** and **Spoken explanation** do the same (see [Questions](question-kit)).

## Expression names
- **voiceAvailable**: true when a voice on this device can read the project's language.
- **speaking**: true while a voice is reading.
- **readRate**: the learner's speed.
A variable with the same name wins.

## Scripts
A script can call **ix.speech.say(text, {lang, rate})** (it answers true when it was said to the end), **stop**, **pause**, **resume**, **repeat**, and read **available**, **speaking**, **paused**, **rate**, with **setRate**. It works in sandboxed scripts too.

## Good to know
- Maths, drug names, abbreviations and mixed-language text read badly: use **Say it like**.
- A screen reader user already has a reader, and two voices at once is worse than one. The Listen button is a plain button they can skip, and it is not the route to offer them.
- The first words must start from a click or tap, so put a Read aloud node behind a button or key, not a timer.
- Music marked as a **Soundtrack** goes quiet under the voice and comes back after it: see [Soundtrack music](captions#soundtrack-music).
- The **Audio-first quiz** starter (Templates, Built-in, Quizzes and questions) is a whole quiz built on this: it reads each question and its options, the keys 1 to 4 answer, R repeats, S slows, H gives a hint and Space pauses, and the score page speaks the score and offers the missed questions again. With no voice it is an ordinary keyboard quiz.
