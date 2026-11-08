import { extOf, reportError, track } from './analytics';
import { createNode, type Asset, type SceneNode } from 'interactives-player';
import { store } from '../store/store';
import { assetKind, assetUrls, imageSize, storeFile, swapAssetId, videoSize } from './assets';
import { refreshAudioDuration, type ReplacedAudioFit } from './captions-edit';
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

/** The file picker filter for replacing an asset of a kind: the same kind of file. */
export function acceptFor(mime: string, name: string): string {
  switch (assetKind(mime, name)) {
    case 'image':
      return 'image/*';
    case 'video':
      return 'video/*';
    case 'audio':
      return 'audio/*';
    case 'font':
      return '.woff,.woff2,.ttf,.otf';
    case 'data':
      return '.json,.csv,.tsv,.txt';
    default:
      return '';
  }
}

/**
 * Replace an asset's file with another of the same kind (a new version of a picture, sound or font). The new file is
 * uploaded under a new asset id and every reference to the old id is pointed at it, in one undo step, so it reaches
 * everyone in a live session like any new upload does (keeping the id would leave other tabs on their cached copy of
 * the old bytes). The record keeps its place in the list. The old bytes stay on the server, so an undo brings them back;
 * the Usage tab's "Remove unused assets" clears them for good. A sound on a timeline gets the new file's length, and when that
 * leaves the timeline too short or no longer the length of its sound, it is offered to fit the timeline to it.
 */
export async function replaceAssetFile(oldId: string, file: File): Promise<boolean> {
  const st = store();
  const p = st.get().project;
  const old = p.assets.find((a) => a.id === oldId);
  if (!old) return false;
  const was = assetKind(old.mime, old.name);
  const now = assetKind(file.type, file.name);
  if (was !== now && was !== 'other') {
    st.toast(`${file.name} isn't ${was === 'audio' ? 'a sound' : `a ${was} file`}, so it can't replace ${old.name}`, 'error');
    return false;
  }
  let asset: Asset;
  try {
    asset = await storeFile(p.id, file);
  } catch (err) {
    st.toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  }
  track('feature', 'asset-replace', { thing: extOf(file.name) });
  // How long the new sound is, if a timeline plays the old one
  const onTimeline = p.artboards.some((ab) => ab.timelines.some((tl) => tl.audio?.some((t) => t.assetId === oldId)));
  const ms = onTimeline && (now === 'audio' || now === 'video') ? await (await import('./waveform')).fileDuration(file) : 0;
  let fits: ReplacedAudioFit[] = [];
  const mark = st.historyMark();
  st.update((d) => {
    swapAssetId(d, oldId, asset.id);
    const i = d.assets.findIndex((a) => a.id === asset.id);
    if (i >= 0) d.assets[i] = asset;
    else d.assets.push(asset);
    fits = refreshAudioDuration(d, asset.id, ms);
  });
  st.toastUndo(old.name === file.name ? `Updated ${file.name}` : `Replaced ${old.name} with ${file.name}`, mark);
  if (fits.length) await offerFit(fits, ms);
  return true;
}

/** Ask whether to set the timelines to the length of the sound that replaced theirs (one undo step for all). */
async function offerFit(fits: ReplacedAudioFit[], ms: number): Promise<void> {
  const secs = (v: number) => `${Math.round(v / 100) / 10} s`;
  const names = fits.map((f) => `“${f.timeline}” (${secs(f.was)} to ${secs(f.to)})`).join(', ');
  const { confirmDialog } = await import('../components/dialogs');
  const yes = await confirmDialog({
    title: 'Fit the timeline to the new sound?',
    message: fits.length === 1 ? `The new sound is ${secs(ms)} long. Set the timeline ${names} to match, so nothing is cut off or left silent?` : `The new sound is ${secs(ms)} long. Set these timelines to match: ${names}?`,
    confirmLabel: fits.length === 1 ? 'Fit the timeline' : 'Fit the timelines',
  });
  if (!yes) return;
  const st = store();
  st.update((d) => {
    for (const ab of d.artboards) for (const tl of ab.timelines) {
      const f = fits.find((x) => x.timelineId === tl.id);
      if (f) tl.duration = f.to;
    }
  });
}
