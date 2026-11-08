import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type Project } from 'interactives-player';
import { EditorStore, onPanelRequest, setCurrentStore, store } from '../src/store/store';
import { DockZone, useDockSync, useZoneSizes } from '../src/components/Dock';
import { Toolbar } from '../src/Editor';
import { ALL_PANELS, defaultLayout, getDock, hideSome, isHidden, normalise, setDock, showAll, showPanel } from '../src/lib/dock';
import { ESSENTIAL_PANELS, HIDDEN_PANELS, HIDDEN_TOOL_GROUPS, essentialsLayout, panelsInUse, toolGroupsInUse } from '../src/lib/essentials';
import { BUILT_IN, applyNewcomerEssentials, applyWorkspace, saveWorkspace, savedWorkspaces } from '../src/lib/workspaces';
import { markWelcomed } from '../src/lib/onboarding';
import { setPrefs } from '../src/lib/prefs';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

let root: Root;
let host: HTMLElement;
const essentials = () => BUILT_IN.find((w) => w.id === 'essentials')!.make();
const tabs = (zone: string) => [...host.querySelectorAll(`.dock-zone[aria-label="${zone} panels"] [role=tab]`)].map((t) => t.textContent!.trim().replace(/\d+\/\d+$/, ''));

//the part of the editor that turns a request for a panel into showing it
const Sync = () => (useDockSync(), null);

