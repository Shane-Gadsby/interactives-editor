//The sound tutorial's finished project: a Start button that starts the soundtrack and goes on, then a page with a sound effect,
//a sound on/off button, Stop the music and Back. Every flow is what + When clicked… writes (the recipes), except the sound
//button, which is the empty click event and a Captions and sound node, the way the tutorial builds it in the graph
import { DEFAULT_TRANSITION_MS, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { addPlaceholderSound } from '../../src/lib/branded/sets/media/sounds';
import { writeClickFlow } from '../../src/lib/click-flow';
import { blankProject, type TutorialExample } from './kit';
import { addPage, buttonLayer, textLayer } from './_data-helpers';

/**
 * What + When clicked… writes for the recipes used here: a click event joined to the recipe's action, with the same settings
 * (src/lib/recipes.ts RECIPES, copied because that module reaches the browser-only asset store and can't load in node).
 */
const RECIPE_ACTIONS: Record<string, (a: Record<string, string>) => { kind: string; params?: Record<string, unknown> }> = {
  sound: (a) => ({ kind: 'action.sound', params: { asset: a.sound } }),
  soundtrack: (a) => ({ kind: 'action.sound', params: { asset: a.sound, loop: 'true', soundtrack: true } }),
  'soundtrack-stop': () => ({ kind: 'action.stopSound' }),
  'page-next': () => ({ kind: 'action.artboard', params: { to: 'next', transition: 'fade', duration: DEFAULT_TRANSITION_MS } }),
  'page-previous': () => ({ kind: 'action.artboard', params: { to: 'previous', transition: 'fade', duration: DEFAULT_TRANSITION_MS } }),
};
export const whenClicked = (ab: Artboard, layer: SceneNode, recipe: string, answers: Record<string, string> = {}) => writeClickFlow(ab, layer.id, [RECIPE_ACTIONS[recipe](answers)]);

function build(): Project {
  const p = blankProject('Sound tour');
  const home = p.artboards[0];

  //Placeholder sounds stand in for the author's own files: a short ding, and a little tune that loops as the music
  const ding = addPlaceholderSound(p, 'Ding.wav', [
    { hz: 880, ms: 140, gap: 30 },
    { hz: 1320, ms: 260 },
  ]);
  const music = addPlaceholderSound(p, 'Music.wav', [
    { hz: 392, ms: 380, gap: 20, level: 0.45 },
    { hz: 494, ms: 380, gap: 20, level: 0.45 },
    { hz: 587, ms: 380, gap: 20, level: 0.45 },
    { hz: 494, ms: 380, gap: 20, level: 0.45 },
    { hz: 440, ms: 380, gap: 20, level: 0.45 },
    { hz: 523, ms: 380, gap: 20, level: 0.45 },
    { hz: 494, ms: 380, gap: 20, level: 0.45 },
    { hz: 392, ms: 600, gap: 200, level: 0.45 },
  ]);

  const title = textLayer(p, 'Title', 'Sound tour', 80, 150, 640, 44, 700);
  const intro = textLayer(p, 'Intro', 'Press Start to hear the music. It keeps playing on the next page.', 80, 230, 640, 20);
  const start = buttonLayer(p, 'Start button', 'Start', 80, 320, 160, 52);
  home.children.push(title, intro, start);
  whenClicked(home, start, 'soundtrack', { sound: music });
  whenClicked(home, start, 'page-next');

  const page = addPage(p, 'Sounds');
  const heading = textLayer(p, 'Title', 'Sounds', 80, 80, 640, 40, 700);
  const line = textLayer(p, 'Intro', 'Press Ding for a sound effect. The music carries on from the first page until you stop it.', 80, 150, 640, 20);
  const dingButton = buttonLayer(p, 'Ding button', 'Ding', 80, 260, 160);
  const soundButton = buttonLayer(p, 'Sound button', 'Sound on or off', 260, 260, 200);
  const stopButton = buttonLayer(p, 'Stop button', 'Stop the music', 480, 260, 200);
  const back = buttonLayer(p, 'Back button', 'Back', 80, 480, 160);
  page.children.push(heading, line, dingButton, soundButton, stopButton, back);
  whenClicked(page, dingButton, 'sound', { sound: ding });
  //+ On click (empty), then Captions and sound from the graph, Do: Sound: flip
  writeClickFlow(page, soundButton.id, [{ kind: 'action.captions', params: { op: 'soundToggle' } }]);
  whenClicked(page, stopButton, 'soundtrack-stop');
  whenClicked(page, back, 'page-previous');
  return p;
}

export const example: TutorialExample = {
  key: 'tut-sound',
  topic: 'tutorial-sound',
  title: 'Sound effects and music',
  description: 'Music that starts on the first page and carries on to the next, a sound effect on a button, a sound on or off button and a way to stop the music: the Sound tutorial\'s project.',
  tags: ['sound', 'music', 'audio', 'soundtrack'],
  build,
  notes: [
    { text: '**Start does two things.** Select *Start button* and its Interactions section reads: play Music.wav as the soundtrack, and go to the next page. Both came from + When clicked….' },
    { text: '**Swap the placeholder sounds.** Ding.wav and Music.wav are short made-up tones. In the Assets panel, press the arrow on each to replace it with your own file, and every button follows.', colour: 'gold' },
    { page: 1, text: '**The music is still playing here** because it was started as the soundtrack. Stop the music fades it out, and Sound on or off mutes everything for this learner.', colour: 'sky' },
  ],
  graphNotes: [
    { page: 1, at: 2, text: '**Sound on or off** is a Captions and sound node set to Sound: flip. It mutes or unmutes every sound for this learner, and their browser remembers the choice.' },
  ],
};
