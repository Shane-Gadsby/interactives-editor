import { describe, expect, it } from 'vitest';
import { createNode, createProject, type Keyframe, type Project, type Timeline } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { chooseTarget, collectKeys, copySelectedKeys, magnetNudge, panelOrder, pasteKeys, staggerKeys } from '../src/lib/key-edit';

const key = (id: string, t: number, value: Keyframe['value'], ease: Keyframe['ease'] = 'easeInOut'): Keyframe => ({ id, t, value, ease });

function setup(duration = 2000) {
  const p: Project = createProject('K');
  const a = createNode('rect', { name: 'A', x: 0, y: 0, width: 40, height: 40 });
  const b = createNode('rect', { name: 'B', x: 0, y: 0, width: 40, height: 40 });
  const c = createNode('rect', { name: 'C', x: 0, y: 0, width: 40, height: 40 });
  p.artboards[0].children.push(a, b, c);
  const tl: Timeline = {
    id: 'tl',
    name: 'T',
    duration,
    loop: 'once',
    autoplay: false,
    speed: 1,
    tracks: [
      { id: 'ax', nodeId: a.id, prop: 'x', keys: [key('k1', 100, 0), key('k2', 400, 50, 'linear'), key('k3', 700, 90)] },
      { id: 'ao', nodeId: a.id, prop: 'opacity', keys: [key('k4', 100, 0), key('k5', 400, 1)] },
    ],
  };
  p.artboards[0].timelines.push(tl);
  const s = new EditorStore(p);
  s.set({ activeTimelineId: 'tl' });
  setCurrentStore(s);
  return { s, a, b, c };
}
const tl = (s: EditorStore) => s.get().project.artboards[0].timelines[0];
const times = (s: EditorStore, id: string) => tl(s).tracks.find((t) => t.id === id)!.keys.map((k) => k.t);

describe('key clipboard', () => {
  it('collects keys relative to the earliest and keeps their easing', () => {
    const { s } = setup();
    const clip = collectKeys(tl(s), ['ax:k2', 'ax:k3', 'ao:k5'])!;
    expect(clip.tracks).toHaveLength(2);
    expect(clip.tracks[0].keys).toEqual([{ dt: 0, value: 50, ease: 'linear' }, { dt: 300, value: 90, ease: 'easeInOut' }]);
    expect(clip.tracks[1].keys[0].dt).toBe(0);
    expect(collectKeys(tl(s), ['nope:x'])).toBeNull();
  });

  it('pastes at the playhead onto the same track, keeping the spacing, as one undo step', () => {
    const { s } = setup();
    s.set({ selectedKeys: ['ax:k1', 'ax:k2'], selection: [] });
    expect(copySelectedKeys()).toBe(true);
    s.set({ playhead: 1000, selectedKeys: [] });
    expect(pasteKeys()).toBe(true);
    expect(times(s, 'ax')).toEqual([100, 400, 700, 1000, 1300]);
    expect(s.get().selectedKeys).toHaveLength(2);
    const pasted = tl(s).tracks[0].keys.find((k) => k.t === 1300)!;
    expect([pasted.value, pasted.ease]).toEqual([50, 'linear']);
    s.undo();
    expect(times(s, 'ax')).toEqual([100, 400, 700]);
  });

  it('replaces a key that is already at the paste time', () => {
    const { s } = setup();
    s.set({ selectedKeys: ['ax:k2'], selection: [] });
    copySelectedKeys();
    s.set({ playhead: 700, selectedKeys: [] });
    pasteKeys();
    const ax = tl(s).tracks[0].keys;
    expect(ax).toHaveLength(3);
    expect(ax.find((k) => k.t === 700)!.value).toBe(50);
  });

  it('drops keys that would land past the end and says so', () => {
    const { s } = setup(1000);
    s.set({ selectedKeys: ['ax:k1', 'ax:k2', 'ax:k3'], selection: [] });
    copySelectedKeys();
    s.set({ playhead: 800, selectedKeys: [] });
    pasteKeys();
    expect(times(s, 'ax')).toEqual([100, 400, 700, 800]);
    expect(s.get().toast?.kind).toBe('error');
  });

  it('pastes a whole layer’s copied tracks onto another selected layer, creating tracks', () => {
    const { s, b } = setup();
    s.set({ selectedKeys: ['ax:k1', 'ax:k2', 'ao:k4'], selection: [] });
    copySelectedKeys();
    s.set({ playhead: 0, selectedKeys: [], selection: [b.id] });
    pasteKeys();
    const bt = tl(s).tracks.filter((t) => t.nodeId === b.id);
    expect(bt.map((t) => t.prop).sort()).toEqual(['opacity', 'x']);
    expect(bt.find((t) => t.prop === 'x')!.keys.map((k) => k.t)).toEqual([0, 300]);
    // the original layer's tracks are untouched
    expect(times(s, 'ax')).toEqual([100, 400, 700]);
  });

  it('leaves out properties that only mean something on the layer they came from', () => {
    const { s, b, a } = setup();
    s.update((d) => void d.artboards[0].timelines[0].tracks.push({ id: 'do', nodeId: a.id, prop: 'drawOrder', keys: [key('d1', 0, [])] }));
    s.set({ selectedKeys: ['ax:k1', 'do:d1'], selection: [] });
    copySelectedKeys();
    s.set({ selectedKeys: [], selection: [b.id], playhead: 0 });
    pasteKeys();
    expect(tl(s).tracks.filter((t) => t.nodeId === b.id).map((t) => t.prop)).toEqual(['x']);
    expect(s.get().toast?.text).toMatch(/left out/);
  });

  it('pastes a one-track copy onto the single selected track when the kinds match, and refuses when they differ', () => {
    const { s } = setup();
    s.update((d) => void d.artboards[0].timelines[0].tracks.push({ id: 'ay', nodeId: d.artboards[0].children[0].id, prop: 'y', keys: [key('y1', 0, 5)] }));
    s.set({ selectedKeys: ['ax:k2'], selection: [] });
    copySelectedKeys();
    s.set({ selectedKeys: ['ay:y1'], playhead: 500 });
    pasteKeys();
    expect(times(s, 'ay')).toEqual([0, 500]);
    // a number onto a colour track is refused, nothing changes
    s.update((d) => void d.artboards[0].timelines[0].tracks.push({ id: 'ac', nodeId: d.artboards[0].children[0].id, prop: 'fill.color', keys: [key('c1', 0, '#ff0000')] }));
    s.set({ selectedKeys: ['ac:c1'] });
    pasteKeys();
    expect(times(s, 'ac')).toEqual([0]);
    expect(s.get().toast?.kind).toBe('error');
  });

  it('chooses where a paste goes from the selection', () => {
    const { s, a, b } = setup();
    const one = collectKeys(tl(s), ['ax:k1'])!;
    expect(chooseTarget(one, tl(s), [a.id], ['ax:k1'])).toEqual({ mode: 'track', trackId: 'ax' });
    expect(chooseTarget(one, tl(s), [b.id], [])).toEqual({ mode: 'layers', nodeIds: [b.id] });
    expect(chooseTarget(one, tl(s), [], [])).toEqual({ mode: 'source' });
    const two = collectKeys(tl(s), ['ax:k1', 'ao:k4'])!;
    expect(chooseTarget(two, tl(s), [], ['ax:k1'])).toEqual({ mode: 'source' });
  });
});

