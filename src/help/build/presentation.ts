import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 35,
  level: 'beginner',
  minutes: 15,
  example: 'tut-presentation',
  topic: {
    id: 'tutorial-presentation',
    title: 'A course presentation',
    group: 'Build it',
    summary: 'Four slides that share a page master, a check your understanding question, and Back, Next and the page number added in one go, with a slide transition.',
    keywords: 'tutorial presentation slides slide deck powerpoint lecture page master text slot back next page number navigation transition slide left question check your understanding branded look',
    body: `You will make a short slide deck: a welcome slide, a content slide, a check your understanding question and a thank you slide. A **page master** gives every slide the same bar, title position and footer, and **Page navigation** adds Back, Next and *Page 2 of 4* to all of them at once, with a slide transition. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Course presentation**. **Play** runs it and **Make my copy** gives you your own copy.

Each slide is a page of the project. The order of the pages in the **Layers** panel is the order of the slides.

## 1. Make the slides

1. On the projects page press **New project**. Keep **Blank project**, type **Study week slides** as the name and press **Create project**.
2. Click the page's name above it on the canvas, so the Properties panel shows the **Page**. Change its **Name** from **Home** to **Welcome**.
3. At the bottom of the **Layers** panel press **+ Add page** three times. Name the new pages **Plan your week**, **Check your understanding** and **Thank you**.
4. Press **+ Add page** once more and name this one **Slide master**. It will not be a slide: it holds what every slide shares.

## 2. Build the master

On **Slide master**:

1. Press <kbd>R</kbd> and draw a thin bar across the very top: **X** 0, **Y** 0, **W** 800, **H** 12. Give it a dark blue fill. Name it **Accent bar**.
2. Press <kbd>T</kbd> and click near the top left, under the bar. Type \`{slideTitle}\` and press <kbd>Escape</kbd>. Make it **Size** 30, **Weight** 700, and name it **Slide title**. The braces make it a *text slot*: each slide fills in its own words.
3. Add a small text at the very bottom left, \`Study skills\`, **Size** 13. Name it **Footer**. Keep it below about **Y** 570, clear of the buttons that go along the bottom later.
4. Select the page itself (click its name above it) and open the **Page master** section. Press **Make this a master**.
5. The section now lists who uses it. Press **Use for all other pages**.

Every slide now shows the bar and the footer, drawn underneath its own layers. The title is empty because no slide has filled in its slot yet.

## 3. Fill in each slide

1. Select the **Welcome** page and open its **Page master** section. Under **Text slots** there is a box called **slideTitle**. Type \`Welcome\`. The title appears on the slide.
2. Add a text under the title: \`Four short slides about planning your study week. Press Next, or use the arrow keys, to move on.\`
3. On **Plan your week**, type \`Plan your week\` in **slideTitle** and add a text with a few lines:
   - \`Block out study time in your calendar.\`
   - \`Start with the task that is due first.\`
   - \`Leave a gap each week for catching up.\`
4. On **Thank you**, type \`Thank you\` and add a closing line.

To change the bar or the footer later, change it once on **Slide master** (or press **Edit master** on any slide) and every slide follows.

## 4. The question slide

1. Select **Check your understanding** and type the same words in its **slideTitle**.
2. In the tool bar on the left, open **Web**, press **Add question** and pick **Multiple choice (one answer)**. The card appears on the slide, selected.
3. Drag it so its top sits just under the title. It is about 420 high, so it fits above the bottom bar.
4. In the **Question** section, write the **Prompt** \`What is the best first step when an assignment is released?\` and three options: \`Read the task sheet and the marking criteria\` (mark it right with the round button), \`Start writing the introduction\` and \`Wait until the week before it is due\`.

[A multiple choice question](tutorial-mcq) covers the Question section in full: feedback per option, tries, hints and results.

## 5. Back, Next and the page number

1. Select the **Welcome** page and open **Page navigation** in the Properties panel.
2. Choose the style **Back and Next**.
3. Set **How the page changes** to **Slide left**, and **Speed** to **Medium**.
4. Press **Add to all 4 pages**.

Every slide now has **Back** on the left, **Next** on the right and *Page 1 of 4* between them. Back is hidden on the first slide and Next on the last. The master isn't counted: it is not a slide.

Nothing here is hidden. Each button is an ordinary button with a **Go to a page** node in the **Interactions** tab, set to the next or previous page with the transition you chose. They follow the page order, so a slide you add or move later needs no rewiring (press **Add to all** again to give a new slide its buttons).

## 6. Try it

1. Select **Welcome** and press **Preview**.
2. Press **Next**. The next slide slides in from the right. The page number counts up.
3. Answer the question, then carry on to the end. **Back** goes the other way.

Learners whose device asks for less motion get an instant change instead of the slide.

## Make it yours

- **The arrow keys.** Select a **Next button** and type \`ArrowRight\` in **Shortcut** (in **Accessibility**), and \`ArrowLeft\` on the **Back button**. Do it on each slide. The welcome text already promises it.
- **Another transition.** Pick another look in **How the page changes** and press **Add to all** again: the buttons are replaced in the new style.
- **More slides.** Add a page, pick **Slide master** as its **Master**, fill in its slot, and drag its row into place in the **Layers** panel.
- **The branded look.** The **Course presentation** starter (Templates, **Stories and presentations**) is eight slides with the university's look, an Acknowledgement of Country slide and a question slide, ready to fill in.

## What you learned

- A **page master** holds what every slide shares, drawn under each page. A \`{name}\` in its text is a slot each page fills in.
- **Page navigation** adds Back, Next and the page number to every page in one go, following the page order.
- **How the page changes** sets the transition, and people who ask for less motion get none.

**Next:** [Mind maps and flowcharts from data](tutorial-diagram). More on [Page masters](page-master), [Page navigation](page-navigation) and [How the page changes](links-cursors#how-the-page-changes).`,
  },
};
