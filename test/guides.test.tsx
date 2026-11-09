import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject, migrateProjectGuides, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { withoutLinks } from '../src/lib/export';
import { setPrefs } from '../src/lib/prefs';
import { buildCommands } from '../src/lib/commands';
import { addGuide, addUniversalGuide, attachToPage, clearGuides, guideCount, guidesAcross, guidesMenuItems, guidesOf, makeUniversal, moveGuide, moveUniversalGuide, pageForUniversal, removeGuide, removeUniversalGuide, universalGuidesOf } from '../src/lib/guides';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

const make = (): Project => {
  const p = createProject('T');
  p.artboards[0].name = 'A';
  p.artboards[0].width = 800;
  p.artboards[0].height = 600;
  p.artboards.push(createArtboard({ name: 'B', width: 400, height: 300, canvasX: 1000, canvasY: 0 }));
  return p;
};

describe('guide edits', () => {
  it('adds to a page once, and tidies an empty list away', () => {
    const p = make();
    const a = p.artboards[0].id;
    addGuide(p, a, 'x', 100);
    addGuide(p, a, 'x', 100);
    addGuide(p, a, 'y', 50);
    expect(p.artboards[0].guides).toEqual({ x: [100], y: [50] });
    removeGuide(p, a, { axis: 'x', index: 0 });
    removeGuide(p, a, { axis: 'y', index: 0 });
    expect(p.artboards[0].guides).toBeUndefined();
    expect(p.guides).toBeUndefined();
  });

  it('moves one in place', () => {
    const p = make();
    addGuide(p, p.artboards[0].id, 'y', 10);
    addGuide(p, p.artboards[0].id, 'y', 20);
    moveGuide(p, p.artboards[0].id, { axis: 'y', index: 1 }, 30);
    expect(p.artboards[0].guides!.y).toEqual([10, 30]);
    expect(guidesOf(p.artboards[0]).map((g) => `${g.axis}${g.index}:${g.at}`)).toEqual(['y0:10', 'y1:30']);
  });

  it('clears one page or all of them', () => {
    const p = make();
    const [a, b] = p.artboards.map((x) => x.id);
    addGuide(p, a, 'x', 10);
    addGuide(p, a, 'y', 20);
    addGuide(p, b, 'x', 30);
    expect(guideCount(p)).toBe(3);
    clearGuides(p, b, 'page');
    expect(guideCount(p)).toBe(2);
    clearGuides(p, a, 'all');
    expect(guideCount(p)).toBe(0);
  });

  it('the exports leave the guides out', () => {
    const p = make();
    p.guidesLocked = true;
    p.artboards[0].guides = { x: [2], y: [] };
    p.canvasGuides = { x: [5], y: [] };
    const out = withoutLinks(p);
    expect('guidesLocked' in out).toBe(false);
    expect('canvasGuides' in out).toBe(false);
    expect(out.artboards.some((a) => 'guides' in a)).toBe(false);
    // and the project itself is not touched
    expect(p.artboards[0].guides).toBeTruthy();
    expect(p.canvasGuides).toEqual({ x: [5], y: [] });
    expect(withoutLinks(make())).toBeTruthy();
  });
});

