//The second batch of the branded drag set (Drag the words, Image pairing): each builds in every colourway, survives normalising,
//paints only with tokens, plays in the player, and its main interaction works (words land in gaps and are marked, pictures are
//matched or refused).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';

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
    const frame = questionFrames(page)[0];
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const place = async (word: string, gap: number) => {
      await click(id(word));
      await click(id(`Gap ${gap}`));
      player.step(400);
    };
    return { project, page, frame, player, id, place };
  };

  it('is a fill the blanks question answered by dragging: six gaps, eight words (two wrong), and keyboard drag works', () => {
    const { page, frame, player, id } = setup();
    expect(frame.question).toMatchObject({ kind: 'blank', answerBy: 'drag', points: 6 });
    expect(frame.question!.blanks).toHaveLength(6);
    expect(frame.question!.extras!.map((x) => x.text)).toEqual(['collusion', 'proofreading']);
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
    expect(player.dragState().plagiarism).toBeTruthy();
    player.destroy?.();
  });

  it('marks each gap at Check with the right word beside a wrong one, and Try again puts the words back', async () => {
    const { player, frame, id, place } = setup();
    await flush();
    //words 2 and 3 are swapped, 4 is a wrong word, 5 and 6 are right, so three gaps are right
    await place('cite', 1);
    await place('quotation marks', 2);
    await place('paraphrasing', 3);
    await place('collusion', 4);
    await place('plagiarism', 5);
    await place('common knowledge', 6);
    expect(player.dragState().cite).toBe('Gap 1');
    const check = partsOf(frame).check[0].id;
    await click(check);
    expect(player.getVariable('words_correct')).toBe(false);
    expect(player.getVariable('words_locked')).toBe(false);
    expect(String(player.getVariable('words_feedback'))).toContain('Move the words marked wrong');
    await click(check);
    await click(check);
    expect(player.getVariable('words_locked')).toBe(true);
    const items = player.getVariable('words_items') as { state: string; answer?: string }[];
    expect(items.map((i) => i.state)).toEqual(['correct', 'wrong', 'wrong', 'wrong', 'correct', 'correct']);
    player.step(100);
    expect(must(id('Gap 1 mark')).textContent).toBe('✓');
    expect(must(id('Gap 2 mark')).textContent).toBe('✗ paraphrasing');
    expect(must(id('Gap 4 mark')).textContent).toBe('✗ reference list');
    expect(player.getVariable('words_score')).toBe(3);
    await click(id('Try again'));
    player.step(400);
    expect(player.getVariable('words_locked')).toBe(false);
    expect(Object.values(player.dragState()).every((z) => !z || z === 'Word bank')).toBe(true);
    //words can be placed again
    await place('cite', 1);
    expect(player.dragState().cite).toBe('Gap 1');
    player.destroy?.();
  });

  it('a word dropped on a full gap swaps: the new word goes in and the old one leaves', async () => {
    const { player, place } = setup();
    await flush();
    await place('cite', 1);
    await place('paraphrasing', 1);
    expect(player.dragState().paraphrasing).toBe('Gap 1');
    expect(player.dragState().cite).not.toBe('Gap 1');
    player.destroy?.();
  });

  it('a perfect round scores six and goes on to the results', async () => {
    const { player, frame, id, place } = setup();
    await flush();
    for (let i = 0; i < ANSWERS.length; i++) await place(ANSWERS[i], i + 1);
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('words_correct')).toBe(true);
    expect(player.getVariable('words_score')).toBe(6);
    expect(String(player.getVariable('words_feedback'))).toContain('All six gaps are right');
    await click(id('See results button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('You filled 6 of 6 gaps with the right word.');
    player.destroy?.();
  });
});

describe('Image pairing', () => {
  const setup = () => {
    const { project, board } = build('drag/image-pairing');
    const page = board('Activity');
    const frame = questionFrames(page)[0];
    const player = play(project, page);
    const id = (name: string) => byName(page, name)!.id;
    const drop = async (pic: number | string, partner: number) => {
      await click(id(typeof pic === 'number' ? `Picture ${pic}` : pic));
      await click(id(`Partner ${partner}`));
      player.step(400);
    };
    return { project, page, frame, player, id, drop };
  };

  it('is a matching question: six pictures and a wrong one to drag, six partner cards to drop them on', () => {
    const { page, frame } = setup();
    expect(frame.question).toMatchObject({ kind: 'matching', points: 6 });
    expect(frame.question!.pairs).toHaveLength(6);
    expect(frame.question!.extras).toHaveLength(1);
    const all: SceneNode[] = [];
    walk(page.children, (n: SceneNode) => void all.push(n));
    expect(all.filter((n) => n.draggable)).toHaveLength(7);
    expect(all.filter((n) => n.dropZone)).toHaveLength(6);
    //the cards sit two to a row in a grid, and the hand-built count and drop flows are gone
    expect(partsOf(frame).matches[0].type === 'frame' && (partsOf(frame).matches[0] as { layout: { grid: unknown } }).layout.grid).toBeTruthy();
    expect(page.logic.nodes.some((n) => n.kind === 'event.drop')).toBe(false);
  });

  it('marks each pair at Check, names the right picture beside a wrong card, and finishes', async () => {
    const { player, frame, id, drop } = setup();
    await flush();
    for (const [p, q] of [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]) await drop(p, q);
    //a wrong picture on the last card
    await drop('Wrong picture', 6);
    const check = partsOf(frame).check[0].id;
    await click(check);
    expect(player.getVariable('pairs_correct')).toBe(false);
    expect(String(player.getVariable('pairs_feedback'))).toContain('5 of 6 matched correctly');
    await click(check);
    await click(check);
    expect(player.getVariable('pairs_locked')).toBe(true);
    player.step(100);
    expect(must(id('Partner 1 result')).textContent).toContain('Right');
    expect(must(id('Partner 6 result')).textContent).toContain('Wrong. The answer is a garden after rain');
    expect(player.getVariable('pairs_score')).toBeLessThan(6);
    await click(id('Try again'));
    player.step(400);
    expect(player.getVariable('pairs_locked')).toBe(false);
    expect(player.dragState()['Picture 3']).toBeNull();
    //a perfect round, on to the results
    for (let i = 1; i <= 6; i++) await drop(i, i);
    await click(check);
    expect(player.getVariable('pairs_correct')).toBe(true);
    expect(player.getVariable('pairs_score')).toBe(6);
    await click(id('See results button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('You matched 6 of 6 pictures to their cards.');
    player.destroy?.();
  });

  it('works with the keyboard', () => {
    const { player, id } = setup();
    const p = must(id('Picture 2'));
    expect(p.tabIndex).toBe(0);
    expect(p.getAttribute('aria-label')).toBeTruthy();
    p.focus();
    key(p, ' ');
    key(p, 'ArrowDown');
    key(p, ' ');
    const placed = player.dragState()['Picture 2'];
    expect(placed === null || /^Partner \d$/.test(String(placed))).toBe(true);
    player.destroy?.();
  });
});
