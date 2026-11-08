import { describe, expect, it, vi } from 'vitest';
import { CATALOG_BY_KIND, createProject, uid } from 'interactives-player';
import { analyzeUsage } from '../src/lib/dependencies';
import { EditorStore } from '../src/store/store';

describe('blends in the editor', () => {
  it('count as users of the timelines and variables they mix', () => {
    const p = createProject('T');
    const ab = p.artboards[0];
    const mk = (name: string) => ({ id: uid('tl'), name, duration: 1000, loop: 'loop' as const, autoplay: false, speed: 1, tracks: [] as never[] });
    const idle = mk('Idle');
    const run = mk('Run');
    const spare = mk('Spare');
    ab.timelines.push(idle, run, spare);
    p.variables.push({ id: 'vs', name: 'speed', type: 'number', initial: 0 }, { id: 'vw', name: 'weight', type: 'number', initial: 0 });
    ab.blends = [
      { id: 'b1', name: 'Walk cycle', mode: '1d', variable: 'vs', entries: [{ timeline: idle.id, value: 0 }, { timeline: run.id, value: 10 }] },
      { id: 'b2', name: 'Lean', mode: 'additive', entries: [{ timeline: run.id, weightVariable: 'vw' }, { timeline: 'gone' }] },
    ];
    const r = analyzeUsage(p);
    const tl = (n: string) => r.timelines.find((t) => t.name === n)!;
    expect(tl('Idle').usedBy[0].by).toMatchObject({ type: 'blend', name: 'Walk cycle' });
    expect(tl('Run').usedBy.map((u) => u.how)).toEqual(['blend entry', 'blend entry']);
    expect(tl('Spare').unused).toBe(true);
    expect(r.variables.find((v) => v.name === 'speed')!.usedBy[0].how).toBe('blend input');
    expect(r.variables.find((v) => v.name === 'weight')!.usedBy[0].how).toBe('blend weight');
    expect(r.missing.some((m) => m.what === 'timeline' && m.ref === 'gone' && m.by.type === 'blend')).toBe(true);
  });

  it('have Play blend and Stop blend nodes that pick a blend', () => {
    for (const kind of ['action.blendPlay', 'action.blendStop']) {
      const def = CATALOG_BY_KIND[kind];
      expect(def.category).toBe('action');
      //Play blend also takes the blend-in settings of a transition
      expect(def.params.map((x) => x.type)).toEqual(kind === 'action.blendPlay' ? ['blend', 'expr', 'easing', 'expr', 'boolean', 'boolean'] : ['blend']);
    }
  });

  it('are edited through the store (undoable) and copied with new ids when an artboard is duplicated', () => {
    const p = createProject('T');
    const ab = p.artboards[0];
    ab.timelines.push({ id: 'tl1', name: 'A', duration: 1000, loop: 'loop', autoplay: false, speed: 1, tracks: [] });
    const store = new EditorStore(p);
    store.update((d) => {
      d.artboards[0].blends = [{ id: 'b1', name: 'Mix', mode: 'direct', entries: [{ timeline: 'tl1', weight: 0.5 }] }];
      d.artboards[0].logic.nodes.push({ id: 'n1', kind: 'action.blendPlay', x: 0, y: 0, params: { blend: 'b1' } });
    });
    expect(store.get().project.artboards[0].blends).toHaveLength(1);
    store.undo();
    expect(store.get().project.artboards[0].blends).toBeUndefined();
    store.redo();
    store.duplicateArtboard(ab.id);
    const [orig, copy] = store.get().project.artboards;
    expect(copy.blends![0].id).not.toBe(orig.blends![0].id);
    expect(copy.blends![0].entries[0].timeline).toBe(copy.timelines[0].id);
    expect(copy.logic.nodes.find((n) => n.kind === 'action.blendPlay')!.params.blend).toBe(copy.blends![0].id);
    expect(orig.blends![0].entries[0].timeline).toBe('tl1');
  });
});

describe('blend example, what to drag', () => {
  it('labels the slider on the artboard, keeps everything inside it, and the help says where it is', async () => {
    const { blendExample } = await import('../src/lib/blend-example');
    const { createProject } = await import('interactives-player');
    const { TOPICS, topicBody } = await import('../src/help/topics');
    for (const [w, h] of [[800, 600], [390, 844], [1280, 720]]) {
      const ab = createProject('ex').artboards[0];
      ab.width = w;
      ab.height = h;
      const ex = blendExample(ab, ['mix']);
      const slider = ex.nodes[1] as unknown as { x: number; y: number; width: number; height: number; type: string };
      const texts = ex.nodes.filter((n) => n.type === 'text') as unknown as { text: string; x: number; y: number; width: number; height: number }[];
      const caption = texts.find((t) => t.text === 'Drag me: blend weight')!;
      expect(caption).toBeTruthy();
      // the caption sits right above the slider
      expect(caption.y + caption.height).toBeLessThanOrEqual(slider.y);
      expect(slider.y - (caption.y + caption.height)).toBeLessThan(40);
      expect(texts.some((t) => t.text === `${ex.variable.name} = {${ex.variable.name}}`)).toBe(true);
      expect(ex.variable.name).toBe('mix2');
      // on the artboard, wide screens and narrow ones alike (the slider and its caption, at least)
      for (const n of [slider, caption, ...texts]) {
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.y + n.height).toBeLessThanOrEqual(h);
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.x + n.width).toBeLessThanOrEqual(w);
      }
    }
    const body = topicBody(TOPICS.find((t) => t.id === 'blends')!);
    expect(body).toContain('Drag me: blend weight');
    expect(body).toMatch(/Preview.*top right/);
  });
});

describe('blend example', () => {
  it('builds a ball, two poses, a slider bound to a 0..1 variable and a 1D blend that plays', async () => {
    const { blendExample } = await import('../src/lib/blend-example');
    const { createProject, Player } = await import('interactives-player');
    const p = createProject('ex');
    const ab = p.artboards[0];
    const ex = blendExample(ab, []);
    p.variables.push(ex.variable);
    ab.children.push(...ex.nodes);
    ab.timelines.push(...ex.timelines);
    ab.blends = [ex.blend];
    expect(ex.nodes[1]).toMatchObject({ type: 'input', inputType: 'range', bindings: { value: ex.variable.name }, bindingModes: { value: 'both' } });
    document.body.innerHTML = '<div id="st" style="width:800px;height:600px"></div>';
    let raf: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => ((raf = f), 1));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const player = new Player(document.getElementById('st')!, p, { loadData: false });
    const scale = () => (document.querySelector(`[data-ix-id="${ex.nodes[0].id}"]`) as HTMLElement).style.transform;
    const tick = (t: number) => raf && (raf as FrameRequestCallback)(t);
    tick(16);
    tick(32);
    expect(scale()).toContain('scale(0.6, 0.6)');
    player.setVariable(ex.variable.name, 1);
    tick(48);
    tick(64);
    expect(scale()).toContain('scale(1.8, 1.8)');
    vi.unstubAllGlobals();
  });
});
