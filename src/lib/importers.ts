import { createProject, type Artboard } from 'interactives-player';
import { store } from '../store/store';
import { importLottie, isLottie, readLottieFile, type ImportedAsset } from './lottie-import';
import { assetBytes, createProjectRecord, putAsset, saveProject } from './db';
import { assetUrls } from './assets';
import { download, fileSafe } from './export';
import { exportLottie, toDotLottie } from './lottie-export';

export interface AnimationImport {
  artboard: Artboard;
  assets: ImportedAsset[];
  warnings: string[];
  source: string;
}

export const ANIMATION_ACCEPT = '.json,.lottie,.riv';

/** Read a Lottie (.json/.lottie) or Rive (.riv) file into an artboard. */
export async function readAnimationFile(file: File): Promise<AnimationImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base = file.name.replace(/\.[^.]+$/, '');
  if (/\.riv$/i.test(file.name) || (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x56 && bytes[3] === 0x45)) {
    const { importRive } = await import('./rive-import');
    return { ...(await importRive(bytes, base)), source: 'Rive' };
  }
  const json = await readLottieFile(bytes);
  if (!isLottie(json)) throw new Error(`${file.name} is not a Lottie animation`);
  return { ...importLottie(json, base), source: 'Lottie' };
}

async function uploadAssets(projectId: string, assets: ImportedAsset[]): Promise<void> {
  for (const a of assets) {
    const blob = new Blob([a.bytes as BlobPart], { type: a.mime });
    await putAsset(projectId, a.id, blob);
    assetUrls.register(a.id, blob);
  }
}

/** Add an imported artboard to the open project, to the right of the others. */
export async function addImportedArtboard(imp: AnimationImport): Promise<void> {
  const st = store();
  const p = st.get().project;
  await uploadAssets(p.id, imp.assets);
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  const ab = { ...imp.artboard, canvasX: right + 100, canvasY: 0 };
  st.update((d) => {
    d.assets.push(...imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength })));
    d.artboards.push(ab);
  });
  st.set({ activeArtboardId: ab.id, artboardSelected: true, selection: [], activeTimelineId: ab.timelines[0]?.id ?? null, bottomTab: 'timeline' });
  showReport(`Imported ${imp.source}: ${ab.name}`, imp.warnings);
}

/** Create a whole new project from an animation file (projects page). */
export async function projectFromAnimation(file: File): Promise<string> {
  const imp = await readAnimationFile(file);
  const p = createProject(imp.artboard.name);
  p.artboards = [{ ...imp.artboard, canvasX: 0, canvasY: 0 }];
  p.settings.startArtboardId = imp.artboard.id;
  await createProjectRecord(p);
  await uploadAssets(p.id, imp.assets);
  p.assets = imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength }));
  await saveProject(p);
  if (imp.warnings.length) sessionStorage.setItem(`ix-import-report:${p.id}`, JSON.stringify({ title: `Imported ${imp.source}: ${p.name}`, lines: imp.warnings }));
  return p.id;
}

export function showReport(title: string, lines: string[]): void {
  if (lines.length) store().set({ report: { title, lines } });
  else store().toast(title);
}

/** Export the active artboard as Lottie JSON or dotLottie. */
export async function exportActiveAsLottie(kind: 'json' | 'lottie'): Promise<void> {
  const st = store();
  const p = st.get().project;
  const ab = st.artboard();
  if (!ab) return;
  const bytes = new Map<string, Uint8Array | null>();
  for (const a of p.assets) bytes.set(a.id, await assetBytes(p.id, a));
  const { json, warnings } = exportLottie(p, ab, { timelineId: st.get().activeTimelineId ?? undefined, bytesFor: (id) => bytes.get(id) ?? null });
  const name = fileSafe(`${p.name}-${ab.name}`);
  if (kind === 'json') download(new Blob([JSON.stringify(json)], { type: 'application/json' }), `${name}.json`);
  else download(new Blob([toDotLottie(json, fileSafe(ab.name)) as BlobPart], { type: 'application/zip' }), `${name}.lottie`);
  showReport(`Exported ${ab.name} as ${kind === 'json' ? 'Lottie JSON' : 'dotLottie'}`, warnings);
}
