import { beforeEach, describe, expect, it } from 'vitest';
import { createArtboard, createProject, type Artboard, type Project } from 'interactives-player';
import { apply, diff } from '../shared/ops.mjs';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { TIDY_GROUP_PAD, TIDY_GROUP_TOP, tidyPositions } from '../src/lib/artboard-tidy';
import { artboardEntries, groupFrame, pickedArtboardIds, withSets } from '../src/lib/artboard-groups';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Home plus Intro, Quiz 1, Quiz 2 and Results, 400 x 300 each, in a row. */
function make() {
  const p = createProject('T');
  p.artboards[0].name = 'Home';
  for (const [i, n] of ['Intro', 'Quiz 1', 'Quiz 2', 'Results'].entries()) p.artboards.push(createArtboard({ name: n, width: 400, height: 300, canvasX: 500 * (i + 1), canvasY: 0 }));
  p.artboards[0].width = 400;
  p.artboards[0].height = 300;
  const s = new EditorStore(p);
  setCurrentStore(s);
  const id = (name: string) => s.get().project.artboards.find((a) => a.name === name)!.id;
  const names = (ids: string[]) => ids.map((i) => s.get().project.artboards.find((a) => a.id === i)?.name);
  return { s, id, names };
}

describe('selecting several artboards', () => {
  let t: ReturnType<typeof make>;
  beforeEach(() => void (t = make()));

  it('picks, adds and takes out artboards, the active one being the last picked', () => {
    const { s, id, names } = t;
    s.pickArtboards([id('Intro')]);
    expect(pickedArtboardIds(s.get())).toEqual([id('Intro')]);
    s.toggleArtboardPick(id('Quiz 2'));
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Quiz 2']);
    expect(s.get().activeArtboardId).toBe(id('Quiz 2'));
    s.toggleArtboardPick(id('Results'));
    s.toggleArtboardPick(id('Quiz 2'));
    expect(names(s.pickedArtboards())).toEqual(['Intro', 'Results']);
    expect(s.get().activeArtboardId).toBe(id('Results'));
  });

  it('is only one artboard again when anything else picks an artboard or a layer', () => {
    const { s, id } = t;
    s.pickArtboards([id('Intro'), id('Quiz 1')]);
    expect(s.pickedArtboards()).toHaveLength(2);
    s.set({ activeArtboardId: id('Results'), artboardSelected: true });
    expect(s.pickedArtboards()).toEqual([id('Results')]);
    s.pickArtboards([id('Intro'), id('Quiz 1')]);
    s.select([], { artboardId: id('Intro') });
    expect(s.pickedArtboards()).toEqual([]);
  });

  it('drops an artboard from the selection when it is deleted', () => {
    const { s, id } = t;
    s.pickArtboards([id('Intro'), id('Quiz 1'), id('Quiz 2')]);
    s.deleteArtboards([id('Quiz 1')]);
    expect(s.get().artboardPicked.every((x) => x !== id('Quiz 1'))).toBe(true);
  });

  it('Delete takes all the selected artboards in one undo step, and never the last one', () => {
    const { s, id } = t;
    s.pickArtboards([id('Intro'), id('Quiz 1'), id('Quiz 2')]);
    s.deleteSelection();
    expect(s.get().project.artboards.map((a) => a.name)).toEqual(['Home', 'Results']);
    s.undo();
    expect(s.get().project.artboards).toHaveLength(5);
    s.pickArtboards(s.get().project.artboards.map((a) => a.id));
    s.deleteSelection();
    expect(s.get().project.artboards).toHaveLength(5);
    expect(s.get().toast?.kind).toBe('error');
  });
});

