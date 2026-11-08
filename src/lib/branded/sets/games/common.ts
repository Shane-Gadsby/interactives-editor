//Small helpers the games set shares: the graph builders and one line actions are in ../../graph-kit.ts, the hero page is here.
import { brandedPage, type BrandedCtx } from '../../kit';
import { darkButton } from '../../graph-kit';

export { Graph, addTo, addVar, announce, bind, darkButton, emit, focus, go, lit, set, spreadPages } from '../../graph-kit';

/** The hero page every starter opens with: title, one line, and a Start button that goes to `to` (wired by the caller with the page's graph). */
export function heroPage(ctx: BrandedCtx, title: string, subtitle: string, label = 'Start') {
  const page = brandedPage(ctx, title, { kind: 'hero', subtitle });
  const start = darkButton(ctx, 'Start', label, 48, page.height * 0.42 + 190, 200);
  page.children.push(start);
  return { page, start };
}
