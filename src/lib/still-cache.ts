/**
 * Stills of artboards, kept in this browser (IndexedDB) from one session to the next, so a big project opens with every artboard
 * already showing as a picture instead of an empty background that fills in as the scheduler gets to each one.
 *
 * A still is only used when the artboard it was made from is the artboard on screen: the key is a hash of everything the drawing
 * depends on (the artboard, the artboards its instances draw, variables, fonts, data sources, the asset list and this build of
 * the editor). A change anywhere else just misses, and the artboard draws the way it always did.
 */
import type { Artboard, Project } from 'interactives-player';
import { instanceTargets } from '../canvas/instances';

declare const __IX_BUILD__: string | undefined;
const BUILD = typeof __IX_BUILD__ === 'string' ? __IX_BUILD__ : 'dev';

const DB_NAME = 'interactives-stills';
const STORE = 'stills';
/** Over this a single still isn't kept (a picture with big inlined images) */
const MAX_STILL = 12 * 1024 * 1024;
/** All the stills together, oldest dropped first */
const MAX_TOTAL = 400 * 1024 * 1024;
/** Stills not touched for this long go too */
const MAX_AGE = 30 * 24 * 3600 * 1000;

interface Row {
  key: string;
  projectId: string;
  hash: string;
  svg: Blob;
  at: number;
  size: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: 'key' });
        s.createIndex('projectId', 'projectId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

const keyOf = (projectId: string, artboardId: string) => `${projectId}|${artboardId}`;

// ---------------------------------------------------------------- hashing

/** 53 bits of a string, as hex (not for security: it only has to tell two versions of an artboard apart) */
function cyrb53(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (2097151 & h2).toString(16) + (h1 >>> 0).toString(16).padStart(8, '0');
}

// immer keeps untouched objects, so a hash per object survives every edit that didn't touch it
const abHashes = new WeakMap<object, string>();
function artboardHash(ab: Artboard): string {
  let h = abHashes.get(ab);
  if (!h) abHashes.set(ab, (h = cyrb53(JSON.stringify(ab))));
  return h;
}

let ctxLast: { variables: unknown; fonts: unknown; dataSources: unknown; assets: unknown; hash: string } | null = null;
function contextHash(p: Project): string {
  if (ctxLast && ctxLast.variables === p.variables && ctxLast.fonts === p.fonts && ctxLast.dataSources === p.dataSources && ctxLast.assets === p.assets) return ctxLast.hash;
  const hash = cyrb53(JSON.stringify([BUILD, p.id, p.variables, p.fonts, p.dataSources, p.assets]));
  ctxLast = { variables: p.variables, fonts: p.fonts, dataSources: p.dataSources, assets: p.assets, hash };
  return hash;
}

/** The artboards an artboard's instances draw (directly or nested), so a still of the outer one goes stale with the inner one */
function targetsOf(ab: Artboard, project: Project, seen: Set<string>, depth: number): Artboard[] {
  const out: Artboard[] = [];
  for (const id of instanceTargets(ab)) {
    if (seen.has(id)) continue;
    seen.add(id);
    const t = project.artboards.find((a) => a.id === id);
    if (!t) continue;
    out.push(t);
    if (depth < 4) out.push(...targetsOf(t, project, seen, depth + 1));
  }
  return out;
}

/** What a still of this artboard depends on, as one short string. Same string, same picture. */
export function stillHash(project: Project, ab: Artboard, theme: string | null = null): string {
  const deps = targetsOf(ab, project, new Set([ab.id]), 0)
    .map(artboardHash)
    .join('.');
  // Theme tokens draw differently per theme: the themes and the one shown are part of what the picture depends on
  const themed = project.themes?.tokens.length ? `~${cyrb53(JSON.stringify([project.themes, theme]))}` : '';
  return `${artboardHash(ab)}${deps ? '+' + deps : ''}@${contextHash(project)}${themed}`;
}

// ---------------------------------------------------------------- reading

let primed: { projectId: string; rows: Map<string, Row>; urls: Map<string, string>; ready: Promise<void> } | null = null;

/** Reads the project's saved stills (one request, the pictures themselves are read when used). Call as early as the project id is known. */
export function primeStills(projectId: string): Promise<void> {
  if (primed?.projectId === projectId) return primed.ready;
  releaseStills();
  const entry = { projectId, rows: new Map<string, Row>(), urls: new Map<string, string>(), ready: Promise.resolve() };
  entry.ready = (async () => {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('projectId').getAll(projectId);
        req.onsuccess = () => {
          for (const r of req.result as Row[]) entry.rows.set(r.key, r);
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  })();
  primed = entry;
  void entry.ready.then(() => window.setTimeout(pruneOnce, 15000));
  return entry.ready;
}

/** The saved picture of this artboard if the hash still matches (an object URL owned by this module), else null */
export function cachedStill(projectId: string, artboardId: string, hash: string): string | null {
  if (primed?.projectId !== projectId) return null;
  const k = keyOf(projectId, artboardId);
  const row = primed.rows.get(k);
  if (!row || row.hash !== hash) return null;
  let url = primed.urls.get(k);
  if (!url) primed.urls.set(k, (url = URL.createObjectURL(row.svg)));
  return url;
}

/** Whether a saved picture exists for this artboard (without making its URL) */
export function hasCachedStill(projectId: string, artboardId: string, hash: string): boolean {
  return primed?.projectId === projectId && primed.rows.get(keyOf(projectId, artboardId))?.hash === hash;
}

/** True when a url came from here, so whoever shows it must not revoke it */
export function isCachedUrl(url: string): boolean {
  if (!primed) return false;
  for (const u of primed.urls.values()) if (u === url) return true;
  return false;
}

/** Forget the project's stills (leaving it). */
export function releaseStills(): void {
  if (!primed) return;
  for (const u of primed.urls.values()) URL.revokeObjectURL(u);
  primed = null;
}

// ---------------------------------------------------------------- writing

let writes: Promise<void> = Promise.resolve();

/** Keeps a still made in this session (a blob: url from `snapshotFromDom`) for the next one. Never throws. */
export function saveStill(projectId: string, artboardId: string, hash: string, url: string): void {
  writes = writes.then(async () => {
    try {
      const db = await openDb();
      if (!db) return;
      const svg = await (await fetch(url)).blob();
      if (!svg.size || svg.size > MAX_STILL) return;
      const row: Row = { key: keyOf(projectId, artboardId), projectId, hash, svg, at: Date.now(), size: svg.size };
      if (primed?.projectId === projectId) {
        // So the same artboard drawn again this session (a remount) finds it at once
        const old = primed.urls.get(row.key);
        if (old) {
          URL.revokeObjectURL(old);
          primed.urls.delete(row.key);
        }
        primed.rows.set(row.key, row);
      }
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(row);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      });
    } catch {
      /* private window, full disk, a blob that went away: the still just isn't kept */
    }
  });
}

/** Drops a project's saved stills (deleting it). */
export async function forgetStills(projectId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).index('projectId').openKeyCursor(IDBKeyRange.only(projectId));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        tx.objectStore(STORE).delete(c.primaryKey);
        c.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

let pruned = false;
/** Once per page load: stills nobody has needed for a month go, and the oldest past a size cap */
async function pruneOnce(): Promise<void> {
  if (pruned) return;
  pruned = true;
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as Row[]).sort((a, b) => b.at - a.at);
        let total = 0;
        const now = Date.now();
        for (const r of rows) {
          total += r.size;
          if (total > MAX_TOTAL || now - r.at > MAX_AGE) store.delete(r.key);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
