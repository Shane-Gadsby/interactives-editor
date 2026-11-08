import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNode, createProject, Player, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { defaultAutoLayout } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { ANIM_PRESETS, applyAnimation, presetTracks, slideDistance, type AnimPresetId } from '../src/lib/animate-presets';

function setup() {
  const p = createProject('Anim');
  const ab = p.artboards[0];
  ab.width = 800;
  ab.height = 500;
  const title = createNode('text', { name: 'Title', text: 'Hello', x: 100, y: 60, width: 300, height: 40, opacity: 0.9 } as Partial<SceneNode>);
  ab.children.push(title);
  return { p, ab, title };
}
const tl = (ab: Artboard, name: string) => ab.timelines.find((t) => t.name === name)!;

describe('animation presets', () => {
  it('each ends in the layer\'s own state, except Fade out which ends clear', () => {
    for (const pr of ANIM_PRESETS) {
      const { p, ab, title } = setup();
      title.scaleX = 1.5;
      const r = applyAnimation(p, ab.id, title.id, pr.id)!;
      expect(r.timelineName).toBe(`Title: ${pr.slug}`);
      const t = tl(ab, r.timelineName);
      expect(t.loop).toBe('once');
      expect(t.calm).toBe(true);
      expect(t.tracks.length).toBeGreaterThan(0);
      for (const track of t.tracks) {
        expect(track.nodeId).toBe(title.id);
        const times = track.keys.map((k) => k.t);
        expect([...times].sort((a, b) => a - b)).toEqual(times);
        expect(new Set(times).size).toBe(times.length);
        const end = track.keys.at(-1)!.value;
        const own = track.prop === 'opacity' ? (pr.id === 'fadeOut' ? 0 : 0.9) : (title as unknown as Record<string, number>)[track.prop];
        expect(end).toBe(own);
      }
    }
  });

  it('writes ordinary nodes: On start or On pointer, then Control timeline', () => {
    const { p, ab, title } = setup();
    const a = applyAnimation(p, ab.id, title.id, 'fadeIn')!;
    const click = applyAnimation(p, ab.id, title.id, 'pulse', { when: 'click' })!;
    const kinds = (id: string) => ab.logic.nodes.find((n) => n.id === id)!;
    expect(kinds(a.eventId).kind).toBe('event.start');
    const ev = kinds(click.eventId);
    expect(ev.kind).toBe('event.pointer');
    expect(ev.params).toMatchObject({ target: title.id, type: 'click' });
    for (const r of [a, click]) {
      const edge = ab.logic.edges.find((e) => e.from === r.eventId)!;
      const step = ab.logic.nodes.find((n) => n.id === edge.to)!;
      expect(step.kind).toBe('action.timeline');
      expect(step.params).toMatchObject({ timeline: r.timelineId, op: 'restart' });
    }
  });

  it('does it again by replacing, not stacking', () => {
    const { p, ab, title } = setup();
    applyAnimation(p, ab.id, title.id, 'fadeIn');
    applyAnimation(p, ab.id, title.id, 'fadeIn', { when: 'click', duration: 1000 });
    expect(ab.timelines.filter((t) => t.name === 'Title: fade in')).toHaveLength(1);
    expect(tl(ab, 'Title: fade in').duration).toBe(1000);
    expect(ab.logic.nodes.filter((n) => n.kind === 'action.timeline')).toHaveLength(1);
    expect(ab.logic.nodes.filter((n) => n.kind.startsWith('event.'))).toHaveLength(1);
    expect(ab.logic.nodes.find((n) => n.kind.startsWith('event.'))!.kind).toBe('event.pointer');
    expect(ab.logic.edges).toHaveLength(1);
  });

  it('holds the first pose through a delay', () => {
    const { ab, title } = setup();
    const r = presetTracks('fadeIn', ab, title, false, { delay: 400, duration: 600 });
    const keys = r.tracks[0].keys;
    expect(keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [400, 0], [1000, 0.9]]);
    expect(r.duration).toBe(1000);
  });

  it('slides from the chosen side by a share of the artboard, ending where the layer sits', () => {
    const { ab, title } = setup();
    expect(slideDistance(ab, 'left')).toBe(160);
    expect(slideDistance(ab, 'top')).toBe(100);
    const from = (side: 'left' | 'right' | 'top' | 'bottom') => presetTracks('slideIn', ab, title, false, { from: side }).tracks.find((t) => t.prop === (side === 'left' || side === 'right' ? 'x' : 'y'))!.keys.map((k) => k.value);
    expect(from('left')).toEqual([-60, 100]);
    expect(from('right')).toEqual([260, 100]);
    expect(from('top')).toEqual([-40, 60]);
    expect(from('bottom')).toEqual([160, 60]);
  });

  it('uses gentler moves where auto layout or a repeater owns the position', () => {
    const { p, ab, title } = setup();
    ab.children = [createNode('frame', { name: 'Row', width: 400, height: 100, layout: defaultAutoLayout('row'), children: [title] } as Partial<SceneNode>)];
    const slide = applyAnimation(p, ab.id, title.id, 'slideIn')!;
    expect(slide.plainer).toBe(true);
    expect(tl(ab, slide.timelineName).tracks.map((t) => t.prop).sort()).toEqual(['opacity', 'scaleX', 'scaleY']);
    const shake = applyAnimation(p, ab.id, title.id, 'shake')!;
    expect(tl(ab, shake.timelineName).tracks.map((t) => t.prop)).toEqual(['rotation']);
    //Pulse and fades don't touch position, so they are as plain as ever
    expect(applyAnimation(p, ab.id, title.id, 'pulse')!.plainer).toBe(false);
  });

  it('returns null for a layer that is not there', () => {
    const { p, ab } = setup();
    expect(applyAnimation(p, ab.id, 'nope', 'pop')).toBeNull();
  });

  it('goes through the store as one undo step, and opens the timeline', () => {
    const { p, ab, title } = setup();
    const s = new EditorStore(p);
    s.set({ activeArtboardId: ab.id });
    const made = s.applyAnimation([title.id], 'pop', { when: 'click' });
    expect(made).toHaveLength(1);
    expect(s.get().activeTimelineId).toBe(made[0].timelineId);
    const artboard = () => s.get().project.artboards[0];
    expect(artboard().timelines).toHaveLength(1);
    s.undo();
    expect(artboard().timelines).toHaveLength(0);
    expect(artboard().logic.nodes).toHaveLength(0);
  });
});

