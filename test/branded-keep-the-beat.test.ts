//The speaking and practice set of branded starters: each builds in every colourway, survives normalising, paints only with
//tokens and plays; Keep the beat is driven on a fake clock, tapping at exact moments, to check the scoring, the drift readout
//and the three ways of tapping.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { KEEP, PRESETS } from '../src/lib/branded/sets/practice/keep-the-beat';

const PRACTICE = BRANDED_STARTERS.filter((s) => s.key === 'practice/keep-the-beat');
const beat = PRACTICE.find((s) => s.key === 'practice/keep-the-beat')!;

let heard: { src: string }[] = [];
class FakeAudio {
  volume = 1;
  muted = false;
  loop = false;
  playbackRate = 1;
  duration = 0.05;
  constructor(public src: string) {
    heard.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {}
  addEventListener() {}
}

const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};

beforeEach(() => {
  heard = [];
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('Audio', FakeAudio);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_700_000_000_000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('the practice set', () => {
  it('lists Keep the beat, keyed practice/', () => {
    expect(PRACTICE.map((s) => s.key)).toContain('practice/keep-the-beat');
    for (const s of PRACTICE) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const way of COLOURWAYS) {
    it(`Keep the beat builds in ${way.name}, normalises, paints with tokens only and plays`, async () => {
      const { project, checklist } = beat.build(way);
      expect(project.themes!.default).toBe(`theme-${way.id}`);
      expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
      expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
      expect(JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]))).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      const ids = new Set<string>();
      for (const ab of project.artboards) walk(ab.children, (n: SceneNode) => void ids.add(n.id));
      expect(checklist.length).toBeGreaterThanOrEqual(6);
      for (const c of checklist) {
        if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
        if (c.artboardId) expect(project.artboards.some((a) => a.id === c.artboardId)).toBe(true);
        expect(c.text).not.toMatch(/—/);
      }
      for (const ab of project.artboards) {
        const have = new Set(ab.logic.nodes.map((n) => n.id));
        for (const e of ab.logic.edges) expect(have.has(e.from) && have.has(e.to)).toBe(true);
      }
      const assets = new Set(project.assets.map((a) => a.id));
      for (const ab of project.artboards) for (const n of ab.logic.nodes) if (n.kind === 'action.sound') expect(assets.has(String(n.params.asset))).toBe(true);
      const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const player = new Player(document.getElementById('stage')!, JSON.parse(JSON.stringify(project)), { loadData: false });
      for (const ab of project.artboards) {
        player.goTo(ab.id);
        await vi.advanceTimersByTimeAsync(100);
      }
      expect(err).not.toHaveBeenCalled();
      err.mockRestore();
      player.destroy?.();
    });
  }
});

