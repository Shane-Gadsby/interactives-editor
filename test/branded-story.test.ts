import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, type Artboard, type Project, type SceneNode, type TextNode } from 'interactives-player';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { BRANDED_STARTERS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';

const STORY = BRANDED_STARTERS.filter((s) => s.set === 'story');
const flush = () => new Promise((r) => setTimeout(r, 0));

const stage = () => document.getElementById('stage')!;
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => byName(board(p, page), name)!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';

describe('branded story starters', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
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
  const press = async (key: string) => {
    //a browser's key event has a code as well as a key (layer shortcuts match on it)
    window.dispatchEvent(new KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }));
    await flush();
  };
  const settle = async (player: Player, ms = 400) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };

  it('has the five starters, keyed under story/', () => {
    expect(STORY.map((s) => s.key)).toEqual(['story/branching-scenario', 'story/course-presentation', 'story/memory-game', 'story/video-questions', 'story/interactive-book']);
  });

  for (const starter of STORY) {
    describe(starter.name, () => {
      it('builds in every colourway, normalises, paints with tokens only and has a checklist', () => {
        for (const way of COLOURWAYS) {
          const project = projectFromBrandedStarter(starter, way);
          expect(project.artboards.length).toBeGreaterThanOrEqual(3);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.template!.checklist.length).toBeGreaterThan(2);
          for (const c of project.template!.checklist) {
            if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
          }
          for (const ab of project.artboards) expect(JSON.stringify([ab.children, ab.background])).not.toMatch(/"#[0-9a-f]{3,8}"/i);
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
        }
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
    });
  }

  describe('branching scenario', () => {
    const project = () => projectFromBrandedStarter(STORY[0], COLOURWAYS[0]);
    //the choices are a repeater, so a choice is the copy of the Choice button at its place
    const choose = (p: Project, page: string, i: number) => click(`${layer(p, page, 'Choice').id}~${i}`);

    it('a choice goes to its consequence, which offers choices of its own, and the ending comes from the score', async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      expect(player.artboard.name).toBe('The group assignment');
      await click(layer(p, 'The group assignment', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Tuesday: a quiet group');
      expect(textOf(layer(p, 'Tuesday: a quiet group', 'Path so far').id)).toContain('just starting');
      //choice 1 (ask Sam) is three points and goes to Sam's reply
      await choose(p, 'Tuesday: a quiet group', 0);
      await settle(player);
      expect(player.artboard.name).toBe('Sam replies');
      expect(player.getVariable('score')).toBe(3);
      expect(textOf(layer(p, 'Sam replies', 'Path so far').id)).toContain('Asked Sam');
      //the consequence page has two choices of its own
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, 'Sam replies', 'Choice').id}~"]`)).toHaveLength(2);
      await choose(p, 'Sam replies', 0);
      await settle(player);
      expect(player.getVariable('score')).toBe(6);
      expect(player.getVariable('path')).toBe('Asked Sam > Set a checkpoint');
      expect(player.artboard.name).toBe('Ending: strong');
      expect(textOf(layer(p, 'Ending: strong', 'Result').id)).toContain('Rating: Excellent');
      expect(textOf(layer(p, 'Ending: strong', 'Result').id)).toContain('Score: 6 out of 6');
      expect(textOf(layer(p, 'Ending: strong', 'Your path').id)).toContain('Asked Sam > Set a checkpoint');
      //start again goes back to the first page with the score cleared
      await click(layer(p, 'Ending: strong', 'Start again').id);
      await settle(player);
      expect(player.artboard.name).toBe('The group assignment');
      expect(player.getVariable('score')).toBe(0);
      player.destroy();
    });

    it('the longest route goes three levels deep and a poor path ends in the learning moment', async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      player.goTo(board(p, 'Tuesday: a quiet group').id);
      await settle(player);
      await choose(p, 'Tuesday: a quiet group', 1);
      await settle(player);
      expect(player.artboard.name).toBe('Wednesday night');
      await choose(p, 'Wednesday night', 1);
      await settle(player);
      expect(player.artboard.name).toBe('Thursday: the contribution statement');
      await choose(p, 'Thursday: the contribution statement', 1);
      await settle(player);
      expect(player.artboard.name).toBe('Ending: learning moment');
      expect(player.getVariable('score')).toBe(0);
      player.destroy();
    });
  });

  describe('course presentation', () => {
    const project = () => projectFromBrandedStarter(STORY[1], COLOURWAYS[0]);
    //the slide bar lives on each page's master: the id of its copy on a page is prefixed
    const masterOf = (p: Project, page: string) => p.artboards.find((a) => a.id === board(p, page).master)!;
    const bar = (p: Project, page: string, name: string) => byName(masterOf(p, page), name);
    const barId = (p: Project, page: string, name: string) => `ixm~${bar(p, page, name)!.id}`;

    it('has eight slides in the template order, each with its slide bar', () => {
      const p = project();
      expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Slide 1: Title', 'Slide 2: Acknowledgement of Country', 'Slide 3: Section', 'Slide 4: Content', 'Slide 5: Content', 'Slide 6: Question', 'Slide 7: Summary', 'Slide 8: End']);
      p.artboards.filter((a) => !a.isMaster).forEach((a, i) => {
        //on the page's master, not the page: wired once for every slide that draws it
        expect(byName(a, 'Slide counter')).toBeUndefined();
        expect(byName(a, 'Next')).toBeUndefined();
        expect((bar(p, a.name, 'Slide counter') as TextNode).text).toBe('Slide {pageNumber} of {pageCount}');
        expect(!!bar(p, a.name, 'Back')).toBe(i > 0);
      });
      //the slides share masters, so there are far fewer bars than slides
      expect(p.artboards.filter((a) => a.isMaster && byName(a, 'Slide counter'))).toHaveLength(4);
      expect((byName(p.artboards[1], 'Acknowledgement text') as TextNode).text).toContain('Traditional Custodians');
    });

    it('Next and Back move the slide, and so do the arrow keys', async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      await click(barId(p, 'Slide 1: Title', 'Next'));
      await settle(player);
      expect(player.artboard.name).toBe('Slide 2: Acknowledgement of Country');
      await click(barId(p, 'Slide 2: Acknowledgement of Country', 'Next'));
      await settle(player);
      expect(player.artboard.name).toBe('Slide 3: Section');
      await press('ArrowRight');
      await settle(player);
      expect(player.artboard.name).toBe('Slide 4: Content');
      await press('ArrowLeft');
      await settle(player);
      expect(player.artboard.name).toBe('Slide 3: Section');
      await click(barId(p, 'Slide 3: Section', 'Back'));
      await settle(player);
      expect(player.artboard.name).toBe('Slide 2: Acknowledgement of Country');
      //the last slide has no Next, only Start again
      player.goTo('Slide 8: End');
      await settle(player);
      expect(bar(p, 'Slide 8: End', 'Next')).toBeUndefined();
      await press('ArrowRight');
      await settle(player);
      expect(player.artboard.name).toBe('Slide 8: End');
      await click(barId(p, 'Slide 8: End', 'Start again'));
      await settle(player);
      expect(player.artboard.name).toBe('Slide 1: Title');
      player.destroy();
    });

    it('the question on slide 6 is a working question kit question', async () => {
      const p = project();
      const quiz = p.artboards[5];
      const frame = quiz.children.find((n) => n.type === 'frame' && 'question' in n && (n as { question?: unknown }).question) as SceneNode & { question: { prefix: string }; children: SceneNode[] };
      expect(frame).toBeTruthy();
      const part = (name: string) => frame.children.flatMap((c) => [c, ...(('children' in c ? c.children : []) as SceneNode[])]).find((n) => (n as { questionPart?: string }).questionPart?.split(':')[0] === name)!;
      const player = play(p);
      await settle(player, 100);
      player.goTo('Slide 6: Question');
      await settle(player);
      const pre = frame.question.prefix;
      expect(player.getVariable(`${pre}_prompt`)).toContain('best first step');
      await click(`${part('option').id}~1`);
      await click(part('check').id);
      expect(player.getVariable(`${pre}_correct`)).toBe(false);
      await click(`${part('option').id}~0`);
      await click(part('check').id);
      expect(player.getVariable(`${pre}_correct`)).toBe(true);
      //and Next still moves on from it
      await click(barId(p, 'Slide 6: Question', 'Next'));
      await settle(player);
      expect(player.artboard.name).toBe('Slide 7: Summary');
      player.destroy();
    });
  });

  describe('memory game', () => {
    const project = () => projectFromBrandedStarter(STORY[2], COLOURWAYS[0]);
    //The Wait nodes use real timers: make the long ones short so the test does not sit about
    beforeEach(() => {
      const real = globalThis.setTimeout;
      vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number, ...rest: unknown[]) => real(fn, ms && ms >= 500 ? 5 : ms, ...rest)) as typeof setTimeout);
    });
    type Card = { text: string; pair: number; state: string };
    const cardsOf = (player: Player) => player.getVariable('cards') as Card[];

    const start = async () => {
      const p = project();
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Match the terms', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Find the matching pairs');
      return { p, player, card: layer(p, 'Find the matching pairs', 'Card').id };
    };

    it('deals twelve face-down cards, six pairs, in a different order each time', async () => {
      const { player, card } = await start();
      const cards = cardsOf(player);
      expect(cards).toHaveLength(12);
      expect(cards.every((c) => c.state === 'down')).toBe(true);
      for (let pair = 0; pair < 6; pair++) expect(cards.filter((c) => c.pair === pair)).toHaveLength(2);
      expect(document.querySelectorAll(`[data-ix-id^="${card}~"]`)).toHaveLength(12);
      const orders = new Set<string>();
      for (let i = 0; i < 6; i++) {
        player.send('deal');
        await settle(player, 50);
        orders.add(cardsOf(player).map((c) => c.text).join('|'));
      }
      expect(orders.size).toBeGreaterThan(1);
      player.destroy();
    });

    it('two matching cards stay up, with a move and a pair counted', async () => {
      const { p, player, card } = await start();
      const cards = cardsOf(player);
      const a = cards.findIndex((c) => c.pair === 2);
      const b = cards.findIndex((c, i) => c.pair === 2 && i !== a);
      await click(`${card}~${a}`);
      expect(cardsOf(player)[a].state).toBe('up');
      expect(textOf(`${card}~${a}`)).toContain(cards[a].text);
      await click(`${card}~${b}`);
      await settle(player, 200);
      expect(cardsOf(player)[a].state).toBe('matched');
      expect(cardsOf(player)[b].state).toBe('matched');
      expect(player.getVariable('moves')).toBe(1);
      expect(player.getVariable('matched')).toBe(1);
      expect(textOf(layer(p, 'Find the matching pairs', 'Pairs found').id)).toBe('Pairs found: 1 of 6');
      //a matched card cannot be turned again
      await click(`${card}~${a}`);
      expect(player.getVariable('moves')).toBe(1);
      player.destroy();
    });

    it('two different cards flip back after a moment, and clicks in between are ignored', async () => {
      const { player, card } = await start();
      const cards = cardsOf(player);
      const a = 0;
      const b = cards.findIndex((c, i) => i !== a && c.pair !== cards[a].pair);
      const third = cards.findIndex((_, i) => i !== a && i !== b);
      await click(`${card}~${a}`);
      await click(`${card}~${b}`);
      expect(cardsOf(player)[a].state).toBe('up');
      expect(cardsOf(player)[b].state).toBe('up');
      await click(`${card}~${third}`);
      expect(cardsOf(player)[third].state).toBe('down');
      await settle(player, 100);
      expect(cardsOf(player).every((c) => c.state === 'down')).toBe(true);
      expect(player.getVariable('moves')).toBe(1);
      expect(player.getVariable('matched')).toBe(0);
      player.destroy();
    });

    it('finding every pair shows the finished page with the moves, and Play again deals again', async () => {
      const { p, player, card } = await start();
      for (let pair = 0; pair < 6; pair++) {
        const cards = cardsOf(player);
        const a = cards.findIndex((c) => c.pair === pair);
        const b = cards.findIndex((c, i) => c.pair === pair && i !== a);
        await click(`${card}~${a}`);
        await click(`${card}~${b}`);
        await settle(player, 100);
      }
      await settle(player, 100);
      expect(player.artboard.name).toBe('Finished');
      expect(textOf(layer(p, 'Finished', 'Result').id)).toBe('You matched all 6 pairs in 6 moves.');
      await click(layer(p, 'Finished', 'Play again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Find the matching pairs');
      expect(player.getVariable('moves')).toBe(0);
      expect(cardsOf(player).every((c) => c.state === 'down')).toBe(true);
      player.destroy();
    });

    it('cards are keyboard buttons with a label that follows their state', async () => {
      const { player, card } = await start();
      const e = el(`${card}~3`);
      expect(e.getAttribute('role')).toBe('button');
      expect(e.getAttribute('aria-label')).toBe('Card 4, face down');
      //the cards are one tab stop with the arrow keys between them
      const stops = [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${card}~"]`)].filter((c) => c.tabIndex >= 0);
      expect(stops).toHaveLength(1);
      stops[0].focus();
      stops[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await settle(player, 50);
      expect(document.activeElement).toBe(el(`${card}~1`));
      e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle(player, 100);
      expect(cardsOf(player)[3].state).toBe('up');
      expect(el(`${card}~3`).getAttribute('aria-label')).toBe(`Card 4: ${cardsOf(player)[3].text}`);
      player.destroy();
    });
  });

  describe('video with questions', () => {
    const project = () => projectFromBrandedStarter(STORY[3], COLOURWAYS[0]);

    /** jsdom can't play video: make the layer's <video> report what a playing one would. */
    const fakeVideo = (v: HTMLVideoElement, state: { t: number; paused: boolean; ended: boolean }) => {
      Object.defineProperties(v, {
        currentTime: { get: () => state.t, set: (x: number) => void (state.t = x), configurable: true },
        paused: { get: () => state.paused, configurable: true },
        ended: { get: () => state.ended, configurable: true },
        duration: { get: () => 90, configurable: true },
        readyState: { get: () => 4, configurable: true },
      });
      v.play = () => {
        state.paused = false;
        return Promise.resolve();
      };
      v.pause = () => void (state.paused = true);
    };

    const open = async (src = '') => {
      const p = project();
      const watch = board(p, 'Watch and answer');
      if (src) (byName(watch, 'Video') as unknown as { src: string }).src = src;
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Learn from video', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe('Watch and answer');
      const state = { t: 0, paused: true, ended: false };
      fakeVideo(el(layer(p, 'Watch and answer', 'Video').id).querySelector('video')!, state);
      player.step(16);
      const frames = watch.children.filter((n) => 'question' in n && (n as { question?: unknown }).question) as unknown as (SceneNode & { question: { prefix: string }; children: SceneNode[] })[];
      return { p, player, state, frames, watch };
    };
    const shown = (id: string) => el(id).style.display !== 'none';
    const part = (frame: { children: SceneNode[] }, name: string): SceneNode => {
      const all = (list: SceneNode[]): SceneNode[] => list.flatMap((c) => [c, ...all((('children' in c ? c.children : []) as SceneNode[]))]);
      return all(frame.children).find((n) => (n as { questionPart?: string }).questionPart?.split(':')[0] === name)!;
    };

    it('says to choose a video until one is chosen, then the note goes away', async () => {
      const a = await open();
      //the video says so itself (its empty text), and stops once there is a source
      const empty = (a2: typeof a) => el(layer(a2.p, 'Watch and answer', 'Video').id).querySelector('.ix-video-empty');
      expect(empty(a)!.textContent).toContain('Choose a video');
      a.player.destroy();
      const b = await open('https://example.com/lecture.mp4');
      expect(empty(b)).toBeNull();
      b.player.destroy();
    });

    it('pauses at a question time and shows that question; answering and pressing Continue carries on', async () => {
      const { p, player, state, frames } = await open('https://example.com/lecture.mp4');
      expect(frames).toHaveLength(3);
      expect(frames.every((f) => !shown(f.id))).toBe(true);
      //playing, but not yet at the first question
      state.t = 12;
      state.paused = false;
      player.step(16);
      expect(player.getVariable('popup')).toBe(0);
      expect(state.paused).toBe(false);
      //the video passes the first question time
      state.t = 20.4;
      player.step(16);
      await settle(player, 50);
      expect(player.getVariable('popup')).toBe(1);
      expect(state.paused).toBe(true);
      expect(shown(frames[0].id)).toBe(true);
      expect(shown(frames[1].id)).toBe(false);
      //pressing play on the video's own controls does not get past it
      state.paused = false;
      player.step(16);
      await new Promise((r) => setTimeout(r, 80));
      await settle(player, 100);
      expect(state.paused).toBe(true);
      //Continue is not offered until the question is finished
      const cont = part(frames[0], 'buttons') as unknown as { children: SceneNode[] };
      const carry = cont.children.find((c) => c.name === 'Continue')!;
      expect(shown(carry.id)).toBe(false);
      const pre = frames[0].question.prefix;
      const opt = part(frames[0], 'option').id;
      const answer = player.getVariable(`${pre}_items`) as { text: string }[];
      await click(`${opt}~${answer.findIndex((i) => i.text === 'The abstract')}`);
      await click(part(frames[0], 'check').id);
      expect(player.getVariable(`${pre}_correct`)).toBe(true);
      await settle(player, 50);
      expect(shown(carry.id)).toBe(true);
      await click(carry.id);
      await settle(player, 50);
      await new Promise((r) => setTimeout(r, 80));
      await settle(player, 100);
      expect(player.getVariable('popup')).toBe(0);
      expect(player.getVariable('answered')).toBe(1);
      expect(state.paused).toBe(false);
      expect(shown(frames[0].id)).toBe(false);
      //the second question comes at its own time
      state.t = 46;
      player.step(16);
      await settle(player, 50);
      expect(player.getVariable('popup')).toBe(2);
      expect(shown(frames[1].id)).toBe(true);
      expect(textOf(layer(p, 'Watch and answer', 'Status').id)).toBe('Questions answered: 1 of 3');
      player.destroy();
    });

    it('a chapter seeks the video, and questions before that point are not asked again', async () => {
      const { p, player, state } = await open('https://example.com/lecture.mp4');
      const chapter = layer(p, 'Watch and answer', 'Chapter').id;
      expect(document.querySelectorAll(`[data-ix-id^="${chapter}~"]`)).toHaveLength(4);
      await click(`${chapter}~2`);
      player.step(16);
      await settle(player, 50);
      expect(state.t).toBe(50);
      await new Promise((r) => setTimeout(r, 80));
      await settle(player, 100);
      expect(state.paused).toBe(false);
      //jumping past the first two questions asks neither of them
      state.t = 50.2;
      player.step(16);
      expect(player.getVariable('popup')).toBe(0);
      expect(el(`${chapter}~2`).getAttribute('aria-label')).toContain('Read closely');
      //back to the start arms them all again: the first one is asked when the video reaches it
      await click(`${chapter}~0`);
      player.step(16);
      expect(state.t).toBe(0);
      state.t = 20.4;
      player.step(16);
      await settle(player, 50);
      expect(player.getVariable('popup')).toBe(1);
      player.destroy();
    });

    it('the end of the video goes to the summary, which shows the score and can watch again', async () => {
      const { p, player, state } = await open('https://example.com/lecture.mp4');
      state.t = 89.9;
      state.ended = true;
      state.paused = true;
      player.step(16);
      await settle(player, 150);
      expect(player.artboard.name).toBe('Summary');
      expect(textOf(layer(p, 'Summary', 'Score').id)).toBe('0 of 3');
      await click(layer(p, 'Summary', 'Watch again').id);
      await settle(player);
      expect(player.artboard.name).toBe('Watch and answer');
      expect(player.getVariable('popup')).toBe(0);
      player.destroy();
    });
  });
});
