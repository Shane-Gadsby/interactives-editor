import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createNode, createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';

vi.mock('../src/lib/db', async (orig) => ({
  ...(await orig<typeof import('../src/lib/db')>()),
  listProjects: async () => [],
  session: async () => ({ user: { username: 'me' } }),
}));
vi.mock('../src/lib/session', () => ({ sessionUser: async () => null }));

import { Home } from '../src/Home';
import { Inspector } from '../src/panels/Inspector';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));

describe('projects page', () => {
  it('has a short Import button, with the formats in its tooltip', async () => {
    await act(async () => root.render(<Home open={() => undefined} />));
    await flush();
    const b = [...host.querySelectorAll<HTMLButtonElement>('button.btn')].find((x) => x.textContent?.trim() === 'Import')!;
    expect(b).toBeTruthy();
    for (const f of ['.ixp', 'Lottie', 'Rive', 'PSD', 'PDF', 'VectorCraft', 'PhotoCraft']) expect(b.title).toContain(f);
  });
});

describe('text layer inspector', () => {
  it('labels the Typewriter and Wave buttons as Presets, and gives Italic its own row', () => {
    const p = createProject('T');
    const t = createNode('text', { name: 'Hello', text: 'Hi' });
    p.artboards[0].children.push(t);
    const s = new EditorStore(p);
    setCurrentStore(s);
    s.select([t.id]);
    act(() => root.render(<Inspector />));
    const head = [...host.querySelectorAll<HTMLElement>('.inspector button.section-title')].find((e) => e.textContent?.trim() === 'Text modifiers')!;
    act(() => head.click());
    const presets = [...host.querySelectorAll('.inspector .field-label')].find((e) => e.textContent?.trim() === 'Presets')!;
    expect(presets.textContent?.trim()).toBe('Presets');
    expect([...presets.parentElement!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Typewriter', 'Wave']);
    const italic = [...host.querySelectorAll('label')].find((l) => l.textContent?.trim() === 'Italic')!;
    // Not in a two-field row with Case
    expect(italic.closest('.row')).toBeNull();
  });
});

describe('theme variables', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
  const block = (re: RegExp) => re.exec(css)![0];
  const dark = block(/:root \{[\s\S]*?\n\}/);
  const light = block(/:root\[data-theme='light'\] \{[\s\S]*?\n\}/);
  // A theme variable's colour: written out, or a var() to follow (in the block, then in :root, where the palette
  // stand-ins live), or a palette variable's fallback
  const v = (b: string, name: string): string => {
    const raw = (new RegExp(`${name}:\\s*([^;]+);`).exec(b) ?? new RegExp(`${name}:\\s*([^;]+);`).exec(dark))![1].trim();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
    const ref = /^var\((--[\w-]+)(?:,\s*(#[0-9a-f]{6}))?\)$/i.exec(raw)!;
    if (ref[1].startsWith('--ilar-')) return ref[2];
    return v(b, ref[1]);
  };
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it('key buttons are readable on the panel in both themes', () => {
    expect(ratio(v(dark, '--key-off'), v(dark, '--panel'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(v(light, '--key-off'), v(light, '--panel'))).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.key-btn \{[^}]*color: var\(--key-off\)/);
  });
  it('banners take their colours from the theme, readable in both', () => {
    for (const k of ['warn', 'error', 'rec']) {
      expect(ratio(v(dark, `--banner-${k}-fg`), v(dark, `--banner-${k}-bg`))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(v(light, `--banner-${k}-fg`), v(light, `--banner-${k}-bg`))).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).not.toMatch(/\.(error|recording|conflict)-banner[^{]*\{[^}]*background: #/);
    expect(css).toMatch(/\.link-banner\.warn \{[^}]*var\(--banner-warn-bg\)/);
  });
  it('every theme block defines the hover and banner variables', () => {
    for (const name of ['--btn-hover-border', '--btn-hover-bg', '--key-off', '--banner-warn-bg', '--banner-error-bg', '--banner-rec-bg']) expect(css.split(`${name}:`).length - 1).toBe(3);
  });
});
