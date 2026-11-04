import { createNode, defaultParams, uid, type Artboard, type BoneNode, type Constraint, type Keyframe, type LogicEdge, type LogicNode, type PathNode, type PathPoint, type SceneNode, type Timeline, type Track } from 'interactives-player';
import { bindLayer } from './rig';

/**
 * A small working rig to learn bones and IK from: an arm made of three bones, a path skinned to them, an orange dot
 * you drag in Preview that the arm reaches for (an IK constraint on the last bone, three bones long), a Wave timeline
 * that swings the bones by hand and hands the arm back to the dot, and the words on the artboard that say what to do.
 */
export interface BonesExample {
  nodes: SceneNode[];
  timelines: Timeline[];
  logic: { nodes: LogicNode[]; edges: LogicEdge[] };
  /** The bones, root first. */
  bones: BoneNode[];
  /** The arm shape, bound to the bones. */
  arm: PathNode;
  /** The orange dot the arm reaches for. */
  handle: SceneNode;
}

const ACCENT = '#3b5bfd';
const ORANGE = '#fb8c00';

export function bonesExample(ab: Pick<Artboard, 'width' | 'height' | 'logic'>): BonesExample {
  const cx = Math.round(ab.width / 2);
  const cy = Math.round(ab.height / 2);
  //Length of one bone: a bit under a hundred, less on a small artboard so the whole arm fits
  const u = Math.max(40, Math.min(100, Math.floor((ab.width - 120) / 3.6)));
  const bx = Math.round(cx - 1.6 * u);
  const by = Math.round(cy + 0.5 * u);

  const bone = (name: string, x: number): BoneNode => createNode('bone', { name, x, y: 0, width: u, rotation: 0 }) as BoneNode;
  const hand = bone('Hand', u);
  const fore = bone('Forearm', u);
  const upper = createNode('bone', { name: 'Upper arm', x: bx, y: by, width: u, rotation: 0 }) as BoneNode;
  fore.children.push(hand);
  upper.children.push(fore);

  //The arm: a closed outline round the three bones, fatter at the shoulder, with a point every eighth of a bone
  const thick = (x: number) => 24 - (12 * x) / (3 * u);
  const mid = thick(0);
  const top: PathPoint[] = [];
  const bottom: PathPoint[] = [];
  for (let i = 0; i <= 24; i++) {
    const x = (i * u) / 8;
    top.push({ x, y: mid - thick(x) });
    bottom.unshift({ x, y: mid + thick(x) });
  }
  const points = [{ x: -thick(0) * 0.8, y: mid }, ...top, { x: 3 * u + thick(3 * u) * 0.9, y: mid }, ...bottom];
  const arm = createNode('path', {
    name: 'Arm',
    x: bx,
    y: by - mid,
    width: 3 * u,
    height: mid * 2,
    originX: 0,
    originY: 0,
    paths: [{ closed: true, points }],
    fill: { type: 'solid', color: '#c9d4ff' },
    stroke: { paint: { type: 'solid', color: ACCENT }, width: 3 },
  }) as PathNode;

  //The dot to drag: somewhere the arm can just reach, so it is bent as soon as Preview starts
  const handle = createNode('ellipse', {
    name: 'IK target (drag me)',
    x: Math.round(bx + 2.1 * u - 22),
    y: Math.round(by - 1.3 * u - 22),
    width: 44,
    height: 44,
    fill: { type: 'solid', color: ORANGE },
    stroke: { paint: { type: 'solid', color: '#ffffff' }, width: 4 },
    draggable: { bounds: 'artboard', tapToMove: false, label: 'Orange dot, the arm reaches for it' },
  } as Partial<SceneNode>);
  const ik: Constraint = { id: uid('c'), type: 'ik', target: handle.id, strength: 1, bones: 3 };
  hand.constraints = [ik];

  //Bind the arm in its rest pose (the bones are straight along it now), before anything moves
  const scratch = { children: [arm, upper] } as unknown as Artboard;
  bindLayer(scratch, arm.id, [upper.id, fore.id, hand.id]);

  //Words on the artboard
  const tw = Math.min(640, ab.width - 32);
  const label = (name: string, text: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
    createNode('text', { name, text, x, y, width, height: 24, fontSize: 16, color: '#344054', align: 'center', ...extra } as Partial<SceneNode>);
  const top0 = Math.max(16, cy - 3 * u);
  const words = [
    label('Bones title', 'Bones and IK example', cx - tw / 2, top0, tw, { fontSize: 30, fontWeight: 700, color: '#101828', height: 40 }),
    label('Bones hint', 'The arm is three bones with a shape skinned to them. An IK constraint makes the tip of the last bone chase the dot.', cx - tw / 2, top0 + 46, tw, { fontSize: 15, color: '#667085' }),
    label('Bones instruction', 'Drag the orange dot', cx - tw / 2, top0 + 98, tw, { fontWeight: 700, fontSize: 20, color: ORANGE }),
  ];

  //Wave: the bones are swung by hand (keyed rotations) while the IK strength drops to 0, then the strength comes back and the dot takes over
  const key = (t: number, value: number, ease: Keyframe['ease'] = 'easeInOut'): Keyframe => ({ id: uid('k'), t, value, ease });
  const track = (nodeId: string, prop: string, keys: Keyframe[]): Track => ({ id: uid('tr'), nodeId, prop, keys });
  const wave: Timeline = {
    id: uid('tl'),
    name: 'Example: wave',
    duration: 2400,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [
      track(hand.id, 'constraints.0.strength', [key(0, 1), key(300, 0), key(2000, 0), key(2400, 1)]),
      track(upper.id, 'rotation', [key(0, 0), key(300, -50), key(2000, -50), key(2400, 0)]),
      track(fore.id, 'rotation', [key(0, 0), key(300, 15), key(700, -25), key(1100, 25), key(1500, -25), key(1900, 15), key(2400, 0)]),
      track(hand.id, 'rotation', [key(0, 0), key(300, 20), key(700, -40), key(1100, 40), key(1500, -40), key(1900, 20), key(2400, 0)]),
    ],
  };

  const button = createNode('button', {
    name: 'Wave button',
    label: 'Wave',
    x: cx - 60,
    y: Math.min(ab.height - 64, by + 1.4 * u),
    width: 120,
    height: 44,
    fill: { type: 'solid', color: ACCENT },
    color: '#ffffff',
  } as Partial<SceneNode>);
  const note = label('Bones wave note', 'Wave swings the bones by hand (a timeline), then the dot takes over again.', cx - tw / 2, Math.min(ab.height - 24, by + 1.4 * u + 52), tw, { fontSize: 13, color: '#667085' });

  //Wave button -> restart the wave timeline. New graph nodes go below whatever is in the graph already
  const below = ab.logic.nodes.length ? Math.max(...ab.logic.nodes.map((n) => n.y)) + 160 : 40;
  const click: LogicNode = { id: uid('l'), kind: 'event.pointer', x: 40, y: below, params: { ...defaultParams('event.pointer'), target: button.id, type: 'click' } };
  const play: LogicNode = { id: uid('l'), kind: 'action.timeline', x: 360, y: below, params: { ...defaultParams('action.timeline'), timeline: wave.id, op: 'restart' } };
  const edge: LogicEdge = { id: uid('e'), from: click.id, fromPort: 'out', to: play.id, toPort: 'in' };

  return {
    //(the dot is last, so it stays on top of the button when it is dragged over it)
    nodes: [...words, arm, upper, button, note, handle],
    timelines: [wave],
    logic: { nodes: [click, play], edges: [edge] },
    bones: [upper, fore, hand],
    arm,
    handle,
  };
}

/** Adds the example to an artboard (inside a store update) and returns it. */
export function addBonesExample(ab: Artboard): BonesExample {
  const ex = bonesExample(ab);
  ab.children.push(...ex.nodes);
  ab.timelines.push(...ex.timelines);
  ab.logic.nodes.push(...ex.logic.nodes);
  ab.logic.edges.push(...ex.logic.edges);
  return ex;
}
