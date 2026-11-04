import { describe, expect, it } from 'vitest';
import { createNode, createProject, isContainer, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { depthAtX, dropRows, gapSlot, insideSlot, keyMoveTarget, slotAt, zoneOf } from '../src/lib/layer-drop';

// Back to front: Bottom group (Y inside, then X on top of it), Mid, Top. Drawn top first: Top, Mid, Bottom, X, Y.
function scene() {
  const p = createProject('T');
  const ab = p.artboards[0];
  const mk = (name: string, type: 'rect' | 'group' = 'rect', kids: SceneNode[] = []) => {
    const n = createNode(type, { name } as never);
    if (isContainer(n)) n.children = kids;
    return n;
  };
  const y = mk('Y');
  const x = mk('X');
  ab.children.push(mk('Bottom', 'group', [y, x]), mk('Mid'), mk('Top'));
  const id = (name: string) => {
    const find = (list: SceneNode[]): string | null => {
      for (const n of list) {
        if (n.name === name) return n.id;
        if (isContainer(n)) {
          const f = find(n.children);
          if (f) return f;
        }
      }
      return null;
    };
    return find(ab.children)!;
  };
  return { p, ab, id, rows: dropRows(ab, new Set()) };
}
const names = (ab: Artboard) => {
  const out: string[] = [];
  const walk = (list: SceneNode[], d: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      out.push(`${'-'.repeat(d)}${list[i].name}`);
      const n = list[i];
      if (isContainer(n)) walk(n.children, d + 1);
    }
  };
  walk(ab.children, 0);
  return out.join(' ');
};
function drop(slot: ReturnType<typeof gapSlot>, drag: string, p: Project) {
  const s = new EditorStore(p);
  expect(slot).not.toBeNull();
  s.moveNode(drag, slot!.parentId, slot!.at);
  return names(s.get().project.artboards[0]);
}

describe('rows', () => {
  it('lists the layers top first with their depth', () => {
    const { rows } = scene();
    expect(rows.map((r) => `${r.n.name}:${r.depth}`)).toEqual(['Top:1', 'Mid:1', 'Bottom:1', 'X:2', 'Y:2']);
  });
  it('leaves out the children of a collapsed group', () => {
    const { ab, id } = scene();
    expect(dropRows(ab, new Set([id('Bottom')])).map((r) => r.n.name)).toEqual(['Top', 'Mid', 'Bottom']);
  });
});

describe('zones of a row', () => {
  it('splits a group row in thirds and a plain row in halves', () => {
    expect([0.1, 0.5, 0.9].map((f) => zoneOf(true, f))).toEqual(['before', 'inside', 'after']);
    expect([0.1, 0.49, 0.5, 0.9].map((f) => zoneOf(false, f))).toEqual(['before', 'before', 'after', 'after']);
  });
  it('turns the pointer x into a depth', () => {
    expect(depthAtX(100 + 8 + 14 * 2 + 3, 100)).toBe(2);
    expect(depthAtX(100, 100)).toBeLessThan(1);
  });
});

describe('the end of the list', () => {
  it('can leave the group the last row belongs to, by moving left', () => {
    const { p, ab, id, rows } = scene();
    // The last row is Y, inside Bottom. Pointer far right: stays in the group (below Y)
    const inside = gapSlot(ab, rows, rows.length, 9, id('Top'));
    expect(inside).toMatchObject({ depth: 2, parentId: id('Bottom'), at: 0 });
    expect(drop(inside, id('Top'), p)).toBe('Mid Bottom -X -Y -Top');
    // Pointer in the margin: below the group, at the very bottom of the artboard
    const s2 = scene();
    const out = gapSlot(s2.ab, s2.rows, s2.rows.length, 0, s2.id('Top'));
    expect(out).toMatchObject({ depth: 1, parentId: null, at: 0 });
    expect(drop(out, s2.id('Top'), s2.p)).toBe('Mid Bottom -X -Y Top');
  });
  it('never goes into a group that is last in the list unless asked', () => {
    // Last row is an empty group: left of its indent puts the layer beside it, not in it
    const p = createProject('T');
    const ab = p.artboards[0];
    const g = createNode('group', { name: 'Empty' } as never);
    const r = createNode('rect', { name: 'R' } as never);
    ab.children.push(g, r);
    const rows = dropRows(ab, new Set());
    expect(gapSlot(ab, rows, rows.length, 1, r.id)).toMatchObject({ depth: 1, parentId: null, at: 0 });
    expect(gapSlot(ab, rows, rows.length, 2, r.id)).toMatchObject({ depth: 2, parentId: g.id });
  });
});

