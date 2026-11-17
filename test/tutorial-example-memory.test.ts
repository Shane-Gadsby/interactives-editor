/**
 * The memory tutorial's finished example plays with the list helpers it teaches: positions() and count() in the live variables,
 * and Change list items where turning every face-up card to matched, or back down after a miss.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, type Project } from 'interactives-player';
import { example } from '../scripts/tutorial-examples/memory';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;

type Card = { text: string; pair: number; state: string };

describe('memory tutorial example', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    //the Wait after a miss is a real timer: shorten it
    const real = globalThis.setTimeout;
    vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number, ...rest: unknown[]) => real(fn, ms && ms >= 500 ? 5 : ms, ...rest)) as typeof setTimeout);
  });
  afterEach(() => vi.unstubAllGlobals());

  const start = async () => {
    const p: Project = JSON.parse(JSON.stringify(example.build()));
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    for (let t = 0; t < 100; t += 50) {
      player.step(50);
      await flush();
    }
    const card = p.artboards[0].children.flatMap((n) => ('children' in n ? n.children : [])).find((n) => n.name === 'Card')!.id;
    const click = async (i: number) => {
      el(`${card}~${i}`).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    const settle = async (ms: number) => {
      for (let t = 0; t < ms; t += 50) {
        player.step(50);
        await flush();
      }
    };
    return { player, click, settle, cards: () => player.getVariable('cards') as Card[] };
  };

  it('uses the helpers, not arrow functions, for the live variables and the two list changes', () => {
    const p = example.build();
    expect(p.variables.find((v) => v.name === 'ups')?.formula).toBe('positions(cards, "state", "up")');
    expect(p.variables.find((v) => v.name === 'matched')?.formula).toBe('count(cards, "state", "matched") / 2');
    const ops = p.artboards[0].logic.nodes.filter((n) => n.kind === 'action.setVariable').map((n) => n.params.op);
    expect(ops.filter((o) => o === 'changeWhere')).toHaveLength(2);
    expect(JSON.stringify(p.artboards[0].logic)).not.toContain('=>');
  });

  it('a matching pair becomes matched and counts as one pair', async () => {
    const { player, click, settle, cards } = await start();
    const a = cards().findIndex((c) => c.pair === 1);
    const b = cards().findIndex((c, i) => c.pair === 1 && i !== a);
    await click(a);
    expect(player.getVariable('ups')).toEqual([a]);
    await click(b);
    await settle(200);
    expect(cards()[a].state).toBe('matched');
    expect(cards()[b].state).toBe('matched');
    expect(cards().filter((c) => c.state === 'down')).toHaveLength(10);
    expect(player.getVariable('matched')).toBe(1);
    expect(player.getVariable('moves')).toBe(1);
    player.destroy();
  });

  it('a miss turns both cards back down after the wait', async () => {
    const { player, click, settle, cards } = await start();
    const a = cards().findIndex((c) => c.pair === 0);
    const b = cards().findIndex((c) => c.pair === 1);
    await click(a);
    await click(b);
    expect(player.getVariable('ups')).toEqual([a, b].sort((x, y) => x - y));
    await settle(300);
    expect(cards().every((c) => c.state === 'down')).toBe(true);
    expect(player.getVariable('ups')).toEqual([]);
    expect(player.getVariable('matched')).toBe(0);
    player.destroy();
  });
});
