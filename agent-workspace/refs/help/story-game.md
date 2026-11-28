# Saves, settings and extras
The parts that make a story a game: save slots, Continue, the reader's settings, the history, a gallery, endings and chapter select.

The **Visual novel** template (**Templates**, **Built-in**) has all of these as pages you can restyle: **Title**, **Story stage**, **History**, **Save and load**, **Settings** and **Extras**. They're made from the nodes and values below, so you can build your own too.

**Saving:** **Save the story** keeps where the story is and every variable in a slot (1, 2, 3..., or quick), and **Load the story** puts it all back and shows the stage. The story saves itself in **auto** at every choice, and slot **latest** is the newest of all, which is what **Continue** loads (`story.canContinue` says whether there's one). A list of `story.saves` shows the slots with `item.chapter`, `item.scene`, `item.when`, the last words and the background as a picture. **Settings** in the Story tab sets how many slots there are. Saves stay in the reader's browser.

**The reader's settings:** **Story setting** changes text speed, Auto speed, whether Skip goes through unread lines, the music, voice and effects volumes, text size, an easier to read font, **Captions for sounds** and **Show song titles**, kept on their device. Read them as `story.prefs`: the stage's words are bound to `26 * story.prefs.textSize`.

**Sound captions:** give a sound a caption in **Assets** (its **Caption** button): what it is, *Door slams*, or a song's title. When `[sound]` or `[music]` plays it, a reader with captions on sees it as `story.caption` for a few seconds (longer for more words); the template's stage shows it along the top as *[Door slams]* or *♪ Hopeful*. **Show song titles** shows the music's ones even with captions off. Nothing comes up while skipping, and a sound with no caption shows nothing.

**History:** a list of `story.history` shows what was said, and **Go back a line** with `story.history.length + 1 - item.number` lines back returns to one.

**Extras:** `story.gallery` (every picture a `[bg]` line shows, with `item.seen`), `story.endings` (with `item.reached`), `story.chapters` and `story.musicRoom` (`item.heard`) unlock as this reader gets to them, across every playthrough.

**Characters that feel alive:** give a face a **Blink** picture and they blink now and then; give it a **Talking** picture and their mouth moves while their words type on or their voice plays. A **Blip** sound in the cast plays as their words type on, higher or lower with **Blip pitch**. All of it holds still for someone who asked for less motion.

**Voices:** **Download the voice script** in the Story tab gives the actors a spreadsheet of every spoken line, with the file name to save each recording as. Put the recordings in Assets and **Match voice files** ties each to its line, which keeps it through any edit to the words. A voice plays as its line comes up, and Auto waits for it.

**Big stories:** on the link, a story loads the pictures and sounds of the next stretch (the next scenes, every branch, where a jump goes) while the reader reads, and lets go of the ones far behind, so a story with hundreds of pictures starts as quickly as a small one. A file you download carries everything at once, so share a big story as a link.

**Good to know:** holding **Ctrl** skips while it's held.

help:story help:story-stage help:story-puzzles
