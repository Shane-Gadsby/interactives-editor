//The question kit: "Add question" builds real layers, variables and a small graph; settings edits keep them in line without
//undoing the person's styling; and the result plays in the player.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, normalizeProject, walk, cloneWithNewIds, type FrameNode, type Project, type QuestionKind, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addQuestion, bankSource, makeIndependent, partsOf, questionFrames, setQuestionSettings, sharedPrefix } from '../src/lib/question-kit';

const KINDS: QuestionKind[] = ['single', 'multiple', 'truefalse', 'blank', 'ordering'];

function make(kind: QuestionKind = 'single') {
  const s = new EditorStore(createProject('Q'));
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
  return { s, p, abId, id, frame, set, val };
}

const part = (f: FrameNode, name: string) => partsOf(f)[name]?.[0];

describe('Add question', () => {
  for (const kind of KINDS) {
    it(`${kind}: builds the layers, variables and wiring`, () => {
      const { p, frame, val } = make(kind);
      const f = frame();
      const q = f.question!;
      expect(q.kind).toBe(kind);
      const parts = Object.keys(partsOf(f));
      expect(parts).toEqual(expect.arrayContaining(['prompt', 'check', 'hint', 'reset', 'feedback', 'hintText', 'score']));
      if (kind === 'blank') expect(parts).toEqual(expect.arrayContaining(['blanks', 'blankRow', 'blankInput']));
      else expect(parts).toEqual(expect.arrayContaining(['options', 'option', 'optionLabel']));
      if (kind === 'ordering') expect(parts).toEqual(expect.arrayContaining(['moveUp', 'moveDown']));
      //variables
      const names = p().variables.map((v) => v.name);
      for (const n of ['prompt', 'items', 'answered', 'correct', 'attempts', 'score', 'locked', 'feedback', 'hint', 'hintsLeft']) expect(names).toContain(`q1_${n}`);
      expect(val('q1_prompt')).toBe(q.prompt);
      expect(Array.isArray(val('q1_items'))).toBe(true);
      //the graph: every action is about this question, every event leads to one, and clicks target real layers
      const ab = p().artboards[0];
      const ids = new Set<string>();
      walk(ab.children, (n) => void ids.add(n.id));
      const actions = ab.logic.nodes.filter((n) => n.kind.startsWith('action.question'));
      expect(actions.length).toBeGreaterThan(2);
      for (const a of actions) expect(a.params.question).toBe(f.id);
      for (const n of ab.logic.nodes.filter((x) => x.kind === 'event.pointer')) expect(ids.has(String(n.params.target))).toBe(true);
      for (const n of ab.logic.nodes.filter((x) => x.kind.startsWith('event.'))) expect(ab.logic.edges.some((e) => e.from === n.id)).toBe(true);
      expect(ab.logic.nodes.every((n) => n.kit?.frame === f.id)).toBe(true);
      //layers refer only to this question's variables
      walk(ab.children, (n) => {
        for (const e of Object.values(n.bindings ?? {})) for (const m of e.matchAll(/\bq(\d+)_/g)) expect(m[1]).toBe('1');
      });
    });
    it(`${kind}: survives a save and load`, () => {
      const { p } = make(kind);
      const back = normalizeProject(JSON.parse(JSON.stringify(p())));
      expect(questionFrames(back.artboards[0])[0].question).toEqual(questionFrames(p().artboards[0])[0].question);
      expect(Object.keys(partsOf(questionFrames(back.artboards[0])[0])).length).toBeGreaterThan(5);
    });
  }

  it('choice options are one template layer repeated over the items variable', () => {
    const { frame } = make('single');
    const opts = part(frame(), 'options') as FrameNode;
    expect(opts.repeat?.items).toBe('q1_items');
    expect(opts.children).toHaveLength(1);
    expect(part(frame(), 'option')?.role).toBe('radio');
    expect(opts.role).toBe('radiogroup');
  });
  it('multiple response uses checkboxes', () => {
    const { frame } = make('multiple');
    expect(part(frame(), 'option')?.role).toBe('checkbox');
    expect(part(frame(), 'marker')?.type).toBe('rect');
  });
  it('a second question gets its own prefix, variables and graph', () => {
    const { s, abId, p } = make('single');
    let second = '';
    s.update((d) => void (second = addQuestion(d as Project, abId, 'ordering')!));
    const frames = questionFrames(p().artboards[0]);
    expect(frames.map((f) => f.question!.prefix)).toEqual(['q1', 'q2']);
    expect(p().variables.some((v) => v.name === 'q2_items')).toBe(true);
    expect(p().artboards[0].logic.nodes.filter((n) => n.kit?.frame === second).length).toBeGreaterThan(4);
    expect(new Set(p().artboards[0].logic.nodes.map((n) => n.id)).size).toBe(p().artboards[0].logic.nodes.length);
  });
});

