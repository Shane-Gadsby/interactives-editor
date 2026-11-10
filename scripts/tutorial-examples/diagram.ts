//The diagrams tutorial's finished project: a mind map laid out from a list by mindMap(), its branches folded by a click, and a
//flowchart laid out by flowChart() that the learner follows one answer at a time. Boxes and lines are each one repeated layer
import { createNode, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, change, clickFlow, line, page, solid, text, variable } from './_content-helpers';

const IDEAS = [
  { id: 'root', label: 'Healthy study' },
  { id: 'sleep', parent: 'root', label: 'Sleep' },
  { id: 'sleep1', parent: 'sleep', label: 'Same bedtime' },
  { id: 'sleep2', parent: 'sleep', label: 'No screens late' },
  { id: 'breaks', parent: 'root', label: 'Breaks' },
  { id: 'breaks1', parent: 'breaks', label: 'Every hour' },
  { id: 'food', parent: 'root', label: 'Food' },
  { id: 'food1', parent: 'food', label: 'Water at hand' },
  { id: 'move', parent: 'root', label: 'Movement' },
  { id: 'move1', parent: 'move', label: 'Walk between classes' },
];

const STEPS = [
  { id: 's1', kind: 'start', label: 'Need a quiet room?' },
  { id: 'd1', kind: 'decision', label: 'Is a room free?' },
  { id: 'p1', kind: 'process', label: 'Book the room' },
  { id: 'p2', kind: 'process', label: 'Pick another time' },
  { id: 'e1', kind: 'end', label: 'Go and study' },
];
const LINKS = [
  { from: 's1', to: 'd1' },
  { from: 'd1', to: 'p1', label: 'Yes' },
  { from: 'd1', to: 'p2', label: 'No' },
  { from: 'p1', to: 'e1' },
  { from: 'p2', to: 'd1' },
];

/** A box repeated over a laid-out list: its place and size from the item, its words centred in it. */
function box(name: string, extra: Record<string, unknown>, bindings: Record<string, string>): SceneNode {
  const words = bind(text(`${name} text`, '{item.label}', 0, 0, 130, { fontSize: 15, fontWeight: 600, align: 'center', verticalAlign: 'middle', autoSize: 'none', height: 44 }), { width: 'item.w', height: 'item.h' });
  return bind(createNode('frame', { name, x: 0, y: 0, width: 130, height: 44, cornerRadius: 10, stroke: line(C.navy, 2), role: 'button', children: [words], ...extra } as never), { x: 'item.x', y: 'item.y', width: 'item.w', height: 'item.h', ...bindings });
}

/** "Select the layer, Ctrl+G": a group at the layer's place whose first child is the template, repeated over `items` with Free (bind x/y). */
const repeated = (name: string, items: string, child: SceneNode, x: number, y: number) =>
  createNode('group', { name, x, y, width: child.width || 1, height: child.height || 1, repeat: { items, layout: 'none', gap: 0, columns: 1 }, children: [child] } as never);

function mindMapPage(p: Project, ab: Artboard) {
  ab.children.push(text('Title', 'Healthy study: select an idea to fold or open it', 40, 28, 720, { fontSize: 24, fontWeight: 700 }));
  variable(p, 'ideas', 'list', IDEAS);
  const folded = variable(p, 'folded', 'list', []);
  variable(p, 'map', 'list', [], { formula: 'mindMap(ideas, {width: 720, height: 440, nodeW: 104, gapX: 40, collapsed: folded})', live: true });

  const idea = box('Idea', { fill: solid(C.pale) }, {
    'fill.color': `item.depth == 0 ? "${C.yellow}" : "${C.pale}"`,
    visible: 'item.visible',
    ariaLabel: 'item.label + (item.folded ? ", " + item.kids + " ideas folded away" : "")',
  });
  const link = createNode('connector', {
    name: 'Line',
    from: { layer: { repeat: idea.id, index: 'item.parentIndex' } },
    to: { layer: { repeat: idea.id, index: 'index' } },
    route: 'curved',
    endCap: 'none',
    stroke: { paint: solid(C.navy), width: 2, cap: 'round', join: 'round' },
  } as never);
  //Lines under the boxes, both over the same 720 by 440 area
  ab.children.push(repeated('Lines', 'map', link, 40, 120), repeated('Ideas', 'map', idea, 40, 120));
  clickFlow(ab, idea, [change(folded, 'map[event.index].id', 'toggleItem')]);
}

