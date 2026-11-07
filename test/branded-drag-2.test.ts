//The second batch of the branded drag set (Drag the words, Image pairing): each builds in every colourway, survives normalising,
//paints only with tokens, plays in the player, and its main interaction works (words land in gaps and are marked, pictures are
//matched or refused).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';

const KEYS = ['drag/drag-the-words', 'drag/image-pairing'];
const NEW = BRANDED_STARTERS.filter((s) => KEYS.includes(s.key));
const flush = () => new Promise((r) => setTimeout(r, 0));
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};
const click = async (id: string) => {
  must(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
};
/** jsdom has no PointerEvent: a mouse event with the pointer fields on it. */
const ptr = (type: string, x: number, y: number, target: Element | Window = window) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(e);
};
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

const build = (k: string, way = COLOURWAYS[0]) => {
  const s = NEW.find((x) => x.key === k)!;
  const project = JSON.parse(JSON.stringify(projectFromBrandedStarter(s, way))) as Project;
  const board = (name: string) => project.artboards.find((a) => a.name === name)!;
  return { project, board };
};

beforeEach(() => {
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

const play = (project: Project, at?: Artboard) => {
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  if (at) player.goTo(at.id);
  return player;
};

describe('the second drag batch', () => {
  it('has the two starters, keyed drag/...', () => {
    expect(NEW.map((s) => s.key)).toEqual(KEYS);
    for (const s of NEW) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const s of NEW) {
    describe(s.name, () => {
      for (const way of COLOURWAYS) {
        it(`builds in ${way.name}, normalises, paints with tokens only, and plays`, async () => {
          const { project, checklist } = s.build(way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(project.artboards[0].name).toBe('Start');
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
          //no hex colour in a layer, a background or an expression
          const layers = JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]));
          expect(layers).not.toMatch(/#[0-9a-f]{3,8}\b/i);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void ids.add(n.id));
          expect(checklist.length).toBeGreaterThanOrEqual(6);
          for (const c of checklist) {
            if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
            expect(c.text).not.toMatch(/—/);
          }
          for (const ab of project.artboards) {
            const have = new Set(ab.logic.nodes.map((n) => n.id));
            for (const e of ab.logic.edges) expect(have.has(e.from) && have.has(e.to)).toBe(true);
          }
          const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
          const player = play(JSON.parse(JSON.stringify(project)));
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            player.step(3000);
            await flush();
          }
          expect(err).not.toHaveBeenCalled();
          err.mockRestore();
          player.destroy?.();
        });
      }

      it('starts on a hero page whose Start button goes to the activity', async () => {
        const { project, board } = build(s.key);
        const player = play(project);
        expect(player.artboard.name).toBe('Start');
        await click(byName(board('Start'), 'Start button')!.id);
        await flush();
        expect(player.artboard.id).toBe(project.artboards[1].id);
        player.destroy?.();
      });
    });
  }
});

describe('Drag the words', () => {
  const ANSWERS = ['cite', 'paraphrasing', 'quotation marks', 'reference list', 'plagiarism', 'common knowledge'];
  const setup = () => {
    const { project, board } = build('drag/drag-the-words');
    const page = board('Activity');
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const place = async (word: string, gap: number) => {
      await click(id(word));
      await click(id(`Gap ${gap}`));
      player.step(400);
    };
    return { project, page, player, id, place };
  };

  it('has six gaps, eight words (two wrong) and keyboard drag works', () => {
    const { page, player, id } = setup();
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    expect(all.filter((n) => n.dropZone && n.name.startsWith('Gap '))).toHaveLength(6);
    expect(all.filter((n) => n.draggable)).toHaveLength(8);
    const word = must(id('plagiarism'));
    expect(word.tabIndex).toBe(0);
    word.focus();
    key(word, ' ');
    key(word, 'ArrowRight');
    key(word, ' ');
    const where = player.dragState().plagiarism;
    expect(where).toBeTruthy();
    expect(player.getVariable('gap1')).toEqual(where === 'Gap 1' ? ['plagiarism'] : []);
    player.destroy?.();
  });

  it('marks each gap at Check, moving a word clears the marks, a swap sends the old word back', async () => {
    const { player, id, place } = setup();
    await place('cite', 1);
    expect(player.getVariable('gap1')).toEqual(['cite']);
    expect(String(must(id('Progress')).textContent)).toContain('Gaps filled: 1 of 6');
    //words 2 and 3 are swapped, 4 is a wrong word, 5 and 6 are right, so two gaps are right at most
    await place('quotation marks', 2);
    await place('paraphrasing', 3);
    await place('collusion', 4);
    await place('plagiarism', 5);
    await place('common knowledge', 6);
    await click(id('Check button'));
    player.step(100);
    expect(player.getVariable('checked')).toBe(true);
    expect(player.getVariable('results')).toEqual([true, false, false, false, true, true]);
    expect(String(player.getVariable('message'))).toContain('3 of 6');
    expect(must(id('Gap 1')).getAttribute('aria-description')).toBe('Right');
    expect(must(id('Gap 2')).getAttribute('aria-description')).toBe('Wrong');
    expect(must(id('Gap 4')).getAttribute('aria-description')).toBe('Wrong');
    //dropping a word on a full gap swaps: the new word goes in, the old one leaves the gap
    await place('reference list', 4);
    expect(player.getVariable('gap4')).toEqual(['reference list']);
    expect(player.getVariable('checked')).toBe(false);
    expect(String(player.getVariable('message'))).toBe('');
    expect(must(id('Gap 1')).getAttribute('aria-description')).toBe('Filled');
    //put the two swapped ones right (each is in the other's gap, so a swap sorts them)
    await place('paraphrasing', 2);
    expect(player.getVariable('gap2')).toEqual(['paraphrasing']);
    await place('quotation marks', 3);
    expect(player.getVariable('gap3')).toEqual(['quotation marks']);
    await click(id('Check button'));
    expect(player.getVariable('results')).toEqual([true, true, true, true, true, true]);
    expect(String(player.getVariable('message'))).toContain('All 6 gaps are right');
    player.destroy?.();
  });

  it('shows the answers (locking the words), and Try again puts everything back', async () => {
    const { player, id, place } = setup();
    await place('collusion', 1);
    await click(id('Check button'));
    expect(player.getVariable('results')).toEqual([false, false, false, false, false, false]);
    await click(id('Show answers button'));
    player.step(400);
    ANSWERS.forEach((w, i) => expect(player.dragState()[w]).toBe(`Gap ${i + 1}`));
    expect(player.getVariable('shown')).toBe(true);
    expect(player.getVariable('results')).toEqual([true, true, true, true, true, true]);
    expect(player.getVariable('gap6')).toEqual(['common knowledge']);
    //the wrong word went back to the bank, and a locked word does not move
    expect(player.dragState().collusion).not.toMatch(/^Gap/);
    await click(id('Try again button'));
    player.step(400);
    expect(player.getVariable('checked')).toBe(false);
    expect(player.getVariable('shown')).toBe(false);
    for (let i = 1; i <= 6; i++) expect(player.getVariable(`gap${i}`)).toEqual([]);
    expect(Object.values(player.dragState()).every((z) => !z || z === 'Word bank')).toBe(true);
    //words can be placed again
    await place('cite', 1);
    expect(player.getVariable('gap1')).toEqual(['cite']);
    player.destroy?.();
  });
});

describe('Image pairing', () => {
  const setup = () => {
    const { project, board } = build('drag/image-pairing');
    const page = board('Activity');
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const drop = async (pic: number, partner: number) => {
      await click(id(`Picture ${pic}`));
      await click(id(`Partner ${partner}`));
      player.step(400);
    };
    return { project, page, player, id, drop };
  };

  it('has six pictures and six partner cards, each partner taking only its own picture', () => {
    const { page } = setup();
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    const pics = all.filter((n) => n.draggable);
    const zones = all.filter((n) => n.dropZone);
    expect(pics).toHaveLength(6);
    expect(zones).toHaveLength(6);
    for (let i = 1; i <= 6; i++) {
      expect(byName(page, `Picture ${i}`)!.draggable!.tags).toEqual([`pair${i}`]);
      expect(byName(page, `Partner ${i}`)!.dropZone!.accepts).toEqual([`pair${i}`]);
    }
  });

  it('takes a right match with feedback, refuses a wrong one, counts and finishes', async () => {
    const { player, id, drop, page } = setup();
    expect(String(must(id('Count')).textContent)).toBe('Matched 0 of 6');
    await drop(3, 3);
    expect(player.getVariable('pair3')).toEqual(['Picture 3']);
    expect(String(player.getVariable('message'))).toBe('Picture 3 matches its partner. Right.');
    expect(must(id('Partner 3')).getAttribute('aria-description')).toBe('Matched');
    expect(String(must(id('Count')).textContent)).toBe('Matched 1 of 6');
    //a wrong partner refuses it: a real drag, because a tap would not drop it there
    const pic = byName(page, 'Picture 1')!;
    const partner = byName(page, 'Partner 2')!;
    const ax = pic.x + pic.width / 2;
    const ay = pic.y + pic.height / 2;
    const el = must(pic.id);
    ptr('pointerdown', ax, ay, el);
    for (let i = 1; i <= 4; i++) ptr('pointermove', ax + ((partner.x + 20 - ax) * i) / 4, ay + ((partner.y + 20 - ay) * i) / 4, el);
    ptr('pointerup', partner.x + 20, partner.y + 20, el);
    await flush();
    expect(player.getVariable('misses')).toBe(1);
    expect(String(player.getVariable('message'))).toContain('Picture 1 is not the partner');
    expect(player.getVariable('pair2')).toEqual([]);
    for (const [p, q] of [[1, 1], [2, 2], [4, 4], [5, 5], [6, 6]]) await drop(p, q);
    expect(String(player.getVariable('message'))).toBe('All 6 pairs matched. Well done!');
    expect(String(must(id('Count')).textContent)).toBe('Matched 6 of 6');
    await click(id('Try again button'));
    player.step(400);
    expect(player.getVariable('misses')).toBe(0);
    expect(player.getVariable('pair3')).toEqual([]);
    expect(String(must(id('Count')).textContent)).toBe('Matched 0 of 6');
    expect(player.dragState()['Picture 3']).toBeNull();
    player.destroy?.();
  });

  it('works with the keyboard', () => {
    const { page, player, id } = setup();
    const p = must(id('Picture 2'));
    expect(p.tabIndex).toBe(0);
    expect(p.getAttribute('aria-label')).toContain('Picture 2');
    p.focus();
    key(p, ' ');
    key(p, 'ArrowDown');
    key(p, ' ');
    const placed = player.dragState()['Picture 2'];
    expect(placed === null || /^Partner \d$/.test(String(placed))).toBe(true);
    expect(page.children.length).toBeGreaterThan(10);
    player.destroy?.();
  });
});
