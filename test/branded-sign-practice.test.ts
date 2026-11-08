//Sign practice with self-review (practice set): the camera is declared and nothing else is, the receptive half and the no-camera route finish without a
//camera, the pages come in landscape and portrait sets with the same layer names, the model clip is one shared artboard driven by the page's buttons,
//and the whole walk (watch, choose, try, record, review, summary) runs against the pretend camera.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeMediaHost, Player, walk, type Artboard, type FakeBehaviour, type Project, type SceneNode, type VideoNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/practice';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { checkAccessibility, sensorRoutes } from '../src/lib/a11y/checks';

const starter = STARTERS.find((s) => s.key === 'practice/sign-practice')!;
//Under the fake clock a wait has to move it
const flush = (ms = 0): Promise<unknown> => (vi.isFakeTimers() ? vi.advanceTimersByTimeAsync(ms) : new Promise((r) => setTimeout(r, ms)));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const textOf = (id: string) => el(id)?.textContent ?? '';
const shown = (id: string) => !!el(id) && el(id).style.display !== 'none';
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layer = (p: Project, page: string, name: string): SceneNode => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n;
};
const PAGES = ['Sign practice', 'How this works', 'Watch and choose', 'Try the sign', 'Review your take', 'Your practice'];
const project = (way = COLOURWAYS[0]) => projectFromBrandedStarter(starter, way);

