import { describe, expect, it } from 'vitest';
import { apply, createNode, createProject, nodeMatrix, type Project } from 'interactives-player';
import { EditorStore, keyTime, valueAt } from '../src/store/store';
import { hitTest, locate, selectionBounds } from '../src/store/doc';
import { placeBox, resizeBox } from '../src/canvas/transform';

function setup() {
  const p: Project = createProject('T');
  const a = createNode('rect', { name: 'A', x: 10, y: 10, width: 100, height: 50 });
  const b = createNode('ellipse', { name: 'B', x: 200, y: 100, width: 40, height: 40 });
  p.artboards[0].children.push(a, b);
  return { s: new EditorStore(p), a, b };
}

describe('EditorStore', () => {
  it('moves layers to another artboard, keeping their canvas position and dropping their keys', () => {
    const { s, a, b } = setup();
    const ab1 = s.artboard()!;
    s.update((d) => {
      d.artboards[0].timelines.push({ id: 't1', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ nodeId: a.id, property: 'x', keys: [] }] } as never);
    });
    s.addArtboard({ canvasX: ab1.canvasX + 1000, canvasY: ab1.canvasY + 50 });
    const ab2 = s.get().project.artboards[1];
    s.set({ activeArtboardId: ab1.id });
    s.moveToArtboard([a.id], ab2.id);
    const p = s.get().project;
    expect(p.artboards[0].children.map((n) => n.id)).toEqual([b.id]);
    const moved = p.artboards[1].children.find((n) => n.id === a.id)!;
    expect([moved.x, moved.y]).toEqual([10 - 1000, 10 - 50]);
    expect(p.artboards[0].timelines[0].tracks).toHaveLength(0);
    expect(s.get().activeArtboardId).toBe(ab2.id);
    s.undo();
    expect(s.get().project.artboards[0].children.map((n) => n.id)).toEqual([a.id, b.id]);
  });

  it('coalesces a drag into one undo step and restores on undo/redo', () => {
    const { s, a } = setup();
    for (let x = 11; x <= 20; x++) s.setProps([a.id], { x }, 'move');
    s.commit();
    expect(s.artboard()!.children[0].x).toBe(20);
    s.undo();
    expect(s.artboard()!.children[0].x).toBe(10);
    s.redo();
    expect(s.artboard()!.children[0].x).toBe(20);
  });

  it('groups siblings keeping their positions, and ungroups back', () => {
    const { s, a, b } = setup();
    s.select([a.id, b.id]);
    s.groupSelection();
    const ab = s.artboard()!;
    expect(ab.children).toHaveLength(1);
    const g = ab.children[0];
    expect(g.type).toBe('group');
    expect([g.x, g.y, g.width, g.height]).toEqual([10, 10, 230, 130]);
    expect(selectionBounds(ab, [b.id])).toEqual({ x: 200, y: 100, width: 40, height: 40 });
    s.ungroupSelection();
    const after = s.artboard()!.children;
    expect(after.map((n) => [n.name, n.x, n.y])).toEqual([
      ['A', 10, 10],
      ['B', 200, 100],
    ]);
  });

  it('records keyframes instead of base values while recording a timeline', () => {
    const { s, a } = setup();
    s.addTimeline();
    s.set({ recording: true, playhead: 500, bottomTab: 'timeline' });
    s.setProps([a.id], { x: 300 });
    const ab = s.artboard()!;
    expect(locate(ab, a.id)!.node.x).toBe(10);
    const track = ab.timelines[0].tracks[0];
    expect(track.prop).toBe('x');
    expect(track.keys.map((k) => [k.t, k.value])).toEqual([[500, 300]]);
  });

  it('keys the value shown at the playhead, not the layer\'s own value', () => {
    const { s, a } = setup();
    s.addTimeline();
    s.set({ playhead: 0 });
    s.keyCurrent(a.id, 'x');
    s.set({ recording: true, playhead: 1000, bottomTab: 'timeline' });
    s.setProps([a.id], { x: 110 });
    s.set({ recording: false, playhead: 500 });
    const tl = s.timeline()!;
    const shown = valueAt(tl, locate(s.artboard()!, a.id)!.node, 'x', 500) as number;
    expect(shown).toBeGreaterThan(10);
    expect(shown).toBeLessThan(110);
    s.keyCurrent(a.id, 'x');
    expect(s.timeline()!.tracks[0].keys.map((k) => [k.t, k.value])).toEqual([[0, 10], [500, shown], [1000, 110]]);
  });

  it('turns an edit of an animated property into a key at the playhead, without Record', () => {
    const { s, a } = setup();
    s.addTimeline();
    s.set({ playhead: 0, bottomTab: 'timeline' });
    s.keyCurrent(a.id, 'x');
    s.set({ playhead: 400 });
    s.setProps([a.id], { x: 70, y: 30 });
    const ab = s.artboard()!;
    const node = locate(ab, a.id)!.node;
    // x is animated, so the edit is a key; y isn't, so it's the layer's own value as before
    expect(node.x).toBe(10);
    expect(node.y).toBe(30);
    expect(ab.timelines[0].tracks.map((t) => t.prop)).toEqual(['x']);
    expect(ab.timelines[0].tracks[0].keys.map((k) => [k.t, k.value])).toEqual([[0, 10], [400, 70]]);
    // Off the timeline tab the layer's own value is what's edited
    s.set({ bottomTab: null });
    s.setProps([a.id], { x: 15 });
    expect(locate(s.artboard()!, a.id)!.node.x).toBe(15);
  });

  it('puts keys on the start of the frame when the timeline reads whole frames', () => {
    const { s, a } = setup();
    s.addTimeline();
    s.updateTimeline((d) => {
      d.fps = 24;
      d.snap = true;
    });
    const tl = s.timeline()!;
    expect(keyTime(tl, 50)).toBe(41);
    expect(keyTime(tl, 125)).toBe(125);
    expect(keyTime({ duration: 1000 }, 50.4)).toBe(50);
    s.set({ playhead: 50, bottomTab: 'timeline' });
    s.keyCurrent(a.id, 'opacity');
    // still the same frame: the same key, not a second one a few ms later
    s.set({ recording: true, playhead: 70 });
    s.setProps([a.id], { opacity: 0.5 });
    expect(s.timeline()!.tracks[0].keys.map((k) => [k.t, k.value])).toEqual([[41, 0.5]]);
  });

  it('keys every layer it is given, in one undo step', () => {
    const { s, a, b } = setup();
    s.addTimeline();
    s.keyCurrent([a.id, b.id], 'opacity');
    expect(s.timeline()!.tracks.map((t) => t.nodeId)).toEqual([a.id, b.id]);
    s.undo();
    expect(s.timeline()!.tracks).toHaveLength(0);
  });

  it('keys a group\'s draw order and solo child, and records order changes', () => {
    const { s, a, b } = setup();
    s.select([a.id, b.id]);
    s.groupSelection();
    const g = s.artboard()!.children[0];
    s.addTimeline();
    s.set({ playhead: 0 });
    s.keyCurrent(g.id, 'drawOrder');
    s.keyCurrent(g.id, 'solo.active');
    s.set({ recording: true, playhead: 400, bottomTab: 'timeline' });
    s.setProps([g.id], { drawOrder: [b.id, a.id] });
    const tracks = s.artboard()!.timelines[0].tracks;
    expect(tracks.find((t) => t.prop === 'drawOrder')!.keys.map((k) => [k.t, k.value])).toEqual([[0, [a.id, b.id]], [400, [b.id, a.id]]]);
    expect(tracks.find((t) => t.prop === 'solo.active')!.keys[0].value).toBe(a.id);
    // The document itself is untouched while recording
    expect((locate(s.artboard()!, g.id)!.node as { drawOrder?: unknown }).drawOrder).toBeUndefined();
  });

  it('deletes the selection and its timeline tracks', () => {
    const { s, a } = setup();
    s.addTimeline();
    s.keyCurrent(a.id, 'opacity');
    s.select([a.id]);
    s.deleteSelection();
    const ab = s.artboard()!;
    expect(ab.children.map((n) => n.name)).toEqual(['B']);
    expect(ab.timelines[0].tracks).toHaveLength(0);
  });

  it('duplicates with new ids and unique names', () => {
    const { s, a } = setup();
    s.select([a.id]);
    s.duplicateSelection();
    const names = s.artboard()!.children.map((n) => n.name);
    expect(names).toEqual(['A', 'A 2', 'B']);
    expect(new Set(s.artboard()!.children.map((n) => n.id)).size).toBe(3);
  });
});

