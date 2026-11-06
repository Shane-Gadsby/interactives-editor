import type { Project } from 'interactives-player';

/**
 * Merging assets that are the same file uploaded more than once. Every reference to a duplicate is pointed at the copy
 * that's kept, then the duplicates leave the asset list. Asset ids are long and random, so any string in the document
 * equal to a duplicate's id is a reference to it, wherever it sits (image layers, fills, fonts, sounds, data sources,
 * attributions...). The asset list itself is left to the caller's filter.
 */
export function repointAssets(project: Project, map: ReadonlyMap<string, string>): number {
  let changed = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        const x = v[i];
        if (typeof x === 'string' && map.has(x)) {
          v[i] = map.get(x);
          changed++;
        } else walk(x);
      }
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const x = o[k];
        if (typeof x === 'string' && map.has(x)) {
          o[k] = map.get(x);
          changed++;
        } else walk(x);
      }
    }
  };
  for (const k of Object.keys(project) as (keyof Project)[]) {
    if (k === 'assets') continue;
    walk(project[k]);
  }
  return changed;
}

/** Which copy of each group to keep: the first one in the project's asset list (the one people met first). */
export function mergePlan(project: Project, groups: { ids: string[] }[]): { keep: string; drop: string[] }[] {
  const order = new Map(project.assets.map((a, i) => [a.id, i]));
  return groups
    .map((g) => g.ids.filter((id) => order.has(id)).sort((a, b) => order.get(a)! - order.get(b)!))
    .filter((ids) => ids.length > 1)
    .map(([keep, ...drop]) => ({ keep, drop }));
}

/** Apply a plan to the document (inside EditorStore.update): repoint, then drop the duplicates and any font rows they leave doubled. */
export function mergeDuplicates(d: Project, plan: { keep: string; drop: string[] }[]): number {
  const map = new Map<string, string>();
  for (const p of plan) for (const id of p.drop) map.set(id, p.keep);
  const n = repointAssets(d, map);
  d.assets = d.assets.filter((a) => !map.has(a.id));
  const seen = new Set<string>();
  d.fonts = d.fonts.filter((f) => {
    if (!f.assetId) return true;
    const k = `${f.family}|${f.assetId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return n;
}
