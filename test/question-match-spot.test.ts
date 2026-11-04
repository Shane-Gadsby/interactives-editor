//Matching and hotspot questions: what "Add question" builds, the sync after the settings change, the accessibility checker on the
//generated layers, and playing them (dropping terms into slots, clicking areas).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, normalizeProject, walk, cloneWithNewIds, type FrameNode, type Project, type QuestionKind, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addQuestion, growAreas, partsOf, questionFrames, setAreaShape, setQuestionSettings, dealOrder } from '../src/lib/question-kit';
import { checkAccessibility } from '../src/lib/a11y/checks';

function make(kind: QuestionKind) {
  const s = new EditorStore(createProject('Q'));
  s.update((d) => void (d.settings.title = 'Q'));
  const abId = s.get().project.artboards[0].id;
  let id = '';
  s.update((d) => void (id = addQuestion(d as Project, abId, kind)!));
  const p = () => s.get().project;
  const frame = () => questionFrames(p().artboards[0]).find((f) => f.id === id)!;
  const set = (patch: Parameters<typeof setQuestionSettings>[3]) => s.update((d) => setQuestionSettings(d as Project, abId, id, patch));
  const val = (name: string) => {
    const v = p().variables.find((x) => x.name === name);
    return v && v.type === 'list' && typeof v.initial === 'string' ? JSON.parse(v.initial) : v?.initial;
  };
  const byPart = (part: string, pid?: string) => (partsOf(frame())[part] ?? []).filter((n) => !pid || n.questionPart === `${part}:${pid}`);
  return { s, p, abId, id, frame, set, val, byPart };
}

const ids = (list: SceneNode[]) => list.map((n) => n.id);

