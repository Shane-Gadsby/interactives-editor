import type { Concept } from './index';

export const concept: Concept = {
  order: 20,
  area: 'construction',
  topic: {
    id: 'concept-pages-masters',
    title: 'Pages, page masters and the start page',
    group: 'Concepts',
    summary: 'Every artboard is a page, one of them plays first, and a page master is a page whose layers are drawn on the pages that use it.',
    keywords: 'concept artboard page pages master page master start page first page which page plays first next page order logo changed everywhere shared layers footer header',
    body: `An **artboard** is a page: one screen of the interactive, with its own layers, timelines and interactions. Variables, data and assets belong to the whole project, so every page shares them.

One page is the **start page**: the one the player shows first. Its name has **▸ start** after it on the canvas, and a **start** badge in the **Layers** panel. **Make start page** (in the Inspector or the right-click menu) moves it.

A **page master** is a page that holds what other pages share, such as a logo, an accent bar or a footer. A page that uses it draws the master's layers under its own (or over them, for the layers the master says so). The layers live in one place only, so a change to the master changes every page that uses it. A master's buttons work on every page, and what they do is wired once on the master: Back and Next, a menu, a Help button.

## Where people get caught out

- **"I changed the logo on one page and every page changed."** The logo is in a master. Its layers can't be edited from a page: clicking one selects the page. **Edit master** in the **Page master** section takes you to it.
- **"I changed the logo on one page and the others didn't change."** That logo was copied onto each page, so each copy is its own layer. Move the shared layers into a master (see [Page masters](page-master)) and they change together.
- **"My Next button goes to the wrong page."** **Next page** and **Previous page** follow the order of the **Layers** panel, not where the pages sit on the canvas. A page in a page group only steps through its own group. Drag the pages into order in Layers; **Tidy up pages** then lays the canvas out in that order too.
- **"That page off to the side is part of the project."** Every artboard is a page, even one you only used to try something out. Next and Previous step onto it if it is in the list. Delete it, or move it out of the way of the order.
- **"The click on my master layer does nothing."** Check three things. A picture or shape on a master only takes clicks when the master's own **Interactions** has a **When clicked** for it (a button always does). The **When clicked** has to be on the *master* (select the master and open its Interactions tab), not on a page. And the page must not have left the layer off: look under **Show these master layers on this page**. A click on a master's button runs on the page that is showing, so **Next page** goes to the page after it.
- **"Preview opened on the wrong page."** The dropdown in Preview's bar says **From the start artboard** or **From this artboard**. The learner always gets the start page.

## How to tell what is going on

- In the **Layers** panel a page that uses a master has an **on …** badge naming it, and a master has a **master · 3** badge saying how many pages use it.

![The Layers panel with every page folded: Word search has start and on Hero master badges, the other pages say which master they draw, and Hero master, Content master and End master say master · 2, master · 2 and master · 1.](help/concept-pages-masters-layers.png)

- On the canvas, with a page selected, the layers it gets from its master are outlined with a dashed line, under a tag that says **From page master** and the master's name. That is how you tell a master's layer from the page's own: the page's own layers get the usual selection box when you click them.
- With a page selected, its **Page master** section says which master it draws and lists the master's layers, so you can leave one off this page.
- A page's **Interactions** tab lists the flows it gets from its master, read only, under **From the page master**. **Edit the master** opens it to change them.

![The Page master section of a page: Master set to Content master, Edit master and Detach, and a ticked box for each master layer to show on this page.](help/concept-pages-masters-section.png)

- In Preview, the **Now showing** line in the **Debug** panel names the page on screen.

**More:** [Pages (artboards)](artboards), [Page masters](page-master), [Go to a page](interactions#go-to-a-page), [Page groups](artboards#page-groups).`,
  },
};