describe('between rows', () => {
  it('a gap between a group and its first child can only be inside the group', () => {
    const { ab, id, rows } = scene();
    // Rows: Top Mid Bottom X Y. Gap 3 sits between Bottom and X
    for (const want of [1, 2, 3]) expect(gapSlot(ab, rows, 3, want, id('Top'))).toMatchObject({ depth: 2, parentId: id('Bottom'), at: Infinity });
  });
  it('a gap after the last child of a group picks the depth', () => {
    const { ab, id, rows } = scene();
    // Rows: Top Mid Bottom X Y; dragging Mid; below X is gap 4 (X is not last in its group: Y is below it)
    expect(gapSlot(ab, rows, 4, 1, id('Mid'))).toMatchObject({ depth: 2 });
    // Between Top and Mid is plain top level
    expect(gapSlot(ab, rows, 1, 5, id('Bottom'))).toMatchObject({ depth: 1, parentId: null });
  });
  it('slotAt maps the pointer onto a gap or an inside drop', () => {
    const { ab, id, rows } = scene();
    // flat index 0 is the artboard row, so Top is 1, Mid 2, Bottom 3
    expect(slotAt(ab, rows, 3, 0, 0.5, 1, id('Top'))).toMatchObject({ gap: -1, parentId: id('Bottom') });
    expect(slotAt(ab, rows, 3, 0, 0.1, 1, id('Top'))).toMatchObject({ gap: 2, parentId: null });
    expect(slotAt(ab, rows, 2, 0, 0.9, 1, id('Top'))).toMatchObject({ gap: 2 });
    // Over a plain row there is no inside
    expect(slotAt(ab, rows, 2, 0, 0.5, 1, id('Top'))).toMatchObject({ gap: 2 });
    // On the artboard row itself: the top of the artboard
    expect(slotAt(ab, rows, 0, 0, 0.5, 1, id('Mid'))).toMatchObject({ gap: 0, parentId: null, at: Infinity });
  });
});

describe('refusals and no-ops', () => {
  it('does not drop a group into itself or its own children', () => {
    const { ab, id, rows } = scene();
    expect(insideSlot(ab, rows, 2, id('Bottom'))).toBeNull();
    // Between X and Y while dragging Bottom
    expect(gapSlot(ab, rows, 4, 2, id('Bottom'))).toBeNull();
    // Below the dragged group's last child counts as below the group: Y is last, gap 5
    expect(gapSlot(ab, rows, 5, 1, id('Bottom'))).toMatchObject({ depth: 1, parentId: null, noop: true });
  });
  it('marks a drop where the layer already is', () => {
    const { ab, id, rows } = scene();
    expect(gapSlot(ab, rows, 0, 1, id('Top'))?.noop).toBe(true);
    expect(gapSlot(ab, rows, 1, 1, id('Top'))?.noop).toBe(true);
    expect(gapSlot(ab, rows, 2, 1, id('Top'))?.noop).toBe(false);
  });
});

describe('moving by keyboard', () => {
  function runner() {
    const { p, id } = scene();
    const s = new EditorStore(p);
    return (who: string, dir: 'up' | 'down' | 'in' | 'out') => {
      const to = keyMoveTarget(s.get().project.artboards[0], id(who), dir);
      if (to) s.moveNode(id(who), to.parentId, to.at);
      return names(s.get().project.artboards[0]);
    };
  }
  it('steps past one layer at a time and stops at the ends', () => {
    const run = runner();
    expect(run('Mid', 'up')).toBe('Mid Top Bottom -X -Y');
    expect(run('Mid', 'up')).toBe('Mid Top Bottom -X -Y');
    expect(run('Mid', 'down')).toBe('Top Mid Bottom -X -Y');
    expect(run('Mid', 'down')).toBe('Top Bottom -X -Y Mid');
    expect(run('Mid', 'down')).toBe('Top Bottom -X -Y Mid');
  });
  it('goes into the group above with in, and leaves with out', () => {
    const run = runner();
    // Top is above Mid and it is not a group: nothing to go into
    expect(run('Mid', 'in')).toBe('Top Mid Bottom -X -Y');
    run('Mid', 'down');
    expect(run('Mid', 'in')).toBe('Top Bottom -X -Y -Mid');
    expect(run('Mid', 'out')).toBe('Top Bottom -X -Y Mid');
  });
  it('up and down leave a group at its ends', () => {
    const run = runner();
    // X is the front-most layer of Bottom: up puts it above the group
    expect(run('X', 'up')).toBe('Top Mid X Bottom -Y');
    // Y is the back-most layer of Bottom: down puts it under the group
    expect(run('Y', 'down')).toBe('Top Mid X Bottom Y');
  });
});
