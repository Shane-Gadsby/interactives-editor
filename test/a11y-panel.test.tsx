import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNode, createProject, type SceneNode } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { AccessibilityPanel } from '../src/panels/AccessibilityPanel';
import { colourAround, imageColoursFrom, pictureAssets, type ImageGrid } from '../src/lib/a11y/images';
import { loadReviewed, toggleReviewed } from '../src/lib/a11y/reviewed';
import { checkAccessibility } from '../src/lib/a11y/checks';
import { reportCsv, reportHtml } from '../src/lib/a11y/report';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
let low: SceneNode;
let pic: SceneNode;

beforeEach(() => {
  localStorage.clear();
  const p = createProject('Panel test');
  p.settings.title = 'Panel test';
  low = createNode('text', { name: 'Caption', x: 20, y: 20, width: 300, height: 24, text: 'Grey words on white', color: '#aaaaaa' });
  pic = createNode('image', { name: 'Image 3', assetId: null, x: 0, y: 100, width: 100, height: 100 });
  Object.assign(pic, { assetId: 'a1' });
  p.assets.push({ id: 'a1', name: 'kite.png', mime: 'image/png', size: 1 });
  p.artboards[0].children.push(low, pic);
  s = new EditorStore(p);
  setCurrentStore(s);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<AccessibilityPanel />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rows = () => Array.from(host.querySelectorAll<HTMLElement>('.a11y-row'));
const btn = (text: string) => Array.from(host.querySelectorAll<HTMLElement>('button')).find((b) => (text === 'Apply' ? b.textContent?.trim() === text : b.textContent?.trim().startsWith(text)));

describe('the accessibility panel', () => {
  it('lists the findings under their artboard, with counts', () => {
    expect(host.querySelector('.a11y-group-head')?.textContent).toContain('Home');
    expect(rows().map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Low text contrast'), expect.stringContaining('Picture has no description')]));
    expect(host.querySelector('.a11y-chip.issue .a11y-count')?.textContent).toBe('1');
  });

  it('selects the layer when a finding is clicked, and shows why it matters', () => {
    const row = rows().find((r) => r.textContent?.includes('Low text contrast'))!;
    act(() => row.click());
    expect(s.get().selection).toEqual([low.id]);
    expect(host.querySelector('.usage-detail')?.textContent).toContain('Why it matters');
    expect(host.querySelector('.usage-detail')?.textContent).toMatch(/\d\.\d+:1/);
  });

  it('applies a fix as one undo step', () => {
    act(() => rows().find((r) => r.textContent?.includes('Low text contrast'))!.click());
    act(() => btn('Change the text colour')!.click());
    expect((s.get().project.artboards[0].children[0] as { color: string }).color).not.toBe('#aaaaaa');
    expect(rows().some((r) => r.textContent?.includes('Low text contrast'))).toBe(false);
    act(() => s.undo());
    expect((s.get().project.artboards[0].children[0] as { color: string }).color).toBe('#aaaaaa');
  });

  it('takes a typed description for a picture, and refuses an empty one', () => {
    act(() => rows().find((r) => r.textContent?.includes('Picture has no description'))!.click());
    act(() => btn('Apply')!.click());
    expect((s.get().project.artboards[0].children[1] as SceneNode).ariaLabel).toBeUndefined();
    const input = host.querySelector<HTMLInputElement>('.a11y-input input')!;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'A red kite over a hill');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => btn('Apply')!.click());
    expect((s.get().project.artboards[0].children[1] as SceneNode).ariaLabel).toBe('A red kite over a hill');
  });

  it('marks a finding reviewed, drops it from the counts, and remembers it for the project', () => {
    act(() => rows().find((r) => r.textContent?.includes('Picture has no description'))!.click());
    act(() => btn('Decorative / reviewed')!.click());
    expect(rows().some((r) => r.textContent?.includes('Picture has no description'))).toBe(false);
    expect(Object.keys(loadReviewed(s.get().project.id))).toHaveLength(1);
    const show = host.querySelector<HTMLInputElement>('.usage-only input')!;
    act(() => show.click());
    expect(rows().some((r) => r.textContent?.includes('Picture has no description'))).toBe(true);
  });

  it('applies every fix that needs no typing in one go', () => {
    act(() => btn('Apply quick fixes')!.click());
    expect(checkAccessibility(s.get().project).findings.some((f) => f.check === 'contrast')).toBe(false);
  });
});

describe('pictures behind text', () => {
  const grid: ImageGrid = { cols: 2, rows: 2, width: 200, height: 100, data: [0, 0, 0, 255, 255, 255, 255, 255, 10, 10, 10, 255, 250, 250, 250, 255] };

  it('maps a point of the layer onto the picture for each fit', () => {
    // fill stretches: the left half of the layer is the left column of the grid
    expect(colourAround(grid, 'fill', 400, 200, 10, 10)).toEqual([[0, 0, 0], [255, 255, 255], [10, 10, 10], [250, 250, 250]]);
    // contain in a tall box leaves bands above and below the picture, which is see-through
    expect(colourAround(grid, 'contain', 200, 400, 100, 5)).toEqual([]);
    expect(colourAround(grid, 'contain', 200, 400, 100, 200)).not.toEqual([]);
    // cover in a tall box crops the sides: the layer's far left is already inside the picture
    expect(colourAround(grid, 'cover', 100, 200, 0, 100)).not.toEqual([]);
    expect(colourAround(undefined, 'cover', 100, 100, 5, 5)).toBeNull();
  });

  it('skips see-through cells', () => {
    const g: ImageGrid = { cols: 1, rows: 1, width: 10, height: 10, data: [200, 0, 0, 40] };
    expect(colourAround(g, 'fill', 10, 10, 5, 5)).toEqual([]);
  });

  it('finds the pictures a project shows, and feeds them to the checker', () => {
    const p = createProject('P');
    p.settings.title = 'P';
    p.assets.push({ id: 'a1', name: 'a.png', mime: 'image/png', size: 1 }, { id: 'v1', name: 'v.mp4', mime: 'video/mp4', size: 1 });
    const img = createNode('image', { x: 0, y: 0, width: 800, height: 600 });
    Object.assign(img, { assetId: 'a1', ariaLabel: 'bg' });
    const t = createNode('text', { x: 20, y: 20, width: 300, height: 24, text: 'On a photo', color: '#ffffff' });
    p.artboards[0].children.push(img, t);
    expect([...pictureAssets(p)]).toEqual(['a1']);
    const dark: ImageGrid = { cols: 1, rows: 1, width: 10, height: 10, data: [5, 5, 20, 255] };
    expect(checkAccessibility(p, { images: imageColoursFrom(new Map([['a1', dark]])) }).findings.filter((f) => f.check === 'contrast')).toEqual([]);
    expect(checkAccessibility(p).findings.filter((f) => f.check === 'contrast')[0].severity).toBe('review');
  });
});

describe('reviewed marks', () => {
  it('toggle on and off per project', () => {
    expect(toggleReviewed('p1', 'x', new Date('2026-01-02T03:04:05Z'))).toEqual({ x: '2026-01-02T03:04:05.000Z' });
    expect(loadReviewed('p1')).toHaveProperty('x');
    expect(loadReviewed('p2')).toEqual({});
    expect(toggleReviewed('p1', 'x')).toEqual({});
  });
});

describe('the exported report', () => {
  it('is a standalone page that says checks found, lists what was not checked, escapes layer names and has a sign-off box', () => {
    const p = createProject('<b>Quarterly</b> & co');
    p.settings.title = 'T';
    const t = createNode('text', { name: '<script>alert(1)</script>', x: 20, y: 20, width: 300, height: 24, text: 'Words', color: '#bbbbbb' });
    p.artboards[0].children.push(t);
    const r = checkAccessibility(p);
    const html = reportHtml(r, { [r.findings[0].id]: '2026-01-02T00:00:00.000Z' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('not a statement that the project meets WCAG');
    expect(html).toContain('What was not checked');
    expect(html).toContain('Sign-off');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Quarterly&lt;/b&gt; &amp; co');
    expect(html).toMatch(/Reviewed/);
    expect(html).not.toMatch(/is (fully )?(wcag )?compliant|passes wcag|accessible\./i);
    const csv = reportCsv(r, {});
    expect(csv.split('\n')[0]).toBe('Artboard,Layer,Layer type,Severity,Check,Standard,Finding,Detail,Reviewed');
    expect(csv.split('\n').length).toBe(r.findings.length + 1);
  });
});
