import type { Concept } from './index';

export const concept: Concept = {
  order: 30,
  area: 'construction',
  topic: {
    id: 'concept-events-actions',
    title: 'Events, actions and the graph',
    group: 'Concepts',
    summary: 'Nothing happens unless an event is joined to actions. The Interactions graph is the program; the sentences in the Inspector are another way of reading it.',
    keywords: 'concept event action node graph interactions on click property flow wire sentences inspector when clicked how do I make it do something nothing happens three views',
    body: `Nothing in a project does anything by itself. Something happens because an **event** (green: a click, a key, the page being shown, a timer, a value changing, an animation finishing) is joined to **actions** (blue: play an animation, change a value, show a layer, go to a page). **Logic** nodes (purple) choose which way a flow goes.

Each page has its own graph in the **Interactions** tab, and that graph is the whole program for the page. There is no hidden "on click" setting anywhere else.

## Where people get caught out

- **"Where is the on click setting?"** A layer has no click property. Select it and press **+ When clicked…** in its **Interactions** section. That adds a **When clicked or hovered** event and the action you pick to the graph, joined.
- **"There are three ways to look at one interaction."** They are one thing. The graph holds the nodes. The sentences in a layer's **Interactions** section (**When clicked: play "Timeline".**) and the **Read as sentences** view over the graph are written from those nodes every time, so they can't disagree with it. **Show in graph** under a sentence takes you to its nodes.
- **"I added an event and nothing happens."** An event with nothing joined to it says **nothing happens yet** in its sentence. Join an action to its output.
- **"Something ran that I didn't expect."** Two events can listen for the same thing. Two **+ When clicked…** on one button make two flows, and both run on every click.
- **"It ran once, then never again."** **Only the first time** lets a flow through once. **When the activity has loaded** runs once per visit, while **When the page is shown** runs every time the page appears.
- **"My button does nothing on the canvas."** No event fires on the canvas. Test in Preview: see [The canvas shows the start; Preview runs it](concept-canvas-vs-preview).

## How to tell what is going on

- In Preview, the **Events** list shows each event as it fires, which layer it came from and what it set off. Click an event's name to select its node in the graph.
- Press **Beside editor** in Preview's bar to keep the graph in view. Nodes light up green with *ran* as they run, and the wires they follow pulse.
- **Read as sentences** lists steps that nothing starts under **Not joined to anything, so these never run**.

![Preview beside the editor after a click on Next: the Events list shows On pointer (Next) then Set variable, and in the Interactions graph below, Next's event and its two Change a value or counter nodes are green, marked as having run.](help/concept-events-actions-beside-editor.png)

**More:** [Interactions](interactions), [See what ran](interactions#see-what-ran), [Interaction node reference](interaction-nodes), [Tutorial 2: Your first interaction](tutorial-first-interaction).`,
  },
};
