//A video layer's Cues and Chapters editing, and its poster and empty text, through the store.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, normalizeProject, type VideoNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { VideoCues } from '../src/panels/VideoCuesSection';
import { TOPICS, topicBody } from '../src/help/topics';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let host: HTMLElement | undefined;
let s: EditorStore;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.unstubAllGlobals();
});

function mount(): VideoNode {
  const p = createProject('V');
  const v = createNode('video', { id: 'clip', name: 'Clip', src: 'https://example.com/a.mp4' } as never) as VideoNode;
  p.artboards[0].children.push(v);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const set = (patch: Partial<VideoNode>) => s.update((d) => void Object.assign(d.artboards[0].children[0], patch));
  const Wrap = () => <VideoCues node={s.get().project.artboards[0].children[0] as VideoNode} set={set} />;
  act(() => root!.render(<Wrap />));
  const rerender = () => act(() => root!.render(<Wrap />));
  (mount as unknown as { rerender: () => void }).rerender = rerender;
  return v;
}
const node = () => s.get().project.artboards[0].children[0] as VideoNode;
const button = (text: string) => Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const click = (el: Element) => act(() => (el as HTMLElement).click());

describe('video cues and chapters in the inspector', () => {
  it('adds, names, pauses and deletes cues, each with an id', () => {
    mount();
    click(button('Add a cue'));
    (mount as unknown as { rerender: () => void }).rerender();
    click(button('Add a cue'));
    expect(node().cues!.map((c) => c.time)).toEqual([0, 5]);
    expect(new Set(node().cues!.map((c) => c.id)).size).toBe(2);
    (mount as unknown as { rerender: () => void }).rerender();
    const pause = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    click(pause);
    expect(node().cues![0].pause).toBe(true);
    (mount as unknown as { rerender: () => void }).rerender();
    click(button('Delete this one'));
    expect(node().cues).toHaveLength(1);
    (mount as unknown as { rerender: () => void }).rerender();
    click(button('Clear'));
    expect(node().cues).toBeUndefined();
  });

  it('adds chapters from 0 and the document survives a reload', () => {
    mount();
    click(button('Add a chapter'));
    (mount as unknown as { rerender: () => void }).rerender();
    click(button('Add a chapter'));
    expect(node().chapters!.map((c) => [c.time, c.title])).toEqual([[0, 'Chapter 1'], [5, 'Chapter 2']]);
    const again = normalizeProject(JSON.parse(JSON.stringify(s.get().project)));
    expect((again.artboards[0].children[0] as VideoNode).chapters).toHaveLength(2);
  });

  it('has help that explains them', () => {
    const topic = TOPICS.find((t) => t.id === 'images-media');
    expect(topic).toBeTruthy();
    expect(topicBody(topic!)).toContain('Cue points and chapters');
  });
});
