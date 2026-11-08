//Lite lesson: the chooser shows each version's real size, a connection hint only marks a card, the choice is remembered, the text only
//version loads nothing, and every version finishes on the same page.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, walk, type Artboard, type Project, type VideoNode } from 'interactives-player';
import { STARTERS } from '../src/lib/branded/sets/media';
import { projectFromBrandedStarter } from '../src/lib/branded';
import { COLOURWAYS } from '../src/lib/branded/looks';
import { byName } from '../src/lib/branded/kit';
import { projectWeight } from '../src/lib/weight';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const stage = () => document.getElementById('stage')!;
const el = (id: string) => document.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!;
const starter = STARTERS.find((s) => s.key === 'media/lite-lesson')!;
const KB = 1024;

const make = (): Project => projectFromBrandedStarter(starter, COLOURWAYS[0]);
const board = (p: Project, name: string): Artboard => p.artboards.find((a) => a.name === name)!;
const layerId = (p: Project, page: string, name: string) => {
  const n = byName(board(p, page), name);
  if (!n) throw new Error(`no layer ${name} on ${page}`);
  return n.id;
};

/** Put real files on the video and text versions, the way an author would: a video, and two key images as assets. */
function withFiles(p: Project): Project {
  p.assets.push({ id: 'vid1', name: 'lesson.mp4', mime: 'video/mp4', size: 40 * 1024 * KB });
  p.assets.push({ id: 'img1', name: 'key.jpg', mime: 'image/jpeg', size: 200 * KB });
  const clip = byName(board(p, 'Video lesson'), 'Video') as VideoNode;
  clip.assetId = 'vid1';
  const key = byName(board(p, 'Text only lesson'), 'Key image 1')!;
  (key as unknown as { fill: unknown }).fill = { type: 'image', assetId: 'img1', fit: 'cover' };
  return p;
}

