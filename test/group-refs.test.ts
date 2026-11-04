/**
 * Group, ungroup and move change which layers a parent holds. What names those layers (a draw order, the child a solo shows,
 * constraints, skins, and timeline keys on those) has to follow, as deleting a layer already cleans up its tracks.
 */
import { describe, expect, it } from 'vitest';
import { createNode, createProject, type BoneNode, type GroupNode, type PathNode, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { locate } from '../src/store/doc';

const key = (id: string, value: unknown) => ({ id, t: 0, value, ease: 'linear' }) as never;
const tl = (tracks: unknown[]) => ({ id: 't', name: 't', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks }) as never;
const rect = (name: string) => createNode('rect', { name });

/** A parent group P holding the given children, with a solo, a draw order and timeline keys on both. */
function parentOf(kids: SceneNode[], solo: string, order: string[]) {
  const p: Project = createProject('T');
  const parent = createNode('group', { name: 'P', children: kids, solo: { active: solo }, drawOrder: order } as never) as GroupNode;
  p.artboards[0].children.push(parent);
  p.artboards[0].timelines.push(
    tl([
      { id: 'solo', nodeId: parent.id, prop: 'solo.active', keys: [key('s0', solo)] },
      { id: 'order', nodeId: parent.id, prop: 'drawOrder', keys: [key('o0', order), key('o1', [...order].reverse())] },
    ]),
  );
  return { p, parent };
}

const parentNow = (s: EditorStore, id: string) => locate(s.artboard()!, id)!.node as GroupNode;
const keys = (s: EditorStore, trackId: string) => s.artboard()!.timelines[0].tracks.find((t) => t.id === trackId)!.keys.map((k) => k.value);

describe('groupSelection', () => {
  it("lists the new group where the layers were in the parent's draw order and solo, and in their keys", () => {
    const [a, b, c] = [rect('a'), rect('b'), rect('c')];
    const { p, parent } = parentOf([a, b, c], b.id, [a.id, b.id, c.id]);
    const s = new EditorStore(p);
    s.select([a.id, b.id]);
    s.groupSelection();
    const group = parentNow(s, parent.id).children.find((n) => n.type === 'group')!;
    expect(parentNow(s, parent.id).children.map((n) => n.id)).toEqual([group.id, c.id]);
    // The first layer's place, once
    expect(parentNow(s, parent.id).drawOrder).toEqual([group.id, c.id]);
    // The solo showed b, which is in the group now
    expect(parentNow(s, parent.id).solo!.active).toBe(group.id);
    expect(keys(s, 'solo')).toEqual([group.id]);
    expect(keys(s, 'order')).toEqual([[group.id, c.id], [c.id, group.id]]);
    // One undo step puts it all back
    s.undo();
    expect(parentNow(s, parent.id).drawOrder).toEqual([a.id, b.id, c.id]);
    expect(parentNow(s, parent.id).solo!.active).toBe(b.id);
  });

  it('leaves a solo that shows another layer alone', () => {
    const [a, b, c] = [rect('a'), rect('b'), rect('c')];
    const { p, parent } = parentOf([a, b, c], c.id, [c.id, a.id]);
    const s = new EditorStore(p);
    s.select([a.id, b.id]);
    s.groupSelection();
    const group = parentNow(s, parent.id).children.find((n) => n.type === 'group')!;
    expect(parentNow(s, parent.id).solo!.active).toBe(c.id);
    expect(parentNow(s, parent.id).drawOrder).toEqual([c.id, group.id]);
  });
});

describe('ungroupSelection', () => {
  const setup = (solo: 'group' | 'x', order: 'group-first' | 'group-last') => {
    const [k1, k2] = [rect('k1'), rect('k2')];
    const group = createNode('group', { name: 'G', children: [k1, k2] } as never) as GroupNode;
    const x = rect('x');
    const { p, parent } = parentOf([group, x], solo === 'group' ? group.id : x.id, order === 'group-first' ? [group.id, x.id] : [x.id, group.id]);
    return { p, parent, group, k1, k2, x };
  };

  it("lists the released layers in the group's place in the draw order, in order", () => {
    const { p, parent, group, k1, k2, x } = setup('group', 'group-last');
    const s = new EditorStore(p);
    s.select([group.id]);
    s.ungroupSelection();
    expect(parentNow(s, parent.id).children.map((n) => n.id)).toEqual([k1.id, k2.id, x.id]);
    expect(parentNow(s, parent.id).drawOrder).toEqual([x.id, k1.id, k2.id]);
    // (the second key held the reverse order)
    expect(keys(s, 'order')).toEqual([[x.id, k1.id, k2.id], [k1.id, k2.id, x.id]]);
  });

  it('a solo that showed the group shows its first layer, and one that showed another layer is left alone', () => {
    const a = setup('group', 'group-first');
    const s = new EditorStore(a.p);
    s.select([a.group.id]);
    s.ungroupSelection();
    expect(parentNow(s, a.parent.id).solo!.active).toBe(a.k1.id);
    expect(keys(s, 'solo')).toEqual([a.k1.id]);

    const b = setup('x', 'group-first');
    const t = new EditorStore(b.p);
    t.select([b.group.id]);
    t.ungroupSelection();
    expect(parentNow(t, b.parent.id).solo!.active).toBe(b.x.id);
  });

  it('a solo that showed an empty group shows nothing', () => {
    const group = createNode('group', { name: 'G', children: [] } as never) as GroupNode;
    const { p, parent } = parentOf([group, rect('x')], group.id, []);
    const s = new EditorStore(p);
    s.select([group.id]);
    s.ungroupSelection();
    expect(parentNow(s, parent.id).solo!.active).toBeNull();
    expect(keys(s, 'solo')).toEqual(['']);
  });

  it('drops the constraints that followed the group, and moves the animated ones after them up', () => {
    const { p, group, x } = setup('x', 'group-first');
    const other = rect('o');
    const c = (id: string, target: string) => ({ id, type: 'copyPosition', target, strength: 1 }) as never;
    other.constraints = [c('c0', x.id), c('c1', group.id), c('c2', x.id)];
    p.artboards[0].children.push(other);
    p.artboards[0].timelines[0].tracks.push(
      { id: 'tr0', nodeId: other.id, prop: 'constraints.0.strength', keys: [key('a', 1)] } as never,
      { id: 'tr1', nodeId: other.id, prop: 'constraints.1.strength', keys: [key('b', 1)] } as never,
      { id: 'tr2', nodeId: other.id, prop: 'constraints.2.strength', keys: [key('c', 1)] } as never,
    );
    const s = new EditorStore(p);
    s.select([group.id]);
    s.ungroupSelection();
    const o = locate(s.artboard()!, other.id)!.node;
    expect(o.constraints!.map((k) => k.id)).toEqual(['c0', 'c2']);
    expect(s.artboard()!.timelines[0].tracks.filter((t) => t.nodeId === other.id).map((t) => [t.id, t.prop])).toEqual([
      ['tr0', 'constraints.0.strength'],
      ['tr2', 'constraints.1.strength'],
    ]);
    // Undo brings every reference back with the group
    s.undo();
    expect(locate(s.artboard()!, other.id)!.node.constraints!.map((k) => k.id)).toEqual(['c0', 'c1', 'c2']);
  });

  it('takes a released bone out of the skins that bound it, and leaves the other bones weighted as they were', () => {
    const p: Project = createProject('T');
    const root = createNode('bone', { name: 'root', children: [] } as never) as BoneNode;
    const arm = createNode('bone', { name: 'arm', children: [] } as never) as BoneNode;
    const tip = createNode('bone', { name: 'tip', children: [] } as never) as BoneNode;
    const path = createNode('path', { name: 'skinned' }) as PathNode;
    const bind = [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number];
    path.skin = {
      bones: [
        { bone: root.id, bind },
        { bone: arm.id, bind },
        { bone: tip.id, bind },
      ],
      weights: [[{ w: [{ b: 0, w: 0.5 }, { b: 1, w: 0.5 }] }, { w: [{ b: 2, w: 1 }], in: [{ b: 1, w: 1 }] }]],
    };
    root.children = [arm];
    arm.children = [tip];
    p.artboards[0].children.push(root, path);
    const s = new EditorStore(p);
    s.select([arm.id]);
    s.ungroupSelection();
    const skin = (locate(s.artboard()!, path.id)!.node as PathNode).skin!;
    expect(skin.bones.map((b) => b.bone)).toEqual([root.id, tip.id]);
    // root stays 0; the removed bone's pull leaves the point in place (-1); tip moved from 2 to 1
    expect(skin.weights[0][0].w).toEqual([{ b: 0, w: 0.5 }, { b: -1, w: 0.5 }]);
    expect(skin.weights[0][1].w).toEqual([{ b: 1, w: 1 }]);
    expect(skin.weights[0][1].in).toEqual([{ b: -1, w: 1 }]);
  });
});

describe('moveNode', () => {
  it("takes the layer out of the old parent's draw order, solo and keys", () => {
    const [a, b] = [rect('a'), rect('b')];
    const { p, parent } = parentOf([a, b], a.id, [a.id, b.id]);
    const s = new EditorStore(p);
    s.moveNode(a.id, null, 0);
    expect(parentNow(s, parent.id).drawOrder).toEqual([b.id]);
    expect(parentNow(s, parent.id).solo!.active).toBeNull();
    expect(keys(s, 'solo')).toEqual(['']);
    expect(keys(s, 'order')).toEqual([[b.id], [b.id]]);
    s.undo();
    expect(parentNow(s, parent.id).drawOrder).toEqual([a.id, b.id]);
    expect(parentNow(s, parent.id).solo!.active).toBe(a.id);
  });

  it('keeps them when the layer only changes place in the same parent', () => {
    const [a, b] = [rect('a'), rect('b')];
    const { p, parent } = parentOf([a, b], a.id, [a.id, b.id]);
    const s = new EditorStore(p);
    s.moveNode(a.id, parent.id, 2);
    expect(parentNow(s, parent.id).children.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(parentNow(s, parent.id).drawOrder).toEqual([a.id, b.id]);
    expect(parentNow(s, parent.id).solo!.active).toBe(a.id);
  });
});
