//The games, story and writing starters after the template sweep: what each one now does with the native features (live variables,
//clocks, key navigation, page groups, user data...). The behaviour of each starter is in branded-games, branded-story and branded-writing.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, walk, type Artboard, type LogicNode, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const starter = (key: string) => BRANDED_STARTERS.find((s) => s.key === key)!;
const build = (key: string) => projectFromBrandedStarter(starter(key), COLOURWAYS[0]);
const pages = (p: Project) => p.artboards.filter((a) => !a.isMaster);
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const nodes = (p: Project): LogicNode[] => p.artboards.flatMap((a) => a.logic.nodes);
const kinds = (p: Project, kind: string) => nodes(p).filter((n) => n.kind === kind);
const count = (p: Project, type: string) => {
  let n = 0;
  for (const a of p.artboards) walk(a.children, (x) => void (x.type === type && n++));
  return n;
};
const liveNames = (p: Project) => p.variables.filter((v) => v.live).map((v) => v.name);

describe('games, story and writing after the sweep', () => {
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

  it('every starter keeps its notes outside its pages, short, and in the template voice', () => {
    for (const s of BRANDED_STARTERS.filter((x) => ['games', 'story', 'writing'].includes(x.set))) {
      const p = projectFromBrandedStarter(s, COLOURWAYS[0]);
      const notes = p.artboards.flatMap((a) => (a.notes ?? []).map((n) => ({ a, n })));
      expect(notes.length, s.key).toBeGreaterThanOrEqual(2);
      expect(notes.length, s.key).toBeLessThanOrEqual(8);
      for (const { a, n } of notes) {
        const inside = n.x < a.width && n.y < a.height && n.x + n.w > 0 && n.y + n.h > 0;
        //a note beside the page (below it), or anchored to a layer; never over the content
        expect(inside && !n.anchor, `${s.key}: ${a.name}`).toBe(false);
        expect(n.text.length, s.key).toBeLessThan(420);
        expect(n.text, s.key).not.toContain('—');
        expect(n.author).toBe('Template');
      }
    }
  });

  describe('interactive book', () => {
    const KEY = 'story/interactive-book';
    it('has three chapter groups, live progress, list variables and one open-chapter flow', () => {
      const p = build(KEY);
      expect(p.artboardGroups).toHaveLength(3);
      for (const g of p.artboardGroups!) expect(pages(p).filter((a) => a.group === g.id).length).toBeGreaterThanOrEqual(2);
      expect(liveNames(p)).toEqual(['progress', 'chaptersDone', 'score']);
      expect(p.variables.filter((v) => v.persist).map((v) => v.name)).toEqual(['reached', 'results']);
      //no hard wired neighbours: every page's Next and Previous follow the page order
      const nav = kinds(p, 'action.artboard');
      expect(nav.filter((n) => n.params.to === 'next').length).toBeGreaterThanOrEqual(8);
      expect(nav.filter((n) => n.params.to === 'expression')).toHaveLength(1);
      expect(count(p, 'progress')).toBeGreaterThanOrEqual(9);
      expect(JSON.stringify(pages(p).flatMap((a) => a.children))).toContain('pageCount');
    });

    it('opens a chapter from its card, moves inside the chapter, and goes on to the next chapter at the end', async () => {
      const p = build(KEY);
      const player = play(p);
      await settle(player, 100);
      player.goTo(board(p, 'Contents').id);
      await settle(player, 100);
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Contents', 'Chapter card').id}~"]`)).toHaveLength(3);
      expect(textOf(`${layer(p, 'Contents', 'Chapter name').id}~1`)).toBe('Using sources well');
      await click(`${layer(p, 'Contents', 'Open chapter button').id}~1`);
      await settle(player, 300);
      expect(player.artboard.name).toBe('2.1 Why we reference');
      expect(textOf(layer(p, '2.1 Why we reference', 'Page count').id)).toBe('Page 1 of 3');
      expect(player.getVariable('reached')).toEqual([0, 1, 0]);
      await click(layer(p, '2.1 Why we reference', 'Next button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('2.2 Quote, paraphrase, reference');
      expect(textOf(layer(p, '2.2 Quote, paraphrase, reference', 'Page count').id)).toBe('Page 2 of 3');
      expect(player.getVariable('reached')).toEqual([0, 2, 0]);
      //Previous from the first page of a chapter goes back to the last page of the chapter before, and from the first page of the book to the contents
      await click(layer(p, '2.2 Quote, paraphrase, reference', 'Previous button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('2.1 Why we reference');
      await click(layer(p, '2.1 Why we reference', 'Previous button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('1.3 Check your understanding');
      player.goTo(board(p, '1.1 Honesty, trust and fairness').id);
      await settle(player, 100);
      expect(textOf(layer(p, '1.1 Honesty, trust and fairness', 'Previous button').id)).toBe('Contents');
      await click(layer(p, '1.1 Honesty, trust and fairness', 'Previous button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('Contents');
      //the last page of the last chapter goes to the summary, and an earlier chapter's last page to the next chapter
      player.goTo(board(p, '1.3 Check your understanding').id);
      await settle(player, 100);
      await click(layer(p, '1.3 Check your understanding', 'Next button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('2.1 Why we reference');
      player.goTo(board(p, '3.2 Check your understanding').id);
      await settle(player, 100);
      await click(layer(p, '3.2 Check your understanding', 'Next button').id);
      await settle(player, 300);
      expect(player.artboard.name).toBe('Your summary');
      player.destroy();
    });

    it('progress and the summary are live: pages read and a question answered move the bars, the count and the score', async () => {
      const p = build(KEY);
      const player = play(p);
      await settle(player, 100);
      const first = board(p, '1.1 Honesty, trust and fairness');
      player.goTo(first.id);
      await settle(player, 100);
      expect((player.getVariable('progress') as { done: number; size: number }[])[0]).toMatchObject({ done: 1, size: 3 });
      expect(player.getVariable('chaptersDone')).toBe(0);
      expect(player.getVariable('score')).toBe(0);
      //read to the question page, then finish the question (a right answer keeps 1 in the chapter's slot)
      player.setVariable('reached', [3, 2, 1]);
      player.setVariable('results', [1, 1, 0]);
      await settle(player, 100);
      expect(player.getVariable('chaptersDone')).toBe(3);
      expect(player.getVariable('score')).toBe(2);
      player.goTo(board(p, 'Your summary').id);
      await settle(player, 100);
      expect(textOf(layer(p, 'Your summary', 'Score').id)).toBe('2 of 3');
      expect(textOf(layer(p, 'Your summary', 'Chapters count').id)).toBe('3 of 3');
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Your summary', 'Chapter line').id}~"]`)).toHaveLength(3);
      expect(textOf(`${layer(p, 'Your summary', 'Chapter question').id}~2`)).toBe('Chapter 3: not right');
      player.destroy();
    });
  });
});
