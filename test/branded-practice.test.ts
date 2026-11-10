//The practice set of branded starters (speaking and rehearsal): each builds in every colourway, normalises, paints only with tokens,
//plays under jsdom without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMediaHost, Player, normalizeProject, walk, type Artboard, type FakeBehaviour, type Project, type SceneNode } from 'interactives-player';
import { checkAccessibility, sensorRoutes } from '../src/lib/a11y/checks';
import { STARTERS } from '../src/lib/branded/sets/practice';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const get = (key: string) => STARTERS.find((s) => s.key === key)!;

describe('practice starters', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  const play = (p: Project) => new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false });
  const click = async (id: string) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
  };
  const settle = async (player: Player, ms = 300) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };

  it('has the starters, keyed practice/', () => {
    expect(STARTERS.map((s) => s.key)).toEqual(['practice/difficult-conversation', 'practice/timed-talk-rehearsal', 'practice/keep-the-beat', 'practice/sign-practice', 'practice/shadow-the-model']);
  });

  for (const starter of STARTERS) {
    describe(starter.name, () => {
      it('builds in every colourway, normalises, paints with tokens only and has a checklist that points at real layers', () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          expect(project.artboards.length).toBeGreaterThanOrEqual(3);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          const list = project.template!.checklist;
          expect(list.length).toBeGreaterThanOrEqual(5);
          const ids = new Set<string>();
          for (const ab of project.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
          for (const c of list) {
            if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
            if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
          }
          //nothing is painted with a literal colour, in the layers, the backgrounds or the expressions that set colours
          for (const ab of project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          expect(JSON.stringify(project.artboards)).toContain('"fontFamily":"Open Sans"');
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
        }
      });

      it('wires its graphs to things that exist', () => {
        const { project } = starter.build(COLOURWAYS[0]);
        for (const ab of project.artboards) {
          const ids = new Set<string>();
          walk(ab.children, (n) => ids.add(n.id));
          const nodes = new Set(ab.logic.nodes.map((g) => g.id));
          for (const e of ab.logic.edges) expect(nodes.has(e.from) && nodes.has(e.to)).toBe(true);
          for (const g of ab.logic.nodes) {
            const t = (g.params as Record<string, unknown>).target;
            if (typeof t === 'string' && t) expect(ids.has(t), `${g.kind} target`).toBe(true);
            const v = (g.params as Record<string, unknown>).variable;
            if (typeof v === 'string' && v) expect(project.variables.some((x) => x.id === v)).toBe(true);
            const a = (g.params as Record<string, unknown>).artboard;
            if (typeof a === 'string' && a) expect(project.artboards.some((x) => x.id === a)).toBe(true);
          }
        }
      });

      it('keeps every content layer on the page and clear of the footer and logo band', () => {
        //as a person gets it, with the auto layout frames settled to their real height
        const project = projectFromBrandedStarter(starter, COLOURWAYS[0]);
        for (const ab of project.artboards) {
          if (!byName(ab, 'Footer text')) continue;
          for (const n of ab.children) {
            if ((n as { tags?: string[] }).tags?.includes('brand-chrome') || n.name === 'Footer text' || n.name === 'Page title') continue;
            const w = (n as { width?: number }).width ?? 0;
            const h = (n as { height?: number }).height ?? 0;
            expect(n.x, `${ab.name} / ${n.name}`).toBeGreaterThanOrEqual(0);
            expect(n.x + w, `${ab.name} / ${n.name}`).toBeLessThanOrEqual(ab.width);
            expect(n.y, `${ab.name} / ${n.name}`).toBeGreaterThanOrEqual(100);
            expect(n.y + h, `${ab.name} / ${n.name}`).toBeLessThanOrEqual(ab.height - 44);
          }
        }
      });

      it('plays in every colourway without throwing, on every page', async () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          const errors: unknown[] = [];
          const spy = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
          const player = play(project);
          await settle(player, 100);
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            await settle(player, 100);
            expect(player.artboard.id).toBe(ab.id);
          }
          player.destroy();
          spy.mockRestore();
          expect(errors).toEqual([]);
        }
        //Sign practice has a portrait copy of every page, so it visits more than the others
      }, 30000);

      //Keep the beat records nothing, Sign practice uses the camera and is tested on its own. Shadow the model declares the microphone and is tested on its own below. The two rehearsals ship with recording OFF:
      //the record layers are there but only show while the microphone is ready, which it never is in a project that declares nothing
      it.skipIf(['practice/keep-the-beat', 'practice/shadow-the-model', 'practice/sign-practice'].includes(starter.key))('has an optional recording step that is off as shipped, and a checklist item that says how to switch it on', () => {
        const { project, checklist } = starter.build(COLOURWAYS[0]);
        expect(checklist.some((c) => /OPTIONAL RECORDING/.test(c.detail ?? c.text) && /Microphone and camera/.test(c.detail ?? c.text) && /dropped/.test(c.detail ?? c.text))).toBe(true);
        expect(project.settings.sensors).toBeUndefined();
        const steps: SceneNode[] = [];
        for (const ab of project.artboards) walk(ab.children, (n) => /^(Recording|Replay) step$/.test(n.name) && steps.push(n));
        expect(steps.length).toBeGreaterThan(0);
        //each shows only while the microphone is ready, so learners with it off, denied or missing see the rehearsal as it always was
        for (const s of steps) expect(s.bindings?.visible).toContain('microphone == "ready"');
        const nodes = project.artboards.flatMap((ab) => ab.logic.nodes.map((n) => n.kind));
        //Record is one Start recording node set to Start or stop (so no separate Stop recording is needed), and the take plays through Play recording
        expect(nodes).toEqual(expect.arrayContaining(['action.recordStart', 'action.recordPlay']));
        const starts = project.artboards.flatMap((ab) => ab.logic.nodes.filter((n) => n.kind === 'action.recordStart'));
        expect(starts.length).toBeGreaterThan(0);
        for (const n of starts) expect(n.params).toMatchObject({ op: 'toggle', quiet: true });
        expect(JSON.stringify(project)).not.toMatch(/getUserMedia|MediaRecorder/);
        //and the page says nothing is recorded, until it is switched on
        expect(JSON.stringify(project.artboards)).toMatch(/Nothing is recorded|No microphone is used/);
      });
    });
  }

  describe('difficult conversation rehearsal', () => {
    const KEY = 'practice/difficult-conversation';
    const FIRST = 'Alex asks for more time';
    const CALMER = 'Alex, a little calmer';
    const TENSER = 'Alex, still frustrated';
    const project = () => projectFromBrandedStarter(get(KEY), COLOURWAYS[0]);
    const open = async (p: Project, page = FIRST) => {
      const player = play(p);
      await settle(player, 100);
      player.goTo(page);
      await settle(player, 100);
      return player;
    };

    it('is framed as rehearsal, with the transcript on the page and a typed alternative', () => {
      const p = project();
      const all = JSON.stringify(p.artboards);
      expect(all).toMatch(/not assessed/i);
      expect(all).toMatch(/Nothing here was marked, saved or sent/);
      expect(byName(board(p, FIRST), 'Their line')).toBeTruthy();
      expect(byName(board(p, FIRST), 'Transcript label')).toBeTruthy();
      expect(byName(board(p, FIRST), 'Reply box')).toBeTruthy();
      expect(byName(board(p, FIRST), 'Type instead')).toBeTruthy();
      //no score: nothing in the project counts points
      expect(p.variables.map((v) => v.name)).not.toContain('score');
      expect(p.settings.reporting).toBeUndefined();
    });

    it('starts at the reply stage, with the audio button hidden until audioLines is set', async () => {
      const p = project();
      const player = await open(p);
      expect(player.getVariable('stage')).toBe('reply');
      expect(player.getVariable('audioLines')).toBe(false);
      expect(getComputedStyle(el(layer(p, FIRST, 'Play their line').id)).display).toBe('none');
      expect(getComputedStyle(el(layer(p, FIRST, 'Review stage').id)).display).toBe('none');
      player.setVariable('audioLines', true);
      await settle(player, 50);
      expect(getComputedStyle(el(layer(p, FIRST, 'Play their line').id)).display).not.toBe('none');
      player.destroy();
    });

    it('type instead shows the reply box, and the typed reply comes back in review', async () => {
      const p = project();
      const player = await open(p);
      const boxId = layer(p, FIRST, 'Reply box').id;
      expect(getComputedStyle(el(boxId)).display).toBe('none');
      await click(layer(p, FIRST, 'Type instead').id);
      await settle(player, 50);
      expect(player.getVariable('typing')).toBe(true);
      expect(getComputedStyle(el(boxId)).display).not.toBe('none');
      expect(textOf(layer(p, FIRST, 'Type instead').id)).toContain('Say it aloud instead');
      player.setVariable('reply', 'I am sorry it has been so hard.');
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('review');
      expect(getComputedStyle(el(layer(p, FIRST, 'Review stage').id)).display).not.toBe('none');
      expect(textOf(layer(p, FIRST, 'Your reply text').id)).toContain('so hard');
      player.destroy();
    });

    it('ticks and unticks framework points, and the count follows', async () => {
      const p = project();
      const player = await open(p);
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      const rows = () => [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${layer(p, FIRST, 'Framework row').id}~"]`)];
      expect(rows().length).toBe(4);
      expect(rows()[0].getAttribute('role')).toBe('checkbox');
      rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(player, 50);
      rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(player, 50);
      expect(player.getVariable('ticked')).toEqual([0, 2]);
      expect(textOf(layer(p, FIRST, 'Ticked count').id)).toContain('You ticked 2 of 4');
      expect(rows()[0].getAttribute('aria-checked')).toBe('true');
      rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await settle(player, 50);
      expect(player.getVariable('ticked')).toEqual([2]);
      player.destroy();
    });

    it('a longer framework list (five points, like ISBAR) makes five rows', async () => {
      const p = project();
      p.variables.find((v) => v.name === 'framework')!.initial = JSON.stringify(['Identify', 'Situation', 'Background', 'Assessment', 'Recommendation']);
      const player = await open(p);
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, FIRST, 'Framework row').id}~"]`).length).toBe(5);
      player.destroy();
    });

    it('try again goes back to the reply stage with the ticks and the typed reply cleared', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('reply', 'something');
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      player.setVariable('ticked', [1]);
      await click(layer(p, FIRST, 'Try this scene again').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('reply');
      expect(player.getVariable('ticked')).toEqual([]);
      expect(player.getVariable('reply')).toBe('');
      expect(player.getVariable('tries')).toBe(1);
      expect(player.artboard.name).toBe(FIRST);
      player.destroy();
    });

    it('the branch picked decides the next scene: calms goes to the calmer scene, tenser to the frustrated one', async () => {
      const p = project();
      let player = await open(p);
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      await click(layer(p, FIRST, 'It calms them').id);
      await settle(player);
      expect(player.artboard.name).toBe(CALMER);
      expect(player.getVariable('calm')).toBe(1);
      //the new scene opens fresh at the reply stage
      expect(player.getVariable('stage')).toBe('reply');
      expect(textOf(layer(p, CALMER, 'Scene number').id)).toBe('Scene 2');
      player.destroy();

      document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
      player = await open(p);
      await click(layer(p, FIRST, 'Compare with the expert').id);
      await settle(player, 50);
      await click(layer(p, FIRST, 'It makes it tenser').id);
      await settle(player);
      expect(player.artboard.name).toBe(TENSER);
      expect(player.getVariable('tense')).toBe(1);
      player.destroy();
    });

    it('the ending reads how many scenes calmed and how many got tenser, and Start again clears it', async () => {
      const p = project();
      const player = await open(p);
      for (const [page, button] of [[FIRST, 'It calms them'], [CALMER, 'It calms them']] as const) {
        await click(layer(p, page, 'Compare with the expert').id);
        await settle(player, 50);
        await click(layer(p, page, button).id);
        await settle(player);
      }
      expect(player.artboard.name).toBe('Ending');
      expect(player.getVariable('path')).toBe('calmer > calmer');
      expect(textOf(layer(p, 'Ending', 'Result').id)).toContain('The conversation settled');
      expect(textOf(layer(p, 'Ending', 'Outcome').id)).toContain('You listened first');
      await click(layer(p, 'Ending', 'Start again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Rehearse a hard conversation');
      expect(player.getVariable('calm')).toBe(0);
      player.destroy();
    });

    it('a tenser route ends in the still tense outcome', async () => {
      const p = project();
      const player = await open(p, TENSER);
      player.setVariable('tense', 2);
      await click(layer(p, TENSER, 'Compare with the expert').id);
      await settle(player, 50);
      await click(layer(p, TENSER, 'It makes it tenser').id);
      await settle(player);
      expect(player.artboard.name).toBe('Ending');
      expect(textOf(layer(p, 'Ending', 'Result').id)).toContain('Still tense');
      player.destroy();
    });
  });

  describe('timed talk rehearsal', () => {
    const KEY = 'practice/timed-talk-rehearsal';
    const R = 'Draw, prepare, talk';
    const SUM = 'Your attempts';
    const project = () => projectFromBrandedStarter(get(KEY), COLOURWAYS[0]);
    const open = async (p: Project, page = R) => {
      const player = play(p);
      await settle(player, 100);
      player.goTo(page);
      await settle(player, 100);
      return player;
    };
    const shown = (p: Project, page: string, name: string) => getComputedStyle(el(layer(p, page, name).id)).display !== 'none';
    const draw = async (p: Project, player: Player) => {
      await click(layer(p, R, 'Draw a card').id);
      await settle(player, 50);
    };

    it('is framed as rehearsal with no microphone, and offers a bank, timers, a tally and a summary', () => {
      const p = project();
      const all = JSON.stringify(p.artboards);
      expect(all).toMatch(/not assessed/i);
      expect(all).toMatch(/No microphone is used/);
      expect(p.variables.map((v) => v.name)).toEqual(expect.arrayContaining(['cards', 'timersOn', 'prepSeconds', 'talkSeconds', 'attempts']));
      expect(p.variables.find((v) => v.name === 'attempts')!.persist).toBe(true);
      const cards = JSON.parse(p.variables.find((v) => v.name === 'cards')!.initial as string);
      expect(cards.length).toBeGreaterThanOrEqual(5);
      for (const c of cards) {
        expect(c.q.length).toBeGreaterThan(10);
        expect(c.model.length).toBeGreaterThan(40);
        expect(c.points.length).toBeLessThanOrEqual(4);
      }
      expect(new Set(cards.map((c: { type: string }) => c.type)).size).toBeGreaterThanOrEqual(3);
      expect(p.settings.reporting).toBeUndefined();
    });

    it('opens face down on the draw stage; drawing a card shows it and starts the preparation countdown', async () => {
      const p = project();
      const player = await open(p);
      expect(player.getVariable('stage')).toBe('draw');
      expect(textOf(layer(p, R, 'Card question').id)).toBe('Draw a card to begin.');
      expect(shown(p, R, 'Prepare stage')).toBe(false);
      await draw(p, player);
      const cards = player.getVariable('cards') as { q: string }[];
      const cur = player.getVariable('current') as number;
      expect(cur).toBeGreaterThanOrEqual(0);
      expect(textOf(layer(p, R, 'Card question').id)).toBe(cards[cur].q);
      expect(player.getVariable('stage')).toBe('prep');
      expect(player.getVariable('left')).toBe(30);
      expect(textOf(layer(p, R, 'Prepare clock').id)).toBe('0:30');
      expect(shown(p, R, 'Prepare stage')).toBe(true);
      expect(shown(p, R, 'Draw stage')).toBe(false);
      player.destroy();
    });

    it('draws at random and never repeats a card until the whole bank has been drawn', async () => {
      const p = project();
      const player = await open(p);
      const n = (player.getVariable('cards') as unknown[]).length;
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        player.setVariable('stage', 'draw');
        await settle(player, 50);
        await draw(p, player);
        order.push(player.getVariable('current') as number);
      }
      expect(new Set(order).size).toBe(n);
      //the next draw starts a fresh round and does not repeat the card just drawn
      player.setVariable('stage', 'draw');
      await settle(player, 50);
      await draw(p, player);
      expect(player.getVariable('seen')).toHaveLength(1);
      expect(player.getVariable('current')).not.toBe(order[n - 1]);
      player.destroy();
    });

    it('with Math.random fixed the draw picks that card', async () => {
      const p = project();
      const player = await open(p);
      const spy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
      await draw(p, player);
      spy.mockRestore();
      expect(player.getVariable('current')).toBe((player.getVariable('cards') as unknown[]).length - 1);
      player.destroy();
    });

    it('the preparation clock runs out into the talk, and the talk clock runs out into the tally (the native Countdown node)', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('prepSeconds', 1);
      player.setVariable('talkSeconds', 2);
      await draw(p, player);
      expect(player.getVariable('stage')).toBe('prep');
      await vi.waitFor(() => expect(player.getVariable('stage')).toBe('talk'), { timeout: 2500 });
      await settle(player, 50);
      expect(textOf(layer(p, R, 'Talk clock').id)).toMatch(/^0:0[12]$/);
      expect(shown(p, R, 'Talk stage')).toBe(true);
      await vi.waitFor(() => expect(player.getVariable('stage')).toBe('tally'), { timeout: 3500 });
      await settle(player, 50);
      expect(shown(p, R, 'Tally stage')).toBe(true);
      player.destroy();
    });

    it('runs both countdowns with the Countdown node and a Progress bar, not a one second timer', () => {
      const { project: built } = get('practice/timed-talk-rehearsal').build(COLOURWAYS[0]);
      const nodes = board(built, R).logic.nodes;
      expect(nodes.filter((n) => n.kind === 'action.clock').map((n) => n.params.seconds)).toEqual(expect.arrayContaining(['prepSeconds', 'talkSeconds']));
      expect(nodes.some((n) => n.kind === 'event.timer')).toBe(false);
      expect((byName(board(built, R), 'Prepare bar') as { type: string }).type).toBe('progress');
      expect(built.variables.find((v) => v.name === 'pool')?.live).toBe(true);
    });

    it('the buttons move on early, and lengthened timers (the variables) are used', async () => {
      const p = project();
      const player = await open(p);
      player.setVariable('prepSeconds', 90);
      player.setVariable('talkSeconds', 150);
      await draw(p, player);
      expect(textOf(layer(p, R, 'Prepare clock').id)).toBe('1:30');
      await click(layer(p, R, 'Prepare button').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('talk');
      expect(textOf(layer(p, R, 'Talk clock').id)).toBe('2:30');
      await click(layer(p, R, 'Talk button').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('tally');
      player.destroy();
    });

    it('with the timers off nothing counts down, the clock is hidden and the buttons still work', async () => {
      const p = project();
      const player = await open(p);
      //the learner's own switch
      await click(layer(p, R, 'Timer switch').id);
      await settle(player, 50);
      expect(player.getVariable('timersOn')).toBe(false);
      expect(textOf(layer(p, R, 'Timer switch').id)).toContain('Timers: off');
      await draw(p, player);
      expect(player.getVariable('left')).toBe(0);
      expect(textOf(layer(p, R, 'Prepare clock').id)).toBe('No timer');
      expect(shown(p, R, 'Prepare bar')).toBe(false);
      await flush(1150);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('prep');
      await click(layer(p, R, 'Prepare button').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('talk');
      await flush(1150);
      expect(player.getVariable('stage')).toBe('talk');
      player.destroy();
    });

    it('the timers can be switched off by the author as the starting value', async () => {
      const p = project();
      p.variables.find((v) => v.name === 'timersOn')!.initial = false;
      const player = await open(p);
      expect(textOf(layer(p, R, 'Timer switch').id)).toContain('Timers: off');
      player.destroy();
    });

    it('the tally counts fillers and pauses (never below zero) and toggles the opening and close', async () => {
      const p = project();
      const player = await open(p);
      await draw(p, player);
      player.setVariable('stage', 'tally');
      await settle(player, 50);
      await click(layer(p, R, 'Fillers more').id);
      await click(layer(p, R, 'Fillers more').id);
      await click(layer(p, R, 'Fillers fewer').id);
      await click(layer(p, R, 'Pauses fewer').id);
      await click(layer(p, R, 'Pauses more').id);
      expect(player.getVariable('fillers')).toBe(1);
      expect(player.getVariable('pauses')).toBe(1);
      await settle(player, 50);
      expect(textOf(layer(p, R, 'Fillers count').id)).toBe('1');
      await click(layer(p, R, 'Clear opening').id);
      expect(player.getVariable('clearOpening')).toBe(true);
      await settle(player, 50);
      expect(el(layer(p, R, 'Clear opening').id).getAttribute('aria-checked')).toBe('true');
      await click(layer(p, R, 'Clear close').id);
      expect(player.getVariable('clearClose')).toBe(true);
      await click(layer(p, R, 'Clear close').id);
      expect(player.getVariable('clearClose')).toBe(false);
      await click(layer(p, R, 'Clear opening').id);
      expect(player.getVariable('clearOpening')).toBe(false);
      await click(layer(p, R, 'Clear opening').id);
      await click(layer(p, R, 'To the model answer').id);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('compare');
      expect(textOf(layer(p, R, 'Model answer').id)).toBe((player.getVariable('cards') as { model: string }[])[player.getVariable('current') as number].model);
      player.destroy();
    });

    const attempt = async (p: Project, player: Player, fill: number, tickPoints: number[]) => {
      await draw(p, player);
      player.setVariable('stage', 'tally');
      await settle(player, 50);
      for (let i = 0; i < fill; i++) await click(layer(p, R, 'Fillers more').id);
      await settle(player, 50);
      await click(layer(p, R, 'Clear opening').id);
      await click(layer(p, R, 'To the model answer').id);
      await settle(player, 50);
      for (const i of tickPoints) await click(`${layer(p, R, 'Point row').id}~${i}`);
    };

    it('ticks the model answer points, and saving keeps the attempt in the list', async () => {
      const p = project();
      const player = await open(p);
      await attempt(p, player, 3, [0, 2]);
      expect(player.getVariable('covered')).toEqual([0, 2]);
      await settle(player, 50);
      expect(textOf(layer(p, R, 'Points made').id)).toBe('Points made: 2 of 4');
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, R, 'Point row').id}~"]`)).toHaveLength(4);
      await click(layer(p, R, 'Save and next card').id);
      await settle(player, 50);
      const list = player.getVariable('attempts') as Record<string, unknown>[];
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ n: 1, fillers: 3, pauses: 0, opening: true, close: false, made: 2, of: 4 });
      expect(player.getVariable('stage')).toBe('draw');
      expect(player.artboard.name).toBe(R);
      player.destroy();
    });

    it('the summary shows the numbers across attempts and the last rows, and Clear my history empties them', async () => {
      const p = project();
      const player = await open(p);
      await attempt(p, player, 5, [0]);
      await click(layer(p, R, 'Save and next card').id);
      await settle(player, 50);
      await attempt(p, player, 2, [0, 1, 2]);
      await click(layer(p, R, 'Save and see summary').id);
      await settle(player);
      expect(player.artboard.name).toBe(SUM);
      expect(textOf(layer(p, SUM, 'Attempts').id)).toBe('2');
      expect(textOf(layer(p, SUM, 'Fillers').id)).toBe('5 to 2');
      expect(textOf(layer(p, SUM, 'Openings').id)).toBe('2 of 2');
      expect(textOf(layer(p, SUM, 'Closes').id)).toBe('0 of 2');
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, SUM, 'Attempt row').id}~"]`)).toHaveLength(2);
      expect(textOf(`${layer(p, SUM, 'Cell Fillers').id}~1`)).toBe('2');
      expect(textOf(`${layer(p, SUM, 'Cell Points').id}~0`)).toBe('1 of 4');
      await click(layer(p, SUM, 'Clear my history').id);
      await settle(player, 50);
      expect(player.getVariable('attempts')).toEqual([]);
      expect(textOf(layer(p, SUM, 'Empty note').id)).toContain('No attempts yet');
      await click(layer(p, SUM, 'Draw another card').id);
      await settle(player);
      expect(player.artboard.name).toBe(R);
      expect(player.getVariable('stage')).toBe('draw');
      player.destroy();
    });

    it('only the last six attempts are listed, and the attempts are remembered across a reload', async () => {
      const p = project();
      let player = await open(p);
      const many = Array.from({ length: 8 }, (_, i) => ({ n: i + 1, type: 'Viva question', q: `Q${i}`, fillers: 8 - i, pauses: 1, opening: i > 3, close: false, made: 2, of: 4 }));
      player.setVariable('attempts', many);
      await settle(player, 100);
      player.goTo(SUM);
      await settle(player, 100);
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, SUM, 'Attempt row').id}~"]`)).toHaveLength(6);
      expect(textOf(`${layer(p, SUM, 'Cell No.').id}~0`)).toBe('3');
      expect(textOf(layer(p, SUM, 'Fillers').id)).toBe('8 to 1');
      player.flushProgress();
      player.destroy();
      document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
      player = play(p);
      await settle(player, 100);
      expect(player.getVariable('attempts')).toHaveLength(8);
      player.destroy();
    });
  });

  //The microphone, played against the pretend host. Audio is a recording <audio> element that fires its metadata and end events, so a clip "plays".
  describe('recording (the media bridge), against the pretend host', () => {
    interface Heard {
      src: string;
      playbackRate: number;
      preservesPitch: boolean;
      volume: number;
      paused: boolean;
    }
    let heard: Heard[] = [];
    class FakeAudio {
      volume = 1;
      muted = false;
      loop = false;
      playbackRate = 1;
      preservesPitch = false;
      paused = false;
      duration = 0.05;
      private ends: (() => void)[] = [];
      constructor(public src: string) {
        heard.push(this as unknown as Heard);
      }
      play() {
        setTimeout(() => this.ends.forEach((f) => f()), 30);
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
      addEventListener(ev: string, f: () => void) {
        if (ev === 'ended') this.ends.push(f);
        if (ev === 'loadedmetadata') setTimeout(f, 0);
      }
    }
    beforeEach(() => {
      heard = [];
      vi.stubGlobal('Audio', FakeAudio);
      URL.createObjectURL = vi.fn((b: Blob) => `blob:take-${b.size}`);
      URL.revokeObjectURL = vi.fn();
    });

    const withHost = (p: Project, behaviour: FakeBehaviour = 'works') => {
      const host = new FakeMediaHost({ declaration: p.settings.sensors, behaviour });
      const player = new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false, media: host });
      return { host, player };
    };
    const shown = (p: Project, page: string, name: string) => getComputedStyle(el(layer(p, page, name).id)).display !== 'none';
    const off = (id: string) => !!el(id).querySelector<HTMLButtonElement>('button')?.disabled;
    const tick = async (player: Player, ms = 100) => {
      await settle(player, ms);
    };
    const clickOn = async (player: Player, p: Project, page: string, name: string, ms = 100) => {
      await click(layer(p, page, name).id);
      await tick(player, ms);
    };

    describe('shadow the model', () => {
      const P = 'Listen, say it, compare';
      const project = () => projectFromBrandedStarter(get('practice/shadow-the-model'), COLOURWAYS[0]);
      const open = async (p: Project, behaviour: FakeBehaviour = 'works') => {
        const r = withHost(p, behaviour);
        await tick(r.player);
        r.player.goTo(P);
        await tick(r.player);
        return r;
      };

      it('declares the microphone with a purpose and a cap, and passes the sensors rule because the plain version finishes without it', () => {
        const p = project();
        expect(p.settings.sensors).toMatchObject({ microphone: true, maxSeconds: 30 });
        expect(p.settings.sensors!.purpose!.length).toBeLessThanOrEqual(140);
        expect(p.settings.sensors!.camera).toBeFalsy();
        const routes = sensorRoutes(p);
        expect(routes.finishes).toBeGreaterThan(0);
        expect(routes.free).toBeGreaterThan(0);
        expect(checkAccessibility(p).findings.filter((f) => f.check === 'sensors')).toEqual([]);
        //it says plainly that a recording is lost, on the card and on the first page
        const all = JSON.stringify(p.artboards);
        expect(all).toMatch(/gone when you reload/);
        expect(all).toMatch(/dropped when you go to the next card, and it is gone if you reload/);
      });

      it('keeps the cards one list, each with its own model clip as an asset, and plays the right one through Play sound with a slow speed', async () => {
        const p = project();
        const cards = JSON.parse(p.variables.find((v) => v.name === 'cards')!.initial as string) as { phrase: string; sound: string; checks: string[] }[];
        expect(cards.length).toBe(4);
        for (const c of cards) {
          expect(p.assets.some((a) => a.id === c.sound && /\(replace\)\.wav$/.test(a.name))).toBe(true);
          expect(c.checks.length).toBeLessThanOrEqual(4);
        }
        expect(new Set(cards.map((c) => c.sound)).size).toBe(4);
        const { player } = await open(p);
        await clickOn(player, p, P, 'Play model');
        //one button: while the model is playing it says Stop, and pressing it stops (5 s: the clip starting took over the
        //default 1 s on the Windows box)
        await vi.waitFor(() => (player.step(50), expect(textOf(layer(p, P, 'Play model').id)).toBe('Stop')), { timeout: 5000 });
        await clickOn(player, p, P, 'Play model');
        await vi.waitFor(() => (player.step(50), expect(textOf(layer(p, P, 'Play model').id)).toBe('Play model')));
        expect(heard[0].paused).toBe(true);
        await clickOn(player, p, P, 'Slow switch');
        expect(textOf(layer(p, P, 'Slow switch').id)).toContain('Slow: on');
        await clickOn(player, p, P, 'Play model');
        const first = heard.filter((h) => !h.src.startsWith('blob:take'));
        expect(first.length).toBeGreaterThanOrEqual(2);
        expect(first[0].src).toBe(first[1].src);
        expect(first[0].playbackRate).toBe(1);
        expect(first[first.length - 1].playbackRate).toBeCloseTo(0.7);
        expect(first[first.length - 1].preservesPitch).toBe(true);
        player.setVariable('current', 2);
        await tick(player, 50);
        //the last clip has finished (the button says Play model again) before the next press starts another
        await vi.waitFor(() => (player.step(50), expect(textOf(layer(p, P, 'Play model').id)).toBe('Play model')));
        await clickOn(player, p, P, 'Play model');
        const third = heard.filter((h) => !h.src.startsWith('blob:take')).pop()!;
        expect(third.src).not.toBe(first[0].src);
        player.destroy();
      });

      it('with the microphone ready shows Record and not the plain version, and records, stops and plays a take back', async () => {
        const p = project();
        const { host, player } = await open(p);
        expect(player.getVariable('stage')).toBe('listen');
        expect(shown(p, P, 'Record')).toBe(true);
        expect(shown(p, P, 'Plain version')).toBe(false);
        expect(shown(p, P, 'Play mine')).toBe(false);
        expect(textOf(layer(p, P, 'Record status').id)).toBe('Not recorded yet.');
        await clickOn(player, p, P, 'Record');
        const start = host.calls.find((c) => c.op === 'start')!;
        expect(start.args).toMatchObject({ slot: 'take', video: false, audio: true });
        expect(textOf(layer(p, P, 'Record').id)).toBe('Stop recording');
        expect(textOf(layer(p, P, 'Record status').id)).toContain('Recording');
        //the model and the take never play over the microphone
        expect(off(layer(p, P, 'Play model').id)).toBe(true);
        await clickOn(player, p, P, 'Record');
        expect(textOf(layer(p, P, 'Record').id)).toBe('Record again');
        expect(textOf(layer(p, P, 'Record status').id)).toContain('It stays on this device');
        expect(shown(p, P, 'Play mine')).toBe(true);
        await clickOn(player, p, P, 'Play mine');
        await vi.waitFor(() => expect(heard.some((h) => h.src.startsWith('blob:take'))).toBe(true));
        player.destroy();
      });

      it('plays the model then the take back to back, and Stop in between cancels the second half', async () => {
        const p = project();
        const { player } = await open(p);
        await clickOn(player, p, P, 'Record');
        await clickOn(player, p, P, 'Record');
        await clickOn(player, p, P, 'Check myself');
        expect(player.getVariable('stage')).toBe('check');
        heard = [];
        await clickOn(player, p, P, 'Model then mine', 20);
        await vi.waitFor(() => expect(heard.map((h) => (h.src.startsWith('blob:take') ? 'mine' : 'model'))).toEqual(['model', 'mine']), { timeout: 3000 });
        await flush(100);
        //Stop while the model is still going (Play model says Stop while it plays): its Stopped output is wired, so the take is not played after it
        heard = [];
        await clickOn(player, p, P, 'Model then mine', 0);
        await clickOn(player, p, P, 'Play model', 0);
        await flush(400);
        expect(heard.some((h) => h.src.startsWith('blob:take'))).toBe(false);
        player.destroy();
      });

      it.each<FakeBehaviour>(['denied', 'off', 'no-device', 'blocked'])('with the microphone %s it is the plain version: listen, say it aloud, self-check, rate, and on to the results', async (b) => {
        const p = project();
        const { host, player } = await open(p, b);
        expect(shown(p, P, 'Record')).toBe(false);
        expect(shown(p, P, 'Play mine')).toBe(false);
        expect(shown(p, P, 'Plain version')).toBe(true);
        expect(textOf(layer(p, P, 'Plain version').id)).toContain('say the phrase out loud');
        expect(textOf(layer(p, P, 'Where recordings go').id)).toContain('Nothing is recorded here');
        await clickOn(player, p, P, 'Play model');
        expect(heard.length).toBeGreaterThan(0);
        await clickOn(player, p, P, 'Check myself');
        expect(shown(p, P, 'Model then mine')).toBe(false);
        expect(shown(p, P, 'Plain compare')).toBe(true);
        await click(`${layer(p, P, 'Check row').id}~0`);
        await click(`${layer(p, P, 'Check row').id}~2`);
        await click(layer(p, P, 'Rating Getting there').id);
        await tick(player, 50);
        expect(player.getVariable('checked')).toEqual([0, 2]);
        expect(player.getVariable('rating')).toBe(1);
        expect(el(layer(p, P, 'Rating Getting there').id).getAttribute('aria-checked')).toBe('true');
        await clickOn(player, p, P, 'Next card');
        expect(player.getVariable('current')).toBe(1);
        expect(player.getVariable('stage')).toBe('listen');
        expect(player.getVariable('checked')).toEqual([]);
        expect(player.getVariable('rating')).toBe(-1);
        expect(host.calls.filter((c) => c.op === 'start')).toEqual([]);
        for (let i = 1; i < 4; i++) {
          await clickOn(player, p, P, 'Check myself');
          await clickOn(player, p, P, i === 3 ? 'See my results' : 'Next card', 200);
        }
        expect(player.artboard.name).toBe('Your results');
        const rows = player.getVariable('results') as { n: number; rating: number; made: number; of: number; took: boolean }[];
        expect(rows).toHaveLength(4);
        expect(rows[0]).toMatchObject({ n: 1, rating: 1, made: 2, of: 3, took: false });
        expect(rows[1]).toMatchObject({ rating: -1, made: 0 });
        expect(textOf(layer(p, 'Your results', 'Cards done').id)).toBe('4 of 4');
        expect(textOf(`${layer(p, 'Your results', 'Cell How it went').id}~0`)).toBe('Getting there');
        expect(textOf(`${layer(p, 'Your results', 'Cell How it went').id}~1`)).toBe('Not rated');
        expect(textOf(`${layer(p, 'Your results', 'Cell Self-check').id}~0`)).toBe('2 of 3 ticked');
        await clickOn(player, p, 'Your results', 'Start again', 200);
        expect(player.artboard.name).toBe('Shadow the model');
        expect(player.getVariable('results')).toEqual([]);
        player.destroy();
      });

      it('a start that is refused mid-way (the learner says no) falls back to the plain version without losing the card', async () => {
        const p = project();
        const { host, player } = await open(p);
        host.simulate('denied');
        await tick(player, 100);
        expect(shown(p, P, 'Record')).toBe(false);
        expect(shown(p, P, 'Plain version')).toBe(true);
        expect(textOf(layer(p, P, 'Plain version').id)).toContain('Your browser is not letting this page');
        expect(player.getVariable('current')).toBe(0);
        player.destroy();
      });

      it('drops the take when the learner goes to the next card, and keeps it across Back to the card', async () => {
        const p = project();
        const { player } = await open(p);
        await clickOn(player, p, P, 'Record');
        await clickOn(player, p, P, 'Record');
        await clickOn(player, p, P, 'Check myself');
        await clickOn(player, p, P, 'Back to the card');
        expect(shown(p, P, 'Play mine')).toBe(true);
        await clickOn(player, p, P, 'Check myself');
        await clickOn(player, p, P, 'Next card', 200);
        expect(player.getVariable('current')).toBe(1);
        await clickOn(player, p, P, 'Check myself', 50);
        expect(off(layer(p, P, 'Play mine again').id)).toBe(true);
        expect((player.getVariable('results') as { took: boolean }[])[0].took).toBe(true);
        player.destroy();
      });

      it('with the microphone unticked by the author (nothing declared) it is the plain version too, and runs no recording node', async () => {
        const p = project();
        delete p.settings.sensors;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const player = play(p);
        await settle(player, 100);
        player.goTo(P);
        await settle(player, 100);
        expect(shown(p, P, 'Record')).toBe(false);
        expect(shown(p, P, 'Plain version')).toBe(true);
        await click(layer(p, P, 'Play model').id);
        await click(layer(p, P, 'Check myself').id);
        await settle(player, 50);
        expect(player.getVariable('stage')).toBe('check');
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
        player.destroy();
      });
    });

    describe('the rehearsals with recording switched on', () => {
      const R = 'Draw, prepare, talk';
      const talk = () => {
        const p = projectFromBrandedStarter(get('practice/timed-talk-rehearsal'), COLOURWAYS[0]);
        p.settings.sensors = { microphone: true, purpose: 'record your talk so you can play it back', maxSeconds: 90 };
        return p;
      };

      it('timed talk: record on the talk stage, the clock leaving the stage ends the take, play it on the tally, and the next card drops it', async () => {
        const p = talk();
        expect(checkAccessibility(p).findings.filter((f) => f.check === 'sensors')).toEqual([]);
        const { host, player } = withHost(p);
        await tick(player);
        expect(textOf(layer(p, 'Rehearse a talk against the clock', 'Subtitle').id)).toContain('You can also record yourself');
        player.goTo(R);
        await tick(player);
        expect(textOf(layer(p, R, 'Draw help').id)).toContain('The recording stays on this device');
        await clickOn(player, p, R, 'Draw a card');
        await clickOn(player, p, R, 'Prepare button');
        expect(player.getVariable('stage')).toBe('talk');
        expect(shown(p, R, 'Recording step')).toBe(true);
        await clickOn(player, p, R, 'Record this talk');
        expect(host.calls.some((c) => c.op === 'start' && c.args.slot === 'talk')).toBe(true);
        expect(textOf(layer(p, R, 'Record this talk').id)).toBe('Stop recording');
        //"I've finished" with the recording still going ends it
        await clickOn(player, p, R, 'Talk button', 200);
        expect(player.getVariable('stage')).toBe('tally');
        expect(host.calls.some((c) => c.op === 'stop')).toBe(true);
        expect(shown(p, R, 'Replay step')).toBe(true);
        expect(textOf(layer(p, R, 'Tally help').id)).toContain('Play your recording');
        await clickOn(player, p, R, 'Play my talk');
        await vi.waitFor(() => expect(heard.some((h) => h.src.startsWith('blob:take'))).toBe(true));
        await click(layer(p, R, 'To the model answer').id);
        await settle(player, 50);
        await click(layer(p, R, 'Save and next card').id);
        await settle(player, 100);
        expect(player.getVariable('stage')).toBe('draw');
        player.setVariable('stage', 'tally');
        await settle(player, 50);
        expect(shown(p, R, 'Replay step')).toBe(false);
        player.destroy();
      });

      it('timed talk: the clock running out stops a recording that is still going', async () => {
        const p = talk();
        const { host, player } = withHost(p);
        await tick(player);
        player.goTo(R);
        await tick(player);
        player.setVariable('talkSeconds', 1);
        await clickOn(player, p, R, 'Draw a card');
        await clickOn(player, p, R, 'Prepare button');
        await clickOn(player, p, R, 'Record this talk');
        //the talk countdown runs out while the take is still going
        await vi.waitFor(() => expect(player.getVariable('stage')).toBe('tally'), { timeout: 2500 });
        await settle(player, 150);
        expect(host.calls.some((c) => c.op === 'stop')).toBe(true);
        expect(shown(p, R, 'Replay step')).toBe(true);
        player.destroy();
      });

      it('timed talk: with the microphone denied the rehearsal is exactly as before and the record step stays away', async () => {
        const p = talk();
        const { host, player } = withHost(p, 'denied');
        await tick(player);
        player.goTo(R);
        await tick(player);
        expect(textOf(layer(p, R, 'Draw help').id)).toContain('Nothing is recorded here');
        await clickOn(player, p, R, 'Draw a card');
        await clickOn(player, p, R, 'Prepare button');
        expect(shown(p, R, 'Recording step')).toBe(false);
        await clickOn(player, p, R, 'Talk button');
        expect(player.getVariable('stage')).toBe('tally');
        expect(shown(p, R, 'Replay step')).toBe(false);
        expect(host.calls.filter((c) => c.op !== 'hello')).toEqual([]);
        player.destroy();
      });

      const F = 'Alex asks for more time';
      const convo = () => {
        const p = projectFromBrandedStarter(get('practice/difficult-conversation'), COLOURWAYS[0]);
        p.settings.sensors = { microphone: true, purpose: 'record your reply so you can play it back', maxSeconds: 90 };
        return p;
      };

      it('difficult conversation: record the reply, play it in review beside the expert reply, and a retry drops it', async () => {
        const p = convo();
        expect(checkAccessibility(p).findings.filter((f) => f.check === 'sensors')).toEqual([]);
        const { host, player } = withHost(p);
        await tick(player);
        player.goTo(F);
        await tick(player);
        expect(shown(p, F, 'Recording step')).toBe(true);
        expect(shown(p, F, 'Play mine')).toBe(false);
        expect(textOf(layer(p, F, 'Reply help').id)).toContain('You can record yourself and play it back');
        await clickOn(player, p, F, 'Record my reply');
        await clickOn(player, p, F, 'Record my reply');
        expect(host.calls.find((c) => c.op === 'start')!.args).toMatchObject({ slot: 'reply' });
        expect(shown(p, F, 'Play mine')).toBe(true);
        await clickOn(player, p, F, 'Play mine');
        await vi.waitFor(() => expect(heard.some((h) => h.src.startsWith('blob:take'))).toBe(true));
        //one button: it says Stop while the take plays
        await vi.waitFor(() => (player.step(50), expect(textOf(layer(p, F, 'Play mine').id)).toBe('Stop')));
        await flush(80);
        expect(shown(p, F, 'Play my recording')).toBe(false);
        await clickOn(player, p, F, 'Compare with the expert');
        expect(player.getVariable('stage')).toBe('review');
        expect(shown(p, F, 'Play my recording')).toBe(true);
        heard = [];
        await clickOn(player, p, F, 'Play my recording');
        await vi.waitFor(() => expect(heard.some((h) => h.src.startsWith('blob:take'))).toBe(true));
        await clickOn(player, p, F, 'Try this scene again', 150);
        expect(player.getVariable('stage')).toBe('reply');
        expect(shown(p, F, 'Play mine')).toBe(false);
        expect(shown(p, F, 'Play my recording')).toBe(false);
        player.destroy();
      });

      it('difficult conversation: the next scene opens without the last scene\'s take, and the ending says a recording stayed on the device', async () => {
        const p = convo();
        const { player } = withHost(p);
        await tick(player);
        player.goTo(F);
        await tick(player);
        await clickOn(player, p, F, 'Record my reply');
        await clickOn(player, p, F, 'Record my reply');
        await clickOn(player, p, F, 'Compare with the expert');
        await clickOn(player, p, F, 'It calms them', 200);
        expect(player.artboard.name).toBe('Alex, a little calmer');
        expect(shown(p, 'Alex, a little calmer', 'Play mine')).toBe(false);
        expect(textOf(layer(p, 'Alex, a little calmer', 'Record status').id)).toBe('Optional. Not recorded.');
        player.goTo('Ending');
        await tick(player);
        expect(textOf(layer(p, 'Ending', 'Rehearsal note').id)).toContain('Any recording you made stayed on this device and is gone');
        player.destroy();
      });

      it('difficult conversation: with nothing declared the ending says only that nothing was saved, and the step never shows', async () => {
        const p = projectFromBrandedStarter(get('practice/difficult-conversation'), COLOURWAYS[0]);
        const player = play(p);
        await settle(player, 100);
        player.goTo(F);
        await settle(player, 100);
        expect(shown(p, F, 'Recording step')).toBe(false);
        expect(textOf(layer(p, F, 'Reply help').id)).toContain('Nothing is recorded.');
        player.goTo('Ending');
        await settle(player, 100);
        expect(textOf(layer(p, 'Ending', 'Rehearsal note').id)).toBe('This was rehearsal. Nothing here was marked, saved or sent to anyone.');
        player.destroy();
      });
    });
  });
});