describe('matching question: what is built', () => {
  it('is a term, a definition and a slot per pair, the terms free to drag and the slots taking one each', () => {
    const { frame, byPart, p } = make('matching');
    const q = frame().question!;
    expect(q.kind).toBe('matching');
    expect(q.pairs).toHaveLength(4);
    expect(byPart('matchTerm')).toHaveLength(4);
    expect(byPart('matchZone')).toHaveLength(4);
    expect(byPart('matchDefinition')).toHaveLength(4);
    for (const t of byPart('matchTerm')) {
      expect(t.draggable).toMatchObject({ tags: ['q1-term'], onMiss: 'return' });
      expect(t.draggable?.label).toBeTruthy();
    }
    for (const z of byPart('matchZone')) expect(z.dropZone).toMatchObject({ accepts: ['q1-term'], capacity: 1, whenFull: 'swap', snap: 'center' });
    expect(byPart('matchZone').map((z) => z.dropZone?.label)).toEqual(['Paris', 'Tokyo', 'Cairo', 'Lima']);
    //the result line is out of the flow, so showing it does not move the rows the slots are measured from
    expect(byPart('matchState')[0].layoutItem?.position).toBe('absolute');
    //not a repeater, and not inside an auto layout flow (draggables can't be)
    const terms = byPart('terms')[0] as FrameNode;
    expect(terms.layout).toBeNull();
    expect(terms.repeat).toBeFalsy();
    //the check, hint and reset buttons are wired like the other types, and nothing is wired to the terms
    const nodes = p().artboards[0].logic.nodes;
    expect(nodes.filter((n) => n.kind === 'action.questionCheck')).toHaveLength(1);
    expect(nodes.some((n) => n.kind === 'action.questionChoose' || n.kind === 'action.questionMove')).toBe(false);
  });
  it('deals the terms out of order, in a fixed order that is never the pairs’ own', () => {
    const { byPart } = make('matching');
    const order = byPart('terms')[0] && (byPart('terms')[0] as FrameNode).children.map((c) => (c.questionPart ?? '').split(':')[1]);
    expect(order).not.toEqual(['p1', 'p2', 'p3', 'p4']);
    expect([...order].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (const n of [2, 3, 5, 8]) for (const seed of ['q1', 'q2', 'quiz', 'x']) expect(dealOrder(n, seed)).not.toEqual(Array.from({ length: n }, (_, i) => i));
    expect(dealOrder(1, 'a')).toEqual([0]);
  });
  it('reads its words from the items variable, so editing the text needs no layer changes', () => {
    const { frame, val, set, byPart } = make('matching');
    expect(val('q1_items').map((i: { text: string; label: string }) => [i.text, i.label])).toEqual([['France', 'Paris'], ['Japan', 'Tokyo'], ['Egypt', 'Cairo'], ['Peru', 'Lima']]);
    const before = JSON.stringify(byPart('matchDefinition'));
    set({ pairs: frame().question!.pairs.map((pr, i) => (i === 1 ? { ...pr, match: 'Kyoto' } : pr)) });
    expect(val('q1_items')[1].label).toBe('Kyoto');
    expect(JSON.stringify(byPart('matchDefinition'))).toBe(before);
    //the screen reader names follow
    expect(byPart('matchZone')[1].dropZone?.label).toBe('Kyoto');
  });
  it('has nothing for the accessibility checker to report', () => {
    const { p } = make('matching');
    expect(//Colour contrast is the shared palette's, as the toolbox draws it (see the themes help); everything else must be clean
    checkAccessibility(p()).findings.filter((f) => f.check !== 'contrast').map((f) => [f.check, f.severity])).toEqual([]);
  });
  it('survives a save and load', () => {
    const { p } = make('matching');
    const back = normalizeProject(JSON.parse(JSON.stringify(p())));
    expect(questionFrames(back.artboards[0])[0].question).toEqual(questionFrames(p().artboards[0])[0].question);
    expect(Object.keys(partsOf(questionFrames(back.artboards[0])[0]))).toEqual(expect.arrayContaining(['matchTerm', 'matchZone', 'terms', 'matches']));
  });
});

describe('matching question: settings keep the layers in line', () => {
  it('adding a pair adds a term, a definition and a slot in the look of the others, without undoing styling', () => {
    const { s, frame, set, byPart, val } = make('matching');
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[0];
      for (const t of partsOf(f).matchTerm) (t as { cornerRadius: number }).cornerRadius = 25;
      (partsOf(f).matchDefinition[0] as { fontSize: number }).fontSize = 31;
    });
    const restyled = byPart('matchTerm').map((t) => t.id);
    set({ pairs: [...frame().question!.pairs, { id: 'p5', term: 'Chile', match: 'Santiago' }] });
    expect(byPart('matchTerm')).toHaveLength(5);
    expect(byPart('matchZone')).toHaveLength(5);
    expect(val('q1_items')).toHaveLength(5);
    //existing layers are the same layers, with their styling
    expect(byPart('matchTerm').slice(0, 4).map((t) => t.id).sort()).toEqual(restyled.slice().sort());
    expect((byPart('matchDefinition')[0] as { fontSize: number }).fontSize).toBe(31);
    const added = byPart('matchTerm', 'p5')[0];
    expect(added.draggable?.label).toBe('Chile');
    expect(byPart('matchZone', 'p5')[0].dropZone?.label).toBe('Santiago');
    //the pile is laid out again, one under the other, in the terms frame
    const terms = byPart('terms')[0] as FrameNode;
    expect(terms.children.map((c) => c.y)).toEqual([0, 76, 152, 228, 304]);
    expect(terms.height).toBe(5 * 76 - 24);
    //removing one takes its layers and leaves the rest
    set({ pairs: frame().question!.pairs.filter((pr) => pr.id !== 'p2') });
    expect(byPart('matchTerm').map((t) => t.questionPart)).not.toContain('matchTerm:p2');
    expect(byPart('matchZone')).toHaveLength(4);
    expect(val('q1_items')).toHaveLength(4);
  });
  it('reordering the pairs reorders the rows and keeps each binding pointing at its own pair', () => {
    const { frame, set, byPart, val } = make('matching');
    const [a, b, c, d] = frame().question!.pairs;
    set({ pairs: [d, c, b, a] });
    expect((byPart('matches')[0] as FrameNode).children.map((r) => r.questionPart)).toEqual(['matchRow:p4', 'matchRow:p3', 'matchRow:p2', 'matchRow:p1']);
    expect(val('q1_items').map((i: { id: string }) => i.id)).toEqual(['p4', 'p3', 'p2', 'p1']);
    const defs = byPart('matchDefinition') as unknown as { text: string }[];
    expect(defs.map((t) => t.text)).toEqual(['{q1_items[0]?.label}', '{q1_items[1]?.label}', '{q1_items[2]?.label}', '{q1_items[3]?.label}']);
    const term = byPart('matchTerm', 'p1')[0] as FrameNode;
    expect(JSON.stringify(term)).toContain('q1_items[3]');
  });
  it('renaming the prefix renames the tags, variables and what the layers read', () => {
    const { frame, set, byPart, p } = make('matching');
    set({ prefix: 'geo' });
    expect(byPart('matchTerm')[0].draggable?.tags).toEqual(['geo-term']);
    expect(byPart('matchZone')[0].dropZone?.accepts).toEqual(['geo-term']);
    expect(JSON.stringify(frame())).not.toContain('q1_');
    expect(p().variables.some((v) => v.name === 'geo_items')).toBe(true);
  });
  it('a copy is wired to its own question, tags and variables', () => {
    const { s, abId, p } = make('matching');
    s.update((d) => {
      const ab = d.artboards[0];
      ab.children.push(cloneWithNewIds(JSON.parse(JSON.stringify(ab.children[0]))));
    });
    const frames = questionFrames(p().artboards[0]);
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[1];
      setQuestionSettings(d as Project, abId, f.id, { prefix: 'q2' });
    });
    const second = questionFrames(p().artboards[0])[1];
    expect(partsOf(second).matchTerm[0].draggable?.tags).toEqual(['q2-term']);
    expect(partsOf(questionFrames(p().artboards[0])[0]).matchTerm[0].draggable?.tags).toEqual(['q1-term']);
    expect(frames).toHaveLength(2);
  });
  it('changing to matching and back swaps the answer area and keeps the rest', () => {
    const { s, frame, set, byPart, p } = make('single');
    void s;
    s.update((d) => void ((partsOf(questionFrames(d.artboards[0] as Project['artboards'][0])[0]).prompt[0] as { color: string }).color = '#123456'));
    set({ kind: 'matching', pairs: [{ id: 'p1', term: 'A', match: 'a' }, { id: 'p2', term: 'B', match: 'b' }] });
    expect(byPart('matchTerm')).toHaveLength(2);
    expect(byPart('options')).toHaveLength(0);
    expect((byPart('prompt')[0] as { color: string }).color).toBe('#123456');
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'action.questionChoose')).toBe(false);
    set({ kind: 'single' });
    expect(byPart('matchTerm')).toHaveLength(0);
    expect(byPart('options')).toHaveLength(1);
    expect(frame().children.length).toBeGreaterThan(3);
  });
});

