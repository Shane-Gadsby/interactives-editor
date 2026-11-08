import { ANIMATABLE_PROPS, CATALOG_BY_KIND, defaultParams, walk, type Artboard, type LogicEdge, type LogicNode, type Project } from 'interactives-player';
import { conditionWords } from './condition';

/**
 * The flow description: what an interaction graph does, as plain sentences. One model for the three things that need it: the
 * Inspector's list of what a layer does, the "Read as sentences" view of a whole artboard, and the preview a behaviour recipe shows
 * before it is added. It only reads the graph (nothing here writes), so a sentence can never disagree with the graph under it.
 * Sentences come from small templates for the common nodes; every other node reads from its catalog label and settings, and its
 * catalog summary rides along as the line's tooltip.
 */

export interface FlowCtx {
  ab: Artboard;
  project: Project;
  /** The layer the sentences are about, when they are on its Inspector: its events then leave the layer's name out ("When clicked"). */
  self?: string;
}

export interface FlowStep {
  node: LogicNode;
  text: string;
  /** The catalog's one-line summary of the node (the tooltip). */
  summary: string;
  /** More than one way on from here, or one that is not the plain next step: if so / if not, at the same time... */
  branches: FlowBranch[];
}

export interface FlowBranch {
  label: string;
  steps: FlowStep[];
}

export interface Flow {
  event: LogicNode;
  /** "When clicked", with any condition: "When clicked, only if score is at least 5". */
  when: string;
  /** Turned off: its Only if is a false that nothing else can undo. */
  off: boolean;
  steps: FlowStep[];
  /** How many steps were left out to keep it short. */
  more: number;
}

export interface FlowLine {
  key: string;
  nodeId: string;
  depth: number;
  kind: 'event' | 'step' | 'branch' | 'more';
  text: string;
  summary?: string;
}

// ---------------------------------------------------------------- names

const quoted = (s: string) => `“${s}”`;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

class Names {
  readonly layers = new Map<string, string>();
  constructor(
    readonly ab: Artboard,
    readonly project: Project,
  ) {
    walk(ab.children, (n) => void this.layers.set(n.id, n.name));
  }
  layer(id: unknown, none = 'a layer'): string {
    if (!id) return none;
    return this.layers.has(String(id)) ? this.layers.get(String(id))! : 'a layer that is missing';
  }
  timeline(id: unknown): string {
    return id ? (this.ab.timelines.find((t) => t.id === id)?.name ?? 'a timeline that is missing') : 'a timeline';
  }
  blend(id: unknown): string {
    return id ? ((this.ab.blends ?? []).find((b) => b.id === id)?.name ?? 'a blend that is missing') : 'a blend';
  }
  variable(id: unknown): string {
    return id ? (this.project.variables.find((v) => v.id === id)?.name ?? 'a variable that is missing') : 'a variable';
  }
  page(id: unknown): string {
    return id ? (this.project.artboards.find((a) => a.id === id)?.name ?? 'a page that is missing') : 'a page';
  }
  asset(id: unknown, none = 'a sound'): string {
    return id ? (this.project.assets.find((a) => a.id === id)?.name ?? 'a sound that is missing') : none;
  }
  data(id: unknown): string {
    return id ? (this.project.dataSources.find((d) => d.id === id)?.name ?? 'a data source that is missing') : 'a data source';
  }
  script(id: unknown): string {
    return id ? (this.project.scripts.find((s) => s.id === id)?.name ?? 'a script that is missing') : 'a script';
  }
}

/** A time written in a formula box, in words: 2000 is "2 s", 500 is "0.5 s", a formula is "<it> ms". */
function secs(ms: unknown): string {
  const t = String(ms ?? '').trim();
  if (/^\d+(?:\.\d+)?$/.test(t)) {
    const s = Number(t) / 1000;
    return `${Number.isInteger(s) ? s : Number(s.toFixed(2))} s`;
  }
  return t ? `${t} ms` : 'a moment';
}

