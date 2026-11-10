//The Data, results and media tutorial examples behave: each block loads examples/tut-<key>/project.json and plays it
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Player, normalizeProject, sanitizeProject, walk, type Project, type SceneNode } from 'interactives-player';

describe('tutorial example: what-if explorer', () => {
  const load = (key: string) => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', key, 'project.json'), 'utf8'))));

  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('whatif: more rent makes the week short, and the line says by how much', () => {
    const stage = document.getElementById('stage')!;
    const player = new Player(stage, load('tut-whatif'), { loadData: false });
    player.step(16);
    expect(player.getVariable('income')).toBe(420);
    expect(player.getVariable('leftover')).toBe(50);
    player.setVariable('rent', 300);
    player.step(16);
    expect(player.getVariable('leftover')).toBe(-30);
    expect(stage.textContent).toContain('Short by $30.00');
    player.destroy();
  });
});

describe('tutorial example: content from a data file', () => {
  const dir = path.resolve(__dirname, '..', 'examples');
  const load = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.join(dir, key, 'project.json'), 'utf8'))));
  const byName = (list: SceneNode[], name: string) => {
    let hit: SceneNode | undefined;
    walk(list, (n) => void (n.name === name && !hit && (hit = n)));
    return hit!;
  };

  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('data file: the words and the cards come from the tips file, and a new file changes them', () => {
    const p = load('tut-data-source');
    const tips = JSON.parse(readFileSync(path.join(dir, 'tut-data-source', 'assets', p.dataSources[0].assetId!), 'utf8'));
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.setData('tips', tips);
    player.step(16);
    const stage = document.getElementById('stage')!;
    expect(stage.textContent).toContain('Five study tips');
    expect(stage.textContent).toContain('Study skills, week 1');
    const card = byName(p.artboards[0].children, 'Card');
    expect(document.querySelectorAll(`[data-ix-id^="${card.id}~"]`).length).toBe(4);
    for (const c of tips.cards) expect(stage.textContent).toContain(c.title);

    //the swap: same fields, new words, a fifth card
    player.setData('tips', { ...tips, title: 'Term two tips', cards: [...tips.cards, { title: 'Ask early', text: 'Talk to your teacher before things pile up.', colour: '#FDEBDD' }] });
    player.step(16);
    expect(stage.textContent).toContain('Term two tips');
    expect(document.querySelectorAll(`[data-ix-id^="${card.id}~"]`).length).toBe(5);
    player.destroy();
  });

  it('sound: Start plays the music as the soundtrack and moves on; the Sounds page has its four buttons wired', () => {
    const p = load('tut-sound');
    const [home, page] = p.artboards;
    const start = byName(home.children, 'Start button');
    const flows = home.logic.nodes.filter((n) => n.kind === 'event.pointer' && n.params.target === start.id);
    expect(flows).toHaveLength(2);
    const music = home.logic.nodes.find((n) => n.kind === 'action.sound')!;
    expect(music.params.soundtrack).toBe(true);
    expect(music.params.loop).toBe('true');
    expect(p.assets.find((a) => a.id === music.params.asset)?.name).toBe('Music.wav');
    const kinds = page.logic.nodes.filter((n) => !n.kind.startsWith('event.')).map((n) => n.kind).sort();
    expect(kinds).toEqual(['action.artboard', 'action.captions', 'action.sound', 'action.stopSound']);
    expect(page.logic.nodes.find((n) => n.kind === 'action.captions')!.params.op).toBe('soundToggle');

    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    document.querySelector(`[data-ix-id="${start.id}"]`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    player.step(1000);
    expect(player.artboard.name).toBe('Sounds');
    player.destroy();
  });
});

const load = (key: string): Project => sanitizeProject(normalizeProject(JSON.parse(readFileSync(path.resolve(__dirname, '..', 'examples', key, 'project.json'), 'utf8'))));
const shown = (name: string, p: Project) => {
  const n = p.artboards[0].children.find((c) => c.name === name)!;
  const el = document.querySelector(`[data-ix-id="${n.id}"]`) as HTMLElement | null;
  return !!el && el.style.display !== 'none' && el.style.visibility !== 'hidden';
};

describe('tutorial examples: video and microphone', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="stage" style="width:800px;height:600px"></div>';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('video chapters: question 0 shows the chapters, 1 shows the first question and hides them', () => {
    const p = load('tut-video-chapters');
    const player = new Player(document.getElementById('stage')!, p, { loadData: false });
    player.step(16);
    expect(shown('Chapter buttons', p)).toBe(true);
    expect(shown('Question 1', p)).toBe(false);
    player.setVariable('question', 1);
    player.step(16);
    expect(shown('Chapter buttons', p)).toBe(false);
    expect(shown('Question 1', p)).toBe(true);
    expect(shown('Question 2', p)).toBe(false);
    player.destroy();
  });

  it('microphone: recording and could not start both run the one countdown, and time up stops the take', () => {
    const p = load('tut-microphone');
    const { nodes, edges } = p.artboards[0].logic;
    const rec = nodes.find((n) => n.kind === 'action.recordStart')!;
    const clock = nodes.find((n) => n.kind === 'action.clock' && n.params.op === 'start')!;
    expect(edges.filter((e) => e.from === rec.id && e.to === clock.id).map((e) => e.fromPort).sort()).toEqual(['failed', 'out']);
    const stop = nodes.find((n) => n.kind === 'action.recordStop')!;
    expect(edges.some((e) => e.from === clock.id && e.fromPort === 'done' && e.to === stop.id)).toBe(true);
    expect(p.settings.sensors?.microphone).toBe(true);
  });
});