describe('animation presets in the player', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  const less = (on: boolean) => vi.stubGlobal('matchMedia', () => ({ matches: on, addEventListener() {}, removeEventListener() {} }));
  const shown = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;

  const tick = () => new Promise((r) => setTimeout(r, 0));

  function run(preset: AnimPresetId, when: 'start' | 'click', prefersLess: boolean) {
    less(prefersLess);
    const { p, ab, title } = setup();
    applyAnimation(p, ab.id, title.id, preset, { when });
    const player = new Player(document.getElementById('stage')!, p as Project);
    return { player, title };
  }

  it('Fade in on page start begins clear and ends at the layer\'s opacity', async () => {
    const { player, title } = run('fadeIn', 'start', false);
    await tick();
    player.step(1);
    expect(Number(shown(title.id).style.opacity)).toBeLessThan(0.2);
    player.step(700);
    expect(Number(shown(title.id).style.opacity)).toBeCloseTo(0.9, 5);
    player.destroy();
  });

  it('Fade in on page start lands on the end with reduced motion', async () => {
    const { player, title } = run('fadeIn', 'start', true);
    await tick();
    player.step(0);
    expect(Number(shown(title.id).style.opacity)).toBeCloseTo(0.9, 5);
    player.destroy();
  });

  it('Fade out on click does nothing until the click, then ends clear (at once with reduced motion)', async () => {
    const { player, title } = run('fadeOut', 'click', true);
    player.step(0);
    expect(Number(shown(title.id).style.opacity)).toBeCloseTo(0.9, 5);
    shown(title.id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    player.step(0);
    expect(Number(shown(title.id).style.opacity)).toBe(0);
    player.destroy();
  });
});
