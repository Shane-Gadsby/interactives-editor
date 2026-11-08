/**
 * The one set of interaction graph helpers the branded starters build with (it replaces the copies the sets each kept in
 * games/common.ts, story/common.ts, assessment/shared.ts, drag/shared.ts, explore/helpers.ts and writing/shared.ts, which now
 * re-export from here).
 *
 * Building: variables (`addVar`), the node and wire builders in the four shapes the sets had (`Graph` class, the `graph(ab)`
 * closure, `Flow`, `seq`/`put`/`join`), and the one line action tuples (`set`, `go`, `announce`...). They place nodes roughly as
 * they go (rows, to the right of what they follow), which is only a first guess: `finishGraphs(project)` runs the editor's graph
 * tidy (`../graph-tidy.ts`) over every artboard's graph, so what an author opens in the Interactions tab is laid out in columns
 * with the fewest crossings whatever order a starter built it in. `projectFromBrandedStarter` calls it, so a starter never has
 * to compute a position that matters.
 */
import { CATALOG_BY_KIND, uid, type Artboard, type LogicEdge, type LogicNode, type Project, type SceneNode, type Variable, type VariableType } from 'interactives-player';
import { tidyGraph, type TidyEdge, type TidyGroup, type TidyNode } from '../graph-tidy';
import { button, edge, gnode, stroke, type BrandedCtx } from './kit';

// ------------------------------------------------------------------ variables

/**
 * A project variable. A list takes its starting rows as an array and keeps them as JSON text, like the Variables tab. The last
 * argument is a formula (text) or any other fields of the variable: `{ formula: 'wordCount(essay)', live: true }`, `{ userData: true }`.
 */
export function addVar(project: Project, name: string, type: VariableType, initial: number | string | boolean | unknown[], extra?: string | Partial<Variable>): Variable {
  const more = typeof extra === 'string' ? (extra ? { formula: extra } : {}) : (extra ?? {});
  const v: Variable = { id: uid('v'), name, type, initial: Array.isArray(initial) ? JSON.stringify(initial) : initial, ...more };
  project.variables.push(v);
  return v;
}

// ------------------------------------------------------------------ action tuples

export type ActionStep = [string, Record<string, unknown>];
type Step = ActionStep;

export const set = (variable: Variable, value: string): Step => ['action.setVariable', { variable: variable.id, op: 'set', value }];
export const addTo = (variable: Variable, value: string): Step => ['action.setVariable', { variable: variable.id, op: 'add', value }];
export const setVar = (v: Variable, value: string, op: 'set' | 'add' | 'push' | 'remove' = 'set'): Step => ['action.setVariable', { variable: v.id, op, value }];
export const clearVar = (v: Variable): Step => ['action.setVariable', { variable: v.id, op: 'clear' }];
export const toggleVar = (v: Variable): Step => ['action.setVariable', { variable: v.id, op: 'toggle' }];
/** Go to a page. Next and previous pages are `goNext`/`goPrevious`: they follow the project's page order and need no artboard. */
export const go = (to: Artboard, transition = 'fade', duration = 250): Step => ['action.artboard', { artboard: to.id, transition, duration }];
export const goNext = (transition = 'fade', duration = 250): Step => ['action.artboard', { to: 'next', transition, duration }];
export const goPrevious = (transition = 'fade', duration = 250): Step => ['action.artboard', { to: 'previous', transition, duration }];
export const announce = (expr: string): Step => ['action.announce', { text: expr, politeness: 'polite' }];
export const emit = (name: string): Step => ['action.emit', { name }];
export const focus = (target: SceneNode): Step => ['action.focus', { op: 'focus', target: target.id }];

/** A string literal for an expression. */
export const lit = (s: string): string => JSON.stringify(s);

/** Hide-or-show and disable by an expression: a binding is all a layer needs. */
export const bind = <T extends SceneNode>(n: T, bindings: Record<string, string>): T => {
  n.bindings = { ...(n.bindings ?? {}), ...bindings };
  return n;
};

