# Page navigation
Back, Next, the page number, page dots and a progress bar along the bottom of your pages, in one click.

Every piece with more than one page needs **Next** and **Back**, and often "Page 3 of 8". Select a page and open **Page navigation** in the properties panel (or select several pages and open it there), pick a style and press **Add to this page**, **Add to these pages** or **Add to all pages**. If your pages share a [page master](page-master), select the master instead and press **Add to this master**: one set of buttons for every page that draws it.

- **Back and Next**: Back on the left, Next (the main button) on the right and *Page 3 of 8* between them.
- **Next only**: just a Next button on the right.
- **Back, Next and page dots**: a row of dots between them, the current page filled.
- **Back, Next and a progress bar**: the page number, with a thin bar along the bottom that fills as you go.
- **Page number only**: *Page 3 of 8* and no buttons.

It all goes along the bottom of the page, in a bottom bar. Back is hidden on the first page and Next on the last, and the number and bar follow the order of your pages (see **Go to a page** in [Interactions](interactions)), so adding, removing or moving a page needs no rewiring. The colours come from your project's colours, so they follow the theme and a branded project's look, and on a branded page the bar sits inside the content box, clear of the logo and footer.

Nothing is hidden: you get ordinary buttons, text, a progress bar and the clicks and **Go to a page** nodes in **Interactions**, all of which you can restyle, move or rewire. They are tagged, so adding navigation again with another style swaps the old one for the new (and **Remove** takes it away). A page that already has its own Next or Back button is left alone, and the message says which.

Page dots are drawn for the number of pages there are now: press **Add** again after adding or removing pages to refresh them. On a master there is no single page to mark, so dots become *Page 3 of 8*.

## How the page changes
**How the page changes**, above the buttons, is the look Back and Next use (a fade unless you choose another), and **Speed** under it is how long that takes. Both are written into the **Go to a page** nodes, where you can change them afterwards. The looks and speeds are listed in [How the page changes](links-cursors#how-the-page-changes).

## Where it goes
Buttons can go on the page itself, or once on a [page master](page-master) so every page that draws it has them. On a master they are drawn over the pages, so a keyboard user reaches them after the page's own controls, and their flows run from the master on whichever page is showing. If a page already has navigation of its own, adding it to its master too shows two sets: the message names those pages, and **Remove** on them keeps just the master's.

## Named starting points
While you build, **Starting points** (a section on the page, under **Page**) saves places worth jumping straight to: "From the quiz", "Straight to the summary". Select the page and press **Start here too**, then name it. **Preview**'s **From** list offers every one you've made, so testing one screen of a long sequence doesn't mean playing through to reach it.

They change nothing a learner sees: what they open is still the **Start page**. Delete a page and its starting point stops being offered, and the row says so until you take it out.
