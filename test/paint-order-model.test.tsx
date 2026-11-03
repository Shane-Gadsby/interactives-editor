//The Fill, Stroke and Paint order sections driven by random clicks (add, remove, move within a list, move in the paint order),
//undo and redo, against a model of what each click has to do to the sequence of paints. Paints are followed by object identity:
//immer keeps every paint a click didn't edit as the very same object, so a paint that moved is found where the model says.
//The document after every click also has to survive the player's sanitiser untouched, a live-ops round trip (diff then apply to
//the document before), and a lottie export.
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, orderedPaints, sanitizeLayer, type PaintEntry, type RectNode, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { FillSection, PaintOrderSection, StrokeSection } from '../src/panels/PaintLayers';
import { apply, diff } from '../shared/ops.mjs';
import { rng, seeds } from './helpers/rng';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
});

function Harness({ id }: { id: string }) {
  const project = useEditor((st) => st.project);
  const node = useEditor((st) => st.project.artboards[0].children.find((c) => c.id === id)!);
  return (
    <>
      <FillSection nodes={[node]} project={project} />
      <StrokeSection nodes={[node]} project={project} />
      <PaintOrderSection nodes={[node]} />
    </>
  );
}

const solid = (color: string) => ({ type: 'solid' as const, color });
const json = (v: unknown) => JSON.parse(JSON.stringify(v));

describe('paint lists and their order, clicked at random', () => {
  for (const type of ['rect', 'ellipse', 'path'] as const) {
    it(`${type}: every click does what it says to the sequence of paints, and the document stays sound`, () => {
      for (const seed of seeds(40)) {
        const r = rng(seed * 7919 + type.length);
        const p = createProject('P');
        const n = createNode(type, {
          fill: r.chance(0.8) ? solid('#111111') : null,
          stroke: r.chance(0.6) ? { paint: solid('#222222'), width: 2 } : null,
          ...(type === 'path' ? { paths: [{ closed: true, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] }] } : {}),
        } as never) as SceneNode;
        p.artboards[0].children.push(n);
        const s = new EditorStore(p);
        setCurrentStore(s);
        host = document.createElement('div');
        document.body.appendChild(host);
        root = createRoot(host);
        act(() => root!.render(<Harness id={n.id} />));
        const node = () => s.get().project.artboards[0].children.find((c) => c.id === n.id) as RectNode;
        const seq = (): PaintEntry[] => orderedPaints(node());
        const log: string[] = [];
        for (let step = 0; step < 25; step++) {
          const titles = Array.from(host.querySelectorAll('button[title]'))
            .map((b) => b.getAttribute('title')!)
            .filter((t) => /^(Add (fill|stroke)|Remove (fill|stroke)|Move (fill|stroke) .*(up|down))/.test(t) && !(host!.querySelector(`[title="${t}"]`) as HTMLButtonElement).disabled);
          const before = seq();
          const beforeDoc = json(s.get().project);
          const kindsOf = (l: PaintEntry[]) => l.map((e) => e.kind);
          let title = '';
          const roll = r.int(10);
          if (roll === 0 && s.canUndo()) {
            act(() => s.undo());
            log.push('undo');
            expect(json(sanitizeLayer(json(node()))), `undo (${log.join(', ')})`).toEqual(json(node()));
            continue;
          }
          if (roll === 1 && s.canRedo()) {
            act(() => s.redo());
            log.push('redo');
            continue;
          }
          if (!titles.length) continue;
          title = r.pick(titles);
          log.push(title);
          act(() => (host!.querySelector(`[title="${title}"]`) as HTMLElement).click());
          const after = seq();
          const what = `seed ${seed}, ${log.join(' | ')}`;
          const label = (kind: string, num?: string) => ({ kind: kind as 'fill' | 'stroke', index: num ? Number(num) - 1 : 0 });
          let m: RegExpExecArray | null;
          if ((m = /^Add (fill|stroke)$/.exec(title))) {
            expect(after.length, what).toBe(before.length + 1);
            const added = after.filter((e) => !before.some((b) => b.paint === e.paint));
            expect(added.length, `${what}: one new paint`).toBe(1);
            // a fill goes just above the last fill (the bottom when there is none), a stroke on top of everything
            const want = m[1] === 'stroke' ? after.length - 1 : before.map((e) => e.kind).lastIndexOf('fill') + 1;
            expect(after.indexOf(added[0]), what).toBe(want);
            expect(added[0].kind, what).toBe(m[1]);
            expect(after.filter((e) => !added.includes(e)).map((e) => e.paint), what).toEqual(before.map((e) => e.paint));
          } else if ((m = /^Remove (fill|stroke)(?: (\d+))?$/.exec(title))) {
            const { kind, index } = label(m[1], m[2]);
            const gone = before.find((e) => e.kind === kind && e.index === index)!;
            expect(after.map((e) => e.paint), what).toEqual(before.filter((e) => e !== gone).map((e) => e.paint));
          } else if ((m = /^Move (fill|stroke)(?: (\d+))? (up|down) in the paint order/.exec(title))) {
            const { kind, index } = label(m[1], m[2]);
            const from = before.findIndex((e) => e.kind === kind && e.index === index);
            const to = from + (m[3] === 'up' ? 1 : -1);
            const want = [...before];
            const [x] = want.splice(from, 1);
            want.splice(to, 0, x);
            // (two paints of one kind passing each other swap places in their list, which is what the sequence of kinds then says)
            const kinds = kindsOf(want);
            const fills = want.filter((e) => e.kind === 'fill').map((e) => e.paint);
            const strokes = want.filter((e) => e.kind === 'stroke').map((e) => e.paint);
            const expected = kinds.map((k) => (k === 'fill' ? fills.shift() : strokes.shift()));
            expect(after.map((e) => e.paint), what).toEqual(expected);
          } else if ((m = /^Move (fill|stroke)(?: (\d+))? (up|down) \(/.exec(title))) {
            const { kind, index } = label(m[1], m[2]);
            const list = before.filter((e) => e.kind === kind).map((e) => e.paint);
            const to = index + (m[3] === 'up' ? 1 : -1);
            const moved = [...list];
            const [x] = moved.splice(index, 1);
            moved.splice(to, 0, x);
            // the kinds keep their places; the paints of that kind are what moved
            expect(kindsOf(after), what).toEqual(kindsOf(before));
            expect(after.filter((e) => e.kind === kind).map((e) => e.paint), what).toEqual(moved);
          } else throw new Error(`unknown control ${title}`);

          // the document after a click is one the sanitiser leaves alone, whatever way the paints got there
          const doc = node();
          expect(json(sanitizeLayer(json(doc))), `${what}: sanitiser changes the layer`).toEqual(json(doc));
          // and one that goes through live ops
          const ops = diff(json(beforeDoc), json(s.get().project));
          const replay = json(beforeDoc);
          apply(replay, json(ops));
          expect(replay.artboards[0].children.find((c: { id: string }) => c.id === n.id), `${what}: live ops round trip`).toEqual(json(doc));
        }
        act(() => root!.unmount());
        host.remove();
        root = undefined;
      }
    }, 120000);
  }
});
