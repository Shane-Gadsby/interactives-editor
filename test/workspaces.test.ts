import { beforeEach, describe, expect, it } from 'vitest';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { ALL_PANELS, defaultLayout, getDock, normalise, setDock } from '../src/lib/dock';
import { BUILT_IN, applyWorkspace, deleteWorkspace, renameWorkspace, saveWorkspace, savedWorkspaces } from '../src/lib/workspaces';
import { getPanelWidths } from '../src/components/PanelResize';
import { setPrefs } from '../src/lib/prefs';

const everywhere = (l: ReturnType<typeof defaultLayout>) => [...Object.values(l.zones).flatMap((g) => g.tabs), ...l.floats.flatMap((f) => f.tabs)];

describe('workspaces', () => {
  beforeEach(() => {
    setCurrentStore(new EditorStore(createProject('T')));
    setDock(defaultLayout());
    setPrefs({ workspaces: [] });
  });

  it('every built-in one is a whole layout: each panel once, and normalising changes nothing', () => {
    for (const w of BUILT_IN) {
      const { layout } = w.make();
      expect(everywhere(layout).sort(), w.id).toEqual([...ALL_PANELS].sort());
      expect(normalise(layout), w.id).toEqual(layout);
    }
  });

  it('applying one sets the panels, widths and bottom height, and the timeline follows', () => {
    const ws = BUILT_IN.find((w) => w.id === 'interactions')!.make();
    applyWorkspace(ws);
    const l = getDock();
    expect(l.zones.right.tabs.slice(0, 3)).toEqual(['inspector', 'variables', 'scripts']);
    expect(l.zones.bottom.active).toBe('logic');
    expect(getPanelWidths().right).toBe(360);
    applyWorkspace(BUILT_IN.find((w) => w.id === 'canvas')!.make());
    expect(getDock().zones.left.tabs).toEqual([]);
    expect(getDock().bottomFolded).toBe(true);
  });

  it('saves the current layout under a name, replaces one of the same name, renames and deletes', () => {
    applyWorkspace(BUILT_IN.find((w) => w.id === 'animate')!.make());
    saveWorkspace('  Laptop ');
    expect(savedWorkspaces().map((w) => w.name)).toEqual(['Laptop']);
    expect(savedWorkspaces()[0].bottomHeight).toBe(380);
    saveWorkspace('laptop');
    expect(savedWorkspaces()).toHaveLength(1);
    const id = savedWorkspaces()[0].id;
    renameWorkspace(id, 'Big screen');
    expect(savedWorkspaces()[0].name).toBe('Big screen');
    deleteWorkspace(id);
    expect(savedWorkspaces()).toEqual([]);
  });

  it('ignores saved entries that are not workspaces', () => {
    setPrefs({ workspaces: [null, 'x', { id: 'a' }, { id: 'b', name: 'Ok', layout: 'junk' }] });
    const list = savedWorkspaces();
    expect(list.map((w) => w.name)).toEqual(['Ok']);
    expect(list[0].layout).toEqual(defaultLayout());
  });

  it('keeps where the tool rail is, and reads one saved before it could go to the bottom', () => {
    setDock({ ...defaultLayout(), tools: { place: 'bottom', x: 80, y: 120 } });
    saveWorkspace('Strip');
    expect(savedWorkspaces()[0].layout.tools.place).toBe('bottom');
    // an older saved workspace has only left, right or float for it
    setPrefs({ workspaces: [{ id: 'old', name: 'Old', layout: { ...defaultLayout(), tools: { place: 'right', x: 1, y: 2 } } }] });
    expect(savedWorkspaces()[0].layout.tools).toEqual({ place: 'right', x: 1, y: 2 });
    applyWorkspace(savedWorkspaces()[0]);
    expect(getDock().tools.place).toBe('right');
  });
});
