import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { DEFAULT_BOTTOM, installInteractionsRoom, KEY, ROOM_HEIGHT, roomHeight } from '../src/lib/interactions-room';
import { resetDock, setDock, getDock, movePanel } from '../src/lib/dock';

let store: EditorStore;
let stop: () => void;

beforeEach(() => {
  localStorage.removeItem(KEY);
  vi.stubGlobal('innerHeight', 1000);
  resetDock();
  store = new EditorStore(createProject('T'));
  setCurrentStore(store);
  stop = installInteractionsRoom();
});
afterEach(() => {
  stop();
  vi.unstubAllGlobals();
  localStorage.removeItem(KEY);
});

describe('room for the Interactions graph', () => {
  it('lifts the bottom panel from its default height when Interactions opens, and puts it back when the tab is left', () => {
    expect(store.get().bottomHeight).toBe(DEFAULT_BOTTOM);
    store.set({ bottomTab: 'logic' });
    expect(store.get().bottomHeight).toBe(ROOM_HEIGHT);
    store.set({ bottomTab: 'timeline' });
    expect(store.get().bottomHeight).toBe(DEFAULT_BOTTOM);
  });

  it('opening it again from a layer while it is already open changes nothing', () => {
    store.set({ bottomTab: 'logic' });
    store.set({ bottomTab: 'logic', logicSelection: 'x' });
    expect(store.get().bottomHeight).toBe(ROOM_HEIGHT);
    store.set({ bottomTab: null });
    expect(store.get().bottomHeight).toBe(DEFAULT_BOTTOM);
  });

  it('leaves a panel the author sized on purpose alone, going in and coming out', () => {
    store.set({ bottomHeight: 330 });
    store.set({ bottomTab: 'logic' });
    expect(store.get().bottomHeight).toBe(330);
    store.set({ bottomTab: 'timeline' });
    expect(store.get().bottomHeight).toBe(330);
  });

  it('remembers the height they give the graph and lifts to that next time', () => {
    store.set({ bottomTab: 'logic' });
    //a drag: a run of small changes
    for (const h of [450, 470, 490]) store.set({ bottomHeight: h });
    expect(roomHeight()).toBe(490);
    store.set({ bottomTab: 'timeline' });
    //their height stays: it is not ours to put back
    expect(store.get().bottomHeight).toBe(490);
    store.set({ bottomHeight: DEFAULT_BOTTOM });
    store.set({ bottomTab: 'logic' });
    expect(store.get().bottomHeight).toBe(490);
  });

  it('never takes more than half the window', () => {
    localStorage.setItem(KEY, '900');
    vi.stubGlobal('innerHeight', 700);
    store.set({ bottomTab: 'logic' });
    expect(store.get().bottomHeight).toBe(350);
  });

  it('does nothing when the graph has been docked somewhere else', () => {
    setDock((l) => movePanel(l, 'logic', { zone: 'right', index: 0 }));
    expect(getDock().zones.bottom.tabs.includes('logic')).toBe(false);
    store.set({ bottomTab: 'logic' });
    expect(store.get().bottomHeight).toBe(DEFAULT_BOTTOM);
  });

  it('ignores a stored value that is not a number', () => {
    localStorage.setItem(KEY, 'wide');
    expect(roomHeight()).toBe(ROOM_HEIGHT);
  });
});
