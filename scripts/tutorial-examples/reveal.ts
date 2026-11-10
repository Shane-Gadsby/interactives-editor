//The Click to reveal tutorial's finished project: a picture with three numbered points, each opening its own dialog, coloured once visited
import { createNode, type FrameNode, type Project } from 'interactives-player';
import { blankProject, type TutorialExample } from './kit';
import { C, bind, change, line, solid, text, andThen, variable, whenClicked } from './_content-helpers';

const POINTS = [
  { title: 'Evaporation', body: 'The sun warms the sea. Some of the water turns into vapour and rises into the air.', x: 110, y: 420 },
  { title: 'Condensation', body: 'High up the air is cooler. The vapour turns back into tiny drops of water, which gather as clouds.', x: 346, y: 196 },
  { title: 'Precipitation', body: 'When the drops in a cloud grow heavy enough they fall as rain, hail or snow.', x: 470, y: 300 },
];

function build(): Project {
  const p = blankProject('Water cycle');
  const ab = p.artboards[0];

  ab.children.push(text('Title', 'The water cycle', 40, 28, 520, { fontSize: 28, fontWeight: 700 }));
  //The picture: shapes, so the example needs no file. The tutorial says to drop a real one here
  const picture = createNode('group', {
    name: 'Picture',
    x: 40,
    y: 90,
    width: 520,
    height: 440,
    role: 'image',
    ariaLabel: 'A drawing of the sea, the land, the sun and a cloud',
    children: [
      createNode('rect', { name: 'Sky', x: 0, y: 0, width: 520, height: 440, cornerRadius: 12, fill: solid('#cfe8f7') }),
      createNode('rect', { name: 'Sea', x: 0, y: 300, width: 300, height: 140, fill: solid('#4a90c2') }),
      createNode('rect', { name: 'Land', x: 300, y: 260, width: 220, height: 180, fill: solid('#8bbf6a') }),
      createNode('ellipse', { name: 'Sun', x: 30, y: 24, width: 70, height: 70, fill: solid(C.yellow) }),
      createNode('ellipse', { name: 'Cloud', x: 250, y: 96, width: 170, height: 64, fill: solid(C.white) }),
    ],
  } as never);
  ab.children.push(picture);
  ab.children.push(text('Instructions', 'Select each numbered point to find out what happens there. Press Esc to close the panel.', 590, 90, 170, { fontSize: 16, lineHeight: 1.4 }));

  const seen = POINTS.map((_, i) => variable(p, `seen${i + 1}`, 'boolean', false));

  //One dialog a point: heading, text, a stand-in picture and Close
  const dialogs = POINTS.map((pt, i) => {
    const close = createNode('button', { name: 'Close', label: 'Close', x: 316, y: 236, width: 140, height: 44 });
    const frame = createNode('frame', {
      name: `Dialog ${i + 1}`,
      x: 40,
      y: 150,
      width: 480,
      height: 300,
      cornerRadius: 16,
      fill: solid(C.white),
      stroke: line(C.navy, 2),
      ariaLabel: pt.title,
      dialog: { scrim: { type: 'solid', color: '#000000', opacity: 0.5 } },
      children: [
        text('Dialog heading', pt.title, 24, 20, 432, { fontSize: 24, fontWeight: 700 }),
        text('Dialog text', pt.body, 24, 64, 260, { fontSize: 16, lineHeight: 1.4 }),
        createNode('rect', { name: 'Dialog picture', x: 300, y: 64, width: 156, height: 140, cornerRadius: 8, fill: solid('#cfe8f7') }),
        close,
      ],
    } as never) as FrameNode;
    ab.children.push(frame);
    return { frame, close };
  });

  const points = POINTS.map((pt, i) =>
    bind(
      createNode('button', {
        name: `Point ${i + 1}`,
        label: String(i + 1),
        x: pt.x,
        y: pt.y,
        width: 44,
        height: 44,
        cornerRadius: 22,
        fill: solid(C.yellow),
        ariaLabel: `Point ${i + 1}: ${pt.title}`,
      }),
      { 'fill.color': `seen${i + 1} ? "${C.green}" : "${C.yellow}"`, ariaDescription: `seen${i + 1} ? "Already explored" : ""` },
    ),
  );
  //Points sit above the picture and under the dialogs in the layer list, so a dialog covers them
  ab.children.splice(ab.children.indexOf(picture) + 1, 0, ...points);

  //Step 6: each Close hides its dialog. Step 7: each point shows its dialog (which starts it hidden), then marks it seen
  dialogs.forEach((d) => whenClicked(ab, d.close, 'hide', d.frame));
  points.forEach((pt, i) => andThen(ab, whenClicked(ab, pt, 'show', dialogs[i].frame), change(seen[i], 'true')));
  return p;
}

export const example: TutorialExample = {
  key: 'tut-reveal',
  topic: 'tutorial-reveal',
  title: 'Click to reveal: image hotspots',
  description: 'A picture with three numbered points that each open a dialog, closed by a button or Esc, and turn green once visited: the Click to reveal tutorial\'s project.',
  tags: ['reveal', 'hotspots', 'dialog', 'keyboard friendly'],
  build,
  notes: [
    { text: '**Each point is a real button.** Tab reaches it and Enter opens it. Its Interactions section reads *When clicked: show Dialog 1*, and the Change a value after it marks it seen.' },
    { text: '**Each dialog is a frame** with *This frame is a dialog* ticked. Esc closes it, focus goes to Close while it is open and back to the point after. The picture is shapes: drop your own over it.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 0, text: '**Close hides its own dialog.** Each Close button has one Show or hide a layer node. Esc needs no wire: a dialog with no Open variable hides itself.' },
    { at: 6, text: '**A point shows its dialog, then marks it seen.** The seen switch drives the point\'s Fill colour and its description, so a visited point turns green and says so.', colour: 'sky' },
  ],
};
