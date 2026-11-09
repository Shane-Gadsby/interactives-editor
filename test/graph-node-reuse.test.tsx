//A click on one node of the graph leaves the other nodes alone (they used to be drawn again, which took a big graph a tenth of a second a click)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

//The face of a node asks whether it is lit each time it is drawn, so the calls say which nodes were drawn
const drawn: string[] = [];
vi.mock('../src/lib/run-flow', async (orig) => {
  const real = await orig<typeof import('../src/lib/run-flow')>();
  return { ...real, flashOf: (id: string) => (drawn.push(id), real.flashOf(id)) };
});

describe('the graph redraws only the nodes that changed', () => {
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
    const kinds = ['event.start', 'event.pointer', 'action.setVariable'];
    kinds.forEach((kind, i) => p.artboards[0].logic.nodes.push({ id: `n${i}`, kind, x: 50 + i * 250, y: 50, params: {} }));
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    return { s, kinds };
  }
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));

  it('selecting a node draws that node again and no other', async () => {
    const { s } = await mount();
    drawn.length = 0;
    act(() => s.set({ logicPicked: ['n1'], logicSelection: 'n1' }));
    await settle();
    expect(drawn).toContain('n1');
    expect(drawn).not.toContain('n0');
    expect(drawn).not.toContain('n2');
    expect(host!.querySelector('.react-flow__node[data-id="n1"] .ix-graph-node')!.classList.contains('selected')).toBe(true);
  });

  it('moving to another node redraws the one let go and the one picked', async () => {
    const { s } = await mount();
    act(() => s.set({ logicPicked: ['n0'], logicSelection: 'n0' }));
    await settle();
    drawn.length = 0;
    act(() => s.set({ logicPicked: ['n2'], logicSelection: 'n2' }));
    await settle();
    expect(drawn).toContain('n0');
    expect(drawn).toContain('n2');
    expect(drawn).not.toContain('n1');
    expect(host!.querySelector('.react-flow__node[data-id="n0"] .ix-graph-node')!.classList.contains('selected')).toBe(false);
    expect(host!.querySelector('.react-flow__node[data-id="n2"] .ix-graph-node')!.classList.contains('selected')).toBe(true);
  });

  it('a change to one node\'s settings is drawn for that node only', async () => {
    const { s } = await mount();
    drawn.length = 0;
    act(() => s.update((d) => void (d.artboards[0].logic.nodes[2].params = { variable: 'x', value: '1' })));
    await settle();
    expect(drawn).toContain('n2');
    expect(drawn).not.toContain('n0');
    expect(drawn).not.toContain('n1');
  });
});
