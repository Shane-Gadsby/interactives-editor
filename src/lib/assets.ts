import { uid, type Asset } from 'interactives-player';
import { listAssetBlobs, putAsset } from './db';

/** Blob URLs for the open project's assets, so the canvas can show them. */
class AssetUrls {
  private urls = new Map<string, string>();
  private listeners = new Set<() => void>();
  version = 0;

  async load(projectId: string): Promise<void> {
    this.clear();
    const blobs = await listAssetBlobs(projectId);
    for (const [id, blob] of blobs) this.urls.set(id, URL.createObjectURL(blob));
    this.bump();
  }

  register(id: string, blob: Blob): void {
    const old = this.urls.get(id);
    if (old) URL.revokeObjectURL(old);
    this.urls.set(id, URL.createObjectURL(blob));
    this.bump();
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
