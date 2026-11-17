//The bones tutorial's finished project: an arm drawn with the Pen, three bones drawn with the Bone tool and the arm bound to
//them, an orange Target the Hand bone reaches for (IK, three bones), a Wave timeline and a Wave button that plays it
import { createNode, defaultParams, uid, type BoneNode, type Keyframe, type PathNode, type PathPoint, type Project, type SceneNode, type Timeline, type Track } from 'interactives-player';
import { bindLayer } from '../../src/lib/rig';
import { writeClickFlow } from '../../src/lib/click-flow';
import { lookDefaults } from '../../src/lib/themes';
import { blankProject, type TutorialExample } from './kit';

function build(): Project {
  const p = blankProject('Arm rig');
  const ab = p.artboards[0];

  //The arm as the Pen draws it: seven points along the top, one at the hand end, seven back along the bottom, one at the
  //shoulder end, closed on the first. Its box is the points' bounds, as finishPen makes it
  const outline: PathPoint[] = [];
  for (let x = 200; x <= 500; x += 50) outline.push({ x, y: 340 });
  outline.push({ x: 520, y: 360 });
  for (let x = 500; x >= 200; x -= 50) outline.push({ x, y: 380 });
  outline.push({ x: 180, y: 360 });
  const minX = 180;
  const minY = 340;
  const arm = createNode('path', {
    ...lookDefaults(p, 'path'),
    name: 'Arm',
    x: minX,
    y: minY,
    width: 340,
    height: 40,
    paths: [{ closed: true, points: outline.map((pt) => ({ x: pt.x - minX, y: pt.y - minY })) }],
    fill: { type: 'solid', color: '#c9d4ff' },
    stroke: { paint: { type: 'solid', color: '#3b5bfd' }, width: 3 },
  }) as PathNode;

  //Three bones drawn as one chain, each 100 long, straight along the middle of the arm (Shift held, so the angle is 0)
  const upper = createNode('bone', { name: 'Upper arm', x: 200, y: 360, width: 100, rotation: 0 }) as BoneNode;
  const fore = createNode('bone', { name: 'Forearm', x: 100, y: 0, width: 100, rotation: 0 }) as BoneNode;
  const hand = createNode('bone', { name: 'Hand', x: 100, y: 0, width: 100, rotation: 0 }) as BoneNode;
  fore.children.push(hand);
  upper.children.push(fore);

  const target = createNode('ellipse', {
    ...lookDefaults(p, 'ellipse'),
    name: 'Target',
    x: 418,
    y: 218,
    width: 44,
    height: 44,
    fill: { type: 'solid', color: '#fb8c00' },
    draggable: { bounds: 'artboard', label: 'Orange dot, the arm reaches for it' },
  } as Partial<SceneNode>);

  const words = createNode('text', {
    ...lookDefaults(p, 'text'),
    name: 'Instruction',
    text: 'Drag the orange dot',
    x: 250,
    y: 60,
    width: 300,
    height: 30,
    fontSize: 22,
    fontWeight: 700,
    align: 'center',
  } as Partial<SceneNode>);

  const button = createNode('button', { ...lookDefaults(p, 'button'), name: 'Wave button', label: 'Wave', x: 340, y: 500, width: 120, height: 44 } as Partial<SceneNode>);

  ab.children.push(words, arm, upper, button, target);
  //Bound in the rest pose, before the IK is added
  bindLayer(ab, arm.id, [upper.id, fore.id, hand.id]);
  hand.constraints = [{ id: uid('k'), type: 'ik', target: target.id, strength: 1, bones: 3 }];

  //Wave: Strength down to 0 so the keyed rotations win, the forearm swings twice, then Strength back to 1 and the dot takes over
  const key = (t: number, value: number): Keyframe => ({ id: uid('k'), t, value, ease: 'easeInOut' });
  const track = (nodeId: string, prop: string, keys: [number, number][]): Track => ({ id: uid('tr'), nodeId, prop, keys: keys.map(([t, v]) => key(t, v)) });
  const wave: Timeline = {
    id: uid('tl'),
    name: 'Wave',
    duration: 2000,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [
      track(hand.id, 'constraints.0.strength', [[0, 1], [300, 0], [1700, 0], [2000, 1]]),
      track(upper.id, 'rotation', [[0, 0], [300, -60], [1700, -60], [2000, 0]]),
      track(fore.id, 'rotation', [[0, 0], [300, -40], [700, 10], [1100, -40], [1500, 10], [2000, 0]]),
    ],
  };
  ab.timelines.push(wave);

  //Wave button: + When clicked..., Play an animation, Wave (what that recipe writes, through the same click-flow writer)
  writeClickFlow(ab, button.id, [{ kind: 'action.timeline', params: { ...defaultParams('action.timeline'), timeline: wave.id, op: 'play' } }], 'click');
  return p;
}

export const example: TutorialExample = {
  key: 'tut-bones',
  topic: 'tutorial-bones',
  title: 'Arm rig with bones',
  description: 'An arm drawn with the Pen, bound to three bones, that reaches for an orange dot you drag (IK), with a Wave button that plays a keyed pose: the Bones tutorial\'s project.',
  tags: ['bones', 'ik', 'skinning', 'timeline'],
  build,
  notes: [
    { text: '**Three bones in a chain.** Open *Upper arm* in Layers to find *Forearm* and *Hand* inside it. Select *Arm* to see its Skin, and pick a point in Weights of to see which bones pull on it.' },
    { text: '**The IK is on Hand.** Its Constraints section says IK, target *Target*, 3 chain bones. Wave keys its Strength down to 0 so the keyed rotations win, then back to 1.', colour: 'sky' },
  ],
};