function flowchartPage(p: Project, ab: Artboard) {
  ab.children.push(text('Title', 'Booking a study room', 40, 28, 720, { fontSize: 24, fontWeight: 700 }));
  variable(p, 'steps', 'list', STEPS);
  variable(p, 'links', 'list', LINKS);
  const current = variable(p, 'current', 'string', 's1');
  variable(p, 'chart', 'list', [], { formula: 'flowChart(steps, links, {width: 440, height: 440})', live: true });
  variable(p, 'arrows', 'list', [], { formula: 'flowLinks(steps, links)', live: true });
  variable(p, 'outs', 'list', [], { formula: 'arrows.filter(l => l.from == current && l.b >= 0)', live: true });

  const step = box('Step', { fill: solid(C.white) }, {
    'fill.color': `item.id == current ? "${C.yellow}" : "${C.white}"`,
    ariaCurrent: 'item.id == current ? "step" : false',
  });
  Object.assign(step, { role: undefined });
  const arrow = createNode('connector', {
    name: 'Arrow',
    from: { layer: { repeat: step.id, index: 'item.a' } },
    to: { layer: { repeat: step.id, index: 'item.b' } },
    route: 'elbow',
    label: '{item.label ?? ""}',
    stroke: { paint: solid(C.navy), width: 2, cap: 'round', join: 'round' },
  } as never);
  ab.children.push(repeated('Arrows', 'arrows', arrow, 40, 120), repeated('Steps', 'chart', step, 40, 120));

  //The panel: where you are, and a button for every way out of it
  const choice = createNode('button', { name: 'Choice', label: '{item.label || "Continue"}', x: 0, y: 0, width: 240, height: 44 });
  const again = createNode('button', { name: 'Start again', label: 'Start again', x: 520, y: 500, width: 240, height: 44 });
  ab.children.push(
    text('You are here', 'You are here', 520, 120, 240, { fontSize: 14, fontWeight: 600, color: C.muted }),
    text('Current step', '{steps.find(s => s.id == current).label}', 520, 144, 240, { fontSize: 22, fontWeight: 700, role: 'heading', headingLevel: 2 } as never),
    createNode('group', { name: 'Choices', x: 520, y: 240, width: 240, height: 44, repeat: { items: 'outs', layout: 'vertical', gap: 10, columns: 1 }, children: [choice] } as never),
    again,
  );
  clickFlow(ab, choice, [change(current, 'outs[event.index].to')]);
  clickFlow(ab, again, [change(current, '"s1"')]);
}

function build(): Project {
  const p = blankProject('Diagrams', 'Mind map');
  mindMapPage(p, p.artboards[0]);
  flowchartPage(p, page(p, 'Flowchart'));
  return p;
}

export const example: TutorialExample = {
  key: 'tut-diagram',
  topic: 'tutorial-diagram',
  title: 'Mind map and flowchart from data',
  description: 'A mind map whose branches fold on a click, and a flowchart you follow one answer at a time, each drawn from lists by one repeated box and one repeated line: the diagrams tutorial\'s project.',
  tags: ['diagram', 'mind map', 'flowchart', 'connectors'],
  build,
  notes: [
    { text: '**Edit the lists, not the boxes.** ideas (Variables tab) is the whole map: add a line with a parent and a box and its line appear. map is worked out from it by mindMap().' },
    { text: '**One box and one line, each repeated over map.** The box takes its X, Y, W and H from the item. The line joins copy item.parentIndex to copy index.', colour: 'sky' },
    { page: 1, text: '**The flowchart is the same idea.** chart and arrows are worked out from steps and links, and outs is the links leaving the current step: one Choice button each.', colour: 'sky' },
  ],
};