describe('universal guides (canvas coordinates)', () => {
  it('adds once, moves in place, and tidies an empty list away', () => {
    const p = make();
    addUniversalGuide(p, 'x', 100);
    addUniversalGuide(p, 'x', 100);
    addUniversalGuide(p, 'y', -40);
    expect(p.canvasGuides).toEqual({ x: [100], y: [-40] });
    moveUniversalGuide(p, { axis: 'y', index: 0 }, 60);
    expect(universalGuidesOf(p).map((g) => `${g.kind}:${g.axis}${g.index}:${g.at}`)).toEqual(['universal:x0:100', 'universal:y0:60']);
    removeUniversalGuide(p, { axis: 'x', index: 0 });
    removeUniversalGuide(p, { axis: 'y', index: 0 });
    expect(p.canvasGuides).toBeUndefined();
    expect(guidesOf(p.artboards[0]).every((g) => g.kind === 'page')).toBe(true);
  });

  it('stays put when a page moves, where an attached one goes with it', () => {
    const p = make();
    addUniversalGuide(p, 'x', 1100);
    addGuide(p, p.artboards[1].id, 'x', 100);
    // both are at canvas 1100, which is 100 into B (it starts at 1000)
    expect(guidesAcross(p, p.artboards[1]).x).toEqual([100]);
    p.artboards[1].canvasX = 2000;
    // B has left: the attached one went with it (still 100 in), the universal one is where it was and B is no longer under it
    expect(guidesAcross(p, p.artboards[1]).x).toEqual([100]);
    expect(guidesAcross(p, p.artboards[0]).x).toEqual([]);
    p.artboards[1].canvasX = 1000;
    p.artboards[1].guides = undefined;
    expect(guidesAcross(p, p.artboards[1]).x).toEqual([100]);
    p.artboards[1].canvasX = 2000;
    expect(guidesAcross(p, p.artboards[1]).x).toEqual([]);
    // moving A by 50 changes nothing for a universal guide at canvas 300
    addUniversalGuide(p, 'x', 300);
    expect(guidesAcross(p, p.artboards[0]).x).toEqual([300]);
    p.artboards[0].canvasX = 50;
    expect(guidesAcross(p, p.artboards[0]).x).toEqual([250]);
  });

  it('crosses every page it is over, level or not, in that page\'s pixels', () => {
    const p = make();
    p.artboards[1].canvasY = 100;
    addUniversalGuide(p, 'y', 150);
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([150]);
    expect(guidesAcross(p, p.artboards[1]).y).toEqual([50]);
    addUniversalGuide(p, 'y', 700);
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([150]);
  });

  it('counts with the attached ones, and the clears are per kind', () => {
    const p = make();
    const [a] = p.artboards.map((x) => x.id);
    addGuide(p, a, 'x', 10);
    addUniversalGuide(p, 'x', 20);
    addUniversalGuide(p, 'y', 30);
    expect(guideCount(p)).toBe(3);
    clearGuides(p, a, 'universal');
    expect(p.canvasGuides).toBeUndefined();
    expect(guideCount(p)).toBe(1);
    addUniversalGuide(p, 'x', 20);
    clearGuides(p, a, 'page');
    expect(guideCount(p)).toBe(1);
    clearGuides(p, a, 'all');
    expect(guideCount(p)).toBe(0);
    expect(p.canvasGuides).toBeUndefined();
  });

  it('converting keeps the line where it is on the canvas', () => {
    const p = make();
    const b = p.artboards[1];
    addGuide(p, b.id, 'x', 120);
    addGuide(p, b.id, 'y', 30);
    makeUniversal(p, b.id, { axis: 'x', index: 0 });
    expect(p.canvasGuides).toEqual({ x: [1120], y: [] });
    expect(b.guides).toEqual({ x: [], y: [30] });
    makeUniversal(p, b.id, { axis: 'y', index: 0 });
    expect(b.guides).toBeUndefined();
    attachToPage(p, b.id, { axis: 'x', index: 0 });
    expect(b.guides).toEqual({ x: [120], y: [] });
    expect(p.canvasGuides).toEqual({ x: [], y: [30] });
  });

  it('the page a universal guide attaches to: the open one if it crosses it, else the first it crosses, else none', () => {
    const p = make();
    const [a, b] = p.artboards;
    expect(pageForUniversal(p, { axis: 'x', at: 1100 }, a.id)?.id).toBe(b.id);
    expect(pageForUniversal(p, { axis: 'y', at: 100 }, b.id)?.id).toBe(b.id);
    expect(pageForUniversal(p, { axis: 'y', at: 100 }, null)?.id).toBe(a.id);
    expect(pageForUniversal(p, { axis: 'x', at: 900 }, a.id)).toBeUndefined();
    b.canvasHidden = true;
    expect(pageForUniversal(p, { axis: 'x', at: 1100 }, a.id)).toBeUndefined();
  });
});

