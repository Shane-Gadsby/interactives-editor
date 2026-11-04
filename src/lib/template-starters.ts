/**
 * The built-in starters on the Templates tab. They are not stored anywhere: each is built here, from the same functions the editor
 * itself uses (the question kit, the step bar), so they always match the current format and never go stale. Every one comes with a
 * checklist of the parts to change, pointing at the layers it is about.
 */
import { createArtboard, createNode, createProject, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type TemplateChecklistItem, type Timeline, type TextNode } from 'interactives-player';
import { addQuestion } from './question-kit';
import { addStepsExample } from './steps';

const INK = '#1b2333';
const MUTED = '#5b6577';
const LINE = '#cfd6e0';
const ACCENT = '#3b5bfd';
const SOFT = '#e8edff';
const GOOD = '#0a7d33';

export interface Starter {
  key: string;
  name: string;
  description: string;
  /** What it teaches or shows, in a few words, for the card. */
  tags: string[];
  build(): { project: Project; checklist: TemplateChecklistItem[] };
}

const solid = (color: string) => ({ type: 'solid' as const, color });
const stroke = (color: string, width = 1.5) => ({ paint: solid(color), width });

const text = (name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  createNode('text', { name, text: value, x, y, width, fontSize: 18, color: INK, ...extra });

const heading = (name: string, value: string, x: number, y: number, width: number, extra: Partial<TextNode> = {}): TextNode =>
  text(name, value, x, y, width, { fontSize: 34, fontWeight: 700, role: 'heading', headingLevel: 1, ...extra });

const button = (name: string, label: string, x: number, y: number, width = 180, primary = true) =>
  createNode('button', {
    name,
    label,
    x,
    y,
    width,
    height: 46,
    cornerRadius: 10,
    fill: solid(primary ? ACCENT : '#ffffff'),
    stroke: primary ? null : stroke(ACCENT),
    color: primary ? '#ffffff' : ACCENT,
    fontSize: 16,
    fontWeight: 600,
  });

const gnode = (kind: string, x: number, y: number, params: Record<string, unknown> = {}, note?: string): LogicNode => ({ id: uid('ln'), kind, x, y, params, ...(note ? { note } : {}) });
const edge = (a: LogicNode, b: LogicNode, fromPort = 'out'): LogicEdge => ({ id: uid('le'), from: a.id, fromPort, to: b.id, toPort: 'in' });
const chain = (...nodes: LogicNode[]): LogicEdge[] => nodes.slice(1).map((n, i) => edge(nodes[i], n));

const item = (text: string, node?: SceneNode, artboard?: Artboard): TemplateChecklistItem => ({ id: uid('ck'), text, ...(node ? { nodeId: node.id } : {}), ...(artboard ? { artboardId: artboard.id } : {}), done: false });

function base(name: string, boardName: string, width = 960, height = 640): { project: Project; ab: Artboard } {
  const project = createProject(name);
  const ab = project.artboards[0];
  ab.name = boardName;
  ab.width = width;
  ab.height = height;
  ab.background = solid('#ffffff');
  project.fonts.push({ family: 'Open Sans', source: 'google', weights: [400, 600, 700] });
  return { project, ab };
}

const byName = (ab: Artboard, name: string): SceneNode | undefined => {
  const look = (list: SceneNode[]): SceneNode | undefined => {
    for (const n of list) {
      if (n.name === name) return n;
      if ('children' in n && Array.isArray(n.children)) {
        const hit = look(n.children as SceneNode[]);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return look(ab.children);
};

// ---------------------------------------------------------------------------------------------------------------------

function quiz() {
  const { project, ab } = base('Quiz', 'Quiz');
  const title = heading('Quiz title', 'Check your understanding', 80, 36, 800);
  const intro = text('Quiz intro', 'Choose the best answer, then press Check.', 80, 86, 800, { color: MUTED });
  ab.children.push(title, intro);
  const frameId = addQuestion(project, ab.id, 'single', { at: { x: 80, y: 140 } });
  const frame = ab.children.find((n) => n.id === frameId)!;
  return {
    project,
    checklist: [
      item('Change the quiz title and the line under it', title, ab),
      item('Write your own question and answer options (Question section in the inspector)', frame, ab),
      item('Mark which option is the right one, and add a hint if you want one', frame, ab),
      item('Rewrite the feedback messages for right and wrong answers', frame, ab),
      item('Set how many points it is worth, and whether it reports a result', frame, ab),
    ],
  };
}

function steps() {
  const { project, ab } = base('Step-through explainer', 'Explainer');
  addStepsExample(project, ab);
  const title = heading('Explainer title', 'How it works', 48, 28, 700, { fontSize: 30 });
  ab.children.push(title);
  const ball = byName(ab, 'Example ball');
  const target = byName(ab, 'Example target');
  const tl = ab.timelines[0];
  return {
    project,
    checklist: [
      item('Change the title', title, ab),
      item('Replace the example ball with the thing you are explaining (draw it, or add a picture)', ball, ab),
      item('Replace the example target, or delete it', target, ab),
      item('Animate your picture on the timeline, one move for each step', undefined, ab),
      item(`Write each step's title and caption: select a marker on the timeline "${tl?.name ?? 'Example story'}"`, undefined, ab),
      item('Add or remove markers to get the number of steps you need (the dots and the counter follow)', undefined, ab),
    ],
  };
}

function flipCards() {
  const { project, ab } = base('Flip cards', 'Cards');
  const title = heading('Cards title', 'Flip each card', 80, 36, 800);
  const hint = text('Cards hint', 'Click a card, or press Enter on it, to see the other side.', 80, 86, 800, { color: MUTED });
  ab.children.push(title, hint);
  const nodes: LogicNode[] = [];
  const edges: LogicEdge[] = [];
  const checklist: TemplateChecklistItem[] = [item('Change the title and the line under it', title, ab)];
  const data = [
    ['Term one', 'What it means: write the explanation on the back.'],
    ['Term two', 'A second explanation. Keep it short enough to read at a glance.'],
    ['Term three', 'And a third one.'],
  ];
  const fronts: SceneNode[] = [];
  const backs: SceneNode[] = [];
  data.forEach(([front, back], i) => {
    const v = { id: uid('v'), name: `flipped${i + 1}`, type: 'boolean' as const, initial: false };
    project.variables.push(v);
    const x = 80 + i * 285;
    const frontFace = createNode('frame', {
      name: `Card ${i + 1} front`,
      x: 0,
      y: 0,
      width: 260,
      height: 320,
      cornerRadius: 16,
      fill: solid(SOFT),
      stroke: stroke(ACCENT, 2),
      clip: false,
      bindings: { visible: `!${v.name}` },
      children: [text('Front text', front, 20, 120, 220, { fontSize: 26, fontWeight: 700, align: 'center', color: ACCENT })],
    });
    const backFace = createNode('frame', {
      name: `Card ${i + 1} back`,
      x: 0,
      y: 0,
      width: 260,
      height: 320,
      cornerRadius: 16,
      fill: solid('#ffffff'),
      stroke: stroke(GOOD, 2),
      clip: false,
      bindings: { visible: v.name },
      children: [text('Back text', back, 24, 110, 212, { fontSize: 18, align: 'center' })],
    });
    const card = createNode('frame', {
      name: `Card ${i + 1}`,
      x,
      y: 160,
      width: 260,
      height: 320,
      fill: null,
      clip: false,
      role: 'button',
      ariaLabel: `Card ${i + 1}: flip it`,
      children: [frontFace, backFace],
    });
    ab.children.push(card);
    fronts.push(frontFace.children[0]);
    backs.push(backFace.children[0]);
    const on = gnode('event.pointer', 0, i * 130, { target: card.id, type: 'click' }, 'Flip cards');
    const flip = gnode('action.setVariable', 260, i * 130, { variable: v.id, op: 'toggle' });
    nodes.push(on, flip);
    edges.push(...chain(on, flip));
  });
  ab.logic.nodes.push(...nodes);
  ab.logic.edges.push(...edges);
  checklist.push(
    item('Write the front of each card (the term or question)', fronts[0], ab),
    item('Write the back of each card (the explanation)', backs[0], ab),
    item('Add a card: duplicate a card, then copy its click interaction and point it at the new card in the Interactions tab', undefined, ab),
    item('Change the colours and fonts to match your course', undefined, ab),
  );
  return { project, checklist };
}

function sorting() {
  const { project, ab } = base('Drag and drop sorting', 'Sort it');
  const title = heading('Sorting title', 'Sort the items', 60, 30, 840);
  const prompt = text('Sorting prompt', 'Drag each item into the group it belongs to.', 60, 78, 840, { color: MUTED });
  ab.children.push(title, prompt);

  const placed = { id: uid('v'), name: 'placed', type: 'number' as const, initial: 0 };
  const message = { id: uid('v'), name: 'message', type: 'string' as const, initial: '' };
  project.variables.push(placed, message);

  const zone = (name: string, label: string, x: number, tag: string, tint: string) =>
    createNode('frame', {
      name,
      x,
      y: 130,
      width: 400,
      height: 220,
      cornerRadius: 16,
      fill: solid(tint),
      stroke: stroke(LINE, 2),
      clip: false,
      dropZone: { accepts: [tag], label },
      children: [text(`${name} label`, label, 20, 14, 360, { fontSize: 22, fontWeight: 700, align: 'center' })],
    });
  const zoneA = zone('Group A', 'Group A', 60, 'a', SOFT);
  const zoneB = zone('Group B', 'Group B', 500, 'b', '#e3f6e9');
  ab.children.push(zoneA, zoneB);

  const chips: SceneNode[] = [];
  const things: [string, string][] = [
    ['Item 1', 'a'],
    ['Item 2', 'b'],
    ['Item 3', 'a'],
    ['Item 4', 'b'],
  ];
  things.forEach(([label, tag], i) => {
    const chip = createNode('frame', {
      name: label,
      x: 90 + i * 205,
      y: 400,
      width: 180,
      height: 56,
      cornerRadius: 12,
      fill: solid('#ffffff'),
      stroke: stroke(ACCENT, 2),
      clip: false,
      shadow: { x: 0, y: 2, blur: 6, spread: 0, color: 'rgba(16,24,40,0.18)' },
      draggable: { tags: [tag], onMiss: 'return' },
      ariaLabel: label,
      children: [text(`${label} text`, label, 8, 14, 164, { fontSize: 18, fontWeight: 600, align: 'center', decorative: true })],
    });
    chips.push(chip);
    ab.children.push(chip);
  });

  const total = things.length;
  const status = text('Sort progress', `Sorted {placed} of ${total}`, 60, 500, 400, { fontSize: 16, color: MUTED });
  const feedback = text('Sort feedback', '{message}', 60, 530, 560, { fontSize: 20, fontWeight: 600, color: ACCENT });
  const again = button('Start again', 'Start again', 720, 520, 180, false);
  ab.children.push(status, feedback, again);

  const dropOk = gnode('event.drop', 0, 0, { result: 'accepted' }, 'Sorting');
  const add = gnode('action.setVariable', 250, 0, { variable: placed.id, op: 'add', value: '1' });
  const done = gnode('logic.if', 500, 0, { condition: `placed >= ${total}` });
  const allDone = gnode('action.setVariable', 750, -50, { variable: message.id, op: 'set', value: '"All sorted. Well done!"' });
  const fits = gnode('action.setVariable', 750, 60, { variable: message.id, op: 'set', value: '"Yes, that fits."' });
  const dropBad = gnode('event.drop', 0, 170, { result: 'rejected' }, 'Sorting');
  const nope = gnode('action.setVariable', 250, 170, { variable: message.id, op: 'set', value: '"Not that group. Try the other one."' });
  const clickAgain = gnode('event.pointer', 0, 340, { target: again.id, type: 'click' }, 'Sorting');
  const resetDrag = gnode('action.dragReset', 250, 340, {});
  const resetCount = gnode('action.setVariable', 500, 340, { variable: placed.id, op: 'set', value: '0' });
  const resetMsg = gnode('action.setVariable', 750, 340, { variable: message.id, op: 'set', value: '""' });
  ab.logic.nodes.push(dropOk, add, done, allDone, fits, dropBad, nope, clickAgain, resetDrag, resetCount, resetMsg);
  ab.logic.edges.push(edge(dropOk, add), edge(add, done), edge(done, allDone, 'true'), edge(done, fits, 'false'), edge(dropBad, nope), ...chain(clickAgain, resetDrag, resetCount, resetMsg));

  return {
    project,
    checklist: [
      item('Change the title and the instruction', title, ab),
      item('Rename the two groups', zoneA, ab),
      item('Rename the items to drag, and set which group each belongs to (Draggable > Tags: a, or b)', chips[0], ab),
      item('Add or remove items: duplicate one, and fix the count in the "Sorted … of …" text and in the If node', status, ab),
      item('Rewrite the messages for a right drop, a wrong drop and finishing (Interactions tab)', feedback, ab),
    ],
  };
}

function branching() {
  const { project, ab } = base('Branching story', 'Opening');
  const scene = (board: Artboard, h: string, body: string, x: number) => {
    board.canvasX = x;
    board.background = solid('#ffffff');
    const t = heading(`${board.name} title`, h, 80, 60, 800);
    const b = text(`${board.name} text`, body, 80, 140, 800, { fontSize: 22, color: INK });
    board.children.push(t, b);
    return { t, b };
  };
  const mk = (name: string, x: number): Artboard => {
    const board = createArtboard({ name, width: ab.width, height: ab.height, background: solid('#ffffff'), canvasX: x });
    project.artboards.push(board);
    return board;
  };
  const left = mk('Left path', 1100);
  const right = mk('Right path', 2200);
  const opening = scene(ab, 'A choice to make', 'You are standing at a fork in the path. Describe the situation here, and what is at stake.', 0);
  const leftScene = scene(left, 'The left path', 'Describe what happens when the learner takes the left path, and what they learn from it.', 1100);
  const rightScene = scene(right, 'The right path', 'Describe what happens on the right path. Make the consequence different, so the choice mattered.', 2200);

  const goLeft = button('Choice: left', 'Take the left path', 80, 320, 260);
  const goRight = button('Choice: right', 'Take the right path', 380, 320, 260);
  ab.children.push(goLeft, goRight);
  const wire = (btn: SceneNode, to: Artboard, row: number, board: Artboard) => {
    const on = gnode('event.pointer', 0, row * 120, { target: btn.id, type: 'click' }, 'Story');
    const go = gnode('action.artboard', 260, row * 120, { artboard: to.id, transition: 'fade', duration: 300 });
    board.logic.nodes.push(on, go);
    board.logic.edges.push(edge(on, go));
  };
  wire(goLeft, left, 0, ab);
  wire(goRight, right, 1, ab);
  for (const [board, back] of [[left, 'Try the other path'], [right, 'Try the other path']] as const) {
    const again = button(`${board.name} restart`, back, 80, 320, 260, false);
    board.children.push(again);
    wire(again, ab, 0, board);
  }
  return {
    project,
    checklist: [
      item('Write the opening scene: the title and the situation', opening.b, ab),
      item('Rename the two choices so each says what the learner would do', goLeft, ab),
      item('Write what happens on the left path', leftScene.b, left),
      item('Write what happens on the right path', rightScene.b, right),
      item('Add another scene: duplicate an artboard, then use a Go to artboard node from a button (Interactions tab)', undefined, ab),
      item('Change the button on the endings if the story should carry on rather than go back', undefined, left),
    ],
  };
}

function timelineIntro() {
  const { project, ab } = base('Animated intro', 'Intro');
  ab.background = solid('#101828');
  const bar = createNode('rect', { name: 'Accent bar', x: 120, y: 250, width: 240, height: 8, cornerRadius: 4, fill: solid('#7a93ff'), originX: 0, originY: 0.5 });
  const title = heading('Intro title', 'Your title arrives here', 120, 150, 720, { fontSize: 56, color: '#ffffff', opacity: 0 });
  const sub = text('Intro subtitle', 'A line that says what this is about', 120, 280, 720, { fontSize: 24, color: '#c7d2fe', opacity: 0 });
  const replay = button('Replay', 'Replay', 120, 400, 140, false);
  replay.opacity = 0;
  replay.color = '#ffffff';
  replay.stroke = stroke('#7a93ff');
  ab.children.push(bar, title, sub, replay);
  const key = (t: number, value: number, ease: 'easeOut' | 'easeInOut' = 'easeOut') => ({ id: uid('k'), t, value, ease });
  const track = (nodeId: string, prop: string, keys: ReturnType<typeof key>[]) => ({ id: uid('tr'), nodeId, prop, keys });
  const tl: Timeline = {
    id: uid('tl'),
    name: 'Intro',
    duration: 2400,
    loop: 'once',
    autoplay: true,
    speed: 1,
    tracks: [
      track(bar.id, 'scaleX', [key(0, 0), key(900, 1)]),
      track(title.id, 'opacity', [key(300, 0), key(1000, 1)]),
      track(title.id, 'y', [key(300, 190), key(1000, 150)]),
      track(sub.id, 'opacity', [key(1100, 0), key(1800, 1)]),
      track(sub.id, 'y', [key(1100, 310), key(1800, 280)]),
      track(replay.id, 'opacity', [key(1800, 0), key(2400, 1)]),
    ],
    markers: [],
  };
  ab.timelines.push(tl);
  const on = gnode('event.pointer', 0, 0, { target: replay.id, type: 'click' }, 'Intro');
  const go = gnode('action.timeline', 260, 0, { timeline: tl.id, op: 'restart' });
  ab.logic.nodes.push(on, go);
  ab.logic.edges.push(edge(on, go));
  return {
    project,
    checklist: [
      item('Type your own title', title, ab),
      item('Type your own subtitle', sub, ab),
      item('Change the colours: the background of the artboard and the accent bar', bar, ab),
      item('Retime it: drag the keyframes on the "Intro" timeline (Timeline tab)', undefined, ab),
      item('Decide what comes after the intro: add a button that goes to the next artboard, or remove Replay', replay, ab),
    ],
  };
}

export const STARTERS: Starter[] = [
  { key: 'quiz', name: 'Quiz', description: 'A multiple choice question made with the question kit: check, hints, feedback and a score, ready to reword.', tags: ['assessment', 'question kit'], build: quiz },
  { key: 'step-explainer', name: 'Step-through explainer', description: 'A small animation told in steps, with Back and Next, a dot for each step and a title and caption that follow the timeline markers.', tags: ['steps', 'timeline'], build: steps },
  { key: 'flip-cards', name: 'Flip cards', description: 'Three cards that turn over on a click or Enter, for terms and definitions or question and answer.', tags: ['revision', 'variables'], build: flipCards },
  { key: 'sorting', name: 'Drag and drop sorting', description: 'Four items to drag into two groups, with feedback for a right and a wrong drop, a count and a Start again button.', tags: ['drag and drop', 'assessment'], build: sorting },
  { key: 'branching-story', name: 'Branching story', description: 'An opening scene with two choices that lead to different endings, each on its own artboard.', tags: ['scenarios', 'artboards'], build: branching },
  { key: 'timeline-intro', name: 'Animated timeline intro', description: 'A title, a line and a bar that animate in on a timeline, with a Replay button.', tags: ['animation', 'timeline'], build: timelineIntro },
];

export const starterByKey = (key: string): Starter | undefined => STARTERS.find((s) => s.key === key);

/** A built-in starter as a new project, already carrying its checklist (and no baseline: it has no newer versions to pull). */
export function projectFromStarter(s: Starter, name?: string): Project {
  const { project, checklist } = s.build();
  project.name = name || s.name;
  project.template = { builtin: s.key, name: s.name, version: 1, checklist };
  return project;
}
