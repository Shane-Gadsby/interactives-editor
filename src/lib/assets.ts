import { uid, type Asset } from 'interactives-player';
import { getAsset, loadAssetsForCanvas, putAsset } from './db';
import { ensureProxy, rememberListing } from './asset-variants';
import { proxyKey, rasterMime } from './image-optimise';

/** Pictures lighter than this don't get a canvas proxy made on the way past (one that is big in pixels but light still gets one when it is uploaded). */
const PROXY_MIN_BYTES = 256 * 1024;

/** Blob URLs for the open project's assets, so the canvas can show them. */
class AssetUrls {
  private urls = new Map<string, string>();
  private listeners = new Set<() => void>();
  version = 0;

  async load(projectId: string): Promise<void> {
    this.clear();
    const { blobs, proxied, listing } = await loadAssetsForCanvas(projectId, proxyKey());
    for (const [id, blob] of blobs) this.urls.set(id, URL.createObjectURL(blob));
    rememberListing(projectId, listing);
    this.bump();
    //Big pictures from before proxies, or uploaded by something that doesn't make them: one at a time, in the background
    const pending = listing.filter((a) => !proxied.has(a.id) && blobs.has(a.id) && rasterMime(a.mime) && a.size >= PROXY_MIN_BYTES && a.variants?.[proxyKey()] === undefined);
    void (async () => {
      for (const a of pending) await this.proxy(projectId, a.id, a.mime, blobs.get(a.id)!);
    })();
  }

  /** Make the canvas proxy for a picture this tab has the original of, and show it instead once there is one. */
  async proxy(projectId: string, id: string, mime: string, original: Blob): Promise<void> {
    const small = await ensureProxy(projectId, id, mime, original);
    if (small && this.urls.has(id)) this.register(id, small);
  }

  register(id: string, blob: Blob): void {
    const old = this.urls.get(id);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(id, URL.createObjectURL(blob));
    this.bump();
  }

  has = (id: string): boolean => this.urls.has(id);

  /**
   * Pictures linked from the Media Catalogue have no file of their own: their address is the url the canvas shows. Called
   * with the project's assets whenever they change, so it covers opening a project, adding one and a collaborator's.
   */
  link(assets: { id: string; src?: string }[]): void {
    let changed = false;
    for (const a of assets) {
      if (!a.src || !/^https?:\/\//i.test(a.src) || this.urls.get(a.id) === a.src) continue;
      this.urls.set(a.id, a.src);
      changed = true;
    }
    if (changed) this.bump();
  }

  private fetching = new Set<string>();

  /**
   * Fetch the assets the document names that this tab has no copy of: the ones someone else added (or replaced) during
   * a live session, which arrive as ops with only the record. Each is asked for once at a time.
   */
  async ensure(projectId: string, ids: string[]): Promise<void> {
    const need = ids.filter((id) => !this.urls.has(id) && !this.fetching.has(id));
    if (!need.length) return;
    for (const id of need) this.fetching.add(id);
    await Promise.all(
      need.map(async (id) => {
        try {
          const blob = await getAsset(projectId, id);
          if (blob && !this.urls.has(id)) {
            this.register(id, blob);
            if (rasterMime(blob.type) && blob.size >= PROXY_MIN_BYTES) void this.proxy(projectId, id, blob.type, blob);
          }
        } finally {
          this.fetching.delete(id);
        }
      }),
    );
  }

  /** Where to fetch an asset that has no blob URL: the review page loads them straight from the server by its link. */
  external: ((id: string) => string) | null = null;

  resolve = (id: string): string | undefined => this.urls.get(id) ?? this.external?.(id);

  clear(): void {
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.urls.clear();
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

export const assetUrls = new AssetUrls();

export type AssetKind = 'image' | 'video' | 'audio' | 'font' | 'data' | 'other';

export function assetKind(mime: string, name = ''): AssetKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('font/') || /\.(woff2?|ttf|otf)$/i.test(name)) return 'font';
  if (/json|csv|tab-separated|text\/plain/.test(mime) || /\.(json|csv|tsv|txt)$/i.test(name)) return 'data';
  return 'other';
}

const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** Store a file as a project asset. Returns the asset record (not yet added to the project). */
export async function storeFile(projectId: string, file: File): Promise<Asset> {
  if (file.size > MAX_ASSET_BYTES) throw new Error(`${file.name} is larger than 50 MB`);
  const id = uid('as');
  const mime = file.type || guessMime(file.name);
  await putAsset(projectId, id, file);
  assetUrls.register(id, file);
  //The canvas shows a lighter copy of a big picture from here on, made while the person carries on
  if (rasterMime(mime) && file.size >= PROXY_MIN_BYTES) void assetUrls.proxy(projectId, id, mime, file);
  return { id, name: file.name, mime, size: file.size };
}

function guessMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return (
    {
      woff2: 'font/woff2',
      woff: 'font/woff',
      ttf: 'font/ttf',
      otf: 'font/otf',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      json: 'application/json',
      csv: 'text/csv',
      tsv: 'text/tab-separated-values',
      txt: 'text/plain',
      ogg: 'audio/ogg',
    }[ext] ?? 'application/octet-stream'
  );
}

/** Natural size of an image asset (for placing it at its own size). */
export function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 200, height: img.naturalHeight || 200 });
    img.onerror = () => resolve({ width: 200, height: 200 });
    img.src = url;
  });
}

export function videoSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.onloadedmetadata = () => resolve({ width: v.videoWidth || 320, height: v.videoHeight || 180 });
    v.onerror = () => resolve({ width: 320, height: 180 });
    v.src = url;
  });
}

/**
 * Point every reference to one asset id at another, anywhere in a document (asset ids are random and unique, so a
 * string equal to one is a reference to it, and so is one inside a list variable's JSON text). Used to replace an asset's file under a new id: see replaceAssetFile.
 */
export function swapAssetId<T>(doc: T, oldId: string, newId: string): T {
  // Only the matching strings are written, so an immer draft only copies the branches that really change
  const walk = (v: unknown): unknown => {
    if (v === oldId) return newId;
    //A list variable keeps its rows as JSON text, so a card's sound id sits inside a string: ids are random, so a plain swap inside text that is JSON is safe
    if (typeof v === 'string' && v.length > oldId.length && (v[0] === '[' || v[0] === '{') && v.includes(oldId)) return v.split(oldId).join(newId);
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const r = walk(o[k]);
        if (r !== o[k]) o[k] = r;
      }
    }
    return v;
  };
  return walk(doc) as T;
}
