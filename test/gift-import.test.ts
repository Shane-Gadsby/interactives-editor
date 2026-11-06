//GIFT questions put into a project: one artboard each, built by the kit's Add question, and playable.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, normalizeProject, walk, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { parseGift } from '../src/lib/gift';
import { MAX_IMPORT, applyGift } from '../src/lib/gift-import';
import { partsOf, questionFrames } from '../src/lib/question-kit';

const FILE = `::Capital::Capital of France?
{
=Paris # Yes!
~Lyon # Bigger than it is famous.
~Nice
####Paris has been the capital for a thousand years.
}

Which are fruit?
{
=Apple
~Carrot
=Banana
}

The Pacific is the largest ocean.{T#No.#Right.}

Who wrote 1984?
{=George Orwell =Orwell}

Pi to two places?
{#3.14:0.01}

Match capitals.
{=France -> Paris
=Japan -> Tokyo
=Peru -> Lima}

Write an essay.
{}
`;

function run(src = FILE) {
  const s = new EditorStore(createProject('G'));
  const parse = parseGift(src);
  let res!: ReturnType<typeof applyGift>;
  s.update((d) => void (res = applyGift(d as Project, parse, s.get().project.artboards[0].id)));
  return { s, res, p: () => s.get().project, parse };
}

describe('applyGift', () => {
  it('makes one kit question per artboard, reusing the empty open one first', () => {
    const { p, res } = run();
    expect(res.artboardIds).toHaveLength(6);
    expect(p().artboards).toHaveLength(6);
    expect(res.artboardIds[0]).toBe(p().artboards[0].id);
    expect(p().artboards.map((a) => questionFrames(a).length)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(p().artboards.map((a) => questionFrames(a)[0].question!.kind)).toEqual(['single', 'multiple', 'truefalse', 'blank', 'blank', 'matching']);
  });
  it('names artboards by title or number and lays them out below what was there', () => {
    const { p } = run();
    const names = p().artboards.map((a) => a.name);
    expect(names[1]).toBe('Question 2');
    expect(new Set(names).size).toBe(names.length);
    //the first reuses Home; the rest sit in rows of four below it
    const [, a2, a3, a4, a5, a6] = p().artboards;
    expect(a2.canvasY).toBeGreaterThan(p().artboards[0].canvasY + p().artboards[0].height - 1);
    expect([a2, a3, a4, a5].every((a) => a.canvasY === a2.canvasY)).toBe(true);
    expect(a6.canvasY).toBeGreaterThan(a2.canvasY);
    expect(a6.canvasX).toBe(a2.canvasX);
  });
  it('uses the title for the artboard name when there is one', () => {
    const s = new EditorStore(createProject('G'));
    let ids: string[] = [];
    //no active artboard given, so a new one is made even though Home is empty
    s.update((d) => void (ids = applyGift(d as Project, parseGift('::Week 1 Q1::Pick.\n{=a ~b}\n'), null).artboardIds));
    expect(s.get().project.artboards).toHaveLength(2);
    expect(s.get().project.artboards.find((a) => a.id === ids[0])!.name).toBe('Week 1 Q1');
  });
  it('fills in the settings: options, feedback, blanks, tolerance, pairs', () => {
    const { p } = run();
    const q = (i: number) => questionFrames(p().artboards[i])[0].question!;
    expect(q(0).prompt).toBe('Capital of France?');
    expect(q(0).options.map((o) => [o.text, !!o.correct, o.feedback])).toEqual([['Paris', true, 'Yes!'], ['Lyon', false, 'Bigger than it is famous.'], ['Nice', false, undefined]]);
    expect(q(0).feedbackCorrect).toBe('Correct! Paris has been the capital for a thousand years.');
    expect(q(1).options.filter((o) => o.correct).map((o) => o.text)).toEqual(['Apple', 'Banana']);
    expect(q(2).options.map((o) => [o.text, !!o.correct, o.feedback])).toEqual([['True', true, 'Right.'], ['False', false, 'No.']]);
    expect(q(3).blanks).toEqual([{ id: 'b1', label: '', answers: ['George Orwell', 'Orwell'] }]);
    expect(q(4).blanks[0]).toMatchObject({ answers: ['3.14'], tolerance: 0.01 });
    expect(q(5).pairs.map((x) => [x.term, x.match])).toEqual([['France', 'Paris'], ['Japan', 'Tokyo'], ['Peru', 'Lima']]);
  });
  it('keeps the layers and variables in line, with unique prefixes', () => {
    const { p } = run();
    const prefixes = p().artboards.map((a) => questionFrames(a)[0].question!.prefix);
    expect(new Set(prefixes).size).toBe(6);
    const v = (n: string) => p().variables.find((x) => x.name === n)!;
    expect(JSON.parse(String(v('q1_items').initial))).toHaveLength(3);
    expect(v('q1_prompt').initial).toBe('Capital of France?');
    expect(Object.keys(partsOf(questionFrames(p().artboards[3])[0]))).toEqual(expect.arrayContaining(['blanks', 'blankInput']));
    expect(Object.keys(partsOf(questionFrames(p().artboards[5])[0]))).toEqual(expect.arrayContaining(['matching']));
    //every artboard's graph points at layers that exist
    for (const ab of p().artboards) {
      const ids = new Set<string>();
      walk(ab.children, (n) => void ids.add(n.id));
      for (const n of ab.logic.nodes.filter((x) => x.kind === 'event.pointer')) expect(ids.has(String(n.params.target))).toBe(true);
    }
  });
  it('survives a save and load', () => {
    const { p } = run();
    const back = normalizeProject(JSON.parse(JSON.stringify(p())));
    expect(back.artboards.map((a) => questionFrames(a)[0].question!.kind)).toEqual(p().artboards.map((a) => questionFrames(a)[0].question!.kind));
  });
  it('is one undo step', () => {
    const { s } = run();
    s.undo();
    expect(s.get().project.artboards).toHaveLength(1);
    expect(s.get().project.variables).toHaveLength(0);
  });
  it('grows the artboard to hold a long question', () => {
    const many = Array.from({ length: 14 }, (_, i) => (i ? '~' : '=') + `Option number ${i}`).join('\n');
    const { p } = run(`Long?\n{\n${many}\n}\n`);
    const ab = p().artboards[0];
    const f = ab.children[0] as { y: number; height: number };
    expect(ab.height).toBeGreaterThanOrEqual(f.y + f.height);
  });
  it('stops at the limit and hands back what was left', () => {
    const src = Array.from({ length: MAX_IMPORT + 3 }, (_, i) => `Q${i}?\n{=a ~b}`).join('\n\n');
    const { res, p } = run(src);
    expect(res.artboardIds).toHaveLength(MAX_IMPORT);
    expect(res.left).toHaveLength(3);
    expect(p().artboards).toHaveLength(MAX_IMPORT);
  });
  it('an empty parse changes nothing', () => {
    const { p } = run('Just a description.\n');
    expect(p().artboards).toHaveLength(1);
    expect(questionFrames(p().artboards[0])).toHaveLength(0);
  });
});

describe('playing an imported question', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const click = async (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
    if (!el) throw new Error(`no layer ${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };

  it('shows its feedback and grades from the file', async () => {
    const { p } = run();
    const project = p();
    const frame = questionFrames(project.artboards[0])[0];
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
    await flush();
    const opt = partsOf(frame).option[0].id;
    await click(`${opt}~1`);
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_feedback')).toBe('Not quite. Have another look. Bigger than it is famous.');
    await click(`${opt}~0`);
    await click(partsOf(frame).check[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(String(player.getVariable('q1_feedback'))).toBe('Correct! Paris has been the capital for a thousand years. Yes!');
    player.destroy?.();
  });
});
