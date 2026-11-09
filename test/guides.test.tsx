import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject, migrateProjectGuides, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { withoutLinks } from '../src/lib/export';
import { setPrefs } from '../src/lib/prefs';
import { buildCommands } from '../src/lib/commands';
import { addGuide, clearGuides, guideCount, guidesAcross, guidesMenuItems, guidesOf, moveGuide, removeGuide } from '../src/lib/guides';

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
    const out = withoutLinks(p);
    expect('guidesLocked' in out).toBe(false);
    expect(out.artboards.some((a) => 'guides' in a)).toBe(false);
    // and the project itself is not touched
    expect(p.artboards[0].guides).toBeTruthy();
    expect(withoutLinks(make())).toBeTruthy();
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
    expect(buildCommands().filter((x) => x.id.startsWith('view:guides')).map((x) => x.id)).toEqual(['view:guides-lock', 'view:guides-clear']);
    run('Lock the guides');
    expect(s.get().project.guidesLocked).toBe(true);
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
    run('Unlock the guides');
    expect(s.get().project.guidesLocked).toBeUndefined();
    run('Clear all guides');
    expect(s.get().project.artboards[0].guides).toBeUndefined();
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
  });

  it('the guides menu is lock, clear this page and clear all, with the ones that do nothing greyed', () => {
    const items = guidesMenuItems(s.get().project.artboards[0].id);
    const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label);
    expect(labels).toEqual(['Lock guides', 'Clear this page’s guides', 'Clear all guides']);
    expect(items.some((i) => 'heading' in i)).toBe(false);
    const clear = items.find((i) => 'label' in i && i.label === 'Clear all guides') as { disabled?: boolean };
    expect(clear.disabled).toBe(true);
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
  });
});
