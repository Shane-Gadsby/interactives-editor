# Accessibility checker
Find contrast, keyboard, label, autoplay and flashing problems per page, fix the safe ones, and export a report for sign-off.

![The Accessibility tab: findings listed under their page on the left, and on the right what was found, why it matters, what to do and a fix button.](help/accessibility-checker.png)

The **Accessibility** tab (bottom panel) runs a set of automatic checks over the whole project and lists what it found, page by page. It is there so you find out while you are designing, not from an audit at the end.

**It lists what the checks found. It does not say the project is accessible or that it complies with WCAG.** Some problems cannot be seen by a program, and some checks cannot be sure. Those come back as **to look at**, and a person decides. What the checks cannot see is listed under [What it cannot see](accessibility-checker#what-it-cannot-see), and in every exported report.

## Reading the list

Each finding has a coloured dot:

- **Problem** (red): a check found a problem, for example grey text on white at 2.8:1 when it needs 4.5:1.
- **Probable** (amber): probably a problem, and a person decides, for example a picture with no description (it might be decoration).
- **To look at** (blue): the checker could not tell, for example text over a photo that is only partly dark, a video (it cannot hear captions) or embedded HTML.

Click a finding to **select the layer** (and open its page). The right side says what was found, with the numbers, **why it matters** to the person using the page in plain words, **what to do**, and which WCAG 2.2 success criteria it speaks to. The dots at the top are filters: click one to hide that group.

## The checks

| Check | Looks for |
|---|---|
| **Text contrast** | Text colour against what is behind it (in every [theme](themes) when the project has colour tokens): layers drawn under the text, solid fills, gradients (every stop must pass), pictures (sampled from the file) and the layer's own opacity. Normal text needs 4.5:1, large text (24 px, or 18.66 px and bold) needs 3:1. Rich text is checked run by run. |
| **Small text** | Text under 12 px on the page, counting the scale of any group it is in. This is a rule of thumb, not a WCAG number. |
| **Needs a mouse or touch** | A layer that reacts to a click, hover or drag, is not a Button or link, and has no *When a key is pressed* interaction that does the same thing. |
| **No name for assistive technology** | Clickable layers, buttons, links and fields with no text and no ARIA label. A field named only by its placeholder is a probable problem. |
| **No description** | Pictures, videos and embedded pages with no ARIA label. Script and shader layers are listed to look at. |
| **Small click target** | Anything clicked or used that is under 24 by 24 px. |
| **Animation starts by itself** | Autoplay timelines when the project does not respect reduced motion. |
| **No way to pause moving content** | An autoplaying timeline that loops or runs over 5 seconds, with no *Play or stop an animation* node set to pause, stop or toggle it. |
| **Video starts by itself** | Autoplay video with sound or without controls. Also a timeline that plays sound on its own when the viewer buttons are hidden and nothing mutes or pauses it. |
| **Flashing** | A timeline that makes a large layer (a tenth of the page or more) go bright and dark more than three times in a second. |
| **Video and narration need captions** | Narration on a timeline with no captions is an issue, and captions that cover under half of it a warning (music and effects are left alone; see [Narration, captions and transcript](captions)). A video layer with imported captions passes; one without is listed to look at, since a program cannot tell if the file has them, and it points you at [Describe what you see](describe-what-you-see) for the pictures (WCAG 1.2.5). Descriptions that run while a caption is showing, so the voice would talk over the speech, are a warning. |
| **Page title** | The project has no title. |

### How contrast is worked out

The checker does not take a screenshot. It reads the layers: the page background, then everything drawn before the text, in drawing order, at a grid of points over the part of the box the words fill. Where a gradient or a picture is behind the text it takes the range of colours there. If every point passes, there is no finding. If every point fails, it is a problem. If some pass and some do not, or the colour behind cannot be known (a video, a shader, a script layer, a blend mode, a freeform shape), it says **to look at** instead of guessing. Pictures are sampled from the asset file at a coarse resolution once they have loaded.

A binding or timeline that changes a colour while the page runs is not followed: only the starting colour is checked, and the finding says so.

## Fixing

When a fix is safe, the finding has a **Fix** button, and a green **fix** tag in the list.

- **Text contrast**: moves the text colour toward black or white by the smallest amount that passes. Not offered when the colour comes from a style, a binding, or a faded parent.
- **Small text**: raises it to 12 px. Check the layout around it.
- **Names and descriptions**: type the label and press **Apply** (or Enter). A layer name that reads like a name ("Logo") is offered as the starting text; "Rectangle 4" is not.
- **Autoplay**: turns on *Respect reduced motion*, mutes a video, shows its controls.
- **Page title**: uses the project name.

Every fix is one undo step. **Apply quick fixes** does every fix that needs no typing in the current list at once. Nothing is fixed behind your back.

## Marking reviewed

For a finding you have looked at and accepted ("it is decoration", "the captions are in the player"), use **Mark reviewed**. It leaves the finding out of the counts, and the report lists it with the date. The marks are kept in this browser, per project, and do not travel with the file.

## Exporting a report

**Export report** downloads one printable HTML page: a summary per page, every finding with why it matters and what to do, which ones were reviewed, the checks that ran, what was not checked, and a box to sign. **CSV** downloads the findings as a spreadsheet.

## What it cannot see

- Whether text is right: reading order, headings, plain language, the page language.
- Anything a script or code node does, and embedded HTML or pages.
- Whether a video has captions or audio description in the file itself, or whether a description says what is really on screen. It only sees the captions and descriptions you added here.
- Colour as the only way to tell things apart, and text that is part of a picture.
- Flashing that does not come from a timeline.
- Tab order and focus rings. Layer order sets the Tab order.

Test with a keyboard, a screen reader and your own eyes as well.
