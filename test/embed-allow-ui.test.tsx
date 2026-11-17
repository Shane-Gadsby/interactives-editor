//The embed's Inspector: the tick boxes for what an embedded page may use, and its border
import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { EMBED_ALLOW, createNode, type EmbedNode } from 'interactives-player';
import { EditorStore, setCurrentStore, useEditor } from '../src/store/store';
import { newProjectWithThemes } from '../src/lib/themes';
import { NodeInspector } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let s: EditorStore;
let host: HTMLElement;
let root: Root;
const node = () => s.get().project.artboards[0].children[0] as EmbedNode;
const mount = async (extra: Record<string, unknown> = {}) => {
  s = new EditorStore(newProjectWithThemes('T'));
  setCurrentStore(s);
  s.update((p) => {
    p.artboards[0].children.push(createNode('embed', { id: 'em', name: 'Page', mode: 'iframe', src: 'https://example.com/', ...extra } as never));
  });
  s.set({ activeArtboardId: s.get().project.artboards[0].id });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  const Harness = () => {
    const n = useEditor((st) => st.project.artboards[0].children[0]);
    const ab = useEditor((st) => st.project.artboards[0]);
    const project = useEditor((st) => st.project);
    return <NodeInspector nodes={[n]} ab={ab} project={project} />;
  };
  await act(async () => root.render(<Harness />));
};
const box = (label: string) => [...host.querySelectorAll<HTMLLabelElement>('label.check-field')].find((l) => l.textContent?.trim() === label)!;
const tick = async (label: string) => act(async () => box(label).querySelector('input')!.click());
beforeEach(() => {
  document.body.innerHTML = '';
});

describe('what the page may use', () => {
  it('lists every choice, each with its honest line as the tooltip, and starts on the three every embed had', async () => {
    await mount();
    for (const a of EMBED_ALLOW) {
      expect(box(a.label), a.label).toBeTruthy();
      expect(box(a.label).title, a.label).toContain(a.hint.slice(0, 30));
    }
    const on = EMBED_ALLOW.filter((a) => box(a.label).querySelector('input')!.checked).map((a) => a.key);
    expect(on).toEqual(['autoplay', 'fullscreen', 'clipboard']);
    //nothing is written until something is changed
    expect(node().allow).toBeUndefined();
  });

  it('ticking one writes the whole list, in the list\'s own order, and one undo takes it back', async () => {
    await mount();
    await tick('Microphone');
    expect(node().allow).toEqual(['autoplay', 'fullscreen', 'clipboard', 'microphone']);
    await tick('Autoplay');
    expect(node().allow).toEqual(['fullscreen', 'clipboard', 'microphone']);
    await act(async () => s.undo());
    expect(node().allow).toEqual(['autoplay', 'fullscreen', 'clipboard', 'microphone']);
  });

  it('is not offered for custom HTML, whose frame keeps the fixed set', async () => {
    await mount({ mode: 'html', html: '<b>x</b>' });
    expect(box('Microphone')).toBeUndefined();
    expect(box('Border')).toBeTruthy();
  });
});

describe("the embed's border", () => {
  it('is off to start with, and turning it on uses the project\'s border token, so it follows the colourway', async () => {
    await mount();
    expect(box('Border').querySelector('input')!.checked).toBe(false);
    await tick('Border');
    const stroke = node().stroke!;
    expect(stroke.width).toBe(1);
    expect(stroke.align).toBe('inside');
    const border = s.get().project.themes!.tokens.find((t) => t.name.toLowerCase().includes('border'))!;
    expect(stroke.paint).toEqual({ type: 'solid', color: `token:${border.id}` });
    //the colour shows as the token it follows, and the generic Stroke section stays away
    expect(host.querySelector('.token-chip-name')?.textContent).toBe(border.name);
    expect([...host.querySelectorAll('.section-title, h3, summary')].some((x) => x.textContent?.trim() === 'Stroke')).toBe(false);
    await tick('Border');
    expect(node().stroke).toBeNull();
  });
});
