import { describe, expect, it } from 'vitest';
import { ALL_PANELS, defaultLayout, dockFloat, isShown, locatePanel, movePanel, normalise, showPanel } from '../src/lib/dock';

const everywhere = (l: ReturnType<typeof defaultLayout>) => [...Object.values(l.zones).flatMap((g) => g.tabs), ...l.floats.flatMap((f) => f.tabs)];

describe('dock layout', () => {
  it('starts with layers on the left, properties on the right and the tool panels at the bottom, each panel once', () => {
    const l = defaultLayout();
    expect(l.zones.left.tabs).toEqual(['layers', 'assets', 'libraries', 'comments']);
    expect(l.zones.right.tabs).toEqual(['inspector']);
    expect(l.zones.bottom.tabs[0]).toBe('timeline');
    expect(everywhere(l).sort()).toEqual([...ALL_PANELS].sort());
    expect(isShown(l, 'timeline')).toBe(true);
    expect(isShown(l, 'logic')).toBe(false);
  });

  it('moves a panel to another area, where it becomes the open tab, and the one beside it takes over where it left', () => {
    let l = defaultLayout();
    l = movePanel(l, 'timeline', { zone: 'right', index: 1 });
    expect(l.zones.right.tabs).toEqual(['inspector', 'timeline']);
    expect(l.zones.right.active).toBe('timeline');
    expect(l.zones.bottom.tabs).not.toContain('timeline');
    expect(l.zones.bottom.active).toBe('logic');
    expect(everywhere(l)).toHaveLength(ALL_PANELS.length);
  });

  it('reorders within an area, counting the index without the moved tab', () => {
    let l = defaultLayout();
    l = movePanel(l, 'layers', { zone: 'left', index: 3 });
    expect(l.zones.left.tabs).toEqual(['assets', 'libraries', 'layers', 'comments']);
  });

  it('floats a panel in a new window, docks another into it, and closing it sends both home', () => {
    let l = defaultLayout();
    l = movePanel(l, 'logic', { newFloat: { x: 300, y: 200 } });
    expect(l.floats).toHaveLength(1);
    const id = l.floats[0].id;
    expect(locatePanel(l, 'logic')).toEqual({ float: id });
    expect(isShown(l, 'logic')).toBe(true);
    l = movePanel(l, 'layers', { float: id, index: 0 });
    expect(l.floats[0].tabs).toEqual(['layers', 'logic']);
    l = dockFloat(l, id);
    expect(l.floats).toHaveLength(0);
    expect(l.zones.left.tabs).toContain('layers');
    expect(l.zones.bottom.tabs).toContain('logic');
  });

  it('closes a floating window when its last panel is dragged out of it', () => {
    let l = movePanel(defaultLayout(), 'data', { newFloat: { x: 0, y: 0 } });
    l = movePanel(l, 'data', { zone: 'bottom', index: 0 });
    expect(l.floats).toHaveLength(0);
    expect(l.zones.bottom.tabs[0]).toBe('data');
  });

  it('showing a panel unfolds the bottom area, and a folded area shows nothing', () => {
    let l = { ...defaultLayout(), bottomFolded: true };
    expect(isShown(l, 'timeline')).toBe(false);
    l = showPanel(l, 'scripts');
    expect(l.bottomFolded).toBe(false);
    expect(l.zones.bottom.active).toBe('scripts');
  });

  it('makes a saved layout safe: unknown and repeated panels go, missing ones come back home', () => {
    const l = normalise({ zones: { left: { tabs: ['layers', 'bogus', 'layers'], active: 'nope' }, right: { tabs: ['inspector', 'timeline'] }, bottom: { tabs: [] } }, floats: [{ id: 'f', tabs: ['timeline', 'logic'], x: 'x' }], tools: { place: 'sideways' } });
    expect(l.zones.left.tabs[0]).toBe('layers');
    expect(l.zones.left.active).toBe('layers');
    expect(l.zones.right.tabs).toEqual(['inspector', 'timeline']);
    expect(l.floats[0].tabs).toEqual(['logic']);
    expect(l.floats[0].x).toBe(120);
    expect(everywhere(l).sort()).toEqual([...ALL_PANELS].sort());
    expect(l.tools.place).toBe('left');
    expect(normalise('garbage')).toEqual(defaultLayout());
  });
});
