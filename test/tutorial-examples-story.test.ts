/**
 * The Stories and games tutorials' finished examples (examples/tut-<slug>/project.json), played: each does what its tutorial's
 * last step says it does.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findWord } from '../src/lib/branded/sets/games/wordsearch';
import { Player, normalizeProject, sanitizeProject, type Project, type SceneNode } from 'interactives-player';

const dir = path.resolve(__dirname, '..', 'examples');
const load = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.join(dir, key, 'project.json'), 'utf8'))));
const find = (list: SceneNode[], name: string): SceneNode | undefined => {
  for (const n of list) {
    if (n.name === name) return n;
    if ('children' in n) {
      const hit = find(n.children, name);
      if (hit) return hit;
    }
  }
  return undefined;
};
const el = (id: string) => document.querySelector(`[data-ix-id="${id}"]`) as HTMLElement;
const click = (id: string) => el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));

//Start-up (the On start flows) runs a moment after the player is made, as it does on a page
async function play(key: string, startPage?: string) {
  const p = load(key);
  if (startPage) p.settings.startArtboardId = p.artboards.find((a) => a.name === startPage)!.id;
  const player = new Player(document.getElementById('stage')!, p, { loadData: false });
  await new Promise((r) => setTimeout(r, 30));
  player.step(16);
  const named = (name: string) => find(player.artboard.children, name)!;
  const press = (name: string) => {
    click(named(name).id);
    player.step(16);
    player.step(600);
    player.step(16);
  };
  return { p, player, named, press };
}

describe('Stories and games tutorial examples', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('branching: the best route scores 6 and ends on the strong outcome, with the path so far', async () => {
    const { player, press } = await play('tut-branching');
    press('Choice 1');
    expect(player.artboard.name).toBe('Sam replies');
    expect(player.getVariable('score')).toBe(3);
    press('Choice 1');
    expect(player.getVariable('score')).toBe(6);
    expect(player.getVariable('taken')).toEqual(['Asked Sam', 'Set a checkpoint']);
    expect(player.artboard.name).toBe('A strong outcome');
    player.destroy();
  });

  it('branching: staying quiet ends on the learning moment', async () => {
    const { player, press } = await play('tut-branching');
    press('Choice 2');
    expect(player.artboard.name).toBe('Wednesday night');
    press('Choice 2');
    expect(player.getVariable('score')).toBe(0);
    expect(player.artboard.name).toBe('A learning moment');
    player.destroy();
  });

  it('memory: a pair stays up, a miss turns back after the wait, and the moves count', async () => {
    const { player, named } = await play('tut-memory');
    type Card = { text: string; pair: number; state: string };
    const cards = () => player.getVariable('cards') as Card[];
    expect(cards()).toHaveLength(12);
    expect(cards().every((c) => c.state === 'down')).toBe(true);
    const card = named('Card');
    const tap = (i: number) => {
      el(`${card.id}~${i}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      player.step(16);
    };
    //a miss: the first card and one that is not its pair
    const first = cards()[0];
    const miss = cards().findIndex((c, i) => i > 0 && c.pair !== first.pair);
    tap(0);
    tap(miss);
    expect(cards().filter((c) => c.state === 'up')).toHaveLength(2);
    expect(player.getVariable('moves')).toBe(1);
    //a third card waits while two are up
    const other = cards().findIndex((c, i) => i !== 0 && i !== miss && c.state === 'down');
    tap(other);
    expect(cards()[other].state).toBe('down');
    await new Promise((r) => setTimeout(r, 1100));
    player.step(16);
    expect(cards().every((c) => c.state === 'down')).toBe(true);
    //a match stays
    const mate = cards().findIndex((c, i) => i > 0 && c.pair === first.pair);
    tap(0);
    tap(mate);
    expect(cards()[0].state).toBe('matched');
    expect(cards()[mate].state).toBe('matched');
    expect(player.getVariable('matched')).toBe(1);
    expect(player.getVariable('moves')).toBe(2);
    player.destroy();
  });

  it('personality: the first answer every time adds up to the Planner result', async () => {
    const { player, press } = await play('tut-personality');
    press('Answer 1');
    expect(player.artboard.name).toBe('Question 2');
    press('Answer 1');
    press('Answer 1');
    expect([player.getVariable('planner'), player.getVariable('explorer'), player.getVariable('collaborator')]).toEqual([6, 0, 3]);
    expect(player.artboard.name).toBe('You are a Planner');
    player.destroy();
  });

  it('personality: the highest tally picks the page', async () => {
    const { player, press } = await play('tut-personality');
    press('Answer 3');
    press('Answer 2');
    press('Answer 3');
    expect([player.getVariable('planner'), player.getVariable('explorer'), player.getVariable('collaborator')]).toEqual([1, 4, 4]);
    //a tie between Explorer and Collaborator goes to the one the formula asks about first
    expect(player.artboard.name).toBe('You are an Explorer');
    player.destroy();
  });

  it('progress: Mark as done adds the task to done and takes it out again, and the master panel follows', async () => {
    const { player, press } = await play('tut-progress', 'Plan your week');
    press('Mark as done');
    expect(player.getVariable('done')).toEqual(['Planning']);
    expect(document.getElementById('stage')!.textContent).toContain('Your progress: 1 of 3 done');
    press('Mark as done');
    expect(player.getVariable('done')).toEqual([]);
    player.destroy();
  });

  it('progress: Back and Next are wired once on the Progress panel master and move through the pages', async () => {
    const { p, player } = await play('tut-progress', 'Welcome');
    const panel = p.artboards.find((a) => a.name === 'Progress panel')!;
    expect(panel.logic.nodes.filter((n) => n.kind === 'action.artboard').map((n) => n.params.to).sort()).toEqual(['next', 'previous']);
    const next = panel.children.find((n) => n.name === 'Next button')!;
    el(`ixm~${next.id}`).querySelector('button')!.click();
    for (let i = 0; i < 4; i++) {
      player.step(100);
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(player.artboard.name).toBe('Plan your week');
    player.destroy();
  });

  it('scene: the bubbles start hidden and Skip jumps both timelines to the end', async () => {
    const { player, named } = await play('tut-scene');
    const sam = el(named('Sam bubble').id);
    expect(sam.style.opacity).toBe('0');
    click(named('Skip').id);
    //each Play or stop an animation waits until its timeline is done (Continue: When it finishes), which a jump makes at once
    for (let i = 0; i < 3; i++) {
      player.step(16);
      await new Promise((r) => setTimeout(r, 20));
    }
    player.step(16);
    expect(sam.style.opacity).toBe('1');
    expect(el(named('Alex bubble').id).style.opacity).toBe('1');
    player.destroy();
  });

  it('word games: the grid hides every word of the list and the crossword is laid out from clues', async () => {
    const { player } = await play('tut-wordgames');
    const rows = player.getVariable('rows') as string[];
    const words = player.getVariable('words') as string[];
    expect(rows).toHaveLength(12);
    for (const w of words) expect(findWord(rows, w), w).not.toBeNull();
    const entries = player.getVariable('entries') as { answer: string }[];
    expect(entries.length).toBeGreaterThanOrEqual(6);
    expect(entries.every((e) => (player.getVariable('clues') as { answer: string }[]).some((c) => c.answer === e.answer))).toBe(true);
    player.destroy();
  });
});
