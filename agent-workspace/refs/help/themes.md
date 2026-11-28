# Themes and colour tokens
Name a colour once, give it a value for Light, Dark and High contrast, and let layers follow it.

![The Themes tab: the starter tokens down the side with their Light, Dark and High contrast colours, and the contrast check.](help/themes-panel.png)

A **token** is a name for a colour, like `color/primary`. A **theme** (Light, Dark or High contrast) is a column of values for those names.

A fill, stroke, gradient stop, shadow, text or rich text colour that **uses a token** changes when the theme does. A colour that is only a colour never changes.

A **new project** starts with the three themes and the starter tokens already in it, and the page on the Light background. Every layer you add follows the tokens, so it looks right in Dark and High contrast without you picking anything.

Projects made before this, and imported ones, have no themes until you add them in the **Themes** tab. They look exactly as they did.

## Adding a UniSQ colourway
**+ Colourway…** in the **Themes** tab adds any of the [branded starter packs](branded-starters)' colourways (Gold, Purple, Blue, Green, Orange or Red) to this project as a theme. The starter tokens get its colours, and its brand tokens (the gradient, deep, accent and logo colours) are added, so layers that use them follow it.

A project with no themes yet can start from one. High contrast is the one every project already has.

## Apply the UniSQ look
A project that did not start from a [branded starter pack](branded-starters) can still get the UniSQ look in one step. In the **Themes** tab (beside **+ Colourway…**), or in **Project** in the Inspector, open **Apply the UniSQ look…** and pick a colourway. Or press <kbd>Ctrl</kbd>+<kbd>K</kbd> and type **UniSQ look**. It:
- adds that colourway as a theme with the brand colours (as **+ Colourway…** does) and makes it the theme the project opens in;
- makes a **Content master** (one for each page size) with the branded frame: the gold accent bar under the title and the UniSQ logo at the bottom left, painted with tokens so they follow the colourway;
- sets every page that has no master to use it. A page that already has a master of its own keeps it.

Your own layers are not moved or recoloured. A layer you coloured with a token follows the new colourway, and a plain colour stays as it is. The brand lock that a starter pack's project is held to is **not** switched on, so the project stays free to edit. A message says what it did, and **Undo** on it (or <kbd>Ctrl</kbd>+<kbd>Z</kbd>) takes all of it back in one step. If a layer of yours sits where the logo or accent bar goes, the message names the page. Pick another colourway later and only the theme the project opens in changes. The option is not shown for a project that already has the look from a starter pack: change its colourway in **Project**.

## The loading spinner
When a project has to wait before its first page shows, a spinner appears after a quarter of a second. The waits are remembered progress or saved data coming from StudyDesk, a **Before activity loads** flow, and the first page's fonts. A quick start never shows it.

The spinner uses the project's own colours: the **color/primary** token (or **color/button**) for the ring and **color/background** behind it, from the theme the viewer gets. A viewer who asks for less motion sees it pulse instead of spin.

## The Themes panel
Open the **Themes** tab (bottom panel). For a project without themes, **Add Light, Dark and High contrast** makes the three themes and the starter tokens. They take the look of the StudyDesk toolbox: its greys, and its gold for buttons with black, bolder text.

