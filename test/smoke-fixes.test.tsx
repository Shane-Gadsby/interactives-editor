//Regressions found by an end-to-end browser smoke test of the editor.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore, type Tool } from '../src/store/store';
import { uniqueIdentifier } from '../src/store/doc';
import { variableNameFrom } from '../src/lib/quick-add';
import { Canvas } from '../src/canvas/Canvas';
import { LeftPanel } from '../src/panels/LeftPanel';
import { analyzeUsage, unusedAssetIds } from '../src/lib/dependencies';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('names that have to be identifiers', () => {
  it('numbers them without a space, so the next one is not a clash', () => {
    expect(uniqueIdentifier([], 'value')).toBe('value');
    expect(uniqueIdentifier(['value'], 'value')).toBe('value2');
    expect(uniqueIdentifier(['value', 'value2'], 'value')).toBe('value3');
    expect(uniqueIdentifier(['data', 'data2', 'data3'], 'data')).toBe('data4');
    expect(uniqueIdentifier(['item2'], 'item2')).toBe('item3');
  });
  it('is what a new variable name goes through', () => {
    expect(variableNameFrom('score', ['score', 'score2'])).toBe('score3');
    expect(variableNameFrom('my var!', [])).toBe('my_var_');
  });
});

describe('the Assets panel and data files', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  it('does not call an asset unused when only a data source reads it', () => {
    const p = createProject('T');
    p.assets.push({ id: 'as1', name: 'rows.json', mime: 'application/json', size: 10 }, { id: 'as2', name: 'spare.png', mime: 'image/png', size: 10 });
    p.dataSources.push({ id: 'ds1', name: 'rows', kind: 'json', source: 'asset', assetId: 'as1' });
    expect(unusedAssetIds(analyzeUsage(p))).toEqual(['as2']);
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LeftPanel />));
    const tab = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Assets')!;
    act(() => tab.click());
    const list = [...host.querySelectorAll('button')].find((b) => b.getAttribute('title')?.startsWith('Show assets as a list'))!;
    act(() => list.click());
    const rowFor = (name: string) => [...host!.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent === name)!.parentElement!.textContent!;
    expect(rowFor('rows.json')).not.toContain('unused');
    expect(rowFor('spare.png')).toContain('unused');
  });
});

describe('the canvas with a creation tool', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  const handles = (tool: Tool) => {
    const p = createProject('T');
    const r = createNode('rect', { x: 50, y: 50, width: 100, height: 80 });
    p.artboards[0].children.push(r);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.set({ selection: [r.id], tool });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Canvas />));
    return { rotate: host.querySelectorAll('[data-handle^="rotate"]').length, resize: host.querySelectorAll('[data-handle^="resize"]').length };
  };
  it('shows the selection handles for the Select tool', () => {
    expect(handles('select')).toEqual({ rotate: 4, resize: 8 });
  });
  it.each<Tool>(['rect', 'ellipse', 'text', 'button', 'pen', 'line', 'frame', 'artboard', 'draw', 'shader'])('keeps them off the canvas for %s, so a drag next to a selected layer draws instead of rotating it', (tool) => {
    expect(handles(tool)).toEqual({ rotate: 0, resize: 0 });
  });
});

describe('the interaction graph keyboard', () => {
  let root: Root | null = null;
  let host: HTMLElement | null = null;
  afterEach(() => {
    if (root) act(() => root!.unmount());
    host?.remove();
    root = host = null;
  });
  it('still undoes and redoes the project with Ctrl+Z and Ctrl+Shift+Z (it keeps the key events to itself)', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('DOMMatrixReadOnly', class { m22 = 1; constructor() {} });
    const { LogicGraph } = await import('../src/panels/LogicGraph');
    const p = createProject('T');
    const s = new EditorStore(p);
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<LogicGraph />));
    s.update((d) => {
      d.artboards[0].logic.nodes.push({ id: 'lg1', kind: 'event.start', x: 0, y: 0, params: {} } as never);
    });
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
    const canvas = host.querySelector('.logic-canvas') as HTMLElement;
    const press = (init: KeyboardEventInit) => act(() => void canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })));
    press({ key: 'z', ctrlKey: true });
    expect(s.artboard()!.logic.nodes).toHaveLength(0);
    press({ key: 'z', ctrlKey: true, shiftKey: true });
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
    press({ key: 'z', ctrlKey: true });
    press({ key: 'y', ctrlKey: true });
    expect(s.artboard()!.logic.nodes).toHaveLength(1);
  });
});
