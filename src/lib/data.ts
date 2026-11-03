import { fetchDataSource, type DataSource, type Project } from 'interactives-player';
import { assetUrls } from './assets';

/**
 * Data sources loaded in the editor, so bindings, repeaters and text slots show
 * real data on the canvas. Keyed by source id; re-fetched when a source's
 * definition changes or on demand.
 */
class DataCache {
  private values = new Map<string, { sig: string; value?: unknown; error?: string; loading: boolean }>();
  private listeners = new Set<() => void>();
  version = 0;

  private sig(ds: DataSource): string {
    return JSON.stringify([ds.kind, ds.source, ds.assetId, ds.url]);
  }

  /** Make sure every source is loaded (or loading) for its current definition. */
  sync(project: Project): void {
    for (const ds of project.dataSources) {
      const cur = this.values.get(ds.id);
      if (!cur || cur.sig !== this.sig(ds)) void this.load(ds);
    }
  }

  async load(ds: DataSource): Promise<void> {
    const sig = this.sig(ds);
    this.values.set(ds.id, { ...(this.values.get(ds.id) ?? {}), sig, loading: true });
    this.bump();
    try {
      const value = await fetchDataSource(ds, assetUrls.resolve);
      this.values.set(ds.id, { sig, value, loading: false });
    } catch (err) {
      this.values.set(ds.id, { sig, error: err instanceof Error ? err.message : String(err), loading: false });
    }
    this.bump();
  }

  get(id: string) {
    return this.values.get(id);
  }

  /** name -> value for every loaded source, for expression scopes. */
  scope(project: Project): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const ds of project.dataSources) {
      const v = this.values.get(ds.id);
      if (v && 'value' in v) out[ds.name] = v.value;
    }
    return out;
  }

  clear(): void {
    this.values.clear();
    this.bump();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private bump(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

export const dataCache = new DataCache();

/** Variables (initial values) and data, the way the player scopes them. */
export function previewScope(project: Project): Record<string, unknown> {
  const data = dataCache.scope(project);
  const vars: Record<string, unknown> = { ...data, data };
  for (const v of project.variables) vars[v.name] = v.initial;
  return vars;
}