/** A value from a formula box, for a sentence: text in quotes reads as that text, a number as itself, anything else as the formula. */
function val(expr: unknown): string {
  const t = String(expr ?? '').trim();
  if (!t) return 'nothing';
  const str = /^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$/.exec(t);
  if (str) return quoted(str[1] ?? str[2]);
  return t.replace(/\s+/g, ' ');
}

const propLabel = (prop: unknown) => lowerFirst(ANIMATABLE_PROPS.find((a) => a.prop === prop)?.label ?? String(prop ?? 'a property'));

// ---------------------------------------------------------------- events

type P = Record<string, unknown>;

const POINTER: Record<string, [(s: string) => string, string]> = {
  click: [(s) => `${s} is clicked`, 'clicked'],
  dblclick: [(s) => `${s} is double-clicked`, 'double-clicked'],
  pointerdown: [(s) => `${s} is pressed`, 'pressed'],
  pointerup: [(s) => `${s} is released`, 'released'],
  pointerenter: [(s) => `the pointer moves onto ${s}`, 'hovered over'],
  pointerleave: [(s) => `the pointer moves off ${s}`, 'the pointer moves off'],
  pointermove: [(s) => `the pointer moves over ${s}`, 'the pointer moves over it'],
  dragstart: [(s) => `${s} starts to be dragged`, 'it starts to be dragged'],
  drag: [(s) => `${s} is being dragged`, 'it is being dragged'],
  dragend: [(s) => `${s} is let go`, 'it is let go'],
};

const KEY_TYPE: Record<string, string> = { keydown: 'pressed', keyup: 'released' };

/** The "When ..." for an event node, without its condition. */
export function eventPhrase(n: LogicNode, c: Names, self?: string): string {
  const p: P = { ...defaultParams(n.kind), ...n.params };
  const mine = !!self && p.target === self;
  const subject = (none = 'any layer') => (mine ? 'this layer' : c.layer(p.target, none));
  switch (n.kind) {
    case 'event.start':
      return 'When this page is shown';
    case 'event.beforeLoad':
      return 'Before the activity loads';
    case 'event.activityLoad':
      return 'When the activity has loaded';
    case 'event.pointer': {
      const t = POINTER[String(p.type ?? 'click')] ?? POINTER.click;
      return mine ? `When ${t[1]}` : `When ${t[0](subject())}`;
    }
    case 'event.key': {
      const k = String(p.key ?? '').trim();
      const mods = ['ctrl', 'shift', 'alt', 'meta'].filter((m) => p[m]).map((m) => (m === 'meta' ? 'Cmd' : m[0].toUpperCase() + m.slice(1)));
      const name = [...mods, k || 'a key'].join('+');
      return `When ${name} is ${KEY_TYPE[String(p.type ?? 'keydown')] ?? 'pressed'}${p.target ? (mine ? ' on this layer' : ` on ${subject()}`) : ''}`;
    }
    case 'event.focus':
      return `When ${subject()} ${p.type === 'blur' ? 'loses' : 'gets'} keyboard focus`;
    case 'event.timer': {
      const when = p.repeat === false ? `After ${secs(p.ms)}` : `Every ${secs(p.ms)}`;
      return p.while ? `${when}, while ${conditionWords(String(p.while))}` : when;
    }
    case 'event.variable':
      return `When ${c.variable(p.variable)} changes`;
    case 'event.timelineEnd':
      return `When ${quoted(c.timeline(p.timeline))} finishes`;
    case 'event.timelineMarker':
      return `When ${quoted(c.timeline(p.timeline))} reaches ${p.marker ? quoted(String(p.marker)) : 'a marker'}`;
    case 'event.videoCue':
      return `When ${subject('a video')} reaches ${p.name ? quoted(String(p.name)) : 'a cue point'}`;
    case 'event.step':
      return p.type === 'done' ? `When step ${p.step ?? ''} has finished animating` : `When step ${p.step ?? ''} is chosen`;
    case 'event.message':
      return `When the message ${p.name ? quoted(String(p.name)) : 'you name'} arrives`;
    case 'event.scroll':
      return `When ${subject()} scrolls ${p.type === 'leave' ? 'out of' : 'into'} view`;
    case 'event.dragStart':
      return `When ${subject()} is picked up`;
    case 'event.dragMove':
      return `While ${subject()} is being dragged`;
    case 'event.dragOver':
      return `When ${subject()} is dragged ${p.type === 'leave' ? 'off' : 'over'} a drop zone`;
    case 'event.drop':
      return `When ${subject()} is dropped${p.result === 'rejected' ? ' where it does not belong' : p.result === 'accepted' ? ' where it belongs' : ''}`;
    case 'event.dragEnd':
      return `When ${subject()} is let go`;
    case 'event.dataLoaded':
      return `When ${c.data(p.source)} has loaded`;
    default:
      return fallback(n, c, true);
  }
}

