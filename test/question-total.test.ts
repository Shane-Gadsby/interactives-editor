//The whole quiz: Results taking their score from all the questions, the built-in quiz names a repeater can use, keeping the answer
//when a page is revisited, hiding Try again, and the kit's Report result nodes following the setting.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, createNode, createProject, type Project, type SceneNode } from 'interactives-player';
import { EditorStore } from '../src/store/store';
import { addQuestion, partsOf, questionFrames, setQuestionSettings, syncReportScores } from '../src/lib/question-kit';
import { patchReporting } from '../src/panels/ReportingSection';

/** A project with three single choice questions (2, 1 and 3 points) on one page. */
function quiz() {
  const s = new EditorStore(createProject('Quiz'));
  s.update((d) => void (d.settings.title = 'Quiz'));
  const abId = s.get().project.artboards[0].id;
  const ids: string[] = [];
  s.update((d) => {
    for (const pts of [2, 1, 3]) {
      const id = addQuestion(d as Project, abId, 'single', { at: { x: 0, y: ids.length * 500 } })!;
      ids.push(id);
      setQuestionSettings(d as Project, abId, id, { points: pts, attempts: 1, prompt: `Question worth ${pts}` });
    }
  });
  const p = () => s.get().project;
  const frames = () => questionFrames(p().artboards[0]);
  const part = (i: number, name: string) => (partsOf(frames()[i])[name] ?? [])[0];
  const results = (patch: Parameters<typeof patchReporting>[1]) =>
    s.update((d) => {
      const next = patchReporting(d as Project, patch);
      if (next) (d as Project).settings.reporting = next;
      else delete (d as Project).settings.reporting;
      if ('scoreFrom' in patch) syncReportScores(d as Project);
    });
  return { s, p, abId, ids, frames, part, results };
}

describe('score from all the questions in the kit', () => {
  it('the Report result nodes carry no score of their own, and go back to the question score when it is switched off', () => {
    const { s, p, abId, frames, results } = quiz();
    s.update((d) => frames().forEach((f) => setQuestionSettings(d as Project, abId, f.id, { report: 'progress' })));
    const reports = () => p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.reportResult').sort((a, b) => String(a.params.score || a.kit?.frame).localeCompare(String(b.params.score || b.kit?.frame)));
    expect(reports().map((n) => n.params.score).sort()).toEqual(['q1_score', 'q2_score', 'q3_score']);
    results({ scoreFrom: 'questions' });
    expect(reports().map((n) => n.params.score)).toEqual(['', '', '']);
    //a question reported after the switch starts without one too
    s.update((d) => void setQuestionSettings(d as Project, abId, frames()[0].id, { report: undefined }));
    s.update((d) => void setQuestionSettings(d as Project, abId, frames()[0].id, { report: 'complete' }));
    expect(reports().map((n) => n.params.score)).toEqual(['', '', '']);
    results({ scoreFrom: undefined });
    expect(reports().map((n) => n.params.score).sort()).toEqual(['q1_score', 'q2_score', 'q3_score']);
  });
  it('Hide Try again takes the button away, and Keep the answer sets the start reset to leave it', () => {
    const { s, abId, frames, part, p } = quiz();
    const visible = () => (part(0, 'reset') as SceneNode).bindings?.visible;
    expect(visible()).toBe('q1_locked && !q1_correct');
    s.update((d) => void setQuestionSettings(d as Project, abId, frames()[0].id, { hideReset: true, keep: true }));
    expect(visible()).toBe('false');
    const reset = p().artboards[0].logic.nodes.filter((n) => n.kind === 'action.questionReset' && n.kit?.frame === frames()[0].id);
    const start = reset.find((n) => n.kit?.slot === 'start:action')!;
    const again = reset.find((n) => n.kit?.slot === 'reset:action')!;
    expect(start.params.keepAnswer).toBe(true);
    expect(again.params.keepAnswer).toBeFalsy();
    s.update((d) => void setQuestionSettings(d as Project, abId, frames()[0].id, { hideReset: undefined, keep: undefined }));
    expect(visible()).toBe('q1_locked && !q1_correct');
    expect(p().artboards[0].logic.nodes.find((n) => n.id === start.id)!.params.keepAnswer).toBe(false);
  });
});

