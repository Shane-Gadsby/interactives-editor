import { createProject, type Artboard, type FontRef, type Variable } from 'interactives-player';
import { store } from '../store/store';
import { importLottie, isLottie, readLottieFile, type ImportedAsset } from './lottie-import';
import { assetBytes, createProjectRecord, putAsset, saveProject } from './db';
import { assetUrls } from './assets';
import { download, fileSafe } from './export';
import { exportLottie, toDotLottie } from './lottie-export';
import { bakedForExport } from './themes';
import { KIND_LABEL, NO_LINK_REASON, currentUser, designKind, handleOf, hashAssets, isDesignFile, newLinkId, reimportLink, rememberHandle, sourcesFor, supportsLinking, type FileHandle } from './links';
import { pickFiles } from './insert';
import { extOf, reportError, span, track } from './analytics';
import { linkChoiceDialog, type LinkChoiceRow } from '../components/dialogs';

export interface AnimationImport {
  artboard: Artboard;
  /** Every artboard (Rive files hold several); `artboard` is the one to start on. */
  artboards?: Artboard[];
  assets: ImportedAsset[];
  variables?: Variable[];
  fonts?: FontRef[];
  warnings: string[];
  source: string;
  /** The file it was read from (set by readAnimationFile), so a design file's artboards can remember it. */
  fileName?: string;
  lastModified?: number;
}

export const ANIMATION_ACCEPT = '.json,.lottie,.riv,.rev,.psd,.ai,.pdf,.dxf,.dwg,.vectorcraft,.drawcraft,.pcraft,.pptx';

/** Read a Lottie (.json/.lottie), Rive (.riv, or the editor's own .rev), Photoshop (.psd), Illustrator (.ai), PDF, AutoCAD (.dxf/.dwg), VectorCraft (.vectorcraft), PhotoCraft (.pcraft) or PowerPoint (.pptx) file into artboards. */
export async function readAnimationFile(file: File): Promise<AnimationImport> {
  const ext = extOf(file.name);
  const done = span('import', 'read', { thing: ext });
  try {
    const imp: AnimationImport = { ...(await readAnimationFileInner(file)), fileName: file.name, lastModified: file.lastModified };
    track('import', 'ok', { thing: ext, detail: { source: imp.source.toLowerCase().replace(/[^a-z0-9]+/g, '-') }, sum: { kb: Math.round(file.size / 1024), artboards: (imp.artboards ?? [imp.artboard]).length, warnings: imp.warnings.length } });
    done();
    return imp;
  } catch (err) {
    // The format and the kind of failure, not the file (no name, no contents)
    track('import', 'failed', { thing: ext });
    reportError({ kind: 'import', error: err, where: ext, detail: { format: ext, kb: Math.round(file.size / 1024) } });
    done({ detail: { failed: true } });
    throw err;
  }
}

