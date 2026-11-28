# Writing a story
A visual novel, a branching scenario or a role play written as plain text: who says what, the choices, and where the story goes next.

A **story** is written as text, one line per thing that happens, the way you'd write a play. It plays on a stage page with a dialogue box, the characters and the choices, so a 50 line conversation or a 50,000 word novel needs no page per line and no boxes in the graph.

**Start one:** open the **Story** tab and press **Start a story**. You get a sample chapter, two characters and a **Story stage** page, already wired. Press **Preview** to play it, then make it yours. For a whole game, start a new project from the **Visual novel** template instead: it adds a title screen, saves, history, settings and extras (see [Saves, settings and extras](story-game)). The **Puzzle mystery** template adds a case to solve: a room to search, three puzzles and a map (see [Puzzles in a story](story-puzzles) and [Rooms, things you carry and a map](story-rooms)).

**How lines work:**
- `Millie: You came!` is Millie talking. `Millie (smiling, left, slide): You came!` also picks her face, where she stands (far left, left, centre, right, far right) and how she comes on (slide, fade, hop, instant), in any order.
- A line without a name is narration. Start it with `>` if it begins like a name (`> Note: it was open.`).
- `# The club fair` starts a scene. `-> The club fair` jumps to it, `-> Chapter 2` to a chapter, and `-> end Good friends` ends the story, saying which ending.
- `? Join the club` is a choice. The lines indented under it run when it's picked, then the story carries on after the last choice. `[once]` on the end hides it once taken, `[if flyer]` only shows it when that holds, and `[if flyer, grey]` shows it greyed out instead.
- `if trust >= 3`, `else if`, `else`: the indented lines only run when it holds. `set trust += 1` changes a value. A name that isn't a variable is kept by the story itself.
- Cues go in square brackets on their own line: `[bg Quad]`, `[music Hopeful]`, `[music off, 2s]`, `[sound Door]`, `[show Olive at right]`, `[hide Olive, fade]`, `[wait 1s]`, `[shake]`, `[flash]`, `[tint night]`, `[zoom Millie]`, `[weather snow]`, `[box full]`, `[box bubble]`, `[box bottom]`. Pictures and sounds are found by their name in Assets.
- `[call Puzzle 1]` goes to that page and waits; a **Back to the story** node there comes back, with a result the story reads as `story.result`. `[open Notebook]` opens an overlay and waits for it to close, `[play Intro]` plays a timeline on the stage, `[run Give badge]` runs a flow.
- Inside a line: `{name}` shows a value, `{pause}` holds the typing, `{fast}`, `{slow}`, `{shake}...{/shake}`, `{wave}`, `{b}`, `{i}`, `{big}`, `{small}`, `{colour red}`.
- `//` starts a note for writers that's never shown.

**In the panel:** lines with a problem are marked, and listed under the script with a fix where there is one (**Add Hale** for someone not in the cast). **Preview from this line** plays from the caret, with the background, music and characters as the lines above leave them. The side shows word counts per chapter and per character. Download a chapter as text, or replace it with a text file: lines that didn't change keep their voice files and their place in saves.

help:story-dialogue help:story-stage help:variables help:interactions
