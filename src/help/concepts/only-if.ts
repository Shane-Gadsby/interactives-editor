import type { Concept } from './index';

export const concept: Concept = {
  order: 220,
  area: 'construction',
  topic: {
    id: 'concept-only-if',
    title: 'Only if, Check a condition, and turning a flow off',
    group: 'Concepts',
    summary: 'Only if decides whether an event runs its flow at all. Check a condition chooses a way inside a flow. Both take a yes/no formula.',
    keywords: 'concept only if condition check a condition if branch true false guard feedback shows both wrong place turn off flow disable held back blocked nothing happened',
    body: `There are two places to put a yes/no check, and they do different jobs.

- **Only if** is on every event node. When it is false the event does nothing at all: the flow doesn't start. Use it when the event should only count sometimes (a key only while a question is open, a timer only while \`running\`).
- **Check a condition** is a node inside a flow. The flow has already started, and it carries on down **true** or **false**. Use it when both answers lead somewhere, such as right and wrong feedback.

Both take a formula, or the pickers (**[score] [is at least] [5]**). A formula that can't be worked out counts as false.

## Where people get caught out

- **"Both feedback messages show."** The check is missing or in the wrong place: two flows run from the same click, one for each message. Use one flow with a **Check a condition**, the right feedback on **true** and the wrong feedback on **false**. Or give each event its own **Only if**, one the opposite of the other.
- **"Nothing happens when I click."** An **Only if** may be saying no. In Preview, the Events list says so (see below).
- **"My check never goes the true way."** Look at the line under the formula field. It shows what the formula works out to with the starting values (*currently false*), and in red what is wrong: a misspelt name, or a single \`=\` where \`==\` was meant.
- **"Can I switch a flow off without deleting it?"** Yes. **Turn off** under the flow's sentence (in the layer's **Interactions** section, or in **Read as sentences**) puts \`false\` in front of the event's **Only if**. **Turn on** takes it away again, and a condition that was already there stays.

## How to tell what is going on

- In the graph, an event with an **Only if** shows a short **if …** under its name.
- In Preview with **Beside editor**, an event whose **Only if** said no goes grey with *held back*, and nodes that ran light up green. A **Check a condition** sends its pulse down the wire it took.
- When a click starts nothing because of an **Only if**, the Events list says so under **Why did nothing happen?**.
- **Variables (live)** in Preview shows the values the condition reads, and you can change them to try the other way.

**More:** [Only if](interactions#only-if), [Conditions with pickers](interactions#conditions-with-pickers), [See what ran](interactions#see-what-ran), [Checks as you type](expressions#checks-as-you-type), [Tutorial 3: A state machine with variables](tutorial-state-machine).`,
  },
};
