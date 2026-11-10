import type { BuildTutorial } from './index';

export const tutorial: BuildTutorial = {
  order: 57,
  level: 'beginner',
  minutes: 15,
  example: 'tut-sound',
  topic: {
    id: 'tutorial-sound',
    title: 'Sound effects and music across pages',
    group: 'Build it',
    summary: 'Music that starts on the first page and keeps playing on the next, a sound effect on a button, a sound on or off button and a button that stops the music.',
    keywords: 'tutorial sound sounds audio music soundtrack background music effect click sound ding play sound stop sound mute unmute sound off sound on across pages carry on loop',
    body: `You will make two pages. The first has a **Start** button that starts some music and moves on. The music keeps playing on the second page, where one button plays a sound effect, one turns all sound on or off, and one stops the music. It takes about fifteen minutes.

**Just want to look?** The finished one is on the projects page: **Templates**, then under **Examples** find **Build it**, **Sound effects and music**. **Play** runs it and **Make my copy** gives you your own copy. Its two sounds are short made-up tones, so swap them for real ones.

You need two sound files on your computer (\`.mp3\`, \`.wav\` or \`.ogg\`): a short sound effect, such as a ding or a click, and a piece of music you are allowed to use. Every step here is done from the Properties panel except one, the sound on or off button, which takes one node in the **Interactions** graph.

## 1. Make a project

On the projects page press **New project**. Keep **Blank project**, type **Sound tour** as the name and press **Create project**. The editor opens with one page called **Home**.

## 2. Make the first page

1. Press <kbd>T</kbd> for the **Text** tool, click near the top left of the page and type \`Sound tour\`. Press <kbd>Escape</kbd> to finish. Make it big in the Properties panel if you like.
2. Add a second line under it the same way: \`Press Start to hear the music. It keeps playing on the next page.\`
3. Press <kbd>B</kbd> for the **Button** tool and drag a button under the text. In the Properties panel change **Label** to **Start** and **Name** to **Start button**.

## 3. Start the music

1. With **Start button** selected, scroll the Properties panel to its **Interactions** section and press **+ When clicked…**.
2. In the list, under **Motion and sound**, choose **Play music that carries on across pages**.
3. Under it, **Which music** says *none in this project yet*. Press **+ Add a new sound…** and pick your music file. It is added to the project and chosen.
4. Press **Add**.

![The When Start button is clicked dialog: Play music that carries on across pages picked under Motion and sound, Which music set to the music file, and the sentence it will add.](help/tutorial-sound-when-clicked.png)

That one choice made a **Play sound** node with **Soundtrack: keep playing on the next pages** and **Loop** both on. A soundtrack is the project's music: it carries on when the page changes, goes quiet while any narration plays over it, and goes round until something stops it.

## 4. Move on to the next page

1. Press **+ When clicked…** on **Start button** again. A layer can do more than one thing when it is clicked.
2. Choose **Go to the next page** and press **Add**. Leave **How the page changes** and **Speed** as they are.

The **Interactions** section now has two sentences, one for the music and one for the page. There is no next page yet, so make it.

![Start button's Interactions section with two sentences: play Music.wav on a loop as the soundtrack, and go to the next page.](help/tutorial-sound-two-sentences.png)

## 5. Add the second page

1. At the bottom of the **Layers** panel press **+ Add page**. A new page appears beside **Home** and is selected.
2. In the Properties panel change its **Name** to **Sounds**.
3. Give it a heading with the **Text** tool: \`Sounds\`, and a line under it: \`Press Ding for a sound effect. The music carries on from the first page until you stop it.\`

## 6. A sound effect

1. Draw a button on **Sounds**. Set **Label** to **Ding** and **Name** to **Ding button**.
2. Press **+ When clicked…**, choose **Play a sound**, and under **Which sound** press **+ Add a new sound…** and pick your short sound file. Check **Which sound** shows it, not the music.
3. Press **Add**.

**Play a sound** plays the file once, each time the button is pressed. It does not stop the music: the two play together.

## 7. Stop the music, and go back

1. Draw another button. **Label**: **Stop the music**, **Name**: **Stop button**.
2. Press **+ When clicked…**, choose **Stop the music** and press **Add**. It fades the soundtrack out, and stops any other sound that is still playing.
3. Draw one more button near the bottom. **Label**: **Back**, **Name**: **Back button**. Give it **+ When clicked…**, **Go to the previous page**, **Add**.

Going back to **Home** and pressing **Start** again does not start a second copy of the music. A soundtrack that is already playing just carries on.

## 8. A sound on or off button

The list under **+ When clicked…** has no mute, so this one is built in the graph. It takes one node.

1. Draw a button beside **Ding**. **Label**: **Sound on or off**, **Name**: **Sound button**.
2. In its **Interactions** section press **+ On click (empty)**. The **Interactions** tab opens at the bottom with a new **When clicked or hovered** node, set to this button, with nothing joined to it.
3. Find the small dot on the right edge of that node. Drag from it into empty space and let go. A menu opens, headed **Add and connect**.
4. Type \`sound\` in **Find a node…** and choose **Captions and sound**. It appears where you let go, already joined.
5. Click the new node. In its settings on the right, set **Do** to **Sound: flip**.

![The Interactions graph for the Sounds page: Sound button's click joined to a Captions and sound node set to Sound: flip, with its settings on the right, and the Ding and Stop buttons' nodes below.](help/tutorial-sound-flip.png)

**Sound: flip** turns every sound in the project off for this learner, the music, the effects and any narration, and turns them back on the next time. The learner's browser remembers their choice, so a learner who wants silence gets it next time too.

## 9. Try it

1. Press **Preview** at the top right. With **From the start artboard** chosen in its bar it starts on **Home**. Press **Start**: the music starts and the **Sounds** page shows. Press **Debug** in the bar if you want the events listed under the page.

![Preview on the Sounds page after pressing Start, with Ding, Sound on or off, Stop the music and Back, and the Debug events list showing Play sound and Go to artboard.](help/tutorial-sound-preview.png)

2. Press **Ding**. The sound plays over the music.
3. Press **Sound on or off**. Everything goes quiet. Press it again and the music is back.
4. Press **Back**, then **Start**. The music carries on without starting again.
5. Press **Stop the music**. It fades out.

Press <kbd>Esc</kbd> to close the Preview.

> Browsers won't play sound until the learner has clicked or pressed a key on the page. That is why the music starts from a button. A sound started before then waits, and the player shows **Sound is waiting. Press to start it**.

## Make it yours

- **Change a sound for a better one** without touching a button: open the **Assets** tab, and on the file press the arrow (**Replace with a new version of the file**). Every button that plays it plays the new one.
- **Quieter music.** Click the **Play sound** node in the graph and set **Volume (0-1)** to \`0.4\`, so voices and effects stand out over it.
- **Credit the music.** If its licence asks for a credit, add it in the **Attributions** tab.
- **A sound on every button.** A button can have a sound and something else: give **Back** a second **+ When clicked…** with **Play a sound**.

## What you learned

- **+ When clicked…** has **Play a sound**, **Play music that carries on across pages** and **Stop the music**, and each makes ordinary nodes in the graph.
- A **soundtrack** keeps playing from page to page, and starting it again does not make a second copy.
- **Stop sound** ends it with a fade.
- A **Captions and sound** node set to **Sound: flip** is your own mute button.

**Next:** everything the **Play sound** node can do (speed, a sound from a list item, what is playing now) is in [Sound](captions#sound) and [Soundtrack music](captions#soundtrack-music). Sound that follows an animation, with captions, is in [Narration, captions and transcript](captions).`,
  },
};
