/** Small pieces the drag set's starters share: variables, hero and result pages, and short interaction chains. */
import { uid, type Artboard, type LogicNode, type Project, type SceneNode, type TextNode, type Variable } from 'interactives-player';
import { brandedPage, button, chain, edge, gnode, text, type BrandedCtx } from '../../kit';

export const addVar = (p: Project, name: string, type: Variable['type'], initial: Variable['initial']): Variable => {
  const v = { id: uid('v'), name, type, initial } as Variable;
  p.variables.push(v);
  return v;
};

/** Text in a fixed box, centred up and down (labels on cards, numbers on spots). */
export const boxText = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, w: number, h: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, w, { height: h, autoSize: 'none', verticalAlign: 'middle', decorative: true, ...extra });

/** An expression string literal for a token reference or any other text. */
export const lit = (s: string): string => JSON.stringify(s);

/**
 * A row of the interaction graph: nodes side by side at height `y`, each wired to the next. A spec is `[kind, params, note?]`.
 * Returns the nodes so a flow can be joined to another.
 */
export function seq(ab: Artboard, y: number, ...specs: [string, Record<string, unknown>, string?][]): LogicNode[] {
  const nodes = specs.map(([kind, params, note], i) => gnode(kind, i * 260, y, params, note));
  ab.logic.nodes.push(...nodes);
  ab.logic.edges.push(...chain(...nodes));
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

/** The first page: gradient hero with the title, one line, and a Start button that goes to `to` (set later with `wireStart`). */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string): { page: Artboard; start: SceneNode } {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle, name: 'Start' });
  //A white pill reads on every colourway's gradient
  const start = button(ctx, 'Start button', 'Start', 48, page.height * 0.42 + 150, 180, false);
  page.children.push(start);
  return { page, start };
}

/** The last page: gradient, a result line under the title, and a button back to the activity. */
export function endPage(ctx: BrandedCtx, title: string, resultText: string, again: string): { page: Artboard; again: SceneNode; result: TextNode } {
  const page = brandedPage(ctx, title, { kind: 'end', name: 'Results' });
  const result = text(ctx, 'Result text', resultText, 100, page.height / 2 + 80, page.width - 200, { fontSize: 22, fontWeight: 600, align: 'center', color: ctx.L.onGradient });
  const btn = button(ctx, 'Try again button', again, (page.width - 180) / 2, page.height / 2 + 140, 180, false);
  page.children.push(result, btn);
  return { page, again: btn, result };
}