describe('hotspot question: what is built', () => {
  it('is a picture with an area layer per option, each focusable, named and wired to its own option', () => {
    const { frame, byPart, p } = make('hotspot');
    expect(byPart('picture')).toHaveLength(1);
    const areas = byPart('spot');
    expect(areas.map((a) => a.type)).toEqual(['path', 'ellipse', 'rect', 'rect']);
    expect(areas.map((a) => a.ariaLabel)).toEqual(['Roof', 'Sun', 'Tree', 'Door']);
    for (const a of areas) {
      expect(a.focusable).toBe(true);
      expect(a.role).toBe('radio');
    }
    expect(byPart('spots')[0].role).toBe('radiogroup');
    const choose = p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionChoose');
    expect(choose.map((n) => n.params.option).sort()).toEqual(['0', '1', '2', '3']);
    const clicks = p().artboards[0].logic.nodes.filter((n) => n.kind === 'event.pointer');
    expect(clicks.map((n) => String(n.params.target)).filter((t) => ids(areas).includes(t)).sort()).toEqual(ids(areas).sort());
    expect(frame().question!.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['Roof']);
  });
  it('has nothing for the accessibility checker to report', () => {
    const { p } = make('hotspot');
    expect(//Colour contrast is the shared palette's, as the toolbox draws it (see the themes help); everything else must be clean
    checkAccessibility(p()).findings.filter((f) => f.check !== 'contrast').map((f) => [f.check, f.severity])).toEqual([]);
  });
  it('several right areas make the areas checkboxes', () => {
    const { frame, set, byPart } = make('hotspot');
    set({ options: frame().question!.options.map((o, i) => ({ ...o, correct: i < 2 ? true : undefined })) });
    expect(byPart('spot').every((a) => a.role === 'checkbox')).toBe(true);
    expect(byPart('spots')[0].role).toBe('region');
  });
  it('survives a save and load', () => {
    const { p } = make('hotspot');
    const back = normalizeProject(JSON.parse(JSON.stringify(p())));
    const f = questionFrames(back.artboards[0])[0];
    expect(partsOf(f).spot).toHaveLength(4);
    expect(partsOf(f).spot[0].type).toBe('path');
  });
});