/** A button for the gradient and deep pages: the colourway's button colour, outlined in the page's own text colour so it never melts into the background. */
export function darkButton(ctx: BrandedCtx, name: string, label: string, x: number, y: number, width = 180, on: 'gradient' | 'deep' = 'gradient') {
  const b = button(ctx, name, label, x, y, width, true);
  b.stroke = stroke(on === 'gradient' ? ctx.L.onGradient : ctx.L.onDeep, 2);
  return b;
}

/** Lay the pages out in a row on the editor canvas (the real layout is the artboard tidy that `projectFromBrandedStarter` runs, so this is only a first guess). */
export function spreadPages(project: Project): void {
  project.artboards.forEach((ab, i) => {
    ab.canvasX = i * (ab.width + 120);
    ab.canvasY = 0;
  });
}

// ------------------------------------------------------------------ builders

/** Builds an artboard's interaction graph in rows: an event starts a row, each step sits to the right of the one before it. */
export class Graph {
  private y = 0;
  constructor(readonly board: Artboard) {}

  /** A node. With `from` it is wired after that node (on `port`) and sits to its right, `dy` lower; without, it starts a new row. */
  add(kind: string, params: Record<string, unknown> = {}, from?: LogicNode | null, port = 'out', opts: { note?: string; dy?: number } = {}): LogicNode {
    const n = gnode(kind, from ? from.x + 270 : 0, from ? from.y + (opts.dy ?? 0) : this.y, params, opts.note);
    this.board.logic.nodes.push(n);
    if (from) this.board.logic.edges.push(edge(from, n, port));
    else this.y += 160;
    return n;
  }

  /** Leave room below the current row (a flow that branches). */
  gap(px: number): void {
    this.y += px;
  }

  /** Steps one after the other from `from`; returns the last. */
  run(from: LogicNode, ...steps: [string, Record<string, unknown>?][]): LogicNode {
    return steps.reduce((prev, [kind, params]) => this.add(kind, params ?? {}, prev), from);
  }

  /** The same, leaving `from` by one of its named outputs (an If's "true" or "false"). */
  runFrom(from: LogicNode, port: string, ...steps: [string, Record<string, unknown>?][]): LogicNode {
    const [[kind, params], ...rest] = steps;
    return this.run(this.add(kind, params ?? {}, from, port), ...rest);
  }

  click(target: SceneNode, note?: string): LogicNode {
    return this.add('event.pointer', { target: target.id, type: 'click' }, null, 'out', { note });
  }

  /** A pointer event on a layer (pointerdown, pointerup, drag, dragstart, dragend). */
  pointer(target: SceneNode, type: string, note?: string): LogicNode {
    return this.add('event.pointer', { target: target.id, type }, null, 'out', { note });
  }

  /** A key, only while `target` (or something in it) has the keyboard focus. Leave `key` empty for any key. The second argument can be the note instead when there is no target. */
  key(key: string, targetOrNote?: SceneNode | string, note?: string): LogicNode {
    const target = typeof targetOrNote === 'object' ? targetOrNote : undefined;
    const say = typeof targetOrNote === 'string' ? targetOrNote : note;
    return this.add('event.key', { key, type: 'keydown', ...(target ? { target: target.id } : {}) }, null, 'out', { note: say });
  }

  /** Enter pressed inside a text box (`target`), which a key event ignores unless it is told it may hear typing. */
  enterIn(target: SceneNode, note?: string): LogicNode {
    return this.add('event.key', { key: 'Enter', type: 'keydown', typing: true, target: target.id }, null, 'out', { note });
  }

  start(note?: string): LogicNode {
    return this.add('event.start', {}, null, 'out', { note });
  }

  message(name: string, note?: string): LogicNode {
    return this.add('event.message', { name }, null, 'out', { note });
  }
}

/**
 * Wires the interaction graph of an artboard in rows: an event, then the nodes it runs to its right. `then` follows a port
 * of a node; a second wire out of the same node (or the false branch of an If) starts a new row below.
 */
