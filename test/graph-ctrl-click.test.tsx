import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Ctrl/Cmd+click in the interaction graph', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
    vi.unstubAllGlobals();
  });

  async function mount() {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const n = { id: `n${i}`, kind: 'event.start', x: 50 + i * 250, y: 50, params: {} };
      p.artboards[0].logic.nodes.push(n);
      ids.push(n.id);
    }
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return { s, ids };
  }
  const node = (id: string) => host!.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;
  /** A real press and release on the node with the modifier on the events themselves, and no Control keydown anywhere: that is all a browser sends when the graph keeps its keys to itself. */
  const click = (id: string, mods: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}, move = 0) => {
    const el = node(id);
    const opt = { bubbles: true, cancelable: true, button: 0, clientX: 10, ...mods };
    act(() => void el.dispatchEvent(new MouseEvent('pointerdown', opt)));
    act(() => void el.dispatchEvent(new MouseEvent('pointerup', { ...opt, clientX: 10 + move })));
    act(() => void el.dispatchEvent(new MouseEvent('click', { ...opt, clientX: 10 + move })));
    return act(async () => void (await new Promise((r) => setTimeout(r, 5))));
  };

  it('adds a node to the selection and takes it out again, with no key tracking at all', async () => {
    const { s, ids } = await mount();
    await click(ids[0]);
    expect(s.get().logicPicked.length === 0 ? [s.get().logicSelection] : s.get().logicPicked).toEqual([ids[0]]);
    await click(ids[1], { ctrlKey: true });
    expect(s.get().logicPicked).toEqual([ids[0], ids[1]]);
    expect(s.get().logicSelection).toBe(ids[1]);
    await click(ids[2], { metaKey: true });
    expect(s.get().logicPicked).toEqual(ids);
    //A second Ctrl+click on one of them takes it out
    await click(ids[1], { ctrlKey: true });
    expect(s.get().logicPicked).toEqual([ids[0], ids[2]]);
    expect(node(ids[1]).classList.contains('selected')).toBe(false);
    expect(node(ids[0]).classList.contains('selected')).toBe(true);
    expect(node(ids[2]).classList.contains('selected')).toBe(true);
  });

  it('a Ctrl press that moves is a drag, not a toggle', async () => {
    const { s, ids } = await mount();
    await click(ids[0]);
    await click(ids[0], { ctrlKey: true }, 40);
    expect(s.get().logicSelection).toBe(ids[0]);
    expect(s.get().logicPicked).toContain(ids[0]);
  });

  it('shows the selection count text for the several chosen', async () => {
    const { ids } = await mount();
    await click(ids[0]);
    await click(ids[1], { ctrlKey: true });
    expect(host!.querySelector('.logic-settings')?.textContent).toContain('2 selected');
  });
});
