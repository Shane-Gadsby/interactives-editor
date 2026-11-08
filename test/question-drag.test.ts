//Drag questions: matching with extra terms, categorise, and fill the blanks answered by dragging words. What "Add question" builds,
//the sync after the settings change, and playing them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, isServerMarked, type Project, type QuestionKind, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addQuestion, partsOf, questionFrames, setQuestionSettings } from '../src/lib/question-kit';
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
  const byPart = (part: string, pid?: string) => (partsOf(frame())[part] ?? []).filter((n) => !pid || n.questionPart === `${part}:${pid}`);
  return { s, p, abId, id, frame, set, byPart };
}

describe('matching with extra terms', () => {
  it('builds a draggable term for each extra and no slot for it', () => {
    const { set, byPart, frame } = make('matching');
    set({ extras: [{ id: 'x1', text: 'Spain' }, { id: 'x2', text: 'Chile' }] });
    expect(byPart('matchTerm')).toHaveLength(6);
    expect(byPart('matchZone')).toHaveLength(4);
    const extra = byPart('matchTerm', 'x1')[0];
    expect(extra.draggable?.label).toBe('Spain');
    expect(extra.draggable?.tags).toEqual(['q1-term']);
    expect(extra.name).toBe('Extra 1');
    //its row in the items follows the pairs
    expect(JSON.stringify(extra)).toContain('q1_items[4]');
    expect(JSON.stringify(byPart('matchTerm', 'x2')[0])).toContain('q1_items[5]');
    expect(frame().question!.extras).toHaveLength(2);
  });
  it('removing and renaming extras follows in the layers', () => {
    const { set, byPart } = make('matching');
    set({ extras: [{ id: 'x1', text: 'Spain' }, { id: 'x2', text: 'Chile' }] });
    set({ extras: [{ id: 'x2', text: 'Brazil' }] });
    expect(byPart('matchTerm')).toHaveLength(5);
    expect(byPart('matchTerm', 'x2')[0].draggable?.label).toBe('Brazil');
    expect(byPart('matchTerm', 'x1')).toHaveLength(0);
    expect(byPart('matchTerm', 'x2')[0].name).toBe('Extra 1');
  });
});

describe('categorise question: what is built', () => {
  it('is a box for each group (unlimited, taking every item) and a chip for each item', () => {
    const { frame, byPart, p } = make('categorise');
    const q = frame().question!;
    expect(q.kind).toBe('categorise');
    expect(byPart('catZone')).toHaveLength(2);
    expect(byPart('catCard')).toHaveLength(4);
    const zone = byPart('catZone', 'g1')[0];
    expect(zone.dropZone).toMatchObject({ accepts: ['q1-item'], snap: 'none', label: 'Mammals' });
    expect(zone.dropZone?.capacity).toBeUndefined();
    const card = byPart('catCard', 'c3')[0];
    expect(card.draggable).toMatchObject({ tags: ['q1-item'], label: 'Eagle' });
    expect(p().variables.some((v) => v.name === 'q1_items')).toBe(true);
    const kinds = p().artboards[0].logic.nodes.map((n) => n.kind);
    expect(kinds).toContain('action.questionCheck');
    expect(kinds).not.toContain('action.questionDrop');
  });
  it('adding a group or an item adds its layers, and the rest keep their look', () => {
    const { frame, byPart, set, s } = make('categorise');
    s.update((d) => void ((partsOf(questionFrames(d.artboards[0] as Project['artboards'][0])[0]).catCard[0] as { cornerRadius: number }).cornerRadius = 33));
    const q = frame().question!;
    set({ groups: [...q.groups!, { id: 'g3', name: 'Fish' }], cards: [...q.cards!, { id: 'c5', text: 'Shark', group: 'g3' }] });
    expect(byPart('catZone')).toHaveLength(3);
    expect(byPart('catCard')).toHaveLength(5);
    expect(byPart('catCard')[0].type === 'frame' && (byPart('catCard')[0] as { cornerRadius: number }).cornerRadius).toBe(33);
    expect(JSON.stringify(byPart('catCard', 'c5')[0])).toContain('q1_items[4]');
    set({ cards: q.cards!.slice(0, 2) });
    expect(byPart('catCard')).toHaveLength(2);
  });
  it('feedback on each drop wires an Item dropped node to each group, and turning it off removes them', () => {
    const { set, p } = make('categorise');
    set({ dropFeedback: true });
    const drops = () => p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionDrop');
    expect(drops()).toHaveLength(2);
    const events = p().artboards[0].logic.nodes.filter((n) => n.kind === 'event.drop');
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.params.result === 'accepted' && e.params.target)).toBe(true);
    set({ dropFeedback: false });
    expect(drops()).toHaveLength(0);
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'event.drop')).toBe(false);
  });
  it('passes the accessibility checks', () => {
    const { p } = make('categorise');
    expect(checkAccessibility(p()).findings.filter((f) => f.check !== 'contrast').map((f) => [f.check, f.severity])).toEqual([]);
  });
  it('changing to categorise and back swaps the answer area', () => {
    const { set, byPart, frame } = make('single');
    set({ kind: 'categorise', groups: [{ id: 'g1', name: 'A' }, { id: 'g2', name: 'B' }], cards: [{ id: 'c1', text: 'a', group: 'g1' }, { id: 'c2', text: 'b', group: 'g2' }] });
    expect(byPart('catCard')).toHaveLength(2);
    expect(byPart('options')).toHaveLength(0);
    set({ kind: 'single' });
    expect(byPart('catCard')).toHaveLength(0);
    expect(byPart('options')).toHaveLength(1);
    expect(frame().children.length).toBeGreaterThan(3);
  });
});