// ---------------------------------------------------------------- actions

const TIMELINE_OP: Record<string, (t: string, p: P) => string> = {
  play: (t) => `play ${t}`,
  restart: (t) => `restart ${t}`,
  pause: (t) => `pause ${t}`,
  stop: (t) => `stop ${t} and put it back to the start`,
  reverse: (t) => `play ${t} backwards`,
  toggle: (t) => `play or pause ${t}`,
  seek: (t, p) => `jump ${t} to ${secs(p.time)}`,
};

function setVariable(p: P, c: Names): string {
  const v = c.variable(p.variable);
  switch (String(p.op ?? 'set')) {
    case 'add':
      return `add ${val(p.value)} to ${v}`;
    case 'toggle':
      return `switch ${v} on or off`;
    case 'push':
      return `add ${val(p.value)} to the list ${v}`;
    case 'remove':
      return `remove item ${val(p.value)} from the list ${v}`;
    case 'clear':
      return `empty ${v}`;
    case 'reset':
      return `put ${v} back to its starting value`;
    case 'toggleItem':
      return `add ${val(p.value)} to the list ${v}, or take it out if it is there`;
    case 'removeValue':
      return `remove ${val(p.value)} from the list ${v}`;
    case 'setItem':
      return `change an item of the list ${v}`;
    default:
      return `set ${v} to ${val(p.value)}`;
  }
}

