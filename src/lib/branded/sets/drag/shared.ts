/** Small pieces the drag set's starters share: hero and result pages and text in a box. Variables and the graph builders are in ../../graph-kit.ts (re-exported here). */
import type { Artboard, SceneNode, TextNode } from 'interactives-player';
import { brandedPage, button, text, type BrandedCtx } from '../../kit';

export { addVar, goButton, join, put, seq } from '../../graph-kit';

/** Text in a fixed box, centred up and down (labels on cards, numbers on spots). */
export const boxText = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, w: number, h: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, w, { height: h, autoSize: 'none', verticalAlign: 'middle', decorative: true, ...extra });

/** An expression string literal for a token reference or any other text. */
export const lit = (s: string): string => JSON.stringify(s);

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
