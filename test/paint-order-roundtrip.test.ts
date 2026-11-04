//Fills and strokes in a random order, out to Lottie and back in: the paints that come back are the ones that went out, in the
//same order, whatever their number and mix (the order is in the shape, and the importer reads it the way the exporter wrote it).
import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, orderedPaints, walk, type EllipseNode, type Paint, type PaintKind, type Stroke } from 'interactives-player';
import { exportLottie } from '../src/lib/lottie-export';
import { importLottie } from '../src/lib/lottie-import';
import { rng, seeds } from './helpers/rng';

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#808080', '#ffffff'];

describe('Lottie export then import keeps the paints and their order', () => {
  it('for random shapes', () => {
    for (const seed of seeds(300)) {
      const r = rng(seed * 104729);
      const colors = [...COLORS].sort(() => r() - 0.5);
      const fills: Paint[] = Array.from({ length: 1 + r.int(3) }, () => ({ type: 'solid', color: colors.pop()! }));
      const strokes: Stroke[] = Array.from({ length: r.int(3) }, () => ({ paint: { type: 'solid', color: colors.pop()! }, width: 1 + r.int(5) }));
      const order: PaintKind[] = [...fills.map(() => 'fill' as const), ...strokes.map(() => 'stroke' as const)].sort(() => r() - 0.5);
      const e = createNode('ellipse', {
        width: 20,
        height: 20,
        fill: fills[0],
        fills: fills.length > 1 ? fills.slice(1) : undefined,
        stroke: strokes[0] ?? null,
        strokes: strokes.length > 1 ? strokes.slice(1) : undefined,
        paintOrder: order,
      } as never) as EllipseNode;
      const p = createProject('T');
      const ab = createArtboard({ name: 'A', width: 100, height: 100 });
      ab.children.push(e);
      p.artboards = [ab];
      const { json } = exportLottie(p, ab, { bytesFor: () => null });
      const { artboard } = importLottie(json as never);
      let dot!: EllipseNode;
      walk(artboard.children, (n) => void (n.type === 'ellipse' && (dot ??= n as EllipseNode)));
      const colorOf = (x: { kind: string; paint: unknown }) => (x.kind === 'stroke' ? (x.paint as Stroke).paint : (x.paint as Paint)) as { color: string };
      const sig = (n: EllipseNode) => orderedPaints(n).map((x) => `${x.kind}:${colorOf(x).color}`);
      expect(sig(dot), `seed ${seed}: order ${order.join()}`).toEqual(sig(e));
    }
  });
});
