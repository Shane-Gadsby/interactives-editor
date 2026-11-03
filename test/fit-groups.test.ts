import { describe, expect, it } from 'vitest';
import { createArtboard, createNode, createProject, type GroupNode, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';

function storeWith(children: SceneNode[], extra: (p: Project) => void = () => {}) {
  const p = createProject('T');
  p.artboards = [createArtboard({ id: 'ab', name: 'A', width: 800, height: 600, children })];
  extra(p);
  return new EditorStore(p);
}
// Groups are fitted on the person's own edits (not on load), so the tests make one
const touch = (s: EditorStore) => {
  s.set({ activeArtboardId: 'ab' });
  s.setProps(['a'], { name: 'A layer' });
};
const groupOf = (s: EditorStore) => s.get().project.artboards[0].children[0] as GroupNode;
const world = (g: GroupNode, i: number) => ({ x: g.x + g.children[i].x, y: g.y + g.children[i].y });

describe('groups size to their contents', () => {
  const a = () => createNode('rect', { id: 'a', x: 0, y: 0, width: 50, height: 50 });
  const b = () => createNode('rect', { id: 'b', x: 100, y: 20, width: 50, height: 30 });

  it('fits a group that is the wrong size on the next edit, without moving anything, and not on load', () => {
    const s = storeWith([createNode('group', { id: 'g', x: 10, y: 10, width: 500, height: 500, children: [a(), b()] })]);
    expect(groupOf(s).width).toBe(500);
    touch(s);
    const g = groupOf(s);
    expect([g.x, g.y, g.width, g.height]).toEqual([10, 10, 150, 50]);
    expect(world(g, 1)).toEqual({ x: 110, y: 30 });
  });

  it('follows a layer that moves out of it, in the same undo step, and keys on positions move to match', () => {
    const s = storeWith([createNode('group', { id: 'g', x: 10, y: 10, width: 150, height: 50, children: [a(), b()] })], (p) => {
      p.artboards[0].timelines = [{ id: 't', name: 'T', duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks: [{ id: 'tr', nodeId: 'b', prop: 'x', keys: [{ id: 'k1', t: 0, value: 100, ease: 'linear' }, { id: 'k2', t: 1000, value: 200, ease: 'linear' }] }] }];
    });
    s.set({ activeArtboardId: 'ab' });
    s.setProps(['a'], { x: -40, y: -20 });
    const g = groupOf(s);
    expect([g.x, g.y, g.width, g.height]).toEqual([-30, -10, 190, 70]);
    // a moved where it was put, b didn't move at all
    expect(world(g, 0)).toEqual({ x: -30, y: -10 });
    expect(world(g, 1)).toEqual({ x: 110, y: 30 });
    // b's keys are in the group's coordinates, which moved by -40
    expect(s.get().project.artboards[0].timelines[0].tracks[0].keys.map((k) => k.value)).toEqual([140, 240]);
    s.undo();
    expect([groupOf(s).x, groupOf(s).width]).toEqual([10, 150]);
  });

  it('leaves alone a group set not to, a rotated group, and a repeater', () => {
    const off = storeWith([createNode('group', { id: 'g', x: 0, y: 0, width: 500, height: 500, fitContents: false, children: [a()] })]);
    touch(off);
    expect(groupOf(off).width).toBe(500);
    const turned = storeWith([createNode('group', { id: 'g', x: 0, y: 0, width: 500, height: 500, rotation: 20, children: [a()] })]);
    touch(turned);
    expect(groupOf(turned).width).toBe(500);
    const rep = storeWith([createNode('group', { id: 'g', x: 0, y: 0, width: 500, height: 500, repeat: { items: 'list', direction: 'vertical', gap: 0 } as never, children: [a()] })]);
    touch(rep);
    expect(groupOf(rep).width).toBe(500);
  });

  it('fits inner groups first, so the outer one sees their real size', () => {
    const inner = createNode('group', { id: 'gi', x: 0, y: 0, width: 10, height: 10, children: [b()] });
    const s = storeWith([createNode('group', { id: 'g', x: 0, y: 0, width: 10, height: 10, children: [a(), inner] })]);
    touch(s);
    const g = groupOf(s);
    const gi = g.children[1] as GroupNode;
    expect([gi.x, gi.y, gi.width, gi.height]).toEqual([100, 20, 50, 30]);
    expect([g.width, g.height]).toEqual([150, 50]);
  });
});
