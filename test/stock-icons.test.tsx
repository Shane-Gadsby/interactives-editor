import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createProject, type PathNode, type Project, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { IconsPanel } from '../src/panels/IconsPanel';
import { ICON_COLOURS, GLYPH_HEX, defaultIconColour, iconNode, iconPaints, loadStockIcons, searchIcons } from '../src/lib/stock-icons';
import { STOCK_ICON_DATA } from '../src/lib/stock-icons-data';
import { parsePathData } from '../src/lib/svg-import';
import { newProjectWithThemes } from '../src/lib/themes';
import { locate } from '../src/store/doc';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TOOLBOX = path.resolve(__dirname, '..', '..', 'toolbox', 'public');
const haveToolbox = fs.existsSync(path.join(TOOLBOX, 'sys', 'js', 'icons.js'));

describe('the icons are the Toolbox\'s own', () => {
  it.skipIf(!haveToolbox)('every icon in the Toolbox\'s Icon Set picker is here, by the name the picker gives it, and nothing else but its chevron', () => {
    const src = fs.readFileSync(path.join(TOOLBOX, 'sys', 'js', 'icons.js'), 'utf8');
    const picker = [...src.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(picker.length).toBeGreaterThanOrEqual(24);
    const ours = STOCK_ICON_DATA.map((i) => i.title);
    for (const t of picker) expect(ours, t).toContain(t);
    expect(ours.filter((t) => !picker.includes(t))).toEqual(['Chevron']);
    // and every file the Toolbox has is one of ours
    const files = fs.readdirSync(path.join(TOOLBOX, 'images', 'icons')).filter((f) => /^SDC__Icon_/.test(f));
    expect(files).toHaveLength(STOCK_ICON_DATA.length);
  });

  it.skipIf(!haveToolbox)('the path data is what is in the Toolbox\'s files', () => {
    const svg = fs.readFileSync(path.join(TOOLBOX, 'images', 'icons', 'SDC__Icon_Alarm.svg'), 'utf8');
    const alarm = STOCK_ICON_DATA.find((i) => i.id === 'alarm')!;
    for (const d of [...alarm.ring, ...alarm.glyph]) expect(svg.replace(/\s+/g, ' ')).toContain(d.slice(0, 40));
  });

  it('each has a ring and a glyph that parse into real shapes, and a name', () => {
    expect(STOCK_ICON_DATA).toHaveLength(25);
    for (const i of STOCK_ICON_DATA) {
      expect(i.title, i.id).toBeTruthy();
      expect(i.id).toMatch(/^[a-z0-9-]+$/);
      expect(i.ring.length, i.id).toBeGreaterThan(0);
      expect(i.glyph.length, i.id).toBeGreaterThan(0);
      for (const d of [...i.ring, ...i.glyph]) expect(parsePathData(d).some((s) => s.points.length > 2), i.id).toBe(true);
    }
    expect(new Set(STOCK_ICON_DATA.map((i) => i.id)).size).toBe(STOCK_ICON_DATA.length);
  });

  it('loads lazily, once', async () => {
    const a = await loadStockIcons();
    const b = await loadStockIcons();
    expect(a).toBe(b);
    expect(a).toHaveLength(25);
  });
});

describe('searching by plain words', () => {
  const find = (q: string) => searchIcons(STOCK_ICON_DATA, q).map((i) => i.title);
  it('finds by name, prefix, and the words people use', () => {
    expect(find('alarm')[0]).toBe('Alarm');
    expect(find('bell')[0]).toBe('Alarm');
    expect(find('tick')[0]).toBe('Assessment');
    expect(find('speech bubble')[0]).toBe('Discuss/ Communicate');
    expect(find('clock')[0]).toBe('Time');
    expect(find('heart')[0]).toBe('Love');
    expect(find('lightbulb')[0]).toBe('Think');
    expect(find('magnif')[0]).toBe('Search');
    expect(find('envelope')[0]).toBe('Mail');
    expect(find('arrow')).toEqual(expect.arrayContaining(['Chevron', 'Download']));
  });
  it('the name beats a looser word, and every word has to match', () => {
    expect(find('time')[0]).toBe('Time');
    expect(find('clock banana')).toEqual([]);
    expect(find('  ')).toHaveLength(25);
    expect(find('zzzz')).toEqual([]);
  });
  it('is not case sensitive', () => {
    expect(find('BELL')[0]).toBe('Alarm');
    expect(find('Thumbs')[0]).toBe('Thumbs Up');
  });
});

describe('the layers an icon makes', () => {
  const alarm = STOCK_ICON_DATA.find((i) => i.id === 'alarm')!;
  const kids = (n: SceneNode) => (n as unknown as { children: PathNode[] }).children;
  it('is a decorative group of a Ring and an Icon path, centred where asked, 96 across', () => {
    const p = createProject('T');
    const g = iconNode(alarm, 'gold', p, { x: 500, y: 300 });
    expect(g.type).toBe('group');
    expect(g.name).toBe('Alarm icon');
    expect([g.x, g.y, g.width, g.height]).toEqual([452, 252, 96, 96]);
    expect((g as { decorative?: boolean }).decorative).toBe(true);
    const [ring, glyph] = kids(g);
    expect([ring.name, glyph.name]).toEqual(['Ring', 'Icon']);
    expect(ring.type).toBe('path');
    expect(ring.fill).toEqual({ type: 'solid', color: '#ffb448' });
    expect(glyph.fill).toEqual({ type: 'solid', color: GLYPH_HEX });
    // the ring is the whole board: 96 px
    expect(ring.width).toBeCloseTo(96, 0);
    expect(ring.height).toBeCloseTo(96, 0);
    // the glyph sits inside it
    expect(glyph.x).toBeGreaterThan(ring.x);
    expect(glyph.x + glyph.width).toBeLessThan(ring.x + ring.width);
    // real vector points, not an image
    expect(ring.paths.length).toBeGreaterThan(0);
    expect(glyph.paths.flatMap((s) => s.points).length).toBeGreaterThan(8);
  });
  it('scales with the size asked for', () => {
    const p = createProject('T');
    const big = kids(iconNode(alarm, 'gold', p, { x: 0, y: 0 }, 192))[0];
    expect(big.width).toBeCloseTo(192, 0);
  });
  it('each of the Toolbox\'s colours paints the ring, and the glyph stays near-black', () => {
    const p = createProject('T');
    expect(ICON_COLOURS.map((c) => c.id)).toEqual(['gold', 'orange', 'green', 'blue', 'purple', 'charcoal']);
    for (const c of ICON_COLOURS) {
      const [ring, glyph] = kids(iconNode(alarm, c.id, p, { x: 0, y: 0 }));
      expect((ring.fill as { color: string }).color).toBe(c.hex);
      expect((glyph.fill as { color: string }).color).toBe(GLYPH_HEX);
    }
  });
  it('Follow theme paints with the project\'s tokens when it has them, so a theme change recolours it', () => {
    const themed: Project = newProjectWithThemes('Themed');
    const { ring, glyph } = iconPaints('theme', themed);
    expect(ring).toMatch(/^token:/);
    expect(glyph).toMatch(/^token:/);
    const g = iconNode(alarm, 'theme', themed, { x: 0, y: 0 });
    expect((kids(g)[0].fill as { color: string }).color).toBe(ring);
    expect(defaultIconColour(themed)).toBe('theme');
    const plain = createProject('Plain');
    expect(defaultIconColour(plain)).toBe('gold');
    // with no tokens it is the starter colours, plain hex
    expect(iconPaints('theme', plain).ring).toMatch(/^#/);
  });
});

describe('the Icons tab', () => {
  let root: Root;
  let host: HTMLElement;
  let s: EditorStore;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    s = new EditorStore(createProject('T'));
    setCurrentStore(s);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  const items = () => [...host.querySelectorAll<HTMLButtonElement>('.icons-item')];
  const type = (v: string) =>
    act(() => {
      const i = host.querySelector<HTMLInputElement>('.icons-search')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(i, v);
      i.dispatchEvent(new Event('input', { bubbles: true }));
    });

  it('shows every icon with its name, each a labelled button, after a moment loading', async () => {
    act(() => root.render(<IconsPanel />));
    await settle();
    expect(items()).toHaveLength(25);
    expect(items()[0].getAttribute('aria-label')).toBe('Add the Alarm icon');
    expect(items()[0].textContent).toBe('Alarm');
    expect(host.querySelector('.icons-search')!.getAttribute('aria-label')).toBe('Search icons');
  });

  it('searches as you type, says so when nothing matches', async () => {
    act(() => root.render(<IconsPanel />));
    await settle();
    type('bell');
    expect(items().map((b) => b.textContent)).toEqual(['Alarm']);
    type('qqq');
    expect(items()).toHaveLength(0);
    expect(host.textContent).toContain('No icon matches');
    type('');
    expect(items()).toHaveLength(25);
  });

  it('a click adds the icon to the middle of the artboard in the chosen colour, selected', async () => {
    act(() => root.render(<IconsPanel />));
    await settle();
    act(() => host.querySelector<HTMLButtonElement>('[role="radio"][aria-label="Green"]')!.click());
    expect(host.querySelector('[role="radio"][aria-label="Green"]')!.getAttribute('aria-checked')).toBe('true');
    act(() => items().find((b) => b.textContent === 'Time')!.click());
    const ab = s.artboard()!;
    const g = ab.children.at(-1)!;
    expect(g.name).toBe('Time icon');
    expect(g.x + g.width / 2).toBeCloseTo(ab.width / 2, 0);
    expect(g.y + g.height / 2).toBeCloseTo(ab.height / 2, 0);
    const ring = (g as unknown as { children: PathNode[] }).children[0];
    expect((ring.fill as { color: string }).color).toBe('#3E8521');
    expect(s.get().toast?.text).toMatch(/Added the Time icon/);
    expect(locate(ab, g.id)).toBeTruthy();
    // one undo step
    s.undo();
    expect(s.artboard()!.children.some((c) => c.name === 'Time icon')).toBe(false);
  });

  it('a project with themes starts on Follow theme and adds token colours', async () => {
    s = new EditorStore(newProjectWithThemes('Themed'));
    setCurrentStore(s);
    act(() => root.render(<IconsPanel />));
    await settle();
    const theme = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent === 'Follow theme')!;
    expect(theme.getAttribute('aria-checked')).toBe('true');
    act(() => items()[0].click());
    const ring = (s.artboard()!.children.at(-1) as unknown as { children: PathNode[] }).children[0];
    expect((ring.fill as { color: string }).color).toMatch(/^token:/);
  });

  it('the colours are a labelled radio group, one chosen at a time', async () => {
    act(() => root.render(<IconsPanel />));
    await settle();
    const group = host.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe('Icon colour');
    const radios = [...group.querySelectorAll('[role="radio"]')];
    expect(radios).toHaveLength(7);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });
});
