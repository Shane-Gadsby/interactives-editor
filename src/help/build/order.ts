import type { BuildTutorial } from './index';
import { layerWhere, question, renamed, saw } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 23,
  level: 'intermediate',
  minutes: 12,
  example: 'tut-order',
  topic: {
    id: 'tutorial-order',
    title: 'Put the steps in order',
    group: 'Build it',
    summary: 'Six shuffled steps the learner moves up and down, from the mouse or the keyboard, checked against the right order with part marks, and restyled in one go.',
    keywords: 'tutorial order ordering sequence steps put in order arrange reorder shuffle move up down keyboard right order part marks restyle repeater list process',
    body: `You will make an ordering question: the steps for making a cup of tea, dealt in a shuffled order, for the learner to put right. Each step has an up and a down button, so it works from the keyboard as well as the mouse. **Check answer** compares the list with the right order and gives a point for each step in its place. Then you restyle all six steps by changing one. It takes about twelve minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Put the steps in order**. **Play** runs it and **Make my copy** gives you your own copy.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Make a cup of tea** as the name and press **Create project**.

## 2. Add the question

1. In the tool bar down the left, open the **Web** group (click **Web** if it is folded).
2. Click **Add question** and pick **Put in order**.

A card called **Question 1** appears with a sample prompt and four steps of the water cycle (Evaporation, Condensation, Precipitation, Collection), each with **↑** and **↓** buttons. It is selected and the **Question** section is open in the Properties panel.

## 3. Write the steps in the right order

The list in the **Question** section is always the **right** order. The learner never sees it that way: **Shuffle** is ticked, so the steps are dealt in a different order each time, and never already right.

1. Replace the **Prompt** with \`Put the steps for making a cup of tea in order.\`
2. Type over the four sample items with the first four steps, in order: \`Boil the water\`, \`Put a tea bag in the cup\`, \`Pour the hot water in\`, \`Let it brew for three minutes\`.
3. Press **+ Add item** and type \`Take the tea bag out\` in the new, empty box. Press it again and type \`Add milk if you like\`.

The arrows beside an item move it earlier or later in the list, which changes the right order. **×** removes an item. The canvas already shows the steps shuffled.

![The canvas and the Question section: the six tea steps in the right order in the panel, and shuffled on the card.](help/tutorial-order-items.png)

Six steps make the card taller than the 800 × 600 page, so the buttons would be cut off in Preview. Click **Home** at the top of the **Layers** panel to select the page, and make **H** bigger in the **Page** section, such as \`700\`.

## 4. Marking, hints and feedback

1. Under **Marking**, set **Points** to **6** and **Tries** to **2**. **Part marks** is already ticked, so each step in its right place is worth one point: four in place scores 4.
2. In **Hints**, type \`You can't brew anything until the water is hot.\`
3. Change the feedback lines:
   - **Right**: \`That's the order. Enjoy your tea!\`
   - **Wrong**: \`Not yet. Think about what has to happen first.\`
   - **Partly right**: \`Some steps are in the right place, but not all. Move a few and check again.\`
   - **Out of tries**: \`Out of tries. Here is the right order.\`
4. Leave **Show the right answer when finished wrong** ticked. When the tries run out, the steps move into the right order and the ones that were out of place are marked.

## 5. Restyle every step at once

The steps are one **Item** layer repeated once for each step, so changing that one layer changes all six.

1. At the bottom of the **Question** section, under **Restyle a part**, press **Option**. It selects the layer called **Item**.
2. In the **Frame** section, type **26** in one of the four corners under **Radius**. They are locked together, so all four change and every step becomes a pill.
3. Press **Question 1** in the **Layers** panel to go back, and under **Restyle a part** press **Option text**. It selects the layer called **Label**. Set its **Weight** to **600**. Every step's words become bolder.

![The Item layer selected in the Layers panel, every step on the card turned into a pill, and the four Radius corners set to 26 in the Frame section.](help/tutorial-order-restyle.png)

Leave the fill colour alone: it is set by the question, so a step can turn green or red when it is marked. Change the font, size, radius, padding and shadow as much as you like.

## 6. Try it

1. Press **Preview** at the top right. The steps are shuffled.
2. Move them with **↑** and **↓** until you think they are right, and press **Check answer**. If some are out of place the **Partly right** feedback shows (or **Wrong**, if none are in their place).
3. Now use the keyboard: press <kbd>Tab</kbd> until a **↑** or **↓** button is outlined (a screen reader hears *Move Boil the water up*), and press <kbd>Enter</kbd> or <kbd>Space</kbd> to move that step.
4. Check again with a step still out of place. That was the last try: the steps jump into the right order, the ones you had in the right place say *✓ Right*, the ones you had wrong say *← Right answer*, and the score shows how many you had right.

![Out of tries: the steps in the right order, the first four marked Right in green, the last two marked Right answer in orange, the Out of tries line, Try again and Score: 4.](help/tutorial-order-finished.png)

**Try again** deals the steps again. Press <kbd>Esc</kbd> to close the Preview.

## Go further

- **A second question and a total.** Add a page with **+ Add page** at the bottom of the **Layers** panel, and add another question on it. Every project has a built-in \`quiz\` that adds the questions up: a text layer reading \`You scored {quiz.score} of {quiz.max}\` shows the total for every question in the project. See [The whole quiz](question-kit#the-whole-quiz).
- **A timeline instead.** The **Interactive timeline** starter (**Templates**, **Built-in**) shows events in order for the learner to explore, rather than to sort.

## What you learned

- An ordering question's list is the right order. The learner gets it shuffled and moves each step with its **↑** and **↓** buttons, which are real buttons, so the keyboard works.
- **Part marks** count the steps in their right place, and **Show the right answer when finished wrong** puts them in order at the end.
- The steps are a repeated layer: restyle the one **Item** and they all follow.

**Next:** put labels on a picture in [Label the diagram](tutorial-label). How repeated layers work is in [Repeaters](repeaters), and every question type is in [Questions and quizzes](question-kit).`,
  },
  guide: {
    1: { check: renamed, show: 'project-name' },
    2: { check: question('ordering'), show: 'add-question' },
    3: { check: question('ordering', (q) => q.options.length >= 6 && !q.options.some((o) => /^(Evaporation|Condensation)$/.test(o.text))), show: 'panel-inspector' },
    4: { check: question('ordering', (q) => q.attempts > 0 && q.points > 1 && q.hints.length > 0 && q.feedbackPartial.trim() !== ''), show: 'panel-inspector' },
    5: { check: layerWhere('frame', (n) => n.name === 'Item' && n.type === 'frame' && n.cornerRadius >= 20), show: ['panel-layers', 'panel-inspector'] },
    6: { check: saw('previewed'), show: 'preview' },
  },
};