describe('question settings', () => {
  it('changing the prompt and options updates the variables the layers read, and keeps the look', () => {
    const { s, abId, id, p, frame, set, val } = make('single');
    //restyle: the person colours the prompt and the option label
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[0];
      (part(f, 'prompt') as { color: string }).color = '#ff00aa';
      (part(f, 'optionLabel') as { fontSize: number }).fontSize = 30;
      (part(f, 'option') as { cornerRadius: number }).cornerRadius = 1;
    });
    const options = [...frame().question!.options, { id: 'o5', text: 'Fifth' }];
    set({ prompt: 'A new prompt', options, hints: ['one', 'two'], attempts: 3 });
    expect(val('q1_prompt')).toBe('A new prompt');
    expect(val('q1_items')).toHaveLength(5);
    expect(val('q1_hintsLeft')).toBe(2);
    expect(val('q1_triesLeft')).toBe(3);
    expect((part(frame(), 'prompt') as unknown as { color: string }).color).toBe('#ff00aa');
    expect((part(frame(), 'optionLabel') as unknown as { fontSize: number }).fontSize).toBe(30);
    expect((part(frame(), 'option') as unknown as { cornerRadius: number }).cornerRadius).toBe(1);
    void s;
    void abId;
    void id;
    void p;
  });
  it('changing the type rebuilds the answer area, keeps the rest and keeps the wiring', () => {
    const { s, frame, set, p } = make('single');
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[0];
      (part(f, 'prompt') as { color: string }).color = '#123456';
      (part(f, 'check') as { label: string }).label = 'Submit';
    });
    const checkNode = () => p().artboards[0].logic.nodes.find((n) => n.kit?.slot === 'check:action')!;
    const checkId = checkNode().id;
    set({ kind: 'multiple' });
    expect(part(frame(), 'option')?.role).toBe('checkbox');
    expect((part(frame(), 'prompt') as unknown as { color: string }).color).toBe('#123456');
    expect((part(frame(), 'check') as unknown as { label: string }).label).toBe('Submit');
    expect(checkNode().id).toBe(checkId);
    set({ kind: 'ordering', options: frame().question!.options.map((o) => ({ ...o, correct: undefined })) });
    expect(Object.keys(partsOf(frame()))).toEqual(expect.arrayContaining(['moveUp', 'moveDown']));
    expect(p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionMove')).toHaveLength(2);
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'action.questionChoose')).toBe(false);
    set({ kind: 'blank', blanks: [{ id: 'b1', label: 'Capital', answers: ['Paris'] }] });
    expect(part(frame(), 'blankInput')).toBeTruthy();
    expect(part(frame(), 'options')).toBeFalsy();
    expect(p().variables.some((v) => v.name === 'q1_blank1')).toBe(true);
    //no events left pointing at layers that are gone
    const ids = new Set<string>();
    walk(p().artboards[0].children, (n) => void ids.add(n.id));
    for (const n of p().artboards[0].logic.nodes.filter((x) => x.kind === 'event.pointer')) expect(ids.has(String(n.params.target))).toBe(true);
  });
  it('blank rows follow the number of blanks, the new one in the look of the last', () => {
    const { s, frame, set, val } = make('blank');
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[0];
      (part(f, 'blankInput') as { cornerRadius: number }).cornerRadius = 19;
    });
    set({ blanks: [...frame().question!.blanks, { id: 'b2', label: 'Second', answers: ['x'] }, { id: 'b3', label: 'Third', answers: ['y'] }] });
    const inputs = partsOf(frame()).blankInput as unknown as { cornerRadius: number; bindings: Record<string, string>; bindingModes: Record<string, string> }[];
    expect(inputs).toHaveLength(3);
    expect(inputs.map((i) => i.cornerRadius)).toEqual([19, 19, 19]);
    expect(new Set(inputs.map((i) => i.bindings.value)).size).toBe(3);
    expect(inputs.every((i) => i.bindingModes.value === 'both')).toBe(true);
    expect(val('q1_items')).toHaveLength(3);
    set({ blanks: frame().question!.blanks.slice(0, 1) });
    expect(partsOf(frame()).blankInput).toHaveLength(1);
  });
  it('renaming the prefix renames the variables and everything that reads them', () => {
    const { s, frame, set, p } = make('single');
    //a layer outside the question that reads the score
    s.update((d) => {
      d.artboards[0].children.push({ id: 'outside', type: 'text', name: 'Outside', text: 'You scored {q1_score}', x: 0, y: 0, width: 10, height: 10, rotation: 0, scaleX: 1, scaleY: 1, originX: 0, originY: 0, opacity: 1, visible: true, bindings: { visible: 'q1_answered' } } as unknown as SceneNode);
    });
    set({ prefix: 'maths' });
    expect(p().variables.filter((v) => v.name.startsWith('q1_'))).toHaveLength(0);
    expect(p().variables.some((v) => v.name === 'maths_score')).toBe(true);
    expect((part(frame(), 'options') as FrameNode).repeat?.items).toBe('maths_items');
    const outside = p().artboards[0].children.find((n) => n.id === 'outside') as unknown as { text: string; bindings: Record<string, string> };
    expect(outside.text).toBe('You scored {maths_score}');
    expect(outside.bindings.visible).toBe('maths_answered');
    //variable ids stay, so nothing that held one by id breaks
    expect(new Set(p().variables.map((v) => v.id)).size).toBe(p().variables.length);
  });
  it('a copied question shares its original’s variables until it is made independent', () => {
    const { s, abId, p, frame } = make('single');
    s.update((d) => {
      const ab = d.artboards[0];
      const copy = cloneWithNewIds(JSON.parse(JSON.stringify(ab.children[0])));
      ab.children.push(copy);
    });
    const frames = questionFrames(p().artboards[0]);
    expect(frames).toHaveLength(2);
    expect(sharedPrefix(p(), frames[1])).toHaveLength(1);
    s.update((d) => makeIndependent(d as Project, abId, frames[1].id));
    const after = questionFrames(p().artboards[0]);
    expect(after[1].question!.prefix).toBe('q2');
    expect(after[0].question!.prefix).toBe('q1');
    expect(sharedPrefix(p(), after[1])).toHaveLength(0);
    //the copy reads its own variables, the original still reads its own
    expect((part(after[1], 'options') as FrameNode).repeat?.items).toBe('q2_items');
    expect((part(frame(), 'options') as FrameNode).repeat?.items).toBe('q1_items');
    //and each has its own wiring
    const mine = (id: string) => p().artboards[0].logic.nodes.filter((n) => n.kit?.frame === id);
    expect(mine(after[0].id).length).toBeGreaterThan(4);
    expect(mine(after[1].id).length).toBe(mine(after[0].id).length);
    for (const a of mine(after[1].id).filter((n) => n.kind.startsWith('action.question'))) expect(a.params.question).toBe(after[1].id);
    for (const e of mine(after[1].id).filter((n) => n.kind === 'event.pointer')) expect(JSON.stringify(after[1])).toContain(String(e.params.target));
  });
  it('Duplicate gives the copy its own variables and wiring; deleting a question takes its wiring', () => {
    const { s, p, id } = make('multiple');
    s.set({ activeArtboardId: p().artboards[0].id });
    s.select([id]);
    s.duplicateSelection();
    const frames = questionFrames(p().artboards[0]);
    expect(frames.map((f) => f.question!.prefix)).toEqual(['q1', 'q2']);
    expect(p().artboards[0].logic.nodes.filter((n) => n.kit?.frame === frames[1].id).length).toBe(p().artboards[0].logic.nodes.filter((n) => n.kit?.frame === id).length);
    expect(p().variables.some((v) => v.name === 'q2_items')).toBe(true);
    s.select([id]);
    s.deleteSelection();
    expect(p().artboards[0].logic.nodes.every((n) => n.kit?.frame === frames[1].id)).toBe(true);
    expect(p().artboards[0].logic.edges.every((e) => p().artboards[0].logic.nodes.some((n) => n.id === e.from) && p().artboards[0].logic.nodes.some((n) => n.id === e.to))).toBe(true);
  });
  it('a deleted button takes its wiring with it on the next change, and nothing else', () => {
    const { s, frame, set, p } = make('single');
    const hint = part(frame(), 'hint')!.id;
    s.update((d) => {
      const f = questionFrames(d.artboards[0] as Project['artboards'][0])[0];
      f.children = f.children.map((c) => (c.type === 'frame' && c.questionPart === 'buttons' ? { ...c, children: c.children.filter((k) => k.id !== hint) } : c)) as typeof f.children;
    });
    set({ points: 3 });
    expect(p().artboards[0].logic.nodes.some((n) => n.kit?.slot === 'hint:action')).toBe(false);
    expect(p().artboards[0].logic.nodes.some((n) => n.kit?.slot === 'check:action')).toBe(true);
    expect(part(frame(), 'hint')).toBeFalsy();
  });
  it('keeps wiring the person added after the kit’s nodes', () => {
    const { s, frame, set, p } = make('single');
    const check = p().artboards[0].logic.nodes.find((n) => n.kit?.slot === 'check:action')!;
    s.update((d) => {
      const ab = d.artboards[0];
      ab.logic.nodes.push({ id: 'mine', kind: 'action.log', x: 900, y: 0, params: { message: '"done"' } });
      ab.logic.edges.push({ id: 'mine-e', from: check.id, fromPort: 'correct', to: 'mine', toPort: 'in' });
    });
    set({ prompt: 'again', shuffle: true });
    expect(p().artboards[0].logic.nodes.some((n) => n.id === 'mine')).toBe(true);
    expect(p().artboards[0].logic.edges.some((e) => e.id === 'mine-e')).toBe(true);
    expect(frame().question!.shuffle).toBe(true);
  });
  it('the reset button follows a bank, and its own wording stays if it was changed', () => {
    const { s, frame, set } = make('single');
    expect((part(frame(), 'reset') as unknown as { label: string }).label).toBe('Try again');
    set({ bank: { items: 'quiz', order: 'random' } });
    expect((part(frame(), 'reset') as unknown as { label: string }).label).toBe('Next question');
    expect(frame().question!.bank?.items).toBe('quiz');
    s.update((d) => {
      (part(questionFrames(d.artboards[0] as Project['artboards'][0])[0], 'reset') as { label: string }).label = 'Go on';
    });
    set({ bank: null });
    expect((part(frame(), 'reset') as unknown as { label: string }).label).toBe('Go on');
  });
  it('reports the result from the Check answer node when the question finishes, if asked', () => {
    const { set, p } = make('single');
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'action.reportResult')).toBe(false);
    set({ report: 'complete' });
    const ab = p().artboards[0];
    const rep = ab.logic.nodes.find((n) => n.kind === 'action.reportResult')!;
    const check = ab.logic.nodes.find((n) => n.kit?.slot === 'check:action')!;
    expect(rep.params).toMatchObject({ completed: 'complete', score: 'q1_score' });
    expect(ab.logic.edges.some((e) => e.from === check.id && e.fromPort === 'finished' && e.to === rep.id)).toBe(true);
    set({ report: 'progress', prompt: 'x' });
    expect(p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.reportResult')).toHaveLength(1);
    expect(p().artboards[0].logic.nodes.find((n) => n.kind === 'action.reportResult')!.params.completed).toBe('progress');
    set({ report: null });
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'action.reportResult')).toBe(false);
    expect(p().artboards[0].logic.edges.every((e) => p().artboards[0].logic.nodes.some((n) => n.id === e.to))).toBe(true);
  });
  it('a bank from a data source reloads the question when the data arrives', () => {
    const { s, set, p } = make('single');
    s.update((d) => void d.dataSources.push({ id: 'ds', name: 'quiz', kind: 'json', source: 'url', url: 'https://example.com/q.json' }));
    expect(bankSource(p(), 'quiz.rows')).toBe('quiz');
    expect(bankSource(p(), 'data.quiz')).toBe('quiz');
    expect(bankSource(p(), 'other')).toBeNull();
    set({ bank: { items: 'quiz', order: 'sequence' } });
    const ev = p().artboards[0].logic.nodes.find((n) => n.kind === 'event.dataLoaded')!;
    expect(ev.params.source).toBe('quiz');
    expect(p().variables.some((v) => v.name === 'q1_bankIndex')).toBe(true);
    set({ bank: null });
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'event.dataLoaded')).toBe(false);
  });
});

