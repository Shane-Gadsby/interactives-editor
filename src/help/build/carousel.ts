import type { BuildTutorial } from './index';
import { clickThen, layerWhere, nodesOfKind, saw, setsVariable, variables, all, bound, textHas, repeats } from '../../lib/tutorial-checks';

export const tutorial: BuildTutorial = {
  order: 33,
  level: 'beginner',
  minutes: 20,
  example: 'tut-carousel',
  topic: {
    id: 'tutorial-carousel',
    title: 'An image slider (carousel)',
    group: 'Build it',
    summary: 'Slides with Previous, Next, a dot for each slide and the arrow keys, plus an autoplay that pauses and never runs for people who ask for less motion.',
    keywords: 'tutorial carousel slider slideshow image slider gallery slides previous next dots arrow keys autoplay timer pause play reduced motion current index variable binding shortcut wrap round',
    body: `You will make a slider of four slides, each a picture with a heading and a caption. **Previous** and **Next** step through them and wrap round at the ends, a row of dots jumps to any slide, and the left and right arrow keys work too. **Play** starts an autoplay that moves on every four seconds, and stops as soon as someone steps through by hand. It takes about twenty minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Image slider (carousel)**. **Play** runs it and **Make my copy** gives you your own copy.

The idea that makes it simple: one number, \`slide\`, says which slide is showing. Everything on the page reads it, and every control just changes it.

## 1. Make a project and the variables

1. On the projects page press **New project**. Keep **Blank project**, type **Research steps** as the name and press **Create project**.
2. Open the **Variables** tab (down the bottom, beside **Interactions**). Press **+ Add variable** and pick **List**. It arrives called \`items\`: change its **Name** to \`slides\`, and replace the \`[]\` in its value box with:

\`\`\`
[
  {"title": "Choose a topic", "body": "Start with a question you can say in one sentence.", "colour": "#cfe8f7"},
  {"title": "Find sources", "body": "Search the library and note where each idea came from.", "colour": "#d7ecd0"},
  {"title": "Take notes", "body": "Write the main points in your own words, with the page number.", "colour": "#fbe7c6"},
  {"title": "Draft and review", "body": "Write a first version, then check it against the task and the criteria.", "colour": "#e6dcf5"}
]
\`\`\`

3. Press **+ Add variable**, pick **Counter**, rename it \`slide\` and set its starting value to **1**. Its **Type** then reads **Number (counter, score)**.
4. Press **+ Add variable**, pick **Switch (on or off)** and rename it \`playing\`. Leave it unticked.

![The Variables tab with slides (a List), slide (a Number starting at 1) and playing (a True/false switch), and the + Add variable menu open on Counter, Switch (on or off), Text, Score, List, Choice and Colour.](help/tutorial-carousel-variables.png)

Each slide has a colour so you can see the slides change before you have pictures. Swapping in real pictures comes at the end.

## 2. One slide that reads the number

1. Press <kbd>R</kbd> and draw a large box across the top of the page, about 720 by 320. Name it **Slide picture** and give it a **Radius** of **16**.
2. In its **Data bindings** press **+ Add binding**, pick **Fill colour**, choose **Formula** and type \`slides[slide - 1].colour\`.
3. Press <kbd>T</kbd> and click under the box. Type \`{slides[slide - 1].title}\` and press <kbd>Escape</kbd>. Name it **Slide heading** and make it **Size** 26, **Weight** 700.
4. Under that, add a text \`{slides[slide - 1].body}\` and name it **Slide caption**.
5. Add a small text in the top left corner of the box: \`Slide {slide} of {slides.length}\`.

![Slide picture selected on the canvas, and its Data bindings: Fill colour, In, Formula with the slide's colour from the list, currently #cfe8f7.](help/tutorial-carousel-binding.png)

\`slides[0]\` is the first item of a list, so \`slides[slide - 1]\` is the slide whose number is in \`slide\`. Change **slide** to 3 in the Variables tab and the page shows Take notes. Put it back to 1.

## 3. Previous and Next

1. Press <kbd>B</kbd> and draw a button at the bottom right. Set its **Label** to \`Next\` and its **Name** to **Next**.
2. Press **+ When clicked…** and choose **Go to the next item…**. **Which number** is **slide**, **The first one is** **Number 1**, **How many items** is **As many as the list slides has**, and **After the last** is **Go round to the other end**. Those are what it starts as, so there is nothing to change.
3. Press **+ then also…**. Change the new row to **Switch something on or off**, pick **playing** and set **What to do** to **Turn it off**. Moving by hand stops the autoplay. Press **Add**.

The **Interactions** tab opens with the new flow framed. (If you switched that off in Preferences, press **Show in graph**.) It reads: *When clicked: go to the next slide (1 to slides.length, going round at the ends), then switch playing off*.

![The Interactions graph: Next's When clicked or hovered node wired to Change a value or counter (slide, Next number in a range, 1 to slides.length, Go round to the other end), then to a second one switching playing off; Previous and the Dot have a pair of their own below it.](help/tutorial-carousel-next-graph.png)

4. Draw another button at the bottom left called **Previous**, press **+ When clicked…** and choose **Go to the previous item…**, with the same answers. Add the same **+ then also…** that turns **playing** off.

The wrap round at the ends is one setting of one node (**Do** is **Go to the next number in a range**, with a **First number** and a **Last number**), not a formula you type twice.

## 4. The arrow keys

1. Select **Next**, open **Accessibility** and type \`ArrowRight\` in **Shortcut**.
2. Select **Previous** and type \`ArrowLeft\` in its **Shortcut**.

A shortcut presses the button from anywhere on the page, so the arrow keys run the same flows. There is nothing to wire.

## 5. A dot for each slide

1. Press <kbd>O</kbd> for the **Ellipse** tool and draw a small circle between Previous and Next, 18 by 18. Name it **Dot**.
2. Select it and press <kbd>Ctrl</kbd>+<kbd>G</kbd>. Name the group **Dots**. In its **Repeat (list)** tick **Repeat the first child for each item**, set **Repeat for each** to **List: slides**, **Layout** to **Row** and **Gap** to **14**. Four dots appear.
3. Select **Dot** again and add three bindings in **Data bindings**, each a **Formula**:
   - **Fill colour**: \`slide == index + 1 ? "#1f3a68" : "#c9ced6"\`. The current slide's dot is dark.
   - **Current (true, or page, step, location)**: \`slide == index + 1\`. A screen reader says which dot is current.
   - **Text alternative**: \`"Go to slide " + (index + 1)\`.
4. In **Accessibility**, set **Role** to **Button**, so each dot is a tab stop.

The line under each of those bindings works it out for the first dot (\`index\` 0).

5. Press **+ When clicked…** and choose **Change a number…**. Pick **slide**, set **What to do** to **Set it to** and **Amount** to \`event.index + 1\`. \`event.index\` is the dot that was clicked, counting from 0. Press **+ then also…** and turn **playing** off as you did for Next.

## 6. Autoplay that pauses

1. Draw a button between the dots and Next. Name it **Play**.
2. Press **+ When clicked…**, choose **Switch something on or off**, pick **playing** and press **Add**.
3. In **Data bindings** add **Button label** with the formula \`playing ? "Pause" : "Play"\`, and **Pressed (button, toggle)** with \`playing\`.
4. Open the **Interactions** tab. In the node list on its left, type \`timer\` in **Search nodes** and click **When a timer goes off**. Set **Every (ms)** to \`4000\` and leave **Repeat** ticked. Under **Only while**, press **Edit as formula** and type:

\`\`\`
playing && !reducedMotion
\`\`\`

5. Drag from its dot and add **Change a value or counter**: **Variable** **slide**, **Do** **Go to the next number in a range**, **First number** \`1\` and **Last number** \`slides.length\`. It is the same node Next wrote, so it goes round at the end too.

Once you leave the formula box, **Only while** shows it as two rows you could also have built with **+ Add a condition**: **playing** **is on (true)** and **reducedMotion** **is off (false)**.

![The timer flow selected in the graph, with When a timer goes off's settings: Every (ms) 4000, Repeat ticked, and Only while playing is on and reducedMotion is off.](help/tutorial-carousel-timer.png)

\`reducedMotion\` is true when the learner's device asks for less movement. For them the timer never fires, even after Play, so nothing moves on its own.

## 7. Try it

1. Press **Preview**.
2. Press **Next** four times. The fourth press goes round to slide 1. Press a dot to jump.
3. Click an empty part of the page and use the left and right arrow keys.
4. Press **Play**. The slides move every four seconds and the button says **Pause**. Press **Next**: the autoplay stops.

![Preview on slide 3, Take notes, with the third dot dark. The Debug panel shows slide 3 and playing unticked, and its events list On pointer (Play), On timer, then On pointer (Next).](help/tutorial-carousel-preview.png)

## Make it yours

- **Real pictures.** The simplest way is a picture layer per slide, each with a **Visible** binding such as \`slide == 2\`. To keep one picture layer instead, bind its **Image / video asset** to a field of each slide that holds the picture's asset id. The **Image slider** starter (Templates, **Explore and reveal**) is set up that way, and its **Fill in** tab lets you pick each slide's picture by name, so you never see an id.
- **Describe each picture.** Give each slide an \`alt\` field and bind the picture's **Text alternative** to \`slides[slide - 1].alt\`.
- **A slower show.** Change **Every (ms)** on the timer.

## What you learned

- One number variable holds the whole state, and bindings read the current item with \`slides[slide - 1]\`.
- **Go to the next item…** goes round a list's slides with no formula, and **+ then also…** puts a second thing in the same click.
- A button's **Shortcut** gives it a key without any nodes.
- **When a timer goes off** with **Only while** runs only when it should, and \`reducedMotion\` respects people who ask for less movement.

**Next:** [Before and after compare](tutorial-compare). More on [Bindings](bindings), [Expressions](expressions) and [Shortcuts](accessibility#shortcuts).`,
  },
  guide: {
    1: { check: variables(['slides', 'list'], ['slide', 'number'], ['playing', 'boolean']), show: ['add-variable', 'panel-variables'] },
    2: { check: all(bound('rect', 'fill', 'slides[slide'), textHas('slides[slide')), show: 'tool-rect' },
    3: { check: clickThen('button', 'action.setVariable', setsVariable('slide'), 2), show: 'add-when-clicked' },
    4: { check: all(layerWhere('button', (n) => n.shortcut === 'ArrowRight'), layerWhere('button', (n) => n.shortcut === 'ArrowLeft')), show: 'panel-inspector' },
    5: { check: all(repeats('slides'), clickThen('ellipse', 'action.setVariable', setsVariable('slide'))), show: 'tool-ellipse' },
    6: { check: nodesOfKind('event.timer'), show: 'panel-logic' },
    7: { check: saw('previewed'), show: 'preview' },
  },
};
