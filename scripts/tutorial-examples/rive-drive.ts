//The Drive an imported animation tutorial's finished project. The animation is a small Lottie file written here (a ball
//bouncing on its shadow) put through the editor's own Lottie importer, the way Import on the projects page makes a project
//from it. Then what the steps add: Autoplay off, a Play or pause button, and a knob on a track that scrubs the timeline
//through a joystick
import { createNode, createProject, defaultParams, uid, type Project, type SceneNode } from 'interactives-player';
import { importLottie } from '../../src/lib/lottie-import';
import { writeClickFlow } from '../../src/lib/click-flow';
import type { TutorialExample } from './kit';

//Lottie keyframes: eased in and out between the top and the floor
const ease = { i: { x: [0.6], y: [1] }, o: { x: [0.4], y: [0] } };
const solid = (rgb: number[]) => ({ ty: 'fl', c: { a: 0, k: [...rgb, 1] }, o: { a: 0, k: 100 }, r: 1 });
const tr = { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } };
const still = (p: number[]) => ({ o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [...p, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } });

const LOTTIE = {
  v: '5.7.0',
  fr: 30,
  ip: 0,
  op: 48,
  w: 800,
  h: 600,
  nm: 'Bouncing ball',
  ddd: 0,
  assets: [],
  layers: [
    {
      ty: 4,
      nm: 'Ball',
      ind: 1,
      ip: 0,
      op: 48,
      st: 0,
      ks: {
        ...still([400, 120]),
        p: {
          a: 1,
          k: [
            { t: 0, s: [400, 120, 0], ...ease },
            { t: 24, s: [400, 330, 0], ...ease },
            { t: 48, s: [400, 120, 0] },
          ],
        },
      },
      shapes: [{ ty: 'gr', nm: 'Ball', it: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [90, 90] } }, solid([0.98, 0.55, 0]), tr] }],
    },
    {
      ty: 4,
      nm: 'Shadow',
      ind: 2,
      ip: 0,
      op: 48,
      st: 0,
      ks: {
        ...still([400, 382]),
        o: { a: 0, k: 35 },
        s: {
          a: 1,
          k: [
            { t: 0, s: [50, 50, 100], ...ease },
            { t: 24, s: [100, 100, 100], ...ease },
            { t: 48, s: [50, 50, 100] },
          ],
        },
      },
      shapes: [{ ty: 'gr', nm: 'Shadow', it: [{ ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [110, 20] } }, solid([0.1, 0.1, 0.2]), tr] }],
    },
    {
      ty: 4,
      nm: 'Ground',
      ind: 3,
      ip: 0,
      op: 48,
      st: 0,
      ks: still([400, 386]),
      shapes: [{ ty: 'gr', nm: 'Ground', it: [{ ty: 'rc', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [640, 8] }, r: { a: 0, k: 4 } }, solid([0.55, 0.6, 0.7]), tr] }],
    },
  ],
};

function build(): Project {
  //Import on the projects page: a new project named after the animation, holding its page and timeline
  const imp = importLottie(structuredClone(LOTTIE), 'Bouncing ball');
  const p = createProject(imp.artboard.name);
  const ab = imp.artboard;
  ab.canvasX = 0;
  ab.canvasY = 0;
  p.artboards = [ab];
  p.settings.startArtboardId = ab.id;
  const tl = ab.timelines[0];
  //Step 3: Autoplay off, so the buttons and the knob are in charge
  tl.autoplay = false;

  const button = createNode('button', { name: 'Play button', label: 'Play or pause', x: 320, y: 440, width: 160, height: 44 } as Partial<SceneNode>);
  const track = createNode('rect', { name: 'Track', x: 160, y: 520, width: 480, height: 36, radius: 18, fill: { type: 'solid', color: '#e4e7ec' } } as Partial<SceneNode>);
  const knob = createNode('ellipse', {
    name: 'Knob',
    x: 160,
    y: 520,
    width: 36,
    height: 36,
    fill: { type: 'solid', color: '#3b5bfd' },
    draggable: { axis: 'x', bounds: track.id, label: 'Scrub the bounce' },
  } as Partial<SceneNode>);
  const words = createNode('text', {
    name: 'Instruction',
    text: 'Press Play or pause, or drag the knob to scrub',
    x: 150,
    y: 40,
    width: 500,
    height: 28,
    fontSize: 20,
    fontWeight: 700,
    align: 'center',
    color: '#101828',
  } as Partial<SceneNode>);
  ab.children.push(words, button, track, knob);

  //Play or pause: + When clicked..., Play an animation, then Do changed to Toggle play/pause in the graph
  writeClickFlow(ab, button.id, [{ kind: 'action.timeline', params: { ...defaultParams('action.timeline'), timeline: tl.id, op: 'toggle' } }], 'click');

  //The joystick: the knob's centre across the track (less half a knob at each end) is handle.x, 0 to 1
  ab.joysticks = [{ id: uid('j'), name: 'Scrub', xTimeline: tl.id, x: 'handle.x', yTimeline: null, y: 'pointer.y / artboard.height', handle: knob.id, area: { x: 178, y: 520, width: 444, height: 36 } }];
  return p;
}

export const example: TutorialExample = {
  key: 'tut-rive-drive',
  topic: 'tutorial-rive-drive',
  title: 'Drive an imported animation',
  description: 'A bouncing ball imported from a Lottie file, with a Play or pause button and a knob that scrubs it through a joystick: the Drive an imported animation tutorial\'s project.',
  tags: ['import', 'lottie', 'joystick', 'timeline'],
  build,
  notes: [
    { text: '**The ball came from a Lottie file.** Import made the page and its one timeline, *Bouncing ball*. Its Autoplay is off, so nothing moves until the button or the knob says so.' },
    { text: '**The knob is a joystick handle.** Select the page and open Joysticks: X timeline is *Bouncing ball*, X value is `handle.x`, and the Area is the track less half a knob at each end.', colour: 'sky' },
  ],
};
