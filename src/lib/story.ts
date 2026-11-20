import { createArtboard, createNode, newLineId, uid, type Artboard, type ImageNode, type LogicEdge, type LogicNode, type Project, type SceneNode, type Story, type StoryChapter, type Variable } from 'interactives-player';

/**
 * The story's editor side: a story to start from and the stage page it plays on. The stage is ordinary layers bound to the
 * player's `story.*` values (see the player's story.ts), so everything on it can be restyled like anything else; nothing
 * about it is special except what it's bound to.
 */

export const STAGE_W = 1280;
export const STAGE_H = 720;

/** What a new story starts with: enough to read the syntax off, and it plays with nothing else set up. */
export const SAMPLE_CHAPTER = `# The club fair

// Lines are read top to bottom. A name and a colon is someone talking; anything else is narration.
// Put a picture called Quad in Assets and [bg Quad] shows it behind everyone.
The quad was crowded with folding tables and hand-painted signs.
Millie: You came! I knew you would.
Olive: I said I'd think about it.
Millie: Think about it here, then. With biscuits.

? Join the writing club
    set writing += 1
    Millie: {shake}Yes!{/shake} Okay. Sign here. And here.
    -> Signing up
? Ask what they actually write [once]
    Millie: Short stories, mostly. And one very long one about a lighthouse.
    Olive: How long?
    Millie: {pause}We don't talk about it.
? Say you're still deciding
    Millie: Oh. Well... the offer stands.

Millie: Either way, take a flyer.
if writing > 0
    Olive: I've already signed up. Remember?
else
    Olive: Fine. One flyer.
-> Wandering the fair

# Signing up

Millie: Welcome to the club!
-> end Joined the club

# Wandering the fair

The tables thinned out as the sun went down.
? Go home
    -> end Went home early`;

export function linesOf(text: string): StoryChapter['lines'] {
  const taken = new Set<string>();
  return text.split('\n').map((t) => {
    const id = newLineId(taken);
    taken.add(id);
    return { id, text: t };
  });
}

/** A new chapter's name: Chapter 2, Chapter 3... */
export function nextChapterName(story: Story): string {
  const used = new Set(story.chapters.map((c) => c.name.toLowerCase()));
  for (let i = story.chapters.length + 1; ; i++) if (!used.has(`chapter ${i}`)) return `Chapter ${i}`;
}

/** The variable the Hide button flips: the dialogue box goes, and a click anywhere brings it back. */
export const HIDE_VAR = 'storyBoxHidden';

/**
 * Start a story in a project: the sample chapter, two characters with name plate colours (no pictures yet, so they're name
 * plates only), and a stage page to play it on, which becomes the start page. Changes `d` in place and returns the stage's id.
 */
export function startStory(d: Project): string {
  const hide: Variable = d.variables.find((v) => v.name === HIDE_VAR) ?? { id: uid('v'), name: HIDE_VAR, type: 'boolean', initial: false };
  if (!d.variables.includes(hide)) d.variables.push(hide);
  const right = d.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const stage = storyStage(hide.id, { canvasX: d.artboards.length ? right + 120 : 0, canvasY: 0 });
  // A project that's nothing but an empty first page gets the stage in its place
  const lone = d.artboards.length === 1 && !d.artboards[0].children.length && !d.artboards[0].logic.nodes.length ? d.artboards[0] : null;
  if (lone) {
    stage.canvasX = lone.canvasX;
    stage.canvasY = lone.canvasY;
    d.artboards = [stage];
  } else d.artboards.push(stage);
  d.settings.startArtboardId = stage.id;
  d.story = {
    stage: stage.id,
    chapters: [{ id: uid('ch'), name: 'Chapter 1', lines: linesOf(SAMPLE_CHAPTER) }],
    cast: [
      { id: uid('cm'), name: 'Millie', colour: '#c2410c', expressions: [] },
      { id: uid('cm'), name: 'Olive', colour: '#1d4ed8', expressions: [] },
    ],
  };
  return stage.id;
}

