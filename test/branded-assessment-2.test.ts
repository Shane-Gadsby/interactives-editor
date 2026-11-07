//The second batch of branded assessment starters (find the hotspot, find multiple hotspots, image choice, single choice set,
//summary, essay): each builds in every colourway, paints only with tokens, and its main interaction works under jsdom.
//The generic checks in branded-assessment.test.ts already loop over every starter in the set, these add what is particular to each.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/assessment';
import { COLOURWAYS, HIGH_CONTRAST } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { partsOf, questionFrames } from '../src/lib/question-kit';

const WAYS = [...COLOURWAYS, HIGH_CONTRAST];
const KEYS = ['assessment/find-the-hotspot', 'assessment/find-multiple-hotspots', 'assessment/image-choice', 'assessment/single-choice-set', 'assessment/summary', 'assessment/essay'];
const starter = (key: string) => STARTERS.find((s) => s.key === key)!;
const flush = (ms = 8) => new Promise((r) => setTimeout(r, ms));

describe('the second batch of assessment starters', () => {
  it('is listed after the first four, with names and descriptions for the help', () => {
    expect(STARTERS.map((s) => s.key).slice(4, 4 + KEYS.length)).toEqual(KEYS);
    for (const k of KEYS) {
      const s = starter(k);
      expect(s.set).toBe('assessment');
      expect(s.description.length).toBeGreaterThan(80);
      expect(s.description).not.toMatch(/—/);
      expect(s.tags.length).toBeGreaterThan(1);
    }
  });

  it('says in the essay description that it is a self-check and not marking', () => {
    expect(starter('assessment/essay').description).toMatch(/self-check/);
    expect(starter('assessment/essay').description).toMatch(/not marking/);
  });

  for (const k of KEYS) {
    it(`${k} builds in every colourway with tokens only, Open Sans, a hero page, and a checklist that points at real layers`, () => {
      for (const way of WAYS) {
        const { project, checklist } = starter(k).build(way);
        expect(project.themes!.default).toBe(`theme-${way.id}`);
        expect(project.artboards.length).toBeGreaterThanOrEqual(2);
        expect(byName(project.artboards[0], 'Start button')).toBeTruthy();
        for (const ab of project.artboards) {
          expect(JSON.stringify([ab.children, ab.background]), `${k} ${ab.name}`).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          expect(JSON.stringify([ab.children, ab.logic, ab.name])).not.toMatch(/—/);
          //every wire runs between nodes that exist
          const nodes = new Set(ab.logic.nodes.map((n) => n.id));
          for (const e of ab.logic.edges) {
            expect(nodes.has(e.from)).toBe(true);
            expect(nodes.has(e.to)).toBe(true);
          }
        }
        expect(JSON.stringify(project.artboards)).toContain('"fontFamily":"Open Sans"');
        const ids = new Set<string>();
        for (const ab of project.artboards) {
          ids.add(ab.id);
          walk(ab.children, (n) => void ids.add(n.id));
        }
        expect(checklist.length).toBeGreaterThanOrEqual(5);
        for (const c of checklist) {
          expect(c.text).not.toMatch(/—/);
          if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
          if (c.artboardId) expect(ids.has(c.artboardId), c.text).toBe(true);
        }
        const back = normalizeProject(JSON.parse(JSON.stringify(project)));
        expect(back.artboards).toHaveLength(project.artboards.length);
      }
    });
  }
});

