import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { pasteNodes } from '../src/lib/clipboard';
import { setCurrentStore } from '../src/store/store';

const tl = (id: string, tracks: unknown[] = []) => ({ id, name: id, duration: 1000, loop: 'once', autoplay: false, speed: 1, tracks }) as never;
const track = (id: string, nodeId: string, prop = 'x') => ({ id, nodeId, prop, keys: [{ id: id + 'k', t: 0, value: 0, ease: 'linear' }] });

describe('duplicateArtboard', () => {
  it('points the copied joysticks at the copied timelines', () => {
    const p: any = createProject('T');
    const ab = p.artboards[0];
    ab.timelines.push(tl('tl1'), tl('tl2'));
    ab.joysticks = [{ id: 'j1', name: 'J', xTimeline: 'tl1', x: '0.5', yTimeline: 'tl2', y: '0.2' }];
    const s = new EditorStore(p);
    s.duplicateArtboard(ab.id);
    const copy = s.get().project.artboards[1] as any;
    const ids = copy.timelines.map((t: any) => t.id);
    expect(ids).not.toContain('tl1');
    expect(copy.joysticks[0].xTimeline).toBe(ids[0]);
    expect(copy.joysticks[0].yTimeline).toBe(ids[1]);
    // the original is untouched
    expect(s.get().project.artboards[0].joysticks![0].xTimeline).toBe('tl1');
  });

  it('keeps layer ids held in keys (solo child, draw order) pointing at the copied layers', () => {
    const p: any = createProject('T');
    const ab = p.artboards[0];
    const kids = [createNode('rect', { name: 'a' }), createNode('rect', { name: 'b' })];
    const solo = createNode('group', { name: 'S', children: kids, solo: { active: kids[0].id } } as never);
    ab.children.push(solo);
    ab.timelines.push(
      tl('tl1', [
        { id: 'tr1', nodeId: solo.id, prop: 'solo.active', keys: [{ id: 'k1', t: 0, value: kids[1].id, ease: 'step' }] },
        { id: 'tr2', nodeId: solo.id, prop: 'drawOrder', keys: [{ id: 'k2', t: 0, value: [kids[1].id, kids[0].id], ease: 'step' }] },
      ]),
    );
    const s = new EditorStore(p);
    s.duplicateArtboard(ab.id);
    const copy = s.get().project.artboards[1] as any;
    const copyKids = copy.children[0].children.map((c: any) => c.id);
    expect(copyKids).not.toContain(kids[0].id);
    expect(copy.timelines[0].tracks[0].keys[0].value).toBe(copyKids[1]);
    expect(copy.timelines[0].tracks[1].keys[0].value).toEqual([copyKids[1], copyKids[0]]);
  });
});

describe('deleteSelection', () => {
  it('removes the tracks of every layer inside a deleted group or frame, and keeps the others', () => {
    const p: any = createProject('T');
    const deep = createNode('rect', { name: 'Deep' });
    const kid = createNode('frame', { name: 'K', children: [deep] } as never);
    const g = createNode('group', { name: 'G', children: [kid] } as never);
    const other = createNode('rect', { name: 'Other' });
    p.artboards[0].children.push(g, other);
    p.artboards[0].timelines.push(tl('tl1', [track('a', g.id), track('b', kid.id), track('c', deep.id), track('d', other.id)]));
    const s = new EditorStore(p);
    s.select([g.id]);
    s.deleteSelection();
    expect(s.get().project.artboards[0].timelines[0].tracks.map((t) => t.id)).toEqual(['d']);
    // undo brings the layers and their tracks back together
    s.undo();
    expect(s.get().project.artboards[0].timelines[0].tracks).toHaveLength(4);
  });
});

