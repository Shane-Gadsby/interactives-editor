//The label the diagram tutorial's finished project: an Add question matching card whose slots were moved onto a picture of a
//plant. The Matches column lost its auto layout, the diagram went in behind the rows, and each row was cut down to its slot
import { createNode, type FrameNode, type Project, type SceneNode } from 'interactives-player';
import { addQuestion, partsOf, setQuestionSettings } from '../../src/lib/question-kit';
import { blankProject, type TutorialExample } from './kit';

const PIC_W = 482;
const PIC_H = 300;
//Where each Match row (just its slot now) sits on the diagram, top left, in the order of the pairs
const SPOTS: [number, number][] = [
  [20, 24],
  [292, 112],
  [20, 150],
  [292, 220],
];

const solid = (color: string) => ({ type: 'solid' as const, color });

/** The diagram, drawn with shapes in place of a picture file: a flower on its stem, a leaf, the ground and the roots. */
function diagram(): SceneNode {
  const shape = (type: 'rect' | 'ellipse', name: string, x: number, y: number, w: number, h: number, color: string) =>
    createNode(type, { name, x, y, width: w, height: h, fill: solid(color), stroke: null, decorative: true } as never);
  const root = (name: string, pts: [number, number][]) =>
    createNode('path', {
      name,
      x: 0,
      y: 0,
      width: PIC_W,
      height: PIC_H,
      fill: null,
      stroke: { paint: solid('#7a4a2b'), width: 4 },
      decorative: true,
      paths: [{ closed: false, points: pts.map(([x, y]) => ({ x, y })) }],
    } as never);
  return createNode('frame', {
    name: 'Diagram',
    x: 0,
    y: 0,
    width: PIC_W,
    height: PIC_H,
    fill: solid('#e3f2fd'),
    stroke: null,
    cornerRadius: 10,
    clip: true,
    role: 'image',
    ariaLabel: 'A flowering plant. The flower is at the top, the leaf grows to the right halfway down, the stem runs down the middle, and the roots spread under the ground at the bottom.',
    children: [
      shape('rect', 'Ground', 0, 236, PIC_W, 64, '#a1887f'),
      shape('rect', 'Stem', 236, 92, 10, 146, '#43a047'),
      shape('ellipse', 'Leaf', 246, 140, 74, 32, '#66bb6a'),
      shape('ellipse', 'Petals', 196, 18, 90, 90, '#f48fb1'),
      shape('ellipse', 'Flower centre', 221, 43, 40, 40, '#fdd835'),
      root('Root 1', [[241, 238], [226, 262], [212, 290]]),
      root('Root 2', [[241, 238], [241, 266], [244, 294]]),
      root('Root 3', [[241, 238], [258, 260], [276, 286]]),
    ],
  });
}

function build(): Project {
  const p = blankProject('Parts of a plant');
  const ab = p.artboards[0];
  const id = addQuestion(p, ab.id, 'matching');
  if (!id) throw new Error('Add question made nothing');
  setQuestionSettings(p, ab.id, id, {
    prompt: 'Drag each label onto its part of the plant.',
    pairs: [
      { id: 'p1', term: 'Flower', match: 'Spot 1, top left' },
      { id: 'p2', term: 'Leaf', match: 'Spot 2, middle right' },
      { id: 'p3', term: 'Stem', match: 'Spot 3, middle left' },
      { id: 'p4', term: 'Roots', match: 'Spot 4, bottom right' },
    ],
    extras: [{ id: 'x1', text: 'Bark' }],
    shuffle: true,
    points: 4,
    partial: true,
    attempts: 3,
    hints: ['The roots are the only part under the ground.'],
    feedbackCorrect: 'Every label is in the right place. Well done!',
    feedbackPartial: 'Some are right, but not all. Move a few and check again.',
    feedbackIncorrect: 'Not yet. Look at where each spot points.',
    feedbackOutOfTries: 'Out of tries. Each spot now shows the label that belongs there.',
    reveal: true,
  });

  //Wider, so the diagram has room beside the pile of labels
  const frame = ab.children.find((n) => n.id === id) as FrameNode;
  frame.x = 40;
  frame.width = 720;
  const parts = partsOf(frame);
  const matches = parts.matches[0] as FrameNode;
  matches.layout = null;
  matches.width = PIC_W;
  matches.height = PIC_H;
  matches.children.unshift(diagram());
  //Each row is cut down to its slot and moved onto its spot: the spot's name is still read out from What it matches
  parts.matchRow.forEach((r, i) => {
    const row = r as FrameNode;
    const line = row.children.find((c) => c.questionPart === 'matchLine') as FrameNode;
    line.children = line.children.filter((c) => c.questionPart !== 'matchDefinition');
    const result = row.children.find((c) => c.questionPart === 'matchState')!;
    result.layoutItem = { ...result.layoutItem, inset: { ...result.layoutItem?.inset, left: 0 } };
    row.width = 170;
    [row.x, row.y] = SPOTS[i];
  });
  return p;
}

export const example: TutorialExample = {
  key: 'tut-label',
  topic: 'tutorial-label',
  title: 'Label the diagram',
  description: 'Four labels to drag onto the parts of a plant, and one that belongs nowhere, checked spot by spot: the Label the diagram tutorial\'s project.',
  tags: ['question', 'quiz', 'drag', 'diagram'],
  build,
  notes: [
    { text: '**A matching question with its slots moved onto a picture.** Matches has no auto layout, so each Match row sits where it was dragged. The Diagram layer is first in Matches, so it is behind the slots.' },
    { text: '**The diagram is drawn with shapes** so the example needs no file. Put your own picture in its place and give it a Text alternative in the Accessibility section.', colour: 'gold' },
    { text: '**What each spot is called** comes from What it matches in the Question section. A screen reader says it when a label is dropped there, so name where the spot is, and say in the Text alternative of the diagram where each part is.', colour: 'sky' },
  ],
  graphNotes: [{ at: 0, text: '**Add question wired all of this.** Check answer reads which slot each label is in, wherever the slots are on the page, so moving them onto the diagram needed no nodes.' }],
};
