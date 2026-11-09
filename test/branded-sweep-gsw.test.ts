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
      //two a page at most, side by side under it, so notes of neighbouring pages in a row never overlap
      for (const a of p.artboards) expect((a.notes ?? []).length, `${s.key}: ${a.name}`).toBeLessThanOrEqual(2);
      for (const { a, n } of notes) {
        expect(n.x + n.w, `${s.key}: ${a.name}`).toBeLessThanOrEqual(a.width);
        const inside = n.x < a.width && n.y < a.height && n.x + n.w > 0 && n.y + n.h > 0;
        //a note beside the page (below it), or anchored to a layer; never over the content
        expect(inside && !n.anchor, `${s.key}: ${a.name}`).toBe(false);
        expect(n.text.length, s.key).toBeLessThan(420);
        expect(n.text, s.key).not.toContain('—');
        expect(n.author).toBe('Template');
      }
    }
  });

  //The nodes of each kind a starter has, by kind
  const params = (p: Project, kind: string) => kinds(p, kind).map((n) => n.params);
  const noWrites = (p: Project) => {
    //nothing sets a live variable
    const written = new Set(kinds(p, 'action.setVariable').map((n) => n.params.variable));
    for (const v of p.variables.filter((x) => x.live)) expect(written.has(v.id), v.name).toBe(false);
  };

  describe('games', () => {
    it('arithmetic quiz: a clock node, live marking, key navigation, a progress layer and one reset', () => {
      const p = build('games/arithmetic-quiz');
      expect(liveNames(p)).toEqual(['correct', 'feedback']);
      noWrites(p);
      expect(params(p, 'action.clock').map((c) => c.op)).toEqual(['start', 'pause']);
      expect(p.variables.find((v) => v.name === 'running')).toBeUndefined();
      expect(kinds(p, 'event.timer')).toHaveLength(0);
      expect(count(p, 'progress')).toBe(1);
      expect((layer(p, 'Work it out', 'Options') as unknown as { keyNav: { mode: string; columns: number } }).keyNav).toMatchObject({ mode: 'grid', columns: 2 });
      expect(kinds(p, 'action.resetVariables')).toHaveLength(2);
      //the guards are the events' own Only if
      expect(kinds(p, 'event.pointer').filter((n) => n.params.onlyIf).length).toBeGreaterThanOrEqual(2);
      expect(kinds(p, 'logic.if').map((n) => n.params.condition)).not.toContain('!answered');
    });

    it('crossword: the grid, the clues and the finish are live, and the four arrow keys are one flow', () => {
      const p = build('games/crossword');
      expect(liveNames(p)).toEqual(['entries', 'letters', 'starts', 'acrossClues', 'downClues', 'aw', 'wordCells', 'current', 'done', 'status']);
      noWrites(p);
      const arrows = kinds(p, 'event.key').filter((n) => String(n.params.onlyIf ?? '').includes('Arrow'));
      expect(arrows).toHaveLength(1);
      expect(kinds(p, 'event.key').filter((n) => ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(String(n.params.key)))).toHaveLength(0);
    });

    it('word search: key navigation, drag indexes, a clock node, a live line and no pointer maths', () => {
      const p = build('games/word-search');
      expect(liveNames(p)).toEqual(['rows', 'line', 'hit']);
      noWrites(p);
      const grid = layer(p, 'Find the words', 'Grid') as unknown as { keyNav: { mode: string; columns: number; indexVariable: string } };
      expect(grid.keyNav).toMatchObject({ mode: 'grid', columns: 12 });
      expect(grid.keyNav.indexVariable).toBe(p.variables.find((v) => v.name === 'cursor')!.id);
      const json = JSON.stringify(p.artboards.flatMap((a) => a.logic.nodes));
      expect(json).toContain('event.startIndex');
      expect(json).not.toContain('event.y');
      expect(json).not.toContain('CELL_AT');
      expect(params(p, 'action.clock').map((c) => c.op)).toEqual(['start', 'pause']);
      expect(kinds(p, 'event.timer')).toHaveLength(0);
      //Enter and Space come from the squares being buttons, not from key flows
      expect(kinds(p, 'event.key').map((n) => n.params.key)).toEqual(['Escape']);
    });

    it('guess the answer: one flow for both rating buttons, and a turn that holds itself back once turned', () => {
      const p = build('games/guess-the-answer');
      const rate = kinds(p, 'event.pointer').filter((n) => n.params.childrenOnly);
      expect(rate).toHaveLength(1);
      expect(kinds(p, 'event.message').filter((n) => n.params.onlyIf === '!turned')).toHaveLength(1);
      expect(kinds(p, 'action.resetVariables')).toHaveLength(2);
      expect(kinds(p, 'action.delay')).toHaveLength(0);
    });

    it('game map: a stage group, one marker flow, one option flow per page and live right', () => {
      const p = build('games/game-map');
      expect(p.artboardGroups).toHaveLength(1);
      expect(pages(p).filter((a) => a.group)).toHaveLength(5);
      expect(liveNames(p)).toEqual(['right']);
      noWrites(p);
      expect(kinds(p, 'action.artboard').filter((n) => n.params.to === 'expression')).toHaveLength(1);
      expect(kinds(p, 'event.pointer').filter((n) => String(n.params.onlyIf ?? '').includes('childIndex'))).toHaveLength(2);
      expect(kinds(p, 'event.pointer').filter((n) => n.params.childrenOnly && !n.params.onlyIf)).toHaveLength(5);
      expect(JSON.stringify(pages(p).flatMap((a) => a.children))).toContain('pageNumber');
    });

    it('personality quiz: the top style is live, the bars are progress layers and the answers are a key-navigation grid', () => {
      const p = build('games/personality-quiz');
      expect(liveNames(p)).toEqual(['top']);
      noWrites(p);
      expect(count(p, 'progress')).toBe(2);
      expect((layer(p, 'Questions', 'Answers') as unknown as { keyNav: { mode: string } }).keyNav.mode).toBe('grid');
      expect(kinds(p, 'action.resetVariables')).toHaveLength(1);
    });
  });

  describe('story', () => {
    it('branching scenario: live score, path and ending, a repeater of choices and one expression go-to a page', () => {
      const p = build('story/branching-scenario');
      expect(liveNames(p)).toEqual(['score', 'path', 'ending', 'rating']);
      noWrites(p);
      expect(kinds(p, 'action.artboard').filter((n) => n.params.to === 'expression')).toHaveLength(5);
      expect(kinds(p, 'logic.if')).toHaveLength(0);
      expect(count(p, 'button')).toBeLessThan(15);
    });

    it('presentation: page navigation, a counter from pageNumber and pageCount, and shortcuts for the arrow keys', () => {
      const p = build('story/course-presentation');
      expect(kinds(p, 'event.key')).toHaveLength(0);
      expect(kinds(p, 'action.artboard').map((n) => n.params.to).sort()).toContain('previous');
      expect(kinds(p, 'action.artboard').every((n) => n.params.to === 'next' || n.params.to === 'previous')).toBe(true);
      expect((layer(p, 'Slide 4: Content', 'Next') as unknown as { shortcut: string }).shortcut).toBe('Right');
      expect((layer(p, 'Slide 4: Content', 'Back') as unknown as { shortcut: string }).shortcut).toBe('Left');
      expect((layer(p, 'Slide 4: Content', 'Slide counter') as unknown as { text: string }).text).toBe('Slide {pageNumber} of {pageCount}');
    });

    it('memory game: live pairs found and busy, a shuffle, a set item and a key-navigation grid', () => {
      const p = build('story/memory-game');
      expect(liveNames(p)).toEqual(['ups', 'matched', 'busy']);
      noWrites(p);
      expect(params(p, 'action.setVariable').some((n) => n.op === 'setItem')).toBe(true);
      expect(JSON.stringify(p.variables.map((v) => v.formula))).not.toContain('Math.random');
      expect((layer(p, 'Find the matching pairs', 'Cards') as unknown as { keyNav: { mode: string; columns: number } }).keyNav).toMatchObject({ mode: 'grid', columns: 4 });
    });

    it('video with questions: the questions are cues, the video is held while one is open, and the chapters are the video\'s', () => {
      const p = build('story/video-questions');
      const video = layer(p, 'Watch and answer', 'Video') as unknown as { cues: { time: number; pause?: boolean }[]; chapters: { time: number }[]; bindings: Record<string, string>; emptyText: string };
      expect(video.cues.map((c) => c.time)).toEqual([20, 45, 70]);
      expect(video.cues.every((c) => c.pause)).toBe(true);
      expect(video.chapters).toHaveLength(4);
      expect(video.bindings['media.hold']).toBe('popup > 0');
      expect(video.emptyText).toContain('Choose a video');
      expect(kinds(p, 'event.videoCue')).toHaveLength(1);
      expect(kinds(p, 'event.timer')).toHaveLength(0);
      expect(p.variables.find((v) => v.name === 'questionTimes')).toBeUndefined();
      expect(byName(board(p, 'Watch and answer'), 'Video placeholder')).toBeUndefined();
      expect(liveNames(p)).toEqual(['answered']);
    });
  });

  describe('writing', () => {
    for (const [key, vars, firstPage] of [['writing/questionnaire', ['rating', 'place', 'comment', 'submitted'], 'Survey'], ['writing/documentation-tool', ['goals', 'step1', 'step2', 'step3', 'exported'], 'My goals'], ['writing/reflection-journal', ['what', 'felt', 'learnt', 'next'], 'Part 1: What happened']] as const) {
      it(`${key}: user data variables instead of save and load nodes, and a live returning`, () => {
        const p = build(key);
        expect(p.variables.filter((v) => v.userData).map((v) => v.name)).toEqual(vars);
        expect(kinds(p, 'action.saveUserData')).toHaveLength(0);
        expect(kinds(p, 'action.loadUserData')).toHaveLength(0);
        expect(kinds(p, 'event.beforeLoad')).toHaveLength(0);
        expect(p.variables.find((v) => v.name === 'returning')).toMatchObject({ formula: 'userData.restored > 0', live: true });
        expect(p.variables.find((v) => v.name === 'status')).toBeUndefined();
        noWrites(p);
        void firstPage;
      });
    }

    it('questionnaire: radio key navigation with one flow each, a live ready, and one go-to for Continue', () => {
      const p = build('writing/questionnaire');
      expect((layer(p, 'Survey', 'Rating scale') as unknown as { keyNav: { mode: string } }).keyNav.mode).toBe('radio');
      expect((layer(p, 'Survey', 'Place choices') as unknown as { keyNav: { mode: string } }).keyNav.mode).toBe('radio');
      //(the survey's own, and the Credits button every starter has)
      expect(kinds(p, 'event.pointer').filter((n) => n.params.type === 'click')).toHaveLength(7);
      expect(p.variables.find((v) => v.name === 'ready')).toMatchObject({ live: true });
      expect(kinds(p, 'action.artboard').filter((n) => n.params.to === 'expression')).toHaveLength(1);
      expect(byName(board(p, 'Survey'), 'Save for later button')).toBeUndefined();
    });

    it('workbook and journal: page groups, a live parts list for the progress rows, Continue by name and next and previous pages', () => {
      for (const key of ['writing/documentation-tool', 'writing/reflection-journal']) {
        const p = build(key);
        expect(p.artboardGroups).toHaveLength(1);
        expect(liveNames(p)).toEqual(expect.arrayContaining(['returning', 'parts', 'resumeAt']));
        expect(kinds(p, 'action.artboard').filter((n) => n.params.to === 'expression').length).toBeGreaterThanOrEqual(3);
        const nav = kinds(p, 'action.artboard').map((n) => n.params.to);
        expect(nav).toContain('next');
        expect(nav).toContain('previous');
        //no navigation row built by hand: the rows are copies of one layer
        expect(count(p, 'frame')).toBeLessThan(60);
      }
    });
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
