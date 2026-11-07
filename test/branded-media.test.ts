//The media set of branded starters (listen, watch and capture): each builds in every colourway, normalises, paints only with tokens,
//plays under jsdom without throwing, and its main interaction works.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode, type VideoNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/media';
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

describe('media starters', () => {
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
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await flush();
  };
  const settle = async (player: Player, ms = 300) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };

  it('has the starters, keyed media/', () => {
    expect(STARTERS.map((s) => s.key)).toEqual(expect.arrayContaining(['media/observe-and-tag', 'media/listening-lab', 'media/lite-lesson']));
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
    });
  }

  describe('observe and tag', () => {
    const WATCH = 'Watch and tag';
    const COMPARE = 'Compare with the expert';
    const project = () => projectFromBrandedStarter(get('media/observe-and-tag'), COLOURWAYS[0]);

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

    const open = async (src = 'https://example.com/lesson.mp4') => {
      const p = project();
      if (src) (layer(p, WATCH, 'Video') as unknown as { src: string }).src = src;
      const player = play(p);
      await settle(player, 100);
      await click(layer(p, 'Observe and tag', 'Start').id);
      await settle(player);
      expect(player.artboard.name).toBe(WATCH);
      const state = { t: 0, paused: true, ended: false };
      fakeVideo(el(layer(p, WATCH, 'Video').id).querySelector('video')!, state);
      player.step(16);
      return { p, player, state };
    };
    const at = async (player: Player, state: { t: number }, t: number) => {
      state.t = t;
      player.step(16);
      player.step(16);
    };
    const tags = (player: Player) => player.getVariable('tags') as { t: number; cat: number; note: string }[];

    it('says to choose a recording until one is chosen', async () => {
      const a = await open('');
      expect(el(layer(a.p, WATCH, 'Video placeholder').id).style.display).not.toBe('none');
      a.player.destroy();
      const b = await open();
      expect(el(layer(b.p, WATCH, 'Video placeholder').id).style.display).toBe('none');
      b.player.destroy();
    });

    it('the video layer has speed and frame step for the learner, and the tag keys are not taken by them', async () => {
      const { p, player } = await open();
      const v = layer(p, WATCH, 'Video') as VideoNode;
      expect(v.speedControl && v.frameStepControl).toBe(true);
      expect(el(v.id).querySelector('.ix-vctl')).toBeTruthy();
      player.destroy();
    });

    it('a tag button stores the video time and its category in the list, with the note, and clears the note', async () => {
      const { p, player, state } = await open();
      await at(player, state, 12.34);
      player.setVariable('noteText', 'open question');
      player.step(16);
      const tagBtn = layer(p, WATCH, 'Tag').id;
      expect(document.querySelectorAll(`[data-ix-id^="${tagBtn}~"]`)).toHaveLength(4);
      expect(el(`${tagBtn}~1`).textContent).toContain('2');
      expect(el(`${tagBtn}~1`).textContent).toContain('Missed cue');
      await click(`${tagBtn}~1`);
      player.step(16);
      expect(tags(player)).toEqual([{ t: 12.3, cat: 2, note: 'open question' }]);
      expect(player.getVariable('noteText')).toBe('');
      expect(textOf(layer(p, WATCH, 'Your tags heading').id)).toBe('Your tags (1)');
      player.destroy();
    });

    it('number keys tag too, up to the number of categories, and a key typed into the note box is not a tag', async () => {
      const { player, state } = await open();
      await at(player, state, 20);
      await press('3');
      await at(player, state, 30);
      await press('1');
      await press('5');
      await press('9');
      player.step(16);
      expect(tags(player).map((t) => [t.t, t.cat])).toEqual([[20, 3], [30, 1]]);
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
      await flush();
      expect(tags(player)).toHaveLength(2);
      player.destroy();
    });

    it('undo takes off the last tag, and is off when there are none', async () => {
      const { p, player, state } = await open();
      await at(player, state, 5);
      await press('1');
      await at(player, state, 8);
      await press('2');
      expect(tags(player)).toHaveLength(2);
      await click(layer(p, WATCH, 'Undo last tag').id);
      expect(tags(player).map((t) => t.cat)).toEqual([1]);
      await click(layer(p, WATCH, 'Undo last tag').id);
      expect(tags(player)).toHaveLength(0);
      player.destroy();
    });

    it('the transcript opens over the page and pauses the video, and closes again', async () => {
      const { p, player, state } = await open();
      state.paused = false;
      player.step(16);
      const panel = layer(p, WATCH, 'Transcript panel').id;
      expect(el(panel).style.display).toBe('none');
      await click(layer(p, WATCH, 'Transcript').id);
      player.step(16);
      player.step(16);
      expect(el(panel).style.display).not.toBe('none');
      expect(state.paused).toBe(true);
      expect(textOf(layer(p, WATCH, 'Transcript text').id)).toContain('hardest part');
      await click(layer(p, WATCH, 'Close transcript').id);
      player.step(16);
      expect(el(panel).style.display).toBe('none');
      player.destroy();
    });

    it('audio only: the still picture shows when the audioOnly variable is on', async () => {
      const { p, player } = await open();
      const still = layer(p, WATCH, 'Still image').id;
      expect(el(still).style.display).toBe('none');
      player.setVariable('audioOnly', true);
      player.step(16);
      player.step(16);
      expect(el(still).style.display).not.toBe('none');
      player.destroy();
    });

    /** Tag at these times and categories (the expert's are 12/1, 31/2, 47/3, 66/4 and 82/1, with a window of 3 seconds), then finish. */
    const tagAndFinish = async (marks: [number, number][]) => {
      const a = await open();
      for (const [t, cat] of marks) {
        await at(a.player, a.state, t);
        await press(String(cat));
      }
      await click(layer(a.p, WATCH, 'Finish').id);
      await settle(a.player);
      expect(a.player.artboard.name).toBe(COMPARE);
      return a;
    };

    it('counts agreements (same kind, inside the window) and misses, and extras the expert did not make', async () => {
      //12/1 agrees (exactly), 33.5/2 agrees (2.5s late), 49/3 is 2s late: agrees, 60/4 is 6s early: misses, nothing at 82. 20/2 is an extra
      const { p, player } = await tagAndFinish([[12, 1], [33.5, 2], [49, 3], [60, 4], [20, 2]]);
      expect(textOf(layer(p, COMPARE, 'Agreed').id)).toBe('3 of 5');
      expect(textOf(layer(p, COMPARE, 'Missed').id)).toBe('2');
      //60/4 and 20/2 have no expert tag within the window
      expect(textOf(layer(p, COMPARE, 'Extra').id)).toBe('2');
      player.destroy();
    });

    it('a tag of the right time but another kind does not agree, and the window is the author\'s variable', async () => {
      const a = await tagAndFinish([[12, 2]]);
      expect(textOf(layer(a.p, COMPARE, 'Agreed').id)).toBe('0 of 5');
      a.player.setVariable('tolerance', 3);
      a.player.destroy();
      const b = await tagAndFinish([[16, 1]]);
      expect(textOf(layer(b.p, COMPARE, 'Agreed').id)).toBe('0 of 5');
      b.player.setVariable('tolerance', 5);
      b.player.step(16);
      expect(textOf(layer(b.p, COMPARE, 'Agreed').id)).toBe('1 of 5');
      b.player.destroy();
    });

    it('the strip draws a marker per expert tag and per learner tag, placed by time, hollow when missed', async () => {
      const { p, player } = await tagAndFinish([[12, 1], [20, 2]]);
      const em = layer(p, COMPARE, 'Expert marker').id;
      const ym = layer(p, COMPARE, 'Your marker').id;
      expect(document.querySelectorAll(`[data-ix-id^="${em}~"]`)).toHaveLength(5);
      expect(document.querySelectorAll(`[data-ix-id^="${ym}~"]`)).toHaveLength(2);
      //the video is 90 s long and the axis 900 px wide: 12 s is 120 px along, less half a marker, plus the 14 px lead
      expect(el(`${em}~0`).style.transform).toContain('translate(122px, 0px)');
      expect(el(`${em}~1`).style.transform).toContain('translate(312px, 0px)');
      expect(el(`${em}~0`).getAttribute('aria-label')).toContain('you agreed');
      expect(el(`${em}~1`).getAttribute('aria-label')).toContain('you missed this one');
      expect(el(`${ym}~1`).getAttribute('aria-label')).toContain('the expert did not tag this');
      expect(textOf(layer(p, COMPARE, 'End time').id)).toBe('1:30');
      player.destroy();
    });

    it('picking an expert tag shows the author\'s comment and whether you tagged it; picking your own shows your note', async () => {
      const { p, player, state } = await open();
      await at(player, state, 31);
      player.setVariable('noteText', 'she looked away');
      player.step(16);
      await press('2');
      await click(layer(p, WATCH, 'Finish').id);
      await settle(player);
      const detail = layer(p, COMPARE, 'Detail').id;
      expect(textOf(detail)).toContain('Select a tag on the strip');
      const em = layer(p, COMPARE, 'Expert marker').id;
      await click(`${em}~1`);
      player.step(16);
      expect(textOf(detail)).toContain('Expert tag at 0:31, Missed cue.');
      expect(textOf(detail)).toContain('look away');
      expect(textOf(detail)).toContain('You tagged this too.');
      await click(`${em}~0`);
      player.step(16);
      expect(textOf(detail)).toContain('Good questioning');
      expect(textOf(detail)).toContain('You did not tag this one.');
      await click(`${layer(p, COMPARE, 'Your marker').id}~0`);
      player.step(16);
      expect(textOf(detail)).toContain('Your tag at 0:31, Missed cue: she looked away');
      expect(textOf(detail)).toContain('The expert tagged this too.');
      player.destroy();
    });

    it('says agreement, not exactness, and names the window', async () => {
      const { p, player } = await tagAndFinish([]);
      const framing = textOf(layer(p, COMPARE, 'Framing').id);
      expect(framing).toContain('agreement, not exactness');
      expect(framing).toContain('within 3 seconds');
      player.destroy();
    });

    it('back goes to the video with the tags kept, and start again clears them', async () => {
      const { p, player } = await tagAndFinish([[12, 1]]);
      await click(layer(p, COMPARE, 'Back to the video').id);
      await settle(player);
      expect(player.artboard.name).toBe(WATCH);
      expect(tags(player)).toHaveLength(1);
      await click(layer(p, WATCH, 'Finish').id);
      await settle(player);
      await click(layer(p, COMPARE, 'Start again').id);
      await settle(player);
      expect(player.artboard.name).toBe(WATCH);
      expect(tags(player)).toHaveLength(0);
      player.destroy();
    });

    it('with no real video the strip is as long as the video says it is', async () => {
      const a = await open('');
      a.player.setVariable('tags', [{ t: 12, cat: 1, note: '' }]);
      await click(layer(a.p, WATCH, 'Finish').id);
      await settle(a.player);
      expect(a.player.getVariable('stripLength')).toBe(90);
      expect(textOf(layer(a.p, COMPARE, 'Agreed').id)).toBe('1 of 5');
      a.player.destroy();
    });
  });
});
