import { describe, expect, it } from 'vitest';
import { apply, applyConstraints, createNode, createProject, sampleArtboard, worldMatrices, type BoneNode, type PathNode, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { locate } from '../src/store/doc';
import { autoWeightPoint, bindLayer, boneEndAt, boneFromDrag, boneGlyphs, bonesOf, normalizeInfluences, setPointWeights, skinOf, unbindLayer } from '../src/lib/rig';

/** An artboard with a strip of path points along y = 100, from x = 100 to x = 300. */
function setup() {
  const p: Project = createProject('Rig');
  const strip = createNode('path', {
    name: 'Strip',
    x: 100,
    y: 100,
    width: 200,
    height: 1,
    originX: 0,
    originY: 0,
    paths: [{ closed: false, points: [0, 50, 100, 150, 200].map((x) => ({ x, y: 0 })) }],
  });
  p.artboards[0].children.push(strip);
  return { s: new EditorStore(p), strip };
}

/** Draw two bones the way the Bone tool does: one along the strip's left half, a second from its tip. */
function drawChain(s: EditorStore) {
  const ab = s.artboard()!;
  const root = boneFromDrag(ab, null, { x: 100, y: 100 }, { x: 200, y: 100 });
  s.addNodes([root], { artboardId: ab.id });
  const fore = boneFromDrag(s.artboard()!, root.id, { x: 200, y: 100 }, { x: 300, y: 100 }, { chain: true });
  s.addNodes([fore], { parentId: root.id, artboardId: ab.id });
  return { root, fore };
}

describe('drawing bones', () => {
  it('makes a bone from a drag: base at the start, length and angle from the drag', () => {
    const { s } = setup();
    const b = boneFromDrag(s.artboard()!, null, { x: 50, y: 60 }, { x: 50, y: 160 });
    expect(b).toMatchObject({ type: 'bone', x: 50, y: 60, width: 100, rotation: 90, originX: 0, originY: 0 });
  });

  it('continues a chain from the tip: the child sits at its parent\'s tip and points where it was dragged', () => {
    const { s } = setup();
    const { root, fore } = drawChain(s);
    const ab = s.artboard()!;
    const f = locate(ab, fore.id)!.node as BoneNode;
    expect(f.x).toBe(root.width);
    expect(f.y).toBe(0);
    expect(f.rotation).toBe(0);
    // In a turned parent the child's angle is relative to it
    s.setProps([root.id], { rotation: 90 });
    const g = boneGlyphs(s.artboard()!.children);
    const tip = g.find((x) => x.id === fore.id)!.tip;
    expect(Math.round(tip.x)).toBe(100);
    expect(Math.round(tip.y)).toBe(300);
    // The new bone is the selection, inside its parent
    expect(locate(ab, fore.id)!.parent!.id).toBe(root.id);
    expect(s.get().selection).toEqual([fore.id]);
  });

  it('puts a bone drawn inside a moved, turned group in that group\'s space', () => {
    const { s } = setup();
    const group = createNode('group', { x: 200, y: 50, rotation: 90, originX: 0, originY: 0 });
    s.addNodes([group]);
    const b = boneFromDrag(s.artboard()!, group.id, { x: 200, y: 50 }, { x: 200, y: 150 });
    // (200, 50) is the group's origin, and straight down is along the group's x axis once turned 90 degrees
    expect(b).toMatchObject({ x: 0, y: 0, width: 100, rotation: 0 });
  });

  it('finds the tip near a point', () => {
    const { s } = setup();
    const { root, fore } = drawChain(s);
    const g = boneGlyphs(s.artboard()!.children);
    expect(boneEndAt(g, { x: 203, y: 98 }, 10)!.id).toBe(root.id);
    expect(boneEndAt(g, { x: 298, y: 101 }, 10)!.id).toBe(fore.id);
    expect(boneEndAt(g, { x: 250, y: 200 }, 10)).toBeNull();
    expect(boneEndAt(g, { x: 101, y: 100 }, 10, 'base')!.id).toBe(root.id);
  });

  it('turns a bone as one undo step, and keys it while recording', () => {
    const { s } = setup();
    const { root } = drawChain(s);
    for (let r = 10; r <= 40; r += 10) s.setProps([root.id], { rotation: r }, 'bone-rotate');
    s.commit();
    expect((locate(s.artboard()!, root.id)!.node as BoneNode).rotation).toBe(40);
    s.undo();
    expect((locate(s.artboard()!, root.id)!.node as BoneNode).rotation).toBe(0);
    const tl = s.addTimeline();
    s.set({ recording: true, playhead: 500, bottomTab: 'timeline' });
    s.setProps([root.id], { rotation: 45 });
    const track = s.artboard()!.timelines.find((t) => t.id === tl)!.tracks.find((t) => t.nodeId === root.id && t.prop === 'rotation')!;
    expect(track.keys.map((k) => [k.t, k.value])).toContainEqual([500, 45]);
    // The base pose is untouched; the timeline's frame shows the turn
    expect((locate(s.artboard()!, root.id)!.node as BoneNode).rotation).toBe(0);
    const frame = sampleArtboard(s.artboard()!.children, s.artboard()!.timelines[0], 500);
    expect((locate({ ...s.artboard()!, children: frame }, root.id)!.node as BoneNode).rotation).toBe(45);
  });
});

describe('binding to bones', () => {
  it('binds a path with automatic weights, as one undo step, and it bends with the bones', () => {
    const { s, strip } = setup();
    const { root, fore } = drawChain(s);
    s.update((d) => void bindLayer(d.artboards[0], strip.id, [root.id, fore.id]));
    const bound = locate(s.artboard()!, strip.id)!.node as PathNode;
    expect(bound.skin!.bones.map((b) => b.bone)).toEqual([root.id, fore.id]);
    const w = bound.skin!.weights[0];
    expect(w).toHaveLength(5);
    // The left end belongs to the root bone, the right end to the forearm, the middle point to both
    expect(w[0].w[0].b).toBe(0);
    expect(w[0].w[0].w).toBeGreaterThan(0.95);
    expect(w[4].w[0].b).toBe(1);
    expect(w[2].w).toHaveLength(2);
    expect(w[2].w[0].w).toBeCloseTo(0.5, 1);
    // Bound in the rest pose: nothing moved
    const rest = applyConstraints(s.artboard()!.children).find((n) => n.id === strip.id) as PathNode;
    rest.paths[0].points.forEach((p, i) => expect(p.x).toBeCloseTo(bound.paths[0].points[i].x, 6));
    // Turn the forearm a quarter turn about the elbow: the right end swings down
    s.setProps([fore.id], { rotation: 90 });
    const out = applyConstraints(s.artboard()!.children);
    const bent = out.find((n) => n.id === strip.id) as PathNode;
    const m = worldMatrices(out).get(strip.id)!;
    const end = apply(m, bent.paths[0].points[4].x, bent.paths[0].points[4].y);
    expect(end.x).toBeCloseTo(200, 0);
    expect(end.y).toBeGreaterThan(190);
    s.undo();
    s.undo();
    expect((locate(s.artboard()!, strip.id)!.node as PathNode).skin).toBeUndefined();
  });

  it('limits the influences per point and ignores things that are not bones', () => {
    const { s, strip } = setup();
    const { root, fore } = drawChain(s);
    const other = createNode('rect');
    s.addNodes([other]);
    s.update((d) => void bindLayer(d.artboards[0], strip.id, [root.id, fore.id, other.id], { maxInfluences: 1 }));
    const skin = skinOf(locate(s.artboard()!, strip.id)!.node)!;
    expect(skin.bones).toHaveLength(2);
    expect(skin.weights[0].every((v) => v.w.length === 1 && v.w[0].w === 1)).toBe(true);
    let n = 0;
    s.update((d) => void (n = bindLayer(d.artboards[0], other.id, [root.id])));
    expect(n).toBe(0);
  });

  it('edits one point\'s weights, normalises them, and works them out again', () => {
    const { s, strip } = setup();
    const { root, fore } = drawChain(s);
    s.update((d) => void bindLayer(d.artboards[0], strip.id, [root.id, fore.id]));
    s.update((d) => setPointWeights(d.artboards[0], strip.id, 0, 0, [{ b: 1, w: 3 }, { b: 0, w: 1 }]));
    let skin = skinOf(locate(s.artboard()!, strip.id)!.node)!;
    expect(skin.weights[0][0].w).toEqual([{ b: 1, w: 0.75 }, { b: 0, w: 0.25 }]);
    s.update((d) => autoWeightPoint(d.artboards[0], strip.id, 0, 0));
    skin = skinOf(locate(s.artboard()!, strip.id)!.node)!;
    expect(skin.weights[0][0].w[0]).toMatchObject({ b: 0 });
    expect(skin.weights[0][0].w[0].w).toBeGreaterThan(0.95);
    expect(normalizeInfluences([{ b: 0, w: 0 }, { b: 1, w: -1 }])).toEqual([]);
    expect(normalizeInfluences([0, 1, 2, 3, 4].map((b) => ({ b, w: 1 })))).toHaveLength(4);
  });

  it('makes a mesh for an image when it is bound, and drops it on request', () => {
    const { s } = setup();
    const { root, fore } = drawChain(s);
    const img = createNode('image', { name: 'Pic', x: 100, y: 80, width: 200, height: 40, originX: 0, originY: 0 });
    s.addNodes([img]);
    s.update((d) => void bindLayer(d.artboards[0], img.id, [root.id, fore.id], { cols: 4, rows: 1 }));
    const bound = locate(s.artboard()!, img.id)!.node as typeof img;
    expect(bound.mesh!.vertices).toHaveLength(10);
    expect(bound.mesh!.skin!.weights[0]).toHaveLength(10);
    s.setProps([fore.id], { rotation: 90 });
    const posed = applyConstraints(s.artboard()!.children).find((n) => n.id === img.id) as typeof img;
    // The far end hangs from the elbow now: its top vertex is down and to the right of the base line
    expect(posed.mesh!.skin).toBeNull();
    expect(posed.mesh!.vertices[4].y).toBeGreaterThan(100);
    s.update((d) => unbindLayer(d.artboards[0], img.id));
    expect((locate(s.artboard()!, img.id)!.node as typeof img).mesh!.skin).toBeNull();
    s.update((d) => unbindLayer(d.artboards[0], img.id, true));
    expect((locate(s.artboard()!, img.id)!.node as typeof img).mesh).toBeNull();
  });

  it('keeps a duplicated rig pointing at its own bones', () => {
    const { s, strip } = setup();
    const { root, fore } = drawChain(s);
    s.update((d) => void bindLayer(d.artboards[0], strip.id, [root.id, fore.id]));
    s.select([root.id, strip.id]);
    s.groupSelection();
    const group = s.artboard()!.children[0];
    s.select([group.id]);
    s.duplicateSelection(0);
    const copy = s.artboard()!.children.find((n) => n.id !== group.id) as SceneNode & { children: SceneNode[] };
    const copyBones = bonesOf(copy.children).map((b) => b.id);
    const copyStrip = copy.children.find((n) => n.type === 'path') as PathNode;
    expect(copyBones).toHaveLength(2);
    expect(copyBones).not.toContain(root.id);
    expect(copyStrip.skin!.bones.map((b) => b.bone)).toEqual(copyBones);
  });
});
