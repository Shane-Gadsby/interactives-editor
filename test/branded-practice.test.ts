//The practice set of branded starters (speaking and rehearsal): each builds in every colourway, normalises, paints only with tokens,
//plays under jsdom without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
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
    expect(STARTERS.map((s) => s.key)).toEqual(['practice/difficult-conversation', 'practice/timed-talk-rehearsal', 'practice/keep-the-beat']);
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
        const { project } = starter.build(COLOURWAYS[0]);
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
      });

      //Keep the beat records nothing, so only the rehearsals carry a slot
      it.skipIf(starter.key === 'practice/keep-the-beat')('has a checklist item that marks the recording slot for the media bridge', () => {
        const { project, checklist } = starter.build(COLOURWAYS[0]);
        expect(checklist.some((c) => /recording/i.test(c.text) && /media bridge/i.test(c.text))).toBe(true);
        const slots: SceneNode[] = [];
        for (const ab of project.artboards) walk(ab.children, (n) => /slot \(media bridge\)/.test(n.name) && slots.push(n));
        expect(slots.length).toBeGreaterThan(0);
        //hidden, so learners never see an empty box, and nothing records
        for (const s of slots) expect(s.visible).toBe(false);
        expect(JSON.stringify(project)).not.toMatch(/getUserMedia|MediaRecorder|action\.record"/);
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
      expect(all).toMatch(/Nothing here was marked, recorded or sent/);
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

    it('the preparation clock runs out into the talk, and the talk clock runs out into the tally', async () => {
      const p = project();
      const player = await open(p);
      await draw(p, player);
      player.setVariable('left', 1);
      await flush(1150);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('talk');
      expect(player.getVariable('left')).toBe(60);
      expect(shown(p, R, 'Talk stage')).toBe(true);
      expect(textOf(layer(p, R, 'Talk clock').id)).toMatch(/^(1:00|0:5\d)$/);
      player.setVariable('left', 1);
      await flush(1150);
      await settle(player, 50);
      expect(player.getVariable('stage')).toBe('tally');
      expect(shown(p, R, 'Tally stage')).toBe(true);
      player.destroy();
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
      expect(shown(p, R, 'Prepare track')).toBe(false);
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
});
