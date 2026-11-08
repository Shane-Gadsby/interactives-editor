//The games set of branded starters: each builds in every colourway, normalises, paints only with tokens, plays under jsdom
//without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/games';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { layoutCrossword, WORDS, SIZE } from '../src/lib/branded/sets/games/crossword';
import { STAGES } from '../src/lib/branded/sets/games/map';
import { OUTCOMES, QUESTIONS } from '../src/lib/branded/sets/games/personality';
import { DIRECTIONS, WORDS as SEARCH_WORDS, findWord, makeGrid } from '../src/lib/branded/sets/games/wordsearch';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const nextBtn = (id: string) => (el(id)?.matches('button') ? el(id) : el(id)?.querySelector('button')) as HTMLButtonElement;
const get = (key: string) => STARTERS.find((s) => s.key === key)!;

describe('games starters', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const play = (p: Project) => new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false });
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const settle = async (player: Player, ms = 300) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };

  it('has the six starters, keyed games/', () => {
    expect(STARTERS.map((s) => s.key)).toEqual(['games/crossword', 'games/word-search', 'games/arithmetic-quiz', 'games/guess-the-answer', 'games/personality-quiz', 'games/game-map']);
  });

  for (const starter of STARTERS) {
    describe(starter.name, () => {
      it('builds in every colourway, normalises, paints with tokens only and has a checklist that points at real layers', () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          expect(project.artboards.length).toBeGreaterThanOrEqual(2);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(project.artboards[0].name).toBeTruthy();
          const list = project.template!.checklist;
          expect(list.length).toBeGreaterThanOrEqual(5);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
          for (const c of list) {
            if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
            if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
          }
          for (const ab of project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
        }
      });

      it('wires its graphs to things that exist and keeps every expression valid', () => {
        const { project } = starter.build(COLOURWAYS[0]);
        for (const ab of project.artboards) {
          const ids = new Set<string>();
          walk(ab.children, (n) => ids.add(n.id));
          const nodes = new Set(ab.logic.nodes.map((g) => g.id));
          for (const e of ab.logic.edges) expect(nodes.has(e.from) && nodes.has(e.to)).toBe(true);
          for (const g of ab.logic.nodes) {
            const t = (g.params as Record<string, unknown>).target;
            if (typeof t === 'string' && t) expect(ids.has(t), `${g.kind} target`).toBe(true);
            const v = (g.params as Record<string, unknown>).variable;
            if (typeof v === 'string' && v) expect(project.variables.some((x) => x.id === v)).toBe(true);
            const a = (g.params as Record<string, unknown>).artboard;
            if (typeof a === 'string' && a) expect(project.artboards.some((x) => x.id === a)).toBe(true);
          }
        }
      });

      it('keeps every content layer on the page and clear of the footer and logo band', () => {
        const { project } = starter.build(COLOURWAYS[0]);
        for (const ab of project.artboards) {
          //hero, section and end pages carry no footer, and a content page is told apart by its footer text layer
          if (!byName(ab, 'Footer text')) continue;
          for (const n of ab.children) {
            if ((n as { tags?: string[] }).tags?.includes('brand-chrome') || n.name === 'Footer text' || n.name === 'Page title') continue;
            const b = { x: n.x, y: n.y, w: (n as { width?: number }).width ?? 0, h: (n as { height?: number }).height ?? 0 };
            expect(b.x, `${ab.name} / ${n.name}`).toBeGreaterThanOrEqual(0);
            expect(b.x + b.w, `${ab.name} / ${n.name}`).toBeLessThanOrEqual(ab.width);
            expect(b.y, `${ab.name} / ${n.name}`).toBeGreaterThanOrEqual(100);
            expect(b.y + b.h, `${ab.name} / ${n.name}`).toBeLessThanOrEqual(ab.height - 44);
          }
        }
      });

      it('plays in every colourway without throwing, on every page', async () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          const errors: unknown[] = [];
          const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
          const player = play(project);
          await settle(player, 100);
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            await settle(player, 100);
            expect(player.artboard.id).toBe(ab.id);
          }
          player.destroy();
          spy.mockRestore();
          expect(errors).toEqual([]);
        }
      });
    });
  }

  describe('crossword', () => {
    const project = () => projectFromBrandedStarter(get('games/crossword'), COLOURWAYS[0]);
    type Entry = { answer: string; clue: string; row: number; col: number; down: boolean };
    type Cell = { r: number; c: number; ch: string; num: number; t: string; s: string };

    it('lays the words out inside the grid, crossing on shared letters only, with at least eight placed', () => {
      const placed = layoutCrossword(WORDS);
      expect(placed.length).toBeGreaterThanOrEqual(8);
      const grid = new Map<number, string>();
      for (const w of placed) {
        for (let k = 0; k < w.answer.length; k++) {
          const r = w.row + (w.down ? k : 0);
          const c = w.col + (w.down ? 0 : k);
          expect(r >= 0 && r < SIZE && c >= 0 && c < SIZE).toBe(true);
          const at = r * SIZE + c;
          if (grid.has(at)) expect(grid.get(at)).toBe(w.answer[k]);
          grid.set(at, w.answer[k]);
        }
      }
      //every word crosses another one
      for (const w of placed) {
        const mine = new Set(Array.from(w.answer, (_, k) => (w.row + (w.down ? k : 0)) * SIZE + w.col + (w.down ? 0 : k)));
        const crosses = placed.some((o) => o !== w && o.down !== w.down && Array.from(o.answer, (_, k) => (o.row + (o.down ? k : 0)) * SIZE + o.col + (o.down ? 0 : k)).some((i) => mine.has(i)));
        expect(crosses, w.answer).toBe(true);
      }
      //the same list makes the same puzzle
      expect(layoutCrossword(WORDS)).toEqual(placed);
    });

    it('lays out any word list: drops what cannot fit, cleans the letters', () => {
      const p = layoutCrossword([{ answer: 'cat', clue: 'c' }, { answer: 'a-t', clue: 'a' }, { answer: 'ELEVENLETTERS', clue: 'long' }, { answer: 'x', clue: 'short' }, { answer: 'tab', clue: 't' }]);
      expect(p.map((w) => w.answer).sort()).toEqual(['AT', 'CAT', 'TAB']);
    });

    const start = async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Study words crossword', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Crossword');
      const grid = layer(p, 'Crossword', 'Grid');
      const square = layer(p, 'Crossword', 'Square').id;
      const entries = player.getVariable('entries') as Entry[];
      const cells = () => player.getVariable('cells') as Cell[];
      const key = async (k: string, extra: KeyboardEventInit = {}) => {
        //keys land on the square that has focus (the picked square takes it), the way a keyboard user's do
        const at = document.activeElement as HTMLElement | null;
        const target = at && el(grid.id).contains(at) ? at : el(`${square}~${Math.max(0, Number(player.getVariable('sel')))}`);
        target.focus();
        target.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k, bubbles: true, cancelable: true, ...extra }));
        await settle(player, 50);
      };
      const pick = async (r: number, c: number) => {
        await click(`${square}~${r * SIZE + c}`);
        await settle(player, 50);
      };
      return { p, player, grid, square, entries, cells, key, pick };
    };

    it('builds the grid from the entries: 100 squares, letters where words are, numbers where they start', async () => {
      const { player, cells, entries, square } = await start();
      expect(cells()).toHaveLength(100);
      const letters = cells().filter((c) => c.ch);
      const expected = new Set<number>();
      for (const e of entries) for (let k = 0; k < e.answer.length; k++) expected.add((e.row + (e.down ? k : 0)) * SIZE + e.col + (e.down ? 0 : k));
      expect(letters.length).toBe(expected.size);
      const numbered = cells().filter((c) => c.num > 0);
      const starts = new Set(entries.map((e) => e.row * SIZE + e.col));
      expect(numbered.length).toBe(starts.size);
      expect(numbered.map((c) => c.num)).toEqual(numbered.map((_, i) => i + 1));
      expect(document.querySelectorAll(`[data-ix-id^="${square}~"]`)).toHaveLength(100);
      player.destroy();
    });

    it('clicking a square selects its word and shows the clue; clicking it again turns the word', async () => {
      const { p, player, entries, pick } = await start();
      const e = entries.find((x) => !x.down)!;
      await pick(e.row, e.col);
      expect(player.getVariable('sel')).toBe(e.row * SIZE + e.col);
      expect(player.getVariable('dir')).toBe('across');
      expect(textOf(layer(p, 'Crossword', 'Current clue').id)).toContain(e.clue);
      expect(player.getVariable('wordCells')).toHaveLength(e.answer.length);
      //a square that two words share turns the other way on a second click
      const crossing = entries.flatMap((a) => entries.filter((b) => a.down && !b.down).map((b) => ({ a, b }))).find(({ a, b }) => a.col >= b.col && a.col < b.col + b.answer.length && b.row >= a.row && b.row < a.row + a.answer.length)!;
      const r = crossing.b.row;
      const c = crossing.a.col;
      await pick(r, c);
      const first = player.getVariable('dir');
      await pick(r, c);
      expect(player.getVariable('dir')).not.toBe(first);
      player.destroy();
    });

    it('typing fills the square and moves along the word; Backspace clears and steps back; arrows move', async () => {
      const { player, entries, cells, key, pick } = await start();
      const e = entries.find((x) => !x.down)!;
      await pick(e.row, e.col);
      const at = e.row * SIZE + e.col;
      await key(e.answer[0].toLowerCase());
      expect(cells()[at].t).toBe(e.answer[0]);
      expect(player.getVariable('sel')).toBe(at + 1);
      await key(e.answer[1]);
      expect(cells()[at + 1].t).toBe(e.answer[1]);
      expect(player.getVariable('sel')).toBe(at + 2);
      //Backspace on the empty square steps back and clears the one before it
      await key('Backspace');
      expect(cells()[at + 1].t).toBe('');
      expect(player.getVariable('sel')).toBe(at + 1);
      //keys that are not letters, or with Ctrl held, do nothing
      await key('1');
      await key('c', { ctrlKey: true });
      await key('Shift');
      expect(cells()[at + 1].t).toBe('');
      //the arrow keys move to the next square with a letter in it, and turn the word with the direction
      await key('ArrowRight');
      expect(player.getVariable('sel')).toBe(at + 2);
      await key('ArrowLeft');
      await key('ArrowLeft');
      expect(player.getVariable('sel')).toBe(at);
      await key('ArrowLeft');
      expect(player.getVariable('sel')).toBe(at);
      const withDown = entries.find((x) => x.down)!;
      await pick(withDown.row, withDown.col);
      await key('ArrowDown');
      expect(player.getVariable('dir')).toBe('down');
      expect(player.getVariable('sel')).toBe((withDown.row + 1) * SIZE + withDown.col);
      //the word stops at its last letter: typing there does not run on
      const last = e.row * SIZE + e.col + e.answer.length - 1;
      await pick(e.row, e.col + e.answer.length - 1);
      await key('ArrowRight');
      await key('x');
      expect(player.getVariable('sel')).toBe(last);
      player.destroy();
    });

    it('Check marks right and wrong letters, typing again clears the mark, and filling every square says well done', async () => {
      const { p, player, entries, cells, key, pick } = await start();
      const e = entries[0];
      await pick(e.row, e.col);
      await key(e.answer[0]);
      await key(e.answer[1] === 'Z' ? 'Q' : 'Z');
      await click(layer(p, 'Crossword', 'Check').id);
      await settle(player, 50);
      const at = e.row * SIZE + e.col + (e.down ? 0 : 0);
      const first = e.down ? at : at;
      expect(cells()[first].s).toBe('ok');
      const second = e.down ? at + SIZE : at + 1;
      expect(cells()[second].s).toBe('bad');
      expect(textOf(layer(p, 'Crossword', 'Status').id)).toContain('1 letter is wrong');
      //typing over it clears its mark
      await pick(Math.floor(second / SIZE), second % SIZE);
      await key(e.answer[1]);
      expect(cells()[second].s).toBe('');
      //fill the whole grid by typing each word
      for (const [i, w] of entries.entries()) {
        const list = (player.getVariable(w.down ? 'downClues' : 'acrossClues') as { i: number }[]).findIndex((c) => c.i === i);
        await click(`${layer(p, 'Crossword', w.down ? 'Down clue' : 'Across clue').id}~${list}`);
        await settle(player, 50);
        for (const ch of w.answer) await key(ch);
      }
      expect(player.getVariable('done')).toBe(true);
      await settle(player, 50);
      expect(textOf(layer(p, 'Crossword', 'Status').id)).toBe('Crossword complete. Well done!');
      await click(layer(p, 'Crossword', 'Check').id);
      await settle(player, 50);
      expect(textOf(layer(p, 'Crossword', 'Status').id)).toBe('Every letter is right.');
      expect(cells().every((c) => c.ch === '' || c.s === 'ok')).toBe(true);
      player.destroy();
    });

    it('Reveal word fills the chosen word, Reveal all fills the grid and Clear empties it', async () => {
      const { p, player, entries, cells, pick } = await start();
      await click(layer(p, 'Crossword', 'Reveal word').id);
      await settle(player, 50);
      expect(textOf(layer(p, 'Crossword', 'Status').id)).toBe('Select a square first.');
      const e = entries[0];
      await pick(e.row, e.col);
      await click(layer(p, 'Crossword', 'Reveal word').id);
      for (let k = 0; k < e.answer.length; k++) {
        const i = (e.row + (e.down ? k : 0)) * SIZE + e.col + (e.down ? 0 : k);
        expect(cells()[i].t).toBe(e.answer[k]);
        expect(cells()[i].s).toBe('shown');
      }
      expect(player.getVariable('done')).toBe(false);
      await click(layer(p, 'Crossword', 'Reveal all').id);
      expect(cells().every((c) => c.ch === c.t)).toBe(true);
      expect(player.getVariable('done')).toBe(true);
      await settle(player, 50);
      expect(textOf(layer(p, 'Crossword', 'Status').id)).toBe('All the answers are showing.');
      await click(layer(p, 'Crossword', 'Clear').id);
      expect(cells().every((c) => c.t === '' && c.s === '')).toBe(true);
      expect(player.getVariable('done')).toBe(false);
      player.destroy();
    });

    it('a clue is a button: it selects its word, and the clue lists hold every entry', async () => {
      const { p, player, entries, grid } = await start();
      const across = player.getVariable('acrossClues') as { i: number; n: number; start: number }[];
      const down = player.getVariable('downClues') as { i: number; n: number; start: number }[];
      expect(across.length + down.length).toBe(entries.length);
      expect(across.map((c) => c.n)).toEqual([...across.map((c) => c.n)].sort((a, b) => a - b));
      const row = layer(p, 'Crossword', 'Down clue').id;
      const target = el(`${row}~0`);
      expect(target.getAttribute('role')).toBe('button');
      expect(target.tabIndex).toBeGreaterThanOrEqual(0);
      expect(target.getAttribute('aria-label')).toContain('down');
      await click(`${row}~0`);
      await settle(player, 50);
      expect(player.getVariable('sel')).toBe(down[0].start);
      expect(player.getVariable('dir')).toBe('down');
      //the focus goes to the picked word's first square
      expect(document.activeElement).toBe(el(`${layer(p, 'Crossword', 'Square').id}~${down[0].start}`));
      expect(el(grid.id).getAttribute('aria-label')).toContain('arrow keys');
      //the squares are one tab stop between them, not one per square (100 of them would bury the page), and the grid adds none
      const stops = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${layer(p, 'Crossword', 'Square').id}~"]`)].filter((e) => e.tabIndex >= 0 && e.style.display !== 'none');
      expect(stops).toHaveLength(1);
      expect(stops[0]).toBe(el(`${layer(p, 'Crossword', 'Square').id}~${down[0].start}`));
      expect(el(grid.id).tabIndex).toBeLessThan(0);
      player.destroy();
    });

    it('tabbing into the grid lands on the first square with a letter, and the focus follows the cursor as you type', async () => {
      const { player, square, cells, key } = await start();
      const first = cells().findIndex((c) => c.ch !== '');
      const stop = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${square}~"]`)].find((e) => e.tabIndex === 0)!;
      expect(stop).toBe(el(`${square}~${first}`));
      stop.focus();
      await settle(player, 50);
      expect(player.getVariable('sel')).toBe(first);
      //typing moves the cursor along the word, and the keyboard focus is on the square it moved to
      await key('a');
      await settle(player, 50);
      const at = Number(player.getVariable('sel'));
      expect(at).not.toBe(first);
      expect(document.activeElement).toBe(el(`${square}~${at}`));
      player.destroy();
    });

    it('gives each square a name for a screen reader, and the arrows carry the focus over the blanks', async () => {
      const { player, square, entries, key, pick } = await start();
      const e = entries.find((x) => !x.down)!;
      await pick(e.row, e.col);
      const at = e.row * SIZE + e.col;
      expect(el(`${square}~${at}`).getAttribute('aria-label')).toContain(`Row ${e.row + 1}, column ${e.col + 1}`);
      expect(el(`${square}~${at}`).getAttribute('aria-label')).toContain('empty');
      await key('ArrowRight');
      expect(document.activeElement).toBe(el(`${square}~${at + 1}`));
      await key('ArrowLeft');
      expect(document.activeElement).toBe(el(`${square}~${at}`));
      player.destroy();
    });
  });

  describe('word search', () => {
    const project = () => projectFromBrandedStarter(get('games/word-search'), COLOURWAYS[0]);
    const N = 12;
    const GX = 56;
    const GY = 122;
    const xy = (i: number) => ({ clientX: GX + (i % N) * 36 + 18, clientY: GY + Math.floor(i / N) * 36 + 18 });
    //The Wait before the finished page uses a real timer: make the long ones short
    beforeEach(() => {
      const real = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number, ...rest: unknown[]) => real(fn, ms && ms >= 500 && ms < 1000 ? 5 : ms, ...rest)) as typeof setTimeout);
    });

    const start = async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Word search', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Find the words');
      const grid = layer(p, 'Find the words', 'Grid').id;
      const rows = player.getVariable('rows') as string[];
      //jsdom has no hit testing, so the square under a point is worked out from where the grid sits (what a browser's elementsFromPoint says)
      const squareId = layer(p, 'Find the words', 'Letter square').id;
      (document as unknown as { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = (x, y) => {
        const c = Math.floor((x - GX) / 36);
        const r = Math.floor((y - GY) / 36);
        const hit = c >= 0 && c < N && r >= 0 && r < N ? el(`${squareId}~${r * N + c}`) : null;
        return hit ? [hit] : [];
      };
      const pointer = async (type: string, i: number) => {
        el(grid).dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...xy(i) }));
        await settle(player, 50);
      };
      //Where a word starts and ends, as square numbers
      const span = (word: string) => {
        const f = findWord(rows, word)!;
        return [f.row * N + f.col, (f.row + f.dr * (word.length - 1)) * N + f.col + f.dc * (word.length - 1)];
      };
      const drag = async (a: number, b: number) => {
        await pointer('pointerdown', a);
        await pointer('pointermove', a + 1 < N * N ? a : a - 1);
        //move a few pixels so it counts as a drag, then to the end square
        el(grid).dispatchEvent(new MouseEvent('pointermove', { bubbles: true, ...xy(a), clientX: xy(a).clientX + 6 }));
        await settle(player, 20);
        await pointer('pointermove', b);
        await pointer('pointerup', b);
        window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, ...xy(b) }));
        await settle(player, 50);
      };
      //the squares are buttons in the grid's key navigation: a click is how a tap, a mouse click and Enter all arrive
      const square = layer(p, 'Find the words', 'Letter square').id;
      const tap = async (i: number) => {
        await click(`${square}~${i}`);
        await settle(player, 50);
      };
      //a key goes to the square that has the focus
      const key = async (k: string, code = k) => {
        const at = document.activeElement as HTMLElement;
        at.dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));
        //Space clicks a button when it is let go, as it does in a browser
        if (k === ' ') at.dispatchEvent(new KeyboardEvent('keyup', { key: k, code, bubbles: true, cancelable: true }));
        await settle(player, 50);
      };
      const focusSquare = async (i: number) => {
        el(`${square}~${i}`).focus();
        await settle(player, 50);
      };
      const say = () => textOf(layer(p, 'Find the words', 'Message').id);
      return { p, player, grid, rows, pointer, span, drag, key, say, tap, focusSquare, square };
    };

    it('hides every word in the 12 by 12 grid, in several directions, and the same words make the same grid', () => {
      const rows = makeGrid(SEARCH_WORDS);
      expect(rows).toHaveLength(N);
      for (const r of rows) expect(r).toMatch(/^[A-Z]{12}$/);
      const dirs = new Set<string>();
      for (const w of SEARCH_WORDS) {
        const f = findWord(rows, w);
        expect(f, w).not.toBeNull();
        dirs.add(`${f!.dr},${f!.dc}`);
      }
      expect(dirs.size).toBeGreaterThanOrEqual(5);
      expect(makeGrid(SEARCH_WORDS)).toEqual(rows);
      expect(DIRECTIONS).toHaveLength(8);
      //a different list makes a different grid, and a word too long for it is left out
      expect(makeGrid(['ALPHA', 'BETA', 'TOOLONGFORTHEGRID'])).not.toEqual(rows);
      expect(findWord(makeGrid(['ALPHA', 'BETA', 'TOOLONGFORTHEGRID']), 'TOOLONGFORTHEGRID')).toBeNull();
    });

    it('starts with the word list, nothing found, and the clock running', async () => {
      const { p, player } = await start();
      expect(player.getVariable('words')).toEqual(SEARCH_WORDS);
      expect(player.getVariable('found')).toEqual([]);
      await flush(1100);
      expect(player.getVariable('seconds')).toBeGreaterThanOrEqual(1);
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Find the words', 'Letter square').id}~"]`)).toHaveLength(144);
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Find the words', 'Word').id}~"]`)).toHaveLength(8);
      expect(textOf(layer(p, 'Find the words', 'Counts').id)).toContain('Found 0 of 8');
      player.destroy();
    });

    it('dragging across a word finds it: highlighted, struck off the list, counted', async () => {
      const { p, player, span, drag, say } = await start();
      const [a, b] = span('SUMMARY');
      await drag(a, b);
      expect(player.getVariable('found')).toEqual([3]);
      const cells = player.getVariable('foundCells') as number[];
      expect(cells).toHaveLength(7);
      expect(cells).toContain(a);
      expect(cells).toContain(b);
      expect(say()).toBe('Found SUMMARY!');
      expect(player.getVariable('start')).toBe(-1);
      expect(player.getVariable('line')).toEqual([]);
      const row = el(`${layer(p, 'Find the words', 'Word text').id}~3`);
      expect(row.textContent).toBe('✓ SUMMARY');
      expect(row.outerHTML).toContain('line-through');
      expect(textOf(layer(p, 'Find the words', 'Counts').id)).toContain('Found 1 of 8');
      //a found word is not found twice
      await drag(b, a);
      expect(player.getVariable('found')).toEqual([3]);
      expect(say()).toContain('not one of the words');
      player.destroy();
    });

    it('reads a word backwards too, and a drag that is not in a line or not a word finds nothing', async () => {
      const { player, rows, span, drag, say } = await start();
      //any word that runs backwards or up in this grid, read from its end
      const [a, b] = span('NOTES');
      await drag(b, a);
      expect(player.getVariable('found')).toEqual([7]);
      //two squares that are not in a line
      await drag(0, 2 * N + 1);
      expect(player.getVariable('found')).toEqual([7]);
      expect(say()).toContain('straight line');
      //a line that spells nothing
      const f = findWord(rows, 'ESSAY')!;
      const from = f.row * N + f.col;
      await drag(from, from + (4 * f.dr) * N + 4 * f.dc - (f.dr * N + f.dc));
      expect(player.getVariable('found')).toEqual([7]);
      player.destroy();
    });

    it('shows the line while dragging: the squares from the start to where the pointer is, only when they are in a line', async () => {
      const { player, pointer, grid } = await start();
      await pointer('pointerdown', 0);
      el(grid).dispatchEvent(new MouseEvent('pointermove', { bubbles: true, ...xy(0), clientX: xy(0).clientX + 6 }));
      await settle(player, 20);
      await pointer('pointermove', 3);
      expect(player.getVariable('line')).toEqual([0, 1, 2, 3]);
      await pointer('pointermove', 3 * N + 3);
      expect(player.getVariable('line')).toEqual([0, 13, 26, 39]);
      await pointer('pointermove', 2 * N + 1);
      expect(player.getVariable('line')).toEqual([0]);
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, ...xy(2 * N + 1) }));
      await settle(player, 50);
      player.destroy();
    });

    it('works with two clicks: the first letter, then the last', async () => {
      const { player, span, tap, say } = await start();
      const [a, b] = span('QUOTE');
      await tap(a);
      expect(player.getVariable('start')).toBe(a);
      expect(say()).toContain('Start set');
      await tap(b);
      expect(player.getVariable('found')).toEqual([5]);
      expect(say()).toBe('Found QUOTE!');
      //clicking the same letter twice just clears the choice
      await tap(0);
      await tap(0);
      expect(player.getVariable('start')).toBe(-1);
      expect(say()).toContain('Selection cleared');
      player.destroy();
    });

    it('works from the keyboard: arrows move, Enter marks the first and last letter, Escape starts again', async () => {
      const { p, player, grid, span, key, say, focusSquare, square } = await start();
      //the grid is one tab stop: one square holds the tabindex and the arrow keys move between them
      expect(el(grid).tabIndex).toBeLessThan(0);
      expect(el(grid).getAttribute('aria-label')).toContain('arrow keys');
      const stops = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${square}~"]`)].filter((e) => e.tabIndex >= 0);
      expect(stops).toHaveLength(1);
      await focusSquare(0);
      expect(player.getVariable('cursor')).toBe(0);
      await key('ArrowLeft');
      await key('ArrowUp');
      expect(player.getVariable('cursor')).toBe(0);
      const [a, b] = span('SOURCE');
      //walk to the start with the arrows
      const go = async (to: number) => {
        while (Math.floor((player.getVariable('cursor') as number) / N) < Math.floor(to / N)) await key('ArrowDown');
        while (Math.floor((player.getVariable('cursor') as number) / N) > Math.floor(to / N)) await key('ArrowUp');
        while ((player.getVariable('cursor') as number) % N < to % N) await key('ArrowRight');
        while ((player.getVariable('cursor') as number) % N > to % N) await key('ArrowLeft');
      };
      await go(a);
      expect(player.getVariable('cursor')).toBe(a);
      expect(document.activeElement).toBe(el(`${square}~${a}`));
      expect(document.activeElement!.getAttribute('aria-label')).toContain('Row');
      await key('Enter');
      expect(player.getVariable('start')).toBe(a);
      //the line follows the arrow keys once there is a start
      await go(b);
      expect(player.getVariable('end')).toBe(b);
      expect((player.getVariable('line') as number[]).length).toBeGreaterThan(1);
      await key(' ', 'Space');
      expect(player.getVariable('found')).toEqual([6]);
      expect(say()).toBe('Found SOURCE!');
      //Escape drops a half-made choice
      await key('Enter');
      expect(player.getVariable('start')).not.toBe(-1);
      await key('Escape');
      expect(player.getVariable('start')).toBe(-1);
      expect(player.getVariable('line')).toEqual([]);
      void p;
      player.destroy();
    });

    it('the clock counts up while playing, and the showTimer variable hides it', async () => {
      const { p, player } = await start();
      await flush(1150);
      await settle(player, 50);
      expect(player.getVariable('seconds')).toBeGreaterThanOrEqual(1);
      expect(textOf(layer(p, 'Find the words', 'Counts').id)).toMatch(/Time 0:0\d/);
      player.setVariable('showTimer', false);
      await settle(player, 50);
      expect(textOf(layer(p, 'Find the words', 'Counts').id)).toBe('Found 0 of 8');
      player.destroy();
    });

    it('finding all eight goes to the finished page with the time, and Play again starts a fresh board', async () => {
      const { p, player, span, drag } = await start();
      for (const w of SEARCH_WORDS) {
        const [a, b] = span(w);
        await drag(a, b);
      }
      await settle(player, 200);
      expect(player.artboard.name).toBe('Finished');
      expect(textOf(layer(p, 'Finished', 'Result').id)).toMatch(/^You found all 8 words in 0:\d\d\.$/);
      //the clock stopped with the last word
      const stopped = player.getVariable('seconds');
      await flush(1100);
      expect(player.getVariable('seconds')).toBe(stopped);
      await click(layer(p, 'Finished', 'Play again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Find the words');
      expect(player.getVariable('found')).toEqual([]);
      expect(player.getVariable('seconds')).toBe(0);
      player.destroy();
    });

    it('Start again clears the board', async () => {
      const { p, player, span, drag } = await start();
      const [a, b] = span('ESSAY');
      await drag(a, b);
      expect(player.getVariable('found')).toEqual([4]);
      await click(layer(p, 'Find the words', 'Start again').id);
      await settle(player, 50);
      expect(player.getVariable('found')).toEqual([]);
      expect(player.getVariable('foundCells')).toEqual([]);
      player.destroy();
    });
  });

  describe('arithmetic quiz', () => {
    type Sum = { t: string; ans: number; opts: number[] };
    const setup = (vars: Record<string, number | string | boolean> = {}) => {
      const p = projectFromBrandedStarter(get('games/arithmetic-quiz'), COLOURWAYS[0]);
      for (const [k, v] of Object.entries(vars)) p.variables.find((x) => x.name === k)!.initial = v;
      return p;
    };
    const start = async (vars: Record<string, number | string | boolean> = {}) => {
      const p = setup(vars);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Quick sums', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Work it out');
      const sums = () => player.getVariable('sums') as Sum[];
      const typeIn = async (value: string) => {
        const id = layer(p, 'Work it out', 'Answer').id;
        const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(player, 50);
      };
      const on = (name: string) => layer(p, 'Work it out', name).id;
      return { p, player, sums, typeIn, on };
    };
    //Works the sum out from its own text
    const solve = (t: string) => {
      const [a, op, b] = t.split(' ');
      const x = Number(a);
      const y = Number(b);
      return op === '+' ? x + y : op === '−' ? x - y : op === '×' ? x * y : x / y;
    };

    it('makes ten sums, each with the right answer and four distinct options holding it', async () => {
      const { player, sums } = await start();
      expect(sums()).toHaveLength(10);
      for (const s of sums()) {
        expect(solve(s.t)).toBe(s.ans);
        expect(s.opts).toHaveLength(4);
        expect(new Set(s.opts).size).toBe(4);
        expect(s.opts).toContain(s.ans);
        expect(s.opts.every((o) => o >= 0)).toBe(true);
      }
      player.destroy();
    });

    it('follows the operation and the range variables', async () => {
      for (const [op, sign] of [['+', '+'], ['-', '−'], ['×', '×'], ['÷', '÷']] as const) {
        const { player, sums } = await start({ operation: op, lowest: 3, highest: 6, howMany: 15 });
        expect(sums()).toHaveLength(15);
        for (const s of sums()) {
          expect(s.t.split(' ')[1]).toBe(sign);
          expect(solve(s.t)).toBe(s.ans);
          const nums = s.t.split(' ').filter((_, i) => i !== 1).map(Number);
          if (op === '÷') {
            //the answer and the divisor are in range
            expect(s.ans).toBeGreaterThanOrEqual(3);
            expect(s.ans).toBeLessThanOrEqual(6);
            expect(nums[1]).toBeGreaterThanOrEqual(3);
            expect(nums[1]).toBeLessThanOrEqual(6);
          } else {
            for (const n of nums) {
              expect(n).toBeGreaterThanOrEqual(3);
              expect(n).toBeLessThanOrEqual(6);
            }
          }
          if (op === '-') expect(s.ans).toBeGreaterThanOrEqual(0);
        }
        player.destroy();
      }
      const { player, sums } = await start({ operation: 'mixed', howMany: 40 });
      expect(new Set(sums().map((s) => s.t.split(' ')[1])).size).toBe(3);
      player.destroy();
    });

    it('typing a right answer and pressing Check scores it, says so, and Next moves on', async () => {
      const { p, player, sums, typeIn, on } = await start({ mode: 'type' });
      expect(el(on('Answer'))).toBeTruthy();
      expect(el(on('Options')).style.display).toBe('none');
      expect(textOf(on('Sum'))).toBe(`${sums()[0].t} = ?`);
      //Next is off until there is an answer
      expect(nextBtn(on('Next')).disabled).toBe(true);
      //an empty box asks for an answer and does not mark
      await click(on('Check'));
      await settle(player, 50);
      expect(textOf(on('Feedback'))).toBe('Type your answer first.');
      expect(player.getVariable('answered')).toBe(false);
      await typeIn(String(sums()[0].ans));
      await click(on('Check'));
      await settle(player, 50);
      expect(player.getVariable('answered')).toBe(true);
      expect(player.getVariable('correct')).toBe(true);
      expect(player.getVariable('score')).toBe(1);
      expect(textOf(on('Feedback'))).toBe('Correct!');
      expect(textOf(on('Tally'))).toContain('Score: 1');
      expect(nextBtn(on('Next')).disabled).toBe(false);
      await flush(150);
      expect(document.activeElement).toBe(nextBtn(on('Next')));
      //Check again does not count twice
      await click(on('Check'));
      expect(player.getVariable('score')).toBe(1);
      await click(on('Next'));
      await settle(player, 50);
      expect(player.getVariable('q')).toBe(1);
      expect(player.getVariable('answered')).toBe(false);
      expect(player.getVariable('typed')).toBe('');
      expect(textOf(on('Sum'))).toBe(`${sums()[1].t} = ?`);
      expect(textOf(on('Where'))).toBe('Question 2 of 10');
      //a wrong answer shows the right one and scores nothing
      await typeIn(String(sums()[1].ans + 1));
      await click(on('Check'));
      await settle(player, 50);
      expect(player.getVariable('correct')).toBe(false);
      expect(player.getVariable('score')).toBe(1);
      expect(textOf(on('Feedback'))).toBe(`Not quite. ${sums()[1].t} = ${sums()[1].ans}`);
      void p;
      player.destroy();
    });

    it('in choose mode the four options show, picking one marks it, and the options colour right and wrong', async () => {
      const { player, sums, on } = await start({ mode: 'choose' });
      expect(el(on('Answer')).style.display).toBe('none');
      const option = on('Option');
      expect(document.querySelectorAll(`[data-ix-id^="${option}~"]`)).toHaveLength(4);
      const e = el(`${option}~0`);
      expect(e.getAttribute('role')).toBe('button');
      expect(e.tabIndex).toBeGreaterThanOrEqual(0);
      expect(e.getAttribute('aria-label')).toContain('Answer 1');
      const right = sums()[0].opts.indexOf(sums()[0].ans);
      const wrong = right === 0 ? 1 : 0;
      await click(`${option}~${wrong}`);
      await settle(player, 50);
      expect(player.getVariable('correct')).toBe(false);
      expect(player.getVariable('score')).toBe(0);
      expect(el(`${option}~${right}`).getAttribute('aria-description')).toBe('Right answer');
      expect(el(`${option}~${wrong}`).getAttribute('aria-description')).toBe('Your answer, wrong');
      //a second pick is ignored
      await click(`${option}~${right}`);
      expect(player.getVariable('score')).toBe(0);
      await click(on('Next'));
      await settle(player, 50);
      const again = sums()[1];
      await click(`${option}~${again.opts.indexOf(again.ans)}`);
      await settle(player, 50);
      expect(player.getVariable('score')).toBe(1);
      expect(textOf(on('Feedback'))).toBe('Correct!');
      player.destroy();
    });

    it('ten answers go to the results with the score and the time, and Play again makes new sums', async () => {
      const { p, player, sums, typeIn, on } = await start({ mode: 'type', howMany: 4 });
      const first = sums().map((s) => s.t);
      for (let i = 0; i < 4; i++) {
        await typeIn(String(i % 2 === 0 ? sums()[i].ans : sums()[i].ans + 5));
        await click(on('Check'));
        await settle(player, 50);
        if (i === 3) expect(textOf(on('Next'))).toBe('See results');
        await click(on('Next'));
        await settle(player, 100);
      }
      expect(player.artboard.name).toBe('Finished');
      //the clock stopped when the last answer went in
      const stopped = player.getVariable('seconds');
      await flush(1100);
      expect(player.getVariable('seconds')).toBe(stopped);
      expect(textOf(layer(p, 'Finished', 'Result').id)).toBe('You scored 2 out of 4');
      expect(textOf(layer(p, 'Finished', 'Result note').id)).toContain('Good effort');
      await click(layer(p, 'Finished', 'Play again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Work it out');
      expect(player.getVariable('score')).toBe(0);
      expect(player.getVariable('q')).toBe(0);
      expect(sums()).toHaveLength(4);
      //a fresh set (four sums can repeat, so look across a few plays)
      const seen = new Set([first.join('|'), sums().map((s) => s.t).join('|')]);
      for (let i = 0; i < 4; i++) {
        player.goTo(p.artboards[0].id);
        await settle(player, 50);
        player.goTo(p.artboards[1].id);
        await settle(player, 50);
        seen.add(sums().map((s) => s.t).join('|'));
      }
      expect(seen.size).toBeGreaterThan(1);
      player.destroy();
    });

    it('the clock counts up, and showTimer hides it', async () => {
      const { player, on } = await start({ showTimer: true });
      await flush(1150);
      await settle(player, 50);
      expect(player.getVariable('seconds')).toBeGreaterThanOrEqual(1);
      expect(textOf(on('Tally'))).toMatch(/Time: 0:0\d/);
      player.setVariable('showTimer', false);
      await settle(player, 50);
      expect(textOf(on('Tally'))).toBe('Score: 0');
      player.destroy();
    });

    it('the progress bar grows with the questions answered', async () => {
      const { player, sums, typeIn, on } = await start({ mode: 'type', howMany: 5 });
      const w = () => parseFloat((el(on('Progress bar')).querySelector('.ix-bar') as HTMLElement).style.width);
      const before = w();
      await typeIn(String(sums()[0].ans));
      await click(on('Check'));
      await settle(player, 50);
      expect(w()).toBeGreaterThan(before);
      player.destroy();
    });
  });

  describe('guess the answer', () => {
    type Card = { q: string; a: string; note: string };
    const start = async () => {
      const p = projectFromBrandedStarter(get('games/guess-the-answer'), COLOURWAYS[0]);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Guess the answer', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Think, then turn the card');
      const on = (name: string) => layer(p, 'Think, then turn the card', name).id;
      const cards = player.getVariable('cards') as Card[];
      const shown = (id: string) => el(id).style.display !== 'none';
      return { p, player, on, cards, shown };
    };

    it('opens on the first question with the answer hidden', async () => {
      const { player, on, cards, shown } = await start();
      expect(cards).toHaveLength(5);
      expect(player.getVariable('card')).toBe(0);
      expect(player.getVariable('turned')).toBe(false);
      expect(shown(on('Question face'))).toBe(true);
      expect(shown(on('Answer face'))).toBe(false);
      expect(textOf(on('Question text'))).toBe(cards[0].q);
      expect(textOf(on('Progress'))).toBe('Card 1 of 5');
      expect(shown(on('Turn the card'))).toBe(true);
      expect(shown(on('Rating buttons'))).toBe(false);
      expect(el(on('Question picture'))).toBeTruthy();
      player.destroy();
    });

    it('clicking the card (or the button, or Enter on it) turns it over to the answer and offers the two ratings', async () => {
      const { player, on, cards, shown } = await start();
      await click(on('Card'));
      await settle(player, 400);
      expect(player.getVariable('turned')).toBe(true);
      expect(shown(on('Question face'))).toBe(false);
      expect(shown(on('Answer face'))).toBe(true);
      expect(textOf(on('Answer text'))).toBe(cards[0].a);
      expect(textOf(on('Answer note'))).toBe(cards[0].note);
      expect(shown(on('Rating buttons'))).toBe(true);
      expect(shown(on('Rating buttons'))).toBe(true);
      expect(shown(on('Turn the card'))).toBe(false);
      expect(el(on('Card')).getAttribute('aria-label')).toContain(`Answer: ${cards[0].a}`);
      //the card is open again at full width after the turn
      expect(el(on('Card')).style.transform).toMatch(/scale\(1,/);
      //turning again does nothing
      await click(on('Card'));
      await settle(player, 400);
      expect(player.getVariable('turned')).toBe(true);
      player.destroy();
    });

    it('the Turn the card button and Enter on the card both turn it', async () => {
      const a = await start();
      await click(a.on('Turn the card'));
      await settle(a.player, 400);
      expect(a.player.getVariable('turned')).toBe(true);
      a.player.destroy();
      document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
      const b = await start();
      expect(el(b.on('Card')).getAttribute('role')).toBe('button');
      expect(el(b.on('Card')).tabIndex).toBeGreaterThanOrEqual(0);
      expect(el(b.on('Card')).getAttribute('aria-label')).toContain('Press Enter');
      el(b.on('Card')).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle(b.player, 400);
      expect(b.player.getVariable('turned')).toBe(true);
      b.player.destroy();
    });

    it('rating a card moves on to the next, faces down, counting the ones you knew; five cards end on the finished page', async () => {
      const { p, player, on, cards } = await start();
      for (let i = 0; i < 5; i++) {
        expect(player.getVariable('card')).toBe(i);
        expect(textOf(on('Question text'))).toBe(cards[i].q);
        await click(on('Card'));
        await settle(player, 400);
        expect(textOf(on('Answer text'))).toBe(cards[i].a);
        await click(on(i % 2 === 0 ? 'I knew it' : 'Still learning'));
        await settle(player, 300);
        if (i < 4) {
          expect(player.getVariable('turned')).toBe(false);
          expect(textOf(on('Progress'))).toBe(`Card ${i + 2} of 5`);
        }
      }
      expect(player.artboard.name).toBe('Finished');
      expect(player.getVariable('knew')).toBe(3);
      expect(textOf(layer(p, 'Finished', 'Result').id)).toBe('You knew 3 of 5 answers.');
      expect(textOf(layer(p, 'Finished', 'Result note').id)).toContain('good start');
      await click(layer(p, 'Finished', 'Go again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Think, then turn the card');
      expect(player.getVariable('card')).toBe(0);
      expect(player.getVariable('knew')).toBe(0);
      expect(player.getVariable('turned')).toBe(false);
      player.destroy();
    });

    it('follows the cards list: more rows, a longer set', async () => {
      const p = projectFromBrandedStarter(get('games/guess-the-answer'), COLOURWAYS[0]);
      const list = p.variables.find((v) => v.name === 'cards')!;
      list.initial = JSON.stringify([...JSON.parse(String(list.initial)), { q: 'Sixth?', a: 'Yes', note: 'Added.' }]);
      const player = play(p);
      await settle(player, 100);
      player.goTo('Think, then turn the card');
      await settle(player);
      expect(textOf(layer(p, 'Think, then turn the card', 'Progress').id)).toBe('Card 1 of 6');
      player.destroy();
    });
  });

  describe('personality quiz', () => {
    const start = async () => {
      const p = projectFromBrandedStarter(get('games/personality-quiz'), COLOURWAYS[0]);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'What is your study style?', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Questions');
      const answer = layer(p, 'Questions', 'Answer').id;
      const on = (name: string) => layer(p, 'Questions', name).id;
      //Choose the answer of a question by the outcome it fits best
      const choose = async (i: number, outcome: number) => {
        const k = QUESTIONS[i].answers.findIndex((a) => a.points.indexOf(Math.max(...a.points)) === outcome);
        await click(`${answer}~${k}`);
        await settle(player, 50);
      };
      return { p, player, answer, on, choose };
    };

    it('has six questions of four answers, each answer scoring all four outcomes, and every outcome best fits one answer per question', () => {
      expect(QUESTIONS).toHaveLength(6);
      expect(OUTCOMES).toHaveLength(4);
      for (const q of QUESTIONS) {
        expect(q.answers).toHaveLength(4);
        for (const a of q.answers) expect(a.points).toHaveLength(4);
        expect(q.answers.map((a) => a.points.indexOf(Math.max(...a.points))).sort()).toEqual([0, 1, 2, 3]);
      }
    });

    it('shows the first question with its four answers and a progress line', async () => {
      const { player, answer, on } = await start();
      expect(textOf(on('Question'))).toBe(QUESTIONS[0].q);
      expect(textOf(on('Where'))).toBe('Question 1 of 6');
      expect(document.querySelectorAll(`[data-ix-id^="${answer}~"]`)).toHaveLength(4);
      const first = el(`${answer}~0`);
      expect(first.textContent).toBe(QUESTIONS[0].answers[0].text);
      expect(first.getAttribute('role')).toBe('button');
      expect(first.tabIndex).toBeGreaterThanOrEqual(0);
      expect(first.getAttribute('aria-label')).toBe(`Answer 1: ${QUESTIONS[0].answers[0].text}`);
      const w0 = parseFloat((el(on('Progress bar')).querySelector('.ix-bar') as HTMLElement).style.width);
      expect(player.getVariable('scores')).toEqual([0, 0, 0, 0]);
      //an answer adds its points and moves to the next question
      await click(`${answer}~0`);
      await settle(player, 50);
      expect(player.getVariable('scores')).toEqual(QUESTIONS[0].answers[0].points);
      expect(player.getVariable('q')).toBe(1);
      expect(textOf(on('Question'))).toBe(QUESTIONS[1].q);
      expect(textOf(on('Where'))).toBe('Question 2 of 6');
      expect(el(`${answer}~0`).textContent).toBe(QUESTIONS[1].answers[0].text);
      expect(parseFloat((el(on('Progress bar')).querySelector('.ix-bar') as HTMLElement).style.width)).toBeGreaterThan(w0);
      player.destroy();
    });

    for (let outcome = 0; outcome < 4; outcome++) {
      it(`answering every question the way ${OUTCOMES[outcome].name} would ends on ${OUTCOMES[outcome].name}, with its description`, async () => {
        const { p, player, choose } = await start();
        for (let i = 0; i < 6; i++) await choose(i, outcome);
        await settle(player, 100);
        expect(player.artboard.name).toBe('Your result');
        expect(player.getVariable('top')).toBe(outcome);
        expect(textOf(layer(p, 'Your result', 'Result name').id)).toBe(OUTCOMES[outcome].name);
        expect(textOf(layer(p, 'Your result', 'Result description').id)).toBe(OUTCOMES[outcome].text);
        expect(byName(board(p, 'Your result'), 'Result picture')).toBeTruthy();
        //the four scores are shown as shares that add up to about a hundred, the top one biggest
        const score = layer(p, 'Your result', 'Score bar').id;
        const rows = Array.from(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Your result', 'Score percent').id}~"]`)).map((e) => parseInt(e.textContent!));
        expect(rows).toHaveLength(4);
        expect(rows.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(98);
        expect(rows.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(102);
        expect(rows[outcome]).toBe(Math.max(...rows));
        expect(document.querySelectorAll(`[data-ix-id^="${score}~"]`)).toHaveLength(4);
        player.destroy();
      });
    }

    it('a mixed run adds up the points across the questions', async () => {
      const { player, choose } = await start();
      const picks = [3, 1, 2, 3, 1, 2];
      for (let i = 0; i < 6; i++) await choose(i, picks[i]);
      await settle(player, 100);
      const totals = [0, 0, 0, 0];
      picks.forEach((o, i) => {
        const a = QUESTIONS[i].answers.find((x) => x.points.indexOf(Math.max(...x.points)) === o)!;
        a.points.forEach((pt, k) => (totals[k] += pt));
      });
      expect(player.getVariable('scores')).toEqual(totals);
      expect(player.getVariable('top')).toBe(totals.indexOf(Math.max(...totals)));
      player.destroy();
    });

    it('a tie goes to the outcome listed first', async () => {
      const p = projectFromBrandedStarter(get('games/personality-quiz'), COLOURWAYS[0]);
      const list = p.variables.find((v) => v.name === 'questions')!;
      list.initial = JSON.stringify([{ q: 'Level?', answers: [{ text: 'a', points: [1, 1, 1, 1] }, { text: 'b', points: [0, 1, 1, 1] }, { text: 'c', points: [0, 0, 1, 1] }, { text: 'd', points: [0, 0, 0, 1] }] }]);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'What is your study style?', 'Start').id);
      await settle(player);
      await click(`${layer(p, 'Questions', 'Answer').id}~1`);
      await settle(player, 100);
      expect(player.getVariable('scores')).toEqual([0, 1, 1, 1]);
      expect(player.getVariable('top')).toBe(1);
      player.destroy();
    });

    it('Retake goes back to the first question with the scores cleared', async () => {
      const { p, player, on, choose } = await start();
      for (let i = 0; i < 6; i++) await choose(i, 1);
      await settle(player, 100);
      await click(layer(p, 'Your result', 'Retake').id);
      await settle(player);
      expect(player.artboard.name).toBe('Questions');
      expect(player.getVariable('q')).toBe(0);
      expect(player.getVariable('scores')).toEqual([0, 0, 0, 0]);
      expect(textOf(on('Question'))).toBe(QUESTIONS[0].q);
      player.destroy();
    });

    it('follows the questions list: a shorter quiz ends sooner', async () => {
      const p = projectFromBrandedStarter(get('games/personality-quiz'), COLOURWAYS[0]);
      const list = p.variables.find((v) => v.name === 'questions')!;
      list.initial = JSON.stringify(QUESTIONS.slice(0, 2));
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'What is your study style?', 'Start').id);
      await settle(player);
      const answer = layer(p, 'Questions', 'Answer').id;
      await click(`${answer}~0`);
      await settle(player, 50);
      expect(textOf(layer(p, 'Questions', 'Where').id)).toBe('Question 2 of 2');
      await click(`${answer}~0`);
      await settle(player, 100);
      expect(player.artboard.name).toBe('Your result');
      player.destroy();
    });
  });

  describe('game map', () => {
    const MAP = 'Map';
    const start = async () => {
      const p = projectFromBrandedStarter(get('games/game-map'), COLOURWAYS[0]);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'The research journey', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe(MAP);
      const marker = (i: number) => layer(p, MAP, i === 5 ? 'Reward marker' : `Stage ${i + 1} marker`).id;
      const page = (i: number) => `Stage ${i + 1}`;
      const on = (pageName: string, name: string) => layer(p, pageName, name).id;
      //Does the whole stage: the wrong option first, then the right one, then Complete the stage
      const complete = async (i: number) => {
        await click(marker(i));
        await settle(player, 300);
        expect(player.artboard.name).toBe(page(i));
        const wrong = STAGES[i].right === 0 ? 1 : 0;
        await click(on(page(i), `Option ${wrong + 1}`));
        await settle(player, 50);
        await click(on(page(i), `Option ${STAGES[i].right + 1}`));
        await settle(player, 50);
        await click(on(page(i), 'Complete the stage'));
        await settle(player, 300);
        expect(player.artboard.name).toBe(MAP);
      };
      return { p, player, marker, page, on, complete };
    };
    const label = (id: string) => el(id).getAttribute('aria-label')!;

    it('has the map, five stage pages and a reward, with the first stage ready and the rest locked', async () => {
      const { p, player, marker } = await start();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['The research journey', 'Map', ...STAGES.map((_, i) => `Stage ${i + 1}`), 'Reward']);
      expect(player.getVariable('done')).toBe(0);
      expect(label(marker(0))).toContain('ready');
      for (let i = 1; i < 5; i++) expect(label(marker(i))).toContain('locked');
      expect(label(marker(5))).toContain('locked');
      expect(textOf(layer(p, MAP, 'Stage 1 label').id)).toBe(STAGES[0].name);
      expect(textOf(layer(p, MAP, 'Progress').id)).toContain('Choose stage 1');
      for (let i = 0; i < 6; i++) {
        expect(el(marker(i)).getAttribute('role')).toBe('button');
        expect(el(marker(i)).tabIndex).toBeGreaterThanOrEqual(0);
      }
      expect(byName(board(p, MAP), 'Map picture')).toBeTruthy();
      player.destroy();
    });

    it('a locked stage does not open: it says to finish the one before', async () => {
      const { p, player, marker } = await start();
      await click(marker(2));
      await settle(player, 300);
      expect(player.artboard.name).toBe(MAP);
      expect(textOf(layer(p, MAP, 'Progress').id)).toBe('Stage 3 is locked. Finish stage 2 first.');
      await click(marker(5));
      await settle(player, 300);
      expect(player.artboard.name).toBe(MAP);
      expect(textOf(layer(p, MAP, 'Progress').id)).toContain('reward unlocks');
      player.destroy();
    });

    it('a stage page shows its question, says right and wrong, and only offers Complete after the right option', async () => {
      const { p, player, marker, page, on } = await start();
      await click(marker(0));
      await settle(player, 300);
      const name = page(0);
      expect(textOf(on(name, 'Page title'))).toBe(`Stage 1: ${STAGES[0].name}`);
      expect(textOf(on(name, 'Prompt'))).toBe(STAGES[0].prompt);
      expect(el(on(name, 'Complete the stage')).style.display).toBe('none');
      expect(el(on(name, 'Option 1')).getAttribute('role')).toBe('button');
      expect(el(on(name, 'Option 1')).tabIndex).toBeGreaterThanOrEqual(0);
      await click(on(name, 'Option 1'));
      await settle(player, 50);
      expect(player.getVariable('right')).toBe(false);
      expect(textOf(on(name, 'Feedback'))).toContain('Not quite');
      expect(el(on(name, 'Complete the stage')).style.display).toBe('none');
      await click(on(name, 'Option 2'));
      await settle(player, 50);
      expect(player.getVariable('right')).toBe(true);
      expect(textOf(on(name, 'Feedback'))).toContain(STAGES[0].why);
      expect(el(on(name, 'Complete the stage')).style.display).not.toBe('none');
      expect(el(on(name, 'Option 2')).getAttribute('aria-description')).toBe('Right');
      await flush(150);
      expect(document.activeElement).toBe(nextBtn(on(name, 'Complete the stage')));
      //leaving without completing leaves the stage open
      await click(on(name, 'Back to the map'));
      await settle(player, 300);
      expect(player.artboard.name).toBe(MAP);
      expect(player.getVariable('done')).toBe(0);
      expect(label(layer(p, MAP, 'Stage 2 marker').id)).toContain('locked');
      player.destroy();
    });

    it('completing a stage ticks it and unlocks the next; the stages run in order and the reward opens last', async () => {
      const { p, player, marker, complete } = await start();
      for (let i = 0; i < 5; i++) {
        await complete(i);
        expect(player.getVariable('done')).toBe(i + 1);
        expect(label(marker(i))).toContain('complete');
        expect(el(marker(i)).textContent).toBe('✓');
        expect(textOf(layer(p, MAP, 'Progress').id)).toBe(i < 4 ? `Choose stage ${i + 2}. Each stage unlocks when you finish the one before.` : 'Every stage is complete. Open the star to collect your reward.');
        if (i < 4) {
          expect(label(marker(i + 1))).toContain('ready');
          expect(el(marker(i + 1)).textContent).toBe(String(i + 2));
        }
        if (i < 3) expect(label(marker(i + 2))).toContain('locked');
      }
      expect(label(marker(5))).toContain('ready');
      await click(marker(5));
      await settle(player, 300);
      expect(player.artboard.name).toBe('Reward');
      expect(textOf(layer(p, 'Reward', 'Reward text').id)).toBe('You finished all 5 stages. Well done!');
      expect(byName(board(p, 'Reward'), 'Reward picture')).toBeTruthy();
      await click(layer(p, 'Reward', 'Play again').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe(MAP);
      expect(player.getVariable('done')).toBe(0);
      expect(label(marker(0))).toContain('ready');
      player.destroy();
    });

    it('doing a stage again does not lose progress, and the stage names follow the stages list', async () => {
      const { p, player, marker, page, on, complete } = await start();
      await complete(0);
      await complete(1);
      expect(player.getVariable('done')).toBe(2);
      //opening and completing stage 1 again leaves done at 2
      await click(marker(0));
      await settle(player, 300);
      await click(on(page(0), `Option ${STAGES[0].right + 1}`));
      await settle(player, 50);
      await click(on(page(0), 'Complete the stage'));
      await settle(player, 300);
      expect(player.getVariable('done')).toBe(2);
      player.setVariable('stages', ['One', 'Two', 'Three', 'Four', 'Five']);
      await settle(player, 50);
      expect(textOf(layer(p, MAP, 'Stage 3 label').id)).toBe('Three');
      expect(label(marker(2))).toContain('Three');
      player.destroy();
    });
  });

  //Layouts that follow the word list, Enter in the answer box, and keys the page does not also get
  describe('rough edges: layouts from the word list, Enter in a box, keys kept from the page', () => {
    const startGame = async (key: string, home: string, vars: Record<string, unknown> = {}) => {
      const p = projectFromBrandedStarter(get(key), COLOURWAYS[0]);
      for (const [k, v] of Object.entries(vars)) p.variables.find((x) => x.name === k)!.initial = JSON.stringify(v);
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, home, 'Start').id);
      await settle(player);
      return { p, player };
    };
    const press = (target: HTMLElement, k: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(e);
      return e;
    };

    it('the crossword lays itself out from the words list, with no grid positions to edit', async () => {
      const words = [
        { answer: 'cat', clue: 'A pet' },
        { answer: 'tab', clue: 'A browser page' },
        { answer: 'bat', clue: 'A flying mammal' },
        { answer: 'toolongforthegrid', clue: 'Dropped' },
      ];
      const { p, player } = await startGame('games/crossword', 'Study words crossword', { words });
      const entries = player.getVariable('entries') as { answer: string; clue: string; row: number; col: number; down: boolean }[];
      expect(entries.map((e) => e.answer).sort()).toEqual(['BAT', 'CAT', 'TAB']);
      expect(entries.find((e) => e.answer === 'CAT')!.clue).toBe('A pet');
      //the grid, numbers and clue lists follow
      const cells = player.getVariable('cells') as { ch: string; num: number }[];
      expect(cells.filter((c) => c.ch).length).toBeLessThan(9);
      expect(cells.filter((c) => c.num > 0).length).toBeGreaterThan(0);
      const clues = [...(player.getVariable('acrossClues') as unknown[]), ...(player.getVariable('downClues') as unknown[])];
      expect(clues).toHaveLength(3);
      //and the entries variable is a formula, not typed positions
      expect(p.variables.find((v) => v.name === 'entries')!.formula).toBe('crossword(words, 10)');
      player.destroy();
    });

    it('the crossword preview in the editor (its starting values) already follows the words', () => {
      const p = projectFromBrandedStarter(get('games/crossword'), COLOURWAYS[0]);
      const rows = (p.variables.find((v) => v.name === 'entries')!.initial as string);
      expect(JSON.parse(rows).length).toBeGreaterThanOrEqual(8);
      for (const name of ['letters', 'starts', 'cells', 'acrossClues', 'downClues']) expect(p.variables.find((v) => v.name === name)!.formula, name).toBeTruthy();
    });

    it('the word search hides whatever is in the words list', async () => {
      const words = ['ALPHA', 'BRAVO', 'DELTA'];
      const { player } = await startGame('games/word-search', 'Word search', { words });
      const rows = player.getVariable('rows') as string[];
      expect(rows).toHaveLength(12);
      for (const w of words) expect(findWord(rows, w), w).not.toBeNull();
      for (const w of SEARCH_WORDS) expect(findWord(rows, w)).toBeNull();
      player.destroy();
    });

    it('Enter in the arithmetic quiz answer box checks the answer, once, and not before there is one', async () => {
      const { p, player } = await startGame('games/arithmetic-quiz', 'Quick sums', { mode: 'type' });
      const id = layer(p, 'Work it out', 'Answer').id;
      const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement;
      const sums = player.getVariable('sums') as { ans: number }[];
      const enter = async () => {
        input.focus();
        const e = press(input, 'Enter');
        await settle(player, 60);
        return e;
      };
      await enter();
      expect(textOf(layer(p, 'Work it out', 'Feedback').id)).toBe('Type your answer first.');
      expect(player.getVariable('answered')).toBe(false);
      input.value = String(sums[0].ans);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle(player, 50);
      await enter();
      expect(player.getVariable('answered')).toBe(true);
      expect(player.getVariable('score')).toBe(1);
      await enter();
      expect(player.getVariable('score')).toBe(1);
      //other keys typed in the box still do nothing to the quiz
      input.value = '';
      const e = press(input, 'a');
      expect(e.defaultPrevented).toBe(false);
      player.destroy();
    });

    it('the crossword grid keeps arrows, Space and letters from the page, but not Tab or shortcuts', async () => {
      const { p, player } = await startGame('games/crossword', 'Study words crossword');
      //keys land on the focused square, inside the grid (the one square that is the tab stop)
      const grid = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${layer(p, 'Crossword', 'Square').id}~"]`)].find((e) => e.tabIndex === 0 && e.style.display !== 'none')!;
      grid.focus();
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a']) expect(press(grid, k).defaultPrevented, k).toBe(true);
      expect(press(grid, 'Tab').defaultPrevented).toBe(false);
      expect(press(grid, 'r', { ctrlKey: true }).defaultPrevented).toBe(false);
      await settle(player, 50);
      //away from the grid the page scrolls as normal
      expect(press(document.body, 'ArrowDown').defaultPrevented).toBe(false);
      player.destroy();
    });

    it('the word search grid keeps its arrows and Space from the page too', async () => {
      const { p, player } = await startGame('games/word-search', 'Word search');
      //keys land on the focused square, inside the grid
      const square = el(`${layer(p, 'Find the words', 'Letter square').id}~0`);
      square.focus();
      for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ']) expect(press(square, k).defaultPrevented, k).toBe(true);
      expect(press(square, 'Tab').defaultPrevented).toBe(false);
      expect(press(document.body, 'ArrowDown').defaultPrevented).toBe(false);
      player.destroy();
    });
  });
});
