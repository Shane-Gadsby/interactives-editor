import { createNode, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type StepsConfig, type Timeline, type Variable } from 'interactives-player';
import { uniqueIdentifier } from '../store/doc';

/**
 * Step-through explainers, the editor's side: switching Steps on for an artboard (the project variables the player keeps up
 * to date, a marker at the start), and generating the step bar once as ordinary layers and graph nodes. The bar is not a live
 * component: after it is made it is just layers (restyle, move, delete or rebuild them) wired through Go to step nodes and
 * the step variables, so nothing here has to run again when the markers change.
 */

/** The look of the generated bar. Colours match the default button so it sits with the rest of a new project. */
const INK = '#101828';
const MUTED = '#667085';
const LINE = '#d0d5dd';
const ACCENT = '#3b5bfd';

/** Size and place of the bar on an artboard: along the bottom, centred. */
export function stepBarBox(ab: Pick<Artboard, 'width' | 'height'>): { x: number; y: number; width: number; height: number } {
  const width = Math.max(280, Math.min(760, ab.width - 48));
  const height = 168;
  return { x: Math.round((ab.width - width) / 2), y: Math.max(0, ab.height - height - 24), width, height };
}

/** The four variables the player keeps up to date. Existing ones the settings still point at are kept; missing ones are made. */
export function ensureStepVariables(project: Project, cfg: StepsConfig): void {
  const taken = () => project.variables.map((v) => v.name);
  const have = (id?: string) => !!id && project.variables.some((v) => v.id === id);
  const make = (base: string, type: Variable['type'], initial: Variable['initial']): string => {
    const v: Variable = { id: uid('v'), name: uniqueIdentifier(taken(), base), type, initial };
    project.variables.push(v);
    return v.id;
  };
  if (!have(cfg.stepVar)) cfg.stepVar = make('step', 'number', 1);
  if (!have(cfg.countVar)) cfg.countVar = make('stepCount', 'number', 1);
  if (!have(cfg.titleVar)) cfg.titleVar = make('stepTitle', 'string', '');
  if (!have(cfg.captionVar)) cfg.captionVar = make('stepCaption', 'string', '');
}

const nameOf = (project: Project, id: string | undefined, fallback: string) => project.variables.find((v) => v.id === id)?.name ?? fallback;

/**
 * Turn Steps on for an artboard, on a timeline (the artboard's first when none is given; one is made when it has none).
 * The timeline gets a marker at 0 when none is there (step 1 is where it starts), and stops autoplaying: the steps drive it.
 * Returns the timeline's id.
 */
export function enableSteps(project: Project, ab: Artboard, timelineId?: string): string {
  let tl = ab.timelines.find((t) => t.id === timelineId) ?? ab.timelines[0];
  if (!tl) {
    tl = { id: uid('tl'), name: 'Story', duration: 3000, loop: 'once', autoplay: false, speed: 1, tracks: [], markers: [] };
    ab.timelines.push(tl);
  }
  tl.autoplay = false;
  tl.markers ??= [];
  if (!tl.markers.some((m) => m.time <= 1)) {
    tl.markers.push({ id: uid('mk'), time: 0, name: 'Start' });
    tl.markers.sort((a, b) => a.time - b.time);
  }
  const cfg: StepsConfig = { ...ab.steps, timeline: tl.id };
  ensureStepVariables(project, cfg);
  ab.steps = cfg;
  return tl.id;
}

/** A button wired the way a step bar's are. */
function barButton(name: string, label: string, x: number, y: number, primary: boolean, disabled: string): SceneNode {
  return createNode('button', {
    name,
    label,
    x,
    y,
    width: 96,
    height: 40,
    fill: { type: 'solid', color: primary ? ACCENT : '#ffffff' },
    stroke: primary ? null : { paint: { type: 'solid', color: ACCENT }, width: 1 },
    color: primary ? '#ffffff' : ACCENT,
    bindings: { disabled },
  });
}

/**
 * The step bar as layers and nodes, ready to add to an artboard: a card with the step counter, title and caption, Back and Next
 * buttons, and a dot for every step (a repeater over `steps`, so adding a marker adds a dot). The dots are focusable, say which
 * step they go to, and jump there. `frame` is the card, `logic` the nodes that make the buttons and dots work.
 */
