import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Player, normalizeProject, type Project, type SceneNode } from 'interactives-player';

const load = (): Project => normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', 'joysticks', 'project.json'), 'utf8')));
const byName = (p: Project, artboard: number, name: string) => p.artboards[artboard].children.find((n) => n.name === name) as SceneNode;
const at = (id: string) => (document.querySelector(`[data-ix-id="${id}"]`) as HTMLElement).style.transform;

describe('joysticks example', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is listed, and each artboard has its joystick wired to its own timelines and layers', () => {
    const index = JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', 'index.json'), 'utf8')) as { key: string; artboards: number }[];
    expect(index.find((e) => e.key === 'joysticks')?.artboards).toBe(2);
    const p = load();
    expect(p.artboards.map((a) => a.name)).toEqual(['Eyes', 'Scrub a timeline']);
    for (const ab of p.artboards) {
      const ids = new Set<string>();
      const walkIds = (list: SceneNode[]) => list.forEach((n) => ids.add(n.id));
      walkIds(ab.children);
      for (const j of ab.joysticks ?? []) {
        for (const tl of [j.xTimeline, j.yTimeline].filter(Boolean)) expect(ab.timelines.some((t) => t.id === tl)).toBe(true);
        if (j.handle) expect(ids.has(j.handle)).toBe(true);
      }
      for (const tl of ab.timelines) for (const tr of tl.tracks) expect(ids.has(tr.nodeId)).toBe(true);
    }
  });

  it('eyes: straight ahead before the pointer moves, then they follow it', () => {
    const p = load();
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    const pupil = byName(p, 0, 'Left pupil');
    expect(at(pupil.id)).toContain('translate(308px, 228px');
    //the pointer in the bottom right corner: looking right and down as far as they go
    (player as unknown as { pointer: { x: number; y: number } }).pointer = { x: 800, y: 600 };
    player.step(16);
    expect(at(pupil.id)).toContain('translate(336px, 256px');
    player.destroy();
  });

  it('scrub: the knob is the handle, and where it sits on the track is the Sunrise timeline', () => {
    const p = load();
    p.settings.startArtboardId = p.artboards[1].id;
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    const sun = byName(p, 1, 'Sun');
    const knob = byName(p, 1, 'Knob');
    expect(at(sun.id)).toContain('460px');
    //the knob's centre at the right end of the track
    player.api.node(knob.id)!.set('x', 682);
    player.step(16);
    expect(at(sun.id)).toContain('150px');
    player.destroy();
  });
});
