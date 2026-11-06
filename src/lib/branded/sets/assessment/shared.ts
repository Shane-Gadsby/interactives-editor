/**
 * Small helpers the four assessment starters share: variables, the interaction graph as rows of wired nodes, a hero page
 * with its Start button, and the pass at the end that makes the question kit's frames sit in the brand.
 */
import { createNode, uid, walk, type Artboard, type FrameNode, type LogicNode, type Project, type SceneNode, type Variable, type VariableType } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { brandedPage, button, edge, gnode, solid, stroke, text, type BrandedCtx } from '../../kit';

/** A project variable. A list takes its starting rows as an array and keeps them as JSON text, like the Variables tab. */
export function variable(project: Project, name: string, type: VariableType, initial: number | string | boolean | unknown[]): Variable {
  const v: Variable = { id: uid('v'), name, type, initial: Array.isArray(initial) ? JSON.stringify(initial) : initial };
  project.variables.push(v);
  return v;
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

/** A node wired off one the question kit made (it keeps its own nodes where it put them), placed just beside it. */
export function after(ab: Artboard, prev: LogicNode, kind: string, params: Record<string, unknown> = {}, port = 'out'): LogicNode {
  const n = gnode(kind, prev.x + 320, prev.y + 55, params);
  ab.logic.nodes.push(n);
  ab.logic.edges.push(edge(prev, n, port));
  return n;
}

export const click = (g: ReturnType<typeof graph>, target: SceneNode, note?: string) => g.event('event.pointer', { target: target.id, type: 'click' }, note);
export const setVar = (v: Variable, value: string, op: 'set' | 'add' | 'push' | 'remove' = 'set'): [string, Record<string, unknown>] => ['action.setVariable', { variable: v.id, op, value }];
export const clearVar = (v: Variable): [string, Record<string, unknown>] => ['action.setVariable', { variable: v.id, op: 'clear' }];
export const toggleVar = (v: Variable): [string, Record<string, unknown>] => ['action.setVariable', { variable: v.id, op: 'toggle' }];
export const go = (to: Artboard): [string, Record<string, unknown>] => ['action.artboard', { artboard: to.id, transition: 'fade', duration: 250 }];
export const announce = (expr: string): [string, Record<string, unknown>] => ['action.announce', { text: expr, politeness: 'polite' }];

/** A hero page with its Start button, the way every starter opens. */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string, label = 'Start'): { page: Artboard; start: SceneNode } {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle });
  const start = button(ctx, 'Start button', label, 48, page.height * 0.42 + 190, 200);
  page.children.push(start);
  return { page, start };
}

/** A small caption in the muted colour, e.g. under a card. */
export const note = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, width: number, extra: Record<string, unknown> = {}) =>
  text(ctx, name, value, x, y, width, { fontSize: 15, color: ctx.L.muted, ...extra });

/** A panel: a frame on the warm grey surface that its children sit in. */
export function panel(ctx: BrandedCtx, name: string, x: number, y: number, width: number, height: number, children: SceneNode[] = [], extra: Record<string, unknown> = {}): FrameNode {
  return createNode('frame', { name, x, y, width, height, cornerRadius: 16, fill: solid(ctx.L.surface), stroke: null, clip: false, children, ...extra }) as FrameNode;
}

/** Hide-or-show and disable by an expression: a binding is all a layer needs. */
export const bind = <T extends SceneNode>(n: T, bindings: Record<string, string>): T => {
  n.bindings = { ...(n.bindings ?? {}), ...bindings };
  return n;
};

/**
 * The question kit builds with the toolbox's plain look. Brings a kit frame into the brand: pill buttons, rounder corners, and
 * the input boxes on tokens (their factory defaults are plain colours).
 */
export function brandQuestionFrame(ctx: BrandedCtx, frame: FrameNode): void {
  frame.cornerRadius = 16;
  walk(frame.children, (n) => {
    if (n.type === 'button') {
      n.cornerRadius = 22;
      n.fontWeight = 600;
    }
    //The kit's orange and muted small text on the grey card is too faint
    if (n.type === 'text' && (n.questionPart === 'score' || n.questionPart === 'blankAnswer')) n.color = ctx.L.text;
    if (n.type === 'input') Object.assign(n, lookDefaults(ctx.project, 'input'), { cornerRadius: 10 });
    if (n.type === 'text' || n.type === 'button' || n.type === 'input') n.fontFamily = BRAND_FONT;
  });
}

export { stroke };