describe('sign practice', { timeout: 30000 }, () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    //jsdom has no media playback: play and pause just answer
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  let host: FakeMediaHost;
  const play = (p: Project, behaviour: FakeBehaviour = 'works') => new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false, media: (d) => (host = new FakeMediaHost({ declaration: d, behaviour })) });
  const click = async (id: string, ms = 0) => {
    const e = el(id);
    if (!e) throw new Error(`no layer ${id}`);
    e.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(ms);
  };
  const settle = async (player: Player, ms = 100) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };
  /** Open the project on a page by name and let it start. */
  const open = async (p: Project, page: string, behaviour: FakeBehaviour = 'works') => {
    const player = play(p, behaviour);
    await settle(player);
    player.goTo(board(p, page).id);
    await settle(player);
    expect(player.artboard.name).toBe(page);
    return player;
  };

  it('is in the practice set with a plain description', () => {
    expect(starter.set).toBe('practice');
    expect(starter.description).toMatch(/not feedback from a Deaf teacher/);
    expect(starter.description).not.toMatch(/—/);
  });

  it('declares the camera and nothing else, and keeps the take short', () => {
    const s = project().settings.sensors!;
    expect(s.camera).toBe(true);
    expect(s.microphone).toBeFalsy();
    expect(s.photos).toBeFalsy();
    expect(s.maxSeconds).toBe(30);
    expect(s.purpose!.length).toBeLessThanOrEqual(140);
  });

  it('every page is a responsive set: a portrait variant with the same layer names, shown from the breakpoint down', () => {
    for (const way of COLOURWAYS) {
      const p = project(way);
      for (const name of PAGES) {
        const base = board(p, name);
        const port = board(p, `${name} (portrait)`);
        expect(port.variantOf).toBe(base.id);
        expect(port.minWidth).toBe(0);
        expect(base.minWidth).toBe(560);
        expect(port.width).toBeLessThan(base.width);
        expect(port.height).toBeGreaterThan(port.width);
        const names = (ab: Artboard) => {
          const out: string[] = [];
          for (const n of ab.children) if (!n.name.startsWith('Header ')) out.push(n.name);
          return out.sort();
        };
        expect(names(port), name).toEqual(names(base));
      }
    }
  });

  it('keeps the model clips on one artboard, one Video layer per sign, and every page shows it as an instance', () => {
    const p = project();
    const clips = board(p, 'Model clips');
    const videos = clips.children.filter((n) => n.type === 'video') as VideoNode[];
    expect(videos).toHaveLength(5);
    for (const v of videos) {
      expect(v.speedControl && v.frameStepControl).toBe(true);
      expect(v.muted).toBe(true);
    }
    for (const name of ['Watch and choose', 'Try the sign', 'Review your take']) {
      for (const page of [name, `${name} (portrait)`]) {
        const inst = layer(p, page, 'Model clip') as unknown as { type: string; artboardId: string };
        expect(inst.type).toBe('instance');
        expect(inst.artboardId).toBe(clips.id);
      }
    }
  });

  it('finishes without the camera: a way to the summary never goes through a working sensor', () => {
    const p = project();
    const { finishes, free } = sensorRoutes(p);
    expect(finishes).toBeGreaterThan(0);
    expect(free).toBeGreaterThan(0);
    const sensors = checkAccessibility(p).findings.filter((f) => f.check === 'sensors');
    expect(sensors).toEqual([]);
  });

  it('has no accessibility issues in any colourway (warnings and reviews are the author\'s to look at)', () => {
    for (const way of COLOURWAYS) {
      const issues = checkAccessibility(project(way)).findings.filter((f) => f.severity === 'issue');
      expect(issues.map((f) => `${f.title}: ${f.detail}`), way.name).toEqual([]);
    }
  });

  it('says plainly it is practice and not feedback, on the first pages and the summary', () => {
    const p = project();
    const all = JSON.stringify([board(p, 'How this works').children, board(p, 'Your practice').children]);
    expect(all).toMatch(/not feedback/);
    expect(all).toMatch(/Deaf teacher/);
    expect(JSON.stringify(board(p, 'Sign practice').children)).toContain('Practise {language}');
  });

  it('has a checklist for signer consent, rights, the clips, the signs and the self-review list', () => {
    const { checklist } = starter.build(COLOURWAYS[0]);
    const text = checklist.map((c) => c.text).join('\n');
    expect(checklist.length).toBeGreaterThanOrEqual(10);
    for (const word of [/consent/i, /licence/i, /Model clips/, /"signs"/, /"selfReview"/, /camera/i, /portrait/i, /no-camera|without the camera/i]) expect(text).toMatch(word);
    expect(text).not.toMatch(/—/);
  });

  describe('Watch and choose, the half that needs no camera', () => {
    const W = 'Watch and choose';

    it('shows the placeholder for the sign in view and the clip layer for it only', async () => {
      const p = project();
      const player = await open(p, W);
      const inst = el(layer(p, W, 'Model clip').id);
      const videos = [...inst.querySelectorAll('video')];
      expect(videos).toHaveLength(5);
      expect(textOf(layer(p, W, 'Sign counter').id)).toBe('Sign 1 of 5');
      player.destroy();
    });

    it('half speed, normal speed and loop drive the video layers inside the instance', async () => {
      const p = project();
      const player = await open(p, W);
      const videos = [...el(layer(p, W, 'Model clip').id).querySelectorAll('video')] as HTMLVideoElement[];
      await click(layer(p, W, 'Half speed').id);
      await settle(player, 50);
      expect(player.getVariable('clipRate')).toBe(0.5);
      expect(videos.every((v) => v.playbackRate === 0.5)).toBe(true);
      await click(layer(p, W, 'Normal speed').id);
      await settle(player, 50);
      expect(videos.every((v) => v.playbackRate === 1)).toBe(true);
      await click(layer(p, W, 'Loop').id);
      await settle(player, 50);
      expect(player.getVariable('clipLoop')).toBe(true);
      expect(videos.every((v) => v.loop)).toBe(true);
      expect(textOf(layer(p, W, 'Loop').id)).toContain('Loop: on');
      player.destroy();
    });

    it('offers the right answer in a different place each time', async () => {
      const p = project();
      const player = await open(p, W);
      const seen = new Set<number>();
      for (let i = 0; i < 5; i++) {
        const choices = player.getVariable('choices') as string[];
        const meaning = (player.getVariable('signs') as { meaning: string }[])[i].meaning;
        expect(choices).toHaveLength(3);
        expect(new Set(choices).size).toBe(3);
        //The sign in view's own meaning is always one of them (choices once stayed on sign 1's)
        expect(choices).toContain(meaning);
        seen.add(choices.indexOf(meaning));
        if (i + 1 < 5) {
          await click(`${layer(p, W, 'Choice').id}~0`);
          await click(layer(p, W, 'Next').id, 300);
          await settle(player, 50);
          expect(player.getVariable('current')).toBe(i + 1);
        }
      }
      expect(seen.size).toBeGreaterThan(1);
      player.destroy();
    });

    it('a right choice is marked, counted once and the sign counts as practised', async () => {
      const p = project();
      const player = await open(p, W);
      const choices = player.getVariable('choices') as string[];
      const right = choices.indexOf('Thank you');
      expect(textOf(layer(p, W, 'Feedback').id)).toContain('Choose the meaning');
      expect(shown(layer(p, W, 'Next').id)).toBe(false);
      await click(`${layer(p, W, 'Choice').id}~${right}`);
      await settle(player, 50);
      expect(player.getVariable('answered')).toBe(true);
      expect(player.getVariable('rightCount')).toBe(1);
      expect(player.getVariable('practised')).toEqual([0]);
      expect(textOf(layer(p, W, 'Feedback').id)).toContain('that is right');
      expect(textOf(`${layer(p, W, 'Choice').id}~${right}`)).toContain('(correct)');
      //a second tap changes nothing
      await click(`${layer(p, W, 'Choice').id}~${(right + 1) % 3}`);
      await settle(player, 50);
      expect(player.getVariable('answeredCount')).toBe(1);
      expect(player.getVariable('picked')).toBe('Thank you');
      expect(shown(layer(p, W, 'Next').id)).toBe(true);
      player.destroy();
    });

    it('a wrong choice says what it meant, and Next walks through the signs, then on to signing', async () => {
      const p = project();
      const player = await open(p, W);
      for (let i = 0; i < 5; i++) {
        expect(player.getVariable('current')).toBe(i);
        const choices = player.getVariable('choices') as string[];
        const meaning = (player.getVariable('signs') as { meaning: string }[])[i].meaning;
        const wrong = choices.findIndex((c) => c !== meaning);
        await click(`${layer(p, W, 'Choice').id}~${wrong}`);
        await settle(player, 50);
        expect(textOf(layer(p, W, 'Feedback').id)).toContain(`The meaning is ${meaning}`);
        expect(textOf(layer(p, W, 'Next').id)).toContain(i < 4 ? 'Next sign' : 'Go to Part 2');
        await click(layer(p, W, 'Next').id, 300);
        await settle(player, 400);
      }
      expect(player.getVariable('rightCount')).toBe(0);
      expect(player.getVariable('answeredCount')).toBe(5);
      expect(player.artboard.name).toBe('Try the sign');
      expect(player.getVariable('current')).toBe(0);
      player.destroy();
    });

    it('Finish here, after the last sign, goes to a summary that needs no camera', async () => {
      const p = project();
      const player = await open(p, W);
      player.setVariable('current', 4);
      await settle(player, 50);
      expect(shown(layer(p, W, 'Finish here').id)).toBe(false);
      await click(`${layer(p, W, 'Choice').id}~0`);
      await settle(player, 50);
      expect(shown(layer(p, W, 'Finish here').id)).toBe(true);
      await click(layer(p, W, 'Finish here').id, 300);
      await settle(player, 400);
      expect(player.artboard.name).toBe('Your practice');
      expect(textOf(layer(p, 'Your practice', 'Headline').id)).toBe('You practised 1 sign.');
      expect(host.calls.some((c) => c.op === 'preview' || c.op === 'start')).toBe(false);
      player.destroy();
    });

    it('works the same on the portrait page', async () => {
      const p = project();
      const PW = `${W} (portrait)`;
      const player = await open(p, PW);
      const right = (player.getVariable('choices') as string[]).indexOf('Thank you');
      await click(`${layer(p, PW, 'Choice').id}~${right}`);
      await settle(player, 50);
      expect(player.getVariable('rightCount')).toBe(1);
      expect(shown(layer(p, PW, 'Next').id)).toBe(true);
      await click(layer(p, PW, 'Next').id);
      await settle(player, 50);
      expect(player.getVariable('current')).toBe(1);
      expect(textOf(layer(p, PW, 'Sign counter').id)).toBe('Sign 2 of 5');
      player.destroy();
    });
  });

  describe('Sign and compare, the camera half', () => {
    const T = 'Try the sign';
    const R = 'Review your take';

    it('opens with the camera off and a plain line about privacy', async () => {
      const p = project();
      const player = await open(p, T);
      expect(player.getVariable('stage')).toBe('off');
      expect(shown(layer(p, T, 'Turn on camera').id)).toBe(true);
      expect(shown(layer(p, T, 'Start recording').id)).toBe(false);
      expect(textOf(layer(p, T, 'Status').id)).toContain('Nothing is uploaded or stored');
      expect(host.calls.some((c) => c.op === 'preview' && c.args.on === true)).toBe(false);
      player.destroy();
    });

    it('turn on, record, stop, review, tick, done: one take a sign, kept in memory, then the next sign', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
      try {
        const p = project();
        const player = await open(p, T);
        const step = async (ms = 20) => {
          await vi.advanceTimersByTimeAsync(ms);
          player.step(16);
        };
        await click(layer(p, T, 'Turn on camera').id);
        await step();
        expect(host.calls.find((c) => c.op === 'preview' && c.args.on === true)).toBeTruthy();
        expect(player.getVariable('stage')).toBe('live');
        expect(shown(layer(p, T, 'Start recording').id)).toBe(true);
        expect(shown(layer(p, T, 'Turn on camera').id)).toBe(false);
        await click(layer(p, T, 'Start recording').id);
        await step();
        const start = host.calls.find((c) => c.op === 'start')!;
        expect(start.args).toMatchObject({ slot: 'take', video: true });
        expect(start.args.audio).toBe(false);
        expect(player.getVariable('stage')).toBe('rec');
        await step(2000);
        expect(textOf(layer(p, T, 'Status').id)).toContain('Recording: ');
        await click(layer(p, T, 'Stop recording').id);
        await step(400);
        expect(player.artboard.name).toBe(R);
        expect(player.getVariable('stage')).toBe('off');
        //the take is there: the buttons for it work and the frame says it is ready
        expect(textOf(layer(p, R, 'Take note').id)).toContain('Your take is ready');
        await click(layer(p, R, 'Play both together').id);
        await step();
        expect(player.getVariable('clipPlaying')).toBe(true);
        expect(host.calls.some((c) => c.op === 'preview' && c.args.play === 'take')).toBe(true);
        await click(layer(p, R, 'Download my take').id);
        await step();
        expect(host.calls.some((c) => c.op === 'download' && c.args.slot === 'take')).toBe(true);
        //self-review: tick two lines
        const row = layer(p, R, 'Check row').id;
        expect(document.querySelectorAll(`[data-ix-id^="${row}~"]`)).toHaveLength(5);
        await click(`${row}~0`);
        await click(`${row}~2`);
        await step();
        expect(player.getVariable('ticked')).toEqual([0, 2]);
        await click(`${row}~0`);
        await step();
        expect(player.getVariable('ticked')).toEqual([2]);
        await click(layer(p, R, 'Done with this sign').id);
        await step(400);
        expect(player.getVariable('reviewLog')).toEqual([{ n: 1, sign: 'Thank you', ticked: 1, of: 5, take: true }]);
        expect(player.getVariable('practised')).toEqual([0]);
        expect(host.calls.some((c) => c.op === 'discard' && c.args.slot === 'take')).toBe(true);
        expect(player.getVariable('ticked')).toEqual([]);
        expect(player.getVariable('current')).toBe(1);
        expect(player.artboard.name).toBe(T);
        player.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('stopping from the recording bar the page draws ends up on the review page too', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
      try {
        const p = project();
        const player = await open(p, T);
        const step = async (ms = 20) => {
          await vi.advanceTimersByTimeAsync(ms);
          player.step(16);
        };
        await click(layer(p, T, 'Turn on camera').id);
        await step();
        await click(layer(p, T, 'Start recording').id);
        await step(1000);
        //the 30 second cap ends it by itself: the same "recording is ready" the bar's Stop gives
        await step(31000);
        expect(player.artboard.name).toBe(R);
        player.destroy();
      } finally {
        vi.useRealTimers();
      }
    });

    it('Record again throws the take away and goes back to try it', async () => {
      const p = project();
      const player = await open(p, R);
      await click(layer(p, R, 'Record again').id);
      await settle(player, 400);
      expect(host.calls.some((c) => c.op === 'discard' && c.args.slot === 'take')).toBe(true);
      expect(player.artboard.name).toBe(T);
      player.destroy();
    });

    it('with no take the take buttons are off and the frame says so, but the self-review and Done still work', async () => {
      const p = project();
      const player = await open(p, R);
      expect(textOf(layer(p, R, 'Take note').id)).toContain('No recording for this sign');
      for (const n of ['Play both together', 'Play my take', 'Download my take']) expect(el(layer(p, R, n).id).querySelector('button')!.disabled, n).toBe(true);
      await click(`${layer(p, R, 'Check row').id}~1`);
      await click(layer(p, R, 'Done with this sign').id, 300);
      await settle(player, 400);
      expect(player.getVariable('reviewLog')).toEqual([{ n: 1, sign: 'Thank you', ticked: 1, of: 5, take: false }]);
      player.destroy();
    });

    it('the last sign goes to the summary, which counts and offers the notes for a tutor', async () => {
      const p = project();
      const player = await open(p, R);
      for (let i = 0; i < 5; i++) {
        player.setVariable('current', i);
        await settle(player, 50);
        await click(layer(p, R, 'Done with this sign').id, 300);
        await settle(player, 400);
        if (i < 4) expect(player.artboard.name).toBe(T);
        if (i < 4) player.goTo(board(p, R).id);
        await settle(player, 100);
      }
      expect(player.artboard.name).toBe('Your practice');
      const S = 'Your practice';
      expect(textOf(layer(p, S, 'Headline').id)).toBe('You practised 5 signs.');
      expect(textOf(layer(p, S, 'Signs reviewed').id)).toBe('5 of 5');
      expect(textOf(layer(p, S, 'Takes').id)).toBe('0');
      expect(document.querySelectorAll(`[data-ix-id^="${layer(p, S, 'Practice row').id}~"]`)).toHaveLength(4);
      expect(textOf(layer(p, S, 'Tutor note').id)).toContain('not feedback from a Deaf teacher');
      await click(layer(p, S, 'Download my practice notes').id);
      await settle(player, 50);
      const saved = host.calls.find((c) => c.op === 'save')!;
      expect(saved.args).toMatchObject({ name: 'sign-practice-notes' });
      expect(String((saved.args as { text?: string }).text)).toContain('Signs practised: 5 of 5');
      expect(String((saved.args as { text?: string }).text)).toContain('not feedback from a teacher');
      //Practise again starts clean
      await click(layer(p, S, 'Practise again').id, 300);
      await settle(player, 400);
      expect(player.artboard.name).toBe(W_NAME);
      expect(player.getVariable('practised')).toEqual([]);
      expect(player.getVariable('reviewLog')).toEqual([]);
      player.destroy();
    });

    for (const behaviour of ['denied', 'no-device', 'blocked', 'off'] as FakeBehaviour[]) {
      it(`when the camera is ${behaviour}, it says why and Practise without the camera still gets to the review`, async () => {
        const p = project();
        const player = await open(p, T, behaviour);
        const status = textOf(layer(p, T, 'Status').id);
        expect(status).not.toContain('Nothing is uploaded');
        expect(status.length).toBeGreaterThan(20);
        if (behaviour !== 'off') {
          await click(layer(p, T, 'Turn on camera').id);
          await settle(player, 50);
          expect(player.getVariable('stage')).toBe('off');
          expect(host.calls.some((c) => c.op === 'start')).toBe(false);
        }
        await click(layer(p, T, 'No camera button').id, 300);
        await settle(player, 400);
        expect(player.artboard.name).toBe(R);
        expect(textOf(layer(p, R, 'Take note').id)).toContain('No recording for this sign');
        player.destroy();
      });
    }

    it('works on the portrait page: the camera frame and the take frame are there and the buttons find them', async () => {
      const p = project();
      const PT = `${T} (portrait)`;
      const player = await open(p, PT);
      await click(layer(p, PT, 'Turn on camera').id);
      await settle(player, 50);
      const on = host.calls.find((c) => c.op === 'preview' && c.args.on === true);
      expect(on).toBeTruthy();
      expect(player.getVariable('stage')).toBe('live');
      player.destroy();
    });
  });

  describe('How this works', () => {
    it('I will not use my camera is the learner\'s own choice, remembered by the page, then on to the part that needs no camera', async () => {
      const p = project();
      const player = await open(p, 'How this works');
      await click(layer(p, 'How this works', 'I will not use my camera').id, 300);
      await settle(player, 400);
      expect(host.calls.some((c) => c.op === 'optout')).toBe(true);
      expect(player.artboard.name).toBe(W_NAME);
      player.destroy();
    });

    it('both routes start a fresh walk', async () => {
      const p = project();
      const player = await open(p, 'How this works');
      player.setVariable('current', 3);
      await click(layer(p, 'How this works', 'Skip to signing').id, 300);
      await settle(player, 400);
      expect(player.artboard.name).toBe('Try the sign');
      expect(player.getVariable('current')).toBe(0);
      player.destroy();
    });
  });

  describe('the build', () => {
    it('builds in every colourway with unique ids and a checklist that points at real layers, on real pages', () => {
      for (const way of COLOURWAYS) {
        const p = project(way);
        const ids = new Set<string>();
        for (const ab of p.artboards) walk(ab.children, (n) => (expect(ids.has(n.id)).toBe(false), ids.add(n.id)));
        for (const c of p.template!.checklist) {
          if (c.nodeId) expect(ids.has(c.nodeId), c.text).toBe(true);
          if (c.artboardId) expect(p.artboards.some((a) => a.id === c.artboardId), c.text).toBe(true);
        }
        expect(p.settings.reporting?.completionArtboard).toBe(board(p, 'Your practice').id);
      }
    });
  });
});

const W_NAME = 'Watch and choose';
