import type { Concept } from './index';

export const concept: Concept = {
  order: 130,
  area: 'construction',
  topic: {
    id: 'concept-themes-tokens',
    title: 'Theme colours and fixed colours',
    group: 'Concepts',
    summary: 'A colour is either a token, which changes with the theme (Light, Dark, High contrast), or a fixed colour, which never does. Mixing the two is how text vanishes in Dark.',
    keywords: 'concept theme themes token tokens colour color fixed plain hex dark light high contrast vanished invisible text switch does nothing contrast fails starter palette link colours to tokens',
    body: `A colour in the editor is one of two things:

- A **token**: a named colour such as \`color/text\` or \`color/button\`, with a value for each theme. A layer that uses one changes when the theme changes.
- A **fixed colour**: just a colour, such as \`#ffffff\`. It is the same in every theme.

The finished interactive picks a theme for each viewer. By default it follows their settings: a viewer who asks for more contrast gets **High contrast**, one in dark mode gets **Dark**, everyone else gets the default theme. So the same page can be drawn three ways, and only the token colours change between them.

![The colour picker opened from the arrow beside a swatch, on its Tokens tab: color/background, color/surface, color/text, color/primary and the rest, each with its Light, Dark and High contrast values.](help/concept-themes-tokens-picker.png)

## Where people get caught out

- **"I picked a hex colour and High contrast broke."** A fixed colour stays put while the theme changes everything around it. Pick from the **Tokens** tab of the colour picker instead (the arrow beside the swatch), or add a token with that colour in the **Themes** tab and use it.
- **"My text vanished in Dark."** The text follows a token, which turned light in Dark, but the card behind it is a fixed white, which didn't. Both colours need to be tokens, or both fixed.
- **"Switching the theme changes nothing."** Nothing in the project uses a token, which is normal for an imported file or an older project. The line **Nothing here follows the theme: these colours are fixed** shows, with **Link colours to tokens**, which turns each plain colour that exactly matches a token into that token and tells you what it will change first.
- **"The starter colours fail the contrast check on Light."** That is expected. Light is the shared StudyDesk palette as the Toolbox uses it, and some of its pairs fall below WCAG AA. Dark and High contrast pass. Choose different colours for a piece that has to pass on Light.
- **"I detached it by accident."** Choosing any other colour, or the **x** on a token's chip, keeps the colour as it is now as a fixed colour. Pick the token again from the **Tokens** tab.

## How to tell what is going on

- A colour that follows a token shows a named chip instead of a hex box. Hover it for its value in each theme.
![The Themes tab: Showing set to the Gold theme, a column for each theme with its scheme, High contrast and Default boxes, and a row for each token with its colour in every theme.](help/concept-themes-tokens-themes-tab.png)

- **Showing** in the **Themes** tab, and the theme box in the top bar, switch what the canvas draws, so you can look at Dark without leaving the editor. Preview has a theme box and a **Viewer** box that pretends dark mode or more contrast is on.
- The [Accessibility checker](accessibility-checker) checks text contrast in every theme (a finding that starts "In Dark:" is about Dark), and warns **Theme colour on a fixed colour** for text that follows a token on a fixed background.

**More:** [Themes and colour tokens](themes), [Using a token](themes#using-a-token), [When switching the theme changes nothing](themes#when-switching-the-theme-changes-nothing), [Contrast](themes#contrast), [How the finished interactive picks a theme](themes#how-the-finished-interactive-picks-a-theme).`,
  },
};
