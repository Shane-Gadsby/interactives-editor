import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PANEL_WIDTH, PanelResizeHandle, clampWidth, usePanelWidths, reloadPanelWidths } from '../src/components/PanelResize';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('side panel widths', () => {
  let root: Root | null = null;
  afterEach(() => {
    act(() => root?.unmount());
    document.body.innerHTML = '';
    localStorage.clear();
  });

  it('keep within limits, and leave the canvas some room', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
    expect(clampWidth('right', 100)).toBe(PANEL_WIDTH.right.min);
    expect(clampWidth('right', 5000)).toBe(PANEL_WIDTH.right.max);
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    expect(clampWidth('right', 600)).toBe(900 - 56 - 320 - PANEL_WIDTH.left.min);
  });

  it('arrow keys move the edge, double-click resets, and the width is remembered', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true });
    let seen = 0;
    function Host() {
      const [w, set] = usePanelWidths();
      seen = w.right;
      return <PanelResizeHandle side="right" width={w.right} onWidth={(px) => set('right', px)} />;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Host />));
    const strip = document.querySelector<HTMLElement>('.col-resize.right')!;
    expect(strip.getAttribute('role')).toBe('separator');
    expect(seen).toBe(380);
    // the properties panel is on the right, so the left arrow widens it
    act(() => void strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(seen).toBe(390);
    act(() => void strip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true })));
    expect(seen).toBe(430);
    expect(JSON.parse(localStorage.getItem('ix-panel-widths-v2')!).right).toBe(430);
    act(() => void strip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(seen).toBe(380);
  });

  it('a right panel saved at the old 320 default opens at the new, roomier default', async () => {
    localStorage.setItem('ix-panel-widths-v2', JSON.stringify({ left: 300, right: 320 }));
    reloadPanelWidths();
    let seen = 0;
    function Host() {
      const [w] = usePanelWidths();
      seen = w.right;
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Host />));
    expect(seen).toBe(PANEL_WIDTH.right.def);
    expect(PANEL_WIDTH.right.def).toBe(380);
  });

  it('starts from the remembered width', () => {
    localStorage.setItem('ix-panel-widths-v2', JSON.stringify({ left: 300, right: 420 }));
    reloadPanelWidths();
    let w: { left: number; right: number } | null = null;
    function Host() {
      w = usePanelWidths()[0];
      return null;
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<Host />));
    expect(w).toEqual({ left: 300, right: 420 });
  });
});
