//The video chapters tutorial's finished project: a video layer with chapters and two pausing cues, chapter buttons that seek,
//and two Add question cards that show over the video at the cues, the way the tutorial's steps leave it
import { createNode, defaultParams, uid, type Artboard, type ContainerNode, type LogicNode, type Project, type SceneNode, type VideoNode } from 'interactives-player';
import { addQuestion, setQuestionSettings } from '../../src/lib/question-kit';
import { addVar } from '../../src/lib/branded/graph-kit';
import { blankProject, type TutorialExample } from './kit';

//A node as the Interactions tab adds it (its default settings, then the ones the steps change), wired after `from`
function node(ab: Artboard, kind: string, params: Record<string, unknown>, from?: LogicNode, port = 'out'): LogicNode {
  const n: LogicNode = { id: uid('ln'), kind, x: 0, y: 0, params: { ...defaultParams(kind), ...params } };
  ab.logic.nodes.push(n);
  if (from) ab.logic.edges.push({ id: uid('e'), from: from.id, fromPort: port, to: n.id, toPort: 'in' });
  return n;
}

const chain = (ab: Artboard, from: LogicNode, ...steps: [string, Record<string, unknown>][]) => steps.reduce((prev, [kind, params]) => node(ab, kind, params, prev), from);

const QUESTIONS = [
  { prompt: 'What does the video say to read first?', options: ['The abstract', 'The reference list', 'The last paragraph'] },
  { prompt: 'Why skim the headings before reading closely?', options: ['To see the structure and the main points', 'So you can skip the reading', 'To find the longest section'] },
];

function build(): Project {
  const p = blankProject('Video lesson');
  const ab = p.artboards[0];
  const question = addVar(p, 'question', 'number', 0);

  const video = createNode('video', {
    name: 'Clip',
    x: 80,
    y: 40,
    width: 640,
    height: 360,
    autoplay: false,
    loop: false,
    muted: false,
    controls: true,
    emptyText: 'No video chosen yet: select the Clip layer and pick your video under Video in the Properties panel.',
    chapters: [
      { id: uid('vh'), time: 0, title: 'Start with the abstract' },
      { id: uid('vh'), time: 35, title: 'Skim the headings' },
      { id: uid('vh'), time: 75, title: 'Read closely' },
    ],
    cues: [
      { id: uid('vc'), time: 30, name: 'q1', pause: true },
      { id: uid('vc'), time: 70, name: 'q2', pause: true },
    ],
    bindings: { 'media.hold': 'question > 0' },
  } as Partial<VideoNode>);
  ab.children.push(video);

  //Three chapter buttons in one group, hidden while a question is open
  const labels = ['Start with the abstract', 'Skim the headings', 'Read closely'];
  const buttons = labels.map((label, i) => createNode('button', { name: `Chapter ${i + 1}`, label, x: i * 220, y: 0, width: 200, height: 44 }));
  const group = createNode('group', { name: 'Chapter buttons', x: 80, y: 416, width: 640, height: 44, children: buttons as SceneNode[], bindings: { visible: 'question == 0' } });
  const carryOn = createNode('button', { name: 'Continue', label: 'Continue the video', x: 80, y: 476, width: 220, height: 44, });
  ab.children.push(group, carryOn);

  //A cue: the video has already paused, so show its question
  const onCue = node(ab, 'event.videoCue', { target: video.id });
  node(ab, 'action.setVariable', { variable: question.id, op: 'set', value: 'event.index + 1' }, onCue);

  //Continue: put the question away, give the hold a moment to let go, then play on
  const onContinue = node(ab, 'event.pointer', { target: carryOn.id, type: 'click' });
  chain(ab, onContinue, ['action.setVariable', { variable: question.id, op: 'set', value: '0' }], ['action.delay', { ms: '40' }], ['action.video', { target: video.id, op: 'play' }]);

  //Each chapter button: go to where its chapter starts, then play
  buttons.forEach((b, i) => {
    const onClick = node(ab, 'event.pointer', { target: b.id, type: 'click' });
    chain(ab, onClick, ['action.video', { target: video.id, op: 'seek', seconds: `layer("Clip").chapters[${i}].time` }], ['action.video', { target: video.id, op: 'play' }]);
  });
  //The graph above was written first so the notes can find its nodes; the questions' own nodes go after it
  //The two questions, at the spot Add question puts them (over the video), each shown while `question` is its number
  const prefixes: string[] = [];
  QUESTIONS.forEach((q, i) => {
    const id = addQuestion(p, ab.id, 'single');
    if (!id) throw new Error('Add question made nothing');
    setQuestionSettings(p, ab.id, id, {
      prompt: q.prompt,
      options: q.options.map((text, k) => ({ id: `o${k + 1}`, text, ...(k === 0 ? { correct: true } : {}) })),
      attempts: 2,
      shuffle: true,
    });
    const frame = ab.children.find((n) => n.id === id) as ContainerNode;
    frame.bindings = { ...(frame.bindings ?? {}), visible: `question == ${i + 1}` };
    prefixes.push((frame as unknown as { question: { prefix: string } }).question.prefix);
  });

  carryOn.bindings = { visible: prefixes.map((q, i) => `(question == ${i + 1} && ${q}_locked)`).join(' || ') };
  return p;
}

export const example: TutorialExample = {
  key: 'tut-video-chapters',
  topic: 'tutorial-video-chapters',
  title: 'Video with chapters and questions',
  description: 'A video with chapter buttons that jump to each part, and two questions that pause it at set times until they are answered: the Interactive video tutorial\'s project.',
  tags: ['video', 'chapters', 'question', 'cue points'],
  build,
  notes: [
    { text: '[ ] **Pick your video first.** Select *Clip* and choose a file (or paste a link) under Video in the Properties panel. Then set the chapter times and the two cue times to match it, and import its captions.', colour: 'gold' },
    { text: '**Cue points pause, the variable shows.** Each cue on *Clip* is ticked Pause the video here. When one is reached, `question` becomes its number and that question shows. Hold paused is bound to `question > 0`, so the video waits.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 0, text: '**A cue sets question to its place in the list plus one**, so the first cue shows Question 1 and the second Question 2. Add a cue and a question card, and bind the card\'s Visible to its number.' },
    { at: 2, text: '**Continue waits 40 ms before Play.** Hold paused lets go on the next frame after `question` goes back to 0, so a Play any sooner would be ignored.', colour: 'sky' },
  ],
};
