import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ContextMenu } from '../src/components/ContextMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

describe('a right-click menu is drawn on the page, not inside what opened it', () => {
  it('sits directly in the body even when opened from a strip that scrolls sideways', () => {
    const strip = document.createElement('div');
    strip.className = 'dock-tabs';
    strip.style.overflowX = 'auto';
    document.body.appendChild(strip);
    root = createRoot(strip);
    let picked = '';
    act(() => root!.render(<ContextMenu x={10} y={10} items={[{ label: 'Dock at the top', onClick: () => (picked = 'top') }]} onClose={() => {}} />));
    const menu = document.querySelector('.ctx-menu')!;
    expect(menu.parentElement).toBe(document.body);
    expect(strip.querySelector('.ctx-menu')).toBeNull();
    act(() => (menu.querySelector('.ctx-item') as HTMLElement).click());
    expect(picked).toBe('top');
  });
});
