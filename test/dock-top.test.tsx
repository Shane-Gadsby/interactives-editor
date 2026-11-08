//The top dock area: under the header, over the canvas and its rulers, no height until something is docked in it
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DockDragLayer, DockZone, ToolsHead, toolsMenu, useZoneSizes } from '../src/components/Dock';
import { ALL_PANELS, FOLDED_HEIGHT, TOOLS_PLACES, TOP_HEIGHT, ZONES, defaultLayout, getDock, isShown, movePanel, normalise, placeTools, setDock, showPanel, toolsDropFor, type DockLayout } from '../src/lib/dock';
import { BUILT_IN, applyWorkspace, currentWorkspace, savedWorkspaces } from '../src/lib/workspaces';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

describe('the top area in the layout', () => {
  beforeEach(() => setCurrentStore(new EditorStore(createProject('T'))));
  it('is one of the zones and a place for the tool rail, and starts empty, so today\'s layout is unchanged', () => {
    expect(ZONES).toContain('top');
    expect(TOOLS_PLACES).toContain('top');
    const l = defaultLayout();
    expect(l.zones.top).toEqual({ tabs: [], active: null });
    expect(l.topFolded).toBe(false);
    expect(l.topHeight).toBe(TOP_HEIGHT.def);
    expect(l.zones.left.tabs).toEqual(['layers', 'assets', 'icons', 'libraries', 'comments']);
  });

  it('takes a panel dragged into it as a tab, unfolds it, and the others stay where they were', () => {
    let l: DockLayout = { ...defaultLayout(), topFolded: true };
    l = movePanel(l, 'variables', { zone: 'top', index: 0 });
    l = movePanel(l, 'data', { zone: 'top', index: 1 });
    expect(l.zones.top.tabs).toEqual(['variables', 'data']);
    expect(l.zones.top.active).toBe('data');
    expect(l.topFolded).toBe(false);
    expect(l.zones.bottom.tabs).not.toContain('variables');
    expect([...Object.values(l.zones).flatMap((g) => g.tabs)].sort()).toEqual([...ALL_PANELS].sort());
  });

  it('showing a panel in a folded top area unfolds it, and a folded top area shows nothing', () => {
    let l = movePanel(defaultLayout(), 'variables', { zone: 'top', index: 0 });
    l = { ...l, topFolded: true };
    expect(isShown(l, 'variables')).toBe(false);
    l = showPanel(l, 'variables');
    expect(l.topFolded).toBe(false);
    expect(isShown(l, 'variables')).toBe(true);
  });

  it('reads layouts and workspaces saved before the top area existed, and cleans what it is given', () => {
    const old = JSON.parse(JSON.stringify(defaultLayout()));
    delete old.zones.top;
    delete old.topFolded;
    delete old.topHeight;
    old.zones.bottom.tabs = old.zones.bottom.tabs.filter((t: string) => t !== 'data');
    const l = normalise(old);
    expect(l.zones.top).toEqual({ tabs: [], active: null });
    expect(l.topHeight).toBe(TOP_HEIGHT.def);
    expect(l.zones.bottom.tabs[0]).toBe('timeline');
    const kept = normalise({ ...old, zones: { ...old.zones, top: { tabs: ['data', 'data', 'nonsense'], active: 'logic' } }, topFolded: 1, topHeight: 9999 });
    expect(kept.zones.top.tabs).toEqual(['data']);
    expect(kept.zones.top.active).toBe('data');
    expect(kept.zones.bottom.tabs).not.toContain('data');
    expect(kept.topFolded).toBe(true);
    expect(kept.topHeight).toBe(TOP_HEIGHT.max);
    expect(normalise({ ...old, topHeight: 3 }).topHeight).toBe(TOP_HEIGHT.min);
  });

  it('puts the tool rail at the top and reads that back', () => {
    const l = placeTools(defaultLayout(), 'top');
    expect(l.tools.place).toBe('top');
    expect(normalise(JSON.parse(JSON.stringify(l))).tools.place).toBe('top');
    expect(toolsDropFor({ edge: 'top' })).toEqual({ place: 'top' });
  });

  it('is saved in a workspace with its height, and comes back with it', () => {
    setPrefs({ workspaces: [] });
    let l = movePanel(defaultLayout(), 'data', { zone: 'top', index: 0 });
    l = { ...l, topHeight: 222 };
    setDock(l);
    const w = currentWorkspace();
    expect(w.layout.zones.top.tabs).toEqual(['data']);
    setDock(defaultLayout());
    applyWorkspace(w);
    expect(getDock().zones.top.tabs).toEqual(['data']);
    expect(getDock().topHeight).toBe(222);
    expect(BUILT_IN.every((b) => b.make().layout.zones.top.tabs.length === 0)).toBe(true);
    expect(savedWorkspaces()).toEqual([]);
  });
});