describe('a guide is an endless line (guidesAcross)', () => {
  it('a guide of A lands on B at the canvas place, where B is under that line', () => {
    const p = make();
    // A is at 0..800 x 0..600, B at 1000..1400 x 0..300
    p.artboards[1].canvasY = 100;
    p.artboards[0].guides = { x: [900, 100], y: [150, 450] };
    // vertical lines: A's 900 is at canvas x 900, nowhere on B (starts at 1000); 100 is not on B either
    // horizontal lines: canvas y 150 is 50 down B (which starts at 100), 450 is below B (it ends at 400)
    expect(guidesAcross(p, p.artboards[1])).toEqual({ x: [], y: [50] });
    // on A itself its own lines fall on it (the 900 is past its right edge)
    expect(guidesAcross(p, p.artboards[0])).toEqual({ x: [100], y: [150, 450] });
  });

  it('a guide of B crosses A when B is to its left or above, and moves with the page', () => {
    const p = make();
    p.artboards[1].guides = { x: [], y: [200] };
    // B is level with A (both top at 0): the line is 200 down both
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([200]);
    p.artboards[1].canvasY = 300;
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([500]);
    p.artboards[1].canvasY = 1000;
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([]);
  });

  it('a line that has no page under it on that axis crosses nothing, a vertical one needs the page\'s x range', () => {
    const p = make();
    p.artboards[1].guides = { x: [10], y: [] };
    // B's 10 is canvas x 1010: past A (0..800)
    expect(guidesAcross(p, p.artboards[0]).x).toEqual([]);
    expect(guidesAcross(p, p.artboards[1]).x).toEqual([10]);
  });

  it('hidden library copies have no guides on show, and duplicates are listed once', () => {
    const p = make();
    p.artboards[1].canvasHidden = true;
    p.artboards[1].guides = { x: [], y: [10] };
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([]);
    p.artboards[1].canvasHidden = false;
    p.artboards[0].guides = { x: [], y: [10] };
    expect(guidesAcross(p, p.artboards[0]).y).toEqual([10]);
  });
});

describe('old every-page guides become the start page\'s', () => {
  it('moves them onto the start page, drops the negative ones and keeps the page\'s own', () => {
    const p = make();
    p.settings.startArtboardId = p.artboards[1].id;
    p.guides = { x: [100, -20, 700], y: [50] };
    p.artboards[1].guides = { x: [100], y: [] };
    expect(migrateProjectGuides(p)).toBe(true);
    expect(p.guides).toBeUndefined();
    expect(p.artboards[1].guides).toEqual({ x: [100, 700], y: [50] });
    expect(p.artboards[0].guides).toBeUndefined();
    expect(migrateProjectGuides(p)).toBe(false);
  });

  it('falls back to the first page, and leaves nothing behind when they were all negative', () => {
    const p = make();
    p.settings.startArtboardId = null;
    p.guides = { x: [-1], y: [-5] };
    migrateProjectGuides(p);
    expect(p.guides).toBeUndefined();
    expect(p.artboards[0].guides).toBeUndefined();
    p.guides = { x: [], y: [9] };
    migrateProjectGuides(p);
    expect(p.artboards[0].guides).toEqual({ x: [], y: [9] });
  });

  it('opening a project in the editor does it, and so does swapping in a reloaded one', () => {
    const old = make();
    old.guides = { x: [120], y: [] };
    const s = new EditorStore(old);
    expect(s.get().project.guides).toBeUndefined();
    expect(s.get().project.artboards[0].guides).toEqual({ x: [120], y: [] });
    const again = make();
    again.guides = { x: [], y: [60] };
    s.replaceProject(again);
    expect(s.get().project.guides).toBeUndefined();
    expect(s.get().project.artboards[0].guides).toEqual({ x: [], y: [60] });
  });
});