describe('artboard groups', () => {
  let t: ReturnType<typeof make>;
  beforeEach(() => void (t = make()));

  it('groups the picked artboards in one undo step, and the artboards stay where they are in the list', () => {
    const { s, id, names } = t;
    const before = s.get().project.artboards.map((a) => a.id);
    const gid = s.groupArtboards([id('Quiz 1'), id('Quiz 2')], 'Quiz')!;
    const p = s.get().project;
    expect(p.artboardGroups).toEqual([{ id: gid, name: 'Quiz' }]);
    expect(p.artboards.filter((a) => a.group === gid).map((a) => a.name)).toEqual(['Quiz 1', 'Quiz 2']);
    expect(p.artboards.map((a) => a.id)).toEqual(before);
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1', 'Quiz 2']);
    s.undo();
    expect(s.get().project.artboardGroups).toBeUndefined();
    expect(s.get().project.artboards.some((a) => a.group)).toBe(false);
  });

  it('lists a group where its first artboard is, with its artboards under it', () => {
    const { s, id } = t;
    s.groupArtboards([id('Quiz 2'), id('Intro')], 'Mixed');
    const e = artboardEntries(s.get().project);
    expect(e.map((x) => (x.kind === 'group' ? `[${x.group.name}: ${x.boards.map((b) => b.name).join(', ')}]` : x.ab.name))).toEqual(['Home', '[Mixed: Intro, Quiz 2]', 'Quiz 1', 'Results']);
  });

  it('moving artboards to a new group empties and removes the old one', () => {
    const { s, id } = t;
    s.groupArtboards([id('Intro'), id('Quiz 1')], 'A');
    s.groupArtboards([id('Intro'), id('Quiz 1')], 'B');
    expect(s.get().project.artboardGroups?.map((g) => g.name)).toEqual(['B']);
  });

  it('gives a repeated name a number', () => {
    const { s, id } = t;
    s.groupArtboards([id('Intro')]);
    s.groupArtboards([id('Quiz 1')]);
    expect(s.get().project.artboardGroups?.map((g) => g.name)).toEqual(['Group', 'Group 2']);
  });

  it('ungroups (the artboards stay), takes some out, and renames in a coalesced step', () => {
    const { s, id } = t;
    const gid = s.groupArtboards([id('Intro'), id('Quiz 1'), id('Quiz 2')], 'G')!;
    s.leaveArtboardGroups([id('Quiz 2')]);
    expect(s.get().project.artboards.filter((a) => a.group).map((a) => a.name)).toEqual(['Intro', 'Quiz 1']);
    s.renameArtboardGroup(gid, 'Renamed');
    s.renameArtboardGroup(gid, 'Renamed again');
    expect(s.get().project.artboardGroups?.[0].name).toBe('Renamed again');
    s.undo();
    expect(s.get().project.artboardGroups?.[0].name).toBe('G');
    s.ungroupArtboards(gid);
    expect(s.get().project.artboardGroups).toBeUndefined();
    expect(s.get().project.artboards).toHaveLength(5);
  });

  it('a group is taken away with its last artboard', () => {
    const { s, id } = t;
    s.groupArtboards([id('Intro')], 'Solo');
    s.deleteArtboards([id('Intro')]);
    expect(s.get().project.artboardGroups).toBeUndefined();
  });

  it('selects every artboard in a group, and adds them to a selection', () => {
    const { s, id, names } = t;
    const gid = s.groupArtboards([id('Quiz 1'), id('Quiz 2')], 'Quiz')!;
    s.pickArtboards([id('Home')]);
    s.pickGroup(gid);
    expect(names(s.pickedArtboards())).toEqual(['Quiz 1', 'Quiz 2']);
    s.pickArtboards([id('Home')]);
    s.pickGroup(gid, true);
    expect(names(s.pickedArtboards())).toEqual(['Home', 'Quiz 1', 'Quiz 2']);
  });

  it('keeps a responsive set together when grouping', () => {
    const { s, id } = t;
    s.update((d) => {
      const v = d.artboards.find((a) => a.name === 'Results')!;
      v.variantOf = d.artboards.find((a) => a.name === 'Intro')!.id;
    });
    expect(withSets(s.get().project, [id('Intro')]).sort()).toEqual([id('Intro'), id('Results')].sort());
    s.groupArtboards([id('Intro')], 'Set');
    expect(s.get().project.artboards.filter((a) => a.group).map((a) => a.name)).toEqual(['Intro', 'Results']);
  });

  it('survives live editing: the ops for grouping and ungrouping rebuild the document', () => {
    const { s, id } = t;
    const a = clone(s.get().project);
    const gid = s.groupArtboards([id('Quiz 1'), id('Quiz 2')], 'Quiz')!;
    const b = clone(s.get().project);
    const c = clone(a);
    apply(c, diff(a, b));
    expect(c).toEqual(b);
    s.ungroupArtboards(gid);
    const d = clone(s.get().project);
    apply(c, diff(b, d));
    expect(c).toEqual(d);
    expect('artboardGroups' in c).toBe(false);
  });
});

describe('duplicating artboards', () => {
  it('copies keep their layout and stand to the right, selected, in one undo step', () => {
    const { s, id, names } = make();
    s.pickArtboards([id('Quiz 1'), id('Quiz 2')]);
    s.duplicateSelection();
    const p = s.get().project;
    expect(p.artboards).toHaveLength(7);
    const copies = p.artboards.slice(5);
    expect(new Set(p.artboards.map((a) => a.name)).size).toBe(7);
    expect(copies[1].canvasX - copies[0].canvasX).toBe(500);
    expect(copies[0].canvasX).toBeGreaterThan(Math.max(...p.artboards.slice(0, 5).map((a) => a.canvasX)) - 1);
    expect(names(s.pickedArtboards())).toEqual(copies.map((a) => a.name));
    s.undo();
    expect(s.get().project.artboards).toHaveLength(5);
  });

  it('a whole group duplicated becomes a copy group; part of one joins the original group', () => {
    const { s, id } = make();
    const gid = s.groupArtboards([id('Quiz 1'), id('Quiz 2')], 'Quiz')!;
    s.duplicateArtboards([id('Quiz 1')]);
    expect(s.get().project.artboards.filter((a) => a.group === gid)).toHaveLength(3);
    expect(s.get().project.artboardGroups).toHaveLength(1);
    s.undo();
    s.duplicateArtboards([id('Quiz 1'), id('Quiz 2')]);
    const p = s.get().project;
    expect(p.artboardGroups?.map((g) => g.name)).toEqual(['Quiz', 'Quiz copy']);
    expect(p.artboards.filter((a) => a.group === gid)).toHaveLength(2);
    expect(p.artboards.filter((a) => a.group && a.group !== gid)).toHaveLength(2);
  });
});

