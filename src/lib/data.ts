import { artboardScope, courseValuesFor, dataPolicyFor, emptySlots, enumOptions, fetchDataSource, initialValue, layerScope, NO_SENSORS, sampleContextFor, sensorsUsed, slotNamesOf, stepList, stepsScope, stepsTimeline, walk, type Artboard, type DataPolicy, type DataSource, type Project, type SceneNode } from 'interactives-player';
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
  /** The project's data rules (its allowed-hosts list), as of the last sync. */
  private policy: DataPolicy = {};

  private sig(ds: DataSource): string {
    return JSON.stringify([ds.kind, ds.source, ds.assetId, ds.url, this.policy.allow]);
  }

  /** Make sure every source is loaded (or loading) for its current definition. */
  sync(project: Project): void {
    this.policy = dataPolicyFor(project);
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
      const value = await fetchDataSource(ds, assetUrls.resolve, undefined, this.policy);
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
export function previewScope(project: Project, artboard?: Artboard): Record<string, unknown> {
  const data = dataCache.scope(project);
  // `artboard` and `layer(name)` as the player has them, below data and variables of the same name
  const board: Record<string, unknown> = {};
  if (artboard) {
    const byKey = new Map<string, SceneNode>();
    walk(artboard.children, (n) => {
      byKey.set(n.id, n);
      if (!byKey.has(n.name)) byKey.set(n.name, n);
    });
    board.artboard = artboardScope(artboard);
    board.layer = (key: unknown) => layerScope(byKey.get(String(key)));
  }
  // `context` is the project's sample course and learner (Data panel), under data and variables of the same name like the player has it
  const context = sampleContextFor(project);
  // The microphone and camera as a project that declares them starts: ready, with no recordings (the player keeps these current when it runs)
  const used = new Set(sensorsUsed(project.settings.sensors));
  const sensors = { ...NO_SENSORS, microphone: used.has('microphone') ? 'ready' : 'unavailable', camera: used.has('camera') ? 'ready' : 'unavailable', photos: used.has('photos') ? 'ready' : 'unavailable', recordings: emptySlots(slotNamesOf(project)) };
  const vars: Record<string, unknown> = { context, ...sensors, ...board, ...data, data, enums: enumOptions(project.variables) };
  // The sample course's rows in place of initial values, the way the player starts on the real course
  const perCourse = courseValuesFor(project.courseValues, context.courseLabel, project.variables);
  for (const v of project.variables) vars[v.name] = initialValue(perCourse.has(v.id) ? { ...v, initial: perCourse.get(v.id)! } : v);
  // An artboard with steps shows its first step: the dots of a step bar, and the variables the player would keep up to date
  const cfg = artboard?.steps;
  const list = cfg ? stepList(stepsTimeline(artboard!)) : [];
  if (cfg && list.length) {
    const put = (id: string | undefined, value: unknown) => {
      const v = project.variables.find((x) => x.id === id);
      if (v) vars[v.name] = value;
    };
    put(cfg.stepVar, 1);
    put(cfg.countVar, list.length);
    put(cfg.titleVar, list[0].title);
    put(cfg.captionVar, list[0].caption);
    if (!('steps' in data)) vars.steps = stepsScope(list, 0);
  }
  return vars;
}
