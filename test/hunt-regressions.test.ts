//Bugs found by the randomised hunts (artboard-view-fuzz, live-converge mixed edits, paint-order-model), each pinned down on its own.
import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type RectNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { exportLottie } from '../src/lib/lottie-export';

describe('ungrouping a layer takes its animation with it', () => {
  it('drops the tracks that animated the group, as deleting it does', () => {
    const p = createProject('T');
    const a = createNode('rect', { name: 'a' });
    const b = createNode('rect', { name: 'b' });
    const g = createNode('group', { name: 'g', children: [a, b] as never });
    p.artboards[0].children.push(g);
    const key = (t: number) => ({ id: `k${t}`, t, value: t / 1000, ease: 'linear' as const });
    p.artboards[0].timelines.push({
      id: 't',
      name: 't',
      duration: 1000,
      loop: 'once',
      autoplay: false,
      speed: 1,
      tracks: [
        { id: 'on-group', nodeId: g.id, prop: 'opacity', keys: [key(0), key(1000)] },
        { id: 'on-child', nodeId: a.id, prop: 'opacity', keys: [key(0), key(1000)] },
      ],
    });
    const s = new EditorStore(p);
    s.select([g.id]);
    s.ungroupSelection();
    const ab = s.get().project.artboards[0];
    expect(ab.children.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(ab.timelines[0].tracks.map((t) => t.id)).toEqual(['on-child']);
    // one undo step: everything comes back together
    s.undo();
    expect(s.get().project.artboards[0].timelines[0].tracks.map((t) => t.id)).toEqual(['on-group', 'on-child']);
  });
});

describe('a layer another editor sent keeps its paint order as it was written', () => {
  it('does not repair the order against paints that are still on their way', () => {
    const p = createProject('T');
    const r = createNode('rect', { name: 'r', fill: { type: 'solid', color: '#111111' }, stroke: null });
    p.artboards[0].children.push(r);
    const s = new EditorStore(p);
    const path = ['artboards', { i: p.artboards[0].id }, 'children', { i: r.id }];
    // their order names a stroke that arrives in the next batch
    s.applyRemote([{ t: 'set', p: [...path, 'paintOrder'], v: ['stroke', 'fill'] }]);
    s.applyRemote([{ t: 'set', p: [...path, 'strokes'], v: [{ paint: { type: 'solid', color: '#222222' }, width: 2 }] }]);
    const n = s.get().project.artboards[0].children[0] as RectNode & { paintOrder?: string[] };
    expect(n.paintOrder).toEqual(['stroke', 'fill']);
  });
});

describe('a shape with no first fill but a list of them', () => {
  it('exports the animation of each fill to Lottie, by the path it really has', () => {
    const p = createProject('T');
    const ab = createArtboard({ name: 'A', width: 100, height: 100 });
    const e = createNode('ellipse', { width: 20, height: 20, fill: null, fills: [{ type: 'solid', color: '#ff0000' }, { type: 'solid', color: '#00ff00' }] });
    ab.children.push(e);
    ab.timelines.push({
      id: 't',
      name: 't',
      duration: 1000,
      loop: 'once',
      autoplay: false,
      speed: 1,
      tracks: [{ id: 'tr', nodeId: e.id, prop: 'fills.1.color', keys: [{ id: 'a', t: 0, value: '#00ff00', ease: 'linear' }, { id: 'b', t: 1000, value: '#0000ff', ease: 'linear' }] }],
    });
    p.artboards = [ab];
    const { json } = exportLottie(p, ab, { timelineId: 't', bytesFor: () => null });
    const fills = (json.layers as { shapes: { ty: string; c?: { a: number } }[] }[])[0].shapes.filter((i) => i.ty === 'fl');
    // front-most first: the second fill is the animated one
    expect(fills.map((f) => f.c?.a)).toEqual([1, 0]);
  });
});