const solid = (color: string) => ({ type: 'solid' as const, color });

/**
 * The story stage, 16:9: the background (two pictures, so a new one fades in over the last), the cast standing in their spots,
 * the dialogue box with its name plate and typing words, the choices, and a row of buttons for Auto, Skip, Back and Hide.
 * Clicking anywhere else, Space or Enter goes on (the player does that for any stage without a Go on node of its own).
 */
export function storyStage(hideVar: string, at: Partial<Artboard> = {}): Artboard {
  const W = STAGE_W;
  const H = STAGE_H;
  const bgBefore = createNode('image', { name: 'Background before', x: 0, y: 0, width: W, height: H, fit: 'cover', bindings: { assetId: 'story.backgroundBefore', visible: "story.backgroundFade < 1 && story.backgroundBefore != ''" } }) as ImageNode;
  const bg = createNode('image', { name: 'Background', x: 0, y: 0, width: W, height: H, fit: 'cover', bindings: { assetId: 'story.background', opacity: 'story.backgroundFade', visible: "story.background != ''" } }) as ImageNode;
  const character = createNode('image', {
    name: 'Character',
    x: W / 2 - 280,
    y: H * 0.1,
    width: 560,
    height: H * 0.9,
    fit: 'contain',
    ariaLabel: '',
    bindings: {
      assetId: 'item.image',
      x: `item.x * ${W} - 280`,
      y: `${H} - item.height * ${H} - item.lift`,
      height: `item.height * ${H}`,
      opacity: 'item.opacity',
      brightness: 'item.brightness',
      visible: "item.image != ''",
    },
  }) as ImageNode;
  const cast = createNode('frame', { name: 'Cast', x: 0, y: 0, width: W, height: H, fill: null, clip: false, repeat: { items: 'story.cast', layout: 'none', gap: 0, columns: 1 }, children: [character] });

  const plate = createNode('frame', {
    name: 'Name plate',
    x: 28,
    y: -22,
    width: 240,
    height: 44,
    cornerRadius: 10,
    fill: solid('#b8860b'),
    bindings: { 'fill.color': "story.speakerColour || '#b8860b'", visible: 'story.speaking' },
    children: [createNode('text', { name: 'Name', x: 0, y: 0, width: 240, height: 44, text: 'Name', fontSize: 22, fontWeight: 700, color: '#ffffff', align: 'center', verticalAlign: 'middle', autoSize: 'none', bindings: { text: 'story.speaker' } } as never)],
  });
  const words = createNode('text', {
    name: 'Words',
    x: 40,
    y: 38,
    width: 1040,
    height: 112,
    text: 'The words of the line type on here.',
    fontSize: 26,
    lineHeight: 1.45,
    color: '#f5f2ea',
    autoSize: 'none',
    storyMarkup: true,
    bindings: { text: 'story.marked', reveal: 'story.shown' },
  } as never);
  const more = createNode('text', { name: 'More', x: 1078, y: 132, width: 24, height: 24, text: '▼', fontSize: 16, color: '#f5f2ea', align: 'center', autoSize: 'none', decorative: true, bindings: { visible: 'story.waiting' } } as never);
  const box = createNode('frame', {
    name: 'Dialogue box',
    x: 80,
    y: 516,
    width: 1120,
    height: 180,
    cornerRadius: 14,
    fill: solid('rgba(18, 18, 28, 0.86)'),
    clip: false,
    bindings: { visible: `(story.text != '' || story.choosing) && !${HIDE_VAR} && (story.look == 'bottom' || (story.look == 'bubble' && !story.speaking))` },
    children: [plate, words, more],
  });

  //[box full]: the whole screen of text for long narration, the lines said on it so far and the one typing now
  const fullLine = createNode('text', {
    name: 'Full screen line',
    x: 0,
    y: 0,
    width: 960,
    height: 34,
    text: 'A line of the story.',
    fontSize: 24,
    lineHeight: 1.45,
    color: '#f5f2ea',
    autoSize: 'height',
    storyMarkup: true,
    bindings: {
      text: "item.current ? (story.speaker ? story.speaker + ': ' : '') + story.marked : item.line",
      reveal: 'item.current ? story.shown + (story.speaker ? story.speaker.length + 2 : 0) : 100000',
    },
  } as never);
  const fullList = createNode('frame', { name: 'Full screen lines', x: 40, y: 36, width: 960, height: 540, fill: null, clip: true, repeat: { items: "story.page.concat(story.text != '' ? [{ current: true }] : [])", layout: 'vertical', gap: 16, columns: 1 }, children: [fullLine] });
  const full = createNode('frame', { name: 'Full screen text', x: 120, y: 40, width: 1040, height: 624, cornerRadius: 16, fill: solid('rgba(10, 10, 16, 0.84)'), bindings: { visible: `story.look == 'full' && !${HIDE_VAR}` }, children: [fullList] });

  //[box bubble]: a speech bubble by whoever's talking, kept clear of faces (story.bubble, from Bubble sits in the settings),
  //its tail pointing at them from whichever edge faces them
  const BW = 540;
  const BH = 176;
  const tail = createNode('rect', {
    name: 'Tail',
    x: BW / 2 - 16,
    y: -14,
    width: 32,
    height: 32,
    rotation: 45,
    fill: solid('#fbfaf7'),
    bindings: {
      x: `clamp((story.bubble.tipX - story.bubble.x) * ${W} - 16, -14, ${BW - 18})`,
      y: `clamp((story.bubble.tipY - story.bubble.y) * ${H} - 16, -14, ${BH - 18})`,
      visible: "story.bubble.tail != 'none'",
    },
  } as never);
  const bubbleName = createNode('text', { name: 'Bubble name', x: 28, y: 18, width: 480, height: 28, text: 'Name', fontSize: 18, fontWeight: 700, color: '#7a5a06', autoSize: 'none', bindings: { text: 'story.speaker', color: "story.speakerColour || '#7a5a06'" } } as never);
  const bubbleWords = createNode('text', { name: 'Bubble words', x: 28, y: 50, width: 484, height: 110, text: 'Words in the bubble.', fontSize: 23, lineHeight: 1.4, color: '#1b1b24', autoSize: 'none', storyMarkup: true, bindings: { text: 'story.marked', reveal: 'story.shown' } } as never);
  const bubble = createNode('frame', { name: 'Speech bubble', x: (W - BW) / 2, y: 300, width: BW, height: BH, cornerRadius: 24, clip: false, fill: solid('#fbfaf7'), shadow: { x: 0, y: 6, blur: 18, spread: 0, color: 'rgba(0, 0, 0, 0.3)' }, bindings: { x: `story.bubble.x * ${W}`, y: `story.bubble.y * ${H}`, visible: `story.look == 'bubble' && story.speaking && !${HIDE_VAR}` }, children: [tail, bubbleName, bubbleWords] } as never);

  const choice = createNode('button', {
    name: 'Choice',
    x: 0,
    y: 0,
    width: 640,
    height: 58,
    label: 'A choice',
    fontSize: 22,
    cornerRadius: 12,
    fill: solid('#fbfaf7'),
    color: '#1b1b24',
    shadow: { x: 0, y: 4, blur: 14, spread: 0, color: 'rgba(0, 0, 0, 0.35)' },
    bindings: { label: "(item.picked ? '✓ ' : '') + item.text", disabled: '!item.enabled' },
  });
  const choices = createNode('frame', {
    name: 'Choices',
    x: (W - 640) / 2,
    y: 120,
    width: 640,
    height: 340,
    fill: null,
    repeat: { items: 'story.choices', layout: 'vertical', gap: 14, columns: 1 },
    //(lower down on a full screen of text, under the words)
    bindings: { visible: `story.choosing && !${HIDE_VAR}`, y: "story.look == 'full' ? 380 : 120" },
    children: [choice],
  });

  const control = (name: string, label: string, x: number, bind?: string) =>
    createNode('button', { name, x, y: 0, width: 84, height: 32, label, fontSize: 15, cornerRadius: 8, fill: solid('rgba(18, 18, 28, 0.7)'), color: '#f5f2ea', ...(bind ? { bindings: { label: bind } } : {}) });
  const buttons = [control('Back', 'Back', 0), control('Auto', 'Auto', 94, "story.auto ? 'Auto on' : 'Auto'"), control('Skip', 'Skip', 188, "story.skipping ? 'Skipping' : 'Skip'"), control('Hide', 'Hide', 282)];
  const bar = createNode('frame', { name: 'Story buttons', x: W - 80 - 366, y: 470, width: 366, height: 32, fill: null, bindings: { visible: `story.started && !story.ended && !${HIDE_VAR}`, y: "story.look == 'full' || (story.look == 'bubble' && story.speaking) ? 678 : 470" }, children: buttons });

  //A button the size of the stage, so Enter and Space bring the words back as well as a click
  const unhide = createNode('button', { name: 'Show the box again', x: 0, y: 0, width: W, height: H, label: '', fill: null, stroke: null, ariaLabel: 'Show the words again', bindings: { visible: HIDE_VAR } } as never);
  //[weather rain] and the rest turn this on with that kind, [weather off] hides it
  const weather = createNode('rect', { name: 'Weather', x: 0, y: 0, width: W, height: H, fill: null, visible: false, particles: { preset: 'rain' } } as never);
  const endWords = createNode('text', { name: 'The end words', x: 0, y: 20, width: 880, height: 70, text: 'The end', fontSize: 44, fontWeight: 700, color: '#ffffff', align: 'center', autoSize: 'none', bindings: { text: "'The end' + (story.ending ? ': ' + story.ending : '')" } } as never);
  const ending = createNode('frame', { name: 'The end', x: (W - 880) / 2, y: H / 2 - 150, width: 880, height: 110, cornerRadius: 16, fill: solid('rgba(10, 10, 16, 0.86)'), bindings: { visible: 'story.ended' }, children: [endWords] } as never);

  const nodes: LogicNode[] = [];
  const edges: LogicEdge[] = [];
  const wire = (target: SceneNode, action: Omit<LogicNode, 'id' | 'x' | 'y'>) => {
    const ev: LogicNode = { id: uid('n'), kind: 'event.pointer', x: 40, y: 40 + nodes.length * 60, params: { type: 'click', target: target.id } };
    const act: LogicNode = { id: uid('n'), x: 320, y: 40 + nodes.length * 60, ...action };
    nodes.push(ev, act);
    edges.push({ id: uid('e'), from: ev.id, fromPort: 'out', to: act.id, toPort: 'in' });
  };
  wire(choice, { kind: 'action.storyPick', params: { choice: 'event.index + 1' } });
  wire(buttons[0], { kind: 'action.storyRollBack', params: { steps: '1' } });
  wire(buttons[1], { kind: 'action.storyMode', params: { mode: 'auto', to: 'toggle' } });
  wire(buttons[2], { kind: 'action.storyMode', params: { mode: 'skip', to: 'toggle' } });
  wire(buttons[3], { kind: 'action.setVariable', params: { variable: hideVar, value: 'true' } });
  wire(unhide, { kind: 'action.setVariable', params: { variable: hideVar, value: 'false' } });

  return createArtboard({
    name: 'Story stage',
    width: W,
    height: H,
    background: solid('#15141c'),
    children: [bgBefore, bg, cast, weather, box, full, bubble, choices, bar, ending, unhide],
    logic: { nodes, edges },
    ...at,
  } as Partial<Artboard>);
}
