import type { Asset, DataSource } from 'interactives-player';
import { store } from '../store/store';
import { assetUrls, storeFile, swapAssetId } from './assets';
import { getAsset } from './db';
import { dataCache } from './data';
import { textOfValue } from './data-edit';

/**
 * Saving an edited data file. The bytes of an uploaded file are never changed in place (the server keeps an asset id's
 * bytes for good, and other people's tabs would keep showing their cached copy), so an edit uploads the new text as a
 * new asset and points everything that named the old one at it, in one undo step. That is the same thing Replace file
 * does for a picture. The old bytes stay on the server, so Undo brings the old text back; "Remove unused assets" in the
 * Usage tab clears the leftovers.
 */

/** The text of an uploaded file, as stored. */
export async function readAssetText(assetId: string): Promise<string> {
  const st = store();
  const projectId = st.get().project.id;
  let url = assetUrls.resolve(assetId);
  if (!url) {
    await assetUrls.ensure(projectId, [assetId]);
    url = assetUrls.resolve(assetId);
  }
  if (url) {
    const res = await fetch(url);
    if (res.ok) return res.text();
  }
  const blob = await getAsset(projectId, assetId);
  if (blob) return blob.text();
  throw new Error('The file could not be read.');
}

/** The other data sources that read the same uploaded file as this one (an edit changes them all). */
export function sharersOf(sourceId: string): DataSource[] {
  const p = store().get().project;
  const me = p.dataSources.find((d) => d.id === sourceId);
  if (!me || me.source !== 'asset' || !me.assetId) return [];
  return p.dataSources.filter((d) => d.id !== sourceId && d.source === 'asset' && d.assetId === me.assetId);
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Save new text for a source's uploaded file. Saves run one at a time, so two quick edits land in order. Resolves with the
 * new asset id (`uploaded` is called with it just before the document changes), or null when nothing was saved (the source or its file is gone, or the upload failed, which shows a message).
 */
export function saveDataText(sourceId: string, text: string, uploaded?: (assetId: string) => void): Promise<string | null> {
  const run = queue.then(() => save(sourceId, text, uploaded));
  queue = run.catch(() => null);
  return run;
}

async function save(sourceId: string, text: string, uploaded?: (assetId: string) => void): Promise<string | null> {
  const st = store();
  const p = st.get().project;
  const ds = p.dataSources.find((d) => d.id === sourceId);
  const old = ds?.assetId ? p.assets.find((a) => a.id === ds.assetId) : undefined;
  if (!ds || ds.source !== 'asset' || !old) return null;
  let asset: Asset;
  try {
    asset = await storeFile(p.id, new File([text], old.name, { type: old.mime || 'text/plain' }));
  } catch (err) {
    st.toast(err instanceof Error ? err.message : String(err), 'error');
    return null;
  }
  // Read again: someone may have changed the source while the upload was going
  const now = st.get().project.dataSources.find((d) => d.id === sourceId);
  const oldId = now?.assetId;
  if (!now || !oldId) return null;
  // Told first, so whoever is editing the text knows the change that follows is its own
  uploaded?.(asset.id);
  st.update(
    (d) => {
      swapAssetId(d, oldId, asset.id);
      const i = d.assets.findIndex((a) => a.id === asset.id);
      if (i >= 0) d.assets[i] = asset;
      else d.assets.push(asset);
    },
    { coalesce: `data-edit-${sourceId}` },
  );
  return asset.id;
}

/**
 * Turn a source that has no file of our own (a URL's) into an uploaded file holding what it loaded, so it can be edited.
 * The source keeps its name and format, so everything that uses it carries on, now reading the copy.
 */
export async function makeEditableCopy(sourceId: string): Promise<boolean> {
  const st = store();
  const p = st.get().project;
  const ds = p.dataSources.find((d) => d.id === sourceId);
  const got = dataCache.get(sourceId);
  if (!ds || ds.source !== 'url' || !got || !('value' in got)) return false;
  const ext = ds.kind === 'csv' ? 'csv' : ds.kind === 'tsv' ? 'tsv' : ds.kind === 'json' ? 'json' : 'txt';
  const mime = ds.kind === 'csv' ? 'text/csv' : ds.kind === 'tsv' ? 'text/tab-separated-values' : ds.kind === 'json' ? 'application/json' : 'text/plain';
  const taken = new Set(p.assets.map((a) => a.name));
  let name = `${ds.name}.${ext}`;
  for (let n = 2; taken.has(name); n++) name = `${ds.name}-${n}.${ext}`;
  let asset: Asset;
  try {
    asset = await storeFile(p.id, new File([textOfValue(got.value, ds.kind)], name, { type: mime }));
  } catch (err) {
    st.toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  }
  const mark = st.historyMark();
  st.update((d) => {
    d.assets.push(asset);
    const x = d.dataSources.find((s) => s.id === sourceId);
    if (x) {
      x.source = 'asset';
      x.assetId = asset.id;
      delete x.url;
      delete x.refresh;
    }
  });
  st.toastUndo(`Made ${name} from the URL. Edit it here; the URL is no longer fetched.`, mark);
  return true;
}

/** A source that shares its file with others gets a file of its own (a copy of the same text), so editing it leaves the others as they were. */
export async function giveOwnFile(sourceId: string): Promise<boolean> {
  const st = store();
  const p = st.get().project;
  const ds = p.dataSources.find((d) => d.id === sourceId);
  const old = ds?.assetId ? p.assets.find((a) => a.id === ds.assetId) : undefined;
  if (!ds || ds.source !== 'asset' || !old) return false;
  let asset: Asset;
  try {
    const text = await readAssetText(old.id);
    const dot = old.name.lastIndexOf('.');
    const taken = new Set(p.assets.map((a) => a.name));
    const base = dot > 0 ? old.name.slice(0, dot) : old.name;
    const ext = dot > 0 ? old.name.slice(dot) : '';
    let name = `${base} (${ds.name})${ext}`;
    for (let n = 2; taken.has(name); n++) name = `${base} (${ds.name} ${n})${ext}`;
    asset = await storeFile(p.id, new File([text], name, { type: old.mime || 'text/plain' }));
  } catch (err) {
    st.toast(err instanceof Error ? err.message : String(err), 'error');
    return false;
  }
  const mark = st.historyMark();
  st.update((d) => {
    d.assets.push(asset);
    const x = d.dataSources.find((s) => s.id === sourceId);
    if (x) x.assetId = asset.id;
  });
  st.toastUndo(`${ds.name} now has its own file, ${asset.name}.`, mark);
  return true;
}