describe('align and distribute', () => {
  it('aligns on an edge or centre and spaces evenly', () => {
    const { s, id } = make();
    const ids = [id('Intro'), id('Quiz 1'), id('Quiz 2')];
    s.update((d) => {
      d.artboards.find((a) => a.name === 'Intro')!.canvasY = 100;
      d.artboards.find((a) => a.name === 'Quiz 1')!.canvasY = 40;
      d.artboards.find((a) => a.name === 'Quiz 2')!.canvasY = 250;
    });
    s.alignArtboards(ids, 'top');
    expect(s.get().project.artboards.filter((a) => ids.includes(a.id)).map((a) => a.canvasY)).toEqual([40, 40, 40]);
    s.undo();
    s.alignArtboards(ids, 'bottom');
    expect(s.get().project.artboards.filter((a) => ids.includes(a.id)).map((a) => a.canvasY + a.height)).toEqual([550, 550, 550]);
    s.update((d) => void (d.artboards.find((a) => a.name === 'Quiz 1')!.canvasX = 700));
    s.distributeArtboards(ids, 'x');
    const xs = s.get().project.artboards.filter((a) => ids.includes(a.id)).map((a) => a.canvasX).sort((a, b) => a - b);
    expect(xs[1] - (xs[0] + 400)).toBe(xs[2] - (xs[1] + 400));
  });
});

describe('Tidy up with groups and selections', () => {
  it('tidies only the selected artboards, among themselves, one undo step', () => {
    const { s, id } = make();
    const other = clone(s.get().project.artboards.find((a) => a.name === 'Results')!);
    const moved = s.tidyArtboards([id('Intro'), id('Quiz 1'), id('Quiz 2')]);
    expect(moved).toBeGreaterThan(0);
    const p = s.get().project;
    expect(p.artboards.find((a) => a.name === 'Results')).toMatchObject({ canvasX: other.canvasX, canvasY: other.canvasY });
    expect(p.artboards.find((a) => a.name === 'Home')).toMatchObject({ canvasX: 0, canvasY: 0 });
    //the first of them keeps its corner
    expect(p.artboards.find((a) => a.name === 'Intro')).toMatchObject({ canvasX: 500, canvasY: 0 });
    s.undo();
    expect(s.get().project.artboards.find((a) => a.name === 'Quiz 2')).toMatchObject({ canvasX: 1500, canvasY: 0 });
  });

  it('keeps a group together as a block even when its artboards are apart in the list', () => {
    const { s, id } = make();
    s.groupArtboards([id('Home'), id('Quiz 1'), id('Results')], 'G');
    s.tidyArtboards();
    const p = s.get().project;
    const fr = groupFrame(p, p.artboardGroups![0].id)!;
    const inside = (a: Artboard) => a.canvasX >= fr.x && a.canvasX + a.width <= fr.x + fr.width && a.canvasY >= fr.y && a.canvasY + a.height <= fr.y + fr.height;
    expect(p.artboards.filter((a) => a.group).every(inside)).toBe(true);
    //no artboard that is not in the group sits inside its frame
    expect(p.artboards.filter((a) => !a.group).some((a) => a.canvasX < fr.x + fr.width && a.canvasX + a.width > fr.x && a.canvasY < fr.y + fr.height && a.canvasY + a.height > fr.y)).toBe(false);
    //room round the artboards for the frame and its labels
    const g = p.artboards.filter((a) => a.group);
    expect(Math.min(...g.map((a) => a.canvasX)) - fr.x).toBe(TIDY_GROUP_PAD);
    expect(Math.min(...g.map((a) => a.canvasY)) - fr.y).toBe(TIDY_GROUP_TOP);
  });

  it('a second tidy changes nothing (the frame room does not creep the artboards along)', () => {
    const { s, id } = make();
    s.groupArtboards([id('Intro'), id('Quiz 1'), id('Quiz 2')], 'G');
    s.tidyArtboards();
    const once = clone(s.get().project.artboards.map((a) => [a.canvasX, a.canvasY]));
    expect(s.tidyArtboards()).toBe(0);
    expect(s.get().project.artboards.map((a) => [a.canvasX, a.canvasY])).toEqual(once);
  });

  it('is the same grid as before when there are no groups', () => {
    const { s } = make();
    const p = clone(s.get().project) as Project;
    const before = [...tidyPositions(p)];
    expect(before).toHaveLength(5);
    p.artboardGroups = [{ id: 'unused', name: 'x' }];
    expect([...tidyPositions(p)]).toEqual(before);
  });
});