describe('fill the blanks by dragging: what is built', () => {
  it('a slot per blank and a word chip per blank and per extra, with no inputs', () => {
    const { set, byPart, frame } = make('blank');
    expect(byPart('blankInput')).toHaveLength(1);
    set({ answerBy: 'drag', extras: [{ id: 'x1', text: 'Rome' }] });
    expect(byPart('blankInput')).toHaveLength(0);
    expect(byPart('blankZone')).toHaveLength(1);
    expect(byPart('blankZone', 'b1')[0].dropZone).toMatchObject({ capacity: 1, snap: 'center', accepts: ['q1-word'] });
    expect(byPart('blankWord').map((n) => n.draggable?.label).sort()).toEqual(['Paris', 'Rome']);
    //a second blank adds its slot and its word
    set({ blanks: [...frame().question!.blanks, { id: 'b2', label: 'Capital of Italy', answers: ['Rome', 'roma'] }] });
    expect(byPart('blankZone')).toHaveLength(2);
    expect(byPart('blankWord')).toHaveLength(3);
    set({ answerBy: 'type' });
    expect(byPart('blankZone')).toHaveLength(0);
    expect(byPart('blankInput')).toHaveLength(2);
  });
  it('an answer that is only a pattern has no word for the bank', () => {
    const { set, frame } = make('blank');
    set({ answerBy: 'drag', blanks: [{ id: 'b1', label: 'X', answers: ['/a+/i'] }] });
    expect(frame().question!.answerBy).toBe('drag');
  });
});