describe('geometry helpers', () => {
  it('hit-tests the topmost layer, respecting rotation', () => {
    const { s, a } = setup();
    s.setProps([a.id], { rotation: 90 });
    const ab = s.artboard()!;
    // Rotated 90° about its centre (60, 35): the box now spans x 35..85, y -15..85
    expect(hitTest(ab, 60, 80).map((n) => n.name)).toEqual(['A']);
    expect(hitTest(ab, 100, 30)).toEqual([]);
  });

  it('resizes from a corner, from the centre and with aspect locked', () => {
    expect(resizeBox(100, 50, 'se', 150, 100, false, false)).toEqual({ l: 0, t: 0, w: 150, h: 100 });
    expect(resizeBox(100, 50, 'e', 120, 25, false, true)).toEqual({ l: -20, t: 0, w: 140, h: 50 });
    expect(resizeBox(100, 50, 'se', 200, 60, true, false)).toEqual({ l: 0, t: 0, w: 200, h: 100 });
  });

  it('keeps the opposite corner fixed for a rotated resize', () => {
    const n = createNode('rect', { x: 0, y: 0, width: 100, height: 100, rotation: 45 });
    const placed = placeBox(n, 0, 0, 200, 100);
    const before = apply(nodeMatrix(n), 0, 0);
    const after = apply(nodeMatrix({ ...n, ...placed }), 0, 0);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(placed.width).toBe(200);
  });
});
