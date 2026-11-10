import type { Concept } from './index';

export const concept: Concept = {
  order: 90,
  area: 'construction',
  topic: {
    id: 'concept-components',
    title: 'Components: one page, placed many times',
    group: 'Concepts',
    summary: 'Any page can be placed inside another as a component. Each copy is an instance that follows its source page, and Inputs are how one copy differs.',
    keywords: 'concept component instance source page main reuse inputs copy edit instance change everywhere detach library shared variables per copy symbol',
    body: `A **component** is just a page placed inside another page. The layer it makes is an **instance**, shown in the Properties panel as **Component**. The page it comes from is the source: change the source page and every instance of it changes.

An instance is one layer. You can move it, size it, choose how the page fits its box (**Fit**), and give it **Inputs**: starting values for the source page's variables, by name, written as JSON such as \`{"label": "Next"}\`. Each instance runs its own copy of the page, with its own timelines and its own variables, so one copy can say *Next* while another says *Back*.

A **library** shares components between projects. Placing one copies its page into your project as a read-only **library page**.

## Where people get caught out

- **"I can't edit the button inside the instance."** The layers inside belong to the source page. Press **Edit** followed by the page's name in the Component section to go there, and the change reaches every instance.
- **"I changed one instance and the others didn't follow."** Size, position, Fit and Inputs are that instance's own. Only changes to the source page reach them all.
- **"I want one copy to look different."** Give the source page a variable for what changes (the label, a colour, a level), bind it, and set it per copy in **Inputs**. A timeline can key an input too.
- **"The library page won't let me edit it."** It is read-only so it can take updates. **Detach to edit** makes it a normal page and stops its updates. It asks before it does.
- **"Changing a variable in one copy changed it in all of them."** That variable is marked shared: one value for the page and every instance inside it. Some imported animation files bring their variables in this way; there is no switch for it in the Variables list. Ordinary variables are one per copy.

## How to tell what is going on

- Select the instance: the **Component** section names the source page in its **Artboard** field and shows the Inputs it sets.
- A library page carries a **Library** section saying where it came from and which version.

**More:** [Instances (components)](instances), [Settings on an instance](instances#settings-on-an-instance), [Steering an instance while it plays](instances#steering-an-instance-while-it-plays), [Libraries](libraries), [Bindings](bindings).`,
  },
};
