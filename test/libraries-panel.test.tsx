import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

const lib = vi.hoisted(() => ({
  info: {
    id: 'prkit0003',
    name: 'Kit',
    owner: { username: 'ann', name: 'Ann' },
    version: 1,
    updated: '2026-01-01T00:00:00Z',
    note: '',
    mine: false,
    components: [{ id: 'ab1', name: 'Card', width: 300, height: 160, hash: 'h', uses: [] }],
    internals: [],
    styles: { colors: [], texts: [] },
    history: [],
  },
}));
vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listLibraries: async () => [lib.info],
  getOwnLibrary: async () => null,
}));

import { LibrariesPanel } from '../src/panels/LibrariesPanel';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

async function mount(p: Project) {
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<LibrariesPanel />));
  await flush();
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Libraries panel', () => {
  let p: Project;
  beforeEach(() => {
    p = createProject('Consumer');
    p.libraries = [{ id: lib.info.id, name: 'Kit', version: 1 } as never];
  });

  it('shows the components of a library you added right away, ready to drag', async () => {
    await mount(p);
    const cards = host.querySelectorAll<HTMLElement>('.lib-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].getAttribute('draggable')).toBe('true');
    expect(cards[0].textContent).toContain('Card');
  });

  it('a colour made from the selected layer\'s fill becomes that layer\'s style, so editing the colour changes it', async () => {
    const box = createNode('rect', { name: 'Box', width: 10, height: 10, fill: { type: 'solid', color: '#3366ff' } });
    p.artboards[0].children.push(box);
    await mount(p);
    s.select([box.id]);
    const promptSpy = await import('../src/components/dialogs');
    const ask = vi.spyOn(promptSpy, 'promptDialog').mockResolvedValue('Brand');
    const add = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '+ Colour')!;
    await act(async () => add.click());
    await flush();
    ask.mockRestore();
    const style = s.get().project.styles!.colors[0];
    expect(style).toMatchObject({ name: 'Brand', color: '#3366ff' });
    const layer = s.get().project.artboards[0].children[0] as unknown as { styleRefs?: { fill?: string } };
    expect(layer.styleRefs?.fill).toBe(style.id);
    // editing the style moves the layer with it
    const { editStyle } = await import('../src/lib/libraries');
    s.update((d) => void editStyle(d as Project, style.id, { color: '#ff0000' }));
    expect((s.get().project.artboards[0].children[0] as unknown as { fill: { color: string } }).fill.color).toBe('#ff0000');
  });
});
