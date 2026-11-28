# The Assets panel
Every file in the project: upload, preview as thumbnails or a list, place on an artboard, check several and delete.

The **Assets** tab in the left panel lists every file in the project: images, video, audio, fonts and data files.

![The Assets panel in thumbnail view, with one asset checked and the Delete button showing.](help/assets-panel.png)

## Adding files
- **Upload files** opens a file picker. You can pick several at once.
- Drop files on the **Assets** panel itself to add them without placing anything: images, video, audio (`.mp3`, `.wav`, `.ogg`...), fonts and data files. The panel shows a dashed outline while you're over it.
- Or drop files on the canvas, or paste them. Dropped pictures and video are also placed on the artboard where you dropped them.
- Font files (`.woff`, `.woff2`, `.ttf`, `.otf`) are added to the project's fonts as well, and a message tells you.
- Data files (JSON, CSV, TSV, text) are used from the **Data** tab. See [Data sources](data-sources).
- Design files (`.psd`, `.ai`, `.pdf`, `.dxf`) aren't stored as assets: they become new artboards. They are listed under **Design files** at the top of the panel, each with **Update…** to bring in a new version. See [Updating a design file](import#updating-a-design-file).

## Replacing a file
The **↑** button on an asset (beside the bin) replaces its file with a new version of the same kind: a new picture, sound, video, font or data file. Everything that uses it (layers, fills, **Play sound** actions, timeline audio, fonts, data sources) shows the new file, and one undo puts the old one back. An image or video layer's inspector has **Replace file…** for the same thing. A sound on a timeline gets the new file's length, and if the timeline was exactly as long as the old sound (or the new one runs past its end) you are asked whether to set the timeline to match, so a swapped soundtrack does not leave silence or cut off the end.

## Looking at them
- **Thumbnails** shows a picture for each asset. Drag the slider beside it to make the thumbnails bigger or smaller.
- **Details** is a list with each asset's kind and size, and **unused** if nothing in the project refers to it. Once you have started an attributions list, it also says **no attribution** beside a file no entry covers yet (the thumbnails carry a small **No attribution** tag instead). For a big picture it also says what its lighter copies are doing: **Editing copy** (what the canvas shows, see below) and **Output** with the size a download or share link carries and how much that saves, or **already small enough** when the picture is left as it is.
- Hover an asset for its full name and size. Your choice of view and thumbnail size is remembered in this browser.

## Crediting them
The **©** button on an asset (beside the **↑**) opens the [Attributions](attributions) tab on the entry for that file, making one named after the file if it has none. Fill in who made it, where it came from and the licence there. When some files still have no entry, a line above the list says how many and opens the tab.

## Big pictures
Every picture stays in the project at its full size. Camera photos are heavy, so two lighter copies are made from them in your browser and kept beside the original on the server:
- **An editing copy**, for a picture over about 2 MB or 2560 px on the long side. The canvas shows it instead of the original, so a large photo does not slow down editing. It is made a moment after you add the picture (or the first time you open a project that has big ones), and you won't see a difference at normal zoom.
- **An output copy**, made when you download or share, if [Optimise output](project-settings) is on. See [Exporting](export#optimised-pictures).

Only JPEG, PNG and WebP pictures are touched. SVG, GIF and animated PNG or WebP files are always left exactly as they are, and so is any picture that is already small. Replacing a picture with **↑** makes new copies for the new file. The original is never changed, and turning Optimise output off sends everything at full size again.

## Using them
- **Place** puts an image or video on the artboard you have open, in the middle, at 300 by 200. You can then resize it.
- Image fills, video and image layers, **Play sound** nodes and fonts pick their file from a dropdown of the project's assets. Most of those dropdowns also offer **+ Add a new image…** (or sound, video or data file), which uploads and selects in one step.

## Checking and deleting
- **Find duplicate files** (under Upload files) looks for files that were added more than once, such as the same logo dropped in three times. It lists them and offers to merge: everything that used a copy uses one file instead, and the copies leave the list. Undo puts them back.
- Click an asset, or its checkbox, to check it. <kbd>Shift</kbd>+click checks a range. The box above the list, **Select all**, checks or unchecks every asset.
- When anything is checked a red **Delete** button appears with the count. A dialog lists the files and warns if any are used. Deleting an asset that layers still use leaves those layers empty.
- The bin on one asset deletes just that one (it asks first).
- To clear out everything nothing uses, see [Usage](usage#removing-unused-assets).
