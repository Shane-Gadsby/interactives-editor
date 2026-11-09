import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { lazyModule } from '../src/lib/lazy-module';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const later = <T,>(v: T) => {
  let go!: () => void;
  const p = new Promise<T>((r) => (go = () => r(v)));
  return { p, go };
};

describe('lazyModule', () => {
  it('loads once however many ask, and is there for later asks', async () => {
    const load = vi.fn(async () => ({ n: 1 }));
    const m = lazyModule(load);
    expect(m.get()).toBeNull();
    const [a, b] = await Promise.all([m.ensure(), m.ensure()]);
    expect(a).toBe(b);
    expect(load).toHaveBeenCalledTimes(1);
    expect(m.get()).toEqual({ n: 1 });
    await m.ensure();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('tries again after a failed load rather than keeping the failure', async () => {
    let calls = 0;
    const m = lazyModule(async () => {
      if (++calls === 1) throw new Error('offline');
      return { ok: true };
    });
    await expect(m.ensure()).rejects.toThrow('offline');
    expect(m.get()).toBeNull();
    await expect(m.ensure()).resolves.toEqual({ ok: true });
  });

  describe('as a hook', () => {
    let root: Root;
    let host: HTMLElement;
    afterEach(() => {
      act(() => root.unmount());
      host.remove();
    });
    const mount = (el: React.ReactElement) => {
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      act(() => root.render(el));
    };

    it('is null while the chunk comes in, then the module, and starts the load itself', async () => {
      const gate = later({ word: 'hello' });
      const load = vi.fn(() => gate.p);
      const m = lazyModule(load);
      const Probe = () => <p>{m.use()?.word ?? 'loading'}</p>;
      mount(<Probe />);
      expect(host.textContent).toBe('loading');
      expect(load).toHaveBeenCalledTimes(1);
      await act(async () => {
        gate.go();
        await gate.p;
      });
      expect(host.textContent).toBe('hello');
    });

    it('draws the module on the first render when it is already in', async () => {
      const m = lazyModule(async () => ({ word: 'ready' }));
      await m.ensure();
      const Probe = () => <p>{m.use()?.word ?? 'loading'}</p>;
      mount(<Probe />);
      expect(host.textContent).toBe('ready');
    });

    it('use(false) only watches: it never starts the download, and still hears when something else does', async () => {
      const load = vi.fn(async () => ({ word: 'late' }));
      const m = lazyModule(load);
      const Probe = () => <p>{m.use(false)?.word ?? 'waiting'}</p>;
      mount(<Probe />);
      expect(load).not.toHaveBeenCalled();
      expect(host.textContent).toBe('waiting');
      await act(async () => void (await m.ensure()));
      expect(host.textContent).toBe('late');
    });
  });
});
