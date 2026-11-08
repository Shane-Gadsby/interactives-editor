/** Small pieces the drag set's starters share: hero and result pages, text in a box, and the pass that dresses a question kit frame in the brand. Variables and the graph builders are in ../../graph-kit.ts (re-exported here). */
import { walk, type Artboard, type FrameNode, type SceneNode, type TextNode, type Variable } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { partOf } from '../../../question-kit';
import { BRAND_FONT } from '../../looks';
import { brandedPage, button, solid, stroke, text, type BrandedCtx } from '../../kit';
import { click, goNext, graph, type ActionStep } from '../../graph-kit';

export { addVar, goButton, join, put, seq } from '../../graph-kit';

/** Text in a fixed box, centred up and down (labels on cards, numbers on spots). */
export const boxText = (ctx: BrandedCtx, name: string, value: string, x: number, y: number, w: number, h: number, extra: Partial<TextNode> = {}): TextNode =>
  text(ctx, name, value, x, y, w, { height: h, autoSize: 'none', verticalAlign: 'middle', decorative: true, ...extra });

/** An expression string literal for a token reference or any other text. */
export const lit = (s: string): string => JSON.stringify(s);

/** Put these variables back to their starting values (the Reset variables node), for a flow's `run(...)`. */
export const resetVars = (...vars: Variable[]): ActionStep => ['action.resetVariables', { variables: vars.map((v) => v.id) }];

/** The first page: gradient hero with the title, one line, and a Start button that goes on to the next page (see `startNext`). */
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

/** Go to the next page in the project's order when `btn` is pressed (a button, or any layer): nothing to rewire when a page is added or moved. */
export function goNextOn(page: Artboard, btn: SceneNode, note = 'Next page'): void {
  const g = graph(page);
  g.run(click(g, btn, note), goNext());
}

/**
 * Brings a question kit frame into the brand: the kit builds with the plain toolbox look, so this sets the card (surface, round
 * corners, `pad` and `gap` inside), pill buttons (Check answer in the button colour, the others outlined), Open Sans, and the input
 * boxes on tokens. It changes the look of the layers the kit made and nothing about what they are, so the question still syncs.
 */
export function dressQuestion(ctx: BrandedCtx, frame: FrameNode, width: number, o: { pad?: number; gap?: number } = {}): void {
  const { L } = ctx;
  frame.width = width;
  frame.cornerRadius = 16;
  frame.fill = solid(L.surface);
  const pad = o.pad ?? 16;
  frame.layout = { ...frame.layout!, padding: { top: pad, right: 24, bottom: pad, left: 24 }, gap: o.gap ?? 10 };
  walk(frame.children, (n: SceneNode) => {
    if (n.type === 'text' || n.type === 'button') n.fontFamily = BRAND_FONT;
    if (n.type === 'input') Object.assign(n, lookDefaults(ctx.project, 'input'), { cornerRadius: 10, fontFamily: BRAND_FONT });
    if (n.type === 'button') {
      //(a pill, the small hint button, keeps to its own height)
      n.cornerRadius = Math.min(22, n.height / 2);
      n.fontWeight = 600;
      if (partOf(n) === 'check') {
        n.fill = solid(L.button);
        n.color = L.onButton;
      } else {
        n.fill = solid(L.background);
        n.color = L.text;
        n.stroke = stroke(L.border);
      }
    }
    //The kit's muted and orange small print on the grey card is too faint
    if (n.type === 'text' && (partOf(n) === 'score' || partOf(n) === 'blankAnswer' || partOf(n) === 'catAnswer')) n.color = L.text;
  });
}

/** Lay a tray of draggable chips out `cols` to a row (the kit does three), `w` by `h` with `gap` between, and size the tray to fit. */
export function retray(tray: SceneNode, cols: number, w: number, h: number, gap = 12): void {
  const kids = (tray as FrameNode).children;
  kids.forEach((c, k) => {
    c.x = (k % cols) * (w + gap);
    c.y = Math.floor(k / cols) * (h + gap);
    c.width = w;
    c.height = h;
  });
  tray.width = cols * (w + gap) - gap;
  tray.height = Math.max(h, Math.ceil(kids.length / cols) * (h + gap) - gap);
}