const ACTION: Record<string, (p: P, c: Names) => string> = {
  'action.timeline': (p, c) => (TIMELINE_OP[String(p.op ?? 'play')] ?? TIMELINE_OP.play)(quoted(c.timeline(p.timeline)), p),
  'action.blendPlay': (p, c) => `play the blend ${quoted(c.blend(p.blend))}`,
  'action.blendStop': (p, c) => `stop the blend ${quoted(c.blend(p.blend))}`,
  'action.setVariable': setVariable,
  'action.resetVariables': (p, c) => {
    const list = (Array.isArray(p.variables) ? p.variables : []).map((id) => c.variable(id));
    return list.length ? `put ${list.join(', ')} back to the starting values` : 'put variables back to their starting values';
  },
  'action.setProperty': (p, c) => `set ${c.layer(p.target)}’s ${propLabel(p.prop)} to ${val(p.value)}`,
  'action.animate': (p, c) => `${p.relative ? 'move' : 'animate'} ${c.layer(p.target)}’s ${propLabel(p.prop)} ${p.relative ? 'by' : 'to'} ${val(p.to)} over ${secs(p.duration ?? 400)}`,
  'action.visibility': (p, c) => {
    const t = c.layer(p.target);
    return p.op === 'show' ? `show ${t}` : p.op === 'hide' ? `hide ${t}` : `show or hide ${t}`;
  },
  'action.artboard': (p, c) => {
    switch (String(p.to ?? 'picked')) {
      case 'next':
        return 'go to the next page';
      case 'previous':
        return 'go to the previous page';
      case 'back':
        return 'go back to the page the learner came from';
      case 'expression':
        return 'go to the page a formula names';
      default:
        return `go to the page ${quoted(c.page(p.artboard))}`;
    }
  },
  'action.url': (p) => `open the link ${val(p.url)}`,
  'action.startOver': () => 'start over',
  'action.reportResult': (p) => (p.completed === 'progress' ? `report the score so far${p.score ? ` (${val(p.score)})` : ''}` : `report the result${p.score ? ` (score ${val(p.score)})` : ''}`),
  'action.record': (p) => `record ${quoted(String(p.name ?? 'milestone'))}`,
  'action.sound': (p, c) => `play ${p.asset ? quoted(c.asset(p.asset)) : p.source ? `the sound ${val(p.source)}` : 'a sound'}${String(p.loop ?? 'false') === 'true' ? ' on a loop' : ''}`,
  'action.stopSound': (p, c) => (p.asset ? `stop the sound ${quoted(c.asset(p.asset))}` : 'stop all sounds'),
  'action.delay': (p) => `wait ${secs(p.ms)}`,
  'action.emit': (p) => `send the message ${p.name ? quoted(String(p.name)) : 'you name'}`,
  'action.log': () => 'write a note to the browser console',
  'action.script': (p, c) => `run the script ${quoted(c.script(p.script))}`,
  'action.code': () => 'run a code snippet',
  'action.announce': (p) => `tell screen readers ${val(p.text)}`,
  'action.setTheme': (p) => `switch to the theme ${val(p.theme)}`,
  'action.cursor': (p, c) => `change the mouse pointer to ${String(p.cursor ?? 'pointer')} over ${p.target ? c.layer(p.target) : 'the whole player'}`,
  'action.focus': (p, c) => (p.op === 'clear' ? 'clear keyboard focus' : `move keyboard focus to ${c.layer(p.target)}`),
  'action.steps': (p) => {
    const op = String(p.op ?? 'next');
    return op === 'next' ? 'go to the next step' : op === 'back' ? 'go to the previous step' : op === 'first' ? 'go to the first step' : op === 'last' ? 'go to the last step' : `go to step ${val(p.step)}`;
  },
  'action.questionCheck': (p, c) => `check the answer on ${c.layer(p.question, 'the question')}`,
  'action.questionReset': (p, c) => `put ${c.layer(p.question, 'the question')} back to the start`,
  'action.questionHint': (p, c) => `show the next hint for ${c.layer(p.question, 'the question')}`,
  'action.loadData': (p, c) => `reload ${c.data(p.source)}`,
  'action.saveUserData': () => 'save the learner’s progress',
  'action.loadUserData': () => 'bring back the learner’s saved progress',
  'action.sharedAdd': (p, c) => `add an answer to ${c.data(p.source)}`,
  'action.sharedWithdraw': (p, c) => `take this learner’s answers back out of ${c.data(p.source)}`,
};

const LOGIC: Record<string, (p: P) => string> = {
  'logic.if': (p) => `check whether ${conditionWords(String(p.condition ?? ''))}`,
  'logic.switch': () => 'alternate between two ways on',
  'logic.random': () => 'pick one way on at random',
  'logic.once': () => 'carry on, but only the first time',
  'logic.sequence': () => 'carry on down each way in turn',
};

