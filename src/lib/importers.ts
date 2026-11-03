import { createProject, type Artboard, type FontRef, type Variable } from 'interactives-player';
import { store } from '../store/store';
import { importLottie, isLottie, readLottieFile, type ImportedAsset } from './lottie-import';
import { assetBytes, createProjectRecord, putAsset, saveProject } from './db';
import { assetUrls } from './assets';
import { download, fileSafe } from './export';
import { exportLottie, toDotLottie } from './lottie-export';

export interface AnimationImport {
  artboard: Artboard;
  /** Every artboard (Rive files hold several); `artboard` is the one to start on. */
  artboards?: Artboard[];
  assets: ImportedAsset[];
  variables?: Variable[];
  fonts?: FontRef[];
  warnings: string[];
  source: string;
}

export const ANIMATION_ACCEPT = '.json,.lottie,.riv,.psd,.ai,.pdf';

/** Read a Lottie (.json/.lottie), Rive (.riv), Photoshop (.psd), Illustrator (.ai) or PDF file into artboards. */
export async function readAnimationFile(file: File): Promise<AnimationImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const base = file.name.replace(/\.[^.]+$/, '');
  if (/\.psd$/i.test(file.name) || (bytes[0] === 0x38 && bytes[1] === 0x42 && bytes[2] === 0x50 && bytes[3] === 0x53)) {
    const { importPsd } = await import('./psd-import');
    return { ...importPsd(bytes, base), source: 'Photoshop' };
  }
  // Illustrator files are PDFs with private data; a .ai without the PDF part gets a clear error from the importer
  const isAi = /\.ai$/i.test(file.name);
  if (isAi || /\.pdf$/i.test(file.name) || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    const { importAi } = await import('./ai-import');
    return { ...importAi(bytes, base), source: isAi ? 'Illustrator' : 'PDF' };
  }
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
  const list = placeArtboards(imp.artboards ?? [imp.artboard], right + 100, 0);
  const start = list.find((a) => a.id === imp.artboard.id) ?? list[0];
  st.update((d) => {
    d.assets.push(...imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength })));
    d.artboards.push(...list);
    mergeVariables(d.variables as Variable[], imp.variables ?? [], list);
    for (const f of imp.fonts ?? []) if (!d.fonts.some((x) => x.family === f.family)) d.fonts.push(f);
  });
  st.set({ activeArtboardId: start.id, artboardSelected: true, selection: [], activeTimelineId: start.timelines[0]?.id ?? null, bottomTab: 'timeline' });
  showReport(`Imported ${imp.source}: ${list.length > 1 ? `${list.length} artboards` : start.name}`, imp.warnings);
}

/** Create a whole new project from an animation file (projects page). */
export async function projectFromAnimation(file: File): Promise<string> {
  const imp = await readAnimationFile(file);
  const p = createProject(imp.artboard.name);
  p.artboards = placeArtboards(imp.artboards ?? [imp.artboard], 0, 0);
  p.settings.startArtboardId = imp.artboard.id;
  p.variables = imp.variables ?? [];
  p.fonts = imp.fonts ?? [];
  await createProjectRecord(p);
  await uploadAssets(p.id, imp.assets);
  p.assets = imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength }));
  await saveProject(p);
  if (imp.warnings.length) sessionStorage.setItem(`ix-import-report:${p.id}`, JSON.stringify({ title: `Imported ${imp.source}: ${p.name}`, lines: imp.warnings }));
  return p.id;
}

/** Keep the file's own canvas arrangement, shifted to start at (x, y). */
function placeArtboards(list: Artboard[], x: number, y: number): Artboard[] {
  const minX = Math.min(...list.map((a) => a.canvasX));
  const minY = Math.min(...list.map((a) => a.canvasY));
  return list.map((a) => ({ ...a, canvasX: a.canvasX - minX + x, canvasY: a.canvasY - minY + y }));
}

/** Add imported variables, renaming any that clash with existing ones (and the expressions that use them). */
function mergeVariables(into: Variable[], add: Variable[], artboards: Artboard[]): void {
  const taken = new Set(into.map((v) => v.name));
  for (const v of add) {
    let name = v.name;
    for (let i = 2; taken.has(name); i++) name = `${v.name}_${i}`;
    if (name !== v.name) {
      const re = new RegExp(`\\b${v.name}\\b`, 'g');
      for (const ab of artboards) for (const n of ab.logic.nodes) for (const [k, val] of Object.entries(n.params)) if (typeof val === 'string') n.params[k] = val.replace(re, name);
    }
    taken.add(name);
    into.push({ ...v, name });
  }
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
