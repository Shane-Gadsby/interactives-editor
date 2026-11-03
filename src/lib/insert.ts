import { createNode, type Asset, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { assetKind, assetUrls, imageSize, storeFile, videoSize } from './assets';

/** Upload files as assets. Images and videos are placed on the artboard at `at` (artboard coordinates). */
export async function insertFiles(files: File[], artboardId: string | null, at: { x: number; y: number } | null): Promise<Asset[]> {
  const st = store();
  const projectId = st.get().project.id;
  const added: Asset[] = [];
  const nodes: SceneNode[] = [];
  let offset = 0;
  for (const file of files) {
    let asset: Asset;
    try {
      asset = await storeFile(projectId, file);
    } catch (err) {
      st.toast(err instanceof Error ? err.message : String(err), 'error');
      continue;
    }
    added.push(asset);
    const kind = assetKind(asset.mime, asset.name);
    const url = assetUrls.resolve(asset.id)!;
    if (!artboardId || !at) continue;
    if (kind === 'image') {
      const size = await imageSize(url);
      const scale = Math.min(1, 600 / Math.max(size.width, size.height));
      const w = Math.round(size.width * scale);
      const h = Math.round(size.height * scale);
      nodes.push(createNode('image', { name: file.name.replace(/\.[^.]+$/, ''), assetId: asset.id, x: Math.round(at.x - w / 2 + offset), y: Math.round(at.y - h / 2 + offset), width: w, height: h }));
      offset += 20;
    } else if (kind === 'video') {
      const size = await videoSize(url);
      const scale = Math.min(1, 640 / Math.max(size.width, size.height));
      const w = Math.round(size.width * scale);
      const h = Math.round(size.height * scale);
      nodes.push(createNode('video', { name: file.name.replace(/\.[^.]+$/, ''), assetId: asset.id, x: Math.round(at.x - w / 2 + offset), y: Math.round(at.y - h / 2 + offset), width: w, height: h }));
      offset += 20;
    }
  }
  if (!added.length) return added;
  st.update((d) => {
    d.assets.push(...added);
    for (const a of added) {
      if (assetKind(a.mime, a.name) === 'font') {
        const family = a.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        d.fonts.push({ family, source: 'asset', assetId: a.id });
      }
    }
  });
  if (nodes.length && artboardId) st.addNodes(nodes, { artboardId });
  const fonts = added.filter((a) => assetKind(a.mime, a.name) === 'font').length;
  if (fonts) st.toast(`Added ${fonts} font${fonts > 1 ? 's' : ''}; pick ${fonts > 1 ? 'them' : 'it'} in a text layer's font list`);
  return added;
}

/** Ask the user for files, then insert them. */
export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}