describe('Keep the beat', () => {
  let player: Player;
  let project: Project;
  const page = (name: string) => project.artboards.find((a) => a.name === name)!;
  const id = (pg: string, name: string) => {
    const n = byName(page(pg), name);
    if (!n) throw new Error(`no layer ${name} on ${pg}`);
    return n.id;
  };
  const click = async (pg: string, name: string) => {
    must(id(pg, name)).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await vi.advanceTimersByTimeAsync(1);
    player.step(1);
  };
  const press = (type: string, target: Element | Window) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10, button: 0 });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    Object.defineProperty(e, 'pointerType', { value: 'touch' });
    target.dispatchEvent(e);
  };
  const at = async (t: number) => {
    await vi.advanceTimersByTimeAsync(Math.max(0, t - Date.now()));
  };
  const tapAt = async (t: number, how: 'screen' | 'space' | 'pad' = 'screen') => {
    await at(t);
    if (how === 'space') window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }));
    else if (how === 'pad') must(id('Drill', 'Tap pad')).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
    else press('pointerdown', must(id('Drill', 'Tap pad')));
    await vi.advanceTimersByTimeAsync(1);
  };
  const v = (name: string) => player.getVariable(name);

  /** Open the drill (0 music, 1 compression pace, 2 speak) and press Start. Returns when beat 0 sounds and the period. */
  const begin = async (drill = 0) => {
    project = JSON.parse(JSON.stringify(projectFromBrandedStarter(beat, COLOURWAYS[0])));
    player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await click('Start', 'Start button');
    expect(player.artboard.name).toBe('Pick a drill');
    await click('Pick a drill', `Choose drill ${drill + 1}`);
    expect(player.artboard.name).toBe('Drill');
    await click('Drill', 'Start button');
    const startAt = Number(v('startAt'));
    const period = Number(v('period'));
    return { startAt, period, lead: Number(v('lead')), tol: Number(v('tol')) };
  };
  const finish = async (t: number) => {
    await at(t);
    await vi.advanceTimersByTimeAsync(1500);
    player.step(1);
  };

  it('keeps everything inside the content box of its page, clear of the footer', () => {
    const p = projectFromBrandedStarter(beat, COLOURWAYS[0]);
    for (const pg of p.artboards.slice(1)) {
      for (const n of pg.children) {
        if ((n as { tags?: string[] }).tags?.includes('brand-chrome') || ['Page title', 'Footer text'].includes(n.name)) continue;
        expect(n.x, `${pg.name}: ${n.name}`).toBeGreaterThanOrEqual(48);
        expect(n.x + n.width, `${pg.name}: ${n.name}`).toBeLessThanOrEqual(1024 - 48 + 0.5);
        expect(n.y, `${pg.name}: ${n.name}`).toBeGreaterThanOrEqual(114);
        expect(n.y + n.height, `${pg.name}: ${n.name}`).toBeLessThanOrEqual(640 - 44 - 16 + 0.5);
      }
    }
  });

  it('opens on the drills, each with its own tempo, tolerance and wording (the compression pace says rhythm practice only)', async () => {
    project = JSON.parse(JSON.stringify(projectFromBrandedStarter(beat, COLOURWAYS[0])));
    player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await click('Start', 'Start button');
    expect(project.artboards.map((a) => a.name)).toEqual(['Start', 'Pick a drill', 'Drill', 'Results']);
    const text = document.body.textContent ?? '';
    for (const p of PRESETS) expect(text).toContain(p.name);
    expect(text).toContain('Rhythm practice only');
    expect(text).toContain('100 to 120 beats a minute');
    const cpr = PRESETS[1];
    expect(cpr.min).toBe(100);
    expect(cpr.max).toBe(120);
    expect(cpr.bpm).toBeGreaterThanOrEqual(100);
    expect(cpr.bpm).toBeLessThanOrEqual(120);
    player.destroy?.();
  });

  it('plays the lead-in beats with an accent every fourth, flashes the pulse, then the click drops out', async () => {
    const { startAt, period, lead } = await begin(0);
    expect(v('phase')).toBe('lead');
    expect(heard).toHaveLength(0);
    await at(startAt + 40);
    expect(heard).toHaveLength(1);
    expect(v('flash')).toBe(true);
    await at(startAt + 220);
    expect(v('flash')).toBe(false);
    await at(startAt + lead * period - 10);
    expect(heard).toHaveLength(lead);
    expect(v('phase')).toBe('lead');
    //the beat after the lead-in is the learner's: silent, no flash, and the phase has moved on
    await at(startAt + lead * period + 40);
    expect(v('phase')).toBe('keep');
    expect(heard).toHaveLength(lead);
    expect(v('flash')).toBe(false);
    player.destroy?.();
  });

  it('a perfect player lands every beat: all green, 100%, a full streak, steady tempo, then the results', async () => {
    const { startAt, period, lead } = await begin(0);
    for (let i = 0; i < KEEP; i++) await tapAt(startAt + (lead + i) * period);
    expect(v('marks')).toEqual(Array.from({ length: KEEP }, () => 'hit'));
    expect(v('hits')).toBe(KEEP);
    expect(v('streak')).toBe(KEEP);
    expect(String(v('driftText'))).toContain('steady');
    await finish(startAt + (lead + KEEP) * period);
    expect(player.artboard.name).toBe('Results');
    expect(v('accuracy')).toBe(100);
    expect(v('best')).toBe(KEEP);
    expect(document.body.textContent).toContain('Goal reached');
    expect(document.body.textContent).toContain('16 of 16 beats');
    player.destroy?.();
  });

  it('keeps the click quiet for the learner by default and sounding on every beat with the guide pulse on', async () => {
    let r = await begin(0);
    await at(r.startAt + (r.lead + KEEP) * r.period);
    expect(heard).toHaveLength(r.lead);
    player.destroy?.();
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    heard = [];
    project = JSON.parse(JSON.stringify(projectFromBrandedStarter(beat, COLOURWAYS[0])));
    player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await click('Start', 'Start button');
    await click('Pick a drill', 'Choose drill 1');
    await click('Drill', 'Guide switch');
    expect(v('guide')).toBe(true);
    await click('Drill', 'Start button');
    r = { startAt: Number(v('startAt')), period: Number(v('period')), lead: Number(v('lead')), tol: Number(v('tol')) };
    await at(r.startAt + (r.lead + 4) * r.period + 10);
    expect(heard).toHaveLength(r.lead + 5);
    player.destroy?.();
  });

  it('a player who is a little fast gets a plain reading of how fast, in beats a minute', async () => {
    const { startAt, period, lead } = await begin(0);
    //6 per cent too quick: 40 ms a beat at 90 a minute, about 6 beats a minute
    for (let i = 0; i < 5; i++) await tapAt(startAt + lead * period + i * period * 0.94);
    expect(Number(v('hits'))).toBeGreaterThanOrEqual(4);
    expect(String(v('driftText'))).toMatch(/drifted about [5-7] beats a minute fast/);
    expect(Number(v('drift'))).toBeGreaterThan(0);
    player.destroy?.();
  });

  it('a player who is a little slow is told slow', async () => {
    const { startAt, period, lead } = await begin(0);
    for (let i = 0; i < 5; i++) await tapAt(startAt + lead * period + i * period * 1.06);
    expect(String(v('driftText'))).toMatch(/drifted about [5-7] beats a minute slow/);
    expect(Number(v('drift'))).toBeLessThan(0);
    player.destroy?.();
  });

  it('a tap outside the window is a stray one and ends the streak; a beat nobody taps turns red', async () => {
    const { startAt, period, lead, tol } = await begin(0);
    await tapAt(startAt + lead * period);
    await tapAt(startAt + (lead + 1) * period);
    expect(v('streak')).toBe(2);
    //just outside the window for beat 2
    await tapAt(startAt + (lead + 2) * period + tol + 30);
    expect(v('stray')).toBe(1);
    expect(v('streak')).toBe(0);
    expect(String(v('lastTap'))).toContain('missed the beat window');
    await at(startAt + (lead + 2) * period + tol + 80);
    expect((v('marks') as string[]).slice(0, 3)).toEqual(['hit', 'hit', 'miss']);
    player.destroy?.();
  });

  it('taps during the lead-in are free practice: they do not count against you', async () => {
    const { startAt, period } = await begin(0);
    await tapAt(startAt + 2 * period + 200);
    await tapAt(startAt + 3 * period + 100);
    expect(v('stray')).toBe(0);
    expect(v('streak')).toBe(0);
    expect(v('hits')).toBe(0);
    player.destroy?.();
  });

  it('with no taps at all every beat is missed, and the results say 0%', async () => {
    const { startAt, period, lead } = await begin(0);
    await finish(startAt + (lead + KEEP) * period);
    expect(player.artboard.name).toBe('Results');
    expect(v('accuracy')).toBe(0);
    expect(v('hits')).toBe(0);
    expect(document.body.textContent).toContain('Not yet');
    await click('Results', 'Try again button');
    expect(player.artboard.name).toBe('Drill');
    expect(v('phase')).toBe('idle');
    player.destroy?.();
  });

  it('the Space bar and the big button (from the keyboard) tap too, and one press arriving twice counts once', async () => {
    const { startAt, period, lead } = await begin(0);
    await tapAt(startAt + lead * period, 'space');
    await tapAt(startAt + (lead + 1) * period, 'pad');
    expect(v('hits')).toBe(2);
    //a mouse press is a pointerdown and then a click a few ms later: one tap
    const t = startAt + (lead + 2) * period;
    await at(t);
    press('pointerdown', must(id('Drill', 'Tap pad')));
    await vi.advanceTimersByTimeAsync(8);
    must(id('Drill', 'Tap pad')).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    await vi.advanceTimersByTimeAsync(1);
    expect(v('hits')).toBe(3);
    expect(v('stray')).toBe(0);
    player.destroy?.();
  });

  it('the compression pace stays between 100 and 120 beats a minute whichever way the buttons are pressed', async () => {
    project = JSON.parse(JSON.stringify(projectFromBrandedStarter(beat, COLOURWAYS[0])));
    player = new Player(document.getElementById('stage')!, project, { loadData: false });
    await click('Start', 'Start button');
    await click('Pick a drill', 'Choose drill 2');
    expect(v('bpm')).toBe(PRESETS[1].bpm);
    for (let i = 0; i < 8; i++) await click('Drill', 'Faster button');
    expect(v('bpm')).toBe(120);
    for (let i = 0; i < 8; i++) await click('Drill', 'Slower button');
    expect(v('bpm')).toBe(100);
    expect(document.body.textContent).toContain('Rhythm practice only');
    await click('Drill', 'Start button');
    expect(Number(v('period'))).toBeCloseTo(600, 5);
    player.destroy?.();
  });

  it('the speak-to-the-beat drill shows the word for each beat', async () => {
    const { startAt, period, lead } = await begin(2);
    const words = PRESETS[2].script.split(' ');
    expect(words).toHaveLength(KEEP);
    await at(startAt + (lead + 3) * period + 20);
    player.step(1);
    expect(document.body.textContent).toContain(words[3]);
    player.destroy?.();
  });

  it('Stop ends the run and the click', async () => {
    const { startAt, period } = await begin(0);
    await at(startAt + period + 10);
    await click('Drill', 'Stop button');
    expect(v('phase')).toBe('idle');
    expect(v('flash')).toBe(false);
    const n = heard.length;
    await at(startAt + 4 * period);
    expect(heard).toHaveLength(n);
    player.destroy?.();
  });

  it('the pulse only changes colour, and grows a little unless the viewer has asked for less motion', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const { startAt } = await begin(0);
    await at(startAt + 20);
    player.step(1);
    const size = () => must(id('Drill', 'Pulse')).style.width;
    expect(v('flash')).toBe(true);
    expect(size()).toBe('148px');
    player.destroy?.();
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    const r = await begin(0);
    await at(r.startAt + 20);
    player.step(1);
    expect(size()).toBe('172px');
    player.destroy?.();
  });
});
