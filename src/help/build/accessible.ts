import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 61,
  level: 'intermediate',
  minutes: 20,
  example: 'tut-accessible',
  topic: {
    id: 'tutorial-accessible',
    title: 'Check and fix accessibility',
    group: 'Build it',
    summary: 'Make a small page with five common problems in it, then use the Accessibility checker to find and fix each one: contrast, names, keyboard, motion and Tab order.',
    keywords: 'tutorial accessibility a11y checker wcag contrast keyboard tab order focus screen reader name text alternative alt text description role button heading reduced motion autoplay pause small click target high contrast theme',
    body: `You will make a one-page Mars fact the quick way, with five problems a lot of real projects have. Then you open the **Accessibility** checker and fix them one at a time, until it finds nothing. Along the way you meet roles, text alternatives, the Tab order, reduced motion and the High contrast theme. It takes about twenty minutes.

**Just want to look?** The finished one, with every problem fixed, is on the projects page: **Templates**, then under **Examples** find **Build it**, **Check and fix accessibility**. **Play** runs it and **Make my copy** gives you your own copy.

You need a picture of Mars, or of anything at all: a file on your computer or one from the **Media Catalogue**.

## 1. Make the page, problems and all

Build this quickly. Each problem is on purpose, and the checker will find it.

1. On the projects page press **New project**. Keep **Blank project**, type **Mars fact** as the name and press **Create project**.
2. **Problem 1, pale text.** Press <kbd>T</kbd> and drag a wide text box across the top of the page. Type \`Mars, the red planet\` and press <kbd>Esc</kbd>. Name it **Title**. In its **Text** section set **Size** to 32, then press the small arrow beside **Colour**, open the **Tokens** tab and pick **color/muted**. It is a quiet grey, meant for small print, not for a title.
3. **Problem 2, a picture with no description.** Drag your picture from your computer onto the left of the page. A box asks **What is this a picture of?**: press **Skip**. Name the layer **Mars photo**.
4. Press <kbd>T</kbd> again and drag a text box to the right of the picture. Type \`Mars has the tallest volcano we know of: Olympus Mons, about 22 km high.\` and name it **Fact**.
5. Press <kbd>B</kbd> and drag a button in the bottom right corner. Set its **Label** and **Name** to **Next**.
6. **Problem 3, a tiny dot only a mouse can use.** Press <kbd>O</kbd> for the **Ellipse** tool and draw a small circle between the picture and the fact. Set **W** and **H** to 20 and name it **Info**. In its **Interactions** section press **+ When clicked…**, choose **Show a layer**, pick **Fact** under **Which layer**, and press **Add**. **Fact** is hidden now, until the dot is clicked.
7. **Problem 4, motion that never stops.** Select **Mars photo**. Open the **Timeline** tab and press **+ New timeline**. With the playhead at 0 ms, set **Opacity** to 0 and click the diamond beside it. Move the playhead to **1000 ms**, set **Opacity** to 100 and click the diamond again. Change **Play once** to **Loop** and tick **Autoplay**. The picture now fades in over and over.
8. **Problem 5, the wrong Tab order** is already there: you drew **Next** before **Info**, and Tab follows the order layers were added, so a keyboard reaches **Next** first.

Press **Preview** and try it with the mouse: it works. Now press <kbd>Tab</kbd> a few times. Focus goes to **Next**, then to the dot, and the picture keeps flashing in. Press <kbd>Esc</kbd>.

## 2. Run the checker

Open the **Accessibility** tab at the bottom of the window. It checks the whole project every time something changes, and lists what it found under the page's name:

| Finding | Layer |
|---|---|
| **Low text contrast** | Title |
| **Only works with a mouse or touch** | Info |
| **No name for a screen reader** | Info |
| **Small click target** | Info |
| **Picture has no description** | Mars photo |
| **Animation starts by itself** | (the page) |
| **No way to pause moving content** | (the page) |

The coloured dots at the top count them: red **Problem**s, amber **Probable** ones and blue ones **to look at**. Click a finding and the right side says what was found, **Why it matters** to the person using the page, and **What to do**. Clicking it also selects the layer, so you can fix it straight away.

The bar says **Checks found, not a compliance result**, and it means it. A clean list is a good start, not proof. The checker can't hear a video's captions or tell whether a description is any good.

## 3. Fix the pale title

1. Click **Low text contrast**. It says how far the title falls short. Text this big needs 3:1 against what is behind it (smaller text needs 4.5:1), and this grey on white is well under.
2. **Title** is selected. Press the small arrow beside **Colour** in its **Text** section, open **Tokens** and pick **color/text**.

The finding goes. Pick a token rather than typing a darker grey: a token has a value in every theme, so the title stays readable in **Dark** and **High contrast** too (step 8). A **Fix** button on a contrast finding, where one is offered, changes the colour to a plain one that no longer follows the theme.

While **Title** is selected, open its **Accessibility** section and set **Role** to **Heading**, with **Level** 1. A screen reader user can now jump straight to it. The checker doesn't ask for this, which is one of the things it can't see.

## 4. Describe the picture

1. Click **Picture has no description**.
2. Its box under **What to do** takes the words. Type \`Mars from space: a red, dusty planet with a white ice cap at the top\` and press **Apply**.

That fills in the picture's **Text alternative**, the words a screen reader says instead of the picture. Say what it shows and why it is there, in a sentence. If a picture were only decoration, **Decorative / reviewed** would say so instead.

## 5. Make the dot work with a keyboard

Three findings are about **Info**. A plain shape can be clicked with a mouse, but a keyboard can't reach it and a screen reader doesn't know what it is.

1. Click **Only works with a mouse or touch**. **Info** is selected.
2. In its **Accessibility** section, set **Role** to **Button**. Enter and Space now click it.
3. Set **Tab stop** to **Always**. (The line under it already says it is reachable with Tab, but the checker only counts a shape as keyboard-ready when this says **Always**.)
4. Type \`Show a fact about Mars\` in **Text alternative**. That is its name: say what it does, not what it looks like.
5. In the **Layer** section, set **W** and **H** to 32. Small targets are hard to hit for anyone with a shaky hand or a big thumb, and 24 by 24 is the least the guidelines ask for.

All three findings go.

> When you can, use a real **Button** layer instead. It is a control already, so the keyboard, the name and the role all come for free.

## 6. Calm the motion

1. Click **Animation starts by itself** and press its button, **Respect reduced motion**. Viewers who ask their device for less motion now see the last frame straight away.
2. Click **No way to pause moving content**. There is no button for this one, because it needs a decision: give people a way to pause it, or stop it repeating. A fade-in only needs to happen once, so in the **Timeline** tab change **Loop** back to **Play once**.

Moving content that runs on for more than five seconds needs a pause. Something that plays once and stops does not.

## 7. Put the Tab order right

The checker can't see focus order, so this one is yours to check.

1. Click the page's name, **Home**, above it on the canvas. The **Tab order** section in the Properties panel lists every tab stop in the order Tab visits them: **Next**, then **Info**.
2. Press the **↑** beside **Info** (**Earlier in the Tab order**). Now Tab reaches the dot first, then **Next**, the order a sighted reader would take.

**Reset to layer order** goes back to the order the layers were added.

## 8. Look at it in every theme

A new project has three themes: **Light**, **Dark** and **High contrast**. The player picks one from the viewer's own settings.

1. Use the theme menu in the top bar (it shows **Light** now) to show **Dark** on the canvas, then **High contrast**. Everything you picked from **Tokens** changes with it.
2. Open the **Themes** tab at the bottom. It lists each token's colour in each theme and warns where a pair is too close.

The checker looks at every theme for text that uses tokens, so a title that passes in Light but fails in Dark is listed too.

## 9. Try it

1. Press **Preview**. Press <kbd>Tab</kbd>: a ring shows on the dot. Press <kbd>Enter</kbd> and the fact appears. <kbd>Tab</kbd> again reaches **Next**.
2. Press **Screen reader** in the Preview's bar. A strip under the preview shows what would be said as you move around.
3. Press <kbd>Esc</kbd>. Back in the **Accessibility** tab, the list says **The checks found nothing to look at**.

## Go further

- **Export report** downloads a printable page of every finding, what was not checked, and a box to sign. Use it when someone needs to sign the project off.
- **Mark reviewed** takes a finding you have looked at and accepted out of the counts, with the date in the report.
- **Apply quick fixes** does every fix that needs no typing in one go. Read the list first.
- Test with a real screen reader and with only a keyboard as well. The checker finds the common things, not all of them.

## What you learned

- The **Accessibility** tab finds problems as you work, says why each matters, and fixes the safe ones.
- A clickable shape needs a **Role**, a **Tab stop** and a **Text alternative**; a real **Button** has them already.
- A picture needs a **Text alternative**, or to be marked decorative.
- Colours from **Tokens** follow the **Light**, **Dark** and **High contrast** themes.
- **Respect reduced motion**, **Play once** and the **Tab order** section deal with motion and focus.

**Next:** every check is explained in [Accessibility checker](accessibility-checker), and roles, Tab order and dialogs in [Accessibility: roles and keyboard](accessibility). To restyle a project with themes and tokens, do [Use the UniSQ look and colour themes](tutorial-brand).`,
  },
};