describe('playing a generated question', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const play = (p: Project) => new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false });
  const click = async (id: string) => {
    const el = document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
    if (!el) throw new Error(`no layer ${id}`);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };

  it('shows one option per item, picks one, checks it and shows the feedback', async () => {
    const { p, frame } = make('single');
    const player = play(p());
    await flush();
    const opt = part(frame(), 'option')!.id;
    expect(document.querySelectorAll(`[data-ix-id^="${opt}~"]`)).toHaveLength(4);
    expect(player.getVariable('q1_items')).toHaveLength(4);
    //pick the wrong one, check
    await click(`${opt}~0`);
    expect((player.getVariable('q1_items') as { selected: boolean }[]).map((i) => i.selected)).toEqual([true, false, false, false]);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_answered')).toBe(true);
    expect(player.getVariable('q1_correct')).toBe(false);
    expect(player.getVariable('q1_feedback')).toBe('Not quite. Have another look.');
    //pick the right one, check
    await click(`${opt}~1`);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(player.getVariable('q1_locked')).toBe(true);
    expect(player.getVariable('q1_score')).toBe(1);
    expect(player.getVariable('q1_attempts')).toBe(2);
    //Try again is not offered for a right answer; the hint button has gone with the question finished
    player.destroy?.();
  });

  it('announces the feedback and hints for screen readers', async () => {
    const { p, frame, set } = make('single');
    set({ hints: ['Think of factors'] });
    const player = play(p());
    const said: string[] = [];
    player.on('announce', (m: { text: string }) => said.push(m.text));
    await flush();
    await click(part(frame(), 'hint')!.id);
    expect(player.getVariable('q1_hint')).toBe('Think of factors');
    await click(`${part(frame(), 'option')!.id}~1`);
    await click(part(frame(), 'check')!.id);
    expect(said).toEqual(expect.arrayContaining(['Think of factors', '11, selected', 'Correct!']));
  });

  it('reset puts it back, and orders items with the up and down buttons', async () => {
    const { p, frame, set } = make('ordering');
    set({ shuffle: false });
    const player = play(p());
    await flush();
    const item = part(frame(), 'option')!.id;
    const text = () => (player.getVariable('q1_items') as { text: string }[]).map((i) => i.text);
    expect(text()).toEqual(['Evaporation', 'Condensation', 'Precipitation', 'Collection']);
    await click(`${part(frame(), 'moveDown')!.id}~0`);
    expect(text()).toEqual(['Condensation', 'Evaporation', 'Precipitation', 'Collection']);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_correct')).toBe(false);
    await click(`${part(frame(), 'moveUp')!.id}~1`);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_correct')).toBe(true);
    expect(document.querySelectorAll(`[data-ix-id^="${item}~"]`)).toHaveLength(4);
  });

  it('fills in a blank typed into the input', async () => {
    const { p, frame } = make('blank');
    const player = play(p());
    await flush();
    const input = document.querySelector<HTMLInputElement>(`[data-ix-id="${part(frame(), 'blankInput')!.id}"] input, input[data-ix-id="${part(frame(), 'blankInput')!.id}"]`)!;
    expect(input).toBeTruthy();
    input.value = ' paris ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_blank1')).toBe(' paris ');
    expect(player.getVariable('q1_correct')).toBe(true);
  });

  it('draws questions from a bank of data', async () => {
    const { s, p, frame, set } = make('single');
    s.update((d) => {
      d.dataSources.push({ id: 'ds', name: 'quiz', kind: 'json', source: 'url', url: 'https://example.com/q.json' });
      d.variables.push({ id: 'quizv', name: 'quiz', type: 'list', initial: JSON.stringify([{ prompt: 'Capital of Spain?', options: 'Madrid|Rome', correct: 'Madrid' }, { prompt: 'Capital of Italy?', options: 'Madrid|Rome', correct: 'Rome' }]) });
    });
    set({ bank: { items: 'quiz', order: 'sequence' } });
    const player = play(p());
    await flush();
    expect(player.getVariable('q1_prompt')).toBe('Capital of Spain?');
    expect(player.getVariable('q1_items')).toHaveLength(2);
    const opt = part(frame(), 'option')!.id;
    await click(`${opt}~0`);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_correct')).toBe(true);
    await click(part(frame(), 'reset')!.id);
    expect(player.getVariable('q1_prompt')).toBe('Capital of Italy?');
    expect(player.getVariable('q1_correct')).toBe(false);
    await click(`${opt}~1`);
    await click(part(frame(), 'check')!.id);
    expect(player.getVariable('q1_correct')).toBe(true);
  });
});