describe('playing the drag questions', () => {
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
  const drag = (player: Player) => (player as unknown as { session: { drag: { put(a: string, b: string, instant?: boolean): boolean; zoneIdOf(k: string): string | null } } }).session.drag;

  it('matching: an extra term in a slot makes the pair wrong; left in the pile it is fine', async () => {
    const { p, byPart, set } = make('matching');
    set({ extras: [{ id: 'x1', text: 'Spain' }], shuffle: false, partial: false, attempts: 1 });
    const right = async (extraIn: string | null) => {
      document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
      const player = play(p());
      await flush();
      const d = drag(player);
      for (const pid of ['p1', 'p2', 'p3']) d.put(byPart('matchTerm', pid)[0].id, byPart('matchZone', pid)[0].id, true);
      if (extraIn) d.put(byPart('matchTerm', 'x1')[0].id, byPart('matchZone', extraIn)[0].id, true);
      else d.put(byPart('matchTerm', 'p4')[0].id, byPart('matchZone', 'p4')[0].id, true);
      await click(byPart('check')[0].id);
      return player;
    };
    const ok = await right(null);
    expect(ok.getVariable('q1_correct')).toBe(true);
    const bad = await right('p4');
    expect(bad.getVariable('q1_correct')).toBe(false);
    expect(bad.getVariable('q1_score')).toBe(0);
    const states = (bad.getVariable('q1_items') as { state: string }[]).map((i) => i.state);
    expect(states).toEqual(['correct', 'correct', 'correct', 'wrong', 'wrong']);
  });
  it('matching with extras: part marks drop for an extra in a slot', async () => {
    const { p, byPart, set } = make('matching');
    set({ extras: [{ id: 'x1', text: 'Spain' }], attempts: 1, points: 4 });
    const player = play(p());
    await flush();
    const d = drag(player);
    for (const pid of ['p1', 'p2']) d.put(byPart('matchTerm', pid)[0].id, byPart('matchZone', pid)[0].id, true);
    d.put(byPart('matchTerm', 'x1')[0].id, byPart('matchZone', 'p3')[0].id, true);
    await click(byPart('check')[0].id);
    //two pairs right, less one for the extra that took a slot
    expect(player.getVariable('q1_score')).toBe(1);
  });
  it('categorise: every item in its group is right, a swapped one is part right, and finishing locks the chips', async () => {
    const { p, byPart, set, frame } = make('categorise');
    set({ attempts: 1, points: 4 });
    const player = play(p());
    await flush();
    const d = drag(player);
    const put = (c: string, g: string) => d.put(byPart('catCard', c)[0].id, byPart('catZone', g)[0].id, true);
    //unlimited: a group takes them all
    expect(put('c1', 'g1')).toBe(true);
    expect(put('c2', 'g1')).toBe(true);
    expect(put('c3', 'g1')).toBe(true);
    expect(put('c4', 'g2')).toBe(true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_locked')).toBe(true);
    expect(player.getVariable('q1_score')).toBe(3);
    const items = player.getVariable('q1_items') as { state: string; answer?: string }[];
    expect(items.map((i) => i.state)).toEqual(['correct', 'correct', 'wrong', 'correct']);
    expect(items[2].answer).toBe('Birds');
    expect(player.getVariable('q1_feedback')).toContain('3 of 4 in the right group.');
    for (const c of frame().question!.cards!) expect(live(player, byPart('catCard', c.id)[0].id).draggable?.enabled).toBe(false);
  });
  it('categorise: all right, nothing placed asks for a drop and costs no try, and Try again puts the chips back', async () => {
    const { p, byPart, set, frame } = make('categorise');
    set({ attempts: 2 });
    const player = play(p());
    await flush();
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_feedback')).toBe('Drag at least one item into a group first.');
    expect(player.getVariable('q1_attempts')).toBe(0);
    const d = drag(player);
    for (const c of frame().question!.cards!) d.put(byPart('catCard', c.id)[0].id, byPart('catZone', c.group)[0].id, true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_score')).toBe(1);
    await click(byPart('reset')[0].id);
    //a right answer is finished, so Try again is not offered; the reset node still clears it
    const reset = p().artboards[0].logic.nodes.find((n) => n.kind === 'action.questionReset')!;
    expect(reset).toBeTruthy();
  });
  it('categorise: a wrong item says its own feedback', async () => {
    const { p, byPart, set, frame } = make('categorise');
    const q = frame().question!;
    set({ cards: q.cards!.map((c) => (c.id === 'c1' ? { ...c, feedback: 'A dog nurses its young.' } : c)), attempts: 1 });
    const player = play(p());
    await flush();
    const d = drag(player);
    d.put(byPart('catCard', 'c1')[0].id, byPart('catZone', 'g2')[0].id, true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_feedback')).toContain('A dog nurses its young.');
  });
  it('categorise with feedback on each drop says right or wrong, and uses no try', async () => {
    const { p, byPart, set, frame } = make('categorise');
    const q = frame().question!;
    set({ dropFeedback: true, cards: q.cards!.map((c) => (c.id === 'c1' ? { ...c, feedback: 'A dog nurses its young.' } : c)) });
    const player = play(p());
    await flush();
    //a drop the way the drag engine reports it, to the wire the kit made for that group
    const drop = async (card: string, group: string) => {
      const cardLayer = byPart('catCard', card)[0];
      const zoneLayer = byPart('catZone', group)[0];
      (player as unknown as { fireEvents(k: string, m: (n: { params: Record<string, unknown> }) => boolean, e: Record<string, unknown>): void }).fireEvents(
        'event.drop',
        (n) => n.params.target === zoneLayer.id,
        { layer: cardLayer.name, zone: zoneLayer.name }
      );
      await flush();
    };
    await drop('c3', 'g2');
    expect(player.getVariable('q1_feedback')).toBe('Eagle goes in Birds. Right.');
    await drop('c1', 'g2');
    expect(player.getVariable('q1_feedback')).toBe('A dog nurses its young.');
    await drop('c2', 'g2');
    expect(player.getVariable('q1_feedback')).toBe('Whale does not go in Birds. Try another group.');
    expect(player.getVariable('q1_attempts')).toBe(0);
    expect(player.getVariable('q1_answered')).toBe(false);
  });
  it('fill the blanks by dragging: the words in the slots are what was answered', async () => {
    const { p, byPart, set } = make('blank');
    set({
      answerBy: 'drag',
      blanks: [{ id: 'b1', label: 'France', answers: ['Paris'] }, { id: 'b2', label: 'Italy', answers: ['Rome', 'roma'] }],
      extras: [{ id: 'x1', text: 'Madrid' }],
      attempts: 2,
    });
    const play1 = async () => {
      document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
      const player = play(p());
      await flush();
      return { player, d: drag(player) };
    };
    const { player, d } = await play1();
    //nothing in a slot yet
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_attempts')).toBe(0);
    d.put(byPart('blankWord', 'b1')[0].id, byPart('blankZone', 'b1')[0].id, true);
    d.put(byPart('blankWord', 'x1')[0].id, byPart('blankZone', 'b2')[0].id, true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_blank1')).toBe('Paris');
    expect(player.getVariable('q1_blank2')).toBe('Madrid');
    expect(player.getVariable('q1_score')).toBe(0.5);
    d.put(byPart('blankWord', 'b2')[0].id, byPart('blankZone', 'b2')[0].id, true);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_blank2')).toBe('Rome');
    expect(player.getVariable('q1_attempts')).toBe(2);
    //finished: the words stop moving
    expect(live(player, byPart('blankWord', 'b1')[0].id).draggable?.enabled).toBe(false);
  });
  it('fill the blanks by dragging can be marked on the server; categorise cannot', () => {
    const { set, frame } = make('blank');
    set({ answerBy: 'drag', serverMarked: true });
    expect(isServerMarked(frame().question!)).toBe(true);
    const c = make('categorise');
    c.set({ serverMarked: true });
    expect(isServerMarked(c.frame().question!)).toBe(false);
  });
});
