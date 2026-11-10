import type { Concept } from './index';

export const concept: Concept = {
  order: 230,
  area: 'construction',
  topic: {
    id: 'concept-seeds-random',
    title: 'Random, shuffle and seeds',
    group: 'Concepts',
    summary: 'A seed makes a shuffle come out the same way every time. Without one it is different on every run, and you can\'t repeat it.',
    keywords: 'concept random shuffle seed same order every learner repeat reproduce bug randInt random node word search order question shuffle different each time',
    body: `Some things in a project are random: the **Random** node, a question's **Shuffle**, and the formula helpers \`shuffle(list)\` and \`randInt(a, b)\`. Each run comes out differently, so no two learners see quite the same thing.

The \`shuffle\` helper can also take a **seed**: \`shuffle(cards, 42)\`. A seed is a number that fixes the order. The same list with the same seed always gives the same order; another seed, another order. \`wordSearch(words, size, seed)\` works the same way, and so do text modifiers set to **Randomize** (their **Seed** field).

The **Random** node, a question's **Shuffle** and \`randInt\` take no seed. They are different every time.

## Where people get caught out

- **"Every learner gets the same 'random' order."** The seed is a fixed number, so everyone gets the order that number makes. \`wordSearch(words, 12)\` uses seed 7 when you give none, so every learner gets the same grid. Leave the seed out of \`shuffle\` for a new order each time, or make the seed itself random (below).
- **"A learner says something went wrong and I can't make it happen."** Without a seed you can't get their order back. Make a number variable \`seed\`, worked out from the formula \`randInt(1, 100000)\`, and below it in the Variables list a list worked out from \`shuffle(cards, seed)\`. Each learner still gets their own order, and with their seed you can get it again. Show \`{seed}\` somewhere small, such as the end page, so they can tell you it.
- **"I typed the seed into a text box and it did nothing."** The seed has to be a number. Text such as \`"42"\` is ignored, and the shuffle goes back to being different each time.
- **"I changed the seed in Preview and the order stayed."** A variable worked out from a formula is worked out once, at the start. Tick **Keep up to date** on the shuffled list so it is worked out again when \`seed\` changes.

## How to tell what is going on

- The line under a formula field says *changes each time it runs* for \`shuffle(list)\` with no seed and for \`randInt\`. With a seed it shows the order you will get.
- In Preview, **Variables (live)** shows \`seed\` and the shuffled list. Type a learner's seed into \`seed\` and press <kbd>Enter</kbd> to see their order.
- **Restart** in Preview starts a new run: a new random seed, a new shuffle.

**More:** [Helpers](expressions#helpers), [Worked out from a formula](variables#worked-out-from-a-formula), [Live variables](variables#live-variables), [Shuffle](question-kit#shuffle), [Put the steps in order](tutorial-order).`,
  },
};
