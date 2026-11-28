# The story stage and the cast
The page a story plays on, the characters on it, and the nodes that move the story along.

The **story stage** is an ordinary page whose layers are bound to the story's values, so you restyle the dialogue box, the name plate or the choices like anything else. **Start a story** makes one; any page with a layer reading a `story.` value works, and the Story tab's **Settings** can name one.

**What it shows:** the background (`story.background`, fading in over `story.backgroundBefore`), the cast (a list of `story.cast`, each with `item.image`, `item.x` across the stage from 0 to 1, `item.brightness`), the dialogue box (`story.speaker`, `story.speakerColour`, and words with **Story words** on bound to `story.marked`, with **Letters shown** bound to `story.shown`), and the choices (a list of `story.choices`).

**Three looks for the words:** the box along the bottom; the whole screen of text, which keeps each line said on it as the next types under it (good for long narration, `[box clear]` starts a fresh screen); and speech bubbles by whoever's talking, with a tail pointing at them. **Words shown in** in the Story tab's **Settings** picks one for the story, and a `[box ...]` line changes it from there on.

**Keeping faces clear:** a bubble sits under the speaker's face unless **Bubble sits** in the **Settings** says above their head, beside them or along the top. Above and beside go under instead when there's no room or they'd cover someone else's face. Set **Face at** on a cast member whose face isn't near the top of their picture.

**Going on:** a click anywhere that isn't a button, Space or Enter finishes the line or goes to the next, and 1 to 9 pick a choice. A page with its own **Go on** node keeps clicks to itself. The stage's buttons: **Back** goes back a line (undoing what happened since), **Auto** goes on by itself, **Skip** flies through lines read before, **Hide** puts the box away until the next click.

## The cast

Each character in the Story tab's **Cast** has a name (as lines use it), what the name plate says, its colour, where they stand, and their **Faces**: a picture for each expression, the first being the one they come on with. Add pictures named after them (`Millie smiling.png`, `Millie sad.png`) to Assets and **Add faces from pictures named Millie** fills the list in. Or drop their Photoshop file on the form (or press **Faces from a PSD**): a group called **Faces** with a layer per face over the body gives a picture of the whole character per face, all lined up, with layers named `happy blink` and `happy talk` as that face's blinking and talking pictures. Whoever isn't speaking is dimmed a little (**Settings** turns that off).

**Nodes:** **Start the story** (a New game button, or from a scene), **Go on**, **Pick choice**, **Back to the story**, **Auto or Skip**, **Go back a line** and **On story end**. Scripts get `ix.story`.

**Good to know:**
- Someone who asked for less motion gets no shake or zoom, and the words don't wobble.
- A screen reader hears each line once, whole, as it comes up.
- Lines read on this device are remembered, which is what Skip goes by.

help:story help:story-game help:repeaters help:bindings
