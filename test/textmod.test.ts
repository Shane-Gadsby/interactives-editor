import { describe, expect, it } from 'vitest';
import { createNode, createProject, nodeModifiers, type Project, type TextModifier, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { importLottie } from '../src/lib/lottie-import';

type Text = Extract<SceneNode, { type: 'text' }>;

function setup(text = 'Hello world') {
  const p: Project = createProject('T');
  const t = createNode('text', { name: 'Title', text }) as Text;
  p.artboards[0].children.push(t);
  const s = new EditorStore(p);
  const node = () => s.artboard()!.children[0] as Text;
  return { s, t, node };
}

describe('text modifier store actions', () => {
  it('adds a modifier that does something visible, and undoes it', () => {
    const { s, t, node } = setup();
    s.addTextModifier(t.id);
    expect(node().modifiers).toHaveLength(1);
    expect(node().modifiers![0]).toMatchObject({ unit: 'letter', shape: 'triangle', y: -12 });
    s.undo();
    expect(node().modifiers).toBeUndefined();
  });

  it('typewriter preset: a letter modifier with a hidden window and a playing timeline on its offset', () => {
    const { s, t, node } = setup('Hello world');
    s.applyTextPreset(t.id, 'typewriter');
    const m = node().modifiers![0];
    expect(m).toMatchObject({ unit: 'letter', start: 0, end: 100, offset: 0, shape: 'square', opacity: 0 });
    const ab = s.artboard()!;
    expect(ab.timelines).toHaveLength(1);
    const tl = ab.timelines[0];
    expect(tl).toMatchObject({ name: 'Typewriter', loop: 'once', autoplay: true });
    // 10 letters at 60 ms each, but never under 800 ms
    expect(tl.duration).toBe(800);
    expect(tl.tracks).toHaveLength(1);
    expect(tl.tracks[0]).toMatchObject({ nodeId: t.id, prop: 'modifiers.0.offset' });
    expect(tl.tracks[0].keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [tl.duration, 100]]);
    // The timeline is the open one, and the preset is one undo step
    expect(s.get().activeTimelineId).toBe(tl.id);
    s.undo();
    expect(node().modifiers).toBeUndefined();
    expect(s.artboard()!.timelines).toHaveLength(0);
  });

  it('wave preset: a looping timeline whose window starts and ends off the text', () => {
    const { s, t, node } = setup();
    s.applyTextPreset(t.id, 'wave');
    const m = node().modifiers![0];
    expect(m).toMatchObject({ unit: 'letter', shape: 'smooth', y: -14 });
    const tl = s.artboard()!.timelines[0];
    expect(tl).toMatchObject({ name: 'Wave', loop: 'loop', autoplay: true });
    const keys = tl.tracks[0].keys;
    // window [start+offset, end+offset] is fully left of the text at the first key and fully right at the last
    expect(m.end + (keys[0].value as number)).toBeLessThanOrEqual(0);
    expect(m.start + (keys[1].value as number)).toBeGreaterThanOrEqual(100);
  });

  it('a second preset adds modifier 1 with its own uniquely named timeline', () => {
    const { s, t, node } = setup();
    s.applyTextPreset(t.id, 'typewriter');
    s.applyTextPreset(t.id, 'typewriter');
    expect(node().modifiers).toHaveLength(2);
    const tls = s.artboard()!.timelines;
    expect(new Set(tls.map((x) => x.name)).size).toBe(2);
    expect(tls[1].tracks[0].prop).toBe('modifiers.1.offset');
  });

  it('removing a modifier drops its tracks and renumbers the later ones', () => {
    const { s, t, node } = setup();
    s.applyTextPreset(t.id, 'typewriter');
    s.applyTextPreset(t.id, 'wave');
    s.addTextModifier(t.id);
    expect(node().modifiers).toHaveLength(3);
    s.removeTextModifier(t.id, 0);
    expect(node().modifiers!.map((m: TextModifier) => m.name)).toEqual(['Wave', undefined]);
    const tls = s.artboard()!.timelines;
    expect(tls[0].tracks).toHaveLength(0);
    expect(tls[1].tracks.map((x) => x.prop)).toEqual(['modifiers.0.offset']);
  });

  it('keys modifier values while recording, including for later modifiers', () => {
    const { s, t } = setup();
    s.addTextModifier(t.id);
    s.addTextModifier(t.id);
    const tlId = s.addTimeline();
    s.set({ recording: true, bottomTab: 'timeline', playhead: 400 });
    s.setProps([t.id], { 'modifiers.1.offset': 30 });
    const tl = s.artboard()!.timelines.find((x) => x.id === tlId)!;
    expect(tl.tracks.map((x) => [x.prop, x.keys.map((k) => [k.t, k.value])])).toEqual([['modifiers.1.offset', [[400, 30]]]]);
    // the document value is untouched while recording
    expect(nodeModifiers(s.artboard()!.children[0] as Text)[1].offset).toBe(0);
  });

  it('plain edits write the modifier into the document', () => {
    const { s, t, node } = setup();
    s.addTextModifier(t.id);
    s.setProps([t.id], { 'modifiers.0.offset': 25, 'modifiers.0.shape': 'round' });
    expect(node().modifiers![0]).toMatchObject({ offset: 25, shape: 'round' });
  });
});

