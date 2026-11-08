import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type PlayerOptions, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { BRANDED_STARTERS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';

const WRITING = BRANDED_STARTERS.filter((s) => s.set === 'writing');
const BOOK = BRANDED_STARTERS.find((s) => s.key === 'story/interactive-book')!;
const flush = () => new Promise((r) => setTimeout(r, 0));

const stage = () => document.getElementById('stage')!;
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => byName(board(p, page), name)!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const shown = (id: string) => !!el(id) && el(id).style.display !== 'none';

describe('branded writing starters and the interactive book', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const play = (p: Project, opts: Partial<PlayerOptions> = {}) => new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false, ...opts });
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const press = async (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await flush();
  };
  const settle = async (player: Player, ms = 400) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };
  //Types into a text box layer the way a person does: the textarea's value changes and it says so
  const type = async (id: string, value: string) => {
    const box = el(id).querySelector('textarea');
    if (!box) throw new Error(`no text box ${id}`);
    box.value = value;
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
  };
  const boxValue = (id: string) => el(id).querySelector('textarea')!.value;

  it('has the three writing starters, keyed under writing/, and the book under story/', () => {
    expect(WRITING.map((s) => s.key)).toEqual(['writing/questionnaire', 'writing/documentation-tool', 'writing/reflection-journal']);
    expect(BOOK.key).toBe('story/interactive-book');
    expect(BOOK.set).toBe('story');
  });

  for (const starter of [...WRITING, BOOK]) {
    describe(starter.name, () => {
      it('builds in every colourway, normalises, paints with tokens only, uses Open Sans and has a checklist', () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          expect(project.artboards.length).toBeGreaterThanOrEqual(3);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.themes!.list).toHaveLength(7);
          expect(project.template!.builtin).toBe(`branded:${starter.key}`);
          expect(project.template!.checklist.length).toBeGreaterThan(4);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => void ids.add(n.id));
          for (const c of project.template!.checklist) {
            if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
            if (c.nodeId) expect(ids.has(c.nodeId)).toBe(true);
          }
          for (const ab of project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          expect(JSON.stringify(project.artboards)).not.toContain('Arial');
          walk(project.artboards.flatMap((a) => a.children), (n) => {
            if (n.type === 'text' || n.type === 'button' || n.type === 'input') expect(n.fontFamily).toBe('Open Sans');
          });
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
        }
      });

      it('no comment or text uses an em dash', () => {
        const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
        expect(JSON.stringify([project.artboards, project.template])).not.toContain('—');
      });

      it('plays in every colourway without throwing, on every page', async () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          const player = play(project);
          await settle(player, 100);
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            await settle(player, 100);
            expect(player.artboard.id).toBe(ab.id);
          }
          player.destroy();
        }
      });

      it('every text box is a labelled textarea and every button and radio is a keyboard stop', async () => {
        const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
        const player = play(project);
        await settle(player, 100);
        for (const ab of project.artboards) {
          player.goTo(ab.id);
          await settle(player, 100);
          walk(ab.children, (n) => {
            if (n.type === 'input') {
              expect(el(n.id).querySelector('textarea'), `${ab.name}: ${n.name}`).toBeTruthy();
              expect(n.ariaLabel, `${ab.name}: ${n.name}`).toBeTruthy();
            }
            if (n.type === 'frame' && (n.role === 'radio' || n.role === 'button') && !(n as { questionPart?: string }).questionPart) {
              expect(el(n.id).tabIndex, `${ab.name}: ${n.name}`).toBeGreaterThanOrEqual(0);
              expect(el(n.id).getAttribute('aria-label'), `${ab.name}: ${n.name}`).toBeTruthy();
            }
          });
        }
        player.destroy();
      });
    });
  }

  describe('questionnaire', () => {
    const starter = WRITING[0];
    const project = () => projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const open = async (p = project(), opts: Partial<PlayerOptions> = {}) => {
      const player = play(p, opts);
      await settle(player, 100);
      return player;
    };
    const survey = (p: Project, name: string) => layer(p, 'Survey', name);

    it('has a hero, one survey page with the three kinds of question, and a thank-you', () => {
      const p = project();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Study experience survey', 'Survey', 'Thank you']);
      expect(survey(p, 'Rating scale')).toBeTruthy();
      expect(survey(p, 'Place choices')).toBeTruthy();
      expect(survey(p, 'Comment box').type).toBe('input');
      expect((survey(p, 'Rating scale') as { role?: string }).role).toBe('radiogroup');
      expect(['Rating 1', 'Rating 2', 'Rating 3', 'Rating 4', 'Rating 5'].every((n) => (survey(p, n) as { role?: string }).role === 'radio')).toBe(true);
    });

    it('Submit stays off until the rating and the choice are answered, and the text is optional', async () => {
      const p = project();
      const player = await open(p);
      await click(layer(p, 'Study experience survey', 'Start button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Survey');
      const submit = el(survey(p, 'Submit button').id);
      const off = () => (submit.querySelector('button') ?? submit).hasAttribute('disabled') || submit.getAttribute('aria-disabled') === 'true';
      expect(off()).toBe(true);
      expect(textOf(survey(p, 'Survey status').id)).toContain('Questions 1 and 2 need an answer');
      await click(survey(p, 'Rating 4').id);
      expect(off()).toBe(true);
      await click(survey(p, 'Choice 3').id);
      await settle(player, 100);
      expect(off()).toBe(false);
      expect(player.getVariable('rating')).toBe(4);
      expect(player.getVariable('place')).toBe('On the move');
      expect(player.getVariable('comment')).toBe('');
      player.destroy();
    });

    it('the rating and the choice are radio buttons that follow the answer', async () => {
      const p = project();
      const player = await open(p);
      player.goTo('Survey');
      await settle(player, 100);
      await click(survey(p, 'Rating 2').id);
      await settle(player, 100);
      const checked = (name: string) => el(survey(p, name).id).getAttribute('aria-checked');
      expect(['Rating 1', 'Rating 2', 'Rating 3', 'Rating 4', 'Rating 5'].map(checked)).toEqual(['false', 'true', 'false', 'false', 'false']);
      expect(textOf(survey(p, 'Rating chosen').id)).toBe('You chose 2 out of 5.');
      await click(survey(p, 'Rating 5').id);
      await click(survey(p, 'Choice 1').id);
      await click(survey(p, 'Choice 2').id);
      await settle(player, 100);
      expect(['Choice 1', 'Choice 2', 'Choice 3', 'Choice 4'].map(checked)).toEqual(['false', 'true', 'false', 'false']);
      expect(player.getVariable('place')).toBe('At the library or on campus');
      expect(checked('Rating 5')).toBe('true');
      player.destroy();
    });

    it('Submit goes to the thank-you with a summary of what was answered, and records counts without the free text', async () => {
      const p = project();
      const player = await open(p);
      const records: { kind: string; label?: string; value?: string }[] = [];
      player.on('record', (r) => records.push(r as never));
      player.goTo('Survey');
      await settle(player, 100);
      await click(survey(p, 'Rating 4').id);
      await click(survey(p, 'Choice 3').id);
      await type(survey(p, 'Comment box').id, 'A quiet room with a good chair.');
      expect(player.getVariable('comment')).toBe('A quiet room with a good chair.');
      await settle(player, 100);
      await click(survey(p, 'Submit button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Thank you');
      expect(player.getVariable('submitted')).toBe(true);
      expect(textOf(layer(p, 'Thank you', 'Answer 1').id)).toBe('4 out of 5');
      expect(textOf(layer(p, 'Thank you', 'Answer 2').id)).toBe('On the move');
      expect(textOf(layer(p, 'Thank you', 'Answer 3').id)).toBe('A quiet room with a good chair.');
      expect(shown(layer(p, 'Thank you', 'Summary card').id)).toBe(true);
      const custom = records.filter((r) => r.kind === 'custom').map((r) => `${r.label}=${r.value}`);
      expect(custom).toEqual(['survey rating=4', 'survey place=On the move']);
      expect(JSON.stringify(records)).not.toContain('quiet room');
      player.destroy();
    });

    it('showSummary turned off leaves the answers out of the thank-you page', async () => {
      const p = project();
      p.variables.find((v) => v.name === 'showSummary')!.initial = false;
      const player = await open(p);
      player.goTo('Thank you');
      await settle(player, 100);
      expect(shown(layer(p, 'Thank you', 'Summary card').id)).toBe(false);
      expect(textOf(layer(p, 'Thank you', 'Thank you message').id)).toBe('Thanks for taking part');
      player.destroy();
    });

    it('long open answers are cut short on the summary', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('comment', 'word '.repeat(60));
      player.goTo('Thank you');
      await settle(player, 100);
      const shownText = textOf(layer(p, 'Thank you', 'Answer 3').id);
      expect(shownText.endsWith('...')).toBe(true);
      expect(shownText.length).toBeLessThan(150);
      player.destroy();
    });

    it('the answers persist as learner user data: a second visit brings them back and Continue goes to the thank-you', async () => {
      const p = project();
      const first = await open(p);
      expect(shown(layer(p, 'Study experience survey', 'Continue button').id)).toBe(false);
      first.goTo('Survey');
      await settle(first, 100);
      await click(survey(p, 'Rating 5').id);
      await click(survey(p, 'Choice 1').id);
      await type(survey(p, 'Comment box').id, 'More daylight.');
      await click(survey(p, 'Submit button').id);
      await settle(first);
      first.destroy();

      //A new visit with the same learner: the Before activity loads node brings the answers back before the first frame
      const second = await open(p);
      await settle(second, 100);
      expect(second.getVariable('rating')).toBe(5);
      expect(second.getVariable('place')).toBe('At home');
      expect(second.getVariable('comment')).toBe('More daylight.');
      expect(second.getVariable('submitted')).toBe(true);
      expect(shown(layer(p, 'Study experience survey', 'Continue button').id)).toBe(true);
      expect(shown(layer(p, 'Study experience survey', 'Start button').id)).toBe(false);
      await click(layer(p, 'Study experience survey', 'Continue button').id);
      await settle(second);
      expect(second.artboard.name).toBe('Thank you');
      //Change my answers goes back to the survey with the answers still in
      await click(layer(p, 'Thank you', 'Change answers button').id);
      await settle(second);
      expect(second.artboard.name).toBe('Survey');
      expect(boxValue(survey(p, 'Comment box').id)).toBe('More daylight.');
      second.destroy();
    });

    it('answers go to the page around the player when there is one (the StudyDesk learner page), not only the browser', async () => {
      const p = project();
      const saved: Record<string, unknown> = {};
      const store = {
        load: () => null,
        save: () => undefined,
        saveUserData: (values: Record<string, unknown>) => void Object.assign(saved, values),
        loadUserData: (names: string[]) => {
          const out: Record<string, unknown> = {};
          for (const n of names) if (n in saved) out[n] = saved[n];
          return Object.keys(out).length ? out : null;
        },
      };
      const a = await open(p, { progress: store });
      a.goTo('Survey');
      await settle(a, 100);
      await click(survey(p, 'Rating 3').id);
      await click(survey(p, 'Choice 4').id);
      await settle(a, 100);
      //A choice is kept as soon as it is made
      expect(saved).toMatchObject({ rating: 3, place: 'It changes a lot' });
      await type(survey(p, 'Comment box').id, 'Less noise.');
      await click(survey(p, 'Save for later button').id);
      await settle(a, 100);
      expect(saved.comment).toBe('Less noise.');
      expect(textOf(survey(p, 'Survey status').id)).toContain('Saved');
      a.destroy();
      expect(localStorage.length).toBeLessThan(3);
      const b = await open(p, { progress: store });
      expect(b.getVariable('comment')).toBe('Less noise.');
      expect(shown(layer(p, 'Study experience survey', 'Continue button').id)).toBe(true);
      await click(layer(p, 'Study experience survey', 'Continue button').id);
      await settle(b);
      //Saved for later is not submitted: the survey with their answers in, not the thank-you
      expect(b.artboard.name).toBe('Survey');
      b.destroy();
    });
  });

  describe('guided writing workbook', () => {
    const starter = WRITING[1];
    const project = () => projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const HERO = 'Study plan workbook';
    const open = async (p = project(), opts: Partial<PlayerOptions> = {}) => {
      const player = play(p, opts);
      await settle(player, 100);
      return player;
    };

    it('has a goals page, three steps, an export page and a progress list on each of them', () => {
      const p = project();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual([HERO, 'My goals', 'Step 1: Where I am', 'Step 2: One change', 'Step 3: My plan', 'Export']);
      for (const name of ['My goals', 'Step 1: Where I am', 'Step 2: One change', 'Step 3: My plan', 'Export']) {
        const list = layer(p, name, 'Progress list') as unknown as { children: SceneNode[] };
        expect(list.children.filter((c) => c.name.startsWith('Progress: '))).toHaveLength(5);
      }
      for (const name of ['My goals', 'Step 1: Where I am', 'Step 2: One change', 'Step 3: My plan']) {
        expect(layer(p, name, 'Prompt')).toBeTruthy();
        expect(layer(p, name, 'Text box').type).toBe('input');
      }
    });

    it('typing sets the variable and a live word count, and Save says it is saved until more is typed', async () => {
      const p = project();
      const player = await open(p);
      await click(layer(p, HERO, 'Start button').id);
      await settle(player);
      expect(player.artboard.name).toBe('My goals');
      expect(textOf(layer(p, 'My goals', 'Word count').id)).toBe('0 words');
      await type(layer(p, 'My goals', 'Text box').id, 'I want to finish the readings before each tutorial.');
      expect(player.getVariable('goals')).toBe('I want to finish the readings before each tutorial.');
      await settle(player, 100);
      expect(textOf(layer(p, 'My goals', 'Word count').id)).toBe('9 words');
      expect(textOf(layer(p, 'My goals', 'Progress count').id)).toBe('1 of 4 parts written');
      await click(layer(p, 'My goals', 'Save button').id);
      await settle(player, 100);
      expect(textOf(layer(p, 'My goals', 'Saved note').id)).toBe('Saved.');
      await type(layer(p, 'My goals', 'Text box').id, 'I want to finish the readings before each tutorial, and keep up.');
      await settle(player, 100);
      expect(textOf(layer(p, 'My goals', 'Saved note').id)).toBe('');
      player.destroy();
    });

    it('Next and Back walk the steps, and the progress list ticks what is written and jumps to a page', async () => {
      const p = project();
      const player = await open(p);
      player.goTo('My goals');
      await settle(player, 100);
      await type(layer(p, 'My goals', 'Text box').id, 'Goal text here');
      await click(layer(p, 'My goals', 'Next button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Step 1: Where I am');
      expect(textOf(layer(p, 'Step 1: Where I am', 'Progress: My goals').id)).toContain('✓');
      expect(textOf(layer(p, 'Step 1: Where I am', 'Progress: Step 1: Where I am').id)).toContain('○');
      expect(el(layer(p, 'Step 1: Where I am', 'Progress: Step 1: Where I am').id).getAttribute('aria-label')).toBe('Step 1: Where I am: not written yet');
      expect(el(layer(p, 'Step 1: Where I am', 'Progress: My goals').id).getAttribute('aria-label')).toBe('My goals: written');
      await click(layer(p, 'Step 1: Where I am', 'Progress: Step 3: My plan').id);
      await settle(player);
      expect(player.artboard.name).toBe('Step 3: My plan');
      await click(layer(p, 'Step 3: My plan', 'Back button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Step 2: One change');
      expect(boxValue(layer(p, 'Step 2: One change', 'Text box').id)).toBe('');
      await click(layer(p, 'Step 2: One change', 'Progress: My goals').id);
      await settle(player);
      expect(boxValue(layer(p, 'My goals', 'Text box').id)).toBe('Goal text here');
      player.destroy();
    });

    it('the export page assembles everything the learner wrote into one formatted text', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('goals', 'Read before class.');
      player.setVariable('step1', 'I study late at night.');
      player.setVariable('step3', 'Mondays at 6pm in the library.');
      player.goTo('Export');
      await settle(player, 100);
      const report = player.getVariable('report') as string;
      expect(report).toBe(['MY STUDY PLAN', '', 'MY GOALS', 'Read before class.', '', 'WHERE I AM NOW', 'I study late at night.', '', 'THE ONE CHANGE I WILL TRY', '(Not written yet)', '', 'MY PLAN', 'Mondays at 6pm in the library.'].join('\n'));
      expect(boxValue(layer(p, 'Export', 'Whole workbook').id)).toBe(report);
      expect(textOf(layer(p, 'Export', 'Missing note').id)).toContain('Some parts are still empty');
      expect(player.getVariable('exported')).toBe(true);
      player.setVariable('step2', 'Study at the same time each day.');
      player.goTo('My goals');
      await settle(player, 50);
      player.goTo('Export');
      await settle(player, 100);
      expect(textOf(layer(p, 'Export', 'Missing note').id)).toContain('Everything is written');
      expect(textOf(layer(p, 'Export', 'Progress: Export').id)).toContain('✓');
      player.destroy();
    });

    it('the email button opens a mailto with the whole text in it', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('goals', 'Read before class & keep notes.');
      player.goTo('Export');
      await settle(player, 100);
      const hrefs: string[] = [];
      //_self navigates the frame: watch the location rather than navigating jsdom
      const loc = Object.getOwnPropertyDescriptor(window, 'location');
      Object.defineProperty(window, 'location', { configurable: true, value: { set href(v: string) { hrefs.push(v); } } });
      try {
        await click(layer(p, 'Export', 'Email button').id);
      } finally {
        Object.defineProperty(window, 'location', loc!);
      }
      expect(hrefs).toHaveLength(1);
      expect(hrefs[0].startsWith('mailto:?subject=My%20study%20plan&body=')).toBe(true);
      expect(decodeURIComponent(hrefs[0].split('&body=')[1])).toContain('Read before class & keep notes.');
      player.destroy();
    });

    it('saved writing comes back on the next visit and Continue goes to the first part still empty', async () => {
      const p = project();
      const a = await open(p);
      await click(layer(p, HERO, 'Start button').id);
      await settle(a);
      await type(layer(p, 'My goals', 'Text box').id, 'Goals that persist');
      await click(layer(p, 'My goals', 'Next button').id);
      await settle(a);
      await type(layer(p, 'Step 1: Where I am', 'Text box').id, 'Where I am that persists');
      await click(layer(p, 'Step 1: Where I am', 'Next button').id);
      await settle(a);
      expect(a.artboard.name).toBe('Step 2: One change');
      a.destroy();

      const b = await open(p);
      await settle(b, 100);
      expect(b.artboard.name).toBe(HERO);
      expect(b.getVariable('goals')).toBe('Goals that persist');
      expect(b.getVariable('step1')).toBe('Where I am that persists');
      expect(shown(layer(p, HERO, 'Continue button').id)).toBe(true);
      expect(shown(layer(p, HERO, 'Welcome back').id)).toBe(true);
      expect(shown(layer(p, HERO, 'Start button').id)).toBe(false);
      await click(layer(p, HERO, 'Continue button').id);
      await settle(b);
      expect(b.artboard.name).toBe('Step 2: One change');
      //Go back to the goals and the text is in the box
      await click(layer(p, 'Step 2: One change', 'Progress: My goals').id);
      await settle(b);
      expect(boxValue(layer(p, 'My goals', 'Text box').id)).toBe('Goals that persist');
      b.destroy();
    });

    it('a first visit has nothing saved, so it shows Start and not Continue', async () => {
      const p = project();
      const a = await open(p);
      expect(a.getVariable('returning')).toBe(false);
      expect(shown(layer(p, HERO, 'Start button').id)).toBe(true);
      expect(shown(layer(p, HERO, 'Continue button').id)).toBe(false);
      a.destroy();
    });

    it('a writer who has finished every part continues to the export', async () => {
      const p = project();
      const saved: Record<string, unknown> = { goals: 'a', step1: 'b', step2: 'c', step3: 'd' };
      const store = { load: () => null, save: () => undefined, saveUserData: (v: Record<string, unknown>) => void Object.assign(saved, v), loadUserData: (names: string[]) => Object.fromEntries(names.filter((n) => n in saved).map((n) => [n, saved[n]])) };
      const a = await open(p, { progress: store });
      await click(layer(p, HERO, 'Continue button').id);
      await settle(a);
      expect(a.artboard.name).toBe('Export');
      a.destroy();
    });
  });

  describe('reflection journal', () => {
    const starter = WRITING[2];
    const project = () => projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const HERO = 'Reflection journal';
    const PARTS = ['Part 1: What happened', 'Part 2: How I felt', 'Part 3: What I learnt', 'Part 4: What I will do next'];
    const open = async (p = project(), opts: Partial<PlayerOptions> = {}) => {
      const player = play(p, opts);
      await settle(player, 100);
      return player;
    };

    it('has four prompt pages in the order of the reflection and a last page for the whole of it', () => {
      const p = project();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual([HERO, ...PARTS, 'My reflection']);
      for (const name of PARTS) {
        expect(layer(p, name, 'Text box').type).toBe('input');
        expect((layer(p, name, 'Think about') as TextNode).text.split('\n').filter((l) => l.startsWith('•'))).toHaveLength(3);
        expect(layer(p, name, 'Word count')).toBeTruthy();
      }
    });

    it('each text box counts its words and shows when the writing reaches the aim', async () => {
      const p = project();
      const player = await open(p);
      player.goTo(PARTS[0]);
      await settle(player, 100);
      const count = layer(p, PARTS[0], 'Word count').id;
      const bar = layer(p, PARTS[0], 'Length bar').id;
      expect(textOf(count)).toBe('0 words  (aim for about 50)');
      expect(parseFloat(el(bar).style.width)).toBe(0);
      await type(layer(p, PARTS[0], 'Text box').id, 'We ran the practice presentation twice  with the group.');
      await settle(player, 100);
      expect(textOf(count)).toBe('9 words  (aim for about 50)');
      expect(parseFloat(el(bar).style.width)).toBeCloseTo((160 * 9) / 50, 1);
      await type(layer(p, PARTS[0], 'Text box').id, 'word '.repeat(60));
      await settle(player, 100);
      expect(textOf(count)).toBe('60 words  ✓ a good length');
      expect(parseFloat(el(bar).style.width)).toBe(160);
      //the aim is a variable the author can change
      player.setVariable('aim', 100);
      await settle(player, 100);
      expect(textOf(count)).toBe('60 words  (aim for about 100)');
      player.destroy();
    });

    it('the pills and Next move between the parts, saving as they go', async () => {
      const p = project();
      const saved: Record<string, unknown> = {};
      const store = { load: () => null, save: () => undefined, saveUserData: (v: Record<string, unknown>) => void Object.assign(saved, v), loadUserData: () => null };
      const player = await open(p, { progress: store });
      await click(layer(p, HERO, 'Start button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PARTS[0]);
      await type(layer(p, PARTS[0], 'Text box').id, 'The group met on Tuesday.');
      await click(layer(p, PARTS[0], 'Next button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PARTS[1]);
      expect(saved.what).toBe('The group met on Tuesday.');
      expect(textOf(layer(p, PARTS[1], 'Part 1 pill').id)).toContain('✓');
      expect(textOf(layer(p, PARTS[1], 'Part 3 pill').id)).toContain('○');
      await click(layer(p, PARTS[1], 'Part 4 pill').id);
      await settle(player);
      expect(player.artboard.name).toBe(PARTS[3]);
      expect(layer(p, PARTS[3], 'Next button')).toBeTruthy();
      expect((layer(p, PARTS[3], 'Next button') as unknown as { label: string }).label).toBe('See my reflection');
      await click(layer(p, PARTS[3], 'Back button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PARTS[2]);
      player.destroy();
    });

    it('the last page shows the whole reflection, and a part on it takes you back to change that part', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('what', 'We met on Tuesday.');
      player.setVariable('felt', 'Nervous at first.');
      player.setVariable('learnt', 'Agree the plan early.');
      player.setVariable('next', 'Book a check-in.');
      player.goTo('My reflection');
      await settle(player, 100);
      const whole = player.getVariable('reflection') as string;
      expect(whole).toBe('MY REFLECTION\n\nWHAT HAPPENED\nWe met on Tuesday.\n\nHOW I FELT\nNervous at first.\n\nWHAT I LEARNT\nAgree the plan early.\n\nWHAT I WILL DO NEXT\nBook a check-in.');
      expect(boxValue(layer(p, 'My reflection', 'Whole reflection').id)).toBe(whole);
      expect(textOf(layer(p, 'My reflection', 'Total words').id)).toContain('14 words in all');
      expect(textOf(layer(p, 'My reflection', 'Part 3 row').id)).toContain('✓');
      await click(layer(p, 'My reflection', 'Part 3 row').id);
      await settle(player);
      expect(player.artboard.name).toBe(PARTS[2]);
      expect(boxValue(layer(p, PARTS[2], 'Text box').id)).toBe('Agree the plan early.');
      player.destroy();
    });

    it('is saved and resumable: the next visit brings the text back and Continue goes to the first part still empty', async () => {
      const p = project();
      const a = await open(p);
      await click(layer(p, HERO, 'Start button').id);
      await settle(a);
      await type(layer(p, PARTS[0], 'Text box').id, 'It happened on Tuesday.');
      await click(layer(p, PARTS[0], 'Next button').id);
      await settle(a);
      await type(layer(p, PARTS[1], 'Text box').id, 'I felt nervous.');
      await click(layer(p, PARTS[1], 'Next button').id);
      await settle(a);
      a.destroy();

      const b = await open(p);
      expect(b.getVariable('what')).toBe('It happened on Tuesday.');
      expect(b.getVariable('felt')).toBe('I felt nervous.');
      expect(shown(layer(p, HERO, 'Continue button').id)).toBe(true);
      await click(layer(p, HERO, 'Continue button').id);
      await settle(b);
      expect(b.artboard.name).toBe(PARTS[2]);
      await click(layer(p, PARTS[2], 'Part 1 pill').id);
      await settle(b);
      expect(boxValue(layer(p, PARTS[0], 'Text box').id)).toBe('It happened on Tuesday.');
      b.destroy();
    });
  });

  describe('interactive book', () => {
    const project = () => projectFromBrandedStarter(BOOK, COLOURWAYS[0]);
    const PAGES = ['Cover', 'Contents', '1.1 Honesty, trust and fairness', '1.2 Where it shows up', '1.3 Check your understanding', '2.1 Why we reference', '2.2 Quote, paraphrase, reference', '2.3 Check your understanding', '3.1 Help that is fine, and help that is not', '3.2 Check your understanding', 'Your summary'];
    const open = async (p = project(), opts: Partial<PlayerOptions> = {}) => {
      const player = play(p, opts);
      await settle(player, 100);
      return player;
    };
    type Frame = SceneNode & { question: { prefix: string }; children: SceneNode[] };
    const questionOf = (p: Project, page: string) => board(p, page).children.find((n) => 'question' in n && (n as { question?: unknown }).question) as Frame;
    const part = (frame: Frame, name: string): SceneNode => {
      const all = (list: SceneNode[]): SceneNode[] => list.flatMap((c) => [c, ...all(('children' in c ? c.children : []) as SceneNode[])]);
      return all(frame.children).find((n) => (n as { questionPart?: string }).questionPart?.split(':')[0] === name)!;
    };
    //Answers the question on a page: the right option (or a wrong one) then Check answer
    const answer = async (p: Project, player: Player, page: string, right: boolean) => {
      player.goTo(page);
      await settle(player, 100);
      const frame = questionOf(p, page);
      const pre = frame.question.prefix;
      const opts = (frame.children.length && (player.getVariable(`${pre}_items`) as { text: string; correct?: boolean }[])) || [];
      const spec = (frame as unknown as { question: { options: { text: string; correct?: boolean }[] } }).question.options;
      const target = spec.findIndex((o) => !!o.correct === right);
      const at = opts.findIndex((o) => o.text === spec[target].text);
      await click(`${part(frame, 'option').id}~${at}`);
      await click(part(frame, 'check').id);
      await settle(player, 100);
    };
    const bar = (p: Project, page: string) => parseFloat(el(layer(p, page, 'Chapter progress').id).style.width);

    it('has a cover, contents, chapters of three, three and two pages, and a summary', () => {
      const p = project();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(PAGES);
      expect(p.artboards.filter((a) => questionOf(p, a.name))).toHaveLength(3);
      //a question ends each chapter, text and a picture come before it
      expect(['1.3 Check your understanding', '2.3 Check your understanding', '3.2 Check your understanding'].every((n) => !!questionOf(p, n))).toBe(true);
      for (const name of ['1.1 Honesty, trust and fairness', '1.2 Where it shows up', '2.1 Why we reference', '2.2 Quote, paraphrase, reference', '3.1 Help that is fine, and help that is not']) {
        expect(layer(p, name, 'Picture')).toBeTruthy();
        expect((layer(p, name, 'Page text') as TextNode).text.length).toBeGreaterThan(80);
      }
    });

    it('a menu button on every page but the contents page itself takes you to the contents', async () => {
      const p = project();
      const player = await open(p);
      for (const name of PAGES) {
        if (name === 'Contents') {
          expect(byName(board(p, name), 'Contents button')).toBeUndefined();
          continue;
        }
        player.goTo(name);
        await settle(player, 100);
        await click(layer(p, name, 'Contents button').id);
        await settle(player, 100);
        expect(player.artboard.name).toBe('Contents');
      }
      player.destroy();
    });

    it('Start reading opens the first page, Next and Previous walk the book across chapters, and the last page goes to the summary', async () => {
      const p = project();
      const player = await open(p);
      await click(layer(p, 'Cover', 'Start reading button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[2]);
      for (let i = 3; i < PAGES.length - 1; i++) {
        await click(layer(p, PAGES[i - 1], 'Next button').id);
        await settle(player);
        expect(player.artboard.name).toBe(PAGES[i]);
      }
      await click(layer(p, PAGES[9], 'Next button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Your summary');
      //Previous goes back a page, and from the first page to the contents
      player.goTo(PAGES[5]);
      await settle(player, 100);
      await click(layer(p, PAGES[5], 'Previous button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[4]);
      player.goTo(PAGES[2]);
      await settle(player, 100);
      await click(layer(p, PAGES[2], 'Previous button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Contents');
      expect((layer(p, PAGES[4], 'Next button') as unknown as { label: string }).label).toBe('Next chapter');
      expect((layer(p, PAGES[9], 'Next button') as unknown as { label: string }).label).toBe('Finish');
      player.destroy();
    });

    it('the arrow keys turn text pages, but not the page with a question on it', async () => {
      const p = project();
      const player = await open(p);
      player.goTo(PAGES[2]);
      await settle(player, 100);
      await press('ArrowRight');
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[3]);
      await press('ArrowLeft');
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[2]);
      player.goTo(PAGES[4]);
      await settle(player, 100);
      await press('ArrowRight');
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[4]);
      player.destroy();
    });

    it('each chapter has a progress bar that grows as its pages are read and its question answered', async () => {
      const p = project();
      const player = await open(p);
      player.goTo(PAGES[2]);
      await settle(player, 100);
      expect(bar(p, PAGES[2])).toBeCloseTo(200 / 3, 1);
      expect(textOf(layer(p, PAGES[2], 'Chapter progress text').id)).toBe('1 of 3');
      await click(layer(p, PAGES[2], 'Next button').id);
      await settle(player);
      expect(bar(p, PAGES[3])).toBeCloseTo(400 / 3, 1);
      await click(layer(p, PAGES[3], 'Next button').id);
      await settle(player);
      //on the question page the bar waits for the answer
      expect(player.artboard.name).toBe(PAGES[4]);
      expect(bar(p, PAGES[4])).toBeCloseTo(400 / 3, 1);
      expect(textOf(layer(p, PAGES[4], 'Chapter progress text').id)).toBe('2 of 3');
      await answer(p, player, PAGES[4], true);
      expect(bar(p, PAGES[4])).toBe(200);
      expect(textOf(layer(p, PAGES[4], 'Chapter progress text').id)).toBe('3 of 3');
      //reading a page again never takes progress back
      player.goTo(PAGES[2]);
      await settle(player, 100);
      expect(bar(p, PAGES[2])).toBe(200);
      //another chapter is on its own
      player.goTo(PAGES[5]);
      await settle(player, 100);
      expect(bar(p, PAGES[5])).toBeCloseTo(200 / 3, 1);
      player.destroy();
    });

    it('the contents page shows each chapter as not started, in progress or completed, and the button says Continue part way', async () => {
      const p = project();
      const player = await open(p);
      player.goTo('Contents');
      await settle(player, 100);
      const cards = board(p, 'Contents').children.filter((c) => c.name.endsWith(' card')) as unknown as { children: SceneNode[] }[];
      const read = (n: number, what: string) => textOf(cards[n].children.find((c) => c.name === what)!.id);
      expect(read(0, 'Chapter status')).toBe('Not started  ·  0 of 3');
      expect(read(0, 'Open chapter button')).toContain('Open chapter 1');
      expect(textOf(layer(p, 'Contents', 'Chapters completed').id)).toBe('0 of 3 chapters completed');
      player.goTo(PAGES[3]);
      await settle(player, 100);
      player.goTo('Contents');
      await settle(player, 100);
      expect(read(0, 'Chapter status')).toBe('In progress  ·  2 of 3');
      expect(read(0, 'Open chapter button')).toContain('Continue chapter 1');
      await answer(p, player, PAGES[4], true);
      player.goTo('Contents');
      await settle(player, 100);
      expect(read(0, 'Chapter status')).toBe('Completed  ·  3 of 3');
      expect(read(0, 'Open chapter button')).toContain('Open chapter 1');
      expect(read(1, 'Chapter status')).toBe('Not started  ·  0 of 3');
      expect(textOf(layer(p, 'Contents', 'Chapters completed').id)).toBe('1 of 3 chapters completed');
      await click(cards[2].children.find((c) => c.name === 'Open chapter button')!.id);
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[8]);
      player.destroy();
    });

    it('the question works: a wrong answer can be tried again, the result goes into the chapter variable and the score, and Next still moves on', async () => {
      const p = project();
      const player = await open(p);
      const pre = questionOf(p, PAGES[4]).question.prefix;
      await answer(p, player, PAGES[4], false);
      expect(player.getVariable(`${pre}_correct`)).toBe(false);
      expect(player.getVariable('s1')).toBe(-1);
      //a second try, right
      const frame = questionOf(p, PAGES[4]);
      const items = player.getVariable(`${pre}_items`) as { text: string }[];
      const spec = (frame as unknown as { question: { options: { text: string; correct?: boolean }[] } }).question.options;
      const rightAt = items.findIndex((o) => o.text === spec.find((s) => s.correct)!.text);
      await click(`${part(frame, 'option').id}~${rightAt}`);
      await click(part(frame, 'check').id);
      await settle(player, 100);
      expect(player.getVariable(`${pre}_correct`)).toBe(true);
      const first = player.getVariable('s1') as number;
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThanOrEqual(1);
      expect(player.getVariable('score')).toBe(first);
      await click(layer(p, PAGES[4], 'Next button').id);
      await settle(player);
      expect(player.artboard.name).toBe(PAGES[5]);
      player.destroy();
    });

    it('the summary shows the chapters completed and the questions right, and Start again begins the book afresh', async () => {
      const p = project();
      const player = await open(p);
      player.goTo('Your summary');
      await settle(player, 100);
      expect(textOf(layer(p, 'Your summary', 'Chapters count').id)).toBe('0 of 3');
      expect(textOf(layer(p, 'Your summary', 'Score').id)).toBe('0 of 3');
      expect(textOf(layer(p, 'Your summary', 'Chapter 1 question').id)).toBe('Chapter 1: not answered');
      await answer(p, player, PAGES[4], true);
      await answer(p, player, PAGES[7], true);
      await answer(p, player, PAGES[9], true);
      //read every page so the chapters count as complete
      for (const page of [PAGES[2], PAGES[3], PAGES[5], PAGES[6], PAGES[8]]) {
        player.goTo(page);
        await settle(player, 100);
      }
      player.goTo('Your summary');
      await settle(player, 100);
      expect(textOf(layer(p, 'Your summary', 'Chapters count').id)).toBe('3 of 3');
      expect(textOf(layer(p, 'Your summary', 'Score').id)).toBe('3 of 3');
      expect(textOf(layer(p, 'Your summary', 'Chapter 2 question').id)).toBe('Chapter 2: right');
      expect(textOf(layer(p, 'Your summary', 'Chapter 3 line').id)).toBe('✓  Chapter 3: Getting help');
      expect(textOf(layer(p, 'Your summary', 'Score message').id)).toBe('Every question right. Well done.');
      expect(player.result().score).toBe(3);
      await click(layer(p, 'Your summary', 'Start again button').id);
      await settle(player);
      expect(player.artboard.name).toBe('Cover');
      expect(player.getVariable('score')).toBe(0);
      expect(player.getVariable('c1')).toBe(0);
      expect(player.getVariable('s1')).toBe(-1);
      player.destroy();
    });

    it('one chapter missed shows in the verdict', async () => {
      const p = project();
      const player = await open(p);
      await answer(p, player, PAGES[4], true);
      await answer(p, player, PAGES[7], true);
      player.setVariable('s3', 0);
      player.goTo('Your summary');
      await settle(player, 100);
      expect(textOf(layer(p, 'Your summary', 'Chapter 3 question').id)).toBe('Chapter 3: not right');
      expect(textOf(layer(p, 'Your summary', 'Score message').id)).toContain('Most of them right');
      player.destroy();
    });

    it('a returning reader keeps their place and progress', async () => {
      const p = project();
      const a = await open(p);
      await click(layer(p, 'Cover', 'Start reading button').id);
      await settle(a);
      await click(layer(p, PAGES[2], 'Next button').id);
      await settle(a);
      expect(a.artboard.name).toBe(PAGES[3]);
      a.destroy();
      const b = await open(p);
      await settle(b, 100);
      expect(b.artboard.name).toBe(PAGES[3]);
      expect(b.getVariable('c1')).toBe(2);
      expect(b.getVariable('s1')).toBe(-1);
      b.destroy();
    });

    it('reports the score and completes on the summary page', () => {
      const p = project();
      const r = p.settings.reporting!;
      expect(p.variables.find((v) => v.id === r.scoreVariable)!.name).toBe('score');
      expect(r.maxScore).toBe(3);
      expect(r.completion).toBe('artboard');
      expect(r.completionArtboard).toBe(board(p, 'Your summary').id);
      expect(r.resumeArtboard).toBe(true);
    });
  });
});
