import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 62,
  level: 'beginner',
  minutes: 15,
  example: 'tut-brand',
  topic: {
    id: 'tutorial-brand',
    title: 'Use the UniSQ look and colour themes',
    group: 'Build it',
    summary: 'Give a page the UniSQ Purple colourway with theme tokens, see it in Light, Dark and High contrast, and know when to start from a branded starter pack instead.',
    keywords: 'tutorial brand branding unisq colourway purple gold theme themes token tokens colour picker light dark high contrast default branded starter pack logo themes tab',
    body: `You will make a welcome page for a "Space week" in the UniSQ Purple colourway: a deep purple header with a gold bar under it, a card of text and a **Start** button. Every colour on it is a **token**, so the page also looks right for viewers who use dark mode or ask for more contrast. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Use the UniSQ look and colour themes**. **Play** runs it and **Make my copy** gives you your own copy.

Two words first. A **token** is a name for a colour, like \`color/text\`. A **theme**, such as **Light**, **Dark** or **High contrast**, gives every token a colour. A layer that uses a token changes colour when the theme changes; a layer with a plain colour never does.

## 1. Make a project and look at its themes

1. On the projects page press **New project**. Keep **Blank project**, type **Space week** as the name and press **Create project**.
2. Find the theme box in the top bar. It says **Light**. Pick **Dark**, then **High contrast**: the page goes dark. Put it back to **Light**.
3. Open the **Themes** tab at the bottom of the window. Each row is a token and each column a theme. **Used** counts the layers that follow each one (none yet).

A new project already has these three themes, and every layer you add follows the tokens without you choosing anything.

## 2. Add the UniSQ Purple colourway

The UniSQ colourways are the colours of the branded starter packs: Gold, Purple, Blue, Green, Orange and Red.

1. In the **Themes** tab, open **+ Colourway…** and pick **Purple: Deep purple with gold, the UniSQ dark slides.**
2. A **Purple** column appears. The starter tokens have Purple's values in it (gold buttons), and new rows starting **brand/** have arrived: the gradient, the deep purple, the accent and the logo colours.
3. Under **Purple**, tick **Default**. That is the theme the project opens in.
4. Set **Showing**, at the left of the tab's bar, to **Purple**, so the canvas draws it.

![The Themes tab: Showing set to Purple, the + Colourway list beside it, and a column for each of Light, Dark, High contrast and Purple, with Default ticked under Purple and the contrast checks on the right.](help/tutorial-brand-themes.png)

## 3. A purple header

1. Press <kbd>R</kbd> and drag a rectangle across the top of the page. Set **X** and **Y** to 0, **W** to 800 and **H** to 170, and name it **Header**.
2. In its **Fill**, press the small arrow beside the colour, open the **Tokens** tab and pick **brand/deep**. The colour box turns into a chip with the token's name on it.
3. Draw a thin rectangle under it (**Y** 170, **W** 800, **H** 8), name it **Accent bar**, and give it the token **brand/accent**, the gold.
4. Press <kbd>T</kbd> and drag a text box on the header. Type \`Space week\`, press <kbd>Esc</kbd> and name it **Title**. In its **Text** section set **Size** to 44, and for **Colour** pick the token **brand/on-deep**: the colour that reads on deep purple.

![Header's Fill with the token chip brand/deep, and the colour picker's Tokens list open with brand/deep picked, each token showing its colour in every theme.](help/tutorial-brand-token.png)

Pick tokens in pairs like this: **brand/on-deep** goes on **brand/deep**, **color/on-button** on **color/button**. Each pair is chosen to be readable in every theme.

## 4. The content

1. Draw a rectangle under the header for a card, about 680 by 230. Set **Radius** to 16 and its fill to the token **color/surface**, a soft grey.
2. Drag a text box on the card and write a welcome:

   \`Welcome. This week we tour the planets, from scorching Mercury to icy Neptune. Each day has a short activity and a quiz to finish.\`

   Set **Size** to 20. Below it add a second text, \`Due Friday, 5 pm\`, in bold.
3. Press <kbd>B</kbd> and drag a button in the bottom right. Set its **Label** and **Name** to **Start**.

You didn't pick a colour for the text or the button. They follow **color/text**, **color/button** and **color/on-button** already, which in Purple make a gold button with a dark label.

## 5. See why tokens matter

1. Select the **Due** text. Its **Colour** is a chip saying **color/text**. Press the **×** on the chip (**Detach from the token**). It looks the same, but it is a plain colour now: a hex box is back where the chip was, and the **Themes** tab says **1 colour not following a theme**.
2. Switch the theme box in the top bar to **High contrast**. The page goes near black and the **Due** text stays dark grey on it, nearly invisible. The purple header and the gold bar stay as they are, since those tokens have the same colour in every theme.
3. Open the **Accessibility** tab: it lists **Low text contrast** for **Due** twice, once starting **In Dark:** and once **In High contrast:**, since the plain grey fails in both.

![High contrast on the canvas with Due's colour detached to a plain grey, and the Accessibility tab listing Low text contrast for Due twice.](help/tutorial-brand-high-contrast.png)

4. Put it right: press the small arrow beside **Colour**, open **Tokens** and pick **color/text**. The text turns white in High contrast and both findings go.

So detach a colour only when it really must stay the same in every theme.

## 6. Try it as a viewer

1. Press **Preview**. The page opens in **Purple**, the default.
2. Change **Theme: follow the viewer** to **Theme: High contrast**, then **Theme: Dark**. Every colour follows.
3. Back on **Theme: follow the viewer**, the box beside it pretends the viewer has changed their own settings. Pick **Viewer: more contrast** and the player switches to **High contrast** by itself, as it would for a real viewer. Press <kbd>Esc</kbd>.

![Preview with Theme: follow the viewer and Viewer: more contrast: the page in High contrast, white text on near black, with the purple header and gold bar.](help/tutorial-brand-preview.png)

## The ready-made way: branded starter packs

For the full UniSQ look (gradient title pages with the logo, white content pages with a footer line, deep purple section pages) start from a **branded starter pack** instead of a blank project:

1. On the projects page open **Templates**, then **Built-in**. **Branded starter packs** is at the top.
2. Pick a colourway from the swatches, find an activity, and press **Play** to try it or **Use template** to make your own.

In a branded project the logo and brand layers are locked, colours can only be tokens and the font is Open Sans, so it stays on brand whoever edits it. Its **Project** settings have a **Colourway** row to switch colourway in one go, and **Let learners switch colourway** to give learners swatches of their own.

## Go further

- A gradient fill takes tokens too: set **Header**'s fill to a linear gradient and give its two stops **brand/gradient-start** and **brand/gradient-end**.
- Change a token's colour in one theme by clicking its colour in the **Themes** tab. Every layer that uses it changes at once.
- In the Interactions graph, the **Set theme** action lets a button change the theme while the page runs.

## What you learned

- Tokens name colours, and themes give them values. Layers that use tokens change with the theme; plain colours don't.
- **+ Colourway…** in the **Themes** tab adds a UniSQ colourway, with its **brand/** tokens, and **Default** makes it the one the project opens in.
- The colour picker's **Tokens** tab links a colour to a token.
- **High contrast** and **Dark** are chosen by the viewer's own settings, so check them before you share.
- Branded starter packs give you the whole UniSQ look, locked.

**Next:** everything about tokens and themes is in [Themes and colour tokens](themes), and every pack and colourway in [Branded starter packs](branded-starters). To check a page the way a screen reader or keyboard user meets it, do [Check and fix accessibility](tutorial-accessible).`,
  },
};