describe('hotspot question: settings keep the layers in line', () => {
  it('a new option gets an area and a click wire; a removed one loses both; moved or restyled areas stay put', () => {
    const { s, frame, set, byPart, p, val } = make('hotspot');
    s.update((d) => {
      const a = partsOf(questionFrames(d.artboards[0] as Project['artboards'][0])[0]).spot[1] as { x: number; y: number; cornerRadius?: number };
      a.x = 333;
      a.y = 44;
    });
    set({ options: [...frame().question!.options, { id: 'o5', text: 'Window' }] });
    expect(byPart('spot')).toHaveLength(5);
    expect(byPart('spot', 'o5')[0].ariaLabel).toBe('Window');
    expect(val('q1_items')).toHaveLength(5);
    expect(byPart('spot')[1]).toMatchObject({ x: 333, y: 44 });
    expect(p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionChoose')).toHaveLength(5);
    set({ options: frame().question!.options.filter((o) => o.id !== 'o2') });
    expect(byPart('spot').map((a) => a.ariaLabel)).toEqual(['Roof', 'Tree', 'Door', 'Window']);
    const choose = p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionChoose');
    expect(choose.map((n) => n.params.option).sort()).toEqual(['0', '1', '2', '3']);
    //the click wires point at the areas that are left
    const here = new Set<string>();
    walk(p().artboards[0].children, (n) => void here.add(n.id));
    for (const n of p().artboards[0].logic.nodes.filter((x) => x.kind === 'event.pointer')) expect(here.has(String(n.params.target))).toBe(true);
  });
  it('reordering options keeps each area on its own option', () => {
    const { frame, set, byPart } = make('hotspot');
    const o = frame().question!.options;
    set({ options: [o[3], o[2], o[1], o[0]] });
    const roof = byPart('spot', 'o1')[0];
    expect(JSON.stringify(roof.bindings)).toContain('q1_items[3]');
    expect(JSON.stringify(roof.bindings)).not.toContain('q1_items[0]');
  });
  it('changing an area’s shape keeps its id, wiring, look and place', () => {
    const { s, abId, id, p, byPart } = make('hotspot');
    const tree = byPart('spot', 'o3')[0];
    expect(tree.type).toBe('rect');
    s.update((d) => setAreaShape(d as Project, abId, id, 'o3', 'ellipse'));
    const now = byPart('spot', 'o3')[0];
    expect(now.type).toBe('ellipse');
    expect(now.id).toBe(tree.id);
    expect(now).toMatchObject({ x: tree.x, y: tree.y, width: tree.width, height: tree.height });
    s.update((d) => setAreaShape(d as Project, abId, id, 'o3', 'polygon'));
    const poly = byPart('spot', 'o3')[0];
    expect(poly.type).toBe('path');
    expect(poly.type === 'path' && poly.paths[0].points.length).toBe(5);
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'event.pointer' && n.params.target === tree.id)).toBe(true);
  });
  it('Grow areas makes every area bigger by the same margin on each side, polygon points too', () => {
    const { s, abId, id, byPart } = make('hotspot');
    const before = byPart('spot').map((a) => ({ x: a.x, y: a.y, w: a.width, h: a.height }));
    s.update((d) => growAreas(d as Project, abId, id, 10));
    const after = byPart('spot').map((a) => ({ x: a.x, y: a.y, w: a.width, h: a.height }));
    after.forEach((a, i) => expect(a).toEqual({ x: before[i].x - 10, y: before[i].y - 10, w: before[i].w + 20, h: before[i].h + 20 }));
    const roof = byPart('spot', 'o1')[0];
    expect(roof.type === 'path' && roof.paths[0].points.map((pt) => [pt.x, pt.y])).toEqual([[0, 100], [Math.round(105 * 230 / 210 * 10) / 10, 0], [230, 100]]);
    s.update((d) => growAreas(d as Project, abId, id, -10));
    expect(byPart('spot').map((a) => a.width)).toEqual(before.map((b) => b.w));
  });
  it('changing to hotspot from a choice question makes an area per option', () => {
    const { set, byPart, frame } = make('single');
    set({ kind: 'hotspot' });
    expect(byPart('spot')).toHaveLength(frame().question!.options.length);
    expect(byPart('options')).toHaveLength(0);
  });
});

