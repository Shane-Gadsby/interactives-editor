//The grid in the interface: Preferences' Canvas block and the right-click menu entries
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { PrefsModal } from '../src/components/PrefsModal';
import { artboardGridMenu, gridMenu } from '../src/components/grid-menu';
import { prefs, setPrefs } from '../src/lib/prefs';
import type { MenuItem } from '../src/components/ContextMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  setPrefs({ showGrid: false, snapGrid: false, gridSize: 8, gridSubdivisions: 4 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const labelOf = (m: MenuItem) => ('label' in m ? m.label : '');
const find = (items: MenuItem[], re: RegExp) => items.find((i) => re.test(labelOf(i)))!;
const sub = (m: MenuItem) => ('items' in m ? m.items : []);
const click = (m: MenuItem) => ('onClick' in m ? m.onClick() : undefined);

describe('Preferences, Canvas block', () => {
  it('has Show grid and Snap to grid switches and the size presets, which change the preferences', () => {
    act(() => root.render(<PrefsModal onClose={() => undefined} />));
    const block = host.querySelector('[aria-label="Canvas"]')!;
    expect(block).toBeTruthy();
    const checks = [...block.querySelectorAll('label')].map((l) => l.textContent);
    expect(checks.join('|')).toMatch(/Show rulers.*Show grid.*Snap to grid/);
    const preset = [...block.querySelectorAll('.chip-row button')].find((b) => b.textContent === '16') as HTMLButtonElement;
    expect(preset.getAttribute('aria-pressed')).toBe('false');
    act(() => preset.click());
    expect(prefs().gridSize).toBe(16);
    expect(preset.getAttribute('aria-pressed')).toBe('true');
    const box = [...block.querySelectorAll('input[type="checkbox"]')];
    const snap = box.find((c) => c.closest('label')?.textContent?.includes('Snap to grid')) as HTMLInputElement;
    act(() => snap.click());
    expect(prefs().snapGrid).toBe(true);
  });
});

describe('the grid menus', () => {
  it('the canvas menu toggles the grid and snapping and picks a size', () => {
    let items = gridMenu();
    expect(labelOf(items[0])).toBe('Show grid');
    click(items[0]);
    expect(prefs().showGrid).toBe(true);
    click(items[1]);
    expect(prefs().snapGrid).toBe(true);
    items = gridMenu();
    expect(labelOf(items[0])).toBe('Hide grid');
    expect(labelOf(items[1])).toBe('Snap to grid: on');
    const size = find(items, /^Grid size/);
    expect(labelOf(size)).toBe('Grid size (8 px (every 4))');
    click(sub(size).find((i) => labelOf(i).includes('24 px'))!);
    expect(prefs().gridSize).toBe(24);
    click(sub(find(gridMenu(), /^Grid size/)).find((i) => labelOf(i).includes('Every 2 cells'))!);
    expect(prefs().gridSubdivisions).toBe(2);
  });

  it('an artboard\'s own grid is written to the document, and My default removes it', () => {
    const p = createProject('G');
    p.artboards[0] = createArtboard({ name: 'Phone', width: 375, height: 800 });
    const store = new EditorStore(p);
    setCurrentStore(store);
    const ab = () => store.get().project.artboards[0];
    const menu = artboardGridMenu(ab());
    expect(labelOf(menu)).toBe('Grid for this artboard');
    click(sub(menu).find((i) => labelOf(i).includes('12 px'))!);
    expect(ab().grid).toEqual({ size: 12, subdivisions: 4 });
    const again = artboardGridMenu(ab());
    expect(labelOf(again)).toBe('Grid for this artboard (12 px (every 4))');
    click(sub(again).find((i) => labelOf(i).startsWith('✓') || labelOf(i).includes('12 px'))!);
    click(sub(again).find((i) => labelOf(i).includes('Every 8 cells'))!);
    expect(ab().grid).toEqual({ size: 12, subdivisions: 8 });
    click(sub(artboardGridMenu(ab()))[0]);
    expect(ab().grid).toBeUndefined();
  });
});
