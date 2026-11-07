//Fit artboard to selection: the artboard shrinks (or grows) to the chosen layers, which stay where they were on the canvas
import { describe, expect, it } from 'vitest';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

const build = () => {
  const p = createProject('Fit');
  const ab = p.artboards[0];
  ab.canvasX = 100;
  ab.canvasY = 50;
  ab.children.push(createNode('rect', { id: 'a', name: 'A', x: 40, y: 30, width: 100, height: 50 }), createNode('rect', { id: 'b', name: 'B', x: 200, y: 120, width: 60, height: 60 }), createNode('rect', { id: 'c', name: 'C', x: 500, y: 400, width: 20, height: 20 }));
  ab.timelines.push({ id: 't', name: 'T', duration: 1000, loop: false, tracks: [{ id: 'k', nodeId: 'a', prop: 'x', keys: [{ id: 'k1', t: 0, value: 40, ease: 'linear' }, { id: 'k2', t: 1000, value: 90, ease: 'linear' }] }] } as never);
  const s = new EditorStore(p);
  setCurrentStore(s);
  return s;
};

describe('fit artboard to selection', () => {
  it('sizes the artboard to the chosen layers and keeps every layer and keyframe where it was on the canvas, in one undo step', () => {
    const s = build();
    s.select(['a', 'b']);
    expect(s.fitArtboardToSelection()).toBe(true);
    const ab = s.artboard()!;
    expect([ab.width, ab.height, ab.canvasX, ab.canvasY]).toEqual([220, 150, 140, 80]);
    const at = (id: string) => ab.children.find((n) => n.id === id)!;
    expect([at('a').x, at('a').y, at('b').x, at('b').y, at('c').x, at('c').y]).toEqual([0, 0, 160, 90, 460, 370]);
    expect(ab.timelines[0].tracks[0].keys.map((k) => k.value)).toEqual([0, 50]);
    s.undo();
    expect(s.artboard()!.width).not.toBe(220);
    expect(s.artboard()!.children[0].x).toBe(40);
  });

  it('does nothing with nothing selected', () => {
    const s = build();
    s.select([]);
    expect(s.fitArtboardToSelection()).toBe(false);
  });
});
