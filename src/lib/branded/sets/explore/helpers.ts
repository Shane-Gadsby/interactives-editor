/**
 * Small helpers the explore starters share: variables, the interaction graph laid out in rows, page navigation and the
 * hero page's buttons. Nothing here paints anything, so every colour still comes from the kit's tokens.
 */
import { createNode, uid, type Artboard, type LogicEdge, type LogicNode, type SceneNode, type Variable, type VariableType } from 'interactives-player';
import { button, edge, gnode, type BrandedCtx } from '../../kit';

export const variable = (ctx: BrandedCtx, name: string, type: VariableType, initial: number | string | boolean): Variable => {
  const v: Variable = { id: uid('v'), name, type, initial };
  ctx.project.variables.push(v);
  return v;
};

/** Graph nodes, made without a position (a Flow places them). */
export const n = (kind: string, params: Record<string, unknown> = {}, note?: string): LogicNode => gnode(kind, 0, 0, params, note);
export const onClick = (target: SceneNode, note?: string) => n('event.pointer', { target: target.id, type: 'click' }, note);
export const onKey = (key: string, target?: SceneNode, note?: string) => n('event.key', { key, type: 'keydown', ...(target ? { target: target.id } : {}) }, note);
export const setVar = (v: Variable, value: string) => n('action.setVariable', { variable: v.id, op: 'set', value });
export const toggleVar = (v: Variable) => n('action.setVariable', { variable: v.id, op: 'toggle' });
export const ifNode = (condition: string) => n('logic.if', { condition });
export const announce = (expr: string) => n('action.announce', { text: expr, politeness: 'polite' });
export const focusOn = (target: SceneNode) => n('action.focus', { op: 'focus', target: target.id });
export const startOver = () => n('action.startOver');
export const wait = (ms: number) => n('action.delay', { ms });
export const goTo = (to: Artboard, transition = 'fade') => n('action.artboard', { artboard: to.id, transition, duration: 300 });

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

/** A button wired to go to another page. */
export function navButton(ctx: BrandedCtx, from: Artboard, name: string, label: string, to: Artboard, x: number, y: number, width = 200, primary = true, height?: number) {
  const b = button(ctx, name, label, x, y, width, primary);
  if (height) b.height = height;
  from.children.push(b);
  const flow = new Flow(from);
  flow.chain(onClick(b, 'Pages'), goTo(to));
  return b;
}

/** The hero page's buttons, one under the subtitle each (the first is the primary one). */
export function heroButtons(ctx: BrandedCtx, hero: Artboard, list: { name: string; label: string; to: Artboard; width?: number }[]) {
  let x = 48;
  const y = hero.height * 0.42 + 150;
  list.forEach((b, i) => {
    const width = b.width ?? 200;
    navButton(ctx, hero, b.name, b.label, b.to, x, y, width, i === 0);
    x += width + 16;
  });
}

/** A button's text colour and fill come from the kit; a smaller one for page corners. */
export const small = <T extends SceneNode>(b: T, height = 40): T => Object.assign(b, { height, cornerRadius: height / 2 });

/** A frame with no box (just a place to group layers that clicks and keys belong to). */
export const group = (name: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  createNode('frame', { name, x, y, width, height, fill: null, stroke: null, clip: false, ...extra } as never);
