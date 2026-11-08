//A question bank gone through once (end: finish): the kit's variables for it, a list variable as the rows, the done outputs,
//and starting a new run or reviewing the missed ones.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createProject, type Project } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addQuestion, partsOf, questionFrames, setQuestionSettings } from '../src/lib/question-kit';

const ROWS = [
  { prompt: 'One?', options: 'a|b', correct: 'a', points: 2 },
  { prompt: 'Two?', options: 'a|b', correct: 'b' },
  { prompt: 'Three?', options: 'a|b', correct: 'a' },
];

function make() {
  const s = new EditorStore(createProject('Run'));
  s.update((d) => void (d.settings.title = 'Run'));
  const abId = s.get().project.artboards[0].id;
  let id = '';
  s.update((d) => {
    id = addQuestion(d as Project, abId, 'single')!;
    d.variables.push({ id: 'rows', name: 'rows', type: 'list', initial: JSON.stringify(ROWS) });
    setQuestionSettings(d as Project, abId, id, { attempts: 1, bank: { items: 'rows', order: 'sequence', end: 'finish' } });
  });
  const p = () => s.get().project;
  const frame = () => questionFrames(p().artboards[0]).find((f) => f.id === id)!;
  const byPart = (part: string) => partsOf(frame())[part] ?? [];
  const set = (patch: Parameters<typeof setQuestionSettings>[3]) => s.update((d) => setQuestionSettings(d as Project, abId, id, patch));
  return { s, p, frame, byPart, set, id };
}

describe('a run in the question kit', () => {
  it('has the run variables and not the loop ones missing, and drops them from the options when it loops again', () => {
    const { p, set, frame } = make();
    const names = () => p().variables.map((v) => v.name);
    expect(names()).toEqual(expect.arrayContaining(['q1_setPos', 'q1_setScore', 'q1_setMax', 'q1_setDone', 'q1_missed', 'q1_setLeft', 'q1_setCount', 'q1_bankIndex']));
    set({ bank: { items: 'rows', order: 'random' } });
    expect(frame().question!.bank).toEqual({ items: 'rows', order: 'random' });
  });
  it('renaming the prefix renames the run variables with it', () => {
    const { p, set } = make();
    set({ prefix: 'quiz' });
    const names = p().variables.map((v) => v.name);
    expect(names).toContain('quiz_setScore');
    expect(names).not.toContain('q1_setScore');
  });
});

describe('playing a run', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:900px"></div>';
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

  it('asks each row of a list variable once, totals the score and says set done from both nodes', async () => {
    const { p, byPart } = make();
    //the end of the run is wired to messages the test can hear
    const proj = JSON.parse(JSON.stringify(p())) as Project;
    const logic = proj.artboards[0].logic;
    const check = logic.nodes.find((n) => n.kind === 'action.questionCheck')!;
    const reset = logic.nodes.find((n) => n.kind === 'action.questionReset' && n.kit?.slot === 'reset:action')!;
    const say = (id: string, name: string) => logic.nodes.push({ id, kind: 'action.emit', x: 0, y: 0, params: { name } });
    say('lastCheck', 'last-check');
    say('doneReset', 'done-reset');
    logic.edges.push({ id: 'e1', from: check.id, fromPort: 'setDone', to: 'lastCheck', toPort: 'in' }, { id: 'e2', from: reset.id, fromPort: 'done', to: 'doneReset', toPort: 'in' });
    const player = new Player(document.getElementById('stage')!, proj, { loadData: false });
    const heard: string[] = [];
    player.on('message', (m: { name: string }) => heard.push(m.name));
    await flush();
    expect(player.getVariable('q1_prompt')).toBe('One?');
    expect(player.getVariable('q1_setMax')).toBe(4);
    const opt = async (i: number) => {
      //options are repeated copies of one template, so choose through the layers the repeater made
      const all = [...document.querySelectorAll<HTMLElement>('[data-ix-role="radio"], [role="radio"]')];
      all[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    };
    await opt(0);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_setScore')).toBe(2);
    expect(heard).not.toContain('last-check');
    await click(byPart('reset')[0].id);
    expect(player.getVariable('q1_prompt')).toBe('Two?');
    await opt(0);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_missed')).toEqual([1]);
    await click(byPart('reset')[0].id);
    expect(player.getVariable('q1_setPos')).toBe(3);
    await opt(0);
    await click(byPart('check')[0].id);
    expect(player.getVariable('q1_setScore')).toBe(3);
    expect(player.getVariable('q1_setDone')).toBe(true);
    expect(heard).toContain('last-check');
    //Next from the last question: the run is done, so the Done output runs and nothing new is dealt
    await click(byPart('reset')[0].id);
    expect(heard).toContain('done-reset');
    expect(player.getVariable('q1_prompt')).toBe('Three?');
    expect(player.getVariable('q1_setPos')).toBe(3);
    player.destroy();
  });
});