async function readAnimationFileInner(file: File): Promise<AnimationImport> {
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
  // a DWG keeps its message whatever the file is called (renamed, saved as .dxf by mistake, or no extension)
  const dwgLike = bytes.length >= 6 && bytes[0] === 0x41 && bytes[1] === 0x43 && bytes[2] >= 0x30 && bytes[2] <= 0x39 && bytes[3] >= 0x30 && bytes[3] <= 0x39 && bytes[4] >= 0x30 && bytes[4] <= 0x39 && bytes[5] >= 0x30 && bytes[5] <= 0x39;
  if (/\.dxf$/i.test(file.name) && !dwgLike) {
    const { importDxf } = await import('./dxf-import');
    return { ...importDxf(bytes, base), source: 'AutoCAD DXF' };
  }
  if (/\.dwg$/i.test(file.name) || dwgLike) {
    const { importDwg } = await import('./dwg-import');
    return { ...importDwg(bytes, base), source: 'AutoCAD DWG' };
  }
  // VectorCraft files are JSON (or gzip) and PhotoCraft files are ZIP archives, so besides the extension look inside
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const jsonLike = bytes[0] === 0x7b || (bytes[0] === 0xef && bytes[1] === 0xbb) || bytes[0] === 0x20 || bytes[0] === 0x0a;
  if (/\.(vectorcraft|drawcraft)$/i.test(file.name) || gzip || (jsonLike && /"format"\s*:\s*"(vectorcraft|drawcraft)"/.test(new TextDecoder().decode(bytes.subarray(0, 256))))) {
    const { importVectorCraft, isVectorCraft } = await import('./vectorcraft-import');
    if (/\.(vectorcraft|drawcraft)$/i.test(file.name) || isVectorCraft(bytes)) return { ...importVectorCraft(bytes, base), source: 'VectorCraft' };
  }
  if (/\.pptx$/i.test(file.name) || zip) {
    const { importPptx, isPptx } = await import('./pptx-import');
    if (/\.pptx$/i.test(file.name) || isPptx(bytes)) return { ...importPptx(bytes, base), source: 'PowerPoint' };
  }
  if (/\.pcraft$/i.test(file.name) || zip) {
    const { importPhotoCraft, isPhotoCraft } = await import('./photocraft-import');
    if (/\.pcraft$/i.test(file.name) || isPhotoCraft(bytes)) return { ...importPhotoCraft(bytes, base), source: 'PhotoCraft' };
  }
  // A .rev has no signature to look for, so it goes by the name
  if (/\.rev$/i.test(file.name)) {
    const { importRev } = await import('./rev-import');
    return { ...(await importRev(bytes, base)), source: 'Rive editor file' };
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

/** A file kept linked: the handle to read it again, and the file as it was read. */
export interface FileLink {
  handle: FileHandle;
  file: File;
}

/**
 * Before importing dropped or picked files: for the design files among them (the ones that can be linked), ask which to
 * link and which to embed, in one dialog. Resolves with the handles of the files to link (an empty map when none), or
 * null when the person cancelled. Nothing is asked when no file is a design file.
 */
export async function chooseLinking(files: File[]): Promise<Map<File, FileHandle> | null> {
  //Linking is off: the editor is a hosted page, so it can't notice a file changing on someone's disk in any browser but
  //Chrome, and even there only while a tab holds the permission. Design files are embedded, remember where they came
  //from (Artboard.source), and get a new version with Update from file. askLinking stays for when that changes
  return LINKING_OFFERED ? askLinking(files) : new Map();
}

/** The Link / Embed dialog behind chooseLinking, when linking is offered. */
export async function askLinking(files: File[]): Promise<Map<File, FileHandle> | null> {
  const out = new Map<File, FileHandle>();
  if (!files.some(isDesignFile)) return out;
  const can = supportsLinking();
  const rows: LinkChoiceRow[] = [];
  const found: (FileHandle | null)[] = [];
  for (const f of files) {
    const h = isDesignFile(f) && can ? await handleOf(f) : null;
    found.push(h);
    rows.push({ name: f.name, embedOnly: !isDesignFile(f) ? 'Always embedded' : !can ? 'Embedded in this browser' : !h ? 'Can’t link this one: the browser gave no access to the file on disk. Use Import in the Layers panel to pick it.' : undefined });
  }
  const answers = await linkChoiceDialog({
    title: files.length > 1 ? `Import ${files.length} files` : 'Import design file',
    message: can ? 'Link keeps the file on your computer connected: when you save it in the design app, the changes come into this project and your own edits stay. Embed copies it in once.' : NO_LINK_REASON,
    rows,
  });
  if (!answers) return null;
  files.forEach((f, i) => {
    if (answers[i] === 'link' && found[i]) out.set(f, found[i]!);
  });
  return out;
}

/** Whether imports offer to link a design file instead of embedding it (see chooseLinking). */
const LINKING_OFFERED = false;

/** Read one animation or design file and add it to the open project, linked when `link` is given. Errors become a toast. */
export async function importAnimationFile(file: File, linking?: Map<File, FileHandle>): Promise<void> {
  try {
    const handle = linking?.get(file);
    await addImportedArtboard(await readAnimationFile(file), handle ? { handle, file } : undefined);
  } catch (err) {
    store().toast(`${file.name}: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}

/** Add an imported artboard to the open project, to the right of the others. */
export async function addImportedArtboard(imp: AnimationImport, link?: FileLink): Promise<void> {
  const st = store();
  const p = st.get().project;
  await uploadAssets(p.id, imp.assets);
  const right = p.artboards.reduce((m, a) => Math.max(m, a.canvasX + a.width), 0);
  let list = placeArtboards(imp.artboards ?? [imp.artboard], right + 100, 0);
  // Design files remember where they came from, linked or not, so Update from file can merge a new version in later
  const fileName = link?.file.name ?? imp.fileName;
  if (fileName && isDesignFile({ name: fileName })) {
    const linkId = newLinkId();
    const sources = sourcesFor(imp.artboards ?? [imp.artboard], hashAssets(imp), { fileName, linkId, lastModified: link?.file.lastModified ?? imp.lastModified ?? Date.now(), by: await currentUser() });
    // the handle is saved first, so the watcher finds it as soon as the artboards appear
    if (link) await rememberHandle(p.id, linkId, link.handle, designKind(fileName));
    list = list.map((a, i) => ({ ...a, source: sources[i] }));
  }
  const start = list.find((a) => a.id === imp.artboard.id) ?? list[0];
  const mark = st.historyMark();
  st.update((d) => {
    d.assets.push(...imp.assets.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength })));
    d.artboards.push(...list);
    mergeVariables(d.variables as Variable[], imp.variables ?? [], list);
    for (const f of imp.fonts ?? []) if (!d.fonts.some((x) => x.family === f.family)) d.fonts.push(f);
  });
  st.set({ activeArtboardId: start.id, artboardSelected: true, selection: [], activeTimelineId: start.timelines[0]?.id ?? null, bottomTab: 'timeline' });
  showReport(`Imported ${imp.source}: ${list.length > 1 ? `${list.length} artboards` : start.name}${link ? `, linked to ${link.file.name}` : ''}`, imp.warnings, mark);
}

/** Create a whole new project from an animation file (projects page). */
export async function projectFromAnimation(file: File, handle?: FileHandle): Promise<string> {
  const imp = await readAnimationFile(file);
  const p = createProject(imp.artboard.name);
  p.artboards = placeArtboards(imp.artboards ?? [imp.artboard], 0, 0);
  if (isDesignFile(file)) {
    const linkId = newLinkId();
    const sources = sourcesFor(imp.artboards ?? [imp.artboard], hashAssets(imp), { fileName: file.name, linkId, lastModified: file.lastModified, by: await currentUser() });
    p.artboards = p.artboards.map((a, i) => ({ ...a, source: sources[i] }));
    if (handle) await rememberHandle(p.id, linkId, handle, designKind(file.name));
  }
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

export function showReport(title: string, lines: string[], mark?: number): void {
  const st = store();
  if (mark !== undefined) {
    // an import carries an Undo button, on the message or in the report
    if (lines.length) st.setReportUndo(title, lines, mark);
    else st.toastUndo(title, mark);
  } else if (lines.length) st.set({ report: { title, lines } });
  else st.toast(title);
}

/** Export the active artboard as Lottie JSON or dotLottie. */
export async function exportActiveAsLottie(kind: 'json' | 'lottie'): Promise<void> {
  const st = store();
  // Lottie has no tokens: the colours are the theme being shown
  const p = bakedForExport(st.get().project, st.get().canvasTheme);
  const ab = p.artboards.find((a) => a.id === st.artboard()?.id);
  if (!ab) return;
  const bytes = new Map<string, Uint8Array | null>();
  for (const a of p.assets) bytes.set(a.id, await assetBytes(p.id, a));
  const { json, warnings } = exportLottie(p, ab, { timelineId: st.get().activeTimelineId ?? undefined, bytesFor: (id) => bytes.get(id) ?? null });
  const name = fileSafe(`${p.name}-${ab.name}`);
  if (kind === 'json') download(new Blob([JSON.stringify(json)], { type: 'application/json' }), `${name}.json`);
  else download(new Blob([toDotLottie(json, fileSafe(ab.name)) as BlobPart], { type: 'application/zip' }), `${name}.lottie`);
  showReport(`Exported ${ab.name} as ${kind === 'json' ? 'Lottie JSON' : 'dotLottie'}`, warnings);
}

/** The extensions a design file of a kind can be updated from (VectorCraft has two). */
const UPDATE_ACCEPT: Record<string, string> = { vectorcraft: '.vectorcraft,.drawcraft', drawcraft: '.vectorcraft,.drawcraft' };

/**
 * Update from file: pick a new version of the design file some artboards were imported from, and merge it in the same
 * way a linked file's re-import does: what changed in the file comes in, edits made here are kept, one undo step.
 */
export async function updateFromFile(linkId: string): Promise<void> {
  const st = store();
  const src = st.get().project.artboards.find((a) => a.source?.linkId === linkId)?.source;
  if (!src) return;
  const [file] = await pickFiles(UPDATE_ACCEPT[src.kind] ?? `.${src.kind}`, false);
  if (!file) return;
  const kind = designKind(file.name);
  if (kind !== src.kind && !(UPDATE_ACCEPT[src.kind] ?? '').includes(`.${kind}`)) {
    st.toast(`${file.name} isn't a ${KIND_LABEL[src.kind] ?? src.kind} file, so it can't update ${src.fileName}`, 'error');
    return;
  }
  try {
    track('feature', 'design-update', { thing: kind });
    const mark = st.historyMark();
    const r = await reimportLink(st, linkId, file);
    // A new version saved under a new name: the artboards say where they came from now
    if (file.name !== src.fileName)
      st.update((d) => {
        for (const ab of d.artboards) if (ab.source?.linkId === linkId) ab.source.fileName = file.name;
      });
    const said = `${r.changed ? r.message : `${file.name}: nothing has changed since the last update.`}${r.missing.length ? ` Not in the new file: ${r.missing.join(', ')}.` : ''}`;
    if (r.changed) st.toastUndo(said, mark);
    else st.toast(said, 'info');
  } catch (err) {
    st.toast(`${file.name}: ${err instanceof Error ? err.message : String(err)}`, 'error');
  }
}