export function graph(ab: Artboard) {
  const col = new Map<string, number>();
  const rows = new Map<string, number>();
  const wires = new Map<string, number>();
  let row = ab.logic.nodes.length ? Math.max(...ab.logic.nodes.map((n) => n.y)) / 110 + 1.4 : 0;
  const add = (kind: string, params: Record<string, unknown>, c: number, r: number, note?: string): LogicNode => {
    const n = gnode(kind, c * 290, Math.round(r * 110), params, note);
    ab.logic.nodes.push(n);
    col.set(n.id, c);
    rows.set(n.id, r);
    return n;
  };
  return {
    /** An event node on a fresh row. */
    event(kind: string, params: Record<string, unknown>, note?: string): LogicNode {
      const n = add(kind, params, 0, row, note);
      row += 1;
      return n;
    },
    /** The next node, off `prev`'s `port`. */
    then(prev: LogicNode, kind: string, params: Record<string, unknown> = {}, port = 'out'): LogicNode {
      const before = wires.get(prev.id) ?? 0;
      wires.set(prev.id, before + 1);
      let r = rows.get(prev.id) ?? 0;
      if (before > 0) {
        r = row;
        row += 1;
      }
      const n = add(kind, params, (col.get(prev.id) ?? 0) + 1, r);
      ab.logic.edges.push(edge(prev, n, port));
      return n;
    },
    /** A chain of actions off `prev`, each after the one before. Returns the last. */
    run(prev: LogicNode, ...steps: [string, Record<string, unknown>][]): LogicNode {
      let at = prev;
      for (const [kind, params] of steps) at = this.then(at, kind, params);
      return at;
    },
  };
}

export const click = (g: ReturnType<typeof graph>, target: SceneNode, note?: string) => g.event('event.pointer', { target: target.id, type: 'click' }, note);

/** A node wired off one the question kit made (it keeps its own nodes where it put them), placed just beside it. */
export function after(ab: Artboard, prev: LogicNode, kind: string, params: Record<string, unknown> = {}, port = 'out'): LogicNode {
  const n = gnode(kind, prev.x + 320, prev.y + 55, params);
  ab.logic.nodes.push(n);
  ab.logic.edges.push(edge(prev, n, port));
  return n;
}

const COL = 250;
const ROW = 140;

/** Lays an artboard's interaction graph out in rows as it is built, so the author finds it tidy in the Interactions tab. */
export class Flow {
  private row = 0;
  constructor(private ab: Artboard) {}

  private put(list: LogicNode[], col: number, row: number) {
    list.forEach((node, i) => {
      node.x = (col + i) * COL;
      node.y = row * ROW;
    });
  }

  private add(...nodes: LogicNode[]) {
    this.ab.logic.nodes.push(...nodes);
  }

  private link(nodes: LogicNode[]): LogicEdge[] {
    return nodes.slice(1).map((node, i) => edge(nodes[i], node));
  }

  /** One run of nodes along its own row: the first usually an event. */
  chain(...nodes: LogicNode[]): LogicNode[] {
    this.put(nodes, 0, this.row++);
    this.add(...nodes);
    this.ab.logic.edges.push(...this.link(nodes));
    return nodes;
  }

  /**
   * Events that all lead into the same If: when it holds, `yes` runs, otherwise nothing does. A click and an arrow key can
   * share one gate this way.
   */
  gate(events: LogicNode[], cond: LogicNode, yes: LogicNode[]) {
    events.forEach((ev, i) => this.put([ev], 0, this.row + i));
    this.put([cond], 1, this.row);
    this.put(yes, 2, this.row);
    this.add(...events, cond, ...yes);
    for (const ev of events) this.ab.logic.edges.push(edge(ev, cond));
    if (yes.length) this.ab.logic.edges.push(edge(cond, yes[0], 'true'), ...this.link(yes));
    this.row += Math.max(events.length, 1);
  }

  /** Events that all lead into the same run of nodes. */
  join(events: LogicNode[], run: LogicNode[]) {
    events.forEach((ev, i) => this.put([ev], 0, this.row + i));
    this.put(run, 1, this.row);
    this.add(...events, ...run);
    for (const ev of events) this.ab.logic.edges.push(edge(ev, run[0]));
    this.ab.logic.edges.push(...this.link(run));
    this.row += Math.max(events.length, 1);
  }
}

