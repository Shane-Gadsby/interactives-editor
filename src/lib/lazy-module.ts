import { useEffect, useSyncExternalStore } from 'react';

/**
 * A chunk the editor loads when it is first wanted (help, starter templates, the code editor, the graph library), not
 * with the first screen. `ensure()` starts and awaits it (also what the idle warm-up and hover warm-ups call), `get()`
 * is the module once it is in, and `use()` is the same as a hook: null while it loads, then the module (`use(false)` only
 * watches, for things that shouldn't start the download themselves, like a tooltip). Once it is in
 * every later render is synchronous, which is also what a test gets by awaiting `ensure()` first.
 */
export interface LazyModule<T> {
  ensure: () => Promise<T>;
  get: () => T | null;
  use: (start?: boolean) => T | null;
}

export function lazyModule<T>(load: () => Promise<T>): LazyModule<T> {
  let mod: T | null = null;
  let pending: Promise<T> | null = null;
  const subs = new Set<() => void>();
  const subscribe = (f: () => void) => {
    subs.add(f);
    return () => subs.delete(f);
  };
  const get = () => mod;
  const ensure = () =>
    (pending ??= load().then(
      (m) => {
        mod = m;
        subs.forEach((f) => f());
        return m;
      },
      (err) => {
        //a dropped connection mid-fetch shouldn't stick: the next ask tries again
        pending = null;
        throw err;
      },
    ));
  const use = (start = true) => {
    const m = useSyncExternalStore(subscribe, get);
    useEffect(() => {
      if (!m && start) ensure().catch(() => undefined);
    }, [m, start]);
    return m;
  };
  return { ensure, get, use };
}