describe('Lite lesson starter', () => {
  const asked = new Set<string>();
  let restore: (() => void)[] = [];
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:1024px;height:640px"></div>';
    localStorage.clear();
    asked.clear();
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    //jsdom plays no media; what the page asks for is what is watched
    const proto = HTMLMediaElement.prototype;
    const d = Object.getOwnPropertyDescriptor(proto, 'src')!;
    Object.defineProperty(proto, 'src', { ...d, set(v: string) { if (v) asked.add(v); d.set!.call(this, v); } });
    const quiet = proto as unknown as Record<string, unknown>;
    const old = { play: quiet.play, pause: quiet.pause, load: quiet.load };
    quiet.play = () => Promise.resolve();
    quiet.pause = () => undefined;
    quiet.load = () => undefined;
    restore = [() => Object.defineProperty(proto, 'src', d), () => Object.assign(quiet, old)];
  });
  afterEach(() => {
    restore.forEach((r) => r());
    vi.unstubAllGlobals();
  });

  const play = (p: Project) => new Player(stage(), JSON.parse(JSON.stringify(p)), { loadData: false, resolveAsset: (a) => `https://cdn.test/${a.id}` });
  const click = async (id: string) => {
    el(id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush(10);
  };
  const settle = async (player: Player, ms = 100) => {
    for (let t = 0; t < ms; t += 50) {
      player.step(50);
      await flush();
    }
  };
  const textOf = (id: string) => el(id)?.textContent ?? '';
  const visible = (id: string) => !!el(id) && getComputedStyle(el(id)).display !== 'none';

  it('is listed in the media set and finishes every version on one completion page', () => {
    const p = make();
    expect(p.artboards.filter((a) => !a.isMaster).map((a) => a.name)).toEqual(['Start', 'Choose a version', 'Video lesson', 'Audio only lesson', 'Text only lesson', 'Done']);
    expect(p.settings.reporting).toMatchObject({ completion: 'artboard', completionArtboard: board(p, 'Done').id });
    for (const name of ['Video lesson', 'Audio only lesson', 'Text only lesson']) {
      const finish = byName(board(p, name), 'Finish button')!;
      const to = board(p, name).logic.nodes.find((n) => n.kind === 'action.artboard' && board(p, name).logic.edges.some((e) => board(p, name).logic.nodes.find((x) => x.id === e.from && (x.params as { target?: string }).target === finish.id) && e.to === n.id));
      expect((to!.params as { artboard: string }).artboard).toBe(board(p, 'Done').id);
    }
  });

  it('shows the real size of each version on the chooser, and says so when nothing needs downloading', async () => {
    const p = withFiles(make());
    const player = play(p);
    player.goTo(board(p, 'Choose a version').id);
    await settle(player);
    const w = projectWeight(p);
    const bytes = (name: string) => w.artboards.find((a) => a.name === name)!.bytes;
    expect(bytes('Video lesson')).toBe(40 * 1024 * KB);
    expect(bytes('Text only lesson')).toBe(200 * KB);
    expect(textOf(layerId(p, 'Choose a version', 'Video size'))).toBe('40 MB');
    expect(textOf(layerId(p, 'Choose a version', 'Text only size'))).toBe('200 KB');
    //the audio version's size is the placeholder sound's, which is a real file in the project
    expect(bytes('Audio only lesson')).toBeGreaterThan(1000);
    expect(textOf(layerId(p, 'Choose a version', 'Audio only size'))).not.toBe('Nothing to download');
    player.destroy();
    //take the picture away again: nothing to download says so
    const bare = make();
    const p2 = play(bare);
    p2.goTo(board(bare, 'Choose a version').id);
    await settle(p2);
    expect(textOf(layerId(bare, 'Choose a version', 'Text only size'))).toBe('Nothing to download');
    p2.destroy();
  });

  it('marks no card without a connection hint, and the lighter one with it, without choosing for the learner', async () => {
    const p = make();
    let player = play(p);
    player.goTo(board(p, 'Choose a version').id);
    await settle(player);
    for (const c of ['Video', 'Audio only', 'Text only']) expect(visible(layerId(p, 'Choose a version', `${c} suggested`))).toBe(false);
    expect(visible(layerId(p, 'Choose a version', 'Connection hint'))).toBe(false);
    player.destroy();

    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: true, effectiveType: '4g' } });
    player = play(p);
    player.goTo(board(p, 'Choose a version').id);
    await settle(player);
    expect(visible(layerId(p, 'Choose a version', 'Text only suggested'))).toBe(true);
    expect(visible(layerId(p, 'Choose a version', 'Video suggested'))).toBe(false);
    expect(visible(layerId(p, 'Choose a version', 'Connection hint'))).toBe(true);
    //still the chooser: nothing was picked, and the heavy version can still be chosen
    expect(player.artboard.name).toBe('Choose a version');
    expect(player.getVariable('version')).toBe('');
    await click(layerId(p, 'Choose a version', 'Video button'));
    await settle(player);
    expect(player.artboard.name).toBe('Video lesson');
    player.destroy();

    vi.stubGlobal('navigator', { ...navigator, connection: { saveData: false, effectiveType: '3g' } });
    player = play(p);
    player.goTo(board(p, 'Choose a version').id);
    await settle(player);
    expect(visible(layerId(p, 'Choose a version', 'Audio only suggested'))).toBe(true);
    player.destroy();
  });

  it('remembers the choice: a later visit goes straight to that version, and Change version brings the chooser back', async () => {
    const p = make();
    let player = play(p);
    expect(player.artboard.name).toBe('Start');
    await click(layerId(p, 'Start', 'Start button'));
    await settle(player);
    expect(player.artboard.name).toBe('Choose a version');
    await click(layerId(p, 'Choose a version', 'Audio only button'));
    await settle(player);
    expect(player.artboard.name).toBe('Audio only lesson');
    player.destroy();

    player = play(p);
    await click(layerId(p, 'Start', 'Start button'));
    await settle(player);
    expect(player.artboard.name).toBe('Audio only lesson');
    await click(layerId(p, 'Audio only lesson', 'Change version button'));
    await settle(player);
    expect(player.artboard.name).toBe('Choose a version');
    player.destroy();
  });

  it('falls back to the chooser for a version that is not one of the three', async () => {
    const p = make();
    localStorage.clear();
    const player = play(p);
    player.setVariable('version', 'carrier pigeon');
    await click(layerId(p, 'Start', 'Start button'));
    await settle(player);
    expect(player.artboard.name).toBe('Choose a version');
    player.destroy();
  });

  it('text only loads no media at all, audio only loads no video, and the video version loads no sound', async () => {
    const p = withFiles(make());
    const run = async (button: string, lands: string) => {
      localStorage.clear();
      asked.clear();
      const player = play(p);
      player.goTo(board(p, 'Choose a version').id);
      await settle(player);
      await click(layerId(p, 'Choose a version', button));
      await settle(player);
      expect(player.artboard.name).toBe(lands);
      const got = [...asked];
      player.destroy();
      return got;
    };
    expect(await run('Text only button', 'Text only lesson')).toEqual([]);
    const audio = await run('Audio only button', 'Audio only lesson');
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.some((u) => u.includes('vid1'))).toBe(false);
    const video = await run('Video button', 'Video lesson');
    expect(video).toEqual(['https://cdn.test/vid1']);
  });

  it('every version finishes on Done and the page reads the version that was used', async () => {
    for (const [button, page] of [['Video button', 'Video lesson'], ['Audio only button', 'Audio only lesson'], ['Text only button', 'Text only lesson']]) {
      const p = make();
      localStorage.clear();
      const player = play(p);
      player.goTo(board(p, 'Choose a version').id);
      await settle(player);
      await click(layerId(p, 'Choose a version', button));
      await settle(player);
      await click(layerId(p, page, 'Finish button'));
      await settle(player);
      expect(player.artboard.name).toBe('Done');
      expect(textOf(layerId(p, 'Done', 'Result text'))).toContain(button === 'Video button' ? 'video version' : button === 'Audio only button' ? 'audio only version' : 'text only version');
      player.destroy();
    }
  });

  it('shares one transcript between the three versions', () => {
    const p = make();
    expect(p.variables.filter((v) => v.name === 'transcript')).toHaveLength(1);
    for (const name of ['Video lesson', 'Audio only lesson', 'Text only lesson']) {
      const texts: string[] = [];
      walk(board(p, name).children, (n) => n.type === 'text' && texts.push(n.text));
      expect(texts).toContain('{transcript}');
    }
  });
});
