import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { OLD_STARTER_VALUES, STARTER_TOKEN_DEFS, createNode, createProject, type Project } from 'interactives-player';
import { ArtboardView } from '../src/canvas/ArtboardView';
import { ColorField } from '../src/components/ui';
import { ThemesPanel } from '../src/panels/ThemesPanel';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { starterThemes } from '../src/lib/themes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let s: EditorStore;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function open(p: Project): EditorStore {
  s = new EditorStore(p);
  setCurrentStore(s);
  return s;
}
const themed = () => {
  const p = createProject('T');
  p.themes = starterThemes();
  return p;
};
const click = (el: Element | null) => act(() => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));

describe('the colour picker and theme tokens', () => {
  it('picks a token on the Tokens tab, shows it as a linked chip, and detaches to a plain colour', async () => {
    const p = themed();
    open(p);
    let value = '#336699';
    const render = () => act(() => root.render(<ColorField tokens value={value} onChange={(v) => ((value = v), render())} />));
    render();
    // a plain colour has no chip
    expect(host.querySelector('.token-chip')).toBeNull();
    click(host.querySelector('.palette-btn'));
    await flush();
    const tabs = [...document.querySelectorAll<HTMLElement>('.picker-tabs button')];
    expect(tabs.map((t) => t.textContent)).toContain('Tokens');
    click(tabs.find((t) => t.textContent === 'Tokens')!);
    const rows = [...document.querySelectorAll<HTMLElement>('.token-row:not(.token-more)')];
    expect(rows).toHaveLength(STARTER_TOKEN_DEFS.length);
    const primary = p.themes!.tokens.find((t) => t.name === 'color/primary')!;
    click(rows.find((r) => r.textContent!.includes('color/primary'))!);
    expect(value).toBe(`token:${primary.id}`);
    // linked: a named chip with each theme's value, a ring on the swatch, no hex box
    expect(host.querySelector('.token-chip-name')!.textContent).toBe('color/primary');
    // each theme's value is in the chip's tooltip, not drawn inside it (a single-line chip, level with the % box and the delete button)
    expect(host.querySelector('.token-chip')!.getAttribute('title')).toContain('High contrast');
    expect(host.querySelector('.token-chip .token-values')).toBeNull();
    expect(host.querySelector('.swatch.linked')).not.toBeNull();
    expect(host.querySelector('input.color-text')).toBeNull();
    expect(host.querySelector<HTMLElement>('.swatch.linked')!.style.background).toMatch(/255, 180, 72|#ffb448/i);
    // the swatch follows the theme the canvas shows
    act(() => s.set({ canvasTheme: 'theme-dark' }));
    await flush();
    expect(host.querySelector<HTMLElement>('.swatch.linked')!.style.background).toMatch(/255, 180, 72|#ffb448/i);
    // detach keeps the colour showing now, as a plain one
    click(host.querySelector('.token-detach'));
    expect(value).not.toContain('token:');
    expect(host.querySelector('.token-chip')).toBeNull();
  });

  it('a project without tokens offers to add the starter themes', async () => {
    open(createProject('Plain'));
    act(() => root.render(<ColorField tokens value="#fff" onChange={() => undefined} />));
    click(host.querySelector('.palette-btn'));
    await flush();
    click(document.querySelector('.token-empty .btn'));
    expect(s.get().project.themes!.list).toHaveLength(3);
  });

  it('fields that are not for layers have no Tokens tab', async () => {
    open(themed());
    act(() => root.render(<ColorField value="#fff" onChange={() => undefined} />));
    // (no palette stylesheet here, so with no tokens option the button is not there at all)
    expect(host.querySelector('.palette-btn')).toBeNull();
    await flush();
    expect(document.querySelector('.picker-tabs')).toBeNull();
  });
});

describe('the canvas follows the theme', () => {
  it('draws a token layer in the theme being shown, and again when the theme changes', () => {
    const p = themed();
    const bg = p.themes!.tokens.find((t) => t.name === 'color/background')!;
    p.artboards[0].children.push(createNode('rect', { id: 'card', width: 50, height: 50, fill: { type: 'solid', color: `token:${bg.id}` } }), createNode('rect', { id: 'plain', width: 50, height: 50, fill: { type: 'solid', color: '#123456' } }));
    open(p);
    const show = (theme: string | null) => act(() => root.render(<ArtboardView artboard={s.get().project.artboards[0]} project={s.get().project} timeline={null} time={0} active live assetVersion={0} dataVersion={0} canvasTheme={theme} />));
    const bgOf = (id: string) => host.querySelector<HTMLElement>(`[data-ix-id="${id}"]`)!.style.background;
    show(null);
    expect(bgOf('card')).toMatch(/254, 254, 254|#fefefe/i);
    show('theme-dark');
    expect(bgOf('card')).toMatch(/30, 30, 30|#1e1e1e/i);
    expect(bgOf('plain')).toMatch(/18, 52, 86|#123456/i);
    // editing a token's value redraws it too
    act(() => s.update((d) => void (d.themes!.tokens.find((t) => t.id === bg.id)!.values['theme-dark'] = '#000000')));
    show('theme-dark');
    expect(bgOf('card')).toMatch(/0, 0, 0|#000/i);
  });
});

describe('the Themes panel', () => {
  it('starts empty with an offer, then shows tokens by theme with their use counts', async () => {
    open(createProject('Plain'));
    act(() => root.render(<ThemesPanel />));
    expect(host.textContent).toContain('Add Light, Dark and High contrast');
    click(host.querySelector('.themes-empty .btn.primary'));
    await flush();
    expect(host.querySelectorAll('.themes-table tbody tr')).toHaveLength(STARTER_TOKEN_DEFS.length);
    // a project that just got the starters has nothing to update
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Update starter colours')).toBe(false);
    expect(host.querySelectorAll('.themes-table thead .tk-theme')).toHaveLength(3);
    expect(host.querySelector('.themes-raw')!.textContent).toContain('0 colours not following a theme');
  });

  it('counts plain colours, flags a failing pair, and shows another theme on the canvas', async () => {
    const p = themed();
    const dark = p.themes!.list[1].id;
    p.themes!.tokens.find((t) => t.name === 'color/text')!.values[dark] = '#777777';
    p.themes!.tokens.find((t) => t.name === 'color/background')!.values[dark] = '#808080';
    p.artboards[0].children.push(createNode('rect', { fill: { type: 'solid', color: '#abcdef' } }));
    open(p);
    act(() => root.render(<ThemesPanel />));
    await flush();
    expect(host.querySelector('.themes-raw')!.textContent).toContain('1 colour not following a theme');
    expect(host.querySelectorAll('.tk-cell.warn').length).toBeGreaterThan(0);
    expect(host.querySelector('.themes-contrast')!.textContent).toMatch(/Dark: text on background/);
    const eye = host.querySelectorAll<HTMLElement>('.theme-head button')[2];
    click(eye);
    expect(s.get().canvasTheme).toBe(dark);
  });

  it('offers to update the starter colours on a project made before the toolbox look, and only then', async () => {
    const p = themed();
    const t = p.themes!;
    t.tokens = t.tokens.filter((x) => OLD_STARTER_VALUES[x.name]).map((x) => ({ ...x, values: Object.fromEntries(t.list.map((th, i) => [th.id, OLD_STARTER_VALUES[x.name][i]])) }));
    const text = t.tokens.find((x) => x.name === 'color/text')!;
    p.artboards[0].children.push(createNode('rect', { id: 'r', fill: { type: 'solid', color: `token:${text.id}` } }));
    open(p);
    act(() => root.render(<ThemesPanel />));
    await flush();
    const button = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Update starter colours');
    expect(button()).toBeTruthy();
    // nothing moved by itself
    expect(s.get().project.themes!.tokens.find((x) => x.id === text.id)!.values['theme-light']).toBe('#1c1e26');
    click(button()!);
    await flush();
    expect(s.get().project.themes!.tokens.find((x) => x.id === text.id)!.values['theme-light']).toBe('#1e1e1e');
    expect(s.get().project.themes!.tokens).toHaveLength(STARTER_TOKEN_DEFS.length);
    expect(button()).toBeUndefined();
  });
});
