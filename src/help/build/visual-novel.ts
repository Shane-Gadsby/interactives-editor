import type { BuildTutorial } from './index';
import { saw, type Check } from '../../lib/tutorial-checks';

//The template's own two characters and scenes, so a check can tell what the learner added
const TEMPLATE_CAST = ['millie', 'olive'];
const TEMPLATE_SCENES = ['the club fair', 'signing up', 'wandering the fair'];

const fromTemplate: Check = (c) => !!c.project.story?.chapters?.length && c.project.artboards.some((a) => a.name === 'Title') && !!c.project.story.stage;
const newcomers = (c: Parameters<Check>[0]) => (c.project.story?.cast ?? []).filter((m) => !TEMPLATE_CAST.includes(m.name.trim().toLowerCase()));
const someoneWithAFace: Check = (c) => newcomers(c).some((m) => m.expressions.some((e) => !!e.assetId));
const sceneWithAChoice: Check = (c) => {
  const names = newcomers(c).map((m) => m.name.trim().toLowerCase());
  return (c.project.story?.chapters ?? []).some((ch) => {
    const lines = ch.lines.map((l) => l.text.trim());
    const scene = lines.some((l) => l.startsWith('#') && !TEMPLATE_SCENES.includes(l.replace(/^#+/, '').trim().toLowerCase()));
    const choice = lines.some((l) => l.startsWith('?'));
    const speaks = lines.some((l) => names.some((n) => l.toLowerCase().startsWith(n + ':') || l.toLowerCase().startsWith(n + ' (')));
    return scene && choice && speaks;
  });
};

export const tutorial: BuildTutorial = {
  order: 46,
  level: 'beginner',
  minutes: 15,
  example: 'tut-visual-novel',
  topic: {
    id: 'tutorial-visual-novel',
    title: 'Your first visual novel',
    group: 'Build it',
    summary: 'Start from the Visual novel template, add a character with faces, write a scene with a choice, play it from a line and share it.',
    keywords: 'tutorial visual novel story script character cast faces psd photoshop expressions scene choice preview from this line share link template',
    body: `You will make a short visual novel set in a library: a new character called Ren with two faces, a scene where Ren talks to the reader, and a choice that changes what Ren says. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Your first visual novel**. **Play** runs it and **Make my copy** gives you your own copy.

A visual novel here is written as plain text, like a play, in the **Story** tab. The template already has a title screen, a stage with the dialogue box, saves, settings and extras, so you only write.

## 1. Start from the template

1. On the projects page press **New project**, open **Templates**, then **Built-in**, and pick **Visual novel**.
2. Name it **The library** and press **Create project**.
3. Press **Preview** and click through a few lines to see what you're starting from, then close Preview.

## 2. Add a character

1. Open the **Story** tab (along the bottom; **More panels** brings it back if it's put away).
2. Under **Cast**, press **+ Add someone** and call them **Ren**.
3. Give Ren some faces. The quickest way: drop a Photoshop file of Ren on their form, with a group called **Faces** holding a layer for each face (**happy**, **thinking**) over the body. Each face becomes a picture of the whole character, lined up with the others.
4. No PSD? Put pictures in **Assets** named **Ren happy** and **Ren thinking**, and Ren's form offers to use them.

## 3. Write a scene with a choice

Open **Chapter 1** and add these lines at the end. A name and a colon is someone talking, a line starting with **?** is a choice, and the indented lines under a choice play when it's picked.

\`\`\`
# At the library
Ren (happy): You found the quiet floor!
? Ask Ren to study with you
    Ren (thinking): Only if you bring snacks.
? Say you're just passing
    Ren: Suit yourself.
\`\`\`

If something is wrong (a name that isn't in the cast, a face Ren doesn't have) the line is marked as you type, often with a fix to press.

## 4. Play it from a line

Click on the line **Ren (happy): You found the quiet floor!** and press **Preview from this line**. Preview starts right there, with the background and the cast as the lines above it leave them. Pick each choice in turn.

## 5. Share it

Press **Share**, then **Share…**, and create a link. Anyone with it can play your story; saves stay in each reader's own browser.

**Next:** [Add a puzzle](tutorial-add-puzzle) to your story.

help:story help:story-stage help:story-game`,
  },
  guide: {
    1: { check: fromTemplate, show: 'preview' },
    2: { check: someoneWithAFace, show: 'panel-story' },
    3: { check: sceneWithAChoice, show: 'panel-story' },
    4: { check: saw('previewed'), show: 'panel-story' },
    5: { show: 'share' },
  },
};
