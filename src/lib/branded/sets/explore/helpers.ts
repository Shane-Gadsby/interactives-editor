/**
 * Small helpers the explore starters share: the hero page's buttons, a smaller button for page corners and a box-less frame. The
 * interaction graph builders are in ../../graph-kit.ts and the native pieces (stacks, progress, dialogs) in ../../parts.ts.
 */
import { createNode, type Artboard, type SceneNode } from 'interactives-player';
import { button, type BrandedCtx } from '../../kit';
import { click, go, goNext, graph } from '../../graph-kit';

/**
 * The hero page's buttons, one under the subtitle each (the first is the primary one). `to: 'next'` goes to the next page in the
 * project's order (Go to artboard, Next), so nothing is rewired when a page is added or moved.
 */
export function heroButtons(ctx: BrandedCtx, hero: Artboard, list: { name: string; label: string; to: Artboard | 'next'; width?: number }[]) {
  let x = 48;
  const y = hero.height * 0.42 + 150;
  const g = graph(hero);
  list.forEach((b, i) => {
    const width = b.width ?? 200;
    const btn = button(ctx, b.name, b.label, x, y, width, i === 0);
    hero.children.push(btn);
    g.run(click(g, btn, 'Pages'), b.to === 'next' ? goNext() : go(b.to));
    x += width + 16;
  });
}

/** A button's text colour and fill come from the kit; a smaller one for page corners. */
export const small = <T extends SceneNode>(b: T, height = 40): T => Object.assign(b, { height, cornerRadius: height / 2 });

/** A frame with no box (just a place to group layers that clicks and keys belong to). */
export const group = (name: string, x: number, y: number, width: number, height: number, extra: Record<string, unknown> = {}) =>
  createNode('frame', { name, x, y, width, height, fill: null, stroke: null, clip: false, ...extra } as never);