describe('the top area on screen', () => {
  let root: Root;
  let host: HTMLElement;
  let sizes: ReturnType<typeof useZoneSizes>;
  function Probe() {
    sizes = useZoneSizes({ left: 300, right: 320 });
    return <DockZone zone="top" />;
  }
  beforeEach(() => {
    setCurrentStore(new EditorStore(createProject('T')));
    setDock(defaultLayout());
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root.render(<Probe />));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('takes no room while empty', () => {
    expect(sizes.top).toBe(0);
    expect(host.querySelector('.top-dock')).toBeNull();
  });

  it('opens at its height with tabs and a resize handle, and folds down to its tab strip', () => {
    act(() => setDock((l) => movePanel(l, 'variables', { zone: 'top', index: 0 })));
    expect(sizes.top).toBe(TOP_HEIGHT.def);
    expect(host.querySelector('.top-dock')).toBeTruthy();
    expect(host.querySelector('.top-dock')!.getAttribute('aria-label')).toBe('Top panels');
    const handle = host.querySelector<HTMLElement>('[role=separator]')!;
    expect(handle.getAttribute('aria-label')).toBe('Resize the top panels');
    //down makes it taller, up shorter
    act(() => void handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(getDock().topHeight).toBe(TOP_HEIGHT.def + 10);
    act(() => void handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true })));
    expect(getDock().topHeight).toBe(TOP_HEIGHT.def - 30);
    act(() => void handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(getDock().topHeight).toBe(TOP_HEIGHT.def);
    const fold = host.querySelector<HTMLButtonElement>('button[aria-label="Fold the top panels"]')!;
    act(() => fold.click());
    expect(getDock().topFolded).toBe(true);
    expect(sizes.top).toBe(FOLDED_HEIGHT);
    expect(host.querySelector('[role=separator]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Unfold the top panels"]')!.click());
    expect(getDock().topFolded).toBe(false);
  });

  it('the open tab folds it when clicked again, and a click on it opens it', () => {
    act(() => setDock((l) => movePanel(l, 'variables', { zone: 'top', index: 0 })));
    const tab = () => host.querySelector<HTMLElement>('[data-dock-tab="variables"]')!;
    const click = () => {
      act(() => void tab().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 })));
      act(() => void window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 })));
    };
    click();
    expect(getDock().topFolded).toBe(true);
    click();
    expect(getDock().topFolded).toBe(false);
  });

  it('the tab menu and the tools menu say "Dock at the top"', () => {
    const items = toolsMenu();
    const top = items.find((i) => 'label' in i && i.label === 'Dock at the top')!;
    expect(top).toBeTruthy();
    act(() => ('onClick' in top ? top.onClick() : undefined));
    expect(getDock().tools.place).toBe('top');
    expect('disabled' in (toolsMenu().find((i) => 'label' in i && i.label === 'Dock at the top') as object)).toBe(true);
  });

  it("a tab's right-click menu docks it at the top", () => {
    act(() => root.render(<DockZone zone="bottom" />));
    const tab = host.querySelector<HTMLElement>('[data-dock-tab="variables"]')!;
    act(() => void tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })));
    const items = [...document.querySelectorAll<HTMLButtonElement>('.ctx-menu [role=menuitem]')];
    expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining(['Dock on the left', 'Dock on the right', 'Dock at the bottom', 'Dock at the top']));
    expect(items.find((i) => i.textContent === 'Dock at the bottom')!.disabled).toBe(true);
    act(() => items.find((i) => i.textContent === 'Dock at the top')!.click());
    expect(getDock().zones.top.tabs).toEqual(['variables']);
    expect(getDock().zones.bottom.tabs).not.toContain('variables');
  });
});

describe('the drop strip', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    setCurrentStore(new EditorStore(createProject('T')));
    setDock(defaultLayout());
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.body.innerHTML = '';
  });

  it('shows "Dock at the top" while dragging the tool rail, with the other edges', () => {
    (document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => [document.querySelector('[data-dock-edge="top"]')].filter(Boolean) as Element[];
    act(() => root.render(<><main className="stage" /><ToolsHead /><DockDragLayer /></>));
    const grip = host.querySelector('.dock-tools-grip')!;
    act(() => void grip.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
    act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 60, clientY: 60 })));
    const edges = [...document.querySelectorAll('[data-dock-edge]')].map((e) => [e.getAttribute('data-dock-edge'), e.textContent]);
    expect(edges).toEqual([['left', 'Dock tools left'], ['right', 'Dock tools right'], ['bottom', 'Dock tools at the bottom'], ['top', 'Dock tools at the top']]);
    act(() => void window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 61, clientY: 61 })));
    act(() => void window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 61, clientY: 61 })));
    expect(getDock().tools.place).toBe('top');
  });
});
