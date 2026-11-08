/**
 * Small helpers the explore starters share: variables, the interaction graph laid out in rows, page navigation and the
 * hero page's buttons. Nothing here paints anything, so every colour still comes from the kit's tokens.
 */
import { createNode, type Artboard, type LogicNode, type SceneNode, type Variable, type VariableType } from 'interactives-player';
import { button, gnode, type BrandedCtx } from '../../kit';
import { Flow, addVar } from '../../graph-kit';

export const variable = (ctx: BrandedCtx, name: string, type: VariableType, initial: number | string | boolean): Variable => addVar(ctx.project, name, type, initial);

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

export { Flow } from '../../graph-kit';

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
