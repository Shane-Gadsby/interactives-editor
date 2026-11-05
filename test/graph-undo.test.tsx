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
    const { DialogHost } = await import('../src/components/dialogs');
    const s = new EditorStore(createProject('T'));
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() =>
      root!.render(
        <>
          <LogicGraph />
          <DialogHost />
        </>,
      ),
    );
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
    //The menu's search box has focus while it's open, so the person reaches their field after the pick, before the graph takes focus back
    pick('On start');
    field.focus();
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    expect(document.activeElement).toBe(field);
    field.remove();
  });

  it('filters the add menu as you type, and Enter adds the first match', async () => {
    const s = await mount();
    const pane = host!.querySelector('.react-flow__pane') as HTMLElement;
    act(() => void pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 })));
    const box = document.querySelector<HTMLInputElement>('.ctx-search')!;
    expect(document.activeElement).toBe(box);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(box, 'play sou');
      box.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const labels = Array.from(document.querySelectorAll('[role="menuitem"] .ctx-label')).map((x) => x.textContent);
    expect(labels[0]).toBe('Play sound');
    //Same box, still focused: typing mustn't remount it
    expect(document.querySelector('.ctx-search')).toBe(box);
    expect(document.activeElement).toBe(box);
    act(() => void box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' })));
    expect(s.artboard()!.logic.nodes.map((n) => n.kind)).toEqual(['action.sound']);
  });

  it('copies and pastes the selected node with the keyboard, without touching the artboard', async () => {
    const s = await mount();
    const canvas = host!.querySelector('.logic-canvas') as HTMLElement;
    pick('On start');
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'c', ctrlKey: true })));
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: { getData: () => string } };
    paste.clipboardData = { getData: () => '' };
    let reachedWindow = false;
    const onWin = () => (reachedWindow = true);
    window.addEventListener('paste', onWin);
    act(() => void canvas.dispatchEvent(paste));
    window.removeEventListener('paste', onWin);
    const nodes = s.artboard()!.logic.nodes;
    expect(nodes).toHaveLength(2);
    expect(nodes[1].kind).toBe(nodes[0].kind);
    expect(nodes[1].id).not.toBe(nodes[0].id);
    expect(s.get().logicSelection).toBe(nodes[1].id);
    expect(reachedWindow).toBe(false);
    expect(s.artboard()!.children).toHaveLength(0);
  });

  /** A group from the pane menu, with the On start node inside it, selected and ready for Delete. */
  async function groupWithNode(s: EditorStore) {
    pick('On start');
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    const pane = host!.querySelector('.react-flow__pane') as HTMLElement;
    act(() => void pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 })));
    const item = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) => b.textContent?.startsWith('New group here'))!;
    act(() => item.click());
    const groups = s.artboard()!.logic.groups!;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ label: 'Group', width: 360, height: 220 });
    expect(s.get().logicSelection).toBe(groups[0].id);
    expect(host!.querySelector('.ix-group-head')?.textContent).toBe('Group');
    await act(async () => void (await new Promise((r) => setTimeout(r, 5))));
    const canvas = host!.querySelector('.logic-canvas') as HTMLElement;
    act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' })));
  }
  const answer = async (label: string) => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.textContent).toContain('1 node inside');
    const btn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === label)!;
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
  };

  it('Delete on a group with nodes inside asks: Just the group keeps the nodes', async () => {
    const s = await mount();
    await groupWithNode(s);
    //nothing goes until it's answered
    expect(s.artboard()!.logic.groups).toHaveLength(1);
    await answer('Just the group');
    expect(s.artboard()!.logic.groups).toBeUndefined();
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
  });

  it('Delete on a group with nodes inside asks: Group and its nodes takes both, in one undo', async () => {
    const s = await mount();
    await groupWithNode(s);
    await answer('Group and 1 node');
    expect(s.artboard()!.logic.groups).toBeUndefined();
    expect(s.artboard()!.logic.nodes).toHaveLength(0);
    act(() => s.undo());
    expect(s.artboard()!.logic.groups).toHaveLength(1);
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
  });

  it('Ctrl+A selects everything, and Ctrl+D duplicates it with the copies wired to each other', async () => {
    const s = await mount();
    act(() =>
      s.update((d) => {
        d.artboards[0].logic.nodes.push({ id: 'n1', kind: 'event.start', x: 0, y: 0, params: {} }, { id: 'n2', kind: 'action.setVariable', x: 260, y: 0, params: {} });
        d.artboards[0].logic.edges.push({ id: 'e1', from: 'n1', fromPort: 'out', to: 'n2', toPort: 'in' });
      }),
    );
    const canvas = host!.querySelector('.logic-canvas') as HTMLElement;
    const key = (k: string) => act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: k, ctrlKey: true })));
    key('a');
    expect(new Set(s.get().logicPicked)).toEqual(new Set(['n1', 'n2']));
    expect(host!.querySelectorAll('.react-flow__node.selected').length).toBe(2);
    key('d');
    const { nodes, edges } = s.artboard()!.logic;
    expect(nodes).toHaveLength(4);
    const copies = nodes.filter((n) => n.id !== 'n1' && n.id !== 'n2');
    const start = copies.find((n) => n.kind === 'event.start')!;
    const action = copies.find((n) => n.kind === 'action.setVariable')!;
    expect(edges).toHaveLength(2);
    expect(edges.find((e) => e.id !== 'e1')).toMatchObject({ from: start.id, to: action.id });
    //the copies are what's selected now
    expect(new Set(s.get().logicPicked)).toEqual(new Set(copies.map((n) => n.id)));
  });

  it('selects a group with a click on the empty space inside it, not only its title', async () => {
    const s = await mount();
    const pane = host!.querySelector('.react-flow__pane') as HTMLElement;
    act(() => void pane.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 60 })));
    act(() => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((b) => b.textContent?.startsWith('New group here'))!.click());
    const id = s.artboard()!.logic.groups![0].id;
    act(() => s.set({ logicSelection: null }));
    const body = host!.querySelector('.react-flow__node-ixgroup .ix-group') as HTMLElement;
    expect(getComputedStyle(body.parentElement!).pointerEvents).not.toBe('none');
    act(() => void body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 200, clientY: 150 })));
    expect(s.get().logicSelection).toBe(id);
  });
});