The starter tokens are:
- **color/background**, **color/surface** and **color/surface-muted** are the page, a card and a hover or quiet grey. **color/text** and **color/muted** are the copy on them.
- **color/button** and **color/on-button** are the gold button and its black label. **color/primary** and **color/on-primary** are the accent for selections, which in the toolbox is the same gold. **color/link** is the toolbox's hyperlink blue, used by new Link layers.
- **color/border** is the outline of controls, **color/divider** a quiet line, and **color/focus** the keyboard focus outline on dark items. The outline is a 1 px line tight round the focused item: near black (the palette's grey 7) on a light item, this colour on a dark one.
- **color/success**, **color/error** and **color/warning** each come with a **-surface** tint, for the right, wrong and missed answers.

### Toolbox colours follow the shared palette
Light is the toolbox exactly as the toolbox draws itself. Each token takes the colour from the shared StudyDesk palette that the toolbox uses for that job. Cards are the palette's grey 1, text grey 7, outlines and quiet text grey 4, buttons the primary button colours, and the accent and focus ring the primary gold.

A token made this way remembers the palette colour it came from, shown by a small link mark beside its colour. The editor refreshes those colours from the live palette whenever it opens the project. The player does the same when the page it runs in can reach the palette, so a change to the palette reaches published pieces without re-editing them.

**Change a colour by hand and that colour stops following the palette.** If the palette can't be reached (an exported file, offline, another host) the last stored colour is used.

Dark and High contrast are built for contrast. They take their colours from the same palette where it has suitable ones, and a few tints and lighter or darker shades are mixed from two palette colours.

### Working in the panel
- Each row is a token, each column a theme. Click a colour to change it. **Used** counts the places that follow the token.
- **+ Theme** copies the default theme. **+ Token** adds a row. Rename either; layers keep following a renamed token.
- A theme can answer to a **Light** or **Dark scheme**, be marked **High contrast**, and be the **Default**. These decide which theme a viewer gets (see below).
- **Showing** (and the theme box in the top bar) picks the theme the canvas draws while you edit. It is not saved with the project. Pictures, SVG and PNG exports, and Lottie, write the colours of the theme being shown.
- **Convert colour styles to tokens** makes a token from every colour style, with its colour in every theme to start with. Layers that follow a style keep following it, now through the token. Styles from a library convert too, and a library update keeps the link.
- **Update starter colours** shows on a project made before this look that still has the old starter tokens. It gives the tokens you never edited the new values and adds the ones the project lacks. Layers that follow those tokens change with them; plain colours and tokens you edited do not. Nothing changes until you press it.
- The count at the top says how many plain colours are **not following a theme** (page backgrounds, fills, strokes, text and shadows), with a **Link colours to tokens** button beside it (see below).

## Using a token
In any colour picker in the inspector, open the arrow beside the swatch and choose the **Tokens** tab. Pick a token and the swatch shows a ring and link badge, and a one-line named chip replaces the hex box. Hover the chip to read the token's value in each theme. The **x** on the chip **detaches** it: the colour as it is now stays, as a plain colour. Choosing any other colour does the same.

## Tokens that hold a number or some words
A token's **kind**, beside its name in the Themes panel, is **Colour**, **Number** or **Words**. The last two aren't used as colours; expressions read them with `token('its/name')`, and they give whatever the theme being shown says.

That turns a theme into any set of values you want to swap in one go:

- **Density.** A `space/gap` number token, 24 in **Roomy** and 8 in **Compact**. Bind a frame's **Gap** to `token('space/gap')` and the whole layout tightens when the theme changes.
- **Language.** A `ui/next` words token, *Next* in one theme and *Suivant* in another. A text layer reading `{token('ui/next')}` follows it, and so does every other label you set up the same way.
- Anything else a theme should carry: a number of columns, a line of wording, a duration.

A theme with nothing of its own for a token uses the default theme's, the same as a colour does. Change a token's kind and its palette link goes, since a number isn't a colour.

## When switching the theme changes nothing
A theme can only change a colour that follows a token. A project built with plain colours (an imported file, or one made before the themes were added) has nothing to change, so the Light, Dark and High contrast switches, on the canvas, in Preview and in the Themes tab, all look the same. When that is the case you see a line, **Nothing here follows the theme: these colours are fixed**, with a **Link colours to tokens** button.

**Link colours to tokens** is a button on that line, in the **Themes** tab, and in the right-click menu of a page (where it covers only the selected pages). It goes through page backgrounds, layer fills, strokes, text and rich text colours, button, input and link colours, shadows and gradient stops.

A plain colour that is exactly the colour of a token in the default theme becomes that token. Same alpha counts, and `#fff` and `#ffffff` are alike.

Before anything changes it says what it will do, like "Link 7 colours: 3 backgrounds, 2 fills, 2 text", and lists the colours that match no token. Those stay as they are. Link them by hand from the picker's **Tokens** tab, or add a token with that colour and run it again. Undo (<kbd>Ctrl</kbd>+<kbd>Z</kbd>) takes the whole thing back in one step.

When two tokens have the same colour (the button and the primary, say) the layer's job decides:
- Page backgrounds prefer `color/background`, then `color/surface`.
- Text prefers `color/text`.
- Button fills prefer `color/button`, and button text `color/on-button`.
- Strokes prefer `color/border`.
- Anything else takes the first of them in the **Themes** tab.

Some things are left alone. Layers that follow a colour style stay with the style (use **Convert colour styles to tokens**). Library pages are read-only. The brand layers of a branded starter are skipped unless the power user override is on. Colours written inside a binding expression are not touched.

## New layers, questions and starters
A new button is gold with black, bolder text, an input has a grey outline, a shape is a neutral grey, text is the toolbox black. In a project that has the starter tokens, new layers, the [question kit](question-kit) and the step bar follow those tokens instead, so a new layer looks right in Dark and High contrast without you picking anything. In a project with no tokens they get the same colours as plain ones. The built-in [starters](templates) come with the themes and use the tokens.

## Imported files keep plain colours
Lottie, Rive, PSD, SVG and package imports bring their colours in as plain colours. Nothing guesses which colour "is" the primary. Mixing plain and token colours in one project is normal.

## Contrast
- The Themes panel checks the pairs that matter in every theme, by token name. **color/text** and **color/muted** are checked on **color/background**, **color/surface** and **color/surface-muted**. **color/on-primary** is checked on **color/primary**, and **color/on-button** on **color/button**. Each of **success**, **error** and **warning** is checked on its surface. **color/primary**, **color/border** and **color/focus** are checked against **color/background** and **color/surface**. A pair that is too low shows its ratio on the cell and in the list.
- Dark and High contrast pass every one. **Light does not, and that is expected.** It is the shared StudyDesk palette as the toolbox uses it, and some pairs fall below WCAG AA in it. The Themes panel and the [Accessibility checker](accessibility-checker) report them as they are and are not told to ignore them. Choose different colours for a piece that has to pass.
- The [Accessibility checker](accessibility-checker) checks text contrast in every theme, not only the one shown. A finding that starts "In Dark:" is about Dark. It offers no automatic fix for text that follows a token, since a fix would write a plain colour over the token.
- **Theme colour on a fixed colour** is a warning for text that follows a token but sits on a plain colour. The theme changes one and not the other, so white text on a plain white card goes unreadable in Dark.

The Light pairs that fall short are:
- muted text on background 2.59:1
- muted text on surface 2.38:1
- muted text on muted surface 1.96:1
- primary on background 1.75:1
- link on background 3.60:1
- link on surface 3.30:1
- outline against background 2.59:1
- outline against surface 2.38:1
- focus ring on background 1.75:1
- focus ring on surface 1.61:1
- success on its surface 3.90:1
- error on its surface 3.13:1
- warning on its surface 2.67:1

## How the finished interactive picks a theme
In this order:
1. The page or a script chose one: `player.setTheme('Dark')`, `ix.setTheme('Dark')`, the **Set theme** action, or `theme="Dark"` on `<interactives-player>`. A message `{ target: 'interactives', type: 'setTheme', theme: 'Dark' }` to the single-file export does the same.
2. Otherwise, with **Follow the viewer's settings** on (the default): a **High contrast** theme for a viewer who asks for more contrast (`prefers-contrast: more`) or uses forced colours, a **Dark scheme** theme for `prefers-color-scheme: dark`, else the default theme. It changes live when the viewer's setting does.
3. `"auto"` or `null` in step 1 goes back to step 2.

`player.getTheme()` / `ix.getTheme()` give the name showing and `ix.themes()` the list. A `themechange` event (`ix-theme` on the element, with `{ id, name }`) says when it changed. The player's stage carries `data-ix-theme`.

**Preview** has a theme box (a theme, or follow the viewer), a **Viewer** box to pretend dark mode or more contrast is on, and, with the page option below, a **Host** box.

## Taking colours from the page
Tick **Map tokens from the page's CSS variables** and a token is read from a CSS variable on the page that holds the player, before the theme's own value.

The **Moodle** preset maps the starter names onto Bootstrap's: `color/primary` and `color/button` to `--bs-primary`, `color/on-button` to `--bs-white`, `color/background` to `--bs-body-bg`, `color/text` to `--bs-body-color`, `color/muted` to `--bs-secondary-color`, `color/border` to `--bs-border-color`, and so on. Type your own variable names (comma separated, tried in order) beside a token to map any other.

A missing or odd variable leaves the theme's colour, and only plain colours are accepted. A High contrast theme is never replaced by the page's colours. The player option `hostVariables: false` ignores all of this.

## A project that did not start from a pack
**Apply the UniSQ look…** (in the **Themes** tab, in **Project** settings, or in <kbd>Ctrl</kbd>+<kbd>K</kbd>) gives any other project the colourway and the frame: a theme, the brand tokens, a Content master with the logo and accent bar, and the pages set to use it. It does not lock anything. See [Themes and colour tokens](themes#apply-the-unisq-look).

## Branded projects
A project made from a [branded starter pack](branded-starters) carries a theme for each UniSQ colourway (Gold, Purple, Blue, Green, Orange, Red) and High contrast. Its **Project** settings have a **Colourway** row that picks the default theme, and an option to let learners switch. Its layers can only use the project's tokens, so edit a colourway's colours here rather than typing a hex.

## Not yet
Tokens are colours only. Fonts, radii and spacing are not tokens. Colours inside script and shader layers, captions settings, and images do not follow themes. A keyframe that animates a colour between two token colours snaps instead of blending.