export function buildStepBar(project: Project, ab: Artboard, cfg: StepsConfig): { frame: SceneNode; nodes: LogicNode[]; edges: LogicEdge[] } {
  const box = stepBarBox(ab);
  const step = nameOf(project, cfg.stepVar, 'step');
  const count = nameOf(project, cfg.countVar, 'stepCount');
  const title = nameOf(project, cfg.titleVar, 'stepTitle');
  const caption = nameOf(project, cfg.captionVar, 'stepCaption');
  const inner = box.width - 32;

  const counter = createNode('text', { name: 'Step counter', text: `Step {${step}} of {${count}}`, x: 16, y: 14, width: inner, fontSize: 13, fontWeight: 600, color: MUTED });
  const heading = createNode('text', { name: 'Step title', text: `{${title}}`, x: 16, y: 36, width: inner, fontSize: 20, fontWeight: 700, color: INK, role: 'heading', headingLevel: 2 });
  const words = createNode('text', { name: 'Step caption', text: `{${caption}}`, x: 16, y: 68, width: inner, fontSize: 15, color: '#344054' });
  const back = barButton('Back button', 'Back', 16, 112, false, `${step} <= 1`);
  const next = barButton('Next button', 'Next', box.width - 16 - 96, 112, true, `${step} >= ${count}`);

  const dotSize = 24;
  const dot = createNode('frame', {
    name: 'Step dot',
    width: dotSize,
    height: dotSize,
    fill: null,
    clip: false,
    cornerRadius: dotSize / 2,
    role: 'button',
    bindings: { ariaLabel: '"Go to step " + item.step + ": " + item.title' },
    children: [
      createNode('ellipse', {
        name: 'Dot',
        x: 6,
        y: 6,
        width: 12,
        height: 12,
        decorative: true,
        fill: { type: 'solid', color: LINE },
        bindings: { 'fill.color': `item.current ? "${ACCENT}" : "${LINE}"` },
      }),
    ],
  });
  const dots = createNode('frame', {
    name: 'Step dots',
    x: 128,
    y: 112,
    width: box.width - 256,
    height: 40,
    fill: null,
    clip: false,
    repeat: { items: 'steps', layout: 'none', gap: 0, columns: 1 },
    layout: { direction: 'row', gap: 2, padding: { top: 8, right: 0, bottom: 8, left: 0 }, justify: 'center', align: 'center', wrap: false, hugWidth: false, hugHeight: false },
    children: [dot],
  });
  const frame = createNode('frame', {
    name: 'Step bar',
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    fill: { type: 'solid', color: '#ffffff' },
    stroke: { paint: { type: 'solid', color: LINE }, width: 1 },
    cornerRadius: 12,
    clip: false,
    role: 'region',
    ariaLabel: 'Steps',
    children: [counter, heading, words, back, dots, next],
  });

  // The graph: a click on each control goes to a step. Placed to the right of whatever is already there
  const right = Math.max(-260, ...ab.logic.nodes.map((n) => n.x)) + 260;
  const logicNode = (kind: string, row: number, col: number, params: Record<string, unknown>): LogicNode => ({ id: uid('ln'), kind, x: right + col * 240, y: row * 120, params });
  const rows: [LogicNode, LogicNode][] = [
    [logicNode('event.pointer', 0, 0, { target: back.id, type: 'click' }), logicNode('action.steps', 0, 1, { op: 'back' })],
    [logicNode('event.pointer', 1, 0, { target: next.id, type: 'click' }), logicNode('action.steps', 1, 1, { op: 'next' })],
    [logicNode('event.pointer', 2, 0, { target: dot.id, type: 'click' }), logicNode('action.steps', 2, 1, { op: 'goto', step: 'event.index + 1' })],
  ];
  for (const [ev] of rows) ev.note = 'Step bar';
  return {
    frame,
    nodes: rows.flat(),
    edges: rows.map(([a, b]): LogicEdge => ({ id: uid('le'), from: a.id, fromPort: 'out', to: b.id, toPort: 'in' })),
  };
}

