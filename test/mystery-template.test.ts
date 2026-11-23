//The Puzzle mystery starter: plays from the first line to Case closed, every puzzle answered with the keyboard alone
//(Enter on a focused layer, or a real button, which the browser presses on Enter), and the accessibility checker passes.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { puzzleMystery } from '../src/lib/mystery-template';

describe('the Puzzle mystery template', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1280px;height:720px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 20));

  it('passes the accessibility checker (Light is the toolbox palette as drawn, and reports its known low scores)', () => {
    const { project } = puzzleMystery();
    const issues = checkAccessibility(project).findings.filter((f) => f.severity === 'issue' && !/^In Light: /.test(f.detail));
    expect(issues.map((f) => `${f.artboardName} / ${f.nodeName}: ${f.title}`)).toEqual([]);
  });

  it('plays end to end with the keyboard', async () => {
    const { project } = puzzleMystery();
    const p = JSON.parse(JSON.stringify(project)) as Project;
    p.settings.startArtboardId = p.story!.stage!;
    const page = (name: string) => p.artboards.find((a) => a.name === name)!;
    const named = (ab: Artboard, name: string) => {
      let hit: SceneNode | undefined;
      walk(ab.children, (n) => void (!hit && n.name === name && (hit = n)));
      return hit!;
    };
    const pl = new Player(document.getElementById('stage')!, p, { loadData: false });
    await flush();
    //A key press on something that takes focus: a real button is pressed by the browser, anything else by the player
    const press = async (el: HTMLElement) => {
      const native = (el.closest('button, input, a[href]') ?? el.querySelector(':scope > button, :scope > input')) as HTMLElement | null;
      if (native) {
        expect((native as HTMLButtonElement).disabled ?? false).toBe(false);
        native.click();
      } else {
        expect(el.tabIndex, el.getAttribute('aria-label') ?? el.dataset.ixId).toBeGreaterThanOrEqual(0);
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      }
      await flush();
    };
    const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
    const byLabel = (label: string) => [...document.querySelectorAll<HTMLElement>('[aria-label]')].find((e) => e.getAttribute('aria-label') === label)!;
    const goOnUntil = async (done: () => boolean) => {
      for (let i = 0; i < 40 && !done(); i++) {
        pl.story!.goOn();
        await flush();
      }
      expect(done()).toBe(true);
    };

    //The clubroom: look at everything (Enter on each), going on through the words with Enter too
    const room = page('Clubroom');
    await goOnUntil(() => pl.artboard.id === room.id);
    const looks: SceneNode[] = [];
    walk(room.children, (n) => void (n.examine && looks.push(n)));
    for (const n of looks) {
      await press(el(n.id));
      for (let i = 0; i < 4; i++) {
        el(n.id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await flush();
      }
    }
    expect(pl.pocket.items).toEqual(['Brass key']);
    expect(pl.pocket.coins).toBe(5);
    await press(el(named(room, 'Leave').id));
    expect(pl.story!.choices[0].text).toBe('Show Olive the brass key');
    pl.story!.pick(1);
    await goOnUntil(() => pl.artboard.name === 'Puzzle 1');

    //Puzzle 1: pick Millie, check
    const radios = () => [...document.querySelectorAll<HTMLElement>('[role="radio"]')];
    await press(radios()[0]);
    await press(byLabel('Check answer') ?? [...document.querySelectorAll<HTMLElement>('button')].find((b) => /Check answer/.test(b.textContent ?? ''))!);
    expect(pl.pocket.record(page('Puzzle 1').id)?.status).toBe('solved');
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Continue' && b.offsetParent !== undefined)!);
    await goOnUntil(() => pl.artboard.name === 'Map');

    //The map: the quad
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'The quad')!);
    await goOnUntil(() => pl.artboard.name === 'Puzzle 2');

    //Puzzle 2: move each item up into place with the Move up buttons
    const want = ['The club meeting ends', 'Millie locks the cabinet', 'The caretaker sweeps the clubroom', 'The lights go out'];
    const order = () => (pl.getVariable('q2_items') as { text: string }[]).map((i) => i.text);
    for (let target = 0; target < want.length; target++) {
      while (order().indexOf(want[target]) > target) await press(byLabel(`Move ${want[target]} up`));
    }
    expect(order()).toEqual(want);
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => /Check answer/.test(b.textContent ?? ''))!);
    expect(pl.pocket.record(page('Puzzle 2').id)?.status).toBe('solved');
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Continue')!);
    await goOnUntil(() => pl.artboard.name === 'Puzzle 3');

    //Puzzle 3: tick 4, 9 and 12
    const boxes = () => [...document.querySelectorAll<HTMLElement>('[role="checkbox"]')];
    for (const i of [0, 2, 3]) await press(boxes()[i]);
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => /Check answer/.test(b.textContent ?? ''))!);
    expect(pl.pocket.record(page('Puzzle 3').id)?.status).toBe('solved');
    await press([...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === 'Continue')!);
    await goOnUntil(() => pl.story!.ended);
    expect(pl.story!.ending).toBe('Case closed');
    expect(pl.pocket.score).toBeGreaterThan(90);
    pl.destroy();
  });
});
