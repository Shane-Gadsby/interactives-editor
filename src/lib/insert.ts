import { extOf, reportError, track } from './analytics';
import { createNode, type Asset, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { assetKind, assetUrls, imageSize, storeFile, videoSize } from './assets';
import { importSvg } from './svg-import';
import { acceptsDesignFiles, isDesignFile, pickWithHandles } from './links';

/** Upload files as assets. Images and videos are placed on the artboard at `at` (artboard coordinates). */
export async function insertFiles(files: File[], artboardId: string | null, at: { x: number; y: number } | null): Promise<Asset[]> {
  const st = store();
  const projectId = st.get().project.id;
  const added: Asset[] = [];
  const nodes: SceneNode[] = [];
  let offset = 0;
  // Design files (Photoshop, ...) can be linked instead of embedded: ask once for everything that was dropped
  let linking: Map<File, import('./links').FileHandle> | undefined;
  if (files.some(isDesignFile)) {
    const { chooseLinking } = await import('./importers');
    const chosen = await chooseLinking(files);
    if (!chosen) return added; // cancelled
    linking = chosen;
  }
  for (const file of files) {
    // Design files become a new artboard of layers (the picture and its position don't matter)
    if (isDesignFile(file)) {
      const { importAnimationFile } = await import('./importers');
      await importAnimationFile(file, linking);
      continue;
    }
    // SVG onto an artboard: editable vector layers instead of a picture
    if (artboardId && at && (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name))) {
      try {
        const svg = importSvg(await file.text());
        if (svg.nodes.length) {
          const scale = Math.min(1, 800 / Math.max(svg.width, svg.height));
          const group = createNode('group', {
            name: file.name.replace(/\.[^.]+$/, ''),
            x: Math.round(at.x - (svg.width * scale) / 2 + offset),
            y: Math.round(at.y - (svg.height * scale) / 2 + offset),
            width: svg.width,
            height: svg.height,
            scaleX: scale,
            scaleY: scale,
            originX: 0,
            originY: 0,
            children: svg.nodes,
          });
          nodes.push(group);
          track('import', 'ok', { thing: 'svg', detail: { as: 'layers' } });
          offset += 20;
          if (svg.skipped.length) st.toast(`${file.name}: not carried over: ${svg.skipped.join(', ')}`);
          continue;
        }
      } catch (err) {
        console.warn('[interactives] SVG import failed, adding it as an image instead', err);
        reportError({ kind: 'import', error: err, where: 'svg', detail: { format: 'svg' } });
      }
    }
    let asset: Asset;
    try {
      asset = await storeFile(projectId, file);
    } catch (err) {
      st.toast(err instanceof Error ? err.message : String(err), 'error');
      track('import', 'failed', { thing: extOf(file.name) });
      reportError({ kind: 'import', error: err, where: 'asset', detail: { format: extOf(file.name), kb: Math.round(file.size / 1024) } });
      continue;
    }
    track('import', 'ok', { thing: extOf(file.name), detail: { as: 'asset' }, sum: { kb: Math.round(file.size / 1024) } });
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
  if (!added.length) {
    if (nodes.length && artboardId) st.addNodes(nodes, { artboardId });
    return added;
  }
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
export async function pickFiles(accept: string, multiple = true): Promise<File[]> {
  // The file picker (where there is one) keeps a handle to each file, which is what linking needs
  if (acceptsDesignFiles(accept)) {
    const picked = await pickWithHandles(accept, multiple);
    if (picked) return picked;
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}
