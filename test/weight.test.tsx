import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { WeightSection } from '../src/panels/WeightSection';
import { kindSummary, projectWeight, weightKind } from '../src/lib/weight';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const KB = 1024;

function lesson(): Project {
  const p = createProject('Lite');
  const video = createArtboard({ name: 'Video', children: [createNode('video', { assetId: 'vid' } as never), createNode('image', { assetId: 'logo' } as never)] });
  const text = createArtboard({ name: 'Text', children: [createNode('image', { assetId: 'logo' } as never)] });
  const narrow = createArtboard({ name: 'Text narrow', variantOf: text.id, minWidth: 0, children: [createNode('image', { assetId: 'logo' } as never)] });
  p.artboards = [video, text, narrow];
  p.assets = [
    { id: 'vid', name: 'lesson.mp4', mime: 'video/mp4', size: 40 * 1024 * KB },
    { id: 'logo', name: 'logo.png', mime: 'image/png', size: 20 * KB },
    { id: 'face', name: 'face.woff2', mime: 'font/woff2', size: 90 * KB },
    { id: 'orphan', name: 'unused.png', mime: 'image/png', size: 5 * KB },
  ];
  p.fonts = [{ family: 'Face', source: 'asset', assetId: 'face' }];
  return p;
}

describe('projectWeight', () => {
  it('lists every artboard in the Layers panel order with its files, largest first, and the shared font files apart', () => {
    const w = projectWeight(lesson());
    expect(w.artboards.map((a) => a.name)).toEqual(['Video', 'Text', 'Text narrow']);
    expect(w.artboards[0].files.map((f) => f.name)).toEqual(['lesson.mp4', 'logo.png']);
    expect(w.artboards[0].bytes).toBe(40 * 1024 * KB + 20 * KB);
    expect(w.artboards[0].byKind).toEqual({ video: 40 * 1024 * KB, audio: 0, pictures: 20 * KB, other: 0 });
    expect(w.artboards[1].bytes).toBe(20 * KB);
    expect(w.shared.bytes).toBe(90 * KB);
    //nothing counts a file no artboard uses
    expect(w.artboards.some((a) => a.files.some((f) => f.id === 'orphan'))).toBe(false);
  });

  it('uses the size a file will download as (the optimised copy) when told', () => {
    const w = projectWeight(lesson(), (a) => (a.id === 'vid' ? 10 * 1024 * KB : a.size));
    expect(w.artboards[0].bytes).toBe(10 * 1024 * KB + 20 * KB);
  });

  it('classifies files and summarises the kinds that have something', () => {
    expect(['video/mp4', 'audio/wav', 'image/svg+xml', 'application/json'].map(weightKind)).toEqual(['video', 'audio', 'pictures', 'other']);
    expect(kindSummary({ video: 0, audio: 3000, pictures: 9000, other: 0 }, (n) => `${n}b`)).toBe('9000b pictures, 3000b audio');
  });
});

describe('the Download size section', () => {
  let root: Root;
  let host: HTMLElement;
  afterEach(() => {
    if (root) act(() => root.unmount());
    host?.remove();
  });
  function mount(p: Project, artboard: number) {
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const Harness = () => {
      const project = useEditor((st) => st.project);
      return <WeightSection ab={project.artboards[artboard]} project={project} />;
    };
    act(() => root.render(<Harness />));
    return s;
  }

  it('says what the artboard weighs in the heading, and lists the files and every artboard when opened', () => {
    mount(lesson(), 0);
    expect(host.querySelector('.section-title')!.textContent).toContain('Download size: 40 MB');
    act(() => (host.querySelector('.section-title') as HTMLElement).click());
    expect(host.textContent).toContain('lesson.mp4');
    expect(host.textContent).toContain('2 files: 40 MB video, 20 KB pictures');
    expect(host.querySelectorAll('.weight-list li')).toHaveLength(3);
    expect(host.textContent).toContain('90 KB of font and data files');
  });

  it('picks another artboard from its row', () => {
    const s = mount(lesson(), 0);
    act(() => (host.querySelector('.section-title') as HTMLElement).click());
    const pick = Array.from(host.querySelectorAll<HTMLElement>('.weight-pick')).find((b) => b.textContent === 'Text')!;
    act(() => pick.click());
    expect(s.get().activeArtboardId).toBe(s.get().project.artboards[1].id);
  });

  it('says an artboard with no files costs nothing', () => {
    const p = lesson();
    p.artboards.push(createArtboard({ name: 'Empty' }));
    mount(p, 3);
    expect(host.querySelector('.section-title')!.textContent).toContain('Download size: 0 B');
    act(() => (host.querySelector('.section-title') as HTMLElement).click());
    expect(host.textContent).toContain('costs a learner nothing to open');
  });
});

describe('the help', () => {
  it('has a download-size topic that says the share link carries everything and names the expressions', () => {
    const t = TOPICS.find((x) => x.id === 'download-size');
    expect(t).toBeTruthy();
    const body = topicBody(t!);
    expect(body).toContain('downloadSize');
    expect(body).toContain('fileSize');
    expect(body).toContain('lowBandwidth');
    expect(body).toMatch(/single HTML file/i);
    expect(body).toMatch(/share link/i);
    expect(body).not.toContain('—');
  });
});
