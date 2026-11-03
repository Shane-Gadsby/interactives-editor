/**
 * Linked design files: keep the file's handle, watch it for changes and re-import it into the artboards it came from.
 *
 * Browsers only let a page read a file again later through the File System Access API (Chromium): a dropped file
 * gives a handle with `DataTransferItem.getAsFileSystemHandle()` (which has to be asked for synchronously, inside the
 * drop event) and the Import button uses `showOpenFilePicker()`. The handle is saved in IndexedDB per project and link
 * id, and every new session needs `requestPermission()` from a click, which the banner asks for. Where the API is
 * missing, files can only be embedded.
 *
 * What goes in the document (shared with everyone) is `Artboard.source`; what stays in this browser is the handle and
 * whether to watch. The merge itself is the pure `link-reconcile.ts`.
 */
import { useSyncExternalStore } from 'react';
import { uid, type Artboard, type ArtboardSource, type Asset, type Project } from 'interactives-player';
import type { EditorStore } from '../store/store';
import { putAsset, session } from './db';
import { assetUrls } from './assets';
import { describeStats, hashBytes, newSource, reconcileArtboard, type ReconcileResult, type ReconcileStats } from './link-reconcile';
import type { AnimationImport } from './importers';

// ---------------------------------------------------------------- what can be linked

/** Design files that can be linked: anything `readAnimationFile` turns into artboards from a file on disk. */
export const DESIGN_EXTENSIONS = ['psd', 'ai', 'pdf', 'dxf', 'dwg', 'vectorcraft', 'drawcraft', 'pcraft'];
const DESIGN_RE = new RegExp(`\\.(${DESIGN_EXTENSIONS.join('|')})$`, 'i');
export const isDesignFile = (f: { name: string }): boolean => DESIGN_RE.test(f.name);
export const designKind = (name: string): string => name.match(DESIGN_RE)?.[1]?.toLowerCase() ?? 'file';
/** The importer's name for a file kind (for "Linked to ..."). */
export const KIND_LABEL: Record<string, string> = { psd: 'Photoshop', ai: 'Illustrator', pdf: 'PDF', dxf: 'AutoCAD DXF', dwg: 'AutoCAD DWG', vectorcraft: 'VectorCraft', drawcraft: 'VectorCraft', pcraft: 'PhotoCraft' };

// ---------------------------------------------------------------- File System Access API (typed loosely)

export interface FileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  queryPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

