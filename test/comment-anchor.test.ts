//Where a review comment is pinned and how the pin finds its place again: the layer under the click (the deepest), the
//spot in that layer's own coordinates, following the layer when it moves, scales or rotates, and falling back to the
//saved point when the layer or the artboard is gone.
import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project } from 'interactives-player';
import { anchorAt, pinPlace, placeLabel } from '../src/lib/comment-anchor';
import type { Thread } from '../shared/comments.mjs';

function make(): { p: Project; rect: string; inner: string; group: string } {
  const p = createProject('Review');
  const ab = p.artboards[0];
  ab.id = 'ab1';
  ab.name = 'Main';
  ab.width = 800;
  ab.height = 600;
  const rect = createNode('rect', { name: 'Panel', x: 100, y: 100, width: 200, height: 100 });
  const group = createNode('group', { name: 'Card', x: 400, y: 300, width: 200, height: 200, children: [] });
  const inner = createNode('rect', { name: 'Badge', x: 10, y: 20, width: 50, height: 50 });
  (group as unknown as { children: unknown[] }).children.push(inner);
  ab.children = [rect, group];
  return { p, rect: rect.id, inner: inner.id, group: group.id };
}
const thread = (anchor: Thread['anchor']): Pick<Thread, 'anchor'> => ({ anchor });
const edit = (p: Project, id: string, set: Record<string, number>): Project => {
  const c = structuredClone(p);
  const find = (list: any[]): any => {
    for (const n of list) {
      if (n.id === id) return n;
      const f = n.children && find(n.children);
      if (f) return f;
    }
  };
  Object.assign(find(c.artboards[0].children), set);
  return c;
};

describe('anchorAt', () => {
  it('pins to the layer under the click, with the spot in the layer own coordinates', () => {
    const { p, rect } = make();
    const a = anchorAt(p, 'ab1', 150, 120)!;
    expect(a.anchor).toEqual({ artboardId: 'ab1', layerId: rect, lx: 50, ly: 20, x: 150, y: 120 });
    expect(a.context).toEqual({ artboard: 'Main', layer: 'Panel' });
  });

  it('takes the deepest layer inside a group', () => {
    const { p, inner } = make();
    const a = anchorAt(p, 'ab1', 420, 330)!;
    expect(a.anchor.layerId).toBe(inner);
    expect(a.anchor).toMatchObject({ lx: 10, ly: 10 });
  });

  it('pins to the artboard point when nothing is there', () => {
    const { p } = make();
    expect(anchorAt(p, 'ab1', 700.04, 50.26)).toEqual({ anchor: { artboardId: 'ab1', layerId: null, x: 700, y: 50.3 }, context: { artboard: 'Main', layer: '' } });
  });

  it('says nothing for an artboard that is not there', () => {
    expect(anchorAt(make().p, 'nope', 1, 1)).toBeNull();
  });
});

describe('pinPlace', () => {
  it('is the saved point for a pin on the artboard', () => {
    expect(pinPlace(make().p, thread({ artboardId: 'ab1', layerId: null, x: 7, y: 8 }))).toEqual({ artboardId: 'ab1', x: 7, y: 8, detached: false, missing: false });
  });

  it('follows the layer when it moves', () => {
    const { p, rect } = make();
    const a = anchorAt(p, 'ab1', 150, 120)!.anchor;
    expect(pinPlace(p, thread(a))).toMatchObject({ x: 150, y: 120, detached: false });
    const moved = edit(p, rect, { x: 300, y: 400 });
    expect(pinPlace(moved, thread(a))).toMatchObject({ x: 350, y: 420, detached: false });
  });

  it('follows a layer inside a group that moves', () => {
    const { p, group, inner } = make();
    const a = anchorAt(p, 'ab1', 420, 330)!.anchor;
    expect(a.layerId).toBe(inner);
    expect(pinPlace(edit(p, group, { x: 0, y: 0 }), thread(a))).toMatchObject({ x: 20, y: 30 });
  });

  it('follows a layer that is scaled', () => {
    const { p, rect } = make();
    const a = anchorAt(p, 'ab1', 150, 120)!.anchor;
    const r = pinPlace(edit(p, rect, { scaleX: 2, scaleY: 2 }), thread(a));
    //the layer scales around its origin (the centre by default), so the spot moves out from the centre (200, 150)
    expect(r.x).toBeCloseTo(100, 5);
    expect(r.y).toBeCloseTo(90, 5);
  });

  it('stays where it was, flagged, when the layer has been deleted', () => {
    const { p } = make();
    const a = anchorAt(p, 'ab1', 150, 120)!.anchor;
    const gone = structuredClone(p);
    gone.artboards[0].children = [];
    expect(pinPlace(gone, thread(a))).toEqual({ artboardId: 'ab1', x: 150, y: 120, detached: true, missing: false });
  });

  it('is missing when the artboard is gone too', () => {
    const { p } = make();
    expect(pinPlace(p, thread({ artboardId: 'zzz', layerId: null, x: 1, y: 2 })).missing).toBe(true);
  });
});

describe('placeLabel', () => {
  it('uses the live names, and the saved ones once the layer or artboard is gone', () => {
    const { p, rect } = make();
    const t = { anchor: { artboardId: 'ab1', layerId: rect, lx: 1, ly: 1, x: 1, y: 1 }, ctx: { artboard: 'Old main', layer: 'Old panel' } } as Thread;
    expect(placeLabel(p, t)).toBe('Main › Panel');
    const gone = structuredClone(p);
    gone.artboards[0].children = [];
    expect(placeLabel(gone, t)).toBe('Main › Old panel');
    expect(placeLabel({ ...p, artboards: [] }, t)).toBe('Old main › Old panel');
    expect(placeLabel(null, { anchor: { artboardId: 'x', layerId: null, x: 0, y: 0 }, ctx: { artboard: '', layer: '' } } as Thread)).toBe('Deleted artboard');
  });
});
