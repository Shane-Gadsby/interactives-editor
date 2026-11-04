import { reportError } from './analytics';

// After a deploy the tab that was already open still runs the old build, and the old build's lazy chunks (importers, the
// sandbox, image export...) are gone from the server. Say so with a Reload button instead of leaving the feature dead.

/** True for the error browsers throw when a dynamic import cannot be fetched (Chrome, Firefox and Safari word it differently) */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError/i.test(msg);
}

let shown: HTMLElement | null = null;

/** Show the "new version, reload" toast (once). Plain DOM so it works from anywhere, React or not. */
export function showStaleBuildNotice(): void {
  if (typeof document === 'undefined') return;
  if (shown?.isConnected) return;
  const el = document.createElement('div');
  el.className = 'toast stale-toast';
  el.setAttribute('role', 'alert');
  const text = document.createElement('span');
  text.textContent = 'A new version of the editor is available, so part of this page could not load. Reload to get it.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'btn primary';
  reload.textContent = 'Reload';
  reload.title = 'Reload the editor. Your project is saved as you work.';
  reload.addEventListener('click', () => location.reload());
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'btn';
  dismiss.textContent = 'Not now';
  dismiss.addEventListener('click', () => {
    el.remove();
    shown = null;
  });
  el.append(text, reload, dismiss);
  document.body.appendChild(el);
  shown = el;
}

/** For callers that catch an error themselves: shows the notice when it was a failed chunk load. Returns true when it was. */
export function noteIfStale(err: unknown): boolean {
  if (!isChunkLoadError(err)) return false;
  reportError({ kind: 'chunk', error: err, where: 'lazy-load' });
  showStaleBuildNotice();
  return true;
}

let installed = false;

/** Listen centrally: vite's preload failure event, and any import() rejection nobody caught */
export function installStaleBuildNotice(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Fires for dynamic imports vite wraps with its preload helper (the error still reaches whoever awaited the import)
  window.addEventListener('vite:preloadError', () => showStaleBuildNotice());
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e.reason)) showStaleBuildNotice();
  });
}