interface PickerWindow {
  showOpenFilePicker?: (o?: { multiple?: boolean; types?: { description?: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle[]>;
}

/** Can this browser keep a handle to a file? (Chromium: yes; Firefox and Safari: no.) */
export function supportsLinking(): boolean {
  return typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function';
}
export const NO_LINK_REASON = 'This browser can’t keep a link to a file on your computer (it needs the File System Access API, in Chrome or Edge), so files are embedded.';

/** Handles for the files we know about, by File object. A promise, because a dropped handle arrives asynchronously. */
const handles = new WeakMap<File, Promise<FileHandle | null>>();

/** The handle a file was picked or dropped with, if it had one. */
export function handleOf(file: File): Promise<FileHandle | null> {
  return handles.get(file) ?? Promise.resolve(null);
}

/**
 * The files of a drop. Call this synchronously inside the drop handler: the handles can't be asked for after an await.
 */
export function captureDrop(dt: DataTransfer): File[] {
  const files: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (!f) continue;
    files.push(f);
    const ask = (item as unknown as { getAsFileSystemHandle?: () => Promise<{ kind: string } | null> }).getAsFileSystemHandle;
    if (ask) handles.set(f, ask.call(item).then((h) => (h && h.kind === 'file' ? (h as FileHandle) : null)).catch(() => null));
  }
  return files.length ? files : Array.from(dt.files ?? []);
}

/** The picker's `types` for an `accept` string like `image/*,.psd`. */
function pickerTypes(accept: string): { description: string; accept: Record<string, string[]> }[] {
  const wild: Record<string, string[]> = {
    'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp'],
    'video/*': ['.mp4', '.webm', '.mov', '.m4v'],
    'audio/*': ['.mp3', '.wav', '.ogg', '.m4a'],
  };
  const map: Record<string, string[]> = {};
  const exts: string[] = [];
  for (const t of accept.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (t.startsWith('.')) exts.push(t);
    else if (wild[t]) map[t] = wild[t];
  }
  if (exts.length) map['application/octet-stream'] = exts;
  return Object.keys(map).length ? [{ description: 'Supported files', accept: map }] : [];
}

/** Does this `accept` string include a linkable file type? */
export const acceptsDesignFiles = (accept: string): boolean => accept.split(',').some((t) => DESIGN_EXTENSIONS.some((e) => t.trim().toLowerCase() === `.${e}`));

/** Ask for files with the file picker so their handles can be kept. Null when the picker isn't available (use an input). */
export async function pickWithHandles(accept: string, multiple: boolean): Promise<File[] | null> {
  const w = window as PickerWindow;
  if (!w.showOpenFilePicker) return null;
  let picked: FileHandle[];
  try {
    const types = pickerTypes(accept);
    picked = await w.showOpenFilePicker({ multiple, ...(types.length ? { types } : {}) });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return [];
    return null;
  }
  const files: File[] = [];
  for (const h of picked) {
    const f = await h.getFile();
    handles.set(f, Promise.resolve(h));
    files.push(f);
  }
  return files;
}

// ---------------------------------------------------------------- handles in IndexedDB

interface LinkRecord {
  key: string;
  projectId: string;
  linkId: string;
  handle: FileHandle;
  fileName: string;
  kind: string;
  watch: boolean;
}

const DB_NAME = 'interactives-links';
const STORE = 'handles';
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const keyOf = (projectId: string, linkId: string) => `${projectId}:${linkId}`;
export const saveLinkRecord = (r: Omit<LinkRecord, 'key'>): Promise<IDBValidKey> => tx('readwrite', (s) => s.put({ ...r, key: keyOf(r.projectId, r.linkId) }));
export const loadLinkRecord = (projectId: string, linkId: string): Promise<LinkRecord | undefined> => tx('readonly', (s) => s.get(keyOf(projectId, linkId)) as IDBRequest<LinkRecord | undefined>);
export const deleteLinkRecord = (projectId: string, linkId: string): Promise<undefined> => tx('readwrite', (s) => s.delete(keyOf(projectId, linkId)) as IDBRequest<undefined>);

// ---------------------------------------------------------------- the document side

/** Artboards of a project that are linked, grouped by link id. */
export function linksOf(p: Project): Map<string, { fileName: string; kind: string; by?: string; lastModified: number; importedAt: string; artboards: Artboard[] }> {
  const out = new Map<string, { fileName: string; kind: string; by?: string; lastModified: number; importedAt: string; artboards: Artboard[] }>();
  for (const ab of p.artboards) {
    const s = ab.source;
    if (!s?.linkId) continue;
    const e = out.get(s.linkId);
    if (e) e.artboards.push(ab);
    else out.set(s.linkId, { fileName: s.fileName, kind: s.kind, by: s.by, lastModified: s.lastModified, importedAt: s.importedAt, artboards: [ab] });
  }
  return out;
}

export function hashAssets(imp: Pick<AnimationImport, 'assets'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const a of imp.assets) out[a.id] = hashBytes(a.bytes);
  return out;
}

/** Which of the file's artboards an artboard in the project came from: by name first, then by position. */
function partFor(parts: Artboard[], s: ArtboardSource): Artboard | undefined {
  return parts.find((p) => s.part !== undefined && p.name === s.part) ?? parts[s.partIndex ?? 0];
}

/** `source` for each artboard of a fresh import of a linked file, in the order of `parts`. */
export function sourcesFor(parts: Artboard[], hashes: Record<string, string>, info: { fileName: string; linkId: string; lastModified: number; by?: string }): ArtboardSource[] {
  return parts.map((ab, i) => newSource(ab, hashes, { kind: designKind(info.fileName), fileName: info.fileName, linkId: info.linkId, lastModified: info.lastModified, importedAt: new Date().toISOString(), part: ab.name, partIndex: i, by: info.by }));
}

export const newLinkId = (): string => uid('lk');

export async function currentUser(): Promise<string | undefined> {
  try {
    return (await session()).user?.username ?? undefined;
  } catch {
    return undefined;
  }
}

/** Remember a file handle for a project's link, and start watching it by default. */
export async function rememberHandle(projectId: string, linkId: string, handle: FileHandle, kind: string): Promise<void> {
  await saveLinkRecord({ projectId, linkId, handle, fileName: handle.name, kind, watch: true });
}

// ---------------------------------------------------------------- re-importing

/** Turns a file into artboards (the importer; a test passes its own). */
export type Reader = (file: File) => Promise<AnimationImport>;
const defaultReader: Reader = async (file) => (await import('./importers')).readAnimationFile(file);

export interface ReimportSummary {
  stats: ReconcileStats;
  changed: boolean;
  message: string;
  /** Artboards of the link that the file no longer has. */
  missing: string[];
}

