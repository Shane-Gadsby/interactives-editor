import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SplitColumns } from '../src/components/SplitColumns';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

let root: Root;
let host: HTMLElement;
const widthOf = (w: number) => Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => w });
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
});

function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <SplitColumns id="t" columns={[{ width: 180 }, 'flex', { width: 260, hideBelow: 700 }]}>
        <div id="list" />
        <div id="main" />
        <div id="help" />
      </SplitColumns>,
    ),
  );
}

describe('columns in a narrow box', () => {
  it('drops the optional column and its divider when there is no room for it', () => {
    widthOf(360);
    mount();
    expect(host.querySelector('#list')).toBeTruthy();
    expect(host.querySelector('#main')).toBeTruthy();
    expect(host.querySelector('#help')).toBeNull();
    expect(host.querySelectorAll('.split-divider').length).toBe(1);
  });
  it('keeps every column in a wide one', () => {
    widthOf(1200);
    mount();
    expect(host.querySelector('#help')).toBeTruthy();
    expect(host.querySelectorAll('.split-divider').length).toBe(2);
  });
});