function mount(project: Project) {
  // the store first (a workspace sets the bottom tab on it), then Essentials, then the panels
  setCurrentStore(new EditorStore(project));
  applyWorkspace(essentials());
  act(() =>
    root.render(
      <>
        <Sync />
        <Toolbar />
        <DockZone zone="left" />
        <DockZone zone="bottom" />
      </>,
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
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

describe('the Essentials layout', () => {
  it('is a built-in workspace that puts away exactly the listed panels and tool groups, and keeps every panel in a group', () => {
    const w = essentials();
    expect(w.layout.hidden).toEqual(HIDDEN_PANELS);
    expect(w.layout.hiddenTools).toEqual(HIDDEN_TOOL_GROUPS);
    expect(normalise(w.layout)).toEqual(w.layout);
    const placed = [...Object.values(w.layout.zones).flatMap((g) => g.tabs), ...w.layout.floats.flatMap((f) => f.tabs)];
    expect(placed.sort()).toEqual([...ALL_PANELS].sort());
    // what stays and what goes cover every panel between them
    expect([...ESSENTIAL_PANELS, ...HIDDEN_PANELS].sort()).toEqual([...ALL_PANELS].sort());
    for (const p of ['timeline', 'logic', 'variables', 'checklist'] as const) expect(isHidden(w.layout, p)).toBe(false);
  });

  it('reads back from a saved copy, drops names it does not know, and a layout that hides nothing carries no list', () => {
    const l = normalise(JSON.parse(JSON.stringify(hideSome(defaultLayout(), ['scripts', 'nope' as never, 'scripts'], ['draw', 'draw', 5 as never]))));
    expect(l.hidden).toEqual(['scripts']);
    expect(l.hiddenTools).toEqual(['draw']);
    expect('hidden' in defaultLayout()).toBe(false);
    expect('hidden' in showAll(l)).toBe(false);
    expect('hiddenTools' in showAll(l)).toBe(false);
  });

  it('asking for a panel brings it out of the list, and Show all empties it', () => {
    const l = essentialsLayout(defaultLayout());
    const next = showPanel(l, 'scripts');
    expect(next.hidden).not.toContain('scripts');
    expect(next.hidden).toContain('data');
    expect(next.zones.bottom.active).toBe('scripts');
    expect(next.hiddenTools).toEqual(HIDDEN_TOOL_GROUPS);
    expect(showAll(next).hidden).toBeUndefined();
  });

  it('a layout saved while in Essentials keeps what was put away', () => {
    setCurrentStore(new EditorStore(createProject('T')));
    setPrefs({ workspaces: [] });
    applyWorkspace(essentials());
    saveWorkspace('Calm');
    const [w] = savedWorkspaces();
    expect(w.layout.hidden).toEqual(HIDDEN_PANELS);
    expect(w.layout.hiddenTools).toEqual(HIDDEN_TOOL_GROUPS);
  });

  it('switching to another workspace brings everything back', () => {
    setCurrentStore(new EditorStore(createProject('T')));
    applyWorkspace(essentials());
    expect(getDock().hidden?.length).toBeGreaterThan(0);
    applyWorkspace(BUILT_IN.find((w) => w.id === 'standard')!.make());
    expect(getDock().hidden).toBeUndefined();
    expect(getDock().hiddenTools).toBeUndefined();
  });
});

describe('a new person\'s first project', () => {
  beforeEach(() => {
    setPrefs({ onboarding: {} });
    localStorage.removeItem('ix-dock-v1');
    setCurrentStore(new EditorStore(createProject('T')));
  });

  it('opens in Essentials once, and only for someone who saw the first-run screen', () => {
    expect(applyNewcomerEssentials()).toBe(false);
    expect(getDock().hidden).toBeUndefined();
    markWelcomed();
    expect(applyNewcomerEssentials()).toBe(true);
    expect(getDock().hidden).toEqual(HIDDEN_PANELS);
    setDock(defaultLayout());
    expect(applyNewcomerEssentials()).toBe(false);
    expect(getDock().hidden).toBeUndefined();
  });

  it('leaves a template\'s Checklist as the open tab', () => {
    // what useDockSync does in the editor: a request for a panel shows it
    onPanelRequest((id) => setDock((l) => (id ? showPanel(l, id) : l)));
    markWelcomed();
    store().set({ bottomTab: 'checklist' });
    applyNewcomerEssentials();
    onPanelRequest(null);
    expect(store().get().bottomTab).toBe('checklist');
    expect(getDock().zones.bottom.active).toBe('checklist');
  });
});

describe('what a project already uses stays visible', () => {
  it('works out the panels from the project', () => {
    const p = createProject('T');
    expect([...panelsInUse(p)]).toEqual([]);
    p.scripts.push({ id: 's', name: 'S', code: '' } as never);
    p.dataSources.push({ id: 'd', name: 'D' } as never);
    p.settings.publicInterface = { variables: [], messages: [{ name: 'done' }] } as never;
    p.attributions = [{ id: 'a' } as never];
    p.libraries = [{ id: 'l' } as never];
    expect([...panelsInUse(p)].sort()).toEqual(['credits', 'data', 'interface', 'libraries', 'scripts']);
    expect(panelsInUse(p, true).has('comments')).toBe(true);
    expect(panelsInUse({ ...p, themes: { list: [{}, {}, {}, {}], tokens: [] } as never }).has('themes')).toBe(true);
    expect(panelsInUse({ ...p, themes: { list: [{}, {}, {}], tokens: [] } as never }).has('themes')).toBe(false);
  });

  it('works out the tool groups from the layers', () => {
    const p = createProject('T');
    expect(toolGroupsInUse(p)).toBe('');
    p.artboards[0].children.push(createNode('rect', {}), createNode('chart', {} as never), createNode('bone', {} as never));
    expect(toolGroupsInUse(p)).toBe('data,rig');
    p.artboards[0].children.push(createNode('path', {} as never));
    expect(toolGroupsInUse(p)).toBe('data,draw,rig');
  });
});

describe('Essentials on screen', () => {
  const bottom = () => tabs('Bottom');

  it('shows only the essential tabs along the bottom and in the left area, with More panels', () => {
    mount(createProject('T'));
    expect(bottom()).toEqual(['Timeline', 'Interactions', 'Variables']);
    expect(tabs('Left')).toEqual(['Layers', 'Assets']);
    expect(host.querySelector('.more-panels')).not.toBeNull();
  });

  it('shows the Checklist for a project made from a template', () => {
    const p = createProject('T');
    p.template = { name: 'Quiz', version: 1, checklist: [{ id: 'c', text: 'Change it' }] } as never;
    mount(p);
    expect(bottom()).toEqual(['Timeline', 'Interactions', 'Variables', 'Checklist']);
  });

  it('shows the tab of anything the project uses, even with it put away', () => {
    const p = createProject('T');
    p.scripts.push({ id: 's', name: 'S', code: '' } as never);
    p.dataSources.push({ id: 'd', name: 'D' } as never);
    mount(p);
    expect(bottom()).toEqual(['Timeline', 'Interactions', 'Scripts', 'Variables', 'Data']);
  });

  it('More panels lists what is put away, and one pick brings that panel back (and no other)', async () => {
    mount(createProject('T'));
    await act(async () => (host.querySelector('.more-panels') as HTMLElement).click());
    const items = [...document.querySelectorAll('.ctx-menu .ctx-item')].map((i) => i.textContent);
    expect(items).toContain('Scripts');
    expect(items).toContain('Accessibility');
    expect(items.some((t) => /Show all panels and tools/.test(t ?? ''))).toBe(true);
    await act(async () => void ([...document.querySelectorAll<HTMLElement>('.ctx-menu .ctx-item')].find((i) => i.textContent === 'Scripts')!.click()));
    expect(bottom()).toContain('Scripts');
    expect(bottom()).not.toContain('Data');
  });

  it('Show all panels and tools leaves Essentials: every tab and tool group is back', async () => {
    mount(createProject('T'));
    await act(async () => (host.querySelector('.more-panels') as HTMLElement).click());
    await act(async () => void ([...document.querySelectorAll<HTMLElement>('.ctx-menu .ctx-item')].find((i) => /Show all panels and tools/.test(i.textContent ?? ''))!.click()));
    expect(bottom()).toHaveLength(11);
    expect(getDock().hidden).toBeUndefined();
    expect(host.querySelector('.more-panels')).toBeNull();
    expect([...host.querySelectorAll('.tool-group-head')].map((h) => h.textContent)).toEqual(['Shapes', 'Draw', 'Media', 'Data', 'Web', 'Rig']);
  });

  it('puts away the Draw, Data and Rig tool groups, with More tools to bring them back', async () => {
    mount(createProject('T'));
    expect([...host.querySelectorAll('.tool-group-head:not(.more-tools)')].map((h) => h.textContent)).toEqual(['Shapes', 'Media', 'Web']);
    const more = host.querySelector('.more-tools') as HTMLElement;
    expect(more.getAttribute('title')).toContain('Draw');
    await act(async () => more.click());
    expect([...host.querySelectorAll('.tool-group-head')].map((h) => h.textContent)).toEqual(['Shapes', 'Draw', 'Media', 'Data', 'Web', 'Rig']);
    expect(host.querySelector('.more-tools')).toBeNull();
    // the panels stay as they were
    expect(getDock().hidden).toEqual(HIDDEN_PANELS);
  });

  it('keeps a tool group showing when the project already has layers from it, or its tool is in use', () => {
    const p = createProject('T');
    p.artboards[0].children.push(createNode('chart', {} as never));
    mount(p);
    expect([...host.querySelectorAll('.tool-group-head:not(.more-tools)')].map((h) => h.textContent)).toEqual(['Shapes', 'Media', 'Data', 'Web']);
    act(() => void (store().set({ tool: 'pen' })));
    expect([...host.querySelectorAll('.tool-group-head:not(.more-tools)')].map((h) => h.textContent)).toEqual(['Shapes', 'Draw', 'Media', 'Data', 'Web']);
  });

  it('gives the left area no room when everything in it is put away', () => {
    let sizes = { left: -1 } as ReturnType<typeof useZoneSizes>;
    const Probe = () => ((sizes = useZoneSizes({ left: 240, right: 300 })), null);
    setCurrentStore(new EditorStore(createProject('T')));
    setDock(hideSome(defaultLayout(), ['layers', 'assets', 'libraries', 'comments']));
    act(() => root.render(<Probe />));
    expect(sizes.left).toBe(0);
  });
});