describe('playing the second batch', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
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
  const click = async (id: string, wait = 8) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(wait);
  };
  const press = async (id: string, key: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    e.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
    await flush();
  };
  const type = async (id: string, value: string) => {
    const input = (el(id)?.matches('input,textarea') ? el(id) : el(id)?.querySelector('input,textarea')) as HTMLInputElement | null;
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
  const text = () => {
    const walkText = (n: Node): string => {
      if (n.nodeType === 3) return n.textContent ?? '';
      if (n.nodeType !== 1) return '';
      if ((n as HTMLElement).style.display === 'none') return '';
      return [...n.childNodes].map(walkText).join('');
    };
    return walkText(document.getElementById('stage')!);
  };
  const list = (p: Project, name: string) => JSON.parse(p.variables.find((v) => v.name === name)!.initial as string);
  const disabled = (id: string) => (el(id)?.querySelector('button') as HTMLButtonElement | null)?.disabled;
  const visible = (id: string) => {
    for (let e: HTMLElement | null = el(id); e; e = e.parentElement) if (e.style.display === 'none') return false;
    return !!el(id);
  };

  describe('find the hotspot', () => {
    const { project } = starter('assessment/find-the-hotspot').build(COLOURWAYS[0]);
    const [hero, page] = project.artboards;
    const frame = () => questionFrames(page)[0];
    const area = (n: number) => partsOf(frame()).spot[n].id;

    it('is the question kit hotspot question, with four areas, one right, two tries and a hint, over a placeholder picture', () => {
      expect(questionFrames(page)).toHaveLength(1);
      const q = frame().question!;
      expect(q.kind).toBe('hotspot');
      expect(q.options.map((o) => o.text)).toEqual(['Planner', 'Clock', 'Laptop', 'Plant']);
      expect(q.options.filter((o) => o.correct)).toHaveLength(1);
      expect(q.attempts).toBe(2);
      expect(q.hints.length).toBe(1);
      const pic = partsOf(frame()).picture[0];
      expect(pic.ariaLabel).toMatch(/placeholder/i);
      //the areas are keyboard reachable radios with a name
      for (const a of partsOf(frame()).spot) {
        expect(a.role).toBe('radio');
        expect(a.focusable).toBe(true);
        expect(a.ariaLabel).toBeTruthy();
      }
    });

    it('gives feedback on a wrong area, a second try, and then the right area is found', async () => {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      expect(text()).toContain('Tries left: 2');
      const check = partsOf(frame()).check[0].id;
      await click(area(2));
      await click(check);
      expect(player.getVariable('q1_correct')).toBe(false);
      expect(player.getVariable('q1_locked')).toBe(false);
      expect(text()).toContain('Not there. Have another look at the picture and try again.');
      expect(text()).toContain('Tries left: 1');
      //a wrong check leaves the question open: pick another area and check again
      await click(area(0));
      await click(check);
      expect(player.getVariable('q1_correct')).toBe(true);
      expect(player.getVariable('q1_locked')).toBe(true);
      expect(text()).toContain('You found it. A planner helps you see the whole week at a glance.');
      expect(text()).toContain('✓ You found it');
    });

    it('runs out of tries after two wrong checks, and shows the right area', async () => {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      const check = partsOf(frame()).check[0].id;
      for (const n of [1, 3]) {
        await click(area(n));
        await click(check);
      }
      expect(player.getVariable('q1_locked')).toBe(true);
      expect(player.getVariable('q1_correct')).toBe(false);
      expect(text()).toContain('Out of tries');
      expect(text()).toContain('✗ Out of tries');
      //Try again gives the tries back
      await click(partsOf(frame()).reset[0].id);
      expect(player.getVariable('q1_locked')).toBe(false);
      expect(text()).toContain('Tries left: 2');
    });
  });

  describe('find multiple hotspots', () => {
    const { project } = starter('assessment/find-multiple-hotspots').build(COLOURWAYS[1]);
    const [hero, page, result] = project.artboards;
    const targets = list(project, 'targets') as { name: string; feedback: string }[];
    const area = (i: number) => idOf(page, `Area ${i + 1}`);

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('has five things to find, an area layer for each, and the areas are named for the keyboard', () => {
      expect(targets).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        const a = byName(page, `Area ${i + 1}`)!;
        expect(a.role).toBe('button');
        expect(a.focusable).toBe(true);
        expect(a.bindings?.ariaLabel).toBe(`targets[${i}].name`);
      }
    });

    it('ticks a find off with its feedback, counts wrong clicks on the picture, and ignores a repeat', async () => {
      const player = await open();
      expect(text()).toContain('Found 0 of 5');
      await click(idOf(page, 'Main picture'));
      await click(idOf(page, 'Main picture'));
      expect(player.getVariable('wrong')).toBe(2);
      expect(text()).toContain('Nothing there. Keep looking.');
      expect(text()).toContain('Wrong clicks: 2');
      await click(area(1));
      expect(player.getVariable('found')).toEqual([1]);
      expect(text()).toContain(targets[1].feedback);
      expect(text()).toContain('✓ A cloud');
      expect(text()).toContain('Found 1 of 5');
      //finding it again changes nothing
      await click(area(1));
      expect(player.getVariable('found')).toEqual([1]);
      expect(player.getVariable('wrong')).toBe(2);
      //the keyboard finds one too
      await press(area(3), 'Enter');
      expect(player.getVariable('found')).toEqual([1, 3]);
      expect(visible(idOf(page, 'See result button'))).toBe(false);
    });

    it('goes to a result page with the wrong clicks once everything is found, and Try again starts over', async () => {
      const player = await open();
      await click(idOf(page, 'Main picture'));
      for (let i = 0; i < 5; i++) await click(area(i));
      expect(player.getVariable('found')).toEqual([0, 1, 2, 3, 4]);
      expect(visible(idOf(page, 'See result button'))).toBe(true);
      //a click on the picture after the last find is not counted
      await click(idOf(page, 'Main picture'));
      expect(player.getVariable('wrong')).toBe(1);
      await click(idOf(page, 'See result button'));
      expect(text()).toContain('5 of 5');
      expect(text()).toContain('Wrong clicks: 1');
      expect(text()).toContain(project.variables.find((v) => v.name === 'messageOk')!.initial as string);
      await click(idOf(result, 'Try again button'));
      expect(player.getVariable('found')).toEqual([]);
      expect(player.getVariable('wrong')).toBe(0);
    });
  });

  describe('image choice', () => {
    const { project } = starter('assessment/image-choice').build(COLOURWAYS[2]);
    const [hero, page] = project.artboards;
    const options = list(project, 'options') as { label: string; alt: string; correct: boolean }[];
    const card = (i: number) => idOf(page, `Choice ${i + 1}`);

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('has six picture cards each with alt text, labelled for a screen reader and reachable by keyboard', async () => {
      expect(options).toHaveLength(6);
      for (const o of options) expect(o.alt.length).toBeGreaterThan(20);
      await open();
      for (let i = 0; i < 6; i++) {
        const c = el(card(i))!;
        expect(c.getAttribute('role')).toBe('checkbox');
        expect(c.tabIndex).toBe(0);
        expect(c.getAttribute('aria-label')).toBe(`${options[i].label}. ${options[i].alt}`);
      }
      //six picture placeholders
      expect(project.artboards[1].children.filter((n) => n.name.startsWith('Choice '))).toHaveLength(6);
    });

    it('picks several, takes one off again, and Check waits for a pick', async () => {
      const player = await open();
      expect(disabled(idOf(page, 'Check button'))).toBe(true);
      await click(card(0));
      await click(card(1));
      expect(player.getVariable('picked')).toEqual([0, 1]);
      await click(card(1));
      expect(player.getVariable('picked')).toEqual([0]);
      expect(el(card(0))!.getAttribute('aria-checked')).toBe('true');
      await press(card(2), ' ');
      expect(player.getVariable('picked')).toEqual([0, 2]);
      expect(disabled(idOf(page, 'Check button'))).toBe(false);
    });

    it('marks right, wrong and missed, with the feedback for all right, part right and none right, and Try again clears', async () => {
      const player = await open();
      await click(card(0));
      await click(card(2));
      await click(card(4));
      await click(idOf(page, 'Check button'));
      expect(player.getVariable('checked')).toBe(true);
      expect(text()).toContain((project.variables.find((v) => v.name === 'feedbackCorrect')!.initial as string));
      expect(text()).toContain('✓ Right');
      //a pick after checking changes nothing
      await click(card(1));
      expect(player.getVariable('picked')).toEqual([0, 2, 4]);
      await click(idOf(page, 'Try again button'));
      expect(player.getVariable('picked')).toEqual([]);
      expect(player.getVariable('checked')).toBe(false);
      //part right: one right and one wrong
      await click(card(0));
      await click(card(1));
      await click(idOf(page, 'Check button'));
      expect(player.getVariable('nRight')).toBe(1);
      expect(player.getVariable('nWrong')).toBe(1);
      expect(text()).toContain((project.variables.find((v) => v.name === 'feedbackPartial')!.initial as string));
      expect(text()).toContain('✗ Wrong');
      expect(text()).toContain('← Right answer');
      await click(idOf(page, 'Try again button'));
      //none right
      await click(card(3));
      await click(idOf(page, 'Check button'));
      expect(text()).toContain((project.variables.find((v) => v.name === 'feedbackWrong')!.initial as string));
    });

    it('with "multiple" off a pick swaps the choice for one answer', async () => {
      const single = JSON.parse(JSON.stringify(project)) as Project;
      single.variables.find((v) => v.name === 'multiple')!.initial = false;
      const player = play(single);
      await flush();
      await click(idOf(single.artboards[0], 'Start button'));
      await click(card(0));
      await click(card(2));
      expect(player.getVariable('picked')).toEqual([2]);
    });
  });

  describe('single choice set', () => {
    const { project } = starter('assessment/single-choice-set').build(COLOURWAYS[3]);
    const [hero, game, result] = project.artboards;
    const questions = list(project, 'questions') as { q: string; options: string[]; answer: number; why: string }[];
    const answer = (i: number) => idOf(game, `Answer ${i + 1}`);

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('has eight questions with three options each and one right answer', () => {
      expect(questions).toHaveLength(8);
      for (const q of questions) {
        expect(q.options).toHaveLength(3);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(3);
        expect(q.why.length).toBeGreaterThan(20);
      }
    });

    it('a right answer flashes Correct and moves on by itself, a wrong one shows the right one and waits for Next', async () => {
      const player = await open();
      expect(text()).toContain(questions[0].q);
      expect(text()).toContain('Question 1 of 8');
      await click(answer(questions[0].answer), 20);
      expect(player.getVariable('locked')).toBe(true);
      expect(player.getVariable('lastRight')).toBe(true);
      expect(text()).toContain('✓ Correct');
      expect(visible(idOf(game, 'Next button'))).toBe(false);
      //after the pause it has moved on
      await flush(1150);
      expect(player.getVariable('index')).toBe(1);
      expect(player.getVariable('locked')).toBe(false);
      expect(text()).toContain(questions[1].q);
      expect(text()).not.toContain('✓ Correct');
      //a wrong answer: stays, shows the explanation and the right one marked, offers Next
      const wrong = (questions[1].answer + 1) % 3;
      await click(answer(wrong));
      expect(player.getVariable('lastRight')).toBe(false);
      expect(text()).toContain('✗ Not quite');
      expect(text()).toContain(questions[1].why);
      expect(text()).toContain(`✓  ${questions[1].options[questions[1].answer]}`);
      expect(text()).toContain(`✗  ${questions[1].options[wrong]}`);
      await flush(1150);
      expect(player.getVariable('index')).toBe(1);
      expect(visible(idOf(game, 'Next button'))).toBe(true);
      //a second click on an answer is ignored
      await click(answer(questions[1].answer));
      expect(player.getVariable('score')).toBe(1);
      await click(idOf(game, 'Next button'));
      expect(player.getVariable('index')).toBe(2);
      expect(text()).toContain(questions[2].q);
    });

    it('ends on a score page with the total, and Try again starts over', async () => {
      const player = await open();
      for (let i = 0; i < questions.length; i++) {
        const right = i % 2 === 0;
        await click(answer(right ? questions[i].answer : (questions[i].answer + 1) % 3), right ? 1100 : 8);
        if (!right) await click(idOf(game, 'Next button'));
      }
      expect(player.getVariable('score')).toBe(4);
      expect(text()).toContain('4 / 8');
      expect(text()).toContain('50%');
      expect(text()).toContain(project.variables.find((v) => v.name === 'messageMid')!.initial as string);
      await click(idOf(result, 'Try again button'));
      expect(player.getVariable('score')).toBe(0);
      expect(player.getVariable('index')).toBe(0);
    }, 15000);
  });

  describe('summary', () => {
    const { project } = starter('assessment/summary').build(COLOURWAYS[4]);
    const [hero, game, result] = project.artboards;
    const steps = list(project, 'steps') as { prompt: string; statements: string[]; answer: number; line: string }[];
    const statement = (i: number) => idOf(game, `Statement ${i + 1}`);

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }

    it('has five steps of three or four statements, one true', () => {
      expect(steps).toHaveLength(5);
      for (const s of steps) {
        expect(s.statements.length).toBeGreaterThanOrEqual(3);
        expect(s.statements.length).toBeLessThanOrEqual(4);
        expect(s.answer).toBeLessThan(s.statements.length);
        expect(s.line.length).toBeGreaterThan(20);
      }
      expect(steps.some((s) => s.statements.length === 3)).toBe(true);
      expect(steps.some((s) => s.statements.length === 4)).toBe(true);
    });

    it('adds the true statement to the summary, marks a wrong pick without adding it, and counts first-try picks', async () => {
      const player = await open();
      expect(text()).toContain('Nothing here yet');
      expect(text()).toContain(steps[0].statements[0]);
      //step 1 right first time
      await click(statement(steps[0].answer));
      expect(player.getVariable('locked')).toBe(true);
      expect(player.getVariable('summary')).toEqual([steps[0].line]);
      expect(text()).toContain(`•  ${steps[0].line}`);
      expect(text()).not.toContain('Nothing here yet');
      await click(idOf(game, 'Next step button'));
      expect(player.getVariable('step')).toBe(1);
      expect(player.getVariable('locked')).toBe(false);
      //step 2: a wrong pick first
      const wrong = (steps[1].answer + 1) % steps[1].statements.length;
      await click(statement(wrong));
      expect(player.getVariable('wrongs')).toEqual([wrong]);
      expect(player.getVariable('summary')).toEqual([steps[0].line]);
      expect(text()).toContain('Not that one');
      //the same wrong one again is ignored
      await click(statement(wrong));
      expect(player.getVariable('tries')).toBe(1);
      await click(statement(steps[1].answer));
      expect(player.getVariable('summary')).toEqual([steps[0].line, steps[1].line]);
      //scored for the first only
      expect(player.getVariable('score')).toBe(1);
      expect(text()).toContain('Right first time: 1');
    });

    it('hides the fourth statement slot on a step with three, and finishes on the summary page', async () => {
      const player = await open();
      for (let i = 0; i < steps.length; i++) {
        expect(visible(statement(3))).toBe(steps[i].statements.length > 3);
        if (i === 2) await click(statement((steps[i].answer + 1) % steps[i].statements.length));
        await click(statement(steps[i].answer));
        await click(idOf(game, 'Next step button'));
      }
      expect(player.getVariable('summary')).toEqual(steps.map((s) => s.line));
      expect(player.getVariable('score')).toBe(4);
      expect(text()).toContain('4 of 5');
      for (const s of steps) expect(text()).toContain(s.line);
      expect(text()).toContain(project.variables.find((v) => v.name === 'messageHigh')!.initial as string);
      await click(idOf(result, 'Try again button'));
      expect(player.getVariable('summary')).toEqual([]);
      expect(player.getVariable('step')).toBe(0);
    });
  });

  describe('essay', () => {
    const { project } = starter('assessment/essay').build(COLOURWAYS[5]);
    const [hero, write, feedback] = project.artboards;

    async function open() {
      const player = play(project);
      await flush();
      await click(idOf(hero, 'Start button'));
      return player;
    }
    const words = (n: number, extra = '') => `${Array.from({ length: n }, () => 'word').join(' ')} ${extra}`.trim();

    it('has a large answer box bound to a variable, a word count, and keywords the author sets', () => {
      const box = byName(write, 'Answer box') as unknown as { inputType: string; variableId: string; height: number };
      expect(box.inputType).toBe('textarea');
      expect(box.variableId).toBe(project.variables.find((v) => v.name === 'essay')!.id);
      expect(box.height).toBeGreaterThanOrEqual(280);
      expect(list(project, 'required').length).toBeGreaterThanOrEqual(3);
      expect(list(project, 'optional').length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify([write.children, feedback.children])).toMatch(/not marking|not marked/);
    });

    it('counts words as you type, and Submit stays off until there is something to submit', async () => {
      await open();
      expect(disabled(idOf(write, 'Submit button'))).toBe(true);
      await type(idOf(write, 'Answer box'), 'one two  three\nfour');
      expect(text()).toContain('4');
      expect(disabled(idOf(write, 'Submit button'))).toBe(false);
    });

    it('finds required and optional keywords whatever the case, lists what is missing, and judges the length', async () => {
      const player = await open();
      await type(idOf(write, 'Answer box'), words(60, 'Spaced practice helps MEMORY and sleep'));
      await click(idOf(write, 'Submit button'));
      expect(player.getVariable('wc')).toBe(66);
      expect(player.getVariable('foundReq')).toEqual(['spac', 'memory']);
      expect(player.getVariable('missingReq')).toEqual(['forget', 'cram']);
      expect(player.getVariable('foundOpt')).toEqual(['sleep']);
      expect(player.getVariable('missingOpt')).toEqual(['test yourself', 'review']);
      expect(player.getVariable('lengthState')).toBe('ok');
      expect(text()).toContain('Your feedback');
      expect(text()).toContain('Key ideas you covered: spac, memory');
      expect(text()).toContain('Key ideas not found yet: forget, cram');
      expect(text()).toContain('✓ Length: 66 words');
      expect(text()).toContain('Extras you mentioned: sleep');
      expect(text()).toContain('not marked');
    });

    it('says when the answer is too short or too long, and when every key idea is there', async () => {
      const player = await open();
      await type(idOf(write, 'Answer box'), 'Cram and forget the memory in spaced bursts.');
      await click(idOf(write, 'Submit button'));
      expect(player.getVariable('lengthState')).toBe('short');
      expect(text()).toContain('under 50');
      expect(text()).toContain('Every key idea is in your answer');
      await click(idOf(feedback, 'Edit button'));
      expect(text()).toContain('Write your answer');
      await type(idOf(write, 'Answer box'), words(200, 'spaced memory forget cram'));
      await click(idOf(write, 'Submit button'));
      expect(player.getVariable('lengthState')).toBe('long');
      expect(text()).toContain('over 150');
    });

    it('reveals the model answer on request, Edit keeps the answer, and Start again clears it', async () => {
      const player = await open();
      const model = project.variables.find((v) => v.name === 'modelAnswer')!.initial as string;
      await type(idOf(write, 'Answer box'), words(55, 'spaced'));
      await click(idOf(write, 'Submit button'));
      expect(text()).not.toContain(model);
      await click(idOf(feedback, 'Show model answer button'));
      expect(player.getVariable('showModel')).toBe(true);
      expect(text()).toContain(model);
      await click(idOf(feedback, 'Edit button'));
      expect(player.getVariable('essay')).toContain('spaced');
      expect(player.getVariable('showModel')).toBe(false);
      await click(idOf(write, 'Submit button'));
      await click(idOf(feedback, 'Start again button'));
      expect(player.getVariable('essay')).toBe('');
      expect(player.getVariable('submitted')).toBe(false);
      expect(text()).toContain('Write an answer');
    });
  });
});
