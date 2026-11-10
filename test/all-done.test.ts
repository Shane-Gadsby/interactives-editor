//"When all of these are done" and "Count what has been done": the ordinary variables and nodes they write, the numbers you can show,
//and that Preview does it (the action only runs once every layer is done, and not twice).
import { describe, expect, it, vi } from 'vitest';
import { Player, createNode, createProject, type Artboard, type FrameNode, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { RECIPE_BY_ID, TRIGGERS, applyBehaviour, buildBehaviour, defaultAnswers, defaultTriggerAnswers, incomplete, joinSet, triggerIncomplete, unavailable, type Answers } from '../src/lib/recipes';
import { doneLayers } from '../src/lib/all-done';
import { flowsForLayer } from '../src/lib/flow-describe';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const mk = (prefix: string) => `${prefix}${++n}`;

function fixture() {
  const p = createProject('T');
  const home = p.artboards[0];
  const names = ['Point A', 'Point B', 'Point C'];
  const points = names.map((name, i) => createNode('rect', { name, x: 10 + i * 60, y: 10, width: 50, height: 40 }));
  const done = createNode('rect', { name: 'Well done', x: 10, y: 100, width: 100, height: 40, visible: false });
  const text = createNode('text', { name: 'Tally', x: 10, y: 160, width: 200, height: 30, text: '{exploredCount} of {exploredTotal} explored' });
  home.children.push(...points, done, text);
  return { p, home, points, done, text };
}
type Fx = ReturnType<typeof fixture>;
const ctxOf = (f: Fx, layerId = f.points[0].id) => ({ project: f.p, ab: f.home, layerId });
const allThree = (f: Fx): Answers => ({ donehow: 'click', doneset: joinSet(f.points.map((x) => x.id)), donename: 'explored' });

describe('When all of these are done', () => {
  it('is offered in the trigger list, and asks which layers, how and what to call the count', () => {
    expect(TRIGGERS.map((t) => t.id)).toContain('all');
    const f = fixture();
    expect(defaultTriggerAnswers('all', ctxOf(f))).toEqual({ donehow: 'click', doneset: f.points[0].id, donename: 'explored' });
    expect(triggerIncomplete('all', { donehow: 'click', doneset: '', donename: 'explored' })).toBe('Tick the layers that count.');
    expect(triggerIncomplete('all', { ...allThree(f), donename: ' ' })).toBe('Name what you are counting, such as explored.');
    expect(triggerIncomplete('all', allThree(f))).toBeNull();
  });

  it('writes a list, a live count, a total, a layer flow for each, and the event with an Only if', () => {
    const f = fixture();
    const b = buildBehaviour(ctxOf(f), 'show', 'all', { layer: f.done.id }, mk, { when: allThree(f) });
    expect(b.variables.map((v) => [v.name, v.type, v.formula ?? null, !!v.live])).toEqual([
      ['explored', 'list', null, false],
      ['exploredCount', 'number', 'explored.length', true],
      ['exploredTotal', 'number', '3', false],
    ]);
    const [event, ...rest] = b.nodes;
    expect(event.kind).toBe('event.variable');
    expect(event.params).toMatchObject({ variable: b.variables[0].id, onlyIf: 'includesAll(explored, ["Point A", "Point B", "Point C"])' });
    expect(rest[0]).toMatchObject({ kind: 'action.visibility', params: { target: f.done.id, op: 'show' } });
    const trackers = rest.filter((x) => x.kind === 'event.pointer');
    expect(trackers.map((x) => [x.params.target, x.params.onlyIf])).toEqual(f.points.map((x, i) => [x.id, `!includesAll(explored, [${JSON.stringify(['Point A', 'Point B', 'Point C'][i])}])`]));
    const adds = rest.filter((x) => x.kind === 'action.setVariable');
    expect(adds.map((x) => x.params)).toEqual(f.points.map((_, i) => expect.objectContaining({ variable: b.variables[0].id, op: 'push', value: JSON.stringify(['Point A', 'Point B', 'Point C'][i]) })));
    //every node is on a wire that starts at an event, and the sentence reads
    expect(b.edges).toHaveLength(b.nodes.length - 4);
    expect(b.sentence).toMatch(/^When explored changes/);
    expect(b.sentence).toContain('show');
  });

  it('keeps names apart (two layers with one name, a name already in use)', () => {
    const f = fixture();
    f.points[1].name = 'Point A';
    f.p.variables.push({ id: 'vx', name: 'explored', type: 'number', initial: 0 });
    const b = buildBehaviour(ctxOf(f), 'show', 'all', { layer: f.done.id }, mk, { when: allThree(f) });
    expect(b.variables.map((v) => v.name)).toEqual(['explored2', 'explored2Count', 'explored2Total']);
    expect(b.nodes[0].params.onlyIf).toBe('includesAll(explored2, ["Point A", "Point A 2", "Point C"])');
  });

  it('plays: the action waits for the last layer, once, whatever order and however often they are clicked', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
    const f = fixture();
    const store = new EditorStore(f.p);
    const ctx = ctxOf(f);
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctx, 'counter', 'all', { counter: 'new:finished', numhow: 'add', amount: '1' }, mk, { when: allThree(f) }));
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    await flush();
    const click = async (id: string) => {
      document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    const [a, b, c] = f.points.map((x) => x.id);
    await click(c);
    await click(c);
    expect([player.getVariable('exploredCount'), player.getVariable('exploredTotal'), player.getVariable('finished')]).toEqual([1, 3, 0]);
    await click(a);
    expect(player.getVariable('explored')).toEqual(['Point C', 'Point A']);
    expect(player.getVariable('finished')).toBe(0);
    await click(b);
    expect([player.getVariable('exploredCount'), player.getVariable('finished')]).toEqual([3, 1]);
    //clicking on afterwards neither adds again nor starts it again
    await click(a);
    expect([player.getVariable('exploredCount'), player.getVariable('finished')]).toEqual([3, 1]);
    player.destroy();
    //one undo takes all of it back
    store.undo();
    expect(store.get().project.variables).toEqual([]);
    expect(store.get().project.artboards[0].logic.nodes).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});

describe('Count what has been done', () => {
  it('is a recipe of its own that writes only the counting, with no trigger to choose', () => {
    const f = fixture();
    const r = RECIPE_BY_ID['count-done'];
    expect(r.group).toBe('Counting and switches');
    expect(unavailable(r, ctxOf(f))).toBeNull();
    expect(incomplete(r, { ...defaultAnswers(r, ctxOf(f)), doneset: '' }, f.p, f.home)).toBe('Tick the layers that count.');
    const b = buildBehaviour(ctxOf(f), 'count-done', 'click', allThree(f), mk);
    expect(b.variables.map((v) => v.name)).toEqual(['explored', 'exploredCount', 'exploredTotal']);
    expect(b.nodes.map((x) => x.kind)).toEqual(['event.pointer', 'action.setVariable', 'event.pointer', 'action.setVariable', 'event.pointer', 'action.setVariable']);
    expect(b.nodes.some((x) => x.kind === 'event.variable')).toBe(false);
    expect(b.sentence).toBe('count each of 3 layers once it is clicked, in explored (exploredCount says how many, out of exploredTotal)');
    expect(b.eventId).toBe(b.nodes[0].id);
    expect(b.actionId).toBe(b.nodes[1].id);
  });

  it('shows in the layer flows of each point, and the count text works when played', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => setTimeout(fn, 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (h: number) => clearTimeout(h));
    const f = fixture();
    const store = new EditorStore(f.p);
    applyBehaviour((r) => store.update(r), f.home.id, buildBehaviour(ctxOf(f), 'count-done', 'click', allThree(f), mk));
    const project = store.get().project;
    const flows = flowsForLayer({ ab: project.artboards[0] as Artboard, project }, f.points[1].id);
    expect(flows.length).toBeGreaterThan(0);
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)) as Project, { loadData: false });
    await flush();
    document.querySelector<HTMLElement>(`[data-ix-id="${f.points[1].id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(document.querySelector<HTMLElement>(`[data-ix-id="${f.text.id}"]`)!.textContent).toContain('1 of 3 explored');
    player.destroy();
    vi.unstubAllGlobals();
  });
});

describe('answered and opened', () => {
  function qfixture() {
    const f = fixture();
    const q1 = createNode('frame', { name: 'Question 1', x: 0, y: 300, width: 100, height: 100 } as never) as FrameNode;
    const q2 = createNode('frame', { name: 'Question 2', x: 0, y: 420, width: 100, height: 100 } as never) as FrameNode;
    (q1 as unknown as { question: { prefix: string } }).question = { prefix: 'q1' };
    (q2 as unknown as { question: { prefix: string } }).question = { prefix: 'q2' };
    const dlg = createNode('frame', { name: 'Help panel', x: 0, y: 540, width: 100, height: 100 } as never) as FrameNode;
    (dlg as unknown as { dialog: { openVariable: string } }).dialog = { openVariable: 'vopen' };
    f.home.children.push(q1, q2, dlg);
    f.p.variables.push({ id: 'va1', name: 'q1_answered', type: 'boolean', initial: false }, { id: 'va2', name: 'q2_answered', type: 'boolean', initial: false }, { id: 'vopen', name: 'helpOpen', type: 'boolean', initial: false });
    return { ...f, q1, q2, dlg };
  }

  it('offers only the layers that can be answered, or opened', () => {
    const f = qfixture();
    expect(doneLayers(f.home, f.p, 'answered').map((x) => x.name)).toEqual(['Question 1', 'Question 2']);
    expect(doneLayers(f.home, f.p, 'opened').map((x) => x.name)).toEqual(['Help panel']);
    expect(doneLayers(f.home, f.p, 'click').length).toBe(f.home.children.length);
    expect(triggerIncomplete('all', { donehow: 'answered', doneset: f.points[0].id, donename: 'x' }, f.p, f.home)).toBe('None of the ticked layers is a question.');
    expect(triggerIncomplete('all', { donehow: 'opened', doneset: f.points[0].id, donename: 'x' }, f.p, f.home)).toBe('None of the ticked layers is a dialog with an open value.');
  });

  it('writes an On variable change on each question\'s answered value, and plays', async () => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    const f = qfixture();
    const b = buildBehaviour(ctxOf(f), 'show', 'all', { layer: f.done.id }, mk, { when: { donehow: 'answered', doneset: joinSet([f.q1.id, f.q2.id]), donename: 'answeredQs' } });
    const trackers = b.nodes.filter((x) => x.kind === 'event.variable' && x.params.variable !== b.variables[0].id);
    expect(trackers.map((x) => [x.params.variable, x.params.onlyIf])).toEqual([
      ['va1', 'q1_answered && !includesAll(answeredQs, ["Question 1"])'],
      ['va2', 'q2_answered && !includesAll(answeredQs, ["Question 2"])'],
    ]);
    const store = new EditorStore(f.p);
    applyBehaviour((r) => store.update(r), f.home.id, b);
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(store.get().project)) as Project, { loadData: false });
    await flush();
    player.setVariable('q1_answered', true);
    await flush();
    expect(player.getVariable('answeredQsCount')).toBe(1);
    expect(player.getVariable('answeredQs')).toEqual(['Question 1']);
    player.setVariable('q2_answered', true);
    await flush();
    expect(player.getVariable('answeredQsCount')).toBe(2);
    player.destroy();
  });
});
