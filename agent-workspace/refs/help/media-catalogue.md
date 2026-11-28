# The Photography Catalogue
Put a photo from the suite's Photography Catalogue on an artboard, and how it is saved and exported.

The **Photography Catalogue** button, in the tool bar's **Media** group (open the group if it is folded) with the same icon as the catalogue button in StudyDesk's editor, opens the suite's photo library in a window over the editor. Search or browse, open a photo, and press **Insert**: the window closes and the photo is on the open artboard as an image layer, centred and scaled to fit (up to 600 px). Close the window without inserting with its **×**, <kbd>Esc</kbd> or the catalogue's own close button. If you open it with a picture layer that came from the catalogue selected, it opens where that photo was found.

Where the older photo gallery still answers at that address (StudyDesk's live site, until it moves to the new Photography Catalogue), the button opens that one instead, and it works the same way: open a photo and press its insert button. It doesn't remember where a photo was found, so it always opens at the start.

## How it is stored
The picture is **linked, not copied**: the layer points at the photo's address in the catalogue. The Assets panel shows it like any picture. Saving, share links, review links, Preview and embeds keep the link, so they stay small and follow the catalogue. The same photo inserted twice is one asset.

On the canvas, a page you aren't working on is drawn as a picture of itself to keep the editor quick, and its catalogue photos are in that picture like everything else. If a photo can't be reached just then, that page simply stays drawn live, so you never see a page with its photos missing.

## Exporting
Files that must work without a network fetch the picture when they are made and put it inside:
- **Download** the single-file page: the picture is embedded as data, and the address and where it was found in the catalogue are left out.
- **Download** the package (`.ixp`): the picture is stored under `assets/` with the others.

If the catalogue can't be reached or doesn't answer when one of these is made, a message lists which pictures and why. The file is still made, **without** those pictures (their layers show nothing) rather than with a link that might not work for whoever opens it. Fix the connection and export again. The JSON export keeps the links as they are.

Photos in the catalogue have their own terms of use. Check them before you publish a project that uses one, and credit them in [Attributions and references](attributions) where they ask for it.
