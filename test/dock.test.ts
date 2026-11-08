import { describe, expect, it } from 'vitest';
import { ALL_PANELS, defaultLayout, dockFloat, isShown, locatePanel, movePanel, normalise, placeTools, showPanel, toolsDropFor } from '../src/lib/dock';

const everywhere = (l: ReturnType<typeof defaultLayout>) => [...Object.values(l.zones).flatMap((g) => g.tabs), ...l.floats.flatMap((f) => f.tabs)];

describe('dock layout', () => {
  it('starts with layers on the left, properties on the right and the tool panels at the bottom, each panel once', () => {
    const l = defaultLayout();
    expect(l.zones.left.tabs).toEqual(['layers', 'assets', 'icons', 'libraries', 'comments']);
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
    l = movePanel(l, 'layers', { zone: 'left', index: 4 });
    expect(l.zones.left.tabs).toEqual(['assets', 'icons', 'libraries', 'layers', 'comments']);
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

describe('the tool rail can dock anywhere', () => {
  it('reads every place it has ever been saved at, and anything else as the left', () => {
    for (const place of ['left', 'right', 'bottom', 'float'] as const) {
      expect(normalise({ ...defaultLayout(), tools: { place, x: 5, y: 6 } }).tools).toEqual({ place, x: 5, y: 6 });
    }
    expect(normalise({ ...defaultLayout(), tools: { place: 'diagonal' } }).tools.place).toBe('left');
    expect(normalise({ v: 1, zones: {}, floats: [] }).tools).toEqual({ place: 'left', x: 80, y: 120 });
  });

  it('a layout stored before the bottom existed loads as it was', () => {
    const old = { v: 1, zones: defaultLayout().zones, bottomFolded: false, floats: [], tools: { place: 'right', x: 10, y: 20 } };
    expect(normalise(JSON.parse(JSON.stringify(old))).tools).toEqual({ place: 'right', x: 10, y: 20 });
  });

  it('turns what is under a dragged rail into a drop: edges dock it, tab strips refuse, the open canvas floats it', () => {
    expect(toolsDropFor({ edge: 'bottom' })).toEqual({ place: 'bottom' });
    expect(toolsDropFor({ edge: 'left', strip: true })).toEqual({ place: 'left' });
    expect(toolsDropFor({ strip: true })).toEqual({ tabs: true });
    expect(toolsDropFor({})).toEqual({ float: true });
    expect(toolsDropFor({ edge: null })).toEqual({ float: true });
  });

  it('moves the rail to a zone or floats it at a position, leaving the panels alone', () => {
    let l = defaultLayout();
    l = placeTools(l, 'bottom');
    expect(l.tools).toEqual({ place: 'bottom', x: 80, y: 120 });
    l = placeTools(l, 'float', { x: 200.4, y: 99.6 });
    expect(l.tools).toEqual({ place: 'float', x: 200, y: 100 });
    // docking again keeps where it last floated, for the menu's Floating
    l = placeTools(l, 'right');
    expect(l.tools).toEqual({ place: 'right', x: 200, y: 100 });
    expect(l.zones).toEqual(defaultLayout().zones);
  });
});