describe('playing the whole quiz', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:2200px"></div>';
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
  const play = (project: Project, opts: ConstructorParameters<typeof Player>[2] = {}) => new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false, ...opts });
  /** Choose option `n` (from 0) of question `i` and check it. */
  const answer = async (t: ReturnType<typeof quiz>, i: number, n: number) => {
    const frame = document.querySelector<HTMLElement>(`[data-ix-id="${t.frames()[i].id}"]`)!;
    frame.querySelectorAll<HTMLElement>('[role="radio"]')[n].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    await click(t.part(i, 'check').id);
  };

  it('quiz.score, max, percent and passed follow the questions, and quiz.questions lists them for a repeater', async () => {
    const t = quiz();
    t.results({ scoreFrom: 'questions', passMark: 50 });
    t.s.update((d) => {
      const ab = d.artboards[0];
      ab.children.push(
        createNode('text', { id: 'total', name: 'Total', x: 0, y: 1600, text: 'Score {quiz.score} of {quiz.max}, {quiz.percent}%, {quiz.passed ? "pass" : "not yet"}' }),
        createNode('frame', { id: 'list', name: 'List', x: 0, y: 1700, width: 300, height: 300, repeat: { items: 'quiz.questions', layout: 'vertical', gap: 0, columns: 1 }, children: [createNode('text', { id: 'row', name: 'Row', text: '{item.prefix}|{item.page}|{item.score}/{item.points}|{item.locked}' })] } as Partial<SceneNode>),
      );
    });
    const player = play(t.p());
    await flush();
    const text = () => document.querySelector<HTMLElement>('[data-ix-id="total"]')!.textContent;
    expect(text()).toBe('Score 0 of 6, 0%, not yet');
    //right is option 2 of the single question (index 1)
    await answer(t, 0, 1);
    expect(text()).toBe('Score 2 of 6, 33.33%, not yet');
    await answer(t, 2, 1);
    expect(text()).toBe('Score 5 of 6, 83.33%, pass');
    await answer(t, 1, 0);
    expect(document.querySelector<HTMLElement>('[data-ix-id="list"]')!.textContent).toBe('q1|Home|2/2|trueq2|Home|0/1|trueq3|Home|3/3|true');
    //the result a Report result node sends is the same total, out of the questions' points, and passes
    expect(player.result()).toMatchObject({ score: 5, max: 6, percent: 83.33, passed: true });
    player.destroy();
  });

  it('the result is out of the questions\' points whatever the Top score says, and a project without questions reports no score', () => {
    const t = quiz();
    t.results({ scoreFrom: 'questions', maxScore: 100 } as never);
    const player = play(t.p());
    expect(player.result()).toMatchObject({ score: 0, max: 6, percent: 0 });
    player.destroy();
    const bare = createProject('Bare');
    bare.settings.reporting = { scoreFrom: 'questions', passMark: 50 };
    const p2 = play(bare);
    expect(p2.result().score).toBeNull();
    p2.destroy();
  });

  it('a question set to keep its answer is left as it was when its page is visited again; others start over', async () => {
    const t = quiz();
    t.s.update((d) => {
      setQuestionSettings(d as Project, t.abId, t.frames()[0].id, { keep: true });
      d.artboards.push({ ...JSON.parse(JSON.stringify(d.artboards[0])), id: 'other', name: 'Other', children: [], logic: { nodes: [], edges: [] } });
    });
    const player = play(t.p());
    await flush();
    await answer(t, 0, 1);
    await answer(t, 1, 1);
    expect(player.getVariable('q1_score')).toBe(2);
    expect(player.getVariable('q2_score')).toBe(1);
    player.goTo('other');
    await flush();
    player.goTo(t.p().artboards[0].id);
    await flush();
    expect(player.getVariable('q1_score')).toBe(2);
    expect(player.getVariable('q1_locked')).toBe(true);
    //the one that does not keep its answer is set up again
    expect(player.getVariable('q2_locked')).toBe(false);
    expect(player.getVariable('q2_score')).toBe(0);
    player.destroy();
  });

  it('a kept drag question puts its layers back where the last check found them', async () => {
    const s = new EditorStore(createProject('Cat'));
    s.update((d) => void (d.settings.title = 'Cat'));
    const abId = s.get().project.artboards[0].id;
    let id = '';
    s.update((d) => {
      id = addQuestion(d as Project, abId, 'categorise')!;
      setQuestionSettings(d as Project, abId, id, { keep: true, attempts: 3 });
      d.artboards.push({ ...JSON.parse(JSON.stringify(d.artboards[0])), id: 'other', name: 'Other', children: [], logic: { nodes: [], edges: [] } });
    });
    const frame = () => questionFrames(s.get().project.artboards[0])[0];
    const byPart = (part: string, pid: string) => (partsOf(frame())[part] ?? []).find((n) => n.questionPart === `${part}:${pid}`)!;
    expect(s.get().project.variables.some((v) => v.name === 'q1_placed')).toBe(true);
    const player = play(s.get().project);
    await flush();
    const drag = (player as unknown as { session: { drag: { put(a: string, b: string, instant?: boolean): boolean; zoneIdOf(k: string): string | null } } }).session.drag;
    drag.put(byPart('catCard', 'c1').id, byPart('catZone', 'g1').id, true);
    drag.put(byPart('catCard', 'c3').id, byPart('catZone', 'g1').id, true);
    await click(partsOf(frame()).check[0].id);
    expect(player.getVariable('q1_attempts')).toBe(1);
    expect((player.getVariable('q1_placed') as string[][]).map((e) => e.join('>')).sort()).toEqual(['c1>g1', 'c3>g1']);
    player.goTo('other');
    await flush();
    player.goTo(s.get().project.artboards[0].id);
    await flush();
    const back = (player as unknown as { session: { drag: typeof drag } }).session.drag;
    expect(back.zoneIdOf(byPart('catCard', 'c1').id)).toBe(byPart('catZone', 'g1').id);
    expect(back.zoneIdOf(byPart('catCard', 'c3').id)).toBe(byPart('catZone', 'g1').id);
    expect(back.zoneIdOf(byPart('catCard', 'c2').id)).toBeNull();
    //the answer is still checked, with the try it used
    expect(player.getVariable('q1_attempts')).toBe(1);
    player.destroy();
  });

  it('a question marked on the server keeps a variable for the mark the server counts', () => {
    const t = quiz();
    t.s.update((d) => void setQuestionSettings(d as Project, t.abId, t.frames()[0].id, { serverMarked: true }));
    expect(t.p().variables.find((v) => v.name === 'q1_counted')).toMatchObject({ type: 'number', initial: -1 });
    expect(t.p().variables.some((v) => v.name === 'q2_counted')).toBe(false);
  });
});