describe('Lottie text animators', () => {
  const lottie = (animators: unknown[]) => ({
    v: '5.7.4',
    fr: 30,
    ip: 0,
    op: 60,
    w: 200,
    h: 100,
    layers: [
      {
        ty: 5,
        ind: 1,
        nm: 'Title',
        ip: 0,
        op: 60,
        ks: { a: { a: 0, k: [0, 0] }, p: { a: 0, k: [10, 50] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
        t: { d: { k: [{ s: { t: 'Hello there', s: 20, f: 'Arial', j: 0, fc: [0, 0, 0] }, t: 0 }] }, a: animators },
      },
    ],
  });

  it('maps a range selector and its properties to a text modifier, with animated offset as a track', () => {
    const { artboard, warnings } = importLottie(
      lottie([
        {
          nm: 'Rise',
          s: { t: 0, b: 3, s: { a: 0, k: 0 }, e: { a: 0, k: 50 }, o: { a: 1, k: [{ t: 0, s: [-50], o: { x: [0.5], y: [0] }, i: { x: [0.5], y: [1] } }, { t: 30, s: [100] }] }, sh: 6, rn: 1, a: { a: 0, k: 80 } },
          a: { p: { a: 0, k: [0, -12] }, s: { a: 0, k: [150, 150] }, r: { a: 0, k: 10 }, o: { a: 0, k: 0 }, fc: { a: 0, k: [1, 0, 0] }, t: { a: 0, k: 100 } },
        },
      ]),
    );
    const group = artboard.children[0] as unknown as { children: Text[] };
    const text = group.children[0];
    expect(text.type).toBe('text');
    expect(text.modifiers).toHaveLength(1);
    expect(text.modifiers![0]).toMatchObject({ name: 'Rise', unit: 'word', start: 0, end: 50, offset: -50, shape: 'smooth', randomize: true, strength: 80, x: 0, y: -12, scale: 1.5, rotation: 10, opacity: 0, color: '#ff0000' });
    // tracking is in thousandths of an em: 100 -> 0.1 * 20px
    expect(text.modifiers![0].letterSpacing).toBe(2);
    const tr = artboard.timelines[0].tracks.find((t) => t.nodeId === text.id && t.prop === 'modifiers.0.offset')!;
    expect(tr.keys.map((k) => [k.t, k.value])).toEqual([[0, -50], [1000, 100]]);
    expect(warnings.some((w) => w.includes('Text animators are not supported'))).toBe(false);
  });

  it('counts a range in units when the selector says so, and warns about what it cannot map', () => {
    const { artboard, warnings } = importLottie(
      lottie([{ nm: 'A', s: { t: 1, b: 1, s: { a: 0, k: 0 }, e: { a: 0, k: 5 }, o: { a: 0, k: 0 }, sh: 1, sm: { a: 0, k: 50 } }, a: { o: { a: 0, k: 0 }, sk: { a: 0, k: 20 } } }]),
    );
    const text = (artboard.children[0] as unknown as { children: Text[] }).children[0];
    // 5 of the 10 letters ("Hello there" without the space)
    expect(text.modifiers![0].end).toBe(50);
    expect(warnings.some((w) => w.includes('smoothness'))).toBe(true);
    expect(warnings.some((w) => w.includes('skew'))).toBe(true);
  });
});
