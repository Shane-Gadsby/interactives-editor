import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { createProject } from 'interactives-player';
import { EditorStore, setCurrentStore } from '../src/store/store';
import { PreviewModal } from '../src/Editor';
import { closeHelp, HelpHost, helpHistory, openHelp, openHelpSearch } from '../src/help/Help';
import { isPreviewOpen, trapFocus } from '../src/lib/overlays';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

const css = readFileSync(join(__dirname, '../src/styles.css'), 'utf8');

/** The token scale from :root, by name. */
const tokens = Object.fromEntries([...css.matchAll(/^\s*(--z-[\w-]+):\s*(\d+);/gm)].map((m) => [m[1], Number(m[2])]));
/** The z-index each selector's rule asks for: a token name, or a number. */
function zOf(selector: string): string | number {
  const re = new RegExp(`(^|\\n|,\\s*)${selector.replace(/[.\\[\]]/g, '\\$&')}\\s*(,[^{]*)?\\{([^}]*)\\}`);
  const rule = re.exec(css);
  if (!rule) throw new Error(`no rule for ${selector}`);
  const z = /z-index:\s*([^;]+);/.exec(rule[3]);
  if (!z) throw new Error(`no z-index in ${selector}`);
  const v = z[1].trim();
  const t = /^var\((--z-[\w-]+)\)$/.exec(v);
  return t ? t[1] : Number(v);
}
const value = (sel: string) => {
  const z = zOf(sel);
  return typeof z === 'number' ? z : tokens[z];
};

describe('the overlay stacking scale', () => {
  it('goes up in the order the editor needs', () => {
    const order = ['--z-float', '--z-modal', '--z-drawer', '--z-quick-search', '--z-preview', '--z-popover', '--z-menu', '--z-toast', '--z-dialog', '--z-tooltip'];
    const values = order.map((t) => tokens[t]);
    expect(values.every((v) => typeof v === 'number')).toBe(true);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(new Set(values).size).toBe(values.length);
  });

  it('puts Preview above the help drawer, docked and floating panels, the comments layer, the notes layer and the canvas chips', () => {
    const preview = value('.modal-backdrop.preview-backdrop');
    for (const below of ['.help-drawer', '.dock-float', '.dock-float.front', '.dock-edge', '.dock-drag-tab', '.cm-layer', '.notes-layer', '.canvas-status', '.quick-help-backdrop', '.modal-backdrop', '.menu', '.q-menu']) expect(value(below), below).toBeLessThan(preview);
  });

  it('keeps what Preview opens above it: popovers, context menus, toasts, confirm dialogs and tooltips', () => {
    const preview = value('.modal-backdrop.preview-backdrop');
    for (const above of ['.palette-pop', '.search-pop', '.font-pop', '.expr-pop', '.tl-settings-pop', '.ctx-menu', '.toast', '.toast.stale-toast', '.dialog-backdrop', '.ix-tooltip']) expect(value(above), above).toBeGreaterThan(preview);
  });

  it('has no overlay with a bare number: only the small ones that order things inside one canvas or control', () => {
    const bare = [...css.matchAll(/z-index:\s*(-?\d+);/g)].map((m) => Number(m[1]));
    expect(bare.length).toBeGreaterThan(0);
    expect(Math.max(...bare)).toBeLessThan(10);
    //a token is only ever defined once, in the scale
    expect([...css.matchAll(/^\s*(--z-[\w-]+):/gm)].length).toBe(Object.keys(tokens).length);
  });

  it('only uses tokens that exist', () => {
    for (const m of css.matchAll(/z-index:\s*var\((--z-[\w-]+)\)/g)) expect(tokens[m[1]], m[1]).toBeTypeOf('number');
  });
});

describe('Preview as a modal above the help', () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    helpHistory.clear();
    setCurrentStore(new EditorStore(createProject('T')));
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => closeHelp());
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });
  const mountPreview = async (onClose = () => undefined) => {
    await act(async () => root.render(<><HelpHost /><PreviewModal onClose={onClose} /></>));
  };

  it('is a labelled dialog, and says it is open while mounted', async () => {
    await mountPreview();
    expect(isPreviewOpen()).toBe(true);
    expect(host.querySelector('.preview-backdrop .preview-modal[role="dialog"][aria-modal="true"]')).toBeTruthy();
    act(() => root.render(<HelpHost />));
    expect(isPreviewOpen()).toBe(false);
  });

  it('sends help asked for while it is open to its own window, not over the Preview controls', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await mountPreview();
    act(() => openHelp('charts', 'x'));
    expect(document.querySelector('.help-drawer')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toContain('#/help/charts/x');
    act(() => openHelpSearch());
    expect(open).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.quick-help-backdrop')).toBeNull();
    //and F1 in it
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true })));
    expect(document.querySelector('.help-drawer')).toBeNull();
  });

  it('closes Preview on Esc, and leaves a drawer that was open behind it alone', async () => {
    act(() => root.render(<HelpHost />));
    act(() => openHelp('shapes'));
    const onClose = vi.fn();
    await mountPreview(onClose);
    expect(document.querySelector('.help-drawer')).toBeTruthy();
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.help-drawer')).toBeTruthy();
  });

  it('keeps Tab inside it and brings focus back from outside', async () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();
    await mountPreview();
    const modal = host.querySelector<HTMLElement>('.preview-modal')!;
    expect(modal.contains(document.activeElement)).toBe(true);
    act(() => outside.focus());
    expect(modal.contains(document.activeElement)).toBe(true);
    outside.remove();
  });
});

describe('trapFocus', () => {
  it('wraps Tab and Shift+Tab, and hands focus back when released', () => {
    const before = document.createElement('button');
    const root = document.createElement('div');
    root.tabIndex = -1;
    root.innerHTML = '<button id="a">a</button><button id="b">b</button>';
    document.body.append(before, root);
    before.focus();
    const release = trapFocus(root);
    const [a, b] = [root.querySelector<HTMLElement>('#a')!, root.querySelector<HTMLElement>('#b')!];
    const tab = (shiftKey = false) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
    //jsdom's offsetParent is always null, so the trap falls back on iframes only: give the buttons a parent box
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', { configurable: true, get: () => document.body });
    b.focus();
    tab();
    expect(document.activeElement).toBe(a);
    tab(true);
    expect(document.activeElement).toBe(b);
    release();
    expect(document.activeElement).toBe(before);
    before.remove();
    root.remove();
    delete (HTMLElement.prototype as unknown as { offsetParent?: unknown }).offsetParent;
  });
});
