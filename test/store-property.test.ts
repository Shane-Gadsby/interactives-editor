//Random sequences of real editor operations through EditorStore, seeded. The history has to be exact: undoing
//everything gives back the document you opened, redoing everything gives back where you ended, and no step leaves
//the document or the selection pointing at something that is not there.
import { describe, expect, it } from 'vitest';
import { createNode, createProject, isContainer, walk, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { rng, seeds, type Rng } from './helpers/rng';

const json = (p: Project) => JSON.stringify(p);

function allNodes(p: Project): SceneNode[] {
  const out: SceneNode[] = [];
  for (const ab of p.artboards) walk(ab.children, (n) => out.push(n));
  return out;
}

function makeStore(r: Rng) {
  const p = createProject('History');
  const kinds = ['rect', 'ellipse', 'text', 'rect', 'star'] as const;
  for (let i = 0; i < 4; i++) p.artboards[0].children.push(createNode(r.pick(kinds), { name: `L${i}`, x: r.int(300), y: r.int(300), width: 20 + r.int(80), height: 20 + r.int(80) }));
  return new EditorStore(p);
}

/** One random editor operation. Returns its name for the failure message. */
function step(s: EditorStore, r: Rng): string {
  const ab = s.artboard()!;
  const nodes = allNodes(s.get().project).filter((n) => ab.children.some((c) => c.id === n.id) || true);
  const here: SceneNode[] = [];
  walk(ab.children, (n) => here.push(n));
  const pickIds = (k: number) => Array.from({ length: Math.min(k, here.length) }, () => r.pick(here).id).filter((id, i, a) => a.indexOf(id) === i);
  const op = r.int(19);
  switch (op) {
    case 0:
    case 1:
      if (here.length) s.setProps(pickIds(1 + r.int(2)), { x: r.int(600), y: r.int(600) });
      return 'move';
    case 2:
      if (here.length) s.setProps(pickIds(1), { opacity: r(), name: `n${r.int(99)}` });
      return 'style';
    case 3:
      //a drag: several coalesced steps
      if (here.length) {
        const id = r.pick(here).id;
        for (let i = 0; i < 5; i++) s.setProps([id], { x: r.int(600) }, `drag-${id}`);
        s.commit();
      }
      return 'drag';
    case 4:
      s.addNodes([createNode(r.pick(['rect', 'ellipse', 'text'] as const), { name: 'New', x: r.int(200), y: r.int(200) })]);
      return 'add';
    case 5: {
      const groups = here.filter(isContainer);
      if (groups.length) s.addNodes([createNode('rect', { name: 'Inner' })], { parentId: r.pick(groups).id });
      return 'add into group';
    }
    case 6:
      if (here.length) {
        s.select(pickIds(1 + r.int(2)));
        s.deleteSelection();
      }
      return 'delete';
    case 7:
      if (here.length) {
        s.select(pickIds(1 + r.int(2)));
        s.duplicateSelection();
      }
      return 'duplicate';
    case 8:
      if (ab.children.length > 1) {
        s.select(ab.children.slice(0, 2 + r.int(2)).map((n) => n.id));
        s.groupSelection();
      }
      return 'group';
    case 9: {
      const g = here.find((n) => n.type === 'group');
      if (g) {
        s.select([g.id]);
        s.ungroupSelection();
      }
      return 'ungroup';
    }
    case 10:
      if (here.length) {
        s.select(pickIds(1));
        s.reorder(r.pick([-1, 1]));
      }
      return 'reorder';
    case 11:
      if (here.length) {
        const id = r.pick(here).id;
        const groups = here.filter((n) => isContainer(n) && n.id !== id);
        //never into itself or its own descendants: the UI does not offer that either
        const inside = new Set<string>();
        const self = here.find((n) => n.id === id)!;
        if (isContainer(self)) walk(self.children, (n) => inside.add(n.id));
        const target = groups.filter((g) => !inside.has(g.id));
        s.moveNode(id, target.length && r.chance(0.5) ? r.pick(target).id : null, r.int(4));
      }
      return 'moveNode';
    case 12:
      if (here.length > 2) {
        s.select(pickIds(3));
        s.align(r.pick(['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom'] as const));
      }
      return 'align';
    case 13:
      if (here.length > 2) {
        s.select(pickIds(4));
        s.distribute(r.pick(['horizontal', 'vertical'] as const));
      }
      return 'distribute';
    case 14:
      s.addArtboard({ width: 200 + r.int(300), height: 200 + r.int(300) });
      return 'addArtboard';
    case 15:
      if (s.get().project.artboards.length > 1) s.deleteArtboard(r.pick(s.get().project.artboards).id);
      return 'deleteArtboard';
    case 16:
      s.duplicateArtboard(r.pick(s.get().project.artboards).id);
      return 'duplicateArtboard';
    case 17:
      s.addTimeline();
      return 'addTimeline';
    default: {
      const others = s.get().project.artboards.filter((a) => a.id !== ab.id);
      if (others.length && ab.children.length) s.moveToArtboard([r.pick(ab.children).id], r.pick(others).id);
      return 'moveToArtboard';
    }
  }
  void nodes;
}

function checkSound(s: EditorStore, label: string) {
  const st = s.get();
  const ids = allNodes(st.project).map((n) => n.id);
  expect(new Set(ids).size, `${label}: layer ids are unique`).toBe(ids.length);
  expect(new Set(st.project.artboards.map((a) => a.id)).size, `${label}: artboard ids are unique`).toBe(st.project.artboards.length);
  expect(st.project.artboards.length, `${label}: at least one artboard`).toBeGreaterThan(0);
  expect(st.project.artboards.some((a) => a.id === st.activeArtboardId), `${label}: the active artboard exists`).toBe(true);
  const here = new Set<string>();
  walk(s.artboard()!.children, (n) => here.add(n.id));
  for (const id of st.selection) expect(here.has(id), `${label}: selected layer ${id} exists on the active artboard`).toBe(true);
  expect(st.project.artboards.some((a) => a.id === st.project.settings.startArtboardId), `${label}: the start artboard exists`).toBe(true);
  for (const ab of st.project.artboards) {
    const live = new Set<string>();
    walk(ab.children, (n) => live.add(n.id));
    for (const tl of ab.timelines) for (const tr of tl.tracks) expect(live.has(tr.nodeId), `${label}: track on ${tr.nodeId} points at a layer that exists`).toBe(true);
  }
}

describe('editor history, random operations', () => {
  const each = (name: string, fn: (r: Rng, seed: number) => void) =>
    it(name, () => {
      for (const seed of seeds(80)) {
        try {
          fn(rng(seed * 2654435761), seed);
        } catch (e) {
          if (e instanceof Error) e.message = `seed ${seed}: ${e.message}`;
          throw e;
        }
      }
    });

  each('undoing everything returns to the document you opened; redoing everything returns to where you ended', (r) => {
    const s = makeStore(r);
    const start = json(s.get().project);
    const trail: string[] = [];
    for (let i = 0; i < 40; i++) {
      trail.push(step(s, r));
      checkSound(s, `after ${trail.join(',')}`);
    }
    const end = json(s.get().project);
    let undone = 0;
    while (s.canUndo()) {
      s.undo();
      undone++;
      checkSound(s, `undo ${undone}`);
    }
    expect(json(s.get().project), `undone all (${trail.join(',')})`).toBe(start);
    let redone = 0;
    while (s.canRedo()) {
      s.redo();
      redone++;
      checkSound(s, `redo ${redone}`);
    }
    expect(redone).toBe(undone);
    expect(json(s.get().project), 'redone all').toBe(end);
  });

  each('every single step undoes to exactly the document before it, and redoes to exactly the one after', (r) => {
    const s = makeStore(r);
    for (let i = 0; i < 25; i++) {
      const before = json(s.get().project);
      const name = step(s, r);
      const after = json(s.get().project);
      if (after === before) continue;
      //a coalesced drag is one step, others are one step each
      s.undo();
      expect(json(s.get().project), `undo of ${name}`).toBe(before);
      s.redo();
      expect(json(s.get().project), `redo of ${name}`).toBe(after);
    }
  });

  each('a new edit after undo throws away the redo history, and undo stays available', (r) => {
    const s = makeStore(r);
    for (let i = 0; i < 6; i++) step(s, r);
    s.undo();
    s.undo();
    expect(s.canRedo()).toBe(true);
    s.setProps([s.artboard()!.children[0]?.id ?? 'none'], { x: 12345 });
    //if there was a layer to move, the redo history is gone
    if (s.artboard()!.children[0]) expect(s.canRedo()).toBe(false);
    expect(s.canUndo()).toBe(true);
  });

  each('remote edits are applied to history too, so undo takes back only your own changes', (r) => {
    const s = makeStore(r);
    const id = s.artboard()!.children[0].id;
    const abId = s.artboard()!.id;
    s.setProps([id], { x: 98765 });
    s.setProps([id], { y: 54321 });
    //someone else sets name and opacity
    s.applyRemote([
      { t: 'set', p: ['artboards', { i: abId }, 'children', { i: id }, 'name'], v: 'theirs' },
      { t: 'set', p: ['artboards', { i: abId }, 'children', { i: id }, 'opacity'], v: 0.25 },
    ]);
    s.undo();
    let n = s.artboard()!.children[0] as SceneNode;
    expect([n.x, n.y === 54321 ? 'y kept' : 'y undone', n.name, n.opacity]).toEqual([98765, 'y undone', 'theirs', 0.25]);
    s.undo();
    n = s.artboard()!.children[0] as SceneNode;
    expect(n.x).not.toBe(98765);
    expect([n.name, n.opacity]).toEqual(['theirs', 0.25]);
    s.redo();
    s.redo();
    n = s.artboard()!.children[0] as SceneNode;
    expect([n.x, n.y, n.name, n.opacity]).toEqual([98765, 54321, 'theirs', 0.25]);
  });

  it('keeps at most 200 undo steps', () => {
    const s = makeStore(rng(1));
    const id = s.artboard()!.children[0].id;
    for (let i = 0; i < 230; i++) s.setProps([id], { x: i + 1000 });
    let n = 0;
    while (s.canUndo()) {
      s.undo();
      n++;
    }
    expect(n).toBe(200);
    expect(s.artboard()!.children[0].x).toBe(1029);
  });
});