describe('magnetNudge', () => {
  it('pulls the whole group onto the closest point within reach', () => {
    expect(magnetNudge([100, 300], 48, [500, 345], 6)).toBe(-3);
    expect(magnetNudge([100], 48, [500], 6)).toBeNull();
    expect(magnetNudge([100, 130], 70, [200], 6)).toBe(0);
  });
});

describe('stagger', () => {
  it('offsets each animated layer by one more step, in the order given, and is one undo step', () => {
    const { s, a, b, c } = setup();
    s.update((d) => void d.artboards[0].timelines[0].tracks.push({ id: 'bx', nodeId: b.id, prop: 'x', keys: [key('b1', 0, 0), key('b2', 200, 10)] }, { id: 'cx', nodeId: c.id, prop: 'x', keys: [key('c1', 0, 0)] }));
    let r!: ReturnType<typeof staggerKeys>;
    s.updateTimeline((d) => void (r = staggerKeys(d as Timeline, [a.id, b.id, c.id], 100)));
    expect(r).toMatchObject({ layers: 3, keys: 8 });
    expect(times(s, 'ax')).toEqual([100, 400, 700]);
    expect(times(s, 'ao')).toEqual([100, 400]);
    expect(times(s, 'bx')).toEqual([100, 300]);
    expect(times(s, 'cx')).toEqual([200]);
    s.undo();
    expect(times(s, 'bx')).toEqual([0, 200]);
  });

  it('skips layers with no keys, and refuses (changing nothing) when keys would leave the timeline', () => {
    const { s, a, b, c } = setup(800);
    s.update((d) => void d.artboards[0].timelines[0].tracks.push({ id: 'cx', nodeId: c.id, prop: 'x', keys: [key('c1', 0, 0)] }));
    const t = JSON.parse(JSON.stringify(tl(s))) as Timeline;
    // b has no keys so c is the second layer; a's last key at 700 is the first layer so it stays
    expect(staggerKeys(t, [a.id, b.id, c.id], 50)).toMatchObject({ layers: 2, keys: 6 });
    expect(t.tracks.find((x) => x.id === 'cx')!.keys[0].t).toBe(50);
    const t2 = JSON.parse(JSON.stringify(tl(s))) as Timeline;
    const bad = staggerKeys(t2, [c.id, a.id], 150);
    expect(bad.error).toMatch(/past the end/);
    expect(t2.tracks[0].keys.map((k) => k.t)).toEqual([100, 400, 700]);
    expect(staggerKeys(t2, [a.id], 50).error).toMatch(/two or more/);
    expect(staggerKeys(t2, [c.id, a.id], -150).error).toMatch(/before the start/);
  });

  it('lists layers the way the Layers panel does, top of the stack first', () => {
    const { s, a, b, c } = setup();
    expect(panelOrder(s.artboard()!)).toEqual([c.id, b.id, a.id]);
  });
});