/** Every other node: its name and what it is set to, from its own settings (the catalog decides what is worth saying). */
function fallback(n: LogicNode, c: Names, event = false): string {
  const def = CATALOG_BY_KIND[n.kind];
  if (!def) return `a step this editor does not know (${n.kind})`;
  const params: P = { ...defaultParams(n.kind), ...n.params };
  const parts: string[] = [];
  for (const d of def.params) {
    if (d.key === 'onlyIf' || d.key === 'continue' || d.key === 'continueAt') continue;
    if (d.showIf && !d.showIf.values.includes(params[d.showIf.key])) continue;
    const v = params[d.key];
    if (v === undefined || v === '' || v === false || v === null) continue;
    let text = '';
    switch (d.type) {
      case 'node':
        text = c.layer(v);
        break;
      case 'timeline':
        text = c.timeline(v);
        break;
      case 'blend':
        text = c.blend(v);
        break;
      case 'variable':
        text = c.variable(v);
        break;
      case 'variables':
        text = (Array.isArray(v) ? v : []).map((id) => c.variable(id)).join(', ');
        break;
      case 'artboard':
        text = c.page(v);
        break;
      case 'script':
        text = c.script(v);
        break;
      case 'data':
        text = c.data(v);
        break;
      case 'asset':
        text = c.asset(v);
        break;
      case 'select':
        text = d.options?.find((o) => o.value === v)?.label ?? String(v);
        break;
      case 'expr':
        text = val(v);
        break;
      case 'text':
        text = n.kind === 'action.code' ? '' : String(v).split('\n')[0].slice(0, 40);
        break;
      case 'number':
        text = String(v);
        break;
      default:
        text = '';
    }
    if (text) parts.push(text);
    if (parts.length >= 3) break;
  }
  const name = event ? def.label : lowerFirst(def.label);
  return parts.length ? `${name} (${parts.join(', ')})` : name;
}

/** One node as a phrase ("show Hint text"); events read as their "When ...". */
export function describeNode(n: LogicNode, ab: Artboard, project: Project, self?: string): string {
  const c = new Names(ab, project);
  return phrase(n, c, self);
}

function phrase(n: LogicNode, c: Names, self?: string): string {
  if (n.kind.startsWith('event.')) return eventPhrase(n, c, self);
  const p: P = { ...defaultParams(n.kind), ...n.params };
  const t = ACTION[n.kind] ?? (LOGIC[n.kind] ? (q: P) => LOGIC[n.kind](q) : null);
  return t ? t(p, c) : fallback(n, c);
}

/** The kinds that have a template of their own (every other kind reads from the catalog). */
export const TEMPLATED_KINDS: string[] = [...Object.keys(ACTION), ...Object.keys(LOGIC), 'event.start', 'event.beforeLoad', 'event.activityLoad', 'event.pointer', 'event.key', 'event.focus', 'event.timer', 'event.variable', 'event.timelineEnd', 'event.timelineMarker', 'event.videoCue', 'event.step', 'event.message', 'event.scroll', 'event.dragStart', 'event.dragMove', 'event.dragOver', 'event.drop', 'event.dragEnd', 'event.dataLoaded'];

// ---------------------------------------------------------------- turning a flow off

/** The condition a turned-off flow carries: false, and whatever it had before behind it so turning it back on restores it. */
export function turnedOff(onlyIf: unknown): string {
  const cur = String(onlyIf ?? '').trim();
  return cur ? (isOffExpr(cur) ? cur : `false && (${cur})`) : 'false';
}

/** What a turned-off flow's condition was before it was turned off. */
export function turnedOn(onlyIf: unknown): string {
  const cur = String(onlyIf ?? '').trim();
  if (cur === 'false') return '';
  const m = /^false && \(([\s\S]*)\)$/.exec(cur);
  return m ? m[1] : cur;
}

const isOffExpr = (s: string) => s === 'false' || /^false && \([\s\S]*\)$/.test(s);

export const isOff = (n: LogicNode): boolean => isOffExpr(String(n.params.onlyIf ?? '').trim());

// ---------------------------------------------------------------- the flow of an event

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];

const portPhrase = (kind: string, port: string, label: string): string => {
  const known: Record<string, string> = { true: 'if so', false: 'if not', correct: 'if correct', wrong: 'if wrong', finished: 'when it is finished', setDone: 'when the set is done', none: 'if there is none', stopped: 'if it is stopped', done: 'when it is done', failed: 'if it fails', recorded: 'once it is recorded', a: 'one way', b: 'the other way' };
  if (port in known) return known[port];
  if (kind === 'logic.sequence') return ORDINALS[Number(port) - 1] ?? `step ${port}`;
  if (kind === 'logic.random') return `way ${port}`;
  return label ? lowerFirst(label) : `on “${port}”`;
};