/** A row of the interaction graph: nodes side by side at height `y`, each wired to the next. A spec is `[kind, params, note?]`. Returns the nodes so a flow can be joined to another. */
export function seq(ab: Artboard, y: number, ...specs: [string, Record<string, unknown>, string?][]): LogicNode[] {
  const nodes = specs.map(([kind, params, note], i) => gnode(kind, i * 260, y, params, note));
  ab.logic.nodes.push(...nodes);
  ab.logic.edges.push(...nodes.slice(1).map((n, i) => edge(nodes[i], n)));
  return nodes;
}

/** A free node at a spot of the graph (for branches). */
export function put(ab: Artboard, kind: string, x: number, y: number, params: Record<string, unknown> = {}, note?: string): LogicNode {
  const n = gnode(kind, x, y, params, note);
  ab.logic.nodes.push(n);
  return n;
}

export function join(ab: Artboard, from: LogicNode, to: LogicNode, port = 'out'): void {
  ab.logic.edges.push(edge(from, to, port));
}

/** A button on a page that goes to another page when pressed. */
export function goButton(ab: Artboard, btn: SceneNode, to: Artboard, y: number): void {
  seq(ab, y, ['event.pointer', { target: btn.id, type: 'click' }, 'Navigation'], ['action.artboard', { artboard: to.id, transition: 'fade', duration: 300 }]);
}

// ------------------------------------------------------------------ tidy

/**
 * How big a node will draw in the Interactions tab (React Flow measures them in the browser, so a built starter has to guess):
 * 170 to 240 wide by what its settings say, a header, the summary of its settings (or the description of the node when it has
 * none) at about 31 characters a line, and a row per output.
 */
export function nodeSizeGuess(n: LogicNode): { width: number; height: number } {
  const def = CATALOG_BY_KIND[n.kind];
  let chars = 0;
  for (const p of def?.params ?? []) {
    const v = n.params[p.key];
    if (v === undefined || v === '' || v === false || (typeof v === 'object' && v !== null)) continue;
    if (p.showIf && !p.showIf.values.includes((n.params[p.showIf.key] ?? '') as never)) continue;
    chars += Math.min(String(v).length, 40) + 3;
  }
  if (!chars) chars = Math.min(def?.description.length ?? 0, 120);
  const width = Math.min(240, Math.max(170, 140 + chars * 2));
  const lines = Math.max(1, Math.ceil(chars / Math.floor((width - 20) / 6.3)));
  const outs = Math.max(1, def?.outputs.length ?? 1);
  return { width, height: Math.max(70, 34 + lines * 15 + 8 + outs * 14) };
}

/**
 * The editor's Tidy up for one artboard's graph: columns from the events, the fewest crossing wires it can find, each group
 * fitted to the nodes in it. The same `tidyGraph` the Interactions tab runs, with the sizes guessed (`nodeSizeGuess`).
 */
export function tidyBoardGraph(ab: Artboard): void {
  const nodes = ab.logic.nodes;
  if (!nodes.length) return;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const sizes = new Map(nodes.map((n) => [n.id, nodeSizeGuess(n)]));
  const tn: TidyNode[] = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...sizes.get(n.id)! }));
  const te: TidyEdge[] = ab.logic.edges.map((e) => {
    const outs = CATALOG_BY_KIND[byId.get(e.from)?.kind ?? '']?.outputs ?? [];
    return { from: e.from, to: e.to, port: Math.max(0, outs.findIndex((o) => o.id === e.fromPort)) };
  });
  const groups = ab.logic.groups ?? [];
  const tg: TidyGroup[] = groups.map((g) => ({
    id: g.id,
    members: nodes.filter((n) => {
      const z = sizes.get(n.id)!;
      const cx = n.x + z.width / 2;
      const cy = n.y + z.height / 2;
      return cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height;
    }).map((n) => n.id),
  }));
  const out = tidyGraph(tn, te, tg);
  for (const n of nodes) {
    const p = out.positions.get(n.id);
    if (p) {
      n.x = Math.round(p.x);
      n.y = Math.round(p.y);
    }
  }
  for (const g of groups) {
    const b = out.groups.get(g.id);
    if (b) Object.assign(g, { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) });
  }
}

/** Graph tidy on every artboard of a project. */
export function finishGraphs(project: Project): void {
  for (const ab of project.artboards) tidyBoardGraph(ab);
}
