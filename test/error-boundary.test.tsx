import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let broken = true;
function Bomb() {
  if (broken) throw new Error('options.split is not a function');
  return <p id="ok">fine</p>;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  broken = true;
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows a recoverable message instead of a blank page, and Reload tries again', () => {
    act(() =>
      root.render(
        <ErrorBoundary message="Something on this artboard couldn't be drawn." className="left-panel">
          <Bomb />
        </ErrorBoundary>,
      ),
    );
    expect(host.textContent).toContain("Something on this artboard couldn't be drawn.");
    expect(host.querySelector('.crash-box.left-panel')).not.toBeNull();
    broken = false;
    act(() => (Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Reload') as HTMLElement).click());
    expect(host.querySelector('#ok')).not.toBeNull();
    expect(host.querySelector('.crash-box')).toBeNull();
  });

  it('tries again by itself when its reset key changes', () => {
    const render = (k: number) =>
      act(() =>
        root.render(
          <ErrorBoundary message="x" resetKey={k}>
            <Bomb />
          </ErrorBoundary>,
        ),
      );
    render(1);
    expect(host.querySelector('.crash-box')).not.toBeNull();
    broken = false;
    render(1);
    expect(host.querySelector('.crash-box')).not.toBeNull();
    render(2);
    expect(host.querySelector('#ok')).not.toBeNull();
  });
});