function outgoing(ab: Artboard, id: string): LogicEdge[] {
  const y = new Map(ab.logic.nodes.map((n) => [n.id, n.y]));
  return ab.logic.edges.filter((e) => e.from === id).sort((a, b) => (y.get(a.to) ?? 0) - (y.get(b.to) ?? 0));
}

/** The nodes a run of this node can reach (itself included). */
export function reachable(ab: Artboard, id: string): Set<string> {
  const seen = new Set([id]);
  const todo = [id];
  while (todo.length) {
    const at = todo.pop()!;
    for (const e of ab.logic.edges) if (e.from === at && !seen.has(e.to)) (seen.add(e.to), todo.push(e.to));
  }
  return seen;
}

export interface FlowOptions {
  /** How many steps to describe before cutting off ("and 4 more steps"). */
  limit?: number;
}

export function buildFlow(event: LogicNode, ctx: FlowCtx, opts: FlowOptions = {}): Flow {
  const { ab, project } = ctx;
  const c = new Names(ab, project);
  const byId = new Map(ab.logic.nodes.map((n) => [n.id, n]));
  const limit = opts.limit ?? 8;
  const emitted = new Set<string>([event.id]);
  let count = 0;

  const chain = (id: string, path: Set<string>): FlowStep[] => {
    const node = byId.get(id);
    if (!node || count >= limit) return [];
    if (path.has(id)) return [{ node, text: `go back to “${phrase(node, c, ctx.self)}”`, summary: 'The flow loops here', branches: [] }];
    count++;
    emitted.add(id);
    const def = CATALOG_BY_KIND[node.kind];
    const step: FlowStep = { node, text: phrase(node, c, ctx.self), summary: def?.summary ?? '', branches: [] };
    const next = outgoing(ab, id);
    const inner = new Set(path).add(id);
    if (next.length === 1 && next[0].fromPort === 'out') return [step, ...chain(next[0].to, inner)];
    for (const e of next) {
      const label = e.fromPort === 'out' || next.filter((x) => x.fromPort === e.fromPort).length > 1 ? 'at the same time' : portPhrase(node.kind, e.fromPort, def?.outputs.find((o) => o.id === e.fromPort)?.label ?? '');
      const steps = chain(e.to, inner);
      if (steps.length) step.branches.push({ label, steps });
    }
    return [step];
  };

  const first = outgoing(ab, event.id);
  const steps: FlowStep[] = [];
  const top = new Set([event.id]);
  if (first.length === 1) steps.push(...chain(first[0].to, top));
  else if (first.length > 1) {
    // several things start together: a step-less head that says so, with each as a way on
    const head: FlowStep = { node: event, text: 'do all of these', summary: '', branches: [] };
    for (const e of first) {
      const s = chain(e.to, top);
      if (s.length) head.branches.push({ label: ORDINALS[head.branches.length] ?? `number ${head.branches.length + 1}`, steps: s });
    }
    if (head.branches.length) steps.push(head);
  }
  const all = reachable(ab, event.id);
  const more = Math.max(0, all.size - emitted.size);
  const cond = String(event.params.onlyIf ?? '').trim();
  const off = isOff(event);
  let when = eventPhrase(event, c, ctx.self);
  const shown = off ? turnedOn(cond) : cond;
  if (shown) when += `, only if ${conditionWords(shown)}`;
  return { event, when, off, steps, more };
}

function chainText(steps: FlowStep[]): string {
  return steps
    .map((s) => {
      if (!s.branches.length) return s.text;
      return `${s.text} (${s.branches.map((b) => `${b.label}: ${chainText(b.steps)}`).join('; ')})`;
    })
    .join(', then ');
}

