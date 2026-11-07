//Small helpers the games set shares: variables, a tidy interaction graph builder, page navigation, a hero page and the buttons that read on the dark pages.
import { uid, type Artboard, type LogicNode, type Project, type SceneNode, type Variable, type VariableType } from 'interactives-player';
import { brandedPage, button, edge, gnode, stroke, type BrandedCtx } from '../../kit';

export function addVar(project: Project, name: string, type: VariableType, initial: number | string | boolean | unknown[]): Variable {
  const v: Variable = { id: uid('v'), name, type, initial: Array.isArray(initial) ? JSON.stringify(initial) : initial };
  project.variables.push(v);
  return v;
}

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

  /** A key, only while `target` (or something in it) has the keyboard focus. Leave `key` empty for any key. */
  key(key: string, target?: SceneNode, note?: string): LogicNode {
    return this.add('event.key', { key, type: 'keydown', ...(target ? { target: target.id } : {}) }, null, 'out', { note });
  }

  start(note?: string): LogicNode {
    return this.add('event.start', {}, null, 'out', { note });
  }

  message(name: string, note?: string): LogicNode {
    return this.add('event.message', { name }, null, 'out', { note });
  }
}

export const set = (variable: Variable, value: string): [string, Record<string, unknown>] => ['action.setVariable', { variable: variable.id, op: 'set', value }];
export const addTo = (variable: Variable, value: string): [string, Record<string, unknown>] => ['action.setVariable', { variable: variable.id, op: 'add', value }];
export const go = (to: Artboard, transition = 'fade', duration = 250): [string, Record<string, unknown>] => ['action.artboard', { artboard: to.id, transition, duration }];
export const announce = (expr: string): [string, Record<string, unknown>] => ['action.announce', { text: expr, politeness: 'polite' }];
export const emit = (name: string): [string, Record<string, unknown>] => ['action.emit', { name }];
export const focus = (target: SceneNode): [string, Record<string, unknown>] => ['action.focus', { op: 'focus', target: target.id }];

/** A string literal for an expression. */
export const lit = (s: string) => JSON.stringify(s);

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

/** The hero page every starter opens with: title, one line, and a Start button that goes to `to` (wired by the caller with the page's graph). */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string, label = 'Start') {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle });
  const start = darkButton(ctx, 'Start', label, 48, page.height * 0.42 + 190, 200);
  page.children.push(start);
  return { page, start };
}

/** Lay the pages out in a row on the editor canvas so they do not sit on top of each other. */
export function spreadPages(project: Project): void {
  project.artboards.forEach((ab, i) => {
    ab.canvasX = i * (ab.width + 120);
    ab.canvasY = 0;
  });
}
