import type { Concept } from './index';

export const concept: Concept = {
  order: 120,
  area: 'interface',
  topic: {
    id: 'concept-assets',
    title: 'Assets: one file, used in many places',
    group: 'Concepts',
    summary: 'Pictures, sound, video, fonts and data files live once in the Assets tab, and layers point at them. Replace a file there and everything that uses it changes.',
    keywords: 'concept assets files picture image replace update new version import again duplicate two copies linked design file psd ai pdf update from file optimised copy editing copy export size big photo',
    body: `Every picture, sound, video, font and data file in a project is an **asset**, listed once in the **Assets** tab of the left panel. A layer, a fill, a **Play sound** node or a data source doesn't hold the file itself: it points at the asset. So one logo can be on twenty pages and still be one file.

Design files (Photoshop, Illustrator, PDF, AutoCAD) are different. They aren't stored as assets: they become artboards, and they are listed under **Design files** at the top of the Assets tab, above the other files, each with **Update…** to bring in a new version of the file.

## Where people get caught out

- **"I imported the new picture and now I have two."** Importing or dropping a file again always adds a new asset, and the layers still point at the old one. To swap a file, press the arrow on the asset in the Assets tab (its tooltip says **Replace with a new version of the file**), or **Replace file…** in an image or video layer's inspector. Everything that used it shows the new file, and one undo puts the old one back.
- **"The same logo is in there three times."** **Find duplicate files** (the link below the **Upload files** button, shown once there are two or more files) finds files added more than once and merges them, so everything uses one copy.
- **"I changed the Photoshop file. Do I have to import it again?"** No. Press **Update…** beside it under **Design files**. What changed in the file comes in, and the edits you made in the editor are kept.
- **"My photo looks fine, but is it slowing everything down?"** Big pictures (over about 2 MB, or 2560 px on the long side) get a lighter **editing copy** that the canvas draws instead, so editing stays quick. The original is kept at full size.
- **"The exported file is huge."** With **Optimise output** on in the Project settings (it is on by default), the single HTML file and the share link carry smaller copies of big pictures. The project package and Preview always use the full-size originals.

## How to tell what is going on

- The Assets tab's **Details** view lists each file's kind and size, says **unused** beside a file nothing refers to, and for a picture shows its **Editing copy** (big ones only) and **Output** sizes once those copies are made. A small picture says **Output: already small enough**.
- The **Usage** tab lists what uses what, and can clear out the files nothing uses.

![The Assets tab in the Details view: four small pictures, each saying Output: already small enough, and below them a 4.2 MB photo marked unused, with an Editing copy of 1.5 MB and an Output of 1.7 MB.](help/concept-assets-details.png)

**More:** [The Assets panel](assets), [Replacing a file](assets#replacing-a-file), [Big pictures](assets#big-pictures), [Updating a design file](import#updating-a-design-file), [Optimised pictures](export#optimised-pictures), [Removing unused assets](usage#removing-unused-assets). The [data source tutorial](tutorial-data-source) and the [sound tutorial](tutorial-sound) both replace a file this way.`,
  },
};
