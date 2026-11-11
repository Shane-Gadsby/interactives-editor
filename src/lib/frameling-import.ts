//Frameling animations (.flplay) coming into a project: checking the file before it is uploaded, putting it in the
//package cache so the canvas draws it at once, and making the layer that plays it
import { createNode, clipRange, loadFrameling, peekFrameling, primeFrameling, readFramelingPackage, type AnimationNode, type Asset, type FramelingManifest, type FramelingPackage } from 'interactives-player';
import { assetUrls } from './assets';
import { store } from '../store/store';

/** A file's bytes (older browsers, and the test DOM, have no File.arrayBuffer). */
function fileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(r.error ?? new Error('The file could not be read.'));
    r.readAsArrayBuffer(file);
  });
}

/** Read a dropped or picked .flplay file. Throws an error that says in plain words what is wrong with it. */
export async function readFramelingFile(file: File): Promise<FramelingPackage> {
  const bytes = new Uint8Array(await fileBytes(file));
  try {
    return readFramelingPackage(bytes);
  } catch (err) {
    throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Hand a package just read to the cache under the asset's address, so nothing has to fetch it back. */
export function primeAsset(assetId: string, pkg: FramelingPackage): void {
  const url = assetUrls.resolve(assetId);
  if (url) primeFrameling(url, pkg);
}

/** The package of an asset, if it has loaded (asking for it when it hasn't). `onLoad` runs when it lands. */
export function manifestOf(assetId: string | null | undefined, onLoad?: () => void): FramelingManifest | null {
  const url = assetId ? assetUrls.resolve(assetId) : undefined;
  if (!url) return null;
  const got = peekFrameling(url);
  if (got === undefined) {
    void loadFrameling(url).then(() => onLoad?.());
    return null;
  }
  return got?.manifest ?? null;
}

/** The size an animation layer starts at: the animation's own, made smaller to fit `max` (pixel art by a whole step, so it stays crisp). */
export function startSize(m: FramelingManifest, max = 600): { width: number; height: number } {
  let k = Math.min(1, max / Math.max(m.width, m.height));
  if (m.pixelArt && k < 1) k = 1 / Math.ceil(1 / k);
  return { width: Math.max(1, Math.round(m.width * k)), height: Math.max(1, Math.round(m.height * k)) };
}

/** A layer playing the package, centred on `at`: its first clip (or the whole thing when it has none), playing. */
export function animationLayer(assetId: string, m: FramelingManifest, at: { x: number; y: number }, name?: string): AnimationNode {
  const { width, height } = startSize(m);
  return createNode('animation', {
    name: name || m.name || 'Animation',
    assetId,
    clipName: m.clips[0]?.name ?? '',
    playing: true,
    x: Math.round(at.x - width / 2),
    y: Math.round(at.y - height / 2),
    width,
    height,
  });
}

/** How many frames the layer's clip has (0 while the package isn't here). */
export function clipLength(m: FramelingManifest | null, clipName: string): number {
  return m ? clipRange(m, clipName).length : 0;
}

// ---------------------------------------------------------------- Edit in Frameling (the round trip)

/** The name the .flplay is saved under for Frameling: the asset's, with the extension Frameling knows it by. */
export function framelingFileName(asset: Pick<Asset, 'name'>): string {
  const name = asset.name.trim() || 'animation';
  return /\.flplay$/i.test(name) ? name : `${name.replace(/\.[^.]+$/, '')}.flplay`;
}

/**
 * The bytes of the .flplay an asset holds, just as it was imported (so its editable drawing is still inside). From the
 * project's own storage where it's kept there, otherwise from its address.
 */
export async function framelingFileBytes(asset: Asset): Promise<Uint8Array | null> {
  const { assetBytes } = await import('./db');
  const kept = await assetBytes(store().get().project.id, asset).catch(() => null);
  if (kept) return kept;
  const url = assetUrls.resolve(asset.id);
  if (!url) return null;
  try {
    const res = await fetch(url);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

/**
 * Save an animation's .flplay to the computer so it can be opened in Frameling. A browser can't hand a file to another
 * app or know where it went, so the person opens the download in Frameling, saves, and brings the saved file back
 * (dropped on the layer, or Replace file...). False, after saying why, when the file couldn't be had.
 */
export async function downloadForFrameling(assetId: string): Promise<boolean> {
  const st = store();
  const asset = st.get().project.assets.find((a) => a.id === assetId);
  const bytes = asset ? await framelingFileBytes(asset) : null;
  if (!asset || !bytes) {
    st.toast("The animation's file couldn't be downloaded. Try again, or export it from Frameling again.", 'error');
    return false;
  }
  const { download } = await import('./export');
  download(new Blob([bytes as BlobPart], { type: 'application/vnd.frameling.playable+zip' }), framelingFileName(asset));
  return true;
}

/**
 * A .flplay dropped on (or picked for) an animation layer: a new version of the layer's file, swapped in everywhere it is
 * used with every layer's settings kept (see replaceAssetFile). A layer with no file yet gets this one.
 */
export async function updateAnimationFile(layer: Pick<AnimationNode, 'id' | 'assetId'>, file: File): Promise<boolean> {
  const { insertFiles, replaceAssetFile } = await import('./insert');
  if (layer.assetId && store().get().project.assets.some((a) => a.id === layer.assetId)) return replaceAssetFile(layer.assetId, file);
  const [added] = await insertFiles([file], null, null);
  if (!added) return false;
  store().setProps([layer.id], { assetId: added.id });
  store().commit();
  return true;
}
