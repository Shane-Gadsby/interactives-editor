import type { Asset, Project } from 'interactives-player';
import { getAsset, getVariant, putVariant, type AssetListing } from './db';
import { encodeVariant, LEVELS, optimiseSettings, outputKey, outputSource, planOutput, planProxy, PROXY, proxyKey, rasterMime, savingsOf, worthKeeping, type OptimiseLevel, type Savings, type VariantSizes } from './image-optimise';

/**
 * The smaller copies of image assets: what is stored, what this tab knows is stored, and making the ones that are missing.
 * The rules are in image-optimise.ts, this is the part that talks to the server. Nothing here throws at a caller: a copy that
 * can't be made or fetched means the original is used, which is always right, only heavier.
 */

/** What the server listed per asset ("projectId/assetId" to key sizes), kept up to date as copies are made. */
const known = new Map<string, Record<string, number>>();
const listeners = new Set<() => void>();
const at = (projectId: string, assetId: string) => `${projectId}/${assetId}`;

/** For a panel that shows the sizes (useSyncExternalStore). Kept apart from the canvas's asset version, which redraws every artboard. */
export const onVariantsChange = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export let variantsVersion = 0;
export const getVariantsVersion = () => variantsVersion;
const changed = () => {
  variantsVersion++;
  listeners.forEach((fn) => fn());
};

/** Take in the server's asset list when a project opens. */
export function rememberListing(projectId: string, listing: AssetListing[]): void {
  for (const k of [...known.keys()]) if (k.startsWith(`${projectId}/`)) known.delete(k);
  for (const a of listing) if (a.variants) known.set(at(projectId, a.id), { ...a.variants });
  changed();
}

export const variantSizes = (projectId: string, assetId: string): VariantSizes => known.get(at(projectId, assetId));

function remember(projectId: string, assetId: string, key: string, size: number): void {
  known.set(at(projectId, assetId), { ...known.get(at(projectId, assetId)), [key]: size });
  changed();
}

/** The Assets panel's line for one asset. */
export const savingsFor = (project: Pick<Project, 'id' | 'settings'>, asset: Asset): Savings => savingsOf(asset.size, variantSizes(project.id, asset.id), optimiseSettings(project.settings).level);

/** Proxies being made now, so a picture that is both stored and loaded in one go is only worked on once. */
const making = new Map<string, Promise<Blob | null>>();

/**
 * Make the canvas proxy for an asset whose original this tab holds, if it needs one and none is stored. Resolves the
 * proxy to show, or null when the original is what to show. A picture that needs no proxy (or whose proxy would not
 * be smaller) is recorded as such, so it isn't looked at again.
 */
export function ensureProxy(projectId: string, assetId: string, mime: string, original: Blob): Promise<Blob | null> {
  const key = proxyKey();
  if (!rasterMime(mime) || variantSizes(projectId, assetId)?.[key] !== undefined) return Promise.resolve(null);
  const id = at(projectId, assetId) + key;
  let job = making.get(id);
  if (!job) {
    job = (async () => {
      try {
        const done = await encodeVariant(original, mime, { quality: PROXY.quality, plan: planProxy });
        const keep = done && worthKeeping(original.size, done.blob.size) ? done.blob : null;
        await putVariant(projectId, assetId, key, keep ?? new Blob([], { type: 'image/webp' }));
        remember(projectId, assetId, key, keep ? keep.size : 0);
        return keep;
      } catch {
        return null;
      } finally {
        making.delete(id);
      }
    })();
    making.set(id, job);
  }
  return job;
}

export interface OptimisedFile {
  bytes: Uint8Array;
  mime: string;
}

/**
 * The file an export or share carries for an asset at this level: the stored optimised copy, one made now (and stored for
 * next time), or null for "use the original" (not a picture we redraw, small, animated, no gain, or anything went wrong).
 */
export async function optimisedFile(projectId: string, asset: Asset, level: OptimiseLevel): Promise<OptimisedFile | null> {
  try {
    if (asset.src?.startsWith('data:')) return null;
    const key = outputKey(level);
    const how = outputSource(asset.mime, variantSizes(projectId, asset.id), level);
    if (how === 'original') return null;
    if (how === 'variant') {
      const stored = await getVariant(projectId, asset.id, key);
      if (stored && stored.size > 0) return { bytes: new Uint8Array(await stored.arrayBuffer()), mime: stored.type || 'image/webp' };
    }
    const original = await getAsset(projectId, asset.id);
    if (!original) return null;
    const done = await encodeVariant(original, asset.mime, { quality: LEVELS[level].quality, plan: (f) => planOutput(f, level) });
    const keep = done && worthKeeping(original.size, done.blob.size) ? done.blob : null;
    await putVariant(projectId, asset.id, key, keep ?? new Blob([], { type: 'image/webp' }));
    remember(projectId, asset.id, key, keep ? keep.size : 0);
    return keep ? { bytes: new Uint8Array(await keep.arrayBuffer()), mime: keep.type } : null;
  } catch {
    return null;
  }
}

function toDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * The project with its big pictures swapped for their optimised copies, as data URLs (a data: `src` is what the standalone
 * builder embeds as it is). Ids, names and everything else are untouched, so no layer or paint notices. Does nothing
 * unless the project's setting is on.
 */
export async function withOptimisedAssets(project: Project, onProgress?: (done: number, total: number) => void): Promise<Project> {
  const { on, level } = optimiseSettings(project.settings);
  if (!on) return project;
  const candidates = project.assets.filter((a) => rasterMime(a.mime));
  let done = 0;
  const swapped = new Map<string, Asset>();
  let next = 0;
  // A few at a time: the encoding is the slow part, and the browser can do some of it off the main thread
  const worker = async () => {
    while (next < candidates.length) {
      const a = candidates[next++];
      const file = await optimisedFile(project.id, a, level);
      if (file) swapped.set(a.id, { ...a, mime: file.mime, size: file.bytes.byteLength, src: toDataUrl(file.bytes, file.mime) });
      onProgress?.(++done, candidates.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return swapped.size ? { ...project, assets: project.assets.map((a) => swapped.get(a.id) ?? a) } : project;
}

/** Work out the optimised copies of every picture now (the settings button), and say what they save. */
export async function prepareOutputs(project: Project, onProgress?: (done: number, total: number) => void): Promise<{ pictures: number; saved: number }> {
  const { level } = optimiseSettings(project.settings);
  const candidates = project.assets.filter((a) => rasterMime(a.mime));
  let saved = 0;
  let pictures = 0;
  let i = 0;
  for (const a of candidates) {
    const file = await optimisedFile(project.id, a, level);
    if (file) {
      pictures++;
      saved += Math.max(0, a.size - file.bytes.byteLength);
    }
    onProgress?.(++i, candidates.length);
  }
  return { pictures, saved };
}