/** Add a step bar to the artboard (turning Steps on first if they are off). Returns the bar's layer id. */
export function addStepBar(project: Project, ab: Artboard): string {
  if (!ab.steps) enableSteps(project, ab);
  const cfg = ab.steps!;
  ensureStepVariables(project, cfg);
  const bar = buildStepBar(project, ab, cfg);
  ab.children.push(bar.frame);
  ab.logic.nodes.push(...bar.nodes);
  ab.logic.edges.push(...bar.edges);
  cfg.bar = bar.frame.id;
  return bar.frame.id;
}

/** A tall transparent column the steps scrub by scrolling, at the right of the artboard (or wherever there is room). Returns its id. */
export function addScrollColumn(ab: Artboard): string {
  const width = 220;
  const height = Math.max(120, Math.min(ab.height - 220, 360));
  const steps = Math.max(2, ab.timelines.find((t) => t.id === ab.steps?.timeline)?.markers?.filter((m) => m.step !== false).length ?? 2);
  const column = createNode('frame', {
    name: 'Scroll to step',
    x: Math.max(0, ab.width - width - 24),
    y: 24,
    width,
    height,
    scroll: 'vertical',
    clip: true,
    fill: { type: 'solid', color: '#f2f4f7' },
    stroke: { paint: { type: 'solid', color: LINE }, width: 1 },
    cornerRadius: 8,
    children: [
      createNode('rect', { name: 'Scroll length', x: 0, y: 0, width: width - 16, height: height * (steps + 1), fill: { type: 'solid', color: '#f2f4f7' }, decorative: true }),
      createNode('text', { name: 'Scroll hint', text: 'Scroll to move through the steps', x: 12, y: 12, width: width - 40, fontSize: 14, color: MUTED }),
    ],
  });
  ab.children.push(column);
  if (ab.steps) ab.steps.scrub = column.id;
  return column.id;
}

/**
 * A small working explainer to learn from: a ball that grows, moves and changes colour over four markers, with titles and
 * captions, Steps on, and a step bar. Preview it and click Next.
 */
export function addStepsExample(project: Project, ab: Artboard): void {
  const bar = stepBarBox(ab);
  const room = bar.y - 24;
  const cx = Math.round(ab.width / 2);
  const cy = Math.max(60, Math.round(room / 2));
  const ball = createNode('ellipse', { name: 'Example ball', x: cx - 150, y: cy - 40, width: 80, height: 80, fill: { type: 'solid', color: '#e5484d' } });
  const flag = createNode('rect', { name: 'Example target', x: cx + 110, y: cy - 40, width: 40, height: 80, cornerRadius: 6, fill: { type: 'solid', color: '#cfd6ff' } });
  ab.children.push(flag, ball);
  const key = (t: number, value: number | string) => ({ id: uid('k'), t, value, ease: 'easeInOut' as const });
  const track = (prop: string, keys: ReturnType<typeof key>[]) => ({ id: uid('tr'), nodeId: ball.id, prop, keys });
  const tl: Timeline = {
    id: uid('tl'),
    name: 'Example story',
    duration: 4500,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [
      track('scaleX', [key(0, 1), key(1500, 1.6), key(4500, 1.6)]),
      track('scaleY', [key(0, 1), key(1500, 1.6), key(4500, 1.6)]),
      track('x', [key(0, cx - 150), key(1500, cx - 150), key(3000, cx + 70), key(4500, cx + 70)]),
      track('fill.color', [key(0, '#e5484d'), key(3000, '#e5484d'), key(4500, '#30a46c')]),
    ],
    markers: [
      { id: uid('mk'), time: 0, name: 'Start', title: 'A small red ball', caption: 'It starts small, on the left.' },
      { id: uid('mk'), time: 1500, name: 'Grow', title: 'It grows', caption: 'The ball swells to one and a half times its size.' },
      { id: uid('mk'), time: 3000, name: 'Move', title: 'It rolls across', caption: 'Then it moves to the target on the right.' },
      { id: uid('mk'), time: 4500, name: 'Done', title: 'It turns green', caption: 'Arriving changes its colour. That is the last step.' },
    ],
  };
  ab.timelines.push(tl);
  enableSteps(project, ab, tl.id);
  addStepBar(project, ab);
}
