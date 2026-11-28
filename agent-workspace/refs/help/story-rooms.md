# Rooms, things you carry and a map
Scenes to look around, hidden hint coins, things to pick up and show people, and a map of the places the story has opened.

A **room** is a page the reader looks around: they click things to hear about them, find hidden hint coins, and pick up things to carry. A **map** takes them between places as the story opens them.

**Make one:** in the **Story** tab press **+ New room**. You get a room drawn from shapes with five places to look at, two hidden hint coins, a key in the desk, the room box their words show in, what the reader carries, and **Leave**. Swap the shapes for a background picture and keep invisible layers on top as the places. Call it with `[call Room]`.

**Something to look at:** select any layer and press **+** on its **Look at** section. **Words** is what's said when it's clicked, a line each (`Millie: Too tidy.` works). **Hint coins** and **Gives** make it a collectable: it gives them the first time and then disappears, unless **Stays when picked up** is on (a desk with a key in it). It gets a magnifier cursor and is a button for the keyboard too.

**Things you carry** come from collectables and from the script: `[give Brass key]`, `[take Brass key]` and `[coins 2]`. Ask about them in an if or a choice, which is how you show someone a thing:

```
? Show the brass key [if has("Brass key")]
    Olive: That opens the shed!
```

**The map:** `[place Library]` opens a place (`[place Library, off]` closes it), and **+ New map** makes a page with a button for each open place that goes to the scene of that name (**Go to a scene**). Call it with `[call Map]`.

**Good to know:** `story.items`, `story.coins` and `story.places` are there for pages of your own (an inventory, say), and a save keeps all of them. On a room, `room.text`, `room.speaker` and `room.showing` drive the room box.

help:story help:story-puzzles