describe('guides in the editor', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => void setTimeout(fn, 0));
    s = new EditorStore(make());
    setCurrentStore(s);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it('a page that is not the open one still draws its guides, endless and dimmed, in the one colour', () => {
    s.update((d) => void ((d.artboards[1].guides = { x: [100], y: [50] })));
    setPrefs({ rulers: true });
    act(() => root.render(<Canvas />));
    // A is open: B's two marks show, A's own are the rulers'
    const marks = [...host.querySelectorAll('.guide-mark')];
    expect(marks.map((n) => n.getAttribute('class'))).toEqual(['guide-mark', 'guide-mark']);
    // each runs far past B (it is not limited to the page)
    for (const m of marks) {
      const span = Math.abs(Number(m.getAttribute('x2')) - Number(m.getAttribute('x1'))) + Math.abs(Number(m.getAttribute('y2')) - Number(m.getAttribute('y1')));
      expect(span).toBeGreaterThan(100000);
    }
    // open B: now A has none, so no marks
    act(() => s.set({ activeArtboardId: s.get().project.artboards[1].id }));
    expect(host.querySelectorAll('.guide-mark')).toHaveLength(0);
  });

  it('the commands lock and clear them, and there is no every-page command', () => {
    s.update((d) => void (d.artboards[0].guides = { x: [100], y: [] }));
    const run = (title: string) => {
      const c = buildCommands().find((x) => x.title === title)!;
      expect(c.disabled).toBeFalsy();
      act(() => void c.run());
    };
    expect(buildCommands().filter((x) => x.id.startsWith('view:guides')).map((x) => x.id)).toEqual(['view:guides-lock', 'view:guides-clear-universal', 'view:guides-clear']);
    run('Lock the guides');
    expect(s.get().project.guidesLocked).toBe(true);
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
    run('Unlock the guides');
    expect(s.get().project.guidesLocked).toBeUndefined();
    run('Clear all guides');
    expect(s.get().project.artboards[0].guides).toBeUndefined();
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
  });

  it('Clear universal guides leaves the attached ones', () => {
    s.update((d) => void ((d.artboards[0].guides = { x: [100], y: [] }), (d.canvasGuides = { x: [], y: [40] })));
    const c = buildCommands().find((x) => x.title === 'Clear universal guides')!;
    expect(c.disabled).toBeFalsy();
    act(() => void c.run());
    expect(s.get().project.canvasGuides).toBeUndefined();
    expect(s.get().project.artboards[0].guides).toEqual({ x: [100], y: [] });
    expect(buildCommands().find((x) => x.title === 'Clear universal guides')!.disabled).toBeTruthy();
  });

  it('the guides menu is lock, clear this page, clear universal and clear all, with the ones that do nothing greyed', () => {
    const items = guidesMenuItems(s.get().project.artboards[0].id);
    const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label);
    expect(labels).toEqual(['Lock guides', 'Clear this page’s guides', 'Clear universal guides', 'Clear all guides']);
    expect(items.some((i) => 'heading' in i)).toBe(false);
    const clear = items.find((i) => 'label' in i && i.label === 'Clear all guides') as { disabled?: boolean };
    expect(clear.disabled).toBe(true);
  });
  it('every attached guide has a pin where it meets its page, the open page\'s included; universal ones have none', () => {
    s.update((d) => void ((d.artboards[0].guides = { x: [100], y: [] }), (d.artboards[1].guides = { x: [], y: [50] }), (d.canvasGuides = { x: [300], y: [] })));
    setPrefs({ rulers: true });
    act(() => root.render(<Canvas />));
    expect(host.querySelectorAll('.guide-pin')).toHaveLength(2);
    // and only the other page's line is a dim mark; the open page's is the rulers'
    expect(host.querySelectorAll('.guide-mark')).toHaveLength(1);
  });

  it('the preference default: new guides are universal', async () => {
    const { PREF_DEFAULTS } = await import('../src/lib/prefs');
    expect(PREF_DEFAULTS.attachGuides).toBe(false);
  });
});

describe('the guide right-click menu takes clicks', () => {
  it('a context menu sets pointer-events back on, since the rulers layer lets the pointer through', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`(^|\\n)${sel.replace('.', '\\.')} \\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    // the rulers overlay is see-through to the pointer, and the guide menu is drawn inside it
    expect(rule('.rulers')).toMatch(/pointer-events:\s*none/);
    expect(rule('.ctx-menu')).toMatch(/pointer-events:\s*auto/);
  });
});

describe('how a guide looks', () => {
  it('one colour (pink), dashed, for the open page\'s lines and the other pages\' marks alike', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`(^|\\n)${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    expect(css).toMatch(/--guide:\s*#ff4fa3/);
    expect(css).not.toMatch(/--guide-page|--guide-project|#a855f7/);
    expect(rule('.guide-line.x::after')).toMatch(/repeating-linear-gradient\(to bottom, var\(--guide\) 0 6px, transparent/);
    expect(rule('.guide-line.y::after')).toMatch(/repeating-linear-gradient\(to right, var\(--guide\) 0 6px, transparent/);
    expect(rule('.guide-mark')).toMatch(/stroke:\s*var\(--guide\)/);
    expect(rule('.guide-mark')).toMatch(/stroke-dasharray/);
    expect(css).not.toMatch(/\.guide-(line|mark|pos)\.project/);
    // the pin on an attached guide is the same colour, and the overlay sits above the guide lines so handles beat a guide's grab strip
    expect(rule('.guide-pin')).toMatch(/fill:\s*var\(--guide\)/);
    expect(rule('.overlay')).toMatch(/z-index:\s*2/);
    expect(rule('.guide-line')).toMatch(/z-index:\s*1/);
  });
});
