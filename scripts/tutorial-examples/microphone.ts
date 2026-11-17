//The microphone tutorial's finished project: a one minute talk the learner records with one button, a countdown that stops the
//take, a button that plays it back and a slider to rate it, the way the tutorial's steps leave it
import { createNode, defaultParams, uid, type Artboard, type LogicNode, type Project } from 'interactives-player';
import { addVar } from '../../src/lib/branded/graph-kit';
import { blankProject, type TutorialExample } from './kit';

//A node as the Interactions tab adds it (its default settings, then the ones the steps change), wired after `from`
function node(ab: Artboard, kind: string, params: Record<string, unknown>, from?: LogicNode, port = 'out'): LogicNode {
  const n: LogicNode = { id: uid('ln'), kind, x: 0, y: 0, params: { ...defaultParams(kind), ...params } };
  ab.logic.nodes.push(n);
  if (from) wire(ab, from, n, port);
  return n;
}

const wire = (ab: Artboard, from: LogicNode, to: LogicNode, port = 'out') => ab.logic.edges.push({ id: uid('e'), from: from.id, fromPort: port, to: to.id, toPort: 'in' });

function build(): Project {
  const p = blankProject('Speaking practice');
  const ab = p.artboards[0];
  p.settings.sensors = { microphone: true, purpose: 'record your one minute talk so you can play it back and rate it', maxSeconds: 90 };
  const left = addVar(p, 'left', 'number', 60);
  addVar(p, 'confidence', 'number', 3);

  const heading = createNode('text', { name: 'Heading', text: 'Talk for one minute', x: 40, y: 32, width: 720, fontSize: 32, fontWeight: 700, role: 'heading', headingLevel: 1 });
  const prompt = createNode('text', { name: 'Prompt', text: 'Explain to a friend why sleep matters for learning. Give one reason and one example.', x: 40, y: 88, width: 720, fontSize: 20, lineHeight: 1.4 });
  const clock = createNode('text', { name: 'Clock', text: '{left} seconds left', x: 40, y: 168, width: 400, fontSize: 40, fontWeight: 700 });
  const talk = createNode('button', {
    name: 'Talk button',
    label: 'Start my talk',
    x: 40,
    y: 248,
    width: 220,
    height: 48,
    bindings: { label: 'recordings.talk.state == "recording" ? "Stop" : recordings.talk.hasRecording ? "Record again" : "Start my talk"' },
  });
  const play = createNode('button', { name: 'Play button', label: 'Play it back', x: 280, y: 248, width: 200, height: 48, bindings: { visible: 'recordings.talk.hasRecording' } });
  const status = createNode('text', { name: 'Status', text: '{mediaMessage}', x: 40, y: 312, width: 720, fontSize: 15 });
  const ask = createNode('text', { name: 'Rating question', text: 'How confident did you sound?', x: 40, y: 372, width: 400, fontSize: 20, fontWeight: 700 });
  const rate = createNode('input', { name: 'Rating', inputType: 'range', min: 1, max: 5, step: 1, value: '3', x: 40, y: 412, width: 300, height: 40, ariaLabel: 'How confident did you sound, 1 to 5', bindings: { value: 'confidence' }, bindingModes: { value: 'both' } });
  const score = createNode('text', { name: 'Rating shown', text: '{confidence} out of 5', x: 360, y: 420, width: 200, fontSize: 20 });
  ab.children.push(heading, prompt, clock, talk, play, status, ask, rate, score);

  //The talk button records and stops; recording (or not being able to) starts the clock, and the clock running out ends the take
  const onTalk = node(ab, 'event.pointer', { target: talk.id, type: 'click' });
  const rec = node(ab, 'action.recordStart', { op: 'toggle', slot: 'talk' }, onTalk);
  const start = node(ab, 'action.clock', { variable: left.id, op: 'start', mode: 'down', seconds: '60' }, rec, 'out');
  wire(ab, rec, start, 'failed');
  node(ab, 'action.clock', { variable: left.id, op: 'reset', mode: 'down', seconds: '60' }, rec, 'recorded');
  node(ab, 'action.recordStop', { slot: 'talk' }, start, 'done');

  //Stop on the page's own recording bar puts the clock back too
  const onReady = node(ab, 'event.media', { when: 'ready', slot: 'talk' });
  node(ab, 'action.clock', { variable: left.id, op: 'reset', mode: 'down', seconds: '60' }, onReady);

  //Play it back
  const onPlay = node(ab, 'event.pointer', { target: play.id, type: 'click' });
  node(ab, 'action.recordPlay', { op: 'play', slot: 'talk' }, onPlay);
  return p;
}

export const example: TutorialExample = {
  key: 'tut-microphone',
  topic: 'tutorial-microphone',
  title: 'Speaking practice with the microphone',
  description: 'A one minute talk the learner records with one button, a countdown that ends the take, a button to play it back and a slider to rate it: the Speaking practice tutorial\'s project.',
  tags: ['microphone', 'recording', 'timer', 'speaking'],
  build,
  notes: [
    { text: '**The microphone is declared in the project.** Click an empty part of the canvas and open Microphone and camera: Microphone is ticked, with a sentence for What it is used for. Learners are asked once, with that sentence.' },
    { text: '**Try it with the Link for StudyDesk.** Preview uses a pretend microphone. The plain share link cannot use one at all, and the StudyDesk page needs allow="microphone; camera" on its iframe.', colour: 'gold' },
    { text: '**No microphone? It still works.** Could not start runs the same countdown, so a learner who says no can still talk to the room against the clock and rate it.', colour: 'sky' },
  ],
  graphNotes: [
    { at: 1, text: '**One button records and stops** (Do is Start or stop). Recording and Could not start both run the countdown; Recorded puts the clock back. Time up on the countdown ends the take with Stop recording.' },
    { at: 5, text: '**Stop on the page\'s recording bar** fires When the microphone or camera is used instead of Recorded, so this puts the clock back for that case too.', colour: 'sky' },
  ],
};