const sum = (a: ReconcileStats, b: ReconcileStats): ReconcileStats => ({
  changed: a.changed + b.changed,
  added: a.added + b.added,
  removed: a.removed + b.removed,
  kept: a.kept + b.kept,
  renamed: a.renamed + b.renamed,
  protectedEdits: a.protectedEdits + b.protectedEdits,
  artboardChanged: a.artboardChanged || b.artboardChanged,
});
const zero = (): ReconcileStats => ({ changed: 0, added: 0, removed: 0, kept: 0, renamed: 0, protectedEdits: 0, artboardChanged: false });

/**
 * Read the file again and merge it into the artboards linked to it, as one undo step (or none when nothing changed).
 * Changed pictures are uploaded first; pictures nothing uses any more are deleted afterwards.
 */
export async function reimportLink(st: EditorStore, linkId: string, file: File, read: Reader = defaultReader): Promise<ReimportSummary> {
  const imp = await read(file);
  const parts = imp.artboards ?? [imp.artboard];
  const hashes = hashAssets(imp);
  const byId = new Map(imp.assets.map((a) => [a.id, a]));
  const projectId = st.get().project.id;

  const plan = () => {
    const results: { abId: string; result: ReconcileResult }[] = [];
    const missing: string[] = [];
    for (const ab of st.get().project.artboards) {
      if (ab.source?.linkId !== linkId) continue;
      const part = partFor(parts, ab.source);
      if (!part) missing.push(ab.name);
      else results.push({ abId: ab.id, result: reconcileArtboard(ab, part, hashes) });
    }
    return { results, missing };
  };

  // upload the pictures the merge will use; the document may change meanwhile, so merge again and top up
  const uploaded = new Set<string>();
  let current = plan();
  for (let round = 0; round < 3; round++) {
    const need = [...new Set(current.results.flatMap((r) => r.result.usedAssetIds))].filter((id) => !uploaded.has(id));
    if (!need.length) break;
    for (const id of need) {
      const a = byId.get(id);
      if (!a) continue;
      const blob = new Blob([a.bytes as BlobPart], { type: a.mime });
      await putAsset(projectId, a.id, blob);
      assetUrls.register(a.id, blob);
      uploaded.add(id);
    }
    current = plan();
  }

  const { results, missing } = current;
  let stats = zero();
  for (const r of results) stats = sum(stats, r.result.stats);
  const changed = results.some((r) => r.result.changed);
  const now = new Date().toISOString();
  const used = [...new Set(results.flatMap((r) => r.result.usedAssetIds))];

  const apply = (d: Project) => {
    for (const { abId, result } of results) {
      const i = d.artboards.findIndex((a) => a.id === abId);
      if (i < 0) continue;
      const src = result.artboard.source!;
      d.artboards[i] = { ...result.artboard, source: { ...src, lastModified: file.lastModified, importedAt: now } } as Artboard;
    }
    for (const id of used) {
      const a = byId.get(id);
      if (a && !d.assets.some((x) => x.id === id)) d.assets.push({ id: a.id, name: a.name, mime: a.mime, size: a.bytes.byteLength } as Asset);
    }
    for (const f of imp.fonts ?? []) if (!d.fonts.some((x) => x.family === f.family)) d.fonts.push(f);
    // Pictures nothing refers to any more (result.releasedAssetIds) stay in the project and on the server on purpose:
    // the re-import is one undo step, and undoing it brings back layers that point at them. They show as unused in the
    // Usage tab, whose "Remove unused assets" deletes them for good.
  };
  if (changed) st.update((d) => apply(d as Project));
  else st.patchSilently((d) => apply(d as Project));
  const name = results[0]?.result.artboard.source?.fileName ?? file.name;
  return { stats, changed, message: describeStats(name, stats), missing };
}

// ---------------------------------------------------------------- the manager (one per open project)

export type LinkState = 'checking' | 'connected' | 'needs-permission' | 'no-handle' | 'missing';

export interface LinkStatus {
  linkId: string;
  fileName: string;
  kind: string;
  state: LinkState;
  watch: boolean;
  busy: boolean;
  error?: string;
  by?: string;
  /** When the file was last imported (ISO). */
  importedAt: string;
  /**
   * The file was saved since it was last brought in, and is waiting for someone to say whether to re-import it.
   * `dismissed` once they said "not now" (the dialog leaves it alone until the file changes again).
   */
  changed?: { stamp: string; lastModified: number; dismissed: boolean };
}

/** How often watched files are looked at (only their time and size, the file isn't read until someone asks for it). */
const POLL_MS = 5000;

