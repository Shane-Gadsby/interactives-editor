# Puzzles in a story
A puzzle page with a number, a value that drops with each wrong try, hints bought with hint coins, a memo, and a puzzle index.

A **puzzle** is a page the story goes to and comes back from. It has a number and a title, a value in points that drops a little with each wrong try, up to three hints and a big hint that the reader opens with **hint coins**, a memo to scribble on, and a big moment when it's right.

**Make one:** in the **Story** tab press **+ New puzzle**. You get a page with a question in the middle and the puzzle frame around it, all wired. Change the question like any other, and the title, value and hints under **Puzzle** in the page's settings. Any page can become one with the **+** on its **Puzzle** section.

**Call it from the story:** a line like `[call Puzzle 1]` goes to the page, and the story carries on when the reader leaves it. `story.result` says how it went:

```
[call Puzzle 1]
if story.result == "solved"
    Millie: I knew you'd get it.
else
    Millie: We'll come back to that one.
```

**Answering:** a question on a puzzle page answers the puzzle when it's checked, whatever kind it is (a choice, putting things in order, filling a blank, dragging into groups). For a puzzle made of anything else, wire a **Puzzle answer** node (Right or Wrong) to what decides it.

**The frame** is plain layers bound to `puzzle.*`, so restyle it freely: `puzzle.label` (Puzzle 1), `puzzle.title`, `puzzle.value`, `puzzle.coins`, a list of `puzzle.hints` (`item.label`, `item.open`, `item.cost`, `item.canOpen`), `puzzle.hintText` for the hint being read, `puzzle.memo`, and `puzzle.right` and `puzzle.wrong` for the big moments. The nodes behind its buttons are **Open a hint**, **Puzzle memo**, **Puzzle answer** (Try again) and **Leave the puzzle** (with **Skip it** for Skip).

**Hint coins:** a new game starts with the number in the Story tab's **Settings** (3 unless you say). The **Hint coins** node gives more (a collectable in a room, a reward). Each hint costs coins once; an open hint stays open.

**The index:** `story.puzzles` lists every puzzle page with `item.found`, `item.solved`, `item.skipped` and `item.score`, and `story.score` adds them up. Going to a found puzzle's page plays it again, without changing its score. The **Visual novel** template has a **Puzzles** page under Extras that does this.

**Good to know:** a save keeps the coins and the index with everything else, and a new game empties them.

help:story help:story-game help:story-rooms
