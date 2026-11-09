import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createArtboard, createProject, type Project } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { Canvas } from '../src/canvas/Canvas';
import { withoutLinks } from '../src/lib/export';
import { setPrefs } from '../src/lib/prefs';
import { buildCommands } from '../src/lib/commands';
import { addGuide, clearGuides, convertGuide, guideCount, guidesMenuItems, guidesOn, moveGuide, projectGuidesOn, removeGuide, shareAllPageGuides } from '../src/lib/guides';

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
  it('adds to the project or the page, once, and tidies empty lists away', () => {
    const p = make();
    const a = p.artboards[0].id;
    addGuide(p, a, 'project', 'x', 100);
    addGuide(p, a, 'project', 'x', 100);
    addGuide(p, a, 'page', 'y', 50);
    expect(p.guides).toEqual({ x: [100], y: [] });
    expect(p.artboards[0].guides).toEqual({ x: [], y: [50] });
    removeGuide(p, a, { scope: 'project', axis: 'x', index: 0 });
    removeGuide(p, a, { scope: 'page', axis: 'y', index: 0 });
    expect(p.guides).toBeUndefined();
    expect(p.artboards[0].guides).toBeUndefined();
  });

  it('moves one in place', () => {
    const p = make();
    addGuide(p, p.artboards[0].id, 'project', 'y', 10);
    addGuide(p, p.artboards[0].id, 'project', 'y', 20);
    moveGuide(p, p.artboards[0].id, { scope: 'project', axis: 'y', index: 1 }, 30);
    expect(p.guides!.y).toEqual([10, 30]);
  });

  it('turns a page guide into a project one and back, without doubling a twin', () => {
    const p = make();
    const a = p.artboards[0].id;
    addGuide(p, a, 'page', 'x', 100);
    addGuide(p, a, 'project', 'x', 100);
    convertGuide(p, a, { scope: 'page', axis: 'x', index: 0, at: 100 }, 'project');
    expect(p.guides).toEqual({ x: [100], y: [] });
    expect(p.artboards[0].guides).toBeUndefined();
    convertGuide(p, a, { scope: 'project', axis: 'x', index: 0, at: 100 }, 'page');
    expect(p.guides).toBeUndefined();
    expect(p.artboards[0].guides).toEqual({ x: [100], y: [] });
  });

  it('shares every guide of a page, and clears page, project or all', () => {
    const p = make();
    const [a, b] = p.artboards.map((x) => x.id);
    addGuide(p, a, 'page', 'x', 10);
    addGuide(p, a, 'page', 'y', 20);
    addGuide(p, b, 'page', 'x', 30);
    expect(shareAllPageGuides(p, a)).toBe(2);
    expect(p.guides).toEqual({ x: [10], y: [20] });
    expect(guideCount(p)).toEqual({ project: 2, pages: 1 });
    clearGuides(p, b, 'page');
    expect(guideCount(p)).toEqual({ project: 2, pages: 0 });
    addGuide(p, b, 'page', 'x', 30);
    clearGuides(p, b, 'project');
    expect(guideCount(p)).toEqual({ project: 0, pages: 1 });
    addGuide(p, a, 'project', 'x', 5);
    clearGuides(p, a, 'all');
    expect(guideCount(p)).toEqual({ project: 0, pages: 0 });
  });

  it('a project guide shows only on the pages it falls on', () => {
    const p = make();
    p.guides = { x: [100, 600], y: [250, 500] };
    expect(projectGuidesOn(p, p.artboards[0])).toEqual({ x: [100, 600], y: [250, 500] });
    expect(projectGuidesOn(p, p.artboards[1])).toEqual({ x: [100], y: [250] });
    p.artboards[1].guides = { x: [5], y: [] };
    expect(guidesOn(p, p.artboards[1]).map((g) => `${g.scope}:${g.axis}${g.at}`)).toEqual(['project:x100', 'project:y250', 'page:x5']);
  });

  it('the exports leave the guides out', () => {
    const p = make();
    p.guides = { x: [1], y: [] };
    p.guidesLocked = true;
    p.artboards[0].guides = { x: [2], y: [] };
    const out = withoutLinks(p);
    expect('guides' in out).toBe(false);
    expect('guidesLocked' in out).toBe(false);
    expect(out.artboards.some((a) => 'guides' in a)).toBe(false);
    // and the project itself is not touched
    expect(p.guides).toBeTruthy();
    expect(withoutLinks(make())).toBeTruthy();
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

  it('a page that is not the open one still shows its guides, and the project ones that fit it, dimmed', () => {
    s.update((d) => void ((d.guides = { x: [100, 700], y: [] }), (d.artboards[1].guides = { x: [], y: [50] })));
    setPrefs({ rulers: true });
    act(() => root.render(<Canvas />));
    // A is open: B's marks show (100 fits B, 700 does not, plus B's own y 50), A's own are the rulers'
    const marks = [...host.querySelectorAll('.guide-mark')].map((n) => n.getAttribute('class'));
    expect(marks.sort()).toEqual(['guide-mark page', 'guide-mark project']);
    // open B: now A's marks show
    act(() => s.set({ activeArtboardId: s.get().project.artboards[1].id }));
    expect([...host.querySelectorAll('.guide-mark')].map((n) => n.getAttribute('class'))).toEqual(['guide-mark project', 'guide-mark project']);
  });

  it('the commands lock and clear them', () => {
    s.update((d) => void (d.guides = { x: [100], y: [] }));
    const run = (title: string) => {
      const c = buildCommands().find((x) => x.title === title)!;
      expect(c.disabled).toBeFalsy();
      act(() => void c.run());
    };
    run('Lock the guides');
    expect(s.get().project.guidesLocked).toBe(true);
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
    run('Unlock the guides');
    expect(s.get().project.guidesLocked).toBeUndefined();
    run('Clear all guides');
    expect(s.get().project.guides).toBeUndefined();
    expect(buildCommands().find((x) => x.title === 'Clear all guides')!.disabled).toBeTruthy();
  });

  it('the guides menu lists the choices, with the ones that do nothing greyed', () => {
    const items = guidesMenuItems(s.get().project.artboards[0].id);
    const labels = items.filter((i) => 'label' in i).map((i) => (i as { label: string }).label);
    expect(labels).toContain('Lock guides');
    expect(labels).toContain('Clear all guides');
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

describe('how the two kinds of guide look', () => {
  it('both are dashed, page guides pink and every-page guides purple', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');
    const rule = (sel: string) => new RegExp(`(^|\\n)${sel.replace(/\./g, '\\.')} \\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    expect(css).toMatch(/--guide-page:\s*#ff4fa3/);
    expect(css).toMatch(/--guide-project:\s*#a855f7/);
    expect(rule('.guide-line.x::after')).toMatch(/repeating-linear-gradient\(to bottom, var\(--guide\) 0 6px, transparent/);
    expect(rule('.guide-line.y::after')).toMatch(/repeating-linear-gradient\(to right, var\(--guide\) 0 6px, transparent/);
    expect(rule('.guide-line.project')).toMatch(/--guide:\s*var\(--guide-project\)/);
    expect(rule('.guide-mark')).toMatch(/stroke-dasharray/);
    expect(rule('.guide-mark.project')).toMatch(/stroke:\s*var\(--guide-project\)/);
  });
});