/** The whole flow as one sentence: "When clicked: show Hint text, then wait 2 s, then hide it". */
export function flowSentence(flow: Flow): string {
  const body = chainText(flow.steps);
  const tail = flow.more ? `${body ? ', and ' : ''}${flow.more} more step${flow.more === 1 ? '' : 's'}` : '';
  const off = flow.off ? ' (turned off)' : '';
  if (!body && !flow.more) return `${flow.when}${off}: nothing happens yet, no step is joined to it`;
  return `${flow.when}${off}: ${body}${tail}`;
}

/** The flow as lines, indented by how deep each is: the event, its steps, and the ways on under a step that splits. */
export function flowLines(flow: Flow): FlowLine[] {
  const out: FlowLine[] = [{ key: flow.event.id, nodeId: flow.event.id, depth: 0, kind: 'event', text: flow.off ? `${flow.when} (turned off)` : flow.when }];
  const add = (steps: FlowStep[], depth: number) => {
    for (const s of steps) {
      out.push({ key: `${flow.event.id}>${s.node.id}>${out.length}`, nodeId: s.node.id, depth, kind: 'step', text: s.text, summary: s.summary });
      for (const b of s.branches) {
        out.push({ key: `${flow.event.id}>${s.node.id}>${b.label}>${out.length}`, nodeId: s.node.id, depth: depth + 1, kind: 'branch', text: `${b.label}:` });
        add(b.steps, depth + 2);
      }
    }
  };
  add(flow.steps, 1);
  if (!flow.steps.length) out.push({ key: `${flow.event.id}>empty`, nodeId: flow.event.id, depth: 1, kind: 'more', text: 'Nothing happens yet: no step is joined to this.' });
  if (flow.more) out.push({ key: `${flow.event.id}>more`, nodeId: flow.event.id, depth: 1, kind: 'more', text: `… and ${flow.more} more step${flow.more === 1 ? '' : 's'}` });
  return out;
}

// ---------------------------------------------------------------- finding flows

const eventsFirst = (a: LogicNode, b: LogicNode) => a.y - b.y || a.x - b.x;

/** The flows that start on a layer (events whose layer is this one), top to bottom as the graph has them. */
export function flowsForLayer(ctx: FlowCtx, layerId: string, opts?: FlowOptions): Flow[] {
  return ctx.ab.logic.nodes
    .filter((n) => n.kind.startsWith('event.') && n.params.target === layerId)
    .sort(eventsFirst)
    .map((e) => buildFlow(e, { ...ctx, self: layerId }, opts));
}

/** Every flow on the artboard, in graph order. */
export function flowsOf(ctx: FlowCtx, opts?: FlowOptions): Flow[] {
  return ctx.ab.logic.nodes
    .filter((n) => n.kind.startsWith('event.'))
    .sort(eventsFirst)
    .map((e) => buildFlow(e, ctx, opts));
}

/** Nodes nothing starts: not an event, and not reached from one. */
export function looseNodes(ab: Artboard): LogicNode[] {
  const reached = new Set<string>();
  for (const e of ab.logic.nodes) if (e.kind.startsWith('event.')) for (const id of reachable(ab, e.id)) reached.add(id);
  return ab.logic.nodes.filter((n) => !n.kind.startsWith('event.') && !reached.has(n.id)).sort(eventsFirst);
}

/**
 * What removing a flow takes with it: the event and the steps only it reaches. A step another event also reaches stays (it still has
 * somewhere to run from), and so does anything wired from something that stays.
 */
export function removableWithEvent(ab: Artboard, eventId: string): Set<string> {
  const mine = reachable(ab, eventId);
  const others = new Set<string>();
  for (const e of ab.logic.nodes) if (e.kind.startsWith('event.') && e.id !== eventId) for (const id of reachable(ab, e.id)) others.add(id);
  const gone = new Set([...mine].filter((id) => id === eventId || !others.has(id)));
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of ab.logic.edges) {
      if (gone.has(e.to) && e.to !== eventId && !gone.has(e.from)) {
        gone.delete(e.to);
        changed = true;
      }
    }
  }
  return gone;
}
