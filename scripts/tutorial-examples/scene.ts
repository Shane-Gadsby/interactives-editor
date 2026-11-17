//The animated scene tutorial's finished project: a set, two characters and two speech bubbles in groups, a Run in timeline and a
//Talk timeline that both start by themselves and skip to their end for less motion, markers that announce each line, and Skip
import { uid, type Keyframe, type Project, type SceneNode, type Timeline } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { button, chain, event, layer, q, whenClicked, words } from './_story-helpers';

export const LINES = {
  alex: 'Morning! Have you seen the new study rooms in the library?',
  sam: 'Not yet. Show me? I have an essay due on Friday.',
};

const solid = (color: string) => ({ type: 'solid' as const, color });
const key = (t: number, value: number, ease: Keyframe['ease'] = 'linear'): Keyframe => ({ id: uid('k'), t, value, ease });

function person(name: string, x: number, skin: string, shirt: string) {
  return layer('group', name, x, 270, 100, 160, {
    children: [layer('rect', 'Body', 10, 60, 80, 100, { cornerRadius: 30, fill: solid(shirt) }), layer('ellipse', 'Head', 20, 0, 60, 60, { fill: solid(skin) })],
  });
}

function bubble(p: Project, name: string, x: number, width: number, line: string) {
  return layer('group', name, x, 150, width, 96, {
    children: [layer('rect', 'Bubble shape', 0, 0, width, 96, { cornerRadius: 18, fill: solid('#ffffff'), stroke: { paint: solid('#1c1e26'), width: 2 } }), words(p, 'Words', line, 16, 14, width - 32, { fontSize: 16, lineHeight: 1.3, height: 66 })],
  });
}

function build(): Project {
  const p = blankProject('Library morning', 'Scene');
  const ab = p.artboards[0];

  //Back to front: the set, the characters, the bubbles, then Skip
  const set = layer('group', 'Set', 0, 0, 800, 600, {
    children: [
      layer('rect', 'Sky', 0, 0, 800, 430, { fill: solid('#bfe3ff') }),
      layer('ellipse', 'Sun', 650, 40, 90, 90, { fill: solid('#ffd34f') }),
      layer('rect', 'Ground', 0, 430, 800, 170, { fill: solid('#7cc576') }),
      layer('rect', 'Library', 40, 230, 220, 200, { fill: solid('#c98f5b') }),
      layer('rect', 'Door', 125, 330, 50, 100, { fill: solid('#7a4e2d') }),
    ],
  });
  const alex = person('Alex', 330, '#f2c9a0', '#5b6ee1');
  const sam = person('Sam', 560, '#a5754f', '#e1735b');
  const alexBubble = bubble(p, 'Alex bubble', 230, 250, LINES.alex);
  const samBubble = bubble(p, 'Sam bubble', 520, 250, LINES.sam);
  const skip = button(p, 'Skip', 'Skip', 640, 520, 130, 48);
  ab.children.push(set, alex, sam, alexBubble, samBubble, skip);

  const track = (n: SceneNode, prop: string, keys: Keyframe[]) => ({ id: uid('tr'), nodeId: n.id, prop, keys });
  const runIn: Timeline = { id: uid('tl'), name: 'Run in', duration: 1200, loop: 'once', autoplay: true, speed: 1, calm: true, tracks: [track(sam, 'x', [key(0, -140, 'easeOut'), key(1200, 560)])] };
  const talk: Timeline = {
    id: uid('tl'),
    name: 'Talk',
    duration: 3500,
    loop: 'once',
    autoplay: true,
    speed: 1,
    calm: true,
    tracks: [track(alexBubble, 'opacity', [key(0, 0), key(1300, 0), key(1500, 1)]), track(samBubble, 'opacity', [key(0, 0), key(2800, 0), key(3000, 1)])],
    markers: [
      { id: uid('mk'), time: 1500, name: 'Alex speaks' },
      { id: uid('mk'), time: 3000, name: 'Sam speaks' },
    ],
  };
  ab.timelines.push(runIn, talk);

  //Each marker says its line to screen readers (the When the playhead reaches this… node, its Change a value swapped for an Announce)
  chain(ab, event(ab, 'event.timelineMarker', { timeline: talk.id, marker: 'Alex speaks' }), ['action.announce', { text: q(`Alex says: ${LINES.alex}`) }]);
  chain(ab, event(ab, 'event.timelineMarker', { timeline: talk.id, marker: 'Sam speaks' }), ['action.announce', { text: q(`Sam says: ${LINES.sam}`) }]);

  //Skip: both timelines jump to their end, and a screen reader is told both lines
  const first = whenClicked(p, ab, skip, 'animation', runIn.id);
  Object.assign(first.params, { op: 'seek', time: '1200' });
  chain(ab, first, ['action.timeline', { timeline: talk.id, op: 'seek', time: '3500' }], ['action.announce', { text: q(`Skipped. Alex says: ${LINES.alex} Sam says: ${LINES.sam}`) }]);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-scene',
  topic: 'tutorial-scene',
  title: 'Animated scene with speech bubbles',
  description: 'Sam runs in from the left, then a speech bubble pops up for each speaker, with a Skip button, lines announced to screen readers and a still version for less motion: the Animated scene tutorial\'s project.',
  tags: ['animation', 'story', 'timelines', 'accessibility'],
  build,
  notes: [
    { text: '**Layers are the depth.** *Set* is at the bottom of the Layers panel, then the characters, then the bubbles, then Skip. Each part is a group, so it moves as one.' },
    { text: '**Two timelines, both on Autoplay.** *Run in* moves Sam, *Talk* fades the bubbles in. Both have Skip for less motion ticked, so a viewer who asks for less motion sees the end at once.', colour: 'sky' },
  ],
  graphNotes: [{ at: 4, text: '**Skip jumps both timelines to their end** (Jump to time, at each one\'s length), then tells a screen reader both lines, because jumping never passes the markers.' }],
};
