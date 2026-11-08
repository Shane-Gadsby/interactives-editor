//The branded assessment starters: each builds in every colourway, paints only with tokens, loads, plays under jsdom, and the
//interactions that matter work (right answers get the right feedback, the quiz score page shows the score).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS, HIGH_CONTRAST } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';

const WAYS = [...COLOURWAYS, HIGH_CONTRAST];
const starter = (key: string) => STARTERS.find((s) => s.key === key)!;
const flush = () => new Promise((r) => setTimeout(r, 8));

describe('every assessment starter', () => {
  it('lists the first four starters, with names and descriptions for the help', () => {
    expect(STARTERS.map((s) => s.key).slice(0, 4)).toEqual(['assessment/multi-page-quiz', 'assessment/true-or-false', 'assessment/fill-in-the-blanks', 'assessment/mark-the-words']);
    for (const s of STARTERS) {
      expect(s.set).toBe('assessment');
      expect(s.name.length).toBeGreaterThan(3);
      expect(s.description.length).toBeGreaterThan(60);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const s of STARTERS) {
    describe(s.name, () => {
      it('builds and normalises in every colourway, painting only with tokens in Open Sans', () => {
        for (const way of WAYS) {
          const { project, checklist } = s.build(way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.themes!.list).toHaveLength(WAYS.length);
          expect(project.artboards.length).toBeGreaterThan(1);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          //a hero page first, with a Start button that goes on
          expect(byName(project.artboards[0], 'Start button')).toBeTruthy();
          for (const ab of project.artboards) {
            expect(JSON.stringify([ab.children, ab.background]), `${s.key} ${ab.name}`).not.toMatch(/"#[0-9a-f]{3,8}"/i);
            expect(JSON.stringify([ab.children, ab.logic])).not.toMatch(/—/);
          }
          expect(JSON.stringify(project.artboards)).toContain('"fontFamily":"Open Sans"');
          //the checklist points at layers and pages that exist
          expect(checklist.length).toBeGreaterThanOrEqual(5);
          const ids = new Set<string>();
          for (const ab of project.artboards) {
            ids.add(ab.id);
            walk(ab.children, (n) => void ids.add(n.id));
          }
          for (const c of checklist) {
            expect(c.text).not.toMatch(/—/);
            if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
            if (c.artboardId) expect(ids.has(c.artboardId), c.text).toBe(true);
          }
          //every graph event reaches something, and every node a wire names is there
          for (const ab of project.artboards) {
            const nodes = new Set(ab.logic.nodes.map((n) => n.id));
            for (const e of ab.logic.edges) {
              expect(nodes.has(e.from)).toBe(true);
              expect(nodes.has(e.to)).toBe(true);
            }
            for (const n of ab.logic.nodes.filter((x) => x.kind.startsWith('event.'))) expect(ab.logic.edges.some((e) => e.from === n.id), `${ab.name}: ${n.kind}`).toBe(true);
          }
          const back = normalizeProject(JSON.parse(JSON.stringify(project)));
          expect(back.artboards).toHaveLength(project.artboards.length);
          expect(back.variables.map((v) => v.name)).toEqual(project.variables.map((v) => v.name));
        }
      });

      it('comes out of projectFromBrandedStarter with its record and checklist', () => {
        const p = projectFromBrandedStarter(s, COLOURWAYS[1], 'Mine');
        expect(p.name).toBe('Mine');
        expect(p.template?.builtin).toBe(`branded:${s.key}`);
        expect(p.template?.checklist.length).toBeGreaterThan(4);
        expect(p.brandLook?.id).toBe('purple');
      });
    });
  }
});

describe('the assessment starters on the native features', () => {
  const SWEPT = STARTERS.filter((s) => s.key !== 'assessment/essay');

  it('carry two to five author notes, all outside the page they sit by, and hand-built counters are gone', () => {
    for (const s of SWEPT) {
      const { project } = s.build(COLOURWAYS[0]);
      const notes = project.artboards.flatMap((ab) => (ab.notes ?? []).map((n) => ({ ab, n })));
      expect(notes.length, s.key).toBeGreaterThanOrEqual(2);
      expect(notes.length, s.key).toBeLessThanOrEqual(5);
      for (const { ab, n } of notes) {
        expect(n.y, s.key).toBeGreaterThanOrEqual(ab.height);
        expect(n.text).not.toMatch(/—/);
      }
      //the chrome is a page master, not copied onto every page
      expect(project.artboards.some((a) => a.isMaster), s.key).toBe(true);
      //pages move on by the page order, not by a hard wired neighbour
      const hard = project.artboards.flatMap((a) => a.logic.nodes).filter((n) => n.kind === 'action.artboard' && n.params.artboard);
      expect(hard, s.key).toHaveLength(0);
    }
  });

  it('mark the words with live variables, one toggle node and a measured passage', () => {
    const { project } = starter('assessment/mark-the-words').build(COLOURWAYS[0]);
    expect(project.variables.filter((v) => v.live).map((v) => v.name)).toEqual(['words', 'found', 'wrong', 'totalRight', 'score']);
    const page = project.artboards[1];
    const ops = page.logic.nodes.filter((n) => n.kind === 'action.setVariable').map((n) => n.params.op);
    expect(ops).toContain('toggleItem');
    expect(ops).not.toContain('push');
    expect(ops).not.toContain('remove');
    expect(page.logic.nodes.some((n) => n.kind === 'action.resetVariables')).toBe(true);
    const chipText = byName(page, 'Word text') as unknown as { autoSize: string };
    expect(chipText.autoSize).toBe('width');
    expect(JSON.stringify(page.children)).not.toContain('item.text.length');
  });
});

describe('playing the assessment starters', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    //Frames run on a timer, so what a click changes is drawn by the time flush() has waited
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0) as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  const made: Player[] = [];
  afterEach(() => {
    for (const p of made.splice(0)) p.destroy?.();
    vi.unstubAllGlobals();
  });

  const play = (p: Project, artboard?: string) => {
    document.getElementById('stage')!.innerHTML = '';
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false, ...(artboard ? { artboard } : {}) });
    made.push(player);
    return player;
  };
  const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const type = async (id: string, value: string) => {
    const input = (el(id)?.matches('input') ? el(id) : el(id)?.querySelector('input')) as HTMLInputElement | null;
    if (!input) throw new Error(`no input ${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const idOf = (ab: Artboard, name: string) => {
    const n = byName(ab, name);
    if (!n) throw new Error(`no layer named ${name}`);
    return n.id;
  };
  //What a learner can read: hidden layers (display: none) are left out
  const text = () => {
    const walkText = (n: Node): string => {
      if (n.nodeType === 3) return n.textContent ?? '';
      if (n.nodeType !== 1) return '';
      if ((n as HTMLElement).style.display === 'none') return '';
      return [...n.childNodes].map(walkText).join('');
    };
    return walkText(document.getElementById('stage')!);
  };
  const disabled = (id: string) => (el(id)?.querySelector('button') as HTMLButtonElement | null)?.disabled;

  it('every artboard of every starter renders and plays without throwing, in every colourway', async () => {
    for (const s of STARTERS) {
      for (const way of WAYS) {
        const { project } = s.build(way);
        for (const ab of project.artboards) {
          play(project, ab.id);
          await flush();
          expect(document.getElementById('stage')!.children.length, `${s.key} ${ab.name}`).toBeGreaterThan(0);
        }
      }
    }
  }, 60000);

  describe('the quiz', () => {
    const { project } = starter('assessment/multi-page-quiz').build(COLOURWAYS[0]);
    const page = (n: number) => project.artboards[n];
    const variable = (name: string) => project.variables.find((v) => v.name === name)!;

    it('has five question pages with a footer progress line, a mix of question types, and Results set to report the score', () => {
      expect(project.artboards.filter((a) => !a.isMaster)).toHaveLength(7);
      //the footer counts from the page order, so it is one line for every question page
      for (let n = 1; n <= 5; n++) expect(byName(page(n), 'Footer text')).toMatchObject({ text: 'Question {pageNumber - 1} of {pageCount - 2}' });
      const kinds = project.artboards.flatMap((ab) => questionFrames(ab).map((f) => f.question!.kind));
      expect(kinds).toEqual(['single', 'multiple', 'truefalse', 'blank', 'ordering']);
      //the total is the quiz's own: Results take the score from the questions, and there is no total to add up
      const r = project.settings.reporting!;
      expect(r.scoreFrom).toBe('questions');
      expect(r.passMark).toBe(60);
      expect(project.variables.map((v) => v.name)).not.toEqual(expect.arrayContaining(['total', 'outOf', 'passPercent']));
      for (const f of project.artboards.flatMap((a) => questionFrames(a))) expect(f.question).toMatchObject({ keep: true, hideReset: true });
      expect(project.artboards.flatMap((a) => a.logic.nodes).filter((n) => n.kind === 'action.setVariable')).toHaveLength(0);
      expect((byName(page(6), 'Question results') as unknown as { repeat: { items: string } }).repeat.items).toBe('quiz.questions');
      expect(r.completion).toBe('artboard');
      expect(r.completionArtboard).toBe(page(6).id);
    });

    async function run(right: boolean) {
      const player = play(project);
      await flush();
      await click(idOf(page(0), 'Start button'));
      const frame = (n: number) => questionFrames(page(n))[0];
      const part = (n: number, name: string) => partsOf(frame(n))[name][0].id;
      for (let n = 1; n <= 5; n++) {
        expect(text()).toContain(`Question ${n} of 5`);
        //Next waits for the question to be finished
        expect(disabled(idOf(page(n), 'Next button'))).toBe(true);
        if (n === 1) await click(`${part(1, 'option')}~${right ? 1 : 0}`);
        if (n === 2) for (const i of right ? [0, 1, 3] : [2]) await click(`${part(2, 'option')}~${i}`);
        if (n === 3) await click(`${part(3, 'option')}~${right ? 0 : 1}`);
        if (n === 4) await type(part(4, 'blankInput'), right ? ' Spaced ' : 'nothing');
        if (n === 5 && right) {
          //Move each item up to where it belongs
          const want = ['List everything you need to study', 'Estimate how long each topic will take', 'Block out study times in your calendar', 'Review and adjust the plan each week'];
          for (let to = 0; to < want.length; to++) {
            const at = () => (player.getVariable('q5_items') as { text: string }[]).findIndex((i) => i.text === want[to]);
            for (let from = at(); from > to; from = at()) await click(`${part(5, 'moveUp')}~${from}`);
          }
        }
        await click(part(n, 'check'));
        expect(player.getVariable(`q${n}_locked`)).toBe(true);
        expect(player.getVariable(`q${n}_correct`)).toBe(right);
        //feedback shows for the answer given
        expect(text()).toContain(right ? frame(n).question!.feedbackCorrect : frame(n).question!.feedbackIncorrect);
        expect(disabled(idOf(page(n), 'Next button'))).toBe(false);
        await click(idOf(page(n), 'Next button'));
      }
      return player;
    }

    it('scores a right run, shows the total and the pass message on the score page, and reports the score', async () => {
      const player = await run(true);
      expect((player as unknown as { quizNow(): { score: number } }).quizNow().score).toBe(5);
      expect(text()).toContain('5 / 5');
      //a tile for each question, from the quiz's own list
      expect(text()).toContain('Question 5Right');
      expect(text()).toContain(variable('passMessage').initial as string);
      expect(text()).not.toContain(variable('failMessage').initial as string);
      expect(text()).toContain('100%');
      expect(player.getVariable('q1_score')).toBe(1);
    });

    it('shows the fail message for a wrong run, and Try again starts over', async () => {
      const player = await run(false);
      //part marks for the questions that give them, but nowhere near a pass
      const total = (player as unknown as { quizNow(): { score: number } }).quizNow().score;
      expect(total).toBeLessThan(2);
      expect(text()).toContain(`${Math.round(total * 10) / 10} / 5`);
      expect(text()).toContain(variable('failMessage').initial as string);
      expect(text()).not.toContain(variable('passMessage').initial as string);
      await click(idOf(page(6), 'Try again button'));
      expect((player as unknown as { quizNow(): { score: number } }).quizNow().score).toBe(0);
      expect(player.getVariable('q1_locked')).toBe(false);
      expect(text()).toContain('Study skills quiz');
    });

    it('Back goes to the page before, and a finished question keeps its answer when you come back', async () => {
      const player = play(project);
      await flush();
      await click(idOf(page(0), 'Start button'));
      const q1 = questionFrames(page(1))[0];
      await click(`${partsOf(q1).option[0].id}~1`);
      await click(partsOf(q1).check[0].id);
      await click(idOf(page(1), 'Next button'));
      expect(text()).toContain('Question 2 of 5');
      await click(idOf(page(2), 'Back button'));
      expect(text()).toContain('Question 1 of 5');
      expect(player.getVariable('q1_locked')).toBe(true);
      expect(player.getVariable('q1_correct')).toBe(true);
    });
  });

  describe('true or false', () => {
    const { project } = starter('assessment/true-or-false').build(COLOURWAYS[2]);
    const [hero, game, result] = project.artboards;
    const statements = JSON.parse(project.variables.find((v) => v.name === 'statements')!.initial as string) as { prompt: string; correct: boolean; explain: string }[];
    const frame = questionFrames(game)[0];
    const option = (i: number) => `${partsOf(frame).option[0].id}~${i}`;

    it('has eight statements, each with an answer and an explanation', () => {
      expect(statements).toHaveLength(8);
      for (const s of statements) expect(s.explain.length).toBeGreaterThan(20);
      expect(statements.some((s) => s.correct)).toBe(true);
      expect(statements.some((s) => !s.correct)).toBe(true);
    });

    it('is one true or false question over a bank that is gone through once, with no hand counters', () => {
      expect(frame.question!.kind).toBe('truefalse');
      expect(frame.question!.bank).toMatchObject({ items: 'statements', end: 'finish' });
      expect(project.variables.map((v) => v.name)).not.toEqual(expect.arrayContaining(['tally', 'answered', 'lastRight', 'missed']));
      expect(byName(game, 'Statements answered')).toMatchObject({ type: 'progress' });
      expect(result.logic.nodes.some((n) => n.kind === 'action.questionReset' && n.params.run === 'missed')).toBe(true);
    });

    it('gives immediate feedback and an explanation for each answer, tallies, and ends on the result page', async () => {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      expect(text()).toContain('Statement 1 of 8');
      expect(text()).toContain(statements[0].prompt);
      expect(text()).not.toContain('✓ Correct');
      let right = 0;
      for (let i = 0; i < statements.length; i++) {
        expect(text()).toContain(statements[i].prompt);
        //answer every other one wrong: True is the first option, False the second
        const answer = i % 2 === 0 ? statements[i].correct : !statements[i].correct;
        await click(option(answer ? 0 : 1));
        const correct = answer === statements[i].correct;
        if (correct) right++;
        expect(player.getVariable('q1_locked')).toBe(true);
        expect(player.getVariable('q1_correct')).toBe(correct);
        expect(player.getVariable('q1_setScore')).toBe(right);
        expect(text()).toContain(correct ? '✓ Correct' : '✗ Not quite');
        expect(text()).toContain(statements[i].explain);
        expect(text()).toContain(`Correct so far: ${right} of ${i + 1}`);
        expect(text()).toContain(i === statements.length - 1 ? 'See my result' : 'Next statement');
        //a second pick does nothing
        await click(option(answer ? 1 : 0));
        expect(player.getVariable('q1_correct')).toBe(correct);
        await click(partsOf(frame).reset[0].id);
      }
      expect(right).toBe(4);
      expect(text()).toContain('4 of 8');
      expect(text()).toContain('A good start');
      //the four wrong ones are listed for review
      expect((player.getVariable('q1_missed') as number[]).length).toBe(4);
      expect(text()).toContain('Statements to look at again');
      expect(text()).toContain(statements[1].prompt);
      await click(idOf(result, 'Try again button'));
      expect(player.getVariable('q1_setScore')).toBe(0);
      expect(text()).toContain('Academic integrity: true or false?');
    });

    it('practises just the statements that were missed, then shows the result again', async () => {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      for (let i = 0; i < statements.length; i++) {
        await click(option(i === 1 || i === 4 ? (statements[i].correct ? 1 : 0) : statements[i].correct ? 0 : 1));
        await click(partsOf(frame).reset[0].id);
      }
      expect(player.getVariable('q1_missed')).toEqual([1, 4]);
      await click(idOf(result, 'Missed button'));
      expect(player.getVariable('q1_setCount')).toBe(2);
      expect(text()).toContain('Statement 1 of 2');
      //the missed ones come in a shuffled order: answer whichever is showing, then the other
      const showing = [1, 4].find((i) => text().includes(statements[i].prompt))!;
      await click(option(statements[showing].correct ? 0 : 1));
      await click(partsOf(frame).reset[0].id);
      expect(text()).toContain('Statement 2 of 2');
      expect(text()).toContain(statements[showing === 1 ? 4 : 1].prompt);
    });
  });

  describe('fill in the blanks', () => {
    const { project } = starter('assessment/fill-in-the-blanks').build(COLOURWAYS[3]);
    const [hero, page] = project.artboards;
    const frame = questionFrames(page)[0];
    const answers = frame.question!.blanks;
    const input = (i: number) => partsOf(frame).blankInput[i].id;

    it('is one fill in the blank question with a blank for each sentence of the passage', () => {
      expect(frame.question!.kind).toBe('blank');
      expect(answers.length).toBeGreaterThanOrEqual(5);
      expect(answers[1].answers).toEqual(['evaporation', 'evaporating']);
      //no results list or marking nodes of its own: the question kit marks
      expect(project.variables.map((v) => v.name)).not.toEqual(expect.arrayContaining(['answers', 'results', 'checked']));
      expect(JSON.stringify(page.logic.nodes.map((n) => n.params))).not.toContain('toLowerCase');
    });

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('says how many are right on Check, lets the learner fix them, and marks each blank with a tick or a cross once it is finished', async () => {
      const player = await open();
      const typed = ['Sun', ' evaporating ', 'wrong', 'cloud', '', 'run-off'];
      for (let i = 0; i < typed.length; i++) await type(input(i), typed[i]);
      expect(player.getVariable('q1_answered')).toBe(false);
      await click(partsOf(frame).check[0].id);
      expect(player.getVariable('q1_answered')).toBe(true);
      expect(player.getVariable('q1_locked')).toBe(false);
      expect(text()).toContain('4 of 6 right');
      //fix the wrong ones and check again
      await type(input(2), 'condensation');
      await type(input(4), 'precipitation');
      await click(partsOf(frame).check[0].id);
      expect(player.getVariable('q1_locked')).toBe(true);
      expect((player.getVariable('q1_items') as { state: string }[]).map((i) => i.state)).toEqual(Array(6).fill('correct'));
      expect(text()).toContain('Every blank is right');
      expect(text()).toContain('6 of 6 right');
      expect(text()).toContain('✓');
    });

    it('after three goes the blanks still wrong are marked with a cross and the answer', async () => {
      const player = await open();
      await type(input(0), 'sun');
      for (let go = 0; go < 3; go++) await click(partsOf(frame).check[0].id);
      expect(player.getVariable('q1_locked')).toBe(true);
      expect(text()).toContain('✗');
      expect(text()).toContain('Accepted answer: evaporation');
    });

    it('Show answers fills them in and marks them, and Start again clears everything', async () => {
      const player = await open();
      await click(idOf(page, 'Show answers button'));
      expect(player.getVariable('q1_answered')).toBe(true);
      expect(player.getVariable('q1_correct')).toBe(true);
      expect(player.getVariable('q1_blank2')).toBe('evaporation');
      expect(player.getVariable('q1_blank6')).toBe('runoff');
      expect(text()).toContain('These are the answers');
      await click(partsOf(frame).reset[0].id);
      expect(player.getVariable('q1_answered')).toBe(false);
      for (let i = 1; i <= answers.length; i++) expect(player.getVariable(`q1_blank${i}`)).toBe('');
    });
  });

  describe('mark the words', () => {
    const { project } = starter('assessment/mark-the-words').build(COLOURWAYS[4]);
    const [hero, page] = project.artboards;
    const passage = project.variables.find((v) => v.name === 'passage')!.initial as string;
    const words = passage.split(' ');
    const chip = () => idOf(page, 'Word');

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('draws one chip for each word of the passage, without the asterisks', async () => {
      await open();
      expect(document.querySelectorAll(`[data-ix-id^="${chip()}~"]`)).toHaveLength(words.length);
      expect(text()).toContain('opened');
      expect(text()).not.toContain('*');
    });

    it('toggles a word on a click and on Enter or Space, and checks right, wrong and missed', async () => {
      const player = await open();
      const at = (w: string) => words.findIndex((x) => x.includes(w));
      await click(`${chip()}~${at('opened')}`);
      await click(`${chip()}~${at('her')}`);
      expect(player.getVariable('picked')).toEqual([at('opened'), at('her')]);
      //a second click takes a word off again
      await click(`${chip()}~${at('her')}`);
      expect(player.getVariable('picked')).toEqual([at('opened')]);
      //the keyboard does it too
      const copy = el(`${chip()}~${at('laptop')}`)!;
      expect(copy.getAttribute('role')).toBe('checkbox');
      expect(copy.getAttribute('aria-checked')).toBe('false');
      //the passage is one Tab stop and the arrow keys move between the words
      expect(el(`${chip()}~0`)!.tabIndex).toBe(0);
      expect(copy.tabIndex).toBe(-1);
      copy.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      copy.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
      await flush();
      expect(player.getVariable('picked')).toEqual([at('opened'), at('laptop')]);
      expect(el(`${chip()}~${at('laptop')}`)!.getAttribute('aria-checked')).toBe('true');
      const enter = el(`${chip()}~${at('read')}`)!;
      enter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      expect(player.getVariable('picked')).toEqual([at('opened'), at('laptop'), at('read')]);
      await click(`${chip()}~${at('read')}`);
      await click(idOf(page, 'Check button'));
      expect(player.getVariable('found')).toBe(1);
      expect(player.getVariable('wrong')).toBe(1);
      expect(player.getVariable('totalRight')).toBe(5);
      expect(text()).toContain('Score: 0 out of 5');
      expect(text()).toContain('opened ✓');
      expect(text()).toContain('laptop, ✗');
      expect(text()).toContain('read ←');
      //after checking a word no longer toggles
      await click(`${chip()}~${at('tutor')}`);
      expect(player.getVariable('picked')).toEqual([at('opened'), at('laptop')]);
      await click(idOf(page, 'Try again button'));
      expect(player.getVariable('picked')).toEqual([]);
      expect(player.getVariable('checked')).toBe(false);
    });

    it('scores every right word and nothing else as full marks, and follows an edited passage', async () => {
      const edited = JSON.parse(JSON.stringify(project)) as Project;
      edited.variables.find((v) => v.name === 'passage')!.initial = 'Cats *chase* mice and *climb* trees';
      const player = play(edited);
      await flush();
      await click(idOf(hero, 'Start button'));
      expect(document.querySelectorAll(`[data-ix-id^="${chip()}~"]`)).toHaveLength(6);
      await click(`${chip()}~1`);
      await click(`${chip()}~4`);
      await click(idOf(page, 'Check button'));
      expect(player.getVariable('totalRight')).toBe(2);
      expect(text()).toContain('Score: 2 out of 2');
    });
  });
});

