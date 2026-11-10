/**
 * The Content and explore Build it examples do what their tutorials say: played in the real player, each control changes the state
 * the steps describe (examples.test.ts already checks that they load, play, carry notes and pass the layout check).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, sanitizeProject, type Project, type SceneNode } from 'interactives-player';

const dir = path.resolve(__dirname, '..', 'examples');
const load = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.join(dir, key, 'project.json'), 'utf8'))));
const find = (list: SceneNode[], name: string): SceneNode => {
  for (const n of list) {
    if (n.name === name) return n;
    if ('children' in n) {
      const hit = find(n.children, name) as SceneNode | undefined;
      if (hit) return hit;
    }
  }
  return undefined as never;
};
const el = (id: string) => document.querySelector(`[data-ix-id="${id}"]`) as HTMLElement;
const click = (id: string) => el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const copies = (id: string) => document.querySelectorAll(`[data-ix-id^="${id}~"]`).length;

describe('Content and explore tutorial examples', () => {
  let player: Player | null = null;
  const play = (key: string, artboard = 0) => {
    const p = load(key);
    p.settings.startArtboardId = p.artboards[artboard].id;
    player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    return { p, ab: p.artboards[artboard], player };
  };
  const tick = () => player!.step(16);

  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    player?.destroy();
    player = null;
    vi.unstubAllGlobals();
  });

  it('reveal: a point opens its dialog and is marked seen, Close hides it again', () => {
    const { ab, player } = play('tut-reveal');
    const dialog = find(ab.children, 'Dialog 2');
    expect(dialog.visible).toBe(false);
    click(find(ab.children, 'Point 2').id);
    tick();
    expect(player.getVariable('seen2')).toBe(true);
    expect(player.getVariable('seen1')).toBe(false);
    expect(el(dialog.id).getAttribute('role')).toBe('dialog');
    expect(el(dialog.id).style.display).not.toBe('none');
    const close = (dialog as SceneNode & { children: SceneNode[] }).children.find((n) => n.name === 'Close')!;
    click(close.id);
    tick();
    expect(el(dialog.id)?.style.display ?? 'none').toBe('none');
  });

  it('flip cards: six copies of one card, and a click turns just that one over and back', () => {
    const { ab, player } = play('tut-flipcards');
    const card = find(ab.children, 'Card');
    expect(copies(card.id)).toBeGreaterThanOrEqual(6);
    click(`${card.id}~2`);
    tick();
    expect(player.getVariable('flipped')).toEqual([2]);
    click(`${card.id}~4`);
    click(`${card.id}~2`);
    tick();
    expect(player.getVariable('flipped')).toEqual([4]);
    click(find(ab.children, 'Turn all back').id);
    tick();
    expect(player.getVariable('flipped')).toEqual([]);
  });

  it('accordion: one section open at a time, and a second click closes it', () => {
    const { ab, player } = play('tut-accordion');
    const header = find(ab.children, 'Section header');
    expect(player.getVariable('open')).toEqual([0]);
    click(`${header.id}~2`);
    tick();
    expect(player.getVariable('open')).toEqual([2]);
    click(`${header.id}~2`);
    tick();
    expect(player.getVariable('open')).toEqual([]);
  });

  it('carousel: Next wraps round, a dot jumps, and stepping by hand stops the autoplay', () => {
    const { ab, player } = play('tut-carousel');
    const next = find(ab.children, 'Next').id;
    for (let i = 0; i < 3; i++) click(next);
    tick();
    expect(player.getVariable('slide')).toBe(4);
    click(next);
    tick();
    expect(player.getVariable('slide')).toBe(1);
    click(find(ab.children, 'Previous').id);
    tick();
    expect(player.getVariable('slide')).toBe(4);
    click(`${find(ab.children, 'Dot').id}~1`);
    tick();
    expect(player.getVariable('slide')).toBe(2);
    click(find(ab.children, 'Play').id);
    tick();
    expect(player.getVariable('playing')).toBe(true);
    click(next);
    tick();
    expect(player.getVariable('playing')).toBe(false);
  });

  it('compare: the handle is tied to handleX both ways, and the Before frame follows it', () => {
    const { ab, player } = play('tut-compare');
    const handle = find(ab.children, 'Divider handle') as SceneNode & { draggable?: unknown };
    expect(handle.draggable).toBeTruthy();
    expect(handle.bindingModes?.x).toBe('both');
    expect(player.getVariable('handleX')).toBe(380);
    const before = find(ab.children, 'Before reveal');
    expect(el(before.id).style.width).toBe('340px');
    player.setVariable('handleX', 100);
    tick();
    expect(el(before.id).style.width).toBe('60px');
  });

  it('presentation: Next goes to the next slide, and the master is not counted as one', () => {
    const { p, ab, player } = play('tut-presentation');
    expect(p.artboards.find((a) => a.name === 'Slide master')?.isMaster).toBe(true);
    expect(el(find(ab.children, 'Page counter').id).textContent).toContain('Page 1 of 4');
    click(find(ab.children, 'Next button').id);
    player.step(400);
    player.step(400);
    expect(player.artboard.name).toBe('Plan your week');
  });

  it('diagram: a click folds a branch of the mind map, and the flowchart follows the answers', () => {
    const a = play('tut-diagram', 0);
    expect((a.player.getVariable('map') as unknown[]).length).toBe(10);
    click(`${find(a.ab.children, 'Idea').id}~1`);
    tick();
    expect(a.player.getVariable('folded')).toEqual(['sleep']);
    const map = a.player.getVariable('map') as { id: string; visible: boolean }[];
    expect(map.find((m) => m.id === 'sleep1')?.visible).toBe(false);
    a.player.destroy();

    const b = play('tut-diagram', 1);
    const choice = find(b.ab.children, 'Choice').id;
    click(`${choice}~0`);
    tick();
    expect(b.player.getVariable('current')).toBe('d1');
    click(`${choice}~1`);
    tick();
    expect(b.player.getVariable('current')).toBe('p2');
    click(find(b.ab.children, 'Start again').id);
    tick();
    expect(b.player.getVariable('current')).toBe('s1');
  });
});
