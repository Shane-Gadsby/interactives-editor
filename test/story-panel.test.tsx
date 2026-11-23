//The Story tab: starting a story makes a wired stage, the panel lists chapters and cast, faces come from pictures, problems offer fixes
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CATALOG_BY_KIND, evaluate, createProject, readChapter, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { StoryPanel } from '../src/panels/StoryPanel';
import { startStory, storyStage, HIDE_VAR } from '../src/lib/story';
import { facesFromPictures } from '../src/lib/story-cast';
import { getTopic } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const walk = (list: SceneNode[], f: (n: SceneNode) => void) => {
  for (const n of list) {
    f(n);
    if ('children' in n && Array.isArray(n.children)) walk(n.children as SceneNode[], f);
  }
};

describe('starting a story', () => {
  it('puts the stage in place of an empty first page, makes it the start, with a sample that reads cleanly', () => {
    const p = createProject('S');
    const stageId = startStory(p);
    expect(p.artboards.map((a) => a.id)).toEqual([stageId]);
    expect(p.settings.startArtboardId).toBe(stageId);
    expect(p.story!.stage).toBe(stageId);
    expect(p.story!.cast!.map((c) => c.name)).toEqual(['Millie', 'Olive']);
    const prog = readChapter(p.story!.chapters[0], p.story);
    expect(prog.problems).toEqual([]);
    expect(prog.scenes.size).toBe(3);
    expect(p.variables.some((v) => v.name === HIDE_VAR)).toBe(true);
  });

  it('adds the stage beside a project that has pages already', () => {
    const p = createProject('S');
    p.artboards[0].children.push({ ...storyStage('x').children[0], id: 'keep' });
    startStory(p);
    expect(p.artboards).toHaveLength(2);
    expect(p.artboards[1].canvasX).toBeGreaterThan(p.artboards[0].canvasX + p.artboards[0].width);
  });

  it('wires every button with nodes the player knows, and every binding is an expression that reads', () => {
    const ab = storyStage('hide');
    //(the Hide variable is read by name)
    void HIDE_VAR;
    for (const n of ab.logic.nodes) expect(CATALOG_BY_KIND[n.kind], n.kind).toBeTruthy();
    const targets = new Set(ab.logic.nodes.filter((n) => n.kind === 'event.pointer').map((n) => String(n.params.target)));
    const names: string[] = [];
    walk(ab.children, (n) => {
      if (targets.has(n.id)) names.push(n.name);
      for (const src of Object.values(n.bindings ?? {})) expect(() => evaluate(src, { vars: { story: { cast: [], choices: [], bubble: { x: 0.3, y: 0.4, tipX: 0.5, tipY: 0.3, tail: 'up' } }, item: { x: 0.5, height: 0.9, lift: 0 }, [HIDE_VAR]: false } }), `${n.name}: ${src}`).not.toThrow();
    });
    expect(names.sort()).toEqual(['Auto', 'Back', 'Choice', 'Hide', 'Show the box again', 'Skip']);
  });
});

describe('faces from pictures', () => {
  it('matches pictures named after someone, with blink and talking ones, and leaves others alone', () => {
    const img = (id: string, name: string) => ({ id, name, mime: 'image/png', size: 1 });
    const faces = facesFromPictures('Millie', [img('1', 'Millie smiling.png'), img('2', 'millie_sad.png'), img('3', 'Millie.png'), img('4', 'Millicent.png'), img('5', 'Millie smiling blink.png'), img('6', 'Millie smiling talk.png'), img('7', 'Olive.png')], []);
    expect(faces).toEqual([
      { name: 'neutral', assetId: '3' },
      { name: 'smiling', assetId: '1', blink: '5', talk: '6' },
      { name: 'sad', assetId: '2' },
    ]);
    expect(facesFromPictures('Millie', [img('1', 'Millie smiling.png')], [{ name: 'smiling', assetId: '9' }])).toEqual([]);
  });
});

describe('the Story tab', () => {
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });
  const mount = (p: Project) => {
    const s = new EditorStore(p);
    setCurrentStore(s);
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<StoryPanel />));
    return { s, host };
  };

  it('starts a story from the empty tab, then lists its chapters, cast and settings', () => {
    const { s, host } = mount(createProject('S'));
    const start = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start a story')!;
    act(() => start.click());
    expect(s.get().project.story?.chapters).toHaveLength(1);
    const items = [...host.querySelectorAll('.story-list .list-item')].map((b) => b.textContent?.trim());
    expect(items).toEqual(['Chapter 1', 'Millie', 'Olive', 'Settings']);
    act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === '+ New chapter')!.click());
    expect(s.get().project.story!.chapters.map((c) => c.name)).toEqual(['Chapter 1', 'Chapter 2']);
  });

  it('lists a chapter\'s problems with a fix, and the fix adds to the cast', () => {
    const p = createProject('S');
    startStory(p);
    p.story!.chapters[0].lines.push({ id: 'zz', text: 'Hale: Who are you?' });
    const { s, host } = mount(p);
    const fix = [...host.querySelectorAll<HTMLButtonElement>('.story-problems button')].find((b) => b.textContent === 'Add Hale')!;
    expect(fix).toBeTruthy();
    act(() => fix.click());
    expect(s.get().project.story!.cast!.map((c) => c.name)).toContain('Hale');
    expect(host.querySelector('.story-problems')).toBeNull();
  });

  it('opens a cast member, adds faces from their pictures, and the help covers it', () => {
    const p = createProject('S');
    startStory(p);
    p.assets.push({ id: 'm1', name: 'Millie happy.png', mime: 'image/png', size: 1 });
    const { s, host } = mount(p);
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.story-list .list-item')].find((b) => b.textContent?.includes('Millie'))!.click());
    const add = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.startsWith('Add 1 face from pictures named Millie'))!;
    act(() => add.click());
    expect(s.get().project.story!.cast![0].expressions).toEqual([{ name: 'happy', assetId: 'm1' }]);
    expect(getTopic('story-stage')?.body).toContain('Add faces from pictures named');
  });
});

describe('voices', () => {
  it('writes a voice script of the spoken lines and matches recordings named by line id', async () => {
    const { voiceScript, matchVoiceFiles } = await import('../src/lib/story-cast');
    const p = createProject('S');
    startStory(p);
    const csv = voiceScript(p.story!, readChapter as never);
    const rows = csv.split('\r\n');
    expect(rows[0]).toBe('Line id,Chapter,Character,Words,File name');
    const first = rows[1].split(',');
    expect(first[2]).toBe('Millie');
    expect(rows.some((r) => r.includes('Yes! Okay. Sign here. And here.'))).toBe(true);
    const id = first[0];
    const got = matchVoiceFiles(p.story!, [{ id: 'snd', name: `Millie ${id}.mp3`, mime: 'audio/mpeg', size: 1 }, { id: 'x', name: 'Music.mp3', mime: 'audio/mpeg', size: 1 }]);
    expect([...got]).toEqual([[id, 'snd']]);
  });
});