export class LinkManager {
  private records = new Map<string, LinkRecord>();
  private status = new Map<string, LinkStatus>();
  private loading = new Set<string>();
  private pending = new Map<string, string>();
  private failed = new Map<string, string>();
  private snapshot: LinkStatus[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastArtboards: unknown = null;
  private off: (() => void) | null = null;
  private onFocus = () => void this.tick();

  constructor(
    private readonly st: EditorStore,
    private readonly read: Reader = defaultReader,
  ) {}

  start(): void {
    this.sync();
    this.off = this.st.subscribe(() => this.sync());
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onFocus);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.off?.();
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onFocus);
  }

  getSnapshot = (): LinkStatus[] => this.snapshot;

  private publish(): void {
    this.snapshot = [...this.status.values()];
    emitLinks();
  }

  private patch(linkId: string, p: Partial<LinkStatus>): void {
    const s = this.status.get(linkId);
    if (!s) return;
    this.status.set(linkId, { ...s, ...p });
    this.publish();
  }

  /** Follow the document: links appear and disappear with the artboards that carry them. */
  private sync(): void {
    const project = this.st.get().project;
    const links = linksOf(project);
    const sig = project.artboards;
    if (sig === this.lastArtboards && [...links.keys()].every((k) => this.status.has(k))) return;
    this.lastArtboards = sig;
    let changed = false;
    for (const [linkId, l] of links) {
      const old = this.status.get(linkId);
      if (!old) {
        this.status.set(linkId, { linkId, fileName: l.fileName, kind: l.kind, state: 'checking', watch: true, busy: false, by: l.by, importedAt: l.importedAt });
        changed = true;
        void this.load(linkId);
      } else if (old.fileName !== l.fileName || old.importedAt !== l.importedAt || old.by !== l.by) {
        this.status.set(linkId, { ...old, fileName: l.fileName, importedAt: l.importedAt, by: l.by });
        changed = true;
      }
    }
    for (const id of [...this.status.keys()])
      if (!links.has(id)) {
        this.status.delete(id);
        this.records.delete(id);
        changed = true;
      }
    if (changed) this.publish();
  }

  private async load(linkId: string): Promise<void> {
    if (this.loading.has(linkId)) return;
    this.loading.add(linkId);
    try {
      const rec = await loadLinkRecord(this.st.get().project.id, linkId);
      if (!rec) {
        this.patch(linkId, { state: 'no-handle' });
        return;
      }
      this.records.set(linkId, rec);
      this.patch(linkId, { watch: rec.watch, state: await this.permission(rec.handle) });
    } catch {
      this.patch(linkId, { state: 'no-handle' });
    } finally {
      this.loading.delete(linkId);
    }
  }

  private async permission(h: FileHandle): Promise<LinkState> {
    try {
      const p = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
      return p === 'granted' ? 'connected' : 'needs-permission';
    } catch {
      return 'needs-permission';
    }
  }

  /** From a click: ask for read permission on every handle that needs it. */
  async reconnect(): Promise<void> {
    const todo = [...this.status.values()].filter((s) => s.state === 'needs-permission');
    await Promise.all(
      todo.map(async (s) => {
        const h = this.records.get(s.linkId)?.handle;
        if (!h?.requestPermission) return;
        try {
          const p = await h.requestPermission({ mode: 'read' });
          this.patch(s.linkId, { state: p === 'granted' ? 'connected' : 'needs-permission' });
        } catch {
          /* dismissed */
        }
      }),
    );
    void this.tick();
  }

  async setWatch(linkId: string, watch: boolean): Promise<void> {
    const rec = this.records.get(linkId);
    if (rec) {
      rec.watch = watch;
      try {
        await saveLinkRecord({ projectId: rec.projectId, linkId, handle: rec.handle, fileName: rec.fileName, kind: rec.kind, watch });
      } catch {
        /* keep it for this session */
      }
    }
    this.patch(linkId, { watch });
  }

  /** Stop linking: the artboards keep everything and are just embedded from now on. One undo step. */
  async unlink(linkId: string): Promise<void> {
    this.st.update((d) => {
      for (const ab of d.artboards) if (ab.source?.linkId === linkId) delete ab.source;
    });
    try {
      await deleteLinkRecord(this.st.get().project.id, linkId);
    } catch {
      /* nothing saved */
    }
    this.records.delete(linkId);
    this.sync();
  }

  private linkedTime(linkId: string): number | undefined {
    return linksOf(this.st.get().project).get(linkId)?.lastModified;
  }

  /** Check every watched file once. */
  async tick(): Promise<void> {
    if (typeof document !== 'undefined' && document.hidden) return;
    for (const s of [...this.status.values()]) {
      if (s.state === 'missing' || s.state === 'connected') if (s.watch && !s.busy) await this.check(s.linkId, false);
    }
  }

  private async fileOf(linkId: string): Promise<File | null> {
    const h = this.records.get(linkId)?.handle;
    if (!h) return null;
    try {
      const f = await h.getFile();
      if (this.status.get(linkId)?.state === 'missing') this.patch(linkId, { state: 'connected', error: undefined });
      return f;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'NotFoundError') this.patch(linkId, { state: 'missing', error: 'The file was moved, renamed or deleted.' });
      else this.patch(linkId, { state: 'needs-permission' });
      return null;
    }
  }

  /** Re-import when the file's time has moved on and settled (two looks in a row: a big save may still be going). */
  private async check(linkId: string, now: boolean): Promise<void> {
    const file = await this.fileOf(linkId);
    if (!file) return;
    const known = this.linkedTime(linkId);
    if (known === undefined || file.lastModified === known) {
      this.pending.delete(linkId);
      // brought in meanwhile (here, or by someone else with the file), so there's nothing to ask about any more
      if (this.status.get(linkId)?.changed) this.patch(linkId, { changed: undefined });
      return;
    }
    const stamp = `${file.lastModified}:${file.size}`;
    if (this.failed.get(linkId) === stamp) return;
    if (!now && this.pending.get(linkId) !== stamp) {
      this.pending.set(linkId, stamp);
      return;
    }
    this.pending.delete(linkId);
    if (now) return this.run(linkId, file, stamp, false);
    // Settled: say so and let the person pick what to bring in (the changes dialog), rather than importing over their work
    if (this.status.get(linkId)?.changed?.stamp === stamp) return;
    this.patch(linkId, { changed: { stamp, lastModified: file.lastModified, dismissed: false } });
  }

  /** From the changes dialog: re-import these files now. */
  async applyChanges(linkIds: string[]): Promise<void> {
    for (const linkId of linkIds) {
      const file = await this.fileOf(linkId);
      if (!file) continue;
      await this.run(linkId, file, `${file.lastModified}:${file.size}`, false);
    }
  }

  /** From the changes dialog: leave these as they are until their files change again. Re-import now still brings them in. */
  dismissChanges(linkIds: string[]): void {
    for (const linkId of linkIds) {
      const c = this.status.get(linkId)?.changed;
      if (c && !c.dismissed) this.patch(linkId, { changed: { ...c, dismissed: true } });
    }
  }

  private async run(linkId: string, file: File, stamp: string, quiet: boolean): Promise<void> {
    this.patch(linkId, { busy: true, error: undefined });
    try {
      const r = await reimportLink(this.st, linkId, file, this.read);
      this.failed.delete(linkId);
      this.patch(linkId, { changed: undefined });
      if (r.changed || !quiet) this.st.toast(r.message + (r.missing.length ? `. Not in the file any more: ${r.missing.join(', ')}` : ''));
    } catch (err) {
      this.failed.set(linkId, stamp);
      const msg = err instanceof Error ? err.message : String(err);
      this.patch(linkId, { error: msg });
      this.st.toast(`${file.name}: ${msg}`, 'error');
    } finally {
      this.patch(linkId, { busy: false });
    }
  }

  /** "Re-import now": from a click. Asks for permission if it's needed, then reads the file whether or not it changed. */
  async reimportNow(linkId: string): Promise<void> {
    const rec = this.records.get(linkId);
    if (!rec) return;
    if (this.status.get(linkId)?.state === 'needs-permission') {
      try {
        const p = await rec.handle.requestPermission?.({ mode: 'read' });
        if (p !== 'granted') return;
        this.patch(linkId, { state: 'connected' });
      } catch {
        return;
      }
    }
    const file = await this.fileOf(linkId);
    if (!file) return;
    await this.run(linkId, file, `${file.lastModified}:${file.size}`, false);
  }
}

let manager: LinkManager | null = null;
const EMPTY: LinkStatus[] = [];
const linkListeners = new Set<() => void>();
const emitLinks = () => linkListeners.forEach((l) => l());
export function setLinkManager(m: LinkManager | null): void {
  manager = m;
  emitLinks();
}
export const linkManager = (): LinkManager | null => manager;

/** Re-render when the open project's links change (an empty list when there is no manager). */
export function useLinks(): LinkStatus[] {
  return useSyncExternalStore(
    (fn) => {
      linkListeners.add(fn);
      return () => void linkListeners.delete(fn);
    },
    () => manager?.getSnapshot() ?? EMPTY,
    () => EMPTY,
  );
}
