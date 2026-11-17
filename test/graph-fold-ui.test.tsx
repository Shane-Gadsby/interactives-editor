//The Interactions graph shows a question's kit nodes as one block that opens, and the author's own nodes stay where they are.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type Project } from 'interactives-player';
import { addQuestion, questionFrames } from '../src/lib/question-kit';
import { EditorStore, setCurrentStore } from '../src/store/store';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('folded question nodes in the graph', () => {
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
    const abId = s.get().project.artboards[0].id;
    s.update((d) => {
      addQuestion(d as Project, abId, 'single');
      d.artboards[0].logic.nodes.push({ id: 'mine', kind: 'event.start', x: 40, y: 600, params: {} });
    });
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    const kit = () => s.get().project.artboards[0].logic.nodes.filter((n) => n.kit);
    return { s, abId, kit };
  }
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 10))));
  const ids = () => [...host!.querySelectorAll('.react-flow__node')].map((n) => n.getAttribute('data-id'));

  it('shows one block for the question and the author\'s node, not the kit nodes, until it is opened', async () => {
    const { s, kit } = await mount();
    const frame = questionFrames(s.get().project.artboards[0])[0].id;
    expect(kit().length).toBeGreaterThan(3);
    expect(ids()).toEqual(expect.arrayContaining([`kitfold:${frame}`, 'mine']));
    for (const n of kit()) expect(ids()).not.toContain(n.id);
    const block = host!.querySelector<HTMLButtonElement>('.ix-kit-open')!;
    expect(block.textContent).toMatch(new RegExp(`${kit().length} nodes`));
    expect(block.getAttribute('aria-expanded')).toBe('false');
    //open: every kit node is drawn, and the block is now a Fold tab
    await act(async () => void block.click());
    await settle();
    for (const n of kit()) expect(ids()).toContain(n.id);
    const tab = host!.querySelector<HTMLButtonElement>('.ix-kit-tab')!;
    expect(tab.textContent).toMatch(/Fold/);
    await act(async () => void tab.click());
    await settle();
    for (const n of kit()) expect(ids()).not.toContain(n.id);
  });

  it('picking a kit node from elsewhere opens its question, and folding lets go of what was inside', async () => {
    const { s, kit } = await mount();
    const target = kit()[1].id;
    act(() => s.set({ logicPicked: [target], logicSelection: target }));
    await settle();
    expect(ids()).toContain(target);
    await act(async () => void host!.querySelector<HTMLButtonElement>('.ix-kit-tab')!.click());
    await settle();
    expect(ids()).not.toContain(target);
    expect(s.get().logicSelection).toBeNull();
    expect(s.get().logicPicked).toEqual([]);
    //nothing was removed from the document by any of it
    expect(kit().length).toBeGreaterThan(3);
  });

  it('the Open every block button on the controls opens them all and folds them again', async () => {
    const { kit } = await mount();
    const btn = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Open every question block"], button[aria-label="Fold every question block"]')!;
    expect(btn().getAttribute('aria-label')).toBe('Open every question block');
    await act(async () => void btn().click());
    await settle();
    expect(ids()).toContain(kit()[0].id);
    expect(btn().getAttribute('aria-label')).toBe('Fold every question block');
    await act(async () => void btn().click());
    await settle();
    expect(ids()).not.toContain(kit()[0].id);
  });
});
