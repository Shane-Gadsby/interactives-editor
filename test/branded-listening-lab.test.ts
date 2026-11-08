//The listen, watch and capture set of branded starters: each builds in every colourway, survives normalising, paints only with
//tokens, plays in the player, and its main interaction works. Sound is stood in for by a recording <audio> element.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, walk, type Artboard, type Project, type SceneNode } from 'interactives-player';
import { BRANDED_STARTERS, COLOURWAYS, projectFromBrandedStarter, takeInlineAssets } from '../src/lib/branded';
import { byName } from '../src/lib/branded/kit';
import { renderNotes, wavBytes } from '../src/lib/branded/sets/media/sounds';

//The generic per-colourway checks for the whole set are in branded-media.test.ts; these are the Listening lab's own
const MEDIA = BRANDED_STARTERS.filter((s) => s.key === 'media/listening-lab');
const flush = () => new Promise((r) => setTimeout(r, 0));
const elOf = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`);
const textOf = (id: string) => must(id).textContent;
const must = (id: string) => {
  const el = elOf(id);
  if (!el) throw new Error(`no layer ${id}`);
  return el;
};
let current: Player | null = null;
const click = async (id: string) => {
  must(id).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  await flush();
  //bindings (labels, visibility) catch up on the next frame
  current?.step(50);
};

/** jsdom has no PointerEvent: a mouse event with the pointer fields on it. */
const ptr = (type: string, x: number, y: number, target: Element | Window = window) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  Object.defineProperty(e, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(e);
};
/** Drag a layer by its centre onto another layer's centre. */
const dragOnto = (from: { x: number; y: number; width: number; height: number }, id: string, to: { x: number; y: number; width: number; height: number }) => {
  const a: [number, number] = [from.x + from.width / 2, from.y + from.height / 2];
  const b: [number, number] = [to.x + to.width / 2, to.y + to.height / 2];
  const el = must(id);
  ptr('pointerdown', a[0], a[1], el);
  for (let i = 1; i <= 4; i++) ptr('pointermove', a[0] + ((b[0] - a[0]) * i) / 4, a[1] + ((b[1] - a[1]) * i) / 4, el);
  ptr('pointerup', b[0], b[1], el);
};

interface Heard {
  src: string;
  volume: number;
  loop: boolean;
  playbackRate: number;
  preservesPitch: boolean;
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
  duration = 2;
  constructor(public src: string) {
    heard.push(this as unknown as Heard);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener() {}
}

beforeEach(() => {
  heard = [];
  document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.stubGlobal('Audio', FakeAudio);
});
afterEach(() => vi.unstubAllGlobals());

const play = (project: Project, at?: Artboard) => {
  const player = new Player(document.getElementById('stage')!, project, { loadData: false });
  if (at) player.goTo(at.id);
  current = player;
  return player;
};

describe('the media set', () => {
  it('lists the Listening lab, keyed media/', () => {
    expect(MEDIA.map((s) => s.key)).toContain('media/listening-lab');
    for (const s of MEDIA) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.description).not.toMatch(/—/);
    }
  });

  for (const s of MEDIA) {
    describe(s.name, () => {
      for (const way of COLOURWAYS) {
        it(`builds in ${way.name}, normalises, paints with tokens only, and plays`, async () => {
          const { project, checklist } = s.build(way);
          expect(project.themes!.default).toBe(`theme-${way.id}`);
          expect(project.settings.startArtboardId).toBe(project.artboards[0].id);
          expect(project.artboards[0].name).toBe('Start');
          expect(() => normalizeProject(JSON.parse(JSON.stringify(project)))).not.toThrow();
          const layers = JSON.stringify(project.artboards.map((a) => [a.children, a.background, a.logic]));
          expect(layers).not.toMatch(/#[0-9a-f]{3,8}\b/i);
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
          //every Play sound names a sound the project has
          const assets = new Set(project.assets.map((a) => a.id));
          for (const ab of project.artboards) for (const n of ab.logic.nodes) if (n.kind === 'action.sound') expect(assets.has(String(n.params.asset))).toBe(true);
          const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
          const player = play(JSON.parse(JSON.stringify(project)));
          for (const ab of project.artboards) {
            player.goTo(ab.id);
            player.step(3000);
            await flush();
          }
          expect(err).not.toHaveBeenCalled();
          err.mockRestore();
          player.destroy?.();
        });
      }
    });
  }
});

describe('placeholder sounds', () => {
  it('are small valid WAV files, and the editor can lift them out of a project as files', async () => {
    const wav = wavBytes(renderNotes([{ hz: 440, ms: 100 }, { hz: 0, ms: 50 }]));
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wav.subarray(8, 12))).toBe('WAVE');
    expect(wav.length).toBe(44 + 800 + 400);
    const project = projectFromBrandedStarter(MEDIA.find((s) => s.key === 'media/listening-lab')!, COLOURWAYS[0]);
    expect(project.assets.length).toBeGreaterThanOrEqual(8);
    for (const a of project.assets) {
      expect(a.mime).toBe('audio/wav');
      expect(a.src).toMatch(/^data:audio\/wav;base64,/);
      expect(a.size).toBeLessThan(40000);
    }
    const files = takeInlineAssets(project);
    expect([...files.keys()].sort()).toEqual(project.assets.map((a) => a.id).sort());
    for (const a of project.assets) {
      expect(a.src).toBeUndefined();
      const blob = files.get(a.id)!;
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBe(a.size);
    }
    //nothing left to lift
    expect(takeInlineAssets(project).size).toBe(0);
  });
});

describe('Listening lab', () => {
  const setup = () => {
    const project = JSON.parse(JSON.stringify(projectFromBrandedStarter(MEDIA.find((s) => s.key === 'media/listening-lab')!, COLOURWAYS[0]))) as Project;
    const board = (name: string) => project.artboards.find((a) => a.name === name)!;
    const player = play(project);
    const id = (page: string, name: string) => byName(board(page), name)!.id;
    //an answer is a copy of one repeated button
    const answer = (page: string, n: number) => `${id(page, 'Answer')}~${n - 1}`;
    return { project, board, player, id, answer };
  };

  it('keeps everything inside the content box of its page, clear of the footer', () => {
    const { project } = setup();
    for (const page of project.artboards.slice(1, 6)) {
      for (const n of page.children) {
        if ((n as { tags?: string[] }).tags?.includes('brand-chrome') || ['Page title', 'Footer text'].includes(n.name)) continue;
        expect(n.x, `${page.name}: ${n.name}`).toBeGreaterThanOrEqual(48);
        expect(n.x + n.width, `${page.name}: ${n.name}`).toBeLessThanOrEqual(1024 - 48 + 0.5);
        expect(n.y, `${page.name}: ${n.name}`).toBeGreaterThanOrEqual(114);
        //text has no fixed height: its own height field is a floor, so only boxes are measured
        if (n.type !== 'text') expect(n.y + n.height, `${page.name}: ${n.name}`).toBeLessThanOrEqual(640 - 44 - 16 + 0.5);
      }
    }
  });

  it('has the sound check first, then four rounds and the results', () => {
    const { project } = setup();
    expect(project.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Start', 'Sound check', 'Identify the sound', 'Compare A and B', 'Sort the sounds', 'What changed?', 'Results']);
  });

  it('the sound check plays a test tone, and "I can\'t use sound" turns the descriptions on', async () => {
    const { player, id } = setup();
    await click(id('Start', 'Start button'));
    expect(player.artboard.name).toBe('Sound check');
    await click(id('Sound check', 'Play test sound button'));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ loop: false, playbackRate: 1, volume: 1 });
    expect(player.getVariable('showText')).toBe(false);
    await click(id('Sound check', 'No sound button'));
    await flush();
    expect(player.artboard.name).toBe('Identify the sound');
    expect(player.getVariable('showText')).toBe(true);
    expect(document.body.textContent).toContain('Description: Two soft bell notes');
    player.destroy?.();
  });

  it('Play plays the clip once at normal speed; Loop and Slow change the next play, and Stop ends a loop', async () => {
    const { player, id } = setup();
    player.goTo('Identify the sound');
    await flush();
    await click(id('Identify the sound', 'Sound 1 play button'));
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ loop: false, playbackRate: 1 });
    //one button is Play and Stop: while the clip goes it says Stop and a press ends it
    expect(textOf(id('Identify the sound', 'Sound 1 play button'))).toBe('Stop');
    await click(id('Identify the sound', 'Sound 1 play button'));
    expect(heard[0].paused).toBe(true);
    expect(textOf(id('Identify the sound', 'Sound 1 play button'))).toBe('Play');
    //the switches are native pressed buttons on two variables
    const pressed = (name: string) => must(id('Identify the sound', name)).querySelector('[aria-pressed]')?.getAttribute('aria-pressed') ?? must(id('Identify the sound', name)).getAttribute('aria-pressed');
    expect(pressed('Loop switch')).toBe('false');
    await click(id('Identify the sound', 'Loop switch'));
    await click(id('Identify the sound', 'Slow switch'));
    expect(pressed('Loop switch')).toBe('true');
    expect(pressed('Slow switch')).toBe('true');
    await click(id('Identify the sound', 'Sound 1 play button'));
    expect(heard).toHaveLength(2);
    expect(heard[1]).toMatchObject({ loop: true, playbackRate: 0.6, preservesPitch: true });
    expect(heard[1].paused).toBe(false);
    //Stop ends a loop
    expect(textOf(id('Identify the sound', 'Sound 1 play button'))).toBe('Stop');
    await click(id('Identify the sound', 'Sound 1 play button'));
    expect(heard[1].paused).toBe(true);
    expect(textOf(id('Identify the sound', 'Sound 1 play button'))).toBe('Play');
    //a loop does not outlive its page
    await click(id('Identify the sound', 'Sound 1 play button'));
    expect(heard[2].loop).toBe(true);
    expect(heard[2].paused).toBe(false);
    player.goTo('Compare A and B');
    await flush();
    expect(heard[2].paused).toBe(true);
    player.destroy?.();
  });

  it('comparing plays one clip at a time: starting B stops A', async () => {
    const { player, id } = setup();
    player.goTo('Compare A and B');
    await flush();
    await click(id('Compare A and B', 'Clip A play button'));
    await click(id('Compare A and B', 'Clip B play button'));
    expect(heard).toHaveLength(2);
    expect(heard[0].paused).toBe(true);
    expect(heard[1].paused).toBe(false);
    player.destroy?.();
  });

  it('a round marks the answer, scores it once and moves on with Next', async () => {
    const { player, id, answer } = setup();
    player.goTo('Identify the sound');
    await flush();
    expect(document.body.textContent).toContain('What is making this sound?');
    //a wrong answer first: it is locked in, nothing more counts
    await click(answer('Identify the sound', 2));
    expect(player.getVariable('score')).toBe(0);
    expect(player.getVariable('locked')).toBe(true);
    expect(document.body.textContent).toContain('Not quite.');
    expect(document.body.textContent).toContain('✓  A doorbell');
    await click(answer('Identify the sound', 1));
    expect(player.getVariable('score')).toBe(0);
    await click(id('Identify the sound', 'Next button'));
    await flush();
    expect(player.artboard.name).toBe('Compare A and B');
    //the next round starts fresh
    expect(player.getVariable('locked')).toBe(false);
    await click(answer('Compare A and B', 2));
    expect(player.getVariable('score')).toBe(1);
    expect(document.body.textContent).toContain('Correct.');
    player.destroy?.();
  });

  it('sorting by dragging: right drops count, a wrong one is refused, and all four sorted opens Next', async () => {
    const { player, id } = setup();
    player.goTo('Sort the sounds');
    await flush();
    const drop = async (chip: string, group: string) => {
      await click(id('Sort the sounds', chip));
      await click(id('Sort the sounds', group));
      player.step(400);
    };
    //a wrong drop is dragged (a click-to-place only ever offers a group that fits)
    const chip = byName(player.artboard, 'Sound 2')!;
    const zone = byName(player.artboard, 'Higher sounds')!;
    dragOnto(chip, chip.id, zone);
    await flush();
    expect(player.getVariable('misses')).toBe(1);
    expect(String(player.getVariable('message'))).toContain('Sound 2 does not go in Higher sounds');
    expect(player.dragState()['Sound 2']).toBeNull();
    await drop('Sound 1', 'Higher sounds');
    await drop('Sound 4', 'Higher sounds');
    await drop('Sound 2', 'Lower sounds');
    await drop('Sound 3', 'Lower sounds');
    expect(player.getVariable('highSounds')).toEqual(['Sound 1', 'Sound 4']);
    expect(player.getVariable('lowSounds')).toEqual(['Sound 2', 'Sound 3']);
    expect(String(player.getVariable('message'))).toBe('All 4 sorted. Well done!');
    //the chips' own Play buttons use the same Loop and Slow
    await click(id('Sort the sounds', 'Sound 3 play button'));
    expect(heard.at(-1)).toMatchObject({ loop: false, playbackRate: 1 });
    await click(id('Sort the sounds', 'See next button'));
    await flush();
    expect(player.artboard.name).toBe('What changed?');
    player.destroy?.();
  });

  it('the last round goes to the results, which add it up, and Try again starts over', async () => {
    const { player, id, answer } = setup();
    player.goTo('What changed?');
    await flush();
    await click(answer('What changed?', 1));
    expect(player.getVariable('score')).toBe(1);
    expect(byName(player.artboard, 'Next button') ?? true).toBeTruthy();
    expect(document.body.textContent).toContain('See results');
    await click(id('What changed?', 'Next button'));
    await flush();
    expect(player.artboard.name).toBe('Results');
    expect(document.body.textContent).toContain('You answered 1 of 3 questions right');
    await click(byName(player.artboard, 'Try again button')!.id);
    await flush();
    expect(player.artboard.name).toBe('Start');
    expect(player.getVariable('score')).toBe(0);
    player.destroy?.();
  });

  it('is built on the native pieces: one answer flow per round, one button for Play and Stop, a live sorted count, next pages', () => {
    const { project } = setup();
    const pages = project.artboards.filter((a) => !a.isMaster);
    for (const name of ['Identify the sound', 'Compare A and B', 'What changed?']) {
      const ab = project.artboards.find((a) => a.name === name)!;
      const answerEvents = ab.logic.nodes.filter((n) => n.kind === 'event.pointer' && n.params.target === byName(ab, 'Answer')!.id);
      expect(answerEvents).toHaveLength(1);
      expect(answerEvents[0].params.onlyIf).toBe('!locked');
      expect(byName(ab, 'Answers')!.keyNav).toBeTruthy();
    }
    for (const ab of pages) walk(ab.children, (n) => expect(n.name).not.toMatch(/stop button$/));
    const sorted = project.variables.find((v) => v.name === 'sorted')!;
    expect(sorted.live).toBe(true);
    //Start, Next and Continue follow the page order, so none names a page
    const named = pages.flatMap((a) => a.logic.nodes.filter((n) => n.kind === 'action.artboard' && n.params.artboard));
    expect(named).toHaveLength(0);
  });
});
