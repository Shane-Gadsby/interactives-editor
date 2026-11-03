import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('adding a node to the interaction graph', () => {
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
    const s = new EditorStore(createProject('T'));
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    return s;
  }
  /** Right-click the pane and pick a node from the menu, with real clicks on its buttons */
  const pick = (kind: string) => {
    const pane = host!.querySelector('.react-flow__pane') as HTMLElement;
    act(() => void pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })));
    const item = (label: string) => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) => b.textContent?.startsWith(label))!;
    act(() => void item('Event').dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    act(() => item(kind).click());
  };

  it('takes the node back in one undo from the graph, and keeps focus in the graph after a menu pick', async () => {
    const s = await mount();
    const canvas = host!.querySelector('.logic-canvas') as HTMLElement;
    pick('On start');
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    expect(document.activeElement).toBe(canvas);
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'z', ctrlKey: true })));
    expect(s.artboard()!.logic.nodes).toHaveLength(0);
  });

  it('leaves focus alone when the person has moved to a field of their own', async () => {
    const s = await mount();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();
    pick('On start');
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    expect(document.activeElement).toBe(field);
    field.remove();
  });
});