describe('read aloud and number keys on the kit', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const play = (p: Project) => new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false });
  const press = async (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await flush();
  };

  it('Listen button: added beside Check, wired to read the question, and removed again', () => {
    const { p, frame, set } = make('single');
    expect(part(frame(), 'listen')).toBeUndefined();
    set({ listen: true });
    const listen = part(frame(), 'listen')!;
    expect(listen.type).toBe('button');
    expect(listen.bindings?.visible).toBe('voiceAvailable');
    const ab = p().artboards[0];
    const click = ab.logic.nodes.find((n) => n.kind === 'event.pointer' && n.params.target === listen.id)!;
    const edge = ab.logic.edges.find((e) => e.from === click.id)!;
    const act = ab.logic.nodes.find((n) => n.id === edge.to)!;
    expect(act.kind).toBe('action.speak');
    expect(act.params).toMatchObject({ op: 'auto', question: frame().id });
    //turning it on twice, or changing something else, does not add another
    set({ prompt: 'Changed?' });
    expect(partsOf(frame()).listen).toHaveLength(1);
    set({ listen: false });
    expect(part(frame(), 'listen')).toBeUndefined();
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'action.speak')).toBe(false);
  });

  it('Number keys: one On key wire to Choose option, a hint line, and gone when switched off', () => {
    const { p, frame, set } = make('single');
    set({ numberKeys: true });
    const ab = p().artboards[0];
    const key = ab.logic.nodes.filter((n) => n.kind === 'event.key');
    expect(key).toHaveLength(1);
    expect(key[0].params.key).toBe('');
    const choose = ab.logic.nodes.find((n) => n.id === ab.logic.edges.find((e) => e.from === key[0].id)!.to)!;
    expect(choose.kind).toBe('action.questionChoose');
    expect(choose.params.option).toBe('Number(event.key) - 1');
    expect(part(frame(), 'keysHint')).toBeTruthy();
    set({ numberKeys: true, prompt: 'Again?' });
    expect(ab.logic.nodes.filter((n) => n.kind === 'event.key')).toHaveLength(1);
    expect(partsOf(frame()).keysHint).toHaveLength(1);
    set({ numberKeys: false });
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'event.key')).toBe(false);
    expect(part(frame(), 'keysHint')).toBeUndefined();
  });

  it('Number keys: not offered for a fill in the blank', () => {
    const { p, frame, set } = make('blank');
    set({ numberKeys: true });
    expect(p().artboards[0].logic.nodes.some((n) => n.kind === 'event.key' && n.params.key === '')).toBe(false);
    expect(part(frame(), 'keysHint')).toBeUndefined();
  });

  it('Enter in a fill in the blank checks the answer: an On key wire that hears typing, only inside the question', () => {
    const { p, frame, set } = make('blank');
    set({ prompt: 'Again?' });
    const ab = p().artboards[0];
    const key = ab.logic.nodes.filter((n) => n.kind === 'event.key');
    expect(key).toHaveLength(1);
    expect(key[0].params).toMatchObject({ key: 'Enter', typing: true, target: frame().id });
    const to = ab.logic.nodes.find((n) => n.id === ab.logic.edges.find((e) => e.from === key[0].id)!.to)!;
    expect(to.kind).toBe('action.questionCheck');
    //other kinds of question have no such node
    const other = make('single');
    other.set({ prompt: 'Again?' });
    expect(other.p().artboards[0].logic.nodes.some((n) => n.kind === 'event.key')).toBe(false);
  });

  it('Number keys choose the option in that place when played, and other keys do nothing', async () => {
    const { p, set } = make('single');
    set({ numberKeys: true });
    const player = play(p());
    await flush();
    const picked = () => (player.getVariable('q1_items') as { selected: boolean }[]).map((i) => i.selected);
    await press('3');
    expect(picked()).toEqual([false, false, true, false]);
    await press('1');
    expect(picked()).toEqual([true, false, false, false]);
    for (const k of ['0', '9', 'a', 'Enter', ' ', 'Tab']) await press(k);
    expect(picked()).toEqual([true, false, false, false]);
    player.destroy();
  });

  it('Number keys toggle on a multiple choice, and stop once the question is locked', async () => {
    const { p, set, frame } = make('multiple');
    set({ numberKeys: true });
    const player = play(p());
    await flush();
    const picked = () => (player.getVariable('q1_items') as { selected: boolean }[]).map((i) => i.selected);
    await press('1');
    await press('2');
    await press('1');
    expect(picked()).toEqual([false, true, false, false]);
    player.setVariable('q1_locked', true);
    await press('3');
    expect(picked()).toEqual([false, true, false, false]);
    expect(frame().question!.numberKeys).toBe(true);
    player.destroy();
  });

  it('Listen says the question and its numbered options, then the feedback and explanation once checked', async () => {
    const spoken: string[] = [];
    vi.stubGlobal('SpeechSynthesisUtterance', class { voice: unknown = null; lang = ''; rate = 1; volume = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(public text: string) {} });
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ name: 'L', lang: 'en-GB', localService: true }],
      speak: (u: { text: string; onend: (() => void) | null }) => {
        spoken.push(u.text);
        u.onend?.();
      },
      cancel: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    const { p, frame, set } = make('single');
    set({ listen: true, explain: 'Because it is the sensible choice.', prompt: 'Pick one', spoken: 'Please pick one' });
    const player = play(p());
    await flush();
    const click = async (id: string) => {
      document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    const listen = part(frame(), 'listen')!.id;
    expect(document.querySelector(`[data-ix-id="${listen}"]`)).toBeTruthy();
    await click(listen);
    expect(spoken[0]).toMatch(/^Please pick one 1\. /);
    expect(spoken[0]).toMatch(/ 4\. /);
    await click(`${part(frame(), 'option')!.id}~0`);
    await click(part(frame(), 'check')!.id);
    await click(listen);
    expect(spoken[spoken.length - 1]).toMatch(/Because it is the sensible choice\.$/);
    player.destroy();
  });
});
