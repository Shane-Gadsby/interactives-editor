//The puzzle frame: + New puzzle makes a page with a question and the frame around it, and three kinds of question answer
//the puzzle through the kit's own Check answer with nothing else wired. The Visual novel template carries one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, checkStory, createProject, type Artboard, type Project, type QuestionKind, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { partsOf, questionFrames, setQuestionSettings } from '../src/lib/question-kit';
import { addPuzzlePage, makePuzzle, PUZZLE_FRAME_NAME } from '../src/lib/puzzle-page';
import { visualNovel } from '../src/lib/story-template';

const named = (ab: Artboard, name: string): SceneNode | undefined => {
  let hit: SceneNode | undefined;
  const look = (list: SceneNode[]) => {
    for (const n of list) {
      if (!hit && n.name === name) hit = n;
      if ('children' in n && Array.isArray(n.children)) look(n.children as SceneNode[]);
    }
  };
  look(ab.children);
  return hit;
};

describe('making a puzzle page', () => {
  it('+ New puzzle makes a page with puzzle settings, a question and the frame, and making it a puzzle twice adds the frame once', () => {
    const s = new EditorStore(createProject('P'));
    let id = '';
    s.update((d) => void (id = addPuzzlePage(d as Project)));
    const ab = s.get().project.artboards.find((a) => a.id === id)!;
    expect(ab.name).toBe('Puzzle 1');
    expect(ab.puzzle?.hints?.length).toBe(3);
    expect(questionFrames(ab)).toHaveLength(1);
    expect(ab.children.filter((c) => c.name === PUZZLE_FRAME_NAME)).toHaveLength(1);
    s.update((d) => makePuzzle(d as Project, id));
    expect(s.get().project.artboards.find((a) => a.id === id)!.children.filter((c) => c.name === PUZZLE_FRAME_NAME)).toHaveLength(1);
    //every frame button is wired
    const kinds = ab.logic.nodes.map((n) => n.kind);
    for (const k of ['action.puzzleHint', 'action.puzzleMemo', 'action.puzzleLeave', 'action.puzzleAnswer']) expect(kinds).toContain(k);
  });
});

describe('three kinds of puzzle in the frame', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1280px;height:720px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 15));
  const click = async (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
    if (!el) throw new Error(`no layer ${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };

  const make = (kind: QuestionKind) => {
    const s = new EditorStore(createProject('P'));
    let id = '';
    s.update((d) => {
      id = addPuzzlePage(d as Project, { kind });
      const ab = d.artboards.find((a) => a.id === id)!;
      setQuestionSettings(d as Project, id, questionFrames(ab as Artboard)[0].id, { shuffle: false });
      d.settings.startArtboardId = id;
    });
    const p = JSON.parse(JSON.stringify(s.get().project)) as Project;
    const ab = p.artboards.find((a) => a.id === id)!;
    const parts = partsOf(questionFrames(ab)[0]);
    return { p, ab, id, check: parts.check[0].id };
  };

  it('a choice: wrong first (the value drops, Try again clears it), then right', async () => {
    const { p, ab, id, check } = make('single');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await flush();
    const radios = () => [...document.querySelectorAll<HTMLElement>('[data-ix-role="radio"], [role="radio"]')];
    radios()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    await click(check);
    expect(player.pocket.record(id)).toMatchObject({ status: 'found', tries: 1 });
    const notQuite = () => document.querySelector<HTMLElement>(`[data-ix-id="${named(ab, 'Not quite')!.id}"]`)!.style.display;
    expect(notQuite()).not.toBe('none');
    await click(named(ab, 'Try the puzzle again')!.id);
    expect(notQuite()).toBe('none');
    radios()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    await click(check);
    expect(player.pocket.record(id)).toMatchObject({ status: 'solved', score: 27 });
    player.destroy();
  });

  it('put in order: right as dealt', async () => {
    const { p, id, check } = make('ordering');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await flush();
    await click(check);
    expect(player.pocket.record(id)?.status).toBe('solved');
    player.destroy();
  });

  it('fill in the blank: typed right', async () => {
    const { p, id, check } = make('blank');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await flush();
    player.setVariable('q1_blank1', 'Paris');
    await flush();
    await click(check);
    expect(player.pocket.record(id)?.status).toBe('solved');
    player.destroy();
  });

  it('a hint costs a coin, from the frame', async () => {
    const { p, ab, id } = make('single');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    await flush();
    const hint = named(ab, 'Hint button')!;
    //the hint buttons are copies of one, made by the repeater
    const copies = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${hint.id}"]`)];
    copies[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(player.pocket.coins).toBe(2);
    expect(player.pocket.record(id)?.hints).toBe(1);
    player.destroy();
  });
});

describe('the Visual novel template', () => {
  it('has a puzzle the chapter calls, and an index of them', () => {
    const { project } = visualNovel();
    const puzzle = project.artboards.find((a) => a.puzzle);
    expect(puzzle?.name).toBe('Puzzle 1');
    expect(project.artboards.some((a) => a.name === 'Puzzles')).toBe(true);
    const text = project.story!.chapters[0].lines.map((l) => l.text).join('\n');
    expect(text).toContain('[call Puzzle 1]');
    const pages = new Set(project.artboards.map((a) => a.name.toLowerCase()));
    expect(checkStory(project.story!, { page: (n) => pages.has(n.toLowerCase()) })).toEqual([]);
  });
});