describe('playing the new questions', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 15));
  const live = (player: Player, id: string) => (player as unknown as { session: { byId: Map<string, SceneNode> } }).session.byId.get(id)!;
  const play = (p: Project) => new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false });
  const click = async (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
    if (!el) throw new Error(`no layer ${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const drag = (player: Player) => (player as unknown as { session: { drag: { put(a: string, b: string, instant?: boolean): boolean; zoneIdOf(k: string): string | null; state(): Record<string, string | null> } } }).session.drag;

  it('matching: dropping every term in its slot and checking is right', async () => {
    const { p, byPart, frame } = make('matching');
    const player = play(p());
    await flush();
    const d = drag(player);
    for (const pr of frame().question!.pairs) expect(d.put(byPart('matchTerm', pr.id)[0].id, byPart('matchZone', pr.id)[0].id, true)).toBe(true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_locked')).toBe(true);
    expect(player.getVariable('q1_score')).toBe(1);
    const items = player.getVariable('q1_items') as { state: string }[];
    expect(items.map((i) => i.state)).toEqual(['correct', 'correct', 'correct', 'correct']);
  });
  it('matching: nothing placed asks for a drop first and costs no try', async () => {
    const { p, byPart } = make('matching');
    const player = play(p());
    await flush();
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_feedback')).toBe('Drag at least one item into place first.');
    expect(player.getVariable('q1_attempts')).toBe(0);
  });
  it('matching: a slot holds one term, a swapped pair is part right, and finishing locks the terms', async () => {
    const { p, byPart, frame, set } = make('matching');
    set({ attempts: 1, points: 4 });
    const player = play(p());
    await flush();
    const d = drag(player);
    const t = (pid: string) => byPart('matchTerm', pid)[0].id;
    const z = (pid: string) => byPart('matchZone', pid)[0].id;
    expect(d.put(t('p1'), z('p1'), true)).toBe(true);
    //a slot holds one: dropping another term on it sends the first back to where the new one came from
    expect(d.put(t('p2'), z('p1'), true)).toBe(true);
    expect(d.zoneIdOf(t('p1'))).toBeNull();
    expect(d.zoneIdOf(t('p2'))).toBe(z('p1'));
    expect(d.put(t('p1'), z('p1'), true)).toBe(true);
    expect(d.zoneIdOf(t('p2'))).toBeNull();
    expect(d.put(t('p2'), z('p3'), true)).toBe(true);
    expect(d.put(t('p3'), z('p2'), true)).toBe(true);
    expect(d.put(t('p4'), z('p4'), true)).toBe(true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_locked')).toBe(true);
    expect(player.getVariable('q1_score')).toBe(2);
    const items = player.getVariable('q1_items') as { state: string; answer?: string }[];
    expect(items.map((i) => i.state)).toEqual(['correct', 'wrong', 'wrong', 'correct']);
    expect(items[1].answer).toBe('Japan');
    //locked: the terms no longer move
    for (const pr of frame().question!.pairs) expect(live(player, t(pr.id)).draggable?.enabled).toBe(false);
  });
  it('matching: Try again puts the terms back and unlocks them', async () => {
    const { p, byPart, set } = make('matching');
    set({ attempts: 1, shuffle: false });
    const player = play(p());
    await flush();
    const d = drag(player);
    d.put(byPart('matchTerm', 'p1')[0].id, byPart('matchZone', 'p2')[0].id, true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_locked')).toBe(true);
    await click(byPart('reset')[0].id);
    expect(player.getVariable('q1_locked')).toBe(false);
    expect(d.state()['Term 1']).toBeNull();
    expect(live(player, byPart('matchTerm', 'p1')[0].id).draggable?.enabled).toBe(true);
    expect(d.put(byPart('matchTerm', 'p1')[0].id, byPart('matchZone', 'p1')[0].id, true)).toBe(true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_attempts')).toBe(1);
  });
  it('matching: shuffle deals the terms to different places each time it starts', async () => {
    const { p, byPart } = make('matching');
    const seen = new Set<string>();
    for (let k = 0; k < 6; k++) {
      document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
      const player = play(p());
      await flush();
      seen.add(byPart('matchTerm').map((t) => live(player, t.id).y).join(','));
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('records each check as an answer (the kind, right or wrong, the share and the areas picked), nothing typed', async () => {
    const { p, byPart, frame } = make('matching');
    const hot = make('hotspot');
    void frame;
    const got: Record<string, unknown>[] = [];
    const watch = (player: Player) => player.on('record' as never, ((r: Record<string, unknown>) => void got.push(r)) as never);
    const m = play(p());
    watch(m);
    await flush();
    const d = drag(m);
    d.put(byPart('matchTerm', 'p1')[0].id, byPart('matchZone', 'p1')[0].id, true);
    await click(byPart('check')[0].id);
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
    const h = play(hot.p());
    watch(h);
    await flush();
    await click(hot.byPart('spot', 'o2')[0].id);
    await click(hot.byPart('check')[0].id);
    const answers = got.filter((r) => r.kind === 'answer');
    expect(answers.map((r) => [r.questionKind, r.correct, r.fraction])).toEqual([['matching', false, 0.25], ['hotspot', false, 0]]);
    expect(answers[1].options).toEqual(['o2']);
    expect(answers[0].options).toBeUndefined();
  });
  it('hotspot: clicking the right area and checking is right, a wrong area is wrong', async () => {
    const { p, byPart } = make('hotspot');
    const player = play(p());
    await flush();
    await click(byPart('spot', 'o4')[0].id);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_feedback')).toBe('Not there. Have another look at the picture.');
    await click(byPart('spot', 'o1')[0].id);
    expect((player.getVariable('q1_items') as { selected: boolean }[]).map((i) => i.selected)).toEqual([true, false, false, false]);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_feedback')).toBe('Correct! Yes, that is the roof.');
  });
  it('hotspot: several right areas are toggled and all must be marked', async () => {
    const { frame, set, p, byPart } = make('hotspot');
    set({ options: frame().question!.options.map((o, i) => ({ ...o, correct: i < 2 ? true : undefined })) });
    const player = play(p());
    await flush();
    await click(byPart('spot', 'o1')[0].id);
    await click(byPart('spot', 'o2')[0].id);
    await click(byPart('spot', 'o3')[0].id);
    await click(byPart('spot', 'o3')[0].id);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
  });
  it('hotspot: after finishing wrong the picks and the missed areas are marked, with words', async () => {
    const { set, p, byPart } = make('hotspot');
    set({ attempts: 1 });
    const player = play(p());
    await flush();
    await click(byPart('spot', 'o2')[0].id);
    await click(byPart('check')[0].id);
    expect((player.getVariable('q1_items') as { state: string }[]).map((i) => i.state)).toEqual(['missed', 'wrong', '', '']);
    const picks = document.querySelector<HTMLElement>(`[data-ix-id="${byPart('spotPicks')[0].id}"]`);
    expect(picks?.textContent).toContain('Selected: Sun (wrong)');
    const answer = document.querySelector<HTMLElement>(`[data-ix-id="${byPart('spotAnswer')[0].id}"]`);
    expect(answer?.textContent).toContain('Right answer: Roof');
  });
  it('hotspot: Try again clears the picks', async () => {
    const { set, p, byPart } = make('hotspot');
    set({ attempts: 1 });
    const player = play(p());
    await flush();
    await click(byPart('spot', 'o2')[0].id);
    await click(byPart('check')[0].id);
    await click(byPart('reset')[0].id);
    expect((player.getVariable('q1_items') as { selected: boolean; state: string }[]).every((i) => !i.selected && !i.state)).toBe(true);
    expect(player.getVariable('q1_locked')).toBe(false);
  });
});
