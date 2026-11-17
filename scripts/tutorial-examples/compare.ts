//The Before and after tutorial's finished project: a draggable handle tied to a number, which sets the width of a clipping frame over the After picture
import { createNode, type Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, line, solid, text, variable } from './_content-helpers';

//The pictures span x 60 to 740 and y 100 to 480. handleX is the handle's left edge: the divider is 20 px to its right
const X = 60;
const Y = 100;
const W = 680;
const H = 380;

function build(): Project {
  const p = blankProject('Before and after');
  const ab = p.artboards[0];
  variable(p, 'handleX', 'number', X + W / 2 - 20);
  ab.children.push(text('Title', 'Then and now', 40, 28, 520, { fontSize: 28, fontWeight: 700 }));

  //Coloured boxes stand in for the two pictures, so the example needs no files
  const after = createNode('rect', { name: 'After picture', x: X, y: Y, width: W, height: H, cornerRadius: 12, fill: solid('#cfe8d5'), role: 'image', ariaLabel: 'After: replace with your own picture and describe it' } as never);
  const afterLabel = text('After label', 'After', X + W - 96, Y + 16, 80, { fontSize: 18, fontWeight: 700, align: 'right' });
  const before = bind(
    createNode('frame', {
      name: 'Before reveal',
      x: X,
      y: Y,
      width: W / 2,
      height: H,
      fill: null,
      clip: true,
      children: [
        createNode('rect', { name: 'Before picture', x: 0, y: 0, width: W, height: H, cornerRadius: 12, fill: solid('#efdcc4'), role: 'image', ariaLabel: 'Before: replace with your own picture and describe it' } as never),
        text('Before label', 'Before', 16, 16, 80, { fontSize: 18, fontWeight: 700 }),
      ],
    } as never),
    { width: `handleX + 20 - ${X}` },
  );
  const divider = bind(createNode('rect', { name: 'Divider line', x: X + W / 2 - 2, y: Y, width: 4, height: H, fill: solid(C.white), decorative: true } as never), { x: 'handleX + 18' });
  const handle = createNode('ellipse', {
    name: 'Divider handle',
    x: X + W / 2 - 20,
    y: Y + H / 2 - 20,
    width: 40,
    height: 40,
    fill: solid(C.navy),
    stroke: line(C.white, 3),
    ariaLabel: 'Divider',
    draggable: { axis: 'x', bounds: after.id, step: 34 },
    bindings: { x: 'handleX' },
    bindingModes: { x: 'both' },
  } as never);
  const help = text('Instructions', 'Drag the round handle. Or press Tab to reach it, Space to pick it up, the arrow keys to move it and Space to put it down.', 40, 500, 720, { fontSize: 16, lineHeight: 1.4, color: C.muted });
  ab.children.push(after, afterLabel, before, divider, handle, help);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-compare',
  topic: 'tutorial-compare',
  title: 'Before and after compare',
  description: 'Two stacked pictures with a divider handle you drag, or move with the keyboard, to show more of one or the other: the Before and after tutorial\'s project.',
  tags: ['compare', 'drag', 'binding', 'keyboard friendly'],
  build,
  notes: [
    { text: '**handleX is the handle\'s X, both ways.** Dragging writes it, and the Before reveal frame\'s Width and the divider line\'s X are formulas of it. No nodes at all.' },
    { text: '**Before reveal clips its picture,** so it shows only as much of Before as it is wide. After sits whole underneath. Coloured boxes stand in for the pictures.', colour: 'sky' },
  ],
};
