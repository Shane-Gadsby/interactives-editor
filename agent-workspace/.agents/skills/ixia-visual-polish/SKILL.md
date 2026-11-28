---
name: ixia-visual-polish
description: Use this skill when the designer asks for something to look better, tidier, more consistent or on brand, or when you place new layers and need spacing, sizes, colours, text styles, page masters, auto layout or colourways that match the project. It holds the design scale and the 800 px StudyDesk layout rules.
---

# Visual polish

Follow the project's own look first. Read the page you are changing (`get_overview` with the artboard, then `get_layers`) and match its fonts, sizes, spacing, radii and colours. Where there is nothing to match, use the numbers below. Never use numbers or colours of your own when one of these exists.

## Layout width

StudyDesk embeds activities at about 800 px wide, on desktops and on phones. Lay pages out for that: one column of cards, two at most, never a wide desktop layout. Keep content inside the page margins and keep important things away from the edges. Many learners are on a small screen, so text must wrap and tap targets must be big.

## The design scale (refs/design-scale.md)

| Scale | Values |
|---|---|
| SPACE (gaps and padding) | xs 4, s 8, m 12, l 16, xl 24, xxl 32 |
| RADIUS | small 6 (tooltip, tag), control 8 (button, input, answer row), card 12 (question, dialog, toast, accordion) |
| TYPE (px) | small 13 (hints, captions), body 15, heading 18, title 22 |
| CONTROL_H | 44 (anything pressed) |
| SHADOW raised | x 0, y 4, blur 12, spread 0, color rgba(0,0,0,0.18) (tooltip, toast) |
| SHADOW floating | x 0, y 16, blur 40, spread 0, color rgba(0,0,0,0.22) (dialog over a dimmed page) |

Nothing you build is spaced by a number outside SPACE. Padding is the same all round, or top and bottom then the sides.

A conflict to resolve in favour of the learner: the scale lists body at 15, but learner pages read best at 16 px or more, and the accessibility guidance is body text at least 16 px, never under 12. When you write body text for learners use 16 (the default text layer size). Use 13 only for hints and captions, and never go under 12. Keep headings clearly larger than body (18 and 22 are the minimum steps).

## Colour: tokens, not hex

- Anywhere a colour goes you can write `"token:<name>"`, for example `token:color/primary`. It follows Light, Dark, High contrast and any colourway. A plain hex never changes with the theme.
- A layer made with `add_layer` and no colour follows the starter tokens: shapes `color/surface-muted`, text `color/text`, buttons `color/button` with `color/on-button`, inputs `color/background` with a `color/border` outline, links `color/link`, frames `color/background`. Give a colour only to override.
- Starter tokens: color/background, color/surface, color/surface-muted, color/text, color/muted, color/primary, color/on-primary, color/link, color/button, color/on-button, color/border, color/divider, color/focus, color/success, color/success-surface, color/error, color/error-surface, color/warning, color/warning-surface.
- Pair colours the way the tokens pair: text on a `color/primary` fill uses `color/on-primary`, a button label uses `color/on-button`. Right and wrong use `color/success` and `color/error` with their `-surface` backgrounds, plus a word or icon, never colour alone.
- A new colour you need belongs in a token: `add_token {name, value or values {theme: colour}}`, then `"token:<name>"` on layers. Check contrast of the pairs in every theme (4.5:1 for text). Syntax and gradient paints are in refs/tokens.md.
- Fills are `{"type":"solid","color":...}` or a gradient `{"type":"linear","angle":90,"stops":[{"offset":0,"color":"token:color/primary"},{"offset":1,"color":"#ffffff"}]}`.
- Do not hunt for a "better" palette. If the project uses a branded colourway, keep to it.

## Colourways and themes

`add_colourway {colourway: gold|purple|blue|green|orange|red|high-contrast, default?}` adds a UniSQ colourway as a theme, with its brand tokens, and `default: true` makes the project open in it. `set_themes {default, follow, learner_switcher}` sets which theme shows, whether it follows the learner's dark mode and contrast settings, and whether learners get colourway swatches. `add_theme` and `add_token` build your own. Only change a project's themes when asked. Read refs/help/themes.md and refs/help/concept-themes-tokens.md first.

## Text styles

`add_text_style {name, props: {fontFamily, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, color?}}`, then give layers `styleRefs: {text: "<style name>"}`. One style change then restyles every layer that follows it. Use the project's existing text styles when it has some (`get_overview` lists them). Default text is Open Sans 16 px, line height 1.3, and buttons are 44 px high, weight 700, centred.

Text rules: one heading per page, instructions next, then the activity, then controls (Check, Next). Left-align running text. Keep lines short, and keep on-screen text brief because learners skim. Rich text runs and per letter animation are in refs/layers/text.md.

## Auto layout frames

A frame with `layout` places its children for you, like flexbox. Prefer it to hand-placed x and y, since it survives changes of text and a hidden layer closes up over its gap.

```
"layout": {"direction":"column","gap":16,"padding":{"top":24,"right":24,"bottom":24,"left":24},"justify":"start","align":"stretch","wrap":false,"hugHeight":true}
```

- `direction` row or column. `justify` start, center, end or space-between. `align` start, center, end or stretch. `hugWidth` and `hugHeight` shrink the frame to its children. `minWidth`, `maxWidth`, `minHeight` and `maxHeight` limit its own size (a min beats a max).
- A child's part is `layoutItem`, for example `{"width":"fill"}` (sizes are fixed, fill, hug or percent) or `{"position":"absolute","inset":{"left":0,"top":0}}`.
- Inside an auto layout frame the layout sets x and y. Do not set them.
- Cards: frame with `cornerRadius` 12, padding 16 or 24, gap 12 or 16, a `color/surface` fill and optionally a `color/border` stroke. Rows of controls use a gap of 8 to 16 and 44 px high controls.
- Details, grids and stacks: refs/help/auto-layout.md and refs/layers/layout-frames.md.

## Page masters

A page master is one artboard holding what every page shares (logo, accent bar, footer, Back and Next). Pages draw it under their own layers. Set one on a page with `set_artboard {id, props: {master: "<name or id>"}}`, hide parts of it with `masterHide` (layer names), fill text slots like `{pageTitle}` with `masterSlots`, and put layers over the page with `masterOver`. A new page made by `build` copies the look of the open page, master included, which is usually all you need. Never detach or delete a master unless asked. Read refs/help/page-master.md.

## Looking after polish without over-polishing

- Align things to each other, leave space, and do not fill the page.
- Use shadows sparingly: raised for a tooltip or toast, floating only for a dialog.
- Do not add decoration or motion for its own sake (ixia-advanced-media).
- Corner radius on new buttons defaults to 6 and the scale says control 8. Match whatever the project already uses, and use the scale for new components.
- You cannot see the canvas. After a big layout change, say so and suggest the designer checks Preview at phone width, and use `get_layers` to check sizes and positions.

## Pointers

- refs/design-scale.md, refs/tokens.md, refs/layers/defaults.md
- refs/help/themes.md, refs/help/brand-kits.md, refs/help/tutorial-brand.md, refs/help/branded-starters.md
- refs/help/responsive.md and refs/help/tutorial-responsive.md for narrow and wide page versions
- refs/help/text.md and refs/help/fill-stroke.md