describe('ungroupSelection', () => {
  const ungroup = (group: Partial<SceneNode> & Record<string, unknown>, kidProps: Record<string, unknown> = {}) => {
    const p: Project = createProject('T');
    const kid = createNode('rect', { name: 'K', ...kidProps } as never);
    const g = createNode('group', { name: 'G', children: [kid], ...group } as never);
    p.artboards[0].children.push(g);
    const s = new EditorStore(p);
    s.select([g.id]);
    s.ungroupSelection();
    return { s, kid: s.get().project.artboards[0].children[0] as SceneNode };
  };

  it('a hidden group leaves hidden children', () => {
    expect(ungroup({ visible: false }).kid.visible).toBe(false);
  });

  it('carries locked, blend mode, blur and shadow onto the children, and multiplies opacity', () => {
    const shadow = { x: 1, y: 2, blur: 3, spread: 0, color: '#000' };
    const { kid, s } = ungroup({ locked: true, blendMode: 'multiply', blur: 4, shadow, opacity: 0.5 }, { opacity: 0.5 });
    expect(kid).toMatchObject({ locked: true, blendMode: 'multiply', blur: 4, shadow, opacity: 0.25 });
    expect(s.get().toast).toBeNull();
  });

  it('keeps a child\'s own setting and says what could not be carried', () => {
    const { kid, s } = ungroup({ blur: 4, mask: true }, { blur: 9 });
    expect((kid as { blur?: number }).blur).toBe(9);
    expect(s.get().toast?.text).toMatch(/blur/);
    expect(s.get().toast?.text).toMatch(/mask/);
  });

  it('leaves a visible, unlocked, plain group\'s children alone', () => {
    const { kid } = ungroup({});
    expect(kid.visible).toBe(true);
    expect(kid.locked).toBeFalsy();
    expect(kid.blendMode).toBeFalsy();
  });
});

describe('paste across artboards', () => {
  it('drops a constraint whose target is not on the destination artboard, keeps one that is', () => {
    const p: Project = createProject('T');
    const target = createNode('path', { name: 'Rail' });
    const here = createNode('path', { name: 'Here' });
    const follower = createNode('rect', {
      name: 'F',
      constraints: [
        { id: 'c1', type: 'followPath', target: target.id, strength: 1 },
        { id: 'c2', type: 'copyPosition', target: here.id, strength: 1 },
      ],
    } as never);
    p.artboards[0].children.push(target, follower);
    const s = new EditorStore(p);
    s.addArtboard({ canvasX: 2000 });
    const ab2 = s.get().project.artboards[1];
    s.update((d) => void d.artboards[1].children.push(JSON.parse(JSON.stringify(here))));
    setCurrentStore(s);
    s.set({ activeArtboardId: p.artboards[0].id });
    s.select([follower.id]);
    const text = JSON.stringify({ 'interactives/nodes': [JSON.parse(JSON.stringify(follower))] });
    s.set({ activeArtboardId: ab2.id });
    expect(pasteNodes(text)).toBe(true);
    const pasted = s.get().project.artboards[1].children.find((c) => c.name === 'F')!;
    expect(pasted.constraints!.map((c) => c.target)).toEqual([here.id]);
  });
});

describe('remote edits are sanitised', () => {
  it('a remote op that writes a wrong-typed value is repaired before it is drawn, in the document and in undo history', () => {
    const p: any = createProject('T');
    const sel = createNode('input', { name: 'Pick', inputType: 'select' } as never);
    p.artboards[0].children.push(sel);
    const s = new EditorStore(p);
    s.setProps([sel.id], { x: 5 });
    const abId = p.artboards[0].id;
    s.applyRemote([
      { t: 'set', p: ['artboards', { i: abId }, 'children', { i: sel.id }, 'options'], v: 42 },
      { t: 'set', p: ['artboards', { i: abId }, 'children', { i: sel.id }, 'min'], v: 'low' },
    ]);
    const node = s.get().project.artboards[0].children[0] as any;
    expect('options' in node).toBe(false);
    expect('min' in node).toBe(false);
    expect(node.x).toBe(5);
    s.undo();
    expect('options' in (s.get().project.artboards[0].children[0] as any)).toBe(false);
  });

  it('a remote insert of a layer with bad fields is repaired too, and one that is not a layer is dropped', () => {
    const p: any = createProject('T');
    const s = new EditorStore(p);
    const abId = p.artboards[0].id;
    const good = { ...createNode('input', { name: 'In' } as never), options: { a: 1 } };
    const junk = { id: 'junk1', type: 'nonsense', name: 'x' };
    s.applyRemote([
      { t: 'ins', p: ['artboards', { i: abId }, 'children'], v: good as never, after: null },
      { t: 'ins', p: ['artboards', { i: abId }, 'children'], v: junk as never, after: good.id },
    ]);
    const kids = s.get().project.artboards[0].children as any[];
    expect(kids.map((k) => k.id)).toEqual([good.id]);
    expect('options' in kids[0]).toBe(false);
  });
});

