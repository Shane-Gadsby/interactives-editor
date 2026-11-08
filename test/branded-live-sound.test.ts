//The live sound lab starter: a loudness meter with a target band and eight frequency bars, both driven by micLevel and micBands while the
//learner listens and by the slider (simLevel, simPitch) otherwise. Run through the real Player on the pretend microphone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMediaHost, Player, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/media';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { checkAccessibility } from '../src/lib/a11y/checks';

const starter = STARTERS.find((s) => s.key === 'media/live-sound-lab')!;
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const METER = 'How loud am I?';
const BARS = 'Which sounds are high, which are low?';

describe('live sound lab', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    //The timers are the player's own and the pretend microphone's, so they are the ones faked and stepped by hand (and the clock, which a steady timer keeps time by)
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date', 'performance'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const open = async (behaviour: 'works' | 'denied' | 'off' | 'no-device' = 'works') => {
    const p = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const host = new FakeMediaHost({ declaration: p.settings.sensors, behaviour });
    const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(p)), { loadData: false, media: host });
    const settle = async (ms = 300) => {
      for (let t = 0; t < ms; t += 50) {
        player.step(50);
        await flush(50);
      }
    };
    const click = async (id: string) => {
      el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
      await settle(60);
    };
    await settle(100);
    await click(layer(p, 'Live sound lab', 'Start').id);
    await settle();
    return { p, host, player, settle, click };
  };

  it('listens only: nothing it declares can record, and the consent screen is made from that', () => {
    const p = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    expect(p.settings.sensors).toMatchObject({ microphone: true, listen: true, listenOnly: true });
    expect(p.settings.sensors?.camera).toBeFalsy();
    expect(p.settings.sensors?.photos).toBeFalsy();
    expect(JSON.stringify(p.artboards)).not.toContain('action.recordStart');
    expect(JSON.stringify(p.artboards.map((a) => a.logic))).toContain('action.listen');
  });

  it('has two scenes after the hero page, each with a way on that does not need the microphone', () => {
    const p = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Live sound lab', METER, BARS]);
    expect(layer(p, METER, 'Practice level slider')).toMatchObject({ type: 'input', inputType: 'range' });
    expect(layer(p, BARS, 'Practice loudness slider')).toMatchObject({ type: 'input', inputType: 'range' });
    expect(layer(p, BARS, 'Practice pitch slider')).toMatchObject({ type: 'input', inputType: 'range' });
    const found = checkAccessibility(p).findings.filter((f) => f.check === 'sensors');
    expect(found).toEqual([]);
  });

  it('says rough guide on the noise check, and no decibels', async () => {
    const { p, player, click } = await open();
    await click(layer(p, METER, 'Noise check').id);
    const guide = textOf(layer(p, METER, 'Guide').id);
    expect(guide).toContain('rough guide');
    expect(guide).toContain('automatic gain');
    expect(guide).toContain('not decibels');
    player.destroy();
  });

  it('works the band edges and the loudest band out as live variables, so no timer polls for the peak and no step sets them', () => {
    const p = projectFromBrandedStarter(starter, COLOURWAYS[0]);
    const live = new Set(p.variables.filter((v) => v.live).map((v) => v.name));
    for (const name of ['bandLo', 'bandHi', 'peak']) expect(live.has(name), name).toBe(true);
    const ids = new Set(p.variables.filter((v) => v.live).map((v) => v.id));
    for (const ab of p.artboards) for (const n of ab.logic.nodes) if (n.kind === 'action.setVariable') expect(ids.has((n.params as { variable: string }).variable)).toBe(false);
    //the bars page has no timer at all; the meter page's one keeps time (steady)
    expect(board(p, BARS).logic.nodes.filter((n) => n.kind === 'event.timer')).toHaveLength(0);
    expect(board(p, METER).logic.nodes.filter((n) => n.kind === 'event.timer').map((n) => n.params.steady)).toEqual([true]);
  });

  it('the chosen mode is a pressed button', async () => {
    const { p, player, click } = await open('denied');
    const pressed = (name: string) => (el(layer(p, METER, name).id).querySelector('[aria-pressed]') ?? el(layer(p, METER, name).id)).getAttribute('aria-pressed');
    expect(pressed('Steady volume')).toBe('true');
    expect(pressed('Noise check')).toBe('false');
    await click(layer(p, METER, 'Noise check').id);
    expect(pressed('Noise check')).toBe('true');
    expect(pressed('Steady volume')).toBe('false');
    player.destroy();
  });

  describe('the loudness meter', () => {
    it('follows the slider with no microphone: the bar grows, and says in the band, too quiet or too loud', async () => {
      const { p, player, settle } = await open('denied');
      const level = layer(p, METER, 'Level').id;
      const status = layer(p, METER, 'Status').id;
      expect(textOf(status)).toContain('Start listening, or move the slider');
      player.setVariable('simLevel', 0.2);
      await settle(600);
      expect(el(level).getAttribute('role')).toBe('meter');
      expect(parseFloat((el(level).firstElementChild as HTMLElement).style.width)).toBeCloseTo(20, 0);
      expect(textOf(status)).toContain('A little louder');
      player.setVariable('simLevel', 0.5);
      await settle(600);
      expect(textOf(status)).toContain('In the band');
      player.setVariable('simLevel', 0.95);
      await settle(600);
      expect(textOf(status)).toContain('A little softer');
      player.destroy();
    });

    it('counts how long it has stayed in the band, and the best run', async () => {
      const { p, player, settle } = await open('denied');
      player.setVariable('simLevel', 0.5);
      await settle(1500);
      expect(player.getVariable('steady') as number).toBeGreaterThanOrEqual(1);
      player.setVariable('simLevel', 0.1);
      await settle(600);
      expect(player.getVariable('steady')).toBe(0);
      expect(player.getVariable('best') as number).toBeGreaterThanOrEqual(1);
      expect(textOf(layer(p, METER, 'Steady stats').id)).toContain('Best run:');
      player.destroy();
    });

    it('the noise check has a rough comfort line instead of a band, and no steady count', async () => {
      const { p, player, settle, click } = await open('denied');
      await click(layer(p, METER, 'Noise check').id);
      expect(player.getVariable('use')).toBe('noise');
      expect(player.getVariable('bandLo')).toBe(0);
      expect(player.getVariable('bandHi')).toBe(0.7);
      expect(el(layer(p, METER, 'Steady stats').id).style.display).toBe('none');
      player.setVariable('simLevel', 0.9);
      await settle(600);
      expect(textOf(layer(p, METER, 'Status').id)).toContain('Loud, for a rough guide');
      player.setVariable('simLevel', 0.3);
      await settle(600);
      expect(textOf(layer(p, METER, 'Status').id)).toContain('Comfortable, for a rough guide');
      await click(layer(p, METER, 'Steady volume').id);
      expect(player.getVariable('use')).toBe('steady');
      expect(player.getVariable('bandHi')).toBe(0.6);
      player.destroy();
    });

    it('listens with the microphone: the bar follows micLevel and the slider steps aside, and Stop puts it back', async () => {
      const { p, host, player, settle, click } = await open();
      //Start and Stop are one button
      const listen = layer(p, METER, 'Listen button').id;
      const slider = layer(p, METER, 'Practice level slider').id;
      expect(el(listen).style.display).not.toBe('none');
      expect(textOf(listen)).toBe('Start listening');
      await click(listen);
      expect(host.listening).toBe(true);
      await settle(400);
      const level = layer(p, METER, 'Level').id;
      expect(parseFloat((el(level).firstElementChild as HTMLElement).style.width)).toBeGreaterThan(0.5);
      expect(el(slider).style.display).toBe('none');
      expect(textOf(listen)).toBe('Stop listening');
      await click(listen);
      await settle(200);
      expect(host.listening).toBe(false);
      expect(el(slider).style.display).not.toBe('none');
      player.destroy();
    });

    it('a microphone that will not start leaves by Could not start, says why, and the slider still works', async () => {
      const { p, host, player, settle, click } = await open('denied');
      await click(layer(p, METER, 'Listen button').id);
      expect(host.listening).toBe(false);
      expect(textOf(layer(p, METER, 'Microphone message').id)).toContain('Use the slider instead');
      player.setVariable('simLevel', 0.5);
      await settle(600);
      expect(textOf(layer(p, METER, 'Status').id)).toContain('In the band');
      player.destroy();
    });

    it('hides Start when the learner chose not to use the microphone, and still has the slider', async () => {
      const { p, player } = await open('off');
      expect(el(layer(p, METER, 'Listen button').id).style.display).toBe('none');
      expect(el(layer(p, METER, 'Practice level slider').id).style.display).not.toBe('none');
      expect(textOf(layer(p, METER, 'Microphone message').id)).toContain('Use the slider instead');
      player.destroy();
    });

    it('the microphone is let go when the learner leaves the scene', async () => {
      const { p, host, player, settle, click } = await open();
      await click(layer(p, METER, 'Listen button').id);
      expect(host.listening).toBe(true);
      await click(layer(p, METER, 'Next scene').id);
      await settle();
      expect(player.artboard.name).toBe(BARS);
      expect(host.listening).toBe(false);
      player.destroy();
    });
  });

  describe('the frequency bars', () => {
    const goBars = async () => {
      const o = await open('denied');
      await o.click(layer(o.p, METER, 'Next scene').id);
      await o.settle();
      return o;
    };
    const barHeights = (id: string) => [...document.querySelectorAll<HTMLElement>(`[data-ix-id^="${id}~"]`)].map((e) => parseFloat(e.style.height));

    it('has eight bars, and the sliders move the loudest one up and down the row', async () => {
      const { p, player, settle } = await goBars();
      const bar = layer(p, BARS, 'Bar').id;
      expect(document.querySelectorAll(`[data-ix-id^="${bar}~"]`)).toHaveLength(8);
      for (const [pitch, band] of [[1, 1], [5, 5], [7, 7]] as const) {
        player.setVariable('simLevel', 0.8);
        player.setVariable('simPitch', pitch);
        await settle(600);
        const h = barHeights(bar);
        expect(h.indexOf(Math.max(...h)), `pitch ${pitch}`).toBe(band);
        expect(player.getVariable('peak')).toBe(band);
      }
      player.destroy();
    });

    it('says which band is loudest, in words, and nothing when it is quiet', async () => {
      const { p, player, settle } = await goBars();
      const readout = layer(p, BARS, 'Loudest band').id;
      expect(textOf(readout)).toContain('Make a sound');
      player.setVariable('simLevel', 0.8);
      player.setVariable('simPitch', 5);
      await settle(600);
      expect(textOf(readout)).toContain('1.4-2.5k Hz');
      expect(textOf(readout)).toContain('whistling');
      player.setVariable('simLevel', 0);
      await settle(600);
      expect(textOf(readout)).toContain('Make a sound');
      player.destroy();
    });

    it('listens with the microphone: the bars follow micBands', async () => {
      const o = await open();
      await o.click(layer(o.p, METER, 'Next scene').id);
      await o.settle();
      await o.click(layer(o.p, BARS, 'Listen button').id);
      expect(o.host.listening).toBe(true);
      await o.settle(500);
      const h = barHeights(layer(o.p, BARS, 'Bar').id);
      expect(Math.max(...h)).toBeGreaterThan(3);
      expect(o.player.getVariable('peak') as number).toBeGreaterThanOrEqual(0);
      o.player.destroy();
    });

    it('the challenge flips between the question and what to look for', async () => {
      const { p, player, click } = await goBars();
      const ask = layer(p, BARS, 'Challenge').id;
      expect(textOf(ask)).toContain('Which bar is loudest');
      await click(layer(p, BARS, 'Show or hide').id);
      expect(textOf(ask)).toContain('moves to the right');
      await click(layer(p, BARS, 'Show or hide').id);
      expect(textOf(ask)).toContain('Which bar is loudest');
      player.destroy();
    });

    it('back goes to the meter and start again goes to the first page', async () => {
      const { p, player, click, settle } = await goBars();
      await click(layer(p, BARS, 'Back to meter').id);
      await settle();
      expect(player.artboard.name).toBe(METER);
      await click(layer(p, METER, 'Next scene').id);
      await settle();
      await click(layer(p, BARS, 'Start again').id);
      await settle();
      expect(player.artboard.name).toBe('Live sound lab');
      player.destroy();
    });
  });
});
