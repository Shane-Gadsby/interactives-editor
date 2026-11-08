/**
 * Small helpers the assessment starters share: a hero page with its Start button, a panel, and the pass at the end that makes the
 * question kit's frames sit in the brand. Variables and the interaction graph builders are in ../../graph-kit.ts (re-exported here).
 */
import { createNode, walk, type Artboard, type FrameNode, type SceneNode } from 'interactives-player';
import { lookDefaults } from '../../../themes';
import { BRAND_FONT } from '../../looks';
import { brandedPage, button, solid, stroke, text, type BrandedCtx } from '../../kit';

export { addVar as variable, after, announce, bind, clearVar, click, go, goNext, goPrevious, graph, setVar, toggleVar } from '../../graph-kit';

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
