# Tutorial 2: Your first interaction
Add a button that plays your animation when someone clicks it, using the Interactions graph.

Now make the animation wait for a click. You will use the **Interactions** tab, where an *event* (something happens) starts a flow of *actions* (do something). It builds on [Tutorial 1](tutorial-first-animation): open that project, or any project with a timeline in it.

## 1. Stop the timeline starting by itself

1. Open the **Timeline** tab and check that **Autoplay** is **off**. If it is on, the box would slide as soon as the page shows.

## 2. Add a button

1. Press <kbd>B</kbd> for the **Button** tool and drag a button below the box.
2. In the Properties panel, change **Label** to **Slide the box**. The label is the text on the button. Change **Name** to **Slide button** so you can find it later.

## 3. Say what should happen

1. With the button selected, scroll the Properties panel to its **Interactions** section and press **+ When clicked…**.
2. A short list of things that can happen opens. Choose **Play an animation**, then pick your timeline under **Which animation**. The line at the bottom reads back what it will do: *When clicked: play “Timeline”*.
3. Press **Add**. The **Interactions** graph opens at the bottom, zoomed in on the two new nodes (more on them in step 4), and the section now says it in a sentence: **When clicked: play “Timeline”.** (If you would rather the view stayed put, untick **Show new interactions in the graph** in [Preferences](preferences#interactions).)

That is the whole interaction. The same list can go to another page, show or hide a layer, play a sound, open a link, change a number or switch something on or off. Every one is added to the **Interactions** graph as ordinary nodes, so you can always take it further.

> A shortcut: right-click a layer, choose **Add interaction**, then **When clicked…**.

## 4. See what it made

1. The bottom panel has switched to **Interactions** and picked the new nodes. (If you look away, **Show in graph** under the sentence brings you back to them.)
2. There are two nodes, joined: a **When clicked or hovered** event (its settings say **Layer: Slide button** and **Event: Click / tap**) and a **Play or stop an animation** action. The sentence in the Properties panel is made from exactly these.
3. The **Read as sentences** button above the graph shows the whole page this way. Use it to read a graph somebody else built.

![The Interactions tab: the node palette on the left, the graph in the middle and the selected node's settings on the right.](help/interactions-panel.png)

## 5. Build the same thing by hand

The graph can do much more than the list, and it helps to have drawn one flow yourself. Remove the sentence (**Remove** under it), then:

1. Press **+ On click (empty)** in the Interactions section. A **When clicked or hovered** node appears with nothing joined to it.
2. Find the small dot on the right edge of the **When clicked or hovered** node. That is its output. Drag from the dot into empty space and let go.
3. A menu called **ADD AND CONNECT** opens. It lists only the nodes that make sense there. Choose **Action**, then **Play or stop an animation**. The new node appears where you let go, already connected.
4. Click the **Play or stop an animation** node. Set **Timeline** to **Timeline** (the one you made), and **Do** to **Play**.
5. Leave **Continue** on **When it finishes**. That setting decides when the *next* node would run. It matters once you chain more actions after this one.

![Dragging a connection into empty space: let go, pick a node, and it is added and joined for you.](help/drag-to-connect.mp4)

## 6. Try it

1. Press **Preview**.
2. Click **Slide the box**. The box slides.
3. Want it to start from the left every time you click? Set **Do** to **Restart** on the **Play or stop an animation** node instead of **Play**.

## Go further

- **Toggle.** Add an **Alternate between two paths** node after the event. Join its **a** output to **Control timeline: Play** and its **b** output to **Control timeline: Play in reverse**. Each click now alternates.
- **Hover.** Use **+ When hovered…** in the Properties panel for a hover effect, such as **Show a layer**. For more control, **+ On hover (empty)** and the **Show or hide a layer** or **Animate a layer's setting** actions.
- **Wait.** A **Wait** node pauses a flow for some milliseconds before the next node.
- **Log.** A **Log** node writes to your browser's console, which is handy when you're not sure a flow ran. The Preview's event list also shows every event as it fires.

## What you learned

- **Events** (green) start flows, **actions** (blue) do things, **logic** (purple) chooses the way.
- **+ When clicked…** writes the nodes for you, and **Show in graph** shows them. You can also drag from an output into empty space to add and join a node in one move.
- The **Preview** and its event list are the quickest way to test.

**Next:** [Tutorial 3: A state machine with variables](tutorial-state-machine). More on the graph: [Interactions](interactions) and [Interaction node reference](interaction-nodes).
