import type { Concept } from './index';

export const concept: Concept = {
  order: 10,
  area: 'interface',
  topic: {
    id: 'concept-canvas-vs-preview',
    title: 'The canvas shows the start; Preview runs it',
    group: 'Concepts',
    summary: 'Nothing happens on the canvas when you click a button: it shows every page as it starts. Events, timers, scripts and changing variables only run in Preview.',
    keywords: 'concept canvas preview edit play run does nothing not working click button nothing happens hidden ghost starting value initial binding changes run mode',
    body: `The canvas is where you build. It draws every page **as it is when it starts**: each variable at its starting value, each timeline at its first frame, each data source as first loaded. Nothing on it runs. Clicking a button on the canvas selects the button; it doesn't press it.

**Preview** (top right) is the project running, exactly as a learner gets it. Events fire, timers tick, scripts run and variables change.

## Where people get caught out

- **"My button does nothing."** On the canvas it never will. Press **Preview** and click it there.
- **"I can't find the layer I hid."** A layer that starts hidden shows on the canvas as a faint ghost, so you can still see and select it. In Preview it is gone until something shows it.
- **"My binding isn't working."** A binding on the canvas uses the starting values. If \`score\` starts at 0, the canvas shows what 0 looks like. To see other values, change the variable while Preview is running.
- **"I changed the starting value and Preview didn't change."** Preview starts from the starting values once. Press **Restart** in Preview's bar to start it again with the new ones.
- **"It worked in Preview but the canvas looks wrong."** The canvas shows the start, before any event has run. A layer an event moves on load, for example, is still where you drew it.

## How to see what is going on

- In Preview, the **Variables (live)** list on the left shows every variable as it changes, and you can set them by hand there.
- The **Events** list under it records each event and the nodes it ran, and says why a click did nothing.
- **Beside editor** in Preview's bar moves Preview up to the right, so the canvas and the **Interactions** graph stay in view. Nodes that ran light up green and the wires they followed pulse.

**More:** [Preview](interface#preview), [Variables](variables), [Bindings](bindings).`,
  },
};
