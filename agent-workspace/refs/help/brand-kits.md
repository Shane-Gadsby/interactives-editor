# Brand kits and pre-branded templates
A library marked as a brand kit keeps its logos, headers, colours and fonts on brand: locked in the projects that use it, while everything else stays free.

A **brand kit** is a [library](libraries) that the people who look after your brand have published and marked as one. It carries the brand's colours, text styles, fonts and components (logos, headers, footers). A project can use it like any library, with one difference: **what comes from the kit is locked**. The rest of the project is yours.

## Using a brand kit
1. In the **Libraries** tab, a kit is badged **Brand kit** under **Available libraries**. Press **Add with starter items** to add it and have its header, footer and logo placed in the page you have open (whatever the kit marks for new projects). **Add** adds the kit without placing anything; then drag its components onto the canvas or press **Place**, as with any library.
2. Colours and text styles from the kit show in **Styles** with the kit's name. Use **Fill**, **Stroke**, **Text** and **Apply** as usual.
3. When the kit publishes a new version, **Updates available** appears and you review it as for any library.

## What is locked
Only the items that come from the kit. Your own pages, layers, colours and fonts are never locked.
- **Its pages** (the copies in your project, badged *library* and kept off the canvas) can't be edited, **detached**, deleted or copied, and **Stop using this library** is switched off. You can move and rename the page.
- **Text the kit marks as editable** can be changed. Double-click it, or edit it in the Inspector, and the words are yours; its font, size, colour and position stay the kit's. Your words are kept when the kit updates.
- **Instances** of a kit item in your own pages are yours to move, rotate and fade. Their size keeps the item's **proportions**, and can go from half to double its own size; a resize outside that snaps back. Their **Inputs** are yours too.
- Colours and text styles from the kit can't be edited or deleted, as with any library. A layer of your own that follows one still stops following it if you change that property.

If something is refused, a message on screen says so. A brand kit is a guard rail, not a vault: it stops the obvious ways of ending up off brand, and it can't stop you copying a layer's look by eye.

## Off-brand check
A project that uses a kit has a **Brand check** section in the Libraries tab. **Check against the brand kit** lists the colours and fonts used in your own pages that the kit doesn't have, how many times, and on which pages. It is only a list: nothing is blocked or changed, and a colour that is a theme token counts as the colour it holds in the default theme. The kit's colours are its colour styles and the colours of its text styles; its fonts are its text styles' fonts and the fonts it lists.

## Making a brand kit
1. Make the library as usual: a project with **This project is a library** on, and the logo, header and footer pages marked **Publish to library**. Add the brand's **colour styles** and **text styles** in the Libraries tab (**Styles**), and the fonts they use to the project.
2. For text people should be able to change (a course title in a header), select the text layer and tick **Editable in brand kit projects**.
3. For items a new project should start with, select the page and set **Brand kit start** (top, bottom, a corner, or centre). **Add with starter items** places those.
4. **Publish**, share it (**Everyone can use it**), then tick **This is a brand kit**. The projects that already use the library pick up the lock the next time they open the Libraries tab.

**Who can do this:** only the people who look after brand kits can mark one, and publish a new version of or withdraw one that is marked. The server decides, as it does for the power-user view on the [projects page](projects#who-sees-what): power users, plus anyone in the group the administrators name for brand kits. Anyone else who owns the library project can still edit it, and sees that it is a brand kit, but can't turn that on or off, and the server refuses a new version from them.

## Pre-branded templates
Add a kit with **Add with starter items**, set up the rest of the project, then **Share > Save as template** ([Templates](templates)). The template remembers the kit: its card says **Brand kit**, and a project made from it has the kit added and its items locked from the start. Updates of the kit reach those projects like any other library update.

## For brand kit managers
Power users (and the brand group) can switch the lock off while they work, with **F9** (or Ctrl+F8) in the editor. A banner says it is off. They can then edit, copy, delete and detach kit items; the banner goes and the lock is back when they press F9 again or reload. Nothing about it is saved in the project.

## Good to know
- The lock lives in the editor, as library read-only does. It isn't a server-side check on every save, so treat it as policy support, not security.
- A kit marked after projects copied it locks those copies the next time they open the Libraries tab. A kit no longer marked unlocks them the same way.
- Colours and fonts the kit carries are the ones in its styles; theme tokens are not part of a library.
